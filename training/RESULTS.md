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

## Listening-mode detector (venting / crisis, learned alongside the router from set 111 on)

Each batch now mixes in natural venting sentences (training/vent.py, no tell-tale words required). "Heard" = message switches Jarvis to listening mode.
Hand-written = 78 phrases written by hand, never generated (scripts/test-support.mjs); this is the honest number.

| Sets | Venting heard before / after | Crisis heard before / after | False alarms on commands (after) | Hand-written before / after |
|---|---|---|---|---|
| 111-120 | 20.90% (keywords only) / 100.00% | 38.20% / 98.66% | 0.00% | 55/78 -> 71/78 |

