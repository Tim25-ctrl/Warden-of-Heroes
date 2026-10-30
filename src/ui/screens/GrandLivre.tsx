// Livre de comptes (GDD 7.5.8, ex-Grand Livre) : bilans, recettes et dépenses jour par jour, courbe de trésorerie.
import { P } from '../../sim/data';
import { buildingValue } from '../../sim/economy';
import { money, weekdayOf } from '../../sim/format';
import { LEDGER_LABELS } from '../../sim/journal';
import type { DayLedger, GameState } from '../../sim/types';
import { loanCap, PROG } from '../../sim/legend';
import { useState } from 'preact/hooks';
import { Kpi, Money, NumField } from '../components';
import { game, lastError } from '../store';

function Lenders({ s }: { s: GameState }) {
  const [amount, setAmount] = useState(10000);
  const err = lastError();
  const L = s.loans;
  const row = (k: 'banque' | 'usurier', nom: string, terms: string, cap: number) => {
    const loan = L[k];
    return (
      <tr>
        <td><strong>{nom}</strong><div class="hint">{terms}</div></td>
        <td class="num">{loan ? money(loan.principal) : '—'}{loan?.late && <div><span class="tag seal">en retard</span></div>}</td>
        <td><small>{loan ? `échéance J${Math.floor(loan.due / 24) + 1}` : `jusqu'à ${money(cap)}`}</small></td>
        <td class="row">
          <button class="btn small" onClick={() => game.command({ type: 'borrow', lender: k, amount })}>Emprunter</button>
          {loan && <button class="btn ghost small" onClick={() => game.command({ type: 'repay', lender: k, amount })}>Rembourser</button>}
        </td>
      </tr>
    );
  };
  return (
    <div class="panel">
      <h3>Les prêteurs</h3>
      <label class="row">Montant <NumField min={1000} step={1000} value={amount} width={100} label="Montant en pièces de cuivre" live onCommit={setAmount} /> <small>{money(amount)}</small></label>
      <div class="table-wrap"><table class="data"><tbody>
        {row('banque', 'Banque des Marchands', `${Math.round(PROG.prets.banqueTauxSaison * 100)} % par saison, ${PROG.prets.banqueEcheanceJours} jours. Seulement si la trésorerie est positive.`, loanCap(s))}
        {row('usurier', 'Usurier du Port', `${Math.round(PROG.prets.usurierTauxSemaine * 100)} % par semaine, composé, ${PROG.prets.usurierEcheanceJours} jours. Prête même aux guildes endettées. En retard : ses gros bras passent.`, PROG.prets.usurierPlafond)}
      </tbody></table></div>
      {err && <p class="hint" style={{ color: 'var(--seal)' }}>{err}</p>}
      <p class="hint">Le plafond de la banque grandit avec le Sceau de la guilde. Les intérêts s'ajoutent à la dette.</p>
    </div>
  );
}

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

function Bilan({ d, title }: { d: DayLedger; title: string }) {
  const rec = Object.entries(d.recettes).sort((a, b) => b[1] - a[1]);
  const dep = Object.entries(d.depenses).sort((a, b) => b[1] - a[1]);
  const net = sum(d.recettes) - sum(d.depenses);
  return (
    <div class="panel">
      <h3>{title}</h3>
      <div class="grid2" style={{ gap: 12 }}>
        <table class="data">
          <thead><tr><th>Recettes</th><th class="num">{money(sum(d.recettes))}</th></tr></thead>
          <tbody>{rec.map(([k, v]) => <tr><td>{LEDGER_LABELS[k] ?? k}</td><td class="num">{money(v)}</td></tr>)}</tbody>
        </table>
        <table class="data">
          <thead><tr><th>Dépenses</th><th class="num">{money(sum(d.depenses))}</th></tr></thead>
          <tbody>{dep.map(([k, v]) => <tr><td>{LEDGER_LABELS[k] ?? k}</td><td class="num">{money(v)}</td></tr>)}</tbody>
        </table>
      </div>
      <p style={{ marginTop: 8 }}>Solde : <strong><Money v={net} signed /></strong></p>
    </div>
  );
}

