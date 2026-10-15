# Capacités de Raylé

Généré depuis le code par `node scripts/capacites.mjs` (registre : `js/rayle/capacites.js`). Ne pas modifier à la main.

## Espace en 3D

montrer ou visiter un astre, un rover, le trou noir, l’ISS, un pays ou un monument sur la Terre (la caméra y vole, une fiche s’affiche, je dis un ou deux faits) · zoomer · revenir sur la Terre · garder une vue par défaut · échelle réaliste ou pédagogique · afficher ou masquer planètes, astéroïdes, comètes, satellites, aurores, Lune, Voie lactée · enchaîner plusieurs étapes.

- **Paramètres (lus dans le code)** : cibles : Soleil, Lune, ISS, Terre, Mercure, Vénus, Mars, Jupiter, Saturne, Uranus, Neptune · rovers : Perseverance (le cratère Jezero), Curiosity (le cratère Gale) · trou noir · 127 lieux de la Terre (pays, capitales, monuments) · éléments : planètes, astéroïdes, comètes et étoiles filantes, satellites et iss, lune, aurores polaires, voie lactée et nébuleuses, éclat du soleil (lens-flare) · échelles : réaliste, pédagogique.
- **Cas limites** : les lunes autres que la Lune (Io, Titan…) ne sont pas des cibles de vol : j’en parle, je ne les survole pas ; en qualité Éco le fond est une image fixe : pas de vol ni de zoom (je le dis) ; un nom mal écrit (« perseverence ») est corrigé tout seul ; le fond Espace s’active automatiquement quand on me demande un astre.
- **Exemples** : « montre-moi Mars », « emmène-moi voir Saturne », « montre Perseverance », « montre-moi le trou noir », « où est Curiosity », « zoome dessus », « et sa lune », « reviens sur la Terre », « garde cette vue », « échelle réaliste », « mode pédagogique », « désactive les astéroïdes », « montre Mars puis Perseverance ».
- **Vérification automatique** : oui (les exemples sont passés dans l’analyseur réel par `tests/capacites-test.mjs`).

## Savoir sur l’espace

répondre sans IA, avec des fiches sourcées NASA/ESA, aux questions chiffrées sur le Soleil, la Lune, les huit planètes, les lunes majeures, la ceinture d’astéroïdes, les comètes (Halley, Tchouri), le trou noir, l’ISS, Hubble, Webb, Curiosity, Perseverance et les grandes missions · expliquer, comparer deux astres point par point · dire « je n’ai pas cette donnée » plutôt qu’inventer.

- **Paramètres (lus dans le code)** : fiches : Soleil, Mercure, Vénus, Terre, Lune, Mars, Jupiter, Saturne, Uranus, Neptune, Io, Europe, Ganymède, Callisto, Titan, Encelade, Triton, Phobos, Déimos, Charon, ceinture d’astéroïdes, comète de Halley, comète Tchouri, trou noir, Station spatiale internationale, télescope spatial Hubble, télescope spatial James Webb, rover Curiosity, rover Perseverance, Voyager 1, Voyager 2, Apollo 11, Cassini, New Horizons, Rosetta.
- **Cas limites** : seules les données de la fiche sont dites : si un chiffre manque, je le dis ; les valeurs « du jour » (distance de Mars aujourd’hui, position de l’ISS) sont calculées, pas lues dans les fiches.
- **Exemples** : « quelle est la taille de Mars », « compare Mars et la Terre », « parle-moi de l’ISS », « combien de lunes a Saturne », « Mars est-elle plus grosse que la Terre », « quand Voyager 1 a été lancé ».
- **Vérification automatique** : oui (les exemples sont passés dans l’analyseur réel par `tests/capacites-test.mjs`).

## Terre vivante (outils du globe)

sur le globe : placer des points (couleur au choix), tracer un trajet ou les frontières d’un pays, tout effacer, zoomer sur une ville ou un pays · accélérer, figer ou décaler le temps · faire tourner la Terre à la main · vols et bateaux SIMULÉS · lumières des villes · actualité d’un pays (sources citées).

