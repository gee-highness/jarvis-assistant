import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { DEFAULT_LOOK, PetSettings } from '../core/models';
import { JarvisDevice } from '../core/native';
import { petSvg } from '../core/pet-art';
import { PetService } from '../core/pet.service';
import { ProgressService } from '../core/progress.service';
import { StoreService } from '../core/store.service';

const COATS: { label: string; fur: string; patch: string }[] = [
  { label: 'Golden', fur: '#f2c48d', patch: '#c9824a' }, { label: 'Chocolate', fur: '#8b5e3c', patch: '#4a2c1a' }, { label: 'Snow', fur: '#f3f4f6', patch: '#cbd5e1' },
  { label: 'Midnight', fur: '#374151', patch: '#111827' }, { label: 'Ginger', fur: '#f59e5b', patch: '#b45309' }, { label: 'Cream', fur: '#fde7c8', patch: '#e2b07a' },
  { label: 'Silver', fur: '#c7ccd4', patch: '#6b7280' }, { label: 'Cocoa & white', fur: '#fff7ed', patch: '#7c4a2d' },
];

@Component({
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>{{ p().name }}</h1><span class="chip cyan">{{ moodLabel() }} · Lv {{ progress.level() }}</span></div>

      <div class="card glow col center">
        <button class="pup" (click)="pat()" [innerHTML]="art()" aria-label="Pet your pup"></button>
        @if (pet.line()) { <div class="speech">{{ pet.line() }}</div> }
        <div class="row wrap center">
          <button class="small primary" (click)="pat()">🤚 Pet</button>
          <button class="small" (click)="play()">🎾 Play</button>
          <button class="small" [class.on]="p().speaks" (click)="save({ speaks: !p().speaks })">{{ p().speaks ? '🗣 ' + p().name + ' is talking' : '💬 Let ' + p().name + ' talk in chat' }}</button>
        </div>
        <div class="small muted">Pets: {{ p().pets }} · Treats today: {{ treats() }} (every task you finish is a treat) · Age: {{ age() }}</div>
      </div>

      <div class="card col">
        <b>How {{ p().name }} feels</b>
        <p class="small muted" style="margin:0">{{ p().name }} reacts to your real day: finishing tasks feeds him, walking (steps) tires him out happily, streaks make him proud, he sleeps at night and gets cuddly when you are having a hard time.</p>
      </div>

      <div class="card col">
        <b>Make him yours</b>
        <label class="field">Name <input [ngModel]="p().name" (ngModelChange)="save({ name: $event.slice(0, 20) || 'Comet' })" maxlength="20"></label>
        <div class="upper">Coat</div>
        <div class="coats">
          @for (c of coats; track c.label) {
            <button class="coat" [class.on]="p().fur === c.fur" (click)="save({ fur: c.fur, patch: c.patch })" [style.background]="'linear-gradient(135deg,' + c.fur + ' 55%,' + c.patch + ' 55%)'"><span>{{ c.label }}</span></button>
          }
        </div>
        <div class="row wrap">
          <label class="field grow">Fur <input type="color" [ngModel]="p().fur" (ngModelChange)="save({ fur: $event })"></label>
          <label class="field grow">Ears & patches <input type="color" [ngModel]="p().patch" (ngModelChange)="save({ patch: $event })"></label>
          <label class="field grow">Bandana <input type="color" [ngModel]="p().bandana" (ngModelChange)="save({ bandana: $event })"></label>
        </div>
        <label class="field">Accessory
          <select [ngModel]="p().accessory" (ngModelChange)="save({ accessory: $event })">
            <option value="none">None</option><option value="bowtie">Bow tie</option><option value="glasses">Glasses</option><option value="cap">Cap</option><option value="crown">Crown</option><option value="headphones">Headphones</option>
          </select>
        </label>
        <label class="field">Personality
          <select [ngModel]="p().personality" (ngModelChange)="save({ personality: $event })">
            <option value="goofy">Goofy: clumsy, silly, always smiling</option>
            <option value="loyal">Loyal: protective, proud, steady</option>
            <option value="chill">Chill: lazy, calm, belly-rub enthusiast</option>
            <option value="hyper">Hyper: zoomies, endless energy</option>
            <option value="grumpy">Grumpy: pretends not to care (he cares)</option>
          </select>
        </label>
        <label class="row small"><input type="checkbox" [ngModel]="usePetAvatar()" (ngModelChange)="avatar($event)"> Use {{ p().name }} as the assistant avatar</label>
        <label class="row small"><input type="checkbox" [ngModel]="p().enabled" (ngModelChange)="save({ enabled: $event })"> Pet enabled</label>
      </div>

      <div class="card col">
        <b>Home-screen widget</b>
        <p class="small muted" style="margin:0">Long-press your home screen → Widgets → Jarvis · pet. Tap {{ p().name }} on the widget to pet him, even when the app is closed; tap his speech bubble to open this page.</p>
      </div>
    </div>
  `,
  styles: [`
    .center { align-items: center; justify-content: center; text-align: center; }
    .pup { background: none; border: none; padding: 0; width: 220px; height: 220px; cursor: pointer; transition: transform .2s; }
    .pup:active { transform: scale(.94) rotate(-3deg); }
    .speech { background: var(--panel-solid); border: 1px solid var(--line-strong); border-radius: 16px; padding: 10px 14px; max-width: 320px; position: relative; }
    .speech::before { content: ''; position: absolute; top: -8px; left: 50%; border: 8px solid transparent; border-top: 0; border-bottom-color: var(--line-strong); transform: translateX(-50%); }
    .coats { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px; }
    .coat { height: 50px; border-radius: 12px; border: 2px solid transparent; display: flex; align-items: flex-end; padding: 4px 6px; font-size: .72rem; color: #111; font-weight: 600; }
    .coat.on { border-color: var(--cyan); box-shadow: var(--glow); }
    input[type=color] { width: 100%; height: 40px; padding: 2px; background: transparent; }
    button.on { border-color: var(--cyan); }
  `],
})
export class PetPage {
  readonly pet = inject(PetService);
  readonly progress = inject(ProgressService);
  private store = inject(StoreService);
  private san = inject(DomSanitizer);
  readonly coats = COATS;
  readonly p = this.pet.pet;
  readonly art = computed(() => { const p = this.p(); return this.san.bypassSecurityTrustHtml(petSvg({ fur: p.fur, patch: p.patch, bandana: p.bandana, accessory: p.accessory }, this.pet.mood(), { size: 220 })); });
  readonly moodLabel = computed(() => ({ sleeping: 'sleeping', hungry: 'hungry', bored: 'bored', happy: 'happy', excited: 'over the moon', proud: 'proud', cuddly: 'cuddly', lonely: 'missed you', walk: 'tired from walkies' })[this.pet.mood()]);
  readonly treats = computed(() => this.store.doneToday().length);
  readonly age = computed(() => { const d = Math.max(0, Math.floor((Date.now() - (this.p().bornAt || Date.now())) / 864e5)); return d === 0 ? 'born today' : `${d} day${d === 1 ? '' : 's'}`; });
  readonly usePetAvatar = computed(() => (this.store.settings().look ?? DEFAULT_LOOK).orb === 'pet');

  constructor() { this.pet.refresh().catch(() => undefined); }
  save(x: Partial<PetSettings>) { this.pet.save(x); }
  avatar(on: boolean) { this.store.updateSettings({ look: { ...(this.store.settings().look ?? DEFAULT_LOOK), orb: on ? 'pet' : 'reactor' } }); }
  pat() { JarvisDevice.haptic({ kind: 'light' }).catch(() => undefined); this.pet.interact('pet'); }
  play() { JarvisDevice.haptic({ kind: 'medium' }).catch(() => undefined); this.pet.interact('play'); }
}
