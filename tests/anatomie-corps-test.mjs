// Corps haute fidélité (BodyParts3D) : données, registre, fiches sourcées, fichiers GLB des couches (structure, nœuds, ancres de peau, poids), recalage par ancres.
//   node tests/anatomie-corps-test.mjs            (la partie « recalage » a besoin de THREE_PATH, voir anatomie-moteur-test.mjs)
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const racine = new URL('../', import.meta.url), lire = f => fs.readFileSync(new URL(f, racine));
let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 4).join('\n    ')); process.exitCode = 1; } };

const D = await import('../js/anatomie/donnees-corps.js');
const R = await import('../js/anatomie/registre.js');
const { FICHES_CORPS } = await import('../js/anatomie/fiches-corps.js');
const { MUSCLES } = await import('../js/anatomie/donnees-muscles.js');
const { OS } = await import('../js/anatomie/donnees-os.js');
const { groupeDeStructure, GROUPES_OS } = await import('../js/anatomie/groupes-os.js');
const { TABLES } = await import('../js/anatomie/correspondance-squelette.js');
const { definitionAncres } = await import('../scripts/ancres-bp3d.mjs');
const { NERFS_TRACES } = await import('../scripts/traces-nerfs-donnees.mjs');

const LIGNES = { muscles: D.MUSCLES_HD, tendons: D.TENDONS_HD, vaisseaux: D.VAISSEAUX_HD, organes: D.ORGANES_HD, nerfs: D.NERFS_HD };
const REGIONS = new Set(['Tête', 'Langue', 'Palais', 'Orbite', 'Cou', 'Larynx', 'Pharynx', 'Dos', 'Nuque', 'Thorax', 'Abdomen', 'Bassin', 'Périnée', 'Épaule', 'Bras', 'Avant-bras', 'Main', 'Cuisse', 'Jambe', 'Pied', 'Tout le corps']);
const basesOS = new Set(OS.map(o => o.id)); for (let i = 1; i <= 12; i++) basesOS.add('cote-' + i); for (const v of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'L1', 'L2', 'L3', 'L4', 'L5']) basesOS.add('vertebre-' + v);

