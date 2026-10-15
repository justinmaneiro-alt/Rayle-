// Astres du système solaire : textures présentes et pesées, crédits (docs/CREDITS.md et Réglages), Soleil en shader, atmosphères, ombres de Saturne, fiches lisibles par Rayle :   node tests/univers-astres-visuels-test.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as Reg from '../js/univers/planetes/registre.js';
import { ASTRES, ORDRE_PLANETES } from '../js/univers/donnees/planetes.js';
import { composerAstre } from '../js/univers/donnees/presentation.js';
import { trouverAstre } from '../js/univers/espace/vue-systeme.js';

let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.message); process.exitCode = 1; } };
const racine = new URL('../', import.meta.url), lire = f => fs.readFileSync(new URL(f, racine), 'utf8'), taille = f => fs.statSync(new URL('ui/assets/' + f, racine)).size;
const sys = lire('js/univers/espace/systeme.js'), credits = lire('docs/CREDITS.md'), index = lire('index.html');

t('chaque astre du registre a sa texture en 1k et 2k (sauf le Soleil, dessiné par le code et la Terre, en JPEG 2048/4096)', () => {
  for (const p of Reg.liste()) {
    if (p.id === 'soleil') { assert.equal(p.texture, null); continue; }
    if (p.id === 'terre') { for (const f of ['terre-jour-2048.jpg', 'terre-jour-4096.jpg', 'terre-nuit-2048.jpg', 'terre-nuit-4096.jpg', 'nuages-2048.jpg']) assert.ok(taille(f) > 1e5, f); continue; }
    for (const r of ['1k', '2k']) assert.ok(taille(p.textureUrl(r)) > 1000, p.id + ' ' + r);
  }
});
t('poids : planètes + Lune ≤ 0,5 Mo en 1k et ≤ 2,2 Mo en 2k ; total appareil modeste ≤ 2 Mo, total Haute ≤ 4,5 Mo', () => {
  const somme = r => Reg.liste().filter(p => p.id !== 'soleil' && p.id !== 'terre').reduce((n, p) => n + taille(p.textureUrl(r)), 0);
  const terre = r => taille('terre-jour-' + r + '.jpg') + taille('terre-nuit-' + r + '.jpg') + taille('nuages-2048.jpg');
  const autres = taille('espace/saturne-anneaux.webp') + taille('espace/terre-ocean-1k.webp') + taille('espace/terre-relief-2k.webp');
  assert.ok(somme('1k') <= .5 * 1048576, String(somme('1k'))); assert.ok(somme('2k') <= 2.2 * 1048576, String(somme('2k')));
  assert.ok(somme('1k') + terre('2048') + autres + taille('espace/ciel-2k.webp') <= 2 * 1048576);
  assert.ok(somme('2k') + terre('4096') + autres + taille('espace/ciel-4k.webp') <= 4.5 * 1048576);
});
t('qualité adaptative : Basse = textures 1k, Moyenne et Haute = 2k (jamais plus que ce que le fichier offre)', () => {
  assert.match(sys, /const res = q\.tex >= 4096 \? '2k\.webp' : '1k\.webp'/);
  const noyau = lire('js/univers/noyau.js'); assert.match(noyau, /basse: .*tex: 2048/); assert.match(noyau, /moyenne: .*tex: 4096/); assert.match(noyau, /auto' \? detecter\(\)/);
});
t('crédits : docs/CREDITS.md cite chaque fichier de texture, la licence CC BY 4.0, Solar System Scope et la NASA', () => {
  for (const p of Reg.liste()) if (p.id !== 'soleil' && p.id !== 'terre') assert.ok(credits.includes('espace/' + p.id + '-1k.webp') && credits.includes('espace/' + p.id + '-2k.webp'), p.id);
  for (const m of ['Solar System Scope', 'CC BY 4.0', 'NASA', 'saturne-anneaux', 'Blue Marble', 'Soleil', 'Total appareil modeste', 'Total Haute']) assert.ok(credits.includes(m), m);
});
t('crédits affichés dans les Réglages', () => {
  assert.match(index, /<h3>Crédits des textures<\/h3>/); const bloc = /id="creditsTextures">([\s\S]*?)<\/div>/.exec(index)[1];
  for (const m of ['Solar System Scope', 'CC BY 4.0', 'NASA', 'Soleil', 'docs/CREDITS.md']) assert.ok(bloc.includes(m), m);
});
t('Soleil : shader d’émission (granulation, taches, bord assombri), couronne animée, halos, lumière ponctuelle sur les planètes', () => {
  assert.match(sys, /new THREE\.ShaderMaterial\(\{ uniforms: uSoleil/); assert.match(sys, /granulation/); assert.match(sys, /tache/); assert.match(sys, /assombrissement du bord/);
  assert.match(sys, /couronne = new THREE\.Mesh/); assert.match(sys, /uSoleil\.uT\.value = t/); assert.match(sys, /new THREE\.PointLight\(0xfff0dc/);
});
t('atmosphères : Terre, Vénus, Mars, Neptune ; facteur d’échelle mémorisé pour l’échelle réelle', () => {
  for (const id of ['terre', 'venus', 'mars', 'neptune']) assert.match(sys, new RegExp("id === '" + id + "'"), id);
  assert.equal((sys.match(/P\.atmoK = /g) || []).length, 3, "Terre, Mars, Neptune ; Vénus garde 1,06 par défaut"); assert.match(sys, /P\.atmo\.scale\.setScalar\(P\.rayon \* \(P\.atmoK \|\| 1\.06\)\)/);
});
t('Saturne : anneaux avec ombre du globe sur les anneaux et des anneaux sur le globe ; Uranus : anneaux fins et axe incliné', () => {
  assert.match(sys, /m\.onBeforeCompile = sh => ajoutFrag/); assert.match(sys, /mat\.onBeforeCompile = sh => ajoutFrag/); assert.match(sys, /P\.ombres = U/); assert.match(sys, /P\.ombres\.uPC\.value/);
  assert.match(sys, /RingGeometry\(1\.64, 2\.0/); assert.ok(ASTRES.uranus.axe > 90 && ASTRES.uranus.axe < 100); assert.ok(Math.abs(ASTRES.saturne.axe - 26.73) < .01);
  assert.match(sys, /incl\.rotation\.z = -d\.axe \* RAD/);
});
t('rotation propre de chaque planète (vraie période, sens rétrograde pour Vénus et Uranus), vitesse du temps réglable', () => {
  for (const id of ORDRE_PLANETES) assert.ok(ASTRES[id].rotationH, id); assert.ok(ASTRES.venus.rotationH < 0 && ASTRES.uranus.rotationH < 0);
  assert.match(sys, /P\.corps\.rotation\.y = sens \* 6\.2832/); assert.match(lire('js/univers/theme-espace.js'), /const VITESSES = \[/);
});
t('tous les astres : voix (« parle-moi de Neptune »), fiche courte, présentation, registre', () => {
  for (const id of ['soleil', ...ORDRE_PLANETES, 'lune']) {
    assert.ok(Reg.PLANETES[id], 'registre : ' + id); const a = ASTRES[id]; assert.ok(a.rayonKm && a.composition.length, id);
    const c = composerAstre(a, { rnd: () => .3 }); assert.ok(c.segments.length >= 4, id);
  }
  for (const [nom, id] of [['Soleil', 'soleil'], ['Mercure', 'mercure'], ['Vénus', 'venus'], ['Mars', 'mars'], ['Jupiter', 'jupiter'], ['Saturne', 'saturne'], ['Uranus', 'uranus'], ['Neptune', 'neptune']]) assert.equal(trouverAstre(nom), id, nom);
});
console.log(ok + ' tests réussis');
