import { Injectable, computed, signal } from '@angular/core';
import { db } from './db';
import {
  DEFAULT_SETTINGS, DayPlan, FocusSession, Habit, Note, Reminder, Review, Settings, Task,
} from './models';
import { addDays, uid, ymd } from './util';

/** Single source of truth for productivity data. Signals in memory, persisted to IndexedDB. */
@Injectable({ providedIn: 'root' })
export class StoreService {
  readonly ready = signal(false);
  readonly settings = signal<Settings>(DEFAULT_SETTINGS);
  readonly tasks = signal<Task[]>([]);
  readonly habits = signal<Habit[]>([]);
  readonly sessions = signal<FocusSession[]>([]);
  readonly reviews = signal<Review[]>([]);
  readonly notes = signal<Note[]>([]);
  readonly reminders = signal<Reminder[]>([]);
  readonly plans = signal<DayPlan[]>([]);
  readonly today = signal(ymd());

  // ---------- derived ----------
  readonly openTasks = computed(() => this.tasks().filter(t => t.status === 'todo'));
  readonly mits = computed(() => this.openTasks().filter(t => t.isMit));
  readonly inbox = computed(() => this.openTasks().filter(t => t.inbox));
  readonly overdue = computed(() => this.openTasks().filter(t => t.due && t.due < this.today()));
  readonly dueToday = computed(() => this.openTasks().filter(t => t.due === this.today()));
  readonly doneToday = computed(() => this.tasks().filter(t => t.doneAt && ymd(new Date(t.doneAt)) === this.today()));
  readonly activeHabits = computed(() => this.habits().filter(h => !h.archived));
  readonly focusMinutesToday = computed(() => this.focusMinutesOn(this.today()));
  readonly todayPlan = computed(() => this.plans().find(p => p.date === this.today()));
  readonly focusHistory = computed(() => {
    const out: { date: string; minutes: number }[] = [];
    for (let i = 13; i >= 0; i--) { const d = addDays(this.today(), -i); out.push({ date: d, minutes: this.focusMinutesOn(d) }); }
    return out;
  });

  async init(): Promise<void> {
    const s = await db.settings.get('main');
    this.settings.set(s ? { ...DEFAULT_SETTINGS, ...s, voice: { ...DEFAULT_SETTINGS.voice, ...(s.voice ?? {}) }, cloud: { ...DEFAULT_SETTINGS.cloud, ...(s.cloud ?? {}) } } : DEFAULT_SETTINGS);
    if (!s) await db.settings.put(DEFAULT_SETTINGS);
    const [tasks, habits, sessions, reviews, notes, reminders, plans] = await Promise.all([
      db.tasks.toArray(), db.habits.toArray(), db.sessions.orderBy('start').reverse().limit(2000).toArray(),
      db.reviews.toArray(), db.notes.toArray(), db.reminders.toArray(), db.plans.toArray(),
    ]);
    this.tasks.set(tasks); this.habits.set(habits); this.sessions.set(sessions);
    this.reviews.set(reviews); this.notes.set(notes); this.reminders.set(reminders); this.plans.set(plans);
    // roll the day over at midnight
    setInterval(() => { const d = ymd(); if (d !== this.today()) this.today.set(d); }, 60_000);
    this.ready.set(true);
  }

  // ---------- settings ----------
  async updateSettings(patch: Partial<Settings>): Promise<void> {
    const next = { ...this.settings(), ...patch, id: 'main' as const };
    this.settings.set(next);
    await db.settings.put(next);
  }

  // ---------- tasks ----------
  async addTask(p: Partial<Task> & { title: string }): Promise<Task> {
    const t: Task = {
      id: uid(), title: p.title.trim(), notes: p.notes, project: p.project,
      urgent: !!p.urgent, important: p.important ?? true, due: p.due, estimateMin: p.estimateMin,
      status: 'todo', isMit: !!p.isMit, inbox: p.inbox ?? false, createdAt: Date.now(),
    };
    this.tasks.update(a => [t, ...a]);
    await db.tasks.put(t);
    return t;
  }

