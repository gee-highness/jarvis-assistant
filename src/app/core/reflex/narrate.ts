/**
 * Narrative listening: when someone simply TELLS you something ("I went to the beach",
 * "my boss is being difficult", "I think I'll learn guitar") a person responds to the story,
 * not to a keyword inside it. This classifies those statements so the engine can answer them
 * like a friend would, and ask a natural follow-up.
 */
export type NarrKind = 'plan' | 'person' | 'device' | 'thing' | 'win' | 'media' | 'food' | 'outing' | 'social' | 'exercise' | 'shop' | 'work' | 'travel' | 'past';

export interface Narr {
  kind: NarrKind;
  /** The thing talked about, already in second person ("your gran"). */
  x: string;
  /** relationship word when the subject is a person (boss, mum...) */
  who?: string;
  /** polarity of a complaint/praise about a person or thing */
  tone?: 'neg' | 'pos' | 'neutral';
  /** which media: movie, show, book, music */
  media?: string;
  when?: string;
}

const PEOPLE = 'mom|mum|mother|dad|father|wife|husband|partner|girlfriend|boyfriend|boss|manager|friend|best friend|sister|brother|son|daughter|family|kids|colleague|coworker|roommate|flatmate|neighbour|neighbor|teacher|landlord|gran|granny|grandma|grandpa|grandmother|grandfather|cousin|aunt|uncle|team';
const DEVICES = 'phone|laptop|computer|pc|tablet|car|bike|wifi|internet|router|battery|screen|printer|tv|television|fridge|washing machine|app|website|network|data|signal|bluetooth|charger|headphones|earphones|speaker';
const NEG = /\b(difficult|annoying|rude|mean|unfair|stressful|stressing|ignoring|ignores|shouting|yelling|nagging|irritating|impossible|toxic|exhausting|driving me|getting on my nerves|sick|ill|angry|upset|moody|distant|late|useless|lazy|selfish|demanding|micromanaging|a nightmare|a pain|being weird|acting weird|not talking|fighting|arguing|hard)\b/;
const POS = /\b(great|amazing|lovely|kind|wonderful|supportive|helpful|fantastic|sweet|awesome|brilliant|good|nice|fun|proud|happy|better|visiting|coming|here|back)\b/;
const NEGATIVE_LIFE = /\b(lost|fired|died|passed away|diagnosed|dumped|cheated|broke up|failed|crashed|robbed|attacked|hospital|funeral|laid off|evicted|divorce|miscarriage|cancer|assaulted|stolen|accident)\b/;
const WHEN = /\b(today|yesterday|last night|this morning|this afternoon|this evening|tonight|last week|last weekend|earlier|just now)\b/;

const swap = (s: string) => ` ${s} `.replace(/\b(i am|i was|i|me|my|mine|myself|am)\b/g, w => (({ 'i am': 'you are', 'i was': 'you were', i: 'you', me: 'you', my: 'your', mine: 'yours', myself: 'yourself', am: 'are' } as Record<string, string>)[w] ?? w)).trim();
const tidy = (s: string) => s.replace(WHEN, '').replace(/\b(a bit|a lot|really|just|also|again|too|so)\s*$/, '').replace(/\s+/g, ' ').trim();

