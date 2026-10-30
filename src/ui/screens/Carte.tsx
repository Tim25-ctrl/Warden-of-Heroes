// La Carte régionale (GDD 7.5.6, 4.10) : zones colorées selon leur Danger, équipes en route, calques.
import { useState } from 'preact/hooks';
import { RESOURCES, SPECIES, ZONE_IDS, ZONES } from '../../sim/data';
import { stamp } from '../../sim/format';
import { huntClosed, popOf, zoneDanger } from '../../sim/populations';
import { QUEST_TYPE_NAMES } from '../../sim/quests';
import type { GameState, QuestRun, Rival } from '../../sim/types';
import { dangerTier } from '../../sim/world';
import { ClassDot, classColor, Gauge, RichText } from '../components';

const POS: Record<string, [number, number]> = {
  ville: [90, 220], foret: [250, 150], collines: [400, 80], marais: [250, 320], ruines: [440, 270], pics: [580, 130],
};
const TIER_COLORS = ['var(--sage)', 'var(--blue)', 'var(--amber)', 'var(--seal)', 'var(--seal)'];
/** Couleur des fanions des guildes rivales, selon leur profil. */
const RIVAL_COLORS: Record<Rival['profil'], string> = { prestige: 'var(--gold)', mercenaires: 'var(--c-voleur)', chasseurs: 'var(--c-rodeur)' };

