import { Injectable, computed, inject, signal } from '@angular/core';
import { db } from './db';
import { ProgressState, Quest, XpEvent, XpKind } from './models';
import { JarvisDevice } from './native';
import { StoreEvent, StoreService } from './store.service';
import { addDays, uid, ymd } from './util';

// ------------------------------------------------------------------ levels
/** Total XP needed to reach `level` (level 1 = 0 XP). 100, 300, 600, 1000, … */
export const xpForLevel = (level: number) => 50 * level * (level - 1);
export function levelFor(xp: number): number {
  let l = 1;
  while (xpForLevel(l + 1) <= xp) l++;
  return l;
}
const TITLES: [number, string][] = [
  [1, 'Recruit'], [3, 'Operator'], [5, 'Specialist'], [8, 'Strategist'], [12, 'Commander'],
  [16, 'Architect'], [20, 'Visionary'], [25, 'Iron Legend'], [32, 'Stark-class'],
];
export const titleFor = (level: number) => [...TITLES].reverse().find(([l]) => level >= l)?.[1] ?? 'Recruit';

// ------------------------------------------------------------------ achievements
export interface AchievementDef { id: string; name: string; icon: string; desc: string; xp: number; check: (s: ProgressStats) => boolean; }
export interface ProgressStats {
  tasksDone: number; mitsDone: number; focusMin: number; maxFocusDay: number; sessions: number; earlyFocus: boolean;
  streak: number; bestStreak: number; bestHabitStreak: number; habitsLogged: number; reviews: number; weeklyReviews: number;
  journalDays: number; goalsDone: number; milestones: number; perfectDays: number; inboxZero: number; level: number;
  plans: number; memories: number; notes: number;
}
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-task', name: 'First blood', icon: '🎯', desc: 'Complete your first task', xp: 20, check: s => s.tasksDone >= 1 },
  { id: 'tasks-10', name: 'Getting traction', icon: '⚙️', desc: 'Complete 10 tasks', xp: 40, check: s => s.tasksDone >= 10 },
  { id: 'tasks-50', name: 'Machine', icon: '🤖', desc: 'Complete 50 tasks', xp: 80, check: s => s.tasksDone >= 50 },
  { id: 'tasks-100', name: 'Centurion', icon: '🛡️', desc: 'Complete 100 tasks', xp: 150, check: s => s.tasksDone >= 100 },
  { id: 'tasks-500', name: 'Unstoppable', icon: '⚡', desc: 'Complete 500 tasks', xp: 400, check: s => s.tasksDone >= 500 },
  { id: 'mit-10', name: 'Priority sniper', icon: '🎖️', desc: 'Finish 10 Most Important Tasks', xp: 60, check: s => s.mitsDone >= 10 },
  { id: 'focus-first', name: 'In the zone', icon: '🧘', desc: 'Complete a focus session', xp: 20, check: s => s.sessions >= 1 },
  { id: 'focus-day-120', name: 'Deep diver', icon: '🌊', desc: '2 hours of focus in one day', xp: 80, check: s => s.maxFocusDay >= 120 },
  { id: 'focus-day-240', name: 'Flow state', icon: '🔥', desc: '4 hours of focus in one day', xp: 150, check: s => s.maxFocusDay >= 240 },
  { id: 'focus-10h', name: '10-hour club', icon: '⏳', desc: '10 hours of total focus', xp: 100, check: s => s.focusMin >= 600 },
  { id: 'focus-100h', name: 'Mastery path', icon: '🏔️', desc: '100 hours of total focus', xp: 500, check: s => s.focusMin >= 6000 },
  { id: 'early-bird', name: 'Early bird', icon: '🌅', desc: 'Start focusing before 8:00', xp: 40, check: s => s.earlyFocus },
  { id: 'streak-3', name: 'Warming up', icon: '✨', desc: '3-day streak', xp: 30, check: s => s.bestStreak >= 3 },
  { id: 'streak-7', name: 'One week strong', icon: '🔥', desc: '7-day streak', xp: 70, check: s => s.bestStreak >= 7 },
  { id: 'streak-30', name: 'Habit forged', icon: '⚒️', desc: '30-day streak', xp: 250, check: s => s.bestStreak >= 30 },
  { id: 'streak-100', name: 'Legendary', icon: '👑', desc: '100-day streak', xp: 800, check: s => s.bestStreak >= 100 },
  { id: 'habit-21', name: 'Rewired', icon: '🧠', desc: 'Keep one habit 21 days in a row', xp: 120, check: s => s.bestHabitStreak >= 21 },
  { id: 'habits-50', name: 'Consistency', icon: '📈', desc: 'Log habits 50 times', xp: 60, check: s => s.habitsLogged >= 50 },
  { id: 'review-first', name: 'Reflective', icon: '🪞', desc: 'Do your first review', xp: 25, check: s => s.reviews >= 1 },
  { id: 'review-weekly-4', name: 'Monthly rhythm', icon: '🗓️', desc: 'Four weekly reviews', xp: 120, check: s => s.weeklyReviews >= 4 },
  { id: 'journal-7', name: 'Dear diary', icon: '📓', desc: 'Journal on 7 different days', xp: 60, check: s => s.journalDays >= 7 },
  { id: 'journal-30', name: 'Self-aware', icon: '🔮', desc: 'Journal on 30 different days', xp: 200, check: s => s.journalDays >= 30 },
  { id: 'goal-first', name: 'Mission accomplished', icon: '🏆', desc: 'Complete a goal', xp: 150, check: s => s.goalsDone >= 1 },
  { id: 'milestones-10', name: 'Milestone maker', icon: '🪜', desc: 'Hit 10 milestones', xp: 100, check: s => s.milestones >= 10 },
  { id: 'perfect-1', name: 'Perfect day', icon: '💎', desc: 'Complete all daily quests', xp: 50, check: s => s.perfectDays >= 1 },
  { id: 'perfect-7', name: 'Flawless week', icon: '🌟', desc: '7 perfect days', xp: 200, check: s => s.perfectDays >= 7 },
  { id: 'inbox-zero', name: 'Inbox zero', icon: '📭', desc: 'Clear your inbox', xp: 30, check: s => s.inboxZero >= 1 },
  { id: 'planner', name: 'Architect of time', icon: '📐', desc: 'Plan 5 days', xp: 50, check: s => s.plans >= 5 },
  { id: 'memory-25', name: 'Known well', icon: '💾', desc: 'Jarvis remembers 25 things about you', xp: 50, check: s => s.memories >= 25 },
  { id: 'level-5', name: 'Rising', icon: '🚀', desc: 'Reach level 5', xp: 0, check: s => s.level >= 5 },
  { id: 'level-10', name: 'Elite', icon: '🦾', desc: 'Reach level 10', xp: 0, check: s => s.level >= 10 },
  { id: 'level-20', name: 'Visionary', icon: '🛰️', desc: 'Reach level 20', xp: 0, check: s => s.level >= 20 },
];

