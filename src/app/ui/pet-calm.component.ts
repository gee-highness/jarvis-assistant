import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, input, output, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import type { PetAmbient } from '../core/models';
import { PetLook, petSvg } from '../core/pet-art';
import { PetService } from '../core/pet.service';

interface Pattern { id: string; name: string; blurb: string; phases: { label: string; secs: number; to: number }[] }
export const PATTERNS: Pattern[] = [
  { id: 'calm', name: 'Calm 4 · 6', blurb: 'Longer out-breath. A gentle everyday reset.', phases: [{ label: 'Breathe in', secs: 4, to: 1 }, { label: 'Breathe out', secs: 6, to: 0.6 }] },
  { id: 'box', name: 'Box 4 · 4 · 4 · 4', blurb: 'Steady and even. Good before something big.', phases: [{ label: 'Breathe in', secs: 4, to: 1 }, { label: 'Hold', secs: 4, to: 1 }, { label: 'Breathe out', secs: 4, to: 0.6 }, { label: 'Rest', secs: 4, to: 0.6 }] },
  { id: '478', name: 'Slow 4 · 7 · 8', blurb: 'A deeper wind-down for the evening.', phases: [{ label: 'Breathe in', secs: 4, to: 1 }, { label: 'Hold', secs: 7, to: 1 }, { label: 'Breathe out', secs: 8, to: 0.6 }] },
  { id: 'even', name: 'Even 5 · 5', blurb: 'Simple, smooth and rhythmic.', phases: [{ label: 'Breathe in', secs: 5, to: 1 }, { label: 'Breathe out', secs: 5, to: 0.6 }] },
];
const AMBIENTS: { id: PetAmbient; icon: string; name: string }[] = [
  { id: 'rain', icon: '🌧', name: 'Rain' }, { id: 'ocean', icon: '🌊', name: 'Ocean' }, { id: 'fire', icon: '🔥', name: 'Fireplace' },
  { id: 'wind', icon: '🍃', name: 'Wind' }, { id: 'night', icon: '🌙', name: 'Crickets' }, { id: 'brown', icon: '☁️', name: 'Soft hum' },
];

