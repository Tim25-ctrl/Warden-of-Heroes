// Cycle de vie des aventuriers : recrutement, départs, retraite, mort (GDD 3.6, 3.12).
import { className, createAdventurer, hasTrait, visibleTraits } from './adventurers';
import { hourlyAilments } from './ailments';
import { P, TRAITS } from './data';
import { clamp, cotisationPrice, cotisationRef, hasModule } from './economy';
import { advLink, money } from './format';
import { earn, log, spend, think, flow } from './journal';
import { chance, randInt, range } from './rng';
import { onDeath, onLeave } from './social';
import { hasPrivilege } from './charter';
import type { Adventurer, GameState, Money } from './types';
import { addRenown, onAdventurerDeath, poachedDeparture, recruitShareFactor } from './world';
import { onMemorial } from './legend';
import { retiredTeacher } from './training';

export function removeFromGuild(s: GameState, a: Adventurer, reason: string): void {
  s.adventurers = s.adventurers.filter((x) => x.id !== a.id);
  for (const run of s.runs) run.members = run.members.filter((id) => id !== a.id);
  a.job = null;
  s.departed.push({ id: a.id, name: a.name, classe: a.classe, level: a.level, reason, tick: s.tick });
  if (s.departed.length > 200) s.departed.splice(0, s.departed.length - 200);
}

export function killAdventurer(s: GameState, a: Adventurer, circumstances: string): void {
  if (!s.adventurers.includes(a)) return;
  removeFromGuild(s, a, 'mort');
  s.stats.deaths += 1;
  const eloge = `${a.name}, ${className(a.classe).toLowerCase()} de niveau ${a.level}, est mort ${circumstances}. `
    + `${a.history.questsOk} quête${a.history.questsOk > 1 ? 's' : ''} accomplie${a.history.questsOk > 1 ? 's' : ''}.`;
  log(s, 'aventuriers', 'critique', eloge);
  onAdventurerDeath(s, a, eloge);
  if (a.loyalty >= 70 && a.gold > 0) {
    const legs = Math.round(a.gold * range(s, 'aventuriers', 0.1, 0.3));
    earn(s, 'legs', legs);
    log(s, 'economie', 'info', `${a.name} a légué ${money(legs)} à la guilde.`);
  }
  if (hasModule(s, 'mur')) {
    s.memorial.push(`${a.name}, ${className(a.classe).toLowerCase()} de niveau ${a.level}`);
    log(s, 'guilde', 'info', `Le nom de ${a.name} est gravé sur le Mur du Souvenir.`);
    onMemorial(s);
  }
  onDeath(s, a);
  for (const o of s.adventurers) {
    o.morale = clamp(o.morale - (hasModule(s, 'mur') ? 1 : 3), 0, 100);
    if (hasModule(s, 'mur') && hasTrait(o, 'pieux')) o.morale = clamp(o.morale + 3, 0, 100);
  }
}

export function leave(s: GameState, a: Adventurer, reason: string, text: string): void {
  removeFromGuild(s, a, reason);
  s.stats.departures += 1;
  if (reason === 'depart') addRenown(s, -P.renommee.depart);
  log(s, 'aventuriers', 'important', text);
  onLeave(s, a);
}

/** Guerre régionale : un aventurier part sous les drapeaux (5.4.3). */
export function conscript(s: GameState, a: Adventurer): void {
  removeFromGuild(s, a, 'conscrit');
  s.stats.departures += 1;
  log(s, 'aventuriers', 'important', `${a.name} part à la guerre.`);
  onLeave(s, a);
}

export function excludeAdventurer(s: GameState, id: number, fraud = false): void {
  const a = s.adventurers.find((x) => x.id === id);
  if (!a || (a.runId !== null && !fraud)) return;
  leave(s, a, 'exclu', `${a.name} est exclu de la guilde.`);
  if (a.debt > 0) log(s, 'economie', 'info', `Sa dette de ${money(a.debt)} est perdue.`);
}

