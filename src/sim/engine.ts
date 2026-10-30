// Le moteur : création d'une partie, boucle de simulation (GDD 8.2) et commandes du joueur.
import { createAdventurer } from './adventurers';
import { stepAdventurers } from './ai';
import { DENREES, P, REMEDES } from './data';
import { bedRef, buildingValue, careRef, clamp, cotisationRef, defaultPrices, dishRef, placeOrder, saleRef, sessionRef, syncDifficulty } from './economy';
import { dayOf, hourOf, money, weekdayOf } from './format';
import { buyRemedy, craftHour, gardenHarvest, remedyRestock } from './infirmary';
import { closeDay, log, newDay, spend } from './journal';
import {
  acceptCandidate, dailyAdventurers, weekPriceRatio, evaluateDepartures, excludeAdventurer, expireCandidates, hourlyHealth, refuseCandidate,
  retain, spawnCandidates,
} from './lifecycle';
import {
  acceptContract, ageLots, autoSell, dailyContracts, dailyMarket, deliverContract, generateContractOffers, initMarket, sellResserreLot,
} from './market';
import { dailyPopulations, initPopulations, regionalDanger } from './populations';
import { addBonus, createPrime, expireQuests, formTeams, generateQuests, relinkRuns, stepRuns } from './quests';
import progression from './data/progression.json';
import { borrow, diff, gaspardAck, hourlyLegend, initLegend, morningLegend, pickForPantheon, repay, setDifficulty, weeklyRenown } from './legend';
import { modMult } from './mods';
import { range, seedStreams } from './rng';
import { addRival, decide, hourlyWorld, initWorld, morningWorld, repairRoom } from './world';
import { buyModule, hourlyRooms, morningRooms, repairFurniture, restockCheck, setBeds, startUpgrade } from './rooms';
import { checkTeams, eveningSocial } from './social';
import { createStaff, fire, hire, payrollAndProgress, renewStaffCandidates } from './staff';
import { createProf, dailyProfOffers, fireProf, hireProf, profPayroll } from './training';
import { dailyRanks, organizeExam } from './ranks';
import { rangForLevel } from './adventurers';
import { buyWork } from './charter';
import { giftRival, pactRival } from './diplomacy';
import { sendCaravan } from './cities';
import type { BedType, ClassId, Command, DifficultyId, DishId, GameState, LogEntry, RemedeId } from './types';

export interface NewGameOptions {
  seed: number; mode?: 'classique' | 'chronique'; startHour?: number;
  difficulty?: DifficultyId; pantheonNames?: string[];
}

const zeroRemedes = () => Object.fromEntries(Object.keys(REMEDES).map((k) => [k, 0])) as Record<RemedeId, number>;

/** Version du format de sauvegarde. Les sauvegardes depuis MIN_SAVE_VERSION sont converties au chargement. */
export const SAVE_VERSION = 6;
export const MIN_SAVE_VERSION = 4;

/** Convertit une sauvegarde d'une version précédente (v4 : prix en curseurs autour d'une référence). */
export function migrateSave(s: GameState): GameState {
  const old = s as unknown as Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
  if (s.version === 4) {
    // La cuisine devient une salle à part (v1.1) : elle reprend le niveau du réfectoire, pour garder les mêmes plats.
    s.cuisine = { level: s.refectoire.level, works: null };
    // Une troisième guilde rivale ouvre ses portes (v1.1).
    if (!s.world.rivals.some((r) => r.profil === 'chasseurs')) addRival(s, 'chene', 'La Confrérie du Chêne', 'chasseurs', 25);
    const cur = (v: number | undefined) => v ?? 1;
    // Prix fixés directement (v1.1) : on garde le prix affiché au moment de la sauvegarde.
    s.dortoirs.prix = {} as GameState['dortoirs']['prix'];
    for (const b of Object.keys(old.dortoirs.curseurs ?? {}) as BedType[]) s.dortoirs.prix[b] = Math.max(1, Math.round(bedRef(s, b) * cur(old.dortoirs.curseurs[b])));
    s.refectoire.prix = {} as GameState['refectoire']['prix'];
    for (const d of Object.keys(old.refectoire.curseurs ?? {}) as DishId[]) s.refectoire.prix[d] = Math.max(1, Math.round(dishRef(s, d) * cur(old.refectoire.curseurs[d])));
    s.infirmerie.prixSoins = Math.max(1, Math.round(careRef(s, 'plaie', 1) * cur(old.infirmerie.curseurSoins)));
    s.infirmerie.prixVente = Math.max(1, Math.round(saleRef(s, 'potion') * cur(old.infirmerie.curseurVente)));
    s.terrain.prixLibre = Math.max(1, Math.round(sessionRef(s, null) * cur(old.terrain.libreCurseur)));
    for (const p of [...s.terrain.profs, ...s.profCandidates]) p.prix = Math.max(1, Math.round(sessionRef(s, p) * cur((p as unknown as { curseur?: number }).curseur)));
    s.cotisationPrix = Math.max(1, Math.round(cotisationRef(s) * cur(old.cotisationCurseur)));
    delete old.dortoirs.curseurs; delete old.refectoire.curseurs; delete old.infirmerie.curseurSoins; delete old.infirmerie.curseurVente;
    delete old.terrain.libreCurseur; delete old.cotisationCurseur;
    s.version = 5;
  }
  if (s.version === 5) {
    // Insignes de rang (v1.1) : chacun garde le rang de son niveau.
    for (const a of [...s.adventurers, ...s.doorCandidates]) {
      a.rang = rangForLevel(a.level); a.rankQuests = 0; a.griefRang = 0;
    }
    s.version = 6;
  }
  return s;
}

