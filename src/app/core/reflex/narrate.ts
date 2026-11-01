/**
 * Narrative listening: when someone simply TELLS you something ("I went to the beach",
 * "my boss is being difficult", "I think I'll learn guitar") a person responds to the story,
 * not to a keyword inside it. This classifies those statements so the engine can answer them
 * like a friend would, and ask a natural follow-up.
 */
export type NarrKind = 'plan' | 'person' | 'device' | 'thing' | 'win' | 'media' | 'food' | 'outing' | 'social' | 'exercise' | 'shop' | 'work' | 'travel' | 'past' | 'doing' | 'body' | 'went' | 'thing' | 'mishap' | 'chore' | 'sport' | 'bday' | 'lost' | 'craving' | 'ruminate' | 'bad' | 'sleep';

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

const PEOPLE = 'kid|kids|child|baby|mom|mum|mother|dad|father|wife|husband|partner|girlfriend|boyfriend|boss|manager|friend|best friend|sister|brother|son|daughter|family|kids|colleague|coworker|roommate|flatmate|neighbour|neighbor|teacher|landlord|gran|granny|grandma|grandpa|grandmother|grandfather|cousin|aunt|uncle|team';
const DEVICES = 'phone|laptop|computer|pc|tablet|car|bike|wifi|internet|router|battery|screen|printer|tv|television|fridge|washing machine|app|website|network|data|signal|bluetooth|charger|headphones|earphones|speaker';
const NEG = /\b(fight|argu\w+|quarrel\w*|row|loud|noisy|again|complain\w*|difficult|annoying|rude|mean|unfair|stressful|stressing|ignoring|ignores|shouting|yelling|nagging|irritating|impossible|toxic|exhausting|driving me|getting on my nerves|loads of|too much|so much|sick|ill|angry|upset|moody|distant|late|useless|lazy|selfish|demanding|micromanaging|a nightmare|a pain|being weird|acting weird|not talking|fighting|arguing|hard)\b/;
const POS = /\b(engaged|married|pregnant|baby|graduated|promoted|won|getting married|new job|great|amazing|lovely|kind|wonderful|supportive|helpful|fantastic|sweet|awesome|brilliant|good|nice|fun|proud|happy|better|visiting|coming|here|back)\b/;
const NEGATIVE_LIFE = /\b(lost|fired|died|passed away|diagnosed|dumped|cheated|broke up|failed|robbed|attacked|hospital|funeral|laid off|evicted|divorce|miscarriage|cancer|assaulted|stolen|accident)\b/;
const WHEN = /\b(today|yesterday|last night|this morning|this afternoon|this evening|tonight|last week|last weekend|earlier|just now)\b/;

const swap = (s: string) => ` ${s} `.replace(/\b(i am|i was|i|me|my|mine|myself|am)\b/g, w => (({ 'i am': 'you are', 'i was': 'you were', i: 'you', me: 'you', my: 'your', mine: 'yours', myself: 'yourself', am: 'are' } as Record<string, string>)[w] ?? w)).trim();
const tidy = (s: string) => s.replace(WHEN, '').replace(/\b(a bit|a lot|really|just|also|again|too|so)\s*$/, '').replace(/\s+/g, ' ').trim();

export const IMPERATIVE = /^(please|can you|could you|would you|will you|remind|add|set|open|call|text|send|play|show|tell|give|make|create|start|stop|turn|translate|convert|find|search|look|check|read|write|take|put|bring|help|explain|define|calculate|what|who|when|where|why|how|do you|are you|is it|did you|list|delete|remove|cancel|schedule|book|log|note|save|launch|go|let|get)\b/;
export const isImperative = (t: string) => IMPERATIVE.test(t.trim());

