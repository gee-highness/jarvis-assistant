# usage: logrow.py lo round pre post  "detector row"  hand   -> appends rows to RESULTS.md and marks HANDOFF
import sys,re
lo,rnd,pre,post,det,hand=sys.argv[1:7]; hi=int(lo)+9
p='training/RESULTS.md'; s=open(p).read()
rows=[l for l in s.split('\n') if re.match(r'\| \d+-\d+ \| speech round',l)]
s=s.replace(rows[-1]+'\n',rows[-1]+f'\n| {lo}-{hi} | speech round {rnd} | {pre}% | {post}% |\n')
s=s.rstrip('\n')+f'\n| {lo}-{hi} | {det} | {hand} |\n'; open(p,'w').write(s)
p='training/HANDOFF.md'; s=open(p).read()
m=re.search(r'- Groups \d+-200 \(K=\d\.\.9\):',s)
s=s.replace(m.group(0),f'- Group {lo}-{hi}: DONE ({pre}% -> {post}%; detector {hand}).\n- Groups {hi+1}-200 (K={int(rnd)}..9):') if hi<200 else s.replace(m.group(0),f'- Group {lo}-{hi}: DONE ({pre}% -> {post}%; detector {hand}). ALL TEN GROUPS DONE.\n- Leftover note:')
open(p,'w').write(s)
