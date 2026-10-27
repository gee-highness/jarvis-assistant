import { Injectable, inject, signal } from '@angular/core';
import { db } from './db';
import { Memory, MemoryKind, Message } from './models';
import { OllamaService } from './ollama.service';
import { StoreService } from './store.service';
import { cosine, extractJson, keywordScore, uid } from './util';

export interface ScoredMemory { memory: Memory; score: number; }

const KINDS: MemoryKind[] = ['fact', 'preference', 'goal', 'person', 'project', 'summary', 'event'];
const DUP_THRESHOLD = 0.9;
const MIN_SCORE = 0.32;

@Injectable({ providedIn: 'root' })
export class MemoryService {
  private ollama = inject(OllamaService);
  private store = inject(StoreService);
  readonly memories = signal<Memory[]>([]);
  readonly reindexing = signal(false);

  async init(): Promise<void> {
    this.memories.set(await db.memories.orderBy('createdAt').reverse().toArray());
  }

  private get embedModel() { return this.ollama.embedKey(); }

  async add(text: string, kind: MemoryKind = 'fact', importance = 3, pinned = false): Promise<{ memory: Memory; merged: boolean }> {
    const clean = text.trim().replace(/\s+/g, ' ');
    const [vec] = (await this.ollama.embed([clean])) ?? [undefined];
    // de-duplicate: update a near-identical memory instead of adding another
    const dup = this.findDuplicate(clean, vec);
    if (dup) {
      const merged: Memory = {
        ...dup, text: clean, importance: Math.max(dup.importance, importance), pinned: dup.pinned || pinned,
        embedding: vec ?? dup.embedding, embedModel: vec ? this.embedModel : dup.embedModel, lastUsedAt: Date.now(),
      };
      await this.put(merged);
      return { memory: merged, merged: true };
    }
    const m: Memory = {
      id: uid(), text: clean, kind: KINDS.includes(kind) ? kind : 'fact', importance: Math.min(5, Math.max(1, Math.round(importance))),
      pinned, embedding: vec, embedModel: vec ? this.embedModel : undefined, createdAt: Date.now(), lastUsedAt: Date.now(),
    };
    await this.put(m);
    return { memory: m, merged: false };
  }

  async update(id: string, patch: Partial<Memory>): Promise<void> {
    const cur = this.memories().find(m => m.id === id);
    if (!cur) return;
    let next: Memory = { ...cur, ...patch };
    if (patch.text && patch.text !== cur.text) {
      const [vec] = (await this.ollama.embed([patch.text])) ?? [undefined];
      next = { ...next, embedding: vec, embedModel: vec ? this.embedModel : undefined };
    }
    await this.put(next);
  }

  async remove(id: string): Promise<void> {
    this.memories.update(a => a.filter(m => m.id !== id));
    await db.memories.delete(id);
  }

  /** Forget by id or by semantic match; returns removed texts. */
  async forget(query: string): Promise<string[]> {
    const byId = this.memories().find(m => m.id.startsWith(query));
    if (byId) { await this.remove(byId.id); return [byId.text]; }
    const hits = (await this.search(query, 3)).filter(h => h.score > 0.6);
    for (const h of hits) await this.remove(h.memory.id);
    return hits.map(h => h.memory.text);
  }

  /** Hybrid retrieval: similarity (or keyword fallback) blended with recency and importance. Pinned always included. */
  async search(query: string, k = 8): Promise<ScoredMemory[]> {
    const all = this.memories();
    if (!all.length) return [];
    const [qv] = (await this.ollama.embed([query])) ?? [undefined];
    const now = Date.now();
    const scored = all.map(m => {
      const sim = qv && m.embedding && m.embedModel === this.embedModel ? cosine(qv, m.embedding) : keywordScore(query, m.text) * 0.8;
      const ageDays = (now - m.lastUsedAt) / 86_400_000;
      const recency = Math.exp(-ageDays / 30);
      const score = sim * 0.7 + recency * 0.15 + (m.importance / 5) * 0.15;
      return { memory: m, score, sim };
    });
    const picked = scored.filter(s => s.sim >= MIN_SCORE * (qv ? 1 : 0.5)).sort((a, b) => b.score - a.score).slice(0, k);
    const pinned = scored.filter(s => s.memory.pinned && !picked.includes(s));
    const result = [...pinned, ...picked];
    // touch lastUsedAt (in memory + db) so useful memories stay fresh
    const touched = result.map(r => ({ ...r.memory, lastUsedAt: now }));
    if (touched.length) {
      const ids = new Set(touched.map(t => t.id));
      this.memories.update(a => a.map(m => (ids.has(m.id) ? touched.find(t => t.id === m.id)! : m)));
      db.memories.bulkPut(touched).catch(() => undefined);
    }
    return result.map(({ memory, score }) => ({ memory, score }));
  }

