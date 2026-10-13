// Mode par lots, « Ouvrir un document » (sans mémoriser) et mémoire des cours par lots, avec un FAUX Drive, un FAUX sélecteur et un FAUX DOM :   node tests/drive-lots-test.mjs
import assert from 'node:assert/strict';
import { FauxDrive, FauxGoogleDoc } from './lib-drive.mjs';
import { MIME } from '../js/drive/api.js';
import { baseMemoire } from '../js/drive/base-locale.js';
import { demanderSuite, phraseLot } from '../js/drive/lot.js';

let ok = 0;
const t = async (nom, f) => { try { await f(); ok++; console.log('  ✔', nom); } catch (e) { console.log('  ✘', nom, '\n   ', e.stack.split('\n').slice(0, 5).join('\n    ')); process.exitCode = 1; } };
const DOSSIER = 'application/vnd.google-apps.folder';
const AJOUTER = 'Ajouter d’autres documents', TERMINER = 'Terminer';

/* ───── faux DOM minimal ───── */
function fauxDoc() {
  const mk = tag => {
    const e = { tag, className: '', textContent: '', children: [], ecouteurs: {}, attrs: {}, parent: null,
      append(...c) { for (const x of c) { x.parent = e; e.children.push(x); } }, get lastChild() { return e.children[e.children.length - 1]; },
      setAttribute(k, v) { e.attrs[k] = v; }, addEventListener(n, f) { (e.ecouteurs[n] = e.ecouteurs[n] || []).push(f); }, focus() {},
      remove() { if (e.parent) e.parent.children = e.parent.children.filter(x => x !== e); }, click() { (e.ecouteurs.click || []).forEach(f => f({})); } };
    return e;
  };
  const ecout = {};
  const doc = { body: mk('body'), head: { appendChild(s) { queueMicrotask(() => s.onload && s.onload()); } }, createElement: mk,
    addEventListener(n, f) { (ecout[n] = ecout[n] || []).push(f); }, removeEventListener(n, f) { ecout[n] = (ecout[n] || []).filter(x => x !== f); },
    touche(key) { (ecout.keydown || []).forEach(f => f({ key, stopPropagation() {} })); } };
  doc.trouver = (txt, e = doc.body) => (e.textContent === txt ? e : e.children.map(c => doc.trouver(txt, c)).find(Boolean));
  const msg = e => (e.className === 'dr-lot-msg' ? e.textContent : e.children.map(msg).find(Boolean));
  doc.texteBoite = () => msg(doc.body);
  return doc;
}

await t('boîte de lot : phrase « X documents ajoutés au total, en ajouter d’autres ? », deux boutons, Échap = Terminer, nettoyage', async () => {
  assert.equal(phraseLot(1), '1 document ajouté au total, en ajouter d’autres ?'); assert.equal(phraseLot(7), '7 documents ajoutés au total, en ajouter d’autres ?');
  const doc = fauxDoc(); let p = demanderSuite({ total: 3, doc });
  assert.equal(doc.texteBoite(), '3 documents ajoutés au total, en ajouter d’autres ?'); assert.ok(doc.trouver(AJOUTER) && doc.trouver(TERMINER));
  doc.trouver(AJOUTER).click(); assert.equal(await p, true); assert.equal(doc.body.children.length, 0, 'boîte retirée');
  p = demanderSuite({ total: 4, doc }); doc.trouver(TERMINER).click(); assert.equal(await p, false);
  p = demanderSuite({ total: 5, doc }); doc.touche('Escape'); assert.equal(await p, false); assert.equal(doc.body.children.length, 0);
});

