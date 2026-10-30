// Fonctionnement des salles : construction, travaux, améliorations, cuisine, livraisons, consignes (GDD 1.2 à 1.10).
import { BEDS, DENREES, DORM_LEVELS, INF_LEVELS, KITCHEN_LEVELS, MESS_LEVELS, MODULES, P, RESOURCES, SERVICES, TERRAIN_LEVELS } from './data';
import { freshLoss, isAbsent, kitchenRate, orderCost, pendingOf, placeOrder, stockOf } from './economy';
import { hourOf, money } from './format';
import { log, spend } from './journal';
import type { BedType, DenreeId, GameState, RoomId } from './types';

export const ROOM_NAMES: Record<RoomId, string> = {
  dortoirs: 'les dortoirs', refectoire: 'le réfectoire', cuisine: 'la cuisine', infirmerie: "l'infirmerie", terrain: "le terrain d'entraînement",
};

export function dormPlacesUsed(beds: Record<BedType, number>): number {
  return (Object.keys(beds) as BedType[]).reduce((a, b) => a + beds[b] * BEDS[b].places, 0);
}

function levelsOf(room: RoomId): { niveau: number; cout: number }[] {
  return room === 'dortoirs' ? DORM_LEVELS : room === 'refectoire' ? MESS_LEVELS : room === 'cuisine' ? KITCHEN_LEVELS : room === 'infirmerie' ? INF_LEVELS : TERRAIN_LEVELS;
}

/** Les niveaux 4 et 5 demandent un Sceau (6.2) : d'Argent pour le niveau 4, d'Or pour le niveau 5. */
export function upgradeLock(s: GameState, room: RoomId): string | null {
  const next = levelsOf(room)[s[room].level] as { rang?: number } | undefined;
  if (next?.rang && s.rank < next.rang) return `Exige le ${['', 'Sceau de Cuivre', 'Sceau de Fer', "Sceau d'Argent", "Sceau d'Or", 'Sceau de Mithril'][next.rang]}.`;
  return null;
}

export function upgradeCost(s: GameState, room: RoomId): number | null {
  const next = levelsOf(room)[s[room].level];
  if (!next || upgradeLock(s, room)) return null;
  return next.cout;
}

export function startUpgrade(s: GameState, room: RoomId): boolean {
  const r = s[room];
  const cost = upgradeCost(s, room);
  if (cost === null || r.works || cost > s.treasury) return false;
  const target = r.level + 1;
  spend(s, 'travaux', cost);
  r.works = { targetLevel: target, endTick: s.tick + target * 24 };
  const verb = r.level === 0 ? 'Construction de' : 'Agrandissement de';
  log(s, 'guilde', 'important', `${verb} ${ROOM_NAMES[room]} (niveau ${target}, ${target} jour${target > 1 ? 's' : ''}, ${money(cost)}).${r.level > 0 ? ' Capacité réduite de moitié en attendant.' : ''}`);
  return true;
}

export function moduleBuyable(s: GameState, id: string): string | null {
  const m = MODULES[id];
  if (!m) return 'Inconnu.';
  if (s.modules.includes(id)) return 'Déjà acheté.';
  if (m.requiert && !s.modules.includes(m.requiert)) return `Nécessite : ${MODULES[m.requiert].nom}.`;
  if (m.salle !== 'siege' && s[m.salle].level < Math.max(1, m.niveau)) return `Nécessite ${ROOM_NAMES[m.salle]} au niveau ${Math.max(1, m.niveau)}.`;
  if (m.cout > s.treasury) return 'Trésorerie insuffisante.';
  return null;
}

export function buyModule(s: GameState, id: string): boolean {
  if (moduleBuyable(s, id)) return false;
  const m = MODULES[id];
  spend(s, 'travaux', m.cout);
  s.modules.push(id);
  if (id === 'cave' && !s.refectoire.menu.includes('vin')) s.refectoire.menu.push('vin');
  if (id === 'cave') s.restock.vin = { enabled: true, seuil: 10, qty: 20 };
  log(s, 'guilde', 'info', `Nouvel aménagement : ${m.nom} (${money(m.cout)}).`);
  return true;
}

