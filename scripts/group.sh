#!/bin/bash
# Per-10M-group workflow:  scripts/group.sh gen|eval|miss|fold|post <lo>   (k = (lo-41)/10 for gen)
cd "$(dirname "$0")/.." || exit 1; lo=$2; mkdir -p /tmp/nbc
case $1 in
 gen) if [ $lo -ge 101 ]; then PYTHONHASHSEED=0 python3 -I training/genr2.py $(( (lo-101)/10 )); else PYTHONHASHSEED=0 python3 -I training/genr.py $(( (lo-41)/10 )); fi ;;
 eval) for n in $(seq $lo $((lo+9))); do node scripts/eval-router.mjs training/jarvis_messages_$n.md > /tmp/ev$n.txt 2>&1 & done; wait; python3 scripts/agg-eval.py $lo $((lo+9)) ;;
 miss) python3 - $lo <<'PY'
import re,sys,collections
lo=int(sys.argv[1]); seen={}
for i in range(lo,lo+10):
    for l in open(f'/tmp/ev{i}.txt'):
        m=re.match(r'\s+(\w+)\s+(\d+)\s+right group offered: ([\d.]+)%\s+e\.g\. (.*)',l)
        if m and float(m[3])<98.5 and m[1] not in seen: seen[m[1]]=(m[3],m[4][:130])
for c,v in seen.items(): print(c,v[0]+'%',v[1])
PY
 ;;
 fold) for n in $lo $((lo+1)); do node scripts/train-router.mjs count training/jarvis_messages_$n.md /tmp/nbc/nb$n.json & done; wait; node scripts/train-router.mjs merge /tmp/nbc/*.json ;;
 post) node scripts/eval-router.mjs training/jarvis_messages_$((lo+9)).md > /tmp/post$lo.txt 2>&1; python3 scripts/agg-eval.py 0 0 2>/dev/null; python3 - $lo <<'PY'
import re,sys
t=ok=0
for l in open(f'/tmp/post{sys.argv[1]}.txt'):
    m=re.match(r'\s+(\w+)\s+(\d+)\s+right group offered: ([\d.]+)%',l)
    if m: t+=int(m[2]); ok+=int(m[2])*float(m[3])/100
    if l.startswith('ROUTER'): g=l.split('avg ')[1].split()[0]
print(f'post-tune (set {int(sys.argv[1])+9}): {100*ok/t:.2f}%  avg groups {g}')
PY
 ;;
esac
