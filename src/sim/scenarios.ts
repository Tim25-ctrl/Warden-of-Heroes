// Scénarios de départ (GDD 6.8, v1.1, D-165) : la Guilde endettée, la Ville assiégée, l'Héritier d'une guilde déchue.
// Chacun part de la partie standard et la modifie juste après la création du monde.
import { SPECIES, ZONE_IDS, ZONES } from './data';
import progression from './data/progression.json';
import { clamp } from './economy';
import { advLink, dayOf } from './format';
import { log } from './journal';
import { addMod } from './mods';
import { popOf } from './populations';
import { isPlant } from './data';
import { range } from './rng';
import type { ClassId, GameState, ScenarioId } from './types';
import { news, triggerAssault } from './world';

const H = 24;

export interface ScenarioDef { nom: string; resume: string; texte: string; hautFait: string | null }
export const SCENARIOS = progression.scenarios as Record<ScenarioId, ScenarioDef>;
export const SCENARIO_IDS = Object.keys(SCENARIOS) as ScenarioId[];
const SC = () => progression.scenarioReglages;

/** Les aventuriers présents le premier jour : [classe, niveau minimum, niveau maximum]. */
export function scenarioRoster(id: ScenarioId): [ClassId, number, number][] {
  if (id === 'endettee') {
    // Ceux qui sont restés malgré les dettes.
    return [['guerrier', 1, 3], ['rodeur', 1, 3], ['voleur', 1, 3], ['clerc', 1, 3]];
  }
  if (id === 'heritier') {
    // Les fidèles de l'ancienne guilde : plus aguerris, mais rancuniers envers le nom qu'ils portent.
    return [
      ['guerrier', 3, 6], ['guerrier', 2, 5], ['guerrier', 2, 5], ['rodeur', 2, 5], ['rodeur', 2, 4], ['voleur', 2, 5],
      ['voleur', 2, 4], ['mage', 2, 5], ['mage', 2, 4], ['clerc', 2, 5], ['clerc', 2, 4], ['guerrier', 1, 3],
    ];
  }
  return [
    ['guerrier', 1, 4], ['guerrier', 1, 4], ['guerrier', 1, 4],
    ['rodeur', 1, 3], ['rodeur', 1, 3],
    ['voleur', 1, 3], ['voleur', 1, 3],
    ['mage', 1, 2],
    ['clerc', 1, 3], ['clerc', 1, 3],
  ];
}

/** Applique le scénario à une partie qui vient d'être créée (monde, populations et aventuriers en place). */
export function applyScenario(s: GameState, id: ScenarioId): void {
  s.scenario = id;
  const c = SC();
  if (id === 'endettee') {
    const e = c.endettee;
    s.treasury = Math.round(s.treasury * e.tresorerie);
    s.today.tresorerieFin = s.treasury;
    s.loans.usurier = { principal: e.dette, since: s.tick, due: s.tick + e.echeanceJours * H, late: false, taux: e.tauxSemaine };
    s.loans.lastLoanTick = s.tick;
    s.world.damaged.dortoirs = true;
    s.world.damaged.refectoire = true;
    s.refectoire.damage = e.mobilier;
    s.dortoirs.proprete = e.proprete;
    s.renown = e.renommee;
  }
  if (id === 'assiegee') {
    const a = c.assiegee;
    // Les bêtes pullulent autour de la ville : chaque espèce (hors plantes, golems et dragon) part plus nombreuse.
    for (const z of ZONE_IDS) {
      if (ZONES[z].ville) continue;
      for (const sp of Object.keys(s.populations[z])) {
        if (isPlant(sp) || sp === 'golem' || sp === 'dragon') continue;
        s.populations[z][sp] = clamp(Math.round(popOf(s, z, sp) * a.populations), 0, 100);
      }
    }
    s.prosperity = a.prosperite;
    // La milice est débordée : la ville ne contient plus les bêtes, le Danger monte plus vite pendant la première saison.
    addMod(s, 'danger', s.tick + a.miliceJours * H, 'siege', { add: a.danger });
    news(s, 'une', 'La ville vit derrière ses remparts : la milice ne suffit plus, et les éclaireurs parlent de bêtes massées dans les collines.');
  }
  if (id === 'heritier') {
    const h = c.heritier;
    s.rank = 2;
    s.renown = h.renommee;
    s.dortoirs.level = 2;
    s.dortoirs.beds = { paillasse: 12, commun: 10, individuelle: 0, suite: 0 };
    s.refectoire.level = 2;
    s.cuisine.level = 2;
    s.infirmerie.level = 1;
    s.terrain.level = 1;
    for (const r of s.world.rivals) r.relation = h.relationRivales;
    // Les recrues se méfient du nom de la guilde : moins de candidats à la porte pendant un an.
    addMod(s, 'recrues', s.tick + h.mefianceJours * H, 'heritier', { mult: h.recrues });
    for (const a of s.adventurers) {
      a.loyalty = Math.round(range(s, 'aventuriers', h.loyaute[0], h.loyaute[1]));
      a.morale = Math.round(range(s, 'aventuriers', 45, 65));
    }
    news(s, 'une', `Le nom de la guilde, terni par son ancien gardien, retrouve un héritier. Les autres guildes l'attendent au tournant.`);
  }
  const def = SCENARIOS[id];
  if (id !== 'standard') log(s, 'guilde', 'important', def.texte);
}

/** Chaque matin : l'assaut annoncé de la Ville assiégée. */
export function scenarioMorning(s: GameState): void {
  if (s.scenario !== 'assiegee' || s.legend.counters.siegeAssaut) return;
  const a = SC().assiegee;
  if (dayOf(s.tick) < a.assautJour) return;
  s.legend.counters.siegeAssaut = 1;
  // L'espèce de rang E ou D la plus nombreuse marche sur la ville : une épreuve à la mesure d'une jeune guilde.
  let best: { z: string; sp: string; v: number } | null = null;
  for (const z of ZONE_IDS) {
    if (ZONES[z].ville || !ZONES[z].poidsDanger) continue;
    for (const sp of Object.keys(s.populations[z])) {
      if (isPlant(sp) || !['E', 'D'].includes(SPECIES[sp]?.rang)) continue;
      const v = popOf(s, z, sp);
      if (!best || v > best.v) best = { z, sp, v };
    }
  }
  if (best) triggerAssault(s, best.sp, best.z);
}

/** À la victoire : le haut fait du scénario. */
export function scenarioAchievement(s: GameState): string | null {
  return s.scenario ? SCENARIOS[s.scenario]?.hautFait ?? null : null;
}

/** Le nom du scénario, pour l'écran de la partie et l'épilogue. */
export const scenarioName = (s: GameState) => SCENARIOS[s.scenario ?? 'standard'].nom;

/** Phrase d'accueil adaptée au nombre d'aventuriers. */
export function welcomeText(s: GameState): string {
  const n = s.adventurers.length;
  const names = s.adventurers.slice(0, 2).map(advLink).join(' et ');
  if (s.scenario === 'endettee') return `Vous prenez la tête d'une guilde ruinée. ${n} aventuriers sont restés, dont ${names}. L'usurier, lui, n'est jamais parti.`;
  if (s.scenario === 'heritier') return `Vous héritez du Sceau de Fer et d'un nom à laver. ${n} aventuriers attendent de voir ce que vous valez.`;
  if (s.scenario === 'assiegee') return `Vous prenez la tête de la guilde au pire moment : la ville se barricade. ${n} aventuriers comptent sur vous.`;
  return `Vous prenez la tête de la guilde. ${n === 10 ? 'Dix' : n} aventuriers comptent sur vous pour les loger et les nourrir.`;
}

