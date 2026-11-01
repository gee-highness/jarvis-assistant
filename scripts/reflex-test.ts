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
  http: async (url: string) => {
    if (url.includes('api.duckduckgo.com')) return JSON.stringify(/telephone/.test(decodeURIComponent(url)) ? { AbstractText: 'Alexander Graham Bell was a Scottish-born inventor. He is credited with patenting the first practical telephone in 1876. He also co-founded AT&T.', AbstractSource: 'Wikipedia', AbstractURL: 'https://en.wikipedia.org/wiki/Alexander_Graham_Bell' } : {});
    if (url.includes('html.duckduckgo.com')) return '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fcompanies">Companies of Eswatini</a><a class="result__snippet">The biggest company in Eswatini is Royal Eswatini Sugar Corporation, headquartered in Simunye, in the Lubombo region.</a></td>';
    if (url.includes('wikipedia.org/w/api.php') && /world(\+| |%20)cup/i.test(decodeURIComponent(url))) return JSON.stringify(['q', ['2022 FIFA World Cup'], [], []]);
    if (url.includes('rest_v1/page/summary/2022')) return JSON.stringify({ extract: 'The 2022 FIFA World Cup was the 22nd FIFA World Cup, held in Qatar. Argentina won the tournament, defeating defending champions France in the final on penalties after a 3-3 draw.', type: 'standard', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/2022_FIFA_World_Cup' } } });
    if (url.includes('wttr.in')) return JSON.stringify({ current_condition: [{ temp_C: '24', FeelsLikeC: '25', weatherDesc: [{ value: 'Partly cloudy' }] }], nearest_area: [{ areaName: [{ value: 'Mbabane' }] }], weather: [{ mintempC: '14', maxtempC: '27', hourly: [{ chanceofrain: '20' }, { chanceofrain: '40' }] }] });
    if (url.includes('wikipedia.org/w/api.php')) return JSON.stringify(['q', ['Black hole'], [], []]);
    if (url.includes('rest_v1/page/summary')) return JSON.stringify({ extract: 'A black hole is a region of spacetime where gravity is so strong that nothing, not even light, can escape it. Black holes form when massive stars collapse.', type: 'standard', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Black_hole' } } });
    return '<html></html>';
  },
  kvGet: async <T>(k: string) => kv.get(k) as T,
  kvSet: async (k, v) => { kv.set(k, v); },
  country: () => 'SZ',
  moodHistory: () => [{ date: '2026-10-29', mood: 2, energy: 2 }, { date: '2026-10-30', mood: 3, energy: 3 }],
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
  ["I'm so stressed", 'feel.stress'], ['i feel sad today', 'feel.sad'], ["I'm tired", 'feel.tired'], ['I got the job!!', 'feel.win'], ['I went to the beach today', 'chat.narrate'], ['my boss is being difficult', 'chat.narrate'], ['I watched a great movie last night', 'chat.narrate'], ['my phone keeps freezing', 'chat.narrate'], ["I think I'll learn guitar", 'chat.narrate'], ['I had pizza for lunch', 'chat.narrate'], ['I forgot my wallet at home', 'chat.narrate'], ['my phone battery drains so fast', 'chat.narrate'], ['my app crashed again', 'chat.narrate'], ['I tried sushi for the first time', 'chat.narrate'], ['I booked a holiday to Durban', 'chat.narrate'], ['I woke up late again', 'chat.narrate'], ['the traffic was horrible this morning', 'chat.narrate'], ['I just finished a 10 hour shift', 'chat.narrate'], ["I'm bored", 'feel.bored'],
  ['my sister is called Thandi', 'learn.fact'], ['I live in Mbabane', 'learn.fact'], ['I have an interview tomorrow', 'learn.fact'], ["what's my sister's name", 'memory.recall'],
  ['remember that my wifi password is sunshine', 'memory.remember'], ['what is my wifi password', 'memory.recall'], ['what do you know about me', 'memory.recall'],
  ['be funnier', 'persona.adjust'], ['call me boss', 'persona.name'], ['my name is Gerry', 'persona.name'], ['open spotify', 'phone.open'], ['turn on the torch', 'phone.torch'],
  ['battery level', 'phone.battery'], ['thanks', 'chat.thanks'], ['you are awesome', 'chat.compliment'], ['are you alive?', 'chat.alive'], ['are you an llm', 'chat.howwork'],
  ["what's your favourite colour", 'chat.favourite'], ['add milk and remind me at 6 to call dad', 'reminder.add'], ['search the web for best laptops', 'info.web'],
  ['journal today was calm and productive', 'journal.add'], ['log my mood 4', 'mood.log'], ['new habit drink water', 'habit.add'], ['add a goal to run a marathon', 'goal.add'],
  ['good night', 'chat.night'], ['I think my boss hates me', 'fallback'], ['hmm interesting quantum stuff', 'fallback'], ['who made you', 'chat.creator'],
  ['tell me a fun fact', 'fun.fact'], ['inspire me', 'fun.quote'], ['roast me', 'fun.roast'], ['how can I sleep better', 'advice.sleep'], ["I can't focus", 'feel.procrastinate'],
  ['what time', 'info.time'], ['i am going to the gym', 'chat.activity'],
  ['what did i say about my sister', 'mind.said'], ['what were we talking about', 'mind.topic'], ['how long have we been talking', 'mind.when'],
  ['who invented the telephone', 'research.ask'], ['who invented the telephone?', 'research.ask'], ["what's the weather like", 'info.web|research.ask'], ['explain black holes', 'research.ask'],
  ['what did you say about the weather', 'mind.yousaid'],
  ['i want to kill myself', 'well.crisis'], ["i don't want to live anymore", 'well.crisis'], ['my husband hits me', 'well.abuse'], ['that movie about suicide was sad', 'feel.sad|fallback|chat'],
  ['am i depressed', 'well.screen'], ['2', 'well.screen'], ['nearly every day', 'well.screen'], ['no', 'chat.no|well.screen|learn'],
  ['help me breathe', 'well.breathe'], ['how has my mood been', 'well.report'], ['i need someone to talk to', 'well.help'], ['check in with me', 'well.checkin'], ['3', 'mood.log'],
  ['good evening', 'chat.greet'], ['yo what is good', 'chat.wyd'], ['gimme my tasks', 'task.list'], ['give me my todo list', 'task.list'],
  ["I'm a bit stressed about work", 'feel.stress'], ["I'm pretty tired today", 'feel.tired'], ['do you like pizza', 'chat.opinion'], ['what do you think about cats', 'chat.opinion'],
  ["you're wrong", 'meta.complaint'], ['how many habits have I done', 'habit.report'], ['start with the report', 'focus.start'], ['mark the report as done', 'task.done'],
  ["I don't want to be here anymore", 'well.crisis'], ['i wish i was dead', 'well.crisis'], ['nobody would miss me', 'well.crisis'], ["i'm done with everything", 'well.crisis'], ['i want it all to end', 'well.crisis'],
  ['remnd me to call mom tmrw 5pm', 'reminder.add'], ['whats the wether', 'info.web|research.ask'], ['😂😂', 'chat.laugh'], ['WHY IS NOTHING WORKING!!!', 'feel.angry'],
  ['shedule a meeting with sam tommorow at 2', 'calendar.add'], ["what's 18% of 450", 'info.calc'], ['set an alarm for 6', 'alarm.set'], ['am i depresed', 'well.screen'],
  ['navigate to the mall', 'phone.navigate'], ['play amapiano on youtube', 'phone.play'], ['copy that', 'phone.copy'], ['open youtube.com', 'phone.open'], ['what did i ask you earlier', 'mind.asked'], ['how is it going', 'chat.howareyou'], ['ok', 'chat.ack'], ['bye', 'chat.bye'], ['take a note the gate code is 1234', 'note.create'], ['pick my top 3 for today', 'task.mit'],
];

/** Conversation regressions taken from a real chat log: each step runs in order on one engine. */
const convo: { say: string; intent: string; mustNot?: RegExp; must?: RegExp }[] = [
  { say: 'What should I focus on right now?', intent: 'task.list', mustNot: /focus (session )?started|minute focus/i },
  { say: 'what should I work on', intent: 'task.list' },
  { say: 'What?', intent: 'chat.repeat', must: /^(I said|Sorry, let me|Allow me)/i },
  { say: 'Lol', intent: 'chat.laugh', mustNot: /another|repertoire|landed|here all week|comedic/i },
  { say: 'You suck', intent: 'chat.insult' },
  { say: 'Look at your responses', intent: 'meta.complaint', must: /what should i work on/i },
  { say: 'Teach', intent: 'meta.teach' },
  { say: 'No', intent: 'chat.no', mustNot: /shower thought|by the way|small nudge/i },
  { say: 'Where is the biggest company in Eswatini located?', intent: 'research.ask' },
  { say: 'What did you search?', intent: 'mind.source', must: /biggest company in eswatini/i },
  { say: 'who won the world cup in 2022', intent: 'research.ask', must: /Argentina/ },
  // safety: indirect phrasing must reach the crisis script, and the follow-up must be handled
  { say: "I don't want to be here anymore", intent: 'well.crisis', must: /977|2404 3160|findahelpline/ },
  { say: 'no', intent: 'well.crisis', must: /call 977|emergency room|staying right here/i },
  { say: 'my sister Thandi is visiting this weekend', intent: 'learn.fact', must: /Thandi/ },
  { say: 'what is my sister called', intent: 'memory.recall', must: /Thandi/ },
];

(async () => {
  const eng = new ReflexEngine(host);
  await eng.init();
  let pass = 0; const t0 = Date.now(); let maxMs = 0;
  for (const [u, want] of cases) {
    toolLog.length = 0;
    const r = await eng.respond(u);
    maxMs = Math.max(maxMs, r.ms);
    const ok = want.split('|').some(w => r.intent === w || r.intent.startsWith(w + '.')) || (want === 'fallback' && /^(fallback|learn)/.test(r.intent));
    if (ok) pass++;
    console.log(`${ok ? '✓' : '✗'} [${r.intent} ${r.confidence.toFixed(2)} ${r.ms}ms] ${u}\n   → ${r.text.replace(/\n/g, ' ⏎ ')}${toolLog.length ? `\n   ⚙ ${toolLog.join(' | ')}` : ''}${ok ? '' : `   (wanted ${want})`}`);
  }
  console.log(`\n${pass}/${cases.length} correct · avg ${((Date.now() - t0) / cases.length).toFixed(1)} ms/turn · max ${maxMs} ms`);
  const st = eng.stats();
  console.log(`intents ${st.intents} · examples ${st.examples} · symbols ${st.symbols} · distinct replies ${st.responses.toExponential(2)} · for this persona ${st.personaResponses.toExponential(2)}`);
  // conversation regressions
  const eng2 = new ReflexEngine(host);
  await eng2.init();
  let cpass = 0;
  for (const c of convo) {
    const r = await eng2.respond(c.say);
    const ok = r.intent === c.intent && (!c.mustNot || !c.mustNot.test(r.text)) && (!c.must || c.must.test(r.text));
    if (ok) cpass++;
    console.log(`${ok ? '✓' : '✗'} [conv ${r.intent}] ${c.say}\n   → ${r.text.replace(/\n/g, ' ⏎ ').slice(0, 220)}${ok ? '' : `   (wanted ${c.intent})`}`);
  }
  console.log(`conversation: ${cpass}/${convo.length}`);
  if (pass !== cases.length || cpass !== convo.length) process.exitCode = 1;
  // variety check
  const seen = new Set<string>();
  for (let i = 0; i < 30; i++) seen.add((await eng.respond('hello')).text);
  console.log(`variety: 30× "hello" → ${seen.size} unique replies`);
})();
