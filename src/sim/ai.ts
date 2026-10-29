// Décisions des aventuriers au siège (GDD 3.10) et achats de services (1.5 à 1.8, 1.3.5).
import { hasState, hasTrait, pvMax } from './adventurers';
import { worstGravity } from './ailments';
import { completeAide } from './comptoir';
import { BEDS, BUFFS, DISHES, DORM_LEVELS, P, RESOURCES } from './data';
import {
  applyPurchase, applyRefusal, bedPrice, bedRef, bedsAvailable, bedsUsed, bonesetterPrice, clamp, consumeDish,
  currentService, dishPrice, dishQuality, dishRef, dishServable, hasModule, innPrice, judge, seats, tavernOpen, tavernPrice,
  templePrice,
} from './economy';
import { hourOf, money } from './format';
import { tryForge, wantsForge } from './gear';
import { hospitalCare, tryInfirmary, careOption } from './infirmary';
import { earn, think, flow } from './journal';
import { modAdd, modMult, season, townSpend } from './mods';
import { bump } from './legend';
import { takeAide } from './quests';
import { chance, range, shuffle } from './rng';
import { completeTraining, slotAt, tryTrain } from './training';
import type { Adventurer, BedType, DishId, GameState, ServiceStats } from './types';

function stat(s: GameState, key: string): ServiceStats {
  return (s.stats.services[key] ??= { served: 0, revenue: 0, refusals: 0, toCompetitor: 0 });
}

const broke = (a: Adventurer) => a.gold < P.economie.coutVieJour * P.aventuriers.joursOrUrgence;
const daysSinceQuest = (st: GameState, a: Adventurer) => (st.tick - a.lastQuestTick) / 24;

// ---------- Besoins heure par heure (3.5) ----------

function needs(s: GameState, a: Adventurer): void {
  const k = a.activity.kind;
  if (k === 'hospitalise') { hospitalCare(s, a); return; }
  if (k === 'prison') return;   // nourri et logé par la garde
  const asleep = k === 'dormir' || k === 'auberge' || k === 'dehors';
  const pv = pvMax(a);
  a.hunger -= asleep ? P.aventuriers.faimSommeilH : P.aventuriers.faimEveilleH;
  if (asleep) {
    const restore = k === 'dormir' ? BEDS[a.activity.bed ?? 'paillasse'].energie
      : k === 'auberge' ? P.concurrents.auberge.energie : 40;
    // Nuits d'hiver et grand froid : les dortoirs sans cheminée récupèrent moins bien (5.2, 5.4.3).
    const cold = k === 'dormir' && !hasModule(s, 'cheminee') ? (season(s) === 3 ? P.monde.hiverEnergieNuit : 1) * modMult(s, 'energie_nuit') : 1;
    a.energy += (restore * cold) / 8;
    a.hp += pv * P.aventuriers.pvSommeilPctH / 100;
  } else {
    a.energy -= P.aventuriers.energieEveilleH * (hasState(a, 'maladie') ? 2 : 1);
    a.hp += pv * P.aventuriers.pvEveillePctH / 100;
  }
  if (a.hunger <= 0) { a.hp -= pv * 0.01; a.morale -= 1; }
  a.hunger = clamp(a.hunger, 0, 100);
  a.energy = clamp(a.energy, 0, 100);
  a.hp = clamp(a.hp, 1, pv);
  a.morale = clamp(a.morale, 0, 100);
}

// ---------- Dormir ----------

