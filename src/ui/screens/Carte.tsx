// La Carte régionale (GDD 7.5.6, 4.10, 5.8) : zones colorées selon leur Danger, villes voisines et routes, équipes en route, calques.
import { useState } from 'preact/hooks';
import {
  activeCaravans, caravanFeeRef, caravanPreview, cityLotValue, cityPriceMult, cityState, commerceLabel, rivalCity, routeOpen, tradeFactor,
} from '../../sim/cities';
import { CITIES, CITY_IDS, P, REGION_ZONES, RESOURCES, SPECIES, ZONES } from '../../sim/data';
import { relationLabel, relationOf } from '../../sim/diplomacy';
import { money, stamp } from '../../sim/format';
import { lotValue } from '../../sim/market';
import { huntClosed, popOf, zoneDanger } from '../../sim/populations';
import { QUEST_TYPE_NAMES } from '../../sim/quests';
import type { GameState, QuestRun, Rival } from '../../sim/types';
import { dangerTier } from '../../sim/world';
import { game, lastError } from '../store';
import { ClassDot, classColor, Gauge, Help, MoneyField, RichText } from '../components';
import carteUrl from '../../assets/carte.jpg';

type Pt = [number, number];

/**
 * Carte illustrée (v1.1, D-158) : 1280 × 832. Chaque lieu a son dessin (ART), l'endroit où s'écrit son nom (LABEL),
 * et un nœud sur le réseau des routes de l'image (NODE). Les équipes suivent ces routes.
 */
const ART: Record<string, Pt> = {
  ville: [296, 400], foret: [555, 370], collines: [896, 290], marais: [688, 616], ruines: [1000, 500], pics: [1120, 110],
  chenaie: [320, 144], valroy: [736, 70], port: [240, 632], brisemine: [1176, 256],
};
const LABEL: Record<string, Pt> = {
  ville: [296, 482], foret: [556, 372], collines: [900, 300], marais: [690, 622], ruines: [1000, 592], pics: [1040, 158],
  chenaie: [320, 246], valroy: [736, 152], port: [236, 712], brisemine: [1176, 322],
};
const NODE: Record<string, Pt> = {
  ville: [296, 400], ville_e: [379, 392], ville_n: [328, 362], ville_s: [339, 436],
  foret: [552, 368], foret_w: [432, 386], foret_e: [704, 349],
  jv: [400, 285], j2: [656, 200], j3: [728, 339], h: [904, 406], j4: [1064, 400], jp: [392, 573],
  chenaie: [330, 160], valroy: [735, 112], collines: [896, 300], brisemine: [1170, 262], pics: [1120, 140],
  ruines: [1052, 486], marais: [690, 628], marais_w: [528, 659], marais_e: [832, 605], port: [300, 622],
};
/** Les routes de l'image : extrémités et points intermédiaires, relevés sur le dessin. */
const ROADS: [string, string, Pt[]][] = [
  ['ville', 'ville_e', []], ['ville', 'ville_n', []], ['ville', 'ville_s', []],
  ['ville_e', 'foret_w', [[405, 388]]], ['foret_w', 'foret', []], ['foret', 'foret_e', []], ['foret_e', 'j3', [[716, 344]]],
  ['ville_n', 'jv', [[344, 344], [371, 309]]], ['jv', 'chenaie', [[403, 264], [384, 205], [360, 180]]],
  ['jv', 'j2', [[464, 264], [552, 237], [640, 216]]], ['j2', 'valroy', [[688, 160], [717, 131]]],
  ['j2', 'j3', [[648, 240], [669, 280], [704, 312]]], ['j3', 'h', [[784, 376], [864, 400]]], ['h', 'collines', [[900, 350]]],
  ['h', 'j4', [[960, 413], [1040, 408]]], ['j4', 'brisemine', [[1104, 344], [1144, 296]]], ['brisemine', 'pics', [[1150, 200]]],
  ['j4', 'ruines', [[1104, 424], [1107, 456], [1080, 478]]], ['ruines', 'marais_e', [[960, 552], [912, 576], [856, 600]]], ['marais_e', 'marais', []],
  ['ville_s', 'jp', [[328, 496], [368, 528], [400, 552]]], ['jp', 'port', [[344, 595]]], ['jp', 'marais_w', [[424, 600], [480, 648]]], ['marais_w', 'marais', []],
];
const polyLen = (pts: Pt[]) => pts.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
/** Le tracé d'une route, dans le sens a → b. */
function roadPts(a: string, b: string): Pt[] {
  const r = ROADS.find(([x, y]) => (x === a && y === b) || (x === b && y === a))!;
  const pts: Pt[] = [NODE[r[0]], ...r[2], NODE[r[1]]];
  return r[0] === a ? pts : pts.reverse();
}
/** Le plus court chemin par les routes, de la Ville à un lieu (Dijkstra sur les nœuds). */
const PATHS: Record<string, Pt[]> = (() => {
  const best: Record<string, { d: number; via: string[] }> = { ville: { d: 0, via: ['ville'] } };
  const todo = new Set(Object.keys(NODE));
  while (todo.size) {
    const cur = [...todo].filter((n) => best[n]).sort((x, y) => best[x].d - best[y].d)[0];
    if (!cur) break;
    todo.delete(cur);
    for (const [x, y] of ROADS) {
      const nb = x === cur ? y : y === cur ? x : null;
      if (!nb || !todo.has(nb)) continue;
      const d = best[cur].d + polyLen(roadPts(cur, nb));
      if (!best[nb] || d < best[nb].d) best[nb] = { d, via: [...best[cur].via, nb] };
    }
  }
  const out: Record<string, Pt[]> = {};
  for (const [id, { via }] of Object.entries(best)) {
    const pts: Pt[] = [NODE.ville];
    for (let i = 1; i < via.length; i++) pts.push(...roadPts(via[i - 1], via[i]).slice(1));
    out[id] = pts;
  }
  return out;
})();
/** Dernier tronçon de route qui mène à une ville voisine (celui qu'une coupure barre). */
function lastLeg(id: string): Pt[] {
  const r = ROADS.find(([x, y]) => x === id || y === id);
  return r ? roadPts(r[0] === id ? r[1] : r[0], id) : [NODE[id]];
}
const TOWN_NAMES = { bourg: 'Le Bourg', ville: 'La Ville', cite: 'La Cité' } as const;

