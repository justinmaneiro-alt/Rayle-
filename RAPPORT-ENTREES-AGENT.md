# Entrées de l'agent de trading sur PC (2026-11-03)

## Ajouté
- **Accueil (Aurore)** : bouton « + Agent » dans la rangée « + Météo / + Localisation / + Marché » (toujours visible sur l'accueil PC) et entrée « Agent » dans le menu Espaces de la barre du bas (`core/commun/g1-mini.js`, `core/commun/g1-accueil.js`).
- **Salon de Mars** : 6e dossier holographique « Agent de trading » (rangée du haut, au centre du demi-cercle : les 5 autres dossiers ne bougent pas), avec le statut en direct (PAS ENCORE PROUVÉ / RENTABLE / NON RENTABLE / hors ligne) et le capital publiés par le moteur (`planetes/mars/pc/piles-table.js`).
- **Une seule fenêtre PC** pour les 3 entrées (`agent-trading/front/fenetre-agent.js`) : même composant que le téléphone (onglets Graphique | Carnet | Positions | Portefeuille), grande (jusqu'à 1500 × 900), déplaçable, redimensionnable (coin), plein écran (⛶ ou double-clic sur la barre), au-dessus de la 3D. Échap ou un clic à côté la ferme (dans Mars, Échap ferme d'abord la fenêtre, pas la base).
- **Mise à jour PC** (`core/commun/maj-pc.js`) : la page relit index.html sans cache toutes les 5 min et au retour au premier plan ; si la version a changé : « Nouvelle version disponible — Recharger ». Version passée à `2026.11.03.3` (index.html + sw.js).

Moteur, stratégie, Worker, données, calculs : non modifiés. Rayle (voix, IA) ne connaît toujours pas l'agent. Aucun wrangler deploy.

## Pourquoi le PC « gardait l'ancienne version »
L'application PC (raccourci Rayle) lit les fichiers du dossier par le serveur local `serveur.mjs` (toujours revalidés) ; aucun service worker de Rayle n'est enregistré dans le profil Edge (celui trouvé est interne à Edge). La vraie cause : l'ancien bouton n'existait que dans l'espace de travail du Terminal, introuvable depuis le salon V2 ; et une fenêtre restée ouverte garde l'ancien code en mémoire.

## Forcer la mise à jour sur PC
1. Dans la fenêtre Rayle : **Ctrl + F5** (ou Ctrl + Maj + R), ou cliquer « Recharger » sur le message.
2. Sinon : fermer Rayle et relancer le raccourci « Rayle ».
3. Si vous ouvrez Rayle depuis GitHub Pages dans un navigateur : attendre jusqu'à 10 min (cache de GitHub) puis Ctrl + F5.

## Choix faits seul
- Sur PC la fenêtre utilise les onglets (comme demandé : même composant que le téléphone), pas la grille.
- Le dossier de Mars est placé au centre de la rangée du haut pour ne déplacer aucun autre dossier ; il n'est pas ajouté aux ordres vocaux (aucune commande vocale pour l'agent).
- La fenêtre a un voile léger : un clic sur le voile la ferme (« clic ailleurs »), et la souris ne passe pas à la 3D tant qu'elle est ouverte.

## Vérification (Chrome, 1600 px) : `node tests-navigateur/agent-trading-pc-test.mjs` → 18 réussis, 0 échoué
- Accueil : « + Agent » visible, ne chevauche ni les autres boutons ni le titre « Raylé · poste central » (correctif : le titre se décale à gauche des boutons, `core/commun/g1-mini.css`).
- Accueil → fenêtre : grande (≥ 1400 × 800), 4 onglets, au premier plan ; redimensionnement par le coin, agrandissement (double-clic sur la barre), Échap ferme.
- Menu Espaces → « Agent » → même fenêtre ; un clic à côté la ferme.
- Même capital au centime que le téléphone (384 px), au même numéro d'état.
- Salon de Mars : dossier « Agent de trading » visible (statut + capital), clic réel → fenêtre au-dessus de la 3D, la souris marche dedans, Échap ferme la fenêtre SANS sortir de la base.
- Bouton du Terminal (espace de travail) → la même fenêtre (une seule à la fois).
- Aucune erreur console liée à l'agent ni à ses entrées. Seules erreurs restantes, déjà présentes avant : `calendar.json` (404) et le calendrier faireconomy (CORS).
- Captures : `agent-trading/moteur/tests/captures/entrees-*.png` (accueil, salon, fenêtre depuis l'accueil, Mars, Terminal).
- Tests de l'agent : `cd agent-trading` puis `npm test` → tous passent.
- Pour les tests seulement, la pile de l'agent a une position à l'écran (`idsEcran`, utilisé par `Mars.positionsEcran()`) ; elle n'est PAS dans `ids()`, donc jamais dans la voix.

## Remarque (agent, non modifié comme demandé)
- Sur le graphique, des annotations de l'IA locale portent le nom « court » : Dolphin recopie l'exemple de sa consigne (« nom : court »). À corriger plus tard dans `agent-trading/moteur/ia.js` (consigne) ; je n'y ai pas touché ici.
