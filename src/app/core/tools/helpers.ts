import { addDays, hm, ymd } from '../util';
import { VOCAB } from './vocab';

// ---------------- safe calculator (no eval) ----------------
const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  sin: x => Math.sin(x * Math.PI / 180), cos: x => Math.cos(x * Math.PI / 180), tan: x => Math.tan(x * Math.PI / 180),
  log: Math.log10, ln: Math.log, exp: Math.exp,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export function calculate(expr: string): number {
  const src = expr.toLowerCase().replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '').replace(/\s+/g, '');
  let i = 0;
  const peek = () => src[i];
  const eat = (c: string) => { if (src[i] === c) { i++; return true; } return false; };
  const parseExpr = (): number => {
    let v = parseTerm();
    for (;;) { if (eat('+')) v += parseTerm(); else if (eat('-')) v -= parseTerm(); else return v; }
  };
  const parseTerm = (): number => {
    let v = parseFactor();
    for (;;) {
      if (eat('*')) v *= parseFactor();
      else if (eat('/')) v /= parseFactor();
      else if (peek() === '%' && !/[0-9(a-z]/.test(src[i + 1] ?? '')) { i++; v /= 100; }
      else if (eat('%')) v %= parseFactor();
      else return v;
    }
  };
  const parseFactor = (): number => {
    let v = parseUnary();
    if (eat('^')) v = Math.pow(v, parseFactor());
    return v;
  };
  const parseUnary = (): number => {
    if (eat('-')) return -parseUnary();
    if (eat('+')) return parseUnary();
    return parsePrimary();
  };
  const parsePrimary = (): number => {
    if (eat('(')) { const v = parseExpr(); if (!eat(')')) throw new Error('Missing )'); return v; }
    const num = src.slice(i).match(/^\d*\.?\d+(e[+-]?\d+)?/);
    if (num) { i += num[0].length; return parseFloat(num[0]); }
    const id = src.slice(i).match(/^[a-z]+/);
    if (id) {
      i += id[0].length;
      if (id[0] in CONSTS) return CONSTS[id[0]];
      const fn = FUNCS[id[0]];
      if (!fn) throw new Error(`Unknown function ${id[0]}`);
      if (!eat('(')) throw new Error(`${id[0]} needs (`);
      const v = parseExpr();
      if (!eat(')')) throw new Error('Missing )');
      return fn(v);
    }
    throw new Error(`Unexpected "${peek() ?? 'end'}"`);
  };
  const v = parseExpr();
  if (i < src.length) throw new Error(`Unexpected "${src[i]}"`);
  return v;
}

// ---------------- unit conversion ----------------
const UNITS: Record<string, { dim: string; f: number }> = {
  mm: { dim: 'len', f: 0.001 }, cm: { dim: 'len', f: 0.01 }, m: { dim: 'len', f: 1 }, km: { dim: 'len', f: 1000 },
  in: { dim: 'len', f: 0.0254 }, ft: { dim: 'len', f: 0.3048 }, yd: { dim: 'len', f: 0.9144 }, mi: { dim: 'len', f: 1609.344 },
  mg: { dim: 'mass', f: 1e-6 }, g: { dim: 'mass', f: 0.001 }, kg: { dim: 'mass', f: 1 }, t: { dim: 'mass', f: 1000 },
  oz: { dim: 'mass', f: 0.0283495 }, lb: { dim: 'mass', f: 0.453592 }, st: { dim: 'mass', f: 6.35029 },
  ml: { dim: 'vol', f: 0.001 }, l: { dim: 'vol', f: 1 }, tsp: { dim: 'vol', f: 0.00492892 }, tbsp: { dim: 'vol', f: 0.0147868 },
  cup: { dim: 'vol', f: 0.24 }, floz: { dim: 'vol', f: 0.0295735 }, gal: { dim: 'vol', f: 3.78541 },
  s: { dim: 'time', f: 1 }, min: { dim: 'time', f: 60 }, h: { dim: 'time', f: 3600 }, day: { dim: 'time', f: 86400 }, week: { dim: 'time', f: 604800 },
  kmh: { dim: 'speed', f: 1 / 3.6 }, mph: { dim: 'speed', f: 0.44704 }, ms: { dim: 'speed', f: 1 }, knot: { dim: 'speed', f: 0.514444 },
  b: { dim: 'data', f: 1 }, kb: { dim: 'data', f: 1e3 }, mb: { dim: 'data', f: 1e6 }, gb: { dim: 'data', f: 1e9 }, tb: { dim: 'data', f: 1e12 },
  sqm: { dim: 'area', f: 1 }, sqft: { dim: 'area', f: 0.092903 }, ha: { dim: 'area', f: 10000 }, acre: { dim: 'area', f: 4046.86 }, sqkm: { dim: 'area', f: 1e6 },
};
const ALIAS: Record<string, string> = {
  meter: 'm', meters: 'm', metre: 'm', metres: 'm', kilometer: 'km', kilometers: 'km', kilometre: 'km', kilometres: 'km',
  inch: 'in', inches: 'in', foot: 'ft', feet: 'ft', yard: 'yd', yards: 'yd', mile: 'mi', miles: 'mi',
  gram: 'g', grams: 'g', kilogram: 'kg', kilograms: 'kg', kgs: 'kg', pound: 'lb', pounds: 'lb', lbs: 'lb', ounce: 'oz', ounces: 'oz', stone: 'st',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l', milliliter: 'ml', millilitre: 'ml', cups: 'cup', gallon: 'gal', gallons: 'gal',
  second: 's', seconds: 's', sec: 's', minute: 'min', minutes: 'min', hour: 'h', hours: 'h', hr: 'h', days: 'day', weeks: 'week',
  'km/h': 'kmh', kph: 'kmh', 'm/s': 'ms', knots: 'knot',
  celsius: 'c', fahrenheit: 'f', kelvin: 'k', '°c': 'c', '°f': 'f',
};

