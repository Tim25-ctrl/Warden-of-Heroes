// Barre du haut, toujours visible (GDD 7.4).
import { P } from '../sim/data';
import { clockLabel, phaseOf } from '../sim/format';
import type { GameState } from '../sim/types';
import { dangerTier, PALIER_NAMES } from '../sim/world';
import { diff, sealOf } from '../sim/legend';
import { Money, useNav } from './components';
import { game } from './store';

const SPEEDS: [number, string, string][] = [
  [0, '⏸', 'Pause (Espace)'],
  [1, '▶', 'Vitesse x1 : 1 jour = 5 min (touche 1)'],
  [2, '▶▶', 'Vitesse x2 (touche 2)'],
  [4, '▶▶▶', 'Vitesse x4 (touche 3)'],
  [8, '×8', 'Vitesse x8 (touche 4)'],
];

export function TopBar({ s, speed }: { s: GameState; speed: number }) {
  const nav = useNav();
  const dayStart = s.ledger.length ? s.ledger[s.ledger.length - 1].tresorerieFin : P.economie.tresorerieDepart;
  const delta = s.treasury - dayStart;
  const present = s.adventurers.filter((a) => a.activity.kind !== 'quete').length;
  const away = s.adventurers.length - present;
  const debtLeft = diff(s).faillite - s.debtDays;
  return (
    <header class="topbar">
      <span class="brand">Warden of Heroes</span>
      <span class="stat" title="Trésorerie de la guilde et variation depuis minuit">
        <span class="k">Trésorerie</span>
        <button class={`v ${s.treasury < 0 ? 'debt' : ''}`} onClick={() => nav.go('livre')}><Money v={s.treasury} /></button>
        {delta !== 0 && <small><Money v={delta} signed /></small>}
        {s.treasury < 0 && <span class="tag seal">Saisie dans {debtLeft} j</span>}
      </span>
      <span class="stat secondary" title="Rang de la guilde (les Sceaux royaux) et Renommée en points. Ouvre la Charte.">
        <span class="k">Sceau</span><button class="v" style={{ color: 'var(--gold)' }} onClick={() => nav.go('charte')}>{sealOf(s.rank).nom.replace('Sceau ', '')}</button>
        <small>{Math.round(s.renown)} pts</small>
      </span>
      <span class="stat secondary" title={`Danger régional : ${dangerTier(s.danger).nom}. Voir la Carte.`}>
        <span class="k">Danger</span><button class="v" onClick={() => nav.go('carte')}>{s.danger}</button>
        <span class="minigauge"><span style={{ width: `${s.danger}%`, background: 'var(--seal)' }} /></span>
        <small>{dangerTier(s.danger).nom}</small>
      </span>
      <span class="stat secondary" title={`Prospérité de la ville, palier ${PALIER_NAMES[s.world.palier]}. Voir les Chroniques.`}>
        <span class="k">Prospérité</span><button class="v" onClick={() => nav.go('chroniques')}>{Math.round(s.prosperity)}</button>
        <span class="minigauge"><span style={{ width: `${s.prosperity}%`, background: 'var(--sage)' }} /></span>
        <small>{PALIER_NAMES[s.world.palier]}</small>
      </span>
      <span class="stat" title={phaseOf(s.tick)}>
        <span class="v">{clockLabel(s.tick)}</span><small>{phaseOf(s.tick)}</small>
      </span>
      <span class="stat" title="Aventuriers présents au siège / en quête / total">
        <span class="k">Effectifs</span>
        <button class="v" onClick={() => nav.go('aventuriers')}>{present} / {away} / {s.adventurers.length}</button>
      </span>
      {s.mode === 'chronique'
        ? <span class="stat live" title="Mode Chronique : 1 heure de jeu = 1 heure réelle. Le temps continue quand le jeu est fermé (7 jours au plus).">
            <span class="tag sage">● en direct</span><small>{new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</small>
          </span>
        : <div class="speeds" role="group" aria-label="Vitesse du temps">
            {SPEEDS.map(([v, label, title]) => (
              <button class={speed === v ? 'on' : ''} title={title} aria-pressed={speed === v} onClick={() => game.setSpeed(v)} disabled={!!s.gameOver}>{label}</button>
            ))}
          </div>}
    </header>
  );
}
