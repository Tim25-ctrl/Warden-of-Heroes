// Le monde vivant (GDD chapitre 5) : saisons, Prospérité et paliers de la ville, événements,
// chaînes et rumeurs, guildes rivales, assauts, épidémies, Renommée (6.1.1).
import { createAdventurer, gainXp, hasTrait, profileOf, rangIndex, xpRequired } from './adventurers';
import { addAilment, removeAilment, worstGravity } from './ailments';
import { fight } from './combat';
import { DENREES, EVENTS, NAMES, P, REMEDES, RESOURCES, ROOM_IDS, SPECIES, ZONE_IDS, ZONES } from './data';
import { chefSkill, clamp, dishPrice, dishRef, IP, roomLevelCost } from './economy';
import { advLink, dayOf, hourOf, money, SEASONS, seasonOf, weekdayOf, yearOf } from './format';
import { earn, log, spend, think } from './journal';
import { conscript, killAdventurer, leave } from './lifecycle';
import { addMod, modAdd, present } from './mods';
import { diff, onQuestDone, unlock } from './legend';
import { harvested, huntClosed, killed, plantsOf, popOf, regionalDanger } from './populations';
import { guildReach, makeChasse, makeExterminationFor, makeLegendQuest } from './quests';
import { chance, pick, randInt, range, weighted } from './rng';
import { createProf } from './training';
import type {
  Adventurer, Decision, DecisionOption, GameState, NewsItem, Palier, Quest, QuestRun, Rival, RoomId, WorldState,
} from './types';

const W = () => P.monde;
const H = 24;
type Data = Record<string, string | number>;

// ---------- Initialisation ----------

/** Ajoute une guilde rivale (conversion d'une ancienne sauvegarde). */
export function addRival(s: GameState, id: string, nom: string, profil: Rival['profil'], renown: number): void {
  s.world.rivals.push(makeRival(s, id, nom, profil, renown));
}

function makeRival(s: GameState, id: string, nom: string, profil: Rival['profil'], renown: number): Rival {
  return {
    id, nom, profil, renown, size: Math.round(8 + renown / 4),
    tarifs: profil === 'prestige' ? 1.3 : profil === 'chasseurs' ? 1 : 0.8, taux: profil === 'prestige' ? 0.2 : profil === 'chasseurs' ? 0.12 : 0.08,
    nextAction: s.tick + H * randInt(s, 'monde', W().rivaleActionJours[0], W().rivaleActionJours[1]), bankruptSince: null,
  };
}

export function initWorld(s: GameState): WorldState {
  const w: WorldState = {
    palier: 'bourg', palierStreak: 0, mods: [], events: [], scheduled: [], rumors: [], decisions: [], rivals: [], news: [],
    assault: null, lastAssault: -1e9, epidemic: null, lastEpidemic: -1e9, counters: {}, escortes: [], townSpend: [0],
    history: [], popHistory: [], conscripts: [], damaged: {},
  };
  s.world = w;
  w.rivals.push(makeRival(s, 'aube', "La Compagnie de l'Aube", 'prestige', 35));
  w.rivals.push(makeRival(s, 'crocs', 'Les Crocs Libres', 'mercenaires', 20));
  w.rivals.push(makeRival(s, 'chene', 'La Confrérie du Chêne', 'chasseurs', 25));   // ajout v1.1
  scheduleSeason(s);
  scheduleCrises(s);
  return w;
}

// ---------- Outils ----------

export function news(s: GameState, rubrique: NewsItem['rubrique'], text: string): void {
  s.world.news.push({ tick: s.tick, rubrique, text });
  if (s.world.news.length > 200) s.world.news.splice(0, s.world.news.length - 200);
}

function fill(text: string, data?: Data): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => String(data?.[k] ?? ''));
}

export function addRenown(s: GameState, v: number): void {
  s.renown = Math.max(0, Math.round((s.renown + v) * 10) / 10);
}

export const PALIER_NAMES: Record<Palier, string> = { bourg: 'Bourg', ville: 'Ville', cite: 'Cité' };
export const GAZETTE: Record<Palier, string> = { bourg: 'La Feuille du Bourg', ville: 'La Gazette de la Ville', cite: 'Le Héraut de la Cité' };

export function dangerTier(d: number): { nom: string; idx: number } {
  if (d < 20) return { nom: 'Calme', idx: 0 };
  if (d < 40) return { nom: 'Tendu', idx: 1 };
  if (d < 60) return { nom: 'Menaçant', idx: 2 };
  if (d < 80) return { nom: 'Critique', idx: 3 };
  return { nom: 'Assiégé', idx: 4 };
}

const tierFor = (p: number): Palier => (p >= W().paliers.cite ? 'cite' : p >= W().paliers.ville ? 'ville' : 'bourg');
const PALIERS: Palier[] = ['bourg', 'ville', 'cite'];

/** Un aventurier au siège, en état de combattre ou d'être concerné par ce qui s'y passe. */
const atHome = (a: Adventurer) => a.runId === null && !['quete', 'hospitalise', 'prison'].includes(a.activity.kind);

// ---------- Le tableau : clients, urgence, quêtes de la Couronne (5.1.1, 5.3) ----------

/** Appelé pour chaque quête générée : client noble au palier Ville, prime d'urgence quand la région est menacée. */
export function decorateQuest(s: GameState, q: Quest): void {
  if (q.type === 'aide' || q.clientType === 'guilde') return;
  let mult = 1;
  if (s.world.palier !== 'bourg' && q.clientType === 'villageois' && q.type !== 'escorte' && chance(s, 'quetes', W().noblesPart)) {
    q.clientType = 'nobles';
    q.client = pick(s, 'noms', NAMES.nobles as string[]);
    mult *= W().noblesMult;
  }
  if (q.clientType === 'couronne') mult *= s.world.palier === 'cite' ? W().couronneMultCite : W().couronneMult;
  if (s.danger >= 40) mult *= W().menacantRecompense;
  q.reward = Math.round(q.reward * mult);
  if (q.perHead) q.perHead = Math.round(q.perHead * mult);
}

/** Poids des types de quêtes selon la saison et le Danger (5.1.1, 5.2). */
export function questMixWeights(s: GameState, base: Record<string, number>): Record<string, number> {
  const w = { ...base };
  if (seasonOf(s.tick) === 1) w.escorte = (w.escorte ?? 0) * W().eteEscortes;
  if (s.danger >= 40) w.protection = (w.protection ?? 0) * 2;
  if (s.danger >= 60) w.escorte = (w.escorte ?? 0) * W().critiqueEscortes;
  return w;
}

export const questCountFactor = (s: GameState) => (s.danger < 20 ? W().calmeQuetes : 1);

/** Danger Critique : chaque matin, la Couronne publie une chasse contre l'espèce la plus menaçante. */
function crownQuest(s: GameState): void {
  if (s.danger < 60) return;
  let best: { z: string; sp: string; v: number } | null = null;
  for (const z of ZONE_IDS) for (const sp of Object.keys(ZONES[z].especes)) {
    if (sp === 'dragon' || sp === 'golem' || huntClosed(s, z, sp)) continue;
    const v = popOf(s, z, sp) * SPECIES[sp].menace;
    if (!best || v > best.v) best = { z, sp, v };
  }
  if (!best) return;
  const q = makeChasse(s, best.z, best.sp, undefined, 'couronne');
  if (q) { q.client = 'la Couronne'; decorateQuest(s, q); s.board.push(q); }
}

// ---------- Renommée (6.1.1) ----------

