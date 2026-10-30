// Prix, qualité, tolérance des aventuriers, garde-manger (GDD 1.3, 1.5 à 1.8).
import {
  BEDS, DENREES, DISHES, DORM_LEVELS, ETATS, HOSPITAL_BED_PRICE, INF_LEVELS, KITCHEN_LEVELS, MESS_LEVELS, MODULES, P, REMEDES, ROOM_IDS, SERVICES,
  TERRAIN_LEVELS, TRAINING,
} from './data';
import { hourOf } from './format';
import { cityDiscount } from './cities';
import { damaged, modAdd, modMult, season } from './mods';
import { diff } from './legend';
import { spend } from './journal';
import { rand } from './rng';
import type {
  Adventurer, BedType, DenreeId, DishId, EtatId, GameState, Money, Professor, RemedeId, RoomId, StaffMember, StaffRole,
} from './types';

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Multiplicateur de qualité (1.3.1). */
export const MQ = (q: number) => 0.6 + 0.8 * clamp(q, 0, 100) / 100;
/** Indice de prix régional (1.3.2). */
export const IP = (s: GameState) => 0.7 + 0.6 * s.prosperity / 100;

export const hasModule = (s: GameState, id: string) => s.modules.includes(id);

// ---------- Dortoirs ----------

export function dormLevel(s: GameState) { return DORM_LEVELS[s.dortoirs.level - 1]; }
export function messLevel(s: GameState) { return MESS_LEVELS[s.refectoire.level - 1]; }
export function kitchenLevel(s: GameState) { return KITCHEN_LEVELS[s.cuisine.level - 1]; }

export function dormQuality(s: GameState): number {
  let bonus = 0;
  if (hasModule(s, 'rideaux')) bonus += 5;
  if (hasModule(s, 'cheminee')) bonus += 8;
  bonus += (DORM_LEVELS[s.dortoirs.level - 1] as { qualite?: number })?.qualite ?? 0;   // niveau 5 : qualité de base +10
  if (hasModule(s, 'bains')) bonus += 10;
  return clamp(30 + 8 * s.dortoirs.level + bonus + (s.dortoirs.proprete - 50) / 2, 0, 100);
}

export function bedRef(s: GameState, bed: BedType): Money {
  return Math.max(1, Math.round(BEDS[bed].prix * MQ(dormQuality(s)) * IP(s)));
}
/** Les prix sont fixés directement par le joueur (v1.1) ; la référence reste la valeur que les aventuriers leur donnent. */
export function bedPrice(s: GameState, bed: BedType): Money {
  return s.dortoirs.prix[bed];
}
export function bedsAvailable(s: GameState, bed: BedType): number {
  let n = s.dortoirs.beds[bed];
  if (s.dortoirs.works || damaged(s, 'dortoirs')) n = Math.floor(n / 2);
  // Soldats du baron logés par la guilde (5.4.3) : ils prennent les paillasses, puis les lits communs.
  const soldiers = modAdd(s, 'lits_occupes');
  if (soldiers > 0 && bed === 'paillasse') n -= soldiers;
  if (soldiers > 0 && bed === 'commun') n -= Math.max(0, soldiers - s.dortoirs.beds.paillasse);
  return Math.max(0, n);
}
export function bedsUsed(s: GameState, bed: BedType): number {
  return s.adventurers.filter((a) => a.activity.kind === 'dormir' && a.activity.bed === bed).length;
}

// ---------- Personnel ----------

/** Le premier employé présent pour ce rôle (le courtier, le greffier…), s'il y en a un. */
export function onDuty(s: GameState, role: StaffRole): StaffMember | undefined {
  return s.staff.find((m) => m.role === role && !isAbsent(s, m));
}

export function isAbsent(s: GameState, m: { trait: string | null; id: number; absentUntil?: number }): boolean {
  if (m.absentUntil !== undefined && m.absentUntil > s.tick) return true;   // malade pendant une épidémie (5.7)
  if (m.trait !== 'fragile') return false;
  const day = Math.floor(s.tick / 24);
  return ((day * 2654435761 + m.id * 40503) >>> 0) % 100 < 5;
}

export function chefSkill(s: GameState): number {
  return s.staff.filter((m) => m.role === 'cuisinier' && !isAbsent(s, m)).reduce((mx, m) => Math.max(mx, m.c), 0);
}

