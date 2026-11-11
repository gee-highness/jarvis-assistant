import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { FocusService } from '../core/focus.service';
import { SCAPES, SoundscapeService } from '../core/soundscape.service';
import { StoreService } from '../core/store.service';
import { ymd } from '../core/util';

@Component({
  standalone: true,
  imports: [FormsModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Focus</h1><span class="chip cyan mono">{{ store.focusMinutesToday() }} min today</span></div>

      <div class="card glow timer-card">
        <svg viewBox="0 0 200 200" class="ring">
          <circle cx="100" cy="100" r="88" class="track"/>
          <circle cx="100" cy="100" r="88" class="prog" [class.brk]="isBreak()" [attr.stroke-dasharray]="circ" [attr.stroke-dashoffset]="circ * (1 - focus.progress())"/>
        </svg>
        <div class="center">
          <div class="mono time">{{ display() }}</div>
          <div class="small muted label">{{ focus.current()?.session?.label ?? 'Ready when you are' }}</div>
          @if (focus.current(); as c) { <div class="small dim">Interruptions: {{ c.session.interruptions }}</div> }
        </div>
      </div>

      @if (!focus.current()) {
        <div class="card col">
          <label class="field">Focus on
            <select [(ngModel)]="taskId">
              <option value="">Free focus (no task)</option>
              @for (t of candidates(); track t.id) { <option [value]="t.id">{{ t.isMit ? '★ ' : '' }}{{ t.title }}</option> }
            </select>
          </label>
          <div class="row wrap">
            @for (p of presets; track p.label) {
              <button class="grow" [class.primary]="minutes() === p.min && kind === p.kind" (click)="minutes.set(p.min); kind = p.kind">{{ p.label }}</button>
            }
          </div>
          <label class="field">Minutes <input type="number" min="1" max="240" [ngModel]="minutes()" (ngModelChange)="minutes.set(+$event)"></label>
          <button class="primary" (click)="start()">▶ Start {{ kind === 'break' ? 'break' : 'focus' }}</button>
        </div>
      } @else {
        <div class="row">
          @if (focus.running()) { <button class="grow" (click)="focus.pause()">❚❚ Pause</button> }
          @else { <button class="grow primary" (click)="focus.resume()">▶ Resume</button> }
          <button class="grow" (click)="focus.interrupt()">⚡ Interrupted</button>
          <button class="grow danger" (click)="focus.stop(false)">■ Stop</button>
        </div>
        @if (focus.current()?.session?.taskId; as tid) {
          <button (click)="completeTask(tid)">✓ Task done, end session</button>
        }
      }

      <div class="card">
        <div class="card-head"><h2>Soundscape</h2>
          <button class="small" [class.primary]="sound.playing()" (click)="sound.toggle()">{{ sound.playing() ? '■ Stop' : '▶ Play' }}</button></div>
        <div class="scapes">
          @for (c of scapes; track c.id) {
            <button class="scape" [class.on]="sound.selected() === c.id" (click)="sound.select(c.id)" [title]="c.hint"><span>{{ c.icon }}</span>{{ c.label }}</button>
          }
        </div>
        <label class="row small muted" style="margin-top:10px">Volume
          <input type="range" min="0" max="1" step="0.05" class="grow" [ngModel]="sound.volume()" (ngModelChange)="sound.setVolume(+$event)" aria-label="Volume"></label>
        <label class="row small muted"><input type="checkbox" [ngModel]="sound.autoPlay()" (ngModelChange)="sound.setAuto($event)"> Play automatically with focus sessions, stop when they end</label>
      </div>

      <div class="card">
        <div class="card-head"><h2>Today's sessions</h2><span class="small muted">{{ todaySessions().length }}</span></div>
        <div class="list">
          @for (s of todaySessions(); track s.id) {
            <div class="item small">
              <span class="mono dim">{{ s.start | date:'HH:mm' }}</span>
              <span class="grow">{{ s.label }}</span>
              <span class="chip" [class.green]="s.completed" [class.gold]="!s.completed">{{ s.minutes }}m</span>
            </div>
          } @empty { <div class="empty">No sessions yet. The first one is the hardest.</div> }
        </div>
      </div>

      <div class="card small muted">
        <b class="upper">Method</b>
        <p style="margin:6px 0 0">Work on one thing only. Phone face down, notifications muted. Log every interruption, and you'll see patterns in a week. After four focus blocks, take a long break.</p>
      </div>
    </div>
  `,
  styles: [`
    .scapes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .scape { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 2px; font-size: .72rem; }
    .scape span { font-size: 1.3rem; } .scape.on { border-color: var(--cyan); background: rgba(var(--accent-rgb), .12); }
    .timer-card { display: grid; place-items: center; padding: 24px 10px; }
    .ring { width: min(72vw, 280px); height: min(72vw, 280px); transform: rotate(-90deg); grid-area: 1 / 1; }
    .track { fill: none; stroke: rgba(var(--accent-rgb), .12); stroke-width: 8; }
    .prog { fill: none; stroke: var(--cyan); stroke-width: 8; stroke-linecap: round; filter: drop-shadow(0 0 6px rgba(var(--accent-rgb), .7)); transition: stroke-dashoffset 1s linear; }
    .prog.brk { stroke: var(--green); }
    .center { grid-area: 1 / 1; text-align: center; max-width: 60%; }
    .time { font-size: 3rem; letter-spacing: .04em; }
    .label { margin-top: 4px; }
  `],
})
export class FocusPage implements OnInit {
  focus = inject(FocusService);
  sound = inject(SoundscapeService);
  readonly scapes = SCAPES;
  store = inject(StoreService);
  private route = inject(ActivatedRoute);
  readonly circ = 2 * Math.PI * 88;
  taskId = '';
  readonly minutes = signal(25);
  kind: 'focus' | 'break' = 'focus';
  readonly presets = [
    { label: 'Pomodoro 25', min: 25, kind: 'focus' as const },
    { label: 'Deep 50', min: 50, kind: 'focus' as const },
    { label: 'Sprint 15', min: 15, kind: 'focus' as const },
    { label: 'Break 5', min: 5, kind: 'break' as const },
  ];
  readonly candidates = computed(() => [...this.store.mits(), ...this.store.openTasks().filter(t => !t.isMit)].slice(0, 40));
  readonly todaySessions = computed(() => this.store.sessions().filter(s => ymd(new Date(s.start)) === this.store.today()));
  readonly isBreak = computed(() => this.focus.current()?.session.kind === 'break');
  readonly display = computed(() => {
    const c = this.focus.current();
    const ms = c ? this.focus.remainingMs() : this.minutes() * 60000;
    const m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  });

  ngOnInit() {
    this.minutes.set(this.store.settings().focusMin);
    const mit = this.store.mits()[0];
    if (mit) this.taskId = mit.id;
    if (this.route.snapshot.queryParamMap.get('start') && !this.focus.current()) this.start();
  }

  start() {
    if (this.kind === 'focus' && this.sound.autoPlay() && !this.sound.playing()) this.sound.start();
    this.focus.start({ minutes: Number(this.minutes()) || 25, taskId: this.taskId || undefined, kind: this.kind });
  }

  async completeTask(id: string) {
    await this.store.completeTask(id);
    await this.focus.stop(true);
  }
}
