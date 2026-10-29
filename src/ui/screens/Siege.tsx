// Écran du Siège : vue en coupe et panneaux des salles (GDD 7.5.1).
import { useState } from 'preact/hooks';
import {
  BEDS, DENREES, DISHES, DORM_LEVELS, ETATS, INF_LEVELS, MESS_LEVELS, MODULES, P, PROFS, RECIPES, REMEDES, RESOURCES, SLOTS,
  TERRAIN_LEVELS,
} from '../../sim/data';
import {
  bedDayPrice, bedPrice, bedRef, bedsAvailable, bedsUsed, careRef, carePrice, chefSkill, currentService, dishPrice, dishQuality,
  dishRef, dishUnlocked, dormQuality, foodUnitPrice, infBeds, infQuality, innPrice, kitchenRate, orderCost, pantryCapacity,
  pantryTotal, pendingOf, remedyBuyPrice, salePrice, saleRef, seats, sessionPrice, sessionRef, stockOf, tavernPrice,
  terrainQuality,
} from '../../sim/economy';
import { money, stamp } from '../../sim/format';
import { apothecaryActive, hospitalized, recipeAvailable, recipeEconomics } from '../../sim/infirmary';
import { stockOfRes } from '../../sim/market';
import { dormPlacesUsed, moduleBuyable, ROOM_NAMES, upgradeCost, upgradeLock } from '../../sim/rooms';
import { maxProfs, profSalary } from '../../sim/training';
import type { BedType, DenreeId, DishId, EtatId, GameState, RemedeId, RoomId, SlotId } from '../../sim/types';
import { GaugeRow, Gauge, Kpi, Money, PriceSlider, Tabs, useNav } from '../components';
import { game } from '../store';
import { BuildingCanvas, type RoomHit } from './BuildingCanvas';

