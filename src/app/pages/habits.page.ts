import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Habit } from '../core/models';
import { StoreService } from '../core/store.service';
import { addDays, parseYmd } from '../core/util';

@Component({
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Habits</h1><span class="chip cyan">{{ doneToday() }}/{{ store.activeHabits().length }} today</span></div>

      <div class="card row">
        <input [(ngModel)]="name" placeholder="New habit, e.g. Read 20 pages" (keydown.enter)="add()">
        <select [(ngModel)]="cadence" style="width:110px"><option value="daily">Daily</option><option value="weekly">Weekly</option></select>
        <button class="primary" [disabled]="!name.trim()" (click)="add()">Add</button>
      </div>

      <div class="card">
        <div class="grid-head">
          <span></span>
          @for (d of days(); track d) { <span class="mono tiny" [class.today]="d === store.today()">{{ dayLabel(d) }}</span> }
          <span class="tiny">🔥</span>
        </div>
        @for (h of store.activeHabits(); track h.id) {
          <div class="grid-row">
            <span class="name" (click)="menu.set(menu() === h.id ? null : h.id)">{{ h.name }}@if (h.cadence === 'weekly') { <span class="chip">{{ weekCount(h) }}/{{ h.target }}</span> }</span>
            @for (d of days(); track d) {
              <button class="cell" [class.on]="h.log.includes(d)" (click)="store.toggleHabit(h.id, d)" [attr.aria-label]="h.name + ' ' + d"></button>
            }
            <span class="mono streak">{{ store.streak(h) }}</span>
          </div>
          @if (menu() === h.id) {
            <div class="row menu">
              <span class="small muted grow">Best streak: {{ best(h) }} · {{ rate(h) }}% last 30 days</span>
              <button class="small" (click)="store.archiveHabit(h.id); menu.set(null)">Archive</button>
              <button class="small danger" (click)="store.deleteHabit(h.id); menu.set(null)">Delete</button>
            </div>
          }
        } @empty { <div class="empty">No habits yet. Start with one tiny daily habit, sir.</div> }
      </div>

      @if (archived().length) {
        <div class="card">
          <h3>Archived</h3>
          @for (h of archived(); track h.id) {
            <div class="item small"><span class="grow dim">{{ h.name }}</span><button class="small" (click)="store.archiveHabit(h.id, false)">Restore</button></div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .grid-head, .grid-row { display: grid; grid-template-columns: minmax(90px, 1.6fr) repeat(7, 1fr) 30px; align-items: center; gap: 4px; }
    .grid-row { padding: 7px 0; border-top: 1px solid rgba(var(--accent-rgb), .08); }
    .tiny { font-size: .65rem; color: var(--dim); text-align: center; }
    .tiny.today { color: var(--cyan); }
    .name { font-size: .9rem; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
    .cell { min-height: 0; height: 28px; padding: 0; border-radius: 7px; background: rgba(var(--accent-rgb), .05); border: 1px solid var(--line); }
    .cell.on { background: var(--cyan); border-color: var(--cyan); box-shadow: 0 0 8px rgba(var(--accent-rgb), .6); }
    .streak { text-align: center; color: var(--gold); }
    .menu { padding: 6px 0 10px; }
  `],
})
export class HabitsPage {
  store = inject(StoreService);
  name = '';
  cadence: Habit['cadence'] = 'daily';
  readonly menu = signal<string | null>(null);
  readonly days = computed(() => Array.from({ length: 7 }, (_, i) => addDays(this.store.today(), i - 6)));
  readonly archived = computed(() => this.store.habits().filter(h => h.archived));
  readonly doneToday = computed(() => this.store.activeHabits().filter(h => h.log.includes(this.store.today())).length);

  dayLabel(d: string) { return parseYmd(d).toLocaleDateString(undefined, { weekday: 'narrow' }); }

  async add() {
    if (!this.name.trim()) return;
    await this.store.addHabit(this.name, this.cadence, this.cadence === 'weekly' ? 3 : 7);
    this.name = '';
  }

  weekCount(h: Habit) { return this.days().filter(d => h.log.includes(d)).length; }

  best(h: Habit): number {
    const sorted = [...h.log].sort();
    let best = 0, cur = 0, prev = '';
    for (const d of sorted) { cur = prev && addDays(prev, 1) === d ? cur + 1 : 1; best = Math.max(best, cur); prev = d; }
    return best;
  }

  rate(h: Habit) {
    const days = Array.from({ length: 30 }, (_, i) => addDays(this.store.today(), -i));
    return Math.round(days.filter(d => h.log.includes(d)).length / 30 * 100);
  }
}
