// La légende (GDD chapitre 6) : difficulté, Renommée hebdomadaire, Sceaux royaux, hauts faits, Panthéon,
// conseils de Gaspard, prêteurs (1.1.3), Livre de la guilde et épilogue.
import { className, rangForLevel, rangIndex } from './adventurers';
import { P, ROOM_IDS, ZONES } from './data';
import progression from './data/progression.json';
import { clamp, dormQuality, infQuality, terrainQuality } from './economy';
import { advLink, dayOf, hourOf, isSeasonStart, money, SEASON_DAYS, SEASONS, seasonOf, weekdayOf, yearOf } from './format';
import { earn, log, spend } from './journal';
import { pick, rand } from './rng';
import { addRel, rel, relStatus } from './social';
import { offerPrivileges } from './charter';
import type {
  Adventurer, Difficulty, DifficultyId, DifficultyValues, GameState, GaspardState, GuildBook, LegendState, Loans, Money, Rang, RoomId,
} from './types';
import { addRenown, news } from './world';
import { scenarioAchievement } from './scenarios';

export const PROG = progression;
type SealDef = (typeof progression.sceaux)[number];
export const SEALS = progression.sceaux as SealDef[];
export const ACHIEVEMENTS = progression.hautsFaits as Record<string, { nom: string; cat: string; texte: string; defi?: boolean }>;
const H = 24;

// ---------- Difficulté (6.5) ----------

/** Les trois niveaux prédéfinis ; la difficulté personnalisée part de l'un d'eux. */
export type PresetId = Exclude<DifficultyId, 'personnalisee'>;
export const PRESETS: PresetId[] = ['paisible', 'normal', 'impitoyable'];

export function makeDifficulty(id: DifficultyId, values?: DifficultyValues): Difficulty {
  const d = values ?? progression.difficultes[id === 'personnalisee' ? 'normal' : id];
  return { id, tresorerie: d.tresorerie, mort: d.mort, croissance: d.croissance, recompenses: d.recompenses,
    tolerance: d.tolerance, faillite: d.faillite, crises: d.crises, rumeurs: d.rumeurs, changed: false };
}

export const DIFFICULTY_NAMES: Record<DifficultyId, string> = { paisible: 'Paisible', normal: 'Normal', impitoyable: 'Impitoyable', personnalisee: 'Personnalisée' };

/**
 * Les huit réglages de la difficulté personnalisée (v1.1, D-164) : bornes, pas, et sens de la difficulté
 * (hard = 1 si une valeur plus grande rend le jeu plus dur).
 */
