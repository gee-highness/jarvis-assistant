/**
 * Response grammar (Tracery-style, persona-aware, anti-repetitive).
 *
 * Rule options are strings. Syntax inside an option:
 *   #symbol#           expand another rule        (#symbol:cap#, #symbol:lower#, #symbol:a# = with a/an)
 *   ((one|two|))       inline alternatives (empty alternative allowed)
 *   {var}              context variable           ({var.cap}, {var.lower})
 * An option may start with conditions in square brackets: "[humor>60,!night,has:name,role=bestfriend,w3] text"
 *   trait>N / trait<N  personality trait 0..100      has:var / !has:var   variable present (non-empty, non-zero)
 *   var=value          variable equals value          flag / !flag         context flag (morning, emoji, casual…)
 *   wN                 weight N (default 1)
 */

export interface GrammarCtx {
  traits: Record<string, number>;
  flags: Set<string>;
  vars: Record<string, unknown>;
  rand: () => number;
}
export type Rules = Record<string, string[]>;

const TRAITS = new Set(['warmth', 'humor', 'sarcasm', 'formality', 'directness', 'verbosity', 'enthusiasm', 'playfulness', 'curiosity', 'toughLove', 'emotional', 'proactivity']);

type Cond = (c: GrammarCtx) => boolean;
interface Opt { conds: Cond[]; text: string; weight: number; }

const ALT = /\(\(([^()]*)\)\)/;
const SYM = /#([a-zA-Z0-9_.\-]+(?::(?:cap|lower|a))?)#/;
const VAR = /\{([a-zA-Z0-9_]+)(?:\.(cap|lower))?\}/g;

const truthy = (v: unknown) => v !== undefined && v !== null && v !== '' && v !== 0 && v !== false && !(Array.isArray(v) && !v.length);

function parseCond(raw: string): { cond?: Cond; weight?: number } {
  const s = raw.trim();
  if (!s) return {};
  let m = s.match(/^w(\d+(?:\.\d+)?)$/);
  if (m) return { weight: parseFloat(m[1]) };
  m = s.match(/^(\w+)\s*([<>])\s*(\d+)$/);
  if (m) { const [, k, op, n] = m; const v = +n; return { cond: c => { const t = k in c.traits ? c.traits[k] : c.vars[k] !== undefined ? Number(c.vars[k]) : TRAITS.has(k) ? 50 : NaN; return Number.isFinite(t) && (op === '>' ? t > v : t < v); } }; }
  m = s.match(/^(!?)has:(\w+)$/);
  if (m) { const neg = !!m[1], k = m[2]; return { cond: c => truthy(c.vars[k]) !== neg }; }
  m = s.match(/^(\w+)(!?=)(.+)$/);
  if (m) { const [, k, op, v] = m; return { cond: c => (String(c.vars[k] ?? '') === v) === (op === '=') }; }
  m = s.match(/^(!?)([\w:-]+)$/);
  if (m) { const neg = !!m[1], f = m[2]; return { cond: c => c.flags.has(f) !== neg }; }
  return {};
}

function parseOpt(raw: string): Opt {
  const m = raw.match(/^\[([^\]]*)\]\s?/);
  if (!m) return { conds: [], text: raw, weight: 1 };
  const conds: Cond[] = [];
  let weight = 1;
  for (const part of m[1].split(',')) {
    const p = parseCond(part);
    if (p.cond) conds.push(p.cond);
    if (p.weight !== undefined) weight = p.weight;
  }
  return { conds, text: raw.slice(m[0].length), weight };
}

const article = (s: string) => (/^[aeiou]/i.test(s) && !/^(uni|use|eu|one)/i.test(s) ? 'an ' : 'a ') + s;

export class Grammar {
  private rules: Rules = {};
  private parsed = new Map<string, Opt[]>();
  private recent = new Map<string, number[]>();

  constructor(...sets: Rules[]) { for (const r of sets) this.add(r); }

  add(r: Rules): void {
    for (const [k, v] of Object.entries(r)) {
      this.rules[k] = [...(this.rules[k] ?? []), ...v];
      this.parsed.delete(k);
    }
  }

  has(sym: string): boolean { return !!this.rules[sym]?.length; }
  symbols(): string[] { return Object.keys(this.rules); }

  private opts(sym: string): Opt[] {
    let o = this.parsed.get(sym);
    if (!o) { o = (this.rules[sym] ?? []).map(parseOpt); this.parsed.set(sym, o); }
    return o;
  }

  /** Picks one eligible option of a symbol, avoiding recently used ones. */
  pickRaw(sym: string, c: GrammarCtx): string | undefined {
    const all = this.opts(sym);
    const eligible = all.map((o, i) => ({ o, i })).filter(({ o }) => o.conds.every(fn => fn(c)));
    if (!eligible.length) return undefined;
    const rec = this.recent.get(sym) ?? [];
    const memory = Math.min(Math.floor(eligible.length * 0.6), 24);
    const fresh = eligible.filter(e => !rec.slice(-memory).includes(e.i));
    const pool = fresh.length ? fresh : eligible;
    const total = pool.reduce((a, e) => a + e.o.weight, 0);
    let r = c.rand() * total;
    let chosen = pool[pool.length - 1];
    for (const e of pool) { r -= e.o.weight; if (r <= 0) { chosen = e; break; } }
    rec.push(chosen.i);
    if (rec.length > 48) rec.splice(0, rec.length - 48);
    this.recent.set(sym, rec);
    return chosen.o.text;
  }

