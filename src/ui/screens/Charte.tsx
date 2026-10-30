// La Charte de la guilde et les hauts faits (GDD 7.5.10), avec le Panthéon (6.7).
import { useState } from 'preact/hooks';
import { CLASSES } from '../../sim/data';
import { money, stamp } from '../../sim/format';
import { PRIVILEGES, WORKS, workBlocked, workState } from '../../sim/charter';
import { ACHIEVEMENTS, DIFFICULTY_NAMES, nextSeal, sealConditions, sealOf, SEALS } from '../../sim/legend';
import type { GameState } from '../../sim/types';
import { Gauge, Tabs } from '../components';
import { PANTHEON_MAX, removeFromPantheon } from '../saves';
import { game, getMeta, lastError, setMeta } from '../store';

const WEEK_LABELS: Record<string, string> = {
  prestige: 'Prestige des membres', salles: 'Qualité des salles', prix: 'Réputation des prix', fiscalite: 'Fiscalité', erosion: 'Érosion (pas de quête D ou plus)',
};

function Seal({ s }: { s: GameState }) {
  const cur = sealOf(s.rank);
  const next = nextSeal(s);
  const conds = sealConditions(s);
  const week = Object.entries(s.legend.week);
  return (
    <div class="grid2">
      <div class="panel">
        <h3>{cur.nom}</h3>
        <p>Renommée : <strong>{Math.round(s.renown)} points</strong>{next && <> · {next.nom} à {next.points} points</>}</p>
        {next && <Gauge value={Math.min(100, (s.renown / next.points) * 100)} color="var(--gold)" />}
        <div class="seals">{SEALS.map((x) => (
          <span class={`seal-chip ${x.rang <= s.rank ? 'on' : ''}`} title={x.nom}>{x.nom.replace('Sceau ', '')}</span>
        ))}</div>
        {next ? (
          <>
            <h4>Pour le {next.nom}</h4>
            <ul class="checklist">{conds.map((c) => <li class={c.ok ? 'ok' : ''}><span aria-hidden="true">{c.ok ? '✔' : '○'}</span> {c.label}{c.ok ? '' : ' (à faire)'}</li>)}</ul>
            {s.legend.heraldTick !== null && <p class="alert">Le héraut royal viendra apposer le sceau {stamp(s.legend.heraldTick)}.</p>}
          </>
        ) : <p class="alert">La guilde porte le plus haut des Sceaux royaux. La partie continue en bac à sable.</p>}
        <p class="hint">Un sceau acquis ne se perd jamais. Chaque sceau agrandit le tableau, augmente le plafond de la banque, attire de meilleurs professeurs et, à partir du Sceau d'Argent, ouvre les niveaux 4 et 5 des salles. La taxe royale augmente avec lui.</p>
      </div>
      <div class="panel">
        <h3>Bilan de la semaine</h3>
        {week.length === 0 ? <p class="empty">Le premier bilan aura lieu le Jour du Roi.</p> : (
          <table class="data"><tbody>
            {week.map(([k, v]) => <tr><td>{WEEK_LABELS[k] ?? k}</td><td class="num" style={{ color: v >= 0 ? 'var(--sage)' : 'var(--seal)' }}>{v >= 0 ? '+' : ''}{v.toFixed(1)}</td></tr>)}
            <tr><td><strong>Total</strong></td><td class="num"><strong>{week.reduce((a, [, v]) => a + v, 0).toFixed(1)}</strong></td></tr>
          </tbody></table>
        )}
        <p class="hint">Chaque Jour du Roi : prestige des 10 aventuriers les plus respectés, qualité des salles, prix pratiqués, taxe sur le butin. Sans quête de rang D ou plus réussie dans la semaine, la renommée s'érode de 1 %.</p>
        <p class="hint">Difficulté : {DIFFICULTY_NAMES[s.difficulty.id]}{s.difficulty.changed ? ' (modifiée en cours de partie : Défis désactivés)' : ''}.</p>
      </div>
    </div>
  );
}

function Achievements({ s }: { s: GameState }) {
  const meta = getMeta();
  const cats = [...new Set(Object.values(ACHIEVEMENTS).map((a) => a.cat))];
  const here = Object.keys(s.legend.achievements).length;
  const ever = Object.keys(meta?.achievements ?? {}).length;
  return (
    <div class="panel">
      <h3>Hauts faits</h3>
      <p class="hint">Purement honorifiques, conservés d'une partie à l'autre. Cette partie : {here} · toutes parties : {ever} sur {Object.keys(ACHIEVEMENTS).length}.</p>
      {cats.map((cat) => (
        <div>
          <h4>{cat}</h4>
          <div class="achievements">{Object.entries(ACHIEVEMENTS).filter(([, a]) => a.cat === cat).map(([id, a]) => {
            const now = s.legend.achievements[id];
            const before = meta?.achievements[id];
            return (
              <div class={`achievement ${now !== undefined ? 'on' : before ? 'past' : ''}`}>
                <strong>{now !== undefined ? '★ ' : before ? '☆ ' : ''}{a.nom}</strong>
                <div class="hint">{a.texte}</div>
                <small class="hint">{now !== undefined ? `Obtenu ${stamp(now)}` : before ? `Obtenu dans une autre partie (${before.game})` : 'À obtenir'}</small>
              </div>
            );
          })}</div>
        </div>
      ))}
    </div>
  );
}

