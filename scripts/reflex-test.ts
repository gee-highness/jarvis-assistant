/* Headless Reflex test: node scripts/reflex-test.mjs (bundled by esbuild). Mock host, no Angular. */
import { ReflexEngine } from '../src/app/core/reflex/engine';
import type { HostState, ReflexHost } from '../src/app/core/reflex/types';

const kv = new Map<string, unknown>();
const mem: { text: string; kind: string }[] = [];
const tasks = [
  { id: 't1', title: 'Finish the report', due: '2020-01-01', urgent: true, important: true, isMit: true },
  { id: 't2', title: 'Call mom', due: undefined, urgent: false, important: true, isMit: false },
  { id: 't3', title: 'Buy milk', due: undefined, urgent: false, important: false, isMit: false },
];
const toolLog: string[] = [];
const host: ReflexHost = {
  profile: () => ({ honorific: 'sir', userName: '', name: 'Jarvis', role: 'butler', traits: { warmth: 55, humor: 55, sarcasm: 45, formality: 85, directness: 75, verbosity: 35, enthusiasm: 35, playfulness: 25, curiosity: 35, toughLove: 45, emotional: 40, proactivity: 70 }, emoji: 'none', language: 'british', swearing: 'none', catchphrases: '', likes: '' }),
  state: (): HostState => ({ open: tasks.length, overdue: 1, dueToday: 0, doneToday: 2, inbox: 1, tasks: tasks as any, mits: ['Finish the report'], overdueTitles: ['Finish the report'], habits: ['Meditate', 'Gym', 'Read 20 pages'], habitsLeft: ['Gym'], habitsDone: 2, habitsTotal: 3, streak: 4, level: 3, levelTitle: 'Rookie', xpToday: 40, focusToday: 50, focusRunning: false, goals: [], docs: 0, memories: mem.length }),
  runTool: async (name, args) => { toolLog.push(`${name} ${JSON.stringify(args)}`); return { ok: true, result: `${name} ok` }; },
  memorySearch: async (q) => mem.map(m => ({ text: m.text, score: q.split(' ').filter(w => w.length > 2 && m.text.toLowerCase().includes(w.toLowerCase().replace("user's", 'user'))).length / Math.max(1, q.split(' ').length) })).filter(x => x.score > 0).sort((a, b) => b.score - a.score),
  memoryAdd: async (text, kind) => { mem.push({ text, kind }); },
  librarySearch: async () => [],
  updateProfile: async () => undefined,
  online: () => true,
  kvGet: async <T>(k: string) => kv.get(k) as T,
  kvSet: async (k, v) => { kv.set(k, v); },
  now: () => new Date(),
};

