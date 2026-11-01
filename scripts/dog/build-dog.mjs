// Builds src/assets/pet/dog.glb: a rigged, animated 3D dog generated entirely from code (no third-party assets, no licences).
//   node scripts/dog/build-dog.mjs
import fs from 'fs';
import { dogSdf, surfaceNets, len } from './sdf.mjs';

const OUT = new URL('../../src/assets/pet/dog.glb', import.meta.url).pathname;
const H = Number(process.env.CELL || 0.0105);

// ------------------------------------------------------------------ skeleton (rest pose, world positions)
const B = [];
const bone = (name, parent, pos, seg) => { B.push({ name, parent, pos, seg: seg ?? null, i: B.length }); return B.length - 1; };
const mir = (p, sx) => [p[0] * sx, p[1], p[2]];
bone('pelvis', -1, [0, 0.5, -0.3], [[0, 0.5, -0.4], [0, 0.48, -0.14]]);
bone('spine1', 0, [0, 0.48, -0.1], [[0, 0.48, -0.14], [0, 0.5, 0.1]]);
bone('spine2', 1, [0, 0.5, 0.12], [[0, 0.5, 0.1], [0, 0.56, 0.3]]);
bone('neck1', 2, [0, 0.58, 0.3], [[0, 0.58, 0.3], [0, 0.68, 0.42]]);
bone('neck2', 3, [0, 0.68, 0.42], [[0, 0.68, 0.42], [0, 0.77, 0.52]]);
bone('head', 4, [0, 0.77, 0.52], [[0, 0.79, 0.52], [0, 0.78, 0.7]]);
bone('jaw', 5, [0, 0.755, 0.575], [[0, 0.742, 0.6], [0, 0.738, 0.69]]);
for (const [n, sx] of [['L', 1], ['R', -1]]) bone('ear' + n, 5, mir([0.086, 0.845, 0.525], sx), [mir([0.088, 0.84, 0.525], sx), mir([0.09, 0.69, 0.525], sx)]);
bone('tail1', 0, [0, 0.54, -0.46], [[0, 0.54, -0.46], [0, 0.62, -0.58]]);
bone('tail2', B.length - 1, [0, 0.62, -0.58], [[0, 0.62, -0.58], [0, 0.69, -0.7]]);
bone('tail3', B.length - 1, [0, 0.69, -0.7], [[0, 0.69, -0.7], [0, 0.7, -0.78]]);
bone('tail4', B.length - 1, [0, 0.7, -0.78], [[0, 0.7, -0.78], [0, 0.7, -0.86]]);
const legs = {};
for (const [n, sx] of [['L', 1], ['R', -1]]) {
  const fs = mir([0.09, 0.52, 0.2], sx), fe = mir([0.088, 0.31, 0.17], sx), fw = mir([0.08, 0.1, 0.19], sx), fp = mir([0.08, 0.034, 0.232], sx);
  const f1 = bone('fShoulder' + n, 2, fs, [fs, fe]); const f2 = bone('fElbow' + n, f1, fe, [fe, fw]); const f3 = bone('fWrist' + n, f2, fw, [fw, fp]);
  const f4 = bone('fPaw' + n, f3, fp, [fp, [fp[0], 0.03, fp[2] + 0.06]]);
  const hh = mir([0.1, 0.46, -0.3], sx), hk = mir([0.105, 0.3, -0.21], sx), hk2 = mir([0.08, 0.13, -0.35], sx), hp = mir([0.08, 0.034, -0.31], sx);
  const h1 = bone('hHip' + n, 0, hh, [hh, hk]); const h2 = bone('hStifle' + n, h1, hk, [hk, hk2]); const h3 = bone('hHock' + n, h2, hk2, [hk2, hp]);
  const h4 = bone('hPaw' + n, h3, hp, [hp, [hp[0], 0.03, hp[2] + 0.06]]);
  legs[n] = { f1, f2, f3, f4, h1, h2, h3, h4, sx };
}
const idx = (name) => B.find(b => b.name === name).i;

