# Base de connaissances Espace : sources

Généré par `node scripts/sources-espace.mjs` depuis `ui/espace-savoir.js`. **Règle** : un chiffre qui n’est pas dans une source n’est pas dans la base ; une donnée absente est annoncée par Raylé (« je n’ai pas cette donnée »), jamais inventée.

Toutes les pages ont été consultées le **13 octobre 2026**. Les chiffres qui évoluent (nombre de lunes, kilomètres parcourus par Perseverance…) sont donnés « à la date » de la source.

## Sources

| Code | Source | Adresse |
|---|---|---|
| `P` | NASA Planetary Fact Sheet (fiches Mercure à Neptune, tableau comparatif) | https://nssdc.gsfc.nasa.gov/planetary/factsheet/ |
| `SOL` | NASA Sun Fact Sheet | https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html |
| `LUN` | NASA Moon Fact Sheet | https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html |
| `MARS` | NASA Mars Facts | https://science.nasa.gov/mars/facts/ |
| `TIT` | NASA, Titan | https://science.nasa.gov/saturn/moons/titan/ |
| `JOV` | NASA Planetary Fact Sheet : satellites de Jupiter | https://nssdc.gsfc.nasa.gov/planetary/factsheet/joviansatfact.html |
| `SATS` | NASA Planetary Fact Sheet : satellites de Saturne | https://nssdc.gsfc.nasa.gov/planetary/factsheet/saturniansatfact.html |
| `JS` | NASA/JPL Solar System Dynamics : paramètres physiques et éléments moyens des satellites naturels | https://ssd.jpl.nasa.gov/sats/phys_par/ |
| `ISS` | NASA, Space Station Facts and Figures ; orbite : TLE CelesTrak et position publique api.wheretheiss.at du 13/10/2026 | https://www.nasa.gov/international-space-station/space-station-facts-and-figures/ |
| `HUB` | NASA, Hubble Space Telescope : overview | https://science.nasa.gov/mission/hubble/overview/ |
| `JWST` | NASA, James Webb Space Telescope | https://science.nasa.gov/mission/webb/ |
| `CUR` | NASA, Mars Science Laboratory / Curiosity | https://science.nasa.gov/mission/msl-curiosity/ |
| `PER` | NASA, Mars 2020 / Perseverance | https://science.nasa.gov/mission/mars-2020-perseverance/ |
| `AST` | NASA, Asteroids (pages générale et « facts ») | https://science.nasa.gov/solar-system/asteroids/ |
| `HAL` | NASA, 1P/Halley | https://science.nasa.gov/solar-system/comets/1p-halley/ |
| `V1` | NASA, Voyager 1 | https://science.nasa.gov/mission/voyager/voyager-1/ |
| `V2` | NASA, Voyager 2 | https://science.nasa.gov/mission/voyager/voyager-2/ |
| `A11` | NASA, Apollo 11 | https://www.nasa.gov/mission/apollo-11/ |
| `CAS` | NASA, Cassini | https://science.nasa.gov/mission/cassini/ |
| `NH` | NASA, New Horizons | https://science.nasa.gov/mission/new-horizons/ |
| `ROS` | ESA, Rosetta | https://www.esa.int/Science_Exploration/Space_Science/Rosetta |
| `TN` | NASA, types de trous noirs (Sagittarius A étoile) | https://science.nasa.gov/universe/black-holes/types/ |
| `H` | Faits historiques usuels (dates de lancement, noms de missions), recoupés avec les pages de mission NASA et ESA ; pas de chiffre scientifique | https://science.nasa.gov/ |

`H` = faits historiques usuels (noms de missions, années de lancement, rôles) : aucun chiffre scientifique ; ils sont recoupés avec les pages de mission NASA et ESA ci-dessus.

## Points où les sources divergent ou sont incomplètes (choix faits)

