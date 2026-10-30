// Tableau des quêtes (GDD 7.5.4), primes du joueur (4.4), régions et populations (2.7).
import { useState } from 'preact/hooks';
import { ATTR_NAMES, RESOURCES, SPECIES, ZONE_IDS, ZONES } from '../../sim/data';
import { onDuty } from '../../sim/economy';
import { money, stamp } from '../../sim/format';
import { huntClosed, popOf, zoneDanger } from '../../sim/populations';
import { activePrimes, boardCapacity, boardQuests, dangerDots, maxPrimes, QUEST_TYPE_NAMES, questValue } from '../../sim/quests';
import type { GameState, Quest } from '../../sim/types';
import { ClassDot, Gauge, NumField, RankBadge, RichText, Tabs } from '../components';
import { game, lastError } from '../store';

const DOTS = ['', 'Faible', 'Modéré', 'Sérieux', 'Élevé', 'Extrême'];

function Notice({ s, q }: { s: GameState; q: Quest }) {
  const [bonus, setBonus] = useState(false);
  const [amount, setAmount] = useState(200);
  const run = q.reservedBy !== null ? s.runs.find((r) => r.id === q.reservedBy) : null;
  const d = dangerDots(q);
  const guild = q.clientType === 'guilde';
  return (
    <div class={`notice ${run ? 'reserved' : ''}`} style={guild ? { borderColor: 'var(--gold)' } : undefined}>
      <div class="row"><RankBadge rang={q.rang} /><small>{QUEST_TYPE_NAMES[q.type]}</small><span class="spacer" />
        <strong>{q.type === 'extermination' ? `${money(q.perHead ?? 0)}/tête` : money(questValue(q))}</strong></div>
      <h4>{q.title}</h4>
      <div class="hint">Pour {q.client}{q.bonus > 0 && <> · <span class="tag amber">bonus de la guilde {money(q.bonus)}</span></>}</div>
      <div class="row" style={{ marginTop: 6 }}>
        <span class="danger-dots" title={onDuty(s, 'greffier') ? 'Danger estimé par le greffier : exact' : 'Danger estimé (peut se tromper de ±15 % ; exact avec un greffier)'}>{'●'.repeat(d)}{'○'.repeat(5 - d)}</span>
        <small>{DOTS[d]}</small><span class="spacer" />
        <small>{q.minMembers === q.maxMembers ? `${q.minMembers} aventurier` : `${q.minMembers} à ${q.maxMembers} aventuriers`}</small>
      </div>
      <div class="hint" style={{ marginTop: 4 }}>
        {q.type === 'extermination' ? `${q.teams.length} équipe(s) sur place · expire ${stamp(q.expires)}`
          : !run ? `Expire ${stamp(q.expires)}` : run.stage === 'preparation' ? `Réservée : départ ${stamp(run.departTick)}` : `En cours (${run.members.length} aventurier${run.members.length > 1 ? 's' : ''})`}
      </div>
      {!run && !guild && (bonus
        ? <div class="row" style={{ marginTop: 6 }}><NumField min={50} step={50} value={amount} width={70} label="Montant du bonus" live onCommit={setAmount} />
          <small>{money(amount)}</small><button class="btn small" onClick={() => { game.command({ type: 'addBonus', questId: q.id, amount }); setBonus(false); }}>Ajouter</button></div>
        : <button class="link" style={{ marginTop: 6 }} onClick={() => setBonus(true)}>+ Ajouter un bonus</button>)}
    </div>
  );
}