// ------------------------------------------------------------------ mesh
const f = dogSdf();
console.log('meshing…');
const m = surfaceNets(f, [-0.28, -0.02, -0.92], [0.28, 0.98, 0.92], H);
const nV = m.positions.length / 3;
const P = m.positions, N = new Float32Array(nV * 3);
const grad = (x, y, z) => { const e = 0.003; const nx = f(x + e, y, z) - f(x - e, y, z), ny = f(x, y + e, z) - f(x, y - e, z), nz = f(x, y, z + e) - f(x, y, z - e); const l = len(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l]; };
for (let v = 0; v < nV; v++) {
  let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
  for (let it = 0; it < 2; it++) { const d = f(x, y, z), g = grad(x, y, z); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d; }
  P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
  const g = grad(x, y, z); N[v * 3] = g[0]; N[v * 3 + 1] = g[1]; N[v * 3 + 2] = g[2];
}
console.log('verts', nV, 'tris', m.indices.length / 3);

// skin weights from distance to bone segments
const segDist = (p, a, b) => { const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], pa = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]; const bb = ba[0] ** 2 + ba[1] ** 2 + ba[2] ** 2; const h = Math.max(0, Math.min(1, (pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / bb)); return len(pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h); };
const J = new Uint8Array(nV * 4), W = new Float32Array(nV * 4);
const isLeg = (n) => /^[fh](Shoulder|Elbow|Wrist|Paw|Hip|Stifle|Hock)[LR]$/.test(n);
for (let v = 0; v < nV; v++) {
  const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
  const cand = [];
  for (const b of B) {
    if (!b.seg) continue;
    const side = b.name.endsWith('L') ? 1 : b.name.endsWith('R') ? -1 : 0;
    if (isLeg(b.name) && side * p[0] < -0.02) continue; // never let one leg pull the other side
    if (/^ear[LR]$/.test(b.name) && (side * p[0] < 0 || p[1] < 0.66)) continue; // ears only move ear vertices
    let d = segDist(p, b.seg[0], b.seg[1]);
    if (b.name === 'jaw' && p[1] > 0.752) d += 0.08; // jaw only drives the lower lip/chin
    if (b.name === 'head' && p[1] < 0.735 && p[2] > 0.56) d += 0.0;
    cand.push([b.i, 1 / Math.pow(d + 0.012, 3.2)]);
  }
  cand.sort((a, c) => c[1] - a[1]);
  const top = cand.slice(0, 4), sum = top.reduce((s, c) => s + c[1], 0);
  for (let k = 0; k < 4; k++) { J[v * 4 + k] = top[k]?.[0] ?? 0; W[v * 4 + k] = top[k] ? top[k][1] / sum : 0; }
}

// fur data per vertex: length (metres) and a colour mask (r = light underside/chest, g = patch (ears, saddle), b = dark around eyes/nose/lips, a = feathering)
const FUR = new Float32Array(nV), MASK = new Float32Array(nV * 4);
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
for (let v = 0; v < nV; v++) {
  const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], ax = Math.abs(x);
  const head = sm(0.5, 0.56, z) * sm(0.69, 0.74, y);
  const muzzle = sm(0.6, 0.66, z) * (y > 0.7 ? 1 : 0);
  const ear = y > 0.66 && ax > 0.06 && z > 0.44 && z < 0.6 ? 1 : 0;
  const tail = sm(-0.5, -0.6, z) * (y > 0.5 ? 1 : 0);
  const paw = sm(0.1, 0.04, y);
  const chest = sm(0.62, 0.3, y) * sm(-0.05, 0.2, z) * sm(0.1, 0.055, ax);
  const belly = sm(0.43, 0.33, y) * sm(0.075, 0.04, ax) * sm(-0.3, -0.15, z) * sm(0.38, 0.28, z);
  const legBack = (y < 0.5 && ax > 0.05 ? 1 : 0) * sm(0.45, 0.28, y);
  let len_ = 0.03;
  len_ = len_ * (1 - head) + 0.014 * head;
  len_ = Math.max(len_, 0.012);
  len_ = len_ * (1 - muzzle) + 0.006 * muzzle;
  len_ += 0.022 * chest + 0.018 * belly + 0.012 * legBack;
  len_ = len_ * (1 - paw) + 0.012 * paw;
  len_ = ear ? 0.036 : len_;
  len_ = tail > 0.2 ? 0.05 * tail + len_ * (1 - tail) : len_;
  FUR[v] = len_;
  MASK[v * 4 + 0] = Math.max(chest * 0.75, belly * 0.6, muzzle * 0.22, paw * 0.1, legBack * 0.1);
  MASK[v * 4 + 1] = Math.max(ear, sm(0.0, 0.1, y - 0.5) * 0.0);
  MASK[v * 4 + 2] = Math.max(sm(0.04, 0.0, len(ax - 0.04, y - 0.82, z - 0.608)) * 0.0, 0);
  MASK[v * 4 + 3] = Math.max(tail, chest, legBack * 0.8, ear * 0.7);
}

