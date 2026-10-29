# GAME DESIGN DOCUMENT — Warden of Heroes

> **Titre :** *Warden of Heroes*, sous-titre français *Le gardien de la guilde* (D-115). « Siège de Guilde », le titre de travail, reste le nom du bâtiment dans le jeu.

> **Genre :** Simulation de gestion indirecte / écosystème autonome
> **Plateforme :** Navigateur, ordinateur en priorité, installable comme application (téléphone en mode consultation en v1)
> **Statut du document :** v2.0 — GDD complet (chapitres 0 à 8). Les 4 tranches sont développées : **version 1.0 du jeu**. Ajustements d'équilibrage et écarts restants reportés en 8.11.1 à 8.11.4
> **Convention :** toutes les valeurs chiffrées sont des **valeurs initiales d'équilibrage**. Elles sont centralisées dans la table des paramètres (8.12) et seront ajustées avec le simulateur d'équilibrage (8.10.1).

---

## Sommaire

- [0. Vision et cadrage](#0-vision-et-cadrage)
- [1. Économie de base et siège de la guilde](#1-économie-de-base-et-siège-de-la-guilde)
- [2. Marché des monstres et économie rétroactive](#2-marché-des-monstres-et-économie-rétroactive)
- [3. Les aventuriers (agents autonomes)](#3-les-aventuriers-agents-autonomes)
- [4. Quêtes et tableau des primes](#4-quêtes-et-tableau-des-primes)
- [5. Monde vivant](#5-monde-vivant)
- [6. Progression et méta](#6-progression-et-méta)
- [7. Interface et tableau de bord](#7-interface-et-tableau-de-bord)
- [8. Annexe technique et équilibrage](#8-annexe-technique-et-équilibrage)
- [Journal des décisions](#journal-des-décisions)

---

## 0. Vision et cadrage

### 0.1 Pitch

> **« Tu ne diriges pas les héros. Tu diriges l'endroit où ils vivent. »**

Le joueur est le **Maître de Guilde**. Il gère le siège où logent, mangent, s'entraînent et se soignent des aventuriers **entièrement autonomes**. Les aventuriers partent en quête, rapportent or et dépouilles de monstres, puis dépensent leur argent dans les services de la guilde. Le joueur ne leur donne jamais d'ordre : il façonne leur environnement (prix, infrastructures, personnel, primes) et regarde l'écosystème réagir.

### 0.2 Piliers de design

| # | Pilier | Ce que ça implique |
|---|--------|--------------------|
| 1 | **Gestion indirecte** | Aucune commande directe aux aventuriers. Chaque levier du joueur agit sur leurs *motivations*, pas sur leurs actions. |
| 2 | **Économie circulaire** | Chaque pièce circule : aventurier → services → trésorerie → salaires et achats → monde → récompenses de quête → aventurier. Aucune ressource n'apparaît « de nulle part » sans source identifiable. |
| 3 | **Monde lisible** | Toute conséquence a une cause traçable dans le journal. Le joueur doit toujours pouvoir répondre à « pourquoi X est parti ? » ou « pourquoi le prix du cuir a doublé ? ». |
| 4 | **Histoires émergentes** | Des individus nommés, des équipes, des rivalités, des morts. Le joueur s'attache à ses aventuriers. |

### 0.3 Rôle du joueur

**Ce que le joueur contrôle :**
- construire et agrandir les salles, acheter des améliorations ;
- fixer les tarifs de chaque service ;
- recruter, augmenter et licencier le personnel et les professeurs ;
- gérer les stocks (denrées, remèdes) et vendre ou transformer les dépouilles ;
- régler la fiscalité de la guilde ;
- **publier ses propres primes** sur le tableau des quêtes, son seul levier « actif » sur les aventuriers ;
- définir les **consignes de l'intendant**, des règles automatiques (voir 1.10).

**Ce que le joueur ne contrôle pas :**
- les décisions des aventuriers (quête choisie, repas, sommeil, départ) ;
- la composition des équipes ;
- le déroulement des quêtes et des combats ;
- les événements du monde.

### 0.4 Boucles de jeu

| Boucle | Durée | Actions typiques du joueur |
|--------|-------|----------------------------|
| **Courte** | 1 heure de jeu | Observer, réagir aux alertes (file d'attente au réfectoire, blessé grave), ajuster un prix. |
| **Moyenne** | 1 jour | Lire le bilan comptable, réapprovisionner, vendre des dépouilles, recruter, publier des primes. |
| **Longue** | 1 semaine à 1 saison | Lancer des travaux, payer la taxe royale, viser le rang de renommée suivant, encaisser les événements régionaux. |

### 0.5 Gestion du temps

#### Unités

| Unité | Valeur |
|-------|--------|
| **Tick** | 1 heure de jeu (pas élémentaire de la simulation) |
| **Jour** | 24 ticks, découpés en 4 phases |
| **Semaine** | 7 jours (le 7ᵉ est le *Jour du Roi* : la taxe royale est prélevée) |
| **Saison** | 4 semaines = 28 jours |
| **Année** | 4 saisons = 112 jours |

#### Phases de la journée

| Phase | Heures | Activités dominantes |
|-------|--------|----------------------|
| **Matin** | 06h–12h | Petit-déjeuner, départs en quête, séances d'entraînement |
| **Après-midi** | 12h–18h | Déjeuner, entraînement, soins, retours de quête |
| **Soir** | 18h–22h | Dîner, taverne, vie sociale, formation des équipes |
| **Nuit** | 22h–06h | Sommeil, bilan comptable à minuit, événements nocturnes |

#### Deux modes de jeu

**Mode Classique** (mode principal)
- 1 jour de jeu = **5 minutes réelles** en vitesse x1, soit 1 tick toutes les 12,5 s.
- Vitesses : **Pause / x1 / x2 / x4 / x8**.
- Pause automatique en option sur les alertes critiques (faillite imminente, mort d'un aventurier, événement majeur).

**Mode Chronique** (temps réel)
- 1 heure de jeu = **1 heure réelle**. L'horloge du jeu est alignée sur l'heure locale du joueur : à 20h chez lui, c'est le soir dans la guilde.
- **La guilde continue de vivre quand le navigateur est fermé.** À la réouverture, la simulation rattrape le temps écoulé en accéléré, sans animation, puis affiche un **Rapport d'absence** (résumé financier, arrivées et départs, morts, événements).
- Rattrapage **plafonné à 7 jours**. Au-delà, la guilde passe *en sommeil* : la simulation se fige et un message le signale.
- Pas de pause. Les **consignes de l'intendant** deviennent essentielles pour que la guilde survive aux absences.
- Notifications en option, y compris sur téléphone (7.7.2).
- Le mode est choisi à la création de la partie et ne peut pas être changé ensuite. Les sauvegardes sont séparées.

> **Faisabilité :** le mode Chronique ne demande pas de serveur. Seules les notifications avec le jeu fermé en exigent un petit (7.7.2). La simulation est déterministe (générateur aléatoire à graine) et légère (60 agents, 24 ticks par jour) : 7 jours de rattrapage représentent 168 ticks, calculés en une fraction de seconde. Contrainte technique (8.1) : **la simulation doit être totalement découplée de l'affichage**, ce qui profite aussi au mode Classique.
>
> **Équilibrage :** les deux modes partagent les mêmes valeurs exprimées en heures de jeu. En Chronique, une quête de 3 jours dure donc 3 jours réels. C'est voulu : le rythme est celui d'un jeu « à consulter » plusieurs fois par jour.

### 0.6 Échelle

- **Au départ :** 10 aventuriers, niveaux 1 à 4.
- **Plafond visé :** 60 aventuriers. Au-delà, l'interface ne permet plus de suivre les individus et l'attachement se dilue.
- La population est limitée en pratique par la capacité d'accueil (dortoirs) et l'attractivité (renommée).

### 0.7 Fin de partie

- **Mode bac à sable** sans fin imposée.
- **Objectifs :** 5 rangs de renommée, les **Sceaux royaux** : *Cuivre → Fer → Argent → Or → Mithril* (détail au chapitre 6).
- **Unique défaite : la faillite** (voir 1.1.4).

---

## 1. Économie de base et siège de la guilde

### 1.1 Monnaie, trésorerie et charges

#### 1.1.1 Système monétaire

- **Unité interne unique : le cuivre (pc).** Tous les calculs se font en entiers de cuivre, sans virgule.
- **Affichage en trois pièces** pour le charme :

| Pièce | Abréviation | Valeur |
|-------|-------------|--------|
| Pièce de cuivre | pc | 1 pc |
| Pièce d'argent | pa | 10 pc |
| Pièce d'or | po | 100 pc |

Exemple d'affichage : `345 pc` → **3 po 4 pa 5 pc**.

#### 1.1.2 Ordres de grandeur de référence

Ces repères calibrent tout le reste de l'économie.

| Repère | Valeur |
|--------|--------|
| Coût de la vie d'un aventurier débutant (paillasse + gruau + ragoût) | ≈ **7 pa / jour** |
| Revenu moyen d'un débutant (quêtes, dépouilles et petits boulots, lissé sur les jours de repos) | ≈ **1 po / jour** |
| Salaire d'un cuisinier moyen | 1 po / jour |
| Salaire d'un professeur de niveau 10 | ≈ 8 po / jour |

**Récompenses de quête par rang.** La récompense est le montant **total** de la quête, **partagé entre les membres de l'équipe**. La part individuelle suppose une équipe de 3.

| Rang | Durée typique | Récompense totale | Part individuelle |
|------|---------------|-------------------|-------------------|
| F | Quelques heures à 1 jour | 5 pa à 2 po | 2 à 7 pa |
| E | 1 à 2 jours | 4 à 8 po | 1 po 3 pa à 2 po 7 pa |
| D | 2 à 3 jours | 10 à 20 po | 3 à 7 po |
| C | 3 à 4 jours | 25 à 45 po | 8 à 15 po |
| B | 4 à 6 jours | 60 à 120 po | 20 à 40 po |
| A | 5 à 8 jours | 150 à 280 po | 50 à 93 po |
| S | 7 jours et plus | 350 po et plus | 115 po et plus |

> **Ajusté en tranche 2 :** les récompenses des rangs E et plus sont relevées d'environ 50 % (le rang F ne change pas : les débutants restent modestes). Le simulateur montrait des aventuriers qui plafonnaient à environ 1 po par jour, quel que soit leur niveau, et une guilde qui ne pouvait donc pas gagner plus.

> Le débutant dépense environ **70 % de son revenu** en besoins vitaux. Il vit chichement, s'entraîne sans professeur et se soigne quand il le peut. Plus il monte en niveau, plus sa marge grandit : c'est le moteur des services haut de gamme. Les dépouilles (ch. 2) représentent environ 25 à 40 % de ses revenus.

#### 1.1.3 Charges fixes de la guilde

| Charge | Formule | Échéance |
|--------|---------|----------|
| **Salaires** | Somme des salaires journaliers (personnel et professeurs) | Chaque nuit à minuit |
| **Entretien des bâtiments** | 1,5 % de la *valeur cumulée* des salles (somme des coûts de construction). *Ajusté en tranche 2 (3 % à l'origine, soit 150 % de la valeur par an : l'entretien mangeait à lui seul le bénéfice)* | Chaque semaine, le Jour du Roi |
| **Taxe royale** | `(5 po + 3 % du chiffre d'affaires brut de la semaine) × (1 + 0,5 × (rang de renommée − 1))` | Chaque semaine, le Jour du Roi |
| **Intérêts d'emprunt** | Selon le prêteur (voir ci-dessous) | Selon le prêteur |

Les événements du chapitre 5 peuvent modifier la taxe royale (une guerre l'augmente, par exemple).

**Les prêteurs :**

| Prêteur | Accès | Plafond | Intérêt | Risque |
|---------|-------|---------|---------|--------|
| **Banque des Marchands** | Trésorerie positive | Selon le rang : 200 / 500 / 1 500 / 4 000 / 10 000 po | 8 % par saison | Refus de crédit si un retard est en cours |
| **Usurier du Port** | Toujours, même endetté | 300 po | 5 % **par semaine**, composé | Retard → perte de renommée et événement « visite des gros bras » |

> **Précisé en tranche 4 :**
> - La Banque prête pour **56 jours**, l'Usurier pour **28 jours**. Les intérêts s'ajoutent à la dette : ceux de la banque à chaque changement de saison, ceux de l'usurier chaque Jour du Roi.
> - Un prêt échu est **en retard** : la banque refuse tout nouveau crédit, et chaque Jour du Roi la guilde perd 2 points de renommée (banque) ou 3 (usurier). L'usurier envoie aussi ses gros bras : mobilier brisé, moral −5 pour tous.
> - Un emprunt n'est **pas un revenu** : il n'entre ni dans le chiffre d'affaires de la taxe royale, ni dans l'apport de la guilde à la Prospérité.

#### 1.1.4 Faillite

1. La trésorerie passe sous 0 : la guilde est **endettée**. Plus de travaux possibles, salaires impayés, loyauté du personnel −10 par jour.
2. Après **7 jours consécutifs** d'endettement, la Couronne saisit le siège : **fin de partie**.
3. Le compteur repart à zéro dès que la trésorerie redevient positive.

### 1.2 Modèle de construction

- **4 salles fixes** (Dortoirs, Réfectoire, Terrain d'entraînement, Infirmerie), chacune avec des **niveaux 0 à 5** (0 = non construite).
- Monter de niveau augmente la **capacité**, débloque des **options** (types de lits, plats, profs, soins) et relève la **qualité de base**.
- Chaque salle propose des **améliorations ponctuelles** (modules), achetées une seule fois.
- **Durée des travaux :** 1 jour par niveau visé (le niveau 3 prend 3 jours). Le coût est payé d'avance.
- **Pendant les travaux, la capacité de la salle tombe à 50 %.** On choisit donc le bon moment pour agrandir.
- Les niveaux 4 et 5 exigent un rang de renommée minimum (3 et 4).

#### Récapitulatif des coûts de construction

| Salle | Niv 1 | Niv 2 | Niv 3 | Niv 4 (rang 3) | Niv 5 (rang 4) |
|-------|-------|-------|-------|----------------|----------------|
| Dortoirs | *de départ* (valeur 100 po) | 250 po | 600 po | 1 500 po | 3 500 po |
| Réfectoire | *de départ* (valeur 100 po) | 200 po | 500 po | 1 200 po | 3 000 po |
| Terrain d'entraînement | 120 po | 300 po | 700 po | 1 600 po | 3 500 po |
| Infirmerie | 150 po | 400 po | 900 po | 2 000 po | 4 000 po |

#### Aménagements du siège (hors salles)

| Aménagement | Coût | Effet | Détail |
|-------------|------|-------|--------|
| Resserre agrandie | 150 po (2 fois au maximum) | Stock de dépouilles +100 unités | 2.4.2 |
| Salle froide | 300 po | Conservation des viandes et organes ×2 | 2.4.2 |
| Mur du Souvenir | 150 po | Renommée par nom gravé, deuil adouci | 3.12.4 |

Le **comptoir** existe dès le départ : il n'a ni niveau ni coût.

### 1.3 Modèle de tarification

C'est le cœur du jeu : le joueur fixe ses prix, et chaque aventurier juge s'ils sont *justes*.

#### 1.3.1 La qualité de service (Q)

Chaque service a une **qualité Q, de 0 à 100**. Elle est calculée par salle (voir 1.5 à 1.8) à partir du niveau, des modules, de la compétence du personnel et de l'état des stocks.

Elle se convertit en **multiplicateur de qualité** :

```
MQ = 0,6 + 0,8 × (Q / 100)        → Q = 0 : ×0,6   |   Q = 50 : ×1,0   |   Q = 100 : ×1,4
```

#### 1.3.2 L'indice de prix régional (IP)

La prospérité de la ville (0 à 100, détail au chapitre 5) fait varier tous les prix :

```
IP = 0,7 + 0,6 × (Prospérité / 100)    → ville misérable : ×0,7   |   normale (50) : ×1,0   |   florissante : ×1,3
```

#### 1.3.3 Prix de référence et prix affiché

```
Prix_référence = Prix_base(service) × MQ × IP
Prix_affiché   = Prix_référence × Curseur
```

- Le **curseur** va de **×0,5 à ×3,0**, par pas de 5 %.
- Granularité du curseur :

| Salle | Curseur |
|-------|---------|
| Dortoirs | Un par type de lit |
| Réfectoire | Un par plat ou boisson |
| Entraînement | Un par professeur |
| Infirmerie | Un pour les soins et un pour les potions vendues au comptoir |

- L'interface affiche toujours le prix de référence à côté du prix affiché, ainsi que le prix du concurrent.

#### 1.3.4 Perception par l'aventurier (interface avec le chapitre 3)

L'aventurier connaît le **juste prix**, c'est-à-dire le prix de référence. Il calcule le **ratio** `R = Prix_affiché / Prix_référence` et le compare à sa **tolérance** T :

```
T = 1,10 + 0,25 × clamp( log10(Or_personnel / Coût_vie_journalier), 0, 2 ) + Modificateur_trait
```

Un aventurier pauvre a T ≈ 1,10. Un aventurier qui possède 100 jours de coût de la vie a T ≈ 1,60. Modificateurs de trait : *Radin* −0,2, *Dépensier* +0,3 (3.7). La Fierté multiplie les griefs (3.6.1).

| Zone | Condition | Réaction |
|------|-----------|----------|
| **Bonne affaire** | R ≤ 0,9 | Achète, moral +2, la réputation « guilde généreuse » monte |
| **Prix juste** | 0,9 < R ≤ 1,0 | Achète |
| **Cher mais acceptable** | 1,0 < R ≤ T | Achète, **Grief tarifaire** + (R − 1) × 10 |
| **Trop cher** | R > T | Refuse, va chez le concurrent (ou renonce), **Grief tarifaire +5** |

- Le **Grief tarifaire** s'accumule par aventurier et baisse de 2 par jour. Il pèse sur l'envie de partir (3.12.2).
- Un R moyen élevé sur la semaine fait baisser la renommée (« la guilde de rapaces »). Un R bas l'améliore, mais la marge s'effondre. **La tension est volontaire.**

#### 1.3.5 La concurrence en ville

Chaque service a une alternative en ville. C'est le **plafond naturel** de tes tarifs.

| Service | Concurrent | Qualité | Particularité |
|---------|------------|---------|---------------|
| Sommeil | *Auberge du Sanglier Borgne* | Q ≈ 40 | 1 h de trajet aller-retour, moral −3 (« dormir loin des siens ») |
| Repas | *Taverne du Pont* | Q ≈ 40 | 1 h de trajet, pas de viande de monstre |
| Entraînement | *S'entraîner seul en forêt* | — | Gratuit, XP très faible (×0,15) |
| Soins | *Temple de la Lumière* | Q ≈ 70 | Prix ×1,8, soigne tout, y compris les malédictions |
| Soins (bas de gamme) | *Rebouteux du quartier* | Q ≈ 20 | Prix ×0,5, risque d'aggravation de 25 % |

```
Prix_concurrent = Prix_base × MQ(Q_concurrent) × IP × fluctuation (0,9 à 1,1, tirée chaque semaine)
```

Les événements du chapitre 5 peuvent toucher les concurrents : l'auberge brûle, le temple est débordé pendant une épidémie…

### 1.4 Modèle du personnel

#### 1.4.1 La fiche d'un employé

| Attribut | Plage | Rôle |
|----------|-------|------|
| **Nom** | — | Généré, persistant |
| **Rôle** | Voir tableau 1.4.2 | Détermine la salle et l'effet |
| **Compétence (C)** | 1–100 | Efficacité et qualité |
| **Potentiel** | 1 à 5 étoiles | Plafond de compétence : 40 / 55 / 70 / 85 / 100 |
| **Salaire journalier** | Calculé | Voir formule |
| **Loyauté** | 0–100 | En dessous de 20 : risque de démission quotidien de 10 % |
| **Trait** | 1 trait | Voir 1.4.4 |

#### 1.4.2 Les rôles

| Rôle | Salle | Salaire de base / jour | Capacité | Effet de la compétence |
|------|-------|------------------------|----------|------------------------|
| **Valet de dortoir** | Dortoirs | 5 pa | Entretient 15 places | Propreté des dortoirs |
| **Cuisinier** | Réfectoire | 1 po | `6 + C/10` portions / heure | Qualité des plats, recettes accessibles |
| **Commis de cuisine** | Réfectoire | 4 pa | +4 portions / heure | Réduit le gaspillage |
| **Soigneur** | Infirmerie | 1 po 5 pa | 1 soin léger / heure | Chance de succès, durée des soins |
| **Apothicaire** | Infirmerie (niv 3) | 1 po 5 pa | Fabrication de remèdes | Rendement de fabrication |
| **Intendant** | Siège (1 seul) | 2 po | — | Exécute les consignes automatiques (1.10) à meilleur prix : −5 % à −15 % sur les achats |
| **Inspecteur du butin** | Comptoir (ch. 2) | 1 po 5 pa | Contrôle 20 aventuriers | Détecte la fraude fiscale (2.6) |

Les **professeurs** ont leur propre modèle (1.7).

#### 1.4.3 Salaire et progression

```
Salaire = Salaire_base × (C / 50) ^ 1,3      → C = 25 : ×0,41   |   C = 50 : ×1,0   |   C = 80 : ×1,84   |   C = 100 : ×2,46
```

- **Recrutement :** un vivier de 2 à 4 candidats par rôle se renouvelle chaque lundi.
- **Progression :** +1 de compétence tous les 5 jours travaillés, jusqu'au plafond fixé par le potentiel.
- **Augmentation :** +10 % de salaire donne +15 de loyauté. La compétence augmente et le salaire suit (le joueur doit l'accepter, sinon la loyauté baisse).
- **Licenciement :** indemnité de 3 jours de salaire.
- **Surcharge :** si la demande dépasse la capacité pendant plus de 3 jours d'affilée, loyauté −2 par jour et risque de maladie.
- **Salaire impayé :** loyauté −10 par jour. Démission garantie après 3 jours.

#### 1.4.4 Traits du personnel

| Trait | Effet |
|-------|-------|
| Travailleur | Capacité +20 % |
| Talentueux | Progression ×2 |
| Charmeur | Moral +2 pour les clients servis |
| Grincheux | Moral −2 pour les clients servis, mais compétence +10 |
| Économe | Consommation de stock −10 % |
| Chapardeur | Pertes de stock de 2 % par jour (repérable par un intendant compétent) |
| Fragile | 5 % de risque d'absence chaque jour |

### 1.5 Dortoirs

**Fonction :** restaurer l'**énergie**, et secondairement le moral.

#### 1.5.1 Les types de lits

La salle offre des **places**. Le joueur les répartit librement entre les types de lits débloqués. Les lits plus confortables prennent plus de place : c'est l'arbitrage **capacité contre confort**.

| Type de lit | Places occupées | Énergie restaurée (nuit de 8 h) | Moral | Prix de base / nuit |
|-------------|-----------------|---------------------------------|-------|---------------------|
| **Paillasse** | 1 | 60 % | −5 (−10 si Fierté élevée) | 3 pa |
| **Dortoir commun** | 1 | 75 % | 0 | 6 pa |
| **Chambre individuelle** | 2 | 90 % | +5 | 1 po 5 pa |
| **Suite** | 4 | 100 % | +12, et Grief tarifaire −2 | 5 po |

- La **nuitée** est un bloc de 8 heures de sommeil. Elle peut commencer à toute heure, par exemple au retour d'une quête.
- **Fierté :** un aventurier fier évite les paillasses et vise au minimum une chambre individuelle s'il en a les moyens (3.6.1).
- **Sans lit disponible ou abordable :** auberge concurrente, ou nuit dehors (énergie 40 %, moral −10).
- **Reconfiguration** de la répartition : 2 pa par place modifiée, effective le lendemain.

#### 1.5.2 Niveaux

| Niveau | Places | Types débloqués | Coût | Prérequis |
|--------|--------|-----------------|------|-----------|
| 1 | 12 | Paillasse | *de départ* | — |
| 2 | 24 | + Dortoir commun | 250 po | — |
| 3 | 40 | + Chambre individuelle | 600 po | — |
| 4 | 60 | + Suite | 1 500 po | Rang 3 |
| 5 | 80 | Tous, avec qualité de base +10 | 3 500 po | Rang 4 |

#### 1.5.3 Qualité et propreté

```
Q_dortoir = clamp( 30 + 8 × Niveau + Bonus_modules + (Propreté − 50) / 2 , 0, 100 )
```

- **Propreté** (0–100) : −1 par nuit et par place non couverte par un valet (1 valet = 15 places), et +5 par nuit si l'effectif de valets est suffisant.
- La propreté est le signal d'alerte typique du sous-effectif.

#### 1.5.4 Modules

| Module | Coût | Prérequis | Effet |
|--------|------|-----------|-------|
| Rideaux épais | 80 po | — | Q +5 |
| Coffres verrouillés | 120 po | — | Moral +3 à la nuitée pour les aventuriers à Fierté ≥ 30, Loyauté +1 par semaine |
| Cheminée | 200 po | Niv 2 | Q +8, et **annule le malus d'hiver** (5.2) |
| Bains chauds | 400 po | Niv 3 | Q +10, moral +5 à la nuitée |

### 1.6 Réfectoire et cuisine

**Fonction :** restaurer la **faim** et le **moral**, vendre des boissons et des provisions de quête. C'est aussi la **première boucle rétroactive** avec le marché des monstres.

#### 1.6.1 La jauge de faim

- Convention : **Faim de 100 = repu, 0 = affamé** (sous 20 %, besoin urgent).
- Elle baisse de **4 par heure éveillé** et de **1,5 par heure de sommeil**, soit environ 76 points par jour : **2 à 3 repas par jour**.
- **Services :** Petit-déjeuner 06h–09h, Déjeuner 11h–14h, Dîner 18h–21h. Un repas dure 1 heure et occupe 1 place assise.
- Hors service, on ne mange que via le module *Comptoir de casse-croûte*.

#### 1.6.2 Les trois sous-systèmes

```
 FOURNISSEURS ──┐
                ├──► GARDE-MANGER (stock, fraîcheur) ──► CUISINE (cuisiniers, recettes) ──► SALLE (places, menu, prix) ──► AVENTURIERS
 BOUCHERIE ─────┘         (viande de monstre, ch. 2)
```

#### 1.6.3 Le garde-manger : les denrées

| Denrée | Source | Prix de base / portion | Conservation | Note |
|--------|--------|------------------------|--------------|------|
| Céréales | Fournisseur | 3 pc | 30 jours | Base de tout |
| Légumes | Fournisseur | 4 pc | 5 jours | Prix ×1,5 en hiver |
| Viande commune | Fournisseur | 8 pc | 3 jours (20 avec Saloir) | — |
| **Viande de monstre** | **Boucherie (ch. 2)** | Cours du marché | 2 à 4 jours selon l'espèce | Donne un **bonus de quête** selon l'espèce. **1 unité de viande = 4 portions** |
| Épices | Marché | 15 pc | 60 jours | Plats avancés |
| Boisson commune (bière) | Fournisseur | 4 pc | 30 jours | — |
| Boisson fine (vin) | Fournisseur | 20 pc | 90 jours | Nécessite la Cave à vin |

- Chaque lot a une **fraîcheur** de 100 % à 0 %, qui baisse avec le temps. À 0 %, le lot est **perdu**.
- Les prix fournisseurs suivent l'IP et les événements (pénurie, guerre : chapitre 5).
- **Livraison :** une commande passée avant 18h est livrée le lendemain à 06h.

#### 1.6.4 Les recettes

| Plat | Ingrédients | Faim | Moral | Effet spécial | Prix de base | Prérequis |
|------|-------------|------|-------|---------------|--------------|-----------|
| **Gruau du matin** | 1 céréale | +35 | −2 | — | 1 pa | — |
| **Ragoût du jour** | 1 céréale, 1 légume, 1 viande commune | +55 | +3 | — | 3 pa | Cuisinier C ≥ 20 |
| **Rôti de monstre** | 1 viande de monstre, 1 légume, 1 épice | +60 | +6 | Bonus selon l'espèce, par exemple loup : endurance +5 % pendant la prochaine quête | 8 pa | Niv 3, C ≥ 40 |
| **Festin du Héros** | 2 viandes (dont 1 de monstre), 1 légume, 1 épice, 1 boisson fine | +80 | +15 | État *Repu et confiant* : moral de quête +10, 2 jours | 2 po 5 pa | Niv 4, C ≥ 65 |

**Boissons et provisions** (servies hors repas, ne donnent pas de faim) :

| Produit | Composition | Effet | Prix de base | Prérequis |
|---------|-------------|-------|--------------|-----------|
| **Chope de bière** | 1 boisson commune | Moral +3 (soir). Au-delà de 3 chopes : risque d'*ivresse*, qui peut causer une bagarre (3.11.2) | 1 pa | Niv 2 |
| **Verre de vin fin** | 1 boisson fine | Moral +6, apprécié des aventuriers fiers | 5 pa | Cave à vin |
| **Panier de route** | 1 céréale, 1 viande, 1 légume | Emporté en quête : réduit la perte de faim en mission, chance de survie légèrement accrue (4.6.3) | 5 pa | Niv 2 |

> **Prix des plats de monstre :** le prix de base du Rôti et du Festin s'ajuste à l'espèce utilisée : `Prix_base + 1,5 × coût d'une portion de viande au cours du jour`. Un Rôti de wyverne coûte donc bien plus cher qu'un Rôti de loup.
>
> **Marges :** le coût matière vise 30 à 50 % du prix de base (Ragoût : 15 pc de matière pour 30 pc de prix). Le Rôti de monstre et le Festin rapportent beaucoup plus, mais dépendent de l'approvisionnement en dépouilles et d'un cuisinier compétent.

#### 1.6.5 Qualité d'un plat

```
Q_plat = clamp( 0,5 × C_chef + 0,2 × Fraîcheur_moyenne + 4 × Niveau_réfectoire + Bonus_modules , 0, 100 )
Moral_gagné = Moral_recette × (0,5 + Q_plat / 100)
```

- `C_chef` est la compétence du meilleur cuisinier présent.
- **Intoxication :** un plat préparé avec un ingrédient à moins de 20 % de fraîcheur a 15 % de chance d'infliger l'état *Maladie (intoxication)*, avec un lien vers l'infirmerie (1.8).

#### 1.6.6 Production et capacité

- **Production :** chaque cuisinier fournit `6 + C/10` portions par heure, et chaque commis +4. Les cuisiniers préparent pendant l'heure qui précède chaque service.
- **Places assises :** 8 × Niveau.
- **Saturation :** un aventurier qui attend plus d'une heure perd 5 de moral et peut aller chez le concurrent.
- **Menu :** le joueur choisit les plats actifs, avec un nombre limité par niveau. Les boissons et le panier de route ne comptent pas dans la limite.

#### 1.6.7 Niveaux

| Niveau | Places | Plats au menu | Garde-manger | Débloque | Coût |
|--------|--------|---------------|--------------|----------|------|
| 1 | 8 | 2 | 100 portions | Gruau, Ragoût | *de départ* |
| 2 | 16 | 3 | 200 | Bière, Panier de route | 200 po |
| 3 | 24 | 4 | 350 | Viande de monstre, Rôti | 500 po |
| 4 | 32 | 5 | 500 | Festin du Héros | 1 200 po (rang 3) |
| 5 | 40 | 6 | 700 | *Table renommée* : attire des visiteurs nobles (événement *Gourmet de passage*, 5.4.3) | 3 000 po (rang 4) |

#### 1.6.8 Modules

| Module | Coût | Prérequis | Effet |
|--------|------|-----------|-------|
| Comptoir de casse-croûte | 100 po | — | Vente hors service (plats froids, Q −20) |
| Saloir et fumoir | 150 po | — | Conservation des viandes ×5 (monstre comprise) |
| Cave à vin | 250 po | Niv 2 | Débloque le vin fin |
| Glacière | 400 po | Niv 3 | Perte de fraîcheur −50 % sur tout le stock |

### 1.7 Terrain d'entraînement

**Fonction :** un gain d'**expérience passif** pendant le temps libre des aventuriers. C'est la principale source de valeur ajoutée « à long terme » de la guilde.

#### 1.7.1 Les professeurs

> Les classes sont définies au chapitre 3 (3.2) : **Guerrier, Rôdeur, Voleur, Mage, Clerc**. Un professeur entraîne aussi les compétences liées à sa spécialité (3.4).

| Professeur | Affinité pleine (×1,0) | Affinité partielle (×0,5) | Autres (×0,2) | Particularité |
|------------|------------------------|---------------------------|---------------|---------------|
| **Maître d'armes** | Guerrier | Rôdeur, Voleur | Mage, Clerc | — |
| **Archimage** | Mage | Clerc | Les autres | Exige le module *Salle d'étude* au-delà de son niveau 10 |
| **Stratège** | — | **Toutes les classes** (×0,5) | — | Entraîne la compétence **Cohésion** (3.4) : +1 garanti par séance jusqu'à 12. Cela renforce la Cohésion d'équipe (3.11.3) |
| **Maître-chasseur** *(à débloquer)* | Rôdeur | Guerrier, Voleur | Les autres | **Connaissance des monstres** : dépouilles de meilleure qualité (2.3.1) |
| **Aumônier de bataille** *(à débloquer)* | Clerc | Guerrier | Les autres | Résistance aux malédictions (1.8) |

#### 1.7.2 La fiche d'un professeur

| Attribut | Rôle |
|----------|------|
| **Niveau** (1–30) | **Plafond d'enseignement** : un élève de niveau ≥ celui du prof ne gagne presque rien (×0,1) |
| **Pédagogie** (0–100) | Multiplicateur d'XP |
| **Réputation** | Attire des recrues de sa spécialité (3.12.1) |
| **Exigence** | Niveau minimum de terrain pour accepter le poste (*Ego*) |
| **Élèves par séance** | 4 à 8 selon le prof |
| **Salaire journalier** | Voir formule |

```
Salaire_prof (po/jour) = ( 2 + 0,25 × Niveau ^ 1,4 ) × ( 0,7 + Pédagogie / 166 )
```

Exemples à pédagogie 50 : niveau 5 ≈ 4,4 po/jour, niveau 10 ≈ 8,3 po/jour, niveau 20 ≈ 18,6 po/jour.

- **Recrutement :** les offres sont **rares** (environ 1 toutes les 2 semaines), et leur qualité dépend de la renommée.
- Un prof peut partir si la renommée baisse, ou si son salaire est impayé.

#### 1.7.3 Les séances

- Chaque prof dispose de **3 créneaux** (Matin, Après-midi, Soir). Le joueur ouvre ou ferme chaque créneau. **Chaque séance dure 3 heures.**
- L'aventurier paie **à la séance**. Il n'y a pas d'abonnement.
- **Coût physique :** énergie −15, faim −10. Moral +2 pour les aventuriers ambitieux.
- **Rendement décroissant :** la 2ᵉ séance de la journée donne ×0,5. La 3ᵉ n'est pas autorisée.

```
XP_séance = 0,15 × XP_quête_type(niveau_élève) × M_prof × M_affinité × M_terrain × M_plafond

M_prof     = 0,5 + Pédagogie / 100          (0,5 à 1,5)
M_affinité = 1,0  |  0,5  |  0,2            (voir tableau 1.7.1)
M_terrain  = 1 + 0,05 × (Niveau_terrain − 1) + Bonus_modules
M_plafond  = 1 si élève < prof, sinon 0,1
```

> **Repère :** une séance avec un prof moyen dans sa spécialité vaut environ **15 % de l'XP d'une quête** du niveau de l'élève. Trois jours d'entraînement assidu valent à peu près une quête, sans risque de mourir.

**Entraînement libre** (sans prof, sur le terrain) : M_prof = 0,3, pas de plafond de niveau, prix de base 1 pa.

```
Prix_base_séance = 2 pa × (1 + Niveau_prof / 2) × M_prof
```

Comme pour les autres salles, le prix de référence applique ensuite MQ et IP (1.3.3), avec `Q_terrain = clamp(30 + 8 × Niveau + Bonus_modules, 0, 100)`.

Exemple : un prof de niveau 10 et de pédagogie 50 donne un prix de base de 1 po 2 pa. Six élèves sur deux séances par jour rapportent environ 14 po, contre un salaire de 8,3 po. **Un prof n'est rentable que si ses séances sont remplies.**

#### 1.7.4 Niveaux

| Niveau | Profs max | Débloque | Coût |
|--------|-----------|----------|------|
| 1 | 1 | Entraînement libre, Maître d'armes | 120 po |
| 2 | 2 | Archimage, mannequins | 300 po |
| 3 | 3 | Stratège, piste d'obstacles | 700 po |
| 4 | 4 | Maître-chasseur, **salle de duel** : duels entre aventuriers, qui créent des rivalités (3.11.1) | 1 600 po (rang 3) |
| 5 | 5 | Aumônier, **Arène** (voir ci-dessous) | 3 500 po (rang 4) |

**L'Arène :** un spectacle par semaine, le 6ᵉ jour au soir. Les aventuriers volontaires (Fierté ≥ 50 ou Bagarreurs) s'y affrontent en duels sans danger de mort.
- Recette : `20 po × (1 + Prospérité / 50)`, ×2 si la ville est au palier Cité.
- Renommée +1 par spectacle. Respectabilité +2 pour le vainqueur.

#### 1.7.5 Modules

| Module | Coût | Effet |
|--------|------|-------|
| Salle d'étude arcanique | 300 po | Affinité partielle portée à ×0,7 pour l'Archimage. Requis pour un Archimage de niveau supérieur à 10 |
| Armurerie d'entraînement | 250 po | M_terrain +0,1 avec le Maître d'armes |
| Table de cartes | 200 po | Le Stratège fait progresser la Cohésion jusqu'à 16 au lieu de 12 |
| Bassins de récupération | 400 po | Coût en énergie des séances −50 % |

### 1.8 Infirmerie

**Fonction :** soigner la **santé** (PV) et les **états** (blessures, poisons, maladies, malédictions). C'est la **deuxième boucle rétroactive** : de nombreux remèdes se fabriquent à partir de dépouilles de monstres (ch. 2).

#### 1.8.1 Les états

Chaque état a une **gravité** : Légère, Sérieuse ou Critique.

| État | Causes typiques | Effet | Évolution sans soin | Remède |
|------|-----------------|-------|---------------------|--------|
| **Plaie** | Loups, sangliers, gobelins, ours-hiboux, bagarres | Santé max −10 à −30 % | Après 48 h : risque d'**infection**, qui aggrave d'un cran | Bandages |
| **Fracture** | Trolls, crabes-rocs, ours-hiboux, golems, pièges | Ne peut pas partir en quête | Guérit en 10 jours, avec 20 % de risque de **séquelle permanente** (−1 à un attribut, 3.3) | Attelle et onguent |
| **Poison / Venin** | Araignées, wyvernes, goules | −5 PV par heure | Mortel en Critique | Antidote |
| **Brûlure** | Dragon, pièges des ruines | Moral −10, santé max réduite | Lente, laisse une cicatrice (Fierté −) | Baume |
| **Maladie** | Rats, épidémies, **intoxication alimentaire**, marais | Énergie qui baisse ×2 plus vite | **Contagieuse** pendant les épidémies (5.7) | Tisane médicinale |
| **Malédiction** | Goules, objets anciens maudits, ruines | Malchance en quête, moral qui s'effondre | Ne guérit jamais seule | Élixir de purification (légère) ou eau bénite |

La **santé** (PV) se restaure aussi en dormant (lentement) ou en **lit d'infirmerie** (×3).

> **Ajusté en tranche 2 :**
> - Une plaie non pansée n'aggrave plus d'un cran à coup sûr toutes les 48 h : elle a **30 % de risque** de s'infecter. Avec l'aggravation certaine, les blessés légers mouraient en série.
> - Un état **Critique** non soigné ne tue pas tout de suite : après **48 h**, un tirage quotidien de **15 %** de mort. Le joueur a le temps de réagir (infirmerie, crédit, Temple).

#### 1.8.2 Les remèdes (stock)

| Remède | Soigne | Prix d'achat au marché |
|--------|--------|------------------------|
| Bandages | Plaie | 1 pa |
| Attelle et onguent | Fracture | 8 pa |
| Antidote | Poison | 1 po 5 pa |
| Baume | Brûlure | 1 po |
| Tisane médicinale | Maladie | 5 pa |
| Élixir de purification | Malédiction **légère** | 3 po |
| Eau bénite | Malédiction de toute gravité | 6 po (ou produite par le Sanctuaire, niv 5) |
| **Potion de soin** | +40 PV, emportée en quête | 1 po |
| **Potion de soin supérieure** | +80 PV et stoppe un poison léger | 4 po |

Tous les remèdes sauf l'eau bénite peuvent être **fabriqués** à l'apothicairerie (niv 3) à partir de plantes et de dépouilles. Les recettes sont détaillées en 2.4.3.

#### 1.8.3 Les soins

```
Chance_succès = clamp( 50 + C_soigneur − 15 × Indice_gravité + 5 × Niveau_infirmerie , 5 %, 98 % )
Indice_gravité : Légère = 0, Sérieuse = 1, Critique = 2
```

- **Qualité de l'infirmerie** (pour le prix de référence, 1.3.3) : `Q_infirmerie = clamp(30 + 6 × Niveau + 0,3 × C_moyenne_des_soigneurs + Bonus_modules, 0, 100)`.
- **Échec :** le remède est consommé, l'état persiste, moral −5. Le soin peut être retenté.
- Les cas Sérieux et Critiques demandent une **hospitalisation** : un lit occupé pendant 1 à 5 jours.
- **Ajusté en tranche 2 : stabilisation.** Une infirmerie de niveau 1 à 3 ne guérit pas un cas Critique, mais un soin réussi le **ramène à Sérieux** (le soin complet reste réservé au niveau 4). Sans cela, la guilde n'avait aucun recours contre les blessures critiques avant le Sceau d'Argent.

#### 1.8.4 Grille tarifaire de base

| Soin | Prix de base |
|------|--------------|
| Pansement (plaie légère) | 3 pa |
| Plaie sérieuse | 1 po |
| Fracture | 4 po |
| Antidote (léger / sérieux / critique) | 2 po / 5 po / 10 po |
| Brûlure | 1 po 5 pa |
| Maladie | 1 po |
| Levée de malédiction | 12 po |
| Lit d'hospitalisation | 8 pa par jour |
| Potion de soin (vente au comptoir) | 2 po |

#### 1.8.5 Politique : soins à crédit

Le joueur peut activer les **soins à crédit**. Un aventurier sans le sou est alors soigné, et sa dette est prélevée en priorité sur ses prochaines récompenses de quête.

- **Gain :** loyauté et moral nettement augmentés, moins de morts.
- **Risque :** les dettes des aventuriers qui meurent ou désertent sont perdues.
- Plafond de crédit réglable par aventurier. **Plafond par défaut : 10 po** (ajusté en tranche 2). Un plafond trop bas laisse mourir les recrues pauvres d'une grande guilde faute de soins.

#### 1.8.6 Niveaux

| Niveau | Lits | Débloque | Coût |
|--------|------|----------|------|
| 1 | 3 | Plaie, Maladie, Poison léger. 1 soigneur | 150 po |
| 2 | 6 | Fracture, Brûlure, vente de potions | 400 po |
| 3 | 10 | **Apothicairerie** (fabrication), malédiction légère (Élixir de purification) | 900 po |
| 4 | 14 | Soins critiques, **Chirurgien** : risque de séquelle −75 % | 2 000 po (rang 3) |
| 5 | 20 | **Sanctuaire** : malédictions de toute gravité, production d'eau bénite | 4 000 po (rang 4) |

#### 1.8.7 Modules

| Module | Coût | Effet |
|--------|------|-------|
| Jardin d'herbes | 120 po | Produit 5 Herbes-à-plaie et 5 Camomilles par jour (2.2.3) |
| Salle de convalescence | 250 po | Moral +3 par jour hospitalisé, durée d'hospitalisation −20 % |
| Quarantaine | 350 po | Bloque la contagion interne pendant les épidémies (5.7) |
| Laboratoire | 500 po (niv 3) | Rendement de fabrication +30 % |

### 1.9 Cotisation d'inscription

- Payée **une seule fois**, à l'arrivée d'un nouvel aventurier. Il n'y a pas de cotisation récurrente : c'est la taxe de la guilde (2.6) qui joue ce rôle.
- `Prix_base = 1 po × (1 + 0,5 × (rang de renommée − 1))`, avec un curseur réglable.
- Une cotisation trop élevée fait baisser le flux de recrues (3.12.1).

### 1.10 Consignes de l'intendant (automatisation)

Ce sont des règles permanentes, exécutées automatiquement. Elles sont **indispensables en mode Chronique** et confortables en mode Classique.

| Consigne | Exemple |
|----------|---------|
| Seuil de réapprovisionnement | « Si céréales < 40 portions, commander 100 » |
| Prix plafond d'achat | « Ne pas acheter de vin au-dessus de 25 pc » |
| Réserve de trésorerie | « Ne jamais descendre sous 50 po pour des achats automatiques » |
| Vente automatique de dépouilles | « Vendre toute dépouille sans usage interne dès son arrivée » *(2.4)* |
| Réaction aux alertes | « Fermer le créneau du soir du prof si moins de 2 élèves inscrits » |

- **Sans intendant,** les consignes fonctionnent mais achètent au prix fournisseur, avec 10 % d'erreurs de quantité.
- **Avec intendant,** les achats coûtent 5 à 15 % de moins selon sa compétence, sans erreur, et il signale les anomalies (vols, gaspillage).

### 1.11 Le bilan comptable

Le bilan est calculé **chaque nuit à minuit** et consultable par jour, semaine ou saison dans le **Grand Livre**.

| Recettes | Dépenses |
|----------|----------|
| Nuitées (par type de lit) | Salaires du personnel |
| Repas, boissons, paniers de route | Salaires des professeurs |
| Séances d'entraînement (par prof) | Achats de denrées |
| Soins, hospitalisations, potions | Achats de remèdes |
| Taxe de la guilde, sur les récompenses et le butin (2.6) | Travaux et aménagements |
| Ventes de dépouilles et de plantes (2.5) | Entretien (hebdomadaire) |
| Cotisations d'inscription | Taxe royale (hebdomadaire) |
| Spectacles d'arène (1.7.4) | Intérêts d'emprunt |
| Amendes pour fraude (2.6.2) | **Rachats de dépouilles** au comptoir (2.4.1) |
| Remboursements des soins à crédit (1.8.5) | **Primes et bonus** payés (4.4) |
| Legs d'aventuriers défunts (3.12.4) | Offres de rétention (7.5.2), cautions, exemptions et autres choix d'événements (5.4.3) |

**Indicateurs par salle** (affichés dans la vue du bâtiment) : taux d'occupation, revenu net du jour, qualité Q, ratio de prix moyen R, nombre de **refus pour prix**, nombre de clients partis chez le concurrent.

### 1.12 État de départ d'une partie

| Élément | Valeur |
|---------|--------|
| Trésorerie | 300 po |
| Dortoirs | Niv 1 (12 paillasses) |
| Réfectoire | Niv 1 (Gruau et Ragoût) |
| Terrain d'entraînement | Non construit |
| Infirmerie | Non construite |
| Personnel | 1 cuisinier (C 30), 1 valet (C 25) |
| Stocks | 60 céréales, 30 légumes, 20 viandes communes |
| Aventuriers | 10, niveaux 1 à 4, classes variées |
| Rang de renommée | 1 — *Sceau de Cuivre* |
| Ville | Palier **Bourg**, Prospérité 30 |
| Danger régional | 35 (*Tendu*) |
| Saison | Printemps, jour 1 |
| Mode Chronique | + 1 intendant (C 30) offert |
| Graine du monde | Tirée au hasard, ou saisie par le joueur (8.3) |

### 1.13 Cibles de rythme (pour l'équilibrage)

Ces cibles servent à **valider les chiffres** : si une simulation de test ne les respecte pas, on ajuste les paramètres et non les cibles.

| Jalon | Jour visé (joueur moyen) |
|-------|--------------------------|
| Première salle construite (Infirmerie ou Terrain) | Jour 1 à 3 |
| Les 4 salles construites | Jour 8 à 12 |
| Première salle au niveau 3 | Jour 20 à 30 |
| Rang 3 (*Sceau d'Argent*) | Jour 50 à 70 |
| Toutes les salles au niveau 5 | Jour 150 et plus |
| Revenu net journalier au jour 30 | 10 à 20 po |

---

## 2. Marché des monstres et économie rétroactive

### 2.0 Vue d'ensemble : le circuit d'une dépouille

```
 QUÊTE (combat, cueillette)
   │  dépouilles + plantes + or, selon la qualité et la capacité de transport
   ▼
 COMPTOIR DE LA GUILDE (« la Boucherie »)
   │  1. Déclaration du butin (fraude possible → 2.6)
   │  2. Taxe de la guilde, prélevée d'abord en or, puis en nature
   │  3. Droit de préemption : la guilde peut racheter ce qu'elle veut
   ▼
 ┌──────────────────────────┬────────────────────────────────┐
 │ STOCK DE LA GUILDE       │ RESTE À L'AVENTURIER           │
 │ → Réfectoire (viandes)   │ → vendu par lui en ville       │
 │ → Apothicairerie         │   (frais de 10 %, 1 h de       │
 │ → Revente aux acheteurs  │   trajet)                      │
 │ → Contrats               │                                │
 └────────────┬─────────────┴───────────────┬────────────────┘
              ▼                             ▼
       MARCHÉ DE LA VILLE (5 acheteurs, cours en offre et demande)
              │
              ▼
 POPULATIONS DE MONSTRES ◄── chaque mise à mort fait baisser la population
   → moins de dépouilles → cours en hausse → danger de la zone en baisse
```

### 2.1 Zones et bestiaire

#### 2.1.1 Les zones

| Zone | Rangs | Trajet aller | Particularité |
|------|-------|--------------|---------------|
| **Ville et alentours** (dont les égouts) | F | 0 à 2 h | Quêtes d'aide, d'escorte courte, rats. Quasiment sans danger |
| **Forêt de Vertbois** | F–D | 4 h | Zone d'apprentissage, riche en plantes communes |
| **Collines du Croc** | E–C | 8 h | Gobelins, routes commerciales, nombreuses escortes |
| **Marais des Brumes** | D–C | 10 h | Plantes médicinales rares. Risque de maladie |
| **Ruines d'Ostral** | C–A | 14 h | Morts-vivants, malédictions, objets anciens |
| **Pics des Wyvernes** | B–S | 20 h | Wyvernes, dragon. Butin exceptionnel, mortalité élevée |

#### 2.1.2 Le bestiaire (12 espèces au lancement)

| Espèce | Rang | Zones | Menace | Comportement / risques infligés |
|--------|------|-------|--------|---------------------------------|
| **Rat géant** | F | Ville (égouts) | 1 | En meute. Maladie légère |
| **Sanglier des ronces** | F | Forêt | 2 | Charge. Plaie |
| **Loup** | E | Forêt, Collines | 3 | En meute. Plaie |
| **Araignée géante** | E | Forêt, Marais | 3 | Embuscade. Poison |
| **Gobelin** | E | Collines | 3 | En bande, pille les caravanes. Plaie. Porte de l'or |
| **Crabe-roc** | D | Marais | 4 | Très résistant. Fracture |
| **Ours-hibou** | D | Forêt profonde | 5 | Solitaire, territorial. Plaie, Fracture |
| **Troll des marais** | C | Marais | 7 | Se régénère. Fracture |
| **Goule** | C | Ruines | 6 | En meute, la nuit. Poison, **Malédiction** |
| **Wyverne** | B | Pics | 12 | Attaque aérienne. Poison grave |
| **Golem runique** | A | Ruines | 20 | Gardien immobile, ne sort pas de sa zone. Fracture |
| **Jeune dragon** | S | Pics | 40 | Unique (population 1). Brûlure grave |

La **Menace** sert au calcul du Danger de zone (2.7) et à la difficulté des quêtes (4.5.1).

### 2.2 Les ressources

#### 2.2.1 Catégories

| Catégorie | Conservation | Acheteur principal | Usage interne |
|-----------|--------------|--------------------|---------------|
| **Viandes** | 2 à 4 jours (×5 avec le Saloir) | Halle aux vivres | Réfectoire |
| **Peaux, cuirs, fourrures** | 15 jours (brutes) | Tanneur | — |
| **Organes et glandes** | 5 à 10 jours (×2 en Salle froide) | Alchimiste | Apothicairerie |
| **Os, crocs, carapaces, écailles** | Illimitée | Forgeron-armurier | — |
| **Matières rares** (cœurs, sang, pierres) | 5 jours à illimitée | Collectionneur, Alchimiste | Apothicairerie |
| **Plantes** | 5 à 20 jours | Alchimiste, Halle | Apothicairerie, Réfectoire |
| **Objets trouvés** (babioles, reliques) | Illimitée | Collectionneur, Forgeron | — |

#### 2.2.2 Catalogue des dépouilles

Les prix sont des **prix de base** en cuivre, pour une unité intacte (avant cours du marché). Le **poids** sert à la capacité de transport (2.3.2).

| Espèce | Ressource | Poids | Prix de base | Conservation | Usage interne |
|--------|-----------|-------|--------------|--------------|---------------|
| Rat géant | Peau de rat | 1 | 3 pc | 15 j | — |
| Sanglier | Viande de sanglier | 2 | 10 pc | 3 j | Rôti : **Vigueur** (énergie −10 % consommée en quête) |
| | Cuir de sanglier | 2 | 14 pc | 15 j | — |
| | Défenses | 1 | 10 pc | ∞ | — |
| | Graisse | 1 | 6 pc | 10 j | Baume |
| Loup | Peau de loup | 2 | 50 pc | 15 j | — |
| | Viande de loup | 2 | 20 pc | 3 j | Rôti : **Endurance** +5 % |
| | Crocs | 1 | 25 pc | ∞ | — |
| Araignée | Glande à venin | 1 | 60 pc | 5 j | Antidote |
| | Soie | 1 | 40 pc | ∞ | Bandages de qualité |
| Gobelin | Or | — | 10 à 40 pc | — | Butin de l'aventurier, taxé au comptoir |
| | Babioles | 1 | 30 pc | ∞ | — |
| Crabe-roc | **Carapace** | 3 | 200 pc | ∞ | — |
| | Chair de crabe | 2 | 60 pc | 2 j | Rôti : **Robustesse** (PV max +5 %) |
| Ours-hibou | Fourrure | 3 | 180 pc | 15 j | — |
| | Plumes | 1 | 50 pc | ∞ | — |
| | Viande d'ours | 3 | 60 pc | 3 j | Rôti : **Force** (dégâts +5 %) |
| Troll | Graisse de troll | 2 | 150 pc | 10 j | Attelle, Baume |
| | **Sang de troll** | 1 | 400 pc | 5 j | Potion supérieure |
| | Peau de troll | 4 | 250 pc | 15 j | — |
| Goule | Poussière d'os | 1 | 120 pc | ∞ | Élixir de purification |
| | Griffes de goule | 1 | 150 pc | ∞ | — |
| Wyverne | **Glande de wyverne** | 1 | 800 pc | 5 j | Antidote ×4 |
| | Écailles de wyverne | 2 | 900 pc | ∞ | — |
| | Cuir d'aile | 3 | 600 pc | 15 j | — |
| | Viande de wyverne | 3 | 200 pc | 3 j | Rôti : **Résistance au poison** |
| Golem | **Cœur runique** | 3 | 4 500 pc | ∞ | — |
| | Pierre runique | 4 | 1 500 pc | ∞ | — |
| Dragon | Écailles de dragon | 4 | 6 000 pc | ∞ | — |
| | **Cœur de dragon** | 3 | 8 000 pc | 10 j | — |
| | Sang de dragon | 1 | 4 000 pc | 5 j | — |
| | Viande de dragon | 5 | 1 500 pc | 4 j | **Festin du Dragon** : tous les bonus pendant 3 jours |

> **Repère :** la valeur totale d'un monstre intact tourne autour de **0,4 po (rang F), 1 po (E), 3 po (D), 8 po (C), 25 po (B), 60 po (A) et 200 po (S)**.

#### 2.2.3 Les plantes

Les plantes se récoltent lors des **quêtes de cueillette**. Les **Rôdeurs et les Clercs** en ramassent aussi au passage pendant n'importe quelle quête, avec une chance de 0 à 2 plantes de la zone.

| Plante | Zone | Rareté | Poids | Prix de base | Conservation | Usage |
|--------|------|--------|-------|--------------|--------------|-------|
| **Herbe-à-plaie** | Forêt | Commune | 1 | 3 pc | 10 j | Bandages, Potion de soin |
| **Camomille des fossés** | Ville, Forêt | Commune | 1 | 2 pc | 10 j | Tisane |
| **Racine d'ombre** | Marais | Peu commune | 1 | 15 pc | 20 j | Antidote |
| **Chardon de fer** | Collines | Peu commune | 1 | 12 pc | 20 j | Attelle |
| **Fleur de braise** | Collines, Pics | Peu commune | 1 | 20 pc | 7 j | Baume |
| **Lys d'argent** | Marais | Rare | 1 | 50 pc | 5 j | Potions de soin |
| **Mousse lumineuse** | Ruines | Rare | 1 | 60 pc | 15 j | Élixir de purification |
| **Truffe noire** | Forêt | Rare | 1 | 80 pc | 7 j | Réfectoire : remplace l'épice, qualité du plat +15. Prisée de la noblesse |

Les plantes suivent les mêmes règles de population que les monstres (2.7) : une cueillette intensive les raréfie.

### 2.3 Qualité et transport

#### 2.3.1 Qualité des dépouilles

| Qualité | Valeur | Usage interne |
|---------|--------|---------------|
| **Intacte** | 100 % | Tous |
| **Abîmée** | 60 % | Tous, rendement de fabrication −30 % |
| **Ruinée** | 25 % | Vente uniquement |

```
Score_dépeçage = 40 + 3 × Connaissance_monstres (meilleur membre de l'équipe) + 20 × Marge_de_victoire − 10 × (combat de nuit)
Intacte : tirage < Score   |   Abîmée : tirage < Score + 35   |   Sinon : ruinée     (tirage de 0 à 100)
```

- **Connaissance des monstres** : une compétence d'aventurier (0–20). Les Rôdeurs l'ont naturellement, et le **Maître-chasseur** l'entraîne (1.7).
- **Marge de victoire** : de 0 (victoire arrachée) à 1 (écrasante), voir 4.7.3.
- Les plantes sont toujours intactes, mais leur fraîcheur baisse dès la cueillette.

#### 2.3.2 Capacité de transport

- Chaque aventurier porte `4 + FOR / 2` unités de poids (environ 8 à 14, voir 3.3). Les consommables de son sac comptent dedans. L'équipe met ses capacités en commun.
- Au-delà, l'équipe **abandonne** les ressources au plus faible rapport valeur / poids.
- Le Panier de route (1.6.4) pèse 1.
- Conséquence voulue : une grosse bête (troll, ours-hibou) ne rapporte pleinement qu'à une équipe nombreuse.

### 2.4 Le Comptoir de la guilde (« la Boucherie »)

Chaque retour de quête passe obligatoirement par le comptoir.

#### 2.4.1 Le passage au comptoir, étape par étape

1. **Déclaration** du butin : or, dépouilles et plantes. Une fraude est possible (2.6).
2. **Taxe** (2.6) calculée sur la valeur déclarée **au cours du jour**. Elle est prélevée d'abord en or. Si l'or ne suffit pas, le reste est pris **en nature**, en commençant par les ressources que la guilde a besoin de stocker.
3. **Préemption** : la guilde rachète ce qu'elle veut au **prix de rachat** :
   `Prix_rachat = Cours_du_jour × Curseur_rachat` (curseur de ×0,7 à ×1,0)
   - L'aventurier compare avec ce qu'il toucherait en ville, soit cours − 10 % de frais et 1 h de trajet.
   - **Point d'équilibre ≈ ×0,9** : en dessous, il accepte mais le **Grief tarifaire** monte (1.3.4). À ×1,0, il est content et la guilde ne fait aucune marge de rachat.
   - Si la guilde **n'a pas assez de trésorerie**, elle ne peut pas préempter.
4. Le **reste** est vendu par l'aventurier en ville. Cela alimente l'offre du marché et fait baisser les cours (2.5).

Des **consignes de l'intendant** automatisent la préemption, par exemple : « Racheter toute viande de loup si le stock est sous 10 unités », « Racheter toute glande à venin », « Ne rien racheter au-dessus de 500 pc ».

#### 2.4.2 Le stock de la guilde (la Resserre)

| Élément | Valeur |
|---------|--------|
| Capacité de base | 50 unités de poids |
| Module *Resserre agrandie* | +100 unités, 150 po (cumulable 2 fois) |
| Module *Salle froide* | Conservation des viandes et organes ×2, 300 po |
| Saloir et fumoir (Réfectoire, 1.6.8) | S'applique aussi aux viandes de la Resserre |

- La valeur d'une ressource périssable baisse avec sa fraîcheur : `Valeur = Cours × Qualité × (0,5 + 0,5 × Fraîcheur)`. À 0 %, elle est perdue.
- **Spéculation :** le joueur peut stocker en attendant une hausse. Le risque, c'est la pourriture et l'immobilisation de trésorerie.

#### 2.4.3 Transformation interne

**Réfectoire :** les viandes de monstre deviennent des Rôtis et des Festins (1.6.4) avec le bonus de l'espèce (tableau 2.2.2).

**Apothicairerie** (Infirmerie niv 3, Apothicaire requis) :

| Remède | Recette | Produit | Prix d'achat équivalent |
|--------|---------|---------|-------------------------|
| Bandages | 1 Herbe-à-plaie + 1 lin (acheté 2 pc) | 3 | 3 pa |
| Bandages de soie | 1 Soie d'araignée | 4 | Plaie sérieuse : succès +10 % |
| Attelle et onguent | 2 Chardons de fer + 1 Graisse (sanglier) **ou** 1 Graisse de troll | 2 | 1 po 6 pa |
| Antidote | 1 Glande à venin d'araignée + 1 Racine d'ombre | 2 | 3 po |
| Antidote (wyverne) | 1 Glande de wyverne + 1 Racine d'ombre | 4, efficaces sur le poison **critique** | — |
| Baume | 1 Fleur de braise + 1 Graisse | 3 | 3 po |
| Tisane médicinale | 2 Camomilles | 4 | 2 po |
| Élixir de purification | 1 Mousse lumineuse + 1 Poussière d'os | 1 | 3 po |
| Potion de soin | 1 Lys d'argent + 1 Herbe-à-plaie | 2 | 2 po |
| Potion de soin supérieure | 1 Sang de troll + 1 Lys d'argent | 2 | 8 po |

- **Rendement** = produit × (0,7 + C_apothicaire / 166) × (1,3 avec le Laboratoire), arrondi à l'inférieur. Une dépouille *abîmée* donne −30 %.
- **Temps :** 2 heures par recette lancée. Un apothicaire en fait 4 par jour.
- **Fabriquer ou acheter ?** L'écran affiche pour chaque recette le coût des ingrédients au cours du jour contre le prix d'achat du remède. C'est la décision clé.

**La forge n'est pas une salle de la guilde.** C'est un acheteur de la ville (2.5.2) chez qui les aventuriers achètent aussi leur équipement (3.8).

### 2.5 La bourse des dépouilles

#### 2.5.1 Formation des cours

Chaque ressource a, en ville, un **stock marchand S** et une **demande journalière D**.

```
Cours = Prix_base × IP × Facteur_OD × Facteur_événements × Bruit

Facteur_OD = clamp( ( (D × 5) / S ) ^ Élasticité , 0,3 , 3,0 )
```

- `D × 5` représente le stock normal, soit 5 jours de demande. Un stock deux fois trop gros divise le cours, un stock à sec le multiplie.
- **Élasticité :** 0,5 pour les ressources communes, 0,8 pour les rares (plus volatiles).
- **Bruit :** ±3 % par jour.
- **Évolution quotidienne :** `S = S + ventes du jour (aventuriers + guilde) + Apport_extérieur − D`.
- **Apport extérieur** : les autres guildes et caravanes apportent environ 50 % de D pour une ressource commune et 20 % pour une rare. Le marché n'est donc jamais entièrement piloté par le joueur.
- **Facteur événements** (5.4.3) : mode de la noblesse pour les fourrures (×2 à ×3 sur la demande), guerre (carapaces et écailles ×2), épidémie (plantes médicinales ×2), afflux de caravanes (stock ×1,5)…

#### 2.5.2 Les acheteurs de la ville

| Acheteur | Achète | Particularité |
|----------|--------|---------------|
| **Le Tanneur** | Peaux, cuirs, fourrures, soie, plumes | Demande stable |
| **L'Alchimiste** | Organes, glandes, sang, poussière d'os, plantes | Demande en hausse forte pendant les épidémies |
| **Le Forgeron-armurier** | Carapaces, écailles, os, crocs, défenses, pierres runiques | Vend aussi l'**équipement** aux aventuriers (3.8). Demande en hausse pendant les guerres |
| **La Halle aux vivres** | Viandes, truffes, plantes comestibles | Prix bas, achète tout, très liquide |
| **Le Collectionneur** | Matières rares, objets trouvés, trophées | Apparaît quand la ville atteint le palier **Ville** (5.3). Paie +20 à 50 %, mais n'achète que **sur contrat** |

- **Frais de vente** : 10 % pour un aventurier qui vend lui-même, 5 % pour la guilde (elle a un courtier attitré).
- **Réputation auprès de chaque acheteur** (0–100). Elle monte avec les livraisons et les contrats honorés. Elle donne jusqu'à +10 % sur le prix de vente et des contrats plus juteux.

#### 2.5.3 Les contrats

Les acheteurs proposent des **commandes à échéance** :

> *« Le Tanneur demande 10 peaux de loup, qualité abîmée minimum, avant le jour 24. Paiement : cours + 50 %. »*

- 1 à 3 offres par semaine, **3 contrats actifs maximum**.
- **Prime** : +30 à +80 % sur le cours.
- **Échec** : réputation auprès de l'acheteur −15, et renommée −2.
- Pour honorer un contrat, le joueur doit **inciter** ses aventuriers à chasser l'espèce voulue, en publiant une prime sur le tableau (4.4). C'est le lien voulu entre le marché et la gestion indirecte.

### 2.6 Fiscalité

#### 2.6.1 La taxe de la guilde

- **Taux unique** réglable de **0 à 40 %**, par pas de 1 %.
- Assiette : `récompense versée par le client + or trouvé + valeur des dépouilles et des plantes au cours du jour`. Il n'y a **pas de commission séparée** sur les quêtes. La part d'une quête payée par la guilde elle-même (primes et bonus, 4.4) n'est pas taxée.
- **Exonérations** (interrupteurs) :
  - débutants (niveau ≤ 3) exonérés ;
  - quêtes d'aide en ville exonérées.
- **Taux de référence régional** : environ 15 %, la moyenne des taux des guildes rivales (5.5). Il varie avec leurs décisions et les événements.

| Taux de la guilde | Effet |
|-------------------|-------|
| 0 à 10 % | Renommée +1 par semaine (6.1.2), recrues attirées, mais revenu faible |
| 10 à 20 % | Zone neutre |
| Au-delà de 20 % | **Grief fiscal** : +0,5 × (Taux − 15) à chaque retour de quête. La fraude grimpe |
| Au-delà de 30 % | Rumeur de « guilde rapace » : renommée −, flux de recrues ×0,5 |

Le Grief fiscal s'ajoute au Grief tarifaire et pèse sur la décision de départ (3.12.2).

#### 2.6.2 La fraude

À chaque retour, chaque aventurier peut dissimuler une partie de son butin :

```
P(fraude) = clamp( 2 × (Taux − 10 %) × (1 − Loyauté / 100) + Mod_trait , 0 , 80 % )
Part dissimulée : 20 à 60 % du butin
```

- *Mod_trait* : **Malhonnête** +15 %, **Honnête** −100 % (ne fraude jamais).
- **Détection** : 5 % sans inspecteur. Avec un **Inspecteur du butin** (1.4.2), `20 % + 0,6 × C_inspecteur`. Un inspecteur couvre 20 aventuriers ; au-delà, son efficacité baisse.
- **Sanctions** (le joueur choisit la politique) :

| Sanction | Effet sur le fraudeur | Effet sur les autres |
|----------|-----------------------|----------------------|
| Avertissement | Moral −5, fraude future −50 % pendant 14 jours | — |
| Amende (2 × le montant dissimulé) | Moral −15, Grief +10 | Fraude générale −10 % pendant 7 jours |
| Exclusion | Quitte la guilde | Fraude générale −25 %, mais moral −3 pour ses amis (3.11.1) |

### 2.7 Populations et danger : la boucle écologique

Chaque espèce, et chaque plante, a une **population P (0 à 100 %)** par zone.

```
Croissance quotidienne : ΔP = r × P × (1 − P / 100) + Migrations
Chaque mise à mort      : P = P − k
```

| Espèce | r (croissance) | k (par mise à mort) |
|--------|----------------|---------------------|
| Rat géant | 0,20 | 0,5 |
| Sanglier, Loup, Gobelin | 0,08 | 1,5 |
| Araignée, Crabe-roc | 0,06 | 2 |
| Ours-hibou, Goule | 0,04 | 3 |
| Troll | 0,03 | 5 |
| Wyverne | 0,015 | 8 |
| Golem | 0 (ne se reproduit pas) | 20 (5 golems par zone) |
| Jeune dragon | Unique : réapparaît par événement | 100 |

**Effets de la population :**

| Population | Effet |
|------------|-------|
| **Prolifération** (> 80 %) | Attaques de fermes et de caravanes → quêtes d'**escorte** et d'**extermination** plus nombreuses, Prospérité −, Danger de la zone ↑ |
| **Normale** (30 à 80 %) | — |
| **Raréfiée** (< 30 %) | Quêtes ciblant l'espèce plus rares, dépouilles rares, cours en hausse |
| **Disparue localement** (0 %) | Plus de rencontres. Retour possible par un événement de *migration* (5.4.3) |

```
Danger_zone = Σ ( P_espèce × Menace_espèce ) / Danger_max_zone        (0 à 100)
```

Le Danger régional global (5.1.1) est la moyenne pondérée des zones. **La boucle complète est la suivante :** chasser beaucoup fait baisser le danger et rend la région sûre et prospère, mais raréfie les dépouilles et fait monter les cours. Négliger une zone la fait proliférer, et la menace monte jusqu'à la ville.

---

## 3. Les aventuriers (agents autonomes)

### 3.1 La fiche d'un aventurier

| Bloc | Contenu |
|------|---------|
| **Identité** | Nom, âge (18 à 45 ans à l'arrivée), classe, niveau, portrait généré |
| **Attributs** (3.3) | Force, Agilité, Intelligence, Volonté, Constitution |
| **Compétences** (3.4) | 4 générales et 2 de classe |
| **Jauges vitales** (3.5) | Santé, Énergie, Faim, Moral |
| **Jauges sociales** (3.6) | Fierté, Respectabilité, Loyauté, Grief tarifaire, Grief fiscal |
| **Économie** | Or personnel, dettes envers la guilde (soins à crédit), objectif de fortune (caché) |
| **Traits** (3.7) | 2 traits, dont le second est **caché pendant 7 jours** |
| **Inventaire** (3.8) | Arme, armure, accessoire, sac de consommables |
| **Relations** (3.11) | Amis, rivaux, équipe |
| **États** | Blessures et altérations (1.8.1) |
| **Pensées** (3.10) | Les dernières décisions et leurs raisons |
| **Historique** | Quêtes réussies ou échouées, monstres tués, faits marquants |

### 3.2 Les classes

| Classe | Rôle | Attributs principaux | Arme | Armure permise | Compétences de classe | Particularité |
|--------|------|----------------------|------|----------------|-----------------------|---------------|
| **Guerrier** | Tank, dégâts au contact | FOR, CON | Épée, hache, lance | Toutes | Maniement d'armes, Protection | Capacité de transport plus élevée |
| **Rôdeur** | Éclaireur, dégâts à distance | AGI, VOL | Arc | Légère, intermédiaire | Tir, Pistage | Connaissance des monstres +3 au départ, cueille au passage |
| **Voleur** | Fouille, évitement | AGI, INT | Dagues | Légère | Fouille, Discrétion | Or et objets trouvés +20 %. Sa fraude est plus difficile à détecter (−10 %) |
| **Mage** | Dégâts magiques | INT, VOL | Bâton, grimoire | Robe uniquement | Arcanes, Savoir ancien | PV réduits. Indispensable contre les golems et en ruines |
| **Clerc** | Soins, anti-morts-vivants | VOL, CON | Masse | Légère, intermédiaire | Soins, Exorcisme | Soigne l'équipe en quête, cueille au passage |

**Une équipe équilibrée** comprend un tank (Guerrier), un soigneur (Clerc) et des dégâts (Rôdeur, Mage, Voleur). C'est ce qui guide la formation des équipes (3.11).

### 3.3 Les attributs

Cinq attributs, de **1 à 20**.

| Attribut | Abrév. | Influence |
|----------|--------|-----------|
| **Force** | FOR | Dégâts au contact, capacité de transport |
| **Agilité** | AGI | Dégâts à distance, esquive, fuite |
| **Intelligence** | INT | Dégâts magiques, apprentissage (XP d'entraînement +) |
| **Volonté** | VOL | Résistance aux malédictions et à la peur, puissance des soins, moral plus stable |
| **Constitution** | CON | PV maximum, résistance au poison et aux maladies, récupération d'énergie |

- **À l'arrivée :** 8 points de base dans chaque attribut, +4 dans les 2 attributs principaux de la classe, et ±2 de variation aléatoire.
- **Montée de niveau :** +1 dans un attribut principal (en alternance), et +1 dans un attribut choisi par l'IA selon ses traits et ce qu'elle a vécu.
- **Séquelles** (fracture mal soignée, 1.8.1) : −1 permanent dans un attribut.

**Valeurs dérivées :**

```
PV_max          = 20 + 5 × CON + 3 × Niveau          (Mage : × 0,8)
Capacité_portage = 4 + FOR / 2                        (unités de poids, voir 2.3.2)
Attaque         = 2 × Attribut_d'attaque + Compétence_d'arme + Bonus_arme
Défense         = CON + AGI / 2 + Protection + Bonus_armure
```

L'attribut d'attaque est FOR pour le Guerrier, AGI pour le Rôdeur et le Voleur, INT pour le Mage, VOL pour le Clerc. La compétence d'arme est Maniement d'armes (Guerrier), Tir (Rôdeur), Discrétion (Voleur, attaque sournoise), Arcanes (Mage) ou Exorcisme (Clerc). Le combat est résolu en 4.7.

### 3.4 Les compétences

Toutes les compétences vont de **0 à 20**. Elles progressent **par l'usage** (en quête) et par **l'entraînement** (1.7).

**Compétences générales (toutes classes) :**

| Compétence | Effet | Progresse par |
|------------|-------|---------------|
| **Connaissance des monstres** | Qualité des dépouilles (2.3.1), repère les points faibles | Les monstres tués, le Maître-chasseur |
| **Survie** | Cueillette, durée de voyage, perte de faim et d'énergie en quête | Les jours passés hors de la ville |
| **Cohésion** | Efficacité en équipe, partage de butin sans dispute | Les quêtes en équipe, le Stratège |
| **Négoce** | Prix de vente en ville (jusqu'à +10 %), achats moins chers chez le Forgeron | Les ventes, Respectabilité élevée |

**Compétences de classe :**

| Classe | Compétence 1 | Compétence 2 |
|--------|--------------|--------------|
| Guerrier | **Maniement d'armes** : attaque au contact | **Protection** : absorbe une partie des blessures des alliés |
| Rôdeur | **Tir** : attaque à distance, frappe en premier | **Pistage** : trouve plus vite la cible, réduit la durée des quêtes de chasse |
| Voleur | **Fouille** : or et objets trouvés, coffres | **Discrétion** : évite les combats inutiles, fuite réussie |
| Mage | **Arcanes** : dégâts magiques, efficace contre golems et goules | **Savoir ancien** : exploration des ruines, identification des reliques, évite les malédictions |
| Clerc | **Soins** : soigne l'équipe pendant la quête, réduit la gravité des états | **Exorcisme** : contre les morts-vivants, protège des malédictions |

**Progression par l'usage :** chaque utilisation significative donne une chance de +1, décroissante quand la compétence est haute : `P(+1) = 10 % × (1 − Compétence / 25)`.

### 3.5 Les jauges vitales

| Jauge | Plage | Baisse | Restauration |
|-------|-------|--------|--------------|
| **Santé** (PV) | 0 à PV_max | Combats, poison, maladie | Sommeil (lent), lit d'infirmerie (×3), potions, soins du Clerc |
| **Énergie** | 0 à 100 | −3 par heure éveillé, −15 par séance d'entraînement, davantage en quête | Sommeil (1.5.1) |
| **Faim** | 0 à 100 (100 = repu) | −4 par heure éveillé, −1,5 par heure de sommeil (1.6.1) | Repas |
| **Moral** | 0 à 100 | Prix abusifs, échecs, deuils, inconfort | Bons repas, confort, réussites, taverne, amis |

**Paliers de moral :**

| Moral | Statut | Effet |
|-------|--------|-------|
| 80 à 100 | **Enthousiaste** | Performance en quête +10 %, Loyauté +1 par jour |
| 40 à 79 | Normal | — |
| 20 à 39 | **Morose** | Performance −10 %, refuse les quêtes risquées |
| 0 à 19 | **Désespéré** | Refuse toute quête, tendance à boire, envie de partir fortement accrue |

Le moral revient chaque jour vers **50** de **15 % de l'écart** (au moins 2 points), plus vite pour un aventurier à Volonté élevée.

> **Ajusté en tranche 1 :** avec un retour fixe de 2 points par jour, une paillasse (−5 par nuit) et deux gruaux suffisaient à faire tomber tout le monde à 0. Avec un retour proportionnel, le moral se stabilise à un niveau qui reflète le confort offert : environ 25 avec paillasses et gruau, environ 75 avec un ragoût et des quêtes réussies.

### 3.6 Les jauges sociales

#### 3.6.1 Fierté (0 à 100) : l'exigence de standing

La Fierté de départ dépend des traits (de 10 à 50). Elle **monte** avec le niveau (+2 par niveau) et les exploits (tuer un monstre de rang B ou plus : +5). Elle **baisse** avec les humiliations : échec, duel perdu, nuit sur une paillasse.

| Fierté | Exigences |
|--------|-----------|
| < 30 | Humble : dort et mange n'importe où sans malus |
| 30 à 59 | Évite les paillasses s'il peut payer mieux |
| 60 à 79 | Exige au moins une chambre individuelle. Refuse les quêtes de 2 rangs sous son niveau. Griefs ×1,3 |
| 80 et plus | Exige la suite et les plats haut de gamme. Refuse les quêtes d'aide en ville. Griefs ×1,6. Supporte mal un rival mieux classé |

#### 3.6.2 Respectabilité (0 à 100) : la réputation en ville

Elle part de 20. Elle **monte** avec les quêtes réussies (plus encore pour les escortes et l'aide en ville) et les monstres de haut rang tués. Elle **baisse** avec les bagarres, la fraude détectée et les échecs.

| Effet | Détail |
|-------|--------|
| **Renommée de la guilde** | La moyenne des 10 aventuriers les plus respectés compte dans la Renommée (6.1.2) |
| **Quêtes spéciales** | Les nobles et les marchands exigent des aventuriers respectés (Respectabilité ≥ 60) |
| **Négoce** | Prix en ville ±10 % |
| **Recrutement** | Les aventuriers respectés attirent des recrues de leur classe |
| **Convoitise** | Au-delà de 70, les **guildes rivales tentent de les débaucher** (3.12) |

#### 3.6.3 Loyauté (0 à 100) : l'attachement à la guilde

Elle part de 30.

| Hausse | Baisse |
|--------|--------|
| +1 par semaine passée dans la guilde | −10 pour une sanction (2.6.2) |
| +5 par soin à crédit accordé | −5 pour chaque nuit sans lit disponible |
| +1 par jour à moral Enthousiaste | −1 par jour à moral Morose ou Désespéré |
| +3 pour une prime de la guilde réussie | −3 par refus pour prix trop élevé |

Elle réduit la fraude (2.6.2), l'envie de partir (3.12) et l'efficacité des débauchages.

#### 3.6.4 Griefs

Le **Grief tarifaire** (1.3.4) et le **Grief fiscal** (2.6.1) sont les deux mesures du ressentiment envers la guilde. Ils baissent de 2 par jour chacun.

### 3.7 Les traits

Chaque aventurier a **2 traits**. Les traits opposés ne peuvent pas se cumuler. Le **second trait est caché pendant 7 jours** : on découvre le caractère de la recrue à l'usage.

| Trait | Opposé | Effet |
|-------|--------|-------|
| Radin | Dépensier | Tolérance de prix −0,2, choisit toujours le moins cher |
| Dépensier | Radin | Tolérance +0,3, aime le luxe, épargne peu |
| Honnête | Malhonnête | Ne fraude jamais, Respectabilité +20 % |
| Malhonnête | Honnête | Fraude +15 %, partage le butin injustement |
| Téméraire | Prudent | Vise des quêtes au-dessus de son rang, risque de mort accru |
| Prudent | Téméraire | Fuit plus tôt, refuse les quêtes risquées |
| Ambitieux | Paresseux | Cherche l'entraînement et les quêtes, Fierté qui monte vite |
| Paresseux | Ambitieux | Se repose plus, s'entraîne rarement |
| Sociable | Solitaire | Aime la taverne et les équipes, se fait des amis vite |
| Solitaire | Sociable | Préfère les quêtes en solo ou en duo, moral −5 en grande équipe |
| Gourmand | Frugal | Mange plus souvent, adore les plats de monstre |
| Frugal | Gourmand | Se contente du gruau sans malus de moral |
| Ivrogne | — | Boit beaucoup (revenu de taverne), risque de bagarre |
| Pieux | — | Moral +5 s'il est soigné par un Clerc, résiste mieux aux malédictions |
| Superstitieux | — | Refuse les quêtes dans les Ruines |
| Coquet | — | Dépense en équipement et accessoires, Fierté +10 |
| Bagarreur | — | Rivalités fréquentes, apprécie la salle de duel |
| Mentor | — | Les débutants de son équipe gagnent +20 % d'XP |
| Robuste | — | CON +2, guérit plus vite |
| Malchanceux | — | Dépouilles abîmées plus souvent, mais Volonté +2 |

### 3.8 L'inventaire

#### 3.8.1 Les emplacements

| Emplacement | Contenu |
|-------------|---------|
| **Arme** | Une arme de sa classe |
| **Armure** | Selon la classe : robe, légère, intermédiaire ou lourde |
| **Accessoire** | Amulette, anneau, bottes, talisman… |
| **Sac** | 4 consommables : potions, antidotes, bandages, paniers de route. Chacun **pèse 1** dans la capacité de portage (2.3.2) |

#### 3.8.2 Les paliers d'équipement

L'équipement est vendu par le **Forgeron-armurier** de la ville (accessoires : par l'Alchimiste).

| Palier | Matériau | Niveau conseillé | Prix arme | Prix armure | Bonus |
|--------|----------|------------------|-----------|-------------|-------|
| 1 | Fer rouillé | 1 | 5 pa | 8 pa | +2 |
| 2 | Fer | 3 | 3 po | 4 po | +4 |
| 3 | Acier | 7 | 12 po | 15 po | +7 |
| 4 | Acier trempé | 12 | 40 po | 50 po | +11 |
| 5 | **Monstre** (carapace, écailles de wyverne, cuir de troll) | 17 | 150 po | 180 po | +16 |
| 6 | **Runique** (pierre runique) | 22 | 500 po | 600 po | +22 |
| 7 | **Draconique** (écailles de dragon) | 27 | 2 000 po | 2 500 po | +30 |

**Lien avec le marché des monstres :** à partir du palier 5, le prix et la **disponibilité** chez le Forgeron dépendent des dépouilles vendues en ville.

```
Prix_équipement = Prix_base × IP × (0,5 + 0,5 × Facteur_OD du matériau clé)
```

Si personne ne vend d'écailles de wyverne, le Forgeron n'a pas d'armure de palier 5 en stock. **Vendre tes dépouilles au Forgeron rend tes aventuriers plus forts.**

Les paliers en vente dépendent aussi de la taille de la ville (5.3) : paliers 1 à 4 au Bourg, jusqu'au 6 en Ville, jusqu'au 7 en Cité.

#### 3.8.3 Usure et réparation

- Chaque pièce a une **durabilité** de 100. Elle perd 5 à 20 points par quête, selon la dureté des combats.
- À 0, l'objet est **brisé** et son bonus tombe à 0.
- **Réparation** chez le Forgeron : 10 % du prix de l'objet par tranche de 25 points. C'est une dépense régulière des aventuriers, hors de la guilde.

#### 3.8.4 Objets anciens

Les quêtes dans les **Ruines** peuvent rapporter des **objets anciens**, trouvés par la Fouille du Voleur et identifiés par le Savoir ancien du Mage. L'aventurier peut l'**équiper** s'il lui sert, ou le vendre au **Collectionneur**. Certains sont **maudits** et infligent une malédiction s'ils ne sont pas identifiés.

### 3.9 Niveaux et expérience

- **Niveau maximum : 30.**
- XP nécessaire pour passer du niveau n au niveau n+1 : `XP_requis(n) = 100 × n ^ 1,5`.
- **XP d'une quête type** (une quête de son rang, réussie) : `XP_quête_type(n) = 0,25 × XP_requis(n)`. Il faut donc environ **4 quêtes de son niveau** pour monter d'un niveau. C'est la référence utilisée par l'entraînement (1.7.3).
- **Correspondance indicative entre niveau et rang de quête :** F = 1 à 3, E = 4 à 7, D = 8 à 12, C = 13 à 17, B = 18 à 22, A = 23 à 27, S = 28 à 30.

### 3.10 La prise de décision

L'IA choisit une nouvelle activité **à la fin de la précédente**. Elle ne la remet pas en cause en cours de route, sauf urgence. Cela évite les comportements erratiques.

#### 3.10.1 Couche 1 : les urgences (dans cet ordre)

| Priorité | Condition | Action | Si impossible |
|----------|-----------|--------|---------------|
| 1 | État **Critique**, ou Santé < 25 % | Se soigner : infirmerie de la guilde (ou à crédit), sinon Temple, sinon Rebouteux | Repos au lit, et risque de mort |
| 2 | État **Sérieux** | Se soigner, avec la même chaîne | Repos et attente |
| 3 | Faim < 20 | Manger l'option acceptable la moins chère | Concurrent, sinon jeûne (moral −) |
| 4 | Énergie < 15 | Dormir | Auberge concurrente, sinon dehors |
| 5 | Or < 2 jours de coût de la vie | **Besoin d'argent** : la quête la plus sûre disponible (aide en ville en priorité) | Accepte de travailler en dessous de sa Fierté (moral −5) |

#### 3.10.2 Couche 2 : les scores d'utilité

Si aucune urgence ne s'applique, l'aventurier note chaque activité possible et choisit la meilleure.

```
Score(action) = Besoin(action) × Poids_traits × Faisabilité × (1 ± 10 % aléatoire)
```

| Action | Besoin (0 à 1) | Exemple de poids de trait |
|--------|----------------|---------------------------|
| Manger | `(70 − Faim) / 50` | Gourmand ×1,5 |
| Dormir | `(60 − Énergie) / 45`, +0,3 la nuit | Paresseux ×1,3 |
| Se soigner (léger) | Selon la gravité et la Santé | Prudent ×1,3 |
| S'entraîner | `0,5 × Énergie / 100`, si une séance abordable existe | Ambitieux ×1,5, Paresseux ×0,5 |
| Chercher une quête | `(Objectif − Or) / Objectif + 0,1 × jours sans quête` | Téméraire ×1,3 |
| Taverne | 0,4 le soir | Sociable ×1,5, Ivrogne ×2 |
| S'équiper (ville) | Si Or > 1,5 × prix du palier suivant et niveau suffisant | Coquet ×1,5 |
| Vendre son butin (ville) | Si son sac contient des dépouilles | Négoce élevé ×1,2 |
| Flâner (gratuit) | 0,15 constant | — |

- **Faisabilité :** 0 si l'action est impossible (fermé, plein), 0 si le prix est jugé trop cher (R > T, 1.3.4). Dans ce cas, l'option concurrente est évaluée à la place.
- **Chaque soir,** l'aventurier évalue aussi s'il quitte la guilde (3.12).

#### 3.10.3 Les pensées visibles

Chaque décision importante génère une **pensée** courte, affichée dans la fiche de l'aventurier et filtrable dans le journal. Elle donne toujours la **raison** du choix.

> *« J'ai faim, mais 5 pa le ragoût, c'est du vol. Je vais à la Taverne du Pont. »*
> *« Ma lame est émoussée. Il me faut 3 po pour la faire réparer, je pars sur une escorte. »*
> *« Brom est mort aux Pics. Je ne repartirai pas cette semaine. »*
> *« Une suite ! Enfin une guilde qui sait recevoir. »*

L'écran de la guilde agrège ces pensées en **tendances** : « 6 aventuriers trouvent les repas trop chers cette semaine ».

### 3.11 Dynamique sociale

#### 3.11.1 Les relations

Chaque paire d'aventuriers a une **relation de −100 à +100** (0 par défaut, seules les relations non nulles sont stockées).

| Événement | Effet |
|-----------|-------|
| Quête réussie ensemble | +2 |
| L'un a sauvé l'autre (soins, protection) | +8 |
| Soirée de taverne ensemble (si Sociable) | +1 |
| Partage de butin jugé injuste (Malhonnête, Radin) | −10 |
| Bagarre | −15 |
| Duel perdu par un aventurier fier | −10 |

| Relation | Statut | Effet |
|----------|--------|-------|
| ≥ 85 | **Frère d'armes** | Cohésion +5 en équipe. Mort de l'un : deuil de 3 jours pour l'autre, moral −30 |
| 60 à 84 | **Ami** | Cherchent à faire équipe. Moral −20 si l'un meurt. Si l'un part, l'envie de partir de l'autre +15 |
| −40 à −74 | **Rival** | Refusent la même équipe. Compétition (Fierté) |
| ≤ −75 | **Ennemi** | Risque de bagarre à la taverne s'ils sont ensemble |

#### 3.11.2 Les bagarres

Elles se déclenchent le soir, à la taverne, si un aventurier est **ivre** (3 chopes ou plus) en présence d'un rival, ou si un **Bagarreur** est provoqué.

- Blessures légères (plaie) pour les participants.
- Mobilier cassé : qualité du réfectoire −5 jusqu'à réparation (10 po).
- Respectabilité −5 pour les deux, moral −2 pour les témoins.

#### 3.11.3 Les équipes

**Formation :** chaque soir, les aventuriers sans équipe qui veulent partir en quête se réunissent.

1. Le plus respecté devient **chef** et choisit une quête du tableau (4.5).
2. Il recrute selon un score de compatibilité :
   `Compatibilité = Relation + Bonus_rôle_manquant (+30 pour un tank ou un soigneur absent) − 10 × max(0, écart_de_niveau − 3)`
3. La taille visée dépend du rang de la quête : 2 à 5 membres.
4. Les **Solitaires** partent seuls ou en duo sur les quêtes de bas rang.

**Équipes durables :**
- Une équipe qui réussit une quête **reçoit un nom** généré (« Les Lames du Pont », « La Compagnie du Sanglier »).
- Sa **Cohésion d'équipe** (0 à 100) améliore ses performances (4.5.1) :
  `Cohésion_équipe = 2 × moyenne de la compétence Cohésion des membres + Expérience_commune`, où l'expérience commune gagne +5 par quête réussie ensemble, jusqu'à 50.
- **Elle se dissout** en cas de mort d'un membre (50 % de chance), de relation interne sous −40, de départ d'un membre, de 2 échecs consécutifs, ou d'un écart de niveau supérieur à 6.

### 3.12 Le cycle de vie

#### 3.12.1 Arrivée et recrutement

```
Candidats par jour = 0,5 × f(Renommée) × f(Cotisation) × f(Réputation des prix) × f(Danger) × f(Prospérité)
```

- Un danger élevé attire des mercenaires. Une ville prospère attire des aventuriers plus aisés.
- Les candidats de la région se répartissent entre ta guilde et les **guildes rivales** selon leur attractivité (5.5).
- Le candidat se présente **à la porte** et attend **1 jour**. Le joueur voit sa classe, son niveau, ses attributs et son **premier trait**.
- Le joueur **accepte ou refuse**. Une consigne d'intendant permet d'automatiser : « Accepter automatiquement si niveau ≥ 3 et pas Malhonnête ».
- À l'acceptation, il paie la cotisation d'inscription (1.9).

#### 3.12.2 Départ

L'envie de partir est évaluée chaque soir :

```
Envie_de_partir = 0,8 × (50 − Moral) + 0,5 × (Grief_tarifaire + Grief_fiscal) + Offre_rivale + Départs_d'amis − 0,4 × Loyauté
```

| Envie | Statut visible | Conséquence |
|-------|----------------|-------------|
| < 30 | — | — |
| 30 à 59 | **Mécontent** | Pensées négatives, rumeurs (renommée −) |
| ≥ 60 | **Sur le départ** | Annonce son départ, quitte la guilde dans 1 à 3 jours si rien ne change |

- **Débauchage :** un aventurier dont la Respectabilité dépasse 70 peut recevoir une **offre d'une guilde rivale** (Offre_rivale +20 à +40). Le joueur est prévenu et peut réagir, par exemple en améliorant son confort ou en baissant la fiscalité.
- L'aventurier qui part emporte son or et son équipement. Ses dettes envers la guilde sont perdues.

#### 3.12.3 Retraite

- Chaque aventurier a un **objectif de fortune** caché (de 50 à 500 jours de coût de la vie selon ses traits). Il prend sa retraite quand il l'atteint, à 55 ans, ou après des séquelles graves (3 attributs perdus).
- Le temps passe : 1 an de jeu = 112 jours.
- **Reconversion :** un retraité de niveau 10 ou plus, avec une Respectabilité d'au moins 60 et une Loyauté d'au moins 50, peut **proposer de rester** :
  - comme **professeur** de sa classe, au niveau qu'il avait (sa Pédagogie dépend de ses traits : *Mentor* donne un gros bonus) ;
  - ou comme **membre du personnel** (intendant, inspecteur, soigneur pour un Clerc).
- C'est la récompense de l'attachement : les héros qu'on a vus grandir forment la génération suivante.

#### 3.12.4 Mort

- **Mort définitive.** Causes : défaite grave en quête (4.8.3), état Critique non soigné à temps (poison, infection).
- **Cible d'équilibrage :** environ **1 mort toutes les 2 à 3 semaines** de jeu dans une guilde bien gérée, nettement plus si l'infirmerie est négligée ou si les aventuriers partent sous-équipés.
- **Héritage :** l'or et l'équipement vont à la famille. Si la Loyauté était d'au moins 70, il lègue 10 à 30 % de son or à la guilde.
- **Deuil :** effets sur ses amis et son équipe (3.11.1).
- **Mur du Souvenir** (aménagement du siège, 150 po, 1.2) : chaque nom gravé donne +0,5 de renommée (plafonné). Moral +3 pour les aventuriers Pieux et les amis du défunt lors de leur passage.
- Le journal consigne un **éloge funèbre** : nom, niveau, nombre de quêtes, plus grand exploit.

### 3.13 Les 10 aventuriers de départ

| Classe | Nombre | Niveaux |
|--------|--------|---------|
| Guerrier | 3 | 1 à 4 |
| Rôdeur | 2 | 1 à 3 |
| Voleur | 2 | 1 à 3 |
| Mage | 1 | 1 à 2 |
| Clerc | 2 | 1 à 3 |

Ils arrivent avec un équipement de palier 1 (Fer rouillé), 5 à 20 pa, et des traits tirés au hasard. Au moins un est Sociable, pour former une première équipe le premier soir.

---

## 4. Quêtes et tableau des primes

### 4.1 Anatomie d'une quête

| Champ | Exemple |
|-------|---------|
| **Type** | Chasse |
| **Client** | *Maître Odric, éleveur de Vertbois* (Villageois) |
| **Rang** | E |
| **Zone** | Forêt de Vertbois |
| **Objectif** | Tuer 4 loups |
| **Durée estimée** | 1 à 2 jours |
| **Récompense** | 4 po (client) + 1 po (bonus de la guilde) |
| **Danger estimé** | ●●○○○ « Modéré » |
| **Exigences** | 2 aventuriers minimum |
| **Expiration** | Dans 4 jours |

### 4.2 Les types de quêtes

| Type | Rangs | Objectif | Durée | Dépouilles | Particularité |
|------|-------|----------|-------|------------|---------------|
| **Aide en ville** | F | Manutention, garde de nuit, égouts, objet perdu, livraison | 3 à 8 h | Non (sauf rats) | Solo, sans combat (sauf égouts). Respectabilité + |
| **Chasse** | F à S | Tuer N individus d'une espèce | 1 à 6 jours | Oui | Le type « standard » |
| **Extermination** | E à B | Tuer un maximum d'une espèce **qui prolifère** | 1 à 3 jours | Oui | **Ouverte à plusieurs équipes**, payée à la tête |
| **Cueillette** | F à C | Rapporter N plantes | 1 à 4 jours | Plantes, et dépouilles si rencontre | Survie déterminante |
| **Escorte** | E à B | Amener un convoi d'un point à un autre | 2 à 5 jours | Seulement si le convoi est attaqué | Le convoi a ses propres PV. Échec s'il est détruit |
| **Exploration** | C à A | Explorer une ruine (3 à 6 salles) | 2 à 5 jours | Objets anciens, or | Pièges, malédictions, golems |
| **Protection** | D à A | Défendre un village pendant N jours | 2 à 5 jours | Oui | Vagues d'attaques nocturnes |

### 4.3 La génération des quêtes

#### 4.3.1 Les clients

| Client | Rangs | Types | Particularité |
|--------|-------|-------|---------------|
| **Villageois** | F à D | Aide, Chasse, Cueillette, Protection | Nombreux, petites récompenses |
| **Marchands** | E à B | Escorte, Cueillette, Chasse | Plus nombreux quand la ville est prospère |
| **Nobles** | C à S | Chasse de trophée, Exploration | Exigent un chef d'équipe à **Respectabilité ≥ 60**. Récompense +30 % |
| **La Couronne** | D à S | Extermination, Protection | Apparaît lors des événements (guerre, vague de monstres) |
| **Le Temple** | C à A | Exploration, Chasse (morts-vivants) | Récompense partiellement en remèdes (eau bénite) |

Chaque client a une **satisfaction envers la guilde** (0 à 100). Elle fait varier le nombre et la récompense de ses quêtes (±20 %).

#### 4.3.2 Le générateur quotidien

Chaque matin à 06h, de nouvelles quêtes apparaissent, en deux flux séparés :

```
Quêtes de combat par jour (tableau)        = 3 + 0,05 × Prospérité + Bonus_proliférations + Bonus_événements
Petits boulots par jour (panneau séparé)   = 4 + 0,05 × Prospérité        (8 affichés au maximum)
```

> **Ajusté en tranche 1 :** la formule d'origine (2 + 0,02 × Prospérité, tous types confondus) ne donnait qu'environ 3 quêtes par jour. Le simulateur a montré que les aventuriers ne pouvaient pas en vivre : 4 pa d'or moyen et un moral proche de 0 au jour 30. Avec deux flux séparés, un débutant trouve de quoi payer sa soupe chaque jour.

- **Choix de la zone et de l'espèce :** pondéré par la population (2.7). Une espèce qui prolifère génère des chasses et des exterminations, une espèce raréfiée presque aucune.
- **Bonus de prolifération :** +1 quête par espèce au-dessus de 80 % de population.

> **Ajusté en tranche 2 :**
> - **La guilde attire le travail.** Chaque aventurier inscrit ajoute **0,2 quête de combat** et **0,1 petit boulot** par jour (12 petits boulots affichés au maximum). Sans ce terme, l'offre de quêtes était fixe : au-delà d'une quinzaine d'aventuriers, recruter ne rapportait plus rien.
> - **Le greffier trie les quêtes.** La **portée** de la guilde est le rang que tiennent au moins 3 aventuriers, plus un. Une quête au-delà de cette portée n'est affichée qu'**une fois sur sept** (15 %) ; sinon le greffier en tire une autre (4 essais au maximum). Avant ce tri, les trois quarts du tableau étaient des quêtes de rang C ou B que personne ne pouvait prendre : elles bloquaient les places jusqu'à leur expiration.
- La part d'escortes et d'aides en ville suit la Prospérité. La part de protections suit le Danger.

#### 4.3.3 La récompense

```
Récompense = Base_rang × Mult_type × IP × Urgence × Satisfaction_client × aléa (0,8 à 1,2)
```

| Rang | F | E | D | C | B | A | S |
|------|---|---|---|---|---|---|---|
| **Base_rang** | 1 po | 6 po | 15 po | 35 po | 90 po | 220 po | 500 po |

| Type | Aide | Chasse | Extermination | Cueillette | Escorte | Exploration | Protection |
|------|------|--------|---------------|------------|---------|-------------|------------|
| **Mult_type** | ×0,8 (pour 5 h 30 de travail, proportionnel à la durée) | ×1,0 | Base × 0,1 **par tête**, pendant 12 à 36 h | ×0,7 | ×1,1 | ×1,3 | ×1,4 |

- **Urgence :** ×1,0 en temps normal, jusqu'à ×1,5 pendant une prolifération ou un événement.
- La fourchette obtenue correspond au barème 1.1.2.
- **Ajusté en tranche 2 :** Base_rang des rangs E à S relevée d'environ 50 % (voir 1.1.2). L'extermination passe de Base / 4 à **Base × 0,1 par tête**, sur une durée fixée de 12 à 36 h : à Base / 4, une extermination rapportait plusieurs fois une chasse et vidait le tableau de tout le reste.

#### 4.3.4 Le tableau

- **Taille :** `8 + 2 × (rang de renommée − 1)` quêtes de combat, soit de 8 à 16. Les petits boulots en ville ont leur propre panneau (12 au maximum) et ne comptent pas dans cette limite. **Ajusté en tranche 2 :** les **avis d'extermination** (proliférations) et les **primes de la guilde** ne comptent pas non plus dans cette limite (les primes ont leur propre plafond, 4.4).
- **Expiration :** 2 à 7 jours. Une quête expirée part chez un concurrent.
- **Pénalité d'expiration ou d'échec :** satisfaction du client −5. Renommée de la guilde −0 (rang F), −1 (E–D), −2 (C–B), −4 (A–S).
- **Danger estimé** affiché de 1 à 5 points. Il est calculé par le greffier de la guilde avec une **erreur de ±15 %** : le tableau peut se tromper.

### 4.4 Les primes du joueur

C'est le **levier principal** du joueur sur les aventuriers.

| Action | Fonctionnement |
|--------|----------------|
| **Créer une prime** | Le joueur choisit le type (Chasse, Extermination, Cueillette, Exploration), la zone, la cible (espèce ou plante), la quantité, la récompense et l'expiration. Client : « la Guilde ». |
| **Ajouter un bonus** | Le joueur ajoute X po à une quête existante pour la rendre plus attractive. |

- La somme est **bloquée en trésorerie** dès la publication. Elle est **rendue intégralement** si la prime expire sans être remplie.
- La part payée par la guilde n'est **pas taxée** (la guilde ne se taxe pas elle-même). Le butin rapporté l'est normalement.
- **Primes actives au maximum :** 2 + rang de renommée.
- **Usages typiques :**
  - remplir un **contrat** d'acheteur (2.5.3) : « 10 peaux de loup » ;
  - **réguler** une espèce qui prolifère, avant que le danger n'explose ;
  - **approvisionner** l'apothicairerie ou le réfectoire (lys d'argent, viande de troll) ;
  - attirer une équipe vers une quête noble qui risque d'expirer.

### 4.5 Le choix d'une quête par une équipe

Le soir, le chef d'équipe (3.11.3) parcourt le tableau.

#### 4.5.1 Le risque perçu

```
Puissance_équipe = Σ (Attaque + Défense + PV / 4) × (1 + Cohésion_équipe / 100) × Mod_moral
Chance_perçue    = Puissance_équipe / (Puissance_équipe + Danger_estimé × Biais)
```

- La **Difficulté** d'une quête est calculée dans la même unité que la Puissance : `Σ (Attaque + Défense + PV / 4)` sur les monstres attendus (taille de groupe moyenne × nombre de rencontres prévues).
- *(Remplacé en tranche 2 par l'estimation de Lanchester, voir ci-dessous.)* Elle est multipliée par un **facteur de difficulté perçue de 0,5** (ajusté en tranche 1) : sans lui, les aventuriers surestimaient tellement les monstres qu'ils refusaient des combats faciles.
- Le **Danger estimé** est cette Difficulté avec l'erreur du greffier (±15 %). Il est affiché de 1 à 5 points selon son rapport à la puissance d'une équipe type du rang.
- `Mod_moral` vaut ×1,1 si l'équipe est en moyenne Enthousiaste, ×0,9 si elle est Morose, ×1 sinon.
- **Exemple :** 3 aventuriers de niveau 4 (Puissance ≈ 230) contre 3 loups (Difficulté ≈ 130) ont une chance perçue d'environ 64 %. Un chef normal hésite, un Téméraire accepte.

| Profil du chef | Biais | Seuil d'acceptation (Chance_perçue) |
|----------------|-------|-------------------------------------|
| Téméraire | ×0,7 (sous-estime) | 45 % |
| Normal | ×1,0 | 65 % |
| Prudent | ×1,4 (surestime) | 80 % |
| Équipe « à court d'argent » (3.10.1) | ×1,0 | 40 % |

> **Ajusté en tranche 2 : estimation de Lanchester.** La formule « Attaque + Défense + PV / 4 » et le facteur de difficulté perçue de 0,5 sont remplacés. Avec les 12 espèces, ils sous-estimaient les monstres à forte attaque (trolls, crabes-rocs), et les équipes partaient se faire tuer. Chaque camp a désormais une **force** :
> ```
> Dégâts_par_round = Attaque² / (Attaque + Défense_adverse) × 0,3      (la formule du combat réel, 4.7.2)
> Force            = Σ Dégâts_par_round × Σ PV                        (loi de Lanchester simplifiée)
> R                = Force_équipe / (Force_monstres_estimée × Biais × Prudence)      Prudence = 2
> Chance_perçue    = R / (1 + R)
> ```
> - La force de l'équipe compte la cohésion, le moral, les soins du Clerc et les potions du sac. Celle des monstres compte leurs capacités spéciales (meute, charge, carapace, régénération…).
> - Les seuils d'acceptation du tableau ci-dessus ne changent pas.

#### 4.5.2 L'attrait

Parmi les quêtes acceptables, il choisit celle qui a le meilleur attrait :

```
Attrait = ( Récompense_par_membre + 0,5 × Dépouilles_espérées + Valeur_XP ) / Durée_estimée × Préférences
```

**Préférences et filtres :**
- **Fierté ≥ 60 :** refuse les quêtes de 2 rangs sous son niveau. **Fierté ≥ 80 :** refuse l'aide en ville.
- **Superstitieux :** refuse les Ruines.
- **Nobles :** exigent un chef à Respectabilité ≥ 60.
- Une **prime de la guilde** donne un bonus d'attrait (+10 %) aux aventuriers loyaux (Loyauté ≥ 60).

#### 4.5.3 Les préparatifs

La quête est **réservée** le soir. Le départ a lieu le lendemain à **07h**, après le petit-déjeuner (ajusté en tranche 1 : avec un départ à 06h, les équipes partaient le ventre vide et rebroussaient chemin). Avant le départ, chaque membre remplit son sac selon son budget, dans cet ordre de priorité :
1. une potion de soin ;
2. un panier de route par jour prévu ;
3. un antidote si la zone est venimeuse (araignées, wyvernes) ;
4. des bandages.

C'est une **source de revenus importante** pour le réfectoire et l'infirmerie.

> **Ajusté en tranche 2 : provisions de la ville.** Quand le réfectoire ne vend pas de paniers de route (niveau 1, ou panier absent du menu), les aventuriers achètent leurs provisions à l'**échoppe de la ville**, ×1,4 plus cher, et la guilde n'en touche rien. Une ligne du journal le signale. Sans ce repli, plus de la moitié des chasses lointaines échouaient : les équipes rebroussaient chemin le ventre vide.

### 4.6 Le déroulement par étapes

Une quête est simulée **heure par heure**, comme le reste du monde.

```
PRÉPARATIFS ─► TRAJET ALLER ─► OBJECTIF ─► (CAMPS DE NUIT) ─► TRAJET RETOUR ─► COMPTOIR
                  │               │                               │
                  └─ rencontres ──┴──────── rencontres ───────────┘
```

#### 4.6.1 Le trajet

- **Durée :** trajet de la zone (2.1.1) × `(1 − Survie_moyenne / 50)` au minimum ×0,6. L'escorte avance ×1,5 plus lentement.
- **Rencontres aléatoires :** un test toutes les 4 heures de trajet.
  `P(rencontre) = Danger_zone / 200`, ×1,5 la nuit, ×2 pour une escorte.
  L'espèce rencontrée est tirée selon les populations de la zone.
- La **Discrétion** du Voleur permet d'éviter une rencontre : `P(éviter) = 3 × Discrétion %`.

#### 4.6.2 L'objectif selon le type

| Type | Déroulement |
|------|-------------|
| **Aide en ville** | Un test de compétence adapté (FOR pour la manutention, AGI pour attraper un voleur, INT pour retrouver un objet). Réussite de base 85 %. |
| **Chasse** | **Pistage** : `6 h × (1 − Pistage / 40) × (50 / Population)`. Puis combats jusqu'à N mises à mort. |
| **Extermination** | Combats successifs pendant la durée fixée. Chaque tête est payée. |
| **Cueillette** | Toutes les 2 h : `Plantes = 1 + Survie / 5`, modulé par la population de la plante. Rencontres possibles. |
| **Escorte** | Trajet avec le convoi. En cas d'attaque, les monstres visent aussi le convoi (PV du convoi = 100). |
| **Exploration** | 3 à 6 salles, chacune avec un tirage : piège (test de Discrétion ou de Savoir ancien, sinon blessure), combat, trésor (test de Fouille : or, objets anciens) ou malédiction (test d'Exorcisme ou de Volonté). |
| **Protection** | Chaque nuit, une vague d'attaque avec une probabilité de 60 %. Les pertes du village réduisent la récompense. |

#### 4.6.3 La vie au camp

- **Sommeil au camp :** l'énergie remonte à `50 % + 2 × Survie %`.
- **Faim :** un panier de route nourrit une journée. Sans panier, test de Survie pour chasser ou cueillir de quoi manger, sinon la faim continue de baisser (moral −, performance −).
- **Abandon :** si la faim moyenne descend sous 10 alors que plus personne n'a de panier, ou si l'énergie moyenne descend sous 10, le chef décide de rentrer.
- **Ajusté en tranche 2 :**
  - **Gibier :** au camp, sans panier, l'équipe fait d'abord rôtir une part de la viande qu'elle rapporte (+50 de faim), avant le test de Survie.
  - **Blessés :** sur place, le chef rentre si les PV moyens de l'équipe tombent sous **60 %** (Prudent), **45 %** (Normal) ou **30 %** (Téméraire).
  - **Retraite en combat :** l'équipe fuit aussi dès qu'un membre debout a moins de 25 % de ses PV sans potion, sauf si un Clerc est présent.
  - **Objectif atteint au retour :** une chasse ou une cueillette dont l'objectif est atteint sur le chemin du retour (gibier croisé en route) compte comme **réussie**.

### 4.7 Le combat

Les combats sont résolus en **rounds abstraits** (10 au maximum). Le journal n'en garde qu'un **résumé**.

#### 4.7.1 Les statistiques des monstres

| Espèce | PV | Attaque | Défense | Groupe | Capacité spéciale |
|--------|----|---------|---------|--------|-------------------|
| Rat géant | 8 | 10 | 5 | 3 à 6 | Morsure : 10 % de Maladie légère |
| Sanglier | 30 | 20 | 12 | 1 à 2 | **Charge** : 1er round ×1,5 |
| Loup | 25 | 22 | 15 | 3 à 5 | **Meute** : +10 % d'attaque par loup au-delà de 2 |
| Araignée | 30 | 24 | 14 | 1 à 3 | **Venin** : 20 % de Poison par touche |
| Gobelin | 20 | 18 | 12 | 4 à 8 | **Couards** : fuient à 50 % de pertes. Portent de l'or |
| Crabe-roc | 60 | 30 | 40 | 1 à 3 | **Carapace** : Défense ×1,5 contre les attaques physiques |
| Ours-hibou | 120 | 45 | 30 | 1 | **Étreinte** : 15 % de Fracture par touche |
| Troll | 200 | 60 | 40 | 1 à 2 | **Régénération** : +10 PV par round, sauf s'il est touché par les Arcanes |
| Goule | 60 | 50 | 30 | 3 à 6 | **Malédiction** : 10 % par touche. Exorcisme : dégâts ×2 |
| Wyverne | 350 | 90 | 60 | 1 à 2 | **Venin grave** : 30 %. **Aérienne** : Tir ×1,5, contact ×0,7 |
| Golem runique | 900 | 120 | 120 | 1 | Immunisé au poison. Dégâts physiques ×0,5 |
| Jeune dragon | 3 000 | 220 | 150 | 1 | **Souffle** tous les 3 rounds : Brûlure sur toute l'équipe |

#### 4.7.2 Un round

1. **Initiative :** au 1er round, les Rôdeurs tirent en premier.
2. **Les aventuriers agissent :**
   - chacun attaque, en visant le monstre le plus blessé ;
   - le **Clerc soigne** au lieu d'attaquer si un allié est sous 50 % de PV : `Soin = VOL + 2 × Soins` ;
   - une **potion** du sac est bue automatiquement sous 25 % de PV.
3. **Les monstres agissent :** chacun attaque un aventurier au hasard. Le **Guerrier attire les coups** (poids ×2) et sa Protection réduit les dégâts reçus par ses alliés de `Protection × 2 %`.

```
Dégâts = Attaque × Attaque / (Attaque + Défense_cible) × 0,3 × aléa (0,8 à 1,2)
```

4. **États infligés :** chaque touche peut infliger l'état de l'espèce (1.8.1). La gravité dépend des dégâts : moins de 20 % des PV max = Légère, 20 à 40 % = Sérieuse, plus de 40 % = Critique.
5. **Test de retraite** (4.8).

> **Repère :** 3 débutants contre 3 loups gagnent en 3 à 4 rounds, en perdant chacun environ 15 % de leurs PV. 4 aventuriers de niveau 20 bien équipés contre une wyverne gagnent en environ 8 rounds, mais l'un d'eux risque de tomber à terre sans Clerc.

#### 4.7.3 Marge de victoire

`Marge = PV restants de l'équipe / PV au début du combat` (de 0 à 1). Elle sert à la qualité des dépouilles (2.3.1).

### 4.8 Retraite, échec et aventuriers à terre

#### 4.8.1 La retraite

À chaque round, le chef évalue la situation. Il ordonne la retraite si :
- les PV totaux de l'équipe passent sous un seuil : **60 %** (Prudent), **40 %** (normal), **20 %** (Téméraire) ;
- ou un membre est à terre et l'équipe n'a ni Clerc ni potion.

```
P(fuite réussie) = 50 % + AGI_moyenne + 2 × Discrétion_max − 10 % par monstre au-delà de 2
```

En cas d'échec, le combat dure un round de plus, puis on reteste.

#### 4.8.2 L'échec d'une quête

- **Aucune récompense.** Les dépouilles et plantes déjà récoltées sont conservées.
- Extermination et cueillette sont payées **au prorata** si au moins 50 % de l'objectif est atteint.
- XP ×0,3, Respectabilité −3, moral −10, satisfaction du client −5.

#### 4.8.3 Un aventurier à terre

Un aventurier à 0 PV est **à terre**.

1. **Pendant le combat**, un allié peut le relever :
   - le Clerc, avec une chance de `40 % + 3 × Soins %` ;
   - un allié qui lui fait boire une potion du sac (automatique).
2. S'il est encore à terre **à la fin du combat** :
   ```
   P(mort) = clamp( 60 % − 2 × CON % + 10 % si le monstre est de rang B ou plus − 15 % si un Clerc est présent , 30 %, 60 % )
   ```
3. S'il survit, il garde un **état Critique** et l'équipe **abandonne la quête pour le ramener**.
4. **Si toute l'équipe tombe à terre,** chacun fait son test de mort. Les survivants rentrent seuls, en retard, avec un état Critique.

C'est ce qui rend les **Clercs**, les **potions** et l'**infirmerie** vitaux.

### 4.9 Le retour et les récompenses

À l'arrivée, l'équipe passe au **comptoir** (2.4).

| Gain | Détail |
|------|--------|
| **Récompense** | Partagée à **parts égales**. Un chef Malhonnête ou Radin peut s'octroyer une part plus grosse, ce qui donne −10 de relation avec chaque membre (3.11.1) |
| **Taxe de la guilde** | Sur la récompense du client, l'or trouvé et le butin (2.6). Pas sur la part payée par la guilde |
| **XP** | `XP_quête_type(niveau) × Mod_rang`. Mod_rang : ×1,5 pour un rang au-dessus de son niveau, ×1 pour le sien, ×0,5 pour un rang en dessous, ×0,2 pour deux rangs en dessous |
| **Respectabilité** | +2 (F–E), +3 (D–C), +5 (B et plus). +3 pour l'aide en ville et les escortes |
| **Cohésion d'équipe** | +5 par quête réussie ensemble |
| **Satisfaction du client** | +3 |
| **Usure** | −5 à −20 de durabilité sur l'arme et l'armure (3.8.3) |

### 4.10 Le suivi des quêtes par le joueur

- **Carte régionale :** les 6 zones colorées selon leur Danger, et les **icônes des équipes** qui se déplacent sur les routes.
- **Clic sur une équipe :** journal de la quête en cours, étape par étape.
  > *Jour 2, 14h — Les Lames du Pont affrontent 4 loups à l'orée de Vertbois. Victoire en 3 rounds. Brom : Plaie sérieuse.*
  > *Jour 2, 20h — Camp. Plus que 1 panier de route pour 3.*
- **Aucun contrôle direct**, conformément au pilier n° 1. Le joueur ne peut pas rappeler une équipe.
- Le détail de l'interface est en 7.5.6.

---

## 5. Monde vivant

### 5.1 Les deux indices régionaux

```
              ┌─────────── caravanes attaquées, fermes pillées ───────────┐
              │                                                            ▼
   DANGER (0–100)                                                PROSPÉRITÉ (0–100)
     ▲      │                                                        │      ▲
     │      └─► quêtes de protection et d'extermination              │      │
     │                                                               ▼      │
  populations de monstres (2.7)          prix (IP), quêtes d'escorte, recrues
     ▲                                                                      │
     └──── quêtes réussies par la guilde ◄──── ventes en ville, dépenses ───┘
```

#### 5.1.1 Danger régional

```
Danger = moyenne pondérée des Danger_zone (2.7)
Poids : Ville ×3, Forêt ×2, Collines ×2, Marais ×1, Ruines ×1, Pics ×0,5
```

Les zones proches de la ville comptent davantage : un loup aux portes inquiète plus qu'une wyverne lointaine.

| Danger | Palier | Effets |
|--------|--------|--------|
| 0 à 19 | **Calme** | Peu de quêtes de combat. Moins de mercenaires parmi les recrues |
| 20 à 39 | **Tendu** | Équilibre normal |
| 40 à 59 | **Menaçant** | Quêtes de protection plus nombreuses, récompenses ×1,2. Prospérité qui baisse |
| 60 à 79 | **Critique** | Quêtes de la Couronne. Caravanes rares. Rumeurs d'assaut |
| 80 à 100 | **Assiégé** | Risque d'**assaut sur la ville** (5.6) |

#### 5.1.2 Prospérité de la ville

Chaque jour, la Prospérité se rapproche de 5 % de sa **valeur cible** :

```
Prospérité_cible = 50 − Insécurité + Commerce + Apport_guilde + Saison + Événements

Insécurité    = 0,5 × max(0, Danger − 30)
Commerce      = +2 par escorte réussie dans la semaine, −3 par escorte échouée   (de −15 à +15)
Apport_guilde = valeur des ventes en ville et des dépenses des aventuriers sur 7 jours / 50 po   (plafonné à +10)
Saison        = Automne +5, Hiver −5
```

**Effets de la Prospérité :** l'indice de prix IP (1.3.2), le nombre de quêtes générées (4.3.2), le flux de recrues (3.12.1) et le palier de la ville (5.3).

> **Précisé en tranche 3 :**
> - **Apport_guilde** = (recettes de la guilde sur 7 jours + or dépensé en ville par les aventuriers : taverne, auberge, Temple, rebouteux, Forgeron, provisions) / 50 po, plafonné à +10.
> - **Effets du Danger sur le tableau :** Calme, quêtes de combat ×0,7. Menaçant et au-delà, récompenses ×1,2 et protections deux fois plus fréquentes. Critique, escortes ×0,3 et, chaque matin, une chasse de **la Couronne** contre l'espèce la plus menaçante (récompense ×1,3, ×1,5 au palier Cité).
> - **L'hiver** ajoute +10 au Danger des zones à 4 h de trajet ou moins (Ville et Forêt).
> - La partie commence avec un Danger d'environ 43 (Menaçant) : les premières quêtes sont donc payées ×1,2. C'est voulu, et cela soutient les revenus du début de partie.

### 5.2 Les saisons

| Saison | Monstres | Plantes | Économie | Vie de la guilde | Événements favorisés |
|--------|----------|---------|----------|------------------|----------------------|
| **Printemps** | Reproduction : croissance r ×1,5 | Repousse ×1,5 | — | — | Saison des amours (loups agressifs), crues |
| **Été** | Normal | Normal | Escortes +50 % | Viandes : conservation ÷2 sans Glacière | Canicule, fièvre des marais |
| **Automne** | Normal | Normal | Denrées −20 %, Prospérité +5 | — | Fête des moissons, chasses nobles |
| **Hiver** | Affamés : Danger des zones proches +10 | Pousse ÷2 | Légumes ×1,5, Prospérité −5 | Énergie −20 % la nuit sans Cheminée (1.5.4) | Grand froid, meutes aux portes |

### 5.3 L'évolution de la ville

La ville a **3 paliers**. Pour changer de palier, la Prospérité doit rester au-delà du seuil **pendant 14 jours d'affilée**, dans un sens comme dans l'autre. La ville peut donc **régresser**.

| Palier | Prospérité | Ce qui est disponible |
|--------|------------|-----------------------|
| **Bourg** | < 40 | Halle, Tanneur, Alchimiste, Forgeron (équipement des paliers 1 à 4) |
| **Ville** | 40 à 74 | + **Collectionneur**, **quêtes nobles**, Forgeron jusqu'au palier 6 |
| **Cité** | ≥ 75 | + Forgeron jusqu'au palier 7 (draconique). Quêtes de la Couronne mieux payées. Spectateurs de l'Arène ×2 |

**La partie commence au palier Bourg** (Prospérité 30). Faire grandir la ville est l'un des arcs de progression du joueur.

> **Précisé en tranche 3 :** au palier Ville, 15 % des quêtes de villageois deviennent des **quêtes nobles** (client noble nommé, récompense ×1,3). L'équipement du Forgeron et l'accès au Collectionneur suivent le **palier**, et non plus la Prospérité du jour : une ville qui oscille autour de 40 ne fait pas clignoter ses boutiques.

### 5.4 Les événements

#### 5.4.1 Fréquence

| Catégorie | Fréquence | Annoncé par une rumeur ? |
|-----------|-----------|--------------------------|
| **Petit événement** | 2 à 3 par semaine (test quotidien à 35 %) | Rarement |
| **Événement majeur** | 1 par saison, à une date aléatoire | Oui, 2 à 5 jours avant |
| **Crise** | 1 à 2 par an, à partir du jour 60, ou déclenchée par une chaîne | Oui, 2 à 5 jours avant |

#### 5.4.2 Structure d'un événement

Chaque événement est une **donnée**, pas du code spécifique (voir ch. 8) :

| Champ | Exemple : *Pénurie de céréales* |
|-------|---------------------------------|
| Catégorie | Économie |
| Conditions | Pas en automne. Prospérité < 60 |
| Poids | 3 |
| Rumeur | Non |
| Durée | 7 jours |
| Effets | Céréales ×2 chez les fournisseurs. Taverne du Pont : prix ×1,3 |
| Choix | Aucun |
| Option par défaut | — (pour un événement à choix : l'option appliquée si le joueur ne répond pas dans le délai du mode Chronique, 7.7.1) |
| Suite | Si Prospérité < 40 à la fin → **Émeute du pain** (70 %) |

- **Environ un tiers des événements propose un choix** au joueur. Ce sont des décisions au niveau de la guilde, cohérentes avec la gestion indirecte.
- Les effets sont des **modificateurs temporaires** (sur un prix, une demande, une population, un indice) ou des **actions** (apparition d'une quête, d'un candidat, d'un visiteur).

> **Précisé en tranche 3 (implémentation) :** le catalogue vit dans `evenements.json`. Chaque événement combine des **modificateurs** génériques (prix d'une denrée, demande d'une ressource, trajets, attaque d'une espèce, énergie la nuit, conservation de la viande, taxe royale, Danger, Prospérité…) et, au besoin, une **action** nommée pour ce qui ne se résume pas à un chiffre. Détails retenus :
> - **Marchand ambulant :** 5 potions, 5 bandages et 3 antidotes à −30 % si l'infirmerie existe, sinon 20 mesures d'épices.
> - **Le baron :** les 6 soldats occupent d'abord des paillasses. Refuser coûte 2 points de renommée (faute d'indice de satisfaction des nobles).
> - **Rixe :** l'aventurier est arrêté tout de suite ; la caution le libère.
> - **Vétéran de passage :** une journée d'enseignement donne à chaque aventurier présent 8 % de l'expérience de son niveau.
> - **Recrue exceptionnelle :** niveau 8 à 12. **Gourmet :** la compétence du chef sert de qualité du meilleur plat.
> - **Guerre régionale :** chaque lundi, 1 ou 2 aventuriers de niveau 3 ou plus sont appelés. Après la paix, la moitié des conscrits reviennent frapper à la porte.
> - **Bête légendaire :** chasse noble de 2 rangs au-dessus de l'espèce, récompense Base × 1,5, 3 aventuriers au moins.
> - **Décisions :** en Classique, une décision met le jeu en pause. Si le joueur relance le temps sans répondre, le délai de 12 h du mode Chronique s'applique aussi, puis l'option par défaut.

#### 5.4.3 Catalogue de départ (25 événements)

**Économie et marché**

| Événement | Type | Effet | Choix / suite |
|-----------|------|-------|---------------|
| Caravane exceptionnelle | Petit | Stock d'une catégorie de ressources ×1,5 : cours en baisse pendant 1 semaine | — |
| **Mode de la noblesse** | Petit | Demande d'une ressource ×2 à ×3 pendant 14 jours | Rumeur 3 jours avant |
| Pénurie de céréales | Petit | Voir 5.4.2 | → Émeute du pain |
| Marchand ambulant | Petit | Propose des remèdes ou des épices à −30 % | Acheter ou non |
| Vol dans la Resserre | Petit | −10 à −30 % d'une catégorie de stock. Impossible si un intendant compétent est en poste | — |
| **Émeute du pain** | Majeur (chaîne) | Taverne du Pont fermée. Demande au réfectoire ×2. **Pillage** si le prix moyen des repas dépasse 1,3 × la référence | Distribuer du gruau gratuit (renommée +, Prospérité +) ou non. Si non réprimée → taxe royale ×1,2 pendant 1 saison |

**Monstres**

| Événement | Type | Effet | Choix / suite |
|-----------|------|-------|---------------|
| Migration | Petit | Une espèce absente ou raréfiée : population +30 dans une zone | — |
| **Bête légendaire** | Majeur | Un monstre unique apparaît (ex. *le Loup Blanc de Vertbois* : PV ×5, attaque ×2). Quête noble avec une grosse récompense et un **trophée** (renommée) | — |
| **Vague de monstres** | Majeur | Une espèce passe à 100 % de population dans 1 ou 2 zones. Danger +20. Quêtes d'extermination de la Couronne | Si la population reste au-dessus de 80 % pendant 10 jours → **Assaut** |
| **Réveil du dragon** | Crise | Le jeune dragon apparaît dans les Pics. Caravanes attaquées, Prospérité −10. Quête de rang S | Rumeur 5 jours avant |
| **Assaut sur la ville** | Crise | Voir 5.6 | — |
| Peste des égouts | Majeur (chaîne) | Déclenchée si la population de rats dépasse 90 % pendant 7 jours → **épidémie** (5.7) | — |

**Société et politique**

| Événement | Type | Effet | Choix / suite |
|-----------|------|-------|---------------|
| Fête de la ville | Petit | Moral +5 pour tous. Demande de taverne ×2 pendant 1 jour | — |
| Concours de cuisine | Petit (réfectoire niv 3+) | — | Participer (20 po d'ingrédients) : chance de victoire selon Q_plat, renommée + |
| Inspecteur royal | Petit | Contrôle de la guilde | Amende de 50 po si taxe > 30 % ou si la guilde est endettée |
| Rixe en ville | Petit | Un aventurier Bagarreur est arrêté | Payer sa caution (5 po, Loyauté +10) ou le laisser 3 jours en prison (Loyauté −15) |
| Le baron et ses soldats | Petit | — | Héberger 6 soldats pendant 5 jours (40 po, mais lits occupés et moral −3) ou refuser (satisfaction des Nobles −10) |
| Vétéran de passage | Petit | — | Le laisser enseigner 1 jour gratuitement (XP +), ou l'engager comme professeur s'il est d'accord |
| Recrue exceptionnelle | Petit | Un candidat de niveau élevé se présente à la porte | Accepter ou non |
| Gourmet de passage | Petit (réfectoire niv 5) | Un noble vient dîner. Si la qualité du meilleur plat (Q_plat) atteint 70 : satisfaction des Nobles +10, renommée +3. Sinon : satisfaction −5 | — |
| **Guerre régionale** | Crise | Taxe royale ×1,5. Demande de carapaces et d'écailles ×2. Prospérité −1 par jour. **Conscription** : chaque semaine, 1 à 2 aventuriers sont appelés | Payer une exemption (50 po par aventurier) ou les laisser partir (ils reviennent peut-être à la fin) |
| Couronnement | Majeur | Taxe royale suspendue pendant 1 semaine. Fête | — |

**Santé et saisons**

| Événement | Type | Effet |
|-----------|------|-------|
| **Fièvre des marais** | Majeur (été) | Épidémie (5.7) |
| Grand froid | Petit (hiver) | Énergie −30 % la nuit sans Cheminée, trajets ×1,3, pendant 5 jours |
| Canicule | Petit (été) | Conservation des viandes ÷2, moral −2 par jour, pendant 5 jours |
| Crue | Petit (printemps) | Trajets dans le Marais ×1,5 pendant 5 jours |
| Saison des amours | Petit (printemps) | Loups et sangliers : attaque +20 % pendant 7 jours |

#### 5.4.4 Les chaînes

```
Pénurie de céréales ──(Prospérité < 40)──► Émeute du pain ──(non réprimée)──► Taxe royale ×1,2
Rats > 90 % pendant 7 jours ─────────────► Peste des égouts ───────────────► Épidémie (5.7)
Vague de monstres ──(population > 80 % pendant 10 jours)──► Assaut sur la ville (5.6)
Danger ≥ 80 pendant 3 jours ─────────────► Assaut sur la ville
```

Le joueur peut **casser chaque chaîne** : publier des primes d'extermination, distribuer du gruau, dératiser les égouts (aide en ville).

#### 5.4.5 Les rumeurs

- Les événements majeurs et les crises sont annoncés **2 à 5 jours avant** dans les **Chroniques de la ville** (7.5.7).
  > *« À la taverne, un chasseur jure avoir vu des dizaines de loups descendre des Collines… »*
- **Fiabilité de 75 %.** Dans les autres cas, la rumeur est une **fausse alerte**, ou un détail est faux (mauvaise zone, mauvaise espèce).
- La fiabilité n'est **jamais affichée** : au joueur de juger s'il se prépare ou non.
- **Précisé en tranche 3 :** les 25 % de rumeurs inexactes se partagent à parts égales entre les **fausses alertes** (l'événement n'a pas lieu) et les **détails faux** (l'événement a lieu, mais ailleurs que prévu).

### 5.5 Les guildes rivales

Deux guildes rivales, **simulées de façon abstraite** (sans agents individuels) :

| Guilde | Profil | Tarifs | Fiscalité | Comportement typique |
|--------|--------|--------|-----------|----------------------|
| **La Compagnie de l'Aube** | Prestigieuse, proche de la noblesse | Élevés | 20 % | Débauche les aventuriers les plus respectés, prend les quêtes nobles |
| **Les Crocs Libres** | Mercenaires, bon marché | Bas | 8 % | Guerre des prix, attire les débutants |

**Chaque rivale a :** une Renommée (en points, sur la même échelle que la tienne, 6.1), une taille (nombre d'aventuriers), un indice de tarifs et un taux de fiscalité.

**Leur influence sur le jeu :**
- **Les quêtes :** une quête du tableau non prise peut être réalisée par une rivale avant son expiration (chance selon la Renommée de la rivale). Elle disparaît alors sans pénalité pour toi.
- **Les recrues :** les candidats se répartissent entre les guildes selon leur attractivité. Ta part dépend de ta Renommée, de tes tarifs et de ta fiscalité, comparés à ceux des rivales.
- **Le taux de référence régional** (2.6.1) est la moyenne des taux pratiqués par les guildes.
- **Les débauchages** (3.12.2) viennent d'elles.

**Leurs actions** (environ une toutes les 2 semaines par rivale) :

| Action | Effet | Réponse possible du joueur |
|--------|-------|----------------------------|
| Guerre des prix | Prix des concurrents (1.3.5) ×0,8 pendant 2 semaines | Baisser ses prix, ou miser sur la qualité |
| Débauchage ciblé | Une offre à ton aventurier le plus respecté | Le retenir (confort, prime, fiscalité) |
| Rumeur diffamatoire | Ta renommée −5 | Contre-campagne (30 po) : annule l'effet |
| Coup d'éclat | Elle tue une bête légendaire : sa renommée +10 | — |

Une rivale peut **faire faillite** si sa Renommée tombe à 0. Une nouvelle guilde apparaît alors quelques semaines plus tard.

> **Précisé en tranche 3 :**
> - **Départ :** l'Aube a 35 points de renommée, les Crocs 20, la guilde du joueur 20.
> - **Quêtes :** chaque jour, une quête libre depuis plus d'un jour a 4 % × (Renommée / 50) de chances d'être prise par chaque rivale, entre 1 et 12 %. Ce taux est doublé pour l'Aube sur les clients nobles et la Couronne, et ×1,5 pour les Crocs sur les rangs F et E. Une rivale gagne le quart des points d'une quête réussie, et la renommée de chaque rivale varie de −3 à +3 chaque semaine.
> - **Actions :** une tous les 10 à 18 jours par rivale. Le **débauchage** vise l'aventurier le plus respecté. S'il a moins de 50 de loyauté, il part dans 2 jours, sauf si sa loyauté remonte à 50 entre-temps. Face à une rivale, une prime de rétention donne jusqu'à +15 de loyauté en plus.
> - **Recrues :** le flux de candidats est multiplié par √(attrait de la guilde / attrait moyen des rivales), entre ×0,6 et ×1,4, avec Attrait = (10 + Renommée) × facteur de taxe × facteur de tarifs.
> - **Taux de référence :** les aventuriers ne protestent contre la taxe qu'au-delà du taux de référence régional + 5 points.

### 5.6 L'assaut sur la ville

- **Déclenchement :** Danger ≥ 80 pendant 3 jours, ou une chaîne (5.4.4). Rumeur 2 jours avant.
- **Déroulement :** **3 vagues nocturnes**, une par nuit. Chaque vague est un combat de groupe (4.7) contre l'espèce qui prolifère.
- **Défenseurs :** les aventuriers présents au siège, ni en quête ni en état Critique. Les aventuriers Prudents à Loyauté < 30 **fuient la ville** et quittent la guilde.
- **Préparation (choix du joueur) :**

| Option | Coût | Effet |
|--------|------|-------|
| Barricader le siège | 30 po | Défense des défenseurs +20 % |
| Engager des mercenaires | 50 po | 4 défenseurs PNJ de niveau 8 |
| Ouvrir l'infirmerie gratuitement | Manque à gagner | Les blessés retournent au combat entre deux vagues |

| Issue d'une vague | Conséquences |
|-------------------|--------------|
| **Victoire** | Population de l'espèce −30. Les défenseurs gagnent XP et Respectabilité +5 |
| **Défaite** | Une salle tirée au hasard est **endommagée** : capacité −50 % jusqu'à réparation (20 % du coût de son niveau). Stocks −20 %. Prospérité −5 |

**Après 3 victoires :** renommée +10, Danger −15, prime de la Couronne (5 po par défenseur), Prospérité +5.

> **Précisé en tranche 3 :**
> - La préparation est une décision à 4 options : rien, barricades, mercenaires, ou tout (barricades, mercenaires et infirmerie ouverte gratuitement).
> - Chaque vague oppose `max(4, 1,2 × défenseurs) + numéro de la vague` monstres. Les mercenaires sont de niveau 8.
> - Une salle endommagée tourne à moitié : lits, places du réfectoire, lits d'infirmerie. Le terrain endommagé n'a pas encore d'effet.
> - Pas de nouvel assaut dans les 28 jours qui suivent le précédent.

### 5.7 Les épidémies

- **Déclenchement :** Fièvre des marais (été), Peste des égouts (chaîne) ou un aventurier revenu malade du Marais.
- **Contagion dans la guilde,** chaque jour, pour chaque aventurier ou employé sain :

```
P(contamination) = 1 − (1 − p) ^ Contacts
p = 5 % × (1 − CON / 40), ×0,5 si la Propreté des dortoirs est > 70
Contacts = nombre de malades qui ont fréquenté la même salle ce jour-là (réfectoire, dortoir, taverne)
```

- **Évolution :** Maladie légère, qui devient sérieuse après 2 jours sans soin.
- **Quarantaine** (module de l'infirmerie, 1.8.7) : les malades qui y sont hospitalisés ne contaminent personne.
- **Effets sur la ville :** Prospérité −1 par jour, le Temple est **saturé** (indisponible comme concurrent), la demande de plantes médicinales est ×2.
- **Fin :** au bout de 14 à 28 jours, ou quand il n'y a plus aucun malade pendant 3 jours.
- Le **personnel** peut tomber malade (absence).
- **Précisé en tranche 3 :**
  - L'épidémie commence par 1 ou 2 malades parmi les aventuriers présents.
  - Un employé tombe malade avec une probabilité de 75 % du p de base. Il est absent 3 jours, et son poste ne compte plus (soins, cuisine, ménage, inspection, remises de l'intendant).
  - Une équipe revenue malade du Marais déclenche une épidémie dans 15 % des cas.
  - Délai de 56 jours entre deux épidémies.

---

## 6. Progression et méta

### 6.1 La Renommée

La Renommée est un **score en points**, affiché en permanence. Les guildes rivales utilisent la même échelle (5.5).

#### 6.1.1 Gains et pertes ponctuels

| Événement | Points |
|-----------|--------|
| Quête réussie | F +0,5 · E +1 · D +2 · C +4 · B +8 · A +15 · S +30 (×1,3 pour un client noble ou la Couronne) |
| Quête échouée ou expirée | F 0 · E–D −1 · C–B −2 · A–S −4 (4.3.4) |
| Trophée d'une bête légendaire | +15 |
| Assaut repoussé (3 vagues gagnées) | +10 (5.6) |
| Nom gravé au Mur du Souvenir | +0,5 (plafonné à +10 au total) |
| Mort d'un aventurier | −2 |
| Aventurier *Mécontent* (3.12.2), chaque jour | −0,2 |
| Départ d'un aventurier mécontent | −1 |
| Spectacle d'arène (1.7.4) | +1 |
| Échec d'un contrat d'acheteur (2.5.3) | −2 |
| Rumeur diffamatoire d'une rivale | −5 (5.5) |
| Distribution de gruau pendant une émeute | +5 |

> **Ajusté en tranche 3 :**
> - La Renommée en points arrive dès la tranche 3, car les guildes rivales s'y mesurent. Le bilan hebdomadaire et les Sceaux restent pour la tranche 4. La guilde commence à **20 points**.
> - Une quête **expirée** ne coûte que la moitié de la pénalité, et seulement si elle était du **rang de base** de la guilde (le rang que tiennent ses 3 meilleurs aventuriers). Avec la pénalité complète sur toutes les quêtes à sa portée, la guilde perdait autant de renommée qu'elle en gagnait, car elle ne peut pas tout prendre.

#### 6.1.2 Bilan hebdomadaire (le Jour du Roi)

| Composante | Points par semaine |
|------------|--------------------|
| **Prestige des membres** | `(Respectabilité moyenne des 10 meilleurs − 40) / 10` |
| **Qualité des salles** | `(Q moyenne des salles construites − 50) / 10` |
| **Réputation des prix** | +1 si le ratio de prix moyen R ≤ 0,95 · −2 si R > 1,2 · −5 si R > 1,5 |
| **Fiscalité** | +1 si le taux est ≤ 10 % · −3 s'il dépasse 30 % |
| **Érosion** | −1 % des points accumulés, si aucune quête de rang D ou plus n'a été réussie dans la semaine |

> **Règle :** les **rangs acquis ne se perdent jamais**. La Couronne ne reprend pas un sceau. Seuls les points fluctuent, et la faillite reste la seule défaite.

> **Précisé en tranche 4 :**
> - La « Q moyenne des salles » est la moyenne des qualités des dortoirs, de l'infirmerie et du terrain construits.
> - Le bilan détaillé de la semaine s'affiche dans la Charte.
> - Arène : +1 par spectacle. Mur du Souvenir : +0,5 par nom, 10 points au plus.

### 6.2 Les rangs : les Sceaux royaux

La guilde existe par une **charte royale**. À chaque rang, la Couronne y appose un nouveau **sceau**. Cela explique pourquoi la **taxe royale** augmente avec le rang (1.1.3), et pourquoi la banque, les nobles et les professeurs font davantage confiance à une guilde scellée haut.

La progression des métaux reprend celle des **pièces** (cuivre, argent, or) et celle de l'**équipement** (fer, mithril).

| Rang | Sceau | Points | Conditions supplémentaires | Débloque |
|------|-------|--------|----------------------------|----------|
| 1 | **Sceau de Cuivre** | 0 | — (départ) | Salles jusqu'au niveau 3. Tableau de 8 quêtes. Prêt de 200 po. 3 primes actives. Professeurs jusqu'au niveau 8 |
| 2 | **Sceau de Fer** | 100 | 15 aventuriers · les 4 salles construites · 20 quêtes réussies | Tableau de 10. Prêt de 500 po. 4 primes. Professeurs jusqu'au niveau 14 |
| 3 | **Sceau d'Argent** | 300 | 25 aventuriers · une salle au niveau 3 · un monstre de rang C tué · aucune dette depuis 14 jours | **Salles au niveau 4.** Tableau de 12. Prêt de 1 500 po. 5 primes. Professeurs jusqu'au niveau 20 |
| 4 | **Sceau d'Or** | 700 | 40 aventuriers · 2 aventuriers de niveau 18 ou plus · ville au palier Ville au moins · une quête de rang B réussie | **Salles au niveau 5.** Tableau de 14. Prêt de 4 000 po. 6 primes. Professeurs jusqu'au niveau 26 |
| 5 | **Sceau de Mithril** | 1 500 | 50 aventuriers · un aventurier de niveau 25 ou plus · une quête de rang S réussie · ville au palier Cité | **Victoire** (6.6). Tableau de 16. Prêt de 10 000 po. 7 primes. Professeurs jusqu'au niveau 30 |

- **Montée de rang :** dès que les points et les conditions sont réunis, un **héraut royal** vient apposer le sceau le lendemain matin. Fête dans la guilde : moral +10 pour tous les aventuriers présents.
- L'écran de progression affiche en permanence les conditions du rang suivant, cochées ou non.
- **Précisé en tranche 4 :**
  - Les « quêtes réussies » du Sceau de Fer sont des quêtes de combat (les petits boulots ne comptent pas).
  - Les conditions sont vérifiées chaque matin, et le héraut passe le lendemain à 08h.
  - Le niveau maximal des professeurs suit le sceau (8 / 14 / 20 / 26 / 30).
  - Les niveaux 4 et 5 des salles sont verrouillés jusqu'au Sceau d'Argent et au Sceau d'Or. Ils apportent : la suite, la salle de duel (un duel chaque mercredi soir, qui crée des rancunes), l'Arène (chaque samedi à 20h), le Festin du Héros (+10 au moral de quête), le Maître-chasseur et l'Aumônier, le chirurgien (séquelles −75 %) et le sanctuaire (une eau bénite par jour).

### 6.3 Les hauts faits

Une trentaine de hauts faits **purement honorifiques**, sans avantage de jeu. Ils sont conservés d'une partie à l'autre.

| Catégorie | Hauts faits |
|-----------|-------------|
| **Économie** | *Premier bénéfice* (une journée nette positive) · *Coffres pleins* (1 000 po en caisse) · *Spéculateur* (revendre une ressource au double de son prix de rachat) · *Grossiste* (100 peaux de loup vendues) · *Sans dette* (une saison entière sans emprunt) · *Bienfaiteur* (distribuer du gruau pendant une émeute) |
| **Le siège** | *Un toit pour tous* (aucun aventurier sans lit pendant 30 jours) · *Palais* (4 suites occupées en même temps) · *Table des rois* (100 Festins servis) · *Apothicaire de génie* (100 remèdes fabriqués) · *Miracle* (lever une malédiction critique) |
| **Les aventuriers** | *Un mois sans deuil* (28 jours sans mort) · *Pépinière* (un aventurier arrivé au niveau 1 atteint le niveau 15) · *Vétéran* (un aventurier au niveau 30) · *Fraternité* (5 paires de Frères d'armes) · *Retraite dorée* (un retraité devient professeur) · *Indomptables* (une équipe réussit 20 quêtes) · *Fidèles* (10 aventuriers à Loyauté ≥ 90) · *Retenu* (garder un aventurier qu'une rivale voulait débaucher) |
| **Le monde** | *Tueur de dragon* · *Légende vivante* (vaincre une bête légendaire) · *Rempart* (repousser un assaut sans perdre une seule vague) · *Équilibriste* (aucune espèce sous 30 % ni au-dessus de 80 % pendant une saison) · *Bâtisseur* (la ville atteint le palier Cité) · *Médecin de la peste* (une épidémie terminée sans mort) · *Rivale écrasée* (une guilde rivale fait faillite) |
| **Défis** | *Impitoyable* (Sceau d'Or en difficulté Impitoyable) · *Sans impôt* (Sceau de Fer avec une taxe de 0 %) · *Chroniqueur* (100 jours en mode Chronique) |

> **Précisé en tranche 4 :**
> - **33 hauts faits** au total, avec 4 hauts faits de **sceau** (Fer, Argent, Or, Mithril).
> - *Spéculateur* : vendre une dépouille au double de son **prix de référence**, car les lots de la Resserre ne gardent pas leur prix de rachat.
> - *Sans dette* : une saison sans emprunt ni découvert. *Sans impôt* : n'avoir **jamais** taxé le butin avant le Sceau de Fer.
> - *Retraite dorée* : un aventurier de niveau 10 ou plus qui prend sa retraite propose une fois sur deux de devenir professeur.
> - Les hauts faits sont gardés dans le navigateur et comptés « toutes parties confondues ».

### 6.4 Le conseiller : le vieux Gaspard

**Gaspard** est l'ancien maître de la guilde : bourru, bienveillant, un peu radoteur. Il remplace le tutoriel. **Rien n'est bloquant.**

- Il intervient **selon la situation**, au plus une fois par heure de jeu, surtout pendant les 10 premiers jours.
- Chaque conseil propose deux boutons : **« Montre-moi »** (ouvre l'écran concerné) et **« Compris »**.
- Options : *Conseils fréquents*, *Seulement les alertes*, *Désactivé*.

| Déclencheur | Exemple de conseil |
|-------------|--------------------|
| Jour 1, matin | *« Ces dix-là sont ta guilde, maintenant. Nourris-les, couche-les, et ils te rapporteront de l'or. »* |
| Garde-manger presque vide | *« Plus que 20 portions de céréales. Une consigne à l'intendant t'éviterait ce genre de surprise. »* |
| Nombreux refus pour prix | *« Quatre gaillards ont mangé à la Taverne du Pont ce soir. Ton ragoût est peut-être trop cher. »* |
| Premier blessé grave sans infirmerie | *« Sans infirmerie, Brom va se faire charcuter par le rebouteux. »* |
| Rumeur d'assaut | *« Si cette rumeur dit vrai, mieux vaut que les gars soient au siège dans deux nuits. »* |
| Première mort | *« Ça arrive. Grave son nom au Mur, ça aide les autres. »* |
| Trésorerie négative | *« Sept jours. Après, la Couronne saisit tout. L'usurier prête, mais il mord. »* |

> **Précisé en tranche 4 :** 13 déclencheurs. En plus de ceux du tableau : premier candidat à la porte, première décision, aventuriers qui dorment dehors, prolifération, rappel de la Charte au jour 10, félicitations à chaque sceau. Un conseil s'affiche dans un encart en bas à gauche, 3 au plus en attente. Le réglage est enregistré avec la partie.

### 6.5 La difficulté

Trois niveaux prédéfinis, plus un mode **personnalisé** où chaque paramètre est réglable.

| Paramètre | Paisible | Normal | Impitoyable |
|-----------|----------|--------|-------------|
| Trésorerie de départ | 450 po | 300 po | 200 po |
| Risque de mort d'un aventurier à terre | ×0,5 | ×1 | ×1,3 |
| Croissance des monstres (r) | ×0,8 | ×1 | ×1,2 |
| Récompenses des quêtes | ×1,2 | ×1 | ×0,85 |
| Tolérance de prix des aventuriers | +0,2 | 0 | −0,1 |
| Délai avant faillite | 14 jours | 7 jours | 4 jours |
| Fréquence des crises | ×0,5 | ×1 | ×1,5 |
| Fiabilité des rumeurs | 90 % | 75 % | 60 % |

- La difficulté est **modifiable en cours de partie**. Dans ce cas, la sauvegarde est marquée et les hauts faits de la catégorie *Défis* sont désactivés pour cette partie.
- **Précisé en tranche 4 :** le mode personnalisé n'est pas encore proposé dans l'interface. Les trois niveaux prédéfinis sont choisis au lancement et modifiables dans les Options.

### 6.6 Victoire, défaite et épilogue

- **Victoire :** l'obtention du **Sceau de Mithril** déclenche un écran d'**épilogue** :
  - un bilan de la guilde (durée, aventuriers accueillis, quêtes, morts, fortune) ;
  - le **destin de 3 à 5 aventuriers marquants**, généré selon leur situation : actif, retraité, mort ;
  - le sort de la ville et des guildes rivales.

  La partie **continue ensuite en bac à sable**.
- **Défaite (faillite) :** un épilogue de même forme, au ton sombre, puis l'accès au Livre de la guilde (6.9).
- **Précisé en tranche 4 :** les destins retenus sont ceux des 3 aventuriers les plus marquants (niveau et respectabilité), du dernier mort et du dernier retraité.

### 6.7 Le Panthéon (méta-progression)

Le Panthéon conserve les aventuriers légendaires de **toutes tes parties**. Il est **sans avantage de jeu**.

- **Y entrent automatiquement :** les aventuriers de niveau 25 ou plus, les tueurs de dragon et les vainqueurs d'une bête légendaire. Le joueur peut aussi y inscrire **un aventurier de son choix par partie**.
- **Chaque fiche :** nom, classe, portrait, niveau, guilde et partie d'origine, hauts faits, destin.
- 50 places au maximum. Le joueur choisit qui retirer quand il est plein.
- **Clin d'œil :** une recrue a une petite chance d'être présentée comme **descendante** d'un héros du Panthéon. C'est purement narratif.
- **Précisé en tranche 4 :**
  - Le Panthéon est gardé dans le navigateur, avec les hauts faits.
  - Une recrue a 3 % de chances d'être descendante d'un héros.
  - Quand le Panthéon est plein, les nouveaux héros n'y entrent plus tant que le joueur n'a pas retiré quelqu'un (bouton « Retirer » de la Charte).

### 6.8 Scénarios de départ

| Scénario | Version | Situation de départ |
|----------|---------|---------------------|
| **Standard** | v1 | Voir 1.12 |
| **Guilde en ruine** | Ajout futur | 500 po de dette chez l'usurier, salles endommagées, 4 aventuriers, renommée négative |
| **Ville frontière** | Ajout futur | Danger 60, Prospérité 25, beaucoup de mercenaires parmi les recrues |

### 6.9 Le Livre de la guilde

Une **chronique générée automatiquement**, consultable à tout moment et **exportable** (format au ch. 8).

- **Un chapitre par saison**, par exemple *« Printemps de l'an 1 »*, rédigé à partir de modèles de texte. Il reprend :
  - les rangs obtenus et leur date ;
  - les événements majeurs et les crises, avec la façon dont ils se sont terminés ;
  - les morts, avec leur éloge funèbre (3.12.4) ;
  - les retraites et reconversions ;
  - les exploits (bêtes légendaires, assauts repoussés) ;
  - les records : plus grosse quête, aventurier le plus riche, plus longue équipe.
- **Des courbes** relevées chaque semaine : trésorerie, renommée, prospérité, danger, nombre d'aventuriers.
- C'est la **mémoire des histoires** produites par la simulation, et le support naturel de l'épilogue.
- **Précisé en tranche 4 :**
  - Le Livre retient les faits **critiques** du journal : morts, sceaux, crises, exploits, retraites, paliers de la ville.
  - Il ajoute en fin de saison la plus belle quête, l'aventurier le plus riche, l'équipe la plus aguerrie et un bilan chiffré.
  - L'export est un fichier texte au format Markdown.

---

## 7. Interface et tableau de bord

### 7.1 Principes

1. **Toujours pouvoir répondre à « pourquoi ? »** (pilier n° 3). Chaque chiffre important a une **infobulle de calcul**. Par exemple, au survol du prix d'une paillasse : `Base 3 pa × Qualité ×1,08 × Prospérité ×0,88 × Curseur ×1,2 = 3 pa 4 pc`.
2. **Toute information à deux clics au maximum.** Les noms (aventuriers, quêtes, acheteurs, espèces) sont **cliquables partout**.
3. **Pas de micro-gestion forcée.** Ce qui se répète peut être confié aux consignes de l'intendant (1.10).
4. **Aucune information transmise par la seule couleur :** toujours une icône ou un texte en plus.

### 7.2 Direction artistique : le « parchemin sobre »

| Élément | Choix |
|---------|-------|
| **Ambiance** | Registre de guilde : papier chaud, encre, cire à cacheter. Sobre et lisible avant tout |
| **Thème clair** | Fond parchemin, texte encre brun-noir |
| **Thème sombre** | Fond bleu nuit, texte parchemin. Suit le réglage du système par défaut |
| **Titres** | Police à empattements d'inspiration médiévale |
| **Texte et chiffres** | Police sans empattements très lisible, **chiffres à chasse fixe** pour les tableaux |
| **Icônes** | Pictogrammes monochromes au trait (lit, chope, épée, fiole, sceau…) |
| **Couleurs de sens** | Rouge sceau = danger et perte · Vert sauge = gain et santé · Ambre = alerte · Bleu encre = information · Or = renommée |
| **Classes** | Une couleur et une icône par classe, reprises partout (liste, carte, vue en coupe) |
| **Rangs de quête** | Un cachet de couleur de F à S |

### 7.3 Disposition de l'écran (ordinateur)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ 💰 1 245 po ▲+38   🔱 Sceau de Fer 214/300   ⚔ Danger 42   🏘 Prospérité 51       │
│ 🗓 Printemps · J12 · an 1 · 14h (Après-midi)  ⏸ ▶ ▶▶ ▶▶▶ ▶▶▶▶   👥 18/12/30   🔔3 │
├──────────┬───────────────────────────────────────────────────────┬───────────────┤
│ 🏰 Siège  │                                                       │ JOURNAL       │
│ 👤 Aventu.│                                                       │ [filtres]     │
│ 🧑‍🍳 Person.│                 CONTENU DE L'ÉCRAN                    │ 14h ⚔ Les     │
│ 📜 Primes │                                                       │ Lames du Pont │
│ ⚖ Comptoir│                                                       │ rentrent…     │
│ 🗺 Carte  │                                                       │ 13h 🍲 …      │
│ 📰 Chron. │                                                       │               │
│ 📒 Grand L│                                                       │               │
│ 📖 Livre  │                                                       │       [ « ]   │
│ ⚙ Options │                                                       │               │
└──────────┴───────────────────────────────────────────────────────┴───────────────┘
```

- **Largeur cible :** 1 280 px et plus. Sur tablette, le journal devient un **tiroir** et la navigation se réduit à des icônes.
- **Raccourcis clavier :** Espace = pause, 1 à 5 = vitesses, une lettre par écran (S, A, P, T, C…).

### 7.4 La barre du haut (toujours visible)

| Élément | Affichage | Au clic |
|---------|-----------|---------|
| **Trésorerie** | Montant et variation du jour ▲▼. Rouge si endetté, avec le compte à rebours de la faillite | Grand Livre |
| **Renommée** | Sceau actuel, points et barre de progression vers le sceau suivant | Écran de la Charte (7.5.10) |
| **Danger** | Jauge de 0 à 100 et nom du palier | Carte régionale |
| **Prospérité** | Jauge et palier de la ville | Chroniques |
| **Horloge** | Saison, jour, an, heure, phase. **Mode Chronique :** heure réelle et mention « en direct » | — |
| **Vitesse** | Pause, x1, x2, x4, x8 (absente en mode Chronique) | — |
| **Effectifs** | Présents au siège / en quête / total | Aventuriers |
| **Alertes** | Cloche avec le nombre d'alertes non lues | Liste des alertes |

### 7.5 Les écrans

#### 7.5.1 Le Siège (vue en coupe)

L'écran principal. Le bâtiment est montré **en coupe**, comme une maison de poupée : les 4 salles, le comptoir, la resserre et le Mur du Souvenir.

- **Les aventuriers** sont de **petits personnages stylisés** aux couleurs de leur classe. Ils se déplacent d'une salle à l'autre selon leur activité. Ces déplacements sont décoratifs : la simulation les décide, l'affichage ne fait que les montrer.
- **Bulles d'état** au-dessus des personnages : faim, sommeil, blessure, colère (prix), ivresse.
- **Survol d'un personnage :** mini-fiche avec son nom, son activité et sa **dernière pensée**.
- **Sur chaque salle :** taux d'occupation, qualité Q, file d'attente, recette du jour.
- **Clic sur une salle :** ouvre son **panneau**, avec des onglets :

| Onglet | Contenu |
|--------|---------|
| Aperçu | Indicateurs (1.11), tendances, pensées agrégées (« 6 aventuriers trouvent le ragoût trop cher ») |
| Tarifs | Curseurs, avec pour chacun le prix de référence, le prix du concurrent et le nombre de refus récents |
| Personnel | Employés affectés, capacité contre demande |
| Aménagements | Niveau, travaux, modules, répartition des lits (dortoirs), menu (réfectoire), créneaux (terrain) |
| Stocks | Denrées (réfectoire) ou remèdes (infirmerie), avec leur fraîcheur |
| Statistiques | Graphiques sur 28 jours |

#### 7.5.2 Les Aventuriers

- **Liste** triable et filtrable : nom, classe, niveau, activité, état, or, moral, loyauté, griefs, équipe, statut (*Mécontent*, *Sur le départ*, *Débauché*).
- **Sous-onglets :** *Équipes* (liste des équipes nommées et de leurs membres) et **À la porte** (les candidats du jour, avec les boutons **Accepter / Refuser**).
- **Fiche détaillée,** avec des onglets :

| Onglet | Contenu |
|--------|---------|
| Résumé | Jauges, attributs, compétences, traits (le second reste « ? » pendant 7 jours), états |
| Inventaire | Arme, armure, accessoire (avec leur durabilité), sac |
| Pensées | Les 20 dernières pensées |
| Relations | Amis, rivaux, équipe, sous forme de petit graphe |
| Historique | Quêtes, monstres tués, faits marquants, courbe de niveau |

- **Les 4 actions possibles depuis la fiche :**

| Action | Effet |
|--------|-------|
| **Exclure** | L'aventurier quitte la guilde. Moral −3 pour ses amis |
| **Plafond de crédit** | Montant maximum des soins à crédit pour lui (1.8.5) |
| **Offre de rétention** | Contre un débauchage ou une envie de partir. Au choix : une prime (−5 d'envie de partir par tranche de 10 po, jusqu'à −30), une chambre individuelle offerte 7 nuits (−10), ou une exonération fiscale de 2 semaines (−10). Loyauté +5 dans tous les cas |
| **Inscrire au Panthéon** | Une fois par partie (6.7) |

#### 7.5.3 Le Personnel et les Professeurs

- **Personnel :** liste avec rôle, compétence, potentiel, salaire, loyauté et signal de surcharge. Le **vivier de candidats** se renouvelle le lundi. Actions : recruter, augmenter, licencier.
- **Professeurs :** une fiche par professeur et une **grille de créneaux** (Matin, Après-midi, Soir) à ouvrir ou fermer, avec le nombre d'inscrits par séance. Les offres de professeurs apparaissent ici.
- **Consignes de l'intendant :** l'éditeur de règles automatiques (1.10), sous forme de phrases à compléter : *« Si [céréales] < [40], commander [100] »*.

#### 7.5.4 Le Tableau des primes

- Un **tableau de liège** avec les quêtes affichées comme des **affiches**, chacune portant le cachet de couleur de son rang, son client, sa récompense, son danger estimé et son expiration.
- Filtres : type, rang, zone, client.
- **Actions :** *Ajouter un bonus* sur une affiche, ou *Créer une prime* (formulaire : type, zone, cible, quantité, récompense, expiration). Le montant bloqué apparaît avant validation.
- Panneau latéral : **primes actives** (avec le montant bloqué) et **quêtes en cours** (équipe, étape, retour estimé).

#### 7.5.5 Le Comptoir et le Marché

| Onglet | Contenu |
|--------|---------|
| **Bourse** | Tableau des ressources : cours, variation, mini-courbe, tension du stock en ville. Clic : graphique sur 28 jours |
| **Resserre** | Stock de la guilde avec barres de fraîcheur, et boutons pour vendre à un acheteur |
| **Rachat** | Curseur du prix de rachat, consignes de préemption, rachats récents |
| **Acheteurs et contrats** | Réputation auprès de chaque acheteur, contrats proposés et en cours, avec leur échéance |
| **Apothicairerie** | Recettes avec le comparatif **fabriquer ou acheter**, file de fabrication |
| **Fiscalité** | Curseur du taux, exonérations, statistiques de fraude, politique de sanction, inspecteurs |

#### 7.5.6 La Carte régionale

- Les 6 zones, colorées selon leur **Danger**, reliées par des routes.
- Les **icônes des équipes** se déplacent sur les routes en temps réel.
- **Calques activables :** populations de monstres, plantes, quêtes en cours.
- **Clic sur une zone :** espèces présentes et courbe de leur population, plantes, quêtes de la zone.
- **Clic sur une équipe :** journal de sa quête (4.10).

#### 7.5.7 Les Chroniques de la ville

Une **gazette quotidienne**, dont le nom change avec le palier de la ville : *La Feuille du Bourg*, puis *La Gazette de la Ville*, puis *Le Héraut de la Cité*.

| Rubrique | Contenu |
|----------|---------|
| À la une | Les événements en cours |
| **Décisions en attente** | Les événements à choix qui attendent ta réponse |
| On raconte que… | Les rumeurs (5.4.5) |
| Le marché | Les cours notables, les modes de la noblesse |
| Les guildes | Les actions des rivales |
| Exploits et nécrologie | Les hauts faits et les morts de la semaine |

#### 7.5.8 Le Grand Livre

- **Bilan** du jour, de la semaine ou de la saison (1.11), ventilé par salle.
- Graphiques des recettes, des dépenses et de la trésorerie.
- **Prêts :** emprunter, rembourser, échéances.
- Prochain Jour du Roi : montant estimé de la taxe royale et de l'entretien.

#### 7.5.9 Le Livre de la guilde

La chronique saisonnière et les courbes (6.9), avec un bouton **Exporter**.

#### 7.5.10 La Charte et les hauts faits

On l'ouvre en cliquant sur la renommée dans la barre du haut :
- le sceau actuel ;
- les conditions du sceau suivant, cochées ou non ;
- la ventilation de la renommée de la semaine ;
- les hauts faits ;
- l'accès au **Panthéon**.

#### 7.5.11 Les Options

Difficulté, conseils de Gaspard, thème, taille du texte, notifications (par catégorie), sauvegardes (emplacements, export, import), mode de jeu (consultation seule).

### 7.6 Le journal de bord

#### 7.6.1 Format d'une ligne

```
[J12 · 14h]  ⚔  Les Lames du Pont rentrent de Vertbois : 4 loups tués, 3 po de récompense, 2 peaux intactes.
 horodatage  icône  texte court, noms cliquables en gras, montants avec leur monnaie
```

**Règles d'écriture :** une seule ligne, au présent, le sujet en premier, les chiffres utiles et rien d'autre.

#### 7.6.2 Catégories et niveaux

| Catégorie | Icône | Exemples |
|-----------|-------|----------|
| Économie | 💰 | Ventes, achats, bilan de minuit, taxe royale |
| Aventuriers | 👤 | Arrivées, départs, niveaux, pensées marquantes, bagarres |
| Quêtes | ⚔ | Départs, combats résumés, retours, échecs |
| Monde | 🗺 | Événements, rumeurs, populations, ville |
| Guilde | 🏰 | Travaux, personnel, rangs, alertes de stock |

| Niveau | Couleur | Exemples | Affiché par défaut |
|--------|---------|----------|---------------------|
| **Critique** | Rouge sceau | Mort, faillite imminente, assaut | Oui, et notification |
| **Important** | Ambre | Aventurier sur le départ, quête échouée, rang obtenu, événement à choix | Oui, et message éphémère |
| **Info** | Encre | Retour de quête, recrue, vente | Oui |
| **Détail** | Gris | Repas servi, nuitée, séance | Non (activable) |

- **Regroupement :** les lignes de niveau Détail répétitives sont fusionnées : *« 14 repas servis au dîner (4 po 2 pa) »*.
- **Conservation :** les 2 000 dernières lignes. Les faits marquants sont repris par le Livre de la guilde.

### 7.7 Notifications

#### 7.7.1 Dans le jeu

| Type | Usage |
|------|-------|
| **Message éphémère** | Faits de niveau Important. 5 secondes, 3 messages au maximum à l'écran |
| **Fenêtre de décision** | Événements à choix. En mode Classique, le jeu se met en pause |
| **Pause automatique** | Faits de niveau Critique (désactivable) |

**En mode Chronique**, un événement à choix a un **délai de réponse de 12 h de jeu**. Passé ce délai, l'**option par défaut** prévue par l'événement s'applique (5.4.2).

#### 7.7.2 Sur le téléphone et l'ordinateur

- Le jeu est **installable comme une application** (sur l'écran d'accueil du téléphone ou sur le bureau), à partir du navigateur.
- **Notifications système**, activables par catégorie : mort d'un aventurier · faillite imminente · assaut ou crise · décision en attente · aventurier sur le départ · nouveau sceau.

| Situation | Fonctionnement |
|-----------|----------------|
| Jeu ouvert, ou en arrière-plan | Les notifications partent directement de l'application |
| **Jeu fermé, mode Chronique** | **Pré-simulation à la fermeture :** le jeu calcule les 48 prochaines heures (le monde est déterministe tant que le joueur n'agit pas), repère les faits à notifier et programme leur envoi auprès d'un **petit service de notifications** en ligne. À la réouverture, le rattrapage reproduit exactement ces mêmes faits, et la programmation est recalculée |
| Jeu fermé, mode Classique | Rien à notifier : le temps est arrêté |

> **Contrainte :** les notifications avec le jeu fermé nécessitent un **petit serveur** (un simple service d'envoi, sans données de jeu sensibles). Sur iPhone, il faut aussi que le jeu ait été ajouté à l'écran d'accueil. Détail technique en 8.7.

### 7.8 Graphiques

| Graphique | Écran |
|-----------|-------|
| Cours d'une ressource sur 28 jours | Comptoir · Bourse |
| Recettes, dépenses et trésorerie | Grand Livre |
| Danger et Prospérité | Chroniques, Carte |
| Population des espèces par zone | Carte |
| Indicateurs d'une salle sur 28 jours | Siège · panneau de la salle |
| Niveau et or d'un aventurier | Fiche · Historique |
| Renommée et courbes de long terme | Charte, Livre de la guilde |

### 7.9 Le téléphone

- **v1 : mode consultation sur téléphone.** Il comprend :
  - la barre du haut condensée ;
  - le journal ;
  - les Chroniques, avec les **décisions en attente** ;
  - les **alertes** ;
  - les actions rapides : accepter ou refuser un candidat, faire une offre de rétention, régler un tarif, publier un bonus ;
  - les fiches en lecture seule.
- **Objectif à terme : tout pouvoir faire sur téléphone.** Pour ne pas avoir à tout refaire, l'interface est conçue **dès la v1** avec des composants qui s'adaptent à la taille de l'écran :
  - des zones tactiles d'au moins 44 px ;
  - aucune information accessible uniquement au survol (un appui long fait le même effet) ;
  - des tableaux qui se replient en cartes.
- **Précisé en tranche 4 :**
  - En dessous de 640 px de large, ou si l'option est cochée, le jeu passe en **mode consultation**. La barre du haut est condensée.
  - L'écran **Résumé** regroupe les décisions, les alertes des 48 dernières heures, les candidats (accepter, refuser), les aventuriers sur le départ (prime ou exonération), les tarifs (+/−) et les quêtes sans preneur (+2 po de bonus).
  - Le journal, les Chroniques, les Aventuriers, le Tableau et les Options restent accessibles.

### 7.10 Accessibilité et langue

- **v1 en français.** Tous les textes sont **regroupés dans des fichiers séparés**, y compris les modèles du journal et des pensées, pour une traduction future.
- Taille du texte réglable, contrastes suffisants dans les deux thèmes, et jamais d'information par la seule couleur.
- **Précisé en tranche 4 :**
  - Taille du texte de 90 à 130 %. Les zones tactiles font au moins 44 px sur téléphone.
  - **Reporté :** le regroupement de tous les textes dans des fichiers séparés, pour une traduction future. Les données de jeu, les événements et les conseils de Gaspard sont déjà dans des fichiers JSON, mais les textes de l'interface et du journal restent dans le code.

### 7.11 Son

**Aucun son en v1.** L'architecture prévoit des points d'accroche (ambiance de taverne, cloche du matin, cor d'assaut) pour une version ultérieure.

---

## 8. Annexe technique et équilibrage

### 8.1 Architecture

```
┌──────────────────────── NAVIGATEUR ─────────────────────────────────────┐
│                                                                         │
│  ┌─────────────── TÂCHE DE FOND (Web Worker) ───────────────┐            │
│  │  CŒUR DE SIMULATION (TypeScript pur, zéro dépendance)    │            │
│  │  horloge · aventuriers · salles · quêtes · marché ·      │            │
│  │  monde · événements · journal                            │            │
│  │  Générateur aléatoire à graine · aucune lecture de       │            │
│  │  l'heure réelle                                          │            │
│  └───────────▲──────────────────────────────┬───────────────┘            │
│      commandes du joueur          état + entrées de journal              │
│              │                              ▼                            │
│  ┌──────────────────────── INTERFACE ───────────────────────┐            │
│  │  Panneaux et écrans : Svelte ou Preact                   │            │
│  │  Vue en coupe et carte : Canvas 2D natif                 │            │
│  └──────────────────────────────────────────────────────────┘            │
│                                                                         │
│  DONNÉES (JSON) : espèces, ressources, recettes, traits, événements,    │
│                   textes en français                                    │
│  SAUVEGARDES : base de données du navigateur (IndexedDB)                │
│  SERVICE WORKER : installation comme application, hors ligne,           │
│                   notifications                                         │
└─────────────────────────────────────────────────────────────────────────┘
          │ (v1.1 seulement)
          ▼
   PETIT SERVICE DE NOTIFICATIONS (offre gratuite, sans données de jeu)
```

**Règles d'architecture :**
1. **Le cœur de simulation ne connaît pas l'affichage.** Il peut tourner sans interface : rattrapage du mode Chronique, pré-simulation des notifications, simulateur d'équilibrage, tests.
2. **Toute action du joueur est une commande** (par exemple *changer un tarif* ou *créer une prime*), transmise au cœur et appliquée **au début du tick suivant**. Une partie peut ainsi être rejouée à l'identique.
3. **Toutes les valeurs d'équilibrage** viennent de la table centrale (8.12), chargée depuis un fichier. Aucune valeur n'est écrite en dur dans le code.
4. **Tous les contenus** (espèces, plats, événements, traits, textes) sont des **données**. On peut ajouter un monstre ou un événement sans écrire de code.

### 8.2 La boucle de simulation

À chaque tick (1 heure de jeu), dans cet ordre strict :

| # | Étape | Fréquence |
|---|-------|-----------|
| 1 | Appliquer les commandes du joueur | Chaque tick |
| 2 | Avancer l'horloge (heure, phase, jour, semaine, saison) | Chaque tick |
| 3 | Événements : déclenchements, effets, fins, rumeurs, délais de décision | Chaque tick |
| 4 | Populations, cours du marché, génération des quêtes, candidats à la porte | Chaque jour à 06h |
| 5 | Quêtes en cours : étapes, rencontres, combats | Chaque tick |
| 6 | Aventuriers au siège : jauges, fin d'activité, **décision**, demande de service | Chaque tick |
| 7 | Salles : attribution des places, files d'attente, paiements, personnel | Chaque tick |
| 8 | Comptoir : retours de quête (déclaration, taxe, rachat) | Chaque tick |
| 9 | Consignes de l'intendant | Chaque tick |
| 10 | Bilan comptable et salaires | Chaque jour à minuit |
| 11 | Taxe royale, entretien, renommée hebdomadaire | Chaque semaine, Jour du Roi |
| 12 | Émission du journal et des notifications vers l'interface | Chaque tick |

- **Équité :** quand plusieurs aventuriers veulent la dernière place (un lit, une chaise), l'ordre de traitement est **mélangé à chaque tick** par le générateur à graine. Personne n'est toujours servi en premier.
- **Fluidité :** l'interface **interpole** les déplacements des personnages entre deux ticks (12,5 secondes en x1), à 30 ou 60 images par seconde, indépendamment du calcul.

### 8.3 Déterminisme et graine

- **Même graine + mêmes commandes = même partie, au tick près.** C'est indispensable pour :
  - le rattrapage du mode Chronique ;
  - la pré-simulation des notifications (7.7.2) ;
  - la reproduction des bugs.
- Le générateur aléatoire est un algorithme simple et rapide à graine (de type *xoshiro* ou *mulberry32*), avec **un flux séparé par système** (combat, marché, événements…). Une modification dans un système ne décale pas le hasard des autres.
- **La monnaie est en entiers** (cuivre), ce qui évite les erreurs d'arrondi.
- **La graine est affichée** dans les options et peut être partagée pour démarrer une partie dans « le même monde ».

### 8.4 Contenus pilotés par les données

| Fichier | Contenu |
|---------|---------|
| `parametres.json` | La table centrale d'équilibrage (8.12) |
| `zones.json`, `especes.json` | Zones, bestiaire, statistiques de combat, populations |
| `ressources.json`, `plantes.json` | Dépouilles et plantes : poids, prix, conservation, acheteurs |
| `recettes.json`, `plats.json` | Apothicairerie et réfectoire |
| `salles.json` | Niveaux, coûts, capacités, modules |
| `equipement.json` | Paliers, prix, matériaux clés |
| `traits.json`, `classes.json` | Traits et classes |
| `quetes.json` | Modèles de quêtes, clients |
| `evenements.json` | Événements : conditions, effets, choix, option par défaut, suites |
| `textes/fr/*.json` | Journal, pensées, Gaspard, gazette, épilogues, noms générés |

Les effets des événements sont décrits sous forme déclarative, par exemple `{ cible: "demande.fourrure_ours", mult: 3, duree: 14 }`.

### 8.5 Sauvegardes

| Élément | Choix |
|---------|-------|
| Stockage | Base de données du navigateur (IndexedDB) |
| Emplacements | 3 emplacements manuels, plus 2 sauvegardes automatiques en rotation |
| Sauvegarde automatique | Chaque jour de jeu à minuit. En mode Chronique : chaque heure de jeu, et dès que la page passe en arrière-plan |
| Format | JSON compressé, avec un **numéro de version** et des migrations automatiques entre versions. *Pendant le développement (tranches 1 à 3) : pas de migration ; une sauvegarde d'une version précédente est affichée « ancienne version » et ne peut pas être chargée* |
| Export / import | Fichier `.guilde`, pour une copie de secours ou un changement d'appareil |
| Taille visée | Moins de 2 Mo par sauvegarde |

### 8.6 Le mode Chronique

1. **À l'ouverture :** `heures écoulées = heure réelle − heure de la dernière sauvegarde`, plafonnées à 168 (7 jours).
2. Le rattrapage tourne **en tâche de fond, sans affichage**, avec une barre de progression.
3. Le **Rapport d'absence** est construit à partir des entrées du journal de niveau Important et Critique produites pendant le rattrapage.
4. La fraction d'heure restante est reportée, pour que l'horloge ne dérive pas.
5. Les décisions arrivées à échéance pendant l'absence prennent leur option par défaut (7.7.1).
6. **Précisé en tranche 3 :**
   - L'horloge est une **ancre** : heure réelle et tick de départ. Le tick visé vaut `ancre + heures écoulées`, ce qui reporte naturellement la fraction d'heure.
   - Si l'absence dépasse 7 jours, l'ancre est décalée du temps perdu : la guilde reprend là où elle s'était endormie.
   - La partie Chronique a sa propre sauvegarde automatique, écrite à chaque heure de jeu et quand la page passe en arrière-plan.

### 8.7 Application installable et notifications

| Version | Contenu |
|---------|---------|
| **v1** | Jeu **installable** (manifeste et service worker), jouable **hors ligne**. Notifications locales quand le jeu est ouvert ou en arrière-plan |
| **v1.1** | **Notifications avec le jeu fermé** (mode Chronique) : à la fermeture, le jeu pré-simule 48 h et envoie au petit service la liste des notifications avec leur heure. Le service les envoie, puis la liste est effacée à la réouverture. Le service ne stocke que l'abonnement aux notifications et cette liste |

- Sur iPhone, les notifications exigent que le jeu soit ajouté à l'écran d'accueil (iOS 16.4 ou plus récent).
- Le jeu exige une connexion HTTPS (fournie par l'hébergement).
- **Précisé en tranche 4 :**
  - Le manifeste, le service worker et les icônes sont dans `public/`. Les icônes sont générées par `tools/make-icons.mjs`.
  - Le service worker sert le jeu depuis le cache, puis le rafraîchit en arrière-plan : le jeu marche hors ligne.
  - Les notifications locales partent seulement quand le jeu n'est pas au premier plan ; au premier plan, les messages éphémères suffisent. Chaque catégorie s'active ou se coupe dans les Options.
  - Le site est construit avec des chemins relatifs : il fonctionne sur n'importe quel hébergement statique.

### 8.8 Hébergement

**Un site statique** (fichiers en ligne, sans serveur), sur une offre gratuite. Le jeu tourne entièrement dans le navigateur du joueur. Seul le service de notifications de la v1.1 demande un petit serveur.

### 8.9 Objectifs de performance

| Mesure | Objectif |
|--------|----------|
| Calcul d'un tick (60 aventuriers, 10 quêtes en cours) | < 5 ms |
| Rattrapage de 7 jours (168 ticks) | < 2 s |
| Affichage en x8 sur un PC moyen | Fluide (≥ 30 images par seconde) |
| Mode consultation sur téléphone | Ouverture en moins de 3 s |

**Moyens :** la simulation tourne dans une tâche de fond, les données sont stockées dans des structures compactes, le journal tourne en mémoire circulaire, et les graphiques longs sont échantillonnés.

### 8.10 Outils

#### 8.10.1 Le simulateur d'équilibrage

- Un programme qui fait tourner le cœur de simulation **sans affichage**, avec un **joueur-robot** qui suit des stratégies simples : *passif*, *prudent*, *gourmand* (prix élevés), *généreux* (prix bas).
- Il joue **N graines × 200 jours** et produit un rapport :
  - jalons atteints, à comparer aux **cibles de rythme** (1.13) ;
  - fréquence des morts (cible : 1 toutes les 2 à 3 semaines) ;
  - courbes de trésorerie, de renommée et de prospérité ;
  - taux de départs, fraude, cours extrêmes.
- **Il signale toute cible non respectée.** Il est lancé après chaque modification des paramètres.

#### 8.10.2 Le mode développeur

Une console cachée qui permet :
- d'inspecter n'importe quel aventurier, quête ou zone ;
- de déclencher un événement ;
- d'avancer le temps de N jours ;
- de modifier un indice, la trésorerie ou une population ;
- de rejouer une partie depuis sa graine et ses commandes.

#### 8.10.3 Les tests automatiques

| Test | Vérifie que… |
|------|--------------|
| Formules | Chaque formule du GDD donne les valeurs attendues sur des exemples |
| **Déterminisme** | Deux parties avec la même graine donnent un état identique après 100 jours |
| Sauvegarde | Sauvegarder puis recharger ne change rien à l'état |
| **Rattrapage** | 7 jours joués d'affilée donnent le même résultat que sauvegarde + rattrapage de 7 jours |
| Données | Chaque fichier de contenu est complet et cohérent (aucune ressource sans acheteur, aucune recette avec un ingrédient inconnu…) |

### 8.11 Feuille de route

Chaque tranche est **jouable et testée** avant de passer à la suivante.

| Tranche | Nom | Contenu | Critère de sortie |
|---------|-----|---------|-------------------|
| **1** | *Le Bourg et la Forêt* | **Socle** : cœur de simulation, horloge, vitesses, graine, sauvegarde, journal, barre du haut, données JSON. **Jeu** : Dortoirs, Réfectoire (denrées, plats de base), personnel, aventuriers (attributs, jauges, IA hybride, pensées, traits), quêtes de **Chasse** et d'**Aide en ville**, zones Ville et Forêt, **4 espèces** (rat, sanglier, loup, araignée), combat, comptoir (taxe et vente simple), vue en coupe simple, tableau des quêtes, Grand Livre simple | 30 jours jouables. Le simulateur d'équilibrage confirme que la guilde est rentable |
| **2** | *La guilde complète* | Infirmerie (états, remèdes, apothicairerie), Terrain et professeurs, inventaire et Forgeron, marché complet (bourse, 5 acheteurs, contrats, rachat, Resserre), fiscalité et fraude, équipes et relations, **primes du joueur**, 6 zones et 12 espèces, plantes, populations, consignes de l'intendant, tous les types de quêtes | 100 jours jouables. Cibles de rythme 1.13 respectées jusqu'au Sceau d'Argent |
| **3** | *Le monde vivant* | Danger et Prospérité, saisons, paliers de ville, événements, chaînes et rumeurs, Chroniques, guildes rivales, assauts, épidémies, carte régionale, **mode Chronique** et rapport d'absence | Une année de jeu complète sans incohérence. Test de rattrapage réussi |
| **4** | *La légende* | Renommée et sceaux, hauts faits, Gaspard, difficultés, épilogue, Panthéon, Livre de la guilde, **application installable**, mode consultation sur téléphone, notifications locales, thèmes, accessibilité, finitions | **Version 1.0** |
| v1.1+ | *Après la sortie* | Notifications avec le jeu fermé, scénarios *Guilde en ruine* et *Ville frontière*, **tout faire sur téléphone**, synchronisation PC/téléphone, son | — |

#### 8.11.1 Bilan de la tranche 1 (2026-10-29)

**Livré :** le cœur de simulation complet pour le périmètre de la tranche, l'interface (Siège en vue en coupe, Aventuriers, Personnel, Tableau, Comptoir, Grand Livre, Options), les sauvegardes, le simulateur d'équilibrage (`npm run sim`), l'outil de diagnostic (`npm run inspect`) et 13 tests automatiques, dont le déterminisme et le rattrapage.

**Simplifications volontaires, à compléter dans les tranches suivantes :**
- Les blessures sont de simples PV perdus, sans états typés. Les soins passent par les concurrents de la ville (Temple, rebouteux) en attendant l'infirmerie.
- Les équipes se forment chaque soir mais ne sont pas encore durables, et il n'y a pas encore de relations entre aventuriers.
- Le marché n'a pas encore ses acheteurs, ses contrats ni le rachat par la guilde : la guilde ne reçoit des dépouilles que par la taxe en nature.
- Le Danger, la Prospérité et le Sceau restent fixes.
- La vue en coupe utilise le Canvas 2D natif du navigateur. PixiJS ne sera ajouté que si les performances l'exigent.

**Résultats du simulateur** (8 graines × 30 jours, joueur-robot prudent) :

| Cible | Résultat | Statut |
|-------|----------|--------|
| Aucune faillite | 0 sur 8 | ✔ |
| Guilde rentable | ≈ +3,4 po par jour sur la dernière semaine | ✔ |
| Revenu net de 10 à 20 po par jour au jour 30 (1.13) | ≈ 3,4 po | ✘ attendu : l'infirmerie, le terrain et le marché complet (tranche 2) apportent l'essentiel des revenus visés |
| Aventuriers qui vivent de leur travail | ≈ 9 po d'économies au jour 30, moral ≈ 74 | ✔ |
| Morts : 1 toutes les 2 à 3 semaines (3.12.4) | ≈ 0,3 en 30 jours | ✘ attendu : sans quêtes de rang D et plus ni états graves, le risque reste faible. À revérifier en tranche 2 |
| Guilde négligée (joueur-robot passif, toutes les recrues acceptées) | Surpeuplement, nuits dehors, moral ≈ 34 | Conséquence voulue d'une mauvaise gestion |

#### 8.11.2 Bilan de la tranche 2 (2026-10-29)

**Livré :** l'infirmerie (états, remèdes, apothicairerie, soins à crédit), le terrain d'entraînement et ses professeurs, les aménagements des salles, l'inventaire avec usure et le Forgeron, le marché complet (5 acheteurs, réputation, contrats, rachat, Resserre), la fiscalité et la fraude, les relations, bagarres et équipes durables, les primes et bonus du joueur, les 6 zones, les 12 espèces et les plantes, les populations, les consignes de l'intendant et les 7 types de quêtes. 20 tests automatiques.

**Simplifications volontaires :** le Danger, la Prospérité et le Sceau restent fixes jusqu'aux tranches 3 et 4. Les sauvegardes de la tranche 1 ne se chargent plus (8.5).

**Ajustements d'équilibrage** (détaillés dans chaque section) : estimation du risque de Lanchester (4.5.1), infection et mort critique en probabilités (1.8.1), stabilisation des cas critiques (1.8.3), crédit de soins à 10 po par défaut (1.8.5), extermination à Base × 0,1 par tête (4.3.3), et, pour **les revenus de la guilde** : greffier et offre de quêtes proportionnelle à la guilde (4.3.2), récompenses E et plus relevées (1.1.2), provisions de la ville et gibier (4.5.3, 4.6.3), entretien à 1,5 % (1.1.3).

**Effet des ajustements de revenus** (robot prudent, 4 graines × 100 jours, 15 aventuriers au plus) :

| Mesure | Avant | Après |
|--------|-------|-------|
| Gains des aventuriers en quête (100 jours) | ≈ 860 po | ≈ 1 370 po |
| Réussite des chasses de rang E | 44 % | 80 % |
| Taxe encaissée par la guilde (100 jours) | ≈ 235 po | ≈ 380 po |
| Revenu net vers J30, hors travaux | ≈ 3,2 po par jour | ≈ 4,3 po par jour |

**Résultats du simulateur** (robot prudent, 8 graines × 100 jours, 25 aventuriers au plus) :

| Cible | Résultat | Statut |
|-------|----------|--------|
| Aucune faillite | 0 sur 8 | ✔ |
| Infirmerie et terrain construits (1.13 : jour 1 à 3) | Jour 2 | ✔ |
| Morts : 1 toutes les 2 à 3 semaines | ≈ 4,5 en 100 jours (une partie à 15 : guilde de 24 aventuriers dont les recrues pauvres n'ont plus de crédit de soins) | ✔ en moyenne |
| Aventuriers qui vivent de leur travail | ≈ 7 po d'économies, moral ≈ 47 | ✔ |
| Revenu net de 10 à 20 po par jour au jour 30 (1.13) | ≈ 4,9 po vers J30 ; 8 à 11 po en fin de partie pour les guildes qui grandissent | ✘ |
| Première salle au niveau 3 vers J20-30 (1.13) | Pas avant J100 avec le robot | ✘ |

**Pourquoi les cibles de revenu ne sont pas atteintes :** la guilde vit de ce que dépensent ses aventuriers. À 15 aventuriers gagnant chacun 1 à 1,5 po par jour, les recettes plafonnent vers 15 po par jour, dont environ 9 partent en charges (salaires, denrées, entretien, taxe royale). Un quart de l'or des aventuriers part aussi chez le Forgeron de la ville. Le revenu net grandit surtout avec **la taille de la guilde**, ce que la tranche 4 (renommée, sceaux, tableau plus grand) accélérera. À trancher : réviser les cibles 1.13, ou relever encore les revenus.

#### 8.11.3 Bilan de la tranche 3 (2026-10-29)

**Livré :**
- **Le monde vivant :**
  - Danger et Prospérité dynamiques, avec 4 saisons et leurs effets, et 3 paliers de ville qui montent et redescendent.
  - Le catalogue de 27 événements en données, avec leurs rumeurs, leurs décisions et les 4 chaînes.
  - 2 guildes rivales, l'assaut sur la ville en 3 vagues et les épidémies avec contagion.
  - La Renommée en points (6.1.1).
- **Le mode Chronique :** horloge réelle, rattrapage plafonné à 7 jours, guilde en sommeil au-delà, rapport d'absence.
- **Interface :**
  - Les **Chroniques de la ville** (une, décisions, rumeurs, marché, guildes, exploits et nécrologie, courbes).
  - La **Carte régionale** (zones colorées, équipes sur les routes, calques, fiches de zone avec courbe des populations).
  - Les fenêtres de décision et le rapport d'absence.
  - Le Danger, la Prospérité, le palier et la renommée dans la barre du haut.
- **Tests :** 26 tests automatiques, dont le rattrapage de 7 jours identique au jeu en direct et une année complète.

**Simplifications :**
- Pas de notifications système (tranche 4).
- Le Sceau reste fixe (tranche 4).
- Le terrain endommagé n'a pas d'effet.
- La carte relie chaque zone directement à la ville.
- Les modifications de l'état de la partie font passer les sauvegardes à la version 3 : celles des tranches 1 et 2 ne se chargent plus.

**Résultats du simulateur** (robot prudent, 8 graines × 112 jours, soit une année) :

| Cible | Résultat | Statut |
|-------|----------|--------|
| Une année complète sans incohérence (critère de sortie) | 0 incohérence : bornes, quêtes fantômes, modificateurs, décisions en attente, renommées | ✔ |
| Test de rattrapage (critère de sortie) | 7 jours rattrapés = 7 jours en direct, à l'octet près | ✔ |
| Aucune faillite | 0 sur 8 | ✔ |
| Événements | ≈ 2,5 petits événements par semaine, 1 majeur par saison, ≈ 1,2 crise par an | ✔ (5.4.1) |
| Ville | Passe au palier Ville entre J37 et J68, en redescend parfois | ✔ arc de progression |
| Renommée | Guilde ≈ 28 à 109 en fin d'année, l'Aube ≈ 68 à 104, les Crocs ≈ 34 à 71 | ✔ rivales dans la course |
| Morts | ≈ 7 par année de 112 jours | ✔ (1 toutes les 2 à 3 semaines) |
| Revenu net vers J30 | ≈ 6 po par jour (≈ 5 en tranche 2), grâce aux récompenses d'une région Menaçante | ✘ cibles 1.13 toujours à trancher |

#### 8.11.4 Bilan de la tranche 4 (2026-10-29) : version 1.0

**Livré :**
- **La progression :**
  - Renommée hebdomadaire et Sceaux royaux, avec le héraut et les déblocages.
  - Niveaux 4 et 5 des quatre salles : suite, Festin du Héros, salle de duel, Arène, Maître-chasseur et Aumônier, chirurgien, sanctuaire.
  - Banque et usurier.
- **La méta :** 33 hauts faits conservés d'une partie à l'autre, le Panthéon et ses descendants, les conseils du vieux Gaspard.
- **Les fins de partie :** trois difficultés, l'épilogue de victoire (bac à sable ensuite) ou de défaite, le Livre de la guilde exportable.
- **L'interface :**
  - L'écran Charte (sceaux, bilan de la semaine, hauts faits, Panthéon) et le panneau des prêteurs dans le Grand Livre.
  - Les Options : difficulté, Gaspard, taille du texte, notifications, mode consultation.
  - Le mode consultation sur téléphone, l'**application installable et jouable hors ligne**, les notifications locales.
- **Tests :** 32 tests automatiques.

**Écarts restants :**
- **Rythme (1.13) :**
  - Le Sceau de Fer arrive entre J40 et J111.
  - Le Sceau d'Argent n'est pas atteint en un an avec le robot, au lieu de J50 à J70.
  - Le revenu net est d'environ 7 po par jour au jour 30.
  - Les cibles et l'équilibrage de la progression restent à reprendre, en même temps que les revenus, comme convenu avec le joueur.
- **Textes de l'interface** pas encore externalisés pour la traduction (7.10). **Difficulté personnalisée** pas encore proposée (6.5).
- **Sauvegardes :** le format passe en version 4 ; celles des tranches précédentes ne se chargent plus.

**Résultats du simulateur** (robot prudent, 8 graines × 112 jours, 30 aventuriers au plus) :

| Cible | Résultat | Statut |
|-------|----------|--------|
| Aucune faillite, aucune incohérence sur l'année | 0 / 0 | ✔ |
| Sceau de Fer | Jours 40, 44, 57, 58, 58, 79, 111 ; non atteint dans 1 partie | ✘ trop lent (cible 1.13 : Sceau d'Argent J50 à 70) |
| Hauts faits | 5 à 9 par partie la première année | ✔ |
| Livre de la guilde | 4 chapitres par an, un par saison | ✔ |
| Morts | ≈ 8 par an | ✔ |
| Première salle au niveau 3 | ≈ J35 (cible J20 à 30) | ✘ proche |

### 8.12 Table centrale des paramètres

Toutes les valeurs ci-dessous sont des **valeurs initiales**. Elles vivent dans `parametres.json` et sont réglées à l'aide du simulateur d'équilibrage.

| Système | Paramètre | Valeur | Réf. |
|---------|-----------|--------|------|
| **Temps** | Tick | 1 h de jeu | 0.5 |
| | Durée d'un jour (Classique, x1) | 5 min réelles | 0.5 |
| | Vitesses | x1, x2, x4, x8 | 0.5 |
| | Jours par semaine / saison / an | 7 / 28 / 112 | 0.5 |
| | Rattrapage maximum (Chronique) | 168 ticks | 0.5 |
| | Délai de décision (Chronique) | 12 h de jeu | 7.7.1 |
| **Monnaie** | 1 po = 10 pa = 100 pc | — | 1.1.1 |
| | Trésorerie de départ | 300 po (Normal) | 1.12 |
| **Charges** | Entretien | 1,5 % de la valeur des salles par semaine | 1.1.3 |
| | Taxe royale | (5 po + 3 % du chiffre d'affaires) × (1 + 0,5 × (rang − 1)) | 1.1.3 |
| | Banque / Usurier | 8 % par saison / 5 % par semaine, plafond 300 po | 1.1.3 |
| | Délai avant faillite | 7 jours (Normal) | 1.1.4 |
| **Tarification** | Multiplicateur de qualité MQ | 0,6 + 0,8 × Q / 100 | 1.3.1 |
| | Indice de prix IP | 0,7 + 0,6 × Prospérité / 100 | 1.3.2 |
| | Curseur de prix | ×0,5 à ×3,0, par pas de 5 % | 1.3.3 |
| | Tolérance T | 1,10 + 0,25 × log10(Or / Coût de la vie), entre 0 et 2, + trait | 1.3.4 |
| | Grief : refus / baisse quotidienne | +5 / −2 par jour | 1.3.4 |
| **Personnel** | Exposant de salaire | (C / 50) ^ 1,3 | 1.4.3 |
| | Progression | +1 tous les 5 jours | 1.4.3 |
| | Seuil de démission | Loyauté < 20, 10 % par jour | 1.4.1 |
| **Dortoirs** | Énergie par type de lit | 60 / 75 / 90 / 100 % | 1.5.1 |
| | Places par niveau | 12 / 24 / 40 / 60 / 80 | 1.5.2 |
| | Places entretenues par valet | 15 | 1.5.3 |
| **Réfectoire** | Faim : éveillé / sommeil | −4 / −1,5 par heure | 1.6.1 |
| | Production | Cuisinier 6 + C / 10, commis +4 portions par heure | 1.6.6 |
| | Risque d'intoxication | 15 % si fraîcheur < 20 % | 1.6.5 |
| **Entraînement** | XP d'une séance | 15 % de l'XP d'une quête type | 1.7.3 |
| | 2ᵉ séance de la journée | ×0,5 | 1.7.3 |
| **Infirmerie** | Chance de succès | 50 + C − 15 × gravité + 5 × niveau, entre 5 et 98 % | 1.8.3 |
| **Marché** | Stock normal | 5 jours de demande | 2.5.1 |
| | Élasticité commune / rare | 0,5 / 0,8 | 2.5.1 |
| | Apport extérieur commun / rare | 50 % / 20 % de la demande | 2.5.1 |
| | Frais de vente aventurier / guilde | 10 % / 5 % | 2.5.2 |
| | Curseur de rachat | ×0,7 à ×1,0 | 2.4.1 |
| | Prime des contrats | +30 à +80 %, 3 actifs au maximum | 2.5.3 |
| **Fiscalité** | Taux | 0 à 40 %, référence 15 % | 2.6.1 |
| | Détection de fraude | 5 % sans inspecteur, 20 % + 0,6 × C avec | 2.6.2 |
| **Populations** | Seuils raréfaction / prolifération | 30 % / 80 % | 2.7 |
| **Aventuriers** | XP requise | 100 × n ^ 1,5 | 3.9 |
| | XP d'une quête type | 25 % de l'XP requise | 3.9 |
| | Niveau maximum | 30 | 3.9 |
| | PV maximum | 20 + 5 × CON + 3 × niveau | 3.3 |
| | Capacité de portage | 4 + FOR / 2 | 3.3 |
| | Progression d'une compétence | 10 % × (1 − compétence / 25) | 3.4 |
| **IA** | Seuils d'urgence | Santé 25 % · Faim 20 · Énergie 15 · Or 2 jours | 3.10.1 |
| | Aléa des scores | ±10 % | 3.10.2 |
| | Seuils d'acceptation d'une quête | 45 / 65 / 80 % | 4.5.1 |
| | Envie de partir : Mécontent / Départ | 30 / 60 | 3.12.2 |
| **Combat** | Coefficient de dégâts | 0,3 | 4.7.2 |
| | Rounds maximum | 10 | 4.7 |
| | Risque de mort à terre | 30 à 60 % | 4.8.3 |
| **Quêtes** | Quêtes de combat par jour | 3 + 0,05 × Prospérité + 0,2 × Aventuriers + bonus | 4.3.2 |
| | Petits boulots par jour | 4 + 0,05 × Prospérité + 0,1 × Aventuriers, 12 affichés au maximum | 4.3.2 |
| | Portée du greffier | Rang tenu par 3 aventuriers + 1 ; au-delà, 15 % des quêtes retenues | 4.3.2 |
| | Extermination | Base × 0,1 par tête, 12 à 36 h | 4.3.3 |
| | Provisions de la ville | Prix du panier × 1,4 | 4.5.3 |
| | Abandon pour blessures | PV moyens < 60 / 45 / 30 % | 4.6.3 |
| | Paie d'un petit boulot | Base F × 0,8 pour 5 h 30 de travail | 4.3.3 |
| | Estimation du risque | Lanchester, Prudence = 2 | 4.5.1 |
| | Heure de départ | 07h | 4.5.3 |
| | Base par rang (F à S) | 1 / 6 / 15 / 35 / 90 / 220 / 500 po | 4.3.3 |
| | Taille du tableau | 8 + 2 × (rang − 1) | 4.3.4 |
| | Expiration | 2 à 7 jours | 4.3.4 |
| **Légende** | Seuils des sceaux | 0 / 100 / 300 / 700 / 1 500 points | 6.2 |
| | Érosion sans quête D ou plus | 1 % des points par semaine | 6.1.2 |
| | Banque : intérêts, échéance, plafond | 8 % par saison, 56 jours, 200 à 10 000 po selon le sceau | 1.1.3 |
| | Usurier : intérêts, échéance, plafond | 5 % par semaine, 28 jours, 300 po | 1.1.3 |
| | Recette de l'Arène | 20 po × (1 + Prospérité / 50), ×2 au palier Cité | 1.7.4 |
| | Recrue descendante d'un héros | 3 % | 6.7 |
| **Monde** | Convergence de la Prospérité | 5 % par jour | 5.1.2 |
| | Apport de la guilde à la Prospérité | Recettes 7 j + dépenses en ville / 50 po, plafond +10 | 5.1.2 |
| | Danger Menaçant : récompenses | ×1,2 | 5.1.1 |
| | Quêtes nobles (palier Ville) | 15 %, ×1,3 | 5.3 |
| | Rumeurs exactes / fausses alertes / détails faux | 75 / 12,5 / 12,5 % | 5.4.5 |
| | Délai d'une décision | 12 h de jeu (les deux modes) | 7.7.1 |
| | Renommée de départ (guilde, Aube, Crocs) | 20 / 35 / 20 | 5.5, 6.1 |
| | Quête prise par une rivale | 4 % × Renommée / 50 par jour, de 1 à 12 % | 5.5 |
| | Délai entre deux assauts / deux épidémies | 28 / 56 jours | 5.6, 5.7 |
| | Paliers de ville | 40 / 75, maintenus 14 jours | 5.3 |
| | Petits événements | Test quotidien à 35 % | 5.4.1 |
| | Fiabilité des rumeurs | 75 % (Normal) | 5.4.5 |
| **Progression** | Seuils des sceaux | 100 / 300 / 700 / 1 500 points | 6.2 |
| | Érosion de la renommée | 1 % par semaine sans quête notable | 6.1.2 |

### 8.13 Glossaire

| Terme | Définition |
|-------|------------|
| **À terre** | Aventurier tombé à 0 PV en combat. Peut être relevé, sinon risque de mourir (4.8.3) |
| **Comptoir** | Lieu où passe tout retour de quête : déclaration, taxe, rachat (2.4) |
| **Consigne** | Règle automatique exécutée par l'intendant (1.10) |
| **Cours** | Prix du jour d'une ressource au marché de la ville (2.5) |
| **Curseur** | Multiplicateur que le joueur applique au prix de référence (1.3.3) |
| **Danger** | Indice de 0 à 100 de la pression des monstres, par zone et pour la région (5.1.1) |
| **Graine** | Nombre qui détermine tout le hasard d'une partie (8.3) |
| **Grief** | Ressentiment d'un aventurier envers les prix (tarifaire) ou la taxe (fiscal) |
| **IP** | Indice de prix régional, tiré de la Prospérité (1.3.2) |
| **Marge de victoire** | Part des PV que l'équipe a gardée après un combat (4.7.3) |
| **MQ** | Multiplicateur de qualité appliqué au prix (1.3.1) |
| **Pensée** | Phrase courte qui explique une décision d'aventurier (3.10.3) |
| **Pré-simulation** | Calcul des 48 h à venir à la fermeture du jeu, pour programmer les notifications (7.7.2) |
| **Prime** | Quête créée ou bonifiée par le joueur et financée par la guilde (4.4) |
| **Prix de référence** | Le « juste prix » d'un service selon sa qualité et la Prospérité (1.3.3) |
| **Prospérité** | Indice de 0 à 100 de la richesse de la ville (5.1.2) |
| **Q** | Qualité d'un service, de 0 à 100 |
| **R** | Ratio entre le prix affiché et le prix de référence (1.3.4) |
| **Rachat (préemption)** | Droit de la guilde d'acheter en priorité le butin de ses aventuriers (2.4.1) |
| **Rattrapage** | Simulation accélérée du temps écoulé pendant l'absence du joueur en mode Chronique (8.6) |
| **Resserre** | Entrepôt de dépouilles de la guilde (2.4.2) |
| **Sceau** | Rang de la guilde accordé par la Couronne (6.2) |
| **T** | Tolérance de prix d'un aventurier (1.3.4) |
| **Tick** | Pas de simulation, égal à une heure de jeu |
| **Tranche** | Étape de développement jouable (8.11) |

---

## Journal des décisions

| # | Date | Décision | Chapitre |
|---|------|----------|----------|
| D-01 | 2026-10-29 | Gestion strictement indirecte. Seul levier actif : publier des primes. | 0 |
| D-02 | 2026-10-29 | Tick = 1 h de jeu. Mode Classique : 1 jour = 5 min réelles en x1. | 0 |
| D-03 | 2026-10-29 | Second mode « Chronique » en temps réel, avec rattrapage hors ligne plafonné à 7 jours. | 0 |
| D-04 | 2026-10-29 | Bac à sable, rangs de renommée comme objectifs, faillite comme seule défaite. | 0 |
| D-05 | 2026-10-29 | De 10 aventuriers au départ à 60 au maximum. | 0 |
| D-06 | 2026-10-29 | Monnaie interne unique (cuivre), affichée en or, argent et cuivre (1/10/100). Récompenses revues à la baisse : quête F = 5 pa à 2 po au total, partagée par l'équipe. | 1.1 |
| D-07 | 2026-10-29 | Entretien, taxe royale hebdomadaire, prêts (banque et usurier). *Proposé, à valider.* | 1.1 |
| D-08 | 2026-10-29 | Salles fixes à 5 niveaux, avec modules ponctuels. | 1.2 |
| D-09 | 2026-10-29 | Tarification par curseur (×0,5 à ×3,0) autour d'un prix de référence. | 1.3 |
| D-10 | 2026-10-29 | Personnel nommé et léger : compétence, potentiel, loyauté, trait. | 1.4 |
| D-11 | 2026-10-29 | Un concurrent abstrait par service, qui fixe le plafond de prix. | 1.3.5 |
| D-12 | 2026-10-29 | Cotisation d'inscription unique, sans cotisation récurrente. | 1.9 |
| D-13 | 2026-10-29 | Types de lits coexistants, répartis par places (capacité contre confort). | 1.5 |
| D-14 | 2026-10-29 | Réfectoire développé : stock avec fraîcheur, viande de monstre, recettes, boissons, paniers de route. | 1.6 |
| D-15 | 2026-10-29 | Entraînement payé à la séance, plafond de niveau par prof, affinités par classe. | 1.7 |
| D-16 | 2026-10-29 | Six états typés, remèdes issus des dépouilles, mort définitive mais rare. | 1.8 |
| D-17 | 2026-10-29 | 6 zones (dont Ville), 12 espèces de F à S, et 8 plantes récoltables. | 2.1, 2.2 |
| D-18 | 2026-10-29 | Types de quêtes : chasse, extermination, cueillette, escorte, aide en ville, exploration, protection. | 4 |
| D-19 | 2026-10-29 | Dépouilles en 3 qualités, capacité de transport par aventurier. | 2.3 |
| D-20 | 2026-10-29 | Circuit mixte : taxe, puis préemption de la guilde au prix de rachat, le reste vendu en ville par l'aventurier. | 2.4 |
| D-21 | 2026-10-29 | Stockage et spéculation possibles (Resserre), avec pourriture. | 2.4.2 |
| D-22 | 2026-10-29 | 5 acheteurs en ville et des contrats à échéance. | 2.5 |
| D-23 | 2026-10-29 | **Pas de forge dans la guilde** : le Forgeron est un acheteur de la ville. | 2.4.3 |
| D-24 | 2026-10-29 | Taxe unique de 0 à 40 %, avec exonérations possibles. | 2.6 |
| D-25 | 2026-10-29 | Fraude au butin et Inspecteur du butin. | 2.6.2 |
| D-26 | 2026-10-29 | Populations par espèce et par zone, reliées au Danger. | 2.7 |
| D-27 | 2026-10-29 | 5 classes : Guerrier, Rôdeur, Voleur, Mage, Clerc. | 3.2 |
| D-28 | 2026-10-29 | 5 attributs, 4 compétences générales et 2 compétences par classe, qui progressent par l'usage. | 3.3, 3.4 |
| D-29 | 2026-10-29 | Deux jauges distinctes : Fierté (exigence de standing) et Respectabilité (réputation en ville). | 3.6 |
| D-30 | 2026-10-29 | 2 traits par aventurier parmi 20, le second caché pendant 7 jours. | 3.7 |
| D-31 | 2026-10-29 | Inventaire réel (arme, armure, accessoire, sac), 7 paliers liés au marché des dépouilles, usure. | 3.8 |
| D-32 | 2026-10-29 | IA hybride : urgences, puis scores d'utilité, avec pensées visibles. | 3.10 |
| D-33 | 2026-10-29 | Équipes semi-durables et nommées. Amitiés et rivalités, sans romance. | 3.11 |
| D-34 | 2026-10-29 | Recrutement à la porte (accepter ou refuser). Retraite avec reconversion en professeur ou en personnel. | 3.12 |
| D-35 | 2026-10-29 | Mort définitive, environ 1 toutes les 2 à 3 semaines, avec héritage et Mur du Souvenir. | 3.12.4 |
| D-36 | 2026-10-29 | Quêtes générées par le monde (5 types de clients nommés) et par les primes du joueur. | 4.3 |
| D-37 | 2026-10-29 | Tableau de 8 à 16 quêtes, expiration de 2 à 7 jours, danger estimé avec une marge d'erreur. | 4.3.4 |
| D-38 | 2026-10-29 | Primes du joueur : créer une quête ou ajouter un bonus. Somme bloquée, rendue si expirée. | 4.4 |
| D-39 | 2026-10-29 | Une seule taxe sur l'ensemble (récompense et butin), sans commission séparée. | 2.6.1 |
| D-40 | 2026-10-29 | Quêtes simulées par étapes heure par heure, combats en rounds abstraits résumés dans le journal. | 4.6, 4.7 |
| D-41 | 2026-10-29 | Carte régionale avec les équipes en mouvement, sans contrôle direct. | 4.10 |
| D-42 | 2026-10-29 | Risque perçu avec un biais selon les traits. Retraite décidée par le chef. Échec sans récompense mais butin conservé. | 4.5, 4.8 |
| D-43 | 2026-10-29 | Aventurier à terre : relevé par un Clerc ou une potion, sinon 30 à 60 % de risque de mort. | 4.8.3 |
| D-44 | 2026-10-29 | Une équipe par quête, sauf l'extermination (ouverte, payée à la tête). | 4.2 |
| D-45 | 2026-10-29 | Satisfaction par client. Les échecs et expirations coûtent de la renommée selon le rang. | 4.3 |
| D-46 | 2026-10-29 | Danger (moyenne pondérée des zones) et Prospérité (valeur cible) liés en boucle. | 5.1 |
| D-47 | 2026-10-29 | 4 saisons avec des effets sur les monstres, les plantes, l'économie et la vie de la guilde. | 5.2 |
| D-48 | 2026-10-29 | Ville à 3 paliers (Bourg, Ville, Cité), réversibles. La partie commence au Bourg. | 5.3 |
| D-49 | 2026-10-29 | Événements décrits comme des données, en chaînes conditionnelles, dont un tiers avec un choix. 25 au départ. | 5.4 |
| D-50 | 2026-10-29 | Rumeurs 2 à 5 jours avant les événements majeurs, fiables à 75 %, fiabilité jamais affichée. | 5.4.5 |
| D-51 | 2026-10-29 | 2 guildes rivales abstraites (l'Aube, les Crocs Libres) avec des actions. | 5.5 |
| D-52 | 2026-10-29 | Assaut sur la ville en 3 vagues, défendu par les aventuriers présents. | 5.6 |
| D-53 | 2026-10-29 | Épidémies par contagion de contact dans la guilde, bloquées par la Quarantaine. | 5.7 |
| D-54 | 2026-10-29 | Renommée en points : gains et pertes ponctuels, bilan hebdomadaire, légère érosion. | 6.1 |
| D-55 | 2026-10-29 | Rangs renommés **Sceaux royaux** (Cuivre, Fer, Argent, Or, Mithril). Points et conditions. Un rang acquis ne se perd jamais. | 6.2 |
| D-56 | 2026-10-29 | Une trentaine de hauts faits honorifiques. | 6.3 |
| D-57 | 2026-10-29 | Conseiller « vieux Gaspard » non bloquant à la place d'un tutoriel. | 6.4 |
| D-58 | 2026-10-29 | 3 difficultés et un mode personnalisé. | 6.5 |
| D-59 | 2026-10-29 | Victoire au Sceau de Mithril avec épilogue, puis bac à sable. | 6.6 |
| D-60 | 2026-10-29 | Panthéon entre les parties, sans avantage de jeu. | 6.7 |
| D-61 | 2026-10-29 | v1 : scénario standard seulement. Guilde en ruine et Ville frontière plus tard. | 6.8 |
| D-62 | 2026-10-29 | Livre de la guilde : chronique saisonnière générée et exportable. | 6.9 |
| D-63 | 2026-10-29 | Interface hybride : vue du siège en coupe au centre, panneaux autour. | 7.5.1 |
| D-64 | 2026-10-29 | Direction artistique « parchemin sobre », thèmes clair et sombre. | 7.2 |
| D-65 | 2026-10-29 | Disposition : barre du haut, navigation à gauche, contenu au centre, journal à droite. 11 écrans. | 7.3, 7.5 |
| D-66 | 2026-10-29 | Journal en 5 catégories et 4 niveaux, avec regroupement des détails. | 7.6 |
| D-67 | 2026-10-29 | Jeu installable comme une application, avec notifications système. Jeu fermé : pré-simulation de 48 h et petit service d'envoi. | 7.7.2 |
| D-68 | 2026-10-29 | Événements à choix en mode Chronique : délai de 12 h, puis option par défaut. | 7.7.1 |
| D-69 | 2026-10-29 | Téléphone : mode consultation en v1, interface adaptable dès le départ, tout faire sur téléphone à terme. | 7.9 |
| D-70 | 2026-10-29 | v1 en français, textes externalisés, sans son. | 7.10, 7.11 |
| D-71 | 2026-10-29 | 4 actions depuis la fiche d'un aventurier : exclure, plafond de crédit, offre de rétention, Panthéon. | 7.5.2 |
| D-72 | 2026-10-29 | TypeScript. Cœur de simulation sans dépendance, en tâche de fond. Interface Svelte ou Preact. Vue en coupe et carte en Canvas (PixiJS). | 8.1 |
| D-73 | 2026-10-29 | Simulation déterministe à graine, avec un flux aléatoire par système. Actions du joueur sous forme de commandes. | 8.3 |
| D-74 | 2026-10-29 | Contenus et paramètres d'équilibrage entièrement pilotés par des fichiers de données. | 8.4, 8.12 |
| D-75 | 2026-10-29 | Sauvegardes dans le navigateur : 3 emplacements, 2 automatiques, export et import de fichier. Pas de synchronisation en v1. | 8.5 |
| D-76 | 2026-10-29 | Site statique gratuit. Service de notifications seulement en v1.1. | 8.7, 8.8 |
| D-77 | 2026-10-29 | Simulateur d'équilibrage avec joueur-robot, mode développeur, tests de déterminisme et de rattrapage. | 8.10 |
| D-78 | 2026-10-29 | Objectifs de performance : tick < 5 ms, rattrapage de 7 jours < 2 s. | 8.9 |
| D-79 | 2026-10-29 | Développement en 4 tranches jouables, en commençant par *Le Bourg et la Forêt*. | 8.11 |
| D-80 | 2026-10-29 | Petits boulots en ville sur un panneau séparé du tableau, avec leur propre génération quotidienne. Plus de quêtes de combat générées. | 4.3.2, 4.3.4 |
| D-81 | 2026-10-29 | Le moral revient vers 50 de 15 % de l'écart par jour (au moins 2 points). | 3.5 |
| D-82 | 2026-10-29 | Départ en quête à 07h, après le petit-déjeuner. Seuils d'abandon abaissés. | 4.5.3, 4.6.3 |
| D-83 | 2026-10-29 | Facteur de difficulté perçue de 0,5 dans l'évaluation du risque. | 4.5.1 |
| D-84 | 2026-10-29 | Vue en coupe en Canvas 2D natif (PixiJS seulement si nécessaire). | 8.1 |
| D-85 | 2026-10-29 | Estimation du risque de Lanchester avec un facteur de prudence de 2. Le facteur de difficulté perçue de 0,5 disparaît. | 4.5.1 |
| D-86 | 2026-10-29 | Infection à 30 % toutes les 48 h ; mort critique après 48 h, 15 % par jour. | 1.8.1 |
| D-87 | 2026-10-29 | L'infirmerie de niveau 1 à 3 stabilise les cas critiques (ramenés à Sérieux). Crédit de soins à 10 po par défaut. | 1.8.3, 1.8.5 |
| D-88 | 2026-10-29 | Retraite en combat dès qu'un membre est à moins de 25 % de PV sans potion ni Clerc. Abandon pour blessures à 60 / 45 / 30 % selon le profil du chef. | 4.6.3 |
| D-89 | 2026-10-29 | Extermination payée Base × 0,1 par tête, sur 12 à 36 h. | 4.3.3 |
| D-90 | 2026-10-29 | Un élève peut arriver avec une heure de retard à une séance d'entraînement. | 1.7.3 |
| D-91 | 2026-10-29 | Le greffier écarte 85 % des quêtes hors de portée de la guilde. Les exterminations et les primes ne comptent plus dans la taille du tableau. | 4.3.2, 4.3.4 |
| D-92 | 2026-10-29 | L'offre de quêtes et de petits boulots grandit avec le nombre d'aventuriers (+0,2 et +0,1 par aventurier). | 4.3.2 |
| D-93 | 2026-10-29 | Récompenses des rangs E à S relevées d'environ 50 %. Le rang F ne change pas. | 1.1.2, 4.3.3 |
| D-94 | 2026-10-29 | Provisions de l'échoppe de la ville (×1,4) quand le réfectoire ne vend pas de paniers. Gibier mangé au camp. Objectif atteint au retour = quête réussie. | 4.5.3, 4.6.3 |
| D-95 | 2026-10-29 | Entretien des bâtiments à 1,5 % de leur valeur par semaine. | 1.1.3 |
| D-96 | 2026-10-29 | Sauvegardes d'une version précédente refusées pendant le développement (pas de migration avant la v1.0). | 8.5 |
| D-97 | 2026-10-29 | Événements décrits en données : modificateurs génériques + actions nommées. 27 événements au catalogue. | 5.4.2 |
| D-98 | 2026-10-29 | Une décision met le jeu en pause en Classique ; le délai de 12 h s'applique aussi si le joueur relance le temps. | 7.7.1 |
| D-99 | 2026-10-29 | Rumeurs inexactes : moitié fausses alertes, moitié détails faux. | 5.4.5 |
| D-100 | 2026-10-29 | Le Forgeron et le Collectionneur suivent le palier de la ville, plus la Prospérité du jour. Quêtes nobles à 15 % au palier Ville. | 5.3 |
| D-101 | 2026-10-29 | La Renommée en points arrive en tranche 3 (pour les rivales). Départ à 20. Expirations : demi-pénalité, rang de base seulement. | 6.1.1 |
| D-102 | 2026-10-29 | Rivales : départ 35 et 20 points, prise de quêtes proportionnelle à la renommée, part des recrues en racine du rapport d'attrait. | 5.5 |
| D-103 | 2026-10-29 | Assaut : préparation en 4 options, vagues proportionnelles au nombre de défenseurs, 28 jours entre deux assauts. | 5.6 |
| D-104 | 2026-10-29 | Personnel malade absent 3 jours ; épidémie possible au retour du Marais (15 %). | 5.7 |
| D-105 | 2026-10-29 | Mode Chronique : horloge à ancre, sauvegarde horaire et à la mise en arrière-plan, sommeil au-delà de 7 jours. | 8.6 |
| D-106 | 2026-10-29 | Carte régionale en SVG, routes directes ville → zone. Chroniques avec courbes Danger / Prospérité. | 7.5.6, 7.5.7 |
| D-107 | 2026-10-29 | Sceaux : vérification chaque matin, héraut le lendemain à 08h. Les niveaux 4 et 5 des salles, les plafonds de prêt et le niveau des professeurs suivent le sceau. | 6.2 |
| D-108 | 2026-10-29 | Prêteurs : échéances de 56 et 28 jours, intérêts ajoutés à la dette, retards punis en renommée. Un emprunt n'est pas un revenu. | 1.1.3 |
| D-109 | 2026-10-29 | 33 hauts faits (dont 4 de sceau). Hauts faits et Panthéon gardés dans le navigateur, hors des sauvegardes. | 6.3, 6.7 |
| D-110 | 2026-10-29 | Gaspard : 13 déclencheurs, encart non bloquant, réglage enregistré avec la partie. | 6.4 |
| D-111 | 2026-10-29 | Livre de la guilde alimenté par les faits critiques du journal et les records de saison ; export en Markdown. | 6.9 |
| D-112 | 2026-10-29 | Mode consultation automatique sous 640 px, avec un écran Résumé et des actions rapides. | 7.9 |
| D-113 | 2026-10-29 | Application installable : manifeste, service worker (cache puis rafraîchissement), notifications seulement hors premier plan, chemins relatifs. | 8.7 |
| D-114 | 2026-10-29 | Reportés après la v1.0 : textes de l'interface dans des fichiers séparés, difficulté personnalisée, rééquilibrage du rythme et des revenus. | 6.5, 7.10, 1.13 |
| D-115 | 2026-10-29 | Titre du jeu : *Warden of Heroes* (« le gardien des héros », qui veille sur eux sans les commander). Aucun jeu de ce nom sur Steam, itch.io, l'App Store ou Google Play ; wardenofheroes.com et wardenofheroes.fr libres à cette date. Identifiants internes (base du navigateur, format des sauvegardes) inchangés. | 0 |

### Relecture de cohérence (v1.0)

Corrections apportées lors de la relecture finale :
- Ajout des **aménagements du siège** (Resserre, Salle froide, Mur du Souvenir) en 1.2.
- **Qualité Q** définie pour le terrain (1.7.3) et l'infirmerie (1.8.3), pour que leur prix de référence soit calculable.
- **Arène :** recette et effets précisés (1.7.4).
- **Stratège :** il entraîne la compétence Cohésion. La **Cohésion d'équipe** a désormais une formule (3.11.3).
- **Difficulté d'une quête** définie dans la même unité que la Puissance d'équipe, avec un exemple chiffré (4.5.1).
- **États (1.8.1) :** les causes renvoient uniquement aux monstres du bestiaire (plus de « bandits » ni de « géants »).
- **Bilan comptable (1.11) :** ajout des rachats de dépouilles, des primes, des amendes, des legs et des remboursements de crédit.
- **Compétence d'arme** précisée pour chaque classe (3.3).
- **Renommée (6.1) :** ajout des effets des aventuriers mécontents, de l'arène, des contrats échoués et d'une fiscalité basse.
- Nouvel événement *Gourmet de passage*, pour donner un effet concret au réfectoire de niveau 5.
- L'or des gobelins revient à l'aventurier et non à la guilde. Les coffres verrouillés ne renvoient plus à un système de vol inexistant.
- Les renvois vagues (« voir chapitre X ») sont remplacés par des numéros de section précis.
