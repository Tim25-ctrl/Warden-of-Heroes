// Barre du haut, toujours visible (GDD 7.4, refonte v1.1) : des pastilles avec une icône et un mot clair.
import {
  IconAlertTriangle, IconBuildingCommunity, IconCoins, IconMoon, IconPlayerPause, IconPlayerPlay, IconRosette, IconShieldCheck,
  IconSun, IconUsers,
} from '@tabler/icons-preact';
import { P } from '../sim/data';
import { clockLabel, hourOf, phaseOf } from '../sim/format';
import type { GameState } from '../sim/types';
import { dangerTier, PALIER_NAMES } from '../sim/world';
import { diff, sealOf } from '../sim/legend';
import { Money, useNav } from './components';
import { game } from './store';

const SPEEDS: [number, string, string][] = [
  [0, 'pause', 'Pause (Espace)'],
  [1, 'x1', 'Vitesse x1 : 1 jour = 5 min (touche 1)'],
  [2, '×2', 'Vitesse x2 (touche 2)'],
  [4, '×4', 'Vitesse x4 (touche 3)'],
  [8, '×8', 'Vitesse x8 (touche 4)'],
];
const ICON = { size: 20, stroke: 1.75 };

export function TopBar({ s, speed }: { s: GameState; speed: number }) {
  const nav = useNav();
  const dayStart = s.ledger.length ? s.ledger[s.ledger.length - 1].tresorerieFin : P.economie.tresorerieDepart;
  const delta = s.treasury - dayStart;
  const present = s.adventurers.filter((a) => a.activity.kind !== 'quete').length;
  const away = s.adventurers.length - present;
  const debtLeft = diff(s).faillite - s.debtDays;
  const tier = dangerTier(s.danger);
  const night = hourOf(s.tick) >= 20 || hourOf(s.tick) < 6;
  return (
    <header class="topbar">
      <span class="brand">Warden of Heroes</span>
      <button class={`pill money ${s.treasury < 0 ? 'bad' : ''}`} onClick={() => nav.go('livre')} title="Trésorerie de la guilde et variation depuis minuit. Ouvre le Livre de comptes.">
        <IconCoins {...ICON} class="pi gold" />
        <span class="v"><Money v={s.treasury} /></span>
        {delta !== 0 && <small><Money v={delta} signed /> aujourd'hui</small>}
        {s.treasury < 0 && <span class="tag seal">saisie dans {debtLeft} j</span>}
      </button>
      <button class="pill secondary" onClick={() => nav.go('charte')} title="Sceau royal de la guilde (son rang) et renommée. Ouvre la Charte.">
        <IconRosette {...ICON} class="pi gold" />
        <span class="v">{sealOf(s.rank).nom.replace(/^Sceau (de |d')/, '')}</span>
        <small>{Math.round(s.renown).toLocaleString('fr-FR')} pts</small>
      </button>
      <button class={`pill secondary tier-${tier.idx}`} onClick={() => nav.go('carte')} title={`Danger de la région : ${s.danger} sur 100. Ouvre la Carte.`}>
        {tier.idx >= 2 ? <IconAlertTriangle {...ICON} class="pi" /> : <IconShieldCheck {...ICON} class="pi" />}
        <span class="v">{tier.nom}</span>
        <small>danger {s.danger}</small>
      </button>
      <button class="pill secondary" onClick={() => nav.go('chroniques')} title={`Prospérité de la ville : ${Math.round(s.prosperity)} sur 100. Ouvre les Chroniques.`}>
        <IconBuildingCommunity {...ICON} class="pi sage" />
        <span class="v">{PALIER_NAMES[s.world.palier]}</span>
        <small>prospérité {Math.round(s.prosperity)}</small>
      </button>
      <button class="pill" onClick={() => nav.go('aventuriers')} title="Aventuriers de la guilde : au siège et en quête">
        <IconUsers {...ICON} class="pi" />
        <span class="v">{s.adventurers.length}</span>
        <small>{present} au siège · {away} en quête</small>
      </button>
      <div class="clock">
        {night ? <IconMoon {...ICON} class="pi blue" /> : <IconSun {...ICON} class="pi gold" />}
        <div class="date" title={phaseOf(s.tick)}><b>{clockLabel(s.tick)}</b><small>{phaseOf(s.tick)}</small></div>
        {s.mode === 'chronique'
          ? <span class="tag sage" title="Mode Chronique : 1 heure de jeu = 1 heure réelle. Le temps continue quand le jeu est fermé (7 jours au plus).">● en direct</span>
          : <div class="speeds" role="group" aria-label="Vitesse du temps">
              {SPEEDS.map(([v, label, title]) => (
                <button class={speed === v ? 'on' : ''} title={title} aria-label={title} aria-pressed={speed === v} onClick={() => game.setSpeed(v)} disabled={!!s.gameOver}>
                  {label === 'pause' ? <IconPlayerPause size={16} /> : label === 'x1' ? <IconPlayerPlay size={16} /> : label}
                </button>
              ))}
            </div>}
      </div>
    </header>
  );
}
