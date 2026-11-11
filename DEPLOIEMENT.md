# Déploiement de Raylé

Deux morceaux : **l'application** (fichiers statiques : `dist/public/`) et **le backend** (actualités, météo, calendrier, COT, macro, IA : `dist/backend/`).
Le backend est un seul code qui tourne **comme Cloudflare Worker** ou **comme serveur Node**. Rien d'autre à installer.

> Le code du backend (`worker/`) n'est jamais publié sur GitHub (règle du projet). `node build.mjs` le copie dans `dist/backend/`.

## 0. Construire (toujours en premier)

```bash
npm test                      # tests purs (doit finir par « tous les tests passent »)
node build.mjs --meme-origine # application + backend sur UN serveur Node   → dist/
# ou
node build.mjs --url=https://rayle.justinmaneiro.workers.dev   # application qui appelle un Worker Cloudflare
```

`dist/` contient : `public/` (l'application, `sw.js` avec la liste exacte des fichiers de démarrage), `backend/`, `demarrer.mjs`, `.env.exemple`, `package.json`.
La construction **refuse** de continuer si `index.html` et `sw.js` n'ont pas la même version, ou si un fichier de démarrage manque.
À chaque publication, changer ENSEMBLE `window.RAYLE_VERSION` (index.html) et `VERSION` (sw.js) : c'est ce qui fait apparaître « Nouvelle version disponible » sur les appareils déjà installés.

## 1. Serveur Node (un seul processus, application + backend)

Prérequis : Node 18 ou plus. Aucune dépendance à installer.

```bash
# sur le serveur
scp -r dist/ utilisateur@serveur:/opt/rayle        # ou un zip
cd /opt/rayle
cp .env.exemple .env && nano .env                  # RAYLE_TOKEN, ORIGINE, clés d'IA (facultatives, gratuites)
node demarrer.mjs                                  # écoute sur PORT (8788 par défaut)
curl http://localhost:8788/health                  # → {"ok":true,"service":"rayle","version":"…","cible":"node",…}
```

Service permanent (Linux, systemd) — `/etc/systemd/system/rayle.service` :

```ini
[Unit]
Description=Rayle
After=network.target
[Service]
WorkingDirectory=/opt/rayle
ExecStart=/usr/bin/node demarrer.mjs
Restart=always
User=rayle
[Install]
WantedBy=multi-user.target
```
`sudo systemctl enable --now rayle`. Vérification de santé pour un superviseur : `GET /health` (200 = vivant) ; l'état détaillé de chaque source : `GET /sources/etat`.

**HTTPS obligatoire** pour l'installation de l'application (PWA), le micro et la géolocalisation : mettre un reverse proxy (Caddy : `rayle.mondomaine.fr { reverse_proxy localhost:8788 }`, HTTPS automatique) ou Cloudflare Tunnel. Sur `localhost`, HTTPS n'est pas nécessaire.

Avec `--meme-origine`, l'application appelle le backend sur sa propre adresse : **aucun CORS à régler**. Le jeton (`RAYLE_TOKEN`) se saisit une fois dans ⚙ Réglages → « Code d'accès ».

## 2. Cloudflare Worker (backend seul) + application sur un hébergement statique

**État constaté le 2026-11-11 :** l'adresse `https://rayle.justinmaneiro.workers.dev` répond **le site statique** (index.html) au lieu du Worker : toutes les routes (`/health`, `/actualites/fil`…) donnent 404 sans en-tête CORS, d'où « Worker injoignable ». Cause (voir `PROGRESS.md`, phase 3) : le `wrangler.jsonc` de la racine (`assets: "."`, même nom « rayle ») a remplacé le Worker. **Ne jamais lancer `wrangler deploy` à la racine du projet.**

Commandes exactes (à lancer par Justin, une fois connecté : `npx.cmd wrangler login`, puis `npx.cmd wrangler whoami` doit afficher le compte) :

```bash
cd worker
# 1. contrôle sans rien envoyer (doit finir par « --dry-run: exiting now »)
npx.cmd wrangler deploy --dry-run --config portable/wrangler.toml
# 2. secrets (jamais dans le dépôt) : le jeton demandé aux appareils, puis les clés d'IA gratuites que tu as
npx.cmd wrangler secret put RAYLE_TOKEN --config portable/wrangler.toml
npx.cmd wrangler secret put GROQ_API_KEY --config portable/wrangler.toml      # facultatif (idem MISTRAL_API_KEY, CEREBRAS_API_KEY, OPENROUTER_API_KEY)
# 3. déploiement
npx.cmd wrangler deploy --config portable/wrangler.toml
# 4. vérifications immédiates
curl https://rayle.justinmaneiro.workers.dev/health                    # doit contenir "service":"rayle","cible":"cloudflare"
curl -i -H "Origin: https://justinmaneiro-alt.github.io" https://rayle.justinmaneiro.workers.dev/health   # access-control-allow-origin présent
curl https://rayle.justinmaneiro.workers.dev/actualites/fil?portee=france  # 401 sans jeton = normal
```
Variable `ORIGINE` (dans `portable/wrangler.toml`) : les adresses autorisées pour le navigateur, séparées par des virgules.

**Retour arrière :** `npx.cmd wrangler deployments list --config portable/wrangler.toml` puis `npx.cmd wrangler rollback <identifiant> --config portable/wrangler.toml`. L'ancien code est conservé dans `idees/worker-avant-restructuration/`.

**Avant de déployer, vérifier dans le tableau de bord Cloudflare** (Workers & Pages → rayle → Settings) qu'aucune **liaison Git / Workers Builds** ne redéploie le site statique à chaque push : c'est elle qui a écrasé le Worker (à débrancher, ou à pointer vers un autre nom de projet).

Limites du plan gratuit : 50 appels sortants et 10 ms de CPU par exécution. La route `/actualites/fil?portee=france` lit 34 médias : si Cloudflare coupe pour dépassement, utiliser le mode serveur Node (§1) ou le plan payant. Les sources sont mises en cache en mémoire de l'instance (10 min).

## 3. Application seule sur GitHub Pages / hébergement statique

`node build.mjs --url=<adresse du backend>` puis publier `dist/public/` (HTTPS requis pour la PWA ; GitHub Pages convient). Ne rien pousser sans relire : le dépôt contient des informations personnelles.

## 4. Vérifications après déploiement

1. `/health` répond 200 (backend). 2. Ouvrir l'application → ⚙ Réglages → **État des sources** → « Tester toutes les sources maintenant » : tout doit être vert sauf, éventuellement, GDELT (lent, parfois vide).
3. Installer l'application (menu du navigateur : « Installer » / « Ajouter à l'écran d'accueil »), couper le réseau, la rouvrir : l'accueil s'affiche.
4. Changer la version (index.html + sw.js), reconstruire, redéployer : « Nouvelle version disponible » apparaît chez les appareils déjà installés.

## 5. Ce qui n'est PAS repris par le nouveau backend (le front le dit en clair)

`/tts` (voix du serveur : la voix du navigateur ou la voix locale du PC est utilisée), appairage d'appareils et verrou à PIN, mémoire et souvenirs (D1), alertes de marché et Telegram, route `/marche` (graphiques : le terminal lit Kraken directement ou par le serveur du PC), liaison caméra. L'ancien code reste dans `worker/src/` (non déployé).
