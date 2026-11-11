import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JarvisService } from '../core/jarvis.service';
import { ReflexService } from '../core/reflex/reflex.service';
import { JournalEntry } from '../core/models';
import { JarvisDevice } from '../core/native';
import { OllamaService } from '../core/ollama.service';
import { StoreService } from '../core/store.service';
import { addDays, parseYmd } from '../core/util';
import { MdPipe } from '../ui/md.pipe';

const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
const PROMPTS = [
  'What is one thing that went well today?', 'What drained your energy today, and what gave you some back?', 'What would make tomorrow a win?',
  'What are you avoiding, and what is the smallest first step?', 'Who helped you today? How could you thank them?', 'What did you learn today?',
  'What are you proud of this week?', 'If today repeated for a year, would you be happy?',
];
const TAGS = ['work', 'family', 'health', 'money', 'learning', 'rest', 'stress', 'win'];

@Component({
  standalone: true,
  imports: [FormsModule, DatePipe, MdPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Journal</h1><span class="chip cyan">{{ store.journal().length }} entries</span></div>

      <div class="card glow stack">
        <div class="upper">{{ store.todayJournal() ? 'Today · update' : 'Daily check-in' }}</div>
        <div>
          <div class="small muted">Mood</div>
          <div class="scale">@for (m of moods; track $index) { <button [class.on]="mood() === $index + 1" (click)="mood.set($index + 1)" [attr.aria-label]="'Mood ' + ($index + 1)">{{ m }}</button> }</div>
        </div>
        <div>
          <div class="small muted">Energy</div>
          <div class="scale">@for (n of [1,2,3,4,5]; track n) { <button [class.on]="energy() === n" (click)="energy.set(n)">{{ '⚡'.repeat(n) }}</button> }</div>
        </div>
        <textarea rows="4" [(ngModel)]="text" [placeholder]="prompt()"></textarea>
        <input [(ngModel)]="gratitude" placeholder="Grateful for… (earns bonus XP)">
        <div class="row wrap">@for (t of tags; track t) { <button class="small" [class.primary]="sel().includes(t)" (click)="toggleTag(t)">{{ t }}</button> }</div>
        <div class="row"><button class="small ghost" (click)="shuffle()">↻ New prompt</button><span class="grow"></span><button class="primary" (click)="save()">Save entry</button></div>
        @if (saved()) { <div class="small ok">Saved. Well done, {{ store.settings().honorific }}.</div> }
      </div>

      @if (days().length > 1) {
        <h2 class="upper">Last 30 days</h2>
        <div class="card">
          <svg viewBox="0 0 300 90" class="chart" role="img" aria-label="Mood and energy trend">
            <polyline [attr.points]="line('mood')" class="l1"/>
            <polyline [attr.points]="line('energy')" class="l2"/>
          </svg>
          <div class="row small muted"><span class="dot1">● mood {{ avg('mood') }}</span><span class="dot2">● energy {{ avg('energy') }}</span></div>
          @for (i of insights(); track i) { <div class="small">💡 {{ i }}</div> }
          <button class="small" style="margin-top:8px" [disabled]="busy()" (click)="reflect()">{{ busy() ? 'Reflecting…' : '✨ Reflect with ' + (store.settings().personality.name || 'Jarvis') }}</button>
          @if (reflection()) { <div class="bubble md" [innerHTML]="reflection() | md"></div> }
        </div>
      }

      <h2 class="upper">History</h2>
      @for (e of store.journal().slice(0, 40); track e.id) {
        <div class="card small hist">
          <div class="row between"><b>{{ fmt(e.date) | date:'EEE d MMM' }}</b><span>{{ moods[e.mood - 1] }} {{ '⚡'.repeat(e.energy) }}</span></div>
          @if (e.text) { <div>{{ e.text }}</div> }
          @if (e.gratitude) { <div class="muted">🙏 {{ e.gratitude }}</div> }
          <div class="row wrap">@for (t of e.tags; track t) { <span class="chip">{{ t }}</span> }<span class="grow"></span>
            <button class="ghost small" (click)="edit(e)">Edit</button><button class="ghost small" (click)="del(e)">Delete</button></div>
        </div>
      } @empty { <div class="card empty small">Nothing yet. Two minutes a day compounds, sir.</div> }
    </div>
  `,
  styles: [`
    .stack { display: flex; flex-direction: column; gap: 12px; } h2 { margin: 18px 0 8px; } .wrap { flex-wrap: wrap; gap: 6px; }
    .scale { display: flex; gap: 6px; } .scale button { flex: 1; font-size: 1.2rem; padding: 8px 0; } .scale button.on { border-color: var(--cyan); background: rgba(var(--accent-rgb), .16); transform: scale(1.06); }
    .chart { width: 100%; height: 90px; } .chart polyline { fill: none; stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
    .l1 { stroke: var(--cyan); } .l2 { stroke: #facc15; } .dot1 { color: var(--cyan); margin-right: 12px; } .dot2 { color: #facc15; }
    .ok { color: #86efac; } .hist { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
    .bubble { margin-top: 10px; padding: 10px 12px; border-radius: 14px; background: rgba(var(--accent-rgb), .08); border: 1px solid var(--line); }
  `],
})
export class JournalPage {
  readonly store = inject(StoreService);
  private ollama = inject(OllamaService);
  private jarvis = inject(JarvisService);
  private reflex = inject(ReflexService);
  readonly moods = MOODS; readonly tags = TAGS;
  readonly mood = signal(this.store.todayJournal()?.mood ?? 3);
  readonly energy = signal(this.store.todayJournal()?.energy ?? 3);
  readonly sel = signal<string[]>(this.store.todayJournal()?.tags ?? []);
  readonly saved = signal(false); readonly busy = signal(false); readonly reflection = signal('');
  private pi = signal(new Date().getDate() % PROMPTS.length);
  readonly prompt = computed(() => PROMPTS[this.pi()]);
  text = this.store.todayJournal()?.text ?? '';
  gratitude = this.store.todayJournal()?.gratitude ?? '';
  private editDate: string | undefined;

  readonly days = computed(() => {
    const from = addDays(this.store.today(), -29);
    return this.store.journal().filter(j => j.date >= from).sort((a, b) => a.date.localeCompare(b.date));
  });
  fmt = (d: string) => parseYmd(d);

  line(k: 'mood' | 'energy'): string {
    const d = this.days(); const start = parseYmd(addDays(this.store.today(), -29)).getTime();
    return d.map(e => `${(((parseYmd(e.date).getTime() - start) / 86400000) / 29) * 290 + 5},${85 - ((e[k] - 1) / 4) * 78}`).join(' ');
  }
  avg(k: 'mood' | 'energy') { const d = this.days(); return d.length ? (d.reduce((a, e) => a + e[k], 0) / d.length).toFixed(1) : '–'; }

  readonly insights = computed(() => {
    const d = this.days(); const out: string[] = [];
    if (d.length < 4) return ['Log a few more days and I will start spotting patterns.'];
    const wd = new Map<number, number[]>();
    for (const e of d) { const w = parseYmd(e.date).getDay(); wd.set(w, [...(wd.get(w) ?? []), e.mood]); }
    const rank = [...wd.entries()].filter(([, v]) => v.length >= 2).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length] as const).sort((a, b) => b[1] - a[1]);
    const names = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
    if (rank.length >= 2) out.push(`Your best mood lands on ${names[rank[0][0]]}; the toughest are ${names[rank[rank.length - 1][0]]}.`);
    const hi = d.filter(e => this.store.focusMinutesOn(e.date) >= 60), lo = d.filter(e => this.store.focusMinutesOn(e.date) < 60);
    const m = (a: JournalEntry[]) => a.reduce((s, e) => s + e.mood, 0) / a.length;
    if (hi.length >= 2 && lo.length >= 2) out.push(`On days with 60+ focus minutes your mood averages ${m(hi).toFixed(1)} vs ${m(lo).toFixed(1)} otherwise.`);
    const half = Math.floor(d.length / 2), first = m(d.slice(0, half)), second = m(d.slice(half));
    if (Math.abs(second - first) >= 0.3) out.push(second > first ? 'Your mood is trending up lately.' : 'Your mood has dipped lately. Be kind to yourself, and consider lighter days.');
    return out;
  });

  toggleTag(t: string) { this.sel.update(a => (a.includes(t) ? a.filter(x => x !== t) : [...a, t])); }
  shuffle() { this.pi.update(i => (i + 1) % PROMPTS.length); }
  async save() {
    await this.store.saveJournal({ date: this.editDate, mood: this.mood(), energy: this.energy(), text: this.text, gratitude: this.gratitude || undefined, tags: this.sel() });
    JarvisDevice.haptic({ kind: 'success' }).catch(() => undefined);
    this.saved.set(true); setTimeout(() => this.saved.set(false), 3000);
    this.editDate = undefined;
  }
  edit(e: JournalEntry) {
    this.editDate = e.date; this.mood.set(e.mood); this.energy.set(e.energy); this.text = e.text; this.gratitude = e.gratitude ?? ''; this.sel.set(e.tags);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  del(e: JournalEntry) { return confirm('Delete this entry?') ? this.store.deleteJournal(e.id) : undefined; }

  async reflect() {
    this.busy.set(true); this.reflection.set('');
    try {
      if (this.jarvis.reflexMode()) {
        await this.reflex.init();
        this.reflection.set(this.reflex.engine.reflectJournal(this.days().slice(-14)));
        return;
      }
      if (!(await this.jarvis.ensureEngine())) { this.reflection.set('The brain is offline. Download a model on the Brain page.'); return; }
      const recent = this.days().slice(-10).map(e => `${e.date} mood ${e.mood}/5 energy ${e.energy}/5: ${e.text.slice(0, 220)}${e.gratitude ? ' | grateful: ' + e.gratitude : ''}`).join('\n');
      this.reflection.set(await this.ollama.complete(this.jarvis.persona() + '\nYou are reflecting on the user\'s journal. Notice patterns, name one strength, one watch-out, and suggest one small experiment. Max 120 words.', recent, { temperature: 0.6, background: false, maxTokens: 300 }));
    } catch (e: any) { this.reflection.set('Reflection failed: ' + (e?.message ?? e)); } finally { this.busy.set(false); }
  }
}
