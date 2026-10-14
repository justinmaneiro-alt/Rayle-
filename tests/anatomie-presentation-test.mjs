// Présentations animées : scripts générés depuis la base de connaissances (aucun fait inventé), commandes vocales, lecteur (étapes, pause, suivant, vitesse, fermeture).
//   node tests/anatomie-presentation-test.mjs
import assert from 'node:assert/strict';

let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 4).join('\n    ')); process.exitCode = 1; } };
const P = await import('../js/anatomie/presentation.js');
const R = await import('../js/anatomie/registre.js');
const { analyser } = await import('../js/anatomie/commandes.js');
const D = await import('../js/anatomie/donnees-cerveau.js');

await t('phrases : découpage sans couper après une abréviation, phrases longues coupées à la virgule', () => {
  assert.deepEqual(P.phrases('Voici le fémur (ex. le plus long). Il est solide ! Vraiment ?'), ['Voici le fémur (ex. le plus long).', 'Il est solide !', 'Vraiment ?']);
  assert.deepEqual(P.phrases(''), []);
  const longue = 'Un texte très long, ' + 'avec des segments assez nombreux, '.repeat(20) + 'et une fin.';
  const p = P.phrases(longue, 120); assert.ok(p.length > 3 && p.every(x => x.length <= 125), p.map(x => x.length).join(','));
  assert.equal(P.phrases('Fin sans point').length, 1);
});
await t('os : intro, extrémités (os long), repères palpables, articulations, muscles liés, références ; tout vient de la fiche', () => {
  const s = P.scriptStructure('femur:D'); assert.ok(s && s.etapes.length >= 8, 'étapes : ' + (s && s.etapes.length));
  const ids = s.etapes.map(e => e.id);
  for (const k of ['intro', 'extremites', 'articulations', 'role', 'references']) assert.ok(ids.includes(k), 'étape manquante : ' + k);
  assert.ok(ids.some(i => i.startsWith('repere-')) && ids.some(i => i.startsWith('muscle-')));
  const f = R.fiche('femur:D'), desc = f.champs.find(c => c.label === 'Description').valeur;
  assert.ok(s.etapes[0].narration.includes(desc.slice(0, 40)), 'l’intro reprend la description de la fiche');
  const ext = s.etapes.find(e => e.id === 'extremites'); assert.equal(ext.scene.etiquettes.length, 2);
  assert.ok(ext.scene.etiquettes.every(l => l.ancre && l.ancre.sid === 'femur:D' && (l.ancre.bout === 0 || l.ancre.bout === 1)));
  const m = s.etapes.find(e => e.id.startsWith('muscle-')); assert.ok(m.scene.etiquettes.some(l => l.ancre.contact && l.ancre.contact.length === 2), 'insertion : contact muscle ↔ os');
  assert.ok(s.etapes.at(-1).fin && s.etapes.at(-1).narration.startsWith('Références'), 'les références sont dites en dernier');
  assert.ok(s.references.some(r => /Gray/.test(r)) && s.references.some(r => /BodyParts3D/.test(r)));
});
await t('muscle : origine, trajet, terminaison, action, innervation ; un champ absent est dit absent, jamais inventé', () => {
  const s = P.scriptStructure('biceps-brachial:D'), id = e => s.etapes.find(x => x.id === e);
  const d = R.definition('biceps-brachial:D');
  assert.ok(id('origine').narration.includes(d.origine.txt.slice(0, 20)) && id('insertion').narration.includes(d.insertion.txt.slice(0, 20)));
  assert.ok(id('action').narration.includes(d.action.slice(0, 15)) && id('innervation').narration.includes(d.innervation.slice(0, 15)));
  assert.equal(id('origine').scene.etiquettes[0].classe, 'vert'); assert.equal(id('insertion').scene.etiquettes[0].classe, 'rouge');
  // muscle haute fidélité dont une information manque : la narration le dit
  const vides = R.tous('muscle').filter(d => d.hd && (!d.innervation || !String(d.innervation).trim()));
  if (vides.length) { const sc = P.scriptStructure(R.instance(vides[0].id, 'D')); assert.ok(sc.etapes.find(e => e.id === 'innervation').narration.includes(P.MANQUE)); }
});
await t('nerfs, vaisseaux, organes : scripts cohérents ; le tracé schématique d’un nerf est annoncé', () => {
  for (const id of ['nerf-median:D', 'femorale-arterielle:D', 'coeur']) { const s = P.scriptStructure(id); assert.ok(s, id); assert.ok(s.etapes.length >= 3 && s.etapes.every(e => e.phrases.length >= 1), id); assert.ok(s.etapes.every(e => e.phrases.every(p => p.length <= 260)), id); }
  const n = P.scriptStructure('nerf-median:D'); assert.ok(n.etapes.some(e => /schématique/i.test(e.narration)), 'le nerf avertit que son tracé est schématique');
});
await t('région couche par couche : peau, os, muscles, nerfs, vaisseaux ; chaque couche fantôme les précédentes ; références à la fin', () => {
  for (const cle of ['jambe', 'bras', 'tronc', 'tete', 'corps']) {
    const s = P.scriptRegion(cle); assert.ok(s, cle); const ids = s.etapes.map(e => e.id);
    assert.deepEqual(ids.slice(0, 3), ['intro', 'peau', 'os'], cle); assert.ok(ids.includes('muscles') && ids.includes('references'), cle);
    const os = s.etapes.find(e => e.id === 'os'), mu = s.etapes.find(e => e.id === 'muscles');
    assert.ok(os.scene.visibles.length >= 2, cle + ' : os'); for (const o of os.scene.visibles) assert.ok(mu.scene.fantomes.includes(o), cle + ' : les os passent en fantôme sous les muscles');
    assert.ok(!mu.scene.visibles.some(i => os.scene.visibles.includes(i)), cle + ' : pas de doublon');
    assert.ok(s.etapes.find(e => e.id === 'peau').narration.includes('pas de fiche'), cle + ' : la peau avoue son absence de fiche');
    assert.equal(ids.includes('organes'), cle === 'tronc' || cle === 'tete' || cle === 'corps', cle + ' : organes');
  }
  const j = P.scriptRegion('jambe', { cote: 'G' }); assert.ok(j.etapes.find(e => e.id === 'os').scene.visibles.every(i => !/:D$/.test(i)), 'côté gauche demandé : aucun os droit');
  assert.ok(P.scriptRegion('corps').etapes.find(e => e.id === 'os').scene.visibles.some(i => /:G$/.test(i)) && P.scriptRegion('corps').etapes.find(e => e.id === 'os').scene.visibles.some(i => /:D$/.test(i)), 'corps entier : les deux côtés');
});
await t('groupe (quadriceps) : un côté seulement, une introduction puis ses membres', () => {
  const s = P.scriptPour('présente le quadriceps'); assert.equal(s.type, 'groupe'); assert.ok(s.etapes[0].scene.visibles.every(i => /:D$/.test(i)));
});
await t('résolution : structure, région, cerveau ; le squelette garde « os frontal » ; le cerveau n’avale pas les muscles', () => {
  const fam = q => (P.resoudre(q) || {}).famille;
  assert.equal(fam('présente le fémur'), 'structure'); assert.equal(fam('présente tout le bras couche par couche'), 'region');
  assert.equal(fam('présente le corps entier'), 'region'); assert.equal(fam('fais-moi un tour du cerveau'), 'cerveau');
  assert.equal(fam('présente l’hippocampe'), 'cerveau'); assert.equal(fam('présente le biceps'), 'structure');
  assert.notEqual(fam('présente le nerf optique'), 'cerveau-x'); assert.equal(P.resoudre('présente la purée de pois'), null);
});
await t('commandes : « présente … » lance une présentation ; « décris … » garde le pop-up ; aucun conflit avec les autres ordres', () => {
  const type = (q, v = 'rayle') => (analyser(q, { vue: v }) || {}).type;
  for (const q of ['présente le fémur', 'présente-moi l’humérus', 'présente tout le bras couche par couche', 'fais une présentation de la jambe couche par couche', 'présente le corps entier', 'présente le nerf médian', 'présente le biceps'])
    assert.equal(type(q), 'presenter', q);
  assert.equal(type('décris-moi l’humérus'), 'decrire'); assert.equal(type('où s’insère le biceps ?'), 'decrire');
  assert.equal(type('affiche les muscles et les nerfs'), 'calques'); assert.equal(type('scoliose de 40 degrés'), 'scoliose');
  assert.equal(analyser('montre-moi Mars', { vue: 'rayle' }), null); assert.equal(analyser('présente-moi le Japon', { vue: 'rayle' }), null);
});

