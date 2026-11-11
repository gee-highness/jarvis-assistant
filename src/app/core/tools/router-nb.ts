import { fixTypos } from './helpers';
import { ROUTER_MODEL } from './router-model';

/** Words + bigrams of a message (typo-repaired, numbers collapsed). Must match scripts/train-router.mjs. */
export function featurize(text: string): string[] {
  const w = (fixTypos(text).toLowerCase().match(/[a-z']+|\d+%?/g) ?? []).map(t => (/^\d/.test(t) ? '#' : t));
  const f = [...w];
  for (let i = 0; i < w.length - 1; i++) f.push(w[i] + ' ' + w[i + 1]);
  return f;
}

/** Naive-Bayes intent guess: tool groups of every category scoring within `margin` nats of the best. */
export function classifyGroups(text: string, margin = 3): string[] {
  const { classes, groups, rows } = ROUTER_MODEL;
  if (!classes.length) return [];
  const sc = new Array<number>(classes.length).fill(0);
  let hits = 0;
  for (const f of featurize(text)) {
    const r = rows[f]; if (!r) continue;
    hits++;
    for (let c = 0; c < classes.length; c++) sc[c] -= (r.charCodeAt(c) - 33) / 2;
  }
  if (!hits) return [];
  const best = Math.max(...sc); const out = new Set<string>();
  sc.forEach((v, c) => { if (v >= best - margin) for (const g of groups[classes[c]] ?? []) out.add(g); });
  return [...out];
}

/**
 * Learned distress check: how far (in nats) the venting / crisis classes lead every ordinary intent.
 * Positive = the message reads like someone hurting, even with none of the obvious words. Null = too little to go on.
 */
export function distressLead(text: string): { vent: number; crisis: number } | null {
  const { classes, rows } = ROUTER_MODEL; const vi = classes.indexOf('vent'), ci = classes.indexOf('crisis');
  if (vi < 0 || ci < 0) return null;
  const sc = new Array<number>(classes.length).fill(0); let hits = 0;
  for (const f of featurize(text)) { const r = rows[f]; if (!r) continue; hits++; for (let c = 0; c < classes.length; c++) sc[c] -= (r.charCodeAt(c) - 33) / 2; }
  if (hits < 3) return null;
  let other = -Infinity; sc.forEach((v, c) => { if (c !== vi && c !== ci && v > other) other = v; });
  return { vent: Math.max(sc[vi], sc[ci]) - other, crisis: sc[ci] - Math.max(other, sc[vi]) };
}

/** Best-scoring trained category and its lead (nats) over the runner-up; null when there is too little to go on. */
export function classifyTop(text: string): { cls: string; lead: number } | null {
  const { classes, rows } = ROUTER_MODEL; if (!classes.length) return null;
  const sc = new Array<number>(classes.length).fill(0); let hits = 0;
  for (const f of featurize(text)) { const r = rows[f]; if (!r) continue; hits++; for (let c = 0; c < classes.length; c++) sc[c] -= (r.charCodeAt(c) - 33) / 2; }
  if (hits < 2) return null;
  let b = 0, s2 = -Infinity; for (let c = 1; c < sc.length; c++) if (sc[c] > sc[b]) b = c;
  sc.forEach((v, c) => { if (c !== b && v > s2) s2 = v; });
  return { cls: classes[b], lead: sc[b] - s2 };
}
