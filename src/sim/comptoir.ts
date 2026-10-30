// Le comptoir : retour de quête, taxe, fraude, rachat, partage (GDD 2.4, 2.6, 4.9).
import { gainXp, hasTrait, rangForLevel, rangIndex, xpQuestType } from './adventurers';
import { P, RESOURCES, SPECIES } from './data';
import { clamp, isAbsent, onDuty } from './economy';
import { advLink, money } from './format';
import { wear } from './gear';
import { earn, log, spend, think, flow } from './journal';
import { excludeAdventurer } from './lifecycle';
import { addLot, lotValue, resserreCapacity, resserreWeight, sellInTown, stockOfRes, storeOrSell } from './market';
import { chance, range } from './rng';
import { addRel, afterQuestTeam, onQuestTogether } from './social';
import type { Adventurer, GameState, Money, Quest, QuestRun, ResLot } from './types';
import { onQuestEnd, referenceTaxRate } from './world';

function modRang(q: Quest, a: Adventurer): number {
  const d = rangIndex(q.rang) - rangIndex(rangForLevel(a.level));
  const x = P.quetes.xpEcartRang;
  return d >= 1 ? x.dessus : d === 0 ? x.egal : d === -1 ? x.dessous1 : x.dessous2;
}

export function taxExempt(s: GameState, a: Adventurer, aide: boolean): boolean {
  return (s.exemptBeginners && a.level <= 3) || (aide && s.exemptAide) || a.exemptUntil > s.tick;
}

export function taxFor(s: GameState, a: Adventurer, base: Money, aide: boolean): Money {
  if (taxExempt(s, a, aide)) return 0;
  // Le grief se mesure au taux de référence régional, moyenne des guildes (2.6.1, 5.5).
  const ref = referenceTaxRate(s);
  if (s.taxRate > ref + 0.05) a.griefFiscal += 0.5 * (s.taxRate - ref) * 100 * (a.fierte >= 60 ? 1.3 : 1);
  return Math.round(s.taxRate * base);
}

// ---------- Fraude (2.6.2) ----------

function fraudChance(s: GameState, a: Adventurer): number {
  if (hasTrait(a, 'honnete')) return 0;
  let p = 2 * (s.taxRate - 0.1) * (1 - a.loyalty / 100) + (hasTrait(a, 'malhonnete') ? 0.15 : 0);
  if (s.fraud.reductionUntil > s.tick) p *= 1 - s.fraud.reduction;
  p *= Math.pow(0.5, a.history.fraudsCaught);
  return clamp(p, 0, 0.8);
}

function detectionChance(s: GameState, a: Adventurer): number {
  const insp = s.staff.filter((m) => m.role === 'inspecteur' && !isAbsent(s, m));
  let p = P.fraude.baseDetection;
  if (insp.length) {
    const c = insp.reduce((x, m) => x + m.c, 0) / insp.length;
    const coverage = Math.min(1, (insp.length * P.fraude.inspecteurCapacite) / Math.max(1, s.adventurers.length));
    p = (P.fraude.inspecteurDetection + P.fraude.inspecteurParC * c) * coverage;
  }
  if (a.classe === 'voleur') p -= 0.1;
  return clamp(p, 0.01, 0.95);
}

function sanction(s: GameState, a: Adventurer, hiddenTax: Money): 'exclu' | null {
  s.fraud.detected += 1;
  a.history.fraudsCaught += 1;
  a.respect = clamp(a.respect - 5, 0, 100);
  switch (s.policy.sanction) {
    case 'avertissement':
      a.morale = clamp(a.morale - 5, 0, 100);
      log(s, 'economie', 'important', `Fraude détectée au comptoir : ${advLink(a)} cachait une partie de son butin. Simple avertissement.`);
      return null;
    case 'amende': {
      const fine = Math.min(a.gold, 2 * hiddenTax);
      a.gold -= fine; flow('amende', -(fine));
      earn(s, 'amendes', fine);
      s.fraud.fines += fine;
      a.morale = clamp(a.morale - 15, 0, 100);
      a.griefFiscal += 10;
      s.fraud.reduction = 0.1;
      s.fraud.reductionUntil = s.tick + 7 * 24;
      log(s, 'economie', 'important', `Fraude détectée : ${advLink(a)} écope d'une amende de ${money(fine)}.`);
      return null;
    }
    case 'exclusion':
      s.fraud.reduction = 0.25;
      s.fraud.reductionUntil = s.tick + 7 * 24;
      log(s, 'economie', 'important', `Fraude détectée : ${advLink(a)} est exclu de la guilde.`);
      return 'exclu';
  }
}

