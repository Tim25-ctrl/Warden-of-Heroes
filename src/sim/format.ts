// Affichage de la monnaie et du temps (GDD 1.1.1 et 0.5).
import { P } from './data';
import type { Money } from './types';

/** Calendrier (ajusté en v1.1, D-152) : saisons de 14 jours, année de 56 jours. */
export const SEASON_DAYS: number = P.temps.joursParSaison;
export const YEAR_DAYS = 4 * SEASON_DAYS;

/** 345 → « 3 po 4 pa 5 pc » */
export function money(v: Money): string {
  const neg = v < 0;
  let n = Math.abs(Math.round(v));
  const po = Math.floor(n / 100);
  n -= po * 100;
  const pa = Math.floor(n / 10);
  const pc = n - pa * 10;
  const parts: string[] = [];
  if (po) parts.push(`${po.toLocaleString('fr-FR')} po`);
  if (pa) parts.push(`${pa} pa`);
  if (pc || parts.length === 0) parts.push(`${pc} pc`);
  return (neg ? '−' : '') + parts.join(' ');
}

/** Version courte, arrondie à la pièce d'argent au-delà de 10 po. */
export function moneyShort(v: Money): string {
  if (Math.abs(v) >= 1000) return `${v < 0 ? '−' : ''}${Math.round(Math.abs(v) / 100).toLocaleString('fr-FR')} po`;
  return money(v);
}

export const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver'];

export function dayOf(tick: number): number { return Math.floor(tick / 24) + 1; }
export function hourOf(tick: number): number { return tick % 24; }
export function weekdayOf(tick: number): number { return ((dayOf(tick) - 1) % 7) + 1; }
export function seasonOf(tick: number): number { return Math.floor((dayOf(tick) - 1) / SEASON_DAYS) % 4; }
export function yearOf(tick: number): number { return Math.floor((dayOf(tick) - 1) / YEAR_DAYS) + 1; }
/** Jour dans la saison, de 1 à SEASON_DAYS. */
export function dayInSeason(tick: number): number { return ((dayOf(tick) - 1) % SEASON_DAYS) + 1; }
/** Premier jour d'une saison ? */
export const isSeasonStart = (day: number) => (day - 1) % SEASON_DAYS === 0 && day > 1;

export function phaseOf(tick: number): string {
  const h = hourOf(tick);
  if (h >= 6 && h < 12) return 'Matin';
  if (h >= 12 && h < 18) return 'Après-midi';
  if (h >= 18 && h < 22) return 'Soir';
  return 'Nuit';
}

export function clockLabel(tick: number): string {
  const d = dayOf(tick);
  const dayInSeason = ((d - 1) % SEASON_DAYS) + 1;
  return `${SEASONS[seasonOf(tick)]} · J${dayInSeason} · an ${yearOf(tick)} · ${String(hourOf(tick)).padStart(2, '0')}h`;
}

export function stamp(tick: number): string {
  return `J${dayOf(tick)} · ${String(hourOf(tick)).padStart(2, '0')}h`;
}

export function pct(v: number): string { return `${Math.round(v * 100)} %`; }

/** Lien cliquable dans le journal : [[a:12|Brom]] → ouvre la fiche de l'aventurier 12. */
export function advLink(a: { id: number; name: string }): string {
  return `[[a:${a.id}|${a.name}]]`;
}