- **Olympus Mons** : la fiche Mars de la NASA parle de « plus de 25 miles » (≈ 40 km) de haut depuis la base ; la valeur usuelle au-dessus du niveau de référence est d’environ 22 km. Raylé dit seulement « plus de vingt kilomètres ».
- **Voyager 2, entrée dans l’espace interstellaire** : la page NASA donne « 25 novembre 2018 » et « 10 décembre 2018 » (date d’annonce) ; Raylé dit « en novembre 2018 ».
- **Température de Mars** : moyenne ≈ 214 K (−59 °C) et extrêmes −89 / −31 °C relevés sur le site de Viking 1 (fiche détaillée NASA) ; le tableau comparatif plus ancien donne −65 °C. Raylé suit la fiche détaillée.
- **Pesanteur de Jupiter** : 25,92 m/s² à la pression de 1 bar (fiche détaillée) contre 23,1 m/s² (tableau comparatif, valeur à l’équateur). Raylé cite 25,9 « à la pression de un bar ».
- **Jour de Mercure** : la rotation (58,6 jours) et le jour solaire (≈ 176 jours) sont distingués ; idem Vénus (243 j et ≈ 117 j).
- **Périodes orbitales des lunes** : NASA Planetary Fact Sheets des satellites de Jupiter et de Saturne (`JOV`, `SATS`) ; pour les autres lunes, éléments moyens JPL (`JS`), qui peuvent différer de quelques millièmes (définition de la période).
- **Lunes de Saturne** : 274 selon la fiche NASA du 13/10/2026 ; ce nombre augmente à chaque découverte.
- **Perseverance** : la page de mission ne donne ni masse ni dimensions : Raylé n’en cite pas. Distance parcourue : 45,22 km au 11/10/2026.
- **Sagittarius A\*** : 4 millions de masses solaires (NASA) ; sa distance en années-lumière et la masse de M87\* ne figurent pas dans les pages consultées : absentes de la base.
- **Rovers, coordonnées** : site d’atterrissage de Curiosity (Bradbury Landing) 4,5895° S, 137,4417° E ; de Perseverance (Octavia E. Butler Landing, cratère Jezero) 18,44° N, 77,45° E (consultées sur Wikipédia, qui cite NBC News et Sky & Telescope pour Curiosity). Les rovers ont bougé depuis : ce sont les points d’atterrissage. Leur alignement sur la texture de Mars a été vérifié par superposition (Olympus Mons, Valles Marineris, Isidis, cratère Gale).

## Fiches

### Étoile

**Le Soleil** (`soleil`)

- diametre [`SOL`] : Son rayon moyen est de 695 700 kilomètres, soit un diamètre d’environ 1 391 000 kilomètres : plus de cent fois la Terre.
- masse [`SOL`] : Sa masse est d’environ 1,99 million de milliards de milliards de tonnes, plus de trois cent mille fois la Terre.
- distance [`SOL`] : Il est à environ 149,6 millions de kilomètres de la Terre, ce qu’on appelle une unité astronomique. Sa lumière met un peu plus de huit minutes à nous parvenir.
- jour [`SOL`] : Il tourne sur lui-même en environ 609 heures à 16 degrés de latitude, soit un peu plus de 25 jours ; il ne tourne pas d’un bloc, car c’est une boule de gaz.
- gravite [`SOL`] : Sa gravité à la surface est de 274 mètres par seconde carrée, environ vingt-huit fois celle de la Terre.
- temperature [`SOL`] : Sa surface est à 5 772 kelvins, soit environ 5 500 degrés Celsius, et son cœur atteint environ 15,7 millions de kelvins.
- composition [`SOL`] : Sa surface est faite d’environ 91 pour cent d’hydrogène et 9 pour cent d’hélium, en nombre d’atomes.
- atmosphere [`SOL`] : Il n’a pas d’atmosphère au sens habituel : ce qu’on voit est sa surface lumineuse, la photosphère, entourée de la couronne.
- vitesse_liberation [`SOL`] : Pour s’échapper de sa gravité à la surface, il faut aller à 617,6 kilomètres par seconde.
- luminosite [`SOL`] : Sa luminosité est de 382,8 millions de milliards de milliards de watts.
- lunes [`H`] : Le Soleil n’a pas de lunes ; ce sont les planètes qui tournent autour de lui.
- age [`H`] : Il a environ quatre milliards et demi d’années.

### Planètes

**Mercure** (`mercure`)

- diametre [`P`] : Mercure mesure 4 879 kilomètres de diamètre, un peu plus du tiers de la Terre.
- masse [`P`] : Sa masse est de 0,33 million de milliards de milliards de kilogrammes, à peine 5,5 pour cent de celle de la Terre.
- distance [`P`] : Elle est à 57,9 millions de kilomètres du Soleil en moyenne, entre 46 millions au plus près et 69,8 millions au plus loin.
- jour [`P`] : Elle tourne sur elle-même en 58,6 jours terrestres, mais un jour solaire y dure environ 176 jours terrestres, soit deux de ses années.
- annee [`P`] : Son année ne dure que 88 jours terrestres, exactement 87,97.
- gravite [`P`] : La pesanteur y est de 3,7 mètres par seconde carrée, environ 38 pour cent de celle de la Terre.
- atmosphere [`P`] : Elle n’a pas d’atmosphère à proprement parler, seulement une exosphère presque vide faite de sodium, de magnésium, d’oxygène et d’hydrogène.
- temperature [`P`] : Sa température moyenne est de 167 degrés Celsius, et le côté éclairé va de 317 à 452 degrés.
- lunes [`P`] : Mercure n’a aucune lune.
- inclinaison [`P`] : Son orbite est inclinée de 7 degrés sur celle de la Terre, la plus inclinée des huit planètes.
- obliquite [`P`] : Son axe n’est incliné que de 0,034 degré : elle n’a donc pratiquement pas de saisons.
- geologie [`H`] : Une surface grise criblée de cratères, très semblable à celle de la Lune, autour d’un grand noyau métallique.
- missions [`H`] : Mariner 10 l’a survolée en 1974 et 1975, MESSENGER s’est mise en orbite autour d’elle de 2011 à 2015, et BepiColombo, une mission européenne et japonaise, est en route.

