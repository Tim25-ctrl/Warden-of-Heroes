// Villes voisines (GDD 5.8, ajout v1.1) : routes commerciales, routes coupées, caravanes de la guilde.
import { CITIES, CITY_IDS, P, RESOURCES, SPECIES, ZONES } from './data';
import { clamp, IP } from './economy';
import { money } from './format';
import { earn, log, spend } from './journal';
import { diff } from './legend';
import { lotValue, QUALITY_MULT, storeOrSell } from './market';
import { huntClosed, popOf } from './populations';
import { makeChasse, makeCityEscort } from './quests';
import { chance, pick } from './rng';
import type { CityState, GameState, Money, Quest, QuestRun, ResLot, Rival } from './types';
import { addRenown, news } from './world';

const H = 24;
const V = () => P.villes;

/** État d'une ville (créé à la volée pour les anciennes sauvegardes). */
export function cityState(s: GameState, id: string): CityState {
  const w = s.world;
  w.villes ??= {};
  return (w.villes[id] ??= { commerce: V().commerceDepart, coupeeDepuis: null });
}

export const routeOpen = (s: GameState, id: string) => cityState(s, id).coupeeDepuis === null;

/** Durée du trajet d'une quête, jusqu'à la ville de destination pour une escorte lointaine. */
export const questTrajet = (q: Quest) => (q.dest && CITIES[q.dest] ? CITIES[q.dest].trajet : ZONES[q.zone].trajet);

/** Force de l'avantage commercial d'une ville (0 à 1), nulle si sa route est coupée. */
export function tradeFactor(s: GameState, effet: string): number {
  if (!s.world) return 0;
  const c = Object.values(CITIES).find((x) => x.effet === effet);
  if (!c || !routeOpen(s, c.id)) return 0;
  return clamp(cityState(s, c.id).commerce / 100, 0, 1);
}

/** Remise sur les achats que la route commerciale rend moins chers. */
export const cityDiscount = (s: GameState, effet: 'remedes' | 'denrees' | 'equipement') => 1 - V().effetMax * tradeFactor(s, effet);

export function commerceLabel(v: number): { nom: string; tone: string } {
  if (v < 15) return { nom: 'au point mort', tone: 'seal' };
  if (v < 40) return { nom: 'modeste', tone: 'amber' };
  if (v < 70) return { nom: 'actif', tone: 'sage' };
  return { nom: 'florissant', tone: 'gold' };
}

/** Ville où siège une guilde rivale. */
export function rivalCity(r: Rival): string | undefined {
  if (r.ville) return r.ville;
  return Object.values(CITIES).find((c) => c.guilde === r.id.replace(/\+*$/, ''))?.id;
}

/** Ville d'une nouvelle guilde : Brisemine si elle n'en a pas encore, sinon celle de la guilde disparue. */
export function newRivalCity(s: GameState, old: Rival): string | undefined {
  const taken = s.world.rivals.filter((r) => r !== old && r.bankruptSince === null).map(rivalCity);
  return taken.includes('brisemine') ? rivalCity(old) : 'brisemine';
}

const shiftCommerce = (s: GameState, id: string, v: number) => { const c = cityState(s, id); c.commerce = clamp(c.commerce + v, 0, 100); };

// ---------- Escortes et caravanes ----------

/** Prix offert par une ville pour une ressource (catégories demandées mieux payées, selon le commerce). */
export function cityPriceMult(s: GameState, city: string, res: string): number {
  const c = CITIES[city];
  const C = V().caravane;
  if (!c.demande.includes(RESOURCES[res].categorie)) return C.autre;
  return C.prime + C.primeCommerce * cityState(s, city).commerce / 100;
}

/** Une ville paie au moins le cours de la ville (et jamais moins que le prix de base, ses cours ne s'effondrent pas), majoré selon sa demande. */
export function cityLotValue(s: GameState, city: string, lot: ResLot): Money {
  const unit = Math.max(RESOURCES[lot.res].prix * IP(s), s.market[lot.res]?.cours ?? 0);
  return Math.round(unit * QUALITY_MULT[lot.quality] * (0.5 + 0.5 * lot.fresh) * lot.qty * cityPriceMult(s, city, lot.res));
}

/** Prix d'escorte conseillé pour une caravane : la moitié d'une escorte ordinaire vers cette ville (le trajet est le même, sans client à servir). */
export function caravanFeeRef(s: GameState, ville: string): Money {
  return Math.round(P.quetes.baseParRang[CITIES[ville].rang] * 1.1 * IP(s) * V().recompense * diff(s).recompenses * V().caravane.escorte);
}

