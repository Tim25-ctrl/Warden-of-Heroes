// Combat en rounds abstraits (GDD 4.7, 4.8.1, 4.8.3) et dépouilles (2.3).
import { attackOf, defenseOf, hasTrait, practice, profileOf, pvMax, skill } from './adventurers';
import { addAilment, gravityFromDamage } from './ailments';
import { CLASSES, P, SPECIES } from './data';
import { clamp } from './economy';
import { hourOf } from './format';
import { addLot } from './market';
import { modMult } from './mods';
import { diff } from './legend';
import { chance, rand, randInt, range } from './rng';
import type { Adventurer, GameState, Quality, ResLot } from './types';

export interface CombatResult {
  outcome: 'victoire' | 'retraite' | 'defaite';
  killed: number;
  rounds: number;
  marge: number;
  dead: Adventurer[];
  critical: Adventurer[];
  loot: ResLot[];
  gold: number;
  saved: [number, number][];
  dmgToFoes: number;            // pour l'escorte : pression subie par le convoi
}

interface Foe { hp: number }

function dmg(s: GameState, att: number, def: number): number {
  return (att * att) / (att + def) * P.combat.coefDegats * range(s, 'combat', 0.8, 1.2);
}

/** Multiplicateur des dégâts d'un aventurier contre une espèce (capacités spéciales, 4.7.1). */
function attackMult(a: Adventurer, special: string, undead: boolean): number {
  const magic = a.classe === 'mage';
  let m = 1;
  if (special === 'aerienne') m *= a.classe === 'rodeur' ? 1.5 : magic ? 1 : 0.7;
  if (special === 'golem' && !magic) m *= 0.5;
  if (undead && a.classe === 'clerc') m *= 2;
  return m;
}