/** Returns null when the text is not a story (commands, questions, feelings and crises are handled elsewhere). */
export function narrative(text: string): Narr | null {
  let t = text.trim();
  t = t.replace(/^we (?=(?:\w+ed|went|saw|ate|had|got|met|ran|won|drove|took|made|read|bought)\b)/, 'i ').replace(/^(?=(?:had|went|drove|ran|walked|spent) )/, 'i ');
  if (!t || t.split(' ').length < 3 || t.split(' ').length > 28) return null;
  if (isImperative(t)) return null;
  if (/\b(remind me|add a|set a|set an|set the|my tasks|my notes|my alarm)\b/.test(t)) return null;
  let m0: RegExpMatchArray | null;
  if (/^(?:today|tonight|this (?:week|morning|evening)|my day|the day|work|life|everything) (?:was|is|has been|were) /.test(t)) return null;
  const when0 = t.match(WHEN)?.[0];
  if ((m0 = t.match(/^(?:today|tomorrow) is my birthday$|^my birthday is (?:today|tomorrow)$/))) return { kind: 'bday', x: '', when: /tomorrow/.test(t) ? 'tomorrow' : 'today' };
  if (/^i (?:do not|don t) know what to do (?:with my life|anymore|about my life)$|^i (?:feel|am) (?:so |completely |totally )?lost(?: in life)?$|^i have no (?:direction|purpose)$/.test(t)) return { kind: 'lost', x: '' };
  if ((m0 = t.match(/^i (?:can not|cannot|can t) stop thinking about (.{3,50})$/))) return { kind: 'ruminate', x: swap(m0[1]) };
  if ((m0 = t.match(/^i am (?:craving|dreaming of|dying for|in the mood for|so hungry for) (.{3,40})$/))) return { kind: 'craving', x: m0[1] };
  if ((m0 = t.match(/^i (?:just )?(forgot|forget|lost|dropped|spilled|broke|missed|burnt|burned|deleted|locked|overslept|left|ran out of|woke up late|got (?:a )?(?:parking |speeding )?(?:ticket|fine)|had a flat|am locked out)\b\s*(.*)$/)) && !/\b(job|house|mind|temper)\b/.test(t)) return { kind: 'mishap', x: swap(tidy(m0[2] ?? '')), media: m0[1], when: when0 };
  if ((m0 = t.match(/^(?:the |my )?(.{3,30}?) (?:was|were) (?:so |really |very |absolutely |just |quite )?(horrible|terrible|awful|amazing|great|lovely|brilliant|bad|crazy|long|boring|fun|weird|hectic|packed|worst|best|perfect|fantastic|rough|slow|dull|delicious|beautiful)(?: .{0,25})?$/)) && !/^(it|that|this|there|he|she|they|you|i)$/.test(m0[1])) return { kind: 'went', media: 'was', x: m0[1], tone: /horrible|terrible|awful|bad|crazy|long|boring|weird|hectic|worst|rough|slow|dull/.test(m0[2]) ? 'neg' : 'pos', when: when0 };
  if ((m0 = t.match(/^i (?:just )?(scored|played|won) (?:a |an |the |my )?(.{0,40})$/)) && !/\b(lottery|prize|award|job|race|marathon|tender|case)\b/.test(t)) return { kind: 'sport', x: swap(tidy(m0[2] ?? '')), when: when0 };
  if (/\b(passed away|died|funeral|diagnosed|cancer|hospital|miscarriage|laid off|evicted|divorce|dumped|cheated)\b/.test(t) && /^(my |i )/.test(t)) return { kind: 'bad', x: '' };
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
  if ((m = t.match(new RegExp(`^my (?:((?:${PEOPLE}) (?:dog|cat|car|kids?|phone|music|noise|party|wife|husband)|(?:${DEVICES}) (?:battery|screen|charger|speaker|camera|engine|tyres?|keyboard|fan|signal))|(${PEOPLE}|${DEVICES})s?) (\\w+.*)$`)))) {
    const subj = m[1] ?? m[2], rest = m[3] ?? '';
    const compound = !!m[1];
    if (!new RegExp(`^(is|are|was|were|has|have|had|keeps?|kept|got|gets?|gave|took|said|says|told|asked|wants?|wanted|won|will|would|did|does|just|always|never|being|seems?|started|stopped|called|texted|messaged|came|went|left|moved|bought|made|passed|failed|crashed|broke|died|drains?|freezes?|overheats?|dropped|ate|woke|learned|learnt|finally|still|also|only|now|again|can|could|cannot|and|isn|doesn|won|didn|hasn|haven|aren|wasn|wouldn|couldn|shouldn|ran|walked|visited|invited|surprised|helped|cooked|brought|sent|forgot|lost|stole|broke|chewed|ate|bit|scratched|barked|barks|barking|hurt|annoyed|upset|yelled|shouted|ignored|ignores|ignoring|praised|promoted|fired|hired|quit|joined|left|arrived|shipped|launched|delivered|finished|reviewed|approved|rejected|cancelled|postponed|moved|changed|turned|plays?|playing|keeps|needs?)\\b`).test(rest)) return null;
    const whole = `${subj} ${rest}`;
    if (/\b(is called|are called|is named|name is|names are|lives?|works? at|born|birthday|turns)\b|^is (a|an|my|in|from|the) /.test(rest) || /\bis (a|an|my|in|from) /.test(whole)) return null;
    if (new RegExp(`^(${PEOPLE})$`).test(subj) && /^is [a-z]+$/.test(rest) && !NEG.test(rest) && !POS.test(rest) && !/^is (sick|ill|late|away|home|here|back|busy|tired|angry|upset|sad|happy|pregnant|engaged|married|fine|ok|okay|well|worse|better|coming|leaving|leaving)$/.test(rest)) return null;
    const isPerson = new RegExp(`^(${PEOPLE})\\b`).test(subj);
    const tone: Narr['tone'] = NEG.test(rest) || /\b(not|never|n t|won t|keeps|stopped|crashed|broke|broken|died|dying|down|freez\w+|drain\w*|overheat\w*|slow)\b/.test(rest) ? 'neg' : POS.test(rest) ? 'pos' : 'neutral';
    if (isPerson) return { kind: 'person', x: subj, who: subj.split(' ')[0], tone, when };
    return { kind: 'device', x: subj, tone: tone === 'pos' ? 'pos' : 'neg', when };
  }
  // anything else of mine that is misbehaving: "my plants are dying", "my app crashed again"
  if ((m = t.match(/^my ([a-z]+(?: [a-z]+)?) (?:is|are|was|were|keeps?|has|have|had|won t|will not|did not|does not|stopped|is not|are not|crashed|broke|died|failed|\w+ed)\b(.*)$/)) && !/^(back|head|neck|knees?|stomach|throat|legs?|arms?|shoulders?|teeth|tooth|eyes?|feet|foot|ankle|wrist|chest|ears?|belly|hip|jaw|nerves|mood|mind|patience|energy|motivation|brain|health|heart|tasks?|notes?|alarms?|reminders?|goals?|habits?|day|name|birthday|calendar|schedule|list|journal|memory|streak|plan|week)\b/.test(m[1]) && !isImperative(m[1])) {
    const rest = m[2] ?? '';
    return { kind: 'thing', x: m[1], tone: NEG.test(rest) || /\b(dying|dead|broke|broken|crash\w*|not|n t|stopped|failed|won t|keeps)\b/.test(`${m[0]}`) ? 'neg' : POS.test(rest) ? 'pos' : 'neutral', when };
  }

  if (/^i (?:had|got) (?:the |a )?(?:best|great|good|terrible|awful|bad|horrible|poor|lovely|deep|decent|rough|long|short) (?:\w+ )?sleep|^i slept (?:well|badly|terribly|like a baby|great|poorly|little|in)|^i (?:barely|hardly) slept/.test(t)) return { kind: 'sleep', x: '', tone: /best|great|good|lovely|deep|decent|well|like a baby|long|in$/.test(t) ? 'pos' : 'neg', when };
  // body: "my back hurts"
  if ((m = t.match(/^my (back|head|neck|knee|knees|stomach|throat|leg|legs|arm|arms|shoulder|shoulders|tooth|teeth|eyes?|feet|foot|ankle|wrist|chest|ear|ears|belly|hip|jaw) (?:hurts?|aches?|is sore|are sore|is killing me|are killing me|is aching|is pounding|is throbbing|is splitting|feels? (?:sore|tight|weird|off))/))) return { kind: 'body', x: m[1], when };
  // "the exam went badly"
  if ((m = t.match(/^(?:the |my )?(.{3,30}?) went (badly|terribly|horribly|poorly|well|great|fine|ok|okay|brilliantly|amazingly)$/))) return { kind: 'went', x: m[1], tone: /well|great|fine|ok|brilliant|amazing/.test(m[2]) ? 'pos' : 'neg', when };
  // ongoing: "I am learning to swim"
  if ((m = t.match(/^i am (?:currently |now |slowly )?(learning|studying|practising|practicing|training|building|writing|saving|growing|making|teaching myself|working on) (.{2,50})$/))) return { kind: 'doing', x: swap(tidy(`${m[1].replace('teaching myself', 'learning')} ${m[2]}`)), when };

  // achievements
  if (!(/^i (?:just )?(?:finished|completed)\b/.test(t) && !/\b(degree|course|marathon|exam|studies|thesis|race|training|programme|diploma)\b/.test(t)) && (m = t.match(/^i (?:just )?(?:got|received|earned|won|passed|finished|completed|graduated|landed|was given|am getting)\b(.{0,60})$/)) &&
      /\b(promot|university|college|job|offer|raise|degree|exam|test|award|prize|marathon|place|licen[cs]e|interview|accepted|certificate|course|passed|graduat|landed)/.test(t)) {
    return { kind: 'win', x: swap(tidy(m[0].replace(/^i (just )?/, ''))), when };
  }

  // things I did
  const past = t.match(/^i (?:just )?(went|watched|saw|seen|binged|streamed|read|listened|ate|had|cooked|baked|tried|visited|met|hung|caught up|called|chatted|talked|spoke|ran|jogged|walked|hiked|swam|cycled|trained|worked|lifted|played|bought|ordered|shopped|got|travelled|traveled|flew|drove|stayed|slept|cleaned|painted|built|fixed|made|wrote|studied|attended|presented|started|took|finished|completed|spent|booked|did|washed|tidied|repaired|organised|organized|sorted|mowed|ironed|reserved|planned|proposed|signed|registered|applied|moved|joined|adopted)\b\s*(.*)$/);
  if (past) {
    const v = past[1], rest = tidy(past[2] ?? '');
    if (/^(finished|completed)$/.test(v) && !/\b(shift|meeting|presentation|project|report|office|client|class|lecture|overtime|workout|run|book|chapter|series|season|puzzle)\b/.test(rest)) return null;
    if (v === 'did' && !/laundry|dishes|washing|chores|ironing|homework|shopping|cleaning|garden/.test(rest)) return null;
    const all = `${v} ${rest}`;
    const objM = rest.match(/(?:to|at|for|with|on|in)? ?(?:the |a |an |my |some )?(.{2,40})$/);
    const x = swap(rest);
    if (/^(saw|met)$/.test(v) && /\b(friend|friends|family|cousin|neighbour|neighbor|colleague|ex|brother|sister|mum|mom|dad|teacher|boss|aunt|uncle|gran|grandma)\b/.test(all)) return { kind: 'social', x, when };
    if (/^(watched|saw|seen|binged|streamed)$/.test(v) || /\b(movie|film|show|series|episode|documentary|netflix|match|game)\b/.test(all)) return { kind: 'media', media: /\b(match|game)\b/.test(all) ? 'game' : /\b(show|series|episode|netflix)\b/.test(all) ? 'show' : 'movie', x, when };
    if (/^(read)$/.test(v) || /\bbook\b|\bnovel\b|\barticle\b/.test(all)) return { kind: 'media', media: 'book', x, when };
    if (/^listened$/.test(v)) return { kind: 'media', media: 'music', x, when };
    if (/^(met|hung|caught up|chatted|talked|spoke|called)$/.test(v) || /\bwith (my |a |some )?(friend|friends|family|colleague|mum|mom|dad|sister|brother)\b/.test(all)) return { kind: 'social', x, when };
    if (/^(ate|cooked|baked|had|tried)$/.test(v) && /\b(breakfast|lunch|dinner|supper|pizza|burger|pasta|restaurant|meal|coffee|cake|braai|barbecue|bbq|takeaway|chicken|rice|salad|sandwich|soup|steak|curry|pap|pie|ice cream)\b/.test(all) || /^(ate|cooked|baked)$/.test(v) || /\b(breakfast|lunch|dinner|supper|pizza|burger|pasta|restaurant|meal|coffee|cake|braai|barbecue|bbq|takeaway)\b/.test(all)) return { kind: 'food', x, when };
    if (/^(ran|jogged|swam|cycled|trained|lifted|walked|hiked)$/.test(v) || /\b(gym|workout|worked out|yoga|exercise|run|hike|hiked|walk)\b/.test(all)) return { kind: 'exercise', x, when };
    if (/^(met|hung|caught up|chatted|talked|spoke|called)$/.test(v) || /\b(friend|friends|family|party|wedding|date|catch up|caught up)\b/.test(all)) return { kind: 'social', x, when };
    if (/^(bought|ordered|shopped)$/.test(v) || /\bnew (phone|car|laptop|shoes|jacket|dress|bag|watch)\b/.test(all)) return { kind: 'shop', x, when };
    if (/^(cleaned|washed|tidied|fixed|repaired|painted|built|organised|organized|sorted|mowed|ironed|did)$/.test(v)) return { kind: 'chore', x, when };
    if (/^(travelled|traveled|flew|drove|stayed|booked|reserved)$/.test(v) || /\b(trip|holiday|vacation|flight|road trip)\b/.test(all)) return { kind: 'travel', x, when };
    if (/^(worked|presented|attended|studied|wrote)$/.test(v) || /\b(meeting|presentation|project|report|office|client|deadline|exam|class|lecture)\b/.test(all)) return { kind: 'work', x, when };
    if (v === 'took' && /\bto (.{2,30})$/.test(rest)) return { kind: 'outing', x: swap(rest.match(/\bto (.{2,30})$/)![1]), when };
    if (/^(went|visited)$/.test(v) && objM) return { kind: 'outing', x: swap(rest.match(/\b(?:to|at) (.{2,40})$/)?.[1] ?? rest), when };
    return { kind: 'past', x, when };
  }
  return null;
}

/** Reads the polarity of a short reply to a follow-up question ("it was great", "terrible", "meh"). */
export function replyTone(text: string, emotion: string): 'pos' | 'neg' | 'mid' {
  if (/\b(great|amazing|awesome|loved|love|good|fun|brilliant|fantastic|perfect|best|lovely|nice|wonderful|incredible|so good|cool|enjoyed|delicious|beautiful|worth it|fine)\b/.test(text) && !/\b(not|n t|never) (great|good|fun|nice|that)\b/.test(text)) return 'pos';
  if (/\b(terrible|awful|bad|horrible|boring|hated|hate|worst|burnt|burned|burnt|overcooked|ruined|failed|flopped|went wrong|rubbish|disappointing|disappointed|meh|ugh|not good|not great|exhausting|stressful|wasted|dull|nasty|gross)\b/.test(text)) return 'neg';
  if (['happy', 'excited', 'grateful', 'proud'].includes(emotion)) return 'pos';
  if (['sad', 'angry', 'anxious', 'tired', 'sick', 'lonely', 'bored'].includes(emotion)) return 'neg';
  return 'mid';
}
