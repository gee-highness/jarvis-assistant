import { Injectable, computed, inject, signal } from '@angular/core';
import { FocusSession } from './models';
import { JarvisDevice } from './native';
import { NotifyService } from './notify.service';
import { StoreService } from './store.service';
import { uid } from './util';

export interface FocusState {
  session: FocusSession;
  endsAt: number;
  pausedRemaining?: number;
}

@Injectable({ providedIn: 'root' })
export class FocusService {
  private store = inject(StoreService);
  private notify = inject(NotifyService);
  readonly current = signal<FocusState | null>(null);
  readonly now = signal(Date.now());
  readonly cycle = signal(0); // completed focus sessions in this run (for long breaks)
  private ticker: ReturnType<typeof setInterval> | null = null;

  readonly remainingMs = computed(() => {
    const c = this.current();
    if (!c) return 0;
    return c.pausedRemaining ?? Math.max(0, c.endsAt - this.now());
  });
  readonly progress = computed(() => {
    const c = this.current();
    if (!c) return 0;
    const total = c.session.minutes * 60_000;
    return total ? 1 - this.remainingMs() / total : 0;
  });
  readonly running = computed(() => !!this.current() && this.current()!.pausedRemaining === undefined);

  constructor() {
    // restore a session that was running when the app was killed
    try {
      const raw = localStorage.getItem('jarvis.focus');
      if (raw) {
        const st = JSON.parse(raw) as FocusState;
        if (st.pausedRemaining !== undefined || st.endsAt > Date.now()) { this.current.set(st); this.startTicker(); }
        else this.finish(true, st);
      }
    } catch { /* ignore */ }
  }

  async start(opts: { minutes?: number; label?: string; taskId?: string; kind?: 'focus' | 'break' } = {}): Promise<FocusSession> {
    if (this.current()) await this.stop(false);
    const s = this.store.settings();
    const kind = opts.kind ?? 'focus';
    const minutes = opts.minutes ?? (kind === 'focus' ? s.focusMin : (this.cycle() % 4 === 0 && this.cycle() ? s.longBreakMin : s.breakMin));
    const task = opts.taskId ? this.store.tasks().find(t => t.id === opts.taskId) : undefined;
    const session: FocusSession = {
      id: uid(), taskId: task?.id, label: opts.label || task?.title || (kind === 'focus' ? 'Deep work' : 'Break'),
      start: Date.now(), minutes, kind, interruptions: 0, completed: false,
    };
    const st: FocusState = { session, endsAt: Date.now() + minutes * 60_000 };
    this.current.set(st);
    this.persist();
    this.startTicker();
    await this.notify.focusEnd(new Date(st.endsAt),
      kind === 'focus' ? 'Focus block complete' : 'Break over',
      kind === 'focus' ? `Well done, sir. "${session.label}" is in the books. Take a breather.` : 'Back to it, sir.');
    if (kind === 'focus') JarvisDevice.keepAwake({ on: true }).catch(() => undefined);
    return session;
  }

  pause() {
    const c = this.current();
    if (!c || c.pausedRemaining !== undefined) return;
    this.current.set({ ...c, pausedRemaining: Math.max(0, c.endsAt - Date.now()) });
    this.notify.cancelFocus();
    this.persist();
  }

  resume() {
    const c = this.current();
    if (!c || c.pausedRemaining === undefined) return;
    const endsAt = Date.now() + c.pausedRemaining;
    this.current.set({ session: c.session, endsAt });
    this.notify.focusEnd(new Date(endsAt), 'Focus block complete', `"${c.session.label}" complete.`);
    this.persist();
  }

  interrupt() {
    const c = this.current();
    if (!c) return;
    this.current.set({ ...c, session: { ...c.session, interruptions: c.session.interruptions + 1 } });
    this.persist();
  }

  /** Stop early. Partial focus time still counts. */
  async stop(completed = false): Promise<FocusSession | null> {
    return this.finish(completed);
  }

  private async finish(completed: boolean, st = this.current()): Promise<FocusSession | null> {
    if (!st) return null;
    const elapsedMin = completed
      ? st.session.minutes
      : Math.round((st.session.minutes * 60_000 - (st.pausedRemaining ?? Math.max(0, st.endsAt - Date.now()))) / 60_000);
    const session: FocusSession = { ...st.session, end: Date.now(), minutes: Math.max(0, elapsedMin), completed };
    this.current.set(null);
    this.persist();
    this.stopTicker();
    this.notify.cancelFocus();
    JarvisDevice.keepAwake({ on: false }).catch(() => undefined);
    if (session.minutes > 0 || completed) await this.store.saveSession(session);
    if (completed && session.kind === 'focus') this.cycle.update(n => n + 1);
    return session;
  }

  private startTicker() {
    this.stopTicker();
    this.ticker = setInterval(() => {
      this.now.set(Date.now());
      const c = this.current();
      if (c && c.pausedRemaining === undefined && c.endsAt <= Date.now()) this.finish(true);
    }, 1000);
  }

  private stopTicker() { if (this.ticker) clearInterval(this.ticker); this.ticker = null; }

  private persist() {
    try {
      const c = this.current();
      if (c) localStorage.setItem('jarvis.focus', JSON.stringify(c)); else localStorage.removeItem('jarvis.focus');
    } catch { /* ignore */ }
  }
}