export function convertUnits(value: number, from: string, to: string): number {
  const norm = (u: string) => { const l = u.trim().toLowerCase(); return ALIAS[l] ?? l; };
  const a = norm(from), b = norm(to);
  const temps = ['c', 'f', 'k'];
  if (temps.includes(a) && temps.includes(b)) {
    const c = a === 'c' ? value : a === 'f' ? (value - 32) * 5 / 9 : value - 273.15;
    return b === 'c' ? c : b === 'f' ? c * 9 / 5 + 32 : c + 273.15;
  }
  const ua = UNITS[a], ub = UNITS[b];
  if (!ua || !ub) throw new Error(`Unknown unit ${!ua ? from : to}`);
  if (ua.dim !== ub.dim) throw new Error(`Can't convert ${from} to ${to}`);
  return value * ua.f / ub.f;
}

// ---------------- natural time parsing ----------------
/** Parses ISO datetimes, "HH:mm", "3pm", "in 20 minutes", "in an hour", "tomorrow at 9", "monday 14:00",
 *  "noon", "end of day", "after work", "this weekend", "next week/month", "on the 1st", "every weekday" (first occurrence). */
export function parseWhen(input: string, now = new Date()): Date | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}([t ]\d{1,2}:\d{2})?/.test(s)) {
    const d = new Date(s.length <= 10 ? `${s}T09:00` : s.replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
  }
  const MULT: Record<string, number> = { second: 1e3, sec: 1e3, minute: 6e4, min: 6e4, hour: 36e5, hr: 36e5, day: 864e5, week: 6048e5 };
  const rel = s.match(/in\s+(\d+(?:\.\d+)?)\s*(second|sec|minute|min|hour|hr|day|week)s?/);
  if (rel) return new Date(now.getTime() + parseFloat(rel[1]) * (MULT[rel[2]] ?? 6e4));
  const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, 'a couple of': 2, 'a few': 3, 'half a': 0.5, 'half an': 0.5 };
  const relw = s.match(/in\s+(an?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|a couple of|a few|half an?)\s+(second|sec|minute|min|hour|hr|day|week)s?/);
  if (relw) return new Date(now.getTime() + WORDS[relw[1]] * MULT[relw[2]]);
  let date = ymd(now);
  let dayGiven = false;
  let preset: [number, number] | null = null; // default clock time implied by a phrase ("noon", "after work")
  const recur = /\b(every|each|daily|weekly|monthly)\b/.test(s);
  if (/\btomorrow\b/.test(s)) { date = addDays(date, 1); dayGiven = true; }
  else if (/\btoday\b|\btonight\b/.test(s)) dayGiven = true;
  else if (/next month|\bmonthly\b|every month/.test(s)) { const d = new Date(now); d.setMonth(d.getMonth() + 1); date = ymd(d); dayGiven = true; }
  else if (/next week|\bweekly\b|every week\b/.test(s)) { date = addDays(date, 7); dayGiven = true; }
  else if (/end of (the )?week|\beow\b/.test(s)) { date = addDays(date, (5 - now.getDay() + 7) % 7); dayGiven = true; preset = [17, 0]; }
  else if (/weekend/.test(s)) { date = addDays(date, (6 - now.getDay() + 7) % 7); dayGiven = true; }
  const ord = s.match(/\b(\d{1,2})(st|nd|rd|th)\b/);
  if (ord) {
    let d = new Date(now.getFullYear(), now.getMonth(), +ord[1]);
    if (ymd(d) < ymd(now)) d = new Date(now.getFullYear(), now.getMonth() + 1, +ord[1]);
    date = ymd(d); dayGiven = true;
  }
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const wd = days.findIndex(d => s.includes(d));
  if (wd >= 0) { let diff = (wd - now.getDay() + 7) % 7; if (diff === 0) diff = 7; date = addDays(ymd(now), diff); dayGiven = true; }
  if (/\bnoon\b|midday/.test(s)) preset = [12, 0];
  else if (/lunchtime|at lunch/.test(s)) preset = [12, 30];
  else if (/before lunch/.test(s)) preset = [11, 30];
  else if (/after work|end of (the )?(work ?)?day|\beod\b|after hours/.test(s)) preset = /after work/.test(s) ? [18, 0] : [17, 0];
  const ts = s.replace(/\d{1,2}(st|nd|rd|th)\b/g, ' ');
  const t = ts.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  let hh = 9, mm = 0;
  if (t && (t[2] || t[3] || /at\s+\d/.test(ts) || /^\d{1,2}(:\d{2})?$/.test(ts))) {
    hh = parseInt(t[1], 10); mm = t[2] ? parseInt(t[2], 10) : 0;
    if (t[3] === 'pm' && hh < 12) hh += 12;
    if (t[3] === 'am' && hh === 12) hh = 0;
  } else if (preset) [hh, mm] = preset;
  else if (/morning/.test(s)) hh = 8;
  else if (/afternoon/.test(s)) hh = 14;
  else if (/evening|tonight/.test(s)) hh = 19;
  else if (!dayGiven && !recur) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const out = new Date(y, mo - 1, d, hh, mm);
  if (!dayGiven && out.getTime() <= now.getTime()) out.setDate(out.getDate() + 1);
  if (/weekday/.test(s)) while (out.getDay() === 0 || out.getDay() === 6) out.setDate(out.getDate() + 1);
  return out;
}