  async updateTask(id: string, patch: Partial<Task>): Promise<Task | undefined> {
    let updated: Task | undefined;
    this.tasks.update(a => a.map(t => (t.id === id ? (updated = { ...t, ...patch }) : t)));
    if (updated) await db.tasks.put(updated);
    return updated;
  }

  async completeTask(id: string, done = true): Promise<Task | undefined> {
    return this.updateTask(id, done
      ? { status: 'done', doneAt: Date.now(), isMit: false, inbox: false }
      : { status: 'todo', doneAt: undefined });
  }

  async deleteTask(id: string): Promise<void> {
    this.tasks.update(a => a.filter(t => t.id !== id));
    await db.tasks.delete(id);
  }

  async setMits(ids: string[]): Promise<void> {
    const keep = new Set(ids.slice(0, 3));
    const changed: Task[] = [];
    this.tasks.update(a => a.map(t => {
      const isMit = keep.has(t.id) && t.status === 'todo';
      if (t.isMit !== isMit) { const n = { ...t, isMit, inbox: isMit ? false : t.inbox }; changed.push(n); return n; }
      return t;
    }));
    await db.tasks.bulkPut(changed);
  }

  /** Fuzzy-find a task by id or title fragment. */
  findTask(ref: string): Task | undefined {
    const r = ref.trim().toLowerCase();
    const all = this.tasks();
    return all.find(t => t.id === ref)
      ?? all.find(t => t.status === 'todo' && t.title.toLowerCase() === r)
      ?? all.find(t => t.status === 'todo' && t.title.toLowerCase().includes(r))
      ?? all.find(t => t.title.toLowerCase().includes(r));
  }

  // ---------- habits ----------
  async addHabit(name: string, cadence: Habit['cadence'] = 'daily', target = 7): Promise<Habit> {
    const h: Habit = { id: uid(), name: name.trim(), cadence, target, archived: false, log: [], createdAt: Date.now() };
    this.habits.update(a => [...a, h]);
    await db.habits.put(h);
    return h;
  }

  async toggleHabit(id: string, date = this.today()): Promise<Habit | undefined> {
    let updated: Habit | undefined;
    this.habits.update(a => a.map(h => {
      if (h.id !== id) return h;
      const log = h.log.includes(date) ? h.log.filter(d => d !== date) : [...h.log, date].sort();
      return (updated = { ...h, log });
    }));
    if (updated) await db.habits.put(updated);
    return updated;
  }

  async logHabit(id: string, date = this.today()): Promise<Habit | undefined> {
    const h = this.habits().find(x => x.id === id);
    if (!h || h.log.includes(date)) return h;
    return this.toggleHabit(id, date);
  }

  async archiveHabit(id: string, archived = true): Promise<void> {
    let updated: Habit | undefined;
    this.habits.update(a => a.map(h => (h.id === id ? (updated = { ...h, archived }) : h)));
    if (updated) await db.habits.put(updated);
  }

  async deleteHabit(id: string): Promise<void> {
    this.habits.update(a => a.filter(h => h.id !== id));
    await db.habits.delete(id);
  }

  findHabit(ref: string): Habit | undefined {
    const r = ref.trim().toLowerCase();
    return this.habits().find(h => h.id === ref) ?? this.habits().find(h => h.name.toLowerCase().includes(r));
  }

  streak(h: Habit): number {
    let n = 0;
    let d = this.today();
    if (!h.log.includes(d)) d = addDays(d, -1); // today not yet done doesn't break the streak
    while (h.log.includes(d)) { n++; d = addDays(d, -1); }
    return n;
  }

  // ---------- focus ----------
  async saveSession(s: FocusSession): Promise<void> {
    this.sessions.update(a => [s, ...a.filter(x => x.id !== s.id)]);
    await db.sessions.put(s);
  }

