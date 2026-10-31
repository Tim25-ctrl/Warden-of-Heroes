// Mode consultation (GDD 7.9) : l'essentiel sur téléphone, avec les actions rapides.
import { AlertWarning } from '../AlertWarning';
import { BEDS, CLASSES, DISHES, DORM_LEVELS } from '../../sim/data';
import { bedPrice, bedRef, dishPrice, dishRef, dishUnlocked, innPrice, tavernPrice } from '../../sim/economy';
import { dayOf, money } from '../../sim/format';
import { questValue } from '../../sim/quests';
import type { BedType, DishId, GameState } from '../../sim/types';
import { PriceInput, RichText } from '../components';
import { MorningReport } from '../Morning';
import { game } from '../store';
import { DecisionCard } from './Chroniques';

export function Consultation({ s }: { s: GameState }) {
  const alerts = s.journal.filter((e) => e.lvl === 'critique' && e.tick > s.tick - 48).slice(-6).reverse();
  const leaving = s.adventurers.filter((a) => a.status === 'depart');
  const beds = DORM_LEVELS[s.dortoirs.level - 1].lits as BedType[];
  const dishes = s.refectoire.menu.filter((d) => dishUnlocked(s, d) && DISHES[d].type === 'repas') as DishId[];
  const quests = s.board.filter((q) => q.type !== 'aide' && q.reservedBy === null && q.clientType !== 'guilde').slice(0, 5);
  return (
    <div class="consultation">
      <div class="screen-head"><h2>Résumé</h2><span class="hint">Jour {dayOf(s.tick)} · {s.adventurers.length} aventuriers · {money(s.treasury)}</span></div>
      {s.mode === 'chronique' && <AlertWarning />}
      <MorningReport s={s} />

      {s.world.decisions.length > 0 && (
        <div class="panel accent"><h3>Décisions en attente</h3>{s.world.decisions.map((d) => <DecisionCard s={s} d={d} />)}</div>
      )}

      <div class="panel">
        <h3>Alertes</h3>
        {alerts.length === 0 ? <p class="empty">Rien d'alarmant ces deux derniers jours.</p>
          : alerts.map((e) => <p class="news"><small>J{dayOf(e.tick)} {String(e.tick % 24).padStart(2, '0')}h</small> <RichText text={e.text} /></p>)}
      </div>

      {s.doorCandidates.length > 0 && (
        <div class="panel">
          <h3>À la porte</h3>
          {s.doorCandidates.map((c) => (
            <div class="card-row">
              <div><strong>{c.name}</strong><div class="hint">{CLASSES[c.classe].nom}, niveau {c.level}</div></div>
              <div class="row">
                <button class="btn sage" onClick={() => game.command({ type: 'acceptCandidate', id: c.id })}>Accepter</button>
                <button class="btn ghost" onClick={() => game.command({ type: 'refuseCandidate', id: c.id })}>Refuser</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {leaving.length > 0 && (
        <div class="panel">
          <h3>Sur le départ</h3>
          {leaving.map((a) => (
            <div class="card-row">
              <div><strong>{a.name}</strong><div class="hint">{a.poachedBy ? `Courtisé par ${a.poachedBy}` : 'Mécontent'} · loyauté {Math.round(a.loyalty)}</div></div>
              <div class="row">
                <button class="btn" disabled={s.treasury < 1000} onClick={() => game.command({ type: 'retain', id: a.id, kind: 'prime', amount: 1000 })}>Prime de 10 po</button>
                <button class="btn ghost" onClick={() => game.command({ type: 'retain', id: a.id, kind: 'exoneration' })}>Exonérer</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div class="panel">
        <h3>Tarifs</h3>
        {beds.map((b) => (
          <PriceInput label={BEDS[b].nom} sub="la nuit" price={bedPrice(s, b)} refPrice={bedRef(s, b)} competitor={innPrice(s)}
            onCommit={(v) => game.command({ type: 'setBedPrix', bed: b, price: v })} />
        ))}
        {dishes.map((d) => (
          <PriceInput label={DISHES[d].nom} price={dishPrice(s, d)} refPrice={dishRef(s, d)} competitor={tavernPrice(s)}
            onCommit={(v) => game.command({ type: 'setDishPrix', dish: d, price: v })} />
        ))}
      </div>

      <div class="panel">
        <h3>Quêtes sans preneur</h3>
        {quests.length === 0 ? <p class="empty">Toutes les quêtes ont trouvé preneur.</p> : quests.map((q) => (
          <div class="card-row">
            <div>{q.title}<div class="hint">rang {q.rang} · {money(questValue(q))}{q.bonus > 0 ? ` dont bonus ${money(q.bonus)}` : ''}</div></div>
            <button class="btn" disabled={s.treasury < 200} onClick={() => game.command({ type: 'addBonus', questId: q.id, amount: 200 })}>+2 po</button>
          </div>
        ))}
      </div>
    </div>
  );
}
