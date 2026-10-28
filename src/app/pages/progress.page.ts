import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ACHIEVEMENTS, ProgressService } from '../core/progress.service';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Progress</h1></div>

      <div class="card glow">
        <div class="row between">
          <div><div class="upper">Level {{ p.level() }}</div><div class="big">{{ p.title() }}</div></div>
          <div class="right"><div class="big">🔥 {{ p.streak() }}</div><div class="small muted">day streak · ❄ {{ p.state().freezes }} freeze{{ p.state().freezes === 1 ? '' : 's' }}</div></div>
        </div>
        <div class="bar"><i [style.width.%]="p.levelProgress().pct"></i></div>
        @if (!p.todayActive() && p.streak() > 0) {
          <button class="small" style="margin-top:8px" [disabled]="p.state().freezes < 1 || p.todayFrozen()" (click)="p.useFreeze()">❄ {{ p.todayFrozen() ? 'Today is protected' : 'Use a freeze to protect today' }}</button>
        }
        <div class="small muted">{{ p.levelProgress().into }} / {{ p.levelProgress().need }} XP to level {{ p.level() + 1 }} · {{ p.xpToday() }} XP today</div>
      </div>

      <h2 class="upper">Today's quests</h2>
      @for (q of p.quests(); track q.id) {
        <div class="card quest" [class.done]="q.progress >= q.target">
          <div class="row between"><span>{{ q.icon }} {{ q.title }}</span><span class="chip small">{{ q.progress >= q.target ? '✓' : q.progress + '/' + q.target }} · +{{ q.xp }}</span></div>
          <div class="bar thin"><i [style.width.%]="(q.progress / q.target) * 100"></i></div>
        </div>
      } @empty { <div class="card small muted">Quests appear once the day begins.</div> }

      <h2 class="upper">This week</h2>
      <div class="card grid4">
        <div><b>{{ p.weekly().cur.xp }}</b><span>XP {{ delta(p.weekly().cur.xp, p.weekly().prev.xp) }}</span></div>
        <div><b>{{ p.weekly().cur.tasks }}</b><span>tasks {{ delta(p.weekly().cur.tasks, p.weekly().prev.tasks) }}</span></div>
        <div><b>{{ p.weekly().cur.focus }}</b><span>focus min {{ delta(p.weekly().cur.focus, p.weekly().prev.focus) }}</span></div>
        <div><b>{{ p.weekly().cur.days }}/7</b><span>active days</span></div>
      </div>

      <h2 class="upper">Last 12 weeks</h2>
      <div class="card heat" role="img" aria-label="Daily XP heatmap">
        @for (d of p.heatmap(); track d.date) { <i [class]="'h' + tier(d.xp)" [title]="d.date + ' · ' + d.xp + ' XP'"></i> }
      </div>

      <h2 class="upper">Achievements · {{ unlockedCount() }}/{{ all.length }}</h2>
      <div class="ach">
        @for (a of all; track a.id) {
          <div class="card a" [class.locked]="!p.state().unlocked[a.id]">
            <span class="ico">{{ p.state().unlocked[a.id] ? a.icon : '🔒' }}</span>
            <div><b>{{ a.name }}</b><div class="small muted">{{ a.desc }} · +{{ a.xp }} XP</div></div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .big { font-size: 1.4rem; font-weight: 600; } .right { text-align: right; }
    h2 { margin: 18px 0 8px; }
    .bar { height: 10px; border-radius: 6px; background: rgba(34,211,238,.12); overflow: hidden; margin: 10px 0 6px; }
    .bar.thin { height: 5px; margin: 8px 0 0; }
    .bar i { display: block; height: 100%; background: linear-gradient(90deg, #22d3ee, #4ade80); border-radius: 6px; transition: width .5s cubic-bezier(.2,.9,.3,1.2); }
    .quest { margin-bottom: 8px; } .quest.done { border-color: rgba(74,222,128,.5); opacity: .85; }
    .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; text-align: center; }
    .grid4 b { display: block; font-size: 1.2rem; } .grid4 span { font-size: .72rem; color: var(--muted); }
    .heat { display: grid; grid-template-columns: repeat(12, 1fr); grid-auto-flow: column; grid-template-rows: repeat(7, 1fr); gap: 3px; }
    .heat i { aspect-ratio: 1; border-radius: 3px; background: rgba(148,163,184,.12); }
    .heat i.h1 { background: rgba(34,211,238,.3); } .heat i.h2 { background: rgba(34,211,238,.55); }
    .heat i.h3 { background: rgba(34,211,238,.8); } .heat i.h4 { background: #4ade80; }
    .ach { display: grid; gap: 8px; }
    .a { display: flex; gap: 12px; align-items: center; } .a.locked { opacity: .5; } .ico { font-size: 1.6rem; }
  `],
})
export class ProgressPage {
  readonly p = inject(ProgressService);
  readonly all = ACHIEVEMENTS;
  readonly unlockedCount = computed(() => Object.keys(this.p.state().unlocked).length);
  tier(xp: number) { return xp <= 0 ? 0 : xp < 30 ? 1 : xp < 80 ? 2 : xp < 150 ? 3 : 4; }
  delta(a: number, b: number) { return a === b ? '' : a > b ? `▲${a - b}` : `▼${b - a}`; }
}
