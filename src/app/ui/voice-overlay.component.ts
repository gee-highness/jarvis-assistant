import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { JarvisService } from '../core/jarvis.service';
import { StoreService } from '../core/store.service';
import { VoiceService } from '../core/voice.service';
import { MdPipe } from './md.pipe';
import { OrbComponent } from './orb.component';

/** Full-screen voice mode: listen → think (tools) → speak, optionally hands-free. Opened by the widget. */
@Component({
  selector: 'j-voice-overlay',
  standalone: true,
  imports: [OrbComponent, MdPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overlay">
      <div class="top row between">
        <span class="upper">J.A.R.V.I.S. · voice</span>
        <button class="ghost icon" (click)="close()" aria-label="Close">✕</button>
      </div>

      <button class="orb-btn" (click)="tapOrb()" aria-label="Talk">
        <j-orb [state]="voice.state()" [size]="210"></j-orb>
      </button>

      <div class="state upper">{{ stateLabel() }}</div>

      <div class="transcript">
        @if (voice.transcript() && voice.state() === 'listening') { <p class="heard">“{{ voice.transcript() }}”</p> }
        @else if (lastHeard()) { <p class="heard dim">“{{ lastHeard() }}”</p> }
        @if (jarvis.status()) { <p class="small muted">{{ jarvis.status() }}</p> }
        @if (reply()) { <div class="reply md" [innerHTML]="reply() | md"></div> }
        @if (voice.error()) { <p class="small" style="color:var(--red)">{{ voice.error() }}</p> }
      </div>

      @if (jarvis.pendingConfirm(); as pc) {
        <div class="card glow confirm">
          <p>{{ pc.question }}</p>
          <div class="row"><button class="grow" (click)="pc.resolve(false)">Cancel</button><button class="primary grow" (click)="pc.resolve(true)">Confirm</button></div>
        </div>
      }

      <div class="bottom row">
        <label class="row small muted"><input type="checkbox" [checked]="handsFree()" (change)="toggleHandsFree()"> Hands-free</label>
        <span class="grow"></span>
        @if (jarvis.busy() || voice.state() === 'speaking') { <button class="danger" (click)="stopAll()">Stop</button> }
      </div>
    </div>
  `,
  styles: [`
    .overlay { position: fixed; inset: 0; z-index: 50; background: radial-gradient(600px 600px at 50% 35%, rgba(var(--accent-rgb), .13), transparent 70%), rgba(3,6,10,.97);
      display: flex; flex-direction: column; align-items: center; padding: calc(14px + var(--safe-top)) 18px calc(18px + var(--safe-bottom)); gap: 14px; }
    .top, .bottom { width: 100%; max-width: 560px; }
    .orb-btn { background: none; border: none; padding: 0; margin-top: 4vh; min-height: 0; border-radius: 50%; }
    .state { margin-top: 4px; }
    .transcript { width: 100%; max-width: 560px; flex: 1; overflow-y: auto; text-align: center; }
    .heard { font-size: 1.15rem; margin: 8px 0; }
    .reply { text-align: left; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; margin-top: 10px; }
    .confirm { width: 100%; max-width: 560px; }
  `],
})
export class VoiceOverlayComponent {
  voice = inject(VoiceService);
  jarvis = inject(JarvisService);
  private store = inject(StoreService);
  closed = output<void>();
  readonly reply = signal('');
  readonly lastHeard = signal('');
  readonly handsFree = computed(() => this.store.settings().voice.handsFree);
  private active = true;

  readonly stateLabel = computed(() => ({
    idle: 'Tap the reactor to speak', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…',
  })[this.voice.state()]);

  constructor() { setTimeout(() => this.turn(), 150); }

  async turn(): Promise<void> {
    if (!this.active || this.jarvis.busy()) return;
    const heard = await this.voice.listen();
    if (!this.active) return;
    if (!heard) return;
    this.lastHeard.set(heard);
    if (/^(that'?s all|thanks?,? (that'?s all|jarvis)|goodbye|stop listening|never ?mind)\b/i.test(heard)) {
      await this.voice.speak(`Very good, ${this.store.settings().honorific}.`);
      this.close();
      return;
    }
    this.reply.set('');
    const msgsBefore = this.jarvis.messages().length;
    const text = await this.jarvis.send(heard, { speak: this.store.settings().voice.speakReplies });
    this.reply.set(text || this.jarvis.messages().slice(msgsBefore).pop()?.content || '');
    if (this.active && this.handsFree() && text) setTimeout(() => this.turn(), 300);
  }

  async tapOrb() {
    const st = this.voice.state();
    if (st === 'listening') { await this.voice.stopListening(); return; }
    if (st === 'speaking') { await this.voice.stopSpeaking(); return; }
    if (st === 'idle') this.turn();
  }

  toggleHandsFree() {
    const v = this.store.settings().voice;
    this.store.updateSettings({ voice: { ...v, handsFree: !v.handsFree } });
  }

  stopAll() { this.jarvis.stop(); this.voice.stopListening(); }

  close() {
    this.active = false;
    this.voice.stopListening();
    this.voice.stopSpeaking();
    this.closed.emit();
  }
}
