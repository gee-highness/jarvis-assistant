export const uid = (): string =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

const pad = (n: number) => String(n).padStart(2, '0');

export const ymd = (d: Date = new Date()): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hm = (d: Date = new Date()): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const addDays = (date: string, n: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return ymd(dt);
};

export const parseYmd = (s: string): Date => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

export const minutesOf = (t: string): number => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
export const timeOf = (mins: number): string => `${pad(Math.floor(mins / 60) % 24)}:${pad(Math.round(mins % 60))}`;

export const weekday = (d: Date = new Date()) => d.toLocaleDateString(undefined, { weekday: 'long' });
export const prettyDate = (d: Date = new Date()) => d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export const greeting = (d: Date = new Date()): string => {
  const h = d.getHours();
  return h < 5 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export const cosine = (a: number[], b: number[]): number => {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
};

const STOP = new Set('the a an and or but is are was were be to of in on for with at by from it this that i you me my your we our as do did does have has had not no so if then than what when where who how can could would should will just about into'.split(' '));
export const keywords = (s: string): string[] =>
  s.toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));

export const keywordScore = (q: string, text: string): number => {
  const qk = new Set(keywords(q));
  if (!qk.size) return 0;
  const tk = new Set(keywords(text));
  let hit = 0;
  qk.forEach(k => { if (tk.has(k)) hit++; });
  return hit / qk.size;
};

/** Strip markdown/code so TTS sounds natural. */
export const speakable = (md: string): string =>
  md.replace(/```[\s\S]*?```/g, ' (code omitted) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>|]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();

/** Extract the first JSON object/array from model output. */
export const extractJson = <T = unknown>(text: string): T | null => {
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.search(/[\[{]/);
  if (start < 0) return null;
  const open = cleaned[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) { try { return JSON.parse(cleaned.slice(start, i + 1)) as T; } catch { return null; } } }
  }
  return null;
};

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
