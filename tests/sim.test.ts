// Tests automatiques (GDD 8.10.3) : formules, déterminisme, sauvegarde, commandes.
import { describe, expect, it } from 'vitest';
import { pvMax, rangIndex, xpRequired } from '../src/sim/adventurers';
import { IP, MQ } from '../src/sim/economy';
import { applyCommand, catchUp, createGame, stateHash, step, stepDays } from '../src/sim/engine';
import { fireEvent, startEpidemic, triggerAssault } from '../src/sim/world';
import { epilogue, sealConditions } from '../src/sim/legend';
import { upgradeCost } from '../src/sim/rooms';
import { money } from '../src/sim/format';
import { salaryOf } from '../src/sim/staff';
import { boardQuests, guildReach, relinkRuns } from '../src/sim/quests';
import { RESOURCES, SPECIES, ZONES } from '../src/sim/data';
import type { GameState } from '../src/sim/types';

describe('formules du GDD', () => {
  it('affiche la monnaie en or, argent et cuivre (1.1.1)', () => {
    expect(money(345)).toBe('3 po 4 pa 5 pc');
    expect(money(0)).toBe('0 pc');
    expect(money(1000)).toBe('10 po');
    expect(money(-25)).toBe('−2 pa 5 pc');
  });
  it('multiplicateur de qualité et indice de prix (1.3.1, 1.3.2)', () => {
    expect(MQ(0)).toBeCloseTo(0.6);
    expect(MQ(50)).toBeCloseTo(1);
    expect(MQ(100)).toBeCloseTo(1.4);
    const s = createGame({ seed: 1 });
    s.prosperity = 50;
    expect(IP(s)).toBeCloseTo(1);
  });
  it('salaire selon la compétence (1.4.3)', () => {
    const s = createGame({ seed: 1 });
    const cook = { ...s.staff[0], role: 'cuisinier' as const, c: 50 };
    expect(salaryOf(cook)).toBe(100);
    expect(salaryOf({ ...cook, c: 25 })).toBe(41);
  });
  it('expérience requise (3.9)', () => {
    expect(xpRequired(1)).toBe(100);
    expect(xpRequired(4)).toBe(800);
  });
  it('données cohérentes : chaque dépouille et chaque espèce de zone existent', () => {
    for (const sp of Object.values(SPECIES)) for (const r of sp.butin) expect(RESOURCES[r]).toBeDefined();
    for (const z of Object.values(ZONES)) for (const id of Object.keys(z.especes)) expect(SPECIES[id]).toBeDefined();
  });
});

describe('déterminisme (8.3)', () => {
  it('même graine, même partie', () => {
    const a = createGame({ seed: 42 });
    const b = createGame({ seed: 42 });
    stepDays(a, 20);
    stepDays(b, 20);
    expect(stateHash(a)).toBe(stateHash(b));
  });
  it('graines différentes, parties différentes', () => {
    const a = createGame({ seed: 1 });
    const b = createGame({ seed: 2 });
    stepDays(a, 3);
    stepDays(b, 3);
    expect(stateHash(a)).not.toBe(stateHash(b));
  });
  it('les commandes du joueur sont rejouables', () => {
    const play = () => {
      const s = createGame({ seed: 7 });
      stepDays(s, 2);
      applyCommand(s, { type: 'setBedCurseur', bed: 'paillasse', value: 1.3 });
      applyCommand(s, { type: 'setTaxRate', value: 0.25 });
      stepDays(s, 5);
      return stateHash(s);
    };
    expect(play()).toBe(play());
  });
});

describe('sauvegarde (8.5) et rattrapage (8.6)', () => {
  it('sauvegarder puis recharger ne change rien', () => {
    const a = createGame({ seed: 5 });
    stepDays(a, 8);
    const b: GameState = JSON.parse(JSON.stringify(a));
    stepDays(a, 8);
    stepDays(b, 8);
    expect(stateHash(b)).toBe(stateHash(a));
  });
  it('7 jours d\'affilée = sauvegarde + rattrapage de 7 jours', () => {
    const live = createGame({ seed: 9 });
    const saved: GameState = JSON.parse(JSON.stringify(live));
    for (let i = 0; i < 168; i++) step(live);
    for (let i = 0; i < 168; i++) step(saved);
    expect(stateHash(saved)).toBe(stateHash(live));
  });
});

