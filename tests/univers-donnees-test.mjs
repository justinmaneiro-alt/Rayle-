// Données et textes de l'Univers : océans et mers, moteur de présentation (variété), actualités (RSS, localisation) :   node tests/univers-donnees-test.mjs
import assert from 'node:assert/strict';
import { OCEANS_MERS } from '../js/univers/donnees/mers.js';
import { art, habitants, surface, comparaisonFrance, composerPays, composerMer, designation, minuscule, choisir, melanger, oublier } from '../js/univers/donnees/presentation.js';
import { phrases, classer } from '../js/univers/donnees/pays.js';
import { parserRSS, indexerLieux, localiser, norm } from '../js/univers/espace/actualites.js';

let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.message); process.exitCode = 1; } };
const graine = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let x = Math.imul(s ^ s >>> 15, 1 | s); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };

t('océans et mers : 5 océans, au moins 30 zones, champs complets', () => {
  assert.equal(OCEANS_MERS.filter(o => o.type === 'ocean').length, 5); assert.ok(OCEANS_MERS.length >= 30);
  const ids = new Set();
  for (const o of OCEANS_MERS) {
    assert.ok(!ids.has(o.id), 'id en double ' + o.id); ids.add(o.id);
    assert.ok(Math.abs(o.lat) <= 90 && Math.abs(o.lon) <= 180 && o.rayon > 0 && o.cam > 1, o.id);
    for (const k of ['geo', 'chiffres', 'histoire', 'anecdotes']) { assert.ok(Array.isArray(o[k]) && o[k].length >= 2, o.id + ' ' + k); for (const x of o[k]) assert.ok(x.length > 30 && /[.!?]$/.test(x), o.id + ' ' + k + ' : phrase incomplète'); }
  }
});
t('designation : « la mer », « l’océan », « le golfe »', () => {
  assert.equal(designation('Mer Méditerranée'), 'la mer Méditerranée'); assert.equal(designation('Océan Pacifique'), 'l’océan Pacifique'); assert.equal(designation('Golfe du Mexique'), 'le golfe du Mexique'); assert.equal(designation('La Manche'), 'la Manche'); assert.equal(designation('Mer d’Arabie'), 'la mer d’Arabie');
});
t('articles des pays', () => {
  const a = (n, k) => art(n)[k];
  assert.equal(a('Japon', 'def'), 'le Japon'); assert.equal(a('Japon', 'du'), 'du Japon'); assert.equal(a('Japon', 'a'), 'au Japon');
  assert.equal(a('France', 'def'), 'la France'); assert.equal(a('France', 'du'), 'de la France'); assert.equal(a('France', 'a'), 'en France');
  assert.equal(a('Italie', 'def'), 'l’Italie'); assert.equal(a('Italie', 'du'), 'de l’Italie'); assert.equal(a('Italie', 'a'), 'en Italie');
  assert.equal(a('États-Unis', 'def'), 'les États-Unis'); assert.equal(a('États-Unis', 'du'), 'des États-Unis'); assert.equal(a('États-Unis', 'a'), 'aux États-Unis');
  assert.equal(a('Chypre', 'def'), 'Chypre'); assert.equal(a('Chypre', 'a'), 'à Chypre'); assert.equal(a('Brésil', 'def'), 'le Brésil'); assert.equal(a('Mexique', 'a'), 'au Mexique'); assert.equal(a('Pérou', 'du'), 'du Pérou'); assert.equal(a('Allemagne', 'a'), 'en Allemagne');
  assert.equal(a('Royaume-Uni', 'def'), 'le Royaume-Uni'); assert.equal(a('Irak', 'def'), 'l’Irak');
});
t('nombres dits à voix haute', () => {
  assert.equal(habitants(68605616), '68,6 millions'); assert.equal(habitants(1417000000), '1,4 milliard'); assert.equal(habitants(2100000000), '2,1 milliards'); assert.equal(habitants(89752), '90 000'); assert.equal(habitants(0), null);
  assert.equal(surface(643801), '644 000 kilomètres carrés'); assert.equal(surface(8515767), '8,5 millions de kilomètres carrés'); assert.equal(surface(468), '468 kilomètres carrés');
  assert.match(comparaisonFrance(8515767), /15 fois la France/); assert.match(comparaisonFrance(540000), /taille de la France/); assert.match(comparaisonFrance(100000), /18 pour cent/); assert.match(comparaisonFrance(468), /fois moins/);
});
t('minuscule : jamais sur un nom propre', () => { assert.equal(minuscule('Le Japon est'), 'le Japon est'); assert.equal(minuscule('Tokyo est une ville'), 'Tokyo est une ville'); assert.equal(minuscule('En 1853, Perry'), 'en 1853, Perry'); });
t('phrases : phrases complètes seulement', () => {
  assert.equal(phrases('Première phrase complète ici. Deuxième phrase aussi, plus longue que la première. Troisième.', 70), 'Première phrase complète ici.');
  assert.equal(phrases('un fragment sans fin de phrase;', 200), '');
});
t('classer : ne garde que de vrais paragraphes', () => {
  const longue = 'Le pays connaît une histoire riche en événements marquants et en transformations profondes au fil des siècles passés, entre guerres, réformes et renaissances successives.';
  const r = classer([{ titre: 'intro', paras: [longue] }, { titre: 'Histoire', paras: [longue, 'de puissants syndicats d’entreprise, regroupés au sein de la Fédération des organisations économiques, avec peu de conflits et une culture du dialogue marqué par un mouvement annuel;'] }, { titre: 'Notes', paras: [longue] }]);
  assert.equal(r.histoire.length, 1); assert.equal(r.geo.length, 0);
});

