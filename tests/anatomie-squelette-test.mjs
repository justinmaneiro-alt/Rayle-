// Squelette réaliste : GLB CC0 (structure, nœuds, dimensions), table de correspondance, manifeste, crédits, ajustement sur les formes schématiques.
//   node tests/anatomie-squelette-test.mjs            (la partie ajustement a besoin de THREE_PATH, voir anatomie-moteur-test.mjs)
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const racine = new URL('../', import.meta.url), lire = f => fs.readFileSync(new URL(f, racine));
let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };

const { TABLES, noeudsAttendus } = await import('../js/anatomie/correspondance-squelette.js');
const { OS, VERTEBRES } = await import('../js/anatomie/donnees-os.js');
const { GROUPES_OS, groupeDe } = await import('../js/anatomie/groupes-os.js');

// lecture du GLB (en-tête, JSON, binaire)
const glb = lire('ui/assets/anatomie/squelette-cc0.glb');
const lg = glb.readUInt32LE(12), json = JSON.parse(glb.subarray(20, 20 + lg).toString('utf8')), bin = glb.subarray(20 + lg + 8);
const noeuds = new Map(json.nodes.map(n => [n.name, n]));

await t('GLB : en-tête glTF 2.0, poids raisonnable pour une tablette, 116 nœuds, aucun doublon', () => {
  assert.equal(glb.toString('latin1', 0, 4), 'glTF'); assert.equal(glb.readUInt32LE(4), 2); assert.equal(glb.readUInt32LE(8), glb.length);
  assert.ok(glb.length < 15 * 1024 * 1024, 'taille ' + glb.length);
  assert.equal(json.nodes.length, 116); assert.equal(noeuds.size, 116);
  assert.match(json.asset.copyright, /CC0/);
});
await t('GLB : géométrie saine (mètres, 1,75 m, pieds au sol, face vers +z, gauche en x > 0)', () => {
  const boite = nom => { const m = json.meshes[noeuds.get(nom).mesh], a = json.accessors[m.primitives[0].attributes.POSITION]; return { mn: a.min, mx: a.max }; };
  let ymin = 1e9, ymax = -1e9;
  for (const n of json.nodes) { const b = boite(n.name); ymin = Math.min(ymin, b.mn[1]); ymax = Math.max(ymax, b.mx[1]); }
  assert.ok(Math.abs(ymin) < .02, 'pieds : ' + ymin); assert.ok(ymax > 1.7 && ymax < 1.8, 'hauteur : ' + ymax);
  assert.ok(boite('humerus_G').mn[0] > 0 && boite('humerus_D').mx[0] < 0, 'gauche en x > 0');
  assert.ok(boite('sternum').mx[2] > boite('vertebre_T8').mx[2], 'le sternum est devant le rachis (+z)');
  assert.ok(boite('crane').mn[1] > boite('vertebre_C7').mn[1]);
  for (const a of json.accessors) if (a.type === 'VEC3' && a.min) for (const v of [...a.min, ...a.max]) assert.ok(Number.isFinite(v) && Math.abs(v) < 3);
});
await t('GLB : indices valides (dans les bornes), normales unitaires', () => {
  for (const m of json.meshes) {
    const p = m.primitives[0], n = json.accessors[p.attributes.POSITION].count, ai = json.accessors[p.indices], bv = json.bufferViews[ai.bufferView];
    const idx = ai.componentType === 5125 ? new Uint32Array(bin.buffer, bin.byteOffset + bv.byteOffset, ai.count) : new Uint16Array(bin.buffer, bin.byteOffset + bv.byteOffset, ai.count);
    for (let i = 0; i < idx.length; i++) if (idx[i] >= n) assert.fail(m.name + ' : indice hors bornes');
    const an = json.accessors[p.attributes.NORMAL], bn = json.bufferViews[an.bufferView], nor = new Float32Array(bin.buffer, bin.byteOffset + bn.byteOffset, an.count * 3);
    for (let i = 0; i < nor.length; i += 3) { const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]); if (Math.abs(l - 1) > .01) assert.fail(m.name + ' : normale de longueur ' + l); }
  }
});
await t('table de correspondance : tous les nœuds cités existent dans le GLB, tous les nœuds du GLB servent', () => {
  const attendus = noeudsAttendus('squelette-cc0');
  for (const n of attendus) assert.ok(noeuds.has(n), 'nœud absent du GLB : ' + n);
  for (const n of noeuds.keys()) assert.ok(attendus.has(n) || n === 'symphyse_pubienne' || n === 'disque_L5S1', 'nœud inutilisé : ' + n);
});
await t('table de correspondance : tous les os de l’application ont un habillage', () => {
  const os = TABLES['squelette-cc0'].os;
  for (const d of OS) assert.ok(os[d.id], 'os sans correspondance : ' + d.id);
  for (const v of VERTEBRES) assert.ok(os['vertebre-' + v.id], v.id);
  for (let i = 1; i <= 12; i++) assert.ok(os['cote-' + i].G && os['cote-' + i].D);
  assert.ok(os['cartilages-costaux']);
  const disques = Object.keys(os).filter(k => k.startsWith('disque-')); assert.equal(disques.length, 22, 'C1-C2 reste procédural');
  for (const k of ['crane', 'mandibule', 'sternum', 'sacrum', 'coccyx']) assert.ok(os[k].noeuds, k);
});
await t('régions du squelette : chaque os de l’application appartient à une région', () => {
  for (const d of OS) assert.ok(groupeDe(d.id), d.id);
  assert.equal(groupeDe('vertebre-L3'), 'colonne'); assert.equal(groupeDe('cote-5'), 'thorax'); assert.equal(groupeDe('disque-L5-L4'), 'colonne'); assert.equal(groupeDe('cartilages-costaux'), 'thorax');
  assert.equal(groupeDe('biceps-brachial'), null); assert.equal(GROUPES_OS.length, 6);
});
await t('manifeste et crédits : atlas CC0 déclaré, fichier présent, source citée dans CREDITS.md', () => {
  const m = JSON.parse(lire('ui/assets/anatomie/manifest.json'));
  assert.equal(m._atlas.licence, 'CC0-1.0'); assert.ok(fs.existsSync(new URL('ui/assets/anatomie/' + m._atlas.fichier, racine))); assert.ok(TABLES[m._atlas.table]);
  const c = lire('CREDITS.md').toString('utf8'); assert.ok(c.includes('cgicoffee.com/blog/2017/10/free-human-skeleton-3d-model')); assert.ok(c.includes('Armen Barsegyan')); assert.ok(c.includes('CC0'));
});

