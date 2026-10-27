import http from 'node:http';

/* Faux Worker de Raylé pour les tests de la Terre : /ping, /actualites (liste + pays), /meteo.
   Chaque requête est notée dans le journal (chemin + paramètres) : les tests vérifient ce qui est demandé (précision des coordonnées, pays…).
   Scénarios (modifiables pendant le test) : actus 'ok' | 'panne' | 'ancien' (route inconnue) | 'vide' ; meteo 'ok' | 'panne' | 'pluie' | 'ancien'. */
const PAYS = [
  { code: 'FR', nom: 'France', lat: 46.6, lon: 2.5, dist: 1500, flux: 6 }, { code: 'DE', nom: 'Allemagne', lat: 51.1, lon: 10.4, dist: 1400, flux: 4 },
  { code: 'ES', nom: 'Espagne', lat: 40.2, lon: -3.6, dist: 1500, flux: 4 }, { code: 'IT', nom: 'Italie', lat: 42.8, lon: 12.5, dist: 1400, flux: 4 },
  { code: 'GB', nom: 'Royaume-Uni', lat: 54, lon: -2.5, dist: 1700, flux: 4 }, { code: 'JP', nom: 'Japon', lat: 36.2, lon: 138.2, dist: 2400, flux: 5 },
  { code: 'US', nom: 'États-Unis', lat: 39.5, lon: -98.5, dist: 4800, flux: 6 }, { code: 'BR', nom: 'Brésil', lat: -10, lon: -52, dist: 4800, flux: 4 },
  { code: 'IN', nom: 'Inde', lat: 22.5, lon: 79, dist: 3200, flux: 5 }, { code: 'AU', nom: 'Australie', lat: -25.7, lon: 134, dist: 5200, flux: 4 },
  { code: 'MONDE', nom: 'Monde', lat: 20, lon: 10, dist: 14000, flux: 8 }
];
const CONTINENT_DE = { FR: 'europe', DE: 'europe', ES: 'europe', IT: 'europe', GB: 'europe', JP: 'asie', IN: 'asie', US: 'amerique-nord', BR: 'amerique-sud', AU: 'oceanie' }, LANGUE_DE = { FR: ['fr'], DE: ['de'], ES: ['es'], IT: ['it'], GB: ['en'], JP: ['ja', 'en'], IN: ['en', 'hi'], US: ['en'], BR: ['pt'], AU: ['en'] };
const heure = d => new Date(Date.now() - d * 60000).toISOString();
const titres = (nom, n) => Array.from({ length: n }, (_, i) => ({ titre: `Titre d'essai numéro ${i + 1} pour ${nom}`, url: `https://exemple.test/${nom}/${i + 1}`, source: i % 2 ? 'Journal B' : 'Journal A', date: i === 4 ? null : heure(8 + i * 17), langue: 'fr' }));
const meteo = (lat, lon, pluie) => ({
  lieu: { lat, lon, altitude: 175, fuseau: 'Europe/Paris' }, modele: 'Météo-France (AROME 1,3 km puis ARPEGE)', source: 'Open-Meteo.com', licence: 'CC BY 4.0',
  actuel: { heure: '2026-10-17T11:30', temp: 17.9, ressenti: 17.6, humidite: 78, pluie: pluie ? 2.4 : 0, code: pluie ? 63 : 3, nuages: pluie ? 100 : 85, pression: 1021.7, vent: 22, direction: 288, rafales: 38, jour: true },
  heures: Array.from({ length: 24 }, (_, i) => ({ h: `2026-10-17T${String((11 + i) % 24).padStart(2, '0')}:00`, temp: 15 + Math.sin(i / 4) * 4, pluie: pluie && i < 6 ? 1.2 : 0, proba: null, code: 3, nuages: 90, vent: 20 })),
  jours: Array.from({ length: 6 }, (_, i) => ({ date: `2026-10-${17 + i}`, code: i % 2 ? 61 : 3, tmin: 10 + i, tmax: 19 - i / 2, pluie: i % 2 ? 2.5 : 0, proba: null, vent: 25, lever: '2026-10-17T08:10', coucher: '2026-10-17T19:12' })),
  genere: new Date().toISOString()
});

