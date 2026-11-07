# Recette pilote — Seconde Vie

La V1 vise les ressourceries et recycleries. L’espace partagé utilise l’identité Sites et une base D1/R2. Le mode `?demo=1` reste fictif et local. Le serveur PostgreSQL initial à la racine est préservé et indépendant.

## Préparer un espace

1. Créer l’espace et les sites/zones.
2. Créer les membres avec leur adresse de compte et leurs fonctions. Les autoriser également dans le partage du Site ; le rôle métier seul ne suffit pas à ouvrir un Site privé.
3. Activer uniquement les outils utilisés dans Réglages. Le suivi des dons, lots, stocks et flux est toujours inclus.
4. Pour les documents, renseigner les coordonnées et mentions de facturation, les contacts clients avec adresse et l’identification des clients professionnels.

## Parcours vérifiés automatiquement

| Parcours | Résultat attendu |
| --- | --- |
| Caisse fermée | Vente refusée ; ouverture du site requise |
| Deux ouvertures du même site | Seconde ouverture refusée |
| Vente et mouvements d’espèces | Montant attendu calculé avec fond, espèces reçues nettes et mouvements |
| Clôture avec écart | Note requise ; comptage et clôture figés |
| Remboursement intégral | Ticket conservé ; une seule correction ; retour physique au contrôle sur sélection |
| Répétition réseau | Aucune seconde vente ou seconde correction |
| Document incomplet | Émission refusée avec message sur les mentions manquantes |
| Facture émise | Lignes et mentions figées ; correction par avoir |
| Deux émissions concurrentes | Une écriture acceptée ; reprise de l’autre sans collision de numéros |
| Devis facturé | Une seule conversion par devis |
| Règlement supérieur au solde | Refus sans modification |
| Adhésion chevauchante | Refus ; renouvellement sur une autre période possible |
| CSV invalide | Aperçu des erreurs ; aucune création partielle |
| Référence externe déjà importée | Ligne ignorée, aucune fiche dupliquée |
| Module inactif ou rôle manquant | Action et lecture refusées côté serveur |
| Restauration d’un journal financier ancien | Refus ; corrections métier obligatoires |

Commandes : `npm test`, `npm --prefix demo test`, `npm --prefix demo run build`. Les 50 tests racine comprennent 49 tests de l’application hébergée et une intégration du serveur PostgreSQL initial.

## Vérification visuelle locale réalisée

Activation des trois modules, ouverture et clôture d’une caisse de 50 euros sans écart, création et réouverture d’un devis de 12 euros, création d’une adhésion active de 10 euros. Les exemples ne sont pas des données de production.

## Validation terrain encore nécessaire

- Scan sur les Android anciens utilisés par l’équipe, douchette et impression d’étiquettes sur les imprimantes réelles.
- Relais des opérateurs sur le poste, connexion depuis plusieurs appareils et réaction aux coupures réseau réelles.
- Comptage de fin de journée et rapprochement des paiements effectivement encaissés.
- Vérification des mentions, du régime de TVA et des besoins de conservation/facturation propres à la structure.

Les écritures de règlement, remboursement ou cotisation sont un suivi administratif d’opérations déjà réalisées. Aucun paiement bancaire ni remboursement bancaire n’est déclenché. Les cotisations et règlements de factures ne créent pas automatiquement un mouvement dans la caisse interne. Les documents ne modifient pas le stock. Les rapprochements doivent donc être réalisés par le responsable avant utilisation réelle.

## Périmètre différé

TVA sur marge, transmission des factures à une plateforme agréée, certification fiscale de caisse, remboursements et avoirs partiels, plusieurs tiroirs par site, connecteurs e-commerce et exports normés propres à chaque organisme. La V1 ne doit pas être présentée comme validée sur ces fonctions.
