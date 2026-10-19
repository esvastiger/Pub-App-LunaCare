/**
 * LunaCare · Generador de iconos PWA.
 * Dibuja una luna creciente sobre degradado blush→lilac y codifica el PNG
 * a mano (sin dependencias): cabecera IHDR + IDAT (zlib) + IEND + CRC32.
 *
 * Uso: node tools/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------ PNG

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filtro none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- Dibujo

const clamp01 = (x) => Math.min(1, Math.max(0, x));
/** Cobertura con antialias aproximado a partir de una distancia con signo. */
const cov = (sd) => clamp01(0.5 - sd);
const sdCircle = (px, py, cx, cy, r) => Math.hypot(px - cx, py - cy) - r;
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const dx = Math.abs(px - cx) - (hw - r);
  const dy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - r;
}
const mix = (a, b, t) => a + (b - a) * t;

const GRAD_A = [247, 201, 220]; // blush-300
const GRAD_B = [201, 184, 240]; // lilac-300

function drawIcon(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  // En variante maskable la luna se encoge para respetar la zona segura (80%).
  const scale = maskable ? 0.72 : 1;
  const c1x = 0.46 * size,
    c1y = 0.5 * size,
    r1 = 0.3 * size * scale;
  const c2x = 0.585 * size,
    c2y = 0.385 * size,
    r2 = 0.245 * size * scale;
  const corner = maskable ? 0 : 0.19 * size;
  const half = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const X = x + 0.5;
      const Y = y + 0.5;
      const t = clamp01((X + Y) / (2 * size));
      let r = mix(GRAD_A[0], GRAD_B[0], t);
      let g = mix(GRAD_A[1], GRAD_B[1], t);
      let b = mix(GRAD_A[2], GRAD_B[2], t);

      // Creciente: círculo grande menos círculo desplazado arriba-derecha.
      const moon = cov(sdCircle(X, Y, c1x, c1y, r1)) * (1 - cov(sdCircle(X, Y, c2x, c2y, r2)));
      if (moon > 0) {
        r = mix(r, 255, moon);
        g = mix(g, 252, moon);
        b = mix(b, 250, moon);
      }

      const alpha = cov(maskable ? 0 : sdRoundRect(X, Y, half, half, half, half, corner));
      const i = (y * size + x) * 4;
      px[i] = Math.round(r);
      px[i + 1] = Math.round(g);
      px[i + 2] = Math.round(b);
      px[i + 3] = Math.round(alpha * 255);
    }
  }
  return png(size, size, px);
}

writeFileSync(join(OUT, 'icon-192.png'), drawIcon(192));
writeFileSync(join(OUT, 'icon-512.png'), drawIcon(512));
writeFileSync(join(OUT, 'icon-maskable-512.png'), drawIcon(512, { maskable: true }));
writeFileSync(join(OUT, 'apple-touch-icon.png'), drawIcon(180, { maskable: true }));
console.log('Iconos generados en', OUT);
