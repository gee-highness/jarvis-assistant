import { Injectable, effect, inject, signal } from '@angular/core';
import { FocusService } from './focus.service';

export interface Scape { id: string; label: string; icon: string; hint: string; }
export const SCAPES: Scape[] = [
  { id: 'rain', label: 'Rain', icon: '🌧', hint: 'Soft steady rain' },
  { id: 'ocean', label: 'Ocean', icon: '🌊', hint: 'Slow rolling waves' },
  { id: 'wind', label: 'Wind', icon: '🍃', hint: 'Drifting breeze' },
  { id: 'fire', label: 'Fireplace', icon: '🔥', hint: 'Warm crackle' },
  { id: 'brown', label: 'Brown noise', icon: '🟤', hint: 'Deep, masks everything' },
  { id: 'pink', label: 'Pink noise', icon: '🌸', hint: 'Balanced, natural' },
  { id: 'white', label: 'White noise', icon: '⚪', hint: 'Bright static' },
  { id: 'alpha', label: 'Focus tone', icon: '🎧', hint: '10 Hz binaural (headphones)' },
];

const KEY = 'jarvis_scape';

/** Offline procedural soundscapes (Web Audio): no files, no network. */
@Injectable({ providedIn: 'root' })
export class SoundscapeService {
  private focus = inject(FocusService);
  readonly playing = signal<string | null>(null);
  readonly volume = signal(this.load('vol', 0.5));
  readonly selected = signal<string>(this.loadStr('id', 'rain'));
  readonly autoPlay = signal(this.loadStr('auto', '1') === '1');

  private ctx?: AudioContext;
  private master?: GainNode;
  private nodes: AudioNode[] = [];
  private timers: number[] = [];

  constructor() {
    // stop the sound when a focus session ends
    let was = false;
    effect(() => {
      const on = !!this.focus.current();
      if (was && !on && this.playing() && this.autoPlay()) this.stop();
      was = on;
    });
  }

  private load(k: string, d: number) { try { const v = localStorage.getItem(KEY + k); return v ? +v : d; } catch { return d; } }
  private loadStr(k: string, d: string) { try { return localStorage.getItem(KEY + k) ?? d; } catch { return d; } }
  private save(k: string, v: string) { try { localStorage.setItem(KEY + k, v); } catch { /* ignore */ } }

  select(id: string) { this.selected.set(id); this.save('id', id); if (this.playing()) this.start(id); }
  setAuto(v: boolean) { this.autoPlay.set(v); this.save('auto', v ? '1' : '0'); }
  setVolume(v: number) { this.volume.set(v); this.save('vol', String(v)); if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  toggle() { this.playing() ? this.stop() : this.start(this.selected()); }

  start(id = this.selected()) {
    this.stop();
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx ??= new AC();
    const ctx = this.ctx!;
    ctx.resume().catch(() => undefined);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    this.master.gain.setTargetAtTime(this.volume(), ctx.currentTime, 0.4);
    this.nodes.push(this.master);
    this.build(id, ctx, this.master);
    this.playing.set(id);
  }

  stop() {
    this.timers.forEach(t => clearInterval(t));
    this.timers = [];
    const ctx = this.ctx, m = this.master;
    if (ctx && m) m.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    const old = this.nodes;
    this.nodes = [];
    setTimeout(() => old.forEach(n => { try { (n as any).stop?.(); n.disconnect(); } catch { /* ignore */ } }), 400);
    this.playing.set(null);
  }

  // ---- generators
  private noise(ctx: AudioContext, kind: 'white' | 'pink' | 'brown'): AudioBufferSourceNode {
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w * 0.5;
        else if (kind === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true; src.start();
    this.nodes.push(src);
    return src;
  }

  private chain(...n: AudioNode[]) { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); this.nodes.push(...n); }

  private lfo(ctx: AudioContext, hz: number, depth: number, target: AudioParam) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = hz; g.gain.value = depth;
    o.connect(g); g.connect(target); o.start();
    this.nodes.push(o, g);
  }

  private build(id: string, ctx: AudioContext, out: AudioNode) {
    const filter = (type: BiquadFilterType, f: number, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    switch (id) {
      case 'white': case 'pink': case 'brown': { const g = ctx.createGain(); g.gain.value = id === 'brown' ? 0.6 : 0.5; this.chain(this.noise(ctx, id), g, out); break; }
      case 'rain': {
        const g = ctx.createGain(); g.gain.value = 0.7;
        this.chain(this.noise(ctx, 'pink'), filter('highpass', 500), filter('lowpass', 7000), g, out);
        const g2 = ctx.createGain(); g2.gain.value = 0.25;
        this.chain(this.noise(ctx, 'white'), filter('bandpass', 3500, 0.5), g2, out);
        break;
      }
      case 'ocean': {
        const g = ctx.createGain(); g.gain.value = 0.35;
        this.chain(this.noise(ctx, 'brown'), filter('lowpass', 900), g, out);
        this.lfo(ctx, 0.09, 0.3, g.gain);
        const g2 = ctx.createGain(); g2.gain.value = 0.12;
        this.chain(this.noise(ctx, 'pink'), filter('bandpass', 1800, 0.6), g2, out);
        this.lfo(ctx, 0.07, 0.1, g2.gain);
        break;
      }
      case 'wind': {
        const g = ctx.createGain(); g.gain.value = 0.5;
        const bp = filter('bandpass', 500, 1.2);
        this.chain(this.noise(ctx, 'pink'), bp, g, out);
        this.lfo(ctx, 0.12, 300, bp.frequency);
        this.lfo(ctx, 0.05, 0.25, g.gain);
        break;
      }
      case 'fire': {
        const g = ctx.createGain(); g.gain.value = 0.55;
        this.chain(this.noise(ctx, 'brown'), filter('lowpass', 600), g, out);
        const crackle = () => {
          if (!this.ctx || this.playing() === null) return;
          const o = ctx.createBufferSource(), n = ctx.createBuffer(1, 600, ctx.sampleRate), d = n.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 90);
          o.buffer = n;
          const cg = ctx.createGain(); cg.gain.value = 0.3 + Math.random() * 0.7;
          o.connect(cg); cg.connect(out); o.start();
        };
        this.timers.push(window.setInterval(() => { const k = Math.random() * 4; for (let i = 0; i < k; i++) setTimeout(crackle, Math.random() * 250); }, 250));
        break;
      }
      case 'alpha': {
        const mk = (f: number, pan: number) => {
          const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
          o.frequency.value = f; g.gain.value = 0.18; p.pan.value = pan;
          this.chain(o, g, p, out); o.start();
        };
        mk(200, -1); mk(210, 1);
        const g = ctx.createGain(); g.gain.value = 0.2;
        this.chain(this.noise(ctx, 'brown'), filter('lowpass', 500), g, out);
        break;
      }
    }
  }
}
