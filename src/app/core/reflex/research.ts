/**
 * Research: when Jarvis does not know something for certain, it looks it up online, extracts the
 * actual answer (not a list of links), cites the source and caches it so it also knows it offline.
 * Sources: DuckDuckGo instant answers, Wikipedia, wttr.in (weather), DuckDuckGo web results + page text.
 */
import { contentWords, normalize, stem } from './text';

export interface Finding { answer: string; source: string; url?: string; confidence: number; cached?: boolean; t: number; }

type Http = (url: string) => Promise<string>;

const VOLATILE = /\b(price|cost|weather|forecast|temperature|rain|news|headline|score|today|tonight|now|current(ly)?|latest|live|stock|share price|exchange rate|rate|who won|result|winning|standings|traffic|load ?shedding|schedule|open now|this week)\b/;

export const cleanQuery = (q: string) => q
  .replace(/^(hey |ok |so |please |jarvis )+/g, '')
  .replace(/^(can you |could you |would you |please )?(search (the web |online |the internet )?(for )?|google |look up |lookup |find out |tell me |do you know |i want to know |i wonder |any idea )/, '')
  .replace(/\?+$/, '').replace(/\s+/g, ' ').trim();

const strip = (html: string) => html
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<header[\s\S]*?<\/header>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>/gi, ' ')
  .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, '. ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, ' ')
  .replace(/\s+/g, ' ').trim();

const domain = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'the web'; } };

/** Question type → what a good answer looks like. */
function qType(q: string): 'who' | 'when' | 'where' | 'number' | 'what' | 'why' | 'how' | 'yesno' {
  if (/^who\b|\bwho (is|was|won|invented|founded|wrote|made|owns|directed|sang)\b/.test(q)) return 'who';
  if (/^when\b|\bwhat year\b|\bwhat date\b/.test(q)) return 'when';
  if (/^where\b/.test(q)) return 'where';
  if (/\bhow (many|much|far|tall|big|long|old|high|deep|fast|heavy)\b|\bwhat is the (population|price|cost|height|distance|age|speed)\b/.test(q)) return 'number';
  if (/^why\b/.test(q)) return 'why';
  if (/^how\b/.test(q)) return 'how';
  if (/^(is|are|was|were|does|do|did|can|will|has|have)\b/.test(q)) return 'yesno';
  return 'what';
}

/** Scores a sentence as an answer to the question. */
function scoreSentence(s: string, qk: string[], type: ReturnType<typeof qType>): number {
  const ws = contentWords(normalize(s).text).map(stem);
  if (ws.length < 3) return 0;
  let hit = 0;
  for (const k of qk) if (ws.some(w => w === k || (k.length > 4 && w.startsWith(k.slice(0, 5))))) hit++;
  let sc = (qk.length ? hit / qk.length : 0) * 2 / Math.sqrt(Math.max(8, ws.length) / 8);
  if (type === 'when' && /\b(1[0-9]{3}|20[0-9]{2})\b|\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(s)) sc += 0.6;
  if (type === 'number' && /\d/.test(s)) sc += 0.6;
  if (type === 'who' && /\b[A-Z][a-z]+ [A-Z][a-z]+/.test(s)) sc += 0.4;
  if (type === 'where' && /\b(in|at|located|near|capital)\b/i.test(s)) sc += 0.3;
  if (type === 'why' && /\b(because|due to|caused|since|as a result)\b/i.test(s)) sc += 0.5;
  if (/cookie|subscribe|sign up|javascript|click here|advertis|privacy policy|all rights reserved/i.test(s)) sc -= 1;
  return sc;
}

export function bestSentences(text: string, q: string, n = 2): { text: string; score: number } {
  const qk = [...new Set(contentWords(normalize(q).text).map(stem).filter(w => w.length > 2))];
  const type = qType(normalize(q).text);
  const sents = text.split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/).map(s => s.trim()).filter(s => s.length > 25 && s.length < 400);
  const ranked = sents.map((s, i) => ({ s, i, sc: scoreSentence(s, qk, type) })).sort((a, b) => b.sc - a.sc);
  if (!ranked.length) return { text: '', score: 0 };
  const top = ranked[0];
  const next = sents[top.i + 1];
  const out = n > 1 && next && top.s.length < 160 && scoreSentence(next, qk, type) > 0.2 ? `${top.s} ${next}` : top.s;
  return { text: out, score: top.sc };
}

