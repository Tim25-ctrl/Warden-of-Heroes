// Quêtes : génération, primes, formation des équipes, déroulement (GDD chapitre 4).
import { attackOf, capacityOf, defenseOf, hasTrait, practice, profileOf, pvMax, rangIndex, sacCount, skill } from './adventurers';
import { addAilment, canQuest } from './ailments';
import { fight, type CombatResult } from './combat';
import { processReturn } from './comptoir';
import { CITIES, CITY_IDS, CLASSES, DISHES, isPlant, NAMES, P, RESOURCES, SPECIES, ZONE_IDS, ZONES } from './data';
import { onCaravanLost, questTrajet, routeOpen } from './cities';
import { applyPurchase, clamp, consumeDish, dishPrice, dishRef, dishServable, IP, judge, onDuty } from './economy';
import { advLink, hourOf, money } from './format';
import { earn, log, spend, think, flow } from './journal';
import { stockUp } from './infirmary';
import { killAdventurer } from './lifecycle';
import { addLot } from './market';
import { harvested, killed, popOf, zoneDanger, huntClosed } from './populations';
import { modMult, townSpend } from './mods';
import { diff, onKill } from './legend';
import { chance, pick, randInt, range, weighted } from './rng';
import { decorateQuest, onQuestExpired, questCountFactor, questMixWeights } from './world';
import { onSaved, rel, teamCohesion, teamOf } from './social';
import type { Adventurer, Attribution, ClientType, GameState, Money, Quest, QuestRun, QuestType, Rang } from './types';

export const FAR_FUTURE = 1e9;

export function boardCapacity(s: GameState): number {
  // Ajusté en v1.1 : une place de plus par 4 aventuriers au-delà de 20, pour qu'une grande guilde ait de quoi faire.
  const q = P.quetes;
  return q.tableauBase + 2 * (s.rank - 1) + Math.floor(Math.max(0, s.adventurers.length - q.tableauSeuilAventuriers) / q.tableauParAventuriers)
    + (onDuty(s, 'greffier') ? q.greffier.places : 0);
}

export const QUEST_TYPE_NAMES: Record<QuestType, string> = {
  aide: 'Aide en ville', chasse: 'Chasse', extermination: 'Extermination', cueillette: 'Cueillette',
  escorte: 'Escorte', exploration: 'Exploration', protection: 'Protection',
};
const MULT: Record<QuestType, number> = { aide: 0, chasse: 1, extermination: 0, cueillette: 0.7, escorte: 1.1, exploration: 1.3, protection: 1.4 };
const ZONE_RANG: Record<string, Rang> = { ville: 'F', foret: 'F', collines: 'E', marais: 'D', ruines: 'C', pics: 'B' };

// ---------- Génération (4.3) ----------

// ---------- Estimation du risque (4.5.1, ajustée en tranche 2) ----------
// Force de combat d'un camp = dégâts attendus par round × PV totaux (loi de Lanchester simplifiée),
// avec la même formule de dégâts que le combat réel.

const DEF_REF = 20;
export const expDmg = (att: number, def: number) => (att * att) / (att + def) * P.combat.coefDegats;
const avgGroup = (id: string) => Math.max(1, Math.round((SPECIES[id].groupe[0] + SPECIES[id].groupe[1]) / 2));

export function foeStrength(speciesId: string, n: number, teamDef = DEF_REF, legend = false): number {
  const sp = SPECIES[speciesId];
  let att = sp.attaque * (legend ? P.monde.legendeAttaque : 1);
  if (sp.special === 'meute') att *= 1 + 0.1 * Math.max(0, n - 2);
  let d = expDmg(att, teamDef) * n;
  if (sp.special === 'charge') d *= 1.15;
  let hp = sp.pv * n * (legend ? P.monde.legendePv : 1);
  if (sp.special === 'regeneration') hp *= 1.3;
  if (sp.special === 'couards') hp *= 0.6;
  return d * hp;
}

export function teamStrength(team: Adventurer[], speciesId: string, cohesion: number): number {
  const sp = SPECIES[speciesId];
  let dps = 0;
  let hp = 0;
  for (const m of team) {
    let def = sp.defense;
    if (sp.special === 'carapace' && m.classe !== 'mage') def *= 1.5;
    let mult = 1;
    if (sp.special === 'aerienne') mult = m.classe === 'rodeur' ? 1.5 : m.classe === 'mage' ? 1 : 0.7;
    if (sp.special === 'golem' && m.classe !== 'mage') mult = 0.5;
    if (sp.mortVivant && m.classe === 'clerc') mult = 2;
    dps += expDmg(attackOf(m), def) * mult;
    hp += m.hp + (m.classe === 'clerc' ? m.attrs.VOL * 3 : 0) + m.sac.potion * 40;
  }
  const moral = team.reduce((a, m) => a + m.morale + (m.buffs.includes('repu') ? 10 : 0), 0) / team.length;
  return dps * hp * (1 + cohesion / 100) * (moral >= 80 ? 1.1 : moral < 40 ? 0.9 : 1);
}

/** Espèce la plus menaçante couramment rencontrée dans une zone. */
function zoneThreat(s: GameState, zone: string): string | null {
  let worst: string | null = null;
  for (const id of Object.keys(ZONES[zone].especes)) {
    if (id === 'dragon' || id === 'golem' || popOf(s, zone, id) <= 0) continue;
    if (!worst || foeStrength(id, avgGroup(id)) > foeStrength(worst, avgGroup(worst))) worst = id;
  }
  return worst;
}

function reward(s: GameState, rang: Rang, type: QuestType): Money {
  return Math.round(P.quetes.baseParRang[rang] * MULT[type] * IP(s) * range(s, 'quetes', 0.8, 1.2) * diff(s).recompenses);
}

function client(s: GameState, type: ClientType): string {
  if (type === 'marchands') return `la caravane de Maître ${pick(s, 'noms', NAMES.prenoms)}`;
  if (type === 'temple') return chance(s, 'quetes', 0.5) ? 'le Temple de la Lumière' : 'Père Anselme, curé du Bourg';
  if (type === 'guilde') return 'la Guilde';
  return pick(s, 'quetes', NAMES.clients);
}

function base(s: GameState, type: QuestType, rang: Rang, zone: string, clientType: ClientType): Quest {
  return {
    id: s.nextId++, type, rang, zone, clientType, client: client(s, clientType), title: '',
    reward: 0, bonus: 0, minMembers: 1, maxMembers: 4, difficulty: 0, dangerEst: 0, foe: null, foeCount: 0, encounters: 1,
    createdTick: s.tick, expires: s.tick + 24 * randInt(s, 'quetes', P.quetes.expirationMin, P.quetes.expirationMax),
    reservedBy: null, teams: [],
  };
}

function finishDanger(s: GameState, q: Quest, foe: string | null, n: number, encounters: number, mult: number): Quest {
  q.foe = foe;
  q.foeCount = n;
  q.encounters = encounters;
  q.difficulty = foe ? foeStrength(foe, n) * (1 + 0.15 * (encounters - 1)) * mult : 0;
  const err = P.quetes.erreurDanger;
  const e = range(s, 'quetes', -err, err);
  q.dangerEst = q.difficulty * (1 + (onDuty(s, 'greffier') ? 0 : e));   // le greffier ne se trompe pas
  const ri = rangIndex(q.rang);
  q.minMembers = ri === 0 ? 1 : ri <= 2 ? 2 : ri <= 4 ? 3 : 4;
  q.maxMembers = ri === 0 ? 3 : ri === 1 ? 4 : 5;
  return q;
}

function pickZone(s: GameState, allowed?: string[]): string {
  const w: Record<string, number> = {};
  for (const z of allowed ?? ZONE_IDS) w[z] = ZONES[z].poidsQuetes;
  return weighted(s, 'quetes', w);
}

