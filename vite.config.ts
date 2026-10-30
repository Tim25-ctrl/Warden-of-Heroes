import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  // Chemins relatifs : le jeu fonctionne sur n'importe quel hébergement statique, même dans un sous-dossier (8.8).
  base: './',
  plugins: [preact()],
  worker: { format: 'es' },
  server: { port: 5173 },
  // Numéro de version affiché dans le jeu, tiré de package.json (« 1.1.0 » devient « 1.1 »).
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version.replace(/\.0$/, '')),
    // Date de construction, affichée à côté du numéro : on voit d'un coup d'œil si la version en ligne est à jour.
    __BUILD_DATE__: JSON.stringify(new Date().toLocaleDateString('fr-FR')),
  },
});