/** Remise de l'intendant sur les achats (1.10) : 5 à 15 % selon sa compétence. */
export function intendantDiscount(s: GameState): number {
  const it = s.staff.find((m) => m.role === 'intendant' && !isAbsent(s, m));
  if (!it) return 0;
  return clamp(P.intendant.remiseMin + (it.c / 100) * (P.intendant.remiseMax - P.intendant.remiseMin), 0, P.intendant.remiseMax);
}

// ---------- Réfectoire ----------

export function kitchenRate(s: GameState): number {
  let rate = 0;
  for (const m of s.staff) {
    if (isAbsent(s, m)) continue;
    const bonus = m.trait === 'travailleur' ? 1.2 : 1;
    if (m.role === 'cuisinier') rate += (6 + m.c / 10) * bonus;
    if (m.role === 'commis') rate += 4 * bonus;
  }
  // Cuisine en travaux ou endommagée : moitié moins de portions
  if (s.cuisine.works || damaged(s, 'cuisine')) rate /= 2;
  return Math.floor(rate);
}

export function seats(s: GameState): number {
  const n = messLevel(s).places;
  return s.refectoire.works || damaged(s, 'refectoire') ? Math.floor(n / 2) : n;
}

function firstLot(s: GameState, d: DenreeId) {
  return s.refectoire.pantry.find((l) => l.denree === d && l.qty > 0);
}

export function dishFreshness(s: GameState, dish: DishId): number {
  const ing = Object.keys(DISHES[dish].ingredients) as DenreeId[];
  if (ing.length === 0) return 1;
  return ing.reduce((a, d) => a + (firstLot(s, d)?.fresh ?? 1), 0) / ing.length;
}

export function dishQuality(s: GameState, dish: DishId): number {
  // La salle (ambiance) et la cuisine (équipement) comptent chacune pour moitié.
  return clamp(0.5 * chefSkill(s) + 0.2 * dishFreshness(s, dish) * 100 + 2 * (s.refectoire.level + s.cuisine.level) - s.refectoire.damage
    + ((s.refectoire.proprete ?? 70) - 60) / 5, 0, 100);   // v1.1 : une salle sale gâche le repas
}

/** Coût d'une portion de viande de monstre au cours du jour (1 unité = 4 portions). */
export function monsterPortionCost(s: GameState): Money {
  const lot = firstLot(s, 'monstre');
  const res = lot?.species ?? 'viande_sanglier';
  return Math.round((s.market[res]?.cours ?? 10) / 4);
}

export function dishRef(s: GameState, dish: DishId): Money {
  let base = DISHES[dish].prix;
  if (dish === 'roti') base += 1.5 * monsterPortionCost(s);
  return Math.max(1, Math.round(base * MQ(dishQuality(s, dish)) * IP(s)));
}
export function dishPrice(s: GameState, dish: DishId): Money {
  return s.refectoire.prix[dish];
}

export function dishUnlocked(s: GameState, dish: DishId): boolean {
  const d = DISHES[dish];
  return d.niveau <= s.cuisine.level && (!d.module || hasModule(s, d.module));
}

export function dishServable(s: GameState, dish: DishId): boolean {
  const d = DISHES[dish];
  if (!s.refectoire.menu.includes(dish) || !dishUnlocked(s, dish)) return false;
  if (d.cMin > 0 && chefSkill(s) < d.cMin) return false;
  for (const [den, q] of Object.entries(d.ingredients) as [DenreeId, number][]) {
    if (stockOf(s, den) < q) return false;
  }
  return true;
}

export function currentService(s: GameState): { id: string; nom: string; debut: number; fin: number } | null {
  const h = hourOf(s.tick);
  for (const sv of SERVICES) if (h >= sv.debut && h < sv.fin) return sv;
  return null;
}

export function tavernOpen(s: GameState): boolean {
  const h = hourOf(s.tick);
  return s.refectoire.level >= 2 && h >= 18 && h < 22;
}

// ---------- Garde-manger ----------