function pickSpecies(s: GameState, zone: string): string | null {
  const w: Record<string, number> = {};
  for (const [id, x] of Object.entries(ZONES[zone].especes)) {
    const p = popOf(s, zone, id);
    if (id !== 'dragon' && p > 0 && !huntClosed(s, zone, id)) w[id] = x * p;
  }
  return Object.keys(w).length ? weighted(s, 'quetes', w) : null;
}

export function makeChasse(s: GameState, zoneIn?: string, speciesIn?: string, countIn?: number, clientType: ClientType = 'villageois'): Quest | null {
  const zone = zoneIn ?? pickZone(s);
  const speciesId = speciesIn ?? pickSpecies(s, zone);
  if (!speciesId) return null;
  const sp = SPECIES[speciesId];
  const encounters = randInt(s, 'quetes', 1, 2);
  const avg = (sp.groupe[0] + sp.groupe[1]) / 2;
  const count = countIn ?? Math.max(1, Math.round(avg * encounters + randInt(s, 'quetes', -1, 1)));
  const q = base(s, 'chasse', sp.rang, zone, clientType);
  q.target = speciesId;
  q.count = count;
  q.title = zone === 'ville'
    ? `Nettoyer les égouts : ${count} ${count > 1 ? sp.pluriel : sp.nom.toLowerCase()}`
    : `Chasser ${count} ${count > 1 ? sp.pluriel : sp.nom.toLowerCase()} ${ZONES[zone].lieu}`;
  q.reward = Math.round(reward(s, sp.rang, 'chasse') * (0.8 + 0.2 * encounters));
  return finishDanger(s, q, speciesId, avgGroup(speciesId), encounters, 1);
}

export function makeExterminationFor(s: GameState, zone: string, speciesId: string, clientType: ClientType = 'villageois'): Quest {
  return makeExtermination(s, zone, speciesId, clientType);
}

/** Bête légendaire (5.4.3) : une chasse noble d'un seul monstre, PV ×5 et attaque ×2, avec un trophée. */
export function makeLegendQuest(s: GameState, zone: string, speciesId: string, name: string, expires: number): Quest {
  const sp = SPECIES[speciesId];
  const ri = Math.min(rangIndex(sp.rang) + 2, 5);
  const rang = (['F', 'E', 'D', 'C', 'B', 'A'] as Rang[])[ri];
  const q = base(s, 'chasse', rang, zone, 'nobles');
  q.client = pick(s, 'noms', NAMES.nobles as string[]);
  q.target = speciesId;
  q.count = 1;
  q.legend = name;
  q.title = `Abattre ${name} ${ZONES[zone].lieu}`;
  q.reward = Math.round(P.quetes.baseParRang[rang] * 1.5 * IP(s) * range(s, 'quetes', 0.9, 1.1));
  q.expires = expires;
  finishDanger(s, q, speciesId, 1, 1, 1);
  q.difficulty = foeStrength(speciesId, 1, DEF_REF, true);
  const e = range(s, 'quetes', -P.quetes.erreurDanger, P.quetes.erreurDanger);
  q.dangerEst = q.difficulty * (1 + (onDuty(s, 'greffier') ? 0 : e));
  q.minMembers = 3;
  q.maxMembers = 5;
  return q;
}

function makeExtermination(s: GameState, zone: string, speciesId: string, clientType: ClientType = 'villageois'): Quest {
  const sp = SPECIES[speciesId];
  const ri = clamp(rangIndex(sp.rang), 1, 4);
  const rang = (['F', 'E', 'D', 'C', 'B'] as Rang[])[ri];
  const q = base(s, 'extermination', rang, zone, clientType);
  q.target = speciesId;
  q.count = 0;
  q.perHead = Math.max(5, Math.round(P.quetes.baseParRang[rang] * P.quetes.extermination.parTete * IP(s) * range(s, 'quetes', 0.9, 1.3) * diff(s).recompenses));
  q.hours = randInt(s, 'quetes', P.quetes.extermination.dureeH[0], P.quetes.extermination.dureeH[1]);
  q.title = `Exterminer les ${sp.pluriel} ${ZONES[zone].lieu}`;
  q.expires = s.tick + 24 * 5;
  return finishDanger(s, q, speciesId, avgGroup(speciesId), 1, 1);
}

function makeCueillette(s: GameState, zoneIn?: string, plantIn?: string, countIn?: number, clientType: ClientType = 'villageois'): Quest | null {
  const zone = zoneIn ?? pickZone(s, ['ville', 'foret', 'collines', 'marais', 'ruines']);
  const w: Record<string, number> = {};
  for (const [id, x] of Object.entries(ZONES[zone].plantes)) if (popOf(s, zone, id) > 5) w[id] = x;
  if (!plantIn && Object.keys(w).length === 0) return null;
  const plant = plantIn ?? weighted(s, 'quetes', w);
  const rare = RESOURCES[plant].rare;
  const rang = ZONE_RANG[zone] === 'B' ? 'C' : ZONE_RANG[zone];
  const q = base(s, 'cueillette', rang, zone, clientType === 'villageois' && chance(s, 'quetes', 0.4) ? 'marchands' : clientType);
  q.target = plant;
  q.count = countIn ?? (rare ? randInt(s, 'quetes', 2, 5) : randInt(s, 'quetes', 5, 12));
  q.title = `Cueillir ${q.count} ${RESOURCES[plant].nom.toLowerCase()} ${ZONES[zone].lieu.replace('dans les égouts', 'aux alentours')}`;
  q.reward = reward(s, rang, 'cueillette');
  { const foe = zoneThreat(s, zone); return finishDanger(s, q, foe, foe ? avgGroup(foe) : 0, 1, 0.5); }
}

/** Escorte vers une ville voisine (v1.1) : plus longue, plus de rencontres, mieux payée. */
export function makeCityEscort(s: GameState, dest: string, clientType: ClientType = 'marchands'): Quest {
  const c = CITIES[dest];
  const q = base(s, 'escorte', c.rang, c.route, clientType);
  q.dest = dest;
  q.title = `Escorter un convoi jusqu'à ${c.nom}`;
  q.reward = Math.round(reward(s, c.rang, 'escorte') * P.villes.recompense);
  const foe = zoneThreat(s, c.route);
  return finishDanger(s, q, foe, foe ? avgGroup(foe) : 0, P.villes.rencontres, 1);
}

function makeEscorte(s: GameState): Quest {
  const open = CITY_IDS.filter((id) => routeOpen(s, id));
  if (open.length && chance(s, 'quetes', P.villes.partEscortes)) return makeCityEscort(s, pick(s, 'quetes', open));
  const zone = pickZone(s, ['collines', 'marais', 'ruines', 'pics']);
  const rang: Rang = zone === 'collines' ? 'E' : zone === 'marais' ? 'D' : zone === 'ruines' ? 'C' : 'B';
  const q = base(s, 'escorte', rang, zone, 'marchands');
  q.title = `Escorter un convoi jusqu'à ${ZONES[zone].village}`;
  q.reward = reward(s, rang, 'escorte');
  { const foe = zoneThreat(s, zone); return finishDanger(s, q, foe, foe ? avgGroup(foe) : 0, 2, 1); }
}

function makeExploration(s: GameState): Quest {
  const golems = popOf(s, 'ruines', 'golem') > 0 && chance(s, 'quetes', 0.2);
  const rang: Rang = golems ? 'A' : 'C';
  const q = base(s, 'exploration', rang, 'ruines', 'temple');
  q.rooms = randInt(s, 'quetes', P.quetes.explorationSalles[0], P.quetes.explorationSalles[1]);
  q.title = `Explorer ${q.rooms} salles des Ruines d'Ostral`;
  q.reward = reward(s, rang, 'exploration');
  return finishDanger(s, q, golems ? 'golem' : 'goule', golems ? 1 : avgGroup('goule'), 2, 1);
}

