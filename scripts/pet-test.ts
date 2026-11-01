/* Pup logic + speech tests (headless):  node pet-test.cjs */
import { BADGES, HEARTS, TREAT_CAP, bondFor, careComplete, careCount, creditTasks, earnedBadges, heartDone, isUnlocked, mergeStats, moodFrom, newUnlocks, nextWish, rollover, UNLOCKS, xpForBond } from '../src/app/core/pet-care';
import { EMPTY_CARE, EMPTY_STATS } from '../src/app/core/models';
import { petSvg, toySvg } from '../src/app/core/pet-art';
import { skyAt } from '../src/app/core/pet-sky';
import { ReflexEngine } from '../src/app/core/reflex/engine';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => { if (cond) pass++; else { fail++; console.log(`✗ ${name} ${extra}`); } };

// ---- bond
ok('xp curve monotonic', Array.from({ length: 30 }, (_, i) => xpForBond(i + 2) - xpForBond(i + 1)).every((d, i, a) => d > 0 && (i === 0 || d >= a[i - 1])));
ok('level 1 at 0xp', bondFor(0).level === 1 && bondFor(0).pct === 0);
ok('level up at threshold', bondFor(xpForBond(5)).level === 5 && bondFor(xpForBond(5) - 1).level === 4);
ok('pct bounded', [0, 10, 100, 999, 5000].every(x => { const b = bondFor(x); return b.pct >= 0 && b.pct <= 100 && b.into >= 0 && b.into < b.need; }));
ok('titles', bondFor(0).title === 'New friends' && bondFor(xpForBond(10)).title === 'Inseparable');
// ---- unlocks
ok('free items at level 1', isUnlocked('none', 1) && isUnlocked('meadow', 1) && isUnlocked('ball', 1));
ok('crown locked early', !isUnlocked('crown', 5) && isUnlocked('crown', 12));
ok('newUnlocks range', newUnlocks(1, 2).length > 0 && newUnlocks(3, 3).length === 0 && newUnlocks(0, 99).length === UNLOCKS.filter(u => u.level > 0).length);
ok('unique unlock ids', new Set(UNLOCKS.map(u => u.id)).size === UNLOCKS.length);
// ---- daily care
const c0 = rollover(undefined, '2026-11-01');
ok('rollover empty', c0.day === '2026-11-01' && c0.treats === 0 && careCount(c0) === 0);
const c1 = creditTasks(c0, 3);
ok('tasks become treats once', c1.treats === 3 && creditTasks(c1, 3).treats === 3 && creditTasks(c1, 5).treats === 5);
ok('daily treat cap from tasks', creditTasks(c0, 50).treats === 10);
ok('jar cap', creditTasks({ ...c0, treats: 19 }, 10).treats === TREAT_CAP);
ok('new day keeps jar, resets hearts', (() => { const d = rollover({ ...c1, fed: 2, walked: true, perfect: true }, '2026-11-02'); return d.treats === 3 && d.fed === 0 && !d.walked && !d.perfect && d.day === '2026-11-02' && d.credited === 0; })());
ok('same day untouched', rollover({ ...c1, fed: 1 }, '2026-11-01').fed === 1);
const full = { ...c0, fed: 1, walked: true, played: 1, cuddled: 1 };
ok('care complete', careComplete(full) && careCount(full) === 4 && HEARTS.every(h => heartDone(full, h)));
ok('calm counts as cuddle', heartDone({ ...c0, calm: 1 }, 'cuddled'));
ok('wish none when complete', nextWish(full, 12) === null && nextWish(c0, 12) !== null && nextWish(c0, 21)?.heart === 'calm');
// ---- mood
const base = { hour: 12, doneToday: 0, openTasks: 3, hadMitDone: false, steps: undefined as number | undefined, streak: 0, lowMood: false, care: EMPTY_CARE };
ok('night sleeps', moodFrom({ ...base, hour: 2 }) === 'sleeping' && moodFrom({ ...base, hour: 23 }) === 'sleeping');
ok('hard day = cuddly', moodFrom({ ...base, lowMood: true }) === 'cuddly');
ok('many tasks = excited', moodFrom({ ...base, doneToday: 5 }) === 'excited');
ok('walk', moodFrom({ ...base, steps: 7000, hour: 14 }) === 'walk');
ok('hungry only with treats and afternoon', moodFrom({ ...base, hour: 14, care: { ...EMPTY_CARE, treats: 2 } }) === 'hungry' && moodFrom({ ...base, hour: 14 }) !== 'hungry');
ok('zen after calm in the evening', moodFrom({ ...base, hour: 21, care: { ...EMPTY_CARE, calm: 1 } }) === 'zen');
ok('never negative mood names', (['happy', 'cuddly', 'zen', 'playful', 'bored', 'hungry', 'excited', 'proud', 'walk', 'sleeping'] as string[]).includes(moodFrom(base)));
ok('lowMood beats everything but night', moodFrom({ ...base, lowMood: true, doneToday: 9 }) === 'cuddly');
// ---- badges
const ctx = { pets: 0, stats: mergeStats(EMPTY_STATS), bond: 1, care: EMPTY_CARE as any, steps: 0 };
ok('no badges on empty', earnedBadges([], ctx).length === 0);
ok('first pat', earnedBadges([], { ...ctx, pets: 1 }).map(b => b.id).includes('first-pat'));
ok('no duplicate award', !earnedBadges(['first-pat'], { ...ctx, pets: 1 }).map(b => b.id).includes('first-pat'));
ok('catch badge', earnedBadges([], { ...ctx, stats: { ...ctx.stats, bestCatch: 15 } }).map(b => b.id).includes('catch-15'));
ok('stylist', earnedBadges([], { ...ctx, stats: { ...ctx.stats, tried: ['a', 'b', 'c'] } }).map(b => b.id).includes('stylist'));
ok('unique badge ids', new Set(BADGES.map(b => b.id)).size === BADGES.length);
ok('mergeStats copies tried', (() => { const a = mergeStats({ tried: ['x'] }); a.tried.push('y'); return mergeStats({ tried: ['x'] }).tried.length === 1; })());
// ---- art
const look = { fur: '#f2c48d', patch: '#c9824a', bandana: '#22d3ee', accessory: 'none' };
const moods = ['sleeping', 'hungry', 'bored', 'happy', 'excited', 'proud', 'cuddly', 'lonely', 'walk', 'zen', 'playful'] as const;
const accs = ['none', 'bowtie', 'glasses', 'cap', 'crown', 'headphones', 'scarf', 'flower', 'shades', 'party', 'wizard'];
ok('svg for all moods/accessories', moods.every(m => accs.every(a => { const s = petSvg({ ...look, accessory: a }, m); return s.startsWith('<svg') && s.endsWith('</svg>') && !/undefined|NaN/.test(s) && s.includes('pup-eyes'); })));
ok('toys render', ['ball', 'bone', 'frisbee', 'plush', 'stick'].every(t => toySvg(t).startsWith('<svg')));
ok('every accessory in unlock table', accs.every(a => UNLOCKS.some(u => u.id === a)));
// ---- sky
ok('sky night/day', skyAt(2).night === 1 && skyAt(12).night === 0 && skyAt(19.5).night > 0 && skyAt(19.5).night < 1);
ok('sky colours valid for every half hour', Array.from({ length: 48 }, (_, i) => skyAt(i / 2)).every(s => /^rgb\(\d+,\d+,\d+\)$/.test(s.top) && /^rgb\(\d+,\d+,\d+\)$/.test(s.bottom)));