/** Ce que rapporteraient à la ville les marchandises choisies (dans la limite de poids d'une caravane). */
export function caravanPreview(s: GameState, ville: string, res: string[]): { value: Money; local: Money; weight: number } {
  let weight = 0, value = 0, local = 0;
  for (const lot of s.resserre.filter((l) => res.includes(l.res))) {
    const w = RESOURCES[lot.res].poids;
    const n = Math.min(lot.qty, Math.floor((V().caravane.poidsMax - weight) / w));
    if (n <= 0) continue;
    weight += n * w;
    value += cityLotValue(s, ville, { ...lot, qty: n });
    local += lotValue(s, { ...lot, qty: n });
  }
  return { value, local, weight };
}

export const activeCaravans = (s: GameState) => s.board.filter((q) => q.caravane).length + s.runs.filter((r) => r.quest.caravane).length;

/** La guilde charge une caravane de marchandises de l'Entrepôt et paie son escorte. */
export function sendCaravan(s: GameState, ville: string, res: string[], fee: Money): string | null {
  const c = CITIES[ville];
  const C = V().caravane;
  if (!c) return 'Ville inconnue.';
  if (!routeOpen(s, ville)) return `La route de ${c.nom} est coupée.`;
  if (activeCaravans(s) >= C.max) return `Pas plus de ${C.max} caravanes à la fois.`;
  if (fee < 50 || fee > s.treasury) return "Montant de l'escorte invalide ou trésorerie insuffisante.";
  const lots: ResLot[] = [];
  let weight = 0;
  for (const lot of s.resserre.filter((l) => res.includes(l.res))) {
    const room = C.poidsMax - weight;
    const w = RESOURCES[lot.res].poids;
    const n = Math.min(lot.qty, Math.floor(room / w));
    if (n <= 0) continue;
    lots.push({ ...lot, qty: n });
    weight += n * w;
  }
  if (!lots.length) return 'Rien à charger.';
  for (const l of lots) {
    const src = s.resserre.find((x) => x.res === l.res && x.quality === l.quality && x.fresh === l.fresh);
    if (src) src.qty -= l.qty;
  }
  s.resserre = s.resserre.filter((l) => l.qty > 0);
  const q = makeCityEscort(s, ville, 'guilde');
  q.client = 'la Guilde';
  q.reward = fee;
  q.caravane = lots;
  q.title = `Caravane de la guilde jusqu'à ${c.nom}`;
  q.expires = s.tick + C.expirationJours * H;
  spend(s, 'caravanes', fee);
  s.board.push(q);
  const value = lots.reduce((a, l) => a + cityLotValue(s, ville, l), 0);
  log(s, 'economie', 'info', `La guilde charge une caravane pour ${c.nom} (${lots.reduce((a, l) => a + l.qty, 0)} marchandises, environ ${money(value)} à la vente) et paie ${money(fee)} pour son escorte.`);
  return null;
}

/** Les marchandises d'une caravane qui n'est pas partie (ou qui a rebroussé chemin) reviennent à l'Entrepôt. */
function returnCaravan(s: GameState, q: Quest, why: string): void {
  if (!q.caravane?.length) return;
  for (const l of q.caravane) storeOrSell(s, l);
  log(s, 'economie', 'info', `${why} : les marchandises de la caravane pour ${CITIES[q.dest!]?.nom ?? 'la ville'} reviennent à l'Entrepôt.`);
  q.caravane = [];
}

export function onCaravanExpired(s: GameState, q: Quest): void {
  returnCaravan(s, q, "Personne n'a pris l'escorte");
}

/** Fin d'une escorte vers une ville : commerce, et vente des marchandises d'une caravane. */
export function onCityEscortEnd(s: GameState, run: QuestRun, ok: boolean): void {
  const q = run.quest;
  if (!q.dest || !CITIES[q.dest]) return;
  const c = CITIES[q.dest];
  shiftCommerce(s, q.dest, ok ? V().commerceOk : V().commerceEchec);
  if (!q.caravane?.length) return;
  if (ok) {
    const v = q.caravane.reduce((a, l) => a + cityLotValue(s, q.dest!, l), 0);
    earn(s, 'caravanes', v);
    log(s, 'economie', 'important', `La caravane de la guilde a tout vendu à ${c.nom} : ${money(v)} entrent dans les coffres.`);
    q.caravane = [];
  } else if (run.convoyHp <= 0) {
    log(s, 'economie', 'important', `La caravane pour ${c.nom} est perdue, avec toutes ses marchandises.`);
    q.caravane = [];
  } else returnCaravan(s, q, "L'escorte a rebroussé chemin");
}

/** Toute l'escorte a péri en route : la caravane est perdue. */
export function onCaravanLost(s: GameState, q: Quest): void {
  if (!q.caravane?.length) return;
  log(s, 'economie', 'important', `Personne n'est revenu de l'escorte : la caravane pour ${CITIES[q.dest!]?.nom ?? 'la ville'} est perdue.`);
  q.caravane = [];
}

