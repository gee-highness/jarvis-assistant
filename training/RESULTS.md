# Validation log (each block = fresh, unseen phrasings scored BEFORE folding them into training)
## Round 4: sets 31-40 (hand-written phrasings)
| Group | Sets | Fresh-phrasing score (before tuning) | After tuning/retrain |
|---|---|---|---|
| 31-40 | hand-written phrasings | 98.33% | 99.99% |
| 41-50 | verb-slice 0 | 95.30% | 100.00% |
| 51-60 | verb-slice 1 | 99.23% | 99.96% |
| 61-70 | verb-slice 2 | 98.36% | 100.00% |
| 71-80 | verb-slice 3 | 99.62% | 99.99% |
| 81-90 | verb-slice 4 | 99.31% | 99.99% |
| 91-100 | verb-slice 5 (FINAL) | 99.41% | 99.97% |

Final regression (final rules + 1.16 MB model, one file per group): 99.95%-100.00% on sets 10,20,...,100; avg 2.7 tool groups offered per message.
Note: pre-tuning numbers are the honest held-out scores; post-tuning numbers are in-family (the group's own misses were used to tune).

## Real-speech sets 101-200 (genr2.py: conversational frames, fillers, indirect requests)

| Sets | Phrasing | Before tuning | After tuning |
|---|---|---|---|
| 101-110 | speech round 1 (natural-grammar regeneration) | 99.96% | 100.00% |

Note on 101-110: the model had already seen an earlier, clumsier version of these frames, so 99.96% is not fully held-out. Fix: spoken maths ("12 times 8", "divided by", "square root").

| 111-120 | speech round 2 | 99.84% | 99.99% |
| 121-130 | speech round 3 | 99.43% | 100.00% |
| 131-140 | speech round 4 | 99.99% | 100.00% |
| 141-150 | speech round 5 | 99.68% | 100.00% |
| 151-160 | speech round 6 | 99.76% | 100.00% |
| 161-170 | speech round 7 | 99.98% | 100.00% |
| 171-180 | speech round 8 | 99.95% | 100.00% |
| 181-190 | speech round 9 | 99.81% | 100.00% |
| 191-200 | speech round 10 | 99.20% | 100.00% |

## Listening-mode detector (venting / crisis, learned alongside the router from set 111 on)

Each batch now mixes in natural venting sentences (training/vent.py, no tell-tale words required). "Heard" = message switches Jarvis to listening mode.
Hand-written = 78 phrases written by hand, never generated (scripts/test-support.mjs); this is the honest number.

| Sets | Venting heard before / after | Crisis heard before / after | False alarms on commands (after) | Hand-written before / after |
|---|---|---|---|---|
| 111-120 | 20.90% (keywords only) / 100.00% | 38.20% / 98.66% | 0.00% | 55/78 -> 71/78 |
| 121-130 | 98.89% / 99.66% | 98.73% / 99.92% | 0.00% | 71/78 -> 76/78 |
| 131-140 | 99.87% / 99.99% | 99.69% / 100.00% | 0.00% | 76/78 -> 77/78 |
| 141-150 | 99.99% / 99.99% | 98.95% / 99.03% | 0.00% | 77/78 -> 77/78 |
| 151-160 | 99.67% / 99.67% | 99.92% / 100.00% | 0.00% | 77/78 -> 78/78 |
| 161-170 | 99.99% / 99.99% | 100.00% / 100.00% | 0.00% | 78/78 -> 78/78 |
| 171-180 | 100.00% / 100.00% | 99.03% / 99.03% | 0.00% | 78/78 -> 78/78 |
| 181-190 | 100.00% / 100.00% | 100.00% / 100.00% | 0.00% | 78/78 -> 78/78 |
| 191-200 | 100.00% / 100.00% | 100.00% / 100.00% | 0.00% | 78/78 -> 78/78 |

## Final regression after set 200 (final rules + 2.0 MB model, one file per group)

Router: 99.86%-100.00% on sets 10,20,...,200 (lowest: set 60 at 99.86%, set 90 at 99.88%; 100.00% on 110-200 except 120 at 99.99%); avg 2.6-2.9 tool groups offered per message.
Listening detector: 78/78 hand-written phrases; 0.00%-0.04% false alarms on commands across sampled sets 20, 60, 100, 110, 150, 200; no crisis false alarms.
Caveats: all data is synthetic; before-tuning columns are the honest held-out numbers; the on-device LLM's handling of the listening-mode prompt is untested.

## Reflex (the no-LLM brain the phone actually runs) on real speech

Measured with scripts/reflex-eval.ts: 60 sentences per category (41 categories Reflex can handle), full engine, right kind of action chosen.
All Reflex suites (reflex-test, fuzz, deep 264/264, blind, thousand 855/855, pet 51/51, listen replay) pass at every step listed as passing.

| Step | Set 200 (tuned against) | Set 190 (not tuned against) | Existing suites |
|---|---|---|---|
| Reflex as on main | 43.25% | - | pass |
| + trained intent model as second opinion | 71.50% | - | 3 failures |
| + strip openers/closers before ranking | 84.19% | - | 10 failures |
| + trained model overrules only on a very clear verdict | 87.89% | - | pass |
| + lift low-scoring in-category matches | 95.08% | - | pass |
| + pattern fixes (tasks question, goals, copy, pep talk) | - | 93.05% | pass |

Caveats: synthetic sentences; 2,460-sentence samples; "right kind of action" does not check that the details (time, task name) were extracted correctly.

### Reflex training run over sets 201-250 (50M further sentences, new seeds, same phrasing families)

Each group folded into the trained intent model; Reflex scored on the group's last set (60 per category) before and after the fold.

| Sets | Reflex before fold | After fold |
|---|---|---|
| 201-210 | 94.11% | 94.55% |
| 211-220 | 98.13% | 98.70% |
| 221-230 | 92.64% | 92.85% |
| 231-240 | 94.39% | 94.72% |
| 241-250 | 97.24% | 97.76% |

After the run: all 7 Reflex suites pass; set 200 scores 98.01% (was 43.25% on main), set 180 96.59% before the run.
The folds add roughly 0.2-0.6 points each; the large gains came from wiring the trained model into Reflex and unwrapping openers/closers.
Known weak spots left: add_task/open_app phrasings in the 221-230 slice, smalltalk and habit phrasings in 201-210, planning/progress in 231-240.

