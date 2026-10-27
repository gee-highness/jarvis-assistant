import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { JarvisService } from '../core/jarvis.service';
import { JarvisDevice } from '../core/native';
import { StoreService } from '../core/store.service';
import { MdPipe } from './md.pipe';

export type QuickMode = 'chat' | 'capture';

/** Bottom-sheet chat opened from the home-screen chat widget: type, get an answer, get back to your day. */
@Component({
  selector: 'j-quick-chat',
  standalone: true,
  imports: [FormsModule, MdPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="qc-scrim" (click)="close()">
      <div class="qc" (click)="$event.stopPropagation()">
        <div class="grab"></div>
        <div class="row between head">
          <span class="upper">{{ mode() === 'capture' ? 'Quick capture' : 'Quick chat' }}</span>
          <div class="row">
            @if (mode() === 'chat') { <button class="small ghost" (click)="openFull()">Full chat ↗</button> }
            <button class="ghost icon" (click)="close()" aria-label="Close">✕</button>
          </div>
        </div>

        @if (mode() === 'chat') {
          <div class="log" #log>
            @for (m of recent(); track m.id) {
              <div class="msg" [class.user]="m.role === 'user'">
                @if (m.toolCalls?.length) {
                  <div class="tools">@for (t of m.toolCalls; track $index) { <span class="chip small" [class.green]="t.ok" [class.red]="t.ok === false">⚙ {{ t.name }}</span> }</div>
                }
                @if (m.content) { <div class="bubble md" [innerHTML]="m.content | md"></div> }
                @else if (m.streaming) { <div class="bubble typing"><span></span><span></span><span></span></div> }
              </div>
            } @empty {
              <div class="empty small muted">At your service, {{ store.settings().honorific }}. Ask anything.</div>
            }
            @if (jarvis.status()) { <div class="small muted status">{{ jarvis.status() }}</div> }
          </div>
          @if (!recent().length) {
            <div class="chips">
              @for (s of suggestions; track s) { <button class="small" (click)="send(s)">{{ s }}</button> }
            </div>
          }
        } @else {
          <p class="small muted" style="margin:0">Type anything: tasks, ideas, errands. Jarvis turns it into tasks with dates and priorities.</p>
          @if (captured()) { <div class="banner ok">{{ captured() }}</div> }
        }

        @if (jarvis.pendingConfirm(); as pc) {
          <div class="card glow">
            <p style="margin-top:0">{{ pc.question }}</p>
            <div class="row"><button class="grow" (click)="pc.resolve(false)">Cancel</button><button class="primary grow" (click)="pc.resolve(true)">Confirm</button></div>
          </div>
        }

        <div class="composer row">
          <textarea #box rows="1" [(ngModel)]="text" (keydown.enter)="onEnter($event)" (input)="grow()"
            [placeholder]="mode() === 'capture' ? 'e.g. call mum tomorrow, renew passport by Friday…' : 'Message Jarvis…'"></textarea>
          @if (jarvis.busy()) {
            <button class="icon danger" (click)="jarvis.stop()" aria-label="Stop">■</button>
          } @else {
            <button class="icon" (click)="voice.emit()" aria-label="Talk">🎙</button>
            <button class="icon primary" [disabled]="!text.trim() || busyCapture()" (click)="send(text)" aria-label="Send">➤</button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .qc-scrim { position: fixed; inset: 0; z-index: 45; background: rgba(0,0,0,.5); display: flex; align-items: flex-end; justify-content: center; animation: fade .18s ease-out; }
    .qc { width: 100%; max-width: 620px; max-height: 82vh; display: flex; flex-direction: column; gap: 10px; background: var(--panel-solid);
      border: 1px solid var(--line-strong); border-bottom: none; border-radius: 22px 22px 0 0; padding: 8px 14px calc(12px + var(--safe-bottom));
      box-shadow: 0 -10px 40px -10px rgba(34,211,238,.35); animation: rise .24s cubic-bezier(.2,.9,.3,1.2); }
    .grab { width: 42px; height: 4px; border-radius: 2px; background: var(--line-strong); align-self: center; }
    .log { overflow-y: auto; display: flex; flex-direction: column; gap: 8px; min-height: 60px; max-height: 52vh; }
    .msg { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
    .msg.user { align-items: flex-end; }
    .bubble { max-width: 88%; padding: 8px 12px; border-radius: 14px; background: rgba(34,211,238,.06); border: 1px solid var(--line); font-size: .93rem; }
    .msg.user .bubble { background: rgba(34,211,238,.16); border-color: rgba(34,211,238,.35); }
    .tools { display: flex; flex-wrap: wrap; gap: 4px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .composer { align-items: flex-end; gap: 6px; }
    .composer textarea { flex: 1; resize: none; max-height: 140px; min-height: 44px; border-radius: 14px; }
    .typing { display: flex; gap: 4px; }
    .typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--cyan); animation: blink 1s infinite; }
    .typing span:nth-child(2) { animation-delay: .15s; } .typing span:nth-child(3) { animation-delay: .3s; }
    .banner.ok { border-color: rgba(74,222,128,.5); background: rgba(74,222,128,.08); color: #bbf7d0; }
    .status { text-align: center; }
    .empty { text-align: center; padding: 12px 0; }
    @keyframes rise { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes blink { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }
  `],
})
export class QuickChatComponent implements AfterViewInit {
  readonly jarvis = inject(JarvisService);
  readonly store = inject(StoreService);
  private router = inject(Router);

  readonly mode = input<QuickMode>('chat');
  readonly preset = input<string | null>(null);
  readonly closed = output<void>();
  readonly voice = output<void>();

  private box = viewChild<ElementRef<HTMLTextAreaElement>>('box');
  private log = viewChild<ElementRef<HTMLElement>>('log');
  readonly captured = signal('');
  readonly busyCapture = signal(false);
  readonly recent = computed(() => this.jarvis.messages().filter(m => m.role === 'user' || m.role === 'assistant').slice(-6));
  readonly suggestions = ["What's my next move?", 'Plan my day', 'What did I finish this week?', 'Motivate me'];
  text = '';

  constructor() {
    effect(() => {
      this.recent();
      queueMicrotask(() => { const el = this.log()?.nativeElement; if (el) el.scrollTop = el.scrollHeight; });
    });
  }

  ngAfterViewInit() {
    const p = this.preset();
    if (p) this.send(p);
    else setTimeout(() => this.box()?.nativeElement.focus(), 120);
  }

  onEnter(e: Event) {
    const ke = e as KeyboardEvent;
    if (ke.shiftKey) return;
    ke.preventDefault();
    this.send(this.text);
  }

  grow() {
    const el = this.box()?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(140, el.scrollHeight) + 'px';
  }

  async send(t: string) {
    const text = t.trim();
    if (!text) return;
    this.text = '';
    this.grow();
    JarvisDevice.haptic({ kind: 'tick' }).catch(() => undefined);
    if (this.mode() === 'capture') {
      this.busyCapture.set(true);
      try {
        const n = await this.jarvis.quickCapture(text);
        this.captured.set(`Captured ${n} item${n === 1 ? '' : 's'}. Anything else?`);
        JarvisDevice.haptic({ kind: 'success' }).catch(() => undefined);
      } finally { this.busyCapture.set(false); }
      return;
    }
    await this.jarvis.send(text);
  }

  openFull() { this.closed.emit(); this.router.navigateByUrl('/chat'); }
  close() { this.closed.emit(); }
}