/* ───── monde complet : index.js avec faux Google ───── */
const doc = fauxDoc(), stock = new Map();
let sequence = [], dialogues = [], vues = [];
globalThis.document = doc;
globalThis.localStorage = { getItem: k => (stock.has(k) ? stock.get(k) : null), setItem: (k, v) => stock.set(k, String(v)), removeItem: k => stock.delete(k) };
globalThis.RAYLE_DRIVE_CONFIG = { clientId: '123456789012-abcdefghij.apps.googleusercontent.com', appId: '123456789012', apiKey: '' };
globalThis.RayleBus = { fusion() {}, emit() {}, demander() {} };
stock.set('rayle_drive_connecte', '1');
const drive = new FauxDrive();
for (const [id, nom] of [['d1', 'Anatomie 1'], ['d2', 'Anatomie 2'], ['d3', 'Physio']]) drive.ajouter(id, { name: nom, mimeType: MIME.gdoc, parents: [] }, new FauxGoogleDoc([{ texte: nom, style: 'HEADING_1' }, { texte: 'Texte de ' + nom + ' à copier.' }]));
globalThis.fetch = drive.fetch;

/** « l'utilisateur » : après chaque validation du sélecteur, répond à la boîte de lot avec le bouton prévu */
function repondreAuxBoites() {
  const d = dialogues[0]; if (!d) return;
  const msg = doc.texteBoite(); if (!msg) { setTimeout(repondreAuxBoites, 1); return; }
  dialogues.shift(); d.vu = msg; doc.trouver(d.bouton).click();
}
const P = { ViewId: { DOCS: 'docs' }, Feature: { MULTISELECT_ENABLED: 'multi' }, Action: { PICKED: 'picked', CANCEL: 'cancel' }, Response: { ACTION: 'action', DOCUMENTS: 'docs' }, Document: { ID: 'id', NAME: 'name', MIME_TYPE: 'mimeType' }, DocsViewMode: { LIST: 'l' } };
P.DocsView = class { setMimeTypes() { return this; } setIncludeFolders() { return this; } setSelectFolderEnabled() { return this; } setMode() { return this; } setOwnedByMe() { return this; } };
P.PickerBuilder = class {
  constructor() { this.o = { multi: false }; vues.push(this.o); }
  addView() { return this; } enableFeature() { this.o.multi = true; return this; } setOAuthToken() { return this; } setLocale() { return this; } setTitle() { return this; } setAppId() { return this; } setSize() { return this; }
  setCallback(cb) { this.cb = cb; return this; }
  build() { return { setVisible: () => setTimeout(() => { const rep = sequence.shift(); this.cb(rep ? { action: 'picked', docs: rep } : { action: 'cancel' }); setTimeout(repondreAuxBoites, 1); }, 1) }; }
};
globalThis.gapi = { load: (n, o) => o.callback() };
globalThis.google = { picker: P, accounts: { oauth2: { initTokenClient: o => ({ requestAccessToken: () => setTimeout(() => o.callback({ access_token: 'jeton-1', expires_in: 3600 }), 0) }), revoke: (tk, cb) => cb() } } };
const idx = await import('../js/drive/index.js');
idx._injecterBase(baseMemoire());
const f = (id, nom, mimeType = MIME.gdoc) => ({ id, name: nom, mimeType });
const repondre = (...boutons) => { dialogues = boutons.map(bouton => ({ bouton })); return [...dialogues]; };
const memorises = () => JSON.parse(stock.get('rayle_drive_fichiers') || '[]');

