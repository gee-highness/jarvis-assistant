import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LibHit, LibraryService } from '../core/library.service';
import { OllamaService } from '../core/ollama.service';
import { JarvisService } from '../core/jarvis.service';
import { ReflexService } from '../core/reflex/reflex.service';
import { MdPipe } from '../ui/md.pipe';

@Component({
  standalone: true,
  imports: [FormsModule, DatePipe, MdPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Library</h1><span class="chip cyan">{{ lib.docs().length }} documents</span></div>
      <p class="small muted">Add notes, manuals, contracts or articles. They stay on your phone. Then ask Jarvis about them here or in chat ("according to my documents…").</p>

      <div class="card stack">
        <label class="drop">
          <input type="file" multiple accept=".txt,.md,.markdown,.csv,.json,.html,.htm,.log,.pdf,text/*,application/pdf" (change)="pick($event)" hidden>
          <span>＋ Add files (txt, md, csv, json, html, pdf)</span>
        </label>
        <details><summary class="small muted">Paste text instead</summary>
          <input [(ngModel)]="pasteName" placeholder="Title"><textarea rows="4" [(ngModel)]="pasteText" placeholder="Paste text…"></textarea>
          <button class="small" [disabled]="!pasteText.trim()" (click)="addPaste()">Add</button></details>
        @if (lib.busy()) { <div class="small muted">{{ lib.busy() }}</div> }
        @if (error()) { <div class="small err">{{ error() }}</div> }
      </div>

      <div class="card stack">
        <div class="row"><input class="grow" [(ngModel)]="q" placeholder="Ask your documents…" (keydown.enter)="ask()"><button class="primary" [disabled]="!q.trim() || asking()" (click)="ask()">Ask</button></div>
        @if (asking()) { <div class="small muted">Searching and thinking…</div> }
        @if (answer()) { <div class="bubble md" [innerHTML]="answer() | md"></div> }
        @for (h of hits(); track $index) { <div class="hit small"><b>{{ h.doc }}</b> · {{ (h.score * 100).toFixed(0) }}%<div class="muted">{{ h.text.slice(0, 220) }}…</div></div> }
      </div>

      @for (d of lib.docs(); track d.id) {
        <div class="card row between small">
          <div><b>{{ d.name }}</b><div class="muted">{{ d.chunks }} passages · {{ (d.chars / 1000).toFixed(0) }}k chars · {{ d.addedAt | date:'d MMM' }}</div></div>
          <button class="ghost small" (click)="lib.remove(d.id)" aria-label="Remove document">🗑</button>
        </div>
      } @empty { <div class="card empty small">No documents yet.</div> }
    </div>
  `,
  styles: [`
    .stack { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; } .err { color: var(--red); }
    .drop { display: block; text-align: center; padding: 18px; border: 1px dashed var(--line-strong); border-radius: 12px; cursor: pointer; }
    .bubble { padding: 10px 12px; border-radius: 14px; background: rgba(var(--accent-rgb), .08); border: 1px solid var(--line); } .hit { border-left: 2px solid var(--line-strong); padding-left: 8px; }
  `],
})
export class LibraryPage implements OnInit {
  readonly lib = inject(LibraryService);
  private ollama = inject(OllamaService);
  private jarvis = inject(JarvisService);
  private reflex = inject(ReflexService);
  readonly error = signal(''); readonly asking = signal(false); readonly answer = signal(''); readonly hits = signal<LibHit[]>([]);
  q = ''; pasteName = ''; pasteText = '';

  ngOnInit() { this.lib.init(); }

  async pick(ev: Event) {
    const input = ev.target as HTMLInputElement;
    this.error.set('');
    for (const f of Array.from(input.files ?? [])) {
      try { await this.lib.addFile(f); } catch (e: any) { this.error.set(`${f.name}: ${e?.message ?? e}`); }
    }
    input.value = '';
  }
  async addPaste() {
    try { await this.lib.addText(this.pasteName.trim() || 'Pasted text', this.pasteText); this.pasteText = ''; this.pasteName = ''; }
    catch (e: any) { this.error.set(e?.message ?? String(e)); }
  }
  async ask() {
    this.asking.set(true); this.answer.set(''); this.hits.set([]);
    try {
      const hits = await this.lib.search(this.q, 5);
      this.hits.set(hits);
      if (!hits.length) { this.answer.set('Nothing relevant found in your documents.'); return; }
      if (this.jarvis.reflexMode()) { await this.reflex.init(); this.answer.set(this.reflex.engine.answerFrom(this.q, hits)); return; }
      if (!(await this.jarvis.ensureEngine())) { this.answer.set('The brain is offline; showing the best passages below.'); return; }
      const ctx = hits.map((h, i) => `[${i + 1}] (${h.doc}) ${h.text}`).join('\n\n');
      this.answer.set(await this.ollama.complete(this.jarvis.persona() + '\nAnswer ONLY from the passages provided. Cite sources like [1]. If the answer is not there, say so.', `Passages:\n${ctx}\n\nQuestion: ${this.q}`, { temperature: 0.2, background: false, maxTokens: 400 }));
    } catch (e: any) { this.answer.set('Failed: ' + (e?.message ?? e)); } finally { this.asking.set(false); }
  }
}
