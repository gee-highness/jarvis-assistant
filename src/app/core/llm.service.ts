import { Injectable, computed, inject, signal } from '@angular/core';
import { DEVICE_EMBED_MODEL, DEVICE_MODELS, DeviceModel, deviceModelFile, recommendedModel } from './models';
import { JarvisDevice, JarvisLlm, LlmChatResult, LlmDownloadEvent, LlmModelInfo, LlmStatus, isNative } from './native';
import { StoreService } from './store.service';
import { uid } from './util';

/** OpenAI-style request understood by the native engine (see native/cpp/jarvis_llm.cpp). */
export interface LlmRequest {
  messages: unknown[];
  tools?: unknown[];
  think?: boolean;
  json?: boolean;
  /** 0 = conversation (keeps its KV cache), 1 = background jobs. */
  slot?: 0 | 1;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  min_p?: number;
  repeat_penalty?: number;
  max_tokens?: number;
}
export interface LlmHandlers {
  onContent?: (t: string) => void;
  onReasoning?: (t: string) => void;
  signal?: AbortSignal;
}
export interface InstalledFile { file: string; size: number; modified: number; }
export interface ActiveModel { id: string; file: string; name: string; catalog?: DeviceModel; }

interface Job {
  slot: 0 | 1;
  req: LlmRequest;
  h: LlmHandlers;
  retries: number;
  resolve: (r: LlmChatResult) => void;
  reject: (e: unknown) => void;
}

/** The built-in llama.cpp brain: model files, downloads, loading and a prioritised inference queue. */
@Injectable({ providedIn: 'root' })
export class LlmService {
  private store = inject(StoreService);

  readonly status = signal<LlmStatus | null>(null);
  readonly files = signal<InstalledFile[]>([]);
  readonly downloads = signal<Record<string, LlmDownloadEvent>>({});
  readonly info = signal<LlmModelInfo | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly lastTps = signal(0);
  readonly embedReady = signal(false);
  /** Models whose chat template failed with tools: use the text tool protocol for them. */
  private noTools = new Set<string>();

  readonly available = computed(() => !!this.status()?.available);
  readonly recommended = computed(() => recommendedModel(this.status()?.ramTotalMb || 6 * 1024));
  readonly active = computed<ActiveModel | null>(() => this.resolve(this.store.settings().deviceModel));
  readonly activeInstalled = computed(() => { const a = this.active(); return !!a && this.has(a.file); });
  readonly embedInstalled = computed(() => this.has(DEVICE_EMBED_MODEL.dest));
  readonly imported = computed(() => {
    const known = new Set([...DEVICE_MODELS.map(deviceModelFile), DEVICE_EMBED_MODEL.dest]);
    return this.files().filter(f => !known.has(f.file));
  });

  private queue: Job[] = [];
  private running: Job | null = null;
  private handlers = new Map<string, LlmHandlers>();
  private initDone: Promise<void> | null = null;

  init(): Promise<void> {
    this.initDone ??= (async () => {
      if (!isNative()) { this.status.set(await JarvisLlm.getStatus()); return; }
      JarvisLlm.addListener('llmDelta', e => {
        const h = this.handlers.get(e.requestId);
        if (!h) return;
        const act = this.activity();
        if (act) this.activity.set({ ...act, chars: act.chars + (e.content?.length ?? 0) + (e.reasoning?.length ?? 0), phase: 'generating' });
        if (e.reasoning) h.onReasoning?.(e.reasoning);
        if (e.content) h.onContent?.(e.content);
      }).catch(() => undefined);
      JarvisLlm.addListener('llmDownload', e => this.onDownload(e)).catch(() => undefined);
      await this.refresh();
      const { downloads } = await JarvisLlm.getDownloads().catch(() => ({ downloads: [] as LlmDownloadEvent[] }));
      for (const d of downloads) this.onDownload(d);
    })();
    return this.initDone;
  }

  async refresh(): Promise<void> {
    this.status.set(await JarvisLlm.getStatus().catch(() => null));
    const { models } = await JarvisLlm.listModels().catch(() => ({ models: [] as InstalledFile[] }));
    this.files.set(models);
  }

  has(file: string): boolean { return this.files().some(f => f.file === file); }

  resolve(id: string): ActiveModel | null {
    if (!id) return null;
    if (id.startsWith('file:')) { const file = id.slice(5); return { id, file, name: file.replace(/\.gguf$/i, '') }; }
    const catalog = DEVICE_MODELS.find(m => m.id === id);
    return catalog ? { id, file: deviceModelFile(catalog), name: `${catalog.name} · ${catalog.family}`, catalog } : null;
  }

  supportsTools(): boolean { const a = this.active(); return !!a && !this.noTools.has(a.id); }
  supportsThinking(): boolean { return !!this.info()?.supports_thinking; }