// ---------- Rachat par la guilde (2.4.1) ----------

function rachatWanted(s: GameState, lot: ResLot): number {
  let want = 0;
  // Le courtier rachète pour revendre, tant que l'entrepôt n'est pas trop plein (v1.1).
  if (s.policy.courtierRachat && onDuty(s, 'courtier') && !RESOURCES[lot.res].rare
    && resserreWeight(s) < P.comptoir.courtier.entrepotMax * resserreCapacity(s)) want = lot.qty;
  for (const r of s.policy.rachatRules) {
    if (r.res !== lot.res && r.res !== '*') continue;
    want = Math.max(want, r.maxStock - stockOfRes(s, lot.res));
  }
  return Math.min(lot.qty, Math.max(0, want));
}

function rachat(s: GameState, loot: ResLot[]): Money {
  let paid = 0;
  for (const lot of loot) {
    const n = rachatWanted(s, lot);
    for (let i = 0; i < n; i++) {
      const unit: ResLot = { ...lot, qty: 1 };
      const price = Math.round(lotValue(s, unit) * s.policy.rachatCurseur);
      if (price > s.treasury - s.policy.reserve) break;
      if (resserreWeight(s) + RESOURCES[lot.res].poids > resserreCapacity(s)) break;
      spend(s, 'rachats', price);
      addLot(s.resserre, unit);
      lot.qty -= 1;
      paid += price;
    }
  }
  return paid;
}

// ---------- Retour de quête ----------

function success(run: QuestRun): boolean {
  const q = run.quest;
  if (run.outcome === 'echec') return false;
  switch (q.type) {
    case 'chasse': return run.kills >= (q.count ?? 1);
    case 'cueillette': return run.gathered >= (q.count ?? 1);
    case 'exploration': return run.roomsDone >= (q.rooms ?? 1);
    case 'protection': return run.nightsDone >= (q.nights ?? 1);
    case 'extermination': return run.kills > 0;
    default: return run.outcome === 'succes';
  }
}

