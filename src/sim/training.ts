// Terrain d'entraînement et professeurs (GDD 1.7).
import { hasTrait, practice, xpQuestType, gainXp } from './adventurers';
import { NAMES, P, PROFS, SLOTS, TERRAIN_LEVELS, TRAINING } from './data';
import { applyPurchase, applyRefusal, clamp, hasModule, judge, mProf, sessionPrice, sessionRef } from './economy';
import { hourOf, money } from './format';
import { earn, log, spend, think, flow } from './journal';
import { chance, pick, randInt } from './rng';
import { takenNames } from './adventurers';
import { sealOf, unlock } from './legend';
import type { Adventurer, GameState, Money, Professor, ProfType, SlotId } from './types';

export function profSalary(p: Professor): Money {
  const k = TRAINING.salaire;   // ajusté en v1.1 : (1 + 0,12 × Niveau^1,4), contre (2 + 0,25 × Niveau^1,4) avant
  return Math.round((k.base + k.coef * Math.pow(p.level, k.exposant)) * (0.7 + p.pedagogie / 166) * 100);
}

export function createProf(s: GameState, type?: ProfType): Professor {
  const t = type ?? pick(s, 'personnel', Object.keys(PROFS) as ProfType[]);
  const taken = takenNames(s);
  let name = pick(s, 'noms', NAMES.prenoms);
  if (taken.has(name)) name = `${name} ${pick(s, 'noms', NAMES.surnoms)}`;
  return {
    id: s.nextId++,
    name,
    type: t,
    // Le niveau maximal d'un professeur dépend du Sceau de la guilde (6.2).
    level: randInt(s, 'personnel', 3, Math.max(P.terrain.niveauProfMax, sealOf(s.rank).profMax)),
    pedagogie: randInt(s, 'personnel', 20, 80),
    eleves: randInt(s, 'personnel', 4, 8),
    ego: randInt(s, 'personnel', 1, 2),
    slots: { matin: true, apresmidi: false, soir: false },
    prix: 0,                           // fixé à l'embauche (valeur de la séance)
    loyalty: 60,
    unpaidDays: 0,
    hiredTick: s.tick,
    offerUntil: s.tick + 7 * 24,
  };
}

export function maxProfs(s: GameState): number {
  return s.terrain.level ? TERRAIN_LEVELS[s.terrain.level - 1].profs : 0;
}
export function profUnlocked(s: GameState, t: ProfType): boolean {
  return s.terrain.level > 0 && TERRAIN_LEVELS[s.terrain.level - 1].debloque.includes(t);
}

export function canHireProf(s: GameState, p: Professor): string | null {
  if (s.terrain.level === 0) return 'Il faut d\'abord construire le terrain.';
  if (!profUnlocked(s, p.type)) return 'Le terrain n\'est pas assez grand pour ce professeur.';
  if (p.ego > s.terrain.level) return `Exige un terrain de niveau ${p.ego}.`;
  if (s.terrain.profs.length >= maxProfs(s)) return 'Plus de place pour un professeur.';
  return null;
}

export function hireProf(s: GameState, id: number): boolean {
  const i = s.profCandidates.findIndex((p) => p.id === id);
  if (i < 0 || canHireProf(s, s.profCandidates[i])) return false;
  const p = s.profCandidates[i];
  s.profCandidates.splice(i, 1);
  p.hiredTick = s.tick;
  if (!p.prix) p.prix = sessionRef(s, p);   // prix de départ : la valeur de sa séance
  s.terrain.profs.push(p);
  log(s, 'guilde', 'important', `${p.name}, ${PROFS[p.type].nom.toLowerCase()} de niveau ${p.level}, rejoint le terrain (${money(profSalary(p))} par jour).`);
  if (p.ancien) unlock(s, 'retraite_doree');
  return true;
}

