import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JarvisService } from '../core/jarvis.service';
import { OllamaService } from '../core/ollama.service';
import { LANGUAGES, PRESETS, Personality, ROLES, TRAITS, TraitKey, mergePersonality } from '../core/personality';
import { StoreService } from '../core/store.service';
import { MdPipe } from '../ui/md.pipe';

const PROBES = ["I'm so behind on everything today.", 'I finished my big task!', "I don't feel like working.", 'What should I do next?'];

@Component({
  standalone: true,
  imports: [FormsModule, MdPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Personality</h1></div>
      <p class="small muted">Shape who {{ p().name || 'Jarvis' }} is. Changes apply instantly to every chat, voice reply and nudge.</p>

      <h2 class="upper">Start from a preset</h2>
      <div class="presets">
        @for (x of presets; track x.id) {
          <button class="card preset" [class.on]="p().preset === x.id" (click)="applyPreset(x.id)">
            <span class="pi">{{ x.icon }}</span><b>{{ x.label }}</b><small>{{ x.blurb }}</small>
          </button>
        }
      </div>

      <h2 class="upper">Identity</h2>
      <div class="card stack">
        <label class="field">Name<input [ngModel]="p().name" (ngModelChange)="set({ name: $event })" placeholder="Jarvis" /></label>
        <label class="field">What you call me / what I call you<input [ngModel]="s().honorific" (ngModelChange)="store.updateSettings({ honorific: $event })" placeholder="sir, boss, mate…" /></label>
        <label class="field">Relationship
          <select [ngModel]="p().role" (ngModelChange)="set({ role: $event })">
            @for (r of roles; track r.id) { <option [value]="r.id">{{ r.label }}</option> }
          </select>
        </label>
        <label class="field">Backstory & beliefs<textarea rows="3" [ngModel]="p().backstory" (ngModelChange)="set({ backstory: $event })"
          placeholder="e.g. You grew up reading sci-fi, love football, believe in small daily wins…"></textarea></label>
      </div>

      <h2 class="upper">Traits</h2>
      <div class="card stack">
        @for (t of traits; track t.key) {
          <div class="trait">
            <div class="row between"><span>{{ t.icon }} {{ t.label }}</span><span class="mono small">{{ p().traits[t.key] }}</span></div>
            <input type="range" min="0" max="100" step="5" [ngModel]="p().traits[t.key]" (ngModelChange)="setTrait(t.key, +$event)" [attr.aria-label]="t.label" />
            <div class="row between small muted"><span>{{ t.low }}</span><span>{{ t.high }}</span></div>
          </div>
        }
        <div class="row"><button class="small" (click)="randomize()">🎲 Surprise me</button><button class="small" (click)="resetTraits()">Reset to preset</button></div>
      </div>

      <h2 class="upper">Voice & texture</h2>
      <div class="card stack">
        <label class="field">Emoji
          <select [ngModel]="p().emoji" (ngModelChange)="set({ emoji: $event })"><option value="none">None</option><option value="some">Some</option><option value="lots">Lots</option></select></label>
        <label class="field">Speech flavor
          <select [ngModel]="p().language" (ngModelChange)="set({ language: $event })">@for (l of langs; track l[0]) { <option [value]="l[0]">{{ l[1] }}</option> }</select></label>
        <label class="field">Language
          <select [ngModel]="p().swearing" (ngModelChange)="set({ swearing: $event })"><option value="none">Clean</option><option value="mild">Mild</option><option value="free">Casual swearing</option></select></label>
        <label class="field">Catchphrases<input [ngModel]="p().catchphrases" (ngModelChange)="set({ catchphrases: $event })" placeholder="comma or sentence separated" /></label>
        <label class="field">Topics I enjoy<input [ngModel]="p().likes" (ngModelChange)="set({ likes: $event })" placeholder="space, football, cooking…" /></label>
        <label class="field">Never do / say<input [ngModel]="p().avoid" (ngModelChange)="set({ avoid: $event })" placeholder="e.g. lecture me, mention my ex" /></label>
        <label class="field">Standing instructions<textarea rows="2" [ngModel]="p().rules" (ngModelChange)="set({ rules: $event })" placeholder="e.g. Check in on my sleep every morning"></textarea></label>
      </div>

      <h2 class="upper">Try it</h2>
      <div class="card stack">
        <div class="row wrap">@for (q of probes; track q) { <button class="small" [disabled]="busy()" (click)="probe(q)">{{ q }}</button> }</div>
        @if (busy()) { <div class="small muted">Thinking…</div> }
        @if (reply()) { <div class="bubble md" [innerHTML]="reply() | md"></div> }
      </div>

      <h2 class="upper">Advanced</h2>
      <div class="card stack">
        <label class="row"><input type="checkbox" [ngModel]="p().rawOverride" (ngModelChange)="set({ rawOverride: $event })" /> Use my own raw system persona instead (Settings → System persona)</label>
        <details><summary class="small muted">Preview the compiled persona</summary><pre class="small">{{ compiled() }}</pre></details>
        <p class="small muted">Tip: just tell Jarvis in chat, e.g. "be funnier" or "stop being so formal".</p>
      </div>
    </div>
  `,
  styles: [`
    .presets { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .preset { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; text-align: left; color: inherit; cursor: pointer; }
    .preset.on { border-color: var(--cyan); box-shadow: 0 0 0 1px var(--cyan) inset; } .pi { font-size: 1.5rem; } .preset small { opacity: .7; }
    .stack { display: flex; flex-direction: column; gap: 12px; } .trait input[type=range] { width: 100%; accent-color: var(--cyan); }
    h2 { margin: 18px 0 8px; } pre { white-space: pre-wrap; } .wrap { flex-wrap: wrap; gap: 6px; }
    .bubble { padding: 10px 12px; border-radius: 14px; background: rgba(34,211,238,.08); border: 1px solid var(--line); }
  `],
})
export class PersonalityPage {
  readonly store = inject(StoreService);
  private ollama = inject(OllamaService);
  private jarvis = inject(JarvisService);
  readonly s = this.store.settings;
  readonly p = computed(() => this.s().personality);
  readonly presets = PRESETS; readonly roles = ROLES; readonly traits = TRAITS; readonly langs = LANGUAGES; readonly probes = PROBES;
  readonly busy = signal(false); readonly reply = signal('');
  readonly compiled = computed(() => { this.s(); return this.jarvis.persona(); });

  set(patch: Partial<Personality>) { return this.store.updateSettings({ personality: { ...this.p(), ...patch, preset: 'custom' } }); }
  setTrait(k: TraitKey, v: number) { return this.set({ traits: { ...this.p().traits, [k]: v } }); }
  applyPreset(id: string) {
    const x = PRESETS.find(q => q.id === id); if (!x) return;
    const keep = { rawOverride: this.p().rawOverride };
    return this.store.updateSettings({ personality: mergePersonality({ ...x.p, ...keep, preset: id }) });
  }
  resetTraits() { const x = PRESETS.find(q => q.id === this.p().preset); if (x) return this.set({ traits: { ...x.p.traits } }).then(() => this.store.updateSettings({ personality: { ...this.p(), preset: x.id } })); return undefined; }
  randomize() {
    const t = { ...this.p().traits };
    for (const k of Object.keys(t) as TraitKey[]) t[k] = Math.round(Math.random() * 20) * 5;
    return this.set({ traits: t });
  }
  async probe(q: string) {
    this.busy.set(true); this.reply.set('');
    try {
      if (!(await this.jarvis.ensureEngine())) { this.reply.set('The brain is offline. Download a model on the Brain page first.'); return; }
      this.reply.set(await this.ollama.complete(this.jarvis.persona() + '\nReply in character in at most 3 sentences.', q, { temperature: 0.8, background: false, maxTokens: 160 }));
    } catch (e: any) { this.reply.set('Could not generate a preview: ' + (e?.message ?? e)); } finally { this.busy.set(false); }
  }
}