function merge(days: DayLedger[]): DayLedger {
  const out: DayLedger = { day: 0, recettes: {}, depenses: {}, tresorerieFin: days.length ? days[days.length - 1].tresorerieFin : 0 };
  for (const d of days) {
    for (const [k, v] of Object.entries(d.recettes)) out.recettes[k] = (out.recettes[k] ?? 0) + v;
    for (const [k, v] of Object.entries(d.depenses)) out.depenses[k] = (out.depenses[k] ?? 0) + v;
  }
  return out;
}

/** Recettes et dépenses des 28 derniers jours : deux courbes sur le même axe, survol jour par jour. */
function FlowChart({ s }: { s: GameState }) {
  const [hover, setHover] = useState<number | null>(null);
  const days = s.ledger.slice(-28);
  if (days.length < 2) return <p class="empty">Le graphique apparaît après deux jours de comptes.</p>;
  const rec = days.map((d) => sum(d.recettes));
  const dep = days.map((d) => sum(d.depenses));
  const w = 600, h = 180, padL = 44, padR = 10, padT = 10, padB = 22;
  const max = Math.max(...rec, ...dep, 100);
  const x = (i: number) => padL + (i / (days.length - 1)) * (w - padL - padR);
  const y = (v: number) => padT + (1 - v / max) * (h - padT - padB);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  const hi = hover !== null ? hover : null;
  return (
    <div class="flow-chart">
      <div class="legend">
        <span><i class="key rec" /> Recettes</span><span><i class="key dep" /> Dépenses</span>
        {hi !== null && <span class="hint">Jour {days[hi].day} : recettes {money(rec[hi])}, dépenses {money(dep[hi])}, solde <Money v={rec[hi] - dep[hi]} signed /></span>}
      </div>
      <svg class="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Recettes et dépenses de la guilde, jour par jour, sur les 28 derniers jours"
        onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => <g><line class="gridline" x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} /><text class="axis" x={padL - 6} y={y(t) + 3} text-anchor="end">{Math.round(t / 100)} po</text></g>)}
        <text class="axis" x={padL} y={h - 6}>J{days[0].day}</text>
        <text class="axis" x={w - padR} y={h - 6} text-anchor="end">J{days[days.length - 1].day}</text>
        <path class="flow rec" d={path(rec)} />
        <path class="flow dep" d={path(dep)} />
        {hi !== null && <line class="crosshair" x1={x(hi)} x2={x(hi)} y1={padT} y2={h - padB} />}
        {hi !== null && <><circle class="dot rec" cx={x(hi)} cy={y(rec[hi])} r={4} /><circle class="dot dep" cx={x(hi)} cy={y(dep[hi])} r={4} /></>}
        {days.map((_, i) => <rect class="hit" x={x(i) - (w - padL - padR) / (days.length - 1) / 2} y={padT} width={(w - padL - padR) / (days.length - 1)} height={h - padT - padB}
          onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />)}
      </svg>
    </div>
  );
}

/** Répartition par poste sur la période : une barre par poste, valeur écrite à côté. */
function Breakdown({ items, kind }: { items: [string, number][]; kind: 'rec' | 'dep' }) {
  const max = Math.max(1, ...items.map(([, v]) => v));
  const total = items.reduce((a, [, v]) => a + v, 0);
  return (
    <div class="breakdown">
      {items.map(([k, v]) => (
        <div class="bd-row" title={`${LEDGER_LABELS[k] ?? k} : ${money(v)} (${Math.round((v / Math.max(1, total)) * 100)} %)`}>
          <span class="bd-label">{LEDGER_LABELS[k] ?? k}</span>
          <span class="bd-track"><span class={`bd-bar ${kind}`} style={{ width: `${(v / max) * 100}%` }} /></span>
          <span class="bd-value">{money(v)}</span>
        </div>
      ))}
    </div>
  );
}

