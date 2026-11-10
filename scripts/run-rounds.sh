#!/bin/bash
# Validate -> fold into training -> retrain, per round. Usage: scripts/run-rounds.sh   (needs training/gen*.py sets 31-40 present)
cd "$(dirname "$0")/.." || exit 1
mkdir -p /tmp/nbc; LOG=training/RESULTS.md
evalset() { for n in $(seq $1 $(($1+9))); do node scripts/eval-router.mjs training/jarvis_messages_$n.md > /tmp/ev$n.txt 2>&1 & done; wait; python3 scripts/agg-eval.py $1 $(($1+9)) | tee -a $LOG; }
fold() { for n in "$@"; do node scripts/train-router.mjs count training/jarvis_messages_$n.md /tmp/nbc/nb$n.json & done; wait; node scripts/train-router.mjs merge /tmp/nbc/*.json | tee -a $LOG; }
echo "# Validation log (each block = fresh, unseen phrasings scored BEFORE folding them into training)" > $LOG
echo "## Round 4: sets 31-40 (hand-written phrasings)" >> $LOG; evalset 31; fold 31 32 33
for k in 0 1 2 3 4 5; do
  lo=$((41+10*k)); echo "## Round $((k+5)): sets $lo-$((lo+9)) (verb-slice $k)" >> $LOG
  PYTHONHASHSEED=0 python3 -I training/genr.py $k > /tmp/genr$k.log 2>&1 || { echo "gen failed" >> $LOG; exit 1; }
  evalset $lo; fold $lo $((lo+1))
done
echo ALL-ROUNDS-DONE >> $LOG
