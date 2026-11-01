import type { Bank } from '../types';

/** Engine-internal replies: learning, briefings, riddles, reflective listening and graceful fallbacks. */
export const EXTRA: Bank = {
  intents: [],
  rules: {
    // ---------------------------------------------------------------- tasks extras
    'r.task.next': ['#think#: {title}, because {why}. #next.tail#', 'Start with {title}; {why}. #next.tail#', '[formality<40] {title}. {why.cap}. #next.tail#', '[toughLove>70] {title}. Now. {why.cap}.'],
    'next.tail': ['', 'Shall I start a focus session on it?', 'Say "start focus" when ready.', 'One thing at a time.'],
    'r.plan.summary.live': [
      'So far today: {done} task{s:done} done, {focus} minutes of focus, habits {habits}, {xp} XP. #summary.verdict#',
      'Today’s tally: {done} done, {focus} focus minutes, {habits} habits and {xp} XP. #summary.verdict#',
    ],
    'summary.verdict': ['[done>4] Strong day.', '[done>2] Solid progress.', '[done<1] Quiet one so far; one small win would change that.', '[focus>90] Serious focus today.', 'Keep it rolling.', ''],

    // ---------------------------------------------------------------- briefing parts
    'brief.mits': ['Today’s priorities: {list}.', 'Your top three: {list}.', 'Focus today: {list}.'],
    'brief.setmits': ['I’ve set today’s priorities: {list}.', 'Your top three today, picked by urgency: {list}.', 'Priorities locked in: {list}.'],
    'brief.overdue': ['{n} overdue, starting with {first}.', 'Overdue: {n}; oldest is {first}.', '[toughLove>60] {n} overdue. {first} first, no excuses.'],
    'brief.due': ['Also due today: {list}.', 'Due today: {list}.'],
    'brief.habits': ['Habits to tick: {list}.', 'On the habit front: {list}.'],
    'brief.reminder': ['Next reminder: {r}.', 'Coming up: {r}.'],
    'brief.streak': ['You’re on a {n}-day streak.', 'Streak: {n} days. Protect it.', '[enthusiasm>65] {n}-day streak! Keep it alive!'],
    'brief.clear': ['Your list is clear. Perfect time to plan something ambitious.', 'Nothing pending. Enjoy that rare luxury.'],
    'brief.advice': ['#tip.prod#', 'Hardest thing first, then momentum.', 'Protect your best hours for deep work.', '[toughLove>60] Win the morning, win the day.', '[warmth>70] And be kind to yourself today.', 'One focused hour beats a scattered day.', '[humor>55] I believe in you. Statistically.'],

    // ---------------------------------------------------------------- learning
    'r.learn.fact': ['Noted: {echo}. #learn.tail#', 'Good to know; {echo}. #learn.tail#', '[formality>60] I shall remember that {echo}. #learn.tail#', '[formality<40] Got it, {echo}. #learn.tail#', 'Filed away: {echo}.'],
    'r.learn.person': ['Noted: {echo}. #learn.person.tail#', 'Got it, {echo}. #learn.person.tail#'],
    'learn.person.tail': ['', 'I’ll remember.', '[curiosity>60] What are they like?', 'Good to know who is who.'],
    'r.learn.like': ['Noted: {echo}. #learn.like.tail#', 'Good to know; {echo}. #learn.like.tail#', '[formality<40] Ooh, {echo}. #learn.like.tail#'],
    'learn.like.tail': ['', 'I’ll keep that in mind.', '[curiosity>60] What got you into it?', '[humor>55] Excellent taste, naturally.'],
    'r.learn.dislike': ['Noted: {echo}. I’ll steer clear.', 'Understood; {echo}.', '[humor>55] Noted; {echo}. Moving on swiftly.'],
    'r.learn.goal': ['I love that: {echo}. #learn.goal.tail#', 'Noted: {echo}. #learn.goal.tail#'],
    'learn.goal.tail': ['Want me to track it as a goal? Say "add a goal".', 'What’s the very first step?', 'I’ll help you get there.'],
    'r.learn.event': ['Oh, {echo}! #learn.event.tail#', 'Noted: {echo}. #learn.event.tail#', '[warmth>65] {echo.cap}? #learn.event.tail#'],
    'learn.event.tail': ['Good luck. I’ll ask you how it went.', 'I’ll check in afterwards.', 'You’ve got this. Tell me how it goes.', 'Want a reminder beforehand?'],
    'learn.tail': ['', '', 'I’ll remember.', '[curiosity>65] Tell me more?'],
    'learn.ok': ['', '', '(I’ll remember that phrasing.)', '(Learned that one.)'],
    'learn.fail': ['I still did not quite get that. Try phrasing it as a command, like "add a task" or "remind me".', 'Hmm, still lost. Could you say it as a command?'],
    'learn.skip': ['No problem.', 'Fair enough.', 'All good, another time.'],
    'learn.gotit': ['Got it: {a}. I’ll remember.', 'Noted: {a}.'],
    'persona.unknown': ['How would you like me to change? More or less funny, formal, blunt, chatty, energetic?'],

    // ---------------------------------------------------------------- reviews & reflection
    'review.body': [
      '#review.open# #review.wins# #review.blockers# #review.energy#',
    ],
    'review.open': ['[kind=daily] Day reviewed, #h#.', '[kind=weekly] Week reviewed, #h#.', 'Thanks for closing the loop.', '[formality<40] Nice, reflection done.'],
    'review.wins': ['[hasWins=true] Wins: {wins}. #review.winsay#', '[hasWins!=true] No wins logged, which usually means you are not giving yourself credit.'],
    'review.winsay': ['That counts.', 'Proper progress.', 'Bank that.', '[enthusiasm>65] Love it!', 'Momentum is built exactly like this.'],
    'review.blockers': ['[hasBlockers=true] On "{blockers}": #review.fix#', '[hasBlockers!=true] Nothing blocked you; rare, enjoy it.'],
    'review.fix': ['what is the smallest next action that would unblock it?', 'can you remove it, delegate it, or shrink it?', 'schedule it first thing so it stops haunting you.', '[toughLove>65] name it, schedule it, kill it.', 'decide by tomorrow whether it stays or goes.'],
    'review.energy': ['[energy<3] Energy was low; plan lighter and sleep earlier.', '[energy>3] Energy was good; protect whatever caused that.', '[energy=3] Steady energy. Fine, but look for one thing that would lift it.'],
    'review.next.daily': ['Suggested top three for tomorrow:', 'Tomorrow, I would lead with:'],
    'review.next.weekly': ['Outcomes I would target next week:', 'Next week, aim for:'],
    'journal.reflect': [
      'Across {n} entries your average mood is {mood}/5 and energy {energy}/5. #jr.trend# Your best day was {bestDay}. #jr.theme# #jr.grat# #jr.experiment#',
    ],
    'jr.trend': ['[trend=up] Mood is trending up; something is working.', '[trend=down] Mood has dipped recently; worth noticing what changed.', '[trend=flat] Mood has been steady.'],
    'jr.theme': ['[has:theme] A recurring theme: {theme}.', ''],
    'jr.grat': ['[grat>2] You keep noticing what you are grateful for; that is a strength.', '[grat<1] Try adding one gratitude a day; it measurably lifts mood.', ''],
    'jr.experiment': ['[lowEnergy=1] Experiment: lights out 30 minutes earlier for three nights.', 'Experiment: a 10-minute walk before your hardest task, for one week.', 'Experiment: write tomorrow\'s top three tonight, every night this week.', 'Experiment: one screen-free hour each evening.'],
    'journal.reflect.empty': ['Write a few entries first and I will spot the patterns.'],

    // ---------------------------------------------------------------- riddles
    'riddle.ask': ['Riddle: {q}', 'Here’s one: {q}', '[formality<40] Okay, riddle me this: {q}', 'Try this: {q}'],
    'riddle.right': ['Correct! {a} #riddle.praise#', 'Yes! {a} #riddle.praise#', '[enthusiasm>65] NAILED IT. {a} #riddle.praise#'],
    'riddle.praise': ['Sharp as ever.', 'Too easy for you.', 'Another?', 'I’m impressed.'],
    'riddle.wrong': ['Not quite. One more guess?', 'Close-ish. Try again?', '[humor>50] Bold guess. Wrong, but bold. Again?'],
    'riddle.reveal': ['The answer: {a} Another?', 'It was: {a} You will get the next one.', 'Answer: {a}'],

    // ---------------------------------------------------------------- fallbacks (no LLM)
    'r.fallback.choice': ['#hmm#, I’m not sure I followed. Did you want me to {choices}?', 'Just to be sure: should I {choices}?', '[formality<40] Wait, which one: {choices}?'],
    'r.fallback.web': ['I don’t know that offline, #h#. Shall I search the web?', 'That’s outside what I know offline. Want me to look it up online?', '[formality<40] No idea offhand. Search the web?'],
    'r.fallback.question': ['#hmm#, I don’t have a confident answer about {kw} offline, #h#. #fallback.tail#', 'Good question about {kw}. I don’t know it offline. #fallback.tail#', '[humor>50] {kw}? You’ve stumped me. Rare, but it happens. #fallback.tail#'],
    'r.fallback.generic': ['#hmm#. Tell me more about {kw}?', 'I’m listening. What about {kw}?', '[curiosity>55] Interesting. What’s on your mind about {kw}?', '[formality<40] Go on…', 'I’m not sure I caught that, #h#. If I should do something, say "teach" and show me.', '[humor>50] I’ll be honest: that one flew over my circuits. Say "teach" and I’ll learn it.'],
    'fallback.tail': ['If you know the answer, tell me and I’ll remember it.', 'Ask me again when you’re online and I can search.', 'If it’s in your documents, add them to the Library.'],

    // ---------------------------------------------------------------- reflective listening
    'r.reflect.feel': ['#reflect.open# you feel {x}. #reflect.feel.q#', 'Feeling {x}. #reflect.feel.q#', '[emotional>60] Thank you for telling me you feel {x}. #reflect.feel.q#'],
    'reflect.feel.q': ['What do you think is behind that?', 'How long have you felt that way?', 'What would help right now?', 'Is something specific causing it?', 'Do you want advice, or just to be heard?'],
    'reflect.open': ['So', 'I hear that', 'It sounds like', 'Okay, so'],
    'r.reflect.think': ['Why do you think {x}?', 'Interesting. What makes you think {x}?', '#think# that’s worth exploring. What led you there?', '[directness>65] Do you’ve evidence that {x}, or is it a hunch?'],
    'r.reflect.want': ['What would it take to {x}?', '#so#, {x}. What’s the first step?', '[proactivity>60] Want me to turn "{x}" into a goal or a task?'],
    'r.reflect.cant': ['What makes it feel impossible to {x}?', 'What if you could {x}, but only a tiny version of it?', '[toughLove>65] "Can’t" or "haven’t yet"? What’s the smallest step toward it?'],
    'r.reflect.past': ['How did that feel, being {x}?', 'Tell me more about that.', 'And how is it now?'],
    'r.reflect.am': ['How long have you been {x}?', 'What makes you say you’re {x}?', 'Tell me more about being {x}.'],
    'r.reflect.because': ['Is that the real reason?', 'Does that explain everything, or is there more?', 'That makes sense. What would change it?'],
    'r.reflect.my': ['Tell me more about your {x}.', 'How are things with your {x}?', 'What’s going on with your {x}?', '[warmth>60] How is your {x} doing?'],
    'r.reflect.opinion': ['#honestly#? #reflect.opinion.body#', '#think# {x} is #opinionAdj#. What’s your take?'],
    'reflect.opinion.body': ['I think {x} is #opinionAdj#. What made you ask?', 'I’m cautiously in favour of {x}. You?', 'I’ve mixed feelings about {x}. What do you think?'],
    opinionAdj: ['fascinating', 'underrated', 'overrated, between us', 'worth taking seriously', 'more complicated than it looks', 'a great conversation starter'],
    'r.reflect.youever': ['Not the way you do, no. I don’t really {x}, but I do enjoy being useful. What made you ask?', 'Funny question. I don’t {x} like a person would. I just wait, ready, which suits me. And you?', '[humor>55] I’d love to say yes. Alas, I {x} only in the metaphorical sense. What about you?'],
    'r.reflect.you': ['Would you like me to {x}? If it’s something I can do, phrase it as a command and I’ll try.', 'I’m not sure I can {x}, but tell me more about what you need.', '[humor>55] Can I {x}? I’m a butler of many talents. Mostly scheduling.'],
    'r.reflect.emotion': ['It sounds like you’re feeling {emo}. Want to talk about it?', 'I’m picking up that you’re {emo}. What’s going on?', '[emotional>60] That sounds {emo}-making. I’m here.'],
  },
};
