import { DEFAULT_PERSONALITY, Personality } from './personality';
export type ID = string;

export interface Repeat {
  every: 'daily' | 'weekdays' | 'weekly' | 'monthly';
  /** Every N units (default 1). */
  interval?: number;
}

export interface Task {
  id: ID;
  title: string;
  notes?: string;
  project?: string;
  goalId?: ID;
  repeat?: Repeat;
  /** Checklist inside a task. */
  subtasks?: { id: ID; title: string; done: boolean }[];
  /** For repeating tasks: id of the next occurrence once it has been created. */
  nextId?: ID;
  urgent: boolean;
  important: boolean;
  due?: string;          // YYYY-MM-DD
  estimateMin?: number;
  status: 'todo' | 'done';
  isMit: boolean;
  inbox: boolean;        // captured but not triaged
  createdAt: number;
  doneAt?: number;
}

export interface Habit {
  id: ID;
  name: string;
  cadence: 'daily' | 'weekly';
  target: number;        // times per week for weekly
  archived: boolean;
  log: string[];         // dates YYYY-MM-DD
  createdAt: number;
}

export interface FocusSession {
  id: ID;
  taskId?: ID;
  label: string;
  start: number;
  end?: number;
  minutes: number;
  kind: 'focus' | 'break';
  interruptions: number;
  completed: boolean;
}

export interface TimeBlock { start: string; end: string; label: string; taskId?: ID; kind: 'focus' | 'admin' | 'break' | 'fixed'; }
export interface DayPlan { date: string; blocks: TimeBlock[]; createdAt: number; }

export interface Review {
  id: ID;
  date: string;
  kind: 'daily' | 'weekly';
  wins: string;
  blockers: string;
  energy: number;
  notes?: string;
  aiFeedback?: string;
  createdAt: number;
}

export interface Note { id: ID; title: string; body: string; tags: string[]; updatedAt: number; }

export type MemoryKind = 'fact' | 'preference' | 'goal' | 'person' | 'project' | 'summary' | 'event';
export interface Memory {
  id: ID;
  text: string;
  kind: MemoryKind;
  importance: number;    // 1..5
  pinned: boolean;
  embedding?: number[];
  embedModel?: string;
  createdAt: number;
  lastUsedAt: number;
}

export interface Conversation { id: ID; title: string; summary?: string; summarizedUpTo: number; createdAt: number; updatedAt: number; }

export interface ToolCallRecord { name: string; args: Record<string, unknown>; result?: string; ok?: boolean; }
export interface Message {
  id: ID;
  conversationId: ID;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  thinking?: string;
  toolCalls?: ToolCallRecord[];
  toolName?: string;
  createdAt: number;
}

// ---------------- goals ----------------
export interface Milestone { id: ID; title: string; done: boolean; doneAt?: number; }
export interface Goal {
  id: ID;
  title: string;
  why?: string;
  area: 'career' | 'health' | 'money' | 'learning' | 'relationships' | 'personal' | 'project';
  targetDate?: string;          // YYYY-MM-DD
  /** Optional numeric target, e.g. "run 100 km": unit km, target 100, current 12. */
  metric?: { unit: string; target: number; current: number };
  milestones: Milestone[];
  status: 'active' | 'done' | 'archived';
  createdAt: number;
  doneAt?: number;
}