export const DIFF_SETTINGS: { key: keyof DifficultyValues; label: string; min: number; max: number; step: number; hard: 1 | -1; fmt: (v: number) => string; help: string }[] = [
  { key: 'tresorerie', label: 'Trésorerie de départ', min: 5000, max: 100000, step: 5000, hard: -1, fmt: (v) => `${v / 100} po`, help: "L'or dans les caisses le premier jour. Ne compte qu'au lancement." },
  { key: 'mort', label: "Risque de mort d'un aventurier à terre", min: 0.25, max: 2, step: 0.05, hard: 1, fmt: (v) => `×${v.toFixed(2)}`, help: "Multiplie la chance qu'un aventurier tombé au combat ne se relève pas." },
  { key: 'croissance', label: 'Croissance des monstres', min: 0.5, max: 1.6, step: 0.05, hard: 1, fmt: (v) => `×${v.toFixed(2)}`, help: 'Vitesse à laquelle les bêtes se reproduisent dans les zones.' },
  { key: 'recompenses', label: 'Récompenses des quêtes', min: 0.6, max: 1.5, step: 0.05, hard: -1, fmt: (v) => `×${v.toFixed(2)}`, help: "Ce que la ville paie pour les quêtes : c'est l'or que les aventuriers dépensent chez toi." },
  { key: 'tolerance', label: 'Tolérance de prix des aventuriers', min: -0.3, max: 0.4, step: 0.05, hard: -1, fmt: (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)} %`, help: "À quel point ils acceptent de payer plus cher que la référence avant d'aller ailleurs." },
  { key: 'faillite', label: 'Délai avant faillite', min: 2, max: 30, step: 1, hard: -1, fmt: (v) => `${v} jours`, help: 'Jours dans le rouge avant que la Couronne saisisse le siège.' },
  { key: 'crises', label: 'Fréquence des crises', min: 0, max: 2.5, step: 0.25, hard: 1, fmt: (v) => `×${v.toFixed(2)}`, help: 'Épidémies, guerres, assauts : combien par an.' },
  { key: 'rumeurs', label: 'Fiabilité des rumeurs', min: 0.5, max: 1, step: 0.05, hard: -1, fmt: (v) => `${Math.round(v * 100)} %`, help: 'Part des rumeurs des Chroniques qui se réalisent.' },
];

/** Vrai si chaque réglage est au moins aussi dur que celui de la référence. */
export function atLeastAsHard(d: DifficultyValues, ref: DifficultyValues): boolean {
  return DIFF_SETTINGS.every(({ key, hard }) => hard * (d[key] - ref[key]) >= -1e-9);
}

/** Les hauts faits « Défis » comptent si la difficulté n'a pas été adoucie : niveau prédéfini gardé, ou tout au moins aussi dur qu'Impitoyable. */
export function defisAllowed(s: GameState): boolean {
  const d = diff(s);
  if (atLeastAsHard(d, progression.difficultes.impitoyable)) return true;
  return d.id !== 'personnalisee' && !d.changed;
}

/** Difficulté réglée curseur par curseur, au lancement ou en cours de partie (v1.1, D-164). */
export function setDifficultyValues(s: GameState, values: DifficultyValues): void {
  const v = { ...values };
  for (const { key, min, max } of DIFF_SETTINGS) v[key] = clamp(Number(v[key]) || 0, min, max);
  v.tresorerie = s.difficulty.tresorerie;   // l'or de départ ne compte qu'au lancement
  s.difficulty = { ...makeDifficulty('personnalisee', v), changed: true };
  log(s, 'guilde', 'important', defisAllowed(s)
    ? 'Difficulté personnalisée. Tout reste au moins aussi dur qu\'Impitoyable : les hauts faits « Défis » restent possibles.'
    : 'Difficulté personnalisée. Les hauts faits « Défis » sont désactivés pour cette partie.');
}

/** Valeur d'un réglage de difficulté, avec repli sur Normal pour les états sans difficulté. */
export const diff = (s: GameState) => s.difficulty ?? makeDifficulty('normal');

export function setDifficulty(s: GameState, id: DifficultyId): void {
  if (s.difficulty.id === id || id === 'personnalisee') return;
  s.difficulty = { ...makeDifficulty(id), tresorerie: s.difficulty.tresorerie, changed: true };
  log(s, 'guilde', 'important', `Difficulté réglée sur ${DIFFICULTY_NAMES[id]}. Les hauts faits « Défis » sont désactivés pour cette partie.`);
}

// ---------- Initialisation ----------

export function initLegend(s: GameState, difficulty: DifficultyId, pantheonNames: string[], values?: DifficultyValues): void {
  s.difficulty = makeDifficulty(difficulty, difficulty === 'personnalisee' ? values : undefined);
  s.legend = {
    heraldTick: null, victoryTick: null, defeatSeen: false, epilogueSeen: false,
    achievements: {}, counters: {}, week: {}, legends: [], pantheonPick: null,
  } satisfies LegendState;
  s.gaspard = { mode: 'frequent', said: [], last: -1e9, queue: [], cooldown: {} } satisfies GaspardState;
  s.loans = { banque: null, usurier: null, lastLoanTick: -1e9, lastDebtTick: -1e9 } satisfies Loans;
  s.book = { chapters: [], current: [], weekly: [], records: { bestQuest: null, richest: null } } satisfies GuildBook;
  s.pantheonNames = pantheonNames.slice(0, 50);
}

const C = (s: GameState) => s.legend.counters;
export function bump(s: GameState, key: string, n = 1): void {
  if (!s.legend) return;
  C(s)[key] = (C(s)[key] ?? 0) + n;
}

/** Ligne du Livre de la guilde (6.9), datée. */
export function chronicle(s: GameState, text: string): void {
  if (!s.book) return;
  s.book.current.push(`J${dayOf(s.tick)} — ${text}`);
}

// ---------- Les Sceaux royaux (6.2) ----------

export const sealOf = (rank: number) => SEALS[Math.min(SEALS.length, Math.max(1, rank)) - 1];
export const nextSeal = (s: GameState) => (s.rank < SEALS.length ? SEALS[s.rank] : null);

/** Conditions du sceau suivant, cochées ou non (7.5.10). */
export function sealConditions(s: GameState): { label: string; ok: boolean }[] {
  const n = nextSeal(s);
  if (!n) return [];
  const c = (n.conditions ?? {}) as Record<string, number | string | boolean>;
  const out: { label: string; ok: boolean }[] = [{ label: `${n.points} points de renommée (${Math.round(s.renown)})`, ok: s.renown >= n.points }];
  const advs = s.adventurers;
  if (c.aventuriers) out.push({ label: `${c.aventuriers} aventuriers (${advs.length})`, ok: advs.length >= Number(c.aventuriers) });
  if (c.sallesConstruites) {
    const built = (['dortoirs', 'refectoire', 'infirmerie', 'terrain'] as RoomId[]).filter((r) => s[r].level > 0).length;
    out.push({ label: `Les 4 salles construites (${built})`, ok: built >= Number(c.sallesConstruites) });
  }
  if (c.quetesReussies) out.push({ label: `${c.quetesReussies} quêtes réussies (${C(s).quetesReussies ?? 0})`, ok: (C(s).quetesReussies ?? 0) >= Number(c.quetesReussies) });
  if (c.salleNiveau3) out.push({ label: 'Une salle au niveau 3', ok: ROOM_IDS.some((r) => s[r].level >= 3) });
  if (c.monstreRang) out.push({ label: `Un monstre de rang ${c.monstreRang} tué`, ok: (C(s).monstreRang ?? -1) >= rangIndex(c.monstreRang as Rang) });
  if (c.sansDetteJours) {
    const days = Math.floor((s.tick - Math.max(s.loans.lastDebtTick, -1e8)) / H);
    out.push({ label: `Aucune dette depuis ${c.sansDetteJours} jours`, ok: s.treasury >= 0 && days >= Number(c.sansDetteJours) });
  }
  if (c.niveau18) out.push({ label: `${c.niveau18} aventuriers de niveau 18 ou plus`, ok: advs.filter((a) => a.level >= 18).length >= Number(c.niveau18) });
  if (c.niveau25) out.push({ label: 'Un aventurier de niveau 25 ou plus', ok: advs.some((a) => a.level >= 25) });
  if (c.queteRang) out.push({ label: `Une quête de rang ${c.queteRang} réussie`, ok: (C(s).queteRang ?? -1) >= rangIndex(c.queteRang as Rang) });
  if (c.palier) {
    const order = ['bourg', 'ville', 'cite'];
    out.push({ label: c.palier === 'cite' ? 'La ville au palier Cité' : 'La ville au palier Ville au moins', ok: order.indexOf(s.world.palier) >= order.indexOf(String(c.palier)) });
  }
  return out;
}

function checkSeal(s: GameState): void {
  if (s.legend.heraldTick !== null || !nextSeal(s)) return;
  if (sealConditions(s).every((c) => c.ok)) {
    s.legend.heraldTick = (dayOf(s.tick)) * H + 8;     // le lendemain matin, 08h
    log(s, 'guilde', 'critique', `La guilde remplit les conditions du ${nextSeal(s)!.nom}. Le héraut royal viendra demain matin.`);
  }
}

function herald(s: GameState): void {
  s.legend.heraldTick = null;
  s.rank += 1;
  const seal = sealOf(s.rank);
  for (const a of s.adventurers) if (a.runId === null) a.morale = clamp(a.morale + 10, 0, 100);
  log(s, 'guilde', 'critique', `Le héraut royal appose le ${seal.nom} sur la charte de la guilde ! Fête au siège.`);
  news(s, 'une', `Le héraut royal a apposé le ${seal.nom} sur la charte de la guilde.`);
  chronicle(s, `Le héraut royal appose le ${seal.nom} sur la charte.`);
  unlock(s, ['', '', 'sceau_fer', 'sceau_argent', 'sceau_or', 'sceau_mithril'][s.rank]);
  if (s.rank === 2 && !C(s).taxed) unlock(s, 'sans_impot', true);
  if (s.rank === 4 && atLeastAsHard(diff(s), PROG.difficultes.impitoyable)) unlock(s, 'impitoyable', true);
  advise(s, 'promotion');
  offerPrivileges(s);
  if (s.rank >= SEALS.length && s.legend.victoryTick === null) {
    s.legend.victoryTick = s.tick;
    const sc = scenarioAchievement(s);
    if (sc) unlock(s, sc);
    log(s, 'guilde', 'critique', 'Victoire : la guilde a obtenu le plus haut des Sceaux royaux. La partie continue, sans fin.');
    chronicle(s, 'La guilde atteint le sommet : le Sceau de Mithril. Les bardes chanteront son nom.');
  }
}

// ---------- Renommée : bilan hebdomadaire (6.1.2) ----------

/** Appelé le Jour du Roi, avant la remise à zéro des statistiques de la semaine. */
export function weeklyRenown(s: GameState, priceRatio: number): void {
  const w: Record<string, number> = {};
  const top = [...s.adventurers].sort((a, b) => b.respect - a.respect).slice(0, 10);
  if (top.length) w.prestige = (top.reduce((a, x) => a + x.respect, 0) / top.length - 40) / 10;
  const qs: number[] = [dormQuality(s)];
  if (s.infirmerie.level) qs.push(infQuality(s));
  if (s.terrain.level) qs.push(terrainQuality(s));
  w.salles = (qs.reduce((a, b) => a + b, 0) / qs.length - 50) / 10;
  w.prix = priceRatio > 1.5 ? -5 : priceRatio > 1.2 ? -2 : priceRatio <= 0.95 ? 1 : 0;
  w.fiscalite = s.taxRate <= 0.1 ? 1 : s.taxRate > 0.3 ? -3 : 0;
  if ((C(s).weekHighQuest ?? 0) === 0) w.erosion = -PROG.renommeeHebdo.erosion * s.renown;
  C(s).weekHighQuest = 0;
  for (const k of Object.keys(w)) w[k] = Math.round(w[k] * 10) / 10;
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  addRenown(s, total);
  s.legend.week = w;
  if (Math.abs(total) >= 0.5) log(s, 'guilde', 'info', `Bilan de la semaine : renommée ${total >= 0 ? '+' : ''}${total.toFixed(1)}.`);
}

export function onMemorial(s: GameState): void {
  const got = C(s).mur ?? 0;
  if (got >= PROG.renommeeHebdo.murMax) return;
  bump(s, 'mur', PROG.renommeeHebdo.mur);
  addRenown(s, PROG.renommeeHebdo.mur);
}

// ---------- Hauts faits (6.3) ----------

export function unlock(s: GameState, id: string, defi = false): void {
  if (!id || !ACHIEVEMENTS[id] || s.legend.achievements[id] !== undefined) return;
  if ((defi || ACHIEVEMENTS[id].defi) && !defisAllowed(s)) return;
  s.legend.achievements[id] = s.tick;
  log(s, 'guilde', 'important', `Haut fait : « ${ACHIEVEMENTS[id].nom} ». ${ACHIEVEMENTS[id].texte}`);
}

/** Événements de quête : conditions de sceau, records, hauts faits du monde. */
export function onQuestDone(s: GameState, q: { rang: Rang; type: string; target?: string; legend?: string; title: string; reward: Money }, ok: boolean, team: Adventurer[]): void {
  if (!ok || q.type === 'aide') return;
  bump(s, 'quetesReussies');
  C(s).queteRang = Math.max(C(s).queteRang ?? -1, rangIndex(q.rang));
  if (rangIndex(q.rang) >= 2) C(s).weekHighQuest = 1;
  if (q.legend) {
    unlock(s, 'legende_vivante');
    for (const a of team) addLegend(s, a, `a vaincu ${q.legend}`);
  }
  if (q.target === 'dragon') {
    unlock(s, 'tueur_dragon');
    for (const a of team) addLegend(s, a, 'a terrassé le jeune dragon des Pics');
    chronicle(s, `${team.map((a) => a.name).join(', ')} terrassent le jeune dragon des Pics.`);
  }
  const best = s.book.records.bestQuest;
  if (!best || q.reward > best.reward) s.book.records.bestQuest = { title: q.title, reward: q.reward, who: team.map((a) => a.name).join(', ') };
}

export function onKill(s: GameState, rang: Rang): void {
  if (!s.legend) return;
  C(s).monstreRang = Math.max(C(s).monstreRang ?? -1, rangIndex(rang));
}

export function onSale(s: GameState, res: string, qty: number, unitValue: number, refPrice: number): void {
  if (!s.legend) return;
  if (res === 'peau_loup') { bump(s, 'peauxLoup', qty); if ((C(s).peauxLoup ?? 0) >= 100) unlock(s, 'grossiste'); }
  if (refPrice > 0 && unitValue >= 2 * refPrice) unlock(s, 'speculateur');
}

function addLegend(s: GameState, a: Adventurer, reason: string): void {
  if (s.legend.legends.some((l) => l.id === a.id)) return;
  s.legend.legends.push({ id: a.id, name: a.name, classe: a.classe, level: a.level, reason, tick: s.tick });
  log(s, 'guilde', 'important', `${advLink(a)} entre au Panthéon des héros : ${reason}.`);
}

export function pickForPantheon(s: GameState, id: number): string | null {
  if (s.legend.pantheonPick !== null) return 'Tu as déjà inscrit un aventurier au Panthéon dans cette partie.';
  const a = s.adventurers.find((x) => x.id === id);
  if (!a) return 'Aventurier introuvable.';
  s.legend.pantheonPick = id;
  const existing = s.legend.legends.find((l) => l.id === id);
  if (existing) existing.chosen = true;
  else s.legend.legends.push({ id: a.id, name: a.name, classe: a.classe, level: a.level, reason: 'inscrit par le maître de guilde', tick: s.tick, chosen: true });
  log(s, 'guilde', 'important', `${advLink(a)} est inscrit au Panthéon des héros.`);
  return null;
}

/** Vérifications quotidiennes des hauts faits et des entrées au Panthéon. */
function dailyAchievements(s: GameState): void {
  const c = C(s);
  const last = s.ledger[s.ledger.length - 1];
  if (last) {
    const rec = Object.values(last.recettes).reduce((a, b) => a + b, 0) - (last.recettes.emprunts ?? 0);
    const dep = Object.values(last.depenses).reduce((a, b) => a + b, 0) - (last.depenses.travaux ?? 0);
    if (rec > dep) unlock(s, 'premier_benefice');
  }
  if (s.treasury >= 100000) unlock(s, 'coffres_pleins');
  // Un toit pour tous : 30 nuits de suite sans aventurier dehors
  c.toit = c.nuitDehors ? 0 : (c.toit ?? 0) + 1;
  c.nuitDehors = 0;
  if (c.toit >= 30) unlock(s, 'toit_pour_tous');
  if ((c.festins ?? 0) >= 100) unlock(s, 'table_des_rois');
  if ((c.remedesFabriques ?? 0) >= 100) unlock(s, 'apothicaire');
  c.sansMort = s.stats.deaths > (c.morts ?? 0) ? 0 : (c.sansMort ?? 0) + 1;
  c.morts = s.stats.deaths;
  if (c.sansMort >= 28) unlock(s, 'mois_sans_deuil');
  for (const a of s.adventurers) {
    if (a.level >= 15 && a.history.notable.includes('recrue de niveau 1')) unlock(s, 'pepiniere');
    if (a.level >= 30) unlock(s, 'veteran');
    if (a.level >= 25) addLegend(s, a, `a atteint le niveau ${a.level}`);
  }
  let freres = 0;
  for (let i = 0; i < s.adventurers.length; i++) for (let j = i + 1; j < s.adventurers.length; j++) {
    if (relStatus(rel(s, s.adventurers[i].id, s.adventurers[j].id)) === 'frere') freres++;
  }
  if (freres >= 5) unlock(s, 'fraternite');
  if (s.teams.some((t) => t.questsOk >= 20)) unlock(s, 'indomptables');
  if (s.adventurers.filter((a) => a.loyalty >= 90).length >= 10) unlock(s, 'fideles');
  if (s.world.palier === 'cite') unlock(s, 'batisseur');
  if (s.world.rivals.some((r) => r.bankruptSince !== null)) unlock(s, 'rivale_ecrasee');
  if (s.taxRate > 0) c.taxed = 1;
  // Équilibriste : aucune espèce hors de [30, 80] pendant toute une saison
  let balanced = true;
  for (const [zid, z] of Object.entries(s.populations)) for (const [id, v] of Object.entries(z)) {
    if (ZONES[zid]?.ville) continue;   // les environs des villes voisines ne comptent pas
    if (id === 'dragon' || id === 'golem' || id.includes('_') || ['herbe_plaie', 'camomille', 'truffe'].includes(id)) continue;
    if (v < 30 || v > 80) balanced = false;
  }
  if (!balanced) c.desequilibre = 1;
  if (s.treasury < 0) s.loans.lastDebtTick = s.tick;
  if (s.mode === 'chronique' && dayOf(s.tick) >= 100) unlock(s, 'chroniqueur', true);
  const richest = [...s.adventurers].sort((a, b) => b.gold - a.gold)[0];
  if (richest && (!s.book.records.richest || richest.gold > s.book.records.richest.gold)) s.book.records.richest = { name: richest.name, gold: richest.gold };
}

function seasonAchievements(s: GameState): void {
  const c = C(s);
  if (!c.desequilibre && dayOf(s.tick) > SEASON_DAYS) unlock(s, 'equilibriste');
  c.desequilibre = 0;
  if (s.loans.lastLoanTick < s.tick - 28 * H && s.loans.lastDebtTick < s.tick - 28 * H && dayOf(s.tick) > 28) unlock(s, 'sans_dette');
}

// ---------- Les prêteurs (1.1.3) ----------

export const loanCap = (s: GameState) => sealOf(s.rank).pret;
export const owed = (s: GameState) => (s.loans.banque?.principal ?? 0) + (s.loans.usurier?.principal ?? 0);

export function borrow(s: GameState, lender: 'banque' | 'usurier', amount: Money): string | null {
  const L = PROG.prets;
  amount = Math.round(amount);
  if (amount <= 0) return 'Montant invalide.';
  if (lender === 'banque') {
    if (s.treasury < 0) return 'La banque ne prête pas à une guilde endettée.';
    if (s.loans.banque?.late) return 'La banque refuse : un remboursement est en retard.';
    const cur = s.loans.banque?.principal ?? 0;
    if (cur + amount > loanCap(s)) return `Plafond de la banque : ${money(loanCap(s))} au rang actuel.`;
    s.loans.banque = { principal: cur + amount, since: s.loans.banque?.since ?? s.tick, due: s.tick + L.banqueEcheanceJours * H, late: false };
  } else {
    const cur = s.loans.usurier?.principal ?? 0;
    if (cur + amount > L.usurierPlafond) return `L'usurier ne prête pas plus de ${money(L.usurierPlafond)}.`;
    s.loans.usurier = { principal: cur + amount, since: s.loans.usurier?.since ?? s.tick, due: s.tick + L.usurierEcheanceJours * H, late: false };
  }
  // Un emprunt n'est pas un revenu : il n'entre ni dans la taxe royale ni dans la Prospérité.
  s.treasury += amount;
  s.today.recettes.emprunts = (s.today.recettes.emprunts ?? 0) + amount;
  s.loans.lastLoanTick = s.tick;
  log(s, 'economie', 'important', `Emprunt de ${money(amount)} auprès ${lender === 'banque' ? 'de la Banque des Marchands' : "de l'Usurier du Port"}.`);
  return null;
}