function makeProtection(s: GameState): Quest {
  const zone = pickZone(s, ['foret', 'collines', 'marais']);
  const rang: Rang = zone === 'marais' ? 'C' : 'D';
  const q = base(s, 'protection', rang, zone, 'villageois');
  q.nights = randInt(s, 'quetes', P.quetes.protectionNuits[0], P.quetes.protectionNuits[1]);
  q.title = `Défendre ${ZONES[zone].village} pendant ${q.nights} nuits`;
  q.reward = reward(s, rang, 'protection');
  { const foe = zoneThreat(s, zone); return finishDanger(s, q, foe, foe ? avgGroup(foe) + 1 : 0, 1, 1); }
}

function makeAide(s: GameState): Quest {
  const job = pick(s, 'quetes', NAMES.aides);
  const hours = randInt(s, 'quetes', 3, 8);
  const q = base(s, 'aide', 'F', 'ville', 'villageois');
  q.title = job.texte.charAt(0).toUpperCase() + job.texte.slice(1);
  q.attr = job.attribut as Quest['attr'];
  q.hours = hours;
  q.reward = Math.round(P.quetes.baseParRang.F * P.quetes.multAide * IP(s) * range(s, 'quetes', 0.8, 1.2) * (hours / 5.5) * diff(s).recompenses);
  q.maxMembers = 1;
  return q;
}

/** Affiches qui comptent dans la limite du tableau : ni les avis d'extermination, ni les primes de la guilde (4.3.4). */
export const boardQuests = (s: GameState) => s.board.filter((q) => q.type !== 'aide' && q.type !== 'extermination' && q.clientType !== 'guilde');
const countOf = (s: GameState, t: QuestType) => s.board.filter((q) => q.type === t).length;
function roll(s: GameState, expected: number): number {
  return Math.floor(expected) + (chance(s, 'quetes', expected % 1) ? 1 : 0);
}

/**
 * Portée de la guilde (ajout tranche 2) : le rang le plus haut que tiennent au moins
 * `portee.equipe` aventuriers, plus un. Le greffier écarte la plupart des quêtes au-delà,
 * et, une fois la guilde aguerrie, la plupart des quêtes trop modestes pour elle (ajusté en v1.1).
 */
export function guildReach(s: GameState): number {
  const ranks = s.adventurers.map((a) => rangIndex(a.rang)).sort((a, b) => b - a);
  const k = P.quetes.portee.equipe;
  return (ranks[Math.min(k, ranks.length) - 1] ?? 0) + 1;
}

function makeQuest(s: GameState, t: string): Quest | null {
  return t === 'cueillette' ? makeCueillette(s) : t === 'escorte' ? makeEscorte(s)
    : t === 'exploration' ? makeExploration(s) : t === 'protection' ? makeProtection(s) : makeChasse(s);
}

/** Chaque matin : quêtes du tableau, exterminations des espèces qui prolifèrent, petits boulots (4.3.2). */
export function generateQuests(s: GameState, firstDay = false): void {
  const q = P.quetes;
  const reach = guildReach(s);
  const n = roll(s, (q.chasseBase + q.chasseParProsperite * s.prosperity + q.chasseParAventurier * s.adventurers.length) * (firstDay ? 1.5 : 1) * questCountFactor(s));
  const mix = questMixWeights(s, q.melange as Record<string, number>);
  for (let i = 0; i < n && boardQuests(s).length < boardCapacity(s); i++) {
    // Le greffier retient surtout les quêtes à la portée de la guilde, quelques-unes au-delà.
    let quest: Quest | null = null;
    for (let tries = 0; tries < q.portee.essais && !quest; tries++) {
      const t = firstDay ? 'chasse' : weighted(s, 'quetes', mix);
      const cand = makeQuest(s, t);
      if (!cand) continue;
      const ri = rangIndex(cand.rang);
      if (ri > reach && !chance(s, 'quetes', onDuty(s, 'greffier') ? q.greffier.horsPortee : q.portee.horsPortee)) continue;
      if (reach - ri >= q.portee.ecartSous && !chance(s, 'quetes', q.portee.sousPortee)) continue;
      quest = cand;
    }
    if (quest) { decorateQuest(s, quest); s.board.push(quest); }
  }
  // v1.1 : l'herboriste de la ville commande toujours quelques cueillettes (au moins 2 au tableau).
  for (let tries = 0; tries < 6 && s.board.filter((x) => x.type === 'cueillette' && x.clientType !== 'guilde').length < q.cueilletteMin; tries++) {
    const c = makeCueillette(s);
    if (c) { c.client = c.client || "l'herboriste"; decorateQuest(s, c); s.board.push(c); }
  }
  // Une extermination par espèce qui prolifère (2.7)
  for (const z of ZONE_IDS) {
    for (const sp of Object.keys(ZONES[z].especes)) {
      if (sp === 'dragon' || popOf(s, z, sp) <= q.extermination.seuil) continue;
      if (s.board.some((x) => x.type === 'extermination' && x.zone === z && x.target === sp)) continue;
      const ex = makeExtermination(s, z, sp);
      decorateQuest(s, ex);
      s.board.push(ex);
    }
  }
  const nAide = roll(s, (q.aideBase + q.aideParProsperite * s.prosperity + q.aideParAventurier * s.adventurers.length) * (firstDay ? 1.5 : 1));
  for (let i = 0; i < nAide && countOf(s, 'aide') < q.aideMax; i++) s.board.push(makeAide(s));
}

export function expireQuests(s: GameState): void {
  const gone = s.board.filter((q) => q.reservedBy === null && q.teams.length === 0 && q.expires <= s.tick);
  if (!gone.length) return;
  s.board = s.board.filter((q) => !gone.includes(q));
  let refund = 0;
  for (const q of gone) { refund += q.bonus + (q.clientType === 'guilde' ? q.reward : 0); onQuestExpired(s, q); }
  if (refund > 0) {
    earn(s, 'primesRendues', refund);
    log(s, 'economie', 'info', `Primes non réclamées : ${money(refund)} reviennent dans les coffres.`);
  }
  log(s, 'quetes', 'detail', `${gone.length} quête${gone.length > 1 ? 's ont expiré' : ' a expiré'} sans preneur.`);
}

/** Danger affiché de 1 à 5 points (4.3.4). */
export function dangerDots(q: Quest): number {
  if (q.type === 'aide' || !q.foe) return q.type === 'aide' ? 0 : 1;
  const d = q.dangerEst;
  return d < 400 ? 1 : d < 1800 ? 2 : d < 5000 ? 3 : d < 15000 ? 4 : 5;
}

// ---------- Primes du joueur (4.4) ----------

export function activePrimes(s: GameState): number {
  // Les caravanes de la guilde ont leur propre limite (v1.1).
  const isPrime = (q: Quest) => !q.caravane && (q.clientType === 'guilde' || q.bonus > 0);
  return s.board.filter(isPrime).length + s.runs.filter((r) => isPrime(r.quest)).length;
}
export const maxPrimes = (s: GameState) => P.quetes.primesBase + s.rank;

export function createPrime(s: GameState, type: 'chasse' | 'extermination' | 'cueillette', zone: string, target: string, count: number, budget: Money, days: number): string | null {
  if (activePrimes(s) >= maxPrimes(s)) return `Pas plus de ${maxPrimes(s)} primes actives à la fois.`;
  if (budget < 50 || budget > s.treasury) return 'Montant invalide ou trésorerie insuffisante.';
  if (!ZONES[zone]) return 'Zone inconnue.';
  let q: Quest | null = null;
  if (type === 'cueillette') {
    if (!isPlant(target) || ZONES[zone].plantes[target] === undefined) return 'Cette plante ne pousse pas dans cette zone.';
    q = makeCueillette(s, zone, target, count, 'guilde');
  } else {
    if (ZONES[zone].especes[target] === undefined || target === 'dragon') return 'Cette espèce ne vit pas dans cette zone.';
    if (huntClosed(s, zone, target)) return `La chasse aux ${SPECIES[target].pluriel} est fermée ${ZONES[zone].lieu} : ils sont trop rares.`;
    if (type === 'chasse') q = makeChasse(s, zone, target, count, 'guilde');
    else {
      q = makeExtermination(s, zone, target, 'guilde');
      q.perHead = Math.max(5, Math.round(budget / Math.max(1, count)));
      q.count = 0;
      q.title = `Prime : ${count} ${SPECIES[target].pluriel} ${ZONES[zone].lieu}, ${money(q.perHead)} la tête`;
    }
  }
  if (!q) return 'Impossible de créer cette prime.';
  q.clientType = 'guilde';
  q.client = 'la Guilde';
  q.reward = type === 'extermination' ? budget : budget;
  q.expires = s.tick + 24 * clamp(days, 2, 14);
  spend(s, 'primes', budget);
  s.board.push(q);
  log(s, 'quetes', 'info', `La guilde publie une prime : « ${q.title} » (${money(budget)}).`);
  return null;
}

