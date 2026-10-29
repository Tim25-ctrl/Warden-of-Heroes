// Équipement : achats et réparations chez le Forgeron de la ville (GDD 3.8).
import { hasTrait } from './adventurers';
import { GEAR, P, TIERS } from './data';
import { IP } from './economy';
import { advLink, money } from './format';
import { log, think, flow } from './journal';
import { townSpend } from './mods';
import { odFactor } from './market';
import type { Adventurer, GameState, Gear, Money } from './types';

export type GearKind = 'weapon' | 'armor';

export function maxTierInTown(s: GameState): number {
  // Palier de la ville (5.3), qui ne change qu'après 14 jours au-delà du seuil.
  return GEAR.palierMaxParVille[s.world?.palier ?? 'bourg'];
}

export function gearPrice(s: GameState, tier: number, kind: GearKind): Money {
  const t = TIERS[tier - 1];
  if (!t) return Infinity;
  const base = kind === 'weapon' ? t.arme : t.armure;
  const mat = t.materiau ? 0.5 + 0.5 * odFactor(s, t.materiau) : 1;
  return Math.round(base * IP(s) * mat);
}

export function repairCost(s: GameState, g: Gear, kind: GearKind): Money {
  const slices = Math.ceil((100 - g.dur) / 25);
  return Math.round(slices * GEAR.reparationParTranche * gearPrice(s, g.tier, kind));
}

/** L'aventurier passe chez le Forgeron : achat du palier suivant ou réparation (3.8.2, 3.8.3). */
export function tryForge(s: GameState, a: Adventurer): boolean {
  const reserve = P.economie.coutVieJour * 3;
  const options: { kind: GearKind; action: 'achat' | 'reparation'; cost: Money }[] = [];
  for (const kind of ['weapon', 'armor'] as GearKind[]) {
    const g = a[kind];
    const next = g.tier + 1;
    const t = TIERS[next - 1];
    if (t && next <= maxTierInTown(s) && a.level >= t.niveau) {
      const cost = gearPrice(s, next, kind);
      const factor = hasTrait(a, 'coquet') ? 1.2 : 1.5;
      if (a.gold >= cost * factor + reserve) options.push({ kind, action: 'achat', cost });
    }
    if (g.dur < P.equipement.seuilReparation) {
      const cost = repairCost(s, g, kind);
      if (cost > 0 && a.gold >= cost + reserve) options.push({ kind, action: 'reparation', cost });
    }
  }
  if (options.length === 0) return false;
  const o = options.sort((x, y) => (x.action === 'reparation' ? -1 : 1) - (y.action === 'reparation' ? -1 : 1))[0];
  a.gold -= o.cost; flow('forge', -(o.cost)); townSpend(s, o.cost);
  const g = a[o.kind];
  const what = o.kind === 'weapon' ? 'arme' : 'armure';
  if (o.action === 'achat') {
    g.tier += 1;
    g.dur = 100;
    a.fierte = Math.min(100, a.fierte + (hasTrait(a, 'coquet') ? 4 : 2));
    log(s, 'aventuriers', 'info', `${advLink(a)} s'offre une ${what} en ${TIERS[g.tier - 1].nom.toLowerCase()} (${money(o.cost)}).`);
    think(s, a, `Une ${what} neuve en ${TIERS[g.tier - 1].nom.toLowerCase()}. Les monstres n'ont qu'à bien se tenir.`);
  } else {
    g.dur = 100;
    think(s, a, `J'ai fait réparer mon ${what === 'arme' ? 'arme' : 'armure'} pour ${money(o.cost)}.`);
  }
  a.activity = { kind: 'forge', until: s.tick + 2, place: 'ville' };
  return true;
}

export function wantsForge(s: GameState, a: Adventurer): boolean {
  for (const kind of ['weapon', 'armor'] as GearKind[]) {
    const g = a[kind];
    const t = TIERS[g.tier];
    if (t && g.tier + 1 <= maxTierInTown(s) && a.level >= t.niveau && a.gold >= gearPrice(s, g.tier + 1, kind) * 1.5) return true;
    if (g.dur < P.equipement.seuilReparation && a.gold >= repairCost(s, g, kind) + P.economie.coutVieJour * 3) return true;
  }
  return false;
}

/** Usure après une quête : 5 à 20 points selon la dureté des combats. */
export function wear(s: GameState, a: Adventurer, combats: number): void {
  const loss = Math.min(P.equipement.usureMax, P.equipement.usureMin + 3 * combats);
  for (const kind of ['weapon', 'armor'] as GearKind[]) {
    const g = a[kind];
    const before = g.dur;
    g.dur = Math.max(0, g.dur - loss);
    if (before > 0 && g.dur === 0) log(s, 'aventuriers', 'info', `L'${kind === 'weapon' ? 'arme' : 'armure'} de ${advLink(a)} est brisée.`);
  }
}
