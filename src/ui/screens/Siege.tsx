// Écran du Siège : vue en coupe et panneaux des salles (GDD 7.5.1).
import { useState } from 'preact/hooks';
import {
  BEDS, DENREES, DISHES, DORM_LEVELS, ETATS, INF_LEVELS, KITCHEN_LEVELS, MESS_LEVELS, MODULES, P, PROFS, RECIPES, REMEDES, RESOURCES, SLOTS,
  TERRAIN_LEVELS, ZONES, isPlant,
} from '../../sim/data';
import {
  bedDayPrice, bedPrice, bedRef, bedsAvailable, bedsUsed, careRef, carePrice, chefSkill, currentService, dishPrice, dishQuality,
  dishRef, dishUnlocked, dormQuality, foodUnitPrice, infBeds, infQuality, innPrice, kitchenRate, menuSize, orderCost, pantryCapacity,
  pantryTotal, pendingOf, remedyBuyPrice, salePrice, saleRef, seats, sessionPrice, sessionRef, stockOf, tavernPrice,
  terrainQuality,
} from '../../sim/economy';
import { money, stamp } from '../../sim/format';
import { apothecaryActive, hospitalized, recipeAvailable, recipeEconomics } from '../../sim/infirmary';
import { stockOfRes } from '../../sim/market';
import { dormPlacesUsed, moduleBuyable, ROOM_NAMES, upgradeCost, upgradeLock } from '../../sim/rooms';
import { maxProfs, profSalary } from '../../sim/training';
import type { BedType, DenreeId, DishId, EtatId, GameState, RemedeId, RoomId, SlotId } from '../../sim/types';
import { ACTIVITY_LABELS, GaugeRow, Gauge, Kpi, Money, NumField, PriceInput, Tabs, useNav } from '../components';
import { game, lastError } from '../store';
import { BuildingCanvas, type RoomHit } from './BuildingCanvas';
import { MorningReport } from '../Morning';

const LEVELS: Record<RoomId, { niveau: number; cout: number }[]> = {
  dortoirs: DORM_LEVELS, refectoire: MESS_LEVELS, cuisine: KITCHEN_LEVELS, infirmerie: INF_LEVELS, terrain: TERRAIN_LEVELS,
};
const NEXT_TEXT: Record<RoomId, string[]> = {
  dortoirs: ['', '24 places, dortoir commun', '40 places, chambres individuelles', '60 places, suites', '80 places, qualité de base +10'],
  refectoire: ['', '16 places, soirées de taverne (avec les boissons de la cuisine)', '24 places, meilleure ambiance', '32 places, meilleure ambiance', '40 places, meilleure ambiance'],
  cuisine: ['', '3 plats au menu, bière et paniers de route, garde-manger de 200', '4 plats, rôti de monstre, garde-manger de 350', '5 plats, Festin du Héros, garde-manger de 500', '6 plats, cuisine renommée (gourmets de passage), garde-manger de 700'],
  infirmerie: ['3 lits : plaies, maladies, poisons légers', '6 lits : fractures, brûlures, vente de potions', '10 lits : apothicairerie, malédictions légères', '14 lits : soins critiques, chirurgien (séquelles −75 %)', '20 lits : sanctuaire, une eau bénite par jour'],
  terrain: ["1 professeur (Maître d'armes), entraînement libre", '2 professeurs, Archimage', '3 professeurs, Stratège', '4 professeurs, Maître-chasseur, salle de duel', '5 professeurs, Aumônier, Arène'],
};

function Upgrade({ s, room }: { s: GameState; room: RoomId }) {
  const r = s[room];
  const cost = upgradeCost(s, room);
  const next = LEVELS[room][r.level];
  if (r.works) return <p>Travaux en cours vers le niveau {r.works.targetLevel}, fin prévue {stamp(r.works.endTick)}.{r.level > 0 && ' Capacité réduite de moitié en attendant.'}</p>;
  const lock = upgradeLock(s, room);
  if (next && lock) return <p class="soft">Niveau {next.niveau} : {NEXT_TEXT[room][r.level]}. <strong>{lock}</strong> (voir la Charte).</p>;
  if (!next || cost === null) return <p class="soft">Niveau maximum atteint.</p>;
  return (
    <div class="row">
      <div>
        <strong>{r.level === 0 ? `Construire ${ROOM_NAMES[room]}` : `Passer au niveau ${next.niveau}`}</strong> : {NEXT_TEXT[room][r.level]}.
        <div class="hint">{money(cost)} · {next.niveau} jour{next.niveau > 1 ? 's' : ''} de travaux{r.level > 0 ? ', capacité réduite de moitié pendant ce temps' : ''}.
          {cost > s.treasury && <> <span class="tag seal">il manque {money(cost - s.treasury)}</span></>}</div>
      </div>
      <span class="spacer" />
      <button class="btn seal" disabled={cost > s.treasury} onClick={() => game.command({ type: 'upgradeRoom', room })}>{r.level === 0 ? 'Construire' : 'Lancer les travaux'}</button>
    </div>
  );
}

