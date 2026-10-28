import { composePersona } from './personality';
import { Injectable, computed, inject, signal } from '@angular/core';
import { db } from './db';
import { MemoryService } from './memory.service';
import { Conversation, Message, ToolCallRecord } from './models';
import { LlmService } from './llm.service';
import { JarvisDevice, isNative } from './native';
import { OllamaMessage, OllamaService, OllamaTool } from './ollama.service';
import { StoreService } from './store.service';
import { ToolsService } from './tools/tools.service';
import { extractJson, hm, prettyDate, sleep, uid } from './util';
import { VoiceService } from './voice.service';

export interface UiMessage extends Message { streaming?: boolean; brain?: 'phone' | 'cloud'; }
export interface PendingConfirm { question: string; resolve: (ok: boolean) => void; }

const MAX_TOOL_ROUNDS = 6;
const HISTORY_WINDOW = 12;
const SUMMARIZE_AFTER = 24;

@Injectable({ providedIn: 'root' })
export class JarvisService {
  private ollama = inject(OllamaService);
  private store = inject(StoreService);
  private memory = inject(MemoryService);
  private tools = inject(ToolsService);
  private voice = inject(VoiceService);
  private llm = inject(LlmService);

  readonly conversations = signal<Conversation[]>([]);
  readonly currentId = signal<string | null>(null);
  readonly messages = signal<UiMessage[]>([]);
  readonly busy = signal(false);
  readonly status = signal('');
  readonly error = signal('');
  readonly pendingConfirm = signal<PendingConfirm | null>(null);
  readonly current = computed(() => this.conversations().find(c => c.id === this.currentId()) ?? null);
  private abort: AbortController | null = null;

  async init(): Promise<void> {
    this.conversations.set(await db.conversations.orderBy('updatedAt').reverse().toArray());
    const last = this.conversations()[0];
    if (last && Date.now() - last.updatedAt < 6 * 3600_000) await this.open(last.id);
  }

