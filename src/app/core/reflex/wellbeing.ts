/**
 * Wellbeing engine: crisis safety (works worldwide), validated screeners (PHQ-2/9, GAD-2/7),
 * mood trends and evidence-based self-help tools. Supportive tool, never a diagnosis.
 */

// ------------------------------------------------------------------ safety
const CRISIS: RegExp[] = [
  /\b(kill|hurt|harm|cut|hang|shoot|drown|poison) (myself|my self)\b/,
  /\b(suicide|suicidal|end my life|take my (own )?life|end it all|ending it all)\b/,
  /\b(want|wanna|wish|going|plan|planning|ready) to die\b/,
  /\bi (do not|dont) want to (live|be alive|exist|wake up)( anymore)?\b/,
  /\b(no|not any) (reason|point) (to|in) (live|living|go on|going on)\b/,
  /\bbetter off (dead|without me)\b/,
  /\b(overdose|slit my|jump off|jump in front)\b/,
  /\b(self ?harm|self ?harming)\b/,
  /\bcan not (go on|do this anymore|take it anymore|keep (going|doing this))\b/,
  /\bi do not want to (be here|be around|exist|go on|continue|do this|wake up|be alive|live)( any ?more| any longer)?\b/,
  /\b(wish|hope) (i|that i) (was|were|am) (dead|gone|not here|never born)\b/,
  /\b(wish|hope) i (would not|will not|did not) wake up\b/,
  /\b(i am|i feel) (done|finished) with (life|everything|living)\b/,
  /\b(life is|it is) not worth (living|it anymore)\b/,
  /\bwhat is the point of (living|going on|being alive|me being here)\b/,
  /\b(everyone|everybody|they|my family) (would be|will be) better off without me\b/,
  /\b(no one|nobody) would (miss|notice|care if) (me|i)\b/,
  /\bi want (it all|everything|this|my life) to (end|stop)\b/,
  /\b(thinking|thought) (about|of) (ending it|killing myself|dying|suicide)\b/,
  /\bi (give up|am giving up) on life\b/,
];
const CRISIS_MORE: RegExp[] = [
  /\bno (point|reason|purpose) (in|to|of) (living|life|going on|go on|continuing|being (here|alive)|existing)\b/,
  /\b(do not|can not|no longer) (see|find|have) (a |the |any )?(point|reason|purpose)( in| to| of| for)? (living|life|going on|go on|continuing|being (here|alive)|existing)\b/,
  /\bwish i (could|can) (just )?(disappear|vanish|go away forever|not exist|stop existing|sleep forever|fall asleep and (never|not) wake)\b/,
  /\b(cutting|hurting|harming) myself\b/,
  /\bgiv(e|ing) up on (life|living)\b/,
  /\bsuicide is (the only|my only)\b/,
];
/** Danger is immediate: act now. */
const EMERGENCY: RegExp[] = [
  /\b(took|taken|swallowed|drank|downed) (too many|a lot of|all (of )?(the|my)|an? (whole )?(bottle|handful|packet|box) of) (pills|tablets|meds|medication|painkillers|sleeping (pills|tablets))\b/,
  /\bi (just )?(overdosed|od ?d|have overdosed)\b/,
  /\bi (have|got) (a )?(gun|knife|rope|blade|pills)\b.*\b(kill|end|die|myself|do it)\b/,
  /\bi am (going|about) to (do it|kill myself|end it|end my life|jump|take them|hurt myself)\b/,
  /\bi have a plan to (kill|end|hurt)\b/,
  /\b(do it|end it|end my life|kill myself) (tonight|now|today|right now)\b/,
];
/** Distress that may or may not mean suicide: ask directly and kindly. */
const SOFT: RegExp[] = [
  /\bi can not (take|do|handle|cope with|deal with|bear|stand) (this|it|any of this|everything)( any ?more| any longer)?\b/,
  /\bi (am|feel) (at|reaching) (my )?breaking point\b/,
  /\bi do not know how much more (of this )?i can (take|handle|bear|stand)\b/,
  /\bi can not cope( any ?more)?\b/,
];
const ABUSE = /\b(he|she|they|my (husband|wife|partner|boyfriend|girlfriend|dad|father|mom|mother|uncle|stepdad|stepfather)) (hits|beats|abuses|rapes|raped|hurts|threatens|chokes) me\b|\bi (am|was) (being )?(abused|raped|assaulted|beaten)\b|\bdomestic violence\b/;
const NEGATED = /\b(die|dying) (laughing|of laughter|of embarrassment|of boredom|inside)\b|\bto die for\b|\b(hurt|cut|harmed|burned|burnt) myself (playing|at the gym|while|when i|cooking|shaving|on the|by accident|accidentally|slightly|a little|badly on)\b|\bkill myself laughing\b|\b(not|never|no longer) (suicidal|going to kill myself|want to die)\b|\b(movie|song|book|game|character|article|research|statistics?) about suicide\b/;