export function addBonus(s: GameState, questId: number, amount: Money): string | null {
  const q = s.board.find((x) => x.id === questId);
  if (!q || q.type === 'aide') return 'Quête introuvable.';
  if (q.bonus === 0 && q.clientType !== 'guilde' && activePrimes(s) >= maxPrimes(s)) return `Pas plus de ${maxPrimes(s)} primes actives à la fois.`;
  if (amount <= 0 || amount > s.treasury) return 'Montant invalide.';
  spend(s, 'primes', amount);
  q.bonus += amount;
  log(s, 'quetes', 'info', `La guilde ajoute ${money(amount)} à « ${q.title} ».`);
  return null;
}

// ---------- Choix d'une quête par une équipe (4.5) ----------

const isAvailable = (s: GameState, a: Adventurer) =>
  a.runId === null && a.job === null && a.status !== 'depart' && a.activity.kind !== 'quete'
  && a.activity.kind !== 'hospitalise' && canQuest(a) && a.mourningUntil <= s.tick;

const broke = (a: Adventurer) => a.gold < P.economie.coutVieJour * P.aventuriers.joursOrUrgence;

function threshold(a: Adventurer): number {
  if (broke(a)) return P.quetes.seuils.fauche;
  return P.quetes.seuils[profileOf(a)];
}

function perceivedChance(s: GameState, team: Adventurer[], q: Quest, leader: Adventurer, teamId: number | null): number {
  if (!q.foe || q.difficulty <= 0) return 1;
  const ours = teamStrength(team, q.foe, teamCohesion(s, team, teamId));
  const def = team.reduce((a, m) => a + defenseOf(m), 0) / team.length;
  // Le greffier se trompe parfois (±15 %), et chacun lit le danger selon son tempérament.
  const theirs = foeStrength(q.foe, q.foeCount, def) * (q.dangerEst / foeStrength(q.foe, q.foeCount));
  const R = ours / Math.max(1, theirs * P.quetes.biais[profileOf(leader)] * P.quetes.prudenceCombat);
  return R / (1 + R);
}

function acceptsQuest(s: GameState, a: Adventurer, q: Quest): boolean {
  // v1.1 : l'insigne fixe ce qu'un aventurier peut entreprendre, jusqu'à son rang + 1.
  // Une épreuve fait exception : le candidat la tente, ses compagnons le soutiennent.
  if (q.examFor === undefined && rangIndex(q.rang) > rangIndex(a.rang) + 1) return false;
  const gap = rangIndex(a.rang) - rangIndex(q.rang);
  if (a.fierte >= 60 && gap >= 2 && !broke(a)) return false;
  if (hasTrait(a, 'superstitieux') && q.zone === 'ruines') return false;
  void s;
  return true;
}

function compat(s: GameState, team: Adventurer[], c: Adventurer): number {
  const roles = team.map((m) => CLASSES[m.classe].role);
  let score = 0;
  const role = CLASSES[c.classe].role;
  if (role === 'tank' && !roles.includes('tank')) score += 30;
  if (role === 'soin' && !roles.includes('soin')) score += 30;
  score -= 10 * Math.max(0, Math.abs(c.level - team[0].level) - 3);
  for (const m of team) score += rel(s, m.id, c.id) / 2;
  return score + c.level;
}

function expectedLoot(q: Quest): Money {
  if (!q.target || q.type === 'cueillette') return q.target ? (q.count ?? 0) * RESOURCES[q.target].prix : 0;
  const sp = SPECIES[q.target];
  const n = q.type === 'extermination' ? (sp.groupe[0] + sp.groupe[1]) : (q.count ?? 0);
  return Math.round(n * sp.butin.reduce((a, r) => a + RESOURCES[r].prix, 0) * 0.7);
}

function durationDays(q: Quest): number {
  const travel = (2 * questTrajet(q)) / 24;
  if (q.type === 'protection') return travel + (q.nights ?? 3);
  if (q.type === 'extermination') return travel + (q.hours ?? 48) / 24;
  if (q.type === 'exploration') return travel + ((q.rooms ?? 4) * 2) / 24 + 0.5;
  return Math.max(0.5, travel + 0.5);
}

function questValue(q: Quest): Money {
  if (q.type === 'extermination') {
    const sp = SPECIES[q.target!];
    return (q.perHead ?? 0) * (sp.groupe[0] + sp.groupe[1]) + q.bonus;
  }
  return q.reward + q.bonus;
}

function canTake(q: Quest): boolean {
  if (q.type === 'aide') return false;
  if (q.type === 'extermination') return q.teams.length < P.quetes.extermination.equipesMax;
  return q.reservedBy === null;
}

function bestQuestFor(s: GameState, core: Adventurer[], pool: Adventurer[], teamId: number | null, fixed: boolean, contested: Quest[] = []):
  { q: Quest; team: Adventurer[]; attrait: number } | null {
  const leader = core[0];
  let best: { q: Quest; team: Adventurer[]; attrait: number } | null = null;
  for (const q of [...s.board.filter(canTake), ...contested]) {
    // Une épreuve de rang n'est tentée que par son candidat (et ses compagnons).
    if (q.examFor !== undefined && !core.some((m) => m.id === q.examFor)) continue;
    if (!core.every((m) => acceptsQuest(s, m, q))) continue;
    const maxSize = hasTrait(leader, 'solitaire') && !fixed ? Math.min(2, q.maxMembers) : q.maxMembers;
    if (core.length > maxSize) continue;
    const team = [...core];
    const need = threshold(leader);
    const cands = pool.filter((c) => !team.includes(c) && acceptsQuest(s, c, q) && team.every((m) => rel(s, m.id, c.id) > P.social.rivalSeuil))
      .sort((x, y) => compat(s, team, y) - compat(s, team, x));
    while (team.length < maxSize && (team.length < q.minMembers || perceivedChance(s, team, q, leader, teamId) < need)) {
      const next = cands.find((c) => !team.includes(c) && perceivedChance(s, [...team, c], q, c, teamId) >= threshold(c) * 0.9);
      if (!next) break;
      team.push(next);
    }
    if (team.length < q.minMembers || perceivedChance(s, team, q, leader, teamId) < need) continue;
    let attrait = (questValue(q) / team.length + (0.5 * expectedLoot(q)) / team.length) / durationDays(q);
    if ((q.clientType === 'guilde' || q.bonus > 0) && leader.loyalty >= 60) attrait *= 1 + P.quetes.bonusLoyaute;
    // Ajusté en v1.1 : on cherche les défis de son rang (prestige, expérience), pas seulement l'or à la journée.
    const gap = rangIndex(q.rang) - rangIndex(leader.rang);
    const ar = P.quetes.attraitRang;
    attrait *= gap >= 1 ? ar.dessus : gap === 0 ? ar.egal : gap === -1 ? ar.dessous1 : ar.dessous2;
    if (q.examFor !== undefined) attrait = Number.MAX_SAFE_INTEGER;   // son épreuve passe avant tout
    if (!best || attrait > best.attrait) best = { q, team, attrait };
  }
  return best;
}

// ---------- Quête convoitée (v1.1, D-155) ----------

