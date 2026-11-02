import random, sys
N=1_000_000
op=["","","","","yo jarvis, ","hey jarvis ","jarvis, ","jarvis ","ok jarvis, ","alright jarvis, ","hey, ","quick one: ","oi jarvis ","good morning jarvis, ","evening jarvis, ","sup jarvis, ","jarvis buddy, ","hey man, ","right then jarvis, ","so jarvis, ","um jarvis, ","listen, ","real quick, ","one sec jarvis, ","hmm jarvis, ","btw ","also, ","okay so ","jarvis old friend, ","hey j, "]
pl=["","","","","","please","pls","thanks","thx","when you can","asap","no rush","cheers","ty","if you don't mind","thank you sir","ta","mate","ok?","yeah?","for me","real quick","right now","today","nice one","legend"]
tasks="""call mum|buy milk|book the dentist|pay the electric bill|renew car insurance|finish the quarterly report|email the landlord|water the plants|take out the bins|back up my phone|update my CV|reply to Sarah|fix the leaky tap|order dog food|plan the weekend trip|clean the kitchen|do the laundry|book flights to Lisbon|submit the tax return|prep the slides for Monday|go to the gym|meal prep for the week|review the pull request|write the blog post|sort out the garage|renew passport|buy birthday gift for dad|schedule oil change|read chapter 4|practice guitar|call the bank|cancel the old subscription|refactor the login screen|fix the failing CI build|test the new APK|write unit tests for the widget|ship the beta|organise my photos|pick up the parcel|return the amazon package|book a haircut|stretch for ten minutes|meditate|walk the dog|study for the exam|finish the essay|vacuum the flat|buy groceries|get a flu shot|file expenses|send the invoice|follow up with the client|learn 20 spanish words|check the tyre pressure|charge the power bank|clear my inbox|plan the sprint|draft the proposal|prepare for the interview|renew gym membership|change the lightbulb|fold the clothes|call the plumber|pay rent|transfer savings|buy a present for Emma|book the table for Friday|reset the router|update the budget sheet|write thank you cards|check on grandma|post the letter|take vitamins|drink more water|clean the desk|sharpen the knives|deploy the website|watch the lecture|upgrade the phone|clean the fridge|print the tickets|pack for the trip|renew the domain|check the server logs|water the herbs|bake bread|read the contract|sign the form|journal before bed|stand up and stretch|plan tomorrow|review my goals""".split("|")
whens="""today|tomorrow|tonight|this evening|this afternoon|tomorrow morning|next monday|next friday|on the weekend|at 5pm|at 9am|at 7:30|at noon|by friday|by end of day|by the end of the week|in an hour|in 30 minutes|in two days|next week|every day|every monday|every weekday|every morning|every other day|monthly|on the 1st|the day after tomorrow|this saturday|before lunch|after work|at 6:45am|at 8pm|by tuesday|next month|on sunday evening|first thing tomorrow|later today|this weekend|in 3 hours""".split("|")
pr=["","","","","","high priority","low priority","urgent","p1","p2","medium priority","top priority","not urgent","important","can wait"]
projs="""Home Reno|Side Hustle|Jarvis App|Work Stuff|Uni|Fitness Plan|Holiday Plans|Finances|Garden|Wedding|Moving House|Book Draft|Learning Spanish|Car Stuff|Admin|Family|Podcast|Startup|Thesis|Personal""".split("|")
goals="""run a half marathon|save 5000 pounds|read 24 books this year|learn guitar|lose 5 kilos|meditate daily|launch the app|get promoted|learn spanish|sleep 8 hours|write a novel|bench 100kg|quit sugar|cut screen time|build a side income|get my driving licence|finish my degree|cook at home more|drink 2 litres of water|walk 10k steps a day""".split("|")
moods="""great|good|okay|meh|tired|stressed|anxious|happy|stoked|exhausted|calm|low|buzzing|irritated|overwhelmed|pretty chill|fantastic|rough|drained|motivated|a bit down|really good|proper knackered|unfocused|content""".split("|")
facts="""my dog is called Biscuit|I'm allergic to peanuts|my sister's birthday is on March 3rd|I prefer tea over coffee|my wifi password is in the blue notebook|I work best in the mornings|my car is a blue Corolla|I'm vegetarian|my manager is called Dave|I wake up at 6:30|my gym is on High Street|I hate phone calls|my mum's number ends in 4471|I take the 8:15 train|my favourite film is Interstellar|I'm learning Spanish|my flat number is 12B|I'm saving for a house|I don't eat after 8pm|my best mate is Tom|I study better with lo-fi|my doctor is Dr Patel|I'm left-handed|I drive a manual|my anniversary is June 14th""".split("|")
recall=["what's my dog called","when's my sister's birthday","what time do I wake up","who's my manager","what do I drink in the morning","what's my flat number","what was my goal again","what's my car","who's my best mate","what did I tell you about my diet","do I have any allergies","where's my gym","what train do I take","what did I say about phone calls","what's my favourite film","what was I stressed about last week","remind me what I'm saving for","who's my doctor","what do I study to","what's my mum's number"]
sounds="""rain|brown noise|lo-fi|white noise|ocean waves|forest|cafe ambience|fireplace|thunderstorm|pink noise|birdsong|binaural beats|deep focus|wind""".split("|")
persona=["more sarcastic","more formal","a bit chattier","shorter replies","funnier","like Jarvis from Iron Man","more British","more encouraging","less preachy","straight to the point","more like a butler","way more sassy","calmer","more hype","more blunt"]
models="""Nano Swift|Max 8B|the recommended model|the 3B model|the smaller model|the biggest model|the memory engine|Qwen3 0.6B|the fast one|the smart one""".split("|")
sub=["research options","get quotes","compare prices","draft an outline","collect documents","make a shortlist","ask for feedback","book a slot","write the first draft","proofread","send it off","double check the numbers","gather receipts","find a template","set a reminder"]
tail=["","","","",""," :)"," 😅"," 🙏"," 🔥"," lol"," haha"," thx"," ✌️"," 👍"," !!"," please"," cheers"," 🤖"," :D"," ok?"," ty"," 💪"," asap"," xx"]
def C(r,l): return r.choice(l)
def tk(r): return C(r,tasks)
def T(r): 
    x=C(r,whens); return (" "+x) if r.random()<.8 else ""