export function createGame(o: NewGameOptions): GameState {
  // En mode Chronique, l'horloge du jeu suit l'heure locale du joueur (0.5).
  const startTick = o.mode === 'chronique' && o.startHour !== undefined ? o.startHour : P.temps.heureDepart;
  const s: GameState = {
    version: SAVE_VERSION,
    seed: o.seed,
    rng: seedStreams(o.seed),
    tick: startTick,
    nextId: 1,
    mode: o.mode ?? 'classique',
    treasury: progression.difficultes[o.difficulty ?? 'normal'].tresorerie,
    debtDays: 0,
    gameOver: null,
    prosperity: P.economie.prosperiteDepart,
    danger: P.economie.dangerDepart,
    rank: 1,
    taxRate: P.comptoir.tauxDefaut,
    exemptBeginners: false,
    exemptAide: false,
    cotisationPrix: 0,
    dortoirs: {
      level: 1, works: null,
      beds: { paillasse: 12, commun: 0, individuelle: 0, suite: 0 }, pendingBeds: null,
      proprete: 70,
      prix: { paillasse: 0, commun: 0, individuelle: 0, suite: 0 },
    },
    refectoire: {
      level: 1, works: null,
      menu: ['gruau', 'ragout'],
      prix: { gruau: 0, ragout: 0, roti: 0, festin: 0, biere: 0, vin: 0, panier: 0 },
      pantry: [
        { denree: 'cereales', qty: 60, fresh: 1 },
        { denree: 'legumes', qty: 30, fresh: 1 },
        { denree: 'viande', qty: 20, fresh: 1 },
      ],
      portionsReady: 0,
      queue: [],
      damage: 0,
    },
    cuisine: { level: 1, works: null },
    infirmerie: {
      level: 0, works: null, remedes: zeroRemedes(), prixSoins: 0, prixVente: 0,
      queue: [], craftedToday: 0, autoCraft: {}, restock: {}, treatedThisHour: 0,
    },
    terrain: { level: 0, works: null, profs: [], prixLibre: 0 },
    modules: [],
    memorial: [],
    restock: {
      cereales: { enabled: true, seuil: 30, qty: 60 },
      legumes: { enabled: true, seuil: 15, qty: 25 },
      viande: { enabled: true, seuil: 15, qty: 20 },
      biere: { enabled: false, seuil: 20, qty: 40 },
      epices: { enabled: false, seuil: 10, qty: 20 },
      vin: { enabled: false, seuil: 10, qty: 20 },
      monstre: { enabled: false, seuil: 0, qty: 0 },
    },
    orders: [],
    staff: [],
    staffCandidates: [],
    profCandidates: [],
    adventurers: [],
    departed: [],
    doorCandidates: [],
    board: [],
    runs: [],
    teams: [],
    relations: {},
    resserre: [],
    market: {},
    buyers: { tanneur: 20, alchimiste: 20, forgeron: 20, halle: 20, collectionneur: 0 },
    contracts: [],
    contractOffers: [],
    populations: {},
    policy: {
      credit: false,
      creditCap: P.infirmerie.creditCapDefaut,
      sanction: 'amende',
      rachatCurseur: P.marche.rachatDefaut,
      rachatRules: [],
      autoSell: 'off',
      autoAccept: { enabled: false, minLevel: 2, refuseMalhonnete: true },
      reserve: 0,
    },
    fraud: { detected: 0, fines: 0, reductionUntil: 0, reduction: 0 },
    renown: P.monde.renommeeDepart,
    world: undefined as unknown as GameState['world'],
    chronicle: null,
    difficulty: undefined as unknown as GameState['difficulty'],
    legend: undefined as unknown as GameState['legend'],
    gaspard: undefined as unknown as GameState['gaspard'],
    loans: undefined as unknown as GameState['loans'],
    book: undefined as unknown as GameState['book'],
    pantheonNames: [],
    competitorFluct: 1,
    ledger: [],
    today: newDay(dayOf(startTick), progression.difficultes[o.difficulty ?? 'normal'].tresorerie),
    weekRevenue: 0,
    journal: [],
    stats: {
      deaths: 0, departures: 0, recruits: 0, questsOk: 0, questsFail: 0,
      services: {}, window: { served: 0, revenue: 0, waited: 0 }, priceRatios: [],
    },
  };

  initLegend(s, o.difficulty ?? 'normal', o.pantheonNames ?? []);
  s.staff.push(createStaff(s, 'cuisinier', 30));
  s.staff.push(createStaff(s, 'valet', 25));
  if (s.mode === 'chronique') s.staff.push(createStaff(s, 'intendant', 30));
  renewStaffCandidates(s);
  for (let i = 0; i < P.terrain.offresDepart; i++) {
    const p = createProf(s, i === 0 ? 'maitre_armes' : undefined);
    p.offerUntil = startTick + 14 * 24;
    p.ego = 1;
    s.profCandidates.push(p);
  }

  const roster: [ClassId, number, number][] = [
    ['guerrier', 1, 4], ['guerrier', 1, 4], ['guerrier', 1, 4],
    ['rodeur', 1, 3], ['rodeur', 1, 3],
    ['voleur', 1, 3], ['voleur', 1, 3],
    ['mage', 1, 2],
    ['clerc', 1, 3], ['clerc', 1, 3],
  ];
  for (const [classe, lo, hi] of roster) {
    const level = lo + Math.floor(range(s, 'aventuriers', 0, hi - lo + 1));
    s.adventurers.push(createAdventurer(s, { classe, level: Math.min(level, hi), goldMin: P.aventuriers.orDepartMin, goldMax: P.aventuriers.orDepartMax }));
  }
  if (!s.adventurers.some((a) => a.traits.includes('sociable'))) {
    const a = s.adventurers[0];
    a.traits = a.traits[1] === 'solitaire' ? ['sociable', 'ambitieux'] : ['sociable', a.traits[1]];
  }

  initMarket(s);
  initPopulations(s);
  initWorld(s);
  s.danger = regionalDanger(s);
  defaultPrices(s);
  for (const p of s.profCandidates) p.prix = sessionRef(s, p);
  generateQuests(s, true);
  generateContractOffers(s);
  log(s, 'guilde', 'important', 'Vous prenez la tête de la guilde. Dix aventuriers comptent sur vous pour les loger et les nourrir.');
  return s;
}

