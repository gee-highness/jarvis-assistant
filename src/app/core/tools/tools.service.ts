import { Injectable, inject } from '@angular/core';
import { CapacitorHttp } from '@capacitor/core';
import { FocusService } from '../focus.service';
import { McpService } from '../mcp.service';
import { MemoryService } from '../memory.service';
import { MemoryKind, Task } from '../models';
import { JarvisDevice, isNative } from '../native';
import { NotifyService } from '../notify.service';
import { OllamaTool } from '../ollama.service';
import { PlannerService } from '../planner.service';
import { StoreService } from '../store.service';
import { addDays, hm, prettyDate, ymd } from '../util';
import { calculate, convertUnits, describeWhen, htmlToText, parseDue, parseWhen } from './helpers';

export type ToolGroup = 'core' | 'tasks' | 'focus' | 'habits' | 'planning' | 'notes' | 'memory' | 'reminders' | 'phone' | 'comms' | 'calendar' | 'utility' | 'web';

export interface ToolContext { confirm: (question: string) => Promise<boolean>; }

interface ToolDef {
  name: string;
  group: ToolGroup;
  description: string;
  params: Record<string, { type: string; description: string; enum?: string[]; items?: { type: string } }>;
  required?: string[];
  risky?: boolean;
  run: (a: Record<string, any>, ctx: ToolContext) => Promise<string>;
}

/** Keyword triggers that add a tool group to the turn (keeps small models focused). */
const TRIGGERS: Record<Exclude<ToolGroup, 'core'>, RegExp> = {
  tasks: /task|todo|to-do|to do|mit|priorit|overdue|deadline|due|finish|done|complete|project|inbox|matrix|urgent|important|backlog|delete|remove|rename|move/i,
  focus: /focus|pomodoro|deep work|session|concentrat|timer.*(work|focus)|break/i,
  habits: /habit|streak|routine|daily|every day|gym|workout|meditat|read(ing)?|journal(ing)?|water/i,
  planning: /plan|schedule|block|calendar|agenda|day look|my day|today|tomorrow|week|review|time/i,
  notes: /note|journal|write down|jot|idea|log|diary/i,
  memory: /remember|forget|recall|know about me|memor|who is|what do you know|my (wife|husband|sister|brother|mom|mother|dad|father|friend|boss|partner|son|daughter)/i,
  reminders: /remind|reminder|notify|ping me|alert me|don't let me forget/i,
  phone: /alarm|timer|wake me|open|launch|app|flash ?light|torch|battery|device|phone|settings|wifi|bluetooth|brightness/i,
  comms: /sms|text |message|call |dial|phone number|email|mail|share|send/i,
  calendar: /calendar|meeting|event|appointment/i,
  utility: /calculat|math|\d\s*[-+*\/x^%]\s*\d|convert|how many|percent|time is it|what time|date|days (until|between)|clipboard|copy|paste/i,
  web: /search|google|look up|lookup|web|internet|online|news|website|url|http|weather|price of|latest/i,
};

@Injectable({ providedIn: 'root' })
export class ToolsService {
  private store = inject(StoreService);
  private memory = inject(MemoryService);
  private focus = inject(FocusService);
  private notify = inject(NotifyService);
  private planner = inject(PlannerService);
  private mcp = inject(McpService);

  private findTaskOrThrow(ref: string): Task {
    const t = this.store.findTask(String(ref ?? ''));
    if (!t) throw new Error(`No task matching "${ref}". Use list_tasks to see tasks.`);
    return t;
  }

  private fmtTask = (t: Task) =>
    `• ${t.title}${t.isMit ? ' ★MIT' : ''}${t.due ? ` (due ${t.due})` : ''}${t.estimateMin ? ` ~${t.estimateMin}m` : ''}${t.urgent ? ' [urgent]' : ''}${t.important ? ' [important]' : ''}${t.status === 'done' ? ' ✓' : ''} [id ${t.id.slice(0, 8)}]`;

