import { Injectable, inject, signal } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { FocusService } from '../focus.service';
import { LibraryService } from '../library.service';
import { LlmService } from '../llm.service';
import { MemoryService } from '../memory.service';
import { OllamaService } from '../ollama.service';
import { ProgressService } from '../progress.service';
import { SenseService } from '../sense.service';
import { StoreService } from '../store.service';
import { ToolContext, ToolsService } from '../tools/tools.service';
import { ymd } from '../util';
import { ReflexEngine, ReflexStats } from './engine';
import { Bank, HostState, IntentSpec, ReflexHost, ReflexReply } from './types';

class ReflexDb extends Dexie {
  kv!: Table<{ k: string; v: unknown }, string>;
  constructor() { super('jarvis-reflex'); this.version(1).stores({ kv: 'k' }); }
}

/** Angular bridge: gives the Reflex engine live access to the app's data, tools and memory. */
@Injectable({ providedIn: 'root' })
export class ReflexService {
  private store = inject(StoreService);
  private tools = inject(ToolsService);
  private memory = inject(MemoryService);
  private library = inject(LibraryService);
  private progress = inject(ProgressService);
  private focus = inject(FocusService);
  private ollama = inject(OllamaService);
  private llm = inject(LlmService);
  private sense = inject(SenseService);
  private db = new ReflexDb();
  private confirmFn: ToolContext['confirm'] = async () => true;

  readonly stats = signal<ReflexStats | null>(null);
  /** Set by the chat service to show "Looking that up…". */
  onStatus: (t: string) => void = () => undefined;
  readonly lastMs = signal(0);
  readonly ready = signal(false);

