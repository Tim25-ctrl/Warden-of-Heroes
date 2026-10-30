// Œuvres de la guilde et privilèges de Sceau (GDD 6.10, 6.11, ajout v1.1).
import { P, RESOURCES } from './data';
import { money } from './format';
import { earn, log, spend } from './journal';
import { chronicle } from './legend';
import { addMod } from './mods';
import { pick } from './rng';
import type { GameState } from './types';
import { addRenown, news, offerDecision } from './world';

const H = 24;
const FOREVER = 1e15;

export interface WorkDef { id: string; nom: string; cout: number; sceau: number; jours: number; effet: string; renommee: number }
export interface PrivilegeDef { id: string; nom: string; effet: string }

export const WORKS = P.oeuvres as WorkDef[];
export const PRIVILEGES = P.privileges as PrivilegeDef[];

export const hasPrivilege = (s: GameState, id: string) => !!s.privileges?.includes(id);

// ---------- Œuvres ----------

export function workState(s: GameState, id: string): 'libre' | 'chantier' | 'fini' {
  const w = s.works?.find((x) => x.id === id);
  return !w ? 'libre' : w.done ? 'fini' : 'chantier';
}

export function workBlocked(s: GameState, def: WorkDef): string | null {
  if (workState(s, def.id) !== 'libre') return null;
  if (s.rank < def.sceau) return `Exige le ${['', 'Sceau de Cuivre', 'Sceau de Fer', "Sceau d'Argent", "Sceau d'Or", 'Sceau de Mithril'][def.sceau]}.`;
  if (def.cout > s.treasury) return `Il manque ${money(def.cout - s.treasury)}.`;
  return null;
}

export function buyWork(s: GameState, id: string): string | null {
  const def = WORKS.find((w) => w.id === id);
  if (!def) return 'Œuvre inconnue.';
  if (workState(s, id) !== 'libre') return 'Cette œuvre est déjà commandée.';
  const why = workBlocked(s, def);
  if (why) return why;
  spend(s, 'oeuvres', def.cout);
  (s.works ??= []).push({ id, endTick: s.tick + def.jours * H, done: false });
  log(s, 'guilde', 'important', `La guilde finance une œuvre pour la ville : ${def.nom} (${money(def.cout)}, ${def.jours} jours de chantier).`);
  news(s, 'une', `La guilde finance un grand chantier : ${def.nom}.`);
  return null;
}

/** Effets durables d'une œuvre achevée. */
function applyWork(s: GameState, def: WorkDef): void {
  const src = `oeuvre:${def.id}`;
  switch (def.id) {
    case 'route_vertbois': addMod(s, 'trajet:foret', FOREVER, src, { mult: 0.75 }); break;
    case 'fontaines': case 'hospice': addMod(s, 'prosperite', FOREVER, src, { add: 2 }); break;
    case 'marche': {
      for (const cat of new Set(Object.values(RESOURCES).map((r) => r.categorie))) addMod(s, `demande:cat:${cat}`, FOREVER, src, { mult: 1.1 });
      addMod(s, 'prosperite', FOREVER, src, { add: 2 });
      break;
    }
    case 'remparts': addMod(s, 'danger', FOREVER, src, { add: -5 }); break;
    case 'pont': addMod(s, 'trajet:marais', FOREVER, src, { mult: 0.75 }); addMod(s, 'trajet:ruines', FOREVER, src, { mult: 0.85 }); break;
    case 'arc': addMod(s, 'prosperite', FOREVER, src, { add: 3 }); break;
  }
  addRenown(s, def.renommee);
}

export function dailyWorks(s: GameState): void {
  for (const w of s.works ?? []) {
    if (w.done || s.tick < w.endTick) continue;
    w.done = true;
    const def = WORKS.find((x) => x.id === w.id);
    if (!def) continue;
    applyWork(s, def);
    log(s, 'guilde', 'critique', `L'œuvre « ${def.nom} » est achevée. ${def.effet}.`);
    news(s, 'une', `Inauguration : ${def.nom}, offert à la ville par la guilde.`);
    chronicle(s, `La guilde offre à la ville : ${def.nom}.`);
  }
}

// ---------- Privilèges de Sceau ----------

/** Au nouveau Sceau : trois privilèges tirés au hasard parmi ceux que la guilde n'a pas encore. */
export function offerPrivileges(s: GameState): void {
  const free = PRIVILEGES.filter((p) => !hasPrivilege(s, p.id));
  const offer: typeof free = [];
  while (offer.length < 3 && free.length) {
    const p = pick(s, 'monde', free);
    offer.push(p);
    free.splice(free.indexOf(p), 1);
  }
  if (!offer.length) return;
  offerDecision(s, 'privilege', 'Privilège du nouveau Sceau',
    'La Couronne accorde un privilège à la guilde pour son nouveau Sceau. Choisis-en un : il durera toute la partie.',
    offer.map((p) => ({ id: p.id, label: `${p.nom} : ${p.effet}` })), offer[0].id, 3 * H);
}

export function grantPrivilege(s: GameState, id: string): void {
  const def = PRIVILEGES.find((p) => p.id === id);
  if (!def || hasPrivilege(s, id)) return;
  (s.privileges ??= []).push(id);
  if (id === 'franchise') addMod(s, 'taxe_royale', FOREVER, 'privilege', { mult: 0.8 });
  log(s, 'guilde', 'important', `Privilège accordé par la Couronne : ${def.nom} (${def.effet.toLowerCase()}).`);
  chronicle(s, `La Couronne accorde à la guilde le privilège « ${def.nom} ».`);
}

/** Bourse royale : la Couronne rembourse 20 % des primes effectivement payées. */
export function primeRefund(s: GameState, paid: number): void {
  if (paid > 0 && hasPrivilege(s, 'bourse')) earn(s, 'primeCouronne', Math.round(paid * 0.2));
}
