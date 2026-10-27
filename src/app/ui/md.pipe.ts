import { Pipe, PipeTransform } from '@angular/core';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const inline = (s: string) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');

/** Tiny, safe markdown renderer (everything escaped first). */
export function renderMarkdown(src: string): string {
  if (!src) return '';
  const out: string[] = [];
  const blocks = src.replace(/\r/g, '').split(/(```[\s\S]*?(?:```|$))/g);
  for (const block of blocks) {
    if (block.startsWith('```')) {
      const body = block.replace(/^```\w*\n?/, '').replace(/```$/, '');
      out.push(`<pre><code>${esc(body)}</code></pre>`);
      continue;
    }
    let list: 'ul' | 'ol' | null = null;
    let para: string[] = [];
    const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
    const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const line of block.split('\n')) {
      const h = line.match(/^(#{1,3})\s+(.*)/);
      const ul = line.match(/^\s*[-*•]\s+(.*)/);
      const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
      if (h) { flushPara(); closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); }
      else if (ul) { flushPara(); if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(ul[1])}</li>`); }
      else if (ol) { flushPara(); if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(ol[1])}</li>`); }
      else if (!line.trim()) { flushPara(); closeList(); }
      else { closeList(); para.push(line); }
    }
    flushPara(); closeList();
  }
  return out.join('');
}

@Pipe({ name: 'md', standalone: true })
export class MdPipe implements PipeTransform {
  transform(v: string | null | undefined): string { return renderMarkdown(v ?? ''); }
}
