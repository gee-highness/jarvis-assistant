import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FocusService } from '../core/focus.service';
import { JarvisService } from '../core/jarvis.service';
import { Task } from '../core/models';
import { StoreService } from '../core/store.service';
import { VoiceService } from '../core/voice.service';

type View = 'today' | 'all' | 'matrix' | 'inbox' | 'done';

@Component({
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Tasks</h1><span class="chip cyan">{{ store.openTasks().length }} open</span></div>

      <div class="card glow">
        <div class="row">
          <input [(ngModel)]="capture" placeholder="Capture anything… e.g. 'email Sam friday, 30 min'" (keydown.enter)="add()" #cap>
          <button class="icon" (click)="dictate()" aria-label="Dictate">🎙</button>
        </div>
        <div class="row between" style="margin-top:8px">
          <label class="row small muted"><input type="checkbox" [(ngModel)]="smart"> Jarvis parses it (dates, estimates)</label>
          <button class="primary small" [disabled]="!capture.trim() || adding()" (click)="add()">{{ adding() ? 'Adding…' : 'Add' }}</button>
        </div>
      </div>

      <div class="tabs">
        @for (v of views; track v.id) {
          <button [class.on]="view() === v.id" (click)="view.set(v.id)">{{ v.label }}@if (v.id === 'inbox' && store.inbox().length) { <span class="chip gold">{{ store.inbox().length }}</span> }</button>
        }
      </div>

      @if (view() === 'matrix') {
        <div class="matrix">
          @for (q of quadrants; track q.key) {
            <div class="card quad" [style.border-color]="q.color">
              <div class="upper" [style.color]="q.color">{{ q.title }}</div>
              <div class="small dim">{{ q.hint }}</div>
              <div class="list">
                @for (t of quadrant(q.key); track t.id) {
                  <div class="item small">
                    <button class="check" (click)="store.completeTask(t.id)"></button>
                    <span class="grow" (click)="edit(t)">{{ t.title }}</span>
                  </div>
                } @empty { <div class="dim small">—</div> }
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="card">
          @if (view() === 'inbox' && store.inbox().length) {
            <div class="row between" style="margin-bottom:8px"><span class="small muted">Untriaged captures</span>
              <button class="small" [disabled]="jarvis.busy()" (click)="triage()">✨ Triage with Jarvis</button></div>
          }
          <div class="list">
            @for (t of list(); track t.id) {
              <div class="item">
                <button class="check" [class.on]="t.status === 'done'" (click)="store.completeTask(t.id, t.status !== 'done')"></button>
                <div class="grow" (click)="edit(t)">
                  <div [class.done]="t.status === 'done'">{{ t.title }}</div>
                  <div class="row wrap tags">
                    @if (t.due) { <span class="chip" [class.red]="t.due < store.today()" [class.gold]="t.due === store.today()">{{ t.due === store.today() ? 'today' : t.due }}</span> }
                    @if (t.urgent) { <span class="chip red">urgent</span> }
                    @if (t.important) { <span class="chip cyan">important</span> }
                    @if (t.estimateMin) { <span class="chip">{{ t.estimateMin }}m</span> }
                    @if (t.project) { <span class="chip violet">{{ t.project }}</span> }
                  </div>
                </div>
                @if (t.status === 'todo') {
                  <button class="ghost icon" [style.color]="t.isMit ? 'var(--gold)' : 'var(--dim)'" (click)="toggleMit(t)" aria-label="MIT">★</button>
                  <button class="ghost icon" (click)="focusOn(t)" aria-label="Focus">▶</button>
                }
              </div>
            } @empty { <div class="empty">{{ emptyText() }}</div> }
          </div>
        </div>
      }

      @if (editing(); as e) {
        <div class="scrim" (click)="editing.set(null)">
          <div class="card glow sheet" (click)="$event.stopPropagation()">
            <h2>Edit task</h2>
            <label class="field">Title<input [(ngModel)]="e.title"></label>
            <div class="grid2">
              <label class="field">Due<input type="date" [(ngModel)]="e.due"></label>
              <label class="field">Estimate (min)<input type="number" [(ngModel)]="e.estimateMin"></label>
            </div>
            <label class="field">Project<input [(ngModel)]="e.project"></label>
            <label class="field">Notes<textarea [(ngModel)]="e.notes"></textarea></label>
            <div class="row wrap">
              <label class="row small"><input type="checkbox" [(ngModel)]="e.urgent"> Urgent</label>
              <label class="row small"><input type="checkbox" [(ngModel)]="e.important"> Important</label>
              <label class="row small"><input type="checkbox" [(ngModel)]="e.isMit"> MIT today</label>
            </div>
            <div class="row">
              <button class="danger" (click)="remove(e)">Delete</button>
              <span class="grow"></span>
              <button (click)="editing.set(null)">Cancel</button>
              <button class="primary" (click)="save(e)">Save</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .matrix { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .quad { min-height: 150px; padding: 10px; }
    .done { text-decoration: line-through; color: var(--dim); }
    .tags { gap: 4px; margin-top: 3px; }
    .scrim { position: fixed; inset: 0; z-index: 45; background: rgba(0,0,0,.6); display: flex; align-items: flex-end; justify-content: center; }
    .sheet { width: 100%; max-width: 600px; border-radius: 18px 18px 0 0; display: flex; flex-direction: column; gap: 10px; padding-bottom: calc(20px + var(--safe-bottom)); max-height: 90vh; overflow-y: auto; }
  `],
})
export class TasksPage implements OnInit {
  store = inject(StoreService);
  jarvis = inject(JarvisService);
  private voice = inject(VoiceService);
  private focus = inject(FocusService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  capture = '';
  smart = true;
  readonly adding = signal(false);
  readonly view = signal<View>('today');
  readonly editing = signal<Task | null>(null);
  readonly views: { id: View; label: string }[] = [
    { id: 'today', label: 'Today' }, { id: 'all', label: 'All' }, { id: 'matrix', label: 'Matrix' }, { id: 'inbox', label: 'Inbox' }, { id: 'done', label: 'Done' },
  ];
  readonly quadrants = [
    { key: 'do', title: 'Do now', hint: 'Urgent · important', color: 'var(--red)' },
    { key: 'schedule', title: 'Schedule', hint: 'Important · not urgent', color: 'var(--cyan)' },
    { key: 'delegate', title: 'Delegate', hint: 'Urgent · not important', color: 'var(--gold)' },
    { key: 'drop', title: 'Drop', hint: 'Neither', color: 'var(--dim)' },
  ];

  readonly list = computed(() => {
    const s = this.store;
    const byPriority = (a: Task, b: Task) =>
      (+b.isMit - +a.isMit) || ((a.due ?? '9999') < (b.due ?? '9999') ? -1 : (a.due ?? '9999') > (b.due ?? '9999') ? 1 : 0) ||
      (+(b.urgent && b.important) - +(a.urgent && a.important)) || (+b.important - +a.important) || b.createdAt - a.createdAt;
    switch (this.view()) {
      case 'today': return [...new Set([...s.mits(), ...s.overdue(), ...s.dueToday(), ...s.openTasks().filter(t => t.urgent && t.important)])].sort(byPriority);
      case 'inbox': return s.inbox();
      case 'done': return s.tasks().filter(t => t.status === 'done').sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)).slice(0, 100);
      default: return [...s.openTasks()].sort(byPriority);
    }
  });
  readonly emptyText = computed(() => ({ today: 'Nothing urgent today. Pick MITs with ★.', all: 'No open tasks. Enjoy it, sir.', inbox: 'Inbox zero.', done: 'Nothing completed yet.', matrix: '' })[this.view()]);

  ngOnInit() {
    if (this.route.snapshot.queryParamMap.get('add')) setTimeout(() => this.dictate(), 300);
  }

  quadrant(key: string): Task[] {
    return this.store.openTasks().filter(t =>
      key === 'do' ? t.urgent && t.important : key === 'schedule' ? !t.urgent && t.important : key === 'delegate' ? t.urgent && !t.important : !t.urgent && !t.important);
  }

  async add() {
    const text = this.capture.trim();
    if (!text) return;
    this.adding.set(true);
    try {
      if (this.smart) await this.jarvis.quickCapture(text);
      else await this.store.addTask({ title: text, inbox: true });
      this.capture = '';
    } finally { this.adding.set(false); }
  }

  async dictate() {
    const heard = await this.voice.listen();
    if (heard) { this.capture = heard; await this.add(); }
  }

  async toggleMit(t: Task) {
    const ids = this.store.mits().map(m => m.id);
    await this.store.setMits(t.isMit ? ids.filter(i => i !== t.id) : [...ids, t.id].slice(-3));
  }

  async focusOn(t: Task) { await this.focus.start({ taskId: t.id }); this.router.navigateByUrl('/focus'); }

  edit(t: Task) { this.editing.set({ ...t }); }

  async save(e: Task) {
    await this.store.updateTask(e.id, { ...e, estimateMin: e.estimateMin ? Number(e.estimateMin) : undefined, due: e.due || undefined, inbox: false });
    if (e.isMit) { const ids = this.store.mits().map(m => m.id); if (!ids.includes(e.id)) await this.store.setMits([...ids, e.id].slice(-3)); }
    this.editing.set(null);
  }

  async remove(e: Task) { await this.store.deleteTask(e.id); this.editing.set(null); }

  async triage() {
    this.router.navigateByUrl('/chat');
    await this.jarvis.send('Triage my inbox tasks: for each, decide urgent/important, add a realistic estimate and due date where sensible, using update_task. Then summarise briefly.');
  }
}
