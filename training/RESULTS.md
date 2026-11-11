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
