// Générateur aléatoire à graine (mulberry32), avec un flux séparé par système (GDD 8.3).
// Le hasard d'un système ne décale jamais celui des autres.

export const STREAMS = ['monde', 'aventuriers', 'ia', 'combat', 'quetes', 'marche', 'personnel', 'noms'] as const;
export type Stream = (typeof STREAMS)[number];

interface HasRng { rng: Record<string, number> }

function splitmix(seed: number): number {
  let z = (seed + 0x9e3779b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

export function seedStreams(seed: number): Record<string, number> {
  const out: Record<string, number> = {};
  STREAMS.forEach((s, i) => { out[s] = splitmix(seed * 31 + i * 7919); });
  return out;
}

/** Nombre dans [0, 1). Fait avancer le flux. */
export function rand(st: HasRng, s: Stream): number {
  let a = st.rng[s] | 0;
  a = (a + 0x6d2b79f5) | 0;
  st.rng[s] = a >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function chance(st: HasRng, s: Stream, p: number): boolean {
  return rand(st, s) < p;
}

/** Entier entre min et max inclus. */
export function randInt(st: HasRng, s: Stream, min: number, max: number): number {
  return min + Math.floor(rand(st, s) * (max - min + 1));
}

export function range(st: HasRng, s: Stream, min: number, max: number): number {
  return min + rand(st, s) * (max - min);
}

export function pick<T>(st: HasRng, s: Stream, arr: readonly T[]): T {
  return arr[Math.floor(rand(st, s) * arr.length)];
}

export function weighted<T extends string>(st: HasRng, s: Stream, weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = rand(st, s) * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r < 0) return k;
  }
  return entries[entries.length - 1][0];
}

/** Mélange de Fisher-Yates, en place. */
export function shuffle<T>(st: HasRng, s: Stream, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(st, s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
