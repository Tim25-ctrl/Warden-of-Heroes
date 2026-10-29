// Création des aventuriers, statistiques dérivées, expérience (GDD 3.2 à 3.9).
import { CLASSES, NAMES, P, TIERS, TRAITS, TRAIT_IDS } from './data';
import { clamp } from './economy';
import { advLink } from './format';
import { log } from './journal';
import { pick, rand, randInt, type Stream } from './rng';
import type { Adventurer, AttrId, ClassId, GameState, Profile, Rang, SkillId } from './types';

export const TIER_BONUS = [0, ...TIERS.map((t) => t.bonus)];
export const TIER_NAMES = ['', ...TIERS.map((t) => t.nom)];
const ATTRS: AttrId[] = ['FOR', 'AGI', 'INT', 'VOL', 'CON'];
const GENERAL: SkillId[] = ['connaissance', 'survie', 'cohesion', 'negoce'];

export const hasTrait = (a: Adventurer, t: string) => a.traits.includes(t);
export const hasState = (a: Adventurer, etat: string) => a.states.some((x) => x.etat === etat);

export function profileOf(a: Adventurer): Profile {
  if (hasTrait(a, 'temeraire')) return 'temeraire';
  if (hasTrait(a, 'prudent')) return 'prudent';
  return 'normal';
}

/** Les plaies et brûlures réduisent les PV maximum (1.8.1). */
function ailmentFactor(a: Adventurer): number {
  let f = 1;
  for (const st of a.states) {
    if (st.etat === 'plaie') f *= 1 - 0.1 * (st.gravite + 1);
    if (st.etat === 'brulure') f *= 0.85;
  }
  return f;
}

export function basePvMax(a: Adventurer): number {
  return Math.round((20 + 5 * a.attrs.CON + 3 * a.level) * (a.classe === 'mage' ? 0.8 : 1));
}
export function pvMax(a: Adventurer): number {
  const buff = a.buffs.includes('robustesse') || a.buffs.includes('legendaire') ? 1.05 : 1;
  return Math.max(1, Math.round(basePvMax(a) * ailmentFactor(a) * buff));
}

export const gearBonus = (g: { tier: number; dur: number }) => (g.dur > 0 ? TIER_BONUS[g.tier] : 0);

export function attackOf(a: Adventurer): number {
  const c = CLASSES[a.classe];
  let v = 2 * a.attrs[c.attaque] + (a.skills[c.arme] ?? 0) + gearBonus(a.weapon);
  if (hasState(a, 'malediction')) v *= 0.8;
  if (a.buffs.includes('force') || a.buffs.includes('legendaire')) v *= 1.05;
  return v;
}
export function defenseOf(a: Adventurer): number {
  return a.attrs.CON + a.attrs.AGI / 2 + (a.skills.protection ?? 0) + gearBonus(a.armor);
}
export function capacityOf(a: Adventurer): number {
  return 4 + a.attrs.FOR / 2;
}
export function sacCount(a: Adventurer): number {
  return a.sac.potion + a.sac.antidote + a.sac.bandages + a.sac.panier;
}
/** Puissance individuelle, avec les PV actuels (4.5.1). */
export function powerOf(a: Adventurer): number {
  return attackOf(a) + defenseOf(a) + a.hp / 4;
}
export const skill = (a: Adventurer, k: SkillId) => a.skills[k] ?? 0;

export function xpRequired(n: number): number { return Math.round(100 * Math.pow(n, 1.5)); }
export function xpQuestType(n: number): number { return 0.25 * xpRequired(n); }

export function rangForLevel(level: number): Rang {
  if (level <= 3) return 'F';
  if (level <= 7) return 'E';
  if (level <= 12) return 'D';
  if (level <= 17) return 'C';
  if (level <= 22) return 'B';
  if (level <= 27) return 'A';
  return 'S';
}
const RANG_LIST: Rang[] = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];
export const rangIndex = (r: Rang) => RANG_LIST.indexOf(r);

// ---------- Progression ----------

export function practice(s: GameState, a: Adventurer, k: SkillId, stream: Stream = 'aventuriers', cap = 20): void {
  const v = a.skills[k] ?? 0;
  if (v >= cap) return;
  if (rand(s, stream) < 0.1 * (1 - v / 25)) a.skills[k] = v + 1;
}

function levelUp(s: GameState, a: Adventurer): void {
  a.level += 1;
  const c = CLASSES[a.classe];
  a.attrs[c.principaux[a.level % 2]] += 1;
  const extra = pick(s, 'aventuriers', [...ATTRS, ...c.principaux]);
  a.attrs[extra] = Math.min(20, a.attrs[extra] + 1);
  for (const k of ATTRS) a.attrs[k] = Math.min(20, a.attrs[k]);
  const sk = pick(s, 'aventuriers', [...c.competences, ...c.competences, ...GENERAL]);
  a.skills[sk] = Math.min(20, (a.skills[sk] ?? 0) + 1);
  a.fierte = clamp(a.fierte + (hasTrait(a, 'ambitieux') ? 3 : 2), 0, 100);
  a.hp = Math.min(a.hp + 3, pvMax(a));
}

