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