function Modules({ s, room }: { s: GameState; room: RoomId | 'siege' }) {
  const list = Object.entries(MODULES).filter(([, m]) => m.salle === room);
  return (
    <div style={{ marginTop: 12 }}>
      <h4>Aménagements</h4>
      {list.map(([id, m]) => {
        const owned = s.modules.includes(id);
        const why = owned ? null : moduleBuyable(s, id);
        return (
          <div class="row" style={{ padding: '4px 0', borderBottom: '1px solid var(--line-soft)' }}>
            <span style={{ minWidth: 180 }}><strong>{m.nom}</strong></span>
            <small class="soft" style={{ flex: 1 }}>{m.effet}</small>
            {owned ? <span class="tag sage">installé</span>
              : <button class="btn small" disabled={!!why} title={why ?? ''} onClick={() => game.command({ type: 'buyModule', id })}>{money(m.cout)}</button>}
          </div>
        );
      })}
    </div>
  );
}

function Works({ s, room }: { s: GameState; room: RoomId }) {
  return <><Upgrade s={s} room={room} />{s[room].level > 0 && <Modules s={s} room={room} />}</>;
}

/** La qualité en un mot, pour lire le chiffre d'un coup d'œil. */
const qualityWord = (q: number) => (q >= 80 ? 'excellente' : q >= 60 ? 'bonne' : q >= 40 ? 'correcte' : 'médiocre');

// ---------- Dortoirs ----------

function DormPanel({ s }: { s: GameState }) {
  const [tab, setTab] = useState<'apercu' | 'tarifs' | 'lits' | 'travaux'>('apercu');
  const d = s.dortoirs;
  const lvl = DORM_LEVELS[d.level - 1];
  const st = s.stats.services.nuitees;
  const [draft, setDraft] = useState<Record<BedType, number> | null>(null);
  const beds = draft ?? d.pendingBeds ?? d.beds;
  const used = dormPlacesUsed(beds);
  const changed = (Object.keys(beds) as BedType[]).reduce((a, b) => a + Math.abs(beds[b] - (d.pendingBeds ?? d.beds)[b]) * BEDS[b].places, 0);
  const valets = s.staff.filter((m) => m.role === 'valet').length;
  return (
    <div class="panel">
      <h3>Dortoirs — niveau {d.level}</h3>
      <Tabs value={tab} onChange={setTab} tabs={[['apercu', 'Aperçu'], ['tarifs', 'Tarifs'], ['lits', 'Répartition des lits'], ['travaux', 'Travaux et aménagements']]} />
      {tab === 'apercu' && (
        <>
          <div class="kpis">
            <Kpi k="Confort" v={Math.round(dormQuality(s))} title="Ce que les aventuriers pensent de tes dortoirs : niveau, aménagements et propreté (30 + 8 par niveau + aménagements + (propreté − 50) / 2). Plus il est haut, plus ils récupèrent et paient volontiers." hint={qualityWord(dormQuality(s))} />
            <Kpi k="Nuitées aujourd'hui" v={st?.served ?? 0} />
            <Kpi k="Recette du jour" v={<Money v={st?.revenue ?? 0} />} />
            <Kpi k="Refus pour prix" v={st?.refusals ?? 0} title="Aventuriers qui ont trouvé ton prix trop cher aujourd'hui." />
            <Kpi k="Dorment ailleurs" v={st?.toCompetitor ?? 0} title="Aventuriers partis dormir au Sanglier Borgne (trop cher chez toi, ou plus de lit)." />
          </div>
          <GaugeRow label="Propreté" value={d.proprete} />
          <p class="hint">{valets} valet{valets > 1 ? 's' : ''} pour {used} places (un valet entretient {P.personnel.placesParValet} places).</p>
          <table class="data">
            <thead><tr><th>Lit</th><th class="num">Occupés</th><th class="num" title="Lits utilisables cette nuit (moitié moins pendant les travaux ou après des dégâts)">En service</th><th class="num">Prix</th></tr></thead>
            <tbody>{lvl.lits.map((b) => <tr><td>{BEDS[b].nom}</td><td class="num">{bedsUsed(s, b)}</td><td class="num">{bedsAvailable(s, b)}</td><td class="num">{money(bedPrice(s, b))}</td></tr>)}</tbody>
          </table>
        </>
      )}
      {tab === 'tarifs' && (
        <>
          <p class="hint">Tu fixes le prix de chaque lit. Chaque aventurier le compare à ce que vaut le lit à ses yeux (meilleur dortoir, meilleure valeur) : trop cher pour sa bourse, il refuse et part au Sanglier Borgne. Un débutant fauché tolère peu de dépassement, un aventurier aisé beaucoup plus.</p>
          {lvl.lits.map((b) => (
            <PriceInput key={b} label={BEDS[b].nom} sub={`énergie ${BEDS[b].energie} %, moral ${BEDS[b].moral > 0 ? '+' : ''}${BEDS[b].moral}`}
              price={bedPrice(s, b)} refPrice={bedRef(s, b)} competitor={innPrice(s)} refusals={st?.refusals}
              onCommit={(v) => game.command({ type: 'setBedPrix', bed: b, price: v })} />
          ))}
        </>
      )}
      {tab === 'lits' && (
        <>
          <p class="hint">Les lits confortables prennent plus de place : c'est l'arbitrage entre capacité et confort. Effet demain à 06h, {money(P.tarifs.reconfigParPlace)} par place modifiée.</p>
          {lvl.lits.map((b) => (
            <div class="row" style={{ padding: '6px 0' }}>
              <span style={{ minWidth: 170 }}>{BEDS[b].nom} <small>({BEDS[b].places} place{BEDS[b].places > 1 ? 's' : ''})</small></span>
              <button class="btn ghost small" aria-label={`Retirer un lit : ${BEDS[b].nom}`} onClick={() => setDraft({ ...beds, [b]: Math.max(0, beds[b] - 1) })}>−</button>
              <strong style={{ minWidth: 28, textAlign: 'center' }}>{beds[b]}</strong>
              <button class="btn ghost small" aria-label={`Ajouter un lit : ${BEDS[b].nom}`} disabled={used + BEDS[b].places > lvl.places} onClick={() => setDraft({ ...beds, [b]: beds[b] + 1 })}>+</button>
            </div>
          ))}
          <p>Places utilisées : <strong>{used}</strong> / {lvl.places}</p>
          <div class="row">
            <button class="btn" disabled={!draft || changed === 0 || changed * P.tarifs.reconfigParPlace > s.treasury}
              onClick={() => { game.command({ type: 'setBeds', beds }); setDraft(null); }}>Réaménager ({money(changed * P.tarifs.reconfigParPlace)})</button>
            {draft && <button class="btn ghost" onClick={() => setDraft(null)}>Annuler</button>}
            {d.pendingBeds && !draft && <span class="tag amber">Réaménagement prévu demain à 06h</span>}
          </div>
        </>
      )}
      {tab === 'travaux' && <Works s={s} room="dortoirs" />}
    </div>
  );
}

