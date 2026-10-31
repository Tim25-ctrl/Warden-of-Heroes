// Mode Chronique sans alertes (v1.1, D-172) : on dit clairement que les notifications sont coupées, ce qui peut
// arriver pendant l'absence du joueur, et on propose de les activer d'un geste.
import { IconBellOff } from '@tabler/icons-preact';
import { useState } from 'preact/hooks';
import { alertsActive, enablePush, pushReady } from './alerts';
import { useNav } from './components';
import { game } from './store';

/** Ce qui peut arriver pendant l'absence du joueur, sans alertes. */
export const RISKS = [
  'un aventurier peut mourir en quête ou quitter la guilde ;',
  'un assaut ou une épidémie peut frapper la ville ;',
  'une décision sans réponse est prise à ta place au bout de 12 heures ;',
  'la trésorerie peut passer dans le rouge, jusqu\'à la saisie du siège.',
];

export function AlertWarning({ compact = false, onEnabled }: { compact?: boolean; onEnabled?: () => void }) {
  const nav = useNav();
  const [, redraw] = useState(0);
  const [msg, setMsg] = useState('');
  if (alertsActive()) return null;
  const activate = async () => {
    setMsg('');
    const err = await enablePush();
    if (err) { setMsg(err); return; }
    game.syncForecast();
    onEnabled?.();
    redraw((x) => x + 1);
  };
  return (
    <div class={`panel alert-warning ${compact ? 'compact' : ''}`} role="note">
      <h3><IconBellOff size={20} stroke={1.75} aria-hidden="true" /> Notifications désactivées</h3>
      <p>En mode Chronique, ta guilde continue de vivre <b>jusqu'à 7 jours</b> quand le jeu est fermé, <b>sans te prévenir</b> :</p>
      {!compact && <ul>{RISKS.map((r) => <li>{r}</li>)}</ul>}
      {compact && <p class="soft">{RISKS.map((r) => r.replace(/ ;$|\.$/, '')).join(' ; ')}.</p>}
      <p class="soft">Avec les notifications, tu es prévenu à temps, et la guilde se met en pause quand il n'y a plus d'alerte à t'envoyer.</p>
      <div class="row">
        {pushReady() && <button class="btn seal small" onClick={() => void activate()}>Activer les notifications</button>}
        {nav.screen !== 'options' && game.state && <button class="btn ghost small" onClick={() => nav.go('options')}>Autres choix (Options)</button>}
      </div>
      {msg && <p class="hint"><b>{msg}</b></p>}
    </div>
  );
}