export function stockOf(s: GameState, d: DenreeId): number {
  return s.refectoire.pantry.reduce((a, l) => (l.denree === d ? a + l.qty : a), 0);
}
export function pantryTotal(s: GameState): number {
  return s.refectoire.pantry.reduce((a, l) => a + l.qty, 0);
}
export function pantryCapacity(s: GameState): number { return kitchenLevel(s).garde; }
/** Nombre de repas au menu (les boissons et paniers ne comptent pas). */
export function menuSize(s: GameState): number { return kitchenLevel(s).plats; }

export function pendingOf(s: GameState, d?: DenreeId): number {
  return s.orders.reduce((a, o) => (!d || o.denree === d ? a + o.qty : a), 0);
}

export function consumeDish(s: GameState, dish: DishId): { fresh: number; species?: string } {
  let freshSum = 0;
  let n = 0;
  let species: string | undefined;
  const eaten = (s.refectoire.eaten ??= {});
  for (const [den, q] of Object.entries(DISHES[dish].ingredients) as [DenreeId, number][]) {
    let need = q;
    eaten[den] = (eaten[den] ?? 0) + Math.min(q, stockOf(s, den));
    for (const lot of s.refectoire.pantry) {
      if (lot.denree !== den || lot.qty <= 0) continue;
      const take = Math.min(need, lot.qty);
      lot.qty -= take;
      need -= take;
      freshSum += lot.fresh * take;
      n += take;
      if (lot.species) species = lot.species;
      if (need <= 0) break;
    }
  }
  s.refectoire.pantry = s.refectoire.pantry.filter((l) => l.qty > 0);
  const out = (s.refectoire.ranOut ??= []);
  for (const den of Object.keys(DISHES[dish].ingredients) as DenreeId[]) if (stockOf(s, den) === 0 && !out.includes(den)) out.push(den);
  return { fresh: n ? freshSum / n : 1, species };
}

/** Vieillissement quotidien, avec la Glacière et le Saloir (1.6.8). */
export function freshLoss(s: GameState, d: DenreeId, conservation: number): number {
  let days = conservation;
  const meat = d === 'viande' || d === 'monstre';
  if (meat && hasModule(s, 'saloir')) days *= 5;
  let loss = 1 / days;
  if (hasModule(s, 'glaciere')) loss *= 0.5;
  // Été sans glacière, canicule : la viande se gâte plus vite (5.2, 5.4.3).
  else if (meat && season(s) === 1) loss *= 2;
  if (meat) loss *= modMult(s, 'conservation_viande');
  return loss;
}

export function foodUnitPrice(s: GameState, d: DenreeId): number {
  // Saisons (5.2) : denrées −20 % en automne, légumes ×1,5 en hiver. Pénurie et autres événements (5.4.3).
  const sea = season(s);
  const saison = (sea === 2 ? P.monde.automneDenrees : 1) * (sea === 3 && d === 'legumes' ? P.monde.hiverLegumes : 1);
  return DENREES[d].prix * IP(s) * saison * modMult(s, `denree:${d}`) * (1 - intendantDiscount(s)) * cityDiscount(s, 'denrees');
}

export function orderCost(s: GameState, d: DenreeId, qty: number): Money {
  return Math.round(foodUnitPrice(s, d) * qty);
}

/** Passe une commande, livrée le lendemain à 06h si passée avant 18h (1.6.3). */
export function placeOrder(s: GameState, d: DenreeId, qty: number, auto = false): number {
  const room = pantryCapacity(s) - pantryTotal(s) - pendingOf(s);
  let q = Math.max(0, Math.min(qty, room));
  // Sans intendant, les commandes automatiques se trompent parfois de quantité.
  if (auto && intendantDiscount(s) === 0 && q > 0) {
    q = Math.max(1, Math.round(q * (1 + (rand(s, 'personnel') * 2 - 1) * P.intendant.erreurSansIntendant)));
  }
  if (q <= 0) return 0;
  const cost = orderCost(s, d, q);
  if (cost > s.treasury - (auto ? s.policy.reserve : 0)) return 0;
  const day = Math.floor(s.tick / 24);
  const deliverTick = (day + (hourOf(s.tick) < 18 ? 1 : 2)) * 24 + 6;
  spend(s, 'denrees', cost);
  s.orders.push({ denree: d, qty: q, deliverTick, cost });
  return q;
}

// ---------- Tolérance et jugement des prix (1.3.4) ----------

