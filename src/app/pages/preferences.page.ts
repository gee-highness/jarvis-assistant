import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StoreService } from '../core/store.service';
import { WakeService } from '../core/wake.service';
import { isNative } from '../core/native';

@Component({
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Preferences</h1></div>

      <div class="card stack">
        <h2>Appearance</h2>
        <label class="field">Theme
          <select [ngModel]="s().theme" (ngModelChange)="store.updateSettings({ theme: $event })"><option value="dark">Dark</option><option value="light">Light</option><option value="auto">Follow system</option></select></label>
        <label class="field">Text size ({{ (s().fontScale * 100).toFixed(0) }}%)
          <input type="range" min="0.85" max="1.5" step="0.05" [ngModel]="s().fontScale" (ngModelChange)="store.updateSettings({ fontScale: +$event })"></label>
        <label class="row small"><input type="checkbox" [ngModel]="s().reduceMotion" (ngModelChange)="store.updateSettings({ reduceMotion: $event })"> Reduce motion and animations</label>
      </div>

      <div class="card stack">
        <h2>Motivation</h2>
        <label class="row small"><input type="checkbox" [ngModel]="s().gamify" (ngModelChange)="store.updateSettings({ gamify: $event })"> XP, levels, quests and celebrations</label>
        <p class="small muted">Turn this off for a calm, no-points experience. Your progress is kept either way.</p>
      </div>

      <div class="card stack">
        <h2>Hands-free</h2>
        <label class="row small"><input type="checkbox" [ngModel]="s().wakeWord" (ngModelChange)="setWake($event)" [disabled]="!native"> Wake word while the app is open</label>
        <label class="field">Phrase<input [ngModel]="s().wakePhrase" (ngModelChange)="store.updateSettings({ wakePhrase: $event })" placeholder="hey jarvis"></label>
        <p class="small muted">Uses the phone's speech recogniser in short bursts, so you may hear its start tone and it uses some battery. It pauses while a conversation or focus session is active. It only listens while Jarvis is on screen.</p>
      </div>

      <div class="card stack">
        <h2>Notifications</h2>
        <label class="row small"><input type="checkbox" [ngModel]="s().nudges" (ngModelChange)="store.updateSettings({ nudges: $event })"> Gentle nudges (midday check, focus gaps, streak at risk)</label>
      </div>
    </div>
  `,
  styles: [`.stack { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }`],
})
export class PreferencesPage {
  readonly store = inject(StoreService);
  private wake = inject(WakeService);
  readonly s = this.store.settings;
  readonly native = isNative();
  async setWake(v: boolean) { await this.store.updateSettings({ wakeWord: v }); this.wake.sync(); }
}