export function repay(s: GameState, lender: 'banque' | 'usurier', amount: Money): string | null {
  const loan = s.loans[lender];
  if (!loan) return 'Aucun prêt en cours.';
  const v = Math.min(Math.round(amount), loan.principal, Math.max(0, s.treasury));
  if (v <= 0) return 'Trésorerie insuffisante.';
  spend(s, 'remboursements', v);
  loan.principal -= v;
  if (loan.principal <= 0) s.loans[lender] = null;
  log(s, 'economie', 'info', `Remboursement de ${money(v)} ${lender === 'banque' ? 'à la banque' : "à l'usurier"}.`);
  return null;
}

function loanInterest(s: GameState): void {
  const L = PROG.prets;
  const day = dayOf(s.tick);
  if (isSeasonStart(day) && s.loans.banque) {
    const i = Math.round(s.loans.banque.principal * L.banqueTauxSaison);
    s.loans.banque.principal += i;
    log(s, 'economie', 'info', `Intérêts de la banque : ${money(i)} ajoutés à la dette.`);
  }
  if (weekdayOf(s.tick) === P.temps.jourDuRoi && s.loans.usurier) {
    const i = Math.round(s.loans.usurier.principal * (s.loans.usurier.taux ?? L.usurierTauxSemaine));
    s.loans.usurier.principal += i;
    log(s, 'economie', 'info', `L'usurier ajoute ${money(i)} d'intérêts.`);
  }
  for (const k of ['banque', 'usurier'] as const) {
    const loan = s.loans[k];
    if (!loan || s.tick < loan.due) continue;
    if (!loan.late) {
      loan.late = true;
      log(s, 'economie', 'critique', k === 'banque' ? 'Le prêt de la banque est échu : elle refuse tout nouveau crédit tant qu\'il n\'est pas soldé.' : "L'usurier réclame son dû. Ses gros bras rôdent autour du siège.");
    }
    if (weekdayOf(s.tick) === P.temps.jourDuRoi) {
      addRenown(s, -(k === 'banque' ? L.retardBanqueRenommee : L.retardUsurierRenommee));
      if (k === 'usurier') {
        for (const a of s.adventurers) a.morale = clamp(a.morale - 5, 0, 100);
        s.refectoire.damage = clamp(s.refectoire.damage + 20, 0, 100);
        log(s, 'economie', 'critique', "Visite des gros bras de l'usurier : mobilier brisé, aventuriers inquiets.");
      }
    }
  }
}