/** Bonus de tolérance de la difficulté (6.5), recopié à chaque heure de simulation. */
let difficultyTolerance = 0;
export function syncDifficulty(s: GameState): void { difficultyTolerance = diff(s).tolerance; }

export function tolerance(a: Adventurer): number {
  const days = Math.max(a.gold, 1) / P.economie.coutVieJour;
  let t = P.tarifs.toleranceBase + P.tarifs.toleranceCoef * clamp(Math.log10(days), 0, 2) + difficultyTolerance;
  if (a.traits.includes('radin')) t -= 0.2;
  if (a.traits.includes('depensier')) t += 0.3;
  return t;
}

export function prideMult(a: Adventurer): number {
  return a.fierte >= 80 ? 1.6 : a.fierte >= 60 ? 1.3 : 1;
}

export type Verdict = 'affaire' | 'juste' | 'cher' | 'refus';

export function judge(a: Adventurer, price: Money, ref: Money): { verdict: Verdict; R: number } {
  const R = price / Math.max(1, ref);
  if (R > tolerance(a)) return { verdict: 'refus', R };
  if (R <= P.tarifs.bonneAffaire) return { verdict: 'affaire', R };
  if (R <= 1) return { verdict: 'juste', R };
  return { verdict: 'cher', R };
}

export function applyPurchase(s: GameState, a: Adventurer, R: number): void {
  s.stats.priceRatios.push(R);
  if (R <= P.tarifs.bonneAffaire) a.morale = clamp(a.morale + 2, 0, 100);
  else if (R > 1) a.griefPrix += (R - 1) * 10 * prideMult(a);
}

export function applyRefusal(s: GameState, a: Adventurer, R: number): void {
  s.stats.priceRatios.push(R);
  a.griefPrix += P.tarifs.griefRefus * prideMult(a);
  a.loyalty = clamp(a.loyalty + P.tarifs.loyauteRefus, 0, 100);
}

// ---------- Infirmerie (1.8) ----------

export function infQuality(s: GameState): number {
  const heal = s.staff.filter((m) => m.role === 'soigneur' && !isAbsent(s, m));
  const c = heal.length ? heal.reduce((a, m) => a + m.c, 0) / heal.length : 0;
  return clamp(30 + 6 * s.infirmerie.level + 0.3 * c + (s.privileges?.includes('medecins') ? 10 : 0) + ((s.infirmerie.proprete ?? 70) - 60) / 5, 0, 100);
}
export function infBeds(s: GameState): number {
  if (s.infirmerie.level === 0) return 0;
  const n = INF_LEVELS[s.infirmerie.level - 1].lits;
  return s.infirmerie.works || damaged(s, 'infirmerie') ? Math.floor(n / 2) : n;
}
export function careRef(s: GameState, etat: EtatId, g: number): Money {
  return Math.max(1, Math.round(ETATS[etat].prix[g] * MQ(infQuality(s)) * IP(s)));
}
/** Le joueur fixe le prix d'une plaie sérieuse ; le reste de la grille garde les mêmes proportions. */
export function carePrice(s: GameState, etat: EtatId, g: number): Money {
  return Math.max(1, Math.round(s.infirmerie.prixSoins * ETATS[etat].prix[g] / ETATS.plaie.prix[1]));
}
export function bedDayRef(s: GameState): Money {
  return Math.round(HOSPITAL_BED_PRICE * MQ(infQuality(s)) * IP(s));
}
export function bedDayPrice(s: GameState): Money {
  return Math.max(1, Math.round(s.infirmerie.prixSoins * HOSPITAL_BED_PRICE / ETATS.plaie.prix[1]));
}
const saleBase = (r: RemedeId) => REMEDES[r].vente ?? REMEDES[r].prix * 2;
export function saleRef(s: GameState, r: RemedeId): Money {
  return Math.round(saleBase(r) * MQ(infQuality(s)) * IP(s));
}
/** Le joueur fixe le prix d'une potion ; les autres remèdes suivent dans les mêmes proportions. */
export function salePrice(s: GameState, r: RemedeId): Money {
  return Math.max(1, Math.round(s.infirmerie.prixVente * saleBase(r) / saleBase('potion')));
}
export function remedyBuyPrice(s: GameState, r: RemedeId): Money {
  return Math.max(1, Math.round(REMEDES[r].prix * IP(s) * (1 - intendantDiscount(s)) * cityDiscount(s, 'remedes')));
}

