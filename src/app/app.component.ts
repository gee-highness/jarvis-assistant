import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { App } from '@capacitor/app';
import { filter } from 'rxjs';
import { FocusService } from './core/focus.service';
import { JarvisService } from './core/jarvis.service';
import { McpService } from './core/mcp.service';
import { MemoryService } from './core/memory.service';
import { JarvisDevice, isNative } from './core/native';
import { NotifyService } from './core/notify.service';
import { NudgeService } from './core/nudge.service';
import { LlmService } from './core/llm.service';
import { ProgressService } from './core/progress.service';
import { OllamaService } from './core/ollama.service';
import { StoreService } from './core/store.service';
import { speakable } from './core/util';
import { QuickChatComponent, QuickMode } from './ui/quick-chat.component';
import { VoiceOverlayComponent } from './ui/voice-overlay.component';

@Component({
  selector: 'j-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, VoiceOverlayComponent, QuickChatComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.ready()) {
      <router-outlet />

      @if (focus.current(); as f) {
        <a class="focus-bar" routerLink="/focus">
          <span class="dot online"></span>
          <span class="grow ellipsis">{{ f.session.kind === 'focus' ? 'Focusing' : 'Break' }} · {{ f.session.label }}</span>
          <span class="mono">{{ remaining() }}</span>
        </a>
      }

      @if (jarvis.pendingConfirm(); as pc) {
        @if (!voiceOpen()) {
          <div class="scrim">
            <div class="card glow dialog">
              <div class="upper">Confirm action</div>
              <p>{{ pc.question }}</p>
              <div class="row"><button class="grow" (click)="pc.resolve(false)">Cancel</button><button class="primary grow" (click)="pc.resolve(true)">Confirm</button></div>
            </div>
          </div>
        }
      }

      <button class="fab" (click)="openVoice()" aria-label="Talk to Jarvis">
        <svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"/></svg>
      </button>

      <nav class="nav">
        <a routerLink="/briefing" routerLinkActive="on"><span>◎</span>Brief</a>
        <a routerLink="/chat" routerLinkActive="on"><span>◈</span>Chat</a>
        <a routerLink="/tasks" routerLinkActive="on"><span>☑</span>Tasks</a>
        <a routerLink="/focus" routerLinkActive="on"><span>◔</span>Focus</a>
        <button [class.on]="moreOpen() || moreActive()" (click)="moreOpen.set(!moreOpen())"><span>⋯</span>More</button>
      </nav>

      @if (moreOpen()) {
        <div class="scrim" (click)="moreOpen.set(false)">
          <div class="sheet" (click)="$event.stopPropagation()">
            @for (l of moreLinks; track l.path) {
              <a [routerLink]="l.path" (click)="moreOpen.set(false)"><span>{{ l.icon }}</span>{{ l.label }}</a>
            }
          </div>
        </div>
      }

      <div class="toasts" aria-live="polite">
        @for (c of progress.celebrations(); track c.id) {
          <button class="toast" [class]="'toast ' + c.kind" (click)="progress.dismiss(c.id)">
            <span class="ti">{{ c.icon }}</span>
            <span class="grow"><b>{{ c.title }}</b>@if (c.detail) { <small>{{ c.detail }}</small> }</span>
            @if (c.xp) { <span class="chip small green">+{{ c.xp }} XP</span> }
          </button>
        }
      </div>
      @if (progress.levelUp(); as lu) {
        <div class="scrim lvl" (click)="progress.levelUp.set(null)">
          <div class="card glow dialog lvlbox"><div class="lvlnum">{{ lu.level }}</div><div class="upper">Level up</div><h2>{{ lu.title }}</h2><p class="small muted">Well earned, sir. Tap to continue.</p></div>
        </div>
      }

      @if (quick(); as q) {
        <j-quick-chat [mode]="q.mode" [preset]="q.preset" (closed)="quick.set(null)" (voice)="quick.set(null); openVoice()" />
      }
      @if (voiceOpen()) { <j-voice-overlay (closed)="voiceOpen.set(false)" /> }
    } @else {
      <div class="boot"><div class="upper">Initialising J.A.R.V.I.S.</div></div>
    }
  `,
  styles: [`
    .toasts { position: fixed; top: calc(10px + var(--safe-top, 0px)); left: 0; right: 0; z-index: 60; display: flex; flex-direction: column; align-items: center; gap: 6px; pointer-events: none; }
    .toast { pointer-events: auto; display: flex; align-items: center; gap: 10px; width: min(92vw, 420px); text-align: left; padding: 10px 14px; border-radius: 14px;
      background: var(--panel-solid); border: 1px solid rgba(74,222,128,.5); color: inherit; box-shadow: 0 8px 30px -8px rgba(34,211,238,.5); animation: tin .3s cubic-bezier(.2,.9,.3,1.3); }
    .toast small { display: block; opacity: .7; } .toast .ti { font-size: 1.4rem; }
    .toast.level, .toast.achievement, .toast.perfect { border-color: rgba(250,204,21,.7); }
    .lvlbox { text-align: center; animation: tin .4s cubic-bezier(.2,.9,.3,1.4); } .lvlnum { font-size: 4rem; font-weight: 700; color: var(--cyan); }
    @keyframes tin { from { transform: translateY(-16px) scale(.96); opacity: 0; } to { transform: none; opacity: 1; } }
    .nav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; display: grid; grid-template-columns: repeat(5, 1fr);
      background: rgba(5, 9, 14, .94); border-top: 1px solid var(--line); backdrop-filter: blur(14px); padding: 6px 4px calc(6px + var(--safe-bottom)); }
    .nav a, .nav button { display: flex; flex-direction: column; align-items: center; gap: 1px; font-size: .7rem; color: var(--dim); text-decoration: none;
      background: none; border: none; min-height: 48px; padding: 4px 0; letter-spacing: .04em; }
    .nav span { font-size: 1.2rem; line-height: 1.1; }
    .nav .on { color: var(--cyan); text-shadow: 0 0 10px rgba(34,211,238,.6); }
    .fab { position: fixed; right: 18px; bottom: calc(76px + var(--safe-bottom)); z-index: 21; width: 62px; height: 62px; border-radius: 50%;
      background: radial-gradient(circle at 50% 40%, #67e8f9, #0891b2); color: #04121a; border: 2px solid rgba(255,255,255,.25);
      box-shadow: 0 0 24px rgba(34,211,238,.55), 0 6px 18px rgba(0,0,0,.5); padding: 0; }
    .focus-bar { position: fixed; left: 12px; right: 90px; bottom: calc(84px + var(--safe-bottom)); z-index: 19; display: flex; align-items: center; gap: 8px;
      background: var(--panel-solid); border: 1px solid var(--line-strong); border-radius: 12px; padding: 10px 12px; color: var(--text); text-decoration: none; box-shadow: var(--glow); font-size: .88rem; }
    .ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .scrim { position: fixed; inset: 0; z-index: 40; background: rgba(0,0,0,.55); display: flex; align-items: flex-end; justify-content: center; }
    .sheet { width: 100%; max-width: 560px; background: var(--panel-solid); border: 1px solid var(--line); border-radius: 18px 18px 0 0;
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 16px 16px calc(84px + var(--safe-bottom)); }
    .sheet a { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px 4px; border-radius: 12px; border: 1px solid var(--line);
      color: var(--text); text-decoration: none; font-size: .85rem; background: rgba(34,211,238,.04); }
    .sheet a span { font-size: 1.4rem; color: var(--cyan); }
    .dialog { width: calc(100% - 32px); max-width: 480px; margin-bottom: 30vh; }
    .boot { height: 100vh; display: grid; place-items: center; }
  `],
})
export class AppComponent implements OnInit {
  store = inject(StoreService);
  focus = inject(FocusService);
  jarvis = inject(JarvisService);
  private memory = inject(MemoryService);
  private notify = inject(NotifyService);
  private nudges = inject(NudgeService);
  private mcp = inject(McpService);
  private ollama = inject(OllamaService);
  private llm = inject(LlmService);
  readonly progress = inject(ProgressService);
  private router = inject(Router);

  readonly voiceOpen = signal(false);
  readonly quick = signal<{ mode: QuickMode; preset: string | null } | null>(null);
  readonly moreOpen = signal(false);
  private url = signal('');
  readonly moreLinks = [
    { path: '/planner', label: 'Planner', icon: '▤' },
    { path: '/habits', label: 'Habits', icon: '↻' },
    { path: '/review', label: 'Review', icon: '✎' },
    { path: '/memory', label: 'Memory', icon: '⌬' },
    { path: '/voices', label: 'Voices', icon: '♫' },
    { path: '/progress', label: 'Progress', icon: '★' },
    { path: '/brain', label: 'Brain', icon: '◎' },
    { path: '/settings', label: 'Settings', icon: '⚙' },
  ];
  readonly moreActive = computed(() => this.moreLinks.some(l => this.url().startsWith(l.path)));
  readonly remaining = computed(() => {
    const ms = this.focus.remainingMs();
    const m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000);
    return `${m}:${String(s).padStart(2, '0')}`;
  });

  private lastAction = { action: '', at: 0 };

  constructor() {
    // keep the wide home-screen widget showing the next priority
    effect(() => {
      if (!this.store.ready()) return;
      const mit = this.store.mits()[0];
      const line = mit ? `Next: ${mit.title}` : this.store.openTasks().length ? `${this.store.openTasks().length} open tasks · tap mic to plan` : 'All clear, sir';
      JarvisDevice.updateWidget({ line }).catch(() => undefined);
    });
    // keep the chat widget showing the latest exchange and the brain's status
    effect(() => {
      if (!this.store.ready() || this.jarvis.busy()) return;
      const msgs = this.jarvis.messages();
      const a = [...msgs].reverse().find(m => m.role === 'assistant' && m.content && !m.streaming);
      const q = a ? [...msgs].reverse().find(m => m.role === 'user' && m.createdAt <= a.createdAt) : undefined;
      const st = this.ollama.state();
      const status = this.llm.loading() ? 'Loading brain…' : st === 'online' ? 'Ready · on-device' : st === 'offline' ? 'Brain offline' : 'Ready';
      JarvisDevice.updateChatWidget({
        question: q ? q.content.slice(0, 140) : '',
        answer: a ? speakable(a.content).slice(0, 600) : `At your service, ${this.store.settings().honorific}. Tap below to ask anything.`,
        status,
      }).catch(() => undefined);
    });
  }

  async ngOnInit(): Promise<void> {
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(e => this.url.set((e as NavigationEnd).urlAfterRedirects));
    await this.store.init();
    await Promise.all([this.memory.init(), this.jarvis.init()]);
    this.progress.init(() => this.memory.memories().length).catch(() => undefined);
    this.notify.init().catch(() => undefined);
    this.nudges.start();
    this.mcp.connectAll().catch(() => undefined);
    // warm up the brain in the background so the first question is fast
    this.llm.init().then(() => this.jarvis.ensureEngine()).then(ok => {
      if (!ok) return;
      if (this.store.settings().engine === 'ollama') this.ollama.listModels().catch(() => undefined);
      this.memory.reindexStale().catch(() => undefined);
    }).catch(() => undefined);
    if (!this.store.settings().onboarded) this.router.navigateByUrl('/settings?setup=1');

    // widget / shortcut / deep-link launch actions
    const first = await JarvisDevice.getLaunchAction().catch(() => ({ action: null }));
    if (first.action) this.handleAction(first.action);
    JarvisDevice.addListener('launchAction', e => this.handleAction(e.action)).catch(() => undefined);
    if (isNative()) {
      App.addListener('appUrlOpen', e => {
        const m = e.url.match(/^jarvis:\/\/([\w:]+)/);
        if (m) this.handleAction(m[1]);
      });
      App.addListener('backButton', ({ canGoBack }) => {
        if (this.quick()) this.quick.set(null);
        else if (this.voiceOpen()) this.voiceOpen.set(false);
        else if (this.moreOpen()) this.moreOpen.set(false);
        else if (canGoBack && !this.url().startsWith('/briefing')) history.back();
        else App.minimizeApp();
      });
      App.addListener('resume', () => { this.jarvis.ensureEngine().catch(() => undefined); });
    }
  }

  openVoice() { this.moreOpen.set(false); this.voiceOpen.set(true); }

  private handleAction(action: string) {
    // the same launch can arrive via several channels; act once
    if (this.lastAction.action === action && Date.now() - this.lastAction.at < 2000) return;
    this.lastAction = { action, at: Date.now() };
    switch (action) {
      case 'voice': this.openVoice(); break;
      case 'task': this.router.navigateByUrl('/tasks?add=1'); break;
      case 'focus': this.router.navigateByUrl('/focus?start=1'); break;
      case 'brief': this.router.navigateByUrl('/briefing?brief=1'); break;
      case 'chat': this.voiceOpen.set(false); this.quick.set({ mode: 'chat', preset: null }); break;
      case 'chatvoice': this.quick.set(null); this.openVoice(); break;
      case 'chat:next': this.quick.set({ mode: 'chat', preset: "What's my next move? Look at my tasks and priorities and give me one concrete next action." }); break;
      case 'chat:plan': this.quick.set({ mode: 'chat', preset: 'Plan my day: time-block my remaining tasks around my work hours and tell me the plan briefly.' }); break;
      case 'chat:capture': this.quick.set({ mode: 'capture', preset: null }); break;
    }
  }
}
