# Sets 31-40: second HELD-OUT validation. Fresh phrasings (written before round-2 tuning), fresh seed.
# Run after gen4:  PYTHONHASHSEED=0 python3 -I gen5.py
import os, random, re
HERE=os.path.dirname(os.path.abspath(__file__))+"/"
exec(open(HERE+"gen4.py").read().split("def gen4")[0])
S['task']=S['task']+"reorganise the shed|send the RSVP|buy cat litter|clean the oven|download the receipts|reset my password|donate old clothes|book the MOT|text the babysitter|pick up the dry cleaning|trim the hedge|compare broadband deals|update my LinkedIn|label the boxes|empty the dishwasher".split("|")
S['person']=S['person']+["Aunt Rosa","Theo","Imani","my accountant","Coach Dan","the caretaker"]
S['app']=S['app']+["Reddit","Pinterest","Prime Video","Bumble","Google Drive","Notion","Waze"]
S['fact']=S['fact']+["my shoe size is 9","I'm allergic to cats","my gym locker is 114","the boiler code is 7731","I get the bus at 7:40"]
S['hobit']=S['hobit']+["do push-ups","take a walk after lunch","write in my gratitude book","read the news","do yoga"]
H5={
 'add_task':["I've got to {task} {when}","slot in {task}","new item: {task}","add to my list, {task}","help me remember to {task} {when}","pencil in {task} for {when}","I must {task} by {when}"],
 'complete':["got {task} done","{task} - finished","that's {task} complete","I've handled {task}","check {task} off","{task} has been dealt with","wrapped {task} up"],
 'list_tasks':["what do I still have to do","show what's pending","remind me what's on my list","which tasks are open","what's my workload {when}","what jobs are left","give me my open tasks"],
 'update_task':["alter {task}: now due {when}","set {task} to {pr} priority","reword {task} as {task}","{task} is more important than I thought","{task} should be {pr} priority","reprioritise {task}"],
 'delete_task':["strike {task} from the list","I'm not going to {task}, remove it","wipe {task} off my tasks","lose the {task} task","discard {task}","{task} isn't happening, delete it"],
 'mits':["decide my top three for {when}","which three things matter most {when}","mark {task} as a priority for the day","today's must-do list: {task}, {task}","pick the vital few for {when}"],
 'snooze':["hold off on {task} until {when}","defer {task} to {when}","park {task} till {when}","come back to {task} in {num} minutes","{task} can wait until {when}"],
 'subtasks':["{task} breaks down into {sub} and {sub}","outline the steps for {task}","give {task} a checklist: {sub}, {sub}","{task}: first {sub}, then {sub}","split {task} into bits"],
 'recurring':["{task} should happen every {every}","do {task} each {every} from now on","schedule {task} to recur every {every}","I want {task} on repeat every {every}","make {task} a standing {every} job"],
 'project':["I'm kicking off {proj}, set it up as a project","make a workspace for {proj}","which of my projects are open","show {proj} and its tasks","begin project {proj}"],
 'template':["bring up my {tmpl} template","turn this into a reusable {tmpl} template","which of my templates are saved","launch a {tmpl} from my template","apply {tmpl}"],
 'goal':["one thing I'm working towards: {goal}","add a new target: {goal}","I'm determined to {goal}","by {when}, I want to {goal}","record my goal to {goal}","dream goal: {goal}"],
 'goal_progress':["I'm {num}% done with my goal to {goal}","where do I stand on {goal}","what's my progress on {goal}","have I moved on {goal}","tick my {goal} goal up to {num}%","goal check: {goal}"],
 'mood':["right now I'm {mood}","I'm in a {mood} mood","mood: {mood}","{mood} this afternoon","I've been feeling {mood} about {topic}","today has felt {mood}","record that I'm {mood}"],
 'journal_insights':["what's been bringing me down","give me a read on my moods","how's my emotional week gone","what are the trends in how I feel","analyse my journal","what does my journal say about my mood"],
 'journal_entry':["new journal entry: {mood}, did {task}","write that I felt {mood} after {task}","log in my journal that {person} made my day","journal: grateful for {person} today","my diary entry: {topic} left me {mood}"],
 'remember':["store this: {fact}","a fact about me: {fact}","I want you to know {fact}","make sure you remember {fact}","memorise that {fact}"],
 'recall':["what did I say regarding {topic}","remind me about {person}","do you recall anything about {topic}","pull up what you know on {person}","what have I told you about {topic}","anything stored about {person}"],
 'forget':["I'd like you to forget {topic}","clear what you know about {person}","remove everything about {topic} from memory","please unlearn {topic}","that detail about {topic} should go, forget it"],
 'list_memories':["what have you learned about me","list all my saved facts","read back my memories","what information do you hold on me","show saved memories"],
 'reminder':["set a nudge for {task} {when}","please remind me to {task} at {hr}{mer}","I need a reminder about {task} {when}","reminder: {task} in {num} minutes","buzz me {when} to {task}"],
 'list_reminders':["which reminders do I have","list upcoming nudges","what's scheduled to remind me","reminders for {when}?","show every reminder"],
 'cancel_reminder':["I no longer need the {task} reminder, remove it","cancel my {task} nudge","get rid of the reminder to {task}","unset the reminder for {task}"],
 'alarm':["set an alarm for {hr}{mer}","I need to be up at {hr}:{num}{mer}","alarm at {hr} {mer} {when}","can you wake me {when} at {hr}{mer}","new alarm: {hr}{mer}"],
 'timer':["timer for {num} minutes","I need a {num} minute countdown","start counting {num} minutes","{num} mins on the clock","set a {num}-minute timer"],
 'open_app':["open {app} now","can you open {app}","I'd like to use {app}","load {app}","run {app}","launch the {app} app"],
 'device':["what's the battery at","check my battery","switch the flashlight on","flashlight please","tell me about this device","open phone {setting} settings","show installed apps"],
 'sms':["text {person}: {task} sorted","send {person} an sms that I'm late","write a message to {person} about {task}","drop {person} a text saying see you {when}","sms {person} happy birthday"],
 'call':["phone {person}","I'd like to call {person}","dial up {person}","start a call with {person}","find {person}'s number","what number does {person} have"],
 'email':["send an email to {person} about {topic}","mail {person} regarding {task}","compose a message for {person}, subject {topic}","email this to {person}","share this note with {person}"],
 'calendar':["add {ev} on {when} at {hr}{mer}","schedule an appointment: {ev} {when}","show my calendar for {when}","what events do I have {when}","is there anything booked {when}","create a calendar entry for {ev} {when}"],
 'planning':["organise my {when}","how's my schedule {when}","plan out {when} for me","what should my day look like","give me today's agenda","make a plan for {when}","summary of my day"],
 'time':["what time is it now","what's today's date","how many days to {when}","what's the date {when}","tell me the time"],
 'calc':["what does {expr} come to","{expr} = ?","work out {expr} for me","I need {expr} calculated","solve {expr}"],
 'convert':["what's {num} {unit} in {unit}","{num} {unit} to {unit}?","convert {num} {unit} into {unit}","express {num} {unit} as {unit}"],
 'clipboard':["read out my clipboard","what's copied right now","copy this to clipboard: {fact}","clipboard contents please","save {expr} to my clipboard"],
 'web':["search online for {q}","can you look up {q}","find info on {q}","visit {site}","load up {site}","web search {q}","what's online about {q}"],
 'library':["what's {q2} according to {doc}","look through {doc} for {q2}","find the {q2} in {doc}","{doc}: what about {q2}","scan {doc} for {q2}"],
 'habit':["add habit: {hobit}","I want to build a habit to {hobit}","log that I did {hobit}","did {hobit} today","show my habit stats","how consistent have I been","track {hobit} daily"],
 'note':["new note: {note}","take a note on {note}","create a note titled {note}","find notes about {note}","look up my {note} note","write up {note}: {sub}, {sub}"],
 'focus':["begin a {dur} minute focus session","focus mode for {dur} min on {task}","pause focus","how many minutes have I focused","run a pomodoro","I want {snd} on","switch the {snd} off"],
 'persona':["from now on be {pers}","can you sound {pers}","change tone to {pers}","I'd prefer if you were {pers}","please be {pers}","rename yourself Friday"],
 'progress':["what's my current level","show XP","any streaks going","quest list","how many achievements have I got","my progress stats"],
 'smalltalk':["hey","morning jarvis","thank you","you're brilliant","say something funny","who are you","good evening","ok cool","what's up"],
}
for c in CATS: T[c]=(T[c][0],H5[c])
def gen5(seed,seen):
    r=random.Random(seed); out=[]; lab=[]
    ops=["","","","","jarvis, ","hey jarvis, ","hello jarvis ","could you ","can you ","i want you to ","jarvis please ","um, ","so, ","actually, ","quick thing: "]
    tl=["",""," please"," ta"," thanks mate"," ?"," now"," 👍"," ok"," when you can"," !"]
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
    for n in range(21,31):
        for m in open(f"{HERE}jarvis_messages_{n}.md"):
            if ". " in m[:9]: seen.add(hash(m.split(". ",1)[1].rstrip("\n")))
    for n in range(31,41):
        d,l=gen5(9000+n,seen)
        with open(f"{HERE}jarvis_messages_{n}.md","w") as f:
            f.write(f"# Jarvis HELD-OUT Validation Messages, Set {n}\n\n1,000,000 unique messages, fresh phrasings, never used for tuning. Labels in .labels sidecar.\n\n")
            f.writelines(f"{i}. {m}\n" for i,m in enumerate(d,1))
        open(f"{HERE}jarvis_messages_{n}.labels","w").write("\n".join(map(str,l))+"\n")
        print(n,flush=True)
