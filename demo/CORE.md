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
| Reprise de stock | Modèle CSV, aperçu de 200 lignes maximum, contrôle des catégories et zones, dédoublonnage par référence externe, import atomique réservé au responsable |

Les informations ne sont saisies qu’une fois. Les modules réutilisent les mêmes identifiants d’objet, contact, membre et site. Désactiver un module conserve ses données.

## Modules

| Module activable | Périmètre actuel |
| --- | --- |
| Atelier de réparation | Interventions et temps passé dans l’historique de la fiche objet |
| Collectes et livraisons | Tournées, étapes, créneaux et statut |
| Planning de l’équipe | Semaine, vue par personne et liste, affectation collective, répétition et copie de semaine, brouillons et publication, réponses personnelles et disponibilités |
| Caisse interne | Ouverture par site, fond initial, ventes, mouvements d’espèces, comptage, écart motivé et clôture figée ; annulation ou remboursement intégral tracé avec retour des objets au contrôle |
| Sélection pour la vitrine | Sélection interne des objets prêts, sans publication e-commerce |
| Devis et factures | Brouillons, mentions de la structure, émission numérotée et figée, conversion d’un devis, règlements, avoir intégral, remboursement enregistré, impression/PDF navigateur et CSV |
| Adhésions et cotisations | Contacts communs, périodes sans chevauchement, renouvellement, montant reçu, moyen et date, annulation motivée et CSV |

La réception des dons, les contacts donateurs et les rapports de flux restent inclus sans activer de module. Les permissions individuelles restent nécessaires. Désactiver un outil masque ses actions et refuse leurs appels API, tout en conservant les données. Les anciens réglages contenant le module `rapports` restent importables ; le suivi des flux appartient désormais au socle.

À qualifier avec les ressourceries pilotes : connecteurs Shopify/WooCommerce, justificatifs de dons, transmission des factures électroniques et rapports spécifiques aux organismes. Aucune synchronisation e-commerce ou transmission électronique des factures n’est annoncée opérationnelle.

### Caisse et administration de la V1

Une session de caisse est ouverte par site, partagée entre les opérateurs autorisés. Les ventes de l’espace partagé nécessitent une caisse ouverte. Les mouvements et remboursements en espèces entrent dans le comptage attendu ; un écart doit être expliqué. Les clôtures restent figées. La correction d’une vente conserve le ticket d’origine, exige une confirmation du remboursement déjà effectué, et ne réintègre que les objets physiquement retournés et encore rattachés à cette vente. Les rapports et CSV affichent les remboursements séparément et calculent les recettes nettes. Aucun ordre bancaire n’est déclenché.

Le rôle Administration donne accès aux documents, contacts et adhésions, sans donner accès à la caisse. Les lignes de facture utilisent des prix HT, des quantités entières et un taux de TVA par ligne ; les calculs restent en centimes. Les coordonnées et mentions du vendeur sont copiées lors de l’émission. Les numéros suivent des séquences par type et année ; les écritures concurrentes restent soumises au verrou de révision. Une facture émise se corrige par un avoir, jamais par écrasement.

Les règlements et remboursements de factures sont un suivi de sommes déjà reçues ou versées. Ils ne créent pas un deuxième mouvement dans la caisse interne. Une cotisation est également un enregistrement administratif distinct ; le responsable doit rapprocher ces opérations avec ses encaissements réels. Les documents ne réservent pas et ne sortent pas automatiquement les objets du stock.

Une restauration ne peut pas modifier les ventes, sessions de caisse, remboursements, documents ou cotisations de l’espace. Les sauvegardes précédentes restent lisibles ; une version qui modifierait ces journaux est refusée. Les corrections passent par leurs actions métier.

Limites explicites : remboursements de tickets et avoirs intégraux, pas de ventilation partielle ; une session par site ; pas de TVA sur marge, de transmission à une plateforme de facturation électronique, de rapprochement bancaire automatique ou de certification fiscale. Les mentions de facturation doivent être adaptées au régime et aux biens de la structure avant usage réel. Références officielles consultées le 7 novembre 2026 : [Bercy](https://www.economie.gouv.fr/entreprises/gerer-son-entreprise-au-quotidien/gerer-sa-comptabilite-et-ses-demarches/mentions-obligatoires-dune-facture-tout-savoir), [Service Public](https://www.service-public.gouv.fr/entreprendre/vosdroits/F31808).

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


## Planning : responsable et équipe

La coordination dispose d’une vue hebdomadaire, d’une vue par personne et d’une liste. Les filtres de site, de personne et de poste restent explicites. Les créneaux peuvent être affectés à plusieurs membres, répétés jusqu’à huit semaines et copiés vers la semaine suivante en brouillons. Une collision entre sites ou une indisponibilité bloque l’opération entière ; une dérogation doit être expliquée. La publication de la sélection rend les brouillons visibles aux personnes concernées.

Le rôle Coordination du planning permet de gérer ces affectations et de lire les déclarations sans donner accès à l’administration des comptes. Chaque membre dispose de ses créneaux, peut confirmer sa présence ou signaler un empêchement, et déclarer ses disponibilités ou indisponibilités. La coordination voit ces réponses ; un signalement n’annule pas automatiquement une affectation. Une modification d’horaire, de site, de personne ou de poste demande une nouvelle confirmation.

La vue Équipe ne contient que les créneaux publiés et leurs informations pratiques. Les notes de disponibilité, messages de réponse, brouillons et motifs de dérogation restent réservés à la personne concernée et/ou à la coordination suivant leur usage. Les annulations sont conservées dans l’historique et restent visibles dans le planning personnel.

Les saisies utilisent le fuseau de la structure, affiché dans l’interface. Une copie de semaine conserve l’heure locale lors d’un changement d’heure. Les heures inexistantes ou ambiguës doivent être corrigées. L’export personnel `.ics` contient la semaine choisie et les annulations avec un identifiant stable ; il s’agit d’un import ponctuel, sans synchronisation ou notification externe automatique. Les durées affichées sont des heures prévues, pas un suivi du temps de travail réalisé.

## Accès direct pendant les tests

L’entrée `/?demo=1#planning` présente les profils fictifs en un clic, responsable compris, sans mot de passe ni code. Le changement de profil conserve la page si le nouveau rôle y a accès. Les données de démonstration restent dans le navigateur. Les anciens formulaires API à code restent compatibles pour les tests existants ; ils ne sont plus requis par l’interface de démonstration.

Cet accès direct n’est pas une authentification de production. L’espace partagé `/` utilise toujours l’identité Sites et ses permissions serveur. Son audience est préservée et aucun profil de démonstration ne donne accès aux données D1/R2.
