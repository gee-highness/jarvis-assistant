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
