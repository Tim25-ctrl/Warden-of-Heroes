// Modificateurs temporaires du monde (événements, saisons, rivales) : GDD 5.4.2.
// Module sans dépendance, lu par tous les systèmes qui subissent un effet.
import { seasonOf } from './format';
import type { GameState, Money, RoomId } from './types';

/** Produit des multiplicateurs actifs pour une clé (1 si aucun). */
export function modMult(s: GameState, key: string): number {
  if (!s.world) return 1;
  let m = 1;
  for (const x of s.world.mods) if (x.key === key && x.mult !== undefined && x.until > s.tick) m *= x.mult;
  return m;
}

/** Somme des ajouts actifs pour une clé (0 si aucun). */
export function modAdd(s: GameState, key: string): number {
  if (!s.world) return 0;
  let a = 0;
  for (const x of s.world.mods) if (x.key === key && x.add !== undefined && x.until > s.tick) a += x.add;
  return a;
}

export function addMod(s: GameState, key: string, until: number, source: string, v: { mult?: number; add?: number }): void {
  s.world.mods.push({ key, until, source, ...v });
}

/** 0 printemps, 1 été, 2 automne, 3 hiver. */
export const season = (s: GameState) => seasonOf(s.tick);

/** Or dépensé en ville par un aventurier : il nourrit la Prospérité (5.1.2). */
export function townSpend(s: GameState, v: Money): void {
  if (!s.world || v <= 0) return;
  const t = s.world.townSpend;
  if (t.length === 0) t.push(0);
  t[t.length - 1] += v;
}

/** Une salle endommagée par un assaut ne tourne qu'à moitié (5.6). */
export const damaged = (s: GameState, room: RoomId) => !!s.world?.damaged[room];

/** Personnel présent (les malades d'une épidémie sont absents, 5.7). */
export function present<T extends { absentUntil?: number }>(s: GameState, staff: T[]): T[] {
  return staff.filter((m) => !(m.absentUntil !== undefined && m.absentUntil > s.tick));
}