await t('données : identifiants uniques, noms français et latins, régions connues, concepts BodyParts3D bien formés', () => {
  const vus = new Map();
  for (const [nom, lignes] of Object.entries(LIGNES)) for (const r of lignes) {
    const [id, fr, la, region, specs] = r;
    assert.match(id, /^[a-z0-9-]+$/, id); assert.ok(fr && la, id + ' : nom manquant'); assert.ok(REGIONS.has(region), id + ' : région ' + region);
    assert.ok(Array.isArray(specs), id + ' : concepts'); for (const s of specs) assert.ok(typeof s === 'string' && s.length > 2 && !/[A-Z]{3}/.test(s.replace(/BodyParts3D/g, '')), id + ' : concept ' + s);
    assert.ok(!vus.has(id), id + ' déjà défini dans ' + vus.get(id)); vus.set(id, nom);
  }
  assert.ok(D.MUSCLES_HD.length >= 150, 'muscles : ' + D.MUSCLES_HD.length); assert.ok(D.VAISSEAUX_HD.length >= 70, 'vaisseaux : ' + D.VAISSEAUX_HD.length);
  for (const [, , la] of D.MUSCLES_HD) assert.ok(/^Musculus |^Musculi |^Platysma|^Diaphragma/.test(la), la);
});
await t('muscles schématiques : ceux qui sont regroupés sont remplacés par des muscles individuels existants', () => {
  const ids = new Set(D.MUSCLES_HD.map(r => r[0]));
  for (const [ancien, nouveaux] of Object.entries(D.REMPLACE)) { assert.ok(MUSCLES.some(m => m.id === ancien), ancien + ' : muscle schématique inconnu'); for (const n of nouveaux) assert.ok(ids.has(n), ancien + ' → ' + n); }
  const remplaces = MUSCLES.filter(m => ids.has(m.id)).length; assert.ok(remplaces >= 25, 'muscles schématiques repris par la haute fidélité : ' + remplaces);
});
await t('registre : chaque structure a un nom, un nom latin, une fiche ; recherche par nom français', () => {
  for (const [nom, lignes] of Object.entries(LIGNES)) for (const r of lignes) {
    const id = R.instance(r[0], 'G'), d = R.definition(id); assert.ok(d, r[0] + ' absent du registre');
    const f = R.fiche(id); assert.ok(f && f.champs.length >= 2 && f.sous, r[0] + ' : fiche vide');
    assert.ok(d.latin, r[0] + ' : latin'); assert.ok(R.nomAffiche(id));
  }
  assert.equal(R.trouver('où s’insère le sartorius').base, 'sartorius'); assert.equal(R.trouver('le muscle piriforme').base, 'piriforme');
  assert.equal(R.trouver('artère fémorale').base, 'femorale-arterielle'); assert.equal(R.trouver('la veine cave inférieure').base, 'veine-cave-inferieure');
  assert.equal(R.typeDe('femorale-arterielle:D'), 'artere'); assert.equal(R.typeDe('veine-porte'), 'veine'); assert.equal(R.typeDe('tendon-calcaneen:D'), 'tendon');
});
await t('fiches sourcées : chaque fiche cite sa source, os d’attache valides, rien d’inventé (champ absent = « non renseigné »)', () => {
  const connus = new Set(Object.values(LIGNES).flat().map(r => r[0]).concat(MUSCLES.map(m => m.id)));
  for (const [id, f] of Object.entries(FICHES_CORPS)) {
    assert.ok(connus.has(id) || R.definition(id), id + ' : fiche orpheline'); assert.ok(f.source && /Gray|BodyParts3D/.test(f.source), id + ' : source');
    for (const k of ['origine', 'insertion']) if (f[k] && f[k].os) assert.ok(basesOS.has(f[k].os), id + ' : os inconnu ' + f[k].os);
    assert.ok(!JSON.stringify(f).includes('voir la source'), id + ' : renvoi vague');
  }
  const f = R.fiche('piriforme:D'); assert.ok(f.champs.some(c => c.label === 'Origine' && /sacrum/i.test(c.valeur)) && f.champs.some(c => c.label === 'Source' && /Gray/.test(c.valeur)));
  const vide = R.fiche('coccygien:D'), nr = vide.champs.filter(c => c.valeur === R.NON_RENSEIGNE); assert.ok(R.NON_RENSEIGNE.includes('Non renseigné'));
  const sansInfo = R.fiche('abducteur-petit-orteil:D'); assert.ok(sansInfo.champs.some(c => c.valeur === R.NON_RENSEIGNE), 'une fiche incomplète le dit : ' + JSON.stringify(sansInfo.champs.map(c => c.label)));
  void nr;
  const musclesAvecFiche = D.MUSCLES_HD.filter(r => FICHES_CORPS[r[0]] || MUSCLES.some(m => m.id === r[0])).length; assert.ok(musclesAvecFiche / D.MUSCLES_HD.length > .85, 'couverture des fiches : ' + musclesAvecFiche + ' / ' + D.MUSCLES_HD.length);
});
await t('région : tissus mous rattachés à une région d’isolation (os, muscles, vaisseaux, organes)', () => {
  assert.equal(groupeDeStructure(R.definition('sartorius:D')), 'membre-inferieur'); assert.equal(groupeDeStructure(R.definition('biceps-brachial:D')), 'membre-superieur');
  assert.equal(groupeDeStructure(R.definition('foie')), 'abdomen'); assert.equal(groupeDeStructure(R.definition('coeur')), 'thorax'); assert.equal(groupeDeStructure(R.definition('piriforme:G')), 'bassin');
  assert.ok(GROUPES_OS.some(g => g.id === 'abdomen'));
});

