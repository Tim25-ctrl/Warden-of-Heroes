// Simulateur d'équilibrage sans affichage (GDD 8.10.1).
// Usage : npm run sim -- --days 100 --seeds 8 --bot prudent [--verbose]
import { pvMax } from '../src/sim/adventurers';
import { applyCommand, createGame, step } from '../src/sim/engine';
import { money } from '../src/sim/format';
import { FLOWS } from '../src/sim/journal';
import { canHireProf, profSalary } from '../src/sim/training';
import { upgradeCost } from '../src/sim/rooms';
import type { GameState, RoomId } from '../src/sim/types';
import { DORM_LEVELS, INF_LEVELS, MESS_LEVELS, P, TERRAIN_LEVELS, TIERS } from '../src/sim/data';
import { PROG, sealConditions } from '../src/sim/legend';

const args = process.argv.slice(2);
const arg = (name: string, def: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const DAYS = Number(arg('days', '100'));
const SEEDS = Number(arg('seeds', '8'));
const BOT = arg('bot', 'prudent') as 'prudent' | 'passif';
const VERBOSE = args.includes('--verbose');
const FIRST_SEED = Number(arg('seed', '1'));
const POP_MAX = Number(arg('pop', '60'));      // le robot accepte les candidats tant qu'il a des lits
const TRACE = args.includes('--trace');
const FOLLOW = Number(arg('suivre', '0'));   // --suivre J : suit le meilleur aventurier à partir du jour J (première graine)
const PROFS_MAX = Number(arg('profs', '5'));
const PROF_SLOTS = arg('creneaux', 'apresmidi').split(',');
// Essais d'équilibrage sans toucher aux fichiers : --set quetes.tableauBase=12 (racines P, PROG, DORM, MESS, INF, TERR, TIERS), répétable.
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--set') continue;
  const [path, val] = args[i + 1].split('=');
  const keys = path.split('.');
  const roots: Record<string, unknown> = { PROG, DORM: DORM_LEVELS, MESS: MESS_LEVELS, INF: INF_LEVELS, TERR: TERRAIN_LEVELS, TIERS };
  let o = (roots[keys[0]] ?? P) as Record<string, unknown>;
  if (roots[keys[0]]) keys.shift();
  for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
  o[keys[keys.length - 1]] = JSON.parse(val);
}

const day = (s: GameState) => Math.floor(s.tick / 24) + 1;
const roomsBuilt = (s: GameState) => (['dortoirs', 'refectoire', 'infirmerie', 'terrain'] as RoomId[]).filter((r) => s[r].level > 0).length;

function hireBest(s: GameState, role: string): void {
  const c = s.staffCandidates.filter((m) => m.role === role).sort((a, b) => b.c - a.c)[0];
  if (c) applyCommand(s, { type: 'hireStaff', id: c.id });
}

function upgrade(s: GameState, room: RoomId, buffer: number): boolean {
  const cost = upgradeCost(s, room);
  if (cost === null || s[room].works || s.treasury < cost + buffer) return false;
  applyCommand(s, { type: 'upgradeRoom', room });
  return true;
}

/** Réponses du robot aux décisions du monde (5.4) : raisonnables, sans être optimales. */
function answerDecisions(s: GameState): void {
  for (const d of [...s.world.decisions]) {
    let opt = d.defaut;
    if (d.kind === 'assaut') opt = s.treasury > 20000 ? 'tout' : s.treasury > 6000 ? 'barricade' : 'rien';
    else if (d.kind === 'emeute') opt = 'gruau';
    else if (d.kind === 'conscription' && s.treasury > 30000) opt = 'exempter';
    else if (d.kind === 'evt:rixe' && s.treasury > 5000) opt = 'caution';
    applyCommand(s, { type: 'decide', id: d.id, option: opt });
  }
  for (const r of ['dortoirs', 'refectoire', 'infirmerie', 'terrain'] as RoomId[]) {
    if (s.world.damaged[r] && s.treasury > 8000) applyCommand(s, { type: 'repairRoom', room: r });
  }
}

