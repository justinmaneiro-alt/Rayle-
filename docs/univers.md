# Univers 3D de Raylé

Bouton **🌌 Univers** dans la barre du bas (ou « ouvre l'Univers »). Une scène plein écran, tactile (un doigt = tourner, pincer = zoomer) et souris/clavier, avec un thème (d'autres pourront être ajoutés) :

| Thème | Contenu |
|---|---|
| 🌍 **Espace** | Globe 100 % interactif (zoom continu de l'orbite au sol, frontières, noms de pays / villes / océans, jour-nuit réels, nuages, atmosphère, aurores, éclairs, Lune réelle avec phases, éclipses, actualités géolocalisées, présentations parlées), **système solaire** (8 planètes, lunes, Cérès, Vesta, ceinture d'astéroïdes, échelle didactique ou réelle), galaxies et nébuleuses, **ISS et satellites réels**, **atterrissage sur Mars** (entrée, parachute, grue céleste) avec **rover Perseverance** (modèle NASA) ou Curiosity, pièces cliquables |

## Fond de l'accueil : l'Univers piloté par Raylé

Quand **Réglages → Fond = Univers** (le réglage par défaut sur PC, palier Max/Auto), la scène 3D du bouton Univers (Terre, Lune, système solaire, Mars, ISS, satellites, éclipses, ciel réel…) tourne **derrière l'accueil**, sous l'entité, **sans menu ni HUD** (mode « fond » de `js/univers/noyau.js`, `ouvrirFond()`). C'est la même scène que le plein écran : le bouton 🌌 Univers la passe en plein écran **sans la recharger**, et « ✕ Quitter » ou « ferme l'Univers » rend l'accueil avec la scène en fond.

Raylé la pilote **en direct par la voix, sans ouvrir le menu**. Les puces du menu Univers sont des commandes vocales :

