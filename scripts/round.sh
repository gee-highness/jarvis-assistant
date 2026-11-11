#!/bin/bash
# One tuning round for a generated group:  scripts/round.sh pre|post <lo>
#   pre  = honest held-out scores (router + listening detector) and example misses
#   post = rebuild vocab, retrain, re-score
cd "$(dirname "$0")/.." || exit 1; lo=$2
case $1 in
 pre) scripts/group.sh eval $lo | head -6; node scripts/test-support.mjs eval training/jarvis_messages_$((lo+9)).md 10; scripts/group.sh miss $lo ;;
 post) node scripts/build-vocab.mjs >/dev/null; MIN_COUNT=400 scripts/group.sh fold $lo | tail -1; scripts/group.sh post $lo; node scripts/test-support.mjs eval training/jarvis_messages_$((lo+9)).md 10; node scripts/test-support.mjs | grep -c MISS ;;
esac
