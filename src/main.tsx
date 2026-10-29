import { render } from 'preact';
import { App } from './ui/App';
import { applyTextSize } from './ui/prefs';
import './ui/styles.css';

try {
  const theme = localStorage.getItem('theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch { /* stockage indisponible */ }

applyTextSize();
render(<App />, document.getElementById('app')!);

// Application installable et jouable hors ligne (8.7). Pas en développement, pour ne pas gêner le rechargement à chaud.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('sw.js'); });
}
