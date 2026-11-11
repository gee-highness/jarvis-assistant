import { Injectable, computed, signal } from '@angular/core';
import { JarvisSense, SenseDay, SenseStatus, isNative } from './native';

/** Always-on senses (steps, sleep estimate, screen time, unlocks) from the native service. */
@Injectable({ providedIn: 'root' })
export class SenseService {
  readonly status = signal<SenseStatus | null>(null);
  readonly days = signal<SenseDay[]>([]);
  readonly today = computed(() => this.days()[0]);
  readonly yesterday = computed(() => this.days()[1]);
  private timer: ReturnType<typeof setInterval> | null = null;

  async init(): Promise<void> {
    if (!isNative()) { this.status.set({ available: false, running: false, usageAccess: false, activity: false }); return; }
    await this.refresh();
    this.timer ??= setInterval(() => this.refresh().catch(() => undefined), 5 * 60_000);
  }

  async refresh(): Promise<void> {
    this.status.set(await JarvisSense.getStatus().catch(() => null));
    const { days } = await JarvisSense.getDays({ days: 30 }).catch(() => ({ days: [] as SenseDay[] }));
    this.days.set(days);
  }

  async enable(): Promise<void> {
    await JarvisSense.requestActivity().catch(() => undefined);
    this.status.set(await JarvisSense.start());
    await this.refresh();
  }
  async disable(): Promise<void> { this.status.set(await JarvisSense.stop()); }
  usage(dayOffset = 0) { return JarvisSense.getUsage({ dayOffset }); }
  openUsageAccess() { return JarvisSense.openUsageAccess(); }
  async clear() { await JarvisSense.clear(); await this.refresh(); }
}

export const sleepHours = (d?: SenseDay) => (d?.sleepStart && d.sleepEnd ? (d.sleepEnd - d.sleepStart) / 3600_000 : undefined);
export const screenHours = (d?: SenseDay) => (d?.screenOnMs ? d.screenOnMs / 3600_000 : undefined);
