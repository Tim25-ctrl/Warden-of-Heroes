// Infirmerie : soins, hospitalisation, crédit, ventes au comptoir, apothicairerie (GDD 1.8, 2.4.3).
import { hasTrait, pvMax, sacCount } from './adventurers';
import { gravityName, removeAilment } from './ailments';
import { ETATS, GEAR, P, RECIPES, REMEDES, RESOURCES } from './data';
import {
  applyPurchase, applyRefusal, bedDayPrice, bedDayRef, careRef, carePrice, clamp, hasModule, infBeds, judge, remedyBuyPrice,
  isAbsent, salePrice, saleRef,
} from './economy';
import { advLink, money } from './format';
import { earn, log, spend, think, flow } from './journal';
import { addLot, QUALITY_MULT, stockOfRes, takeRes } from './market';
import { bump, unlock } from './legend';
import { chance } from './rng';
import type { Adventurer, Ailment, ConsumableId, GameState, Money, RemedeId } from './types';

const soigneurs = (s: GameState) => s.staff.filter((m) => m.role === 'soigneur' && !isAbsent(s, m));

/** L'infirmerie sait-elle traiter cet état à son niveau ? (1.8.6) */
export function canTreatLevel(s: GameState, st: Ailment): boolean {
  const lvl = s.infirmerie.level;
  if (lvl < ETATS[st.etat].niveau) return false;
  // Un cas critique est stabilisé (ramené à « sérieux ») avant le niveau 4, qui le guérit directement.
  if (st.etat === 'poison' && st.gravite >= 1 && lvl < 2) return false;
  if (st.etat === 'malediction' && st.gravite >= 1) return s.infirmerie.remedes.eau_benite > 0;
  return true;
}

function remedyFor(s: GameState, st: Ailment): RemedeId | null {
  if (st.etat === 'malediction') {
    if (st.gravite === 0 && s.infirmerie.remedes.elixir > 0) return 'elixir';
    return s.infirmerie.remedes.eau_benite > 0 ? 'eau_benite' : null;
  }
  const r = ETATS[st.etat].remede;
  return s.infirmerie.remedes[r] > 0 ? r : null;
}

export function hospitalized(s: GameState): number {
  return s.adventurers.filter((a) => a.activity.kind === 'hospitalise').length;
}

export interface CareOption { st: Ailment; remedy: RemedeId; price: Money; ref: Money; days: number }

export function careOption(s: GameState, a: Adventurer): CareOption | null {
  if (s.infirmerie.level === 0 || soigneurs(s).length === 0) return null;
  const states = [...a.states].sort((x, y) => y.gravite - x.gravite);
  for (const st of states) {
    if (!canTreatLevel(s, st)) continue;
    const remedy = remedyFor(s, st);
    if (!remedy) continue;
    let days = ETATS[st.etat].hospitalisation[st.gravite];
    if (hasModule(s, 'convalescence')) days = Math.round(days * 0.8);
    if (days > 0 && hospitalized(s) >= infBeds(s)) continue;
    return {
      st, remedy, days,
      price: carePrice(s, st.etat, st.gravite) + days * bedDayPrice(s),
      ref: careRef(s, st.etat, st.gravite) + days * bedDayRef(s),
    };
  }
  return null;
}

export function creditLeft(s: GameState, a: Adventurer): Money {
  if (!s.policy.credit) return 0;
  return Math.max(0, (a.creditCap ?? s.policy.creditCap) - a.debt);
}