**Vénus** (`venus`)

- diametre [`P`] : Vénus mesure 12 104 kilomètres de diamètre, presque autant que la Terre.
- masse [`P`] : Sa masse est de 4,87 millions de milliards de milliards de kilogrammes, environ 82 pour cent de celle de la Terre.
- distance [`P`] : Elle est à 108,2 millions de kilomètres du Soleil en moyenne.
- jour [`P`] : Elle tourne à l’envers, très lentement : un tour sur elle-même prend 243 jours terrestres et un jour solaire dure environ 117 jours, soit plus de la moitié de son année.
- annee [`P`] : Son année dure 224,7 jours terrestres.
- gravite [`P`] : La pesanteur y est de 8,87 mètres par seconde carrée, environ 90 pour cent de celle de la Terre.
- atmosphere [`P`] : Une atmosphère de 96,5 pour cent de gaz carbonique et 3,5 pour cent d’azote, avec une pression de 92 bars au sol, soit environ 90 fois celle de la Terre.
- temperature [`P`] : Il y fait 464 degrés Celsius en moyenne, plus chaud que sur Mercure : c’est la planète la plus chaude du système solaire, à cause d’un effet de serre extrême.
- lunes [`P`] : Vénus n’a aucune lune.
- inclinaison [`P`] : Son orbite est inclinée de 3,4 degrés sur celle de la Terre.
- obliquite [`P`] : Son axe est incliné de 177,4 degrés : elle est presque tête en bas, c’est pourquoi on dit qu’elle tourne à l’envers.
- missions [`H`] : Les sondes soviétiques Venera y ont atterri, Magellan l’a cartographiée par radar dans les années 1990, et de nouvelles missions sont prévues.

**La Terre** (`terre`)

- diametre [`P`] : La Terre mesure 12 756 kilomètres de diamètre à l’équateur.
- masse [`P`] : Sa masse est de 5,97 millions de milliards de milliards de kilogrammes.
- distance [`P`] : Elle est à 149,6 millions de kilomètres du Soleil en moyenne, entre 147,1 millions au plus près et 152,1 millions au plus loin.
- jour [`P`] : Elle tourne sur elle-même en 23 heures 56 minutes, et le jour solaire dure 24 heures.
- annee [`P`] : Son année dure 365,26 jours.
- gravite [`P`] : La pesanteur y est de 9,82 mètres par seconde carrée.
- atmosphere [`P`] : Une atmosphère de 78 pour cent d’azote et 21 pour cent d’oxygène, avec une pression d’environ un bar au sol.
- temperature [`P`] : La température moyenne est de 15 degrés Celsius.
- lunes [`P`] : Elle a une lune, la Lune.
- obliquite [`P`] : Son axe est incliné de 23,4 degrés, ce qui donne les saisons.
- vitesse_orbitale [`P`] : Elle file sur son orbite à 29,8 kilomètres par seconde.

**Mars** (`mars`)

