/**
 * Episodic memory + a sense of time: every turn is stored with its timestamp, so Jarvis can answer
 * "what did I say about X 10 minutes ago?", notice repeats, and follow up on things you were doing.
 */
import { contentWords, normalize, stem } from './text';

export interface Episode {
  t: number;
  who: 'user' | 'jarvis';
  text: string;
  intent?: string;
  topic?: string;
  /** Stemmed content words for fast keyword recall. */
  k: string[];
  conv?: string;
}

/** A transient state the user mentioned ("I'm going to the gym") with when to ask about it. */
export interface LiveState { what: string; kind: 'activity' | 'feeling'; t: number; askAfter: number; asked?: boolean; }

export interface TimeWindow { from: number; to: number; label: string; }

const STOPK = new Set(['what', 'did', 'say', 'said', 'tell', 'told', 'mention', 'mentioned', 'about', 'earlier', 'ago', 'minute', 'hour', 'day', 'yesterday', 'today', 'remember', 'before', 'you', 'me', 'just', 'now', 'last', 'week', 'again', 'talk', 'talked', 'were', 'we', 'when', 'second']);

export const keysOf = (text: string) => [...new Set(contentWords(normalize(text).text).map(stem).filter(w => w.length > 2 && !STOPK.has(w)))];

export class EpisodicMemory {
  episodes: Episode[] = [];
  states: LiveState[] = [];

  load(e?: Episode[], s?: LiveState[]) { this.episodes = e ?? []; this.states = s ?? []; }

  add(ep: Omit<Episode, 'k'> & { extraKeys?: string[] }) {
    const { extraKeys, ...rest } = ep;
    this.episodes.push({ ...rest, k: [...new Set([...keysOf(ep.text), ...(extraKeys ?? [])])] });
    if (this.episodes.length > 4000) this.episodes.splice(0, this.episodes.length - 4000);
  }

  /** Keyword search over past turns (newest first), optionally inside a time window. */
  search(query: string, opts: { who?: 'user' | 'jarvis'; win?: TimeWindow; skipLast?: number; k?: number } = {}): Episode[] {
    const q = keysOf(query);
    const pool = this.episodes.slice(0, Math.max(0, this.episodes.length - (opts.skipLast ?? 0)))
      .filter(e => (!opts.who || e.who === opts.who) && !/^mind\./.test(e.intent ?? '') && (!opts.win || (e.t >= opts.win.from && e.t <= opts.win.to)));
    if (!q.length) return pool.slice(-(opts.k ?? 3)).reverse();
    const scored = pool.map(e => {
      let hit = 0;
      for (const w of q) if (e.k.some(x => x === w || (w.length > 4 && x.startsWith(w.slice(0, 5))))) hit++;
      return { e, s: hit / q.length };
    }).filter(x => x.s >= Math.min(0.5, 1 / q.length + 0.01));
    return scored.sort((a, b) => b.s - a.s || b.e.t - a.e.t).slice(0, opts.k ?? 3).map(x => x.e);
  }

  /** The same question asked recently (for "you asked me that 5 minutes ago"). */
  repeatOf(text: string, withinMs: number, now: number): Episode | undefined {
    const n = normalize(text).text;
    const k = keysOf(text);
    for (let i = this.episodes.length - 1; i >= 0; i--) {
      const e = this.episodes[i];
      if (now - e.t > withinMs) break;
      if (e.who !== 'user' || now - e.t < 1500) continue;
      const same = normalize(e.text).text === n || (k.length >= 2 && k.every(w => e.k.includes(w)) && e.k.length <= k.length + 1);
      if (same) return e;
    }
    return undefined;
  }

  /** What Jarvis answered right after a given user turn. */
  replyTo(ep: Episode): Episode | undefined {
    const i = this.episodes.indexOf(ep);
    return i >= 0 ? this.episodes.slice(i + 1).find(e => e.who === 'jarvis') : undefined;
  }

  topics(win: TimeWindow): { topic: string; t: number }[] {
    const seen = new Map<string, number>();
    for (const e of this.episodes) if (e.topic && e.t >= win.from && e.t <= win.to) seen.set(e.topic, e.t);
    return [...seen.entries()].map(([topic, t]) => ({ topic, t })).sort((a, b) => b.t - a.t);
  }

  firstSince(gapMs: number, now: number): number | undefined {
    // start of the current "session": first turn after a gap longer than gapMs
    for (let i = this.episodes.length - 1; i > 0; i--) if (this.episodes[i].t - this.episodes[i - 1].t > gapMs) return this.episodes[i].t;
    return this.episodes[0]?.t ?? now;
  }

