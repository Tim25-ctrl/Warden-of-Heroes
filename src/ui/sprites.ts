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
