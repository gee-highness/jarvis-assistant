# Rounds for sets 41-100.  PYTHONHASHSEED=0 python3 -I genr.py K     (K=0..5 -> sets 41+10K .. 50+10K)
# Each round draws a DIFFERENT slice of verb phrasings (idx % 6 == K), so its wording is unseen by the model trained on earlier rounds.
import os, random, re, sys
HERE=os.path.dirname(os.path.abspath(__file__))+"/"
exec(open(HERE+"gen5.py").read().split("def gen5")[0])
P={ # cat: (frames, verbs)
 'add_task':(["{V} {task} {when}","{V}: {task}"],"add|log|queue up|note down|put down|record|list|enter|create a task for|register|file|slot in|pencil in|schedule in|stash|capture|track|set up a task to"),
 'complete':(["{V} {task}"],"finished|completed|wrapped up|nailed|smashed|sorted|polished off|knocked off|ticked off|closed out|got through|ended|concluded|handled|accomplished|dispatched|cleared|done and dusted with"),
 'list_tasks':(["{V}","{V} {when}"],"what's pending|show my todos|my list|open items|what remains|task rundown|what's outstanding|enumerate my tasks|tasks please|where do I stand on tasks|what's on deck|what's in the queue|my to-do list|what's up next|items left|display my tasks|any jobs due|read my list"),
 'update_task':(["{V} {task} to {pr} priority","{V} {task} {when}"],"bump|set|change|raise|lower|mark|reassign|adjust|edit|modify|amend|revise|tweak|promote|demote|re-rank|update|retarget"),
 'delete_task':(["{V} {task}","{V} {task} from my list"],"delete|remove|drop|axe|scratch|purge|dump|kill|cancel|junk|trash|abandon|forget about|eliminate|shelve permanently|expunge|cut|unlist"),
 'mits':(["{V} for {when}","{V}: {task}, {task}"],"top priorities|my big three|set my MITs|most important tasks|key tasks|today's focus tasks|critical tasks|must-do items|headline tasks|main objectives|essentials|non-negotiables|vital tasks|priority picks|the big rocks|first things first|core tasks|top three"),
 'snooze':(["{V} {task} {when}"],"snooze|postpone|delay|defer|hold|park|shelve|push back|reschedule|put off|hide|bump|stall|move along|table|set aside|leave|sleep"),
 'subtasks':(["{V} {task}: {sub}, {sub}"],"add steps to|break down|add subtasks for|split|decompose|outline|detail|itemise|chunk up|list steps of|divide|fragment|expand|plan out|structure|sub-divide|map steps for|checklist"),
 'recurring':(["{task} {V}","{V} {task}"],"repeats every {every}|recurs each {every}|every {every}|on repeat every {every}|each {every} without fail|weekly please|set to repeat daily|repeat every {every}|automatic every {every}|ongoing every {every}|regularly every {every}|make recurring every {every}|loop every {every}|cycle every {every}|reappear every {every}|redo every {every}|again every {every}|habitually every {every}"),
 'project':(["{V} {proj}"],"new project|start project|create the project|open project|show project|launch project|set up project|initiate|begin|kick off|list contents of|view project|go into project|what's in project|add project|spin up project|activate project|review project"),
 'template':(["{V} {tmpl}"],"apply template|load template|use the template|save template|store as template|run template|instantiate template|create template|list templates for|fetch template|insert template|pull template|template:|stamp template|make a template called|clone template|reuse template|deploy template"),
 'goal':(["{V} {goal}"],"new goal:|set goal:|my goal is|aim:|target is to|I resolve to|ambition:|objective:|I intend to|goal to|I'm going to|my aim is to|commit to|plan to|vow to|mission:|resolution:|dream:"),
 'goal_progress':(["{V} {goal}"],"progress on|status of my goal to|update goal|how close am I to|am I near|check goal|goal status:|goal update for|{num}% on goal|progress report on|how's the goal|measure progress on|review goal|goal tracker:|milestone for|checkpoint on|where's my goal to|goal standing:"),
 'mood':(["{V} {mood}"],"I feel|my mood is|currently|mood:|I'm|feeling|state of mind:|emotionally|vibe is|today I'm|mentally|right now:|log mood|rate mood|I woke up|I've been|I seem|lately I'm"),
 'journal_insights':(["{V}"],"mood insights|journal analysis|my emotional patterns|mood history|what do my entries say|how's my mental health trending|my feelings this week|emotional trends|reflect on my week|mood report|my sentiment over time|journal summary|mood stats|check my wellbeing|which days feel best|emotional overview|review my mood|stress analysis"),
 'journal_entry':(["{V} {mood} about {topic}","{V} {person}"],"journal:|diary:|dear journal,|add entry:|write in journal:|log in diary:|today's entry:|journal this:|record in my journal:|note in diary:|entry:|gratitude entry:|put in my diary|jot in journal|reflection:|my diary says|new entry|write about"),
 'remember':(["{V} {fact}"],"remember|note|memorise|store|keep in mind|save|log this fact:|learn that|record this:|don't forget|bear in mind|file away:|retain:|commit to memory:|know that|add to memory:|take note that|register that"),
 'recall':(["{V} {topic}","{V} {person}"],"what do you know about|recall|tell me about|do you remember|remind me of|what's the story with|what did I say on|look up in memory|fetch memory of|what's stored on|retrieve what I said about|what was said about|memory check:|what do I know about|dig up|refresh me on|jog my memory about|what have we got on"),
 'forget':(["{V} {topic}","{V} {person}"],"forget|erase memory of|delete memory about|remove from memory|unlearn|drop memory|wipe|purge memory of|clear memory of|discard what you know about|disregard|stop knowing|let go of|scrub|toss memory of|overwrite|nix|remove what you stored about"),
 'list_memories':(["{V}"],"list memories|all memories|show everything stored|memory dump|what do you remember|memory bank|display saved facts|my profile facts|everything about me|knowledge about me|stored info|what you've got on me|your memory contents|print memories|memory index|data you hold on me|memory list|recall all"),
 'reminder':(["{V} {task} {when}"],"remind me to|set reminder to|reminder:|alert me to|ping me to|notify me to|nudge me to|prompt me to|tell me to|buzz me to|flag for me to|make sure I|I need a reminder to|warn me to|cue me to|schedule a nudge to|signal me to|give me a heads up to"),
 'list_reminders':(["{V}"],"my reminders|pending reminders|show reminders|reminder list|upcoming alerts|what alerts are set|reminders today|scheduled pings|active reminders|view reminders|reminders for {when}|which nudges exist|queued reminders|alert list|what will you remind me about|upcoming nudges|reminders overview|list alerts"),
 'cancel_reminder':(["{V} {task}"],"cancel reminder for|delete reminder about|stop reminder:|remove alert for|clear reminder on|disable reminder for|turn off the reminder about|kill reminder for|unschedule reminder:|drop the reminder for|no more reminders about|end reminder:|silence reminder for|erase reminder about|revoke reminder for|abort reminder:|cancel the nudge for|delete the alert for"),
 'alarm':(["{V} {hr}{mer}","{V} {hr}:{num}{mer} {when}"],"alarm at|wake me at|set an alarm for|alarm for|ring me at|get me up at|set wake-up for|new alarm at|buzzer at|morning alarm|wake-up call at|rouse me at|alarm clock for|put an alarm at|schedule alarm at|arrange alarm for|alarm please at|alarm set for"),
 'timer':(["{V} {num} minutes","{V} {num} min"],"timer for|set timer|countdown|start timer|time me|run a timer for|stopwatch down|kitchen timer|count down from|begin countdown|alarm in|set a countdown for|timer of|time out for|ping me after|timer please:|give me a timer of|start the clock for"),
 'open_app':(["{V} {app}"],"open|launch|start|run|load|fire up|bring up|pull up|go into|switch to|boot|access|show me|jump to|run the app|activate|summon|call up"),
 'device':(["{V}"],"battery check|how much power left|torch on|torch off|flashlight on|flashlight off|device details|phone info|list installed apps|apps list|open wifi settings|bluetooth settings|display settings|what's my charge|power level|show system info|handset info|my apps"),
 'sms':(["{V} {person} {task}","{V} {person} that I'll be there {when}"],"text|sms|message|send a text to|tell|drop a line to|write to|shoot a text to|ping|text message to|let know|inform|notify|WhatsApp|send word to|DM|text back|reach out to"),
 'call':(["{V} {person}"],"call|ring|phone|dial|get on the phone with|contact|reach|telephone|give a bell to|buzz|find the number for|look up number for|who is|get hold of|connect me to|speak to|put me through to|number for"),
 'email':(["{V} {person} about {topic}"],"email|mail|send an email to|write an email to|compose email for|draft email to|e-mail|fire off an email to|email about|message by email to|shoot an email to|compose mail to|share by email with|forward to|write a mail to|dispatch email to|send mail to|mail out to"),
 'calendar':(["{V} {ev} {when}"],"add to calendar|schedule|book|put in diary|create event|calendar event:|block time for|set up meeting:|appointment:|plan event|mark in calendar|enter in calendar|reserve|diarise|what's in calendar for|show events for|check availability for|agenda for"),
 'planning':(["{V}","{V} {when}"],"plan my day|day plan|my schedule|today's agenda|plan|organise my time|daily summary|time-block|structure my day|map the day|how's my day looking|run through my day|brief me on the day|schedule overview|weekly review|prepare my day|outline my day|build my day"),
 'time':(["{V}"],"current time|what time is it|time now|today's date|what's the date|date today|days until {when}|how many days to {when}|what day is it|time check|clock check|date check|tell me the date|what's today|how long till {when}|day of the week|today is what|time please"),
 'calc':(["{V} {expr}"],"calculate|compute|what's|work out|solve|evaluate|figure|crunch|maths:|calc|add up|determine|get the result of|run the numbers on|tell me|result of|answer:|quick sum:"),
 'convert':(["{V} {num} {unit} to {unit}"],"convert|change|translate|how many|what's|transform|express|switch|turn|work out|render|in|equivalent of|conversion:|give me|show|figure|calculate"),
 'clipboard':(["{V}"],"read clipboard|paste|what's copied|clipboard contents|copy this: {fact}|copy {expr}|check my clipboard|show clipboard|put on clipboard: {fact}|what did I copy|get clipboard|clipboard please|store in clipboard: {expr}|retrieve clipboard|view clipboard|display clipboard|clip it: {fact}|copy to clipboard {expr}"),
 'web':(["{V} {q}","{V} {site}"],"search|google|look up|find online|web search|browse to|open website|visit|check online|bing|search the internet for|research|find info on|fetch|surf to|query|investigate online|navigate to"),
 'library':(["{V} {q2} in {doc}"],"find|search|look for|check|what's the|extract|locate|scan|dig out|pull|read|lookup|consult|reference|review|grep|hunt for|quote"),
 'habit':(["{V} {hobit}"],"new habit:|start habit:|log|did|completed habit:|track|habit done:|check in:|I did|mark habit done:|record habit:|build habit:|streak for|add habit|habit:|count|I just did|tick|log habit:"),
 'note':(["{V} {note}"],"new note:|note:|make a note of|write a note about|create note|save note:|find note|search notes for|open note|jot:|memo:|write down|record note:|show note on|look up note|add note:|pad:|scribble"),
 'focus':(["{V}"],"focus {dur} minutes|start focus|begin deep work|pomodoro|end focus|stop focus|focus stats|play {snd}|{snd} on|{snd} off|start {snd}|silence {snd}|concentration mode|work session {dur} min|enter flow state|focus timer {dur}|how focused was I|session stats"),
 'persona':(["{V} {pers}"],"be|act|speak|respond|sound|talk|reply|answer|come across|go|switch to being|tone:|style:|personality:|adopt a tone that's|use a style that's|mode:|try being"),
 'progress':(["{V}"],"XP|my level|streak status|quests|achievements|rank|level progress|daily quest|experience points|my stats|badges|how am I scoring|points|score|trophies|XP to next level|levelling|streak count"),
 'smalltalk':(["{V}"],"hello|hi|good morning|good evening|how's it going|thanks a lot|cheers|nice|tell me a joke|motivate me|what can you do|you there|bored|hey|goodnight|well done|thank you|wow"),
}
assert list(P)==CATS, set(CATS)^set(P)
OPS=["","","","","","jarvis ","jarvis, ","hey jarvis ","ok jarvis ","hi jarvis, ","yo ","so ","okay ","right ","please ","could you ","can you ","i'd like you to ","just ","quick: ","um ","erm, ","hey, ","jarvis mate, ","listen jarvis, ","oh and ","and ","also "]
TLS=["",""," please"," thanks"," ta"," thx"," 👍"," 🙂"," !"," ?"," now"," asap"," cheers"," mate"," ok"," when you can"," 🙏"," 😊"," ."," pls"," :)"," for me"," lol"," 💪"," 🤖"]
def genk(k,seed,seen):
    r=random.Random(seed); out=[]; lab=[]
    VS={c:[v for i,v in enumerate(P[c][1].split("|")) if i%6==k] for c in CATS}
    while len(out)<N:
        c=r.choices(CATS,W)[0]; t=r.choice(P[c][0]).replace("{V}",r.choice(VS[c]))
        m=(r.choice(OPS)+fill(r,t)).strip()+r.choice(TLS)
        if r.random()<.2: m=m.lower()
        if r.random()<.04 and len(m)>6:
            i=r.randrange(1,len(m)-2); m=m[:i]+m[i+1]+m[i]+m[i+2:]
        if r.random()<.4: m=m[0].upper()+m[1:]
        h=hash(m)
        if h in seen: continue
        seen.add(h); out.append(m); lab.append(CATS.index(c))
    return out,lab
if __name__=="__main__":
    k=int(sys.argv[1]); seen=set()
    for n in range(41+10*k,51+10*k):
        d,l=genk(k,70000+n,seen)
        with open(f"{HERE}jarvis_messages_{n}.md","w") as f:
            f.write(f"# Jarvis Validation Messages, Set {n}\n\n1,000,000 messages, round {k+1} phrasings. Labels in .labels sidecar.\n\n")
            f.writelines(f"{i}. {m}\n" for i,m in enumerate(d,1))
        open(f"{HERE}jarvis_messages_{n}.labels","w").write("\n".join(map(str,l))+"\n")
        print(n,flush=True)
