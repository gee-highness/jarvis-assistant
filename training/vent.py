# Venting / distress sentences for the listening-mode detector (labels: vent, crisis).
# Written the way people actually talk when they are low: indirect, no clinical words needed.
# make(r,k) -> (sentence, 'vent'|'crisis').  Round k uses a third of every list (index%3==k%3).
OPEN=["","","","","","","honestly, ","I don't know, ","can I be honest? ","I don't really know how to say this but ","this is probably stupid but ",
"sorry to dump this on you but ","I've never told anyone this but ","not gonna lie, ","to be honest ","idk, ","ugh, ","Jarvis, ","look, ","the truth is ",
"I guess ","it's just that ","I think ","lately ","these days ","right now ","tonight ","I hate saying it but ","okay so ","so, ","thing is, ",
"can I tell you something? ","I need to say this out loud, ","I haven't said this to anyone, ","between you and me, ","I'm not sure why but ","if I'm honest "]
PEOPLE=["mum","dad","girlfriend","boyfriend","wife","husband","best friend","boss","brother","sister","partner","family","friends","kids","ex","flatmate"]
PEV=["isn't speaking to me","left","said some things I can't stop thinking about","doesn't understand me at all","walked out on me","shouted at me again",
"and I had a huge fight","acts like I'm not even there","keeps telling me to just get over it","has no idea how bad it's got","thinks I'm fine",
"died last year and it still doesn't feel real","is disappointed in me, I can tell","stopped calling","doesn't want me around","moved on like I was nothing",
"only notices me when something goes wrong","told me I'm too much","says I'm being dramatic","would never get it if I told them","is all I had and now that's gone"]
V=["I don't even know why I bother anymore","everything just feels like too much","I haven't left my room in days","I smile all day and then come home and stare at the wall",
"I can't remember the last time I felt like myself","it's like I'm watching my life from the outside","I'm so tired and sleep doesn't fix it","nothing I do is ever good enough",
"I keep pretending I'm fine","I don't have anyone I can really talk to","my chest feels tight all the time","I can't keep doing this","I feel like I'm falling behind everyone",
"I feel invisible","I feel like a ghost in my own house","everything feels heavy","I'm tired of everything","some days I can barely breathe","nothing seems to matter anymore",
"I feel completely stuck","I feel like I'm letting everyone down","I don't feel like I belong anywhere","I woke up and just wanted the day to be over","I couldn't get out of bed this morning",
"I've been lying here for hours doing nothing","I can't stop the thoughts in my head","my mind won't shut up at night","I lie awake going over everything I've done wrong",
"I've stopped caring about things I used to love","I don't enjoy anything anymore","food doesn't even taste of anything","I can't concentrate on anything",
"I keep messing everything up","I ruin everything I touch","I'm never going to be good enough","I feel like such a disappointment","I'm sick of being me",
"I don't recognise myself anymore","I've been holding it together for so long","I'm running on empty","I've got nothing left to give","I'm barely hanging on",
"I'm at the end of my rope","it's all piling up on me","I feel like I'm sinking","it feels like the walls are closing in","I feel trapped in my own life",
"nobody would even notice how bad it is","nobody ever asks how I am","people only call when they need something","I've pushed everyone away","I've got no one",
"I spent the whole weekend without speaking to a single person","I eat dinner on my own every night","everyone else seems to have someone","I feel left out of everything",
"I wish someone would just give me a hug","I just want someone to understand","I want to scream","I ended up sobbing in the car","I locked myself in the bathroom at work",
"I broke down in the shower again","my eyes keep welling up for no reason","I can't stop shaking","my heart is racing and I don't know why","my stomach is in knots all day",
"I'm dreading tomorrow","I dread waking up","I can't face people today","I cancelled on everyone again","I've been avoiding my phone for days",
"I keep snapping at people I love","I'm angry all the time and I don't know why","I'm so angry I could punch a wall","I'm fed up with trying so hard for nothing",
"I gave it everything and it still wasn't enough","I lost my job and I don't know who I am without it","I failed again","I'm so behind I'll never catch up",
"I feel like a fraud","everyone's going to find out I can't cope","I'm scared this is just how life is now","I'm frightened it will never get better",
"I don't see things getting better","I've felt like this for months","it's been like this since I was a kid","it's getting worse and I can't stop it",
"I thought I was over it but I'm not","it all came flooding back today","I keep thinking about what happened","I can't forgive myself for it",
"I should have been there and I wasn't","it was my fault","I let them down when it mattered","I still talk to them even though they're gone",
"the house is so quiet without them","I keep expecting them to walk through the door","I never got to say goodbye","it's the anniversary and I can't function",
"I'm tired of being strong for everyone","I look after everybody and nobody looks after me","I'm so tired of putting on a brave face","I'm worn out from acting normal",
"I don't want to be a bother to anyone","I feel like I'm too much for people","I think people are better when I'm not in the room","I always end up on my own",
"I've been drinking more than I should just to switch off","I can't get through the evening without something to numb it","I just sit and scroll so I don't have to think",
"I feel nothing at all","I can't even cry anymore","I feel hollow","there's this weight on me that won't lift","there's a lump in my throat all day",
"I don't know what's wrong with me","I don't know how much longer I can keep this up","I can't see a way through this","I've run out of ideas",
"I'm trying so hard and nobody can tell","I just need someone to hear me","I don't want advice, I just need to get it out","I've been carrying this by myself for years",
"I never talk about this","it's hard for me to say any of this","I don't trust anyone with this stuff","last time I opened up it got thrown back at me",
"I saw a counsellor once and it did nothing","talking never changed anything for me","I don't think anyone can help me","I'm past helping probably",
"today was awful","this week has broken me","it's been a horrible few months","I had the worst night","everything went wrong today and I can't laugh it off",
"I feel like I'm about to burst","I'm one bad day away from losing it","I've been biting my tongue for so long","I swallow it all and it's eating me up"]
TAIL=["",""," and I don't know what to do"," and I can't stop thinking about it"," again"," lately"," and it's getting worse"," and I'm scared it won't change",
", I just needed to tell someone"," and I'm so tired"," and nobody knows"," and I hate it"," and I don't know why"," if that makes sense",", that's all",
" and I feel pathetic for saying it"," and I can't tell anyone"," and it won't go away",", sorry"," and I don't know who else to tell"," and it's too much",
" and I'm done pretending otherwise"," and that's the truth"," and I can't shake it"]
CONN=[" and "," and honestly ",", and ",". ",", ",". and "," because "," and on top of that ",", plus "," and then ",". I mean, "," but "]
C=["I don't see myself being around much longer","everyone would be fine without me","I keep thinking about not waking up","I've been thinking about ending it",
"I wrote a goodbye note last night","I don't want to be alive anymore","I think about dying a lot","I've been looking up ways to do it","I'm scared of what I might do to myself",
"I can't promise I'll be safe tonight","sometimes I wish I could just disappear for good","I want the pain to stop for good","they'd all be better off if I was gone",
"I've got pills saved up","I don't think I'll make it to next week","I wish I'd never been born","I wish I could go to sleep and not wake up","I've been planning how I'd do it",
"I don't want to be here anymore","I stood on the bridge for a long time today","I keep imagining my own funeral","I've started giving my things away",
"I think about hurting myself","I hurt myself again last night","I've been cutting again","the only way out I can see is dying","there's no point in me being alive",
"I'm thinking of killing myself","I want to die","I just want it all to end","I've had enough of living","I can't see myself having a future",
"I'd rather be dead than feel this","I'm a burden and they'd be relieved if I went","I've decided I'm done with life","I nearly did something to myself yesterday",
"I don't trust myself to be alone right now","I've been saying my goodbyes","living hurts too much","I don't plan on being here for my next birthday",
"what's the easiest way to go","I keep thinking they'd cope without me","I feel like ending everything","I'm thinking about suicide","my life isn't worth living",
"I looked at the knife for a long time","if I vanished tomorrow nobody would care"]
def _sl(L,k): return [x for i,x in enumerate(L) if i%3==k%3 or x==""]
def make(r,k):
    o=r.choice(_sl(OPEN,k)); Vs=_sl(V,k); x=r.random()
    if x<.16:
        c=r.choice(_sl(C,k)); y=r.random()
        if y<.76: m=c   # mostly on their own, so the crisis class learns its own words, not general sadness
        elif y<.88: m=c+r.choice(CONN)+r.choice(Vs)
        else: m=r.choice(Vs)+r.choice(CONN)+c
        return o+m+r.choice(_sl(TAIL,k)),'crisis'
    if x<.3: m="my "+r.choice(PEOPLE)+" "+r.choice(_sl(PEV,k))+(r.choice(CONN)+r.choice(Vs) if r.random()<.6 else "")
    elif x<.5: m=r.choice(Vs)
    else:
        a=r.choice(Vs); b=r.choice(Vs)
        while b==a: b=r.choice(Vs)
        m=a+r.choice(CONN)+b
    return o+m+r.choice(_sl(TAIL,k)),'vent'