// ---------- Terrain (1.7) ----------

export function terrainQuality(s: GameState): number {
  return clamp(30 + 8 * s.terrain.level, 0, 100);
}
export const mProf = (p: Professor) => 0.5 + p.pedagogie / 100;
export function sessionRef(s: GameState, p: Professor | null): Money {
  const base = p ? 20 * (1 + p.level / 2) * mProf(p) : TRAINING.libre.prix;
  return Math.max(1, Math.round(base * MQ(terrainQuality(s)) * IP(s)));
}
export function sessionPrice(s: GameState, p: Professor | null): Money {
  return p ? p.prix : s.terrain.prixLibre;
}

// ---------- Concurrents de la ville (1.3.5) ----------

export function innPrice(s: GameState): Money {
  const c = P.concurrents.auberge;
  return Math.round(c.prixBase * MQ(c.qualite) * IP(s) * s.competitorFluct * modMult(s, 'concurrents:prix'));
}
export function tavernPrice(s: GameState): Money {
  const c = P.concurrents.taverne;
  return Math.round(c.prixBase * MQ(c.qualite) * IP(s) * s.competitorFluct * modMult(s, 'concurrents:prix') * modMult(s, 'taverne:prix'));
}
export function templePrice(s: GameState, a?: Adventurer): Money {
  // Le Temple facture davantage les états graves (×1,8 la grille de soins).
  const worst = a ? a.states.reduce((m, st) => Math.max(m, ETATS[st.etat].prix[st.gravite]), 0) : 0;
  return Math.round(Math.max(P.concurrents.temple.prixBase, worst * 1.8) * IP(s));
}
export function bonesetterPrice(s: GameState): Money {
  return Math.round(P.concurrents.rebouteux.prixBase * IP(s));
}

export function cotisationRef(s: GameState): Money {
  return Math.round(100 * (1 + 0.5 * (s.rank - 1)));
}
export function cotisationPrice(s: GameState): Money {
  return s.cotisationPrix;
}

/** Jugement des clients sur un prix, comparé à la valeur qu'ils donnent au service (affiché à la place d'une référence chiffrée). */
export function priceVerdict(price: Money, ref: Money): { label: string; tone: 'sage' | '' | 'amber' | 'seal'; ratio: number } {
  const ratio = price / Math.max(1, ref);
  if (ratio < 0.7) return { label: 'bradé', tone: 'sage', ratio };
  if (ratio <= 0.92) return { label: 'bon marché', tone: 'sage', ratio };
  if (ratio <= 1.1) return { label: 'correct', tone: '', ratio };
  if (ratio <= 1.4) return { label: 'cher', tone: 'amber', ratio };
  return { label: 'hors de prix', tone: 'seal', ratio };
}

/** Prix de départ : la valeur que les aventuriers donnent à chaque service. */
export function defaultPrices(s: GameState): void {
  for (const b of Object.keys(BEDS) as BedType[]) s.dortoirs.prix[b] = bedRef(s, b);
  for (const d of Object.keys(DISHES) as DishId[]) s.refectoire.prix[d] = dishRef(s, d);
  s.infirmerie.prixSoins = careRef(s, 'plaie', 1);
  s.infirmerie.prixVente = saleRef(s, 'potion');
  s.terrain.prixLibre = sessionRef(s, null);
  s.cotisationPrix = cotisationRef(s);
}

export function roomLevelCost(room: RoomId, level: number): number | null {
  const table = room === 'dortoirs' ? DORM_LEVELS : room === 'refectoire' ? MESS_LEVELS : room === 'cuisine' ? KITCHEN_LEVELS
    : room === 'infirmerie' ? INF_LEVELS : TERRAIN_LEVELS;
  const l = table[level - 1] as { cout: number; valeur?: number } | undefined;
  return l ? (l.valeur ?? l.cout) : null;
}

export function buildingValue(s: GameState): Money {
  let v = 0;
  for (const room of ROOM_IDS) {
    for (let i = 1; i <= s[room].level; i++) v += roomLevelCost(room, i) ?? 0;
  }
  for (const m of s.modules) v += MODULES[m]?.cout ?? 0;
  return v;
}
