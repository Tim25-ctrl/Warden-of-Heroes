// Bourse des dépouilles, acheteurs, contrats, resserre (GDD 2.4, 2.5).
import { BUYERS, P, RECIPES, RESOURCES } from './data';
import { clamp, hasModule, IP } from './economy';
import { money } from './format';
import { earn, log } from './journal';
import { modMult } from './mods';
import { onSale } from './legend';
import { chance, pick, randInt, range } from './rng';
import type { BuyerId, Contract, GameState, Money, Quality, ResLot } from './types';

export const QUALITY_MULT: Record<Quality, number> = { intacte: 1, abimee: 0.6, ruinee: 0.25 };
export const QUALITY_NAMES: Record<Quality, string> = { intacte: 'intacte', abimee: 'abîmée', ruinee: 'ruinée' };
const QUALITY_RANK: Record<Quality, number> = { ruinee: 0, abimee: 1, intacte: 2 };

export function initMarket(s: GameState): void {
  s.market = {};
  for (const [id, r] of Object.entries(RESOURCES)) {
    s.market[id] = { S: r.demande * P.marche.joursStockNormal, D: r.demande, cours: r.prix };
  }
  refreshPrices(s, false);
}

function refreshPrices(s: GameState, noise: boolean): void {
  for (const [id, m] of Object.entries(s.market)) {
    const r = RESOURCES[id];
    const e = r.rare ? P.marche.elasticiteRare : P.marche.elasticiteCommune;
    const od = clamp(Math.pow((m.D * P.marche.joursStockNormal) / Math.max(m.S, 0.01), e), 0.3, 3);
    const n = noise ? 1 + range(s, 'marche', -P.marche.bruit, P.marche.bruit) : 1;
    m.cours = Math.max(1, Math.round(r.prix * IP(s) * od * n));
  }
}

export function dailyMarket(s: GameState): void {
  for (const [id, m] of Object.entries(s.market)) {
    const r = RESOURCES[id];
    const apport = m.D * (r.rare ? P.marche.apportRare : P.marche.apportCommun);
    m.S = Math.max(m.D * 0.2, m.S + apport - m.D);
  }
  refreshPrices(s, true);
}

/** Facteur d'offre et de demande d'une ressource (sert aussi au prix de l'équipement, 3.8.2). */
export function odFactor(s: GameState, res: string): number {
  const m = s.market[res];
  if (!m) return 1;
  const e = RESOURCES[res].rare ? P.marche.elasticiteRare : P.marche.elasticiteCommune;
  // Modes de la noblesse, guerre, épidémie : la demande d'une ressource ou d'une catégorie change (5.4.3, 5.7).
  const D = m.D * modMult(s, `demande:${res}`) * modMult(s, `demande:cat:${RESOURCES[res].categorie}`);
  return clamp(Math.pow((D * P.marche.joursStockNormal) / Math.max(m.S, 0.01), e), 0.3, 3);
}

export function lotValue(s: GameState, lot: ResLot): Money {
  const cours = s.market[lot.res]?.cours ?? RESOURCES[lot.res].prix;
  return Math.round(cours * QUALITY_MULT[lot.quality] * (0.5 + 0.5 * lot.fresh) * lot.qty);
}

// ---------- Acheteurs (2.5.2) ----------

export function buyerAvailable(s: GameState, b: BuyerId): boolean {
  return BUYERS[b].palier !== 'ville' || (s.world?.palier ?? 'bourg') !== 'bourg';
}

export function buyerFor(s: GameState, res: string): BuyerId {
  const list = RESOURCES[res].acheteurs;
  return list.find((b) => buyerAvailable(s, b)) ?? list[list.length - 1];
}

/** Vente en ville : l'offre augmente, les frais sont retenus. La guilde profite de sa réputation. */
export function sellInTown(s: GameState, lot: ResLot, seller: 'aventurier' | 'guilde'): Money {
  const fee = seller === 'guilde' ? P.comptoir.fraisVenteGuilde : P.comptoir.fraisVenteAventurier;
  const b = buyerFor(s, lot.res);
  const rep = seller === 'guilde' ? (s.buyers[b] / 100) * P.marche.repBonusMax : 0;
  const v = Math.round(lotValue(s, lot) * (1 + rep) * (1 - fee));
  if (s.market[lot.res]) s.market[lot.res].S += lot.qty;
  onSale(s, lot.res, lot.qty, lot.qty ? v / lot.qty : 0, RESOURCES[lot.res].prix);
  if (seller === 'guilde') s.buyers[b] = clamp(s.buyers[b] + 0.2 * lot.qty, 0, 100);
  return v;
}

