import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FocusService } from '../core/focus.service';
import { TimeBlock } from '../core/models';
import { PlannerService } from '../core/planner.service';
import { StoreService } from '../core/store.service';
import { hm, minutesOf } from '../core/util';

@Component({
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Planner</h1><span class="chip cyan">{{ store.today() }}</span></div>

      <div class="card col">
        <div class="grid2">
          <label class="field">From<input type="time" [(ngModel)]="from"></label>
          <label class="field">To<input type="time" [(ngModel)]="to"></label>
        </div>
        <label class="field">Fixed events and notes for Jarvis
          <textarea [(ngModel)]="notes" placeholder="e.g. 13:00-14:00 lunch with Sam; low energy after 3pm; gym at 17:30"></textarea>
        </label>
        <button class="primary" [disabled]="planner.busy()" (click)="generate()">{{ planner.busy() ? 'Planning…' : (plan() ? '↻ Re-plan with Jarvis' : '✨ Plan my day') }}</button>
        <p class="small dim" style="margin:0">MITs go first in your freshest hours, small tasks are batched, and breaks follow every 60–90 minutes.</p>
      </div>

      @if (plan(); as p) {
        <div class="card">
          <div class="timeline">
            @for (b of p.blocks; track $index) {
              <div class="block" [class]="b.kind" [class.now]="isNow(b)" [class.past]="isPast(b)">
                <div class="times mono small">
                  <input type="time" [ngModel]="b.start" (ngModelChange)="retime($index, 'start', $event)">
                  <input type="time" [ngModel]="b.end" (ngModelChange)="retime($index, 'end', $event)">
                </div>
                <div class="grow">
                  <div>{{ b.label }}</div>
                  <div class="small dim">{{ duration(b) }} min · {{ b.kind }}</div>
                </div>
                <div class="col acts">
                  @if (b.kind !== 'break' && b.kind !== 'fixed') { <button class="small" (click)="startBlock(b)">▶</button> }
                  <button class="small ghost" (click)="removeBlock($index)">✕</button>
                </div>
              </div>
            }
          </div>
          <div class="row" style="margin-top:10px">
            <input [(ngModel)]="newLabel" placeholder="Add block label">
            <button (click)="addBlock()" [disabled]="!newLabel.trim()">＋</button>
          </div>
        </div>
      } @else {
        <div class="empty card">No plan yet for today.</div>
      }
    </div>
  `,
  styles: [`
    .timeline { display: flex; flex-direction: column; gap: 8px; }
    .block { display: flex; gap: 10px; align-items: center; padding: 10px; border-radius: 12px; border: 1px solid var(--line); border-left: 4px solid var(--cyan); background: rgba(34,211,238,.04); }
    .block.break { border-left-color: var(--green); }
    .block.admin { border-left-color: var(--gold); }
    .block.fixed { border-left-color: var(--violet); }
    .block.now { box-shadow: var(--glow); border-color: var(--line-strong); background: rgba(34,211,238,.1); }
    .block.past { opacity: .5; }
    .times { display: flex; flex-direction: column; gap: 3px; width: 92px; }
    .times input { padding: 3px 5px; font-size: .78rem; }
    .acts { gap: 4px; }
  `],
})
export class PlannerPage {
  store = inject(StoreService);
  planner = inject(PlannerService);
  private focus = inject(FocusService);
  private router = inject(Router);
  from = this.defaultFrom();
  to = this.store.settings().workEnd;
  notes = '';
  newLabel = '';
  private tick = signal(Date.now());
  readonly plan = computed(() => this.store.todayPlan());

  constructor() { setInterval(() => this.tick.set(Date.now()), 60_000); }

  private defaultFrom(): string {
    const s = this.store.settings();
    const now = minutesOf(hm());
    const start = Math.max(minutesOf(s.workStart), Math.ceil(now / 15) * 15);
    return `${String(Math.floor(start / 60) % 24).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`;
  }

  async generate() {
    const fixed: TimeBlock[] = [];
    for (const m of this.notes.matchAll(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\s+([^;\n,]+)/g)) {
      fixed.push({ start: m[1].padStart(5, '0'), end: m[2].padStart(5, '0'), label: m[3].trim(), kind: 'fixed' });
    }
    await this.planner.generate({ from: this.from, to: this.to, notes: this.notes, fixed });
  }

  duration(b: TimeBlock) { return minutesOf(b.end) - minutesOf(b.start); }
  isNow(b: TimeBlock) { this.tick(); const n = minutesOf(hm()); return minutesOf(b.start) <= n && minutesOf(b.end) > n; }
  isPast(b: TimeBlock) { this.tick(); return minutesOf(b.end) <= minutesOf(hm()); }

  private async mutate(fn: (blocks: TimeBlock[]) => TimeBlock[]) {
    const p = this.plan();
    if (!p) return;
    const blocks = fn(p.blocks.map(b => ({ ...b }))).sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
    await this.store.savePlan({ ...p, blocks });
  }

  retime(i: number, key: 'start' | 'end', v: string) { if (v) this.mutate(bs => { bs[i][key] = v; return bs; }); }
  removeBlock(i: number) { this.mutate(bs => bs.filter((_, j) => j !== i)); }

  addBlock() {
    const p = this.plan();
    const last = p?.blocks.at(-1)?.end ?? this.from;
    const start = minutesOf(last);
    const mk = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const block: TimeBlock = { start: mk(start), end: mk(start + 30), label: this.newLabel.trim(), kind: 'focus' };
    if (p) this.mutate(bs => [...bs, block]);
    else this.store.savePlan({ date: this.store.today(), blocks: [block], createdAt: Date.now() });
    this.newLabel = '';
  }

  async startBlock(b: TimeBlock) {
    const remaining = Math.max(5, minutesOf(b.end) - Math.max(minutesOf(b.start), minutesOf(hm())));
    await this.focus.start({ minutes: Math.min(remaining, 120), taskId: b.taskId, label: b.label });
    this.router.navigateByUrl('/focus');
  }
}
