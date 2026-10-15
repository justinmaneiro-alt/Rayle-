# Capacités de Raylé

Généré depuis le code par `node scripts/capacites.mjs` (registre : `js/rayle/capacites.js`). Ne pas modifier à la main.

## Univers : scène 3D en fond (Terre, Lune, système solaire, Mars, ISS)

quand le fond est « Univers », la scène 3D du bouton Univers tourne derrière l’accueil et je la pilote en direct, sans ouvrir le menu : montrer un astre, la Terre, la Lune (de près ou avec la Terre), le système solaire, Mars, un rover, l’ISS, les satellites, la prochaine éclipse · vue d’ensemble · retour au système solaire · accélérer le temps ou revenir au temps réel · changer de ciel (ciel réel) · zoomer · enchaîner plusieurs étapes.

- **Paramètres (lus dans le code)** : cibles : Soleil, Lune, ISS, Terre, Mercure, Vénus, Mars, Jupiter, Saturne, Uranus, Neptune · rovers : Perseverance (le cratère Jezero), Curiosity (le cratère Gale) · vues : Terre, Terre–Lune, Lune de près, système solaire, Mars (orbite, atterrissage, rover), vue d’ensemble · satellites réels (CelesTrak), éclipses calculées · temps : réel ou accéléré · ciels : réel, spirale, nébuleuse, doré, émeraude, braise.
- **Cas limites** : les lunes autres que la Lune (Io, Titan…) sont des cibles de vol dans la vue du système solaire seulement ; en qualité Éco le fond est une image fixe : aucune scène à piloter, j’ouvre alors l’Univers en plein écran ; un nom mal écrit (« perseverence ») est corrigé tout seul ; le menu Univers reste disponible : le bouton ouvre la même scène en plein écran, et « ferme l’Univers » me rend l’accueil avec la scène en fond.
- **Exemples** : « montre-moi Mars », « va sur Saturne », « montre l’ISS », « retour au système solaire », « vue d’ensemble », « Terre-Lune », « la Lune de près », « montre les satellites », « la prochaine éclipse », « temps réel », « ciel réel », « montre Perseverance », « zoome », « montre Mars puis Saturne ».
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
- **Cas limites** : les villes, adresses et lieux vont sur la carte de la Terre (globe → carte détaillée), pas sur la page Monde.
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

## La Terre = carte (lieux, itinéraires, appareils)

quand je dois montrer un lieu, la Terre sert de carte : le globe 3D descend en continu vers une carte détaillée (pays et océans de loin, régions et départements de France, villes, routes, rues et lieux-dits en zoomant), pose un repère et je commente · tracer un itinéraire (voiture, vélo, à pied) · montrer où sont mes appareils, avec la précision de leur position · régler le zoom · effacer les repères.

- **Paramètres (lus dans le code)** : outils : earth.show_place(query, zoom?), earth.show_route(from?, to, mode?), earth.show_devices(device?), earth.set_zoom(level) · niveaux de zoom : 0 à 19, ou monde, pays, région, département, ville, quartier, rue, bâtiment · lieux : adresses et communes de France (API Adresse, geo.api.gouv.fr), monde entier (OpenStreetMap) · itinéraires : voiture, vélo, à pied.
- **Cas limites** : les pays, les mers et les océans restent sur le globe (fiche, présentation) ; la carte détaillée commence à l’échelle d’un pays comme la France ; le géocodage hors de France passe par Nominatim : une recherche par seconde au plus, les réponses sont gardées en mémoire ; un appareil n’apparaît que s’il partage lui-même sa position (Réglages) ; sa précision est affichée, jamais inventée ; sans WebGL ou sans réseau, je le dis et je donne le lien OpenStreetMap : je n’invente jamais un lieu ; les noms des lieux viennent d’OpenStreetMap, parfois dans la langue locale hors de France.
- **Exemples** : « montre-moi Castres », « montre le Mont-Blanc », « où est la gare de Lyon », « itinéraire jusqu’à Toulouse », « itinéraire de Bordeaux à Toulouse à pied », « où est mon téléphone », « zoome niveau rue », « efface les repères ».
- **Vérification automatique** : oui (les exemples sont passés dans l’analyseur réel par `tests/capacites-test.mjs`).

## Apparence

changer le thème de couleurs, le fond (Espace, Jarvis, vidéo, aucun), l’entité, l’ambiance météo et lumineuse, la qualité graphique (Éco, Auto, Max ou Ultra : l’Ultra est très gourmand et jamais choisi seul).

- **Paramètres (lus dans le code)** : thèmes : originel, arc, rouge, aurore, ambre, nébuleuse · fonds : aucun, espace, jarvis, vidéo · entités : sphère, neurones.
- **Exemples** : « passe en thème Jarvis », « fond univers », « mode éco », « passe en qualité ultra ».
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

Univers 🌌 : globe, système solaire, ISS, Mars et rovers, qualité Basse/Moyenne/Haute · entrer dans une planète (Terre : carte du monde, Mars : base · Saturne, Jupiter et les autres : prêtes mais vides), retour au système solaire, faire tourner, zoomer · placer Raylé : petite dans un coin, grande au centre ou sur le côté (position mémorisable par planète).

- **Paramètres (lus dans le code)** : globe, système solaire, Mars et rovers, ISS et satellites ; qualité Basse, Moyenne, Haute ou Auto ; positions de Raylé : coin haut-gauche, haut-droite, bas-gauche, bas-droite, centre, côté gauche, côté droit.
- **Cas limites** : positions des astres et éclipses approximatives, actualités selon franceinfo et le Worker, rendu allégé en qualité Basse ; seules la Terre et Mars ont un monde intérieur : pour les autres planètes je dis qu’elles sont prêtes à en recevoir un.
- **Exemples** : « présente la France », « va sur Mars », « montre le système solaire », « atterris sur Mars », « entre dans Mars », « fais tourner Jupiter », « retour au système solaire », « mets-toi dans le coin », « au centre », « sur le côté gauche », « mets la qualité en basse », « passe l’animation », « réduis-toi », « où sont mes appareils ».
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

