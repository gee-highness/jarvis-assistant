# Sets 11-20: 10M more messages covering EVERY tool area, with a .labels sidecar (category per line).
# Run after gen.py + gen2.py:  PYTHONHASHSEED=0 python3 -I gen3.py
import random, json, os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),"gen.py")).read().split("a,s=gen(1")[0])
N=1_000_000
S=dict(
 task=tasks, when=[w for w in whens if not w.startswith("every") and w not in ("monthly",)], every="day|week|weekday|monday|friday|morning|other day|month|evening|sunday".split("|"), pr=["high","low","urgent","medium","top","p1","p2","p3"], proj=projs, goal=goals, mood=moods, fact=facts, snd=sounds,
 person="mum|dad|Sarah|Tom|Emma|Dave|my boss|the landlord|Dr Patel|grandma|my sister|Alex|Priya|Jamal|Chen|Olu|Sofia|the plumber|my brother|Lena".split("|"),
 app="Spotify|Maps|WhatsApp|Camera|Chrome|Gmail|Calendar|Clock|Notes|YouTube|Settings|Photos|Uber|Netflix|Calculator|Files|Weather|Messages|Instagram|Slack".split("|"),
 setting="wifi|bluetooth|display|battery|sound|notifications|location|storage|accessibility|developer options|airplane mode|brightness".split("|"),
 hobit="meditate|read for 20 minutes|drink water|go to the gym|journal|stretch|take vitamins|walk 10k steps|practice guitar|floss|no sugar|cold shower|call a friend|learn spanish|sleep by 11".split("|"),
 num="2|3|5|7|10|12|15|20|25|30|45|60|90|120|250|500|1000".split("|"),
 unit="km|miles|kg|pounds|celsius|fahrenheit|litres|gallons|cm|inches|oz|grams|mph|kph|feet|metres".split("|"),
 expr="12*8|150/6|(45+15)*2|18% of 240|sqrt(144)|2^10|99-37|365/12|7*24|1200*0.2|15% of 80|250+175|3.5*4|1000/7".split("|"),
 q="best pizza near me|weather in london|latest tech news|how tall is mount everest|exchange rate dollar to pound|capital of australia|how to boil an egg|train times to leeds|price of bitcoin|who won the match last night|nearest petrol station|how to tie a tie|movie times tonight|what's a good book on habits|recipe for pancakes|symptoms of flu|is it going to rain|population of canada|flights to rome|sunrise time tomorrow".split("|"),
 site="bbc.co.uk|github.com|youtube.com|reddit.com|amazon.co.uk|gov.uk|wikipedia.org|news.ycombinator.com|nhs.uk|stackoverflow.com".split("|"),
 doc="the lease|my insurance policy|the car manual|my contract|the tax letter|the warranty|my cv|the meeting notes pdf|the router manual|the mortgage agreement".split("|"),
 q2="notice period|deductible|payment date|termination clause|tyre size|warranty length|the deadline|total cost|renewal date|the address".split("|"),
 ev="dentist|team meeting|lunch with Sarah|school pickup|interview|date night|haircut|gym class|call with the client|flight to Lisbon|birthday party|doctor appointment|review with Dave|yoga|dinner with mum".split("|"),
 note="ideas for the app|gift ideas for mum|book recommendations|packing list|wifi details|meeting notes|recipe for stew|things to ask the landlord|project brainstorm|workout plan".split("|"),
 pers="more sarcastic|more formal|chattier|shorter|funnier|more british|more encouraging|less preachy|blunter|like a butler|sassier|calmer|more hyped".split("|"),
 dur="10|15|20|25|30|45|50|60|90".split("|"), hr="5|6|7|8|9|10|11|12".split("|"), mer=["am","pm",""],
 sub=sub, tmpl="morning routine|packing list|weekly review|moving checklist|launch checklist|workout split|study plan|meal prep|travel prep|onboarding".split("|"),
 topic="my diet|the gym|my boss|work stress|my sleep|my budget|the move|my wedding|my dog|my sister".split("|"),
)
T={ # cat: (expected groups any-of, templates)
 'add_task':([],["add {task} {when}","remind me to {task} {when}","new task: {task}","I need to {task} {when}","put {task} on my list","can you add {task} as {pr} priority","jot down {task} for {when}","gotta {task} {when}","task: {task} ({pr} priority)","throw {task} on the pile","stick {task} on my todo for {when}"]),
 'complete':([],["I finished {task}","{task} is done","tick off {task}","mark {task} complete","just did {task}","done with {task}","cross {task} off","all done with {task} now"]),
 'list_tasks':([],["what's on my plate","show my tasks","what's left today","what's overdue","anything due {when}","list everything I haven't done","what should I tackle first","what's on my list for {when}","show me urgent stuff only","how many tasks do I have left"]),
 'update_task':(['tasks'],["rename {task} to {task}","change {task} to {pr} priority","make {task} urgent","move {task} to {when}","push {task} to {when}","bump {task} to {when}","update {task}: due {when}","mark {task} as important"]),
 'delete_task':(['tasks'],["delete {task}","remove {task} from my list","scrap {task}","get rid of {task}","cancel the task {task}","drop {task}, I'm not doing it"]),
 'mits':(['tasks'],["set my top 3 tasks for today","my MITs today are {task} and {task}","make {task} my most important task","pick my priorities for {when}","what are my MITs"]),
 'snooze':(['tasks'],["snooze {task} until {when}","snooze {task} for {num} minutes","postpone {task} to {when}","not now, hide {task} till {when}","push {task} back a day"]),
 'subtasks':(['tasks'],["break {task} into steps","add subtasks to {task}: {sub}, {sub}","split up {task}: {sub} and {sub}","under {task} add {sub}","{task} needs steps: {sub}, {sub}, {sub}"]),
 'recurring':(['tasks','habits'],["{task} every {every}","make {task} repeat weekly","set {task} to recur every monday","{task} daily at {hr}{mer}","{task} weekly","repeat {task} monthly","do {task} every {every} at {hr}{mer}","recurring task: {task} every weekday"]),
 'project':(['templates','tasks'],["create project {proj}","start a project called {proj}","what's in my {proj} project","list my projects","new project {proj} due {when}"]),
 'template':(['templates'],["apply the {tmpl} template","save this as a template called {tmpl}","use my {tmpl} template","list my templates","make a {tmpl} checklist","kick off a {tmpl}"]),
 'goal':(['goals'],["new goal: {goal}","I want to {goal}","set a goal to {goal} by {when}","add the goal {goal}","my ambition is to {goal}","I'm aiming to {goal}"]),
 'goal_progress':(['goals'],["how's my goal to {goal}","update my {goal} goal to {num}%","am I on track to {goal}","show my goals","I'm {num}% of the way to my goal to {goal}","milestone reached on {goal}"]),
 'mood':(['journal'],["I'm feeling {mood}","log my mood: {mood}","today I felt {mood}","mood is {mood}, energy {num}","feeling {mood} after {task}","I feel {mood} about {topic}","rate my day {num} out of 10, mostly {mood}"]),
 'journal_insights':(['journal'],["how have I been feeling this week","show my mood trend","what's making me stressed lately","journal insights please","any patterns in my mood","when am I happiest","what drags my mood down"]),
 'journal_entry':(['journal','notes'],["journal: today was {mood}, I did {task}","dear diary, I'm {mood} because of {topic}","gratitude: {person}, {task}, and good coffee","write in my journal about {topic}","add to my journal that I'm grateful for {person}"]),
 'remember':([],["remember that {fact}","note that {fact}","fyi {fact}","save this: {fact}","keep in mind {fact}","don't forget that {fact}"]),
 'recall':(['memory'],["what do you know about {topic}","what did I tell you about {topic}","who is {person}","do you remember what I said about {topic}","what's my {person}'s number","remind me what I said about {person}","what do I usually do on {when}"]),
 'forget':(['memory'],["forget that {fact}","delete the memory about {topic}","stop remembering {topic}","that's wrong, forget what I said about {person}","wipe what you know about {topic}"]),
 'list_memories':(['memory'],["what do you remember about me","list your memories","show me everything you know about me","what have you saved so far","how much do you know about me"]),
 'reminder':([],["remind me to {task} {when}","remind me in {num} minutes to {task}","ping me about {task} {when}","alert me {when} to {task}","set a reminder: {task} at {hr}{mer}","don't let me forget to {task} {when}"]),
 'list_reminders':(['reminders'],["what reminders do I have","show my reminders","list reminders for {when}","what's pinging me today"]),
 'cancel_reminder':(['reminders'],["cancel the reminder about {task}","delete my reminder for {task}","stop reminding me to {task}","remove the {when} reminder"]),
 'alarm':(['phone'],["set an alarm for {hr}{mer}","wake me at {hr}:{num}{mer}","alarm {when} at {hr}{mer}","set alarm {hr} {mer} labelled {task}","wake me up {when} at {hr}"]),
 'timer':(['phone'],["set a timer for {num} minutes","timer {num} min","start a {num} minute timer","countdown {num} seconds","timer for {num} minutes for the pasta"]),
 'open_app':(['phone'],["open {app}","launch {app}","fire up {app}","start {app}","take me to {app}","go to {app}"]),
 'device':(['phone'],["torch on","turn on the flashlight","flashlight off","what's my battery","how much battery is left","device info","what phone is this","open {setting} settings","take me to {setting} settings","list my apps","what apps do I have"]),
 'sms':(['comms'],["text {person} I'm running late","send {person} a message saying see you {when}","sms {person}: {task} done","draft a text to {person} about {task}","message {person} happy birthday","tell {person} I'll be there {when}"]),
 'call':(['comms'],["call {person}","dial {person}","ring {person}","phone {person} {when}","what's {person}'s number","find contact {person}","look up {person} in my contacts"]),
 'email':(['comms'],["email {person} about {task}","write an email to {person} about {topic}","compose email to {person}: subject {task}","draft a mail to {person}","share this with {person}","share that to {app}"]),
 'calendar':(['calendar'],["add {ev} to my calendar {when}","schedule {ev} {when} at {hr}{mer}","book {ev} for {when}","what's on my calendar {when}","do I have any meetings {when}","read my calendar for {when}","what appointments do I have {when}","block {dur} minutes for {ev} {when}"]),
 'planning':(['planning'],["plan my day","plan my {when}","what does my day look like","give me my schedule for {when}","daily summary please","summarise my day","time block my tasks {when}","fit {task} into my schedule {when}","how's my week looking","review my week"]),
 'time':(['utility','planning'],["what time is it","what's the date today","what day is it {when}","how many days until {when}","days between today and {when}","what's the date in {num} days"]),
 'calc':(['utility'],["what's {expr}","calculate {expr}","{expr} equals what","quick maths: {expr}","how much is {expr}","work out {expr}"]),
 'convert':(['utility'],["convert {num} {unit} to {unit}","how many {unit} in {num} {unit}","{num} {unit} in {unit}","what's {num} {unit} in {unit}"]),
 'clipboard':(['utility'],["what's on my clipboard","read my clipboard","copy this: {fact}","copy {expr} to the clipboard","paste what I copied"]),
 'web':(['web'],["search for {q}","google {q}","look up {q}","find out {q}","search the web for {q}","what's the latest on {q}","open {site}","go to {site}","fetch {site} and summarise it"]),
 'library':(['library'],["what does {doc} say about {q2}","search my files for {q2}","check {doc} for {q2}","in my docs, what's {q2}","find {q2} in {doc}","according to {doc}, what's the {q2}"]),
 'habit':(['habits'],["add a habit: {hobit}","new daily habit: {hobit}","I did {hobit} today","log {hobit}","tick off {hobit} for today","how are my habits","habit report","did I keep my streak on {hobit}","track {hobit} {num} times a week"]),
 'note':(['notes'],["create a note: {note}","make a note called {note}","jot down {note}","search my notes for {note}","find my note on {note}","write down {note}: {sub}, {sub}"]),
 'focus':(['focus'],["start focus for {dur} minutes","pomodoro for {task}","deep work session {dur} min","focus on {task} for {dur} minutes","stop focus","end my session","how much have I focused this week","focus stats","play {snd} while I work","put on {snd}","mute the {snd}"]),
 'persona':(['persona'],["be {pers}","talk {pers}","switch to a {pers} tone","can you be {pers}","change your personality to {pers}","your name is now Friday","call me boss","stop the emoji"]),
 'progress':(['progress'],["what's my XP","what level am I","how's my streak","show my quests","what achievements do I have","how am I doing overall","stats please"]),
 'smalltalk':([],["good morning","thanks","you're the best","tell me a joke","how are you","motivate me","what can you do","i'm bored","let's go","are you there","good night","you rock"]),
}
CATS=list(T); W=[8,3,3,2,2,1,2,2,2,2,2,4,3,4,3,3,2,2,2,2,2,3,3,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,3,2,2,3,2,2][:len(CATS)]
while len(W)<len(CATS): W.append(2)
def fill(r,t):
    import re
    return re.sub(r"\{(\w+)\}",lambda m:r.choice(S[m.group(1)]),t)
