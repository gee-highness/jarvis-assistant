import { Injectable, inject, signal } from '@angular/core';
import { CapacitorHttp } from '@capacitor/core';
import { StoreService } from './store.service';

export interface OllamaToolCall { id?: string; function: { name: string; arguments: Record<string, unknown> | string } }
export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  thinking?: string;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
  tool_call_id?: string;
  images?: string[];
}
export interface OllamaTool {
  type: 'function';
  function: { name: string; description: string; parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] } };
}
export interface ChatOptions {
  model?: string;
  tools?: OllamaTool[];
  think?: boolean;
  format?: 'json' | Record<string, unknown>;
  temperature?: number;
  numCtx?: number;
  signal?: AbortSignal;
  onToken?: (token: string) => void;
  onThinking?: (token: string) => void;
  /** Force the on-phone model even when a cloud brain is configured. */
  local?: boolean;
}
export interface ChatResult { content: string; thinking: string; toolCalls: OllamaToolCall[]; tokensPerSec?: number; brain: 'phone' | 'cloud'; }
export interface ModelInfo { name: string; size: number; modified_at: string; details?: { parameter_size?: string; quantization_level?: string; family?: string } }

export type EngineState = 'unknown' | 'online' | 'offline' | 'waking';

@Injectable({ providedIn: 'root' })
export class OllamaService {
  private store = inject(StoreService);
  readonly state = signal<EngineState>('unknown');
  readonly models = signal<ModelInfo[]>([]);
  readonly version = signal('');
  readonly lastBrain = signal<'phone' | 'cloud'>('phone');
  readonly cloudModels = signal<string[]>([]);
  /** Models found not to support native tools / thinking (learned at runtime). */
  private noTools = new Set<string>();
  private noThink = new Set<string>();

  private get base(): string { return this.store.settings().ollamaUrl.replace(/\/+$/, ''); }

  supportsTools(model: string) { return !this.noTools.has(model); }

  async ping(timeoutMs = 2500): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const r = await fetch(`${this.base}/api/version`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error();
      this.version.set((await r.json()).version ?? '');
      this.state.set('online');
      return true;
    } catch {
      if (this.state() !== 'waking') this.state.set('offline');
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const r = await fetch(`${this.base}/api/tags`);
    if (!r.ok) throw new Error(`Engine error ${r.status}`);
    const list = ((await r.json()).models ?? []) as ModelInfo[];
    this.models.set(list.sort((a, b) => a.name.localeCompare(b.name)));
    return list;
  }

  hasModel(name: string): boolean {
    const n = name.includes(':') ? name : `${name}:latest`;
    return this.models().some(m => m.name === n || m.name === name);
  }

  async pull(name: string, onProgress: (status: string, pct: number | null) => void, signal?: AbortSignal): Promise<void> {
    const r = await fetch(`${this.base}/api/pull`, { method: 'POST', body: JSON.stringify({ model: name, stream: true }), signal });
    if (!r.ok || !r.body) throw new Error(await this.errorText(r));
    await this.readNdjson(r.body, (o: any) => {
      if (o.error) throw new Error(o.error);
      const pct = o.total ? Math.round((o.completed ?? 0) / o.total * 100) : null;
      onProgress(o.status ?? '', pct);
    });
    await this.listModels();
  }

  async deleteModel(name: string): Promise<void> {
    const r = await fetch(`${this.base}/api/delete`, { method: 'DELETE', body: JSON.stringify({ model: name }) });
    if (!r.ok) throw new Error(await this.errorText(r));
    await this.listModels();
  }

  async embed(texts: string[], model = this.store.settings().embedModel): Promise<number[][] | null> {
    if (!model) return null;
    try {
      const r = await fetch(`${this.base}/api/embed`, { method: 'POST', body: JSON.stringify({ model, input: texts, keep_alive: '30m' }) });
      if (!r.ok) return null;
      const j = await r.json();
      return (j.embeddings ?? null) as number[][] | null;
    } catch { return null; }
  }

