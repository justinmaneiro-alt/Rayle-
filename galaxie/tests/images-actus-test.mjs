/* T3 : règles pures des images d'actualités (images-actus.js) : image du flux, licences Commons, candidats, vue cartographique, HTML sûr. */
import { createRequire } from 'node:module';
const IA = createRequire(import.meta.url)('../../core/commun/images-actus.js');
let ok = 0, ko = 0;
const v = (nom, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + nom + (d ? ' — ' + d : '')); };

// (a) image du flux : https seulement, jamais une adresse douteuse
v('flux : image du sujet', IA.imageFlux({ image: 'https://exemple.test/a.jpg', source: 'Le Monde', url: 'https://exemple.test/art' }).src === 'https://exemple.test/a.jpg');
v('flux : http refusé', IA.imageFlux({ image: 'http://exemple.test/a.jpg', sources: [] }) === null);
v('flux : javascript: et data: refusés', IA.imageFlux({ image: 'javascript:alert(1)' }) === null && IA.imageFlux({ image: 'data:image/png;base64,AAAA' }) === null);
v('flux : balise ou guillemet dans l’adresse refusés', IA.imageFlux({ image: 'https://x.test/a"onerror="x' }) === null && IA.imageFlux({ image: 'https://x.test/<b>.jpg' }) === null);
const f2 = IA.imageFlux({ image: null, source: 'A', url: 'https://a.test/1', sources: [{ nom: 'B', url: 'https://b.test/2', image: null }, { nom: 'C', url: 'https://c.test/3', image: 'https://c.test/i.png' }] });
v('flux : première image des médias qui en parlent, avec son nom et son lien', f2 && f2.source === 'C' && f2.lien === 'https://c.test/3');

// (b) licences libres seulement
for (const l of ['CC BY 4.0', 'CC BY-SA 4.0', 'CC BY-SA 3.0 de', 'CC0', 'CC-BY-SA-4.0', 'Public domain', 'PD-old-100']) v('licence acceptée : ' + l, IA.licenceOk(l));
for (const l of ['All rights reserved', 'CC BY-NC 4.0', 'CC BY-ND 2.0', 'Fair use', '', null, 'Copyrighted free use']) v('licence refusée : ' + String(l), !IA.licenceOk(l));
const page = (index, titre, lic, extra = {}) => ({ index, title: 'File:' + titre, imageinfo: [{ thumburl: 'https://upload.wikimedia.org/thumb/' + index + '.jpg', url: 'https://upload.wikimedia.org/' + index + '.jpg', width: 1600, height: 1000, mime: 'image/jpeg', extmetadata: { LicenseShortName: { value: lic }, Artist: { value: '<a href="//x">Jeanne <b>Dupont</b></a>' }, ...extra.meta }, ...extra.info }] });
const rep = { query: { pages: {
  1: page(1, 'Eglise_de_Issac.jpg', 'CC BY-SA 4.0'),
  2: page(2, 'Photo_protegee.jpg', 'All rights reserved'),
  3: page(3, 'Logo_de_la_ville.png', 'CC0'),
  4: page(4, 'Plan_du_centre.jpg', 'CC BY 4.0'),
  5: page(5, 'Dessin.svg', 'CC BY 4.0', { info: { mime: 'image/svg+xml' } }),
  6: page(6, 'Petite_vignette.jpg', 'CC BY 4.0', { info: { width: 200, height: 100 } }),
  7: page(7, 'Non_libre.jpg', 'CC BY 4.0', { meta: { NonFree: { value: 'true' } } }),
  8: page(8, 'Marche_de_Noel.jpg', 'Public domain', { meta: { Artist: { value: '' }, Credit: { value: 'Own work' } } })
} } };
const c = IA.candidatsCommons(rep);
v('Commons : seules les photos libres, bitmap, assez grandes, hors logo / plan / non libre', c.length === 2 && c[0].titre === 'Eglise de Issac' && c[1].titre === 'Marche de Noel', c.map(x => x.titre).join(' | '));
v('Commons : auteur nettoyé du HTML, licence et lien de la page du fichier', c[0].auteur === 'Jeanne Dupont' && c[0].licence === 'CC BY-SA 4.0' && c[0].lien === 'https://commons.wikimedia.org/wiki/File:Eglise_de_Issac.jpg', JSON.stringify(c[0]));
v('Commons : auteur absent → crédit, sinon « auteur non précisé »', c[1].auteur === 'Own work');
v('Commons : réponse vide ou invalide → aucun candidat', IA.candidatsCommons(null).length === 0 && IA.candidatsCommons({}).length === 0 && IA.candidatsCommons({ query: { pages: { 1: { title: 'File:x.jpg' } } } }).length === 0);
const ug = IA.urlCommonsGeo(45.65, 3.08, 99999);
v('Commons : recherche géographique, rayon borné à 10 km, CORS ouvert, espace Fichier', /ggsradius=10000/.test(ug) && /origin=\*/.test(ug) && /ggsnamespace=6/.test(ug) && /ggscoord=45\.6500%7C3\.0800/.test(ug), ug.slice(0, 120));
v('Commons : recherche par nom encodée', /gsrsearch=Saint%20Saturnin%20filetype%3Abitmap/.test(IA.urlCommonsTexte('Saint Saturnin')));

// (c) vue cartographique
const vc = IA.vueCarte(45.65, 3.08, 'ville');
v('carte : 4 tuiles, niveau 10 pour une ville', vc.z === 10 && vc.tuiles.length === 4);
v('carte : le lieu tombe dans la partie centrale du bloc 2×2', vc.px >= 0.25 && vc.px <= 0.75 && vc.py >= 0.25 && vc.py <= 0.75, vc.px.toFixed(2) + ',' + vc.py.toFixed(2));
v('carte : pays → niveau 5, NASA GIBS', IA.vueCarte(46.6, 2.5, 'pays').z === 5 && /GIBS/.test(IA.vueCarte(46.6, 2.5, 'pays').source));
v('carte : ville → Sentinel-2 crédité', /EOX/.test(vc.source));
v('carte : lieu près de l’antiméridien et des pôles : tuiles valides', IA.vueCarte(179.9, 85, 'ville').tuiles.every(t => /\/(\d+)\/(\d+)\/(\d+)\.jpg$/.test(t.url)));
v('carte : aucun lieu → aucun descripteur', IA.descripteurCarte(null) === null && IA.descripteurCarte({ nom: 'x' }) === null);

// HTML : échappé, jamais d'URL dangereuse
const h = IA.htmlFigure({ type: 'commons', src: 'https://upload.wikimedia.org/a.jpg', credit: 'Commons · <script>x</script> · CC BY', lien: 'javascript:alert(1)', alt: 'a"b' });
v('HTML : crédit échappé, lien non https ignoré', !/<script/.test(h) && !/javascript:/.test(h) && /&lt;script&gt;/.test(h) && !/<a /.test(h), h.slice(0, 160));
const h2 = IA.htmlFigure({ type: 'flux', src: 'https://m.test/i.jpg', credit: '© Le Monde', lien: 'https://m.test/article', alt: '' });
v('HTML : image du flux = lien vers l’article + nom du média', /<a href="https:\/\/m\.test\/article" target="_blank" rel="noopener noreferrer">/.test(h2) && /© Le Monde/.test(h2) && /referrerpolicy="no-referrer"/.test(h2));
console.log(`\n${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
