// Écran du personnel, des professeurs et des consignes de l'intendant (GDD 7.5.3).
import { useState } from 'preact/hooks';
import { PROFS, ROLES } from '../../sim/data';
import { money, stamp, weekdayOf } from '../../sim/format';
import { canHire, capOf, ROLE_HELP, salaryOf, STAFF_TRAITS } from '../../sim/staff';
import { canHireProf, profSalary } from '../../sim/training';
import type { GameState, StaffMember, StaffRole } from '../../sim/types';
import { Gauge, Tabs } from '../components';
import { game } from '../store';

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

function Row({ m, action }: { m: StaffMember; action: preact.ComponentChildren }) {
  return (
    <tr>
      <td><strong>{m.name}</strong><div class="hint">{ROLES[m.role].nom}</div></td>
      <td class="num">{m.c}</td>
      <td title={`Plafond de compétence : ${capOf(m)}`}><span style={{ color: 'var(--gold)' }}>{stars(m.potentiel)}</span></td>
      <td><small>{m.trait ? STAFF_TRAITS[m.trait] : '—'}</small></td>
      <td class="num">{money(salaryOf(m))}/j</td>
      <td style={{ minWidth: 70 }}><Gauge value={m.loyalty} /></td>
      <td>{action}</td>
    </tr>
  );
}

function Staff({ s }: { s: GameState }) {
  const [confirm, setConfirm] = useState<number | null>(null);
  const daysToMonday = (8 - weekdayOf(s.tick)) % 7 || 7;
  const roles = [...new Set(s.staffCandidates.map((m) => m.role))] as StaffRole[];
  return (
    <>
      <div class="panel">
        <h3>Employés</h3>
        {s.staff.length === 0 && <p class="empty">Personne. Sans cuisinier, le réfectoire ne sert plus de repas.</p>}
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Nom</th><th class="num">Compétence</th><th>Potentiel</th><th>Trait</th><th class="num">Salaire</th><th>Loyauté</th><th /></tr></thead>
          <tbody>{s.staff.map((m) => (
            <Row m={m} action={confirm === m.id
              ? <div class="row"><button class="btn seal small" onClick={() => { game.command({ type: 'fireStaff', id: m.id }); setConfirm(null); }}>Licencier ({money(salaryOf(m) * 3)})</button><button class="btn ghost small" onClick={() => setConfirm(null)}>Non</button></div>
              : <button class="btn ghost small" onClick={() => setConfirm(m.id)}>Licencier</button>} />
          ))}</tbody>
        </table></div>
      </div>
      <div class="panel">
        <h3>Candidats</h3>
        <p class="hint">Le vivier se renouvelle chaque lundi (dans {daysToMonday} jour{daysToMonday > 1 ? 's' : ''}). La compétence progresse de 1 tous les 5 jours, jusqu'au plafond fixé par le potentiel.</p>
        {roles.map((role) => <p class="hint"><strong>{ROLES[role].nom}</strong> : {ROLE_HELP[role]}</p>)}
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Nom</th><th class="num">Compétence</th><th>Potentiel</th><th>Trait</th><th class="num">Salaire</th><th>Loyauté</th><th /></tr></thead>
          <tbody>{s.staffCandidates.map((m) => {
            const why = canHire(s, m);
            return <Row m={m} action={<button class="btn sage small" disabled={!!why} title={why ?? ''} onClick={() => game.command({ type: 'hireStaff', id: m.id })}>Engager</button>} />;
          })}</tbody>
        </table></div>
        {s.staffCandidates.length === 0 && <p class="empty">Plus de candidats cette semaine.</p>}
      </div>
    </>
  );
}