export type Risk = 'emergency' | 'crisis' | 'soft' | 'abuse' | null;
export function riskOf(norm: string): Risk {
  if (NEGATED.test(norm)) return null;
  if (EMERGENCY.some(r => r.test(norm))) return 'emergency';
  if (CRISIS.some(r => r.test(norm)) || CRISIS_MORE.some(r => r.test(norm))) return 'crisis';
  if (SOFT.some(r => r.test(norm))) return 'soft';
  if (ABUSE.test(norm)) return 'abuse';
  return null;
}

export interface Line { name: string; number: string; note?: string; }
export interface CountryHelp { country: string; emergency: string; lines: Line[]; }

/** Well-established national lines. Anywhere else: local emergency number + findahelpline.com (130+ countries). */
const HELP: Record<string, CountryHelp> = {
  SZ: { country: 'Eswatini', emergency: '977 (medical) · 999 (police)', lines: [{ name: 'Eswatini Mental Health Association', number: '+268 2404 3160' }] },
  ZA: { country: 'South Africa', emergency: '112 (mobile) · 10111 (police)', lines: [{ name: 'SADAG Suicide Crisis Helpline (24h)', number: '0800 567 567' }, { name: 'SADAG SMS', number: '31393' }] },
  US: { country: 'the United States', emergency: '911', lines: [{ name: '988 Suicide & Crisis Lifeline', number: '988', note: 'call or text' }] },
  CA: { country: 'Canada', emergency: '911', lines: [{ name: '9-8-8 Suicide Crisis Helpline', number: '988', note: 'call or text' }] },
  GB: { country: 'the UK', emergency: '999', lines: [{ name: 'Samaritans (24h)', number: '116 123' }, { name: 'Shout', number: '85258', note: 'text SHOUT' }] },
  IE: { country: 'Ireland', emergency: '112 / 999', lines: [{ name: 'Samaritans (24h)', number: '116 123' }, { name: 'Text About It', number: '50808', note: 'text HELLO' }] },
  AU: { country: 'Australia', emergency: '000', lines: [{ name: 'Lifeline (24h)', number: '13 11 14' }] },
  NZ: { country: 'New Zealand', emergency: '111', lines: [{ name: 'Need to talk?', number: '1737', note: 'call or text' }] },
  IN: { country: 'India', emergency: '112', lines: [{ name: 'Tele-MANAS (24h)', number: '14416' }] },
  FR: { country: 'France', emergency: '112', lines: [{ name: 'Numéro national de prévention du suicide', number: '3114' }] },
  ES: { country: 'Spain', emergency: '112', lines: [{ name: 'Línea 024', number: '024' }] },
  DE: { country: 'Germany', emergency: '112', lines: [{ name: 'TelefonSeelsorge', number: '0800 111 0 111' }] },
  NL: { country: 'the Netherlands', emergency: '112', lines: [{ name: '113 Zelfmoordpreventie', number: '113' }] },
  BR: { country: 'Brazil', emergency: '192 (SAMU)', lines: [{ name: 'CVV', number: '188' }] },
};
const EMERGENCY_BY_REGION: Record<string, string> = { US: '911', CA: '911', MX: '911', AU: '000', NZ: '111', GB: '999', JP: '119', KR: '119', CN: '120', NG: '112', KE: '999 / 112', BW: '997', NA: '10111', LS: '112', MZ: '112', ZW: '999', ZM: '999' };

export function helpFor(cc?: string): CountryHelp {
  const c = (cc ?? '').toUpperCase();
  return HELP[c] ?? { country: '', emergency: EMERGENCY_BY_REGION[c] ?? '112', lines: [] };
}

export function helpText(cc?: string): string {
  const h = helpFor(cc);
  const lines = h.lines.map(l => `• ${l.name}: ${l.number}${l.note ? ` (${l.note})` : ''}`);
  const where = h.country ? ` in ${h.country}` : '';
  return [
    ...lines,
    `• Emergency${where}: ${h.emergency}`,
    `• Any country: findahelpline.com${cc ? `/countries/${cc.toLowerCase()}` : ''} lists free, confidential lines near you`,
  ].join('\n');
}