function finishWorks(s: GameState): void {
  const d = s.dortoirs;
  if (d.works && s.tick >= d.works.endTick) {
    d.level = d.works.targetLevel;
    d.works = null;
    const lvl = DORM_LEVELS[d.level - 1];
    const free = lvl.places - dormPlacesUsed(d.beds);
    const newest = lvl.lits[lvl.lits.length - 1];
    if (free > 0) d.beds[newest] += Math.floor(free / BEDS[newest].places);
    log(s, 'guilde', 'important', `Les dortoirs passent au niveau ${d.level} : ${lvl.places} places, ${BEDS[newest].nom.toLowerCase()} disponible.`);
  }
  const r = s.refectoire;
  if (r.works && s.tick >= r.works.endTick) {
    r.level = r.works.targetLevel;
    r.works = null;
    const lvl = MESS_LEVELS[r.level - 1];
    log(s, 'guilde', 'important', `Le réfectoire passe au niveau ${r.level} : ${lvl.places} places${r.level === 2 ? ', et des soirées de taverne' : ''}.`);
  }
  const k = s.cuisine;
  if (k.works && s.tick >= k.works.endTick) {
    k.level = k.works.targetLevel;
    k.works = null;
    const lvl = KITCHEN_LEVELS[k.level - 1];
    if (k.level >= 2) {
      for (const dish of ['biere', 'panier'] as const) if (!r.menu.includes(dish)) r.menu.push(dish);
      if (!s.restock.biere.enabled) s.restock.biere = { enabled: true, seuil: 20, qty: 40 };
    }
    if (k.level >= 3) s.restock.epices = { enabled: true, seuil: 10, qty: 20 };
    const unlocked = k.level === 2 ? ', bière et paniers de route au menu' : k.level === 3 ? ', le rôti de monstre devient possible' : k.level === 4 ? ', le Festin du Héros devient possible' : k.level === 5 ? ', sa réputation attire les gourmets' : '';
    log(s, 'guilde', 'important', `La cuisine passe au niveau ${k.level} : ${lvl.plats} plats au menu, garde-manger de ${lvl.garde} portions${unlocked}.`);
  }
  for (const room of ['infirmerie', 'terrain'] as const) {
    const x = s[room];
    if (x.works && s.tick >= x.works.endTick) {
      const first = x.level === 0;
      x.level = x.works.targetLevel;
      x.works = null;
      log(s, 'guilde', 'important', first ? `${ROOM_NAMES[room].charAt(0).toUpperCase() + ROOM_NAMES[room].slice(1)} ouvre ses portes.` : `${ROOM_NAMES[room].charAt(0).toUpperCase() + ROOM_NAMES[room].slice(1)} passe au niveau ${x.level}.`);
      if (room === 'infirmerie' && first) {
        s.infirmerie.restock = {
          bandages: { enabled: true, seuil: 5, qty: 10 },
          antidote: { enabled: true, seuil: 2, qty: 3 },
          tisane: { enabled: true, seuil: 2, qty: 3 },
        };
      }
      if (room === 'infirmerie' && x.level === 2) {
        s.infirmerie.restock.potion = { enabled: true, seuil: 3, qty: 4 };
        s.infirmerie.restock.attelle = { enabled: true, seuil: 1, qty: 2 };
        s.infirmerie.restock.baume = { enabled: true, seuil: 1, qty: 2 };
      }
    }
  }
}

export function setBeds(s: GameState, beds: Record<BedType, number>): boolean {
  const lvl = DORM_LEVELS[s.dortoirs.level - 1];
  for (const b of Object.keys(beds) as BedType[]) {
    if (beds[b] < 0 || (beds[b] > 0 && !lvl.lits.includes(b))) return false;
  }
  if (dormPlacesUsed(beds) > lvl.places) return false;
  const current = s.dortoirs.pendingBeds ?? s.dortoirs.beds;
  const changed = (Object.keys(beds) as BedType[]).reduce((a, b) => a + Math.abs(beds[b] - current[b]) * BEDS[b].places, 0);
  const cost = changed * P.tarifs.reconfigParPlace;
  if (cost > s.treasury) return false;
  spend(s, 'reconfig', cost);
  s.dortoirs.pendingBeds = { ...beds };
  log(s, 'guilde', 'info', `Réaménagement des dortoirs commandé (${money(cost)}), effectif demain à 06h.`);
  return true;
}

export function repairFurniture(s: GameState): void {
  if (s.refectoire.damage <= 0) return;
  const cost = Math.ceil(s.refectoire.damage / 5) * 1000;
  if (cost > s.treasury) return;
  spend(s, 'travaux', cost);
  s.refectoire.damage = 0;
  log(s, 'guilde', 'info', `Le mobilier du réfectoire est réparé (${money(cost)}).`);
}

/** La cuisine débite une pièce de viande de monstre de la resserre (1 unité = 4 portions). */
function butcher(s: GameState): void {
  const r = s.refectoire;
  if (s.cuisine.level < 3 || !r.menu.includes('roti') || stockOf(s, 'monstre') >= 8) return;
  const lot = s.resserre.filter((l) => RESOURCES[l.res].categorie === 'viande' && l.quality !== 'ruinee').sort((a, b) => a.fresh - b.fresh)[0];
  if (!lot) return;
  lot.qty -= 1;
  s.resserre = s.resserre.filter((l) => l.qty > 0);
  r.pantry.push({ denree: 'monstre', qty: 4, fresh: lot.fresh, species: lot.res });
}

