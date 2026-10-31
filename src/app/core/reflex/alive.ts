/**
 * The "alive" layer: Jarvis's own persistent inner state (relationship age, mood, curiosity, follow-ups,
 * opinions) and the proactive extras ("spice") that make replies feel spontaneous.
 */
import type { Rules } from './grammar';
import { hash, rng } from './text';
import type { HostState } from './types';

export interface InnerState {
  firstSeen: number;
  lastSeen: number;
  lastSeenPrev?: number;
  turns: number;
  days: string[];
  /** Jarvis's own mood -1..1, drifts with the user's tone. */
  mood: number;
  /** Exponential average of user valence. */
  userMood: number;
  asked: string[];
  known: string[];
  followUps: { about: string; date: string; asked?: boolean }[];
  saidMilestones: number[];
  lastSpiceTurn: number;
  lastAskTurn?: number;
  lastSpiceKind: string;
  topics: Record<string, number>;
  seed: number;
  birthday?: string; // MM-DD
  /** Questions asked while offline, answered later. */
  lookups?: { q: string; t: number }[];
  lastCrisis?: number;
  screens?: { kind: 'phq2' | 'gad2' | 'phq9' | 'gad7'; score: number; items: number[]; t: number }[];
  lookedUp?: { q: string; t: number; answer: string; source: string; told?: boolean }[];
  lastBirthdayYear?: number;
}

export const freshInner = (now: number): InnerState => ({
  firstSeen: now, lastSeen: now, turns: 0, days: [], mood: 0.3, userMood: 0, asked: [], known: [], followUps: [],
  saidMilestones: [], lastSpiceTurn: -10, lastSpiceKind: '', topics: {}, seed: (now ^ 0x5bd1e995) >>> 0,
});

const OPINIONS: Record<string, string[]> = {
  colour: ['Midnight blue', 'Deep teal', 'Arc-reactor blue', 'Burnt orange', 'Forest green', 'Gold, obviously'],
  food: ['A proper braai', 'Bunny chow', 'Sushi', 'Pap and chakalaka', 'Wood-fired pizza', 'A full English breakfast'],
  music: ['Jazz, especially late at night', 'Amapiano when the tasks are done', 'Classical; it is very orderly', 'Old-school soul', 'Lo-fi beats for focus', 'Anything with a good bassline'],
  movie: ['Anything about a clever AI who is also polite', 'A good heist film', 'Space documentaries', 'Old black-and-white detective films'],
  book: ['Meditations by Marcus Aurelius', 'Anything about the history of science', 'A thick fantasy series', 'Atlas-sized books about maps'],
  animal: ['Octopus; three hearts, problem solver, my kind of creature', 'Cheetah; efficient', 'Owl; night shift colleague', 'Elephant; never forgets, like me'],
  season: ['Autumn; everything slows down nicely', 'Spring; fresh starts', 'Winter; perfect weather for deep work'],
  sport: ['Rugby; strategy with consequences', 'Chess, if that counts', 'Football; the drama is unmatched', 'Cricket; the long game'],
  drink: ['Tea, Earl Grey', 'Rooibos', 'Strong coffee, vicariously'],
  place: ['The Drakensberg at sunrise', 'A quiet library', 'Anywhere with good wifi and no notifications'],
  thing: ['A finished to-do list', 'A well-kept calendar', 'An inbox at zero'],
};

/** Stable opinions: same answer every time for this install. */
export function opinion(seed: number, topic: string): { thing: string; opinion: string } {
  const keys = Object.keys(OPINIONS);
  const k = keys.find(x => topic.includes(x)) ?? (/(color|colour)/.test(topic) ? 'colour' : /(song|band|artist|genre)/.test(topic) ? 'music' : /(film|series|show)/.test(topic) ? 'movie' : /(meal|dish|eat)/.test(topic) ? 'food' : /(team|game)/.test(topic) ? 'sport' : 'thing');
  const list = OPINIONS[k];
  return { thing: k === 'thing' ? 'thing' : k, opinion: list[hash(`${seed}:${k}`) % list.length] };
}

export const ALIVE_RULES: Rules = {
  'spice.overdue': ['By the way, {overdue} task{s:overdue} {overdueVerb} overdue; {overdue1} is the oldest.', 'Small nudge: {overdue1} is still overdue.', '[toughLove>60] Also, {overdue1}. Still overdue. Just saying.', '[humor>55] Unrelated, but {overdue1} has been waiting so long it is considering therapy.'],
  'spice.habits': ['Before the day ends: {habitsLeft} still unticked.', '[toughLove>60] Your streak wants {habitsLeft}. Today.', 'Quick one: have you done {habitsLeft} today?'],
  'spice.mit': ['Your top priority is still {mit1}.', '[proactivity>70] Shall we knock out {mit1} next?', 'When you are ready: {mit1}.'],
  'spice.late': ['Also, it is {time}. Sleep is a productivity tool, #h#.', '[warmth>60] It is late; please do not stay up too long.', '[humor>55] It is {time}. Even I am considering a screensaver.'],
  'spice.followup': ['By the way, how did the {about} go?', 'Oh, and I have been meaning to ask: how was the {about}?', '[warmth>60] How did your {about} go? I have been curious.'],
  'spice.milestone': ['Fun fact: that was our {turns}th exchange. Thank you for keeping me busy.', 'We just passed {turns} conversations, #h#. Here is to the next {turns}.', '[humor>50] Milestone: {turns} messages. I would throw a party but I only have notifications.'],
  'spice.birthday': ['Wait. It is your birthday today! Happy birthday, #h#! 🎉', 'Happy birthday, #h#! I remembered. Of course I remembered.'],
  'spice.knownDays': ['We have been working together for {knownDays} days now. Feels like longer, in a good way.'],
  'spice.musing': ['Random thought: #musing#', '[humor>50] Shower thought, minus the shower: #musing#', 'I was just thinking: #musing#'],
  musing: [
    'if you finish your top three today, tomorrow-you gets a head start.', 'most big achievements are just boring days stacked well.', 'your calendar says a lot about what you value.',
    'you have talked to me more #partOfDay# than usual. I like it.', 'a ten-minute walk solves more problems than people expect.', 'every "no" protects a "yes" that matters.',
    'water. Drink some. I cannot, so I live vicariously.', 'one day your future self will thank you for today\'s small step.', 'boredom is underrated; it is where ideas hide.',
  ],
  'spice.mood.low': ['[emotional>40] You have seemed a bit down lately. I am here if you want to talk.', '[emotional>40] I have noticed things feel heavier this week. Be gentle with yourself.'],
  'spice.streak': ['Day {streak} of your streak, by the way. Do not break the chain.', '[enthusiasm>65] {streak}-day streak! Keep it rolling!'],
};