/** Soins à l'infirmerie de la guilde (1.8.3), avec le crédit si la politique l'autorise (1.8.5). */
export function tryInfirmary(s: GameState, a: Adventurer, urgent: boolean): boolean {
  const opt = careOption(s, a);
  if (!opt) return false;
  if (s.infirmerie.treatedThisHour >= soigneurs(s).length * P.infirmerie.soinsParSoigneurH) return false;
  const { verdict, R } = judge(a, opt.price, opt.ref);
  let onCredit = false;
  if (verdict === 'refus' && !urgent) { applyRefusal(s, a, R); return false; }
  if (opt.price > a.gold) {
    if (opt.price - a.gold <= creditLeft(s, a)) onCredit = true;
    else return false;
  }
  if (onCredit) {
    const paid = a.gold;
    a.gold = 0;
    a.debt += opt.price - paid;
    earn(s, 'soins', paid);
    a.loyalty = clamp(a.loyalty + P.infirmerie.loyauteCredit, 0, 100);
    think(s, a, `La guilde me soigne à crédit (${money(opt.price - paid)}). Je ne l'oublierai pas.`);
  } else {
    a.gold -= opt.price; flow('soins', -(opt.price));
    earn(s, 'soins', opt.price);
    if (verdict !== 'refus') applyPurchase(s, a, R);
  }
  s.infirmerie.remedes[opt.remedy] -= 1;
  s.infirmerie.treatedThisHour += 1;
  const best = soigneurs(s).reduce((m, x) => Math.max(m, x.c), 0);
  const p = clamp(0.5 + best / 100 - 0.15 * opt.st.gravite + 0.05 * s.infirmerie.level, 0.05, 0.98);
  const label = `${ETATS[opt.st.etat].nom.toLowerCase()} ${gravityName(opt.st.gravite)}`;
  if (chance(s, 'ia', p)) {
    if (opt.st.etat === 'malediction' && opt.st.gravite >= 2) unlock(s, 'miracle');
    if (opt.st.gravite >= 2 && s.infirmerie.level < 4) { opt.st.gravite = 1; opt.st.since = s.tick; opt.st.bandaged = true; }
    else removeAilment(a, opt.st.etat);
    a.hp = Math.min(pvMax(a), a.hp + pvMax(a) * 0.2);
    if (opt.st.etat === 'poison') a.hp = Math.max(a.hp, 1);
    log(s, 'aventuriers', 'detail', `${advLink(a)} est soigné à l'infirmerie (${label}, ${money(opt.price)}).`);
    if (hasTrait(a, 'pieux')) a.morale = clamp(a.morale + 5, 0, 100);
  } else {
    a.morale = clamp(a.morale - 5, 0, 100);
    think(s, a, `Les soins n'ont rien donné pour ma ${label}. Il faudra recommencer.`);
  }
  const st = s.stats.services.soins ?? (s.stats.services.soins = { served: 0, revenue: 0, refusals: 0, toCompetitor: 0 });
  st.served += 1;
  st.revenue += opt.price;
  a.activity = opt.days > 0
    ? { kind: 'hospitalise', until: s.tick + opt.days * 24, place: 'infirmerie' }
    : { kind: 'consultation', until: s.tick + 1, place: 'infirmerie' };
  return true;
}

/** Un aventurier hospitalisé est nourri et se repose (inclus dans le prix du lit). */
export function hospitalCare(s: GameState, a: Adventurer): void {
  a.hunger = Math.max(a.hunger, 45);
  a.hp = Math.min(pvMax(a), a.hp + pvMax(a) * 0.09);
  a.energy = clamp(a.energy + 4, 0, 100);
  if (hasModule(s, 'convalescence') && s.tick % 24 === 12) a.morale = clamp(a.morale + 3, 0, 100);
}

// ---------- Ventes au comptoir de l'infirmerie (potions, antidotes, bandages) ----------

const SALE_LEVEL: Partial<Record<ConsumableId, number>> = { bandages: 1, antidote: 1, potion: 2 };

export function canSell(s: GameState, item: ConsumableId): boolean {
  const lvl = SALE_LEVEL[item];
  return lvl !== undefined && s.infirmerie.level >= lvl && s.infirmerie.remedes[item as RemedeId] > 0;
}

/** Avant une quête, l'aventurier remplit son sac (4.5.3). */
export function stockUp(s: GameState, a: Adventurer, venomous: boolean): void {
  const want: ConsumableId[] = ['potion'];
  if (venomous) want.push('antidote');
  want.push('bandages');
  for (const item of want) {
    if (sacCount(a) >= GEAR.sac.places || a.sac[item] >= 1 || !canSell(s, item)) continue;
    const r = item as RemedeId;
    const price = salePrice(s, r);
    if (a.gold < price + P.economie.coutVieJour) continue;
    const { verdict, R } = judge(a, price, saleRef(s, r));
    if (verdict === 'refus') { applyRefusal(s, a, R); continue; }
    a.gold -= price; flow('remedes', -(price));
    earn(s, 'ventesInfirmerie', price);
    applyPurchase(s, a, R);
    s.infirmerie.remedes[r] -= 1;
    a.sac[item] += 1;
  }
}

// ---------- Achats de remèdes et réapprovisionnement ----------

