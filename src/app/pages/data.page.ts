import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BackupService, decryptText, encryptText } from '../core/backup.service';
import { SyncSettings } from '../core/models';
import { JarvisDevice } from '../core/native';
import { StoreService } from '../core/store.service';

@Component({
  standalone: true,
  imports: [FormsModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Backup & Sync</h1></div>

      <div class="card stack">
        <h2>Automatic snapshots</h2>
        <label class="row small"><input type="checkbox" [ngModel]="s().autoBackup" (ngModelChange)="store.updateSettings({ autoBackup: $event })"> Keep a daily snapshot on this phone (last 7)</label>
        <button class="small" (click)="snap()">Snapshot now</button>
        @for (b of backup.snapshots(); track b.id) {
          <div class="row between small">
            <span>{{ b.at | date:'EEE d MMM, HH:mm' }} · {{ (b.bytes / 1024).toFixed(0) }} KB</span>
            <span><button class="small" (click)="restore(b.id)">Restore</button> <button class="ghost small" (click)="backup.deleteSnapshot(b.id)" aria-label="Delete">🗑</button></span>
          </div>
        } @empty { <div class="small muted">No snapshots yet.</div> }
      </div>

      <div class="card stack">
        <h2>Encrypted file backup</h2>
        <p class="small muted">AES-256 encrypted with your passphrase. Keep it somewhere safe: without it the file cannot be opened.</p>
        <input type="password" [(ngModel)]="pass" placeholder="Passphrase">
        <div class="row"><button class="grow" [disabled]="pass.length < 6" (click)="exportEnc()">Export encrypted</button>
          <label class="grow btn"><input type="file" hidden (change)="importEnc($event)" accept=".enc,.json"> Import file</label></div>
      </div>

      <div class="card stack">
        <div class="row between"><h2>Cloud sync (WebDAV)</h2><label class="row small"><input type="checkbox" [ngModel]="sy().enabled" (ngModelChange)="patch({ enabled: $event })"> On</label></div>
        <p class="small muted">Sync between your devices through your own Nextcloud, ownCloud, NAS or any WebDAV folder. Data is encrypted on this phone before upload.</p>
        <label class="field">Folder address<input [ngModel]="sy().url" (ngModelChange)="patch({ url: $event })" placeholder="https://cloud.example.com/remote.php/dav/files/me/Jarvis"></label>
        <div class="grid2">
          <label class="field">Username<input [ngModel]="sy().user" (ngModelChange)="patch({ user: $event })" autocomplete="off"></label>
          <label class="field">Password<input type="password" [ngModel]="sy().pass" (ngModelChange)="patch({ pass: $event })" autocomplete="off"></label>
        </div>
        <label class="field">Encryption passphrase (same on every device)<input type="password" [ngModel]="sy().passphrase" (ngModelChange)="patch({ passphrase: $event })"></label>
        <div class="row wrap">
          <button class="primary" [disabled]="backup.syncing()" (click)="syncNow()">{{ backup.syncing() ? 'Syncing…' : 'Sync now' }}</button>
          <button class="small" [disabled]="backup.syncing()" (click)="forcePush()">Upload this phone</button>
          <button class="small" [disabled]="backup.syncing()" (click)="forcePull()">Download from cloud</button>
        </div>
        @if (backup.syncStatus()) { <div class="small" [class.err]="backup.syncStatus().startsWith('Sync failed') || backup.syncStatus().startsWith('Conflict')">{{ backup.syncStatus() }}</div> }
        @if (s().sync.lastSync) { <div class="small muted">Last sync {{ s().sync.lastSync | date:'d MMM HH:mm' }}</div> }
      </div>
      @if (msg()) { <div class="card small">{{ msg() }}</div> }
    </div>
  `,
  styles: [`.stack { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; } .wrap { flex-wrap: wrap; gap: 6px; } .err { color: var(--gold); } .btn { text-align: center; cursor: pointer; }`],
})
export class DataPage implements OnInit {
  readonly store = inject(StoreService);
  readonly backup = inject(BackupService);
  readonly s = this.store.settings;
  readonly sy = computed(() => this.s().sync);
  readonly msg = signal('');
  pass = '';

  ngOnInit() { this.backup.init(); }
  patch(p: Partial<SyncSettings>) { return this.store.updateSettings({ sync: { ...this.s().sync, ...p } }); }

  async snap() { await this.backup.autoSnapshot(true); this.msg.set('Snapshot saved.'); }
  async restore(id: string) {
    if (!confirm('Replace current data with this snapshot? A safety snapshot is taken first.')) return;
    try { await this.backup.restoreSnapshot(id); this.msg.set('Restored. Restart the app to reload everything.'); } catch (e: any) { this.msg.set(e?.message ?? String(e)); }
  }
  async exportEnc() {
    try {
      const env = await encryptText(await this.store.exportJson(), this.pass);
      const r = await JarvisDevice.saveFile({ name: `jarvis-${this.store.today()}.enc`, content: env, mime: 'application/octet-stream' });
      this.msg.set(`Saved to ${r.uri}`);
    } catch (e: any) { this.msg.set('Export failed: ' + (e?.message ?? e)); }
  }
  async importEnc(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return;
    if (!this.pass) { this.msg.set('Enter the passphrase first.'); return; }
    if (!confirm('Replace ALL current data with this backup?')) return;
    try {
      const text = await f.text();
      const json = text.includes('"jarvis-enc"') ? await decryptText(text, this.pass) : text;
      await this.backup.autoSnapshot(true);
      await this.store.importJson(json);
      this.msg.set('Backup restored. Restart the app to reload everything.');
    } catch (e: any) { this.msg.set('Import failed: ' + (e?.message ?? e)); }
  }
  async syncNow() { const r = await this.backup.sync(); if (r === 'pulled') this.msg.set('New data downloaded. Restart the app to reload everything.'); }
  async forcePush() { if (confirm('Overwrite the cloud copy with this phone?')) { try { await this.backup.push(); this.backup.syncStatus.set('Uploaded.'); } catch (e: any) { this.backup.syncStatus.set('Sync failed: ' + (e?.message ?? e)); } } }
  async forcePull() { if (confirm('Overwrite this phone with the cloud copy?')) { try { this.backup.syncStatus.set((await this.backup.pull()) ? 'Downloaded. Restart the app.' : 'Nothing in the cloud yet.'); } catch (e: any) { this.backup.syncStatus.set('Sync failed: ' + (e?.message ?? e)); } } }
}
