import { Injectable, inject, signal } from '@angular/core';
import { db } from './db';
import { LibChunk, LibDoc } from './models';
import { OllamaService } from './ollama.service';
import { cosine, keywordScore, uid } from './util';

export interface LibHit { doc: string; text: string; score: number; }

/** Text of a PDF without external libraries: inflates streams and reads text operators (simple PDFs only). */
async function pdfText(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  const latin = new TextDecoder('latin1').decode(bytes);
  const out: string[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin))) {
    const start = m.index + m[0].length;
    const end = latin.indexOf('endstream', start);
    if (end < 0) break;
    const head = latin.slice(Math.max(0, m.index - 300), m.index);
    let data = bytes.slice(start, end);
    if (/FlateDecode/.test(head) && 'DecompressionStream' in window) {
      try {
        const ds = new (window as any).DecompressionStream('deflate');
        const w = ds.writable.getWriter(); w.write(data); w.close();
        data = new Uint8Array(await new Response(ds.readable).arrayBuffer());
      } catch { continue; }
    }
    const s = new TextDecoder('latin1').decode(data);
    if (!/BT[\s\S]*ET/.test(s)) continue;
    for (const block of s.match(/BT[\s\S]*?ET/g) ?? []) {
      let line = '';
      for (const t of block.match(/\((?:\\.|[^\\)])*\)\s*Tj|\[(?:[^\]]*)\]\s*TJ|T\*|Td|TD/g) ?? []) {
        if (t === 'T*' || t === 'Td' || t === 'TD') { if (line && !line.endsWith(' ')) line += ' '; continue; }
        for (const p of t.match(/\((?:\\.|[^\\)])*\)/g) ?? []) line += p.slice(1, -1).replace(/\\([nrtbf()\\])/g, (_, c) => ({ n: '\n', r: '', t: ' ', b: '', f: '' } as Record<string, string>)[c] ?? c).replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
      }
      if (line.trim()) out.push(line.trim());
    }
  }
  return out.join('\n');
}

function chunk(text: string, size = 700, overlap = 120): string[] {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(clean.length, i + size);
    if (end < clean.length) { const cut = clean.lastIndexOf('\n', end); const dot = clean.lastIndexOf('. ', end); const at = Math.max(cut, dot); if (at > i + size * 0.5) end = at + 1; }
    const piece = clean.slice(i, end).trim();
    if (piece) out.push(piece);
    if (end >= clean.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return out;
}

/** Private, offline "ask your documents": text/markdown/CSV/JSON/HTML/simple PDFs, chunked and embedded on the phone. */
@Injectable({ providedIn: 'root' })
export class LibraryService {
  private ollama = inject(OllamaService);
  readonly docs = signal<LibDoc[]>([]);
  readonly busy = signal('');

  async init() { this.docs.set((await db.docs.orderBy('addedAt').reverse().toArray())); }

  async addFile(file: File): Promise<LibDoc> {
    this.busy.set(`Reading ${file.name}…`);
    try {
      let text: string;
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        text = await pdfText(await file.arrayBuffer());
        if (text.trim().length < 40) throw new Error('No readable text in this PDF (scanned or uses embedded fonts). Export it as text and add that.');
      } else if (/\.html?$/i.test(file.name)) {
        const doc = new DOMParser().parseFromString(await file.text(), 'text/html');
        doc.querySelectorAll('script,style,nav,footer').forEach(n => n.remove());
        text = doc.body?.innerText || doc.body?.textContent || '';
      } else {
        text = await file.text();
      }
      return await this.addText(file.name, text);
    } finally { this.busy.set(''); }
  }

  async addText(name: string, text: string): Promise<LibDoc> {
    const parts = chunk(text);
    if (!parts.length) throw new Error('The file is empty.');
    const doc: LibDoc = { id: uid(), name, chars: text.length, chunks: parts.length, addedAt: Date.now() };
    const key = this.ollama.embedKey();
    const rows: LibChunk[] = parts.map((t, idx) => ({ id: uid(), docId: doc.id, idx, text: t }));
    if (key) {
      for (let i = 0; i < rows.length; i += 16) {
        this.busy.set(`Indexing ${name}… ${Math.min(rows.length, i + 16)}/${rows.length}`);
        const vecs = await this.ollama.embed(rows.slice(i, i + 16).map(r => r.text)).catch(() => null);
        if (!vecs) break;
        vecs.forEach((v, j) => { rows[i + j].embedding = v; rows[i + j].embedModel = key; });
      }
    }
    await db.transaction('rw', db.docs, db.chunks, async () => { await db.docs.put(doc); await db.chunks.bulkPut(rows); });
    this.busy.set('');
    await this.init();
    return doc;
  }

  async remove(id: string) {
    await db.transaction('rw', db.docs, db.chunks, async () => { await db.docs.delete(id); await db.chunks.where('docId').equals(id).delete(); });
    await this.init();
  }

  async search(query: string, k = 4): Promise<LibHit[]> {
    const [chunks, docs] = await Promise.all([db.chunks.toArray(), db.docs.toArray()]);
    if (!chunks.length) return [];
    const names = new Map(docs.map(d => [d.id, d.name]));
    const key = this.ollama.embedKey();
    let qv: number[] | null = null;
    if (key && chunks.some(c => c.embedding && c.embedModel === key)) qv = (await this.ollama.embed([query]).catch(() => null))?.[0] ?? null;
    const scored = chunks.map(c => {
      const kw = keywordScore(query, c.text);
      const sem = qv && c.embedding && c.embedModel === key ? cosine(qv, c.embedding) : 0;
      return { doc: names.get(c.docId) ?? '?', text: c.text, score: qv ? sem * 0.8 + Math.min(1, kw) * 0.2 : kw };
    });
    return scored.sort((a, b) => b.score - a.score).slice(0, k).filter(h => h.score > 0);
  }
}
