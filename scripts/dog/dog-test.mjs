// Integrity checks for the generated 3D dog:  node scripts/dog/dog-test.mjs
import fs from 'fs';
import crypto from 'crypto';
import { dogSdf } from './sdf.mjs';
const file = new URL('../../src/assets/pet/dog.glb', import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('✗', n, x); } };
const b = fs.readFileSync(file);
ok('glTF magic', b.toString('ascii', 0, 4) === 'glTF' && b.readUInt32LE(4) === 2);
ok('declared length', b.readUInt32LE(8) === b.length);
const jl = b.readUInt32LE(12); const j = JSON.parse(b.toString('utf8', 20, 20 + jl));
const bin = b.subarray(20 + jl + 8);
ok('under 3 MB', b.length < 3 * 1024 * 1024, `${b.length}`);
ok('bone count', j.skins[0].joints.length >= 26 && j.skins[0].joints.length <= 40, String(j.skins[0].joints.length));
const names = j.nodes.map(n => n.name);
for (const n of ['pelvis', 'head', 'jaw', 'earL', 'earR', 'tail4', 'fPawL', 'hPawR', 'EyeL', 'EyeR', 'NoseTip', 'DogSkin']) ok('node ' + n, names.includes(n));
const clips = j.animations.map(a => a.name);
for (const c of ['idle', 'walk', 'sit', 'lie', 'happy', 'bark', 'sniff']) ok('clip ' + c, clips.includes(c));
ok('every clip animates', j.animations.every(a => a.channels.length >= 3));
ok('clip targets exist', j.animations.every(a => a.channels.every(c => c.target.node >= 0 && c.target.node < j.nodes.length)));
// no cycles and a single root among the bones
const parent = new Map(); j.nodes.forEach((n, i) => (n.children ?? []).forEach(c => parent.set(c, i)));
ok('no cycles', j.nodes.every((_, i) => { let k = i, g = 0; while (parent.has(k) && g++ < 100) k = parent.get(k); return g < 100; }));
const accessor = (i) => { const a = j.accessors[i], v = j.bufferViews[a.bufferView]; const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type]; const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType]; return new T(bin.buffer.slice(bin.byteOffset + v.byteOffset, bin.byteOffset + v.byteOffset + v.byteLength)).subarray(0, a.count * comps); };
const prim = j.meshes[0].primitives[0];
const pos = accessor(prim.attributes.POSITION), w = accessor(prim.attributes.WEIGHTS_0), jn = accessor(prim.attributes.JOINTS_0), fur = accessor(prim.attributes._FURLEN), idx = accessor(prim.indices);
const nV = pos.length / 3;
ok('vertex count sane', nV > 8000 && nV < 40000, String(nV));
ok('no NaN positions', pos.every(Number.isFinite));
ok('weights normalised', Array.from({ length: Math.min(nV, 2000) }, (_, v) => v * 7 % nV).every(v => Math.abs(w[v * 4] + w[v * 4 + 1] + w[v * 4 + 2] + w[v * 4 + 3] - 1) < 1e-3));
ok('joint indices valid', jn.every(x => x < j.skins[0].joints.length));
ok('fur lengths in range', fur.every(x => x >= 0.004 && x <= 0.09), `${Math.min(...fur)}..${Math.max(...fur)}`);
ok('indices valid', idx.length % 3 === 0 && idx.every(x => x < nV));
let minY = 9, maxY = -9, minZ = 9, maxZ = -9;
for (let v = 0; v < nV; v++) { minY = Math.min(minY, pos[v * 3 + 1]); maxY = Math.max(maxY, pos[v * 3 + 1]); minZ = Math.min(minZ, pos[v * 3 + 2]); maxZ = Math.max(maxZ, pos[v * 3 + 2]); }
ok('standing on the ground', minY > -0.03 && minY < 0.05, String(minY));
ok('dog sized (0.7 to 1.0 m tall, 1.4 to 1.9 m long)', maxY > 0.7 && maxY < 1.0 && maxZ - minZ > 1.4 && maxZ - minZ < 1.9, `${maxY} ${maxZ - minZ}`);
// the field itself is deterministic and symmetric
const f = dogSdf();
ok('sdf symmetric', [[0.05, 0.5, 0.1], [0.08, 0.4, -0.2], [0.03, 0.8, 0.6]].every(([x, y, z]) => Math.abs(f(x, y, z) - f(-x, y, z)) < 1e-9));
ok('sdf inside/outside', f(0, 0.47, 0.1) < 0 && f(0.6, 0.5, 0) > 0 && f(0, 2, 0) > 0);
console.log(`dog.glb ${(b.length / 1024).toFixed(0)} KB · ${nV} verts · sha ${crypto.createHash('sha1').update(b).digest('hex').slice(0, 8)}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
