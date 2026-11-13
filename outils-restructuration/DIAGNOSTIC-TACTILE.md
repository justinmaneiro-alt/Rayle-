# DIAGNOSTIC TACTILE : circuler sur le graphique (2026-11-13)
**Tout est mesuré en ÉMULATION (Chrome, vrais événements tactiles envoyés par CDP), jamais sur un vrai appareil.** Appareils émulés : Galaxy S23 Ultra ≈ 412×915 (ratio 2), tablette 800×1280 (portrait) et 1280×800 (paysage). Script : `agent-trading/tests/tactile-diagnostic.mjs` (état avant la refonte, `?tactile=0` ne change plus rien : le diagnostic a été lancé avant l'ajout du mode tactile).

## Ce que le diagnostic a trouvé (avant la refonte)
| # | Constat mesuré | Effet pour la personne |
|---|---|---|
| 1 | Le graphique n'était pas seul à l'écran : la page faisait 972 px (téléphone) et **4 826 px** (tablette : 8 blocs de données sous le graphique, onglets, titres, carte Rayle de 300×240 px posée sur le graphique). | Un glisser vertical qui démarre hors du graphique, ou qui arrive au bout de l'échelle des prix, fait défiler la page : le graphique « part » ; sur tablette, il est difficile de ne pas quitter le graphique. |
| 2 | `touch-action: auto` sur le graphique : le navigateur garde le droit de réclamer le défilement, le pincement (zoom de la page) et le tirage pour rafraîchir ; `overscroll-behavior: auto` sur tablette (tirage = rafraîchissement possible). | Pincement qui zoome la page au lieu du temps, graphique « qui saute » quand le navigateur reprend le geste. |
| 3 | Les gestes de Lightweight Charts eux-mêmes marchent (glisser horizontal : −87 bougies déplacées, pincement : plage de temps réduite de 112 bougies, 142 i/s sans ralentissement) : **la bibliothèque n'est pas en cause**, on garde ses gestes natifs. | — |
| 4 | Aucun double appui ne recentre : un graphique déplacé loin dans le passé ne se rattrape qu'en glissant. | Se perdre dans l'historique sans moyen simple de revenir. |
| 5 | Barre d'outils de dessin (9 boutons de 38 px de large) toujours visible à gauche : volume de cibles minuscules, et un outil resté actif prend le doigt (clics ajoutés sur le graphique) sans que rien ne le dise. | Un doigt qui devait déplacer le graphique pose un point ou une note. |
| 6 | Boutons de 28–36 px de haut, menus « Analyses / Couches / Mode / Notifications » étalés sur 99 px d'en-tête, texte 10–11 px. | Cibles ratées, texte illisible. |
| 7 | Le balayage du carrousel Rayle ne reçoit pas les gestes du graphique : le terminal est dans un cadre (iframe) et la page parente l'ignore (`#vueTerminal` dans la liste d'exclusion). Vérifié par test : **pas de conflit**, mais rien ne le garantissait côté terminal seul. | Aucun défaut constaté ; verrouillé par un test. |
| 8 | Redessin : 142 i/s à CPU normal, **53–55 i/s à CPU ralenti ×4** (borne basse), p95 28–35 ms ; sans couches de superposition 96 i/s : les calques (zones, étiquettes, boîtes) coûtent ≈ 40 %. Sur la tablette à CPU ×4, 1 tâche longue (132 ms) pendant un glisser : le recalcul des flèches (rejeu v8) peut tomber PENDANT un geste. | Saccades à CPU faible ; un recalcul au mauvais moment gèle le doigt. |
| 9 | Le menu des notifications et le bandeau de l'outil actif n'existaient pas pour le tactile. | — |

## Corrections apportées (`agent-trading/front/or/tactile-v1.{js,css}`, branché dans `or.html`)
- Mode « graphique seul » pour tout écran tactile sans souris (`pointer: coarse`, `?tactile=1` pour forcer, `?tactile=0` pour couper) : barre fine, graphique plein écran, aucune page sous le graphique (`position: fixed`, `overflow: hidden`, `overscroll-behavior: none`), `touch-action: none` sur le graphique, `touchmove` annulé depuis le graphique.
- Gestes : un seul gestionnaire = ceux de Lightweight Charts (glisser avec inertie douce, pincement du temps, appui long = réticule qui suit le doigt, glisser sur l'axe des prix = échelle verticale) + double appui qui recentre ; 150 à 250 bougies à l'écran (170 au départ, 250 au plus en dézoomant) ; volume masqué ; RSI repliable.
- Outils de dessin masqués ; actifs = navigation coupée explicitement + bandeau « Outil de dessin actif » + bouton Terminer.
- Rapport COT, Santé du marché, Institutions, Actualités, Calendrier, Journal, Capital : 7 petites cases derrière « Données », chacune dans une fenêtre du bas (balayage vers le bas sur l'en-tête ou croix), jamais sous le graphique. Les modules restent chargés : les données restent disponibles pour Rayle.
- Pas de recalcul des flèches ni des zones pendant un geste (reporté de 500 ms tant que le doigt est posé).
- Tablette en paysage : fenêtres et cases en panneau latéral droit (560 px au plus), graphique large.

## Limites honnêtes
- Émulation seulement : le ressenti des doigts, l'inertie réelle, la latence d'un vrai écran et les barres du navigateur mobile ne sont pas mesurés.
- Le plafond de résolution des pixels (pixel ratio) n'a pas été posé : Lightweight Charts utilise le ratio de l'écran et n'offre pas de réglage ; à CPU ralenti ×4 on tient quand même ≥ 50 i/s.
- Notifications : le menu d'origine est déplacé tel quel dans la fenêtre ⋯ (pas de réécriture).