// ------------------------------------------------------------------ celebrations
export interface Celebration { id: string; kind: 'xp' | 'level' | 'achievement' | 'quest' | 'streak' | 'perfect'; title: string; detail?: string; icon: string; xp?: number; }

const DEFAULT_STATE: ProgressState = {
  id: 'main', activeDays: [], frozenDays: [], freezes: 1, bestStreak: 0, lastChecked: '', unlocked: {},
  questDate: '', quests: [], perfectDays: [],
};

/**
 * Progression: XP for real work, levels, a daily streak with freezes, three adaptive daily quests and achievements.
 * Rewards are tied to outcomes (MITs, focus, habits, reviews), never to time spent in the app.
 */
@Injectable({ providedIn: 'root' })
export class ProgressService {
  private store = inject(StoreService);

  readonly state = signal<ProgressState>(DEFAULT_STATE);
  readonly events = signal<XpEvent[]>([]);
  readonly celebrations = signal<Celebration[]>([]);
  readonly levelUp = signal<{ level: number; title: string } | null>(null);
  private ready = false;
  private memoriesCount = () => 0;

  readonly totalXp = computed(() => this.events().reduce((a, e) => a + e.xp, 0));
  readonly level = computed(() => levelFor(this.totalXp()));
  readonly title = computed(() => titleFor(this.level()));
  readonly levelProgress = computed(() => {
    const l = this.level(), xp = this.totalXp();
    const lo = xpForLevel(l), hi = xpForLevel(l + 1);
    return { into: xp - lo, need: hi - lo, pct: Math.round(((xp - lo) / (hi - lo)) * 100) };
  });
  readonly xpToday = computed(() => this.events().filter(e => e.date === this.store.today()).reduce((a, e) => a + e.xp, 0));
  readonly streak = computed(() => this.streakAt(this.store.today()));
  readonly todayActive = computed(() => this.state().activeDays.includes(this.store.today()));

