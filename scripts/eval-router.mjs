// Scores the rule-based (non-LLM) parts of Jarvis against the training/*.md message sets.
//   node scripts/eval-router.mjs [files...]   (default: training/jarvis_messages_*.md)
// - router: which tool groups TRIGGERS (tools.service.ts) would offer per message vs. what the intent needs
// - time:   parseWhen/parseDue on every time phrase the sets use
import fs from 'node:fs'; import path from 'node:path'; import readline from 'node:readline'; import { build } from 'esbuild';
const root = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(root, 'src/app/core/tools/tools.service.ts'), 'utf8');
const block = src.slice(src.indexOf('const TRIGGERS'), src.indexOf('};', src.indexOf('const TRIGGERS')) + 2).replace(/^const TRIGGERS[^=]*=/, 'return');
const TRIGGERS = new Function(block.replace(/;$/, ''))();
const out = path.join(process.env.TMPDIR || '/tmp', `jarvis-helpers-${process.pid}.mjs`);
await build({ entryPoints: [path.join(root, 'src/app/core/tools/helpers.ts')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { parseWhen, parseDue } = await import(out);

// intent -> acceptable tool groups (any one suffices). [] = core tools already cover it.
const sounds = 'rain|brown noise|lo-fi|white noise|ocean waves|forest|cafe ambience|fireplace|thunderstorm|pink noise|birdsong|binaural beats|deep focus|wind';
const RULES = [
  ['progress', /what's my xp|what level am i|how's my streak|show quests|what quests do i have|how close am i to level up|did i keep my streak|daily quest status|how many xp for next level|show my achievements/i, ['progress']],
  ['persona', /(be|talk|can you be|switch your personality to|change tone:|act) (more sarcastic|more formal|a bit chattier|shorter replies|funnier|like jarvis|more british|more encouraging|less preachy|straight to the point|more like a butler|way more sassy|calmer|more hype|more blunt)/i, ['persona']],
  ['stop_sound', new RegExp(`(stop the|turn off|pause the|mute the) (${sounds})`, 'i'), ['focus']],
  ['goal_progress', /how's my progress on|update my goal to|am i on track to|how far am i from/i, ['goals']],
  ['goal', /set a goal to|new goal:|my goal is to|add goal:|aiming to|i want to (run a half|save 5000|read 24|learn guitar|lose 5|meditate daily|launch the app|get promoted|learn spanish|sleep 8|write a novel|bench|quit sugar|cut screen|build a side|get my driving|finish my degree|cook at home|drink 2|walk 10k)/i, ['goals']],
  ['mood_trend', /mood trend|how's my mood been|mood chart for|how have i been feeling/i, ['journal']],
  ['journal', /journal:|dear diary|log my mood|note my mood|journal entry|journal that|today i felt|feeling (great|good|okay|meh|tired|stressed|anxious|happy|stoked|exhausted|calm|low|buzzing|irritated|overwhelmed|pretty chill|fantastic|rough|drained|motivated|a bit down|really good|proper knackered|unfocused|content)/i, ['journal', 'notes']],
  ['recall', /what's my (dog|favourite film|flat number|car|best mate|mum's|goal)|when's my sister|what time do i wake|who's my (manager|best mate|doctor)|what do i drink|what did i tell you|do i have any allergies|where's my gym|what train|what did i say about|what was i stressed|remind me what i'm saving|what's my mum/i, ['memory']],
  ['subtask', /add subtask|break down|split up|make subtasks for|\bunder [a-z].*: /i, ['tasks']],
  ['recurring', /make it recurring|set up a recurring task|every week:|\brepeat /i, ['tasks', 'habits']],
  ['project', /create project|new project called|start a project:|make a project for|add project/i, ['templates', 'tasks']],
  ['reschedule', /\b(move|push|reschedule|postpone|bump|shift) .+ to\b/i, ['tasks']],
  ['remember', /remember that|remember:|\bfyi\b|note that|keep in mind|save this:|for the record|don't forget that/i, []],
  ['focus_start', /start focus mode|focus sounds:|i need (rain|brown|lo-fi|white|ocean|forest|cafe|fire|thunder|pink|bird|binaural|deep|wind)|give me some|put on (rain|brown|lo-fi|white|ocean|forest|cafe|fire|thunder|pink|bird|binaural|deep|wind)|play (rain|brown|lo-fi|white|ocean|forest|cafe|fire|thunder|pink|bird|binaural|deep|wind)/i, ['focus']],
];
const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(root, 'training')).filter(f => /^jarvis_messages_\d+\.md$/.test(f)).map(f => path.join(root, 'training', f));
const stats = {}; const miss = {}; let n = 0, groupSum = 0, bloat = 0;
for (const f of files) {
  for await (const line of readline.createInterface({ input: fs.createReadStream(f) })) {
    const m = /^\d+\. (.*)$/.exec(line); if (!m) continue; const text = m[1]; n++;
    const got = Object.entries(TRIGGERS).filter(([, re]) => re.test(text)).map(([g]) => g);
    groupSum += got.length + 1; if (got.length >= 6) bloat++;
    const rule = RULES.find(r => r[1].test(text)); const cat = rule ? rule[0] : 'other';
    const s = (stats[cat] ??= { n: 0, ok: 0 }); s.n++;
    const need = rule ? rule[2] : [];
    if (!need.length || need.some(g => got.includes(g))) s.ok++; else { const a = (miss[cat] ??= []); if (a.length < 3) a.push(text); }
  }
}
console.log(`\nROUTER: ${n.toLocaleString()} messages, avg ${(groupSum / n).toFixed(2)} tool groups offered/msg, ${(100 * bloat / n).toFixed(1)}% offer ≥7 groups`);
for (const [c, s] of Object.entries(stats).sort()) console.log(`  ${c.padEnd(14)} ${String(s.n).padStart(8)}  right group offered: ${(100 * s.ok / s.n).toFixed(1)}%${miss[c] ? '   e.g. ' + JSON.stringify(miss[c][0]) : ''}`);
const whens = fs.readFileSync(path.join(root, 'training/gen.py'), 'utf8').match(/whens="""([\s\S]*?)"""/)[1].split('|').map(s => s.replace(/\n/g, ''));
let bad = [];
for (const w of whens) { const d = parseWhen(w), due = parseDue(w); if (!d || !due) bad.push(w); }
console.log(`\nTIME: ${whens.length - bad.length}/${whens.length} phrases parse${bad.length ? '; FAIL: ' + bad.join(' | ') : ''}`);