  /** Context block injected into the system prompt. */
  async contextFor(query: string): Promise<string> {
    const hits = await this.search(query, 8);
    if (!hits.length) return '';
    return hits.map(h => `- (${h.memory.kind}) ${h.memory.text}`).join('\n');
  }

  /** Background: extract durable facts about the user from the latest exchange. */
  async extractFrom(userText: string, assistantText: string): Promise<number> {
    if (userText.trim().length < 12) return 0;
    const system =
`You maintain a long-term memory about the user of a personal assistant.
From the exchange, extract ONLY durable, reusable facts about the user and their world: identity, people (with relationship), projects, goals, preferences, routines, important dates, constraints.
Ignore small talk, one-off requests, questions, and anything the assistant said unless the user confirmed it.
Return JSON: {"memories":[{"text":"<third-person fact, e.g. 'User's sister is Thandi'>","kind":"fact|preference|goal|person|project|event","importance":1-5}]}. Return {"memories":[]} if nothing durable.`;
    try {
      const out = await this.ollama.complete(system, `USER: ${userText}\nASSISTANT: ${assistantText.slice(0, 1200)}`, { format: 'json' });
      const parsed = extractJson<{ memories?: { text: string; kind: MemoryKind; importance: number }[] }>(out);
      const list = (parsed?.memories ?? []).filter(m => m?.text && m.text.length > 5).slice(0, 5);
      for (const m of list) await this.add(m.text, m.kind, m.importance ?? 3);
      return list.length;
    } catch { return 0; }
  }

  /** Summarise older messages of a conversation into episodic memory. Returns the summary. */
  async summarize(messages: Message[], title: string): Promise<string> {
    const transcript = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 600)}`)
      .join('\n');
    const system = 'Summarise this conversation in 3-6 concise bullet points: decisions, commitments, facts learned about the user, open loops. Third person ("User ..."). No preamble.';
    const summary = await this.ollama.complete(system, transcript.slice(-12000));
    if (summary) await this.add(`Conversation "${title}" (${new Date().toLocaleDateString()}): ${summary}`, 'summary', 2);
    return summary;
  }

  /** Re-embed everything (after changing the embedding model). */
  async reindex(onProgress?: (done: number, total: number) => void): Promise<void> {
    this.reindexing.set(true);
    try {
      const all = this.memories();
      const batch = 16;
      for (let i = 0; i < all.length; i += batch) {
        const slice = all.slice(i, i + batch);
        const vecs = await this.ollama.embed(slice.map(m => m.text));
        if (!vecs) throw new Error(`Embedding model "${this.embedModel}" unavailable`);
        const updated = slice.map((m, j) => ({ ...m, embedding: vecs[j], embedModel: this.embedModel }));
        await db.memories.bulkPut(updated);
        onProgress?.(Math.min(i + batch, all.length), all.length);
      }
      await this.init();
    } finally { this.reindexing.set(false); }
  }

  /** Quietly embeds memories that were saved without (or with a different) embedding model. */
  async reindexStale(): Promise<number> {
    const key = this.embedModel;
    if (!key || this.reindexing()) return 0;
    const stale = this.memories().filter(m => m.embedModel !== key);
    if (!stale.length) return 0;
    const probe = await this.ollama.embed([stale[0].text]);
    if (!probe) return 0;
    for (let i = 0; i < stale.length; i += 16) {
      const slice = stale.slice(i, i + 16);
      const vecs = await this.ollama.embed(slice.map(m => m.text));
      if (!vecs) break;
      const updated = slice.map((m, j) => ({ ...m, embedding: vecs[j], embedModel: key }));
      await db.memories.bulkPut(updated);
      const byId = new Map(updated.map(u => [u.id, u]));
      this.memories.update(a => a.map(m => byId.get(m.id) ?? m));
    }
    return stale.length;
  }

  private findDuplicate(text: string, vec?: number[]): Memory | undefined {
    const lower = text.toLowerCase();
    let best: Memory | undefined, bestSim = 0;
    for (const m of this.memories()) {
      if (m.text.toLowerCase() === lower) return m;
      if (vec && m.embedding && m.embedModel === this.embedModel) {
        const s = cosine(vec, m.embedding);
        if (s > bestSim) { bestSim = s; best = m; }
      }
    }
    return bestSim >= DUP_THRESHOLD ? best : undefined;
  }

  private async put(m: Memory) {
    this.memories.update(a => [m, ...a.filter(x => x.id !== m.id)]);
    await db.memories.put(m);
  }
}
