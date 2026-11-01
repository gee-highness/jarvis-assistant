/** Time-of-day sky colours for the pup's world (pure, testable). */
type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) as RGB;
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;
const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;
/** [hour, top colour, bottom colour] */
const SKY: [number, string, string][] = [
  [0, '#0a1030', '#1a2350'], [5, '#1b2549', '#3b3a6d'], [6.5, '#f19a6a', '#ffd7a0'], [9, '#58b8ee', '#bfe8ff'], [15, '#4ab2ec', '#cdeeff'],
  [18, '#ee8458', '#ffcf8f'], [19.5, '#3b2f5e', '#7c4f7a'], [21, '#10173a', '#232c60'], [24, '#0a1030', '#1a2350'],
];
export function skyAt(hour: number): { top: string; bottom: string; night: number } {
  let i = 0;
  while (i < SKY.length - 2 && hour >= SKY[i + 1][0]) i++;
  const [h0, t0, b0] = SKY[i], [h1, t1, b1] = SKY[i + 1];
  const k = Math.max(0, Math.min(1, (hour - h0) / (h1 - h0 || 1)));
  const night = hour < 5 ? 1 : hour < 6.5 ? 1 - (hour - 5) / 1.5 : hour < 18.5 ? 0 : hour < 20.5 ? (hour - 18.5) / 2 : 1;
  return { top: css(mix(hex(t0), hex(t1), k)), bottom: css(mix(hex(b0), hex(b1), k)), night };
}