export function onQuestEnd(s: GameState, run: QuestRun, ok: boolean, team: Adventurer[]): void {
  const q = run.quest;
  if (q.type === 'aide') return;
  onQuestDone(s, q, ok, team);
  const R = P.renommee;
  if (ok) {
    const noble = q.clientType === 'nobles' || q.clientType === 'couronne';
    addRenown(s, R.quete[q.rang] * (noble ? R.nobleMult : 1));
    if (q.legend) {
      addRenown(s, R.trophee);
      log(s, 'guilde', 'critique', `Trophée ! ${team.map(advLink).join(', ')} ramènent la dépouille de ${q.legend}. La guilde gagne en renommée.`);
      news(s, 'exploits', `Les aventuriers de la guilde ont abattu ${q.legend}. Le trophée trône désormais dans le grand hall.`);
    } else if (rangIndex(q.rang) >= 3) {
      news(s, 'exploits', `${team.map((a) => a.name).join(', ')} ont accompli « ${q.title} » (rang ${q.rang}).`);
    }
    // Ajout v1.1 : le dragon terrassé met fin à la crise (les caravanes reprennent la route des Pics).
    if (q.target === 'dragon' && s.world.events.some((e) => e.id === 'dragon')) {
      s.world.events = s.world.events.filter((e) => e.id !== 'dragon');
      s.world.mods = s.world.mods.filter((m) => m.source !== 'dragon');
      log(s, 'monde', 'critique', 'Le dragon est mort : les caravanes reprennent la route des Pics.');
    }
  } else {
    addRenown(s, -R.echec[q.rang]);
  }
  if (q.type === 'escorte') {
    s.world.escortes.push({ tick: s.tick, ok });
    s.world.escortes = s.world.escortes.filter((e) => e.tick > s.tick - 7 * H);
  }
  // Un aventurier revenu malade du Marais peut déclencher une épidémie (5.7).
  if (q.zone === 'marais' && team.some((a) => a.states.some((st) => st.etat === 'maladie')) && chance(s, 'monde', W().retourMaraisEpidemie)) {
    startEpidemic(s, 'un aventurier revenu malade du Marais');
  }
}

/**
 * Quête expirée sans preneur (4.3.4) : la guilde perd un peu de renommée, mais seulement pour une quête de son rang de base
 * (ajusté en tranche 3 : la guilde ne peut pas tout prendre, et la pleine pénalité vidait la renommée).
 */
export function onQuestExpired(s: GameState, q: Quest): void {
  if (q.clientType === 'guilde' || q.type === 'aide') return;
  if (rangIndex(q.rang) <= guildReach(s) - 1) addRenown(s, -P.renommee.echec[q.rang] * P.renommee.expiration);
}

export function onAdventurerDeath(s: GameState, a: Adventurer, text: string): void {
  addRenown(s, -P.renommee.mort);
  news(s, 'exploits', `Nécrologie : ${text}`);
  void a;
}

// ---------- Prospérité, paliers, saisons (5.1.2, 5.2, 5.3) ----------

function updateProsperity(s: GameState): void {
  const w = s.world;
  const ins = W().insecuriteCoef * Math.max(0, s.danger - W().insecuriteSeuil);
  const ok = w.escortes.filter((e) => e.ok).length;
  const ko = w.escortes.length - ok;
  const commerce = clamp(W().commerceOk * ok + W().commerceEchec * ko, -W().commerceMax, W().commerceMax);
  let flux = w.townSpend.reduce((a, b) => a + b, 0);
  for (const d of s.ledger.slice(-7)) for (const v of Object.values(d.recettes)) flux += v;
  const apport = Math.min(W().apportMax, flux / W().apportDiviseur);
  const target = clamp(50 - ins + commerce + apport + W().saisonProsperite[seasonOf(s.tick)] + modAdd(s, 'prosperite'), 0, 100);
  s.prosperity = clamp(s.prosperity + W().prosperiteConvergence * (target - s.prosperity) + modAdd(s, 'prosperite_jour'), 0, 100);
  s.prosperity = Math.round(s.prosperity * 100) / 100;
}

function updatePalier(s: GameState): void {
  const w = s.world;
  let want = tierFor(s.prosperity);
  // Ajout v1.1 : une ville ne décline que sous le seuil de son palier moins une marge, pour ne pas osciller.
  const floor = w.palier === 'cite' ? W().paliers.cite : w.palier === 'ville' ? W().paliers.ville : 0;
  if (PALIERS.indexOf(want) < PALIERS.indexOf(w.palier) && s.prosperity >= floor - W().palierMarge) want = w.palier;
  if (want === w.palier) { w.palierStreak = 0; return; }
  w.palierStreak += 1;
  if (w.palierStreak < W().palierJours) return;
  const i = PALIERS.indexOf(w.palier) + (PALIERS.indexOf(want) > PALIERS.indexOf(w.palier) ? 1 : -1);
  const up = i > PALIERS.indexOf(w.palier);
  w.palier = PALIERS[i];
  w.palierStreak = 0;
  const text = up
    ? `La ville grandit : elle passe au palier ${PALIER_NAMES[w.palier]}. ${w.palier === 'ville' ? 'Le Collectionneur ouvre boutique et les nobles publient leurs quêtes.' : 'Le Forgeron forge désormais l\'équipement draconique.'}`
    : `La ville décline : elle retombe au palier ${PALIER_NAMES[w.palier]}.`;
  log(s, 'monde', 'critique', text);
  news(s, 'une', text);
}

function seasonStart(s: GameState): void {
  const sea = seasonOf(s.tick);
  const text = ['Le printemps arrive : les bêtes mettent bas et les plantes repoussent.',
    "L'été s'installe : les caravanes se multiplient, la viande se gâte plus vite.",
    "L'automne dore les champs : les denrées sont bon marché.",
    "L'hiver tombe : les bêtes affamées s'approchent de la ville."][sea];
  log(s, 'monde', 'important', `${SEASONS[sea]} de l'an ${yearOf(s.tick)}. ${text}`);
  news(s, 'une', text);
  scheduleSeason(s);
  if (sea === 0 && dayOf(s.tick) > 1) scheduleCrises(s);
}

// ---------- Programmation des événements (5.4.1) ----------

function eligible(s: GameState, id: string, sea = seasonOf(s.tick), day = dayOf(s.tick)): boolean {
  const e = EVENTS[id];
  const c = e.conditions ?? {};
  if (c.chaine) return false;
  if (c.saison && !c.saison.includes(sea)) return false;
  if (c.pasSaison && c.pasSaison.includes(sea)) return false;
  if (c.prosperiteMax !== undefined && s.prosperity > c.prosperiteMax) return false;
  if (c.prosperiteMin !== undefined && s.prosperity < c.prosperiteMin) return false;
  if (c.cuisineMin !== undefined && s.cuisine.level < c.cuisineMin) return false;
  if (c.jourMin !== undefined && day < c.jourMin) return false;
  if (c.bagarreur && !s.adventurers.some((a) => hasTrait(a, 'bagarreur') && atHome(a))) return false;
  return true;
}

function pickEvent(s: GameState, cat: 'petit' | 'majeur' | 'crise', sea?: number, day?: number): string | null {
  const w: Record<string, number> = {};
  for (const [id, e] of Object.entries(EVENTS)) {
    if (e.categorie !== cat || e.poids <= 0 || !eligible(s, id, sea, day)) continue;
    if (s.world.events.some((x) => x.id === id)) continue;
    // Un petit événement ne revient pas avant quelques semaines (trois inspecteurs royaux en une semaine, c'est trop).
    const last = s.world.lastFired?.[id];
    if (cat === 'petit' && !e.sansDelai && last !== undefined && s.tick - last < W().petitRecurrenceJours * H) continue;
    w[id] = e.poidsSceau && s.rank >= e.poidsSceau.rang ? e.poidsSceau.poids : e.poids;
  }
  return Object.keys(w).length ? weighted(s, 'monde', w) : null;
}