// ------------------------------------------------------------------ glTF assembly
const chunks = [];
const accessors = [], views = [];
let offset = 0;
const pad = (n) => (4 - (n % 4)) % 4;
function addBuffer(typed, target) {
  const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
  const p = pad(offset);
  if (p) { chunks.push(Buffer.alloc(p)); offset += p; }
  views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(target ? { target } : {}) });
  chunks.push(bytes); offset += bytes.length;
  return views.length - 1;
}
function acc(typed, componentType, type, count, opts = {}) {
  const view = addBuffer(typed, opts.target);
  accessors.push({ bufferView: view, componentType, count, type, ...(opts.min ? { min: opts.min, max: opts.max } : {}), ...(opts.normalized ? { normalized: true } : {}) });
  return accessors.length - 1;
}
const minmax = (arr, n) => { const mn = Array(n).fill(Infinity), mx = Array(n).fill(-Infinity); for (let i = 0; i < arr.length; i += n) for (let k = 0; k < n; k++) { mn[k] = Math.min(mn[k], arr[i + k]); mx[k] = Math.max(mx[k], arr[i + k]); } return { min: mn, max: mx }; };

// nodes: bones first (node index == bone index), then the skinned mesh, eyes, nose
const nodes = B.map(b => ({ name: b.name, translation: b.parent < 0 ? [...b.pos] : b.pos.map((c, k) => c - B[b.parent].pos[k]), children: [] }));
B.forEach(b => { if (b.parent >= 0) nodes[b.parent].children.push(b.i); });
const ibm = new Float32Array(B.length * 16);
B.forEach((b, i) => { const m4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b.pos[0], -b.pos[1], -b.pos[2], 1]; ibm.set(m4, i * 16); });

const aPos = acc(P, 5126, 'VEC3', nV, { target: 34962, ...minmax(P, 3) });
const aNor = acc(N, 5126, 'VEC3', nV, { target: 34962 });
const aJnt = acc(J, 5121, 'VEC4', nV, { target: 34962 });
const aWgt = acc(W, 5126, 'VEC4', nV, { target: 34962 });
const aFur = acc(FUR, 5126, 'SCALAR', nV, { target: 34962 });
const aMsk = acc(MASK, 5126, 'VEC4', nV, { target: 34962 });
const aIdx = acc(m.indices, 5125, 'SCALAR', m.indices.length, { target: 34963 });
const aIbm = acc(ibm, 5126, 'MAT4', B.length);

// eyes + nose as small separate meshes
function sphere(rx, ry, rz, seg = 20) {
  const pos = [], nor = [], idxs = [];
  for (let i = 0; i <= seg; i++) for (let j = 0; j <= seg * 2; j++) {
    const th = (i / seg) * Math.PI, ph = (j / (seg * 2)) * Math.PI * 2;
    const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
    pos.push(x * rx, y * ry, z * rz); const l = len(x / rx, y / ry, z / rz); nor.push(x / rx / l, y / ry / l, z / rz / l);
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < seg * 2; j++) { const a = i * (seg * 2 + 1) + j, b = a + seg * 2 + 1; idxs.push(a, b, a + 1, b, b + 1, a + 1); }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint16Array(idxs) };
}
const prim = (g, mat) => ({ attributes: { POSITION: acc(g.pos, 5126, 'VEC3', g.pos.length / 3, { target: 34962, ...minmax(g.pos, 3) }), NORMAL: acc(g.nor, 5126, 'VEC3', g.nor.length / 3, { target: 34962 }) }, indices: acc(g.idx, 5123, 'SCALAR', g.idx.length, { target: 34963 }), material: mat });
const eyeG = sphere(0.0148, 0.0148, 0.0125), noseG = sphere(0.0275, 0.02, 0.0205);
const meshes = [
  { name: 'Fur', primitives: [{ attributes: { POSITION: aPos, NORMAL: aNor, JOINTS_0: aJnt, WEIGHTS_0: aWgt, _FURLEN: aFur, _MASK: aMsk }, indices: aIdx, material: 0 }] },
  { name: 'Eye', primitives: [prim(eyeG, 1)] },
  { name: 'Nose', primitives: [prim(noseG, 2)] },
];
const headPos = B[idx('head')].pos;
const rel = (w) => w.map((c, k) => c - headPos[k]);
const eyeL = rel([0.038, 0.812, 0.627]), eyeR = rel([-0.038, 0.812, 0.627]), nosePos = rel([0, 0.779, 0.7575]);
const base = nodes.length;
nodes.push({ name: 'DogSkin', mesh: 0, skin: 0 });
nodes.push({ name: 'EyeL', mesh: 1, translation: eyeL }); nodes.push({ name: 'EyeR', mesh: 1, translation: eyeR }); nodes.push({ name: 'NoseTip', mesh: 2, translation: nosePos });
nodes[idx('head')].children.push(base + 1, base + 2, base + 3);