  // ------------------------------------------------------------------ downloads
  private onDownload(e: LlmDownloadEvent) {
    this.downloads.update(d => ({ ...d, [e.id]: e }));
    if (e.status === 'done') {
      JarvisDevice.haptic({ kind: 'success' }).catch(() => undefined);
      this.refresh().catch(() => undefined);
      setTimeout(() => this.downloads.update(d => { const n = { ...d }; if (n[e.id]?.status === 'done') delete n[e.id]; return n; }), 4000);
    }
    if (e.status === 'cancelled') this.downloads.update(d => { const n = { ...d }; delete n[e.id]; return n; });
  }

  async download(m: DeviceModel): Promise<void> {
    this.downloads.update(d => ({ ...d, [m.id]: { id: m.id, status: 'pending', received: 0, total: m.sizeMb * 1048576 } }));
    try {
      await JarvisLlm.download({
        id: m.id, repo: m.repo, file: m.file, quant: m.quant, dest: deviceModelFile(m),
        title: `Jarvis brain · ${m.name} (${m.params})`, wifiOnly: this.store.settings().wifiOnly,
      });
    } catch (e: any) {
      this.downloads.update(d => ({ ...d, [m.id]: { id: m.id, status: 'error', received: 0, total: 0, error: e?.message ?? String(e) } }));
      throw e;
    }
  }

  async downloadEmbed(): Promise<void> {
    const m = DEVICE_EMBED_MODEL;
    this.downloads.update(d => ({ ...d, [m.id]: { id: m.id, status: 'pending', received: 0, total: m.sizeMb * 1048576 } }));
    try {
      await JarvisLlm.download({ id: m.id, repo: m.repo, file: m.file, quant: m.quant, dest: m.dest, title: 'Jarvis memory engine', wifiOnly: false });
    } catch (e: any) {
      this.downloads.update(d => ({ ...d, [m.id]: { id: m.id, status: 'error', received: 0, total: 0, error: e?.message ?? String(e) } }));
      throw e;
    }
  }

  cancel(id: string) { return JarvisLlm.cancelDownload({ id }); }

  async remove(file: string): Promise<void> {
    if (this.info()?.path?.endsWith('/' + file)) { await JarvisLlm.unload().catch(() => undefined); this.info.set(null); }
    if (file === DEVICE_EMBED_MODEL.dest) this.embedReady.set(false);
    await JarvisLlm.deleteModel({ file });
    await this.refresh();
  }

  async importModel(): Promise<string | null> {
    try {
      const r = await JarvisLlm.importModel();
      await this.refresh();
      return r.file;
    } catch (e: any) {
      if (/cancel/i.test(e?.message ?? '')) return null;
      throw e;
    }
  }

  // ------------------------------------------------------------------ loading
  ctxFor(a: ActiveModel | null): number {
    const s = this.store.settings();
    return s.deviceCtx > 0 ? s.deviceCtx : a?.catalog?.ctx ?? 4096;
  }

  /** Loads the selected model if needed. Returns false when no usable model is installed. */
  async ensureLoaded(): Promise<boolean> {
    await this.init();
    if (!this.available()) return false;
    const a = this.active();
    if (!a || !this.has(a.file)) return false;
    const nCtx = this.ctxFor(a);
    const threads = this.store.settings().deviceThreads;
    const cur = this.info();
    if (cur?.loaded && cur.path?.endsWith('/' + a.file) && cur.n_ctx === Math.min(nCtx, cur.n_ctx_train || nCtx)
        && (!threads || cur.threads === threads)) return true;
    this.loading.set(true);
    this.loadError.set('');
    try {
      // Self-healing load: try the fast kernels first, verify the output is sane, fall back to the
      // safe kernels if not. The verdict is remembered per model file, so this runs once.
      const key = 'jarvis_engine_mode_' + a.file;
      let known: string | null = null;
      try { known = localStorage.getItem(key); } catch { /* ignore */ }
      const modes: (0 | 1)[] = known === '0' ? [0] : known === '1' ? [1] : [0, 1];
      let info: LlmModelInfo | null = null;
      this.health.set('');
      for (const mode of modes) {
        info = await JarvisLlm.load({ file: a.file, nCtx, threads, batch: 256, mode });
        if (info.error) throw new Error(info.message ?? info.error);
        if (known !== null) break;
        this.loadStage.set(mode === 0 ? 'Checking fast engine…' : 'Checking safe engine…');
        const ok = await this.sanityCheck();
        if (ok) { try { localStorage.setItem(key, String(mode)); } catch { /* ignore */ } break; }
        if (mode === 1) this.health.set('The engine produced invalid text on this phone with both fast and safe settings. Try a different model (Brain), or use the cloud brain.');
      }
      this.loadStage.set('');
      this.info.set(info);
      return true;
    } catch (e: any) {
      this.loadError.set(e?.message ?? String(e));
      this.info.set(null);
      throw e;
    } finally {
      this.loading.set(false);
    }
  }

