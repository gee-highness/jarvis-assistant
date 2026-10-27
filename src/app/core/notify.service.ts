import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative } from './native';
import { StoreService } from './store.service';
import { uid } from './util';

const ID_BRIEFING = 1001, ID_SHUTDOWN = 1002, ID_FOCUS = 1003, ID_WEEKLY = 1004, ID_NUDGE = 1005;

@Injectable({ providedIn: 'root' })
export class NotifyService {
  private store = inject(StoreService);
  private router = inject(Router);
  private granted = false;

  async init(): Promise<void> {
    if (!isNative()) { this.granted = 'Notification' in window && Notification.permission === 'granted'; return; }
    const p = await LocalNotifications.checkPermissions();
    this.granted = p.display === 'granted' || (await LocalNotifications.requestPermissions()).display === 'granted';
    try {
      await LocalNotifications.createChannel({ id: 'jarvis', name: 'Jarvis', description: 'Briefings, reminders and focus', importance: 4, vibration: true });
      await LocalNotifications.createChannel({ id: 'focus', name: 'Focus timer', description: 'Focus session alerts', importance: 5, vibration: true });
    } catch { /* channels unsupported */ }
    LocalNotifications.addListener('localNotificationActionPerformed', e => {
      const route = (e.notification.extra as any)?.route as string | undefined;
      if (route) this.router.navigateByUrl(route);
    });
    await this.scheduleDaily();
  }

  /** (Re)schedule recurring briefing, shutdown and weekly review notifications from settings. */
  async scheduleDaily(): Promise<void> {
    if (!isNative() || !this.granted) return;
    const s = this.store.settings();
    const [wh, wm] = s.wakeTime.split(':').map(Number);
    const [sh, sm] = s.shutdownTime.split(':').map(Number);
    await LocalNotifications.cancel({ notifications: [{ id: ID_BRIEFING }, { id: ID_SHUTDOWN }, { id: ID_WEEKLY }] }).catch(() => undefined);
    await LocalNotifications.schedule({
      notifications: [
        { id: ID_BRIEFING, channelId: 'jarvis', title: `${s.honorific === 'sir' ? 'Good morning, sir' : 'Good morning'}`, body: 'Your briefing is ready. Shall we pick today\'s three priorities?', schedule: { on: { hour: wh, minute: wm }, allowWhileIdle: true }, extra: { route: '/briefing' }, smallIcon: 'ic_stat_jarvis' },
        { id: ID_SHUTDOWN, channelId: 'jarvis', title: 'Shutdown ritual', body: 'Two minutes: log your wins, roll over the rest, set tomorrow\'s MITs.', schedule: { on: { hour: sh, minute: sm }, allowWhileIdle: true }, extra: { route: '/review' }, smallIcon: 'ic_stat_jarvis' },
        { id: ID_WEEKLY, channelId: 'jarvis', title: 'Weekly review', body: 'Sunday review: what worked, what didn\'t, and next week\'s three outcomes.', schedule: { on: { weekday: 1, hour: 17, minute: 0 }, allowWhileIdle: true }, extra: { route: '/review?weekly=1' }, smallIcon: 'ic_stat_jarvis' },
      ],
    });
  }

  async focusEnd(at: Date, title: string, body: string): Promise<void> {
    if (!isNative()) return;
    await LocalNotifications.cancel({ notifications: [{ id: ID_FOCUS }] }).catch(() => undefined);
    await LocalNotifications.schedule({ notifications: [{ id: ID_FOCUS, channelId: 'focus', title, body, schedule: { at, allowWhileIdle: true }, extra: { route: '/focus' }, smallIcon: 'ic_stat_jarvis' }] });
  }

  async cancelFocus(): Promise<void> {
    if (isNative()) await LocalNotifications.cancel({ notifications: [{ id: ID_FOCUS }] }).catch(() => undefined);
  }

  async nudge(title: string, body: string, route = '/briefing'): Promise<void> {
    if (isNative() && this.granted) {
      await LocalNotifications.schedule({ notifications: [{ id: ID_NUDGE, channelId: 'jarvis', title, body, schedule: { at: new Date(Date.now() + 1000) }, extra: { route }, smallIcon: 'ic_stat_jarvis' }] });
    } else if (this.granted) new Notification(title, { body });
  }

  /** One-off reminder; returns stored reminder id. */
  async remind(title: string, at: Date): Promise<string> {
    const notificationId = Math.floor(Math.random() * 1_000_000) + 10_000;
    const id = uid();
    if (isNative()) {
      await LocalNotifications.schedule({ notifications: [{ id: notificationId, channelId: 'jarvis', title: 'Reminder', body: title, schedule: { at, allowWhileIdle: true }, extra: { route: '/tasks' }, smallIcon: 'ic_stat_jarvis' }] });
    } else {
      const ms = at.getTime() - Date.now();
      if (ms > 0 && ms < 2 ** 31) setTimeout(() => this.nudge('Reminder', title), ms);
    }
    await this.store.saveReminder({ id, title, at: at.getTime(), notificationId, done: false });
    return id;
  }

  async cancelReminder(id: string): Promise<boolean> {
    const r = this.store.reminders().find(x => x.id === id || x.id.startsWith(id) || x.title.toLowerCase().includes(id.toLowerCase()));
    if (!r) return false;
    if (isNative()) await LocalNotifications.cancel({ notifications: [{ id: r.notificationId }] }).catch(() => undefined);
    await this.store.deleteReminder(r.id);
    return true;
  }
}
