// Dynamique sociale : relations, bagarres, équipes durables (GDD 3.11).
import { hasTrait, pvMax, skill } from './adventurers';
import { addAilment } from './ailments';
import { P } from './data';
import { clamp } from './economy';
import { advLink, hourOf } from './format';
import { log, think } from './journal';
import { chance, pick, shuffle } from './rng';
import type { Adventurer, GameState, QuestRun, Team } from './types';

const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function rel(s: GameState, a: number, b: number): number {
  return s.relations[key(a, b)] ?? 0;
}

export type RelStatus = 'frere' | 'ami' | 'neutre' | 'rival' | 'ennemi';
export function relStatus(v: number): RelStatus {
  if (v >= P.social.frereSeuil) return 'frere';
  if (v >= P.social.amiSeuil) return 'ami';
  if (v <= P.social.ennemiSeuil) return 'ennemi';
  if (v <= P.social.rivalSeuil) return 'rival';
  return 'neutre';
}
export const REL_NAMES: Record<RelStatus, string> = {
  frere: "Frère d'armes", ami: 'Ami', neutre: '', rival: 'Rival', ennemi: 'Ennemi',
};

export function addRel(s: GameState, a: Adventurer, b: Adventurer, delta: number): void {
  if (a.id === b.id) return;
  const k = key(a.id, b.id);
  const before = s.relations[k] ?? 0;
  const after = clamp(before + delta, -100, 100);
  if (after === 0) delete s.relations[k];
  else s.relations[k] = after;
  const st0 = relStatus(before);
  const st1 = relStatus(after);
  if (st0 !== st1 && st1 !== 'neutre') {
    const text = st1 === 'frere' ? 'sont désormais frères d\'armes' : st1 === 'ami' ? 'sont devenus amis'
      : st1 === 'rival' ? 'sont devenus rivaux' : 'sont à couteaux tirés';
    log(s, 'aventuriers', 'info', `${advLink(a)} et ${advLink(b)} ${text}.`);
  }
}

export function relationsOf(s: GameState, id: number): { id: number; v: number }[] {
  const out: { id: number; v: number }[] = [];
  for (const [k, v] of Object.entries(s.relations)) {
    const [x, y] = k.split('-').map(Number);
    if (x === id) out.push({ id: y, v });
    else if (y === id) out.push({ id: x, v });
  }
  return out.sort((p, q) => q.v - p.v);
}

export function onQuestTogether(s: GameState, team: Adventurer[], success: boolean): void {
  if (!success) return;
  for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) addRel(s, team[i], team[j], 2);
}

export function onSaved(s: GameState, saver: Adventurer, saved: Adventurer): void {
  addRel(s, saver, saved, 8);
}

/** Deuil des amis à la mort d'un aventurier (3.11.1). */
export function onDeath(s: GameState, dead: Adventurer): void {
  for (const { id, v } of relationsOf(s, dead.id)) {
    const o = s.adventurers.find((x) => x.id === id);
    if (!o) continue;
    const st = relStatus(v);
    if (st === 'frere') {
      o.morale = clamp(o.morale - 30, 0, 100);
      o.mourningUntil = s.tick + 3 * 24;
      think(s, o, `${dead.name} est mort. Je ne repartirai pas tant que je n'aurai pas fait mon deuil.`, 'info');
    } else if (st === 'ami') {
      o.morale = clamp(o.morale - 20, 0, 100);
      think(s, o, `${dead.name}… C'était un ami.`, 'info');
    }
  }
  for (const k of Object.keys(s.relations)) if (k.split('-').map(Number).includes(dead.id)) delete s.relations[k];
}

/** Le départ d'un ami donne envie de partir (3.12.2). */
export function onLeave(s: GameState, gone: Adventurer): void {
  for (const { id, v } of relationsOf(s, gone.id)) {
    const o = s.adventurers.find((x) => x.id === id);
    if (!o || relStatus(v) === 'neutre' || v < 0) continue;
    o.morale = clamp(o.morale - 10, 0, 100);
    o.loyalty = clamp(o.loyalty - 5, 0, 100);
    think(s, o, `${gone.name} est parti. La guilde n'est plus tout à fait la même.`);
  }
  for (const k of Object.keys(s.relations)) if (k.split('-').map(Number).includes(gone.id)) delete s.relations[k];
}

/** Soirées de taverne et bagarres (3.11.2), vérifiées chaque heure du soir. */
export function eveningSocial(s: GameState): void {
  const h = hourOf(s.tick);
  if (h < 18 || h > 22) return;
  const here = s.adventurers.filter((a) => a.activity.place === 'refectoire' && a.activity.kind !== 'quete');
  if (here.length < 2) return;
  const drinkers = here.filter((a) => a.activity.kind === 'boire');
  // Les sociables qui trinquent ensemble se rapprochent
  if (h === 21) {
    const soc = drinkers.filter((a) => hasTrait(a, 'sociable'));
    for (const a of soc) for (const b of drinkers) if (a.id < b.id || !hasTrait(b, 'sociable')) addRel(s, a, b, 1);
  }
  for (const a of shuffle(s, 'ia', [...drinkers])) {
    const drunk = a.drinksToday >= 3;
    const foes = here.filter((b) => b.id !== a.id && rel(s, a.id, b.id) <= (hasTrait(a, 'bagarreur') ? -20 : P.social.rivalSeuil));
    if (foes.length === 0) continue;
    const p = (drunk ? P.social.bagarreChance : 0) + (hasTrait(a, 'bagarreur') ? 0.15 : 0);
    if (!chance(s, 'ia', p)) continue;
    const b = pick(s, 'ia', foes);
    brawl(s, a, b, here);
    return; // une bagarre par heure suffit
  }
}

