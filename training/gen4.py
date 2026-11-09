# Sets 21-30: HELD-OUT validation. Same categories as gen3 but NEW phrasings, NEW slot values, NEW seed.
# Never used to tune the router. Run after gen3:  PYTHONHASHSEED=0 python3 -I gen4.py
import os, random, json, re
HERE=os.path.dirname(os.path.abspath(__file__))+"/"
exec(open(HERE+"gen3.py").read().split("if __name__")[0])
S['task']=S['task']+"wash the car|renew my library card|call the council|buy a new charger|defrost the freezer|reply to the recruiter|prep taxes|book a table|edit the video|paint the fence|clean the gutters|update the website footer|sort the recycling|buy stamps|check the smoke alarm|take the dog to the vet|mow the lawn|pay the parking fine|write the speech|iron the shirts".split("|")
S['person']=S['person']+["Nina","Marcus","my cousin","the vet","Mr Okafor","Hannah","my neighbour"]
S['app']=S['app']+["TikTok","Telegram","Outlook","Duolingo","Strava","Audible","Maps","Zoom"]
S['fact']=S['fact']+["my locker code is 4821","I'm lactose intolerant","my cat is called Pixel","the spare key is under the blue pot","my passport expires in March","I park on level 3"]
H={
 'add_task':["whack {task} on the list {when}","put in a task, {task}","I'd better {task} {when}","chuck {task} on my todo","please log a task to {task}","{task} — needs doing {when}","can you queue up {task} ({pr})","make me a task for {task} {when}"],
 'complete':["finished off {task}","{task}, sorted","I've wrapped up {task}","that's {task} ticked","{task} is out of the way","completed: {task}","boom, {task} done"],
 'list_tasks':["what's still open","give me the rundown of my tasks","what do I owe myself {when}","tasks for {when}?","read me my to-do list","what's outstanding","what needs doing {when}"],
 'update_task':["change the priority of {task} to {pr}","relabel {task} as {task}","{task} should be due {when}","edit {task}, make it {pr} priority","shift {task} to {when} instead","flag {task} as urgent"],
 'delete_task':["nuke {task}","take {task} off my list","I don't need to {task} any more, delete it","bin the {task} task","erase {task}","clear {task} out"],
 'mits':["what are my three big things {when}","choose my top priorities for {when}","star {task} as a must-do","make {task} and {task} my must-dos","lock in my MITs"],
 'snooze':["put {task} off until {when}","remind me about {task} later, snooze till {when}","delay {task} by {num} minutes","not today, pause {task} until {when}","leave {task} for {when}"],
 'subtasks':["{task} has parts: {sub}, {sub}","chop {task} into smaller steps","give {task} subtasks: {sub} and {sub}","add steps to {task}: {sub}","list the steps for {task}: {sub}, {sub}"],
 'recurring':["make {task} a weekly thing","{task} on a loop, every {every}","I do {task} every {every}, set it up","set {task} to repeat every {every}","{task} each {every} please"],
 'project':["open a new project, {proj}","I'm starting {proj}, make a project","show me the {proj} project","which projects are active","what's in {proj}","set up {proj} as a project due {when}"],
 'template':["load my {tmpl} template","store this list as a {tmpl} template","stamp out a {tmpl}","which templates have I got","run the {tmpl} template"],
 'goal':["I'd love to {goal}","let's make a goal: {goal}","target: {goal} by {when}","add {goal} to my goals","big ambition: {goal}","I'm hoping to {goal}"],
 'goal_progress':["where am I on my goal to {goal}","I'm {num}% there on {goal}","check progress towards {goal}","am I behind on my goal to {goal}","log progress: {goal} at {num}%","show me where my goals stand"],
 'mood':["mood check: {mood}","I'm {mood} today","feeling kind of {mood} about {topic}","today's mood is {mood}","woke up {mood}","been {mood} since {task}","energy's at {num} and I'm {mood}"],
 'journal_insights':["what's my mood been like lately","spot any patterns in how I feel","summarise my mood this month","what lifts my mood","what usually stresses me out","how's my wellbeing trending"],
 'journal_entry':["add to my journal: {mood} day, did {task}","journal this: I'm thankful for {person}","note in my diary that {topic} was {mood}","entry for today: {task} then {mood}","reflecting on {topic}, I feel {mood}"],
 'remember':["make a note that {fact}","please remember {fact}","store this about me: {fact}","just so you know, {fact}","bear in mind {fact}"],
 'recall':["what do you have on {topic}","tell me what I said about {person}","what was that thing about {topic}","what did I mention about {topic}","do you know who {person} is","what's {person}'s deal again"],
 'forget':["erase the memory about {topic}","please forget about {topic}","you can drop what I said about {person}","remove {topic} from your memory","that fact about {topic} is outdated, forget it"],
 'list_memories':["what's in your memory about me","tell me everything you've stored","dump your memories","what facts do you have on me","what do you know about me so far"],
 'reminder':["nudge me to {task} {when}","set a reminder for {task} at {hr}{mer}","remind me {when} about {task}","wake me up about {task} {when}","give me a heads up to {task} in {num} minutes"],
 'list_reminders':["what reminders are coming up","any reminders set for {when}","show upcoming reminders","which reminders are active"],
 'cancel_reminder':["scrap the {task} reminder","no need to remind me about {task} any more","clear my reminder for {task}","turn off the {task} reminder"],
 'alarm':["alarm for {hr}:{num}{mer}","get me up at {hr}{mer} {when}","set my alarm to {hr} {mer}","I need an alarm {when} at {hr}{mer}","early alarm please, {hr}{mer}"],
 'timer':["{num} minute timer please","time {num} minutes for me","timer: {num} min","count down {num} minutes","egg timer, {num} minutes"],
 'open_app':["pull up {app}","bring up {app}","switch to {app}","I want {app} open","jump into {app}","open up {app} for me"],
 'device':["how's my battery doing","battery level?","is my torch on","light on","turn off the torch","show phone details","jump to {setting} settings","open the {setting} menu","which apps are installed"],
 'sms':["send a text to {person}: running late","shoot {person} a message about {task}","text {person} that I'll be there {when}","message {person}: done with {task}","let {person} know I'm on my way"],
 'call':["give {person} a call","ring up {person}","get {person} on the phone","call {person} {when}","what's the number for {person}","who is {person} in my contacts"],
 'email':["write to {person} about {topic}","email {person}, subject: {task}","send a mail to {person} regarding {topic}","draft an email for {person}","send this over to {person}"],
 'calendar':["pop {ev} in my diary for {when}","create an event: {ev} {when} at {hr}{mer}","what's in my diary {when}","anything on the calendar {when}","put {ev} down for {when}","am I free {when}","what meetings do I have {when}"],
 'planning':["map out my day","how should I spend {when}","build me a schedule for {when}","what's my agenda {when}","wrap up my day for me","recap my day","line up my tasks for {when}"],
 'time':["what's the time","tell me today's date","how long until {when}","what date is it","how many days till {when}","what's the day today"],
 'calc':["what is {expr}","figure out {expr}","calc {expr}","do the maths on {expr}","{expr}?","compute {expr}"],
 'convert':["{num} {unit} is how many {unit}","turn {num} {unit} into {unit}","how much is {num} {unit} in {unit}","change {num} {unit} to {unit}"],
 'clipboard':["show me my clipboard","what did I just copy","put {fact} on the clipboard","grab what's on my clipboard","copy {expr}"],
 'web':["look online for {q}","do a quick search: {q}","can you google {q}","check the web for {q}","browse to {site}","pull up {site}","what does the internet say about {q}"],
 'library':["what does {doc} say on {q2}","dig through {doc} for {q2}","does {doc} mention {q2}","grab the {q2} from {doc}","look in {doc} for the {q2}"],
 'habit':["start tracking {hobit}","new habit: {hobit}","I {hobit} today, log it","count {hobit} as done today","how am I doing on my habits","show my habit streaks","I managed to {hobit}"],
 'note':["start a note: {note}","save a note about {note}","note this down: {note}","pull up my notes on {note}","search notes for {note}","jot {note}: {sub}, {sub}"],
 'focus':["let's focus for {dur} minutes","start a {dur} minute focus block","time to concentrate on {task}","end focus mode","stop the session","how long have I focused","start some {snd}","{snd} please","kill the {snd}"],
 'persona':["be {pers} from now on","I want you {pers}","go {pers}","switch to being {pers}","tone it down, be {pers}","I'll call you Friday from now on","call me chief"],
 'progress':["what's my level","how much XP do I have","check my streak","what quests are active","show me my achievements","how's my progress overall"],
 'smalltalk':["morning","cheers","nice one","got a joke for me","how's it going","pep talk please","what are you good at","hello there","you still there","night night"],
}
for c in CATS: T[c]=(T[c][0],H[c])
def gen4(seed,seen):
    r=random.Random(seed); out=[]; lab=[]
    ops=["","","","","hey jarvis ","jarvis ","hi jarvis, ","excuse me jarvis, ","yo, ","right, ","okay jarvis ","oh and ","right jarvis, ","jarvis mate, "]
    tl=["",""," please"," thanks"," 🙂"," ."," asap"," cheers"," 👌"," thx"," when you get a sec"]
    while len(out)<N:
        c=r.choices(CATS,W)[0]; m=(r.choice(ops)+fill(r,r.choice(T[c][1]))).strip()
        m=m+r.choice(tl)
        if r.random()<.2: m=m.lower()
        if r.random()<.04 and len(m)>6:
            i=r.randrange(1,len(m)-2); m=m[:i]+m[i+1]+m[i]+m[i+2:]
        if r.random()<.4: m=m[0].upper()+m[1:]
        k=hash(m)
        if k in seen: continue
        seen.add(k); out.append(m); lab.append(CATS.index(c))
    return out,lab
if __name__=="__main__":
    seen=set()
    for n in range(1,21):
        for m in open(f"{HERE}jarvis_messages_{n}.md"):
            if ". " in m[:9]: seen.add(hash(m.split(". ",1)[1].rstrip("\n")))
    for n in range(21,31):
        d,l=gen4(5000+n,seen)
        with open(f"{HERE}jarvis_messages_{n}.md","w") as f:
            f.write(f"# Jarvis HELD-OUT Validation Messages, Set {n}\n\n1,000,000 unique messages with unseen phrasings, never used for tuning. Labels in .labels sidecar.\n\n")
            f.writelines(f"{i}. {m}\n" for i,m in enumerate(d,1))
        open(f"{HERE}jarvis_messages_{n}.labels","w").write("\n".join(map(str,l))+"\n")
        print(n,flush=True)