/** Offre de rétention (7.5.2) : prime ou exonération fiscale. */
export function retain(s: GameState, id: number, kind: 'prime' | 'exoneration', amount: Money = 1000): void {
  const a = s.adventurers.find((x) => x.id === id);
  if (!a) return;
  if (kind === 'prime') {
    const v = Math.min(amount, s.treasury);
    if (v <= 0) return;
    spend(s, 'retention', v);
    a.gold += v; flow('retention', (v));
    a.morale = clamp(a.morale + Math.min(30, (v / 1000) * 5) / 0.8, 0, 100);
  } else {
    a.exemptUntil = s.tick + 14 * 24;
    a.griefFiscal = Math.max(0, a.griefFiscal - 10);
    a.morale = clamp(a.morale + 8, 0, 100);
  }
  // Face à une offre d'une rivale, une prime pèse davantage (5.5).
  a.loyalty = clamp(a.loyalty + 5 + (a.poachedBy && kind === 'prime' ? Math.min(15, amount / 500) : 0), 0, 100);
  think(s, a, kind === 'prime' ? 'La guilde tient à moi. Ça compte.' : 'Deux semaines sans taxe ? Voilà qui me fait réfléchir.', 'info');
}

/** États et morts, chaque heure (1.8.1). */
export function hourlyHealth(s: GameState): void {
  for (const a of [...s.adventurers]) {
    if (a.states.length === 0) continue;
    const cause = hourlyAilments(s, a);
    if (cause) killAdventurer(s, a, cause);
  }
}

// ---------- Évolution quotidienne (06h) ----------

export function dailyAdventurers(s: GameState): void {
  const weekly = Math.floor(s.tick / 24) % 7 === 0;
  for (const a of [...s.adventurers]) {
    a.drinksToday = 0;
    a.mealsToday = 0;
    a.trainedToday = 0;
    a.griefPrix = Math.max(0, a.griefPrix - P.tarifs.griefDecroissanceJour);
    a.griefFiscal = Math.max(0, a.griefFiscal - P.tarifs.griefDecroissanceJour);
    const gap = Math.abs(a.morale - 50);
    const drift = Math.max(P.aventuriers.moralDeriveJour, P.aventuriers.moralRetourPct * gap) * (a.attrs.VOL >= 14 ? 1.5 : 1);
    if (a.morale > 50) a.morale = Math.max(50, a.morale - drift);
    else if (a.morale < 50) a.morale = Math.min(50, a.morale + drift);
    if (a.morale >= 80) a.loyalty += 1;
    if (a.morale < 40) a.loyalty -= 1;
    if (weekly) a.loyalty += 1 + (hasModule(s, 'coffres') && a.fierte >= 30 ? 1 : 0);
    a.loyalty = clamp(a.loyalty, 0, 100);
    if (a.traits.length > 1 && s.tick >= a.traitRevealTick && s.tick - 24 < a.traitRevealTick) {
      log(s, 'aventuriers', 'info', `On découvre que ${advLink(a)} est ${TRAITS[a.traits[1]].nom.toLowerCase()}.`);
    }
    if (a.gold >= a.fortuneGoal && a.runId === null && a.debt === 0) {
      leave(s, a, 'retraite', `${advLink(a)} a fait fortune et prend sa retraite (${money(a.gold)}).`);
      retiredTeacher(s, a);
    }
  }
}

// ---------- Envie de partir (3.12.2) ----------

export function departureDesire(a: Adventurer): number {
  return 0.8 * (50 - a.morale) + 0.5 * (a.griefPrix + a.griefFiscal + (a.griefRang ?? 0)) - 0.4 * a.loyalty;
}

export function evaluateDepartures(s: GameState): void {
  for (const a of [...s.adventurers]) {
    if (a.poachedBy && poachedDeparture(s, a)) continue;
    if (a.poachedBy) continue;
    const envie = departureDesire(a);
    if (a.status === 'depart' && a.leaveTick !== null && s.tick >= a.leaveTick) {
      if (envie >= P.aventuriers.seuilDepart && a.runId === null) {
        const debt = a.debt > 0 ? ` Sa dette de ${money(a.debt)} est perdue.` : '';
        leave(s, a, 'depart', `${advLink(a)} quitte la guilde, mécontent.${debt}`);
        continue;
      }
      if (envie < P.aventuriers.seuilDepart) {
        a.status = envie >= P.aventuriers.seuilMecontent ? 'mecontent' : 'actif';
        a.leaveTick = null;
        think(s, a, 'Finalement, je reste. Les choses s\'arrangent.', 'info');
        continue;
      }
    }
    if (a.status === 'depart') continue;
    if (envie >= P.aventuriers.seuilDepart) {
      a.status = 'depart';
      a.leaveTick = s.tick + 24 * randInt(s, 'aventuriers', 1, 3);
      log(s, 'aventuriers', 'important', `${advLink(a)} annonce son départ prochain.`);
      think(s, a, a.griefPrix > 20 ? 'Ici, tout est hors de prix. Je vais chercher ailleurs.'
        : a.griefFiscal > 20 ? 'La guilde se sert trop sur notre butin.' : 'Je ne me sens plus à ma place ici.', 'info');
    } else if (envie >= P.aventuriers.seuilMecontent) {
      if (a.status !== 'mecontent') {
        a.status = 'mecontent';
        think(s, a, a.griefPrix > 15 ? 'Les prix de cette guilde me restent en travers de la gorge.'
          : a.griefFiscal > 15 ? 'Cette taxe sur le butin, c\'est du vol.' : 'Je n\'ai pas le cœur à l\'ouvrage.', 'info');
      }
    } else {
      a.status = 'actif';
    }
  }
}