/** Données tirées à l'avance (zone, espèce…), pour que la rumeur et l'événement parlent de la même chose. */
function prepare(s: GameState, id: string): Data {
  const zoneOf = (sp: string) => ZONE_IDS.filter((z) => ZONES[z].especes[sp] !== undefined);
  if (id === 'bete_legendaire') {
    const z = pick(s, 'monde', ['foret', 'collines', 'marais']);
    const sp = pick(s, 'monde', Object.keys(ZONES[z].especes).filter((x) => x !== 'dragon' && x !== 'golem'));
    return { zone: z, espece: sp, lieu: ZONES[z].lieu, legende: (NAMES.legendes as Record<string, string>)[sp] ?? `le Grand ${SPECIES[sp].nom}` };
  }
  if (id === 'vague') {
    const sp = pick(s, 'monde', ['loup', 'gobelin', 'araignee', 'sanglier', 'rat']);
    const z = pick(s, 'monde', zoneOf(sp));
    return { zone: z, espece: SPECIES[sp].pluriel, especeId: sp, lieu: ZONES[z].lieu.replace(/^dans |^à |^sur /, 'des ').replace('des les', 'des') };
  }
  if (id === 'mode_noblesse') {
    const opts = Object.keys(RESOURCES).filter((r) => !RESOURCES[r].rare && (RESOURCES[r].demande ?? 0) > 0 && RESOURCES[r].categorie !== 'viande');
    const r = pick(s, 'monde', opts);
    return { res: r, ressource: RESOURCES[r].nom.toLowerCase(), mult: randInt(s, 'monde', 2, 3) };
  }
  return {};
}

function wrongDetail(s: GameState, id: string, data: Data): Data {
  if (data.zone) {
    const z = pick(s, 'monde', ZONE_IDS.filter((x) => x !== data.zone && x !== 'ville'));
    return { ...data, lieu: ZONES[z].lieu };
  }
  void id;
  return data;
}

function schedule(s: GameState, id: string, fireTick: number): void {
  const e = EVENTS[id];
  const data = prepare(s, id);
  const roll = range(s, 'monde', 0, 1);
  const fiab = diff(s).rumeurs;   // 75 % en Normal (5.4.5, 6.5)
  const real = !e.rumeur || roll < fiab || roll >= (1 + fiab) / 2;
  s.world.scheduled.push({ eventId: id, tick: fireTick, data, real });
  if (e.rumeur) {
    const shown = roll >= (1 + fiab) / 2 ? wrongDetail(s, id, data) : data;
    const before = randInt(s, 'monde', W().rumeurJours[0], W().rumeurJours[1]);
    s.world.rumors.push({ id: s.nextId++, text: fill(e.rumeur, shown), tick: Math.max(s.tick, fireTick - before * H), fireTick, eventId: id, real });
  }
}

/** Un événement majeur par saison, à une date aléatoire (5.4.1). */
function scheduleSeason(s: GameState): void {
  const id = pickEvent(s, 'majeur');
  if (!id) return;
  const seasonStartDay = Math.floor((dayOf(s.tick) - 1) / 28) * 28 + 1;
  const day = seasonStartDay + randInt(s, 'monde', 4, 25);
  schedule(s, id, (day - 1) * H + 8);
}

/** Une ou deux crises par an, à partir du jour 60 (5.4.1). */
function scheduleCrises(s: GameState): void {
  const yearStart = (yearOf(s.tick) - 1) * 112 + 1;
  const n0 = randInt(s, 'monde', W().crisesParAn[0], W().crisesParAn[1]) * diff(s).crises;   // difficulté (6.5)
  const bonus = s.rank >= W().crisesBonusSceau.rang ? W().crisesBonusSceau.nombre : 0;   // ajout v1.1
  const n = Math.floor(n0) + (chance(s, 'monde', n0 % 1) ? 1 : 0) + bonus;
  for (let i = 0; i < n; i++) {
    const from = Math.max(yearStart + 5, W().criseJourMin);
    const day = randInt(s, 'monde', from, yearStart + 110);
    const id = pickEvent(s, 'crise', seasonOf((day - 1) * H), day);
    if (id) schedule(s, id, (day - 1) * H + 9);
  }
}

// ---------- Déclenchement d'un événement (5.4.2) ----------

export function fireEvent(s: GameState, id: string, data: Data = {}): void {
  const e = EVENTS[id];
  if (!e) return;
  const until = s.tick + e.duree * H;
  const d: Data = { ...data };
  for (const fx of e.effets ?? []) addMod(s, fx.key, until, id, { mult: fx.mult, add: fx.add });
  const proceed = runAction(s, id, d, until);
  if (!proceed) return;
  (s.world.lastFired ??= {})[id] = s.tick;
  const text = fill(e.texte, d);
  s.world.events.push({ id, nom: e.nom, until, startTick: s.tick, text, data: d });
  log(s, 'monde', e.categorie === 'petit' ? 'important' : 'critique', text.startsWith(e.nom) ? text : `${e.nom} : ${text}`);
  news(s, 'une', text);
  if (e.choix) {
    openDecision(s, `evt:${id}`, e.nom, text, e.choix.map((c) => ({ id: c.id, label: c.cost ? `${c.label} (${money(c.cost)})` : c.label, cost: c.cost })), e.defaut ?? e.choix[0].id, d);
  }
}