- **Paramètres (lus dans le code)** : 170 pays, 150 villes, capitales et monuments ; couleurs : rouge, bleu, vert, jaune, orange, violet, rose, blanc, cyan ; vitesses du temps : ×60, ×600, 1 heure, 6 heures, 1 jour par seconde ; jusqu’à 60 points et 12 tracés ; trafic : environ 420 avions et 160 bateaux simulés (900 et 360 en Ultra).
- **Cas limites** : le trafic est SIMULÉ (routes plausibles, vitesses accélérées ×240 pour les avions et ×1 800 pour les bateaux en mode pédagogique) et l’écran l’écrit ; le temps réel des vols n’existe que si le Worker fournit la route /vols ; les frontières viennent d’un jeu à l’échelle 1:110 millions : un repère, pas une frontière juridique ; l’actualité d’un pays vient uniquement des sources du Worker, citées ; sans elles, je dis que je n’ai rien de fiable et je n’invente rien ; en mode Éco le fond est une image fixe : ces outils demandent Auto, Max ou Ultra.
- **Exemples** : « place un point à Tokyo », « trace un trajet de Paris à Tokyo », « trace les frontières du Japon », « efface les points », « zoome sur Lyon », « accélère le temps », « une heure par seconde », « remets l’heure réelle », « fais tourner la Terre à la main », « affiche les vols », « masque les lumières des villes », « montre les actualités du Japon sur le globe ».
- **Vérification automatique** : oui (les exemples sont passés dans l’analyseur réel par `tests/capacites-test.mjs`).

## Terminal de trading

ouvrir ou fermer le terminal, changer d’actif, d’unité de temps, de page, afficher des panneaux, régler le graphique (RSI, supports, moyenne mobile), annoter.

- **Paramètres (lus dans le code)** : actifs : le Nasdaq, le Bitcoin, Solana, l'or, l'euro dollar · panneaux : le dashboard, le contexte de marché, le graphique, le RSI, le carnet d'ordres, les notes, le calendrier · unités M5 à D1 · pages Marchés, COT, Analyse.
- **Cas limites** : je n’exécute jamais d’ordre de trading : j’explique et j’alerte, la décision reste à Justin.
- **Exemples** : « ouvre le terminal », « passe sur le Bitcoin », « mets M15 », « ajoute le RSI », « ouvre la page marchés », « ferme le terminal ».
- **Vérification automatique** : oui (les exemples sont passés dans l’analyseur réel par `tests/capacites-test.mjs`).

## Carte du monde

ouvrir la page Monde du terminal, montrer un pays ou une région, afficher l’inflation, le chômage, la croissance, le PIB ou les taux sur la carte, couches (bourses, actualités, calendrier).

- **Paramètres (lus dans le code)** : pays et régions de la carte du monde ; indicateurs : inflation, chômage, croissance, PIB, taux directeurs.
- **Cas limites** : les villes et adresses vont sur la carte Leaflet, pas sur la page Monde.
- **Exemples** : « ouvre la carte du monde », « montre-moi le Japon », « zoom sur l’Europe », « affiche l’inflation sur la carte », « vue Terre ».
- **Vérification automatique** : oui (les exemples sont passés dans l’analyseur réel par `tests/capacites-test.mjs`).

## Anatomie et orthopédie 3D

décrire une structure du corps (os, muscles, nerfs, organes) dans une fenêtre 3D, ouvrir le module anatomie, afficher des calques, simuler des pathologies (scoliose, fracture, amputation) et des appareillages (prothèse, orthèse).

- **Paramètres (lus dans le code)** : os, muscles, nerfs, organes, calques, pathologies et appareillages du module Anatomie ; les cours enregistrés par Justin complètent les réponses.
- **Cas limites** : usage éducatif : ce n’est pas un avis médical.
- **Exemples** : « décris-moi l’humérus », « où s’insère le biceps », « ouvre l’anatomie », « affiche les muscles et les nerfs », « montre une fracture du col du fémur », « scoliose de 40 degrés ».
- **Vérification automatique** : oui (les exemples sont passés dans l’analyseur réel par `tests/capacites-test.mjs`).

## Présentations animées du corps

présenter en animation 3D un os, un muscle, un nerf, un vaisseau ou un organe (caméra, étiquettes, narration, sous-titres) · présenter un membre, le tronc, la tête ou le corps entier couche par couche · pause, suivant, vitesse, plein écran.