  /** Engine self-test state shown in Brain/Diagnostics. */
  readonly health = signal('');
  readonly loadStage = signal('');

  /** Greedy one-liner with a known answer: catches broken kernels before the user sees garbage. */
  private async sanityCheck(): Promise<boolean> {
    try {
      const r = await JarvisLlm.chat({ request: JSON.stringify({ messages: [{ role: 'user', content: 'What is the capital of France? Answer with one word.' }], max_tokens: 8, temperature: 0, think: false, slot: 1 }), requestId: 'sanity' });
      return !r.error && /paris/i.test(r.content ?? '');
    } catch { return false; }
  }

  /** Forget the verified engine mode for the active model and re-test on next load. */
  async retest(): Promise<void> {
    const a = this.active();
    if (a) { try { localStorage.removeItem('jarvis_engine_mode_' + a.file); } catch { /* ignore */ } }
    await this.unload();
  }

  async unload(): Promise<void> { await JarvisLlm.unload().catch(() => undefined); this.info.set(null); }

  // ------------------------------------------------------------------ inference queue
  /**
   * Runs a completion. Conversation requests (slot 0) jump the queue and pre-empt background jobs,
   * which are transparently re-queued.
   */
  chat(req: LlmRequest, h: LlmHandlers = {}): Promise<LlmChatResult> {
    const slot = req.slot ?? 0;
    return new Promise<LlmChatResult>((resolve, reject) => {
      if (h.signal?.aborted) { resolve({ error: 'aborted', message: 'Stopped.' }); return; }
      this.queue.push({ slot, req: { ...req, slot }, h, retries: 0, resolve, reject });
      if (slot === 0 && this.running?.slot === 1) JarvisLlm.stop().catch(() => undefined);
      this.pump();
    });
  }

  /** Cancels whatever is generating right now. */
  stop() { JarvisLlm.stop().catch(() => undefined); }

  private pump() {
    if (this.running) return;
    const i = this.queue.findIndex(j => j.slot === 0);
    const job = i >= 0 ? this.queue.splice(i, 1)[0] : this.queue.shift();
    if (!job) return;
    this.running = job;
    this.activity.set({ since: Date.now(), chars: 0, phase: 'prompt' });
    const id = uid();
    this.handlers.set(id, job.h);
    const onAbort = () => { if (this.running === job) JarvisLlm.stop().catch(() => undefined); };
    job.h.signal?.addEventListener('abort', onAbort);
    // watchdog: no first token after 2 minutes -> interrupt, and give up so the UI never spins forever
    const wd = setTimeout(() => {
      if (this.running !== job || this.activity()?.phase !== 'prompt') return;
      JarvisLlm.stop().catch(() => undefined);
      setTimeout(() => {
        if (this.running !== job) return;
        this.handlers.delete(id); this.running = null; this.activity.set(null);
        job.resolve({ error: 'internal', message: 'The engine stalled while reading the prompt. Open More → Diagnostics, or try a smaller brain.' });
        this.pump();
      }, 4000);
    }, 120000);
    JarvisLlm.chat({ request: JSON.stringify(job.req), requestId: id })
      .then(res => {
        const preempted = (res.error === 'aborted' || res.finish === 'aborted') && !job.h.signal?.aborted && job.slot === 1;
        if (preempted && job.retries < 3) { job.retries++; this.queue.push(job); return; }
        // only real, finished runs: an aborted 1-token reply used to show a bogus 0.1 tok/s
        if (res.tps && res.finish !== 'aborted' && (res.gen_tokens ?? 0) >= 8) this.lastTps.set(Math.round(res.tps * 10) / 10);
        job.resolve(res);
      })
      .catch(e => job.reject(e))
      .finally(() => {
        clearTimeout(wd);
        job.h.signal?.removeEventListener('abort', onAbort);
        if (this.running !== job) return;   // already given up by the watchdog
        this.handlers.delete(id);
        this.running = null;
        this.activity.set(null);
        this.pump();
      });
  }

  /** Live generation state, for the engine monitor. */
  readonly activity = signal<{ since: number; chars: number; phase: 'prompt' | 'generating' } | null>(null);

  markNoTools() { const a = this.active(); if (a) this.noTools.add(a.id); }

  // ------------------------------------------------------------------ embeddings
  async ensureEmbed(): Promise<boolean> {
    await this.init();
    if (!this.available() || !this.store.settings().deviceEmbed || !this.embedInstalled()) return false;
    if (this.embedReady()) return true;
    const r = await JarvisLlm.loadEmbed({ file: DEVICE_EMBED_MODEL.dest }).catch(() => null);
    this.embedReady.set(!!r?.ok);
    return !!r?.ok;
  }

  async embed(texts: string[]): Promise<number[][] | null> {
    if (!texts.length || !(await this.ensureEmbed())) return null;
    try { return (await JarvisLlm.embed({ texts })).vectors; } catch { return null; }
  }
}
