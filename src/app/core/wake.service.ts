import { Injectable, inject, signal } from '@angular/core';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import { PluginListenerHandle } from '@capacitor/core';
import { isNative } from './native';
import { StoreService } from './store.service';
import { VoiceService } from './voice.service';
import { sleep } from './util';

export interface WakeEvent { command: string; }

const VARIANTS = ['jarvis', 'jarvas', 'jarvus', 'service', 'travis', 'jervis', 'jarvice'];

/** "Hey Jarvis" while the app is open: short listening cycles, phrase matching on-device (system recogniser). */
@Injectable({ providedIn: 'root' })
export class WakeService {
  private store = inject(StoreService);
  private voice = inject(VoiceService);
  readonly active = signal(false);
  /** Set by the app shell while a conversation / overlay / focus session owns the mic. */
  paused = false;
  onWake: (e: WakeEvent) => void = () => undefined;
  private handles: PluginListenerHandle[] = [];
  private running = false;

  sync() {
    const want = this.store.settings().wakeWord && isNative();
    if (want && !this.running) this.loop().catch(() => undefined);
    if (!want) this.running = false;
  }

  /** Returns the part of the transcript after the wake phrase, or null if it was not spoken. */
  match(text: string): string | null {
    const t = text.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
    const phrase = this.store.settings().wakePhrase.toLowerCase().trim();
    const name = (this.store.settings().personality.name || 'jarvis').toLowerCase();
    const words = [...new Set([phrase, `hey ${name}`, `ok ${name}`, ...VARIANTS.map(v => `hey ${v}`), ...VARIANTS.map(v => `ok ${v}`)])];
    for (const w of words) { const i = t.indexOf(w); if (i >= 0) return t.slice(i + w.length).trim(); }
    return null;
  }

  private async loop() {
    this.running = true; this.active.set(true);
    try {
      while (this.running) {
        if (this.paused || this.voice.state() !== 'idle' || document.hidden) { await sleep(900); continue; }
        if (!(await this.voice.ensurePermission())) { this.running = false; break; }
        const text = await this.once();
        const rest = text ? this.match(text) : null;
        if (rest !== null) { this.onWake({ command: rest }); await sleep(1500); }
        else await sleep(250);
      }
    } finally { this.running = false; this.active.set(false); await this.clear(); }
  }

  private async clear() { const h = this.handles; this.handles = []; await Promise.all(h.map(x => x.remove().catch(() => undefined))); }

  private async once(): Promise<string> {
    const lang = this.store.settings().voice.language || 'en-GB';
    await this.clear();
    return new Promise<string>(async resolve => {
      let last = '', done = false;
      const finish = (t: string) => { if (done) return; done = true; this.clear(); resolve(t); };
      try {
        this.handles.push(await SpeechRecognition.addListener('partialResults', (e: any) => {
          last = e.accumulatedText || e.matches?.[0] || last;
          if (last && this.match(last) !== null) { SpeechRecognition.stop().catch(() => undefined); }
        }));
        this.handles.push(await SpeechRecognition.addListener('listeningState', (e: any) => { if (e.state === 'stopped') finish(last); }));
        this.handles.push(await SpeechRecognition.addListener('error', () => finish(last)));
        await SpeechRecognition.start({ language: lang, partialResults: true, popup: false, maxResults: 1, allowForSilence: 2500 } as any);
        setTimeout(() => { if (!done) SpeechRecognition.stop().catch(() => undefined); }, 12_000);
      } catch { finish(''); }
    });
  }
}