/** Contrôles de cohérence quotidiens (critère de sortie de la tranche 3). */
function checkInvariants(s: GameState, issues: string[]): void {
  const bad = (m: string) => { if (issues.length < 20) issues.push(`J${day(s)} : ${m}`); };
  if (!Number.isFinite(s.treasury)) bad('trésorerie non finie');
  if (!(s.prosperity >= 0 && s.prosperity <= 100)) bad(`prospérité hors bornes (${s.prosperity})`);
  if (!(s.danger >= 0 && s.danger <= 100)) bad(`danger hors bornes (${s.danger})`);
  if (!Number.isFinite(s.renown) || s.renown < 0) bad(`renommée invalide (${s.renown})`);
  for (const a of s.adventurers) {
    if (!Number.isFinite(a.gold) || !Number.isFinite(a.hp) || a.hp <= 0) bad(`${a.name} : or ou PV invalides`);
    if (a.runId !== null && !s.runs.some((r) => r.id === a.runId)) bad(`${a.name} : quête fantôme`);
  }
  for (const z of Object.values(s.populations)) for (const v of Object.values(z)) if (!(v >= 0 && v <= 100)) bad('population hors bornes');
  for (const r of s.runs) if (r.stage !== 'preparation' && !s.board.some((q) => q.id === r.quest.id)) bad(`quête en cours absente du tableau (${r.quest.title})`);
  if (s.world.decisions.length > 8) bad(`${s.world.decisions.length} décisions en attente`);
  if (s.world.mods.length > 60) bad(`${s.world.mods.length} modificateurs actifs`);
  if (s.world.rivals.some((r) => !Number.isFinite(r.renown))) bad('renommée de rivale invalide');
}

