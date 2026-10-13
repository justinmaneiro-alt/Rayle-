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

changer le thème de couleurs, le fond (Espace, Jarvis, vidéo, aucun), l’entité, l’ambiance météo et lumineuse, la qualité graphique.

- **Paramètres (lus dans le code)** : thèmes : originel, arc, rouge, aurore, ambre, nébuleuse · fonds : aucun, espace, jarvis, vidéo · entités : sphère, neurones.
- **Exemples** : « passe en thème Aurore », « fond espace », « mode éco ».
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

