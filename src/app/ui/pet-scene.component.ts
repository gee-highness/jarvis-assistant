import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import type { PetScene, PetToy } from '../core/models';
import { PetLook, PetMood, petSvg, toySvg } from '../core/pet-art';
import { skyAt } from '../core/pet-sky';

// ---------------------------------------------------------------- scenes (all original, drawn in SVG)
function sceneSvg(scene: PetScene, night: number): string {
  const dim = (c: string) => c;
  void dim;
  switch (scene) {
    case 'bedroom': return `<svg viewBox="0 0 400 340" preserveAspectRatio="xMidYMax slice" class="art">
      <rect width="400" height="340" fill="#3a2c4a"/><rect y="230" width="400" height="110" fill="#5a4030"/>
      <path d="M0 230 H400" stroke="#2a1f35" stroke-width="6"/>
      <rect x="250" y="40" width="110" height="120" rx="8" fill="#241a33"/><rect x="258" y="48" width="94" height="104" rx="4" class="winglass"/>
      <path d="M305 48 v104 M258 100 h94" stroke="#241a33" stroke-width="5"/>
      <ellipse cx="200" cy="300" rx="150" ry="26" fill="#7f4a6a" opacity=".85"/><ellipse cx="200" cy="300" rx="110" ry="17" fill="#a85f86" opacity=".6"/>
      <rect x="20" y="170" width="120" height="70" rx="14" fill="#5b7bb0"/><rect x="26" y="162" width="108" height="28" rx="12" fill="#7f9fd4"/><rect x="28" y="196" width="104" height="38" rx="8" fill="#456090"/>
      <rect x="150" y="130" width="6" height="100" fill="#2a1f35"/><path d="M128 130 h50 l-12 -28 h-26 z" fill="#fbbf24"/><ellipse cx="153" cy="132" rx="70" ry="60" fill="#fde68a" opacity="${(0.1 + night * 0.18).toFixed(2)}"/>
      <rect x="320" y="200" width="46" height="40" rx="6" fill="#6b4a33"/><rect x="326" y="190" width="34" height="14" rx="4" fill="#8b5e3c"/>
    </svg>`;
    case 'beach': return `<svg viewBox="0 0 400 340" preserveAspectRatio="xMidYMax slice" class="art">
      <rect y="150" width="400" height="60" fill="#2b9bd3"/><rect y="150" width="400" height="60" fill="url(#sea)" opacity=".5"/>
      <defs><linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9be8ff"/><stop offset="1" stop-color="#1b6ba3"/></linearGradient></defs>
      <g class="waves"><path d="M-20 168 q20 -10 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 v10 h-440z" fill="#ffffff" opacity=".35"/></g>
      <g class="waves slow"><path d="M-20 190 q20 -10 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 v12 h-440z" fill="#ffffff" opacity=".5"/></g>
      <path d="M0 205 q200 -22 400 0 V340 H0z" fill="#f3dca8"/><path d="M0 232 q200 -14 400 0" stroke="#e1c88c" stroke-width="3" fill="none"/>
      <g transform="translate(330 70)"><path d="M0 130 q-4 -50 6 -96" stroke="#7a5a3a" stroke-width="9" fill="none" stroke-linecap="round"/><g fill="#2f9e5b"><path d="M6 34 q-40 -10 -52 14 q30 -12 52 -6z"/><path d="M6 34 q40 -14 56 8 q-34 -10 -56 -4z"/><path d="M6 34 q-8 -34 -34 -36 q22 8 34 30z"/><path d="M6 34 q14 -34 44 -30 q-30 4 -44 32z"/></g></g>
      <ellipse cx="60" cy="300" rx="14" ry="9" fill="#ffb6c1"/><path d="M52 300 q8 -10 16 0" stroke="#e58aa0" stroke-width="2" fill="none"/>
      <ellipse cx="300" cy="316" rx="10" ry="6" fill="#fde7d4"/>
    </svg>`;
    case 'cabin': return `<svg viewBox="0 0 400 340" preserveAspectRatio="xMidYMax slice" class="art">
      <rect width="400" height="340" fill="#4a3322"/><g stroke="#3a2619" stroke-width="3">${Array.from({ length: 9 }, (_, i) => `<path d="M0 ${i * 28 + 20} H400"/>`).join('')}</g>
      <rect y="250" width="400" height="90" fill="#6b4a2e"/><rect y="250" width="400" height="6" fill="#3a2619"/>
      <rect x="40" y="60" width="130" height="150" rx="8" fill="#241a12"/><rect x="50" y="70" width="110" height="130" rx="4" fill="#120d09"/>
      <g class="flame"><path d="M105 190 q-30 -30 -8 -62 q4 20 18 22 q-4 -26 16 -48 q8 40 24 56 q8 22 -14 32 z" fill="#f97316"/><path d="M105 190 q-16 -16 -4 -36 q4 12 12 12 q-2 -16 8 -28 q8 24 12 36 q2 12 -10 16z" fill="#fde047"/></g>
      <ellipse cx="105" cy="150" rx="130" ry="120" fill="#fb923c" opacity="${(0.12 + night * 0.18).toFixed(2)}" class="glow"/>
      <rect x="230" y="50" width="120" height="100" rx="6" fill="#241a12"/><rect x="238" y="58" width="104" height="84" rx="3" class="winglass"/><path d="M290 58 v84 M238 100 h104" stroke="#241a12" stroke-width="4"/>
      <ellipse cx="260" cy="304" rx="150" ry="24" fill="#8b3a3a" opacity=".85"/><ellipse cx="260" cy="304" rx="104" ry="15" fill="#b34a4a" opacity=".6"/>
    </svg>`;
    case 'garden': return `<svg viewBox="0 0 400 340" preserveAspectRatio="xMidYMax slice" class="art">
      <path d="M0 190 q100 -34 200 -10 t200 -6 V340 H0z" fill="#6cc573"/><path d="M0 230 q120 -30 240 -4 t160 -4 V340 H0z" fill="#53b061"/>
      <g fill="#e8d9b5" stroke="#cdbb90" stroke-width="2">${Array.from({ length: 11 }, (_, i) => `<path d="M${i * 38 - 10} 210 v-44 l9 -10 l9 10 v44 z"/>`).join('')}<rect x="-10" y="180" width="430" height="7"/><rect x="-10" y="198" width="430" height="7"/></g>
      <g>${Array.from({ length: 14 }, (_, i) => { const x = 18 + i * 28 + (i % 3) * 5, y = 250 + (i * 37 % 60), c = ['#fb7185', '#f9a8d4', '#fde047', '#a78bfa', '#fff'][i % 5]; return `<g transform="translate(${x} ${y})"><path d="M0 0 v18" stroke="#2f8f4a" stroke-width="3"/><circle r="6" fill="${c}"/><circle r="2.5" fill="#fbbf24"/></g>`; }).join('')}</g>
      <g transform="translate(330 120)"><rect x="-6" y="40" width="12" height="60" fill="#7a5a3a"/><circle r="40" fill="#3a9e5a"/><circle cx="-24" cy="14" r="26" fill="#43ad66"/><circle cx="26" cy="12" r="24" fill="#43ad66"/></g>
    </svg>`;
    case 'starry': return `<svg viewBox="0 0 400 340" preserveAspectRatio="xMidYMax slice" class="art">
      <path d="M0 220 q90 -70 200 -30 t200 -20 V340 H0z" fill="#0f2a2a"/><path d="M0 262 q120 -50 240 -16 t160 -10 V340 H0z" fill="#0b2020"/>
      <g fill="#14403a" opacity=".9"><path d="M40 262 l12 -42 l12 42z"/><path d="M62 262 l10 -34 l10 34z"/><path d="M340 258 l14 -50 l14 50z"/><path d="M366 258 l10 -36 l10 36z"/></g>
      <rect width="400" height="340" fill="#050a1a" opacity="${(0.25 - night * 0.0).toFixed(2)}"/>
    </svg>`;
    default: return `<svg viewBox="0 0 400 340" preserveAspectRatio="xMidYMax slice" class="art">
      <path d="M0 206 q90 -60 190 -22 t210 -14 V340 H0z" fill="#8bd47a"/><path d="M0 238 q120 -40 250 -8 t150 -8 V340 H0z" fill="#6fc063"/>
      <g>${Array.from({ length: 18 }, (_, i) => { const x = 10 + i * 22 + (i % 4) * 4, y = 262 + (i * 29 % 62), c = ['#fff', '#fde047', '#fb7185', '#c4b5fd'][i % 4]; return `<g transform="translate(${x} ${y})"><path d="M0 0 v10" stroke="#3c9a4a" stroke-width="2"/><circle r="3.4" fill="${c}"/><circle r="1.3" fill="#f59e0b"/></g>`; }).join('')}</g>
      <g transform="translate(60 150)"><rect x="-5" y="30" width="10" height="46" fill="#8b5e3c"/><circle r="32" fill="#43a85a"/><circle cx="-20" cy="10" r="20" fill="#4fb768"/><circle cx="22" cy="8" r="19" fill="#4fb768"/></g>
    </svg>`;
  }
}

