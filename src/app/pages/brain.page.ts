import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { JarvisService } from '../core/jarvis.service';
import { LlmService } from '../core/llm.service';
import { DEVICE_EMBED_MODEL, DEVICE_MODELS, DeviceModel, EngineKind, deviceModelFile } from '../core/models';
import { JarvisDevice, isNative } from '../core/native';
import { OllamaService } from '../core/ollama.service';
import { StoreService } from '../core/store.service';
import { MemoryService } from '../core/memory.service';

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Brain</h1>
        <span class="chip" [class.green]="llm.info()?.loaded" [class.gold]="llm.loading()">
          {{ llm.loading() ? 'loading…' : llm.info()?.loaded ? 'ready' : 'idle' }}
        </span>
      </div>

      <div class="tabs">
        @for (e of engines; track e.id) {
          <button [class.on]="s().engine === e.id" (click)="setEngine(e.id)">{{ e.label }}</button>
        }
      </div>

      @if (s().engine === 'ollama') {
        <div class="card col">
          <p class="small muted" style="margin:0">Jarvis talks to an Ollama server (Termux on this phone, or a PC on your Wi-Fi). Configure it in <a routerLink="/settings">Settings → Engine</a>.</p>
        </div>
      } @else {
        @if (!llm.available() && isNative) {
          <div class="banner err">The on-device engine could not start on this phone: {{ llm.status()?.error }}. Use Ollama or a cloud brain instead.</div>
        }
        @if (!isNative) {
          <div class="banner">The built-in engine runs in the Android app. In the browser, use Ollama or a cloud brain.</div>
        }

        <!-- phone -->
        <div class="card row phone">
          <div class="grow">
            <div class="upper">Your phone</div>
            <div class="small muted">{{ ramGb() }} GB RAM · {{ freeGb() }} GB free · {{ llm.status()?.cores ?? '?' }} cores</div>
          </div>
          <div class="right">
            <div class="upper">Best fit</div>
            <div class="small"><b>{{ llm.recommended().name }}</b></div>
          </div>
        </div>

        <!-- active model -->
        @if (llm.active(); as a) {
          <div class="card col glow">
            <div class="row between">
              <div>
                <div class="upper">Active brain</div>
                <b>{{ a.name }}</b>
              </div>
              @if (llm.activeInstalled()) {
                <button class="small" [disabled]="llm.loading()" (click)="reload()">{{ llm.info()?.loaded ? '↻ Reload' : '▶ Load' }}</button>
              }
            </div>
            @if (llm.info(); as i) {
              @if (i.loaded) {
                <div class="stats small">
                  <span class="chip cyan">{{ i.n_ctx }} ctx</span>
                  <span class="chip">{{ i.threads }} threads</span>
                  @if (i.kv_q8) { <span class="chip">8-bit cache</span> }
                  @if (i.caps?.['supports_tool_calls']) { <span class="chip green">native tools</span> } @else { <span class="chip gold">text tools</span> }
                  @if (i.supports_thinking) { <span class="chip violet">deep think</span> }
                  @if (llm.lastTps()) { <span class="chip">{{ llm.lastTps() }} tok/s</span> }
                </div>
              }
            }
            @if (llm.loadError()) { <div class="banner err small">{{ llm.loadError() }}</div> }
            @if (!llm.activeInstalled()) { <div class="small muted">Not downloaded yet. Pick a model below.</div> }
            <div class="row">
              <button class="small" [disabled]="speedBusy() || !llm.activeInstalled()" (click)="speed()">⏱ Speed test</button>
              <span class="small muted">{{ speedResult() }}</span>
            </div>
            <div class="row wrap" style="margin-top:6px">
              <button class="small" [disabled]="capBusy() || !llm.activeInstalled()" (click)="capability()">🧪 Capability test</button>
              <span class="small muted">{{ capResult() }}</span>
            </div>
          </div>
        }

        <!-- catalog -->
        <div class="upper" style="margin:6px 2px 0">Models · all uncensored, all offline</div>
        @for (m of models; track m.id) {
          <div class="card col model" [class.active]="s().deviceModel === m.id" [class.heavy]="tooHeavy(m)">
            <div class="row between">
              <div class="grow">
                <div class="row" style="gap:6px">
                  <b class="name">{{ m.name }}</b>
                  <span class="chip small">{{ m.params }}</span>
                  @if (m.id === llm.recommended().id) { <span class="chip green small">best for your phone</span> }
                  @if (s().deviceModel === m.id) { <span class="chip cyan small">active</span> }
                </div>
                <div class="small dim">{{ m.family }} · {{ m.quant }} · {{ size(m.sizeMb) }} · needs {{ m.minRamGb }} GB+</div>
              </div>
            </div>
            <div class="small muted">{{ m.blurb }}</div>
            <div class="row wrap" style="gap:6px">
              @for (t of m.strengths; track t) { <span class="tag">{{ t }}</span> }
            </div>
            @if (tooHeavy(m)) { <div class="small" style="color:var(--gold)">⚠ Probably too heavy for this phone. It may crash or be very slow.</div> }

            @if (llm.downloads()[m.id]; as d) {
              <div class="progress"><div [style.width.%]="pct(d.received, d.total)"></div></div>
              <div class="row between small">
                <span class="muted">{{ dlLabel(d.status) }} · {{ mb(d.received) }} / {{ mb(d.total) }} MB {{ d.error ? '· ' + d.error : '' }}</span>
                @if (d.status === 'error') { <button class="small" (click)="download(m)">Retry</button> }
                @else if (d.status !== 'done') { <button class="small" (click)="llm.cancel(m.id)">Cancel</button> }
              </div>
            } @else {
              <div class="row">
                @if (llm.has(file(m))) {
                  @if (s().deviceModel !== m.id) { <button class="small primary" (click)="use(m.id)">Use this brain</button> }
                  <button class="small danger" (click)="remove(file(m), m.name)">Delete</button>
                } @else {
                  <button class="small primary" [disabled]="!llm.available()" (click)="download(m)">⬇ Download {{ size(m.sizeMb) }}</button>
                }
              </div>
            }
          </div>
        }

        <!-- memory engine -->
        <div class="card col">
          <div class="row between">
            <div><b>{{ embed.name }}</b> <span class="small dim">{{ embed.family }} · {{ embed.sizeMb }} MB</span></div>
            <label class="row small"><input type="checkbox" [ngModel]="s().deviceEmbed" (ngModelChange)="save({ deviceEmbed: $event })"> on</label>
          </div>
          <div class="small muted">Lets Jarvis find relevant memories by meaning, not just keywords. Tiny and fast.</div>
          @if (llm.downloads()[embed.id]; as d) {
            <div class="progress"><div [style.width.%]="pct(d.received, d.total)"></div></div>
            <div class="small muted">{{ dlLabel(d.status) }} {{ d.error ?? '' }}</div>
          } @else if (!llm.embedInstalled()) {
            <button class="small" [disabled]="!llm.available()" (click)="downloadEmbed()">⬇ Download ({{ embed.sizeMb }} MB)</button>
          } @else {
            <div class="row"><span class="chip green">installed</span><button class="small danger" (click)="remove(embed.dest, embed.name)">Delete</button></div>
          }
        </div>

        <!-- imported -->
        <div class="card col">
          <div class="row between"><b>Your own models</b><button class="small" [disabled]="!llm.available() || importing()" (click)="importGguf()">{{ importing() ? 'Importing…' : '＋ Import .gguf' }}</button></div>
          <div class="small muted">Any GGUF chat model works: copy it to your phone and import it here.</div>
          @for (f of llm.imported(); track f.file) {
            <div class="item small">
              <div class="grow"><div class="mono ellipsis">{{ f.file }}</div><div class="dim">{{ mb(f.size) }} MB</div></div>
              @if (s().deviceModel !== 'file:' + f.file) { <button class="small primary" (click)="use('file:' + f.file)">Use</button> }
              @else { <span class="chip cyan">active</span> }
              <button class="small danger" (click)="remove(f.file, f.file)" aria-label="Delete model">✕</button>
            </div>
          }
        </div>

        <!-- advanced -->
        <div class="card col">
          <b>Performance</b>
          <div class="grid2">
            <label class="field">Context (memory window)
              <select [ngModel]="s().deviceCtx" (ngModelChange)="save({ deviceCtx: +$event })">
                <option [ngValue]="0">Auto ({{ llm.ctxFor(llm.active()) }})</option>
                @for (c of ctxOptions; track c) { <option [ngValue]="c">{{ c }} tokens</option> }
              </select>
            </label>
            <label class="field">CPU threads
              <select [ngModel]="s().deviceThreads" (ngModelChange)="save({ deviceThreads: +$event })">
                <option [ngValue]="0">Auto ({{ llm.status()?.defaultThreads ?? '?' }})</option>
                @for (t of threadOptions; track t) { <option [ngValue]="t">{{ t }}</option> }
              </select>
            </label>
          </div>
          <label class="row small"><input type="checkbox" [ngModel]="s().wifiOnly" (ngModelChange)="save({ wifiOnly: $event })"> Download models on Wi-Fi only</label>
          <p class="small dim" style="margin:0">Larger context remembers more of the chat but uses more RAM. Changes apply on the next message.</p>
        </div>
      }
      @if (msg()) { <div class="banner" [class.err]="msgErr()">{{ msg() }}</div> }
    </div>
  `,
  styles: [`
    .phone .right { text-align: right; }
    .model { gap: 8px; transition: border-color .2s, transform .2s; }
    .model.active { border-color: rgba(34,211,238,.55); box-shadow: 0 0 0 1px rgba(34,211,238,.25), 0 8px 30px -12px rgba(34,211,238,.45); }
    .model.heavy { opacity: .8; }
    .model .name { font-size: 1.05rem; letter-spacing: .02em; }
    .tag { font-size: .72rem; padding: 2px 8px; border-radius: 999px; background: rgba(34,211,238,.08); border: 1px solid rgba(34,211,238,.2); color: var(--muted); }
    .stats { display: flex; flex-wrap: wrap; gap: 6px; }
    .progress { height: 6px; border-radius: 3px; background: rgba(34,211,238,.12); overflow: hidden; }
    .progress div { height: 100%; background: linear-gradient(90deg, var(--cyan), #7dd3fc); transition: width .4s; }
  `],
})
export class BrainPage implements OnInit {
  readonly llm = inject(LlmService);
  private store = inject(StoreService);
  private ollama = inject(OllamaService);
  private jarvis = inject(JarvisService);
  private memory = inject(MemoryService);

  readonly isNative = isNative();
  readonly s = computed(() => this.store.settings());
  readonly models = DEVICE_MODELS;
  readonly embed = DEVICE_EMBED_MODEL;
  readonly engines: { id: EngineKind; label: string }[] = [{ id: 'device', label: 'Built-in (recommended)' }, { id: 'ollama', label: 'Ollama' }];
  readonly ctxOptions = [2048, 4096, 6144, 8192, 12288, 16384];
  readonly threadOptions = [2, 3, 4, 5, 6, 8];
  readonly msg = signal('');
  readonly msgErr = signal(false);
  readonly speedBusy = signal(false);
  readonly speedResult = signal('');
  readonly capBusy = signal(false);
  readonly capResult = signal('');
  readonly importing = signal(false);
  readonly ramGb = computed(() => ((this.llm.status()?.ramTotalMb ?? 0) / 1024).toFixed(1));
  readonly freeGb = computed(() => ((this.llm.status()?.freeBytes ?? 0) / 1073741824).toFixed(1));

  async ngOnInit() { await this.llm.init(); await this.llm.refresh(); }

  save(p: Parameters<StoreService['updateSettings']>[0]) { this.store.updateSettings(p); }
  file(m: DeviceModel) { return deviceModelFile(m); }
  size(mb: number) { return mb >= 1000 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`; }
  mb(bytes: number) { return bytes > 0 ? Math.round(bytes / 1048576) : 0; }
  pct(a: number, b: number) { return b > 0 ? Math.min(100, (a / b) * 100) : 0; }
  tooHeavy(m: DeviceModel) { const r = this.llm.status()?.ramTotalMb ?? 0; return r > 0 && r / 1024 + 0.5 < m.minRamGb; }
  dlLabel(s: string) { return ({ pending: 'Starting', running: 'Downloading', paused: 'Paused', done: 'Installed', error: 'Failed', cancelled: 'Cancelled' } as Record<string, string>)[s] ?? s; }
  private note(t: string, err = false) { this.msg.set(t); this.msgErr.set(err); }

  setEngine(engine: EngineKind) {
    this.save({ engine });
    this.ollama.checkLocal().catch(() => undefined);
    JarvisDevice.haptic({ kind: 'tick' }).catch(() => undefined);
  }

  async download(m: DeviceModel) {
    try {
      await this.llm.download(m);
      this.note(`Downloading ${m.name}. It continues in the background; you'll get a notification.`);
      if (!this.llm.has(this.llm.active()?.file ?? '')) this.save({ deviceModel: m.id });
      if (this.s().deviceEmbed && !this.llm.embedInstalled() && !this.llm.downloads()[this.embed.id]) this.llm.downloadEmbed().catch(() => undefined);
    } catch (e: any) { this.note(`Download failed: ${e?.message ?? e}`, true); }
  }

  async downloadEmbed() {
    try { await this.llm.downloadEmbed(); } catch (e: any) { this.note(`Download failed: ${e?.message ?? e}`, true); }
  }

  async use(id: string) {
    this.save({ deviceModel: id });
    JarvisDevice.haptic({ kind: 'light' }).catch(() => undefined);
    await this.reload();
  }

  async reload() {
    try {
      this.note('Loading the brain…');
      await this.llm.ensureLoaded();
      this.ollama.state.set('online');
      this.note(`${this.llm.active()?.name} is ready, sir.`);
      this.memory.reindexStale().catch(() => undefined);
    } catch (e: any) { this.note(e?.message ?? String(e), true); }
  }

  async remove(file: string, name: string) {
    if (!confirm(`Delete ${name}? You can download it again later.`)) return;
    try { await this.llm.remove(file); this.note(`${name} deleted.`); } catch (e: any) { this.note(e?.message ?? String(e), true); }
  }

  async importGguf() {
    this.importing.set(true);
    try {
      const f = await this.llm.importModel();
      if (f) { this.note(`Imported ${f}. Tap Use to switch to it.`); }
    } catch (e: any) { this.note(e?.message ?? String(e), true); }
    finally { this.importing.set(false); }
  }

  /** Checks that the active model can actually call tools and follow the persona. */
  async capability() {
    this.capBusy.set(true); this.capResult.set('Testing…');
    const tool = { type: 'function' as const, function: { name: 'add_task', description: 'Create a task', parameters: { type: 'object' as const, properties: { title: { type: 'string', description: 'Task title' }, due: { type: 'string', description: 'Due date' } }, required: ['title'] } } };
    const cases: [string, (r: { content: string; toolCalls: { function: { name: string; arguments: unknown } }[] }) => boolean][] = [
      ['Add a task to call the dentist tomorrow', r => r.toolCalls.some(c => c.function.name === 'add_task' && /dentist/i.test(JSON.stringify(c.function.arguments)))],
      ['Remind me nothing. Just say hello in one short sentence.', r => r.toolCalls.length === 0 && r.content.trim().length > 0],
      ['Create a task: buy milk', r => r.toolCalls.some(c => c.function.name === 'add_task' && /milk/i.test(JSON.stringify(c.function.arguments)))],
    ];
    let pass = 0; const t0 = Date.now();
    try {
      await this.jarvis.ensureEngine();
      for (const [prompt, ok] of cases) {
        const r = await this.ollama.chat([{ role: 'system', content: 'You are a task assistant. Use tools when an action is requested.' }, { role: 'user', content: prompt }], { tools: [tool], think: false, temperature: 0.1, background: false, maxTokens: 120 });
        if (ok(r)) pass++;
      }
      const secs = Math.round((Date.now() - t0) / 1000);
      this.capResult.set(`${pass}/${cases.length} passed in ${secs}s ${pass === cases.length ? '· tools work' : pass > 0 ? '· mostly works; a bigger model is more reliable' : '· poor tool use, try a larger model'}`);
    } catch (e: any) { this.capResult.set(e?.message ?? 'Failed'); }
    finally { this.capBusy.set(false); }
  }

  async speed() {
    this.speedBusy.set(true); this.speedResult.set('Running…');
    try {
      const t = await this.ollama.speedTest();
      this.speedResult.set(`${t} tokens/sec ${t >= 8 ? '· smooth' : t >= 4 ? '· usable' : '· slow, try a smaller model'}`);
    } catch (e: any) { this.speedResult.set(e?.message ?? 'Failed'); }
    finally { this.speedBusy.set(false); }
  }
}
