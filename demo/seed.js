export default {
  "config": {
    "demo": true,
    "categories": [
      "Livres",
      "Textile",
      "Vaisselle",
      "Maison et déco",
      "Jeux et jouets",
      "Électrique",
      "Mobilier",
      "Sport et loisirs",
      "Autre"
    ],
    "activities": [
      "Réception",
      "Tri",
      "Atelier",
      "Stock",
      "Caisse",
      "Collecte"
    ]
  },
  "sites": [
    {
      "id": "67e7adce-0bc7-45cc-8674-4a184d7b2d67",
      "org_id": "7c71298c-2ab8-460b-a149-33ebae3106b2",
      "name": "Atelier des Passages",
      "kind": "Réception et tri",
      "zones": [
        {
          "id": "505c437c-417e-47b4-b5f0-c2ec933ddcdd",
          "name": "Atelier"
        },
        {
          "id": "915b3c66-00e7-4cc1-87da-a87a697c51ce",
          "name": "Bac à vérifier"
        },
        {
          "id": "3decfdb6-60ce-42cd-b2b5-83b8ecf201b5",
          "name": "Réception"
        }
      ]
    },
    {
      "id": "92da19c8-23e4-4f5e-aa47-ca9072c3c815",
      "org_id": "7c71298c-2ab8-460b-a149-33ebae3106b2",
      "name": "Boutique du Canal",
      "kind": "Vente",
      "zones": [
        {
          "id": "8bd2ec6d-03bf-46c4-bcf4-3d3603888d44",
          "name": "Rayon"
        },
        {
          "id": "47b0a3d1-ee18-4156-9f19-cd85b45f7ea0",
          "name": "Réserve"
        }
      ]
    },
    {
      "id": "fa88ed38-26b0-423d-8f17-f879d6cb37ae",
      "org_id": "7c71298c-2ab8-460b-a149-33ebae3106b2",
      "name": "Dépôt des Peupliers",
      "kind": "Stockage",
      "zones": [
        {
          "id": "6f4bbe58-5e2d-4bc2-bb17-b0f8724fdf88",
          "name": "Réserve A"
        },
        {
          "id": "099b0d76-4f4f-4dd9-9a7d-43fac99dbd71",
          "name": "Réserve B"
        }
      ]
    }
  ],
  "stock": [
    {
      "id": "3f88b10c-bc29-4b4e-bea4-78e1bdfda7d3",
      "org_id": "7c71298c-2ab8-460b-a149-33ebae3106b2",
      "code": "LOT-470241814B",
      "kind": "lot",
      "title": "Carton de livres",
      "category": "Livres",
      "state": "tri",
      "site_id": "67e7adce-0bc7-45cc-8674-4a184d7b2d67",
      "zone_id": "3decfdb6-60ce-42cd-b2b5-83b8ecf201b5",
      "quantity": 12,
      "grams": null,
      "price_cents": null,
      "parent_id": null,
      "condition": null,
      "origin": "Apport volontaire",
      "note": null,
      "barcode": null,
      "exit_type": null,
      "created_at": "2026-11-06T00:06:21.484Z",
      "site_name": "Atelier des Passages",
      "zone_name": "Réception",
      "has_photo": false,
      "parent_code": null,
      "history": [
        {
          "type": "reception",
          "detail": "Entrée à Atelier des Passages",
          "created_at": "2026-11-06T00:06:21.484Z",
          "name": "Camille Martin"
        }
      ]
    },
    {
      "id": "cb45270d-4c46-441c-be44-f67128953b29",
      "org_id": "7c71298c-2ab8-460b-a149-33ebae3106b2",
      "code": "LOT-E6EB53BDCB",
      "kind": "lot",
      "title": "Vaisselle et tasses",
      "category": "Vaisselle",
      "state": "tri",
      "site_id": "67e7adce-0bc7-45cc-8674-4a184d7b2d67",
      "zone_id": "3decfdb6-60ce-42cd-b2b5-83b8ecf201b5",
      "quantity": null,
      "grams": 7500,
      "price_cents": null,
      "parent_id": null,
      "condition": null,
      "origin": "Apport volontaire",
      "note": null,
      "barcode": null,
      "exit_type": null,
      "created_at": "2026-11-06T00:06:21.484Z",
      "site_name": "Atelier des Passages",
      "zone_name": "Réception",
      "has_photo": false,
      "parent_code": null,
      "history": [
        {
          "type": "reception",
          "detail": "Entrée à Atelier des Passages",
          "created_at": "2026-11-06T00:06:21.484Z",
          "name": "Camille Martin"
        }
      ]
    },
    {
      "id": "bb39e42c-c716-462d-a357-7743f3d9b8f7",
      "org_id": "7c71298c-2ab8-460b-a149-33ebae3106b2",
      "code": "OBJ-03588BDF51",
      "kind": "item",
      "title": "Lampe de table en céramique",
      "category": "Maison et déco",
      "state": "controle",
      "site_id": "67e7adce-0bc7-45cc-8674-4a184d7b2d67",
      "zone_id": "915b3c66-00e7-4cc1-87da-a87a697c51ce",
      "quantity": 1,
      "grams": null,
      "price_cents": null,
      "parent_id": null,
      "condition": null,
      "origin": "Apport volontaire",
      "note": "Vérifier le câble et le pied.",
      "barcode": null,
      "exit_type": null,
      "created_at": "2026-11-06T00:06:21.484Z",
      "site_name": "Atelier des Passages",
      "zone_name": "Bac à vérifier",
      "has_photo": false,
      "parent_code": null,
      "history": [
        {
          "type": "reception",
          "detail": "Entrée à Atelier des Passages",
          "created_at": "2026-11-06T00:06:21.484Z",
          "name": "Camille Martin"
        }
      ]
    },
    {
      "id": "7784a5dd-bf89-484b-a4c7-db4472e75f8b",
      "org_id": "7c71298c-2ab8-460b-a149-33ebae3106b2",
      "code": "OBJ-055025E2A9",
      "kind": "item",
      "title": "Jeu de société — Les Aventuriers du Rail",
      "category": "Jeux et jouets",
      "state": "controle",
      "site_id": "67e7adce-0bc7-45cc-8674-4a184d7b2d67",
      "zone_id": "915b3c66-00e7-4cc1-87da-a87a697c51ce",
      "quantity": 1,
      "grams": null,
      "price_cents": null,
      "parent_id": null,
      "condition": null,
      "origin": "Apport volontaire",
      "note": "Inventorier les pièces.",
      "barcode": null,
      "exit_type": null,
      "created_at": "2026-11-06T00:06:21.484Z",
      "site_name": "Atelier des Passages",
      "zone_name": "Bac à vérifier",
      "has_photo": false,
      "parent_code": null,
      "history": [
        {
          "type": "reception",
          "detail": "Entrée à Atelier des Passages",
          "created_at": "2026-11-06T00:06:21.484Z",
          "name": "Camille Martin"
        }
      ]
    },
    {
      "id": "be50b073-724f-4b97-9966-2e6e18c07377",
      "org_id": "7c71298c-2ab8-460b-a149-33ebae3106b2",
      "code": "OBJ-A685C4F14A",
      "kind": "item",
      "title": "Tabouret en bois",
      "category": "Mobilier",
      "state": "pret",
      "site_id": "92da19c8-23e4-4f5e-aa47-ca9072c3c815",
      "zone_id": "8bd2ec6d-03bf-46c4-bcf4-3d3603888d44",
      "quantity": 1,
      "grams": null,
      "price_cents": 1400,
      "parent_id": null,
      "condition": null,
      "origin": "Apport volontaire",
      "note": null,
      "barcode": null,
      "exit_type": null,
      "created_at": "2026-11-06T00:06:21.484Z",
      "site_name": "Boutique du Canal",
      "zone_name": "Rayon",
      "has_photo": false,
      "parent_code": null,
      "history": [
        {
          "type": "reception",
          "detail": "Entrée à Boutique du Canal",
          "created_at": "2026-11-06T00:06:21.484Z",
          "name": "Camille Martin"
        }
      ]
    },
    {
      "id": "7746551e-feb3-4d71-92dc-fd9e9e791d8b",
      "org_id": "7c71298c-2ab8-460b-a149-33ebae3106b2",
      "code": "OBJ-784E48CB8F",
      "kind": "item",
      "title": "Vase en grès",
      "category": "Maison et déco",
      "state": "pret",
      "site_id": "fa88ed38-26b0-423d-8f17-f879d6cb37ae",
      "zone_id": "6f4bbe58-5e2d-4bc2-bb17-b0f8724fdf88",
      "quantity": 1,
      "grams": null,
      "price_cents": 700,
      "parent_id": null,
      "condition": null,
      "origin": "Apport volontaire",
      "note": null,
      "barcode": null,
      "exit_type": null,
      "created_at": "2026-11-06T00:06:21.484Z",
      "site_name": "Dépôt des Peupliers",
      "zone_name": "Réserve A",
      "has_photo": false,
      "parent_code": null,
      "history": [
        {
          "type": "reception",
          "detail": "Entrée à Dépôt des Peupliers",
          "created_at": "2026-11-06T00:06:21.484Z",
          "name": "Camille Martin"
        }
      ]
    }
  ],
  "team": [
    {
      "id": "01b55f07-ea37-40b7-927a-0814399696e4",
      "name": "Camille Martin",
      "email": "demo@seconde-vie.test",
      "roles": [
        "admin"
      ],
      "active": true
    }
  ],
  "shifts": [],
  "transfers": []
};
