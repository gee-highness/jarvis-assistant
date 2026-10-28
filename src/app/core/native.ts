import { Capacitor, PluginListenerHandle, WebPlugin, registerPlugin } from '@capacitor/core';

export interface TtsEngine { name: string; label: string; }
export interface TtsVoice {
  id: string;
  name: string;
  locale: string;
  language: string;
  country: string;
  quality: number;     // Android Voice.QUALITY_* (100..500)
  latency: number;     // Android Voice.LATENCY_* (100..500)
  networkRequired: boolean;
  installed: boolean;
  engine: string;
}
export interface AppEntry { label: string; package: string; }

export interface JarvisDevicePlugin {
  // ---- TTS ----
  speak(o: { text: string; voiceId?: string; language?: string; pitch?: number; rate?: number; engine?: string; utteranceId?: string }): Promise<{ done: boolean }>;
  stopSpeaking(): Promise<void>;
  getEngines(): Promise<{ engines: TtsEngine[]; current: string }>;
  getVoices(o: { engine?: string }): Promise<{ voices: TtsVoice[]; engine: string }>;
  installVoiceData(o: { engine?: string }): Promise<void>;
  openTtsSettings(): Promise<void>;
  // ---- device ----
  setAlarm(o: { hour: number; minute: number; message?: string; days?: number[]; skipUi?: boolean }): Promise<void>;
  setTimer(o: { seconds: number; message?: string; skipUi?: boolean }): Promise<void>;
  showAlarms(): Promise<void>;
  listApps(): Promise<{ apps: AppEntry[] }>;
  openApp(o: { package: string }): Promise<void>;
  flashlight(o: { on: boolean }): Promise<{ on: boolean }>;
  battery(): Promise<{ level: number; charging: boolean }>;
  deviceInfo(): Promise<{ model: string; manufacturer: string; android: string; sdk: number; ramTotalMb: number; ramAvailMb: number; storageFreeMb: number }>;
  openUrl(o: { url: string }): Promise<void>;
  dial(o: { number: string }): Promise<void>;
  sms(o: { number: string; body: string }): Promise<void>;
  email(o: { to: string; subject?: string; body?: string }): Promise<void>;
  share(o: { text: string; title?: string }): Promise<void>;
  calendarInsert(o: { title: string; start: number; end: number; location?: string; description?: string }): Promise<void>;
  openSettings(o: { page: string }): Promise<void>;
  clipboardRead(): Promise<{ text: string }>;
  clipboardWrite(o: { text: string }): Promise<void>;
  keepAwake(o: { on: boolean }): Promise<void>;
  saveFile(o: { name: string; content: string; mime?: string }): Promise<{ uri: string }>;
  updateWidget(o: { line: string }): Promise<void>;
  /** Home-screen chat widget: last exchange + status line. */
  updateChatWidget(o: { question: string; answer: string; status?: string }): Promise<void>;
  updateTodayWidget(o: { t1: string; t2: string; t3: string; stats: string }): Promise<void>;
  /** Short haptic feedback. */
  haptic(o: { kind: 'tick' | 'light' | 'medium' | 'success' | 'warning' }): Promise<void>;
  // ---- Termux / engine ----
  isTermuxInstalled(): Promise<{ installed: boolean }>;
  startTermuxOllama(o: { origins?: string }): Promise<void>;
  // ---- launch actions (widget / shortcuts) ----
  getLaunchAction(): Promise<{ action: string | null }>;
  addListener(event: 'launchAction', cb: (e: { action: string }) => void): Promise<PluginListenerHandle>;
}