function Chart({ s }: { s: GameState }) {
  const pts = [P.economie.tresorerieDepart, ...s.ledger.map((d) => d.tresorerieFin), s.treasury];
  const w = 600, h = 160, pad = 28;
  const max = Math.max(...pts, 1);
  const min = Math.min(...pts, 0);
  const x = (i: number) => pad + (i / Math.max(1, pts.length - 1)) * (w - pad - 6);
  const y = (v: number) => 8 + (1 - (v - min) / (max - min || 1)) * (h - 26);
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1)},${y(Math.max(min, 0))} L${x(0)},${y(Math.max(min, 0))} Z`;
  return (
    <svg class="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Courbe de la trésorerie, jour par jour">
      <path class="area" d={area} />
      <path class="line" d={line} />
      {min < 0 && <line class="zero" x1={pad} x2={w} y1={y(0)} y2={y(0)} />}
      <text x={2} y={12}>{Math.round(max / 100)} po</text>
      <text x={2} y={h - 4}>{Math.round(min / 100)} po</text>
      <text x={w - 60} y={h - 4}>jour {s.ledger.length + 1}</text>
    </svg>
  );
}

export function GrandLivre({ s }: { s: GameState }) {
  const week = merge(s.ledger.slice(-7));
  const toKing = (P.temps.jourDuRoi - weekdayOf(s.tick) + 7) % 7;
  const taxe = Math.round((P.economie.taxeRoyaleBase + P.economie.taxeRoyaleTaux * s.weekRevenue) * (1 + 0.5 * (s.rank - 1)));
  const entretien = Math.round(P.economie.entretienTauxHebdo * buildingValue(s));
  const last7 = s.ledger.slice(-7);
  const avgNet = last7.length ? last7.reduce((a, d) => a + sum(d.recettes) - sum(d.depenses), 0) / last7.length : 0;
  return (
    <div>
      <Lenders s={s} />
      <div class="screen-head"><h2>Livre de comptes</h2><span class="hint">Bilan calculé chaque nuit à minuit</span></div>
      <div class="kpis">
        <Kpi k="Trésorerie" v={<Money v={s.treasury} />} />
        <Kpi k="Solde moyen (7 j)" v={<Money v={Math.round(avgNet)} signed />} />
        <Kpi k="Prochain Jour du Roi" v={toKing === 0 ? 'ce soir' : `dans ${toKing} j`} />
        <Kpi k="Taxe royale estimée" v={money(taxe)} title="Payée à la Couronne chaque Jour du Roi : 5 po + 3 % des recettes de la semaine, plus 50 % par Sceau au-delà du premier." />
        <Kpi k="Entretien hebdomadaire" v={money(entretien)} title="Réparations des bâtiments, chaque Jour du Roi : un petit pourcentage de leur valeur." />
      </div>
      <div class="panel"><h3>Recettes et dépenses, jour par jour</h3><FlowChart s={s} /></div>
      {s.ledger.length > 0 && (
        <div class="grid2">
          <div class="panel"><h3>D'où vient l'argent (7 jours)</h3><Breakdown kind="rec" items={Object.entries(week.recettes).sort((a, b) => b[1] - a[1])} /></div>
          <div class="panel"><h3>Où il part (7 jours)</h3><Breakdown kind="dep" items={Object.entries(week.depenses).sort((a, b) => b[1] - a[1])} /></div>
        </div>
      )}
      <div class="panel"><h3>Trésorerie</h3><Chart s={s} /></div>
      <Bilan d={s.today} title="Aujourd'hui (jusqu'ici)" />
      {s.ledger.length > 0 && <Bilan d={week} title={`${Math.min(7, s.ledger.length)} derniers jours`} />}
    </div>
  );
}
