# Écosystème Rayle

Écosystème Rayle est une application web installable (PWA) autour de **Rayle**, une assistante vocale en français. Rayle écoute, répond à voix haute, se souvient, et pilote les outils de l'écosystème : univers 3D, terminal de trading, anatomie, documents Google Drive, appareils connectés.

L'IA garde le nom **Rayle** : c'est elle qui parle. « Écosystème Rayle » est le nom de l'application.

- **Adresse (GitHub Pages)** : inchangée, le dépôt et l'URL restent les mêmes pour que la PWA déjà installée continue de se mettre à jour.
- **Version courante** : voir `window.RAYLE_VERSION` dans `index.html`.

## Thèmes

| Thème | Rôle |
|---|---|
| **Univers** | Thème principal et thème par défaut (fond 3D de la Terre, du Soleil, de la Lune et des planètes ; scène plein écran 🌌). |
| **Jarvis** | Thème « soft » holographique, conservé mais non prioritaire. |

Identifiants internes conservés pour ne pas perdre les réglages déjà enregistrés : fond `espace` = Univers, palette `originel` = Univers, palette `arc` = Jarvis.

## Organisation

```
index.html            page unique (scène Rayle + vues Terminal, Anatomie, Univers)
manifest.webmanifest  PWA
sw.js                 service worker (réseau d'abord)
css/  js/  ui/        interface et logique (JavaScript natif, sans bundler)
js/rayle/             cerveau de Rayle : voix, écoute, IA, mémoire, commandes, appareils, sécurité
js/univers/           scène Univers 3D
js/anatomie/  js/terminal/  js/drive/
relais-pc/            relais Windows (actions autorisées sur le PC)
scripts/  tests/      outils de développement et tests Node (sans framework)
docs/                 documentation (audit : docs/AUDIT.md)
```

Le Worker Cloudflare (`worker/worker.js`, IA, voix, mémoire, alertes) n'est pas versionné dans ce dépôt.

## Développement

```
for f in tests/*-test.mjs; do node $f; done     # tous les tests
node scripts/versionner.mjs AAAA.MM.JJ.N        # change la version avant de publier (cache-busting)
node scripts/capacites.mjs                      # régénère docs/capacites.md
```

Crédits des données et modèles : `CREDITS.md`.