export function gainXp(s: GameState, a: Adventurer, xp: number): void {
  a.xp += Math.round(xp);
  while (a.level < P.aventuriers.niveauMax && a.xp >= xpRequired(a.level)) {
    a.xp -= xpRequired(a.level);
    levelUp(s, a);
    log(s, 'aventuriers', 'info', `${advLink(a)} passe au niveau ${a.level}.`);
  }
}

// ---------- Création ----------

function makeName(s: GameState, taken: Set<string>): string {
  for (let i = 0; i < 20; i++) {
    const first = pick(s, 'noms', NAMES.prenoms);
    const name = rand(s, 'noms') < 0.5 ? `${first} ${pick(s, 'noms', NAMES.surnoms)}` : first;
    if (!taken.has(name)) return name;
  }
  return `${pick(s, 'noms', NAMES.prenoms)} ${s.nextId}`;
}

export function takenNames(s: GameState): Set<string> {
  return new Set([
    ...s.adventurers.map((a) => a.name),
    ...s.doorCandidates.map((a) => a.name),
    ...s.staff.map((m) => m.name),
    ...s.staffCandidates.map((m) => m.name),
    ...s.terrain.profs.map((m) => m.name),
    ...s.profCandidates.map((m) => m.name),
  ]);
}

function pickTraits(s: GameState): string[] {
  const first = pick(s, 'aventuriers', TRAIT_IDS);
  let second = first;
  while (second === first || TRAITS[first].oppose === second) second = pick(s, 'aventuriers', TRAIT_IDS);
  return [first, second];
}

export interface NewAdventurerOptions {
  classe?: ClassId;
  level?: number;
  goldMin: number;
  goldMax: number;
  traits?: string[];
}

export function createAdventurer(s: GameState, o: NewAdventurerOptions): Adventurer {
  const classe = o.classe ?? pick(s, 'aventuriers', Object.keys(CLASSES) as ClassId[]);
  const c = CLASSES[classe];
  const traits = o.traits ?? pickTraits(s);
  const attrs = {} as Record<AttrId, number>;
  for (const k of ATTRS) {
    attrs[k] = clamp(8 + (c.principaux.includes(k) ? 4 : 0) + randInt(s, 'aventuriers', -2, 2), 1, 20);
  }
  if (traits.includes('robuste')) attrs.CON += 2;
  if (traits.includes('malchanceux')) attrs.VOL += 2;

  const skills: Partial<Record<SkillId, number>> = {};
  for (const k of GENERAL) skills[k] = randInt(s, 'aventuriers', 0, 3);
  for (const k of c.competences) skills[k] = randInt(s, 'aventuriers', 2, 5);
  if (classe === 'rodeur') skills.connaissance = (skills.connaissance ?? 0) + 3;

  let fierte = randInt(s, 'aventuriers', 10, 40);
  if (traits.includes('ambitieux')) fierte += 10;
  if (traits.includes('coquet')) fierte += 10;
  if (traits.includes('frugal')) fierte -= 5;

  const a: Adventurer = {
    id: s.nextId++,
    name: makeName(s, takenNames(s)),
    age: randInt(s, 'aventuriers', 18, 45),
    classe,
    level: 1,
    xp: 0,
    attrs,
    skills,
    traits,
    traitRevealTick: s.tick + 7 * 24,
    hp: 0,
    energy: randInt(s, 'aventuriers', 70, 100),
    hunger: randInt(s, 'aventuriers', 55, 90),
    morale: randInt(s, 'aventuriers', 50, 65),
    fierte: clamp(fierte, 0, 100),
    respect: P.aventuriers.respectDepart,
    loyalty: P.aventuriers.loyauteDepart,
    griefPrix: 0,
    griefFiscal: 0,
    gold: randInt(s, 'aventuriers', o.goldMin, o.goldMax),
    debt: 0,
    creditCap: null,
    fortuneGoal: P.economie.coutVieJour * randInt(s, 'aventuriers', 50, 500),
    weapon: { tier: 1, dur: 100 },
    armor: { tier: 1, dur: 100 },
    sac: { potion: 0, antidote: 0, bandages: 0, panier: 0 },
    states: [],
    buffs: [],
    activity: { kind: 'flaner', until: s.tick, place: 'hall' },
    lookingForQuest: false,
    runId: null,
    teamId: null,
    job: null,
    joinedTick: s.tick,
    lastQuestTick: s.tick,
    drinksToday: 0,
    mealsToday: 0,
    trainedToday: 0,
    mourningUntil: 0,
    exemptUntil: 0,
    status: 'actif',
    leaveTick: null,
    thoughts: [],
    history: { questsOk: 0, questsFail: 0, kills: 0, notable: [], fraudsCaught: 0 },
  };
  const target = o.level ?? 1;
  while (a.level < target) levelUp(s, a);
  if (a.level >= 4) a.weapon.tier = a.armor.tier = 2;
  a.hp = pvMax(a);
  return a;
}

export function visibleTraits(a: Adventurer, tick: number): string[] {
  return tick >= a.traitRevealTick ? a.traits : a.traits.slice(0, 1);
}

export function className(c: ClassId): string { return CLASSES[c].nom; }