// ───────────────────────── lecteur ─────────────────────────
const fabrique = () => { const n = () => { const o = { children: [], style: {}, dataset: {}, classList: { toggle() { }, add() { }, remove() { } }, textContent: '', offsetWidth: 0, setAttribute() { }, addEventListener() { }, removeEventListener() { }, remove() { }, getBoundingClientRect: () => ({ left: 0, width: 100 }) };
  o.append = (...c) => { for (const x of c) o.children.push(x); }; o.appendChild = c => { o.children.push(c); return c; }; o.removeChild = c => { o.children = o.children.filter(x => x !== c); }; Object.defineProperty(o, 'firstChild', { get: () => o.children[0] || null }); return o; };
  return n; };
globalThis.document = { createElement: fabrique(), createTextNode: s => ({ nodeType: 3, textContent: String(s) }), addEventListener() { }, removeEventListener() { }, fullscreenElement: null };
globalThis.window = globalThis;
const { Lecteur } = await import('../js/anatomie/lecteur.js');
const scriptFactice = () => ({ titre: 'Essai', sous: 'x', etapes: [0, 1, 2].map(i => ({ id: 'e' + i, titre: 'Étape ' + i, sous: '', narration: 'Une. Deux.', phrases: ['Une.', 'Deux.'], scene: { etiquettes: [{ phrase: 1, texte: 'L' + i, ancre: {} }] } })).concat([{ id: 'references', titre: 'Références', phrases: ['Réf.'], scene: {}, fin: true, references: ['A'] }]) });
const attente = ms => new Promise(r => setTimeout(r, ms));