// ---------- Réfectoire ----------

function MessPanel({ s, openKitchen }: { s: GameState; openKitchen: () => void }) {
  const [tab, setTab] = useState<'apercu' | 'travaux'>('apercu');
  const r = s.refectoire;
  const sv = currentService(s);
  const st = s.stats.services.repas;
  return (
    <div class="panel">
      <h3>Réfectoire — niveau {r.level}</h3>
      <Tabs value={tab} onChange={setTab} tabs={[['apercu', 'Aperçu'], ['travaux', 'Travaux et aménagements']]} />
      {tab === 'apercu' && (
        <>
          <div class="kpis">
            <Kpi k="Service" v={sv ? sv.nom : 'fermé'} />
            <Kpi k="Places" v={seats(s)} title="Nombre d'aventuriers qui peuvent manger en même temps. Agrandis le réfectoire pour en avoir plus." />
            <Kpi k="Repas aujourd'hui" v={st?.served ?? 0} />
            <Kpi k="Recette du jour" v={<Money v={(st?.revenue ?? 0) + (s.stats.services.boissons?.revenue ?? 0)} />} />
            <Kpi k="Mangent ailleurs" v={st?.toCompetitor ?? 0} title="Aventuriers partis manger à la Taverne du Pont : trop cher, plus de place ou rupture au garde-manger." />
          </div>
          {r.damage > 0 && (
            <div class="row" style={{ marginBottom: 8 }}>
              <span class="tag seal">Mobilier cassé : qualité −{r.damage}</span>
              <button class="btn small" onClick={() => game.command({ type: 'repairFurniture' })}>Réparer ({money(Math.ceil(r.damage / 5) * 1000)})</button>
            </div>
          )}
          <p class="hint">Services : petit-déjeuner 06h–09h, déjeuner 11h–14h, dîner 18h–21h{r.level >= 2 ? ', taverne 18h–22h (boissons de la cuisine)' : ''}.
            Le réfectoire fixe le nombre de places et l'ambiance ; le menu, les prix et les provisions se règlent à la cuisine.</p>
          <p><button class="btn" onClick={openKitchen}>Ouvrir la cuisine (menu, prix, garde-manger)</button></p>
        </>
      )}
      {tab === 'travaux' && <Works s={s} room="refectoire" />}
    </div>
  );
}

// ---------- Cuisine ----------

