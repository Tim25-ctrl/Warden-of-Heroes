# Warden of Heroes

*Le gardien de la guilde.*

Simulation de gestion indirecte d'un siège de guilde d'aventuriers autonomes, jouable dans le navigateur.
La conception complète est dans [GDD.md](GDD.md).

**État actuel :** version 1.0, les 4 tranches du GDD (8.11) : la guilde complète, le monde vivant, les Sceaux royaux et la méta-progression, modes Classique et Chronique, application installable et jouable hors ligne.

En développement (`npm run dev`), la console du navigateur permet d'avancer le temps : `window.__guilde.advance(24 * 7)` pour une semaine (l'avance s'arrête à chaque décision).

## Lancer le jeu

```bash
npm install
npm run dev
```

Puis ouvrir http://localhost:5173.

## Publier le jeu

`npm run build` produit un site statique dans `dist/`, à déposer sur n'importe quel hébergement statique en HTTPS (le jeu s'installe alors comme une application et fonctionne hors ligne). Les chemins sont relatifs : un sous-dossier convient aussi. Pour l'essayer en local : `npm run preview`.

## Commandes utiles

| Commande | Rôle |
|----------|------|
| `npm run dev` | Serveur de développement |
| `npm run build` | Vérification des types et version de production dans `dist/` |
| `npm test` | Tests automatiques (formules, déterminisme, sauvegarde, rattrapage) |
| `npm run sim -- --days 112 --seeds 8` | Simulateur d'équilibrage avec un joueur-robot (`--bot passif` pour une guilde laissée à elle-même, `--verbose` pour le journal) |
| `npm run inspect -- --seed 1 --days 10 --cat quetes` | Journal et état des aventuriers d'une partie, pour le diagnostic |

## Organisation du code

| Dossier | Contenu |
|---------|---------|
| `src/sim/` | Cœur de simulation, sans aucune dépendance ni affichage (GDD 8.1) |
| `src/sim/data/` | Contenus et paramètres d'équilibrage en JSON (GDD 8.4 et 8.12) |
| `src/worker/` | Tâche de fond qui fait tourner la simulation |
| `src/ui/` | Interface Preact et vue en coupe en Canvas |
| `tools/` | Simulateur d'équilibrage, outil de diagnostic, générateur d'icônes (`node tools/make-icons.mjs`) |
| `public/` | Manifeste, service worker et icônes de l'application installable |
| `tests/` | Tests Vitest |
