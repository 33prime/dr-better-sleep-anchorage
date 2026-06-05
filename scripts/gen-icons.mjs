// Generate Dr. Never Snore brand PWA icons — teal crescent moon on Midnight Blue.
// Pure Node (built-in zlib), no dependencies. Supersampled for clean edges.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('../public/icons/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const BG = [30, 37, 68];    // #1E2544 Midnight Blue
const TEAL = [67, 186, 202]; // #43BACA Restful Teal

// CRC32 (PNG chunk checksums)
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(width, height, rgb /* Buffer w*h*3 */) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type: truecolor RGB
  // rows: prepend filter byte 0 (None) to each scanline
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Coverage of the teal crescent at a point (supersampled by caller).
function inCrescent(px, py, S, scale) {
  const r = S * scale;
  const cx = S * 0.47, cy = S * 0.53;
  const carveX = cx + r * 0.46, carveY = cy - r * 0.40, rc = r * 0.90;
  const d1 = Math.hypot(px - cx, py - cy);
  const d2 = Math.hypot(px - carveX, py - carveY);
  return d1 <= r && d2 >= rc;
}

function render(S, scale) {
  const SS = 4; // supersample grid per pixel
  const rgb = Buffer.alloc(S * S * 3);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let cov = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (inCrescent(px, py, S, scale)) cov++;
        }
      }
      cov /= SS * SS;
      const i = (y * S + x) * 3;
      for (let c = 0; c < 3; c++) rgb[i + c] = Math.round(BG[c] * (1 - cov) + TEAL[c] * cov);
    }
  }
  return encodePNG(S, S, rgb);
}

const specs = [
  ['icon-32.png', 32, 0.34],
  ['icon-96.png', 96, 0.34],
  ['icon-180.png', 180, 0.34],
  ['icon-192.png', 192, 0.34],
  ['icon-256.png', 256, 0.34],
  ['icon-512.png', 512, 0.34],
  ['icon-maskable-512.png', 512, 0.30], // tighter for maskable safe zone
];

for (const [name, S, scale] of specs) {
  writeFileSync(OUT + name, render(S, scale));
  console.log(`${name.padEnd(24)} ${S}x${S}`);
}
console.log('done');
