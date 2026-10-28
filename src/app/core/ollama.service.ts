import { Injectable, inject, signal } from '@angular/core';
import { CapacitorHttp } from '@capacitor/core';
import { LlmService } from './llm.service';
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
  /** Background job (summaries, extraction): runs at low priority on the on-device engine. */
  background?: boolean;
  maxTokens?: number;
}
export interface ChatResult { content: string; thinking: string; toolCalls: OllamaToolCall[]; tokensPerSec?: number; brain: 'phone' | 'cloud'; }
export interface ModelInfo { name: string; size: number; modified_at: string; details?: { parameter_size?: string; quantization_level?: string; family?: string } }

export type EngineState = 'unknown' | 'online' | 'offline' | 'waking';

@Injectable({ providedIn: 'root' })
export class OllamaService {
  private store = inject(StoreService);
  private llm = inject(LlmService);
  readonly state = signal<EngineState>('unknown');
  readonly models = signal<ModelInfo[]>([]);
  readonly version = signal('');
  readonly lastBrain = signal<'phone' | 'cloud'>('phone');
  readonly cloudModels = signal<string[]>([]);
  /** Models found not to support native tools / thinking (learned at runtime). */
  private noTools = new Set<string>();
  private noThink = new Set<string>();

  private get base(): string { return this.store.settings().ollamaUrl.replace(/\/+$/, ''); }
  private get device(): boolean { return this.store.settings().engine === 'device'; }

  supportsTools(model: string) { return this.device ? this.llm.supportsTools() : !this.noTools.has(model); }

  /** Identifies which embedding space memories were indexed with. */
  embedKey(): string {
    const s = this.store.settings();
    return this.device ? (s.deviceEmbed ? 'device:all-minilm-l6-v2' : '') : s.embedModel;
  }

  /** Is the configured local brain usable right now (model present / server reachable)? */
  async checkLocal(): Promise<boolean> {
    if (!this.device) return this.ping();
    await this.llm.init();
    const ok = this.llm.available() && this.llm.activeInstalled();
    this.state.set(ok ? 'online' : 'offline');
    return ok;
  }

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
    if (this.device) return this.llm.embed(texts);
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
      catch (e: any) {
        if (opts.signal?.aborted) throw e;
        // rate limits, outages and network errors fall back to the phone model when one is installed; otherwise explain clearly
        const transient = /\b(429|5\d\d)\b|rate|quota|overload|network|fetch|timeout/i.test(String(e?.message ?? e));
        const phoneReady = this.device ? this.llm.activeInstalled() : true;
        if (c.mode === 'auto' || (transient && phoneReady)) { /* continue with the phone model below */ }
        else throw new Error(/\b429\b|rate|quota/i.test(String(e?.message)) ? 'The cloud brain is rate-limited right now (429). Wait a minute, switch the cloud brain to Auto, or download an on-device model on the Brain page.' : e);
      }
    }
    return this.device ? this.deviceChat(messages, opts) : this.localChat(messages, opts);
  }

  // ---------------- built-in engine (llama.cpp) ----------------
  private async deviceChat(messages: OllamaMessage[], opts: ChatOptions): Promise<ChatResult> {
    const s = this.store.settings();
    if (!(await this.llm.ensureLoaded())) {
      throw new Error(this.llm.available()
        ? 'No brain installed yet. Open Brain → download a model (one time, then fully offline).'
        : 'The on-device engine is unavailable on this device.');
    }
    this.state.set('online');
    let tools = opts.tools?.length && this.llm.supportsTools() ? opts.tools : undefined;
    let msgs = this.toOpenAi(this.mergeSystem(messages), true);
    const think = opts.think === true && this.llm.supportsThinking();
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await this.llm.chat({
        messages: msgs,
        tools,
        think,
        json: !!opts.format,
        slot: opts.background ? 1 : 0,
        temperature: opts.temperature ?? s.temperature,
        max_tokens: opts.maxTokens ?? (opts.format ? 768 : think ? 2048 : 1024),
      }, { onContent: opts.onToken, onReasoning: opts.onThinking, signal: opts.signal });

      if (res.error === 'context') {
        // drop the oldest non-system turn and retry; keep the system prompt and the latest user message
        const firstTurn = msgs.findIndex((m: any, i: number) => i > 0 && m.role !== 'system');
        if (firstTurn < 0 || firstTurn >= msgs.length - 1) throw new Error('This message is too long for the model\'s memory. Try a shorter one or a larger context in Brain settings.');
        let end = firstTurn + 1;
        while (end < msgs.length - 1 && (msgs[end] as any).role === 'tool') end++;   // keep tool results with their call
        msgs = [...msgs.slice(0, firstTurn), ...msgs.slice(end)];
        continue;
      }
      if (res.error === 'template_tools' && tools) { this.llm.markNoTools(); tools = undefined; continue; }
      if (res.error === 'aborted' || res.finish === 'aborted') {
        const e = new Error('Stopped.'); e.name = 'AbortError'; throw e;
      }
      if (res.error) throw new Error(res.message ?? res.error);

      const toolCalls: OllamaToolCall[] = (res.tool_calls ?? []).filter(t => t.name).map(t => {
        let args: Record<string, unknown> = {};
        try { args = t.arguments ? JSON.parse(t.arguments) : {}; } catch { args = {}; }
        return { id: t.id || undefined, function: { name: t.name, arguments: args } };
      });
      this.lastBrain.set('phone');
      return { content: (res.content ?? '').trim(), thinking: res.reasoning ?? '', toolCalls, tokensPerSec: res.tps, brain: 'phone' };
    }
    throw new Error('The conversation is too long for the model\'s memory. Start a new chat.');
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

  /** Many chat templates only accept one system message, at the start. */
  private mergeSystem(messages: OllamaMessage[]): OllamaMessage[] {
    const sys = messages.filter(m => m.role === 'system').map(m => m.content).filter(Boolean);
    const rest = messages.filter(m => m.role !== 'system');
    return sys.length ? [{ role: 'system', content: sys.join('\n\n') }, ...rest] : rest;
  }

  private toOpenAi(messages: OllamaMessage[], device = false): unknown[] {
    let counter = 0;
    const pending: string[] = [];
    return messages.map(m => {
      if (m.role === 'assistant' && m.tool_calls?.length) {
        const tool_calls = m.tool_calls.map(tc => {
          const id = tc.id ?? `call_${++counter}`;
          pending.push(id);
          return { id, type: 'function', function: { name: tc.function.name, arguments: typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments ?? {}) } };
        });
        return { role: 'assistant', content: m.content || (device ? '' : null), tool_calls };
      }
      if (m.role === 'tool') {
        const t: Record<string, unknown> = { role: 'tool', tool_call_id: m.tool_call_id ?? pending.shift() ?? `call_${++counter}`, content: m.content };
        if (device && m.tool_name) t['name'] = m.tool_name;
        return t;
      }
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
      { model: opts.model || s.utilityModel || s.chatModel, temperature: 0.2, think: false, background: true, ...opts },
    );
    return res.content.trim();
  }

  async speedTest(model = this.store.settings().chatModel): Promise<number> {
    const res = await this.chat([{ role: 'user', content: 'Count from 1 to 40 separated by spaces.' }], { model, think: false, temperature: 0, local: true, maxTokens: 160 });
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