// ---------- Moments clés de la journée ----------

function midnight(s: GameState): void {
  payrollAndProgress(s);
  dailyRanks(s);
  profPayroll(s);
  const closing = s.tick - 1;
  if (weekdayOf(closing) === P.temps.jourDuRoi) {
    const entretien = Math.round(P.economie.entretienTauxHebdo * buildingValue(s));
    const taxe = Math.round((P.economie.taxeRoyaleBase + P.economie.taxeRoyaleTaux * s.weekRevenue) * (1 + 0.5 * (s.rank - 1)) * modMult(s, 'taxe_royale'));
    weeklyRenown(s, weekPriceRatio(s));
    spend(s, 'entretien', entretien);
    spend(s, 'taxeRoyale', taxe);
    log(s, 'economie', 'important', `Jour du Roi : taxe royale ${money(taxe)}, entretien ${money(entretien)}.`);
    s.weekRevenue = 0;
    s.stats.priceRatios = [];
  }
  if (s.treasury < 0) {
    s.debtDays += 1;
    const left = diff(s).faillite - s.debtDays;
    if (left <= 0) {
      s.gameOver = { tick: s.tick, reason: 'La Couronne saisit le siège : la guilde est restée endettée trop longtemps.' };
      log(s, 'guilde', 'critique', s.gameOver.reason);
    } else {
      log(s, 'guilde', 'critique', `La guilde est endettée (${money(s.treasury)}). Saisie dans ${left} jour${left > 1 ? 's' : ''} si rien ne change.`);
    }
  } else {
    s.debtDays = 0;
  }
  closeDay(s);
  s.stats.services = {};
  s.refectoire.eatenYesterday = s.refectoire.eaten ?? {};
  s.refectoire.eaten = {};
  s.refectoire.ranOutYesterday = s.refectoire.ranOut ?? [];
  s.refectoire.ranOut = [];
}

