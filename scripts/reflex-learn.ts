/* Reflex self-learning test: confident wording is learned unprompted, corrections unlearn and re-teach,
 * trust is earned, backups round-trip. Exit code 1 on any failure. */
import { ReflexEngine } from '../src/app/core/reflex/engine';
import type { HostState, ReflexHost } from '../src/app/core/reflex/types';
const RealDate = Date;
const DAY = 86_400_000;
interface World { tasks: any[]; habits: { name: string; done: boolean }[]; reminders: { title: string; at: number }[]; mem: { text: string; kind: string }[]; userName: string; online: boolean; kv: Map<string, unknown>; calls: string[]; httpCalls: string[]; }
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const world = (): World => ({ tasks: [{ id: 't2', title: 'Call mom', urgent: false, important: true, isMit: false, status: 'todo' }], habits: [{ name: 'Gym', done: false }], reminders: [], mem: [], userName: 'Gerry', online: false, kv: new Map(), calls: [], httpCalls: [] });
function makeHost(w: World): ReflexHost {
  const open = () => w.tasks.filter(t => t.status === 'todo');
  let n = 100;
  return {
    profile: () => ({ honorific: 'sir', userName: w.userName, name: 'Jarvis', role: 'butler', traits: { warmth: 55, humor: 55, sarcasm: 45, formality: 85, directness: 75, verbosity: 35, enthusiasm: 35, playfulness: 25, curiosity: 35, toughLove: 45, emotional: 40, proactivity: 70 }, emoji: 'none', language: 'british', swearing: 'none', catchphrases: '', likes: '' }),
    petName: () => 'Comet',
  petAction: async k => ({ ok: true, line: `pet:${k}` }),
  state: (): HostState => {
      const today = ymd(new Date());
      return {
        open: open().length, overdue: open().filter(t => t.due && t.due < today).length, dueToday: open().filter(t => t.due === today).length, doneToday: w.tasks.filter(t => t.status === 'done').length, inbox: 0,
        tasks: open().map(t => ({ id: t.id, title: t.title, due: t.due, urgent: t.urgent, important: t.important, isMit: t.isMit })),
        mits: open().filter(t => t.isMit).map(t => t.title), overdueTitles: open().filter(t => t.due && t.due < today).map(t => t.title),
        habits: w.habits.map(h => h.name), habitsLeft: w.habits.filter(h => !h.done).map(h => h.name), habitsDone: w.habits.filter(h => h.done).length, habitsTotal: w.habits.length,
        streak: 4, level: 3, levelTitle: 'Rookie', xpToday: 40, focusToday: 25, focusRunning: false, nextReminder: w.reminders[0] ? { title: w.reminders[0].title, at: w.reminders[0].at } : undefined, goals: [], docs: 0, memories: w.mem.length,
      };
    },
    runTool: async (name, a: any) => {
      w.calls.push(name);
      const find = (r: string) => w.tasks.find(t => t.id === r) ?? w.tasks.find(t => t.title.toLowerCase().includes(String(r).toLowerCase()));
      switch (name) {
        case 'add_task': w.tasks.push({ id: 't' + ++n, title: a.title, due: a.due, urgent: !!a.urgent, important: true, isMit: !!a.mit, status: 'todo' }); return { ok: true, result: 'Added' };
        case 'complete_task': { const t = find(a.task); if (!t) return { ok: false, result: 'No task' }; t.status = 'done'; return { ok: true, result: 'Done' }; }
        case 'delete_task': { const t = find(a.task); if (t) w.tasks.splice(w.tasks.indexOf(t), 1); return { ok: true, result: 'Deleted' }; }
        case 'update_task': { const t = find(a.task); if (t) { if (a.due) t.due = a.due; if (a.mit !== undefined) t.isMit = a.mit; } return { ok: true, result: 'Updated' }; }
        case 'set_mits': for (const t of w.tasks) t.isMit = (a.tasks as string[]).includes(t.id); return { ok: true, result: 'ok' };
        case 'schedule_reminder': w.reminders.push({ title: a.text, at: new RealDate(a.when.replace(' ', 'T')).getTime() }); return { ok: true, result: 'ok' };
        case 'log_habit': { const h = w.habits.find(x => x.name.toLowerCase().includes(String(a.habit).toLowerCase())); if (h) h.done = true; return { ok: true, result: 'ok' }; }
        case 'add_habit': w.habits.push({ name: a.name, done: false }); return { ok: true, result: 'ok' };
        case 'remember': w.mem.push({ text: a.fact, kind: a.kind }); return { ok: true, result: 'ok' };
        case 'battery_status': return { ok: true, result: 'Battery is at 62% and not charging.' };
        case 'habit_report': return { ok: true, result: w.habits.map(h => `${h.done ? '✓' : '○'} ${h.name}`).join('\n') };
        case 'list_reminders': return { ok: true, result: w.reminders.map(r => `• ${r.title}`).join('\n') || 'No reminders.' };
        default: return { ok: true, result: `${name} ok` };
      }
    },
    memorySearch: async q => {
      const words = q.toLowerCase().replace(/user's|user/g, '').split(/\s+/).filter(x => x.length > 2);
      return w.mem.map(m => ({ text: m.text, score: words.length ? words.filter(x => m.text.toLowerCase().includes(x)).length / words.length : 0.1 })).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
    },
    memoryTop: async () => w.mem.map(m => ({ text: m.text, score: 1 })),
    memoryAdd: async (text, kind) => { w.mem.push({ text, kind }); },
    librarySearch: async () => [], updateProfile: async p => { if (p.userName) w.userName = p.userName; },
    online: () => w.online,
    http: async (url: string) => {
      w.httpCalls.push(url);
      const u = decodeURIComponent(url);
      if (u.includes('api.duckduckgo.com')) {
        if (/telephone/i.test(u)) return JSON.stringify({ AbstractText: 'Alexander Graham Bell was a Scottish-born inventor. He is credited with patenting the first practical telephone in 1876.', AbstractSource: 'Wikipedia', AbstractURL: 'https://en.wikipedia.org/wiki/Alexander_Graham_Bell' });
        if (/capital of japan/i.test(u)) return JSON.stringify({ AbstractText: 'Tokyo is the capital and most populous city of Japan.', AbstractSource: 'Wikipedia', AbstractURL: 'https://en.wikipedia.org/wiki/Tokyo' });
        return JSON.stringify({});
      }
      if (u.includes('wttr.in')) return JSON.stringify({ current_condition: [{ temp_C: '24', FeelsLikeC: '25', weatherDesc: [{ value: 'Sunny' }] }], nearest_area: [{ areaName: [{ value: 'Mbabane' }] }], weather: [{ mintempC: '14', maxtempC: '27', hourly: [{ chanceofrain: '10' }] }] });
      return '<html></html>';
    },
    kvGet: async <T>(k: string) => w.kv.get(k) as T | undefined, kvSet: async (k, v) => { w.kv.set(k, JSON.parse(JSON.stringify(v))); },
    now: () => new Date(), country: () => 'SZ',
    moodHistory: () => [{ date: ymd(new Date(Date.now() - DAY)), mood: 3, energy: 3 }],
  };
}


const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let total = 0, failed = 0;
function check(name: string, ok: boolean, detail = '') { total++; if (!ok) { failed++; console.log(`✗ ${name} ${detail}`); } else console.log(`✓ ${name}`); }
async function fresh(w = world()) { const e = new ReflexEngine(makeHost(w)); await e.init(); return { w, e }; }
const has = (e: ReflexEngine, intent: string, text: string) => e.learnedPhrases().some((l: any) => l.intent === intent && l.text === text);
const PHRASE = 'could you put renew the licence on my todo list';

(async () => {
  // 1. novel but confident wording is learned with no "learn" command, after the user carries on
  {
    const { e } = await fresh();
    const r = await e.respond(PHRASE);
    check('probe wording routes to task.add', r.intent === 'task.add', r.intent);
    const before = e.learnedPhrases().length;
    await e.respond('thanks');
    const learned = e.learnedPhrases().filter((l: any) => l.intent === 'task.add').length;
    check('unchallenged wording is learned by itself', learned > 0 && before === 0, `before=${before} learned=${learned}`);
  }
  // 2. a correction does not learn the wrong meaning, and re-teaches the right one
  {
    const { e } = await fresh();
    const r = await e.respond(PHRASE);
    await e.respond('no i meant show my tasks');
    check('corrected wording is not kept as the wrong intent', !has(e, r.intent, 'could you put renew the licence on my todo list'));
    check('corrected wording now maps to what was meant', e.learnedPhrases().some((l: any) => l.text === 'could you put renew the licence on my todo list' && l.intent === 'task.list'));
  }
  // 3. a learned phrase that is later contradicted loses trust and is dropped
  {
    const { e } = await fresh();
    const eng = e as any;
    eng.learn('task.list', 'zzq blorp wibble', 0);
    check('direct learn stores the phrase', has(e, 'task.list', 'zzq blorp wibble'));
    eng.adjust('task.list', 'zzq blorp wibble', -2);
    check('trust below floor drops the phrase', !has(e, 'task.list', 'zzq blorp wibble'));
  }
  // 4. repeated success earns trust
  {
    const { e } = await fresh();
    const eng = e as any;
    eng.learn('task.list', 'qxv lorem ipsum', 0); eng.learn('task.list', 'qxv lorem ipsum', 0);
    check('learning the same phrase again earns hits', (e.learnedPhrases().find((l: any) => l.text === 'qxv lorem ipsum') as any)?.hits === 1);
  }
  // 5. persistence + backup round-trip
  {
    const w = world();
    const { e } = await fresh(w);
    (e as any).learn('task.list', 'my special phrase', 2);
    await sleep(1700);
    check('learned phrases are persisted', JSON.stringify(w.kv.get('learned') ?? []).includes('my special phrase'));
    const backup = e.exportLearned();
    const { e: e2 } = await fresh(world());
    check('fresh install starts empty', e2.learnedPhrases().length === 0);
    check('backup restores phrases', e2.importLearned(backup) === 1 && has(e2, 'task.list', 'my special phrase'));
    check('restoring twice adds nothing', e2.importLearned(backup) === 0);
    check('garbage backup is ignored', e2.importLearned('not json') === 0);
    const r = await e2.respond('my special phrase');
    check('restored phrase is understood', r.intent === 'task.list', r.intent);
  }
  console.log(`${total - failed}/${total} learning checks passed`);
  process.exit(failed ? 1 : 0);
})();
