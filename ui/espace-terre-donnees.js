"use strict";
/* ═════════════ TERRE VIVANTE : données du trafic simulé et des villes (aucun dessin) ═════════════
   RayleUI.espaceTerreDonnees = { AEROPORTS, ROUTES_AERIENNES, VOIES_MARITIMES, VILLES }
   • AEROPORTS : [code IATA, nom français, latitude, longitude] — 70 grandes plates-formes (valeurs approchées).
   • ROUTES_AERIENNES : [code, code, poids] — liaisons principales PLAUSIBLES entre ces plates-formes ; le poids (1 à 5) répartit les avions. Ce n'est PAS le trafic réel d'un jour donné.
   • VOIES_MARITIMES : grandes routes des cargos et des pétroliers, en points de passage [latitude, longitude] choisis en mer (Suez, Malacca, Panama, cap de Bonne-Espérance, Atlantique, Pacifique…).
   • VILLES : [nom, latitude, longitude, pays] — grandes villes du monde pour placer un point ou viser une ville (les capitales et monuments sont dans ui/espace-lieux.js).
   Tout est simulé : le fond l'annonce toujours (« trafic simulé »). Le temps réel n'est branché que si le Worker propose la route /vols (voir docs/espace-trafic.md). */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  const AEROPORTS=[
    ['ATL','Atlanta',33.64,-84.43],['LAX','Los Angeles',33.94,-118.41],['ORD','Chicago',41.98,-87.9],['DFW','Dallas',32.9,-97.04],['DEN','Denver',39.86,-104.67],['JFK','New York',40.64,-73.78],
    ['SFO','San Francisco',37.62,-122.38],['SEA','Seattle',47.45,-122.31],['MIA','Miami',25.79,-80.29],['YYZ','Toronto',43.68,-79.63],['YVR','Vancouver',49.19,-123.18],['MEX','Mexico',19.44,-99.07],
    ['HNL','Honolulu',21.32,-157.92],['ANC','Anchorage',61.17,-150.0],['GRU','São Paulo',-23.43,-46.47],['EZE','Buenos Aires',-34.82,-58.54],['BOG','Bogota',4.7,-74.15],['SCL','Santiago',-33.39,-70.79],
    ['LIM','Lima',-12.02,-77.11],['LHR','Londres',51.47,-0.45],['CDG','Paris',49.01,2.55],['FRA','Francfort',50.04,8.56],['AMS','Amsterdam',52.31,4.76],['MAD','Madrid',40.49,-3.57],
    ['FCO','Rome',41.8,12.25],['IST','Istanbul',41.26,28.74],['MUC','Munich',48.35,11.79],['ZRH','Zurich',47.46,8.55],['CPH','Copenhague',55.62,12.66],['ARN','Stockholm',59.65,17.92],
    ['SVO','Moscou',55.97,37.41],['LIS','Lisbonne',38.78,-9.14],['DUB','Dublin',53.43,-6.27],['DXB','Dubaï',25.25,55.36],['DOH','Doha',25.27,51.61],['AUH','Abou Dabi',24.43,54.65],
    ['CAI','Le Caire',30.12,31.41],['JNB','Johannesburg',-26.14,28.25],['ADD','Addis-Abeba',8.98,38.8],['NBO','Nairobi',-1.32,36.93],['LOS','Lagos',6.58,3.32],['CMN','Casablanca',33.37,-7.59],
    ['CPT','Le Cap',-33.97,18.6],['DEL','Delhi',28.56,77.1],['BOM','Bombay',19.09,72.87],['BLR','Bangalore',13.2,77.71],['SIN','Singapour',1.36,103.99],['BKK','Bangkok',13.69,100.75],
    ['HKG','Hong Kong',22.31,113.91],['PEK','Pékin',40.08,116.58],['PVG','Shanghai',31.14,121.81],['CAN','Canton',23.39,113.3],['ICN','Séoul',37.46,126.44],['NRT','Tokyo',35.77,140.39],
    ['HND','Tokyo Haneda',35.55,139.78],['KUL','Kuala Lumpur',2.75,101.71],['CGK','Jakarta',-6.13,106.66],['MNL','Manille',14.51,121.02],['TPE','Taipei',25.08,121.23],['SYD','Sydney',-33.94,151.18],
    ['MEL','Melbourne',-37.67,144.84],['AKL','Auckland',-37.01,174.79],['PER','Perth',-31.94,115.97],['SGN','Hô Chi Minh-Ville',10.82,106.65],['IAH','Houston',29.98,-95.34],['BOS','Boston',42.36,-71.01],
    ['PTY','Panama',9.07,-79.38],['KWI','Koweït',29.23,47.97],['RUH','Riyad',24.96,46.7],['THR','Téhéran',35.41,51.15],['KHI','Karachi',24.91,67.16],['CMB','Colombo',7.18,79.88]
  ];
  // [a, b, poids] : les grandes liaisons (transatlantique, transpacifique, Europe–Asie par le Golfe, Asie du Sud-Est, Amériques, Afrique, Océanie)
  const ROUTES_AERIENNES=[
    ['JFK','LHR',5],['JFK','CDG',4],['JFK','FRA',3],['BOS','LHR',3],['ORD','LHR',3],['ATL','LHR',2],['LAX','LHR',3],['YYZ','LHR',3],['MIA','MAD',2],['JFK','MAD',2],['JFK','FCO',2],['JFK','AMS',3],['ORD','FRA',3],['DFW','LHR',2],
    ['LAX','NRT',4],['SFO','NRT',3],['SFO','ICN',2],['LAX','ICN',2],['SEA','NRT',2],['LAX','SYD',3],['SFO','SYD',2],['LAX','AKL',2],['LAX','HNL',5],['SFO','HNL',4],['HNL','NRT',3],['HNL','SYD',1],['ANC','NRT',2],['SEA','ICN',2],['YVR','HKG',2],['YVR','NRT',2],
    ['LAX','PVG',2],['SFO','PEK',2],['JFK','PEK',2],['ORD','PEK',2],['JFK','HKG',2],['ORD','NRT',2],['DFW','NRT',1],['YYZ','PEK',1],
    ['LHR','DXB',5],['CDG','DXB',3],['FRA','DXB',3],['LHR','DOH',3],['FRA','DOH',2],['LHR','SIN',4],['CDG','SIN',2],['FRA','SIN',2],['LHR','HKG',4],['CDG','PEK',3],['FRA','PEK',3],['LHR','DEL',4],['LHR','BOM',3],['CDG','DEL',2],['FRA','DEL',2],['FRA','BOM',2],
    ['LHR','NRT',3],['CDG','NRT',3],['FRA','NRT',2],['AMS','PVG',2],['LHR','PVG',2],['CDG','PVG',2],['SVO','PEK',2],['SVO','DXB',2],['IST','DXB',2],['IST','JFK',2],['IST','PEK',1],['LHR','SYD',1],['DXB','SYD',3],['DOH','SYD',2],['SIN','SYD',4],['SIN','MEL',3],['SIN','PER',2],
    ['DXB','DEL',5],['DXB','BOM',5],['DXB','KHI',3],['DXB','BKK',3],['DXB','SIN',3],['DXB','JNB',2],['DXB','CAI',3],['DOH','BKK',2],['DOH','DEL',3],['AUH','DEL',2],['DXB','NBO',2],['DXB','HKG',2],['KWI','DXB',2],['RUH','DXB',2],['THR','DXB',2],['DXB','CMB',2],
    ['SIN','BKK',4],['SIN','KUL',5],['SIN','CGK',4],['SIN','HKG',4],['SIN','PVG',2],['SIN','BLR',2],['SIN','DEL',2],['SIN','MNL',3],['SIN','SGN',2],['HKG','PVG',3],['HKG','BKK',3],['HKG','TPE',4],['HKG','MNL',2],['HKG','NRT',2],['HKG','ICN',2],['HKG','CAN',2],
    ['PEK','PVG',5],['PEK','CAN',4],['PEK','ICN',3],['PEK','NRT',3],['PVG','NRT',3],['PVG','ICN',4],['ICN','NRT',5],['TPE','NRT',3],['TPE','ICN',2],['HND','PVG',1],['CAN','SIN',2],['BKK','NRT',2],['BKK','DEL',2],['KUL','BKK',2],['BOM','DEL',5],['BLR','DEL',3],['BLR','BOM',3],
    ['SYD','AKL',4],['SYD','MEL',5],['MEL','AKL',2],['PER','MEL',2],['PER','SYD',2],
    ['JFK','LAX',5],['JFK','SFO',3],['JFK','ORD',3],['JFK','ATL',3],['JFK','MIA',3],['ATL','LAX',2],['ORD','LAX',3],['DFW','LAX',2],['DEN','LAX',2],['SEA','SFO',2],['ATL','MIA',2],['IAH','LAX',1],['YYZ','JFK',2],['YVR','SEA',2],['YVR','LAX',1],['YYZ','YVR',2],['MEX','LAX',2],['MEX','JFK',1],['MEX','DFW',1],
    ['JFK','GRU',2],['MIA','GRU',2],['MIA','BOG',3],['MIA','LIM',2],['MIA','EZE',1],['MIA','MEX',2],['MIA','PTY',2],['PTY','BOG',2],['GRU','EZE',3],['GRU','SCL',2],['SCL','LIM',2],['GRU','LIS',2],['GRU','MAD',2],['GRU','CDG',2],['EZE','MAD',2],['BOG','MAD',2],['LIM','MAD',1],['MEX','MAD',1],['SCL','MAD',1],['GRU','FRA',1],
    ['LHR','CDG',3],['LHR','AMS',3],['LHR','FRA',3],['LHR','MAD',3],['LHR','FCO',2],['LHR','DUB',4],['LHR','ZRH',2],['CDG','FCO',2],['CDG','MAD',3],['CDG','FRA',2],['CDG','AMS',2],['CDG','IST',2],['FRA','IST',3],['FRA','MUC',2],['FRA','ZRH',2],['AMS','MAD',2],['MAD','LIS',3],['CPH','ARN',2],['LHR','CPH',2],['FRA','CPH',2],['FRA','SVO',2],['IST','SVO',2],
    ['CDG','CMN',3],['MAD','CMN',2],['CDG','CAI',2],['FRA','CAI',1],['IST','CAI',2],['LHR','JNB',3],['FRA','JNB',2],['CDG','LOS',2],['LHR','LOS',2],['LHR','NBO',2],['AMS','NBO',1],['CDG','NBO',1],['IST','ADD',1],['ADD','NBO',2],['ADD','DXB',2],['JNB','CPT',5],['JNB','NBO',2],['JNB','LOS',1],['CAI','JNB',1],['CAI','NBO',1],['LOS','ADD',1],['CPT','LHR',1],['JNB','SYD',1],['JNB','SIN',1],['JNB','GRU',1],['CMN','JFK',1],['LIS','JFK',1]
  ];
  // [identifiant, nom, type, points de passage [lat, lon]]
  const VOIES_MARITIMES=[
    ['atlantique-nord','Atlantique Nord (Rotterdam – New York)','conteneurs',[[51.9,4.1],[51.3,2.0],[50.0,-2.0],[49.5,-6.0],[48.0,-20.0],[44.0,-40.0],[41.0,-60.0],[40.3,-73.8]]],
    ['mediterranee-suez','Méditerranée – canal de Suez – Aden','conteneurs',[[36.0,-5.6],[37.0,2.0],[37.5,9.0],[35.5,15.0],[34.5,22.0],[33.5,28.0],[31.5,32.4],[29.95,32.55],[28.0,33.5],[26.0,35.0],[24.0,36.0],[21.0,38.2],[17.0,40.5],[14.0,42.5],[12.6,44.0],[12.8,52.0],[11.0,60.0],[8.0,70.0],[6.0,80.0]]],
    ['ocean-indien-malacca','Océan Indien – détroit de Malacca – Singapour','conteneurs',[[6.0,80.0],[5.5,90.0],[5.8,96.0],[3.5,99.5],[1.3,103.7]]],
    ['mer-de-chine','Mer de Chine méridionale – Shanghai – Tokyo','conteneurs',[[1.3,103.8],[6.0,108.0],[12.0,111.0],[19.0,114.5],[24.0,119.0],[30.0,123.0],[31.2,122.6],[30.5,128.0],[32.5,134.0],[33.8,137.5],[34.7,139.7]]],
    ['transpacifique','Transpacifique (Tokyo – Los Angeles)','conteneurs',[[34.7,139.8],[38.0,160.0],[42.0,180.0],[42.0,-160.0],[38.0,-140.0],[34.0,-124.0],[33.6,-118.4]]],
    ['panama-atlantique','New York – canal de Panama','conteneurs',[[40.3,-73.8],[38.0,-72.0],[30.0,-72.5],[24.5,-72.0],[22.0,-72.6],[21.6,-73.6],[20.3,-73.7],[19.6,-74.0],[17.0,-75.5],[13.0,-77.5],[9.4,-79.9]]],
    ['panama-pacifique','Canal de Panama – Los Angeles','conteneurs',[[8.9,-79.6],[6.0,-85.0],[10.0,-100.0],[15.0,-112.0],[25.0,-118.0],[33.6,-118.4]]],
    ['cap-de-bonne-esperance','Europe – cap de Bonne-Espérance – Bombay','conteneurs',[[50.0,-5.0],[40.0,-12.0],[30.0,-16.0],[15.0,-20.0],[3.0,-8.0],[-8.0,8.0],[-20.0,8.0],[-30.0,14.0],[-36.0,20.0],[-34.5,27.0],[-30.0,33.0],[-20.0,40.0],[-10.0,45.0],[0.0,52.0],[10.0,60.0],[18.8,72.4]]],
    ['golfe-persique','Golfe Persique – Singapour (pétroliers)','pétroliers',[[26.9,50.4],[27.0,52.0],[26.4,56.4],[25.0,58.5],[22.5,62.0],[18.0,64.5],[12.0,68.0],[7.0,76.0],[5.8,84.0],[5.5,92.0],[5.8,96.0],[3.5,98.8],[1.3,103.7]]],
    ['atlantique-sud','Le Cap – Santos','vrac',[[-34.0,18.0],[-35.0,0.0],[-33.0,-20.0],[-30.0,-35.0],[-25.0,-45.0]]],
    ['europe-bresil','Europe – Santos','conteneurs',[[50.0,-5.0],[36.0,-12.0],[20.0,-26.0],[5.0,-31.0],[-5.0,-31.0],[-15.0,-35.0],[-23.8,-45.0]]],
    ['mediterranee-ouest','Marseille – Gibraltar – Suez','conteneurs',[[43.2,5.3],[40.0,6.0],[38.0,11.0],[36.0,15.0],[35.5,15.5]]]
  ];
  const V=(nom,lat,lon,pays)=>[nom,lat,lon,pays];
  const VILLES=[
    V('Lyon',45.76,4.84,'France'),V('Marseille',43.3,5.37,'France'),V('Toulouse',43.6,1.44,'France'),V('Nice',43.7,7.27,'France'),V('Nantes',47.22,-1.55,'France'),V('Strasbourg',48.57,7.75,'France'),
    V('Montpellier',43.61,3.88,'France'),V('Bordeaux',44.84,-0.58,'France'),V('Lille',50.63,3.06,'France'),V('Rennes',48.11,-1.68,'France'),V('Grenoble',45.19,5.72,'France'),V('Brest',48.39,-4.49,'France'),
    V('Ajaccio',41.92,8.74,'France'),V('Fort-de-France',14.6,-61.07,'France'),V('Saint-Denis de La Réunion',-20.88,55.45,'France'),V('Cayenne',4.94,-52.33,'France'),V('Nouméa',-22.27,166.45,'France'),V('Papeete',-17.54,-149.57,'France'),
    V('Barcelone',41.39,2.17,'Espagne'),V('Séville',37.39,-5.98,'Espagne'),V('Valence',39.47,-0.38,'Espagne'),V('Milan',45.46,9.19,'Italie'),V('Naples',40.85,14.27,'Italie'),V('Venise',45.44,12.32,'Italie'),V('Florence',43.77,11.26,'Italie'),
    V('Munich',48.14,11.58,'Allemagne'),V('Hambourg',53.55,9.99,'Allemagne'),V('Francfort',50.11,8.68,'Allemagne'),V('Cologne',50.94,6.96,'Allemagne'),V('Vienne',48.21,16.37,'Autriche'),V('Zurich',47.37,8.54,'Suisse'),V('Genève',46.2,6.14,'Suisse'),
    V('Amsterdam',52.37,4.9,'Pays-Bas'),V('Rotterdam',51.92,4.48,'Pays-Bas'),V('Prague',50.08,14.44,'Tchéquie'),V('Budapest',47.5,19.04,'Hongrie'),V('Bucarest',44.43,26.1,'Roumanie'),V('Stockholm',59.33,18.07,'Suède'),
    V('Oslo',59.91,10.75,'Norvège'),V('Copenhague',55.68,12.57,'Danemark'),V('Helsinki',60.17,24.94,'Finlande'),V('Dublin',53.35,-6.26,'Irlande'),V('Édimbourg',55.95,-3.19,'Royaume-Uni'),V('Manchester',53.48,-2.24,'Royaume-Uni'),
    V('Reykjavik',64.15,-21.94,'Islande'),V('Belgrade',44.79,20.45,'Serbie'),V('Istanbul',41.01,28.98,'Turquie'),V('Saint-Pétersbourg',59.93,30.34,'Russie'),V('Novossibirsk',55.03,82.92,'Russie'),V('Vladivostok',43.12,131.89,'Russie'),
    V('Lagos',6.52,3.38,'Nigeria'),V('Kinshasa',-4.44,15.27,'RD Congo'),V('Johannesburg',-26.2,28.05,'Afrique du Sud'),V('Le Cap',-33.92,18.42,'Afrique du Sud'),V('Casablanca',33.57,-7.59,'Maroc'),V('Marrakech',31.63,-8.01,'Maroc'),
    V('Tunis',36.81,10.18,'Tunisie'),V('Dakar',14.72,-17.47,'Sénégal'),V('Abidjan',5.36,-4.01,'Côte d’Ivoire'),V('Accra',5.6,-0.19,'Ghana'),V('Luanda',-8.84,13.23,'Angola'),V('Dar es Salaam',-6.79,39.21,'Tanzanie'),
    V('Khartoum',15.5,32.56,'Soudan'),V('Antananarivo',-18.88,47.51,'Madagascar'),V('Tripoli',32.89,13.19,'Libye'),V('Addis-Abeba',9.03,38.74,'Éthiopie'),
    V('Osaka',34.69,135.5,'Japon'),V('Kyoto',35.01,135.77,'Japon'),V('Sapporo',43.06,141.35,'Japon'),V('Shanghai',31.23,121.47,'Chine'),V('Hong Kong',22.32,114.17,'Chine'),V('Canton',23.13,113.26,'Chine'),
    V('Shenzhen',22.54,114.06,'Chine'),V('Chengdu',30.57,104.07,'Chine'),V('Taipei',25.03,121.57,'Taïwan'),V('Hanoï',21.03,105.85,'Viêt Nam'),V('Hô Chi Minh-Ville',10.82,106.63,'Viêt Nam'),V('Singapour',1.35,103.82,'Singapour'),
    V('Kuala Lumpur',3.14,101.69,'Malaisie'),V('Manille',14.6,120.98,'Philippines'),V('Bombay',19.08,72.88,'Inde'),V('Calcutta',22.57,88.36,'Inde'),V('Bangalore',12.97,77.59,'Inde'),V('Chennai',13.08,80.27,'Inde'),
    V('Karachi',24.86,67.01,'Pakistan'),V('Lahore',31.55,74.34,'Pakistan'),V('Dacca',23.81,90.41,'Bangladesh'),V('Téhéran',35.69,51.39,'Iran'),V('Bagdad',33.31,44.36,'Irak'),V('Dubaï',25.2,55.27,'Émirats arabes unis'),
    V('Doha',25.29,51.53,'Qatar'),V('Jérusalem',31.77,35.21,'Israël'),V('Tel Aviv',32.09,34.78,'Israël'),V('Beyrouth',33.89,35.5,'Liban'),V('Damas',33.51,36.28,'Syrie'),V('Kaboul',34.53,69.17,'Afghanistan'),
    V('Tachkent',41.3,69.24,'Ouzbékistan'),V('Colombo',6.93,79.86,'Sri Lanka'),V('Rangoun',16.87,96.2,'Birmanie'),V('Phnom Penh',11.56,104.93,'Cambodge'),V('Mecque',21.39,39.86,'Arabie saoudite'),
    V('New York',40.71,-74.01,'États-Unis'),V('Los Angeles',34.05,-118.24,'États-Unis'),V('Chicago',41.88,-87.63,'États-Unis'),V('Houston',29.76,-95.37,'États-Unis'),V('San Francisco',37.77,-122.42,'États-Unis'),
    V('Miami',25.76,-80.19,'États-Unis'),V('Boston',42.36,-71.06,'États-Unis'),V('Seattle',47.61,-122.33,'États-Unis'),V('Dallas',32.78,-96.8,'États-Unis'),V('Las Vegas',36.17,-115.14,'États-Unis'),
    V('La Nouvelle-Orléans',29.95,-90.07,'États-Unis'),V('Anchorage',61.22,-149.9,'États-Unis'),V('Honolulu',21.31,-157.86,'États-Unis'),V('Montréal',45.5,-73.57,'Canada'),V('Toronto',43.65,-79.38,'Canada'),
    V('Vancouver',49.28,-123.12,'Canada'),V('Québec',46.81,-71.21,'Canada'),V('La Havane',23.11,-82.37,'Cuba'),V('Bogota',4.71,-74.07,'Colombie'),V('Lima',-12.05,-77.04,'Pérou'),V('Santiago',-33.45,-70.67,'Chili'),
    V('São Paulo',-23.55,-46.63,'Brésil'),V('Rio de Janeiro',-22.91,-43.17,'Brésil'),V('Caracas',10.48,-66.9,'Venezuela'),V('Quito',-0.18,-78.47,'Équateur'),V('La Paz',-16.5,-68.15,'Bolivie'),V('Montevideo',-34.9,-56.16,'Uruguay'),
    V('Panama',8.98,-79.52,'Panama'),V('Sydney',-33.87,151.21,'Australie'),V('Melbourne',-37.81,144.96,'Australie'),V('Brisbane',-27.47,153.03,'Australie'),V('Perth',-31.95,115.86,'Australie'),V('Auckland',-36.85,174.76,'Nouvelle-Zélande'),
    V('Wellington',-41.29,174.78,'Nouvelle-Zélande')
  ];
  UI.espaceTerreDonnees={AEROPORTS,ROUTES_AERIENNES,VOIES_MARITIMES,VILLES};
})();
