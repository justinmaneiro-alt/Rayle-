// Tests des règles pures des actualités par pays et par continent (index, commandes vocales, sélecteur, favoris, langues, honnêteté).
// Lancer :  node galaxie/tests/pays-contenu-test.mjs     (utilise le registre du Worker local s'il est présent, sinon une petite liste d'essai)
import { createRequire } from 'node:module';
import fs from 'node:fs';
const C = createRequire(import.meta.url)('../../core/commun/pays-contenu.js');
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

let liste, sansSource;
const chemin = new URL('../../worker/src/terre/pays-flux.js', import.meta.url);
if (fs.existsSync(chemin)) {
  const R = await import(chemin.href);
  liste = Object.entries(R.PAYS).filter(([c]) => c !== 'MONDE').map(([code, p]) => ({ code, nom: p.nom, continent: p.continent, lat: p.lat, lon: p.lon, dist: p.dist, flux: p.flux.length, langues: [...new Set(p.flux.map(x => x.l))] }));
  sansSource = Object.entries(R.SANS_SOURCE).map(([code, p]) => ({ code, nom: p.nom, continent: p.continent }));
} else {
  liste = [['JP', 'Japon', 'asie'], ['BR', 'Brésil', 'amerique-sud'], ['US', 'États-Unis', 'amerique-nord'], ['KR', 'Corée du Sud', 'asie'], ['KP', 'Corée du Nord', 'asie'], ['ZA', 'Afrique du Sud', 'afrique'], ['CD', 'RD Congo', 'afrique'], ['CG', 'Congo-Brazzaville', 'afrique'], ['GB', 'Royaume-Uni', 'europe'], ['FR', 'France', 'europe'], ['AE', 'Émirats arabes unis', 'moyen-orient'], ['NZ', 'Nouvelle-Zélande', 'oceanie'], ['GN', 'Guinée', 'afrique'], ['GQ', 'Guinée équatoriale', 'afrique'], ['IN', 'Inde', 'asie'], ['AU', 'Australie', 'oceanie']].map(([code, nom, continent]) => ({ code, nom, continent, flux: 2, langues: ['en'] }));
  sansSource = [{ code: 'VU', nom: 'Vanuatu', continent: 'oceanie' }, { code: 'ER', nom: 'Érythrée', continent: 'afrique' }];
}
const idx = C.construireIndex(liste, sansSource);
v('index : un élément par pays, les pays sans source sont marqués', idx.length === liste.length + sansSource.filter(s => !liste.some(l => l.code === s.code)).length && idx.some(p => p.sansSource) && idx.filter(p => !p.sansSource).length === liste.length);
v('index : MONDE n’est pas un pays', !idx.some(p => p.code === 'MONDE'));

// ── commandes vocales : pays ──
const cmd = t => C.commande(t, idx);
const cas = [['les actualités du Japon', 'JP'], ['Les actualités du Brésil', 'BR'], ['les actus du Japon', 'JP'], ['donne-moi les infos du Brésil', 'BR'], ['montre-moi les actualités de l’Afrique du Sud', 'ZA'], ['les actualités des États-Unis', 'US'], ['les actualités aux États-Unis', 'US'],
  ['les actualités en Corée du Sud', 'KR'], ['les actualités de la Corée du Nord', 'KP'], ['les actualités en Inde', 'IN'], ['les actualités en Australie', 'AU'], ['les actualités du Royaume-Uni', 'GB'], ['actualités en Angleterre', 'GB'], ['les actualités de la France', 'FR'],
  ['les actualités en RD Congo', 'CD'], ['les actualités du Congo-Brazzaville', 'CG'], ['les actualités de la Guinée', 'GN'], ['les actualités des Émirats', 'AE'], ['quoi de neuf au Japon', 'JP'], ['que se passe-t-il au Brésil', 'BR'],
  ['les actualités de Nouvelle-Zélande aujourd’hui', 'NZ'], ['ouvre les actualités du Japon s’il te plaît', 'JP'], ['Raylé, les actualités du Japon', 'JP'], ['les infos du Japon maintenant', 'JP']];
