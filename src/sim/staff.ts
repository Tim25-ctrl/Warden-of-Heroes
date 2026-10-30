// Personnel de la guilde (GDD 1.4).
import { takenNames } from './adventurers';
import { NAMES, P, ROLES } from './data';
import { clamp } from './economy';
import { dayOf, money, YEAR_DAYS } from './format';
import { hospitalized } from './infirmary';
import { log, spend } from './journal';
import { cleaningCapacity, cleaningLoads } from './rooms';
import { chance, pick, rand, randInt } from './rng';
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
  valet: "Tient propres les dortoirs, le réfectoire et l'infirmerie : environ 15 places chacun (plus s'il est compétent). Sans assez d'agents, la propreté baisse et la qualité des salles avec elle.",
  soigneur: 'Soigne un patient par heure à l\'infirmerie. Sa compétence fait la chance de succès.',
  apothicaire: 'Fabrique les remèdes à partir des dépouilles et des plantes (infirmerie niveau 3).',
  intendant: 'Exécute les consignes sans erreur et obtient 5 à 15 % de remise sur les achats. Un seul.',
  inspecteur: 'Contrôle le butin déclaré au comptoir : détecte la fraude (20 aventuriers chacun).',
  courtier: "Revend l'entrepôt sans frais (+5 à 10 % selon sa compétence), attend un bon cours, décroche un contrat de plus par semaine et peut racheter les dépouilles pour les revendre. Un seul.",
  greffier: 'Tient le tableau des quêtes : estime le danger sans erreur, écarte les quêtes hors de portée, 2 places de plus au tableau. Un seul.',
};

/** Salaire juste d'un employé : ce que vaut sa compétence sur le marché. */
export function fairSalary(m: StaffMember): Money {
  return Math.round(ROLES[m.role].salaire * Math.pow(m.c / 50, P.personnel.exposantSalaire));
}

/** Salaire versé chaque jour : celui convenu à l'embauche ou à la dernière augmentation (v1.1). */
export function salaryOf(m: StaffMember): Money {
  return m.salaire ?? fairSalary(m);
}

const S = () => P.personnel.satisfaction;

/** Charge de travail d'un employé, de 0 (normale) à 1 (débordé). */
export function staffOverload(s: GameState, m: StaffMember): number {
  if (m.role === 'valet') {
    const load = Object.values(cleaningLoads(s)).reduce((a, b) => a + b, 0);
    const cap = cleaningCapacity(s);
    return cap > 0 ? Math.max(0, Math.min(1, load / cap - 1)) : 1;
  }
  if (m.role === 'soigneur') {
    const n = s.staff.filter((x) => x.role === 'soigneur').length;
    return Math.max(0, Math.min(1, (hospitalized(s) / Math.max(1, n) - 4) / 4));
  }
  return 0;
}

/** Ce qui fait la satisfaction d'un employé, expliqué (v1.1). Sa satisfaction s'en rapproche de 10 % par jour. */
export function satisfactionFactors(s: GameState, m: StaffMember): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [{ label: 'Base', value: S().base }];
  const ratio = salaryOf(m) / Math.max(1, fairSalary(m));
  const pay = Math.round(Math.max(S().salaireMin, Math.min(S().salaireMax, S().salaire * (ratio - 1))));
  out.push({ label: ratio >= 1 ? `Salaire ${Math.round((ratio - 1) * 100)} % au-dessus de ce que vaut sa compétence` : `Salaire ${Math.round((1 - ratio) * 100)} % sous ce que vaut sa compétence`, value: pay });
  const years = (s.tick - m.hiredTick) / 24 / YEAR_DAYS;
  const senior = Math.round(Math.min(S().ancienneteMax, years * S().ancienneteParAn));
  if (senior > 0) out.push({ label: 'Ancienneté dans la guilde', value: senior });
  const over = staffOverload(s, m);
  if (over > 0) out.push({ label: m.role === 'valet' ? "Trop de salles à entretenir pour l'équipe" : 'Trop de patients par soigneur', value: -Math.round(S().surcharge * over) });
  if (m.unpaidDays > 0) out.push({ label: `Salaire impayé (${m.unpaidDays} j)`, value: -15 * m.unpaidDays });
  if (m.raiseAsk) out.push({ label: 'Attend une réponse à sa demande d\'augmentation', value: -5 });
  if (m.trait === 'grincheux') out.push({ label: 'Grincheux de nature', value: -5 });
  return out;
}

export function satisfactionTarget(s: GameState, m: StaffMember): number {
  return Math.max(0, Math.min(100, satisfactionFactors(s, m).reduce((a, f) => a + f.value, 0)));
}