export function sellResserreLot(s: GameState, index: number): Money {
  const lot = s.resserre[index];
  if (!lot) return 0;
  const v = sellInTown(s, lot, 'guilde');
  earn(s, 'ventes', v);
  s.resserre.splice(index, 1);
  return v;
}

// ---------- Resserre (2.4.2) ----------

export function resserreCapacity(s: GameState): number {
  return P.comptoir.resserreBase + (hasModule(s, 'resserre1') ? 100 : 0) + (hasModule(s, 'resserre2') ? 100 : 0);
}

export function resserreWeight(s: GameState): number {
  return s.resserre.reduce((a, l) => a + l.qty * RESOURCES[l.res].poids, 0);
}

export function addLot(lots: ResLot[], lot: ResLot): void {
  const same = lots.find((l) => l.res === lot.res && l.quality === lot.quality && Math.abs(l.fresh - lot.fresh) < 0.01);
  if (same) same.qty += lot.qty;
  else lots.push({ ...lot });
}

/** Stocke dans la resserre si la place le permet, sinon vend aussitôt. */
export function storeOrSell(s: GameState, lot: ResLot): 'stocke' | 'vendu' {
  if (resserreWeight(s) + RESOURCES[lot.res].poids * lot.qty <= resserreCapacity(s)) {
    addLot(s.resserre, lot);
    return 'stocke';
  }
  earn(s, 'ventes', sellInTown(s, lot, 'guilde'));
  return 'vendu';
}

export function stockOfRes(s: GameState, res: string, minQuality: Quality = 'ruinee'): number {
  return s.resserre.reduce((a, l) => (l.res === res && QUALITY_RANK[l.quality] >= QUALITY_RANK[minQuality] ? a + l.qty : a), 0);
}

export function takeRes(s: GameState, res: string, qty: number, minQuality: Quality = 'ruinee'): ResLot[] {
  const taken: ResLot[] = [];
  let need = qty;
  const lots = s.resserre.filter((l) => l.res === res && QUALITY_RANK[l.quality] >= QUALITY_RANK[minQuality])
    .sort((a, b) => a.fresh - b.fresh);
  for (const l of lots) {
    if (need <= 0) break;
    const t = Math.min(need, l.qty);
    l.qty -= t;
    need -= t;
    taken.push({ ...l, qty: t });
  }
  s.resserre = s.resserre.filter((l) => l.qty > 0);
  return taken;
}

/** Une dépouille a-t-elle un usage interne (apothicairerie, réfectoire, contrat) ? */
export function hasInternalUse(s: GameState, res: string): boolean {
  if (s.contracts.some((c) => c.res === res)) return true;
  const apothecary = s.infirmerie.level >= 3 && s.staff.some((m) => m.role === 'apothicaire');
  if (apothecary && RECIPES.some((r) => r.ingredients[res])) return true;
  if (RESOURCES[res].categorie === 'viande' && s.refectoire.menu.includes('roti') && s.refectoire.level >= 3) return true;
  return false;
}

export function ageLots(s: GameState, lots: ResLot[]): ResLot[] {
  for (const l of lots) {
    const r = RESOURCES[l.res];
    let cons = r.conservation;
    if (cons <= 0) continue;
    if (hasModule(s, 'salle_froide') && ['viande', 'organe', 'rare'].includes(r.categorie)) cons *= 2;
    if (r.categorie === 'viande' && hasModule(s, 'saloir')) cons *= 5;
    l.fresh -= 1 / cons;
  }
  return lots.filter((l) => l.fresh > 0.001 && l.qty > 0);
}

/** Vente automatique du matin selon la consigne (1.10). */
export function autoSell(s: GameState): void {
  if (s.policy.autoSell === 'off') return;
  let total = 0;
  for (let i = s.resserre.length - 1; i >= 0; i--) {
    const lot = s.resserre[i];
    if (s.policy.autoSell === 'sans_usage' && hasInternalUse(s, lot.res)) continue;
    total += sellResserreLot(s, i);
  }
  if (total > 0) log(s, 'economie', 'detail', `Vente automatique de dépouilles : ${money(total)}.`);
}

