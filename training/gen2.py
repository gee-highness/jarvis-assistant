src=open("gen.py").read().split("a,s=gen(1")[0]
exec(src)
import hashlib
def h(m): return hash(m)
def gen2(seed,seen):
    r=random.Random(seed); out=[]
    while len(out)<N:
        m=(C(r,op)+tpl(r)).strip()
        if r.random()<.5: m=m+(" "+C(r,pl)).rstrip()
        m=(m+C(r,tail)).strip()
        if r.random()<.15: m=m.lower()
        if r.random()<.04 and len(m)>6:
            i=r.randrange(1,len(m)-2); m=m[:i]+m[i+1]+m[i]+m[i+2:]
        if r.random()<.5: m=m[0].upper()+m[1:]
        if r.random()<.3 and m[-1] not in "?!.)": m+=C(r,[".","!","?",""])
        k=h(m)
        if k in seen: continue
        seen.add(k); out.append(m)
    return out
seen=set()
# register sets 1,2 so new files don't overlap
for s in (1,2):
    for m in open(f"/home/user/jarvis-assistant/training/jarvis_messages_{s}.md"):
        if ". " in m[:9]: seen.add(h(m.split(". ",1)[1].rstrip("\n")))
base="/home/user/jarvis-assistant/training/"
for n in range(3,11):
    d=gen2(100+n,seen)
    with open(f"{base}jarvis_messages_{n}.md","w") as f:
        f.write(f"# Jarvis Training Messages, Set {n}\n\n1,000,000 unique user messages in casual voice (tasks, goals, journal, memory, focus, personality, XP, brain/model, voice). One per line, numbered.\n\n")
        f.writelines(f"{i}. {m}\n" for i,m in enumerate(d,1))
    print(n,flush=True)
