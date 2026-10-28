import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JarvisDevice, TtsEngine, TtsVoice } from '../core/native';
import { VoiceSettings } from '../core/models';
import { StoreService } from '../core/store.service';
import { VoiceService } from '../core/voice.service';

interface Preset { name: string; desc: string; lang: string; pitch: number; rate: number; prefer: RegExp; }

const PRESETS: Preset[] = [
  { name: 'J.A.R.V.I.S.', desc: 'British male, measured', lang: 'en-GB', pitch: 0.9, rate: 1.0, prefer: /male|gbb|gbd|rjs|en-gb-x-(gbb|gbd|rjs)/i },
  { name: 'F.R.I.D.A.Y.', desc: 'Irish or British female, brisk', lang: 'en-IE', pitch: 1.05, rate: 1.08, prefer: /female|ie|gba|gbc|gbg/i },
  { name: 'Calm narrator', desc: 'Slow and warm', lang: 'en-US', pitch: 0.85, rate: 0.88, prefer: /male|iom|iol/i },
  { name: 'Fast briefing', desc: 'Quick delivery', lang: 'en-US', pitch: 1.0, rate: 1.3, prefer: /./ },
];

const SAMPLE = 'Good evening, sir. Three priorities today, one overdue item, and your reading streak is at twelve days. Shall we begin?';