export const ATTRIBUTION_NAMES: Record<Attribution, string> = {
  adapte: "l'équipe la mieux armée pour la réussir",
  loyal: "l'équipe la plus loyale envers la guilde",
  respect: "l'équipe du chef le plus respecté",
  jeunes: "l'équipe la moins gradée, pour la faire progresser",
};

/** Note d'une équipe selon la règle d'attribution choisie par le joueur : la plus haute l'emporte. */
function attributionScore(s: GameState, team: Adventurer[], q: Quest, teamId: number | null): number {
  const rule = s.policy.attribution ?? 'adapte';
  const avg = (f: (a: Adventurer) => number) => team.reduce((x, a) => x + f(a), 0) / team.length;
  if (rule === 'loyal') return avg((a) => a.loyalty);
  if (rule === 'respect') return team[0].respect;
  if (rule === 'jeunes') return -avg((a) => rangIndex(a.rang) * 100 + a.level);
  return perceivedChance(s, team, q, team[0], teamId);
}

/** Deux groupes veulent la même quête ce soir : ils partent ensemble s'ils s'entendent et qu'il reste de la place, sinon la règle tranche. */
function contest(s: GameState, run: QuestRun, team: Adventurer[], teamId: number | null): { merged: boolean; won: boolean; loser: Adventurer[] } {
  const q = run.quest;
  const holders = runMembers(s, run);
  // « La Compagnie du Sanglier », ou « Osric, Clothilde et Perceval »
  const who = (t: Adventurer[], id: number | null) => {
    const name = teamOf(s, id)?.name;
    if (name) return name;
    const l = t.map(advLink);
    return l.length > 1 ? `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}` : l[0];
  };
  const plural = (t: Adventurer[], id: number | null) => !teamOf(s, id) && t.length > 1;
  const toWho = (x: string) => (x.startsWith('Les ') ? `aux ${x.slice(4)}` : x.startsWith('Le ') ? `au ${x.slice(3)}` : `à ${x}`);
  const getAlong = holders.every((h) => team.every((m) => rel(s, h.id, m.id) > P.social.rivalSeuil));
  if (getAlong && holders.length + team.length <= q.maxMembers && team.every((m) => acceptsQuest(s, m, q))) {
    for (const m of team) { run.members.push(m.id); m.runId = run.id; m.lookingForQuest = false; }
    log(s, 'quetes', 'info', `« ${q.title} » : ${who(team, teamId)} ${plural(team, teamId) ? 'rejoignent' : 'rejoint'} ${who(holders, run.teamId)}, et tout le monde part ensemble.`);
    think(s, team[0], `On était plusieurs sur « ${q.title} » : on y va ensemble.`);
    return { merged: true, won: true, loser: [] };
  }
  const mine = attributionScore(s, team, q, teamId);
  const theirs = attributionScore(s, holders, q, run.teamId);
  const rule = ATTRIBUTION_NAMES[s.policy.attribution ?? 'adapte'];
  if (mine > theirs) {
    // Le nouveau groupe l'emporte : l'ancien renonce et cherchera autre chose.
    s.runs = s.runs.filter((r) => r !== run);
    q.reservedBy = null;
    for (const h of holders) { h.runId = null; h.lookingForQuest = true; }
    log(s, 'quetes', 'info', `« ${q.title} » était voulue par ${who(holders, run.teamId)} et par ${who(team, teamId)} : la guilde la confie ${toWho(who(team, teamId))} (règle : ${rule}).`);
    think(s, holders[0], `La guilde a donné « ${q.title} » à d'autres. Tant pis, je chercherai autre chose.`);
    return { merged: false, won: true, loser: holders };
  }
  log(s, 'quetes', 'info', `« ${q.title} » était voulue par ${who(holders, run.teamId)} et par ${who(team, teamId)} : la guilde la laisse ${toWho(who(holders, run.teamId))} (règle : ${rule}).`);
  think(s, team[0], `« ${q.title} » est allée à d'autres. Je me rabats sur autre chose.`);
  return { merged: false, won: false, loser: team };
}

/** Chaque soir, les équipes durables puis les aventuriers isolés choisissent une quête (3.11.3, 4.5). */
export function formTeams(s: GameState): void {
  const pool = s.adventurers
    .filter((a) => a.lookingForQuest && isAvailable(s, a))
    .sort((a, b) => b.respect - a.respect || b.level - a.level || a.id - b.id);
  const take = (team: Adventurer[]) => { for (const m of team) { const i = pool.indexOf(m); if (i >= 0) pool.splice(i, 1); } };
  // Quêtes réservées ce soir, qu'un autre groupe peut encore disputer (une seule dispute par quête).
  const tonight = new Map<number, QuestRun>();
  const settled = new Set<number>();
  const contestable = () => [...tonight.entries()].filter(([id, r]) => !settled.has(id) && s.runs.includes(r) && r.quest.type !== 'extermination' && r.quest.examFor === undefined).map(([, r]) => r.quest);
  const refused = new Map<number, Set<number>>();   // quêtes qu'un aventurier s'est vu refuser ce soir
  const go = (best: { q: Quest; team: Adventurer[] }, teamId: number | null) => {
    const held = tonight.get(best.q.id);
    if (held && s.runs.includes(held) && held.quest === best.q) {
      settled.add(best.q.id);
      const res = contest(s, held, best.team, teamId);
      take(best.team);
      if (!res.merged && res.won) { startRun(s, best.q, best.team, teamId); tonight.set(best.q.id, s.runs[s.runs.length - 1]); }
      for (const m of res.loser) {
        (refused.get(m.id) ?? refused.set(m.id, new Set()).get(m.id)!).add(best.q.id);
        if (!pool.includes(m)) pool.push(m);
      }
      pool.sort((a, b) => b.respect - a.respect || b.level - a.level || a.id - b.id);
      return;
    }
    take(best.team);
    startRun(s, best.q, best.team, teamId);
    tonight.set(best.q.id, s.runs[s.runs.length - 1]);
  };
  const open = (core: Adventurer[]) => contestable().filter((q) => !core.some((m) => refused.get(m.id)?.has(q.id)));

  // 1. Les équipes durables partent ensemble
  for (const t of [...s.teams].sort((a, b) => b.questsOk - a.questsOk)) {
    const core = pool.filter((a) => a.teamId === t.id);
    if (core.length < 2) continue;
    const best = bestQuestFor(s, core, pool.filter((a) => a.teamId === null), t.id, true, open(core));
    if (!best) continue;
    go(best, t.id);
  }
  // 2. Les autres se regroupent autour du plus respecté
  let guard = 0;
  while (pool.length > 0 && guard++ < 500) {
    const leader = pool.shift()!;
    const best = bestQuestFor(s, [leader], pool, null, false, open([leader]));
    if (!best) {
      if (s.board.some(canTake)) think(s, leader, 'Rien au tableau qui soit à ma portée ce soir.');
      continue;
    }
    go(best, null);
  }
}

function startRun(s: GameState, q: Quest, team: Adventurer[], teamId: number | null): void {
  const day = Math.floor(s.tick / 24);
  const run: QuestRun = {
    id: s.nextId++, quest: q, members: team.map((m) => m.id), leader: team[0].id, teamId,
    stage: 'preparation', departTick: (day + 1) * 24 + P.quetes.heureDepart, stageHours: 0, travelSinceEncounter: 0,
    kills: 0, gathered: 0, roomsDone: 0, nightsDone: 0, convoyHp: P.quetes.convoiPv, losses: 0,
    objectiveHours: q.hours ?? 0, combats: 0, gold: 0, loot: [], outcome: null, log: [], startedTick: s.tick, saved: [],
  };
  if (q.type === 'extermination') q.teams.push(run.id);
  else q.reservedBy = run.id;
  s.runs.push(run);
  for (const m of team) { m.runId = run.id; m.lookingForQuest = false; }
  const t = teamOf(s, teamId);
  const who = t ? t.name : team.map(advLink).join(', ');
  const plural = !t && team.length > 1;
  log(s, 'quetes', 'info', `${who} ${plural ? 'réservent' : 'réserve'} « ${q.title} »${q.type === 'extermination' ? '' : ` (${money(questValue(q))})`}. Départ demain matin.`);
  think(s, team[0], team.length > 1 ? `On part demain pour « ${q.title} ». J'ai confiance en mon équipe.` : `Je pars seul demain : « ${q.title} ».`);
}