/** Effets propres à chaque événement. Renvoie false si l'événement n'a finalement pas lieu. */
function runAction(s: GameState, id: string, d: Data, until: number): boolean {
  const e = EVENTS[id];
  switch (e.action) {
    case 'caravane': {
      const cat = pick(s, 'monde', ['peau', 'viande', 'os', 'organe', 'plante']);
      for (const [rid, r] of Object.entries(RESOURCES)) if (r.categorie === cat && s.market[rid]) s.market[rid].S *= 1.5;
      d.categorie = { peau: 'peaux et cuirs', viande: 'viandes', os: 'os, crocs et carapaces', organe: 'organes et glandes', plante: 'plantes' }[cat] ?? cat;
      return true;
    }
    case 'mode': {
      if (!d.res) Object.assign(d, prepare(s, 'mode_noblesse'));
      addMod(s, `demande:${d.res}`, until, id, { mult: Number(d.mult) });
      return true;
    }
    case 'marchand': {
      const inf = s.infirmerie.level > 0;
      const lot = inf ? { potion: 5, bandages: 5, antidote: 3 } : null;
      const full = inf
        ? Object.entries(lot!).reduce((a, [r, q]) => a + (REMEDES[r as keyof typeof REMEDES]?.prix ?? 0) * q, 0)
        : DENREES.epices.prix * 20;
      const cost = Math.round(full * 0.7 * IP(s));
      d.lot = inf ? '5 potions, 5 bandages et 3 antidotes' : '20 mesures d\'épices';
      d.cout = cost;
      openDecision(s, 'marchand', e.nom, fill(e.texte, d), [{ id: 'acheter', label: `Acheter (${money(cost)})`, cost }, { id: 'non', label: 'Passer son chemin' }], 'non', d);
      return true;
    }
    case 'vol': {
      const it = present(s, s.staff).find((m) => m.role === 'intendant' && m.c >= 50);
      if (it) { log(s, 'guilde', 'info', `${it.name} a déjoué une tentative de vol dans le garde-manger.`); return false; }
      const lots = s.refectoire.pantry.filter((l) => l.qty > 0);
      if (!lots.length) return false;
      const den = pick(s, 'monde', [...new Set(lots.map((l) => l.denree))]);
      const pct = range(s, 'monde', 0.1, 0.3);
      let lost = 0;
      for (const l of lots.filter((x) => x.denree === den)) { const q = Math.floor(l.qty * pct); l.qty -= q; lost += q; }
      d.perte = `${lost} ${DENREES[den].nom.toLowerCase()} envolés`;
      return lost > 0;
    }
    case 'emeute': {
      const avg = (dishPrice(s, 'gruau') / dishRef(s, 'gruau') + dishPrice(s, 'ragout') / dishRef(s, 'ragout')) / 2;
      if (avg > 1.3) {
        for (const l of s.refectoire.pantry) l.qty = Math.floor(l.qty * 0.7);
        s.refectoire.damage = clamp(s.refectoire.damage + 30, 0, 100);
        log(s, 'guilde', 'critique', 'Les émeutiers jugent les repas de la guilde trop chers : le réfectoire est pillé !');
      }
      openDecision(s, 'emeute', e.nom, 'La foule a faim. La guilde distribue-t-elle du gruau gratuitement (30 céréales) ?',
        [{ id: 'gruau', label: 'Distribuer du gruau' }, { id: 'non', label: 'Ne rien faire' }], 'non', d);
      return true;
    }
    case 'migration': {
      const opts: [string, string][] = [];
      for (const z of ZONE_IDS) for (const sp of Object.keys(ZONES[z].especes)) {
        if (sp !== 'dragon' && sp !== 'golem' && popOf(s, z, sp) < P.populations.rarefaction) opts.push([z, sp]);
      }
      if (!opts.length) return false;
      // Ajusté en v1.1 : les migrations repeuplent d'abord les espèces disparues ou dont la chasse est fermée.
      const urgent = opts.filter(([z, sp]) => popOf(s, z, sp) < 1 || huntClosed(s, z, sp));
      const [z, sp] = pick(s, 'monde', urgent.length ? urgent : opts);
      s.populations[z][sp] = clamp(s.populations[z][sp] + 30, 0, 100);
      d.espece = SPECIES[sp].pluriel; d.lieu = ZONES[z].lieu;
      return true;
    }
    case 'legende': {
      if (!d.zone) Object.assign(d, prepare(s, 'bete_legendaire'));
      const q = makeLegendQuest(s, String(d.zone), String(d.espece), String(d.legende), until);
      decorateQuest(s, q);
      s.board.push(q);
      d.espece = SPECIES[String(d.espece)].pluriel;
      d.legende = String(d.legende).charAt(0).toUpperCase() + String(d.legende).slice(1);
      return true;
    }
    case 'vague': {
      if (!d.zone) Object.assign(d, prepare(s, 'vague'));
      const sp = String(d.especeId);
      const zones = [String(d.zone), ...ZONE_IDS.filter((z) => z !== d.zone && ZONES[z].especes[sp] !== undefined && chance(s, 'monde', 0.4)).slice(0, 1)];
      for (const z of zones) {
        s.populations[z][sp] = 100;
        s.world.counters[`vague:${z}:${sp}`] = 0;
        const q = makeExterminationFor(s, z, sp, 'couronne');
        q.client = 'la Couronne';
        decorateQuest(s, q);
        s.board.push(q);
      }
      return true;
    }
    case 'dragon': {
      s.populations.pics.dragon = 100;
      const q = makeChasse(s, 'pics', 'dragon', 1, 'couronne');
      if (q) { q.client = 'la Couronne'; q.title = 'Terrasser le jeune dragon des Pics'; q.expires = until; decorateQuest(s, q); s.board.push(q); }
      return true;
    }
    case 'moral': {
      for (const a of s.adventurers) a.morale = clamp(a.morale + (e.valeur ?? 5), 0, 100);
      return true;
    }
    case 'inspecteur': {
      // Un seul message au journal : le verdict est intégré au texte de l'événement.
      if (s.taxRate > 0.3 || s.treasury < 0) {
        spend(s, 'amendesRoyales', 5000);
        d.issue = 'amende';
        d.verdict = `il inflige une amende de ${money(5000)} (${s.taxRate > 0.3 ? 'taxe sur le butin abusive' : 'guilde endettée'})`;
      } else {
        d.verdict = "il n'a rien trouvé à redire";
      }
      return true;
    }
    case 'recrue': {
      const a = createAdventurer(s, { level: randInt(s, 'aventuriers', 8, 12), goldMin: 500, goldMax: 1500 });
      s.doorCandidates.push({ ...a, doorUntil: s.tick + 48 });
      log(s, 'aventuriers', 'important', `Une recrue exceptionnelle se présente à la porte : ${a.name}, niveau ${a.level}.`);
      return true;
    }
    case 'gourmet': {
      if (chefSkill(s) >= 70) { addRenown(s, 3); d.issue = 'ravi'; } else addRenown(s, -1);
      return true;
    }
    case 'guerre': {
      s.world.counters.guerre = until;
      return true;
    }
    case 'epidemie': {
      return startEpidemic(s, EVENTS[id].nom.toLowerCase());
    }
    case 'assaut': return true;
  }
  if (id === 'rixe') {
    const cands = s.adventurers.filter((a) => hasTrait(a, 'bagarreur') && atHome(a));
    if (!cands.length) return false;
    const a = pick(s, 'monde', cands);
    a.activity = { kind: 'prison', until: s.tick + 72, place: 'ville' };
    a.lookingForQuest = false;
    d.aventurier = a.name; d.advId = a.id;
  }
  return true;
}

// ---------- Décisions (5.4.2, 7.7.1) ----------

function openDecision(s: GameState, kind: string, title: string, text: string, options: DecisionOption[], defaut: string, data?: Data): Decision {
  const dec: Decision = { id: s.nextId++, kind, title, text, options, defaut, tick: s.tick, deadline: s.tick + W().delaiDecisionH, data };
  s.world.decisions.push(dec);
  log(s, 'guilde', 'important', `Décision attendue : ${title}.`);
  return dec;
}

/** Réponse du joueur, ou option par défaut à l'échéance. Renvoie un message d'erreur éventuel. */
export function decide(s: GameState, id: number, optionId: string, auto = false): string | null {
  const dec = s.world.decisions.find((x) => x.id === id);
  if (!dec) return 'Cette décision a déjà été prise.';
  const opt = dec.options.find((o) => o.id === optionId) ?? dec.options.find((o) => o.id === dec.defaut)!;
  if (opt.cost && opt.cost > s.treasury) {
    if (!auto) return 'Trésorerie insuffisante.';
    return decide(s, id, dec.defaut === opt.id ? dec.options.find((o) => !o.cost)?.id ?? dec.defaut : dec.defaut, true);
  }
  s.world.decisions = s.world.decisions.filter((x) => x !== dec);
  if (opt.cost) spend(s, 'evenements', opt.cost);
  const d = dec.data ?? {};
  const until = (days: number) => s.tick + days * H;
  log(s, 'guilde', 'info', `${dec.title} : ${opt.label}${auto ? ' (option par défaut, faute de réponse)' : ''}.`);
  switch (dec.kind) {
    case 'evt:concours':
      if (opt.id === 'participer') {
        if (chance(s, 'monde', clamp(chefSkill(s) / 100, 0.05, 0.9))) {
          addRenown(s, 5);
          log(s, 'guilde', 'important', 'Le réfectoire de la guilde remporte le concours de cuisine !');
          news(s, 'exploits', 'Le cuisinier de la guilde remporte le concours de cuisine du Bourg.');
        } else log(s, 'guilde', 'info', 'Le réfectoire ne remporte pas le concours, cette fois.');
      }
      break;
    case 'evt:rixe': {
      const a = s.adventurers.find((x) => x.id === Number(d.advId));
      if (!a) break;
      if (opt.id === 'caution') {
        a.activity = { kind: 'flaner', until: s.tick, place: 'hall' };
        a.loyalty = clamp(a.loyalty + 10, 0, 100);
        think(s, a, 'La guilde a payé ma caution. Je lui dois une fière chandelle.', 'info');
      } else {
        a.loyalty = clamp(a.loyalty - 15, 0, 100);
        think(s, a, 'Trois jours au cachot, et personne pour payer ma caution…', 'info');
      }
      break;
    }
    case 'evt:baron':
      if (opt.id === 'heberger') {
        earn(s, 'evenements', 4000);
        addMod(s, 'lits_occupes', until(5), 'baron', { add: 6 });
        for (const a of s.adventurers) a.morale = clamp(a.morale - 3, 0, 100);
      } else addRenown(s, -2);
      break;
    case 'evt:veteran':
      if (opt.id === 'engager' && s.terrain.level > 0) {
        const p = createProf(s);
        p.offerUntil = s.tick + 7 * H;
        s.profCandidates.push(p);
        log(s, 'guilde', 'important', `Le vétéran, ${p.name}, accepte d'étudier une offre de professeur (écran Personnel).`);
      } else {
        for (const a of s.adventurers.filter(atHome)) gainXp(s, a, xpRequired(a.level) * 0.08);
        log(s, 'aventuriers', 'info', 'Le vétéran passe la journée à raconter ses campagnes : les aventuriers présents en tirent des leçons.');
      }
      break;
    case 'marchand':
      if (opt.id === 'acheter') {
        if (s.infirmerie.level > 0) { s.infirmerie.remedes.potion += 5; s.infirmerie.remedes.bandages += 5; s.infirmerie.remedes.antidote += 3; }
        else s.refectoire.pantry.push({ denree: 'epices', qty: 20, fresh: 1 });
      }
      break;
    case 'emeute':
      if (opt.id === 'gruau') {
        let need = 30;
        for (const l of s.refectoire.pantry) if (l.denree === 'cereales' && need > 0) { const q = Math.min(l.qty, need); l.qty -= q; need -= q; }
        addRenown(s, P.renommee.gruau);
        unlock(s, 'bienfaiteur');
        addMod(s, 'prosperite', until(14), 'gruau', { add: 5 });
        news(s, 'une', 'La guilde distribue du gruau aux affamés : la foule se calme.');
      } else {
        addMod(s, 'taxe_royale', until(28), 'emeute', { mult: 1.2 });
        news(s, 'une', "L'émeute n'est pas réprimée : la Couronne alourdit la taxe royale pour une saison.");
      }
      break;
    case 'diffamation':
      if (opt.id === 'contre') { addRenown(s, P.renommee.diffamation); log(s, 'guilde', 'info', 'La contre-campagne rétablit la réputation de la guilde.'); }
      break;
    case 'conscription': {
      const ids = String(d.ids ?? '').split(',').filter(Boolean).map(Number);
      for (const aid of ids) {
        const a = s.adventurers.find((x) => x.id === aid);
        if (!a) continue;
        if (opt.id === 'exempter') { a.loyalty = clamp(a.loyalty + 10, 0, 100); think(s, a, 'La guilde a payé mon exemption. Je ne l\'oublierai pas.', 'info'); }
        else {
          conscript(s, a);
          s.world.conscripts.push({ adv: JSON.parse(JSON.stringify(a)), returnTick: Number(s.world.counters.guerre ?? s.tick) + randInt(s, 'monde', 1, 7) * H });
        }
      }
      break;
    }
    case 'assaut':
      if (s.world.assault) {
        s.world.assault.barricade = opt.id === 'barricade' || opt.id === 'tout';
        s.world.assault.mercenaires = opt.id === 'mercenaires' || opt.id === 'tout';
        s.world.assault.infirmerieGratuite = opt.id === 'tout';
      }
      break;
  }
  return null;
}

