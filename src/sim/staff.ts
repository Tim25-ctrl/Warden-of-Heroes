// Personnel de la guilde (GDD 1.4).
import { takenNames } from './adventurers';
import { NAMES, P, ROLES } from './data';
import { clamp } from './economy';
import { log, spend } from './journal';
import { pick, rand, randInt } from './rng';
import type { GameState, Money, StaffMember, StaffRole } from './types';

export const STAFF_TRAITS: Record<string, string> = {
  travailleur: 'Travailleur : capacité +20 %',
  talentueux: 'Talentueux : progresse deux fois plus vite',
  charmeur: 'Charmeur : moral +2 pour les clients servis',
  grincheux: 'Grincheux : moral −2 pour les clients, mais compétence +10',
  econome: 'Économe : consommation de stock −10 %',
  fragile: "Fragile : 5 % de risque d'absence chaque jour",
};

export const ROLE_HELP: Record<StaffRole, string> = {
  cuisinier: 'Prépare 6 + compétence / 10 portions par heure. Sa compétence fait la qualité des plats (ragoût : 20, rôti : 40).',
  commis: 'Ajoute 4 portions par heure en cuisine.',
  valet: 'Entretient 15 places de dortoir. Sans lui, la propreté et la qualité des dortoirs baissent.',
  soigneur: 'Soigne un patient par heure à l\'infirmerie. Sa compétence fait la chance de succès.',
  apothicaire: 'Fabrique les remèdes à partir des dépouilles et des plantes (infirmerie niveau 3).',
  intendant: 'Exécute les consignes sans erreur et obtient 5 à 15 % de remise sur les achats. Un seul.',
  inspecteur: 'Contrôle le butin déclaré au comptoir : détecte la fraude (20 aventuriers chacun).',
  courtier: "Revend l'entrepôt sans frais (+5 à 10 % selon sa compétence), attend un bon cours, décroche un contrat de plus par semaine et peut racheter les dépouilles pour les revendre. Un seul.",
  greffier: 'Tient le tableau des quêtes : estime le danger sans erreur, écarte les quêtes hors de portée, 2 places de plus au tableau. Un seul.',
};

export function salaryOf(m: StaffMember): Money {
  return Math.round(ROLES[m.role].salaire * Math.pow(m.c / 50, P.personnel.exposantSalaire));
}

export function capOf(m: StaffMember): number {
  return P.personnel.plafondsPotentiel[m.potentiel - 1];
}

export function createStaff(s: GameState, role: StaffRole, c?: number): StaffMember {
  const potentiel = randInt(s, 'personnel', 1, 5);
  const trait = rand(s, 'personnel') < 0.5 ? pick(s, 'personnel', Object.keys(STAFF_TRAITS)) : null;
  const taken = takenNames(s);
  let name = pick(s, 'noms', NAMES.prenoms);
  if (taken.has(name)) name = `${name} ${pick(s, 'noms', NAMES.surnoms)}`;
  let comp = c ?? randInt(s, 'personnel', 15, 55);
  if (trait === 'grincheux') comp += 10;
  return {
    id: s.nextId++, name, role, c: clamp(comp, 1, 100), potentiel, trait,
    loyalty: P.personnel.loyauteDepart, daysWorked: 0, unpaidDays: 0, hiredTick: s.tick,
  };
}

/** Le vivier de candidats se renouvelle chaque lundi (1.4.3). */
export function renewStaffCandidates(s: GameState): void {
  s.staffCandidates = [];
  const roles: StaffRole[] = ['cuisinier', 'commis', 'valet', 'soigneur', 'inspecteur'];
  if (s.infirmerie.level >= 2) roles.push('apothicaire');
  for (const r of ['intendant', 'courtier', 'greffier'] as const) if (!s.staff.some((m) => m.role === r)) roles.push(r);
  for (const role of roles) {
    const n = ROLES[role].unique || role === 'inspecteur' || role === 'apothicaire' ? 1 : randInt(s, 'personnel', 1, 2);
    for (let i = 0; i < n; i++) s.staffCandidates.push(createStaff(s, role));
  }
}

export function canHire(s: GameState, m: StaffMember): string | null {
  if (ROLES[m.role].unique && s.staff.some((x) => x.role === m.role)) return `Un seul ${ROLES[m.role].nom.toLowerCase()} à la fois.`;
  if (m.role === 'apothicaire' && s.infirmerie.level < 3) return 'Il faut une infirmerie de niveau 3.';
  return null;
}

export function hire(s: GameState, id: number): boolean {
  const i = s.staffCandidates.findIndex((m) => m.id === id);
  if (i < 0 || canHire(s, s.staffCandidates[i])) return false;
  const m = s.staffCandidates[i];
  s.staffCandidates.splice(i, 1);
  m.hiredTick = s.tick;
  s.staff.push(m);
  log(s, 'guilde', 'info', `${m.name} est engagé comme ${ROLES[m.role].nom.toLowerCase()} (compétence ${m.c}).`);
  return true;
}

export function fire(s: GameState, id: number): boolean {
  const i = s.staff.findIndex((m) => m.id === id);
  if (i < 0) return false;
  const m = s.staff[i];
  spend(s, 'indemnites', salaryOf(m) * P.personnel.indemniteJours);
  s.staff.splice(i, 1);
  log(s, 'guilde', 'info', `${m.name} (${ROLES[m.role].nom.toLowerCase()}) est licencié.`);
  return true;
}

/** Paie à minuit, progression et démissions (1.4.3). */
export function payrollAndProgress(s: GameState): void {
  const leaving: number[] = [];
  for (const m of s.staff) {
    const sal = salaryOf(m);
    if (s.treasury >= 0) {
      spend(s, 'salaires', sal);
      m.unpaidDays = 0;
    } else {
      m.unpaidDays += 1;
      m.loyalty = clamp(m.loyalty - 10, 0, 100);
      log(s, 'guilde', 'important', `${m.name} n'a pas été payé (${m.unpaidDays} jour${m.unpaidDays > 1 ? 's' : ''}).`);
    }
    m.daysWorked += 1;
    const every = m.trait === 'talentueux' ? Math.ceil(P.personnel.joursParProgression / 2) : P.personnel.joursParProgression;
    if (m.daysWorked % every === 0 && m.c < capOf(m)) m.c += 1;
    if (m.unpaidDays > P.personnel.joursImpayesMax) leaving.push(m.id);
    else if (m.loyalty < P.personnel.seuilDemission && rand(s, 'personnel') < P.personnel.chanceDemission) leaving.push(m.id);
  }
  for (const id of leaving) {
    const i = s.staff.findIndex((m) => m.id === id);
    const m = s.staff[i];
    s.staff.splice(i, 1);
    log(s, 'guilde', 'important', `${m.name} (${ROLES[m.role].nom.toLowerCase()}) démissionne.`);
  }
}
