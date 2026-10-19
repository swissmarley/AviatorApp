#!/usr/bin/env node
/** Generates PWA icons (PNG, dependency-free) and the SVG favicon into packages/web/public/icons. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const out = path.resolve('packages/web/public/icons');
fs.mkdirSync(out, { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#f5b400"/></linearGradient></defs><rect width="48" height="48" rx="11" fill="#0b1220"/><circle cx="24" cy="24" r="19" fill="#111a2e" stroke="url(#g)" stroke-width="2"/><path d="M8 34 C 16 30, 22 22, 30 16" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" fill="none" stroke-dasharray="1 4"/><path d="M30 16 l8 -6 l-2 8 l-4 2 l-1 5 l-2 1 l0 -5 l-4 1 l-1 -2 l4 -2 z" fill="#f5b400"/></svg>`;
fs.writeFileSync(path.join(out, 'icon.svg'), svg);

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5, size);
      raw.set([r, g, b, a], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Simple rasteriser: rounded background, ring, and a plane silhouette made of polygons.
const PLANE = [[30, 16], [38, 10], [36, 18], [32, 20], [31, 25], [29, 26], [29, 21], [25, 22], [24, 20], [28, 18]];
function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pixel(maskable) {
  return (x, y, size) => {
    const u = (x / size) * 48, v = (y / size) * 48;
    const bg = [11, 18, 32, 255];
    if (!maskable) {
      const r = 11, cx = Math.min(Math.max(u, r), 48 - r), cy = Math.min(Math.max(v, r), 48 - r);
      if ((u - cx) ** 2 + (v - cy) ** 2 > r * r) return [0, 0, 0, 0];
    }
    const s = maskable ? 0.72 : 1; // shrink artwork inside the safe zone for maskable icons
    const uu = (u - 24) / s + 24, vv = (v - 24) / s + 24;
    const d = Math.hypot(uu - 24, vv - 24);
    if (d > 18 && d < 20) { const t = (uu - 4 + vv - 4) / 80; return [Math.round(56 + (245 - 56) * t), Math.round(189 + (180 - 189) * t), Math.round(248 + (0 - 248) * t), 255]; }
    if (d <= 18) {
      if (inPoly(uu, vv, PLANE)) return [245, 180, 0, 255];
      // dotted contrail along a curve
      for (let i = 0; i < 6; i++) { const t = i / 6; const cx = 8 + (30 - 8) * t, cy = 34 - (34 - 16) * (t * t * 0.3 + t * 0.7); if (Math.hypot(uu - cx, vv - cy) < 1.3) return [56, 189, 248, 255]; }
      return [17, 26, 46, 255];
    }
    return bg;
  };
}
fs.writeFileSync(path.join(out, 'icon-192.png'), png(192, pixel(false)));
fs.writeFileSync(path.join(out, 'icon-512.png'), png(512, pixel(false)));
fs.writeFileSync(path.join(out, 'icon-512-maskable.png'), png(512, pixel(true)));
console.log('icons written to', out);