  /** Streaming chat with native tool calling. Falls back automatically when a model lacks tools/thinking. */
  async chat(messages: OllamaMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    const s = this.store.settings();
    const c = s.cloud;
    const cloudReady = !opts.local && c.mode !== 'off' && !!c.apiKey && !!c.model && !!c.baseUrl;
    if (cloudReady && (c.mode === 'always' || navigator.onLine)) {
      try { return await this.cloudChat(messages, opts); }
      catch (e) { if (c.mode === 'always' || opts.signal?.aborted) throw e; /* auto: fall back to the phone model */ }
    }
    return this.localChat(messages, opts);
  }

  private async localChat(messages: OllamaMessage[], opts: ChatOptions): Promise<ChatResult> {
    const s = this.store.settings();
    const model = opts.model || s.chatModel;
    const useTools = !!opts.tools?.length && !this.noTools.has(model);
    const useThink = opts.think === true && !this.noThink.has(model);
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: true,
      keep_alive: '30m',
      options: { num_ctx: opts.numCtx ?? s.numCtx, temperature: opts.temperature ?? s.temperature },
    };
    if (useTools) body['tools'] = opts.tools;
    if (opts.think !== undefined && !this.noThink.has(model)) body['think'] = useThink;
    if (opts.format) body['format'] = opts.format;

