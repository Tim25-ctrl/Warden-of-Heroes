// Relations avec les guildes rivales et Tournoi des insignes (GDD 5.5.1, 5.4.6, ajout v1.1).
import { addAilment } from './ailments';
import { createAdventurer, gainXp, powerOf, rangIndex, xpRequired } from './adventurers';
import { P } from './data';
import { clamp } from './economy';
import { advLink, dayInSeason, dayOf, hourOf, money, seasonOf, yearOf } from './format';
import { earn, log, spend, think } from './journal';
import { chronicle, unlock } from './legend';
import { makeChasse } from './quests';
import { chance, pick, randInt, range } from './rng';
import type { Adventurer, GameState, Rival } from './types';
import { addRenown, decorateQuest, news, offerDecision } from './world';

const H = 24;
const D = () => P.diplomatie;

export const relationOf = (r: Rival) => r.relation ?? 0;
export function relationLabel(v: number): { nom: string; tone: string } {
  if (v < -30) return { nom: 'hostile', tone: 'seal' };
  if (v <= 0) return { nom: 'froide', tone: 'amber' };
  if (v <= 30) return { nom: 'cordiale', tone: 'sage' };
  return { nom: 'alliée', tone: 'sage' };
}
const shift = (r: Rival, v: number) => { r.relation = clamp(relationOf(r) + v, -100, 100); };
const active = (s: GameState) => s.world.rivals.filter((r) => r.bankruptSince === null);

// ---------- Gestes du joueur ----------

export function giftRival(s: GameState, id: string): string | null {
  const r = active(s).find((x) => x.id === id);
  if (!r) return 'Guilde introuvable.';
  if ((r.giftTick ?? -1e9) > s.tick - 7 * H) return 'Un cadeau par semaine au plus.';
  if (D().cadeau > s.treasury) return 'Trésorerie insuffisante.';
  spend(s, 'diplomatie', D().cadeau);
  r.giftTick = s.tick;
  shift(r, D().cadeauRelation);
  log(s, 'monde', 'info', `La guilde offre un cadeau à ${r.nom} (${money(D().cadeau)}). Relation : ${relationLabel(relationOf(r)).nom}.`);
  return null;
}

export function pactRival(s: GameState, id: string): string | null {
  const r = active(s).find((x) => x.id === id);
  if (!r) return 'Guilde introuvable.';
  if (relationOf(r) <= 0) return 'Il faut une relation au moins cordiale.';
  if ((r.pacteUntil ?? 0) > s.tick) return 'Un pacte est déjà en cours.';
  if (D().pacte > s.treasury) return 'Trésorerie insuffisante.';
  spend(s, 'diplomatie', D().pacte);
  r.pacteUntil = s.tick + D().pacteJours * H;
  log(s, 'monde', 'important', `Pacte de non-débauchage signé avec ${r.nom} pour un an (${money(D().pacte)}).`);
  news(s, 'guildes', `La guilde et ${r.nom} signent un pacte : aucune ne débauchera les aventuriers de l'autre.`);
  return null;
}

/** La rivale peut-elle tenter de débaucher ? (pacte en cours : non) */
export function canPoach(s: GameState, r: Rival): boolean {
  return (r.pacteUntil ?? 0) <= s.tick;
}
export function onPoachAttempt(r: Rival): void { shift(r, -5); }
export function onDefamation(r: Rival): void { shift(r, -5); }

/** Rivales alliées : elles envoient leurs combattants pendant un assaut. */
export function assaultAllies(s: GameState): Rival[] {
  return active(s).filter((r) => relationOf(r) > 30);
}

// ---------- Contrats partagés ----------

function proposeShared(s: GameState, r: Rival): void {
  r.lastShared = s.tick;
  offerDecision(s, 'contrat_partage', `Contrat partagé avec ${r.nom}`,
    `${r.nom} propose de mener ensemble une grosse commande : une quête à ton tableau, mieux payée (×1,5). Réussie, elle rapproche les deux guildes ; échouée, elle les brouille.`,
    [{ id: 'accepter', label: 'Accepter' }, { id: 'refuser', label: 'Refuser poliment' }], 'accepter', 2 * H, { rival: r.id });
}