// ---------- Déroulement (4.6) ----------

export function runMembers(s: GameState, run: QuestRun): Adventurer[] {
  return run.members.map((id) => s.adventurers.find((a) => a.id === id)).filter((a): a is Adventurer => !!a);
}

export function teamLabel(s: GameState, run: QuestRun): string {
  const t = teamOf(s, run.teamId);
  if (t) return t.name;
  const team = runMembers(s, run);
  const leader = team.find((m) => m.id === run.leader) ?? team[0];
  if (!leader) return "L'équipe";
  return team.length > 1 ? `L'équipe de ${advLink(leader)}` : advLink(leader);
}

export function runLog(s: GameState, run: QuestRun, text: string, lvl: 'info' | 'important' | 'detail' = 'detail'): void {
  run.log.push({ tick: s.tick, text });
  log(s, 'quetes', lvl, text);
}

function travelHours(s: GameState, run: QuestRun, team: Adventurer[]): number {
  const survie = team.reduce((a, m) => a + skill(m, 'survie'), 0) / Math.max(1, team.length);
  const slow = run.quest.type === 'escorte' && run.stage !== 'retour' ? 1.5 : 1;
  const meteo = modMult(s, 'trajet') * modMult(s, `trajet:${run.quest.zone}`);
  return Math.max(1, Math.round(questTrajet(run.quest) * Math.max(0.6, 1 - survie / 50) * slow * meteo));
}

function trackingHours(s: GameState, run: QuestRun, team: Adventurer[]): number {
  const baseH = run.quest.zone === 'ville' ? P.quetes.pistageVille : P.quetes.pistageForet;
  const pist = team.reduce((mx, m) => Math.max(mx, skill(m, 'pistage')), 0);
  // Épreuve de rang (v1.1) : la guilde a repéré les bêtes à l'avance, la rareté de l'espèce ne joue pas.
  const pop = run.quest.examFor !== undefined ? P.quetes.populationNormale : Math.max(5, popOf(s, run.quest.zone, run.quest.target ?? ''));
  return Math.max(1, Math.round(baseH * (1 - pist / 40) * (P.quetes.populationNormale / pop)));
}

const VENOMOUS = new Set(['foret', 'marais', 'ruines', 'pics']);

function depart(s: GameState, run: QuestRun): void {
  let team = runMembers(s, run).filter((m) => canQuest(m) && m.status !== 'depart' && m.activity.kind !== 'hospitalise');
  run.members = team.map((m) => m.id);
  for (const a of s.adventurers) if (a.runId === run.id && !run.members.includes(a.id)) a.runId = null;
  const q = run.quest;
  if (team.length < q.minMembers) {
    for (const m of team) m.runId = null;
    if (q.type === 'extermination') q.teams = q.teams.filter((id) => id !== run.id);
    else q.reservedBy = null;
    s.runs = s.runs.filter((r) => r !== run);
    log(s, 'quetes', 'info', `L'équipe prévue pour « ${q.title} » renonce : il manque du monde.`);
    return;
  }
  const far = ZONES[q.zone].trajet > 1;
  const nights = Math.ceil(durationDays(q));
  const want = Math.min(2, nights);
  let townBought = 0;
  for (const m of team) {
    stockUp(s, m, VENOMOUS.has(q.zone));
    while (far && m.sac.panier < want && sacCount(m) < 4 && dishServable(s, 'panier')) {
      const price = dishPrice(s, 'panier');
      const { verdict, R } = judge(m, price, dishRef(s, 'panier'));
      if (verdict === 'refus' || m.gold < price + P.economie.coutVieJour) break;
      m.gold -= price; flow('paniers', -(price));
      earn(s, 'paniers', price);
      consumeDish(s, 'panier');
      applyPurchase(s, m, R);
      m.sac.panier += 1;
    }
    // Repli (ajout tranche 2) : sans panier à la guilde, des provisions plus chères à l'échoppe de la ville.
    const townPrice = Math.round(DISHES.panier.prix * IP(s) * P.quetes.provisionsVille);
    while (far && m.sac.panier < want && sacCount(m) < 4 && !dishServable(s, 'panier') && m.gold >= townPrice + P.economie.coutVieJour) {
      m.gold -= townPrice; flow('provisionsVille', -townPrice); townSpend(s, townPrice);
      m.sac.panier += 1;
      townBought += 1;
    }
    m.activity = { kind: 'quete', until: FAR_FUTURE, place: 'quete' };
  }
  if (townBought > 0) log(s, 'economie', 'detail', `Faute de paniers de route au réfectoire, ${teamLabel(s, run)} achète ${townBought} provisions à l'échoppe de la ville (${money(townBought * Math.round(DISHES.panier.prix * IP(s) * P.quetes.provisionsVille))}).`);
  team = runMembers(s, run);
  run.stage = 'aller';
  run.stageHours = travelHours(s, run, team);
  runLog(s, run, `${teamLabel(s, run)} part pour « ${q.title} ».`, 'info');
}

function enforceCapacity(run: QuestRun, team: Adventurer[]): void {
  const cap = team.reduce((a, m) => a + capacityOf(m) - sacCount(m), 0);
  const weight = () => run.loot.reduce((a, l) => a + l.qty * RESOURCES[l.res].poids, 0);
  while (weight() > cap && run.loot.length > 0) {
    const worst = run.loot.reduce((lo, l) =>
      RESOURCES[l.res].prix / RESOURCES[l.res].poids < RESOURCES[lo.res].prix / RESOURCES[lo.res].poids ? l : lo);
    worst.qty -= 1;
    if (worst.qty <= 0) run.loot.splice(run.loot.indexOf(worst), 1);
  }
}

function abort(s: GameState, run: QuestRun, reason: string): void {
  if (run.stage === 'retour') return;
  run.outcome = run.quest.type === 'extermination' && run.kills > 0 ? 'succes' : 'echec';
  run.stage = 'retour';
  run.stageHours = travelHours(s, run, runMembers(s, run));
  runLog(s, run, `${teamLabel(s, run)} rebrousse chemin : ${reason}.`, 'info');
}

/** Après un combat : bandages et antidotes du sac (1.8.2). */
function patchUp(team: Adventurer[]): void {
  for (const m of team) {
    const plaie = m.states.find((x) => x.etat === 'plaie' && x.gravite === 0 && !x.bandaged);
    if (plaie && m.sac.bandages > 0) { m.sac.bandages -= 1; plaie.bandaged = true; }
    const poison = m.states.find((x) => x.etat === 'poison' && x.gravite <= 1);
    if (poison && m.sac.antidote > 0) { m.sac.antidote -= 1; m.states = m.states.filter((x) => x !== poison); }
  }
}

function doFight(s: GameState, run: QuestRun, speciesId: string, size: number, encounter: boolean): CombatResult {
  const team = runMembers(s, run);
  const leader = team.find((m) => m.id === run.leader) ?? team[0];
  const legend = !!run.quest.legend && speciesId === run.quest.target && !encounter;
  const res = fight(s, team, speciesId, legend ? 1 : size, leader, teamCohesion(s, team, run.teamId), { legend });
  handleCombat(s, run, res, speciesId, encounter);
  return res;
}

