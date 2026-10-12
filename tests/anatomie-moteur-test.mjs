// Moteur 3D anatomie : construction de toutes les structures, calques, isolation, pathologies, appareillages (rendu WebGL simulé).
// Nécessite three.js hors du dépôt :  npm i three@0.160.0 dans un dossier à part, puis  THREE_PATH=<dossier>/node_modules/three/build/three.module.js node tests/anatomie-moteur-test.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const chemin = process.env.THREE_PATH;
if (!chemin) { console.log('  (ignoré : THREE_PATH non défini)'); process.exit(0); }
const THREE0 = await import(pathToFileURL(chemin).href);

// ── environnement navigateur simulé ──
class FauxRendu { constructor() { this.domElement = {}; } setPixelRatio() { } setSize() { } render() { this.n = (this.n || 0) + 1; } dispose() { } forceContextLoss() { } }
const THREE = Object.assign({}, THREE0, { WebGLRenderer: FauxRendu });
globalThis.window = { devicePixelRatio: 1 };
globalThis.ResizeObserver = class { observe() { } disconnect() { } };
globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => { };
const el = () => ({ appendChild() { }, remove() { }, style: {}, dataset: {}, className: '', textContent: '' });
globalThis.document = { hidden: false, createElement: el };
const canvas = { parentElement: { clientWidth: 800, clientHeight: 600 }, style: {}, addEventListener() { }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }), setPointerCapture() { }, toDataURL: () => 'data:' };

const { MoteurAnatomie } = await import('../js/anatomie/moteur.js');
const { creerStore, ETAT_INITIAL, actions, useAnatomieStore } = await import('../js/anatomie/store.js');
const { AMPUTATIONS, FRACTURES, APPAREILLAGES, SCOLIOSE } = await import('../js/anatomie/donnees-ortho.js');
const { OS, MUSCLES } = await import('../js/anatomie/donnees-os.js').then(async o => ({ OS: o.OS, MUSCLES: (await import('../js/anatomie/donnees-muscles.js')).MUSCLES }));

let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 4).join('\n    ')); process.exitCode = 1; } };

const store = creerStore(JSON.parse(JSON.stringify(ETAT_INITIAL)));
const M = new MoteurAnatomie(THREE, canvas, { store, etiquettes: el() });
const S = store;
const visibles = type => Array.from(M.entrees.values()).filter(e => e.type === type && e.obj.visible).length;
const maj = (patch) => S.definir(typeof patch === 'function' ? patch : () => patch);
const calque = (nom, v) => S.definir(e => ({ calques: Object.assign({}, e.calques, { [nom]: v }) }));

