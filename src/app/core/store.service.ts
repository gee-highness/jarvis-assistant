import { mergePersonality } from './personality';
import { Injectable, computed, signal } from '@angular/core';
import { db } from './db';
import {
  BUILTIN_TEMPLATES, DEFAULT_SETTINGS, DayPlan, FocusSession, Goal, Habit, JournalEntry, Milestone, Note, Reminder, Repeat, Review, Settings, Task,
  TaskTemplate,
} from './models';
import { addDays, parseYmd, uid, ymd } from './util';

/** Domain events other services (progress, nudges) react to. */
export type StoreEvent =
  | { type: 'task_done'; task: Task }
  | { type: 'task_undone'; task: Task }
  | { type: 'habit_logged'; habit: Habit; date: string }
  | { type: 'habit_unlogged'; habit: Habit; date: string }
  | { type: 'focus_done'; session: FocusSession }
  | { type: 'review_saved'; review: Review }
  | { type: 'journal_saved'; entry: JournalEntry }
  | { type: 'plan_saved'; plan: DayPlan }
  | { type: 'milestone_done'; goal: Goal; milestone: Milestone }
  | { type: 'goal_done'; goal: Goal }
  | { type: 'inbox_zero' };

/** Next due date for a repeating task. */
export function nextDue(from: string, r: Repeat): string {
  const n = Math.max(1, r.interval ?? 1);
  if (r.every === 'daily') return addDays(from, n);
  if (r.every === 'weekly') return addDays(from, 7 * n);
  if (r.every === 'weekdays') {
    let d = addDays(from, 1);
    while ([0, 6].includes(parseYmd(d).getDay())) d = addDays(d, 1);
    return d;
  }
  const dt = parseYmd(from);
  const day = dt.getDate();
  const target = new Date(dt.getFullYear(), dt.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, last));
  return ymd(target);
}

/** Single source of truth for productivity data. Signals in memory, persisted to IndexedDB. */
@Injectable({ providedIn: 'root' })
export class StoreService {
  readonly ready = signal(false);
  readonly settings = signal<Settings>(DEFAULT_SETTINGS);
  readonly tasks = signal<Task[]>([]);
  readonly habits = signal<Habit[]>([]);
  readonly sessions = signal<FocusSession[]>([]);
  readonly reviews = signal<Review[]>([]);
  readonly notes = signal<Note[]>([]);
  readonly reminders = signal<Reminder[]>([]);
  readonly plans = signal<DayPlan[]>([]);
  readonly goals = signal<Goal[]>([]);
  readonly journal = signal<JournalEntry[]>([]);
  readonly customTemplates = signal<TaskTemplate[]>([]);
  readonly today = signal(ymd());
  private listeners: ((e: StoreEvent) => void)[] = [];

