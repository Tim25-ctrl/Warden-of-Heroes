// Populations de monstres et de plantes par zone, danger des zones (GDD 2.7, 5.1.1).
import { isPlant, P, RESOURCES, SPECIES, ZONE_IDS, ZONES } from './data';
import { clamp } from './economy';
import { log } from './journal';
import { modAdd, season } from './mods';
import { diff } from './legend';
import { randInt } from './rng';
import type { GameState } from './types';

export function initPopulations(s: GameState): void {
  s.populations = {};
  for (const z of ZONE_IDS) {
    const pop: Record<string, number> = {};
    for (const sp of Object.keys(ZONES[z].especes)) {
      if (sp === 'dragon') pop[sp] = 0;                 // le dragon n'apparaît que par un événement (tranche 3)
      else if (sp === 'golem') pop[sp] = 100;           // 5 golems par zone
      else pop[sp] = randInt(s, 'monde', P.populations.departMin, P.populations.departMax);
    }
    for (const pl of Object.keys(ZONES[z].plantes)) pop[pl] = randInt(s, 'monde', 50, 70);
    s.populations[z] = pop;
  }
}

export const popOf = (s: GameState, zone: string, id: string) => s.populations[zone]?.[id] ?? 0;

/** Croissance logistique quotidienne (2.7). Les plantes repoussent comme les monstres. */
export function dailyPopulations(s: GameState): void {
  for (const z of ZONE_IDS) {
    const pop = s.populations[z];
    for (const id of Object.keys(pop)) {
      // Saisons (5.2) : reproduction et repousse ×1,5 au printemps, plantes au ralenti l'hiver.
      const sea = season(s);
      const r = (isPlant(id) ? 0.12 : SPECIES[id]?.r ?? 0)
        * (sea === 0 ? P.monde.printempsCroissance : 1) * (sea === 3 && isPlant(id) ? P.monde.hiverPlantes : 1)
        * (isPlant(id) ? 1 : diff(s).croissance);
      const before = pop[id];
      if (pop[id] > 0) pop[id] = clamp(pop[id] + r * pop[id] * (1 - pop[id] / 100), 0, 100);
      if (!isPlant(id) && before <= P.populations.proliferation && pop[id] > P.populations.proliferation) {
        log(s, 'monde', 'important', `Les ${SPECIES[id].pluriel} prolifèrent ${ZONES[z].lieu}.`);
      }
    }
  }
  s.danger = regionalDanger(s);
}

export function killed(s: GameState, zone: string, speciesId: string, n: number): void {
  const pop = s.populations[zone];
  if (!pop || pop[speciesId] === undefined) return;
  const before = pop[speciesId];
  pop[speciesId] = clamp(pop[speciesId] - SPECIES[speciesId].k * n, 0, 100);
  if (before >= P.populations.rarefaction && pop[speciesId] < P.populations.rarefaction) {
    log(s, 'monde', 'info', `Les ${SPECIES[speciesId].pluriel} se font rares ${ZONES[zone].lieu}.`);
  }
}

export function harvested(s: GameState, zone: string, plant: string, n: number): void {
  const pop = s.populations[zone];
  if (!pop || pop[plant] === undefined) return;
  pop[plant] = clamp(pop[plant] - 0.6 * n, 0, 100);
}

/** Danger d'une zone : base de la zone, modulée par ses populations (2.7). */
export function zoneDanger(s: GameState, zone: string): number {
  const z = ZONES[zone];
  let num = 0;
  let den = 0;
  for (const [id, w] of Object.entries(z.especes)) {
    const sp = SPECIES[id];
    if (!sp || id === 'dragon') continue;
    num += popOf(s, zone, id) * sp.menace * w;
    den += 50 * sp.menace * w;
  }
  const ratio = den > 0 ? num / den : 1;
  // L'hiver, les bêtes affamées s'approchent : Danger des zones proches +10 (5.2).
  const hiver = season(s) === 3 && z.trajet <= 4 ? P.monde.hiverDanger : 0;
  return clamp(Math.round(z.danger * ratio + hiver), 0, 100);
}

/** Danger régional : moyenne pondérée des zones, les plus proches comptant davantage (5.1.1). */
export function regionalDanger(s: GameState): number {
  let num = 0;
  let den = 0;
  for (const z of ZONE_IDS) {
    num += zoneDanger(s, z) * ZONES[z].poidsDanger;
    den += ZONES[z].poidsDanger;
  }
  // Vague de monstres, assaut repoussé : modificateurs temporaires (5.4.3, 5.6).
  return clamp(Math.round(num / den + modAdd(s, 'danger')), 0, 100);
}

export function plantsOf(zone: string): string[] {
  return Object.keys(ZONES[zone].plantes).filter((p) => RESOURCES[p]);
}
