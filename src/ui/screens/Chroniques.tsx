// Les Chroniques de la ville (GDD 7.5.7) : une gazette quotidienne du monde vivant.
import { RESOURCES } from '../../sim/data';
import { clockLabel, dayOf, money, seasonOf, SEASONS, stamp } from '../../sim/format';
import { odFactor } from '../../sim/market';
import type { Decision, GameState } from '../../sim/types';
import { dangerTier, GAZETTE, PALIER_NAMES, referenceTaxRate, repairCost, SEASON_EFFECTS } from '../../sim/world';
import { game, lastError } from '../store';

const H = 24;

/** Courbes simples sur les derniers jours (7.8). */
export function LineChart({ series, height = 120, max = 100 }: { series: { label: string; color: string; values: number[] }[]; height?: number; max?: number }) {
  const n = Math.max(...series.map((x) => x.values.length));
  if (n < 2) return <p class="empty">Les courbes apparaîtront après quelques jours.</p>;
  const W = 600;
  const x = (i: number) => (i / (n - 1)) * (W - 30) + 25;
  const top = Math.max(1, max);
  const y = (v: number) => height - 14 - (Math.min(v, top) / top) * (height - 24);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} class="chart" role="img" aria-label={series.map((s) => s.label).join(', ')}>
        {[0, top / 2, top].map((v) => <g><line x1={25} x2={W - 5} y1={y(v)} y2={y(v)} class="gridline" /><text x={0} y={y(v) + 4} class="axis">{Math.round(v)}</text></g>)}
        {series.map((sr) => (
          <polyline fill="none" stroke={sr.color} stroke-width={2} stroke-linejoin="round"
            points={sr.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
        ))}
      </svg>
      <div class="row legend">{series.map((sr) => <span><i style={{ background: sr.color }} />{sr.label}</span>)}</div>
    </div>
  );
}

export function DecisionCard({ s, d }: { s: GameState; d: Decision }) {
  const left = Math.max(0, d.deadline - s.tick);
  return (
    <div class="decision">
      <h4>{d.title}</h4>
      <p>{d.text}</p>
      <div class="row">
        {d.options.map((o) => (
          <button class={`btn small ${o.id === d.defaut ? 'ghost' : 'sage'}`} disabled={!!o.cost && o.cost > s.treasury}
            title={o.cost && o.cost > s.treasury ? 'Trésorerie insuffisante' : ''}
            onClick={() => game.command({ type: 'decide', id: d.id, option: o.id })}>{o.label}</button>
        ))}
      </div>
      <p class="hint">Sans réponse dans {left} h, la guilde choisira : « {d.options.find((o) => o.id === d.defaut)?.label} ».</p>
    </div>
  );
}

