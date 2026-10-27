import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MemoryService } from '../core/memory.service';
import { Memory, MemoryKind } from '../core/models';

@Component({
  standalone: true,
  imports: [FormsModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Memory</h1><span class="chip cyan">{{ mem.memories().length }} memories</span></div>
      <p class="small muted" style="margin:0">Everything Jarvis knows about you, stored only on this phone. Pinned memories are included in every conversation.</p>

      <div class="card col">
        <div class="row">
          <input [(ngModel)]="query" placeholder="Search memories (semantic)" (keydown.enter)="search()">
          <button (click)="search()">Search</button>
        </div>
        <div class="row">
          <input [(ngModel)]="newText" placeholder="Teach Jarvis something…">
          <select [(ngModel)]="newKind" style="width:120px">
            @for (k of kinds; track k) { <option [value]="k">{{ k }}</option> }
          </select>
          <button class="primary" [disabled]="!newText.trim()" (click)="add()">Add</button>
        </div>
      </div>

      <div class="row wrap">
        <button class="small" [class.primary]="filter() === 'all'" (click)="filter.set('all')">All</button>
        @for (k of kinds; track k) { <button class="small" [class.primary]="filter() === k" (click)="filter.set(k)">{{ k }}</button> }
      </div>

      <div class="card">
        <div class="list">
          @for (m of shown(); track m.memory.id) {
            <div class="item">
              @if (editId() === m.memory.id) {
                <div class="grow col">
                  <textarea [(ngModel)]="editText"></textarea>
                  <div class="row"><button class="small" (click)="editId.set(null)">Cancel</button><button class="small primary" (click)="saveEdit(m.memory)">Save</button></div>
                </div>
              } @else {
                <div class="grow">
                  <div>{{ m.memory.text }}</div>
                  <div class="row wrap small dim" style="gap:6px;margin-top:3px">
                    <span class="chip">{{ m.memory.kind }}</span>
                    <span>{{ '★'.repeat(m.memory.importance) }}</span>
                    <span>{{ m.memory.createdAt | date:'mediumDate' }}</span>
                    @if (m.score !== undefined) { <span class="mono">score {{ m.score.toFixed(2) }}</span> }
                    @if (!m.memory.embedding) { <span class="chip gold">no vector</span> }
                  </div>
                </div>
                <button class="ghost icon" [style.color]="m.memory.pinned ? 'var(--gold)' : 'var(--dim)'" (click)="mem.update(m.memory.id, { pinned: !m.memory.pinned })">📌</button>
                <button class="ghost icon" (click)="startEdit(m.memory)">✎</button>
                <button class="ghost icon" (click)="mem.remove(m.memory.id)">🗑</button>
              }
            </div>
          } @empty { <div class="empty">Nothing here yet. Jarvis learns as you talk.</div> }
        </div>
      </div>

      <div class="card col">
        <div class="row between"><span class="small muted">Rebuild vectors (after changing the embedding model)</span>
          <button class="small" [disabled]="mem.reindexing()" (click)="reindex()">{{ mem.reindexing() ? progress() : 'Re-index' }}</button></div>
      </div>
    </div>
  `,
})
export class MemoryPage {
  mem = inject(MemoryService);
  readonly kinds: MemoryKind[] = ['fact', 'preference', 'goal', 'person', 'project', 'event', 'summary'];
  query = '';
  newText = '';
  newKind: MemoryKind = 'fact';
  editText = '';
  readonly editId = signal<string | null>(null);
  readonly filter = signal<'all' | MemoryKind>('all');
  readonly results = signal<{ memory: Memory; score?: number }[] | null>(null);
  readonly progress = signal('');
  readonly shown = computed(() => {
    const base = this.results() ?? this.mem.memories().map(memory => ({ memory, score: undefined as number | undefined }));
    const f = this.filter();
    return base.filter(m => f === 'all' || m.memory.kind === f)
      .sort((a, b) => (+b.memory.pinned - +a.memory.pinned) || ((b.score ?? 0) - (a.score ?? 0)) || b.memory.createdAt - a.memory.createdAt);
  });

  async search() {
    if (!this.query.trim()) { this.results.set(null); return; }
    this.results.set(await this.mem.search(this.query, 25));
  }

  async add() { await this.mem.add(this.newText, this.newKind, 4); this.newText = ''; this.results.set(null); }
  startEdit(m: Memory) { this.editId.set(m.id); this.editText = m.text; }
  async saveEdit(m: Memory) { await this.mem.update(m.id, { text: this.editText.trim() }); this.editId.set(null); }
  async reindex() { await this.mem.reindex((d, t) => this.progress.set(`${d}/${t}`)); }
}
