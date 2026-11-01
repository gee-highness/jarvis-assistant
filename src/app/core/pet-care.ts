/**
 * Pure rules for the companion pup: bond levels, unlocks, daily care, badges and mood.
 * No Angular, no clock: everything is a function of its inputs so it can be tested headless.
 * Design rule: nothing here ever punishes you. XP only grows, a missed day costs nothing,
 * and the pup is always glad to see you.
 */
import type { PetCare, PetSettings, PetStats } from './models';
import { EMPTY_CARE, EMPTY_STATS } from './models';
import type { PetMood } from './pet-art';

// ------------------------------------------------------------------ bond
export const BOND_TITLES: [number, string][] = [[1, 'New friends'], [2, 'Buddies'], [3, 'Pals'], [5, 'Best friends'], [7, 'Partners in crime'], [10, 'Inseparable'], [14, 'Soulmates'], [20, 'Legends']];
/** Total bond XP needed to reach `level` (level 1 = 0). */
export const xpForBond = (level: number) => 40 * level * (level - 1);
export function bondFor(xp: number): { level: number; title: string; into: number; need: number; pct: number } {
  let level = 1;
  while (xp >= xpForBond(level + 1)) level++;
  const floor = xpForBond(level), next = xpForBond(level + 1);
  const title = [...BOND_TITLES].reverse().find(([l]) => level >= l)?.[1] ?? 'New friends';
  return { level, title, into: xp - floor, need: next - floor, pct: Math.min(100, Math.round(((xp - floor) / (next - floor)) * 100)) };
}

/** How much bond each kind moment is worth. */
export const XP = { pet: 1, feed: 4, fetch: 3, catch: 1, catchRound: 6, cups: 4, cuddleMinute: 3, calmMinute: 4, nap: 6, breath: 5, walk: 8, talk: 1, perfect: 25, visit: 5, gift: 3, joke: 1 } as const;

// ------------------------------------------------------------------ unlocks
export type UnlockKind = 'accessory' | 'scene' | 'toy';
export interface Unlockable { id: string; kind: UnlockKind; name: string; icon: string; level: number; blurb: string }
export const UNLOCKS: Unlockable[] = [
  { id: 'none', kind: 'accessory', name: 'Plain', icon: '🐕', level: 1, blurb: 'Just a good pup' },
  { id: 'bowtie', kind: 'accessory', name: 'Bow tie', icon: '🎀', level: 2, blurb: 'Dapper' },
  { id: 'flower', kind: 'accessory', name: 'Flowers', icon: '🌸', level: 2, blurb: 'Soft and sweet' },
  { id: 'glasses', kind: 'accessory', name: 'Glasses', icon: '🤓', level: 3, blurb: 'Very studious' },
  { id: 'scarf', kind: 'accessory', name: 'Cosy scarf', icon: '🧣', level: 3, blurb: 'Warm and snug' },
  { id: 'headphones', kind: 'accessory', name: 'Headphones', icon: '🎧', level: 4, blurb: 'Lo-fi pup' },
  { id: 'cap', kind: 'accessory', name: 'Cap', icon: '🧢', level: 5, blurb: 'Out for walkies' },
  { id: 'shades', kind: 'accessory', name: 'Shades', icon: '😎', level: 6, blurb: 'Too cool' },
  { id: 'party', kind: 'accessory', name: 'Party hat', icon: '🥳', level: 7, blurb: 'Every day is a party' },
  { id: 'wizard', kind: 'accessory', name: 'Wizard hat', icon: '🧙', level: 9, blurb: 'Magic treats' },
  { id: 'crown', kind: 'accessory', name: 'Crown', icon: '👑', level: 12, blurb: 'Good boy royalty' },

  { id: 'meadow', kind: 'scene', name: 'Sunny meadow', icon: '🌼', level: 1, blurb: 'Wide open sky' },
  { id: 'bedroom', kind: 'scene', name: 'Cosy bedroom', icon: '🛏', level: 2, blurb: 'Lamp light and blankets' },
  { id: 'garden', kind: 'scene', name: 'Quiet garden', icon: '🌿', level: 3, blurb: 'Petals and butterflies' },
  { id: 'beach', kind: 'scene', name: 'Calm beach', icon: '🏖', level: 4, blurb: 'Waves and warm sand' },
  { id: 'cabin', kind: 'scene', name: 'Warm cabin', icon: '🔥', level: 6, blurb: 'Fireplace glow' },
  { id: 'starry', kind: 'scene', name: 'Starry hill', icon: '🌌', level: 8, blurb: 'Fireflies and stars' },

  { id: 'ball', kind: 'toy', name: 'Ball', icon: '🎾', level: 1, blurb: 'Classic' },
  { id: 'bone', kind: 'toy', name: 'Bone', icon: '🦴', level: 2, blurb: 'Chewy' },
  { id: 'frisbee', kind: 'toy', name: 'Frisbee', icon: '🥏', level: 3, blurb: 'Catches the wind' },
  { id: 'plush', kind: 'toy', name: 'Plush', icon: '🧸', level: 5, blurb: 'Squeaky' },
  { id: 'stick', kind: 'toy', name: 'Stick', icon: '🪵', level: 7, blurb: 'The best stick' },
];
export const unlockById = (id: string) => UNLOCKS.find(u => u.id === id);
export const isUnlocked = (id: string, level: number) => (unlockById(id)?.level ?? 99) <= level;
export const newUnlocks = (from: number, to: number) => UNLOCKS.filter(u => u.level > from && u.level <= to);

