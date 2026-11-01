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
  profile: () => ({ honorific: 'sir', userName, name: 'Jarvis', role: 'butler', traits: { warmth: 55, humor: 55, sarcasm: 45, formality: 85, directness: 75, verbosity: 35, enthusiasm: 35, playfulness: 25, curiosity: 35, toughLove: 45, emotional: 40, proactivity: 70 }, emoji: 'none', language: 'british', swearing: 'none', catchphrases: '', likes: '' }),
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


// ---------- thousand-text generator (seeded) ----------
let seed = 777123;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
type Case = { text: string; cls: string; want?: RegExp };
const cases: Case[] = [];
const add = (cls: string, text: string, want?: RegExp) => cases.push({ cls, text, want });
const when = ['', ' today', ' yesterday', ' last night', ' this morning', ' earlier', ' on Saturday'];

const pastActs = ['went to the market','watched a documentary','saw a great film','read a chapter of my novel','ate a huge breakfast','cooked jollof rice','baked scones','visited my aunt','met an old colleague','called my cousin','ran around the block','swam 20 laps','cycled to work','lifted weights','played football with the guys','bought a new jacket','ordered takeaway','flew to Joburg','drove to Piggs Peak','slept for ten hours','cleaned my room','painted the fence','fixed my bike','wrote a long email','studied for my test','attended a webinar','presented to the board','went to church','took my mum to the clinic','walked the dog','listened to a podcast','tried a new cafe','made soup','hiked the mountain','joined a book club','adopted a kitten','signed up for a course','moved to a new flat','went fishing','saw my dentist'];
const mishaps = ['forgot my umbrella','lost my phone charger','dropped my plate','spilled coffee on my shirt','missed the bus','burnt the rice','deleted a file by mistake','locked my keys in the car','overslept','ran out of airtime','got a speeding fine','left my bag at the shop','broke a glass'];
const people = ['mum','dad','sister','brother','boss','manager','friend','girlfriend','boyfriend','wife','husband','teacher','neighbour','cousin','flatmate','colleague','gran','uncle','landlord','son','daughter'];
const personVerbs = ['is being annoying','called me this morning','is visiting on Friday','got a new job','keeps interrupting me','forgot my birthday','is sick','sent me a lovely message','is getting married','is moving abroad','gave me great advice','is stressing me out','surprised me with flowers','won an award','is always late','cooked for me','is not talking to me','praised my work'];
const devices = ['phone','laptop','wifi','car','tablet','printer','tv','charger','headphones','router','computer'];
const problems = ['keeps freezing','is so slow','stopped working','is overheating','crashed again','will not connect','is acting up','died','keeps restarting','is making a weird noise'];
const parts = ['back','head','knee','stomach','throat','shoulder','tooth','neck','ankle','eyes'];
const plans = ['learn the piano','start running','take a pottery class','read more books','get a dog','go back to school','save for a house','start a podcast','cook more at home','take a road trip','learn to code','meditate every day','visit Cape Town','write a book'];
const emos = ['sad','anxious','stressed','happy','excited','tired','lonely','angry','bored','overwhelmed','nervous','proud','frustrated','exhausted','motivated','worried'];
const wins = ['got promoted','passed my driving test','got accepted into university','won the competition','landed the job','graduated','got a raise','passed my exam'];
const tasksX = ['buy bread','call the plumber','pay the electricity bill','email Sam','book a haircut','renew my passport','water the plants','send the invoice','prepare slides','clean the car','submit the form','pick up the parcel'];
const times = ['5pm','7am','noon','8:30','tomorrow at 9','in 20 minutes','tonight at 8','on Friday','next Monday','in an hour'];
const apps = ['camera','calculator','settings','whatsapp','maps','youtube','gallery','clock','calendar','spotify','chrome'];
const places = ['Kenya','Japan','France','Brazil','Egypt','Canada','Australia','Ghana','Norway','Peru'];

