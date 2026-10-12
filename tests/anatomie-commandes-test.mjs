// Commandes de Raylé pour l'anatomie : ce qui déclenche le pop-up 3D, la fenêtre, les calques, les pathologies et les appareillages.
//   node tests/anatomie-commandes-test.mjs
import assert from 'node:assert/strict';
const { analyser } = await import('../js/anatomie/commandes.js');
const R = await import('../js/anatomie/registre.js');

let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.message); process.exitCode = 1; } };
const A = (txt, vue) => analyser(txt, { vue: vue || 'rayle' });
const J = (txt, vue) => { const c = A(txt, vue); return c ? JSON.stringify(Object.assign({}, c, c.cible ? { cible: c.cible.base + (c.cible.cote ? ':' + c.cible.cote : '') } : {})) : null; };
const type = (txt, vue) => (A(txt, vue) || {}).type || null;

t('pop-up 3D : « décris-moi l’humérus », « où s’insère le biceps ? »', () => {
  const a = A("Décris-moi l'humérus"); assert.equal(a.type, 'decrire'); assert.equal(a.cible.base, 'humerus');
  const b = A("Où s'insère le biceps ?"); assert.equal(b.type, 'decrire'); assert.equal(b.cible.base, 'biceps-brachial');
  assert.equal(A('Raylé, explique-moi le biceps femoral gauche').cible.cote, 'G');
  assert.equal(A("à quoi sert le nerf sciatique").cible.base, 'nerf-sciatique');
  assert.equal(A('où se trouve le foie').cible.base, 'foie');
  assert.equal(A('montre-moi la vertèbre L4').cible.base, 'vertebre-L4');
  assert.equal(A('parle-moi du quadriceps').cible.groupe, true);
  assert.equal(A('décris la rotule droite').cible.base, 'patella');
  assert.equal(A("c'est quoi l'atlas ?").cible.base, 'vertebre-C1');
});
t('palpation : repères osseux', () => {
  const a = A("où palper la malléole médiale ?"); assert.equal(a.type, 'decrire'); assert.ok(a.palpation); assert.equal(a.cible.type, 'repere');
  assert.equal(A("comment repérer l'épine iliaque antéro-supérieure").cible.base, 'repere:eias');
});
t('pas de faux positifs : marchés, météo, conversation, douleurs', () => {
  for (const f of ["quel est le prix du bitcoin", "mets le Nasdaq en H4", "quelle est la météo à Toulouse", "j'ai mal au genou", "bonjour Raylé", "ouvre le terminal", "ferme le terminal", "montre-moi l'or", "résume l'actualité du jour", "le cœur du sujet c'est la volatilité", "dis-moi une blague", "combien font 12 fois 8", "explique-moi la digestion", "rappelle-moi d'appeler le médecin demain"])
    assert.equal(A(f), null, f);
});
t('fenêtre : ouvrir et fermer', () => {
  for (const f of ["ouvre l'anatomie", 'ouvre la fenêtre anatomie et orthopédie', 'Raylé, lance le module anatomie', "va sur l'orthopédie", 'ouvre le modèle 3D', 'affiche le corps humain']) assert.equal(type(f), 'ouvrir', f);
  assert.equal(type('retour', 'anatomie'), 'fermer-fenetre'); assert.equal(type('ferme l’anatomie', 'anatomie'), 'fermer-fenetre'); assert.equal(type('reviens à Raylé', 'anatomie'), 'fermer-fenetre');
  assert.equal(type('ferme le pop-up'), 'fermer-quick'); assert.equal(type("ferme l'aperçu"), 'fermer-quick');
  assert.equal(type('retour'), null);
});
t('calques combinables', () => {
  const c = f => { const a = A(f); return a && a.type === 'calques' ? a.mode + ':' + a.liste.join('+') : null; };
  assert.equal(c('affiche les muscles'), 'ajouter-ou-seul:muscles');
  assert.equal(c('montre le squelette et les muscles'), 'ajouter-ou-seul:squelette+muscles');
  assert.equal(c('muscles + nerfs'), null);   // sans verbe : pas une commande
  assert.equal(c('affiche les muscles et le système nerveux'), 'ajouter-ou-seul:muscles+nerfs');
  assert.equal(c('squelette plus système nerveux'), 'ajouter-ou-seul:squelette+nerfs');
  assert.equal(c('ajoute les nerfs'), 'ajouter:nerfs');
  assert.equal(c('cache la peau'), 'retirer:peau');
  assert.equal(c('enlève les muscles'), 'retirer:muscles');
  assert.equal(c('montre uniquement les organes'), 'seul:organes');
  assert.equal(c('active les dermatomes'), 'ajouter-ou-seul:dermatomes');
  assert.equal(c('affiche les repères osseux'), 'ajouter-ou-seul:reperes');
  assert.equal(c('montre les muscles de l’avant-bras'), null);
});
t('amputations : niveaux et côtés', () => {
  const am = f => { const a = A(f); return a && a.type === 'amputation' ? a.niveau + ':' + (a.cote || '') : null; };
  assert.equal(am('amputation trans-tibiale à droite'), 'transtibiale:D');
  assert.equal(am('simule une amputation transtibiale gauche'), 'transtibiale:G');
  assert.equal(am('amputation trans-fémorale'), 'transfemorale:');
  assert.equal(am('désarticulation du genou à gauche'), 'genou:G');
  assert.equal(am('désarticulation de hanche'), 'hanche:');
  assert.equal(am("amputation de Syme"), 'syme:');
  assert.equal(am('amputation de Chopart côté droit'), 'chopart:D');
  assert.equal(am('amputation de Lisfranc'), 'lisfranc:');
  assert.equal(am('amputation trans-radiale'), 'transradiale:');
  assert.equal(am('amputation trans-humérale à gauche'), 'transhumerale:G');
  assert.equal(am("désarticulation d'épaule"), 'epaule-disarticulation:');
  assert.equal(am('désarticulation du coude'), 'coude:');
  assert.equal(am('désarticulation du poignet'), 'poignet:');
  assert.equal(am('amputation de doigts'), 'doigts:');
  assert.equal(am('amputation transmétacarpienne'), 'transmetacarpienne:');
  assert.equal(am('amputation des deux jambes sous le genou'), 'transtibiale:DG');
  assert.equal(type('simule une amputation'), 'amputation-liste');
});
t('scoliose : angle, apex, convexité, types', () => {
  let a = A('montre une scoliose de 40 degrés'); assert.equal(a.type, 'scoliose'); assert.equal(a.cobb, 40);
  a = A('simule une scoliose thoracique droite de 35 degrés sommet T8'); assert.equal(a.cobb, 35); assert.equal(a.apex, 'T8'); assert.equal(a.preset, 'thoracique-droite');
  a = A('affiche une scoliose en S'); assert.equal(a.preset, 'double-majeure');
  a = A('scoliose lombaire convexe à gauche de 28°'); assert.equal(a.convexite, 'G'); assert.equal(a.cobb, 28);
  assert.equal(A('montre une scoliose sévère').preset, 'severe');
  assert.equal(A("c'est quoi la scoliose"), null);
});
t('fractures', () => {
  const fr = f => { const a = A(f); return a && a.type === 'fracture' ? a.id + ':' + (a.cote || '') : null; };
  assert.equal(fr('simule une fracture du col du fémur'), 'col-femoral:');
  assert.equal(fr('montre une fracture de la clavicule droite'), 'clavicule-tiers-moyen:D');
  assert.equal(fr('affiche une fracture du radius'), 'radius-distal-pouteau-colles:');
  assert.equal(fr('montre une fracture de Pouteau-Colles'), 'radius-distal-pouteau-colles:');
  assert.equal(fr("montre une fracture de l'humérus"), 'humerus-diaphyse:');
  assert.equal(fr('simule une fracture tibia péroné'), 'tibia-fibula-diaphyse:');
  assert.equal(fr('montre un tassement vertébral'), 'tassement-l1:');
  assert.equal(fr('affiche une fracture explosion'), 'explosion-l1:');
  assert.equal(fr('montre une fracture de la cheville'), 'malleole-weber-b:');
  assert.equal(A("c'est quoi une fracture"), null);
});
t('appareillages et matériaux', () => {
  let a = A('mets une prothèse'); assert.equal(a.type, 'appareil');
  a = A('affiche une prothèse trans-tibiale à droite'); assert.equal(a.type, 'appareil'); assert.equal(a.niveau, 'transtibiale'); assert.equal(a.cote, 'D');
  a = A('montre un corset de Chêneau'); assert.equal(a.modele, 'corset-cheneau');
  a = A('mets un corset'); assert.equal(a.type, 'appareil'); assert.equal(a.niveau, null);
  a = A('affiche un corset de Boston'); assert.equal(a.modele, 'corset-boston');
  a = A('mets un corset de Jewett'); assert.equal(a.modele, 'corset-jewett');
  a = A("mets l'emboîture en carbone"); assert.equal(a.type, 'materiau'); assert.equal(a.composant, 'emboiture'); assert.equal(a.materiau, 'carbone');
  a = A('le manchon en silicone'); assert.equal(a.type, 'materiau'); assert.equal(a.materiau, 'silicone');
  a = A('corset en PA6'); assert.equal(a.type, 'materiau'); assert.equal(a.materiau, 'pa6');
  a = A('pylône en titane'); assert.equal(a.composant, 'pylone'); assert.equal(a.materiau, 'titane');
  assert.equal(type('affiche les points d’appui et les zones de décharge'), 'appuis');
  assert.equal(A('correction de 50 %').valeur, 50);
});
t('retirer et revenir à la normale', () => {
  assert.deepEqual(A("retire l'amputation"), { type: 'retirer', quoi: 'amputation' }); assert.deepEqual(A('enlève la scoliose'), { type: 'retirer', quoi: 'scoliose' });
  assert.deepEqual(A('supprime la fracture'), { type: 'retirer', quoi: 'fracture' }); assert.deepEqual(A('retire la prothèse'), { type: 'retirer', quoi: 'appareil' });
  assert.equal(type("reviens à l'anatomie normale"), 'normal'); assert.equal(type('réinitialise tout le corps'), 'normal');
});
t('points de vue (fenêtre ouverte seulement)', () => {
  assert.equal(A('montre le modèle de dos', 'anatomie').nom, 'dos'); assert.equal(A('vue de profil droit', 'anatomie').nom, 'droite'); assert.equal(type('vue de dos'), null);
});
t('registre : nom → structure, fiches et résumés', () => {
  const f = R.fiche('biceps-brachial:G'); assert.ok(f.champs.some(c => c.label === 'Origine') && f.champs.some(c => c.label === 'Innervation'));
  assert.match(R.resume('biceps-brachial:G', "où s'insère le biceps"), /insertion .*radius/i);
  assert.match(R.resume('humerus:D'), /Humérus droit/);
  assert.ok(R.fiche('humerus:D').champs.find(c => c.label === 'Muscles liés').valeur.some(x => /Deltoïde/.test(x)));
  assert.ok(R.fiche('vertebre-L4').nom.includes('L4'));
  assert.equal(R.nomAffiche('clavicule:G'), 'Clavicule gauche');
});
console.log(ok + ' tests réussis');