- **Paramètres (lus dans le code)** : cibles : toute structure de la base d’anatomie (os, muscles, nerfs, artères, veines, organes), les groupes (quadriceps, rachis, main…) et les régions jambe, bras, tronc, tête, corps entier ; le texte vient des fiches sourcées (Gray 1918, Terminologia Anatomica), les références sont dites à la fin.
- **Cas limites** : aucun fait inventé : une information absente des fiches est dite absente ; la peau n’a pas de fiche détaillée : seule l’enveloppe est montrée ; la voix suit le réglage de Raylé ; sans voix, les sous-titres défilent seuls ; « décris-moi l’humérus » garde le petit aperçu 3D, « présente l’humérus » lance l’animation.
- **Exemples** : « présente le fémur », « présente-moi le biceps brachial », « présente le nerf médian », « présente tout le bras couche par couche », « présente la jambe couche par couche », « présente le corps entier ».
- **Vérification automatique** : oui (les exemples sont passés dans l’analyseur réel par `tests/capacites-test.mjs`).

## Cerveau 3D

ouvrir la fenêtre Cerveau 3D : montrer et expliquer une zone (lobes, hippocampe, amygdale, thalamus, cervelet…) · réseaux de neurones animés (vision, langage, mouvement…) · vues et coupes, aires de Brodmann, tour guidé, qualité Éco à Ultra.

- **Paramètres (lus dans le code)** : zones : lobes frontal, pariétal, temporal, occipital, insula, cortex moteur, somesthésique, visuel, auditif, préfrontal, aires de Broca et de Wernicke, gyrus cingulaire, hippocampe, amygdale, thalamus, hypothalamus, noyaux gris centraux, cervelet, tronc cérébral, ventricules, corps calleux, substance blanche · réseaux : vision, langage, mouvement, sensibilité, audition, mémoire, émotion, attention, fonctions exécutives · vues : latérale, médiane, coronale, axiale, dessus, dessous.
- **Cas limites** : les faisceaux de substance blanche et les impulsions des neurones sont schématiques (aucune tractographie de ce cerveau) ; les aires de Brodmann sont approximatives (centres moyens de la littérature) ; les fiches sont rédigées d’après Gray 1918, Purves et Kandel, sans relecture clinique : ce n’est pas un avis médical ; Ultra est très gourmand : je repasse au palier inférieur si l’image devient trop lente, et je ne le choisis jamais seule.
- **Exemples** : « montre l’hippocampe », « explique le lobe frontal », « fais-moi un tour du cerveau », « coupe sagittale du cerveau », « affiche les aires de Brodmann », « montre le réseau de la vision dans le cerveau », « qualité ultra pour le cerveau ».
- **Vérification automatique** : oui (les exemples sont passés dans l’analyseur réel par `tests/capacites-test.mjs`).

## Documents du Drive (Google)

ouvrir, lire, résumer, chercher et modifier (aperçu avant/après, annulation) les Google Docs, PDF, Word, textes, Sheets et Slides que Justin a choisis · fenêtre flottante, plein écran.

- **Paramètres (lus dans le code)** : outils : drive:ouvrir (nom approximatif accepté), drive:lire-passage (paragraphe, titre, page, mot-clé, suite), drive:resumer, drive:chercher, drive:lister, drive:modifier (corriger, remplacer, ajouter, supprimer), drive:enregistrer, drive:annuler · documents autorisés : aucun pour l’instant · connexion : à établir par le bouton « Se connecter à Google ».
- **Cas limites** : je ne vois que les documents choisis avec le sélecteur Google (portée drive.file) ; un document non autorisé : je propose d’ouvrir le sélecteur ; PDF, Sheets et Slides : lecture seule ; toute modification passe par un aperçu avant/après que Justin valide (sauf « applique directement »), puis je relis le document pour vérifier ; « annule la dernière modification » revient en arrière ; je ne dis jamais avoir lu ou modifié un document si l’opération a échoué, et je ne cite que le texte réel du document ; pas de recherche web pour un document de Justin : j’utilise ces outils (ou « commande_drive » avec une phrase simple).
- **Exemples** : « ouvre le cours d’anatomie », « lis le 2e paragraphe », « lis-moi la suite », « résume le document », « cherche l’humérus dans le document », « corrige la faute dans le 2e paragraphe », « ajoute ce paragraphe sous le titre Introduction : voici le texte », « annule la dernière modification », « plein écran », « liste mes documents », « ajoute un document du drive ».
- **Vérification automatique** : oui (les exemples sont passés dans l’analyseur réel par `tests/capacites-test.mjs`).

