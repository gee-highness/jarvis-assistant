/**
 * Reflex: Jarvis's LLM-free brain. Understands (intent + entities + dialogue state), acts (tools),
 * remembers (rule-based fact learning) and talks (persona-aware generative grammar with millions of
 * distinct replies). Typical turn: 2–20 ms.
 */
import { ALIVE_RULES, InnerState, chooseSpice, freshInner, opinion } from './alive';
import { ACTIONS } from './banks/actions';
import { CHAT } from './banks/chat';
import { COMMON } from './banks/common';
import { EXTRA } from './banks/extra';
import { MIND } from './banks/mind';
import { WELL } from './banks/well';
import { PET, PET_MOODS } from './banks/pet';
import { NARR } from './banks/narr';
import { Narr, narrative, replyTone } from './narrate';
import { helpFor, ITEMS, SCALE, ScreenKind, ScreenResult, band, healthInsights, helpText, parseScore, riskOf, sleepLine, sleepOf, todayHealth, trendReport } from './wellbeing';
import { EpisodicMemory, Episode, LiveState, ago, span, windowOf } from './episodic';
import { Finding, Researcher, cleanQuery, isKnowledgeQuestion } from './research';
import { KNOWLEDGE, RIDDLES } from './banks/knowledge';
import { Entities, cleanTitle, extract, fmtDay, fmtTime, fmtWhen } from './entities';
import { LearnedFact, PROFILE_QS, cleanAnswer, learnFacts, recallQuery, secondPerson } from './facts';
import { Grammar, GrammarCtx } from './grammar';
import { BANDS, IntentModel, Ranked } from './nlu';
import { EmotionRead, Normalized, ORDINALS, bestFuzzy, capFirst, contentWords, fuzzy, hash, normalize, readEmotion, rng, stem } from './text';
import { Bank, DialogueState, HostState, IntentSpec, Out, Pending, ReflexHost, ReflexReply, TaskLite, ToolTrace } from './types';
import { calculate, convertUnits } from '../tools/helpers';
import { addDays, ymd } from '../util';

interface H { n: Normalized; text: string; raw: string; ent: Entities; emo: EmotionRead; ranked: Ranked[]; intent: string; }
type Handler = (h: H) => Promise<Out>;

const LABEL: Record<string, string> = {
  'task.add': 'add it as a task', 'task.list': 'show your tasks', 'task.done': 'mark a task done', 'task.move': 'reschedule a task', 'reminder.add': 'set a reminder',
  'alarm.set': 'set an alarm', 'timer.set': 'start a timer', 'note.create': 'save it as a note', 'journal.add': 'add it to your journal', 'memory.remember': 'remember it',
  'memory.recall': 'look it up in my memory', 'focus.start': 'start a focus session', 'habit.log': 'log a habit', 'habit.add': 'create a habit', 'goal.add': 'set a goal',
  'plan.briefing': 'give you a briefing', 'info.web': 'search the web', 'info.calc': 'calculate it', 'calendar.add': 'add a calendar event', 'phone.open': 'open an app',
  'mood.log': 'log your mood', 'progress.stats': 'show your progress', 'fun.joke': 'tell a joke', 'chat.capabilities': 'explain what I can do', 'advice.general': 'give advice',
};
const CONTENT = new Set(['fun.joke', 'fun.fact', 'fun.quote', 'fun.story', 'fun.poem', 'fun.wyr', 'fun.roast', 'fun.complimentme', 'fun.8ball', 'fun.dice', 'fun.coin', 'advice.sleep', 'advice.productivity', 'advice.fitness', 'advice.money', 'advice.study', 'advice.confidence', 'advice.relationship', 'advice.general', 'fun.meaning', 'fun.surprise']);
const EMOJI: Record<string, string[]> = {
  tasks: ['✅', '📝', '📌'], focus: ['🎯', '⏱️', '🧠'], habits: ['🔥', '💪', '📈'], reminders: ['⏰', '🔔'], alarms: ['⏰'], timers: ['⏳'], joke: ['😄', '😂', '🙃'],
  feelings: ['💙', '🤗', '🫶'], wins: ['🎉', '🏆', '🥳'], sleep: ['🌙', '😴'], greeting: ['👋', '😊'], fact: ['🤓', '💡'], goals: ['🚀', '🎯'], fun: ['🎲', '✨'],
  memory: ['🧠', '🗂️'], jarvis: ['🤖', '🎩'], food: ['🍽️', '🍕'], fitness: ['🏋️', '🏃'], money: ['💰'], story: ['📖'], poem: ['🖋️'], planning: ['🗓️'], progress: ['📊'],
};
const HOLIDAYS: Record<string, string> = {
  christmas: '12-25', 'christmas eve': '12-24', 'new year': '01-01', 'new years': '01-01', valentine: '02-14', halloween: '10-31', 'human rights day': '03-21',
  'freedom day': '04-27', 'workers day': '05-01', 'youth day': '06-16', 'womens day': '08-09', 'heritage day': '09-24', 'reconciliation day': '12-16', 'boxing day': '12-26',
};

export interface ReflexStats { intents: number; examples: number; learned: number; symbols: number; responses: number; personaResponses: number; semantic: boolean; }

export class ReflexEngine {
  readonly grammar = new Grammar();
  private model!: IntentModel;
  private intents: IntentSpec[] = [];
  private learned: { intent: string; text: string }[] = [];
  private ds: DialogueState = { turn: 0, recentIntents: [] };
  inner!: InnerState;
  private handlers: Record<string, Handler> = {};
  private ready: Promise<void> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private lastUser = '';
  /** The last real request (not small talk, not feedback): what "teach" and complaints refer to. */
  private lastActionable?: { text: string; raw: string; intent: string };
  private lastResearch?: { q: string; source: string; url?: string; t: number; cached?: boolean };
  private recentOutputs: string[] = [];
  private riddleIdx: number[] = [];
  readonly episodic = new EpisodicMemory();
  private researcher!: Researcher;
  private lookupBusy = false;

  constructor(private host: ReflexHost, extraBanks: Bank[] = []) {
    for (const b of [CHAT, ACTIONS, EXTRA, MIND, WELL, ...extraBanks]) { this.intents.push(...b.intents); this.grammar.add(b.rules); }
    this.grammar.add(NARR);
    this.grammar.add(COMMON);
    this.grammar.add(KNOWLEDGE);
    this.grammar.add(ALIVE_RULES);
    this.grammar.add(PET);
    this.registerHandlers();
  }

  init(): Promise<void> {
    this.ready ??= (async () => {
      this.inner = { ...freshInner(Date.now()), ...((await this.host.kvGet<InnerState>('inner')) ?? {}) };
      this.learned = (await this.host.kvGet<{ intent: string; text: string }[]>('learned')) ?? [];
      this.model = new IntentModel(this.intents, this.learned);
      this.episodic.load(await this.host.kvGet<Episode[]>('episodes'), await this.host.kvGet<LiveState[]>('states'));
      this.researcher = new Researcher(u => this.host.http ? this.host.http(u) : Promise.reject(new Error('offline')), c => this.host.kvSet('answers', c).catch(() => undefined));
      this.researcher.load(await this.host.kvGet('answers'));
      if (this.host.profile().userName && !this.inner.known.includes('name')) this.inner.known.push('name');
    })();
    return this.ready;
  }

  /** Optional semantic layer: embeds exemplars once, caches vectors by embedding model. */
  async enableSemantic(): Promise<boolean> {
    await this.init();
    if (!this.host.embed || !this.host.embedKey?.()) return false;
    const key = this.host.embedKey();
    const cached = await this.host.kvGet<{ key: string; vecs: Record<string, number[]> }>('emb');
    const map = new Map<string, number[]>(cached?.key === key ? Object.entries(cached.vecs) : []);
    const before = map.size;
    const ok = await this.model.enableSemantic(t => this.host.embed!(t), map);
    if (ok && map.size !== before) await this.host.kvSet('emb', { key, vecs: Object.fromEntries(map) });
    return ok;
  }

  /** Adds a bank at runtime (e.g. the generated expansion pack in assets). */
  async addBank(b: Bank): Promise<void> {
    await this.init();
    this.intents.push(...b.intents);
    this.grammar.add(b.rules);
    this.model = new IntentModel(this.intents, this.learned);
  }

  stats(): ReflexStats {
    const c = this.ctx({});
    return {
      intents: this.intents.length, examples: this.model?.size ?? 0, learned: this.learned.length, symbols: this.grammar.symbols().length,
      responses: Math.round(this.grammar.totalFor(['r.', 'spice.'])), personaResponses: Math.round(this.grammar.totalFor(['r.', 'spice.'], c)),
      semantic: !!this.model?.semanticReady,
    };
  }

  // ================================================================== main entry
  async respond(raw: string): Promise<ReflexReply> {
    await this.init();
    const t0 = Date.now();
    const n = normalize(raw);
    const text = n.text;
    const now = this.host.now();
    const tools: ToolTrace[] = [];
    this.tools = tools;
    this.ds.turn++;
    this.touchInner(now);
    const emo = readEmotion(text);
    if (emo.emotion !== 'neutral') this.inner.userMood = this.inner.userMood * 0.75 + emo.valence * 0.25;
    this.inner.mood = Math.max(-1, Math.min(1, this.inner.mood * 0.9 + emo.valence * 0.1 + 0.03));
    const ent = extract(text, now);
    const repeat = text.split(' ').length >= 3 ? this.episodic.repeatOf(raw, 30 * 60_000, now.getTime()) : undefined;
    this.episodic.noteState(text, now.getTime());
    this.episodic.add({ t: now.getTime(), who: 'user', text: raw });
    let out: Out | null = null;
    let intent = 'none';
    let conf = 0;
    let ranked: Ranked[] = [];

    if (!text) { out = { sym: 'r.chat.ack' }; intent = 'chat.ack'; conf = 1; }

    // 0) safety first: crisis language overrides everything, in every country
    const risk = text ? riskOf(text) : null;
    if (risk) {
      this.ds.pending = undefined;
      out = { sym: ({ abuse: 'r.well.abuse', crisis: 'r.well.crisis', emergency: 'r.well.emergency', soft: 'r.well.soft' } as const)[risk], vars: { help: helpText(this.host.country?.()), emergency: helpFor(this.host.country?.()).emergency }, quiet: true, topic: 'feelings', pending: { kind: 'safety', data: { soft: risk === 'soft' } } };
      intent = risk === 'abuse' ? 'well.abuse' : 'well.crisis'; conf = 1;
      this.inner.lastCrisis = now.getTime();
    }

    // 1) answer to a question Jarvis asked
    const pend = this.ds.pending;
    this.ds.pending = undefined;
    if (!out && pend && this.ds.turn - pend.turn <= 3) {
      ranked = await this.rankText(text);
      const top0 = ranked[0];
      const answerish = /^(chat\.(yes|no|ack))$/.test(top0?.id ?? '');
      const strongNew = !!top0 && top0.pattern && top0.score >= 0.6 && !answerish;
      const factsNow = pend.kind === 'profile' && learnFacts(text, raw, now).length > 0;
      const riddleHit = pend.kind === 'riddle' && RIDDLES[Number(pend.data?.['i'] ?? 0)].accept.test(text);
      const topKind = top0 ? this.model.spec(top0.id)?.kind : undefined;
      const keep = pend.kind === 'teach' ? !(strongNew && (topKind === 'chat' || topKind === 'meta')) : pend.kind === 'slot' ? !strongNew : pend.kind === 'riddle' ? riddleHit || !strongNew : pend.kind === 'profile' ? !strongNew && !factsNow && !(top0 && top0.score >= 0.45 && !answerish) : !strongNew;
      if (keep) {
        const r = await this.answerPending(pend, { n, text, raw, ent, emo, ranked, intent: pend.intent ?? '' });
        if (r) { out = r.out; intent = r.intent; conf = 1; }
      }
    }

    // 2) several commands in one breath
    if (!out) {
      const parts = this.split(text, raw);
      if (parts.length > 1) {
        const texts: string[] = [];
        const ranks = await Promise.all(parts.map(p => this.model.rank(p.n)));
        const ok = ranks.every(pr => pr[0] && pr[0].score >= BANDS.mid && this.handlers[pr[0].id]);
        for (let i = 0; ok && i < parts.length; i++) {
          const pr = ranks[i], p = parts[i];
          // "open YouTube and play X" is one action, not two
          if (pr[0].id === 'phone.open' && ranks[i + 1]?.[0].id === 'phone.play') continue;
          const o = await this.handlers[pr[0].id]({ n: normalize(p.raw), text: p.n, raw: p.raw, ent: extract(p.n, now), emo, ranked: pr, intent: pr[0].id });
          texts.push(this.render(o));
          intent = pr[0].id;
        }
        if (texts.length) { out = { text: texts.join('\n'), quiet: true }; conf = 0.9; }
      }
    }

    // 3) classify
    if (!out) {
      if (!ranked.length) ranked = await this.rankText(text);
      let top = ranked[0] ?? { id: 'none', score: 0, lex: 0, sem: 0, pattern: false };
      // follow-ups: "and tomorrow?", "what about overdue ones", "move it to friday"
      const follow = /^(and|what about|how about|also|same for|ok and|then)\b/.test(text) && this.ds.lastIntent && !top.pattern;
      if (follow && this.handlers[this.ds.lastIntent!]) top = { ...top, id: this.ds.lastIntent!, score: Math.max(top.score, BANDS.high) };
      // habit hook: "gym done", "go for a run done" → log the matching habit
      const habits = this.host.state().habits;
      let habitHit = false;
      if (habits.length && /\b(done|did|finished|completed|log|logged|tick|ticked|went)\b/.test(text) && top.score < 0.75) {
        const hit = habits.find(hb => contentWords(hb.toLowerCase()).map(stem).some(w => w.length > 2 && text.split(' ').map(stem).includes(w)));
        if (hit) { top = { ...top, id: 'habit.log', score: 0.8 }; habitHit = true; }
      }
      // someone is simply telling me something: answer the story, not a keyword inside it
      let nar = !habitHit && !/\?$/.test(raw.trim()) && (top.id === 'habit.log' || !(top.pattern && top.score >= 0.6 && ['action', 'info'].includes(this.model.spec(top.id)?.kind ?? ''))) && (top.score < 0.85 || top.id === 'habit.log' || this.model.spec(top.id)?.kind === 'chat') ? narrative(text) : null;
      if (nar?.kind === 'win' && top.id === 'feel.win') nar = null;
      // a short first-person message with a clear feeling and no stronger match: hear the feeling
      const EMO_INTENT: Partial<Record<string, string>> = { sad: 'feel.sad', lonely: 'feel.lonely', anxious: 'feel.stress', angry: 'feel.angry', tired: 'feel.tired', bored: 'feel.bored', happy: 'feel.happy', excited: 'feel.happy', grateful: 'feel.happy', sick: 'feel.sick', proud: 'feel.win' };
      const emoTarget = EMO_INTENT[emo.emotion];
      if (!nar && emoTarget && top.score < 0.5 && text.split(' ').length <= 9 && /\b(i|my|me|feeling|feel)\b/.test(text) && (this.model.spec(top.id)?.kind !== 'action' || top.score < 0.3) && !/\?$/.test(raw.trim())) top = { id: emoTarget, score: 0.55, lex: 0, sem: 0, pattern: false };
      const facts = learnFacts(text, raw, now);
      const factFirst = facts.length && (top.score < 0.62 || /^(chat|feel)\./.test(top.id) || top.id === 'persona.name' && !/call me|name is/.test(text));
      if (nar) {
        if (facts.length) this.storeFacts(facts).catch(() => undefined);
        out = this.narrate(nar); intent = 'chat.narrate'; conf = 0.7;
      } else if (factFirst && top.id !== 'memory.remember' && top.id !== 'task.add') {
        out = await this.onFacts(facts, raw);
        intent = 'learn.fact'; conf = 0.8;
      } else if (top.score >= BANDS.mid || (top.pattern && top.score >= 0.3)) {
        intent = top.id; conf = top.score;
        if (facts.length) this.storeFacts(facts).catch(() => undefined);
        out = await this.run({ n, text, raw, ent, emo, ranked, intent });
      } else {
        if (facts.length) { out = await this.onFacts(facts, raw); intent = 'learn.fact'; conf = 0.7; }
        else { out = await this.fallback({ n, text, raw, ent, emo, ranked, intent: 'fallback' }); intent = out.intent ?? 'fallback'; conf = top.score; }
      }
    }

    // 4) compose + spice
    let reply = this.render(out!);
    const spec = this.model.spec(intent);
    if (!out!.quiet && !out!.pending && reply && !/^(chat\.(no|laugh|sorry|insult|alive|love|thanks|bye)|fun\.|feel\.|well\.|advice\.|learn\.)/.test(intent)) {
      const sp = chooseSpice({
        inner: this.inner, state: this.host.state(), traits: this.host.profile().traits, now, intentKind: spec?.kind ?? 'chat', quiet: !!out!.quiet,
        intent, emotionNegative: emo.valence < -0.2, missingProfile: this.inner.turns >= 6 && this.inner.turns - (this.inner.lastAskTurn ?? -99) >= 12 ? this.missingProfile() : [],
      });
      if (sp) {
        this.inner.lastSpiceTurn = this.inner.turns;
        this.inner.lastSpiceKind = String(sp.vars?.['_kind'] ?? '');
        if (sp.ask && /\?\s*$/.test(reply)) { /* already asking something */ } else if (sp.ask) {
          this.inner.lastAskTurn = this.inner.turns;
          const q = PROFILE_QS.find(p => p.key === sp.ask)!;
          this.inner.asked.push(q.key);
          reply += ' ' + q.q[Math.floor(Math.random() * q.q.length)];
          this.ds.pending = { kind: 'profile', key: q.key, turn: this.ds.turn };
        } else if (sp.sym) {
          const extra = this.grammar.expand(`#${sp.sym}#`, this.ctx(sp.vars ?? {}));
          if (extra) reply += (reply.length > 120 ? '\n\n' : ' ') + extra;
          const v = sp.vars ?? {};
          if (v['_followup']) (v['_followup'] as { asked?: boolean }).asked = true;
          if (v['_milestone']) this.inner.saidMilestones.push(v['_milestone'] as number);
          if (v['_days']) this.inner.saidMilestones.push(-(v['_days'] as number));
          if (v['_birthday']) this.inner.lastBirthdayYear = now.getFullYear();
        }
      }
    }
    if (out!.pending) this.ds.pending = { ...out!.pending, turn: this.ds.turn };
    // human memory: follow up on things the user was doing, and on questions answered since
    if (!out!.quiet && !out!.pending && reply && (spec?.kind === 'chat' || intent === 'fallback')) {
      const st = this.episodic.dueState(now.getTime());
      const told = (this.inner.lookedUp ?? []).find(l => !l.told);
      if (told) {
        told.told = true;
        reply += '\n\n' + this.say('spice.lookedup', { ago: ago(told.t, now.getTime()), q: told.q, answer: told.answer, source: told.source });
      } else if (st && emo.valence > -0.5) {
        st.asked = true;
        const a = ago(st.t, now.getTime());
        reply += ' ' + this.say(st.kind === 'feeling' ? 'spice.state.feeling' : 'spice.state.activity', { what: st.what, ago: capFirst(a), agoLower: a });
      }
    }
    if (repeat && (spec?.kind === 'info' || intent === 'fallback') && !/^mind\./.test(intent)) reply = `${this.say('mind.repeat', { ago: ago(repeat.t, now.getTime()) })} ${reply}`;
    reply = this.style(reply, spec?.topic ?? out!.topic);
    const lastUserEp = [...this.episodic.episodes].reverse().find(e => e.who === 'user');
    if (lastUserEp) { lastUserEp.intent = intent; lastUserEp.topic = spec?.topic ?? out!.topic; }
    this.episodic.add({ t: Date.now(), who: 'jarvis', text: reply, intent, topic: spec?.topic ?? out!.topic, extraKeys: lastUserEp?.k });
    this.lookupLater();

    // 5) bookkeeping
    if (intent !== 'chat.repeat' && intent !== 'meta.stop') this.ds.lastBot = reply;
    if (out!.content) this.ds.lastContentSym = out!.content;
    else if (CONTENT.has(intent)) this.ds.lastContentSym = spec?.reply ?? `r.${intent}`;
    if (spec && spec.kind !== 'meta' && intent !== 'fallback') { this.ds.lastIntent = intent; this.ds.lastEnt = ent; }
    if (out!.taskRef) this.ds.lastTaskRef = out!.taskRef;
    if (spec?.topic) this.inner.topics[spec.topic] = (this.inner.topics[spec.topic] ?? 0) + 1;
    this.ds.recentIntents = [...this.ds.recentIntents.slice(-9), intent];
    this.ds.emotion = emo;
    this.lastUser = text;
    if (text && spec && intent !== 'fallback' && !/^(meta\.|chat\.(yes|no|ack|laugh|insult|thanks|sorry|test|repeat))/.test(intent) || (intent === 'fallback' && text)) this.lastActionable = { text, raw, intent };
    this.persist();
    return { text: reply, intent, confidence: conf, tools, deferred: intent === 'fallback' && conf < BANDS.mid, ms: Date.now() - t0 };
  }