// ---------- Gaspard (6.4) ----------

export function advise(s: GameState, key: string, data: Record<string, string | number> = {}, once = true): void {
  const g = s.gaspard;
  if (!g || g.mode === 'off') return;
  const def = (PROG.gaspard as Record<string, { texte: string; ecran: string; alerte?: boolean }>)[key];
  if (!def) return;
  if (g.mode === 'alertes' && !def.alerte) return;
  if (once && g.said.includes(key)) return;
  if ((g.cooldown[key] ?? -1e9) > s.tick) return;
  if (!def.alerte && s.tick - g.last < 1) return;          // au plus un conseil par heure de jeu
  g.said.push(key);
  g.cooldown[key] = s.tick + 3 * H;
  g.last = s.tick;
  const text = def.texte.replace(/\{(\w+)\}/g, (_, k) => String(data[k] ?? ''));
  g.queue.push({ id: s.nextId++, key, text, screen: def.ecran, tick: s.tick, alert: !!def.alerte });
  if (g.queue.length > 3) g.queue.splice(0, g.queue.length - 3);
}

function hourlyGaspard(s: GameState): void {
  const day = dayOf(s.tick);
  const early = day <= 10;
  // Un conseil laissé sans réponse se périme au bout de 3 jours : il ne reste pas affiché toute la partie.
  if (s.gaspard?.queue.length) s.gaspard.queue = s.gaspard.queue.filter((a) => s.tick - a.tick < 3 * H);
  if (day === 1 && hourOf(s.tick) >= 7) advise(s, 'intro');
  if (early && s.doorCandidates.length) advise(s, 'candidat');
  const cereales = s.refectoire.pantry.filter((l) => l.denree === 'cereales').reduce((a, l) => a + l.qty, 0);
  if (cereales < 20 && !s.restock.cereales.enabled) advise(s, 'garde_manger', { n: cereales }, false);
  if (s.infirmerie.level === 0) {
    const hurt = s.adventurers.find((a) => a.states.some((st) => st.gravite >= 1));
    if (hurt) advise(s, 'infirmerie', { nom: hurt.name });
  }
  if (s.world.decisions.length) advise(s, 'decision');
  if (s.world.assault && s.world.assault.wave === 0) advise(s, 'assaut');
  if (s.stats.deaths > 0) advise(s, 'mort');
  if (s.treasury < 0) advise(s, 'dette', { n: diff(s).faillite - s.debtDays }, false);
  if (early) {
    const refus = Object.values(s.stats.services).reduce((a, x) => a + x.toCompetitor, 0);
    if (refus >= 4) advise(s, 'prix');
  }
  if (day >= 10 && s.rank === 1) advise(s, 'sceau');
  if (Object.values(s.populations).some((z) => Object.entries(z).some(([id, v]) => id !== 'golem' && id !== 'dragon' && v > 85))) {
    if (day >= 5) advise(s, 'proliferation');
  }
}

