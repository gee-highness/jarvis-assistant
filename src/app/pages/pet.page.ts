import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DEFAULT_LOOK, PetScene, PetSettings, PetToy } from '../core/models';
import { JarvisDevice } from '../core/native';
import { PetMood, petPng } from '../core/pet-art';
import { HEARTS, HEART_LABEL, UNLOCKS, Unlockable, careCount, heartDone, isUnlocked } from '../core/pet-care';
import { PetService } from '../core/pet.service';
import { ProgressService } from '../core/progress.service';
import { StoreService } from '../core/store.service';
import { PetCalmComponent } from '../ui/pet-calm.component';
import { PetGamesComponent } from '../ui/pet-games.component';
import { PetSceneComponent } from '../ui/pet-scene.component';

const COATS: { label: string; fur: string; patch: string }[] = [
  { label: 'Golden', fur: '#f2c48d', patch: '#c9824a' }, { label: 'Chocolate', fur: '#8b5e3c', patch: '#4a2c1a' }, { label: 'Snow', fur: '#f3f4f6', patch: '#cbd5e1' },
  { label: 'Midnight', fur: '#374151', patch: '#111827' }, { label: 'Ginger', fur: '#f59e5b', patch: '#b45309' }, { label: 'Cream', fur: '#fde7c8', patch: '#e2b07a' },
  { label: 'Silver', fur: '#c7ccd4', patch: '#6b7280' }, { label: 'Cocoa & white', fur: '#fff7ed', patch: '#7c4a2d' },
];
type Tab = 'home' | 'play' | 'calm' | 'style' | 'badges';
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'home', icon: '🏡', label: 'Home' }, { id: 'play', icon: '🎾', label: 'Play' }, { id: 'calm', icon: '🌿', label: 'Calm' }, { id: 'style', icon: '✨', label: 'Style' }, { id: 'badges', icon: '🏅', label: 'Bond' },
];
const MOOD_LABEL: Record<PetMood, string> = { sleeping: 'sleeping', hungry: 'peckish', bored: 'a bit bored', happy: 'happy', excited: 'over the moon', proud: 'proud', cuddly: 'cuddly', lonely: 'so glad you are here', walk: 'happily tired', zen: 'peaceful', playful: 'playful' };