// ------------------------------------------------------------------ animation
const q = (ax, ay, az, ang) => { const s = Math.sin(ang / 2), l = len(ax, ay, az) || 1; return [ax / l * s, ay / l * s, az / l * s, Math.cos(ang / 2)]; };
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const rx = (a) => q(1, 0, 0, a), ry = (a) => q(0, 1, 0, a), rz = (a) => q(0, 0, 1, a);
const TAU = Math.PI * 2;
const sin = Math.sin, cos = Math.cos, mx = Math.max;

/** Each clip is f(phase 0..1, t seconds) -> { boneName: quaternion | {t:[x,y,z]} } ; unspecified bones stay in the rest pose. */
const clips = {};
const tailWag = (ph, amp, hz, add = {}) => { const o = { ...add }; for (let k = 1; k <= 4; k++) o['tail' + k] = qmul(ry(amp * sin(TAU * (hz * ph - k * 0.09)) * (0.5 + k * 0.18)), rx(add['tail' + k] ? 0 : 0)); return o; };

clips.idle = { dur: 3.2, fn: (ph) => {
  const br = sin(TAU * ph), o = { spine2: rx(-0.012 * br), neck1: rx(0.01 * br + 0.02), head: qmul(ry(0.05 * sin(TAU * ph * 2)), rx(0.02 * cos(TAU * ph))), earL: rz(0.03 * sin(TAU * ph * 2 + 1)), earR: rz(-0.03 * sin(TAU * ph * 2 + 2)) };
  Object.assign(o, tailWag(ph, 0.2, 1));
  o.pelvis = { t: [0, 0.002 * br, 0] };
  return o;
} };

clips.walk = { dur: 0.95, fn: (ph) => {
  const o = {};
  const pairs = [['L', 0, 0.5], ['R', 0.5, 0]]; // diagonal gait: front-left with hind-right
  for (const [n, fphase, hphase] of pairs) {
    const fa = TAU * (ph + fphase), ha = TAU * (ph + hphase);
    o['fShoulder' + n] = rx(-0.5 * sin(fa)); o['fElbow' + n] = rx(0.2 + 0.9 * mx(0, cos(fa))); o['fWrist' + n] = rx(-0.15 - 0.4 * mx(0, cos(fa))); o['fPaw' + n] = rx(0.2 * sin(fa));
    o['hHip' + n] = rx(-0.45 * sin(ha + 0.5)); o['hStifle' + n] = rx(0.25 + 0.7 * mx(0, -sin(ha + 0.5) + 0.2)); o['hHock' + n] = rx(-0.2 - 0.6 * mx(0, -sin(ha + 0.5))); o['hPaw' + n] = rx(0.25 * sin(ha));
  }
  o.pelvis = qmul(ry(0.05 * sin(TAU * ph)), rx(0.012 * sin(TAU * ph * 2)));
  o.pelvis = { q: o.pelvis, t: [0, 0.008 * sin(TAU * ph * 2 + 0.6), 0] };
  o.spine1 = ry(-0.05 * sin(TAU * ph)); o.spine2 = ry(-0.05 * sin(TAU * ph));
  o.neck1 = rx(0.02 - 0.03 * sin(TAU * ph * 2)); o.head = qmul(rx(-0.04 + 0.03 * sin(TAU * ph * 2)), ry(0.03 * sin(TAU * ph)));
  o.earL = rz(0.12 * sin(TAU * ph * 2 + 0.6)); o.earR = rz(-0.12 * sin(TAU * ph * 2 + 0.6));
  Object.assign(o, tailWag(ph, 0.3, 1));
  return o;
} };