function trySleep(s: GameState, a: Adventurer, urgent: boolean): boolean {
  const h = hourOf(s.tick);
  const night = h >= 20 || h < 6;
  const unlocked = DORM_LEVELS[s.dortoirs.level - 1].lits;
  const options = (['suite', 'individuelle', 'commun', 'paillasse'] as BedType[])
    .filter((b) => unlocked.includes(b) && bedsAvailable(s, b) - bedsUsed(s, b) > 0)
    .map((b) => ({ b, price: bedPrice(s, b), ...judge(a, bedPrice(s, b), bedRef(s, b)) }));
  let acceptable = options.filter((o) => o.verdict !== 'refus' && o.price <= a.gold);
  if (a.fierte >= 60 && acceptable.some((o) => o.b === 'individuelle')) acceptable = acceptable.filter((o) => o.b === 'individuelle');
  else if (a.fierte >= 30 && acceptable.some((o) => o.b !== 'paillasse')) acceptable = acceptable.filter((o) => o.b !== 'paillasse');

  const share = hasTrait(a, 'depensier') ? 0.5 : hasTrait(a, 'radin') ? 0.1 : 0.25;
  const comfy = acceptable.find((o) => o.price <= a.gold * share);
  const cheapest = [...acceptable].sort((x, y) => x.price - y.price)[0];
  const choice = hasTrait(a, 'radin') ? cheapest : comfy ?? cheapest;

  if (choice) {
    a.gold -= choice.price; flow('lit', -(choice.price));
    earn(s, 'nuitees', choice.price);
    if (choice.b === 'suite') a.griefPrix = Math.max(0, a.griefPrix - 2);   // la suite apaise les griefs tarifaires (1.5.1)
    applyPurchase(s, a, choice.R);
    const st = stat(s, 'nuitees');
    st.served += 1;
    st.revenue += choice.price;
    const bed = BEDS[choice.b];
    const humiliated = choice.b === 'paillasse' && a.fierte >= 60;
    let moral = bed.moral * (humiliated ? 2 : 1) * (hasTrait(a, 'frugal') && bed.moral < 0 ? 0 : 1);
    if (hasModule(s, 'bains') && choice.b !== 'paillasse') moral += 5;
    if (hasModule(s, 'coffres') && a.fierte >= 30) moral += 3;
    a.morale = clamp(a.morale + moral, 0, 100);
    if (humiliated) a.fierte = clamp(a.fierte - 1, 0, 100);
    a.activity = { kind: 'dormir', until: s.tick + 8, place: 'dortoirs', bed: choice.b };
    if (humiliated && chance(s, 'ia', 0.3)) think(s, a, 'Une paillasse… Indigne de quelqu\'un de mon rang.');
    if (choice.verdict === 'affaire' && chance(s, 'ia', 0.15)) think(s, a, `${bed.nom} pour ${money(choice.price)} : une affaire !`);
    return true;
  }

  const refused = options.filter((o) => o.verdict === 'refus');
  if (refused.length > 0) {
    applyRefusal(s, a, Math.min(...refused.map((o) => o.R)));
    stat(s, 'nuitees').refusals += 1;
  }
  if (!urgent && !night) return false;
  const inn = innPrice(s);
  if (inn <= a.gold && a.gold - inn >= P.economie.coutVieJour * 0.5) {
    a.gold -= inn; flow('auberge', -(inn)); townSpend(s, inn);
    a.morale = clamp(a.morale + P.concurrents.auberge.moral, 0, 100);
    a.activity = { kind: 'auberge', until: s.tick + 8 + P.concurrents.auberge.trajet, place: 'ville' };
    stat(s, 'nuitees').toCompetitor += 1;
    if (refused.length) think(s, a, `${money(Math.min(...refused.map((o) => o.price)))} la nuit ici ? Je dors au Sanglier Borgne pour ${money(inn)}.`);
    else if (options.length === 0) think(s, a, 'Plus un lit de libre au siège. Direction le Sanglier Borgne.');
    return true;
  }
  a.morale = clamp(a.morale - 10, 0, 100);
  a.activity = { kind: 'dehors', until: s.tick + 8, place: 'dehors' };
  think(s, a, options.length === 0 ? 'Pas un lit de libre. Je dors dans la paille de l\'écurie.' : 'Pas de quoi me payer un lit. Je dors dehors.');
  return true;
}

// ---------- Manger ----------