  readonly defs: ToolDef[] = [
    // ---------------- tasks ----------------
    {
      name: 'add_task', group: 'core',
      description: 'Create a task. Use for anything the user needs or wants to do.',
      params: {
        title: { type: 'string', description: 'Concise, actionable task title starting with a verb' },
        due: { type: 'string', description: 'Due date: YYYY-MM-DD or phrase like "tomorrow", "friday"' },
        urgent: { type: 'boolean', description: 'Time-sensitive' },
        important: { type: 'boolean', description: 'Contributes to the user\'s goals' },
        estimate_min: { type: 'number', description: 'Estimated minutes' },
        project: { type: 'string', description: 'Project or area name' },
        mit: { type: 'boolean', description: 'Make it one of today\'s 3 Most Important Tasks' },
        notes: { type: 'string', description: 'Extra details' },
      },
      required: ['title'],
      run: async a => {
        if (a['mit'] && this.store.mits().length >= 3) a['mit'] = false;
        const t = await this.store.addTask({
          title: String(a['title']), due: parseDue(a['due']), urgent: !!a['urgent'], important: a['important'] !== false,
          estimateMin: a['estimate_min'] ? Number(a['estimate_min']) : undefined, project: a['project'], isMit: !!a['mit'], notes: a['notes'],
        });
        return `Added: ${this.fmtTask(t)}`;
      },
    },
    {
      name: 'list_tasks', group: 'core',
      description: 'List tasks. filter: today (MITs + due + overdue), overdue, all, mits, inbox, done_today, project.',
      params: {
        filter: { type: 'string', description: 'Which tasks', enum: ['today', 'overdue', 'all', 'mits', 'inbox', 'done_today', 'project'] },
        project: { type: 'string', description: 'Project name when filter=project' },
      },
      run: async a => {
        const f = a['filter'] ?? 'today';
        const s = this.store;
        let list: Task[] =
          f === 'overdue' ? s.overdue() : f === 'all' ? s.openTasks() : f === 'mits' ? s.mits() : f === 'inbox' ? s.inbox()
          : f === 'done_today' ? s.doneToday()
          : f === 'project' ? s.openTasks().filter(t => (t.project ?? '').toLowerCase().includes(String(a['project'] ?? '').toLowerCase()))
          : [...new Set([...s.mits(), ...s.overdue(), ...s.dueToday()])];
        if (!list.length && f === 'today') list = s.openTasks().slice(0, 10);
        return list.length ? `${list.length} task(s):\n${list.slice(0, 30).map(this.fmtTask).join('\n')}` : 'No tasks found.';
      },
    },
    {
      name: 'complete_task', group: 'core',
      description: 'Mark a task done (by id or part of its title).',
      params: { task: { type: 'string', description: 'Task id or title words' } },
      required: ['task'],
      run: async a => { const t = this.findTaskOrThrow(a['task']); await this.store.completeTask(t.id); return `Completed "${t.title}". Done today: ${this.store.doneToday().length}.`; },
    },
    {
      name: 'update_task', group: 'tasks',
      description: 'Change a task: rename, reschedule, re-prioritise, estimate, project, notes, MIT flag.',
      params: {
        task: { type: 'string', description: 'Task id or title words' },
        title: { type: 'string', description: 'New title' },
        due: { type: 'string', description: 'New due date or "none"' },
        urgent: { type: 'boolean', description: 'Urgent flag' },
        important: { type: 'boolean', description: 'Important flag' },
        estimate_min: { type: 'number', description: 'Estimate minutes' },
        project: { type: 'string', description: 'Project' },
        mit: { type: 'boolean', description: 'MIT flag' },
        notes: { type: 'string', description: 'Notes' },
      },
      required: ['task'],
      run: async a => {
        const t = this.findTaskOrThrow(a['task']);
        const patch: Partial<Task> = { inbox: false };
        if (a['title']) patch.title = String(a['title']);
        if (a['due'] !== undefined) patch.due = parseDue(a['due']);
        if (a['urgent'] !== undefined) patch.urgent = !!a['urgent'];
        if (a['important'] !== undefined) patch.important = !!a['important'];
        if (a['estimate_min'] !== undefined) patch.estimateMin = Number(a['estimate_min']);
        if (a['project'] !== undefined) patch.project = a['project'];
        if (a['notes'] !== undefined) patch.notes = a['notes'];
        if (a['mit'] !== undefined) patch.isMit = !!a['mit'] && (t.isMit || this.store.mits().length < 3);
        const u = await this.store.updateTask(t.id, patch);
        return `Updated: ${this.fmtTask(u!)}`;
      },
    },
    {
      name: 'delete_task', group: 'tasks', risky: true,
      description: 'Permanently delete a task.',
      params: { task: { type: 'string', description: 'Task id or title words' } },
      required: ['task'],
      run: async (a, ctx) => {
        const t = this.findTaskOrThrow(a['task']);
        if (!(await ctx.confirm(`Delete task "${t.title}"?`))) return 'User cancelled the deletion.';
        await this.store.deleteTask(t.id);
        return `Deleted "${t.title}".`;
      },
    },
    {
      name: 'set_mits', group: 'tasks',
      description: 'Set today\'s 3 Most Important Tasks (replaces current MITs). Pass task ids or titles; unknown titles are created.',
      params: { tasks: { type: 'array', items: { type: 'string' }, description: 'Up to 3 task ids or titles' } },
      required: ['tasks'],
      run: async a => {
        const refs: string[] = (Array.isArray(a['tasks']) ? a['tasks'] : String(a['tasks']).split(/[,;\n]/)).map(String).filter(Boolean).slice(0, 3);
        const ids: string[] = [];
        for (const r of refs) {
          const t = this.store.findTask(r) ?? await this.store.addTask({ title: r, important: true });
          ids.push(t.id);
        }
        await this.store.setMits(ids);
        return `Today's MITs:\n${this.store.mits().map(this.fmtTask).join('\n')}`;
      },
    },
    // ---------------- focus ----------------
    {
      name: 'start_focus', group: 'core',
      description: 'Start a Pomodoro/focus session (or a break).',
      params: {
        minutes: { type: 'number', description: 'Length in minutes (default from settings)' },
        task: { type: 'string', description: 'Task id or title to focus on' },
        label: { type: 'string', description: 'What the session is for' },
        kind: { type: 'string', enum: ['focus', 'break'], description: 'focus or break' },
      },
      run: async a => {
        const t = a['task'] ? this.store.findTask(a['task']) : undefined;
        const s = await this.focus.start({ minutes: a['minutes'] ? Number(a['minutes']) : undefined, taskId: t?.id, label: a['label'], kind: a['kind'] === 'break' ? 'break' : 'focus' });
        return `${s.kind === 'focus' ? 'Focus' : 'Break'} started: "${s.label}" for ${s.minutes} min, ends ${hm(new Date(Date.now() + s.minutes * 60000))}.`;
      },
    },
    {
      name: 'stop_focus', group: 'focus',
      description: 'Stop the running focus session.',
      params: {},
      run: async () => { const s = await this.focus.stop(false); return s ? `Stopped "${s.label}" after ${s.minutes} min.` : 'No session running.'; },
    },
    {
      name: 'focus_stats', group: 'focus',
      description: 'Focus minutes per day for recent days.',
      params: { days: { type: 'number', description: 'How many days back (default 7)' } },
      run: async a => {
        const n = Math.min(Number(a['days'] ?? 7), 30);
        const rows: string[] = []; let total = 0;
        for (let i = n - 1; i >= 0; i--) { const d = addDays(this.store.today(), -i); const m = this.store.focusMinutesOn(d); total += m; rows.push(`${d}: ${m} min`); }
        const cur = this.focus.current();
        return `${rows.join('\n')}\nTotal ${total} min, avg ${Math.round(total / n)} min/day.${cur ? `\nRunning now: "${cur.session.label}".` : ''}`;
      },
    },
    // ---------------- habits ----------------
    {
      name: 'add_habit', group: 'habits',
      description: 'Create a habit to track.',
      params: { name: { type: 'string', description: 'Habit name' }, cadence: { type: 'string', enum: ['daily', 'weekly'], description: 'daily or weekly' }, target: { type: 'number', description: 'Times per week if weekly' } },
      required: ['name'],
      run: async a => { const h = await this.store.addHabit(String(a['name']), a['cadence'] === 'weekly' ? 'weekly' : 'daily', Number(a['target'] ?? 7)); return `Tracking habit "${h.name}" (${h.cadence}).`; },
    },
    {
      name: 'log_habit', group: 'habits',
      description: 'Mark a habit done for today (or a date).',
      params: { habit: { type: 'string', description: 'Habit name' }, date: { type: 'string', description: 'YYYY-MM-DD, default today' } },
      required: ['habit'],
      run: async a => {
        const h = this.store.findHabit(String(a['habit']));
        if (!h) return `No habit "${a['habit']}". Habits: ${this.store.activeHabits().map(x => x.name).join(', ') || 'none'}.`;
        const u = await this.store.logHabit(h.id, parseDue(a['date']) ?? this.store.today());
        return `Logged "${h.name}". Streak: ${this.store.streak(u!)} day(s).`;
      },
    },
    {
      name: 'habit_report', group: 'habits',
      description: 'Habits with streaks and last-7-day completion.',
      params: {},
      run: async () => {
        const hs = this.store.activeHabits();
        if (!hs.length) return 'No habits yet.';
        return hs.map(h => {
          const last7 = Array.from({ length: 7 }, (_, i) => addDays(this.store.today(), -i)).filter(d => h.log.includes(d)).length;
          return `• ${h.name}: streak ${this.store.streak(h)}, ${last7}/7 this week, ${h.log.includes(this.store.today()) ? 'done' : 'not done'} today`;
        }).join('\n');
      },
    },
    // ---------------- planning ----------------
    {
      name: 'plan_day', group: 'planning',
      description: 'Generate a time-blocked schedule for the rest of today from tasks and priorities.',
      params: {
        start: { type: 'string', description: 'Start time HH:MM (default now/work start)' },
        end: { type: 'string', description: 'End time HH:MM (default work end)' },
        notes: { type: 'string', description: 'Constraints, fixed events, energy notes' },
      },
      run: async a => {
        const p = await this.planner.generate({ from: a['start'], to: a['end'], notes: a['notes'] });
        return `Plan saved:\n${p.blocks.map(b => `${b.start}–${b.end} ${b.label}`).join('\n')}`;
      },
    },
    {
      name: 'get_schedule', group: 'planning',
      description: 'Today\'s saved time-block schedule and current block.',
      params: {},
      run: async () => {
        const p = this.store.todayPlan();
        if (!p?.blocks.length) return 'No plan for today yet. Use plan_day.';
        const cur = this.planner.currentBlock();
        return `${p.blocks.map(b => `${b.start}–${b.end} ${b.label}${b === cur ? '  ← now' : ''}`).join('\n')}`;
      },
    },
    {
      name: 'daily_summary', group: 'planning',
      description: 'Snapshot of today: MITs, overdue, done, focus minutes, habits.',
      params: {},
      run: async () => this.store.snapshot(),
    },
    // ---------------- notes ----------------
    {
      name: 'create_note', group: 'notes',
      description: 'Save a note (ideas, meeting notes, lists).',
      params: { title: { type: 'string', description: 'Title' }, body: { type: 'string', description: 'Content (markdown ok)' }, tags: { type: 'array', items: { type: 'string' }, description: 'Tags' } },
      required: ['title', 'body'],
      run: async a => { const n = await this.store.saveNote({ title: String(a['title']), body: String(a['body']), tags: Array.isArray(a['tags']) ? a['tags'] : [] }); return `Saved note "${n.title}".`; },
    },
    {
      name: 'search_notes', group: 'notes',
      description: 'Search notes and journal by words.',
      params: { query: { type: 'string', description: 'Words to find' } },
      required: ['query'],
      run: async a => {
        const q = String(a['query']).toLowerCase();
        const hits = this.store.notes().filter(n => (n.title + ' ' + n.body + ' ' + n.tags.join(' ')).toLowerCase().includes(q)).slice(0, 8);
        return hits.length ? hits.map(n => `## ${n.title}\n${n.body.slice(0, 500)}`).join('\n\n') : 'No matching notes.';
      },
    },
    {
      name: 'append_journal', group: 'notes',
      description: 'Add an entry to today\'s journal.',
      params: { text: { type: 'string', description: 'Journal entry' } },
      required: ['text'],
      run: async a => {
        const title = `Journal ${this.store.today()}`;
        const existing = this.store.notes().find(n => n.title === title);
        await this.store.saveNote({ id: existing?.id, title, body: `${existing ? existing.body + '\n\n' : ''}**${hm()}** ${a['text']}`, tags: ['journal'] });
        return 'Journal updated.';
      },
    },
    // ---------------- memory ----------------
    {
      name: 'remember', group: 'core',
      description: 'Store a durable fact about the user (people, preferences, goals, projects) in long-term memory.',
      params: {
        fact: { type: 'string', description: 'The fact, third person, e.g. "User\'s sister is Thandi"' },
        kind: { type: 'string', enum: ['fact', 'preference', 'goal', 'person', 'project', 'event'], description: 'Kind' },
        importance: { type: 'number', description: '1-5' },
      },
      required: ['fact'],
      run: async a => {
        const r = await this.memory.add(String(a['fact']), (a['kind'] ?? 'fact') as MemoryKind, Number(a['importance'] ?? 4));
        return r.merged ? `Updated memory: ${r.memory.text}` : `Remembered: ${r.memory.text}`;
      },
    },
    {
      name: 'recall', group: 'memory',
      description: 'Search long-term memory about the user.',
      params: { query: { type: 'string', description: 'What to look for' } },
      required: ['query'],
      run: async a => {
        const hits = await this.memory.search(String(a['query']), 8);
        return hits.length ? hits.map(h => `• ${h.memory.text} [${h.memory.kind}, id ${h.memory.id.slice(0, 8)}]`).join('\n') : 'Nothing relevant in memory.';
      },
    },
    {
      name: 'forget', group: 'memory', risky: true,
      description: 'Delete a memory (by id or description).',
      params: { query: { type: 'string', description: 'Memory id or what to forget' } },
      required: ['query'],
      run: async (a, ctx) => {
        const hits = await this.memory.search(String(a['query']), 3);
        const preview = hits.filter(h => h.score > 0.5).map(h => h.memory.text).join('; ');
        if (!(await ctx.confirm(`Forget: ${preview || a['query']}?`))) return 'User cancelled.';
        const removed = await this.memory.forget(String(a['query']));
        return removed.length ? `Forgot: ${removed.join('; ')}` : 'Nothing matched.';
      },
    },
    {
      name: 'list_memories', group: 'memory',
      description: 'List recent or pinned memories.',
      params: { limit: { type: 'number', description: 'How many (default 15)' } },
      run: async a => {
        const list = this.memory.memories().slice(0, Math.min(Number(a['limit'] ?? 15), 50));
        return list.length ? list.map(m => `• ${m.pinned ? '📌 ' : ''}${m.text} [${m.kind}]`).join('\n') : 'Memory is empty.';
      },
    },
    // ---------------- reminders ----------------
    {
      name: 'schedule_reminder', group: 'core',
      description: 'Notify the user at a time. "when" can be ISO, "15:30", "in 20 minutes", "tomorrow at 9".',
      params: { text: { type: 'string', description: 'Reminder message' }, when: { type: 'string', description: 'When' } },
      required: ['text', 'when'],
      run: async a => {
        const at = parseWhen(String(a['when']));
        if (!at) throw new Error(`Couldn't understand time "${a['when']}"`);
        if (at.getTime() < Date.now()) throw new Error('That time has passed');
        await this.notify.remind(String(a['text']), at);
        return `Reminder set for ${describeWhen(at)}: ${a['text']}`;
      },
    },
    {
      name: 'list_reminders', group: 'reminders',
      description: 'Upcoming reminders.',
      params: {},
      run: async () => {
        const list = this.store.reminders().filter(r => r.at > Date.now()).sort((x, y) => x.at - y.at);
        return list.length ? list.map(r => `• ${describeWhen(new Date(r.at))}: ${r.title} [id ${r.id.slice(0, 8)}]`).join('\n') : 'No upcoming reminders.';
      },
    },
    {
      name: 'cancel_reminder', group: 'reminders',
      description: 'Cancel a reminder by id or words.',
      params: { reminder: { type: 'string', description: 'Id or words' } },
      required: ['reminder'],
      run: async a => (await this.notify.cancelReminder(String(a['reminder']))) ? 'Reminder cancelled.' : 'No matching reminder.',
    },
    // ---------------- phone ----------------
    {
      name: 'set_alarm', group: 'phone',
      description: 'Set an alarm in the phone\'s clock app.',
      params: {
        time: { type: 'string', description: 'HH:MM 24h or "7am"' },
        label: { type: 'string', description: 'Alarm label' },
        days: { type: 'array', items: { type: 'number' }, description: 'Repeat days 1=Sun..7=Sat (optional)' },
      },
      required: ['time'],
      run: async a => {
        const d = parseWhen(String(a['time']));
        if (!d) throw new Error('Bad time');
        await JarvisDevice.setAlarm({ hour: d.getHours(), minute: d.getMinutes(), message: a['label'] ?? 'Jarvis', days: a['days'], skipUi: true });
        return `Alarm set for ${hm(d)}${a['label'] ? ` (${a['label']})` : ''}.`;
      },
    },
    {
      name: 'set_timer', group: 'phone',
      description: 'Start a countdown timer in the clock app.',
      params: { minutes: { type: 'number', description: 'Minutes' }, seconds: { type: 'number', description: 'Extra seconds' }, label: { type: 'string', description: 'Label' } },
      run: async a => {
        const secs = Math.round(Number(a['minutes'] ?? 0) * 60 + Number(a['seconds'] ?? 0));
        if (secs <= 0) throw new Error('Timer needs a duration');
        await JarvisDevice.setTimer({ seconds: secs, message: a['label'] ?? 'Jarvis timer', skipUi: true });
        return `Timer running: ${Math.floor(secs / 60)}m ${secs % 60}s.`;
      },
    },
    {
      name: 'open_app', group: 'phone',
      description: 'Open an installed app by name (e.g. "WhatsApp", "Spotify").',
      params: { name: { type: 'string', description: 'App name' } },
      required: ['name'],
      run: async a => {
        const q = String(a['name']).toLowerCase();
        const { apps } = await JarvisDevice.listApps();
        const app = apps.find(x => x.label.toLowerCase() === q) ?? apps.find(x => x.label.toLowerCase().includes(q)) ?? apps.find(x => x.package.toLowerCase().includes(q));
        if (!app) return `No app called "${a['name']}" installed.`;
        await JarvisDevice.openApp({ package: app.package });
        return `Opened ${app.label}.`;
      },
    },
    {
      name: 'list_apps', group: 'phone',
      description: 'List installed apps, optionally filtered.',
      params: { query: { type: 'string', description: 'Filter text' } },
      run: async a => {
        const { apps } = await JarvisDevice.listApps();
        const q = String(a['query'] ?? '').toLowerCase();
        const list = apps.filter(x => !q || x.label.toLowerCase().includes(q)).slice(0, 60);
        return list.map(x => x.label).join(', ') || 'No apps.';
      },
    },
    {
      name: 'flashlight', group: 'phone',
      description: 'Turn the torch on or off.',
      params: { on: { type: 'boolean', description: 'true = on' } },
      required: ['on'],
      run: async a => { const r = await JarvisDevice.flashlight({ on: !!a['on'] }); return `Torch ${r.on ? 'on' : 'off'}.`; },
    },
    {
      name: 'battery_status', group: 'phone',
      description: 'Battery level and charging state.',
      params: {},
      run: async () => { const b = await JarvisDevice.battery(); return `Battery ${b.level}%${b.charging ? ', charging' : ''}.`; },
    },
    {
      name: 'device_info', group: 'phone',
      description: 'Phone model, Android version, free RAM and storage, AI engine status.',
      params: {},
      run: async () => {
        const d = await JarvisDevice.deviceInfo();
        return `${d.manufacturer} ${d.model}, Android ${d.android}. RAM ${d.ramAvailMb}/${d.ramTotalMb} MB free. Storage free ${Math.round(d.storageFreeMb / 1024)} GB. Model: ${this.store.settings().chatModel}.`;
      },
    },
    {
      name: 'open_settings', group: 'phone',
      description: 'Open a phone settings page.',
      params: { page: { type: 'string', enum: ['wifi', 'bluetooth', 'display', 'sound', 'battery', 'location', 'apps', 'tts', 'notifications', 'airplane', 'main'], description: 'Page' } },
      required: ['page'],
      run: async a => { await JarvisDevice.openSettings({ page: String(a['page']) }); return `Opened ${a['page']} settings.`; },
    },
    // ---------------- comms (open composers; user taps send) ----------------
    {
      name: 'draft_sms', group: 'comms',
      description: 'Open the SMS app with a drafted message (user sends it).',
      params: { number: { type: 'string', description: 'Phone number' }, body: { type: 'string', description: 'Message' } },
      required: ['number', 'body'],
      run: async a => { await JarvisDevice.sms({ number: String(a['number']), body: String(a['body']) }); return 'SMS draft opened for you to send.'; },
    },
    {
      name: 'dial_number', group: 'comms',
      description: 'Open the dialer with a number (user presses call).',
      params: { number: { type: 'string', description: 'Phone number' } },
      required: ['number'],
      run: async a => { await JarvisDevice.dial({ number: String(a['number']) }); return 'Dialer opened.'; },
    },
    {
      name: 'compose_email', group: 'comms',
      description: 'Open the email app with a drafted email (user sends it).',
      params: { to: { type: 'string', description: 'Recipient' }, subject: { type: 'string', description: 'Subject' }, body: { type: 'string', description: 'Body' } },
      required: ['to'],
      run: async a => { await JarvisDevice.email({ to: String(a['to']), subject: a['subject'], body: a['body'] }); return 'Email draft opened.'; },
    },
    {
      name: 'share_text', group: 'comms',
      description: 'Share text via the Android share sheet (WhatsApp, etc.).',
      params: { text: { type: 'string', description: 'Text' } },
      required: ['text'],
      run: async a => { await JarvisDevice.share({ text: String(a['text']) }); return 'Share sheet opened.'; },
    },
    // ---------------- calendar ----------------
    {
      name: 'add_calendar_event', group: 'calendar',
      description: 'Add an event to the phone calendar (opens prefilled event).',
      params: {
        title: { type: 'string', description: 'Title' },
        start: { type: 'string', description: 'Start: ISO or phrase like "friday 14:00"' },
        duration_min: { type: 'number', description: 'Minutes (default 60)' },
        location: { type: 'string', description: 'Location' },
        description: { type: 'string', description: 'Details' },
      },
      required: ['title', 'start'],
      run: async a => {
        const st = parseWhen(String(a['start']));
        if (!st) throw new Error('Bad start time');
        const end = new Date(st.getTime() + Number(a['duration_min'] ?? 60) * 60000);
        await JarvisDevice.calendarInsert({ title: String(a['title']), start: st.getTime(), end: end.getTime(), location: a['location'], description: a['description'] });
        return `Calendar event "${a['title']}" prepared for ${describeWhen(st)}.`;
      },
    },
    // ---------------- utility ----------------
    {
      name: 'get_time', group: 'core',
      description: 'Current date, time and weekday.',
      params: {},
      run: async () => `${prettyDate()} ${hm()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`,
    },
    {
      name: 'calculate', group: 'utility',
      description: 'Evaluate a math expression exactly: + - * / ^ % ( ) sqrt sin cos tan log ln abs round pi e.',
      params: { expression: { type: 'string', description: 'Expression' } },
      required: ['expression'],
      run: async a => { const v = calculate(String(a['expression'])); return `${a['expression']} = ${Number.isInteger(v) ? v : +v.toPrecision(12)}`; },
    },
    {
      name: 'convert_units', group: 'utility',
      description: 'Convert length, mass, volume, temperature, speed, time, data, area.',
      params: { value: { type: 'number', description: 'Amount' }, from: { type: 'string', description: 'From unit' }, to: { type: 'string', description: 'To unit' } },
      required: ['value', 'from', 'to'],
      run: async a => `${a['value']} ${a['from']} = ${+convertUnits(Number(a['value']), String(a['from']), String(a['to'])).toPrecision(8)} ${a['to']}`,
    },
    {
      name: 'date_math', group: 'utility',
      description: 'Date arithmetic: op=add (date + days), diff (days between date and date2), weekday (day name of date).',
      params: {
        op: { type: 'string', enum: ['add', 'diff', 'weekday'], description: 'Operation' },
        date: { type: 'string', description: 'YYYY-MM-DD or "today"' },
        days: { type: 'number', description: 'Days to add' },
        date2: { type: 'string', description: 'Second date for diff' },
      },
      required: ['op', 'date'],
      run: async a => {
        const d1 = parseDue(String(a['date'])) ?? ymd();
        if (a['op'] === 'add') { const r = addDays(d1, Number(a['days'] ?? 0)); return `${d1} + ${a['days']} days = ${r} (${new Date(r + 'T12:00').toLocaleDateString(undefined, { weekday: 'long' })})`; }
        if (a['op'] === 'weekday') return `${d1} is a ${new Date(d1 + 'T12:00').toLocaleDateString(undefined, { weekday: 'long' })}`;
        const d2 = parseDue(String(a['date2'] ?? 'today')) ?? ymd();
        const diff = Math.round((Date.parse(d2) - Date.parse(d1)) / 864e5);
        return `${Math.abs(diff)} days between ${d1} and ${d2}.`;
      },
    },
    {
      name: 'clipboard_read', group: 'utility',
      description: 'Read the clipboard text.',
      params: {},
      run: async () => { const r = await JarvisDevice.clipboardRead(); return r.text ? `Clipboard: ${r.text.slice(0, 4000)}` : 'Clipboard is empty.'; },
    },
    {
      name: 'clipboard_write', group: 'utility',
      description: 'Copy text to the clipboard.',
      params: { text: { type: 'string', description: 'Text' } },
      required: ['text'],
      run: async a => { await JarvisDevice.clipboardWrite({ text: String(a['text']) }); return 'Copied to clipboard.'; },
    },
    // ---------------- web (needs internet) ----------------
    {
      name: 'web_search', group: 'web',
      description: 'Search the web (needs internet). Returns titles, links and snippets.',
      params: { query: { type: 'string', description: 'Search query' } },
      required: ['query'],
      run: async a => {
        if (!navigator.onLine) return 'Offline: web search unavailable.';
        const html = await this.httpGet(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(String(a['query']))}`);
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const items = Array.from(doc.querySelectorAll('.result')).slice(0, 6).map(r => {
          const link = r.querySelector('.result__a') as HTMLAnchorElement | null;
          const snip = r.querySelector('.result__snippet')?.textContent?.trim() ?? '';
          let href = link?.getAttribute('href') ?? '';
          const m = href.match(/uddg=([^&]+)/); if (m) href = decodeURIComponent(m[1]);
          return link ? `• ${link.textContent?.trim()}\n  ${href}\n  ${snip}` : '';
        }).filter(Boolean);
        return items.length ? items.join('\n') : 'No results.';
      },
    },
    {
      name: 'web_fetch', group: 'web',
      description: 'Fetch a web page and return its readable text (needs internet).',
      params: { url: { type: 'string', description: 'http(s) URL' } },
      required: ['url'],
      run: async a => {
        if (!navigator.onLine) return 'Offline: cannot fetch pages.';
        const url = String(a['url']).startsWith('http') ? String(a['url']) : `https://${a['url']}`;
        return htmlToText(await this.httpGet(url)).slice(0, 6000);
      },
    },
    {
      name: 'open_url', group: 'web',
      description: 'Open a URL in the browser.',
      params: { url: { type: 'string', description: 'URL' } },
      required: ['url'],
      run: async a => { await JarvisDevice.openUrl({ url: String(a['url']) }); return 'Opened.'; },
    },
  ];