export function acceptShared(s: GameState, rivalId: string): void {
  const r = active(s).find((x) => x.id === rivalId);
  if (!r) return;
  const zones = ['foret', 'collines', 'marais', 'ruines'];
  const q = makeChasse(s, pick(s, 'monde', zones));
  if (!q) return;
  q.reward = Math.round(q.reward * D().partageRecompense);
  q.client = `${r.nom} et la guilde`;
  q.title = `Contrat partagé : ${q.title.charAt(0).toLowerCase()}${q.title.slice(1)}`;
  q.sharedWith = r.id;
  decorateQuest(s, q);
  s.board.push(q);
  log(s, 'quetes', 'important', `Contrat partagé avec ${r.nom} : « ${q.title} » est au tableau (${money(q.reward)}).`);
}

export function onSharedDone(s: GameState, rivalId: string, ok: boolean): void {
  const r = s.world.rivals.find((x) => x.id === rivalId);
  if (!r) return;
  shift(r, ok ? 10 : -10);
  if (ok) r.renown += 5;
  log(s, 'monde', 'info', `${ok ? 'Contrat partagé réussi' : 'Contrat partagé manqué'} avec ${r.nom}. Relation : ${relationLabel(relationOf(r)).nom}.`);
}

// ---------- Rachat d'une guilde en faillite ----------

export function rachatCost(r: Rival): number {
  return Math.min(D().rachatMax, D().rachatBase + D().rachatParMembre * r.size);
}

export function proposeBuyout(s: GameState, r: Rival): void {
  const cost = rachatCost(r);
  offerDecision(s, 'rachat', `Racheter ${r.nom} ?`,
    `${r.nom} vient de faire faillite. En la rachetant, ses meilleurs aventuriers rejoignent la guilde et ta renommée grandit.`,
    [{ id: 'racheter', label: 'Racheter la guilde', cost }, { id: 'laisser', label: 'Laisser faire' }], 'laisser', 2 * H, { rival: r.id });
}

export function buyout(s: GameState, rivalId: string): void {
  const r = s.world.rivals.find((x) => x.id === rivalId);
  if (!r) return;
  const lv = s.adventurers.length ? Math.round(s.adventurers.reduce((a, x) => a + x.level, 0) / s.adventurers.length) : 5;
  const n = randInt(s, 'aventuriers', 3, 5);
  const names: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = createAdventurer(s, { level: clamp(randInt(s, 'aventuriers', lv - 2, lv + 3), 1, 28), goldMin: 200, goldMax: 1500 });
    a.loyalty = 45;
    s.adventurers.push(a);
    names.push(advLink(a));
  }
  addRenown(s, D().rachatRenommee);
  r.bankruptSince = s.tick;   // une nouvelle guilde ne la remplace qu'un mois plus tard
  log(s, 'guilde', 'critique', `La guilde rachète ${r.nom}. ${names.join(', ')} rejoignent ses rangs.`);
  news(s, 'guildes', `La guilde rachète ${r.nom}, en faillite.`);
  chronicle(s, `La guilde rachète ${r.nom} et accueille ses meilleurs aventuriers.`);
}

// ---------- Chaque jour ----------

export function dailyDiplomacy(s: GameState): void {
  const day = dayOf(s.tick);
  for (const r of active(s)) {
    // Les rancunes comme les amitiés s'effacent doucement : 2 points par semaine vers 0.
    if ((day - 1) % 7 === 0 && relationOf(r) !== 0) shift(r, relationOf(r) > 0 ? -Math.min(2, relationOf(r)) : Math.min(2, -relationOf(r)));
    if (relationOf(r) > 0 && s.tick - (r.lastShared ?? -1e9) > 28 * H && chance(s, 'monde', 1 / 14)) proposeShared(s, r);
  }
  dailyTournament(s);
}

// ---------- Tournoi des insignes ----------

const champPower = (r: Rival) => clamp(90 + r.renown * 0.15, 90, 230);

function dailyTournament(s: GameState): void {
  const sea = seasonOf(s.tick);
  const dIn = dayInSeason(s.tick);
  const T = D().tournoi;
  if (sea !== T.saison) return;
  if (dIn === T.jour - 7) {
    offerDecision(s, 'tournoi', 'Le Tournoi des insignes',
      `Dans une semaine, la ville organise le Tournoi des insignes. Chaque guilde y envoie ses champions (inscription : ${money(T.inscription)}).`,
      [
        { id: 'meilleurs', label: 'Envoyer nos trois meilleurs', cost: T.inscription },
        { id: 'espoirs', label: 'Envoyer nos jeunes espoirs (rang C ou moins)', cost: T.inscription },
        { id: 'non', label: 'Ne pas participer' },
      ], 'meilleurs', 3 * H);
  }
}

export function registerTournament(s: GameState, mode: 'meilleurs' | 'espoirs'): void {
  s.world.tournament = { day: dayOf(s.tick) + 7, mode };
}

