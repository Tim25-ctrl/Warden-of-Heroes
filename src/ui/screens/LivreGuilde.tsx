// Le Livre de la guilde (GDD 6.9, 7.5.9) : une chronique par saison, des courbes, un export.
import { dayOf, SEASONS, seasonOf, yearOf } from '../../sim/format';
import type { GameState } from '../../sim/types';
import { LineChart } from './Chroniques';

function exportBook(s: GameState): void {
  const lines = [`# Le Livre de la guilde (graine ${s.seed})`, ''];
  for (const c of s.book.chapters) {
    lines.push(`## ${c.title}`, '', ...c.lines.map((l) => `- ${l}`), '');
  }
  if (s.book.current.length) {
    lines.push(`## ${SEASONS[seasonOf(s.tick)]} de l'an ${yearOf(s.tick)} (en cours)`, '', ...s.book.current.map((l) => `- ${l}`), '');
  }
  lines.push('## Relevés hebdomadaires', '', '| Jour | Trésorerie (po) | Renommée | Prospérité | Danger | Aventuriers |', '|---|---|---|---|---|---|');
  for (const w of s.book.weekly) lines.push(`| ${w.day} | ${Math.round(w.treasury / 100)} | ${w.renown} | ${w.prosperity} | ${w.danger} | ${w.adventurers} |`);
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `livre-de-la-guilde-jour-${dayOf(s.tick)}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function LivreGuilde({ s }: { s: GameState }) {
  const w = s.book.weekly;
  const maxRenown = Math.max(100, ...w.map((x) => x.renown));
  const maxAdv = Math.max(20, ...w.map((x) => x.adventurers));
  const maxTreasury = Math.max(1000, ...w.map((x) => Math.round(x.treasury / 100)));
  return (
    <div>
      <div class="screen-head">
        <h2>Le Livre de la guilde</h2>
        <span class="hint">La mémoire des histoires de ta guilde, un chapitre par saison.</span>
        <span class="spacer" />
        <button class="btn ghost" onClick={() => exportBook(s)}>Exporter (texte)</button>
      </div>
      <div class="grid2">
        <div class="panel">
          <h3>Renommée et aventuriers</h3>
          <LineChart max={maxRenown} series={[{ label: 'Renommée', color: 'var(--gold)', values: w.map((x) => x.renown) }]} />
          <LineChart max={maxAdv} height={90} series={[{ label: 'Aventuriers', color: 'var(--blue)', values: w.map((x) => x.adventurers) }]} />
        </div>
        <div class="panel">
          <h3>Trésorerie et région</h3>
          <LineChart max={maxTreasury} series={[{ label: 'Trésorerie (po)', color: 'var(--sage)', values: w.map((x) => Math.max(0, Math.round(x.treasury / 100))) }]} />
          <LineChart height={90} series={[
            { label: 'Prospérité', color: 'var(--sage)', values: w.map((x) => x.prosperity) },
            { label: 'Danger', color: 'var(--seal)', values: w.map((x) => x.danger) },
          ]} />
        </div>
      </div>
      <div class="panel book">
        <h3>{SEASONS[seasonOf(s.tick)]} de l'an {yearOf(s.tick)} <small class="hint">(en cours)</small></h3>
        {s.book.current.length === 0 ? <p class="empty">Rien d'écrit pour l'instant cette saison.</p>
          : <ul>{s.book.current.map((l) => <li>{l}</li>)}</ul>}
      </div>
      {[...s.book.chapters].reverse().map((c) => (
        <div class="panel book">
          <h3>{c.title}</h3>
          <ul>{c.lines.map((l) => <li>{l}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}
