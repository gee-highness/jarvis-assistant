// Procedural dog: a sculpted signed-distance field, meshed with surface nets. All units are metres, +Y up, the dog faces +Z.
export const len = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); };
export const smax = (a, b, k) => -smin(-a, -b, k);

/** Ellipsoid with optional rotation about the X axis (rx, radians) and Z axis (rz). */
export function ellipsoid(c, r, rx = 0, rz = 0) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cz = Math.cos(rz), sz = Math.sin(rz);
  return (x, y, z) => {
    let px = x - c[0], py = y - c[1], pz = z - c[2];
    // rotate into local frame (inverse rotation)
    let ty = py * cx + pz * sx, tz = -py * sx + pz * cx; py = ty; pz = tz;
    const tx = px * cz + py * sz; ty = -px * sz + py * cz; px = tx; py = ty;
    const k0 = len(px / r[0], py / r[1], pz / r[2]);
    const k1 = len(px / (r[0] * r[0]), py / (r[1] * r[1]), pz / (r[2] * r[2]));
    return k1 < 1e-9 ? -Math.min(r[0], r[1], r[2]) : k0 * (k0 - 1) / k1;
  };
}
/** Tapered capsule from a to b with radii ra -> rb. */
export function cone(a, b, ra, rb) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2], bb = bax * bax + bay * bay + baz * baz;
  return (x, y, z) => {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const h = clamp((pax * bax + pay * bay + paz * baz) / bb, 0, 1);
    return len(pax - bax * h, pay - bay * h, paz - baz * h) - (ra + (rb - ra) * h);
  };
}

/** Build the dog SDF. Returns f(x,y,z). `v` lets callers tweak proportions per breed. */
export function dogSdf(v = {}) {
  const S = (name, d) => (v[name] ?? d);
  const mirror = (f) => (x, y, z) => Math.min(f(x, y, z), f(-x, y, z)); // symmetric pairs
  const parts = {};
  // torso: deep chest, tucked waist, strong hips
  const chest = ellipsoid([0, 0.465, 0.2], [0.135, 0.175, 0.2]);
  const ribs = ellipsoid([0, 0.47, -0.02], [0.13, 0.16, 0.25]);
  const tuck = ellipsoid([0, 0.425, -0.2], [0.105, 0.125, 0.15]);
  const hips = ellipsoid([0, 0.5, -0.33], [0.135, 0.15, 0.17]);
  const withers = ellipsoid([0, 0.565, 0.24], [0.085, 0.075, 0.14]);
  const neck = cone([0, 0.58, 0.31], [0, 0.76, 0.5], 0.082, 0.06);
  // head
  const skull = ellipsoid([0, 0.805, 0.555], [0.074, 0.074, 0.088]);
  const brow = ellipsoid([0, 0.826, 0.585], [0.062, 0.026, 0.045]);
  const cheek = mirror(ellipsoid([0.05, 0.775, 0.545], [0.036, 0.05, 0.065]));
  const muzzle = ellipsoid([0, 0.765, 0.662], [0.04, 0.034, S('muzzle', 0.082)], -0.1);
  const jaw = ellipsoid([0, 0.743, 0.64], [0.034, 0.02, 0.066], -0.04);
  const nose = ellipsoid([0, 0.778, 0.742], [0.029, 0.021, 0.02]);
  const lips = mirror(ellipsoid([0.031, 0.75, 0.675], [0.014, 0.022, 0.048]));
  // legs
  const leg = (sx) => {
    const fs = [sx * 0.09, 0.52, 0.2], fe = [sx * 0.088, 0.31, 0.17], fw = [sx * 0.08, 0.1, 0.19], fp = [sx * 0.08, 0.034, 0.232];
    const hk = [sx * 0.105, 0.3, -0.21], hh = [sx * 0.08, 0.13, -0.35], hp = [sx * 0.08, 0.034, -0.31];
    return [
      cone(fs, fe, 0.058, 0.04), cone(fe, fw, 0.04, 0.03), cone(fw, fp, 0.03, 0.03), ellipsoid(fp, [0.04, 0.034, 0.06]),
      ellipsoid([sx * 0.096, 0.42, -0.27], [0.07, 0.15, 0.115], 0.25), cone(hk, hh, 0.05, 0.03), cone(hh, hp, 0.03, 0.03), ellipsoid(hp, [0.04, 0.034, 0.06]),
      ellipsoid([sx * 0.085, 0.33, 0.19], [0.036, 0.09, 0.05], -0.1),
    ];
  };
  const legs = [...leg(1), ...leg(-1)];
  // tail: a feathered plume
  const tail = [cone([0, 0.54, -0.46], [0, 0.62, -0.58], 0.036, 0.034), cone([0, 0.62, -0.58], [0, 0.69, -0.7], 0.034, 0.03), cone([0, 0.69, -0.7], [0, 0.7, -0.82], 0.03, 0.016)];
  // ears: soft hanging flaps
  const ear = (sx) => ellipsoid([sx * 0.088, 0.765, 0.525], [0.011, 0.092, 0.058], 0.12, sx * -0.14);
  const ears = [ear(1), ear(-1)];

  return (x, y, z) => {
    let body = chest(x, y, z);
    body = smin(body, ribs(x, y, z), 0.09); body = smin(body, tuck(x, y, z), 0.09); body = smin(body, hips(x, y, z), 0.08); body = smin(body, withers(x, y, z), 0.08);
    body = smin(body, neck(x, y, z), 0.08);
    let head = skull(x, y, z);
    head = smin(head, brow(x, y, z), 0.025); head = smin(head, cheek(x, y, z), 0.03); head = smin(head, muzzle(x, y, z), 0.04); head = smin(head, jaw(x, y, z), 0.02); head = smin(head, nose(x, y, z), 0.01);
    head = smin(head, lips(x, y, z), 0.012);
    let d = smin(body, head, 0.055);
    for (const l of legs) d = smin(d, l(x, y, z), 0.035);
    for (const t of tail) d = smin(d, t(x, y, z), 0.02);
    for (const e of ears) d = smin(d, e(x, y, z), 0.012);
    // mouth line and eye hollows
    const mouth = Math.abs(y - 0.727) * 3 + Math.abs(Math.abs(x) - 0.0) * 0 - 0.0;
    void mouth;
    return d;
  };
}

