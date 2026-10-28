import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FocusService } from '../core/focus.service';
import { JarvisService } from '../core/jarvis.service';
import { LlmService } from '../core/llm.service';
import { OllamaService } from '../core/ollama.service';
import { PlannerService } from '../core/planner.service';
import { ProgressService } from '../core/progress.service';
import { StoreService } from '../core/store.service';
import { greeting, prettyDate } from '../core/util';
import { MdPipe } from '../ui/md.pipe';
import { OrbComponent } from '../ui/orb.component';

@Component({
  standalone: true,
  imports: [RouterLink, MdPipe, OrbComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="hero card glow">
        <j-orb [state]="jarvis.busy() ? 'thinking' : 'idle'" [size]="74" />
        <div class="grow">
          <div class="upper">{{ dateLabel }}</div>
          <h1>{{ hello() }}</h1>
          <div class="row small muted" style="margin-top:4px">
            <span class="dot" [class]="ollama.state()"></span>
            <span>{{ engineLabel() }}</span>
          </div>
        </div>
      </div>

      @if (ollama.state() === 'offline' && !cloudOn()) {
        @if (store.settings().engine === 'device') {
          @if (!llm.activeInstalled()) {
            <a class="banner cta" routerLink="/brain">⬇ Give Jarvis a brain: download a model once and everything runs offline. <b>Open Brain →</b></a>
          } @else {
            <div class="banner">{{ llm.loadError() || 'The brain is not loaded yet.' }} <a routerLink="/brain">Brain settings</a></div>
          }
        } @else {
          <div class="banner">Engine offline. Open Termux and run <span class="mono">ollama serve</span>, or set up auto-wake in <a routerLink="/settings">Settings</a>.</div>
        }
      }

      <div class="grid3">
        <div class="card stat"><div class="mono big">{{ store.focusMinutesToday() }}</div><div class="small muted">focus min</div></div>
        <div class="card stat"><div class="mono big">{{ store.doneToday().length }}</div><div class="small muted">done today</div></div>
        <div class="card stat"><div class="mono big" [style.color]="store.overdue().length ? 'var(--red)' : ''">{{ store.overdue().length }}</div><div class="small muted">overdue</div></div>
      </div>

      @if (!store.todayJournal()) {
        <div class="card">
          <div class="small muted" style="margin-bottom:6px">Quick check-in: how are you feeling, {{ store.settings().honorific }}?</div>
          <div class="row" style="gap:6px">@for (m of moods; track $index) { <button class="grow" style="font-size:1.3rem" (click)="checkIn($index + 1)" [attr.aria-label]="'Mood ' + ($index + 1)">{{ m }}</button> }</div>
        </div>
      }

      <a class="card" routerLink="/progress" style="display:block;color:inherit;text-decoration:none">
        <div class="row between"><b>★ Lv {{ progress.level() }} · {{ progress.title() }}</b><span>🔥 {{ progress.streak() }}</span></div>
        <div style="height:6px;border-radius:4px;background:rgba(34,211,238,.12);margin:8px 0;overflow:hidden"><i style="display:block;height:100%;background:linear-gradient(90deg,#22d3ee,#4ade80)" [style.width.%]="progress.levelProgress().pct"></i></div>
        <div class="small muted">{{ questsDone() }}/{{ progress.quests().length }} quests done today · {{ progress.xpToday() }} XP</div>
      </a>

      <div class="card">
        <div class="card-head">
          <h2>Briefing</h2>
          <button class="small primary" [disabled]="jarvis.busy()" (click)="brief()">{{ jarvis.busy() ? 'Thinking…' : 'Brief me' }}</button>
        </div>
        @if (briefText()) { <div class="md" [innerHTML]="briefText() | md"></div> }
        @else { <p class="muted small" style="margin:0">Tap “Brief me” for a spoken rundown: overdue items, your three priorities, habits at risk and one piece of advice.</p> }
      </div>

      <div class="card">
        <div class="card-head"><h2>Today's 3 MITs</h2><a routerLink="/tasks" class="small">All tasks →</a></div>
        <div class="list">
          @for (t of store.mits(); track t.id) {
            <div class="item">
              <button class="check" (click)="store.completeTask(t.id)" aria-label="Complete"></button>
              <div class="grow">{{ t.title }} @if (t.estimateMin) { <span class="chip">{{ t.estimateMin }}m</span> }</div>
              <button class="small" (click)="focusOn(t.id)">▶ Focus</button>
            </div>
          } @empty {
            <div class="empty">No priorities set. Ask Jarvis to brief you, or star tasks in Tasks.</div>
          }
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Schedule</h2><a routerLink="/planner" class="small">Planner →</a></div>
        @if (store.todayPlan(); as plan) {
          <div class="list">
            @for (b of plan.blocks; track b.start) {
              <div class="item" [class.now]="b === current()">
                <span class="mono small muted" style="width:92px">{{ b.start }}–{{ b.end }}</span>
                <span class="grow">{{ b.label }}</span>
                <span class="chip" [class.violet]="b.kind === 'focus'" [class.green]="b.kind === 'break'">{{ b.kind }}</span>
              </div>
            }
          </div>
        } @else {
          <div class="row between"><span class="muted small">No time blocks yet.</span><button class="small" [disabled]="planner.busy()" (click)="plan()">{{ planner.busy() ? 'Planning…' : 'Plan my day' }}</button></div>
        }
      </div>

      <div class="card">
        <div class="card-head"><h2>Habits</h2><a routerLink="/habits" class="small">Manage →</a></div>
        <div class="row wrap">
          @for (h of store.activeHabits(); track h.id) {
            <button class="small" [class.primary]="h.log.includes(store.today())" (click)="store.toggleHabit(h.id)">
              {{ h.name }} · {{ store.streak(h) }}🔥
            </button>
          } @empty { <span class="muted small">No habits yet.</span> }
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Focus · last 14 days</h2><span class="small muted mono">{{ weekTotal() }} min this week</span></div>
        <div class="bars">
          @for (d of store.focusHistory(); track d.date) {
            <div class="bar-col" [title]="d.date + ': ' + d.minutes + ' min'">
              <div class="bar" [style.height.%]="barHeight(d.minutes)" [class.today]="d.date === store.today()"></div>
              <span class="tiny">{{ d.date.slice(8) }}</span>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .hero { display: flex; align-items: center; gap: 14px; }
    .stat { text-align: center; padding: 12px 6px; }
    .big { font-size: 1.6rem; color: var(--cyan); }
    .item.now { background: rgba(34,211,238,.08); border-radius: 8px; }
    .bars { display: flex; align-items: flex-end; gap: 5px; height: 110px; }
    .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 4px; }
    .bar { width: 100%; min-height: 2px; background: linear-gradient(180deg, var(--cyan), rgba(34,211,238,.25)); border-radius: 4px 4px 1px 1px; }
    .bar.today { background: linear-gradient(180deg, var(--gold), rgba(251,191,36,.3)); }
    .tiny { font-size: .62rem; color: var(--dim); font-family: var(--mono); }
  `],
})
export class BriefingPage implements OnInit {
  store = inject(StoreService);
  jarvis = inject(JarvisService);
  ollama = inject(OllamaService);
  llm = inject(LlmService);
  progress = inject(ProgressService);
  readonly moods = ['😞', '😕', '😐', '🙂', '😄'];
  async checkIn(m: number) { await this.store.saveJournal({ mood: m }); this.router.navigateByUrl('/journal'); }
  questsDone = computed(() => this.progress.quests().filter(q => q.progress >= q.target).length);
  planner = inject(PlannerService);
  private focus = inject(FocusService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly dateLabel = prettyDate();
  readonly briefText = signal('');
  readonly hello = computed(() => {
    const s = this.store.settings();
    return `${greeting()}, ${s.userName || s.honorific}.`;
  });
  readonly cloudOn = computed(() => { const c = this.store.settings().cloud; return c.mode !== 'off' && !!c.apiKey; });
  readonly engineLabel = computed(() => {
    const st = this.ollama.state();
    const s = this.store.settings();
    const name = s.engine === 'device' ? (this.llm.active()?.name.split(' · ')[0] ?? 'no model') : s.chatModel.split('/').pop();
    const local = this.llm.loading() ? 'Loading the brain…' : st === 'online' ? `On-device · ${name}` : st === 'waking' ? 'Waking the engine…' : st === 'offline' ? (s.engine === 'device' && !this.llm.activeInstalled() ? 'No brain installed' : 'Engine offline') : 'Checking engine…';
    return this.cloudOn() ? `${local} · Cloud: ${s.cloud.model}` : local;
  });
  readonly current = computed(() => this.planner.currentBlock());
  readonly weekTotal = computed(() => this.store.focusHistory().slice(-7).reduce((a, d) => a + d.minutes, 0));
  private readonly maxFocus = computed(() => Math.max(60, ...this.store.focusHistory().map(d => d.minutes)));

  ngOnInit() {
    if (this.route.snapshot.queryParamMap.get('brief')) this.brief(true);
  }

  barHeight(m: number) { return Math.max(2, m / this.maxFocus() * 100); }

  async brief(speak = true) {
    this.briefText.set('');
    const text = await this.jarvis.briefing(speak && this.store.settings().voice.speakReplies);
    this.briefText.set(text || this.jarvis.error() || '');
  }

  async plan() { await this.planner.generate(); }

  async focusOn(id: string) { await this.focus.start({ taskId: id }); this.router.navigateByUrl('/focus'); }
}