- diametre [`P`] : Mars mesure 6 792 kilomètres de diamètre, à peu près la moitié de la Terre.
- masse [`P`] : Sa masse est de 0,642 million de milliards de milliards de kilogrammes, environ 11 pour cent de celle de la Terre.
- distance [`P`] : Elle est à 228 millions de kilomètres du Soleil en moyenne, soit 1,5 unité astronomique ; sa lumière met environ 13 minutes à l’atteindre.
- jour [`P`] : Un jour martien, appelé sol, dure 24 heures 39 minutes, très proche du jour terrestre.
- annee [`P`] : Son année dure 687 jours terrestres, presque deux ans de la Terre.
- gravite [`P`] : La pesanteur y est de 3,73 mètres par seconde carrée, environ 38 pour cent de celle de la Terre.
- atmosphere [`P`] : Une atmosphère très mince, de 95 pour cent de gaz carbonique, avec une pression d’environ 6 millibars, moins de 1 pour cent de celle de la Terre.
- temperature [`P`] : Il y fait environ moins 59 degrés Celsius en moyenne, de moins 89 à moins 31 degrés sur le site de Viking 1.
- lunes [`P`] : Elle a deux petites lunes, Phobos et Déimos.
- inclinaison [`P`] : Son orbite est inclinée de 1,8 degré sur celle de la Terre.
- obliquite [`P`] : Son axe est incliné de 25,2 degrés, presque comme la Terre : elle a donc des saisons, deux fois plus longues.
- geologie [`MARS`] : Le canyon Valles Marineris mesure environ 3 870 kilomètres de long et jusqu’à 9,3 kilomètres de profondeur, et le volcan Olympus Mons dépasse vingt kilomètres de haut, le plus grand volcan connu du système solaire.
- histoire [`MARS`] : Il y a eu de l’eau liquide : des vallées, des deltas et des lits de lacs le montrent.
- missions [`CUR`] : Les rovers Curiosity, depuis 2012, et Perseverance, depuis 2021, explorent sa surface.

**Jupiter** (`jupiter`)

- diametre [`P`] : Jupiter mesure 142 984 kilomètres de diamètre à l’équateur, onze fois la Terre.
- masse [`P`] : Sa masse est de 1 898 millions de milliards de milliards de kilogrammes, plus de trois cents fois la Terre.
- distance [`P`] : Elle est à 778,5 millions de kilomètres du Soleil en moyenne, soit environ 5,2 unités astronomiques.
- jour [`P`] : Elle tourne sur elle-même en 9 heures 56 minutes, la rotation la plus rapide des planètes.
- annee [`P`] : Son année dure 4 333 jours terrestres, presque 12 ans.
- gravite [`P`] : La pesanteur y est d’environ 25,9 mètres par seconde carrée à la pression de un bar, plus de deux fois et demie celle de la Terre.
- atmosphere [`P`] : Une atmosphère de 90 pour cent d’hydrogène et 10 pour cent d’hélium, avec des nuages d’ammoniac.
- temperature [`P`] : Elle fait moins 108 degrés Celsius à la pression de un bar, le niveau qu’on prend comme surface.
- lunes [`P`] : Elle a 95 lunes connues, dont les quatre grandes lunes de Galilée : Io, Europe, Ganymède et Callisto.
- inclinaison [`P`] : Son orbite est inclinée de 1,3 degré sur celle de la Terre.
- obliquite [`P`] : Son axe n’est incliné que de 3,1 degrés : pas de vraies saisons.
- anneaux [`P`] : Elle possède un système d’anneaux, fin et sombre.
- missions [`V1`] : La sonde Juno l’étudie depuis 2016 ; Voyager 1 et 2 l’ont survolée en 1979.

**Saturne** (`saturne`)

- diametre [`P`] : Saturne mesure 120 536 kilomètres de diamètre à l’équateur, environ neuf fois et demie la Terre.
- masse [`P`] : Sa masse est de 568 millions de milliards de milliards de kilogrammes, environ 95 fois la Terre.
- distance [`P`] : Elle est à 1,43 milliard de kilomètres du Soleil en moyenne, soit environ 9,6 unités astronomiques.
- jour [`P`] : Elle tourne sur elle-même en 10 heures 39 minutes.
- annee [`P`] : Son année dure 10 756 jours terrestres, près de 29 ans et demi.
- gravite [`P`] : La pesanteur y est d’environ 11,2 mètres par seconde carrée à la pression de un bar.
- atmosphere [`P`] : Une atmosphère de 96 pour cent d’hydrogène et 3 pour cent d’hélium.
- temperature [`P`] : Elle fait moins 139 degrés Celsius à la pression de un bar.
- lunes [`P`] : Elle a 274 lunes connues selon la NASA, dont Titan et Encelade.
- inclinaison [`P`] : Son orbite est inclinée de 2,5 degrés sur celle de la Terre.
- obliquite [`P`] : Son axe est incliné de 26,7 degrés, ce qui donne des saisons de plus de sept ans.
- densite [`P`] : Sa densité moyenne, 687 kilogrammes par mètre cube, est inférieure à celle de l’eau : elle flotterait dans un océan assez grand.
- anneaux [`P`] : Elle possède un système d’anneaux, brillant, fait surtout de glace d’eau.
- missions [`CAS`] : La sonde Cassini l’a étudiée de 2004 jusqu’à son plongeon final le 15 septembre 2017.

**Uranus** (`uranus`)