const sitPose = () => {
  const o = {};
  o.pelvis = { q: rx(-0.95), t: [0, -0.27, -0.12] };
  o.spine1 = rx(0.45); o.spine2 = rx(0.4); o.neck1 = rx(0.1); o.neck2 = rx(0.06);
  for (const n of ['L', 'R']) {
    o['hHip' + n] = rx(-1.05); o['hStifle' + n] = rx(1.6); o['hHock' + n] = rx(-1.05); o['hPaw' + n] = rx(0.5);
    o['fShoulder' + n] = rx(-0.13); o['fElbow' + n] = rx(0.08); o['fWrist' + n] = rx(0.04);
  }
  o.tail1 = rx(0.5); o.tail2 = rx(0.3);
  return o;
};
clips.sit = { dur: 3.2, fn: (ph) => { const o = sitPose(); const br = sin(TAU * ph); o.spine2 = rx(0.4 - 0.012 * br); o.head = qmul(ry(0.05 * sin(TAU * ph * 2)), rx(-0.08)); o.earL = rz(0.03 * sin(TAU * ph * 2 + 1)); o.earR = rz(-0.03 * sin(TAU * ph * 2 + 2)); Object.assign(o, tailWag(ph, 0.35, 1, { tail1: rx(0.5), tail2: rx(0.3) })); return o; } };

const layPose = () => {
  const o = {};
  o.pelvis = { q: rx(-0.05), t: [0, -0.27, 0.0] };
  o.spine1 = rx(0.02); o.spine2 = rx(0.08); o.neck1 = rx(0.22); o.neck2 = rx(0.3); o.head = rx(0.12);
  for (const [n, sx] of [['L', 1], ['R', -1]]) {
    o['fShoulder' + n] = rx(0.18); o['fElbow' + n] = rx(-1.5); o['fWrist' + n] = rx(0.12); o['fPaw' + n] = rx(0.0);
    o['hHip' + n] = qmul(rx(-1.45), rz(sx * 0.3)); o['hStifle' + n] = rx(2.7); o['hHock' + n] = rx(-1.35); o['hPaw' + n] = rx(0.3);
  }
  o.tail1 = rx(0.9); o.tail2 = rx(0.3);
  return o;
};
clips.lie = { dur: 4.2, fn: (ph) => { const o = layPose(); const br = sin(TAU * ph); o.spine2 = rx(0.08 - 0.02 * br); o.pelvis = { q: rx(-0.05), t: [0, -0.27 + 0.004 * br, 0.0] }; o.earL = rz(0.02 * sin(TAU * ph * 2)); o.earR = rz(-0.02 * sin(TAU * ph * 2)); return o; } };

clips.happy = { dur: 0.8, fn: (ph) => {
  const o = sitPose(); o.spine2 = rx(0.4 + 0.02 * sin(TAU * ph * 2)); o.head = qmul(rx(-0.2 + 0.05 * sin(TAU * ph * 2)), ry(0.08 * sin(TAU * ph)));
  o.fShoulderL = rx(-0.4 + 0.6 * mx(0, sin(TAU * ph))); o.fElbowL = rx(0.6);
  o.jaw = rx(0.18 + 0.05 * sin(TAU * ph * 4)); o.earL = rz(0.2 * sin(TAU * ph * 2)); o.earR = rz(-0.2 * sin(TAU * ph * 2));
  Object.assign(o, tailWag(ph, 0.75, 4, { tail1: rx(0.5), tail2: rx(0.3) }));
  return o;
} };
clips.bark = { dur: 0.9, fn: (ph) => {
  const o = {}; const k = sin(Math.PI * Math.min(1, ph * 3)) * (ph < 0.34 ? 1 : 0);
  o.neck1 = rx(-0.18 * k); o.head = rx(-0.22 * k); o.jaw = rx(0.45 * k); o.spine2 = rx(-0.05 * k);
  o.fShoulderL = rx(0.05 * k); o.fShoulderR = rx(0.05 * k);
  Object.assign(o, tailWag(ph, 0.5, 2));
  return o;
} };
clips.sniff = { dur: 1.6, fn: (ph) => {
  const o = {}; const k = sin(Math.PI * ph); const tw = sin(TAU * ph * 5) * 0.015;
  o.spine1 = rx(0.05 * k); o.spine2 = rx(0.18 * k); o.neck1 = rx(0.6 * k); o.neck2 = rx(0.4 * k); o.head = rx(0.35 * k + tw);
  o.fShoulderL = rx(-0.08 * k); o.fShoulderR = rx(-0.08 * k); o.earL = rz(0.06 * k); o.earR = rz(-0.06 * k);
  Object.assign(o, tailWag(ph, 0.2, 1));
  return o;
} };

