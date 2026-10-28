import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { JarvisDevice } from '../core/native';
import { PRESETS, mergePersonality } from '../core/personality';
import { StoreService } from '../core/store.service';

const FOCUS_AREAS = [
  { id: 'tpl-morning', icon: '🌅', label: 'Own my mornings' }, { id: 'tpl-weekly', icon: '🗓', label: 'Weekly reset' },
];

@Component({
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="welcome">
      <div class="dots">@for (n of [0,1,2,3]; track n) { <i [class.on]="step() >= n"></i> }</div>

      @switch (step()) {
        @case (0) {
          <div class="orb">◎</div>
          <h1>Good day. I'm your assistant.</h1>
          <p class="muted">I run entirely on your phone: private, offline, and built to help you get things done and feel good doing it.</p>
          <label class="field">What's your name?<input [(ngModel)]="name" placeholder="Your name" autofocus></label>
          <label class="field">What should I call you?<input [(ngModel)]="honorific" placeholder="sir, boss, mate…"></label>
        }
        @case (1) {
          <h1>Choose my personality</h1>
          <p class="muted">You can fine-tune every trait later in More → Personality.</p>
          <div class="presets">
            @for (x of presets; track x.id) {
              <button class="card preset" [class.on]="preset() === x.id" (click)="preset.set(x.id)"><span class="pi">{{ x.icon }}</span><b>{{ x.label }}</b><small>{{ x.blurb }}</small></button>
            }
          </div>
        }
        @case (2) {
          <h1>What's your first win?</h1>
          <p class="muted">Name one thing that would make today a success. I'll make it your Most Important Task.</p>
          <input [(ngModel)]="firstTask" placeholder="e.g. Finish the project proposal">
          <p class="muted small">Optional starter routines:</p>
          @for (f of areas; track f.id) {
            <label class="card row"><input type="checkbox" [checked]="picked().includes(f.id)" (change)="toggle(f.id)"> <span>{{ f.icon }} {{ f.label }}</span></label>
          }
        }
        @case (3) {
          <h1>Last step: my brain</h1>
          <p class="muted">Download a language model once (Wi-Fi recommended). After that, everything works offline. I'll take you to the setup.</p>
          <div class="card small">You will earn XP, keep streaks and unlock achievements as you go. Small daily wins add up.</div>
        }
      }

      <div class="row nav">
        @if (step() > 0) { <button (click)="step.set(step() - 1)">Back</button> }
        <span class="grow"></span>
        @if (step() < 3) { <button class="primary" (click)="next()">Continue</button> }
        @else { <button class="primary" (click)="finish()">Set up my brain →</button> }
      </div>
    </div>
  `,
  styles: [`
    .welcome { min-height: 100dvh; padding: calc(24px + var(--safe-top, 0px)) 20px calc(24px + var(--safe-bottom)); display: flex; flex-direction: column; gap: 14px; max-width: 560px; margin: 0 auto; }
    .dots { display: flex; gap: 6px; justify-content: center; } .dots i { width: 28px; height: 4px; border-radius: 2px; background: var(--line-strong); } .dots i.on { background: var(--cyan); }
    .orb { font-size: 4rem; text-align: center; color: var(--cyan); text-shadow: 0 0 30px rgba(34,211,238,.8); }
    h1 { margin: 6px 0 0; } .presets { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .preset { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; color: inherit; } .preset.on { border-color: var(--cyan); box-shadow: 0 0 0 1px var(--cyan) inset; }
    .pi { font-size: 1.6rem; } .preset small { opacity: .7; } .nav { margin-top: auto; padding-top: 12px; }
  `],
})
export class WelcomePage {
  private store = inject(StoreService);
  private router = inject(Router);
  readonly presets = PRESETS; readonly areas = FOCUS_AREAS;
  readonly step = signal(0);
  readonly preset = signal(this.store.settings().personality.preset === 'custom' ? 'jarvis' : this.store.settings().personality.preset);
  readonly picked = signal<string[]>([]);
  name = this.store.settings().userName;
  honorific = this.store.settings().honorific;
  firstTask = '';

  toggle(id: string) { this.picked.update(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id])); }

  async next() {
    JarvisDevice.haptic({ kind: 'tick' }).catch(() => undefined);
    if (this.step() === 0) await this.store.updateSettings({ userName: this.name.trim(), honorific: this.honorific.trim() || 'sir' });
    this.step.update(s => s + 1);
  }

  async finish() {
    const x = PRESETS.find(p => p.id === this.preset());
    if (x) await this.store.updateSettings({ personality: mergePersonality({ ...x.p, preset: x.id }) });
    if (this.firstTask.trim()) await this.store.addTask({ title: this.firstTask.trim(), isMit: true, due: this.store.today(), important: true });
    for (const id of this.picked()) await this.store.applyTemplate(id).catch(() => undefined);
    await this.store.updateSettings({ welcomed: true });
    JarvisDevice.haptic({ kind: 'success' }).catch(() => undefined);
    this.router.navigateByUrl('/settings?setup=1');
  }
}