- diametre [`P`] : Uranus mesure 51 118 kilomètres de diamètre, environ quatre fois la Terre.
- masse [`P`] : Sa masse est de 86,8 millions de milliards de milliards de kilogrammes, environ 14,5 fois la Terre.
- distance [`P`] : Elle est à 2,87 milliards de kilomètres du Soleil en moyenne, soit environ 19 unités astronomiques.
- jour [`P`] : Elle tourne sur elle-même, à l’envers, en 17 heures 14 minutes.
- annee [`P`] : Son année dure 30 685 jours terrestres, environ 84 ans.
- gravite [`P`] : La pesanteur y est d’environ 9 mètres par seconde carrée à la pression de un bar, un peu moins que sur Terre.
- atmosphere [`P`] : Une atmosphère de 82,5 pour cent d’hydrogène, 15,2 pour cent d’hélium et 2,3 pour cent de méthane, qui lui donne sa couleur bleu-vert.
- temperature [`P`] : Elle fait moins 197 degrés Celsius à la pression de un bar.
- lunes [`P`] : Elle a 28 lunes connues.
- obliquite [`P`] : Son axe est incliné de 97,8 degrés : elle roule pratiquement sur son orbite, avec des saisons extrêmes.
- anneaux [`P`] : Elle possède un système d’anneaux.
- missions [`V2`] : Seule la sonde Voyager 2 l’a survolée, le 24 janvier 1986.

**Neptune** (`neptune`)

- diametre [`P`] : Neptune mesure 49 528 kilomètres de diamètre, presque quatre fois la Terre.
- masse [`P`] : Sa masse est de 102 millions de milliards de milliards de kilogrammes, environ 17 fois la Terre.
- distance [`P`] : Elle est à 4,5 milliards de kilomètres du Soleil en moyenne, soit environ 30 unités astronomiques.
- jour [`P`] : Elle tourne sur elle-même en 16 heures 6 minutes.
- annee [`P`] : Son année dure 60 189 jours terrestres, environ 165 ans.
- gravite [`P`] : La pesanteur y est d’environ 11,3 mètres par seconde carrée à la pression de un bar.
- atmosphere [`P`] : Une atmosphère de 80 pour cent d’hydrogène, 19 pour cent d’hélium et 1,5 pour cent de méthane ; ses vents atteignent 580 mètres par seconde, plus de 2 000 kilomètres par heure.
- temperature [`P`] : Elle fait moins 201 degrés Celsius à la pression de un bar.
- lunes [`P`] : Elle a 16 lunes connues, dont Triton.
- obliquite [`P`] : Son axe est incliné de 28,3 degrés.
- anneaux [`P`] : Elle possède un système d’anneaux.
- missions [`V2`] : Seule la sonde Voyager 2 l’a survolée, le 25 août 1989.

### Lunes

**La Lune** (`lune`)

- diametre [`LUN`] : La Lune mesure 3 475 kilomètres de diamètre, soit un peu plus du quart de la Terre.
- masse [`LUN`] : Sa masse est de 7,3 centièmes de millionième de milliard de milliards de kilogrammes : environ 1,2 pour cent de celle de la Terre.
- distance [`LUN`] : Elle est à 384 400 kilomètres de la Terre en moyenne, entre 363 300 au plus près et 405 500 au plus loin.
- jour [`LUN`] : Elle tourne sur elle-même en 27,3 jours, exactement le temps qu’elle met pour faire le tour de la Terre : c’est pourquoi elle nous montre toujours la même face. D’une pleine Lune à la suivante, il s’écoule 29,5 jours.
- annee [`LUN`] : Elle fait le tour de la Terre en 27,3 jours.
- gravite [`LUN`] : La pesanteur y est de 1,62 mètre par seconde carrée, environ un sixième de celle de la Terre.
- atmosphere [`LUN`] : Elle n’a pratiquement pas d’atmosphère, seulement une exosphère infiniment plus ténue que l’air terrestre.
- temperature [`LUN`] : À l’équateur, la température passe de moins 178 degrés Celsius la nuit à plus 117 degrés le jour.
- inclinaison [`LUN`] : Son orbite est inclinée de 5,1 degrés sur le plan de l’orbite de la Terre.
- histoire [`H`] : Douze hommes ont marché sur la Lune, entre 1969 et 1972, lors des missions Apollo.

**Io** (`io`)

- diametre [`JS`] : Io mesure environ 3 643 kilomètres de diamètre.
- densite [`JS`] : Sa densité moyenne est de 3,53 grammes par centimètre cube.
- distance [`JOV`] : Elle orbite à 421 800 kilomètres du centre de Jupiter.
- annee [`JOV`] : Elle fait le tour de Jupiter en 1,77 jours terrestres.
- geologie [`H`] : C’est le corps le plus volcanique du système solaire connu.