  private host: ReflexHost = {
    profile: () => {
      const s = this.store.settings();
      const p = s.personality;
      return { honorific: s.honorific || 'sir', userName: s.userName, name: p.name || 'Jarvis', role: p.role, traits: { ...p.traits }, pet: s.pet?.enabled ? { name: s.pet.name, speaks: s.pet.speaks, personality: s.pet.personality } : undefined, emoji: p.emoji, language: p.language, swearing: p.swearing, catchphrases: p.catchphrases, likes: p.likes };
    },
    state: () => this.snapshot(),
    runTool: (name, args) => this.tools.run(name, args, { confirm: q => this.confirmFn(q) }),
    memorySearch: async (q, k = 6) => (await this.memory.search(q, k)).map(h => ({ text: h.memory.text, score: h.score, kind: h.memory.kind })),
    memoryTop: async k => [...this.memory.memories()].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.importance - a.importance || b.lastUsedAt - a.lastUsedAt).slice(0, k).map(m => ({ text: m.text, score: 1, kind: m.kind })),
    memoryAdd: async (text, kind, importance) => { await this.memory.add(text, kind as never, importance); },
    librarySearch: q => this.library.search(q, 3),
    updateProfile: async p => { if (p.userName) await this.store.updateSettings({ userName: p.userName }); },
    embed: async texts => (this.embedUsable() ? this.ollama.embed(texts) : null),
    embedKey: () => (this.embedUsable() ? this.ollama.embedKey() : ''),
    online: () => typeof navigator === 'undefined' || navigator.onLine,
    http: url => this.tools.fetchText(url),
    status: t => this.onStatus(t),
    kvGet: async <T>(k: string) => (await this.db.kv.get(k))?.v as T | undefined,
    kvSet: async (k, v) => { await this.db.kv.put({ k, v }); },
    now: () => new Date(),
    country: () => countryCode(),
    senseDays: () => this.sense.days(),
    usage: d => this.sense.usage(d),
    moodHistory: () => this.store.journal().map(j => ({ date: j.date, mood: j.mood, energy: j.energy })),
  };

  readonly engine = new ReflexEngine(this.host);
  private initP: Promise<void> | null = null;

  init(): Promise<void> {
    this.initP ??= (async () => {
      await this.engine.init();
      await this.loadPack();
      this.ready.set(true);
      this.refreshStats();
      // semantic matching is a bonus: only when the tiny on-device embedding model is installed
      setTimeout(() => this.engine.enableSemantic().then(() => this.refreshStats()).catch(() => undefined), 4000);
    })();
    return this.initP;
  }

  async respond(text: string, confirm: ToolContext['confirm']): Promise<ReflexReply> {
    await this.init();
    this.confirmFn = confirm;
    const r = await this.engine.respond(text);
    this.lastMs.set(r.ms);
    return r;
  }

  refreshStats() { try { this.stats.set(this.engine.stats()); } catch { /* ignore */ } }

  private embedUsable(): boolean {
    const s = this.store.settings();
    if (s.engine === 'device') return s.deviceEmbed && this.llm.embedInstalled();
    return !!s.embedModel && this.ollama.state() === 'online';
  }

  /** Optional expansion pack generated offline by scripts/reflex-expand.mjs (assets/reflex/pack.json). */
  private async loadPack() {
    try {
      const r = await fetch('assets/reflex/pack.json', { cache: 'force-cache' });
      if (!r.ok) return;
      const j = (await r.json()) as { intents?: { id: string; examples: string[] }[]; rules?: Record<string, string[]> };
      const known = new Map((j.intents ?? []).map(i => [i.id, i.examples]));
      const intents: IntentSpec[] = [...known.entries()].map(([id, examples]) => ({ id, kind: id.startsWith('chat') || id.startsWith('feel') || id.startsWith('fun') || id.startsWith('advice') ? 'chat' : 'action', examples, reply: `r.${id}` } as IntentSpec));
      const bank: Bank = { intents, rules: j.rules ?? {} };
      if (intents.length || Object.keys(bank.rules).length) await this.engine.addBank(bank);
    } catch { /* no pack shipped */ }
  }

  private snapshot(): HostState {
    const st = this.store;
    const today = st.today();
    const open = st.openTasks();
    const habits = st.activeHabits();
    const left = habits.filter(h => h.cadence === 'daily' && !h.log.includes(today)).map(h => h.name);
    const next = st.reminders().filter(r => !r.done && r.at > Date.now()).sort((a, b) => a.at - b.at)[0];
    const lastJ = st.journal()[0];
    return {
      open: open.length, overdue: st.overdue().length, dueToday: st.dueToday().length, doneToday: st.doneToday().length, inbox: st.inbox().length,
      tasks: open.map(t => ({ id: t.id, title: t.title, due: t.due, urgent: t.urgent, important: t.important, isMit: t.isMit, project: t.project })),
      mits: st.mits().map(t => t.title), overdueTitles: st.overdue().sort((a, b) => (a.due ?? '').localeCompare(b.due ?? '')).map(t => t.title),
      habits: habits.map(h => h.name), habitsLeft: left, habitsDone: habits.filter(h => h.log.includes(today)).length, habitsTotal: habits.length,
      streak: this.progress.streak(), level: this.progress.level(), levelTitle: this.progress.title(), xpToday: this.progress.xpToday(),
      focusToday: st.focusMinutesToday(), focusRunning: !!this.focus.current(),
      nextReminder: next ? { title: next.title, at: next.at } : undefined,
      lastMood: lastJ && lastJ.date >= ymd(new Date(Date.now() - 2 * 864e5)) ? lastJ.mood : undefined,
      goals: st.activeGoals().map(g => g.title), docs: this.library.docs().length, memories: this.memory.memories().length,
    };
  }
}

const TZ: Record<string, string> = {
  'Africa/Mbabane': 'SZ', 'Africa/Johannesburg': 'ZA', 'Africa/Maseru': 'LS', 'Africa/Gaborone': 'BW', 'Africa/Windhoek': 'NA', 'Africa/Maputo': 'MZ', 'Africa/Harare': 'ZW',
  'Africa/Lusaka': 'ZM', 'Africa/Nairobi': 'KE', 'Africa/Lagos': 'NG', 'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR', 'Europe/Madrid': 'ES',
  'Europe/Berlin': 'DE', 'Europe/Amsterdam': 'NL', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN',
  'Pacific/Auckland': 'NZ', 'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
  'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR',
};
/** Best guess of the user's country: time zone first (follows travel), then the locale. */
export function countryCode(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (TZ[tz]) return TZ[tz];
    if (tz.startsWith('Australia/')) return 'AU';
    if (tz.startsWith('America/') && /New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Indiana|Kentucky|Boise/.test(tz)) return 'US';
    if (tz.startsWith('Pacific/Honolulu')) return 'US';
  } catch { /* ignore */ }
  const loc = (typeof navigator !== 'undefined' ? navigator.language : '') || '';
  return (loc.split('-')[1] ?? '').toUpperCase();
}
