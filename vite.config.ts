import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  // Chemins relatifs : le jeu fonctionne sur n'importe quel hébergement statique, même dans un sous-dossier (8.8).
  base: './',
  plugins: [preact()],
  worker: { format: 'es' },
  server: { port: 5173 },
});