function PrimeForm({ s }: { s: GameState }) {
  const [type, setType] = useState<'chasse' | 'extermination' | 'cueillette'>('chasse');
  const [zone, setZone] = useState('foret');
  const targets = type === 'cueillette' ? Object.keys(ZONES[zone].plantes) : Object.keys(ZONES[zone].especes).filter((x) => x !== 'dragon');
  const [target, setTarget] = useState(targets[0]);
  const [count, setCount] = useState(4);
  const [reward, setReward] = useState(500);
  const [days, setDays] = useState(5);
  const err = lastError();
  const t = targets.includes(target) ? target : targets[0];
  const can = activePrimes(s) < maxPrimes(s);
  return (
    <div class="panel">
      <h3>Publier une prime</h3>
      <p class="hint">Ton levier principal : la somme est bloquée à la publication, rendue si personne ne la réclame, et n'est pas taxée. {activePrimes(s)} / {maxPrimes(s)} primes et bonus actifs.</p>
      <div class="row" style={{ alignItems: 'flex-end' }}>
        <label class="field">Type<select value={type} onChange={(e) => setType((e.target as HTMLSelectElement).value as typeof type)}>
          <option value="chasse">Chasse</option><option value="extermination">Extermination (payée à la tête)</option><option value="cueillette">Cueillette</option></select></label>
        <label class="field">Zone<select value={zone} onChange={(e) => setZone((e.target as HTMLSelectElement).value)}>
          {ZONE_IDS.map((z) => <option value={z}>{ZONES[z].nom}</option>)}</select></label>
        <label class="field">Cible<select value={t} onChange={(e) => setTarget((e.target as HTMLSelectElement).value)}>
          {targets.map((x) => <option value={x}>{type === 'cueillette' ? RESOURCES[x].nom : `${SPECIES[x].pluriel}${huntClosed(s, zone, x) ? ' (chasse fermée)' : ''}`}</option>)}</select></label>
        <label class="field">Nombre<NumField min={1} max={30} value={count} width={64} live onCommit={setCount} /></label>
        <label class="field">Récompense (pc)<NumField min={50} step={50} value={reward} width={90} live onCommit={setReward} /></label>
        <label class="field">Durée (jours)<NumField min={2} max={14} value={days} width={60} live onCommit={setDays} /></label>
        <button class="btn seal" disabled={!can || reward > s.treasury} onClick={() => game.command({ type: 'createPrime', questType: type, zone, target: t, count, reward, days })}>Publier ({money(reward)})</button>
      </div>
      {err && <p class="hint" style={{ color: 'var(--seal)' }}>{err}</p>}
    </div>
  );
}

function Regions({ s }: { s: GameState }) {
  return (
    <div class="panel">
      <h3>Régions</h3>
      <p class="hint">Chasser fait baisser une population (et le danger), la négliger la fait proliférer. Au-delà de 80 %, la région demande une extermination ; sous 30 %, l'espèce se fait rare et ses dépouilles chères.</p>
      <div class="grid3">{ZONE_IDS.map((z) => (
        <div class="panel flat" style={{ marginBottom: 0 }}>
          <div class="row"><strong>{ZONES[z].nom}</strong><span class="spacer" /><small>{ZONES[z].trajet} h</small></div>
          <div class="gauge-row"><span class="soft">Danger</span><Gauge value={zoneDanger(s, z)} color="var(--seal)" /><span>{zoneDanger(s, z)}</span></div>
          {Object.keys(ZONES[z].especes).filter((x) => x !== 'dragon').map((sp) => {
            const p = popOf(s, z, sp);
            return <div class="gauge-row"><span class="soft">{SPECIES[sp].nom}</span><Gauge value={p} color={p > 80 ? 'var(--seal)' : p < 30 ? 'var(--amber)' : 'var(--sage)'} /><span>{Math.round(p)}</span></div>;
          })}
          {Object.keys(ZONES[z].plantes).map((pl) => (
            <div class="gauge-row"><span class="soft">{RESOURCES[pl].nom}</span><Gauge value={popOf(s, z, pl)} color="var(--blue)" /><span>{Math.round(popOf(s, z, pl))}</span></div>
          ))}
        </div>
      ))}</div>
    </div>
  );
}