function handleCombat(s: GameState, run: QuestRun, res: CombatResult, speciesId: string, encounter: boolean): void {
  const sp = SPECIES[speciesId];
  const label = teamLabel(s, run);
  const lieu = ZONES[run.quest.zone].lieu;
  const verb = res.outcome === 'victoire' ? `victoire en ${res.rounds} round${res.rounds > 1 ? 's' : ''}`
    : res.outcome === 'retraite' ? 'retraite' : 'déroute';
  const n = res.killed;
  run.combats += 1;
  runLog(s, run, `${label} ${encounter ? 'tombe sur' : 'affronte'} des ${sp.pluriel} ${lieu} : ${verb}${n ? `, ${n} abattu${n > 1 ? 's' : ''}` : ''}.`, 'info');

  for (const lot of res.loot) addLot(run.loot, lot);
  run.gold += res.gold;
  if (n > 0) onKill(s, sp.rang);
  if (speciesId === run.quest.target) run.kills += n;
  killed(s, run.quest.zone, speciesId, n);
  const team = runMembers(s, run);
  for (const m of team) m.history.kills += n;
  for (const [a, b] of res.saved) {
    const x = team.find((m) => m.id === a);
    const y = team.find((m) => m.id === b);
    if (x && y) onSaved(s, x, y);
  }
  for (const d of res.dead) {
    run.members = run.members.filter((id) => id !== d.id);
    killAdventurer(s, d, `face à des ${sp.pluriel}, ${lieu}`);
  }
  for (const c of res.critical) runLog(s, run, `${advLink(c)} est tombé au combat. Ses compagnons le ramènent, gravement blessé.`, 'important');
  patchUp(runMembers(s, run));
  enforceCapacity(run, runMembers(s, run));
  if (res.outcome === 'defaite') abort(s, run, 'toute l\'équipe est à terre');
  else if (res.critical.length > 0) abort(s, run, 'un blessé grave à ramener');
  else if (res.outcome === 'retraite' && run.stage !== 'retour') abort(s, run, `les ${sp.pluriel} étaient trop forts`);
}

function encounterCheck(s: GameState, run: QuestRun, team: Adventurer[]): void {
  run.travelSinceEncounter += 1;
  if (run.travelSinceEncounter < P.quetes.intervalleRencontreH) return;
  run.travelSinceEncounter = 0;
  const zone = run.quest.zone;
  const escort = run.quest.type === 'escorte' && run.stage !== 'retour';
  if (!chance(s, 'quetes', (zoneDanger(s, zone) / 200) * (escort ? 2 : 1))) return;
  const speciesId = pickSpecies(s, zone);
  if (!speciesId) return;
  const disc = team.reduce((mx, m) => Math.max(mx, skill(m, 'discretion')), 0);
  if (!escort && chance(s, 'quetes', disc * 0.03)) {
    runLog(s, run, `${teamLabel(s, run)} évite discrètement des ${SPECIES[speciesId].pluriel}.`);
    for (const m of team) practice(s, m, 'discretion', 'quetes');
    return;
  }
  const sp = SPECIES[speciesId];
  const size = randInt(s, 'quetes', sp.groupe[0], sp.groupe[1]);
  const res = doFight(s, run, speciesId, size, true);
  if (escort) {
    run.convoyHp -= Math.round(10 * (size - res.killed) + (res.outcome === 'victoire' ? 0 : 40));
    if (run.convoyHp <= 0 && run.stage !== 'retour') {
      runLog(s, run, `Le convoi est perdu.`, 'important');
      abort(s, run, 'le convoi a été détruit');
    }
  }
}

/** Au camp, sans panier : on fait rôtir une part du gibier rapporté (ajout tranche 2). */
function eatGame(run: QuestRun): boolean {
  const lot = run.loot.find((l) => l.qty > 0 && RESOURCES[l.res].categorie === 'viande');
  if (!lot) return false;
  lot.qty -= 1;
  if (lot.qty <= 0) run.loot.splice(run.loot.indexOf(lot), 1);
  return true;
}

function camp(s: GameState, run: QuestRun, team: Adventurer[], village: boolean): void {
  let hungry = 0;
  for (const m of team) {
    m.energy = clamp(m.energy + (village ? 60 : 50 + 2 * skill(m, 'survie')), 0, 100);
    if (village) m.hunger = clamp(m.hunger + 50, 0, 100);
    else if (m.sac.panier > 0) { m.sac.panier -= 1; m.hunger = clamp(m.hunger + 60, 0, 100); }
    else if (eatGame(run)) m.hunger = clamp(m.hunger + 50, 0, 100);
    else if (chance(s, 'quetes', 0.3 + 0.03 * skill(m, 'survie'))) m.hunger = clamp(m.hunger + 40, 0, 100);
    else { m.morale = clamp(m.morale - 3, 0, 100); hungry += 1; }
    if (!village) practice(s, m, 'survie', 'quetes');
  }
  if (!village) runLog(s, run, `${teamLabel(s, run)} campe pour la nuit${hungry ? `, ${hungry} le ventre vide` : ''}.`);
}

function exploreRoom(s: GameState, run: QuestRun, team: Adventurer[]): void {
  const roll = range(s, 'quetes', 0, 1);
  const best = (k: Parameters<typeof skill>[1]) => team.reduce((mx, m) => Math.max(mx, skill(m, k)), 0);
  if (roll < 0.3) {
    if (chance(s, 'quetes', 0.4 + 0.04 * Math.max(best('discretion'), best('savoir')))) {
      runLog(s, run, `${teamLabel(s, run)} déjoue un piège.`);
    } else {
      const v = pick(s, 'quetes', team);
      v.hp = Math.max(1, v.hp - v.hp * 0.15);
      addAilment(s, v, pick(s, 'quetes', ['plaie', 'fracture', 'brulure'] as const), randInt(s, 'quetes', 0, 1));
      runLog(s, run, `${advLink(v)} est pris dans un piège.`, 'info');
    }
  } else if (roll < 0.65) {
    const sp = pickSpecies(s, run.quest.zone) ?? 'goule';
    const spx = run.quest.rang === 'A' ? sp : sp === 'golem' ? 'goule' : sp;
    doFight(s, run, spx, randInt(s, 'quetes', SPECIES[spx].groupe[0], SPECIES[spx].groupe[1]), false);
  } else if (roll < 0.9) {
    if (chance(s, 'quetes', 0.3 + 0.04 * best('fouille'))) {
      const g = randInt(s, 'quetes', 20, 80) * (run.quest.rang === 'A' ? 6 : 3);
      run.gold += g;
      let found = '';
      if (chance(s, 'quetes', 0.25 + 0.02 * best('savoir'))) {
        addLot(run.loot, { res: 'objet_ancien', qty: 1, quality: 'intacte', fresh: 1 });
        found = ' et un objet ancien';
        if (best('savoir') < 5 && chance(s, 'quetes', 0.2)) {
          const v = pick(s, 'quetes', team);
          addAilment(s, v, 'malediction', 0);
          found += ' (maudit !)';
        }
      }
      runLog(s, run, `${teamLabel(s, run)} découvre un trésor : ${money(g)}${found}.`, 'info');
    } else runLog(s, run, `${teamLabel(s, run)} fouille une salle vide.`);
  } else {
    const vol = team.reduce((a, m) => a + m.attrs.VOL, 0) / team.length;
    if (!chance(s, 'quetes', 0.4 + 0.03 * best('exorcisme') + vol / 100)) {
      const v = pick(s, 'quetes', team);
      addAilment(s, v, 'malediction', 0);
      runLog(s, run, `Une malédiction frappe ${advLink(v)}.`, 'important');
    }
  }
}

/**
 * Une quête en cours et son affiche doivent être le même objet. Après un chargement (JSON),
 * ce sont deux copies : on les relie avant toute modification.
 */
export function relinkRuns(s: GameState): void {
  for (const run of s.runs) {
    const b = s.board.find((x) => x.id === run.quest.id);
    if (b && b !== run.quest) run.quest = b;
  }
}

export function stepRuns(s: GameState): void {
  relinkRuns(s);
  for (const run of [...s.runs]) stepRun(s, run);
}

function succeed(s: GameState, run: QuestRun, text: string): void {
  run.outcome = 'succes';
  run.stage = 'retour';
  run.stageHours = travelHours(s, run, runMembers(s, run));
  runLog(s, run, text);
}