await t('lots : le sélecteur se rouvre à chaque « Ajouter d’autres documents », compte cumulé, jamais de doublon, dossiers écartés', async () => {
  sequence = [[f('d1', 'Anatomie 1'), f('d2', 'Anatomie 2'), f('dos', 'Un dossier', DOSSIER)], [f('d2', 'Anatomie 2'), f('d3', 'Physio')]];
  const lus = repondre(AJOUTER, TERMINER);
  const r = await idx.choisirDocuments();
  assert.equal(r.ok, true); assert.deepEqual(lus.map(d => d.vu), ['2 documents ajoutés au total, en ajouter d’autres ?', '3 documents ajoutés au total, en ajouter d’autres ?']);
  assert.deepEqual(memorises().map(x => x.id).sort(), ['d1', 'd2', 'd3'], 'trois documents, d2 une seule fois, aucun dossier');
  assert.match(r.dit, /3 documents/); assert.equal(vues.length, 2); assert.ok(vues.every(v => v.multi), 'multi-sélection activée à chaque lot');
});
await t('lots illimités : cinq lots d’affilée, puis « Terminer »', async () => {
  stock.set('rayle_drive_fichiers', '[]'); vues = [];
  sequence = [[f('d1', 'A')], [f('d2', 'B')], [f('d3', 'C')], [f('d1', 'A')], [f('d2', 'B')]]; repondre(AJOUTER, AJOUTER, AJOUTER, AJOUTER, TERMINER);
  await idx.choisirDocuments(); assert.equal(vues.length, 5); assert.equal(memorises().length, 3);
});
await t('annulation du sélecteur au 2e lot : le 1er lot reste ajouté', async () => {
  stock.set('rayle_drive_fichiers', '[]'); sequence = [[f('d1', 'Anatomie 1')], null]; repondre(AJOUTER);
  const r = await idx.choisirDocuments(); assert.equal(r.ok, true); assert.equal(memorises().length, 1);
});
await t('« Ouvrir un document » : un seul document, lecture seule, SANS entrer dans la liste ni dans la mémoire des cours', async () => {
  stock.set('rayle_drive_fichiers', '[]'); vues = []; sequence = [[f('d3', 'Physio')]];
  const r = await idx.ouvrirUnDocument();
  assert.equal(r.ok, true); assert.match(r.dit, /Physio/); assert.match(r.dit, /pas ajouté/);
  assert.equal(vues[0].multi, false, 'un seul document'); assert.deepEqual(memorises(), [], 'jamais dans la liste des autorisés');
  const s = idx.statut(); assert.equal(s.nom, 'Physio'); assert.equal(s.lectureSeule, true); assert.equal(s.fichiers, 0);
  assert.equal((await idx.coursResume()).documents, 0, 'jamais dans la mémoire des cours');
});
await t('« Ouvrir un document » : annulation sans effet ; aucune écriture possible vers le Drive', async () => {
  sequence = [null]; assert.match((await idx.ouvrirUnDocument()).dit, /Aucun document choisi/);
  sequence = [[f('d1', 'Anatomie 1')]]; const avant = drive.journal.length; await idx.ouvrirUnDocument();
  await idx.executer({ op: 'modifier', type: 'remplacer', cible: { n: 1 }, texte: 'x' });
  assert.ok(!drive.journal.slice(avant).some(j => j.methode !== 'GET'), 'aucune requête d’écriture');
  assert.deepEqual(memorises(), []);
});
await t('mémoire des cours par lots : lots cumulés, document déjà en mémoire ni relu ni doublé, bilan cumulé, annulation sans effet', async () => {
  vues = []; sequence = [[f('d1', 'Anatomie 1'), f('d2', 'Anatomie 2'), f('dos', 'Dossier', DOSSIER)], [f('d2', 'Anatomie 2'), f('d3', 'Physio')]];
  const lus = repondre(AJOUTER, TERMINER);
  const avant = drive.journal.length; const r = await idx.analyserCours();
  assert.equal(r.ok, true); assert.deepEqual(lus.map(d => d.vu), ['2 documents ajoutés au total, en ajouter d’autres ?', '3 documents ajoutés au total, en ajouter d’autres ?']);
  assert.equal(r.documents, 3); assert.equal(r.nouveaux, 3, 'd2 repris au 2e lot : inchangé, pas recompté'); assert.equal(r.inchanges, 1); assert.match(r.dit, /^3 documents en mémoire/);
  assert.ok(vues.every(v => v.multi));
  const exports = drive.journal.slice(avant).filter(j => /alt=media|\/export|\/documents\//.test(j.url)).length; assert.equal(exports, 3, 'chaque document est lu une seule fois');
  assert.equal((await idx.coursResume()).documents, 3);
  sequence = [null]; const r2 = await idx.analyserCours(); assert.equal(r2.annule, true); assert.equal((await idx.coursResume()).documents, 3);
});
console.log(`${ok} tests réussis`);
setTimeout(() => process.exit(process.exitCode || 0), 50);
