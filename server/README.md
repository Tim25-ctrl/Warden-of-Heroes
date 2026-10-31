# Service de notifications de Warden of Heroes

Petit serveur qui envoie les alertes du mode Chronique quand le jeu est fermé, en vraies notifications du jeu (Web Push).
Il tourne sur **Cloudflare Workers**, offre gratuite (GDD 7.7.2, 8.7, D-168).

- Il ne connaît ni la partie ni le joueur : un identifiant tiré au hasard, l'abonnement aux notifications du navigateur
  et la liste des alertes à venir, effacée une fois envoyée ou quand le joueur revient.
- Un « Durable Object » par joueur garde cette liste et se réveille à l'heure de la prochaine alerte.
- Le chiffrement (RFC 8291) et la signature VAPID (RFC 8292) sont dans `src/webpush.ts`, testés par `tests/push.test.ts`.

## Mise en ligne (une seule fois)

Depuis la racine du projet :

1. Crée un compte gratuit sur https://dash.cloudflare.com/sign-up (aucune carte demandée pour l'offre Free).
2. `npm run push:install` : installe l'outil Cloudflare (wrangler).
3. `npm run push:login` : ouvre le navigateur pour autoriser wrangler sur ton compte.
4. `npm run push:setup` : crée les clés, publie le service, lui donne ses clés secrètes et écrit `src/push.json`.
5. Commite et pousse `src/push.json` : le jeu en ligne propose alors « Notifications du jeu » dans les Options.

Les clés privées restent dans `server/.vapid.json` (ignoré par git) et dans les secrets Cloudflare. Ne les perds pas :
de nouvelles clés obligeraient chaque joueur à réactiver les notifications.

## Mettre à jour le service

`npm --prefix server run deploy`

## Comptes joueurs (D-173)

Le même service garde les comptes et les sauvegardes en ligne (`src/accounts.ts`, un « Durable Object » par compte).
`npm run push:setup` crée aussi le secret des jetons de session (`SESSION_SECRET`, gardé dans `server/.vapid.json`).

### E-mails « mot de passe oublié » (Brevo, gratuit)

1. Crée un compte gratuit sur https://www.brevo.com (300 e-mails par jour).
2. Dans Brevo, ajoute et vérifie une adresse d'expédition (« Senders » : un clic dans l'e-mail de confirmation).
   Une adresse dédiée au jeu évite de montrer ton adresse personnelle aux joueurs.
3. Crée une clé d'API (« SMTP & API » › « API Keys »).
4. `npm run push:mail` : colle la clé, puis l'adresse d'expédition.