function eatHere(s: GameState, a: Adventurer, dish: DishId, price: number, R: number, cold = false): void {
  const d = DISHES[dish];
  a.gold -= price; flow('repas', -(price));
  earn(s, 'repas', price);
  applyPurchase(s, a, R);
  const q = dishQuality(s, dish) - (cold ? 20 : 0);
  const { fresh, species } = consumeDish(s, dish);
  if (!cold) s.refectoire.portionsReady -= 1;
  a.hunger = clamp(a.hunger + d.faim, 0, 100);
  let moral = d.moral * (0.5 + q / 100);
  if (moral < 0 && hasTrait(a, 'frugal')) moral = 0;
  if (hasTrait(a, 'gourmand') && dish !== 'gruau') moral += dish === 'roti' ? 3 : 1;
  const cookTrait = s.staff.find((m) => m.role === 'cuisinier')?.trait;
  if (cookTrait === 'charmeur') moral += 2;
  if (cookTrait === 'grincheux') moral -= 2;
  a.morale = clamp(a.morale + moral, 0, 100);
  // Festin du Héros (1.6.2) : « Repu et confiant » pour la prochaine quête
  if (dish === 'festin') {
    bump(s, 'festins');
    if (!a.buffs.includes('repu')) a.buffs.push('repu');
  }
  if (dish === 'roti' && species) {
    const buff = RESOURCES[species]?.buff;
    if (buff && !a.buffs.includes(buff)) { a.buffs.push(buff); if (chance(s, 'ia', 0.3)) think(s, a, `Un rôti de ${RESOURCES[species].nom.toLowerCase().replace('viande de ', '').replace('chair de ', '')} ! ${BUFFS[buff]?.nom ?? ''} pour la prochaine quête.`); }
  }
  if (fresh < 0.2 && chance(s, 'ia', 0.15)) {
    a.morale = clamp(a.morale - 10, 0, 100);
    a.energy = clamp(a.energy - 20, 0, 100);
    think(s, a, 'Ce plat n\'était pas frais… J\'ai le ventre retourné.', 'info');
  }
  a.mealsToday += 1;
  a.activity = { kind: 'manger', until: s.tick + 1, place: 'refectoire', dish };
  const st = stat(s, 'repas');
  st.served += 1;
  st.revenue += price;
  if (!cold) { s.stats.window.served += 1; s.stats.window.revenue += price; }
}

function tryCompetitorMeal(s: GameState, a: Adventurer, why: string): boolean {
  const h = hourOf(s.tick);
  const c = P.concurrents.taverne;
  if (h < c.ouverture || h >= c.fermeture || modAdd(s, 'taverne:ferme') > 0) return false;   // fermée pendant une émeute (5.4.3)
  const price = tavernPrice(s);
  if (price > a.gold) return false;
  a.gold -= price; flow('taverne', -(price)); townSpend(s, price);
  a.hunger = clamp(a.hunger + c.faim, 0, 100);
  a.morale = clamp(a.morale + c.moral, 0, 100);
  a.activity = { kind: 'taverne', until: s.tick + 1 + c.trajet, place: 'ville' };
  stat(s, 'repas').toCompetitor += 1;
  if (why) think(s, a, why);
  return true;
}

function chooseDish(s: GameState, a: Adventurer, dishes: DishId[]) {
  const opts = dishes.map((d) => ({ d, price: dishPrice(s, d), ...judge(a, dishPrice(s, d), dishRef(s, d)) })).filter((o) => o.price <= a.gold);
  const ok = opts.filter((o) => o.verdict !== 'refus');
  if (ok.length === 0) return { choice: null, refused: opts.filter((o) => o.verdict === 'refus') };
  let choice = [...ok].sort((x, y) => x.price - y.price)[0];
  const best = [...ok].sort((x, y) => DISHES[y.d].faim + DISHES[y.d].moral - DISHES[x.d].faim - DISHES[x.d].moral)[0];
  const canTreat = best.price <= a.gold * (hasTrait(a, 'depensier') ? 0.4 : 0.2);
  if (!hasTrait(a, 'radin') && !hasTrait(a, 'frugal') && (hasTrait(a, 'gourmand') || a.hunger < 40 || canTreat)) {
    if (best.price <= a.gold * 0.4) choice = best;
  }
  return { choice, refused: [] as typeof opts };
}