## Cartes et itinéraires

montrer une ville ou un lieu sur une carte, calculer un itinéraire (voiture, vélo, à pied).

- **Paramètres (lus dans le code)** : lieux du monde entier (OpenStreetMap), itinéraires voiture, vélo, à pied.
- **Cas limites** : les pays et régions vont sur la page Monde.
- **Exemples** : « montre-moi Bordeaux », « itinéraire de Bordeaux à Toulouse à pied ».
- **Vérification automatique** : non (décidé par l’IA ou une API en ligne).

## Apparence

changer le thème de couleurs, le fond (Espace, Jarvis, vidéo, aucun), l’entité, l’ambiance météo et lumineuse, la qualité graphique (Éco, Auto, Max ou Ultra : l’Ultra est très gourmand et jamais choisi seul).

- **Paramètres (lus dans le code)** : thèmes : originel, arc, rouge, aurore, ambre, nébuleuse · fonds : aucun, espace, jarvis, vidéo · entités : sphère, neurones.
- **Exemples** : « passe en thème Aurore », « fond espace », « mode éco », « passe en qualité ultra ».
- **Vérification automatique** : oui (les exemples sont passés dans l’analyseur réel par `tests/capacites-test.mjs`).

## Mémoire et notes

retenir un fait durable, lire ou oublier les notes et les souvenirs, résumer les conversations.

- **Paramètres (lus dans le code)** : notes, souvenirs, règles de trading, résumés de conversation (base du Worker).
- **Cas limites** : « efface ta mémoire » demande une confirmation.
- **Exemples** : « note que j’ai rendez-vous demain », « qu’est-ce que tu as retenu », « oublie la dernière note ».
- **Vérification automatique** : non (décidé par l’IA ou une API en ligne).

## Outils du cerveau en ligne

données de marché et bougies, calendrier économique, alertes et rappels, agenda, météo, actualités, recherche web, YouTube, lecture de documents, cours de Justin, laboratoire de code, Telegram.

- **Paramètres (lus dans le code)** : l’IA choisit et enchaîne ses outils (six étapes au plus) ; les chiffres viennent des outils, jamais de ma mémoire.
- **Cas limites** : pas de recherche web quand un outil local existe (Espace, anatomie, terminal, cartes).
- **Exemples** : « quel est le prix du Bitcoin », « mets une alerte à 70 000 », « quelles sont les actualités ».
- **Vérification automatique** : non (décidé par l’IA ou une API en ligne).

## Univers 3D : globe, système solaire, Mars

Univers 🌌 : globe, système solaire, ISS, Mars et rovers, qualité Basse/Moyenne/Haute.

- **Paramètres (lus dans le code)** : globe, système solaire, Mars et rovers, ISS et satellites ; qualité Basse, Moyenne, Haute ou Auto.
- **Cas limites** : positions des astres et éclipses approximatives, actualités selon franceinfo et le Worker, rendu allégé en qualité Basse.
- **Exemples** : « présente la France », « va sur Mars », « montre le système solaire », « atterris sur Mars », « mets la qualité en basse », « passe l’animation », « réduis-toi », « où sont mes appareils ».
- **Vérification automatique** : non (décidé par l’IA ou une API en ligne).

## Autres appareils, messages et appels

commander le PC, la tablette ou le téléphone (relais), préparer un message ou un appel (c’est Justin qui envoie), gérer le répertoire.

- **Paramètres (lus dans le code)** : liste blanche d’actions par appareil ; jamais d’envoi automatique de message.
- **Cas limites** : je ne lis jamais les messages reçus.
- **Exemples** : « affiche l’or en H4 sur la tablette », « envoie à Maman que je rentre vers 19 heures ».
- **Vérification automatique** : non (décidé par l’IA ou une API en ligne).

## Voix, veille et sécurité

parler plus lentement ou plus vite, mise en veille, arrêt, déverrouillage par phrase secrète.

- **Paramètres (lus dans le code)** : vitesse de la voix, veille, coupure totale, verrou à deux niveaux.
- **Exemples** : « parle plus lentement », « mets-toi en veille ».
- **Vérification automatique** : non (décidé par l’IA ou une API en ligne).

