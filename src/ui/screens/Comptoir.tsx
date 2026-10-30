// Comptoir et marché (GDD 7.5.5) : personnel, fiscalité, fraude, entrepôt, rachat, acheteurs, contrats, cours.
import { useEffect, useState } from 'preact/hooks';
import { BUYERS, P, RESOURCES, ROLES } from '../../sim/data';
import { cotisationPrice, cotisationRef, onDuty } from '../../sim/economy';
import { money, stamp } from '../../sim/format';
import {
  buyerAvailable, courtierBonus, hasInternalUse, lotValue, QUALITY_NAMES, resserreCapacity, resserreWeight, stockOfRes,
} from '../../sim/market';
import type { BuyerId, GameState, Policy, RachatRule, Sanction } from '../../sim/types';
import { ROLE_HELP } from '../../sim/staff';
import { Gauge, NumField, PriceInput, Tabs, useNav } from '../components';
import { game } from '../store';

const AUTOSELL: [Policy['autoSell'], string][] = [['off', 'Jamais'], ['sans_usage', 'Tout ce qui n\'a pas d\'usage interne'], ['tout', 'Tout']];
const SANCTIONS: [Sanction, string][] = [['avertissement', 'Avertissement'], ['amende', 'Amende (2 × la taxe cachée)'], ['exclusion', 'Exclusion de la guilde']];