/** Joueur-robot : réagit une fois par jour, à 07h. */
function bot(s: GameState): void {
  answerDecisions(s);
  const beds = s.dortoirs.beds.paillasse + s.dortoirs.beds.commun + s.dortoirs.beds.individuelle + s.dortoirs.beds.suite;
  for (const c of [...s.doorCandidates]) {
    if (BOT === 'passif' || (s.adventurers.length < beds && s.adventurers.length < POP_MAX)) applyCommand(s, { type: 'acceptCandidate', id: c.id });
  }
  if (BOT === 'passif') { applyCommand(s, { type: 'setAutoSell', mode: 'tout' }); return; }
  applyCommand(s, { type: 'setAutoSell', mode: 'sans_usage' });
  if (!s.policy.credit) applyCommand(s, { type: 'setCredit', enabled: true, cap: 500 });

  // Prix un peu au-dessus de la référence : la tolérance des aventuriers le permet (×1,1 minimum)
  for (const b of ['paillasse', 'commun', 'individuelle'] as const) if (s.dortoirs.curseurs[b] !== 1.05) applyCommand(s, { type: 'setBedCurseur', bed: b, value: 1.05 });
  for (const d of ['ragout', 'roti', 'biere', 'vin'] as const) if (s.refectoire.curseurs[d] !== 1.05) applyCommand(s, { type: 'setDishCurseur', dish: d, value: 1.05 });
  if (s.taxRate !== 0.18) applyCommand(s, { type: 'setTaxRate', value: 0.18 });

  // Construction : infirmerie d'abord (elle évite les morts), puis la capacité d'accueil, puis le reste.
  // Le robot n'économise que pour l'essentiel (infirmerie, dortoirs pleins) ; sinon il bâtit le premier projet abordable.
  const full = s.adventurers.length >= beds - 1;
  const plan: [RoomId, number, number, boolean][] = [   // salle, niveau visé, réserve à garder, essentiel
    ['infirmerie', 1, 3000, true], ['dortoirs', 2, 3000, full], ['terrain', 1, 3000, false], ['refectoire', 2, 5000, false],
    ['dortoirs', 3, 8000, full], ['dortoirs', 4, 50000, full], ['infirmerie', 2, 10000, false], ['refectoire', 3, 15000, false], ['terrain', 2, 15000, false],
    ['infirmerie', 3, 20000, false], ['terrain', 3, 20000, false],
    ['refectoire', 4, 50000, false], ['infirmerie', 4, 50000, false], ['terrain', 4, 50000, false],
    ['dortoirs', 5, 80000, full], ['refectoire', 5, 80000, false], ['infirmerie', 5, 80000, false], ['terrain', 5, 80000, false],
  ];
  for (const [room, lvl, buffer, essential] of plan) {
    if (s[room].level >= lvl || s[room].works) continue;
    if (room === 'dortoirs' && !full) continue;
    if (upgrade(s, room, buffer) || essential) break;
  }
  // Répartition des lits : un tiers de lits confortables dès qu'ils existent
  if (!s.dortoirs.pendingBeds && !s.dortoirs.works) {
    const places = [0, 12, 24, 40, 60, 80][s.dortoirs.level];
    const want = s.dortoirs.level === 1 ? { paillasse: 12, commun: 0, individuelle: 0, suite: 0 }
      : s.dortoirs.level === 2 ? { paillasse: 10, commun: 14, individuelle: 0, suite: 0 }
      : s.dortoirs.level === 3 ? { paillasse: 8, commun: 20, individuelle: Math.floor((places - 28) / 2), suite: 0 }
      : s.dortoirs.level === 4 ? { paillasse: 8, commun: 24, individuelle: 10, suite: 2 }
      : { paillasse: 8, commun: 30, individuelle: 15, suite: 3 };
    const cur = s.dortoirs.beds;
    if (cur.paillasse !== want.paillasse || cur.commun !== want.commun || cur.individuelle !== want.individuelle || cur.suite !== want.suite) {
      applyCommand(s, { type: 'setBeds', beds: want });
    }
  }

  // Personnel
  const count = (role: string) => s.staff.filter((m) => m.role === role).length;
  if (s.infirmerie.level > 0 && count('soigneur') === 0 && s.treasury > 3000) hireBest(s, 'soigneur');
  if (s.infirmerie.level >= 3 && count('apothicaire') === 0 && s.treasury > 5000) hireBest(s, 'apothicaire');
  const waited = s.journal.filter((e) => e.tick > s.tick - 24 && e.text.startsWith("File d'attente")).length;
  if (waited > 0 && count('commis') + count('cuisinier') < 1 + s.refectoire.level && s.treasury > 8000) hireBest(s, 'commis');
  const places = [0, 12, 24, 40, 60, 80][s.dortoirs.level];
  if (count('valet') * 15 < places && s.treasury > 8000) hireBest(s, 'valet');
  if (count('intendant') === 0 && s.treasury > 30000) hireBest(s, 'intendant');
  if (count('inspecteur') === 0 && s.adventurers.length >= 15 && s.treasury > 20000) hireBest(s, 'inspecteur');
  if (s.refectoire.level >= 2 && !s.refectoire.menu.includes('panier')) applyCommand(s, { type: 'setMenu', menu: [...s.refectoire.menu, 'panier'] });
  if (s.refectoire.level >= 3 && !s.refectoire.menu.includes('roti') && s.staff.some((m) => m.role === 'cuisinier' && m.c >= 40)) {
    applyCommand(s, { type: 'setMenu', menu: [...s.refectoire.menu, 'roti'] });
  }

  // Professeurs : un seul au début, puis un par niveau de terrain, au meilleur rapport compétence / salaire
  const wantProfs = Math.min(PROFS_MAX, s.adventurers.length >= 18 ? s.terrain.level : Math.min(1, s.terrain.level));
  for (const p of [...s.profCandidates].sort((a, b) => b.pedagogie / profSalary(b) - a.pedagogie / profSalary(a))) {
    if (s.terrain.profs.length >= wantProfs) break;
    if (!canHireProf(s, p) && s.treasury > profSalary(p) * 30) {
      applyCommand(s, { type: 'hireProf', id: p.id });
      for (const slot of PROF_SLOTS) applyCommand(s, { type: 'setProfSlot', id: p.id, slot: slot as 'matin', open: true });
    }
  }

  // Rachat : viande pour le rôti, ingrédients pour l'apothicairerie
  const rules = [] as { res: string; maxStock: number }[];
  if (s.refectoire.menu.includes('roti')) rules.push({ res: 'viande_loup', maxStock: 3 }, { res: 'viande_sanglier', maxStock: 3 });
  if (s.infirmerie.level >= 3) rules.push({ res: 'glande_venin', maxStock: 2 }, { res: 'herbe_plaie', maxStock: 6 }, { res: 'lys_argent', maxStock: 2 });
  applyCommand(s, { type: 'setRachat', curseur: 0.9, rules });
  if (s.infirmerie.level >= 3) {
    applyCommand(s, { type: 'setAutoCraft', remede: 'antidote', min: 3 });
    applyCommand(s, { type: 'setAutoCraft', remede: 'potion', min: 4 });
    applyCommand(s, { type: 'setAutoCraft', remede: 'bandages', min: 8 });
  }

  // Contrats sur des ressources courantes
  for (const c of [...s.contractOffers]) {
    if (s.contracts.length < 2 && ['peau_loup', 'cuir_sanglier', 'peau_rat', 'crocs', 'defenses', 'viande_sanglier', 'herbe_plaie', 'babioles'].includes(c.res)) {
      applyCommand(s, { type: 'acceptContract', id: c.id });
    }
  }
}

