// Journal de bord (GDD 7.6) : catégories, niveaux, noms cliquables.
import { useMemo, useState } from 'preact/hooks';
import { stamp } from '../sim/format';
import type { GameState, LogCat, LogLvl } from '../sim/types';
import { RichText } from './components';

const CATS: [LogCat, string, string][] = [
  ['economie', '💰', 'Économie'],
  ['aventuriers', '👤', 'Aventuriers'],
  ['quetes', '⚔', 'Quêtes'],
  ['monde', '🗺', 'Monde'],
  ['guilde', '🏰', 'Guilde'],
];
const LVLS: [LogLvl, string][] = [['critique', 'Critique'], ['important', 'Important'], ['info', 'Info'], ['detail', 'Détail']];
const ICON = Object.fromEntries(CATS.map(([c, i]) => [c, i]));

function load<T>(key: string, def: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : def; } catch { return def; }
}
function store(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* stockage indisponible */ } }

export function Journal({ s, onClose }: { s: GameState; onClose: () => void }) {
  const [cats, setCats] = useState<LogCat[]>(() => load('journal.cats', CATS.map(([c]) => c)));
  const [lvls, setLvls] = useState<LogLvl[]>(() => load('journal.lvls', ['critique', 'important', 'info']));
  const toggle = <T,>(list: T[], v: T, set: (l: T[]) => void, key: string) => {
    const next = list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
    set(next);
    store(key, next);
  };
  const entries = useMemo(
    () => s.journal.filter((e) => cats.includes(e.cat) && lvls.includes(e.lvl)).slice(-300).reverse(),
    [s.journal, s.journal.length, cats, lvls, s.tick],
  );
  return (
    <aside class="journal" aria-label="Journal de bord">
      <header>
        <h3>Journal</h3>
        <button class="btn ghost small" onClick={onClose} title="Replier le journal">»</button>
      </header>
      <div class="filters">
        {CATS.map(([c, i, label]) => (
          <button class={`chip ${cats.includes(c) ? 'on' : ''}`} aria-pressed={cats.includes(c)} onClick={() => toggle(cats, c, setCats, 'journal.cats')}>{i} {label}</button>
        ))}
      </div>
      <div class="filters">
        {LVLS.map(([l, label]) => (
          <button class={`chip ${lvls.includes(l) ? 'on' : ''}`} aria-pressed={lvls.includes(l)} onClick={() => toggle(lvls, l, setLvls, 'journal.lvls')}>{label}</button>
        ))}
      </div>
      <div class="entries">
        {entries.length === 0 && <p class="empty" style={{ padding: '8px 12px' }}>Rien à signaler.</p>}
        {entries.map((e) => (
          <div key={e.id} class={`entry ${e.lvl}`}>
            <span class="t">{stamp(e.tick)}</span>
            <span aria-hidden="true">{ICON[e.cat]}</span>
            <span><RichText text={e.text} /></span>
          </div>
        ))}
      </div>
    </aside>
  );
}