**Europe** (`europe`)

- diametre [`JS`] : Europe mesure environ 3 122 kilomètres de diamètre.
- densite [`JS`] : Sa densité moyenne est de 3,01 grammes par centimètre cube.
- distance [`JOV`] : Elle orbite à 671 100 kilomètres du centre de Jupiter.
- annee [`JOV`] : Elle fait le tour de Jupiter en 3,55 jours terrestres.
- geologie [`H`] : Sous sa croûte de glace se cache très probablement un océan d’eau liquide.

**Ganymède** (`ganymede`)

- diametre [`JS`] : Ganymède mesure environ 5 262 kilomètres de diamètre.
- densite [`JS`] : Sa densité moyenne est de 1,94 grammes par centimètre cube.
- distance [`JOV`] : Elle orbite à 1 070 400 kilomètres du centre de Jupiter.
- annee [`JOV`] : Elle fait le tour de Jupiter en 7,15 jours terrestres.
- records [`JS`] : Elle est plus grande que Mercure, dont le rayon est de 2 440 kilomètres, mais bien moins massive.

**Callisto** (`callisto`)

- diametre [`JS`] : Callisto mesure environ 4 821 kilomètres de diamètre.
- densite [`JS`] : Sa densité moyenne est de 1,83 grammes par centimètre cube.
- distance [`JOV`] : Elle orbite à 1 882 700 kilomètres du centre de Jupiter.
- annee [`JOV`] : Elle fait le tour de Jupiter en 16,7 jours terrestres.

**Titan** (`titan`)

- diametre [`JS`] : Titan mesure environ 5 150 kilomètres de diamètre.
- densite [`JS`] : Sa densité moyenne est de 1,88 grammes par centimètre cube.
- distance [`SATS`] : Elle orbite à 1 221 870 kilomètres du centre de Saturne.
- annee [`SATS`] : Elle fait le tour de Saturne en 15,9 jours terrestres.
- atmosphere [`TIT`] : C’est la seule lune connue à posséder une atmosphère substantielle, avec des lacs et des mers d’hydrocarbures liquides comme le méthane et l’éthane.
- missions [`TIT`] : Le drone Dragonfly de la NASA doit y être lancé en 2028.

**Encelade** (`encelade`)

- diametre [`JS`] : Encelade mesure environ 504 kilomètres de diamètre.
- densite [`JS`] : Sa densité moyenne est de 1,61 grammes par centimètre cube.
- distance [`SATS`] : Elle orbite à 238 020 kilomètres du centre de Saturne.
- annee [`SATS`] : Elle fait le tour de Saturne en 1,37 jours terrestres.
- geologie [`CAS`] : Des panaches de vapeur d’eau et de glace jaillissent des « rayures de tigre » de son pôle sud, et la sonde Cassini y a trouvé presque tous les ingrédients nécessaires à la vie.

**Triton** (`triton`)

- diametre [`JS`] : Triton mesure environ 2 705 kilomètres de diamètre.
- densite [`JS`] : Sa densité moyenne est de 2,06 grammes par centimètre cube.
- distance [`JS`] : Elle orbite à 354 800 kilomètres du centre de Neptune.
- annee [`JS`] : Elle fait le tour de Neptune en 5,88 jours terrestres.
- orbite [`JS`] : Elle tourne autour de Neptune à l’envers, sur une orbite inclinée de 157 degrés : on dit rétrograde.

**Phobos** (`phobos`)

- diametre [`JS`] : Phobos mesure environ 22 kilomètres de diamètre.
- densite [`JS`] : Sa densité moyenne est de 1,87 grammes par centimètre cube.
- distance [`JS`] : Elle orbite à 9 375 kilomètres du centre de Mars.
- annee [`JS`] : Elle fait le tour de Mars en 7 heures 39 minutes, plus vite que Mars ne tourne sur elle-même.

**Déimos** (`deimos`)

- diametre [`JS`] : Déimos mesure environ 12 kilomètres de diamètre.
- densite [`JS`] : Sa densité moyenne est de 1,47 grammes par centimètre cube.
- distance [`JS`] : Elle orbite à 23 457 kilomètres du centre de Mars.
- annee [`JS`] : Elle fait le tour de Mars en 1,26 jours terrestres.

**Charon** (`charon`)

- diametre [`JS`] : Charon mesure environ 1 212 kilomètres de diamètre.
- densite [`JS`] : Sa densité moyenne est de 1,85 grammes par centimètre cube.
- distance [`JS`] : Elle orbite à 19 600 kilomètres du centre de Pluton.
- annee [`JS`] : Elle fait le tour de Pluton en 6,39 jours terrestres.