const TIER_COLORS = ['var(--sage)', 'var(--blue)', 'var(--amber)', 'var(--seal)', 'var(--seal)'];
/** Couleur des fanions des guildes rivales, selon leur profil. */
const RIVAL_COLORS: Record<Rival['profil'], string> = { prestige: 'var(--gold)', mercenaires: 'var(--c-voleur)', chasseurs: 'var(--c-rodeur)' };
const CATEGORIES: Record<string, string> = {
  plante: 'plantes', os: 'os et écailles', peau: 'peaux et cuirs', viande: 'viandes', organe: 'organes', rare: 'raretés', objet: 'objets',
};

/** Point situé à la fraction p (0 à 1) d'une ligne brisée. */
function along(pts: Pt[], p: number): Pt {
  if (pts.length < 2) return pts[0];
  const seg = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
  let d = p * seg.reduce((x, y) => x + y, 0);
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? Math.min(1, d / seg[i]) : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
    }
    d -= seg[i];
  }
  return pts[pts.length - 1];
}

/** Position d'une équipe sur sa route, selon l'étape de sa quête. */
function runPosition(run: QuestRun, i: number): Pt {
  const target = run.quest.dest ?? run.quest.zone;
  const path = PATHS[target] ?? [NODE.ville];
  if (path.length < 2) return [NODE.ville[0] - 30 + (i % 4) * 20, NODE.ville[1] + 10 + Math.floor(i / 4) * 18];   // aux égouts : dans les murs de la ville
  const trajet = Math.max(1, run.quest.dest ? CITIES[run.quest.dest].trajet : ZONES[run.quest.zone].trajet);
  let p = 0;
  if (run.stage === 'aller') p = 1 - Math.min(1, run.stageHours / trajet);
  else if (run.stage === 'objectif') p = 1;
  else if (run.stage === 'retour') p = Math.min(1, run.stageHours / trajet);
  p = Math.max(0.12, Math.min(0.92, p));   // reste sur la route, sans masquer les noms
  return along(path, p);
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 60},${18 - (v / 100) * 16}`).join(' ');
  return <svg viewBox="0 0 60 20" class="spark" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width={1.5} points={pts} /></svg>;
}

/** Les environs d'une ville voisine (v1.1, D-160) : ses bêtes, ses plantes et les demandes de son conseil. */
function Environs({ s, zone }: { s: GameState; zone: string }) {
  const z = ZONES[zone];
  if (!z) return null;
  const quests = s.board.filter((q) => q.zone === zone);
  const d = zoneDanger(s, zone);
  return (
    <>
      <h4>{z.nom} <Help text={`Les environs de la ville. Ses bêtes et ses plantes vivent comme celles de la région ; son conseil publie des demandes sur ton tableau (chasse, cueillette, défense de la ville) et une extermination quand une espèce prolifère. Trajet long, paie ×${P.villes.recompenseEnvirons} ; chaque quête réussie ici fait aussi monter le commerce (+${P.villes.commerceQuete}).`} /></h4>
      <p class="hint"><span class="tier-chip" style={{ background: TIER_COLORS[dangerTier(d).idx] }} /> danger {d} ({dangerTier(d).nom}) · {z.trajet} h de trajet</p>
      {Object.keys(z.especes).map((sp) => (
        <div class="gauge-row"><span class="soft">{SPECIES[sp].nom}{huntClosed(s, zone, sp) && <> <span class="tag amber">chasse fermée</span></>}</span>
          <Gauge value={popOf(s, zone, sp)} color={popOf(s, zone, sp) > 80 ? 'var(--seal)' : 'var(--sage)'} /><span>{Math.round(popOf(s, zone, sp))}</span></div>
      ))}
      {Object.keys(z.plantes).map((pl) => (
        <div class="gauge-row"><span class="soft">{RESOURCES[pl].nom}</span><Gauge value={popOf(s, zone, pl)} color="var(--blue)" /><span>{Math.round(popOf(s, zone, pl))}</span></div>
      ))}
      <h4>Demandes du conseil</h4>
      {quests.map((q) => <p class="news">{q.title} <small class="hint">rang {q.rang} · {money(q.type === 'extermination' ? (q.perHead ?? 0) : q.reward + q.bonus)}{q.type === 'extermination' ? ' la tête' : ''}</small></p>)}
      {quests.length === 0 && <p class="empty">Aucune pour l'instant.</p>}
    </>
  );
}

/** « de la Compagnie de l'Aube », « des Crocs Libres », « du Cercle… » : le nom d'une guilde après « de ». */
function deNom(nom: string) {
  const [pre, rest] = nom.startsWith('Les ') ? ['des ', nom.slice(4)] : nom.startsWith('Le ') ? ['du ', nom.slice(3)] : nom.startsWith('La ') ? ['de la ', nom.slice(3)] : nom.startsWith("L'") ? ["de l'", nom.slice(2)] : ['de ', nom];
  return <>{pre}<strong>{rest}</strong></>;
}

/** Ce que rapporte la route commerciale d'une ville, en clair. */
function advantage(s: GameState, id: string): string {
  const c = CITIES[id];
  const f = tradeFactor(s, c.effet);
  if (c.effet === 'nobles') return `${c.effetTexte} : +${Math.round(P.villes.noblesMax * f * 100)} %`;
  return `${c.effetTexte} : −${Math.round(P.villes.effetMax * f * 100)} %`;
}

function Caravan({ s, id }: { s: GameState; id: string }) {
  const c = CITIES[id];
  const goods = [...new Set(s.resserre.map((l) => l.res))].sort((a, b) => cityPriceMult(s, id, b) - cityPriceMult(s, id, a) || a.localeCompare(b));
  const [picked, setPicked] = useState<string[]>(() => goods.filter((r) => c.demande.includes(RESOURCES[r].categorie)));
  const [fee, setFee] = useState(() => caravanFeeRef(s, id));
  const err = lastError();
  const sel = picked.filter((r) => goods.includes(r));
  const prev = caravanPreview(s, id, sel);
  const gain = prev.value - prev.local - fee;
  const busy = activeCaravans(s) >= P.villes.caravane.max;
  const toggle = (r: string) => setPicked(sel.includes(r) ? sel.filter((x) => x !== r) : [...sel, r]);
  return (
    <>
      <h4>Caravane de la guilde <Help text={`Charge des marchandises de l'Entrepôt et paie leur escorte jusqu'à ${c.nom}. Une ville paie bien plus cher ce qu'elle demande, surtout quand le commerce est florissant, et ses cours ne s'effondrent pas comme ceux de la ville. Si personne ne prend l'escorte, tout revient ; si le convoi est détruit, les marchandises sont perdues.`} /></h4>
      {goods.length === 0 ? <p class="empty">L'Entrepôt est vide.</p> : (
        <>
          <div class="table-wrap"><table class="data">
            <thead><tr><th /><th>Marchandise</th><th class="num">Qté</th><th class="num">En ville</th><th class="num">À {c.court}</th></tr></thead>
            <tbody>{goods.map((r) => {
              const lots = s.resserre.filter((l) => l.res === r);
              const qty = lots.reduce((a, l) => a + l.qty, 0);
              const wanted = c.demande.includes(RESOURCES[r].categorie);
              return (
                <tr class={wanted ? '' : 'soft'}>
                  <td><input type="checkbox" checked={sel.includes(r)} onChange={() => toggle(r)} aria-label={`Charger ${RESOURCES[r].nom}`} /></td>
                  <td>{RESOURCES[r].nom}{wanted && <> <span class="tag gold" title="Catégorie demandée par la ville">demandé</span></>}</td>
                  <td class="num">{qty}</td>
                  <td class="num">{money(lots.reduce((a, l) => a + lotValue(s, l), 0))}</td>
                  <td class="num">{money(lots.reduce((a, l) => a + cityLotValue(s, id, l), 0))}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
          <div class="row" style={{ marginTop: 6 }}>
            <MoneyField label="Prix de l'escorte" value={fee} onCommit={setFee} min={50} />
            <small class="hint">conseillé : {money(caravanFeeRef(s, id))}</small>
          </div>
          <p class="hint">Chargement {prev.weight} / {P.villes.caravane.poidsMax} de poids · vente à {c.court} ≈ {money(prev.value)} (en ville {money(prev.local)}) ·{' '}
            <strong style={{ color: gain >= 0 ? 'var(--sage)' : 'var(--seal)' }}>{gain >= 0 ? 'gain' : 'perte'} {money(Math.abs(gain))}</strong> une fois l'escorte payée.</p>
          <button class="btn seal" disabled={!sel.length || busy || !routeOpen(s, id) || fee > s.treasury}
            title={busy ? `Pas plus de ${P.villes.caravane.max} caravanes à la fois` : !routeOpen(s, id) ? 'La route est coupée' : ''}
            onClick={() => game.command({ type: 'sendCaravan', ville: id, res: sel, fee })}>Envoyer la caravane</button>
          {err && <p class="hint" style={{ color: 'var(--seal)' }}>{err}</p>}
        </>
      )}
    </>
  );
}

function CityPanel({ s, id, onRun }: { s: GameState; id: string; onRun: (id: number) => void }) {
  const c = CITIES[id];
  const st = cityState(s, id);
  const lab = commerceLabel(st.commerce);
  const guild = s.world.rivals.find((r) => r.bankruptSince === null && rivalCity(r) === id);
  const open = routeOpen(s, id);
  const routeQuest = s.board.find((q) => q.route === id);
  const escorts = s.board.filter((q) => q.dest === id);
  const runs = s.runs.filter((r) => r.stage !== 'preparation' && (r.quest.dest === id || r.quest.route === id));
  return (
    <>
      <h3>{c.nom}</h3>
      <p class="hint" style={{ marginTop: -6 }}>{c.titre[0].toUpperCase() + c.titre.slice(1)}</p>
      <p>{guild ? <><span class="rival-chip" style={{ background: RIVAL_COLORS[guild.profil] }} /> Siège {deNom(guild.nom)}{' '}
        <span class={`tag ${relationLabel(relationOf(guild)).tone}`}>{relationLabel(relationOf(guild)).nom}</span></>
        : <span class="soft">Aucune guilde n'y siège : une nouvelle guilde peut s'y installer.</span>}</p>
      <p class="hint">Route par {ZONES[c.route].nom} · {c.trajet} h de trajet · escortes de rang {c.rang}</p>
      {!open && (
        <div class="callout bad">
          <strong>Route coupée</strong> depuis le {stamp(st.coupeeDepuis!)}{st.cause && SPECIES[st.cause] ? <> par des {SPECIES[st.cause].pluriel}</> : null}.
          {' '}Plus aucun convoi, et le commerce s'effondre. {routeQuest ? <>La quête « {routeQuest.title} » est au tableau.</> : runs.some((r) => r.quest.route === id) ? 'Une équipe est en route pour la rouvrir.' : 'Une quête pour la rouvrir sera affichée demain matin.'}
          {' '}Sinon, la milice dégagera la route le {stamp(st.coupeeDepuis! + P.villes.coupure.dureeMax * 24)}.
        </div>
      )}
      <h4>Commerce <Help text={`Chaque escorte réussie vers ${c.nom} fait monter le commerce (+${P.villes.commerceOk}), chaque échec le fait baisser (${P.villes.commerceEchec}). Sans convoi, il s'étiole de ${Math.round(P.villes.commerceErosion * 100)} % par jour. Plus il est haut, plus l'avantage de la ville est fort.`} /></h4>
      <div class="gauge-row"><span class={`tag ${lab.tone}`}>{lab.nom}</span><Gauge value={st.commerce} color="var(--gold)" /><span class="num">{Math.round(st.commerce)}</span></div>
      <p class="hint">Avantage : {advantage(s, id)}{!open && ' (suspendu)'}.</p>
      <p class="hint">Achète bien : {c.demande.map((d) => CATEGORIES[d] ?? d).join(', ')}.</p>
      <Environs s={s} zone={c.environs} />
      <h4>Escortes au tableau</h4>
      {escorts.map((q) => <p class="news">{q.title} <small class="hint">rang {q.rang} · {money(q.reward + q.bonus)}</small></p>)}
      {escorts.length === 0 && <p class="empty">Aucune.</p>}
      {runs.length > 0 && <h4>En route</h4>}
      {runs.map((r) => <button class="link" onClick={() => onRun(r.id)}>{r.quest.title}</button>)}
      <Caravan key={id} s={s} id={id} />
    </>
  );
}

export function Carte({ s }: { s: GameState }) {
  const [zone, setZone] = useState<string | null>(null);   // aucun lieu choisi à l'ouverture
  const [city, setCity] = useState<string | null>(null);
  const [runId, setRunId] = useState<number | null>(null);
  const [layers, setLayers] = useState({ pops: true, quests: true, plants: false, rivals: true });
  const runs = s.runs.filter((r) => r.stage !== 'preparation');
  const run = runs.find((r) => r.id === runId) ?? null;
  const toggle = (k: keyof typeof layers) => setLayers({ ...layers, [k]: !layers[k] });
  const z = zone ? ZONES[zone] : null;
  const hist = s.world.popHistory;
  const trips = s.world.rivalTrips ?? [];
  const rivalOf = (id: string) => s.world.rivals.find((r) => r.id === id);
  const active = s.world.rivals.filter((r) => r.bankruptSince === null);
  const pickZone = (id: string) => { setZone(id); setCity(null); setRunId(null); };
  const pickCity = (id: string) => { setCity(id); setRunId(null); };
  return (
    <div>
      <div class="screen-head"><h2>Carte régionale</h2><span class="hint">Clique sur une zone, une ville ou une équipe. Tu ne peux pas rappeler une équipe : tu ne fais que suivre.</span></div>
      <div class="row" style={{ marginBottom: 8 }}>
        <label class="row"><input type="checkbox" checked={layers.pops} onChange={() => toggle('pops')} />Populations</label>
        <label class="row"><input type="checkbox" checked={layers.plants} onChange={() => toggle('plants')} />Plantes</label>
        <label class="row"><input type="checkbox" checked={layers.quests} onChange={() => toggle('quests')} />Quêtes du tableau</label>
        <label class="row"><input type="checkbox" checked={layers.rivals} onChange={() => toggle('rivals')} />Guildes rivales</label>
      </div>
      <div class="split-map">
        <div class="panel map-panel">
          <svg viewBox="0 0 1280 832" class="map map-illustree" role="img" aria-label="Carte de la région, des villes voisines et des équipes en quête">
            <image href={carteUrl} x={0} y={0} width={1280} height={832} class="map-bg" />
            {CITY_IDS.filter((id) => !routeOpen(s, id)).map((id) => {
              const leg = lastLeg(id);
              const mid = along(leg, 0.5);
              return (
                <g>
                  <polyline points={leg.map((q) => q.join(',')).join(' ')} class="road-cut" />
                  <text x={mid[0]} y={mid[1] + 9} class="cut-mark"><title>Route coupée</title>✕</text>
                </g>
              );
            })}
            {REGION_ZONES.map((id) => {
              const d = zoneDanger(s, id);
              const [x, y] = ART[id];
              const [lx, ly] = LABEL[id];
              const nq = s.board.filter((q) => q.zone === id && q.type !== 'aide' && !q.dest).length;
              const tier = TIER_COLORS[dangerTier(d).idx];
              const species = Object.keys(ZONES[id].especes).filter((sp) => sp !== 'dragon' || popOf(s, id, sp) > 0);
              return (
                <g class={`zone ${!city && zone === id ? 'on' : ''}`} onClick={() => pickZone(id)} role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') pickZone(id); }}>
                  <circle cx={x} cy={y} r={84} class="zone-sel" />
                  <text x={lx} y={ly} class="lbl">{id === 'ville' ? TOWN_NAMES[s.world.palier] : ZONES[id].court}</text>
                  <g transform={`translate(${lx},${ly + 22})`}>
                    <circle cx={-46} cy={-6} r={7} style={{ fill: tier }} class="tier-dot" />
                    <text x={-34} y={0} class="lbl-sub" text-anchor="start">{id === 'ville' ? 'égouts · ' : ''}danger {d}</text>
                  </g>
                  {layers.quests && nq > 0 && <g><circle cx={x + 64} cy={y - 52} r={17} class="badge-disc" /><text x={x + 64} y={y - 45} class="badge-text">{nq}</text></g>}
                  {layers.rivals && active.filter((r) => trips.some((tr) => tr.zone === id && tr.rival === r.id)).map((r, i) => (
                    <g><rect x={x - 72 + i * 22} y={y - 72} width={17} height={12} rx={2} style={{ fill: RIVAL_COLORS[r.profil] }} />
                      <line x1={x - 72 + i * 22} y1={y - 72} x2={x - 72 + i * 22} y2={y - 50} class="flag-pole" />
                      <title>{r.nom} : {trips.filter((tr) => tr.zone === id && tr.rival === r.id).length} sortie(s) ces 3 derniers jours</title></g>
                  ))}
                  {layers.pops && Object.keys(ZONES[id].especes).some((sp) => huntClosed(s, id, sp)) && (
                    <text x={lx - 74} y={ly} class="closed-mark"><title>Chasse fermée à une espèce devenue rare</title>⊘</text>
                  )}
                  {layers.pops && species.map((sp, i) => (
                    <g><rect x={lx - 50} y={ly + 32 + i * 11} width={100} height={7} rx={3} class="bar-bg" />
                      <rect x={lx - 50} y={ly + 32 + i * 11} width={popOf(s, id, sp)} height={7} rx={3} class={popOf(s, id, sp) > 80 ? 'bar-hot' : 'bar'} />
                      <title>{SPECIES[sp].nom} : {Math.round(popOf(s, id, sp))}</title></g>
                  ))}
                  {layers.plants && Object.keys(ZONES[id].plantes).map((pl, i) => (
                    <text x={lx + 62} y={ly - 16 + i * 18} class="plant">🌿 {Math.round(popOf(s, id, pl))}</text>
                  ))}
                </g>
              );
            })}
            {CITY_IDS.map((id) => {
              const [x, y] = ART[id];
              const [lx, ly] = LABEL[id];
              const guild = active.find((r) => rivalCity(r) === id);
              const st = cityState(s, id);
              const ne = s.board.filter((q) => q.dest === id || q.zone === CITIES[id].environs).length;
              const envD = zoneDanger(s, CITIES[id].environs);
              return (
                <g class={`city ${city === id ? 'on' : ''}`} onClick={() => pickCity(id)} role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') pickCity(id); }}>
                  <title>{CITIES[id].nom}, {CITIES[id].titre}{guild ? ` · siège de ${guild.nom}` : ''} · commerce {commerceLabel(st.commerce).nom}</title>
                  <circle cx={x} cy={y} r={70} class="city-hit" />
                  <circle cx={x} cy={y} r={76} class="zone-sel" />
                  <text x={lx} y={ly} class="lbl lbl-city">{CITIES[id].court}</text>
                  <rect x={lx - 40} y={ly + 9} width={80} height={7} rx={3} class="bar-bg" />
                  <rect x={lx - 40} y={ly + 9} width={0.8 * st.commerce} height={7} rx={3} class="trade-bar" />
                  <circle cx={lx + 50} cy={ly + 12} r={6} class="tier-dot" style={{ fill: TIER_COLORS[dangerTier(envD).idx] }}><title>Danger des environs : {envD}</title></circle>
                  {layers.rivals && guild && <g><line x1={lx + 52} y1={ly + 4} x2={lx + 52} y2={ly - 24} class="flag-pole" /><path d={`M${lx + 52} ${ly - 24} h18 l-4 6 l4 6 h-18 Z`} style={{ fill: RIVAL_COLORS[guild.profil] }} /></g>}
                  {layers.quests && ne > 0 && <g><circle cx={lx - CITIES[id].court.length * 6.5 - 24} cy={ly - 8} r={15} class="badge-disc" /><text x={lx - CITIES[id].court.length * 6.5 - 24} y={ly - 2} class="badge-text">{ne}</text></g>}
                </g>
              );
            })}
            {runs.map((r, i) => {
              const [x, y] = runPosition(r, i);
              const lead = s.adventurers.find((a) => a.id === r.leader);
              return (
                <g class={`team ${runId === r.id ? 'on' : ''}`} onClick={() => setRunId(r.id)} role="button" tabIndex={0}>
                  <circle cx={x} cy={y} r={12} style={{ fill: lead ? classColor(lead.classe) : 'var(--gold)' }} />
                  {r.quest.caravane && r.quest.caravane.length > 0 && <rect x={x + 8} y={y - 18} width={14} height={10} rx={2} class="caravan-mark" />}
                  <title>{r.quest.title}</title>
                </g>
              );
            })}
          </svg>
          <p class="hint">La pastille de chaque lieu donne son danger : vert calme, bleu tendu, ambre menaçant, rouge critique. Les équipes suivent les routes de la carte. ⊘ : chasse fermée à une espèce devenue rare (moins de 15).
            La barre dorée sous chaque ville voisine montre son commerce avec la tienne, ✕ une route coupée.
            Les points sont les équipes en quête ; les fanions, les guildes rivales, dans leur ville et dans les zones où elles sont sorties ces 3 derniers jours
            ({active.map((r, i) => <><span class="rival-chip" style={{ background: RIVAL_COLORS[r.profil] }} /> {r.nom}{rivalCity(r) ? ` (${CITIES[rivalCity(r)!].court})` : ''}{i < active.length - 1 ? ', ' : ''}</>)}).</p>
        </div>
        <div class="panel">
          {run ? (
            <>
              <h3>{run.quest.title}</h3>
              <div class="row">{run.members.map((id) => s.adventurers.find((a) => a.id === id)).filter(Boolean).map((m) => <span class="row"><ClassDot classe={m!.classe} />{m!.name}</span>)}</div>
              <p class="hint">{QUEST_TYPE_NAMES[run.quest.type]} · {run.stage === 'aller' ? 'en route' : run.stage === 'objectif' ? 'sur place' : 'sur le retour'} · départ {stamp(run.startedTick)}
                {run.quest.type === 'escorte' && run.stage !== 'retour' && <> · convoi {Math.max(0, run.convoyHp)} %</>}</p>
              {run.log.slice(-12).map((l) => <div class="hint"><small>{stamp(l.tick)}</small> <RichText text={l.text} /></div>)}
              <button class="link" onClick={() => setRunId(null)}>Revenir {city ? 'à la ville' : 'à la zone'}</button>
            </>
          ) : city ? (
            <CityPanel s={s} id={city} onRun={setRunId} />
          ) : !z || !zone ? (
            <>
              <h3>La région</h3>
              <p class="hint">Clique sur un lieu de la carte pour voir ses bêtes, ses plantes et ses quêtes, ou sur une équipe pour suivre sa quête.</p>
              <table class="data">
                <thead><tr><th>Lieu</th><th class="num">Danger</th><th class="num">Quêtes</th><th class="num">Équipes</th></tr></thead>
                <tbody>{REGION_ZONES.map((id) => (
                  <tr><td><button class="link" onClick={() => pickZone(id)}>{ZONES[id].nom}</button></td>
                    <td class="num"><span class="tier-chip" style={{ background: TIER_COLORS[dangerTier(zoneDanger(s, id)).idx] }} /> {zoneDanger(s, id)}</td>
                    <td class="num">{s.board.filter((q) => q.zone === id && q.type !== 'aide' && !q.dest).length}</td>
                    <td class="num">{runs.filter((r) => r.quest.zone === id && !r.quest.dest).length}</td></tr>
                ))}
                {CITY_IDS.map((id) => {
                  const env = CITIES[id].environs;
                  return (
                    <tr><td><button class="link" onClick={() => pickCity(id)}>{ZONES[env].nom}</button> <small class="hint">({CITIES[id].court})</small></td>
                      <td class="num"><span class="tier-chip" style={{ background: TIER_COLORS[dangerTier(zoneDanger(s, env)).idx] }} /> {zoneDanger(s, env)}</td>
                      <td class="num">{s.board.filter((q) => q.zone === env || q.dest === id).length}</td>
                      <td class="num">{runs.filter((r) => r.quest.zone === env || r.quest.dest === id).length}</td></tr>
                  );
                })}</tbody>
              </table>
            </>
          ) : (
            <>
              <div class="row"><h3 style={{ margin: 0 }}>{z.nom}</h3><span class="spacer" /><button class="btn ghost small" onClick={() => setZone(null)}>Fermer</button></div>
              <p class="hint">{z.trajet} h de trajet · danger {zoneDanger(s, zone)} ({dangerTier(zoneDanger(s, zone)).nom})
                {CITY_IDS.filter((id) => CITIES[id].route === zone).map((id) => <> · route de <button class="link" onClick={() => pickCity(id)}>{CITIES[id].nom}</button></>)}</p>
              <h4>Espèces</h4>
              {Object.keys(z.especes).filter((sp) => sp !== 'dragon' || popOf(s, zone, sp) > 0).map((sp) => (
                <div class="gauge-row"><span class="soft">{SPECIES[sp].nom}{huntClosed(s, zone, sp) && <> <span class="tag amber" title="Espèce devenue rare : plus de quête contre elle jusqu'à ce qu'elle remonte à 25.">chasse fermée</span></>}</span><Gauge value={popOf(s, zone, sp)} color={popOf(s, zone, sp) > 80 ? 'var(--seal)' : 'var(--sage)'} />
                  <span>{Math.round(popOf(s, zone, sp))}</span><Spark values={hist.map((h) => h.pops[zone]?.[sp] ?? 0)} /></div>
              ))}
              {Object.keys(z.plantes).length > 0 && <h4>Plantes</h4>}
              {Object.keys(z.plantes).map((pl) => (
                <div class="gauge-row"><span class="soft">{RESOURCES[pl].nom}</span><Gauge value={popOf(s, zone, pl)} color="var(--blue)" /><span>{Math.round(popOf(s, zone, pl))}</span></div>
              ))}
              <h4>Quêtes au tableau</h4>
              {s.board.filter((q) => q.zone === zone && q.type !== 'aide' && !q.dest).map((q) => <p class="news">{q.title} <small class="hint">rang {q.rang}</small></p>)}
              {s.board.filter((q) => q.zone === zone && q.type !== 'aide' && !q.dest).length === 0 && <p class="empty">Aucune.</p>}
              <h4>Guildes rivales (3 derniers jours)</h4>
              {trips.filter((t) => t.zone === zone).slice(-6).reverse().map((t) => (
                <p class="news"><span class="rival-chip" style={{ background: rivalOf(t.rival) ? RIVAL_COLORS[rivalOf(t.rival)!.profil] : 'var(--ink-faint)' }} /> {rivalOf(t.rival)?.nom ?? 'Une guilde'} : {t.text} <small class="hint">{stamp(t.tick)}</small></p>
              ))}
              {trips.filter((t) => t.zone === zone).length === 0 && <p class="empty">Aucune sortie.</p>}
              <h4>Équipes sur place ou en route</h4>
              {runs.filter((r) => r.quest.zone === zone).map((r) => (
                <button class="link" onClick={() => setRunId(r.id)}>{r.quest.title}</button>
              ))}
              {runs.filter((r) => r.quest.zone === zone).length === 0 && <p class="empty">Personne.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
