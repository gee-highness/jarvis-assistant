import type { Rules } from './grammar';
import type { Entities } from './entities';
import type { EmotionRead, Normalized } from './text';

export type IntentKind = 'chat' | 'action' | 'info' | 'meta';

export interface IntentSpec {
  id: string;
  kind: IntentKind;
  /** Example utterances (normalised style: lower case, contractions expanded). */
  examples: string[];
  /** High-precision regexes (tested on normalised text): strong boost. */
  patterns?: RegExp[];
  /** If any matches, this intent is heavily penalised. */
  not?: RegExp[];
  /** Reply symbol (defaults to "r.<id>"). */
  reply?: string;
  /** Topic label used for callbacks ("joke", "fitness"). */
  topic?: string;
  /** Only valid while the dialogue is waiting for this (e.g. "riddle"). */
  context?: string;
}

export interface Bank { intents: IntentSpec[]; rules: Rules; }

export interface TaskLite { id: string; title: string; due?: string; urgent: boolean; important: boolean; isMit: boolean; project?: string; }

/** Snapshot of the user's world, read every turn (cheap). */
export interface HostState {
  open: number;
  overdue: number;
  dueToday: number;
  doneToday: number;
  inbox: number;
  tasks: TaskLite[];
  mits: string[];
  overdueTitles: string[];
  habits: string[];
  habitsLeft: string[];
  habitsDone: number;
  habitsTotal: number;
  streak: number;
  level: number;
  levelTitle: string;
  xpToday: number;
  focusToday: number;
  focusRunning: boolean;
  nextReminder?: { title: string; at: number };
  lastMood?: number;
  goals: string[];
  docs: number;
  memories: number;
}

export interface HostProfile {
  honorific: string;
  userName: string;
  name: string;
  role: string;
  traits: Record<string, number>;
  emoji: 'none' | 'some' | 'lots';
  language: string;
  swearing: 'none' | 'mild' | 'free';
  catchphrases: string;
  likes: string;
}

export interface MemHit { text: string; score: number; kind?: string; }

export interface ReflexHost {
  profile(): HostProfile;
  state(): HostState;
  runTool(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; result: string }>;
  memorySearch(q: string, k?: number): Promise<MemHit[]>;
  memoryAdd(text: string, kind: string, importance: number): Promise<void>;
  /** Most important memories (pinned first). */
  memoryTop?(k: number): Promise<MemHit[]>;
  librarySearch(q: string): Promise<{ doc: string; text: string; score: number }[]>;
  updateProfile(p: { userName?: string }): Promise<void>;
  /** Optional sentence embeddings (MiniLM on device). Null when unavailable. */
  embed?(texts: string[]): Promise<number[][] | null>;
  embedKey?(): string;
  online(): boolean;
  /** Raw GET (no CORS limits on native). Enables online research. */
  http?(url: string): Promise<string>;
  /** Live status line while Jarvis works ("Looking that up…"). */
  status?(text: string): void;
  kvGet<T>(key: string): Promise<T | undefined>;
  kvSet(key: string, v: unknown): Promise<void>;
  now(): Date;
}

export type PendingKind = 'slot' | 'confirm' | 'choice' | 'profile' | 'teach' | 'web' | 'riddle' | 'game' | 'name';

export interface Pending {
  kind: PendingKind;
  intent?: string;
  slot?: string;
  /** Original (normalised) utterance that caused the question. */
  utter?: string;
  raw?: string;
  options?: string[];
  key?: string;
  answer?: string;
  data?: Record<string, unknown>;
  turn: number;
}

export interface ToolTrace { name: string; args: Record<string, unknown>; ok?: boolean; result?: string; }

export interface DialogueState {
  turn: number;
  lastIntent?: string;
  lastTopic?: string;
  lastEnt?: Entities;
  lastTaskRef?: string;
  lastReminder?: string;
  lastBot?: string;
  lastContentSym?: string;
  pending?: Pending;
  /** Rolling user emotion. */
  emotion?: EmotionRead;
  recentIntents: string[];
}

export interface Turn {
  n: Normalized;
  raw: string;
  ent: Entities;
  intent: string;
  confidence: number;
  emotion: EmotionRead;
}

export interface Out {
  /** Grammar symbol to speak. */
  sym?: string;
  /** Literal text (appended after sym when both are set). */
  text?: string;
  vars?: Record<string, unknown>;
  pending?: Omit<Pending, 'turn'>;
  topic?: string;
  taskRef?: string;
  /** Skip proactive spice for this reply (lists, errors, sensitive moments). */
  quiet?: boolean;
  /** Ask the LLM (hybrid mode) instead. */
  defer?: boolean;
  /** Remember as "content" so "another one" repeats this symbol. */
  content?: string;
}

export interface ReflexReply {
  text: string;
  intent: string;
  confidence: number;
  tools: ToolTrace[];
  /** True when Reflex is not confident and an LLM (if present) should answer. */
  deferred: boolean;
  ms: number;
}