  /** Expands a template string fully. */
  expand(template: string, c: GrammarCtx, depth = 0): string {
    let s = template;
    let guard = 0;
    while (guard++ < 400) {
      const a = ALT.exec(s);
      if (a) {
        const alts = a[1].split('|');
        s = s.slice(0, a.index) + alts[Math.floor(c.rand() * alts.length)] + s.slice(a.index + a[0].length);
        continue;
      }
      const m = SYM.exec(s);
      if (!m) break;
      const [name, mod] = splitMod(m[1]);
      let out = depth > 14 ? '' : this.pickRaw(name, c);
      out = out === undefined ? '' : this.expand(out, c, depth + 1);
      if (mod === 'cap') out = out.charAt(0).toUpperCase() + out.slice(1);
      else if (mod === 'lower') out = out.charAt(0).toLowerCase() + out.slice(1);
      else if (mod === 'a' && out) out = article(out);
      s = s.slice(0, m.index) + out + s.slice(m.index + m[0].length);
    }
    // {s:var} → "s" unless var is 1; {s1:var} → "s" only when var is 1 (verb agreement: "need{s1:n}")
    s = s.replace(/\{(s|s1):(\w+)\}/g, (_, kind: string, k: string) => {
      const one = Number(c.vars[k]) === 1;
      return kind === 's' ? (one ? '' : 's') : (one ? 's' : '');
    });
    s = s.replace(VAR, (_, k: string, mod?: string) => {
      const v = c.vars[k];
      let out = v === undefined || v === null ? '' : String(v);
      if (mod === 'cap') out = out.charAt(0).toUpperCase() + out.slice(1);
      if (mod === 'lower') out = out.toLowerCase();
      return out;
    });
    return depth === 0 ? finish(s) : s;
  }

  /** Expands a symbol. Returns '' when no option is eligible. */
  say(sym: string, c: GrammarCtx): string { return this.has(sym) ? this.expand(`#${sym}#`, c) : ''; }

  /**
   * Number of distinct strings a symbol can produce (variables count as one).
   * With a context only options eligible for that persona are counted.
   */
  count(sym: string, c?: GrammarCtx, memo = new Map<string, number>(), stack = new Set<string>()): number {
    if (memo.has(sym)) return memo.get(sym)!;
    if (stack.has(sym)) return 1;
    stack.add(sym);
    let total = 0;
    for (const o of this.opts(sym)) {
      if (c && !o.conds.every(fn => fn(c))) continue;
      total += this.countText(o.text, c, memo, stack);
      if (total > 1e18) break;
    }
    stack.delete(sym);
    const v = Math.max(1, total);
    memo.set(sym, v);
    return v;
  }

  countText(text: string, c?: GrammarCtx, memo = new Map<string, number>(), stack = new Set<string>()): number {
    let n = 1;
    let s = text;
    let a: RegExpExecArray | null;
    while ((a = ALT.exec(s))) {
      n *= a[1].split('|').reduce((acc, alt) => acc + this.countText(alt, c, memo, stack), 0);
      s = s.slice(0, a.index) + s.slice(a.index + a[0].length);
    }
    const re = new RegExp(SYM.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) n *= this.count(splitMod(m[1])[0], c, memo, stack);
    return Math.min(n, 1e18);
  }

  /** Sum of distinct outputs across every symbol that is a top-level reply (prefix filter). */
  totalFor(prefixes: string[], c?: GrammarCtx): number {
    const memo = new Map<string, number>();
    return this.symbols().filter(s => prefixes.some(p => s.startsWith(p))).reduce((a, s) => a + this.count(s, c, memo), 0);
  }
}

function splitMod(token: string): [string, string | undefined] {
  const i = token.lastIndexOf(':');
  if (i > 0) return [token.slice(0, i), token.slice(i + 1)];
  return [token, undefined];
}

/** Cleans spacing/punctuation artefacts left by optional fragments and fixes sentence casing. */
export function finish(s: string): string {
  let t = s.replace(/[ \t]+/g, ' ')
    .replace(/ +([,.!?;:])/g, '$1')
    .replace(/([,;:])(?=[.!?])/g, '')
    .replace(/([.!?]),(?=\s)/g, '$1')
    .replace(/,{2,}/g, ',')
    .replace(/\.{4,}/g, '...')
    .replace(/(^|[^.])\.\.(?!\.)/g, '$1.')
    .replace(/([!?])\./g, '$1')
    .replace(/^[\s,.;:]+/, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\n /g, '\n')
    .trim();
  // capitalise sentence starts (not inside numbers/abbrev like "e.g.")
  t = t.replace(/(^|[.!?]\s+|\n\s*)([a-z])/g, (_, p: string, ch: string) => p + ch.toUpperCase());
  return t;
}