const animations = [];
const FPS = 30;
for (const [name, c] of Object.entries(clips)) {
  const frames = Math.round(c.dur * FPS);
  const times = new Float32Array(frames + 1);
  const rot = {}, trn = {};
  for (let k = 0; k <= frames; k++) {
    const ph = (k % frames) / frames; times[k] = (k / frames) * c.dur;
    const pose = c.fn(ph);
    for (const b of B) {
      const v = pose[b.name];
      const qv = Array.isArray(v) ? v : v?.q ?? [0, 0, 0, 1];
      (rot[b.name] ??= []).push(...qv);
      const tv = v && !Array.isArray(v) && v.t ? v.t : [0, 0, 0];
      (trn[b.name] ??= []).push(b.parent < 0 ? nodes[b.i].translation[0] + tv[0] : nodes[b.i].translation[0] + tv[0], b.parent < 0 ? nodes[b.i].translation[1] + tv[1] : nodes[b.i].translation[1] + tv[1], nodes[b.i].translation[2] + tv[2]);
    }
  }
  const tAcc = acc(times, 5126, 'SCALAR', frames + 1, { min: [0], max: [c.dur] });
  const samplers = [], channels = [];
  for (const b of B) {
    const qs = new Float32Array(rot[b.name]);
    if (qs.some((x, i) => (i % 4 === 3 ? Math.abs(x - 1) > 1e-6 : Math.abs(x) > 1e-6))) {
      samplers.push({ input: tAcc, output: acc(qs, 5126, 'VEC4', frames + 1), interpolation: 'LINEAR' });
      channels.push({ sampler: samplers.length - 1, target: { node: b.i, path: 'rotation' } });
    }
    const ts = new Float32Array(trn[b.name]);
    const t0 = nodes[b.i].translation;
    if (ts.some((x, i) => Math.abs(x - t0[i % 3]) > 1e-6)) {
      samplers.push({ input: tAcc, output: acc(ts, 5126, 'VEC3', frames + 1), interpolation: 'LINEAR' });
      channels.push({ sampler: samplers.length - 1, target: { node: b.i, path: 'translation' } });
    }
  }
  animations.push({ name, samplers, channels });
}

const gltf = {
  asset: { version: '2.0', generator: 'jarvis build-dog.mjs (procedural, no third-party assets)' },
  scene: 0, scenes: [{ nodes: [0, base] }],
  nodes, meshes, skins: [{ joints: B.map(b => b.i), inverseBindMatrices: aIbm, skeleton: 0 }],
  materials: [
    { name: 'FurBase', pbrMetallicRoughness: { baseColorFactor: [0.85, 0.65, 0.4, 1], metallicFactor: 0, roughnessFactor: 1 } },
    { name: 'Eye', pbrMetallicRoughness: { baseColorFactor: [0.09, 0.05, 0.03, 1], metallicFactor: 0, roughnessFactor: 0.08 } },
    { name: 'Nose', pbrMetallicRoughness: { baseColorFactor: [0.03, 0.025, 0.025, 1], metallicFactor: 0, roughnessFactor: 0.18 } },
  ],
  accessors, bufferViews: views, buffers: [{ byteLength: 0 }], animations,
};
const bin = Buffer.concat(chunks); const binPad = pad(bin.length);
const binFull = Buffer.concat([bin, Buffer.alloc(binPad)]);
gltf.buffers[0].byteLength = binFull.length;
let json = Buffer.from(JSON.stringify(gltf)); const jp = pad(json.length); json = Buffer.concat([json, Buffer.alloc(jp, 0x20)]);
const total = 12 + 8 + json.length + 8 + binFull.length;
const hdr = Buffer.alloc(12); hdr.write('glTF', 0); hdr.writeUInt32LE(2, 4); hdr.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.write('JSON', 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(binFull.length, 0); bh.write('BIN\0', 4);
fs.mkdirSync(new URL('../../src/assets/pet/', import.meta.url).pathname, { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([hdr, jh, json, bh, binFull]));
console.log('wrote', OUT, (total / 1024).toFixed(0) + ' KB', 'bones', B.length, 'clips', Object.keys(clips).join(','));
