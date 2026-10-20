#!/usr/bin/env node
/**
 * Builds a low-poly airliner as a binary glTF (GLB) without any dependencies.
 * Axes follow the glTF convention Cesium expects for `Transforms.headingPitchRollQuaternion`
 * with the default model forward axis: +X is forward (nose), +Z up, +Y left.
 * Unit: metres; wingspan ≈ 36 m (A320 class) — scaled per type at runtime.
 */
import fs from 'node:fs';
import path from 'node:path';

const positions = [], normals = [], indices = [], colors = [];
function box(cx, cy, cz, sx, sy, sz, color) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const faces = [
    { n: [1, 0, 0], v: [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]] },
    { n: [-1, 0, 0], v: [[-hx, hy, -hz], [-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz]] },
    { n: [0, 1, 0], v: [[hx, hy, -hz], [-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz]] },
    { n: [0, -1, 0], v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
    { n: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
    { n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
  ];
  for (const f of faces) {
    const base = positions.length / 3;
    for (const [x, y, z] of f.v) { positions.push(cx + x, cy + y, cz + z); normals.push(...f.n); colors.push(...color, 1); }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}
/** Tapered box between two cross-sections (for wings/fuselage taper). */
function taper(x0, y0, z0, w0, h0, x1, y1, z1, w1, h1, color) {
  const a = [[x0, y0 - w0 / 2, z0 - h0 / 2], [x0, y0 + w0 / 2, z0 - h0 / 2], [x0, y0 + w0 / 2, z0 + h0 / 2], [x0, y0 - w0 / 2, z0 + h0 / 2]];
  const b = [[x1, y1 - w1 / 2, z1 - h1 / 2], [x1, y1 + w1 / 2, z1 - h1 / 2], [x1, y1 + w1 / 2, z1 + h1 / 2], [x1, y1 - w1 / 2, z1 + h1 / 2]];
  const quads = [[a[0], a[1], b[1], b[0], [0, 0, -1]], [a[1], a[2], b[2], b[1], [0, 1, 0]], [a[2], a[3], b[3], b[2], [0, 0, 1]], [a[3], a[0], b[0], b[3], [0, -1, 0]], [a[3], a[2], a[1], a[0], [-1, 0, 0]], [b[0], b[1], b[2], b[3], [1, 0, 0]]];
  for (const [p0, p1, p2, p3, n] of quads) {
    const base = positions.length / 3;
    for (const p of [p0, p1, p2, p3]) { positions.push(...p); normals.push(...n); colors.push(...color, 1); }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}
const white = [0.92, 0.93, 0.95], dark = [0.15, 0.17, 0.22], accent = [0.96, 0.71, 0.0], engine = [0.6, 0.62, 0.66];
// fuselage: nose cone, main tube, tail cone (length ~37 m)
taper(18.5, 0, 0, 0.6, 0.6, 14, 0, 0, 3.8, 3.8, white);
box(5, 0, 0, 18, 3.8, 3.8, white);
taper(-4, 0, 0, 3.8, 3.8, -18, 0, 1.4, 1.0, 1.4, white);
// cockpit windows strip
box(14.5, 0, 0.9, 2.2, 3.9, 0.6, dark);
// wings (swept): root at x≈2, span 36 m
taper(2, 2, -0.8, 6.0, 0.5, -5, 18, 0.6, 2.2, 0.25, white);
taper(2, -2, -0.8, 6.0, 0.5, -5, -18, 0.6, 2.2, 0.25, white);
// winglets
box(-5.2, 18, 1.4, 1.6, 0.2, 1.8, accent);
box(-5.2, -18, 1.4, 1.6, 0.2, 1.8, accent);
// engines under wings
box(1.5, 6.5, -2.2, 4.5, 2.0, 2.0, engine);
box(1.5, -6.5, -2.2, 4.5, 2.0, 2.0, engine);
// horizontal stabilisers
taper(-15, 0.6, 1.4, 3.0, 0.3, -18, 6.5, 1.6, 1.2, 0.2, white);
taper(-15, -0.6, 1.4, 3.0, 0.3, -18, -6.5, 1.6, 1.2, 0.2, white);
// vertical fin
taper(-14, 0, 1.6, 0.4, 0.4, -18.5, 0, 7.5, 0.3, 1.6, accent);
// nav lights
box(-5.5, 18.2, 1.0, 0.3, 0.3, 0.3, [0, 1, 0]);
box(-5.5, -18.2, 1.0, 0.3, 0.3, 0.3, [1, 0, 0]);

const pos = new Float32Array(positions), nor = new Float32Array(normals), col = new Float32Array(colors), idx = new Uint32Array(indices);
let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[i + k]); max[k] = Math.max(max[k], pos[i + k]); }
const pad = (b) => { const r = (4 - (b.length % 4)) % 4; return r ? Buffer.concat([b, Buffer.alloc(r)]) : b; };
const bufs = [Buffer.from(pos.buffer), Buffer.from(nor.buffer), Buffer.from(col.buffer), Buffer.from(idx.buffer)].map(pad);
const offsets = []; let off = 0; for (const b of bufs) { offsets.push(off); off += b.length; }
const bin = Buffer.concat(bufs);
const gltf = {
  asset: { version: '2.0', generator: 'contrail-generate-aircraft-glb' },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'aircraft' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, material: 0 }] }],
  materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.1, roughnessFactor: 0.6 }, doubleSided: true }],
  buffers: [{ byteLength: bin.length }],
  bufferViews: bufs.map((b, i) => ({ buffer: 0, byteOffset: offsets[i], byteLength: b.length, target: i === 3 ? 34963 : 34962 })),
  accessors: [
    { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max },
    { bufferView: 1, componentType: 5126, count: nor.length / 3, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count: col.length / 4, type: 'VEC4' },
    { bufferView: 3, componentType: 5125, count: idx.length, type: 'SCALAR' },
  ],
};
let json = Buffer.from(JSON.stringify(gltf)); while (json.length % 4) json = Buffer.concat([json, Buffer.from(' ')]);
const header = Buffer.alloc(12); header.write('glTF', 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const jsonChunk = Buffer.alloc(8); jsonChunk.writeUInt32LE(json.length, 0); jsonChunk.writeUInt32LE(0x4e4f534a, 4);
const binChunk = Buffer.alloc(8); binChunk.writeUInt32LE(bin.length, 0); binChunk.writeUInt32LE(0x004e4942, 4);
const outPath = path.resolve('packages/web/public/models/aircraft.glb');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, Buffer.concat([header, jsonChunk, json, binChunk, bin]));
console.log(`wrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB, ${idx.length / 3} triangles)`);