  /** Live quest progress for today. */
  readonly quests = computed(() => {
    this.store.tasks(); this.store.sessions(); this.store.habits(); this.store.journal(); this.store.reviews(); this.store.plans();
    const st = this.state();
    if (st.questDate !== this.store.today()) return [] as (Quest & { progress: number })[];
    return st.quests.map(q => ({ ...q, progress: Math.min(q.target, this.questProgress(q)) }));
  });

  /** Last 12 weeks of daily XP for the heatmap (oldest first). */
  readonly heatmap = computed(() => {
    const byDate = new Map<string, number>();
    for (const e of this.events()) byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.xp);
    const out: { date: string; xp: number }[] = [];
    for (let i = 83; i >= 0; i--) { const d = addDays(this.store.today(), -i); out.push({ date: d, xp: byDate.get(d) ?? 0 }); }
    return out;
  });

  readonly weekly = computed(() => {
    const today = this.store.today();
    const range = (from: number, to: number) => { const s = new Set<string>(); for (let i = from; i <= to; i++) s.add(addDays(today, -i)); return s; };
    const cur = range(0, 6), prev = range(7, 13);
    const sum = (set: Set<string>) => ({
      xp: this.events().filter(e => set.has(e.date)).reduce((a, e) => a + e.xp, 0),
      tasks: this.store.tasks().filter(t => t.doneAt && set.has(ymd(new Date(t.doneAt)))).length,
      focus: [...set].reduce((a, d) => a + this.store.focusMinutesOn(d), 0),
      habits: this.store.habits().reduce((a, h) => a + h.log.filter(d => set.has(d)).length, 0),
      days: [...set].filter(d => this.state().activeDays.includes(d)).length,
    });
    const c = sum(cur), p = sum(prev);
    let best = { date: today, xp: -1 };
    for (const d of cur) { const xp = this.events().filter(e => e.date === d).reduce((a, e) => a + e.xp, 0); if (xp > best.xp) best = { date: d, xp }; }
    return { cur: c, prev: p, best };
  });

  readonly stats = computed<ProgressStats>(() => this.computeStats());

  async init(memoriesCount: () => number): Promise<void> {
    if (this.ready) return;
    this.memoriesCount = memoriesCount;
    const [st, events] = await Promise.all([db.progress.get('main'), db.xp.orderBy('at').toArray()]);
    this.state.set({ ...DEFAULT_STATE, ...(st ?? {}) });
    this.events.set(events);
    this.ready = true;
    this.store.on(e => { this.handle(e).catch(err => console.error(err)); });
    await this.rollover();
    setInterval(() => { this.rollover().catch(() => undefined); this.checkQuests().catch(() => undefined); }, 60_000);
  }

  // ---------------------------------------------------------------- streak
  private streakAt(day: string): number {
    const st = this.state();
    const ok = (d: string) => st.activeDays.includes(d) || st.frozenDays.includes(d);
    let d = ok(day) ? day : addDays(day, -1);
    let n = 0;
    while (ok(d)) { if (st.activeDays.includes(d)) n++; d = addDays(d, -1); }
    return n;
  }

  /** New day: spend streak freezes on missed days, generate quests. */
  private async rollover(): Promise<void> {
    const today = this.store.today();
    const st = this.state();
    if (st.lastChecked === today && st.questDate === today) return;
    const frozen = [...st.frozenDays];
    let freezes = st.freezes;
    if (st.lastChecked) {
      // walk the missed days between the last check and yesterday
      let d = addDays(st.lastChecked, 0);
      const yesterday = addDays(today, -1);
      const hadStreak = this.streakAt(st.lastChecked) > 0;
      while (d <= yesterday) {
        if (!st.activeDays.includes(d) && !frozen.includes(d) && hadStreak && d !== st.lastChecked) {
          if (freezes > 0) {
            freezes--;
            frozen.push(d);
            this.celebrate({ kind: 'streak', icon: '🧊', title: 'Streak freeze used', detail: `Your streak survived ${d}. ${freezes} left.` });
          } else break;
        }
        d = addDays(d, 1);
      }
    }
    await this.save({ ...st, lastChecked: today, frozenDays: frozen.slice(-60), freezes });
    if (this.state().questDate !== today) await this.generateQuests();
  }

  // ---------------------------------------------------------------- quests
  private async generateQuests(): Promise<void> {
    const s = this.store;
    const today = s.today();
    const seed = [...today].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
    const rand = (i: number) => ((seed * (i + 3) * 2654435761) >>> 0) / 4294967296;
    const avgFocus = s.focusHistory().slice(-7).reduce((a, d) => a + d.minutes, 0) / 7;
    const focusTarget = Math.max(25, Math.min(150, Math.round((avgFocus * 1.15) / 25) * 25 || 25));
    const pool: { q: Quest; weight: number }[] = [];
    const add = (kind: string, title: string, icon: string, target: number, xp: number, weight: number) =>
      pool.push({ q: { id: `${today}-${kind}`, kind, title, icon, target, xp, claimed: false }, weight });

    const mits = s.mits().length;
    add('mits', mits ? `Finish your ${mits} MIT${mits > 1 ? 's' : ''}` : 'Set and finish 3 MITs', '🎯', mits || 3, 40, 10);
    add('focus', `Focus for ${focusTarget} minutes`, '🧠', focusTarget, 35, 9);
    if (s.activeHabits().length) add('habits', `Log all ${s.activeHabits().length} habits`, '🔁', s.activeHabits().length, 30, 8);
    if (s.inbox().length) add('inbox', 'Triage your inbox to zero', '📥', 1, 25, 7);
    if (s.overdue().length) add('overdue', 'Finish an overdue task', '⏰', 1, 30, 7);
    add('tasks', 'Complete 3 tasks', '✅', 3, 25, 5);
    add('review', 'Do your shutdown review', '🌙', 1, 30, 4);
    add('plan', 'Plan your day', '📐', 1, 20, 4);
    add('journal', 'Write in your journal', '📓', 1, 20, 4);
    if (s.activeGoals().length) add('goal', 'Move a goal forward', '🏁', 1, 30, 6);

    // weighted pick of 3 distinct quests, deterministic for the day
    const picked: Quest[] = [];
    const left = [...pool];
    for (let i = 0; i < 3 && left.length; i++) {
      const total = left.reduce((a, p) => a + p.weight, 0);
      let r = rand(i) * total, idx = 0;
      while (idx < left.length - 1 && r > left[idx].weight) { r -= left[idx].weight; idx++; }
      picked.push(left.splice(idx, 1)[0].q);
    }
    await this.save({ ...this.state(), questDate: today, quests: picked });
  }

  private questProgress(q: Quest): number {
    const s = this.store;
    const today = s.today();
    const doneToday = s.doneToday();
    switch (q.kind) {
      case 'mits': return doneToday.filter(t => t.isMit).length;
      case 'focus': return s.focusMinutesToday();
      case 'habits': return s.activeHabits().filter(h => h.log.includes(today)).length;
      case 'inbox': return s.inbox().length === 0 ? 1 : 0;
      case 'overdue': return doneToday.filter(t => t.due && t.due < today).length;
      case 'tasks': return doneToday.length;
      case 'review': return s.reviews().some(r => r.date === today) ? 1 : 0;
      case 'plan': return s.todayPlan()?.blocks.length ? 1 : 0;
      case 'journal': return s.todayJournal() ? 1 : 0;
      case 'goal': return this.events().some(e => e.date === today && (e.kind === 'milestone' || e.kind === 'goal' || e.ref.startsWith('goaltask:'))) ? 1 : 0;
      default: return 0;
    }
  }

  async checkQuests(): Promise<void> {
    const st = this.state();
    if (st.questDate !== this.store.today()) return;
    let changed = false;
    const quests = st.quests.map(q => {
      if (q.claimed || this.questProgress(q) < q.target) return q;
      changed = true;
      return { ...q, claimed: true };
    });
    if (!changed) return;
    await this.save({ ...st, quests });
    for (const q of quests.filter((q, i) => q.claimed && !st.quests[i].claimed)) {
      await this.award(`quest:${q.id}`, 'quest', q.xp, `Quest: ${q.title}`);
      this.celebrate({ kind: 'quest', icon: q.icon, title: 'Quest complete', detail: q.title, xp: q.xp });
    }
    if (quests.length && quests.every(q => q.claimed) && !this.state().perfectDays.includes(this.store.today())) {
      await this.save({ ...this.state(), perfectDays: [...this.state().perfectDays, this.store.today()] });
      await this.award(`perfect:${this.store.today()}`, 'perfect', 50, 'Perfect day');
      this.celebrate({ kind: 'perfect', icon: '💎', title: 'Perfect day!', detail: 'All quests complete. Outstanding work, sir.', xp: 50 });
    }
  }

  // ---------------------------------------------------------------- events → XP
  private async handle(e: StoreEvent): Promise<void> {
    const today = this.store.today();
    switch (e.type) {
      case 'task_done': {
        const t = e.task;
        let xp = 10 + Math.min(20, Math.round((t.estimateMin ?? 0) / 6));
        if (t.isMit) xp += 15;
        if (t.important && t.urgent) xp += 5;
        if (t.due && t.due < today) xp += 5;
        await this.award(`task:${t.id}`, t.isMit ? 'mit' : 'task', xp, t.isMit ? `MIT done: ${t.title}` : `Done: ${t.title}`);
        if (t.goalId) await this.award(`goaltask:${t.id}`, 'goal', 10, 'Goal progress');
        break;
      }
      case 'task_undone':
        await this.revoke(`task:${e.task.id}`);
        await this.revoke(`goaltask:${e.task.id}`);
        break;
      case 'habit_logged': {
        const streak = this.store.streak(e.habit);
        const xp = 8 + Math.min(12, Math.floor(streak / 3) * 2);
        await this.award(`habit:${e.habit.id}:${e.date}`, 'habit', xp, `${e.habit.name}${streak > 1 ? ` · ${streak}-day streak` : ''}`, e.date);
        break;
      }
      case 'habit_unlogged': await this.revoke(`habit:${e.habit.id}:${e.date}`); break;
      case 'focus_done': {
        const m = Math.round(e.session.minutes);
        const xp = m + (e.session.completed ? 10 : 0) - Math.min(10, e.session.interruptions * 2);
        await this.award(`focus:${e.session.id}`, 'focus', Math.max(3, xp), `${m} min of focus`);
        break;
      }
      case 'review_saved':
        await this.award(`review:${e.review.kind}:${e.review.date}`, 'review', e.review.kind === 'weekly' ? 80 : 30, e.review.kind === 'weekly' ? 'Weekly review' : 'Shutdown review');
        break;
      case 'journal_saved':
        if (e.entry.text.trim().length >= 20 || e.entry.gratitude?.trim()) await this.award(`journal:${e.entry.date}`, 'journal', 15, 'Journal entry');
        break;
      case 'plan_saved': await this.award(`plan:${e.plan.date}`, 'plan', 15, 'Day planned'); break;
      case 'milestone_done': await this.award(`milestone:${e.milestone.id}`, 'milestone', 40, `Milestone: ${e.milestone.title}`); break;
      case 'goal_done': await this.award(`goal:${e.goal.id}`, 'goal', 150, `Goal achieved: ${e.goal.title}`); break;
      case 'inbox_zero': await this.award(`inbox:${today}`, 'inbox', 20, 'Inbox zero'); break;
    }
    await this.checkQuests();
    await this.checkAchievements();
  }

  /** Awards XP once per `ref`. */
  async award(ref: string, kind: XpKind, xp: number, label: string, date = this.store.today()): Promise<boolean> {
    if (!this.ready || this.events().some(e => e.ref === ref)) return false;
    const before = this.level();
    const ev: XpEvent = { id: uid(), ref, kind, xp, label, date, at: Date.now() };
    this.events.update(a => [...a, ev]);
    await db.xp.put(ev);
    if (xp > 0 && kind !== 'quest' && kind !== 'perfect' && kind !== 'achievement') this.celebrate({ kind: 'xp', icon: '⚡', title: `+${xp} XP`, detail: label, xp });
    // a day with real progress keeps the streak alive
    const st = this.state();
    if (!st.activeDays.includes(date) && kind !== 'achievement') {
      const activeDays = [...st.activeDays, date].sort().slice(-400);
      await this.save({ ...st, activeDays });
      const streak = this.streakAt(this.store.today());
      if (streak > st.bestStreak) await this.save({ ...this.state(), bestStreak: streak });
      if (streak > 1) this.celebrate({ kind: 'streak', icon: '🔥', title: `${streak}-day streak`, detail: 'Keep the chain going.' });
      if (streak > 0 && streak % 7 === 0 && this.state().freezes < 3) {
        await this.save({ ...this.state(), freezes: this.state().freezes + 1 });
        this.celebrate({ kind: 'streak', icon: '🧊', title: 'Streak freeze earned', detail: 'A missed day will not break your streak.' });
      }
    }
    const after = this.level();
    if (after > before) {
      this.levelUp.set({ level: after, title: titleFor(after) });
      JarvisDevice.haptic({ kind: 'success' }).catch(() => undefined);
    } else if (xp > 0) {
      JarvisDevice.haptic({ kind: 'light' }).catch(() => undefined);
    }
    return true;
  }

  private async revoke(ref: string): Promise<void> {
    const ev = this.events().find(e => e.ref === ref);
    if (!ev) return;
    this.events.update(a => a.filter(e => e.id !== ev.id));
    await db.xp.delete(ev.id);
  }

  // ---------------------------------------------------------------- achievements
  private computeStats(): ProgressStats {
    const s = this.store;
    const done = s.tasks().filter(t => t.status === 'done');
    const focus = s.sessions().filter(x => x.kind === 'focus' && x.end);
    const byDay = new Map<string, number>();
    for (const f of focus) { const d = ymd(new Date(f.start)); byDay.set(d, (byDay.get(d) ?? 0) + f.minutes); }
    const st = this.state();
    return {
      tasksDone: done.length,
      mitsDone: this.events().filter(e => e.kind === 'mit').length,
      focusMin: focus.reduce((a, f) => a + f.minutes, 0),
      maxFocusDay: Math.max(0, ...byDay.values()),
      sessions: focus.length,
      earlyFocus: focus.some(f => new Date(f.start).getHours() < 8),
      streak: this.streak(),
      bestStreak: Math.max(st.bestStreak, this.streak()),
      bestHabitStreak: Math.max(0, ...s.habits().map(h => this.longestRun(h.log))),
      habitsLogged: s.habits().reduce((a, h) => a + h.log.length, 0),
      reviews: s.reviews().length,
      weeklyReviews: s.reviews().filter(r => r.kind === 'weekly').length,
      journalDays: new Set(s.journal().map(j => j.date)).size,
      goalsDone: s.goals().filter(g => g.status === 'done').length,
      milestones: s.goals().reduce((a, g) => a + g.milestones.filter(m => m.done).length, 0),
      perfectDays: st.perfectDays.length,
      inboxZero: this.events().filter(e => e.kind === 'inbox').length,
      level: this.level(),
      plans: s.plans().filter(p => p.blocks.length).length,
      memories: this.memoriesCount(),
      notes: s.notes().length,
    };
  }

  private longestRun(dates: string[]): number {
    const set = new Set(dates);
    let best = 0;
    for (const d of set) {
      if (set.has(addDays(d, -1))) continue;
      let n = 0, x = d;
      while (set.has(x)) { n++; x = addDays(x, 1); }
      best = Math.max(best, n);
    }
    return best;
  }

  async checkAchievements(): Promise<void> {
    const stats = this.computeStats();
    const st = this.state();
    const fresh = ACHIEVEMENTS.filter(a => !st.unlocked[a.id] && a.check(stats));
    if (!fresh.length) return;
    const unlocked = { ...st.unlocked };
    for (const a of fresh) unlocked[a.id] = Date.now();
    await this.save({ ...st, unlocked });
    for (const a of fresh) {
      if (a.xp) await this.award(`ach:${a.id}`, 'achievement', a.xp, `Achievement: ${a.name}`);
      this.celebrate({ kind: 'achievement', icon: a.icon, title: `Achievement unlocked: ${a.name}`, detail: a.desc, xp: a.xp || undefined });
    }
  }

  // ---------------------------------------------------------------- helpers
  celebrate(c: Omit<Celebration, 'id'>) {
    const item: Celebration = { ...c, id: uid() };
    this.celebrations.update(a => [...a.slice(-3), item]);
    const ttl = c.kind === 'xp' ? 2600 : 4800;
    setTimeout(() => this.dismiss(item.id), ttl);
  }

  dismiss(id: string) { this.celebrations.update(a => a.filter(c => c.id !== id)); }

  private async save(st: ProgressState) {
    this.state.set(st);
    await db.progress.put(st);
  }

  /** One-line status for the AI's context. */
  summary(): string {
    const q = this.quests();
    return `Level ${this.level()} ${this.title()} · ${this.totalXp()} XP · streak ${this.streak()} days (${this.state().freezes} freezes)` +
      (q.length ? ` · quests: ${q.map(x => `${x.title} ${x.progress}/${x.target}${x.claimed ? ' ✓' : ''}`).join('; ')}` : '');
  }
}
