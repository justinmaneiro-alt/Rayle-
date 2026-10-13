"use strict";
/* ═════════════ BASE DE CONNAISSANCES « ESPACE » (RayleUI.savoir) ═════════════
   Fiches structurées et vérifiables : Soleil, Lune, 8 planètes, lunes majeures, ceinture d'astéroïdes, comètes célèbres, trou noir,
   ISS, Hubble, Webb, Curiosity, Perseverance, grandes missions. Chaque champ est [texte dit à voix haute, valeur numérique ou null, code de la source] ;
   les codes renvoient à SOURCES (liste complète, avec dates de consultation, dans docs/espace-sources.md).
   Règle d'or : un chiffre qui n'est pas dans une source n'est PAS dans ce fichier. Un champ absent = Raylé dit qu'elle n'a pas la donnée.
   Les textes sont écrits pour l'oral : aucun symbole (°, %, ×), les unités sont en toutes lettres.
   API : savoir.fiche(id) · savoir.trouver(texte) → id · savoir.repondre(texte, {alea}) → phrase ou null · savoir.contexte(texte) → bloc pour l'IA.
   Les chiffres sont ceux de la dernière consultation (13/10/2026) ; ce qui change avec le temps (nombre de lunes, distance parcourue…) est daté dans le texte. */