t('squelette par défaut : os, 24 vertèbres, 24 côtes', () => {
  const n = Array.from(M.entrees.values()).filter(e => e.type === 'os');
  assert.ok(n.length >= 85, 'os construits : ' + n.length);
  assert.equal(n.filter(e => e.sid.startsWith('vertebre-')).length, 24);
  assert.equal(n.filter(e => e.sid.startsWith('cote-')).length, 24);
  assert.ok(visibles('os') >= 85); assert.equal(visibles('muscle'), 0);
});
t('chaque géométrie est valide (sommets finis, non vides)', () => {
  for (const e of M.entrees.values()) e.obj.traverse(o => { if (o.geometry) { const p = o.geometry.attributes.position; assert.ok(p.count > 0, e.sid); for (let i = 0; i < p.array.length; i++) if (!Number.isFinite(p.array[i])) throw new Error('NaN dans ' + e.sid); } });
});
t('calques combinables : muscles + nerfs, puis squelette masqué', () => {
  calque('muscles', true); calque('nerfs', true);
  assert.ok(visibles('muscle') >= MUSCLES.length, 'muscles ' + visibles('muscle'));
  assert.ok(visibles('nerf') > 10);
  calque('squelette', false); assert.equal(visibles('os'), 0);
  calque('squelette', true);
  for (const e of M.entrees.values()) e.obj.traverse(o => { if (o.geometry) { const p = o.geometry.attributes.position; for (let i = 0; i < p.array.length; i++) if (!Number.isFinite(p.array[i])) throw new Error('NaN dans ' + e.sid); } });
});
t('organes, peau, dermatomes, repères', () => {
  calque('organes', true); calque('peau', true); calque('dermatomes', true); calque('reperes', true);
  assert.ok(visibles('organe') >= 14); assert.ok(visibles('dermatome') >= 20); assert.ok(visibles('repere') > 40);
  assert.ok(M.entrees.has('peau:tronc'));
});
t('isolation : seule la structure choisie reste visible', () => {
  S.definir({ selection: 'humerus:D', isolation: true });
  const vis = Array.from(M.entrees.values()).filter(e => e.obj.visible).map(e => e.sid);
  assert.deepEqual(vis, ['humerus:D']);
  S.definir({ isolation: false, selection: null });
});
t('isolation d’un muscle : os d’attache en fantôme', () => {
  S.definir({ selection: 'biceps-brachial:G', isolation: true, contexte: true });
  const vis = Array.from(M.entrees.values()).filter(e => e.obj.visible).map(e => e.sid).sort();
  assert.ok(vis.includes('biceps-brachial:G') && vis.includes('scapula:G') && vis.includes('radius:G'), vis.join());
  S.definir({ isolation: false, selection: null, contexte: false });
});
t('amputation trans-tibiale : plans de coupe posés sur le côté droit seulement', () => {
  actions.amputation; // (le store de l'appli est distinct : on agit sur le store de test)
  S.definir(e => ({ pathologie: Object.assign({}, e.pathologie, { amputation: { niveau: 'transtibiale', cote: 'D' } }) }));
  const tibD = M.entrees.get('tibia:D').mats[0], tibG = M.entrees.get('tibia:G').mats[0], humD = M.entrees.get('humerus:D').mats[0];
  assert.ok(tibD.clippingPlanes && tibD.clippingPlanes.length === 2 && tibD.clipIntersection);
  assert.ok(!tibG.clippingPlanes); assert.ok(!humD.clippingPlanes);
  // un point du tibia droit sous la coupe est retiré, au-dessus il est conservé
  const retire = (m, p) => m.clippingPlanes.every(pl => pl.distanceToPoint(new THREE.Vector3(...p)) < 0);
  assert.ok(retire(tibD, [-.09, .2, 0])); assert.ok(!retire(tibD, [-.09, .45, 0]));
  assert.equal(M.calques.pathologie.children.length, 1);
  S.definir(e => ({ pathologie: Object.assign({}, e.pathologie, { amputation: { niveau: 'transfemorale', cote: 'DG' } }) }));
  assert.ok(M.entrees.get('femur:G').mats[0].clippingPlanes && M.entrees.get('femur:D').mats[0].clippingPlanes);
  assert.equal(M.calques.pathologie.children.length, 2);
  S.definir(e => ({ pathologie: Object.assign({}, e.pathologie, { amputation: null }) }));
  assert.ok(!M.entrees.get('femur:G').mats[0].clippingPlanes);
});
t('toutes les amputations : plans valides et dôme du moignon', () => {
  for (const a of AMPUTATIONS) for (const c of ['D', 'G']) {
    S.definir(e => ({ pathologie: Object.assign({}, e.pathologie, { amputation: { niveau: a.id, cote: c } }) }));
    assert.equal(M.calques.pathologie.children.length, 1, a.id);
    const g = M.calques.pathologie.children[0].geometry.attributes.position; for (let i = 0; i < g.array.length; i++) assert.ok(Number.isFinite(g.array[i]), a.id);
  }
  S.definir(e => ({ pathologie: Object.assign({}, e.pathologie, { amputation: null }) }));
});
t('prothèses : chaque amputation a au moins un appareillage et il se construit', () => {
  for (const a of AMPUTATIONS) {
    const mods = APPAREILLAGES.filter(m => m.pour.amputations && m.pour.amputations.includes(a.id));
    assert.ok(mods.length >= 1, 'appareil pour ' + a.id);
    for (const m of mods) for (const c of ['D', 'DG']) {
      S.definir(e => ({ pathologie: Object.assign({}, e.pathologie, { amputation: { niveau: a.id, cote: c } }), appareillage: Object.assign({}, e.appareillage, { actif: true, modele: m.id, materiaux: {} }) }));
      const g = M.calques.appareil; let n = 0; g.traverse(o => { if (o.isMesh) { n++; const p = o.geometry.attributes.position; for (let i = 0; i < p.array.length; i++) if (!Number.isFinite(p.array[i])) throw new Error('NaN ' + m.id + ' ' + a.id); } });
      assert.ok(n >= 2, m.id + ' / ' + a.id + ' : ' + n + ' pièces');
    }
  }
  S.definir(e => ({ pathologie: Object.assign({}, e.pathologie, { amputation: null }), appareillage: Object.assign({}, e.appareillage, { actif: false, modele: null }) }));
});
t('scoliose : le rachis dévie, Cobb mesuré = Cobb demandé, côtes et moelle suivent', () => {
  const x0 = M.positions.find(p => p.id === 'T8').x; assert.equal(x0, 0);
  S.definir(e => ({ pathologie: Object.assign({}, e.pathologie, { scoliose: { courbes: [{ apex: 'T8', cobb: 40, convexite: 'D' }], lignesCobb: true } }) }));
  const T8 = M.positions.find(p => p.id === 'T8');
  assert.ok(T8.x < -.03, 'convexité droite = x négatif : ' + T8.x);
  const tilts = M.positions.map(p => p.rotZ); const cobb = (Math.max(...tilts) - Math.min(...tilts)) * 180 / Math.PI;
  assert.ok(Math.abs(cobb - 40) < 6, 'Cobb mesuré ' + cobb.toFixed(1));
  assert.ok(Math.abs(T8.rotY) > .05);
  const moelle = M.entrees.get('moelle'); assert.ok(moelle);
  S.definir(e => ({ pathologie: Object.assign({}, e.pathologie, { scoliose: { courbes: [{ apex: 'T8', cobb: 40, convexite: 'D' }, { apex: 'L2', cobb: 35, convexite: 'G' }], lignesCobb: true } }) }));
  assert.ok(M.positions.find(p => p.id === 'L2').x > .02);
  assert.ok(M.calques.marques.children.length >= 4, 'lignes de Cobb');
  for (const p of SCOLIOSE.presets) { S.definir(e => ({ pathologie: Object.assign({}, e.pathologie, { scoliose: { courbes: p.courbes, lignesCobb: true } }) })); }
});
t('corsets : correction réduit le Cobb effectif ; toutes les variantes se construisent', () => {
  S.definir(e => ({ pathologie: Object.assign({}, e.pathologie, { scoliose: { courbes: [{ apex: 'T8', cobb: 40, convexite: 'D' }], lignesCobb: true } }) }));
  const avant = Math.abs(M.positions.find(p => p.id === 'T8').x);
  for (const m of APPAREILLAGES.filter(x => x.pour.scoliose)) {
    S.definir(e => ({ appareillage: Object.assign({}, e.appareillage, { actif: true, modele: m.id, materiaux: {}, correction: 50 }) }));
    let n = 0; M.calques.appareil.traverse(o => { if (o.isMesh) n++; }); assert.ok(n >= 5, m.id + ' ' + n);
    assert.ok(Math.abs(M.positions.find(p => p.id === 'T8').x) < avant, 'correction effective avec ' + m.id);
  }
  S.definir(e => ({ appareillage: Object.assign({}, e.appareillage, { actif: false, modele: null }), pathologie: Object.assign({}, e.pathologie, { scoliose: null }) }));
  assert.equal(M.positions.find(p => p.id === 'T8').x, 0);
});
t('fractures : chaque préréglage déplace le fragment distal et se construit avec son orthèse', () => {
  for (const f of FRACTURES) {
    const spec = Object.assign({ type: f.type, angulation: f.angulation || 0, decalage: f.decalage || 0, raccourcissement: f.raccourcissement || 0, rotation: f.rotation || 0, plan: f.plan, cote: 'D', id: f.id }, { os: f.os });
    S.definir(e => ({ pathologie: Object.assign({}, e.pathologie, { fracture: spec }) }));
    const premier = f.os[0].id;
    if (premier.startsWith('vertebre-')) { const m = M.entrees.get(premier); assert.ok(m, premier); continue; }
    const en = M.entrees.get(premier + ':D'); assert.ok(en.obj.children.length >= 3, f.id + ' : fragments + trait (' + en.obj.children.length + ')');
    for (const a of APPAREILLAGES.filter(x => x.pour.fractures && x.pour.fractures.includes(f.id))) {
      S.definir(e => ({ appareillage: Object.assign({}, e.appareillage, { actif: true, modele: a.id, materiaux: {} }) }));
      let n = 0; M.calques.appareil.traverse(o => { if (o.isMesh) n++; }); assert.ok(n >= 1, a.id);
    }
    S.definir(e => ({ appareillage: Object.assign({}, e.appareillage, { actif: false, modele: null }) }));
  }
  S.definir(e => ({ pathologie: Object.assign({}, e.pathologie, { fracture: null }) }));
  assert.equal(M.entrees.get('femur:D').obj.children.length, 1);
});
t('matériaux : le choix change la couleur de la pièce', () => {
  const m = APPAREILLAGES.find(a => a.id === 'prothese-transtibiale');
  S.definir(e => ({ pathologie: Object.assign({}, e.pathologie, { amputation: { niveau: 'transtibiale', cote: 'D' } }), appareillage: Object.assign({}, e.appareillage, { actif: true, modele: m.id, materiaux: { emboiture: 'pa6' } }) }));
  const couleur = () => { let c; M.calques.appareil.traverse(o => { if (o.isMesh && o.userData.partie === 'emboiture') c = o.material.color.getHex(); }); return c; };
  const a = couleur();
  S.definir(e => ({ appareillage: Object.assign({}, e.appareillage, { materiaux: { emboiture: 'carbone' } }) }));
  assert.notEqual(couleur(), a);
});
t('libération des ressources', () => { M.dispose(); assert.ok(M.mort); });
console.log(ok + ' tests réussis');