function tryEat(s: GameState, a: Adventurer, urgent: boolean): boolean {
  const sv = currentService(s);
  const wasWaiting = a.activity.kind === 'attendre';
  if (sv && a.mealsToday < 3) {
    const dishes = s.refectoire.menu.filter((d) => DISHES[d].type === 'repas' && dishServable(s, d));
    if (dishes.length > 0) {
      const eating = s.adventurers.filter((x) => x.activity.kind === 'manger').length;
      if (eating >= seats(s) || s.refectoire.portionsReady <= 0) {
        if (!wasWaiting) {
          a.activity = { kind: 'attendre', until: s.tick + 1, place: 'refectoire' };
          s.stats.window.waited += 1;
          return true;
        }
        a.morale = clamp(a.morale - 5, 0, 100);
        return tryCompetitorMeal(s, a, 'Une heure d\'attente pour une écuelle ! Je vais manger à la Taverne du Pont.');
      }
      const { choice, refused } = chooseDish(s, a, dishes);
      if (choice) { eatHere(s, a, choice.d, choice.price, choice.R); return true; }
      if (refused.length) {
        applyRefusal(s, a, Math.min(...refused.map((o) => o.R)));
        stat(s, 'repas').refusals += 1;
        return tryCompetitorMeal(s, a, `${money(Math.min(...refused.map((o) => o.price)))} l'écuelle, c'est du vol. Je vais à la Taverne du Pont.`);
      }
    }
  }
  // Comptoir de casse-croûte : plats froids hors des services (1.6.8)
  if (!sv && hasModule(s, 'cassecroute') && (urgent || a.hunger < 35)) {
    const dishes = s.refectoire.menu.filter((d) => DISHES[d].type === 'repas' && d !== 'roti' && dishServable(s, d));
    const { choice } = chooseDish(s, a, dishes);
    if (choice) { eatHere(s, a, choice.d, choice.price, choice.R, true); return true; }
  }
  if (urgent) return tryCompetitorMeal(s, a, sv ? 'Plus rien à manger au réfectoire. Je file à la Taverne du Pont.' : 'Le réfectoire est fermé, et j\'ai l\'estomac dans les talons.');
  return false;
}

// ---------- Boire ----------

function tryDrink(s: GameState, a: Adventurer): boolean {
  if (!tavernOpen(s)) return false;
  const wine = dishServable(s, 'vin') && (a.fierte >= 50 || hasTrait(a, 'depensier')) && a.gold > 10 * P.economie.coutVieJour;
  const dish: DishId = wine ? 'vin' : 'biere';
  if (!dishServable(s, dish)) return false;
  const price = dishPrice(s, dish);
  if (price > a.gold || a.gold < P.economie.coutVieJour) return false;
  const { verdict, R } = judge(a, price, dishRef(s, dish));
  if (verdict === 'refus') { applyRefusal(s, a, R); stat(s, 'boissons').refusals += 1; return false; }
  a.gold -= price; flow('boisson', -(price));
  earn(s, 'boissons', price);
  applyPurchase(s, a, R);
  consumeDish(s, dish);
  a.drinksToday += 1;
  a.morale = clamp(a.morale + DISHES[dish].moral, 0, 100);
  a.activity = { kind: 'boire', until: s.tick + 1, place: 'refectoire', dish };
  const st = stat(s, 'boissons');
  st.served += 1;
  st.revenue += price;
  if (a.drinksToday === 4 && chance(s, 'ia', 0.5)) think(s, a, 'Encore une chope ! … Ou deux.');
  return true;
}

