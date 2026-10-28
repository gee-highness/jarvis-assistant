import { Injectable, signal } from '@angular/core';

export interface DiagError { at: number; msg: string; }

/** Captures uncaught errors so the Diagnostics page can show what actually went wrong. */
@Injectable({ providedIn: 'root' })
export class DiagService {
  readonly errors = signal<DiagError[]>([]);
  constructor() {
    const add = (m: unknown) => this.errors.update(a => [{ at: Date.now(), msg: String((m as any)?.message ?? m).slice(0, 300) }, ...a].slice(0, 25));
    window.addEventListener('error', e => add(e.error ?? e.message));
    window.addEventListener('unhandledrejection', e => add(e.reason));
  }
}