  // ---------- derived ----------
  readonly openTasks = computed(() => this.tasks().filter(t => t.status === 'todo'));
  readonly mits = computed(() => this.openTasks().filter(t => t.isMit));
  readonly inbox = computed(() => this.openTasks().filter(t => t.inbox));
  readonly overdue = computed(() => this.openTasks().filter(t => t.due && t.due < this.today()));
  readonly dueToday = computed(() => this.openTasks().filter(t => t.due === this.today()));
  readonly doneToday = computed(() => this.tasks().filter(t => t.doneAt && ymd(new Date(t.doneAt)) === this.today()));
  readonly activeHabits = computed(() => this.habits().filter(h => !h.archived));
  readonly focusMinutesToday = computed(() => this.focusMinutesOn(this.today()));
  readonly todayPlan = computed(() => this.plans().find(p => p.date === this.today()));
  readonly activeGoals = computed(() => this.goals().filter(g => g.status === 'active'));
  readonly todayJournal = computed(() => this.journal().find(j => j.date === this.today()));
  readonly templates = computed(() => [...BUILTIN_TEMPLATES, ...this.customTemplates()]);
  readonly projects = computed(() => {
    const map = new Map<string, { name: string; open: number; done: number }>();
    for (const t of this.tasks()) {
      if (!t.project) continue;
      const p = map.get(t.project) ?? { name: t.project, open: 0, done: 0 };
      if (t.status === 'done') p.done++; else p.open++;
      map.set(t.project, p);
    }
    return [...map.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  });
  readonly focusHistory = computed(() => {
    const out: { date: string; minutes: number }[] = [];
    for (let i = 13; i >= 0; i--) { const d = addDays(this.today(), -i); out.push({ date: d, minutes: this.focusMinutesOn(d) }); }
    return out;
  });

  async init(): Promise<void> {
    const s = await db.settings.get('main');
    this.settings.set(s ? { ...DEFAULT_SETTINGS, ...s, personality: mergePersonality(s.personality), voice: { ...DEFAULT_SETTINGS.voice, ...(s.voice ?? {}) }, cloud: { ...DEFAULT_SETTINGS.cloud, ...(s.cloud ?? {}) }, look: { ...DEFAULT_SETTINGS.look, ...(s.look ?? {}) }, pet: { ...DEFAULT_SETTINGS.pet, ...(s.pet ?? {}) } } : DEFAULT_SETTINGS);
    if (!s) await db.settings.put(DEFAULT_SETTINGS);
    const [tasks, habits, sessions, reviews, notes, reminders, plans, goals, journal, templates] = await Promise.all([
      db.tasks.toArray(), db.habits.toArray(), db.sessions.orderBy('start').reverse().limit(2000).toArray(),
      db.reviews.toArray(), db.notes.toArray(), db.reminders.toArray(), db.plans.toArray(),
      db.goals.toArray(), db.journal.orderBy('date').reverse().toArray(), db.templates.toArray(),
    ]);
    this.tasks.set(tasks); this.habits.set(habits); this.sessions.set(sessions);
    this.reviews.set(reviews); this.notes.set(notes); this.reminders.set(reminders); this.plans.set(plans);
    this.goals.set(goals); this.journal.set(journal); this.customTemplates.set(templates);
    // roll the day over at midnight
    setInterval(() => { const d = ymd(); if (d !== this.today()) this.today.set(d); }, 60_000);
    this.ready.set(true);
  }

  // ---------- events ----------
  on(fn: (e: StoreEvent) => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  private emit(e: StoreEvent) {
    for (const l of this.listeners) { try { l(e); } catch (err) { console.error(err); } }
  }

  // ---------- settings ----------
  async updateSettings(patch: Partial<Settings>): Promise<void> {
    const next = { ...this.settings(), ...patch, id: 'main' as const };
    this.settings.set(next);
    await db.settings.put(next);
  }

  // ---------- tasks ----------
  async addTask(p: Partial<Task> & { title: string }): Promise<Task> {
    const t: Task = {
      id: uid(), title: p.title.trim(), notes: p.notes, project: p.project,
      urgent: !!p.urgent, important: p.important ?? true, due: p.due, estimateMin: p.estimateMin,
      status: 'todo', isMit: !!p.isMit, inbox: p.inbox ?? false, createdAt: Date.now(),
      goalId: p.goalId, repeat: p.repeat, subtasks: p.subtasks,
    };
    this.tasks.update(a => [t, ...a]);
    await db.tasks.put(t);
    return t;
  }

  async updateTask(id: string, patch: Partial<Task>): Promise<Task | undefined> {
    let updated: Task | undefined;
    this.tasks.update(a => a.map(t => (t.id === id ? (updated = { ...t, ...patch }) : t)));
    if (updated) await db.tasks.put(updated);
    return updated;
  }

  async completeTask(id: string, done = true): Promise<Task | undefined> {
    const before = this.tasks().find(t => t.id === id);
    if (!before || (before.status === 'done') === done) return before;
    const hadInbox = this.inbox().length > 0;
    const t = await this.updateTask(id, done
      ? { status: 'done', doneAt: Date.now(), inbox: false }
      : { status: 'todo', doneAt: undefined });
    if (!t) return t;
    if (done) {
      // repeating task: schedule the next occurrence (once)
      if (t.repeat && !t.nextId) {
        const next = await this.addTask({
          title: t.title, notes: t.notes, project: t.project, goalId: t.goalId, repeat: t.repeat,
          urgent: t.urgent, important: t.important, estimateMin: t.estimateMin,
          due: nextDue(t.due && t.due > this.today() ? t.due : this.today(), t.repeat),
          subtasks: t.subtasks?.map(st => ({ ...st, id: uid(), done: false })),
        });
        await this.updateTask(t.id, { nextId: next.id });
      }
      this.emit({ type: 'task_done', task: { ...before, ...t } });
      if (hadInbox && this.inbox().length === 0) this.emit({ type: 'inbox_zero' });
    } else {
      this.emit({ type: 'task_undone', task: t });
    }
    return t;
  }

  async toggleSubtask(taskId: string, subId: string): Promise<Task | undefined> {
    const t = this.tasks().find(x => x.id === taskId);
    if (!t?.subtasks) return t;
    return this.updateTask(taskId, { subtasks: t.subtasks.map(s => (s.id === subId ? { ...s, done: !s.done } : s)) });
  }

  async deleteTask(id: string): Promise<void> {
    this.tasks.update(a => a.filter(t => t.id !== id));
    await db.tasks.delete(id);
  }

  /** Move a task to another day (or clear its date). */
  async snoozeTask(id: string, days = 1): Promise<Task | undefined> {
    const t = this.tasks().find(x => x.id === id);
    if (!t) return t;
    return this.updateTask(id, { due: addDays(t.due && t.due > this.today() ? t.due : this.today(), days), isMit: false });
  }

  async setMits(ids: string[]): Promise<void> {
    const keep = new Set(ids.slice(0, 3));
    const changed: Task[] = [];
    this.tasks.update(a => a.map(t => {
      if (t.status !== 'todo') return t;   // completed MITs keep their badge for today's stats
      const isMit = keep.has(t.id);
      if (t.isMit !== isMit) { const n = { ...t, isMit, inbox: isMit ? false : t.inbox }; changed.push(n); return n; }
      return t;
    }));
    await db.tasks.bulkPut(changed);
  }

  /** Fuzzy-find a task by id or title fragment. */
  findTask(ref: string): Task | undefined {
    const r = ref.trim().toLowerCase();
    const all = this.tasks();
    return all.find(t => t.id === ref)
      ?? all.find(t => t.status === 'todo' && t.title.toLowerCase() === r)
      ?? all.find(t => t.status === 'todo' && t.title.toLowerCase().includes(r))
      ?? all.find(t => t.title.toLowerCase().includes(r));
  }

  // ---------- habits ----------
  async addHabit(name: string, cadence: Habit['cadence'] = 'daily', target = 7): Promise<Habit> {
    const h: Habit = { id: uid(), name: name.trim(), cadence, target, archived: false, log: [], createdAt: Date.now() };
    this.habits.update(a => [...a, h]);
    await db.habits.put(h);
    return h;
  }

  async toggleHabit(id: string, date = this.today()): Promise<Habit | undefined> {
    let updated: Habit | undefined;
    this.habits.update(a => a.map(h => {
      if (h.id !== id) return h;
      const log = h.log.includes(date) ? h.log.filter(d => d !== date) : [...h.log, date].sort();
      return (updated = { ...h, log });
    }));
    if (updated) {
      await db.habits.put(updated);
      this.emit(updated.log.includes(date) ? { type: 'habit_logged', habit: updated, date } : { type: 'habit_unlogged', habit: updated, date });
    }
    return updated;
  }

  async logHabit(id: string, date = this.today()): Promise<Habit | undefined> {
    const h = this.habits().find(x => x.id === id);
    if (!h || h.log.includes(date)) return h;
    return this.toggleHabit(id, date);
  }

  async archiveHabit(id: string, archived = true): Promise<void> {
    let updated: Habit | undefined;
    this.habits.update(a => a.map(h => (h.id === id ? (updated = { ...h, archived }) : h)));
    if (updated) await db.habits.put(updated);
  }

  async deleteHabit(id: string): Promise<void> {
    this.habits.update(a => a.filter(h => h.id !== id));
    await db.habits.delete(id);
  }

  findHabit(ref: string): Habit | undefined {
    const r = ref.trim().toLowerCase();
    return this.habits().find(h => h.id === ref) ?? this.habits().find(h => h.name.toLowerCase().includes(r));
  }

  streak(h: Habit): number {
    let n = 0;
    let d = this.today();
    if (!h.log.includes(d)) d = addDays(d, -1); // today not yet done doesn't break the streak
    while (h.log.includes(d)) { n++; d = addDays(d, -1); }
    return n;
  }

  // ---------- focus ----------
  async saveSession(s: FocusSession): Promise<void> {
    this.sessions.update(a => [s, ...a.filter(x => x.id !== s.id)]);
    await db.sessions.put(s);
    if (s.kind === 'focus' && s.end && s.minutes >= 5) this.emit({ type: 'focus_done', session: s });
  }

  focusMinutesOn(date: string): number {
    return Math.round(this.sessions()
      .filter(s => s.kind === 'focus' && ymd(new Date(s.start)) === date)
      .reduce((sum, s) => sum + s.minutes, 0));
  }

  // ---------- plans ----------
  async savePlan(plan: DayPlan): Promise<void> {
    this.plans.update(a => [plan, ...a.filter(p => p.date !== plan.date)]);
    await db.plans.put(plan);
    if (plan.blocks.length) this.emit({ type: 'plan_saved', plan });
  }

  // ---------- reviews ----------
  async saveReview(r: Review): Promise<void> {
    this.reviews.update(a => [r, ...a.filter(x => x.id !== r.id)]);
    await db.reviews.put(r);
    this.emit({ type: 'review_saved', review: r });
  }

  // ---------- goals ----------
  async addGoal(p: Partial<Goal> & { title: string }): Promise<Goal> {
    const g: Goal = {
      id: uid(), title: p.title.trim(), why: p.why, area: p.area ?? 'personal', targetDate: p.targetDate, metric: p.metric,
      milestones: p.milestones ?? [], status: 'active', createdAt: Date.now(),
    };
    this.goals.update(a => [g, ...a]);
    await db.goals.put(g);
    return g;
  }

  async updateGoal(id: string, patch: Partial<Goal>): Promise<Goal | undefined> {
    let updated: Goal | undefined;
    this.goals.update(a => a.map(g => (g.id === id ? (updated = { ...g, ...patch }) : g)));
    if (updated) await db.goals.put(updated);
    return updated;
  }

  async deleteGoal(id: string): Promise<void> {
    this.goals.update(a => a.filter(g => g.id !== id));
    await db.goals.delete(id);
    const linked = this.tasks().filter(t => t.goalId === id);
    for (const t of linked) await this.updateTask(t.id, { goalId: undefined });
  }

  async addMilestone(goalId: string, title: string): Promise<Goal | undefined> {
    const g = this.goals().find(x => x.id === goalId);
    if (!g) return g;
    return this.updateGoal(goalId, { milestones: [...g.milestones, { id: uid(), title: title.trim(), done: false }] });
  }

  async toggleMilestone(goalId: string, milestoneId: string): Promise<Goal | undefined> {
    const g = this.goals().find(x => x.id === goalId);
    if (!g) return g;
    const ms = g.milestones.map(m => (m.id === milestoneId ? { ...m, done: !m.done, doneAt: !m.done ? Date.now() : undefined } : m));
    const updated = await this.updateGoal(goalId, { milestones: ms });
    const m = ms.find(x => x.id === milestoneId);
    if (updated && m?.done) this.emit({ type: 'milestone_done', goal: updated, milestone: m });
    return updated;
  }

  async completeGoal(id: string, done = true): Promise<Goal | undefined> {
    const g = await this.updateGoal(id, done ? { status: 'done', doneAt: Date.now() } : { status: 'active', doneAt: undefined });
    if (g && done) this.emit({ type: 'goal_done', goal: g });
    return g;
  }

  /** 0..1 progress from the metric, milestones and linked tasks (whichever exist). */
  goalProgress(g: Goal): number {
    if (g.status === 'done') return 1;
    const parts: number[] = [];
    if (g.metric && g.metric.target > 0) parts.push(Math.min(1, Math.max(0, g.metric.current / g.metric.target)));
    if (g.milestones.length) parts.push(g.milestones.filter(m => m.done).length / g.milestones.length);
    const linked = this.tasks().filter(t => t.goalId === g.id);
    if (linked.length) parts.push(linked.filter(t => t.status === 'done').length / linked.length);
    return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
  }

  findGoal(ref: string): Goal | undefined {
    const r = ref.trim().toLowerCase();
    return this.goals().find(g => g.id === ref) ?? this.goals().find(g => g.title.toLowerCase() === r) ?? this.goals().find(g => g.title.toLowerCase().includes(r));
  }

  // ---------- journal ----------
  async saveJournal(p: Partial<JournalEntry> & { date?: string }): Promise<JournalEntry> {
    const date = p.date ?? this.today();
    const existing = p.id ? this.journal().find(j => j.id === p.id) : this.journal().find(j => j.date === date);
    const e: JournalEntry = {
      id: existing?.id ?? uid(), date, mood: p.mood ?? existing?.mood ?? 3, energy: p.energy ?? existing?.energy ?? 3,
      text: p.text ?? existing?.text ?? '', gratitude: p.gratitude ?? existing?.gratitude, tags: p.tags ?? existing?.tags ?? [],
      createdAt: existing?.createdAt ?? Date.now(), updatedAt: Date.now(),
    };
    this.journal.update(a => [e, ...a.filter(x => x.id !== e.id)].sort((x, y) => y.date.localeCompare(x.date)));
    await db.journal.put(e);
    this.emit({ type: 'journal_saved', entry: e });
    return e;
  }

  async deleteJournal(id: string): Promise<void> {
    this.journal.update(a => a.filter(j => j.id !== id));
    await db.journal.delete(id);
  }

  // ---------- templates ----------
  async saveTemplate(t: Partial<TaskTemplate> & { name: string; items: TaskTemplate['items'] }): Promise<TaskTemplate> {
    const tpl: TaskTemplate = { id: t.id ?? uid(), name: t.name, icon: t.icon ?? '📋', description: t.description, items: t.items };
    this.customTemplates.update(a => [tpl, ...a.filter(x => x.id !== tpl.id)]);
    await db.templates.put(tpl);
    return tpl;
  }

  async deleteTemplate(id: string): Promise<void> {
    this.customTemplates.update(a => a.filter(t => t.id !== id));
    await db.templates.delete(id);
  }

  /** Creates the template's tasks. Returns how many were added. */
  async applyTemplate(id: string, opts: { project?: string; start?: string; goalId?: string } = {}): Promise<number> {
    const tpl = this.templates().find(t => t.id === id) ?? this.templates().find(t => t.name.toLowerCase().includes(id.toLowerCase()));
    if (!tpl) throw new Error(`No template "${id}"`);
    const start = opts.start ?? this.today();
    for (const it of tpl.items) {
      await this.addTask({ title: it.title, estimateMin: it.estimateMin, due: addDays(start, it.offsetDays ?? 0), project: opts.project ?? tpl.name, goalId: opts.goalId });
    }
    return tpl.items.length;
  }

  // ---------- notes ----------
  async saveNote(n: Partial<Note> & { title: string; body: string }): Promise<Note> {
    const note: Note = { id: n.id ?? uid(), title: n.title, body: n.body, tags: n.tags ?? [], updatedAt: Date.now() };
    this.notes.update(a => [note, ...a.filter(x => x.id !== note.id)]);
    await db.notes.put(note);
    return note;
  }

  async deleteNote(id: string): Promise<void> {
    this.notes.update(a => a.filter(n => n.id !== id));
    await db.notes.delete(id);
  }

  // ---------- reminders ----------
  async saveReminder(r: Reminder): Promise<void> {
    this.reminders.update(a => [r, ...a.filter(x => x.id !== r.id)]);
    await db.reminders.put(r);
  }

  async deleteReminder(id: string): Promise<void> {
    this.reminders.update(a => a.filter(r => r.id !== id));
    await db.reminders.delete(id);
  }

  // ---------- backup ----------
  async exportJson(): Promise<string> {
    return JSON.stringify({ app: 'jarvis', version: 1, exportedAt: new Date().toISOString(), data: await db.exportAll() });
  }

  async importJson(json: string): Promise<void> {
    const parsed = JSON.parse(json);
    if (parsed?.app !== 'jarvis' || !parsed.data) throw new Error('Not a Jarvis backup file');
    await db.importAll(parsed.data);
    await this.init();
  }

  /** Compact text snapshot of current state for the model's context. */
  snapshot(): string {
    const fmt = (t: Task) => `- ${t.title}${t.due ? ` (due ${t.due})` : ''}${t.estimateMin ? ` ~${t.estimateMin}m` : ''}${t.urgent ? ' [urgent]' : ''}${t.important ? ' [important]' : ''} id:${t.id.slice(0, 8)}`;
    const lines: string[] = [];
    const mits = this.mits();
    lines.push(`MITs today: ${mits.length ? '\n' + mits.map(fmt).join('\n') : 'none set'}`);
    const ov = this.overdue();
    if (ov.length) lines.push(`Overdue (${ov.length}):\n` + ov.slice(0, 8).map(fmt).join('\n'));
    const dt = this.dueToday().filter(t => !t.isMit);
    if (dt.length) lines.push(`Due today:\n` + dt.slice(0, 8).map(fmt).join('\n'));
    const other = this.openTasks().filter(t => !t.isMit && t.due !== this.today() && !(t.due && t.due < this.today()));
    lines.push(`Other open tasks: ${other.length}${other.length ? '\n' + other.slice(0, 12).map(fmt).join('\n') : ''}`);
    lines.push(`Done today: ${this.doneToday().length} tasks, ${this.focusMinutesToday()} focus minutes.`);
    const hb = this.activeHabits();
    if (hb.length) lines.push('Habits: ' + hb.map(h => `${h.name} (${h.log.includes(this.today()) ? 'done' : 'not done'} today, streak ${this.streak(h)})`).join('; '));
    const plan = this.todayPlan();
    if (plan?.blocks.length) lines.push('Today\'s plan: ' + plan.blocks.map(b => `${b.start}-${b.end} ${b.label}`).join('; '));
    const goals = this.activeGoals();
    if (goals.length) lines.push('Active goals: ' + goals.slice(0, 6).map(g => `${g.title} (${Math.round(this.goalProgress(g) * 100)}%${g.targetDate ? `, by ${g.targetDate}` : ''})`).join('; '));
    const j = this.todayJournal();
    if (j) lines.push(`Mood today: ${j.mood}/5, energy ${j.energy}/5.`);
    return lines.join('\n');
  }
}
