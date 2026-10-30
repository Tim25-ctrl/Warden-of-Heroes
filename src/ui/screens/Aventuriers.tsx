// Écran des aventuriers : candidats à la porte, liste, fiche détaillée (GDD 7.5.2).
import { useState } from 'preact/hooks';
import {
  attackOf, capacityOf, defenseOf, gearBonus, powerOf, pvMax, TIER_NAMES, visibleTraits, xpRequired,
} from '../../sim/adventurers';
import { ailmentLabel } from '../../sim/ailments';
import { ATTR_NAMES, BUFFS, CLASSES, SKILL_NAMES, TRAITS } from '../../sim/data';
import { relationsOf, relStatus, REL_NAMES, teamCohesion, teamOf } from '../../sim/social';
import { cotisationPrice, tolerance } from '../../sim/economy';
import { money, stamp } from '../../sim/format';
import { departureDesire } from '../../sim/lifecycle';
import type { Adventurer, AttrId, GameState, SkillId } from '../../sim/types';
import { ACTIVITY_LABELS, ClassDot, Gauge, GaugeRow, Money, NumField, plain, useNav } from '../components';
import { game } from '../store';

type SortKey = 'name' | 'level' | 'gold' | 'morale' | 'loyalty' | 'griefs';

const STATUS: Record<Adventurer['status'], [string, string]> = {
  actif: ['', ''],
  mecontent: ['Mécontent', 'amber'],
  depart: ['Sur le départ', 'seal'],
};