export class Researcher {
  private cache: Record<string, { a: string; src: string; url?: string; t: number; ttl: number; c: number }> = {};
  constructor(private http: Http, private save: (c: Researcher['cache']) => void) {}

  load(c?: Researcher['cache']) { this.cache = c ?? {}; }
  private key(q: string) { return contentWords(normalize(q).text).map(stem).sort().join(' '); }

  /** Cached answer (also used offline). Stale volatile answers are returned with `cached` so callers can say so. */
  recall(q: string, now: number, allowStale = false): Finding | undefined {
    const c = this.cache[this.key(q)];
    if (!c) return undefined;
    if (!allowStale && now - c.t > c.ttl) return undefined;
    return { answer: c.a, source: c.src, url: c.url, confidence: c.c, cached: true, t: c.t };
  }

  async ask(raw: string, opts: { city?: string; now: number; fahrenheit?: boolean }): Promise<Finding | undefined> {
    const q = cleanQuery(normalize(raw).text);
    if (!q) return undefined;
    const hit = this.recall(q, opts.now);
    if (hit) return hit;
    let f: Finding | undefined;
    try {
      if (/\b(weather|forecast|temperature|rain|sunny|cold|hot outside|umbrella)\b/.test(q)) f = await this.weather(q, opts.city, opts.now, !!opts.fahrenheit);
      f ??= await this.instant(q, opts.now);
      if (!f || f.confidence < 0.6) {
        const wiki = /^(who|what) (is|was|are|were)\b|^tell me about\b|^(who|what)'?s\b/.test(q) || q.split(' ').length <= 3 ? await this.wiki(q, opts.now) : undefined;
        if (wiki && (!f || wiki.confidence > f.confidence)) f = wiki;
      }
      if (!f || f.confidence < 0.55) {
        const web = await this.web(q, opts.now);
        if (web && (!f || web.confidence > f.confidence)) f = web;
      }
    } catch { /* network issues: fall through */ }
    if (f && f.answer) {
      this.cache[this.key(q)] = { a: f.answer, src: f.source, url: f.url, t: opts.now, ttl: VOLATILE.test(q) ? 3600_000 : 30 * 864e5, c: f.confidence };
      const keys = Object.keys(this.cache);
      if (keys.length > 1500) for (const k of keys.sort((a, b) => this.cache[a].t - this.cache[b].t).slice(0, keys.length - 1500)) delete this.cache[k];
      this.save(this.cache);
    }
    return f;
  }