interface Result {
  seed: number; treasury: number; net30: number; netEnd: number; adventurers: number; avgGold: number; avgLevel: number;
  deaths: number; departures: number; recruits: number; questsOk: number; questsFail: number; gameOver: boolean;
  firstRoom: number; fourRooms: number; firstLevel3: number; avgMorale: number; avgHp: number; teams: number;
  revenue: Record<string, number>; expenses: Record<string, number>; flows: Record<string, number>; types: Record<string, number>; frauds: number; outside: number;
  prosperity: number; palier: string; palierDay: number; renown: number; events: Record<string, number>; assaults: number; epidemics: number;
  rivals: string; issues: string[]; danger: number; sealDays: number[]; achievements: number; book: number;
  allL5: number; rooms: string; maxAdv: number; morale: number[]; conds: string; missing: string; gone: Record<string, number>;
}

function netOver(s: GameState, from: number, to: number): number {
  const a = s.ledger[from - 2]?.tresorerieFin ?? 30000;
  const b = s.ledger[to - 1]?.tresorerieFin ?? s.treasury;
  // Les investissements (travaux) sont exclus : on mesure le revenu d'exploitation.
  let works = 0;
  for (const d of s.ledger.slice(from - 1, to)) works += d.depenses.travaux ?? 0;
  return (b - a + works) / (to - from + 1);
}