const INFOS = { nom: 'Japon', a2: 'JP', capitale: 'Tokyo', population: 123802000, popAnnee: 2024, superficie: 377974, continent: 'Asie', source: ['Wikipédia', 'Wikidata'], intro: 'Le Japon est un pays insulaire de l’Asie de l’Est, situé entre la mer du Japon et l’océan Pacifique, à l’est de la Chine et de la Corée.',
  sections: { histoire: ['Les premières traces d’occupation de l’archipel remontent à plus de trente mille ans avant notre ère. Plus tard, des royaumes se structurent autour de la cour impériale.', 'En 1853, l’arrivée de la flotte américaine du commodore Perry met fin à plus de deux siècles d’isolement du pays. Le Japon se modernise ensuite très vite.', 'Après la Seconde Guerre mondiale, le pays se reconstruit et devient l’une des premières puissances économiques du monde.'], geo: ['L’archipel est formé de milliers d’îles, dont quatre principales. Le relief est montagneux et le pays est exposé aux séismes et aux volcans.'], culture: ['La cuisine japonaise est inscrite au patrimoine culturel immatériel de l’humanité. Elle repose sur le riz, le poisson et les produits de saison.'], societe: [], eco: ['L’économie japonaise repose sur l’industrie automobile, l’électronique et la robotique. Le pays compte parmi les plus grands exportateurs du monde.'] } };