const chemin = process.env.THREE_PATH;
if (!chemin) console.log('  (ajustement : ignoré, THREE_PATH non défini)');
else {
  const THREE = await import(pathToFileURL(chemin).href);
  const { matriceAjustement, axePrincipal } = await import('../js/anatomie/ajustement.js');
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const barre = (a, b, n = 40, r = .01) => Array.from({ length: n }, (_, i) => { const u = i / (n - 1), p = a.clone().lerp(b, u); return p.add(V(Math.cos(i) * r, Math.sin(i * 1.7) * r, 0)); });
  await t('ajustement « axe » : un os long couché prend la position, l’axe et la longueur de la forme schématique', () => {
    const modele = barre(V(0, 0, 0), V(.5, 0, 0)), forme = barre(V(.1, .93, 0), V(.1, .53, .01));       // modèle horizontal de 50 cm ; forme verticale de 40 cm (fémur)
    const M = matriceAjustement(THREE, modele, forme, 'axe');
    const bas = V(0, 0, 0).applyMatrix4(M), haut = V(.5, 0, 0).applyMatrix4(M);
    const proche = (p, q) => assert.ok(p.distanceTo(q) < .03, p.toArray() + ' ≠ ' + q.toArray());
    // l'axe principal est orienté arbitrairement : on accepte les deux sens mais l'os doit couvrir exactement la forme
    const direct = bas.distanceTo(V(.1, .93, 0)) < .03 && haut.distanceTo(V(.1, .53, .01)) < .03, inverse = bas.distanceTo(V(.1, .53, .01)) < .03 && haut.distanceTo(V(.1, .93, 0)) < .03;
    assert.ok(direct || inverse, 'extrémités : ' + bas.toArray() + ' / ' + haut.toArray());
    void proche;
  });
  await t('ajustement « boite » : centre et échelle ; « aucun » : pas de matrice ; échelle bornée contre les erreurs d’unité', () => {
    const cube = (c, h) => [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => V(c[0] + x * h, c[1] + y * h, c[2] + z * h))));
    const M = matriceAjustement(THREE, cube([0, 0, 0], .5), cube([1, 2, 3], 1), 'boite');
    assert.ok(V(0, 0, 0).applyMatrix4(M).distanceTo(V(1, 2, 3)) < 1e-6); assert.ok(Math.abs(V(.5, 0, 0).applyMatrix4(M).x - 2) < 1e-6);
    assert.equal(matriceAjustement(THREE, cube([0, 0, 0], 1), cube([0, 0, 0], 1), 'aucun'), null);
    const M2 = matriceAjustement(THREE, cube([0, 0, 0], .001), cube([0, 0, 0], 1), 'boite');          // modèle en millimètres : échelle bornée (le garde-fou du moteur le refuse en amont)
    assert.ok(new THREE.Vector3().setFromMatrixScale(M2).x <= 1.35 + 1e-9);
  });
  await t('axe principal : direction, longueur, centre', () => {
    const a = axePrincipal(THREE, barre(V(0, 0, 0), V(0, 0, .6), 50, .005));
    assert.ok(Math.abs(Math.abs(a.axe.z) - 1) < .02, 'axe z'); assert.ok(Math.abs(a.longueur - .6) < .02, 'longueur ' + a.longueur);
  });
}
console.log(ok + ' tests réussis');