def P(r):
    x=C(r,pr); return (" "+x) if x and r.random()<.35 else ""
def tpl(r):
    k=r.random()
    n=r.randint(2,3500)
    if k<.22:
        v=C(r,["add task","remind me to","put on my list:","new task:","add a reminder to","I need to","don't let me forget to","make a task to","schedule","jot down:","I gotta","can you add","note to self:","I should","todo:","remember to"])
        return f"{v} {tk(r)}{T(r)}{P(r)}"
    if k<.30:
        v=C(r,["mark","tick off","complete","I finished","done with","I just did","cross off","check off","I've done","knocked out"])
        return f"{v} {tk(r)} {C(r,['as done','','off','done','- finished','is done'])}".replace("  "," ").strip()
    if k<.36:
        return f"{C(r,['move','push','reschedule','postpone','bump','shift'])} {tk(r)} to{T(r) or ' tomorrow'}"
    if k<.42:
        return f"{C(r,['what do I have','what\'s on','show me my tasks','list my tasks','what\'s left','what\'s due','what\'s the plan','anything urgent','what should I do first','what\'s next on the list'])}{T(r) if r.random()<.5 else ''}"
    if k<.47:
        return f"{C(r,['add subtask','break down','split up','make subtasks for','under'])} {tk(r)}: {C(r,sub)}, {C(r,sub)}{C(r,['',' and '+C(r,sub)])}"
    if k<.52:
        return f"{C(r,['make it recurring:','repeat','set up a recurring task:','every week:'])} {tk(r)} {C(r,['every day','every monday','weekly','monthly','every weekday','every morning','every other day','on the 1st of each month'])}"
    if k<.57:
        return f"{C(r,['create project','new project called','start a project:','make a project for','add project'])} {C(r,projs)}{C(r,['',' with a template',' and add 3 tasks',' - deadline '+C(r,whens)])}"
    if k<.62:
        return f"{C(r,['set a goal to','new goal:','my goal is to','I want to','add goal:','I\'m aiming to'])} {C(r,goals)}{C(r,['',' by december',' this year',' by summer',' in 3 months',' by '+C(r,whens)])}"
    if k<.65:
        return f"{C(r,['how\'s my progress on','update my goal to','am I on track to','how far am I from'])} {C(r,goals)}"
    if k<.72:
        return f"{C(r,['journal:','dear diary,','log my mood:','write in my journal that','journal entry:','feeling','today I felt','note my mood:'])} {C(r,['i\'m feeling ','i feel ','i\'m ','',''])}{C(r,moods)}{C(r,['',' today',' tbh',' after work',' since this morning',', work was '+C(r,moods),', slept '+C(r,['badly','well','ok','like a baby','4 hours']),', mostly because '+C(r,['the deadline','the weather','the gym','of Tom','the commute','money stuff','too much coffee']) ])}"
    if k<.75:
        return f"{C(r,['show my mood trend','how\'s my mood been','mood chart for','how have I been feeling'])} {C(r,['this week','this month','lately','over the last 7 days','since January','this year'])}"
    if k<.82:
        return f"{C(r,['remember that','remember:','FYI','note that','keep in mind','save this:','for the record,','don\'t forget that'])} {C(r,facts)}"
    if k<.87:
        return f"{C(r,recall)}{C(r,['?','','??',' again?','?'])}"
    if k<.90:
        return f"{C(r,['start focus mode with','play','put on','focus sounds:','I need','give me some'])} {C(r,sounds)}{C(r,['',' for 25 minutes',' for an hour',' for 45 min',' for 90 mins',' until 5pm','',' pomodoro style'])}"
    if k<.92:
        return f"{C(r,['stop the','turn off','pause the','mute the'])} {C(r,sounds)}"
    if k<.94:
        return f"{C(r,['be','talk','can you be','switch your personality to','change tone:','act'])} {C(r,persona)}"
    if k<.96:
        return f"{C(r,['what\'s my XP','what level am I','how\'s my streak','show quests','what quests do I have','how close am I to level up','did I keep my streak','daily quest status','how many XP for next level','show my achievements'])}"
    if k<.975:
        return f"{C(r,['switch brain to','download','which is better for my phone:','is it slow on','try','use'])} {C(r,models)}{C(r,['?','',' pls',', my phone has '+str(C(r,[4,6,8,12]))+'GB RAM'])}"
    if k<.985:
        return f"{C(r,['why is it so slow','how many tokens per second am I getting','are you working offline','do you need wifi','is my data private','how much storage does the model use','why did the download fail','is the model verified'])}{C(r,['?',' today?','',' right now?'])}"
    if k<.992:
        return f"{C(r,['open widget chat','how do I add the mic widget','where\'s the home screen widget','start voice mode','listen to me','read that out loud','stop talking','speak slower','talk faster'])}"
    return f"{C(r,['good morning','good night','thanks','you\'re the best','tell me a joke','how are you','what can you do','what\'s the weather like','what time is it','give me a pep talk','motivate me','i\'m bored','daily briefing','summarise my day','plan my day','what did I get done this week','brief me','let\'s go','talk to me','are you there'])}"
