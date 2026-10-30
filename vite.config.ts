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
  define: { __APP_VERSION__: JSON.stringify(pkg.version.replace(/\.0$/, '')) },
});