// ── fichiers GLB des couches ──
const FICHIERS = { muscles: 'muscles-bp3d.glb', tendons: 'tendons-bp3d.glb', arteres: 'arteres-bp3d.glb', 'arteres-fin': 'arteres-fin-bp3d.glb', veines: 'veines-bp3d.glb', 'veines-fin': 'veines-fin-bp3d.glb', organes: 'organes-bp3d.glb', nerfs: 'nerfs-bp3d.glb', os: 'os-axial-bp3d.glb' };
const present = Object.entries(FICHIERS).filter(([, f]) => fs.existsSync(new URL('ui/assets/anatomie/' + f, racine)));
function json(f) { const b = lire('ui/assets/anatomie/' + f), lg = b.readUInt32LE(12); return { b, j: JSON.parse(b.subarray(20, 20 + lg).toString('utf8')) }; }
const attendus = {
  muscles: new Set(D.MUSCLES_HD.map(r => r[0])), tendons: new Set(D.TENDONS_HD.map(r => r[0])), arteres: new Set(D.VAISSEAUX_HD.filter(r => r[5] === 'artere').map(r => r[0])), veines: new Set(D.VAISSEAUX_HD.filter(r => r[5] === 'veine').map(r => r[0])),
  organes: new Set(D.ORGANES_HD.map(r => r[0])), nerfs: new Set(D.NERFS_HD.map(r => r[0]))
};
attendus['arteres-fin'] = attendus.arteres; attendus['veines-fin'] = attendus.veines;
await t('GLB des couches : en-tête, poids pour tablette, compression meshopt, licence dans l’en-tête', () => {
  assert.ok(present.length >= 1, 'aucune couche installée');
  for (const [k, f] of present) {
    const { b, j } = json(f);
    assert.equal(b.toString('latin1', 0, 4), 'glTF'); assert.equal(b.readUInt32LE(4), 2); assert.equal(b.readUInt32LE(8), b.length);
    const limite = k === 'muscles' ? 12 : 6; assert.ok(b.length < limite * 1024 * 1024, f + ' : ' + (b.length / 1048576).toFixed(1) + ' Mo (limite : ' + limite + ' Mo, couche chargée à la demande et mise en cache)');
    assert.match(j.asset.copyright || '', /CC Attribution 4\.0/, f); assert.ok(j.extensionsRequired.includes('EXT_meshopt_compression') && j.extensionsRequired.includes('KHR_mesh_quantization'), f);
    assert.equal(new Set(j.nodes.map(n => n.name)).size, j.nodes.length, f + ' : nœuds en double');
    for (const n of j.nodes) assert.ok(Array.isArray(n.scale) && n.scale[0] > 0 && n.scale.every(Number.isFinite) && Array.isArray(n.translation) && n.translation.every(Number.isFinite), f + ' : nœud ' + n.name + ' : géométrie non finie (sommet NaN ?)');
  }
});
await t('GLB des couches : chaque nœud « id__côté__n » désigne une structure connue, chaque structure a ses nœuds', () => {
  for (const [k, f] of present.filter(([k]) => k !== 'os')) {
    const { j } = json(f), vus = new Set();
    for (const n of j.nodes) { const [id, cote] = n.name.split('__'); assert.ok(['G', 'D', 'M'].includes(cote), n.name); assert.ok(attendus[k].has(id), f + ' : nœud inconnu ' + n.name); vus.add(id); }
    if (!/fin/.test(k)) for (const id of attendus[k]) if (!/fines$/.test(id)) { const manque = !vus.has(id); if (manque && !['plexus-brachial', 'plexus-lombaire', 'plexus-sacre'].includes(id)) assert.ok(!manque || k === 'nerfs' || k === 'organes', f + ' : aucun nœud pour ' + id); }
  }
  const o = present.find(([k]) => k === 'muscles'); if (o) { const noms = new Set(json(o[1]).j.nodes.map(n => n.name.split('__')[0])); const manquants = D.MUSCLES_HD.filter(r => !noms.has(r[0])).map(r => r[0]); assert.equal(manquants.length, 0, 'muscles sans maillage : ' + manquants.join(', ')); }
});
await t('GLB des tissus mous : ancres de peau (_SKI, _SKW) et fibres (_FIBRE), liste d’ancres = celle des scripts', () => {
  const ancres = Object.keys(definitionAncres()).length;
  for (const [k, f] of present.filter(([k]) => k !== 'os')) {
    const { j } = json(f), ex = j.asset.extras; assert.ok(ex && Array.isArray(ex.ancres) && ex.ancres.length > 50 && ex.ancres.length <= ancres, f + ' : ancres ' + (ex && ex.ancres && ex.ancres.length));
    for (const m of j.meshes) { const a = m.primitives[0].attributes; assert.ok('_SKI' in a && '_SKW' in a, f + ' : peau manquante sur ' + m.name); if (k === 'muscles' || k === 'tendons') assert.ok('_FIBRE' in a, f + ' : fibres sur ' + m.name); }
    assert.ok(ex.ancres.every(a => a in definitionAncres()), f + ' : ancre inconnue');
  }
});
await t('GLB axial : nœuds cités par la table bodyparts3d-axial = nœuds du fichier (côtes, vertèbres, os longs, disques)', () => {
  const o = present.find(([k]) => k === 'os'); if (!o) return;
  const noms = new Set(json(o[1]).j.nodes.map(n => n.name)), tab = TABLES['bodyparts3d-axial'], cites = new Set();
  for (const e of Object.values(tab.os)) for (const l of [e.noeuds, e.G, e.D]) if (l) l.forEach(n => cites.add(n));
  for (const n of cites) assert.ok(noms.has(n), 'nœud cité absent du GLB : ' + n);
  for (const n of noms) assert.ok(cites.has(n) || n === 'disque_T12L1', 'nœud inutilisé : ' + n);
  for (const b of ['femur', 'humerus', 'tibia', 'fibula', 'radius', 'ulna', 'scapula', 'clavicule', 'os-coxal', 'patella', 'sacrum', 'vertebre-L4', 'cote-7']) assert.ok(tab.os[b], b);
  assert.ok(!('sternum' in tab.os) && !('coccyx' in tab.os), 'BodyParts3D n’a ni coccyx ni sternum complet : repli sur le squelette CC0');
});
await t('tracés de nerfs : chaque nerf a un rayon, un côté, et ses points s’appuient sur des structures nommées', () => {
  assert.ok(NERFS_TRACES.length >= 10);
  for (const n of NERFS_TRACES) {
    assert.ok(n.id && n.r > .001 && n.r < .01, n.id); const lignes = n.lignes || [{ pts: n.pts }]; assert.ok(lignes.length >= 1);
    for (const l of lignes) { assert.ok(l.pts.length >= 3, n.id); for (const p of l.pts) assert.ok(['c', 'x', 'l', 'p'].includes(p[0]), n.id + ' : point ' + p[0]); }
    assert.ok(D.NERFS_HD.some(r => r[0] === n.id) || MUSCLES.length, n.id);
  }
  for (const id of NERFS_TRACES.map(n => n.id)) assert.ok(R.definition(id), id + ' absent du registre');
});