type Idle = 'tilt' | 'hop' | 'shake' | 'stretch' | 'sniff' | 'spin' | 'wiggle';

@Component({
  selector: 'jarvis-pet-scene',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #stage class="stage" [class.calm]="calm()" [class.night]="sky().night > 0.55" (pointermove)="gaze($event)" (pointerleave)="gazeReset()"
         [style.--top]="sky().top" [style.--bottom]="sky().bottom" [style.--night]="sky().night" (click)="stageClick($event)">
      @if (scene() !== 'bedroom' && scene() !== 'cabin') {
        <div class="sky"></div>
        <div class="orb sun" [style.left.%]="sun().x" [style.top.%]="sun().y" [style.opacity]="sun().o"></div>
        <div class="orb moon" [style.left.%]="moon().x" [style.top.%]="moon().y" [style.opacity]="moon().o"><i></i></div>
        <div class="stars" [style.opacity]="starOpacity()">
          @for (s of stars; track $index) { <b [style.left.%]="s.x" [style.top.%]="s.y" [style.--d]="s.d + 's'" [style.--sz]="s.s + 'px'"></b> }
        </div>
        <div class="cloud c1"></div><div class="cloud c2"></div><div class="cloud c3"></div>
      } @else {
        <div class="roomwall"></div>
      }
      <div class="art-wrap" [innerHTML]="art()"></div>

      <div class="particles">
        @if (sky().night > 0.35 || scene() === 'starry') {
          @for (f of flies; track $index) { <span class="fly" [style.left.%]="f.x" [style.top.%]="f.y" [style.--dx]="f.dx + 'px'" [style.--dy]="f.dy + 'px'" [style.animation-delay]="f.d + 's'"></span> }
        }
        @if ((scene() === 'meadow' || scene() === 'garden') && sky().night < 0.3 && !calm()) {
          @for (b of bflies; track $index) { <span class="bfly" [style.top.%]="b.y" [style.animation-delay]="b.d + 's'" [style.animation-duration]="b.t + 's'">🦋</span> }
        }
        @if (scene() === 'garden') { @for (p of petals; track $index) { <span class="petal" [style.left.%]="p.x" [style.animation-delay]="p.d + 's'" [style.animation-duration]="p.t + 's'"></span> } }
        @if (scene() === 'cabin') { @for (e of embers; track $index) { <span class="ember" [style.left.%]="e.x" [style.animation-delay]="e.d + 's'"></span> } }
        @if (rain()) { @for (r of drops; track $index) { <span class="rain" [style.left.%]="r.x" [style.animation-delay]="r.d + 's'"></span> } }
      </div>

      <div class="pupwrap" #pupwrap [style.left.%]="x()" [class]="'pupwrap ' + idleClass() + (running() ? ' running' : '') + (holding() ? ' holding' : '')" [style.--face]="face()"
           (pointerdown)="down($event)" (pointerup)="up($event)" (pointercancel)="up($event)" (pointerleave)="up($event)" (click)="$event.stopPropagation()">
        @if (speech()) { <div class="bubble" [class.dream]="mood() === 'sleeping'">{{ speech() }}</div> }
        <div class="pup" [innerHTML]="html()"></div>
        <div class="shadow"></div>
      </div>

      <span class="toy" #toy [style.display]="toyShown() ? 'block' : 'none'" [innerHTML]="toyHtml()"></span>
      <span class="toy" #treatEl [style.display]="treatShown() ? 'block' : 'none'" [innerHTML]="treatHtml"></span>
      @for (h of hearts(); track h.id) { <span class="heart" [style.left.px]="h.x" [style.top.px]="h.y">{{ h.e }}</span> }
      <div class="tint"></div>
      <ng-content />
    </div>
  `,
  styles: [`
    :host { display: block; }
    .stage { position: relative; height: 340px; border-radius: 22px; overflow: hidden; touch-action: manipulation; background: var(--bottom); user-select: none; -webkit-user-select: none; isolation: isolate; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
    .sky { position: absolute; inset: 0; background: linear-gradient(var(--top), var(--bottom)); transition: background 2s; }
    .roomwall { position: absolute; inset: 0; background: #3a2c4a; }
    .art-wrap, .art { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
    .art-wrap { z-index: 2; }
    .art-wrap ::ng-deep .art { width: 100%; height: 100%; }
    .art-wrap ::ng-deep .winglass { fill: var(--bottom); }
    .art-wrap ::ng-deep .waves { animation: waves 7s linear infinite; }
    .art-wrap ::ng-deep .waves.slow { animation-duration: 11s; animation-direction: reverse; }
    .art-wrap ::ng-deep .flame { transform-origin: 105px 190px; animation: flame 1.6s ease-in-out infinite; }
    .art-wrap ::ng-deep .glow { animation: glow 3s ease-in-out infinite; }
    .orb { position: absolute; width: 56px; height: 56px; border-radius: 50%; transform: translate(-50%, -50%); z-index: 1; transition: opacity 2s; }
    .sun { background: radial-gradient(circle, #fff7d6 0%, #ffd66b 55%, rgba(255,214,107,0) 72%); box-shadow: 0 0 60px 24px rgba(255, 214, 107, .35); }
    .moon { background: #f5f3e7; box-shadow: 0 0 40px 10px rgba(240, 240, 255, .35); width: 42px; height: 42px; overflow: hidden; }
    .moon i { position: absolute; width: 12px; height: 12px; border-radius: 50%; background: rgba(0,0,0,.08); left: 10px; top: 9px; box-shadow: 14px 12px 0 -2px rgba(0,0,0,.07); }
    .stars { position: absolute; inset: 0; z-index: 1; transition: opacity 2s; }
    .stars b { position: absolute; width: var(--sz); height: var(--sz); background: #fff; border-radius: 50%; animation: twinkle var(--d) ease-in-out infinite; }
    .cloud { position: absolute; z-index: 1; height: 26px; width: 90px; border-radius: 30px; background: rgba(255,255,255,.85); filter: blur(.4px); opacity: calc(.9 - var(--night) * .7); }
    .cloud::before, .cloud::after { content: ''; position: absolute; background: inherit; border-radius: 50%; }
    .cloud::before { width: 40px; height: 40px; left: 14px; top: -18px; } .cloud::after { width: 30px; height: 30px; right: 14px; top: -12px; }
    .c1 { top: 16%; animation: drift 90s linear infinite; } .c2 { top: 28%; transform: scale(.7); animation: drift 140s linear infinite -40s; } .c3 { top: 8%; transform: scale(1.2); animation: drift 190s linear infinite -90s; }
    .calm .cloud { animation-duration: 260s; }
    .particles { position: absolute; inset: 0; z-index: 3; pointer-events: none; overflow: hidden; }
    .fly { position: absolute; width: 5px; height: 5px; border-radius: 50%; background: #e9ff9a; box-shadow: 0 0 10px 3px rgba(233,255,154,.8); animation: fly 6s ease-in-out infinite; }
    .bfly { position: absolute; left: -10%; font-size: 18px; animation: bfly 18s linear infinite; }
    .petal { position: absolute; top: -10px; width: 8px; height: 6px; border-radius: 80% 0 80% 0; background: #fbcfe8; animation: petal 9s linear infinite; }
    .ember { position: absolute; bottom: 28%; width: 3px; height: 3px; border-radius: 50%; background: #fdba74; animation: ember 4s ease-out infinite; }
    .rain { position: absolute; top: -20px; width: 1.5px; height: 14px; background: rgba(210,230,255,.6); animation: rain .9s linear infinite; }
    .tint { position: absolute; inset: 0; z-index: 6; pointer-events: none; background: rgba(10, 18, 60, calc(var(--night) * .28)); mix-blend-mode: multiply; transition: background 2s; }
    .pupwrap { position: absolute; bottom: 5%; width: 56%; max-width: 250px; transform: translateX(-50%); z-index: 4; transition: left 1.1s cubic-bezier(.4,.1,.3,1); cursor: pointer; touch-action: none; -webkit-tap-highlight-color: transparent; }
    .pup { transform: scaleX(var(--face, 1)); transition: transform .25s; transform-origin: 50% 90%; }
    .pup ::ng-deep svg { width: 100%; height: auto; display: block; }
    .shadow { position: absolute; left: 20%; right: 20%; bottom: 2%; height: 8px; border-radius: 50%; background: rgba(0,0,0,.2); filter: blur(3px); z-index: -1; }
    .pupwrap.tilt .pup { animation: tilt 1.6s ease-in-out; } .pupwrap.hop .pup { animation: hop .7s ease-out; } .pupwrap.shake .pup { animation: shake .8s ease-in-out; }
    .pupwrap.stretch .pup { animation: stretch 1.8s ease-in-out; } .pupwrap.sniff .pup { animation: sniff 1.6s ease-in-out; } .pupwrap.spin .pup { animation: spin 1s ease-in-out; } .pupwrap.wiggle .pup { animation: wiggle .8s ease-in-out; }
    .pupwrap.running .pup { animation: run .32s ease-in-out infinite; } .pupwrap.holding .pup { animation: purr .18s linear infinite; }
    .calm .pupwrap { transition-duration: 2.4s; }
    .bubble { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); width: max-content; max-width: 230px; background: rgba(255,255,255,.96); color: #1f2937; border-radius: 16px; padding: 8px 12px; font-size: .84rem; line-height: 1.3; box-shadow: 0 4px 14px rgba(0,0,0,.25); text-align: center; z-index: 8; pointer-events: none; animation: pop .25s ease-out; margin-bottom: -26px; }
    .bubble::after { content: ''; position: absolute; top: 100%; left: 50%; margin-left: -7px; border: 7px solid transparent; border-top-color: rgba(255,255,255,.96); border-bottom: 0; }
    .bubble.dream { background: rgba(230,236,255,.9); font-style: italic; border-radius: 22px; }
    .toy { position: absolute; z-index: 5; width: 34px; height: 34px; pointer-events: none; transform: translate(-50%, 0); }
    .heart { position: absolute; z-index: 9; font-size: 20px; pointer-events: none; animation: heart 1.3s ease-out forwards; }
    @keyframes twinkle { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }
    @keyframes drift { from { left: -25%; } to { left: 115%; } }
    @keyframes fly { 0%, 100% { transform: translate(0, 0); opacity: .2; } 25% { opacity: 1; } 50% { transform: translate(var(--dx), var(--dy)); opacity: .5; } 75% { opacity: 1; } }
    @keyframes bfly { 0% { transform: translate(0, 0); } 25% { transform: translate(30vw, -26px) rotate(10deg); } 50% { transform: translate(60vw, 14px); } 75% { transform: translate(85vw, -20px) rotate(-8deg); } 100% { transform: translate(125vw, 0); } }
    @keyframes petal { 0% { transform: translate(0, 0) rotate(0); opacity: 0; } 10% { opacity: 1; } 100% { transform: translate(60px, 360px) rotate(360deg); opacity: .7; } }
    @keyframes ember { 0% { transform: translate(0, 0); opacity: 1; } 100% { transform: translate(22px, -90px); opacity: 0; } }
    @keyframes rain { to { transform: translateY(380px); } }
    @keyframes waves { from { transform: translateX(0); } to { transform: translateX(-80px); } }
    @keyframes flame { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.04, 1.1) skewX(2deg); } }
    @keyframes glow { 0%, 100% { opacity: .8; } 50% { opacity: 1; } }
    @keyframes tilt { 0%, 100% { transform: scaleX(var(--face, 1)) rotate(0); } 30%, 70% { transform: scaleX(var(--face, 1)) rotate(-9deg); } }
    @keyframes hop { 0%, 100% { transform: scaleX(var(--face, 1)) translateY(0); } 40% { transform: scaleX(var(--face, 1)) translateY(-26px); } }
    @keyframes shake { 0%, 100% { transform: scaleX(var(--face, 1)) rotate(0); } 15% { transform: scaleX(var(--face, 1)) rotate(7deg); } 30% { transform: scaleX(var(--face, 1)) rotate(-7deg); } 45% { transform: scaleX(var(--face, 1)) rotate(5deg); } 60% { transform: scaleX(var(--face, 1)) rotate(-5deg); } }
    @keyframes stretch { 0%, 100% { transform: scaleX(var(--face, 1)) scale(1, 1); } 45%, 60% { transform: scaleX(var(--face, 1)) scale(1.1, .92) translateX(-6px); } }
    @keyframes sniff { 0%, 100% { transform: scaleX(var(--face, 1)) translateY(0); } 30%, 50%, 70% { transform: scaleX(var(--face, 1)) translateY(8px) rotate(4deg); } 40%, 60% { transform: scaleX(var(--face, 1)) translateY(5px) rotate(2deg); } }
    @keyframes spin { 0% { transform: scaleX(var(--face, 1)) rotateY(0); } 100% { transform: scaleX(var(--face, 1)) rotateY(360deg); } }
    @keyframes wiggle { 0%, 100% { transform: scaleX(var(--face, 1)) rotate(0); } 25% { transform: scaleX(var(--face, 1)) rotate(-4deg) scale(1.02); } 75% { transform: scaleX(var(--face, 1)) rotate(4deg) scale(1.02); } }
    @keyframes run { 0%, 100% { transform: scaleX(var(--face, 1)) translateY(0) rotate(-2deg); } 50% { transform: scaleX(var(--face, 1)) translateY(-10px) rotate(2deg); } }
    @keyframes purr { 0%, 100% { transform: scaleX(var(--face, 1)) scale(1); } 50% { transform: scaleX(var(--face, 1)) scale(1.012); } }
    @keyframes heart { 0% { transform: translateY(0) scale(.6); opacity: 0; } 15% { opacity: 1; } 100% { transform: translateY(-70px) scale(1.1); opacity: 0; } }
    @keyframes pop { from { transform: translateX(-50%) scale(.8); opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .cloud, .stars b, .fly, .bfly, .petal, .ember, .rain { animation: none !important; } }
  `],
})
export class PetSceneComponent implements OnInit, OnDestroy {
  private san = inject(DomSanitizer);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly look = input.required<PetLook>();
  readonly mood = input<PetMood>('happy');
  readonly scene = input<PetScene>('meadow');
  readonly toy = input<PetToy>('ball');
  readonly calm = input(false);
  readonly speech = input('');
  readonly rain = input(false);
  /** Fires on a short tap on the pup. */
  readonly pat = output<{ x: number; y: number }>();
  readonly holdStart = output<void>();
  readonly holdEnd = output<number>();
  readonly stageTap = output<number>();
  readonly dream = output<void>();

  private stageEl = viewChild.required<ElementRef<HTMLElement>>('stage');
  private pupEl = viewChild.required<ElementRef<HTMLElement>>('pupwrap');
  private toyEl = viewChild.required<ElementRef<HTMLElement>>('toy');
  private treatEl = viewChild.required<ElementRef<HTMLElement>>('treatEl');
  readonly treatShown = signal(false);
  readonly treatHtml = this.san.bypassSecurityTrustHtml(toySvg('bone', 34));

  readonly x = signal(50);
  readonly face = signal(1);
  readonly idleClass = signal('');
  readonly running = signal(false);
  readonly holding = signal(false);
  readonly toyShown = signal(false);
  readonly hearts = signal<{ id: number; x: number; y: number; e: string }[]>([]);
  private hid = 0;

  private now = signal(new Date());
  readonly sky = computed(() => { const d = this.now(); return skyAt(d.getHours() + d.getMinutes() / 60); });
  readonly hourF = computed(() => { const d = this.now(); return d.getHours() + d.getMinutes() / 60; });
  readonly sun = computed(() => { const h = this.hourF(); const k = (h - 6) / 12; return { x: -5 + k * 110, y: 62 - Math.sin(Math.max(0, Math.min(1, k)) * Math.PI) * 52, o: h > 5.5 && h < 18.5 ? 1 : 0 }; });
  readonly moon = computed(() => { const h = this.hourF(); const t = h >= 18 ? h - 18 : h + 6; const k = t / 12; return { x: -5 + k * 110, y: 58 - Math.sin(Math.max(0, Math.min(1, k)) * Math.PI) * 46, o: h >= 18 || h < 6.5 ? 1 : 0 }; });
  readonly starOpacity = computed(() => (this.scene() === 'starry' ? 1 : Math.min(1, this.sky().night * 1.2)));
  readonly art = computed(() => this.san.bypassSecurityTrustHtml(sceneSvg(this.scene(), this.sky().night)));
  readonly html = computed(() => this.san.bypassSecurityTrustHtml(petSvg(this.look(), this.mood(), { size: 240 })));
  readonly toyHtml = computed(() => this.san.bypassSecurityTrustHtml(toySvg(this.toy(), 34)));

  readonly stars = Array.from({ length: 46 }, (_, i) => ({ x: (i * 53) % 100, y: (i * 37) % 62, d: 2 + (i % 5) * 0.8, s: 1 + (i % 3) }));
  readonly flies = Array.from({ length: 12 }, (_, i) => ({ x: 8 + ((i * 37) % 84), y: 42 + ((i * 23) % 40), dx: ((i % 5) - 2) * 14, dy: ((i % 4) - 2) * 12, d: -(i * 0.7) }));
  readonly bflies = Array.from({ length: 3 }, (_, i) => ({ y: 30 + i * 12, d: -(i * 6), t: 20 + i * 6 }));
  readonly petals = Array.from({ length: 12 }, (_, i) => ({ x: (i * 41) % 100, d: -(i * 0.9), t: 8 + (i % 4) }));
  readonly embers = Array.from({ length: 6 }, (_, i) => ({ x: 12 + i * 4, d: -(i * 0.7) }));
  readonly drops = Array.from({ length: 34 }, (_, i) => ({ x: (i * 29) % 100, d: -((i * 0.13) % 1) }));

  private timers: ReturnType<typeof setTimeout>[] = [];
  private clock?: ReturnType<typeof setInterval>;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private blinkTimer?: ReturnType<typeof setTimeout>;
  private dreamTimer?: ReturnType<typeof setInterval>;
  private holdTimer?: ReturnType<typeof setTimeout>;
  private holdAt = 0;
  private downAt = 0;
  private busy = false;
  private raf = 0;
  private destroyed = false;

  constructor() {
    effect(() => { this.mood(); this.look(); queueMicrotask(() => this.applyGaze(0, 0)); });
  }

  ngOnInit() {
    this.clock = setInterval(() => this.now.set(new Date()), 60_000);
    this.scheduleIdle();
    this.scheduleBlink();
    this.dreamTimer = setInterval(() => { if (this.mood() === 'sleeping') this.dream.emit(); }, 17_000);
  }
  ngOnDestroy() {
    this.destroyed = true;
    clearInterval(this.clock); clearInterval(this.dreamTimer); clearTimeout(this.idleTimer); clearTimeout(this.blinkTimer); clearTimeout(this.holdTimer);
    cancelAnimationFrame(this.raf);
    this.timers.forEach(clearTimeout);
  }

  private later(fn: () => void, ms: number) { const t = setTimeout(() => { if (!this.destroyed) fn(); }, ms); this.timers.push(t); }

  // ------------------------------------------------------------------ life: idle, blink, gaze
  private scheduleIdle() {
    const calm = this.calm();
    this.idleTimer = setTimeout(() => {
      if (this.destroyed) return;
      if (!this.busy && !this.holding() && this.mood() !== 'sleeping') this.doIdle(calm);
      this.scheduleIdle();
    }, (calm ? 7000 : 4000) + Math.random() * (calm ? 9000 : 5500));
  }
  private doIdle(calm: boolean) {
    const m = this.mood();
    const pool: Idle[] = calm ? ['tilt', 'stretch', 'sniff', 'tilt'] : m === 'excited' || m === 'playful' ? ['hop', 'spin', 'wiggle', 'shake', 'hop'] : m === 'bored' ? ['sniff', 'stretch', 'tilt'] : ['tilt', 'sniff', 'shake', 'stretch', 'hop', 'wiggle'];
    if (Math.random() < 0.3) { this.wander(); return; }
    this.emote(pool[Math.floor(Math.random() * pool.length)]);
  }
  /** Play a one-off animation on the pup. */
  emote(kind: Idle | 'bark') {
    const k = kind === 'bark' ? 'hop' : kind;
    this.idleClass.set('');
    queueMicrotask(() => this.idleClass.set(k));
    this.later(() => this.idleClass.set(''), k === 'stretch' || k === 'sniff' || k === 'tilt' ? 1900 : 1200);
  }
  private wander() {
    const to = 28 + Math.random() * 44;
    this.face.set(to < this.x() ? -1 : 1);
    this.x.set(to);
    this.running.set(false);
  }
  private scheduleBlink() {
    this.blinkTimer = setTimeout(() => {
      if (this.destroyed) return;
      const eyes = this.eyes();
      if (eyes && this.mood() !== 'sleeping' && this.mood() !== 'zen') {
        eyes.style.transition = 'transform .07s'; eyes.style.transform = `translate(${this.gx}px, ${this.gy}px) scaleY(.12)`;
        this.later(() => { const e = this.eyes(); if (e) e.style.transform = `translate(${this.gx}px, ${this.gy}px)`; }, 120);
      }
      this.scheduleBlink();
    }, 2200 + Math.random() * 4200);
  }
  private eyes(): SVGGElement | null { return this.pupEl().nativeElement.querySelector('.pup-eyes'); }
  private gx = 0; private gy = 0;
  private applyGaze(dx: number, dy: number) {
    this.gx = dx; this.gy = dy;
    const e = this.eyes();
    if (e) { e.style.transition = 'transform .18s'; e.style.transform = `translate(${dx}px, ${dy}px)`; }
  }
  gaze(ev: PointerEvent) {
    if (this.mood() === 'sleeping' || this.calm() && ev.pointerType === 'mouse') return;
    const pr = this.pupEl().nativeElement.getBoundingClientRect();
    const cx = pr.left + pr.width / 2, cy = pr.top + pr.height * 0.42;
    const dx = Math.max(-1, Math.min(1, (ev.clientX - cx) / 160)), dy = Math.max(-1, Math.min(1, (ev.clientY - cy) / 160));
    this.applyGaze(dx * 5, dy * 3.5);
    this.face.set(ev.clientX < cx - 40 ? -1 : ev.clientX > cx + 40 ? 1 : this.face());
  }
  gazeReset() { this.applyGaze(0, 0); }

  // ------------------------------------------------------------------ touching the pup
  down(ev: PointerEvent) {
    ev.stopPropagation();
    this.downAt = Date.now();
    this.holdAt = 0;
    clearTimeout(this.holdTimer);
    this.holdTimer = setTimeout(() => { this.holding.set(true); this.holdAt = Date.now(); this.holdStart.emit(); this.burst(ev, '💛'); }, 520);
  }
  up(ev: PointerEvent) {
    clearTimeout(this.holdTimer);
    if (this.holding()) {
      const secs = Math.round((Date.now() - this.holdAt) / 1000);
      this.holding.set(false);
      this.holdEnd.emit(secs);
      return;
    }
    if (this.downAt && ev.type === 'pointerup' && Date.now() - this.downAt < 520) {
      this.downAt = 0;
      const r = this.stageEl().nativeElement.getBoundingClientRect();
      this.burst(ev, ['💗', '💛', '✨', '🐾'][Math.floor(Math.random() * 4)]);
      this.emote(Math.random() < 0.5 ? 'wiggle' : 'hop');
      this.pat.emit({ x: ev.clientX - r.left, y: ev.clientY - r.top });
    }
  }
  burst(ev: { clientX: number; clientY: number }, e: string) {
    const r = this.stageEl().nativeElement.getBoundingClientRect();
    const id = ++this.hid;
    this.hearts.update(h => [...h.slice(-10), { id, x: ev.clientX - r.left - 8, y: ev.clientY - r.top - 18, e }]);
    this.later(() => this.hearts.update(h => h.filter(x => x.id !== id)), 1400);
  }
  /** Float a few hearts above the pup (used by cuddles and rewards). */
  hearts3(e = '💛') {
    const r = this.pupEl().nativeElement.getBoundingClientRect(), s = this.stageEl().nativeElement.getBoundingClientRect();
    for (let i = 0; i < 3; i++) this.later(() => this.burst({ clientX: r.left + r.width * (0.35 + Math.random() * 0.3), clientY: r.top + r.height * 0.3 }, e), i * 220);
    void s;
  }
  stageClick(ev: MouseEvent) {
    const r = this.stageEl().nativeElement.getBoundingClientRect();
    this.stageTap.emit(((ev.clientX - r.left) / r.width) * 100);
  }

  // ------------------------------------------------------------------ fetch
  get isBusy() { return this.busy; }
  /** Throw the toy toward a point (0-100 % of the width). Resolves when the pup has brought it back. */
  async fetch(targetPct: number): Promise<boolean> {
    if (this.busy || this.mood() === 'sleeping') return false;
    this.busy = true;
    const stage = this.stageEl().nativeElement, toy = this.toyEl().nativeElement;
    const W = stage.clientWidth, H = stage.clientHeight;
    const target = Math.max(14, Math.min(86, targetPct));
    const px = () => { const r = this.pupEl().nativeElement.getBoundingClientRect(), s = stage.getBoundingClientRect(); return { x: r.left - s.left + r.width / 2, w: r.width, bottom: H - (r.bottom - s.top) }; };
    const start = px();
    const groundY = H * 0.12;
    const x0 = start.x + this.face() * start.w * 0.25, y0 = start.bottom + 40;
    const x1 = (target / 100) * W;
    const flight = 800;
    this.toyShown.set(true);
    this.face.set(x1 < x0 ? -1 : 1);
    const t0 = performance.now();
    const place = (x: number, y: number, rot = 0) => { toy.style.left = x + 'px'; toy.style.bottom = y + 'px'; toy.style.transform = `translate(-50%,0) rotate(${rot}deg)`; };
    await new Promise<void>(res => {
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / flight);
        const arc = Math.sin(k * Math.PI) * H * 0.42;
        place(x0 + (x1 - x0) * k, y0 + (groundY - y0) * k + arc, k * 540);
        if (k < 1 && !this.destroyed) this.raf = requestAnimationFrame(step); else res();
      };
      this.raf = requestAnimationFrame(step);
    });
    place(x1, groundY, 0);
    // pup runs to the toy
    this.running.set(true);
    this.x.set(target);
    await new Promise(r => this.later(() => r(null), 1250));
    this.running.set(false);
    this.emote('sniff');
    await new Promise(r => this.later(() => r(null), 650));
    // carries it back
    this.face.set(target < 50 ? 1 : -1);
    this.running.set(true);
    this.x.set(50);
    const carry = () => { const p = px(); place(p.x + this.face() * p.w * 0.28, p.bottom + 44, this.face() * -10); if (this.running() && !this.destroyed) this.raf = requestAnimationFrame(carry); };
    this.raf = requestAnimationFrame(carry);
    await new Promise(r => this.later(() => r(null), 1250));
    this.running.set(false);
    const p = px();
    place(p.x + this.face() * p.w * 0.45, groundY + 6, 0);
    this.emote('hop');
    this.hearts3('✨');
    await new Promise(r => this.later(() => r(null), 700));
    this.toyShown.set(false);
    this.face.set(1);
    this.busy = false;
    return true;
  }

  /** Drop a treat from above; the pup catches it and chomps. */
  async treat(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const stage = this.stageEl().nativeElement, toy = this.treatEl().nativeElement;
    const r = this.pupEl().nativeElement.getBoundingClientRect(), s = stage.getBoundingClientRect();
    const cx = r.left - s.left + r.width / 2, H = stage.clientHeight;
    toy.style.left = cx + 'px';
    this.treatShown.set(true);
    const t0 = performance.now(), dur = 900;
    await new Promise<void>(res => {
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / dur);
        toy.style.bottom = (H - 20 - k * k * (H - (r.bottom - s.top) + 74)) + 'px';
        toy.style.transform = `translate(-50%,0) rotate(${k * 300}deg)`;
        if (k < 1 && !this.destroyed) this.raf = requestAnimationFrame(step); else res();
      };
      this.raf = requestAnimationFrame(step);
    });
    this.treatShown.set(false);
    this.emote('wiggle');
    this.hearts3('💛');
    await new Promise(r2 => this.later(() => r2(null), 900));
    this.busy = false;
  }
}