  focusMinutesOn(date: string): number {
    return Math.round(this.sessions()
      .filter(s => s.kind === 'focus' && ymd(new Date(s.start)) === date)
      .reduce((sum, s) => sum + s.minutes, 0));
  }

  // ---------- plans ----------
  async savePlan(plan: DayPlan): Promise<void> {
    this.plans.update(a => [plan, ...a.filter(p => p.date !== plan.date)]);
    await db.plans.put(plan);
  }

  // ---------- reviews ----------
  async saveReview(r: Review): Promise<void> {
    this.reviews.update(a => [r, ...a.filter(x => x.id !== r.id)]);
    await db.reviews.put(r);
  }

  // ---------- notes ----------
  async saveNote(n: Partial<Note> & { title: string; body: string }): Promise<Note> {
    const note: Note = { id: n.id ?? uid(), title: n.title, body: n.body, tags: n.tags ?? [], updatedAt: Date.now() };
    this.notes.update(a => [note, ...a.filter(x => x.id !== note.id)]);
    await db.notes.put(note);
    return note;
  }

  async deleteNote(id: string): Promise<void> {
    this.notes.update(a => a.filter(n => n.id !== id));
    await db.notes.delete(id);
  }

  // ---------- reminders ----------
  async saveReminder(r: Reminder): Promise<void> {
    this.reminders.update(a => [r, ...a.filter(x => x.id !== r.id)]);
    await db.reminders.put(r);
  }

  async deleteReminder(id: string): Promise<void> {
    this.reminders.update(a => a.filter(r => r.id !== id));
    await db.reminders.delete(id);
  }

  // ---------- backup ----------
  async exportJson(): Promise<string> {
    return JSON.stringify({ app: 'jarvis', version: 1, exportedAt: new Date().toISOString(), data: await db.exportAll() });
  }

  async importJson(json: string): Promise<void> {
    const parsed = JSON.parse(json);
    if (parsed?.app !== 'jarvis' || !parsed.data) throw new Error('Not a Jarvis backup file');
    await db.importAll(parsed.data);
    await this.init();
  }

  /** Compact text snapshot of current state for the model's context. */
  snapshot(): string {
    const fmt = (t: Task) => `- ${t.title}${t.due ? ` (due ${t.due})` : ''}${t.estimateMin ? ` ~${t.estimateMin}m` : ''}${t.urgent ? ' [urgent]' : ''}${t.important ? ' [important]' : ''} id:${t.id.slice(0, 8)}`;
    const lines: string[] = [];
    const mits = this.mits();
    lines.push(`MITs today: ${mits.length ? '\n' + mits.map(fmt).join('\n') : 'none set'}`);
    const ov = this.overdue();
    if (ov.length) lines.push(`Overdue (${ov.length}):\n` + ov.slice(0, 8).map(fmt).join('\n'));
    const dt = this.dueToday().filter(t => !t.isMit);
    if (dt.length) lines.push(`Due today:\n` + dt.slice(0, 8).map(fmt).join('\n'));
    const other = this.openTasks().filter(t => !t.isMit && t.due !== this.today() && !(t.due && t.due < this.today()));
    lines.push(`Other open tasks: ${other.length}${other.length ? '\n' + other.slice(0, 12).map(fmt).join('\n') : ''}`);
    lines.push(`Done today: ${this.doneToday().length} tasks, ${this.focusMinutesToday()} focus minutes.`);
    const hb = this.activeHabits();
    if (hb.length) lines.push('Habits: ' + hb.map(h => `${h.name} (${h.log.includes(this.today()) ? 'done' : 'not done'} today, streak ${this.streak(h)})`).join('; '));
    const plan = this.todayPlan();
    if (plan?.blocks.length) lines.push('Today\'s plan: ' + plan.blocks.map(b => `${b.start}-${b.end} ${b.label}`).join('; '));
    return lines.join('\n');
  }
}
