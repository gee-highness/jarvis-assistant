import { Injectable, effect, inject } from '@angular/core';
import { DEFAULT_LOOK, LookSettings } from './models';
import { StoreService } from './store.service';

export interface ThemePreset { id: string; label: string; look: Partial<LookSettings>; light?: boolean; }

/** Ready-made looks; every value stays editable afterwards. */
export const THEME_PRESETS: ThemePreset[] = [
  { id: 'arc', label: 'Arc Reactor', look: { accent: '#22d3ee', accent2: '#a78bfa', background: 'space', glow: 60, grid: true, font: 'system' } },
  { id: 'iron', label: 'Iron', look: { accent: '#f43f5e', accent2: '#fbbf24', background: 'midnight', glow: 70, grid: true, font: 'condensed' } },
  { id: 'emerald', label: 'Emerald', look: { accent: '#34d399', accent2: '#a3e635', background: 'forest', glow: 45, grid: false, font: 'rounded' } },
  { id: 'royal', label: 'Royal', look: { accent: '#a78bfa', accent2: '#f472b6', background: 'midnight', glow: 55, grid: false, font: 'serif' } },
  { id: 'sunset', label: 'Sunset', look: { accent: '#fb923c', accent2: '#f472b6', background: 'wine', glow: 50, grid: false, font: 'rounded' } },
  { id: 'gold', label: 'Gold', look: { accent: '#fbbf24', accent2: '#fb923c', background: 'oled', glow: 40, grid: false, font: 'serif' } },
  { id: 'ocean', label: 'Ocean', look: { accent: '#38bdf8', accent2: '#2dd4bf', background: 'ocean', glow: 45, grid: false, font: 'rounded' } },
  { id: 'rose', label: 'Rose', look: { accent: '#fb7185', accent2: '#c084fc', background: 'wine', glow: 40, grid: false, font: 'rounded', radius: 22 } },
  { id: 'mono', label: 'Mono', look: { accent: '#e5e7eb', accent2: '#9ca3af', background: 'oled', glow: 0, grid: false, font: 'mono', radius: 6 } },
  { id: 'oled', label: 'Pure black', look: { accent: '#22d3ee', accent2: '#a78bfa', background: 'oled', glow: 20, grid: false, glass: false } },
  { id: 'paper', label: 'Paper (light)', light: true, look: { accent: '#0e7490', accent2: '#7c3aed', background: 'paper', glow: 10, grid: false, font: 'serif', glass: false } },
  { id: 'sand', label: 'Sand (light)', light: true, look: { accent: '#b45309', accent2: '#0f766e', background: 'sand', glow: 10, grid: false, font: 'rounded', glass: false, radius: 20 } },
];

const BG: Record<LookSettings['background'], { bg: string; bg2: string; light?: boolean }> = {
  space: { bg: '#05080d', bg2: '#0a1018' }, oled: { bg: '#000000', bg2: '#07090c' }, slate: { bg: '#0f141a', bg2: '#161d26' },
  midnight: { bg: '#07061a', bg2: '#0f0d26' }, forest: { bg: '#04100b', bg2: '#0a1a12' }, wine: { bg: '#12060c', bg2: '#1c0b14' },
  ocean: { bg: '#031019', bg2: '#071a28' }, sand: { bg: '#f7f1e6', bg2: '#efe5d3', light: true }, paper: { bg: '#f4f8fb', bg2: '#e8f0f5', light: true },
  custom: { bg: '#05080d', bg2: '#0a1018' },
};
const FONTS: Record<LookSettings['font'], string> = {
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  rounded: "'Nunito', 'Quicksand', 'Varela Round', ui-rounded, 'SF Pro Rounded', system-ui, sans-serif",
  serif: "'Iowan Old Style', 'Palatino Linotype', Georgia, 'Noto Serif', serif",
  mono: "ui-monospace, 'SF Mono', 'Roboto Mono', Menlo, Consolas, monospace",
  condensed: "'Roboto Condensed', 'Arial Narrow', 'Sofia Sans Condensed', system-ui, sans-serif",
};

