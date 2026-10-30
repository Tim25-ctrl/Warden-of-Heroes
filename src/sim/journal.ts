// Journal de bord, pensées et comptabilité.
import type { Adventurer, GameState, LogCat, LogLvl, Money } from './types';
import { dayOf } from './format';

const JOURNAL_MAX = 2000;
const THOUGHTS_MAX = 20;

export function log(s: GameState, cat: LogCat, lvl: LogLvl, text: string): void {
  s.journal.push({ id: s.nextId++, tick: s.tick, cat, lvl, text });
  if (s.journal.length > JOURNAL_MAX) s.journal.splice(0, s.journal.length - JOURNAL_MAX);
}

/** Une pensée d'aventurier : gardée dans sa fiche, et copiée au niveau Détail du journal. */
export function think(s: GameState, a: Adventurer, text: string, lvl: LogLvl = 'detail'): void {
  a.thoughts.push({ tick: s.tick, text });
  if (a.thoughts.length > THOUGHTS_MAX) a.thoughts.splice(0, a.thoughts.length - THOUGHTS_MAX);
  log(s, 'aventuriers', lvl, `[[a:${a.id}|${a.name}]] : « ${text} »`);
}

/** Compteur de diagnostic des flux d'or des aventuriers (simulateur seulement, hors état de partie). */
export const FLOWS: Record<string, number> = {};
export function flow(key: string, v: number): void {
  FLOWS[key] = (FLOWS[key] ?? 0) + v;
}

export function newDay(day: number, treasury: Money) {
  return { day, recettes: {}, depenses: {}, tresorerieFin: treasury };
}

export function earn(s: GameState, key: string, v: Money): void {
  if (v === 0) return;
  s.treasury += v;
  s.today.recettes[key] = (s.today.recettes[key] ?? 0) + v;
  s.weekRevenue += v;
}

export function spend(s: GameState, key: string, v: Money): void {
  if (v === 0) return;
  s.treasury -= v;
  s.today.depenses[key] = (s.today.depenses[key] ?? 0) + v;
}

export function closeDay(s: GameState): void {
  s.today.tresorerieFin = s.treasury;
  s.ledger.push(s.today);
  if (s.ledger.length > 400) s.ledger.splice(0, s.ledger.length - 400);
  s.today = newDay(dayOf(s.tick), s.treasury);
}

export const LEDGER_LABELS: Record<string, string> = {
  nuitees: 'Nuitées',
  repas: 'Repas',
  boissons: 'Boissons',
  paniers: 'Paniers de route',
  taxe: 'Taxe de la guilde',
  ventes: 'Ventes de dépouilles',
  cotisations: "Cotisations d'inscription",
  droitsEpreuve: "Droits d'épreuve",
  legs: 'Legs',
  salaires: 'Salaires',
  denrees: 'Achats de denrées',
  travaux: 'Travaux',
  entretien: 'Entretien',
  taxeRoyale: 'Taxe royale',
  reconfig: 'Réaménagement des lits',
  indemnites: 'Indemnités de licenciement',
  soins: 'Soins',
  ventesInfirmerie: "Ventes de l'infirmerie",
  entrainement: "Séances d'entraînement",
  contrats: 'Contrats',
  amendes: 'Amendes pour fraude',
  creditRembourse: 'Soins à crédit remboursés',
  primesRendues: 'Primes non réclamées',
  primes: 'Primes et bonus',
  rachats: 'Rachats de dépouilles',
  remedes: 'Achats de remèdes',
  professeurs: 'Salaires des professeurs',
  retention: 'Offres de rétention',
  evenements: 'Événements',
  amendesRoyales: 'Amendes royales',
  primeCouronne: 'Prime de la Couronne',
  oeuvres: 'Œuvres pour la ville',
  diplomatie: 'Cadeaux et pactes',
  tournoi: 'Tournoi des insignes',
  caravanes: 'Caravanes de la guilde',
  arene: "Recettes de l'Arène",
  emprunts: 'Emprunts',
  remboursements: 'Remboursements de prêts',
};
