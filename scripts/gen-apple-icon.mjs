/**
 * Generate public/apple-touch-icon.png (180×180) — iOS Safari requires PNG
 * for apple-touch-icon; the previous SVG was silently ignored.
 *
 * Dependency-free: rasterizes the brand lemniscate onto an obsidian tile and
 * encodes a PNG using only node:zlib. Run: `node scripts/gen-apple-icon.mjs`
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const SIZE = 180;
const BG = [8, 7, 10]; // #08070a — app theme color
const GOLD = [217, 173, 82]; // #d9ad52 — brand gold

/* ── rasterize ── */
const px = new Uint8Array(SIZE * SIZE * 3);
for (let i = 0; i < SIZE * SIZE; i++) {
  px[i * 3] = BG[0];
  px[i * 3 + 1] = BG[1];
  px[i * 3 + 2] = BG[2];
}

// Parametric Bernoulli lemniscate (Gerono form), densely sampled.
const pts = [];
const N = 1440;
for (let i = 0; i <= N; i++) {
  const t = (i / N) * Math.PI * 2;
  const d = 1 + Math.sin(t) * Math.sin(t);
  const x = Math.cos(t) / d;
  const y = (Math.sin(t) * Math.cos(t)) / d;
  // Map [-1,1]×[-0.5,0.5] into the tile, centered, ~140px wide.
  pts.push([90 + x * 68, 90 - y * 136]);
}

// Anti-aliased stroke: distance from each pixel center to the polyline.
const RADIUS = 4.2; // ≈8.4px stroke
const AA = 1.0;
for (let py = 0; py < SIZE; py++) {
  for (let pxx = 0; pxx < SIZE; pxx++) {
    let minD2 = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = ((pxx + 0.5 - ax) * dx + (py + 0.5 - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const cxp = ax + t * dx;
      const cyp = ay + t * dy;
      const ex = pxx + 0.5 - cxp;
      const ey = py + 0.5 - cyp;
      const d2 = ex * ex + ey * ey;
      if (d2 < minD2) minD2 = d2;
    }
    const dist = Math.sqrt(minD2);
    if (dist > RADIUS + AA) continue;
    // Smooth coverage across the AA band; slightly brighter core.
    const cov = dist <= RADIUS ? 1 : 1 - (dist - RADIUS) / AA;
    const shade = dist < RADIUS - 1 ? 1 : 0.92;
    const o = (py * SIZE + pxx) * 3;
    px[o] = Math.round(px[o] * (1 - cov) + GOLD[0] * shade * cov);
    px[o + 1] = Math.round(px[o + 1] * (1 - cov) + GOLD[1] * shade * cov);
    px[o + 2] = Math.round(px[o + 2] * (1 - cov) + GOLD[2] * shade * cov);
  }
}

/* ── encode PNG (truecolor, 8-bit) ── */
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type: truecolor
// raw scanlines with filter byte 0
const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 3 + 1)] = 0;
  Buffer.from(px.buffer, y * SIZE * 3, SIZE * 3).copy(
    raw,
    y * (SIZE * 3 + 1) + 1,
  );
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

writeFileSync("public/apple-touch-icon.png", png);
console.log(`Wrote public/apple-touch-icon.png (${png.length} bytes)`);