/** Web fallback so the app is fully usable in a desktop browser during development. */
class JarvisDeviceWeb extends WebPlugin {
  private keepAwakeLock: any = null;
  async speak(o: { text: string; voiceId?: string; language?: string; pitch?: number; rate?: number }) {
    if (!('speechSynthesis' in window)) return { done: false };
    return new Promise<{ done: boolean }>(resolve => {
      const u = new SpeechSynthesisUtterance(o.text);
      const v = speechSynthesis.getVoices().find(x => x.voiceURI === o.voiceId);
      if (v) u.voice = v;
      if (o.language) u.lang = o.language;
      u.pitch = o.pitch ?? 1; u.rate = o.rate ?? 1;
      u.onend = () => resolve({ done: true });
      u.onerror = () => resolve({ done: false });
      speechSynthesis.speak(u);
    });
  }
  async stopSpeaking() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
  async getEngines() { return { engines: [{ name: 'browser', label: 'Browser voices' }], current: 'browser' }; }
  async getVoices() {
    const list = 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
    return {
      engine: 'browser',
      voices: list.map(v => ({
        id: v.voiceURI, name: v.name, locale: v.lang, language: v.lang.split('-')[0], country: v.lang.split('-')[1] ?? '',
        quality: 300, latency: 300, networkRequired: !v.localService, installed: true, engine: 'browser',
      })),
    };
  }
  async installVoiceData() {}
  async openTtsSettings() {}
  async setAlarm() { throw new Error('Alarms need the Android app'); }
  async setTimer() { throw new Error('Timers need the Android app'); }
  async showAlarms() {}
  async listApps() { return { apps: [] }; }
  async openApp() { throw new Error('Opening apps needs the Android app'); }
  async flashlight() { throw new Error('Flashlight needs the Android app'); }
  async battery() {
    const b: any = await (navigator as any).getBattery?.();
    return { level: b ? Math.round(b.level * 100) : -1, charging: !!b?.charging };
  }
  async deviceInfo() { return { model: navigator.userAgent, manufacturer: 'browser', android: '-', sdk: 0, ramTotalMb: 0, ramAvailMb: 0, storageFreeMb: 0 }; }
  async openUrl(o: { url: string }) { window.open(o.url, '_blank'); }
  async dial(o: { number: string }) { location.href = `tel:${o.number}`; }
  async sms(o: { number: string; body: string }) { location.href = `sms:${o.number}?body=${encodeURIComponent(o.body)}`; }
  async email(o: { to: string; subject?: string; body?: string }) {
    location.href = `mailto:${o.to}?subject=${encodeURIComponent(o.subject ?? '')}&body=${encodeURIComponent(o.body ?? '')}`;
  }
  async share(o: { text: string; title?: string }) { if (navigator.share) await navigator.share({ text: o.text, title: o.title }); }
  async calendarInsert() { throw new Error('Calendar needs the Android app'); }
  async openSettings() {}
  async clipboardRead() { return { text: await navigator.clipboard.readText() }; }
  async clipboardWrite(o: { text: string }) { await navigator.clipboard.writeText(o.text); }
  async keepAwake(o: { on: boolean }) {
    try {
      if (o.on) this.keepAwakeLock = await (navigator as any).wakeLock?.request('screen');
      else { await this.keepAwakeLock?.release(); this.keepAwakeLock = null; }
    } catch { /* ignore */ }
  }
  async saveFile(o: { name: string; content: string; mime?: string }) {
    const url = URL.createObjectURL(new Blob([o.content], { type: o.mime ?? 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = o.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return { uri: o.name };
  }
  async updateWidget() {}
  async updateChatWidget() {}
  async updateTodayWidget() {}
  async haptic(o: { kind: string }) {
    const ms: Record<string, number | number[]> = { tick: 8, light: 12, medium: 25, success: [12, 60, 24], warning: [30, 80, 30] };
    try { navigator.vibrate?.(ms[o.kind] ?? 10); } catch { /* ignore */ }
  }
  async isTermuxInstalled() { return { installed: false }; }
  async startTermuxOllama() {}
  async getLaunchAction() {
    const m = location.hash.match(/[?&]launch=(\w+)/);
    return { action: m ? m[1] : null };
  }
}

export const JarvisDevice = registerPlugin<JarvisDevicePlugin>('JarvisDevice', {
  web: () => Promise.resolve(new JarvisDeviceWeb() as unknown as JarvisDevicePlugin),
});

export const isNative = () => Capacitor.isNativePlatform();

// ---------------------------------------------------------------------------
// On-device LLM engine (llama.cpp) — native/java/JarvisLlmPlugin.java
// ---------------------------------------------------------------------------
export interface LlmStatus {
  available: boolean; error?: string; modelsDir: string; freeBytes?: number;
  ramTotalMb: number; ramAvailMb: number; cores: number; defaultThreads?: number; systemInfo?: string;
}
export interface LlmModelInfo {
  loaded: boolean; path?: string; desc?: string; size?: number; params?: number; n_ctx?: number; n_ctx_train?: number;
  threads?: number; kv_q8?: boolean; has_template?: boolean; supports_thinking?: boolean; caps?: Record<string, boolean>;
  error?: string; message?: string;
}
export interface LlmChatResult {
  content?: string; reasoning?: string; tool_calls?: { id?: string; name: string; arguments: string }[];
  finish?: 'stop' | 'length' | 'aborted' | 'error'; prompt_tokens?: number; cached_tokens?: number; gen_tokens?: number;
  prompt_ms?: number; gen_ms?: number; tps?: number; format?: string; n_ctx?: number;
  error?: 'context' | 'template' | 'template_tools' | 'not_loaded' | 'aborted' | 'decode' | 'sampler' | 'request' | 'internal';
  message?: string;
}
export interface LlmDownloadEvent { id: string; status: 'pending' | 'running' | 'paused' | 'done' | 'error' | 'cancelled'; received: number; total: number; error?: string; }

export interface JarvisLlmPlugin {
  getStatus(): Promise<LlmStatus>;
  listModels(): Promise<{ models: { file: string; size: number; modified: number }[] }>;
  deleteModel(o: { file: string }): Promise<{ deleted: boolean }>;
  hashModel(o: { file: string }): Promise<{ sha256: string; size: number; path: string }>;
  load(o: { file: string; nCtx: number; threads?: number; batch?: number }): Promise<LlmModelInfo>;
  unload(): Promise<void>;
  info(): Promise<LlmModelInfo>;
  chat(o: { request: string; requestId: string }): Promise<LlmChatResult>;
  stop(): Promise<void>;
  clearSlot(o: { slot: number }): Promise<void>;
  loadEmbed(o: { file: string }): Promise<{ ok?: boolean; dims?: number; error?: string; message?: string }>;
  embed(o: { texts: string[] }): Promise<{ vectors: number[][] }>;
  download(o: { id: string; repo: string; file?: string; quant?: string; dest: string; title?: string; wifiOnly?: boolean }): Promise<{ started: boolean; repoFile: string; expected: number }>;
  cancelDownload(o: { id: string }): Promise<void>;
  getDownloads(): Promise<{ downloads: LlmDownloadEvent[] }>;
  importModel(): Promise<{ file: string; size: number }>;
  addListener(event: 'llmDelta', cb: (e: { requestId: string; content: string; reasoning: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'llmDownload', cb: (e: LlmDownloadEvent) => void): Promise<PluginListenerHandle>;
}

/** Browser builds have no on-device engine; everything reports "unavailable". */
class JarvisLlmWeb extends WebPlugin {
  private no(): never { throw new Error('The on-device engine needs the Android app'); }
  async getStatus(): Promise<LlmStatus> { return { available: false, error: 'web', modelsDir: '', ramTotalMb: 0, ramAvailMb: 0, cores: navigator.hardwareConcurrency ?? 0 }; }
  async listModels() { return { models: [] }; }
  async deleteModel() { return { deleted: false }; }
  async hashModel() { return { sha256: '', size: 0, path: '' }; }
  async load() { return this.no(); }
  async unload() {}
  async info() { return { loaded: false }; }
  async chat() { return this.no(); }
  async stop() {}
  async clearSlot() {}
  async loadEmbed() { return this.no(); }
  async embed() { return this.no(); }
  async download() { return this.no(); }
  async cancelDownload() {}
  async getDownloads() { return { downloads: [] }; }
  async importModel() { return this.no(); }
}

export const JarvisLlm = registerPlugin<JarvisLlmPlugin>('JarvisLlm', {
  web: () => Promise.resolve(new JarvisLlmWeb() as unknown as JarvisLlmPlugin),
});

// ---------------------------------------------------------------- calendar, contacts, SMS
export interface CalEvent { title: string; start: number; end: number; location?: string; allDay: boolean; }
export interface JarvisDataPlugin {
  getEvents(o: { from: number; to: number; limit?: number }): Promise<{ events: CalEvent[] }>;
  findContacts(o: { query: string }): Promise<{ contacts: { name: string; number: string }[] }>;
  sendSms(o: { number: string; text: string }): Promise<void>;
}
class JarvisDataWeb extends WebPlugin {
  async getEvents() { return { events: [] as CalEvent[] }; }
  async findContacts() { return { contacts: [] as { name: string; number: string }[] }; }
  async sendSms(): Promise<void> { throw new Error('SMS is only available in the Android app'); }
}
export const JarvisData = registerPlugin<JarvisDataPlugin>('JarvisData', { web: () => new JarvisDataWeb() });
