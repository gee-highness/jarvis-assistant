import { Injectable, inject, signal } from '@angular/core';
import { DayPlan, Task, TimeBlock } from './models';
import { OllamaService } from './ollama.service';
import { StoreService } from './store.service';
import { extractJson, hm, minutesOf, timeOf } from './util';

@Injectable({ providedIn: 'root' })
export class PlannerService {
  private store = inject(StoreService);
  private ollama = inject(OllamaService);
  readonly busy = signal(false);

  /** Candidate tasks in priority order: MITs, overdue, due today, urgent+important, important, rest. */
  rankedTasks(): Task[] {
    const today = this.store.today();
    const score = (t: Task) =>
      (t.isMit ? 1000 : 0) + (t.due && t.due < today ? 500 : 0) + (t.due === today ? 300 : 0) +
      (t.urgent && t.important ? 200 : 0) + (t.important ? 100 : 0) + (t.urgent ? 50 : 0) - t.createdAt / 1e13;
    return [...this.store.openTasks()].sort((a, b) => score(b) - score(a));
  }

  /** Deterministic time-blocking: biggest-priority work in the earliest (freshest) slots, breaks every 90 min. */
  heuristic(from: string, to: string, fixed: TimeBlock[] = []): TimeBlock[] {
    const blocks: TimeBlock[] = [...fixed];
    const taken = (s: number, e: number) => fixed.some(f => minutesOf(f.start) < e && minutesOf(f.end) > s);
    let cursor = minutesOf(from);
    const end = minutesOf(to);
    let sinceBreak = 0;
    const s = this.store.settings();
    for (const t of this.rankedTasks()) {
      let dur = Math.min(Math.max(t.estimateMin ?? s.focusMin, 15), 120);
      while (cursor < end && taken(cursor, cursor + dur)) cursor += 15;
      if (cursor + dur > end) break;
      if (sinceBreak + dur > 90) {
        blocks.push({ start: timeOf(cursor), end: timeOf(cursor + 15), label: 'Break: stretch, water, eyes off screen', kind: 'break' });
        cursor += 15; sinceBreak = 0;
        if (cursor + dur > end) break;
      }
      blocks.push({ start: timeOf(cursor), end: timeOf(cursor + dur), label: t.title, taskId: t.id, kind: dur <= 20 ? 'admin' : 'focus' });
      cursor += dur; sinceBreak += dur;
    }
    return blocks.sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
  }

  /** AI time-blocking with heuristic fallback. */
  async generate(opts: { from?: string; to?: string; notes?: string; fixed?: TimeBlock[] } = {}): Promise<DayPlan> {
    this.busy.set(true);
    try {
      const s = this.store.settings();
      const nowMin = minutesOf(hm());
      const from = opts.from ?? timeOf(Math.max(minutesOf(s.workStart), Math.ceil(nowMin / 15) * 15));
      const to = opts.to ?? s.workEnd;
      const fixed = opts.fixed ?? [];
      const tasks = this.rankedTasks().slice(0, 15);
      let blocks: TimeBlock[] | null = null;
      if (tasks.length) {
        try {
          const list = tasks.map(t => `${t.id.slice(0, 8)} | ${t.title} | est ${t.estimateMin ?? '?'}m | ${t.isMit ? 'MIT ' : ''}${t.urgent ? 'urgent ' : ''}${t.important ? 'important ' : ''}${t.due ? 'due ' + t.due : ''}`).join('\n');
          const system =
`You are an expert time-blocking planner. Build a realistic schedule between ${from} and ${to}.
Rules: MITs first and in the earliest focus slots; deep work in 25-90 minute blocks; batch small tasks into one admin block; 10-15 minute break after every 60-90 minutes of work; leave ~15% slack; never overlap fixed events; don't schedule beyond ${to}.
Return JSON only: {"blocks":[{"start":"HH:MM","end":"HH:MM","label":"...","taskId":"<8-char id or omit>","kind":"focus|admin|break|fixed"}]}`;
          const user = `Tasks (id | title | estimate | flags):\n${list}\n${fixed.length ? 'Fixed events:\n' + fixed.map(f => `${f.start}-${f.end} ${f.label}`).join('\n') : ''}${opts.notes ? '\nUser notes: ' + opts.notes : ''}`;
          const out = await this.ollama.complete(system, user, { format: 'json', model: s.chatModel });
          const parsed = extractJson<{ blocks?: TimeBlock[] }>(out);
          blocks = this.validate(parsed?.blocks ?? [], from, to, tasks);
        } catch { blocks = null; }
      }
      if (!blocks || !blocks.length) blocks = this.heuristic(from, to, fixed);
      const plan: DayPlan = { date: this.store.today(), blocks, createdAt: Date.now() };
      await this.store.savePlan(plan);
      return plan;
    } finally { this.busy.set(false); }
  }

  private validate(raw: TimeBlock[], from: string, to: string, tasks: Task[]): TimeBlock[] {
    const re = /^\d{1,2}:\d{2}$/;
    const lo = minutesOf(from) - 1, hi = minutesOf(to) + 1;
    const out = raw
      .filter(b => b && re.test(b.start) && re.test(b.end) && b.label && minutesOf(b.end) > minutesOf(b.start))
      .filter(b => minutesOf(b.start) >= lo && minutesOf(b.end) <= hi)
      .map(b => ({
        start: timeOf(minutesOf(b.start)), end: timeOf(minutesOf(b.end)), label: String(b.label).slice(0, 120),
        taskId: b.taskId ? tasks.find(t => t.id.startsWith(String(b.taskId)))?.id : undefined,
        kind: (['focus', 'admin', 'break', 'fixed'].includes(b.kind) ? b.kind : 'focus') as TimeBlock['kind'],
      }))
      .sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
    // drop overlaps
    const clean: TimeBlock[] = [];
    for (const b of out) if (!clean.length || minutesOf(b.start) >= minutesOf(clean[clean.length - 1].end)) clean.push(b);
    return clean;
  }

  currentBlock(): TimeBlock | undefined {
    const now = minutesOf(hm());
    return this.store.todayPlan()?.blocks.find(b => minutesOf(b.start) <= now && minutesOf(b.end) > now);
  }
}