function Candidates({ s }: { s: GameState }) {
  if (s.doorCandidates.length === 0) return null;
  const fee = cotisationPrice(s);
  return (
    <div class="panel">
      <h3>À la porte</h3>
      <p class="hint">Chaque candidat attend une journée. Cotisation d'inscription : {money(fee)} (réglable au comptoir). Tu ne vois que son premier trait.</p>
      <div class="grid3">
        {s.doorCandidates.map((c) => (
          <div class="panel flat" style={{ marginBottom: 0 }}>
            <div class="row"><ClassDot classe={c.classe} /><strong>{c.name}</strong><span class="spacer" /><small>niv {c.level}</small></div>
            <div class="soft">{CLASSES[c.classe].nom}, {c.age} ans · {TRAITS[c.traits[0]].nom} · ?</div>
            <div class="hint">{(Object.keys(c.attrs) as AttrId[]).map((k) => `${k} ${c.attrs[k]}`).join(' · ')}</div>
            <div class="hint">Bourse : {money(c.gold)} · repart {stamp(c.doorUntil)}</div>
            <div class="row" style={{ marginTop: 6 }}>
              <button class="btn sage small" onClick={() => game.command({ type: 'acceptCandidate', id: c.id })}>Accepter</button>
              <button class="btn ghost small" onClick={() => game.command({ type: 'refuseCandidate', id: c.id })}>Refuser</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Fiche({ s, a }: { s: GameState; a: Adventurer }) {
  const nav = useNav();
  const [confirm, setConfirm] = useState(false);
  const team = teamOf(s, a.teamId);
  const rels = relationsOf(s, a.id);
  const c = CLASSES[a.classe];
  const traits = visibleTraits(a, s.tick);
  const run = a.runId !== null ? s.runs.find((r) => r.id === a.runId) : null;
  const envie = departureDesire(a);
  const thoughts = [...a.thoughts].reverse();
  return (
    <div class="panel detail-drawer">
      <div class="row">
        <ClassDot classe={a.classe} />
        <h3 style={{ margin: 0 }}>{a.name}</h3>
        <span class="spacer" />
        {STATUS[a.status][0] && <span class={`tag ${STATUS[a.status][1]}`}>{STATUS[a.status][0]}</span>}
      </div>
      <p class="soft">{c.nom} de niveau {a.level}, {a.age} ans. {ACTIVITY_LABELS[a.activity.kind]}{run ? ` : « ${run.quest.title} »` : ''}.</p>
      <div class="row" style={{ marginBottom: 8 }}>
        {traits.map((t) => <span class="tag blue" title={TRAITS[t].description}>{TRAITS[t].nom}</span>)}
        {traits.length < a.traits.length && <span class="tag" title={`Révélé ${stamp(a.traitRevealTick)}`}>trait caché</span>}
      </div>
      <GaugeRow label="Expérience" value={a.xp} max={xpRequired(a.level)} suffix={`${Math.round((a.xp / xpRequired(a.level)) * 100)} %`} color="var(--gold)" />
      <div class="grid2" style={{ gap: 12 }}>
        <div>
          <h4>Jauges</h4>
          <GaugeRow label="Santé" value={a.hp} max={pvMax(a)} suffix={`${Math.round(a.hp)}/${pvMax(a)}`} />
          <GaugeRow label="Énergie" value={a.energy} />
          <GaugeRow label="Faim" value={a.hunger} />
          <GaugeRow label="Moral" value={a.morale} />
          <h4 style={{ marginTop: 10 }}>Vie sociale</h4>
          <GaugeRow label="Fierté" value={a.fierte} color="var(--gold)" />
          <GaugeRow label="Respect." value={a.respect} color="var(--blue)" />
          <GaugeRow label="Loyauté" value={a.loyalty} color="var(--sage)" />
          <GaugeRow label="Grief prix" value={a.griefPrix} max={60} color="var(--seal)" />
          <GaugeRow label="Grief taxe" value={a.griefFiscal} max={60} color="var(--seal)" />
          <p class="hint">Envie de partir : {Math.round(envie)} (mécontent à 30, départ à 60).</p>
        </div>
        <div>
          <h4>Attributs</h4>
          {(Object.keys(a.attrs) as AttrId[]).map((k) => (
            <div class="row" style={{ justifyContent: 'space-between' }}><span class="soft">{ATTR_NAMES[k]}</span><strong>{a.attrs[k]}</strong></div>
          ))}
          <h4 style={{ marginTop: 10 }}>Compétences</h4>
          {(Object.keys(a.skills) as SkillId[]).map((k) => (
            <div class="row" style={{ justifyContent: 'space-between' }}><span class="soft">{SKILL_NAMES[k]}</span><strong>{a.skills[k]}</strong></div>
          ))}
        </div>
      </div>
      {a.states.length > 0 && (
        <>
          <h4 style={{ marginTop: 10 }}>États</h4>
          <div class="row">{a.states.map((x) => (
            <span class={`tag ${x.gravite >= 2 ? 'seal' : x.gravite === 1 ? 'amber' : ''}`} title={`depuis ${stamp(x.since)}${x.bandaged ? ', pansé' : ''}`}>{ailmentLabel(x)}{x.bandaged ? ' (pansé)' : ''}</span>
          ))}</div>
        </>
      )}
      <h4 style={{ marginTop: 10 }}>Combat et inventaire</h4>
      <p class="soft">
        Attaque {Math.round(attackOf(a))} · Défense {Math.round(defenseOf(a))} · Puissance {Math.round(powerOf(a))} · Portage {capacityOf(a)}<br />
        Arme : {TIER_NAMES[a.weapon.tier]} (+{gearBonus(a.weapon)}, usure {100 - a.weapon.dur} %) · Armure : {TIER_NAMES[a.armor.tier]} (+{gearBonus(a.armor)}, usure {100 - a.armor.dur} %)<br />
        Sac : {a.sac.potion} potion{a.sac.potion > 1 ? 's' : ''}, {a.sac.antidote} antidote{a.sac.antidote > 1 ? 's' : ''}, {a.sac.bandages} bandage{a.sac.bandages > 1 ? 's' : ''}, {a.sac.panier} panier{a.sac.panier > 1 ? 's' : ''} de route
        {a.buffs.length > 0 && <><br />Bonus de repas pour la prochaine quête : {a.buffs.map((b) => BUFFS[b]?.nom ?? b).join(', ')}</>}
      </p>
      <p class="soft">Bourse : <strong><Money v={a.gold} /></strong>{a.debt > 0 && <> · dette envers la guilde : <strong>{money(a.debt)}</strong></>} · tolérance de prix ×{tolerance(a).toFixed(2).replace('.', ',')} · quêtes {a.history.questsOk} réussies, {a.history.questsFail} échouées · {a.history.kills} monstres vaincus en équipe{a.history.fraudsCaught ? ` · ${a.history.fraudsCaught} fraude(s) détectée(s)` : ''}</p>
      {(team || rels.length > 0) && (
        <>
          <h4 style={{ marginTop: 10 }}>Relations</h4>
          {team && <p>Membre de <strong>{team.name}</strong> ({team.questsOk} quêtes ensemble, cohésion d'équipe {Math.round(teamCohesion(s, team.members.map((id) => s.adventurers.find((x) => x.id === id)).filter((x): x is Adventurer => !!x), team.id))}).</p>}
          <div class="row">{rels.slice(0, 8).map((r) => {
            const o = s.adventurers.find((x) => x.id === r.id);
            const st = relStatus(r.v);
            if (!o || st === 'neutre') return null;
            return <span class={`tag ${st === 'rival' || st === 'ennemi' ? 'seal' : 'sage'}`}><button class="link" onClick={() => nav.openAdventurer(o.id)}>{o.name}</button> · {REL_NAMES[st]}</span>;
          })}</div>
        </>
      )}
      <h4 style={{ marginTop: 10 }}>Gestes de la guilde</h4>
      <div class="row">
        <button class="btn small" disabled={s.treasury < 1000} onClick={() => game.command({ type: 'retain', id: a.id, kind: 'prime', amount: 1000 })} title="Envie de partir réduite, loyauté +5">Prime de 10 po</button>
        <button class="btn small" disabled={a.exemptUntil > s.tick} onClick={() => game.command({ type: 'retain', id: a.id, kind: 'exoneration' })} title="Pas de taxe pendant 2 semaines, loyauté +5">{a.exemptUntil > s.tick ? `Exonéré jusqu'au ${stamp(a.exemptUntil)}` : 'Exonération de 2 semaines'}</button>
        <label class="row"><small>Plafond de crédit</small>
          <NumField min={0} step={100} value={a.creditCap ?? s.policy.creditCap} width={80} label="Plafond de crédit"
            onCommit={(v) => game.command({ type: 'setCreditCap', id: a.id, cap: v })} /></label>
      </div>
      <h4 style={{ marginTop: 10 }}>Pensées</h4>
      {thoughts.length === 0 && <p class="empty">Aucune pensée pour l'instant.</p>}
      {thoughts.slice(0, 12).map((t) => (
        <div style={{ marginBottom: 4 }}><small>{stamp(t.tick)}</small> <span class="thought">« {plain(t.text)} »</span></div>
      ))}
      <div class="row" style={{ marginTop: 12 }}>
        {!confirm
          ? <button class="btn ghost" disabled={a.runId !== null} onClick={() => setConfirm(true)} title={a.runId !== null ? 'Impossible pendant une quête' : ''}>Exclure de la guilde</button>
          : <>
            <span>Exclure {a.name} ?</span>
            <button class="btn seal" onClick={() => { game.command({ type: 'excludeAdventurer', id: a.id }); setConfirm(false); }}>Oui, exclure</button>
            <button class="btn ghost" onClick={() => setConfirm(false)}>Annuler</button>
          </>}
      </div>
    </div>
  );
}

export function Aventuriers({ s }: { s: GameState }) {
  const nav = useNav();
  const [sort, setSort] = useState<SortKey>('level');
  const [showGone, setShowGone] = useState(false);
  const selected = s.adventurers.find((a) => a.id === nav.advId) ?? null;
  const gone = nav.advId !== null && !selected ? s.departed.find((d) => d.id === nav.advId) : null;
  const val = (a: Adventurer): number | string =>
    sort === 'name' ? a.name : sort === 'level' ? a.level : sort === 'gold' ? a.gold : sort === 'morale' ? a.morale
      : sort === 'loyalty' ? a.loyalty : a.griefPrix + a.griefFiscal;
  const list = [...s.adventurers].sort((x, y) => {
    const a = val(x), b = val(y);
    return typeof a === 'string' ? a.localeCompare(b as string) : (b as number) - a;
  });
  const th = (k: SortKey, label: string, num = false) => (
    <th class={num ? 'num' : ''}><button class="link" style={{ fontWeight: sort === k ? 700 : 400 }} onClick={() => setSort(k)}>{label}</button></th>
  );
  return (
    <div>
      <div class="screen-head"><h2>Aventuriers</h2><span class="hint">{s.adventurers.length} membres · clique sur une ligne pour ouvrir la fiche</span></div>
      <Candidates s={s} />
      {s.teams.length > 0 && (
        <div class="panel">
          <h3>Équipes</h3>
          <div class="grid3">{s.teams.map((t) => (
            <div class="panel flat" style={{ marginBottom: 0 }}>
              <strong>{t.name}</strong> <small>{t.questsOk} quête{t.questsOk > 1 ? 's' : ''} ensemble{t.fails ? `, ${t.fails} échec récent` : ''}</small>
              <div class="row" style={{ marginTop: 4 }}>{t.members.map((id) => {
                const m = s.adventurers.find((x) => x.id === id);
                return m ? <button class="link" onClick={() => nav.openAdventurer(m.id)}><ClassDot classe={m.classe} />{m.name}</button> : null;
              })}</div>
            </div>
          ))}</div>
        </div>
      )}
      <div class="split-list">
        <div class="panel">
          <div class="table-wrap">
            <table class="data">
              <thead><tr>{th('name', 'Nom')}{th('level', 'Niv', true)}<th>Activité</th>{th('gold', 'Or', true)}{th('morale', 'Moral')}{th('loyalty', 'Loyauté', true)}{th('griefs', 'Griefs', true)}</tr></thead>
              <tbody>
                {list.map((a) => (
                  <tr class={`clickable ${selected?.id === a.id ? 'sel' : ''}`} onClick={() => nav.openAdventurer(a.id)}>
                    <td><ClassDot classe={a.classe} />{a.name} {a.status !== 'actif' && <span class={`tag ${STATUS[a.status][1]}`}>{STATUS[a.status][0]}</span>}</td>
                    <td class="num">{a.level}</td>
                    <td><small>{ACTIVITY_LABELS[a.activity.kind]}</small></td>
                    <td class="num">{money(a.gold)}</td>
                    <td style={{ minWidth: 70 }}><Gauge value={a.morale} /></td>
                    <td class="num">{Math.round(a.loyalty)}</td>
                    <td class="num">{Math.round(a.griefPrix + a.griefFiscal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 10 }}><button class="link" onClick={() => setShowGone(!showGone)}>{showGone ? 'Masquer' : 'Afficher'} les anciens membres ({s.departed.length})</button></p>
          {showGone && s.departed.slice().reverse().map((d) => (
            <div class="row" style={{ padding: '2px 0' }}><ClassDot classe={d.classe} />{d.name} <small>niv {d.level}</small>
              <span class={`tag ${d.reason === 'mort' ? 'seal' : ''}`}>{d.reason === 'mort' ? 'mort' : d.reason === 'retraite' ? 'retraité' : d.reason === 'exclu' ? 'exclu' : 'parti'}</span>
              <small>{stamp(d.tick)}</small></div>
          ))}
        </div>
        <div>
          {selected && <Fiche s={s} a={selected} />}
          {gone && <div class="panel"><h3>{gone.name}</h3><p>Ne fait plus partie de la guilde ({gone.reason === 'mort' ? 'mort' : gone.reason}, {stamp(gone.tick)}).</p></div>}
          {!selected && !gone && <div class="panel"><p class="empty">Sélectionne un aventurier pour voir sa fiche, ses jauges et ses pensées.</p></div>}
        </div>
      </div>
    </div>
  );
}
