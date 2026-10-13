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

// lecture des GLB (en-tête, JSON) et de leur géométrie dé-quantifiée (scripts/lib-glb.mjs)
const { lireGLB } = await import('../scripts/lib-glb.mjs');
const FICHIERS = { 'squelette-cc0': 'ui/assets/anatomie/squelette-cc0.glb', 'bodyparts3d': 'ui/assets/anatomie/os-detail-bp3d.glb' };
const G = {};
for (const [k, f] of Object.entries(FICHIERS)) {
  const buf = lire(f), lg = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20 + lg).toString('utf8'));
  G[k] = { buf, json, noeuds: new Map(json.nodes.map(n => [n.name, n])), mailles: new Map(lireGLB(buf).map(m => [m.nom, m])) };
}
const boite = (k, nom) => { const p = G[k].mailles.get(nom).pos, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < p.length; i += 3) for (let j = 0; j < 3; j++) { mn[j] = Math.min(mn[j], p[i + j]); mx[j] = Math.max(mx[j], p[i + j]); } return { mn, mx }; };
const coller = { 'squelette-cc0': /CC0/, 'bodyparts3d': /CC Attribution 4\.0/ };

await t('GLB : en-tête glTF 2.0, poids raisonnable pour une tablette, nœuds uniques, quantifiés, licence dans l’en-tête', () => {
  const attendu = { 'squelette-cc0': 116, 'bodyparts3d': 157 };
  for (const [k, g] of Object.entries(G)) {
    assert.equal(g.buf.toString('latin1', 0, 4), 'glTF'); assert.equal(g.buf.readUInt32LE(4), 2); assert.equal(g.buf.readUInt32LE(8), g.buf.length);
    assert.ok(g.buf.length < 8 * 1024 * 1024, k + ' : taille ' + g.buf.length);
    assert.equal(g.json.nodes.length, attendu[k], k); assert.equal(g.noeuds.size, attendu[k], k + ' : doublons');
    assert.match(g.json.asset.copyright, coller[k]); assert.ok(g.json.extensionsRequired.includes('KHR_mesh_quantization'));
  }
});
await t('GLB squelette : géométrie saine (mètres, 1,75 m, pieds au sol, face vers +z, gauche en x > 0)', () => {
  let ymin = 1e9, ymax = -1e9;
  for (const n of G['squelette-cc0'].noeuds.keys()) { const b = boite('squelette-cc0', n); ymin = Math.min(ymin, b.mn[1]); ymax = Math.max(ymax, b.mx[1]); }
  assert.ok(Math.abs(ymin) < .02, 'pieds : ' + ymin); assert.ok(ymax > 1.7 && ymax < 1.8, 'hauteur : ' + ymax);
  const b = n => boite('squelette-cc0', n);
  assert.ok(b('humerus_G').mn[0] > 0 && b('humerus_D').mx[0] < 0, 'gauche en x > 0');
  assert.ok(b('sternum').mx[2] > b('vertebre_T8').mx[2], 'le sternum est devant le rachis (+z)');
  assert.ok(b('crane').mn[1] > b('vertebre_C7').mn[1]);
});
await t('GLB BodyParts3D : mains, pieds et crâne dans le repère de Raylé (mètres, gauche en x > 0, face vers +z)', () => {
  const b = n => boite('bodyparts3d', n), K = 'bodyparts3d';
  for (const nom of G[K].noeuds.keys()) { const x = b(nom); for (const v of [...x.mn, ...x.mx]) assert.ok(Number.isFinite(v) && Math.abs(v) < 3, nom); }
  assert.ok(b('carpe_scaphoid_G').mn[0] > 0 && b('carpe_scaphoid_D').mx[0] < 0, 'gauche en x > 0');
  assert.ok(b('ph_d3_G').mx[1] < b('carpe_scaphoid_G').mn[1], 'les doigts sont sous le carpe');
  assert.ok(b('po_d1_G').mx[2] > b('talus_G').mx[2], 'les orteils sont devant le talus (+z)');
  assert.ok(b('crane_frontal').mx[1] > b('mandibule').mx[1], 'le frontal est au-dessus de la mandibule');
  const hauteur = (n, m) => b(n).mx[m] - b(n).mn[m];
  assert.ok(hauteur('mc3_G', 1) > .05 && hauteur('mc3_G', 1) < .08, 'métacarpien de taille humaine');
  assert.ok(hauteur('crane_frontal', 0) > .1 && hauteur('crane_frontal', 0) < .16, 'largeur du frontal');
});
await t('GLB : indices valides, normales unitaires, épiphyse et occlusion ambiante cuites (_FIBRE dans [0, 1], non uniformes)', () => {
  for (const [k, g] of Object.entries(G)) {
    let somme = 0, n = 0;
    for (const m of g.mailles.values()) {
      const nv = m.pos.length / 3;
      for (let i = 0; i < m.idx.length; i++) if (m.idx[i] >= nv) assert.fail(k + ' ' + m.nom + ' : indice hors bornes');
      const utilises = new Set(m.idx);                       // un sommet orphelin (triangle dégénéré écarté à la soudure) n'a pas de normale
      for (const i of utilises) { const l = Math.hypot(m.nor[3 * i], m.nor[3 * i + 1], m.nor[3 * i + 2]); if (Math.abs(l - 1) > .03) assert.fail(k + ' ' + m.nom + ' : normale de longueur ' + l); }
      assert.ok(m.fibre && m.fibre.length === 2 * nv, k + ' ' + m.nom + ' : _FIBRE manquant');
      for (let i = 0; i < m.fibre.length; i++) { assert.ok(m.fibre[i] >= 0 && m.fibre[i] <= 1.0001, k + ' ' + m.nom); if (i % 2) { somme += m.fibre[i]; n++; } }
    }
    assert.ok(somme / n > .02 && somme / n < .7, k + ' : occlusion moyenne ' + somme / n);
  }
});
await t('table de correspondance : tous les nœuds cités existent dans le GLB, tous les nœuds du GLB servent', () => {
  for (const k of Object.keys(G)) {
    const attendus = noeudsAttendus(k);
    for (const n of attendus) assert.ok(G[k].noeuds.has(n), k + ' : nœud absent du GLB : ' + n);
    for (const n of G[k].noeuds.keys()) assert.ok(attendus.has(n) || (k === 'squelette-cc0' && (n === 'symphyse_pubienne' || n === 'disque_L5S1')) || (k === 'bodyparts3d' && n === 'hyoide'), k + ' : nœud inutilisé : ' + n);
  }
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
await t('table BodyParts3D : 8 os du carpe, 5 métacarpiens, 14 phalanges ; 7 os du tarse, 5 métatarsiens, 14 phalanges ; crâne en os séparés, 28 dents', () => {
  const os = TABLES.bodyparts3d.os;
  for (const c of ['G', 'D']) {
    assert.equal(os.carpe[c].length, 8); assert.equal(os.metacarpiens[c].length, 5); assert.equal(os['phalanges-main'][c].length, 14);
    assert.equal(os.talus[c].length + os.calcaneus[c].length + os['tarse-anterieur'][c].length, 7); assert.equal(os.metatarsiens[c].length, 5); assert.equal(os['phalanges-pied'][c].length, 14);
  }
  for (const b of ['carpe', 'metacarpiens', 'phalanges-main']) assert.equal(os[b].groupe, 'main');
  for (const b of ['talus', 'calcaneus', 'tarse-anterieur', 'metatarsiens', 'phalanges-pied']) assert.equal(os[b].groupe, 'pied');
  assert.ok(os.crane.noeuds.filter(n => n.startsWith('crane_')).length >= 21, 'os du crâne séparés');
  assert.equal(os.crane.noeuds.filter(n => n.startsWith('dent_')).length + os.mandibule.noeuds.filter(n => n.startsWith('dent_')).length, 28);
  for (const base of Object.keys(os)) assert.ok(TABLES['squelette-cc0'].os[base], base + ' : repli CC0 manquant (si le GLB détaillé ne se charge pas)');
});
await t('régions du squelette : chaque os de l’application appartient à une région', () => {
  for (const d of OS) assert.ok(groupeDe(d.id), d.id);
  assert.equal(groupeDe('vertebre-L3'), 'colonne'); assert.equal(groupeDe('cote-5'), 'thorax'); assert.equal(groupeDe('disque-L5-L4'), 'colonne'); assert.equal(groupeDe('cartilages-costaux'), 'thorax');
  assert.equal(groupeDe('biceps-brachial'), null); assert.equal(GROUPES_OS.length, 7);      // 6 régions osseuses + l'abdomen (tissus mous seulement)
});
await t('manifeste et crédits : atlas déclarés (axial BodyParts3D, détaillé BodyParts3D, CC0 en repli), fichiers présents, sources et licences citées dans CREDITS.md', () => {
  const m = JSON.parse(lire('ui/assets/anatomie/manifest.json')), liste = [].concat(m._atlas);
  assert.deepEqual(liste.map(a => a.table), ['bodyparts3d-axial', 'bodyparts3d', 'squelette-cc0']);
  for (const a of liste) { assert.ok(fs.existsSync(new URL('ui/assets/anatomie/' + a.fichier, racine)), a.fichier); assert.ok(TABLES[a.table]); assert.ok(a.licence && a.auteur && a.source); }
  assert.equal(liste[0].licence, 'CC-BY-4.0'); assert.equal(liste[1].licence, 'CC-BY-4.0'); assert.equal(liste[2].licence, 'CC0-1.0');
  const c = lire('CREDITS.md').toString('utf8');
  for (const s of ['cgicoffee.com/blog/2017/10/free-human-skeleton-3d-model', 'Armen Barsegyan', 'BodyParts3D', 'The Database Center for Life Science', 'dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html', 'CC BY 4.0']) assert.ok(c.includes(s), 'CREDITS.md : ' + s);
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
    const M = matriceAjustement(THREE, cube([0, 0, 0], .5), cube([1, 2, 3], 1), 'boite', [.1, 10]);
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