export function buyRemedy(s: GameState, r: RemedeId, qty: number, auto = false): number {
  const unit = remedyBuyPrice(s, r);
  const max = Math.floor((s.treasury - (auto ? s.policy.reserve : 0)) / unit);
  const q = Math.max(0, Math.min(qty, max));
  if (q === 0) return 0;
  spend(s, 'remedes', unit * q);
  s.infirmerie.remedes[r] += q;
  return q;
}

export function remedyRestock(s: GameState): void {
  if (s.infirmerie.level === 0) return;
  for (const [r, rule] of Object.entries(s.infirmerie.restock) as [RemedeId, { enabled: boolean; seuil: number; qty: number }][]) {
    if (!rule?.enabled || s.infirmerie.remedes[r] >= rule.seuil) continue;
    const got = buyRemedy(s, r, rule.qty, true);
    if (got > 0) log(s, 'economie', 'detail', `Achat de ${got} ${REMEDES[r].nom.toLowerCase()} chez l'Alchimiste.`);
  }
}

// ---------- Apothicairerie (2.4.3) ----------

export function apothecaryActive(s: GameState): boolean {
  return s.infirmerie.level >= 3 && s.staff.some((m) => m.role === 'apothicaire' && !isAbsent(s, m));
}

export function recipeAvailable(s: GameState, id: string): boolean {
  const rec = RECIPES.find((r) => r.id === id);
  if (!rec) return false;
  return Object.entries(rec.ingredients).every(([res, q]) => stockOfRes(s, res) >= q);
}

/** Coût des ingrédients au cours du jour, comparé au prix d'achat du remède. */
export function recipeEconomics(s: GameState, id: string): { cost: Money; value: Money } {
  const rec = RECIPES.find((r) => r.id === id)!;
  let cost = rec.achat ?? 0;
  for (const [res, q] of Object.entries(rec.ingredients)) cost += (s.market[res]?.cours ?? RESOURCES[res].prix) * q;
  return { cost, value: remedyBuyPrice(s, rec.produit) * rec.qte };
}

function craft(s: GameState, id: string): boolean {
  const rec = RECIPES.find((r) => r.id === id);
  if (!rec || !recipeAvailable(s, id)) return false;
  let quality = 1;
  for (const [res, q] of Object.entries(rec.ingredients)) {
    const lots = takeRes(s, res, q);
    for (const l of lots) quality = Math.min(quality, QUALITY_MULT[l.quality] < 1 ? 0.7 : 1);
  }
  if (rec.achat) spend(s, 'remedes', rec.achat);
  const apo = s.staff.filter((m) => m.role === 'apothicaire').reduce((m, x) => Math.max(m, x.c), 0);
  const n = Math.max(1, Math.floor(rec.qte * (0.7 + apo / 166) * (hasModule(s, 'laboratoire') ? 1.3 : 1) * quality));
  s.infirmerie.remedes[rec.produit] += n;
  bump(s, 'remedesFabriques', n);
  log(s, 'guilde', 'detail', `L'apothicairerie fabrique ${n} ${REMEDES[rec.produit].nom.toLowerCase()}.`);
  return true;
}

/** Une recette toutes les 2 heures en journée, 4 par jour (2.4.3). */
export function craftHour(s: GameState, hour: number): void {
  if (!apothecaryActive(s) || ![8, 10, 12, 14].includes(hour)) return;
  const inf = s.infirmerie;
  while (inf.queue.length) {
    const id = inf.queue.shift()!;
    if (craft(s, id)) return;
  }
  for (const [r, min] of Object.entries(inf.autoCraft) as [RemedeId, number][]) {
    if (!min || inf.remedes[r] >= min) continue;
    const rec = RECIPES.find((x) => x.produit === r && recipeAvailable(s, x.id));
    if (rec && craft(s, rec.id)) return;
  }
}

export function gardenHarvest(s: GameState): void {
  // Sanctuaire (infirmerie de niveau 5) : une fiole d'eau bénite par jour (1.8.6)
  if (s.infirmerie.level >= 5) s.infirmerie.remedes.eau_benite += 1;
  if (!hasModule(s, 'jardin')) return;
  addLot(s.resserre, { res: 'herbe_plaie', qty: 5, quality: 'intacte', fresh: 1 });
  addLot(s.resserre, { res: 'camomille', qty: 5, quality: 'intacte', fresh: 1 });
}