function stepRun(s: GameState, run: QuestRun): void {
  if (run.stage === 'preparation') {
    if (s.tick >= run.departTick) depart(s, run);
    return;
  }
  const team = runMembers(s, run);
  if (team.length === 0) {
    s.runs = s.runs.filter((r) => r !== run);
    const q = run.quest;
    onCaravanLost(s, q);
    if (q.type === 'extermination') q.teams = q.teams.filter((id) => id !== run.id);
    s.board = s.board.filter((x) => x.id !== q.id || (x.type === 'extermination' && x.teams.length > 0));
    return;
  }
  const q = run.quest;
  const h = hourOf(s.tick);
  const far = ZONES[q.zone].trajet > 1;
  const night = far && (h >= 22 || h < 6);
  const inVillage = q.type === 'protection' && run.stage === 'objectif';
  const vigueur = (m: Adventurer) => (m.buffs.includes('vigueur') || m.buffs.includes('legendaire') ? 0.9 : 1);

  for (const m of team) {
    m.hunger = clamp(m.hunger - (night ? P.aventuriers.faimSommeilH : P.aventuriers.faimEveilleH), 0, 100);
    if (!night) m.energy = clamp(m.energy - P.aventuriers.energieEveilleH * vigueur(m), 0, 100);
    m.hp = Math.min(pvMax(m), m.hp + pvMax(m) * (night ? 0.02 : 0.005));
  }
  if (night) {
    if (h === 22) camp(s, run, team, inVillage);
    if (inVillage && h === 23) {
      // Vague d'attaque nocturne (4.6.2)
      if (chance(s, 'quetes', P.quetes.vagueChance)) {
        const sp = pickSpecies(s, q.zone);
        if (sp) {
          const res = doFight(s, run, sp, randInt(s, 'quetes', SPECIES[sp].groupe[0], SPECIES[sp].groupe[1]) + 1, false);
          if (res.outcome !== 'victoire') { run.losses += 1; runLog(s, run, `Le village subit des pertes.`, 'info'); }
        }
      }
    }
    if (inVillage && h === 5 && run.stage === 'objectif') {
      run.nightsDone += 1;
      if (run.nightsDone >= (q.nights ?? 1)) succeed(s, run, `${teamLabel(s, run)} a tenu ${q.nights} nuits et rentre.`);
    }
    return;
  }

  if (run.stage === 'aller' || run.stage === 'retour') {
    run.stageHours -= 1;
    encounterCheck(s, run, runMembers(s, run));
    if (!s.runs.includes(run) || runMembers(s, run).length === 0) return;
    if (run.stageHours <= 0) {
      if (run.stage === 'retour') {
        // Objectif atteint malgré tout (gibier croisé sur le chemin du retour) : le contrat est rempli.
        const done = (q.type === 'chasse' && run.kills >= (q.count ?? 1)) || (q.type === 'cueillette' && run.gathered >= (q.count ?? 1));
        if (run.outcome !== 'succes' && done) run.outcome = 'succes';
        processReturn(s, run);
        return;
      }
      run.stage = 'objectif';
      if (q.type === 'escorte') { succeed(s, run, `${teamLabel(s, run)} livre le convoi à ${q.dest ? CITIES[q.dest].nom : ZONES[q.zone].village}.`); return; }
      run.stageHours = q.type === 'exploration' || q.type === 'cueillette' ? 2 : q.type === 'protection' ? 1 : trackingHours(s, run, runMembers(s, run));
    }
  } else if (run.stage === 'objectif') {
    run.stageHours -= 1;
    if (q.type === 'extermination') run.objectiveHours -= 1;
    const members = runMembers(s, run);
    if (q.type === 'cueillette') {
      encounterCheck(s, run, members);
      if (run.stage !== 'objectif') return;
      if (run.stageHours <= 0) {
        const sv = members.reduce((mx, m) => Math.max(mx, skill(m, 'survie')), 0);
        const n = Math.max(0, Math.round((1 + sv / 5) * (popOf(s, q.zone, q.target!) / 50)));
        const got = Math.min(n, (q.count ?? 0) - run.gathered);
        if (got > 0) {
          run.gathered += got;
          addLot(run.loot, { res: q.target!, qty: got, quality: 'intacte', fresh: 1 });
          harvested(s, q.zone, q.target!, got);
          for (const m of members) practice(s, m, 'survie', 'quetes');
        }
        run.stageHours = 2;
        enforceCapacity(run, members);
        if (run.gathered >= (q.count ?? 0)) succeed(s, run, `${teamLabel(s, run)} a cueilli tout ce qu'il fallait.`);
      }
    } else if (q.type === 'exploration') {
      if (run.stageHours <= 0) {
        exploreRoom(s, run, members);
        if (run.stage !== 'objectif') return;
        run.roomsDone += 1;
        run.stageHours = 2;
        if (run.roomsDone >= (q.rooms ?? 3)) succeed(s, run, `${teamLabel(s, run)} a exploré toutes les salles.`);
      }
    } else if (q.type === 'protection') {
      // Le jour, l'équipe se repose au village en attendant la nuit.
      for (const m of members) { m.hunger = Math.max(m.hunger, 40); m.energy = clamp(m.energy + 2, 0, 100); }
    } else if (run.stageHours <= 0) {
      const sp = SPECIES[q.target!];
      const remaining = q.type === 'chasse' ? (q.count ?? 1) - run.kills : sp.groupe[1];
      const size = Math.min(Math.max(1, remaining), randInt(s, 'quetes', sp.groupe[0], sp.groupe[1]));
      for (const m of members) practice(s, m, 'pistage', 'quetes');
      doFight(s, run, q.target!, size, false);
      if (run.stage === 'objectif') {
        if (q.type === 'chasse' && run.kills >= (q.count ?? 1)) succeed(s, run, `${teamLabel(s, run)} a rempli son contrat et rentre.`);
        else if (q.type === 'extermination' && (run.objectiveHours <= 0 || (q.clientType === 'guilde' && run.kills * (q.perHead ?? 0) >= q.reward))) {
          succeed(s, run, `${teamLabel(s, run)} a fait le ménage : ${run.kills} ${sp.pluriel} abattus.`);
        } else run.stageHours = trackingHours(s, run, runMembers(s, run));
      }
    }
  }

  if (run.stage !== 'retour') {
    const t = runMembers(s, run);
    const faim = t.reduce((a, m) => a + m.hunger, 0) / t.length;
    const energie = t.reduce((a, m) => a + m.energy, 0) / t.length;
    const pv = t.reduce((a, m) => a + m.hp / pvMax(m), 0) / t.length;
    const seuilPv = P.quetes.abandonPv[profileOf(t.find((m) => m.id === run.leader) ?? t[0])];
    if (faim < P.quetes.abandonFaim && t.every((m) => m.sac.panier === 0)) abort(s, run, 'la faim les tenaille');
    else if (energie < P.quetes.abandonEnergie) abort(s, run, 'tout le monde tombe de fatigue');
    else if (run.stage === 'objectif' && pv < seuilPv) abort(s, run, 'trop de blessés pour continuer');
  }
}

// ---------- Petits boulots en ville ----------

export function takeAide(s: GameState, a: Adventurer): boolean {
  if (a.fierte >= 80 && !broke(a)) return false;
  if (a.states.some((st) => st.gravite >= 1) || a.mourningUntil > s.tick) return false;
  const jobs = s.board.filter((q) => q.type === 'aide' && q.reservedBy === null);
  if (jobs.length === 0) return false;
  const best = jobs.reduce((b, q) => (a.attrs[q.attr!] * 10 + q.reward > a.attrs[b.attr!] * 10 + b.reward ? q : b));
  s.board = s.board.filter((q) => q !== best);
  a.job = best;
  a.lookingForQuest = false;
  a.activity = { kind: 'aide', until: s.tick + (best.hours ?? 4), place: 'ville' };
  think(s, a, `Un petit boulot en ville : ${best.title.toLowerCase()}. Ça paiera la soupe.`);
  return true;
}

export { questValue };