const cases: [string, string][] = [
  ['hey jarvis', 'chat.greet'], ['good morning', 'chat.morning'], ['how are you?', 'chat.howareyou'], ['what can you do', 'chat.capabilities'],
  ['add buy eggs tomorrow', 'task.add'], ['I need to pay rent on friday', 'task.add'], ['remind me to call mom at 5pm', 'reminder.add'],
  ['remind me in 20 minutes to check the oven', 'reminder.add'], ['set an alarm for 6:30am', 'alarm.set'], ['wake me up at 7', 'alarm.set'],
  ['set a timer for 10 minutes', 'timer.set'], ["what's on my list today", 'task.list'], ['what should I do next?', 'task.list'], ['show overdue tasks', 'task.list'],
  ['mark buy milk as done', 'task.done'], ['I finished the report', 'task.done'], ['move call mom to tomorrow', 'task.move'], ['start a 25 minute focus', 'focus.start'],
  ['I meditated', 'habit.log'], ['log gym', 'habit.log'], ['briefing', 'plan.briefing'], ['plan my day', 'plan.day'], ['how am I doing', 'progress.stats'],
  ["what's 15% of 240", 'info.calc'], ['12 times 7', 'info.calc'], ['convert 5 km to miles', 'info.convert'], ['how many days until christmas', 'info.days'],
  ['what time is it', 'info.time'], ["what's the date", 'info.date'], ['tell me a joke', 'fun.joke'], ['another one', 'fun.another'], ['tell me a riddle', 'fun.riddle'],
  ['a piano', 'fun.riddle'], ['tell me a story', 'fun.story'], ['write me a poem', 'fun.poem'], ['flip a coin', 'fun.coin'], ['roll a d20', 'fun.dice'], ['pizza or burgers?', 'fun.choose'],
  ["I'm so stressed", 'feel.stress'], ['i feel sad today', 'feel.sad'], ["I'm tired", 'feel.tired'], ['I got the job!!', 'feel.win'], ["I'm bored", 'feel.bored'],
  ['my sister is called Thandi', 'learn.fact'], ['I live in Mbabane', 'learn.fact'], ['I have an interview tomorrow', 'learn.fact'], ["what's my sister's name", 'memory.recall'],
  ['remember that my wifi password is sunshine', 'memory.remember'], ['what is my wifi password', 'memory.recall'], ['what do you know about me', 'memory.recall'],
  ['be funnier', 'persona.adjust'], ['call me boss', 'persona.name'], ['my name is Gerry', 'persona.name'], ['open spotify', 'phone.open'], ['turn on the torch', 'phone.torch'],
  ['battery level', 'phone.battery'], ['thanks', 'chat.thanks'], ['you are awesome', 'chat.compliment'], ['are you alive?', 'chat.alive'], ['are you an llm', 'chat.howwork'],
  ["what's your favourite colour", 'chat.favourite'], ['add milk and remind me at 6 to call dad', 'reminder.add'], ['search the web for best laptops', 'info.web'],
  ['journal today was calm and productive', 'journal.add'], ['log my mood 4', 'mood.log'], ['new habit drink water', 'habit.add'], ['add a goal to run a marathon', 'goal.add'],
  ['good night', 'chat.night'], ['I think my boss hates me', 'fallback'], ['hmm interesting quantum stuff', 'fallback'], ['who made you', 'chat.creator'],
  ['tell me a fun fact', 'fun.fact'], ['inspire me', 'fun.quote'], ['roast me', 'fun.roast'], ['how can I sleep better', 'advice.sleep'], ["I can't focus", 'feel.procrastinate'],
  ['what time', 'info.time'], ['ok', 'chat.ack'], ['bye', 'chat.bye'], ['take a note the gate code is 1234', 'note.create'], ['pick my top 3 for today', 'task.mit'],
];

(async () => {
  const eng = new ReflexEngine(host);
  await eng.init();
  let pass = 0; const t0 = Date.now(); let maxMs = 0;
  for (const [u, want] of cases) {
    toolLog.length = 0;
    const r = await eng.respond(u);
    maxMs = Math.max(maxMs, r.ms);
    const ok = r.intent === want || (want === 'fallback' && /^(fallback|learn)/.test(r.intent));
    if (ok) pass++;
    console.log(`${ok ? '✓' : '✗'} [${r.intent} ${r.confidence.toFixed(2)} ${r.ms}ms] ${u}\n   → ${r.text.replace(/\n/g, ' ⏎ ')}${toolLog.length ? `\n   ⚙ ${toolLog.join(' | ')}` : ''}${ok ? '' : `   (wanted ${want})`}`);
  }
  console.log(`\n${pass}/${cases.length} correct · avg ${((Date.now() - t0) / cases.length).toFixed(1)} ms/turn · max ${maxMs} ms`);
  const st = eng.stats();
  console.log(`intents ${st.intents} · examples ${st.examples} · symbols ${st.symbols} · distinct replies ${st.responses.toExponential(2)} · for this persona ${st.personaResponses.toExponential(2)}`);
  // variety check
  const seen = new Set<string>();
  for (let i = 0; i < 30; i++) seen.add((await eng.respond('hello')).text);
  console.log(`variety: 30× "hello" → ${seen.size} unique replies`);
})();