function hourlyDecisions(s: GameState): void {
  for (const dec of [...s.world.decisions]) if (s.tick >= dec.deadline) decide(s, dec.id, dec.defaut, true);
}

// ---------- Chaînes (5.4.4) ----------

function chains(s: GameState): void {
  const c = s.world.counters;
  // Rats > 90 % pendant 7 jours → peste des égouts
  if (popOf(s, 'ville', 'rat') > W().rattesSeuil) c.rats = (c.rats ?? 0) + 1; else c.rats = 0;
  if (c.rats >= W().rattesJours) { c.rats = 0; fireEvent(s, 'peste'); }
  // Vague de monstres qui dure → assaut
  for (const k of Object.keys(c).filter((x) => x.startsWith('vague:'))) {
    const [, z, sp] = k.split(':');
    if (popOf(s, z, sp) > P.populations.proliferation) c[k] += 1; else { delete c[k]; continue; }
    if (c[k] >= W().vaguePopJours) { delete c[k]; triggerAssault(s, sp, z); }
  }
  // Danger ≥ 80 pendant 3 jours → assaut
  if (s.danger >= W().assautDangerSeuil) c.danger = (c.danger ?? 0) + 1; else c.danger = 0;
  if (c.danger >= W().assautDangerJours) {
    c.danger = 0;
    let best: [string, string, number] | null = null;
    for (const z of ZONE_IDS) for (const sp of Object.keys(ZONES[z].especes)) {
      if (sp === 'dragon' || sp === 'golem') continue;
      const v = popOf(s, z, sp) * ZONES[z].poidsDanger;
      if (!best || v > best[2]) best = [z, sp, v];
    }
    if (best) triggerAssault(s, best[1], best[0]);
  }
}

function endEvents(s: GameState): void {
  const w = s.world;
  for (const ev of [...w.events]) {
    if (ev.until > s.tick) continue;
    w.events = w.events.filter((x) => x !== ev);
    const suite = EVENTS[ev.id]?.suite;
    if (suite && (suite.prosperiteMax === undefined || s.prosperity < suite.prosperiteMax) && chance(s, 'monde', suite.chance)) {
      fireEvent(s, suite.evenement);
    }
    if (ev.id === 'guerre') endWar(s);
  }
  w.mods = w.mods.filter((m) => m.until > s.tick);
}

// ---------- Guerre : conscription (5.4.3) ----------

function warWeekly(s: GameState): void {
  if (!s.world.events.some((e) => e.id === 'guerre') || weekdayOf(s.tick) !== 1) return;
  const pool = s.adventurers.filter((a) => atHome(a) && a.level >= 3);
  if (!pool.length) return;
  const n = Math.min(pool.length, randInt(s, 'monde', 1, 2));
  const chosen: Adventurer[] = [];
  for (let i = 0; i < n; i++) { const a = pick(s, 'monde', pool.filter((x) => !chosen.includes(x))); if (a) chosen.push(a); }
  const cost = W().exemption * chosen.length;
  openDecision(s, 'conscription', 'Conscription',
    `La Couronne appelle ${chosen.map((a) => a.name).join(' et ')} sous les drapeaux.`,
    [{ id: 'exempter', label: `Payer l'exemption (${money(cost)})`, cost }, { id: 'partir', label: 'Les laisser partir' }], 'partir',
    { ids: chosen.map((a) => a.id).join(',') });
}

function endWar(s: GameState): void {
  news(s, 'une', 'La paix est signée. Les conscrits rentrent peu à peu.');
}

function conscriptsReturn(s: GameState): void {
  const w = s.world;
  for (const c of [...w.conscripts]) {
    if (c.returnTick > s.tick) continue;
    w.conscripts = w.conscripts.filter((x) => x !== c);
    const body = c.adv;
    if (!chance(s, 'monde', 0.5)) { log(s, 'aventuriers', 'info', `${body.name} ne revient pas de la guerre.`); continue; }
    body.runId = null; body.job = null; body.status = 'actif'; body.leaveTick = null;
    body.activity = { kind: 'flaner', until: s.tick, place: 'hall' };
    s.doorCandidates.push({ ...body, doorUntil: s.tick + 48 });
    log(s, 'aventuriers', 'important', `${body.name} revient de la guerre et frappe à la porte de la guilde.`);
  }
}

// ---------- Guildes rivales (5.5) ----------

const rivalAttract = (r: { renown: number; taux: number; tarifs: number }) =>
  (10 + r.renown) * (r.taux > 0.3 ? 0.5 : r.taux <= 0.1 ? 1.2 : 1) * (r.tarifs < 1 ? 1.1 : r.tarifs > 1.2 ? 0.95 : 1);

/** Part des recrues qui choisissent la guilde du joueur, relative à l'équilibre (3.12.1, 5.5). */
export function recruitShareFactor(s: GameState): number {
  const active = s.world.rivals.filter((r) => r.bankruptSince === null);
  if (!active.length) return 1.4;
  const mine = rivalAttract({ renown: s.renown, taux: s.taxRate, tarifs: 1 });
  const theirs = active.reduce((a, r) => a + rivalAttract(r), 0) / active.length;
  return clamp(Math.sqrt(mine / theirs), 0.6, 1.4);
}

/** Taux de taxe de référence régional : moyenne des guildes (2.6.1). */
export function referenceTaxRate(s: GameState): number {
  const rates = [s.taxRate, ...s.world.rivals.filter((r) => r.bankruptSince === null).map((r) => r.taux)];
  return rates.reduce((a, b) => a + b, 0) / rates.length;
}

