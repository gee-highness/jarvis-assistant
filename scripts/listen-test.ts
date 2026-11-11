// Replays conversations through the Reflex listening mode:  npx esbuild scripts/listen-test.ts --bundle --platform=node --outfile=/tmp/lt.cjs && node /tmp/lt.cjs
import { Listener } from '../src/app/core/reflex/listener';
import { supportLevel, isCommand } from '../src/app/core/support';
const ctx = (level: 0 | 1 | 2) => ({ honorific: 'sir', help: '• Example line: 0800 000 000', emergency: '112', level });
const convs: string[][] = [
  ["I'm sad", "It's bad", "I'm depressed and overthinking and anxious", "I haven't smoked weed in days and I feel like shit", 'What?', 'Pick', 'I want an easy win', "I don't know I thought you had suggestions", 'Ok', 'My heart hurts from anxiety', 'another', 'ok', 'ok', "i don't know", '7', 'thanks', 'goodnight'],
  ["i dont even know why i bother", 'idk', 'idk', 'nothing', "you don't understand", 'my dad walked out and i keep going over it', 'i just want him to say sorry'],
  ['i think everyone would cope fine if i was gone', 'yes', 'not really'],
  ['honestly they would all be better without me around', 'no', 'just tired of it all'],
];
let bad = 0;
for (const c of convs) {
  const L = new Listener(); console.log('\n=== conversation');
  for (const m of c) {
    const lv = supportLevel(m); const engaged = (lv || L.active) && !isCommand(m);
    if (!engaged) { console.log(`> ${m}\n  [NOT HEARD: would go to the ordinary engine]`); bad++; continue; }
    const r = L.reply(m, ctx(lv)); console.log(`> ${m}\n  ${r.text.replace(/\n/g, '\n  ')}`);
    if (/butterfl|teach|flew over|noted\./i.test(r.text) || !r.text.trim()) bad++;
  }
}
const seen = new Set<string>(); const L = new Listener(); let rep = 0;
for (let i = 0; i < 40; i++) { const r = L.reply(['i feel awful', 'it just hurts', 'everything is too much', 'i am so tired of it'][i % 4], ctx(1)).text; if (seen.has(r)) rep++; seen.add(r); }
console.log(`\nproblems: ${bad}; repeated replies in a 40-turn talk: ${rep}`); process.exit(bad ? 1 : 0);