const aplat = c => c.segments.map(s => s.texte).join(' ');
t('présentation de pays : structure, rien d’indéfini', () => {
  const c = composerPays(INFOS, { rnd: graine(1), actus: [{ titre: 'Un séisme secoue le nord du pays - franceinfo', source: 'franceinfo' }] });
  assert.equal(c.segments[0].angle, 'intro'); assert.equal(c.segments.at(-1).angle, 'fin'); assert.ok(c.segments.some(s => s.angle === 'actus'));
  for (const s of c.segments) { assert.ok(s.texte.length > 10); assert.ok(!/undefined|NaN|null|\[object/.test(s.texte), s.texte); }
  assert.match(aplat(c), /franceinfo/); assert.ok(!/ - franceinfo\)/.test(aplat(c)), 'suffixe de source retiré du titre');
});
t('variété : 30 présentations du même pays, nombreuses versions différentes', () => {
  oublier(); const textes = new Set(), intros = new Set(), angles = new Set(), outros = new Set();
  for (let i = 0; i < 30; i++) { const c = composerPays(INFOS, { rnd: graine(100 + i * 7) }); textes.add(aplat(c)); intros.add(c.segments[0].texte); outros.add(c.segments.at(-1).texte); c.segments.forEach(s => angles.add(s.angle)); }
  assert.ok(textes.size >= 28, 'textes différents : ' + textes.size); assert.ok(intros.size >= 6, 'intros : ' + intros.size); assert.ok(outros.size >= 4, 'conclusions : ' + outros.size);
  for (const a of ['chiffres', 'geo', 'histoire', 'culture', 'eco']) assert.ok(angles.has(a), 'angle jamais choisi : ' + a);
});
t('pas de répétition immédiate avec le vrai hasard (Math.random)', () => {
  oublier(); let identiques = 0, prec = '';
  for (let i = 0; i < 40; i++) { const x = composerPays(INFOS).segments[0].texte; if (x === prec) identiques++; prec = x; }
  assert.equal(identiques, 0, 'même introduction deux fois de suite');
});
t('un fait absent n’est jamais inventé', () => {
  const c = composerPays({ nom: 'Andorre', a2: 'AD', capitale: 'Andorre-la-Vieille', sections: {}, source: ['Wikidata'] }, { rnd: graine(3) });
  const x = aplat(c); assert.match(x, /Andorre-la-Vieille/); assert.ok(!/habitants|kilomètres/.test(x), 'aucun chiffre sans donnée');
  const off = composerPays({ nom: 'Japon', hors_ligne: true, sections: {} }, { rnd: graine(3) }); assert.ok(off.segments.some(s => s.angle === 'vide' && /ne rien inventer/.test(s.texte)));
});
t('actualités : « rien trouvé » est dit honnêtement', () => {
  const c = composerPays(INFOS, { rnd: graine(5), actus: [] }); assert.ok(c.segments.some(s => s.angle === 'actus' && /inventer|rien de récent|pas d’actualité/.test(s.texte)));
  const d = composerPays(INFOS, { rnd: graine(5), actus: null }); assert.ok(!d.segments.some(s => s.angle === 'actus'), 'actus non essayées : pas de segment');
});
t('présentation de mer : tous les océans et mers, textes variés', () => {
  for (const m of OCEANS_MERS) { const c = composerMer(m, { rnd: graine(m.id.length) }); assert.ok(c.segments.length >= 4, m.id); assert.ok(!/undefined|NaN/.test(aplat(c)), m.id); assert.ok(c.segments[0].texte.includes(designation(m.nom)), m.id + ' : intro sans le nom'); }
  oublier(); const m = OCEANS_MERS.find(o => o.id === 'mediterranee'), v = new Set(); for (let i = 0; i < 25; i++) v.add(aplat(composerMer(m, { rnd: graine(i * 13 + 1) })));
  assert.ok(v.size >= 22, 'versions : ' + v.size);
});
t('choisir : évite les dernières valeurs ; melanger : même contenu', () => {
  oublier(); const l = ['a', 'b', 'c', 'd']; let prec = null, rep = 0; for (let i = 0; i < 50; i++) { const x = choisir(l, 'k'); if (x === prec) rep++; prec = x; } assert.equal(rep, 0);
  assert.deepEqual(melanger([1, 2, 3, 4], graine(2)).sort(), [1, 2, 3, 4]);
});

t('RSS : titres, liens, dates, entités', () => {
  const xml = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[Guerre : un navire coule dans le détroit d'Ormuz]]></title><link>https://x.fr/a</link><pubDate>Tue, 14 Oct 2026 13:00:00 +0200</pubDate></item><item><title>Les &quot;Bleus&quot; gagnent &amp; qualifiés&#39;</title><link>https://x.fr/b</link></item><item><title>court</title></item></channel></rss>`;
  const r = parserRSS(xml, 'franceinfo'); assert.equal(r.length, 2);
  assert.equal(r[0].titre, 'Guerre : un navire coule dans le détroit d\'Ormuz'); assert.equal(r[0].url, 'https://x.fr/a'); assert.equal(r[0].source, 'franceinfo'); assert.equal(r[0].t, Date.parse('2026-10-14T11:00:00Z'));
  assert.equal(r[1].titre, 'Les "Bleus" gagnent & qualifiés\'');
});
t('localisation d’un titre : pays, villes, source GDELT en repli', () => {
  const idx = indexerLieux({ pays: [['392', 'JP', 'JPN', 'Japon'], ['250', 'FR', 'FRA', 'France'], ['840', 'US', 'USA', 'États-Unis']], centres: [['392', 36, 138, 10], ['250', 46, 2, 8], ['840', 38, -97, 30]], villes: [['Tokyo', 35.7, 139.7, 'Japon'], ['Lyon', 45.76, 4.83, 'France']] });
  const l = localiser([{ titre: 'Le Japon relance son programme spatial' }, { titre: 'Inondations à Lyon : la ville sous l’eau' }, { titre: 'Les États-Unis augmentent leurs droits de douane' }, { titre: 'Rien de géographique ici' }, { titre: 'Another headline', sourcePays: 'France' }], idx);
  assert.equal(l[0].lieu.nom, 'Japon'); assert.equal(l[1].lieu.nom, 'Lyon'); assert.equal(l[1].lieu.type, 'ville'); assert.equal(l[2].lieu.nom, 'États-Unis'); assert.equal(l[3].lieu, null); assert.equal(l[4].lieu.nom, 'France');
  assert.equal(norm('Côte d’Ivoire'), 'cote d ivoire');
});
console.log(ok + ' tests réussis');
