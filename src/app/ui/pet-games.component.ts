import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { PetLook, PetMood, petSvg, toySvg } from '../core/pet-art';
import { PetService } from '../core/pet.service';

interface Falling { id: number; x: number; y: number; vy: number; kind: 'bone' | 'star' | 'cookie'; v: number; gone?: boolean }
interface Cup { id: number; slot: number; treat: boolean }

/** Two gentle games. No lives, no losing: they end on a timer or whenever you like, and every catch is a treat for the pup. */
@Component({
  selector: 'jarvis-pet-games',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="arena" [class.cups]="game() === 'cups'" role="dialog" aria-modal="true">
      <div class="top">
        <button class="close" (click)="quit()" aria-label="Close game">✕</button>
        @if (game() === 'catch') { <b class="score">🦴 {{ score() }}</b><div class="bar"><i [style.width.%]="timePct()"></i></div> }
        @else { <b class="score">Round {{ round() }} · 🏆 {{ wins() }}</b> }
      </div>

      @if (game() === 'catch') {
        <div class="field" #field (pointermove)="move($event)" (pointerdown)="move($event)" (touchmove)="touchMove($event)">
          @for (f of falls(); track f.id) {
            <span class="fall" [class.gold]="f.kind === 'star'" [style.left.%]="f.x" [style.top.px]="f.y" [style.opacity]="f.gone ? 0 : 1">{{ f.kind === 'star' ? '⭐' : f.kind === 'cookie' ? '🍪' : '🦴' }}</span>
          }
          @for (p of pops(); track p.id) { <span class="pop" [style.left.%]="p.x" [style.bottom.px]="90">{{ p.t }}</span> }
          <div class="pupc" [style.left.%]="px()" [innerHTML]="html()"></div>
          @if (state() === 'ready') { <div class="msg"><b>Treat catch</b><span>Slide to move {{ name() }}. Catch what falls. There is no way to lose.</span><button class="primary" (click)="start()">Start</button></div> }
          @if (state() === 'done') {
            <div class="msg"><b>{{ score() >= 15 ? 'Amazing!' : score() >= 8 ? 'Great catching!' : 'Lovely game!' }}</b><span>{{ score() }} caught · {{ name() }} loved it</span>
              <div class="row"><button class="primary" (click)="start()">Again</button><button (click)="finish()">Done</button></div></div>
          }
        </div>
      } @else {
        <div class="cupsfield">
          <p class="hint">{{ cupHint() }}</p>
          <div class="cuprow">
            @for (c of cups(); track c.id) {
              <button class="cup" [style.--slot]="c.slot" [class.lift]="lifted() === c.id || (reveal() && c.treat) || (phase() === 'show' && c.treat)" [disabled]="phase() !== 'pick'" (click)="pick(c)" [attr.aria-label]="'Cup ' + (c.slot + 1)">
                <span class="cupbody">🥤</span>
                @if (reveal() && c.treat || phase() === 'show' && c.treat) { <span class="under">🦴</span> }
              </button>
            }
          </div>
          @if (phase() === 'result') { <div class="msg low"><b>{{ won() ? 'Found it! 🎉' : 'So close!' }}</b><span>{{ won() ? name() + ' is wagging.' : 'It was hiding under the other cup.' }}</span>
            <div class="row"><button class="primary" (click)="nextRound()">Next round</button><button (click)="finish()">Done</button></div></div> }
          @if (phase() === 'ready') { <div class="msg low"><b>Which cup?</b><span>Watch the treat, then tap the cup it is under.</span><button class="primary" (click)="nextRound()">Start</button></div> }
          <div class="pupc static" [innerHTML]="html()"></div>
        </div>
      }
    </div>
  `,
  styles: [`
    .arena { position: fixed; inset: 0; z-index: 90; display: flex; flex-direction: column; background: linear-gradient(#9fdcf8, #d9f1d0 70%, #8bd47a 70%); padding-top: var(--safe-top); animation: in .25s ease-out; color: #16313a; }
    .arena.cups { background: linear-gradient(#f6d8a8, #fbeed6 60%, #c9a679 60%); }
    @keyframes in { from { opacity: 0; transform: scale(.98); } }
    .top { display: flex; align-items: center; gap: 12px; padding: 12px 14px; }
    .close { width: 40px; height: 40px; border-radius: 50%; border: none; background: rgba(255,255,255,.7); font-size: 1.1rem; color: #16313a; }
    .score { font-size: 1.1rem; }
    .bar { flex: 1; height: 8px; border-radius: 5px; background: rgba(255,255,255,.6); overflow: hidden; } .bar i { display: block; height: 100%; background: #22c55e; transition: width .3s linear; }
    .field { position: relative; flex: 1; overflow: hidden; touch-action: none; }
    .fall { position: absolute; font-size: 30px; transform: translateX(-50%); transition: opacity .3s; pointer-events: none; filter: drop-shadow(0 3px 2px rgba(0,0,0,.15)); }
    .fall.gold { font-size: 36px; filter: drop-shadow(0 0 8px gold); }
    .pop { position: absolute; transform: translateX(-50%); font-weight: 800; color: #15803d; animation: up .9s ease-out forwards; pointer-events: none; text-shadow: 0 1px 0 #fff; }
    @keyframes up { to { transform: translate(-50%, -60px); opacity: 0; } }
    .pupc { position: absolute; bottom: 8px; width: 170px; transform: translateX(-50%); pointer-events: none; transition: left .05s linear; }
    .pupc.static { left: 50%; bottom: 0; width: 150px; transition: none; }
    .pupc ::ng-deep svg { width: 100%; height: auto; display: block; }
    .msg { position: absolute; left: 50%; top: 32%; transform: translateX(-50%); background: rgba(255,255,255,.95); border-radius: 20px; padding: 18px 22px; text-align: center; display: flex; flex-direction: column; gap: 10px; align-items: center; box-shadow: 0 12px 30px rgba(0,0,0,.2); min-width: 240px; z-index: 5; }
    .msg.low { top: 52%; }
    .msg b { font-size: 1.2rem; } .msg span { font-size: .9rem; color: #3b5560; } .row { display: flex; gap: 8px; }
    .msg button { border-radius: 12px; border: 1px solid #94a3b8; background: #fff; padding: 9px 18px; font-size: .95rem; color: #16313a; }
    .msg button.primary { background: #22c55e; border-color: #16a34a; color: #fff; font-weight: 700; }
    .cupsfield { position: relative; flex: 1; display: flex; flex-direction: column; align-items: center; }
    .hint { margin: 24px 16px 0; text-align: center; font-size: 1rem; min-height: 1.6em; }
    .cuprow { position: relative; width: min(340px, 92vw); height: 140px; margin-top: 40px; }
    .cup { position: absolute; top: 0; left: calc(var(--slot) * 33.3%); width: 30%; height: 120px; background: none; border: none; padding: 0; transition: left .38s cubic-bezier(.4,.1,.3,1); font-size: 4rem; display: flex; align-items: flex-end; justify-content: center; }
    .cupbody { display: block; transition: transform .35s; transform-origin: 50% 100%; filter: drop-shadow(0 6px 4px rgba(0,0,0,.18)); font-size: 4.2rem; line-height: 1; }
    .cup.lift .cupbody { transform: translateY(-46px) rotate(-8deg); }
    .under { position: absolute; bottom: 8px; font-size: 2rem; }
    .cup:disabled { opacity: 1; }
  `],
})
export class PetGamesComponent implements OnDestroy {
  private san = inject(DomSanitizer);
  private pet = inject(PetService);

  readonly game = input.required<'catch' | 'cups'>();
  readonly look = input.required<PetLook>();
  readonly mood = input<PetMood>('happy');
  readonly done = output<void>();

  readonly name = computed(() => this.pet.pet().name);
  readonly html = computed(() => this.san.bypassSecurityTrustHtml(petSvg(this.look(), this.state() === 'playing' ? 'playful' : this.mood() === 'sleeping' ? 'happy' : this.mood(), { size: 170 })));
  private field = viewChild<ElementRef<HTMLElement>>('field');

  // ------------------------------------------------------------------ catch
  readonly state = signal<'ready' | 'playing' | 'done'>('ready');
  readonly score = signal(0);
  readonly px = signal(50);
  readonly falls = signal<Falling[]>([]);
  readonly pops = signal<{ id: number; x: number; t: string }[]>([]);
  readonly timePct = signal(100);
  private targetX = 50;
  private raf = 0;
  private last = 0;
  private spawnIn = 0;
  private elapsed = 0;
  private id = 0;
  private readonly LEN = 45_000;
  private awarded = false;

  move(ev: PointerEvent) {
    const el = this.field()?.nativeElement;
    if (!el) return;
    const r = el.getBoundingClientRect();
    this.targetX = Math.max(10, Math.min(90, ((ev.clientX - r.left) / r.width) * 100));
  }
  touchMove(ev: TouchEvent) { const t = ev.touches[0]; if (t) this.move({ clientX: t.clientX } as PointerEvent); }

  start() {
    this.awarded = false;
    this.score.set(0); this.falls.set([]); this.pops.set([]); this.elapsed = 0; this.spawnIn = 400; this.timePct.set(100);
    this.state.set('playing');
    this.last = performance.now();
    this.raf = requestAnimationFrame(t => this.loop(t));
  }
  private loop(now: number) {
    if (this.state() !== 'playing') return;
    const dt = Math.min(50, now - this.last);
    this.last = now; this.elapsed += dt;
    const el = this.field()?.nativeElement;
    const H = el?.clientHeight ?? 500;
    this.px.update(v => v + (this.targetX - v) * Math.min(1, dt / 70));
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      const k = Math.min(1, this.elapsed / this.LEN);
      this.spawnIn = 950 - k * 330 + Math.random() * 350;
      const r = Math.random();
      const kind: Falling['kind'] = r < 0.1 ? 'star' : r < 0.35 ? 'cookie' : 'bone';
      this.falls.update(f => [...f, { id: ++this.id, x: 10 + Math.random() * 80, y: -30, vy: 0.13 + k * 0.06 + Math.random() * 0.03, kind, v: kind === 'star' ? 3 : 1 }]);
    }
    const mouthY = H - 100, p = this.px();
    let caught = 0, gain = 0;
    const next: Falling[] = [];
    for (const f of this.falls()) {
      const y = f.y + f.vy * dt * 1.4;
      if (!f.gone && y >= mouthY && y <= mouthY + 60 && Math.abs(f.x - p) < 11) {
        caught++; gain += f.v;
        this.pops.update(a => [...a.slice(-4), { id: ++this.id, x: f.x, t: f.v > 1 ? '+3' : '+1' }]);
        this.pet.sfx(a => (f.v > 1 ? a.sparkle() : a.pop(760 + Math.random() * 300)));
        continue;
      }
      if (y > H + 30) continue;
      next.push({ ...f, y, gone: f.gone || y > mouthY + 60 });
    }
    if (caught) { this.score.update(s => s + gain); this.pet.haptic('tick'); }
    this.falls.set(next);
    this.timePct.set(Math.max(0, 100 - (this.elapsed / this.LEN) * 100));
    if (this.elapsed >= this.LEN) { this.end(); return; }
    this.raf = requestAnimationFrame(t => this.loop(t));
  }
  private end() {
    cancelAnimationFrame(this.raf);
    this.state.set('done');
    this.award();
  }
  private award() {
    if (this.awarded) return;
    this.awarded = true;
    if (this.score() > 0) this.pet.catchRound(this.score());
  }

  // ------------------------------------------------------------------ cups
  readonly cups = signal<Cup[]>([{ id: 0, slot: 0, treat: false }, { id: 1, slot: 1, treat: true }, { id: 2, slot: 2, treat: false }]);
  readonly phase = signal<'ready' | 'show' | 'shuffle' | 'pick' | 'result'>('ready');
  readonly round = signal(0);
  readonly wins = signal(0);
  readonly won = signal(false);
  readonly lifted = signal(-1);
  readonly reveal = signal(false);
  readonly cupHint = computed(() => ({ ready: '', show: 'Watch the treat…', shuffle: 'Following with your eyes…', pick: 'Which cup?', result: '' })[this.phase()]);
  private timers: ReturnType<typeof setTimeout>[] = [];
  private wait(ms: number) { return new Promise<void>(res => this.timers.push(setTimeout(res, ms))); }

  async nextRound() {
    this.round.update(r => r + 1);
    this.reveal.set(false); this.won.set(false); this.lifted.set(-1);
    const treatAt = Math.floor(Math.random() * 3);
    this.cups.set([0, 1, 2].map(i => ({ id: i, slot: i, treat: i === treatAt })));
    this.phase.set('show');
    await this.wait(1100);
    this.phase.set('shuffle');
    const swaps = 3 + Math.min(6, this.round() + 1);
    for (let i = 0; i < swaps; i++) {
      const a = Math.floor(Math.random() * 3), b = (a + 1 + Math.floor(Math.random() * 2)) % 3;
      this.cups.update(cs => cs.map(c => (c.slot === a ? { ...c, slot: b } : c.slot === b ? { ...c, slot: a } : c)));
      this.pet.sfx(au => au.pop(420));
      await this.wait(Math.max(260, 520 - this.round() * 40));
    }
    this.phase.set('pick');
  }
  pick(c: Cup) {
    if (this.phase() !== 'pick') return;
    this.lifted.set(c.id);
    this.reveal.set(true);
    const ok = c.treat;
    this.won.set(ok);
    this.phase.set('result');
    if (ok) { this.wins.update(w => w + 1); this.pet.cupsWon(); this.pet.sfx(a => a.sparkle()); this.pet.haptic('success'); } else this.pet.sfx(a => a.voice('whine'));
  }

  // ------------------------------------------------------------------ closing
  quit() { this.finish(); }
  finish() {
    cancelAnimationFrame(this.raf);
    this.timers.forEach(clearTimeout);
    if (this.game() === 'catch') this.award();
    this.done.emit();
  }
  ngOnDestroy() { cancelAnimationFrame(this.raf); this.timers.forEach(clearTimeout); }
  readonly toy = (k: string) => toySvg(k);
}
