import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { isNative } from '../core/native';
import { ReflexService } from '../core/reflex/reflex.service';
import { healthInsights } from '../core/reflex/wellbeing';
import { SenseService, screenHours, sleepHours } from '../core/sense.service';
import { StoreService } from '../core/store.service';

@Component({
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Health & senses</h1>
        <span class="chip" [class.green]="st()?.running">{{ st()?.running ? 'always on' : 'off' }}</span></div>

      @if (!native) {
        <div class="banner">Background senses run in the Android app. In the browser, Jarvis still tracks mood, journal and habits.</div>
      }

      <div class="card glow col">
        <b>Always-on Jarvis</b>
        <p class="small muted" style="margin:0">With your permission Jarvis quietly keeps track of your day so it can notice patterns, look after your wellbeing and remind you at the right moments. Everything stays on this phone. Nothing is uploaded, and you can pause or delete it any time.</p>
        <div class="row wrap">
          @if (!st()?.running) { <button class="small primary" [disabled]="!native" (click)="enable()">Turn on</button> }
          @else { <button class="small" (click)="sense.disable()">Pause</button> }
          <button class="small" [disabled]="!native" (click)="sense.refresh()">↻ Refresh</button>
        </div>
      </div>

      <div class="card col">
        <b>What Jarvis can sense</b>
        <div class="perm"><span>👟 Steps & activity</span>
          @if (st()?.activity) { <span class="chip green">on</span> } @else { <button class="small" [disabled]="!native" (click)="enable()">Allow</button> }</div>
        <div class="perm"><span>🌙 Sleep estimate (from when your phone goes quiet)</span><span class="chip" [class.green]="st()?.running">{{ st()?.running ? 'on' : 'off' }}</span></div>
        <div class="perm"><span>📱 Screen time & unlocks</span><span class="chip" [class.green]="st()?.running">{{ st()?.running ? 'on' : 'off' }}</span></div>
        <div class="perm"><span>📊 Time per app</span>
          @if (st()?.usageAccess) { <span class="chip green">on</span> } @else { <button class="small" [disabled]="!native" (click)="sense.openUsageAccess()">Grant</button> }</div>
      </div>

      @if (today(); as d) {
        <div class="card col">
          <b>Today</b>
          <div class="stats">
            <div><b>{{ (d.steps ?? 0).toLocaleString() }}</b><span>steps</span></div>
            <div><b>{{ sleep() }}</b><span>sleep</span></div>
            <div><b>{{ screen(d) }}</b><span>screen</span></div>
            <div><b>{{ d.unlocks ?? 0 }}</b><span>unlocks</span></div>
          </div>
        </div>
      }

      @if (week().length) {
        <div class="card col">
          <b>Last 7 days</b>
          <div class="table small">
            <div class="tr head"><span>Day</span><span>Steps</span><span>Sleep</span><span>Screen</span></div>
            @for (d of week(); track d.date) {
              <div class="tr"><span>{{ day(d.date) }}</span><span>{{ (d.steps ?? 0).toLocaleString() }}</span><span>{{ hrs(sleepH(d)) }}</span><span>{{ screen(d) }}</span></div>
            }
          </div>
        </div>
      }

      <div class="card col">
        <b>Patterns</b>
        @for (i of insights(); track i) { <div class="small">• {{ i }}</div> } @empty { <div class="small muted">Patterns appear after a week or two of data. Daily mood check-ins (say "check in") make them much sharper.</div> }
        <div class="row wrap"><a class="small" routerLink="/journal">Journal & mood</a></div>
      </div>

      <div class="card col">
        <b>Mind</b>
        <p class="small muted" style="margin:0">Ask Jarvis "check in", "how has my mood been", "am I depressed" (PHQ screening), "anxiety test" (GAD screening), "help me breathe" or "grounding exercise". These are supportive tools, not a diagnosis. If you are ever in crisis, Jarvis shows help lines for your country.</p>
      </div>

      <div class="card col">
        <b>Your data</b>
        <p class="small muted" style="margin:0">Stored only on this phone for 120 days.</p>
        <button class="small" [disabled]="!native" (click)="clear()">Delete all sensed data</button>
        @if (msg()) { <div class="small muted">{{ msg() }}</div> }
      </div>
    </div>
  `,
  styles: [`
    .perm { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--line); }
    .perm:last-child { border-bottom: 0; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; text-align: center; }
    .stats div { display: flex; flex-direction: column; }
    .stats b { font-size: 1.2rem; color: var(--cyan); }
    .stats span { font-size: .72rem; color: var(--muted); }
    .table .tr { display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr; padding: 4px 0; border-bottom: 1px solid var(--line); }
    .table .head { color: var(--muted); }
  `],
})
export class SensesPage implements OnInit {
  readonly sense = inject(SenseService);
  private store = inject(StoreService);
  private reflex = inject(ReflexService);
  readonly native = isNative();
  readonly st = this.sense.status;
  readonly today = this.sense.today;
  readonly week = computed(() => this.sense.days().slice(0, 7));
  readonly msg = signal('');
  readonly insights = computed(() => healthInsights(this.sense.days(), this.store.journal().map(j => ({ date: j.date, mood: j.mood, energy: j.energy }))));
  readonly sleep = computed(() => this.hrs(sleepHours(this.sense.today()) ?? sleepHours(this.sense.yesterday())));

  ngOnInit() { this.sense.refresh().catch(() => undefined); this.reflex.init().catch(() => undefined); }
  async enable() { try { await this.sense.enable(); } catch (e: any) { this.msg.set(e?.message ?? String(e)); } }
  async clear() { if (confirm('Delete all sensed data (steps, sleep, screen time)?')) { await this.sense.clear(); this.msg.set('Deleted.'); } }
  sleepH = sleepHours;
  hrs(h?: number) { return h ? `${h.toFixed(1)}h` : '–'; }
  screen(d: { screenOnMs?: number }) { const h = screenHours(d as never); return h ? `${h.toFixed(1)}h` : '–'; }
  day(s: string) { return new Date(s + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }); }
}