(function(){
  const G=typeof window!=='undefined'?window:globalThis;
  const UI=G.RayleUI=G.RayleUI||{};

  const SOURCES={
    P:{t:'NASA Planetary Fact Sheet (fiches Mercure à Neptune, tableau comparatif)',u:'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',d:'2026-10-13'},
    SOL:{t:'NASA Sun Fact Sheet',u:'https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html',d:'2026-10-13'},
    LUN:{t:'NASA Moon Fact Sheet',u:'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html',d:'2026-10-13'},
    MARS:{t:'NASA Mars Facts',u:'https://science.nasa.gov/mars/facts/',d:'2026-10-13'},
    TIT:{t:'NASA, Titan',u:'https://science.nasa.gov/saturn/moons/titan/',d:'2026-10-13'},
    JOV:{t:'NASA Planetary Fact Sheet : satellites de Jupiter',u:'https://nssdc.gsfc.nasa.gov/planetary/factsheet/joviansatfact.html',d:'2026-10-13'},
    SATS:{t:'NASA Planetary Fact Sheet : satellites de Saturne',u:'https://nssdc.gsfc.nasa.gov/planetary/factsheet/saturniansatfact.html',d:'2026-10-13'},
    JS:{t:'NASA/JPL Solar System Dynamics : paramètres physiques et éléments moyens des satellites naturels',u:'https://ssd.jpl.nasa.gov/sats/phys_par/',d:'2026-10-13'},
    ISS:{t:'NASA, Space Station Facts and Figures ; orbite : TLE CelesTrak et position publique api.wheretheiss.at du 13/10/2026',u:'https://www.nasa.gov/international-space-station/space-station-facts-and-figures/',d:'2026-10-13'},
    HUB:{t:'NASA, Hubble Space Telescope : overview',u:'https://science.nasa.gov/mission/hubble/overview/',d:'2026-10-13'},
    JWST:{t:'NASA, James Webb Space Telescope',u:'https://science.nasa.gov/mission/webb/',d:'2026-10-13'},
    CUR:{t:'NASA, Mars Science Laboratory / Curiosity',u:'https://science.nasa.gov/mission/msl-curiosity/',d:'2026-10-13'},
    PER:{t:'NASA, Mars 2020 / Perseverance',u:'https://science.nasa.gov/mission/mars-2020-perseverance/',d:'2026-10-13'},
    AST:{t:'NASA, Asteroids (pages générale et « facts »)',u:'https://science.nasa.gov/solar-system/asteroids/',d:'2026-10-13'},
    HAL:{t:'NASA, 1P/Halley',u:'https://science.nasa.gov/solar-system/comets/1p-halley/',d:'2026-10-13'},
    V1:{t:'NASA, Voyager 1',u:'https://science.nasa.gov/mission/voyager/voyager-1/',d:'2026-10-13'},
    V2:{t:'NASA, Voyager 2',u:'https://science.nasa.gov/mission/voyager/voyager-2/',d:'2026-10-13'},
    A11:{t:'NASA, Apollo 11',u:'https://www.nasa.gov/mission/apollo-11/',d:'2026-10-13'},
    CAS:{t:'NASA, Cassini',u:'https://science.nasa.gov/mission/cassini/',d:'2026-10-13'},
    NH:{t:'NASA, New Horizons',u:'https://science.nasa.gov/mission/new-horizons/',d:'2026-10-13'},
    ROS:{t:'ESA, Rosetta',u:'https://www.esa.int/Science_Exploration/Space_Science/Rosetta',d:'2026-10-13'},
    TN:{t:'NASA, types de trous noirs (Sagittarius A étoile)',u:'https://science.nasa.gov/universe/black-holes/types/',d:'2026-10-13'},
    H:{t:'Faits historiques usuels (dates de lancement, noms de missions), recoupés avec les pages de mission NASA et ESA ; pas de chiffre scientifique',u:'https://science.nasa.gov/',d:'2026-10-13'}
  };

  // fiche : id, nom parlé, genre, champs, alias (texte normalisé, sans accent), résumé d'une phrase
  const fiches={};
  const A=(id,nom,genre,alias,resume,champs)=>{ fiches[id]={id,nom,genre,alias,resume,champs}; };
  const T=(t,v,s)=>[t,v==null?null:v,s];

  /* ───────── Soleil ───────── */
  A('soleil','le Soleil','etoile',['soleil','le soleil','notre etoile','etoile du systeme solaire'],
    'Le Soleil est l’étoile au centre du système solaire, une boule de gaz presque entièrement faite d’hydrogène et d’hélium.',{
    diametre:T('Son rayon moyen est de 695 700 kilomètres, soit un diamètre d’environ 1 391 000 kilomètres : plus de cent fois la Terre.',1391400,'SOL'),
    masse:T('Sa masse est d’environ 1,99 million de milliards de milliards de tonnes, plus de trois cent mille fois la Terre.',1988400,'SOL'),
    distance:T('Il est à environ 149,6 millions de kilomètres de la Terre, ce qu’on appelle une unité astronomique. Sa lumière met un peu plus de huit minutes à nous parvenir.',149.6,'SOL'),
    jour:T('Il tourne sur lui-même en environ 609 heures à 16 degrés de latitude, soit un peu plus de 25 jours ; il ne tourne pas d’un bloc, car c’est une boule de gaz.',609.12,'SOL'),
    gravite:T('Sa gravité à la surface est de 274 mètres par seconde carrée, environ vingt-huit fois celle de la Terre.',274,'SOL'),
    temperature:T('Sa surface est à 5 772 kelvins, soit environ 5 500 degrés Celsius, et son cœur atteint environ 15,7 millions de kelvins.',5772,'SOL'),
    composition:T('Sa surface est faite d’environ 91 pour cent d’hydrogène et 9 pour cent d’hélium, en nombre d’atomes.',null,'SOL'),
    atmosphere:T('Il n’a pas d’atmosphère au sens habituel : ce qu’on voit est sa surface lumineuse, la photosphère, entourée de la couronne.',null,'SOL'),
    vitesse_liberation:T('Pour s’échapper de sa gravité à la surface, il faut aller à 617,6 kilomètres par seconde.',617.6,'SOL'),
    luminosite:T('Sa luminosité est de 382,8 millions de milliards de milliards de watts.',null,'SOL'),
    lunes:T('Le Soleil n’a pas de lunes ; ce sont les planètes qui tournent autour de lui.',0,'H'),
    age:T('Il a environ quatre milliards et demi d’années.',null,'H')});

  /* ───────── Planètes ───────── */
  A('mercure','Mercure','planete',['mercure'],'Mercure est la planète la plus proche du Soleil et la plus petite du système solaire.',{
    diametre:T('Mercure mesure 4 879 kilomètres de diamètre, un peu plus du tiers de la Terre.',4879,'P'),
    masse:T('Sa masse est de 0,33 million de milliards de milliards de kilogrammes, à peine 5,5 pour cent de celle de la Terre.',.330,'P'),
    distance:T('Elle est à 57,9 millions de kilomètres du Soleil en moyenne, entre 46 millions au plus près et 69,8 millions au plus loin.',57.9,'P'),
    jour:T('Elle tourne sur elle-même en 58,6 jours terrestres, mais un jour solaire y dure environ 176 jours terrestres, soit deux de ses années.',4222.6,'P'),
    annee:T('Son année ne dure que 88 jours terrestres, exactement 87,97.',87.969,'P'),
    gravite:T('La pesanteur y est de 3,7 mètres par seconde carrée, environ 38 pour cent de celle de la Terre.',3.70,'P'),
    atmosphere:T('Elle n’a pas d’atmosphère à proprement parler, seulement une exosphère presque vide faite de sodium, de magnésium, d’oxygène et d’hydrogène.',null,'P'),
    temperature:T('Sa température moyenne est de 167 degrés Celsius, et le côté éclairé va de 317 à 452 degrés.',167,'P'),
    lunes:T('Mercure n’a aucune lune.',0,'P'),
    inclinaison:T('Son orbite est inclinée de 7 degrés sur celle de la Terre, la plus inclinée des huit planètes.',7.0,'P'),
    obliquite:T('Son axe n’est incliné que de 0,034 degré : elle n’a donc pratiquement pas de saisons.',0.034,'P'),
    geologie:T('Une surface grise criblée de cratères, très semblable à celle de la Lune, autour d’un grand noyau métallique.',null,'H'),
    missions:T('Mariner 10 l’a survolée en 1974 et 1975, MESSENGER s’est mise en orbite autour d’elle de 2011 à 2015, et BepiColombo, une mission européenne et japonaise, est en route.',null,'H')});

  A('venus','Vénus','planete',['venus'],'Vénus est la deuxième planète à partir du Soleil, presque aussi grosse que la Terre mais recouverte d’une atmosphère étouffante.',{
    diametre:T('Vénus mesure 12 104 kilomètres de diamètre, presque autant que la Terre.',12104,'P'),
    masse:T('Sa masse est de 4,87 millions de milliards de milliards de kilogrammes, environ 82 pour cent de celle de la Terre.',4.87,'P'),
    distance:T('Elle est à 108,2 millions de kilomètres du Soleil en moyenne.',108.2,'P'),
    jour:T('Elle tourne à l’envers, très lentement : un tour sur elle-même prend 243 jours terrestres et un jour solaire dure environ 117 jours, soit plus de la moitié de son année.',2802.0,'P'),
    annee:T('Son année dure 224,7 jours terrestres.',224.701,'P'),
    gravite:T('La pesanteur y est de 8,87 mètres par seconde carrée, environ 90 pour cent de celle de la Terre.',8.87,'P'),
    atmosphere:T('Une atmosphère de 96,5 pour cent de gaz carbonique et 3,5 pour cent d’azote, avec une pression de 92 bars au sol, soit environ 90 fois celle de la Terre.',null,'P'),
    temperature:T('Il y fait 464 degrés Celsius en moyenne, plus chaud que sur Mercure : c’est la planète la plus chaude du système solaire, à cause d’un effet de serre extrême.',464,'P'),
    lunes:T('Vénus n’a aucune lune.',0,'P'),
    inclinaison:T('Son orbite est inclinée de 3,4 degrés sur celle de la Terre.',3.4,'P'),
    obliquite:T('Son axe est incliné de 177,4 degrés : elle est presque tête en bas, c’est pourquoi on dit qu’elle tourne à l’envers.',177.36,'P'),
    missions:T('Les sondes soviétiques Venera y ont atterri, Magellan l’a cartographiée par radar dans les années 1990, et de nouvelles missions sont prévues.',null,'H')});

  A('terre','la Terre','planete',['la terre','notre planete','planete terre'],'La Terre est la troisième planète à partir du Soleil, la seule connue pour abriter la vie.',{
    diametre:T('La Terre mesure 12 756 kilomètres de diamètre à l’équateur.',12756,'P'),
    masse:T('Sa masse est de 5,97 millions de milliards de milliards de kilogrammes.',5.97,'P'),
    distance:T('Elle est à 149,6 millions de kilomètres du Soleil en moyenne, entre 147,1 millions au plus près et 152,1 millions au plus loin.',149.6,'P'),
    jour:T('Elle tourne sur elle-même en 23 heures 56 minutes, et le jour solaire dure 24 heures.',24.0,'P'),
    annee:T('Son année dure 365,26 jours.',365.256,'P'),
    gravite:T('La pesanteur y est de 9,82 mètres par seconde carrée.',9.82,'P'),
    atmosphere:T('Une atmosphère de 78 pour cent d’azote et 21 pour cent d’oxygène, avec une pression d’environ un bar au sol.',null,'P'),
    temperature:T('La température moyenne est de 15 degrés Celsius.',15,'P'),
    lunes:T('Elle a une lune, la Lune.',1,'P'),
    obliquite:T('Son axe est incliné de 23,4 degrés, ce qui donne les saisons.',23.44,'P'),
    vitesse_orbitale:T('Elle file sur son orbite à 29,8 kilomètres par seconde.',29.78,'P')});

  A('lune','la Lune','lune',['la lune','notre lune','sa lune'],'La Lune est l’unique satellite naturel de la Terre, à environ 384 000 kilomètres.',{
    diametre:T('La Lune mesure 3 475 kilomètres de diamètre, soit un peu plus du quart de la Terre.',3475,'LUN'),
    masse:T('Sa masse est de 7,3 centièmes de millionième de milliard de milliards de kilogrammes : environ 1,2 pour cent de celle de la Terre.',.07346,'LUN'),
    distance:T('Elle est à 384 400 kilomètres de la Terre en moyenne, entre 363 300 au plus près et 405 500 au plus loin.',.3844,'LUN'),
    jour:T('Elle tourne sur elle-même en 27,3 jours, exactement le temps qu’elle met pour faire le tour de la Terre : c’est pourquoi elle nous montre toujours la même face. D’une pleine Lune à la suivante, il s’écoule 29,5 jours.',655.72,'LUN'),
    annee:T('Elle fait le tour de la Terre en 27,3 jours.',27.322,'LUN'),
    gravite:T('La pesanteur y est de 1,62 mètre par seconde carrée, environ un sixième de celle de la Terre.',1.62,'LUN'),
    atmosphere:T('Elle n’a pratiquement pas d’atmosphère, seulement une exosphère infiniment plus ténue que l’air terrestre.',null,'LUN'),
    temperature:T('À l’équateur, la température passe de moins 178 degrés Celsius la nuit à plus 117 degrés le jour.',null,'LUN'),
    inclinaison:T('Son orbite est inclinée de 5,1 degrés sur le plan de l’orbite de la Terre.',5.145,'LUN'),
    histoire:T('Douze hommes ont marché sur la Lune, entre 1969 et 1972, lors des missions Apollo.',null,'H')});

  A('mars','Mars','planete',['mars','la planete rouge','planete rouge'],'Mars est la quatrième planète, une planète froide et désertique, deux fois plus petite que la Terre.',{
    diametre:T('Mars mesure 6 792 kilomètres de diamètre, à peu près la moitié de la Terre.',6792,'P'),
    masse:T('Sa masse est de 0,642 million de milliards de milliards de kilogrammes, environ 11 pour cent de celle de la Terre.',.642,'P'),
    distance:T('Elle est à 228 millions de kilomètres du Soleil en moyenne, soit 1,5 unité astronomique ; sa lumière met environ 13 minutes à l’atteindre.',228.0,'P'),
    jour:T('Un jour martien, appelé sol, dure 24 heures 39 minutes, très proche du jour terrestre.',24.6597,'P'),
    annee:T('Son année dure 687 jours terrestres, presque deux ans de la Terre.',686.98,'P'),
    gravite:T('La pesanteur y est de 3,73 mètres par seconde carrée, environ 38 pour cent de celle de la Terre.',3.73,'P'),
    atmosphere:T('Une atmosphère très mince, de 95 pour cent de gaz carbonique, avec une pression d’environ 6 millibars, moins de 1 pour cent de celle de la Terre.',null,'P'),
    temperature:T('Il y fait environ moins 59 degrés Celsius en moyenne, de moins 89 à moins 31 degrés sur le site de Viking 1.',-59,'P'),
    lunes:T('Elle a deux petites lunes, Phobos et Déimos.',2,'P'),
    inclinaison:T('Son orbite est inclinée de 1,8 degré sur celle de la Terre.',1.8,'P'),
    obliquite:T('Son axe est incliné de 25,2 degrés, presque comme la Terre : elle a donc des saisons, deux fois plus longues.',25.19,'P'),
    geologie:T('Le canyon Valles Marineris mesure environ 3 870 kilomètres de long et jusqu’à 9,3 kilomètres de profondeur, et le volcan Olympus Mons dépasse vingt kilomètres de haut, le plus grand volcan connu du système solaire.',null,'MARS'),
    histoire:T('Il y a eu de l’eau liquide : des vallées, des deltas et des lits de lacs le montrent.',null,'MARS'),
    missions:T('Les rovers Curiosity, depuis 2012, et Perseverance, depuis 2021, explorent sa surface.',null,'CUR')});

  A('jupiter','Jupiter','planete',['jupiter'],'Jupiter est la plus grosse planète du système solaire, une géante gazeuse.',{
    diametre:T('Jupiter mesure 142 984 kilomètres de diamètre à l’équateur, onze fois la Terre.',142984,'P'),
    masse:T('Sa masse est de 1 898 millions de milliards de milliards de kilogrammes, plus de trois cents fois la Terre.',1898,'P'),
    distance:T('Elle est à 778,5 millions de kilomètres du Soleil en moyenne, soit environ 5,2 unités astronomiques.',778.5,'P'),
    jour:T('Elle tourne sur elle-même en 9 heures 56 minutes, la rotation la plus rapide des planètes.',9.9259,'P'),
    annee:T('Son année dure 4 333 jours terrestres, presque 12 ans.',4332.589,'P'),
    gravite:T('La pesanteur y est d’environ 25,9 mètres par seconde carrée à la pression de un bar, plus de deux fois et demie celle de la Terre.',25.92,'P'),
    atmosphere:T('Une atmosphère de 90 pour cent d’hydrogène et 10 pour cent d’hélium, avec des nuages d’ammoniac.',null,'P'),
    temperature:T('Elle fait moins 108 degrés Celsius à la pression de un bar, le niveau qu’on prend comme surface.',-108,'P'),
    lunes:T('Elle a 95 lunes connues, dont les quatre grandes lunes de Galilée : Io, Europe, Ganymède et Callisto.',95,'P'),
    inclinaison:T('Son orbite est inclinée de 1,3 degré sur celle de la Terre.',1.3,'P'),
    obliquite:T('Son axe n’est incliné que de 3,1 degrés : pas de vraies saisons.',3.13,'P'),
    anneaux:T('Elle possède un système d’anneaux, fin et sombre.',null,'P'),
    missions:T('La sonde Juno l’étudie depuis 2016 ; Voyager 1 et 2 l’ont survolée en 1979.',null,'V1')});

  A('saturne','Saturne','planete',['saturne'],'Saturne est la deuxième plus grosse planète, célèbre pour ses anneaux.',{
    diametre:T('Saturne mesure 120 536 kilomètres de diamètre à l’équateur, environ neuf fois et demie la Terre.',120536,'P'),
    masse:T('Sa masse est de 568 millions de milliards de milliards de kilogrammes, environ 95 fois la Terre.',568,'P'),
    distance:T('Elle est à 1,43 milliard de kilomètres du Soleil en moyenne, soit environ 9,6 unités astronomiques.',1432.0,'P'),
    jour:T('Elle tourne sur elle-même en 10 heures 39 minutes.',10.656,'P'),
    annee:T('Son année dure 10 756 jours terrestres, près de 29 ans et demi.',10755.699,'P'),
    gravite:T('La pesanteur y est d’environ 11,2 mètres par seconde carrée à la pression de un bar.',11.19,'P'),
    atmosphere:T('Une atmosphère de 96 pour cent d’hydrogène et 3 pour cent d’hélium.',null,'P'),
    temperature:T('Elle fait moins 139 degrés Celsius à la pression de un bar.',-139,'P'),
    lunes:T('Elle a 274 lunes connues selon la NASA, dont Titan et Encelade.',274,'P'),
    inclinaison:T('Son orbite est inclinée de 2,5 degrés sur celle de la Terre.',2.5,'P'),
    obliquite:T('Son axe est incliné de 26,7 degrés, ce qui donne des saisons de plus de sept ans.',26.73,'P'),
    densite:T('Sa densité moyenne, 687 kilogrammes par mètre cube, est inférieure à celle de l’eau : elle flotterait dans un océan assez grand.',687,'P'),
    anneaux:T('Elle possède un système d’anneaux, brillant, fait surtout de glace d’eau.',null,'P'),
    missions:T('La sonde Cassini l’a étudiée de 2004 jusqu’à son plongeon final le 15 septembre 2017.',null,'CAS')});

  A('uranus','Uranus','planete',['uranus'],'Uranus est une géante de glaces, la septième planète, couchée sur le côté.',{
    diametre:T('Uranus mesure 51 118 kilomètres de diamètre, environ quatre fois la Terre.',51118,'P'),
    masse:T('Sa masse est de 86,8 millions de milliards de milliards de kilogrammes, environ 14,5 fois la Terre.',86.8,'P'),
    distance:T('Elle est à 2,87 milliards de kilomètres du Soleil en moyenne, soit environ 19 unités astronomiques.',2867.0,'P'),
    jour:T('Elle tourne sur elle-même, à l’envers, en 17 heures 14 minutes.',17.24,'P'),
    annee:T('Son année dure 30 685 jours terrestres, environ 84 ans.',30685.4,'P'),
    gravite:T('La pesanteur y est d’environ 9 mètres par seconde carrée à la pression de un bar, un peu moins que sur Terre.',9.01,'P'),
    atmosphere:T('Une atmosphère de 82,5 pour cent d’hydrogène, 15,2 pour cent d’hélium et 2,3 pour cent de méthane, qui lui donne sa couleur bleu-vert.',null,'P'),
    temperature:T('Elle fait moins 197 degrés Celsius à la pression de un bar.',-197,'P'),
    lunes:T('Elle a 28 lunes connues.',28,'P'),
    obliquite:T('Son axe est incliné de 97,8 degrés : elle roule pratiquement sur son orbite, avec des saisons extrêmes.',97.77,'P'),
    anneaux:T('Elle possède un système d’anneaux.',null,'P'),
    missions:T('Seule la sonde Voyager 2 l’a survolée, le 24 janvier 1986.',null,'V2')});

  A('neptune','Neptune','planete',['neptune'],'Neptune est la huitième et dernière planète du système solaire, une géante de glaces.',{
    diametre:T('Neptune mesure 49 528 kilomètres de diamètre, presque quatre fois la Terre.',49528,'P'),
    masse:T('Sa masse est de 102 millions de milliards de milliards de kilogrammes, environ 17 fois la Terre.',102,'P'),
    distance:T('Elle est à 4,5 milliards de kilomètres du Soleil en moyenne, soit environ 30 unités astronomiques.',4515.0,'P'),
    jour:T('Elle tourne sur elle-même en 16 heures 6 minutes.',16.11,'P'),
    annee:T('Son année dure 60 189 jours terrestres, environ 165 ans.',60189.0,'P'),
    gravite:T('La pesanteur y est d’environ 11,3 mètres par seconde carrée à la pression de un bar.',11.27,'P'),
    atmosphere:T('Une atmosphère de 80 pour cent d’hydrogène, 19 pour cent d’hélium et 1,5 pour cent de méthane ; ses vents atteignent 580 mètres par seconde, plus de 2 000 kilomètres par heure.',null,'P'),
    temperature:T('Elle fait moins 201 degrés Celsius à la pression de un bar.',-201,'P'),
    lunes:T('Elle a 16 lunes connues, dont Triton.',16,'P'),
    obliquite:T('Son axe est incliné de 28,3 degrés.',28.32,'P'),
    anneaux:T('Elle possède un système d’anneaux.',null,'P'),
    missions:T('Seule la sonde Voyager 2 l’a survolée, le 25 août 1989.',null,'V2')});

  /* ───────── Lunes majeures (paramètres de NASA/JPL ; les lunes ne sont pas dans les fiches planétaires) ───────── */
  const LUNE=(id,nom,pl,alias,resume,rayon,dens,a,per,extra,src)=>A(id,nom,'lune',alias,resume,Object.assign({
    diametre:T(nom+' mesure environ '+fr(2*rayon)+' kilomètres de diamètre.',2*rayon,'JS'),
    densite:T('Sa densité moyenne est de '+fr(dens,2)+' grammes par centimètre cube.',dens,'JS'),
    distance:T('Elle orbite à '+fr(a)+' kilomètres du centre de '+pl+'.',a/1e6,src||'JS'),
    annee:T('Elle fait le tour de '+pl+' en '+fr(per,per<10?2:1)+' jours terrestres.',per,src||'JS')},extra||{}));
  function fr(n,d){ return Number(n).toLocaleString('fr-FR',{maximumFractionDigits:d==null?0:d,minimumFractionDigits:0}).replace(/[  ]/g,' '); }

  LUNE('io','Io','Jupiter',['io'],'Io est la lune de Jupiter la plus proche, couverte de volcans.',1821.49,3.53,421800,1.769138,{
    geologie:T('C’est le corps le plus volcanique du système solaire connu.',null,'H')},'JOV');
  LUNE('europe','Europe','Jupiter',['europe lune','lune europe','europa','la lune europe'],'Europe est une lune de Jupiter, recouverte de glace.',1560.8,3.01,671100,3.551181,{
    geologie:T('Sous sa croûte de glace se cache très probablement un océan d’eau liquide.',null,'H')},'JOV');
  LUNE('ganymede','Ganymède','Jupiter',['ganymede'],'Ganymède est la plus grosse lune du système solaire.',2631.2,1.94,1070400,7.154553,{
    records:T('Elle est plus grande que Mercure, dont le rayon est de 2 440 kilomètres, mais bien moins massive.',null,'JS')},'JOV');
  LUNE('callisto','Callisto','Jupiter',['callisto'],'Callisto est la quatrième grande lune de Galilée, très ancienne et criblée de cratères.',2410.3,1.83,1882700,16.689017,undefined,'JOV');
  LUNE('titan','Titan','Saturne',['titan'],'Titan est la plus grosse lune de Saturne.',2574.76,1.88,1221870,15.945421,{
    atmosphere:T('C’est la seule lune connue à posséder une atmosphère substantielle, avec des lacs et des mers d’hydrocarbures liquides comme le méthane et l’éthane.',null,'TIT'),
    missions:T('Le drone Dragonfly de la NASA doit y être lancé en 2028.',null,'TIT')},'SATS');
  LUNE('encelade','Encelade','Saturne',['encelade','enceladus'],'Encelade est une petite lune glacée de Saturne.',252.1,1.61,238020,1.370218,{
    geologie:T('Des panaches de vapeur d’eau et de glace jaillissent des « rayures de tigre » de son pôle sud, et la sonde Cassini y a trouvé presque tous les ingrédients nécessaires à la vie.',null,'CAS')},'SATS');
  LUNE('triton','Triton','Neptune',['triton'],'Triton est la plus grosse lune de Neptune.',1352.6,2.06,354800,5.877,{
    orbite:T('Elle tourne autour de Neptune à l’envers, sur une orbite inclinée de 157 degrés : on dit rétrograde.',157.3,'JS')});
  LUNE('phobos','Phobos','Mars',['phobos'],'Phobos est la plus grosse des deux lunes de Mars.',11.08,1.87,9375,.3187,{
    annee:T('Elle fait le tour de Mars en 7 heures 39 minutes, plus vite que Mars ne tourne sur elle-même.',.3187,'JS')});
  LUNE('deimos','Déimos','Mars',['deimos'],'Déimos est la plus petite des deux lunes de Mars.',6.2,1.47,23457,1.2625);
  LUNE('charon','Charon','Pluton',['charon'],'Charon est la plus grosse lune de Pluton.',606,1.85,19600,6.3872);

  /* ───────── Ceinture, comètes, trou noir ───────── */
  A('ceinture','la ceinture d’astéroïdes','ceinture',['ceinture d asteroides','ceinture principale','ceinture asteroides','les asteroides','asteroides','asteroide'],
    'La ceinture d’astéroïdes est une zone de petits corps rocheux entre les orbites de Mars et de Jupiter.',{
    masse:T('Tous les astéroïdes réunis ont une masse inférieure à celle de la Lune.',null,'AST'),
    nombre:T('La ceinture principale contient entre 1,1 et 1,9 million d’astéroïdes de plus d’un kilomètre, et des millions de plus petits.',null,'AST'),
    records:T('Vesta est le plus gros astéroïde, avec environ 530 kilomètres de diamètre ; les plus petits mesurent moins de 10 mètres.',530,'AST'),
    distance:T('Elle se situe entre Mars et Jupiter.',null,'AST'),
    geologie:T('Contrairement aux films, les astéroïdes y sont très éloignés les uns des autres.',null,'AST')});
  A('halley','la comète de Halley','comete',['halley','comete de halley','1p halley'],'La comète de Halley est la plus célèbre des comètes à courte période.',{
    annee:T('Elle revient en moyenne tous les 76 ans ; sa période varie de 74 à 79 ans.',76.1*365.25,'HAL'),
    histoire:T('En 1705, Edmond Halley a relié les comètes de 1531, 1607 et 1682 à un seul astre, et a prédit son retour en 1758. Son dernier passage au plus près du Soleil date du 9 février 1986 ; elle reviendra en 2061.',null,'HAL'),
    diametre:T('Son noyau mesure environ 15 kilomètres sur 8.',15,'HAL'),
    vitesse_orbitale:T('Elle file à environ 54,6 kilomètres par seconde près du Soleil, mais à moins d’un kilomètre par seconde au plus loin.',54.55,'HAL'),
    missions:T('Giotto, une sonde européenne, a photographié son noyau en 1986, avec les sondes soviétiques Vega.',null,'HAL')});
  A('tchouri','la comète Tchouri','comete',['tchouri','tchourioumov','67p','churyumov','comete tchouri','rosetta comete'],'La comète 67P, dite Tchouri, a été explorée par la sonde européenne Rosetta.',{
    missions:T('Rosetta, lancée le 2 mars 2004, est arrivée près de la comète le 6 août 2014, et son atterrisseur Philae s’y est posé le 12 novembre 2014. La mission s’est achevée le 30 septembre 2016.',null,'ROS')});
  A('trounoir','le trou noir','trou_noir',['trou noir','trous noirs','sagittarius a','sgr a','le trou noir'],'Un trou noir est une région où la gravité est si forte que rien, pas même la lumière, ne peut s’en échapper.',{
    masse:T('Le trou noir supermassif Sagittarius A étoile, au centre de notre galaxie, pèse 4 millions de fois la masse du Soleil.',4e6,'TN'),
    histoire:T('Le télescope de l’Event Horizon Telescope a photographié l’ombre d’un trou noir pour la première fois en 2019, celui de la galaxie M87, puis celle de Sagittarius A étoile en 2022.',null,'H')});

  /* ───────── Stations, télescopes, rovers, missions ───────── */
  A('iss','la Station spatiale internationale','station',['iss','station spatiale','station spatiale internationale','la station'],'La Station spatiale internationale est un laboratoire habité en orbite autour de la Terre.',{
    diametre:T('Elle mesure 109 mètres de bout en bout, soit à peu près un terrain de football ; le treillis fait 94 mètres et la partie pressurisée 67 mètres.',109,'ISS'),
    masse:T('Elle pèse environ 420 tonnes, exactement 419 725 kilogrammes selon la NASA.',419725,'ISS'),
    volume:T('Son volume pressurisé est de 1 005 mètres cubes, dont 388 mètres cubes habitables.',1005,'ISS'),
    energie:T('Huit grandes ailes solaires produisent entre 75 et 90 kilowatts.',null,'ISS'),
    orbite:T('Elle orbite à environ 420 kilomètres d’altitude, avec une inclinaison de 51,6 degrés, à environ 27 600 kilomètres par heure : un tour de la Terre en un peu moins de 93 minutes, soit seize tours par jour.',null,'ISS'),
    annee:T('Elle fait un tour de la Terre en un peu moins de 93 minutes.',92.97,'ISS'),
    vitesse_orbitale:T('Elle file à environ 27 600 kilomètres par heure, soit un peu moins de 7,7 kilomètres par seconde.',7.66,'ISS'),
    histoire:T('Elle est habitée en continu depuis novembre 2000, par un équipage de sept personnes en général, et exploitée par cinq agences spatiales de quinze pays.',null,'ISS'),
    records:T('Elle a accueilli près de 3 000 expériences, venues de plus de 108 pays.',null,'ISS')});
  A('hubble','le télescope spatial Hubble','telescope',['hubble','telescope hubble','telescope spatial hubble'],'Hubble est un télescope spatial qui observe depuis l’orbite terrestre.',{
    histoire:T('Il a été déployé en 1990 par la navette Discovery, et cinq missions de la navette l’ont entretenu.',null,'HUB'),
    orbite:T('Il orbite à environ 480 kilomètres d’altitude, un tour en 95 minutes environ.',null,'HUB'),
    masse:T('Il pèse environ 12 200 kilogrammes depuis sa dernière réparation.',12200,'HUB'),
    diametre:T('Il mesure 13,2 mètres de long, avec un miroir principal de 2,4 mètres de diamètre.',13.2,'HUB'),
    records:T('Il a fait plus de 1,7 million d’observations, à l’origine de plus de 23 000 articles scientifiques, et il a vu des objets à plus de 13,4 milliards d’années-lumière.',null,'HUB'),
    atmosphere:T('Il observe de l’ultraviolet au proche infrarouge, de 115 à 2 500 nanomètres.',null,'HUB')});
  A('webb','le télescope spatial James Webb','telescope',['webb','james webb','jwst','telescope james webb'],'Le télescope James Webb observe l’univers en infrarouge.',{
    histoire:T('Il a été lancé le 25 décembre 2021 ; ses premières images scientifiques ont été publiées en juillet 2022.',null,'JWST'),
    orbite:T('Il tourne autour du Soleil au point de Lagrange L2, à environ 1,5 million de kilomètres de la Terre.',1.5e6,'JWST'),
    records:T('Il est protégé par un bouclier solaire à cinq couches et son miroir segmenté est recouvert d’or.',null,'JWST')});
  A('curiosity','le rover Curiosity','rover',['curiosity','curiosite','rover curiosity'],'Curiosity est un rover de la NASA qui explore le cratère Gale sur Mars.',{
    histoire:T('Lancé le 26 novembre 2011, il s’est posé le 6 août 2012 dans le cratère Gale.',null,'CUR'),
    masse:T('Il pèse 899 kilogrammes sur Terre, soit 337 kilogrammes dans la gravité de Mars.',899,'CUR'),
    diametre:T('Il a la taille d’un petit SUV, environ trois mètres de long, avec un bras de 2,2 mètres.',null,'CUR'),
    records:T('Il emporte dix instruments scientifiques, dont dix-sept caméras, un laser et une foreuse, a prélevé 42 échantillons de roche en poudre et grimpe le mont Sharp : il avait gagné un kilomètre de dénivelé en août 2026.',null,'CUR'),
    geologie:T('Il a trouvé des preuves chimiques et minérales d’anciens environnements habitables, et de grosses molécules organiques dans l’échantillon Cumberland.',null,'CUR')});
  A('perseverance','le rover Perseverance','rover',['perseverance','persy','rover perseverance','mars 2020'],'Perseverance est un rover de la NASA qui cherche des traces de vie ancienne dans le cratère Jezero sur Mars.',{
    histoire:T('Lancé le 30 juillet 2020, il s’est posé le 18 février 2021 dans le cratère Jezero, large d’environ 45 kilomètres, au bord de la plaine d’Isidis.',null,'PER'),
    records:T('Au 11 octobre 2026, il avait parcouru 45,22 kilomètres, ce qui dépasse le record d’Opportunity.',45.22,'PER'),
    geologie:T('Il a trouvé les traces d’un ancien lac, d’un delta et d’une rivière. L’échantillon Sapphire Canyon, prélevé sur la roche Cheyava Falls, pourrait contenir des indices de vie microbienne ancienne, mais la revue Nature précise en 2025 qu’il faut encore des données.',null,'PER'),
    missions:T('Il a emporté l’hélicoptère Ingenuity, qui a fait 72 vols, le premier aéronef à voler de façon contrôlée sur une autre planète. L’instrument MOXIE y a produit de l’oxygène à partir du gaz carbonique.',null,'PER')});
  A('voyager1','Voyager 1','mission',['voyager 1','voyager un','voyager1'],'Voyager 1 est la sonde la plus lointaine jamais construite par l’humanité.',{
    histoire:T('Lancée le 5 septembre 1977, elle a survolé Jupiter le 5 mars 1979 et Saturne le 12 novembre 1980. Le 25 août 2012, elle est devenue le premier engin à quitter l’héliosphère.',null,'V1'),
    distance:T('Au 21 août 2024, elle était à 164,7 unités astronomiques de la Terre, et filait à 17 kilomètres par seconde par rapport au Soleil.',164.7,'V1'),
    records:T('Elle porte un disque d’or de 30 centimètres avec des salutations en 55 langues, 35 sons de la Terre, 90 minutes de musique et 115 images.',null,'V1')});
  A('voyager2','Voyager 2','mission',['voyager 2','voyager deux','voyager2'],'Voyager 2 est la seule sonde à avoir visité les quatre planètes géantes.',{
    histoire:T('Lancée le 20 août 1977, elle a survolé Jupiter le 9 juillet 1979, Saturne le 25 août 1981, Uranus le 24 janvier 1986 et Neptune le 25 août 1989. Elle est entrée dans l’espace interstellaire en novembre 2018.',null,'V2')});
  A('apollo11','Apollo 11','mission',['apollo 11','apollo onze','apollo11','premiers pas sur la lune'],'Apollo 11 est la mission qui a posé les premiers hommes sur la Lune.',{
    histoire:T('Lancée le 16 juillet 1969, avec Neil Armstrong, Buzz Aldrin et Michael Collins, elle a posé Armstrong et Aldrin sur la Lune le 20 juillet 1969, pour un séjour d’environ 22 heures. L’équipage est revenu amerrir le 24 juillet.',null,'A11')});
  A('cassini','Cassini','mission',['cassini','cassini huygens'],'Cassini est la sonde qui a étudié Saturne de près pendant treize ans.',{
    histoire:T('Lancée le 15 octobre 1997, elle est devenue en 2004 la première sonde en orbite autour de Saturne, et a fini son voyage le 15 septembre 2017 en plongeant dans la planète pour protéger les lunes.',null,'CAS'),
    records:T('Elle a découvert les geysers d’Encelade.',null,'CAS')});
  A('newhorizons','New Horizons','mission',['new horizons','new horizon'],'New Horizons est la sonde qui a survolé Pluton.',{
    histoire:T('Lancée le 19 janvier 2006, elle a survolé Pluton le 14 juillet 2015, puis l’astéroïde Arrokoth le 1er janvier 2019.',null,'NH'),
    records:T('Elle détient la plus grande vitesse de lancement jamais atteinte par un objet humain, environ 58 500 kilomètres par heure par rapport à la Terre.',null,'NH')});
  A('rosetta','Rosetta','mission',['rosetta','philae'],'Rosetta est la mission européenne qui a accompagné une comète.',{
    histoire:T('Lancée le 2 mars 2004, elle est arrivée à la comète 67P le 6 août 2014, a déposé Philae le 12 novembre 2014, et s’est terminée le 30 septembre 2016.',null,'ROS')});

  /* ───────── Recherche d'une fiche dans une phrase ───────── */
  const norm=t=>String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/['’`\-]/g,' ').replace(/[?!.,;:…«»"]/g,' ').replace(/\s+/g,' ').trim();
  const index=[];
  for(const f of Object.values(fiches)) for(const a of f.alias) index.push([a,f.id]);
  index.sort((a,b)=>b[0].length-a[0].length);
  // toutes les fiches citées, dans l'ordre d'apparition (les alias les plus longs d'abord : « station spatiale internationale » avant « station »)
  const MOIS_MARS=/(?:^| )(?:le |au |du )?(?:\d{1,2}(?:er)? mars|en mars|mois de mars|debut mars|fin mars|mi mars|avant mars|apres mars|depuis mars|jusqu a mars|mars (?:20\d\d|prochain|dernier|pro))(?= |$)/;
  function trouverTous(texte){
    let reste=' '+norm(texte)+' '; const vus=[];
    if(MOIS_MARS.test(reste)) reste=reste.replace(/(?:^| )mars(?= |$)/g,' ');                 // « le 5 mars », « en mars » : le mois, pas la planète
    for(const [a,id] of index){
      const re=new RegExp('(^| )'+a+'(?= |$)'), m=re.exec(reste);
      if(m){ if(!vus.some(v=>v.id===id)) vus.push({id,pos:m.index}); reste=reste.slice(0,m.index)+' '+'#'.repeat(a.length)+reste.slice(m.index+1+a.length); }
    }
    return vus.sort((x,y)=>x.pos-y.pos).map(v=>v.id);
  }
  const trouver=texte=>trouverTous(texte)[0]||null;

  /* ───────── questions : quel champ ? ───────── */
  const CHAMPS=[
    ['anneaux',/\banneaux?\b/],
    ['lunes',/\b(?:lunes?|satellites? naturels?)\b(?! de la terre)/],
    ['diametre',/\b(?:diametre|taille|grande?|gros(?:se)?|rayon|largeur|mesure|envergure|longueur)\b/],
    ['masse',/\b(?:masse|pese|poids|lourd)\b/],
    ['distance',/\b(?:distance|loin|eloigne|proche|a quelle distance|combien de km)\b/],
    ['jour',/\b(?:jour|journee|rotation|tourne sur (?:elle|lui)|duree du jour)\b/],
    ['annee',/\b(?:annee|revolution|periode orbitale|tour du soleil|fait le tour|orbite autour|combien de temps (?:pour|met))\b/],
    ['gravite',/\b(?:gravite|pesanteur)\b/],
    ['atmosphere',/\b(?:atmosphere|air|respirer|pression)\b/],
    ['temperature',/\b(?:temperature|chaud|froid|degres|climat|meteo)\b/],
    ['obliquite',/\b(?:inclinaison de l axe|obliquite|axe|saisons?)\b/],
    ['inclinaison',/\binclinaison\b/],
    ['vitesse_orbitale',/\bvitesse\b/],
    ['volume',/\bvolume\b/],
    ['densite',/\bdensite\b/],
    ['geologie',/\b(?:geologie|relief|volcans?|montagnes?|surface|sol|canyon|cratere|roches?)\b/],
    ['records',/\b(?:record|plus (?:grand|gros|haut|rapide)|decouvertes?|trouve)\b/],
    ['histoire',/\b(?:histoire|decouvert|decouverte|qui a|quand|lance|pose|lancement)\b/],
    ['missions',/\b(?:missions?|sondes?|explor\w+|visite)\b/],
    ['age',/\b(?:age|ans a)\b/],
    ['nombre',/\b(?:combien d asteroides|nombre)\b/],
    ['energie',/\b(?:energie|electricite|panneaux)\b/],
    ['orbite',/\b(?:orbit\w*|altitude)\b/]
  ];
  const HORS_SUJET=/\b(?:meteo|il fait (?:beau|chaud|froid|soleil)|ensoleill\w*|bitcoin|nasdaq|solana|trading|bourse|cours de|prix de|marche[s]?|temps (?:fait|demain)|demain|ce week end|ce soir)\b/;
  const QUESTION=/\b(?:quand|qui|ou|depuis|quel|quelle|quels|quelles|combien|c est quoi|qu est ce|que|quoi|comment|pourquoi|est ce|a quelle|de quelle|dis moi|donne moi|parle moi|explique|raconte|decris|presente)\b/;
  const EXPLIQUE=/^(?:(?:dis|raconte|parle|explique|decris|presente|apprends)(?: moi)?(?: tout)?(?: de| sur| a propos de| ce qu est)?|(?:c est quoi|qu est ce que c est|qu est ce que|qui est|qui sont|qu est ce qu|que sais tu sur|que sais tu de|que peux tu me dire sur|tu connais)) /;
  const COMPARE=/\b(?:compar\w*|difference|differences|different|versus|vs|par rapport a|plus (?:grand|gros|petit|chaud|froid|loin|proche|lourd|rapide)(?:e|se)? que|lequel|laquelle)\b/;

  // Mars, Jupiter, Saturne, Uranus, Neptune, le Soleil, Hubble, Webb sont masculins : « il », pas « elle »
  const MASC=new Set(['soleil','mars','jupiter','saturne','uranus','neptune','hubble','webb','trounoir']);
  const genre=(f,t)=>MASC.has(f.id)?t.replace(/\bElle\b/g,'Il').replace(/\belle\b/g,'il'):t;
  const lisible=(f,cle)=>{ const c=f.champs[cle]; return c?genre(f,c[0]):null; };
  const pick=(a,alea)=>a[Math.floor((alea||Math.random)()*a.length)%a.length];

  /** réponse à une question sur l'espace, ou null si ce n'en est pas une (l'IA prend alors le relais, avec contexte()) */
  function repondre(texte,opts){
    opts=opts||{}; const alea=opts.alea||Math.random;
    const t=norm(texte);
    if(!t||t.split(' ').length>22||HORS_SUJET.test(t)) return null;
    let ids=trouverTous(texte);
    if(!ids.length && opts.cible && fiches[opts.cible] && /\b(?:sa|son|ses|elle|il|y)\b/.test(t)) ids=[opts.cible];            // « et sa taille ? » : l'astre affiché
    if(!ids.length) return null;
    const estQuestion=QUESTION.test(t)||/\?\s*$/.test(String(texte));
    // 1) comparaison : « compare Mars et la Terre », « Mars est-elle plus grosse que la Terre ? »
    if(ids.length>=2 && COMPARE.test(t) && ids.slice(0,2).every(i=>['planete','lune','etoile'].includes(fiches[i].genre))){
      const d=directe(ids[0],ids[1],t); return d?d+' '+comparer(ids[0],ids[1]).replace(/^Comparons [^.]*. /,'Voici le détail. '):comparer(ids[0],ids[1],opts);
    }
    const f=fiches[ids[0]];
    // 2) explication : « parle-moi de Mars », « c'est quoi l'ISS ? »
    if(EXPLIQUE.test(t) && !CHAMPS.some(([,re])=>re.test(t.replace(EXPLIQUE,'')))) return expliquer(f.id,alea);
    // 3) question précise : un champ
    const nominale=!estQuestion&&t.split(' ').length<=7&&/^(?:et )?(?:la|le|l|les|sa|son|ses|leur|leurs|ma|mon) /.test(t);
    if(!estQuestion&&!nominale) return null;
    const cle=(CHAMPS.find(([k,re])=>re.test(t)&&(k!=='lunes'||f.genre==='planete'||!!f.champs.lunes))||[])[0];
    if(!cle) return ids.length===1 && /\b(?:c est quoi|qu est ce que|qui est|qu est ce)\b/.test(t) ? expliquer(f.id,alea) : null;
    const v=lisible(f,cle);
    if(!v){
      const dispo=Object.keys(f.champs).filter(k=>f.champs[k]);
      return 'Je n’ai pas cette donnée dans ma fiche sur '+f.nom+', et je préfère ne pas l’inventer.'+(dispo.length?' Je peux en revanche te parler de '+listeFr(dispo.slice(0,3).map(nomChamp))+'.':'');
    }
    return sujet(f,v);
  }
  // une phrase qui commence par « Elle… » ou « Sa… » est précédée du sujet : « Pour Mars, elle est à… »
  function sujet(f,v){
    const d=norm(v);
    if(d.startsWith(norm(f.nom))||d.startsWith(norm(f.nom.replace(/^(?:le|la|l’) ?/,'')))) return v;
    return 'Pour '+f.nom+', '+v.charAt(0).toLowerCase()+v.slice(1);
  }
  // « Mars est-elle plus grosse que la Terre ? » : une réponse directe avant le détail
  const ADJ=[[/(?:grand|gros)(?:e|se)? que/,'diametre',1],[/petit(?:e)? que/,'diametre',-1],[/lourd(?:e)? que/,'masse',1],[/leger(?:e)? que/,'masse',-1],[/chaud(?:e)? que/,'temperature',1],[/froid(?:e)? que/,'temperature',-1],[/loin(?:taine)? que/,'distance',1],[/proche que/,'distance',-1]];
  const NOM_CHAMP={diametre:['le diamètre','plus grand','plus petit','celui'],masse:['la masse','plus grande','plus petite','celle'],temperature:['la température moyenne','plus élevée','plus basse','celle'],distance:['la distance au Soleil','plus grande','plus petite','celle']};
  function directe(a,b,t){
    const m=ADJ.find(([re])=>re.test(t)); if(!m) return '';
    const x=fiches[a].champs[m[1]], y=fiches[b].champs[m[1]]; if(!x||!y||x[1]==null||y[1]==null) return '';
    const [nom,haut,bas,cela]=NOM_CHAMP[m[1]], oui=(x[1]-y[1])*m[2]>0, ratio=Math.max(Math.abs(x[1]),Math.abs(y[1]))/Math.max(1e-9,Math.min(Math.abs(x[1]),Math.abs(y[1])));
    const adj=x[1]>y[1]?haut:bas, de=f=>/^(?:le|la|les|l’)/.test(f.nom)?f.nom.replace(/^le /,'du ').replace(/^la /,'de la ').replace(/^l’/,'de l’'):'de '+f.nom;
    const nb=m[1]!=='temperature'&&ratio>1.04?', environ '+fr(ratio,ratio<10?1:0)+' fois':'';
    return (oui?'Oui':'Non')+', '+nom+' '+de(fiches[a])+' est '+adj+' que '+cela+' '+de(fiches[b])+nb+'.';
  }
  const NOMS={diametre:'sa taille',masse:'sa masse',distance:'sa distance',jour:'la durée de son jour',annee:'son année',gravite:'sa gravité',atmosphere:'son atmosphère',temperature:'sa température',lunes:'ses lunes',anneaux:'ses anneaux',geologie:'sa géologie',histoire:'son histoire',records:'ses records',missions:'ses missions',obliquite:'l’inclinaison de son axe',inclinaison:'l’inclinaison de son orbite',composition:'sa composition',orbite:'son orbite',energie:'son énergie',volume:'son volume',densite:'sa densité',age:'son âge',nombre:'leur nombre',vitesse_orbitale:'sa vitesse',vitesse_liberation:'sa vitesse de libération',luminosite:'sa luminosité'};
  const nomChamp=k=>NOMS[k]||k;
  function listeFr(a){ return a.length<2?a.join(''):a.slice(0,-1).join(', ')+' et '+a[a.length-1]; }

  // explication : l'essentiel, puis deux détails marquants, puis une ouverture
  function expliquer(id,alea){
    const f=fiches[id], ordre=['diametre','distance','jour','annee','atmosphere','temperature','geologie','records','histoire','missions','lunes','orbite','masse'];
    const dispo=ordre.filter(k=>f.champs[k]&&k!=='diametre'&&k!=='masse'&&!(f.genre==='planete'&&['masse'].includes(k)));
    const marquants=[]; const pref=f.genre==='planete'||f.genre==='lune'?['atmosphere','temperature','geologie','records','lunes','jour','annee']:['histoire','records','orbite','missions','geologie'];
    for(const k of pref) if(f.champs[k]&&marquants.length<2) marquants.push(k);
    for(const k of dispo) if(marquants.length<2&&!marquants.includes(k)) marquants.push(k);
    const essentiel=f.resume+(f.champs.diametre&&f.genre!=='mission'?' '+f.champs.diametre[0]:'');
    const reste=Object.keys(f.champs).filter(k=>!marquants.includes(k)&&k!=='diametre'&&f.champs[k]);
    const ouv=reste.length?pick(['Si tu veux, je peux aussi te parler de ','Je peux continuer avec ','Dis-moi si tu veux en savoir plus sur '],alea)+listeFr(reste.slice(0,3).map(nomChamp))+'.':'';
    return [genre(f,essentiel)].concat(marquants.map(k=>genre(f,f.champs[k][0]))).concat(ouv?[ouv]:[]).join(' ');
  }

  // comparaison point par point sur les grandeurs numériques communes
  // [champ, début de phrase, verbe, unité, décimales, mot du rapport] : la masse se dit en rapport (un chiffre en puissances de dix ne se dit pas à l'oral)
  const CMP=[['diametre','Pour la taille','mesure','kilomètres de diamètre',0],['masse','Pour la masse',null,'',0],
    ['distance','Pour la distance au Soleil','est à','millions de kilomètres',1],['annee','Pour la durée de l’année','dure','jours terrestres',0,'celle '],['gravite','Pour la pesanteur','est de','mètres par seconde carrée',2,'celle ']];
  const fois=r=>r>=1?fr(r,r<10?1:0)+' fois plus':fr(1/r,1/r<10?1:0)+' fois moins';
  function comparer(a,b){
    const A_=fiches[a], B_=fiches[b], lignes=[], de=f=>/^(?:le|la|les|l’)/.test(f.nom)?f.nom.replace(/^le /,'du ').replace(/^la /,'de la ').replace(/^l’/,'de l’'):'de '+f.nom;
    for(const [cle,intro,verbe,unite,dec,suj] of CMP){
      const x=A_.champs[cle], y=B_.champs[cle]; if(!x||!y||x[1]==null||y[1]==null) continue;
      if(cle==='distance'&&(A_.genre==='lune'||B_.genre==='lune')) continue;
      const r=x[1]/y[1];
      if(cle==='masse'){ lignes.push(Math.abs(r-1)<.08?intro+', les deux sont presque égales.':intro+', celle '+de(A_)+' est '+(r>=1?fr(r,r<10?1:0)+' fois plus grande':fr(1/r,1/r<10?1:0)+' fois plus petite')+' que celle '+de(B_)+'.'); continue; }
      lignes.push(Math.abs(r-1)<.08
        ? intro+', les deux sont presque identiques, autour de '+fr(x[1],dec)+' '+unite+'.'
        : intro+', '+(suj?suj+de(A_):A_.nom)+' '+verbe+' '+fr(x[1],dec)+' '+unite+', contre '+fr(y[1],dec)+' pour '+B_.nom+', soit '+fois(r)+'.');
    }
    const ta=A_.champs.temperature, tb=B_.champs.temperature; if(ta&&tb&&ta[1]!=null&&tb[1]!=null) lignes.push('Pour la température moyenne, '+A_.nom+' est à '+degres(ta[1])+' et '+B_.nom+' à '+degres(tb[1])+'.');
    const la=A_.champs.lunes, lb=B_.champs.lunes; if(la&&lb&&la[1]!=null&&lb[1]!=null) lignes.push('Pour les lunes, '+A_.nom+' '+(la[1]?'en a '+la[1]:'n’en a aucune')+' et '+B_.nom+' '+(lb[1]?'en a '+lb[1]:'n’en a aucune')+'.');
    if(!lignes.length) return 'Je n’ai pas assez de chiffres communs pour comparer '+A_.nom+' et '+B_.nom+' point par point.';
    return 'Comparons '+A_.nom+' et '+B_.nom+'. '+lignes.join(' ');
  }
  const degres=v=>(v<0?'moins '+fr(-v):fr(v))+' degrés Celsius';
  const maj=s=>s.replace(/^./,c=>c.toUpperCase());

  /** bloc de contexte pour l'IA : les fiches des astres cités, avec leur source, et la consigne d'honnêteté */
  function contexte(texte){
    const ids=trouverTous(texte); if(!ids.length) return '';
    const parties=ids.slice(0,3).map(id=>{
      const f=fiches[id];
      return 'FICHE « '+f.nom+' » : '+f.resume+' '+Object.keys(f.champs).map(k=>nomChamp(k).replace(/^./,c=>c.toUpperCase())+' : '+f.champs[k][0]+' ['+f.champs[k][2]+']').join(' ');
    });
    const codes=[...new Set(parties.join(' ').match(/\[([A-Z0-9]+)\]/g)||[])].map(c=>c.slice(1,-1));
    return 'CONNAISSANCES ESPACE VÉRIFIÉES (sources : '+codes.map(c=>c+' = '+(SOURCES[c]||{t:c}).t).join(' ; ')+') :\n'+parties.join('\n')+'\nCONSIGNE : appuie-toi sur ces fiches pour les chiffres. Si une donnée demandée n’y figure pas, dis que tu ne l’as pas au lieu de l’inventer. Réponse parlée : sans symbole, unités en toutes lettres.';
  }

  UI.savoir={SOURCES,fiches,fiche:id=>fiches[id]||null,trouver,trouverTous,repondre,expliquer,comparer,contexte,champs:Object.keys(NOMS),norm,fr};
})();
