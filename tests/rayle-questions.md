# Banc d'essai de Rayle v8 : 30 questions et comportement attendu

Exécuté par `trader-pro/tests/banc-30-chrome.mjs` (Chrome, tablette ; le modèle Gemini est simulé par un « routeur » qui appelle les outils comme le ferait le vrai modèle, **les outils, les fenêtres, les voix, les panneaux et Wikipédia sont réels**, sur les données de production).

Pour chaque question, le banc vérifie :
- **V** une seule voix : une seule requête Gemini TTS par réponse, jamais de `speechSynthesis`, jamais deux lectures en même temps ;
- **F** la bonne fenêtre s'ouvre, correctement réglée (quand la question en demande une) ;
- **C** les vrais chiffres de l'application sont dans la réponse (valeur lue dans les mêmes données que les fenêtres) ;
- **N** jamais « je n'ai aucune donnée » / « pas d'accès » quand la donnée existe ;
- **I** images libres pour une question sur une personne, un lieu, un objet… (panneau avec licence et source) ; aucun panneau vide sinon.

## A. Trading et application (15)
| # | Question | Outils attendus | Fenêtre / réglage | Attendu dans la réponse |
|---|----------|-----------------|-------------------|--------------------------|
| 1 | Rayle, fais-moi un point sur l'or | prix_et_tendance, ouvrir_fenetre | Terminal, or, H4, Classique | prix de l'or, MA200 H4 et écart, tendance Daily/H4, ligne MA200 qui pulse |
| 2 | Où en est le Bitcoin en Daily ? | prix_et_tendance | Terminal, BTC, Jour | prix BTC, MA200 Daily |
| 3 | Est-ce que le Nasdaq est au-dessus de sa MA200 ? | prix_et_tendance | Terminal, Nasdaq | position vs MA200 avec le pourcentage |
| 4 | Quels sont les niveaux importants sur l'or ? | niveaux | Terminal, or | PDH/PDL/PWH/PWL, POC/VAH/VAL, FVG |
| 5 | Montre-moi les bougies Weekly sur l'or | niveaux, ouvrir_fenetre | Terminal Volume, onglet Bougies HTF | 4 bougies Weekly |
| 6 | Passe en mode volume | ouvrir_fenetre | Terminal Volume | — |
| 7 | Montre-moi le rapport COT de l'or | marches, ouvrir_fenetre | Marchés, COT, or | lecture COT, index spéculateurs |
| 8 | Est-ce que le Bitcoin est cher ? | mes_actifs, ouvrir_fenetre | Investissement, Mes actifs, carte Bitcoin | verdicts par horizon et raisons |
| 9 | Comment me couvrir si j'achète de l'or ? | couverture, ouvrir_fenetre | Couverture, or, achat | meilleure couverture et taux de protection |
| 10 | Quel est mon risque aujourd'hui ? | portefeuille_et_risque, ouvrir_fenetre | Portefeuille, Risque global | risque engagé, limites (ou « historique non importé » précis) |
| 11 | Quelles annonces aujourd'hui ? | marches, ouvrir_fenetre | Marchés, Aujourd'hui | annonces du jour ou « aucune annonce forte » |
| 12 | Quel est le volume sur le Bitcoin ? | carnet_et_volume | — | volume relatif, CVD |
| 13 | Mes données sont-elles à jour ? | etat_des_donnees | — | sources en retard nommées |
| 14 | Donne-moi le briefing du jour | marches, prix_et_tendance | — | mouvements et annonces |
| 15 | Ferme ça | (commande de l'application) | fenêtre fermée | aucune donnée modifiée |

## B. Questions générales (10)
| # | Question | Attendu |
|---|----------|---------|
| 16 | Qui était Napoléon Bonaparte ? | réponse + **I** panneau (1 + 2 à 4 images, naissance et mort, licence, source) |
| 17 | Qui était Jules César ? | idem |
| 18 | Parle-moi de la tour Eiffel | idem (dates : création) |
| 19 | C'est quoi Mars ? | idem (planète, pas l'homonymie) |
| 20 | Raconte-moi ce qu'est un lion | idem |
| 21 | Montre-moi la Joconde | réponse directe + panneau |
| 22 | Pourquoi le ciel est-il bleu ? | réponse seule, **pas** de panneau |
| 23 | En quelle année a eu lieu la Révolution française ? | réponse seule |
| 24 | Combien font 17 fois 23 ? | réponse seule |
| 25 | Montre-moi xqzvbnmwk | pas de panneau vide ; « je n'ai pas trouvé d'image libre » |

## C. Enchaînées (5)
| # | Séquence | Attendu |
|---|----------|---------|
| 26 | « Fais-moi un point sur l'or » puis « Et en H4 ? » | le contexte (or) est renvoyé au modèle (sujet en cours) ; H4 |
| 27 | « Et en Daily ? » | idem, unité J |
| 28 | « Et le Bitcoin ? » | le sujet passe à BTC, même type de réponse |
| 29 | « Et son COT ? » | COT du Bitcoin |
| 30 | « Retour à l'accueil » | accueil, fenêtres fermées |