function KitchenPanel({ s }: { s: GameState }) {
  const [tab, setTab] = useState<'apercu' | 'menu' | 'stock' | 'travaux'>('apercu');
  const r = s.refectoire;
  const k = s.cuisine;
  const allDishes = Object.keys(DISHES) as DishId[];
  const mealsOnMenu = r.menu.filter((d) => DISHES[d].type === 'repas' && dishUnlocked(s, d)).length;
  const [qty, setQty] = useState<Partial<Record<DenreeId, number>>>({});
  const denrees = (Object.keys(DENREES) as DenreeId[]).filter((d) => !DENREES[d].interne);
  const cooks = s.staff.filter((m) => m.role === 'cuisinier' || m.role === 'commis');
  const sub = (d: DishId) => DISHES[d].type === 'repas' ? `faim +${DISHES[d].faim}, moral ${DISHES[d].moral > 0 ? '+' : ''}${DISHES[d].moral}`
    : DISHES[d].type === 'boisson' ? `servie le soir à la taverne, moral +${DISHES[d].moral}` : 'acheté par les aventuriers au départ en quête';
  return (
    <div class="panel">
      <h3>Cuisine — niveau {k.level}</h3>
      <Tabs value={tab} onChange={setTab} tabs={[['apercu', 'Aperçu'], ['menu', 'Menu et prix'], ['stock', 'Garde-manger'], ['travaux', 'Travaux et aménagements']]} />
      {tab === 'apercu' && (
        <>
          <div class="kpis">
            <Kpi k="Production" v={`${kitchenRate(s)} portions/h`} title="Portions préparées chaque heure : 6 + compétence / 10 par cuisinier, +4 par commis. Moitié moins pendant les travaux." />
            <Kpi k="Portions prêtes" v={r.portionsReady} />
            <Kpi k="Meilleur cuisinier" v={chefSkill(s)} title="Sa compétence fait la qualité des plats et débloque les plus fins (ragoût 20, rôti 40, festin 65)." />
            <Kpi k="Plats au menu" v={`${mealsOnMenu} / ${menuSize(s)}`} />
            <Kpi k="Garde-manger" v={`${pantryTotal(s)} / ${pantryCapacity(s)}`} />
          </div>
          <p class="hint">{cooks.length} employé{cooks.length > 1 ? 's' : ''} en cuisine (cuisiniers et commis s'engagent dans l'écran Personnel).</p>
          <table class="data">
            <thead><tr><th>Plat</th><th class="num">Qualité</th><th class="num">Prix</th><th>État</th></tr></thead>
            <tbody>
              {r.menu.filter((d) => dishUnlocked(s, d)).map((d) => (
                <tr><td>{DISHES[d].nom}</td><td class="num">{Math.round(dishQuality(s, d))}</td><td class="num">{money(dishPrice(s, d))}</td>
                  <td>{DISHES[d].cMin > chefSkill(s) ? <span class="tag seal">cuisinier trop peu compétent (min. {DISHES[d].cMin})</span>
                    : Object.entries(DISHES[d].ingredients).some(([kk, q]) => stockOf(s, kk as DenreeId) < (q ?? 0))
                      ? <span class="tag seal">{d === 'roti' ? "pas de viande de monstre à l'entrepôt" : 'ingrédients manquants'}</span>
                      : <span class="tag sage">disponible</span>}</td></tr>
              ))}
            </tbody>
          </table>
          {k.level >= 3 && <p class="hint">Le rôti utilise la viande de monstre de l'entrepôt : règle le rachat des viandes au comptoir pour l'approvisionner. Chaque espèce donne un bonus pour la quête suivante.</p>}
        </>
      )}
      {tab === 'menu' && (
        <>
          <p class="hint">Au plus {menuSize(s)} repas au menu à ce niveau ; les boissons et les paniers de route ne comptent pas. Tu fixes le prix de chaque plat : les aventuriers le comparent à sa qualité et au prix de la Taverne du Pont.</p>
          {allDishes.map((d) => {
            const unlocked = dishUnlocked(s, d);
            const on = r.menu.includes(d);
            if (!unlocked) {
              return (
                <div class="row soft" style={{ padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}>
                  <span>🔒 {DISHES[d].nom}</span><span class="spacer" />
                  <small>{DISHES[d].module && DISHES[d].niveau <= k.level ? `aménagement « ${MODULES[DISHES[d].module!].nom} »` : `cuisine niveau ${DISHES[d].niveau}`}</small>
                </div>
              );
            }
            const blocked = !on && DISHES[d].type === 'repas' && mealsOnMenu >= menuSize(s);
            return (
              <div class="menu-item">
                <label class="row" title={blocked ? 'Menu complet : retire un plat ou agrandis la cuisine.' : ''}>
                  <input type="checkbox" checked={on} disabled={blocked} onChange={() => game.command({ type: 'setMenu', menu: on ? r.menu.filter((x) => x !== d) : [...r.menu, d] })} />
                  <small class="soft">{on ? 'au menu' : 'hors menu'} · {Object.entries(DISHES[d].ingredients).map(([kk, q]) => `${q} ${DENREES[kk as DenreeId].nom.toLowerCase()}`).join(', ')}</small>
                </label>
                <PriceInput label={DISHES[d].nom} sub={sub(d)} price={dishPrice(s, d)} refPrice={dishRef(s, d)}
                  competitor={DISHES[d].type === 'repas' ? tavernPrice(s) : undefined} refusals={DISHES[d].type === 'repas' ? s.stats.services.repas?.refusals : undefined}
                  onCommit={(v) => game.command({ type: 'setDishPrix', dish: d, price: v })} />
              </div>
            );
          })}
        </>
      )}
      {tab === 'stock' && (
        <>
          <p>Garde-manger : <strong>{pantryTotal(s)}</strong> / {pantryCapacity(s)} portions{pendingOf(s) ? `, ${pendingOf(s)} en commande` : ''}. Livraison le lendemain à 06h pour toute commande passée avant 18h.</p>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>Denrée</th><th class="num">Stock</th><th class="num" title="Portions consommées hier par les repas servis">Mangé hier</th><th>Fraîcheur</th><th class="num">Commandé</th><th>Commander</th><th>Réapprovisionnement automatique</th></tr></thead>
              <tbody>
                {[...denrees, 'monstre' as DenreeId].map((den) => {
                  const lots = r.pantry.filter((l) => l.denree === den);
                  const fresh = lots.length ? Math.min(...lots.map((l) => l.fresh)) : 1;
                  const ate = r.eatenYesterday?.[den] ?? 0;
                  const out = !!r.ranOutYesterday?.includes(den);
                  if (den === 'monstre') {
                    return <tr><td>Viande de monstre<div class="hint">Débitée depuis l'entrepôt</div></td><td class="num">{stockOf(s, den)}</td><td class="num">{ate || ''}</td>
                      <td>{lots.length ? <Gauge value={fresh * 100} /> : <span class="hint">—</span>}</td><td /><td /><td /></tr>;
                  }
                  const rule = s.restock[den];
                  const q = qty[den] ?? 30;
                  return (
                    <tr>
                      <td>{DENREES[den].nom}<div class="hint">{foodUnitPrice(s, den).toFixed(1).replace('.', ',')} pc / portion · {DENREES[den].conservation} j</div></td>
                      <td class="num">{stockOf(s, den)}</td>
                      <td class="num">{ate || ''}{out && <> <span class="tag seal" title="Le stock est tombé à zéro hier : les aventuriers suivants ont mangé ailleurs.">rupture</span></>}</td>
                      <td style={{ minWidth: 70 }}>{lots.length ? <Gauge value={fresh * 100} /> : <span class="hint">—</span>}</td>
                      <td class="num">{pendingOf(s, den) || ''}</td>
                      <td><div class="row" style={{ flexWrap: 'nowrap' }}>
                        <NumField min={1} max={500} value={q} width={60} label={`Quantité de ${DENREES[den].nom}`} live onCommit={(v) => setQty({ ...qty, [den]: v })} />
                        <button class="btn small" disabled={orderCost(s, den, q) > s.treasury} onClick={() => game.command({ type: 'orderFood', denree: den, qty: q })}>{money(orderCost(s, den, q))}</button>
                      </div></td>
                      <td><div class="row" style={{ flexWrap: 'nowrap' }}>
                        <input type="checkbox" checked={rule.enabled} aria-label="Activer" onChange={() => game.command({ type: 'setRestock', denree: den, rule: { ...rule, enabled: !rule.enabled } })} />
                        <small>si &lt;</small>
                        <NumField min={0} value={rule.seuil} width={50} label="Seuil" onCommit={(v) => game.command({ type: 'setRestock', denree: den, rule: { ...rule, seuil: v } })} />
                        <small>→</small>
                        <NumField min={1} value={rule.qty} width={50} label="Quantité" onCommit={(v) => game.command({ type: 'setRestock', denree: den, rule: { ...rule, qty: v } })} />
                        {rule.enabled && (out || ate > rule.seuil + rule.qty) && (
                          <span class="tag amber" title={out ? 'Rupture hier malgré ce réglage. Monte le seuil ou la quantité.'
                            : `Hier, ${ate} portions ont été mangées : plus que ce réglage n'en garde en stock. Monte le seuil ou la quantité.`}>trop juste</span>
                        )}
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === 'travaux' && <Works s={s} room="cuisine" />}
    </div>
  );
}

// ---------- Infirmerie ----------

/** Herbes des recettes qui manquent : la guilde peut commander une cueillette (prime) en un clic (v1.1). */
function HerbOrders({ s }: { s: GameState }) {
  const plants = [...new Set(RECIPES.flatMap((r) => Object.keys(r.ingredients)).filter((k) => isPlant(k)))];
  const low = plants.filter((pl) => stockOfRes(s, pl) < 6);
  const err = lastError();
  if (!low.length) return <p class="hint" style={{ marginTop: 10 }}>Les herbes des recettes sont en stock.</p>;
  return (
    <>
      <h4 style={{ marginTop: 12 }}>Herbes à faire cueillir</h4>
      <p class="hint">Publie une cueillette au tableau (une prime : la somme est bloquée, rendue si personne ne la fait).</p>
      {low.map((pl) => {
        const zone = Object.keys(ZONES).find((z) => ZONES[z].plantes[pl] !== undefined);
        const count = 8;
        const budget = Math.max(50, Math.round((RESOURCES[pl].prix * count * 1.5) / 10) * 10);
        const pending = s.board.some((q) => q.type === 'cueillette' && q.target === pl && q.clientType === 'guilde');
        return (
          <div class="row" style={{ padding: '4px 0', borderBottom: '1px solid var(--line-soft)' }}>
            <span style={{ minWidth: 160 }}><strong>{RESOURCES[pl].nom}</strong> <small>en stock : {stockOfRes(s, pl)}</small></span>
            <small class="soft">{zone ? ZONES[zone].nom : ''}</small>
            <span class="spacer" />
            {pending ? <span class="tag sage">cueillette au tableau</span> : (
              <button class="btn small" disabled={!zone || budget > s.treasury}
                onClick={() => zone && game.command({ type: 'createPrime', questType: 'cueillette', zone, target: pl, count, reward: budget, days: 6 })}>
                Faire cueillir {count} ({money(budget)})
              </button>
            )}
          </div>
        );
      })}
      {err && <p class="hint" style={{ color: 'var(--seal)' }}>{err}</p>}
    </>
  );
}

function InfirmeriePanel({ s }: { s: GameState }) {
  const [tab, setTab] = useState<'apercu' | 'tarifs' | 'remedes' | 'apothicairerie' | 'credit' | 'travaux'>(s.infirmerie.level ? 'apercu' : 'travaux');
  const inf = s.infirmerie;
  const [qty, setQty] = useState(5);
  if (inf.level === 0 && !inf.works) {
    return <div class="panel"><h3>Infirmerie</h3><p>Sans infirmerie, les blessés vont au Temple (cher) ou chez le rebouteux (risqué), et les cas graves meurent faute de soins.</p><Upgrade s={s} room="infirmerie" /></div>;
  }
  const healers = s.staff.filter((m) => m.role === 'soigneur');
  const sick = s.adventurers.filter((a) => a.states.length > 0);
  const st = s.stats.services.soins;
  return (
    <div class="panel">
      <h3>Infirmerie — niveau {inf.level}</h3>
      <Tabs value={tab} onChange={setTab} tabs={[['apercu', 'Aperçu'], ['tarifs', 'Tarifs'], ['remedes', 'Remèdes'], ['apothicairerie', 'Apothicairerie'], ['credit', 'Soins à crédit'], ['travaux', 'Travaux et aménagements']]} />
      {tab === 'apercu' && (
        <>
          <div class="kpis">
            <Kpi k="Qualité des soins" v={Math.round(infQuality(s))} title="Ce que les aventuriers pensent de ton infirmerie : niveau et compétence des soigneurs (30 + 6 par niveau + 0,3 × compétence)." hint={qualityWord(infQuality(s))} />
            <Kpi k="Lits occupés" v={`${hospitalized(s)} / ${infBeds(s)}`} />
            <Kpi k="Soigneurs" v={healers.length} />
            <Kpi k="Soins aujourd'hui" v={st?.served ?? 0} />
            <Kpi k="Recette du jour" v={<Money v={(st?.revenue ?? 0) + (s.today.recettes.ventesInfirmerie ?? 0)} />} />
          </div>
          {healers.length === 0 && <p><span class="tag seal">Aucun soigneur</span> Engage un soigneur dans l'écran Personnel, sinon personne n'est soigné.</p>}
          <h4>Aventuriers souffrants</h4>
          {sick.length === 0 ? <p class="empty">Tout le monde se porte bien.</p> : (
            <table class="data"><tbody>
              {sick.map((a) => <tr><td>{a.name}</td><td>{a.states.map((x) => `${ETATS[x.etat].nom} ${['légère', 'sérieuse', 'critique'][x.gravite]}`).join(', ')}</td>
                <td><small>{ACTIVITY_LABELS[a.activity.kind]}</small></td></tr>)}
            </tbody></table>
          )}
          <p class="hint">Chances de succès : 50 % + compétence du soigneur − 15 % par cran de gravité + 5 % par niveau. Avant le niveau 4, les cas critiques sont stabilisés (ramenés à « sérieux »).</p>
        </>
      )}
      {tab === 'tarifs' && (
        <>
          <PriceInput label="Soins" sub="prix d'une plaie sérieuse ; toute la grille suit" price={carePrice(s, 'plaie', 1)} refPrice={careRef(s, 'plaie', 1)}
            onCommit={(v) => game.command({ type: 'setInfirmeriePrix', kind: 'soins', price: v })} />
          <PriceInput label="Ventes au comptoir" sub="prix d'une potion ; antidotes et bandages suivent" price={salePrice(s, 'potion')} refPrice={saleRef(s, 'potion')}
            onCommit={(v) => game.command({ type: 'setInfirmeriePrix', kind: 'vente', price: v })} />
          <table class="data" style={{ marginTop: 10 }}>
            <thead><tr><th>Soin</th><th class="num">Légère</th><th class="num">Sérieuse</th><th class="num">Critique</th><th>Niveau requis</th></tr></thead>
            <tbody>{(Object.keys(ETATS) as EtatId[]).map((e) => (
              <tr><td>{ETATS[e].nom}</td>{[0, 1, 2].map((g) => <td class="num">{money(carePrice(s, e, g))}</td>)}<td><small>{ETATS[e].niveau}</small></td></tr>
            ))}</tbody>
          </table>
          <p class="hint">Plus {money(bedDayPrice(s))} par jour d'hospitalisation pour les cas sérieux et critiques.</p>
        </>
      )}
      {tab === 'remedes' && (
        <>
          <div class="row" style={{ marginBottom: 8 }}><span>Quantité par achat :</span><NumField min={1} max={99} value={qty} width={60} label="Quantité par achat" live onCommit={setQty} /></div>
          <table class="data">
            <thead><tr><th>Remède</th><th class="num">Stock</th><th class="num">Prix d'achat</th><th /><th>Achat automatique</th></tr></thead>
            <tbody>{(Object.keys(REMEDES) as RemedeId[]).map((r) => {
              const rule = inf.restock[r] ?? { enabled: false, seuil: 2, qty: 3 };
              return (
                <tr><td>{REMEDES[r].nom}</td><td class="num">{inf.remedes[r]}</td><td class="num">{money(remedyBuyPrice(s, r))}</td>
                  <td><button class="btn small" disabled={remedyBuyPrice(s, r) * qty > s.treasury} onClick={() => game.command({ type: 'buyRemede', remede: r, qty })}>Acheter {qty}</button></td>
                  <td><div class="row" style={{ flexWrap: 'nowrap' }}>
                    <input type="checkbox" checked={rule.enabled} aria-label="Activer" onChange={() => game.command({ type: 'setRemedeRestock', remede: r, rule: { ...rule, enabled: !rule.enabled } })} />
                    <small>si &lt;</small><NumField min={0} value={rule.seuil} width={46} label="Seuil" onCommit={(v) => game.command({ type: 'setRemedeRestock', remede: r, rule: { ...rule, seuil: v } })} />
                    <small>→</small><NumField min={1} value={rule.qty} width={46} label="Quantité" onCommit={(v) => game.command({ type: 'setRemedeRestock', remede: r, rule: { ...rule, qty: v } })} />
                  </div></td></tr>
              );
            })}</tbody>
          </table>
        </>
      )}
      {tab === 'apothicairerie' && (
        !apothecaryActive(s)
          ? <p>L'apothicairerie demande une infirmerie de niveau 3 et un apothicaire. Elle fabrique les remèdes à partir des plantes et des dépouilles de l'entrepôt.</p>
          : <>
            <p class="hint">Une recette toutes les 2 heures, 4 par jour. File d'attente : {inf.queue.length ? inf.queue.map((id) => RECIPES.find((x) => x.id === id)?.produit).join(', ') : 'vide'}.</p>
            <table class="data">
              <thead><tr><th>Recette</th><th>Ingrédients (en stock)</th><th class="num">Coût</th><th class="num">Valeur</th><th /><th>Garder au moins</th></tr></thead>
              <tbody>{RECIPES.map((rec) => {
                const eco = recipeEconomics(s, rec.id);
                return (
                  <tr><td>{rec.qte} {REMEDES[rec.produit].nom.toLowerCase()}</td>
                    <td><small>{Object.entries(rec.ingredients).map(([k, q]) => `${q} ${RESOURCES[k].nom.toLowerCase()} (${stockOfRes(s, k)})`).join(', ')}</small></td>
                    <td class="num">{money(eco.cost)}</td><td class="num"><span class={eco.value > eco.cost ? 'delta up' : 'delta down'}>{money(eco.value)}</span></td>
                    <td><button class="btn small" disabled={!recipeAvailable(s, rec.id)} onClick={() => game.command({ type: 'queueRecipe', recipe: rec.id, times: 1 })}>Fabriquer</button></td>
                    <td><NumField min={0} value={inf.autoCraft[rec.produit] ?? 0} width={52} label="Stock minimum"
                      onCommit={(v) => game.command({ type: 'setAutoCraft', remede: rec.produit, min: v })} /></td></tr>
                );
              })}</tbody>
            </table>
            <HerbOrders s={s} />
          </>
      )}
      {tab === 'credit' && (
        <>
          <p>Un aventurier sans le sou est soigné quand même ; sa dette est prélevée sur ses prochaines récompenses. Il gagne en loyauté, mais les dettes des morts et des déserteurs sont perdues.</p>
          <label class="row"><input type="checkbox" checked={s.policy.credit} onChange={() => game.command({ type: 'setCredit', enabled: !s.policy.credit, cap: s.policy.creditCap })} /> Autoriser les soins à crédit</label>
          <label class="row" style={{ marginTop: 8 }}>Plafond par aventurier (pc)
            <NumField min={0} step={100} value={s.policy.creditCap} width={90} label="Plafond de crédit" onCommit={(v) => game.command({ type: 'setCredit', enabled: s.policy.credit, cap: v })} />
            <small>{money(s.policy.creditCap)}</small></label>
          <p class="hint">Dettes en cours : {money(s.adventurers.reduce((a, x) => a + x.debt, 0))}.</p>
        </>
      )}
      {tab === 'travaux' && <Works s={s} room="infirmerie" />}
    </div>
  );
}

// ---------- Terrain ----------

function TerrainPanel({ s }: { s: GameState }) {
  const nav = useNav();
  const [tab, setTab] = useState<'apercu' | 'profs' | 'travaux'>(s.terrain.level ? 'apercu' : 'travaux');
  const t = s.terrain;
  if (t.level === 0 && !t.works) {
    return <div class="panel"><h3>Terrain d'entraînement</h3><p>L'entraînement fait progresser les aventuriers sans risquer leur vie. Les professeurs coûtent cher : ils ne sont rentables que si leurs séances sont remplies.</p><Upgrade s={s} room="terrain" /></div>;
  }
  const st = s.stats.services.entrainement;
  return (
    <div class="panel">
      <h3>Terrain d'entraînement — niveau {t.level}</h3>
      <Tabs value={tab} onChange={setTab} tabs={[['apercu', 'Aperçu'], ['profs', 'Professeurs et séances'], ['travaux', 'Travaux et aménagements']]} />
      {tab === 'apercu' && (
        <>
          <div class="kpis">
            <Kpi k="Qualité" v={Math.round(terrainQuality(s))} title="Ce que les élèves pensent du terrain (30 + 8 par niveau). Elle rend les séances plus efficaces et plus chères." hint={qualityWord(terrainQuality(s))} />
            <Kpi k="Professeurs" v={`${t.profs.length} / ${maxProfs(s)}`} />
            <Kpi k="Élèves aujourd'hui" v={st?.served ?? 0} />
            <Kpi k="Recette du jour" v={<Money v={st?.revenue ?? 0} />} />
            <Kpi k="Salaires des profs" v={`${money(t.profs.reduce((a, p) => a + profSalary(p), 0))}/j`} />
          </div>
          <p class="hint">Séances de 3 heures à 08h, 14h et 18h. Une séance vaut environ 15 % de l'XP d'une quête. Un élève de niveau égal ou supérieur à celui du professeur n'apprend presque plus rien.</p>
          <PriceInput label="Entraînement libre" sub="sans professeur, XP faible" price={sessionPrice(s, null)} refPrice={sessionRef(s, null)}
            onCommit={(v) => game.command({ type: 'setLibrePrix', price: v })} />
        </>
      )}
      {tab === 'profs' && (
        <>
          {t.profs.length === 0 && <p class="empty">Aucun professeur. Les offres arrivent dans l'écran Personnel.</p>}
          {t.profs.map((p) => (
            <div class="panel flat">
              <div class="row"><strong>{p.name}</strong><span class="tag blue">{PROFS[p.type].nom}</span><small>niveau {p.level} · pédagogie {p.pedagogie} · {p.eleves} élèves · {money(profSalary(p))}/j</small>
                <span class="spacer" /><button class="btn ghost small" onClick={() => game.command({ type: 'fireProf', id: p.id })}>Congédier ({money(profSalary(p) * 3)})</button></div>
              <div class="row" style={{ margin: '6px 0' }}>
                {SLOTS.map((sl) => (
                  <label class="row"><input type="checkbox" checked={p.slots[sl.id]} onChange={() => game.command({ type: 'setProfSlot', id: p.id, slot: sl.id as SlotId, open: !p.slots[sl.id] })} />{sl.nom} ({sl.heure}h)</label>
                ))}
              </div>
              <PriceInput label="Prix de la séance" price={sessionPrice(s, p)} refPrice={sessionRef(s, p)} onCommit={(v) => game.command({ type: 'setProfPrix', id: p.id, price: v })} />
            </div>
          ))}
          {s.profCandidates.length > 0 && <p><button class="btn" onClick={() => nav.go('personnel')}>Voir les {s.profCandidates.length} offre{s.profCandidates.length > 1 ? 's' : ''} de professeurs</button></p>}
        </>
      )}
      {tab === 'travaux' && <Works s={s} room="terrain" />}
    </div>
  );
}

function ComptoirCard({ s }: { s: GameState }) {
  const nav = useNav();
  return (
    <div class="panel">
      <h3>Comptoir et grand hall</h3>
      <p>Chaque équipe qui rentre passe au comptoir : la guilde prélève sa taxe ({Math.round(s.taxRate * 100)} %), rachète ce qu'elle veut, et le reste est vendu en ville.</p>
      <div class="row">
        <button class="btn" onClick={() => nav.go('comptoir')}>Ouvrir le comptoir</button>
        {s.doorCandidates.length > 0 && <button class="btn seal" onClick={() => nav.go('aventuriers')}>{s.doorCandidates.length} candidat{s.doorCandidates.length > 1 ? 's' : ''} à la porte</button>}
      </div>
      <Modules s={s} room="siege" />
      {s.memorial.length > 0 && <><h4 style={{ marginTop: 12 }}>Mur du Souvenir</h4>{s.memorial.slice(-10).map((n) => <div class="soft">✝ {n}</div>)}</>}
    </div>
  );
}

export function Siege({ s }: { s: GameState }) {
  const nav = useNav();
  const [room, setRoom] = useState<RoomHit>('dortoirs');
  const shown: RoomHit = room;
  return (
    <div>
      <div class="screen-head">
        <h2>Le Siège</h2>
        <span class="hint">Clique sur une salle pour la gérer, ou sur un aventurier pour ouvrir sa fiche.</span>
      </div>
      <MorningReport s={s} />
      <BuildingCanvas s={s} selected={shown}
        onSelect={(r) => { if (r === 'quete') nav.go('tableau'); else if (r === 'ville') nav.go('aventuriers'); else setRoom(r); }}
        onOpen={nav.openAdventurer} onStaff={() => nav.go('personnel')} />
      {shown === 'dortoirs' && <DormPanel s={s} />}
      {shown === 'refectoire' && <MessPanel s={s} openKitchen={() => setRoom('cuisine')} />}
      {shown === 'cuisine' && <KitchenPanel s={s} />}
      {shown === 'infirmerie' && <InfirmeriePanel s={s} />}
      {shown === 'terrain' && <TerrainPanel s={s} />}
      {shown === 'comptoir' && <ComptoirCard s={s} />}
    </div>
  );
}
