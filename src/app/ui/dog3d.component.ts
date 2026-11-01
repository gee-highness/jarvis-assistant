import { ChangeDetectionStrategy, Component, ElementRef, NgZone, OnDestroy, effect, inject, input, output, viewChild } from '@angular/core';
import { PetMood } from '../core/pet-art';
import { Dog3D, DogClip, DogCoat } from '../core/dog3d/dog3d';

/** Which animation fits a mood (and whether he is out walking). */
export function clipFor(mood: PetMood, running: boolean): { clip: DogClip; speed: number } {
  if (running) return { clip: 'walk', speed: mood === 'excited' || mood === 'playful' ? 1.9 : 1.5 };
  switch (mood) {
    case 'sleeping': return { clip: 'lie', speed: 1 };
    case 'excited': case 'playful': case 'proud': return { clip: 'happy', speed: 1 };
    case 'cuddly': case 'zen': case 'hungry': return { clip: 'sit', speed: 1 };
    default: return { clip: 'idle', speed: 1 };
  }
}

/** The 3D pup. Draws into its own transparent canvas and falls back (via `failed`) if WebGL is unavailable. */
@Component({
  selector: 'jarvis-dog3d',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #c class="dog" aria-hidden="true"></canvas>`,
  styles: [`:host { display: block; width: 100%; aspect-ratio: 1.22 / 1; } canvas { width: 100%; height: 100%; display: block; pointer-events: none; }`],
})
export class Dog3dComponent implements OnDestroy {
  private zone = inject(NgZone);
  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('c');
  readonly coat = input.required<DogCoat>();
  readonly mood = input<PetMood>('happy');
  readonly running = input(false);
  readonly holding = input(false);
  readonly calm = input(false);
  readonly quality = input(18);
  readonly ready = output<void>();
  readonly failed = output<void>();

  private dog?: Dog3D;
  private ro?: ResizeObserver;
  private io?: IntersectionObserver;
  private visible = true;
  private dead = false;

  constructor() {
    effect(() => { const c = this.coat(); if (this.dog?.ready) this.dog.applyCoat(c); });
    effect(() => {
      const m = this.mood(), r = this.running(), hold = this.holding();
      if (!this.dog?.ready) return;
      const { clip, speed } = hold ? { clip: 'sit' as DogClip, speed: 1 } : clipFor(m, r);
      this.dog.play(clip); this.dog.setSpeed(this.calm() ? Math.min(speed, 1) : speed);
    });
    effect(() => { const q = this.quality(); if (this.dog?.ready) this.dog.setQuality(q); });
    queueMicrotask(() => this.init());
  }

  private async init() {
    if (!Dog3D.supported()) { this.failed.emit(); return; }
    try {
      const el = this.canvas().nativeElement;
      const dog = await Dog3D.create(el, 'assets/pet/dog.glb', { shells: 24 });
      if (this.dead) { dog.dispose(); return; }
      this.dog = dog;
      dog.setYaw(1.0, true);
      dog.frame = { dist: 3.0, targetY: 0.4, fov: 26 };
      dog.applyCoat(this.coat());
      dog.setQuality(this.quality());
      const { clip, speed } = clipFor(this.mood(), this.running());
      dog.play(clip, 0); dog.setSpeed(speed);
      const fit = () => { const w = Math.max(60, el.clientWidth), h = Math.max(50, el.clientHeight); dog.resize(w, h); };
      fit();
      this.ro = new ResizeObserver(fit); this.ro.observe(el);
      this.io = new IntersectionObserver(es => { this.visible = es.some(e => e.isIntersecting); this.toggle(); }); this.io.observe(el);
      document.addEventListener('visibilitychange', this.toggle);
      this.toggle();
      this.ready.emit();
    } catch (e) { console.warn('3D pup unavailable', e); this.failed.emit(); }
  }

  private toggle = () => {
    if (!this.dog) return;
    if (this.visible && !document.hidden) this.zone.runOutsideAngular(() => this.dog!.start(this.calm() ? 30 : 45)); else this.dog.stop();
  };

  /** One-off reactions (bark when petted, sniff when exploring). */
  react(kind: 'bark' | 'sniff') { this.dog?.playOnce(kind); }
  look(x: number, y: number) { this.dog?.lookAt(x, y); }
  ngOnDestroy() {
    this.dead = true;
    this.ro?.disconnect(); this.io?.disconnect();
    document.removeEventListener('visibilitychange', this.toggle);
    this.dog?.dispose();
  }
}