export function gaspardAck(s: GameState, id: number): void {
  s.gaspard.queue = s.gaspard.queue.filter((a) => a.id !== id);
}

// ---------- Livre de la guilde (6.9) ----------

function closeChapter(s: GameState): void {
  const prevTick = s.tick - H;
  const title = `${SEASONS[seasonOf(prevTick)]} de l'an ${yearOf(prevTick)}`;
  const lines = [...s.book.current];
  const r = s.book.records;
  if (r.bestQuest) lines.push(`Plus belle quête à ce jour : « ${r.bestQuest.title} » (${money(r.bestQuest.reward)}), par ${r.bestQuest.who}.`);
  if (r.richest) lines.push(`Aventurier le plus riche : ${r.richest.name} (${money(r.richest.gold)}).`);
  const longest = [...s.teams].sort((a, b) => b.questsOk - a.questsOk)[0];
  if (longest && longest.questsOk > 0) lines.push(`Équipe la plus aguerrie : ${longest.name} (${longest.questsOk} quêtes réussies).`);
  lines.push(`Fin de saison : ${s.adventurers.length} aventuriers, ${money(s.treasury)} en caisse, renommée ${Math.round(s.renown)}.`);
  s.book.chapters.push({ title, lines });
  s.book.current = [];
}

/** Ce qui mérite une ligne dans le Livre (appelé pour chaque entrée critique du journal). */
export function bookFromLog(s: GameState, text: string): void {
  if (!s.book) return;
  const plain = text.replace(/\[\[a:\d+\|([^\]]+)\]\]/g, '$1');
  if (/est mort|Victoire|Trophée|palier|Assaut|Épidémie|héraut|Réveil du dragon|Guerre|Émeute|Vague de monstres|Bête légendaire|fait fortune/.test(plain)) chronicle(s, plain);
}