def gen(seed,skip):
    r=random.Random(seed); out=[]; seen=set(skip)
    while len(out)<N:
        m=(C(r,op)+tpl(r)).strip()
        if r.random()<.5: m=m+(" "+C(r,pl)).rstrip()
        m=(m+C(r,tail)).strip()
        if r.random()<.15: m=m.lower()
        if r.random()<.04 and len(m)>6:
            i=r.randrange(1,len(m)-2); m=m[:i]+m[i+1]+m[i]+m[i+2:]
        if r.random()<.5: m=m[0].upper()+m[1:]
        if r.random()<.3 and m[-1] not in "?!.)": m+=C(r,[".","!","?",""])
        if m in seen: 
            m=m+" "+C(r,["#"+str(r.randint(1,9999)),"(ref "+str(r.randint(1,99999))+")"]) if r.random()<.0 else m
            if m in seen: continue
        seen.add(m); out.append(m)
    return out,seen
a,s=gen(1,set())
b,_=gen(2,s)
base="/home/user/jarvis-assistant/training/"
for name,t,d in((base+"jarvis_messages_1.md","Jarvis Training Messages, Set 1",a),(base+"jarvis_messages_2.md","Jarvis Training Messages, Set 2",b)):
    with open(name,"w") as f:
        f.write(f"# {t}\n\n1,000,000 unique user messages in casual voice (tasks, goals, journal, memory, focus, personality, XP, brain/model, voice). One per line, numbered.\n\n")
        f.writelines(f"{i}. {m}\n" for i,m in enumerate(d,1))
