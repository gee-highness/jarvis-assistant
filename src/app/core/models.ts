export type ID = string;

export interface Task {
  id: ID;
  title: string;
  notes?: string;
  project?: string;
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

export interface Settings {
  id: 'main';
  userName: string;
  honorific: string;
  ollamaUrl: string;
  chatModel: string;
  utilityModel: string;
  embedModel: string;
  numCtx: number;
  temperature: number;
  deepThink: boolean;
  persona: string;
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
  ollamaUrl: 'http://127.0.0.1:11434',
  chatModel: 'huihui_ai/Hermes-3-Llama-3.2-abliterated:3b',
  utilityModel: '',
  embedModel: 'all-minilm',
  numCtx: 8192,
  temperature: 0.6,
  deepThink: false,
  persona: DEFAULT_PERSONA,
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
