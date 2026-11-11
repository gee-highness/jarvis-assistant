import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { JarvisService } from '../core/jarvis.service';
import { StoreService } from '../core/store.service';
import { VoiceService } from '../core/voice.service';
import { MdPipe } from '../ui/md.pipe';

@Component({
  standalone: true,
  imports: [FormsModule, MdPipe, DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat">
      <header class="head row">
        <button class="icon ghost" (click)="drawer.set(!drawer())" aria-label="History">☰</button>
        <div class="grow ellipsis"><div class="upper">Chat</div><div class="ellipsis">{{ jarvis.current()?.title ?? 'New conversation' }}</div></div>
        <button class="small" [class.primary]="store.settings().deepThink" (click)="toggleThink()" title="Deep think">🧠</button>
        <button class="small" (click)="jarvis.newConversation()">＋ New</button>
      </header>

      @if (drawer()) {
        <div class="drawer card">
          @for (c of jarvis.conversations(); track c.id) {
            <div class="item">
              <button class="ghost grow left" (click)="open(c.id)">
                <div class="ellipsis">{{ c.title }}</div>
                <div class="small dim">{{ c.updatedAt | date:'short' }}</div>
              </button>
              <button class="ghost icon small" (click)="jarvis.deleteConversation(c.id)" aria-label="Delete">🗑</button>
            </div>
          } @empty { <div class="empty">No conversations yet.</div> }
        </div>
      }

      <div class="scroll" #scroller>
        @if (!jarvis.messages().length) {
          <div class="welcome">
            <p class="muted">At your service, {{ store.settings().honorific }}. Try:</p>
            @for (s of suggestions; track s) { <button class="small sug" (click)="send(s)">{{ s }}</button> }
          </div>
        }
        @for (m of jarvis.messages(); track m.id) {
          <div class="msg" [class.user]="m.role === 'user'">
            @if (m.thinking) {
              <details class="think"><summary class="small dim">Reasoning</summary><div class="small muted pre">{{ m.thinking }}</div></details>
            }
            @if (m.toolCalls?.length) {
              <div class="tools">
                @for (t of m.toolCalls; track $index) {
                  <details class="tool" [class.bad]="t.ok === false">
                    <summary><span class="chip" [class.cyan]="t.ok" [class.red]="t.ok === false">⚙ {{ t.name }}{{ t.ok === undefined ? ' …' : '' }}</span></summary>
                    @if (t.result) { <div class="small muted pre">{{ t.result }}</div> }
                  </details>
                }
              </div>
            }
            @if (m.content) {
              <div class="bubble md" [innerHTML]="m.content | md"></div>
            } @else if (m.streaming) {
              <div class="bubble typing"><span></span><span></span><span></span></div>
            }
            @if (m.role === 'assistant' && !m.streaming && m.content) {
              <div class="meta row">
                <button class="ghost small" (click)="voice.speak(m.content)">🔊</button>
                <button class="ghost small" (click)="copy(m.content)">⧉</button>
                @if (m.brain === 'cloud') { <span class="chip violet">cloud</span> }
              </div>
            }
          </div>
        }
        @if (jarvis.status()) { <div class="small muted center">{{ jarvis.status() }}</div> }
        @if (jarvis.error()) { <div class="banner err">{{ jarvis.error() }} <a routerLink="/diagnostics">Run diagnostics →</a></div> }
      </div>

      <form class="composer row" (ngSubmit)="send()">
        <button type="button" class="icon" [class.primary]="voice.state() === 'listening'" (click)="dictate()" aria-label="Dictate">🎙</button>
        <textarea name="draft" [(ngModel)]="draft" rows="1" placeholder="Ask, command, capture…" (keydown.enter)="onEnter($event)" #box></textarea>
        @if (jarvis.busy()) { <button type="button" class="danger icon" (click)="jarvis.stop()" aria-label="Stop">■</button> }
        @else { <button type="submit" class="primary icon" [disabled]="!draft.trim()" aria-label="Send">➤</button> }
      </form>
    </div>
  `,
  styles: [`
    .chat { display: flex; flex-direction: column; height: 100vh; height: 100dvh; padding-top: var(--safe-top); }
    .head { padding: 10px 12px; border-bottom: 1px solid var(--line); background: rgba(5,9,14,.85); }
    .ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .drawer { position: absolute; top: calc(60px + var(--safe-top)); left: 10px; right: 10px; z-index: 30; max-height: 60vh; overflow-y: auto; }
    .left { justify-content: flex-start; text-align: left; flex-direction: column; align-items: flex-start; }
    .scroll { flex: 1; overflow-y: auto; padding: 14px 12px 20px; display: flex; flex-direction: column; gap: 12px; }
    .welcome { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; margin-top: 10vh; }
    .sug { text-align: left; justify-content: flex-start; }
    .msg { display: flex; flex-direction: column; gap: 4px; max-width: 92%; }
    .msg.user { align-self: flex-end; align-items: flex-end; }
    .bubble { padding: 10px 13px; border-radius: 14px; background: var(--panel); border: 1px solid var(--line); word-wrap: break-word; overflow-wrap: anywhere; }
    .user .bubble { background: rgba(var(--accent-rgb), .14); border-color: var(--line-strong); }
    .tools { display: flex; flex-wrap: wrap; gap: 4px; }
    .tool summary { list-style: none; cursor: pointer; }
    .tool .pre, .think .pre { white-space: pre-wrap; background: rgba(0,0,0,.35); border-radius: 8px; padding: 6px 8px; margin-top: 4px; max-height: 200px; overflow-y: auto; }
    .meta { gap: 2px; }
    .meta button { min-height: 28px; padding: 2px 6px; }
    .typing span { display: inline-block; width: 7px; height: 7px; margin: 0 2px; border-radius: 50%; background: var(--cyan); animation: pulse 1s infinite; }
    .typing span:nth-child(2) { animation-delay: .2s; } .typing span:nth-child(3) { animation-delay: .4s; }
    .center { text-align: center; }
    .composer { padding: 8px 10px calc(74px + var(--safe-bottom)); border-top: 1px solid var(--line); background: rgba(5,9,14,.92); align-items: flex-end; }
    .composer textarea { min-height: 42px; max-height: 140px; resize: none; }
  `],
})
export class ChatPage {
  jarvis = inject(JarvisService);
  store = inject(StoreService);
  voice = inject(VoiceService);
  draft = '';
  readonly drawer = signal(false);
  private scroller = viewChild<ElementRef<HTMLDivElement>>('scroller');
  readonly suggestions = [
    'What should I focus on right now?',
    'Plan my day',
    'Add a task: call the bank tomorrow, urgent',
    'Remind me in 30 minutes to stretch',
    'Start a 25 minute focus on my first MIT',
    'What do you remember about me?',
  ];

  constructor() {
    effect(() => {
      this.jarvis.messages();
      queueMicrotask(() => { const el = this.scroller()?.nativeElement; if (el) el.scrollTop = el.scrollHeight; });
    });
  }

  async send(text?: string) {
    const t = (text ?? this.draft).trim();
    if (!t) return;
    this.draft = '';
    await this.jarvis.send(t);
  }

  onEnter(e: Event) {
    const k = e as KeyboardEvent;
    if (!k.shiftKey) { k.preventDefault(); this.send(); }
  }

  async dictate() {
    if (this.voice.state() === 'listening') { await this.voice.stopListening(); return; }
    const heard = await this.voice.listen();
    if (heard) this.draft = (this.draft ? this.draft + ' ' : '') + heard;
  }

  async open(id: string) { await this.jarvis.open(id); this.drawer.set(false); }

  toggleThink() { this.store.updateSettings({ deepThink: !this.store.settings().deepThink }); }

  copy(text: string) { navigator.clipboard?.writeText(text).catch(() => undefined); }
}