/** Normalise a due date phrase to YYYY-MM-DD. */
export function parseDue(input?: string): string | undefined {
  if (!input) return undefined;
  const s = input.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s === 'none' || s === 'no') return undefined;
  if (/next week/.test(s)) return addDays(ymd(), 7);
  if (/end of (the )?week/.test(s)) { const n = new Date(); return addDays(ymd(n), (5 - n.getDay() + 7) % 7); }
  const d = parseWhen(s.includes('at') || /\d/.test(s) ? s : `${s} 09:00`);
  return d ? ymd(d) : undefined;
}

export const describeWhen = (d: Date) => `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ${hm(d)}`;

/** Strip HTML to readable text. */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript,svg,nav,footer,header,iframe,form').forEach(n => n.remove());
  const title = doc.title ? `# ${doc.title}\n` : '';
  const text = (doc.body?.innerText || doc.body?.textContent || '').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  return title + text;
}

// ---------------- typo repair (keeps the keyword router working on fat-fingered / voice-garbled text) ----------------
const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
function repairWord(w: string): string | null {
  const lw = w.toLowerCase();
  if (lw.length < 4 || VOCAB.has(lw) || /[^a-z]/.test(lw)) return null;
  const hits = new Set<string>();
  const tryC = (c: string) => { if (VOCAB.has(c)) hits.add(c); };
  for (let i = 0; i < lw.length - 1; i++) tryC(lw.slice(0, i) + lw[i + 1] + lw[i] + lw.slice(i + 2)); // swapped letters
  for (let i = 0; i < lw.length; i++) tryC(lw.slice(0, i) + lw.slice(i + 1)); // extra letter
  for (let i = 0; i <= lw.length; i++) for (const ch of ALPHA) tryC(lw.slice(0, i) + ch + lw.slice(i)); // missing letter
  return hits.size === 1 ? [...hits][0] : null;
}
/** Repairs one-keystroke typos against the learned vocabulary ("aalrm", "reminedr", "forestm ate"). */
export function fixTypos(text: string): string {
  const parts = text.split(/(\s+)/); // words and whitespace, alternating
  for (let i = 0; i < parts.length; i += 2) {
    const w = parts[i]; const bare = w.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, '');
    if (bare.length < 2 || VOCAB.has(bare.toLowerCase())) continue;
    const next = parts[i + 2];
    if (next !== undefined && parts[i + 1] === ' ') { // a letter slid across the space: "rainf or" -> "rain for"
      const nb = next.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, '');
      const a = bare.slice(0, -1).toLowerCase(), b = (bare.slice(-1) + nb).toLowerCase();
      if (a.length >= 2 && VOCAB.has(a) && VOCAB.has(b)) { parts[i] = w.replace(bare, bare.slice(0, -1)); parts[i + 2] = next.replace(nb, bare.slice(-1) + nb); continue; }
    }
    const fixed = repairWord(bare);
    if (fixed) parts[i] = w.replace(bare, fixed);
  }
  return parts.join('');
}