function run(seed: number): Result {
  for (const k of Object.keys(FLOWS)) delete FLOWS[k];
  const s = createGame({ seed });
  let firstRoom = 0, fourRooms = 0, firstLevel3 = 0, net30 = 0, outside = 0;
  const types: Record<string, number> = {};
  const seenRuns = new Set<number>();
  const issues: string[] = [];
  const events: Record<string, number> = {};
  let palierDay = 0, assaults = 0, epidemics = 0, allL5 = 0, maxAdv = 0;
  const morale: number[] = [];
  const condDay: Record<string, number> = {};   // premier jour où chaque condition du sceau suivant est remplie
  const sealDays: number[] = [];
  const act: Record<string, number> = {};
  let followId = -1; const followAct: Record<string, number> = {}; const followRuns = new Set<number>();
  const seen = new Set<number>();
  const launched: { rang: string; reward: number }[] = [];
  let lastRec = 0;
  for (let h = 0; h < DAYS * 24 && !s.gameOver; h++) {
    if (FOLLOW && seed === FIRST_SEED && day(s) >= FOLLOW) {
      if (followId < 0) { const b = [...s.adventurers].sort((x, y) => y.level - x.level)[0]; followId = b.id; console.log(`Suivi de ${b.name}, ${b.classe} niveau ${b.level}, jour ${day(s)}`); }
      const f = s.adventurers.find((x) => x.id === followId);
      if (f) {
        followAct[f.activity.kind + (f.activity.bed ? `:${f.activity.bed}` : "") + (f.activity.dish ? `:${f.activity.dish}` : "")] = (followAct[f.activity.kind + (f.activity.bed ? `:${f.activity.bed}` : "") + (f.activity.dish ? `:${f.activity.dish}` : "")] ?? 0) + 1;
        const r = s.runs.find((x) => x.members.includes(f.id));
        if (r && r.stage !== 'preparation' && !followRuns.has(r.id)) { followRuns.add(r.id); console.log(`  J${day(s)} niv ${f.level} (xp ${f.xp}) part : ${r.quest.title} [${r.quest.type} ${r.quest.rang}] à ${r.members.length} · or ${money(f.gold)} moral ${Math.round(f.morale)}`); }
        if (s.tick % (24 * 14) === 0) { const tot = Object.values(followAct).reduce((x, y) => x + y, 0); console.log(`  -- J${day(s)} activités : ${Object.entries(followAct).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${Math.round(v / tot * 100)}%`).join(' ')} · pensées : ${f.thoughts.slice(-3).map((th) => th.text).join(' / ')}`); for (const k of Object.keys(followAct)) delete followAct[k]; }
      } else if (followId >= 0) { console.log(`  J${day(s)} : l'aventurier suivi a quitté la guilde`); followId = -2; }
    }
    if (TRACE && seed === FIRST_SEED) {
      // Trace hebdomadaire de la première graine : activités, tableau, quêtes lancées, recettes
      for (const a of s.adventurers) act[a.activity.kind] = (act[a.activity.kind] ?? 0) + 1;
      for (const r of s.runs) if (r.stage !== 'preparation' && !seen.has(r.id)) { seen.add(r.id); launched.push({ rang: r.quest.rang, reward: r.quest.reward + (r.quest.perHead ?? 0) }); }
      if (s.tick % (24 * 7) === 0 && s.tick > 0) {
        const tot = Object.values(act).reduce((x, y) => x + y, 0) || 1;
        const ranks: Record<string, number> = {};
        for (const a of s.adventurers) { const r = a.level <= 3 ? 'F' : a.level <= 7 ? 'E' : a.level <= 12 ? 'D' : 'C'; ranks[r] = (ranks[r] ?? 0) + 1; }
        const bq: Record<string, number> = {};
        for (const q of s.board) if (q.type !== 'aide') bq[q.type.slice(0, 4) + q.rang] = (bq[q.type.slice(0, 4) + q.rang] ?? 0) + 1;
        const byR: Record<string, number[]> = {};
        for (const d of launched) (byR[d.rang] ??= []).push(d.reward);
        let rec = 0; for (const d of s.ledger) for (const v of Object.values(d.recettes)) rec += v;
        console.log(`J${day(s)} avent ${s.adventurers.length} ${JSON.stringify(ranks)} trés ${money(s.treasury)} recettes/j ${money(Math.round((rec - lastRec) / 7))} renom ${Math.round(s.renown)} salles ${s.dortoirs.level}${s.refectoire.level}${s.infirmerie.level}${s.terrain.level}`);
        lastRec = rec;
        const recent = (re: RegExp) => s.adventurers.reduce((n, x) => n + x.thoughts.filter((th) => th.tick > s.tick - 168 && re.test(th.text)).length, 0);
        const lv = s.adventurers.map((x) => x.level).sort((x, y) => y - x);
        { const ok = s.world.escortes.filter((e) => e.ok).length; let flux = s.world.townSpend.reduce((x, y) => x + y, 0); for (const d of s.ledger.slice(-7)) for (const v of Object.values(d.recettes)) flux += v;
          console.log(`  prospérité ${s.prosperity.toFixed(0)} · danger ${s.danger} · escortes réussies ${ok}/${s.world.escortes.length} sur 7 j · flux ${money(flux)} · modificateurs ${s.world.mods.filter((m) => m.key.startsWith('prosperite')).map((m) => `${m.key} ${m.add ?? m.mult} (${m.source})`).join(', ') || 'aucun'}`); }
        console.log(`  dehors : plus de lit ${recent(/Pas un lit de libre/)}, trop pauvre ${recent(/Pas de quoi me payer/)}, auberge ${recent(/Sanglier Borgne/)} · or moyen ${money(Math.round(s.adventurers.reduce((x, y) => x + y.gold, 0) / s.adventurers.length))} · niveaux ${lv.slice(0, 8).join(' ')} · moral ${Math.round(s.adventurers.reduce((x, y) => x + y.morale, 0) / s.adventurers.length)} · lits ${JSON.stringify(s.dortoirs.beds)}`);
        console.log('  activités %', Object.entries(act).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${Math.round(v / tot * 100)}`).join(' '));
        console.log('  tableau', JSON.stringify(bq), '| lancées', Object.entries(byR).map(([k, v]) => `${k}:${v.length}×${money(Math.round(v.reduce((x, y) => x + y, 0) / v.length))}`).join(' '));
        for (const k of Object.keys(act)) delete act[k];
        launched.length = 0;
      }
    }
    const evBefore = s.world.events.map((e) => e.startTick + e.id);
    const hadAssault = !!s.world.assault, hadEpi = !!s.world.epidemic;
    step(s);
    for (const e of s.world.events) if (!evBefore.includes(e.startTick + e.id)) events[e.id] = (events[e.id] ?? 0) + 1;
    if (!hadAssault && s.world.assault) assaults++;
    if (!hadEpi && s.world.epidemic) epidemics++;
    if (!palierDay && s.world.palier !== 'bourg') palierDay = day(s);
    if (s.rank > sealDays.length + 1) sealDays.push(day(s));
    if (s.tick % 24 === 7) bot(s);
    if (s.tick % 24 === 12) {
      checkInvariants(s, issues);
      if (s.rank >= 3) for (const c of sealConditions(s)) { const k = `${s.rank + 1}:${c.label.replace(/ (.*)$/, '')}`; if (c.ok && !condDay[k]) condDay[k] = day(s); else if (!c.ok && !(k in condDay)) condDay[k] = 0; }
    }
    if (s.tick % 24 === 3) outside += s.adventurers.filter((a) => a.activity.kind === 'dehors').length;
    for (const r of s.runs) if (!seenRuns.has(r.id) && r.stage !== 'preparation') { seenRuns.add(r.id); types[r.quest.type] = (types[r.quest.type] ?? 0) + 1; }
    if (!firstRoom && roomsBuilt(s) >= 3) firstRoom = day(s);
    if (!allL5 && (['dortoirs', 'refectoire', 'infirmerie', 'terrain'] as RoomId[]).every((r) => s[r].level >= 5)) allL5 = day(s);
    maxAdv = Math.max(maxAdv, s.adventurers.length);
    if (s.tick % (24 * 28) === 0 && s.adventurers.length) morale.push(Math.round(s.adventurers.reduce((a, x) => a + x.morale, 0) / s.adventurers.length));
    if (!fourRooms && roomsBuilt(s) >= 4) fourRooms = day(s);
    if (!firstLevel3 && (['dortoirs', 'refectoire', 'infirmerie', 'terrain'] as RoomId[]).some((r) => s[r].level >= 3)) firstLevel3 = day(s);
    if (day(s) === 31 && s.tick % 24 === 1) net30 = netOver(s, 24, 30);
  }
  const revenue: Record<string, number> = {};
  for (const d of s.ledger) for (const [k, v] of Object.entries(d.recettes)) revenue[k] = (revenue[k] ?? 0) + v;
  const expenses: Record<string, number> = {};
  for (const d of s.ledger) for (const [k, v] of Object.entries(d.depenses)) expenses[k] = (expenses[k] ?? 0) + v;
  const advs = s.adventurers;
  if (VERBOSE) {
    console.log(`\n=== Graine ${seed} : journal (Critique) ===`);
    for (const e of s.journal.filter((x) => x.lvl === 'critique').slice(-25)) {
      console.log(`J${Math.floor(e.tick / 24) + 1} ${String(e.tick % 24).padStart(2, '0')}h  ${e.text.replace(/\[\[a:\d+\|([^\]]+)\]\]/g, '$1')}`);
    }
    console.log('Trésorerie tous les 5 jours :', s.ledger.filter((_, i) => i % 5 === 4).map((d) => Math.round(d.tresorerieFin / 100)).join(' '));
  }
  return {
    seed, treasury: s.treasury, net30, netEnd: netOver(s, Math.max(2, DAYS - 6), DAYS), adventurers: advs.length,
    avgGold: advs.reduce((a, x) => a + x.gold, 0) / Math.max(1, advs.length),
    avgLevel: advs.reduce((a, x) => a + x.level, 0) / Math.max(1, advs.length),
    deaths: s.stats.deaths, departures: s.stats.departures, recruits: s.stats.recruits,
    questsOk: s.stats.questsOk, questsFail: s.stats.questsFail, gameOver: !!s.gameOver,
    firstRoom, fourRooms, firstLevel3,
    avgMorale: advs.reduce((a, x) => a + x.morale, 0) / Math.max(1, advs.length),
    avgHp: advs.reduce((a, x) => a + x.hp / pvMax(x), 0) / Math.max(1, advs.length),
    teams: s.teams.length, revenue, expenses, flows: { ...FLOWS }, types,
    prosperity: s.prosperity, palier: s.world.palier, palierDay, renown: s.renown, events, assaults, epidemics, danger: s.danger,
    sealDays, achievements: Object.keys(s.legend.achievements).length, book: s.book.chapters.length,
    gone: s.departed.reduce((o, d) => { const k = `${d.reason} ${d.level >= 13 ? 'niv13+' : 'niv1-12'}`; o[k] = (o[k] ?? 0) + 1; return o; }, {} as Record<string, number>),
    missing: sealConditions(s).filter((c) => !c.ok).map((c) => c.label).join(' ; '),
    conds: Object.entries(condDay).map(([k, v]) => `${k} ${v ? 'J' + v : '—'}`).join(' · '),
    allL5, rooms: `${s.dortoirs.level}${s.refectoire.level}${s.infirmerie.level}${s.terrain.level}`, maxAdv, morale,
    rivals: s.world.rivals.map((r) => `${r.nom} ${Math.round(r.renown)}`).join(', '), issues, frauds: s.fraud.detected, outside,
  };
}

const results: Result[] = [];
for (let i = 0; i < SEEDS; i++) results.push(run(FIRST_SEED + i));
const avg = (k: keyof Result) => results.reduce((a, r) => a + (r[k] as number), 0) / results.length;
const fmt = (v: number) => money(Math.round(v));

console.log(`\nSimulation : ${SEEDS} graines × ${DAYS} jours, joueur-robot « ${BOT} »\n`);
console.log('graine | trésorerie | net/j J24-30 | net/j fin | avent. | or moy. | niv | morts | départs | recrues | quêtes ok/échec | 3 salles | 4 salles | 1er niv 3 | équipes');
for (const r of results) {
  console.log([String(r.seed).padStart(6), fmt(r.treasury).padStart(11), fmt(r.net30).padStart(12), fmt(r.netEnd).padStart(10),
    String(r.adventurers).padStart(6), fmt(r.avgGold).padStart(8), r.avgLevel.toFixed(1).padStart(4), String(r.deaths).padStart(5),
    String(r.departures).padStart(7), String(r.recruits).padStart(7), `${r.questsOk}/${r.questsFail}`.padStart(15),
    `J${r.firstRoom}`.padStart(8), `J${r.fourRooms}`.padStart(8), `J${r.firstLevel3}`.padStart(9), String(r.teams).padStart(7),
    r.gameOver ? ' FAILLITE' : ''].join(' |'));
}
const sumRec = (rec: (r: Result) => Record<string, number>) => {
  const t: Record<string, number> = {};
  for (const r of results) for (const [k, v] of Object.entries(rec(r))) t[k] = (t[k] ?? 0) + v / results.length;
  return t;
};
console.log('\nRecettes moyennes :', Object.entries(sumRec((r) => r.revenue)).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmt(v)}`).join(', '));
console.log('Dépenses moyennes :', Object.entries(sumRec((r) => r.expenses)).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmt(v)}`).join(', '));
console.log('Or des aventuriers :', Object.entries(sumRec((r) => r.flows)).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmt(v)}`).join(', '));
console.log('Départs (moyenne par partie) :', Object.entries(sumRec((r) => r.gone)).sort().map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', '));
console.log('Quêtes par type :', Object.entries(sumRec((r) => r.types)).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', '));
console.log(`Moral moyen ${avg('avgMorale').toFixed(0)}, PV moyens ${(avg('avgHp') * 100).toFixed(0)} %, fraudes détectées ${avg('frauds').toFixed(1)}, nuits dehors ${avg('outside').toFixed(0)}`);