for (const [t, code] of cas) { const r = cmd(t); v('voix : « ' + t + ' » → ' + code, r && r.action === 'pays' && r.code === code, JSON.stringify(r && { a: r.action, c: r.code })); }
v('voix : « Guinée équatoriale » est bien reconnue (avec ou sans média fiable) et ne se confond pas avec la Guinée', (r => r && r.code === 'GQ')(cmd('les actualités de la Guinée équatoriale')));
// ── continents ──
for (const [t, id] of [['les actualités en Afrique', 'afrique'], ['les actualités d’Afrique', 'afrique'], ['les actualités en Asie', 'asie'], ['les actualités en Europe', 'europe'], ['les actualités au Moyen-Orient', 'moyen-orient'], ['les actualités en Océanie', 'oceanie'], ['les actualités en Amérique du Sud', 'amerique-sud'], ['les actualités en Amérique du Nord', 'amerique-nord'], ['les actualités en Amérique latine', 'amerique-sud'], ['les actualités aux Caraïbes', 'amerique-centrale'], ['les actualités en Amérique centrale', 'amerique-centrale'], ['actus en Afrique aujourd’hui', 'afrique']]) {
  const r = cmd(t); v('voix : « ' + t + ' » → continent ' + id, r && r.action === 'region' && r.id === id, JSON.stringify(r));
}
v('voix : « en Amérique » (ambigu) → demande de préciser, pas de devinette', (cmd('les actualités en Amérique') || {}).action === 'amerique');
// ── honnêteté : pays sans source ──
const ss = sansSource[0];
const rS = cmd('les actualités ' + (/^[AEIOUÉ]/.test(ss.nom) ? 'd’' : 'du ') + ss.nom);
v('voix : pays sans média fiable (« ' + ss.nom + ' ») → réponse honnête, rien d’inventé', rS && rS.action === 'sans_source' && rS.nom === ss.nom, JSON.stringify(rS));
v('phrase : pays sans source = « je n’ai pas de source fiable », jamais de faux titre', /pas de source d’actualité fiable/.test(C.phraseSansSource('Vanuatu')) && /ne rien inventer/.test(C.phraseSansSource('Vanuatu')));
// ── ce qui n'est PAS pour les pays (reste à l'accueil, à l'agent ou aux autres modules) ──
for (const t of ['les actualités', 'les actualités du sport', 'les actualités sur la guerre', 'les actualités du football', 'les actualités de l’économie', 'ferme les actualités', 'actualise les actualités', 'quoi de neuf', 'que se passe-t-il', 'bonjour', 'quelle heure est-il', 'va sur Mars', 'les actualités du Japon sur le sport', 'ouvre la Terre', 'les actualités du Wakanda', 'parle-moi du Japon', 'montre-moi le Japon', 'photo du Japon', 'météo au Japon'])
  v('pas pour les pays : « ' + t + ' »', cmd(t) === null, JSON.stringify(cmd(t)));