export function Chroniques({ s }: { s: GameState }) {
  const w = s.world;
  const day = dayOf(s.tick);
  const recent = (rub: string, days: number) => w.news.filter((n) => n.rubrique === rub && n.tick > s.tick - days * H).reverse();
  const rumors = w.rumors.filter((r) => r.tick <= s.tick && r.fireTick > s.tick - H).reverse();
  const err = lastError();
  const market = Object.keys(s.market)
    .map((id) => ({ id, f: odFactor(s, id), cours: s.market[id].cours }))
    .filter((m) => Math.abs(m.f - 1) > 0.25)
    .sort((a, b) => Math.abs(b.f - 1) - Math.abs(a.f - 1)).slice(0, 6);
  const modes = w.mods.filter((m) => m.key.startsWith('demande:') && !m.key.startsWith('demande:cat') && m.until > s.tick);
  const damaged = (Object.keys(w.damaged) as (keyof typeof w.damaged)[]).filter((r) => w.damaged[r]);
  const roomName = { dortoirs: 'Dortoirs', refectoire: 'Réfectoire', cuisine: 'Cuisine', infirmerie: 'Infirmerie', terrain: "Terrain d'entraînement" };
  const tier = dangerTier(s.danger);
  return (
    <div>
      <div class="screen-head">
        <h2 class="gazette">{GAZETTE[w.palier]}</h2>
        <span class="hint">{clockLabel(s.tick)} · palier {PALIER_NAMES[w.palier]}{w.palierStreak > 0 ? ` (en mouvement depuis ${w.palierStreak} j)` : ''}</span>
      </div>

      {w.decisions.length > 0 && (
        <div class="panel accent">
          <h3>Décisions en attente</h3>
          {w.decisions.map((d) => <DecisionCard s={s} d={d} />)}
          {err && <p class="hint" style={{ color: 'var(--seal)' }}>{err}</p>}
        </div>
      )}

      <div class="grid2">
        <div class="panel">
          <h3>À la une</h3>
          {w.assault && <p class="alert">⚔ Assaut des {w.assault.species} : {w.assault.wave}/3 vague(s), {w.assault.wins} repoussée(s).{w.assault.wave === 0 ? ` Première vague ${stamp(w.assault.startTick)}.` : ''}</p>}
          {w.epidemic && <p class="alert">☣ Épidémie ({w.epidemic.source}), jusqu'au {stamp(w.epidemic.until)} au plus tard. Le Temple est fermé.</p>}
          {damaged.map((r) => (
            <p class="alert">🔨 {roomName[r]} endommagé(e) : capacité −50 %.
              <button class="btn small" disabled={repairCost(s, r) > s.treasury} onClick={() => game.command({ type: 'repairRoom', room: r })}>Réparer ({money(repairCost(s, r))})</button></p>
          ))}
          {w.events.length > 0 && <ul class="plain">{w.events.map((e) => (
            <li><strong>{e.nom}</strong> <small class="hint">{e.until > s.tick + H ? `encore ${Math.ceil((e.until - s.tick) / H)} j` : 'aujourd\'hui'}</small>
              {e.text && !e.text.startsWith(e.nom) && <div>{e.text}</div>}</li>
          ))}</ul>}
          {recent('une', 7).slice(0, 8).map((n) => <p class="news"><small>J{dayOf(n.tick)}</small> {n.text}</p>)}
          {recent('une', 7).length === 0 && w.events.length === 0 && <p class="empty">Rien de notable cette semaine.</p>}
        </div>
        <div class="panel">
          <h3>La région</h3>
          <p><strong>{SEASONS[seasonOf(s.tick)]}</strong> : {SEASON_EFFECTS[seasonOf(s.tick)]}</p>
          <p>Danger <strong>{s.danger}</strong> ({tier.nom}) · Prospérité <strong>{Math.round(s.prosperity)}</strong></p>
          <LineChart series={[
            { label: 'Danger', color: 'var(--seal)', values: w.history.slice(-56).map((h) => h.danger) },
            { label: 'Prospérité', color: 'var(--sage)', values: w.history.slice(-56).map((h) => h.prosperity) },
          ]} />
          <p class="hint">La Prospérité suit chaque jour 5 % de l'écart avec sa cible : 50, moins l'insécurité, plus le commerce des escortes, l'argent dépensé en ville et la saison. La ville change de palier après 14 jours au-delà de 40 ou de 75.</p>
        </div>
      </div>

      <div class="grid2">
        <div class="panel">
          <h3>On raconte que…</h3>
          {rumors.length === 0 ? <p class="empty">Aucune rumeur ces jours-ci.</p>
            : rumors.map((r) => <p class="news rumor">« {r.text} » <small class="hint">J{dayOf(r.tick)}</small></p>)}
          <p class="hint">Les rumeurs disent souvent vrai… mais pas toujours.</p>
        </div>
        <div class="panel">
          <h3>Le marché</h3>
          {modes.map((m) => <p class="news">👑 La noblesse s'arrache {RESOURCES[m.key.slice(8)]?.nom.toLowerCase() ?? m.key.slice(8)} (demande ×{m.mult}) jusqu'au J{dayOf(m.until)}.</p>)}
          {market.length === 0 && modes.length === 0 ? <p class="empty">Des cours sans surprise.</p> : (
            <table class="data"><tbody>{market.map((m) => (
              <tr><td>{RESOURCES[m.id].nom}</td><td class="num">{money(m.cours)}</td>
                <td><span class={`tag ${m.f > 1 ? 'sage' : 'seal'}`}>{m.f > 1 ? 'recherché' : 'en surplus'}</span></td></tr>
            ))}</tbody></table>
          )}
        </div>
      </div>

      <div class="grid2">
        <div class="panel">
          <h3>Les guildes</h3>
          <table class="data">
            <thead><tr><th>Guilde</th><th class="num">Renommée</th><th class="num">Membres</th><th class="num">Tarifs</th><th class="num">Taxe</th></tr></thead>
            <tbody>
              <tr><td><strong>Ta guilde</strong></td><td class="num">{Math.round(s.renown)}</td><td class="num">{s.adventurers.length}</td><td class="num">—</td><td class="num">{Math.round(s.taxRate * 100)} %</td></tr>
              {w.rivals.map((r) => (
                <tr><td>{r.nom}{r.bankruptSince !== null && <span class="tag seal"> en faillite</span>}<div class="hint">{r.profil === 'prestige' ? 'Prestigieuse, proche de la noblesse' : r.profil === 'chasseurs' ? 'Chasseurs et cueilleurs des bois et des marais' : 'Mercenaires bon marché'}</div></td>
                  <td class="num">{Math.round(r.renown)}</td><td class="num">{r.size}</td><td class="num">×{r.tarifs.toFixed(1)}</td><td class="num">{Math.round(r.taux * 100)} %</td></tr>
              ))}
            </tbody>
          </table>
          <p class="hint">Taux de taxe de référence de la région : {Math.round(referenceTaxRate(s) * 100)} %. Au-delà, tes aventuriers grognent. Les recrues choisissent leur guilde selon la renommée, la taxe et les tarifs.</p>
          {recent('guildes', 14).slice(0, 6).map((n) => <p class="news"><small>J{dayOf(n.tick)}</small> {n.text}</p>)}
        </div>
        <div class="panel">
          <h3>Exploits et nécrologie</h3>
          {recent('exploits', 14).length === 0 ? <p class="empty">Ni héros ni deuil ces deux dernières semaines.</p>
            : recent('exploits', 14).slice(0, 10).map((n) => <p class="news"><small>J{dayOf(n.tick)}</small> {n.text}</p>)}
        </div>
      </div>
      <p class="hint">Jour {day}.</p>
    </div>
  );
}
