/**
 * Reflex text toolkit: normalisation, light stemming, sparse TF-IDF vectors (word + char n-grams),
 * fuzzy matching and a small emotion lexicon. Pure functions, no Angular, no I/O.
 */

const CONTRACTIONS: [RegExp, string][] = [
  [/\bwon'?t\b/g, 'will not'], [/\bcan'?t\b/g, 'can not'], [/\bain'?t\b/g, 'is not'], [/\bshan'?t\b/g, 'shall not'],
  [/\blet'?s\b/g, 'let us'], [/\bi'?m\b/g, 'i am'], [/\bim\b/g, 'i am'], [/(\w)n't\b/g, '$1 not'],
  [/\b(\w+)'re\b/g, '$1 are'], [/\b(\w+)'ll\b/g, '$1 will'], [/\b(\w+)'ve\b/g, '$1 have'], [/\b(\w+)'d\b/g, '$1 would'],
  [/\b(what|where|who|how|when|why|that|there|here|it|he|she)'?s\b/g, '$1 is'],
];

const SLANG: Record<string, string> = {
  u: 'you', ur: 'your', r: 'are', y: 'why', ya: 'you', yu: 'you', pls: 'please', plz: 'please', pleez: 'please', thx: 'thanks', thanx: 'thanks',
  ty: 'thanks', tnx: 'thanks', wanna: 'want to', gonna: 'going to', gotta: 'got to', lemme: 'let me', gimme: 'give me', kinda: 'kind of',
  sorta: 'sort of', dunno: 'do not know', idk: 'i do not know', hru: 'how are you', wyd: 'what are you doing', wbu: 'what about you', hbu: 'how about you',
  rn: 'right now', tmr: 'tomorrow', tmrw: 'tomorrow', tomoz: 'tomorrow', '2moro': 'tomorrow', '2day': 'today', '2nite': 'tonight', tonite: 'tonight',
  k: 'ok', kk: 'ok', okk: 'ok', okay: 'ok', okey: 'ok', okie: 'ok', yep: 'yes', yup: 'yes', yeah: 'yes', yea: 'yes', ye: 'yes', yass: 'yes', ja: 'yes',
  nah: 'no', nope: 'no', naw: 'no', cuz: 'because', coz: 'because', bc: 'because', b4: 'before', msg: 'message', pic: 'picture', info: 'information',
  bday: 'birthday', b_day: 'birthday', fav: 'favourite', fave: 'favourite', favorite: 'favourite', color: 'colour', mins: 'minutes', min: 'minutes',
  hrs: 'hours', hr: 'hour', sec: 'seconds', secs: 'seconds', w: 'with', wat: 'what', wot: 'what', whats: 'what is', hows: 'how is', thats: 'that is',
  cant: 'can not', dont: 'do not', doesnt: 'does not', didnt: 'did not', isnt: 'is not', wasnt: 'was not', wont: 'will not', youre: 'you are',
  theyre: 'they are', ive: 'i have', id: 'i would', ill: 'i will', lol: 'haha', lmao: 'haha', lmfao: 'haha', rofl: 'haha', hahaha: 'haha', hehe: 'haha',
  howzit: 'hello', heita: 'hello', sawubona: 'hello', molo: 'hello', yo: 'hello', sup: 'what is up', wassup: 'what is up', whatsup: 'what is up',
  gm: 'good morning', gn: 'good night', nite: 'night', luv: 'love', ily: 'i love you', tysm: 'thanks so much', np: 'no problem', btw: 'by the way',
  omw: 'on my way', tbh: 'to be honest', ngl: 'not going to lie', imo: 'in my opinion', fr: 'for real', smh: 'shaking my head', asap: 'as soon as possible', bro: 'bro', bru: 'bro', bra: 'bro', boet: 'bro', mfana: 'bro', lekker: 'nice', eish: 'damn',
};

export interface Normalized { raw: string; text: string; question: boolean; exclaim: boolean; }

/** Lower-cases, expands contractions and texting slang, strips noise. Keeps digits, ':' and '%'. */
export function normalize(raw: string): Normalized {
  let s = raw.toLowerCase().replace(/[’‘`´]/g, "'").replace(/[“”]/g, '"');
  for (const [re, rep] of CONTRACTIONS) s = s.replace(re, rep);
  s = s.replace(/(\d)\s*(am|pm)\b/g, '$1$2').replace(/([a-z])\1{2,}/g, '$1$1');
  const words = s.replace(/[^a-z0-9:%.'\s+\-*/^=]/g, ' ').split(/\s+/).filter(Boolean)
    .map(w => w.replace(/^'+|'+$/g, '').replace(/\.+$/, ''))
    .map(w => SLANG[w] ?? w);
  return { raw, text: words.join(' ').replace(/\s+/g, ' ').trim(), question: /\?\s*$/.test(raw) || /^(what|who|where|when|why|how|is|are|do|does|did|can|could|will|would|should|have|has)\b/.test(words[0] ?? ''), exclaim: /!/.test(raw) };
}

const STOP = new Set('the a an and or of to in on for with at by from it this that is are was were be been am i you me my your we our as so do did does have has had just really very please can could would should will shall may might some any'.split(' '));

/** Light suffix stemmer: good enough to merge plurals and tenses. */
export function stem(w: string): string {
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('sses')) return w.slice(0, -2);
  if (w.endsWith('ing') && w.length > 5) { const b = w.slice(0, -3); return /(.)\1$/.test(b) && !/ll$|ss$/.test(b) ? b.slice(0, -1) : b; }
  if (w.endsWith('ed') && w.length > 4) { const b = w.slice(0, -2); return /(.)\1$/.test(b) && !/ll$|ss$/.test(b) ? b.slice(0, -1) : b; }
  if (w.endsWith('ly') && w.length > 5) return w.slice(0, -2);
  if (w.endsWith('es') && /(sh|ch|x|z|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) return w.slice(0, -1);
  return w;
}

export const words = (s: string): string[] => s.split(/\s+/).filter(Boolean);
export const contentWords = (s: string): string[] => words(s).filter(w => !STOP.has(w) && w.length > 1);

export type SparseVec = Map<string, number>;

/** Feature bag: stemmed unigrams, bigrams and character trigrams (typo-tolerant). */
export function features(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const add = (k: string, w: number) => out.set(k, (out.get(k) ?? 0) + w);
  const toks = words(text).map(stem);
  for (let i = 0; i < toks.length; i++) {
    add('w:' + toks[i], STOP.has(toks[i]) ? 0.5 : 1);
    if (i + 1 < toks.length) add('b:' + toks[i] + '_' + toks[i + 1], 1.2);
  }
  const padded = ` ${text} `;
  for (let i = 0; i + 3 <= padded.length; i++) add('c:' + padded.slice(i, i + 3), 0.35);
  return out;
}

/** Sparse TF-IDF space fitted on the exemplar corpus. */
export class Vectorizer {
  private idf = new Map<string, number>();
  private n = 0;

  fit(docs: string[]): void {
    const df = new Map<string, number>();
    for (const d of docs) for (const k of features(d).keys()) df.set(k, (df.get(k) ?? 0) + 1);
    this.n = docs.length;
    this.idf.clear();
    for (const [k, v] of df) this.idf.set(k, Math.log(1 + this.n / v));
  }

  vec(text: string): SparseVec {
    const f = features(text);
    const v: SparseVec = new Map();
    let norm = 0;
    const unseen = Math.log(1 + Math.max(1, this.n));
    for (const [k, tf] of f) {
      const w = (1 + Math.log(tf)) * (this.idf.get(k) ?? unseen * 0.6);
      v.set(k, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [k, w] of v) v.set(k, w / norm);
    return v;
  }
}

export function sparseCos(a: SparseVec, b: SparseVec): number {
  const [s, l] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [k, w] of s) { const o = l.get(k); if (o) dot += w * o; }
  return dot;
}

export function denseCos(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** 0..1 similarity between two short strings (token overlap + edit distance). */
export function fuzzy(a: string, b: string): number {
  const x = a.toLowerCase().trim(), y = b.toLowerCase().trim();
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (y.includes(x) || x.includes(y)) return 0.85 * Math.min(x.length, y.length) / Math.max(x.length, y.length) + 0.15;
  const ed = 1 - levenshtein(x, y) / Math.max(x.length, y.length);
  const ta = new Set(contentWords(x).map(stem)), tb = new Set(contentWords(y).map(stem));
  let hit = 0;
  ta.forEach(t => { if (tb.has(t)) hit++; });
  const jac = ta.size && tb.size ? hit / (ta.size + tb.size - hit) : 0;
  return Math.max(ed, jac);
}

export function bestFuzzy<T>(query: string, items: T[], key: (t: T) => string, min = 0.55): T | undefined {
  let best: T | undefined, score = min;
  for (const it of items) { const s = fuzzy(query, key(it)); if (s > score) { score = s; best = it; } }
  return best;
}

// ------------------------------------------------------------------ emotion
export type Emotion = 'happy' | 'excited' | 'grateful' | 'sad' | 'lonely' | 'anxious' | 'angry' | 'tired' | 'bored' | 'sick' | 'proud' | 'love' | 'neutral';

const LEX: Record<Exclude<Emotion, 'neutral'>, string[]> = {
  happy: ['happy', 'glad', 'great', 'good', 'awesome', 'amazing', 'fantastic', 'wonderful', 'nice', 'cool', 'joy', 'fun', 'smile', 'haha', 'yay', 'brilliant', 'lovely', 'chilled', 'relaxed', 'blessed'],
  excited: ['excited', 'pumped', 'hyped', 'cannot wait', 'stoked', 'thrilled', 'lets go', 'let us go', 'fired up', 'buzzing'],
  grateful: ['grateful', 'thankful', 'appreciate', 'blessed'],
  sad: ['sad', 'down', 'depressed', 'unhappy', 'cry', 'crying', 'heartbroken', 'hurt', 'miserable', 'awful', 'terrible', 'upset', 'low', 'broken', 'lost', 'gutted', 'devastated', 'disappointed', 'rough day', 'bad day'],
  lonely: ['lonely', 'alone', 'no friends', 'nobody', 'no one cares', 'isolated', 'left out'],
  anxious: ['anxious', 'nervous', 'worried', 'stress', 'stressed', 'panic', 'overwhelm', 'overwhelmed', 'scared', 'afraid', 'fear', 'pressure', 'freaking out', 'tense'],
  angry: ['angry', 'mad', 'furious', 'pissed', 'annoyed', 'irritated', 'frustrated', 'hate', 'fed up', 'sick of', 'livid', 'rage'],
  tired: ['tired', 'exhausted', 'sleepy', 'drained', 'burnt out', 'burned out', 'burnout', 'fatigued', 'no energy', 'knackered', 'worn out'],
  bored: ['bored', 'boring', 'nothing to do', 'meh', 'dull'],
  sick: ['sick', 'ill', 'fever', 'flu', 'headache', 'migraine', 'cold', 'pain', 'nauseous', 'not feeling well', 'unwell'],
  proud: ['proud', 'nailed it', 'did it', 'achieved', 'finished', 'won', 'promoted', 'passed', 'got the job', 'crushed it', 'smashed it'],
  love: ['love you', 'adore you', 'miss you', 'best assistant', 'you are the best'],
};
const NEG = /\b(not|never|no|hardly|barely)\s+(\w+\s+)?$/;

export interface EmotionRead { emotion: Emotion; intensity: number; valence: number; scores: Partial<Record<Emotion, number>>; }

export function readEmotion(text: string): EmotionRead {
  const t = ` ${text} `;
  const scores: Partial<Record<Emotion, number>> = {};
  for (const [emo, list] of Object.entries(LEX) as [Exclude<Emotion, 'neutral'>, string[]][]) {
    for (const w of list) {
      const i = t.indexOf(` ${w} `);
      if (i < 0) continue;
      const negated = NEG.test(t.slice(Math.max(0, i - 14), i + 1));
      const key: Emotion = negated ? (['happy', 'excited', 'grateful', 'proud'].includes(emo) ? 'sad' : 'happy') : emo;
      scores[key] = (scores[key] ?? 0) + (negated ? 0.5 : 1);
    }
  }
  let intensity = 1 + (/(very|so|really|super|extremely|incredibly|too)\s/.test(t) ? 0.5 : 0) + (/!{2,}/.test(text) ? 0.3 : 0);
  if (/[A-Z]{4,}/.test(text)) intensity += 0.3;
  const top = (Object.entries(scores) as [Emotion, number][]).sort((a, b) => b[1] - a[1])[0];
  const emotion = top?.[0] ?? 'neutral';
  const pos = (scores.happy ?? 0) + (scores.excited ?? 0) + (scores.grateful ?? 0) + (scores.proud ?? 0) + (scores.love ?? 0);
  const neg = (scores.sad ?? 0) + (scores.lonely ?? 0) + (scores.anxious ?? 0) + (scores.angry ?? 0) + (scores.tired ?? 0) + (scores.bored ?? 0) + (scores.sick ?? 0);
  return { emotion, intensity: top ? Math.min(2, intensity * top[1]) : 0, valence: Math.max(-1, Math.min(1, (pos - neg) / 3)), scores };
}

// ------------------------------------------------------------------ misc
export const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const NUMS: Record<string, number> = {
  zero: 0, one: 1, a: 1, an: 1, two: 2, couple: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90, hundred: 100, few: 3, half: 0.5,
};
export const wordNum = (w: string): number | undefined => (/^\d+(\.\d+)?$/.test(w) ? parseFloat(w) : NUMS[w]);

export const ORDINALS: Record<string, number> = { first: 0, '1st': 0, one: 0, '1': 0, second: 1, '2nd': 1, two: 1, '2': 1, third: 2, '3rd': 2, three: 2, '3': 2, fourth: 3, '4': 3, four: 3, last: -1 };

/** Deterministic 32-bit hash (FNV-1a). */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
