import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { DEFAULT_PET, PetSettings } from './models';
import { JarvisPet, isNative } from './native';
import { PetMood, petPng } from './pet-art';
import { ProgressService } from './progress.service';
import { ReflexService } from './reflex/reflex.service';
import { SenseService } from './sense.service';
import { StoreService } from './store.service';
import { addDays } from './util';

/** The companion pup: mood from your real day, speech from Reflex, mirrored to the home-screen widget. */
@Injectable({ providedIn: 'root' })
export class PetService {
  private store = inject(StoreService);
  private progress = inject(ProgressService);
  private sense = inject(SenseService);
  private reflex = inject(ReflexService);

  readonly pet = computed<PetSettings>(() => ({ ...DEFAULT_PET, ...(this.store.settings().pet ?? {}) }));
  /** Short-lived override after petting/playing. */
  readonly flash = signal<PetMood | null>(null);
  readonly line = signal('');
  readonly status = signal('');
  readonly tick = signal(0);

  readonly baseMood = computed<PetMood>(() => {
    this.tick();
    const h = new Date().getHours();
    const done = this.store.doneToday().length;
    const steps = this.sense.today()?.steps;
    const lastJ = this.store.journal()[0];
    const lowMood = (lastJ && lastJ.date >= addDays(this.store.today(), -1) && lastJ.mood <= 2)
      || (this.reflex.ready() && (this.reflex.engine.inner?.userMood ?? 0) < -0.3);
    if (h >= 23 || h < 6) return 'sleeping';
    if (lowMood) return 'cuddly';
    if (done >= 5 || (this.store.mits().length === 0 && this.store.doneToday().some(t => t.isMit))) return 'excited';
    if (steps !== undefined && steps >= 6000 && h >= 12) return 'walk';
    if (this.progress.streak() >= 3 && done >= 1) return 'proud';
    if (h >= 13 && done === 0 && this.store.openTasks().length > 0) return 'hungry';
    if (h >= 15 && steps !== undefined && steps < 2000) return 'bored';
    return 'happy';
  });
  readonly mood = computed<PetMood>(() => this.flash() ?? this.baseMood());

  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private lastKey = '';

  constructor() {
    setInterval(() => this.tick.update(n => n + 1), 10 * 60_000);
    effect(() => {
      const p = this.pet(), m = this.baseMood();
      this.store.doneToday().length; this.progress.streak();
      if (!p.enabled) return;
      if (this.renderTimer) clearTimeout(this.renderTimer);
      this.renderTimer = setTimeout(() => this.refresh(m).catch(() => undefined), 1500);
    });
  }

  async init() {
    if (!this.pet().bornAt) await this.save({ bornAt: Date.now() });
    await this.collectTaps();
  }

  /** Taps on the home-screen widget while the app was closed count as pets. */
  async collectTaps() {
    if (!isNative()) return;
    const { taps } = await JarvisPet.takeTaps().catch(() => ({ taps: 0 }));
    if (taps) await this.save({ pets: this.pet().pets + taps });
  }

  save(p: Partial<PetSettings>) { return this.store.updateSettings({ pet: { ...this.pet(), ...p } }); }

  vars(mood: PetMood) {
    const s = this.store.settings();
    return {
      mood, p: this.pet().personality, name: this.pet().name, h: s.userName || s.honorific, done: this.store.doneToday().length,
      streak: this.progress.streak(), steps: (this.sense.today()?.steps ?? 0).toLocaleString(), level: this.progress.level(), treats: this.store.doneToday().length,
    };
  }

  async refresh(mood = this.mood()) {
    await this.reflex.init();
    const r = this.reflex.engine.petLine(this.vars(mood));
    this.line.set(r.line);
    this.status.set(r.status);
    if (!isNative() || !this.pet().enabled) return;
    const p = this.pet();
    const key = `${p.fur}${p.patch}${p.bandana}${p.accessory}${mood}`;
    const look = { fur: p.fur, patch: p.patch, bandana: p.bandana, accessory: p.accessory };
    const imgs = key !== this.lastKey ? { idle: await petPng(look, mood), happy: await petPng(look, 'excited') } : {};
    this.lastKey = key;
    await JarvisPet.update({ ...imgs, line: r.line, status: r.status, reactions: r.reactions.join('|') }).catch(() => undefined);
  }

  /** Pat / play from the pet page. */
  async interact(kind: 'pet' | 'play') {
    this.flash.set(kind === 'play' ? 'excited' : 'happy');
    setTimeout(() => this.flash.set(null), 6000);
    if (kind === 'pet') await this.save({ pets: this.pet().pets + 1 });
    await this.reflex.init();
    const r = this.reflex.engine.petLine(this.vars(this.flash()!));
    this.line.set(kind === 'pet' ? r.reactions[0] : r.line);
  }
}