### Ceinture d’astéroïdes

**La ceinture d’astéroïdes** (`ceinture`)

- masse [`AST`] : Tous les astéroïdes réunis ont une masse inférieure à celle de la Lune.
- nombre [`AST`] : La ceinture principale contient entre 1,1 et 1,9 million d’astéroïdes de plus d’un kilomètre, et des millions de plus petits.
- records [`AST`] : Vesta est le plus gros astéroïde, avec environ 530 kilomètres de diamètre ; les plus petits mesurent moins de 10 mètres.
- distance [`AST`] : Elle se situe entre Mars et Jupiter.
- geologie [`AST`] : Contrairement aux films, les astéroïdes y sont très éloignés les uns des autres.

### Comètes

**La comète de Halley** (`halley`)

- annee [`HAL`] : Elle revient en moyenne tous les 76 ans ; sa période varie de 74 à 79 ans.
- histoire [`HAL`] : En 1705, Edmond Halley a relié les comètes de 1531, 1607 et 1682 à un seul astre, et a prédit son retour en 1758. Son dernier passage au plus près du Soleil date du 9 février 1986 ; elle reviendra en 2061.
- diametre [`HAL`] : Son noyau mesure environ 15 kilomètres sur 8.
- vitesse_orbitale [`HAL`] : Elle file à environ 54,6 kilomètres par seconde près du Soleil, mais à moins d’un kilomètre par seconde au plus loin.
- missions [`HAL`] : Giotto, une sonde européenne, a photographié son noyau en 1986, avec les sondes soviétiques Vega.

**La comète Tchouri** (`tchouri`)

- missions [`ROS`] : Rosetta, lancée le 2 mars 2004, est arrivée près de la comète le 6 août 2014, et son atterrisseur Philae s’y est posé le 12 novembre 2014. La mission s’est achevée le 30 septembre 2016.

### Trou noir

**Le trou noir** (`trounoir`)

- masse [`TN`] : Le trou noir supermassif Sagittarius A étoile, au centre de notre galaxie, pèse 4 millions de fois la masse du Soleil.
- histoire [`H`] : Le télescope de l’Event Horizon Telescope a photographié l’ombre d’un trou noir pour la première fois en 2019, celui de la galaxie M87, puis celle de Sagittarius A étoile en 2022.

### Station

**La Station spatiale internationale** (`iss`)

- diametre [`ISS`] : Elle mesure 109 mètres de bout en bout, soit à peu près un terrain de football ; le treillis fait 94 mètres et la partie pressurisée 67 mètres.
- masse [`ISS`] : Elle pèse environ 420 tonnes, exactement 419 725 kilogrammes selon la NASA.
- volume [`ISS`] : Son volume pressurisé est de 1 005 mètres cubes, dont 388 mètres cubes habitables.
- energie [`ISS`] : Huit grandes ailes solaires produisent entre 75 et 90 kilowatts.
- orbite [`ISS`] : Elle orbite à environ 420 kilomètres d’altitude, avec une inclinaison de 51,6 degrés, à environ 27 600 kilomètres par heure : un tour de la Terre en un peu moins de 93 minutes, soit seize tours par jour.
- annee [`ISS`] : Elle fait un tour de la Terre en un peu moins de 93 minutes.
- vitesse_orbitale [`ISS`] : Elle file à environ 27 600 kilomètres par heure, soit un peu moins de 7,7 kilomètres par seconde.
- histoire [`ISS`] : Elle est habitée en continu depuis novembre 2000, par un équipage de sept personnes en général, et exploitée par cinq agences spatiales de quinze pays.
- records [`ISS`] : Elle a accueilli près de 3 000 expériences, venues de plus de 108 pays.

### Télescopes

**Le télescope spatial Hubble** (`hubble`)

- histoire [`HUB`] : Il a été déployé en 1990 par la navette Discovery, et cinq missions de la navette l’ont entretenu.
- orbite [`HUB`] : Il orbite à environ 480 kilomètres d’altitude, un tour en 95 minutes environ.
- masse [`HUB`] : Il pèse environ 12 200 kilogrammes depuis sa dernière réparation.
- diametre [`HUB`] : Il mesure 13,2 mètres de long, avec un miroir principal de 2,4 mètres de diamètre.
- records [`HUB`] : Il a fait plus de 1,7 million d’observations, à l’origine de plus de 23 000 articles scientifiques, et il a vu des objets à plus de 13,4 milliards d’années-lumière.
- atmosphere [`HUB`] : Il observe de l’ultraviolet au proche infrarouge, de 115 à 2 500 nanomètres.

**Le télescope spatial James Webb** (`webb`)

