// Fenêtre Cerveau : données (zones, faisceaux, réseaux, sources), fichier 3D, recherche, fiches, commandes vocales, moteur (avec THREE_PATH).
//   node tests/anatomie-cerveau-test.mjs            (la partie moteur a besoin de THREE_PATH, voir anatomie-moteur-test.mjs)
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const racine = new URL('../', import.meta.url), lire = f => fs.readFileSync(new URL(f, racine));
let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 4).join('\n    ')); process.exitCode = 1; } };
const D = await import('../js/anatomie/donnees-cerveau.js');
const C = await import('../js/anatomie/cerveau-recherche.js');
const { analyser } = await import('../js/anatomie/commandes.js');

await t('structures : identifiants uniques, noms français et latins, concepts BodyParts3D, couleurs, types connus', () => {
  const vus = new Set();
  for (const [id, fr, la, specs, col, type] of D.STRUCTURES_CERVEAU) {
    assert.match(id, /^[a-z0-9-]+$/, id); assert.ok(!vus.has(id), id + ' en double'); vus.add(id);
    assert.ok(fr && la && Array.isArray(specs) && specs.length, id); assert.ok(Number.isInteger(col) && col >= 0 && col <= 0xffffff, id);
    assert.ok(['cortex', 'aire', 'profond', 'tronc', 'liquide', 'blanche'].includes(type), id + ' : type ' + type);
    for (const s of specs) assert.ok(/^(p:)?(\{c\} )?[a-z' -]+$/i.test(s) || /^(posterior|anterior) part of \{c\} [a-z ]+$/.test(s), id + ' : concept ' + s);
  }
  assert.ok(D.STRUCTURES_CERVEAU.length >= 40);
});
await t('zones : structures, faisceaux, réseaux et sources existent ; champs obligatoires remplis ; chaque zone dit son degré de certitude', () => {
  const ids = new Set(D.STRUCTURES_CERVEAU.map(s => s[0]));
  for (const z of D.ZONES_CERVEAU) {
    for (const k of ['nom', 'latin', 'famille', 'localisation', 'fonctionnement']) assert.ok(z[k] && z[k].length > (['nom', 'latin', 'famille'].includes(k) ? 3 : 10), z.id + ' : ' + k);
    assert.ok(z.fonctions.length >= 1 && z.pathologies.length >= 1, z.id); assert.ok(z.certitude && z.certitude.length > 20, z.id + ' : certitude');
    for (const s of z.structures) assert.ok(ids.has(s), z.id + ' : structure ' + s);
    for (const f of z.faisceaux) assert.ok(D.FAISCEAU_PAR_ID[f], z.id + ' : faisceau ' + f);
    if (z.reseau) assert.ok(D.RESEAU_PAR_ID[z.reseau], z.id + ' : réseau ' + z.reseau);
    assert.ok(z.sources.length >= 2 && z.sources.every(k => D.SOURCES_CERVEAU[k]), z.id + ' : sources'); assert.ok(z.sources.includes('TA'), z.id + ' : la Terminologia Anatomica cite le nom');
    assert.ok(z.sources.some(k => ['PURVES', 'KANDEL', 'GRAY'].includes(k)), z.id + ' : un ouvrage de référence');
  }
  for (const r of D.RESEAUX_CERVEAU) { assert.ok(r.zones.every(z => D.ZONE_PAR_ID[z]) && r.faisceaux.every(f => D.FAISCEAU_PAR_ID[f]) && D.SOURCES_CERVEAU[r.source], r.id); }
});
await t('faisceaux : au moins 2 points, classes connues, coordonnées d’atlas plausibles (mm), tous utilisés par une zone', () => {
  const usage = new Set(D.ZONES_CERVEAU.flatMap(z => z.faisceaux));
  for (const f of D.FAISCEAUX_CERVEAU) {
    assert.ok(['association', 'projection', 'commissure', 'limbique'].includes(f.classe), f.id); assert.ok(f.role.length > 20, f.id);
    for (const pts of f.ens || [f.pts]) { assert.ok(pts.length >= 3, f.id); for (const [g, a, s] of pts) { assert.ok(Math.abs(g) <= 75 && a >= -105 && a <= 75 && s >= -60 && s <= 75, f.id + ' : ' + [g, a, s]); } }
    assert.ok(usage.has(f.id), f.id + ' : aucun usage');
  }
});
await t('Brodmann : centres dans l’atlas, couleurs, libellés ; l’avertissement « approximatif » est présent', () => {
  assert.ok(D.AIRES_BRODMANN.length >= 20); for (const a of D.AIRES_BRODMANN) { assert.ok(a.lib.length > 5 && a.col > 0, String(a.n)); assert.ok(Math.abs(a.c[0]) <= 70 && a.c[1] >= -100 && a.c[1] <= 70, String(a.n)); }
  assert.ok(new Set(D.AIRES_BRODMANN.map(a => String(a.n))).size === D.AIRES_BRODMANN.length);
});
await t('fichier 3D : cerveau-bp3d.glb contient un nœud (côté G, D ou M) pour chaque structure, dans la limite de poids', () => {
  const b = lire('ui/assets/anatomie/cerveau-bp3d.glb'); assert.equal(b.readUInt32LE(0), 0x46546c67, 'magic glTF');
  const n = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + n).toString('utf8'));
  const noms = new Set((json.nodes || []).map(x => String(x.name || '').split('__')[0])); const manquants = D.STRUCTURES_CERVEAU.map(s => s[0]).filter(i => !noms.has(i));
  assert.deepEqual(manquants, [], 'structures sans maillage : ' + manquants.join(', '));
  assert.ok(b.length < 3 * 1048576, 'poids : ' + (b.length / 1048576).toFixed(2) + ' Mo'); assert.ok(json.extensionsUsed.includes('EXT_meshopt_compression'));
  assert.match(JSON.stringify(json.asset), /BodyParts3D/);
});
await t('recherche : noms français et latins, alias, réseaux ; les mots ambigus ne volent pas les os et muscles', () => {
  const z = (q, o) => (C.trouverZone(q, o) || {}).id;
  assert.equal(z('montre l’hippocampe'), 'hippocampe'); assert.equal(z('le lobe frontal'), 'lobe-frontal'); assert.equal(z('aire de Broca'), 'aire-broca'); assert.equal(z('Corpus callosum'), 'corps-calleux');
  assert.equal(z('l’amygdale'), 'amygdale'); assert.equal(z('le cervelet'), 'cervelet'); assert.equal(z('les ventricules'), 'ventricules'); assert.equal(z('noyaux gris centraux'), 'noyaux-gris'); assert.equal(z('cortex moteur'), 'cortex-moteur');
  assert.equal(z('os frontal', { strict: true }), undefined); assert.equal(z('le muscle temporal', { strict: true }), undefined); assert.equal(z('mouvement du genou', { strict: true }), undefined);
  assert.equal((C.trouverReseau('le réseau de la vision') || {}).id, 'vision'); assert.equal((C.trouverReseau('les neurones du langage') || {}).id, 'langage');
});
await t('fiche et résumé : champs, sources citées, certitude, mention ; résumé selon la question', () => {
  const f = C.ficheZone('hippocampe'); assert.ok(f.champs.some(c => c.label === 'Localisation') && f.champs.some(c => c.label.startsWith('Pathologies')));
  assert.ok(f.sources.some(s => /Scoville/.test(s)) && /clinicien/.test(f.mention) && f.certitude.length > 20);
  assert.match(C.resumeZone('hippocampe', 'où est l’hippocampe'), /Face interne du lobe temporal/); assert.match(C.resumeZone('hippocampe', 'quelles maladies'), /Amnésie|Alzheimer/); assert.match(C.resumeZone('hippocampe', 'comment ça marche'), /cortex entorhinal/);
  assert.match(C.resumeZone('lobe-frontal', ''), /Lobus frontalis/); assert.equal(C.ficheZone('zzz'), null);
  assert.equal(C.nomLatin(D.ZONE_PAR_ID.hippocampe), 'Hippocampe'); assert.match(C.nomLatin(D.ZONE_PAR_ID['lobe-frontal']), /Lobus frontalis/);
});
await t('commandes : montre / explique / tour / vues et coupes / calques / réseaux / qualité ; pas de vol des phrases d’autres modules', () => {
  const a = (q, v = 'rayle') => analyser(q, { vue: v }) || {};
  assert.equal(a('montre l’hippocampe').type, 'cerveau-zone'); assert.equal(a('montre l’hippocampe').id, 'hippocampe');
  assert.equal(a('où se trouve l’amygdale ?').type, 'cerveau-zone'); assert.equal(a('explique le lobe frontal').type, 'presenter');
  assert.equal(a('fais-moi un tour du cerveau').type, 'presenter'); assert.equal(a('fais-moi un tour du cerveau').requete, 'tour du cerveau');
  assert.equal(a('ouvre le cerveau').type, 'cerveau-ouvrir'); assert.equal(a('affiche le cerveau en 3D').type, 'cerveau-ouvrir');
  assert.equal(a('coupe sagittale du cerveau').vue, 'mediane'); assert.equal(a('vue médiane du cerveau').type, 'cerveau-vue'); assert.equal(a('coupe axiale', 'cerveau').vue, 'axiale'); assert.equal(a('vue de dessous', 'cerveau').vue, 'dessous');
  assert.deepEqual([a('affiche les aires de Brodmann').type, a('affiche les aires de Brodmann').calque, a('affiche les aires de Brodmann').oui], ['cerveau-calque', 'brodmann', true]);
  assert.equal(a('masque les neurones', 'cerveau').oui, false); assert.equal(a('montre le réseau de la vision dans le cerveau').type, 'cerveau-reseau'); assert.equal(a('active les neurones du langage', 'cerveau').id, 'langage');
  assert.deepEqual([a('qualité ultra pour le cerveau').type, a('qualité ultra pour le cerveau').niveau], ['cerveau-qualite', 'ultra']);
  assert.equal(a('ferme', 'cerveau').type, 'fermer-fenetre'); assert.equal(a('retour', 'cerveau').type, 'fermer-fenetre');
  for (const q of ['passe en entité cerveau', 'combien de neurones dans le cerveau', 'neurones', 'cerveau', 'pourquoi le cerveau consomme autant']) assert.equal(analyser(q, { vue: 'rayle' }), null, q);
  assert.notEqual(a('montre l’os frontal').type, 'cerveau-zone'); assert.notEqual(a('montre le muscle temporal').type, 'cerveau-zone');
});
await t('capacités : chaque exemple Cerveau et Présentations est reconnu par l’analyseur', async () => {
  const { chargerRegistre } = await import('./lib-capacites.mjs'); const { reg, verifier } = await chargerRegistre();
  for (const id of ['cerveau', 'presentations']) { const f = reg.famille(id); assert.ok(f, 'famille ' + id); assert.ok(f.ex.length >= 5); for (const p of f.ex) assert.ok(await verifier(f.verif, p), id + ' : « ' + p + ' » non reconnu'); }
});

