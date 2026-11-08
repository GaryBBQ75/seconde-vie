# Seconde Vie — Présentation et catalogues publics

Site public distinct de l’espace privé de gestion. La racine présente l’app avec un aperçu interactif : scan central, quatre étapes, mouvement du fond, navigation clavier et pause / réduction des animations. Les écrans du hero sont des exemples illustratifs, pas une session métier.

Le lien `/catalogue.html?r=<id-espace>` affiche uniquement le catalogue choisi par une ressourcerie. Recherche, catégories, boutiques, tri par prix, détail et galerie mobile. Pas de panier, réservation ou commande dans cette version.

Les données publiques sont publiées depuis le module Catalogue de l’espace privé. Elles sont sauvegardées dans R2. `CATALOGUE_WRITE_KEY` est un secret de serveur, configuré aussi dans l’application de gestion ; aucune valeur ne doit être ajoutée au code ni aux exemples de configuration. Toutes les écritures sont authentifiées. Les lectures publiques ne contiennent ni donateur, ni notes internes, ni historique, ni identifiants marchands. Aucune liste de structures n’est exposée. Les images ne sont lisibles que si elles appartiennent encore à un produit affiché dans le catalogue courant. Le retrait d’un produit retire son image du catalogue accessible.

L’application de gestion sérialise les publications par espace et envoie sa révision ; une publication d’une révision plus ancienne est refusée. Les photos sont transférées côté serveur et nommées par leur empreinte SHA-256. Les pages publiques ne reçoivent aucune clé. Les publications nouvelles sont volontairement vides tant que le responsable n’a pas activé son catalogue.

Photo d’ambiance : fichier `photo-1613837233238-c1e78d8b8f07`, attribué à Unsplash, trouvé sur https://signsandmirrors.com/blogs/informational/thrift-store-names ; ressource https://cdn.shopify.com/s/files/1/0706/5754/0311/files/photo-1613837233238-c1e78d8b8f07_1024x1024.avif . Aucun visuel de stock ou photo personnelle n’est intégré à la présentation.

`npm test` vérifie l’isolation des catalogues, les écritures, le filtrage des champs, les retraits et les versions. `npm run build` prépare le Worker et les ressources. `npm run dev` sert l’aperçu local ; `.local` n’est ni exporté ni déployé.

La photo d’ambiance publiée est réencodée via le même optimiseur que les produits (JPEG, 138 Ko, sans métadonnées EXIF). Le fichier tiers d’origine et ses métadonnées ne sont pas synchronisés.
