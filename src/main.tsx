import { render } from 'preact';
import { App } from './ui/App';
import { applyTextSize } from './ui/prefs';
import { game } from './ui/store';
import './ui/styles.css';

try {
  const theme = localStorage.getItem('theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch { /* stockage indisponible */ }

applyTextSize();
render(<App />, document.getElementById('app')!);

// Application installable et jouable hors ligne (8.7). Pas en développement, pour ne pas gêner le rechargement à chaud.
// Mises à jour (v1.1) : on vérifie s'il existe une nouvelle version à chaque retour sur le jeu. Quand elle s'installe,
// on recharge tout de suite si aucune partie n'est ouverte ; sinon un bandeau propose de sauvegarder et de recharger.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void reg.update(); });
    });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;   // première installation : rien à mettre à jour
    if (!game.state) location.reload();
    else window.dispatchEvent(new Event('guilde-nouvelle-version'));
  });
}