// ---------- Les moments de la journée ----------

export function morningLegend(s: GameState): void {
  const day = dayOf(s.tick);
  if (isSeasonStart(day)) { closeChapter(s); seasonAchievements(s); }
  loanInterest(s);
  dailyAchievements(s);
  checkSeal(s);
  if (weekdayOf(s.tick) === 1) {
    s.book.weekly.push({ day, treasury: s.treasury, renown: Math.round(s.renown), prosperity: Math.round(s.prosperity), danger: s.danger, adventurers: s.adventurers.length });
    if (s.book.weekly.length > 160) s.book.weekly.splice(0, s.book.weekly.length - 160);
  }
}

// ---------- Salle de duel (terrain 4) et Arène (terrain 5), 1.7.4 ----------

const volunteers = (s: GameState) => s.adventurers.filter((a) => a.runId === null && a.activity.kind !== 'hospitalise'
  && a.activity.kind !== 'prison' && (a.fierte >= 50 || a.traits.includes('bagarreur')) && a.hp > 0);

function duel(s: GameState, x: Adventurer, y: Adventurer): Adventurer {
  const score = (a: Adventurer) => a.level * 3 + a.attrs.FOR + a.attrs.AGI + rand(s, 'ia') * 10;
  return score(x) >= score(y) ? x : y;
}