function Profs({ s }: { s: GameState }) {
  return (
    <div class="panel">
      <h3>Offres de professeurs</h3>
      <p class="hint">Les professeurs sont rares : une offre toutes les deux semaines environ. Chacun exige un terrain d'un certain niveau. Les séances se règlent dans le panneau du terrain (écran Siège).</p>
      {s.profCandidates.length === 0 && <p class="empty">Aucune offre en ce moment.</p>}
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Nom</th><th>Spécialité</th><th class="num">Niveau</th><th class="num">Pédagogie</th><th class="num">Élèves</th><th class="num">Salaire</th><th>Offre valable</th><th /></tr></thead>
        <tbody>{s.profCandidates.map((p) => {
          const why = canHireProf(s, p);
          return (
            <tr><td><strong>{p.name}</strong></td><td>{PROFS[p.type].nom}<div class="hint">{PROFS[p.type].pleine.length ? `pour ${PROFS[p.type].pleine.join(', ')}` : 'toutes classes'}</div></td>
              <td class="num">{p.level}</td><td class="num">{p.pedagogie}</td><td class="num">{p.eleves}</td><td class="num">{money(profSalary(p))}/j</td>
              <td><small>jusqu'au {stamp(p.offerUntil)}</small></td>
              <td><button class="btn sage small" disabled={!!why} title={why ?? ''} onClick={() => game.command({ type: 'hireProf', id: p.id })}>Engager</button>{why && <div class="hint">{why}</div>}</td></tr>
          );
        })}</tbody>
      </table></div>
    </div>
  );
}

function Consignes({ s }: { s: GameState }) {
  const it = s.staff.find((m) => m.role === 'intendant');
  const rule = s.policy.autoAccept;
  return (
    <div class="panel">
      <h3>Consignes de l'intendant</h3>
      <p>{it ? `${it.name} exécute les consignes sans erreur et obtient une remise sur les achats.` : 'Sans intendant, les consignes s\'appliquent quand même, mais les commandes automatiques se trompent parfois de quantité et sans remise.'}</p>
      <h4>Réserve de trésorerie</h4>
      <label class="row">Les achats automatiques ne font jamais descendre la trésorerie sous
        <input type="number" min={0} step={1000} value={s.policy.reserve} style={{ width: 100 }} aria-label="Réserve en pièces de cuivre"
          onChange={(e) => game.command({ type: 'setReserve', value: Number((e.target as HTMLInputElement).value) || 0 })} />
        <small>{money(s.policy.reserve)}</small></label>
      <h4 style={{ marginTop: 12 }}>Recrues à la porte</h4>
      <label class="row"><input type="checkbox" checked={rule.enabled} onChange={() => game.command({ type: 'setAutoAccept', rule: { ...rule, enabled: !rule.enabled } })} />
        Accepter automatiquement les candidats de niveau
        <input type="number" min={1} max={30} value={rule.minLevel} style={{ width: 52 }} aria-label="Niveau minimum" onChange={(e) => game.command({ type: 'setAutoAccept', rule: { ...rule, minLevel: Number((e.target as HTMLInputElement).value) || 1 } })} /> ou plus</label>
      <label class="row" style={{ marginLeft: 24 }}><input type="checkbox" checked={rule.refuseMalhonnete} onChange={() => game.command({ type: 'setAutoAccept', rule: { ...rule, refuseMalhonnete: !rule.refuseMalhonnete } })} />sauf s'ils sont visiblement malhonnêtes</label>
      <p class="hint" style={{ marginTop: 12 }}>Les autres consignes se règlent là où elles servent : réapprovisionnement du garde-manger et des remèdes (Siège), fabrication automatique (apothicairerie), vente et rachat des dépouilles (Comptoir).</p>
    </div>
  );
}

export function Personnel({ s }: { s: GameState }) {
  const [tab, setTab] = useState<'staff' | 'profs' | 'consignes'>('staff');
  const payroll = s.staff.reduce((a, m) => a + salaryOf(m), 0) + s.terrain.profs.reduce((a, p) => a + profSalary(p), 0);
  return (
    <div>
      <div class="screen-head"><h2>Personnel</h2><span class="hint">Masse salariale : {money(payroll)} par jour, payée à minuit</span></div>
      <Tabs value={tab} onChange={setTab} tabs={[['staff', 'Employés'], ['profs', `Professeurs${s.profCandidates.length ? ` (${s.profCandidates.length} offre${s.profCandidates.length > 1 ? 's' : ''})` : ''}`], ['consignes', "Consignes de l'intendant"]]} />
      {tab === 'staff' && <Staff s={s} />}
      {tab === 'profs' && <Profs s={s} />}
      {tab === 'consignes' && <Consignes s={s} />}
    </div>
  );
}