@Component({
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Voices</h1><button class="small" (click)="load()">↻ Refresh</button></div>

      <div class="card col">
        <div class="upper">Active voice</div>
        <div class="row between">
          <div><b>{{ activeVoice()?.name ?? 'System default' }}</b><div class="small muted">{{ activeVoice()?.locale ?? v().language }} · {{ engineLabel() }}</div></div>
          <button class="small primary" (click)="preview()">▶ Test</button>
        </div>
        <label class="field">Pitch {{ v().pitch.toFixed(2) }}<input type="range" min="0.5" max="1.6" step="0.05" [ngModel]="v().pitch" (ngModelChange)="patch({ pitch: +$event })"></label>
        <label class="field">Speed {{ v().rate.toFixed(2) }}<input type="range" min="0.5" max="2" step="0.05" [ngModel]="v().rate" (ngModelChange)="patch({ rate: +$event })"></label>
        <div class="row wrap">
          <label class="row small"><input type="checkbox" [ngModel]="v().speakReplies" (ngModelChange)="patch({ speakReplies: $event })"> Speak replies in voice mode</label>
          <label class="row small"><input type="checkbox" [ngModel]="v().handsFree" (ngModelChange)="patch({ handsFree: $event })"> Hands-free follow-ups</label>
        </div>
        <label class="field">Speech recognition language
          <select [ngModel]="v().language" (ngModelChange)="patch({ language: $event })">
            @for (l of langs; track l) { <option [value]="l">{{ l }}</option> }
          </select>
        </label>
      </div>

      <div class="card">
        <div class="upper" style="margin-bottom:8px">Presets</div>
        <div class="grid2">
          @for (p of presets; track p.name) {
            <button class="preset" (click)="applyPreset(p)"><b>{{ p.name }}</b><span class="small muted">{{ p.desc }}</span></button>
          }
        </div>
      </div>

      <div class="card col">
        <div class="upper">Voice engine</div>
        <div class="row wrap">
          @for (e of engines(); track e.name) {
            <button class="small" [class.primary]="e.name === engine()" (click)="selectEngine(e.name)">{{ e.label }}</button>
          } @empty { <span class="small muted">No TTS engines found.</span> }
        </div>
        <div class="row wrap">
          <button class="small" (click)="installData()">⬇ Get more voices</button>
          <button class="small" (click)="openTts()">⚙ Android TTS settings</button>
        </div>
        <p class="small dim" style="margin:0">For natural offline neural voices, install a Piper or sherpa-onnx based TTS engine app, then pick it here. Google's engine voices marked “Offline” are downloaded voice packs.</p>
      </div>

      <div class="card">
        <div class="row wrap filters">
          <input [(ngModel)]="search" placeholder="Search voices" style="flex:1;min-width:140px">
          <select [(ngModel)]="langFilter" style="width:110px">
            <option value="">All langs</option>
            @for (l of voiceLangs(); track l) { <option [value]="l">{{ l }}</option> }
          </select>
        </div>
        <div class="row wrap" style="margin:8px 0">
          <label class="row small"><input type="checkbox" [(ngModel)]="offlineOnly"> Offline only</label>
          <label class="row small"><input type="checkbox" [(ngModel)]="favOnly"> Favourites</label>
          <span class="grow"></span>
          <span class="small dim">{{ filtered().length }} voices</span>
        </div>
        @if (loading()) { <div class="empty">Loading voices…</div> }
        <div class="list">
          @for (voice of filtered(); track voice.id) {
            <div class="item" [class.active]="voice.id === v().voiceId">
              <button class="ghost icon" (click)="toggleFav(voice.id)" aria-label="Favourite" [style.color]="v().favourites.includes(voice.id) ? 'var(--gold)' : 'var(--dim)'">★</button>
              <div class="grow" (click)="select(voice)">
                <div class="ellipsis">{{ voice.name }}</div>
                <div class="row wrap small" style="gap:4px">
                  <span class="chip">{{ voice.locale }}</span>
                  @if (!voice.networkRequired) { <span class="chip green">offline</span> } @else { <span class="chip gold">network</span> }
                  @if (!voice.installed) { <span class="chip red">not downloaded</span> }
                  <span class="chip">{{ qualityLabel(voice.quality) }}</span>
                </div>
              </div>
              <button class="small" (click)="preview(voice)" aria-label="Preview voice">▶</button>
              <button class="small" [class.primary]="voice.id === v().voiceId" (click)="select(voice)">{{ voice.id === v().voiceId ? 'Active' : 'Use' }}</button>
            </div>
          } @empty { @if (!loading()) { <div class="empty">No voices match. Try “Get more voices”.</div> } }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .preset { flex-direction: column; align-items: flex-start; text-align: left; gap: 2px; min-height: 60px; }
    .item.active { background: rgba(34,211,238,.08); border-radius: 10px; }
    .ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  `],
})
export class VoicesPage implements OnInit {
  private store = inject(StoreService);
  private voice = inject(VoiceService);
  readonly presets = PRESETS;
  readonly langs = ['en-GB', 'en-US', 'en-ZA', 'en-AU', 'en-IE', 'en-IN', 'af-ZA', 'zu-ZA', 'xh-ZA', 'ss-SZ', 'fr-FR', 'de-DE', 'es-ES', 'pt-PT', 'pt-BR', 'it-IT', 'nl-NL'];
  readonly engines = signal<TtsEngine[]>([]);
  readonly engine = signal('');
  readonly voices = signal<TtsVoice[]>([]);
  readonly loading = signal(false);
  search = '';
  langFilter = '';
  offlineOnly = true;
  favOnly = false;
  readonly v = computed(() => this.store.settings().voice);
  readonly activeVoice = computed(() => this.voices().find(x => x.id === this.v().voiceId));
  readonly engineLabel = computed(() => this.engines().find(e => e.name === this.engine())?.label ?? 'default engine');
  readonly voiceLangs = computed(() => [...new Set(this.voices().map(x => x.language))].sort());

  // template-driven filters are plain fields, so recompute on each CD pass
  filtered() {
    const q = this.search.toLowerCase();
    return this.voices().filter(x =>
      (!this.offlineOnly || !x.networkRequired) &&
      (!this.favOnly || this.v().favourites.includes(x.id)) &&
      (!this.langFilter || x.language === this.langFilter) &&
      (!q || (x.name + ' ' + x.locale).toLowerCase().includes(q)))
      .sort((a, b) => (+this.v().favourites.includes(b.id) - +this.v().favourites.includes(a.id)) || b.quality - a.quality || a.locale.localeCompare(b.locale));
  }

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading.set(true);
    try {
      const e = await JarvisDevice.getEngines();
      this.engines.set(e.engines);
      this.engine.set(this.v().engine || e.current);
      const r = await JarvisDevice.getVoices({ engine: this.engine() });
      this.voices.set(r.voices);
      if (!this.langFilter) this.langFilter = this.voices().some(x => x.language === 'en') ? 'en' : '';
    } catch { this.voices.set([]); }
    finally { this.loading.set(false); }
  }

  qualityLabel(q: number) { return q >= 400 ? 'high' : q >= 300 ? 'normal' : 'low'; }

  patch(p: Partial<VoiceSettings>) { this.store.updateSettings({ voice: { ...this.v(), ...p } }); }

  async selectEngine(name: string) {
    this.patch({ engine: name, voiceId: undefined });
    this.engine.set(name);
    this.loading.set(true);
    try { this.voices.set((await JarvisDevice.getVoices({ engine: name })).voices); } finally { this.loading.set(false); }
  }

  select(voice: TtsVoice) { this.patch({ voiceId: voice.id, engine: voice.engine }); this.preview(voice); }

  toggleFav(id: string) {
    const f = this.v().favourites;
    this.patch({ favourites: f.includes(id) ? f.filter(x => x !== id) : [...f, id] });
  }

  preview(voice?: TtsVoice) {
    this.voice.stopSpeaking();
    this.voice.speak(SAMPLE, voice ? { voiceId: voice.id, engine: voice.engine, language: voice.locale } : undefined);
  }

  applyPreset(p: Preset) {
    const pool = this.voices().filter(x => !x.networkRequired && x.installed);
    const langMatch = pool.filter(x => x.locale.replace('_', '-').toLowerCase().startsWith(p.lang.toLowerCase()));
    const pick = langMatch.find(x => p.prefer.test(x.name)) ?? langMatch[0] ?? pool.find(x => x.language === 'en') ?? undefined;
    this.patch({ pitch: p.pitch, rate: p.rate, voiceId: pick?.id ?? this.v().voiceId, engine: pick?.engine ?? this.v().engine });
    setTimeout(() => this.preview(), 50);
  }

  installData() { JarvisDevice.installVoiceData({ engine: this.engine() }).catch(() => undefined); }
  openTts() { JarvisDevice.openTtsSettings().catch(() => undefined); }
}
