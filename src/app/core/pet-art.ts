/**
 * The companion pup, drawn in SVG: an original design (one perky ear, one floppy ear, star freckles,
 * heart nose, bandana). Colours, accessory and mood are all parameters.
 */
export type PetMood = 'sleeping' | 'hungry' | 'bored' | 'happy' | 'excited' | 'proud' | 'cuddly' | 'lonely' | 'walk' | 'zen' | 'playful';
export interface PetLook { fur: string; patch: string; bandana: string; accessory: string; }

const shade = (hex: string, amt: number) => {
  const h = hex.replace('#', '');
  const n = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0).map(v => Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt)))));
  return `#${n.map(v => v.toString(16).padStart(2, '0')).join('')}`;
};

function eyes(mood: PetMood): string {
  const ink = '#2b1d14';
  switch (mood) {
    case 'sleeping': return `<path d="M70 92 q10 8 20 0" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M110 92 q10 8 20 0" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    case 'zen': return `<path d="M70 94 q10 -9 20 0" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M110 94 q10 -9 20 0" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    case 'playful': return `<ellipse cx="80" cy="92" rx="8" ry="10" fill="${ink}"/><circle cx="83" cy="88" r="3" fill="#fff"/><path d="M110 94 q10 -11 20 0" stroke="${ink}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
    case 'excited': case 'proud': return `<path d="M70 96 q10 -12 20 0" stroke="${ink}" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M110 96 q10 -12 20 0" stroke="${ink}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
    case 'cuddly': case 'lonely': case 'hungry': return `<ellipse cx="80" cy="92" rx="9" ry="11" fill="${ink}"/><ellipse cx="120" cy="92" rx="9" ry="11" fill="${ink}"/><circle cx="83" cy="87" r="3.4" fill="#fff"/><circle cx="123" cy="87" r="3.4" fill="#fff"/><circle cx="77" cy="96" r="1.8" fill="#fff"/><circle cx="117" cy="96" r="1.8" fill="#fff"/><path d="M68 80 l18 -5" stroke="${ink}" stroke-width="3" stroke-linecap="round"/><path d="M132 80 l-18 -5" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
    case 'bored': return `<ellipse cx="80" cy="94" rx="8" ry="6" fill="${ink}"/><ellipse cx="120" cy="94" rx="8" ry="6" fill="${ink}"/><path d="M70 88 h20 M110 88 h20" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
    default: return `<ellipse cx="80" cy="92" rx="8" ry="10" fill="${ink}"/><ellipse cx="120" cy="92" rx="8" ry="10" fill="${ink}"/><circle cx="83" cy="88" r="3" fill="#fff"/><circle cx="123" cy="88" r="3" fill="#fff"/>`;
  }
}

function mouth(mood: PetMood): string {
  const ink = '#2b1d14';
  if (mood === 'excited' || mood === 'proud' || mood === 'walk') return `<path d="M88 120 q12 16 24 0" stroke="${ink}" stroke-width="3.5" fill="#7a2e2e" stroke-linejoin="round"/><path d="M95 126 q5 10 10 0" fill="#ff8fa3"/>`;
  if (mood === 'zen') return `<path d="M90 119 q10 9 20 0" stroke="${ink}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
  if (mood === 'playful') return `<path d="M88 118 q12 14 24 0" stroke="${ink}" stroke-width="3.5" fill="#7a2e2e" stroke-linejoin="round"/><path d="M96 125 q4 14 9 0 z" fill="#ff8fa3" stroke="${ink}" stroke-width="2"/>`;
  if (mood === 'happy') return `<path d="M88 118 q6 8 12 0 q6 8 12 0" stroke="${ink}" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M97 122 q3 9 6 0" fill="#ff8fa3"/>`;
  if (mood === 'hungry') return `<ellipse cx="100" cy="123" rx="6" ry="7" fill="#7a2e2e" stroke="${ink}" stroke-width="2.5"/>`;
  if (mood === 'cuddly' || mood === 'lonely') return `<path d="M90 124 q10 -6 20 0" stroke="${ink}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
  if (mood === 'sleeping') return `<path d="M94 121 q6 4 12 0" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  return `<path d="M90 120 q10 8 20 0" stroke="${ink}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
}

function accessory(kind: string, bandana: string): string {
  switch (kind) {
    case 'bowtie': return `<g transform="translate(100 152)"><path d="M0 0 l-18 -10 v20 z M0 0 l18 -10 v20 z" fill="${shade(bandana, -0.25)}"/><circle r="5" fill="${bandana}"/></g>`;
    case 'glasses': return `<g fill="none" stroke="#1f2937" stroke-width="3.5"><circle cx="80" cy="92" r="15"/><circle cx="120" cy="92" r="15"/><path d="M95 92 h10 M65 90 l-12 -4 M135 90 l12 -4"/></g>`;
    case 'cap': return `<g><path d="M52 62 q48 -46 96 0 z" fill="${bandana}"/><path d="M140 60 q24 2 30 10 q-20 -2 -34 -2 z" fill="${shade(bandana, -0.3)}"/><circle cx="100" cy="30" r="5" fill="${shade(bandana, 0.4)}"/></g>`;
    case 'crown': return `<path d="M68 46 l10 -22 l12 16 l10 -20 l10 20 l12 -16 l10 22 z" fill="#fbbf24" stroke="#b45309" stroke-width="2.5" stroke-linejoin="round"/>`;
    case 'headphones': return `<g><path d="M48 92 q0 -66 52 -66 q52 0 52 66" fill="none" stroke="#1f2937" stroke-width="7"/><rect x="38" y="84" width="18" height="30" rx="8" fill="${bandana}"/><rect x="144" y="84" width="18" height="30" rx="8" fill="${bandana}"/></g>`;
    case 'scarf': return `<g><path d="M62 142 q38 24 76 0 l4 14 q-42 26 -84 0 z" fill="${bandana}"/><path d="M122 150 l10 30 l14 -4 l-8 -28 z" fill="${shade(bandana, -0.22)}"/><path d="M70 150 q30 14 60 0" stroke="${shade(bandana, 0.5)}" stroke-width="2" fill="none" stroke-dasharray="3 5"/></g>`;
    case 'flower': return `<g transform="translate(66 52)"><g fill="#fb7185"><circle cx="0" cy="-9" r="7"/><circle cx="9" cy="-3" r="7"/><circle cx="5" cy="8" r="7"/><circle cx="-5" cy="8" r="7"/><circle cx="-9" cy="-3" r="7"/></g><circle r="5" fill="#fbbf24"/></g><g transform="translate(132 50) scale(.7)"><g fill="#a78bfa"><circle cx="0" cy="-9" r="7"/><circle cx="9" cy="-3" r="7"/><circle cx="5" cy="8" r="7"/><circle cx="-5" cy="8" r="7"/><circle cx="-9" cy="-3" r="7"/></g><circle r="5" fill="#fde68a"/></g>`;
    case 'shades': return `<g><path d="M60 84 h36 q2 22 -18 22 q-20 0 -18 -22z M104 84 h36 q2 22 -18 22 q-20 0 -18 -22z" fill="#111827"/><path d="M96 88 h8" stroke="#111827" stroke-width="4"/><path d="M66 88 l10 -2 M112 88 l10 -2" stroke="#6b7280" stroke-width="2" opacity=".8"/></g>`;
    case 'party': return `<g><path d="M82 52 l18 -50 l18 50 z" fill="${bandana}"/><path d="M88 40 l24 0 M92 28 l16 0" stroke="#fff" stroke-width="3" opacity=".7"/><circle cx="100" cy="4" r="6" fill="#fbbf24"/></g>`;
    case 'wizard': return `<g><path d="M56 56 q44 -14 88 0 q-10 6 -44 6 q-34 0 -44 -6z" fill="#4c1d95"/><path d="M76 54 q22 -64 52 -50 q-18 6 -20 50 z" fill="#5b21b6"/><circle cx="104" cy="30" r="3" fill="#fde68a"/><circle cx="92" cy="44" r="2.2" fill="#fde68a"/></g>`;
    default: return '';
  }
}

/** Full SVG markup for the pup. */
export function petSvg(look: PetLook, mood: PetMood, opts: { animate?: boolean; size?: number } = {}): string {
  const fur = look.fur, furD = shade(look.fur, -0.18), patch = look.patch, muzzle = shade(look.fur, 0.6), band = look.bandana;
  const anim = opts.animate !== false;
  const wag = mood === 'sleeping' ? '' : `<animateTransform attributeName="transform" type="rotate" values="-14 150 150;18 150 150;-14 150 150" dur="${mood === 'excited' || mood === 'walk' ? '0.35s' : mood === 'bored' || mood === 'cuddly' ? '1.6s' : '0.8s'}" repeatCount="indefinite"/>`;
  const breathe = `<animateTransform attributeName="transform" type="scale" additive="sum" values="1 1;1 ${mood === 'sleeping' ? '1.035' : '1.015'};1 1" dur="${mood === 'sleeping' ? '3.4s' : '2.4s'}" repeatCount="indefinite"/>`;
  const zzz = mood === 'sleeping' ? `<g font-family="sans-serif" font-weight="700" fill="${band}"><text x="146" y="44" font-size="18" opacity=".9">z</text><text x="160" y="28" font-size="13" opacity=".7">z</text><text x="171" y="16" font-size="9" opacity=".5">z</text></g>` : '';
  const hearts = mood === 'cuddly' || mood === 'excited' ? `<path d="M160 40 c-4 -8 -14 -4 -10 4 l10 10 l10 -10 c4 -8 -6 -12 -10 -4z" fill="#fb7185" opacity=".9"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${opts.size ?? 200}" height="${opts.size ?? 200}">
  <ellipse cx="100" cy="188" rx="58" ry="7" fill="#000" opacity=".18"/>
  <g>${anim ? wag : ''}<path d="M148 158 q30 -6 34 -34 q2 -10 -6 -8 q-6 22 -32 30 z" fill="${furD}"/></g>
  <g transform-origin="100 170">${anim ? breathe : ''}
    <ellipse cx="100" cy="160" rx="50" ry="30" fill="${fur}"/>
    <ellipse cx="74" cy="182" rx="14" ry="8" fill="${muzzle}"/><ellipse cx="126" cy="182" rx="14" ry="8" fill="${muzzle}"/>
    <path d="M58 138 q42 34 84 0 q-6 22 -42 34 q-36 -12 -42 -34 z" fill="${band}"/>
    <circle cx="86" cy="150" r="2.4" fill="${shade(band, 0.6)}"/><circle cx="100" cy="156" r="2.4" fill="${shade(band, 0.6)}"/><circle cx="114" cy="150" r="2.4" fill="${shade(band, 0.6)}"/>
  </g>
  <path d="M60 70 q-14 -46 12 -52 q16 10 18 40 z" fill="${patch}"/>
  <path d="M66 62 q-6 -30 8 -36 q8 8 10 30 z" fill="${shade(patch, 0.35)}"/>
  <circle cx="100" cy="94" r="56" fill="${fur}"/>
  <path d="M136 56 q40 -6 40 30 q-2 26 -16 32 q-6 -30 -26 -44 z" fill="${patch}"/>
  <ellipse cx="78" cy="70" rx="22" ry="16" fill="${patch}" opacity=".55"/>
  <ellipse cx="100" cy="118" rx="30" ry="22" fill="${muzzle}"/>
  <g class="pup-eyes" style="transform-box:fill-box;transform-origin:center">${eyes(mood)}</g>
  <path d="M100 116 c-10 -12 -18 -2 -10 4 l10 8 l10 -8 c8 -6 0 -16 -10 -4 z" fill="#2b1d14"/>
  <ellipse cx="97" cy="109" rx="3" ry="1.6" fill="#fff" opacity=".7"/>
  <g transform="translate(0 9)">${mouth(mood)}</g>
  <ellipse cx="62" cy="110" rx="8" ry="5" fill="#ff8fa3" opacity=".45"/><ellipse cx="138" cy="110" rx="8" ry="5" fill="#ff8fa3" opacity=".45"/>
  <g fill="${shade(patch, -0.2)}" opacity=".8"><path d="M144 98 l1.6 3.4 3.6 .4 -2.7 2.4 .8 3.6 -3.3 -1.9 -3.3 1.9 .8 -3.6 -2.7 -2.4 3.6 -.4z"/><circle cx="152" cy="108" r="1.8"/><circle cx="141" cy="110" r="1.4"/></g>
  ${accessory(look.accessory, band)}
  ${zzz}${hearts}
</svg>`;
}

/** Renders the pup to a PNG data URL (for the Android home-screen widget). */
export async function petPng(look: PetLook, mood: PetMood, px = 256): Promise<string> {
  const svg = petSvg(look, mood, { animate: false, size: px });
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('render failed')); });
  const c = document.createElement('canvas');
  c.width = px; c.height = px;
  c.getContext('2d')!.drawImage(img, 0, 0, px, px);
  return c.toDataURL('image/png');
}

/** Small SVG toys for fetch and the wardrobe. */
export function toySvg(kind: string, size = 40): string {
  const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="${size}" height="${size}">${inner}</svg>`;
  switch (kind) {
    case 'bone': return wrap('<g fill="#f5f0e1" stroke="#c9b99a" stroke-width="1.5"><rect x="9" y="16" width="22" height="8" rx="3"/><circle cx="9" cy="15" r="4.5"/><circle cx="9" cy="25" r="4.5"/><circle cx="31" cy="15" r="4.5"/><circle cx="31" cy="25" r="4.5"/></g>');
    case 'frisbee': return wrap('<ellipse cx="20" cy="22" rx="16" ry="6" fill="#fb7185"/><ellipse cx="20" cy="20" rx="16" ry="6" fill="#fda4af"/><ellipse cx="20" cy="20" rx="8" ry="2.6" fill="#fb7185"/>');
    case 'plush': return wrap('<g><circle cx="20" cy="22" r="11" fill="#a78bfa"/><circle cx="12" cy="12" r="5" fill="#a78bfa"/><circle cx="28" cy="12" r="5" fill="#a78bfa"/><circle cx="16" cy="21" r="1.6" fill="#1f2937"/><circle cx="24" cy="21" r="1.6" fill="#1f2937"/><path d="M17 26 q3 3 6 0" stroke="#1f2937" stroke-width="1.5" fill="none"/></g>');
    case 'stick': return wrap('<g stroke="#8b5e3c" stroke-width="4" stroke-linecap="round"><path d="M6 32 L33 8"/><path d="M20 20 L12 16 M26 14 L32 18" stroke-width="3"/></g>');
    default: return wrap('<circle cx="20" cy="20" r="12" fill="#fbbf24"/><path d="M10 14 q10 6 20 0 M10 26 q10 -6 20 0" stroke="#fff" stroke-width="2" fill="none" opacity=".8"/><circle cx="16" cy="15" r="3" fill="#fff" opacity=".35"/>');
  }
}
