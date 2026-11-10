import re,collections,sys
lo,hi=int(sys.argv[1]),int(sys.argv[2])
t=collections.defaultdict(lambda:[0,0.0]); tot=0; g=0
for i in range(lo,hi+1):
    for l in open(f'/tmp/ev{i}.txt'):
        m=re.match(r'\s+(\w+)\s+(\d+)\s+right group offered: ([\d.]+)%',l)
        if m: n=int(m[2]); t[m[1]][0]+=n; t[m[1]][1]+=n*float(m[3])/100
        if l.startswith('ROUTER'): tot+=int(l.split()[1].replace(',','')); g+=float(l.split('avg ')[1].split()[0])
        if l.startswith('TIME') and '40/40' not in l: print('TIME',i,l)
print(f'sets {lo}-{hi}: {tot:,} msgs, avg groups {g/(hi-lo+1):.2f}, overall right-group {100*sum(v[1] for v in t.values())/sum(v[0] for v in t.values()):.2f}%')
for c,(n,ok) in sorted(t.items(),key=lambda x:x[1][1]/x[1][0])[:8]: print(f'   {c:16}{100*ok/n:7.2f}%')