function weeklyDuels(s: GameState): void {
  const v = volunteers(s);
  if (v.length < 2) return;
  const x = pick(s, 'ia', v);
  const y = pick(s, 'ia', v.filter((a) => a !== x));
  const w = duel(s, x, y);
  addRel(s, x, y, -8);
  w.respect = clamp(w.respect + 1, 0, 100);
  log(s, 'aventuriers', 'info', `Salle de duel : ${advLink(w)} l'emporte sur ${advLink(w === x ? y : x)}. Rancune en vue.`);
}

function arena(s: GameState): void {
  const v = volunteers(s);
  if (v.length < 2) return;
  const x = pick(s, 'ia', v);
  const y = pick(s, 'ia', v.filter((a) => a !== x));
  const w = duel(s, x, y);
  w.respect = clamp(w.respect + 2, 0, 100);
  const recette = Math.round(PROG.arene.recette * (1 + s.prosperity / 50) * (s.world.palier === 'cite' ? 2 : 1));
  earn(s, 'arene', recette);
  addRenown(s, PROG.renommeeHebdo.arene);
  log(s, 'guilde', 'important', `Spectacle à l'Arène : ${advLink(w)} triomphe de ${advLink(w === x ? y : x)} devant la foule (${money(recette)} de recette).`);
}