// ---------- Se soigner ----------

function tryTownHealer(s: GameState, a: Adventurer): boolean {
  const pv = pvMax(a);
  const temple = templePrice(s, a);
  // Pendant une épidémie, le Temple est débordé (5.7).
  if (temple <= a.gold && modAdd(s, 'temple:ferme') === 0) {
    a.gold -= temple; flow('temple', -(temple)); townSpend(s, temple);
    a.states = [];
    a.hp = pvMax(a);
    a.activity = { kind: 'soin', until: s.tick + 2, place: 'ville' };
    think(s, a, s.infirmerie.level ? `Le Temple m'a remis sur pied pour ${money(temple)}.` : `Le Temple m'a remis sur pied pour ${money(temple)}. Une infirmerie à la guilde, ce serait bien.`);
    return true;
  }
  const bone = bonesetterPrice(s);
  if (bone <= a.gold && worstGravity(a) <= 1) {
    a.gold -= bone; flow('rebouteux', -(bone)); townSpend(s, bone);
    a.hp = Math.min(pv, a.hp + pv * 0.5);
    if (chance(s, 'ia', P.concurrents.rebouteux.risque)) {
      for (const st of a.states) st.gravite = Math.min(2, st.gravite + 1);
      a.morale = clamp(a.morale - 5, 0, 100);
      think(s, a, 'Ce rebouteux est un boucher. J\'ai plus mal qu\'avant.');
    } else {
      a.states = a.states.filter((st) => st.gravite > 0);
      think(s, a, 'Le rebouteux a fait ce qu\'il a pu.');
    }
    a.activity = { kind: 'soin', until: s.tick + 2, place: 'ville' };
    return true;
  }
  return false;
}

function tryHeal(s: GameState, a: Adventurer, urgent: boolean): boolean {
  if (tryInfirmary(s, a, urgent)) return true;
  // L'infirmerie ne sait pas faire, ou c'est trop cher : la ville
  if (urgent || worstGravity(a) >= 1 || a.hp < pvMax(a) * 0.3) return tryTownHealer(s, a);
  return false;
}

// ---------- Décision (3.10) ----------

function flaner(s: GameState, a: Adventurer): boolean {
  a.activity = { kind: 'flaner', until: s.tick + 1, place: chance(s, 'ia', 0.3) ? 'refectoire' : 'hall' };
  return true;
}

function questDrive(s: GameState, a: Adventurer): number {
  const need = clamp((a.fortuneGoal - a.gold) / a.fortuneGoal, 0, 1) * 0.5;
  let d = need + 0.1 * daysSinceQuest(s, a);
  if (hasTrait(a, 'ambitieux')) d += 0.2;
  if (hasTrait(a, 'paresseux')) d -= 0.15;
  return d;
}

