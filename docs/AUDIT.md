# Audit du dépôt — état « avant refonte Écosystème Rayle »

Réalisé le 2026-10-15 sur la version 2026.10.14.5 (commit `4063dbd`). Point de retour : branche `avant-ecosysteme`, tag `rayle-v-avant-refonte`.

**Chiffres** : 353 fichiers suivis par git, 48,7 Mo. Aucun `package.json`, aucun bundler : JavaScript natif, scripts `<script>` classiques (modules ES seulement pour `js/anatomie`, `js/univers`, `js/drive` chargés à la demande), versionnage par `?v=` (`scripts/versionner.mjs`).

## 1. Architecture en bref

- **Une seule page** `index.html` (25 Ko) : scène Raylé (entité de particules + voix), plus trois « vues » dans la même page (`js/commun/vues.js`) : Terminal (trading), Anatomie & Orthopédie, et l'Univers 3D (plein écran, bouton 🌌). `rayle.html`, `terminal.html`, `index (1).html`, `rayle (1).html`, `terminal (12).html` sont de simples redirections vers `index.html` (les copies « (1) », « (12) » sont des doublons accidentels).
- **PWA** : `manifest.webmanifest` + `sw.js` (réseau d'abord, cache de secours, cache à part pour les textures).
- **Cerveau côté serveur** : un **Cloudflare Worker** (`worker/worker.js`, 1,5 Mo, **ignoré par git** : `worker/` est dans `.gitignore`, les `worker-avant-*.js` sont des copies de sécurité locales). Il porte l'IA, la voix (Azure puis Edge), la mémoire durable (D1), les données de marché, les alertes et événements entre appareils.
- **Bus d'événements** `RayleBus` (`js/commun/bus.js`) : seul lien entre modules, rien dans `localStorage` pour l'état.
- **Relais PC** (`relais-pc/`) : petit service Node local, liste blanche d'actions, piloté depuis la page via le Worker.

## 2. Fonctions de Rayle → où elles vivent

| Fonction | Fichiers principaux |
|---|---|
| **Voix** (synthèse Azure/Edge via Worker, repli navigateur) | `js/rayle/voix.js`, `nettoyage-voix.js`, `lecture.js` |
| **Écoute** (reconnaissance, mot d'éveil « Raylé », écoute naturelle, double clap, modes micro coupé / veille / conversation) | `reconnaissance.js`, `ecoute-naturelle.js`, `clap.js`, `modes.js`, `coupure.js`, `phrase.js` |
| **IA / agent** (Worker, choix d'outils, exécution des actions par la page) | `ia.js`, `agent.js`, `worker.js`, `capacites.js` (registre généré → `docs/capacites.md`) |
| **Mémoire** durable (D1) + mémoire des cours (IndexedDB locale) | `memoire.js` ; `js/drive/memoire.js`, `base-locale.js` |
| **Initiative** (Raylé parle d'elle-même), alertes, rappels, événements | `initiative.js`, `evenements.js`, `discretion.js` |
| **Thèmes de couleurs** (6 packs) | `ui/themes.js`, `ui/ui.css`, `ui/settings.js` |
| **Fonds animés** (Aucun, Espace, Jarvis, Ville réelle) | `ui/background.js` (chef d'orchestre), `fond-globe.js` + `fond-espace.js` (Espace), `fond-jarvis.js`, `fond-video.js`, `ui/assets/fond-*`, `ville-*.mp4` |
| **Ambiance** (météo/soleil réels → pluie, neige, orage, thème auto) | `ui/ambiance*.js`, `ui/astro.js`, `docs/ambiance.md` |
| **Entité** (sphère de particules / Neurones) | `js/commun/entite.js`, `ui/entity.js`, `ui/entity-neurones.js` |
| **Planètes / Espace** (fond Espace, Terre vivante, ISS SGP4, savoir sourcé NASA/ESA) | `ui/espace*.js`, `ui/sgp4.js`, `js/rayle/commandes-espace.js`, `docs/espace*.md` |
| **Univers 3D** (globe interactif, système solaire, Mars + rovers, éclipses, actualités, **bataille navale**, intérieur des navires, transitions) | `js/univers/**`, `css/univers.css`, `js/rayle/commandes-univers.js`, `docs/univers.md` |
| **Anatomie & Orthopédie** (3D, GLB BodyParts3D, cerveau, présentations animées) | `js/anatomie/**`, `css/anatomie.css`, `js/rayle/commandes-anatomie.js`, `ui/assets/anatomie/` (26 Mo) |
| **Terminal de trading** (graphique Lightweight Charts, marchés, COT, analyse, Monde) | `js/terminal/**`, `css/terminal*.css`, `css/monde.css`, `js/rayle/commandes-terminal.js`, `commandes-monde.js`, `marche.js`, `calendrier.js` |
| **Cartes / lieux / itinéraires** | `js/rayle/carte.js` (Leaflet, Nominatim, OSRM) |
| **Savoirs** (météo, actus, Wikipédia, MDN, études, médicaments) | `savoirs.js`, `panneau-donnees.js`, `panneaux-contenus.js` |
| **Drive** (Google Drive/Docs/Sheets/Slides : lecture, modification vérifiée, mémoire des cours) | `js/drive/**` (15 fichiers), `js/config-drive.js`, `css/drive.css`, `js/rayle/commandes-drive.js`, `docs/drive.md` |
| **Multi-appareils** (appairage, commandes entre appareils, localisation, mini-vue, raccourcis) | `appareils.js`, `localisation.js`, `raccourcis.js`, `css/appareils.css` |
| **Relais** (contrôle du PC / Android) | `relais.js`, `relais-pc/**`, `docs/relais-android.md`, `docs/widget-kwgt.md` |
| **Messages / répertoire** (Raylé prépare SMS, mail, lien WhatsApp, appel ; Justin envoie) | `repertoire.js`, `css/messages.css` |
| **Sécurité** (appareil appairé, verrou, déverrouillage, journal) | `securite.js` |
| **Telegram** | **Absent du code** : aucune occurrence. À créer si voulu. |
| **WhatsApp** | Seulement des liens `wa.me` préparés dans `repertoire.js` (pas d'intégration d'API). |
| **PWA** | `js/commun/pwa.js`, `sw.js`, `manifest.webmanifest`, `icones/` |

## 3. Dépendances

Aucune dépendance npm. **Embarqué** (`js/vendor/`) : Lightweight Charts (198 Ko), Leaflet (148 Ko + CSS/images), contours `world-110m.json` (108 Ko).
**CDN au chargement** : `three@0.160.0` (jsdelivr, import map), cdnjs, TradingView.
**Services externes** : Cloudflare Worker (propre au projet), Open-Meteo, CelesTrak (TLE), franceinfo (RSS), Wikipédia/Wikidata, OpenStreetMap/Nominatim/OSRM, Bitstamp, Forex Factory, API Google (Identity Services, Picker, Drive, Docs, Sheets, Slides).
**Sources de données/modèles** (voir `CREDITS.md`, `ui/assets/CREDITS.txt`) : BodyParts3D (CC BY 4.0), squelette CGI Coffee (CC0), NASA/ESA (textures, modèles ISS et Perseverance), world-atlas (ISC).
**Outils de dev** (Node seul) : `scripts/*.mjs`, `tests/*-test.mjs` (49 tests sans framework), Chrome sans écran pour `banc-navigateur.mjs`.

## 4. Poids : les plus gros fichiers

| Fichier | Poids | Remarque |
|---|---|---|
| `worker/worker.js` | 1,5 Mo | non versionné (+ 9 copies `worker-avant-*`) |
| `ui/assets/anatomie/muscles-bp3d.glb` | 9,5 Mo | Anatomie |
| `ui/assets/anatomie/os-detail-bp3d.glb` | 5,5 Mo | Anatomie |
| `ui/assets/ville-paysage.mp4` + `ville-portrait.mp4` | 4,4 + 3,1 Mo | fond « Ville réelle » |
| `ui/assets/anatomie/os-axial-bp3d.glb` | 4,2 Mo | Anatomie |
| `ui/assets/terre-jour-8192.jpg` / `terre-nuit-8192.jpg` | 2,4 / 1,1 Mo | Terre (Univers, palier Ultra) |
| `ui/assets/anatomie/organes-bp3d.glb`, `cerveau-bp3d.glb`, `squelette-cc0.glb` | 1,7 / 1,7 / 1,1 Mo | Anatomie |
| `ui/assets/espace/modeles/perseverance.glb`, `iss.glb` | 0,8 / 0,3 Mo | Espace |
| `ui/fond-espace.js` | 66 Ko | fond Espace |
| `js/anatomie/moteur.js` | 61 Ko | Anatomie |
| `js/rayle/repertoire.js` | 54 Ko | Messages |
| `js/anatomie/donnees-cerveau.js` | 53 Ko | Anatomie |
| `js/univers/navale/interieur.js` | 50 Ko | bataille navale |
| `ui/fond-jarvis.js` | 49 Ko | fond Jarvis |
| `js/univers/donnees/mers.js` | 49 Ko | océans (partagé avec le globe) |
| `ui/espace-savoir.js` | 48 Ko | savoir Espace |

Répartition : `ui/assets/` 44 Mo (91 %), dont Anatomie 26 Mo, fonds/Terre 14 Mo, Espace 4 Mo. Le code (JS+CSS) pèse environ 3,3 Mo.

## 5. Points d'attention relevés

- `docs/` est dans `.gitignore` : certains fichiers n'y sont suivis que par ajout forcé (`git add -f`).
- Doublons à la racine : `index (1).html`, `rayle (1).html`, `terminal (12).html` (redirections identiques).
- Aucun `README` n'existe : à créer pendant le renommage.
- `ui/assets/ville-source.mp4` est ignoré par git (source du fond Ville).
- Le manifest PWA fixe `id: "./"` et `start_url` : à ne pas modifier pour ne pas casser l'installation.

## 6. Liste complète des fichiers (état avant refonte)

### (racine)/ — 12 fichiers, 58.1 Ko

| Fichier | Poids | Rôle |
|---|---|---|
| `.gitignore` | 0.2 Ko |  |
| `CREDITS.md` | 21.9 Ko |  |
| `confidentialite.html` | 3.8 Ko |  |
| `favicon.svg` | 0.3 Ko |  |
| `index (1).html` | 0.4 Ko |  |
| `index.html` | 24.5 Ko |  |
| `manifest.webmanifest` | 1.7 Ko |  |
| `rayle (1).html` | 0.4 Ko |  |
| `rayle.html` | 0.4 Ko |  |
| `sw.js` | 3.8 Ko | Service worker de Raylé : PRUDENT. |
| `terminal (12).html` | 0.4 Ko |  |
| `terminal.html` | 0.4 Ko |  |

### css/ — 10 fichiers, 112.7 Ko

| Fichier | Poids | Rôle |
|---|---|---|
| `css/anatomie.css` | 19.9 Ko | ANATOMIE & ORTHOPÉDIE : fenêtre plein écran (#vueAnatomie) et pop-up 3D (#anQuick) |
| `css/appareils.css` | 5.5 Ko | PHASE 3A : commandes entre appareils (bandeau, sonnerie, veille) et mini-vue |
| `css/drive.css` | 11.0 Ko | Fenêtre flottante des documents Drive (js/drive/fenetre.js) : déplaçable, redimensionnable au toucher, réduire / plein écran / fermer |
| `css/hud.css` | 14.8 Ko | HUD : cadres holographiques réutilisables (panneaux de Raylé, fenêtres du terminal) |
| `css/messages.css` | 1.3 Ko | PHASE 4A : messages et appels préparés, répertoire (réglages) |
| `css/monde.css` | 6.6 Ko | PAGE « MONDE » du terminal (js/terminal/page-monde.js) : couleurs du thème actif |
| `css/rayle.css` | 8.6 Ko | Scène : l'entité au centre |
| `css/terminal-pro.css` | 22.9 Ko | TERMINAL « PRO » : pages, modes d'affichage, graphique Raylé, tableaux HUD animés (tout sous #vueTerminal) |
| `css/terminal.css` | 11.3 Ko |  |
| `css/univers.css` | 10.7 Ko | UNIVERS 3D : vue plein écran des thèmes (Espace, Bataille navale…) — js/univers/noyau.js |

### docs/ — 9 fichiers, 132.8 Ko

| Fichier | Poids | Rôle |
|---|---|---|
| `docs/anatomie-3d.md` | 20.1 Ko |  |
| `docs/anatomie-haute-fidelite.md` | 11.5 Ko |  |
| `docs/anatomie-presentations-cerveau.md` | 9.6 Ko |  |
| `docs/capacites.md` | 16.6 Ko |  |
| `docs/drive.md` | 17.6 Ko |  |
| `docs/espace-sources.md` | 31.2 Ko |  |
| `docs/espace-trafic.md` | 9.9 Ko |  |
| `docs/relais-android.md` | 7.5 Ko |  |
| `docs/widget-kwgt.md` | 8.9 Ko |  |

### icones/ — 10 fichiers, 670.5 Ko

- `icone-512.png` (226.8 Ko)
- `icone-maskable-512.png` (191.3 Ko)
- `icone-192.png` (48.0 Ko)
- `apple-touch-icon.png` (43.2 Ko)
- `icone-maskable.svg` (35.6 Ko)
- `icone.svg` (35.5 Ko)
- `raccourci-monde.png` (23.6 Ko)
- `raccourci-briefing.png` (22.6 Ko)
- `raccourci-terminal.png` (22.5 Ko)
- `raccourci-parler.png` (21.4 Ko)

### js/anatomie/ — 41 fichiers, 699.1 Ko

| Fichier | Poids | Rôle |
|---|---|---|
| `js/anatomie/ajustement.js` | 5.2 Ko | AJUSTEMENT D'UN MODÈLE GLB SUR LA FORME SCHÉMATIQUE D'UN OS |
| `js/anatomie/appareils3d.js` | 13.9 Ko | APPAREILLAGES EN 3D : prothèses, corsets, orthèses, zones d'appui et de décharge |
| `js/anatomie/cerveau-fenetre.js` | 22.9 Ko | FENÊTRE « CERVEAU » (vue plein écran #vueCerveau, comme Anatomie et le terminal) |
| `js/anatomie/cerveau-moteur.js` | 40.9 Ko | MOTEUR 3D DU CERVEAU (three.js) |
| `js/anatomie/cerveau-recherche.js` | 5.7 Ko | CERVEAU : recherche d'une zone ou d'un réseau par son nom, fiche et résumé parlé (pur, testable sans navigateur) |
| `js/anatomie/commandes.js` | 34.4 Ko | COMMANDES DE RAYLÉ POUR L'ANATOMIE (voix ou texte, sans IA) |
| `js/anatomie/construction.js` | 18.9 Ko | CONSTRUCTION 3D : géométries procédurales (solution de repli quand aucun modèle GLB n'est fourni) |
| `js/anatomie/corps-hd.js` | 13.9 Ko |  |
| `js/anatomie/correspondance-squelette.js` | 8.3 Ko |  |
| `js/anatomie/coupes.js` | 9.5 Ko |  |
| `js/anatomie/cours.js` | 6.6 Ko | COURS ET DOCUMENTS DE JUSTIN (base de connaissances locale, pour Raylé) |
| `js/anatomie/donnees-cerveau.js` | 53.3 Ko |  |
| `js/anatomie/donnees-corps.js` | 24.4 Ko | DONNÉES : CORPS HAUTE FIDÉLITÉ (BodyParts3D) |
| `js/anatomie/donnees-muscles.js` | 21.9 Ko | DONNÉES : MUSCLES |
| `js/anatomie/donnees-nerfs-organes.js` | 16.6 Ko | DONNÉES : SYSTÈME NERVEUX, ORGANES, DERMATOMES |
| `js/anatomie/donnees-organes-hd.js` | 6.5 Ko | DONNÉES : ORGANES ET NERFS HAUTE FIDÉLITÉ (BodyParts3D) |
| `js/anatomie/donnees-ortho.js` | 47.9 Ko | DONNÉES : ORTHOPÉDIE ET ORTHOPROTHÈSE |
| `js/anatomie/donnees-os.js` | 34.1 Ko | DONNÉES : SQUELETTE |
| `js/anatomie/donnees-vaisseaux.js` | 12.0 Ko | DONNÉES : VAISSEAUX HAUTE FIDÉLITÉ (BodyParts3D) |
| `js/anatomie/fenetre.js` | 38.7 Ko | FENÊTRE « ANATOMIE & ORTHOPÉDIE » (vue plein écran, comme le terminal) |
| `js/anatomie/fiches-corps.js` | 1.9 Ko | archive.org/details/anatomyofhumanbo00grayrich |
| `js/anatomie/fiches-membre-inf.js` | 18.5 Ko | Fiches : bassin, cuisse, jambe, pied. Source : Gray's Anatomy 1918, Myologie (voir fiches-corps.js). |
| `js/anatomie/fiches-membre-sup.js` | 14.9 Ko | Fiches : épaule, paroi du thorax (muscles du membre supérieur), bras, avant-bras, main. Source : Gray's Anatomy 1918, Myologie (voir fiches- |
| `js/anatomie/fiches-nerfs.js` | 3.3 Ko | Fiches : nerfs et plexus. Source : Gray's Anatomy 1918, Névrologie (voir fiches-corps.js). Les nerfs de ce fichier ont un TRACÉ SCHÉMATIQUE  |
| `js/anatomie/fiches-outils.js` | 0.9 Ko | Outils communs des fichiers de fiches (fiches-*.js) |
| `js/anatomie/fiches-tete.js` | 7.0 Ko | Fiches : langue, palais, orbite, larynx, pharynx, périnée. Source : Gray's Anatomy 1918, Myologie (voir fiches-corps.js). |
| `js/anatomie/fiches-tronc-cou.js` | 14.7 Ko | Fiches : cou, dos, thorax, abdomen, périnée. Source : Gray's Anatomy 1918, Myologie (voir fiches-corps.js). |
| `js/anatomie/fiches-vaisseaux.js` | 17.4 Ko | Fiches : artères et veines du réseau principal. Source : Gray's Anatomy 1918, Angéiologie (voir fiches-corps.js). Les passages repris sont r |
| `js/anatomie/groupes-os.js` | 2.5 Ko | RÉGIONS DU SQUELETTE : isolation et transparence par groupe d'os |
| `js/anatomie/index.js` | 2.1 Ko | POINT D'ENTRÉE DU MODULE ANATOMIE & ORTHOPÉDIE |
| `js/anatomie/lecteur-anatomie.js` | 5.9 Ko | PRÉSENTATIONS ANIMÉES DU CORPS : adaptateur du lecteur pour la fenêtre Anatomie |
| `js/anatomie/lecteur.js` | 10.8 Ko | LECTEUR DE PRÉSENTATIONS ANIMÉES |
| `js/anatomie/modeles-glb.js` | 13.5 Ko | …", "auteur": "…" } }                 (clés = identifiants de base, voir registre.js) |
| `js/anatomie/moteur.js` | 60.8 Ko | MOTEUR 3D ANATOMIE (three.js) |
| `js/anatomie/outils.js` | 1.6 Ko | Petits outils communs à la fenêtre et au pop-up : DOM, chargement de three.js |
| `js/anatomie/pbr.js` | 9.6 Ko |  |
| `js/anatomie/presentation.js` | 31.1 Ko | PRÉSENTATIONS ANIMÉES : fabrication des scripts (pur, testable sans navigateur) |
| `js/anatomie/quickview.js` | 7.9 Ko | POP-UP 3D RAPIDE (« Quick View ») |
| `js/anatomie/registre.js` | 19.9 Ko | REGISTRE DES STRUCTURES : recherche, fiches, liens os ↔ muscles |
| `js/anatomie/rendu.js` | 8.5 Ko | RENDU : studio d'éclairage, ombres douces, environnement, post-traitement |
| `js/anatomie/store.js` | 10.9 Ko | STORE ANATOMIE & ORTHOPÉDIE (équivalent Zustand, sans dépendance) |

### js/commun/ — 5 fichiers, 37.2 Ko

| Fichier | Poids | Rôle |
|---|---|---|
| `js/commun/bus.js` | 1.3 Ko | BUS D'ÉVÉNEMENTS (mémoire de la page, rien dans localStorage) |
| `js/commun/entite.js` | 17.7 Ko |  |
| `js/commun/panneaux.js` | 8.1 Ko |  |
| `js/commun/pwa.js` | 5.6 Ko | APPLICATION INSTALLABLE (PWA) : service worker, mise à jour, installation, écran allumé |
| `js/commun/vues.js` | 4.5 Ko | VUES : Raylé (par défaut), terminal et Anatomie & Orthopédie, dans la même page |

### js/config-drive.js/ — 1 fichiers, 1.1 Ko

| Fichier | Poids | Rôle |
|---|---|---|
| `js/config-drive.js` | 1.1 Ko | CONFIGURATION GOOGLE DRIVE DE RAYLÉ |

### js/drive/ — 15 fichiers, 192.3 Ko

| Fichier | Poids | Rôle |
|---|---|---|
| `js/drive/api.js` | 6.2 Ko | DRIVE : appels aux API Google (Drive v3, Docs, Sheets, Slides) |
| `js/drive/auth.js` | 9.6 Ko | DRIVE : connexion Google (Google Identity Services) et sélecteur de fichiers (Google Picker) |
| `js/drive/base-locale.js` | 3.0 Ko | DRIVE : base locale des cours (IndexedDB, sur cet appareil seulement) |
| `js/drive/commandes.js` | 25.7 Ko | DRIVE : ce que Raylé comprend (analyseur de phrases, pur) |
| `js/drive/fenetre.js` | 31.1 Ko | DRIVE : la fenêtre flottante de lecture et d'édition |
| `js/drive/fmt-autres.js` | 6.4 Ko | DRIVE : texte brut, Markdown, PDF, Sheets, Slides (fonctions pures) |
| `js/drive/fmt-docx.js` | 10.4 Ko | DRIVE : fichiers Word (.docx) |
| `js/drive/fmt-gdoc.js` | 7.2 Ko | DRIVE : Google Docs (lecture structurée + modification qui conserve la mise en forme) |
| `js/drive/formats.js` | 5.8 Ko | DRIVE : un adaptateur par type de document |
| `js/drive/index.js` | 22.3 Ko | DRIVE : point d'entrée du module (chargé à la demande par js/rayle/commandes-drive.js) |
| `js/drive/lot.js` | 1.8 Ko | DRIVE : boîte « X documents ajoutés au total, en ajouter d'autres ? » (mode par lots) |
| `js/drive/memoire.js` | 12.1 Ko | DRIVE : mémoire des cours (extraction du texte de tous les documents choisis, dossiers compris, dans la base locale) |
| `js/drive/modele.js` | 14.7 Ko | DRIVE : modèle de document (pur, sans réseau ni navigateur) |
| `js/drive/service.js` | 30.1 Ko | DRIVE : le service (registre des fichiers autorisés, ouverture, lecture, modification vérifiée, annulation) |
| `js/drive/texte.js` | 5.9 Ko | DRIVE : outils de texte purs (sans navigateur, testables sous Node) |

### js/rayle/ — 45 fichiers, 480.4 Ko

| Fichier | Poids | Rôle |
|---|---|---|
| `js/rayle/affichage.js` | 2.9 Ko | AFFICHAGE : sous-titres, qualité de l'entité, bouton Couper, état verrouillé |
| `js/rayle/agent.js` | 5.7 Ko | AGENT : Raylé choisit ses outils (Worker) et la page exécute les actions |
| `js/rayle/appareils.js` | 32.7 Ko | COMMANDES ENTRE MES APPAREILS (phase 3A) |
| `js/rayle/base.js` | 5.2 Ko | petite Raylé du terminal |
| `js/rayle/calcul.js` | 5.6 Ko | CALCUL · CONVERSIONS · DEVISES |
| `js/rayle/calendrier.js` | 4.1 Ko | CALENDRIER ÉCONOMIQUE |
| `js/rayle/capacites.js` | 24.6 Ko |  |
| `js/rayle/carte.js` | 13.9 Ko | CARTES : Leaflet + OpenStreetMap, lieux (Nominatim), itinéraires (OSRM) |
| `js/rayle/clap.js` | 2.6 Ko | DÉTECTEUR DE DOUBLE CLAP (pur calcul, sans micro ni page : testable dans Node) |
| `js/rayle/commandes-anatomie.js` | 4.3 Ko | ANATOMIE & ORTHOPÉDIE : ce que Raylé comprend (voir js/anatomie/) |
| `js/rayle/commandes-drive.js` | 13.1 Ko | DOCUMENTS DU DRIVE : lire, ouvrir et modifier (voir js/drive/ et docs/drive.md) |
| `js/rayle/commandes-espace.js` | 4.6 Ko | ESPACE : questions de savoir (sans IA) et actions de l'agent |
| `js/rayle/commandes-monde.js` | 7.8 Ko | COMMANDES VOCALES DE LA PAGE « MONDE » (terminal) |
| `js/rayle/commandes-terminal.js` | 17.5 Ko | COMMANDES VOCALES DU TERMINAL |
| `js/rayle/commandes-univers.js` | 24.9 Ko | COMMANDES VOCALES DES NOUVEAUX MODES (sans IA) + PONT VERS L'UNIVERS 3D |
| `js/rayle/coupure.js` | 10.7 Ko | COUPURE : arrêter Raylé à tout moment |
| `js/rayle/demarrage.js` | 1.9 Ko | DÉMARRAGE |
| `js/rayle/discretion.js` | 2.0 Ko | RAYLÉ SE FAIT DISCRÈTE : l'entité laisse la place au contenu affiché |
| `js/rayle/ecoute-naturelle.js` | 12.0 Ko |  |
| `js/rayle/evenements.js` | 6.9 Ko |  |
| `js/rayle/ia.js` | 7.7 Ko | INTELLIGENCE : le Worker |
| `js/rayle/initiative.js` | 10.5 Ko | INITIATIVE : Raylé prend la parole d'elle-même (page ouverte) |
| `js/rayle/lecture.js` | 7.7 Ko | LECTURE DES DONNÉES UTILES À LA QUESTION |
| `js/rayle/localisation.js` | 14.1 Ko | LOCALISATION DES APPAREILS : où sont ma tablette, mon PC, mon téléphone |
| `js/rayle/marche.js` | 16.1 Ko | DONNÉES DE MARCHÉ (via le Worker) |
| `js/rayle/medias.js` | 8.0 Ko | IMAGES ET VIDÉOS ENVOYÉES (bouton 📎, coller, glisser) |
| `js/rayle/memoire.js` | 2.6 Ko | MÉMOIRE DURABLE (base D1 du Worker) |
| `js/rayle/modes.js` | 4.8 Ko | MODES : micro coupé · veille · conversation |
| `js/rayle/nettoyage-voix.js` | 1.3 Ko | NETTOYAGE DU TEXTE POUR LA VOIX |
| `js/rayle/panneau-donnees.js` | 5.7 Ko | PANNEAU DE DONNÉES (macro, crypto, savoirs, réseaux, actualités…) |
| `js/rayle/panneaux-contenus.js` | 10.3 Ko | CONTENUS DES PANNEAUX HOLOGRAPHIQUES |
| `js/rayle/pays-donnees.js` | 8.3 Ko | Table des pays : code ISO numérique (contours world-atlas), ISO alpha-2, alpha-3, nom français (i18n-iso-countries 7.11.0, MIT). |
| `js/rayle/phrase.js` | 8.1 Ko | TRAITEMENT D'UNE PHRASE |
| `js/rayle/pont-terminal.js` | 8.3 Ko | PONT AVEC LE TERMINAL |
| `js/rayle/raccourcis.js` | 9.0 Ko | RACCOURCIS D'APPLI ET MINI-VUE (phase 3A) |
| `js/rayle/rangement.js` | 6.2 Ko | RANGER RAYLÉ : une petite bulle déplaçable, pour avoir toute la scène sous les doigts |
| `js/rayle/reconnaissance.js` | 8.2 Ko | RECONNAISSANCE VOCALE |
| `js/rayle/reglages.js` | 11.2 Ko | RÉGLAGES |
| `js/rayle/relais.js` | 18.4 Ko | CONTRÔLE DES APPAREILS PAR LES RELAIS (phase 3B, sans n8n) |
| `js/rayle/repertoire.js` | 53.6 Ko |  |
| `js/rayle/reponse-hud.js` | 2.6 Ko | FENÊTRE HUD DE LA RÉPONSE |
| `js/rayle/savoirs.js` | 20.7 Ko | SAVOIRS : MÉTÉO · ACTUALITÉS · WIKIPÉDIA · MDN · ÉTUDES · MÉDICAMENTS · SENTIMENT |
| `js/rayle/securite.js` | 21.3 Ko | SÉCURITÉ : appareil appairé, verrou, déverrouillage |
| `js/rayle/voix.js` | 8.8 Ko | VOIX : Worker (Azure → Edge) puis voix du navigateur |
| `js/rayle/worker.js` | 3.5 Ko | CONNEXION AU WORKER |

### js/terminal/ — 7 fichiers, 123.8 Ko

| Fichier | Poids | Rôle |
|---|---|---|
| `js/terminal/graphique-rayle.js` | 19.5 Ko | GRAPHIQUE « RAYLÉ » (TradingView Lightweight Charts, hébergé ici dans js/vendor) |
| `js/terminal/hud.js` | 4.6 Ko | Petits outils communs des pages du terminal (rendu HUD animé) |
| `js/terminal/page-analyse.js` | 7.5 Ko | PAGE « ANALYSE » : analyse fondamentale du Nasdaq 100 et de l'or (rapport du Worker, rédigé par Gemini) |
| `js/terminal/page-cot.js` | 12.0 Ko | PAGE « COT » : positions des spéculateurs (CFTC), évolution sur 1 an, extrêmes, centile |
| `js/terminal/page-marches.js` | 10.0 Ko | PAGE « MARCHÉS » : tableaux HUD animés (rendements, écarts, courbes, indices, actions, matières, dollar, VIX, crypto) |
| `js/terminal/page-monde.js` | 31.6 Ko | PAGE « MONDE » : la Terre interactive, les zones chaudes, les fiches pays, la carte économique TradingView |
| `js/terminal/terminal.js` | 38.7 Ko | TERMINAL (vue de la page unique) : module chargé à la première ouverture |

### js/univers/ — 34 fichiers, 548.3 Ko

| Fichier | Poids | Rôle |
|---|---|---|
| `js/univers/donnees/mers.js` | 48.5 Ko | Océans et mers : position (centre), taille apparente et faits classés par angle (géographie, chiffres, histoire, anecdotes). |
| `js/univers/donnees/navires.js` | 16.7 Ko | Navires et nations du thème « Bataille navale, années 1700 » : dimensions, armement, équipage, couleurs par nation, pavillons, faits pour le |
| `js/univers/donnees/pays.js` | 5.7 Ko | Informations sur un pays pour les présentations : chiffres (Wikidata, SPARQL, sans clé) + texte d'article (Wikipédia en français, sans clé), |
| `js/univers/donnees/planetes.js` | 36.7 Ko | Fiches des astres du système solaire : chiffres (NASA / JPL / ESA : docs/espace-sources.md) et faits classés par angle, pour des présentatio |
| `js/univers/donnees/presentation.js` | 16.0 Ko | Moteur de présentation : compose, à chaque demande, un texte DIFFÉRENT pour un pays, un océan ou une mer. |
| `js/univers/donnees/rovers.js` | 16.3 Ko | Base d'informations sur les rovers martiens (NASA/JPL : mars.nasa.gov, science.nasa.gov/mission/mars-2020-perseverance, msl-curiosity) pour  |
| `js/univers/espace/actualites.js` | 9.1 Ko | Actualités sur le globe : de vraies actualités, localisées par pays ou par ville, affichées en pastilles cliquables. |
| `js/univers/espace/asteroides.js` | 7.6 Ko | Ceinture d'astéroïdes : des rochers à la forme irrégulière (3 variantes, relief et texture rocheuse procéduraux), en instances, qui tournent |
| `js/univers/espace/ciel.js` | 8.8 Ko | Ciel de l'Espace : carte du ciel réelle (Voie lactée, étoiles) + étoiles scintillantes + fonds de galaxies / nébuleuses sélectionnables. |
| `js/univers/espace/eclipses.js` | 1.9 Ko | Éclipses : recherche de la prochaine éclipse de Soleil ou de Lune par la géométrie réelle Soleil–Terre–Lune (module pur, testé sous node). |
| `js/univers/espace/effets.js` | 4.1 Ko | Rayons crépusculaires (« god rays ») du Soleil, calculés en un seul passage plein écran, additif, SANS second rendu de la scène : |
| `js/univers/espace/geo-calques.js` | 12.0 Ko | Géographie de la Terre : frontières, zone surlignée, recherche du pays sous un point, étiquettes (pays, villes, océans, mers) qui apparaisse |
| `js/univers/espace/mars/decor.js` | 12.8 Ko | Décor de la surface de Mars (unités : mètres) : terrain, ciel martien, Soleil, Phobos et Deimos, rochers, poussière. |
| `js/univers/espace/mars/edl.js` | 13.7 Ko | Entrée, descente et atterrissage (EDL) d'un rover martien : capsule (bouclier thermique + coque arrière), parachute, étage de descente à hui |
| `js/univers/espace/mars/rover.js` | 11.4 Ko | Rovers martiens en 3D : Perseverance (modèle NASA « Mars 2020 », domaine public, ui/assets/espace/modeles/perseverance.glb : 75 pièces nommé |
| `js/univers/espace/satellites.js` | 7.9 Ko | Satellites réels et ISS : positions calculées par SGP4 (ui/sgp4.js) à partir des éléments publics de CelesTrak (stations + « visual » : les  |
| `js/univers/espace/systeme.js` | 14.6 Ko | Système solaire : le Soleil, les huit planètes (textures réelles, anneaux de Saturne, lunes principales), les orbites, Cérès, Vesta et la ce |
| `js/univers/espace/terre.js` | 25.4 Ko | La Terre, la Lune et le Soleil du thème Espace (rendu réaliste). |
| `js/univers/espace/vue-mars.js` | 25.0 Ko | VUE « MARS » du thème Espace : « Atterrir sur Mars » (approche, entrée atmosphérique avec flammes, parachute, rétrofusées, grue céleste, pou |
| `js/univers/espace/vue-systeme.js` | 13.8 Ko | VUE « SYSTÈME SOLAIRE » du thème Espace : planètes, Soleil, lunes, Cérès, Vesta, ceinture d'astéroïdes ; sélection, vol de caméra, fiches, p |
| `js/univers/navale/ciel.js` | 9.6 Ko | Ciel du thème Bataille navale : dôme à dégradé, Soleil et Lune (avec phase), étoiles qui scintillent la nuit, nuages « dessin animé » à pali |
| `js/univers/navale/equipage.js` | 7.8 Ko | Équipage animé : matelots, officiers (tricorne, habit bleu), canonniers (bonnet rouge, bras nus), fusiliers de marine (habit rouge), marins  |
| `js/univers/navale/flotte.js` | 20.0 Ko | Flotte : physique à voile (vent, cap, vitesse, gîte, flottaison sur la houle), artillerie (bordées, recul, boulets balistiques), dégâts prog |
| `js/univers/navale/fusion.js` | 2.3 Ko | Fusion de géométries avec attributs personnalisés (couleurs par sommet, type de pièce, mât, sommet de pivot…) : un seul maillage par navire  |
| `js/univers/navale/interieur.js` | 49.8 Ko | Visite de l'INTÉRIEUR d'un navire (PC et tablette) : on marche en première personne sur le pont, puis on descend par les échelles dans les b |
| `js/univers/navale/mer.js` | 7.6 Ko | Mer animée du thème Bataille navale : vagues de Gerstner (4 trains, dirigés selon le vent), écume sur les crêtes, reflets et bandes de coule |
| `js/univers/navale/meteo.js` | 7.3 Ko | Météo et heure réelles du thème « Bataille navale » : vent, pluie, orage, brouillard, nuages, houle, aube / jour / crépuscule / nuit. |
| `js/univers/navale/navire-geo.js` | 31.0 Ko | Générateur de navires du XVIIIe siècle : coque galbée (carènes cuivrées, bandes de sabords), pont, gaillards, galerie de poupe, mâts à hunes |
| `js/univers/navale/son.js` | 3.8 Ko | Sons synthétisés (Web Audio, aucun fichier) : coups de canon, impacts, éclaboussures, craquements de bois, naufrage, mer et vent, cris de l' |
| `js/univers/navale/toon.js` | 2.6 Ko | Rendu « dessin animé » du thème Bataille navale : matériaux à paliers de lumière (cel-shading), contours épais (coque inversée), couleurs ri |
| `js/univers/noyau.js` | 23.6 Ko | UNIVERS 3D : noyau commun à tous les thèmes |
| `js/univers/theme-espace.js` | 42.0 Ko | THÈME « ESPACE » : Terre interactive, Lune, Soleil, actualités, présentations |
| `js/univers/theme-navale.js` | 27.1 Ko | THÈME « BATAILLE NAVALE, ANNÉES 1700 » (rendu dessin animé) |
| `js/univers/transitions.js` | 5.6 Ko | Transitions entre thèmes de l'Univers : zoom continu depuis la Terre jusqu'à un océan (Espace → Bataille navale) et retour (Bataille navale  |

### js/vendor/ — 7 fichiers, 475.7 Ko

| Fichier | Poids | Rôle |
|---|---|---|
| `js/vendor/leaflet/leaflet.css` | 14.5 Ko |  |
| `js/vendor/leaflet/leaflet.js` | 144.1 Ko |  |
| `js/vendor/lightweight-charts.LICENSE` | 11.3 Ko |  |
| `js/vendor/lightweight-charts.js` | 193.3 Ko |  |
| `js/vendor/topojson-client.min.js` | 7.0 Ko |  |
| `js/vendor/world-110m.json` | 105.2 Ko |  |
| `js/vendor/world-atlas.LICENSE` | 0.3 Ko |  |

### relais-pc/ — 7 fichiers, 22.8 Ko

| Fichier | Poids | Rôle |
|---|---|---|
| `relais-pc/actions.mjs` | 10.2 Ko | Relais PC de Raylé : la LISTE BLANCHE des actions et la façon de les exécuter (sans aucune commande libre). |
| `relais-pc/config.exemple.json` | 0.5 Ko |  |
| `relais-pc/desinstaller.cmd` | 0.1 Ko |  |
| `relais-pc/desinstaller.mjs` | 1.4 Ko | Désinstallation du relais PC (lancée par desinstaller.cmd) : arrête le relais, retire le lancement au démarrage |
| `relais-pc/installer.cmd` | 0.1 Ko |  |
| `relais-pc/installer.mjs` | 3.7 Ko | Installation du relais PC (lancée par installer.cmd, en double-clic). |
| `relais-pc/relais.mjs` | 6.6 Ko | Relais PC de Raylé (phase 3B) : tourne en arrière-plan, invisible, très économe. |

### scripts/ — 17 fichiers, 111.1 Ko

| Fichier | Poids | Rôle |
|---|---|---|
| `scripts/ancres-bp3d.mjs` | 3.6 Ko | Ancres de peau : les os de BodyParts3D auxquels les tissus mous (muscles, vaisseaux, organes) sont rattachés. |
| `scripts/banc-navigateur.mjs` | 6.8 Ko | Banc d'essai navigateur : sert le dossier du projet en local, lance Chrome (sans fenêtre) et le pilote par le protocole DevTools. |
| `scripts/capacites.mjs` | 0.8 Ko | Génère docs/capacites.md depuis le registre des capacités (js/rayle/capacites.js) chargé avec les vrais analyseurs de Raylé. |
| `scripts/compresser-glb.mjs` | 1.7 Ko | Compresse les GLB de l'atlas anatomique avec EXT_meshopt_compression (décodé par three/addons/libs/meshopt_decoder.module.js dans modeles-gl |
| `scripts/convertir-bodyparts3d.mjs` | 6.2 Ko | Assemble les os détaillés de BodyParts3D (DBCLS, CC BY 4.0) en un GLB : mains (carpe 8 os, 5 métacarpiens, 14 phalanges par côté), pieds (ta |
| `scripts/convertir-corps-bp3d.mjs` | 20.1 Ko | Convertit BodyParts3D (DBCLS, CC BY 4.0) en couches GLB pour Raylé : tous les maillages viennent du MÊME corps, donc les insertions des musc |
| `scripts/convertir-squelette.mjs` | 10.8 Ko | Convertit le squelette OBJ « Human Skeleton 3D Model » (Armen Barsegyan, CC0, https://cgicoffee.com/blog/2017/10/free-human-skeleton-3d-mode |
| `scripts/cuire-squelette.mjs` | 1.5 Ko | Ajoute à un GLB produit par convertir-squelette / lib-glb l'épiphyse et l'occlusion ambiante cuites (attribut _FIBRE) et le quantifie (KHR_m |
| `scripts/generer-centres-pays.mjs` | 2.7 Ko | Génère ui/espace-pays-centres.js : centre (latitude, longitude) et étendue de chaque pays du jeu de contours world-atlas (js/vendor/world-11 |
| `scripts/icones.mjs` | 5.5 Ko | Génère icones/*.svg (entité Raylé : sphère de points) puis, avec Edge sans tête, icones/*.png. |
| `scripts/lib-bp3d.mjs` | 4.9 Ko | Lecture de BodyParts3D (DBCLS, CC BY 4.0) pour les scripts de conversion de Raylé (module partagé, pas chargé par l'application). |
| `scripts/lib-glb.mjs` | 20.3 Ko | Outils GLB sans dépendance pour les scripts de conversion d'Raylé (module partagé, pas chargé par l'application). |
| `scripts/optimiser-glb.mjs` | 4.8 Ko | Allège un GLB pour une tablette : décompresse Draco, soude et simplifie les maillages (meshoptimizer), réduit les textures (WebP), retire le |
| `scripts/sources-espace.mjs` | 4.6 Ko | Génère docs/espace-sources.md depuis la base de connaissances (ui/espace-savoir.js) : chaque fiche, chaque champ, sa source. |
| `scripts/traces-nerfs-donnees.mjs` | 5.5 Ko | Données des tracés de nerfs (langage décrit dans traces-nerfs.mjs). Chaque tracé : id (celui de l'application), rayon (m), sym, membre, et s |
| `scripts/traces-nerfs.mjs` | 8.3 Ko | Tracé des nerfs périphériques : BodyParts3D n'a pas de nerfs périphériques ; leur trajet est reconstitué d'après les descriptions de Gray's  |
| `scripts/versionner.mjs` | 3.1 Ko | Cache-busting : écrit ?v=VERSION sur tous les CSS/JS locaux (balises de index.html, imports des modules du terminal, chargements dynamiques) |

### tests/ — 49 fichiers, 488.4 Ko

`ambiance-test.mjs` · `ambiance-worker-test.mjs` · `anatomie-cerveau-test.mjs` · `anatomie-commandes-test.mjs` · `anatomie-corps-test.mjs` · `anatomie-cours-test.mjs` · `anatomie-executer-test.mjs` · `anatomie-moteur-test.mjs` · `anatomie-presentation-test.mjs` · `anatomie-squelette-test.mjs` · `appareils-commandes-test.mjs` · `appareils-worker-test.mjs` · `cadrage-test.mjs` · `capacites-test.mjs` · `capacites-worker-test.mjs` · `clap-test.mjs` · `commandes-espace-test.mjs` · `commandes-terminal-test.mjs` · `discretion-test.mjs` · `drive-auth-test.mjs` · `drive-lots-test.mjs` · `drive-memoire-test.mjs` · `drive-test.mjs` · `drive-worker-test.mjs` · `espace-assets-test.mjs` · `espace-astres-test.mjs` · `espace-iss-test.mjs` · `espace-savoir-test.mjs` · `espace-terre-test.mjs` · `espace-test.mjs` · `iss-tle-test.mjs` · `jarvis-test.mjs` · `lib-capacites.mjs` · `lib-drive.mjs` · `localisation-test.mjs` · `monde-commandes-test.mjs` · `page-agent-test.mjs` · `rangement-test.mjs` · `relais-test.mjs` · `repertoire-commandes-test.mjs` · `repertoire-worker-test.mjs` · `sgp4-test.mjs` · `ui-commandes-test.mjs` · `univers-donnees-test.mjs` · `univers-eclipses-test.mjs` · `univers-mars-test.mjs` · `univers-navale-test.mjs` · `univers-systeme-test.mjs` · `univers-voix-test.mjs`

Chaque test s'exécute avec `node tests/xxx-test.mjs` (aucun framework).

### ui/ — 30 fichiers, 569.1 Ko

| Fichier | Poids | Rôle |
|---|---|---|
| `ui/ambiance-fx.js` | 9.7 Ko |  |
| `ui/ambiance-reglages.js` | 6.6 Ko | RÉGLAGES → AMBIANCE |
| `ui/ambiance.js` | 31.5 Ko |  |
| `ui/astro.js` | 9.3 Ko |  |
| `ui/background.js` | 10.7 Ko |  |
| `ui/cadrage.js` | 16.5 Ko |  |
| `ui/entity-neurones.js` | 20.2 Ko | ENTITÉ « NEURONES » : un cerveau-sphère holographique en pleine activité |
| `ui/entity.js` | 12.4 Ko | ENTITÉ : profondeur autour de la sphère de particules |
| `ui/espace-astres.js` | 25.5 Ko | ASTRES RÉALISTES DU FOND « ESPACE » : shaders et textures réelles (RayleUI.espaceAstres) |
| `ui/espace-extras.js` | 17.4 Ko | FOND ESPACE : ISS détaillée, rovers martiens, trou noir à lentille gravitationnelle, lieux de la Terre |
| `ui/espace-iss.js` | 15.9 Ko |  |
| `ui/espace-lieux.js` | 10.7 Ko | FOND ESPACE : lieux de la Terre, rovers martiens, trou noir et fiches éducatives (données, aucun dessin) |
| `ui/espace-pays-centres.js` | 4.2 Ko | Centres des pays (généré par scripts/generer-centres-pays.mjs depuis les contours world-atlas, ISC) : [code ISO numérique, latitude, longitu |
| `ui/espace-reglages.js` | 3.7 Ko | RÉGLAGES → ESPACE |
| `ui/espace-savoir.js` | 48.0 Ko | BASE DE CONNAISSANCES « ESPACE » (RayleUI.savoir) |
| `ui/espace-temps.js` | 4.0 Ko | TERRE VIVANTE : horloge virtuelle et rotation à la main (pur : aucun accès à la scène) |
| `ui/espace-terre-3d.js` | 21.2 Ko | TERRE VIVANTE : objets 3D, panneau et rotation à la main (monté par ui/fond-espace.js) |
| `ui/espace-terre-donnees.js` | 14.5 Ko | TERRE VIVANTE : données du trafic simulé et des villes (aucun dessin) |
| `ui/espace-terre.js` | 29.4 Ko | TERRE VIVANTE : trafic simulé, épingles, tracés, frontières, temps et rotation (outils de Raylé sur la Terre) |
| `ui/espace-textures.js` | 16.4 Ko |  |
| `ui/espace.js` | 43.6 Ko |  |
| `ui/fond-espace.js` | 65.7 Ko |  |
| `ui/fond-globe.js` | 19.9 Ko |  |
| `ui/fond-jarvis.js` | 48.7 Ko |  |
| `ui/fond-video.js` | 2.6 Ko | FOND « VILLE RÉELLE » : vraie vidéo de ville de nuit en timelapse, en boucle, sans son |
| `ui/panels.js` | 4.9 Ko | PANNEAUX HOLOGRAPHIQUES : réglages de l'étape « Jarvis » |
| `ui/settings.js` | 21.2 Ko | RÉGLAGES D'APPARENCE : thème, fond animé, niveau d'animation |
| `ui/sgp4.js` | 8.6 Ko | SGP4 (orbite proche de la Terre) : position de l'ISS à partir d'un TLE |
| `ui/themes.js` | 4.1 Ko | THÈMES : 6 packs de couleurs |
| `ui/ui.css` | 22.2 Ko | RAYLÉ « JARVIS » : thèmes, fond animé, halos, panneaux holographiques, réglages d'apparence |

### ui/assets/ — 16 fichiers, 14.0 Mo

- `ville-paysage.mp4` (4.4 Mo)
- `ville-portrait.mp4` (3.1 Mo)
- `terre-jour-8192.jpg` (2.4 Mo)
- `terre-nuit-8192.jpg` (1.1 Mo)
- `terre-jour-4096.jpg` (801.1 Ko)
- `nuages-2048.jpg` (536.1 Ko)
- `terre-nuit-4096.jpg` (430.9 Ko)
- `fond-jarvis-coeur.webp` (287.9 Ko)
- `terre-jour-2048.jpg` (247.1 Ko)
- `fond-globe-planete.webp` (141.6 Ko)
- `fond-jarvis-paysage.webp` (134.0 Ko)
- `terre-nuit-2048.jpg` (133.8 Ko)
- `fond-jarvis-portrait.webp` (129.3 Ko)
- `fond-espace-portrait.webp` (91.9 Ko)
- `fond-espace-paysage.webp` (15.4 Ko)
- `CREDITS.txt` (4.3 Ko)

### ui/assets/anatomie/ — 14 fichiers, 26.1 Mo

- `muscles-bp3d.glb` (9.5 Mo)
- `os-detail-bp3d.glb` (5.5 Mo)
- `os-axial-bp3d.glb` (4.2 Mo)
- `organes-bp3d.glb` (1.7 Mo)
- `cerveau-bp3d.glb` (1.7 Mo)
- `squelette-cc0.glb` (1.1 Mo)
- `veines-bp3d.glb` (713.4 Ko)
- `arteres-bp3d.glb` (613.5 Ko)
- `nerfs-bp3d.glb` (477.8 Ko)
- `tendons-bp3d.glb` (393.2 Ko)
- `veines-fin-bp3d.glb` (190.7 Ko)
- `arteres-fin-bp3d.glb` (63.3 Ko)
- `LISEZMOI.md` (3.6 Ko)
- `manifest.json` (0.8 Ko)

### ui/assets/espace/ — 24 fichiers, 4.0 Mo

- `modeles/perseverance.glb` (847.8 Ko)
- `lune-2k.webp` (760.8 Ko)
- `mercure-2k.webp` (614.7 Ko)
- `mars-2k.webp` (352.8 Ko)
- `modeles/iss.glb` (265.8 Ko)
- `terre-relief-2k.webp` (254.3 Ko)
- `jupiter-2k.webp` (209.3 Ko)
- `lune-1k.webp` (162.2 Ko)
- `mercure-1k.webp` (130.0 Ko)
- `ciel-4k.webp` (115.8 Ko)
- `mars-1k.webp` (87.3 Ko)
- `venus-2k.webp` (67.7 Ko)
- `jupiter-1k.webp` (60.2 Ko)
- `saturne-2k.webp` (58.8 Ko)
- `terre-ocean-1k.webp` (34.5 Ko)
- `ciel-2k.webp` (31.3 Ko)
- `neptune-2k.webp` (26.3 Ko)
- `venus-1k.webp` (18.4 Ko)
- `saturne-1k.webp` (14.8 Ko)
- `uranus-2k.webp` (10.9 Ko)
- `neptune-1k.webp` (7.4 Ko)
- `uranus-1k.webp` (2.9 Ko)
- `saturne-anneaux.webp` (2.1 Ko)
- `modeles/manifest.json` (0.1 Ko)