@Component({
  standalone: true,
  imports: [FormsModule, PetSceneComponent, PetGamesComponent, PetCalmComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page den">
      <div class="page-head">
        <h1>{{ p().name }}</h1>
        <span class="chip cyan">{{ moodLabel() }}</span>
      </div>

      <div class="bond" (click)="tab.set('badges')">
        <div class="bondtop"><b>💞 Bond Lv {{ pet.bond().level }} · {{ pet.bond().title }}</b><span class="small muted">{{ pet.bond().into }}/{{ pet.bond().need }}</span></div>
        <div class="track"><i [style.width.%]="pet.bond().pct"></i></div>
      </div>

      <jarvis-pet-scene #scene [look]="look()" [mood]="pet.mood()" [scene]="p().scene" [toy]="p().toy" [calm]="calmMotion()" [speech]="speech()" [meaning]="meaning()" [alwaysMeaning]="p().speech === 'both'"
        [rain]="p().ambient === 'rain' && p().sound" (pat)="onPat()" (holdStart)="onHoldStart()" (holdEnd)="onHoldEnd($event)" (stageTap)="onStageTap($event)" (dream)="dream()" />
      @if (fetchMode()) { <div class="fetchhint">🎾 Tap anywhere in the scene to throw the {{ toyName() }}. <button class="small" (click)="fetchMode.set(false)">Done</button></div> }
      @else { <div class="tip small muted">Tap {{ p().name }} to pet him. Hold to cuddle.</div> }

      <div class="hearts">
        <div class="hrow">
          @for (h of hearts; track h) {
            <div class="heart" [class.on]="done(h)"><span>{{ label(h).icon }}</span><i>{{ label(h).text }}</i></div>
          }
        </div>
        @if (careCount() === 4) { <div class="wish good">🌈 A perfect pup day. Thank you!</div> }
        @else if (pet.wish(); as w) { <div class="wish">{{ w.text }}</div> }
      </div>

      <div class="tabs" role="tablist">
        @for (t of tabs; track t.id) { <button role="tab" [attr.aria-selected]="tab() === t.id" [class.on]="tab() === t.id" (click)="tab.set(t.id)"><span>{{ t.icon }}</span>{{ t.label }}</button> }
      </div>

      @switch (tab()) {
        @case ('home') {
          <div class="card col">
            <b>Give {{ p().name }} an order</b>
            <form class="orderrow" (submit)="$event.preventDefault(); order()">
              <input [(ngModel)]="orderText" name="order" [placeholder]="'e.g. open WhatsApp, add buy milk, what is on today'" autocomplete="off" [disabled]="ordering()">
              <button class="primary" type="submit" [disabled]="ordering() || !orderText.trim()">{{ ordering() ? '…' : 'Go' }}</button>
            </form>
            <div class="chips">
              @for (e of examples; track e) { <button class="small" (click)="orderText = e; order()" [disabled]="ordering()">{{ e }}</button> }
            </div>
            <div class="small muted">{{ p().name }} does it for real, then answers in dog. He will never delete or send anything without you.</div>
          </div>
          <div class="card col">
            <div class="acts">
              <button (click)="onPat(true)"><span>🤚</span>Pet</button>
              <button (click)="feed()" [class.dim]="pet.care().treats === 0"><span>🦴</span>Treat <i class="badge">{{ pet.care().treats }}</i></button>
              <button (click)="walk()" [class.on]="pet.care().walked"><span>🐾</span>We walked</button>
              <button (click)="gift()" [disabled]="pet.care().gift"><span>🎁</span>{{ pet.care().gift ? 'Opened' : 'Daily gift' }}</button>
            </div>
            <div class="small muted">Every task you finish adds a treat to the jar. Nothing here is ever a chore: a missed day costs nothing, and {{ p().name }} is always glad to see you.</div>
          </div>
          <div class="card col">
            <b>Talk to {{ p().name }}</b>
            <div class="chips">
              <button class="small" (click)="talk('pet.talk.how')">How are you?</button>
              <button class="small" (click)="talk('pet.joke')">Tell me a joke</button>
              <button class="small" (click)="talk('pet.wisdom')">Wise words</button>
              <button class="small" (click)="talk('pet.talk.sad')">I am having a hard day</button>
              <button class="small" (click)="talk('pet.report')">How is our day?</button>
            </div>
            <div class="small muted">You can also say things like "pet the dog", "play fetch" or "breathe with {{ p().name }}" in chat.</div>
          </div>
          <div class="card col">
            <b>How {{ p().name }} feels</b>
            <p class="small muted" style="margin:0">{{ p().name }} reacts to your real day: finished tasks fill the treat jar, walks make him happily tired, streaks make him proud, he sleeps at night, and on hard days he comes to sit close. The sky outside his window follows your real time.</p>
            <div class="small muted">Pets: {{ p().pets }} · Age: {{ age() }} · Visited on {{ p().stats.days }} day{{ p().stats.days === 1 ? '' : 's' }}</div>
          </div>
        }
        @case ('play') {
          <div class="card col">
            <b>Play with {{ p().name }}</b>
            <div class="games">
              <button class="game" [class.on]="fetchMode()" (click)="toggleFetch()"><span>{{ toyIcon() }}</span><b>Fetch</b><i>Tap to throw</i><em>{{ p().stats.fetches }} fetches</em></button>
              <button class="game" (click)="game.set('catch')"><span>🌟</span><b>Treat catch</b><i>Slide and catch</i><em>Best {{ p().stats.bestCatch }}</em></button>
              <button class="game" (click)="game.set('cups')"><span>🥤</span><b>Which cup?</b><i>Follow the treat</i><em>{{ p().stats.cups }} found</em></button>
            </div>
            <div class="small muted">No scores to beat and nothing to lose. Every game gives {{ p().name }} a happy moment and grows your bond.</div>
          </div>
        }
        @case ('calm') {
          <jarvis-pet-calm [look]="look()" />
        }
        @case ('style') {
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
              <label class="field grow">Ears &amp; patches <input type="color" [ngModel]="p().patch" (ngModelChange)="save({ patch: $event })"></label>
              <label class="field grow">Bandana <input type="color" [ngModel]="p().bandana" (ngModelChange)="save({ bandana: $event })"></label>
            </div>
            <label class="field">How {{ p().name }} talks
              <select [ngModel]="p().speech" (ngModelChange)="save({ speech: $event })">
                <option value="dog">Dog language (tap his bubble to translate)</option>
                <option value="both">Dog language with the meaning always shown</option>
                <option value="english">Plain English</option>
              </select>
            </label>
            <label class="field">Sass: {{ sassLabel() }}
              <input type="range" min="0" max="100" step="5" [ngModel]="p().sass" (ngModelChange)="save({ sass: +$event })">
              <span class="small muted">Sass takes the day off by itself when you are having a hard time.</span>
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
          </div>

          <div class="card col">
            <b>Outfits</b>
            <div class="grid">
              @for (u of accessories; track u.id) {
                <button class="tile" [class.on]="p().accessory === u.id" [class.locked]="!unlocked(u)" (click)="pickAccessory(u)"><span>{{ u.icon }}</span><b>{{ u.name }}</b><i>{{ unlocked(u) ? u.blurb : '🔒 Bond Lv ' + u.level }}</i></button>
              }
            </div>
            <b>Places</b>
            <div class="grid">
              @for (u of scenes; track u.id) {
                <button class="tile" [class.on]="p().scene === u.id" [class.locked]="!unlocked(u)" (click)="pickScene(u)"><span>{{ u.icon }}</span><b>{{ u.name }}</b><i>{{ unlocked(u) ? u.blurb : '🔒 Bond Lv ' + u.level }}</i></button>
              }
            </div>
            <b>Toys</b>
            <div class="grid">
              @for (u of toys; track u.id) {
                <button class="tile" [class.on]="p().toy === u.id" [class.locked]="!unlocked(u)" (click)="pickToy(u)"><span>{{ u.icon }}</span><b>{{ u.name }}</b><i>{{ unlocked(u) ? u.blurb : '🔒 Bond Lv ' + u.level }}</i></button>
              }
            </div>
          </div>

          <div class="card col">
            <b>Comfort &amp; settings</b>
            <label class="row small"><input type="checkbox" [ngModel]="p().sound" (ngModelChange)="soundOn($event)"> Sounds (yips, purring, soft ambient). Off by default.</label>
            <label class="row small"><input type="checkbox" [ngModel]="p().haptics" (ngModelChange)="save({ haptics: $event })"> Gentle vibration when petting and breathing</label>
            <label class="row small"><input type="checkbox" [ngModel]="p().calmMotion" (ngModelChange)="save({ calmMotion: $event })"> Calm motion: slower, quieter animations</label>
            <label class="row small"><input type="checkbox" [ngModel]="p().speaks" (ngModelChange)="save({ speaks: $event })"> Let {{ p().name }} talk in chat instead of Jarvis</label>
            <label class="row small"><input type="checkbox" [ngModel]="usePetAvatar()" (ngModelChange)="avatar($event)"> Use {{ p().name }} as the assistant avatar</label>
            <label class="row small"><input type="checkbox" [ngModel]="p().enabled" (ngModelChange)="save({ enabled: $event })"> Pet enabled (home-screen widget)</label>
            <div class="row"><button class="small" (click)="photo()">📸 Share a photo of {{ p().name }}</button></div>
          </div>

          <div class="card col">
            <b>Roam my screen</b>
            <p class="small muted" style="margin:0">{{ p().name }} walks around your whole home screen as a see-through overlay. Tap him to pet, drag to move him, hold to talk to Jarvis. He sleeps at night and stays out of the way of everything else.</p>
            <label class="row small"><input type="checkbox" [ngModel]="p().roam" (ngModelChange)="roam($event)"> Let {{ p().name }} wander</label>
            @if (p().roam) {
              <label class="field">Where
                <select [ngModel]="p().roamWhere" (ngModelChange)="save({ roamWhere: $event }); resync()">
                  <option value="home">Only on my home screen</option>
                  <option value="everywhere">On top of other apps too</option>
                </select>
              </label>
              <label class="field">Size: {{ p().roamSize }}
                <input type="range" min="56" max="160" step="4" [ngModel]="p().roamSize" (ngModelChange)="save({ roamSize: +$event }); resync()">
              </label>
              @if (pet.roamState().granted) {
                <div class="small muted">{{ pet.roamState().running ? 'He is out walking right now.' : 'Permission granted. Starting…' }}
                @if (p().roamWhere === 'home' && !pet.roamState().usageAccess) { Tip: turn on Usage access for Jarvis (Health &amp; senses) so he can hide when you open other apps; until then he shows everywhere. }</div>
              } @else {
                <div class="small warn">One step left: allow “Display over other apps” for Jarvis, then come back here.
                  <button class="small" (click)="grant()">Open the setting</button></div>
              }
            }
            @if (roamMsg()) { <div class="small muted">{{ roamMsg() }}</div> }
          </div>

          <div class="card col">
            <b>Home-screen widget</b>
            <p class="small muted" style="margin:0">Long-press your home screen, then Widgets, then Jarvis · pet. It has no background, so he sits right on your wallpaper. Tap {{ p().name }} to pet him, even when the app is closed; tap his speech bubble to open this page.</p>
          </div>
        }
        @case ('badges') {
          <div class="card col">
            <b>Our bond</b>
            <div class="bigbond">Level {{ pet.bond().level }}<small>{{ pet.bond().title }}</small></div>
            <div class="track"><i [style.width.%]="pet.bond().pct"></i></div>
            @if (nextUnlock(); as nu) { <div class="small muted">Next unlock at Lv {{ nu.level }}: {{ nu.icon }} {{ nu.name }}</div> }
            <div class="statgrid">
              <div><b>{{ p().pets }}</b><span>pats</span></div><div><b>{{ p().stats.feeds }}</b><span>treats</span></div><div><b>{{ p().stats.fetches }}</b><span>fetches</span></div>
              <div><b>{{ p().stats.calmMin }}</b><span>calm min</span></div><div><b>{{ p().stats.walks }}</b><span>walks</span></div><div><b>{{ p().stats.perfectDays }}</b><span>perfect days</span></div>
            </div>
          </div>
          <div class="card col">
            <b>Badges · {{ gotCount() }}/{{ badges().length }}</b>
            <div class="grid">
              @for (b of badges(); track b.badge.id) {
                <div class="tile static" [class.locked]="!b.got"><span>{{ b.got ? b.badge.icon : '🔒' }}</span><b>{{ b.badge.name }}</b><i>{{ b.badge.desc }}</i></div>
              }
            </div>
          </div>
        }
      }

      @if (game(); as g) { <jarvis-pet-games [game]="g" [look]="look()" [mood]="pet.baseMood()" (done)="game.set(null)" /> }

      <div class="toasts" aria-live="polite">
        @for (e of pet.events(); track e.id) { <div class="toast" (click)="pet.dismiss(e.id)"><span>{{ e.icon }}</span><div><b>{{ e.title }}</b>@if (e.text) { <i>{{ e.text }}</i> }</div></div> }
      </div>
    </div>
  `,
  styles: [`
    .den { padding-bottom: 90px; }
    .bond { cursor: pointer; margin-bottom: 8px; }
    .bondtop { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; font-size: .9rem; }
    .track { height: 8px; border-radius: 6px; background: rgba(255,255,255,.1); overflow: hidden; } .track i { display: block; height: 100%; background: linear-gradient(90deg, #fb7185, #fbbf24); border-radius: 6px; transition: width .6s; }
    .tip, .fetchhint { text-align: center; margin: 8px 0; }
    .fetchhint { background: rgba(var(--accent-rgb), .12); border: 1px solid var(--line); border-radius: 12px; padding: 8px; font-size: .88rem; display: flex; gap: 8px; align-items: center; justify-content: center; }
    .hearts { margin: 6px 0 10px; }
    .hrow { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .heart { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 4px; border-radius: 14px; border: 1px solid var(--line); opacity: .55; transition: all .3s; }
    .heart span { font-size: 1.4rem; filter: grayscale(1); transition: filter .3s; } .heart i { font-style: normal; font-size: .72rem; color: var(--muted); }
    .heart.on { opacity: 1; border-color: #fbbf24; background: rgba(251, 191, 36, .1); box-shadow: 0 0 14px rgba(251, 191, 36, .25); } .heart.on span { filter: none; }
    .wish { text-align: center; font-size: .86rem; color: var(--muted); margin-top: 8px; } .wish.good { color: #fbbf24; }
    .tabs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin: 4px 0 12px; padding: 4px; border-radius: 16px; background: var(--tabs-bg); border: 1px solid var(--line); position: sticky; top: calc(var(--safe-top) + 4px); z-index: 20; backdrop-filter: blur(8px); }
    .tabs button { border: none; background: transparent; color: var(--muted); padding: 7px 2px; border-radius: 12px; font-size: .72rem; display: flex; flex-direction: column; align-items: center; gap: 1px; }
    .tabs button span { font-size: 1.2rem; } .tabs button.on { background: rgba(var(--accent-rgb), .18); color: var(--text); }
    .acts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .acts button { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 8px; border-radius: 16px; border: 1px solid var(--line-strong); background: transparent; color: var(--text); font-size: 1rem; position: relative; }
    .acts button span { font-size: 1.5rem; } .acts button.on { border-color: #4ade80; background: rgba(74, 222, 128, .1); } .acts button.dim { opacity: .6; } .acts button:disabled { opacity: .5; }
    .badge { font-style: normal; background: var(--cyan); color: var(--on-accent); border-radius: 10px; padding: 1px 7px; font-size: .75rem; font-weight: 700; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .games { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .game { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 14px 6px; border-radius: 16px; border: 1px solid var(--line); background: transparent; color: var(--text); text-align: center; }
    .game span { font-size: 2rem; } .game i { font-style: normal; font-size: .72rem; color: var(--muted); } .game em { font-style: normal; font-size: .7rem; color: var(--cyan); } .game.on { border-color: var(--cyan); box-shadow: var(--glow); }
    .coats { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px; }
    .coat { height: 50px; border-radius: 12px; border: 2px solid transparent; display: flex; align-items: flex-end; padding: 4px 6px; font-size: .72rem; color: #111; font-weight: 600; }
    .coat.on { border-color: var(--cyan); box-shadow: var(--glow); }
    input[type=color] { width: 100%; height: 40px; padding: 2px; background: transparent; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; }
    .tile { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 6px; border-radius: 14px; border: 1px solid var(--line); background: transparent; color: var(--text); text-align: center; }
    .tile span { font-size: 1.7rem; } .tile b { font-size: .8rem; } .tile i { font-style: normal; font-size: .68rem; color: var(--muted); }
    .tile.on { border-color: var(--cyan); box-shadow: var(--glow); } .tile.locked { opacity: .5; } .tile.static { cursor: default; }
    .bigbond { font-size: 2rem; font-weight: 700; display: flex; align-items: baseline; gap: 10px; } .bigbond small { font-size: .9rem; font-weight: 400; color: var(--muted); }
    .statgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-align: center; margin-top: 4px; }
    .statgrid div { border: 1px solid var(--line); border-radius: 12px; padding: 8px 4px; } .statgrid b { display: block; font-size: 1.2rem; } .statgrid span { font-size: .7rem; color: var(--muted); }
    button.on { border-color: var(--cyan); }
    .orderrow { display: flex; gap: 8px; } .orderrow input { flex: 1; min-width: 0; }
    .warn { color: var(--warn-text); }
    .toasts { position: fixed; left: 12px; right: 12px; bottom: calc(var(--safe-bottom) + 84px); z-index: 120; display: flex; flex-direction: column; gap: 8px; pointer-events: none; align-items: center; }
    .toast { pointer-events: auto; display: flex; gap: 10px; align-items: center; background: var(--panel-solid); border: 1px solid var(--line-strong); border-radius: 16px; padding: 10px 14px; box-shadow: 0 8px 24px rgba(0,0,0,.4); max-width: 420px; animation: slide .35s ease-out; }
    .toast span { font-size: 1.6rem; } .toast b { display: block; font-size: .92rem; } .toast i { font-style: normal; font-size: .78rem; color: var(--muted); }
    @keyframes slide { from { transform: translateY(20px); opacity: 0; } }
  `],
})
export class PetPage implements OnInit, OnDestroy {
  readonly pet = inject(PetService);
  readonly progress = inject(ProgressService);
  private store = inject(StoreService);
  private route = inject(ActivatedRoute);

  readonly scene = viewChild.required<PetSceneComponent>('scene');
  readonly coats = COATS;
  readonly tabs = TABS;
  readonly hearts = HEARTS;
  readonly accessories = UNLOCKS.filter(u => u.kind === 'accessory');
  readonly scenes = UNLOCKS.filter(u => u.kind === 'scene');
  readonly toys = UNLOCKS.filter(u => u.kind === 'toy');

  readonly p = this.pet.pet;
  readonly tab = signal<Tab>('home');
  readonly game = signal<'catch' | 'cups' | null>(null);
  readonly fetchMode = signal(false);
  readonly speech = signal('');
  readonly meaning = signal('');
  readonly ordering = signal(false);
  readonly roamMsg = signal('');
  orderText = '';
  readonly examples = ['Open WhatsApp', 'What is on today?', 'Add buy milk', 'Set a timer for 10 minutes'];
  readonly sassLabel = computed(() => { const s = this.p().sass; return s < 15 ? 'sweet' : s < 45 ? 'a little cheeky' : s < 75 ? 'sassy' : 'maximum sass'; });
  readonly look = computed(() => { const p = this.p(); return { fur: p.fur, patch: p.patch, bandana: p.bandana, accessory: p.accessory }; });
  readonly moodLabel = computed(() => MOOD_LABEL[this.pet.mood()]);
  readonly calmMotion = computed(() => this.p().calmMotion || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches));
  readonly careCount = computed(() => careCount(this.pet.care()));
  readonly age = computed(() => { const d = Math.max(0, Math.floor((Date.now() - (this.p().bornAt || Date.now())) / 864e5)); return d === 0 ? 'born today' : `${d} day${d === 1 ? '' : 's'}`; });
  readonly usePetAvatar = computed(() => (this.store.settings().look ?? DEFAULT_LOOK).orb === 'pet');
  readonly badges = computed(() => { this.p().badges; return this.pet.badgeList(); });
  readonly gotCount = computed(() => this.badges().filter(b => b.got).length);
  readonly nextUnlock = computed(() => UNLOCKS.filter(u => u.level > this.pet.bond().level).sort((a, b) => a.level - b.level)[0]);
  readonly toyName = computed(() => UNLOCKS.find(u => u.id === this.p().toy)?.name.toLowerCase() ?? 'toy');
  readonly toyIcon = computed(() => UNLOCKS.find(u => u.id === this.p().toy)?.icon ?? '🎾');

  private speechTimer?: ReturnType<typeof setTimeout>;
  private purrTimer?: ReturnType<typeof setInterval>;

  constructor() {
    effect(() => { const l = this.pet.line(); if (l) this.say(l); });
  }

  ngOnInit() {
    const t = this.route.snapshot.queryParamMap.get('tab') as Tab | null;
    if (t && TABS.some(x => x.id === t)) this.tab.set(t);
    this.pet.visit().catch(() => undefined);
    this.pet.roamStatus().catch(() => undefined);
  }
  ngOnDestroy() {
    clearTimeout(this.speechTimer); clearInterval(this.purrTimer);
    this.pet.audio.purr(false);
    this.pet.audio.stopAmbient();
  }

  // ------------------------------------------------------------------ helpers
  /** The pup says something: in dog, with the meaning behind a tap (or in plain words if you prefer). */
  say(english: string, ms = 7000) {
    if (this.p().speech === 'english') this.show(english, '', ms);
    else this.show(this.pet.dogFor(english), english, ms);
  }
  private show(text: string, meaning: string, ms: number) {
    this.speech.set(text); this.meaning.set(meaning);
    clearTimeout(this.speechTimer);
    this.speechTimer = setTimeout(() => { this.speech.set(''); this.meaning.set(''); }, ms);
  }
  async order() {
    const text = this.orderText.trim();
    if (!text || this.ordering()) return;
    this.ordering.set(true);
    this.orderText = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const errand = this.scene().errand();
      const reply = await this.pet.order(text);
      await errand;
      const v = this.pet.splitVoice(reply);
      this.show(v.dog || reply, v.dog ? v.meaning : '', 12000);
    } catch { this.say('I could not do that one.', 4000); }
    this.ordering.set(false);
  }
  async roam(on: boolean) {
    const r = await this.pet.setRoam(on);
    this.roamMsg.set(r === 'unsupported' ? 'Roaming works in the Android app (not in the browser).' : r === 'permission' ? 'Allow “Display over other apps” and come back; he will start by himself.' : '');
  }
  resync() { this.pet.pushRoam(false).catch(() => undefined); }
  grant() { this.pet.setRoam(true).catch(() => undefined); }
  label(h: (typeof HEARTS)[number]) { return HEART_LABEL[h]; }
  done(h: (typeof HEARTS)[number]) { return heartDone(this.pet.care(), h); }
  unlocked(u: Unlockable) { return isUnlocked(u.id, this.pet.bond().level); }
  save(x: Partial<PetSettings>) { this.pet.save(x); }

  // ------------------------------------------------------------------ touching
  onPat(button = false) {
    this.pet.pat();
    if (button) this.scene().hearts3('💗');
  }
  onHoldStart() {
    this.pet.setFlash('cuddly', 600_000);
    this.pet.audio.setVolume(this.p().volume);
    if (this.p().sound) this.pet.audio.purr(true);
    this.purrTimer = setInterval(() => this.pet.haptic('tick'), 230);
    this.say('*leans in and purrs... or the dog version of it*', 4000);
  }
  onHoldEnd(secs: number) {
    clearInterval(this.purrTimer);
    this.pet.audio.purr(false);
    this.pet.setFlash('happy', 4000);
    if (secs >= 3) { this.pet.cuddleSeconds(secs); this.say(this.pet.say('pet.calm.done') || 'That was lovely.'); }
  }
  async onStageTap(xPct: number) {
    if (!this.fetchMode()) return;
    const ok = await this.scene().fetch(xPct);
    if (ok) { this.pet.fetched(); this.pet.sfx(a => a.voice('happy')); this.pet.haptic('light'); if (Math.random() < 0.5) this.say(this.pet.say('pet.played')); }
  }
  dream() { if (this.pet.mood() === 'sleeping') this.say(this.pet.say('pet.dream') || '*dreaming*', 6000); }

  // ------------------------------------------------------------------ actions
  async feed() {
    if (this.pet.feed()) { this.say(this.pet.line() || 'Nom!'); await this.scene().treat(); } else this.say(this.pet.line() || 'The jar is empty. Finish a task to fill it.');
  }
  walk() { if (this.pet.care().walked) { this.say('We already walked today. Best walk!'); return; } this.pet.walked(); this.scene().emote('hop'); }
  gift() { if (!this.pet.openGift()) return; this.scene().hearts3('🎁'); }
  talk(sym: string) { this.pet.talked(); this.pet.audio.setVolume(this.p().volume); this.say(this.pet.say(sym) || '*wags*', 9000); this.scene().emote(sym === 'pet.talk.sad' ? 'tilt' : 'wiggle'); }
  toggleFetch() { this.fetchMode.update(v => !v); if (this.fetchMode()) { window.scrollTo({ top: 0, behavior: 'smooth' }); this.say('Throw it! Throw it!', 3500); } }

  // ------------------------------------------------------------------ style
  pickAccessory(u: Unlockable) { if (!this.unlocked(u)) { this.hint(u); return; } this.save({ accessory: u.id as PetSettings['accessory'] }); this.pet.tryAccessory(u.id); }
  pickScene(u: Unlockable) { if (!this.unlocked(u)) { this.hint(u); return; } this.save({ scene: u.id as PetScene }); }
  pickToy(u: Unlockable) { if (!this.unlocked(u)) { this.hint(u); return; } this.save({ toy: u.id as PetToy }); }
  private hint(u: Unlockable) { this.say(`${u.name} unlocks at bond level ${u.level}. We will get there together.`, 4500); JarvisDevice.haptic({ kind: 'light' }).catch(() => undefined); }
  soundOn(on: boolean) {
    this.save({ sound: on });
    if (on) { this.pet.audio.setVolume(this.p().volume); this.pet.audio.voice('happy'); if (this.p().ambient !== 'off') this.pet.audio.ambient(this.p().ambient); } else { this.pet.audio.stopAmbient(); this.pet.audio.purr(false); }
  }
  avatar(on: boolean) { this.store.updateSettings({ look: { ...(this.store.settings().look ?? DEFAULT_LOOK), orb: on ? 'pet' : 'reactor' } }); }

  async photo() {
    try {
      const url = await petPng(this.look(), this.pet.mood() === 'sleeping' ? 'happy' : this.pet.mood(), 768);
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], `${this.p().name}.png`, { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.canShare?.({ files: [file] })) { await nav.share({ files: [file], title: this.p().name, text: `Meet ${this.p().name}!` }); return; }
      const a = document.createElement('a');
      a.href = url; a.download = `${this.p().name}.png`; a.click();
    } catch { this.say('I could not make the photo this time.', 3500); }
  }
}
