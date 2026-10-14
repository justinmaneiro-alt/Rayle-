// Mars : base d'informations des rovers, présentations variées, terrain d'atterrissage, noms compris :   node tests/univers-mars-test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ROVERS, composerRover, reponseRover, LISTE_ANGLES } from '../js/univers/donnees/rovers.js';
import { hauteur } from '../js/univers/espace/mars/decor.js';
import { trouverRover } from '../js/univers/espace/vue-mars.js';

let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.message); process.exitCode = 1; } };
const graine = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let x = Math.imul(s ^ s >>> 15, 1 | s); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };

t('rovers : chiffres de la NASA', () => {
  const P = ROVERS.perseverance.chiffres, C = ROVERS.curiosity.chiffres;
  assert.equal(P.masseKg, 1025); assert.equal(P.roues, 6); assert.equal(P.rouesCm, 52.5); assert.equal(P.atterrissage, '18 février 2021'); assert.equal(P.lancement, '30 juillet 2020'); assert.equal(P.tubes, 43);
  assert.equal(C.masseKg, 899); assert.equal(C.atterrissage, '6 août 2012'); assert.equal(C.rouesCm, 50);
  assert.ok(Math.abs(ROVERS.perseverance.site.lat - 18.44) < .01 && Math.abs(ROVERS.perseverance.site.lon - 77.45) < .01); assert.ok(Math.abs(ROVERS.curiosity.site.lat + 4.59) < .01 && Math.abs(ROVERS.curiosity.site.lon - 137.44) < .01);
});
t('rovers : toutes les listes de faits sont remplies, en phrases complètes', () => {
  for (const r of Object.values(ROVERS)) {
    assert.equal(typeof r.programme, 'string'); assert.ok(Array.isArray(r.mission), r.id + ' : la liste « mission » ne doit pas être écrasée par un nom');
    for (const a of LISTE_ANGLES) { assert.ok(r[a].length >= 2, r.id + ' ' + a); for (const x of r[a]) assert.ok(x.length > 30 && /[.!?]$/.test(x), r.id + ' ' + a + ' : ' + x.slice(0, 40)); }
  }
  assert.ok(ROVERS.perseverance.instruments.length >= 8); assert.ok(ROVERS.perseverance.anecdotes.some(x => /Dare Mighty Things/.test(x)));
});
t('pièces cliquables : 11 pour Perseverance (noeuds du modèle NASA), 8 pour Curiosity, légendes complètes', () => {
  assert.equal(ROVERS.perseverance.pieces.length, 11); assert.equal(ROVERS.curiosity.pieces.length, 8);
  for (const r of Object.values(ROVERS)) { const ids = new Set(); for (const p of r.pieces) { assert.ok(p.id && p.nom && p.texte.length > 40 && p.noeuds.length, r.id + ' ' + p.id); assert.ok(!ids.has(p.id)); ids.add(p.id); } }
  // les noeuds nommés existent dans le vrai fichier GLB
  const b = fs.readFileSync(new URL('../ui/assets/espace/modeles/perseverance.glb', import.meta.url)), j = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString()), noms = new Set(j.nodes.map(n => n.name));
  for (const p of ROVERS.perseverance.pieces) assert.ok(p.noeuds.some(n => noms.has(n)), 'aucun noeud du modèle pour « ' + p.id + ' »');
});
t('présentation d’un rover : introduction, trois angles, conclusion ; 25 versions sur 30', () => {
  const vus = new Set(); for (let i = 0; i < 30; i++) { const c = composerRover('perseverance', { rnd: graine(i * 17 + 3) }); assert.equal(c.segments.length, 5); assert.equal(c.segments[0].angle, 'intro'); assert.equal(c.segments.at(-1).angle, 'fin'); c.segments.forEach(s => assert.ok(!/undefined|NaN|\[object/.test(s.texte))); vus.add(c.segments.map(s => s.texte).join('|')); }
  assert.ok(vus.size >= 25, 'versions : ' + vus.size); assert.equal(composerRover('inconnu'), null);
});
t('réponses ciblées : instruments, énergie, records', () => { for (const a of ['instruments', 'energie', 'records', 'dimensions']) assert.ok(reponseRover('perseverance', a).length > 30); assert.equal(reponseRover('perseverance', 'sujet inconnu'), null); });
t('noms de rovers compris', () => { for (const [k, v] of Object.entries({ Perseverance: 'perseverance', 'le rover Perseverance': 'perseverance', perseverence: 'perseverance', Curiosity: 'curiosity', curiosité: 'curiosity', 'Mars 2020': 'perseverance' })) assert.equal(trouverRover(k), v, k); assert.equal(trouverRover('Jupiter'), null); });
t('terrain : plat et au niveau 0 au point d’atterrissage, relief ailleurs, déterministe', () => {
  for (const [x, z] of [[0, 0], [40, -30], [-60, 60]]) assert.ok(Math.abs(hauteur(x, z)) < .02, `(${x}, ${z}) : ${hauteur(x, z)}`);
  assert.equal(hauteur(1234, -567), hauteur(1234, -567)); let min = 1e9, max = -1e9; for (let x = -4000; x <= 4000; x += 200) for (let z = -4000; z <= 4000; z += 200) { const h = hauteur(x, z); min = Math.min(min, h); max = Math.max(max, h); } assert.ok(max - min > 40 && max - min < 400, 'relief : ' + (max - min).toFixed(0) + ' m');
  assert.ok(hauteur(900, -400) < hauteur(900, -400 + 400), 'cratère : le fond est plus bas que ses abords');
});
console.log(ok + ' tests réussis');