  // ================================================================== LLM-free replacements for page features
  /** Natural-language capture → task drafts ("call sam tomorrow, buy milk and book flights by friday"). */
  capture(text: string): { title: string; due?: string; urgent: boolean }[] {
    const now = this.host.now();
    return text.split(/\n|;|,(?![^(]*\))|\s+and then\s+|\s+also\s+/i).map(s => s.trim()).filter(s => s.length > 1).slice(0, 10).map(part => {
      const n = normalize(part).text;
      const e = extract(n, now);
      return { title: restoreCase(cleanTitle(e.rest), part) || capFirst(part), due: e.date, urgent: /\b(urgent|asap)\b/.test(n) };
    });
  }

  /** Daily/weekly review feedback composed from the user's own answers + live state. */
  review(kind: 'daily' | 'weekly', r: { wins: string; blockers: string; energy: number }): string {
    const top = this.pickTop(this.host.state().tasks, 3).map((t, i) => `${i + 1}. ${t.title}`).join('\n');
    const vars = { wins: r.wins.trim().replace(/[.!]+$/, ''), blockers: r.blockers.trim().replace(/[.!]+$/, ''), energy: r.energy, kind, hasWins: !!r.wins.trim(), hasBlockers: !!r.blockers.trim() };
    const body = this.say('review.body', vars);
    return `${body}\n\n${this.say(kind === 'daily' ? 'review.next.daily' : 'review.next.weekly')}\n${top || '1. Plan tomorrow\'s top three'}`;
  }

