/* Sweeps every personality preset with many phrasings and flags template glitches ({var} leaks, undefined, doubled punctuation, empty replies). Exit code 1 on any glitch. */
import { ReflexEngine } from '../src/app/core/reflex/engine';
import { PRESETS, LANGUAGES } from '../src/app/core/personality';
const today = new Date().toISOString().slice(0, 10);
const mk = (preset: any, lang: string, emoji: string) => {
  const tasks = [{ id: 't1', title: 'Finish report', due: '2020-01-01', urgent: true, important: true, isMit: true }, { id: 't2', title: 'Call mom', urgent: false, important: true, isMit: false }];
  const host: any = {
    profile: () => ({ honorific: 'sir', userName: 'Gerry', name: 'Jarvis', role: preset.p.role, traits: preset.p.traits, emoji, language: lang, swearing: preset.p.swearing, catchphrases: preset.p.catchphrases, likes: '' }),
    state: () => ({ open: 2, overdue: 1, dueToday: 0, doneToday: 3, inbox: 0, tasks, mits: ['Finish report'], overdueTitles: ['Finish report'], habits: ['Gym'], habitsLeft: ['Gym'], habitsDone: 0, habitsTotal: 1, streak: 5, level: 3, levelTitle: 'x', xpToday: 10, focusToday: 20, focusRunning: false, goals: [], docs: 0, memories: 1 }),
    runTool: async (n: string) => ({ ok: true, result: n + ' ok' }), memorySearch: async () => [], memoryAdd: async () => {}, librarySearch: async () => [], updateProfile: async () => {},
    online: () => false, kvGet: async () => undefined, kvSet: async () => {}, now: () => new Date(), country: () => 'SZ',
  };
  return new ReflexEngine(host);
};
const U = ['hello', 'good morning', 'how are you', 'thanks', 'bye', 'good night', 'what can you do', 'who are you', 'are you alive', 'tell me a joke', 'another one', 'tell me a story', 'write me a poem', 'tell me a fun fact', 'inspire me',
  'roast me', 'I am sad', 'I am stressed', 'I am tired', 'I am bored', 'I got the job', 'I am angry', 'I feel lonely', 'I cannot focus', 'what should I do next', 'add buy milk', 'add call sam tomorrow', 'remind me to stretch in 10 minutes',
  'set a timer for 5 minutes', 'start a focus session', 'I meditated', 'briefing', 'how am I doing', 'what time is it', 'what is 15 percent of 200', 'convert 5 km to miles', 'how many days until christmas', 'what do you know about me',
  'my dog is called Rex', 'what is my dog called', 'what did I say about my dog', 'do you like pizza', 'what is your favourite colour', 'help me breathe', 'check in with me', 'i love you', 'you suck', 'you are wrong', 'lol', 'ok', 'what?',
  'blah blah quantum', 'who is the president', 'tell me about yourself', 'be funnier', 'I think my boss hates me', 'I want to learn guitar', 'open spotify', 'turn on the torch', 'what is on my list'];
const BAD = [/\{[a-zA-Z]/, /#[a-zA-Z]/, /\bundefined\b/, /\bNaN\b/, /\[object/, /,\s*,/, /(^|[^.])\.\.(?!\.)/, /[ \t]{2,}/, /\s[,.!?](?=\s|$)/, /\b(?!blah|night|okay|sharp|aye|ha|no|so|bye|very|yes|really|go|well|got|had|that|boom|yeah|la|woof|bye)(\w+) \1\b/i, /\(\)/, /^\s*$/, /\bnull\b/];
(async () => {
  let n = 0, bad = 0; const seen = new Set<string>();
  const combos: [any, string, string][] = PRESETS.map(p => [p, p.p.language, p.p.emoji] as [any, string, string]);
  for (const [l] of LANGUAGES.slice(0, 7)) combos.push([PRESETS[0], l, 'some']);
  for (const [preset, lang, emoji] of combos) {
    const eng = mk(preset, lang, emoji); await eng.init();
    for (let rep = 0; rep < 3; rep++) for (const u of U) {
      const r = await eng.respond(u); n++;
      for (const re of BAD) if (re.test(r.text)) { const key = re.source + '|' + r.text.slice(0, 70); if (!seen.has(key)) { seen.add(key); bad++; if (bad <= 25) console.log(`[${preset.id}/${lang}] "${u}" → ${JSON.stringify(r.text.slice(0, 160))}  ⟵ ${re}`); } }
    }
  }
  console.log(`\nchecked ${n} replies across ${combos.length} personas · ${bad} distinct glitches`);
  if (bad) process.exitCode = 1;
})();