/** Réponse du joueur à une demande d'augmentation. */
export function answerRaise(s: GameState, id: number, accept: boolean): string | null {
  const m = s.staff.find((x) => x.id === id);
  if (!m || !m.raiseAsk) return 'Aucune demande en attente.';
  if (accept) {
    m.salaire = m.raiseAsk.amount;
    m.loyalty = clamp(m.loyalty + S().accord, 0, 100);
    log(s, 'guilde', 'info', `${m.name} obtient son augmentation : ${money(m.salaire)} par jour.`);
  } else {
    m.loyalty = clamp(m.loyalty - S().refus, 0, 100);
    log(s, 'guilde', 'info', `${m.name} n'obtient pas l'augmentation demandée. Il le prend mal.`);
  }
  m.raiseAsk = undefined;
  m.lastRaiseTick = s.tick;
  return null;
}

/** Âge, salaire convenu et demandes d'augmentation, chaque jour à minuit (v1.1). */
function careerDay(s: GameState, m: StaffMember): void {
  const Pp = P.personnel;
  m.age ??= randInt(s, 'personnel', Pp.ageMin, Pp.ageMax);
  m.salaire ??= fairSalary(m);
  // Un an de plus à chaque nouvelle année ; au-delà de 60 ans, la retraite approche.
  const day = dayOf(s.tick);
  if ((day - 1) % YEAR_DAYS === 0 && day > 1) {
    m.age += 1;
    if (m.retireTick === undefined && m.age >= Pp.ageRetraite && chance(s, 'personnel', Pp.retraiteChance + Pp.retraiteParAn * (m.age - Pp.ageRetraite))) {
      m.retireTick = s.tick + 7 * 24;
      log(s, 'guilde', 'important', `${m.name} (${ROLES[m.role].nom.toLowerCase()}, ${m.age} ans) prendra sa retraite dans une semaine. Pense à lui trouver un remplaçant.`);
    }
  }
  // Demande d'augmentation : quand sa compétence vaut nettement plus que son salaire.
  if (m.raiseAsk) {
    if (s.tick - m.raiseAsk.since >= Pp.augmentationReponseJours * 24) {
      m.raiseAsk = undefined;
      m.lastRaiseTick = s.tick;
      m.loyalty = clamp(m.loyalty - S().refus, 0, 100);
      log(s, 'guilde', 'important', `${m.name} n'a pas eu de réponse à sa demande d'augmentation. Il le prend comme un refus.`);
    }
  } else if (fairSalary(m) >= m.salaire * (1 + Pp.augmentationSeuil) && s.tick - (m.lastRaiseTick ?? m.hiredTick) >= Pp.augmentationDelaiJours * 24) {
    m.raiseAsk = { amount: fairSalary(m), since: s.tick };
    log(s, 'guilde', 'important', `${m.name} (${ROLES[m.role].nom.toLowerCase()}) demande une augmentation : ${money(m.salaire)} → ${money(fairSalary(m))} par jour. Réponds dans l'écran Personnel.`);
  }
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
  const m: StaffMember = {
    id: s.nextId++, name, role, c: clamp(comp, 1, 100), potentiel, trait,
    loyalty: P.personnel.loyauteDepart, daysWorked: 0, unpaidDays: 0, hiredTick: s.tick,
    age: randInt(s, 'personnel', P.personnel.ageMin, P.personnel.ageMax),
  };
  m.salaire = fairSalary(m);
  return m;
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
  m.salaire = fairSalary(m);   // le salaire se négocie au jour de l'embauche
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
  const retiring: number[] = [];
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
    careerDay(s, m);
    m.loyalty = clamp(m.loyalty + S().convergence * (satisfactionTarget(s, m) - m.loyalty), 0, 100);
    if (m.retireTick !== undefined && s.tick >= m.retireTick) { retiring.push(m.id); continue; }
    const every = m.trait === 'talentueux' ? Math.ceil(P.personnel.joursParProgression / 2) : P.personnel.joursParProgression;
    if (m.daysWorked % every === 0 && m.c < capOf(m)) m.c += 1;
    if (m.unpaidDays > P.personnel.joursImpayesMax) leaving.push(m.id);
    else if (m.loyalty < P.personnel.seuilDemission && rand(s, 'personnel') < P.personnel.chanceDemission) leaving.push(m.id);
  }
  for (const id of retiring) {
    const i = s.staff.findIndex((m) => m.id === id);
    const m = s.staff[i];
    s.staff.splice(i, 1);
    log(s, 'guilde', 'important', `${m.name} (${ROLES[m.role].nom.toLowerCase()}) prend sa retraite après ${Math.max(1, Math.round((s.tick - m.hiredTick) / 24))} jours au service de la guilde.`);
  }
  for (const id of leaving) {
    const i = s.staff.findIndex((m) => m.id === id);
    const m = s.staff[i];
    s.staff.splice(i, 1);
    log(s, 'guilde', 'important', `${m.name} (${ROLES[m.role].nom.toLowerCase()}) démissionne.`);
  }
}
