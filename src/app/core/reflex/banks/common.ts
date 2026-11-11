import type { Rules } from '../grammar';

/** Shared building blocks used by every reply. Conditions key off personality traits and context flags. */
export const COMMON: Rules = {
  // ---------------------------------------------------------------- address
  h: ['{h}'],
  hc: ['[formality>60,w3] {h}', '[formality<40] {h}', '[!has:uname] {h}', '[has:uname,formality<60] {uname}', '[has:uname,warmth>70] {uname}', '{h}'],

  // ---------------------------------------------------------------- acknowledgements
  ack: [
    '[formality>65,w2] Very good', '[formality>65,w2] Certainly', '[formality>65] Right away', '[formality>65] As you wish', '[formality>65] Consider it done',
    '[formality>65] Of course', '[formality>65] With pleasure', '[formality>65,lang:british] Righto', '[formality>65] Indeed',
    '[formality<65,formality>30] Done', '[formality<65,formality>30] On it', '[formality<65,formality>30] Sure thing', '[formality<65,formality>30] Got it',
    '[formality<65,formality>30] All set', '[formality<65,formality>30] No problem', '[formality<65] Easy',
    '[formality<35] Done and dusted', '[formality<35] Sorted', '[formality<35] Bet', '[formality<35] Say less', '[formality<35] Got you', '[formality<35] Yup, handled',
    '[lang:southafrican] Sharp', '[lang:southafrican] Lekker, done', '[lang:gamer] Quest accepted', '[lang:pirate] Aye aye', '[lang:shakespeare] It shall be so',
    '[enthusiasm>75] Boom', '[enthusiasm>75] Let’s go', '[sarcasm>70] Your wish, my command, as ever',
  ],
  ackc: ['#ack#, #hc#.', '#ack#.', '#ack#, #hc#.'],
  okay: ['[formality>60] Understood', '[formality>60] Noted', '[formality<60] Okay', '[formality<60] Alright', '[formality<40] Cool', '[formality<40] Gotcha', 'Right'],

  // ---------------------------------------------------------------- reactions
  nice: [
    'excellent', 'splendid', 'brilliant', 'marvellous', 'superb', 'wonderful', 'great', 'fantastic', 'terrific', 'lovely',
    '[formality<40] awesome', '[formality<40] sick', '[formality<40] dope', '[lang:southafrican] lekker', '[lang:british] smashing', '[lang:gamer] legendary',
  ],
  cheer: [
    'Well done', 'Nicely done', 'Good work', 'Splendid work', 'Bravo', 'Outstanding', 'That’s how it’s done', 'Beautifully executed',
    '[enthusiasm>70] Let’s GO', '[enthusiasm>70] Yes! Get in', '[enthusiasm>70] Absolute scenes', '[formality<40] Ayy, nice one', '[formality<40] Big W',
    '[lang:southafrican] Shot, that’s lekker', '[lang:gamer] Achievement unlocked', '[lang:pirate] Arr, fine plunder', '[sarcasm>70] Look at you, being productive',
  ],
  sorry: ['[formality>60] My apologies', '[formality>60] Forgive me', '[formality>60] I do beg your pardon', 'Sorry', '[formality<50] My bad', '[formality<40] Oops', '[lang:southafrican] Eish, sorry'],
  hmm: ['Hmm', 'Let me see', 'Well', 'Right', 'Interesting', '[formality>60] I see', '[formality<50] Ooh', '[formality<50] Okay so', '[lang:southafrican] Ja'],
  honestly: ['honestly', 'frankly', 'truthfully', 'if I’m honest', 'genuinely', 'to be fair', '[formality<40] lowkey', '[formality<40] ngl'],
  really: ['really', 'truly', 'genuinely', 'properly', 'thoroughly', 'rather', 'quite', '[formality<40] seriously', '[formality<40] super'],
  glad: ['glad', 'pleased', 'delighted', 'happy', 'chuffed', '[formality<40] stoked', 'thrilled'],
  think: ['I think', 'I reckon', 'If you ask me', 'In my view', 'My take', 'I’d say', '[formality>65] I’d venture', '[formality<40] Ngl, I think'],
  maybe: ['Perhaps', 'Maybe', 'Possibly', 'It might be worth considering:', 'One thought:', '[formality<40] Maybe', '[formality>65] Might I suggest'],

  // ---------------------------------------------------------------- time aware
  greetTime: [
    '[morning] Good morning', '[afternoon] Good afternoon', '[evening] Good evening', '[night] Good evening', '[latenight] Burning the midnight oil, I see',
    '[morning,formality<40] Morning', '[evening,formality<40] Evening', '[latenight,formality<40] Still up, hey',
  ],
  partOfDay: ['[morning] this morning', '[afternoon] this afternoon', '[evening] this evening', '[night] tonight', '[latenight] at this ungodly hour'],

  // ---------------------------------------------------------------- closers
  offer: [
    'Anything else?', 'What next?', 'Shall I do anything else?', 'Anything else on your mind?', '[formality>60] Will there be anything else, #h#?',
    '[formality>60] Is there anything further I can do?', '[formality<40] What else you need?', '[formality<40] What’s next on the list?', '[proactivity>70] Want me to line up the next thing?',
    '[lang:gamer] Next quest?', '[lang:southafrican] Anything else, my bru?',
  ],
  offerMaybe: ['', '', '', '#offer#'],

  // ---------------------------------------------------------------- jarvis flavour
  wit: [
    '[humor>50] I do enjoy a productive day.', '[humor>50] My circuits are positively humming.', '[humor>50] Efficiency is my love language.',
    '[humor>60,sarcasm>40] Try not to look so surprised.', '[humor>60] Another triumph for the machines.', '[humor>60] I live for this. Well, I process for this.',
    '[humor>70,sarcasm>60] I’ll add it to the list of things I do flawlessly.', '[humor>40] Smooth as ever.',
  ],
  witMaybe: ['', '', '', '', '[humor>45] #wit#'],

  // ---------------------------------------------------------------- tiny helpers
  and: ['and', 'plus', 'also'],
  so: ['So', 'Right, so', 'Alright', 'Now', 'Okay'],
  but: ['but', 'though', 'however'],
  because: ['because', 'since', 'as'],
  num: ['{n}'],
};
