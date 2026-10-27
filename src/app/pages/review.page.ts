import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { JarvisService } from '../core/jarvis.service';
import { Review } from '../core/models';
import { StoreService } from '../core/store.service';
import { addDays, uid } from '../core/util';
import { MdPipe } from '../ui/md.pipe';

@Component({
  standalone: true,
  imports: [FormsModule, MdPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Review</h1></div>
      <div class="tabs">
        <button [class.on]="kind() === 'daily'" (click)="kind.set('daily')">Daily shutdown</button>
        <button [class.on]="kind() === 'weekly'" (click)="kind.set('weekly')">Weekly review</button>
        <button [class.on]="kind() === 'history'" (click)="kind.set('history')">History</button>
      </div>

      @if (kind() !== 'history') {
        <div class="card">
          <div class="upper">{{ kind() === 'daily' ? 'Today in numbers' : 'Last 7 days' }}</div>
          <div class="grid3 stats">
            <div><div class="mono big">{{ stats().done }}</div><div class="small muted">tasks done</div></div>
            <div><div class="mono big">{{ stats().focus }}</div><div class="small muted">focus min</div></div>
            <div><div class="mono big">{{ stats().habits }}%</div><div class="small muted">habits</div></div>
          </div>
        </div>

        <div class="card col">
          <label class="field">{{ kind() === 'daily' ? 'Wins today' : 'Wins this week' }}<textarea [(ngModel)]="wins" placeholder="What went well? What did you ship?"></textarea></label>
          <label class="field">Blockers and lessons<textarea [(ngModel)]="blockers" placeholder="What got in the way? What will you change?"></textarea></label>
          <label class="field">Energy: {{ energy }}/5 <input type="range" min="1" max="5" [(ngModel)]="energy"></label>
          @if (kind() === 'daily') {
            <label class="row small"><input type="checkbox" [(ngModel)]="rollover"> Roll unfinished tasks due today to tomorrow ({{ store.dueToday().length + store.overdue().length }})</label>
          }
          <button class="primary" [disabled]="busy() || !wins.trim()" (click)="submit()">{{ busy() ? 'Jarvis is reviewing…' : 'Close the ' + (kind() === 'daily' ? 'day' : 'week') }}</button>
        </div>

        @if (feedback()) {
          <div class="card glow">
            <div class="upper">Jarvis</div>
            <div class="md" [innerHTML]="feedback() | md"></div>
            @if (suggested().length) {
              <button class="small" style="margin-top:8px" (click)="adoptMits()">★ Set these as tomorrow's MITs</button>
            }
          </div>
        }
        @if (error()) { <div class="banner err">{{ error() }}</div> }
      } @else {
        @for (r of history(); track r.id) {
          <div class="card">
            <div class="row between"><b>{{ r.date }}</b><span class="chip" [class.violet]="r.kind === 'weekly'">{{ r.kind }} · energy {{ r.energy }}/5</span></div>
            <p class="small"><b>Wins:</b> {{ r.wins }}</p>
            @if (r.blockers) { <p class="small"><b>Blockers:</b> {{ r.blockers }}</p> }
            @if (r.aiFeedback) { <details><summary class="small muted">Jarvis feedback</summary><div class="md small" [innerHTML]="r.aiFeedback | md"></div></details> }
          </div>
        } @empty { <div class="empty">No reviews yet.</div> }
      }
    </div>
  `,
  styles: [`.stats { text-align: center; margin-top: 8px; } .big { font-size: 1.5rem; color: var(--cyan); }`],
})
export class ReviewPage implements OnInit {
  store = inject(StoreService);
  private jarvis = inject(JarvisService);
  private route = inject(ActivatedRoute);
  readonly kind = signal<'daily' | 'weekly' | 'history'>('daily');
  wins = '';
  blockers = '';
  energy = 3;
  rollover = true;
  readonly busy = signal(false);
  readonly feedback = signal('');
  readonly error = signal('');
  readonly history = computed(() => [...this.store.reviews()].sort((a, b) => b.createdAt - a.createdAt));
  readonly suggested = computed(() => {
    const f = this.feedback();
    if (this.kind() !== 'daily' || !f) return [] as string[];
    return f.split('\n').map(l => l.match(/^\s*\d+[.)]\s+(.*)/)?.[1]?.replace(/\*\*/g, '').trim()).filter((x): x is string => !!x).slice(-3);
  });
  readonly stats = computed(() => {
    const days = this.kind() === 'weekly' ? 7 : 1;
    const dates = Array.from({ length: days }, (_, i) => addDays(this.store.today(), -i));
    const done = this.store.tasks().filter(t => !!t.doneAt && dates.includes(this.localDate(t.doneAt))).length;
    const focus = dates.reduce((a, d) => a + this.store.focusMinutesOn(d), 0);
    const hs = this.store.activeHabits();
    const possible = hs.length * days;
    const hit = hs.reduce((a, h) => a + dates.filter(d => h.log.includes(d)).length, 0);
    return { done, focus, habits: possible ? Math.round(hit / possible * 100) : 0 };
  });

  ngOnInit() { if (this.route.snapshot.queryParamMap.get('weekly')) this.kind.set('weekly'); }

  private localDate(ms: number) { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

  async submit() {
    const kind = this.kind() as 'daily' | 'weekly';
    this.busy.set(true); this.error.set(''); this.feedback.set('');
    try {
      if (kind === 'daily' && this.rollover) {
        const tomorrow = addDays(this.store.today(), 1);
        for (const t of [...this.store.dueToday(), ...this.store.overdue()]) await this.store.updateTask(t.id, { due: tomorrow, isMit: false });
      }
      let ai = '';
      try { ai = await this.jarvis.reviewFeedback(kind, { wins: this.wins, blockers: this.blockers, energy: +this.energy }); }
      catch (e: any) { this.error.set(`Saved without AI feedback: ${e?.message ?? e}`); }
      const r: Review = { id: uid(), date: this.store.today(), kind, wins: this.wins, blockers: this.blockers, energy: +this.energy, aiFeedback: ai, createdAt: Date.now() };
      await this.store.saveReview(r);
      this.feedback.set(ai || 'Review saved. Rest well, sir.');
      this.wins = ''; this.blockers = '';
    } finally { this.busy.set(false); }
  }

  async adoptMits() {
    const tomorrow = addDays(this.store.today(), 1);
    const ids: string[] = [];
    for (const title of this.suggested()) {
      const t = this.store.findTask(title) ?? await this.store.addTask({ title, important: true, due: tomorrow });
      ids.push(t.id);
    }
    await this.store.setMits(ids);
    this.feedback.update(f => f + '\n\n_MITs set._');
  }
}
