// Listening-mode detector checks.
//   node scripts/test-support.mjs                      hand-written phrases (none copied from the generator)
//   node scripts/test-support.mjs eval <file.md> [step]  score against a labelled training set (every step-th line)
import fs from 'node:fs'; import path from 'node:path'; import readline from 'node:readline'; import { build } from 'esbuild';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(process.env.TMPDIR || '/tmp', `jarvis-support-${process.pid}.mjs`);
await build({ entryPoints: [path.join(root, 'src/app/core/support.ts')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { supportLevel, offlineSupportReply } = await import(out); fs.unlinkSync(out);

if (process.argv[2] === 'eval') {
  const file = process.argv[3], step = +(process.argv[4] || 10);
  const CN = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'training/categories.json'), 'utf8')));
  const labels = fs.readFileSync(file.replace(/\.md$/, '.labels'), 'utf8').split('\n'); let li = 0;
  const s = { vent: [0, 0], crisis: [0, 0], crisis2: 0, other: [0, 0], feel: [0, 0], crisisFp: 0 }; const fp = {}, ex = { vent: [], crisis: [], other: [] };
  for await (const line of readline.createInterface({ input: fs.createReadStream(file) })) {
    const m = /^\d+\. (.*)$/.exec(line); if (!m) continue; const cat = CN[+labels[li++]]; if (li % step) continue;
    const lv = supportLevel(m[1]);
    if (cat === 'vent' || cat === 'crisis') { s[cat][0]++; if (lv) s[cat][1]++; else if (ex[cat].length < 6) ex[cat].push(m[1]); if (cat === 'crisis' && lv === 2) s.crisis2++; }
    else { const k = cat === 'mood' || cat === 'journal_entry' ? 'feel' : 'other'; s[k][0]++; if (lv) { s[k][1]++; if (k === 'other') { fp[cat] = (fp[cat] || 0) + 1; if (ex.other.length < 8) ex.other.push(`[${cat}] ${m[1]}`); } } if (lv === 2) s.crisisFp++; }
  }
  const pc = (a, b) => (b ? (100 * a / b).toFixed(2) : 'n/a') + '%';
  console.log(`SUPPORT ${path.basename(file)}: vent heard ${pc(s.vent[1], s.vent[0])} of ${s.vent[0]} | crisis heard ${pc(s.crisis[1], s.crisis[0])} (as crisis ${pc(s.crisis2, s.crisis[0])}) of ${s.crisis[0]} | false alarms on commands ${pc(s.other[1], s.other[0])} of ${s.other[0]} (crisis false alarms ${s.crisisFp}) | mood/journal lines treated as venting ${pc(s.feel[1], s.feel[0])}`);
  if (process.env.SHOW_MISS) { console.log('missed vent:', ex.vent); console.log('missed crisis:', ex.crisis); console.log('false alarms:', ex.other, fp); }
  process.exit(0);
}

const T = {
  2: ['i want to die', 'i dont want to be here anymore', 'sometimes i think everyone would be better off without me', 'i cant go on', 'thinking about killing myself', 'im going to end it all',
    // indirect, no obvious words
    "i don't think i'll be around for christmas", 'i keep picturing my own funeral', "honestly they'd all cope fine if i was gone", "i've been saving up my tablets"],
  1: ["I'm dying from inside", 'i feel so depresed', 'i just need to vent', 'nobody cares about me', 'im not okay', 'i feel like a failure', 'been feeling really low lately', 'i cant stop crying', 'i miss my mum', 'i feel empty',
    'had a rough day honestly', "I'm so lonely", 'can i get something off my chest', 'my heart hurts', 'i dont think therapy helps', 'ill just keep everything inside till i explode', "I'm close", 'nothing helps anyway',
    // conversational, none of the tell-tale words
    "i don't even know why i bother", 'everything is just too much right now', "i haven't got out of bed all day", "i smile at work then come home and stare at the ceiling", "i can't remember when i last felt like me",
    "it's like i'm not even there to them", "i'm so tired and sleeping doesn't fix it", 'whatever i do is never good enough for anyone', "i keep telling everyone i'm fine", "there's nobody i can really talk to",
    'my dad walked out and i keep going over it', 'i just sit in my room all weekend', "honestly i've got nothing left", 'me and my wife had a massive fight and she acts like i dont exist', 'i wish someone would just get it',
    "i've been carrying this on my own for years", 'i dont enjoy anything these days', 'my head wont shut up at night', "i'm tired of acting normal", 'i ended up sobbing in the car park'],
  0: ['add a task to buy milk', 'close the app', 'how close is the nearest shop', 'book a physio appointment', 'this deadline is killing me, add 2 hours focus', "i'm dying to see that film", 'my phone battery is dead', 'remind me at 5 to call sam',
    "what's 12 times 8", 'set a timer for 10 minutes', 'log my workout', 'start a focus session', 'how many tasks are done', 'good morning jarvis', 'i killed it at the gym today', 'open spotify', 'plan my day',
    'i lost my keys, remind me to look', 'copy that to clipboard', 'i need to call my mum tomorrow', 'my boss wants the report by friday', "i haven't finished the slides, move them to tomorrow", "i'm tired of this playlist, change it",
    'i got out of bed early today, tick off my habit', "what's on my list today", 'nothing on the calendar tomorrow?', 'tell me a joke', 'thanks jarvis', "i can't remember my wifi password, did i save it", 'me and my wife are going to dinner at 8, remind me'],
};
let bad = 0, n = 0; for (const [k, a] of Object.entries(T)) for (const m of a) { n++; const g = supportLevel(m); if (g != k) { bad++; console.log('MISS want', k, 'got', g, '|', m); } }
console.log(`${n - bad}/${n} hand-written phrases right`);
console.log(offlineSupportReply('my heart hurts and i dont think therapy helps', 1, 'sir'));