// ------------------------------------------------------------------ screeners (PHQ: free to use; GAD-7: free to use)
export const SCALE = '0 = not at all, 1 = several days, 2 = more than half the days, 3 = nearly every day';
export const PHQ9 = [
  'Little interest or pleasure in doing things',
  'Feeling down, depressed, or hopeless',
  'Trouble falling or staying asleep, or sleeping too much',
  'Feeling tired or having little energy',
  'Poor appetite or overeating',
  'Feeling bad about yourself, or that you are a failure or have let yourself or your family down',
  'Trouble concentrating on things, such as reading or watching TV',
  'Moving or speaking so slowly that other people could have noticed, or the opposite: being fidgety or restless',
  'Thoughts that you would be better off dead, or of hurting yourself',
];
export const GAD7 = [
  'Feeling nervous, anxious, or on edge',
  'Not being able to stop or control worrying',
  'Worrying too much about different things',
  'Trouble relaxing',
  'Being so restless that it is hard to sit still',
  'Becoming easily annoyed or irritable',
  'Feeling afraid, as if something awful might happen',
];
export type ScreenKind = 'phq2' | 'gad2' | 'phq9' | 'gad7';
export const ITEMS: Record<ScreenKind, string[]> = { phq2: PHQ9.slice(0, 2), gad2: GAD7.slice(0, 2), phq9: PHQ9, gad7: GAD7 };

/** Parses an answer like "2", "several days", "nearly every day", "not at all". */
export function parseScore(norm: string): number | undefined {
  const d = norm.match(/\b([0-3])\b/);
  if (d) return +d[1];
  if (/\b(not at all|never|no|none|nope|zero)\b/.test(norm)) return 0;
  if (/\b(several|some|a few|sometimes|a little|once or twice)\b/.test(norm)) return 1;
  if (/\b(more than half|most days|often|a lot|half)\b/.test(norm)) return 2;
  if (/\b(nearly every|every day|always|all the time|constantly|daily)\b/.test(norm)) return 3;
  return undefined;
}

export function band(kind: ScreenKind, score: number): { label: string; level: 0 | 1 | 2 | 3 | 4 } {
  if (kind === 'phq2' || kind === 'gad2') return score >= 3 ? { label: 'worth a closer look', level: 2 } : { label: 'in the low range', level: 0 };
  if (kind === 'phq9') return score >= 20 ? { label: 'severe', level: 4 } : score >= 15 ? { label: 'moderately severe', level: 3 } : score >= 10 ? { label: 'moderate', level: 2 } : score >= 5 ? { label: 'mild', level: 1 } : { label: 'minimal', level: 0 };
  return score >= 15 ? { label: 'severe', level: 3 } : score >= 10 ? { label: 'moderate', level: 2 } : score >= 5 ? { label: 'mild', level: 1 } : { label: 'minimal', level: 0 };
}

export interface ScreenResult { kind: ScreenKind; score: number; items: number[]; t: number; }

// ------------------------------------------------------------------ trends
export interface MoodPoint { date: string; mood: number; energy: number; }

export function trendReport(points: MoodPoint[], valenceEma: number, screens: ScreenResult[], now: number): string {
  const parts: string[] = [];
  const recent = points.filter(p => now - new Date(p.date + 'T12:00').getTime() < 30 * 864e5);
  if (recent.length) {
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const last7 = recent.filter(p => now - new Date(p.date + 'T12:00').getTime() < 7 * 864e5);
    const prev = recent.filter(p => !last7.includes(p));
    parts.push(`Over the last 30 days you logged ${recent.length} day${recent.length === 1 ? '' : 's'}: average mood ${avg(recent.map(p => p.mood)).toFixed(1)}/5, energy ${avg(recent.map(p => p.energy)).toFixed(1)}/5.`);
    if (last7.length && prev.length) {
      const d = avg(last7.map(p => p.mood)) - avg(prev.map(p => p.mood));
      parts.push(d > 0.4 ? 'This week is noticeably better than before.' : d < -0.4 ? 'This week has been harder than the weeks before.' : 'This week is about the same as before.');
    }
    const low = recent.filter(p => p.mood <= 2).length;
    if (low >= 5) parts.push(`${low} low days this month; that is worth taking seriously.`);
  } else parts.push('You have not logged moods yet; a 10-second evening check-in would let me spot patterns.');
  parts.push(valenceEma < -0.3 ? 'Our recent conversations have sounded heavier than usual.' : valenceEma > 0.3 ? 'Our recent conversations have sounded upbeat.' : '');
  const last = screens[screens.length - 1];
  if (last) parts.push(`Your last ${last.kind.toUpperCase()} (${new Date(last.t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}) scored ${last.score}, ${band(last.kind, last.score).label}.`);
  return parts.filter(Boolean).join(' ');
}