/** Chaque heure. */
export function hourlyRooms(s: GameState): void {
  finishWorks(s);
  s.infirmerie.treatedThisHour = 0;
  const h = hourOf(s.tick);
  const r = s.refectoire;
  for (const sv of SERVICES) {
    if (h === sv.debut - 1) {
      r.portionsReady = kitchenRate(s);
      s.stats.window = { served: 0, revenue: 0, waited: 0 };
      butcher(s);
    } else if (h >= sv.debut && h < sv.fin) {
      r.portionsReady += kitchenRate(s);
    } else if (h === sv.fin) {
      r.portionsReady = 0;
      const w = s.stats.window;
      if (w.served > 0 || w.waited > 0) {
        log(s, 'economie', 'detail', `${w.served} repas servis au ${sv.nom} (${money(w.revenue)})${w.waited ? `, ${w.waited} aventurier${w.waited > 1 ? 's ont' : ' a'} dû attendre` : ''}.`);
      }
      if (w.waited >= 3) {
        log(s, 'guilde', 'important', `File d'attente au ${sv.nom} : ${w.waited} aventuriers n'ont pas été servis à temps. Il manque des places ou du personnel en cuisine.`);
      }
      s.stats.window = { served: 0, revenue: 0, waited: 0 };
    }
  }
}

/** Chaque matin à 06h. */
export function morningRooms(s: GameState): void {
  const d = s.dortoirs;
  const placesTotal = dormPlacesUsed(d.beds);
  const covered = s.staff.filter((m) => m.role === 'valet' && !isAbsent(s, m)).length * P.personnel.placesParValet;
  const uncovered = Math.max(0, placesTotal - covered);
  d.proprete = Math.max(0, Math.min(100, d.proprete + (uncovered > 0 ? -uncovered : 5)));
  if (uncovered > 0 && d.proprete < 40) log(s, 'guilde', 'important', `Les dortoirs sont sales (propreté ${Math.round(d.proprete)}). Il manque un valet.`);
  if (d.pendingBeds) { d.beds = d.pendingBeds; d.pendingBeds = null; }
  const nuits = s.stats.services.nuitees;
  if (nuits && (nuits.served > 0 || nuits.toCompetitor > 0)) {
    log(s, 'economie', 'detail', `${nuits.served} nuitées vendues (${money(nuits.revenue)})${nuits.toCompetitor ? `, ${nuits.toCompetitor} aventurier${nuits.toCompetitor > 1 ? 's ont' : ' a'} dormi ailleurs` : ''}.`);
  }

  const arrived = s.orders.filter((o) => o.deliverTick <= s.tick);
  s.orders = s.orders.filter((o) => o.deliverTick > s.tick);
  for (const o of arrived) s.refectoire.pantry.push({ denree: o.denree, qty: o.qty, fresh: 1 });
  if (arrived.length) log(s, 'economie', 'detail', `Livraison : ${arrived.map((o) => `${o.qty} ${DENREES[o.denree].nom.toLowerCase()}`).join(', ')}.`);

  const lost: Partial<Record<DenreeId, number>> = {};
  for (const lot of s.refectoire.pantry) {
    lot.fresh -= freshLoss(s, lot.denree, DENREES[lot.denree].conservation);
    if (lot.fresh <= 0) lost[lot.denree] = (lost[lot.denree] ?? 0) + lot.qty;
  }
  s.refectoire.pantry = s.refectoire.pantry.filter((l) => l.fresh > 0 && l.qty > 0);
  const lostList = Object.entries(lost) as [DenreeId, number][];
  if (lostList.length) log(s, 'guilde', 'info', `Ont pourri au garde-manger : ${lostList.map(([k, q]) => `${q} ${DENREES[k].nom.toLowerCase()}`).join(', ')}.`);
  butcher(s);
}

/** Consignes de réapprovisionnement (1.10), vérifiées à 10h et 17h. */
export function restockCheck(s: GameState): void {
  for (const den of Object.keys(s.restock) as DenreeId[]) {
    const rule = s.restock[den];
    if (!rule?.enabled || DENREES[den].interne) continue;
    if (stockOf(s, den) + pendingOf(s, den) >= rule.seuil) continue;
    const got = placeOrder(s, den, rule.qty, true);
    if (got === 0 && orderCost(s, den, rule.qty) > s.treasury - s.policy.reserve) {
      log(s, 'guilde', 'important', `Réapprovisionnement impossible en ${DENREES[den].nom.toLowerCase()} : trésorerie insuffisante (réserve ${money(s.policy.reserve)}).`);
    }
  }
}
