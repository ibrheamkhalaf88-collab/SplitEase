#!/usr/bin/env node
/**
 * Generates the real PNG app icons from the SplitEase brand mark.
 *
 * Why this exists: the service worker precaches PNG icons via
 * `cache.addAll()`, which rejects the whole install if a single entry 404s.
 * The repo only shipped SVGs, so the PWA never installed. SVG is also not a
 * valid install icon on Android, so the manifest entries were wrong too.
 *
 * Zero dependencies on purpose — a plain rasteriser plus a hand-rolled PNG
 * encoder, so `node scripts/generate-icons.mjs` works on any machine with
 * Node 18+ and no native deps, on CI or a contributor's laptop.
 *
 * The glyph is the same "S" over a coral coin that icons/icon-192.svg draws.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'icons');

const BRAND_FROM = [0x0d, 0x94, 0x88];
const BRAND_TO = [0x14, 0xb8, 0xa6];
const COIN = [0xf9, 0x70, 0x66];
const WHITE = [0xff, 0xff, 0xff];

/* ── tiny RGB canvas ─────────────────────────────────────────────────────── */

function createCanvas(size) {
  return { size, data: new Uint8ClampedArray(size * size * 3) };
}

function blend(canvas, x, y, rgb, alpha) {
  if (alpha <= 0 || x < 0 || y < 0 || x >= canvas.size || y >= canvas.size) return;
  const i = (y * canvas.size + x) * 3;
  const a = Math.min(1, alpha);
  const dst = canvas.data;
  dst[i] = dst[i] * (1 - a) + rgb[0] * a;
  dst[i + 1] = dst[i + 1] * (1 - a) + rgb[1] * a;
  dst[i + 2] = dst[i + 2] * (1 - a) + rgb[2] * a;
}

const lerp = (a, b, t) => a + (b - a) * t;
const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Signed distance to a rounded rectangle; negative means inside. */
function sdRoundRect(px, py, halfW, halfH, radius) {
  const qx = Math.abs(px) - halfW + radius;
  const qy = Math.abs(py) - halfH + radius;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Distance from a point to a line segment. */
function sdSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/* ── drawing primitives (analytic AA via 1px feather) ─────────────────────── */

function fillRoundedRect(canvas, { x, y, w, h, radius, from, to, feather = 1 }) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  for (let py = Math.floor(y - 2); py < y + h + 2; py++) {
    for (let px = Math.floor(x - 2); px < x + w + 2; px++) {
      const d = sdRoundRect(px + 0.5 - cx, py + 0.5 - cy, w / 2, h / 2, radius);
      if (d > feather) continue;
      const t = (px + 0.5 - x + py + 0.5 - y) / (w + h);
      blend(canvas, px, py, mixRgb(from, to, Math.max(0, Math.min(1, t))), 1 - d / feather);
    }
  }
}

function fillCircle(canvas, { cx, cy, r, color, feather = 1 }) {
  for (let py = Math.floor(cy - r - 2); py <= cy + r + 2; py++) {
    for (let px = Math.floor(cx - r - 2); px <= cx + r + 2; px++) {
      const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy) - r;
      if (d > feather) continue;
      blend(canvas, px, py, color, 1 - d / feather);
    }
  }
}

/** Strokes a polyline with round caps and joins. */
function strokePolyline(canvas, points, width, color, feather = 1) {
  const half = width / 2;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const pad = half + feather + 2;
  for (let py = Math.floor(minY - pad); py <= maxY + pad; py++) {
    for (let px = Math.floor(minX - pad); px <= maxX + pad; px++) {
      const sx = px + 0.5;
      const sy = py + 0.5;
      let d = Infinity;
      for (let i = 0; i < points.length - 1; i++) {
        d = Math.min(d, sdSegment(sx, sy, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]));
        if (d <= -half) break;
      }
      const dist = d - half;
      if (dist > feather) continue;
      blend(canvas, px, py, color, 1 - dist / feather);
    }
  }
}

/* ── the "S" glyph, as cubic Béziers in a unit box (y grows downward) ────── */

const S_CURVES = [
  [[0.90, 0.16], [0.90, 0.04], [0.62, 0.00], [0.50, 0.00]],
  [[0.50, 0.00], [0.24, 0.00], [0.10, 0.10], [0.10, 0.28]],
  [[0.10, 0.28], [0.10, 0.44], [0.24, 0.50], [0.50, 0.56]],
  [[0.50, 0.56], [0.76, 0.62], [0.90, 0.68], [0.90, 0.84]],
  [[0.90, 0.84], [0.90, 1.00], [0.74, 1.00], [0.50, 1.00]],
  [[0.50, 1.00], [0.36, 1.00], [0.20, 0.98], [0.10, 0.92]],
];