  /** Journal reflection from mood/energy history (no model). */
  reflectJournal(entries: { date: string; mood: number; energy: number; text: string; gratitude?: string }[]): string {
    if (!entries.length) return this.say('journal.reflect.empty');
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const moods = entries.map(e => e.mood), energies = entries.map(e => e.energy);
    const half = Math.max(1, Math.floor(entries.length / 2));
    const trend = avg(moods.slice(-half)) - avg(moods.slice(0, half));
    const best = [...entries].sort((a, b) => b.mood - a.mood)[0];
    const words = new Map<string, number>();
    for (const e of entries) for (const w of contentWords(normalize(e.text).text)) if (w.length > 4) words.set(w, (words.get(w) ?? 0) + 1);
    const theme = [...words.entries()].sort((a, b) => b[1] - a[1]).filter(([, c]) => c > 1).slice(0, 2).map(([w]) => w);
    const grat = entries.filter(e => e.gratitude).length;
    return this.say('journal.reflect', {
      n: entries.length, mood: avg(moods).toFixed(1), energy: avg(energies).toFixed(1), trend: trend > 0.4 ? 'up' : trend < -0.4 ? 'down' : 'flat',
      bestDay: new Date(best.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }), theme: theme.join(' and '), grat,
      lowEnergy: avg(energies) < 2.8 ? 1 : 0,
    });
  }

  /** Library answer: best sentences from the top passages, cited. */
  answerFrom(q: string, hits: { doc: string; text: string }[]): string {
    if (!hits.length) return this.say('r.info.library.none');
    return hits.slice(0, 2).map((h, i) => `${bestSentence(h.text, q)} [${i + 1}]`).join('\n\n');
  }

  /** Personality page preview: an in-character reply that never touches tools or memory. */
  async preview(q: string): Promise<string> {
    await this.init();
    const n = normalize(q);
    const r = await this.rankText(n.text);
    const top = r[0];
    const spec = top && this.model.spec(top.id);
    if (spec && spec.kind === 'chat' && top.score >= BANDS.mid && this.grammar.has(spec.reply ?? `r.${spec.id}`)) {
      const vars = spec.id === 'chat.favourite' ? opinion(this.inner.seed, n.text) : {};
      return this.style(this.grammar.expand(`#${spec.reply ?? `r.${spec.id}`}#`, this.ctx(vars)), spec.topic);
    }
    return this.style(this.say('r.chat.greet'), 'greeting');
  }

  /** Stable opinion about any topic: same answer every time for this install. */
  private likes(x: string) {
    const t = x.replace(/^(the|a|an|my|your) /, '').trim();
    return { x: t, pos: hash(`${this.inner.seed}:${t}`) % 3 !== 0 ? 1 : 0 };
  }

  /** Pet speech for the widget and pet page. */
  petLine(vars: Record<string, unknown>): { line: string; status: string; reactions: string[] } {
    const c = this.ctx({ ...vars, moodLabel: PET_MOODS[String(vars['mood'])] ?? String(vars['mood']) });
    const reactions: string[] = [];
    for (let i = 0; i < 6; i++) reactions.push(this.grammar.expand('#pet.react#', c));
    return { line: this.grammar.expand('#pet.line#', c), status: this.grammar.expand('#pet.status#', c), reactions: [...new Set(reactions)] };
  }

  /** Learned phrases (for the Brain page). */
  learnedPhrases() { return [...this.learned]; }
  async forgetLearned() { this.learned = []; await this.host.kvSet('learned', []); this.model = new IntentModel(this.intents, []); }

  // ================================================================== rendering
  private tools: ToolTrace[] = [];

  /** Grammar context: persona traits, time-of-day flags and live state variables. */
  ctx(extra: Record<string, unknown>): GrammarCtx {
    const p = this.host.profile();
    const s = this.host.state();
    const now = this.host.now();
    const hr = now.getHours();
    const flags = new Set<string>();
    flags.add(hr < 5 ? 'latenight' : hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : hr < 21 ? 'evening' : 'night');
    if ([0, 6].includes(now.getDay())) flags.add('weekend'); else flags.add('weekday');
    if (p.emoji !== 'none') flags.add('emoji');
    if (p.swearing !== 'none') flags.add('swear');
    flags.add(`lang:${p.language}`);
    flags.add(`role:${p.role}`);
    if ((p.traits['formality'] ?? 50) < 35) flags.add('casual');
    const casualName = p.userName && ['bestfriend', 'sibling', 'partner', 'companion'].includes(p.role);
    const h = casualName && Math.random() < 0.5 ? p.userName : p.honorific;
    const away = this.inner ? now.getTime() - (this.inner.lastSeenPrev ?? this.inner.lastSeen) : 0;
    const known = this.inner ? Math.floor((now.getTime() - this.inner.firstSeen) / 864e5) : 0;
    const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
    const vars: Record<string, unknown> = {
      h, uname: p.userName, me: p.name || 'Jarvis',
      time: fmtTime(now), date: now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), weekday: now.toLocaleDateString(undefined, { weekday: 'long' }),
      open: s.open, overdue: s.overdue, dueToday: s.dueToday, doneToday: s.doneToday, doneCount: s.doneToday,
      mits: s.mits.length, mit1: s.mits[0], mitList: list(s.mits), overdue1: s.overdueTitles[0], overdueVerb: s.overdue === 1 ? 'is' : 'are',
      habitsLeft: list(s.habitsLeft.slice(0, 3)), streak: s.streak >= 2 ? s.streak : 0, focusRunning: s.focusRunning,
      nextReminder: s.nextReminder ? `${s.nextReminder.title} at ${fmtTime(new Date(s.nextReminder.at))}` : '',
      knownDays: known, returning: away > 36 * 3600_000, away: away > 864e5 * 2 ? `${Math.round(away / 864e5)} days` : away > 3600_000 * 30 ? 'over a day' : '',
      lastBot: this.ds.lastBot ?? 'I had not said anything yet.', overdueOrOpen: s.overdue || s.open,
      ...extra,
    };
    let seed = hash(`${this.ds.turn}:${this.inner?.turns ?? 0}:${Date.now()}`);
    const r = rng(seed++);
    return { traits: p.traits, flags, vars, rand: r };
  }

  private render(o: Out): string {
    const c = this.ctx(o.vars ?? {});
    let txt = o.sym ? this.grammar.expand(`#${o.sym}#`, c) : '';
    for (let i = 0; i < 3 && o.sym && this.recentOutputs.includes(txt); i++) txt = this.grammar.expand(`#${o.sym}#`, this.ctx(o.vars ?? {}));
    if (o.text) txt = txt ? `${txt} ${o.text}` : o.text;
    this.recentOutputs = [...this.recentOutputs.slice(-40), txt];
    return txt.trim();
  }

  say(sym: string, vars: Record<string, unknown> = {}): string { return this.grammar.expand(`#${sym}#`, this.ctx(vars)); }

  private style(text: string, topic?: string): string {
    const p = this.host.profile();
    let t = text.replace(/\b(sir|ma'am|madam|boss)(, \1)+\b/gi, '$1').replace(/\s+([,.!?])/g, '$1');
    if (p.language === 'pirate') t = t.replace(/\byou\b/g, 'ye').replace(/\byour\b/g, 'yer').replace(/\bmy\b/g, 'me').replace(/\bis\b/g, 'be').replace(/\bHello\b/g, 'Ahoy');
    if (p.language === 'shakespeare') t = t.replace(/\byou are\b/gi, 'thou art').replace(/\byour\b/g, 'thy').replace(/\byou\b/g, 'thee');
    if (p.catchphrases.trim() && Math.random() < 0.07) {
      const cps = p.catchphrases.split(/[.!?;\n]+/).map(s => s.trim()).filter(Boolean);
      if (cps.length) t += ' ' + cps[Math.floor(Math.random() * cps.length)] + '.';
    }
    if (p.swearing === 'free' && Math.random() < 0.05 && /^(Done|Sorted|On it)/.test(t)) t = t.replace(/^(Done|Sorted|On it)/, '$1, damn right');
    // pet mode: the pup does the talking
    if (p.pet?.speaks && !/^(I’m really glad you told me|Thank you for telling me|I’m so sorry that is happening)/.test(t)) {
      const c = this.ctx({ p: p.pet.personality });
      const act = this.grammar.expand('#pet.act#', c);
      const bark = Math.random() < 0.35 ? ' ' + this.grammar.expand('#pet.bark#', c) : '';
      t = `${act} ${t}${bark}`.trim();
    }
    if (p.emoji !== 'none' && topic && EMOJI[topic] && !/\p{Extended_Pictographic}/u.test(t) && Math.random() < (p.emoji === 'lots' ? 0.75 : 0.3)) {
      const e = EMOJI[topic];
      t += ' ' + e[Math.floor(Math.random() * e.length)];
    }
    return t;
  }

  // ================================================================== dialogue
  private async run(h: H): Promise<Out> {
    const fn = this.handlers[h.intent];
    if (fn) {
      let t = h.text;
      for (let i = 0; i < 3; i++) t = t.replace(/^(ok|okay|hey|hi|yo|so|um+|please|jarvis|can you|could you|would you|will you|i want you to|i need you to|go ahead and|kindly|quickly)[ ,]+/, '');
      return fn({ ...h, text: t || h.text });
    }
    const spec = this.model.spec(h.intent);
    return { sym: spec?.reply ?? `r.${h.intent}`, topic: spec?.topic };
  }

  /** Ranks the utterance and its de-politified form ("can you add X" → "add X"); keeps the best score per intent. */
  private async rankText(text: string, opts: { context?: string; embed?: boolean } = {}): Promise<Ranked[]> {
    const a = await this.model.rank(text, opts);
    const stripped = text.replace(/^(?:(?:ok|okay|hey|hi|yo|so|um+|uh+|please|jarvis|can you|could you|would you|will you|i want you to|i need you to|go ahead and|kindly|quickly|just)[ ,]+)+/, '').trim();
    if (!stripped || stripped === text) return a;
    const b = await this.model.rank(stripped, opts);
    const best = new Map<string, Ranked>();
    for (const r of [...a, ...b]) { const o = best.get(r.id); if (!o || r.score > o.score) best.set(r.id, { ...r, pattern: r.pattern || !!o?.pattern }); }
    return [...best.values()].sort((x, y) => y.score - x.score);
  }

  private async answerPending(p: Pending, h: H): Promise<{ out: Out; intent: string } | null> {
    const yes = /^(yes|sure|ok|okay|yes please|please|do it|go ahead|definitely|absolutely|of course|correct|right|yup|affirmative|please do|go for it|why not)\b/.test(h.text);
    const no = /^(no|nope|nah|cancel|never ?mind|stop|do not|not now|leave it|forget it|skip)\b/.test(h.text);
    switch (p.kind) {
      case 'slot': {
        if (no) return { out: { sym: 'r.chat.no', quiet: true }, intent: 'chat.no' };
        const e2 = extract(h.text, this.host.now());
        if (p.slot === 'when' && !e2.at && !e2.date) return null;
        if (p.slot === 'dur' && !e2.minutes && !e2.seconds && e2.number === undefined) return null;
        if (p.slot === 'mood' && e2.number === undefined && h.emo.emotion === 'neutral') return null;
        const utter = `${p.utter ?? ''} ${p.slot === 'when' ? h.text : p.slot === 'what' || p.slot === 'title' ? `to ${h.text}` : h.text}`.trim();
        const raw = `${p.raw ?? ''} ${p.slot === 'what' ? 'to ' : ''}${h.raw}`.trim();
        const fn = this.handlers[p.intent!];
        if (!fn) return null;
        const merged: H = { ...h, text: utter, raw, ent: extract(utter, this.host.now()), intent: p.intent! };
        return { out: await fn(merged), intent: p.intent! };
      }
      case 'confirm':
      case 'web': {
        if (yes && p.kind === 'web') return { out: await this.handlers['info.web']({ ...h, text: p.utter ?? h.text, raw: p.raw ?? h.raw, intent: 'info.web' }), intent: 'info.web' };
        if (yes && p.intent && this.handlers[p.intent]) return { out: await this.handlers[p.intent]({ ...h, text: p.utter ?? h.text, raw: p.raw ?? h.raw, ent: extract(p.utter ?? h.text, this.host.now()), intent: p.intent }), intent: p.intent };
        if (no) return { out: { sym: 'r.chat.no', quiet: true }, intent: 'chat.no' };
        return null;
      }
      case 'choice': {
        const opts = p.options ?? [];
        let idx = -1;
        for (const w of h.text.split(' ')) if (w in ORDINALS) { idx = ORDINALS[w]; break; }
        if (idx < 0) {
          const labels = opts.map(o => LABEL[o] ?? o);
          const best = bestFuzzy(h.text, labels.map((l, i) => ({ l, i })), x => x.l, 0.45);
          if (best) idx = best.i;
        }
        if (idx === -1 && no) return { out: { sym: 'r.chat.no', quiet: true }, intent: 'chat.no' };
        if (idx === -1 && yes && opts.length) idx = 0;
        const chosen = opts[idx < 0 ? opts.length + idx : idx];
        if (!chosen) return null;
        this.learn(chosen, p.utter!);
        const out = await this.run({ ...h, text: p.utter!, raw: p.raw ?? p.utter!, ent: extract(p.utter!, this.host.now()), intent: chosen });
        return { out: { ...out, text: [out.text, this.say('learn.ok')].filter(Boolean).join(' ') }, intent: chosen };
      }
      case 'teach': {
        if (no) return { out: { sym: 'r.chat.no', quiet: true }, intent: 'chat.no' };
        const r = await this.rankText(h.text);
        const target = r.find(x => this.model.spec(x.id)?.kind !== 'meta');
        if (!target || target.score < 0.45 || !p.utter || !['action', 'info'].includes(this.model.spec(target.id)?.kind ?? '')) return null;
        this.learn(target.id, p.utter);
        const res = await this.run({ ...h, text: p.utter, raw: p.raw ?? p.utter, ent: extract(p.utter, this.host.now()), intent: target.id });
        return { out: { ...res, text: [res.text, this.say('r.meta.learned', { utter: p.utter, meaning: LABEL[target.id] ?? target.id.replace('.', ' ') })].filter(Boolean).join(' ') }, intent: target.id };
      }
      case 'profile': {
        if (no || /^(i do not know|not sure|skip|pass|none|nothing)\b/.test(h.text)) return { out: { sym: 'learn.skip' }, intent: 'chat.no' };
        if (/^(ok|okay|cool|nice|alright|fine|great|lol|haha|hmm+|yes|sure|thanks)$/.test(h.text)) return null;
        if (h.n.question || h.text.split(' ').length > 14) return null;
        const q = PROFILE_QS.find(x => x.key === p.key);
        const a = cleanAnswer(h.text, h.raw);
        if (!a) return null;
        if (q) {
          await this.host.memoryAdd(q.mem(a), q.key === 'name' ? 'fact' : 'preference', 3);
          if (q.key === 'name') await this.host.updateProfile({ userName: capFirst(a.split(' ')[0]) });
          if (q.key === 'birthday') { const e = extract(h.text, this.host.now()); if (e.date) this.inner.birthday = e.date.slice(5); }
          this.inner.known.push(q.key);
          return { out: { text: q.react[Math.floor(Math.random() * q.react.length)].replace('{a}', a), quiet: true }, intent: 'learn.profile' };
        }
        if (p.data?.['q']) {
          await this.host.memoryAdd(`${capFirst(String(p.data['q']))}: ${a}`, 'fact', 3);
          return { out: { sym: 'learn.gotit', vars: { a }, quiet: true }, intent: 'learn.profile' };
        }
        return null;
      }
      case 'narr': {
        const cat = String(p.data?.['cat'] ?? '');
        const words = h.text.split(' ').length;
        if (h.n.question || words > 45 || narrative(h.text) || (/^i /.test(h.text) && words > 3)) return null;
        if (cat === 'plan') {
          if (yes && /goal/.test(this.ds.lastBot ?? '')) {
            const x = String(p.data?.['x'] ?? '').replace(/^you /, '');
            const goal = await this.handlers['goal.add']({ ...h, text: `add a goal to ${x}`, raw: `add a goal to ${x}`, ent: extract(`add a goal to ${x}`, this.host.now()), intent: 'goal.add' });
            return { out: goal, intent: 'goal.add' };
          }
          if (no) return { out: { sym: 'r.chat.no', quiet: true }, intent: 'chat.no' };
          if (yes && /\b(want me|shall i|is this something|would you|have you)\b/i.test(this.ds.lastBot ?? '')) return { out: { sym: 'r.nar.plan.go', quiet: true }, intent: 'chat.narrate' };
          return null;
        }
        if (no && words <= 2) return { out: { sym: 'r.nar.reply.neg', quiet: true }, intent: 'chat.narrate' };
        const tone = yes && words <= 3 ? 'pos' : replyTone(h.text, h.emo.emotion);
        if (cat === 'person' && words >= 3 && tone !== 'pos') return { out: { sym: 'r.nar.reply.person', vars: { who: String(p.data?.['who'] ?? 'them') }, quiet: true }, intent: 'chat.narrate' };
        if (words > 14) return { out: { sym: 'r.nar.reply.more', quiet: true }, intent: 'chat.narrate' };
        if (tone === 'mid' && words <= 4 && !yes && cat !== 'person') return { out: { sym: 'r.nar.reply.echo', vars: { a: capFirst(h.raw.trim().replace(/[.!?]+$/, '')) }, quiet: true }, intent: 'chat.narrate' };
        return { out: { sym: `r.nar.reply.${tone}`, quiet: true }, intent: 'chat.narrate' };
      }
      case 'safety': {
        const help = helpText(this.host.country?.());
        if (p.data?.['soft']) {
          if (/^(yes|yeah|yep|sometimes|a bit|a little|kind of|i have|i do|i am|maybe|i think so|thinking|all the time|often|honestly yes)\b/.test(h.text)) return { out: { sym: 'r.well.crisis', vars: { help, emergency: helpFor(this.host.country?.()).emergency }, quiet: true, pending: { kind: 'safety' } }, intent: 'well.crisis' };
          if (/^(no|nope|not really|no not|never|not at all|nah)\b/.test(h.text)) return { out: { sym: 'well.soft.no', vars: { help }, quiet: true }, intent: 'well.crisis' };
        }
        if (/^(no|not really|nope|i do not know|not sure|maybe not|i am not|not safe|i might|i am going to|i have a plan|tonight)\b/.test(h.text) || /\b(not safe|in danger|have a plan|going to do it)\b/.test(h.text)) return { out: { sym: 'well.safety.no', vars: { help, emergency: helpFor(this.host.country?.()).emergency }, quiet: true }, intent: 'well.crisis' };
        if (/^(yes|yeah|yep|i am|i am safe|safe|i think so|for now|ok|okay|i am ok|i am okay|i am fine)\b/.test(h.text)) return { out: { sym: 'well.safety.yes', vars: { help }, quiet: true, pending: { kind: 'safety' } }, intent: 'well.crisis' };
        return null;
      }
      case 'screen': {
        const kind = p.data!['kind'] as ScreenKind;
        const answers = (p.data!['answers'] as number[]) ?? [];
        const items = ITEMS[kind];
        if (/^(stop|cancel|quit|later|not now|skip it|enough)\b/.test(h.text)) return { out: { sym: 'learn.skip' }, intent: 'well.screen' };
        const sc = parseScore(h.text);
        if (sc === undefined) return { out: { sym: 'well.screen.again', vars: { scale: SCALE }, pending: { kind: 'screen', data: p.data }, quiet: true }, intent: 'well.screen' };
        answers.push(sc);
        if (kind === 'phq9' && answers.length === 9 && sc > 0) {
          this.saveScreen(kind, answers);
          return { out: { sym: 'r.well.crisis', vars: { help: helpText(this.host.country?.()) }, quiet: true }, intent: 'well.crisis' };
        }
        if (answers.length < items.length) return { out: { sym: 'well.screen.next', vars: { item: items[answers.length] }, pending: { kind: 'screen', data: { ...p.data, answers } }, quiet: true }, intent: 'well.screen' };
        const score = answers.reduce((a, b) => a + b, 0);
        this.saveScreen(kind, answers);
        const b = band(kind, score);
        const chain = p.data!['then'] as ScreenKind | undefined;
        if ((kind === 'phq2' || kind === 'gad2') && b.level >= 2) {
          const full: ScreenKind = kind === 'phq2' ? 'phq9' : 'gad7';
          return { out: { sym: 'r.well.screen.offer', vars: { band: b.label, full: scrName(full) }, pending: { kind: 'confirm', intent: 'well.screen', utter: full, raw: full }, quiet: true }, intent: 'well.screen' };
        }
        const done = this.say('r.well.screen.done', { name: scrName(kind), score, band: b.label, level: b.level });
        if (chain) return { out: { text: `${done}\n\n${this.say('r.well.screen.start', { name: scrName(chain), item: ITEMS[chain][0], scale: SCALE })}`, pending: { kind: 'screen', data: { kind: chain, answers: [] } }, quiet: true }, intent: 'well.screen' };
        return { out: { text: done, quiet: true }, intent: 'well.screen' };
      }
      case 'riddle': {
        const r = RIDDLES[Number(p.data?.['i'] ?? 0)];
        const tries = Number(p.data?.['tries'] ?? 0);
        if (r.accept.test(h.text)) return { out: { sym: 'riddle.right', vars: { a: r.a }, content: 'r.fun.riddle' }, intent: 'fun.riddle' };
        if (/\b(give up|tell me|i do not know|no idea|what is it|answer|pass|skip)\b/.test(h.text) || tries >= 1) return { out: { sym: 'riddle.reveal', vars: { a: r.a } }, intent: 'fun.riddle' };
        return { out: { sym: 'riddle.wrong', pending: { kind: 'riddle', data: { i: p.data?.['i'], tries: tries + 1 } } }, intent: 'fun.riddle' };
      }
      default: return null;
    }
  }

  private learn(intent: string, utter: string) {
    if (!utter || this.learned.some(l => l.intent === intent && l.text === utter)) return;
    this.learned.push({ intent, text: utter });
    this.model.learn(intent, utter);
    this.host.kvSet('learned', this.learned.slice(-2000)).catch(() => undefined);
  }

  /** "add milk and remind me at 5 to call mom" → two commands. */
  private split(text: string, raw: string): { n: string; raw: string }[] {
    const verbs = 'remind|set|add|start|open|turn|call|text|log|create|schedule|mark|tick|wake|play|note|remember|launch|put|move|snooze|delete';
    const re = new RegExp(`\\s+(?:and then|then|and also|also|and|;)\\s+(?=(?:please\\s+)?(?:${verbs})\\b)`);
    if (!re.test(text)) return [];
    const parts = text.split(re).map(s => s.trim()).filter(Boolean);
    const rawParts = raw.split(new RegExp(`\\s+(?:and then|then|and also|also|and|;)\\s+(?=(?:please\\s+)?(?:${verbs})\\b)`, 'i')).map(s => s.trim());
    return parts.map((p, i) => ({ n: p, raw: rawParts[i] ?? p }));
  }

  // ================================================================== facts & curiosity
  private missingProfile(): string[] {
    return PROFILE_QS.map(q => q.key).filter(k => !this.inner.asked.includes(k) && !this.inner.known.includes(k));
  }

  private async storeFacts(facts: LearnedFact[]) {
    for (const f of facts) {
      await this.host.memoryAdd(f.text, f.kind, f.importance);
      if (f.key && !this.inner.known.includes(f.key)) this.inner.known.push(f.key);
      if (f.userName) await this.host.updateProfile({ userName: f.userName });
      if (f.followUp && !this.inner.followUps.some(x => x.about === f.followUp!.about && x.date === f.followUp!.date)) this.inner.followUps = [...this.inner.followUps.slice(-20), f.followUp];
      if (f.key === 'birthday') { const m = f.text.match(/\((\d{2}-\d{2})\)/); if (m) this.inner.birthday = m[1]; }
    }
  }

  private async onFacts(facts: LearnedFact[], _raw: string): Promise<Out> {
    await this.storeFacts(facts);
    const f = facts[0];
    const echo = facts.map(x => x.echo).join(', and ');
    if (f.userName) return { sym: 'r.persona.username', vars: { uname: f.userName }, topic: 'memory' };
    if (f.followUp) return { sym: 'r.learn.event', vars: { echo, about: f.followUp.about }, topic: 'memory' };
    if (f.kind === 'preference' && /dislike|not a fan/.test(f.echo)) return { sym: 'r.learn.dislike', vars: { echo }, topic: 'memory' };
    if (f.kind === 'preference') return { sym: 'r.learn.like', vars: { echo }, topic: 'memory' };
    if (f.kind === 'goal') return { sym: 'r.learn.goal', vars: { echo }, topic: 'goals' };
    if (f.kind === 'person') return { sym: 'r.learn.person', vars: { echo }, topic: 'memory' };
    return { sym: 'r.learn.fact', vars: { echo }, topic: 'memory' };
  }

  // ================================================================== fallback (no LLM: reflect, look up, offer)
  private async fallback(h: H): Promise<Out> {
    const s = this.host.state();
    if (h.n.question && s.docs > 0) {
      const hits = await this.host.librarySearch(h.text).catch(() => []);
      if (hits[0] && hits[0].score > 0.3) return { sym: 'r.info.library', vars: { doc: hits[0].doc, snippet: bestSentence(hits[0].text, h.text) }, topic: 'docs' };
    }
    if (/\b(my|i|me)\b/.test(h.text) && h.n.question) {
      const hits = await this.host.memorySearch(recallQuery(h.text), 2).catch(() => []);
      if (hits[0] && hits[0].score > 0.5) return { sym: 'r.memory.recall', vars: { answer: capFirst(secondPerson(hits[0].text)) }, topic: 'memory' };
    }
    const cands = h.ranked.filter(r => r.score >= 0.2 && LABEL[r.id]).slice(0, 3);
    if (cands.length >= 2 && cands[0].score >= 0.24 && this.model.spec(cands[0].id)?.kind === 'action') {
      const opts = cands.map(c => c.id);
      return { sym: 'r.fallback.choice', vars: { choices: opts.map((o, i) => `${i + 1}) ${LABEL[o]}`).join(', ') }, pending: { kind: 'choice', options: opts, utter: h.text, raw: h.raw }, quiet: true };
    }
    if (isKnowledgeQuestion(h.text) || (h.n.question && h.text.split(' ').length >= 4 && !/\b(you|your|we|our|i|my|me|mine)\b/.test(h.text))) return this.handlers['research.ask'](h).then(o => ({ ...o, intent: 'research.ask' }));
    const reflect = this.reflect(h);
    if (reflect) return reflect;
    if (h.n.question && this.host.online()) return { sym: 'r.fallback.web', pending: { kind: 'web', utter: h.text, raw: h.raw }, quiet: true };
    if (h.n.question) return { sym: 'r.fallback.question', vars: { kw: keyPhrase(h.text) } };
    return { sym: 'r.fallback.generic', vars: { kw: keyPhrase(h.text) }, pending: { kind: 'teach', utter: h.text, raw: h.raw } };
  }

  /** Respond to a story the way a friend would, then keep the thread so the next line lands in context. */
  private narrate(n: Narr): Out {
    const base = { quiet: true as const, topic: n.kind === 'person' ? 'people' : n.kind === 'plan' ? 'goals' : undefined };
    const pend = (cat: string): Out['pending'] => ({ kind: 'narr', data: { cat, x: n.x, who: n.who ?? '' } });
    switch (n.kind) {
      case 'plan': return { ...base, sym: 'r.nar.plan', vars: { x: capFirst(n.x) }, pending: pend('plan') };
      case 'person': return { ...base, sym: `r.nar.person.${n.tone ?? 'neutral'}`, vars: { who: n.who }, pending: pend('person') };
      case 'device': return { ...base, sym: `r.nar.device.${n.tone === 'pos' ? 'pos' : 'neg'}`, vars: { x: n.x } };
      case 'doing': return { ...base, sym: 'r.nar.doing', vars: { x: n.x }, pending: pend('doing') };
      case 'body': return { ...base, sym: 'r.nar.body', vars: { x: n.x }, pending: pend('body') };
      case 'went': return { ...base, sym: `r.nar.went.${n.tone}`, vars: { x: n.x }, pending: pend('went') };
      case 'win': return { ...base, sym: 'r.nar.win', pending: pend('win') };
      case 'media': return { ...base, sym: `r.nar.media.${n.media ?? 'movie'}`, pending: pend('media') };
      case 'food': return { ...base, sym: n.x.length > 3 && Math.random() < 0.85 ? 'r.nar.food.x' : 'r.nar.food', vars: { x: n.x }, pending: pend('food') };
      default: return { ...base, sym: `r.nar.${n.kind}`, vars: { x: n.x }, pending: pend(n.kind) };
    }
  }

  /** ELIZA-style reflective listening, persona-flavoured. Keeps conversation flowing on anything. */
  private reflect(h: H): Out | null {
    const t = h.text;
    const swap = (s: string) => ` ${s} `.replace(/\b(i am|i was|i|me|my|mine|myself|am|you are|you|your|yours)\b/g, w => (({ 'i am': 'you are', 'i was': 'you were', i: 'you', me: 'you', my: 'your', mine: 'yours', myself: 'yourself', am: 'are', 'you are': 'I am', you: 'me', your: 'my', yours: 'mine' } as Record<string, string>)[w] ?? w)).trim();
    let m: RegExpMatchArray | null;
    const emo = h.emo.emotion !== 'neutral' ? h.emo.emotion : '';
    if ((m = t.match(/^i (?:feel|felt|am feeling) (.{3,60})$/))) return { sym: 'r.reflect.feel', vars: { x: swap(m[1]), emo }, topic: 'feelings' };
    if ((m = t.match(/^i (?:think|believe|guess|reckon) (.{3,80})$/))) return { sym: 'r.reflect.think', vars: { x: swap(m[1]) } };
    if ((m = t.match(/^i (?:want|need|wish|would like) (?:to )?(.{3,60})$/))) return { sym: 'r.reflect.want', vars: { x: swap(m[1]) }, topic: 'goals' };
    if ((m = t.match(/^i (?:can not|cannot|could not|do not know how to) (.{3,60})$/))) return { sym: 'r.reflect.cant', vars: { x: swap(m[1]) } };
    if ((m = t.match(/^i (?:was|have been|had) (.{3,60})$/))) return { sym: 'r.reflect.past', vars: { x: swap(m[1]) } };
    if ((m = t.match(/^i am (?:so |really |kind of |a bit )?(.{3,50})$/))) return { sym: 'r.reflect.am', vars: { x: swap(m[1]) } };
    if ((m = t.match(/\bbecause (.{3,60})$/))) return { sym: 'r.reflect.because', vars: { x: swap(m[1]) } };
    if ((m = t.match(/\bmy (mom|mum|mother|dad|father|wife|husband|partner|girlfriend|boyfriend|boss|friend|sister|brother|son|daughter|family|kids|job|work|team|life)\b/))) return { sym: 'r.reflect.my', vars: { x: m[1] }, topic: 'people' };
    if ((m = t.match(/^(?:what|how) do you (?:think|feel) about (.{2,50})$/))) return { sym: 'r.chat.likes', vars: this.likes(swap(m[1])) };
    if ((m = t.match(/^(?:do|can|will|would|are|could) you (.{3,50})$/))) return { sym: 'r.reflect.you', vars: { x: swap(m[1]) } };
    if (emo) return { sym: 'r.reflect.emotion', vars: { emo }, topic: 'feelings' };
    return null;
  }

  // ================================================================== state helpers
  private touchInner(now: Date) {
    const d = ymd(now);
    this.inner.turns++;
    if (!this.inner.days.includes(d)) this.inner.days = [...this.inner.days.slice(-400), d];
    this.inner.lastSeenPrev = this.inner.lastSeen;
    this.inner.lastSeen = now.getTime();
  }

  private persist() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.host.kvSet('inner', this.inner).catch(() => undefined);
      this.host.kvSet('episodes', this.episodic.episodes).catch(() => undefined);
      this.host.kvSet('states', this.episodic.states).catch(() => undefined);
    }, 400);
  }

  private saveScreen(kind: ScreenKind, items: number[]) {
    const r: ScreenResult = { kind, score: items.reduce((a, b) => a + b, 0), items: [...items], t: Date.now() };
    this.inner.screens = [...(this.inner.screens ?? []).slice(-60), r];
    this.persist();
  }

  /** Answers questions that were asked offline, in the background, once the phone is online. */
  private lookupLater() {
    const q = this.inner.lookups?.[0];
    if (!q || this.lookupBusy || !this.host.online() || !this.host.http) return;
    this.lookupBusy = true;
    this.city().then(city => this.researcher.ask(q.q, { city, now: Date.now() })).then(f => {
      this.inner.lookups = (this.inner.lookups ?? []).filter(x => x !== q);
      if (f?.answer) this.inner.lookedUp = [...(this.inner.lookedUp ?? []).slice(-10), { q: q.q, t: q.t, answer: f.answer, source: f.source }];
      this.persist();
    }).catch(() => undefined).finally(() => { this.lookupBusy = false; });
  }

  private async city(): Promise<string | undefined> {
    const hits = await this.host.memorySearch('User lives in', 3).catch(() => []);
    return hits.map(h => h.text.match(/lives in ([A-Za-z .'-]+)/)?.[1]?.trim()).find(Boolean);
  }

  /** Online research with offline cache and an offline queue. */
  private async research(raw: string, norm: string): Promise<Out> {
    const now = this.host.now().getTime();
    const q = cleanQuery(norm) || norm;
    const online = this.host.online() && !!this.host.http;
    if (!online) {
      const c = this.researcher.recall(q, now, true);
      if (c) return { sym: 'r.research.cached', vars: { ...c, ago: ago(c.t, now) }, topic: 'web' };
      if (!(this.inner.lookups ?? []).some(l => l.q === q)) this.inner.lookups = [...(this.inner.lookups ?? []).slice(-10), { q: raw.replace(/\?+$/, ''), t: now }];
      return { sym: 'r.research.offline', topic: 'web' };
    }
    this.host.status?.('Looking that up…');
    let f: Finding | undefined;
    try { f = await this.researcher.ask(raw, { city: await this.city(), now, fahrenheit: this.host.country?.() === 'US' }); } finally { this.host.status?.(''); }
    if (!f?.answer) return { sym: 'r.research.none', topic: 'web' };
    this.lastResearch = { q: raw.replace(/[?\s]+$/, ''), source: f.source, url: f.url, t: f.t, cached: f.cached };
    const vars = { answer: f.answer.trim().replace(/([^.!?])$/, '$1.'), source: f.source, ago: ago(f.t, now) };
    return { sym: f.cached && now - f.t > 3600_000 ? 'r.research.cached' : f.confidence < 0.5 ? 'r.research.unsure' : 'r.research.found', vars, topic: 'web', quiet: true };
  }

  private async tool(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; result: string }> {
    const rec: ToolTrace = { name, args };
    this.tools.push(rec);
    const r = await this.host.runTool(name, args);
    if (/^[A-Za-z]+(_[a-z]+)+ (done|ok)\.?$/i.test(r.result.trim())) r.result = r.ok ? 'Done.' : 'That didn’t work.';
    rec.ok = r.ok; rec.result = r.result;
    return r;
  }

  private findTask(ref: string, tasks: TaskLite[]): TaskLite | undefined {
    const r = ref.trim().toLowerCase();
    if (!r || /^(it|that|this|the task|that task|this task|the last one|last one)$/.test(r)) {
      const last = this.ds.lastTaskRef;
      return last ? tasks.find(t => t.title.toLowerCase() === last.toLowerCase()) ?? bestFuzzy(last, tasks, t => t.title, 0.6) : undefined;
    }
    return tasks.find(t => t.title.toLowerCase() === r)
      ?? (r.length >= 3 ? tasks.find(t => new RegExp(`\\b${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t.title.toLowerCase())) : undefined)
      ?? bestFuzzy(r, tasks, t => t.title, 0.42);
  }

  private pickTop(tasks: TaskLite[], n = 3): TaskLite[] {
    const today = ymd(this.host.now());
    const score = (t: TaskLite) => (t.isMit ? 50 : 0) + (t.due && t.due < today ? 40 : 0) + (t.due === today ? 30 : 0) + (t.urgent ? 20 : 0) + (t.important ? 15 : 0) - (t.due && t.due > today ? 10 : 0);
    return [...tasks].sort((a, b) => score(b) - score(a)).slice(0, n);
  }

  // ================================================================== handlers
  private registerHandlers() {
    const H = this.handlers;
    const now = () => this.host.now();
    const state = (): HostState => this.host.state();
    const strip = (t: string, re: RegExp) => t.replace(re, '').replace(/\s+/g, ' ').trim();
    const recase = (span: string, raw: string) => restoreCase(span, raw);
    const fail = (result: string): Out => ({ sym: 'r.tool.fail', vars: { result: result.replace(/^Error:\s*/, '') }, quiet: true });

    // ---------------- tasks
    H['task.add'] = async h => {
      const body = strip(h.ent.rest, /\b(urgent(ly)?|asap|important|high priority|top priority|as (a )?priority|as (an )?mit)\b/g);
      const listy = h.raw.trim().replace(/[.!]+$/, '').match(/^(?:please\s+)?(?:add|put|capture)\s+(.+?)\s+(?:to|on|onto)\s+(?:my\s+)?(?:list|tasks|todo list|to do list|shopping list|groceries)$/i);
      if (listy && /,|\band\b/i.test(listy[1]) && !h.ent.date) {
        const items = listy[1].split(/\s*,\s*(?:and\s+)?|\s+and\s+/i).map(s => capFirst(s.trim())).filter(Boolean).slice(0, 12);
        for (const it of items) await this.tool('add_task', { title: it });
        return { sym: 'r.task.add.many', vars: { count: items.length, list: items.join(', ') }, topic: 'tasks', taskRef: items[items.length - 1] };
      }
      const title = recase(cleanTitle(body), h.raw);
      if (!title || /^(a |an )?(task|todo|new task)$/i.test(title)) return { sym: 'r.task.add.ask', pending: { kind: 'slot', intent: 'task.add', slot: 'title', utter: 'add', raw: 'add' }, quiet: true };
      const urgent = /\b(urgent|asap)\b/.test(h.text);
      const mit = /\b(priority|important|mit)\b/.test(h.text) && state().mits.length < 3;
      const r = await this.tool('add_task', { title, due: h.ent.date, urgent, mit, important: true });
      if (!r.ok) return fail(r.result);
      const s = state();
      const dueText = h.ent.date ? ` for ${fmtDay(new Date(h.ent.date + 'T12:00'), now())}` : '';
      return { sym: 'r.task.add', vars: { title, dueText, mitSlot: !mit && s.mits.length < 3 && Math.random() < 0.3, bigOpen: s.open >= 12 && Math.random() < 0.3 }, topic: 'tasks', taskRef: title };
    };

    H['task.list'] = async h => {
      const s = state();
      const t = h.text;
      const today = ymd(now());
      if (/\bshould i\b|\bwhere do i (start|begin)\b/.test(t) || (/\b(next|now|first|start with)\b/.test(t) && /\bwhat\b/.test(t))) {
        const top = this.pickTop(s.tasks, 1)[0];
        if (!top) return { sym: 'r.task.list.empty', vars: { open: 0 } };
        return { sym: 'r.task.next', vars: { title: top.title, why: top.isMit ? 'it is a top priority' : top.due && top.due < today ? 'it is overdue' : top.due === today ? 'it is due today' : top.urgent ? 'it is urgent' : 'it matters most right now' }, taskRef: top.title, topic: 'tasks' };
      }
      if (/\b(done|finish|complet|did i)\b/.test(t)) {
        const r = await this.tool('list_tasks', { filter: 'done_today' });
        return { sym: 'r.task.list', vars: { heading: 'what you finished today', list: cleanList(r.result) }, quiet: true };
      }
      let heading = 'today’s list', items: TaskLite[];
      const proj = t.match(/\b(?:for|in|on) (?:project )?([a-z0-9][a-z0-9 -]{1,30})$/)?.[1];
      if (/overdue|late|behind/.test(t)) { heading = 'what is overdue'; items = s.tasks.filter(x => x.due && x.due < today); }
      else if (/\b(priorit|mits?|important)\b/.test(t)) { heading = 'your top priorities'; items = s.tasks.filter(x => x.isMit); }
      else if (/\binbox\b/.test(t)) { heading = 'your inbox'; items = s.tasks.filter(x => !x.due && !x.isMit).slice(0, 15); }
      else if (/\b(all|everything|whole)\b/.test(t)) { heading = `all ${s.open} open tasks`; items = this.pickTop(s.tasks, 30); }
      else if (/\btomorrow\b/.test(t)) { heading = 'tomorrow'; items = s.tasks.filter(x => x.due === addDays(today, 1)); }
      else if (/\b(this|next) week\b/.test(t)) { heading = 'this week'; items = s.tasks.filter(x => x.due && x.due <= addDays(today, 7)); }
      else if (proj && !/\b(today|now|me|list|plate)\b/.test(proj) && s.tasks.some(x => x.project && fuzzy(proj, x.project) > 0.6)) { heading = `project ${proj}`; items = s.tasks.filter(x => x.project && fuzzy(proj, x.project) > 0.6); }
      else items = s.tasks.filter(x => x.isMit || (x.due && x.due <= today));
      if (!items.length && heading === 'today’s list' && s.open) { heading = 'your open tasks (nothing is due today)'; items = this.pickTop(s.tasks, 8); }
      if (!items.length) return { sym: 'r.task.list.empty', vars: { open: s.open } };
      const fmt = (x: TaskLite) => `• ${x.title}${x.isMit ? ' ★' : ''}${x.due ? ` (${x.due < today ? 'overdue' : fmtDay(new Date(x.due + 'T12:00'), now())})` : ''}${x.urgent ? ' ⚡' : ''}`;
      return { sym: 'r.task.list', vars: { heading, list: items.slice(0, 15).map(fmt).join('\n') + (items.length > 15 ? `\n…and ${items.length - 15} more` : '') }, quiet: true, topic: 'tasks' };
    };

    const taskRef = (t: string) => strip(t, /^(please |can you |could you )?(mark|tick|check|cross|complete|finish|delete|remove|get rid of|drop|erase|cancel|move|push|snooze|reschedule|postpone|defer|delay|bump|change the (due )?date of|make|set|prioriti[sz]e)( off)?\b|\b(as )?(done|complete|completed|finished|off my list|from my list|off|the task|task|todo|a priority|top priority|as (an? )?mit|as important|important|priority|back( a day)?|by a day|to \S+day|to tomorrow|to next week|until \S+)\b|^(i )?(finished|completed|did|done with|have done)\b|^that is done$/g).replace(/^(the|my) /, '').replace(/\s+(to|until|till|for|on|by)$/, '');

    H['task.done'] = async h => {
      const s = state();
      const ref = taskRef(h.text);
      const task = this.findTask(ref, s.tasks);
      if (!task) return ref && !/^(it|that|this)$/.test(ref) ? { sym: 'r.task.ref.missing', vars: { ref } } : { sym: 'r.task.ref.ask', pending: { kind: 'slot', intent: 'task.done', slot: 'task', utter: 'mark done', raw: 'mark done' }, quiet: true };
      const r = await this.tool('complete_task', { task: task.id });
      if (!r.ok) return fail(r.result);
      const after = state();
      const today = ymd(now());
      const left = after.tasks.filter(x => x.isMit || (x.due && x.due <= today)).length;
      return { sym: 'r.task.done', vars: { title: task.title, left, nextUp: after.mits[0], allMitsDone: task.isMit && !after.mits.length, doneToday: after.doneToday, doneCount: after.doneToday }, taskRef: task.title, topic: 'tasks' };
    };

    H['task.delete'] = async h => {
      const task = this.findTask(taskRef(h.text), state().tasks);
      if (!task) return { sym: 'r.task.ref.ask', pending: { kind: 'slot', intent: 'task.delete', slot: 'task', utter: 'delete task', raw: 'delete task' }, quiet: true };
      const r = await this.tool('delete_task', { task: task.id });
      return r.ok ? { sym: 'r.task.delete', vars: { title: task.title }, topic: 'tasks' } : fail(r.result);
    };

    H['task.move'] = async h => {
      const task = this.findTask(taskRef(h.ent.rest), state().tasks);
      if (!task) return { sym: 'r.task.ref.ask', pending: { kind: 'slot', intent: 'task.move', slot: 'task', utter: `move ${h.ent.when ?? ''}`.trim(), raw: 'move' }, quiet: true };
      const days = h.ent.date ? undefined : (h.ent.number && /day/.test(h.text) ? h.ent.number : 1);
      const due = h.ent.date ?? addDays(task.due && task.due > ymd(now()) ? task.due : ymd(now()), days ?? 1);
      const r = await this.tool('update_task', { task: task.id, due, mit: false });
      return r.ok ? { sym: 'r.task.move', vars: { title: task.title, due: fmtDay(new Date(due + 'T12:00'), now()) }, taskRef: task.title, topic: 'tasks' } : fail(r.result);
    };

    H['task.mit'] = async h => {
      const s = state();
      if (/\b(pick|choose|select|what are|set my|plan my)\b.*\b(top|mits|priorities)\b|\btop (3|three)\b|^(choose|pick|set) my (mits|priorities)$/.test(h.text)) {
        const top = this.pickTop(s.tasks.filter(t => !t.due || t.due <= addDays(ymd(now()), 2)), 3);
        if (!top.length) return { sym: 'r.task.list.empty', vars: { open: s.open } };
        const r = await this.tool('set_mits', { tasks: top.map(t => t.id) });
        return r.ok ? { sym: 'r.task.mit.pick', vars: { list: top.map(t => t.title).join(', ') }, topic: 'tasks' } : fail(r.result);
      }
      const task = this.findTask(taskRef(h.text), s.tasks);
      if (!task) return { sym: 'r.task.ref.ask', pending: { kind: 'slot', intent: 'task.mit', slot: 'task', utter: 'prioritise', raw: 'prioritise' }, quiet: true };
      if (s.mits.length >= 3 && !task.isMit) return { sym: 'r.task.mit.full', vars: { list: s.mits.join(', ') } };
      const r = await this.tool('update_task', { task: task.id, mit: true });
      return r.ok ? { sym: 'r.task.mit', vars: { title: task.title }, taskRef: task.title, topic: 'tasks' } : fail(r.result);
    };

    // ---------------- focus
    H['focus.start'] = async h => {
      const kind = /\bbreak\b/.test(h.text) ? 'break' : 'focus';
      const onTask = h.text.match(/\b(?:on|for|with) (?!\d)(?:the |my )?([a-z][a-z0-9 '-]{1,40}?)(?: for \d.*)?$/)?.[1];
      const task = onTask && !/minutes?|hours?|an hour|^(right )?now$|^today$|^tonight$/.test(onTask) ? this.findTask(onTask, state().tasks) : undefined;
      const r = await this.tool('start_focus', { minutes: h.ent.minutes, task: task?.id, label: task ? undefined : onTask, kind });
      if (!r.ok) return fail(r.result);
      const minutes = h.ent.minutes ?? Number(r.result.match(/(\d+)\s*-?\s*min/)?.[1] ?? 25);
      return { sym: 'r.focus.start', vars: { minutes, kind: kind === 'break' ? 'break' : 'focus', forText: task ? ` on "${task.title}"` : onTask && !/minutes?|hours?|^(right )?now$|^today$|^tonight$/.test(onTask) ? ` on ${onTask}` : '' }, topic: 'focus' };
    };
    H['focus.stop'] = async () => { const r = await this.tool('stop_focus', {}); return r.ok ? { sym: 'r.focus.stop', vars: { result: r.result } } : fail(r.result); };
    H['focus.stats'] = async () => { const r = await this.tool('focus_stats', {}); return { sym: 'r.focus.stats', vars: { result: r.result }, quiet: true }; };

    // ---------------- habits
    H['habit.add'] = async h => {
      const name = capFirst(restoreCase(strip(h.ent.rest, /^(please )?(add|new|create|track|start tracking|build|i want to build)( a| an)?( new)?( daily| weekly)? habit( of| to| called| named| for)?\b|\b(every ?day|daily|weekly|each day|a week|per week|times?|\d+ times? a week)\b/g), h.raw));
      if (!name) return { sym: 'r.journal.ask', vars: {}, pending: { kind: 'slot', intent: 'habit.add', slot: 'name', utter: 'new habit', raw: 'new habit' }, quiet: true };
      const weekly = /\bweek/.test(h.text);
      const target = weekly ? Number(h.text.match(/(\d+) times?/)?.[1] ?? 3) : 7;
      const r = await this.tool('add_habit', { name, cadence: weekly ? 'weekly' : 'daily', target });
      return r.ok ? { sym: 'r.habit.add', vars: { name, cadence: weekly ? `${target} times a week` : 'daily' }, topic: 'habits' } : fail(r.result);
    };
    H['habit.log'] = async h => {
      const s = state();
      const phrase = strip(h.text, /^(log|tick off|mark|i|habit|today)\b|\b(my|done|today|habit|as done|for today)\b/g);
      const stems = contentWords(phrase).map(stem);
      let best: string | undefined, score = 0.34;
      for (const name of s.habits) {
        const hs = contentWords(name.toLowerCase()).map(stem);
        let sc = fuzzy(phrase, name.toLowerCase());
        for (const a of stems) for (const b of hs) if (a.length > 2 && (a.startsWith(b.slice(0, 4)) || b.startsWith(a.slice(0, 4)))) sc = Math.max(sc, 0.8);
        if (/gym|work ?out|exercis|train/.test(phrase) && /gym|work ?out|exercis|train/.test(name.toLowerCase())) sc = 0.9;
        if (sc > score) { score = sc; best = name; }
      }
      if (!best) return { sym: 'r.habit.unknown', vars: { ref: phrase || 'that' } };
      const r = await this.tool('log_habit', { habit: best });
      return r.ok ? { sym: 'r.habit.log', vars: { name: best, result: '', habitsLeft: state().habitsLeft.filter(x => x !== best).slice(0, 3).join(', ') }, topic: 'habits' } : fail(r.result);
    };
    H['habit.report'] = async () => {
      const s = state();
      const r = await this.tool('habit_report', {});
      const head = s.habitsTotal ? `${s.habitsDone} of ${s.habitsTotal} done today${s.habitsLeft.length ? `; still to go: ${listify(s.habitsLeft)}` : '. All done!'}.` : 'You have no habits yet. Say “new habit drink water”.';
      return { sym: 'r.habit.report', vars: { result: `${head}\n${r.result}` }, quiet: true };
    };

    // ---------------- planning
    H['plan.briefing'] = async () => {
      let s = state();
      const today = ymd(now());
      const parts: string[] = [];
      if (!s.mits.length && s.open) {
        const top = this.pickTop(s.tasks.filter(t => !t.due || t.due <= addDays(today, 2)), 3);
        if (top.length) { await this.tool('set_mits', { tasks: top.map(t => t.id) }); s = state(); parts.push(this.say('brief.setmits', { list: listify(top.map(t => t.title)) })); }
      } else if (s.mits.length) parts.push(this.say('brief.mits', { list: listify(s.mits) }));
      if (s.overdue) parts.push(this.say('brief.overdue', { n: s.overdue, first: s.overdueTitles[0] }));
      const due = s.tasks.filter(t => t.due === today && !t.isMit).map(t => t.title);
      if (due.length) parts.push(this.say('brief.due', { n: due.length, list: listify(due.slice(0, 3)) }));
      if (s.habitsLeft.length) parts.push(this.say('brief.habits', { list: listify(s.habitsLeft.slice(0, 4)) }));
      if (s.nextReminder) parts.push(this.say('brief.reminder', { r: `${s.nextReminder.title} at ${fmtTime(new Date(s.nextReminder.at))}` }));
      if (s.streak >= 2) parts.push(this.say('brief.streak', { n: s.streak }));
      if (!s.open) parts.push(this.say('brief.clear'));
      parts.push(this.say('brief.advice'));
      return { sym: 'r.plan.briefing', vars: { briefing: parts.join(' ') }, quiet: true, topic: 'planning' };
    };
    H['plan.day'] = async h => {
      const r = await this.tool('plan_day', { notes: h.text });
      return r.ok ? { sym: 'r.plan.day', vars: { result: r.result.replace(/^Plan saved:\n?/, '') }, quiet: true, topic: 'planning' } : fail(r.result);
    };
    H['plan.schedule'] = async () => { const r = await this.tool('get_schedule', {}); return { sym: 'r.plan.schedule', vars: { result: r.result }, quiet: true }; };
    H['plan.summary'] = async () => {
      const s = state();
      return { sym: 'r.plan.summary.live', vars: { done: s.doneToday, focus: s.focusToday, habits: `${s.habitsDone}/${s.habitsTotal}`, xp: s.xpToday, open: s.open }, topic: 'progress' };
    };
    H['progress.stats'] = async () => { const r = await this.tool('my_progress', {}); return { sym: 'r.progress.stats', vars: { result: r.result }, quiet: true, topic: 'progress' }; };

    // ---------------- reminders, alarms, timers
    H['reminder.add'] = async h => {
      const what = restoreCase(cleanTitle(strip(h.ent.rest, /^(please )?(set (a |an )?reminder|reminder|remind me|ping me|alert me|nudge me|notify me|do not let me forget)( for| about| to| that| of)?\b/)), h.raw);
      let at = h.ent.at;
      if (!at && h.ent.date) { const [y, m, d] = h.ent.date.split('-').map(Number); at = new Date(y, m - 1, d, 9, 0); }
      if (!what) return { sym: 'r.reminder.ask.what', pending: { kind: 'slot', intent: 'reminder.add', slot: 'what', utter: `remind me ${h.ent.when ?? ''}`.trim(), raw: `remind me ${h.ent.when ?? ''}` }, quiet: true };
      if (!at) return { sym: 'r.reminder.ask.when', pending: { kind: 'slot', intent: 'reminder.add', slot: 'when', utter: `remind me to ${what.toLowerCase()}`, raw: `remind me to ${what}` }, quiet: true };
      const r = await this.tool('schedule_reminder', { text: capFirst(what), when: `${ymd(at)} ${fmtHm(at)}` });
      if (!r.ok) return fail(r.result);
      const mins = Math.round((at.getTime() - now().getTime()) / 60000);
      const when = mins > 0 && mins < 120 ? `in ${mins} minute${mins === 1 ? '' : 's'}` : fmtWhen(at, now());
      return { sym: 'r.reminder.add', vars: { what: youify(what), when }, topic: 'reminders' };
    };
    H['reminder.list'] = async () => { const r = await this.tool('list_reminders', {}); return { sym: 'r.reminder.list', vars: { result: cleanList(r.result) }, quiet: true }; };
    H['reminder.cancel'] = async h => {
      const ref = strip(h.text, /^(please )?(cancel|delete|remove|stop|clear)( the| my| that)? reminders?( about| to| for)?\b/) || this.ds.lastReminder || '';
      const r = await this.tool('cancel_reminder', { reminder: ref || 'last' });
      return { sym: 'r.reminder.cancel', vars: { result: r.result }, quiet: true };
    };
    H['alarm.set'] = async h => {
      if (h.ent.at && /\bwake\b/.test(h.text) && !/pm|evening|tonight|afternoon/.test(h.text) && h.ent.at.getHours() >= 12 && h.ent.at.getHours() < 24) {
        const a = new Date(h.ent.at.getTime() - 12 * 3600_000);
        if (a <= now()) a.setDate(a.getDate() + 1);
        h.ent.at = a;
      }
      if (h.ent.at && !/\b(am|pm|noon|midnight|afternoon|evening|tonight|night)\b/.test(h.text) && /\b(at|for) \d{1,2}(:\d{2})?\b/.test(h.text) && h.ent.at.getHours() >= 12) {
        const a = new Date(h.ent.at.getTime() - 12 * 3600_000);
        if (a <= now()) a.setDate(a.getDate() + 1);
        h.ent.at = a;
      }
      if (!h.ent.at) return { sym: 'r.alarm.ask', pending: { kind: 'slot', intent: 'alarm.set', slot: 'when', utter: 'set an alarm for', raw: 'set an alarm for' }, quiet: true };
      const label = h.text.match(/\bfor (?!\d)([a-z][a-z ]{2,30})$/)?.[1];
      const days = /\bweekdays?\b/.test(h.text) ? [2, 3, 4, 5, 6] : /\b(every ?day|daily)\b/.test(h.text) ? [1, 2, 3, 4, 5, 6, 7] : undefined;
      const r = await this.tool('set_alarm', { time: fmtHm(h.ent.at), label: label ? capFirst(label) : undefined, days });
      return r.ok ? { sym: 'r.alarm.set', vars: { when: `${fmtTime(h.ent.at)}${days ? (days.length === 5 ? ' on weekdays' : ' every day') : ''}`, result: '' }, topic: 'alarms' } : fail(r.result);
    };
    H['timer.set'] = async h => {
      let minutes = h.ent.minutes, seconds = h.ent.seconds;
      if (!minutes && !seconds && h.ent.number) minutes = h.ent.number;
      if (!minutes && !seconds) return { sym: 'r.timer.ask', pending: { kind: 'slot', intent: 'timer.set', slot: 'dur', utter: 'timer for', raw: 'timer for' }, quiet: true };
      const label = h.text.match(/\b(?:for (?:the |my )?|time my )([a-z][a-z ]{2,24})$/)?.[1]?.replace(/\b(minutes?|seconds?|hours?)\b/g, '').trim();
      const r = await this.tool('set_timer', { minutes: minutes ? Math.floor(minutes) : 0, seconds: (seconds ?? 0) + (minutes ? Math.round((minutes % 1) * 60) : 0), label: label || undefined });
      return r.ok ? { sym: 'r.timer.set', vars: { dur: durText(minutes ?? 0, seconds ?? 0), labelText: label ? ` for ${label}` : '' }, topic: 'timers' } : fail(r.result);
    };

    // ---------------- notes, journal, memory
    H['note.create'] = async h => {
      const body = restoreCase(strip(h.text, /^(please )?(take|make|create|new|save|write|jot)?( a| this| that| it)?( new)? ?(note|down)( down)?( that| this| saying| called| titled|:)?\b/), h.raw);
      if (!body) return { sym: 'r.note.ask', pending: { kind: 'slot', intent: 'note.create', slot: 'body', utter: 'note', raw: 'note' }, quiet: true };
      const title = capFirst(body.split(' ').slice(0, 6).join(' ')).replace(/[.,;:]$/, '');
      const r = await this.tool('create_note', { title, body: capFirst(body) });
      return r.ok ? { sym: 'r.note.create', vars: { title }, topic: 'notes' } : fail(r.result);
    };
    H['note.search'] = async h => {
      const q = strip(h.text, /^(please )?(find|search|show|look for)( my)?( notes?)?( about| for| on)?\b|^what did i write( about)?\b/) || h.text;
      const r = await this.tool('search_notes', { query: q });
      return { sym: 'r.note.search', vars: { result: r.result }, quiet: true };
    };
    H['journal.add'] = async h => {
      const text = restoreCase(strip(h.text, /^(please )?(add to my journal|write in my journal|journal entry|dear diary|journal|diary|log in my journal)( that|:)?\b/), h.raw);
      if (!text) return { sym: 'r.journal.ask', pending: { kind: 'slot', intent: 'journal.add', slot: 'text', utter: 'journal', raw: 'journal' }, quiet: true };
      const r = await this.tool('append_journal', { text: capFirst(text) });
      return r.ok ? { sym: 'r.journal.add', vars: { grateful: /grateful|thankful/.test(h.text) ? '1' : '' }, topic: 'feelings' } : fail(r.result);
    };
    H['mood.log'] = async h => {
      let mood = h.ent.numbers.find(x => x >= 0 && x <= 10);
      if (mood !== undefined && /(out of|\/) ?10/.test(h.text)) mood = Math.round(mood / 2);
      if (mood === undefined && h.emo.emotion !== 'neutral') mood = Math.max(1, Math.min(5, Math.round(3 + h.emo.valence * 2)));
      if (mood === undefined) return { sym: 'r.mood.ask', pending: { kind: 'slot', intent: 'mood.log', slot: 'mood', utter: 'my mood is', raw: 'my mood is' }, quiet: true };
      mood = Math.max(1, Math.min(5, Math.round(mood)));
      const energy = h.text.match(/energy (?:is |of )?(\d)/)?.[1];
      const r = await this.tool('log_mood', { mood, energy: energy ? +energy : undefined });
      return r.ok ? { sym: 'r.mood.log', vars: { mood, energyText: energy ? `, energy ${energy}/5` : '' }, topic: 'feelings' } : fail(r.result);
    };
    H['memory.remember'] = async h => {
      const body = restoreCase(strip(h.text, /^(please )?(remember|save to memory|do not forget|never forget|note that)( that| this|:)?\b/), h.raw);
      if (!body) return { sym: 'r.note.ask', pending: { kind: 'slot', intent: 'memory.remember', slot: 'fact', utter: 'remember that', raw: 'remember that' }, quiet: true };
      const learned = learnFacts(normalize(body).text, body, now());
      if (learned.length) { await this.storeFacts(learned); return { sym: 'r.memory.remember', vars: { fact2: learned.map(l => l.echo).join(', and ') }, topic: 'memory' }; }
      const fact = thirdPerson(body);
      const r = await this.tool('remember', { fact, kind: 'fact', importance: 4 });
      return r.ok ? { sym: 'r.memory.remember', vars: { fact2: secondPerson(fact) }, topic: 'memory' } : fail(r.result);
    };
    H['memory.recall'] = async h => {
      const p = this.host.profile();
      const t = h.text;
      if (/\b(what is my name|who am i)\b/.test(t)) return p.userName ? { sym: 'r.memory.recall', vars: { answer: `You are ${p.userName}` } } : { sym: 'r.memory.recall.none', pending: { kind: 'profile', key: 'name' } };
      if (/\bwhat do you (know|remember) about me\b|\btell me what you know\b/.test(t)) {
        const hits = this.host.memoryTop ? await this.host.memoryTop(12) : await this.host.memorySearch('user', 12);
        if (!hits.length) return { sym: 'r.memory.recall.none' };
        return { sym: 'r.memory.about', vars: { list: hits.slice(0, 10).map(x => `• ${capFirst(secondPerson(x.text))}`).join('\n') }, quiet: true, topic: 'memory' };
      }
      if (/\bwhen is my birthday\b/.test(t) && this.inner.birthday) {
        const [m, d] = this.inner.birthday.split('-').map(Number);
        return { sym: 'r.memory.recall', vars: { answer: `Your birthday is ${new Date(2000, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}` } };
      }
      const q = recallQuery(t.replace(/^what do you (know|remember) about /, ''));
      const hits = await this.host.memorySearch(q, 3);
      const best = hits.find(x => x.score > 0.32);
      if (!best) return { sym: 'r.memory.recall.none', pending: { kind: 'profile', data: { q: q.replace(/user's/g, 'User’s') } }, topic: 'memory' };
      const extra = hits.filter(x => x !== best && x.score > best.score * 0.85).slice(0, 1);
      const uniq = [...new Map([best, ...extra].map(x => [secondPerson(x.text).toLowerCase(), x])).values()];
      return { sym: 'r.memory.recall', vars: { answer: uniq.map(x => capFirst(secondPerson(x.text))).join('. ') }, topic: 'memory' };
    };
    H['memory.forget'] = async h => {
      const q = strip(h.text, /^(please )?(forget|delete|erase|remove)( that| the| my| what i said about| about)?( memory| memories)?( about| of)?\b/) || this.lastUser;
      const r = await this.tool('forget', { query: q });
      return { sym: 'r.memory.forget', vars: { result: r.result }, quiet: true };
    };
    H['memory.list'] = async () => { const r = await this.tool('list_memories', {}); return { sym: 'r.memory.list', vars: { result: cleanList(r.result) }, quiet: true }; };

    // ---------------- goals
    H['goal.add'] = async h => {
      const title = capFirst(restoreCase(strip(h.ent.rest, /^(please )?(add|new|set|create)( a| an)?( new)? goal( to| of| called|:)?\b|^my goal is( to)?\b/), h.raw));
      if (!title) return { sym: 'r.journal.ask', pending: { kind: 'slot', intent: 'goal.add', slot: 'title', utter: 'new goal', raw: 'new goal' }, quiet: true };
      const r = await this.tool('add_goal', { title, target_date: h.ent.date });
      return r.ok ? { sym: 'r.goal.add', vars: { title }, topic: 'goals' } : fail(r.result);
    };
    H['goal.list'] = async () => { const r = await this.tool('list_goals', {}); return { sym: 'r.goal.list', vars: { result: r.result }, quiet: true }; };

    // ---------------- phone & comms
    H['phone.open'] = async h => {
      const rawApp = strip(h.text, /^(please )?(can you )?(open|launch|start|run)( up)?( the| my)?\b|\b(app|application|for me|please)\b/g);
      const app = APP_CASE[rawApp.toLowerCase()] ?? capFirst(restoreCase(rawApp, h.raw));
      if (/^settings?$/i.test(app)) return H['phone.settings']({ ...h, text: 'main settings' });
      if (/\.[a-z]{2,}$/i.test(app)) { const r = await this.tool('open_url', { url: /^https?:/.test(app) ? app : `https://${app}` }); return r.ok ? { sym: 'r.phone.done', vars: { what: `Opening ${app}.` } } : fail(r.result); }
      const r = await this.tool('open_app', { name: app });
      return r.ok && !/not found|could not|no app/i.test(r.result) ? { sym: 'r.phone.open', vars: { app }, topic: 'phone' } : { sym: 'r.phone.open.fail', vars: { app, result: r.result } };
    };
    H['phone.torch'] = async h => {
      const on = h.ent.onOff ?? !/\boff\b/.test(h.text);
      const r = await this.tool('flashlight', { on });
      return r.ok ? { sym: 'r.phone.torch', vars: { state: on ? 'on' : 'off', result: '' } } : fail(r.result);
    };
    H['phone.battery'] = async () => { const r = await this.tool('battery_status', {}); return { sym: 'r.phone.battery', vars: { result: r.result } }; };
    H['phone.settings'] = async h => {
      const page = (['wifi', 'bluetooth', 'display', 'sound', 'battery', 'location', 'apps', 'notifications', 'airplane'] as const).find(p => h.text.replace('wi fi', 'wifi').replace('notification', 'notifications').includes(p)) ?? 'main';
      const r = await this.tool('open_settings', { page });
      return r.ok ? { sym: 'r.phone.settings', vars: { page: page === 'main' ? 'the' : page, result: '' } } : fail(r.result);
    };
    H['comm.call'] = async h => {
      if (h.ent.phone) { const r = await this.tool('dial_number', { number: h.ent.phone }); return { sym: 'r.comm.call', vars: { result: r.result, who: h.ent.phone } }; }
      const who = strip(h.text, /^(please )?(call|phone|dial|ring)( up)?\b/);
      const r = await this.tool('find_contact', { name: who });
      const num = r.result.match(/\+?\d[\d\s-]{6,}\d/)?.[0];
      if (num) { const d = await this.tool('dial_number', { number: num.replace(/[\s-]/g, '') }); return { sym: 'r.comm.call', vars: { result: d.result, who } }; }
      return { sym: 'r.comm.call', vars: { result: r.result, who } };
    };
    H['comm.text'] = async h => {
      const m = h.raw.match(/^(?:please\s+)?(?:text|sms|message|whatsapp|send (?:a )?(?:message|text|sms) to)\s+(.+?)(?:\s+(?:saying|that|to say)\s+|:\s*|\s{1})(.+)$/i);
      let number = h.ent.phone, body = m?.[2] ?? '';
      if (!number && m) {
        const r = await this.tool('find_contact', { name: m[1] });
        number = r.result.match(/\+?\d[\d\s-]{6,}\d/)?.[0]?.replace(/[\s-]/g, '');
        if (!number) return { sym: 'r.comm.text', vars: { result: r.result } };
      }
      if (!number) return { sym: 'r.comm.text', vars: { result: 'Who should I text, and what should it say?' } };
      const r = await this.tool('draft_sms', { number, body: body.replace(/^\d[\d\s-]+/, '').trim() });
      return { sym: 'r.comm.text', vars: { result: r.result } };
    };
    H['comm.email'] = async h => { const r = await this.tool('compose_email', { to: h.ent.email ?? '' }); return { sym: 'r.comm.email', vars: { result: r.result } }; };
    H['calendar.add'] = async h => {
      const title = capFirst(restoreCase(cleanTitle(strip(h.ent.rest, /^(please )?(add|schedule|create|put|book|set up)( a| an)?( new)?\b|\b(on|to|in) my calendar\b|\bcalendar\b|\bevent( called)?\b/g)), h.raw)) || 'Event';
      if (!h.ent.at && !h.ent.date) return { sym: 'r.reminder.ask.when', pending: { kind: 'slot', intent: 'calendar.add', slot: 'when', utter: `add ${title.toLowerCase()} to my calendar`, raw: `add ${title} to my calendar` }, quiet: true };
      const at = h.ent.at ?? new Date(h.ent.date + 'T09:00');
      const r = await this.tool('add_calendar_event', { title, start: `${ymd(at)} ${fmtHm(at)}`, duration_min: h.ent.minutes ?? 60 });
      return r.ok ? { sym: 'r.calendar.add', vars: { title, when: fmtWhen(at, now()), result: r.result }, topic: 'calendar' } : fail(r.result);
    };
    H['calendar.read'] = async () => { const r = await this.tool('read_calendar', {}); return { sym: 'r.calendar.read', vars: { result: r.result }, quiet: true }; };

    // ---------------- info
    H['info.time'] = async () => ({ sym: 'r.info.time' });
    H['info.date'] = async h => (/\bmonth\b/.test(h.text) ? { text: `It is ${now().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}.` } : /\byear\b/.test(h.text) ? { text: `It is ${now().getFullYear()}.` } : { sym: 'r.info.date' });
    H['info.calc'] = async h => {
      const [expr, label] = toExpr(h.text);
      if (!expr) return { sym: 'r.info.calc.fail' };
      try {
        const v = calculate(expr);
        if (!Number.isFinite(v)) throw new Error('nan');
        return { sym: 'r.info.calc', vars: { expr: label || expr.replace(/\*/g, ' × ').replace(/\//g, ' ÷ ').replace(/\^/g, '^'), value: fmtNum(v) } };
      } catch { return { sym: 'r.info.calc.fail' }; }
    };
    H['info.convert'] = async h => {
      const m = h.text.match(/(-?\d+(?:\.\d+)?)\s*([a-z°/]+(?: [a-z]+)?)\s+(?:to|in|into)\s+([a-z°/]+)/) ?? h.text.match(/how many ([a-z]+) (?:in|per) (?:a |an |one )?(\d+(?:\.\d+)? )?([a-z]+)/);
      if (!m) return { sym: 'r.info.convert.fail' };
      let value: number, from: string, to: string;
      if (/^how many/.test(m[0])) { value = parseFloat(m[2] ?? '1') || 1; from = m[3]; to = m[1]; } else { value = parseFloat(m[1]); from = m[2]; to = m[3]; }
      const unit = (u: string) => u.replace(/^degrees? /, '').replace(/s$/, '').replace(/^(litre|liter)$/, 'l').trim();
      for (const [f, t] of [[from, to], [unit(from), unit(to)], [from, unit(to)], [unit(from), to]]) {
        try { const out = convertUnits(value, f, t); return { sym: 'r.info.convert', vars: { value: fmtNum(value), from, to, out: fmtNum(out) } }; } catch { /* try next */ }
      }
      return { sym: 'r.info.convert.fail' };
    };
    H['info.days'] = async h => ({ sym: 'r.info.days', vars: { answer: daysAnswer(h.text, h.ent, now(), this.inner.birthday) } });
    H['info.library'] = async h => {
      const q = strip(h.text, /^(what does|according to|search|look in|find in)( my| the)?( documents?| docs| files| library| notes)?( for| say about| say)?\b/) || h.text;
      const hits = await this.host.librarySearch(q).catch(() => []);
      if (!hits[0]) return { sym: 'r.info.library.none' };
      return { sym: 'r.info.library', vars: { doc: hits[0].doc, snippet: bestSentence(hits[0].text, q) }, topic: 'docs', quiet: true };
    };
    // ---------------- device skills
    const enc = encodeURIComponent;
    H['phone.navigate'] = async h => {
      const dest = restoreCase(strip(h.text, /^(please )?(navigate|directions|take me|drive me|route|how do i get|show me the way|open maps)( to)?\b/), h.raw);
      if (!dest) return { sym: 'r.reminder.ask.what' };
      const r = await this.tool('open_url', { url: `https://www.google.com/maps/dir/?api=1&destination=${enc(dest)}` });
      return r.ok ? { sym: 'r.phone.done', vars: { what: `Opening directions to ${dest}.` } } : fail(r.result);
    };
    H['phone.play'] = async h => {
      const spotify = /\bspotify\b/.test(h.text);
      let q = strip(h.text, /^(please )?(play|put on|search|find)( some| me)?\b|\b(on|in) (youtube|spotify)\b|\b(youtube|spotify)( for)?\b/g);
      if (!q || /^(some )?(music|songs?)$/.test(q)) q = this.host.profile().likes || 'relaxing music';
      const url = spotify ? `https://open.spotify.com/search/${enc(q)}` : `https://www.youtube.com/results?search_query=${enc(q)}`;
      const r = await this.tool('open_url', { url });
      return r.ok ? { sym: 'r.phone.done', vars: { what: `Playing ${restoreCase(q, h.raw)} on ${spotify ? 'Spotify' : 'YouTube'}.` }, topic: 'fun' } : fail(r.result);
    };
    H['phone.share'] = async () => {
      const last = this.ds.lastBot;
      if (!last) return { sym: 'r.chat.test' };
      const r = await this.tool('share_text', { text: last });
      return r.ok ? { sym: 'r.phone.done', vars: { what: 'Share sheet is open.' } } : fail(r.result);
    };
    H['phone.copy'] = async () => {
      const last = this.ds.lastBot ?? '';
      const r = await this.tool('clipboard_write', { text: last });
      return r.ok ? { sym: 'r.phone.done', vars: { what: 'Copied to your clipboard.' } } : fail(r.result);
    };
    H['phone.paste'] = async () => { const r = await this.tool('clipboard_read', {}); return { text: r.result, quiet: true }; };

    // ---------------- wellbeing
    H['well.checkin'] = async () => ({ sym: 'r.well.checkin', pending: { kind: 'slot', intent: 'mood.log', slot: 'mood', utter: 'my mood is', raw: 'my mood is' }, quiet: true, topic: 'feelings' });
    H['well.screen'] = async h => {
      const t = h.text;
      const kind: ScreenKind = /\bphq ?9|full depression\b/.test(t) ? 'phq9' : /\bgad ?7|full anxiety\b/.test(t) ? 'gad7' : /\banxi/.test(t) ? 'gad2' : 'phq2';
      const then: ScreenKind | undefined = kind === 'phq2' && !/\bdepress/.test(t) ? 'gad2' : undefined;
      return { sym: 'r.well.screen.start', vars: { name: scrName(kind), item: ITEMS[kind][0], scale: SCALE }, pending: { kind: 'screen', data: { kind, answers: [], then } }, quiet: true, topic: 'feelings' };
    };
    H['well.report'] = async () => ({ sym: 'r.well.report', vars: { report: [trendReport(this.host.moodHistory?.() ?? [], this.inner.userMood, (this.inner.screens ?? []) as ScreenResult[], now().getTime()), ...healthInsights(this.host.senseDays?.() ?? [], this.host.moodHistory?.() ?? [])].join(' ') }, quiet: true, topic: 'feelings' });
    H['health.sleep'] = async h => {
      const days = this.host.senseDays?.() ?? [];
      if (!days.length) return { sym: 'r.health.off' };
      const d = /\byesterday|night before\b/.test(h.text) ? days[1] : days[0];
      const line = sleepLine(d) || sleepLine(days[1]);
      if (!line) return { text: this.say('r.health.off') };
      const h0 = sleepOf(d) ?? sleepOf(days[1]) ?? 0;
      return { sym: 'r.health', vars: { body: `You slept ${line}.`, short: h0 < 6.5 ? 1 : 0 }, topic: 'sleep' };
    };
    H['health.steps'] = async h => {
      const days = this.host.senseDays?.() ?? [];
      if (!days.length || days[0].steps === undefined) return { sym: 'r.health.off' };
      const d = /\byesterday\b/.test(h.text) ? days[1] : days[0];
      const steps = d?.steps ?? 0;
      const km = (steps * 0.00075).toFixed(1);
      return { sym: 'r.health', vars: { body: `${/\byesterday\b/.test(h.text) ? 'Yesterday' : 'Today'}: ${steps.toLocaleString()} steps, roughly ${km} km.`, lowSteps: steps < 4000 && now().getHours() >= 15 ? 1 : 0 }, topic: 'fitness' };
    };
    H['health.screen'] = async h => {
      const days = this.host.senseDays?.() ?? [];
      if (!days.length) return { sym: 'r.health.off' };
      let body = todayHealth(days[0], undefined) || 'No screen data for today yet.';
      if (this.host.usage && /\bapps?\b|most|which/.test(h.text)) {
        try {
          const u = await this.host.usage(0);
          body = `Today: ${Math.round(u.totalMinutes / 6) / 10} h total. Top apps: ${u.apps.slice(0, 4).map(a => `${a.app} ${a.minutes}m`).join(', ')}.`;
        } catch { body += ' (Grant usage access in Health & senses to see per-app time.)'; }
      }
      return { sym: 'r.health', vars: { body, highScreen: (days[0].screenOnMs ?? 0) > 5 * 3600_000 ? 1 : 0 }, quiet: true, topic: 'phone' };
    };
    H['health.report'] = async () => {
      const days = this.host.senseDays?.() ?? [];
      const ins = healthInsights(days, this.host.moodHistory?.() ?? []);
      const body = [todayHealth(days[0], days[1]), ...ins].filter(Boolean).join(' ');
      return body ? { sym: 'r.health', vars: { body }, quiet: true, topic: 'fitness' } : { sym: 'r.health.off' };
    };
    H['well.help'] = async () => ({ sym: 'r.well.help', vars: { help: helpText(this.host.country?.()) }, quiet: true, topic: 'feelings' });

    H['info.web'] = async h => this.research(h.raw, h.text);
    H['research.ask'] = async h => this.research(h.raw, h.text);

    // ---------------- conversation memory & time
    const winText = (w?: { label: string }) => (w ? ` ${w.label}` : '');
    const quote = (e: Episode) => { const t = e.text.replace(/"/g, "'").replace(/\s+/g, ' '); return `“${t.length > 160 ? t.slice(0, 157) + '…' : t}”`; };
    H['mind.said'] = async h => {
      const nowMs = now().getTime();
      const win = windowOf(h.text, nowMs);
      const about = h.text.match(/\b(?:about|regarding|on the subject of|re) (.+?)(?: earlier| before| yesterday| today| this morning| last night| \d+ \w+ ago| an? \w+ ago)?$/)?.[1]
        ?? h.text.match(/\bdid i (?:say|tell you|mention)(?: anything)?(?: about)? (.+?)(?: earlier| yesterday| before)?$/)?.[1] ?? '';
      const hits = this.episodic.search(about, { who: 'user', win, skipLast: 1, k: about ? 3 : 2 });
      if (!hits.length) return { sym: 'r.mind.said.none', vars: { kw: about || 'that', when: winText(win) }, quiet: true };
      const found = hits.map(e => `${capFirst(ago(e.t, nowMs))} you said ${quote(e)}`).join('\n');
      return { sym: 'r.mind.said', vars: { found }, quiet: true };
    };
    H['mind.yousaid'] = async h => {
      const nowMs = now().getTime();
      const win = windowOf(h.text, nowMs);
      const about = h.text.match(/\babout (.+?)(?: earlier| before| yesterday| today)?$/)?.[1] ?? '';
      const hits = this.episodic.search(about, { who: 'jarvis', win, skipLast: 0, k: about ? 2 : 1 });
      if (!hits.length) return { sym: 'r.mind.said.none', vars: { kw: about || 'that', when: winText(win) }, quiet: true };
      return { sym: 'r.mind.yousaid', vars: { found: hits.map(e => `${capFirst(ago(e.t, nowMs))} I said ${quote(e)}`).join('\n') }, quiet: true };
    };
    H['mind.asked'] = async h => {
      const nowMs = now().getTime();
      const win = windowOf(h.text, nowMs);
      const about = h.text.match(/\babout (.+?)(?: earlier| before| today| yesterday)?$/)?.[1] ?? '';
      let qs = this.episodic.episodes.slice(0, -1).filter(e => e.who === 'user' && !/^mind\./.test(e.intent ?? '') && (!win || (e.t >= win.from && e.t <= win.to)) && (/\?\s*$/.test(e.text) || normalize(e.text).question));
      if (about) { const hits = new Set(this.episodic.search(about, { who: 'user', win, skipLast: 1, k: 6 })); qs = qs.filter(e => hits.has(e)); }
      qs = qs.slice(-3).reverse();
      if (!qs.length) return { sym: 'r.mind.said.none', vars: { kw: 'questions', when: winText(win) }, quiet: true };
      return { sym: 'r.mind.said', vars: { found: qs.map(e => `${capFirst(ago(e.t, nowMs))} you asked ${quote(e)}`).join('\n') }, quiet: true };
    };
    H['mind.topic'] = async h => {
      const nowMs = now().getTime();
      const win = windowOf(h.text, nowMs) ?? { from: nowMs - 6 * 3600_000, to: nowMs, label: '' };
      const lastUser = this.episodic.episodes.slice(0, -1).filter(e => e.who === 'user' && e.t >= win.from && e.t <= win.to);
      const topics = this.episodic.topics(win).filter(t => !['greeting', 'memory'].includes(t.topic)).slice(0, 4);
      if (!lastUser.length) return { sym: 'r.mind.topic.none', vars: { when: winText(win.label ? win : undefined) }, quiet: true };
      const last = lastUser[lastUser.length - 1];
      const found = `${topics.length ? `We covered ${listify(topics.map(t => `${t.topic} (${ago(t.t, nowMs)})`))}. ` : ''}The last thing you said, ${ago(last.t, nowMs)}, was ${quote(last)}`;
      return { sym: 'r.mind.topic', vars: { found }, quiet: true };
    };
    H['mind.source'] = async h => {
      const r = this.lastResearch;
      if (!r) return { sym: 'r.mind.source.none', quiet: true };
      if (/\bopen\b/.test(h.text) && r.url) { const o = await this.tool('open_url', { url: r.url }); return o.ok ? { sym: 'r.phone.done', vars: { what: `Opening ${r.source}.` } } : fail(o.result); }
      return { sym: 'r.mind.source', vars: { q: r.q, source: r.source, url: r.url ?? '', ago: ago(r.t, now().getTime()), cached: r.cached ? 1 : 0 }, quiet: true, topic: 'web' };
    };
    H['mind.when'] = async h => {
      const nowMs = now().getTime();
      if (/\bfirst (talk|speak|meet)|how long have you known me\b/.test(h.text)) {
        return { sym: 'r.mind.when', vars: { found: `We first spoke ${ago(this.inner.firstSeen, nowMs)}; that is ${span(nowMs - this.inner.firstSeen)} and ${this.inner.turns} message${this.inner.turns === 1 ? '' : 's'} ago.` } };
      }
      if (/how long (have we been talking|has this)/.test(h.text)) {
        const start = this.episodic.firstSince(45 * 60_000, nowMs) ?? nowMs;
        return { sym: 'r.mind.when', vars: { found: nowMs - start < 90_000 ? 'We only just started, a minute or so ago.' : `This conversation started ${ago(start, nowMs)}; ${span(nowMs - start)} so far.` } };
      }
      if (/last talk(ed)? to you\b/.test(h.text)) {
        const prev = this.inner.lastSeenPrev;
        return { sym: 'r.mind.when', vars: { found: prev ? `Before this, you last spoke to me ${ago(prev, nowMs)}.` : 'This is our first chat today.' } };
      }
      const about = h.text.match(/\b(?:about|mention(?:ed)?|ask(?:ed)? about|tell you about) (.+)$/)?.[1] ?? '';
      const hit = this.episodic.search(about, { who: 'user', skipLast: 1, k: 1 })[0];
      return hit ? { sym: 'r.mind.when', vars: { found: `You last mentioned ${about || 'that'} ${ago(hit.t, nowMs)}: ${quote(hit)}` } } : { sym: 'r.mind.said.none', vars: { kw: about || 'that', when: '' } };
    };

    // ---------------- persona
    H['persona.adjust'] = async h => {
      const t = h.text;
      const less = /\b(less|stop|no|not so|tone it down|fewer|quieter|shorter)\b/.test(t);
      const d = /\b(way|much|a lot|super|very)\b/.test(t) ? 35 : 20;
      const map: [RegExp, string, number, string][] = [
        [/funn|joke|humou?r|laugh/, 'humor', less ? -d : d, less ? 'Fewer jokes.' : 'Funnier it is.'],
        [/serious/, 'humor', less ? d : -d, less ? 'Lightening up.' : 'Serious mode.'],
        [/sarcas|roast|savage|sass/, 'sarcasm', less ? -d : d, less ? 'Less sarcasm.' : 'More sarcasm. You asked for it.'],
        [/formal|polite|proper/, 'formality', less ? -d : d, less ? 'Relaxing the formality.' : 'More formal, as you wish.'],
        [/casual|chill|relaxed/, 'formality', less ? d : -d, less ? 'A touch more formal.' : 'Keeping it casual.'],
        [/blunt|direct|honest|harsh/, 'directness', less ? -d : d, less ? 'Gentler with the truth.' : 'Blunter. No sugar-coating.'],
        [/nicer|kind|warm|sweet/, 'warmth', less ? -d : d, less ? 'Cooler.' : 'Warmer.'],
        [/gentl|soft/, 'toughLove', less ? d : -d, less ? 'Firmer.' : 'Gentler.'],
        [/tough|strict|push me|harder/, 'toughLove', less ? -d : d, less ? 'Easing off.' : 'Pushing you harder.'],
        [/talk less|shorter|brief|concise|less wordy|terse/, 'verbosity', -d, 'Shorter answers.'],
        [/detail|longer|explain more|talk more/, 'verbosity', less ? -d : d, less ? 'Shorter answers.' : 'More detail.'],
        [/energ|hype|excited|enthusias/, 'enthusiasm', less ? -d : d, less ? 'Calmer.' : 'More energy!'],
        [/calm/, 'enthusiasm', less ? d : -d, 'Calmer.'],
        [/curious|ask me more|questions/, 'curiosity', less ? -d : d, less ? 'Fewer questions.' : 'More curious.'],
        [/proactive|initiative|suggest/, 'proactivity', less ? -d : d, less ? 'I will wait for you.' : 'More proactive.'],
        [/playful|fun/, 'playfulness', less ? -d : d, less ? 'More focused.' : 'More playful.'],
        [/empath|emotional|feelings/, 'emotional', less ? -d : d, less ? 'More practical.' : 'More emotionally attuned.'],
      ];
      const changes: string[] = [];
      if (/emoji/.test(t)) { await this.tool('set_personality', { emoji: /\bno\b|stop|less|without/.test(t) ? 'none' : /lots|more|tons/.test(t) ? 'lots' : 'some' }); changes.push(/\bno\b|stop|less/.test(t) ? 'No more emoji.' : 'Emoji on.'); }
      if (/tone it down/.test(t)) { await this.tool('set_personality', { trait: 'enthusiasm', delta: -20 }); await this.tool('set_personality', { trait: 'sarcasm', delta: -15 }); changes.push('Toning it down.'); }
      for (const [re, trait, delta, label] of map) {
        if (!re.test(t) || changes.length >= 2) continue;
        const r = await this.tool('set_personality', { trait, delta });
        if (r.ok) changes.push(label);
      }
      if (!changes.length) return { text: this.say('persona.unknown') };
      return { sym: 'r.persona.adjust', vars: { change: changes.join(' ') }, topic: 'jarvis' };
    };
    H['persona.name'] = async h => {
      const p = this.host.profile();
      let m: RegExpMatchArray | null;
      if ((m = h.text.match(/^(?:my name is|i am called) ([a-z][a-z' -]{1,30})$/))) {
        const n = capFirst(restoreCase(m[1], h.raw));
        await this.host.updateProfile({ userName: n });
        await this.host.memoryAdd(`User's name is ${n}`, 'fact', 5);
        if (!this.inner.known.includes('name')) this.inner.known.push('name');
        return { sym: 'r.persona.username', vars: { uname: n } };
      }
      if ((m = h.text.match(/\b(?:your (?:new )?name is|i will call you|rename yourself(?: to)?|call yourself) ([a-z][a-z' -]{1,20})$/))) {
        const n = capFirst(restoreCase(m[1], h.raw));
        const r = await this.tool('set_personality', { name: n });
        return { sym: 'r.persona.name', vars: { result: r.ok ? `${n} it is. I rather like it.` : r.result } };
      }
      if (/stop calling me|call me by my name|use my name/.test(h.text)) {
        const hon = p.userName || 'friend';
        const r = await this.tool('set_personality', { honorific: hon });
        return { sym: 'r.persona.name', vars: { result: r.ok ? `Understood. ${hon} it is.` : r.result } };
      }
      if ((m = h.text.match(/^(?:please )?call me ([a-z][a-z' -]{0,24})$/))) {
        const hon = restoreCase(m[1], h.raw);
        const r = await this.tool('set_personality', { honorific: hon });
        return { sym: 'r.persona.name', vars: { result: r.ok ? `Very well, ${hon}.` : r.result } };
      }
      return { sym: 'r.chat.who' };
    };

    // ---------------- meta & stateful fun
    H['meta.teach'] = async () => {
      const t = this.lastActionable;
      return { sym: 'r.meta.teach', pending: { kind: 'teach', utter: t?.text ?? this.lastUser, raw: t?.raw ?? this.lastUser }, quiet: true };
    };
    H['meta.complaint'] = async () => {
      const t = this.lastActionable;
      const meaning = t ? (t.intent === 'fallback' ? 'something I had no good answer for' : LABEL[t.intent] ?? (/^(chat|feel|fun|advice)\./.test(t.intent) ? 'small talk' : t.intent.replace('.', ' '))) : '';
      return { sym: 'r.meta.complaint', vars: { utter: t ? t.raw.replace(/[?!.\s]+$/, '') : '', meaning }, pending: t ? { kind: 'teach', utter: t.text, raw: t.raw } : undefined, quiet: true, topic: 'jarvis' };
    };
    H['chat.insult'] = async () => {
      const t = this.lastActionable;
      return { sym: 'r.chat.insult', pending: t ? { kind: 'teach', utter: t.text, raw: t.raw } : undefined, quiet: true };
    };
    H['meta.stop'] = async () => ({ sym: 'r.meta.stop', quiet: true });
    H['chat.repeat'] = async () => (this.ds.lastBot ? { sym: 'r.chat.repeat', quiet: true } : { sym: 'r.chat.test', quiet: true });
    H['fun.another'] = async () => (this.ds.lastContentSym ? { sym: this.ds.lastContentSym, content: this.ds.lastContentSym } : { sym: 'r.fun.joke', content: 'r.fun.joke' });
    H['fun.riddle'] = async () => {
      const avail = RIDDLES.map((_, i) => i).filter(i => !this.riddleIdx.includes(i));
      const i = (avail.length ? avail : RIDDLES.map((_, j) => j))[Math.floor(Math.random() * (avail.length || RIDDLES.length))];
      this.riddleIdx = [...this.riddleIdx.slice(-15), i];
      return { sym: 'riddle.ask', vars: { q: RIDDLES[i].q }, pending: { kind: 'riddle', data: { i, tries: 0 } }, quiet: true, content: 'r.fun.riddle' };
    };
    H['chat.opinion'] = async h => {
      const m = h.text.match(/\b(?:about|of|on|think of) (.{2,50})$/) ?? h.text.match(/^do you (?:like|love|enjoy|hate|dislike)(?: eating| playing| watching| listening to)? (.{2,40})$/) ?? h.text.match(/^(?:is|are) (.{2,40}) (?:good|bad|great|overrated)$/);
      return m ? { sym: 'r.chat.likes', vars: this.likes(m[1].replace(/\b(my|your)\b/g, w => (w === 'my' ? 'your' : 'my'))) } : { sym: 'r.chat.likes', vars: this.likes('that') };
    };
    H['chat.favourite'] = async h => {
      const m = h.text.match(/^do you (?:like|love|enjoy|hate|dislike)(?: eating| playing| watching| listening to)? (.{2,40})$/);
      return m ? { sym: 'r.chat.likes', vars: this.likes(m[1]) } : { sym: 'r.chat.favourite', vars: opinion(this.inner.seed, h.text) };
    };
    H['fun.dice'] = async h => {
      const range = h.text.match(/between (\d+) and (\d+)/);
      const sides = Number(h.text.match(/\bd(\d+)\b/)?.[1] ?? 6);
      const two = /\btwo dice\b/.test(h.text);
      const roll = range ? +range[1] + Math.floor(Math.random() * (+range[2] - +range[1] + 1))
        : two ? `${1 + Math.floor(Math.random() * 6)} and ${1 + Math.floor(Math.random() * 6)}` : 1 + Math.floor(Math.random() * sides);
      return { sym: 'r.fun.dice', vars: { roll } };
    };
    H['fun.choose'] = async h => {
      const body = h.raw.replace(/^.*?\b(between|choose|pick|decide|should i|which one|which is better)\b[:,]?\s*/i, '').replace(/[?.!]+$/, '');
      const opts = body.split(/\s*,\s*|\s+or\s+/i).map(s => s.replace(/^(get|have|go with|do|a|an|the)\s+/i, '').trim()).filter(Boolean);
      if (opts.length < 2) return { sym: 'r.fun.8ball' };
      return { sym: 'r.fun.choose', vars: { choice: capFirst(opts[Math.floor(Math.random() * opts.length)]) } };
    };
    H['chat.laugh'] = async () => ({ sym: 'r.chat.laugh', vars: { afterContent: this.ds.lastIntent && CONTENT.has(this.ds.lastIntent) ? 1 : 0 } });
    H['chat.greet'] = async () => ({ sym: 'r.chat.greet', topic: 'greeting' });
    H['chat.yes'] = async () => ({ sym: this.ds.lastIntent && CONTENT.has(this.ds.lastIntent) && this.ds.lastContentSym ? this.ds.lastContentSym : 'r.chat.yes' });
  }
}

// ================================================================== helpers
const fmtHm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const listify = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const fmtNum = (v: number) => (Math.abs(v) >= 1e6 || Number.isInteger(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 4 }) : v.toLocaleString(undefined, { maximumFractionDigits: 4 }));
const durText = (m: number, s: number) => {
  const h = Math.floor(m / 60), mm = Math.floor(m % 60), ss = s + Math.round((m % 1) * 60);
  return [h && `${h} hour${h > 1 ? 's' : ''}`, mm && `${mm} minute${mm > 1 ? 's' : ''}`, ss && `${ss} second${ss > 1 ? 's' : ''}`].filter(Boolean).join(' ') || 'a moment';
};
const cleanList = (s: string) => s.replace(/\s*\[id [\w-]+\]/g, '');
const keyPhrase = (t: string) => contentWords(t).filter(w => !/^(what|who|how|why|when|where|which|tell|know|think|about|like|thing|something|anything|get|got|make|go)$/.test(w)).slice(-3).join(' ') || 'that';

/** First/second person → third person for memory ("my car is blue" → "User's car is blue"). */
function thirdPerson(s: string): string {
  return capFirst(` ${s} `.replace(/\bmy\b/gi, "User's").replace(/\bI am\b|\bI'm\b/gi, 'User is').replace(/\bI\b/g, 'User').replace(/\bme\b/gi, 'User').replace(/\bmine\b/gi, "User's").trim());
}
/** "call my mom" → "call your mom" for spoken confirmations. */
function youify(s: string): string {
  return ` ${s.charAt(0).toLowerCase()}${s.slice(1)} `.replace(/\bmy\b/gi, 'your').replace(/\bI\b/g, 'you').replace(/\bme\b/gi, 'you').replace(/\bmine\b/gi, 'yours').replace(/\bmyself\b/gi, 'yourself').trim();
}

/** Restores the user's original casing for words in a normalised span. */
function restoreCase(span: string, raw: string): string {
  if (!span) return span;
  const rawWords = raw.split(/\s+/).map(w => w.replace(/^[^\w@+]+|[^\w@.]+$/g, ''));
  const byLower = new Map<string, string>();
  for (const w of rawWords) if (w && !byLower.has(w.toLowerCase())) byLower.set(w.toLowerCase(), w);
  return span.split(' ').map(w => { const o = byLower.get(w.toLowerCase()); return o && o !== o.toLowerCase() && o.length > 1 ? o : w; }).join(' ');
}

/** Spoken maths → expression for the safe calculator. */
function toExpr(t: string): [string, string] {
  let s = ` ${t} `.replace(/,(?=\d{3})/g, '');
  let m: RegExpMatchArray | null;
  if ((m = s.match(/tip (?:on|for) (\d+(?:\.\d+)?)(?: at)? (\d+(?:\.\d+)?)\s*(?:%|percent)/))) return [`${m[1]}*${m[2]}/100`, `A ${m[2]}% tip on ${m[1]}`];
  if ((m = s.match(/split (\d+(?:\.\d+)?) (?:between|among|by|in|into) (\d+)/))) return [`${m[1]}/${m[2]}`, `${m[1]} split ${m[2]} ways`];
  if ((m = s.match(/(\d+(?:\.\d+)?)\s*(?:%|percent) of (\d+(?:\.\d+)?)/))) return [`${m[1]}/100*${m[2]}`, `${m[1]}% of ${m[2]}`];
  if ((m = s.match(/(\d+(?:\.\d+)?) (?:is )?what (?:%|percent) of (\d+(?:\.\d+)?)/))) return [`${m[1]}/${m[2]}*100`, `${m[1]} as a percentage of ${m[2]}`];
  s = s.replace(/square root of (\d+(?:\.\d+)?)/g, 'sqrt($1)').replace(/sqrt (\d+(?:\.\d+)?)/g, 'sqrt($1)').replace(/(\d+(?:\.\d+)?) squared/g, '$1^2').replace(/(\d+(?:\.\d+)?) cubed/g, '$1^3')
    .replace(/to the power of/g, '^').replace(/\bplus\b|\badd\b/g, '+').replace(/\bminus\b|\bsubtract\b|\btake away\b/g, '-').replace(/\btimes\b|\bmultiplied by\b|\bx\b/g, '*')
    .replace(/\bdivided by\b|\bover\b/g, '/').replace(/\bpercent\b/g, '%');
  const expr = s.replace(/[^0-9+\-*/^%().a-z ]/g, ' ').replace(/\b(?!sqrt|pi|abs|log|ln|sin|cos|tan)[a-z]+\b/g, ' ').replace(/\s+/g, '').replace(/^[*/^+]+|[*/^+\-]+$/g, '');
  return [/\d/.test(expr) ? expr : '', ''];
}

function daysAnswer(t: string, ent: Entities, now: Date, birthday?: string): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target: Date | undefined;
  let label = '';
  const easter = (y: number) => { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return new Date(y, mo - 1, da); };
  const hol = Object.keys(HOLIDAYS).sort((a, b) => b.length - a.length).find(k => t.includes(k));
  if (/\beaster\b/.test(t)) { target = easter(now.getFullYear()); if (target < today) target = easter(now.getFullYear() + 1); label = 'Easter'; }
  else if (/\bmy birthday\b/.test(t) && birthday) { const [m, d] = birthday.split('-').map(Number); target = new Date(now.getFullYear(), m - 1, d); label = 'your birthday'; }
  else if (hol) { const [m, d] = HOLIDAYS[hol].split('-').map(Number); target = new Date(now.getFullYear(), m - 1, d); label = hol.replace(/\b\w/g, c => c.toUpperCase()); }
  else if (ent.date) { target = new Date(ent.date + 'T00:00'); label = fmtDay(target, now); }
  const fromNow = t.match(/(\d+) (day|week|month)s? (from now|from today|later)/);
  if (fromNow) {
    const d = new Date(today);
    if (fromNow[2] === 'day') d.setDate(d.getDate() + +fromNow[1]); else if (fromNow[2] === 'week') d.setDate(d.getDate() + 7 * +fromNow[1]); else d.setMonth(d.getMonth() + +fromNow[1]);
    return `${fromNow[1]} ${fromNow[2]}${+fromNow[1] > 1 ? 's' : ''} from now is ${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`;
  }
  if (!target) return /\bmy birthday\b/.test(t) ? 'I do not know your birthday yet. Tell me: "my birthday is 12 May".' : 'Which date do you mean? Try "how many days until 25 December".';
  if (/\bwhat day\b/.test(t)) return `${capFirst(label)} falls on a ${target.toLocaleDateString(undefined, { weekday: 'long' })}.`;
  const since = /\bsince\b/.test(t);
  if (!since && target < today && (hol || /birthday/.test(label))) target.setFullYear(target.getFullYear() + 1);
  const diff = Math.round((target.getTime() - today.getTime()) / 864e5);
  if (diff === 0) return `${capFirst(label)} is today!`;
  if (since || diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) === 1 ? '' : 's'} since ${label}.`;
  const weeks = diff >= 14 ? ` (about ${Math.round(diff / 7)} weeks)` : '';
  return `${diff} day${diff === 1 ? '' : 's'} until ${label}${weeks}, on a ${target.toLocaleDateString(undefined, { weekday: 'long' })}.`;
}

/** Picks the sentence of a passage that best answers the query. */
function bestSentence(passage: string, q: string): string {
  const qs = new Set(contentWords(normalize(q).text).map(stem));
  const sents = passage.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).filter(s => s.length > 20);
  let best = sents[0] ?? passage.slice(0, 240), score = -1;
  for (let i = 0; i < sents.length; i++) {
    const ws = contentWords(normalize(sents[i]).text).map(stem);
    const hit = ws.filter(w => qs.has(w)).length / Math.sqrt(ws.length + 1);
    if (hit > score) { score = hit; best = sents[i] + (sents[i + 1] && sents[i].length < 120 ? ' ' + sents[i + 1] : ''); }
  }
  return best.slice(0, 420);
}

const scrName = (k: string) => k.toUpperCase().replace(/(\d)$/, '-$1');

const APP_CASE: Record<string, string> = {
  whatsapp: 'WhatsApp', youtube: 'YouTube', tiktok: 'TikTok', linkedin: 'LinkedIn', instagram: 'Instagram', facebook: 'Facebook', spotify: 'Spotify', gmail: 'Gmail', chrome: 'Chrome',
  'google maps': 'Google Maps', maps: 'Maps', telegram: 'Telegram', twitter: 'X', x: 'X', snapchat: 'Snapchat', netflix: 'Netflix', 'play store': 'Play Store', camera: 'Camera',
  calculator: 'Calculator', calendar: 'Calendar', clock: 'Clock', notion: 'Notion', zoom: 'Zoom', teams: 'Teams', outlook: 'Outlook', drive: 'Drive', photos: 'Photos', messages: 'Messages',
};