// ------------------------------------------------------------------ daily care
export const TREAT_CAP = 20;
export const DAILY_TASK_TREATS = 10;
export const STEPS_FOR_WALK = 3000;

/** A new day starts a fresh checklist but keeps the treat jar. */
export function rollover(care: PetCare | undefined, today: string): PetCare {
  const c = { ...EMPTY_CARE, ...(care ?? {}) };
  if (c.day === today) return c;
  return { ...EMPTY_CARE, day: today, treats: Math.min(TREAT_CAP, c.treats) };
}
/** Finished tasks become treats (up to a daily limit), once each. */
export function creditTasks(care: PetCare, doneToday: number): PetCare {
  const target = Math.min(DAILY_TASK_TREATS, Math.max(0, doneToday));
  if (target <= care.credited) return care;
  return { ...care, credited: target, treats: Math.min(TREAT_CAP, care.treats + (target - care.credited)) };
}
export const HEARTS = ['fed', 'walked', 'played', 'cuddled'] as const;
export type Heart = (typeof HEARTS)[number];
export const heartDone = (c: PetCare, h: Heart): boolean => (h === 'fed' ? c.fed > 0 : h === 'walked' ? c.walked : h === 'played' ? c.played > 0 : c.cuddled > 0 || c.calm > 0);
export const careCount = (c: PetCare) => HEARTS.filter(h => heartDone(c, h)).length;
export const careComplete = (c: PetCare) => careCount(c) === HEARTS.length;
export const HEART_LABEL: Record<Heart, { icon: string; text: string }> = {
  fed: { icon: '🦴', text: 'Fed' }, walked: { icon: '🐾', text: 'Walked' }, played: { icon: '🎾', text: 'Played' }, cuddled: { icon: '💛', text: 'Cuddled' },
};

// ------------------------------------------------------------------ mood
export interface MoodInputs {
  hour: number; doneToday: number; openTasks: number; hadMitDone: boolean; steps?: number; streak: number; lowMood: boolean; care: PetCare;
}
/** Mood from your real day. Calm first: night is sleep, hard days are cuddles, never a guilt trip. */
export function moodFrom(i: MoodInputs): PetMood {
  if (i.hour >= 23 || i.hour < 6) return 'sleeping';
  if (i.lowMood) return 'cuddly';
  if (i.care.perfect) return 'excited';
  if (i.doneToday >= 5 || i.hadMitDone) return 'excited';
  if (i.steps !== undefined && i.steps >= 6000 && i.hour >= 12) return 'walk';
  if (i.streak >= 3 && i.doneToday >= 1) return 'proud';
  if (i.care.calm > 0 && i.hour >= 20) return 'zen';
  if (i.hour >= 13 && i.care.fed === 0 && i.care.treats > 0) return 'hungry';
  if (i.hour >= 15 && i.steps !== undefined && i.steps < 2000 && !i.care.walked) return 'bored';
  if (i.care.played > 0 && i.hour < 20) return 'playful';
  return 'happy';
}
/** Gentle suggestion for what the pup would love next (never an obligation). */
export function nextWish(c: PetCare, hour: number): { heart: Heart | 'calm'; text: string } | null {
  if (careComplete(c)) return null;
  if (hour >= 20 && !heartDone(c, 'cuddled')) return { heart: 'calm', text: 'A quiet cuddle before bed?' };
  if (!heartDone(c, 'fed') && c.treats > 0) return { heart: 'fed', text: 'A treat would make my day.' };
  if (!heartDone(c, 'played')) return { heart: 'played', text: 'Throw the ball? Just a few.' };
  if (!heartDone(c, 'walked')) return { heart: 'walked', text: 'A little walk together?' };
  if (!heartDone(c, 'cuddled')) return { heart: 'calm', text: 'Cuddles, whenever you are ready.' };
  return { heart: 'fed', text: 'A treat would make my day.' };
}

