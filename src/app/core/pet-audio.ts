/**
 * All pup sounds are synthesised with Web Audio, so there are no audio files to ship and nothing leaves the phone.
 * Ambient beds (rain, ocean, fire, wind, crickets, brown noise), a purr, soft yips and breathing chimes.
 * Sound is OFF until the user turns it on, and nothing starts without a tap.
 */
export type AmbientKind = 'off' | 'rain' | 'ocean' | 'fire' | 'wind' | 'night' | 'brown';

type Ctx = AudioContext;

export class PetAudio {
  private ctx?: Ctx;
  private master?: GainNode;
  private volume = 0.5;
  private ambNodes: AudioNode[] = [];
  private ambTimers: ReturnType<typeof setInterval>[] = [];
  private ambGain?: GainNode;
  private purrNodes: AudioNode[] = [];
  private purrGain?: GainNode;
  private noiseCache: Partial<Record<'white' | 'pink' | 'brown', AudioBuffer>> = {};
  kind: AmbientKind = 'off';

  get supported() { return typeof window !== 'undefined' && !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext); }

  private ensure(): Ctx | null {
    if (!this.supported) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
    return this.ctx;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
  }

  private noise(c: Ctx, type: 'white' | 'pink' | 'brown'): AudioBuffer {
    const cached = this.noiseCache[type];
    if (cached) return cached;
    const len = c.sampleRate * 4;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'white') d[i] = w * 0.5;
      else if (type === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    this.noiseCache[type] = buf;
    return buf;
  }

  private src(c: Ctx, type: 'white' | 'pink' | 'brown'): AudioBufferSourceNode {
    const s = c.createBufferSource();
    s.buffer = this.noise(c, type);
    s.loop = true;
    s.start(0, Math.random() * 3);
    return s;
  }

  private lfo(c: Ctx, hz: number, depth: number, target: AudioParam) {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.value = hz; g.gain.value = depth;
    o.connect(g); g.connect(target); o.start();
    this.ambNodes.push(o, g);
  }

  // ---------------------------------------------------------------- ambient beds
  ambient(kind: AmbientKind) {
    this.stopAmbient();
    this.kind = kind;
    if (kind === 'off') return;
    const c = this.ensure();
    if (!c || !this.master) return;
    const out = c.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(0.9, c.currentTime, 1.2);
    out.connect(this.master);
    this.ambGain = out;
    const keep = (...n: AudioNode[]) => this.ambNodes.push(...n);
    switch (kind) {
      case 'rain': {
        const s = this.src(c, 'pink'), hp = c.createBiquadFilter(), lp = c.createBiquadFilter(), g = c.createGain();
        hp.type = 'highpass'; hp.frequency.value = 500; lp.type = 'lowpass'; lp.frequency.value = 7000; g.gain.value = 0.55;
        s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(out); keep(s, hp, lp, g);
        this.lfo(c, 0.07, 0.08, g.gain);
        const drops = setInterval(() => this.droplet(c, out), 180 + Math.random() * 240);
        this.ambTimers.push(drops);
        break;
      }
      case 'ocean': {
        const s = this.src(c, 'brown'), lp = c.createBiquadFilter(), g = c.createGain();
        lp.type = 'lowpass'; lp.frequency.value = 650; g.gain.value = 0.35;
        s.connect(lp); lp.connect(g); g.connect(out); keep(s, lp, g);
        this.lfo(c, 0.1, 0.28, g.gain);
        const foam = this.src(c, 'white'), hp = c.createBiquadFilter(), fg = c.createGain();
        hp.type = 'highpass'; hp.frequency.value = 2500; fg.gain.value = 0.05;
        foam.connect(hp); hp.connect(fg); fg.connect(out); keep(foam, hp, fg);
        this.lfo(c, 0.1, 0.05, fg.gain);
        break;
      }
      case 'fire': {
        const s = this.src(c, 'brown'), lp = c.createBiquadFilter(), g = c.createGain();
        lp.type = 'lowpass'; lp.frequency.value = 420; g.gain.value = 0.55;
        s.connect(lp); lp.connect(g); g.connect(out); keep(s, lp, g);
        this.lfo(c, 0.4, 0.1, g.gain);
        this.ambTimers.push(setInterval(() => this.crackle(c, out), 120 + Math.random() * 380));
        break;
      }
      case 'wind': {
        const s = this.src(c, 'pink'), bp = c.createBiquadFilter(), g = c.createGain();
        bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.8; g.gain.value = 0.5;
        s.connect(bp); bp.connect(g); g.connect(out); keep(s, bp, g);
        this.lfo(c, 0.06, 260, bp.frequency);
        this.lfo(c, 0.09, 0.18, g.gain);
        break;
      }
      case 'night': {
        const s = this.src(c, 'brown'), lp = c.createBiquadFilter(), g = c.createGain();
        lp.type = 'lowpass'; lp.frequency.value = 300; g.gain.value = 0.18;
        s.connect(lp); lp.connect(g); g.connect(out); keep(s, lp, g);
        for (let i = 0; i < 3; i++) this.cricket(c, out, 4100 + i * 190, 0.9 + i * 0.13, 0.012 + i * 0.002);
        break;
      }
      default: {
        const s = this.src(c, 'brown'), lp = c.createBiquadFilter(), g = c.createGain();
        lp.type = 'lowpass'; lp.frequency.value = 900; g.gain.value = 0.5;
        s.connect(lp); lp.connect(g); g.connect(out); keep(s, lp, g);
      }
    }
  }

  private cricket(c: Ctx, out: AudioNode, hz: number, gateHz: number, level: number) {
    const o = c.createOscillator(), amp = c.createGain(), trem = c.createOscillator(), tg = c.createGain(), gate = c.createOscillator(), gg = c.createGain();
    o.type = 'sine'; o.frequency.value = hz;
    amp.gain.value = 0;
    trem.type = 'square'; trem.frequency.value = 22; tg.gain.value = level;
    gate.type = 'square'; gate.frequency.value = gateHz; gg.gain.value = level;
    trem.connect(tg); tg.connect(amp.gain); gate.connect(gg); gg.connect(amp.gain);
    o.connect(amp); amp.connect(out);
    o.start(); trem.start(); gate.start();
    this.ambNodes.push(o, amp, trem, tg, gate, gg);
  }

  private droplet(c: Ctx, out: AudioNode) {
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = 'sine'; o.frequency.setValueAtTime(1800 + Math.random() * 1800, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.05);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.012 + Math.random() * 0.01, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.09);
  }

  private crackle(c: Ctx, out: AudioNode) {
    const s = c.createBufferSource(), g = c.createGain(), hp = c.createBiquadFilter(), t = c.currentTime;
    s.buffer = this.noise(c, 'white'); hp.type = 'highpass'; hp.frequency.value = 1500 + Math.random() * 2500;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.09, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.05);
    s.connect(hp); hp.connect(g); g.connect(out); s.start(t, Math.random() * 3, 0.12);
  }

  stopAmbient() {
    this.kind = 'off';
    for (const t of this.ambTimers) clearInterval(t);
    this.ambTimers = [];
    const c = this.ctx, g = this.ambGain, nodes = this.ambNodes;
    this.ambNodes = [];
    this.ambGain = undefined;
    if (c && g) {
      g.gain.setTargetAtTime(0, c.currentTime, 0.25);
      setTimeout(() => { for (const n of nodes) { try { (n as OscillatorNode).stop?.(); } catch { /* already stopped */ } try { n.disconnect(); } catch { /* ok */ } } try { g.disconnect(); } catch { /* ok */ } }, 1200);
    }
  }

  // ---------------------------------------------------------------- the purr
  purr(on: boolean) {
    const c = this.ensure();
    if (!c || !this.master) return;
    if (!on) {
      const g = this.purrGain, nodes = this.purrNodes;
      this.purrNodes = []; this.purrGain = undefined;
      if (g) { g.gain.setTargetAtTime(0, c.currentTime, 0.2); setTimeout(() => { for (const n of nodes) { try { (n as OscillatorNode).stop?.(); } catch { /* ok */ } try { n.disconnect(); } catch { /* ok */ } } try { g.disconnect(); } catch { /* ok */ } }, 900); }
      return;
    }
    if (this.purrGain) return;
    const out = c.createGain();
    out.gain.value = 0; out.gain.setTargetAtTime(0.9, c.currentTime, 0.4); out.connect(this.master);
    const s = this.src(c, 'brown'), lp = c.createBiquadFilter(), am = c.createGain(), o = c.createOscillator(), og = c.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 160; am.gain.value = 0.5;
    o.frequency.value = 24; og.gain.value = 0.45; o.connect(og); og.connect(am.gain); o.start();
    const hum = c.createOscillator(), hg = c.createGain();
    hum.type = 'sine'; hum.frequency.value = 52; hg.gain.value = 0.05; hum.connect(hg); hg.connect(out); hum.start();
    s.connect(lp); lp.connect(am); am.connect(out);
    this.purrGain = out;
    this.purrNodes = [s, lp, am, o, og, hum, hg, out];
  }

  // ---------------------------------------------------------------- one-shot sounds
  private env(c: Ctx, o: OscillatorNode, peak: number, dur: number, t = c.currentTime) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master!); o.start(t); o.stop(t + dur + 0.05);
  }

  /** A soft, friendly yip. kind: yip | happy | whine | pant | sniff */
  voice(kind: 'yip' | 'happy' | 'whine' | 'pant' | 'sniff' = 'yip') {
    const c = this.ensure();
    if (!c || !this.master) return;
    const t = c.currentTime;
    const yip = (at: number, f0: number, f1: number, dur: number, peak = 0.16) => {
      const o = c.createOscillator(), lp = c.createBiquadFilter();
      o.type = 'sawtooth'; lp.type = 'lowpass'; lp.frequency.value = 1500;
      o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur);
      o.connect(lp);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      lp.connect(g); g.connect(this.master!); o.start(at); o.stop(at + dur + 0.05);
    };
    if (kind === 'yip') yip(t, 520, 760, 0.16);
    else if (kind === 'happy') { yip(t, 540, 820, 0.12); yip(t + 0.17, 600, 900, 0.14); }
    else if (kind === 'whine') { const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(760, t); o.frequency.exponentialRampToValueAtTime(480, t + 0.5); this.env(c, o, 0.1, 0.55); }
    else if (kind === 'pant' || kind === 'sniff') {
      for (let i = 0; i < (kind === 'pant' ? 4 : 3); i++) {
        const s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(), at = t + i * 0.19;
        s.buffer = this.noise(c, 'white'); bp.type = 'bandpass'; bp.frequency.value = kind === 'pant' ? 1200 : 2400; bp.Q.value = 0.7;
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.07, at + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
        s.connect(bp); bp.connect(g); g.connect(this.master); s.start(at, Math.random() * 3, 0.2);
      }
    }
  }

  /** A soft chime (breathing phases, rewards). */
  chime(hz = 528, dur = 1.6, level = 0.12) {
    const c = this.ensure();
    if (!c || !this.master) return;
    const o = c.createOscillator(), o2 = c.createOscillator();
    o.type = 'sine'; o.frequency.value = hz; o2.type = 'sine'; o2.frequency.value = hz * 2.005;
    const g = c.createGain(), g2 = c.createGain(), t = c.currentTime;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g2.gain.value = 0.25; o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.master); o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }
  pop(pitch = 880) { const c = this.ensure(); if (!c || !this.master) return; const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(pitch, c.currentTime); o.frequency.exponentialRampToValueAtTime(pitch * 1.6, c.currentTime + 0.08); this.env(c, o, 0.14, 0.14); }
  /** A little rising arpeggio for rewards. */
  sparkle() { [0, 4, 7, 12].forEach((s, i) => setTimeout(() => this.chime(523.25 * Math.pow(2, s / 12), 0.9, 0.07), i * 90)); }

  dispose() {
    this.stopAmbient();
    this.purr(false);
    setTimeout(() => { this.ctx?.close().catch(() => undefined); this.ctx = undefined; this.master = undefined; this.noiseCache = {}; }, 1400);
  }
}