export function fight(
  s: GameState, team: Adventurer[], speciesId: string, count: number, leader: Adventurer, cohesion = 0,
  opts: { legend?: boolean; defMult?: number } = {},
): CombatResult {
  const sp = SPECIES[speciesId];
  // Bête légendaire : PV ×5, attaque ×2 (5.4.3). Saison des amours : attaque des loups et sangliers +20 % (5.4.3).
  const pvFoe = sp.pv * (opts.legend ? P.monde.legendePv : 1);
  const attMult = (opts.legend ? P.monde.legendeAttaque : 1) * modMult(s, `attaque:${speciesId}`);
  const defMult = opts.defMult ?? 1;
  const foes: Foe[] = Array.from({ length: count }, () => ({ hp: pvFoe }));
  const hpStart = team.reduce((a, m) => a + m.hp, 0);
  const downed = new Set<number>();
  const saved: [number, number][] = [];
  const standing = () => team.filter((m) => !downed.has(m.id));
  const alive = () => foes.filter((f) => f.hp > 0);
  const seuil = P.combat.seuilsRetraite[profileOf(leader)];
  const hasClerc = () => standing().some((m) => m.classe === 'clerc');
  const cohesionMult = 1 + cohesion / 200;
  let outcome: CombatResult['outcome'] = 'retraite';
  let round = 0;
  let dmgToFoes = 0;

  const order = [...team].sort((a, b) => (a.classe === 'rodeur' ? -1 : 0) - (b.classe === 'rodeur' ? -1 : 0));

  for (round = 1; round <= P.combat.roundsMax; round++) {
    let magicHit = false;
    // --- Les aventuriers agissent
    for (const m of order) {
      if (downed.has(m.id)) continue;
      // Potion bue automatiquement sous 25 % de PV
      if (m.hp < pvMax(m) * 0.25 && m.sac.potion > 0) {
        m.sac.potion -= 1;
        m.hp = Math.min(pvMax(m), m.hp + 40);
      }
      if (m.classe === 'clerc') {
        const hurt = team.filter((x) => x.hp < pvMax(x) * 0.5).sort((x, y) => x.hp / pvMax(x) - y.hp / pvMax(y))[0];
        if (hurt) {
          const heal = m.attrs.VOL + 2 * skill(m, 'soins');
          if (downed.has(hurt.id)) {
            if (chance(s, 'combat', 0.4 + 0.03 * skill(m, 'soins'))) {
              downed.delete(hurt.id);
              hurt.hp = Math.min(pvMax(hurt), heal);
              saved.push([m.id, hurt.id]);
            }
          } else {
            hurt.hp = Math.min(pvMax(hurt), hurt.hp + heal);
            if (hurt.id !== m.id) saved.push([m.id, hurt.id]);
          }
          practice(s, m, 'soins', 'combat');
          continue;
        }
      }
      const targets = alive();
      if (targets.length === 0) break;
      const target = targets.reduce((lo, f) => (f.hp < lo.hp ? f : lo));
      let def = sp.defense;
      if (sp.special === 'carapace' && m.classe !== 'mage') def *= 1.5;
      const d = dmg(s, attackOf(m), def) * attackMult(m, sp.special, sp.mortVivant) * cohesionMult;
      target.hp -= d;
      dmgToFoes += d;
      if (m.classe === 'mage') magicHit = true;
      practice(s, m, CLASSES[m.classe].arme, 'combat');
      if (sp.mortVivant && m.classe === 'clerc') practice(s, m, 'exorcisme', 'combat');
    }
    // Régénération du troll, sauf s'il a été touché par les Arcanes
    if (sp.special === 'regeneration' && !magicHit) for (const f of alive()) f.hp = Math.min(pvFoe, f.hp + 10);
    // Les gobelins fuient à 50 % de pertes
    if (sp.special === 'couards' && foes.filter((f) => f.hp <= 0).length >= Math.ceil(count / 2)) { outcome = 'victoire'; break; }
    if (alive().length === 0) { outcome = 'victoire'; break; }

    // --- Les monstres agissent
    const up = standing();
    const guard = up.filter((m) => m.classe === 'guerrier').reduce((mx, m) => Math.max(mx, skill(m, 'protection')), 0);
    const pack = alive().length;
    for (let k = alive().length; k > 0; k--) {
      const cands = standing();
      if (cands.length === 0) break;
      const weights = cands.map((m) => (m.classe === 'guerrier' ? 2 : 1));
      let r = rand(s, 'combat') * weights.reduce((a, w) => a + w, 0);
      let target = cands[0];
      for (let i = 0; i < cands.length; i++) { r -= weights[i]; if (r < 0) { target = cands[i]; break; } }
      let att = sp.attaque * attMult;
      if (sp.special === 'meute') att *= 1 + 0.1 * Math.max(0, pack - 2);
      let d = dmg(s, att, defenseOf(target) * defMult);
      if (sp.special === 'charge' && round === 1) d *= 1.5;
      if (target.classe !== 'guerrier') d *= 1 - 0.02 * guard;
      target.hp -= d;
      for (const e of sp.etats) {
        if (chance(s, 'combat', e.chance)) addAilment(s, target, e.etat, gravityFromDamage(d, target) + (e.gravite ?? 0), true);
      }
      if (target.hp <= 0) { target.hp = 0; downed.add(target.id); }
    }
    // Un allié fait boire une potion à un camarade à terre
    for (const id of [...downed]) {
      const giver = standing().find((m) => m.sac.potion > 0);
      if (!giver) break;
      giver.sac.potion -= 1;
      const x = team.find((m) => m.id === id)!;
      downed.delete(id);
      x.hp = Math.min(pvMax(x), 40);
      saved.push([giver.id, x.id]);
    }
    if (standing().length === 0) { outcome = 'defaite'; break; }

    // --- Test de retraite
    const hpNow = team.reduce((a, m) => a + m.hp, 0);
    const fragile = standing().some((m) => m.hp < pvMax(m) * 0.25 && m.sac.potion === 0) && !hasClerc();
    const mustFlee = hpNow / Math.max(1, hpStart) < seuil || (downed.size > 0 && !hasClerc()) || fragile;
    if (mustFlee) {
      const up2 = standing();
      const agi = up2.reduce((a, m) => a + m.attrs.AGI, 0) / up2.length;
      const disc = up2.reduce((mx, m) => Math.max(mx, skill(m, 'discretion')), 0);
      const p = 0.5 + agi / 100 + (2 * disc) / 100 - 0.1 * Math.max(0, alive().length - 2);
      if (chance(s, 'combat', clamp(p, 0.05, 0.95))) { outcome = 'retraite'; break; }
    }
  }
  if (round > P.combat.roundsMax) round = P.combat.roundsMax;

  const killed = foes.filter((f) => f.hp <= 0).length;
  const hpEnd = team.reduce((a, m) => a + m.hp, 0);
  const marge = clamp(hpEnd / Math.max(1, hpStart), 0, 1);

  // --- Aventuriers à terre en fin de combat (4.8.3)
  const dead: Adventurer[] = [];
  const critical: Adventurer[] = [];
  const clercUp = hasClerc();
  const bigFoe = ['B', 'A', 'S'].includes(sp.rang);
  for (const m of team) {
    if (!downed.has(m.id)) continue;
    const p = clamp(0.6 - (2 * m.attrs.CON) / 100 + (bigFoe ? 0.1 : 0) - (clercUp ? 0.15 : 0), P.combat.mortMin, P.combat.mortMax) * diff(s).mort;
    if (chance(s, 'combat', p)) dead.push(m);
    else {
      m.hp = 1;
      const st = sp.etats[0]?.etat ?? 'plaie';
      addAilment(s, m, st === 'poison' || st === 'malediction' || st === 'maladie' ? 'plaie' : st, 2, true);
      critical.push(m);
    }
  }

  // --- Dépouilles et or des monstres tués (2.3)
  const loot: ResLot[] = [];
  let gold = 0;
  const knowledge = team.reduce((mx, m) => Math.max(mx, skill(m, 'connaissance')), 0);
  const night = hourOf(s.tick) >= 22 || hourOf(s.tick) < 6;
  const unlucky = team.some((m) => hasTrait(m, 'malchanceux'));
  const thief = team.some((m) => m.classe === 'voleur');
  for (let i = 0; i < killed; i++) {
    for (const res of sp.butin) {
      const score = 40 + 3 * knowledge + 20 * marge - (night ? 10 : 0) - (unlucky ? 10 : 0);
      const roll = rand(s, 'combat') * 100;
      const quality: Quality = roll < score ? 'intacte' : roll < score + 35 ? 'abimee' : 'ruinee';
      addLot(loot, { res, qty: 1, quality, fresh: 1 });
    }
    if (sp.or) gold += Math.round(randInt(s, 'combat', sp.or[0], sp.or[1]) * (thief ? 1.2 : 1));
    for (const m of team) if (!downed.has(m.id)) practice(s, m, 'connaissance', 'combat');
  }
  return { outcome, killed, rounds: round, marge, dead, critical, loot, gold, saved, dmgToFoes };
}
