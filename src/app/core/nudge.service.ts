import { Injectable, inject } from '@angular/core';
import { FocusService } from './focus.service';
import { NotifyService } from './notify.service';
import { ProgressService } from './progress.service';
import { StoreService } from './store.service';
import { hm, minutesOf } from './util';

/** Gentle accountability while the app is alive: untouched MITs, long gaps without focus, streaks at risk. */
@Injectable({ providedIn: 'root' })
export class NudgeService {
  private store = inject(StoreService);
  private focus = inject(FocusService);
  private notify = inject(NotifyService);
  private progress = inject(ProgressService);
  private sent = new Set<string>();

  start() {
    setInterval(() => this.check(), 10 * 60_000);
    setTimeout(() => this.check(), 60_000);
  }

  private once(key: string, title: string, body: string, route: string) {
    const k = `${this.store.today()}:${key}`;
    if (this.sent.has(k)) return;
    this.sent.add(k);
    this.notify.nudge(title, body, route);
  }

  private check() {
    const s = this.store.settings();
    if (!s.nudges || this.focus.current()) return;
    const now = minutesOf(hm());
    const inWork = now >= minutesOf(s.workStart) && now <= minutesOf(s.workEnd);
    const h = s.honorific;
    if (inWork && now >= 12 * 60 && this.store.mits().length && this.store.doneToday().length === 0) {
      this.once('mit-midday', 'Midday check-in', `It's past noon, ${h}, and nothing is ticked off yet. Shall we start a 25-minute block on "${this.store.mits()[0].title}"?`, '/focus');
    }
    if (inWork && now - minutesOf(s.workStart) > 90) {
      const last = this.store.sessions().find(x => x.kind === 'focus');
      const since = last ? (Date.now() - (last.end ?? last.start)) / 60_000 : Infinity;
      if (since > 90) this.once(`gap-${Math.floor(now / 90)}`, 'Focus check', `Ninety minutes without a focus block, ${h}. One short sprint?`, '/focus');
    }
    if (s.gamify && now >= 19 * 60 + 30 && this.progress.streak() >= 3 && !this.progress.todayActive() && !this.progress.todayFrozen()) {
      const f = this.progress.state().freezes;
      this.once('daystreak', 'Your streak is at risk', `${this.progress.streak()}-day streak, ${h}. One small win keeps it alive${f ? ` (or use a freeze: you have ${f})` : ''}.`, '/tasks');
    }
    if (now >= 19 * 60) {
      const atRisk = this.store.activeHabits().filter(x => x.cadence === 'daily' && !x.log.includes(this.store.today()) && this.store.streak(x) >= 2);
      if (atRisk.length) this.once('streak', 'Streak at risk', `${atRisk.map(x => `${x.name} (${this.store.streak(x)} days)`).join(', ')} — still time tonight, ${h}.`, '/habits');
    }
  }
}