export function Tableau({ s }: { s: GameState }) {
  const [tab, setTab] = useState<'tableau' | 'regions'>('tableau');
  const [open, setOpen] = useState<number | null>(null);
  const combat = s.board.filter((q) => q.type !== 'aide');
  const aides = s.board.filter((q) => q.type === 'aide');
  const workers = s.adventurers.filter((a) => a.job);
  return (
    <div>
      <div class="screen-head">
        <h2>Tableau des quêtes</h2>
        <span class="hint">{boardQuests(s).length} / {boardCapacity(s)} affiches · les aventuriers choisissent eux-mêmes leurs quêtes, chaque soir à 19h</span>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['tableau', 'Tableau et primes'], ['regions', 'Régions et populations']]} />
      {tab === 'regions' ? <Regions s={s} /> : (
        <>
          <div class="panel">
            <h3>Quêtes</h3>
            {combat.length === 0 ? <p class="empty">Aucune affiche pour l'instant. De nouvelles quêtes arrivent chaque matin.</p>
              : <div class="board">{combat.map((q) => <Notice s={s} q={q} />)}</div>}
          </div>
          <PrimeForm s={s} />
          <div class="grid2">
            <div class="panel">
              <h3>Petits boulots en ville</h3>
              <p class="hint">Sans danger, payés quelques pièces : c'est ce qui fait vivre les débutants fauchés.</p>
              <table class="data">
                <thead><tr><th>Travail</th><th>Attribut</th><th class="num">Durée</th><th class="num">Paie</th></tr></thead>
                <tbody>{aides.map((q) => <tr><td>{q.title}</td><td><small>{ATTR_NAMES[q.attr!]}</small></td><td class="num">{q.hours} h</td><td class="num">{money(q.reward)}</td></tr>)}</tbody>
              </table>
              {aides.length === 0 && <p class="empty">Plus de petit boulot aujourd'hui.</p>}
              {workers.length > 0 && <p class="hint" style={{ marginTop: 8 }}>En ce moment : {workers.map((a) => a.name).join(', ')}.</p>}
            </div>
            <div class="panel">
              <h3>Quêtes en cours</h3>
              {s.runs.length === 0 && <p class="empty">Aucune équipe dehors.</p>}
              {s.runs.map((run) => {
                const members = run.members.map((id) => s.adventurers.find((a) => a.id === id)).filter(Boolean);
                const stage = run.stage === 'preparation' ? `départ ${stamp(run.departTick)}` : run.stage === 'aller' ? 'en route' : run.stage === 'objectif' ? 'sur place' : 'sur le retour';
                const q = run.quest;
                const progress = q.type === 'chasse' ? `${run.kills}/${q.count} abattus` : q.type === 'extermination' ? `${run.kills} abattus`
                  : q.type === 'cueillette' ? `${run.gathered}/${q.count} cueillis` : q.type === 'exploration' ? `${run.roomsDone}/${q.rooms} salles`
                  : q.type === 'protection' ? `${run.nightsDone}/${q.nights} nuits` : q.type === 'escorte' ? `convoi ${Math.max(0, run.convoyHp)} %` : '';
                return (
                  <div style={{ borderBottom: '1px solid var(--line-soft)', padding: '6px 0' }}>
                    <div class="row">{members.map((m) => <ClassDot classe={m!.classe} />)}<strong>{q.title}</strong><span class="spacer" />
                      <span class={`tag ${run.outcome === 'echec' ? 'seal' : run.outcome === 'succes' ? 'sage' : ''}`}>{stage}</span></div>
                    <div class="hint">{members.map((m) => m!.name).join(', ')} · {progress} · {run.loot.reduce((a, l) => a + l.qty, 0)} dépouilles</div>
                    {run.log.length > 0 && <button class="link" onClick={() => setOpen(open === run.id ? null : run.id)}>{open === run.id ? 'Masquer' : 'Voir'} le journal de quête</button>}
                    {open === run.id && run.log.map((l) => <div class="hint"><small>{stamp(l.tick)}</small> <RichText text={l.text} /></div>)}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