/** Naive surface nets: returns { positions, indices } for the zero level set of f in the box. */
export function surfaceNets(f, min, max, h) {
  const nx = Math.ceil((max[0] - min[0]) / h) + 1, ny = Math.ceil((max[1] - min[1]) / h) + 1, nz = Math.ceil((max[2] - min[2]) / h) + 1;
  const val = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) val[id(i, j, k)] = f(min[0] + i * h, min[1] + j * h, min[2] + k * h);
  const vidx = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cid = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const positions = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const v = corners.map(c => val[id(i + c[0], j + c[1], k + c[2])]);
    let mask = 0; for (let c = 0; c < 8; c++) if (v[c] < 0) mask |= 1 << c;
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (const [a, b] of edges) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += corners[a][0] + (corners[b][0] - corners[a][0]) * t; sy += corners[a][1] + (corners[b][1] - corners[a][1]) * t; sz += corners[a][2] + (corners[b][2] - corners[a][2]) * t; cnt++;
    }
    vidx[cid(i, j, k)] = positions.length / 3;
    positions.push(min[0] + (i + sx / cnt) * h, min[1] + (j + sy / cnt) * h, min[2] + (k + sz / cnt) * h);
  }
  const indices = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) indices.push(a, c, b, a, d, c); else indices.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const s0 = val[id(i, j, k)] < 0;
    if (i < nx - 1 && (val[id(i + 1, j, k)] < 0) !== s0) quad(vidx[cid(i, j - 1, k - 1)], vidx[cid(i, j, k - 1)], vidx[cid(i, j, k)], vidx[cid(i, j - 1, k)], !s0);
    if (j < ny - 1 && (val[id(i, j + 1, k)] < 0) !== s0) quad(vidx[cid(i - 1, j, k - 1)], vidx[cid(i - 1, j, k)], vidx[cid(i, j, k)], vidx[cid(i, j, k - 1)], !s0);
    if (k < nz - 1 && (val[id(i, j, k + 1)] < 0) !== s0) quad(vidx[cid(i - 1, j - 1, k)], vidx[cid(i, j - 1, k)], vidx[cid(i, j, k)], vidx[cid(i - 1, j, k)], !s0);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}