/** Position d'une équipe sur la route ville → zone, selon l'étape de sa quête. */
function runPosition(run: QuestRun): [number, number] {
  const [x0, y0] = POS.ville;
  const [x1, y1] = POS[run.quest.zone] ?? POS.ville;
  const trajet = Math.max(1, ZONES[run.quest.zone].trajet);
  let p = 0;
  if (run.stage === 'aller') p = 1 - Math.min(1, run.stageHours / trajet);
  else if (run.stage === 'objectif') p = 1;
  else if (run.stage === 'retour') p = Math.min(1, run.stageHours / trajet);
  p = Math.max(0.2, Math.min(0.75, p));   // reste sur la route, sans masquer le nom des zones
  return [x0 + (x1 - x0) * p, y0 + (y1 - y0) * p];
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 60},${18 - (v / 100) * 16}`).join(' ');
  return <svg viewBox="0 0 60 20" class="spark" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width={1.5} points={pts} /></svg>;
}

export function Carte({ s }: { s: GameState }) {
  const [zone, setZone] = useState<string>('foret');
  const [runId, setRunId] = useState<number | null>(null);
  const [layers, setLayers] = useState({ pops: true, quests: true, plants: false, rivals: true });
  const runs = s.runs.filter((r) => r.stage !== 'preparation');
  const run = runs.find((r) => r.id === runId) ?? null;
  const toggle = (k: keyof typeof layers) => setLayers({ ...layers, [k]: !layers[k] });
  const z = ZONES[zone];
  const hist = s.world.popHistory;
  const trips = s.world.rivalTrips ?? [];
  const rivalOf = (id: string) => s.world.rivals.find((r) => r.id === id);
  return (
    <div>
      <div class="screen-head"><h2>Carte régionale</h2><span class="hint">Clique sur une zone ou sur une équipe. Tu ne peux pas rappeler une équipe : tu ne fais que suivre.</span></div>
      <div class="row" style={{ marginBottom: 8 }}>
        <label class="row"><input type="checkbox" checked={layers.pops} onChange={() => toggle('pops')} />Populations</label>
        <label class="row"><input type="checkbox" checked={layers.plants} onChange={() => toggle('plants')} />Plantes</label>
        <label class="row"><input type="checkbox" checked={layers.quests} onChange={() => toggle('quests')} />Quêtes du tableau</label>
        <label class="row"><input type="checkbox" checked={layers.rivals} onChange={() => toggle('rivals')} />Guildes rivales</label>
      </div>
      <div class="split-map">
        <div class="panel map-panel">
          <svg viewBox="0 0 660 400" class="map" role="img" aria-label="Carte de la région et des équipes en quête">
            {ZONE_IDS.filter((id) => id !== 'ville').map((id) => (
              <line x1={POS.ville[0]} y1={POS.ville[1]} x2={POS[id][0]} y2={POS[id][1]} class="road" />
            ))}
            {ZONE_IDS.map((id) => {
              const d = zoneDanger(s, id);
              const [x, y] = POS[id];
              const nq = s.board.filter((q) => q.zone === id && q.type !== 'aide').length;
              return (
                <g class={`zone ${zone === id ? 'on' : ''}`} onClick={() => { setZone(id); setRunId(null); }} role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') setZone(id); }}>
                  <circle cx={x} cy={y} r={id === 'ville' ? 30 : 38} style={{ fill: TIER_COLORS[dangerTier(d).idx] }} class="zone-disc" />
                  <text x={x} y={y - 2} class="zone-name">{ZONES[id].court}</text>
                  <text x={x} y={y + 14} class="zone-sub">danger {d}</text>
                  {layers.quests && nq > 0 && <g><circle cx={x + 30} cy={y - 28} r={11} class="badge-disc" /><text x={x + 30} y={y - 24} class="badge-text">{nq}</text></g>}
                  {layers.rivals && s.world.rivals.filter((r) => trips.some((t) => t.zone === id && t.rival === r.id)).map((r, i) => (
                    <g><rect x={x - 40 + i * 14} y={y - 40} width={11} height={8} rx={1.5} style={{ fill: RIVAL_COLORS[r.profil] }} />
                      <line x1={x - 40 + i * 14} y1={y - 40} x2={x - 40 + i * 14} y2={y - 26} class="flag-pole" />
                      <title>{r.nom} : {trips.filter((t) => t.zone === id && t.rival === r.id).length} sortie(s) ces 3 derniers jours</title></g>
                  ))}
                  {layers.pops && Object.keys(ZONES[id].especes).some((sp) => huntClosed(s, id, sp)) && (
                    <text x={x - 44} y={y + 4} class="closed-mark"><title>Chasse fermée à une espèce devenue rare</title>⊘</text>
                  )}
                  {layers.pops && Object.keys(ZONES[id].especes).filter((sp) => sp !== 'dragon' || popOf(s, id, sp) > 0).map((sp, i) => (
                    <g><rect x={x - 34} y={y + 44 + i * 8} width={68} height={5} class="bar-bg" />
                      <rect x={x - 34} y={y + 44 + i * 8} width={0.68 * popOf(s, id, sp)} height={5} class={popOf(s, id, sp) > 80 ? 'bar-hot' : 'bar'} /></g>
                  ))}
                  {layers.plants && Object.keys(ZONES[id].plantes).map((pl, i) => (
                    <text x={x + 44} y={y - 10 + i * 11} class="plant">🌿 {Math.round(popOf(s, id, pl))}</text>
                  ))}
                </g>
              );
            })}
            {runs.map((r) => {
              const [x, y] = runPosition(r);
              const lead = s.adventurers.find((a) => a.id === r.leader);
              return (
                <g class={`team ${runId === r.id ? 'on' : ''}`} onClick={() => setRunId(r.id)} role="button" tabIndex={0}>
                  <circle cx={x} cy={y} r={8} style={{ fill: lead ? classColor(lead.classe) : 'var(--gold)' }} />
                  <title>{r.quest.title}</title>
                </g>
              );
            })}
          </svg>
          <p class="hint">Couleur des zones : vert calme, bleu tendu, ambre menaçant, rouge critique. ⊘ : chasse fermée à une espèce devenue rare (moins de 15). Les points sont les équipes en quête ; les fanions, les sorties des guildes rivales ces 3 derniers jours
            ({s.world.rivals.filter((r) => r.bankruptSince === null).map((r, i) => <><span class="rival-chip" style={{ background: RIVAL_COLORS[r.profil] }} /> {r.nom}{i < s.world.rivals.filter((x) => x.bankruptSince === null).length - 1 ? ', ' : ''}</>)}).
            Elles chassent les bêtes abondantes et vendent leur butin en ville.</p>
        </div>
        <div class="panel">
          {run ? (
            <>
              <h3>{run.quest.title}</h3>
              <div class="row">{run.members.map((id) => s.adventurers.find((a) => a.id === id)).filter(Boolean).map((m) => <span class="row"><ClassDot classe={m!.classe} />{m!.name}</span>)}</div>
              <p class="hint">{QUEST_TYPE_NAMES[run.quest.type]} · {run.stage === 'aller' ? 'en route' : run.stage === 'objectif' ? 'sur place' : 'sur le retour'} · départ {stamp(run.startedTick)}</p>
              {run.log.slice(-12).map((l) => <div class="hint"><small>{stamp(l.tick)}</small> <RichText text={l.text} /></div>)}
              <button class="link" onClick={() => setRunId(null)}>Revenir à la zone</button>
            </>
          ) : (
            <>
              <h3>{z.nom}</h3>
              <p class="hint">{z.trajet} h de trajet · danger {zoneDanger(s, zone)} ({dangerTier(zoneDanger(s, zone)).nom})</p>
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
              {s.board.filter((q) => q.zone === zone && q.type !== 'aide').map((q) => <p class="news">{q.title} <small class="hint">rang {q.rang}</small></p>)}
              {s.board.filter((q) => q.zone === zone && q.type !== 'aide').length === 0 && <p class="empty">Aucune.</p>}
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