function sampleCubic([p0, p1, p2, p3], steps = 18) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

function glyphPoints(box, steps = 18) {
  const pts = [];
  S_CURVES.forEach((curve, i) => {
    const sampled = sampleCubic(curve, steps);
    if (i > 0) sampled.shift();
    for (const [ux, uy] of sampled) {
      pts.push([box.x + ux * box.w, box.y + uy * box.h]);
    }
  });
  return pts;
}

/* ── the icon itself ─────────────────────────────────────────────────────── */

/**
 * @param {number} size  output edge length in px
 * @param {boolean} maskable  full-bleed background, artwork inside the 80%
 *   safe zone that Android applies when it crops the icon to a shape
 */
function drawIcon(size, { maskable = false } = {}) {
  const canvas = createCanvas(size);
  const u = size / 192; // design grid is 192×192

  if (maskable) {
    fillRoundedRect(canvas, {
      x: 0, y: 0, w: size, h: size, radius: 0,
      from: BRAND_FROM, to: BRAND_TO,
    });
  } else {
    fillRoundedRect(canvas, {
      x: 0, y: 0, w: size, h: size, radius: 36 * u,
      from: BRAND_FROM, to: BRAND_TO,
    });
  }

  // Artwork transform: centred, then scaled (maskable pulls it in).
  const scale = maskable ? 0.62 : 1;
  const offset = ((1 - scale) * size) / 2;
  const tx = (x) => x * u * scale + offset;
  const ty = (y) => y * u * scale + offset;
  const tu = (v) => v * u * scale;

  // "S"
  strokePolyline(
    canvas,
    glyphPoints({ x: tx(63), y: ty(57), w: tu(66), h: tu(67) }),
    tu(15),
    WHITE,
  );

  // coin
  fillCircle(canvas, { cx: tx(156), cy: ty(48), r: tu(24), color: COIN });
  // "$" — small S plus the bar through it
  strokePolyline(
    canvas,
    glyphPoints({ x: tx(149.5), y: ty(37), w: tu(13), h: tu(18) }),
    tu(2.6),
    WHITE,
  );
  strokePolyline(
    canvas,
    [[tx(156), ty(32)], [tx(156), ty(60)]],
    tu(2.2),
    WHITE,
  );

  return canvas;
}

/* ── 4× supersample + box downsample, for clean edges ─────────────────────── */

function downsample(canvas, factor) {
  const out = createCanvas(canvas.size / factor);
  const n = factor * factor;
  for (let y = 0; y < out.size; y++) {
    for (let x = 0; x < out.size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * canvas.size + (x * factor + dx)) * 3;
          r += canvas.data[i];
          g += canvas.data[i + 1];
          b += canvas.data[i + 2];
        }
      }
      const o = (y * out.size + x) * 3;
      out.data[o] = r / n;
      out.data[o + 1] = g / n;
      out.data[o + 2] = b / n;
    }
  }
  return out;
}

function render(size, opts) {
  return downsample(drawIcon(size * 4, opts), 4);
}

/* ── minimal PNG encoder (RGBA, 8-bit, filter 0) ──────────────────────────── */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(canvas) {
  const { size, data } = canvas;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // one filter byte (0 = None) per scanline
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 3 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const s = (y * size + x) * 3;
      const d = rowStart + 1 + x * 3;
      raw[d] = Math.round(data[s]);
      raw[d + 1] = Math.round(data[s + 1]);
      raw[d + 2] = Math.round(data[s + 2]);
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── main ─────────────────────────────────────────────────────────────────── */

const TARGETS = [
  { file: 'icon-72.png', size: 72 },
  { file: 'icon-96.png', size: 96 },
  { file: 'icon-128.png', size: 128 },
  { file: 'icon-144.png', size: 144 },
  { file: 'icon-152.png', size: 152 },
  { file: 'icon-180.png', size: 180 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-384.png', size: 384 },
  { file: 'icon-512.png', size: 512 },
  { file: 'maskable-192.png', size: 192, maskable: true },
  { file: 'maskable-512.png', size: 512, maskable: true },
];

mkdirSync(OUT_DIR, { recursive: true });

for (const { file, size, maskable } of TARGETS) {
  const png = encodePng(render(size, { maskable }));
  writeFileSync(join(OUT_DIR, file), png);
  console.log(`  ${file.padEnd(20)} ${size}×${size}  ${(png.length / 1024).toFixed(1)} KB`);
}

console.log(`\n✓ ${TARGETS.length} icons written to icons/`);