function decide(s: GameState, a: Adventurer): void {
  const h = hourOf(s.tick);
  const pv = pvMax(a);
  const worst = worstGravity(a);

  // Couche 1 : les urgences
  if (worst >= 2 || a.hp < pv * P.aventuriers.seuilUrgenceSante) {
    if (tryHeal(s, a, true)) return;
  }
  if (worst >= 1 && tryHeal(s, a, false)) return;
  if (a.hunger < P.aventuriers.seuilUrgenceFaim && tryEat(s, a, true)) return;
  if (a.energy < P.aventuriers.seuilUrgenceEnergie && trySleep(s, a, true)) return;
  if (broke(a) && a.runId === null && a.job === null) {
    if (h >= 7 && h <= 15 && takeAide(s, a)) return;
    a.lookingForQuest = true;
  }
  if (a.runId === null && a.job === null && a.hp >= pv * 0.5 && a.mourningUntil <= s.tick && questDrive(s, a) >= 0.3) a.lookingForQuest = true;

  // Couche 2 : les scores d'utilité
  const night = h >= 21 || h < 5;
  const reserved = a.runId !== null;
  const noise = () => 1 + range(s, 'ia', -P.aventuriers.aleaScores, P.aventuriers.aleaScores);
  const opts: { score: number; run: () => boolean }[] = [];

  if (currentService(s) || hasModule(s, 'cassecroute')) {
    let sc = (70 - a.hunger) / 50;
    if (hasTrait(a, 'gourmand')) sc *= 1.5;
    if (reserved && h === 6) sc += 0.6;
    opts.push({ score: sc, run: () => tryEat(s, a, false) });
  }
  {
    let sc = (60 - a.energy) / 45 + (night ? 0.6 : 0) + (reserved && h >= 20 ? 0.3 : 0);
    if (hasTrait(a, 'paresseux')) sc *= 1.3;
    if (night && a.energy < 90) sc = Math.max(sc, 0.7);
    opts.push({ score: sc, run: () => trySleep(s, a, false) });
  }
  if (tavernOpen(s) && a.drinksToday < 5) {
    let sc = 0.35 - 0.12 * a.drinksToday;
    if (hasTrait(a, 'sociable')) sc *= 1.5;
    if (hasTrait(a, 'ivrogne')) sc = sc * 2 + 0.2;
    opts.push({ score: sc, run: () => tryDrink(s, a) });
  }
  if ((slotAt(h) || slotAt(h - 1)) && s.terrain.level > 0 && !night) {
    let sc = 0.45 * (a.energy / 100) + 0.05 * Math.min(3, daysSinceQuest(s, a));
    if (hasTrait(a, 'ambitieux')) sc *= 1.5;
    if (hasTrait(a, 'paresseux')) sc *= 0.5;
    if (reserved) sc *= 0.5;
    opts.push({ score: sc, run: () => tryTrain(s, a) });
  }
  if (h >= 7 && h <= 15 && !reserved && a.job === null) {
    let sc = clamp((a.fortuneGoal - a.gold) / a.fortuneGoal, 0, 1) * 0.45 + 0.08 * daysSinceQuest(s, a);
    if (hasTrait(a, 'paresseux')) sc *= 0.6;
    if (hasTrait(a, 'ambitieux')) sc *= 1.2;
    if (a.level >= 6) sc *= 0.5;
    opts.push({ score: sc, run: () => takeAide(s, a) });
  }
  if (h >= 8 && h <= 17 && wantsForge(s, a)) {
    opts.push({ score: 0.5 * (hasTrait(a, 'coquet') ? 1.5 : 1), run: () => tryForge(s, a) });
  }
  if (a.hp < pv * 0.6 || a.states.length > 0) {
    let sc = 1 - a.hp / pv + (a.states.length ? 0.3 : 0);
    if (hasTrait(a, 'prudent')) sc *= 1.3;
    if (careOption(s, a)) sc += 0.2;
    opts.push({ score: sc, run: () => tryHeal(s, a, false) });
  }
  opts.push({ score: 0.15, run: () => flaner(s, a) });

  for (const o of opts) o.score *= noise();
  opts.sort((x, y) => y.score - x.score);
  for (const o of opts) {
    if (o.score < 0.05) break;
    if (o.run()) return;
  }
  flaner(s, a);
}

function finishActivity(s: GameState, a: Adventurer): void {
  const k = a.activity.kind;
  if (k === 'aide') completeAide(s, a);
  if (k === 'entrainement') completeTraining(s, a);
  if (k === 'attendre') tryEat(s, a, a.hunger < 40);
}

export function stepAdventurers(s: GameState): void {
  const here = shuffle(s, 'ia', s.adventurers.filter((a) => a.activity.kind !== 'quete'));
  for (const a of here) {
    needs(s, a);
    if (a.activity.until <= s.tick) {
      const before = a.activity;
      finishActivity(s, a);
      if (a.activity === before || a.activity.until <= s.tick) decide(s, a);
    }
  }
}