// ---------- Routes coupées ----------

export function cutRoute(s: GameState, id: string): boolean {
  const c = CITIES[id];
  const zone = c.route;
  const opts = Object.keys(ZONES[zone].especes).filter((sp) => SPECIES[sp] && SPECIES[sp].r > 0 && sp !== 'dragon' && popOf(s, zone, sp) > 15 && !huntClosed(s, zone, sp));
  if (!opts.length) return false;
  const sp = opts.sort((a, b) => popOf(s, zone, b) - popOf(s, zone, a))[0];
  const st = cityState(s, id);
  st.coupeeDepuis = s.tick;
  st.cause = sp;
  s.world.lastCut = s.tick;
  // Les escortes prévues vers cette ville sont annulées (les caravanes reviennent).
  for (const q of s.board.filter((x) => x.dest === id && x.reservedBy === null)) {
    if (q.caravane) { returnCaravan(s, q, 'La route est coupée'); earn(s, 'primesRendues', q.reward); }
  }
  s.board = s.board.filter((x) => x.dest !== id || x.reservedBy !== null);
  postRouteQuest(s, id);
  news(s, 'une', `Des ${SPECIES[sp].pluriel} coupent la route de ${c.nom} ${ZONES[zone].lieu.replace('dans les égouts', 'aux portes de la ville')} : plus aucun convoi ne passe.`);
  log(s, 'monde', 'important', `La route de ${c.nom} est coupée par des ${SPECIES[sp].pluriel}. Une quête au tableau permet de la rouvrir ; sinon la milice de ${c.court} la dégagera dans ${V().coupure.dureeMax} jours.`);
  return true;
}

function postRouteQuest(s: GameState, id: string): void {
  const c = CITIES[id];
  const st = cityState(s, id);
  if (!st.cause || s.board.some((q) => q.route === id)) return;
  const q = makeChasse(s, c.route, st.cause, undefined, 'villageois');
  if (!q) return;
  q.route = id;
  q.client = c.conseil;
  q.reward = Math.round(q.reward * V().coupure.recompense);
  q.title = `Rouvrir la route de ${c.nom} : ${q.count} ${SPECIES[st.cause].pluriel} ${ZONES[c.route].lieu}`;
  q.expires = s.tick + V().coupure.expirationJours * H;
  s.board.push(q);
}

/** La route rouvre : par la guilde, une rivale ou la milice de la ville. */
export function reopenRoute(s: GameState, id: string, by: string | null): void {
  const st = cityState(s, id);
  if (st.coupeeDepuis === null) return;
  const c = CITIES[id];
  st.coupeeDepuis = null;
  st.cause = undefined;
  // Une équipe déjà en route garde son contrat : le conseil la paiera quand même.
  s.board = s.board.filter((q) => q.route !== id || q.reservedBy !== null || q.teams.length > 0);
  if (by === null) {
    addRenown(s, V().coupure.renommee);
    shiftCommerce(s, id, V().coupure.commerce);
    news(s, 'une', `La guilde a rouvert la route de ${c.nom} : les convois repartent.`);
    log(s, 'monde', 'important', `La route de ${c.nom} est rouverte grâce à la guilde (renommée +${V().coupure.renommee}, commerce +${V().coupure.commerce}).`);
  } else {
    news(s, 'une', `${by} a rouvert la route de ${c.nom}.`);
    log(s, 'monde', 'info', `${by} a rouvert la route de ${c.nom}.`);
  }
}

/** Une quête de réouverture menée à bien par la guilde. */
export function onRouteQuestDone(s: GameState, q: Quest, ok: boolean): void {
  if (q.route && ok) reopenRoute(s, q.route, null);
}

export function dailyCities(s: GameState): void {
  const Cp = V().coupure;
  for (const id of CITY_IDS) {
    const st = cityState(s, id);
    if (st.coupeeDepuis !== null) {
      st.commerce = clamp(st.commerce - V().commerceCoupeeJour, 0, 100);
      if (s.tick - st.coupeeDepuis >= Cp.dureeMax * H) reopenRoute(s, id, `La milice de ${CITIES[id].court}`);
      else postRouteQuest(s, id);   // la quête est republiée si elle a expiré
    } else st.commerce = clamp(st.commerce * (1 - V().commerceErosion), 0, 100);   // sans convois, le commerce s'étiole
  }
  const anyCut = CITY_IDS.some((id) => !routeOpen(s, id));
  if (!anyCut && s.tick - (s.world.lastCut ?? 0) >= Cp.intervalleJours * H && chance(s, 'monde', Cp.chanceJour)) {
    cutRoute(s, pick(s, 'monde', CITY_IDS));
  }
}
