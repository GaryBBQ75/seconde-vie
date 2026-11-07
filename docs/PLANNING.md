# Planning : responsable et équipe

## Tester sans mot de passe

Ouvrir `https://seconde-vie-atelier.gary-legrill.chatgpt.site/?demo=1#planning` et choisir un profil fictif en un clic. Le responsable et les profils terrain ne demandent plus de code ou de mot de passe dans cette démonstration. Changer de profil conserve la page autorisée. Les données restent locales au navigateur ; ce mode n’ouvre aucun accès à l’espace partagé ou aux données réelles. L’audience du Site reste inchangée.

## Responsable et coordination

- Vue hebdomadaire, par personne ou liste, navigation de semaine et filtres site/personne/poste.
- Affectation collective et répétition jusqu’à huit semaines (200 créneaux maximum par opération).
- Préparation en brouillons, puis publication de la sélection filtrée.
- Copie de tous les créneaux actifs de la semaine et du site sélectionné vers la semaine suivante, en brouillons.
- Modification et annulation tracées ; nouvelle confirmation après changement d’horaire, de site, de personne ou de poste.
- Collision entre sites et indisponibilité bloquantes, avec dérogation motivée pour cette dernière.
- Consultation des confirmations, empêchements et déclarations personnelles.
- Impression de la sélection ; heures prévues, sans suivi du temps réalisé.

Le rôle Coordination du planning donne ces droits sans donner accès à l’administration des membres ou de la structure.

## Membre de l’équipe

- Prochain créneau et semaine personnelle, avec lecture des consignes.
- Confirmation de présence ou signalement d’un empêchement.
- Disponibilités et indisponibilités, répétition facultative et message à la coordination.
- Lecture de l’équipe publiée, sans accès aux brouillons ni aux messages privés des collègues.
- Annulations visibles et agenda `.ics` de la semaine choisie.

Une déclaration ne supprime pas une affectation. Un empêchement doit être traité par la coordination. Les messages de réponse et les notes de disponibilité ne sont visibles que par leur auteur et la coordination ; les motifs de dérogation restent réservés à la coordination. L’agenda est un export ponctuel, sans synchronisation ni notification externe automatique.

## Dates et intégrité

Les horaires sont saisis dans le fuseau de la structure et les copies conservent l’heure locale lors des changements d’heure. Les saisies inexistantes ou ambiguës sont refusées explicitement. Les opérations collectives échouent entièrement si une collision est rencontrée. Les révisions serveur protègent contre les réponses sur un créneau devenu obsolète.

Les annulations et retraits de disponibilité sont conservés. Les anciennes sauvegardes sans déclarations restent lisibles ; le schéma SQL existant et les journaux financiers sont préservés.

## Vérifications

64 tests à la racine (63 pour l’application hébergée, plus l’intégration PostgreSQL initiale) : brouillons, publication, droits personnels, rôle Coordination, indisponibilités, dérogations, collisions entre sites, répétitions atomiques, copies, réponses devenues obsolètes, annulations, export agenda, changements d’heure, profils sans mot de passe et identifiants de navigateur sans `randomUUID`.

Vérification visuelle locale : responsable choisi sans mot de passe, brouillon affecté à un membre, publication, changement de profil en un clic, confirmation par le membre, déclaration d’une indisponibilité et consultation de cette déclaration par le responsable. Les exemples sont fictifs et restent dans l’aperçu de test. La grille hebdomadaire a été inspectée visuellement ; l’essai sur les téléphones réels reste à réaliser.