console.log('\nMonde (fin de partie) :');
for (const r of results) console.log(`  graine ${r.seed} : prospérité ${r.prosperity.toFixed(0)} (${r.palier}${r.palierDay ? `, Ville au J${r.palierDay}` : ''}), danger ${r.danger}, renommée ${r.renown.toFixed(0)}, assauts ${r.assaults}, épidémies ${r.epidemics} · rivales : ${r.rivals}`);
for (const r of results) console.log(`  graine ${r.seed} : sceaux aux jours ${r.sealDays.length ? r.sealDays.join(', ') : 'aucun'} · ${r.achievements} hauts faits · ${r.book} chapitres au Livre · salles ${r.rooms}${r.allL5 ? ` (toutes niv 5 au J${r.allL5})` : ''} · ${r.maxAdv} aventuriers au plus · moral par mois ${r.morale.join(' ')}`);
for (const r of results) console.log(`  graine ${r.seed} : conditions (sceau n° : condition, jour) ${r.conds}`);
for (const r of results) if (r.missing) console.log(`  graine ${r.seed} : manque à la fin pour le sceau suivant : ${r.missing}`);
console.log('Événements (moyenne par partie) :', Object.entries(sumRec((r) => r.events)).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', '));
const allIssues = results.flatMap((r) => r.issues.map((i) => `graine ${r.seed}, ${i}`));
console.log(allIssues.length ? `\nIncohérences (${allIssues.length}) :\n  ${allIssues.slice(0, 15).join('\n  ')}` : '\nAucune incohérence détectée.');