function rivalsTakeQuests(s: GameState): void {
  for (const q of [...s.board]) {
    if (q.type === 'aide' || q.clientType === 'guilde' || q.reservedBy !== null || q.teams.length || s.tick - q.createdTick < H) continue;
    // Le dragon est l'épreuve de la Couronne pour la guilde du joueur (D-128) : les rivales ne s'y frottent pas.
    if (q.target === 'dragon') continue;
    for (const r of s.world.rivals) {
      if (r.bankruptSince !== null) continue;
      if (r.profil === 'chasseurs' && rangIndex(q.rang) > 2) continue;   // les chasseurs s'en tiennent aux bêtes de rang D au plus
      let p = clamp(W().rivaleQueteChance * (r.renown / 50), 0.01, 0.12);
      if (r.profil === 'prestige' && (q.clientType === 'nobles' || q.clientType === 'couronne')) p *= 2;
      if (r.profil === 'mercenaires' && rangIndex(q.rang) <= 1) p *= 1.5;
      if (r.profil === 'chasseurs' && (q.type === 'chasse' || q.type === 'extermination' || q.type === 'cueillette')) p *= 1.5;
      if (q.legend) p *= 0.3;
      if (!chance(s, 'monde', p)) continue;
      s.board = s.board.filter((x) => x !== q);
      rivalDoesQuest(s, r, q);
      r.renown += P.renommee.quete[q.rang] * (q.legend ? 0 : P.monde.rivaleGainQuete);
      if (q.legend) {
        r.renown += 10;
        news(s, 'guildes', `Coup d'éclat : ${r.nom} a abattu ${q.legend}.`);
        log(s, 'monde', 'important', `${r.nom} a abattu ${q.legend} avant la guilde.`);
      } else if (rangIndex(q.rang) >= 2 || q.clientType !== 'villageois') {
        news(s, 'guildes', `${r.nom} s'est chargée de « ${q.title} ».`);
        log(s, 'quetes', 'info', `${r.nom} s'est chargée de « ${q.title} » avant la guilde.`);
      } else log(s, 'quetes', 'detail', `${r.nom} s'est chargée de « ${q.title} ».`);
      break;
    }
  }
}

// ---------- Sorties des guildes rivales (v1.1) ----------

/** Zones où chaque profil de guilde va chercher fortune. */
const RIVAL_ZONES: Record<Rival['profil'], string[]> = {
  prestige: ['ruines', 'marais', 'pics'],
  mercenaires: ['foret', 'collines', 'ville'],
  chasseurs: ['foret', 'marais', 'collines'],
};

/** Le butin d'une rivale arrive sur le marché de la ville : l'offre augmente, les cours baissent. */
function supplyMarket(s: GameState, res: string, qty: number): void {
  if (s.market[res]) s.market[res].S += qty * W().rivales.vente;
}

function noteTrip(s: GameState, r: Rival, zone: string, text: string): void {
  const w = s.world;
  (w.rivalTrips ??= []).push({ tick: s.tick, rival: r.id, zone, text });
  w.rivalTrips = w.rivalTrips.filter((t) => t.tick > s.tick - 3 * H);
}

/** Une quête prise par une rivale a les mêmes effets que si la guilde l'avait faite : bêtes tuées, plantes cueillies. */
function rivalDoesQuest(s: GameState, r: Rival, q: Quest): void {
  if (!q.target || !q.zone) return;
  const n = q.count ?? 3;
  if (q.type === 'chasse' || q.type === 'extermination') {
    // Les golems et le dragon ne repoussent pas : ils restent pour la guilde du joueur.
    if (!SPECIES[q.target] || SPECIES[q.target].r <= 0) return;
    killed(s, q.zone, q.target, n);
    for (const res of SPECIES[q.target].butin) supplyMarket(s, res, n);
    noteTrip(s, r, q.zone, `${n} ${SPECIES[q.target].pluriel}`);
  } else if (q.type === 'cueillette' && RESOURCES[q.target]) {
    harvested(s, q.zone, q.target, n);
    supplyMarket(s, q.target, n);
  }
}

/**
 * Chaque jour, les rivales envoient leurs propres équipes : elles chassent et cueillent selon leur profil,
 * ce qui fait baisser les populations (la carte évolue sans la guilde), et vendent leur butin en ville.
 */
function rivalExpeditions(s: GameState, r: Rival): void {
  const R = W().rivales;
  const expected = Math.min(r.size, R.tailleMax) * R.sortiesParMembre * (r.profil === 'chasseurs' ? R.bonusChasseurs : 1);
  const n = Math.floor(expected) + (chance(s, 'monde', expected % 1) ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const zone = pick(s, 'monde', RIVAL_ZONES[r.profil]);
    const plants = plantsOf(zone).filter((pl) => popOf(s, zone, pl) > R.seuilChasse);
    if (plants.length && chance(s, 'monde', R.cueillette)) {
      const pl = pick(s, 'monde', plants);
      const q = randInt(s, 'monde', R.cueilletteQte[0], R.cueilletteQte[1]);
      harvested(s, zone, pl, q);
      supplyMarket(s, pl, q);
      noteTrip(s, r, zone, `cueillette (${RESOURCES[pl].nom.toLowerCase()})`);
      continue;
    }
    // Les rivales chassent les espèces abondantes (elles ne les exterminent pas) : rang C au plus pour la guilde
    // de prestige, rang D au plus pour les autres. Personne ne touche au dragon, aux golems ni aux wyvernes.
    const opts = Object.keys(ZONES[zone].especes).filter((sp) => SPECIES[sp] && popOf(s, zone, sp) > R.seuilChasse
      && rangIndex(SPECIES[sp].rang) <= (r.profil === 'prestige' ? 3 : 2));
    if (!opts.length) continue;
    const sp = weighted(s, 'monde', Object.fromEntries(opts.map((x) => [x, popOf(s, zone, x)])));
    const kills = Math.max(1, Math.round(randInt(s, 'monde', R.baisse[0], R.baisse[1]) / SPECIES[sp].k));
    killed(s, zone, sp, kills);
    for (const res of SPECIES[sp].butin) supplyMarket(s, res, kills);
    noteTrip(s, r, zone, `${kills} ${SPECIES[sp].pluriel}`);
  }
}

function rivalAction(s: GameState, r: Rival): void {
  const w: Record<string, number> = r.profil === 'prestige'
    ? { debauchage: 3, diffamation: 2, eclat: 2 }
    : r.profil === 'chasseurs' ? { debauchage: 2, eclat: 2, prix: 1 }
    : { prix: 3, debauchage: 1, diffamation: 1, eclat: 1 };
  const act = weighted(s, 'monde', w);
  if (act === 'prix') {
    addMod(s, 'concurrents:prix', s.tick + 14 * H, r.id, { mult: 0.8 });
    news(s, 'guildes', `${r.nom} lance une guerre des prix : l'Auberge et la Taverne du Pont baissent leurs tarifs de 20 % pour deux semaines.`);
    log(s, 'monde', 'important', `Guerre des prix : ${r.nom} fait baisser les tarifs de l'Auberge et de la Taverne du Pont.`);
  } else if (act === 'debauchage') {
    const target = s.adventurers.filter((a) => a.runId === null && a.status === 'actif' && !a.poachedBy).sort((a, b) => b.respect - a.respect)[0];
    if (!target) return;
    if (target.loyalty < 50) {
      target.poachedBy = r.nom;
      target.status = 'depart';
      target.leaveTick = s.tick + 48;
      log(s, 'aventuriers', 'critique', `${r.nom} a fait une offre à ${advLink(target)}, qui envisage de partir dans 2 jours. Une offre de rétention peut le retenir.`);
      think(s, target, `${r.nom} me fait une belle offre… Qu'est-ce qui me retient ici ?`, 'info');
      news(s, 'guildes', `${r.nom} tente de débaucher ${target.name}.`);
    } else {
      log(s, 'aventuriers', 'info', `${advLink(target)} a refusé une offre de ${r.nom}. Sa loyauté envers la guilde paie.`);
    }
  } else if (act === 'diffamation') {
    addRenown(s, -P.renommee.diffamation);
    news(s, 'guildes', `${r.nom} répand des rumeurs malveillantes sur la guilde.`);
    openDecision(s, 'diffamation', 'Rumeur diffamatoire', `${r.nom} raconte partout que la guilde exploite ses aventuriers. Ta renommée en souffre (−${P.renommee.diffamation}).`,
      [{ id: 'contre', label: `Contre-campagne (${money(W().contreCampagne)})`, cost: W().contreCampagne }, { id: 'laisser', label: 'Laisser dire' }], 'laisser');
  } else {
    r.renown += 3;
    news(s, 'guildes', `${r.nom} fait parler d'elle : ses aventuriers reviennent couverts de gloire d'une expédition lointaine.`);
  }
}