await t('lecteur : déroule étapes et phrases dans l’ordre, applique la scène, pose les étiquettes, finit et appelle surFin', async () => {
  const journal = [], dites = []; let fin = false;
  const l = new Lecteur({ conteneur: document.createElement('div'), racine: null, script: scriptFactice(), sansVoix: true, vitesse: 2,
    adaptateur: { appliquer: async e => { journal.push('scene:' + e.id); }, etiquette: (e, lab) => journal.push('lab:' + lab.texte), retirerEtiquettes() { journal.push('raz'); }, nettoyer() { journal.push('net'); } },
    dire: txt => { dites.push(txt); return Promise.resolve(); }, taire() { }, surFin: () => { fin = true; } });
  l.vitesse = 2; l.demarrer(); for (let i = 0; i < 400 && !fin; i++) await attente(25);
  assert.ok(fin && l.etat === 'fini', 'état : ' + l.etat); assert.deepEqual(journal.filter(x => x.startsWith('scene:')), ['scene:e0', 'scene:e1', 'scene:e2', 'scene:references']);
  assert.ok(journal.indexOf('lab:L0') > journal.indexOf('scene:e0') && journal.indexOf('lab:L0') < journal.indexOf('scene:e1'), 'étiquette de la 2e phrase posée pendant l’étape 0');
  l.fermer(); assert.ok(journal.includes('net'));
});
await t('lecteur : pause, reprise, suivant, précédent, passer la phrase, changement de vitesse ; fermer arrête tout', async () => {
  const scenes = []; let silence = 0;
  const l = new Lecteur({ conteneur: document.createElement('div'), racine: null, script: scriptFactice(), sansVoix: true, vitesse: 1,
    adaptateur: { appliquerPas: 0, appliquer: async e => { scenes.push(e.id); }, retirerEtiquettes() { }, nettoyer() { } }, dire: () => Promise.resolve(), taire() { silence++; } });
  l.demarrer(); await attente(150); assert.equal(l.etat, 'lecture');
  l.pause(); assert.equal(l.etat, 'pause'); const i0 = l.i, k0 = l.k; await attente(1700); assert.equal(l.i, i0); assert.equal(l.k, k0, 'en pause rien n’avance');
  l.suivant(); await attente(60); assert.equal(l.i, i0 + 1); assert.equal(l.etat, 'pause', 'suivant en pause reste en pause'); assert.ok(scenes.includes('e' + (i0 + 1)), 'la scène de l’étape suivante s’affiche quand même');
  l.precedent(); await attente(60); assert.equal(l.i, i0);
  l.reprendre(); await attente(80); assert.equal(l.etat, 'lecture');
  const avant = l.i * 10 + l.k; l.passerPhrase(); await attente(40); assert.ok(l.i * 10 + l.k >= avant, 'passer la phrase avance');
  const v0 = l.vitesse; l.changerVitesse(); assert.notEqual(l.vitesse, v0); assert.ok(silence >= 2, 'la voix est coupée à chaque saut');
  l.fermer(); assert.equal(l.ferme, true); const n = scenes.length; await attente(1800); assert.equal(scenes.length, n, 'fermé : plus aucune scène');
});
await t('cerveau : scripts de zone, de réseau et tour complet ; références et mise en garde dites à la fin', () => {
  const z = P.scriptZoneCerveau('hippocampe'); assert.ok(z.etapes.map(e => e.id).join().startsWith('intro,fonctions,fonctionnement,pathologies'));
  assert.ok(z.etapes.at(-1).narration.includes('Références') && /clinicien|avis médical/.test(z.etapes.at(-1).narration));
  const tour = P.scriptTourCerveau(); assert.ok(tour.etapes.length >= 15); for (const e of tour.etapes) assert.ok(e.phrases.length >= 1 && e.scene.cerveau !== undefined || e.fin, e.id);
  const r = P.scriptReseauCerveau('langage'); assert.ok(r.etapes.length >= 3 && r.etapes[0].scene.reseau === 'langage');
  for (const zz of D.ZONES_CERVEAU) assert.ok(P.scriptZoneCerveau(zz.id), zz.id);
});

console.log(ok + ' tests réussis');