// ---------- Contrats (2.5.3) ----------

export function generateContractOffers(s: GameState): void {
  s.contractOffers = s.contractOffers.filter((c) => c.offerUntil > s.tick);
  const n = randInt(s, 'marche', P.marche.contrats.offresParSemaine[0], P.marche.contrats.offresParSemaine[1]);
  const candidates = Object.keys(RESOURCES).filter((r) => RESOURCES[r].prix <= 250 && RESOURCES[r].categorie !== 'objet');
  for (let i = 0; i < n; i++) {
    const res = pick(s, 'marche', candidates);
    const buyer = buyerFor(s, res);
    const price = RESOURCES[res].prix;
    const c: Contract = {
      id: s.nextId++,
      buyer,
      res,
      qty: clamp(Math.round(randInt(s, 'marche', 300, 900) / price), 2, 12),
      delivered: 0,
      minQuality: chance(s, 'marche', 0.7) ? 'abimee' : 'intacte',
      premium: Math.round(range(s, 'marche', P.marche.contrats.primeMin, P.marche.contrats.primeMax) * 20) / 20,
      deadline: s.tick + 24 * randInt(s, 'marche', P.marche.contrats.delaiJours[0], P.marche.contrats.delaiJours[1]),
      offerUntil: s.tick + 24 * 3,
    };
    s.contractOffers.push(c);
  }
  if (n > 0) log(s, 'economie', 'info', `${n} nouvelle${n > 1 ? 's' : ''} offre${n > 1 ? 's' : ''} de contrat chez les marchands de la ville.`);
}

export function acceptContract(s: GameState, id: number): boolean {
  const i = s.contractOffers.findIndex((c) => c.id === id);
  if (i < 0 || s.contracts.length >= P.marche.contrats.actifsMax) return false;
  const c = s.contractOffers[i];
  s.contractOffers.splice(i, 1);
  s.contracts.push(c);
  log(s, 'economie', 'info', `Contrat accepté : ${c.qty} ${RESOURCES[c.res].nom.toLowerCase()} pour ${BUYERS[c.buyer].nom.toLowerCase()}.`);
  return true;
}

/** Livre ce que la resserre permet. Paiement : cours + prime. */
export function deliverContract(s: GameState, id: number): number {
  const c = s.contracts.find((x) => x.id === id);
  if (!c) return 0;
  const lots = takeRes(s, c.res, c.qty - c.delivered, c.minQuality);
  let qty = 0;
  let pay = 0;
  for (const l of lots) {
    qty += l.qty;
    pay += Math.round(lotValue(s, l) * (1 + c.premium));
  }
  if (qty === 0) return 0;
  c.delivered += qty;
  earn(s, 'contrats', pay);
  if (s.market[c.res]) s.market[c.res].S += qty;
  if (c.delivered >= c.qty) {
    s.contracts = s.contracts.filter((x) => x !== c);
    s.buyers[c.buyer] = clamp(s.buyers[c.buyer] + 5, 0, 100);
    log(s, 'economie', 'important', `Contrat honoré auprès de ${BUYERS[c.buyer].nom.toLowerCase()} (${money(pay)} pour la dernière livraison).`);
  } else {
    log(s, 'economie', 'info', `Livraison partielle : ${qty} ${RESOURCES[c.res].nom.toLowerCase()} (${c.delivered}/${c.qty}), ${money(pay)}.`);
  }
  return qty;
}

export function dailyContracts(s: GameState): void {
  for (const c of [...s.contracts]) {
    if (stockOfRes(s, c.res, c.minQuality) > 0) deliverContract(s, c.id);
  }
  for (const c of [...s.contracts]) {
    if (s.tick >= c.deadline) {
      s.contracts = s.contracts.filter((x) => x !== c);
      s.buyers[c.buyer] = clamp(s.buyers[c.buyer] + P.marche.contrats.echecReputation, 0, 100);
      s.renown = Math.max(0, s.renown - P.renommee.contratEchec);
      log(s, 'economie', 'important', `Contrat échoué : ${BUYERS[c.buyer].nom} attendait encore ${c.qty - c.delivered} ${RESOURCES[c.res].nom.toLowerCase()}. Réputation en baisse.`);
    }
  }
  s.contractOffers = s.contractOffers.filter((c) => c.offerUntil > s.tick);
}