v('un texte très long ou vide est ignoré sans erreur', cmd('les actualités du Japon ' + 'blabla '.repeat(30)) === null && cmd('') === null && cmd(null) === null && C.commande('x', []) === null);
// ── favoris ──
let r = cmd('ajoute le Japon à mes favoris'); v('favoris : « ajoute le Japon à mes favoris »', r && r.action === 'ajouter_favori' && r.code === 'JP', JSON.stringify(r));
r = cmd('mets le Brésil dans mes pays favoris'); v('favoris : « mets le Brésil dans mes pays favoris »', r && r.action === 'ajouter_favori' && r.code === 'BR', JSON.stringify(r));
r = cmd('retire le Japon de mes favoris'); v('favoris : « retire le Japon de mes favoris »', r && r.action === 'retirer_favori' && r.code === 'JP', JSON.stringify(r));
r = cmd('ajoute Narnia à mes favoris'); v('favoris : pays inconnu → réponse honnête', r && r.action === 'favori_inconnu', JSON.stringify(r));
for (const t of ['mes pays favoris', 'ouvre mes favoris', 'montre-moi mes pays favoris', 'les actualités de mes favoris', 'affiche mes favoris']) v('favoris : « ' + t + ' » → ouvrir', (cmd(t) || {}).action === 'favoris', JSON.stringify(cmd(t)));
v('sélecteur : « ouvre la liste des pays », « choisir un pays »', (cmd('ouvre la liste des pays') || {}).action === 'selecteur' && (cmd('je veux choisir un pays') || {}).action === 'selecteur' && (cmd('ouvre le sélecteur de pays') || {}).action === 'selecteur');
v('traduction : seulement sur demande (« traduis ces titres »)', (cmd('traduis ces titres') || {}).action === 'traduire' && (cmd('traduis les titres en français') || {}).action === 'traduire' && cmd('les actualités du Japon').action !== 'traduire');
const stock = {}; const lire = k => (k in stock ? stock[k] : null);
v('favoris : lecture tolérante (vide, JSON cassé, codes invalides, doublons)', C.lireFavoris(lire).length === 0 && (stock[C.CLE_FAVORIS] = '{pas du json') && C.lireFavoris(lire).length === 0 && (stock[C.CLE_FAVORIS] = JSON.stringify(['JP', 'jp', 'BR', 'BR', 'XYZ', 42, null])) && C.lireFavoris(lire).join() === 'JP,BR');
let f = C.basculerFavori([], 'JP'); v('favoris : ajouter', f.change && f.favoris.join() === 'JP');
f = C.basculerFavori(f.favoris, 'JP'); v('favoris : basculer retire', f.change && f.favoris.length === 0);
f = C.basculerFavori(['JP'], 'JP', true); v('favoris : ajouter deux fois ne double pas', !f.change && f.favoris.length === 1);
f = C.basculerFavori(['JP'], 'BR', false); v('favoris : retirer un absent ne change rien', !f.change);
const pleins = Array.from({ length: 30 }, (_, i) => String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + Math.floor(i / 26)));
f = C.basculerFavori(pleins, 'ZZ'); v('favoris : limite de 30 pays', f.plein === true && f.favoris.length === 30);
// ── sélecteur : recherche et groupes ──
v('recherche : accents et majuscules ignorés (« bresil », « BRÉSIL », « bré »)', ['bresil', 'BRÉSIL', 'bré'].every(q => C.filtrer(idx, q).some(p => p.code === 'BR')));
v('recherche : par alias (« usa », « angleterre », « birmanie »)', C.filtrer(idx, 'usa').some(p => p.code === 'US') && C.filtrer(idx, 'angleterre').some(p => p.code === 'GB'));
v('recherche : par continent', C.filtrer(idx, '', 'afrique').every(p => p.continent === 'afrique') && C.filtrer(idx, '', 'afrique').length >= 2);
v('recherche : aucun résultat → liste vide, sans erreur', C.filtrer(idx, 'zzzzqq').length === 0);
const g = C.groupes(idx, '');
v('groupes : par continent, dans l’ordre, chaque pays dans un seul groupe, triés par nom', g.length >= 3 && g.reduce((s, x) => s + x.pays.length, 0) === idx.length && g.every(x => x.pays.every((p, i, a) => !i || C.sans(a[i - 1].nom).localeCompare(C.sans(p.nom)) <= 0)));
v('groupes : la recherche filtre les groupes', C.groupes(idx, 'japon').length === 1 && C.groupes(idx, 'japon')[0].pays.some(p => p.code === 'JP'));
// ── langues ──
v('langues : étiquette courte et nom en français', C.etiquetteLangue('ja') === 'JA' && C.nomLangue('ja') === 'japonais' && C.nomLangue('ar') === 'arabe' && C.nomLangue('xx') === 'XX');
v('langues : liste lisible', C.listeLangues(['ja', 'en']) === 'japonais et anglais' && C.listeLangues(['fr']) === 'français' && C.listeLangues(['ja', 'en', 'ko']) === 'japonais, anglais et coréen' && C.listeLangues([]) === '');
v('phrases : titres dans leur langue d’origine, traduction seulement sur demande', /langue d’origine/.test(C.phrasePays('Japon', ['NHK', 'Asahi'], ['ja', 'en'])) && /traduis ces titres/.test(C.phrasePays('Japon', [], [])) && /pays : Japon, par NHK, Asahi/.test(C.phrasePays('Japon', ['NHK', 'Asahi'], ['ja', 'en'])) && /région : Afrique/.test(C.phraseRegion('Afrique', 20, 24)));
v('phrases : favoris vides = explication, favoris = noms', /pas encore de pays favori/.test(C.phraseFavoris([])) && /Japon/.test(C.phraseFavoris(['Japon', 'Brésil'])));

console.log(ko ? ko + ' ÉCHEC(S), ' + ok + ' réussis' : 'pays-contenu : ' + ok + ' vérifications réussies');
process.exit(ko ? 1 : 0);
