// Grand Livre (GDD 7.5.8) : bilan du jour, de la semaine, courbe de trésorerie.
import { P } from '../../sim/data';
import { buildingValue } from '../../sim/economy';
import { money, weekdayOf } from '../../sim/format';
import { LEDGER_LABELS } from '../../sim/journal';
import type { DayLedger, GameState } from '../../sim/types';
import { loanCap, PROG } from '../../sim/legend';
import { useState } from 'preact/hooks';
import { Kpi, Money } from '../components';
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
      <label class="row">Montant <input type="number" min={1000} step={1000} value={amount} style={{ width: 100 }} aria-label="Montant en pièces de cuivre"
        onInput={(e) => setAmount(Number((e.target as HTMLInputElement).value) || 0)} /> <small>{money(amount)}</small></label>
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
      <div class="screen-head"><h2>Grand Livre</h2><span class="hint">Bilan calculé chaque nuit à minuit</span></div>
      <div class="kpis">
        <Kpi k="Trésorerie" v={<Money v={s.treasury} />} />
        <Kpi k="Solde moyen (7 j)" v={<Money v={Math.round(avgNet)} signed />} />
        <Kpi k="Prochain Jour du Roi" v={toKing === 0 ? 'ce soir' : `dans ${toKing} j`} />
        <Kpi k="Taxe royale estimée" v={money(taxe)} title="(5 po + 3 % du chiffre d'affaires de la semaine)" />
        <Kpi k="Entretien hebdomadaire" v={money(entretien)} title="3 % de la valeur des bâtiments" />
      </div>
      <div class="panel"><h3>Trésorerie</h3><Chart s={s} /></div>
      <Bilan d={s.today} title="Aujourd'hui (jusqu'ici)" />
      {s.ledger.length > 0 && <Bilan d={week} title={`${Math.min(7, s.ledger.length)} derniers jours`} />}
    </div>
  );
}