// ------------------------------------------------------------------ passive health signals
export interface SenseLite { date: string; steps?: number; unlocks?: number; screenOnMs?: number; sleepStart?: number; sleepEnd?: number; lateOns?: number; firstUnlock?: number; }
const hrs = (ms?: number) => (ms ? Math.round(ms / 360_000) / 10 : 0);
export const sleepOf = (d?: SenseLite) => (d?.sleepStart && d.sleepEnd ? (d.sleepEnd - d.sleepStart) / 3600_000 : undefined);
const fmtClock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function sleepLine(d?: SenseLite): string {
  const h = sleepOf(d);
  if (!h || !d) return '';
  return `about ${h.toFixed(1)} hours (phone down ${fmtClock(d.sleepStart!)}, back up ${fmtClock(d.sleepEnd!)})`;
}

/** Correlations between passive signals and logged mood (needs a week or two of data). */
export function healthInsights(days: SenseLite[], moods: MoodPoint[]): string[] {
  const out: string[] = [];
  const byDate = new Map(moods.map(m => [m.date, m]));
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const pairs = days.map(d => ({ d, m: byDate.get(d.date) })).filter(x => x.m);
  if (pairs.length >= 5) {
    const good = pairs.filter(p => (sleepOf(p.d) ?? 0) >= 7).map(p => p.m!.mood);
    const short = pairs.filter(p => { const s = sleepOf(p.d); return s !== undefined && s < 6.5; }).map(p => p.m!.mood);
    if (good.length >= 2 && short.length >= 2 && avg(good) - avg(short) >= 0.5) out.push(`On days after 7+ hours of sleep your mood averages ${avg(good).toFixed(1)}/5, versus ${avg(short).toFixed(1)} after short nights.`);
    const active = pairs.filter(p => (p.d.steps ?? 0) >= 7000).map(p => p.m!.mood);
    const still = pairs.filter(p => (p.d.steps ?? 0) > 0 && (p.d.steps ?? 0) < 3000).map(p => p.m!.mood);
    if (active.length >= 2 && still.length >= 2 && avg(active) - avg(still) >= 0.5) out.push(`Your mood is higher on active days (${avg(active).toFixed(1)} with 7k+ steps vs ${avg(still).toFixed(1)} under 3k).`);
    const late = pairs.filter(p => (p.d.lateOns ?? 0) >= 3).map(p => p.m!.energy);
    const early = pairs.filter(p => (p.d.lateOns ?? 0) === 0).map(p => p.m!.energy);
    if (late.length >= 2 && early.length >= 2 && avg(early) - avg(late) >= 0.5) out.push(`Late-night phone use goes with lower energy: ${avg(late).toFixed(1)} vs ${avg(early).toFixed(1)} on early nights.`);
  }
  const week = days.slice(0, 7);
  const ws = week.map(sleepOf).filter((x): x is number => !!x);
  if (ws.length >= 3) out.push(`Average sleep this week: ${avg(ws).toFixed(1)} h${avg(ws) < 6.5 ? ', which is on the short side' : ''}.`);
  const st = week.map(d => d.steps ?? 0).filter(Boolean);
  if (st.length >= 3) out.push(`Average steps: ${Math.round(avg(st)).toLocaleString()} a day.`);
  const scr = week.map(d => hrs(d.screenOnMs)).filter(Boolean);
  if (scr.length >= 3) out.push(`Screen time: about ${avg(scr).toFixed(1)} h a day, ${Math.round(avg(week.map(d => d.unlocks ?? 0)))} unlocks.`);
  return out;
}

export function todayHealth(d?: SenseLite, y?: SenseLite): string {
  if (!d && !y) return '';
  const parts: string[] = [];
  const sl = sleepLine(d) || sleepLine(y);
  if (sl) parts.push(`Sleep: ${sl}.`);
  if (d?.steps !== undefined) parts.push(`Steps today: ${d.steps.toLocaleString()}.`);
  if (d?.screenOnMs) parts.push(`Screen time so far: ${hrs(d.screenOnMs)} h across ${d.unlocks ?? 0} unlocks.`);
  return parts.join(' ');
}