function Fiscalite({ s }: { s: GameState }) {
  const [rate, setRate] = useState(Math.round(s.taxRate * 100));
  useEffect(() => setRate(Math.round(s.taxRate * 100)), [s.taxRate]);
  const tone = rate <= 10 ? 'sage' : rate <= 20 ? '' : rate <= 30 ? 'amber' : 'seal';
  const insp = s.staff.filter((m) => m.role === 'inspecteur').length;
  return (
    <div class="grid2">
      <div class="panel">
        <h3>Taxe de la guilde</h3>
        <p class="hint">Sur la récompense du client, l'or trouvé et la valeur des dépouilles : d'abord en or, le reste en nature. Les primes payées par la guilde ne sont pas taxées. Les guildes rivales prennent environ 15 %.</p>
        <div class="slider-row">
          <strong>Taux</strong>
          <input type="range" min={0} max={P.comptoir.tauxMax * 100} step={1} value={rate} aria-label="Taux de la taxe"
            onInput={(e) => setRate(Number((e.target as HTMLInputElement).value))}
            onChange={(e) => game.command({ type: 'setTaxRate', value: Number((e.target as HTMLInputElement).value) / 100 })} />
          <span class={`tag ${tone}`}>{rate} %</span>
        </div>
        <label class="row" style={{ padding: '6px 0' }}><input type="checkbox" checked={s.exemptBeginners} onChange={() => game.command({ type: 'setExemptions', beginners: !s.exemptBeginners, aide: s.exemptAide })} />Exonérer les débutants (niveau 3 et moins)</label>
        <label class="row" style={{ padding: '6px 0' }}><input type="checkbox" checked={s.exemptAide} onChange={() => game.command({ type: 'setExemptions', beginners: s.exemptBeginners, aide: !s.exemptAide })} />Exonérer les petits boulots en ville</label>
        <h3 style={{ marginTop: 14 }}>Cotisation d'inscription</h3>
        <PriceInput label="Cotisation" sub="payée une fois à l'arrivée" price={cotisationPrice(s)} refPrice={cotisationRef(s)}
          onCommit={(v) => game.command({ type: 'setCotisation', price: v })} />
      </div>
      <div class="panel">
        <h3>Fraude</h3>
        <p>Plus la taxe est lourde et la loyauté faible, plus les aventuriers cachent une partie de leur butin. Les honnêtes ne fraudent jamais.</p>
        <p>Fraudes détectées : <strong>{s.fraud.detected}</strong> · amendes encaissées : <strong>{money(s.fraud.fines)}</strong>{s.fraud.reductionUntil > s.tick ? ` · effet dissuasif jusqu'au ${stamp(s.fraud.reductionUntil)}` : ''}</p>
        <p>{insp ? `${insp} inspecteur${insp > 1 ? 's' : ''} : ${insp * P.fraude.inspecteurCapacite} aventuriers contrôlés sur ${s.adventurers.length}.` : 'Sans inspecteur, 5 % des fraudes seulement sont détectées. Engage un inspecteur du butin dans l\'écran Personnel.'}</p>
        <label class="field">Sanction
          <select value={s.policy.sanction} onChange={(e) => game.command({ type: 'setSanction', value: (e.target as HTMLSelectElement).value as Sanction })}>
            {SANCTIONS.map(([id, label]) => <option value={id}>{label}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

/** Le personnel du comptoir (v1.1) : inspecteur du butin, courtier, greffier. */
function ComptoirStaff({ s }: { s: GameState }) {
  const nav = useNav();
  const roles = ['inspecteur', 'courtier', 'greffier'] as const;
  return (
    <div class="panel">
      <h3>Personnel du comptoir</h3>
      <div class="staff-cards">
        {roles.map((r) => {
          const team = s.staff.filter((m) => m.role === r);
          return (
            <div class="panel flat">
              <div class="row"><strong>{ROLES[r].nom}</strong><span class="spacer" />
                {team.length ? <span class="tag sage">{team.map((m) => m.name).join(', ')}</span> : <span class="tag">aucun</span>}</div>
              <p class="hint" style={{ margin: '4px 0' }}>{ROLE_HELP[r]}</p>
              {team.length === 0 && <button class="btn small" onClick={() => nav.go('personnel')}>Voir les candidats (Personnel)</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Resserre({ s }: { s: GameState }) {
  const [rules, setRules] = useState<RachatRule[]>(s.policy.rachatRules);
  const [cur, setCur] = useState(s.policy.rachatCurseur);
  const [newRes, setNewRes] = useState('viande_loup');
  const [newMax, setNewMax] = useState(3);
  useEffect(() => { setRules(s.policy.rachatRules); setCur(s.policy.rachatCurseur); }, [s.policy.rachatRules, s.policy.rachatCurseur]);
  const commit = (r: RachatRule[], c = cur) => game.command({ type: 'setRachat', curseur: c, rules: r });
  const total = s.resserre.reduce((a, l) => a + lotValue(s, l), 0);
  const courtier = onDuty(s, 'courtier');
  return (
    <div class="grid2">
      <div class="panel">
        <h3>Entrepôt des dépouilles</h3>
        <p class="hint">L'entrepôt garde les dépouilles que la guilde prélève en taxe ou rachète au comptoir : peaux, viandes, plantes, organes. La viande alimente le rôti de la cuisine, les plantes et organes l'apothicairerie, les contrats sont livrés chaque matin, et le reste se revend en ville.</p>
        <p>{resserreWeight(s)} / {resserreCapacity(s)} unités de poids, valeur estimée <strong>{money(total)}</strong>.</p>
        <div class="row" style={{ marginBottom: 8 }}>
          <button class="btn" disabled={s.resserre.length === 0} onClick={() => game.command({ type: 'sellLoot', index: 'all' })}>Tout vendre ({courtier ? `sans frais, +${Math.round(courtierBonus(courtier) * 100)} % grâce au courtier` : 'frais 5 %'})</button>
          <label class="row">Vente automatique chaque matin
            <select value={s.policy.autoSell} onChange={(e) => game.command({ type: 'setAutoSell', mode: (e.target as HTMLSelectElement).value as Policy['autoSell'] })}>
              {AUTOSELL.map(([id, label]) => <option value={id}>{label}</option>)}
            </select></label>
        </div>
        {courtier && <p class="hint">{courtier.name}, le courtier, vend au bon moment : il garde ce dont le cours est bas, sauf ce qui va se gâter.</p>}
        {s.resserre.length === 0 ? <p class="empty">L'entrepôt est vide.</p> : (
          <div class="table-wrap"><table class="data">
            <thead><tr><th>Ressource</th><th class="num">Qté</th><th>Qualité</th><th>Fraîcheur</th><th class="num">Valeur</th><th /></tr></thead>
            <tbody>{s.resserre.map((l, i) => (
              <tr><td>{RESOURCES[l.res].nom} {hasInternalUse(s, l.res) && <span class="tag blue" title="Utilisé par la guilde">usage</span>}</td><td class="num">{l.qty}</td><td><small>{QUALITY_NAMES[l.quality]}</small></td>
                <td style={{ minWidth: 60 }}>{RESOURCES[l.res].conservation ? <Gauge value={l.fresh * 100} /> : <small>—</small>}</td>
                <td class="num">{money(lotValue(s, l))}</td>
                <td><button class="btn ghost small" onClick={() => game.command({ type: 'sellLoot', index: i })}>Vendre</button></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      <div class="panel">
        <h3>Rachat au comptoir</h3>
        <p class="hint">Après la taxe, la guilde peut racheter des dépouilles aux aventuriers. Ils acceptent sans broncher à ×0,9 du cours (ce qu'ils toucheraient en ville après les frais) ; en dessous, ils grincent des dents.</p>
        <div class="slider-row">
          <strong>Prix de rachat</strong>
          <input type="range" min={0.7} max={1} step={0.05} value={cur} aria-label="Prix de rachat" onInput={(e) => setCur(Number((e.target as HTMLInputElement).value))} onChange={(e) => commit(rules, Number((e.target as HTMLInputElement).value))} />
          <span class={`tag ${cur < 0.9 ? 'amber' : ''}`}>×{cur.toFixed(2).replace('.', ',')} du cours</span>
        </div>
        <label class="row" style={{ padding: '6px 0' }} title={courtier ? '' : 'Engage un courtier dans l\'écran Personnel.'}>
          <input type="checkbox" checked={!!s.policy.courtierRachat} disabled={!courtier} onChange={() => game.command({ type: 'setCourtierRachat', enabled: !s.policy.courtierRachat })} />
          Le courtier rachète les dépouilles pour les revendre {courtier ? `(marge d'environ ${Math.round((1 + courtierBonus(courtier) - cur) * 100)} %)` : '(il faut un courtier)'}
        </label>
        <h4>Ce que la guilde rachète pour ses besoins</h4>
        {rules.length === 0 && <p class="empty">Rien pour l'instant.</p>}
        {rules.map((r, i) => (
          <div class="row" style={{ padding: '3px 0' }}>
            <span style={{ minWidth: 170 }}>{r.res === '*' ? 'Toutes les dépouilles' : RESOURCES[r.res].nom}</span>
            <small>jusqu'à {r.maxStock} en stock (actuel : {r.res === '*' ? '—' : stockOfRes(s, r.res)})</small>
            <span class="spacer" />
            <button class="btn ghost small" onClick={() => { const n = rules.filter((_, j) => j !== i); setRules(n); commit(n); }}>Retirer</button>
          </div>
        ))}
        <div class="row" style={{ marginTop: 8 }}>
          <select value={newRes} onChange={(e) => setNewRes((e.target as HTMLSelectElement).value)} aria-label="Ressource à racheter">
            {Object.entries(RESOURCES).filter(([id]) => !id.includes('dragon')).map(([id, r]) => <option value={id}>{r.nom}</option>)}
          </select>
          <NumField min={1} value={newMax} width={56} label="Stock maximum" live onCommit={setNewMax} />
          <button class="btn small" onClick={() => { const n = [...rules.filter((r) => r.res !== newRes), { res: newRes, maxStock: newMax }]; setRules(n); commit(n); }}>Ajouter</button>
        </div>
      </div>
    </div>
  );
}

function Contrats({ s }: { s: GameState }) {
  return (
    <div class="grid2">
      <div class="panel">
        <h3>Acheteurs de la ville</h3>
        <table class="data">
          <thead><tr><th>Acheteur</th><th>Achète</th><th>Réputation</th></tr></thead>
          <tbody>{(Object.keys(BUYERS) as BuyerId[]).map((b) => (
            <tr><td><strong>{BUYERS[b].nom}</strong>{!buyerAvailable(s, b) && <div class="hint">pas encore en ville</div>}</td><td><small>{BUYERS[b].description}</small></td>
              <td style={{ minWidth: 90 }}><Gauge value={s.buyers[b]} color="var(--gold)" /><small>jusqu'à +{Math.round(s.buyers[b] / 10)} % sur les ventes</small></td></tr>
          ))}</tbody>
        </table>
      </div>
      <div class="panel">
        <h3>Contrats</h3>
        <p class="hint">Livrés automatiquement chaque matin depuis l'entrepôt. {s.contracts.length} / {P.marche.contrats.actifsMax} en cours. Pour les remplir, publie des primes au tableau ou règle le rachat au comptoir.</p>
        {s.contracts.map((c) => (
          <div class="panel flat" style={{ marginBottom: 6 }}>
            <div class="row"><strong>{c.qty} {RESOURCES[c.res].nom.toLowerCase()}</strong><small>pour {BUYERS[c.buyer].nom}</small><span class="spacer" /><span class="tag sage">+{Math.round(c.premium * 100)} %</span></div>
            <div class="hint">Livré : {c.delivered}/{c.qty} · qualité {QUALITY_NAMES[c.minQuality]} minimum · échéance {stamp(c.deadline)} · en stock : {stockOfRes(s, c.res, c.minQuality)}</div>
            <button class="btn small" disabled={stockOfRes(s, c.res, c.minQuality) === 0} onClick={() => game.command({ type: 'deliverContract', id: c.id })}>Livrer maintenant</button>
          </div>
        ))}
        <h4 style={{ marginTop: 10 }}>Offres</h4>
        {s.contractOffers.length === 0 && <p class="empty">De nouvelles offres arrivent chaque lundi.</p>}
        {s.contractOffers.map((c) => (
          <div class="row" style={{ padding: '4px 0', borderBottom: '1px solid var(--line-soft)' }}>
            <span><strong>{c.qty} {RESOURCES[c.res].nom.toLowerCase()}</strong> <small>pour {BUYERS[c.buyer].nom}, {QUALITY_NAMES[c.minQuality]} min., +{Math.round(c.premium * 100)} %, avant {stamp(c.deadline)}</small></span>
            <span class="spacer" />
            <button class="btn small" disabled={s.contracts.length >= P.marche.contrats.actifsMax} onClick={() => game.command({ type: 'acceptContract', id: c.id })}>Accepter</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Cours({ s }: { s: GameState }) {
  const [filter, setFilter] = useState('');
  return (
    <div class="panel">
      <h3>Cours des dépouilles en ville</h3>
      <p class="hint">Les cours suivent l'offre et la demande : quand on vend beaucoup de peaux de loup, leur prix baisse. Les guildes rivales vendent aussi leur butin : plus elles chassent, plus le marché est approvisionné.</p>
      <input type="text" placeholder="Filtrer…" value={filter} onInput={(e) => setFilter((e.target as HTMLInputElement).value)} style={{ marginBottom: 8 }} aria-label="Filtrer les ressources" />
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Ressource</th><th>Acheteur</th><th class="num">Cours</th><th class="num">Base</th><th>Tendance</th><th>Stock en ville</th></tr></thead>
        <tbody>{Object.entries(s.market).filter(([id]) => !id.includes('dragon') && RESOURCES[id].nom.toLowerCase().includes(filter.toLowerCase())).map(([id, m]) => {
          const r = RESOURCES[id];
          const ratio = m.cours / Math.max(1, r.prix);
          const normal = m.D * P.marche.joursStockNormal;
          return (
            <tr><td>{r.nom} {r.rare && <span class="tag blue">rare</span>}</td><td><small>{BUYERS[r.acheteurs[0]].nom}</small></td>
              <td class="num"><strong>{money(m.cours)}</strong></td><td class="num"><small>{money(r.prix)}</small></td>
              <td><span class={`tag ${ratio > 1.15 ? 'sage' : ratio < 0.85 ? 'seal' : ''}`}>{ratio > 1.15 ? '▲ recherché' : ratio < 0.85 ? '▼ en surplus' : '= stable'}</span></td>
              <td style={{ minWidth: 90 }} title={`${Math.round(m.S)} en stock pour ${Math.round(normal)} habituellement`}><Gauge value={m.S} max={normal * 2} color="var(--blue)" /></td></tr>
          );
        })}</tbody>
      </table></div>
    </div>
  );
}

export function Comptoir({ s }: { s: GameState }) {
  const [tab, setTab] = useState<'fisc' | 'resserre' | 'contrats' | 'cours'>('fisc');
  return (
    <div>
      <div class="screen-head"><h2>Comptoir</h2><span class="hint">Chaque retour de quête passe ici (GDD 2.4)</span></div>
      <ComptoirStaff s={s} />
      <Tabs value={tab} onChange={setTab} tabs={[['fisc', 'Fiscalité et fraude'], ['resserre', 'Entrepôt et rachat'], ['contrats', `Acheteurs et contrats${s.contractOffers.length ? ` (${s.contractOffers.length})` : ''}`], ['cours', 'Cours du marché']]} />
      {tab === 'fisc' && <Fiscalite s={s} />}
      {tab === 'resserre' && <Resserre s={s} />}
      {tab === 'contrats' && <Contrats s={s} />}
      {tab === 'cours' && <Cours s={s} />}
    </div>
  );
}