function Pantheon({ s }: { s: GameState }) {
  const meta = getMeta();
  const [pick, setPick] = useState<number>(s.adventurers[0]?.id ?? 0);
  const err = lastError();
  const entries = meta?.pantheon ?? [];
  return (
    <div class="panel">
      <h3>Le Panthéon</h3>
      <p class="hint">Les héros de toutes tes parties : niveau 25 ou plus, tueurs de dragon, vainqueurs d'une bête légendaire, et un aventurier de ton choix par partie. {entries.length} / {PANTHEON_MAX} places. Une recrue se présente parfois comme leur descendante.</p>
      {s.legend.pantheonPick === null && s.adventurers.length > 0 && (
        <div class="row">
          <label class="field">Inscrire un aventurier de cette partie
            <select value={pick} onChange={(e) => setPick(Number((e.target as HTMLSelectElement).value))}>
              {s.adventurers.map((a) => <option value={a.id}>{a.name} ({CLASSES[a.classe].nom}, niv. {a.level})</option>)}
            </select>
          </label>
          <button class="btn sage" onClick={() => game.command({ type: 'pantheonPick', id: pick })}>Inscrire</button>
        </div>
      )}
      {err && <p class="hint" style={{ color: 'var(--seal)' }}>{err}</p>}
      {entries.length === 0 ? <p class="empty">Le Panthéon est encore vide.</p> : (
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Héros</th><th>Classe</th><th class="num">Niveau</th><th>Hauts faits</th><th>Partie</th><th /></tr></thead>
          <tbody>{entries.map((e) => (
            <tr><td><strong>{e.name}</strong>{e.chosen && <span class="tag amber"> choisi</span>}</td><td>{CLASSES[e.classe as keyof typeof CLASSES]?.nom ?? e.classe}</td>
              <td class="num">{e.level}</td><td><small>{e.reason}</small></td><td><small>{e.guild}</small></td>
              <td><button class="btn ghost small" onClick={() => removeFromPantheon(e.key).then(setMeta)}>Retirer</button></td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

/** Œuvres pour la ville et privilèges de Sceau (GDD 6.10, 6.11). */
function Works({ s }: { s: GameState }) {
  const err = lastError();
  return (
    <div class="grid2">
      <div class="panel">
        <h3>Œuvres pour la ville</h3>
        <p class="hint">De grands chantiers que la guilde finance en ville : chacun ne se construit qu'une fois, rapporte de la renommée et laisse un effet durable.</p>
        {WORKS.map((w) => {
          const st = workState(s, w.id);
          const why = workBlocked(s, w);
          const site = s.works?.find((x) => x.id === w.id);
          return (
            <div class="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <strong>{w.nom}</strong> <small>{money(w.cout)} · {w.jours} jours</small>
                <div class="hint">{w.effet}{w.renommee ? ` · renommée +${w.renommee}` : ''}</div>
              </div>
              {st === 'fini' ? <span class="tag sage">achevée</span>
                : st === 'chantier' ? <span class="tag amber">en chantier, fin {stamp(site!.endTick)}</span>
                : <button class="btn small seal" disabled={!!why} title={why ?? ''} onClick={() => game.command({ type: 'buyWork', id: w.id })}>{why && s.rank < w.sceau ? why.replace('Exige le ', '') : 'Financer'}</button>}
            </div>
          );
        })}
        {err && <p class="hint" style={{ color: 'var(--seal)' }}>{err}</p>}
      </div>
      <div class="panel">
        <h3>Privilèges de Sceau</h3>
        <p class="hint">À chaque nouveau Sceau, la Couronne propose trois privilèges ; tu en choisis un, pour toute la partie.</p>
        {(s.privileges ?? []).length === 0 ? <p class="empty">Aucun privilège pour l'instant : le premier viendra avec le Sceau de Fer.</p>
          : (s.privileges ?? []).map((id) => { const p = PRIVILEGES.find((x) => x.id === id)!; return <p><span class="tag gold">{p.nom}</span> {p.effet}</p>; })}
        <h4 style={{ marginTop: 12 }}>Les privilèges possibles</h4>
        <ul class="plain">{PRIVILEGES.map((p) => <li class={s.privileges?.includes(p.id) ? '' : 'soft'}><strong>{p.nom}</strong> : {p.effet}</li>)}</ul>
      </div>
    </div>
  );
}

export function Charte({ s }: { s: GameState }) {
  const [tab, setTab] = useState<'sceau' | 'oeuvres' | 'hauts' | 'pantheon'>('sceau');
  return (
    <div>
      <div class="screen-head"><h2>La Charte de la guilde</h2><span class="hint">{sealOf(s.rank).nom} · {Math.round(s.renown)} points de renommée</span></div>
      <Tabs value={tab} onChange={setTab} tabs={[['sceau', 'Sceaux et renommée'], ['oeuvres', 'Œuvres et privilèges'], ['hauts', 'Hauts faits'], ['pantheon', 'Panthéon']]} />
      {tab === 'sceau' && <Seal s={s} />}
      {tab === 'oeuvres' && <Works s={s} />}
      {tab === 'hauts' && <Achievements s={s} />}
      {tab === 'pantheon' && <Pantheon s={s} />}
    </div>
  );
}