const in30 = DAYS >= 30;
/** Cible de sceau (v1.1) : jour médian dans la fourchette, et sceau obtenu dans au moins 6 parties sur 8. */
function sealCheck(name: string, i: number, lo: number, hi: number): [string, boolean, string] {
  const days = results.map((r) => r.sealDays[i]).filter((d): d is number => d !== undefined).sort((a, b) => a - b);
  const med = days.length ? days[Math.floor(days.length / 2)] : 0;
  return [name, days.length >= results.length * 0.75 && med >= lo && med <= hi, `${days.length}/${results.length} parties, médiane J${med}`];
}
const checks: [string, boolean, string][] = [
  ['Aucune faillite', results.every((r) => !r.gameOver), `${results.filter((r) => r.gameOver).length} faillite(s)`],
  ['Aucune incohérence sur la durée', allIssues.length === 0, `${allIssues.length} incohérence(s)`],
  ['Trois salles construites vers J1-3 (1.13 : première salle)', avg('firstRoom') <= 4, `J${avg('firstRoom').toFixed(1)}`],
  ['Les 4 salles construites vers J8-12', avg('fourRooms') > 0 && avg('fourRooms') <= 14, `J${avg('fourRooms').toFixed(1)}`],
  ['Première salle au niveau 3 vers J45-60 (cible v1.1)', avg('firstLevel3') >= 40 && avg('firstLevel3') <= 65, `J${avg('firstLevel3').toFixed(1)}`],
  ...(in30 ? [['Revenu net de 10 à 20 po par jour vers J30', avg('net30') >= 1000 && avg('net30') <= 2000, fmt(avg('net30'))] as [string, boolean, string]] : []),
  ['Morts : environ 1 toutes les 2 à 3 semaines', avg('deaths') >= DAYS / 21 * 0.6 && avg('deaths') <= DAYS / 14 * 1.4, `${avg('deaths').toFixed(1)} en ${DAYS} jours`],
  ['Les aventuriers vivent de leur travail', avg('avgGold') > 300, `or moyen ${fmt(avg('avgGold'))}`],
  ...(DAYS >= 200 ? [sealCheck("Sceau d'Or vers J120-170", 2, 115, 175)] : []),
  ...(DAYS >= 500 ? [sealCheck('Sceau de Mithril (victoire) entre J300 et J500, dans la plupart des parties', 3, 280, 520)] : []),
];
console.log('\nCibles :');
for (const [name, ok, detail] of checks) console.log(`  ${ok ? '✔' : '✘'} ${name} — ${detail}`);
