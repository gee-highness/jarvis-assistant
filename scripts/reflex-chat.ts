/* Talk to Reflex headlessly against a stateful fake phone:  node reflex-chat.cjs  (built with esbuild).
 * Usage: node reflex-chat.cjs "hello" "add buy milk" ...   (no args = built-in scenario) */
import { ReflexEngine } from '../src/app/core/reflex/engine';
import type { HostState, ReflexHost } from '../src/app/core/reflex/types';

const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
let n = 10;
const tasks: any[] = [
  { id: 't1', title: 'Finish the quarterly report', due: yesterday, urgent: true, important: true, isMit: true, status: 'todo' },
  { id: 't2', title: 'Call mom', due: undefined, urgent: false, important: true, isMit: false, status: 'todo' },
  { id: 't3', title: 'Buy milk', due: today, urgent: false, important: false, isMit: false, status: 'todo' },
  { id: 't4', title: 'Renew car licence', due: undefined, urgent: false, important: true, isMit: false, status: 'todo' },
];
const habits = [{ name: 'Meditate', done: false }, { name: 'Gym', done: false }, { name: 'Read 20 pages', done: true }];
const reminders: { title: string; at: number }[] = [];
const mem: { text: string; kind: string }[] = [{ text: "User's name is Gerry", kind: 'fact' }];
let userName = 'Gerry';
const log: string[] = [];
const open = () => tasks.filter(t => t.status === 'todo');