for (let i = 0; i < 230; i++) { const t = pick(['I ', 'I just ']) + pick(pastActs) + pick(when); add('story', t); }
for (let i = 0; i < 50; i++) add('story', 'I ' + pick(mishaps) + pick(when));
for (let i = 0; i < 90; i++) add('story', 'my ' + pick(people) + ' ' + pick(personVerbs));
for (let i = 0; i < 70; i++) add('story', 'my ' + pick(devices) + ' ' + pick(problems));
for (let i = 0; i < 30; i++) add('story', 'my ' + pick(parts) + ' ' + pick(['hurts','is aching','is killing me','is sore']));
for (let i = 0; i < 50; i++) add('story', pick(["I think I'll ", 'I might ', "I'm thinking of trying to ", 'maybe I should ']) + pick(plans));
for (let i = 0; i < 30; i++) add('win', 'I ' + pick(wins), /^(feel\.win|chat\.narrate)$/);
for (let i = 0; i < 60; i++) add('feel', pick(["I feel ", "I'm so ", "I am really ", "feeling "]) + pick(emos), /^(feel\.|well\.|mind\.|chat\.narrate)/);
for (let i = 0; i < 40; i++) add('cmd', `add ${pick(tasksX)}`, /^task\.add$/);
for (let i = 0; i < 40; i++) add('cmd', `remind me to ${pick(tasksX)} ${pick(times)}`, /^reminder\.add$/);
for (let i = 0; i < 20; i++) add('cmd', `set an alarm for ${pick(times)}`, /^alarm\.set$/);
for (let i = 0; i < 20; i++) add('cmd', `set a timer for ${1 + Math.floor(rnd() * 59)} minutes`, /^timer\.set$/);
for (let i = 0; i < 25; i++) add('cmd', `open ${pick(apps)}`, /^phone\.open$/);
for (let i = 0; i < 20; i++) add('cmd', `what is ${5 + Math.floor(rnd() * 90)} times ${2 + Math.floor(rnd() * 40)}`, /^info\.calc$/);
for (let i = 0; i < 20; i++) add('cmd', pick(['what is the capital of ', 'what is the population of ', 'tell me about ']) + pick(places), /^(research|info)\./);
for (let i = 0; i < 40; i++) add('chat', pick(['hello','hi there','good morning','good evening','thanks a lot','thank you','cheers','bye','see you later','good night','how are you','what is your name','who are you','tell me a joke','tell me a fun fact','you are awesome','that was funny','ok','cool','lol']), /^(chat\.|fun\.|persona\.|meta\.)/);
for (let i = 0; i < 20; i++) add('query', pick(['what do I have today','what are my tasks','show my habits','what is on my calendar','what did I do yesterday','what is my top priority','any overdue tasks']), /^(task\.|plan\.|habit\.|calendar\.|memory\.|focus\.|chat\.)/);

(async () => {
  const eng = new ReflexEngine(host);
  await eng.init();
  const bad: { c: Case; intent: string; text: string }[] = [];
  const glitch = /undefined|NaN|\{|\}|#\w|_[a-z]+ done|\[object|Compose_|Learned\.|now means/;
  const ACTION = /^(task|habit|memory\.forget|memory\.remember|calendar|comm|phone|alarm|reminder|timer|health|note|journal|goal|focus|plan\.|info\.web)/;
  let i = 0;
  for (const c of cases) {
    log.length = 0;
    (eng as any).ds.pending = undefined; (eng as any).ds.recentIntents = []; (eng as any).ds.lastIntent = undefined;
    const r = await eng.respond(c.text);
    let ok = true;
    if (c.cls === 'story') ok = !ACTION.test(r.intent) && r.intent !== 'fallback' && !/^research/.test(r.intent) && !/^(chat\.back|chat\.morning|fun\.)/.test(r.intent);
    else if (c.want) ok = c.want.test(r.intent);
    if (glitch.test(r.text) || /\s{2,}/.test(r.text) && !/\n/.test(r.text)) ok = false;
    if (!ok) bad.push({ c, intent: r.intent, text: r.text });
    i++;
  }
  const byCls: Record<string, [number, number]> = {};
  for (const c of cases) byCls[c.cls] = [0, (byCls[c.cls]?.[1] ?? 0) + 1];
  for (const b of bad) byCls[b.c.cls][0]++;
  console.log(`TOTAL ${cases.length} · failures ${bad.length}`);
  for (const [k, v] of Object.entries(byCls)) console.log(`  ${k}: ${v[0]} bad / ${v[1]}`);
  const seen = new Set<string>();
  for (const b of bad) { const key = b.c.text; if (seen.has(key)) continue; seen.add(key); console.log(`✗ [${b.c.cls}] ${b.c.text}  → ${b.intent}: ${b.text.replace(/\n/g, ' ').slice(0, 110)}`); }
})();
