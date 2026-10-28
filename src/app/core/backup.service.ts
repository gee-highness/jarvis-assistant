import { Injectable, inject, signal } from '@angular/core';
import { CapacitorHttp } from '@capacitor/core';
import { db } from './db';
import { BackupSnapshot } from './models';
import { isNative } from './native';
import { StoreService } from './store.service';
import { uid } from './util';

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function key(pass: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 200_000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** AES-256-GCM with a PBKDF2 key; returns a JSON envelope. */
export async function encryptText(plain: string, pass: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(pass, salt), new TextEncoder().encode(plain)));
  let bin = ''; for (let i = 0; i < ct.length; i += 0x8000) bin += String.fromCharCode(...ct.subarray(i, i + 0x8000));
  return JSON.stringify({ app: 'jarvis-enc', v: 1, salt: b64(salt), iv: b64(iv), data: btoa(bin) });
}
export async function decryptText(envelope: string, pass: string): Promise<string> {
  const e = JSON.parse(envelope);
  if (e?.app !== 'jarvis-enc') throw new Error('Not an encrypted Jarvis backup');
  try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(e.iv) as BufferSource }, await key(pass, unb64(e.salt)), unb64(e.data) as BufferSource)); }
  catch { throw new Error('Wrong passphrase or damaged file'); }
}

export type SyncResult = 'pushed' | 'pulled' | 'uptodate' | 'conflict' | 'error';

/** Local snapshots, encrypted exports and WebDAV sync. */
@Injectable({ providedIn: 'root' })
export class BackupService {
  private store = inject(StoreService);
  readonly snapshots = signal<BackupSnapshot[]>([]);
  readonly syncStatus = signal('');
  readonly syncing = signal(false);
  private started = false;

  async init() {
    this.snapshots.set(await db.backups.orderBy('at').reverse().toArray());
    if (this.started) return;
    this.started = true;
    setTimeout(() => this.autoSnapshot().catch(() => undefined), 20_000);
    setInterval(() => this.autoSnapshot().catch(() => undefined), 3 * 3600_000);
    if (this.store.settings().sync.enabled) setTimeout(() => this.sync().catch(() => undefined), 8_000);
    setInterval(() => { if (this.store.settings().sync.enabled && navigator.onLine) this.sync().catch(() => undefined); }, 15 * 60_000);
  }

  // ---- local snapshots (last 7 days, one per day)
  async autoSnapshot(force = false) {
    if (!force && !this.store.settings().autoBackup) return;
    const last = this.snapshots()[0];
    if (!force && last && new Date(last.at).toDateString() === new Date().toDateString()) return;
    const json = await this.store.exportJson();
    const snap: BackupSnapshot = { id: uid(), at: Date.now(), bytes: json.length, json };
    await db.backups.put(snap);
    const all = await db.backups.orderBy('at').reverse().toArray();
    for (const old of all.slice(7)) await db.backups.delete(old.id);
    this.snapshots.set(await db.backups.orderBy('at').reverse().toArray());
  }
  async restoreSnapshot(id: string) {
    const s = await db.backups.get(id);
    if (!s) throw new Error('Snapshot not found');
    await this.autoSnapshot(true);          // safety copy of the current state first
    await this.store.importJson(s.json);
  }
  async deleteSnapshot(id: string) { await db.backups.delete(id); this.snapshots.set(await db.backups.orderBy('at').reverse().toArray()); }

  // ---- WebDAV
  private fileUrl() {
    const s = this.store.settings().sync;
    return s.url.replace(/\/+$/, '') + '/jarvis-sync.enc';
  }
  private headers(): Record<string, string> {
    const s = this.store.settings().sync;
    return s.user ? { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent(`${s.user}:${s.pass}`))) } : {};
  }
  private async http(method: string, body?: string): Promise<{ status: number; text: string }> {
    const url = this.fileUrl(), headers = { ...this.headers(), 'Content-Type': 'application/octet-stream' };
    if (isNative()) {
      const r = await CapacitorHttp.request({ url, method, headers, data: body, responseType: 'text' });
      return { status: r.status, text: typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '') };
    }
    const r = await fetch(url, { method, headers, body });
    return { status: r.status, text: method === 'GET' ? await r.text() : '' };
  }

  dirtySince(): number { try { return +(localStorage.getItem('jarvis_dirty_at') ?? 0); } catch { return 0; } }
  private clearDirty() { try { localStorage.setItem('jarvis_dirty_at', '0'); } catch { /* ignore */ } }

  async push(): Promise<void> {
    const s = this.store.settings().sync;
    if (!s.url || !s.passphrase) throw new Error('Set the WebDAV address and a passphrase first');
    const env = await encryptText(JSON.stringify({ at: Date.now(), json: await this.store.exportJson() }), s.passphrase);
    const r = await this.http('PUT', env);
    if (r.status >= 300) throw new Error(`Server answered ${r.status}`);
    this.clearDirty();
    await this.store.updateSettings({ sync: { ...this.store.settings().sync, lastSync: Date.now(), lastRemote: Date.now() } });
  }

  private async fetchRemote(): Promise<{ at: number; json: string } | null> {
    const s = this.store.settings().sync;
    const r = await this.http('GET');
    if (r.status === 404) return null;
    if (r.status >= 300) throw new Error(`Server answered ${r.status}`);
    return JSON.parse(await decryptText(r.text, s.passphrase));
  }

  async pull(): Promise<boolean> {
    const remote = await this.fetchRemote();
    if (!remote) return false;
    await this.autoSnapshot(true);
    await this.store.importJson(remote.json);
    this.clearDirty();
    await this.store.updateSettings({ sync: { ...this.store.settings().sync, lastSync: Date.now(), lastRemote: remote.at } });
    return true;
  }

  /** Two-way sync with last-writer detection. Conflicts (both sides changed) are reported, never overwritten. */
  async sync(): Promise<SyncResult> {
    const s = this.store.settings().sync;
    if (!s.enabled || !s.url || !s.passphrase || this.syncing()) return 'error';
    this.syncing.set(true);
    try {
      const remote = await this.fetchRemote();
      const dirty = this.dirtySince() > s.lastSync;
      let res: SyncResult;
      if (!remote) { await this.push(); res = 'pushed'; }
      else if (remote.at > s.lastRemote) {
        if (dirty) res = 'conflict';
        else { await this.pull(); res = 'pulled'; }
      } else if (dirty) { await this.push(); res = 'pushed'; }
      else res = 'uptodate';
      this.syncStatus.set({ pushed: 'Uploaded to your cloud folder', pulled: 'Downloaded newer data from your cloud folder', uptodate: 'Everything is in sync', conflict: 'Conflict: both this phone and the cloud changed. Choose which to keep.', error: '' }[res]);
      return res;
    } catch (e: any) {
      this.syncStatus.set('Sync failed: ' + (e?.message ?? e));
      return 'error';
    } finally { this.syncing.set(false); }
  }
}
