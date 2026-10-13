"use strict";
/* ═════════════ FOND ESPACE : lieux de la Terre, rovers martiens, trou noir et fiches éducatives (données, aucun dessin) ═════════════
   RayleUI.espaceLieux = { LIEUX, ROVERS, TROU_NOIR, FICHES }
   LIEUX  : { id, nom, type:'pays'|'capitale'|'monument', lat, lon, zoom?, capitale?, info? } — latitude nord +, longitude est +, en degrés (valeurs approchées : un point d'intérêt, pas une frontière).
   ROVERS : sites réels d'atterrissage (latitude / longitude planétographiques de Mars).
   FICHES : par astre, des « rubriques » (atmosphère, géologie, histoire, missions…) : Raylé en tire quelques-unes au hasard, la fiche affichée les montre toutes.
   Les chiffres sont des ordres de grandeur sûrs ; ce qui est daté dans le futur est écrit « prévu ». */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  const P=(id,nom,lat,lon,capitale)=>({id,nom,type:'pays',lat,lon,zoom:1.9,capitale});
  const C=(id,nom,lat,lon,pays)=>({id,nom,type:'capitale',lat,lon,zoom:1.35,pays});
  const M=(id,nom,lat,lon,info)=>({id,nom,type:'monument',lat,lon,zoom:1.18,info});

  const LIEUX=[
    // pays (point central approximatif)
    P('france','France',46.6,2.4,'Paris'),P('japon','Japon',36.2,138.3,'Tokyo'),P('chine','Chine',35.9,104.2,'Pékin'),P('inde','Inde',22.4,79.0,'New Delhi'),P('bresil','Brésil',-10.8,-52.9,'Brasilia'),
    P('etats-unis','États-Unis',39.8,-98.6,'Washington'),P('canada','Canada',56.1,-106.3,'Ottawa'),P('mexique','Mexique',23.6,-102.5,'Mexico'),P('argentine','Argentine',-34.6,-64.0,'Buenos Aires'),
    P('australie','Australie',-25.7,134.5,'Canberra'),P('russie','Russie',61.5,99.0,'Moscou'),P('royaume-uni','Royaume-Uni',54.0,-2.5,'Londres'),P('allemagne','Allemagne',51.1,10.4,'Berlin'),
    P('italie','Italie',42.8,12.5,'Rome'),P('espagne','Espagne',40.2,-3.6,'Madrid'),P('portugal','Portugal',39.6,-8.0,'Lisbonne'),P('egypte','Égypte',26.8,30.0,'Le Caire'),
    P('afrique-du-sud','Afrique du Sud',-29.0,24.7,'Pretoria'),P('nigeria','Nigeria',9.6,8.1,'Abuja'),P('kenya','Kenya',0.5,37.9,'Nairobi'),P('maroc','Maroc',31.8,-7.1,'Rabat'),P('algerie','Algérie',28.2,2.6,'Alger'),
    P('tunisie','Tunisie',33.9,9.6,'Tunis'),P('turquie','Turquie',39.0,35.2,'Ankara'),P('arabie-saoudite','Arabie saoudite',24.0,45.1,'Riyad'),P('iran','Iran',32.6,54.3,'Téhéran'),P('irak','Irak',33.0,43.7,'Bagdad'),
    P('israel','Israël',31.4,35.0,'Jérusalem'),P('indonesie','Indonésie',-2.5,118.0,'Jakarta'),P('coree-du-sud','Corée du Sud',36.5,127.9,'Séoul'),P('vietnam','Viêt Nam',16.2,106.3,'Hanoï'),
    P('thailande','Thaïlande',15.1,101.0,'Bangkok'),P('philippines','Philippines',12.9,122.9,'Manille'),P('malaisie','Malaisie',4.2,102.0,'Kuala Lumpur'),P('pakistan','Pakistan',30.4,69.3,'Islamabad'),
    P('pologne','Pologne',52.1,19.4,'Varsovie'),P('ukraine','Ukraine',49.0,31.4,'Kiev'),P('suede','Suède',62.8,16.7,'Stockholm'),P('norvege','Norvège',64.5,11.5,'Oslo'),P('finlande','Finlande',64.5,26.3,'Helsinki'),
    P('pays-bas','Pays-Bas',52.2,5.3,'Amsterdam'),P('belgique','Belgique',50.6,4.7,'Bruxelles'),P('suisse','Suisse',46.8,8.2,'Berne'),P('autriche','Autriche',47.6,14.1,'Vienne'),P('grece','Grèce',39.1,22.9,'Athènes'),
    P('irlande','Irlande',53.2,-8.1,'Dublin'),P('danemark','Danemark',56.0,10.0,'Copenhague'),P('roumanie','Roumanie',45.9,24.9,'Bucarest'),P('hongrie','Hongrie',47.2,19.5,'Budapest'),
    P('islande','Islande',64.9,-18.6,'Reykjavik'),P('groenland','Groenland',72.0,-40.0),P('chili','Chili',-30.0,-71.0,'Santiago'),P('perou','Pérou',-9.2,-75.0,'Lima'),P('colombie','Colombie',4.6,-74.1,'Bogota'),
    P('venezuela','Venezuela',7.1,-66.2,'Caracas'),P('cuba','Cuba',21.6,-79.0,'La Havane'),P('nouvelle-zelande','Nouvelle-Zélande',-41.5,172.8,'Wellington'),P('madagascar','Madagascar',-19.4,46.7,'Antananarivo'),
    P('ethiopie','Éthiopie',8.6,39.6,'Addis-Abeba'),P('mongolie','Mongolie',46.9,103.8,'Oulan-Bator'),P('kazakhstan','Kazakhstan',48.0,67.3,'Astana'),P('nepal','Népal',28.3,84.1,'Katmandou'),
    P('republique-democratique-du-congo','République démocratique du Congo',-2.9,23.7,'Kinshasa'),P('antarctique','Antarctique',-80.0,0.0),
    // capitales
    C('paris','Paris',48.8566,2.3522,'France'),C('londres','Londres',51.5072,-0.1276,'Royaume-Uni'),C('berlin','Berlin',52.52,13.405,'Allemagne'),C('rome','Rome',41.9028,12.4964,'Italie'),C('madrid','Madrid',40.4168,-3.7038,'Espagne'),
    C('washington','Washington',38.9072,-77.0369,'États-Unis'),C('tokyo','Tokyo',35.6762,139.6503,'Japon'),C('pekin','Pékin',39.9042,116.4074,'Chine'),C('moscou','Moscou',55.7558,37.6173,'Russie'),C('brasilia','Brasilia',-15.7939,-47.8828,'Brésil'),
    C('new-delhi','New Delhi',28.6139,77.209,'Inde'),C('le-caire','Le Caire',30.0444,31.2357,'Égypte'),C('ottawa','Ottawa',45.4215,-75.6972,'Canada'),C('canberra','Canberra',-35.2809,149.13,'Australie'),C('mexico','Mexico',19.4326,-99.1332,'Mexique'),
    C('buenos-aires','Buenos Aires',-34.6037,-58.3816,'Argentine'),C('pretoria','Pretoria',-25.7479,28.2293,'Afrique du Sud'),C('ankara','Ankara',39.9334,32.8597,'Turquie'),C('seoul','Séoul',37.5665,126.978,'Corée du Sud'),
    C('lisbonne','Lisbonne',38.7223,-9.1393,'Portugal'),C('bruxelles','Bruxelles',50.8503,4.3517,'Belgique'),C('berne','Berne',46.948,7.4474,'Suisse'),C('athenes','Athènes',37.9838,23.7275,'Grèce'),C('varsovie','Varsovie',52.2297,21.0122,'Pologne'),
    C('kiev','Kiev',50.4501,30.5234,'Ukraine'),C('rabat','Rabat',34.0209,-6.8416,'Maroc'),C('alger','Alger',36.7538,3.0588,'Algérie'),C('nairobi','Nairobi',-1.2921,36.8219,'Kenya'),C('abuja','Abuja',9.0765,7.3986,'Nigeria'),
    C('jakarta','Jakarta',-6.2088,106.8456,'Indonésie'),C('bangkok','Bangkok',13.7563,100.5018,'Thaïlande'),C('riyad','Riyad',24.7136,46.6753,'Arabie saoudite'),
    // monuments, sites naturels et lieux de l'exploration spatiale
    M('tour-eiffel','la tour Eiffel',48.8584,2.2945,'Tour de fer de 330 m construite pour l’Exposition universelle de 1889.'),
    M('pyramides','les pyramides de Gizeh',29.9792,31.1342,'La grande pyramide de Khéops (≈ 2560 av. J.-C.) est la seule des sept merveilles de l’Antiquité encore debout.'),
    M('grande-muraille','la Grande Muraille de Chine',40.4319,116.5704,'Ensemble de fortifications construites sur plus de deux millénaires.'),
    M('taj-mahal','le Taj Mahal',27.1751,78.0421,'Mausolée de marbre blanc achevé vers 1653 à Agra.'),
    M('machu-picchu','le Machu Picchu',-13.1631,-72.545,'Cité inca perchée à 2 430 m d’altitude dans les Andes.'),
    M('colisee','le Colisée',41.8902,12.4922,'Amphithéâtre romain inauguré en 80 apr. J.-C.'),
    M('statue-de-la-liberte','la statue de la Liberté',40.6892,-74.0445,'Offerte par la France, inaugurée en 1886.'),
    M('mont-fuji','le mont Fuji',35.3606,138.7274,'Volcan de 3 776 m, point culminant du Japon.'),
    M('everest','l’Everest',27.9881,86.925,'Plus haut sommet du monde : 8 849 m.'),
    M('kilimandjaro','le Kilimandjaro',-3.0674,37.3556,'Plus haut sommet d’Afrique : 5 895 m.'),
    M('grand-canyon','le Grand Canyon',36.1069,-112.1129,'Gorge creusée par le Colorado, jusqu’à 1 800 m de profondeur.'),
    M('opera-de-sydney','l’opéra de Sydney',-33.8568,151.2153,'Ses « voiles » de béton ont été inaugurées en 1973.'),
    M('christ-redempteur','le Christ Rédempteur',-22.9519,-43.2105,'Statue de 30 m au sommet du Corcovado, à Rio.'),
    M('angkor','Angkor Vat',13.4125,103.867,'Plus grand monument religieux du monde, bâti au XIIᵉ siècle.'),
    M('petra','Pétra',30.3285,35.4444,'Cité nabatéenne taillée dans le grès rose, en Jordanie.'),
    M('stonehenge','Stonehenge',51.1789,-1.8262,'Cercle de pierres néolithique vieux de plus de 4 000 ans.'),
    M('burj-khalifa','le Burj Khalifa',25.1972,55.2744,'Plus haute tour du monde : 828 m.'),
    M('mont-blanc','le mont Blanc',45.8326,6.8652,'Point culminant des Alpes : environ 4 806 m.'),
    M('mont-saint-michel','le Mont-Saint-Michel',48.636,-1.5115,'Abbaye dressée sur un îlot, célèbre pour ses grandes marées.'),
    M('sagrada-familia','la Sagrada Família',41.4036,2.1744,'Basilique de Gaudí, en construction depuis 1882.'),
    M('big-ben','Big Ben',51.5007,-0.1246,'Nom de la grosse cloche de la tour du palais de Westminster.'),
    M('acropole','l’Acropole d’Athènes',37.9715,23.7257,'Colline du Parthénon, ≈ Vᵉ siècle av. J.-C.'),
    M('cite-interdite','la Cité interdite',39.9163,116.3972,'Palais impérial de Pékin, 72 hectares.'),
    M('chichen-itza','Chichén Itzá',20.6843,-88.5678,'Cité maya et sa pyramide de Kukulcán.'),
    M('uluru','Uluru',-25.3444,131.0369,'Monolithe de grès sacré pour les Anangu, au cœur de l’Australie.'),
    M('grande-barriere','la Grande Barrière de corail',-18.2871,147.6992,'Plus grand ensemble corallien du monde, visible depuis l’espace.'),
    M('niagara','les chutes du Niagara',43.0962,-79.0377,'Chutes à la frontière du Canada et des États-Unis.'),
    M('cap-canaveral','Cap Canaveral',28.3922,-80.6077,'Base de lancement de la NASA et de nombreuses missions Apollo, navette et Artemis.'),
    M('kourou','Kourou',5.2322,-52.7693,'Centre spatial guyanais : la base de lancement d’Ariane et de Vega, proche de l’équateur.'),
    M('baikonour','Baïkonour',45.9646,63.3052,'Plus ancien cosmodrome du monde : Spoutnik (1957) et Gagarine (1961) en sont partis.'),
    M('mauna-kea','le Mauna Kea',19.8207,-155.4681,'Volcan de 4 207 m, site de grands observatoires astronomiques.')
  ];

  const ROVERS={
    perseverance:{nom:'Perseverance',court:'Perseverance',site:'le cratère Jezero',lat:18.4446,lon:77.4509,alias:['perseverance','persy','rover perseverance','mars 2020'],
      infos:['Lancé le 30 juillet 2020, posé le 18 février 2021 dans le cratère Jezero, un ancien delta de rivière.','Il collecte des carottes de roche dans des tubes, en vue d’un retour sur Terre.','Il a emporté l’hélicoptère Ingenuity, qui a réalisé 72 vols avant la fin de sa mission en janvier 2024.','L’instrument MOXIE y a produit de l’oxygène à partir du CO₂ martien.']},
    curiosity:{nom:'Curiosity',court:'Curiosity',site:'le cratère Gale',lat:-4.5895,lon:137.4417,alias:['curiosity','curiosite','rover curiosity','mars science laboratory','msl'],
      infos:['Posé le 6 août 2012 dans le cratère Gale grâce à la manœuvre de la « grue volante ».','Il gravit le mont Sharp, une montagne de couches sédimentaires de 5 km de haut.','Sa pile nucléaire (RTG) lui fournit chaleur et électricité, de jour comme de nuit.','Il a montré que Gale a abrité un lac habitable il y a plusieurs milliards d’années.']}
  };

  const TROU_NOIR={nom:'le trou noir',court:'Trou noir',ra:266.417,dec:-29.008,dist:110,rayonOmbre:2.6};

  /* fiches : rubriques par astre */
  const F=(t,v)=>({t,v});
  const FICHES={
    mercure:[F('Atmosphère','Quasi inexistante : une exosphère très ténue. Les températures vont d’environ −180 °C la nuit à 430 °C le jour.'),F('Géologie','Un noyau de fer qui occupe près de 85 % du rayon, une surface criblée de cratères et l’immense bassin Caloris.'),F('Histoire','Elle tourne trois fois sur elle-même en deux révolutions autour du Soleil, et son année ne dure que 88 jours.'),F('Missions','Mariner 10 (1974), MESSENGER (en orbite de 2011 à 2015) et BepiColombo, dont l’arrivée est prévue fin 2026.')],
    venus:[F('Atmosphère','96 % de gaz carbonique, 92 fois la pression terrestre au sol et 465 °C : l’effet de serre le plus extrême du système solaire.'),F('Géologie','Des plaines de lave, des milliers de volcans, et des nuages d’acide sulfurique qui masquent la surface.'),F('Histoire','Elle tourne à l’envers (rétrograde) et son jour dure plus longtemps que son année.'),F('Missions','Les sondes soviétiques Venera ont envoyé les premières images du sol, Magellan l’a cartographiée par radar ; DAVINCI, VERITAS et EnVision sont prévues.')],
    mars:[F('Atmosphère','Très mince : 95 % de gaz carbonique, moins de 1 % de la pression terrestre, −63 °C en moyenne.'),F('Géologie','Olympus Mons (22 km, le plus grand volcan connu), Valles Marineris (4 000 km de canyons) et des calottes de glace.'),F('Histoire','Elle a abrité de l’eau liquide il y a plus de 3 milliards d’années : des lits de rivières et des deltas en témoignent.'),F('Missions','Les rovers Curiosity (2012) et Perseverance (2021) explorent sa surface ; la Chine a posé Zhurong en 2021.')],
    jupiter:[F('Atmosphère','Hydrogène et hélium, organisés en bandes, avec la Grande Tache rouge, une tempête observée depuis plus de trois siècles.'),F('Structure','Plus de 1 300 Terres tiendraient dans son volume ; il tourne en moins de 10 heures, ce qui l’aplatit.'),F('Lunes','Plus de 90 lunes connues dont les quatre galiléennes : Io (volcans), Europe (océan sous la glace), Ganymède (la plus grosse du système solaire), Callisto.'),F('Missions','Juno l’étudie depuis 2016 ; Europa Clipper et Juice (lancées en 2024 et 2023) sont en route vers ses lunes glacées.')],
    saturne:[F('Anneaux','Des milliards de blocs de glace d’eau sur 280 000 km de large, mais à peine quelques dizaines de mètres d’épaisseur.'),F('Structure','Moins dense que l’eau : il flotterait dans un océan assez grand. Des vents dépassent 1 500 km/h.'),F('Lunes','Titan possède une atmosphère plus dense que celle de la Terre ; Encelade crache des geysers d’eau salée.'),F('Missions','La sonde Cassini l’a étudiée de 2004 à 2017 ; Dragonfly, un drone pour Titan, est prévue vers la fin de la décennie.')],
    uranus:[F('Atmosphère','Hydrogène, hélium et méthane, qui lui donne sa teinte bleu-vert. C’est la planète la plus froide du système solaire (≈ −224 °C).'),F('Structure','Son axe est incliné de 98° : elle roule pratiquement sur son orbite, avec des saisons de 21 ans.'),F('Histoire','Découverte par William Herschel en 1781, la première planète trouvée au télescope.'),F('Missions','Seule la sonde Voyager 2 l’a survolée, en 1986.')],
    neptune:[F('Atmosphère','Les vents les plus violents du système solaire, jusqu’à 2 000 km/h, et une Grande Tache sombre observée par Voyager 2.'),F('Histoire','Son existence a été déduite par le calcul (Le Verrier) avant d’être observée, en 1846.'),F('Lunes','Triton tourne à l’envers : c’est probablement un objet capturé de la ceinture de Kuiper.'),F('Missions','Voyager 2 est la seule sonde à l’avoir visitée, en 1989.')],
    lune:[F('Géologie','Des plaines basaltiques sombres (les « mers ») et des hautes terres criblées de cratères ; pas d’atmosphère notable.'),F('Histoire','Née il y a 4,5 milliards d’années d’un impact géant avec la Terre ; elle montre toujours la même face.'),F('Exploration','Douze hommes l’ont foulée entre 1969 et 1972 (Apollo) ; le programme Artemis prépare le retour d’équipages.'),F('Effets','Elle provoque les marées et stabilise l’inclinaison de l’axe de la Terre.')],
    soleil:[F('Structure','Il concentre 99,86 % de la masse du système solaire ; son cœur atteint 15 millions de degrés, sa surface environ 5 500 °C.'),F('Activité','Un cycle de taches et d’éruptions d’environ 11 ans ; les éruptions peuvent provoquer des aurores et perturber les satellites.'),F('Âge','Environ 4,6 milliards d’années ; il brillera encore ≈ 5 milliards d’années.'),F('Missions','Parker Solar Probe plonge dans sa couronne ; Solar Orbiter l’observe depuis ses pôles.')],
    iss:[F('Dimensions','Environ 109 m de large (la taille d’un terrain de football) pour plus de 400 tonnes ; ses panneaux solaires produisent près de 100 kW.'),F('Orbite','À environ 420 km d’altitude, à 27 600 km/h : un tour de la Terre en 93 minutes, soit 16 levers de Soleil par jour.'),F('Histoire','Assemblée en orbite depuis 1998, habitée sans interruption depuis novembre 2000 ; elle réunit 15 pays.'),F('Science','Microgravité, biologie, matériaux, médecine : plus de 3 000 expériences y ont été menées.')],
    trounoir:[F('Qu’est-ce que c’est','Une région où la gravité est si forte que rien, pas même la lumière, ne peut s’échapper au-delà de l’horizon des événements.'),F('Le nôtre','Sagittarius A*, au centre de la Voie lactée, pèse environ 4 millions de masses solaires et se trouve à 26 000 années-lumière.'),F('Images','Le télescope EHT a photographié l’ombre de M87* en 2019 et celle de Sgr A* en 2022.'),F('Ce que vous voyez','Une vue artistique : le disque d’accrétion brillant, l’anneau de photons et la lumière du fond du ciel déviée par la gravité (lentille gravitationnelle).')]
  };

  UI.espaceLieux={LIEUX,ROVERS,TROU_NOIR,FICHES};
})();
