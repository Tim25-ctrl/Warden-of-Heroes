// Composants partagés de l'interface.
import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { CLASSES } from '../sim/data';
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

/** Curseur de prix ×0,5 à ×3,0 autour du prix de référence (1.3.3). */
export function PriceSlider(props: {
  label: string; sub?: string; value: number; price: M; refPrice: M; competitor?: M; refusals?: number;
  onCommit: (v: number) => void; disabled?: boolean;
}) {
  const [local, setLocal] = useState(props.value);
  useEffect(() => setLocal(props.value), [props.value]);
  const shown = Math.max(1, Math.round(props.refPrice * local));
  const ratio = local;
  const tone = ratio <= 0.9 ? 'sage' : ratio <= 1.1 ? '' : ratio <= 1.4 ? 'amber' : 'seal';
  return (
    <div class="slider-row">
      <div>
        <div><strong>{props.label}</strong> {props.sub && <span class="hint">{props.sub}</span>}</div>
        <div class="ref" title="Prix de référence = prix de base × qualité × prospérité">
          Référence {money(props.refPrice)}
          {props.competitor !== undefined && <> · concurrent {money(props.competitor)}</>}
          {props.refusals ? <> · <span class="tag seal">{props.refusals} refus aujourd'hui</span></> : null}
        </div>
      </div>
      <input
        type="range" min={0.5} max={3} step={0.05} value={local} disabled={props.disabled}
        aria-label={`Curseur de prix : ${props.label}`}
        onInput={(e) => setLocal(Number((e.target as HTMLInputElement).value))}
        onChange={(e) => props.onCommit(Number((e.target as HTMLInputElement).value))}
      />
      <div class="price">
        {money(shown)} <span class={`tag ${tone}`}>×{local.toFixed(2).replace('.', ',')}</span>
      </div>
    </div>
  );
}

export function Kpi({ k, v, title }: { k: string; v: ComponentChildren; title?: string }) {
  return <div class="kpi" title={title}><div class="k">{k}</div><div class="v">{v}</div></div>;
}