export const rgbOf = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h.padEnd(6, '0');
  return [parseInt(full.slice(0, 2), 16) || 0, parseInt(full.slice(2, 4), 16) || 0, parseInt(full.slice(4, 6), 16) || 0];
};
const mix = (hex: string, toward: number, amt: number) => {
  const [r, g, b] = rgbOf(hex).map(v => Math.round(v + (toward - v) * amt));
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
};
const luminance = (hex: string) => { const [r, g, b] = rgbOf(hex).map(v => v / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

/** Applies the user's look as CSS variables on <html>. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private store = inject(StoreService);

  constructor() {
    effect(() => this.apply(this.store.settings().look ?? DEFAULT_LOOK, this.store.settings().theme));
  }

  isLight(look: LookSettings, theme: string): boolean {
    const sysDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    if (look.background === 'custom') return luminance(look.bgColor) > 0.5;
    if (theme === 'light') return true;
    if (theme === 'auto' && !sysDark) return true;
    return !!BG[look.background]?.light;
  }

  apply(look: LookSettings, theme: string) {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const light = this.isLight(look, theme);
    root.dataset['theme'] = light ? 'light' : 'dark';
    const base = look.background === 'custom'
      ? { bg: look.bgColor, bg2: mix(look.bgColor, light ? 0 : 255, 0.05) }
      : light && !BG[look.background].light ? BG.paper : !light && BG[look.background].light ? BG.space : BG[look.background];
    // in light mode, darken bright accents so text stays readable
    const accent = light && luminance(look.accent) > 0.45 ? mix(look.accent, 0, 0.45) : look.accent;
    const [r, g, b] = rgbOf(accent);
    const glow = look.glow / 100;
    const set = (k: string, v: string) => root.style.setProperty(k, v);
    set('--bg', base.bg);
    set('--bg-2', base.bg2);
    set('--cyan', accent);
    set('--cyan-2', mix(accent, 255, 0.35));
    set('--accent-deep', mix(accent, 0, 0.35));
    set('--accent-rgb', `${r}, ${g}, ${b}`);
    set('--violet', look.accent2);
    set('--line', `rgba(${r}, ${g}, ${b}, ${look.borders ? (light ? 0.2 : 0.18) : 0.06})`);
    set('--line-strong', `rgba(${r}, ${g}, ${b}, ${look.borders ? 0.45 : 0.15})`);
    set('--glow', glow ? `0 0 ${Math.round(6 + 24 * glow)}px rgba(${r}, ${g}, ${b}, ${(0.1 + 0.35 * glow).toFixed(2)})` : 'none');
    set('--radius', `${look.radius}px`);
    set('--font', FONTS[look.font] ?? FONTS.system);
    set('--on-accent', luminance(accent) > 0.5 ? '#04121a' : '#ffffff');
    set('--grid', look.grid ? `rgba(${r}, ${g}, ${b}, ${light ? 0.07 : 0.045})` : 'transparent');
    set('--panel', light ? 'rgba(255, 255, 255, 0.92)' : look.glass ? `${mix(base.bg2, 255, 0.04)}c7` : mix(base.bg2, 255, 0.03));
    set('--panel-solid', light ? '#ffffff' : mix(base.bg2, 255, 0.03));
    set('--nav-bg', light ? 'rgba(255, 255, 255, 0.96)' : `${base.bg}f0`);
    root.dataset['density'] = look.density;
    root.dataset['bubbles'] = look.bubbles;
    root.dataset['navlabels'] = look.navLabels ? 'on' : 'off';
    root.classList.toggle('no-glass', !look.glass);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', base.bg);
  }

  presetLook(id: string): LookSettings {
    const p = THEME_PRESETS.find(x => x.id === id);
    return { ...DEFAULT_LOOK, ...(p?.look ?? {}), preset: id };
  }

  /** Shareable theme code. */
  exportCode(look: LookSettings): string { return btoa(unescape(encodeURIComponent(JSON.stringify(look)))); }
  importCode(code: string): LookSettings | null {
    try { const j = JSON.parse(decodeURIComponent(escape(atob(code.trim())))); return { ...DEFAULT_LOOK, ...j, preset: 'custom' }; } catch { return null; }
  }
}
