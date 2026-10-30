// Insignes de rang et épreuves (GDD 3.9.1, ajout v1.1).
// Le rang d'un aventurier n'est plus déduit de son niveau : la guilde le décerne après une épreuve.
import { rangForLevel, rangIndex } from './adventurers';
import { P, SPECIES, ZONE_IDS, ZONES } from './data';
import { clamp } from './economy';
import { advLink, money } from './format';
import { earn, log, think } from './journal';
import { popOf } from './populations';
import { advise } from './legend';
import { makeChasse } from './quests';
import { addRenown, decorateQuest, news } from './world';
import type { Adventurer, GameState, Quest, Rang } from './types';

const H = 24;
export const RANGS: Rang[] = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];
const R = () => P.rangs;

export const nextRang = (r: Rang): Rang | null => RANGS[rangIndex(r) + 1] ?? null;

/**
 * Rang visé par l'épreuve : celui de son niveau, dans la limite du Sceau, et au moins le rang suivant.
 * Un aventurier qui a pris de l'avance peut sauter des rangs en une seule épreuve.
 */
export function examRang(s: GameState, a: Adventurer): Rang | null {
  const next = nextRang(a.rang);
  if (!next) return null;
  const byLevel = rangForLevel(a.level);
  const max = maxRangForSeal(s);
  let t = rangIndex(byLevel) > rangIndex(next) ? byLevel : next;
  if (rangIndex(t) > rangIndex(max)) t = max;
  return rangIndex(t) > rangIndex(a.rang) ? t : next;
}

/** Rang le plus haut que la guilde peut décerner, selon son Sceau. */
export function maxRangForSeal(s: GameState): Rang {
  return RANGS[R().sceauMax[Math.min(s.rank, R().sceauMax.length) - 1]];
}

/** Insigne d'une recrue : celui de son ancienne guilde (le rang de son niveau), dans la limite du Sceau. */
export function initialRang(s: GameState, level: number): Rang {
  const r = rangForLevel(level);
  const max = maxRangForSeal(s);
  return rangIndex(r) > rangIndex(max) ? max : r;
}

export function examFee(r: Rang): number {
  return (R().droits as Record<string, number>)[r] ?? 0;
}

export function examOf(s: GameState, a: Adventurer): Quest | undefined {
  return s.board.find((q) => q.examFor === a.id);
}

/** Les trois conditions de l'épreuve du rang suivant, cochées ou non. */
export function examConditions(s: GameState, a: Adventurer): { label: string; ok: boolean }[] {
  const next = examRang(s, a);
  if (!next) return [];
  const lvl = (R().niveaux as Record<string, number>)[next];
  const max = maxRangForSeal(s);
  return [
    { label: `Niveau ${lvl} (${a.level})`, ok: a.level >= lvl },
    { label: `${R().quetes} quêtes de rang ${a.rang} ou plus réussies depuis sa promotion (${a.rankQuests})`, ok: a.rankQuests >= R().quetes },
    { label: `Le Sceau de la guilde autorise le rang ${next} (jusqu'à ${max} aujourd'hui)`, ok: rangIndex(next) <= rangIndex(max) },
  ];
}

/** Candidat : il remplit les trois conditions et n'attend pas après un échec récent. */
export function isCandidate(s: GameState, a: Adventurer): boolean {
  if (a.status !== 'actif' || !nextRang(a.rang)) return false;
  if ((a.examCooldown ?? 0) > s.tick) return false;
  return examConditions(s, a).every((c) => c.ok);
}

/**
 * Bêtes de l'épreuve : une espèce du rang visé. La guilde repère elle-même les bêtes (elle peut les
 * faire venir de plus loin) : l'épreuve ne dépend pas de la population de la zone, même si la chasse y est fermée.
 */
function examTarget(s: GameState, target: Rang): { zone: string; sp: string; count?: number } | null {
  const wanted = (R().especes as Record<string, string[]>)[target] ?? [];
  const opts: { zone: string; sp: string }[] = [];
  for (const sp of wanted) for (const z of ZONE_IDS) if (ZONES[z].especes[sp] !== undefined && SPECIES[sp]) opts.push({ zone: z, sp });
  if (!opts.length) return null;
  const o = opts.sort((x, y) => popOf(s, y.zone, y.sp) - popOf(s, x.zone, x.sp))[0];
  // Un seul groupe de bêtes : l'épreuve mesure l'aventurier, pas son endurance.
  const g = SPECIES[o.sp].groupe;
  return { ...o, count: target === 'S' ? 2 : target === 'A' || target === 'B' ? 1 : Math.round((g[0] + g[1]) / 2) };
}

