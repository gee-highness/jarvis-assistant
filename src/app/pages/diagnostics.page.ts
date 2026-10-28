import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DiagService } from '../core/diag.service';
import { JarvisService } from '../core/jarvis.service';
import { LlmService } from '../core/llm.service';
import { JarvisDevice, isNative } from '../core/native';
import { OllamaService } from '../core/ollama.service';
import { StoreService } from '../core/store.service';
import { VoiceService } from '../core/voice.service';

interface Row { name: string; ok: boolean | null; detail: string; }

@Component({
  standalone: true,
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Diagnostics</h1></div>
      <p class="small muted">Checks each layer in turn so we can see exactly where it stops responding.</p>
      <div class="row wrap">
        <div class="card small">
          <b>Engine monitor</b> (live)<br>
          Installed: {{ llm.status()?.available ? 'engine ✓' : 'engine ✗' }} · model {{ llm.activeInstalled() ? '✓ ' + (llm.active()?.name ?? '') : '✗ none' }}<br>
          Loaded: {{ llm.info()?.loaded ? 'yes · ctx ' + llm.info()?.n_ctx + ' · ' + llm.info()?.threads + ' threads' : 'no' }}<br>
          Now: @if (llm.activity(); as a) { {{ a.phase === 'prompt' ? 'reading prompt' : 'generating' }} · {{ a.chars }} chars · {{ tick() }}s } @else { idle }
        </div>
        <button class="primary" [disabled]="running()" (click)="run()">{{ running() ? 'Running…' : '▶ Run full check' }}</button>
        <button [disabled]="!rows().length" (click)="copy()">Copy report</button>
      </div>

      @for (r of rows(); track r.name) {
        <div class="card row">
          <span class="st" [class.ok]="r.ok === true" [class.bad]="r.ok === false">{{ r.ok === null ? '…' : r.ok ? '✓' : '✗' }}</span>
          <div class="grow"><b>{{ r.name }}</b><div class="small muted pre">{{ r.detail }}</div></div>
        </div>
      }

      @if (diag.errors().length) {
        <h2 class="upper">Recent errors</h2>
        @for (e of diag.errors(); track e.at) { <div class="card small"><span class="muted">{{ e.at | date:'HH:mm:ss' }}</span> {{ e.msg }}</div> }
      }
    </div>
  `,
  styles: [`.wrap { flex-wrap: wrap; gap: 8px; } .st { width: 26px; text-align: center; font-weight: 700; color: var(--muted); } .st.ok { color: var(--green); } .st.bad { color: var(--red); } .pre { white-space: pre-wrap; word-break: break-word; } h2 { margin: 14px 0 6px; }`],
})
export class DiagnosticsPage {
  readonly diag = inject(DiagService);
  private store = inject(StoreService);
  readonly llm = inject(LlmService);
  private ollama = inject(OllamaService);
  private jarvis = inject(JarvisService);
  private voice = inject(VoiceService);
  readonly rows = signal<Row[]>([]);
  readonly running = signal(false);
  readonly now = signal(Date.now());
  readonly tick = () => { const a = this.llm.activity(); return a ? Math.round((this.now() - a.since) / 1000) : 0; };
  private timer = setInterval(() => this.now.set(Date.now()), 1000);
  ngOnDestroy() { clearInterval(this.timer); }

  private push(r: Row) { this.rows.update(a => [...a.filter(x => x.name !== r.name), r]); }
  private ms(t0: number) { return `${((performance.now() - t0) / 1000).toFixed(1)}s`; }

  async run() {
    this.running.set(true); this.rows.set([]);
    const s = this.store.settings();
    this.push({ name: 'App', ok: this.store.ready(), detail: `native=${isNative()} · ${this.store.tasks().length} tasks · engine=${s.engine} · cloud=${s.cloud.mode}${s.cloud.apiKey ? ' (key set)' : ''} · model=${s.deviceModel}` });
    try {
      await this.llm.init(); await this.llm.refresh();
      const st = this.llm.status();
      this.push({ name: 'Native engine', ok: !!st?.available, detail: st ? `available=${st.available}${st.error ? ' · ' + st.error : ''} · RAM ${st.ramAvailMb}/${st.ramTotalMb} MB · ${st.cores} cores\n${st.systemInfo ?? ''}` : 'no status (plugin missing?)' });
      const a = this.llm.active();
      this.push({ name: 'Model file', ok: this.llm.activeInstalled(), detail: a ? `${a.name}\nfile: ${a.file}\ninstalled: ${this.llm.files().map(f => `${f.file} (${(f.size / 1048576).toFixed(0)} MB)`).join(', ') || 'none'}` : 'no model selected' });
      const c = s.cloud;
      if (c.mode !== 'off') this.push({ name: 'Cloud brain', ok: !!(c.apiKey && c.model), detail: `mode=${c.mode} · ${c.provider} · model=${c.model || '(none)'} · key ${c.apiKey ? 'set' : 'MISSING'} · online=${navigator.onLine}\nNote: a 429 means the free tier is rate-limited; the app falls back to the phone model when one is installed.` });
      if (this.llm.activeInstalled()) {
        const t0 = performance.now();
        this.push({ name: 'Load model', ok: null, detail: 'Loading…' });
        try { await this.llm.ensureLoaded(); const i = this.llm.info(); this.push({ name: 'Load model', ok: !!i?.loaded, detail: `${this.ms(t0)} · ctx ${i?.n_ctx} · threads ${i?.threads}${i?.error ? ' · ' + (i.message ?? i.error) : ''}` }); }
        catch (e: any) { this.push({ name: 'Load model', ok: false, detail: `${this.ms(t0)} · ${e?.message ?? e}` }); }
        if (this.llm.info()?.loaded) {
          const t1 = performance.now();
          this.push({ name: 'Generate', ok: null, detail: 'Generating…' });
          try {
            const r = await this.llm.chat({ messages: [{ role: 'user', content: 'Reply with the single word: ready' }], max_tokens: 12, temperature: 0, think: false });
            this.push({ name: 'Generate', ok: !r.error && /ready/i.test(r.content ?? ''), detail: `${this.ms(t1)} · reply "${(r.content ?? '').trim().slice(0, 60)}"${r.tps ? ' · ' + r.tps.toFixed(1) + ' tok/s' : ''} · prompt ${r.prompt_tokens ?? '?'} tok in ${Math.round(r.prompt_ms ?? 0)} ms · gen ${r.gen_tokens ?? '?'} tok · finish ${r.finish ?? '?'}${r.error ? ' · ' + (r.message ?? r.error) : ''}` });
          } catch (e: any) { this.push({ name: 'Generate', ok: false, detail: String(e?.message ?? e) }); }
          const t2 = performance.now();
          this.push({ name: 'Real chat', ok: null, detail: 'Running a full-size turn…' });
          try {
            const r = await this.llm.chat({ messages: [{ role: 'system', content: this.jarvis.persona() }, { role: 'user', content: 'Hello, who are you?' }], max_tokens: 60, think: false });
            this.push({ name: 'Real chat', ok: !r.error && /[a-z]{3}/i.test((r.content ?? '').replace(/<\/?think>/g, '')), detail: `${this.ms(t2)} · "${(r.content ?? '').trim().slice(0, 80)}" · prompt ${r.prompt_tokens ?? '?'} tok in ${Math.round(r.prompt_ms ?? 0)} ms · ${r.tps ? r.tps.toFixed(1) + ' tok/s' : 'no tps'} · finish ${r.finish ?? '?'} · format ${r.format ?? '?'}${r.error ? ' · ' + (r.message ?? r.error) : ''}` });
          } catch (e: any) { this.push({ name: 'Real chat', ok: false, detail: String(e?.message ?? e) }); }
        }
      }
      this.push({ name: 'Last chat error', ok: !this.jarvis.error(), detail: this.jarvis.error() || 'none' });
      try {
        const p = await this.voice.ensurePermission();
        const eng = await JarvisDevice.getEngines().catch(() => ({ engines: [] as unknown[] }));
        this.push({ name: 'Voice', ok: p, detail: `mic permission=${p} · TTS engines=${(eng as any).engines?.length ?? 0} · recogniser on-device=${this.voice.onDevice()}` });
      } catch (e: any) { this.push({ name: 'Voice', ok: false, detail: String(e?.message ?? e) }); }
    } catch (e: any) { this.push({ name: 'Check failed', ok: false, detail: String(e?.message ?? e) }); }
    this.running.set(false);
  }

  async copy() {
    const txt = this.rows().map(r => `${r.ok ? 'OK ' : 'FAIL'} ${r.name}: ${r.detail}`).join('\n') + '\n' + this.diag.errors().map(e => 'ERR ' + e.msg).join('\n');
    await JarvisDevice.clipboardWrite({ text: txt }).catch(() => navigator.clipboard?.writeText(txt));
  }
}
