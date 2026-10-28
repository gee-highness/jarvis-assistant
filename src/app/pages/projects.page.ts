import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TaskTemplate } from '../core/models';
import { JarvisDevice } from '../core/native';
import { StoreService } from '../core/store.service';

interface Applying { tpl: TaskTemplate; project: string; start: string; }
interface Editing { id?: string; name: string; icon: string; description: string; items: string; }

const toLines = (t: TaskTemplate) => t.items.map(i => [i.title, i.estimateMin ?? '', i.offsetDays ? '+' + i.offsetDays : ''].join(' | ').replace(/( \| )+$/, '')).join('\n');
function parseLines(s: string): TaskTemplate['items'] {
  return s.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [title, est, off] = l.split('|').map(x => x.trim());
    return { title, estimateMin: est && !isNaN(+est) ? +est : undefined, offsetDays: off ? parseInt(off.replace('+', ''), 10) || undefined : undefined };
  });
}

@Component({
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Projects</h1><button class="primary small" (click)="newProject.set('')">+ Project</button></div>

      @for (p of store.projects(); track p.name) {
        <div class="card proj">
          <div class="row between" (click)="go(p.name)">
            <b class="grow">{{ p.name }}</b><span class="chip cyan">{{ p.open }} open</span><span class="chip green">{{ p.done }} done</span>
          </div>
          <div class="bar"><i [style.width.%]="pct(p)"></i></div>
          <div class="row wrap">
            <button class="small" (click)="go(p.name)">Open tasks</button>
            <button class="small" (click)="saveAs(p.name)">Save as template</button>
            <button class="small ghost" (click)="archiveDone(p.name)">Clear completed</button>
          </div>
        </div>
      } @empty { <div class="card empty small">No projects yet. Tag tasks with a project, or start from a template below.</div> }

      <div class="page-head" style="margin-top:20px"><h2 class="upper" style="margin:0">Templates</h2><button class="small" (click)="edit.set(blank())">+ Template</button></div>
      <div class="grid">
        @for (t of store.templates(); track t.id) {
          <div class="card tpl">
            <div class="row between"><span class="ti">{{ t.icon }}</span><span class="chip">{{ t.items.length }} steps</span></div>
            <b>{{ t.name }}</b>
            <div class="small muted">{{ t.description }}</div>
            <div class="row wrap">
              <button class="small primary" (click)="applying.set({ tpl: t, project: t.name, start: store.today() })">Use</button>
              @if (!t.builtin) { <button class="small ghost" (click)="editTpl(t)">Edit</button><button class="small ghost" (click)="store.deleteTemplate(t.id)">Delete</button> }
            </div>
          </div>
        }
      </div>

      @if (applying(); as a) {
        <div class="scrim" (click)="applying.set(null)"><div class="card glow sheet" (click)="$event.stopPropagation()">
          <h2>{{ a.tpl.icon }} {{ a.tpl.name }}</h2>
          <label class="field">Project name<input [(ngModel)]="a.project"></label>
          <label class="field">Start date<input type="date" [(ngModel)]="a.start"></label>
          <div class="small muted">Creates {{ a.tpl.items.length }} tasks:</div>
          <ul class="small">@for (i of a.tpl.items; track $index) { <li>{{ i.title }}@if (i.estimateMin) { · {{ i.estimateMin }}m }@if (i.offsetDays) { · day +{{ i.offsetDays }} }</li> }</ul>
          <div class="row"><span class="grow"></span><button (click)="applying.set(null)">Cancel</button><button class="primary" (click)="apply(a)">Create tasks</button></div>
        </div></div>
      }

      @if (edit(); as e) {
        <div class="scrim" (click)="edit.set(null)"><div class="card glow sheet" (click)="$event.stopPropagation()">
          <h2>{{ e.id ? 'Edit' : 'New' }} template</h2>
          <div class="grid2"><label class="field">Icon<input [(ngModel)]="e.icon" maxlength="4"></label><label class="field">Name<input [(ngModel)]="e.name"></label></div>
          <label class="field">Description<input [(ngModel)]="e.description"></label>
          <label class="field">Steps: one per line, "title | minutes | +day"<textarea rows="7" [(ngModel)]="e.items" placeholder="Book venue | 20&#10;Send invites | 15 | +2"></textarea></label>
          <div class="row"><span class="grow"></span><button (click)="edit.set(null)">Cancel</button><button class="primary" [disabled]="!e.name.trim() || !e.items.trim()" (click)="saveTpl(e)">Save</button></div>
        </div></div>
      }

      @if (newProject() !== null) {
        <div class="scrim" (click)="newProject.set(null)"><div class="card glow sheet" (click)="$event.stopPropagation()">
          <h2>New project</h2>
          <label class="field">Name<input [ngModel]="newProject()" (ngModelChange)="newProject.set($event)" placeholder="Website redesign"></label>
          <div class="row"><span class="grow"></span><button (click)="newProject.set(null)">Cancel</button><button class="primary" [disabled]="!newProject()?.trim()" (click)="createProject()">Create</button></div>
        </div></div>
      }
    </div>
  `,
  styles: [`
    .proj { display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px; }
    .bar { height: 6px; border-radius: 4px; background: rgba(34,211,238,.12); overflow: hidden; } .bar i { display: block; height: 100%; background: linear-gradient(90deg,#22d3ee,#4ade80); }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; } .tpl { display: flex; flex-direction: column; gap: 6px; } .ti { font-size: 1.6rem; } .wrap { flex-wrap: wrap; gap: 6px; }
    .scrim { position: fixed; inset: 0; z-index: 45; background: rgba(0,0,0,.6); display: flex; align-items: flex-end; justify-content: center; }
    .sheet { width: 100%; max-width: 600px; border-radius: 18px 18px 0 0; display: flex; flex-direction: column; gap: 10px; padding-bottom: calc(20px + var(--safe-bottom)); max-height: 90vh; overflow-y: auto; }
  `],
})
export class ProjectsPage {
  readonly store = inject(StoreService);
  private router = inject(Router);
  readonly applying = signal<Applying | null>(null);
  readonly edit = signal<Editing | null>(null);
  readonly newProject = signal<string | null>(null);
  readonly pct = (p: { open: number; done: number }) => (p.open + p.done ? Math.round((p.done / (p.open + p.done)) * 100) : 0);
  blank = (): Editing => ({ name: '', icon: '📋', description: '', items: '' });

  go(name: string) { this.router.navigate(['/tasks'], { queryParams: { project: name } }); }

  async apply(a: Applying) {
    await this.store.applyTemplate(a.tpl.id, { project: a.project.trim() || a.tpl.name, start: a.start });
    JarvisDevice.haptic({ kind: 'success' }).catch(() => undefined);
    this.applying.set(null);
    this.go(a.project.trim() || a.tpl.name);
  }
  editTpl(t: TaskTemplate) { this.edit.set({ id: t.id, name: t.name, icon: t.icon, description: t.description ?? '', items: toLines(t) }); }
  async saveTpl(e: Editing) {
    await this.store.saveTemplate({ id: e.id, name: e.name.trim(), icon: e.icon || '📋', description: e.description, items: parseLines(e.items) });
    this.edit.set(null);
  }
  async saveAs(project: string) {
    const items = this.store.tasks().filter(t => t.project === project).slice().reverse().map(t => ({ title: t.title, estimateMin: t.estimateMin }));
    await this.store.saveTemplate({ name: project, icon: '📁', description: `Saved from project "${project}"`, items });
    JarvisDevice.haptic({ kind: 'success' }).catch(() => undefined);
  }
  async archiveDone(project: string) {
    for (const t of this.store.tasks().filter(x => x.project === project && x.status === 'done')) await this.store.deleteTask(t.id);
  }
  async createProject() {
    const name = this.newProject()?.trim();
    if (!name) return;
    await this.store.addTask({ title: `Define the outcome for ${name}`, project: name, due: this.store.today(), important: true });
    this.newProject.set(null);
    this.go(name);
  }
}
