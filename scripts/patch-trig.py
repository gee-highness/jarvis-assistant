import re,sys
# usage: patch-trig.py group 'alt1|alt2'   (appends alternatives to TRIGGERS[group])
g,alt=sys.argv[1],sys.argv[2]; p='src/app/core/tools/tools.service.ts'
L=open(p).read().split('\n')
for i,l in enumerate(L):
    if re.match(r'\s+%s: /'%g,l):
        m=re.search(r'/([a-z]*),\s*$',l); assert m
        j=l.rindex('/'+m.group(1)+','); L[i]=l[:j]+'|'+alt+l[j:]; break
else: sys.exit('no group '+g)
open(p,'w').write('\n'.join(L))