  /** Detects transient states worth following up later. */
  noteState(norm: string, now: number) {
    const acts: [RegExp, (m: RegExpMatchArray) => string, number][] = [
      [/\bi am (?:going|heading|off) to (?:the )?(gym|work|office|school|class|church|bed|sleep|shop|shops|store|mall|doctor|dentist|hospital|interview|meeting|airport|beach|party|game|braai|run)\b/, m => `going to ${m[1]}`, 75],
      [/\bi am (?:about to|going to) (eat|cook|study|work out|run|drive|shower|nap|watch a movie|play)\b/, m => `about to ${m[1]}`, 60],
      [/\bi am (?:at|in) (?:the |a )?(gym|work|office|meeting|class|hospital|doctor|traffic|queue|line)\b/, m => `at ${m[1]}`, 90],
      [/\bi am (?:driving|cooking|studying|working|travelling|traveling)\b/, m => m[0].replace(/^i am /, ''), 90],
    ];
    for (const [re, label, mins] of acts) {
      const m = norm.match(re);
      if (m) { this.addState({ what: label(m), kind: 'activity', t: now, askAfter: now + mins * 60_000 }); return; }
    }
    const feel = norm.match(/\bi (?:am|feel)(?: so| really| very| a bit| kind of| pretty)? (tired|exhausted|sick|ill|stressed|anxious|sad|down|hungry|angry|frustrated|overwhelmed|nervous|sore|bored)\b/);
    if (feel) this.addState({ what: feel[1], kind: 'feeling', t: now, askAfter: now + 60 * 60_000 });
  }

  private addState(s: LiveState) {
    this.states = [...this.states.filter(x => x.what !== s.what && Date.now() - x.t < 2 * 864e5).slice(-10), s];
  }

  /** A state that is due for a follow-up (not older than a day, asked once). */
  dueState(now: number): LiveState | undefined {
    return this.states.find(s => !s.asked && now >= s.askAfter && now - s.t < 864e5);
  }
}

// ------------------------------------------------------------------ time language
/** "just now", "12 minutes ago", "about 2 hours ago", "yesterday at 14:05", "on Tuesday", "3 weeks ago". */
export function ago(t: number, now: number): string {
  const s = Math.round((now - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 2) return 'a minute ago';
  if (m < 55) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const at = new Date(t);
  const hhmm = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (t >= d0.getTime()) return h <= 1 ? 'about an hour ago' : `about ${h} hours ago (${hhmm})`;
  const days = Math.ceil((d0.getTime() - t) / 864e5);
  if (days <= 1) return `yesterday at ${hhmm}`;
  if (days < 7) return `on ${at.toLocaleDateString(undefined, { weekday: 'long' })} at ${hhmm}`;
  if (days < 30) return `${Math.round(days / 7)} week${Math.round(days / 7) > 1 ? 's' : ''} ago`;
  return `on ${at.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: days > 300 ? 'numeric' : undefined })}`;
}

/** "how long": 3 minutes, 2 hours, 4 days. */
export function span(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 1) return 'less than a minute';
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'}`;
  const d = Math.round(h / 24);
  if (d < 60) return `${d} day${d === 1 ? '' : 's'}`;
  const mo = Math.round(d / 30);
  return `${mo} month${mo === 1 ? '' : 's'}`;
}

const NUMW: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30, few: 3, couple: 2, half: 0.5 };

/** Parses "10 minutes ago", "an hour ago", "earlier", "this morning", "yesterday", "last week", "just now". */
export function windowOf(norm: string, now: number): TimeWindow | undefined {
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const day = 864e5;
  const m = norm.match(/\b(?:about |around |like )?(\d+|a|an|one|two|three|four|five|ten|fifteen|twenty|thirty|few|couple|half)(?: of)? (second|minute|min|hour|hr|day|week|month)s? ago\b/);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? +m[1] : NUMW[m[1]] ?? 1;
    const unit = { second: 1000, minute: 60_000, min: 60_000, hour: 3600_000, hr: 3600_000, day, week: 7 * day, month: 30 * day }[m[2] as 'minute'];
    const center = now - n * unit;
    const slack = Math.max(5 * 60_000, n * unit * 0.6);
    return { from: center - slack, to: Math.min(now, center + slack), label: `${m[1] === 'a' || m[1] === 'an' ? `${m[1]} ${m[2]}` : `${m[1]} ${m[2]}s`} ago` };
  }
  if (/\bjust now|a moment ago|a second ago\b/.test(norm)) return { from: now - 10 * 60_000, to: now, label: 'just now' };
  if (/\b(earlier|before|previously|at the start)\b/.test(norm) && !/\byesterday\b/.test(norm)) return { from: d0.getTime() - 6 * 3600_000, to: now, label: 'earlier' };
  if (/\bthis morning\b/.test(norm)) return { from: d0.getTime(), to: d0.getTime() + 12 * 3600_000, label: 'this morning' };
  if (/\bthis afternoon\b/.test(norm)) return { from: d0.getTime() + 12 * 3600_000, to: d0.getTime() + 18 * 3600_000, label: 'this afternoon' };
  if (/\b(last night)\b/.test(norm)) return { from: d0.getTime() - 6 * 3600_000, to: d0.getTime() + 4 * 3600_000, label: 'last night' };
  if (/\btoday\b/.test(norm)) return { from: d0.getTime(), to: now, label: 'today' };
  if (/\byesterday\b/.test(norm)) return { from: d0.getTime() - day, to: d0.getTime(), label: 'yesterday' };
  if (/\b(this|last|past) week\b/.test(norm)) return { from: now - 7 * day, to: now, label: 'this past week' };
  if (/\b(last|past) month\b/.test(norm)) return { from: now - 31 * day, to: now, label: 'this past month' };
  return undefined;
}
