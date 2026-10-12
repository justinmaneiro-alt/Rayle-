// Exécution des commandes d'anatomie sur le store (sans DOM) : ce que Raylé change et ce qu'elle répond.   node tests/anatomie-executer-test.mjs
import assert from 'node:assert/strict';
// le store est pris par index.js : même instance que celle de commandes.js (les imports sont versionnés « ?v= » par scripts/versionner.mjs)

let vue = 'rayle';
globalThis.window = globalThis;
globalThis.RayleBus = { demander(n, a) { if (n === 'vue') return vue; if (n === 'vue:ouvrir-anatomie') { vue = 'anatomie'; A.ouvrirFenetre(a && a.onglet); return Promise.resolve(); } if (n === 'vue:fermer') { vue = 'rayle'; A.fermerFenetre(); } }, on() { }, emit() { }, fournir() { } };
const { analyser, executer, useAnatomieStore: S, actions: A } = await import('../js/anatomie/index.js');
const dire = async txt => { const c = analyser(txt, { vue }); assert.ok(c, 'non compris : ' + txt); return executer(c); };

let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };

await t('ouvrir la fenêtre', async () => {
  const r = await dire("ouvre l'anatomie"); assert.equal(vue, 'anatomie'); assert.ok(S.obtenir().fenetre.ouverte); assert.match(r, /Anatomie et Orthopédie/);
});
await t('calques : combinaisons indépendantes', async () => {
  await dire('affiche les muscles et les nerfs'); let c = S.obtenir().calques; assert.ok(c.muscles && c.nerfs && !c.squelette);
  await dire('ajoute le squelette'); c = S.obtenir().calques; assert.ok(c.squelette && c.muscles && c.nerfs);
  await dire('cache les muscles'); c = S.obtenir().calques; assert.ok(!c.muscles && c.squelette && c.nerfs);
  await dire('squelette et muscles'.replace(/^/, 'montre le ')); c = S.obtenir().calques; assert.ok(c.squelette && c.muscles && !c.nerfs);
});
await t('amputation → pathologie dans le store, côté et niveau', async () => {
  const r = await dire('amputation trans-fémorale à gauche');
  assert.deepEqual(S.obtenir().pathologie.amputation, { niveau: 'transfemorale', cote: 'G' }); assert.match(r, /gauche/); assert.match(r, /trans-fémorale/i);
  await dire('désarticulation de hanche des deux côtés'.replace('des deux côtés', 'bilatérale')); assert.equal(S.obtenir().pathologie.amputation.cote, 'DG');
});
await t('prothèse : modèle adapté, puis matériau', async () => {
  await dire('amputation trans-tibiale à droite');
  const r = await dire('mets une prothèse'); const ap = S.obtenir().appareillage;
  assert.ok(ap.actif && ap.modele === 'prothese-transtibiale'); assert.match(r, /appui/i);
  const m = await dire("mets l'emboîture en PA6"); assert.equal(S.obtenir().appareillage.materiaux.emboiture, 'pa6'); assert.match(m, /PA6/);
  await dire('pylône en titane'); assert.equal(S.obtenir().appareillage.materiaux.pylone, 'titane');
  assert.match(await dire('manchon en acier').catch(() => ''), /pas proposé/);
  await dire('retire la prothèse'); assert.ok(!S.obtenir().appareillage.actif);
});
await t('prothèse sans pathologie : Raylé demande laquelle', async () => {
  A.toutNormal(); A.appareil(null);
  assert.match(await dire('mets une prothèse'), /d’abord une pathologie/);
});
await t('scoliose : Cobb, sommet, convexité, gravité dite', async () => {
  A.toutNormal();
  const r = await dire('simule une scoliose thoracique droite de 35 degrés sommet T7');
  const s = S.obtenir().pathologie.scoliose; assert.equal(s.courbes[0].cobb, 35); assert.equal(s.courbes[0].apex, 'T7'); assert.equal(s.courbes[0].convexite, 'D');
  assert.match(r, /35 degrés/); assert.match(r, /Modérée/i);
  await dire('montre une scoliose en S'); assert.equal(S.obtenir().pathologie.scoliose.courbes.length, 2);
  await dire('montre une scoliose de 50 degrés'); assert.ok(Math.max(...S.obtenir().pathologie.scoliose.courbes.map(c => c.cobb)) === 50);
  assert.match(await dire('mets un corset de Chêneau'), /Chêneau/); assert.equal(S.obtenir().appareillage.modele, 'corset-cheneau');
  await dire('correction de 55 %'); assert.equal(S.obtenir().appareillage.correction, 55);
  await dire('enlève la scoliose'); assert.equal(S.obtenir().pathologie.scoliose, null);
});
await t('« mets un corset » sans scoliose : une scoliose type est créée', async () => {
  A.toutNormal(); A.appareil(null);
  await dire('mets un corset'); assert.ok(S.obtenir().pathologie.scoliose); assert.ok(S.obtenir().appareillage.actif);
});
await t('fracture : préréglage et orthèse', async () => {
  A.toutNormal();
  const r = await dire('simule une fracture de Pouteau-Colles à gauche');
  const f = S.obtenir().pathologie.fracture; assert.equal(f.id, 'radius-distal-pouteau-colles'); assert.equal(f.cote, 'G'); assert.equal(f.plan, 'sagittal'); assert.ok(f.angulation > 0); assert.match(r, /Radius/);
  await dire('mets une orthèse'); assert.equal(S.obtenir().appareillage.modele, 'orthese-poignet-resine');
  await dire('montre un tassement vertébral'); assert.equal(S.obtenir().pathologie.fracture.os[0].id, 'vertebre-L1');
});
await t('tout remettre à la normale ; isolation en fenêtre ouverte ; fermeture', async () => {
  await dire("reviens à l'anatomie normale"); const e = S.obtenir(); assert.ok(!e.pathologie.amputation && !e.pathologie.scoliose && !e.pathologie.fracture && !e.appareillage.actif);
  const c = analyser("où s'insère le biceps gauche", { vue });
  const r = await executer(c); assert.equal(S.obtenir().selection, 'biceps-brachial:G'); assert.ok(S.obtenir().isolation); assert.ok(S.obtenir().calques.muscles); assert.match(r, /radius/i);
  await dire('retour'); assert.equal(vue, 'rayle');
});
console.log(ok + ' tests réussis');
