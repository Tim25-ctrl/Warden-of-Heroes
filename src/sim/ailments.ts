// États : blessures, poisons, maladies, malédictions (GDD 1.8.1).
import { basePvMax, hasState, pvMax } from './adventurers';
import { ETATS, GRAVITES, P } from './data';
import { clamp } from './economy';
import { advLink } from './format';
import { log, think } from './journal';
import { chance, pick } from './rng';
import type { Adventurer, Ailment, AttrId, EtatId, GameState } from './types';

export const gravityName = (g: number) => GRAVITES[Math.max(0, Math.min(2, g))];
export const ailmentLabel = (st: Ailment) => `${ETATS[st.etat].nom} ${gravityName(st.gravite)}`;

/** Gravité selon les dégâts d'un coup, en proportion des PV maximum (4.7.2). */
export function gravityFromDamage(dmg: number, a: Adventurer): number {
  const r = dmg / Math.max(1, basePvMax(a));
  return r > 0.4 ? 2 : r > 0.2 ? 1 : 0;
}

export function addAilment(s: GameState, a: Adventurer, etat: EtatId, gravite: number, quiet = false): void {
  if (etat === 'poison' && (a.buffs.includes('antipoison') || a.buffs.includes('legendaire'))) return;
  const g = Math.max(0, Math.min(2, gravite));
  const existing = a.states.find((x) => x.etat === etat);
  if (existing) {
    const before = existing.gravite;
    existing.gravite = Math.min(2, Math.max(existing.gravite, g) + (chance(s, 'combat', 0.3) ? 1 : 0));
    if (existing.gravite > before) { existing.since = s.tick; existing.bandaged = false; }
  } else {
    a.states.push({ etat, gravite: g, since: s.tick });
    if (etat === 'brulure') a.morale = clamp(a.morale - 10, 0, 100);
  }
  a.hp = Math.min(a.hp, pvMax(a));
  if (!quiet) {
    const st = a.states.find((x) => x.etat === etat)!;
    if (st.gravite >= 1) think(s, a, `${ETATS[etat].nom} ${gravityName(st.gravite)}… Il va falloir me soigner.`);
  }
}

export function removeAilment(a: Adventurer, etat: EtatId): void {
  a.states = a.states.filter((x) => x.etat !== etat);
}

export function worstGravity(a: Adventurer): number {
  return a.states.reduce((m, st) => Math.max(m, st.gravite), -1);
}

/** Peut partir en quête : pas de fracture, rien de critique, au moins la moitié de ses PV. */
export function canQuest(a: Adventurer): boolean {
  if (hasState(a, 'fracture')) return false;
  if (a.states.some((st) => st.gravite >= 2)) return false;
  return a.hp >= pvMax(a) * 0.5;
}

/** Évolution heure par heure. Renvoie une cause de mort, ou null. */
export function hourlyAilments(s: GameState, a: Adventurer): string | null {
  const H = 24;
  for (const st of [...a.states]) {
    const age = s.tick - st.since;
    switch (st.etat) {
      case 'poison':
        a.hp -= P.etats.poisonPvH[st.gravite];
        if (a.hp <= 0) {
          if (st.gravite >= 2) return 'empoisonné';
          a.hp = 1;
        }
        // Un poison léger finit par s'éliminer seul
        if (st.gravite === 0 && age >= 12) a.states = a.states.filter((x) => x !== st);
        break;
      case 'plaie':
        // Toutes les 48 h sans pansement : risque d'infection, qui aggrave d'un cran (1.8.1)
        if (!st.bandaged && st.gravite < 2 && age > 0 && age % P.etats.infectionH === 0 && chance(s, 'aventuriers', P.etats.infectionChance)) {
          st.gravite += 1;
          st.since = s.tick;
          log(s, 'aventuriers', 'important', `La plaie de ${advLink(a)} s'infecte (${gravityName(st.gravite)}).`);
        } else if (st.gravite < 2 && age >= (st.gravite === 0 ? (st.bandaged ? 3 : 4) : 8) * H) {
          a.states = a.states.filter((x) => x !== st);
        }
        break;
      case 'fracture':
        if (age >= P.etats.fractureJours * H) {
          a.states = a.states.filter((x) => x !== st);
          // Chirurgien de l'infirmerie de niveau 4 : risque de séquelle −75 % (1.8.6)
          if (chance(s, 'aventuriers', P.etats.sequelleChance * (s.infirmerie.level >= 4 ? 0.25 : 1))) {
            const attr = pick(s, 'aventuriers', ['FOR', 'AGI', 'CON'] as AttrId[]);
            a.attrs[attr] = Math.max(1, a.attrs[attr] - 1);
            a.history.notable.push('séquelle de fracture');
            log(s, 'aventuriers', 'important', `La fracture de ${advLink(a)} s'est mal ressoudée : séquelle permanente.`);
          }
        }
        break;
      case 'brulure':
        if (age >= P.etats.brulureJours * H) {
          a.states = a.states.filter((x) => x !== st);
          a.fierte = clamp(a.fierte - 5, 0, 100);
        }
        break;
      case 'maladie':
        if (st.gravite === 0 && age === P.etats.aggravationMaladieH && chance(s, 'aventuriers', 0.4)) {
          st.gravite = 1;
          st.since = s.tick;
        } else if (age >= (st.gravite === 0 ? P.etats.maladieJours : 7) * H) {
          a.states = a.states.filter((x) => x !== st);
        }
        break;
      case 'malediction':
        if (age > 0 && age % H === 0) a.morale = clamp(a.morale - 2, 0, 100);
        break;
    }
    // Un état critique non soigné peut tuer (tirage quotidien)
    if (st.gravite >= 2 && age >= P.etats.delaiMortCritiqueH && age % H === 0 && a.states.includes(st)) {
      if (chance(s, 'aventuriers', P.etats.mortCritiqueParJour)) return `des suites d'une ${ETATS[st.etat].nom.toLowerCase()} non soignée`;
    }
  }
  a.hp = Math.min(a.hp, pvMax(a));
  return null;
}
