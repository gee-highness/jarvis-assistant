import { Injectable, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { DEFAULT_PET, EMPTY_CARE, PetCare, PetSettings, PetStats } from './models';
import { JarvisDevice, JarvisPet, isNative } from './native';
import { PetAudio } from './pet-audio';
import { PetMood, petPng } from './pet-art';
import {
  BADGES, Badge, STEPS_FOR_WALK, XP, awayHours, bondFor, careComplete, creditTasks, earnedBadges, heartDone, mergeStats, moodFrom, newUnlocks, nextWish, rollover, unlockById,
} from './pet-care';
import { ProgressService } from './progress.service';
import { ReflexService } from './reflex/reflex.service';
import { SenseService } from './sense.service';
import { StoreService } from './store.service';
import { addDays } from './util';

export interface PetEvent { id: number; icon: string; title: string; text: string }

/**
 * The companion pup. Mood comes from your real day, care is a gentle daily checklist (never punishing),
 * bond XP only ever grows, and everything is mirrored to the home-screen widget.
 */
@Injectable({ providedIn: 'root' })
export class PetService {
  private store = inject(StoreService);
  private progress = inject(ProgressService);
  private sense = inject(SenseService);
  private reflex = inject(ReflexService);
  private injector = inject(Injector);

  readonly audio = new PetAudio();

  /** Local edits not yet flushed to storage, so rapid taps never overwrite each other. */
  private pending = signal<Partial<PetSettings>>({});
  private pendingVer = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  readonly pet = computed<PetSettings>(() => {
    const base = { ...DEFAULT_PET, ...(this.store.settings().pet ?? {}), ...this.pending() };
    return { ...base, care: { ...EMPTY_CARE, ...(base.care ?? {}) }, stats: mergeStats(base.stats) };
  });
  readonly bond = computed(() => bondFor(this.pet().xp));
  readonly care = computed(() => this.pet().care);
  readonly wish = computed(() => nextWish(this.care(), new Date().getHours()));

  /** Short-lived override after an interaction. */
  readonly flash = signal<PetMood | null>(null);
  readonly line = signal('');
  readonly status = signal('');
  readonly tick = signal(0);
  readonly events = signal<PetEvent[]>([]);
  private eid = 0;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  readonly baseMood = computed<PetMood>(() => {
    this.tick();
    const lastJ = this.store.journal()[0];
    const lowMood = (!!lastJ && lastJ.date >= addDays(this.store.today(), -1) && lastJ.mood <= 2)
      || (this.reflex.ready() && (this.reflex.engine.inner?.userMood ?? 0) < -0.3);
    return moodFrom({
      hour: new Date().getHours(), doneToday: this.store.doneToday().length, openTasks: this.store.openTasks().length,
      hadMitDone: this.store.mits().length === 0 && this.store.doneToday().some(t => t.isMit),
      steps: this.sense.today()?.steps, streak: this.progress.streak(), lowMood, care: this.care(),
    });
  });
  readonly mood = computed<PetMood>(() => this.flash() ?? this.baseMood());

  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private lastKey = '';

  constructor() {
    setInterval(() => this.tick.update(n => n + 1), 10 * 60_000);
    effect(() => {
      const p = this.pet(), m = this.baseMood();
      this.store.doneToday().length; this.progress.streak(); p.care.fed;
      if (!p.enabled) return;
      if (this.renderTimer) clearTimeout(this.renderTimer);
      this.renderTimer = setTimeout(() => this.refresh(m).catch(() => undefined), 1500);
    });
    // finished tasks become treats; a real walk counts as walkies
    effect(() => {
      const done = this.store.doneToday().length, steps = this.sense.today()?.steps ?? 0;
      if (!this.store.ready()) return;
      untracked(() => this.syncDay(done, steps));
    });
  }

  // ------------------------------------------------------------------ storage
  save(p: Partial<PetSettings>) {
    this.pending.update(cur => ({ ...cur, ...p }));
    const ver = ++this.pendingVer;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(async () => {
      const snapshot = this.pet();
      await this.store.updateSettings({ pet: snapshot }).catch(() => undefined);
      if (ver === this.pendingVer) this.pending.set({});
    }, 350);
  }
  /** Apply a change on top of the latest values (care/stats are objects, so edit a copy). */
  private edit(fn: (p: PetSettings) => Partial<PetSettings>) { this.save(fn(this.pet())); }

  private notify(icon: string, title: string, text = '') {
    const id = ++this.eid;
    this.events.update(e => [...e.slice(-3), { id, icon, title, text }]);
    setTimeout(() => this.events.update(e => e.filter(x => x.id !== id)), 5200);
  }
  dismiss(id: number) { this.events.update(e => e.filter(x => x.id !== id)); }

  // ------------------------------------------------------------------ lifecycle
  async init() {
    if (!this.pet().bornAt) this.save({ bornAt: Date.now() });
    await this.collectTaps();
    this.syncRoam().catch(() => undefined);
  }

  /** Called once the store is ready and whenever the page opens: new day, welcome, visit. */
  private syncDay(done: number, steps: number) {
    const today = this.store.today();
    const p = this.pet();
    let care = rollover(p.care, today);
    care = creditTasks(care, done);
    if (!care.walked && steps >= STEPS_FOR_WALK) care = { ...care, walked: true };
    if (JSON.stringify(care) !== JSON.stringify(p.care)) {
      this.save({ care });
      if (care.walked && !p.care.walked && p.care.day === today) this.grant(XP.walk, 'walk');
    }
  }

  /** The user opened the pup. Once per day it counts as a visit (never penalises absence). */
  async visit() {
    await this.reflex.init().catch(() => undefined);
    const today = this.store.today();
    const p = this.pet();
    this.syncDay(this.store.doneToday().length, this.sense.today()?.steps ?? 0);
    const away = awayHours(p.lastVisit, Date.now());
    let greeting = '';
    if (p.stats.lastDay !== today) {
      this.edit(q => ({ stats: { ...q.stats, days: q.stats.days + 1, visits: q.stats.visits + 1, lastDay: today }, lastVisit: Date.now() }));
      this.grant(XP.visit, 'visit');
      greeting = away >= 20 ? this.say('pet.welcome', { away: away >= 48 ? `${Math.floor(away / 24)} days` : 'a while' }) : this.say('pet.greet');
    } else this.edit(q => ({ stats: { ...q.stats, visits: q.stats.visits + 1 }, lastVisit: Date.now() }));
    if (greeting) this.line.set(greeting);
    this.audio.setVolume(this.pet().volume);
  }

  /** Taps on the home-screen widget while the app was closed count as pets. */
  async collectTaps() {
    if (!isNative()) return;
    const { taps } = await JarvisPet.takeTaps().catch(() => ({ taps: 0 }));
    if (taps) this.edit(p => ({ pets: p.pets + taps, xp: p.xp + taps * XP.pet }));
  }

  // ------------------------------------------------------------------ XP, badges, level ups
  grant(amount: number, why = '') {
    if (amount <= 0) return;
    const before = this.bond().level;
    this.edit(p => ({ xp: p.xp + amount }));
    const after = bondFor(this.pet().xp).level;
    if (after > before) {
      const unlocks = newUnlocks(before, after).map(u => `${u.icon} ${u.name}`);
      this.notify('💞', `Bond level ${after}`, unlocks.length ? `Unlocked: ${unlocks.join(', ')}` : this.say('pet.levelup'));
      this.audio.sparkle(); this.haptic('success');
    }
    this.checkBadges();
    void why;
  }
  private checkBadges() {
    const p = this.pet();
    const got = earnedBadges(p.badges, { pets: p.pets, stats: p.stats, bond: bondFor(p.xp).level, care: p.care, steps: this.sense.today()?.steps });
    if (!got.length) return;
    this.edit(q => ({ badges: [...q.badges, ...got.map(b => b.id)], xp: q.xp + got.reduce((a, b) => a + b.xp, 0) }));
    for (const b of got) this.notify(b.icon, b.name, b.desc);
    this.audio.sparkle();
  }
  badgeList(): { badge: Badge; got: boolean }[] { const have = this.pet().badges; return BADGES.map(b => ({ badge: b, got: have.includes(b.id) })); }

  private stat(patch: (s: PetStats) => Partial<PetStats>) { this.edit(p => ({ stats: { ...p.stats, ...patch(p.stats) } })); }
  private careSet(patch: (c: PetCare) => Partial<PetCare>) {
    this.edit(p => {
      let care = { ...rollover(p.care, this.store.today()), ...patch(rollover(p.care, this.store.today())) };
      let stats = p.stats, xp = p.xp;
      if (!care.perfect && careComplete(care)) {
        care = { ...care, perfect: true };
        stats = { ...stats, perfectDays: stats.perfectDays + 1 };
        xp += XP.perfect;
        this.notify('🌈', 'Perfect pup day', this.say('pet.perfect'));
        this.audio.sparkle();
      }
      return { care, stats, xp };
    });
    this.checkBadges();
  }

  // ------------------------------------------------------------------ moods, speech, haptics
  setFlash(m: PetMood, ms = 6000) {
    this.flash.set(m);
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.flash.set(null), ms);
  }
  say(sym: string, extra: Record<string, unknown> = {}): string {
    if (!this.reflex.ready()) return '';
    try { return this.reflex.engine.petSay(sym, { ...this.vars(this.mood()), ...extra }); } catch { return ''; }
  }
  private speak(sym: string, extra: Record<string, unknown> = {}) { const t = this.say(sym, extra); if (t) this.line.set(t); return t; }
  haptic(kind: 'tick' | 'light' | 'medium' | 'success' = 'light') {
    if (!this.pet().haptics) return;
    JarvisDevice.haptic({ kind }).catch(() => undefined);
  }
  sfx(fn: (a: PetAudio) => void) { if (this.pet().sound) { this.audio.setVolume(this.pet().volume); fn(this.audio); } }

  vars(mood: PetMood) {
    const s = this.store.settings();
    const p = this.pet();
    return {
      mood, p: p.personality, name: p.name, h: s.userName || s.honorific, done: this.store.doneToday().length,
      streak: this.progress.streak(), steps: (this.sense.today()?.steps ?? 0).toLocaleString(), level: this.bond().level, treats: p.care.treats, jar: p.care.treats,
    };
  }

  // ------------------------------------------------------------------ the widget
  async refresh(mood = this.mood()) {
    await this.reflex.init();
    const r = this.reflex.engine.petLine(this.vars(mood));
    this.line.update(cur => cur || r.line);
    this.status.set(r.status);
    if (!isNative() || !this.pet().enabled) return;
    const p = this.pet();
    const plain = p.speech === 'english';
    const key = `${p.fur}${p.patch}${p.bandana}${p.accessory}${mood}`;
    const look = { fur: p.fur, patch: p.patch, bandana: p.bandana, accessory: p.accessory };
    const imgs = key !== this.lastKey ? { idle: await petPng(look, mood), happy: await petPng(look, 'excited'), sleep: await petPng(look, 'sleeping'), walk: await petPng(look, 'walk') } : {};
    this.lastKey = key;
    const line = plain ? r.line : this.dogFor(r.line, mood);
    const reactions = plain ? r.reactions : r.reactions.map(() => this.dogFor('', 'happy'));
    await JarvisPet.update({ ...imgs, line, status: r.status, reactions: reactions.join('|') }).catch(() => undefined);
  }

  // ------------------------------------------------------------------ interactions
  pat() {
    this.edit(p => ({ pets: p.pets + 1, xp: p.xp + XP.pet }));
    this.setFlash('happy', 4000);
    this.haptic('light');
    this.sfx(a => a.voice(Math.random() < 0.3 ? 'happy' : 'yip'));
    if (Math.random() < 0.55) this.speak(Math.random() < this.pet().sass / 100 * 0.6 ? 'pet.sass.pat' : 'pet.react');
    this.checkBadges();
  }

  /** Spend a treat. Returns false (with a kind line) when the jar is empty. */
  feed(): boolean {
    const care = rollover(this.pet().care, this.store.today());
    if (care.treats <= 0) { this.speak('pet.fed.none'); return false; }
    this.careSet(c => ({ treats: c.treats - 1, fed: c.fed + 1 }));
    this.stat(s => ({ feeds: s.feeds + 1 }));
    this.edit(p => ({ treats: p.treats + 1 }));
    this.grant(XP.feed, 'feed');
    this.setFlash('excited', 5000);
    this.haptic('medium');
    this.sfx(a => a.voice('happy'));
    this.speak(Math.random() < this.pet().sass / 100 * 0.5 ? 'pet.sass.feed' : 'pet.fed');
    return true;
  }
  earnTreats(n: number) { if (n > 0) this.careSet(c => ({ treats: Math.min(20, c.treats + n) })); }

  fetched() {
    this.careSet(c => ({ played: c.played + 1 }));
    this.stat(s => ({ fetches: s.fetches + 1 }));
    this.grant(XP.fetch, 'fetch');
    this.setFlash('playful', 5000);
  }
  catchRound(caught: number) {
    if (caught <= 0) return;
    this.careSet(c => ({ played: c.played + 1 }));
    this.stat(s => ({ catches: s.catches + caught, bestCatch: Math.max(s.bestCatch, caught) }));
    this.earnTreats(Math.floor(caught / 5));
    this.grant(XP.catchRound + caught * XP.catch, 'catch');
    this.setFlash('playful', 6000);
    this.speak('pet.played');
  }
  cupsWon() {
    this.careSet(c => ({ played: c.played + 1 }));
    this.stat(s => ({ cups: s.cups + 1 }));
    this.grant(XP.cups, 'cups');
    this.setFlash('playful', 5000);
  }
  walked() {
    if (this.care().walked) return;
    this.careSet(c => ({ walked: true }));
    this.stat(s => ({ walks: s.walks + 1 }));
    this.grant(XP.walk, 'walk');
    this.setFlash('walk', 8000);
    this.speak('pet.walked');
  }
  /** A minute of cuddling or calm. */
  cuddleSeconds(secs: number) {
    if (secs <= 0) return;
    this.stat(s => ({ cuddleSecs: s.cuddleSecs + secs }));
    this.careSet(c => ({ cuddled: c.cuddled + 1 }));
    this.grant(Math.max(1, Math.round((secs / 60) * XP.cuddleMinute)), 'cuddle');
    this.checkBadges();
  }
  calmDone(kind: 'breath' | 'nap', minutes: number) {
    this.stat(s => ({ calmMin: s.calmMin + Math.round(minutes), breaths: s.breaths + (kind === 'breath' ? 1 : 0), naps: s.naps + (kind === 'nap' ? 1 : 0) }));
    this.careSet(c => ({ calm: c.calm + 1 }));
    this.grant(kind === 'nap' ? XP.nap : XP.breath + Math.round(minutes * XP.calmMinute), 'calm');
    this.setFlash('zen', 12000);
    this.speak('pet.calm.done');
  }
  talked() { this.stat(s => ({ talks: s.talks + 1 })); this.grant(XP.talk); }
  tryAccessory(id: string) {
    const tried = this.pet().stats.tried;
    if (!tried.includes(id)) this.stat(s => ({ tried: [...s.tried, id] }));
    this.checkBadges();
  }
  /** One small surprise a day: a few treats and a kind note. */
  openGift(): boolean {
    if (this.care().gift) return false;
    const n = 1 + Math.floor(Math.random() * 3);
    this.careSet(c => ({ gift: true, treats: Math.min(20, c.treats + n) }));
    this.grant(XP.gift, 'gift');
    this.notify('🎁', `${n} treat${n > 1 ? 's' : ''}`, this.say('pet.gift'));
    this.audio.sparkle();
    return true;
  }

  // ------------------------------------------------------------------ chat hooks (Reflex)
  /** Called from chat ("pet the dog", "feed Comet"). Returns a line for Jarvis to say. */
  async chatAction(kind: string): Promise<{ ok: boolean; line: string }> {
    await this.reflex.init().catch(() => undefined);
    const p = this.pet();
    switch (kind) {
      case 'pet': this.pat(); return { ok: true, line: this.say('pet.react') || `${p.name} wiggles happily.` };
      case 'feed': return this.feed() ? { ok: true, line: this.line() } : { ok: false, line: this.say('pet.fed.none') };
      case 'play': this.fetched(); return { ok: true, line: this.say('pet.played') };
      case 'walk': this.walked(); return { ok: true, line: this.say('pet.walked') };
      case 'open': case 'calm': this.injector.get(Router).navigateByUrl(kind === 'calm' ? '/pet?tab=calm' : '/pet').catch(() => undefined); return { ok: true, line: this.say('pet.open') };
      case 'joke': this.talked(); return { ok: true, line: this.say('pet.joke') };
      case 'wisdom': this.talked(); return { ok: true, line: this.say('pet.wisdom') };
      default: {
        const b = this.bond(), c = this.care();
        const hearts = (['fed', 'walked', 'played', 'cuddled'] as const).filter(h => heartDone(c, h)).length;
        return { ok: true, line: this.say('pet.report', { hearts, bondTitle: b.title, jar: c.treats, moodLabel: this.mood() }) };
      }
    }
  }

  // ------------------------------------------------------------------ dog language, orders and roaming
  /** The pup's bark for a moment (the real meaning is shown separately). */
  dogFor(english = '', mood: PetMood = this.mood()): string {
    if (!this.reflex.ready()) return 'Woof!';
    try {
      let d = this.reflex.engine.petSay('pet.dog', { ...this.vars(mood), mood });
      if (english.split(' ').length > 16) d += ' ' + this.reflex.engine.petSay('pet.dog.core', { ...this.vars(mood), mood });
      return d;
    } catch { return 'Woof!'; }
  }
  /** What the pup says on screens that only have room for one line: dog by default, plain words if chosen. */
  display(english: string): string { return this.pet().speech === 'english' ? english : this.dogFor(english); }
  /** Splits "Woof! — “meaning”" (how chat shows it) back into its two parts. */
  splitVoice(text: string): { dog: string; meaning: string } {
    const m = /^([\s\S]*?) — “([\s\S]*)”$/.exec(text.trim());
    return m ? { dog: m[1], meaning: m[2] } : { dog: '', meaning: text };
  }

  /** Give the pup an order ("open WhatsApp", "add buy milk", "what is on today"). He does it, and answers in his own way. */
  async order(text: string): Promise<string> {
    const clean = text.trim();
    if (!clean) return '';
    await this.reflex.init();
    this.setFlash('playful', 8000);
    // orders from the pup never delete or send anything without you: risky actions are declined here
    const r = await this.reflex.respond(`${this.pet().name}, ${clean}`, async () => false);
    this.stat(st => ({ talks: st.talks + 1 }));
    this.grant(XP.talk, 'order');
    this.sfx(a => a.voice('happy'));
    this.haptic('light');
    return r.text;
  }

  /** Overlay (the pup walking around your screen). Android only; needs "Display over other apps". */
  readonly roamState = signal<{ granted: boolean; running: boolean; usageAccess: boolean }>({ granted: false, running: false, usageAccess: false });
  async roamStatus() {
    if (!isNative()) return;
    const st = await JarvisPet.overlayStatus().catch(() => null);
    if (st) this.roamState.set({ granted: st.granted, running: st.running, usageAccess: st.usageAccess });
  }
  async setRoam(on: boolean): Promise<'ok' | 'permission' | 'unsupported'> {
    if (!isNative()) return 'unsupported';
    if (!on) { this.save({ roam: false }); await JarvisPet.overlayStop().catch(() => undefined); await this.roamStatus(); return 'ok'; }
    await this.roamStatus();
    if (!this.roamState().granted) { this.save({ roam: true }); await JarvisPet.requestOverlayPermission().catch(() => undefined); return 'permission'; }
    this.save({ roam: true });
    await this.pushRoam(true);
    return 'ok';
  }
  /** Start or update the overlay with the current look and settings. */
  async pushRoam(start = false) {
    if (!isNative()) return;
    await this.refresh(this.mood()).catch(() => undefined);
    const p = this.pet();
    const lines = Array.from({ length: 14 }, () => this.dogFor('', Math.random() < 0.5 ? 'happy' : 'playful')).filter((v, i, a) => a.indexOf(v) === i).join('|');
    const cfg = { where: p.roamWhere, size: p.roamSize, lines, name: p.name };
    if (start) await JarvisPet.overlayStart(cfg).catch(() => undefined); else await JarvisPet.overlayConfig(cfg).catch(() => undefined);
    await this.roamStatus();
  }
  /** On launch and resume: pick the overlay up again if it should be running (e.g. after granting the permission). */
  async syncRoam() {
    if (!isNative()) return;
    await this.roamStatus();
    const p = this.pet();
    if (p.roam && p.enabled && this.roamState().granted) await this.pushRoam(!this.roamState().running);
    else if (this.roamState().running && !p.roam) await JarvisPet.overlayStop().catch(() => undefined);
  }

  // ------------------------------------------------------------------ cosmetics
  unlockedName(id: string) { return unlockById(id)?.name ?? id; }
}
