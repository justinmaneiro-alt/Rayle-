# Raylé

Assistant vocal (voix, IA, terminal de trading) : une page web (`index.html`) et son « cerveau » (un Worker Cloudflare dans `worker/`).

## Dossiers

| Dossier | Rôle |
|---|---|
| `core/intelligence/` | Côté page : envoi des phrases à l'IA, agent, mémoire, modes, lecture des données utiles, alertes déclenchées |
| `core/api-keys/` | Côté page : adresse du Worker, code d'accès, appairage et sécurité des appareils, réglages |
| `core/voice/` | Reconnaissance vocale, synthèse vocale, mot d'activation « Raylé », micro, coupure, sous-titres |
| `core/commun/` | Socle partagé : bus d'événements, vues, panneaux, état et journal (`base.js`), démarrage, cadre HUD (`hud.css`) |
| `skins/neurone/` | Le skin « neurone » : entité animée (`entite.js`), styles (`rayle.css`), icônes |
| `terminal/` | Terminal de trading : `js/` (page), `css/`, `page/` (pont avec Raylé, commandes vocales, marché, calendrier), `vendor/` (Lightweight Charts) |
| `galaxie/` | Galaxie 3D (Three.js, copié dans `vendor/`) : soleil Raylé, planètes, décor, qualité réglable. Vue de la page principale (bouton 🌌 ou « ouvre la galaxie » ; `galaxie.html` redirige). Textures : `textures/` (crédits dans `CREDITS.md`). Réglages (⚙), mesures et mode jeu : voir `reglages.js`, `mesure.js`, `panneau.js`. Tests Node : `node galaxie/tests/<manifestes|grammaire|reglages>-test.mjs` |
| `planetes/` | Un manifeste JSON par corps céleste (`planetes/<id>/manifeste.json`) et la liste `planetes/index.json` : c'est ici qu'on déclare ou modifie une planète |
| `worker/` | Le cerveau côté serveur (Cloudflare Worker), **ignoré par git** : ne jamais publier sans accord |

Dans `worker/src/` :

- `intelligence/` : IA en cascade, prompts et personnalité, agent et outils, mémoire, routage des commandes
- `api-keys/` : configuration, lecture des secrets, sécurité (appareils, phrase, PIN), niveaux de commandes, script `definir-secrets.mjs`
- `voice/` : synthèse vocale (Azure puis Edge)
- `terminal/` : marchés, bougies, COT, analyses fondamentales, alertes de prix, tâche planifiée
- `infra/` : point d'entrée (`index.js`), cache, base D1, utilitaires, état (`/ping`)

`terminal.html` est une simple adresse de redirection vers `index.html#terminal`.

## Lancer

**La page** (serveur local fourni, qui force le navigateur à revalider les fichiers ; `python -m http.server` est déconseillé : Chrome garde des modules périmés en cache) :

```
node serveur.mjs
```

puis ouvrir `http://127.0.0.1:8000` dans Chrome (assistant et terminal) ou `http://127.0.0.1:8000/#galaxie` (galaxie 3D). Dans ⚙ Réglages, saisir l'adresse du Worker et le code d'accès.

**Les tests** : `node galaxie/tests/<nom>-test.mjs` (purs, sans navigateur) et `tests-navigateur/` (Chrome réel, voir son README).

**Le Worker** :

```
cd worker
npm install
npx wrangler dev        # essai local
npx wrangler deploy     # mise en ligne
```

Les secrets (`RAYLE_TOKEN`, `GROQ_KEY`, `GEMINI_KEY`, `MISTRAL_KEY`, `OPENROUTER_KEY`, `CEREBRAS_KEY`, `TWELVEDATA_KEY`, `AZURE_KEY`, etc.) se définissent dans Cloudflare (`wrangler secret put NOM`) ; en local, dans `worker/.dev.vars`. Ces fichiers sont dans `.gitignore` et ne doivent jamais être commités. La phrase secrète et le PIN se règlent avec `node src/api-keys/definir-secrets.mjs` (dans `worker/`, dans ton propre terminal).

## Sauvegarde de l'ancienne version

- Branche git `backup-ancienne-rayle` (dépôt principal et dépôt `worker/`)
- Archive zip : `C:\Users\justi\Sauvegardes-Rayle\` (contient `.dev.vars` : ne pas la partager)