function morning(s: GameState): void {
  if (weekdayOf(s.tick) === 1) {
    renewStaffCandidates(s);
    s.competitorFluct = range(s, 'monde', 0.9, 1.1);
    generateContractOffers(s);
  }
  morningRooms(s);
  dailyMarket(s);
  dailyPopulations(s);
  morningWorld(s);
  morningLegend(s);
  s.resserre = ageLots(s, s.resserre);
  gardenHarvest(s);
  dailyContracts(s);
  autoSell(s);
  expireQuests(s);
  generateQuests(s);
  dailyAdventurers(s);
  checkTeams(s);
  dailyProfOffers(s);
  spawnCandidates(s);
  s.infirmerie.craftedToday = 0;
}

/** Avance la simulation d'une heure. */
export function step(s: GameState): void {
  if (s.gameOver) return;
  relinkRuns(s);
  syncDifficulty(s);
  s.tick += 1;
  const h = hourOf(s.tick);
  if (h === 0) midnight(s);
  if (s.gameOver) return;
  if (h === 6) morning(s);
  hourlyWorld(s);
  hourlyLegend(s);
  hourlyRooms(s);
  if (h === 10 || h === 17) { restockCheck(s); remedyRestock(s); }
  craftHour(s, h);
  hourlyHealth(s);
  stepRuns(s);
  stepAdventurers(s);
  eveningSocial(s);
  if (h === P.aventuriers.heureFormationEquipes) formTeams(s);
  if (h === P.aventuriers.heureEvaluationDepart) evaluateDepartures(s);
  expireCandidates(s);
}

export function stepDays(s: GameState, days: number): void {
  for (let i = 0; i < days * 24 && !s.gameOver; i++) step(s);
}

// ---------- Commandes du joueur ----------

/** Prix saisi par le joueur : au moins 1 pc. */
const prix = (v: number) => clamp(Math.round(v), 1, 10_000_000);

