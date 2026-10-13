// Mémoire des cours (js/drive/memoire.js + base-locale.js) contre la FAUSSE API Drive :   node tests/drive-memoire-test.mjs
// Vérifie : dossiers et sous-dossiers parcourus, progression « X sur Y », bilan (nombre, taille), resynchronisation sans relecture inutile,
// modifiés / nouveaux / supprimés, erreurs isolées, coupure de connexion sans base à moitié écrite, oubli complet, dossiers invisibles (drive.file).
import assert from 'node:assert/strict';
import { FauxDrive, FauxGoogleDoc, FauxJSZip, octetsDocx } from './lib-drive.mjs';
import { creerApi, ErreurDrive, MIME } from '../js/drive/api.js';
import { creerMemoire, resumeBilan, taille, MIME_DOSSIER } from '../js/drive/memoire.js';
import { baseMemoire } from '../js/drive/base-locale.js';

let ok = 0;
const t = async (nom, f) => { try { await f(); ok++; console.log('  ✔', nom); } catch (e) { console.log('  ✘', nom, '\n   ', e.stack.split('\n').slice(0, 5).join('\n    ')); process.exitCode = 1; } };

const XML = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Le tibia est l’os de la jambe.</w:t></w:r></w:p></w:body></w:document>';
async function monde({ jeton = async () => 'jeton-1' } = {}) {
  const drive = new FauxDrive();
  drive.ajouter('cours', { name: 'Cours', mimeType: MIME_DOSSIER });
  drive.ajouter('anat', { name: 'Anatomie', mimeType: MIME_DOSSIER, parents: ['cours'] });
  drive.ajouter('profond', { name: 'Membres', mimeType: MIME_DOSSIER, parents: ['anat'] });
  drive.ajouter('g1', { name: 'Introduction', mimeType: MIME.gdoc, parents: ['cours'] }, new FauxGoogleDoc([{ texte: 'Introduction', style: 'HEADING_1' }, { texte: 'Le corps humain compte 206 os.' }]));
  drive.ajouter('t1', { name: 'Fiche os.txt', mimeType: MIME.txt, parents: ['anat'] }, 'Le fémur est l’os le plus long.\n\nLe tibia est en dessous.');
  drive.ajouter('w1', { name: 'Membres inférieurs', mimeType: MIME.docx, parents: ['profond'] }, await octetsDocx(XML));
  drive.ajouter('img', { name: 'schema.png', mimeType: 'image/png', parents: ['cours'] }, 'xx');
  drive.ajouter('solo', { name: 'Notes libres', mimeType: MIME.md, parents: [] }, '# Notes\n\nUne note à part.');
  const api = creerApi({ jeton, fetch: drive.fetch });
  const base = baseMemoire(); let horloge = 1760000000000;
  const memoire = creerMemoire({ api, base, env: { zip: async () => FauxJSZip }, maintenant: () => horloge++ });
  const lectures = () => drive.journal.filter(j => /alt=media|\/export|\/documents\//.test(j.url) && !/:batchUpdate/.test(j.url)).length;
  return { drive, api, base, memoire, lectures };
}
const CHOIX = [{ id: 'cours', name: 'Cours', mimeType: MIME_DOSSIER }, { id: 'solo', name: 'Notes libres', mimeType: MIME.md }];

await t('analyse : dossiers et sous-dossiers parcourus, fichier isolé lu, type non pris en charge ignoré, progression « X sur Y »', async () => {
  const m = await monde(), etapes = [];
  const r = await m.memoire.analyser(CHOIX, { progression: p => etapes.push(p) });
  assert.equal(r.ok, true); assert.equal(r.documents, 4); assert.equal(r.nouveaux, 4); assert.equal(r.ignores, 1);
  const lect = etapes.filter(e => e.etape === 'lecture');
  assert.deepEqual(lect.map(e => e.i), [1, 2, 3, 4]); assert.ok(lect.every(e => e.n === 4), 'le total Y est connu avant la lecture');
  assert.ok(etapes.some(e => e.etape === 'exploration' && e.nom === 'Membres'), 'le sous-sous-dossier est parcouru');
  const noms = (await m.memoire.liste()).map(d => d.name).sort();
  assert.deepEqual(noms, ['Fiche os.txt', 'Introduction', 'Membres inférieurs', 'Notes libres']);
  const intro = await m.memoire.document('g1'); assert.match(intro.texte, /206 os/); assert.deepEqual(intro.racines, ['cours']);
  assert.match((await m.memoire.document('w1')).texte, /tibia est l’os de la jambe/);
});
await t('bilan : nombre de documents, caractères et taille en octets cohérents avec la base', async () => {
  const m = await monde(); const r = await m.memoire.analyser(CHOIX);
  const tous = await Promise.all((await m.memoire.liste()).map(d => m.memoire.document(d.id)));
  assert.equal(r.caracteres, tous.reduce((s, d) => s + d.texte.length, 0));
  assert.equal(r.octets, tous.reduce((s, d) => s + Buffer.byteLength(d.texte), 0));
  assert.ok(r.octets > r.caracteres - 1, 'les accents comptent double en octets');
  assert.match(r.dit, /^4 documents en mémoire \(\d+ o, \d+ caractères\) · 4 nouveaux\./);
  const e = await m.memoire.etat(); assert.equal(e.documents, 4); assert.equal(e.racines.length, 2); assert.ok(e.derniere > 0);
});
await t('résumé : accords du pluriel (nouveaux, mis à jour, retirés)', () => {
  const b = { documents: 9, octets: 10, caracteres: 10, nouveaux: 2, modifies: 3, supprimes: 2, inchanges: 1, echecs: [] };
  assert.match(resumeBilan(b), /2 nouveaux, 3 mis à jour, 2 retirés\./); assert.doesNotMatch(resumeBilan(b), /miss|nouveaus/);
  assert.match(resumeBilan({ ...b, nouveaux: 1, modifies: 1, supprimes: 1 }), /1 nouveau, 1 mis à jour, 1 retiré\./);
});
await t('taille() et résumé en français', () => {
  assert.equal(taille(900), '900 o'); assert.equal(taille(2048), '2 Ko'); assert.equal(taille(1572864), '1,5 Mo'); assert.equal(taille(52428800), '50 Mo');
  assert.match(resumeBilan({ documents: 1, octets: 10, caracteres: 10, nouveaux: 0, modifies: 0, supprimes: 0, inchanges: 1, echecs: [] }), /rien n’avait changé/);
});
await t('resynchronisation sans changement : AUCUN contenu relu, seulement les listes et les dates', async () => {
  const m = await monde(); await m.memoire.analyser(CHOIX);
  const avant = m.lectures(), avantPuts = (await m.memoire.etat()).derniere;
  const r = await m.memoire.synchroniser();
  assert.equal(m.lectures(), avant, 'aucun document relu'); assert.equal(r.inchanges, 4); assert.equal(r.nouveaux + r.modifies + r.supprimes, 0);
  assert.match(r.dit, /rien n’avait changé/); assert.ok((await m.memoire.etat()).derniere > avantPuts);
});
await t('synchronisation : seul le document modifié est relu ; un nouveau est ajouté ; un supprimé est retiré', async () => {
  const m = await monde(); await m.memoire.analyser(CHOIX);
  m.drive.fichiers.get('t1').contenu = 'Le fémur est l’os le plus long du corps.'; m.drive.touche('t1');
  m.drive.ajouter('t2', { name: 'Nouvelle fiche.txt', mimeType: MIME.txt, parents: ['profond'] }, 'Le péroné est fin.');
  const avant = m.lectures();
  const r = await m.memoire.synchroniser();
  assert.equal(r.modifies, 1); assert.equal(r.nouveaux, 1);
  assert.equal(m.lectures() - avant, 2, 'relus : le modifié et le nouveau seulement');
  assert.match((await m.memoire.document('t1')).texte, /du corps\./); assert.ok(await m.memoire.document('t2'));
  assert.match(r.dit, /1 nouveau, 1 mis à jour/);
});
await t('un fichier supprimé du dossier disparaît de la base ; un fichier encore atteint par une autre racine reste', async () => {
  const m = await monde(); await m.memoire.analyser(CHOIX);
  m.drive.fichiers.get('t1').meta.parents = [];                              // sorti du dossier
  let r = await m.memoire.synchroniser(); assert.equal(r.supprimes, 1); assert.equal(await m.memoire.document('t1'), undefined); assert.equal((await m.memoire.etat()).documents, 3);
  // même document atteint par deux racines : retirer une racine ne le supprime pas
  const m2 = await monde(); m2.drive.fichiers.get('solo').meta.parents = ['anat'];
  await m2.memoire.analyser(CHOIX); assert.deepEqual((await m2.memoire.document('solo')).racines.sort(), ['cours', 'solo']);
  assert.equal((await m2.memoire.etat()).documents, 4, 'pas de doublon');
});
await t('relire : tout est relu depuis le Drive, même sans changement', async () => {
  const m = await monde(); await m.memoire.analyser(CHOIX); const avant = m.lectures();
  const r = await m.memoire.relire(); assert.equal(m.lectures() - avant >= 4, true); assert.equal(r.modifies, 4); assert.equal(r.documents, 4);
});
await t('erreur sur UN document : notée, les autres sont mémorisés, l’ancienne version est conservée', async () => {
  const m = await monde(); m.drive.pannesFichiers.set('t1', { statut: 403, message: 'accès refusé', raison: 'forbidden' });
  const r = await m.memoire.analyser(CHOIX);
  assert.equal(r.ok, true); assert.equal(r.documents, 3); assert.equal(r.echecs.length, 1); assert.equal(r.echecs[0].nom, 'Fiche os.txt');
  assert.match(r.dit, /1 document non lu : « Fiche os\.txt »/);
  m.drive.pannesFichiers.delete('t1'); await m.memoire.synchroniser(); assert.equal((await m.memoire.etat()).documents, 4, 'repris à la synchronisation suivante');
  m.drive.fichiers.get('t1').contenu = 'texte révisé'; m.drive.touche('t1'); m.drive.pannesFichiers.set('t1', { statut: 500, message: 'panne', raison: 'backendError' });
  const r2 = await m.memoire.synchroniser(); assert.equal(r2.echecs.length, 1); assert.match((await m.memoire.document('t1')).texte, /fémur/, 'ancienne version gardée');
});
await t('coupure de connexion Google : l’analyse s’interrompt, rien de faux n’est enregistré, la base d’avant reste intacte', async () => {
  const m = await monde(); await m.memoire.analyser(CHOIX);
  let appels = 0; const api2 = creerApi({ jeton: async () => { if (++appels > 3) throw new ErreurDrive('reconnexion', { raison: 'reconnexion' }); return 'jeton-1'; }, fetch: m.drive.fetch });
  const mem2 = creerMemoire({ api: api2, base: m.base, env: { zip: async () => FauxJSZip } });
  m.drive.touche('g1'); m.drive.touche('t1');
  await assert.rejects(() => mem2.synchroniser(), e => e.raison === 'reconnexion');
  assert.equal((await mem2.etat()).documents, 4); assert.equal((await mem2.etat()).enCours, false, 'le verrou est libéré');
  const r = await mem2.synchroniser().catch(() => null); assert.equal(r, null, 'toujours coupé');
  appels = -100; assert.equal((await mem2.synchroniser()).ok, true, 'puis tout repart');
});
await t('oublier : base et racines effacées, Drive intact, la synchro dit qu’il n’y a rien', async () => {
  const m = await monde(); await m.memoire.analyser(CHOIX);
  const r = await m.memoire.oublier(); assert.equal(r.ok, true); assert.equal(r.documents, 4); assert.match(r.dit, /J’ai oublié 4 cours/); assert.match(r.dit, /Drive n’a pas été touché/);
  assert.equal((await m.memoire.etat()).documents, 0); assert.deepEqual((await m.memoire.etat()).racines, []);
  const s = await m.memoire.synchroniser(); assert.equal(s.ok, false); assert.equal(s.vide, true);
  assert.equal(m.drive.journal.filter(j => j.methode !== 'GET').length, 0, 'aucune écriture sur le Drive');
  assert.match((await m.memoire.oublier()).dit, /déjà vide/);
});
await t('dossier dont le contenu est invisible (accès drive.file) : dit clairement, sans prétendre avoir lu quoi que ce soit', async () => {
  const m = await monde(); m.drive.dossiersOpaques.add('cours');
  const r = await m.memoire.analyser([{ id: 'cours', name: 'Cours', mimeType: MIME_DOSSIER }]);
  assert.equal(r.ok, true); assert.equal(r.documents, 0); assert.deepEqual(r.dossiersVides, ['Cours']);
  assert.match(r.dit, /Sans document visible|sans document visible/); assert.match(r.dit, /drive\.file/);
});
await t('verrou : deux analyses en même temps → la seconde est refusée proprement ; oublier aussi pendant l’analyse', async () => {
  const m = await monde(); let lacher; const bloque = new Promise(r => { lacher = r; });
  const api = creerApi({ jeton: async () => 'jeton-1', fetch: async (u, o) => { if (/alt=media|documents/.test(u)) await bloque; return m.drive.fetch(u, o); } });
  const mem = creerMemoire({ api, base: m.base, env: { zip: async () => FauxJSZip } });
  const premiere = mem.analyser(CHOIX);
  await new Promise(r => setTimeout(r, 20));
  assert.equal((await mem.synchroniser()).occupe, true); assert.equal((await mem.oublier()).occupe, true); assert.equal((await mem.relire()).occupe, true);
  lacher(); assert.equal((await premiere).ok, true);
});
await t('pagination des dossiers de plus de 200 éléments (pages de 2 ici) et sous-dossiers en cycle sans boucle infinie', async () => {
  const m = await monde(); m.drive.taillePage = 2;
  for (let k = 0; k < 5; k++) m.drive.ajouter('p' + k, { name: 'Page ' + k + '.txt', mimeType: MIME.txt, parents: ['cours'] }, 'texte ' + k);
  m.drive.fichiers.get('cours').meta.parents = ['profond'];                    // cycle : Cours ⊂ Membres ⊂ Anatomie ⊂ Cours
  const r = await m.memoire.analyser([{ id: 'cours', name: 'Cours', mimeType: MIME_DOSSIER }]);
  assert.equal(r.documents, 3 + 5);
});
await t('racine inaccessible (404) : notée, les autres racines sont lues', async () => {
  const m = await monde();
  const r = await m.memoire.analyser([{ id: 'fantome', name: 'Cours supprimé', mimeType: MIME.gdoc }, ...CHOIX]);
  assert.equal(r.documents, 4); assert.equal(r.echecs.length, 1); assert.equal(r.echecs[0].nom, 'Cours supprimé');
});
await t('aucun choix et aucune racine : message clair, pas de plantage', async () => {
  const m = await monde(); const r = await m.memoire.analyser([]); assert.equal(r.ok, false); assert.match(r.dit, /Aucun document ni dossier choisi/);
});
await t('la base est copiée à l’écriture (aucune référence partagée) et vidable table par table', async () => {
  const b = baseMemoire(); const o = { id: 'a', texte: 'x' }; await b.put('docs', o); o.texte = 'modifié'; assert.equal((await b.get('docs', 'a')).texte, 'x');
  await b.put('meta', { cle: 'k', valeur: 1 }); await b.vider('docs'); assert.equal((await b.tout('docs')).length, 0); assert.equal((await b.get('meta', 'k')).valeur, 1);
});
console.log(`${ok} tests réussis`);