/* Fil d'actualités par sujets (route /actualites/fil) : sujets plausibles, localisés, de plusieurs importances */
const S = (id, titre, categorie, importance, lieu, sources, region) => ({ id, titre, categorie, importance, score: importance * 10, date: heure(15), lieu, regions: region ? [region] : [], resume: 'Extrait interne ' + id, sources: sources.map((nom, i) => ({ nom, url: 'https://exemple.test/' + id + '/' + (i + 1), date: heure(10 + i * 7), titre: titre + (i ? ' (' + nom + ')' : ''), langue: 'fr' })) });
const L = (nom, lat, lon, type = 'ville', origine = 'texte', estime = true) => ({ nom, lat, lon, type, origine, estime, pays: 'FR' });
const FILS = {
  france: [
    S('manif-17-octobre', 'Mobilisation du 17 octobre : des cortèges dans toute la France', 'societe', 9, { nom: 'France', lat: 46.6, lon: 2.5, type: 'pays', origine: 'texte', estime: true, pays: 'FR' }, ['Le Monde', 'franceinfo', 'BFM TV', 'Le Figaro', 'Libération', 'France 24', 'RFI', 'La Dépêche', 'Sud Ouest']),
    S('bordeaux-tram', 'Bordeaux : le tramway paralysé par une panne géante', 'societe', 3, L('Bordeaux', 44.84, -0.58), ['Sud Ouest', 'France 3 Nouvelle-Aquitaine', 'franceinfo'], 'nouvelle-aquitaine'),
    S('toulouse-airbus', 'Toulouse : Airbus annonce de nouvelles embauches', 'economie', 2, L('Toulouse', 43.6, 1.44), ['La Dépêche', 'France 3 Occitanie'], 'occitanie'),
    S('lyon-incendie', 'Lyon : un incendie ravage un entrepôt', 'justice', 2, L('Lyon', 45.76, 4.84), ['Le Progrès', 'Le Dauphiné libéré'], 'auvergne-rhone-alpes'),
    S('brest-regate', 'Brest : départ de la grande régate', 'sport', 1, L('Brest', 48.39, -4.49), ['Ouest-France'], 'bretagne'),
    S('marseille-om', 'Football : l’OM s’impose à domicile', 'sport', 4, L('Marseille', 43.3, 5.37), ['franceinfo', 'BFM TV', 'Nice-Matin', 'France 3 Provence-Alpes-Côte d’Azur'], 'provence-alpes-cote-d-azur'),
    S('lille-greve', 'Lille : grève dans les transports en commun', 'societe', 2, L('Lille', 50.63, 3.06), ['La Voix du Nord', 'France 3 Hauts-de-France'], 'hauts-de-france'),
    S('sans-lieu', 'Une réforme administrative présentée en conseil des ministres', 'politique', 3, null, ['Le Monde', 'Le Figaro', 'franceinfo'])
  ],
  monde: [
    S('ukraine-sanctions', 'Washington lève de nouvelles sanctions contre la Russie', 'international', 12, L('Washington', 38.9, -77.04, 'ville'), ['BBC News', 'The Guardian', 'Le Monde', 'DW', 'Al Jazeera', 'France 24', 'Euronews', 'NPR', 'Sky News', 'franceinfo', 'Le Figaro', 'ONU Info']),
    S('pape-hopital', 'Le pape quitte l’hôpital', 'sante', 7, L('Vatican', 41.9, 12.45), ['BBC News', 'Le Monde', 'Euronews', 'SCMP', 'franceinfo', 'The Guardian', 'France 24']),
    S('japon-seisme', 'Séisme de magnitude 6 près de Tokyo', 'environnement', 4, L('Tokyo', 35.68, 139.69), ['The Japan Times', 'BBC News', 'Al Jazeera', 'France 24']),
    S('kenya-ebola', 'Le Kenya confirme un troisième cas d’Ebola', 'sante', 3, L('Kenya', 0.2, 37.9, 'pays'), ['Africanews', 'ONU Info', 'BBC News']),
    S('bresil-election', 'Brésil : dernière ligne droite avant le second tour', 'politique', 2, L('Brésil', -10, -52, 'pays'), ['MercoPress', 'The Guardian'])
  ]
};
/* Images des flux (phase T3) : adresses https interceptees par les tests (img.faux.test) ; une adresse « cassee » renvoie 404 pour tester le repli. */
const IMAGES_FLUX = { 'bordeaux-tram': 'https://img.faux.test/bordeaux.png', 'toulouse-airbus': 'https://img.faux.test/casse/toulouse.png', 'ukraine-sanctions': 'https://img.faux.test/washington.png' };
for (const liste of Object.values(FILS)) for (const s of liste) { const u = IMAGES_FLUX[s.id]; if (u) { s.image = u; if (s.sources[0]) s.sources[0].image = u; } }
export function demarrerFauxWorker(port = 8795) {
  const journal = [], scenario = { actus: 'ok', meteo: 'ok', fil: 'ok' }, etat = { chat: null, chats: [] };
  const srv = http.createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Content-Type': 'application/json' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const u = new URL(req.url, 'http://x'), p = u.pathname; journal.push({ chemin: p, q: Object.fromEntries(u.searchParams), jeton: req.headers['x-rayle-token'] || null });
    const rep = (o, code = 200) => { res.writeHead(code, cors); res.end(JSON.stringify(o)); };
    if (p === '/ping') return rep({ ok: true, version: 'mock', adresse: 'tu', voix: 'Test', feminin: true, vitesse: -8, ia: ['Mock'], d1: true, mode: 'normal' });
    if (p === '/securite/etat') return rep({ appareil: null, appaire: false, configure: false, deverrouille: false, expire_dans: 0, bloque_dans: 0, defi_dans: 0 });
    if (['/evenements', '/reglages', '/memoire', '/souvenirs'].includes(p)) return rep({ alertes: [], mode: 'normal', notes: [], items: [] });
    if (p === '/actualites') {
      if (scenario.actus === 'ancien') return rep({ error: 'route inconnue' }, 404);
      if (u.searchParams.get('liste')) return rep({ pays: PAYS.map(x => ({ ...x, continent: CONTINENT_DE[x.code] || null, langues: LANGUE_DE[x.code] || ['en'] })), sansSource: [{ code: 'VU', nom: 'Vanuatu', continent: 'oceanie' }] });
      const code = u.searchParams.get('pays'), pays = PAYS.find(x => x.code === code);
      if (scenario.actus === 'panne') return rep({ error: 'toutes les sources d\'actualités sont indisponibles', erreurs: ['Journal A : HTTP 503', 'GDELT : GDELT limite ses requêtes'] }, 502);
      if (scenario.actus === 'vide') return rep({ pays: { code, nom: pays ? pays.nom : code }, titres: [], sources: [{ nom: 'Journal A', ok: false, erreur: 'HTTP 503' }] });
      const nom = pays ? pays.nom : (u.searchParams.get('nom') || code);
      return rep({ pays: { code, nom, lat: pays && pays.lat, lon: pays && pays.lon, dist: pays && pays.dist }, titres: titres(nom, 10), sources: [{ nom: 'Journal A', ok: true, titres: 5 }, { nom: 'Journal B', ok: true, titres: 5 }, { nom: 'Journal C', ok: false, erreur: 'HTTP 503' }], cache: 'non' });
    }
    if (p === '/actualites/planete') {   // digest de la planète : le dernier titre de chaque pays (3 par pays), dans sa langue d'origine
      if (scenario.planete === 'ancien') return rep({ error: 'route inconnue' }, 404);
      return rep({ genere: new Date().toISOString(), nbPays: PAYS.length, pays: Object.fromEntries(PAYS.filter(x => x.code !== 'MONDE').map(x => [x.code, { s: 'Média ' + x.code, l: (LANGUE_DE[x.code] || ['en'])[0], t: [1, 2, 3].map(i => ({ t: (x.code === 'JP' ? '台風' + i + '号が接近' : 'Titre ' + i + ' du jour pour ' + x.nom), u: 'https://exemple.test/' + x.code + '/' + i, d: new Date(Date.now() - i * 600000).toISOString() })) }])), regions: {}, indisponibles: {}, pasEncoreLus: [] });
    }
    if (p === '/actualites/fil') {
      if (scenario.fil === 'ancien') return rep({ error: 'route inconnue' }, 404);
      if (scenario.fil === 'panne') return rep({ error: 'toutes les sources d’actualités sont indisponibles', erreurs: ['Le Monde : HTTP 503'] }, 502);
      const portee = u.searchParams.get('portee'), liste = FILS[portee] || (portee === 'pays' ? FILS.monde.slice(2, 3) : null);
      if (!liste) return rep({ error: 'portée inconnue' }, 400);
      return rep({ portee, pays: u.searchParams.get('pays') || null, sujets: liste, sources: { ok: ['Le Monde', 'franceinfo', 'BBC News'], indisponibles: [{ nom: 'La Dépêche', erreur: 'HTTP 503' }] }, genere: heure(3), ttl: 600, cache: 'non' });
    }
    if (p === '/chat' && req.method === 'POST') {
      let corps = ''; req.on('data', d => { corps += d; });
      return req.on('end', () => { let b = {}; try { b = JSON.parse(corps); } catch (e) {} etat.chats.push(b); const r = etat.chat ? etat.chat(b.text || '') : { reply: 'D’accord.', actions: [], outils: [] }; rep({ engine: 'Mock', model: 'script', ...r }); });
    }
    if (p === '/meteo') {
      if (scenario.meteo === 'ancien') return rep({ error: 'route inconnue' }, 404);
      if (scenario.meteo === 'panne') return rep({ error: 'Open-Meteo HTTP 500' }, 502);
      return rep(meteo(Number(u.searchParams.get('lat')), Number(u.searchParams.get('lon')), scenario.meteo === 'pluie'));
    }
    rep({ error: 'route inconnue' }, 404);
  });
  return new Promise(ok => srv.listen(port, '127.0.0.1', () => ok({ journal, scenario, etat, FILS, url: `http://127.0.0.1:${port}`, fermer: () => new Promise(r => srv.close(r)) })));
}
