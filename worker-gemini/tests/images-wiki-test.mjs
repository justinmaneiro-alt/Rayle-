/* Tests des images de réponse (v8, phase 4) : choix de la page, licences libres seulement, dates, relance sur limite de débit, aucune image libre = null. Lancer : node worker-gemini/tests/images-wiki-test.mjs */
import { createRequire } from 'node:module';
const W = createRequire(import.meta.url)('../../core/commun/images-wiki.js');
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const pages = arr => arr.map(([title, index, thumb, dis]) => ({ title, index, thumbnail: thumb ? {} : undefined, pageprops: dis ? { disambiguation: '' } : {} }));
const t = (sujet, arr) => W.choisirPage(pages(arr), sujet).title;
v('« La Joconde » plutôt que la base de données « Base Joconde »', t('Joconde', [['Joconde', 5, 0, 1], ['Base Joconde', 3, 0, 0], ['La Joconde', 1, 1, 0], ['Vol de La Joconde', 2, 1, 0]]) === 'La Joconde');
v('Mars : la planète, jamais la page d’homonymie', t('Mars', [['Mars (planète)', 1, 1, 0], ['Mars', 2, 0, 1], ['Mars (mois)', 3, 1, 0]]) === 'Mars (planète)');
v('tour Eiffel : l’article, pas Gustave Eiffel', t('tour Eiffel', [['Gustave Eiffel', 2, 1, 0], ['Tour Eiffel', 1, 1, 0], ['Histoire de la tour Eiffel', 3, 0, 0]]) === 'Tour Eiffel');
v('lion : l’animal, pas la page (homonymie)', t('lion', [['Lion', 1, 1, 0], ['Lion (homonymie)', 2, 0, 0]]) === 'Lion');
v('rien de valable : null', W.choisirPage(pages([['X', 1, 0, 1]]), 'x') === null);
/* licences */
const ii = (lic, w = 800, h = 600) => ({ url: 'https://upload.wikimedia.org/a.jpg', thumburl: 'https://upload.wikimedia.org/t.jpg', width: w, height: h, thumbwidth: 800, thumbheight: 600, descriptionurl: 'https://commons.wikimedia.org/wiki/File:A.jpg', extmetadata: { LicenseShortName: { value: lic }, Artist: { value: '<a href="x">Jean <b>Dupont</b></a>' }, ImageDescription: { value: '<p>Une <i>belle</i> vue</p>' } } });
v('licence libre acceptée, auteur et légende nettoyés du HTML', (() => { const r = W.infoImage(ii('CC BY-SA 4.0'), 'File:A.jpg'); return r && r.licence === 'CC BY-SA 4.0' && r.auteur === 'Jean Dupont' && r.legende === 'Une belle vue'; })());
v('domaine public accepté', !!W.infoImage(ii('Public domain'), 'File:A.jpg'));
v('licence non libre refusée', W.infoImage(ii('Copyrighted. All rights reserved'), 'File:A.jpg') === null && W.infoImage(ii('Fair use'), 'File:A.jpg') === null);
v('licence absente refusée', W.infoImage({ ...ii('x'), extmetadata: {} }, 'File:A.jpg') === null);
v('image trop petite refusée', W.infoImage(ii('CC0', 200, 150), 'File:A.jpg') === null);
/* candidates */
const c = W.candidates([{ title: 'File:Eiffel.jpg' }, { title: 'File:Flag of France.svg' }, { title: 'File:Commons-logo.svg' }, { title: 'File:Vue.PNG' }, { title: 'File:Icon edit.png' }, { title: 'File:Anim.gif' }, { title: 'File:Voix.ogg' }, { title: 'File:Carte de localisation.png' }]);
v('icônes, logos, drapeaux, SVG, GIF, sons écartés', c.length === 2 && c[0] === 'File:Eiffel.jpg' && c[1] === 'File:Vue.PNG', c.join());
/* dates Wikidata */
v('date au jour : « 15 août 1769 »', W.dateFr({ time: '+1769-08-15T00:00:00Z', precision: 11 }) === '15 août 1769');
v('premier du mois : « 1er mai 2000 »', W.dateFr({ time: '+2000-05-01T00:00:00Z', precision: 11 }) === '1er mai 2000');
v('avant J.-C. : « mars 44 av. J.-C. »', W.dateFr({ time: '-0044-03-00T00:00:00Z', precision: 10 }) === 'mars 44 av. J.-C.');
v('année seule', W.dateFr({ time: '+1503-00-00T00:00:00Z', precision: 9 }) === '1503');
const ent = { claims: { P569: [{ mainsnak: { datavalue: { value: { time: '+1769-08-15T00:00:00Z', precision: 11 } } } }], P570: [{ mainsnak: { datavalue: { value: { time: '+1821-05-05T00:00:00Z', precision: 11 } } } }] } };
v('personne : naissance et mort', JSON.stringify(W.datesDe(ent)) === JSON.stringify([{ label: 'Naissance', val: '15 août 1769' }, { label: 'Mort', val: '5 mai 1821' }]));
/* chercher() avec une API simulée */
const rep = (corps, statut = 200) => ({ ok: statut < 300, status: statut, json: async () => corps });
const API = (o = {}) => async url => {
  const u = new URL(url), a = u.searchParams.get('action');
  if (o.limite && !o.vu) { o.vu = true; return rep({}, 429); }
  if (a === 'query' && u.searchParams.get('generator') === 'search') return rep({ query: { pages: [{ title: 'La Joconde', index: 1, thumbnail: { source: 'x' }, pageimage: 'Mona.jpg', extract: 'La Joconde est un tableau.', description: 'peinture', pageprops: { wikibase_item: 'Q12418' }, fullurl: 'https://fr.wikipedia.org/wiki/La_Joconde' }] } });
  if (a === 'parse') return rep({ parse: { images: ['Mona.jpg', 'Detail_1.jpg', 'Detail_2.jpg', 'Flag_of_Italy.svg', 'Detail_3.jpg'] } });
  if (a === 'wbgetentities') return rep({ entities: { Q12418: { claims: { P571: [{ mainsnak: { datavalue: { value: { time: '+1503-00-00T00:00:00Z', precision: 9 } } } }] } } } });
  if (a === 'query' && u.searchParams.get('prop') === 'imageinfo') return rep({ query: { pages: u.searchParams.get('titles').split('|').map(tt => ({ title: tt.replace('File:', 'Fichier:'), imageinfo: [{ ...ii(o.nonLibre ? 'All rights reserved' : 'Public domain'), url: 'https://upload.wikimedia.org/' + tt + '.jpg', thumburl: 'https://upload.wikimedia.org/t_' + tt + '.jpg' }] })) } });
  return rep({}, 404);
};
let R = await W.chercher('Joconde', { fetchFn: API() });
v('chercher : principale + secondaires (4 au plus), dates, licence, source', R && R.principale && R.secondaires.length === 3 && R.dates[0].label === 'Création' && R.principale.licence === 'Public domain' && /Wikipédia/.test(R.source), JSON.stringify(R && { n: R.secondaires.length, d: R.dates }));
v('titre, description et résumé', R.titre === 'La Joconde' && R.description === 'peinture' && /tableau/.test(R.resume));
const t0 = Date.now(); R = await W.chercher('Joconde', { fetchFn: API({ limite: true }) });
v('limite de débit (429) : une relance, puis la réponse', R && R.principale && Date.now() - t0 >= 1500, String(Date.now() - t0));
R = await W.chercher('Joconde', { fetchFn: API({ nonLibre: true }) });
v('aucune image libre : null (jamais un panneau vide)', R === null);
v('sujet vide : null', (await W.chercher('', { fetchFn: API() })) === null);
console.log(`${ok} ok, ${ko} KO`); process.exit(ko ? 1 : 0);