function dailyRivals(s: GameState): void {
  const w = s.world;
  rivalsTakeQuests(s);
  for (const r of w.rivals) {
    if (r.bankruptSince !== null) continue;
    if (weekdayOf(s.tick) === 1) r.renown = Math.max(0, r.renown + randInt(s, 'monde', -3, 3));
    r.size = Math.round(8 + r.renown / 4);
    if (r.renown <= 0) {
      r.bankruptSince = s.tick;
      news(s, 'guildes', `${r.nom} met la clé sous la porte.`);
      log(s, 'monde', 'important', `${r.nom} fait faillite.`);
      continue;
    }
    rivalExpeditions(s, r);
    if (s.tick >= r.nextAction) {
      rivalAction(s, r);
      r.nextAction = s.tick + H * randInt(s, 'monde', W().rivaleActionJours[0], W().rivaleActionJours[1]);
    }
  }
  // Une nouvelle guilde remplace celle qui a fait faillite, quelques semaines plus tard.
  for (const r of w.rivals) {
    if (r.bankruptSince === null || s.tick - r.bankruptSince < 28 * H) continue;
    const nom = pick(s, 'noms', (NAMES.rivales as string[]).filter((n) => !w.rivals.some((x) => x.nom === n)));
    Object.assign(r, makeRival(s, `${r.id}+`, nom, r.profil, 15));
    news(s, 'guildes', `Une nouvelle guilde ouvre ses portes : ${nom}.`);
  }
}

/** Un aventurier débauché part, sauf si sa loyauté a remonté entre-temps (5.5). */
export function poachedDeparture(s: GameState, a: Adventurer): boolean {
  if (!a.poachedBy || a.leaveTick === null || s.tick < a.leaveTick || a.runId !== null) return false;
  if (a.loyalty >= 50) {
    log(s, 'aventuriers', 'important', `${advLink(a)} décline finalement l'offre de ${a.poachedBy} et reste à la guilde.`);
    unlock(s, 'retenu');
    a.poachedBy = undefined; a.status = 'actif'; a.leaveTick = null;
    return true;
  }
  const rival = s.world.rivals.find((r) => r.nom === a.poachedBy);
  if (rival) rival.renown += 2;
  news(s, 'guildes', `${a.name} rejoint ${a.poachedBy}.`);
  leave(s, a, 'debauche', `${advLink(a)} quitte la guilde pour rejoindre ${a.poachedBy}.`);
  return true;
}

// ---------- Assaut sur la ville (5.6) ----------

export function triggerAssault(s: GameState, species: string, zone: string): void {
  const w = s.world;
  if (w.assault || s.tick - w.lastAssault < W().assautCooldownJours * H) return;
  const startTick = (dayOf(s.tick) + 1) * H + 23;
  w.assault = { species, zone, startTick, wave: 0, wins: 0, barricade: false, mercenaires: false, infirmerieGratuite: false };
  const sp = SPECIES[species];
  w.rumors.push({ id: s.nextId++, text: `Les éclaireurs signalent des ${sp.pluriel} massés aux portes de la ville. L'assaut est imminent.`, tick: s.tick, fireTick: startTick, eventId: 'assaut', real: true });
  log(s, 'monde', 'critique', `Assaut imminent : les ${sp.pluriel} marchent sur la ville. Première vague dans 2 nuits.`);
  news(s, 'une', `Alerte : les ${sp.pluriel} venus ${ZONES[zone].lieu.replace(/^dans |^à |^sur /, 'de ')} menacent la ville.`);
  openDecision(s, 'assaut', 'Préparer la défense du siège', `Les ${sp.pluriel} attaqueront pendant trois nuits. Comment la guilde se prépare-t-elle ?`, [
    { id: 'rien', label: 'Ne rien préparer' },
    { id: 'barricade', label: `Barricader le siège (${money(W().barricade)})`, cost: W().barricade },
    { id: 'mercenaires', label: `Engager 4 mercenaires (${money(W().mercenaires)})`, cost: W().mercenaires },
    { id: 'tout', label: `Tout : barricades, mercenaires, infirmerie gratuite (${money(W().barricade + W().mercenaires)})`, cost: W().barricade + W().mercenaires },
  ], 'rien');
}

