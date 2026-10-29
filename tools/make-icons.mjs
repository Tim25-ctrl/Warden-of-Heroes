// Génère les icônes de l'application installable (GDD 8.7) : un sceau de cire rouge frappé d'une étoile d'or.
// Usage : node tools/make-icons.mjs  →  public/icons/icon-192.png, icon-512.png, maskable-512.png
import fs from 'fs';
import zlib from 'zlib';

const PARCHMENT = [245, 236, 215];
const NIGHT = [22, 26, 36];
const SEAL = [163, 59, 42];
const SEAL_DARK = [128, 42, 30];
const GOLD = [224, 189, 90];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
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
      // Suréchantillonnage 4×4 pour des bords lisses
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const p = pixel((x + (sx + 0.5) / 4) / size, (y + (sy + 0.5) / 4) / size);
        r += p[0]; g += p[1]; b += p[2]; a += p[3] ?? 255;
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r / 16; raw[o + 1] = g / 16; raw[o + 2] = b / 16; raw[o + 3] = a / 16;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function inStar(x, y, cx, cy, R, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : r;
    pts.push([cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]);
  }
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Le dessin, en coordonnées 0..1. `scale` réduit le sceau (zone de sécurité des icônes « maskable »). */
const art = (scale, bg) => (x, y) => {
  const dx = (x - 0.5) / scale, dy = (y - 0.5) / scale;
  const d = Math.hypot(dx, dy);
  // Bord ondulé de la cire
  const wobble = 0.44 + 0.015 * Math.sin(Math.atan2(dy, dx) * 14);
  if (d > wobble) return bg;
  if (inStar(dx, dy, 0, 0.01, 0.2, 0.085)) return GOLD;
  if (d > 0.31 && d < 0.335) return GOLD;
  return d > 0.36 ? SEAL_DARK : SEAL;
};

fs.mkdirSync('public/icons', { recursive: true });
fs.writeFileSync('public/icons/icon-192.png', png(192, art(1, [0, 0, 0, 0])));
fs.writeFileSync('public/icons/icon-512.png', png(512, art(1, [0, 0, 0, 0])));
fs.writeFileSync('public/icons/maskable-512.png', png(512, art(0.78, [...NIGHT, 255])));
fs.writeFileSync('public/icons/apple-touch-icon.png', png(180, art(0.86, [...PARCHMENT, 255])));
console.log('Icônes écrites dans public/icons');