export function fireProf(s: GameState, id: number): void {
  const p = s.terrain.profs.find((x) => x.id === id);
  if (!p) return;
  spend(s, 'indemnites', profSalary(p) * P.personnel.indemniteJours);
  s.terrain.profs = s.terrain.profs.filter((x) => x !== p);
  log(s, 'guilde', 'info', `${p.name} quitte le terrain d'entraînement.`);
}

/** Offres de professeurs, rares (1.7.2). */
export function dailyProfOffers(s: GameState): void {
  s.profCandidates = s.profCandidates.filter((p) => p.offerUntil > s.tick);
  if (chance(s, 'personnel', P.terrain.offreProfParJour)) {
    const p = createProf(s);
    s.profCandidates.push(p);
    log(s, 'guilde', 'important', `${p.name}, ${PROFS[p.type].nom.toLowerCase()} de niveau ${p.level}, propose ses services au terrain d'entraînement.`);
  }
}

export function profPayroll(s: GameState): void {
  for (const p of [...s.terrain.profs]) {
    if (s.treasury >= 0) { spend(s, 'professeurs', profSalary(p)); p.unpaidDays = 0; }
    else {
      p.unpaidDays += 1;
      p.loyalty = clamp(p.loyalty - 10, 0, 100);
      if (p.unpaidDays > P.personnel.joursImpayesMax) {
        s.terrain.profs = s.terrain.profs.filter((x) => x !== p);
        log(s, 'guilde', 'important', `${p.name} part, faute d'être payé.`);
      }
    }
  }
}

// ---------- Séances (1.7.3) ----------

export function slotAt(hour: number): SlotId | null {
  return SLOTS.find((x) => x.heure === hour)?.id ?? null;
}

function attendance(s: GameState, profId: number): number {
  return s.adventurers.filter((a) => a.activity.kind === 'entrainement' && a.activity.prof === profId && a.activity.until > s.tick).length;
}

function affinity(s: GameState, p: Professor, a: Adventurer): number {
  const def = PROFS[p.type];
  if (def.pleine.includes(a.classe)) return 1;
  if (def.partielle.includes(a.classe)) return p.type === 'archimage' && hasModule(s, 'salle_etude') ? 0.7 : 0.5;
  return 0.2;
}

function terrainMult(s: GameState, p: Professor | null): number {
  return 1 + 0.05 * (s.terrain.level - 1) + (p?.type === 'maitre_armes' && hasModule(s, 'armurerie') ? 0.1 : 0);
}

export function expectedXp(s: GameState, p: Professor | null, a: Adventurer): number {
  const second = a.trainedToday >= 1 ? 0.5 : 1;
  const base = 0.15 * xpQuestType(a.level) * terrainMult(s, p) * second;
  if (!p) return base * TRAINING.libre.mProf;
  return base * mProf(p) * affinity(s, p, a) * (a.level < p.level ? 1 : 0.1);
}