    const r = await fetch(`${this.base}/api/chat`, { method: 'POST', body: JSON.stringify(body), signal: opts.signal });
    if (!r.ok || !r.body) {
      const err = await this.errorText(r);
      if (/does not support tools/i.test(err) && useTools) { this.noTools.add(model); return this.localChat(messages, opts); }
      if (/does not support think/i.test(err) && 'think' in body) { this.noThink.add(model); return this.localChat(messages, opts); }
      if (/not found/i.test(err)) throw new Error(`Model "${model}" isn't installed. Open Settings → Models to download it.`);
      throw new Error(err);
    }
    this.state.set('online');
    let content = '', thinking = '';
    const toolCalls: OllamaToolCall[] = [];
    let tps: number | undefined;
    await this.readNdjson(r.body, (o: any) => {
      if (o.error) throw new Error(o.error);
      const m = o.message;
      if (m?.thinking) { thinking += m.thinking; opts.onThinking?.(m.thinking); }
      if (m?.content) { content += m.content; opts.onToken?.(m.content); }
      if (m?.tool_calls?.length) toolCalls.push(...m.tool_calls);
      if (o.done && o.eval_count && o.eval_duration) tps = o.eval_count / (o.eval_duration / 1e9);
    });
    this.lastBrain.set('phone');
    return { content, thinking, toolCalls, tokensPerSec: tps, brain: 'phone' };
  }

  // ---------------- cloud brain (OpenAI-compatible) ----------------
  private cloudHeaders(): Record<string, string> {
    const c = this.store.settings().cloud;
    const h: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c.apiKey}` };
    if (c.provider === 'openrouter') { h['HTTP-Referer'] = 'https://jarvis.local'; h['X-Title'] = 'Jarvis'; }
    return h;
  }

  async listCloudModels(): Promise<string[]> {
    const c = this.store.settings().cloud;
    const url = `${c.baseUrl.replace(/\/+$/, '')}/models`;
    let data: any;
    try {
      const r = await fetch(url, { headers: this.cloudHeaders() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      data = await r.json();
    } catch {
      const r = await CapacitorHttp.get({ url, headers: this.cloudHeaders() });
      if (r.status >= 400) throw new Error(`Provider error ${r.status}`);
      data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    }
    const ids = ((data?.data ?? data?.models ?? []) as any[]).map(m => String(m.id ?? m.name ?? '').replace(/^models\//, '')).filter(Boolean).sort();
    this.cloudModels.set(ids);
    return ids;
  }

  private toOpenAi(messages: OllamaMessage[]): unknown[] {
    let counter = 0;
    const pending: string[] = [];
    return messages.map(m => {
      if (m.role === 'assistant' && m.tool_calls?.length) {
        const tool_calls = m.tool_calls.map(tc => {
          const id = tc.id ?? `call_${++counter}`;
          pending.push(id);
          return { id, type: 'function', function: { name: tc.function.name, arguments: typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments ?? {}) } };
        });
        return { role: 'assistant', content: m.content || null, tool_calls };
      }
      if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id ?? pending.shift() ?? `call_${++counter}`, content: m.content };
      return { role: m.role, content: m.content };
    });
  }

  private async cloudChat(messages: OllamaMessage[], opts: ChatOptions): Promise<ChatResult> {
    const s = this.store.settings();
    const c = s.cloud;
    const body: Record<string, unknown> = {
      model: c.model,
      messages: this.toOpenAi(messages),
      temperature: opts.temperature ?? s.temperature,
      stream: true,
    };
    if (opts.tools?.length) body['tools'] = opts.tools;
    if (opts.format) body['response_format'] = { type: 'json_object' };
    const url = `${c.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    let content = '';
    const calls: { id?: string; name: string; args: string }[] = [];
    let r: Response | null = null;
    try { r = await fetch(url, { method: 'POST', headers: this.cloudHeaders(), body: JSON.stringify(body), signal: opts.signal }); }
    catch { r = null; }
    if (r && r.ok && r.body) {
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          let j: any; try { j = JSON.parse(data); } catch { continue; }
          if (j.error) throw new Error(j.error.message ?? 'Provider error');
          const d = j.choices?.[0]?.delta ?? {};
          if (d.content) { content += d.content; opts.onToken?.(d.content); }
          for (const tc of d.tool_calls ?? []) {
            const i = tc.index ?? calls.length;
            calls[i] ??= { id: tc.id, name: '', args: '' };
            if (tc.id) calls[i].id = tc.id;
            if (tc.function?.name) calls[i].name += tc.function.name;
            if (tc.function?.arguments) calls[i].args += tc.function.arguments;
          }
        }
      }
    } else if (r && !r.ok) {
      let msg = `Cloud error ${r.status}`;
      try { msg = (await r.json()).error?.message ?? msg; } catch { /* ignore */ }
      throw new Error(msg);
    } else {
      // fetch blocked (e.g. CORS): native HTTP, no streaming
      const res = await CapacitorHttp.post({ url, headers: this.cloudHeaders(), data: { ...body, stream: false } });
      const j = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      if (res.status >= 400) throw new Error(j?.error?.message ?? `Cloud error ${res.status}`);
      const msg = j.choices?.[0]?.message ?? {};
      content = msg.content ?? '';
      if (content) opts.onToken?.(content);
      for (const tc of msg.tool_calls ?? []) calls.push({ id: tc.id, name: tc.function?.name ?? '', args: tc.function?.arguments ?? '{}' });
    }
    const toolCalls: OllamaToolCall[] = calls.filter(x => x?.name).map(x => {
      let args: Record<string, unknown> = {};
      try { args = x.args ? JSON.parse(x.args) : {}; } catch { args = {}; }
      return { id: x.id, function: { name: x.name, arguments: args } };
    });
    this.lastBrain.set('cloud');
    return { content, thinking: '', toolCalls, brain: 'cloud' };
  }

  /** One-shot, non-streaming helper for background jobs (summaries, extraction, parsing). */
  async complete(system: string, user: string, opts: Omit<ChatOptions, 'onToken'> = {}): Promise<string> {
    const s = this.store.settings();
    const res = await this.chat(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { model: opts.model || s.utilityModel || s.chatModel, temperature: 0.2, think: false, ...opts },
    );
    return res.content.trim();
  }

  async speedTest(model = this.store.settings().chatModel): Promise<number> {
    const res = await this.chat([{ role: 'user', content: 'Count from 1 to 40 separated by spaces.' }], { model, think: false, temperature: 0, local: true });
    return Math.round((res.tokensPerSec ?? 0) * 10) / 10;
  }

  private async readNdjson(stream: ReadableStream<Uint8Array>, onObj: (o: unknown) => void): Promise<void> {
    const reader = stream.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) onObj(JSON.parse(line));
      }
    }
    if (buf.trim()) onObj(JSON.parse(buf));
  }

  private async errorText(r: Response): Promise<string> {
    try { const j = await r.json(); return j.error ?? `Engine error ${r.status}`; } catch { return `Engine error ${r.status}`; }
  }
}
