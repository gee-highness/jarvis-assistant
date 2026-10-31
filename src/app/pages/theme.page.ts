import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DEFAULT_LOOK, LookSettings } from '../core/models';
import { StoreService } from '../core/store.service';
import { THEME_PRESETS, ThemeService } from '../core/theme.service';

@Component({
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Theme</h1><button class="small" (click)="reset()">Reset</button></div>

      <!-- live preview -->
      <div class="card glow col preview">
        <div class="upper">Preview</div>
        <div class="row between"><b>{{ greeting }}</b><span class="chip cyan">online</span></div>
        <div class="bubble">Good evening. Your top priority is still the report.</div>
        <div class="bubble mine">Add buy milk tomorrow</div>
        <div class="row"><button class="primary small">Primary</button><button class="small">Secondary</button><span class="chip">chip</span></div>
        <div class="bar"><i [style.width.%]="62"></i></div>
      </div>

      <div class="card col">
        <b>Presets</b>
        <div class="presets">
          @for (p of presets; track p.id) {
            <button class="preset" [class.on]="look().preset === p.id" (click)="preset(p.id)"
              [style.background]="'linear-gradient(135deg,' + (p.look.accent ?? '#22d3ee') + ',' + (p.look.accent2 ?? '#a78bfa') + ')'">
              <span>{{ p.label }}</span>
            </button>
          }
        </div>
      </div>

      <div class="card col">
        <b>Colours</b>
        <div class="row wrap">
          <label class="field grow">Accent <input type="color" [ngModel]="look().accent" (ngModelChange)="set({ accent: $event })"></label>
          <label class="field grow">Second colour <input type="color" [ngModel]="look().accent2" (ngModelChange)="set({ accent2: $event })"></label>
        </div>
        <div class="swatches">
          @for (c of swatches; track c) { <button class="sw" [style.background]="c" [class.on]="look().accent === c" (click)="set({ accent: c })" [attr.aria-label]="c"></button> }
        </div>
        <label class="field">Background
          <select [ngModel]="look().background" (ngModelChange)="set({ background: $event })">
            @for (b of backgrounds; track b[0]) { <option [value]="b[0]">{{ b[1] }}</option> }
          </select>
        </label>
        @if (look().background === 'custom') {
          <label class="field">Background colour <input type="color" [ngModel]="look().bgColor" (ngModelChange)="set({ bgColor: $event })"></label>
        }
        <label class="field">Light / dark
          <select [ngModel]="s().theme" (ngModelChange)="store.updateSettings({ theme: $event })">
            <option value="dark">Dark</option><option value="light">Light</option><option value="auto">Follow phone</option>
          </select>
        </label>
      </div>

      <div class="card col">
        <b>Shape & feel</b>
        <label class="field">Corner roundness: {{ look().radius }}px
          <input type="range" min="0" max="28" [ngModel]="look().radius" (ngModelChange)="set({ radius: +$event })"></label>
        <label class="field">Glow: {{ look().glow }}%
          <input type="range" min="0" max="100" step="5" [ngModel]="look().glow" (ngModelChange)="set({ glow: +$event })"></label>
        <label class="field">Text size: {{ (s().fontScale * 100).toFixed(0) }}%
          <input type="range" min="0.85" max="1.4" step="0.05" [ngModel]="s().fontScale" (ngModelChange)="store.updateSettings({ fontScale: +$event })"></label>
        <label class="field">Font
          <select [ngModel]="look().font" (ngModelChange)="set({ font: $event })">
            <option value="system">System</option><option value="rounded">Rounded</option><option value="serif">Serif</option><option value="mono">Mono</option><option value="condensed">Condensed</option>
          </select>
        </label>
        <label class="field">Spacing
          <select [ngModel]="look().density" (ngModelChange)="set({ density: $event })">
            <option value="compact">Compact</option><option value="comfy">Comfortable</option><option value="spacious">Spacious</option>
          </select>
        </label>
        <label class="field">Chat bubbles
          <select [ngModel]="look().bubbles" (ngModelChange)="set({ bubbles: $event })">
            <option value="classic">Classic</option><option value="rounded">Rounded</option><option value="minimal">Minimal</option>
          </select>
        </label>
        <label class="field">Assistant avatar
          <select [ngModel]="look().orb" (ngModelChange)="set({ orb: $event })">
            <option value="reactor">Arc reactor orb</option><option value="pet">Your pet</option><option value="pulse">Simple pulse</option><option value="none">None</option>
          </select>
        </label>
        <label class="row small"><input type="checkbox" [ngModel]="look().glass" (ngModelChange)="set({ glass: $event })"> Frosted glass panels</label>
        <label class="row small"><input type="checkbox" [ngModel]="look().grid" (ngModelChange)="set({ grid: $event })"> HUD grid background</label>
        <label class="row small"><input type="checkbox" [ngModel]="look().borders" (ngModelChange)="set({ borders: $event })"> Panel borders</label>
        <label class="row small"><input type="checkbox" [ngModel]="look().navLabels" (ngModelChange)="set({ navLabels: $event })"> Labels in the bottom bar</label>
        <label class="row small"><input type="checkbox" [ngModel]="s().reduceMotion" (ngModelChange)="store.updateSettings({ reduceMotion: $event })"> Reduce motion</label>
      </div>

      <div class="card col">
        <b>Share a theme</b>
        <p class="small muted" style="margin:0">Copy your theme code to share it, or paste someone else's.</p>
        <div class="row"><button class="small" (click)="copy()">⧉ Copy my theme code</button></div>
        <div class="row"><input class="grow" [(ngModel)]="code" placeholder="Paste a theme code"><button class="small" (click)="paste()">Apply</button></div>
        @if (msg()) { <div class="small muted">{{ msg() }}</div> }
      </div>
    </div>
  `,
  styles: [`
    .preview .bubble { padding: 9px 12px; border-radius: 14px; background: var(--panel); border: 1px solid var(--line); max-width: 85%; }
    .preview .bubble.mine { align-self: flex-end; background: rgba(var(--accent-rgb), .14); border-color: var(--line-strong); }
    .bar { height: 6px; border-radius: 4px; background: rgba(var(--accent-rgb), .12); overflow: hidden; }
    .bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--cyan), var(--violet)); }
    .presets { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; }
    .preset { height: 64px; border-radius: var(--radius); border: 2px solid transparent; display: flex; align-items: flex-end; padding: 6px 8px; color: #fff; font-weight: 600; font-size: .78rem; text-shadow: 0 1px 3px rgba(0,0,0,.6); }
    .preset.on { border-color: var(--text); box-shadow: var(--glow); }
    .swatches { display: flex; flex-wrap: wrap; gap: 8px; }
    .sw { width: 34px; height: 34px; min-width: 34px; min-height: 34px; border-radius: 50%; border: 2px solid transparent; padding: 0; }
    .sw.on { border-color: var(--text); }
    input[type=color] { width: 100%; height: 40px; padding: 2px; background: transparent; }
    input[type=range] { width: 100%; accent-color: var(--cyan); }
  `],
})
export class ThemePage {
  readonly store = inject(StoreService);
  private theme = inject(ThemeService);
  readonly s = computed(() => this.store.settings());
  readonly look = computed(() => this.s().look ?? DEFAULT_LOOK);
  readonly presets = THEME_PRESETS;
  readonly msg = signal('');
  readonly greeting = 'Hello. This is how Jarvis will look.';
  code = '';
  readonly swatches = ['#22d3ee', '#38bdf8', '#6366f1', '#a78bfa', '#f472b6', '#fb7185', '#f43f5e', '#fb923c', '#fbbf24', '#a3e635', '#34d399', '#2dd4bf', '#e5e7eb'];
  readonly backgrounds: [LookSettings['background'], string][] = [
    ['space', 'Deep space'], ['oled', 'Pure black (OLED)'], ['slate', 'Slate'], ['midnight', 'Midnight'], ['forest', 'Forest'], ['wine', 'Wine'],
    ['ocean', 'Ocean'], ['paper', 'Paper (light)'], ['sand', 'Sand (light)'], ['custom', 'Custom colour'],
  ];

  set(p: Partial<LookSettings>) { this.store.updateSettings({ look: { ...this.look(), ...p, preset: p.preset ?? 'custom' } }); }
  preset(id: string) {
    const light = this.presets.find(p => p.id === id)?.light;
    this.store.updateSettings({ look: this.theme.presetLook(id), theme: light ? 'light' : this.s().theme === 'light' ? 'dark' : this.s().theme });
  }
  reset() { this.store.updateSettings({ look: { ...DEFAULT_LOOK }, theme: 'dark', fontScale: 1 }); }
  async copy() {
    const c = this.theme.exportCode(this.look());
    try { await navigator.clipboard.writeText(c); this.msg.set('Theme code copied.'); } catch { this.code = c; this.msg.set('Copy the code from the box.'); }
  }
  paste() {
    const l = this.theme.importCode(this.code);
    if (!l) { this.msg.set('That code is not valid.'); return; }
    this.store.updateSettings({ look: l });
    this.msg.set('Theme applied.');
  }
}