- histoire [`JWST`] : Il a été lancé le 25 décembre 2021 ; ses premières images scientifiques ont été publiées en juillet 2022.
- orbite [`JWST`] : Il tourne autour du Soleil au point de Lagrange L2, à environ 1,5 million de kilomètres de la Terre.
- records [`JWST`] : Il est protégé par un bouclier solaire à cinq couches et son miroir segmenté est recouvert d’or.

### Rovers

**Le rover Curiosity** (`curiosity`)

- histoire [`CUR`] : Lancé le 26 novembre 2011, il s’est posé le 6 août 2012 dans le cratère Gale.
- masse [`CUR`] : Il pèse 899 kilogrammes sur Terre, soit 337 kilogrammes dans la gravité de Mars.
- diametre [`CUR`] : Il a la taille d’un petit SUV, environ trois mètres de long, avec un bras de 2,2 mètres.
- records [`CUR`] : Il emporte dix instruments scientifiques, dont dix-sept caméras, un laser et une foreuse, a prélevé 42 échantillons de roche en poudre et grimpe le mont Sharp : il avait gagné un kilomètre de dénivelé en août 2026.
- geologie [`CUR`] : Il a trouvé des preuves chimiques et minérales d’anciens environnements habitables, et de grosses molécules organiques dans l’échantillon Cumberland.

**Le rover Perseverance** (`perseverance`)

- histoire [`PER`] : Lancé le 30 juillet 2020, il s’est posé le 18 février 2021 dans le cratère Jezero, large d’environ 45 kilomètres, au bord de la plaine d’Isidis.
- records [`PER`] : Au 11 octobre 2026, il avait parcouru 45,22 kilomètres, ce qui dépasse le record d’Opportunity.
- geologie [`PER`] : Il a trouvé les traces d’un ancien lac, d’un delta et d’une rivière. L’échantillon Sapphire Canyon, prélevé sur la roche Cheyava Falls, pourrait contenir des indices de vie microbienne ancienne, mais la revue Nature précise en 2025 qu’il faut encore des données.
- missions [`PER`] : Il a emporté l’hélicoptère Ingenuity, qui a fait 72 vols, le premier aéronef à voler de façon contrôlée sur une autre planète. L’instrument MOXIE y a produit de l’oxygène à partir du gaz carbonique.

### Grandes missions

**Voyager 1** (`voyager1`)

- histoire [`V1`] : Lancée le 5 septembre 1977, elle a survolé Jupiter le 5 mars 1979 et Saturne le 12 novembre 1980. Le 25 août 2012, elle est devenue le premier engin à quitter l’héliosphère.
- distance [`V1`] : Au 21 août 2024, elle était à 164,7 unités astronomiques de la Terre, et filait à 17 kilomètres par seconde par rapport au Soleil.
- records [`V1`] : Elle porte un disque d’or de 30 centimètres avec des salutations en 55 langues, 35 sons de la Terre, 90 minutes de musique et 115 images.

**Voyager 2** (`voyager2`)

- histoire [`V2`] : Lancée le 20 août 1977, elle a survolé Jupiter le 9 juillet 1979, Saturne le 25 août 1981, Uranus le 24 janvier 1986 et Neptune le 25 août 1989. Elle est entrée dans l’espace interstellaire en novembre 2018.

**Apollo 11** (`apollo11`)

- histoire [`A11`] : Lancée le 16 juillet 1969, avec Neil Armstrong, Buzz Aldrin et Michael Collins, elle a posé Armstrong et Aldrin sur la Lune le 20 juillet 1969, pour un séjour d’environ 22 heures. L’équipage est revenu amerrir le 24 juillet.

**Cassini** (`cassini`)

- histoire [`CAS`] : Lancée le 15 octobre 1997, elle est devenue en 2004 la première sonde en orbite autour de Saturne, et a fini son voyage le 15 septembre 2017 en plongeant dans la planète pour protéger les lunes.
- records [`CAS`] : Elle a découvert les geysers d’Encelade.

**New Horizons** (`newhorizons`)

- histoire [`NH`] : Lancée le 19 janvier 2006, elle a survolé Pluton le 14 juillet 2015, puis l’astéroïde Arrokoth le 1er janvier 2019.
- records [`NH`] : Elle détient la plus grande vitesse de lancement jamais atteinte par un objet humain, environ 58 500 kilomètres par heure par rapport à la Terre.

**Rosetta** (`rosetta`)

- histoire [`ROS`] : Lancée le 2 mars 2004, elle est arrivée à la comète 67P le 6 août 2014, a déposé Philae le 12 novembre 2014, et s’est terminée le 30 septembre 2016.