// ---- speech: every new pup symbol, every personality, every mood
(async () => {
  const host: any = {
    profile: () => ({ honorific: 'sir', userName: 'Gerry', name: 'Jarvis', role: 'butler', traits: { warmth: 55, humor: 55, sarcasm: 45, formality: 85, directness: 75, enthusiasm: 50, curiosity: 50, proactivity: 50, toughLove: 30, emotional: 50 }, language: 'english', emoji: 'none', swearing: 'none', catchphrases: '', pet: undefined }),
    state: () => ({ open: 1, overdue: 0, dueToday: 0, doneToday: 2, inbox: 0, tasks: [], mits: [], overdueTitles: [], habits: [], habitsLeft: [], habitsDone: 0, habitsTotal: 0, streak: 2, level: 1, levelTitle: 'x', xpToday: 0, focusToday: 0, focusRunning: false, goals: [], docs: 0, memories: 0 }),
    runTool: async () => ({ ok: true, result: 'ok' }), memorySearch: async () => [], memoryAdd: async () => undefined, memoryTop: async () => [], librarySearch: async () => [], updateProfile: async () => undefined,
    online: () => false, http: async () => '', kvGet: async () => undefined, kvSet: async () => undefined, now: () => new Date(), country: () => 'SZ', moodHistory: () => [],
  };
  const eng = new ReflexEngine(host);
  await eng.init();
  const syms = ['pet.greet', 'pet.welcome', 'pet.levelup', 'pet.perfect', 'pet.fed', 'pet.fed.none', 'pet.played', 'pet.walked', 'pet.calm.done', 'pet.gift', 'pet.open', 'pet.report', 'pet.joke', 'pet.wisdom', 'pet.dream', 'pet.talk.sad', 'pet.talk.how', 'pet.react', 'pet.line'];
  const pers = ['goofy', 'loyal', 'chill', 'hyper', 'grumpy'];
  let bad = 0, total = 0;
  const uniq = new Map<string, Set<string>>();
  for (const sym of syms) for (const p of pers) for (const m of moods) for (let i = 0; i < 3; i++) {
    const t = eng.petSay(sym, { mood: m, p, name: 'Comet', h: 'Gerry', done: 3, streak: 4, steps: '5,000', level: 3, treats: 2, jar: 2, away: '3 days', hearts: 2, bondTitle: 'Pals' });
    total++;
    if (!t || /[{}#]|undefined|NaN|\bnull\b/.test(t) || /\s{2,}/.test(t) || t.length > 260) { bad++; if (bad < 8) console.log(`  bad speech: ${sym} [${p}/${m}] → "${t}"`); }
    (uniq.get(sym) ?? uniq.set(sym, new Set()).get(sym)!).add(t);
  }
  ok(`pup speech clean (${total} samples)`, bad === 0, `${bad} bad`);
  ok('jokes varied', (uniq.get('pet.joke')?.size ?? 0) >= 10);
  ok('wisdom varied', (uniq.get('pet.wisdom')?.size ?? 0) >= 12);
  // no guilt-trip words anywhere in pup speech
  const guilt = /\b(neglect|abandon|ignored|forgot about me|you never|disappointed|starv|punish|died|dead|sad because you)\b/i;
  const all = [...uniq.values()].flatMap(s => [...s]);
  ok('no guilt language', !all.some(t => guilt.test(t)), all.find(t => guilt.test(t)) ?? '');
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