function brawl(s: GameState, a: Adventurer, b: Adventurer, witnesses: Adventurer[]): void {
  for (const x of [a, b]) {
    addAilment(s, x, 'plaie', 0, true);
    x.hp = Math.max(1, x.hp - pvMax(x) * 0.1);
    x.respect = clamp(x.respect - 5, 0, 100);
  }
  addRel(s, a, b, -15);
  for (const w of witnesses) if (w !== a && w !== b) w.morale = clamp(w.morale - 2, 0, 100);
  s.refectoire.damage = Math.min(30, s.refectoire.damage + 5);
  log(s, 'aventuriers', 'important', `Bagarre au réfectoire entre ${advLink(a)} et ${advLink(b)} ! Du mobilier est cassé (qualité −5 jusqu'à réparation).`);
}

// ---------- Équipes durables (3.11.3) ----------

const NOUNS = ['Lames', 'Lanternes', 'Boucliers', 'Faucons', 'Ronces', 'Loups', 'Marteaux', 'Corbeaux', 'Épines', 'Flèches'];
const PLACES = ['du Pont', 'de Vertbois', 'du Croc', 'des Brumes', "de l'Aube", 'du Bourg', "d'Ostral", 'de la Halle'];
const ANIMALS = ['du Sanglier', 'de la Chouette', 'du Cerf blanc', 'de la Vouivre', "de l'Ours", 'du Renard'];

function teamName(s: GameState): string {
  const used = new Set(s.teams.map((t) => t.name));
  for (let i = 0; i < 20; i++) {
    const n = chance(s, 'noms', 0.6) ? `Les ${pick(s, 'noms', NOUNS)} ${pick(s, 'noms', PLACES)}` : `La Compagnie ${pick(s, 'noms', ANIMALS)}`;
    if (!used.has(n)) return n;
  }
  return `L'Équipe ${s.teams.length + 1}`;
}

export function teamOf(s: GameState, id: number | null): Team | undefined {
  return id === null ? undefined : s.teams.find((t) => t.id === id);
}

export function teamCohesion(s: GameState, members: Adventurer[], teamId: number | null): number {
  const avg = members.reduce((a, m) => a + skill(m, 'cohesion'), 0) / Math.max(1, members.length);
  return clamp(2 * avg + (teamOf(s, teamId)?.exp ?? 0), 0, 100);
}

export function dissolveTeam(s: GameState, t: Team, reason: string): void {
  s.teams = s.teams.filter((x) => x !== t);
  for (const a of s.adventurers) if (a.teamId === t.id) a.teamId = null;
  log(s, 'aventuriers', 'info', `${t.name} se sépare : ${reason}.`);
}

export function afterQuestTeam(s: GameState, run: QuestRun, team: Adventurer[], success: boolean): void {
  if (team.length < 2) return;
  let t = teamOf(s, run.teamId);
  if (!t && success && team.every((m) => m.teamId === null)) {
    t = { id: s.nextId++, name: teamName(s), members: team.map((m) => m.id), exp: 0, fails: 0, questsOk: 0, createdTick: s.tick };
    s.teams.push(t);
    for (const m of team) m.teamId = t.id;
    log(s, 'aventuriers', 'important', `Une équipe est née : ${t.name} (${team.map(advLink).join(', ')}).`);
  }
  if (!t) return;
  if (success) {
    t.exp = Math.min(50, t.exp + 5);
    t.questsOk += 1;
    t.fails = 0;
  } else {
    t.fails += 1;
    if (t.fails >= 2) dissolveTeam(s, t, 'deux échecs de suite');
  }
}

/** Vérification quotidienne des équipes (3.11.3). */
export function checkTeams(s: GameState): void {
  for (const t of [...s.teams]) {
    const members = t.members.map((id) => s.adventurers.find((a) => a.id === id)).filter((a): a is Adventurer => !!a);
    if (members.length < t.members.length) {
      const gone = t.members.length - members.length;
      t.members = members.map((m) => m.id);
      if (members.length < 2) { dissolveTeam(s, t, 'il ne reste plus assez de membres'); continue; }
      if (chance(s, 'ia', 0.5)) { dissolveTeam(s, t, gone > 1 ? 'des membres manquent à l\'appel' : 'un membre manque à l\'appel'); continue; }
    }
    let conflict = false;
    for (let i = 0; i < members.length && !conflict; i++) {
      for (let j = i + 1; j < members.length; j++) if (rel(s, members[i].id, members[j].id) < P.social.rivalSeuil) conflict = true;
    }
    if (conflict) { dissolveTeam(s, t, 'des querelles internes'); continue; }
    const lv = members.map((m) => m.level);
    if (Math.max(...lv) - Math.min(...lv) > 6) dissolveTeam(s, t, 'les plus aguerris partent de leur côté');
  }
}
