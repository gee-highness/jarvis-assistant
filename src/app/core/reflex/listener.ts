/**
 * Listening conversation for the Reflex brain (no LLM): what Jarvis says while someone is hurting.
 * Reflect what was said, validate it, then ONE gentle question; never advice unless asked, never trivia.
 * Stateful, so "what?", "I don't know", "ok" and "pick" are answered in context instead of as new topics.
 */
export interface ListenCtx { honorific: string; help: string; emergency: string; level: 0 | 1 | 2; }
type Theme = 'weed' | 'drink' | 'panic' | 'heart' | 'anxious' | 'overthink' | 'depressed' | 'sad' | 'lonely' | 'grief' | 'worth' | 'anger' | 'tired' | 'sleep' | 'numb' | 'overwhelm' | 'bottled' | 'doubt' | 'people' | 'work' | 'vague';

const THEMES: [Theme, RegExp][] = [
  ['weed', /\b(weed|cannabis|marijuana|joint|joints|stoned|smok(e|ed|ing)|vape|vaping|nicotine|cigarettes?)\b/],
  ['drink', /\b(drink(ing)?|drunk|alcohol|booze|sober|hungover|pills|using again|relapse|clean for|craving|withdrawal)\b/],
  ['panic', /\b(panic|panicking|can'?t breathe|cant breathe|hyperventilat\w*|shaking|trembling|heart (is )?(racing|pounding)|going to pass out)\b/],
  ['heart', /\b(heart|chest)\b.{0,24}\b(hurt|hurts|hurting|ache|aches|aching|pain|tight|heavy|sore|breaking|broken)\b|\b(tight|pain in my|heavy) chest\b/],
  ['anxious', /\b(anxious|anxiety|nervous|on edge|worried|worrying|worry|scared|afraid|terrified|dread|dreading|fear)\b/],
  ['overthink', /\b(over ?think|overthinking|can'?t stop thinking|cant stop thinking|racing thoughts|my (mind|head|brain) (won'?t|wont|will not|doesn'?t|never) (stop|shut|switch)|in my head|spiral\w*|ruminat\w*|thoughts won'?t)\b/],
  ['depressed', /\b(depress\w*|depresed|hopeless|no hope|pointless|what'?s the point|dark place|rock bottom)\b/],
  ['lonely', /\b(lonely|lonley|alone|no ?one|nobody|isolated|left out|no friends|by myself)\b/],
  ['grief', /\b(died|passed away|death|funeral|grief|grieving|lost my|miss (him|her|them|my))\b/],
  ['worth', /\b(worthless|useless|failure|hate myself|not good enough|never good enough|burden|ashamed|shame|guilty|guilt|disappointment|stupid|pathetic|loser|fraud)\b/],
  ['anger', /\b(angry|anger|furious|rage|pissed|fed up|sick of|hate (him|her|them|this|it|everyone|everything)|snapp(ed|ing))\b/],
  ['tired', /\b(tired|exhausted|drained|burn(t|ed)? ?out|worn out|no energy|running on empty|knackered|can'?t get out of bed)\b/],
  ['sleep', /\b(can'?t sleep|cant sleep|insomnia|awake all night|no sleep|not sleeping|nightmares?)\b/],
  ['numb', /\b(numb|empty|hollow|feel nothing|dead inside|dying (inside|from inside)|nothing matters)\b/],
  ['overwhelm', /\b(overwhelm\w*|too much|can'?t cope|cant cope|drowning|falling apart|breaking down|can'?t do this|cant do this|at my limit)\b/],
  ['bottled', /\b(explod\w*|keep(ing)? (it|everything|things) (all )?(in|inside)|bottl\w*|holding (it|everything) in|about to (snap|burst|lose it)|never (tell|told|talk))\b/],
  ['doubt', /\b(therap\w*|counsel\w*|doesn'?t help|won'?t help|nothing helps|no point (in )?(talking|trying)|talking (never|doesn'?t))\b/],
  ['people', /\b(my (mum|mom|dad|mother|father|wife|husband|girlfriend|boyfriend|partner|ex|friend|friends|brother|sister|son|daughter|kids|family|boss|parents))\b/],
  ['work', /\b(job|work|boss|fired|money|debt|rent|bills|exam|exams|school|uni|deadline)\b/],
  ['sad', /\b(sad|unhappy|miserable|down|low|crying|cried|cry|tears|upset|hurt|hurts|hurting|heartbroken|like (shit|crap|rubbish|hell)|awful|terrible|horrible)\b/],
  ['vague', /\b(bad|not (ok|okay|good|great|fine|well)|rough|hard|struggling|shit|crap|worse|worst)\b/],
];

/** What was heard, said back. {h} = honorific. Several each so a long talk does not repeat. */
const REFLECT: Record<Theme, string[]> = {
  weed: ["A few days without it, and you feel rough. That makes sense, {h}: the first days off it often bring low mood, anxiety, poor sleep and a short fuse. It usually peaks in the first week and eases after that. It is your body resettling, not you failing.",
    "Coming off it is harder than people admit. What you are feeling is real, and it does ease."],
  drink: ["That is a lot for your body and your head to be dealing with at once.", "Going without something you leaned on leaves a real gap. It makes sense that it hurts."],
  panic: ["That sounds frightening. Panic feels like danger even when you are safe, and it does pass, usually within minutes.", "Your body has hit the alarm. It is horrible, and it will come down."],
  heart: ["Your heart hurting like that is exhausting and frightening. Anxiety really can sit in the chest as an ache or a tightness.", "That ache in your chest is real, not imagined."],
  anxious: ["Anxiety is tiring. It keeps you braced for something that has not happened.", "That anxious, on-edge feeling wears a person down."],
  overthink: ["A mind that will not stop is exhausting. It is like being stuck in a room with a loud radio.", "The thoughts keep circling, and you cannot switch them off."],
  depressed: ["That sounds heavy, {h}. Thank you for telling me rather than carrying it quietly.", "Depression drains the colour out of things. It is not laziness and it is not weakness."],
  sad: ["I'm sorry, {h}. You are allowed to be sad here. You do not have to cheer up for me.", "That sounds painful. I am not going to try to talk you out of it."],
  lonely: ["That sounds lonely. Feeling like there is no one to turn to is one of the hardest things there is.", "Being alone with all of it makes everything heavier."],
  grief: ["I'm so sorry. Losing someone leaves a hole that does not close on a schedule.", "Grief like that does not run to a timetable. However it comes is allowed."],
  worth: ["That is a harsh thing to believe about yourself, and it clearly hurts.", "You are being very hard on yourself. I do not think you would say that to someone you love."],
  anger: ["You sound angry, and from what you have said, that makes sense.", "Anger usually stands guard over something that hurts."],
  tired: ["That kind of tired is not fixed by a night's sleep. It is the tiredness of carrying too much for too long.", "You sound worn right down."],
  sleep: ["Not sleeping makes everything harder to bear. Nights are when it all gets louder.", "Lying awake with your thoughts is a miserable place to be."],
  numb: ["Feeling nothing can be as hard as feeling too much. Sometimes it is what the mind does when it has been hurting for a long while.", "That empty, far-away feeling is real, and it is hard to explain to people."],
  overwhelm: ["It sounds like everything has landed on you at once.", "That is too much for one person to be holding."],
  bottled: ["You have been holding a great deal in on your own, for a long time.", "Keeping it all inside takes enormous effort. No wonder it feels like it could burst."],
  doubt: ["It is fair to doubt that talking helps, especially if it has let you down before. You tried anyway, and that took something.", "You do not have to believe in this for it to be worth a few minutes. We can go at your pace."],
  people: ["That sounds painful. The people closest to us can hurt us the most.", "It is hard when it is someone who matters that much."],
  work: ["That is real pressure, and it follows you home.", "Carrying that kind of worry every day wears a person down."],
  vague: ["I'm listening, {h}. It sounds bad.", "That sounds hard."],
};

/** One open question per theme: [id, question, simpler wording used when they say "what?"]. */
const ASK: Record<Theme, [string, string, string][]> = {
  weed: [['weed.choice', 'Was stopping your own choice, or did it just happen?', 'Did you decide to stop, or did you run out?'], ['weed.worst', 'What is the hardest part right now: the mood, the sleep, or the craving?', 'What feels worst: your mood, your sleep, or wanting to smoke?']],
  drink: [['drink.worst', 'What is the hardest part of it at this moment?', 'What feels worst right now?']],
  panic: [['panic.now', 'Is it happening right now, or is it more that you are afraid of the next one?', 'Are you panicking this minute?']],
  heart: [['heart.kind', 'Is it more of a tightness, a racing, or an ache?', 'What does it feel like: tight, fast, or sore?']],
  anxious: [['anx.about', 'Is the anxiety about something in particular, or is it just there, with no clear reason?', 'Are you anxious about one thing, or about nothing you can name?'], ['anx.body', 'Where do you feel it most in your body?', 'Where in your body is it?']],
  overthink: [['over.what', 'What does your mind keep going back to?', 'What thought keeps coming back?'], ['over.when', 'Is it worse at night, or all day long?', 'When is it loudest?']],
  depressed: [['dep.long', 'How long has it been feeling like this?', 'Has it been days, weeks, or longer?'], ['dep.day', 'What does a day look like for you at the moment?', 'What are your days like lately?']],
  sad: [['sad.what', 'Do you know what brought it on, or is it just there?', 'Did something happen, or did it come from nowhere?'], ['sad.hard', 'What is the hardest part of it?', 'What hurts the most?']],
  lonely: [['lone.who', 'Is there anyone who knows how you are really doing?', 'Does anyone know you feel like this?'], ['lone.when', 'When does the loneliness hit hardest?', 'When is it worst?']],
  grief: [['grief.who', 'Would you like to tell me about them?', 'What were they like?'], ['grief.miss', 'What do you miss the most?', 'What do you miss?']],
  worth: [['worth.voice', 'When that voice calls you that, whose voice does it sound like?', 'Who first made you feel that way about yourself?'], ['worth.when', 'When did you start feeling this way about yourself?', 'How long have you felt like that?']],
  anger: [['anger.under', 'What sits underneath the anger, if you had to guess: hurt, fear, or being let down?', 'Under the anger, are you more hurt or more scared?'], ['anger.what', 'What set it off?', 'What happened?']],
  tired: [['tired.what', 'What has been taking the most out of you?', 'What is wearing you out?']],
  sleep: [['sleep.what', 'What goes through your head when you are lying there?', 'What do you think about at night?']],
  numb: [['numb.long', 'How long has it felt like that?', 'When did the numbness start?'], ['numb.last', 'Can you remember the last time you felt something clearly?', 'When did you last feel like yourself?']],
  overwhelm: [['ovw.biggest', 'Of everything on you, what is weighing the most?', 'What is the heaviest thing right now?']],
  bottled: [['bot.one', 'If you let out just one piece of it, the smallest piece, what would it be?', 'What is one small thing you have been keeping in?'], ['bot.explode', 'When you picture it bursting out, what does that look like?', 'What would happen if it all came out?']],
  doubt: [['doubt.before', 'What happened the last time you tried to talk to someone?', 'What went wrong when you tried before?'], ['doubt.need', 'What would have to be different for it to feel worth it?', 'What would make talking feel useful to you?']],
  people: [['ppl.what', 'What happened between you?', 'What did they do, or say?'], ['ppl.wish', 'What do you wish they understood?', 'What do you want them to know?']],
  work: [['work.worst', 'What is the part of it that worries you most?', 'What is the worst part?']],
  vague: [['vague.word', 'If you had to put it into a word or two, what is it like?', 'What is one word for how you feel?'], ['vague.what', 'What is the worst part of it?', 'What is hurting most?']],
};

/** Small steps, only offered when they ask for one. [id, step]. */
const STEPS: Record<string, [string, string][]> = {
  calm: [['breath', 'Breathe in through your nose for 4, and out slowly through your mouth for 6. Do that five times. The long breath out is what tells your body it is safe.'],
    ['ground', 'Look around and name five things you can see, four you can touch, three you can hear. It pulls your mind out of the storm and back into the room.'],
    ['cold', 'Run cold water over your wrists or splash your face for thirty seconds. It slows a racing heart faster than thinking can.']],
  head: [['write', 'Take the one thought that is looping loudest and write it down, exactly as it sounds. Just that one. A thought on paper stops needing to be repeated.'],
    ['later', 'Tell the thought: "not now, I will think about you at six o\'clock." It sounds silly, and it works more often than you would expect.'],
    ['move', 'Stand up and walk to another room, or outside, for two minutes. A change of place often breaks the loop.']],
  low: [['water', 'Drink a glass of water and eat something small, even toast. Low mood gets heavier on an empty body.'],
    ['light', 'Stand by an open door or window for two minutes and let the daylight and air reach you. Nothing more than that.'],
    ['wash', 'Wash your face, or have a warm shower if you can manage it. It is a small way of being kind to yourself.'],
    ['one', 'Send one short message to one person. It does not have to explain anything. "Thinking of you" is enough.']],
  weed: [['wd1', 'For the next hour: water, something to eat, and a shower. Withdrawal is rougher on a tired, hungry body.'],
    ['wd2', 'When a craving comes, set a timer for ten minutes and do anything else until it rings. Cravings rise, peak and fall, usually inside that time.'],
    ['wd3', 'Tonight, keep the room cool and dark and expect sleep to be patchy. That part settles within a week or two.']],
};

/** Plain acknowledgements for when the specific ones are used up. */
const ACK = ['I hear you, {h}.', 'Thank you for telling me that.', 'That makes sense, given everything you have said.', 'I am with you.', 'That sounds really hard.', 'I am not going anywhere.',
  'You are not too much, and this is not too much.', 'It took something to say that.', 'I can hear how heavy that is.', 'Of course it hurts.', 'That would wear anyone down.', 'I believe you.', 'You do not have to make it sound smaller for me.',
  'Go at whatever pace you need.', 'That is a lot, {h}.', 'I am glad you are saying it out loud instead of holding it.'];
const GEN: [string, string, string][] = [['g.hard', 'What is the hardest part of it right now?', 'What hurts most right now?'], ['g.long', 'How long has it been like this?', 'Has it been days, weeks, or longer?'],
  ['g.when', 'When is it at its worst?', 'What time of day is hardest?'], ['g.alone', 'Does anyone else know you are feeling this?', 'Have you told anyone?'], ['g.said', 'What is the thing you have not said out loud yet?', 'Is there something you are holding back?'],
  ['g.before', 'Have you felt like this before? What was it like then?', 'Is this feeling new, or has it happened before?'], ['g.voice', 'What does the voice in your head say to you when it is bad?', 'What do you tell yourself when it is bad?'],
  ['g.one', 'If one thing could be lifted off you tonight, what would you choose?', 'What one thing would you want gone?']];
const IDK = /^(i (do not|don'?t|dont) know|idk|dunno|not sure|no idea|i (do not|don'?t|dont) know (what|how|why)\b.{0,30}|i can'?t explain( it)?|hard to (say|explain)|don'?t know)\W*$/;
const WHAT = /^(what|what\?+|huh|eh|sorry|pardon|what do you mean|i (do not|don'?t|dont) (understand|get it)|meaning|come again|\?+)\W*$/;
const SHORT = /^(ok|okay|k|kk|fine|sure|alright|hmm+|mm+|yeah|yes|yep|yup|no|nope|nah|maybe|i guess|i suppose|right|true|exactly|\.+)\W*$/;
const WANT_STEP = /\b(pick|suggest|suggestions?|advice|what (should|can|do) i do|help me|tell me what to do|give me (something|one|a)|easy win|small win|what now|any (ideas|tips)|how do i (stop|cope|deal|calm|fix)|make it stop|another( one)?|something else|next one|you choose|go on then|try (it|that|one)|yes please)\b/;
const NEVERMIND = /^(nothing|never ?mind|nvm|forget it|leave it|doesn'?t matter|it'?s nothing|drop it|not now|i (do not|don'?t|dont) want to talk( about it)?)\W*$/;
const PUSHBACK = /\b(you (do not|don'?t|dont) (understand|get it|care|listen)|not helping|that (does not|doesn'?t|didn'?t) help|useless|stupid (bot|answer|app)|you'?re (just )?a (bot|robot|machine|program)|whatever|that'?s not what i (said|meant)|wrong|stop saying that)\b/;
const THANKS = /^(thanks|thank you|thx|ty|cheers|appreciate it|thanks jarvis|thank you jarvis)\W*$/;
const DONE = /\b(i feel (a bit |a little |much |so much )?better|i'?m (ok|okay|fine|good|alright) now|that helped|good ?night|goodnight|bye|talk later|gotta go|i have to go|that'?s all|i'?m done talking)\b/;
const YES = /^(yes|yeah|yep|yup|i am|i do|sometimes|a bit|kind of|maybe|i think so|often|i have)\b/;
const NO = /^(no|nope|nah|not really|never|not at all|i'?m not|i am not)\b/;
const NUM = /^\W*(10|[0-9])(\s*(\/|out of)\s*10)?\W*$/;

function flip(s: string): string {
  return s.replace(/\b(i am|i'm|im)\b/gi, 'you are').replace(/\bi was\b/gi, 'you were').replace(/\b(i've|i have|ive)\b/gi, 'you have').replace(/\bmy\b/gi, 'your').replace(/\bmyself\b/gi, 'yourself')
    .replace(/\bme\b/gi, 'you').replace(/\bi\b/gi, 'you').replace(/\bmine\b/gi, 'yours');
}

export class Listener {
  private last = 0; private turns = 0; private lastAsk: [string, string, string] | null = null; private pendingStep = false; private safety = false; private safeAsk = false;
  private used = new Set<string>(); private themes: Theme[] = []; private said = new Set<string>(); private idk = 0; private quiet = 0; private nudged = false; private chestWarned = false;
  private h = 'sir';

  /** In a listening conversation right now (expires after 45 quiet minutes). */
  get active(): boolean { return this.last > 0 && Date.now() - this.last < 45 * 60_000; }
  end() { this.last = 0; this.turns = 0; this.lastAsk = null; this.pendingStep = false; this.safety = false; this.used.clear(); this.themes = []; this.said.clear(); this.idk = 0; this.quiet = 0; this.nudged = false; this.chestWarned = false; }
  /** Keep the conversation gentle after the safety flow has answered. */
  touch() { this.last = Date.now(); }

  private pick(list: string[]): string {
    const x = list.find(s => !this.said.has(s)) ?? ACK.find(s => !this.said.has(s)) ?? ACK[this.turns % ACK.length];
    this.said.add(x); return x.replace(/\{h\}/g, this.h);
  }
  private ask(themes: Theme[]): string {
    for (const t of themes) for (const q of ASK[t]) if (!this.used.has(q[0])) { this.used.add(q[0]); this.lastAsk = q; return q[1]; }
    const g: [string, string, string][] = [...GEN, ['g.more', 'What else is sitting on you?', 'Is there more you want to say?'], ['g.need', 'What do you need most right now: to be heard, to be distracted, or to work something out?', 'Do you want me to listen, distract you, or help you think?'],
      ['g.wish', 'What do you wish someone understood about how this feels?', 'What do people not get about this?'], ['g.body', 'Where do you feel it in your body?', 'Where in your body is it?'], ['g.scale', 'If 0 is fine and 10 is the worst it has been, where are you right now?', 'Give me a number from 0 to 10 for how bad it is.']];
    let q = g.find(x => !this.used.has(x[0]));
    if (!q) { g.forEach(x => this.used.delete(x[0])); q = g[this.turns % g.length]; }
    this.used.add(q[0]); this.lastAsk = q; return q[1];
  }
  private step(): string {
    const t = this.themes; const key = t.includes('weed') || t.includes('drink') ? 'weed' : t.includes('panic') || t.includes('heart') || t.includes('anxious') ? 'calm' : t.includes('overthink') || t.includes('sleep') ? 'head' : 'low';
    const order = [key, 'calm', 'head', 'low'];
    for (const k of order) for (const s of STEPS[k]) if (!this.used.has('s.' + s[0])) { this.used.add('s.' + s[0]); this.lastAsk = ['step.after', 'Tell me how that goes, or say "another" if it is not the one.', 'Try it, then tell me if it helped. Say "another" for a different one.']; return s[1]; }
    return 'I have given you every small step I trust. The honest next one is a person: someone you know, or a doctor or counsellor. I will stay here either way.';
  }

  reply(raw: string, ctx: ListenCtx): { text: string; end?: boolean } {
    this.h = ctx.honorific || 'sir'; this.last = Date.now(); this.turns++;
    const t = raw.trim().toLowerCase().replace(/[’‘]/g, "'"); const words = t.split(/\s+/).filter(Boolean).length;
    const out = (s: string, end = false) => ({ text: s.replace(/\{h\}/g, this.h), end });

    // -- safety question in flight
    if (this.safeAsk) {
      this.safeAsk = false;
      if (/^(yes|yeah|yep|i am|safe|i think so|for now|ok|okay|i'?m (ok|okay|safe|fine))\b/.test(t)) return out(`Good. Thank you. Stay with me a while. If that changes, even slightly, call ${ctx.emergency} or one of those lines straight away. What is hurting the most right now?`);
      return out(`Then please do not stay alone with this. Call ${ctx.emergency} now, or go to someone nearby and tell them exactly what you told me. If there is anything close by you could hurt yourself with, move away from it.\n\n${ctx.help}\n\nI am here, and I am not leaving. Who is the nearest person to you right now?`);
    }
    if (this.safety) {
      this.safety = false;
      if (YES.test(t) || ctx.level === 2) { this.safeAsk = true; return out(`Thank you for telling me. I am glad you did, and I am taking it seriously. You do not have to face this alone tonight.\n\nPlease reach a person now:\n${ctx.help}\n\nIf you might act on it, call ${ctx.emergency} or go to someone who can be with you. I am staying right here. Are you safe at this moment?`); }
      if (NO.test(t)) return out(`Thank you. I am glad to hear it, and I had to ask because it matters. If that ever changes, tell me straight. Now, back to you: ${this.ask(this.themes)}`);
    }
    if (ctx.level === 2) {
      this.safety = true;
      return out(`I want to stop and ask you something plainly, {h}, because your answer matters to me. Are you thinking about ending your life?`);
    }
    // -- they are leaving, or feeling better
    if (DONE.test(t)) { const s = `I'm glad you talked to me, {h}. Nothing you said was too much. Come back whenever it gets heavy again, at any hour.`; const r = out(s, true); this.end(); return r; }
    if (THANKS.test(t)) return out(`You are welcome, {h}. I am still here if there is more.`);
    if (NEVERMIND.test(t)) { this.lastAsk = null; return out(`All right. I will not push. We can leave it there, or sit quietly for a bit, and if it comes back I am here.`); }
    if (PUSHBACK.test(t)) { this.lastAsk = ['push', 'What did I miss?', 'Tell me again, in your words, and I will just listen.']; return out(`You are right, and I am sorry. I got that wrong. I would rather hear it properly than guess. What did I miss?`); }
    if (WHAT.test(t)) {
      if (this.lastAsk) return out(`Sorry, {h}, I put that badly. I only meant: ${this.lastAsk[2].charAt(0).toLowerCase() + this.lastAsk[2].slice(1)}`);
      return out(`Sorry, {h}. I only meant that I am here and listening. What is on your mind?`);
    }
    // -- they want something to do
    if (WANT_STEP.test(t) || (this.pendingStep && (YES.test(t) || SHORT.test(t) && !NO.test(t)))) {
      this.pendingStep = false;
      return out(`Here is one small thing, {h}. ${this.step()}\n\n${this.lastAsk ? this.lastAsk[1] : ''}`.trim());
    }
    this.pendingStep = false;
    // -- a number, after any scale question
    const nm = NUM.exec(t);
    if (nm) {
      const n = +nm[1];
      const line = n >= 8 ? `${n}. That is very high, and I am glad you told me.` : n >= 5 ? `${n}. That is a lot to be carrying around.` : `${n}. Lower than it could be, and still not nothing.`;
      this.lastAsk = ['num.why', n >= 5 ? 'What is making it that high today?' : 'What is keeping it from being lower?', 'What is the main thing behind that number?'];
      return out(`${line} ${this.lastAsk[1]}`);
    }
    if (IDK.test(t)) {
      this.idk++;
      const opts: [string, string, string][] = [['idk.scale', 'That is all right. You do not have to know. Let us make it smaller: from 0 to 10, how heavy does it feel right now?', 'Just a number from 0 to 10 for how bad it feels.'],
        ['idk.body', 'That is fine. No need to explain it. Where do you feel it in your body: chest, stomach, head, or somewhere else?', 'Where in your body do you feel it?'],
        ['idk.word', 'You do not need the right words. Give me one word, any word, for today.', 'One word for how today feels.'],
        ['idk.sit', 'Then we will not force it. I can just keep you company for a while. Say anything, or nothing, whenever you like.', 'I am here. No need to say anything.']];
      const q = opts.find(o => !this.used.has(o[0])) ?? opts[3]; this.used.add(q[0]); this.lastAsk = q; return out(q[1]);
    }
    if (SHORT.test(t)) {
      this.quiet++;
      if (this.lastAsk && this.lastAsk[0] === 'step.after') { this.lastAsk = null; this.quiet = 0; return out(`Take your time with it. I am here when you want to tell me how it went.`); }
      if (this.quiet === 1) return out(`I am still here, {h}. No rush at all. ${this.ask(this.themes)}`);
      if (this.quiet === 2) { this.pendingStep = true; return out(`That is all right. We do not have to keep digging. Would it help if I gave you one small thing to try, or would you rather I just stayed with you?`); }
      return out(`I am here. Say whatever comes, whenever it comes.`);
    }
    this.quiet = 0;

    // -- something real was said: reflect it, then one question
    const found = THEMES.filter(([, re]) => re.test(t)).map(([k]) => k);
    const fresh = found.filter(k => !this.themes.includes(k));
    this.themes = [...found, ...this.themes.filter(k => !found.includes(k))].slice(0, 6);
    const parts: string[] = [];
    if (found.includes('heart') || found.includes('worth')) found.splice(0, found.length, ...found.filter(k => k !== 'sad' && k !== 'vague'));
    const feelings = found.filter(k => ['depressed', 'overthink', 'anxious', 'sad', 'lonely', 'tired', 'numb', 'anger', 'overwhelm'].includes(k));
    const NAME: Partial<Record<Theme, string>> = { depressed: 'depressed', overthink: 'overthinking', anxious: 'anxious', sad: 'sad', lonely: 'lonely', tired: 'exhausted', numb: 'numb', anger: 'angry', overwhelm: 'overwhelmed' };
    const specific = found.some(k => ['heart', 'panic', 'weed', 'drink', 'grief', 'people', 'bottled', 'doubt', 'worth'].includes(k));
    if (feelings.length >= 2 && !specific && !this.used.has('mix.loudest')) {
      const names = feelings.map(k => NAME[k]!); const list = names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
      parts.push(`${list.charAt(0).toUpperCase() + list.slice(1)}, all at once. That is a heavy mix to be sitting in, {h}.`);
      this.lastAsk = ['mix.loudest', 'Which of those is the loudest right now?', 'Which one feels strongest right now?']; this.used.add('mix.loudest');
      return out(`${parts[0]} ${this.lastAsk[1]}`);
    }
    const lead = (fresh[0] ?? found[0]) as Theme | undefined;
    if (lead) parts.push(this.pick(REFLECT[lead]));
    else if (words <= 14 && words >= 3) { const e = flip(t.replace(/[.!?]+$/, '')); parts.push(`${e.charAt(0).toUpperCase() + e.slice(1)}. I hear you.`); }
    else parts.push(this.pick(ACK));
    if ((found.includes('heart') || found.includes('panic')) && !this.chestWarned) { this.chestWarned = true; parts.push(`(If the pain is crushing, spreads to your arm or jaw, or comes with trouble breathing, treat it as a medical emergency and call ${ctx.emergency}.)`); }
    if (this.turns >= 10 && !this.nudged && !found.includes('heart') && !found.includes('panic')) { this.nudged = true; parts.push(`One thing, said once and gently: you deserve a real person in your corner as well as me, whether that is a doctor, a counsellor, or someone you trust. I am not going anywhere.`); }
    parts.push(this.ask(found.length ? found : this.themes));
    return out(parts.join(' '));
  }
}
