import { Injectable, inject, signal } from '@angular/core';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import { PluginListenerHandle } from '@capacitor/core';
import { JarvisDevice, TtsVoice, isNative } from './native';
import { StoreService } from './store.service';
import { speakable } from './util';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

@Injectable({ providedIn: 'root' })
export class VoiceService {
  private store = inject(StoreService);
  readonly state = signal<VoiceState>('idle');
  readonly transcript = signal('');
  readonly error = signal('');
  readonly onDevice = signal<boolean | null>(null);

  private handles: PluginListenerHandle[] = [];
  private webRec: any = null;
  private finish: ((text: string) => void) | null = null;

  setThinking(on: boolean) { if (on) this.state.set('thinking'); else if (this.state() === 'thinking') this.state.set('idle'); }

  async ensurePermission(): Promise<boolean> {
    if (!isNative()) return true;
    const p = await SpeechRecognition.checkPermissions();
    if (p.speechRecognition === 'granted') return true;
    const r = await SpeechRecognition.requestPermissions();
    return r.speechRecognition === 'granted';
  }

  /** Listen once and resolve with the final transcript ('' if nothing heard). */
  async listen(): Promise<string> {
    await this.stopSpeaking();
    this.error.set('');
    this.transcript.set('');
    if (!(await this.ensurePermission())) { this.error.set('Microphone permission denied'); return ''; }
    this.state.set('listening');
    return isNative() ? this.listenNative() : this.listenWeb();
  }

  async stopListening(): Promise<void> {
    if (isNative()) { try { await SpeechRecognition.stop(); } catch { /* ignore */ } }
    else this.webRec?.stop();
  }

  private async listenNative(): Promise<string> {
    const lang = this.store.settings().voice.language || 'en-GB';
    if (this.onDevice() === null) {
      try { this.onDevice.set((await SpeechRecognition.isOnDeviceRecognitionAvailable({ language: lang })).available); }
      catch { this.onDevice.set(false); }
    }
    await this.clearHandles();
    return new Promise<string>(async resolve => {
      let settled = false;
      const done = (text: string) => {
        if (settled) return;
        settled = true;
        this.finish = null;
        this.clearHandles();
        if (this.state() === 'listening') this.state.set('idle');
        resolve(text.trim());
      };
      this.finish = done;
      this.handles.push(await SpeechRecognition.addListener('partialResults', (e: any) => {
        const t = e.accumulatedText || e.matches?.[0] || '';
        if (t) this.transcript.set(t);
      }));
      this.handles.push(await SpeechRecognition.addListener('listeningState', async (e: any) => {
        if (e.state === 'stopped') {
          let text = this.transcript();
          if (!text) { try { const last = await SpeechRecognition.getLastPartialResult(); text = last.text || last.matches?.[0] || ''; } catch { /* ignore */ } }
          done(text);
        }
      }));
      this.handles.push(await SpeechRecognition.addListener('error', (e: any) => {
        if (!this.transcript()) this.error.set(e?.message || 'Didn\'t catch that');
        done(this.transcript());
      }));
      try {
        await SpeechRecognition.start({
          language: lang,
          partialResults: true,
          popup: false,
          maxResults: 1,
          useOnDeviceRecognition: !!this.onDevice(),
          allowForSilence: 1500,
        } as any);
      } catch (err: any) {
        this.error.set(err?.message ?? 'Speech recognition unavailable');
        done('');
      }
    });
  }

  private listenWeb(): Promise<string> {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { this.error.set('Speech recognition not supported in this browser'); this.state.set('idle'); return Promise.resolve(''); }
    return new Promise(resolve => {
      const rec = new SR();
      this.webRec = rec;
      rec.lang = this.store.settings().voice.language || 'en-GB';
      rec.interimResults = true;
      rec.continuous = false;
      rec.onresult = (e: any) => this.transcript.set(Array.from(e.results).map((r: any) => r[0].transcript).join(''));
      rec.onerror = (e: any) => this.error.set(e.error);
      rec.onend = () => { this.webRec = null; if (this.state() === 'listening') this.state.set('idle'); resolve(this.transcript().trim()); };
      rec.start();
    });
  }

  private async clearHandles() {
    const hs = this.handles; this.handles = [];
    await Promise.all(hs.map(h => h.remove().catch(() => undefined)));
  }

  // ---------------- TTS ----------------
  async speak(text: string, override?: { voiceId?: string; pitch?: number; rate?: number; engine?: string; language?: string }): Promise<void> {
    const clean = speakable(text);
    if (!clean) return;
    const v = this.store.settings().voice;
    this.state.set('speaking');
    try {
      // Android TTS has a per-utterance limit (~4000 chars); chunk by sentence.
      for (const chunk of this.chunks(clean, 3500)) {
        if (this.state() !== 'speaking') break;
        await JarvisDevice.speak({
          text: chunk,
          voiceId: override?.voiceId ?? v.voiceId,
          language: override?.language ?? v.language,
          pitch: override?.pitch ?? v.pitch,
          rate: override?.rate ?? v.rate,
          engine: override?.engine ?? v.engine,
        });
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Voice output failed');
    } finally {
      if (this.state() === 'speaking') this.state.set('idle');
    }
  }

  async stopSpeaking(): Promise<void> {
    if (this.state() === 'speaking') this.state.set('idle');
    try { await JarvisDevice.stopSpeaking(); } catch { /* ignore */ }
  }

  async voices(engine?: string): Promise<TtsVoice[]> {
    const r = await JarvisDevice.getVoices({ engine });
    return r.voices;
  }

  private chunks(text: string, max: number): string[] {
    if (text.length <= max) return [text];
    const out: string[] = [];
    let cur = '';
    for (const s of text.split(/(?<=[.!?])\s+/)) {
      if ((cur + ' ' + s).length > max && cur) { out.push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s;
    }
    if (cur) out.push(cur);
    return out;
  }
}
