/**
 * Intent recognition: TF-IDF (word + bigram + char-trigram) nearest-exemplar scoring, regex boosts,
 * optional MiniLM sentence embeddings, and examples learned from the user at runtime.
 */
import { IntentSpec } from './types';
import { SparseVec, Vectorizer, denseCos, sparseCos } from './text';

export interface Ranked { id: string; score: number; lex: number; sem: number; pattern: boolean; }

interface Ex { intent: string; text: string; vec: SparseVec; emb?: number[]; learned?: boolean; }

export class IntentModel {
  private vz = new Vectorizer();
  private ex: Ex[] = [];
  private specs = new Map<string, IntentSpec>();
  private embedFn?: (t: string[]) => Promise<number[][] | null>;
  semanticReady = false;

  constructor(intents: IntentSpec[], learned: { intent: string; text: string }[] = []) {
    for (const s of intents) this.specs.set(s.id, s);
    const all: { intent: string; text: string; learned?: boolean }[] = [];
    for (const s of intents) for (const e of s.examples) all.push({ intent: s.id, text: e });
    for (const l of learned) if (this.specs.has(l.intent)) all.push({ ...l, learned: true });
    this.vz.fit(all.map(a => a.text));
    this.ex = all.map(a => ({ ...a, vec: this.vz.vec(a.text) }));
  }

  spec(id: string) { return this.specs.get(id); }
  intents() { return [...this.specs.values()]; }
  get size() { return this.ex.length; }

  /** Adds a user-taught example immediately (no refit needed for scoring). */
  learn(intent: string, text: string) {
    if (!this.specs.has(intent) || this.ex.some(e => e.intent === intent && e.text === text)) return;
    const e: Ex = { intent, text, vec: this.vz.vec(text), learned: true };
    this.ex.push(e);
    if (this.embedFn) this.embedFn([text]).then(v => { if (v?.[0]) e.emb = v[0]; }).catch(() => undefined);
  }

  /** Enables semantic matching; embeds all exemplars in the background (cached by caller). */
  async enableSemantic(fn: (t: string[]) => Promise<number[][] | null>, cache?: Map<string, number[]>): Promise<boolean> {
    this.embedFn = fn;
    const todo = this.ex.filter(e => !e.emb);
    for (const e of todo) { const c = cache?.get(e.text); if (c) e.emb = c; }
    const missing = this.ex.filter(e => !e.emb);
    for (let i = 0; i < missing.length; i += 32) {
      const slice = missing.slice(i, i + 32);
      const vecs = await fn(slice.map(s => s.text)).catch(() => null);
      if (!vecs) return (this.semanticReady = false);
      slice.forEach((s, j) => { s.emb = vecs[j]; cache?.set(s.text, vecs[j]); });
    }
    return (this.semanticReady = true);
  }

  /** Scores every intent for a normalised utterance. `allowed` filters context-only intents. */
  async rank(text: string, opts: { context?: string; embed?: boolean } = {}): Promise<Ranked[]> {
    const q = this.vz.vec(text);
    let qe: number[] | undefined;
    if (opts.embed !== false && this.semanticReady && this.embedFn && text.split(' ').length > 1) {
      qe = (await this.embedFn([text]).catch(() => null))?.[0];
    }
    const best = new Map<string, { lex: number[]; sem: number }>();
    for (const e of this.ex) {
      const lex = sparseCos(q, e.vec) * (e.learned ? 1.08 : 1);
      const sem = qe && e.emb ? denseCos(qe, e.emb) : 0;
      const b = best.get(e.intent) ?? { lex: [], sem: 0 };
      b.lex.push(lex);
      if (sem > b.sem) b.sem = sem;
      best.set(e.intent, b);
    }
    const out: Ranked[] = [];
    for (const [id, b] of best) {
      const spec = this.specs.get(id)!;
      if (spec.context && spec.context !== opts.context) continue;
      const lx = b.lex.sort((x, y) => y - x);
      const lex = lx[0] * 0.8 + (lx[1] ?? lx[0]) * 0.2;
      const pattern = !!spec.patterns?.some(p => p.test(text));
      const blocked = !!spec.not?.some(p => p.test(text));
      // semantic similarities from MiniLM sit in ~0.3..0.9; rescale to the lexical range
      const sem = qe ? Math.max(0, (b.sem - 0.35) / 0.55) : 0;
      let score = qe ? lex * 0.45 + sem * 0.55 : lex;
      if (pattern) score = Math.min(1, score + 0.32 + (1 - score) * 0.15);
      if (blocked) score *= 0.35;
      out.push({ id, score, lex, sem, pattern });
    }
    return out.sort((a, b) => b.score - a.score);
  }
}

/** Confidence bands for the router. */
export const BANDS = { high: 0.5, mid: 0.34 };
