import Dexie, { Table } from 'dexie';
import {
  Conversation, DayPlan, FocusSession, Goal, Habit, JournalEntry, Memory, Message, Note, ProgressState, Reminder, Review, Settings, Task,
  TaskTemplate, XpEvent, LibDoc, LibChunk, BackupSnapshot,
} from './models';

export class JarvisDb extends Dexie {
  tasks!: Table<Task, string>;
  habits!: Table<Habit, string>;
  sessions!: Table<FocusSession, string>;
  plans!: Table<DayPlan, string>;
  reviews!: Table<Review, string>;
  notes!: Table<Note, string>;
  memories!: Table<Memory, string>;
  conversations!: Table<Conversation, string>;
  messages!: Table<Message, string>;
  reminders!: Table<Reminder, string>;
  settings!: Table<Settings, string>;
  goals!: Table<Goal, string>;
  journal!: Table<JournalEntry, string>;
  templates!: Table<TaskTemplate, string>;
  xp!: Table<XpEvent, string>;
  progress!: Table<ProgressState, string>;
  docs!: Table<LibDoc, string>;
  chunks!: Table<LibChunk, string>;
  backups!: Table<BackupSnapshot, string>;

  constructor() {
    super('jarvis');
    this.version(1).stores({
      tasks: 'id, status, due, isMit, inbox, createdAt, doneAt',
      habits: 'id, archived',
      sessions: 'id, start, taskId, kind',
      plans: 'date',
      reviews: 'id, date, kind',
      notes: 'id, updatedAt, *tags',
      memories: 'id, kind, pinned, createdAt',
      conversations: 'id, updatedAt',
      messages: 'id, conversationId, createdAt, [conversationId+createdAt]',
      reminders: 'id, at, done',
      settings: 'id',
    });
    this.version(2).stores({
      tasks: 'id, status, due, isMit, inbox, createdAt, doneAt, goalId, project',
      goals: 'id, status, createdAt',
      journal: 'id, date, createdAt',
      templates: 'id',
      xp: 'id, ref, date, kind, at',
      progress: 'id',
    });
    this.version(3).stores({
      tasks: 'id, status, due, isMit, inbox, createdAt, doneAt, goalId, project, *tags',
      docs: 'id, addedAt',
      chunks: 'id, docId',
      backups: 'id, at',
    });
    // any local change marks the data as dirty for sync
    for (const t of this.tables) {
      if (t.name === 'backups') continue;
      const mark = () => { try { localStorage.setItem('jarvis_dirty_at', String(Date.now())); } catch { /* ignore */ } };
      t.hook('creating', () => { mark(); });
      t.hook('updating', () => { mark(); });
      t.hook('deleting', () => { mark(); });
    }
  }

  async exportAll(): Promise<Record<string, unknown[]>> {
    const out: Record<string, unknown[]> = {};
    for (const t of this.tables) if (t.name !== 'backups') out[t.name] = await t.toArray();
    return out;
  }

  async importAll(data: Record<string, unknown[]>): Promise<void> {
    await this.transaction('rw', this.tables, async () => {
      for (const t of this.tables) {
        const rows = data[t.name];
        if (!Array.isArray(rows)) continue;
        await t.clear();
        await t.bulkPut(rows as never[]);
      }
    });
  }
}

export const db = new JarvisDb();