  private async httpGet(url: string): Promise<string> {
    if (isNative()) {
      const r = await CapacitorHttp.get({ url, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Jarvis/1.0' }, responseType: 'text' });
      if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
      return typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    }
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  }

  private toOllama(d: ToolDef): OllamaTool {
    return { type: 'function', function: { name: d.name, description: d.description, parameters: { type: 'object', properties: d.params, required: d.required ?? [] } } };
  }

  /** Tools offered for a given user message: core + intent-matched groups + MCP. `all` sends everything. */
  select(text: string, all = false): { tools: OllamaTool[]; groups: ToolGroup[] } {
    const groups = new Set<ToolGroup>(['core']);
    if (all) Object.keys(TRIGGERS).forEach(g => groups.add(g as ToolGroup));
    else for (const [g, re] of Object.entries(TRIGGERS)) if (re.test(text)) groups.add(g as ToolGroup);
    // core tools first, in a fixed order: keeps the rendered prompt prefix stable so the
    // on-device engine can reuse its KV cache between turns
    const tools = [
      ...this.defs.filter(d => d.group === 'core'),
      ...this.defs.filter(d => d.group !== 'core' && groups.has(d.group)),
    ].map(d => this.toOllama(d));
    const mcpTools = this.mcp.toolDefs();
    if (mcpTools.length && (all || /mcp|server|file|repo|git|database|search|fetch|\b(use|with) (the )?\w+ tool/i.test(text) || mcpTools.length <= 6)) tools.push(...mcpTools);
    return { tools, groups: [...groups] };
  }

  /** Compact catalogue for the JSON-fallback protocol (models without native tools). */
  catalogue(tools: OllamaTool[]): string {
    return tools.map(t => {
      const p = t.function.parameters.properties as Record<string, { type: string }>;
      return `- ${t.function.name}(${Object.entries(p).map(([k, v]) => `${k}:${v.type}`).join(', ')}): ${t.function.description}`;
    }).join('\n');
  }

  isRisky(name: string): boolean {
    if (this.mcp.owns(name)) return true;
    return !!this.defs.find(d => d.name === name)?.risky;
  }

  async run(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<{ ok: boolean; result: string }> {
    try {
      if (this.mcp.owns(name)) {
        if (!(await ctx.confirm(`Run external tool ${name}?`))) return { ok: false, result: 'User declined.' };
        return { ok: true, result: await this.mcp.call(name, args) };
      }
      const def = this.defs.find(d => d.name === name);
      if (!def) return { ok: false, result: `Unknown tool "${name}". Available: ${this.defs.map(d => d.name).join(', ')}` };
      return { ok: true, result: await def.run(args as Record<string, any>, ctx) };
    } catch (e: any) {
      return { ok: false, result: `Error: ${e?.message ?? e}` };
    }
  }
}
