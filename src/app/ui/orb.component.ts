import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { DEFAULT_LOOK, DEFAULT_PET } from '../core/models';
import { PetMood, petSvg } from '../core/pet-art';
import { StoreService } from '../core/store.service';
import { VoiceState } from '../core/voice.service';

/** Arc-reactor orb. States animate differently: idle breathes, listening ripples, thinking spins, speaking pulses. */
@Component({
  selector: 'j-orb',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (kind() === 'pet') {
      <div class="pet" [class]="state()" [style.width.px]="size()" [style.height.px]="size()" [innerHTML]="pet()"></div>
    } @else if (kind() !== 'none') {
    <div class="orb" [class]="state() + (kind() === 'pulse' ? ' pulse' : '')" [style.--s]="size() + 'px'">
      <div class="ring r1"></div>
      <div class="ring r2"></div>
      <div class="ring r3"></div>
      <div class="core"></div>
      @if (state() === 'listening') { <div class="ripple"></div><div class="ripple d2"></div> }
    </div>
    }
  `,
  styles: [`
    :host { display: inline-block; }
    .pulse .ring { display: none; }
    .pet { display: grid; place-items: center; }
    .pet.listening { animation: bob .6s ease-in-out infinite alternate; }
    .pet.speaking { animation: bob .3s ease-in-out infinite alternate; }
    .pet.thinking { animation: tilt 1.2s ease-in-out infinite alternate; }
    @keyframes bob { from { transform: translateY(0); } to { transform: translateY(-6px); } }
    @keyframes tilt { from { transform: rotate(-6deg); } to { transform: rotate(6deg); } }
    .orb { --s: 120px; width: var(--s); height: var(--s); position: relative; display: grid; place-items: center; }
    .ring { position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(var(--accent-rgb), .55); }
    .r1 { border-style: dashed; border-color: rgba(var(--accent-rgb), .35); animation: spin 18s linear infinite; }
    .r2 { inset: 12%; border-width: 3px; border-color: rgba(var(--accent-rgb), .25) rgba(var(--accent-rgb), .9) rgba(var(--accent-rgb), .25) rgba(var(--accent-rgb), .9); animation: spin 7s linear infinite reverse; }
    .r3 { inset: 26%; border-color: rgba(103,232,249,.6); box-shadow: 0 0 22px rgba(var(--accent-rgb), .35) inset; }
    .core { width: 30%; height: 30%; border-radius: 50%; background: radial-gradient(circle, #e0fbff 0%, var(--cyan-2) 35%, var(--accent-deep) 75%, transparent 100%); box-shadow: 0 0 30px var(--cyan), 0 0 70px rgba(var(--accent-rgb), .5); animation: breathe 3.2s ease-in-out infinite; }
    .listening .core { animation: breathe .9s ease-in-out infinite; }
    .listening .r2 { animation-duration: 2.5s; }
    .thinking .r1 { animation-duration: 2.4s; }
    .thinking .r2 { animation-duration: 1.1s; }
    .thinking .core { background: radial-gradient(circle, #fff 0%, #a78bfa 40%, #6d28d9 80%, transparent 100%); box-shadow: 0 0 30px #a78bfa; }
    .speaking .core { animation: talk .35s ease-in-out infinite alternate; }
    .ripple { position: absolute; inset: 20%; border-radius: 50%; border: 2px solid rgba(var(--accent-rgb), .7); animation: ripple 1.6s ease-out infinite; }
    .ripple.d2 { animation-delay: .8s; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes breathe { 0%,100% { transform: scale(.92); } 50% { transform: scale(1.06); } }
    @keyframes talk { from { transform: scale(.9); } to { transform: scale(1.18); } }
    @keyframes ripple { from { transform: scale(1); opacity: .9; } to { transform: scale(2.3); opacity: 0; } }
  `],
})
export class OrbComponent {
  state = input<VoiceState>('idle');
  size = input(120);
  private store = inject(StoreService);
  private san = inject(DomSanitizer);
  readonly kind = computed(() => (this.store.settings().look ?? DEFAULT_LOOK).orb);
  readonly pet = computed(() => {
    const p = { ...DEFAULT_PET, ...(this.store.settings().pet ?? {}) };
    const st = this.state();
    const mood: PetMood = st === 'speaking' ? 'excited' : st === 'listening' ? 'happy' : st === 'thinking' ? 'bored' : 'happy';
    return this.san.bypassSecurityTrustHtml(petSvg({ fur: p.fur, patch: p.patch, bandana: p.bandana, accessory: p.accessory }, mood, { size: this.size() }));
  });
}
