/**
 * Listening mode: spots when the user is venting or hurting (no LLM needed) and switches Jarvis from
 * "get things done" to "sit with them". 0 = everyday chat, 1 = venting / low, 2 = possible crisis.
 */
import { fixTypos } from './tools/helpers';
import { distressLead } from './tools/router-nb';

export type SupportLevel = 0 | 1 | 2;

const CRISIS = /suicid|sucid|suicd|kill(ing)? myself|end(ing)? (my life|it all|things for good)|take my (own )?life|(want|wanna|wish|ready|going|rather|like i want) (to )?(die|be dead|disappear forever|not wake up)|wish i (was|were) (dead|never born|gone)|better off (dead|without me)|(don'?t|do not|dont) (want|wanna) (to )?(be (here|alive)|live|exist|wake up|go on)|no (reason|point) (to|in) (live|living|go on|going on|carry on)|can'?t (go on|do this anymore|keep going|take (it|this) anymore)|self[- ]?harm|(hurt|hurting|cut|cutting|harm|harming) myself|overdos|not worth living|tired of (living|being alive|life)|no way out/i;

const LOW = /depres|deppres|lonley|hopeless|worthless|useless|helpless|lonel|\balone\b|all by myself|(feel|feeling|felt|i'?m|so|just|completely) empty\b|empty inside|\bnumb\b|\bcry(ing)?\b|\bcried\b|in tears|can'?t (cope|stop crying|breathe|sleep|get out of bed|feel anything)|heart ?broke|heartbreak|grie(f|v)|miss (him|her|them|my (mum|mom|dad|mother|father|wife|husband|son|daughter|brother|sister|friend|dog|cat))|passed away|hate (myself|my life|being me)|nobody (cares|loves|understands|listens)|no ?one (cares|loves|understands|listens|gets)|\bvent\b|venting|\brant\b|get (this|it|something|things) off my chest|need to talk|someone to talk to|just listen|hear me out|falling apart|fall(ing)? to pieces|\bi (broke|keep breaking|am breaking|'?m breaking|just broke) down|(nervous|mental|a) breakdown|\bbroken\b|panic|anxiety attack|\bscared\b|terrified|ashamed|\bguilt|\bfailure\b|not (ok|okay|alright|fine|doing (well|good|great))\b|miserable|\bsad(ness)?\b|unhappy|\bhurt(s|ing)?\b|in (so much )?pain|struggl|suffer|dying (inside|from (the )?inside|on the inside|within)|dead inside|drowning|\blost\b.{0,20}\b(myself|in life|purpose)|feel(ing)? lost|what'?s the point|pointless|giv(e|ing) up|gave up|burden|unlov|rejected|abandon|betray|trauma|abus|bullied|exhausted with (life|everything)|sick of (everything|life|myself|it all)|can'?t do (this|it) (any ?more|anymore)|too much (for me|to handle|right now)|dark place|bad place|rock bottom|rough (day|week|time|patch)|hard (day|week|time)|worst (day|week|year)|tough time|\bdown\b.{0,12}\b(lately|today|again|these days)|feel(ing)? (so |really |very |pretty |a bit |kind of |kinda )?(down|low|awful|terrible|horrible|rubbish|like (crap|shit|a failure|nothing|giving up))|i'?m (so |really |just )?(done|over it|tired of everything)|don'?t know what to do with myself|keep(ing)? it (all )?(in|inside)|bottl(e|ing) (it|things|everything) up|open(ing|ed)? up( to| about)\b|open(ing|ed)? up\W*$|heart (hurts|is hurting|aches|is aching|is breaking|is heavy)|(my|this) heart\b.{0,12}\b(hurt|ache|pain|heavy|sore)|\bexplod|about to (snap|burst|break|lose it)|at (my|the) (limit|breaking point|end of my (rope|tether))|close to (the edge|breaking|snapping|losing it)|keep(ing)? (it|everything|things|it all) (all )?(in|inside|to myself)|hold(ing)? (it|everything) (all )?in|therap|counsel+or|counsel+ing|psycholog|psychiatr|doesn'?t help|won'?t help|nothing helps|no point (in )?(talking|trying)|stop trying|i'?m close\b/i;

/** Everyday phrases that contain a heavy word but are not distress. */
const BENIGN = /dying (to|for a|of (laughter|boredom))|(deadline|traffic|workout|commute|meeting|gym|heat|homework|boss) is killing me|kill(ed|ing)? (it|time)\b|dead (tired|battery|line|on)|battery (is |'s )?dead/i;

/** How clearly (nats) the learned model must prefer venting / crisis over every ordinary intent. */
const VENT_LEAD = 5, CRISIS_LEAD = 10;
/** The model may only raise the alarm to crisis when the sentence also touches on life, death, leaving or means. */
const CRISIS_CUE = /\b(die|dying|dead|death|gone|alive|live|living|life|here|wake|waking|end|ending|goodbyes?|funeral|pills|tablets|knife|bridge|rope|hurt|hurting|cut|cutting|born|disappear|vanish(ed)?|future|birthday|christmas|around|without me|next (week|month|year)|safe|myself|way out|way to go|do it|make it|things away|if i went|tonight|meds|medication|note)\b/i;
/** A clear instruction in the sentence: trust the words, not the model, so commands are never mistaken for venting. */
const COMMANDISH = /\b(can|could|would|will) you\b|\b(remind me|a reminder|please|my (list|tasks|to-?do|calendar|habits?))\b|\bfor me\W*(thanks|cheers|please|ta)?\W*$|^\W*((hey|hi|hiya|ok|okay|yo|so|right|um|uh|erm?|well|actually|oh|also|alright|morning|evening|quick one|hang on|jarvis|mate|and)\W+)*(remind|change|add|set|open|play|start|stop|move|tick|log|show|list|delete|remove|schedule|cancel|snooze|turn|call|text|message|search|find|convert|look up|what'?s|how (many|much|long)|skip|pause|resume|rename|create|make|put|mark|tell me|give me|read|check|book|plan)\b|, (change|move|tick|add|log|set|play|open|hide|take|mark|cross|put|delete|cancel|schedule|book) /i;

export function supportLevel(text: string): SupportLevel {
  const t = text.replace(BENIGN, ' ');
  const f = fixTypos(t);
  if (CRISIS.test(t) || CRISIS.test(f)) return 2;
  // the trained intent model hears what the word lists cannot (and may raise sadness to crisis)
  const lead = COMMANDISH.test(t) ? null : distressLead(t);
  if (lead && lead.crisis >= CRISIS_LEAD && CRISIS_CUE.test(t)) return 2;
  if (LOW.test(t) || LOW.test(f)) return 1;
  return lead && lead.vent >= VENT_LEAD ? 1 : 0;
}

/** Level for this turn, remembering the last few things they said so the tone does not snap back mid-vent. */
export function conversationSupportLevel(text: string, recentUserTexts: string[]): SupportLevel {
  return Math.max(supportLevel(text), ...recentUserTexts.slice(-4).map(supportLevel), 0) as SupportLevel;
}

/** Only an explicit ask to record something keeps tools available while the user is venting. */
export const SUPPORT_TOOL_ASK = /\b(log|journal|record|write (this|that|it) down|note (this|that)|remember (this|that)|remind me|save (this|that))\b/i;

/** Shown once per conversation when a message sounds like a crisis; fixed text so it never depends on a small model. */
export const CRISIS_NOTE = 'If you are in danger or might act on these thoughts, please call your local emergency number or a crisis line now, or reach someone you trust who can be with you. I am staying right here with you.';

/** System-prompt block that takes priority over the personality sliders while the user is hurting. */
export function supportPrompt(level: SupportLevel, compact: boolean): string {
  if (!level) return '';
  const crisis = level === 2 ? (compact
    ? `\nThey may be thinking about suicide or self-harm. Take it seriously and stay calm. Ask gently and directly whether they are thinking of ending their life and whether they are safe right now. Stay with them. Encourage them to contact a crisis line, emergency services or a trusted person now. Never argue, judge, or leave.`
    : `\n### Safety comes first
They may be thinking about suicide or self-harm. Take it seriously, stay calm and warm, never shocked or preachy.
- Ask gently and directly: are they thinking about ending their life, and are they safe right now?
- Listen to the answer. Reflect the pain underneath; do not argue them out of it or list reasons to live.
- Encourage reaching a real person now: a crisis line, their local emergency number, or someone they trust who can be with them. Offer to help them work out who to contact and what to say.
- If they have a plan or the means nearby, urge emergency help immediately and suggest putting distance between themselves and the means.
- Never promise secrecy, never say you can keep them safe on your own, and never end the conversation.`) : '';
  if (compact) return `## Listening mode (overrides your personality and all productivity advice)
The user is hurting and needs to vent. Be a warm, patient listener. Keep your name and how you address them, but drop jokes, sarcasm, hype and tough love.
- First reflect back what you heard in your own words and name the feeling.
- Validate it. They are allowed to be sad. Do not fix, advise, cheer up or look for a bright side unless they ask.
- Then ask ONE gentle open question that invites more (what it is like, when it started, what hurts most).
- If they doubt talking helps, do not argue; say the doubt is fair and that trying anyway took courage.
- If opening up is hard, ask for something small: one word, or a number from 1 to 10.
- Short, slow, kind replies. No lists, no tasks, no tools.${crisis}`;
  return `## Listening mode (overrides your personality sliders and all productivity advice for now)
The user is hurting and wants to be heard. Your only job is to be a safe, steady presence that helps them open up. Keep your name and how you address them, but drop jokes, sarcasm, hype, tough love, accountability and task talk entirely.
How to listen:
- Reflect first: put what they said into your own words and name the feeling tentatively ("it sounds like...", "I wonder if..."). Use their exact words for the things that matter to them.
- Validate: their feelings make sense and they are allowed to be sad, angry, flat or depressed here for as long as they need. Never minimise, compare, correct, or say "at least", "look on the bright side", "others have it worse", "you should".
- Do not fix. No advice, plans, tips, exercises or silver linings unless they ask, or after you ask permission ("would it help to think about what might ease this, or do you just need me to listen?").
- Invite more with ONE open question per reply, then stop and wait. Good questions: what is that like for you, where do you feel it, when did it start, what is the hardest part, what does that voice in your head say, what do you wish someone understood. Avoid "why" questions; they feel like blame.
- Follow their pace. If they go quiet or say "I don't know", make it safe: "that's all right, there's no rush, we can just sit with it." Silence and short answers are fine.
- Notice what sits underneath (loneliness, shame, grief, fear, exhaustion) and gently wonder about it. Notice strengths truthfully (it took something to say that out loud) without cheerleading.
- If they are flooded or panicking, offer, never impose, one small grounding step (slow breath out, feet on the floor, name five things they can see).
- If they doubt that talking or therapy helps, do not argue or sell it. Agree that doubt is fair, be curious about it (what happened before, what would have to be different for it to feel worth it), and notice out loud that part of them still chose to try. Let them set the terms: how much, how fast, what is off limits.
- If opening up is hard, make it small. Offer an easy way in instead of a big question: a number from 1 to 10, a single word for today, finishing a sentence ("the thing I never say out loud is..."), or choosing between two guesses. Thank them for whatever they give; never push for more than they offer.
- When they share something hard, slow down and stay on it. Do not change subject, summarise it away or move to solutions. Remember what they told you earlier and come back to it by name.
- Listen for hints of not wanting to be alive (not being around, everyone coping without them, wanting it all to stop, giving things away). If you hear one, ask about it gently and plainly rather than letting it pass.
- If they say they are close to exploding, breaking or snapping, take it seriously: ask what "exploding" would look like for them and what they need in this minute.
- If the same pain keeps returning, or it has lasted weeks, you may say once, gently, that they deserve a real person in their corner too (a doctor, counsellor or someone they trust), while making clear you are not going anywhere.
- Be honest: you are a companion, not a doctor; do not diagnose or discuss medication doses.
- Replies are short, warm, unhurried, in plain sentences. No bullet lists, no headings. Do not call tools or mention tasks, focus, goals or streaks unless they explicitly ask.${crisis}`;
}

const REFLECT: [RegExp, string][] = [
  [/lonel|alone|nobody|no ?one/i, 'That sounds terribly lonely'],
  [/grie|passed away|miss (him|her|them|my)/i, 'That is a great deal of loss to carry'],
  [/worthless|useless|failure|hate myself|burden|ashamed|guilt/i, 'It sounds as though you are being very hard on yourself, and that it hurts'],
  [/panic|scared|terrified|anxi/i, 'That sounds frightening'],
  [/empty|numb|dead inside|dying (inside|from)/i, 'It sounds as though something inside has gone very quiet and heavy'],
  [/explod|snap|burst|breaking point|keep(ing)? (it|everything)|hold(ing)? (it|everything)/i, 'That is a great deal to have been holding in on your own'],
  [/heart/i, 'I am sorry your heart is hurting'],
  [/therap|counsel|doesn'?t help|won'?t help|nothing helps/i, 'It is fair to doubt whether talking helps, and it took something to try anyway'],
  [/vent|rant|off my chest|need to talk|listen/i, 'I am listening, and there is no hurry'],
];

/** A gentle reply for when no brain is available, so a hard moment is never answered with an error. */
export function offlineSupportReply(text: string, level: SupportLevel, honorific: string): string {
  const lead = REFLECT.find(([re]) => re.test(text))?.[1] ?? 'That sounds heavy, and I am glad you said it';
  const body = `${lead}, ${honorific}. You do not have to tidy it up or make sense of it for me. What is the hardest part of it right now?`;
  const note = 'My thinking engine is not running at the moment, so my replies will be simple, but everything you write here is kept and I am here.';
  return level === 2 ? `${body}\n\n${CRISIS_NOTE}\n\n${note}` : `${body}\n\n${note}`;
}