/** L'aventurier tente de suivre une séance qui commence maintenant. */
export function tryTrain(s: GameState, a: Adventurer): boolean {
  if (s.terrain.level === 0 || s.terrain.works && chance(s, 'ia', 0.5)) return false;
  const h = hourOf(s.tick);
  const slot = slotAt(h) ?? slotAt(h - 1); // on peut arriver avec une heure de retard
  const start = slotAt(h) ? h : h - 1;
  if (!slot || a.trainedToday >= 2 || a.energy < 30 || a.hunger < 30) return false;
  const opts: { p: Professor | null; price: Money; xp: number }[] = [];
  for (const p of s.terrain.profs) {
    if (!p.slots[slot] || attendance(s, p.id) >= p.eleves) continue;
    opts.push({ p, price: sessionPrice(s, p), xp: expectedXp(s, p, a) });
  }
  if (attendance(s, 0) < TRAINING.libre.places) opts.push({ p: null, price: sessionPrice(s, null), xp: expectedXp(s, null, a) });
  const affordable = opts.filter((o) => o.price <= a.gold - P.economie.coutVieJour);
  if (affordable.length === 0) return false;
  // L'élève compare l'XP au coût total de la séance : son prix, plus les trois heures qu'il y passe (ajusté en v1.1).
  const worth = (o: { price: Money; xp: number }) => o.xp / (o.price + TRAINING.valeurTemps);
  const best = affordable.sort((x, y) => worth(y) - worth(x))[0];
  const { verdict, R } = judge(a, best.price, sessionRef(s, best.p));
  if (verdict === 'refus') {
    applyRefusal(s, a, R);
    return false;
  }
  a.gold -= best.price; flow('entrainement', -(best.price));
  earn(s, 'entrainement', best.price);
  applyPurchase(s, a, R);
  const st = s.stats.services.entrainement ?? (s.stats.services.entrainement = { served: 0, revenue: 0, refusals: 0, toCompetitor: 0 });
  st.served += 1;
  st.revenue += best.price;
  const cost = hasModule(s, 'bassins') ? 0.5 : 1;
  a.energy = clamp(a.energy - 15 * cost, 0, 100);
  a.hunger = clamp(a.hunger - 10, 0, 100);
  a.activity = { kind: 'entrainement', until: s.tick - h + start + TRAINING.dureeSeance, place: 'terrain', prof: best.p?.id ?? 0 };
  if (hasTrait(a, 'ambitieux')) a.morale = clamp(a.morale + 2, 0, 100);
  return true;
}

export function completeTraining(s: GameState, a: Adventurer): void {
  const p = a.activity.prof ? s.terrain.profs.find((x) => x.id === a.activity.prof) ?? null : null;
  gainXp(s, a, expectedXp(s, p, a));
  a.trainedToday += 1;
  if (p) {
    const def = PROFS[p.type];
    if (p.type === 'stratege') {
      const cap = hasModule(s, 'table_cartes') ? 16 : 12;
      if ((a.skills.cohesion ?? 0) < cap) a.skills.cohesion = (a.skills.cohesion ?? 0) + 1;
    } else {
      for (const k of def.competences) if (a.skills[k] !== undefined) { practice(s, a, k); practice(s, a, k); }
    }
    if (a.level >= p.level && chance(s, 'ia', 0.3)) think(s, a, `${p.name} n'a plus grand-chose à m'apprendre.`);
  } else {
    practice(s, a, 'maniement');
  }
}

export function sessionsToday(s: GameState): { slot: SlotId; prof: Professor }[] {
  const out: { slot: SlotId; prof: Professor }[] = [];
  for (const p of s.terrain.profs) for (const sl of SLOTS) if (p.slots[sl.id]) out.push({ slot: sl.id, prof: p });
  return out;
}

export function logSession(s: GameState): void {
  const h = hourOf(s.tick);
  const slot = slotAt(h - TRAINING.dureeSeance);
  if (!slot) return;
  const done = s.stats.services.entrainement;
  if (done && done.served > 0) log(s, 'economie', 'detail', `Séances d'entraînement : ${done.served} élèves aujourd'hui (${money(done.revenue)}).`);
}

/** Un aventurier aguerri qui prend sa retraite peut proposer ses services de professeur (hauts faits 6.3). */
export function retiredTeacher(s: GameState, a: Adventurer): void {
  if (a.level < 10 || s.terrain.level === 0 || !chance(s, 'personnel', 0.5)) return;
  const type: ProfType = a.classe === 'mage' ? 'archimage' : a.classe === 'rodeur' && profUnlocked(s, 'chasseur') ? 'chasseur'
    : a.classe === 'clerc' && profUnlocked(s, 'aumonier') ? 'aumonier' : 'maitre_armes';
  const p = createProf(s, type);
  p.name = a.name;
  p.level = Math.min(30, a.level);
  p.ego = 1;
  p.ancien = true;
  p.offerUntil = s.tick + 14 * 24;
  s.profCandidates.push(p);
  log(s, 'guilde', 'important', `${a.name}, jeune retraité, propose de transmettre son savoir comme professeur (écran Personnel).`);
}