const LEVELS: Record<RoomId, { niveau: number; cout: number }[]> = {
  dortoirs: DORM_LEVELS, refectoire: MESS_LEVELS, infirmerie: INF_LEVELS, terrain: TERRAIN_LEVELS,
};
const NEXT_TEXT: Record<RoomId, string[]> = {
  dortoirs: ['', '24 places, dortoir commun', '40 places, chambres individuelles', '60 places, suites', '80 places, qualité de base +10'],
  refectoire: ['', '16 places, 3 plats, bière et paniers de route', '24 places, 4 plats, rôti de monstre', '32 places, 5 plats, Festin du Héros', '40 places, 6 plats, table renommée (gourmets de passage)'],
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
        <div class="hint">{money(cost)} · {next.niveau} jour{next.niveau > 1 ? 's' : ''} de travaux{r.level > 0 ? ', capacité réduite de moitié pendant ce temps' : ''}.</div>
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
            <Kpi k="Qualité" v={Math.round(dormQuality(s))} title="30 + 8 × niveau + aménagements + (propreté − 50) / 2" />
            <Kpi k="Nuitées aujourd'hui" v={st?.served ?? 0} />
            <Kpi k="Recette du jour" v={<Money v={st?.revenue ?? 0} />} />
            <Kpi k="Refus pour prix" v={st?.refusals ?? 0} />
            <Kpi k="Dorment ailleurs" v={st?.toCompetitor ?? 0} />
          </div>
          <GaugeRow label="Propreté" value={d.proprete} />
          <p class="hint">{valets} valet{valets > 1 ? 's' : ''} pour {used} places (un valet entretient {P.personnel.placesParValet} places).</p>
          <table class="data">
            <thead><tr><th>Lit</th><th class="num">Occupés</th><th class="num">Disponibles</th><th class="num">Prix</th></tr></thead>
            <tbody>{lvl.lits.map((b) => <tr><td>{BEDS[b].nom}</td><td class="num">{bedsUsed(s, b)}</td><td class="num">{bedsAvailable(s, b)}</td><td class="num">{money(bedPrice(s, b))}</td></tr>)}</tbody>
          </table>
        </>
      )}
      {tab === 'tarifs' && (
        <>
          <p class="hint">Au-delà de sa tolérance (×1,1 pour un débutant fauché, jusqu'à ×1,6 pour un aventurier aisé), l'aventurier refuse et part au Sanglier Borgne.</p>
          {lvl.lits.map((b) => (
            <PriceSlider key={b} label={BEDS[b].nom} sub={`énergie ${BEDS[b].energie} %, moral ${BEDS[b].moral > 0 ? '+' : ''}${BEDS[b].moral}`}
              value={d.curseurs[b]} price={bedPrice(s, b)} refPrice={bedRef(s, b)} competitor={innPrice(s)} refusals={st?.refusals}
              onCommit={(v) => game.command({ type: 'setBedCurseur', bed: b, value: v })} />
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

function MessPanel({ s }: { s: GameState }) {
  const [tab, setTab] = useState<'apercu' | 'tarifs' | 'menu' | 'stock' | 'travaux'>('apercu');
  const r = s.refectoire;
  const lvl = MESS_LEVELS[r.level - 1];
  const sv = currentService(s);
  const st = s.stats.services.repas;
  const dishes = (Object.keys(DISHES) as DishId[]).filter((d) => dishUnlocked(s, d));
  const mealsOnMenu = r.menu.filter((d) => DISHES[d].type === 'repas').length;
  const [qty, setQty] = useState<Partial<Record<DenreeId, number>>>({});
  const denrees = (Object.keys(DENREES) as DenreeId[]).filter((d) => !DENREES[d].interne);
  return (
    <div class="panel">
      <h3>Réfectoire — niveau {r.level}</h3>
      <Tabs value={tab} onChange={setTab} tabs={[['apercu', 'Aperçu'], ['tarifs', 'Tarifs'], ['menu', 'Menu'], ['stock', 'Garde-manger'], ['travaux', 'Travaux et aménagements']]} />
      {tab === 'apercu' && (
        <>
          <div class="kpis">
            <Kpi k="Service" v={sv ? sv.nom : 'fermé'} />
            <Kpi k="Places" v={seats(s)} />
            <Kpi k="Cuisine" v={`${kitchenRate(s)} portions/h`} title="Cuisinier : 6 + compétence / 10, commis : +4" />
            <Kpi k="Repas aujourd'hui" v={st?.served ?? 0} />
            <Kpi k="Recette du jour" v={<Money v={(st?.revenue ?? 0) + (s.stats.services.boissons?.revenue ?? 0)} />} />
            <Kpi k="Mangent ailleurs" v={st?.toCompetitor ?? 0} />
          </div>
          {r.damage > 0 && (
            <div class="row" style={{ marginBottom: 8 }}>
              <span class="tag seal">Mobilier cassé : qualité −{r.damage}</span>
              <button class="btn small" onClick={() => game.command({ type: 'repairFurniture' })}>Réparer ({money(Math.ceil(r.damage / 5) * 1000)})</button>
            </div>
          )}
          <p class="hint">Services : petit-déjeuner 06h–09h, déjeuner 11h–14h, dîner 18h–21h{r.level >= 2 ? ', taverne 18h–22h' : ''}. Meilleur cuisinier : compétence {chefSkill(s)}.</p>
          <table class="data">
            <thead><tr><th>Plat</th><th class="num">Qualité</th><th class="num">Prix</th><th>État</th></tr></thead>
            <tbody>
              {r.menu.filter((d) => dishUnlocked(s, d)).map((d) => (
                <tr><td>{DISHES[d].nom}</td><td class="num">{Math.round(dishQuality(s, d))}</td><td class="num">{money(dishPrice(s, d))}</td>
                  <td>{DISHES[d].cMin > chefSkill(s) ? <span class="tag seal">cuisinier trop peu compétent (min. {DISHES[d].cMin})</span>
                    : Object.entries(DISHES[d].ingredients).some(([k, q]) => stockOf(s, k as DenreeId) < (q ?? 0))
                      ? <span class="tag seal">{d === 'roti' ? 'pas de viande de monstre en resserre' : 'ingrédients manquants'}</span>
                      : <span class="tag sage">disponible</span>}</td></tr>
              ))}
            </tbody>
          </table>
          {r.level >= 3 && <p class="hint">Le rôti utilise la viande de monstre de la resserre : règle le rachat des viandes au comptoir pour l'approvisionner. Chaque espèce donne un bonus pour la quête suivante.</p>}
        </>
      )}
      {tab === 'tarifs' && dishes.map((d) => (
        <PriceSlider key={d} label={DISHES[d].nom}
          sub={DISHES[d].type === 'repas' ? `faim +${DISHES[d].faim}, moral ${DISHES[d].moral > 0 ? '+' : ''}${DISHES[d].moral}` : DISHES[d].type === 'boisson' ? `le soir, moral +${DISHES[d].moral}` : 'emporté en quête'}
          value={r.curseurs[d]} price={dishPrice(s, d)} refPrice={dishRef(s, d)}
          competitor={DISHES[d].type === 'repas' ? tavernPrice(s) : undefined}
          onCommit={(v) => game.command({ type: 'setDishCurseur', dish: d, value: v })} />
      ))}
      {tab === 'menu' && (
        <>
          <p class="hint">Au plus {lvl.plats} plats au menu à ce niveau. Les boissons et les paniers de route ne comptent pas.</p>
          {dishes.map((d) => {
            const on = r.menu.includes(d);
            const blocked = !on && DISHES[d].type === 'repas' && mealsOnMenu >= lvl.plats;
            return (
              <label class="row" style={{ padding: '4px 0' }}>
                <input type="checkbox" checked={on} disabled={blocked} onChange={() => game.command({ type: 'setMenu', menu: on ? r.menu.filter((x) => x !== d) : [...r.menu, d] })} />
                {DISHES[d].nom} <small>({Object.entries(DISHES[d].ingredients).map(([k, q]) => `${q} ${DENREES[k as DenreeId].nom.toLowerCase()}`).join(', ')})</small>
              </label>
            );
          })}
        </>
      )}
      {tab === 'stock' && (
        <>
          <p>Garde-manger : <strong>{pantryTotal(s)}</strong> / {pantryCapacity(s)} portions{pendingOf(s) ? `, ${pendingOf(s)} en commande` : ''}. Livraison le lendemain à 06h pour toute commande passée avant 18h.</p>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>Denrée</th><th class="num">Stock</th><th>Fraîcheur</th><th class="num">Commandé</th><th>Commander</th><th>Réapprovisionnement automatique</th></tr></thead>
              <tbody>
                {[...denrees, 'monstre' as DenreeId].map((den) => {
                  const lots = r.pantry.filter((l) => l.denree === den);
                  const fresh = lots.length ? Math.min(...lots.map((l) => l.fresh)) : 1;
                  if (den === 'monstre') {
                    return <tr><td>Viande de monstre<div class="hint">Débitée depuis la resserre</div></td><td class="num">{stockOf(s, den)}</td>
                      <td>{lots.length ? <Gauge value={fresh * 100} /> : <span class="hint">—</span>}</td><td /><td /><td /></tr>;
                  }
                  const rule = s.restock[den];
                  const q = qty[den] ?? 30;
                  return (
                    <tr>
                      <td>{DENREES[den].nom}<div class="hint">{foodUnitPrice(s, den).toFixed(1).replace('.', ',')} pc / portion · {DENREES[den].conservation} j</div></td>
                      <td class="num">{stockOf(s, den)}</td>
                      <td style={{ minWidth: 70 }}>{lots.length ? <Gauge value={fresh * 100} /> : <span class="hint">—</span>}</td>
                      <td class="num">{pendingOf(s, den) || ''}</td>
                      <td><div class="row" style={{ flexWrap: 'nowrap' }}>
                        <input type="number" min={1} max={500} value={q} style={{ width: 60 }} aria-label={`Quantité de ${DENREES[den].nom}`} onInput={(e) => setQty({ ...qty, [den]: Number((e.target as HTMLInputElement).value) || 0 })} />
                        <button class="btn small" disabled={orderCost(s, den, q) > s.treasury} onClick={() => game.command({ type: 'orderFood', denree: den, qty: q })}>{money(orderCost(s, den, q))}</button>
                      </div></td>
                      <td><div class="row" style={{ flexWrap: 'nowrap' }}>
                        <input type="checkbox" checked={rule.enabled} aria-label="Activer" onChange={() => game.command({ type: 'setRestock', denree: den, rule: { ...rule, enabled: !rule.enabled } })} />
                        <small>si &lt;</small>
                        <input type="number" min={0} value={rule.seuil} style={{ width: 50 }} aria-label="Seuil" onChange={(e) => game.command({ type: 'setRestock', denree: den, rule: { ...rule, seuil: Number((e.target as HTMLInputElement).value) || 0 } })} />
                        <small>→</small>
                        <input type="number" min={1} value={rule.qty} style={{ width: 50 }} aria-label="Quantité" onChange={(e) => game.command({ type: 'setRestock', denree: den, rule: { ...rule, qty: Number((e.target as HTMLInputElement).value) || 1 } })} />
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === 'travaux' && <Works s={s} room="refectoire" />}
    </div>
  );
}

// ---------- Infirmerie ----------

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
            <Kpi k="Qualité" v={Math.round(infQuality(s))} title="30 + 6 × niveau + 0,3 × compétence des soigneurs" />
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
                <td><small>{a.activity.kind === 'hospitalise' ? 'hospitalisé' : a.activity.kind === 'quete' ? 'en quête' : ''}</small></td></tr>)}
            </tbody></table>
          )}
          <p class="hint">Chances de succès : 50 % + compétence du soigneur − 15 % par cran de gravité + 5 % par niveau. Avant le niveau 4, les cas critiques sont stabilisés (ramenés à « sérieux »).</p>
        </>
      )}
      {tab === 'tarifs' && (
        <>
          <PriceSlider label="Soins" sub="un seul curseur pour toute la grille" value={inf.curseurSoins} price={carePrice(s, 'plaie', 1)} refPrice={careRef(s, 'plaie', 1)}
            onCommit={(v) => game.command({ type: 'setInfirmerieCurseur', kind: 'soins', value: v })} />
          <PriceSlider label="Ventes au comptoir" sub="potions, antidotes, bandages" value={inf.curseurVente} price={salePrice(s, 'potion')} refPrice={saleRef(s, 'potion')}
            onCommit={(v) => game.command({ type: 'setInfirmerieCurseur', kind: 'vente', value: v })} />
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
          <div class="row" style={{ marginBottom: 8 }}><span>Quantité par achat :</span><input type="number" min={1} value={qty} style={{ width: 60 }} onInput={(e) => setQty(Number((e.target as HTMLInputElement).value) || 1)} /></div>
          <table class="data">
            <thead><tr><th>Remède</th><th class="num">Stock</th><th class="num">Prix d'achat</th><th /><th>Achat automatique</th></tr></thead>
            <tbody>{(Object.keys(REMEDES) as RemedeId[]).map((r) => {
              const rule = inf.restock[r] ?? { enabled: false, seuil: 2, qty: 3 };
              return (
                <tr><td>{REMEDES[r].nom}</td><td class="num">{inf.remedes[r]}</td><td class="num">{money(remedyBuyPrice(s, r))}</td>
                  <td><button class="btn small" disabled={remedyBuyPrice(s, r) * qty > s.treasury} onClick={() => game.command({ type: 'buyRemede', remede: r, qty })}>Acheter {qty}</button></td>
                  <td><div class="row" style={{ flexWrap: 'nowrap' }}>
                    <input type="checkbox" checked={rule.enabled} aria-label="Activer" onChange={() => game.command({ type: 'setRemedeRestock', remede: r, rule: { ...rule, enabled: !rule.enabled } })} />
                    <small>si &lt;</small><input type="number" min={0} value={rule.seuil} style={{ width: 46 }} aria-label="Seuil" onChange={(e) => game.command({ type: 'setRemedeRestock', remede: r, rule: { ...rule, seuil: Number((e.target as HTMLInputElement).value) || 0 } })} />
                    <small>→</small><input type="number" min={1} value={rule.qty} style={{ width: 46 }} aria-label="Quantité" onChange={(e) => game.command({ type: 'setRemedeRestock', remede: r, rule: { ...rule, qty: Number((e.target as HTMLInputElement).value) || 1 } })} />
                  </div></td></tr>
              );
            })}</tbody>
          </table>
        </>
      )}
      {tab === 'apothicairerie' && (
        !apothecaryActive(s)
          ? <p>L'apothicairerie demande une infirmerie de niveau 3 et un apothicaire. Elle fabrique les remèdes à partir des plantes et des dépouilles de la resserre.</p>
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
                    <td><input type="number" min={0} value={inf.autoCraft[rec.produit] ?? 0} style={{ width: 52 }} aria-label="Stock minimum"
                      onChange={(e) => game.command({ type: 'setAutoCraft', remede: rec.produit, min: Number((e.target as HTMLInputElement).value) || 0 })} /></td></tr>
                );
              })}</tbody>
            </table>
          </>
      )}
      {tab === 'credit' && (
        <>
          <p>Un aventurier sans le sou est soigné quand même ; sa dette est prélevée sur ses prochaines récompenses. Il gagne en loyauté, mais les dettes des morts et des déserteurs sont perdues.</p>
          <label class="row"><input type="checkbox" checked={s.policy.credit} onChange={() => game.command({ type: 'setCredit', enabled: !s.policy.credit, cap: s.policy.creditCap })} /> Autoriser les soins à crédit</label>
          <label class="row" style={{ marginTop: 8 }}>Plafond par aventurier (pc)
            <input type="number" min={0} step={100} value={s.policy.creditCap} style={{ width: 90 }} onChange={(e) => game.command({ type: 'setCredit', enabled: s.policy.credit, cap: Number((e.target as HTMLInputElement).value) || 0 })} />
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
            <Kpi k="Qualité" v={Math.round(terrainQuality(s))} />
            <Kpi k="Professeurs" v={`${t.profs.length} / ${maxProfs(s)}`} />
            <Kpi k="Élèves aujourd'hui" v={st?.served ?? 0} />
            <Kpi k="Recette du jour" v={<Money v={st?.revenue ?? 0} />} />
            <Kpi k="Salaires des profs" v={`${money(t.profs.reduce((a, p) => a + profSalary(p), 0))}/j`} />
          </div>
          <p class="hint">Séances de 3 heures à 08h, 14h et 18h. Une séance vaut environ 15 % de l'XP d'une quête. Un élève de niveau égal ou supérieur à celui du professeur n'apprend presque plus rien.</p>
          <PriceSlider label="Entraînement libre" sub="sans professeur, XP faible" value={t.libreCurseur} price={sessionPrice(s, null)} refPrice={sessionRef(s, null)}
            onCommit={(v) => game.command({ type: 'setLibreCurseur', value: v })} />
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
              <PriceSlider label="Prix de la séance" value={p.curseur} price={sessionPrice(s, p)} refPrice={sessionRef(s, p)} onCommit={(v) => game.command({ type: 'setProfCurseur', id: p.id, value: v })} />
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
  const shown: RoomHit = room === 'cuisine' ? 'refectoire' : room;
  return (
    <div>
      <div class="screen-head">
        <h2>Le Siège</h2>
        <span class="hint">Clique sur une salle pour la gérer, ou sur un aventurier pour ouvrir sa fiche.</span>
      </div>
      <BuildingCanvas s={s} selected={shown}
        onSelect={(r) => { if (r === 'quete') nav.go('tableau'); else if (r === 'ville') nav.go('aventuriers'); else setRoom(r); }}
        onOpen={nav.openAdventurer} />
      {shown === 'dortoirs' && <DormPanel s={s} />}
      {shown === 'refectoire' && <MessPanel s={s} />}
      {shown === 'infirmerie' && <InfirmeriePanel s={s} />}
      {shown === 'terrain' && <TerrainPanel s={s} />}
      {shown === 'comptoir' && <ComptoirCard s={s} />}
    </div>
  );
}
