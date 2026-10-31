/** Rule-based personal-fact learning, recall phrasing and curiosity questions (no LLM). */
import { extract } from './entities';
import { capFirst } from './text';

export interface LearnedFact {
  /** Third-person memory text, e.g. "User's sister is Thandi". */
  text: string;
  kind: 'fact' | 'preference' | 'goal' | 'person' | 'project' | 'event';
  importance: number;
  /** Short spoken echo: "your sister is Thandi". */
  echo: string;
  /** Upcoming event to ask about later. */
  followUp?: { about: string; date: string };
  /** Profile key this answers (stops Jarvis asking again). */
  key?: string;
  userName?: string;
}

const RELATIONS = 'wife|husband|partner|girlfriend|boyfriend|fiance|fiancee|mom|mum|mother|dad|father|sister|brother|son|daughter|baby|kid|child|boss|manager|best friend|friend|cousin|aunt|uncle|grandma|granny|gogo|grandmother|grandpa|grandfather|mkhulu|dog|cat|pet|colleague|coworker|teacher|pastor|doctor|landlord|neighbour|neighbor|roommate|flatmate|niece|nephew|twin|stepmom|stepdad|crush|mentor|client';
const BAD_NAME = /^(a|an|the|so|very|really|not|also|just|my|is|was|being|going|coming|here|there|sick|ill|fine|good|great|ok|okay|busy|tired|mad|angry|happy|sad|away|home|out|back|late|nice|cool|annoying|amazing|awesome|bad|kind|mean|crazy|weird|funny|smart|pregnant|visiting|in|at|on|with|from)$/;

const tidy = (s: string) => s.replace(/[.!?]+$/, '').replace(/\s+/g, ' ').trim();
const nameCase = (s: string) => s.split(' ').map(capFirst).join(' ');