/** Le gardien organise l'épreuve (le candidat paie ses droits, ou la guilde les offre). */
export function organizeExam(s: GameState, id: number, offered: boolean): string | null {
  const a = s.adventurers.find((x) => x.id === id);
  if (!a) return 'Aventurier introuvable.';
  if (examOf(s, a)) return 'Une épreuve est déjà prévue.';
  if (!isCandidate(s, a)) return "Il ne remplit pas encore les conditions de l'épreuve.";
  const target = examRang(s, a)!;
  const fee = examFee(target);
  if (offered) {
    if (fee > s.treasury) return 'Trésorerie insuffisante pour offrir l\'épreuve.';
  } else if (fee > a.gold) return `${a.name} n'a pas de quoi payer ses droits d'épreuve (${money(fee)}). Tu peux les lui offrir.`;
  const t = examTarget(s, target);
  if (!t) return "Aucune bête de ce rang dans la région pour l'épreuve.";
  const q = makeChasse(s, t.zone, t.sp, t.count, 'guilde');
  if (!q) return "Impossible de préparer l'épreuve.";
  q.rang = target;
  q.reward = 0;
  q.client = 'la guilde';
  q.title = `Épreuve de rang ${target} pour ${a.name} : ${q.title.charAt(0).toLowerCase()}${q.title.slice(1)}`;
  q.examFor = a.id;
  q.expires = s.tick + R().expirationJours * H;
  decorateQuest(s, q);
  s.board.push(q);
  if (offered) {
    a.loyalty = clamp(a.loyalty + 5, 0, 100);
  } else {
    a.gold -= fee;
    earn(s, 'droitsEpreuve', fee);
  }
  a.candidateSince = undefined;
  a.griefRang = 0;
  log(s, 'aventuriers', 'important', `Épreuve de rang ${target} organisée pour ${advLink(a)}${fee ? (offered ? ` (droits de ${money(fee)} offerts par la guilde)` : ` (droits de ${money(fee)} payés)`) : ''}.`);
  think(s, a, `Mon épreuve de rang ${target} ! Je ne vais pas les décevoir.`, 'info');
  return null;
}

/** Fin d'une épreuve : promotion ou nouvelle tentative plus tard. */
export function onExamDone(s: GameState, a: Adventurer, q: Quest, ok: boolean): void {
  if (!ok) {
    a.examCooldown = s.tick + R().attenteEchecJours * H;
    log(s, 'aventuriers', 'important', `${advLink(a)} échoue à l'épreuve de rang ${q.rang}. Nouvelle tentative possible dans ${R().attenteEchecJours} jours.`);
    think(s, a, "Raté. La prochaine fois, je serai prêt.", 'info');
    return;
  }
  a.rang = q.rang;
  a.rankQuests = 0;
  a.griefRang = 0;
  a.candidateSince = undefined;
  a.morale = clamp(a.morale + 10, 0, 100);
  a.respect = clamp(a.respect + 5, 0, 100);
  a.fierte = clamp(a.fierte + 5, 0, 100);
  a.loyalty = clamp(a.loyalty + 5, 0, 100);
  addRenown(s, (R().renommee as Record<string, number>)[q.rang] ?? 0);
  log(s, 'aventuriers', 'important', `${advLink(a)} réussit l'épreuve et reçoit l'insigne de rang ${q.rang} !`);
  news(s, 'exploits', `${a.name} reçoit l'insigne de rang ${q.rang} de la guilde.`);
  think(s, a, `L'insigne de rang ${q.rang}. Je l'ai mérité.`, 'info');
}

/** Chaque jour : nouveaux candidats, grief des candidats qu'on fait attendre. */
export function dailyRanks(s: GameState): void {
  for (const a of s.adventurers) {
    if (!isCandidate(s, a) || examOf(s, a)) {
      if (!isCandidate(s, a)) a.candidateSince = undefined;
      continue;
    }
    if (a.candidateSince === undefined) {
      a.candidateSince = s.tick;
      advise(s, 'epreuve', { nom: a.name, rang: examRang(s, a) ?? '' });
      log(s, 'aventuriers', 'info', `${advLink(a)} peut passer l'épreuve de rang ${examRang(s, a)} (fiche de l'aventurier).`);
      continue;
    }
    if (s.tick - a.candidateSince > R().attenteJours * H) {
      const before = a.griefRang;
      a.griefRang = Math.min(R().griefMax, a.griefRang + R().griefJour);
      if (before < 10 && a.griefRang >= 10) think(s, a, `Ça fait des semaines que je mérite mon insigne de rang ${examRang(s, a)}. On ne me reconnaît pas ici.`, 'info');
    }
  }
}
