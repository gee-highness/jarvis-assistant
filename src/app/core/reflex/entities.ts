/** Entity extraction for Reflex: time, dates, durations, numbers, quantities, quoted text and task titles. */
import { parseWhen } from '../tools/helpers';
import { addDays, ymd } from '../util';
import { capFirst, wordNum } from './text';

export interface Entities {
  /** Raw time phrase found in the text ("tomorrow at 9", "in 20 minutes"). */
  when?: string;
  at?: Date;
  /** YYYY-MM-DD for date-only phrases. */
  date?: string;
  /** Minutes, from "for 25 minutes", "an hour", "1h30". */
  minutes?: number;
  seconds?: number;
  number?: number;
  numbers: number[];
  quoted?: string;
  onOff?: boolean;
  /** Text with time/duration phrases removed. */
  rest: string;
  phone?: string;
  email?: string;
  url?: string;
  percent?: number;
}

const DAYS = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun';
const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec';
const MONTH_IDX: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const DAY_FULL: Record<string, string> = { mon: 'monday', tue: 'tuesday', tues: 'tuesday', wed: 'wednesday', thu: 'thursday', thur: 'thursday', thurs: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday' };

const TIME_RES: RegExp[] = [
  /\bin\s+(?:a|an|one|two|three|four|five|ten|fifteen|twenty|thirty|forty|fifty|sixty|half an?|a couple of|a few|\d+(?:\.\d+)?)\s*(?:seconds?|minutes?|hours?|days?|weeks?)\b/,
  /\b(?:(?:this|tomorrow|tmr)\s+)?(?:morning|afternoon|evening|night|tonight)\b(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/,
  new RegExp(`\\b(?:on\\s+|this\\s+|next\\s+|coming\\s+)?(?:${DAYS})\\b(?:\\s+(?:morning|afternoon|evening|night))?(?:\\s+(?:at\\s+)?\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?)?`),
  /\b(?:today|tomorrow|day after tomorrow)\b(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/,
  new RegExp(`\\b(?:on\\s+)?(?:the\\s+)?\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS})\\b|\\b(?:on\\s+)?(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`),
  /\b\d{4}-\d{2}-\d{2}(?:[ t]\d{1,2}:\d{2})?\b/,
  /\b(?:at\s+|by\s+)?(?:noon|midday|midnight)\b/,
  /\b(?:at|by|for|around)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|o'clock|oclock)?\b/,
  /\b\d{1,2}(?::\d{2})\s*(?:am|pm)?\b|\b\d{1,2}\s*(?:am|pm)\b/,
  /\b(?:next week|next month|end of (?:the )?week|this weekend|next weekend|the weekend)\b/,
];

function resolveWhen(phrase: string, now: Date): { at?: Date; date?: string } {
  let p = phrase.replace(/\b(on|this|coming|the|by|around)\b/g, ' ').replace(/o'?clock/, '').replace(/\s+/g, ' ').trim();
  for (const [k, v] of Object.entries(DAY_FULL)) p = p.replace(new RegExp(`\\b${k}\\b`), v);
  p = p.replace(/\bnoon|midday\b/, '12:00').replace(/\bmidnight\b/, '23:59').replace(/\btmr\b/, 'tomorrow');
  if (/day after tomorrow/.test(p)) return { date: addDays(ymd(now), 2), at: withTime(addDays(ymd(now), 2), p) };
  if (/next week/.test(p)) return { date: addDays(ymd(now), 7) };
  if (/next month/.test(p)) { const d = new Date(now); d.setMonth(d.getMonth() + 1); return { date: ymd(d) }; }
  if (/end of week/.test(p)) return { date: addDays(ymd(now), (5 - now.getDay() + 7) % 7) };
  if (/weekend/.test(p)) { const add = (6 - now.getDay() + 7) % 7 + (/next/.test(p) ? 7 : 0); return { date: addDays(ymd(now), add || 7) }; }
  const half = p.match(/in half an? (hour)/);
  if (half) return { at: new Date(now.getTime() + 30 * 60_000) };
  const rel = p.match(/in (a couple of|a few|an?|\w+|\d+(?:\.\d+)?) (second|minute|hour|day|week)s?/);
  if (rel) {
    const n = rel[1] === 'a couple of' ? 2 : rel[1] === 'a few' ? 3 : wordNum(rel[1].replace(/^an?$/, 'a')) ?? 1;
    const mult = { second: 1e3, minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5 }[rel[2] as 'second'];
    const at = new Date(now.getTime() + n * mult);
    return rel[2] === 'day' || rel[2] === 'week' ? { at, date: ymd(at) } : { at };
  }
  const md = p.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS})|(${MONTHS})\\s+(\\d{1,2})`));
  if (md) {
    const day = +(md[1] ?? md[4]);
    const mon = MONTH_IDX[(md[2] ?? md[3]).slice(0, 3)] ?? MONTH_IDX[(md[2] ?? md[3])];
    const d = new Date(now.getFullYear(), mon, day);
    if (d.getTime() < now.getTime() - 864e5) d.setFullYear(d.getFullYear() + 1);
    return { date: ymd(d), at: withTime(ymd(d), p) };
  }
  const at = parseWhen(p, now) ?? undefined;
  const dateOnly = !/\d|morning|afternoon|evening|night|tonight/.test(p);
  return at ? { at: dateOnly ? undefined : at, date: ymd(at) } : {};
}

function withTime(date: string, p: string): Date | undefined {
  const t = p.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!t) return undefined;
  let h = +t[1];
  const m = t[2] ? +t[2] : 0;
  if (t[3] === 'pm' && h < 12) h += 12;
  if (t[3] === 'am' && h === 12) h = 0;
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m);
}

/** Smart am/pm: "at 5" during the day means 17:00 if 05:00 has passed. */
function smartHour(at: Date, phrase: string, now: Date): Date {
  if (/am|pm|:\d{2}|morning|tonight|evening|afternoon|noon|midnight|tomorrow|day|week|\d{4}/.test(phrase)) return at;
  const h = at.getHours();
  if (h >= 1 && h <= 11) {
    // bare "at 6": the next upcoming 6 o'clock, preferring this evening over tomorrow morning
    const todayPm = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h + 12, at.getMinutes());
    const todayAm = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, at.getMinutes());
    if (todayAm > now) return todayAm;
    if (todayPm > now) return todayPm;
  }
  return at;
}

export function extract(input: string, now = new Date()): Entities {
  let text = input;
  const e: Entities = { numbers: [], rest: text };
  const q = text.match(/"([^"]+)"|'([^']{3,})'/);
  if (q) e.quoted = q[1] ?? q[2];
  e.url = text.match(/\bhttps?:\/\/\S+|\b[\w-]+\.(?:com|org|net|io|co\.za|dev|app)\S*/)?.[0];
  e.email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0];
  e.phone = text.match(/(?:\+?\d[\d\s-]{7,}\d)/)?.[0]?.replace(/[\s-]/g, '');

  // spoken clock times: "half six" → 6:30, "quarter past 7" → 7:15, "quarter to 8" → 7:45
  const HW: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  const hr = (w: string) => HW[w] ?? (+w || 0);
  text = text.replace(/\bhalf (?:past )?(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\b/, (_, h: string) => `${hr(h)}:30`)
    .replace(/\bquarter past (one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\b/, (_, h: string) => `${hr(h)}:15`)
    .replace(/\bquarter to (one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\b/, (_, h: string) => `${(hr(h) + 11) % 12 || 12}:45`)
    .replace(/\bat (one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/, (_, h: string) => `at ${hr(h)}`);
  // durations ("for 25 minutes", "1h30", "an hour and a half")
  let rest = text;
  const dur = rest.match(/\b(?:for\s+)?(\d+(?:\.\d+)?|an?|one|two|three|four|five|ten|fifteen|twenty|thirty|forty|forty five|fifty|sixty|ninety|half an?)\s*(h|hours?|m|minutes?|s|seconds?)(?:\s*(?:and\s+)?(\d+)\s*(m|minutes?|s|seconds?))?\b(?:\s+and a half)?/);
  const durH = rest.match(/\b(\d{1,2})h(\d{1,2})\b/);
  if (durH) { e.minutes = +durH[1] * 60 + +durH[2]; rest = rest.replace(durH[0], ' '); }
  else if (dur && !/\bin\s+$/.test(rest.slice(0, dur.index ?? 0))) {
    const n = /half/.test(dur[1]) ? 0.5 : wordNum(dur[1].replace(/^an?$/, 'a').replace('forty five', '45')) ?? (dur[1] === 'forty five' ? 45 : 1);
    const unit = dur[2][0];
    let mins = unit === 'h' ? n * 60 : unit === 's' ? 0 : n;
    if (unit === 's') e.seconds = n;
    if (dur[3]) { if (dur[4][0] === 'm') mins += +dur[3]; else e.seconds = (e.seconds ?? 0) + +dur[3]; }
    if (/and a half/.test(dur[0])) mins += unit === 'h' ? 30 : 0.5;
    e.minutes = mins || undefined;
    rest = rest.replace(dur[0], ' ');
  }

  for (const re of TIME_RES) {
    const m = rest.match(re);
    if (!m) continue;
    const phrase = m[0].trim();
    if (/^\d{1,2}$/.test(phrase)) continue;
    const r = resolveWhen(phrase, now);
    if (!r.at && !r.date) continue;
    e.when = e.when ? `${e.when} ${phrase}` : phrase;
    if (r.at) e.at = smartHour(r.at, phrase, now);
    if (r.date && !e.date) e.date = r.date;
    if (e.at) e.date = ymd(e.at);
    rest = rest.replace(m[0], ' ');
  }
  e.rest = rest.replace(/\s+/g, ' ').trim();

  const pct = text.match(/(\d+(?:\.\d+)?)\s*(%|percent)/);
  if (pct) e.percent = parseFloat(pct[1]);
  for (const m of e.rest.matchAll(/-?\d+(?:\.\d+)?/g)) e.numbers.push(parseFloat(m[0]));
  if (!e.numbers.length) for (const w of e.rest.split(' ')) { const n = wordNum(w); if (n !== undefined && !['a', 'an'].includes(w)) e.numbers.push(n); }
  e.number = e.numbers[0];
  if (/\b(on|enable|activate|start)\b/.test(text) && !/\boff\b/.test(text)) e.onOff = true;
  if (/\b(off|disable|deactivate|kill)\b/.test(text)) e.onOff = false;
  return e;
}

// ------------------------------------------------------------------ titles
const LEADS: RegExp[] = [
  /^(?:ok(?:ay)?|hey|hi|yo|so|um+|uh+|please|jarvis|can you|could you|would you|will you|i want you to|i need you to|i would like you to|go ahead and|kindly)[\s,]+/,
  /^(?:please\s+)?(?:add|create|make|put|new|set up|log|capture|jot down|write down|note down|save)\s+(?:a\s+|an\s+|another\s+|new\s+|this\s+)?(?:task|todo|to do|to-do|item|reminder|note)?\s*(?:called|named|titled|for|to|about|that says|saying|:)?\s*/,
  /^(?:remind me|reminder|ping me|alert me|nudge me|notify me|tell me)\s+(?:to|about|that|of)?\s*/,
  /^(?:i (?:need|have|got|must|should|want|ought) to|i gotta|i got to|do not let me forget to|do not forget to|remember to|make sure i|i am going to)\s+/,
];
const TAILS = /\s*(?:to|on|in|onto|into)\s+(?:my\s+)?(?:task|todo|to do|tasks|list|to-do list|todo list|inbox|list of tasks|reminders?)(?:\s+list)?\s*$/;

/** Turns "remind me to call mom tomorrow at 5" (minus time) into "Call mom". */
export function cleanTitle(rest: string): string {
  let t = rest.trim().replace(/[.!?]+$/, '');
  for (let i = 0; i < 3; i++) for (const re of LEADS) t = t.replace(re, '');
  t = t.replace(TAILS, '').replace(/^(?:to|that|about)\s+/, '').replace(/\s+(?:please|pls|thanks|thank you)$/, '');
  t = t.replace(/\bmy\b/g, 'my').replace(/\s+/g, ' ').trim();
  return t ? capFirst(t) : '';
}

/** Restores original casing for a span of normalised text (best effort). */
export function recase(span: string, raw: string): string {
  if (!span) return span;
  const idx = raw.toLowerCase().indexOf(span.toLowerCase());
  return idx >= 0 ? raw.slice(idx, idx + span.length) : span;
}

export const fmtTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const fmtDay = (d: Date, now = new Date()) => {
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 864e5);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};
export const fmtWhen = (d: Date, now = new Date()) => `${fmtDay(d, now)} at ${fmtTime(d)}`;