/** Le jour venu, à 15h : huit champions, trois tours à élimination directe. */
export function hourlyTournament(s: GameState): void {
  const t = s.world.tournament;
  if (!t || dayOf(s.tick) !== t.day || hourOf(s.tick) !== 15) return;
  s.world.tournament = undefined;
  const T = D().tournoi;
  const pool = s.adventurers.filter((a) => a.runId === null && a.activity.kind !== 'hospitalise' && a.status !== 'depart');
  const ours = (t.mode === 'espoirs' ? pool.filter((a) => rangIndex(a.rang) <= 3) : pool).sort((a, b) => powerOf(b) - powerOf(a)).slice(0, 3);
  if (!ours.length) { log(s, 'monde', 'important', 'Aucun champion disponible : la guilde déclare forfait au Tournoi des insignes.'); return; }
  interface Entrant { nom: string; power: number; adv?: Adventurer; rival?: Rival }
  const entrants: Entrant[] = [
    ...ours.map((a) => ({ nom: a.name, power: powerOf(a), adv: a })),
    ...active(s).map((r) => ({ nom: `le champion de ${r.nom}`, power: champPower(r) * range(s, 'monde', 0.9, 1.1), rival: r })),
  ];
  while (entrants.length < 8) entrants.push({ nom: `un duelliste de la ville`, power: range(s, 'monde', 80, 150) });
  const order = [...entrants.slice(0, 8)];
  for (let i = order.length - 1; i > 0; i--) { const j = randInt(s, 'monde', 0, i); [order[i], order[j]] = [order[j], order[i]]; }
  let round = order;
  let finalist: Entrant | null = null;
  const semis: Entrant[] = [];
  while (round.length > 1) {
    const next: Entrant[] = [];
    for (let i = 0; i < round.length; i += 2) {
      const a = round[i];
      const b = round[i + 1];
      const pa = a.power ** 2 / (a.power ** 2 + b.power ** 2);
      const [win, lose] = chance(s, 'monde', pa) ? [a, b] : [b, a];
      for (const e of [win, lose]) if (e.adv) gainXp(s, e.adv, xpRequired(e.adv.level) * T.xpParCombat);
      if (lose.adv) {
        if (chance(s, 'monde', T.blessure)) addAilment(s, lose.adv, 'plaie', 0);
        think(s, lose.adv, `Battu au tournoi par ${win.nom}. La prochaine fois…`, 'info');
      }
      if (win.adv) { win.adv.morale = clamp(win.adv.morale + 5, 0, 100); win.adv.respect = clamp(win.adv.respect + 3, 0, 100); }
      if (round.length === 4) semis.push(lose);
      if (round.length === 2) finalist = lose;
      next.push(win);
    }
    round = next;
  }
  const winner = round[0];
  const guildName = (e: Entrant) => (e.adv ? `${advLink(e.adv)} (la guilde)` : e.nom);
  if (winner.adv) {
    earn(s, 'tournoi', T.prix1);
    addRenown(s, T.renommee1);
    winner.adv.respect = clamp(winner.adv.respect + 10, 0, 100);
    winner.adv.history.notable.push(`vainqueur du Tournoi des insignes (an ${yearOf(s.tick)})`);
    unlock(s, 'tournoi');
  } else if (winner.rival) winner.rival.renown += T.renommee1;
  if (finalist?.adv) { earn(s, 'tournoi', T.prix2); addRenown(s, T.renommee2); }
  for (const e of semis) if (e.adv) addRenown(s, T.renommee3);
  // « de le champion » → « du champion », « à un duelliste » reste tel quel
  const de = (n: string) => (n.startsWith('le ') ? `du ${n.slice(3)}` : n.startsWith('un ') ? `d'${n}` : `de ${n}`);
  const a = (n: string) => (n.startsWith('le ') ? `au ${n.slice(3)}` : `à ${n}`);
  const text = `Tournoi des insignes : victoire ${winner.adv ? `de ${advLink(winner.adv)}, champion de la guilde` : de(winner.nom)}${finalist ? `, face ${finalist.adv ? `à ${advLink(finalist.adv)}` : a(finalist.nom)} en finale` : ''}.`;
  log(s, 'monde', 'critique', text);
  news(s, 'exploits', text.replace(/\[\[a:\d+\|([^\]]+)\]\]/g, '$1'));
  chronicle(s, text.replace(/\[\[a:\d+\|([^\]]+)\]\]/g, '$1'));
  void guildName;
}