/** Returns null when the text is not a story (commands, questions, feelings and crises are handled elsewhere). */
export function narrative(text: string): Narr | null {
  const t = text.trim();
  if (!t || t.split(' ').length < 3 || t.split(' ').length > 28) return null;
  if (/^(please|can you|could you|would you|will you|remind|add|set|open|call|text|send|play|show|tell|give|make|create|start|stop|turn|what|who|when|where|why|how|do you|are you|is it|did you)\b/.test(t)) return null;
  if (/\b(remind me|add a|set a|set an|set the|my tasks|my notes|my alarm)\b/.test(t)) return null;
  if (NEGATIVE_LIFE.test(t) || /\bi (?:had|have had) an? (?:\w+ )?(?:day|week|morning|night|time)\b/.test(t)) return null;
  const when = t.match(WHEN)?.[0];

  let m: RegExpMatchArray | null;
  // intentions: "I think I will learn guitar", "I might start running", "thinking of getting a dog"
  if ((m = t.match(/^i (?:think|guess|reckon|feel like|maybe) (?:i )?(?:will|might|should|may|ll|could)\s+(.{3,60})$/)) ||
      (!/\b(sleep|cry|scream|die|kill|eat a|murder|cope)\b/.test(t) && (m = t.match(/^i (?:might|may|could|should) (?:just )?(.{3,60})$/))) ||
      (m = t.match(/^i am (?:thinking (?:of|about)|considering|planning(?: to)?|hoping to|trying to decide whether to) (.{3,60})$/)) ||
      (m = t.match(/^i (?:have )?decided to (.{3,60})$/)) ||
      (m = t.match(/^(?:i am going to|i will) (?:finally )?(?:start|try|learn|take up|begin) (.{3,60})$/)) ||
      (m = t.match(/^maybe i (?:will|should|could) (.{3,60})$/))) {
    const x = swap(tidy(m[1]));
    return { kind: 'plan', x: x.replace(/\byou\b/g, 'you'), when };
  }

  // someone / something in my life: "my boss is being difficult", "my phone keeps freezing"
  if ((m = t.match(new RegExp(`^my (${PEOPLE}|${DEVICES})(?:s)? (?:is|are|was|keeps?|has|have|had|does not|did not|will not|won t|just|got|seems?|seemed|always|never|being|gets?|started|stopped|says?|said|wants?|asked)\\b(.*)$`)))) {
    const subj = m[1], rest = m[2] ?? '';
    if (/\b(called|named|name|lives?|works?|born|birthday|age|is a|is an|is my|is in|is from|turns)\b/.test(`${m[0]}`)) return null;
    const isPerson = new RegExp(`^(${PEOPLE})$`).test(subj);
    const tone: Narr['tone'] = NEG.test(rest) || /\b(not|never|n t|won t|keeps|stopped)\b/.test(rest) ? 'neg' : POS.test(rest) ? 'pos' : 'neutral';
    if (isPerson) return { kind: 'person', x: subj, who: subj, tone, when };
    return { kind: 'device', x: subj, tone: tone === 'pos' ? 'pos' : 'neg', when };
  }

  // achievements
  if ((m = t.match(/^i (?:just )?(?:got|received|earned|won|passed|finished|completed|graduated|landed|was given|am getting)\b(.{0,60})$/)) &&
      /\b(promot|university|college|job|offer|raise|degree|exam|test|award|prize|marathon|place|licen[cs]e|interview|accepted|certificate|course|won|passed|graduat|finished|completed|landed|first)/.test(t)) {
    return { kind: 'win', x: swap(tidy(m[0].replace(/^i (just )?/, ''))), when };
  }

  // things I did
  const past = t.match(/^i (?:just )?(went|watched|saw|seen|binged|streamed|read|listened|ate|had|cooked|baked|tried|visited|met|hung|caught up|called|chatted|talked|spoke|ran|jogged|walked|hiked|swam|cycled|trained|worked|lifted|played|bought|ordered|shopped|got|travelled|traveled|flew|drove|stayed|slept|cleaned|painted|built|fixed|made|wrote|studied|attended|presented|started|took)\b\s*(.*)$/);
  if (past) {
    const v = past[1], rest = tidy(past[2] ?? '');
    const all = `${v} ${rest}`;
    const objM = rest.match(/(?:to|at|for|with|on|in)? ?(?:the |a |an |my |some )?(.{2,40})$/);
    const x = swap(rest);
    if (/^(watched|saw|seen|binged|streamed)$/.test(v) || /\b(movie|film|show|series|episode|documentary|netflix|match|game)\b/.test(all)) return { kind: 'media', media: /\b(match|game)\b/.test(all) ? 'game' : /\b(show|series|episode|netflix)\b/.test(all) ? 'show' : 'movie', x, when };
    if (/^(read)$/.test(v) || /\bbook|novel|article\b/.test(all)) return { kind: 'media', media: 'book', x, when };
    if (/^listened$/.test(v)) return { kind: 'media', media: 'music', x, when };
    if (/^(met|hung|caught up|chatted|talked|spoke|called)$/.test(v) || /\bwith (my |a |some )?(friend|friends|family|colleague|mum|mom|dad|sister|brother)\b/.test(all)) return { kind: 'social', x, when };
    if (/^(ate|cooked|baked|had|tried)$/.test(v) && /\b(breakfast|lunch|dinner|supper|pizza|burger|pasta|restaurant|meal|coffee|cake|braai|barbecue|bbq|takeaway|chicken|rice|salad|sandwich|soup|steak|curry|pap|pie|ice cream)\b/.test(all) || /^(ate|cooked|baked)$/.test(v) || /\b(breakfast|lunch|dinner|supper|pizza|burger|pasta|restaurant|meal|coffee|cake|braai|barbecue|bbq|takeaway)\b/.test(all)) return { kind: 'food', x, when };
    if (/^(ran|jogged|swam|cycled|trained|lifted)$/.test(v) || /\b(gym|workout|worked out|yoga|exercise|run|hike|hiked|walk)\b/.test(all)) return { kind: 'exercise', x, when };
    if (/^(met|hung|caught up|chatted|talked|spoke|called)$/.test(v) || /\b(friend|friends|family|party|wedding|date|catch up|caught up)\b/.test(all)) return { kind: 'social', x, when };
    if (/^(bought|ordered|shopped)$/.test(v) || /\bnew (phone|car|laptop|shoes|jacket|dress|bag|watch)\b/.test(all)) return { kind: 'shop', x, when };
    if (/^(travelled|traveled|flew|drove|stayed)$/.test(v) || /\b(trip|holiday|vacation|flight|road trip)\b/.test(all)) return { kind: 'travel', x, when };
    if (/^(worked|presented|attended|studied|wrote)$/.test(v) || /\b(meeting|presentation|project|report|office|client|deadline|exam|class|lecture)\b/.test(all)) return { kind: 'work', x, when };
    if (/^(went|visited)$/.test(v) && objM) return { kind: 'outing', x: swap(rest.match(/\b(?:to|at) (.{2,40})$/)?.[1] ?? rest), when };
    return { kind: 'past', x, when };
  }
  return null;
}

/** Reads the polarity of a short reply to a follow-up question ("it was great", "terrible", "meh"). */
export function replyTone(text: string, emotion: string): 'pos' | 'neg' | 'mid' {
  if (/\b(great|amazing|awesome|loved|love|good|fun|brilliant|fantastic|perfect|best|lovely|nice|wonderful|incredible|so good|cool|enjoyed|delicious|beautiful|worth it|fine)\b/.test(text) && !/\b(not|n t|never) (great|good|fun|nice|that)\b/.test(text)) return 'pos';
  if (/\b(terrible|awful|bad|horrible|boring|hated|hate|worst|rubbish|disappointing|disappointed|meh|ugh|not good|not great|exhausting|stressful|wasted|dull|nasty|gross)\b/.test(text)) return 'neg';
  if (['happy', 'excited', 'grateful', 'proud'].includes(emotion)) return 'pos';
  if (['sad', 'angry', 'anxious', 'tired', 'sick', 'lonely', 'bored'].includes(emotion)) return 'neg';
  return 'mid';
}
