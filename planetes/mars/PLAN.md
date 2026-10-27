# Mars : plan et état

> Le plan « M1 à M9 » dont parlait la demande n'existait pas dans le dépôt (ni dans `CLAUDE.md`, `VISION.md`, `planetes/`, `docs/`). Les étapes M2 à M9 ci-dessous sont donc **une proposition**, déduite de `CLAUDE.md` et `VISION.md`, à valider par Justin avant d'en lancer une.

## M1 : la base martienne en 3D (FAIT, 2026-10-21)

### Ce que fait M1
- **Vue de l'espace** (`pc/orbite.js`, `pc/base-exterieur.js`) : Mars (même sphère et même texture que la galaxie), atmosphère, Phobos et Deimos, et la **base** posée sur le cratère Jezero (77,5° E, 18,4° N). Deux moitiés bien visibles : **BUREAU** à l'ouest (ambre, « bientôt ») et **TERMINAL DE TRADING** à l'est (cyan). Dômes de verre à nervures, modules, tubes, panneaux solaires (instances), antenne, parabole, piste d'atterrissage avec navette, balises qui clignotent, **lumières qui s'allument à la tombée de la nuit** (halos additifs + bloom).
- **Entrée par le zoom** (comme sur la Terre, `pc/mars-calcul.js` : `SEUILS`, `peutEntrer`, `forceAssist`, `pousser`) : en zoomant vers la base (molette vers l'avant, base à moins de 16° du centre, moins de 15 unités d'altitude), la caméra glisse vers elle et on entre. On ressort en dézoomant au fond du salon (il faut insister) : la caméra reparaît à 34 unités, bien plus haut que le seuil d'entrée (15) et aucune entrée par zoom n'est possible pendant 1,6 s : **pas de va-et-vient**. Dézoomer au maximum en orbite et insister ramène à la galaxie. Transitions : fondu noir court (380 ms) autour de chaque changement de scène.
- **Le salon** (`pc/interieur.js`, `pc/paysage.js`) : une seule pièce de 12 × 8,4 m, grandes baies panoramiques au nord et à l'ouest, bande vitrée à l'est, mur de lames de bois (porte, cuisine ouverte avec îlot et tabourets), poste de travail, canapés, poufs, plantes, lampadaire, plafond à rainures lumineuses. Dehors : terrain martien en maillage polaire (fin près de la base, 9 km de portée, crête de cratère lointaine), rochers instanciés, mât d'antenne, champ solaire, rover ; **ciel martien** (butterscotch le jour, halo bleu autour du soleil au crépuscule, étoiles et Voie lactée la nuit), **Phobos et Deimos à leur vraie position** (orbites réelles, taille × 6), **la Terre en étoile du soir**. Ombres du soleil à travers les baies (qualité haute), reflets du sol et des vitres (carte d'environnement du ciel).
- **La table et les fenêtres** (`pc/hologrammes.js`, `pc/dessin-exemples.js`, `pc/exemples.js`) : au centre, une table holographique ; six fenêtres flottantes (US100 Nasdaq 100, XAU/USD, positions, performance, signaux de l'agent, calendrier et marché). **Tout est factice et marqué EXEMPLE** (sur la fenêtre flottante, dans la grande fenêtre, dans les textes). Clic sur une fenêtre = elle s'ouvre en grand (`core/commun/panneaux.js`, taille `large`) ; clic en dehors, Échap ou bouton Fermer = elle se ferme. Graphique : instruments US100 puis XAU/USD, indicateurs EMA et MA au choix.
- **Heure simulée** : un sol martien se déroule en 20 minutes (curseur et pause en bas) ; départ à 17 h 24 (soleil bas, lumières visibles).
- **Voix et bus d'ordres** (`pc/ordres-mars.js`, manifeste) : « va sur Mars », « entre dans la base », « sors de la base », « va au bureau » (répond « bientôt »), ordres `mars/entrer_base`, `sortir_base`, `visiter_bureau`, `regler_heure`.
- **Qualité** (`mars-calcul.js : profil`) : haute (192 segments, 700 rochers, ombres 2048, 6 lumières), moyenne, basse (téléphone), jeu (minimal). Tactile : glisser, pincer, boutons (entrer, sortir, quitter) ; interface adaptée au téléphone.

### Choix par défaut pris (questions restées ouvertes)
| Question | Valeur retenue |
|---|---|
| Instruments d'abord | US100 « Nasdaq 100 » puis XAU/USD ; BTC, SOL et dollar viendront plus tard |
| Indicateurs | EMA 20 et MA 30 (simples), activables séparément ; RSI, MA200 plus tard |
| Site de la base | cratère Jezero (réel), échelle de la base exagérée (≈ 270 km) pour qu'elle se voie de l'espace |
| « La planète vue de là » | la Terre en étoile du soir, plus Phobos et Deimos |
| Heure de départ / durée d'un jour | 17 h 24, un sol en 20 minutes réelles |
| Textures | aucune texture externe en plus de celle de Mars (Solar System Scope, CC BY 4.0, déjà dans la galaxie) : tout le reste est généré par le code |
| Tablette et téléphone | le même module (qualité basse, tactile) en attendant le terminal 2D sur image fixe |

### Tests
`node planetes/mars/tests/mars-calcul-test.mjs` (calculs : repère, soleil, Phobos, seuils, qualité, terrain) · `node planetes/mars/tests/exemples-test.mjs` · `node galaxie/tests/grammaire-test.mjs` (commandes de la base) · Chrome : `tests-navigateur/mars-test.mjs` (de bout en bout, 53 vérifications), `mars-tactile-test.mjs` (téléphone, 17 vérifications) · captures : `mars-captures.mjs`, `mars-captures-tactile.mjs` (dossier `captures-mars/`, ignoré par git) · mesures : `mars-fps-essai.mjs` (à lancer quand le GPU est libre).

## M2a : terminal de trading réel (FAIT, 2026-10-21) : voir `docs/terminal-mars.md`
Fenêtres de la table réelles, espace de travail multi-panneaux, indicateurs dans le navigateur, historique IndexedDB, voix et ordres, Worker non modifié.

## M2a-bis : le vrai terminal de l'ancien Rayle dans Mars (FAIT, nuit du 2026-10-21)
Bouton « TradingView / Raylé » (TradingView par défaut avec MA 200 et RSI préchargés sur US100 CFD, or, Bitcoin, Solana, EUR/USD ; graphique maison en 2e mode), Dashboard analytique (tendance, RSI, volume net, support, résistance, score par unité et global) et Contexte de marché (VIX, dollar, taux, grandes valeurs), mêmes calculs et sources que l'ancien terminal ; la table ne garde que des fenêtres réelles (sept, sur deux rangées) ; les panneaux factices (positions, signaux, performance) sont supprimés. Vrai widget vérifié dans Chrome et Edge (`tests-navigateur/tradingview-reel.mjs`).

## M3 : l'Agent BTC (FAIT, nuit du 2026-10-21) : voir `docs/agent-btc.md`
M3a données et lecture du marché, M3b moteur de backtest et boucle d'adaptation anti-sur-optimisation, M3c suivi en direct, alertes, compte simulé, fenêtre et voix. **Première recherche réelle : « aucune stratégie robuste trouvée »** (critères figés avant les tests, jeu final non ouvert). Worker Cloudflare non modifié.

## M5 : l'Agent BTC en « poste de pilotage » (FAIT, 2026-10-22) : voir `docs/agent-btc.md` (section M5) et `docs/m5-progression.md`
Grande fenêtre dédiée avec huit onglets et deux modes, recherche SANS FIN anti-hasard (Sharpe déflaté, jeu final partagé avec pénalité), bibliothèque de stratégies persistante, diagnostic « quand ça marche », laboratoire (constructeur sans IA, idée libre traduite par le Worker puis validée par Justin), profil et consignes en français, dérive et suspension, recherche en arrière-plan dans le Veilleur du PC, voix. Worker : route `/agent/idee` préparée, NON déployée.

## Étapes suivantes (numérotation de Justin ; une à la fois, ok entre chaque)
- **M2b** : COT (CFTC), calendrier économique, actualités financières, heatmap, dashboards multi-unités (les onglets existent déjà en « BIENTÔT »).
- **M3 (suite possible)** : plus de familles d'hypothèses, alertes hors ligne (détection dans le cron du Worker + ntfy.sh), positions réelles en lecture seule.
- **M4** : agent IA stratège (scénarios, volume profile commenté, alertes avant les séances ; Raylé n'exécute jamais d'ordre).
- Plus tard : terminal 2D tablette et téléphone sur image fixe ; le bureau (agents IA de trading) ; Bitcoin, Solana, EUR/USD.

## M6 : poste de pilotage final de l'agent (2026-10-23) — journal complet dans `docs/m6-progression.md`
Fait : fiabilité (poison du futur, intégrité, recoupement Kraken, sauvegardes, coûts en R, page de santé), SOL et DOGE, API du graphique pour l'agent (lecture, dessin, « tester ma zone », clic sur bougie, rejeu), capture d'écran (Worker préparé, non déployé), gardien prop, tilt, simulation de réussite de l'évaluation, journal et import CSV, régime 0-100, concepts ICT comme hypothèses, stagnation et pivot, bibliothèque d'idées, 21 fenêtres sur la table (6 de performance), voix étendue, chercheur du Veilleur par paire. Reste : déployer le Worker (accord de Justin), vérifier le contrat réel de Kraken Prop, importer un vrai export CSV (format inconnu : le mappage se propose et se mémorise), vraie tablette et téléphone.