const host: ReflexHost = {
  profile: () => ({ pet: { name: 'Comet', speaks: false, personality: process.env['PP'] || 'goofy', speech: process.env['PS'] || 'dog', sass: Number(process.env['SASS'] || 100) }, honorific: 'sir', userName, name: 'Jarvis', role: 'butler', traits: { warmth: 55, humor: 55, sarcasm: 45, formality: 85, directness: 75, verbosity: 35, enthusiasm: 35, playfulness: 25, curiosity: 35, toughLove: 45, emotional: 40, proactivity: 70 }, emoji: 'none', language: 'british', swearing: 'none', catchphrases: '', likes: '' }),
  petName: () => 'Comet',
  petAction: async k => ({ ok: true, line: `pet:${k}` }),
  state: (): HostState => ({
    open: open().length, overdue: open().filter(t => t.due && t.due < today).length, dueToday: open().filter(t => t.due === today).length,
    doneToday: tasks.filter(t => t.status === 'done').length, inbox: 0,
    tasks: open().map(t => ({ id: t.id, title: t.title, due: t.due, urgent: t.urgent, important: t.important, isMit: t.isMit })),
    mits: open().filter(t => t.isMit).map(t => t.title), overdueTitles: open().filter(t => t.due && t.due < today).map(t => t.title),
    habits: habits.map(h => h.name), habitsLeft: habits.filter(h => !h.done).map(h => h.name), habitsDone: habits.filter(h => h.done).length, habitsTotal: habits.length,
    streak: 4, level: 3, levelTitle: 'Rookie', xpToday: 40, focusToday: 25, focusRunning: false,
    nextReminder: reminders[0] ? { title: reminders[0].title, at: reminders[0].at } : undefined, goals: [], docs: 0, memories: mem.length,
  }),
  runTool: async (name, a: any) => {
    log.push(`${name} ${JSON.stringify(a)}`);
    const find = (r: string) => tasks.find(t => t.id === r) ?? tasks.find(t => t.title.toLowerCase().includes(String(r).toLowerCase()));
    switch (name) {
      case 'add_task': { const t = { id: 't' + ++n, title: a.title, due: a.due, urgent: !!a.urgent, important: true, isMit: !!a.mit, status: 'todo' }; tasks.push(t); return { ok: true, result: `Added: ${t.title}` }; }
      case 'complete_task': { const t = find(a.task); if (!t) return { ok: false, result: 'No task found' }; t.status = 'done'; return { ok: true, result: 'Completed' }; }
      case 'delete_task': { const t = find(a.task); if (t) tasks.splice(tasks.indexOf(t), 1); return { ok: true, result: 'Deleted' }; }
      case 'update_task': { const t = find(a.task); if (t) { if (a.due) t.due = a.due; if (a.mit !== undefined) t.isMit = a.mit; } return { ok: true, result: 'Updated' }; }
      case 'set_mits': { for (const t of tasks) t.isMit = (a.tasks as string[]).includes(t.id); return { ok: true, result: 'MITs set' }; }
      case 'schedule_reminder': { reminders.push({ title: a.text, at: new Date(a.when.replace(' ', 'T')).getTime() }); return { ok: true, result: 'Reminder set' }; }
      case 'log_habit': { const h = habits.find(x => x.name.toLowerCase().includes(String(a.habit).toLowerCase())); if (h) h.done = true; return { ok: true, result: 'Logged' }; }
      case 'add_habit': habits.push({ name: a.name, done: false }); return { ok: true, result: 'Habit added' };
      case 'remember': mem.push({ text: a.fact, kind: a.kind }); return { ok: true, result: 'Remembered' };
      case 'list_tasks': return { ok: true, result: open().map(t => `• ${t.title}`).join('\n') };
      case 'start_focus': return { ok: true, result: `Focus started ${a.minutes ?? 25} min` };
      case 'battery_status': return { ok: true, result: 'Battery is at 62% and not charging.' };
      case 'my_progress': return { ok: true, result: 'Level 3 Rookie · 40 XP today · 4-day streak' };
      case 'habit_report': return { ok: true, result: habits.map(h => `${h.done ? '✓' : '○'} ${h.name}`).join('\n') };
      default: return { ok: true, result: `${name} done` };
    }
  },
  memorySearch: async q => {
    const w = q.toLowerCase().replace(/user's|user/g, '').split(/\s+/).filter(x => x.length > 2);
    return mem.map(m => ({ text: m.text, score: w.length ? w.filter(x => m.text.toLowerCase().includes(x)).length / w.length : 0.1 })).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  },
  memoryTop: async () => mem.map(m => ({ text: m.text, score: 1 })),
  memoryAdd: async (text, kind) => { mem.push({ text, kind }); },
  librarySearch: async () => [],
  updateProfile: async p => { if (p.userName) userName = p.userName; },
  online: () => true,
  http: async (url: string) => {
    const u = decodeURIComponent(url);
    if (u.includes('api.duckduckgo.com')) {
      if (/capital of (japan|france)/i.test(u)) return JSON.stringify({ AbstractText: 'Tokyo is the capital and most populous city of Japan. It lies on the Pacific coast of Honshu.', AbstractSource: 'Wikipedia', AbstractURL: 'https://en.wikipedia.org/wiki/Tokyo' });
      return JSON.stringify({});
    }
    if (u.includes('wttr.in')) return JSON.stringify({ current_condition: [{ temp_C: '24', temp_F: '75', FeelsLikeC: '25', FeelsLikeF: '77', weatherDesc: [{ value: 'Partly cloudy' }] }], nearest_area: [{ areaName: [{ value: 'Mbabane' }] }], weather: [{ mintempC: '14', maxtempC: '27', mintempF: '57', maxtempF: '81', hourly: [{ chanceofrain: '20' }, { chanceofrain: '40' }] }] });
    return '<html></html>';
  },
  kvGet: async () => undefined, kvSet: async () => undefined, now: () => new Date(), country: () => 'SZ',
  moodHistory: () => [{ date: yesterday, mood: 3, energy: 3 }],
};

const scenario = [
  'good evening', 'how are you', 'what do I have on today', 'what should I focus on', 'ok start with the report', 'mark the report as done',
  'add pick up dry cleaning tomorrow', 'remind me to call mom in 20 minutes', 'what is the capital of japan', 'and what is the weather like', 'thanks',
  "I'm a bit stressed about work", 'my sister Thandi is visiting this weekend', 'what is my sister called', 'what did I say about work', 'tell me a joke', 'another one',
  'I meditated', 'how many habits have I done', 'set an alarm for 6am', 'who won the world cup in 2022', 'what time is it', 'good night',
];

(async () => {
  const eng = new ReflexEngine(host);
  await eng.init();
  const msgs = process.argv.slice(2).length ? process.argv.slice(2) : scenario;
  for (const m of msgs) {
    log.length = 0;
    const r = await eng.respond(m);
    console.log(`\n\x1b[36mYOU:\x1b[0m ${m}\n\x1b[33mJARVIS:\x1b[0m ${r.text}\n   \x1b[2m[${r.intent} ${r.confidence.toFixed(2)} ${r.ms}ms${log.length ? ' · ' + log.join(' | ') : ''}]\x1b[0m`);
  }
})();
