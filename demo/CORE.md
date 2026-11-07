# Socle commun et modules

La V1 est destinée aux ressourceries et recycleries. Le socle est commun à leurs postes : réception des dons, tri, stock et sorties. Les modules ajoutent des outils selon leur fonctionnement. Toute nouvelle fonction doit répondre à un besoin concret d’une ressourcerie. Une architecture réutilisable ne signifie pas une offre destinée à tous les commerces.

## Périmètre du socle

| Domaine | Inclus |
| --- | --- |
| Structure | Nom de la ressourcerie, pays, devise, formats régionaux, fuseau horaire et provenances personnalisables |
| Sites | Plusieurs sites et zones, catégories acceptées par site, catégories personnalisées |
| Personnes | Comptes individuels, membres actifs/inactifs, fonctions cumulables, accès vérifié par le serveur |
| Contacts | Donateurs, clients, fournisseurs et partenaires, association à une entrée sans ressaisie |
| Objets | Objets uniques et lots, quantité et poids, code interne, code fabricant, photos et caractéristiques par catégorie |
| Stock | Recherche, emplacement, contrôles, transferts et réceptions partielles, sorties et historique nominatif |
| Terrain | Scan caméra ou douchette, étiquettes code-barres et QR, saisie en série, brouillons par personne et site |
| Suivi des flux | Entrées, réemploi, ventes, dons, recyclage et déchèterie ; quantités, poids enregistrés et export CSV de travail |
| Données | Base partagée, versions des fiches, conflits explicites, opérations idempotentes, journal, export et restauration |

Les informations ne sont saisies qu’une fois. Les modules réutilisent les mêmes identifiants d’objet, contact, membre et site. Désactiver un module conserve ses données.

## Modules

| Module activable | Périmètre actuel |
| --- | --- |
| Atelier de réparation | Interventions et temps passé dans l’historique de la fiche objet |
| Collectes et livraisons | Tournées, étapes, créneaux et statut |
| Planning de l’équipe | Créneaux des salariés et bénévoles |
| Caisse interne | Panier, ventes, tickets et attribution à un opérateur ; ne remplace pas une caisse validée |
| Sélection pour la vitrine | Sélection interne des objets prêts, sans publication e-commerce |

La réception des dons, les contacts donateurs et les rapports de flux restent inclus sans activer de module. Les permissions individuelles restent nécessaires. Désactiver un outil masque ses actions et refuse leurs appels API, tout en conservant les données. Les anciens réglages contenant le module `rapports` restent importables ; le suivi des flux appartient désormais au socle.

À qualifier avec les ressourceries pilotes avant développement : connecteurs Shopify/WooCommerce, administration des adhérents, justificatifs de dons, devis/facturation et rapports spécifiques aux organismes. Aucune synchronisation e-commerce n’est annoncée opérationnelle.

Hors périmètre de la V1 : achat-revente, dépôt-vente et commissions, besoins spécifiques des grandes enseignes et constructeur universel de parcours. Les champs historiques de type de structure sont conservés pour compatibilité, sans choix commercial générique dans l’interface. Le développement international doit d’abord viser le même métier dans d’autres pays ; la traduction complète reste à faire.

## Architecture de cette version

- `public/domain.js` contient les règles communes à la démonstration locale et au serveur, avec un contexte de stockage injecté.
- `worker/core.mjs` vérifie l’identité fournie par Sites et l’appartenance à la structure à chaque opération. Les droits sont relus à chaque requête.
- D1 stocke des enregistrements séparés par structure et type. Une transaction compare la révision avant d’écrire les seules fiches modifiées. Une révision de fiche empêche également l’écrasement d’un formulaire ancien après la lecture d’une autre ressource.
- Les photos d’objets sont dans R2, servies par une route qui contrôle l’appartenance à la structure. Les sauvegardes JSON contiennent leurs références ; elles ne sont pas une archive autonome des fichiers image.
- Le nonce d’une opération empêche sa répétition après une coupure réseau. Il reste disponible pour une reprise identique jusqu’à réception de la réponse.
- La synchronisation vérifie les changements toutes les dix secondes lorsque l’onglet est visible. Un formulaire modifié ou une fenêtre ouverte est conservé et l’interface propose d’actualiser. Les brouillons de réception restent propres au poste, à la personne et au site.
- Une restauration conserve les membres et leurs droits, valide les liens métier et copie l’état précédent dans une version récupérable.

## Accès et limites

L’accès hébergé du Site est actuellement privé. Ajouter un membre dans Équipe ne lui accorde pas à lui seul l’accès au Site : son compte doit également être autorisé dans les paramètres de partage. L’interface utilise les comptes ChatGPT/Sites ; aucun mot de passe de production n’est stocké dans le navigateur.

Le relais en caisse attribue une vente à un opérateur autorisé. Il n’est pas une nouvelle authentification et ne transforme pas un compte Responsable en terminal sécurisé sans accès à son compte principal. Les droits individuels par site et l’administration d’un grand réseau restent à développer.

L’interface est en français. Les formats régionaux et la devise sont paramétrables ; une traduction complète n’est pas livrée. Les libellés d’état et le moteur de parcours restent contrôlés (à trier, à vérifier, prêt, transit, sorti) ; cette version n’est pas un constructeur arbitraire de workflows.

La démonstration `/?demo=1` conserve les exemples fictifs et le stockage local. L’application `/` ouvre un espace partagé vide. Aucun import automatique de l’ancien navigateur n’est effectué.

Les tests utilisent le même moteur de règles et les mêmes migrations SQL dans SQLite pour simuler D1, avec un adaptateur de fichiers pour R2. Ils ne constituent pas une validation de charge, de tous les navigateurs, des matériels physiques, des obligations de caisse ou d’un usage en production par une grande enseigne.

## Développement

Node.js 24 est requis pour le simulateur SQLite local : `npm ci`, `npm test`, `npm run dev` et `npm run build`.
Le simulateur conserve ses données dans `.local/`, ignoré par Git. L’identité fictive n’est injectée que par `scripts/dev.mjs`, jamais par le Worker de production.
Les migrations de `drizzle/` sont appliquées à la publication. Après application, ajouter une nouvelle migration sans modifier l’historique.
