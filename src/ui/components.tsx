// Composants partagés de l'interface.
import { createContext, type ComponentChildren } from 'preact';
import { useContext, useState } from 'preact/hooks';
import { CLASSES } from '../sim/data';
import { priceVerdict } from '../sim/economy';
import { money } from '../sim/format';
import type { ActivityKind, ClassId, Money as M, Rang } from '../sim/types';

export type Screen = 'siege' | 'aventuriers' | 'personnel' | 'tableau' | 'comptoir' | 'chroniques' | 'carte' | 'charte' | 'guilde' | 'livre' | 'options' | 'resume' | 'journal';

export interface Nav {
  screen: Screen;
  go: (s: Screen) => void;
  advId: number | null;
  openAdventurer: (id: number) => void;
}
export const NavContext = createContext<Nav>({ screen: 'siege', go: () => {}, advId: null, openAdventurer: () => {} });
export const useNav = () => useContext(NavContext);

/** Texte du journal : [[a:12|Brom]] devient un lien vers la fiche de l'aventurier. */
export function RichText({ text }: { text: string }) {
  const nav = useNav();
  const parts: ComponentChildren[] = [];
  const re = /\[\[a:(\d+)\|([^\]]+)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const id = Number(m[1]);
    parts.push(<button class="link" onClick={() => nav.openAdventurer(id)}>{m[2]}</button>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span>{parts}</span>;
}

export const plain = (text: string) => text.replace(/\[\[a:\d+\|([^\]]+)\]\]/g, '$1');

export function Money({ v, signed }: { v: M; signed?: boolean }) {
  const cls = signed ? (v > 0 ? 'delta up' : v < 0 ? 'delta down' : '') : '';
  return <span class={cls}>{signed && v > 0 ? '+' : ''}{money(v)}</span>;
}

export function Gauge({ value, max = 100, color }: { value: number; max?: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const c = color ?? (pct < 25 ? 'var(--seal)' : pct < 50 ? 'var(--amber)' : 'var(--sage)');
  return <div class="gauge" role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max}><span style={{ width: `${pct}%`, background: c }} /></div>;
}

export function GaugeRow({ label, value, max = 100, suffix, color }: { label: string; value: number; max?: number; suffix?: string; color?: string }) {
  return (
    <div class="gauge-row">
      <span class="soft">{label}</span>
      <Gauge value={value} max={max} color={color} />
      <span class="num">{suffix ?? Math.round(value)}</span>
    </div>
  );
}

export const classColor = (c: ClassId) => `var(--c-${c})`;

export function ClassDot({ classe }: { classe: ClassId }) {
  return <span class="class-dot" style={{ background: classColor(classe) }} title={CLASSES[classe].nom}>{CLASSES[classe].nom[0]}</span>;
}

export function RankBadge({ rang }: { rang: Rang }) {
  return <span class={`rank ${rang}`} title={`Rang ${rang}`}>{rang}</span>;
}

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  flaner: 'flâne au siège',
  prison: 'en prison',
  dormir: 'dort',
  manger: 'mange au réfectoire',
  boire: 'boit une chope',
  attendre: 'attend une place au réfectoire',
  auberge: 'dort au Sanglier Borgne',
  taverne: 'mange à la Taverne du Pont',
  dehors: 'dort dehors',
  soin: 'se fait soigner en ville',
  consultation: "se fait soigner à l'infirmerie",
  hospitalise: "est hospitalisé à l'infirmerie",
  entrainement: "s'entraîne au terrain",
  forge: 'passe chez le Forgeron',
  vendre: 'vend son butin en ville',
  aide: 'fait un petit boulot en ville',
  quete: 'est en quête',
};

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  return (
    <div class="tabs" role="tablist">
      {tabs.map(([id, label]) => (
        <button role="tab" aria-selected={value === id} class={value === id ? 'on' : ''} onClick={() => onChange(id)}>{label}</button>
      ))}
    </div>
  );
}

/** Lit un montant tapé par le joueur : « 2 po 5 pa », « 26 pc » ou un simple nombre (en pc). */
export function parseMoney(text: string): number | null {
  const t = text.toLowerCase().replace(/(\d)[\s  ](?=\d)/g, '$1').trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  const re = /(\d+)\s*(po|pa|pc)/g;
  let total = 0;
  let found = false;
  for (const m of t.matchAll(re)) { found = true; total += Number(m[1]) * (m[2] === 'po' ? 100 : m[2] === 'pa' ? 10 : 1); }
  if (!found || t.replace(re, '').trim() !== '') return null;
  return total;
}

