# Exemples de devis (à toi de les déposer)

Dépose ici tes **anciens devis anonymisés** (sans nom, sans adresse, sans numéro de sécurité sociale, sans date de naissance) : ils serviront de cas de test supplémentaires pour Raylé.

## Format conseillé (un fichier `.json` par devis)

```json
{
  "id": "devis-tibial-01",
  "description": "prothèse tibiale droite adulte, pied classe II",
  "lignes": [
    { "code": "2700339", "quantite": 1, "prix": 452.20 },
    { "code": "2798568", "quantite": 1, "prix": 31.82 }
  ],
  "attendu": {
    "codes_attendus": ["2700339", "2798568"],
    "problemes_attendus": [],
    "remarque": "ce que tu attends de Raylé pour ce devis"
  }
}
```

- `lignes` : les codes à 7 chiffres du devis tel que tu l'as écrit, avec la quantité et le prix.
- `attendu` : ce que Raylé devrait trouver (codes oubliés, cumuls impossibles, dépassement du prix limite…).
- Un PDF ou un Word anonymisé est aussi accepté : Raylé ne les lit pas encore automatiquement, mais ils servent de référence pour écrire le cas.

## Règles

- **Rien de personnel** dans ces fichiers. Ce dossier est ignoré par git pour les `.json` et `.pdf` (rien ne part sur GitHub) ; ce `README.md` est le seul fichier suivi.
- Lance ensuite `npm run test:lppr` : les cas de `data/lppr/tests/cas.json` sont notés ; pour tes devis, demande à Raylé « vérifie ce devis » dans la fenêtre LPPR.

*À vérifier avec la nomenclature en vigueur.*
