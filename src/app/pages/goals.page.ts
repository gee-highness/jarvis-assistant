import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { JarvisService } from '../core/jarvis.service';
import { GOAL_AREAS, Goal } from '../core/models';
import { JarvisDevice } from '../core/native';
import { StoreService } from '../core/store.service';
import { parseYmd } from '../core/util';

interface Draft { title: string; why: string; area: Goal['area']; targetDate: string; unit: string; target: number | null; milestones: string; }
const blank = (): Draft => ({ title: '', why: '', area: 'personal', targetDate: '', unit: '', target: null, milestones: '' });

@Component({
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Goals</h1><button class="primary small" (click)="draft.set(blank())">+ New goal</button></div>
      <p class="small muted">Big outcomes, broken into milestones and daily actions. Progress blends your metric, milestones and linked tasks.</p>

      @for (g of active(); track g.id) {
        <div class="card goal">
          <div class="row between">
            <div class="grow" (click)="open.set(open() === g.id ? '' : g.id)">
              <div class="upper">{{ icon(g) }} {{ areaLabel(g) }}@if (g.targetDate) { <span class="chip" [class.red]="days(g) < 0" [class.gold]="days(g) >= 0 && days(g) <= 14">{{ days(g) < 0 ? -days(g) + 'd overdue' : days(g) + 'd left' }}</span> }</div>
              <b class="gt">{{ g.title }}</b>
              @if (g.why) { <div class="small muted">Why: {{ g.why }}</div> }
            </div>
            <div class="pct mono">{{ pct(g) }}%</div>
          </div>
          <div class="bar"><i [style.width.%]="pct(g)"></i></div>

          @if (open() === g.id) {
            @if (g.metric; as m) {
              <div class="row metric">
                <span class="small muted">{{ m.unit }}</span>
                <input type="number" [ngModel]="m.current" (ngModelChange)="setMetric(g, +$event)" aria-label="Current value">
                <span class="small muted">/ {{ m.target }}</span>
                <button class="small" (click)="setMetric(g, m.current + step(m.target))">+{{ step(m.target) }}</button>
              </div>
            }
            <div class="list">
              @for (m of g.milestones; track m.id) {
                <div class="item small"><button class="check" [class.on]="m.done" (click)="toggle(g, m.id)" [attr.aria-label]="'Toggle ' + m.title"></button><span class="grow" [class.dim]="m.done">{{ m.title }}</span></div>
              }
            </div>
            <div class="row"><input [(ngModel)]="ms[g.id]" placeholder="Add milestone…" (keydown.enter)="addMs(g)"><button class="small" (click)="addMs(g)">Add</button></div>
            <div class="small muted">{{ linked(g).open }} open · {{ linked(g).done }} done linked tasks</div>
            <div class="row wrap">
              <button class="small" (click)="nextAction(g)">＋ Next action today</button>
              <button class="small" [disabled]="jarvis.busy()" (click)="breakdown(g)">✨ Break it down</button>
              <button class="small" (click)="complete(g)">✓ Achieved</button>
              <button class="small ghost" (click)="archive(g)">Archive</button>
              <button class="small danger" (click)="remove(g)">Delete</button>
            </div>
          }
        </div>
      } @empty {
        <div class="card empty">No active goals. A goal turns wishes into direction, sir. Try "Run a 10K by March" or "Save R20,000".</div>
      }

      @if (done().length) {
        <h2 class="upper">Achieved · {{ done().length }}</h2>
        @for (g of done(); track g.id) { <div class="card small">🏆 {{ g.title }}</div> }
      }

      @if (draft(); as d) {
        <div class="scrim" (click)="draft.set(null)">
          <div class="card glow sheet" (click)="$event.stopPropagation()">
            <h2>New goal</h2>
            <label class="field">Goal<input [(ngModel)]="d.title" placeholder="Run a 10K"></label>
            <label class="field">Why it matters<input [(ngModel)]="d.why" placeholder="Energy, health, proving I can"></label>
            <div class="grid2">
              <label class="field">Area<select [(ngModel)]="d.area">@for (a of areas; track a.id) { <option [value]="a.id">{{ a.icon }} {{ a.label }}</option> }</select></label>
              <label class="field">Target date<input type="date" [(ngModel)]="d.targetDate"></label>
            </div>
            <div class="grid2">
              <label class="field">Measure (optional)<input [(ngModel)]="d.unit" placeholder="km, books, R…"></label>
              <label class="field">Target<input type="number" [(ngModel)]="d.target"></label>
            </div>
            <label class="field">Milestones (one per line)<textarea rows="4" [(ngModel)]="d.milestones" placeholder="Run 3 km without stopping&#10;Run 5 km&#10;Run 10 km"></textarea></label>
            <div class="row"><span class="grow"></span><button (click)="draft.set(null)">Cancel</button><button class="primary" [disabled]="!d.title.trim()" (click)="create(d)">Create</button></div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .goal { display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px; } .gt { font-size: 1.05rem; }
    .pct { font-size: 1.3rem; color: var(--cyan); }
    .bar { height: 8px; border-radius: 5px; background: rgba(34,211,238,.12); overflow: hidden; }
    .bar i { display: block; height: 100%; background: linear-gradient(90deg, #22d3ee, #4ade80); transition: width .5s; }
    .metric input { width: 90px; } .dim { text-decoration: line-through; opacity: .6; } .wrap { flex-wrap: wrap; gap: 6px; }
    h2 { margin: 18px 0 8px; }
    .scrim { position: fixed; inset: 0; z-index: 45; background: rgba(0,0,0,.6); display: flex; align-items: flex-end; justify-content: center; }
    .sheet { width: 100%; max-width: 600px; border-radius: 18px 18px 0 0; display: flex; flex-direction: column; gap: 10px; padding-bottom: calc(20px + var(--safe-bottom)); max-height: 90vh; overflow-y: auto; }
  `],
})
export class GoalsPage {
  readonly store = inject(StoreService);
  readonly jarvis = inject(JarvisService);
  private router = inject(Router);
  readonly areas = GOAL_AREAS;
  readonly draft = signal<Draft | null>(null);
  readonly open = signal('');
  ms: Record<string, string> = {};
  readonly active = computed(() => this.store.activeGoals());
  readonly done = computed(() => this.store.goals().filter(g => g.status === 'done'));
  blank = blank;

  icon = (g: Goal) => GOAL_AREAS.find(a => a.id === g.area)?.icon ?? '🎯';
  areaLabel = (g: Goal) => GOAL_AREAS.find(a => a.id === g.area)?.label ?? g.area;
  pct = (g: Goal) => Math.round(this.store.goalProgress(g) * 100);
  days = (g: Goal) => Math.round((parseYmd(g.targetDate!).getTime() - parseYmd(this.store.today()).getTime()) / 86400000);
  step = (target: number) => (target >= 1000 ? 100 : target >= 100 ? 10 : target >= 20 ? 5 : 1);
  linked(g: Goal) { const t = this.store.tasks().filter(x => x.goalId === g.id); return { open: t.filter(x => x.status === 'todo').length, done: t.filter(x => x.status === 'done').length }; }

  async create(d: Draft) {
    const lines = d.milestones.split('\n').map(s => s.trim()).filter(Boolean);
    await this.store.addGoal({
      title: d.title, why: d.why || undefined, area: d.area, targetDate: d.targetDate || undefined,
      metric: d.unit && d.target ? { unit: d.unit, target: Number(d.target), current: 0 } : undefined,
      milestones: lines.map((title, i) => ({ id: 'm' + Date.now() + i, title, done: false })),
    });
    JarvisDevice.haptic({ kind: 'success' }).catch(() => undefined);
    this.draft.set(null);
  }
  setMetric(g: Goal, v: number) { return this.store.updateGoal(g.id, { metric: { ...g.metric!, current: Math.max(0, v) } }); }
  toggle(g: Goal, id: string) { JarvisDevice.haptic({ kind: 'light' }).catch(() => undefined); return this.store.toggleMilestone(g.id, id); }
  async addMs(g: Goal) { const t = (this.ms[g.id] ?? '').trim(); if (!t) return; await this.store.addMilestone(g.id, t); this.ms[g.id] = ''; }
  async nextAction(g: Goal) {
    const title = prompt('Next action for this goal?');
    if (title?.trim()) await this.store.addTask({ title: title.trim(), goalId: g.id, due: this.store.today(), important: true, project: g.title });
  }
  async breakdown(g: Goal) {
    this.router.navigateByUrl('/chat');
    await this.jarvis.send(`Break my goal "${g.title}"${g.why ? ` (why: ${g.why})` : ''} into 4-6 concrete milestones with update_goal (add_milestone), then add the single best first action as a task linked to that goal for today.`);
  }
  async complete(g: Goal) { await this.store.completeGoal(g.id); JarvisDevice.haptic({ kind: 'success' }).catch(() => undefined); }
  archive(g: Goal) { return this.store.updateGoal(g.id, { status: 'archived' }); }
  remove(g: Goal) { return confirm(`Delete "${g.title}"?`) ? this.store.deleteGoal(g.id) : undefined; }
}