/** Champ de montant : affiche « 2 pa 6 pc », accepte la même écriture ou un nombre de pièces de cuivre. */
export function MoneyField({ value, onCommit, label, min = 1, width = 110 }: { value: M; onCommit: (v: M) => void; label: string; min?: number; width?: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = parseMoney(draft);
    setDraft(null);
    if (v !== null && Math.max(min, v) !== value) onCommit(Math.max(min, v));
  };
  return (
    <input type="text" class="money-field" inputMode="text" value={draft ?? money(value)} aria-label={label} style={{ width }}
      title="Écris par exemple « 2 pa 6 pc » ou « 26 » (en pièces de cuivre)"
      onFocus={(e) => (e.target as HTMLInputElement).select()}
      onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur(); } if (e.key === 'Escape') setDraft(null); }} />
  );
}

/**
 * Prix fixé directement par le joueur (v1.1). Pas de référence chiffrée : on montre le verdict des clients,
 * le prix du concurrent en ville et les refus du jour.
 */
export function PriceInput(props: {
  label: string; sub?: string; price: M; refPrice: M; competitor?: M; refusals?: number;
  onCommit: (price: M) => void; disabled?: boolean;
}) {
  const v = priceVerdict(props.price, props.refPrice);
  const step = props.price < 20 ? 1 : Math.max(1, Math.round(props.price * 0.05));
  return (
    <div class="slider-row price-row">
      <div>
        <div><strong>{props.label}</strong> {props.sub && <span class="hint">{props.sub}</span>}</div>
        <div class="ref">
          {props.competitor !== undefined ? <>En ville : {money(props.competitor)}</> : null}
          {props.refusals ? <>{props.competitor !== undefined ? ' · ' : ''}<span class="tag seal">{props.refusals} refus aujourd'hui</span></> : null}
        </div>
      </div>
      <div class="row price-edit">
        <button class="btn ghost small" disabled={props.disabled || props.price <= 1} aria-label={`Baisser le prix : ${props.label}`} onClick={() => props.onCommit(Math.max(1, props.price - step))}>−</button>
        <MoneyField value={props.price} label={`Prix : ${props.label}`} onCommit={props.onCommit} />
        <button class="btn ghost small" disabled={props.disabled} aria-label={`Monter le prix : ${props.label}`} onClick={() => props.onCommit(props.price + step)}>+</button>
      </div>
      <div class="price"><span class={`tag ${v.tone}`} title="Ce qu'en pensent les aventuriers, selon la qualité du service">{v.label}</span></div>
    </div>
  );
}

/**
 * Champ numérique. La saisie reste locale jusqu'à Entrée ou la sortie du champ : les mises à jour
 * de la partie (plusieurs par seconde) ne l'écrasent plus, et un champ vidé ne saute plus à 1.
 * `live` : chaque valeur valide est transmise pendant la frappe (pour un état local de l'écran).
 */
export function NumField({ value, onCommit, min, max, step, width, label, live }: {
  value: number; onCommit: (v: number) => void; min?: number; max?: number; step?: number; width?: number; label?: string; live?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const parse = (t: string): number | null => {
    const n = Number(t);
    if (t.trim() === '' || !Number.isFinite(n)) return null;
    return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Math.round(n)));
  };
  const commit = () => {
    if (draft === null) return;
    const v = parse(draft);
    setDraft(null);
    if (v !== null && v !== value) onCommit(v);
  };
  return (
    <input type="number" inputMode="numeric" min={min} max={max} step={step} value={draft ?? String(value)}
      style={width ? { width } : undefined} aria-label={label}
      onInput={(e) => {
        const t = (e.target as HTMLInputElement).value;
        setDraft(t);
        const v = live ? parse(t) : null;
        if (v !== null && v !== value) onCommit(v);
      }}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
  );
}

export function Kpi({ k, v, title }: { k: string; v: ComponentChildren; title?: string }) {
  return <div class="kpi" title={title}><div class="k">{k}</div><div class="v">{v}</div></div>;
}
