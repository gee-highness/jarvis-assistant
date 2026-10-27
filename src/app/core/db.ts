import Dexie, { Table } from 'dexie';
import {
  Conversation, DayPlan, FocusSession, Habit, Memory, Message, Note, Reminder, Review, Settings, Task,
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
  }

  async exportAll(): Promise<Record<string, unknown[]>> {
    const out: Record<string, unknown[]> = {};
    for (const t of this.tables) out[t.name] = await t.toArray();
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
