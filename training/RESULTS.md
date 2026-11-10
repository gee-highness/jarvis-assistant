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
