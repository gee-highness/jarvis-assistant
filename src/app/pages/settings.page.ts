import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { JarvisService } from '../core/jarvis.service';
import { McpService } from '../core/mcp.service';
import { CLOUD_PRESETS, CloudProvider, CloudSettings, DEFAULT_PERSONA, McpServer, RECOMMENDED_MODELS, Settings } from '../core/models';
import { JarvisDevice, isNative } from '../core/native';
import { NotifyService } from '../core/notify.service';
import { LlmService } from '../core/llm.service';
import { OllamaService } from '../core/ollama.service';
import { StoreService } from '../core/store.service';
import { uid } from '../core/util';
import { VoiceService } from '../core/voice.service';

@Component({
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Settings</h1><span class="chip" [class.green]="ollama.state() === 'online'" [class.red]="ollama.state() === 'offline'">engine {{ ollama.state() }}</span></div>

      <!-- ============ SETUP ============ -->
      @if (setup() || !s().onboarded) {
        <div class="card glow col">
          <div class="upper">Setup checklist</div>
          @if (s().brain !== 'llm') {
            <div class="step ok">
              <b>1. Brain</b>
              <p class="small muted">Jarvis runs on Reflex: instant, fully offline, no model download needed. You can switch to a language model any time under Brain.</p>
            </div>
          } @else if (s().engine === 'device') {
            <div class="step" [class.ok]="llm.activeInstalled()">
              <b>1. Download a brain</b>
              <p class="small muted">Jarvis runs a private AI model on this phone: no internet, no account. One download, then fully offline. Best fit for your phone: <b>{{ llm.recommended().name }}</b> ({{ llm.recommended().sizeMb >= 1000 ? (llm.recommended().sizeMb / 1024).toFixed(1) + ' GB' : llm.recommended().sizeMb + ' MB' }}).</p>
              <div class="row wrap">
                @if (!llm.activeInstalled() && !llm.downloads()[llm.recommended().id]) { <button class="small primary" [disabled]="!llm.available()" (click)="quickDownload()">⬇ Download {{ llm.recommended().name }}</button> }
                @if (llm.downloads()[llm.recommended().id]; as d) { <span class="small muted">{{ d.status }} · {{ (d.received / 1048576).toFixed(0) }} / {{ (d.total / 1048576).toFixed(0) }} MB</span> }
                <button class="small" (click)="go('/brain')">Choose another</button>
              </div>
            </div>
          } @else {
            <div class="step" [class.ok]="ollama.state() === 'online'">
              <b>1. AI engine (Ollama in Termux)</b>
              <p class="small muted">Install <b>Termux</b> from F-Droid, open it and paste:</p>
              <pre class="mono small cmd">{{ termuxCmd }}</pre>
              <div class="row wrap"><button class="small" (click)="copy(termuxCmd)">⧉ Copy</button><button class="small" (click)="test()">Test connection</button>
                @if (isNative) { <button class="small" (click)="wake()">Wake engine</button> }</div>
            </div>
            <div class="step" [class.ok]="hasChat()">
              <b>2. Download the brain</b>
              <p class="small muted">Downloads <span class="mono">{{ s().chatModel }}</span> (~2 GB) and <span class="mono">{{ s().embedModel }}</span>. Use Wi-Fi; after this everything works offline.</p>
              <button class="small" [disabled]="!!pulling() || ollama.state() !== 'online'" (click)="pullDefaults()">⬇ Download models</button>
            </div>
          }
          <div class="step" [class.ok]="micOk()">
            <b>{{ s().engine === 'device' ? 2 : 3 }}. Microphone and offline speech</b>
            <p class="small muted">Allow the microphone. In Android Settings → Google → Speech, download the offline pack for {{ s().voice.language }}.</p>
            <button class="small" (click)="mic()">Allow microphone</button>
          </div>
          <div class="step">
            <b>{{ s().engine === 'device' ? 3 : 4 }}. Pick a voice, add the widgets</b>
            <p class="small muted">Choose an offline voice in Voices. Long-press your home screen → Widgets → Jarvis (mic, priority bar and chat).</p>
            <button class="small" (click)="go('/voices')">Open Voices</button>
          </div>
          <label class="field">What should Jarvis call you?<input [ngModel]="s().userName" (ngModelChange)="save({ userName: $event })" placeholder="Your name"></label>
          <button class="primary" (click)="finishSetup()">Done</button>
        </div>
      }

      <!-- ============ ENGINE & MODELS ============ -->
      <div class="card col">
        <div class="card-head"><h2>Engine</h2>
          <div class="tabs small-tabs">
            <button [class.on]="s().engine === 'device'" (click)="save({ engine: 'device' })">Built-in</button>
            <button [class.on]="s().engine === 'ollama'" (click)="save({ engine: 'ollama' }); refreshModels()">Ollama</button>
          </div>
        </div>
        @if (s().engine === 'device') {
          <div class="row between">
            <div class="small"><b>{{ llm.active()?.name ?? 'No model selected' }}</b><div class="dim">{{ llm.activeInstalled() ? (llm.info()?.loaded ? 'Loaded and ready' : 'Installed') : 'Not downloaded' }}</div></div>
            <button class="small primary" (click)="go('/brain')">Manage brain →</button>
          </div>
        } @else {
          <label class="field">Ollama URL
            <div class="row"><input [ngModel]="s().ollamaUrl" (ngModelChange)="save({ ollamaUrl: $event })"><button class="small" (click)="test()">Test</button></div>
          </label>
          <p class="small dim" style="margin:0">On-phone: http://127.0.0.1:11434 · PC on Wi-Fi: http://&lt;pc-ip&gt;:11434 (start it with OLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS=*). {{ ollama.version() ? 'Version ' + ollama.version() : '' }}</p>
          <label class="row small"><input type="checkbox" [ngModel]="s().autoWakeTermux" (ngModelChange)="save({ autoWakeTermux: $event })"> Auto-wake Ollama in Termux when needed</label>

          <div class="grid2">
            <label class="field">Chat model
              <select [ngModel]="s().chatModel" (ngModelChange)="save({ chatModel: $event })">
                @for (m of modelNames(); track m) { <option [value]="m">{{ m }}</option> }
              </select>
            </label>
            <label class="field">Memory (embedding) model
              <select [ngModel]="s().embedModel" (ngModelChange)="save({ embedModel: $event })">
                <option value="">Off (keyword memory)</option>
                @for (m of modelNames(); track m) { <option [value]="m">{{ m }}</option> }
              </select>
            </label>
          </div>
          <label class="field">Background model (summaries, memory extraction)
            <select [ngModel]="s().utilityModel" (ngModelChange)="save({ utilityModel: $event })">
              <option value="">Same as chat model</option>
              @for (m of modelNames(); track m) { <option [value]="m">{{ m }}</option> }
            </select>
          </label>
          <div class="grid2">
            <label class="field">Context (tokens)<input type="number" step="1024" [ngModel]="s().numCtx" (ngModelChange)="save({ numCtx: +$event })"></label>
          </div>
          <div class="row"><button class="small" [disabled]="speedBusy()" (click)="speed()">⏱ Speed test</button><span class="small muted">{{ speedResult() }}</span></div>

          <div class="upper" style="margin-top:6px">Installed</div>
          <div class="list">
            @for (m of ollama.models(); track m.name) {
              <div class="item small">
                <div class="grow"><div class="mono">{{ m.name }}</div><div class="dim">{{ gb(m.size) }} · {{ m.details?.parameter_size }} {{ m.details?.quantization_level }}</div></div>
                <button class="small danger" (click)="remove(m.name)">Delete</button>
              </div>
            } @empty { <div class="dim small">None found (engine offline?).</div> }
          </div>

          <div class="upper" style="margin-top:6px">Recommended</div>
          <div class="list">
            @for (r of recommended; track r.name) {
              <div class="item small">
                <div class="grow"><div class="mono">{{ r.name }}</div><div class="dim">{{ r.size }} · {{ r.note }}</div></div>
                @if (ollama.hasModel(r.name)) { <span class="chip green">installed</span> }
                @else { <button class="small" [disabled]="!!pulling()" (click)="pull(r.name)">⬇</button> }
              </div>
            }
          </div>
          <div class="row"><input [(ngModel)]="customModel" placeholder="Any Ollama model, e.g. huihui_ai/…"><button [disabled]="!customModel.trim() || !!pulling()" (click)="pull(customModel.trim())">⬇ Pull</button></div>
          @if (pulling(); as p) {
            <div class="progress"><div [style.width.%]="p.pct ?? 0"></div></div>
            <div class="row between small"><span class="muted">{{ p.name }} · {{ p.status }} {{ p.pct !== null ? p.pct + '%' : '' }}</span><button class="small" (click)="cancelPull()">Cancel</button></div>
          }
        }
        <div class="grid2">
          <label class="field">Temperature {{ s().temperature }}<input type="range" min="0" max="1.2" step="0.05" [ngModel]="s().temperature" (ngModelChange)="save({ temperature: +$event })"></label>
          <label class="row small" style="align-self:end"><input type="checkbox" [ngModel]="s().deepThink" (ngModelChange)="save({ deepThink: $event })"> Deep think (slower, smarter)</label>
        </div>
        @if (msg()) { <div class="banner" [class.err]="msgErr()">{{ msg() }}</div> }
      </div>

      <!-- ============ CLOUD BRAIN ============ -->
      <div class="card col">
        <div class="card-head"><h2>Cloud brain (optional)</h2><span class="chip violet">{{ cloud().mode }}</span></div>
        <p class="small muted" style="margin:0">Use your own free API key for a smarter brain when online. Memory, tools and data stay on the phone; the phone model is the fallback.</p>
        <div class="tabs">
          @for (m of cloudModes; track m.id) { <button [class.on]="cloud().mode === m.id" (click)="saveCloud({ mode: m.id })">{{ m.label }}</button> }
        </div>
        <label class="field">Provider
          <select [ngModel]="cloud().provider" (ngModelChange)="setProvider($event)">
            @for (p of providers; track p.id) { <option [value]="p.id">{{ p.label }} · {{ p.hint }}</option> }
          </select>
        </label>
        @if (cloud().provider === 'custom') {
          <label class="field">Base URL<input [ngModel]="cloud().baseUrl" (ngModelChange)="saveCloud({ baseUrl: $event })" placeholder="https://…/v1"></label>
        }
        <label class="field">API key
          <input type="password" [ngModel]="cloud().apiKey" (ngModelChange)="saveCloud({ apiKey: $event.trim() })" placeholder="Paste your key">
        </label>
        @if (keyUrl()) { <button class="small" (click)="openUrl(keyUrl())">Get a free key ↗</button> }
        <div class="row">
          <select class="grow" [ngModel]="cloud().model" (ngModelChange)="saveCloud({ model: $event })">
            <option value="">Select model…</option>
            @if (cloud().model && !ollama.cloudModels().includes(cloud().model)) { <option [value]="cloud().model">{{ cloud().model }}</option> }
            @for (m of ollama.cloudModels(); track m) { <option [value]="m">{{ m }}</option> }
          </select>
          <button class="small" [disabled]="!cloud().apiKey" (click)="loadCloudModels()">Load models</button>
        </div>
        <button class="small" [disabled]="!cloud().model || !cloud().apiKey" (click)="testCloud()">Test cloud brain</button>
      </div>

      <!-- ============ PERSONA ============ -->
      <div class="card col">
        <h2>Persona</h2>
        <div class="grid2">
          <label class="field">Your name<input [ngModel]="s().userName" (ngModelChange)="save({ userName: $event })"></label>
          <label class="field">Address me as<input [ngModel]="s().honorific" (ngModelChange)="save({ honorific: $event })"></label>
        </div>
        <label class="field">System persona<textarea rows="7" [ngModel]="s().persona" (ngModelChange)="save({ persona: $event })"></textarea></label>
        <button class="small" (click)="save({ persona: defaultPersona })">Reset to J.A.R.V.I.S.</button>
      </div>

      <!-- ============ ROUTINE ============ -->
      <div class="card col">
        <h2>Routine & focus</h2>
        <div class="grid2">
          <label class="field">Morning briefing<input type="time" [ngModel]="s().wakeTime" (ngModelChange)="saveAndReschedule({ wakeTime: $event })"></label>
          <label class="field">Shutdown ritual<input type="time" [ngModel]="s().shutdownTime" (ngModelChange)="saveAndReschedule({ shutdownTime: $event })"></label>
          <label class="field">Work starts<input type="time" [ngModel]="s().workStart" (ngModelChange)="save({ workStart: $event })"></label>
          <label class="field">Work ends<input type="time" [ngModel]="s().workEnd" (ngModelChange)="save({ workEnd: $event })"></label>
        </div>
        <div class="grid3">
          <label class="field">Focus<input type="number" [ngModel]="s().focusMin" (ngModelChange)="save({ focusMin: +$event })"></label>
          <label class="field">Break<input type="number" [ngModel]="s().breakMin" (ngModelChange)="save({ breakMin: +$event })"></label>
          <label class="field">Long break<input type="number" [ngModel]="s().longBreakMin" (ngModelChange)="save({ longBreakMin: +$event })"></label>
        </div>
        <label class="row small"><input type="checkbox" [ngModel]="s().nudges" (ngModelChange)="save({ nudges: $event })"> Accountability nudges</label>
      </div>

      <!-- ============ MCP ============ -->
      <div class="card col">
        <div class="card-head"><h2>MCP servers</h2><span class="small muted">{{ mcpToolCount() }} tools</span></div>
        <p class="small muted" style="margin:0">Connect Model Context Protocol servers (Streamable HTTP) to give Jarvis more tools, e.g. on your PC or in Termux. The server must allow CORS.</p>
        @for (srv of s().mcpServers; track srv.id) {
          <div class="item small">
            <input type="checkbox" [ngModel]="srv.enabled" (ngModelChange)="toggleMcp(srv, $event)">
            <div class="grow">
              <div><b>{{ srv.name }}</b> <span class="mono dim">{{ srv.url }}</span></div>
              @if (mcp.connections()[srv.id]; as c) {
                <div [style.color]="c.status === 'connected' ? 'var(--green)' : c.status === 'error' ? 'var(--red)' : 'var(--gold)'">{{ c.status }} · {{ c.tools.length }} tools {{ c.error ?? '' }}</div>
              }
            </div>
            <button class="small" (click)="connectMcp(srv)">↻</button>
            <button class="small danger" (click)="removeMcp(srv)" aria-label="Remove server">✕</button>
          </div>
        }
        <div class="grid2">
          <input [(ngModel)]="mcpName" placeholder="Name">
          <input [(ngModel)]="mcpUrl" placeholder="http://192.168.1.10:3000/mcp">
        </div>
        <div class="row"><input [(ngModel)]="mcpToken" type="password" placeholder="Bearer token (optional)"><button [disabled]="!mcpName.trim() || !mcpUrl.trim()" (click)="addMcp()">Add</button></div>
      </div>

      <!-- ============ DATA ============ -->
      <div class="card col">
        <h2>Backup</h2>
        <div class="row wrap">
          <button (click)="exportData()">⬇ Export backup</button>
          <label class="btn">⬆ Import backup<input type="file" accept="application/json,.json" (change)="importData($event)" hidden></label>
        </div>
        <p class="small dim" style="margin:0">Exports tasks, habits, sessions, notes, reviews, memories, chats and settings (including API keys) as one JSON file.</p>
      </div>
    </div>
  `,
  styles: [`
    .step { border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
    .step.ok { border-color: rgba(74,222,128,.5); }
    .step.ok b::after { content: ' ✓'; color: var(--green); }
    .step p { margin: 0; }
    .cmd { white-space: pre-wrap; word-break: break-all; background: rgba(0,0,0,.45); border: 1px solid var(--line); border-radius: 8px; padding: 8px; margin: 0; }
    .progress { height: 6px; border-radius: 3px; background: rgba(var(--accent-rgb), .12); overflow: hidden; }
    .progress div { height: 100%; background: var(--cyan); transition: width .3s; }
    .small-tabs button { padding: 4px 10px; font-size: .78rem; }
    label.btn { cursor: pointer; }
  `],
})
export class SettingsPage implements OnInit {
  store = inject(StoreService);
  ollama = inject(OllamaService);
  llm = inject(LlmService);
  mcp = inject(McpService);
  private jarvis = inject(JarvisService);
  private voice = inject(VoiceService);
  private notify = inject(NotifyService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly isNative = isNative();
  readonly s = computed(() => this.store.settings());
  readonly cloud = computed(() => this.store.settings().cloud);
  readonly setup = signal(false);
  readonly recommended = RECOMMENDED_MODELS;
  readonly defaultPersona = DEFAULT_PERSONA;
  readonly providers = (Object.keys(CLOUD_PRESETS) as CloudProvider[]).map(id => ({ id, ...CLOUD_PRESETS[id] }));
  readonly cloudModes: { id: CloudSettings['mode']; label: string }[] = [{ id: 'off', label: 'Off' }, { id: 'auto', label: 'When online' }, { id: 'always', label: 'Always' }];
  readonly keyUrl = computed(() => CLOUD_PRESETS[this.cloud().provider]?.keyUrl ?? '');
  readonly termuxCmd = `pkg update -y && pkg install -y ollama termux-api
echo "allow-external-apps = true" >> ~/.termux/termux.properties
termux-wake-lock
OLLAMA_ORIGINS=* ollama serve &`;

  readonly pulling = signal<{ name: string; status: string; pct: number | null } | null>(null);
  readonly msg = signal('');
  readonly msgErr = signal(false);
  readonly micOk = signal(false);
  readonly speedBusy = signal(false);
  readonly speedResult = signal('');
  readonly modelNames = computed(() => {
    const names = this.ollama.models().map(m => m.name);
    const s = this.s();
    for (const n of [s.chatModel, s.embedModel, s.utilityModel]) if (n && !names.some(x => x === n || x === `${n}:latest`)) names.push(n);
    return names;
  });
  readonly hasChat = computed(() => this.ollama.hasModel(this.s().chatModel));
  readonly mcpToolCount = computed(() => Object.values(this.mcp.connections()).reduce((a, c) => a + c.tools.length, 0));
  private pullAbort: AbortController | null = null;
  customModel = '';
  mcpName = '';
  mcpUrl = '';
  mcpToken = '';

  async ngOnInit() {
    this.setup.set(!!this.route.snapshot.queryParamMap.get('setup'));
    await this.llm.init();
    if (this.s().engine === 'ollama') await this.refreshModels();
  }

  save(p: Partial<Settings>) { this.store.updateSettings(p); }
  async saveAndReschedule(p: Partial<Settings>) { await this.store.updateSettings(p); await this.notify.scheduleDaily(); }
  saveCloud(p: Partial<CloudSettings>) { this.store.updateSettings({ cloud: { ...this.cloud(), ...p } }); }
  setProvider(id: CloudProvider) { this.saveCloud({ provider: id, baseUrl: CLOUD_PRESETS[id].baseUrl || this.cloud().baseUrl, model: '' }); this.ollama.cloudModels.set([]); }

  private note(text: string, err = false) { this.msg.set(text); this.msgErr.set(err); }

  async test() {
    const ok = await this.ollama.ping(4000);
    if (ok) { await this.refreshModels(); this.note(`Connected to Ollama ${this.ollama.version()}. ${this.ollama.models().length} model(s) installed.`); }
    else this.note('Cannot reach Ollama. Is "ollama serve" running in Termux?', true);
  }

  async wake() { this.note('Waking engine…'); this.note((await this.jarvis.ensureEngine()) ? 'Engine online.' : 'Could not wake it. Check that Termux allows external apps (see step 1).', !this.ollama.state().includes('online')); await this.refreshModels(); }

  async refreshModels() { try { await this.ollama.listModels(); this.ollama.state.set('online'); } catch { /* offline */ } }

  async pull(name: string) {
    this.pullAbort = new AbortController();
    this.pulling.set({ name, status: 'starting', pct: null });
    try {
      await this.ollama.pull(name, (status, pct) => this.pulling.set({ name, status, pct }), this.pullAbort.signal);
      this.note(`${name} installed.`);
    } catch (e: any) {
      this.note(e?.name === 'AbortError' ? 'Download cancelled.' : `Download failed: ${e?.message ?? e}`, true);
    } finally { this.pulling.set(null); this.pullAbort = null; }
  }

  cancelPull() { this.pullAbort?.abort(); }

  async pullDefaults() {
    const s = this.s();
    for (const m of [s.chatModel, s.embedModel].filter(Boolean)) if (!this.ollama.hasModel(m)) await this.pull(m);
  }

  async remove(name: string) {
    if (!confirm(`Delete ${name}?`)) return;
    try { await this.ollama.deleteModel(name); } catch (e: any) { this.note(e?.message ?? String(e), true); }
  }

  async speed() {
    this.speedBusy.set(true); this.speedResult.set('Running…');
    try { const t = await this.ollama.speedTest(); this.speedResult.set(`${t} tokens/sec ${t >= 8 ? '· smooth' : t >= 4 ? '· usable' : '· slow, consider a smaller model'}`); }
    catch (e: any) { this.speedResult.set(e?.message ?? 'Failed'); }
    finally { this.speedBusy.set(false); }
  }

  async quickDownload() {
    const m = this.llm.recommended();
    try {
      this.save({ deviceModel: m.id });
      await this.llm.download(m);
      if (this.s().deviceEmbed && !this.llm.embedInstalled()) this.llm.downloadEmbed().catch(() => undefined);
      this.note(`Downloading ${m.name}. You can keep setting up meanwhile.`);
    } catch (e: any) { this.note(`Download failed: ${e?.message ?? e}`, true); }
  }

  async mic() { this.micOk.set(await this.voice.ensurePermission()); }

  async finishSetup() { await this.store.updateSettings({ onboarded: true }); this.setup.set(false); this.notify.init().catch(() => undefined); this.router.navigateByUrl('/briefing'); }

  go(path: string) { this.router.navigateByUrl(path); }
  copy(text: string) { JarvisDevice.clipboardWrite({ text }).catch(() => navigator.clipboard?.writeText(text)); this.note('Copied. Paste it into Termux.'); }
  openUrl(url: string) { JarvisDevice.openUrl({ url }).catch(() => window.open(url, '_blank')); }
  gb(bytes: number) { return bytes > 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`; }

  async loadCloudModels() {
    try { const list = await this.ollama.listCloudModels(); this.note(`${list.length} cloud models available.`); }
    catch (e: any) { this.note(`Couldn't load models: ${e?.message ?? e}`, true); }
  }

  async testCloud() {
    try {
      const r = await this.ollama.chat([{ role: 'user', content: 'Reply with exactly: Systems online, sir.' }], { temperature: 0 });
      this.note(r.brain === 'cloud' ? `Cloud says: ${r.content.trim()}` : 'Cloud unavailable; the phone model answered instead.', r.brain !== 'cloud');
    } catch (e: any) { this.note(`Cloud test failed: ${e?.message ?? e}`, true); }
  }

  // ---- MCP ----
  async addMcp() {
    const srv: McpServer = { id: uid(), name: this.mcpName.trim(), url: this.mcpUrl.trim(), token: this.mcpToken.trim() || undefined, enabled: true };
    await this.store.updateSettings({ mcpServers: [...this.s().mcpServers, srv] });
    this.mcpName = this.mcpUrl = this.mcpToken = '';
    this.connectMcp(srv);
  }
  async connectMcp(srv: McpServer) { try { await this.mcp.connect(srv); } catch { /* status shown */ } }
  async toggleMcp(srv: McpServer, enabled: boolean) {
    await this.store.updateSettings({ mcpServers: this.s().mcpServers.map(x => (x.id === srv.id ? { ...x, enabled } : x)) });
    if (enabled) this.connectMcp({ ...srv, enabled }); else this.mcp.disconnect(srv.id);
  }
  async removeMcp(srv: McpServer) {
    this.mcp.disconnect(srv.id);
    await this.store.updateSettings({ mcpServers: this.s().mcpServers.filter(x => x.id !== srv.id) });
  }

  // ---- backup ----
  async exportData() {
    const json = await this.store.exportJson();
    const name = `jarvis-backup-${this.store.today()}.json`;
    try { const r = await JarvisDevice.saveFile({ name, content: json, mime: 'application/json' }); this.note(`Saved to ${r.uri}`); }
    catch (e: any) { this.note(`Export failed: ${e?.message ?? e}`, true); }
  }

  async importData(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!confirm('Replace ALL current data with this backup?')) return;
    try { await this.store.importJson(await file.text()); this.note('Backup restored. Restart the app to reload everything.'); }
    catch (e: any) { this.note(`Import failed: ${e?.message ?? e}`, true); }
  }
}