export function processReturn(s: GameState, run: QuestRun): void {
  const team = run.members.map((id) => s.adventurers.find((a) => a.id === id)).filter((a): a is Adventurer => !!a);
  const q = run.quest;
  const ok = success(run);
  const guildFunded = q.clientType === 'guilde';

  // Récompense du client (taxable) et part payée par la guilde (non taxée, déjà déboursée)
  let clientPay = 0;
  let guildPay = 0;
  let refund = 0;
  if (q.type === 'extermination') {
    const due = run.kills * (q.perHead ?? 0);
    if (guildFunded) { guildPay = Math.min(due, q.reward); q.reward -= guildPay; } else clientPay = due;
    if (ok) guildPay += q.bonus;
  } else if (ok) {
    let r = q.reward;
    if (q.type === 'protection') r = Math.round(r * Math.max(0, 1 - 0.2 * run.losses));
    if (guildFunded) { guildPay = r + q.bonus; refund = q.reward - r; } else { clientPay = r; guildPay = q.bonus; }
  } else if (q.type === 'cueillette' && run.gathered >= (q.count ?? 1) / 2) {
    const r = Math.round(q.reward * run.gathered / (q.count ?? 1));
    if (guildFunded) { guildPay = r; refund = q.reward - r + q.bonus; } else { clientPay = r; refund = q.bonus; }
  } else {
    refund = q.bonus + (guildFunded ? q.reward : 0);
  }
  if (refund > 0) earn(s, 'primesRendues', refund);

  // Partage : parts égales, sauf chef indélicat (4.9)
  const shares = new Map<number, number>(team.map((m) => [m.id, 1]));
  const lead = team.find((m) => m.id === run.leader) ?? team[0];
  if (lead && team.length > 1 && (hasTrait(lead, 'malhonnete') || hasTrait(lead, 'radin')) && chance(s, 'ia', P.social.partageInjusteChance)) {
    shares.set(lead.id, 1.5);
    for (const m of team) if (m !== lead) { addRel(s, lead, m, -10); think(s, m, `${lead.name} s'est servi la part du lion.`); }
  }
  const totalShares = [...shares.values()].reduce((a, b) => a + b, 0);
  const share = (id: number, v: number) => Math.floor((v * (shares.get(id) ?? 1)) / totalShares);

  const lootTotal = run.loot.reduce((a, l) => a + lotValue(s, l), 0);
  let taxGold = 0;
  let natureOwed = 0;
  const gains = new Map<number, Money>();
  const excluded: Adventurer[] = [];
  for (const m of team) {
    const cShare = share(m.id, clientPay);
    const fShare = share(m.id, run.gold);
    const lShare = share(m.id, lootTotal);
    let hidden = 0;
    if (!taxExempt(s, m, false) && chance(s, 'ia', fraudChance(s, m))) hidden = range(s, 'ia', P.fraude.partMin, P.fraude.partMax) * (fShare + lShare);
    let tax = taxFor(s, m, cShare + fShare + lShare - hidden, false);
    if (hidden > 0 && chance(s, 'ia', detectionChance(s, m))) {
      const hiddenTax = Math.round(s.taxRate * hidden);
      tax += hiddenTax;
      if (sanction(s, m, hiddenTax) === 'exclu') excluded.push(m);
    }
    const goldAvail = cShare + fShare + share(m.id, guildPay);
    const fromGold = Math.min(tax, goldAvail);
    taxGold += fromGold;
    natureOwed += tax - fromGold;
    gains.set(m.id, goldAvail - fromGold);
  }
  earn(s, 'taxe', taxGold);

  // Taxe en nature, puis rachat par la guilde
  let natureTaken = 0;
  const lots = [...run.loot].sort((a, b) => lotValue(s, b) / b.qty - lotValue(s, a) / a.qty);
  for (const lot of lots) {
    while (natureOwed - natureTaken > 0 && lot.qty > 0) {
      const unit: ResLot = { ...lot, qty: 1 };
      natureTaken += lotValue(s, unit);
      storeOrSell(s, unit);
      lot.qty -= 1;
    }
  }
  run.loot = run.loot.filter((l) => l.qty > 0);
  const bought = rachat(s, run.loot);
  run.loot = run.loot.filter((l) => l.qty > 0);
  if (bought > 0 && s.policy.rachatCurseur < 0.9) for (const m of team) m.griefPrix += (0.9 - s.policy.rachatCurseur) * 20;

  // Le reste est vendu en ville par les aventuriers (frais 10 %)
  let sold = 0;
  for (const lot of run.loot) sold += sellInTown(s, lot, 'aventurier');

  const mentor = team.some((m) => hasTrait(m, 'mentor'));
  for (const m of team) {
    let g = (gains.get(m.id) ?? 0) + share(m.id, sold) + share(m.id, bought);
    if (m.debt > 0 && g > 0) {
      const repay = Math.min(m.debt, g);
      m.debt -= repay;
      g -= repay;
      earn(s, 'creditRembourse', repay);
    }
    m.gold += g; flow('quetes', (g));
    // Ajusté en v1.1 : les quêtes de haut rang, plus longues, forment davantage.
    const rangXp = (P.quetes.xpRangQuete as Record<string, number>)[q.rang] ?? 1;
    let xp = xpQuestType(m.level) * modRang(q, m) * rangXp * (ok ? 1 : P.quetes.xpEchec);
    if (mentor && m.level <= 3) xp *= 1.2;
    gainXp(s, m, xp);
    m.lastQuestTick = s.tick;
    m.runId = null;
    m.buffs = [];
    wear(s, m, run.combats);
    m.activity = sold > 0 ? { kind: 'vendre', until: s.tick + 1, place: 'ville' } : { kind: 'flaner', until: s.tick, place: 'comptoir' };
    if (ok) {
      m.history.questsOk += 1;
      m.respect = clamp(m.respect + (rangIndex(q.rang) <= 1 ? 2 : rangIndex(q.rang) <= 3 ? 3 : 5) * (hasTrait(m, 'honnete') ? 1.2 : 1), 0, 100);
      m.morale = clamp(m.morale + 8, 0, 100);
      if ((guildFunded || q.bonus > 0)) m.loyalty = clamp(m.loyalty + 3, 0, 100);
    } else {
      m.history.questsFail += 1;
      m.respect = clamp(m.respect - 3, 0, 100);
      m.morale = clamp(m.morale - 10, 0, 100);
    }
  }
  if (ok) s.stats.questsOk += 1; else s.stats.questsFail += 1;
  onQuestEnd(s, run, ok, team);
  onQuestTogether(s, team, ok);
  afterQuestTeam(s, run, team, ok);

  s.runs = s.runs.filter((r) => r !== run);
  if (q.type === 'extermination') {
    q.teams = q.teams.filter((id) => id !== run.id);
    if (guildFunded && q.reward <= 0) s.board = s.board.filter((x) => x.id !== q.id);
  } else {
    s.board = s.board.filter((x) => x.id !== q.id);
  }

  // Résumé au journal
  const t = run.members.length;
  const who = run.teamId !== null ? (s.teams.find((x) => x.id === run.teamId)?.name ?? "L'équipe") : t > 1 && lead ? `L'équipe de ${advLink(lead)}` : lead ? advLink(lead) : "L'équipe";
  const parts: string[] = [];
  if (clientPay + guildPay > 0) parts.push(`récompense ${money(clientPay + guildPay)}`);
  if (run.gold > 0) parts.push(`or trouvé ${money(run.gold)}`);
  if (lootTotal > 0) parts.push(`butin estimé ${money(lootTotal)}`);
  if (taxGold + natureTaken > 0) parts.push(`taxe ${money(taxGold + natureTaken)}${natureTaken > 0 ? ' (en partie en nature)' : ''}`);
  if (bought > 0) parts.push(`rachat par la guilde ${money(bought)}`);
  const head = ok ? `${who} revient de « ${q.title} » avec succès` : `${who} revient bredouille de « ${q.title} »`;
  run.log.push({ tick: s.tick, text: head });
  log(s, 'quetes', ok ? 'info' : 'important', `${head}${parts.length ? ' : ' + parts.join(', ') : ''}.`);
  if (lead) {
    think(s, lead, ok
      ? (q.type === 'extermination' ? `${run.kills} ${SPECIES[q.target!]?.pluriel ?? 'monstres'} de moins. Bon débarras.` : 'Mission accomplie.')
      : 'Rien ne s\'est passé comme prévu.');
  }
  for (const m of excluded) excludeAdventurer(s, m.id, true);
}