  // ---------------- engine ----------------
  /** Make sure some brain is reachable; wakes Ollama in Termux if needed. */
  async ensureEngine(): Promise<boolean> {
    const c = this.store.settings().cloud;
    if (c.mode !== 'off' && c.apiKey && c.model && navigator.onLine) return true;
    const s = this.store.settings();
    if (s.engine === 'device') {
      try {
        if (!this.llm.info()?.loaded) this.status.set('Loading the brain… (first load checks the engine)');
        const ok = await this.llm.ensureLoaded();
        this.ollama.state.set(ok ? 'online' : 'offline');
        return ok;
      } catch {
        this.ollama.state.set('offline');
        return false;
      } finally {
        this.status.set('');
      }
    }
    if (await this.ollama.ping()) return true;
    const local = /127\.0\.0\.1|localhost/.test(s.ollamaUrl);
    if (!local || !s.autoWakeTermux || !isNative()) return false;
    const { installed } = await JarvisDevice.isTermuxInstalled().catch(() => ({ installed: false }));
    if (!installed) return false;
    this.ollama.state.set('waking');
    this.status.set('Waking the engine…');
    await JarvisDevice.startTermuxOllama({ origins: '*' }).catch(() => undefined);
    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      if (await this.ollama.ping(1500)) { this.status.set(''); return true; }
    }
    this.ollama.state.set('offline');
    this.status.set('');
    return false;
  }

  offlineReason(): string {
    const s = this.store.settings();
    if (s.engine === 'device') {
      if (!this.llm.available()) return 'The on-device engine is unavailable on this phone. Switch to Ollama or a cloud brain in Settings.';
      if (!this.llm.activeInstalled()) return 'No brain installed yet. Open Brain and download a model (one time, then fully offline).';
      return this.llm.loadError() || 'The brain failed to load. Try a smaller model or context in Brain.';
    }
    return 'The AI engine is offline. Open Termux and run: ollama serve';
  }

  // ---------------- conversations ----------------
  async newConversation(): Promise<void> {
    this.currentId.set(null);
    this.messages.set([]);
    this.error.set('');
  }

  async open(id: string): Promise<void> {
    this.currentId.set(id);
    this.messages.set(await db.messages.where('conversationId').equals(id).sortBy('createdAt'));
  }

  async deleteConversation(id: string): Promise<void> {
    await db.messages.where('conversationId').equals(id).delete();
    await db.conversations.delete(id);
    this.conversations.update(a => a.filter(c => c.id !== id));
    if (this.currentId() === id) await this.newConversation();
  }

  private async ensureConversation(firstText: string): Promise<Conversation> {
    const cur = this.current();
    if (cur) return cur;
    const c: Conversation = { id: uid(), title: firstText.slice(0, 48) || 'New chat', summarizedUpTo: 0, createdAt: Date.now(), updatedAt: Date.now() };
    await db.conversations.put(c);
    this.conversations.update(a => [c, ...a]);
    this.currentId.set(c.id);
    return c;
  }

  private async touch(c: Conversation, patch: Partial<Conversation> = {}) {
    const next = { ...c, ...patch, updatedAt: Date.now() };
    await db.conversations.put(next);
    this.conversations.update(a => [next, ...a.filter(x => x.id !== c.id)]);
  }

  // ---------------- confirmations ----------------
  private confirm = (question: string) => new Promise<boolean>(resolve => {
    this.pendingConfirm.set({ question, resolve: ok => { this.pendingConfirm.set(null); resolve(ok); } });
    if (this.store.settings().voice.speakReplies && this.voice.state() !== 'idle') this.voice.speak(question + ' Tap confirm or cancel.');
  });

  stop() {
    this.abort?.abort();
    this.voice.stopSpeaking();
    this.pendingConfirm()?.resolve(false);
  }

  /** Active persona text: compiled from the personality profile (or the raw override). */
  persona(): string {
    const s = this.store.settings();
    return s.personality.rawOverride ? s.persona : composePersona(s.personality, s.honorific, s.userName);
  }

  // ---------------- prompt ----------------
  /** True when the phone's small model (Nano/Lite) is doing the talking. */
  private isCompact(): boolean {
    const st = this.store.settings();
    if (st.cloud.mode !== 'off' && st.cloud.apiKey && navigator.onLine) return false;
    const t = this.llm.active()?.catalog?.tier;
    return t === 'nano' || t === 'lite';
  }

  private async systemPrompt(userText: string, tools: OllamaTool[], nativeTools: boolean, compact = false): Promise<string> {
    const s = this.store.settings();
    const mem = await this.memory.contextFor(userText);
    let persona = this.persona();
    if (compact && persona.length > 700) persona = persona.slice(0, 700).replace(/\s+\S*$/, '');
    const who = `${s.userName ? `The user's name is ${s.userName}. ` : ''}Address them as "${s.honorific}".`;
    // Static parts first, changing parts last: the on-device engine reuses the cached prefix between turns.
    const parts = [
      persona,
      who,
      `## How to act
- When the user asks you to do something, call the matching tool, then confirm briefly what was done.
- Prefer one clear next action over long advice. Be honest about weak plans.
- Use remember() for new durable personal facts the user shares.
- For dates use YYYY-MM-DD.`,
    ];
    if (!nativeTools && tools.length) {
      parts.push(`## Tools
You can use these tools. To call one, reply ONLY with a line like:
<tool>{"name":"add_task","args":{"title":"Email Sam","due":"tomorrow"}}</tool>
You may call several, one per line. After results come back, answer the user normally.
${this.tools.catalogue(tools)}`);
    }
    parts.push(
      `## Right now\n${prettyDate()} ${hm()} (today is ${this.store.today()}).`,
      compact ? '' : `## Current state\n${this.store.snapshot()}`,
      mem ? `## What you remember about ${s.honorific}\n${mem}` : '',
    );
    return parts.filter(Boolean).join('\n\n');
  }

  private historyFor(conv: Conversation, msgs: UiMessage[]): OllamaMessage[] {
    const out: OllamaMessage[] = [];
    if (conv.summary) out.push({ role: 'system', content: `Earlier in this conversation:\n${conv.summary}` });
    for (const m of msgs.slice(-HISTORY_WINDOW)) {
      if (m.role === 'user') out.push({ role: 'user', content: m.content });
      else if (m.role === 'assistant') {
        const acts = m.toolCalls?.length ? `\n[Actions taken: ${m.toolCalls.map(t => `${t.name} → ${(t.result ?? '').slice(0, 120)}`).join(' | ')}]` : '';
        out.push({ role: 'assistant', content: (m.content || '') + acts });
      }
    }
    return out;
  }

  // ---------------- main loop ----------------
  /** Send a user message. Returns the final assistant text. */
  async send(text: string, opts: { speak?: boolean; allTools?: boolean } = {}): Promise<string> {
    const clean = text.trim();
    if (!clean || this.busy()) return '';
    this.error.set('');
    this.busy.set(true);
    this.voice.setThinking(true);
    this.abort = new AbortController();
    const conv = await this.ensureConversation(clean);
    const userMsg: UiMessage = { id: uid(), conversationId: conv.id, role: 'user', content: clean, createdAt: Date.now() };
    const prior = this.messages();
    this.messages.update(a => [...a, userMsg]);
    await db.messages.put(userMsg);

    const reply: UiMessage = { id: uid(), conversationId: conv.id, role: 'assistant', content: '', toolCalls: [], createdAt: Date.now() + 1, streaming: true };
    this.messages.update(a => [...a, reply]);
    const patchReply = (p: Partial<UiMessage>) => this.messages.update(a => a.map(m => (m.id === reply.id ? { ...m, ...p } : m)));

    try {
      if (!(await this.ensureEngine())) throw new Error(this.offlineReason());
      const compact = this.isCompact();
      let { tools } = this.tools.select(clean, opts.allTools);
      // tiny models: tools only when the message sounds like a command (keeps prefill short)
      if (compact && !opts.allTools && !/\b(add|remind|reminder|create|set|mark|complete|finish|done|delete|remove|schedule|log|remember|snooze|start|list|show|what'?s on|plan)\b/i.test(clean)) tools = [];
      if (compact && tools.length > 12) tools = tools.slice(0, 12);
      const model = this.store.settings().chatModel;
      const cloudOn = this.store.settings().cloud.mode !== 'off' && !!this.store.settings().cloud.apiKey && navigator.onLine;
      const nativeTools = tools.length > 0 && (cloudOn || this.ollama.supportsTools(model));
      const system = await this.systemPrompt(clean, tools, nativeTools, compact);
      const convo: OllamaMessage[] = [{ role: 'system', content: system }, ...this.historyFor(conv, prior), { role: 'user', content: clean }];
      const records: ToolCallRecord[] = [];
      const seen = new Set<string>();
      let finalText = '';

      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        let streamed = '';
        let thinking = '';
        const t0 = Date.now();
        const tick = setInterval(() => {
          const sec = Math.round((Date.now() - t0) / 1000);
          if (!streamed) this.status.set(sec > 40 ? `Still working… ${sec}s — tap Stop, then More → Diagnostics` : thinking ? `Thinking… ${sec}s` : `Reading your message… ${sec}s`);
          else this.status.set('');
        }, 1000);
        const res = await this.ollama.chat(convo, {
          tools: nativeTools ? tools : undefined,
          think: compact ? false : this.store.settings().deepThink,
          signal: this.abort.signal,
          onToken: t => { streamed += t; patchReply({ content: this.visible(finalText + streamed) }); },
          onThinking: t => { thinking += t; patchReply({ thinking }); },
        }).finally(() => clearInterval(tick));
        patchReply({ brain: res.brain });
        // models that lost native tools mid-loop (learned at runtime) fall back to the text protocol
        let calls: { id?: string; name: string; args: Record<string, unknown> }[] = res.toolCalls.map(tc => ({ id: tc.id, name: tc.function.name, args: this.parseArgs(tc.function.arguments) }));
        if (!calls.length) calls = this.parseTextCalls(res.content);
        if (!calls.length || round === MAX_TOOL_ROUNDS) {
          finalText += this.visible(res.content);
          break;
        }
        // execute tools
        const visiblePart = this.visible(res.content);
        if (visiblePart) finalText += visiblePart + '\n\n';
        if (res.toolCalls.length) convo.push({ role: 'assistant', content: res.content, tool_calls: res.toolCalls });
        else convo.push({ role: 'assistant', content: res.content });
        const textResults: string[] = [];
        for (const call of calls) {
          const key = call.name + JSON.stringify(call.args);
          let result: string;
          let ok: boolean;
          if (seen.has(key)) { ok = false; result = 'Already done this turn; do not repeat. Answer the user now.'; }
          else {
            seen.add(key);
            this.status.set(`Running ${call.name.replace(/_/g, ' ')}…`);
            const rec: ToolCallRecord = { name: call.name, args: call.args };
            records.push(rec);
            patchReply({ toolCalls: [...records] });
            ({ ok, result } = await this.tools.run(call.name, call.args, { confirm: this.confirm }));
            rec.ok = ok; rec.result = result;
            patchReply({ toolCalls: [...records] });
          }
          if (res.toolCalls.length) convo.push({ role: 'tool', content: result, tool_name: call.name, tool_call_id: call.id });
          else textResults.push(`${call.name}: ${result}`);
        }
        if (textResults.length) convo.push({ role: 'user', content: `TOOL RESULTS:\n${textResults.join('\n')}\nNow reply to me briefly.` });
        this.status.set('');
      }

      finalText = finalText.trim() || (records.length ? records.map(r => r.result).join('\n') : `I drew a blank on that, ${this.store.settings().honorific}. Try rephrasing, or pick a larger brain under Brain.`);
      const saved: Message = { id: reply.id, conversationId: conv.id, role: 'assistant', content: finalText, toolCalls: records, createdAt: reply.createdAt };
      if (this.messages().find(m => m.id === reply.id)?.thinking) saved.thinking = this.messages().find(m => m.id === reply.id)!.thinking;
      patchReply({ content: finalText, streaming: false, toolCalls: records });
      await db.messages.put(saved);
      await this.touch(conv);
      if (opts.speak ?? false) await this.voice.speak(finalText);
      this.afterTurn(conv, clean, finalText);
      return finalText;
    } catch (e: any) {
      const aborted = e?.name === 'AbortError' || this.abort?.signal.aborted;
      const msg = aborted ? 'Stopped.' : (e?.message ?? String(e));
      if (!aborted) this.error.set(msg);
      const content = this.messages().find(m => m.id === reply.id)?.content || (aborted ? '_(stopped)_' : `⚠️ ${msg}`);
      patchReply({ content, streaming: false });
      await db.messages.put({ id: reply.id, conversationId: conv.id, role: 'assistant', content, createdAt: reply.createdAt });
      if (opts.speak && !aborted) await this.voice.speak(`Apologies, ${this.store.settings().honorific}. ${msg}`);
      return '';
    } finally {
      this.busy.set(false);
      this.status.set('');
      this.voice.setThinking(false);
      this.abort = null;
    }
  }

  /** Background upkeep: memory extraction, summarisation, titling. Never blocks the UI. */
  private afterTurn(conv: Conversation, userText: string, reply: string) {
    (async () => {
      await this.memory.extractFrom(userText, reply);
      const msgs = await db.messages.where('conversationId').equals(conv.id).sortBy('createdAt');
      const latest = this.conversations().find(c => c.id === conv.id) ?? conv;
      if (msgs.length === 2 && latest.title === userText.slice(0, 48)) {
        const title = await this.ollama.complete('Give a 2-5 word title for this conversation. Reply with the title only, no quotes.', userText).catch(() => '');
        if (title) await this.touch(latest, { title: title.replace(/["'.]/g, '').slice(0, 48) });
      }
      const unsummarized = msgs.length - latest.summarizedUpTo;
      if (unsummarized > SUMMARIZE_AFTER) {
        const chunk = msgs.slice(latest.summarizedUpTo, msgs.length - HISTORY_WINDOW);
        if (chunk.length >= 6) {
          const summary = await this.memory.summarize(chunk, latest.title).catch(() => '');
          if (summary) {
            const fresh = this.conversations().find(c => c.id === conv.id) ?? latest;
            await this.touch(fresh, { summary: [fresh.summary, summary].filter(Boolean).join('\n').slice(-3000), summarizedUpTo: msgs.length - HISTORY_WINDOW });
          }
        }
      }
    })().catch(() => undefined);
  }

  // ---------------- briefings & reviews ----------------
  /** Spoken-style morning/anytime briefing. Uses tools so Jarvis can set MITs directly. */
  async briefing(speak = false): Promise<string> {
    const prompt = `Give me my briefing for ${prettyDate()}. Cover: overdue items, today's MITs (if none are set, choose the best 3 from my tasks and set them with set_mits), habits at risk, and one sharp piece of advice for the day. Keep it under 120 words, spoken style.`;
    await this.newConversation();
    return this.send(prompt, { speak });
  }

  async reviewFeedback(kind: 'daily' | 'weekly', review: { wins: string; blockers: string; energy: number; notes?: string }): Promise<string> {
    const s = this.store.settings();
    const stats = this.store.snapshot();
    const system = `${this.persona()}\nYou are reviewing the user's ${kind} shutdown. Be candid, specific, encouraging but honest. Max 130 words. End with ${kind === 'daily' ? "3 suggested MITs for tomorrow as a numbered list" : "3 outcomes for next week as a numbered list"}.`;
    const user = `Wins: ${review.wins}\nBlockers: ${review.blockers}\nEnergy (1-5): ${review.energy}\nNotes: ${review.notes ?? ''}\n\nState:\n${stats}`;
    if (!(await this.ensureEngine())) throw new Error(this.offlineReason());
    const out = await this.ollama.complete(system, user, { model: s.chatModel, think: kind === 'weekly' ? s.deepThink : false, background: false });
    this.memory.add(`${kind === 'daily' ? 'Daily' : 'Weekly'} review ${this.store.today()}: wins: ${review.wins.slice(0, 160)}; blockers: ${review.blockers.slice(0, 160)}; energy ${review.energy}/5`, 'event', 2).catch(() => undefined);
    return out;
  }

  /** Natural-language quick capture → structured task(s) without a chat turn. */
  async quickCapture(text: string): Promise<number> {
    const system = `Convert the user's note into tasks. Today is ${this.store.today()} (${new Date().toLocaleDateString(undefined, { weekday: 'long' })}).
Return JSON: {"tasks":[{"title":"verb-first title","due":"YYYY-MM-DD or null","urgent":bool,"important":bool,"estimate_min":number|null,"project":string|null}]}`;
    let tasks: any[] = [];
    try {
      if (await this.ensureEngine()) tasks = extractJson<{ tasks: any[] }>(await this.ollama.complete(system, text, { format: 'json', background: false }))?.tasks ?? [];
    } catch { tasks = []; }
    if (!tasks.length) { await this.store.addTask({ title: text, inbox: true }); return 1; }
    for (const t of tasks.slice(0, 10)) {
      if (!t?.title) continue;
      await this.store.addTask({
        title: String(t.title), due: /^\d{4}-\d{2}-\d{2}$/.test(t.due ?? '') ? t.due : undefined, urgent: !!t.urgent, important: t.important !== false,
        estimateMin: Number(t.estimate_min) || undefined, project: t.project || undefined,
      });
    }
    return tasks.length;
  }

  // ---------------- helpers ----------------
  private parseArgs(a: unknown): Record<string, unknown> {
    if (!a) return {};
    if (typeof a === 'string') { try { return JSON.parse(a); } catch { return {}; } }
    return a as Record<string, unknown>;
  }

  /** Text-protocol tool calls: <tool>{"name":..,"args":..}</tool> or a bare {"name":..,"args":..} reply. */
  private parseTextCalls(content: string): { id?: string; name: string; args: Record<string, unknown> }[] {
    const out: { name: string; args: Record<string, unknown> }[] = [];
    const re = /<tool>([\s\S]*?)<\/tool>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) {
      const j = extractJson<{ name?: string; tool?: string; args?: Record<string, unknown>; arguments?: Record<string, unknown> }>(m[1]);
      const name = j?.name ?? j?.tool;
      if (name) out.push({ name, args: j?.args ?? j?.arguments ?? {} });
    }
    if (!out.length && /^\s*\{[\s\S]*"name"\s*:/.test(content)) {
      const j = extractJson<{ name?: string; args?: Record<string, unknown>; arguments?: Record<string, unknown>; parameters?: Record<string, unknown> }>(content);
      if (j?.name && this.tools.defs.some(d => d.name === j.name)) out.push({ name: j.name, args: j.args ?? j.arguments ?? j.parameters ?? {} });
    }
    return out;
  }

  /** Hide tool-protocol markup from what the user sees. */
  private visible(text: string): string {
    return text.replace(/<tool>[\s\S]*?(<\/tool>|$)/g, '').replace(/^\s*\{\s*"name"\s*:[\s\S]*\}\s*$/, '').trim();
  }
}
