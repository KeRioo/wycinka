// Generator prawdziwych PNG-ów PWA (bez zależności): zielone tło #15803d + biały drzewek.
// Użycie: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const GREEN = [21, 128, 61];
const WHITE = [255, 255, 255];
const BROWN = [146, 64, 14];

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
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(pixels, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const TIERS = [
  { base: 0.78, top: 0.48, half: 0.27 },
  { base: 0.62, top: 0.34, half: 0.21 },
  { base: 0.46, top: 0.2, half: 0.15 },
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function mix(fg, bg, alpha) {
  return [
    Math.round(fg[0] * alpha + bg[0] * (1 - alpha)),
    Math.round(fg[1] * alpha + bg[1] * (1 - alpha)),
    Math.round(fg[2] * alpha + bg[2] * (1 - alpha)),
  ];
}

function canopyAlpha(uu, vv) {
  const cx = 0.5;
  let alpha = 0;
  for (const t of TIERS) {
    if (vv <= t.base && vv >= t.top) {
      const f = (t.base - vv) / (t.base - t.top);
      const half = t.half * (1 - f);
      const dist = Math.abs(uu - cx);
      if (dist <= half) alpha = clamp((half - dist) * 512, 0, 1);
    }
  }
  return alpha;
}

function trunkAlpha(uu, vv) {
  const cx = 0.5;
  const on = uu > cx - 0.035 && uu < cx + 0.035 && vv > 0.78 && vv < 0.92;
  return on ? 1 : 0;
}

function render(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const scale = maskable ? 0.62 : 0.8;
  const offset = (1 - scale) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const uu = offset + (x / size) * scale;
      const vv = offset + (y / size) * scale;
      let bg = GREEN;
      if (!maskable) {
        const dx = uu - 0.5;
        const dy = vv - 0.5;
        const dist = Math.sqrt(dx * dx + dy * dy) / 0.5;
        bg = clamp((0.95 - dist) * 6, 0, 1) * 0.06 + 1 <= 1 ? GREEN : GREEN;
      }
      const aa = canopyAlpha(uu, vv);
      const ta = trunkAlpha(uu, vv);
      const fg = ta > aa ? BROWN : WHITE;
      const alpha = Math.max(aa, ta);
      const final = mix(fg, bg, alpha);
      const i = (y * size + x) * 4;
      px[i] = final[0];
      px[i + 1] = final[1];
      px[i + 2] = final[2];
      px[i + 3] = 255;
    }
  }
  return px;
}

const outDir = join(process.cwd(), 'public', 'icons');
mkdirSync(outDir, { recursive: true });
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
]) {
  writeFileSync(join(outDir, name), encodePng(render(size, maskable), size));
  console.log(`OK ${name}`);
}