// ---------- Candidats à la porte (3.12.1) ----------

export function weekPriceRatio(s: GameState): number {
  const r = s.stats.priceRatios;
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 1;
}

export function spawnCandidates(s: GameState): void {
  const fCot = clamp(1.5 - 0.5 * (cotisationPrice(s) / cotisationRef(s)), 0.2, 1.5);
  const fPrix = clamp(1.6 - 0.6 * weekPriceRatio(s), 0.3, 1.3);
  const fTax = s.taxRate > 0.3 ? 0.5 : s.taxRate <= 0.1 ? 1.2 : 1;
  const expected = P.aventuriers.candidatsParJour * fCot * fPrix * fTax * recruitShareFactor(s) * (hasPrivilege(s, 'recrutement') ? 1.2 : 1);
  const n = Math.floor(expected) + (chance(s, 'aventuriers', expected % 1) ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const a = createAdventurer(s, { level: randInt(s, 'aventuriers', 1, 4) + (hasPrivilege(s, 'ecuyers') ? 1 : 0), goldMin: P.aventuriers.orRecrueMin, goldMax: P.aventuriers.orRecrueMax });
    if (s.pantheonNames.length && chance(s, 'aventuriers', 0.03)) {
      const hero = s.pantheonNames[randInt(s, 'aventuriers', 0, s.pantheonNames.length - 1)];
      a.history.notable.push(`descendant de ${hero}`);
      log(s, 'aventuriers', 'info', `${a.name} se présente comme un descendant de ${hero}, dont le nom figure au Panthéon.`);
    }
    const c = { ...a, doorUntil: s.tick + 24 };
    s.doorCandidates.push(c);
    const rule = s.policy.autoAccept;
    if (rule.enabled) {
      const bad = rule.refuseMalhonnete && visibleTraits(a, s.tick).includes('malhonnete');
      if (a.level >= rule.minLevel && !bad) { acceptCandidate(s, a.id); continue; }
    }
    log(s, 'aventuriers', 'important', `Un candidat se présente à la porte : ${a.name}, ${className(a.classe).toLowerCase()} de niveau ${a.level}.`);
  }
}

export function expireCandidates(s: GameState): void {
  const gone = s.doorCandidates.filter((c) => c.doorUntil <= s.tick);
  if (!gone.length) return;
  s.doorCandidates = s.doorCandidates.filter((c) => c.doorUntil > s.tick);
  for (const c of gone) log(s, 'aventuriers', 'detail', `${c.name} n'a pas attendu davantage et repart.`);
}

export function acceptCandidate(s: GameState, id: number): void {
  const i = s.doorCandidates.findIndex((c) => c.id === id);
  if (i < 0) return;
  const { doorUntil: _d, ...a } = s.doorCandidates[i];
  void _d;
  s.doorCandidates.splice(i, 1);
  const fee = Math.min(cotisationPrice(s), a.gold);
  a.gold -= fee; flow('cotisation', -(fee));
  earn(s, 'cotisations', fee);
  a.joinedTick = s.tick;
  if (a.level === 1) a.history.notable.push('recrue de niveau 1');
  a.lastQuestTick = s.tick;
  a.traitRevealTick = s.tick + 7 * 24;
  a.activity = { kind: 'flaner', until: s.tick, place: 'hall' };
  s.adventurers.push(a);
  s.stats.recruits += 1;
  log(s, 'aventuriers', 'info', `${advLink(a)} rejoint la guilde (cotisation ${money(fee)}).`);
  think(s, a, hasTrait(a, 'sociable') ? 'Une nouvelle maison ! J\'ai hâte de rencontrer tout le monde.' : 'Voyons ce que vaut cette guilde.');
}

export function refuseCandidate(s: GameState, id: number): void {
  const c = s.doorCandidates.find((x) => x.id === id);
  if (!c) return;
  s.doorCandidates = s.doorCandidates.filter((x) => x.id !== id);
  log(s, 'aventuriers', 'detail', `${c.name} est éconduit à la porte.`);
}
