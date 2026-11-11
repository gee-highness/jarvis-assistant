#!/bin/bash
# Runs every Reflex test suite the phone build runs, plus the listening replay and the real-speech accuracy sample.
#   scripts/reflex-ci.sh [set-file] [perCategory]
cd "$(dirname "$0")/.." || exit 1; T=${TMPDIR:-/tmp}/reflex-ci; mkdir -p $T; fail=0
for t in reflex-test reflex-fuzz reflex-deep reflex-blind reflex-thousand pet-test listen-test; do
  npx --yes esbuild scripts/$t.ts --bundle --platform=node --outfile=$T/$t.cjs --log-level=warning || { echo "BUILD FAIL $t"; fail=1; continue; }
  node $T/$t.cjs > $T/$t.out 2>&1; rc=$?; echo "$t rc=$rc :: $(grep -iE 'total|pass|fail|problems' $T/$t.out | tail -2 | tr '\n' ' ' | cut -c1-200)"; [ $rc -ne 0 ] && fail=1
done
if [ -n "$1" ]; then npx --yes esbuild scripts/reflex-eval.ts --bundle --platform=node --outfile=$T/re.cjs --log-level=warning && SHOW=1 node $T/re.cjs "$1" "${2:-60}" > $T/eval.out 2>&1; grep -v '^      ' $T/eval.out | cut -c1-120; fi
exit $fail