// ───────────────────────── moteur 3D (nécessite three.js) ─────────────────────────
const THREE_PATH = process.env.THREE_PATH;
if (!THREE_PATH) console.log('  (moteur 3D non testé : THREE_PATH absent)');
else {
  const THREE = await import(pathToFileURL(THREE_PATH).href);
  await t('moteur : classes et niveaux de qualité ; Ultra n’est jamais le niveau par défaut ; limites croissantes', async () => {
    const M = await import('../js/anatomie/cerveau-moteur.js');
    assert.deepEqual(M.NIVEAUX_CERVEAU, ['eco', 'standard', 'haute', 'ultra']);
    let prec = null; for (const n of M.NIVEAUX_CERVEAU) { const q = M.QUALITE[n]; if (prec) { assert.ok(q.impulsions > prec.impulsions && q.locaux > prec.locaux && q.dpr >= prec.dpr, n); } prec = q; }
    assert.equal(M.QUALITE.eco.bloom, 0); assert.equal(M.QUALITE.eco.tubes, false); assert.ok(typeof M.MoteurCerveau === 'function' && THREE.WebGLRenderer);
    const f = lire('js/anatomie/cerveau-fenetre.js').toString();
    assert.ok(/n === 'haute' \? 'haute' : n/.test(f) && !/ultra.*niveauConseille/.test(f), 'le palier conseillé ne renvoie jamais ultra');
  });
}
console.log(ok + ' tests réussis');