  // ---------------- sources
  private async weather(q: string, city: string | undefined, now: number, f = false): Promise<Finding | undefined> {
    const U = f ? 'F' : 'C';
    const place = q.match(/\b(?:in|at|for) ([a-z][a-z .'-]{2,40}?)(?: today| tomorrow| now| this week| tonight)?$/)?.[1] ?? city ?? '';
    const j = JSON.parse(await this.http(`https://wttr.in/${encodeURIComponent(place)}?format=j1`));
    const cur = j.current_condition?.[0];
    if (!cur) return undefined;
    const area = j.nearest_area?.[0]?.areaName?.[0]?.value ?? place ?? 'your area';
    const days = j.weather ?? [];
    const tomorrow = /\btomorrow\b/.test(q);
    const d = days[tomorrow ? 1 : 0];
    const rain = d ? Math.max(...(d.hourly ?? []).map((h: { chanceofrain: string }) => +h.chanceofrain || 0)) : 0;
    const answer = tomorrow && d
      ? `Tomorrow in ${area}: ${d['mintemp' + U]}–${d['maxtemp' + U]}°${U}, ${(d.hourly?.[4]?.weatherDesc?.[0]?.value ?? '').toLowerCase()}, ${rain}% chance of rain.`
      : `Right now in ${area}: ${cur['temp_' + U]}°${U} (feels like ${cur['FeelsLike' + U]}°${U}), ${String(cur.weatherDesc?.[0]?.value ?? '').toLowerCase()}. Today ${d?.['mintemp' + U]}–${d?.['maxtemp' + U]}°${U} with up to ${rain}% chance of rain.`;
    return { answer, source: 'wttr.in', url: 'https://wttr.in', confidence: 0.95, t: now };
  }

  private async instant(q: string, now: number): Promise<Finding | undefined> {
    const j = JSON.parse(await this.http(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1&no_redirect=1`));
    if (j.Answer && typeof j.Answer === 'string') return { answer: strip(j.Answer), source: j.AnswerType || 'DuckDuckGo', confidence: 0.9, t: now };
    if (j.Definition) return { answer: j.Definition, source: j.DefinitionSource || 'dictionary', url: j.DefinitionURL, confidence: 0.8, t: now };
    if (j.AbstractText) {
      const best = bestSentences(j.AbstractText, q);
      const lead = j.AbstractText.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
      return { answer: best.score > 0.6 ? best.text : lead, source: j.AbstractSource || 'Wikipedia', url: j.AbstractURL, confidence: Math.min(0.85, 0.55 + best.score / 3), t: now };
    }
    return undefined;
  }

  private async wiki(q: string, now: number): Promise<Finding | undefined> {
    const subject = q.replace(/^(who|what) (is|was|are|were) (the |a |an )?|^tell me about |^(who|what)'?s /, '').replace(/\b(in|for) (short|summary)\b/, '').trim();
    const s = JSON.parse(await this.http(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(subject)}&limit=1&namespace=0&format=json&origin=*`));
    const title = s?.[1]?.[0];
    if (!title) return undefined;
    const j = JSON.parse(await this.http(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`));
    if (!j.extract || j.type === 'disambiguation') return undefined;
    const lead = j.extract.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
    return { answer: lead, source: 'Wikipedia', url: j.content_urls?.desktop?.page, confidence: 0.75, t: now };
  }

  private async web(q: string, now: number): Promise<Finding | undefined> {
    const html = await this.http(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
    const results: { title: string; url: string; snippet: string }[] = [];
    const re = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && results.length < 6) {
      let url = m[1];
      const u = url.match(/uddg=([^&]+)/); if (u) url = decodeURIComponent(u[1]);
      if (/duckduckgo\.com\/y\.js|\/ad_/.test(url)) continue;
      results.push({ title: strip(m[2]), url, snippet: strip(m[3]) });
    }
    if (!results.length) return undefined;
    // 1) the snippets themselves often contain the answer
    let best = { text: '', score: 0, url: results[0].url };
    for (const r of results) {
      const b = bestSentences(r.snippet.replace(/\.\.\./g, '.'), q, 1);
      if (b.score > best.score) best = { ...b, url: r.url };
    }
    // 2) read the top page(s) when snippets are weak
    if (best.score < 1.1) {
      for (const r of results.slice(0, 2)) {
        try {
          const page = strip(await this.http(r.url)).slice(0, 60_000);
          const b = bestSentences(page, q);
          if (b.score > best.score) best = { ...b, url: r.url };
          if (best.score > 1.3) break;
        } catch { /* blocked page */ }
      }
    }
    if (!best.text) return undefined;
    return { answer: best.text.replace(/\s*\.\s*\.$/, '.'), source: domain(best.url), url: best.url, confidence: Math.min(0.8, 0.3 + best.score / 3), t: now };
  }
}

/** Is this an open knowledge question worth researching (vs. chit-chat or a command)? */
export function isKnowledgeQuestion(norm: string): boolean {
  if (/\b(my|me|i|mine|you|your|yourself)\b/.test(norm.replace(/\b(can|could|would|will) you (tell|find|look|search|check)\b.*?\b(what|who|when|where|how|why|if|whether)\b/, ''))) return false;
  return /^(who|what|when|where|which|why|how|is|are|was|were|does|do|did|can|will|has|have)\b/.test(norm) && norm.split(' ').length >= 3
    || /^(tell me about|explain|define|meaning of|what does .* mean)\b/.test(norm)
    || /\b(weather|forecast|news|price of|exchange rate|population of|capital of|score)\b/.test(norm);
}
