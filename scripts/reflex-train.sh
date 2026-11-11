#!/bin/bash
# Reflex training run over sets 201-250: generate what is missing, fold each group into the trained intent model,
# score Reflex on the group's last set after each fold, then run every suite on the final model.
cd "$(dirname "$0")/.." || exit 1; L=${TMPDIR:-/tmp}/reflex-train.log; : > $L
say() { echo "$@" | tee -a $L; }
scripts/reflex-ci.sh training/jarvis_messages_180.md 60 > /tmp/reflex-ci/ci0.txt 2>&1; say "START suites: $(grep -c 'rc=0' /tmp/reflex-ci/ci0.txt)/7 ok; set180 $(grep 'REFLEX intent' /tmp/reflex-ci/ci0.txt | cut -d: -f2 | cut -d' ' -f2)"
for lo in 201 211 221 231 241; do
  [ -s training/jarvis_messages_$((lo+9)).labels ] || scripts/group.sh gen $lo > /tmp/gen$lo.log 2>&1
  pre=$(node /tmp/reflex-ci/re.cjs training/jarvis_messages_$((lo+9)).md 60 2>&1 | grep 'REFLEX intent' | cut -d: -f2 | cut -d' ' -f2)
  MIN_COUNT=400 scripts/group.sh fold $lo > /tmp/fold$lo.log 2>&1
  npx --yes esbuild scripts/reflex-eval.ts --bundle --platform=node --outfile=/tmp/reflex-ci/re.cjs --log-level=warning
  node /tmp/reflex-ci/re.cjs training/jarvis_messages_$((lo+9)).md 60 > /tmp/reflex-ci/eval$lo.out 2>&1
  say "GROUP $lo-$((lo+9)): before fold $pre, after fold $(grep 'REFLEX intent' /tmp/reflex-ci/eval$lo.out | cut -d: -f2 | cut -d' ' -f2); weakest: $(grep -v '^      ' /tmp/reflex-ci/eval$lo.out | head -3 | awk '{print $2, $1}' | tr '\n' ';')"
done
scripts/reflex-ci.sh training/jarvis_messages_200.md 60 > /tmp/reflex-ci/ci1.txt 2>&1; say "END suites: $(grep -c 'rc=0' /tmp/reflex-ci/ci1.txt)/7 ok; set200 $(grep 'REFLEX intent' /tmp/reflex-ci/ci1.txt | cut -d: -f2 | cut -d' ' -f2)"
node scripts/test-support.mjs | grep right | tee -a $L
say DONE