/** Les faits critiques du journal nourrissent le Livre de la guilde (6.9). */
function scanJournal(s: GameState): void {
  const from = C(s).bookScan ?? 0;
  for (const e of s.journal) if (e.id > from && e.lvl === 'critique') bookFromLog(s, e.text);
  if (s.journal.length) C(s).bookScan = s.journal[s.journal.length - 1].id;
}

export function hourlyLegend(s: GameState): void {
  if (s.legend.heraldTick !== null && s.tick >= s.legend.heraldTick) herald(s);
  const h = hourOf(s.tick);
  if (h === 20 && weekdayOf(s.tick) === 3 && s.terrain.level >= 4) weeklyDuels(s);
  if (h === PROG.arene.heure && weekdayOf(s.tick) === PROG.arene.jour && s.terrain.level >= 5) arena(s);
  scanJournal(s);
  if (hourOf(s.tick) === 3 && s.adventurers.some((a) => a.activity.kind === 'dehors')) bump(s, 'nuitDehors');
  const suites = s.adventurers.filter((a) => a.activity.kind === 'dormir' && a.activity.bed === 'suite').length;
  if (suites >= 4) unlock(s, 'palais');
  hourlyGaspard(s);
}

// ---------- Épilogue (6.6) ----------

export interface Epilogue { victory: boolean; title: string; bilan: string[]; destins: string[]; monde: string[] }

function fate(a: Adventurer, status: 'actif' | 'parti' | 'mort', reason = ''): string {
  const cls = className(a.classe).toLowerCase();
  if (status === 'mort') return `${a.name}, ${cls} de niveau ${a.level}, repose au cimetière du Bourg. ${a.history.questsOk} quêtes, et un nom que l'on cite encore à la Taverne du Pont.`;
  if (status === 'parti') return `${a.name}, ${cls}, a quitté la guilde (${reason}). On raconte qu'${a.gold > 2000 ? 'il vit de ses rentes dans une maison au bord du fleuve' : 'il court encore les routes'}.`;
  const rang = rangForLevel(a.level);
  if (a.level >= 20) return `${a.name}, ${cls} de rang ${rang}, est devenu une légende vivante. Les recrues baissent la voix quand il entre au réfectoire.`;
  if (a.respect >= 70) return `${a.name}, ${cls} de rang ${rang}, est la conscience de la guilde : respecté de tous, il forme les plus jeunes.`;
  return `${a.name}, ${cls} de rang ${rang}, poursuit sa route avec la guilde, ${a.morale >= 60 ? 'le cœur léger' : 'sans grand enthousiasme'}.`;
}

export function epilogue(s: GameState): Epilogue {
  const victory = s.legend.victoryTick !== null && !s.gameOver;
  const days = dayOf(s.tick);
  const bilan = [
    `${days} jours d'existence, ${s.stats.recruits + 10} aventuriers accueillis, ${s.stats.questsOk} missions réussies et ${s.stats.questsFail} échecs.`,
    `${s.stats.deaths} mort${s.stats.deaths > 1 ? 's' : ''} au service de la guilde. Fortune finale : ${money(s.treasury)}. Renommée : ${Math.round(s.renown)} points, ${sealOf(s.rank).nom}.`,
    `${Object.keys(s.legend.achievements).length} hauts faits.`,
  ];
  const actifs = [...s.adventurers].sort((a, b) => b.level * 10 + b.respect - (a.level * 10 + a.respect)).slice(0, 3);
  const destins = actifs.map((a) => fate(a, 'actif'));
  for (const d of [...s.departed].reverse().filter((x) => x.reason === 'mort').slice(0, 1)) {
    destins.push(`${d.name}, ${className(d.classe).toLowerCase()} de niveau ${d.level}, repose au cimetière du Bourg. On grave encore des fleurs sur sa tombe.`);
  }
  for (const d of [...s.departed].reverse().filter((x) => x.reason === 'retraite').slice(0, 1)) {
    destins.push(`${d.name} a pris sa retraite fortune faite et raconte ses exploits à qui veut l'entendre.`);
  }
  const palier = { bourg: 'reste un bourg modeste', ville: 'est devenue une ville prospère', cite: 'est devenue une cité florissante' }[s.world.palier];
  const monde = [`La ville ${palier} (prospérité ${Math.round(s.prosperity)}).`];
  for (const r of s.world.rivals) {
    monde.push(r.bankruptSince !== null ? `${r.nom} a fermé ses portes.`
      : r.renown > s.renown ? `${r.nom} reste une rivale redoutée (${Math.round(r.renown)} points).`
        : `${r.nom} vit dans l'ombre de la guilde (${Math.round(r.renown)} points).`);
  }
  return {
    victory,
    title: victory ? 'Le Sceau de Mithril' : 'La guilde est saisie',
    bilan, destins, monde,
  };
}