def gen3(seed,seen):
    r=random.Random(seed); out=[]; lab=[]
    while len(out)<N:
        c=r.choices(CATS,W)[0]; m=(r.choice(op)+fill(r,r.choice(T[c][1]))).strip()
        if r.random()<.5: m=m+(" "+r.choice(pl)).rstrip()
        m=(m+r.choice(tail)).strip()
        if r.random()<.15: m=m.lower()
        if r.random()<.04 and len(m)>6:
            i=r.randrange(1,len(m)-2); m=m[:i]+m[i+1]+m[i]+m[i+2:]
        if r.random()<.5: m=m[0].upper()+m[1:]
        if r.random()<.3 and m[-1] not in "?!.)": m+=r.choice([".","!","?",""])
        k=hash(m)
        if k in seen: continue
        seen.add(k); out.append(m); lab.append(CATS.index(c))
    return out,lab
if __name__=="__main__":
    base=os.path.dirname(os.path.abspath(__file__))+"/"
    seen=set()
    for n in range(1,11):
        for m in open(f"{base}jarvis_messages_{n}.md"):
            if ". " in m[:9]: seen.add(hash(m.split(". ",1)[1].rstrip("\n")))
    json.dump({c:T[c][0] for c in CATS},open(base+"categories.json","w"))
    for n in range(11,21):
        d,l=gen3(1000+n,seen)
        with open(f"{base}jarvis_messages_{n}.md","w") as f:
            f.write(f"# Jarvis Training Messages, Set {n}\n\n1,000,000 unique user messages covering every tool area. One per line, numbered; categories in the .labels sidecar.\n\n")
            f.writelines(f"{i}. {m}\n" for i,m in enumerate(d,1))
        open(f"{base}jarvis_messages_{n}.labels","w").write("\n".join(map(str,l))+"\n")
        print(n,flush=True)