/** Calm tools: guided breathing with the pup, a nap timer, and a soft sound mixer. Wellness support, not medical advice. */
@Component({
  selector: 'jarvis-pet-calm',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="col" style="gap:14px">
      <div class="card col">
        <b>Breathe with {{ pet.pet().name }}</b>
        <p class="small muted" style="margin:0">Follow the circle. {{ pet.pet().name }} breathes with you. A few slow breaths can take the edge off, and it is okay to stop any time.</p>
        <div class="pats">
          @for (p of patterns; track p.id) {
            <button class="pat" [class.on]="pattern().id === p.id" (click)="pattern.set(p)"><b>{{ p.name }}</b><span>{{ p.blurb }}</span></button>
          }
        </div>
        <div class="row wrap">
          <span class="small muted">Length</span>
          @for (m of [1, 3, 5, 10]; track m) { <button class="small" [class.on]="mins() === m" (click)="mins.set(m)">{{ m }} min</button> }
          <button class="primary" style="margin-left:auto" (click)="startBreath()">Start</button>
        </div>
      </div>

      <div class="card col">
        <b>Nap together</b>
        <p class="small muted" style="margin:0">The screen dims, {{ pet.pet().name }} curls up beside you, and a soft sound plays if you like. A gentle chime wakes you.</p>
        <div class="row wrap">
          @for (m of [10, 20, 30, 45]; track m) { <button class="small" [class.on]="nap() === m" (click)="nap.set(m)">{{ m }} min</button> }
          <button class="primary" style="margin-left:auto" (click)="startNap()">Nap</button>
        </div>
      </div>

      <div class="card col">
        <b>Soft sounds</b>
        <div class="mix">
          @for (a of ambients; track a.id) {
            <button class="amb" [class.on]="pet.pet().ambient === a.id && pet.pet().sound" (click)="setAmbient(a.id)"><span>{{ a.icon }}</span>{{ a.name }}</button>
          }
        </div>
        <div class="row">
          <label class="row small grow">🔈<input type="range" min="0" max="1" step="0.05" [value]="pet.pet().volume" (input)="vol($event)" style="flex:1"></label>
          <button class="small" (click)="stopSound()">Stop</button>
        </div>
        @if (!pet.pet().sound) { <div class="small muted">Sound is off. Tapping a sound turns it on.</div> }
      </div>

      <div class="card col wisdom">
        <div class="small muted">A thought from {{ pet.pet().name }}</div>
        <div class="quote">{{ thought() }}</div>
        <div class="row"><button class="small" (click)="another()">Another</button></div>
      </div>
    </div>

    @if (mode() === 'breath') {
      <div class="veil breath" (click)="$event.stopPropagation()">
        <button class="x" (click)="stopSession()" aria-label="End session">✕</button>
        <div class="stack">
          <div class="halo" [style.transform]="'scale(' + scale() + ')'" [style.transition-duration]="dur() + 's'"></div>
          <div class="halo h2" [style.transform]="'scale(' + (scale() * 0.82) + ')'" [style.transition-duration]="dur() + 's'"></div>
          <div class="pupb" [style.transform]="'scale(' + (0.7 + scale() * 0.3) + ')'" [style.transition-duration]="dur() + 's'" [innerHTML]="zen()"></div>
        </div>
        <div class="label">{{ phaseLabel() }}</div>
        <div class="sub">{{ secsLeft() }}</div>
        <div class="total">{{ remaining() }} left</div>
      </div>
    }
    @if (mode() === 'nap') {
      <div class="veil nap" (click)="$event.stopPropagation()">
        <button class="x" (click)="stopSession()" aria-label="End nap">✕</button>
        <div class="pupn" [innerHTML]="sleeping()"></div>
        <div class="label">Rest</div>
        <div class="sub">{{ remaining() }}</div>
        <div class="total">{{ pet.pet().name }} is right here</div>
      </div>
    }
  `,
  styles: [`
    .pats { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
    .pat { text-align: left; display: flex; flex-direction: column; gap: 3px; padding: 10px; border-radius: 12px; border: 1px solid var(--line); background: transparent; color: var(--text); }
    .pat span { font-size: .72rem; color: var(--muted); } .pat.on, button.on { border-color: var(--cyan); box-shadow: var(--glow); }
    .mix { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .amb { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 6px; border-radius: 12px; border: 1px solid var(--line); background: transparent; color: var(--text); font-size: .78rem; }
    .amb span { font-size: 1.5rem; }
    .quote { font-size: 1.05rem; line-height: 1.4; font-style: italic; }
    .wisdom { background: linear-gradient(135deg, rgba(var(--accent-rgb), .12), transparent); }
    .veil { position: fixed; inset: 0; z-index: 95; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; animation: fade .6s ease-out; color: #e8f4ff; }
    .veil.breath { background: radial-gradient(circle at 50% 40%, #1b3a52, #07111c 75%); }
    .veil.nap { background: radial-gradient(circle at 50% 45%, #1a1630, #05040c 80%); }
    @keyframes fade { from { opacity: 0; } }
    .x { position: absolute; top: calc(var(--safe-top) + 14px); right: 14px; width: 42px; height: 42px; border-radius: 50%; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.08); color: #fff; font-size: 1.1rem; }
    .stack { position: relative; width: 300px; height: 300px; display: flex; align-items: center; justify-content: center; }
    .halo { position: absolute; width: 300px; height: 300px; border-radius: 50%; background: radial-gradient(circle, rgba(94, 234, 212, .35), rgba(34, 211, 238, .1) 60%, transparent 72%); transition: transform ease-in-out; }
    .halo.h2 { background: radial-gradient(circle, rgba(167, 139, 250, .28), transparent 70%); }
    .pupb { width: 190px; transition: transform ease-in-out; position: relative; }
    .pupb ::ng-deep svg, .pupn ::ng-deep svg { width: 100%; height: auto; display: block; }
    .pupn { width: 230px; animation: breathe 5s ease-in-out infinite; }
    @keyframes breathe { 50% { transform: scale(1.03); } }
    .label { font-size: 1.6rem; font-weight: 300; letter-spacing: .04em; } .sub { font-size: 2.6rem; font-weight: 200; font-variant-numeric: tabular-nums; } .total { font-size: .85rem; opacity: .6; }
    @media (prefers-reduced-motion: reduce) { .halo, .pupb { transition-duration: 0s !important; } }
  `],
})
export class PetCalmComponent implements OnDestroy {
  readonly pet = inject(PetService);
  private san = inject(DomSanitizer);
  readonly look = input.required<PetLook>();
  readonly closed = output<void>();

  readonly patterns = PATTERNS;
  readonly ambients = AMBIENTS;
  readonly pattern = signal(PATTERNS[0]);
  readonly mins = signal(3);
  readonly nap = signal(20);
  readonly mode = signal<'idle' | 'breath' | 'nap'>('idle');
  readonly thought = signal('');
  readonly scale = signal(0.6);
  readonly dur = signal(4);
  readonly phaseLabel = signal('');
  readonly secsLeft = signal(0);
  readonly remainingSecs = signal(0);
  readonly remaining = computed(() => { const s = this.remainingSecs(); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; });
  readonly zen = computed(() => this.san.bypassSecurityTrustHtml(petSvg(this.look(), 'zen', { size: 190 })));
  readonly sleeping = computed(() => this.san.bypassSecurityTrustHtml(petSvg(this.look(), 'sleeping', { size: 230 })));

  private tick?: ReturnType<typeof setInterval>;
  private total = 0;
  private started = 0;
  private lock?: { release(): Promise<void> };

  constructor() { this.another(); }

  another() { this.thought.set(this.pet.say('pet.wisdom') || 'Take a slow breath. You are doing fine.'); this.pet.talked(); }

  setAmbient(id: PetAmbient) {
    this.pet.save({ ambient: id, sound: true });
    this.pet.audio.setVolume(this.pet.pet().volume);
    this.pet.audio.ambient(id);
  }
  stopSound() { this.pet.audio.stopAmbient(); this.pet.save({ ambient: 'off' }); }
  vol(ev: Event) { const v = Number((ev.target as HTMLInputElement).value); this.pet.save({ volume: v }); this.pet.audio.setVolume(v); }

  private async keepAwake() { try { this.lock = await (navigator as unknown as { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen'); } catch { /* optional */ } }

  startBreath() {
    this.mode.set('breath');
    this.keepAwake();
    this.total = this.mins() * 60;
    this.remainingSecs.set(this.total);
    this.started = Date.now();
    const pat = this.pattern();
    let idx = -1, left = 0;
    const next = () => {
      idx = (idx + 1) % pat.phases.length;
      const ph = pat.phases[idx];
      left = ph.secs;
      this.phaseLabel.set(ph.label);
      this.dur.set(ph.secs);
      this.scale.set(ph.to);
      this.pet.haptic('tick');
      this.pet.sfx(a => a.chime(ph.label === 'Breathe in' ? 440 : ph.label === 'Breathe out' ? 330 : 392, 1.8, 0.05));
    };
    this.scale.set(0.6);
    setTimeout(next, 60);
    this.tick = setInterval(() => {
      left--; this.secsLeft.set(Math.max(0, left));
      this.remainingSecs.update(s => Math.max(0, s - 1));
      if (this.remainingSecs() <= 0) { this.finishSession(true); return; }
      if (left <= 0) next();
    }, 1000);
    this.secsLeft.set(pat.phases[0].secs);
  }

  startNap() {
    this.mode.set('nap');
    this.keepAwake();
    this.total = this.nap() * 60;
    this.remainingSecs.set(this.total);
    this.started = Date.now();
    const amb = this.pet.pet().ambient;
    if (this.pet.pet().sound) this.pet.audio.ambient(amb === 'off' ? 'rain' : amb);
    this.tick = setInterval(() => {
      this.remainingSecs.update(s => Math.max(0, s - 1));
      if (this.remainingSecs() <= 0) { this.finishSession(true); }
    }, 1000);
  }

  stopSession() { this.finishSession(false); }
  private finishSession(complete: boolean) {
    clearInterval(this.tick);
    const kind = this.mode();
    const mins = Math.round(((complete ? this.total * 1000 : Date.now() - this.started)) / 60000);
    this.lock?.release().catch(() => undefined); this.lock = undefined;
    this.mode.set('idle');
    if (kind === 'nap') {
      if (this.pet.pet().ambient === 'off' || !this.pet.pet().sound) this.pet.audio.stopAmbient();
      if (complete) { this.pet.sfx(a => { a.chime(523, 2.4, 0.09); setTimeout(() => a.chime(659, 2.4, 0.08), 500); }); this.pet.haptic('success'); }
    } else if (complete) { this.pet.sfx(a => a.sparkle()); this.pet.haptic('success'); }
    if (kind !== 'idle' && (complete || mins >= 1)) this.pet.calmDone(kind === 'nap' ? 'nap' : 'breath', Math.max(1, mins));
    this.closed.emit();
  }

  ngOnDestroy() { clearInterval(this.tick); this.lock?.release().catch(() => undefined); }
}
