# Seconde Vie

Prototype de back-office web pour les ressourceries et recycleries. Le parcours pilote couvre la réception, le tri, le stock, les transferts entre lieux et les sorties.

## Essayer la démonstration

Avec Node.js 22 ou supérieur.

```sh
npm ci
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000) et choisissez **Entrer dans la démo**. Les exemples et vos modifications persistent dans `data/postgres`. Pour une seconde démonstration indépendante, utilisez un nouveau répertoire via `DB_DIR`.

1. Enregistrez un carton de livres comme lot, en quantité ou en poids. Vous pouvez donner un nom, ajouter une photo ou laisser ces champs vides.
2. Ouvrez le lot depuis le stock et isolez un objet si vous souhaitez le suivre séparément.
3. Sur sa fiche, imprimez une étiquette et retrouvez-la par son QR ou par sa référence. La caméra nécessite HTTPS ou localhost et une autorisation du navigateur.
4. Placez l’objet en contrôle, validez le tri ou déplacez-le vers une autre zone. Pour changer de site, marquez le transfert au départ et confirmez à l’arrivée les fiches effectivement reçues.
5. Enregistrez une sortie pour vente, don ou recyclage. L’historique de la fiche conserve l’auteur et la date.

Le rôle Responsable ajoute les membres, cumule leurs fonctions, crée les sites et prépare les créneaux. Le scan d’un ISBN inconnu peut préremplir le titre depuis le [Catalogue général de la BnF](https://api.bnf.fr/fr/api-sru-catalogue-general). La saisie manuelle reste disponible.

## Explorer les versions

- **Application serveur** à la racine. Back-office Node.js et PostgreSQL.
- **[Démo web actuelle](demo/)**. Interface publiée : `cd demo && npm run dev`, puis ouvrir [http://localhost:4173](http://localhost:4173). Elle inclut un espace partagé avec identité et droits serveur. Le mode `?demo=1` conserve des exemples fictifs dans le navigateur. Node.js 24 est requis pour cette application.
- **[Six parcours UX](prototypes/six-parcours.html)**. Télécharger le fichier HTML et l’ouvrir dans un navigateur pour comparer les parcours avec des données d’exemple.
- **[Brief UX pour Claude](docs/Seconde_Vie_Brief_Claude.pdf)**. Contexte du produit et scénarios communs pour comparer de nouvelles propositions.

## Déployer sur Coolify

Le déploiement initial utilise une instance de l’application par structure. Une structure peut gérer plusieurs sites et leurs zones dans la même base.

1. Dans Coolify, ajoutez une application depuis le dépôt GitHub et choisissez **Docker Compose** avec `/compose.yaml` à la racine.
2. Renseignez `POSTGRES_PASSWORD` avec un secret compatible URL, par exemple la sortie locale de `openssl rand -hex 24`. Renseignez `ADMIN_EMAIL` et `ADMIN_PASSWORD` (12 caractères minimum). Les deux champs administrateur servent à la première initialisation. `ADMIN_NAME` et `ORGANISATION_NAME` sont facultatifs.
3. Associez le domaine HTTPS au service `app` sur le port interne `3000`. Le service `db` reste sur le réseau interne. Consultez les journaux et vérifiez `/health` après le déploiement.
4. Avant un pilote avec des données réelles, programmez une sauvegarde PostgreSQL chiffrée et externe au serveur, puis testez sa restauration sur une instance séparée. Le volume contient également les photos.

[Documentation Docker Compose de Coolify](https://coolify.io/docs/applications/builds/docker-compose)

## Tests et périmètre

`npm test` utilise PostgreSQL embarqué par défaut. Pour tester contre un serveur PostgreSQL, utilisez `TEST_DATABASE_URL` pointant vers une base de test vide dédiée. GitHub Actions définit cette base pour les tests de chaque exécution.

Le CSV porte sur les fiches de stock. Une sortie pour vente met à jour le stock. Le pilote prévoit encore de valider la reprise des données, les exports de tonnages par période, le changement rapide de profil sur tablette partagée et la connexion à une caisse existante. La reconnaissance visuelle, la facturation et la synchronisation hors ligne sont des sujets distincts à qualifier en entretien.

Le code est structuré pour un déploiement autonome. Le choix d’une licence open source reste à décider. La visibilité du dépôt ne vaut pas attribution d’une licence.

Voir [l’estimation France](MARCHE-FRANCE.md).

## État au 7 novembre 2026

La V1 vise les ressourceries et recycleries. Atelier, collectes, planning, caisse et sélection vitrine sont optionnels ; réception des dons, stock, tri et rapports de flux restent inclus. Achat-revente, dépôt-vente et grandes enseignes restent hors périmètre.

La version fonctionnelle la plus récente est dans `demo/`, synchronisée avec le Site. Elle dispose désormais d’un socle partagé D1/R2 et d’une démonstration locale séparée (`?demo=1`). Voir [le périmètre du socle et des modules](demo/CORE.md). Le serveur PostgreSQL à la racine constitue une première base indépendante ; ses fonctionnalités ne sont pas encore au même niveau que la démo. Il ne faut pas remplacer son interface par celle de la démo en supposant les API compatibles.

Les tests incluent les accès, la séparation de structures, l’administration, les lots, les transferts et la caisse. Voir [la revue fonctionnelle et la comparaison](docs/REVUE-2026-11-07.md).