| Puce | Phrase |
|---|---|
| Espace / Terre | « reviens sur la Terre », « montre la Terre » |
| Système solaire | « montre le système solaire », « retour au système solaire » |
| Mars | « montre-moi Mars » (la planète), « montre la vue Mars » / « ouvre la base de Mars » (atterrissage, rovers) |
| Vue d'ensemble | « vue d'ensemble » (plan large de la vue où l'on est : Terre, système solaire ou Mars) |
| Terre–Lune | « Terre-Lune », « la Terre et la Lune » |
| Lune de près | « la Lune de près », « pose-toi près de la Lune » |
| ISS · Satellites | « montre l'ISS », « montre les satellites » |
| Éclipse | « la prochaine éclipse » |
| Actualités | « montre les actualités » |
| Appareils | « où sont mes appareils » |
| Temps réel | « temps réel », « accélère le temps », « fige le temps » |
| Ciel réel | « ciel réel », « change le ciel » |

On peut enchaîner : « montre Mars puis Saturne » (chaque étape attend la fin du vol de la précédente ; une étape incomprise annule l'enchaînement). L'outil « commande_espace » de l'IA passe par les mêmes phrases.

- **Mode fond** : canvas plein écran non cliquable (`pointer-events:none`), 1 pixel par pixel CSS, 30 images/s au plus, en pause quand l'onglet est caché, que le terminal/l'anatomie/les Réglages sont ouverts. Rotation lente de la Terre quand rien d'autre ne bouge (« arrête de tourner » la coupe). La caméra se tient un peu plus loin (4,7 rayons) pour laisser l'entité au centre.
- **Éco** (palier 2) ou WebGL absent : le fond reste l'image fixe pré-rendue (`fond-espace-*.webp` + Terre), il n'y a plus de scène à piloter : les commandes ouvrent alors l'Univers en plein écran, comme avant.
- **Sans le fond Univers** (Jarvis ou Aucun) : « montre-moi Mars » ouvre l'Univers en plein écran ; « reviens sur la Terre » ne fait rien.
- Les noms de lieux (« montre-moi le Japon ») restent pour la page Monde tant que l'Univers est en fond ; le plein écran les prend.
- L'ancien fond « Espace » (astéroïdes, comètes, planètes dessinées par `ui/fond-espace.js`) est supprimé, avec ses réglages (éléments activables, échelle, « vue par défaut »).
- État partagé : `RayleBus.etat('univers')` = `{ouvert, fond, mode}` ; `ouvert` ne vaut vrai qu'en plein écran (c'est ce qui met l'entité en petite bulle). `RayleUnivers` : `fond(oui)`, `assurer()`, `estOuvert/estPlein/estFond`.

## Commandes vocales (sans IA)
Analysées par `analyserUnivers` (`js/rayle/commandes-univers.js`, testée par `tests/univers-voix-test.mjs`).

- Ouvrir / quitter : « ouvre l'Univers » (plein écran), « quitte l'Univers » (rend l'accueil, la scène reste en fond) · **ranger Raylé** : « réduis-toi », « rouvre-toi »
- Globe : « présente la France », « montre l'océan Pacifique », « montre les actualités », « montre la Lune », « prochaine éclipse », « accélère le temps », « surprends-moi »
- Système solaire : « montre le système solaire », « va sur Mars », « montre Jupiter », « échelle réelle », « ISS », « montre les satellites »
- Mars : « atterris sur Mars », « montre le rover Perseverance », « montre l'autre rover », « montre la caméra du rover », « orbite de Mars »
- Retour : « retourne dans l'espace », « reviens sur la Terre », « vue d'ensemble »
- Vues : « Terre-Lune », « la Lune de près », « ciel réel », « temps réel », « montre la vue Mars »
- Divers : « passe l'animation », « mets la qualité en haute / moyenne / basse »

## Qualité et tablette
Menu **Basse / Moyenne / Haute / Auto** (conservé dans `rayle_univers_qualite`). Auto mesure les images par seconde et descend d'un cran si besoin. Chaque qualité règle : résolution de rendu, particules, contours, textures de la Terre. Tactile : un doigt = tourner, pincer = zoomer. PC : souris et molette.

**« Passer l'animation »** : bouton qui apparaît pendant les cinématiques (atterrissage sur Mars…), aussi Échap ou Espace. Chaque étape va directement à sa fin, sans coupure.

## Ajouter un thème
1. Écrire `js/univers/theme-xxx.js` : `export default { id, nom, icone, async creer(ctx) → { scene, camera, maj(dt,t), menu(), commande(nom,args), tap(x,y), detruire(), etat() } }` (`ctx` : THREE, renderer, canvas, noyau, qualité `q`, `options`).
2. L'ajouter à `THEMES` dans `js/univers/noyau.js`.
3. Le changement entre deux thèmes se fait par un fondu au noir.
4. Brancher les phrases dans `analyserNouveau()` (`js/rayle/commandes-univers.js`) et un exemple dans `js/rayle/capacites.js`.

## Fichiers
```
js/univers/noyau.js            vue, rendu, modes plein écran / fond, qualité, tweens/cinématiques, étiquettes, hud, registre des thèmes
js/univers/theme-espace.js     globe + vues chargées à la demande (système solaire, Mars)
js/univers/espace/*            Terre, ciel, frontières, éclipses, actualités, satellites, système solaire, Mars (edl, rover, décor)
js/univers/donnees/*           pays, mers, planètes, rovers, textes de présentation
js/rayle/commandes-univers.js  pont avec l'assistant vocal, analyse des phrases
js/rayle/rangement.js          bulle « Ranger Raylé »
js/rayle/localisation.js       « où sont mes appareils » (consentement, position, panneau Appareils)
```

## Tests
`for f in tests/*-test.mjs; do node $f; done` — notamment `univers-donnees`, `univers-eclipses`, `univers-systeme`, `univers-mars`, `univers-voix` (dont le fond Univers), `rangement`, `localisation`. Contrôle visuel : `scripts/banc-navigateur.mjs` (Chrome sans écran piloté).

## Limites connues
- Positions des planètes et éclipses : éléments orbitaux simplifiés (précision de l'ordre du degré) ; éclipses 2026-2027 par tableau.
- Actualités : dépendent de franceinfo (flux RSS) et du Worker ; GDELT est souvent bloqué par le navigateur (CORS).
- « Où sont mes appareils » : la route `/appareil/position` du Worker (`worker/worker.js`) doit être recollée dans Cloudflare.
- Curiosity est un modèle dessiné par le code (pas de modèle NASA libre assez léger).
- Les images par seconde sur tablette n'ont pas été mesurées sur un vrai appareil (mesures faites avec un rendu logiciel) : utiliser la qualité Basse si besoin.