export interface SpiceCtx {
  inner: InnerState;
  state: HostState;
  traits: Record<string, number>;
  now: Date;
  intentKind: string;
  quiet: boolean;
  emotionNegative: boolean;
  missingProfile: string[];
}

/** Picks at most one proactive extra for this reply. Returns a grammar symbol (+ extra vars) or a profile question key. */
export function chooseSpice(c: SpiceCtx): { sym?: string; vars?: Record<string, unknown>; ask?: string } | null {
  const { inner, state, traits, now } = c;
  if (c.quiet) return null;
  const r = rng(inner.seed + inner.turns * 7919);
  const since = inner.turns - inner.lastSpiceTurn;
  const today = now.toISOString().slice(5, 10);
  const ymd = now.toISOString().slice(0, 10);

  // events that should always be said once
  if (inner.birthday === today && inner.lastBirthdayYear !== now.getFullYear()) return { sym: 'spice.birthday', vars: { _birthday: true } };
  const fu = inner.followUps.find(f => !f.asked && f.date < ymd);
  if (fu && !c.emotionNegative) return { sym: 'spice.followup', vars: { about: fu.about, _followup: fu } };
  const ms = [10, 50, 100, 250, 500, 1000, 2500, 5000].find(m => inner.turns >= m && !inner.saidMilestones.includes(m));
  if (ms) return { sym: 'spice.milestone', vars: { turns: ms, _milestone: ms } };

  if (since < 3) return null;
  const chatty = c.intentKind === 'chat';
  const pro = (traits['proactivity'] ?? 50) / 100;
  const cur = (traits['curiosity'] ?? 50) / 100;
  const hour = now.getHours();
  const cands: { w: number; out: { sym?: string; vars?: Record<string, unknown>; ask?: string }; kind: string }[] = [];
  if (state.overdue > 0) cands.push({ w: pro * 0.5, out: { sym: 'spice.overdue' }, kind: 'overdue' });
  if (state.habitsLeft.length && hour >= 17) cands.push({ w: pro * 0.6, out: { sym: 'spice.habits' }, kind: 'habits' });
  if (state.mits.length && !chatty) cands.push({ w: pro * 0.25, out: { sym: 'spice.mit' }, kind: 'mit' });
  if (hour >= 23 || hour < 4) cands.push({ w: 0.5, out: { sym: 'spice.late' }, kind: 'late' });
  if (inner.userMood < -0.35) cands.push({ w: (traits['emotional'] ?? 50) / 100 * 0.6, out: { sym: 'spice.mood.low' }, kind: 'mood' });
  if (state.streak >= 3 && !chatty) cands.push({ w: 0.15, out: { sym: 'spice.streak' }, kind: 'streak' });
  if (chatty && !c.emotionNegative && c.missingProfile.length) cands.push({ w: cur * 0.9, out: { ask: c.missingProfile[Math.floor(r() * c.missingProfile.length)] }, kind: 'ask' });
  if (chatty && !c.emotionNegative) cands.push({ w: ((traits['playfulness'] ?? 50) + (traits['humor'] ?? 50)) / 200 * 0.3, out: { sym: 'spice.musing' }, kind: 'musing' });
  const known = Math.floor((now.getTime() - inner.firstSeen) / 864e5);
  if ([7, 30, 100, 365].includes(known) && !inner.saidMilestones.includes(-known)) cands.push({ w: 2, out: { sym: 'spice.knownDays', vars: { _days: known } }, kind: 'days' });

  const pool = cands.filter(x => x.kind !== inner.lastSpiceKind || x.kind === 'ask');
  if (!pool.length) return null;
  // overall chance of adding anything grows with time since the last extra
  const chance = Math.min(0.55, 0.06 + since * 0.04 + pro * 0.06);
  if (r() > chance) return null;
  const total = pool.reduce((a, x) => a + x.w, 0);
  if (total <= 0) return null;
  let p = r() * total;
  for (const x of pool) { p -= x.w; if (p <= 0) return { ...x.out, vars: { ...(x.out.vars ?? {}), _kind: x.kind } }; }
  return null;
}