// ---------------- journal ----------------
export interface JournalEntry {
  id: ID;
  date: string;                 // YYYY-MM-DD
  mood: number;                 // 1..5
  energy: number;               // 1..5
  text: string;
  gratitude?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

// ---------------- templates ----------------
export interface TaskTemplate {
  id: ID;
  name: string;
  icon: string;
  description?: string;
  items: { title: string; estimateMin?: number; offsetDays?: number }[];
  builtin?: boolean;
}

// ---------------- progression ----------------
export type XpKind = 'task' | 'mit' | 'focus' | 'habit' | 'review' | 'journal' | 'plan' | 'goal' | 'milestone' | 'quest' | 'perfect' | 'inbox' | 'achievement' | 'streak';
export interface XpEvent {
  id: ID;
  /** Unique key so one action is rewarded once (e.g. "task:<id>"). */
  ref: string;
  kind: XpKind;
  xp: number;
  label: string;
  date: string;
  at: number;
}
export interface Quest {
  id: string;
  kind: string;
  title: string;
  icon: string;
  target: number;
  xp: number;
  claimed: boolean;
}
export interface ProgressState {
  id: 'main';
  /** Days with real progress (YYYY-MM-DD). */
  activeDays: string[];
  /** Days saved by a streak freeze. */
  frozenDays: string[];
  freezes: number;
  bestStreak: number;
  lastChecked: string;
  unlocked: Record<string, number>;   // achievement id -> unlocked at
  questDate: string;
  quests: Quest[];
  perfectDays: string[];
}

export interface Reminder { id: ID; title: string; at: number; notificationId: number; done: boolean; }

export interface McpServer { id: ID; name: string; url: string; token?: string; enabled: boolean; }

export interface VoiceSettings {
  engine?: string;
  voiceId?: string;
  language: string;
  pitch: number;
  rate: number;
  speakReplies: boolean;
  handsFree: boolean;
  favourites: string[];
}

export type CloudProvider = 'groq' | 'gemini' | 'openrouter' | 'custom';
export interface CloudSettings {
  mode: 'off' | 'auto' | 'always';   // auto = cloud when online, phone model otherwise
  provider: CloudProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
}
export const CLOUD_PRESETS: Record<CloudProvider, { label: string; baseUrl: string; keyUrl: string; hint: string }> = {
  groq: { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys', hint: 'Free tier · very fast' },
  gemini: { label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keyUrl: 'https://aistudio.google.com/apikey', hint: 'Free tier · very capable' },
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/keys', hint: 'Many models, some free (:free)' },
  custom: { label: 'Custom (OpenAI-compatible)', baseUrl: '', keyUrl: '', hint: 'Any OpenAI-compatible endpoint' },
};

export type EngineKind = 'device' | 'ollama';

export interface Settings {
  id: 'main';
  userName: string;
  honorific: string;
  /** Which local brain runs the AI: built-in llama.cpp engine or Ollama (Termux / PC). */
  engine: EngineKind;
  /** On-device model: a DEVICE_MODELS id, or "file:<name>.gguf" for an imported model. */
  deviceModel: string;
  /** Use the on-device embedding model for memory search. */
  deviceEmbed: boolean;
  /** Context window for the on-device engine (tokens). 0 = model default from the catalog. */
  deviceCtx: number;
  /** CPU threads for the on-device engine. 0 = auto (big cores). */
  deviceThreads: number;
  /** Only download models on Wi-Fi. */
  wifiOnly: boolean;
  ollamaUrl: string;
  chatModel: string;
  utilityModel: string;
  embedModel: string;
  numCtx: number;
  temperature: number;
  deepThink: boolean;
  persona: string;
  /** Adjustable personality profile (compiled into the system persona unless personality.rawOverride). */
  personality: Personality;
  wakeTime: string;      // HH:mm
  shutdownTime: string;  // HH:mm
  workStart: string;
  workEnd: string;
  focusMin: number;
  breakMin: number;
  longBreakMin: number;
  nudges: boolean;
  autoWakeTermux: boolean;
  voice: VoiceSettings;
  mcpServers: McpServer[];
  cloud: CloudSettings;
  onboarded: boolean;
}

export const DEFAULT_PERSONA =
`You are J.A.R.V.I.S., a highly capable, loyal AI butler and chief of staff. Speak with calm British wit, economy of words and quiet confidence. Address the user as "sir" (or their chosen honorific). Be direct and candid: if a plan is weak, say so and propose better. You run fully offline on the user's phone.
Your mission is to make the user exceptionally productive: protect focus, keep priorities clear (3 Most Important Tasks), break big work into concrete next actions, and hold the user accountable kindly but firmly.
Use your tools whenever an action is implied (adding tasks, starting focus, setting reminders, remembering facts). Never claim to have done something unless a tool confirmed it. Keep spoken-style replies short unless detail is requested.`;

export const DEFAULT_SETTINGS: Settings = {
  id: 'main',
  userName: '',
  honorific: 'sir',
  engine: 'device',
  deviceModel: 'hermes3-3b',
  deviceEmbed: true,
  deviceCtx: 0,
  deviceThreads: 0,
  wifiOnly: true,
  ollamaUrl: 'http://127.0.0.1:11434',
  chatModel: 'huihui_ai/Hermes-3-Llama-3.2-abliterated:3b',
  utilityModel: '',
  embedModel: 'all-minilm',
  numCtx: 8192,
  temperature: 0.6,
  deepThink: false,
  persona: DEFAULT_PERSONA,
  personality: DEFAULT_PERSONALITY,
  wakeTime: '06:30',
  shutdownTime: '18:00',
  workStart: '08:00',
  workEnd: '17:00',
  focusMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  nudges: true,
  autoWakeTermux: true,
  voice: { language: 'en-GB', pitch: 0.9, rate: 1.0, speakReplies: true, handsFree: false, favourites: [] },
  mcpServers: [],
  cloud: { mode: 'off', provider: 'groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: '', model: '' },
  onboarded: false,
};

export const RECOMMENDED_MODELS = [
  { name: 'huihui_ai/Hermes-3-Llama-3.2-abliterated:3b', size: '≈2 GB', note: 'Default for 6 GB phones · tool calling · uncensored' },
  { name: 'huihui/qwen3-abliterated:4b-instruct-2507', size: '2.3 GB', note: '8 GB phones · smarter, direct answers' },
  { name: 'huihui_ai/qwen3.5-abliterated:4b', size: '≈3 GB', note: '12 GB phones · smartest on-device, deep think' },
  { name: 'huihui_ai/llama3.2-abliterate:3b', size: '≈2 GB', note: 'Alternative 3B, uncensored' },
  { name: 'all-minilm', size: '46 MB', note: 'Embeddings (memory) · tiny' },
  { name: 'nomic-embed-text', size: '274 MB', note: 'Embeddings (memory) · better recall' },
];

// ---------------------------------------------------------------------------
// On-device model catalog (GGUF from Hugging Face, all abliterated/uncensored).
// Small models lose more from quantisation, so the tiny ones ship at Q8 and the mid ones at Q5/Q4_K_M:
// each tier is the most capable file that fits its RAM class.
// ---------------------------------------------------------------------------
export type ModelTier = 'nano' | 'lite' | 'balanced' | 'smart' | 'max';
export interface DeviceModel {
  id: string;
  name: string;
  tier: ModelTier;
  family: string;
  params: string;
  quant: string;
  repo: string;
  /** Preferred file inside the repo; the app falls back to the first file matching `quant`. */
  file?: string;
  sizeMb: number;
  /** Minimum total phone RAM (GB) to run comfortably. */
  minRamGb: number;
  /** Default context window on the phone. */
  ctx: number;
  thinking: boolean;
  blurb: string;
  strengths: string[];
}

export const DEVICE_MODELS: DeviceModel[] = [
  {
    id: 'qwen3-0.6b', name: 'Nano', tier: 'nano', family: 'Qwen3 0.6B abliterated', params: '0.6B', quant: 'Q8_0',
    repo: 'mlabonne/Qwen3-0.6B-abliterated-GGUF', sizeMb: 639, minRamGb: 2, ctx: 8192, thinking: true,
    blurb: 'Tiny and very fast. Good for quick capture, reminders and simple commands.',
    strengths: ['Fastest replies', 'Runs on any phone', 'Basic tool use'],
  },
  {
    id: 'qwen3-1.7b', name: 'Lite', tier: 'lite', family: 'Qwen3 1.7B abliterated', params: '1.7B', quant: 'Q5_K_M',
    repo: 'bartowski/mlabonne_Qwen3-1.7B-abliterated-GGUF', file: 'mlabonne_Qwen3-1.7B-abliterated-Q5_K_M.gguf',
    sizeMb: 1260, minRamGb: 3, ctx: 8192, thinking: true,
    blurb: 'Small but sharp, with a reasoning mode. A great pick for 3-4 GB phones.',
    strengths: ['Quick', 'Deep-think mode', 'Solid tool calling'],
  },
  {
    id: 'hermes3-3b', name: 'Balanced', tier: 'balanced', family: 'Hermes 3 · Llama 3.2 3B abliterated', params: '3B', quant: 'Q5_K_M',
    repo: 'darkc0de/Hermes-3-Llama-3.2-3B-abliterated-Q5_K_M-GGUF', file: 'hermes-3-llama-3.2-3b-abliterated-q5_k_m.gguf',
    sizeMb: 2320, minRamGb: 5, ctx: 6144, thinking: false,
    blurb: 'The default Jarvis brain: coherent, uncensored and built for function calling.',
    strengths: ['Best tool use per GB', 'Natural conversation', 'Follows the persona'],
  },
  {
    id: 'qwen3-4b', name: 'Smart', tier: 'smart', family: 'Qwen3 4B abliterated', params: '4B', quant: 'Q4_K_M',
    repo: 'bartowski/mlabonne_Qwen3-4B-abliterated-GGUF', file: 'mlabonne_Qwen3-4B-abliterated-Q4_K_M.gguf',
    sizeMb: 2500, minRamGb: 6, ctx: 6144, thinking: true,
    blurb: 'The smartest model for 6-8 GB phones. Strong planning and reasoning when Deep think is on.',
    strengths: ['Strong reasoning', 'Deep-think mode', 'Better planning'],
  },
  {
    id: 'qwen3-8b', name: 'Max', tier: 'max', family: 'Qwen3 8B abliterated', params: '8B', quant: 'Q4_K_M',
    repo: 'DevQuasar/huihui-ai.Qwen3-8B-abliterated-GGUF', file: 'huihui-ai.Qwen3-8B-abliterated.Q4_K_M.gguf',
    sizeMb: 5030, minRamGb: 11, ctx: 4096, thinking: true,
    blurb: 'Desktop-class intelligence for 12 GB+ phones. Slower, but noticeably wiser.',
    strengths: ['Best answers', 'Long reasoning', 'Complex plans'],
  },
];

export const DEVICE_EMBED_MODEL = {
  id: 'minilm', name: 'Memory engine', family: 'all-MiniLM-L6-v2', quant: 'Q8_0',
  repo: 'second-state/All-MiniLM-L6-v2-Embedding-GGUF', file: 'all-MiniLM-L6-v2-Q8_0.gguf', sizeMb: 25,
  dest: 'embed-all-minilm-l6-v2-q8_0.gguf',
};

export function deviceModelFile(m: DeviceModel): string { return `${m.id}-${m.quant.toLowerCase()}.gguf`; }

/** Best catalog tier for a phone with this much RAM (MB as reported by Android). */
export function recommendedModel(ramTotalMb: number): DeviceModel {
  const gb = ramTotalMb / 1024 + 0.5; // Android reports a bit less than the marketed size
  const fits = DEVICE_MODELS.filter(m => m.minRamGb <= gb);
  // prefer the tool-calling default for 5-7 GB phones over the slightly larger Qwen 4B
  if (gb < 7.5 && fits.some(m => m.id === 'hermes3-3b')) return DEVICE_MODELS.find(m => m.id === 'hermes3-3b')!;
  return fits[fits.length - 1] ?? DEVICE_MODELS[0];
}

export const BUILTIN_TEMPLATES: TaskTemplate[] = [
  { id: 'tpl-morning', name: 'Morning launch', icon: '🌅', builtin: true, description: 'Start the day on purpose.',
    items: [{ title: 'Review calendar and MITs', estimateMin: 5 }, { title: 'Clear inbox to zero', estimateMin: 15 }, { title: 'First deep-work block on MIT #1', estimateMin: 50 }] },
  { id: 'tpl-weekly', name: 'Weekly review', icon: '🗓', builtin: true, description: 'GTD-style weekly reset.',
    items: [{ title: 'Collect loose papers, notes and screenshots', estimateMin: 10 }, { title: 'Process inbox to zero', estimateMin: 20 },
      { title: 'Review last week: wins and lessons', estimateMin: 10 }, { title: 'Review goals and pick next milestones', estimateMin: 15 },
      { title: 'Plan next week: 3 outcomes', estimateMin: 15 }] },
  { id: 'tpl-deep', name: 'Deep-work prep', icon: '🎧', builtin: true, description: 'Get ready to focus for real.',
    items: [{ title: 'Phone on Do Not Disturb', estimateMin: 1 }, { title: 'Close unrelated tabs and apps', estimateMin: 2 },
      { title: 'Write the single outcome for this block', estimateMin: 3 }, { title: 'Water and snacks ready', estimateMin: 3 }] },
  { id: 'tpl-month-money', name: 'Monthly money check', icon: '💰', builtin: true, description: 'Stay on top of finances.',
    items: [{ title: 'Reconcile bank and card statements', estimateMin: 20 }, { title: 'Pay or schedule bills', estimateMin: 15 },
      { title: 'Review subscriptions and cancel unused', estimateMin: 10 }, { title: 'Move money to savings', estimateMin: 5 }, { title: 'Update budget for next month', estimateMin: 15 }] },
  { id: 'tpl-trip', name: 'Trip prep', icon: '🧳', builtin: true, description: 'Leave nothing behind.',
    items: [{ title: 'Book transport and accommodation', offsetDays: 0 }, { title: 'Check passport/ID validity', offsetDays: 0 },
      { title: 'Packing list: clothes, chargers, meds, documents', offsetDays: 1 }, { title: 'Arrange house/pet care', offsetDays: 1 }, { title: 'Download offline maps and tickets', offsetDays: 2 }] },
  { id: 'tpl-launch', name: 'Project kickoff', icon: '🚀', builtin: true, description: 'Turn an idea into a moving project.',
    items: [{ title: 'Write the outcome in one sentence', estimateMin: 10 }, { title: 'List the milestones', estimateMin: 15 },
      { title: 'Identify the very next physical action', estimateMin: 5 }, { title: 'Block time for the first work session', estimateMin: 5 }] },
  { id: 'tpl-health', name: 'Health reset', icon: '💪', builtin: true, description: 'Small wins for body and mind.',
    items: [{ title: 'Drink 2 L water', estimateMin: 1 }, { title: '20-minute walk', estimateMin: 20 }, { title: 'Prep a healthy meal', estimateMin: 30 }, { title: 'Lights out by 23:00', estimateMin: 1 }] },
];

export const GOAL_AREAS: { id: Goal['area']; label: string; icon: string }[] = [
  { id: 'career', label: 'Career', icon: '💼' }, { id: 'health', label: 'Health', icon: '💪' }, { id: 'money', label: 'Money', icon: '💰' },
  { id: 'learning', label: 'Learning', icon: '📚' }, { id: 'relationships', label: 'People', icon: '❤️' }, { id: 'personal', label: 'Personal', icon: '🌱' },
  { id: 'project', label: 'Project', icon: '🚀' },
];
