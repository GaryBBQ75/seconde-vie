# Seconde Vie · Gestion de ressourcerie

Application hébergée : https://seconde-vie-atelier.gary-legrill.chatgpt.site/.
Démonstration fictive et locale : https://seconde-vie-atelier.gary-legrill.chatgpt.site/?demo=1.

Voir [le périmètre du socle et des modules](CORE.md) pour les fonctions, les accès et les limites.

## Développement

Node.js 24 ou supérieur : `npm ci`, `npm test`, `npm run dev` et `npm run build`.
Ouvrir http://localhost:4173. Le simulateur SQLite conserve ses données dans `.local/`, ignoré par Git. Son identité fictive est injectée uniquement par le serveur de développement. Le Worker de production utilise l’identité fournie par Sites et les autorisations serveur.

La construction regroupe le Worker en un module ESM et copie les ressources client. `.openai/hosting.json` déclare D1 (`DB`) et R2 (`BUCKET`). Les migrations SQL versionnées de `drizzle/` s’appliquent à la publication.

`public/domain.js` contient les règles communes ; `public/demo-api.js` les adapte au stockage local de la démonstration ; `worker/core.mjs` les applique aux données partagées. Les photos sont servies par une route protégée par structure.

La V1 vise les ressourceries et recycleries. Réception des dons, donateurs, tri, stock, étiquettes et suivi des flux font partie du socle. Atelier, collectes, planning, caisse et sélection pour la vitrine sont activables séparément. Les champs de réception, les provenances et les formats se règlent dans l’application ; catégories et emplacements se règlent par site. Le relais en caisse attribue les ventes sans être une nouvelle authentification du terminal. Les connecteurs e-commerce restent à qualifier ; achat-revente et dépôt-vente sont hors périmètre de la V1.

Les sauvegardes JSON portent sur l’espace courant. Une restauration conserve les comptes et leurs droits, et crée une version récupérable des données précédentes. Les photos restent dans R2 : le JSON n’est pas une archive autonome des images.

Les clés facultatives de recherche restent dans l’environnement serveur. Leurs noms sont documentés dans `.env.example`. Les bibliothèques de scan, OCR et reconnaissance locale, leurs modèles et licences sont dans `public/vendor/`. Les six ressources tierces volumineuses sont restaurées par `npm run build` à partir des adresses publiques versionnées dans `scripts/vendor-assets.json`, avec vérification SHA-256. Pour lancer le développement depuis un clone GitHub vierge, exécuter d’abord `node --use-env-proxy scripts/vendor-assets.mjs`. Les ressources sont ensuite servies localement par l’application. Une saisie manuelle reste disponible.

Dans GitHub, cette application reste dans `demo/` pour préserver l’historique et le serveur PostgreSQL initial à la racine. Ses API sont indépendantes.