// ------------------------------------------------------------------ badges
export interface BadgeCtx { pets: number; stats: PetStats; bond: number; care: PetCare; steps?: number }
export interface Badge { id: string; name: string; icon: string; desc: string; xp: number; check: (c: BadgeCtx) => boolean }
export const BADGES: Badge[] = [
  { id: 'first-pat', name: 'First pat', icon: '🤚', desc: 'Pet your pup', xp: 2, check: c => c.pets >= 1 },
  { id: 'pats-100', name: 'Pat pat pat', icon: '👋', desc: '100 pats', xp: 10, check: c => c.pets >= 100 },
  { id: 'pats-1000', name: 'Professional petter', icon: '🏅', desc: '1,000 pats', xp: 30, check: c => c.pets >= 1000 },
  { id: 'first-treat', name: 'Treat time', icon: '🦴', desc: 'Give a treat', xp: 2, check: c => c.stats.feeds >= 1 },
  { id: 'feeds-50', name: 'Chef pup', icon: '🍖', desc: '50 treats given', xp: 12, check: c => c.stats.feeds >= 50 },
  { id: 'fetch-10', name: 'Fetch friends', icon: '🎾', desc: '10 fetches', xp: 6, check: c => c.stats.fetches >= 10 },
  { id: 'fetch-100', name: 'Fetch master', icon: '🥇', desc: '100 fetches', xp: 20, check: c => c.stats.fetches >= 100 },
  { id: 'catch-15', name: 'Sky snacker', icon: '🌟', desc: 'Catch 15 treats in one round', xp: 10, check: c => c.stats.bestCatch >= 15 },
  { id: 'cups', name: 'Sharp nose', icon: '👃', desc: 'Find the treat under the cup', xp: 4, check: c => c.stats.cups >= 1 },
  { id: 'first-breath', name: 'Deep breath', icon: '🌬', desc: 'Finish a breathing session', xp: 5, check: c => c.stats.breaths >= 1 },
  { id: 'calm-30', name: 'Calm corner', icon: '🧘', desc: '30 calm minutes together', xp: 15, check: c => c.stats.calmMin >= 30 },
  { id: 'calm-300', name: 'Zen pup', icon: '☯️', desc: '300 calm minutes together', xp: 40, check: c => c.stats.calmMin >= 300 },
  { id: 'nap', name: 'Nap buddies', icon: '😴', desc: 'Nap together', xp: 5, check: c => c.stats.naps >= 1 },
  { id: 'purr-1', name: 'Purr... bark?', icon: '💛', desc: 'Cuddle for a full minute', xp: 5, check: c => c.stats.cuddleSecs >= 60 },
  { id: 'perfect', name: 'Perfect pup day', icon: '🌈', desc: 'Fed, walked, played and cuddled in one day', xp: 12, check: c => c.stats.perfectDays >= 1 },
  { id: 'perfect-7', name: 'Pup week', icon: '🗓', desc: '7 perfect pup days', xp: 40, check: c => c.stats.perfectDays >= 7 },
  { id: 'days-3', name: 'Familiar face', icon: '👀', desc: 'Visit on 3 different days', xp: 5, check: c => c.stats.days >= 3 },
  { id: 'days-30', name: 'Always here', icon: '🏡', desc: 'Visit on 30 different days', xp: 40, check: c => c.stats.days >= 30 },
  { id: 'chat-20', name: 'Chatterbox', icon: '💬', desc: 'Talk with your pup 20 times', xp: 8, check: c => c.stats.talks >= 20 },
  { id: 'walker', name: 'Walkies champion', icon: '🚶', desc: '10,000 steps in a day', xp: 12, check: c => (c.steps ?? 0) >= 10000 },
  { id: 'stylist', name: 'Stylist', icon: '✨', desc: 'Try 3 different accessories', xp: 6, check: c => c.stats.tried.length >= 3 },
  { id: 'bond-5', name: 'Best friends', icon: '💞', desc: 'Reach bond level 5', xp: 15, check: c => c.bond >= 5 },
  { id: 'bond-10', name: 'Inseparable', icon: '💎', desc: 'Reach bond level 10', xp: 40, check: c => c.bond >= 10 },
];
export function earnedBadges(have: string[], ctx: BadgeCtx): Badge[] {
  return BADGES.filter(b => !have.includes(b.id) && b.check(ctx));
}

// ------------------------------------------------------------------ small helpers
export const mergeStats = (s?: Partial<PetStats>): PetStats => ({ ...EMPTY_STATS, ...(s ?? {}), tried: [...(s?.tried ?? [])] });
export const petBond = (p: Pick<PetSettings, 'xp'>) => bondFor(p.xp ?? 0);
/** A friendly "you were away" gap in hours, or 0 if just here. */
export const awayHours = (lastVisit: number, now: number) => (lastVisit ? Math.max(0, Math.floor((now - lastVisit) / 36e5)) : 0);
