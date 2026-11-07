# Seconde Vie

- La démo hébergée et `demo/` représentent la même interface. Après une modification publiée, synchroniser les sources correspondantes et les ressources nécessaires dans ce dépôt GitHub avant de déclarer le travail terminé.
- Préserver le serveur PostgreSQL à la racine ; ses API restent distinctes de celles simulées dans `demo/public/demo-api.js`.
- Ne jamais ajouter de clés API, de fichiers `.env` réels, de jetons ou de données utilisateurs au dépôt.
- Les profils de la démonstration `?demo=1` et leurs données doivent rester fictifs et locaux. L’espace partagé utilise l’identité Sites et des permissions serveur ; ne pas confondre les deux modes. Préserver les migrations appliquées, les données D1/R2, les accès du Site et les identifiants d’espace. Le relais en caisse ne remplace pas une authentification de terminal sécurisé.
- Exécuter `npm test` et `npm --prefix demo test` pour une modification des parcours ou des droits ; construire la démo avec `npm --prefix demo run build` avant publication.