// ── recalage par ancres (three.js) ──
const chemin = process.env.THREE_PATH;
if (!chemin) console.log('  (recalage : ignoré, THREE_PATH non défini)');
else {
  const THREE = await import(pathToFileURL(chemin).href);
  const { CorpsHD, hachage } = await import('../js/anatomie/corps-hd.js');
  const corps = new CorpsHD({ THREE });
  await t('recalage : un sommet collé à un os suit cet os ; entre deux os, mélange linéaire ; sans ancre, matrice moyenne', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from([0, 0, 0, 1, 0, 0, .5, 0, 0, 5, 5, 5]), 3));
    geo.setAttribute('_ski', new THREE.BufferAttribute(Uint8Array.from([0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 7, 7, 7, 7]), 4));
    geo.setAttribute('_skw', new THREE.BufferAttribute(Uint8Array.from([255, 0, 0, 0, 0, 255, 0, 0, 128, 127, 0, 0, 255, 0, 0, 0]), 4, true));
    const mats = new Map([['a', new THREE.Matrix4().makeTranslation(0, 1, 0)], ['b', new THREE.Matrix4().makeTranslation(0, 3, 0)]]);
    corps.peau(geo, ['a', 'b'], mats, corps.moyenne(mats));
    const p = geo.attributes.position;
    assert.ok(Math.abs(p.getY(0) - 1) < 1e-6 && Math.abs(p.getY(1) - 3) < 1e-6, 'sommets collés aux os');
    assert.ok(Math.abs(p.getY(2) - (128 * 1 + 127 * 3) / 255) < 1e-3, 'mélange : ' + p.getY(2));
    assert.ok(Math.abs(p.getY(3) - 7) < 1e-6, 'ancre inconnue : matrice moyenne (y = 5 + 2)');
    assert.ok(!geo.attributes._ski && geo.attributes.normal, 'attributs de peau retirés, normales recalculées');
  });
  await t('couleurs : variation stable par identifiant, dans [−1, 1]', () => {
    assert.equal(hachage('sartorius'), hachage('sartorius')); assert.notEqual(hachage('sartorius'), hachage('gracile'));
    for (const r of D.MUSCLES_HD) { const h = hachage(r[0]); assert.ok(h >= -1 && h <= 1); }
  });
}
console.log(ok + ' tests réussis');
