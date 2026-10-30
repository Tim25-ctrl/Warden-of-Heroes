// Planches d'objets illustrés (v1.1, D-162) : une image sur fond vert uni, objets alignés sur une rangée.
// Au chargement, le vert est rendu transparent et chaque objet est découpé selon les colonnes vides qui le séparent
// des autres, de gauche à droite, dans l'ordre des noms donnés.

export interface Sprite { canvas: HTMLCanvasElement; w: number; h: number }

/** Rend le fond vert transparent, en adoucissant les bords et en retirant le reflet vert des contours. */
function keyGreen(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const green = g - Math.max(r, b);
    if (green > 70) { data[i + 3] = 0; continue; }
    if (green > 25) {
      data[i + 3] = Math.round(((70 - green) / 45) * 255);
      data[i + 1] = Math.max(r, b);   // bord : on enlève la teinte verte
    }
  }
}

/** Découpe les objets d'une planche détourée : colonnes occupées séparées par au moins `gap` colonnes vides. */
function slice(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, gap = 12): { x0: number; x1: number; y0: number; y1: number }[] {
  const { data } = ctx.getImageData(0, 0, w, h);
  const colFilled = (x: number) => { let n = 0; for (let y = 0; y < h; y += 2) if (data[(y * w + x) * 4 + 3] > 40) n++; return n > 2; };
  const spans: { x0: number; x1: number }[] = [];
  let start = -1, empty = 0;
  for (let x = 0; x < w; x++) {
    if (colFilled(x)) { if (start < 0) start = x; empty = 0; }
    else if (start >= 0 && ++empty >= gap) { spans.push({ x0: start, x1: x - empty }); start = -1; empty = 0; }
  }
  if (start >= 0) spans.push({ x0: start, x1: w - 1 });
  // Les plus larges d'abord si la planche contient des miettes, puis remis dans l'ordre de gauche à droite.
  const kept = spans.sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0)).slice(0, count).sort((a, b) => a.x0 - b.x0);
  return kept.map(({ x0, x1 }) => {
    let y0 = h, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = x0; x <= x1; x += 2) if (data[(y * w + x) * 4 + 3] > 40) { if (y < y0) y0 = y; if (y > y1) y1 = y; break; }
    return { x0, x1, y0, y1 };
  });
}

/**
 * Repère chaque objet d'une planche détourée, où qu'il soit : taches d'opacité séparées par du vide, sur une grille
 * de cases de 4 px élargie d'une case (les flèches d'une cible ou les saucisses d'un séchoir restent avec leur objet).
 */
function components(ctx: CanvasRenderingContext2D, w: number, h: number): { x0: number; x1: number; y0: number; y1: number }[] {
  const { data } = ctx.getImageData(0, 0, w, h);
  const C = 4, gw = Math.ceil(w / C), gh = Math.ceil(h / C);
  const filled = new Uint8Array(gw * gh);
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (data[(y * w + x) * 4 + 3] > 60) filled[Math.floor(y / C) * gw + Math.floor(x / C)] = 1;
  const grown = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    if (!filled[gy * gw + gx]) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = gx + dx, ny = gy + dy;
      if (nx >= 0 && ny >= 0 && nx < gw && ny < gh) grown[ny * gw + nx] = 1;
    }
  }
  const seen = new Uint8Array(gw * gh);
  const out: { x0: number; x1: number; y0: number; y1: number; n: number }[] = [];
  for (let i = 0; i < gw * gh; i++) {
    if (!grown[i] || seen[i]) continue;
    const stack = [i];
    seen[i] = 1;
    let x0 = gw, x1 = 0, y0 = gh, y1 = 0, n = 0;
    while (stack.length) {
      const j = stack.pop()!;
      const gx = j % gw, gy = (j - gx) / gw;
      if (filled[j]) { n++; if (gx < x0) x0 = gx; if (gx > x1) x1 = gx; if (gy < y0) y0 = gy; if (gy > y1) y1 = gy; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = gx + dx, ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const k = ny * gw + nx;
        if (grown[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    if (n > 40) out.push({ x0: x0 * C, x1: Math.min(w - 1, x1 * C + C - 1), y0: y0 * C, y1: Math.min(h - 1, y1 * C + C - 1), n });
  }
  return out;
}

/**
 * Charge une planche dont les objets sont disposés librement (plusieurs rangées, doublons) : pour chaque nom, on prend
 * l'objet le plus proche du point indiqué (en fraction de la largeur et de la hauteur de l'image).
 */
export function loadPicks<K extends string>(url: string, picks: Record<K, [number, number]>): Partial<Record<K, Sprite>> {
  const out: Partial<Record<K, Sprite>> = {};
  if (typeof Image === 'undefined' || typeof document === 'undefined') return out;
  const img = new Image();
  img.onload = () => {
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, w, h);
    keyGreen(id.data);
    ctx.putImageData(id, 0, 0);
    const comps = components(ctx, w, h);
    for (const [name, [fx, fy]] of Object.entries(picks) as [K, [number, number]][]) {
      const px = fx * w, py = fy * h;
      const dist = (b: { x0: number; x1: number; y0: number; y1: number }) =>
        Math.hypot(Math.max(b.x0 - px, 0, px - b.x1), Math.max(b.y0 - py, 0, py - b.y1));
      const b = [...comps].sort((a, d) => dist(a) - dist(d))[0];
      if (!b) continue;
      const sw = b.x1 - b.x0 + 1, sh = b.y1 - b.y0 + 1;
      const sc = document.createElement('canvas');
      sc.width = sw; sc.height = sh;
      sc.getContext('2d')!.drawImage(c, b.x0, b.y0, sw, sh, 0, 0, sw, sh);
      out[name] = { canvas: sc, w: sw, h: sh };
    }
  };
  img.src = url;
  return out;
}

/** Charge une planche et renvoie ses objets par nom, une fois prêts (objet vide en attendant). */
export function loadSheet<K extends string>(url: string, names: readonly K[]): Partial<Record<K, Sprite>> {
  const out: Partial<Record<K, Sprite>> = {};
  if (typeof Image === 'undefined' || typeof document === 'undefined') return out;
  const img = new Image();
  img.onload = () => {
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, w, h);
    keyGreen(id.data);
    ctx.putImageData(id, 0, 0);
    slice(ctx, w, h, names.length).forEach((b, i) => {
      const sw = b.x1 - b.x0 + 1, sh = b.y1 - b.y0 + 1;
      const sc = document.createElement('canvas');
      sc.width = sw; sc.height = sh;
      sc.getContext('2d')!.drawImage(c, b.x0, b.y0, sw, sh, 0, 0, sw, sh);
      out[names[i]] = { canvas: sc, w: sw, h: sh };
    });
  };
  img.src = url;
  return out;
}