/** Extracts durable facts from one user utterance. `raw` keeps original casing for names. */
export function learnFacts(norm: string, raw: string, now = new Date()): LearnedFact[] {
  const out: LearnedFact[] = [];
  const t = ` ${norm} `;
  const keep = (s: string) => { const i = raw.toLowerCase().indexOf(s.toLowerCase()); return i >= 0 ? raw.slice(i, i + s.length) : s; };
  let m: RegExpMatchArray | null;

  // names
  if ((m = norm.match(/^(?:hi |hello |hey )?(?:my name is|i am called|the name is|name is) ([a-z][a-z' -]{1,30})$/))) {
    const n = nameCase(keep(m[1].split(' ').slice(0, 3).join(' ')));
    if (!BAD_NAME.test(m[1].split(' ')[0])) out.push({ text: `User's name is ${n}`, kind: 'fact', importance: 5, echo: `your name is ${n}`, key: 'name', userName: n });
  }
  // relations: "my sister is thandi", "my sister's name is thandi", "my sister thandi ..."
  const rel = new RegExp(`\\bmy (${RELATIONS})(?:s name is| name is| is called| is named| called| named| is) ([a-z][a-z'-]{1,20}(?: [a-z][a-z'-]{1,20})?)\\b(.*)$`);
  if ((m = norm.match(rel)) && !BAD_NAME.test(m[2].split(' ')[0])) {
    const words = m[2].split(' ');
    const name = nameCase(keep(BAD_NAME.test(words[1] ?? 'x') || !words[1] ? words[0] : m[2]));
    out.push({ text: `User's ${m[1]} is ${name}`, kind: 'person', importance: 4, echo: `your ${m[1]} is ${name}` });
  }
  const named = raw.match(new RegExp(`\\b[Mm]y (${RELATIONS}) ([A-Z][a-z]{1,20})\\b`));
  if (named && !BAD_NAME.test(named[2].toLowerCase()) && !out.some(o => o.kind === 'person')) {
    out.push({ text: `User's ${named[1].toLowerCase()} is ${named[2]}`, kind: 'person', importance: 4, echo: `your ${named[1].toLowerCase()} is ${named[2]}` });
  }
  if ((m = norm.match(new RegExp(`\\b([a-z]+) is my (${RELATIONS})\\b`))) && !BAD_NAME.test(m[1]) && !/^(this|that|he|she|it|who|what|there|which)$/.test(m[1])) {
    const name = nameCase(keep(m[1]));
    out.push({ text: `User's ${m[2]} is ${name}`, kind: 'person', importance: 4, echo: `${name} is your ${m[2]}` });
  }
  // places & work
  if ((m = norm.match(/\bi (?:live|stay) in ([a-z][a-z ]{2,30})$/)) || (m = norm.match(/\bi am from ([a-z][a-z ]{2,30})$/))) {
    const place = nameCase(keep(tidy(m[1])));
    const from = /from/.test(m[0]);
    out.push({ text: from ? `User is from ${place}` : `User lives in ${place}`, kind: 'fact', importance: 4, echo: from ? `you are from ${place}` : `you live in ${place}`, key: 'city' });
  }
  if ((m = norm.match(/\bi work (?:at|for) ([a-z0-9][a-z0-9 &.-]{1,40})$/))) {
    const org = keep(tidy(m[1]));
    out.push({ text: `User works at ${org}`, kind: 'fact', importance: 4, echo: `you work at ${org}`, key: 'job' });
  }
  if ((m = norm.match(/\b(?:i work as|my job is|i am working as|my profession is) (?:an? )?([a-z][a-z -]{2,40})$/)) && !/^(nothing|it|that|this|my best|what)/.test(m[1])) {
    const job = tidy(m[1]);
    out.push({ text: `User works as ${/^[aeiou]/.test(job) ? 'an' : 'a'} ${job}`, kind: 'fact', importance: 4, echo: `you work as ${/^[aeiou]/.test(job) ? 'an' : 'a'} ${job}`, key: 'job' });
  }
  if ((m = norm.match(/\bi am an? ((?:software |web |mobile |senior |junior |lead |freelance |full stack |front end |back end )?(?:developer|engineer|programmer|designer|teacher|nurse|doctor|student|lawyer|accountant|manager|entrepreneur|writer|artist|photographer|chef|driver|mechanic|electrician|plumber|pastor|farmer|consultant|analyst|scientist|researcher|architect|musician|producer|founder|ceo|cto|banker|pharmacist|dentist|coach|trainer|marketer|salesperson|lecturer|tutor))\b/))) {
    out.push({ text: `User is ${/^[aeiou]/.test(m[1]) ? 'an' : 'a'} ${m[1]}`, kind: 'fact', importance: 4, echo: `you are ${/^[aeiou]/.test(m[1]) ? 'an' : 'a'} ${m[1]}`, key: 'job' });
  }
  // birthday & age
  if ((m = norm.match(/\b(?:my birthday is|my bday is|i was born on) (.+)$/))) {
    const e = extract(m[1], now);
    const when = e.date ? new Date(e.date).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) : tidy(m[1]);
    out.push({ text: `User's birthday is ${when}${e.date ? ` (${e.date.slice(5)})` : ''}`, kind: 'fact', importance: 5, echo: `your birthday is ${when}`, key: 'birthday' });
  }
  if ((m = norm.match(/\bi am (\d{1,2}) (?:years old|year old|yrs old)\b/))) out.push({ text: `User is ${m[1]} years old (as of ${now.getFullYear()})`, kind: 'fact', importance: 3, echo: `you are ${m[1]}` });
  // preferences
  if ((m = norm.match(/\bmy (?:favourite|fav) ([a-z ]{2,20}?) (?:is|are) ([a-z0-9][a-z0-9 '&-]{1,40})$/))) {
    const thing = tidy(m[1]), val = keep(tidy(m[2]));
    out.push({ text: `User's favourite ${thing} is ${val}`, kind: 'preference', importance: 3, echo: `your favourite ${thing} is ${val}`, key: `fav_${thing.replace(/ /g, '_')}` });
  }
  if ((m = norm.match(/^i (?:really |absolutely |totally )?(love|like|enjoy|adore|am into|am obsessed with) ([a-z0-9][a-z0-9 '&-]{2,40})$/)) && !/^(you|it|that|this|them|him|her|when|how|to talk|talking to you)\b/.test(m[2])) {
    const v = keep(tidy(m[2]));
    out.push({ text: `User ${m[1] === 'am into' || m[1] === 'am obsessed with' ? 'is into' : m[1] === 'love' ? 'loves' : m[1] + 's'} ${v}`, kind: 'preference', importance: 3, echo: `you ${m[1] === 'am into' ? 'are into' : m[1] === 'am obsessed with' ? 'are obsessed with' : m[1]} ${v}` });
  }
  if ((m = norm.match(/^i (?:really )?(hate|dislike|can not stand|do not like) ([a-z0-9][a-z0-9 '&-]{2,40})$/)) && !/^(you|it|that|this|when|how|my life|everything|myself)\b/.test(m[2])) {
    const v = keep(tidy(m[2]));
    out.push({ text: `User dislikes ${v}`, kind: 'preference', importance: 3, echo: `you are not a fan of ${v}` });
  }
  if ((m = norm.match(/\bi am allergic to ([a-z ]{3,30})$/))) out.push({ text: `User is allergic to ${tidy(m[1])}`, kind: 'fact', importance: 5, echo: `you are allergic to ${tidy(m[1])}` });
  if ((m = norm.match(/\bi (?:am|have been) (?:a )?(vegetarian|vegan|pescatarian|halal|kosher)\b/))) out.push({ text: `User is ${m[1]}`, kind: 'preference', importance: 4, echo: `you are ${m[1]}` });
  // goals
  if ((m = norm.match(/\b(?:my goal is to|i want to|i am trying to|i plan to|my dream is to) ([a-z][a-z0-9 ,'-]{4,60})$/)) && !/\b(sleep|eat|go to bed|know|ask|talk|cancel|stop|see|remind|add|delete|set)\b/.test(m[1].split(' ')[0])) {
    out.push({ text: `User wants to ${tidy(m[1])}`, kind: 'goal', importance: 4, echo: `you want to ${tidy(m[1])}` });
  }
  // upcoming events → follow-ups ("i have an interview tomorrow")
  if (!/^(do|did|does|have|has|will|can|could|would|are|is|am|what|when|where|who|how|why)\b/.test(norm) && (m = norm.match(/\bi (?:have|got) (a |an |my |the )?([a-z][a-z ]{2,30}?) (today|tonight|tomorrow|on [a-z]+|next week|this weekend|on the \d+\w*|in \d+ days)\b/))
      && !/\b(task|reminder|alarm|meeting with you|question|idea|problem)\b/.test(m[2]) && !/^(any|some|no|many|much|more|less)\b/.test(m[2])) {
    const e = extract(m[3], now);
    const det = (m[1] ?? (/^[aeiou]/.test(m[2]) ? 'an ' : 'a ')).trim();
    const day = e.date ? new Date(e.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) : m[3];
    if (e.date) out.push({ text: `User has ${det} ${m[2]} on ${day} (${e.date})`, kind: 'event', importance: 3, echo: `you have ${det} ${m[2]} ${m[3]}`, followUp: { about: m[2], date: e.date } });
  }
  return out;
}

/** "User's sister is Thandi" → "your sister is Thandi". */
export function secondPerson(t: string): string {
  let s = ' ' + t.trim() + ' ';
  s = s.replace(/\bThe user's\b|\bthe user's\b|\bUser's\b|\buser's\b/g, 'your').replace(/\bThe user\b|\bthe user\b|\bUser\b|\buser\b/g, 'you');
  s = s.replace(/\byou (is|has|was|likes|loves|lives|works|wants|hates|dislikes|enjoys|prefers|adores|needs|plans|goes|does|has been)\b/g, (_, v: string) => `you ${({ is: 'are', has: 'have', was: 'were', does: 'do', goes: 'go', 'has been': 'have been' } as Record<string, string>)[v] ?? v.replace(/s$/, '')}`);
  s = s.replace(/\bthey\b/g, 'you').replace(/\btheir\b/g, 'your').replace(/\bthemselves\b/g, 'yourself');
  return s.trim();
}

/** Questions Jarvis asks to get to know the user. `mem` = how the answer is stored. */
export const PROFILE_QS: { key: string; q: string[]; mem: (a: string) => string; react: string[]; test?: RegExp }[] = [
  { key: 'name', q: ['By the way, I never caught your name. What should I call you?', 'What is your name, if you do not mind me asking?'], mem: a => `User's name is ${a}`, react: ['Lovely to properly meet you, {a}.', '{a}. I like it.'] },
  { key: 'city', q: ['Where are you based, by the way?', 'Which city do you live in?'], mem: a => `User lives in ${a}`, react: ['{a}. Noted.', 'Ah, {a}. Good to know.'] },
  { key: 'job', q: ['What do you do for work?', 'What keeps you busy, work-wise?'], mem: a => `User's work: ${a}`, react: ['{a}. That explains a lot of your tasks.', 'Interesting. {a}. I will keep that in mind.'] },
  { key: 'birthday', q: ['When is your birthday? I would like to remember it.', 'Quick one: when is your birthday?'], mem: a => `User's birthday is ${a}`, react: ['{a}. It is in the vault.', 'Noted: {a}. I will not forget.'] },
  { key: 'fav_music', q: ['What kind of music do you listen to?', 'What is your go-to music?'], mem: a => `User's favourite music is ${a}`, react: ['{a}, good taste.', '{a}. Nice.'] },
  { key: 'fav_food', q: ['What is your favourite food?', 'If you could eat one meal forever, what would it be?'], mem: a => `User's favourite food is ${a}`, react: ['{a}. Now I am hungry, and I do not even eat.', '{a}. Solid choice.'] },
  { key: 'hobby', q: ['What do you do for fun?', 'What is a hobby you love?'], mem: a => `User's hobby: ${a}`, react: ['{a}. We should make time for that.', 'Love that. {a}.'] },
  { key: 'goal_year', q: ['What is one big thing you want to achieve this year?', 'If this year went perfectly, what would you have done?'], mem: a => `User's big goal this year: ${a}`, react: ['{a}. Let us make it happen. Say "add a goal" whenever you want me to track it.', 'That is a great goal: {a}.'] },
  { key: 'chronotype', q: ['Are you a morning person or a night owl?'], mem: a => `User is a ${/night|owl|late|evening/.test(a) ? 'night owl' : /morning|early/.test(a) ? 'morning person' : a}`, react: ['Noted. I will plan around it.', 'Good to know; I will schedule hard things accordingly.'] },
  { key: 'drink', q: ['Coffee or tea?'], mem: a => `User prefers ${a}`, react: ['{a}. Respect.', '{a}, of course.'] },
  { key: 'best_friend', q: ['Who is your best friend?', 'Who is the person you trust most?'], mem: a => `User's best friend is ${a}`, react: ['{a}. Good to know who is in your corner.'] },
  { key: 'dream', q: ['What is a dream you have not told many people?', 'If money were no issue, what would you do?'], mem: a => `User's dream: ${a}`, react: ['That is a beautiful dream: {a}.', 'I hope you get there. I will help.'] },
  { key: 'fav_movie', q: ['What is your favourite movie or series?'], mem: a => `User's favourite movie or series is ${a}`, react: ['{a}. Great pick.'] },
  { key: 'stress_relief', q: ['What helps you unwind when things get heavy?'], mem: a => `What helps the user unwind: ${a}`, react: ['Good. I will remind you of that on rough days.'] },
];

/** Cleans a free-text answer to a profile question ("i guess probably jazz lol" → "jazz"). */
export function cleanAnswer(norm: string, raw: string): string {
  let a = norm.replace(/^(i (guess|think|would say|suppose)|probably|maybe|definitely|honestly|well|um+|uh+|hmm+|so|it is|that is|that would be|my favourite is|i like|i love|i am|i live in|i work as|i work at|call me|my name is)\s+/g, '')
    .replace(/\b(haha|lol)\b/g, '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 2; i++) a = a.replace(/^(i (guess|think)|probably|maybe|a|an|the)\s+/, '');
  const idx = raw.toLowerCase().indexOf(a);
  return idx >= 0 ? raw.slice(idx, idx + a.length).replace(/[.!?]+$/, '') : a;
}

/** Recall question → memory search query. */
export function recallQuery(norm: string): string {
  return norm
    .replace(/^(do you (know|remember)|can you tell me|tell me|remind me)\s+/, '')
    .replace(/^(what|who|where|when|how) (is|are|was|were|do|did) /, '')
    .replace(/\b(what|who|where|when)\b/g, '')
    .replace(/\bmy\b/g, "user's").replace(/\bi\b/g, 'user').replace(/\bme\b/g, 'user')
    .replace(/\s+/g, ' ').trim();
}
