/** Replies to things people simply tell you. Warm, specific, ends with a real question. */
export const NARR: Record<string, string[]> = {
  // ---- plans / intentions
  'r.nar.plan': [
    '#nar.plan.react# {x}. #nar.plan.q#',
    '{x}? #nar.plan.react.short# #nar.plan.q#',
    '[warmth>60] Honestly, {x} sounds good for you. #nar.plan.q#',
    '[directness>60] {x}. Do it. #nar.plan.q#',
    '[humor>55] {x}? Bold. I approve. #nar.plan.q#',
  ],
  'nar.plan.react': ['I like the sound of it:', 'That’s a good one:', 'Ooh, interesting:', 'Now that’s a plan:', 'Not a bad idea at all:', 'Hm, I like that:'],
  'nar.plan.react.short': ['I like it.', 'That could be fun.', 'Sounds worthwhile.', 'Go on, I’m curious.'],
  'nar.plan.q': ['What’s pulling you toward it?', 'What got you thinking about that?', 'Want me to make it a goal so it doesn’t fade?', 'Is this something you’ve wanted for a while?', '[proactivity>55] Shall I turn it into a goal with a first small step?', 'When would you start?'],
  'nar.plan.goal': ['Done. It’s a goal now: {x}. First step is the smallest one you can do this week.', 'On the list: {x}. Start small, and I’ll nudge you.'],

  'r.nar.plan.go': ['Then go for it. Start tiny: ten minutes this week counts.', 'Good. The first step is always the smallest one.', 'Then it’s time. Want a reminder to make a start?'],

  // ---- people
  'r.nar.person.neg': [
    'Ugh, that sounds draining. What’s been happening with your {who}?',
    'That doesn’t sound fun. Is this new, or has your {who} been like this a while?',
    '[warmth>60] I’m sorry, that’s hard to deal with. Do you want to vent, or work out what to do about it?',
    'Mm. Your {who} being like that wears a person down. What happened?',
    '[directness>60] Sounds like a real problem. What’s the actual issue, and what do you want to happen?',
    '[humor>55] Ah, the classic. Tell me everything, and I’ll be on your side. Mostly.',
  ],
  'r.nar.person.pos': [
    'That’s nice to hear. What’s your {who} up to?',
    'Good, those people matter. What happened?',
    '[warmth>60] I love that. Tell me more about your {who}.',
    'Lovely. Anything planned together?',
  ],
  'r.nar.person.neutral': [
    'Oh? What’s going on with your {who}?',
    'Tell me more. How’s your {who} doing?',
    'Go on, I’m listening. What about your {who}?',
    '[curiosity>60] Interesting. What happened with your {who}?',
  ],

  // ---- devices and things
  'r.nar.device.neg': [
    'Annoying. How long has your {x} been doing that?',
    'Ugh, that’s frustrating. Has a restart helped with your {x}?',
    '[directness>55] First thing: restart it. If that doesn’t fix it, what changed recently, an update or an install?',
    'That’s a pain. Is it every time, or only now and then?',
    '[humor>55] Technology, eh? It works perfectly right until you need it. Did you try turning it off and on?',
  ],
  'r.nar.device.pos': ['Good news. Sounds like your {x} is behaving for once.', 'Nice, glad your {x} is sorted.'],

  'r.nar.doing': ['Good for you. How’s it going so far?', 'Nice, {x} takes patience. What’s the hardest part?', 'I like that. How long have you been at it?', '[proactivity>55] Want me to set a regular reminder to practise?', '[warmth>60] That’s admirable. Are you enjoying it?'],
  'r.nar.body': ['Ouch. How long has your {x} been hurting?', 'Sorry to hear that. Is it a sharp pain or a dull ache?', '[warmth>60] That sounds uncomfortable. Have you been able to rest it?', 'Ouch. Did something trigger it, or did it come on by itself? If it gets worse or won’t ease, please see a doctor.'],
  'r.nar.went.neg': ['Ah, I’m sorry. What went wrong with the {x}?', 'Oh no. How are you taking it?', '[warmth>60] That’s disappointing. Do you want to talk it through?', 'Rough. What happened?'],
  'r.nar.went.pos': ['Brilliant! How did it feel?', 'Good to hear. Were you expecting that?', 'Well done. What went right?'],

  // ---- wins
  'r.nar.win': [
    '#nar.win.cheer# #nar.win.q#',
    '[enthusiasm>60] That’s fantastic! #nar.win.q#',
    '[warmth>60] I’m really happy for you. You earned it. #nar.win.q#',
    '[formality>60] My congratulations. #nar.win.q#',
  ],
  'nar.win.cheer': ['Well done!', 'That’s brilliant!', 'Excellent news!', 'Look at you!', 'Congratulations!'],
  'nar.win.q': ['How are you feeling about it?', 'How did it feel when you found out?', 'Are you going to celebrate?', 'Tell me everything!'],

  // ---- things they did
  'r.nar.media.movie': ['Nice. What did you watch, and was it any good?', 'Ooh, what was it? Would you recommend it?', '[curiosity>60] What was it about?', 'What did you watch? I’m always curious what people pick.'],
  'r.nar.media.show': ['Which show? Is it any good?', 'Ooh, what are you watching? Is it worth the binge?', '[humor>55] Dangerous. One episode never stays one episode. Which show?'],
  'r.nar.media.game': ['Who was playing? How did it go?', 'Nice, how did it turn out?', 'Good game? Tell me who won.'],
  'r.nar.media.book': ['Nice. What are you reading? Is it hooking you?', 'Ooh, what book? Would you recommend it?', 'What’s it about? I’m curious.'],
  'r.nar.media.music': ['What did you listen to? Anything new?', 'Good taste, I hope. What was on?', 'What was the soundtrack?'],
  'r.nar.food.x': ['Mm, {x}. Good one?', 'Nice, {x}. Did it hit the spot?', '{x}? Now I’m curious. Was it any good?'],
  'r.nar.food': ['Sounds good. What did you have? Was it any good?', 'Mm, now I’m curious. What was it?', 'Nice. Home-cooked or out?', '[humor>55] I can’t taste, which is tragic. Describe it for me.'],
  'r.nar.exercise': ['Good for you! How did it feel?', 'Nice work. Was it a good session, or did you have to drag yourself?', '[proactivity>55] That’s worth logging. How did it go?', 'Respect. How are the legs now?'],
  'r.nar.social': ['Nice. Was it good to see them?', 'Good, people time matters. How did it go?', 'Sounds like a good one. What did you get up to?', 'Lovely. Did you have fun?'],
  'r.nar.shop': ['Ooh, nice. Are you happy with it?', 'New things are fun. What made you pick that one?', 'Treating yourself? What did you get?', '[humor>55] Retail therapy. Was it worth the wallet damage?'],
  'r.nar.travel': ['Lovely. How was it?', 'Where did you go? Was it relaxing or a rush?', 'Sounds like an adventure. What was the best part?', 'Safe travels, then. How was the trip?'],
  'r.nar.work': ['Busy one. How did it go?', 'How did it turn out? Happy with it?', 'Productive, then. Anything still hanging over you?', 'Sounds like a solid effort. How did it feel?'],
  'r.nar.outing': ['Nice, I like that. How was it?', 'Ooh, how was {x}? Did you have a good time?', 'Sounds like a good outing. What was the best bit?', 'How was it? Worth the trip?', '[curiosity>60] What did you get up to at {x}?'],
  'r.nar.past': ['Oh, tell me more about that.', 'Interesting. How did it go?', 'How was that?', 'And how did you find it?', '[curiosity>60] What was that like?'],

  // ---- replies to my follow-up questions
  'r.nar.reply.pos': ['Glad to hear it.', 'Lovely, that’s what I like to hear.', 'Good. You deserve a good one.', '#nar.pos.a# Sounds like a good moment.', '[humor>55] Excellent. I’ll tell no one. Oh wait, I can’t tell anyone.'],
  'nar.pos.a': ['Nice.', 'Great.', 'Brilliant.', 'Love that.'],
  'r.nar.reply.neg': ['Ah, shame. That’s a pity.', 'Oh no. Not what you hoped for, then.', '[warmth>60] I’m sorry it wasn’t better. Do you want to talk about it?', 'Ugh, that’s annoying. What went wrong?', 'Fair enough. You can’t win them all.'],
  'r.nar.reply.mid': ['I see. Sounds like an ordinary one.', 'Fair enough. Anything you’d change?', 'Okay. Not every day is a highlight.', 'Mm, fair. Thanks for telling me.'],
  'r.nar.reply.echo': ['{a}? #nar.echo.tail#', '{a}, nice. #nar.echo.tail#', '{a}. Good to know. #nar.echo.tail#'],
  'nar.echo.tail': ['Did you enjoy it?', 'How was it?', 'Would you do it again?', 'I’ll remember that.', 'What did you think?'],
  'r.nar.reply.person': ['That sounds really frustrating. Have you been able to talk to your {who} about it?', 'I’m sorry, that’s not easy. What would you like to happen?', '[warmth>60] That’s a lot to carry. Do you want to just vent, or think it through together?', 'Mm. How long has that been going on?', '[directness>60] Would a direct conversation help, or is that off the table?'],
  'r.nar.reply.more': ['Sounds like quite a story. Thanks for telling me.', 'I’m glad you told me. How are you feeling about it all?', 'That’s a lot to take in. How do you feel about it now?'],
};