describe('règles de jeu', () => {
  it('les travaux coûtent, durent et augmentent le niveau (1.2)', () => {
    const s = createGame({ seed: 3 });
    const before = s.treasury;
    applyCommand(s, { type: 'upgradeRoom', room: 'refectoire' });
    expect(s.treasury).toBe(before - 20000);
    expect(s.refectoire.works?.targetLevel).toBe(2);
    stepDays(s, 3);
    expect(s.refectoire.level).toBe(2);
    expect(s.refectoire.menu).toContain('biere');
  });
  it('les aventuriers gardent des jauges valides', () => {
    const s = createGame({ seed: 11 });
    stepDays(s, 15);
    for (const a of s.adventurers) {
      expect(a.hp).toBeGreaterThan(0);
      expect(a.hp).toBeLessThanOrEqual(pvMax(a));
      for (const v of [a.hunger, a.energy, a.morale]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
      expect(Number.isInteger(a.gold)).toBe(true);
    }
    expect(Number.isInteger(s.treasury)).toBe(true);
  });
  it('une prime bloque la somme et la rend si personne ne la prend (4.4)', () => {
    const s = createGame({ seed: 21 });
    s.adventurers = [];
    const before = s.treasury;
    applyCommand(s, { type: 'createPrime', questType: 'chasse', zone: 'foret', target: 'loup', count: 4, reward: 500, days: 2 });
    expect(s.treasury).toBe(before - 500);
    stepDays(s, 4);
    expect(s.today.recettes.primesRendues ?? s.ledger.reduce((a, d) => a + (d.recettes.primesRendues ?? 0), 0)).toBeGreaterThan(0);
  });
  it("l'infirmerie stabilise un cas critique (1.8, ajusté en tranche 2)", () => {
    const s = createGame({ seed: 22 });
    s.infirmerie.level = 1;
    s.staff.push({ ...s.staff[0], id: 9999, role: 'soigneur', c: 90 });
    s.infirmerie.remedes.bandages = 5;
    const a = s.adventurers[0];
    a.gold = 5000;
    a.states = [{ etat: 'plaie', gravite: 2, since: s.tick }];
    a.activity.until = s.tick;
    let healed = false;
    for (let i = 0; i < 48 && !healed; i++) { step(s); healed = !a.states.some((x) => x.gravite >= 2); }
    expect(healed).toBe(true);
  });
  it('un contrat se livre depuis la resserre (2.5.3)', () => {
    const s = createGame({ seed: 23 });
    const offer = s.contractOffers[0];
    applyCommand(s, { type: 'acceptContract', id: offer.id });
    s.resserre.push({ res: offer.res, qty: offer.qty, quality: 'intacte', fresh: 1 });
    applyCommand(s, { type: 'deliverContract', id: offer.id });
    expect(s.contracts.length).toBe(0);
    expect(s.today.recettes.contrats).toBeGreaterThan(0);
  });
  it('les populations restent entre 0 et 100 (2.7)', () => {
    const s = createGame({ seed: 24 });
    stepDays(s, 40);
    for (const z of Object.values(s.populations)) for (const v of Object.values(z)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
  });
  it('déterminisme sur 60 jours avec infirmerie, terrain, primes et contrats', () => {
    const play = () => {
      const s = createGame({ seed: 77 });
      applyCommand(s, { type: 'upgradeRoom', room: 'infirmerie' });
      stepDays(s, 2);
      applyCommand(s, { type: 'upgradeRoom', room: 'terrain' });
      const sg = s.staffCandidates.find((m) => m.role === 'soigneur');
      if (sg) applyCommand(s, { type: 'hireStaff', id: sg.id });
      stepDays(s, 3);
      const p = s.profCandidates[0];
      if (p) applyCommand(s, { type: 'hireProf', id: p.id });
      applyCommand(s, { type: 'createPrime', questType: 'extermination', zone: 'foret', target: 'loup', count: 6, reward: 600, days: 5 });
      applyCommand(s, { type: 'setCredit', enabled: true, cap: 1000 });
      stepDays(s, 55);
      return stateHash(s);
    };
    expect(play()).toBe(play());
  });
  it('la faillite survient après 7 jours d\'endettement (1.1.4)', () => {
    const s = createGame({ seed: 4 });
    s.treasury = -500000;
    stepDays(s, 9);
    expect(s.gameOver).not.toBeNull();
  });
});

describe('revenus de la guilde (ajustements tranche 2)', () => {
  it('le greffier affiche surtout des quêtes à la portée de la guilde', () => {
    const s = createGame({ seed: 31 });
    let inReach = 0, total = 0;
    for (let d = 0; d < 20; d++) {
      stepDays(s, 1);
      const reach = guildReach(s);
      for (const q of boardQuests(s)) { total++; if (rangIndex(q.rang) <= reach) inReach++; }
    }
    expect(total).toBeGreaterThan(0);
    expect(inReach / total).toBeGreaterThan(0.7);
  });
  it('après un chargement, une quête en cours redevient la même que son affiche', () => {
    const s = createGame({ seed: 12 });
    let i = 0;
    while (!s.runs.some((r) => s.board.some((q) => q.id === r.quest.id)) && i++ < 24 * 10) step(s);
    const b: GameState = JSON.parse(JSON.stringify(s));
    relinkRuns(b);
    const run = b.runs.find((r) => b.board.some((q) => q.id === r.quest.id))!;
    expect(run).toBeDefined();
    expect(b.board.find((q) => q.id === run.quest.id)).toBe(run.quest);
  });
});

describe('le monde vivant (tranche 3)', () => {
  it('la ville change de palier après 14 jours de prospérité au-delà du seuil (5.3)', () => {
    const s = createGame({ seed: 41 });
    for (let d = 0; d < 16; d++) { s.prosperity = 60; stepDays(s, 1); s.prosperity = 60; }
    expect(s.world.palier).toBe('ville');
  });
  it("une décision sans réponse prend son option par défaut au bout de 12 h (7.7.1)", () => {
    const s = createGame({ seed: 42 });
    fireEvent(s, 'baron');
    expect(s.world.decisions.length).toBe(1);
    for (let i = 0; i < 13; i++) step(s);
    expect(s.world.decisions.length).toBe(0);
    // « Refuser » est l'option par défaut : pas de soldats logés, pas de paiement du baron
    expect(s.world.mods.some((m) => m.key === 'lits_occupes')).toBe(false);
    expect(s.ledger.concat(s.today).some((d) => d.recettes.evenements)).toBe(false);
  });
  it('un assaut se déroule en trois vagues puis se termine (5.6)', () => {
    const s = createGame({ seed: 43 });
    triggerAssault(s, 'loup', 'foret');
    expect(s.world.assault).not.toBeNull();
    stepDays(s, 5);
    expect(s.world.assault).toBeNull();
    expect(s.world.lastAssault).toBeGreaterThan(0);
    expect(s.journal.some((e) => e.text.startsWith('Vague 3'))).toBe(true);
  });
  it("une épidémie ferme le Temple puis s'achève (5.7)", () => {
    const s = createGame({ seed: 44 });
    expect(startEpidemic(s, 'test')).toBe(true);
    stepDays(s, 1);
    expect(s.world.epidemic === null || s.world.mods.some((m) => m.key === 'temple:ferme' && m.until > s.tick)).toBe(true);
    stepDays(s, 30);
    expect(s.world.epidemic).toBeNull();
  });
  it('le rattrapage du mode Chronique est plafonné à 7 jours et identique au jeu en direct (8.6)', () => {
    const live = createGame({ seed: 45, mode: 'chronique', startHour: 20 });
    const saved: GameState = JSON.parse(JSON.stringify(live));
    stepDays(live, 7);
    const report = catchUp(saved, 200);
    expect(report.hours).toBe(168);
    expect(report.slept).toBe(32);
    expect(stateHash(saved)).toBe(stateHash(live));
    expect(report.entries.every((e) => e.lvl === 'important' || e.lvl === 'critique')).toBe(true);
  });
  it('une année complète reste cohérente (critère de sortie de la tranche 3)', () => {
    const s = createGame({ seed: 46 });
    for (let d = 0; d < 112 && !s.gameOver; d++) {
      stepDays(s, 1);
      for (const dec of [...s.world.decisions]) applyCommand(s, { type: 'decide', id: dec.id, option: dec.defaut });
      expect(s.prosperity).toBeGreaterThanOrEqual(0);
      expect(s.prosperity).toBeLessThanOrEqual(100);
      expect(Number.isFinite(s.renown)).toBe(true);
      expect(s.world.mods.length).toBeLessThan(60);
    }
    expect(s.world.history.length).toBeGreaterThanOrEqual(100);
  });
});

describe('la légende (tranche 4)', () => {
  it('le héraut appose le Sceau de Fer quand points et conditions sont réunis (6.2)', () => {
    const s = createGame({ seed: 51 });
    s.renown = 150;
    s.legend.counters.quetesReussies = 25;
    for (const r of ['infirmerie', 'terrain'] as const) s[r].level = 1;
    while (s.adventurers.length < 15) s.adventurers.push({ ...JSON.parse(JSON.stringify(s.adventurers[0])), id: s.nextId++ });
    stepDays(s, 3);   // vérification au matin, héraut le lendemain à 08h
    expect(s.rank).toBe(2);
    expect(s.legend.achievements.sceau_fer).toBeDefined();
    expect(sealConditions(s).length).toBeGreaterThan(0);
  });
  it('les niveaux 4 et 5 des salles demandent un sceau', () => {
    const s = createGame({ seed: 52 });
    s.dortoirs.level = 3;
    expect(upgradeCost(s, 'dortoirs')).toBeNull();
    s.rank = 3;
    expect(upgradeCost(s, 'dortoirs')).toBe(150000);
  });
  it('banque et usurier : plafonds, intérêts et remboursement (1.1.3)', () => {
    const s = createGame({ seed: 53 });
    expect(applyCommand(s, { type: 'borrow', lender: 'banque', amount: 500000 })).not.toBeNull();
    const t0 = s.treasury;
    expect(applyCommand(s, { type: 'borrow', lender: 'banque', amount: 10000 })).toBeNull();
    expect(s.treasury).toBe(t0 + 10000);
    expect(s.weekRevenue).toBe(0);                                    // un emprunt n'est pas un revenu
    applyCommand(s, { type: 'borrow', lender: 'usurier', amount: 10000 });
    stepDays(s, 8);
    expect(s.loans.usurier!.principal).toBeGreaterThan(10000);         // 5 % par semaine
    applyCommand(s, { type: 'repay', lender: 'banque', amount: 10000 });
    expect(s.loans.banque).toBeNull();
  });
  it('la difficulté change la trésorerie de départ et désactive les Défis si on la modifie (6.5)', () => {
    expect(createGame({ seed: 54, difficulty: 'paisible' }).treasury).toBe(45000);
    expect(createGame({ seed: 54, difficulty: 'impitoyable' }).treasury).toBe(20000);
    const s = createGame({ seed: 54 });
    applyCommand(s, { type: 'setDifficulty', id: 'impitoyable' });
    expect(s.difficulty.changed).toBe(true);
    expect(s.difficulty.faillite).toBe(4);
  });
  it('Gaspard conseille au premier matin, et se tait quand on le désactive (6.4)', () => {
    const s = createGame({ seed: 55 });
    stepDays(s, 1);
    expect(s.gaspard.queue.some((a) => a.key === 'intro')).toBe(true);
    const t = createGame({ seed: 55 });
    applyCommand(t, { type: 'setGaspard', mode: 'off' });
    stepDays(t, 3);
    expect(t.gaspard.queue.length).toBe(0);
  });
  it("le Livre de la guilde ouvre un chapitre par saison, et l'épilogue se rédige (6.6, 6.9)", () => {
    const s = createGame({ seed: 56 });
    stepDays(s, 30);
    expect(s.book.chapters.length).toBe(1);
    expect(s.book.chapters[0].title).toContain('Printemps');
    expect(s.book.weekly.length).toBeGreaterThanOrEqual(4);
    const e = epilogue(s);
    expect(e.bilan.length).toBeGreaterThan(0);
    expect(e.destins.length).toBeGreaterThan(0);
  });
});