function assaultWave(s: GameState): void {
  const w = s.world;
  const as = w.assault!;
  const sp = SPECIES[as.species];
  as.wave += 1;
  let defenders = s.adventurers.filter((a) => atHome(a) && worstGravity(a) < 2 && a.status !== 'depart');
  if (as.wave === 1) {
    for (const a of defenders.filter((x) => profileOf(x) === 'prudent' && x.loyalty < 30)) {
      leave(s, a, 'fuite', `${advLink(a)} fuit la ville avant l'assaut et quitte la guilde.`);
    }
    defenders = defenders.filter((a) => s.adventurers.includes(a));
  }
  const mercs: Adventurer[] = as.mercenaires
    ? Array.from({ length: 4 }, () => createAdventurer(s, { level: 8, goldMin: 0, goldMax: 0 }))
    : [];
  for (const m of mercs) m.name = `${m.name} (mercenaire)`;
  const team = [...defenders, ...mercs];
  const count = Math.max(4, Math.round(team.length * 1.2)) + as.wave;
  let won = false;
  if (team.length > 0) {
    const leader = [...team].sort((a, b) => b.level - a.level)[0];
    const res = fight(s, team, as.species, count, leader, 0, { defMult: as.barricade ? 1.2 : 1 });
    won = res.outcome === 'victoire';
    for (const d of res.dead) if (s.adventurers.includes(d)) killAdventurer(s, d, `en défendant la ville contre les ${sp.pluriel}`);
  }
  if (won) {
    as.wins += 1;
    s.populations[as.zone][as.species] = clamp(popOf(s, as.zone, as.species) - 30, 0, 100);
    for (const a of defenders.filter((x) => s.adventurers.includes(x))) {
      gainXp(s, a, xpRequired(a.level) * 0.1);
      a.respect = clamp(a.respect + 5, 0, 100);
    }
    log(s, 'monde', 'critique', `Vague ${as.wave} : les défenseurs repoussent les ${sp.pluriel} (${defenders.length} aventuriers${mercs.length ? ' et 4 mercenaires' : ''}).`);
  } else {
    const built = ROOM_IDS.filter((r) => s[r].level > 0 && !w.damaged[r]);
    const room = built.length ? pick(s, 'monde', built) : null;
    if (room) w.damaged[room] = true;
    for (const l of s.refectoire.pantry) l.qty = Math.floor(l.qty * 0.8);
    for (const l of s.resserre) l.qty = Math.floor(l.qty * 0.8);
    s.resserre = s.resserre.filter((l) => l.qty > 0);
    s.prosperity = clamp(s.prosperity - 5, 0, 100);
    const roomName: Record<RoomId, string> = { dortoirs: 'les dortoirs', refectoire: 'le réfectoire', cuisine: 'la cuisine', infirmerie: "l'infirmerie", terrain: "le terrain d'entraînement" };
    log(s, 'monde', 'critique', `Vague ${as.wave} : les ${sp.pluriel} percent les défenses !${room ? ` ${roomName[room].charAt(0).toUpperCase() + roomName[room].slice(1)} sont endommagés (capacité −50 % jusqu'à réparation).` : ''} Les stocks sont pillés.`);
  }
  // Infirmerie ouverte gratuitement : les blessés retournent au combat
  if (as.infirmerieGratuite && s.infirmerie.level > 0) {
    for (const a of defenders.filter((x) => s.adventurers.includes(x))) {
      const st = a.states.find((x) => x.gravite >= 1);
      if (st) { if (st.gravite >= 2) st.gravite = 1; else removeAilment(a, st.etat); }
    }
  }
  if (as.wave >= 3) endAssault(s, defenders.filter((x) => s.adventurers.includes(x)).length);
}

function endAssault(s: GameState, defenders: number): void {
  const w = s.world;
  const as = w.assault!;
  const sp = SPECIES[as.species];
  if (as.wins >= 3) {
    unlock(s, 'rempart');
    addRenown(s, P.renommee.assaut);
    addMod(s, 'danger', s.tick + 14 * H, 'assaut', { add: -15 });
    const prime = W().primeCouronneParDefenseur * defenders;
    earn(s, 'primeCouronne', prime);
    s.prosperity = clamp(s.prosperity + 5, 0, 100);
    log(s, 'monde', 'critique', `Victoire ! La ville a tenu trois nuits. La Couronne verse une prime de ${money(prime)}.`);
    news(s, 'exploits', `Les aventuriers de la guilde ont repoussé l'assaut des ${sp.pluriel} pendant trois nuits.`);
  } else {
    log(s, 'monde', 'critique', `L'assaut des ${sp.pluriel} est terminé : ${as.wins} vague(s) repoussée(s) sur 3.`);
    news(s, 'une', `L'assaut des ${sp.pluriel} a laissé des traces : ${as.wins} vague(s) repoussée(s) sur 3.`);
  }
  for (const k of Object.keys(w.counters)) if (k.startsWith('vague:')) delete w.counters[k];
  w.assault = null;
  w.lastAssault = s.tick;
}

export function repairCost(s: GameState, room: RoomId): number {
  return Math.round(0.2 * (roomLevelCost(room, Math.max(1, s[room].level)) ?? 10000));
}

export function repairRoom(s: GameState, room: RoomId): string | null {
  if (!s.world.damaged[room]) return null;
  const cost = repairCost(s, room);
  if (cost > s.treasury) return 'Trésorerie insuffisante.';
  spend(s, 'travaux', cost);
  s.world.damaged[room] = false;
  log(s, 'guilde', 'info', `Réparations terminées (${money(cost)}).`);
  return null;
}

// ---------- Épidémies (5.7) ----------

export function startEpidemic(s: GameState, source: string): boolean {
  const w = s.world;
  if (w.epidemic || s.tick - w.lastEpidemic < W().epidemieCooldownJours * H) return false;
  const until = s.tick + H * randInt(s, 'monde', W().epidemieJours[0], W().epidemieJours[1]);
  w.epidemic = { until, source, calmDays: 0 };
  s.legend.counters.mortsAvantEpidemie = s.stats.deaths;
  addMod(s, 'prosperite_jour', until, 'epidemie', { add: -1 });
  addMod(s, 'temple:ferme', until, 'epidemie', { add: 1 });
  addMod(s, 'demande:cat:plante', until, 'epidemie', { mult: 2 });
  const home = s.adventurers.filter(atHome);
  for (let i = 0; i < Math.min(2, home.length); i++) addAilment(s, pick(s, 'monde', home), 'maladie', 0);
  log(s, 'monde', 'critique', `Épidémie (${source}) ! La maladie se répand en ville ; le Temple est débordé.`);
  news(s, 'une', `Épidémie : ${source}. Le Temple ne reçoit plus personne, les plantes médicinales s'arrachent.`);
  return true;
}

function dailyEpidemic(s: GameState): void {
  const w = s.world;
  const ep = w.epidemic;
  if (!ep) return;
  const quarantaine = s.modules.includes('quarantaine');
  const sickHere = s.adventurers.filter((a) => a.runId === null && a.states.some((st) => st.etat === 'maladie')
    && !(quarantaine && a.activity.kind === 'hospitalise'));
  const contacts = sickHere.length;
  const propre = s.dortoirs.proprete > 70 ? 0.5 : 1;
  if (contacts > 0) {
    for (const a of s.adventurers) {
      if (a.runId !== null || a.states.some((st) => st.etat === 'maladie')) continue;
      const p = W().contagionBase * (1 - a.attrs.CON / 40) * propre;
      if (chance(s, 'monde', 1 - Math.pow(1 - p, contacts))) addAilment(s, a, 'maladie', 0);
    }
    for (const m of s.staff) {
      if (m.absentUntil !== undefined && m.absentUntil > s.tick) continue;
      const p = W().contagionBase * 0.75 * propre;
      if (chance(s, 'monde', 1 - Math.pow(1 - p, contacts))) {
        m.absentUntil = s.tick + 72;
        log(s, 'guilde', 'important', `${m.name} est malade et ne viendra pas travailler pendant 3 jours.`);
      }
    }
  }
  const anySick = s.adventurers.some((a) => a.states.some((st) => st.etat === 'maladie'));
  ep.calmDays = anySick ? 0 : ep.calmDays + 1;
  if (s.tick >= ep.until || ep.calmDays >= 3) {
    for (const m of w.mods) if (m.source === 'epidemie') m.until = s.tick;
    w.epidemic = null;
    w.lastEpidemic = s.tick;
    log(s, 'monde', 'important', "L'épidémie est terminée.");
    if (s.stats.deaths === s.legend.counters.mortsAvantEpidemie) unlock(s, 'medecin_peste');
    news(s, 'une', "L'épidémie est enfin derrière nous. Le Temple rouvre ses portes.");
  }
}

// ---------- Les moments de la journée ----------

/** Chaque matin à 06h, avant la génération des quêtes. */
export function morningWorld(s: GameState): void {
  const w = s.world;
  const day = dayOf(s.tick);
  if ((day - 1) % 28 === 0 && day > 1) seasonStart(s);
  endEvents(s);
  w.townSpend.push(0);
  if (w.townSpend.length > 7) w.townSpend.splice(0, w.townSpend.length - 7);
  s.danger = regionalDanger(s);
  updateProsperity(s);
  updatePalier(s);

  // Rumeurs et événements programmés
  w.rumors = w.rumors.filter((r) => r.fireTick > s.tick - 3 * H);
  for (const sc of [...w.scheduled]) {
    if (sc.tick > s.tick + 18) continue;
    w.scheduled = w.scheduled.filter((x) => x !== sc);
    if (sc.real) fireEvent(s, sc.eventId, sc.data);
    else log(s, 'monde', 'detail', `La rumeur concernant « ${EVENTS[sc.eventId].nom} » était infondée.`);
  }
  if (chance(s, 'monde', W().petitChance)) {
    const id = pickEvent(s, 'petit');
    if (id) fireEvent(s, id, prepare(s, id));
  }
  chains(s);
  warWeekly(s);
  conscriptsReturn(s);
  dailyRivals(s);
  dailyEpidemic(s);
  crownQuest(s);

  const moralJour = modAdd(s, 'moral_jour');
  if (moralJour) for (const a of s.adventurers) a.morale = clamp(a.morale + moralJour, 0, 100);
  // Renommée : chaque aventurier mécontent ternit un peu l'image de la guilde (6.1.1)
  addRenown(s, -0.2 * s.adventurers.filter((a) => a.status === 'mecontent').length);

  w.history.push({ day, danger: s.danger, prosperity: Math.round(s.prosperity), renown: Math.round(s.renown) });
  if (w.history.length > 224) w.history.splice(0, w.history.length - 224);
  if (weekdayOf(s.tick) === 1) {
    w.popHistory.push({ day, pops: JSON.parse(JSON.stringify(s.populations)) });
    if (w.popHistory.length > 16) w.popHistory.splice(0, w.popHistory.length - 16);
  }
}

/** Chaque heure : échéances des décisions, vagues d'assaut nocturnes. */
export function hourlyWorld(s: GameState): void {
  hourlyDecisions(s);
  const as = s.world.assault;
  if (as && hourOf(s.tick) === 23 && s.tick >= as.startTick) assaultWave(s);
}

// ---------- Aides pour l'interface ----------

export const SEASON_EFFECTS = [
  'Les monstres se reproduisent (×1,5), les plantes repoussent vite.',
  'Escortes plus nombreuses. Sans glacière, la viande se gâte deux fois plus vite.',
  'Denrées −20 %, Prospérité +5.',
  'Danger des zones proches +10, plantes au ralenti, légumes ×1,5, Prospérité −5, nuits froides sans cheminée.',
];

export function rankOfPalier(p: Palier): number { return PALIERS.indexOf(p); }