// ---------- Petits boulots en ville ----------

export function completeAide(s: GameState, a: Adventurer): void {
  const q = a.job;
  a.job = null;
  if (!q) return;
  const p = clamp(P.quetes.reussiteAide + (a.attrs[q.attr!] - 10) * 0.02, 0.5, 0.98);
  if (chance(s, 'quetes', p)) {
    const tax = taxFor(s, a, q.reward, true);
    earn(s, 'taxe', tax);
    let g = q.reward - tax;
    if (a.debt > 0) {
      const repay = Math.min(a.debt, Math.floor(g / 2));
      a.debt -= repay;
      g -= repay;
      earn(s, 'creditRembourse', repay);
    }
    a.gold += g; flow('boulots', (g));
    a.respect = clamp(a.respect + 3 * (hasTrait(a, 'honnete') ? 1.2 : 1), 0, 100);
    a.morale = clamp(a.morale + 2, 0, 100);
    gainXp(s, a, xpQuestType(a.level) * modRang(q, a) * 0.5);
    a.history.questsOk += 1;
    s.stats.questsOk += 1;
    log(s, 'quetes', 'detail', `${advLink(a)} a fini de ${q.title.toLowerCase()} : ${money(q.reward)}${tax ? ` (taxe ${money(tax)})` : ''}.`);
  } else {
    a.morale = clamp(a.morale - 5, 0, 100);
    a.respect = clamp(a.respect - 1, 0, 100);
    a.history.questsFail += 1;
    s.stats.questsFail += 1;
    think(s, a, `J'ai raté mon boulot : ${q.title.toLowerCase()}. Pas payé.`);
  }
  a.lastQuestTick = s.tick;
}
