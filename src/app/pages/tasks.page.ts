import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FocusService } from '../core/focus.service';
import { JarvisService } from '../core/jarvis.service';
import { Repeat, Task } from '../core/models';
import { JarvisDevice } from '../core/native';
import { StoreService } from '../core/store.service';
import { VoiceService } from '../core/voice.service';
import { uid } from '../core/util';

type View = 'today' | 'all' | 'timeline' | 'matrix' | 'inbox' | 'done';

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

      @if (project()) {
        <div class="row small"><span class="chip violet">Project: {{ project() }}</span><button class="small ghost" (click)="clearProject()">✕ Clear filter</button></div>
      }
      <div class="tabs">
        @for (v of views; track v.id) {
          <button [class.on]="view() === v.id" (click)="view.set(v.id)">{{ v.label }}@if (v.id === 'inbox' && store.inbox().length) { <span class="chip gold">{{ store.inbox().length }}</span> }</button>
        }
      </div>

      <div class="row">
        <input class="grow" type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Search tasks, notes, labels…" aria-label="Search tasks">
        <button class="small" [class.primary]="selecting()" (click)="toggleSelect()">{{ selecting() ? 'Done' : 'Select' }}</button>
      </div>
      @if (allTags().length) {
        <div class="row wrap tags">
          @for (t of allTags(); track t) { <button class="small" [class.primary]="tag() === t" (click)="tag.set(tag() === t ? '' : t)">#{{ t }}</button> }
        </div>
      }
      @if (selecting()) {
        <div class="card row wrap bulk">
          <span class="small">{{ picked().size }} selected</span><span class="grow"></span>
          <button class="small" [disabled]="!picked().size" (click)="bulk('done')">✓ Done</button>
          <button class="small" [disabled]="!picked().size" (click)="bulk('snooze')">Tomorrow</button>
          <button class="small" [disabled]="!picked().size" (click)="bulk('mit')">★ MIT</button>
          <button class="small" [disabled]="!picked().size" (click)="bulk('project')">Project…</button>
          <button class="small" [disabled]="!picked().size" (click)="bulk('tag')">#Label…</button>
          <button class="small danger" [disabled]="!picked().size" (click)="bulk('delete')">Delete</button>
        </div>
      }

      @if (view() === 'timeline') {
        @for (g of timeline(); track g.label) {
          <div class="card">
            <div class="upper" [style.color]="g.late ? 'var(--red)' : ''">{{ g.label }} · {{ g.tasks.length }}@if (g.minutes) { · {{ g.minutes }}m }</div>
            <div class="list">
              @for (t of g.tasks; track t.id) {
                <div class="item small">
                  <button class="check" (click)="toggle(t)" [attr.aria-label]="'Complete ' + t.title"></button>
                  <span class="grow" (click)="edit(t)">{{ t.title }}</span>
                  @if (t.estimateMin) { <span class="chip">{{ t.estimateMin }}m</span> }
                </div>
              }
            </div>
          </div>
        } @empty { <div class="card empty">Nothing scheduled.</div> }
      } @else if (view() === 'matrix') {
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
          @if (list().length && !hintSeen) { <div class="small dim" style="margin-bottom:6px">Swipe right to complete, left to snooze a day.</div> }
          <div class="list">
            @for (t of list(); track t.id) {
              <div class="item swipe" (touchstart)="ts($event)" (touchmove)="tm($event, t)" (touchend)="te($event, t)" (touchcancel)="reset($event)">
                @if (selecting()) { <input type="checkbox" [checked]="picked().has(t.id)" (change)="pick(t.id)" [attr.aria-label]="'Select ' + t.title"> }
                <button class="check" [class.on]="t.status === 'done'" (click)="toggle(t)" [attr.aria-label]="'Complete ' + t.title"></button>
                <div class="grow" (click)="edit(t)">
                  <div [class.done]="t.status === 'done'">{{ t.title }}</div>
                  <div class="row wrap tags">
                    @if (t.due) { <span class="chip" [class.red]="t.due < store.today()" [class.gold]="t.due === store.today()">{{ t.due === store.today() ? 'today' : t.due }}</span> }
                    @if (t.urgent) { <span class="chip red">urgent</span> }
                    @if (t.important) { <span class="chip cyan">important</span> }
                    @if (t.estimateMin) { <span class="chip">{{ t.estimateMin }}m</span> }
                    @if (t.project) { <span class="chip violet">{{ t.project }}</span> }
                    @for (g of t.tags ?? []; track g) { <span class="chip">#{{ g }}</span> }
                    @if (t.repeat) { <span class="chip">↻ {{ t.repeat.every }}</span> }
                    @if (t.subtasks?.length) { <span class="chip">☑ {{ subDone(t) }}/{{ t.subtasks!.length }}</span> }
                    @if (t.goalId && goalTitle(t.goalId); as gt) { <span class="chip gold">🎯 {{ gt }}</span> }
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
            <label class="field">Project<input [(ngModel)]="e.project" list="projlist"></label>
            <datalist id="projlist">@for (p of store.projects(); track p.name) { <option [value]="p.name"></option> }</datalist>
            <div class="grid2">
              <label class="field">Repeat
                <select [ngModel]="e.repeat?.every ?? ''" (ngModelChange)="setRepeat(e, $event)">
                  <option value="">Never</option><option value="daily">Daily</option><option value="weekdays">Weekdays</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                </select></label>
              <label class="field">Goal
                <select [(ngModel)]="e.goalId"><option [ngValue]="undefined">None</option>@for (g of store.activeGoals(); track g.id) { <option [value]="g.id">{{ g.title }}</option> }</select></label>
            </div>
            <div class="field">Checklist
              @for (st of e.subtasks ?? []; track st.id) {
                <div class="row small"><input type="checkbox" [(ngModel)]="st.done"><input class="grow" [(ngModel)]="st.title"><button class="ghost small" (click)="delSub(e, st.id)" aria-label="Remove">✕</button></div>
              }
              <div class="row"><input class="grow" [(ngModel)]="newSub" placeholder="Add a step…" (keydown.enter)="addSub(e)"><button class="small" (click)="addSub(e)">Add</button></div>
            </div>
            <div class="row wrap">
              <span class="small muted">Move:</span>
              <button class="small" (click)="snooze(e, 1)">Tomorrow</button><button class="small" (click)="snooze(e, 3)">+3 days</button><button class="small" (click)="snooze(e, 7)">Next week</button>
            </div>
            <label class="field">Labels (comma separated)<input [ngModel]="(e.tags ?? []).join(', ')" (ngModelChange)="setTags(e, $event)" placeholder="calls, errands"></label>
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
    .tags { gap: 4px; margin-top: 3px; } .wrap { flex-wrap: wrap; } .bulk { gap: 6px; }
    .swipe { touch-action: pan-y; transition: transform .18s, background .18s; border-radius: 10px; }
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
  newSub = '';
  hintSeen = (() => { try { return localStorage.getItem('jarvis_swipe_hint') === '1'; } catch { return false; } })();
  readonly project = signal('');
  readonly query = signal('');
  readonly tag = signal('');
  readonly selecting = signal(false);
  readonly picked = signal<Set<string>>(new Set());
  readonly allTags = computed(() => [...new Set(this.store.openTasks().flatMap(t => t.tags ?? []))].sort());

  readonly timeline = computed(() => {
    const today = this.store.today();
    const open = this.filtered(this.store.openTasks());
    const groups = new Map<string, Task[]>();
    for (const t of open) { const k = t.due ? (t.due < today ? 'Overdue' : t.due) : 'No date'; groups.set(k, [...(groups.get(k) ?? []), t]); }
    const label = (k: string) => k === today ? 'Today' : /^\d{4}/.test(k) ? new Date(k + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : k;
    const keys = [...groups.keys()].sort((a, b) => (a === 'Overdue' ? -1 : b === 'Overdue' ? 1 : a === 'No date' ? 1 : b === 'No date' ? -1 : a.localeCompare(b)));
    return keys.map(k => ({ label: label(k), late: k === 'Overdue', tasks: groups.get(k)!, minutes: groups.get(k)!.reduce((a, t) => a + (t.estimateMin ?? 0), 0) }));
  });

  private filtered(a: Task[]): Task[] {
    const q = this.query().trim().toLowerCase(), tg = this.tag();
    return a.filter(t => (!tg || t.tags?.includes(tg)) && (!q || `${t.title} ${t.notes ?? ''} ${t.project ?? ''} ${(t.tags ?? []).join(' ')}`.toLowerCase().includes(q)));
  }

  toggleSelect() { this.selecting.update(v => !v); this.picked.set(new Set()); }
  pick(id: string) { this.picked.update(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  setTags(e: Task, v: string) { e.tags = v.split(',').map(x => x.trim().replace(/^#/, '')).filter(Boolean); }

  async bulk(action: 'done' | 'snooze' | 'mit' | 'project' | 'tag' | 'delete') {
    const ids = [...this.picked()];
    if (!ids.length) return;
    if (action === 'delete' && !confirm(`Delete ${ids.length} task(s)?`)) return;
    let arg = '';
    if (action === 'project') { arg = (prompt('Move to project:') ?? '').trim(); if (!arg) return; }
    if (action === 'tag') { arg = (prompt('Add label:') ?? '').trim().replace(/^#/, ''); if (!arg) return; }
    for (const id of ids) {
      const t = this.store.tasks().find(x => x.id === id); if (!t) continue;
      if (action === 'done') await this.store.completeTask(id);
      else if (action === 'snooze') await this.store.snoozeTask(id, 1);
      else if (action === 'delete') await this.store.deleteTask(id);
      else if (action === 'project') await this.store.updateTask(id, { project: arg });
      else if (action === 'tag') await this.store.updateTask(id, { tags: [...new Set([...(t.tags ?? []), arg])] });
    }
    if (action === 'mit') await this.store.setMits(ids);
    JarvisDevice.haptic({ kind: 'success' }).catch(() => undefined);
    this.picked.set(new Set());
  }
  smart = true;
  readonly adding = signal(false);
  readonly view = signal<View>('today');
  readonly editing = signal<Task | null>(null);
  readonly views: { id: View; label: string }[] = [
    { id: 'today', label: 'Today' }, { id: 'all', label: 'All' }, { id: 'timeline', label: 'Timeline' }, { id: 'matrix', label: 'Matrix' }, { id: 'inbox', label: 'Inbox' }, { id: 'done', label: 'Done' },
  ];
  readonly quadrants = [
    { key: 'do', title: 'Do now', hint: 'Urgent · important', color: 'var(--red)' },
    { key: 'schedule', title: 'Schedule', hint: 'Important · not urgent', color: 'var(--cyan)' },
    { key: 'delegate', title: 'Delegate', hint: 'Urgent · not important', color: 'var(--gold)' },
    { key: 'drop', title: 'Drop', hint: 'Neither', color: 'var(--dim)' },
  ];

  readonly list = computed(() => {
    const byPriority = (a: Task, b: Task) =>
      (+b.isMit - +a.isMit) || ((a.due ?? '9999') < (b.due ?? '9999') ? -1 : (a.due ?? '9999') > (b.due ?? '9999') ? 1 : 0) ||
      (+(b.urgent && b.important) - +(a.urgent && a.important)) || (+b.important - +a.important) || b.createdAt - a.createdAt;
    const proj = this.project();
    const only = (a: Task[]) => this.filtered(proj ? a.filter(t => t.project === proj) : a);
    return only(this.base(byPriority));
  });
  private base(byPriority: (a: Task, b: Task) => number): Task[] {
    const s = this.store;
    switch (this.view()) {
      case 'today': return [...new Set([...s.mits(), ...s.overdue(), ...s.dueToday(), ...s.openTasks().filter(t => t.urgent && t.important)])].sort(byPriority);
      case 'inbox': return s.inbox();
      case 'done': return s.tasks().filter(t => t.status === 'done').sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)).slice(0, 100);
      default: return [...s.openTasks()].sort(byPriority);
    }
  }
  readonly emptyText = computed(() => ({ today: 'Nothing urgent today. Pick MITs with ★.', all: 'No open tasks. Enjoy it, sir.', inbox: 'Inbox zero.', done: 'Nothing completed yet.', matrix: '', timeline: '' })[this.view()]);

  ngOnInit() {
    if (this.route.snapshot.queryParamMap.get('add')) setTimeout(() => this.dictate(), 300);
    this.route.queryParamMap.subscribe(q => { const p = q.get('project') ?? ''; this.project.set(p); if (p) this.view.set('all'); });
  }

  clearProject() { this.router.navigate([], { queryParams: { project: null }, queryParamsHandling: 'merge' }); }
  goalTitle(id: string) { return this.store.goals().find(g => g.id === id)?.title; }
  subDone(t: Task) { return t.subtasks?.filter(x => x.done).length ?? 0; }

  async toggle(t: Task) {
    const done = t.status !== 'done';
    await this.store.completeTask(t.id, done);
    if (done) JarvisDevice.haptic({ kind: 'success' }).catch(() => undefined);
  }

  // ---- swipe gestures: right = complete, left = snooze one day
  private sx = 0; private sy = 0; private dx = 0; private lock = false;
  ts(e: TouchEvent) { const t = e.touches[0]; this.sx = t.clientX; this.sy = t.clientY; this.dx = 0; this.lock = false; }
  tm(e: TouchEvent, t: Task) {
    if (t.status !== 'todo' || this.lock) return;
    const p = e.touches[0], dx = p.clientX - this.sx, dy = p.clientY - this.sy;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { this.lock = true; return; }
    if (Math.abs(dx) < 12) return;
    this.dx = dx;
    const el = e.currentTarget as HTMLElement;
    el.style.transform = `translateX(${Math.max(-140, Math.min(140, dx))}px)`;
    el.style.background = dx > 0 ? 'rgba(74,222,128,.2)' : 'rgba(250,204,21,.2)';
  }
  async te(e: TouchEvent, t: Task) {
    const dx = this.dx; this.dx = 0; this.reset(e);
    if (t.status !== 'todo' || this.lock) return;
    if (dx > 90) { await this.toggle(t); this.seen(); }
    else if (dx < -90) { JarvisDevice.haptic({ kind: 'light' }).catch(() => undefined); await this.store.snoozeTask(t.id, 1); this.seen(); }
  }
  reset(e: Event) { const el = e.currentTarget as HTMLElement; el.style.transform = ''; el.style.background = ''; }
  private seen() { this.hintSeen = true; try { localStorage.setItem('jarvis_swipe_hint', '1'); } catch { /* ignore */ } }

  setRepeat(e: Task, v: string) { e.repeat = v ? ({ every: v, interval: e.repeat?.interval ?? 1 } as Repeat) : undefined; }
  addSub(e: Task) { const t = this.newSub.trim(); if (!t) return; e.subtasks = [...(e.subtasks ?? []), { id: uid(), title: t, done: false }]; this.newSub = ''; }
  delSub(e: Task, id: string) { e.subtasks = (e.subtasks ?? []).filter(s => s.id !== id); }
  snooze(e: Task, days: number) { e.due = this.shift(e.due, days); }
  private shift(due: string | undefined, days: number) {
    const base = due && due > this.store.today() ? due : this.store.today();
    const d = new Date(base + 'T00:00:00'); d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

  edit(t: Task) { this.editing.set({ ...t, subtasks: t.subtasks?.map(x => ({ ...x })), repeat: t.repeat ? { ...t.repeat } : undefined }); }

  async save(e: Task) {
    await this.store.updateTask(e.id, { ...e, estimateMin: e.estimateMin ? Number(e.estimateMin) : undefined, due: e.due || undefined, goalId: e.goalId || undefined, project: e.project?.trim() || undefined, repeat: e.repeat, tags: e.tags?.length ? e.tags : undefined, subtasks: e.subtasks?.length ? e.subtasks : undefined, inbox: false });
    if (e.isMit) { const ids = this.store.mits().map(m => m.id); if (!ids.includes(e.id)) await this.store.setMits([...ids, e.id].slice(-3)); }
    this.editing.set(null);
  }

  async remove(e: Task) { await this.store.deleteTask(e.id); this.editing.set(null); }

  async triage() {
    this.router.navigateByUrl('/chat');
    await this.jarvis.send('Triage my inbox tasks: for each, decide urgent/important, add a realistic estimate and due date where sensible, using update_task. Then summarise briefly.');
  }
}