/** Applique une commande. Renvoie un message d'erreur éventuel, à afficher au joueur. */
export function applyCommand(s: GameState, c: Command): string | null {
  switch (c.type) {
    case 'setBedPrix': s.dortoirs.prix[c.bed] = prix(c.price); break;
    case 'setDishPrix': s.refectoire.prix[c.dish] = prix(c.price); break;
    case 'setMenu': s.refectoire.menu = [...c.menu]; break;
    case 'setBeds': setBeds(s, c.beds); break;
    case 'upgradeRoom': startUpgrade(s, c.room); break;
    case 'buyModule': buyModule(s, c.id); break;
    case 'orderFood': {
      const got = placeOrder(s, c.denree, c.qty);
      if (got > 0) log(s, 'economie', 'info', `Commande passée : ${got} ${DENREES[c.denree].nom.toLowerCase()}.`);
      break;
    }
    case 'setRestock': s.restock[c.denree] = { ...c.rule }; break;
    case 'hireStaff': hire(s, c.id); break;
    case 'fireStaff': fire(s, c.id); break;
    case 'hireProf': hireProf(s, c.id); break;
    case 'fireProf': fireProf(s, c.id); break;
    case 'setProfSlot': { const p = s.terrain.profs.find((x) => x.id === c.id); if (p) p.slots[c.slot] = c.open; break; }
    case 'setProfPrix': { const p = s.terrain.profs.find((x) => x.id === c.id); if (p) p.prix = prix(c.price); break; }
    case 'setLibrePrix': s.terrain.prixLibre = prix(c.price); break;
    case 'acceptCandidate': acceptCandidate(s, c.id); break;
    case 'refuseCandidate': refuseCandidate(s, c.id); break;
    case 'excludeAdventurer': excludeAdventurer(s, c.id); break;
    case 'retain': retain(s, c.id, c.kind, c.amount); break;
    case 'setCreditCap': { const a = s.adventurers.find((x) => x.id === c.id); if (a) a.creditCap = c.cap; break; }
    case 'setTaxRate': s.taxRate = clamp(Math.round(c.value * 100) / 100, 0, P.comptoir.tauxMax); break;
    case 'setExemptions': s.exemptBeginners = c.beginners; s.exemptAide = c.aide; break;
    case 'setCotisation': s.cotisationPrix = prix(c.price); break;
    case 'sellLoot': {
      if (c.index === 'all') while (s.resserre.length) sellResserreLot(s, 0);
      else sellResserreLot(s, c.index);
      break;
    }
    case 'setAutoSell': s.policy.autoSell = c.mode; break;
    case 'setCourtierRachat': s.policy.courtierRachat = c.enabled; break;
    case 'setRachat': s.policy.rachatCurseur = clamp(Math.round(c.curseur * 20) / 20, 0.7, 1); s.policy.rachatRules = c.rules.map((r) => ({ ...r })); break;
    case 'setSanction': s.policy.sanction = c.value; break;
    case 'setCredit': s.policy.credit = c.enabled; s.policy.creditCap = Math.max(0, c.cap); break;
    case 'setAutoAccept': s.policy.autoAccept = { ...c.rule }; break;
    case 'setReserve': s.policy.reserve = Math.max(0, c.value); break;
    case 'buyRemede': {
      const got = buyRemedy(s, c.remede, c.qty);
      if (got > 0) log(s, 'economie', 'info', `Achat de ${got} ${REMEDES[c.remede].nom.toLowerCase()}.`);
      break;
    }
    case 'setRemedeRestock': s.infirmerie.restock[c.remede] = { ...c.rule }; break;
    case 'setInfirmeriePrix':
      if (c.kind === 'soins') s.infirmerie.prixSoins = prix(c.price); else s.infirmerie.prixVente = prix(c.price);
      break;
    case 'queueRecipe': for (let i = 0; i < clamp(c.times, 1, 20); i++) s.infirmerie.queue.push(c.recipe); break;
    case 'setAutoCraft': s.infirmerie.autoCraft[c.remede] = Math.max(0, c.min); break;
    case 'createPrime': return createPrime(s, c.questType, c.zone, c.target, c.count, c.reward, c.days);
    case 'addBonus': return addBonus(s, c.questId, c.amount);
    case 'acceptContract': acceptContract(s, c.id); break;
    case 'deliverContract': deliverContract(s, c.id); break;
    case 'repairFurniture': repairFurniture(s); break;
    case 'decide': return decide(s, c.id, c.option);
    case 'repairRoom': return repairRoom(s, c.room);
    case 'borrow': return borrow(s, c.lender, c.amount);
    case 'repay': return repay(s, c.lender, c.amount);
    case 'setDifficulty': setDifficulty(s, c.id); break;
    case 'setGaspard': s.gaspard.mode = c.mode; break;
    case 'organizeExam': return organizeExam(s, c.id, c.offered);
    case 'buyWork': return buyWork(s, c.id);
    case 'giftRival': return giftRival(s, c.id);
    case 'pactRival': return pactRival(s, c.id);
    case 'sendCaravan': return sendCaravan(s, c.ville, c.res, c.fee);
    case 'gaspardAck': gaspardAck(s, c.id); break;
    case 'pantheonPick': return pickForPantheon(s, c.id);
    case 'ackEpilogue': s.legend.epilogueSeen = true; s.legend.defeatSeen = true; break;
  }
  return null;
}

/** Empreinte de l'état, pour les tests de déterminisme. */
export function stateHash(s: GameState): string {
  const str = JSON.stringify(s);
  let h1 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h1 ^= str.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(16);
}

// ---------- Mode Chronique : rattrapage et rapport d'absence (8.6) ----------

export interface AbsenceReport {
  hours: number;              // heures rattrapées
  slept: number;              // heures perdues au-delà du plafond (guilde en sommeil)
  treasuryBefore: number;
  treasuryAfter: number;
  recruits: number;
  departures: number;
  deaths: number;
  entries: LogEntry[];        // faits Importants et Critiques de l'absence
}

/**
 * Rattrape `hours` heures de jeu en accéléré, sans affichage, plafonnées à 7 jours.
 * Au-delà, la guilde est restée « en sommeil » : le temps excédentaire est perdu.
 */
export function catchUp(s: GameState, hours: number): AbsenceReport {
  const max = 168;
  const run = Math.max(0, Math.min(hours, max));
  const before = { treasury: s.treasury, recruits: s.stats.recruits, departures: s.stats.departures, deaths: s.stats.deaths, tick: s.tick };
  for (let i = 0; i < run && !s.gameOver; i++) step(s);
  return {
    hours: run,
    slept: Math.max(0, hours - max),
    treasuryBefore: before.treasury,
    treasuryAfter: s.treasury,
    recruits: s.stats.recruits - before.recruits,
    departures: s.stats.departures - before.departures,
    deaths: s.stats.deaths - before.deaths,
    entries: s.journal.filter((e) => e.tick > before.tick && (e.lvl === 'important' || e.lvl === 'critique')),
  };
}
