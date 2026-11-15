/* Test de la synchronisation entre deux appareils à travers le Worker (SQLite réel, fetch simulé). node trader-pro/tests/sync-test.mjs */
import fs from 'node:fs'; import path from 'node:path'; import { DatabaseSync } from 'node:sqlite';
import { creerPortefeuille, diff, fusionner } from '../portefeuille/stockage.js';
import { traiter } from '../worker/src/coeur.js';
import { depotD1, d1DepuisSqlite } from '../worker/src/depot-d1.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const env = { PORTEFEUILLE_CODE: 'code-de-test-123456', ORIGINES: 'https://justinmaneiro-alt.github.io' };
const depot = depotD1(d1DepuisSqlite(new DatabaseSync(':memory:')));
let enPanne = false; const requetes = [];
const fetchWorker = async (url, opts = {}) => { requetes.push((opts.method || 'GET') + ' ' + new URL(url).pathname); if (enPanne) throw new Error('réseau coupé'); return traiter(new Request(url, { method: opts.method, headers: opts.headers, body: opts.body }), env, depot); };
const appareil = (code = 'code-de-test-123456', avecWorker = true) => { const m = new Map(); const stockage = { async lire(k) { return m.get(k) || null; }, async ecrire(k, v) { m.set(k, JSON.parse(JSON.stringify(v))); } }; return creerPortefeuille({ stockage, fetchFn: fetchWorker, conn: () => (avecWorker ? { url: 'https://w.test', code } : null) }); };

const csv = n => 'Instrument;Ticker;Category;Type;Volume;Open Price;Open Time (UTC);Close Price;Close Time (UTC);Product;Profit/Loss;Gross Profit;Purchase Value;Sale Value;Stop Loss;Take Profit;Commission;Margin;Swap;Rollover;Open Conversion Rate;Close Conversion Rate;Close Origin;Position ID;Comment\n'
  + Array.from({ length: n }, (_, i) => `GOLD;GOLD;CFD;BUY;0,01;4000,5;02.01.2026 ${String(10 + (i % 10)).padStart(2, '0')}:00:00;4010,25;03.01.2026 11:30:00;My Trades;9,10;9,75;;;3990;;0;40,5;-0,65;0;;;Android;${200000000 + i};`).join('\n');
const fichier = n => [{ nom: 'historique.csv', octets: new TextEncoder().encode(csv(n)) }];

const A = appareil(), B = appareil(), C = appareil('mauvais-code'), Local = appareil('', false);
/* A importe 40 positions */
let r = await A.importer(fichier(40)); v(r.nouvelles.fermees === 40 && r.modifiees.fermees === 0 && r.synchro.ok === true, 'A : 40 nouvelles positions envoyées au Worker'); v((await A.charger()).fermees.length === 40, 'A : copie locale complète');
/* B se synchronise : retrouve tout */
let s = await B.synchroniser(); v(s.ok && s.fermees.length === 40 && s.recu.fermees === 40, 'B : récupère les 40 positions importées sur A'); v(s.sync.rev === 1, 'B : révision 1 connue');
/* même fichier réimporté depuis B : rien de nouveau */
r = await B.importer(fichier(40)); v(r.nouvelles.fermees === 0 && r.inchangees.fermees === 40, 'B : réimporter le même fichier ne crée aucun doublon'); v((await B.charger()).fermees.length === 40, 'B : toujours 40');
/* B importe 45 (5 de plus) : seules 5 partent, A les récupère */
requetes.length = 0; r = await B.importer(fichier(45)); v(r.nouvelles.fermees === 5 && r.synchro.ok, 'B : 5 nouvelles positions'); s = await A.synchroniser(); v(s.fermees.length === 45 && s.recu.fermees <= 6, 'A : récupère seulement le delta (' + s.recu.fermees + ')');
/* mauvais code : refus, la copie locale reste utilisable */
s = await C.synchroniser(); v(!s.ok && s.statut === 401, 'mauvais code : refus 401'); r = await C.importer(fichier(3)); v(r.nouvelles.fermees === 3 && r.synchro.ok === false, 'mauvais code : l’import reste local, signalé non synchronisé');
/* appareil sans Worker : tout en local */
r = await Local.importer(fichier(10)); v(r.nouvelles.fermees === 10 && r.synchro.horsConfig, 'sans Worker : import local'); s = await Local.synchroniser(); v(!s.ok && s.horsConfig, 'sans Worker : la synchronisation dit pourquoi');
/* hors ligne puis retour du réseau : l'import attend puis part */
enPanne = true; r = await A.importer(fichier(50)); v(r.nouvelles.fermees === 5 && r.synchro.ok === false, 'hors ligne : 5 nouvelles gardées sur l’appareil'); v((await A.charger()).sync.enAttente.fermees.length === 5, 'hors ligne : en attente d’envoi');
enPanne = false; s = await A.synchroniser(); v(s.ok && s.sync.enAttente.fermees.length === 0, 'réseau revenu : l’attente part'); s = await B.synchroniser(); v(s.fermees.length === 50, 'B : voit les 50');
/* sauvegarde et restauration */
const sauv = await A.exporter(); v(sauv.fermees.length === 50, 'sauvegarde locale complète'); const D = appareil(); const res = await D.restaurer(sauv); v(res.fermees === 50, 'restauration sur un appareil neuf'); let erreur = null; try { await D.restaurer({ fermees: [], tresorerie: [] }); } catch (e) { erreur = e; } v(erreur, 'restaurer une sauvegarde vide est refusé');
/* réglages et alertes synchronisés */
await A.sauverReglages({ capital: 2000, risquePct: 1 }); s = await B.synchroniser(); v(s.reglages.capital === 2000, 'réglages synchronisés'); await A.sauverAlertes([{ id: 'a1', actif: 'or', sens: 'dessus', niveau: 4000, creeLe: 1, declenchee: null }]); s = await B.synchroniser(); v(s.alertes.length === 1, 'alertes synchronisées');
v(diff([{ id: '1', a: 1 }], [{ id: '1', a: 1 }, { id: '2' }, { id: '1', a: 1 }]).nouvelles.length === 1 && fusionner([{ id: '1', a: 1 }], [{ id: '1', a: 2 }])[0].a === 2, 'diff et fusion');
/* vrai fichier : de A vers B, sans perte */
let zip = null; try { zip = fs.readdirSync('donnees-privees').filter(f => /^\d+_.*\.zip$/.test(f)).map(f => path.join('donnees-privees', f))[0]; } catch (e) { /* */ }
if (zip) {
  const depot2 = depotD1(d1DepuisSqlite(new DatabaseSync(':memory:'))), f2 = (url, o = {}) => traiter(new Request(url, { method: o.method, headers: o.headers, body: o.body }), env, depot2);
  const mk = () => { const m = new Map(); return creerPortefeuille({ stockage: { async lire(k) { return m.get(k) || null; }, async ecrire(k, v) { m.set(k, JSON.parse(JSON.stringify(v))); } }, fetchFn: f2, conn: () => ({ url: 'https://w.test', code: env.PORTEFEUILLE_CODE }) }); };
  const P1 = mk(), P2 = mk(), oct = new Uint8Array(fs.readFileSync(zip)), t0 = Date.now(); const rr = await P1.importer([{ nom: path.basename(zip), octets: oct }]); const ms = Date.now() - t0;
  v(rr.nouvelles.fermees >= 1000 && rr.synchro.ok, 'réel : import du vrai fichier envoyé au Worker (' + rr.nouvelles.fermees + ' positions, ' + rr.nouvelles.tresorerie + ' opérations, ' + ms + ' ms)');
  const s2 = await P2.synchroniser(); v(s2.ok && s2.fermees.length === rr.totaux.fermees && s2.tresorerie.length === rr.totaux.tresorerie, 'réel : le 2e appareil retrouve tout'); const rr2 = await P2.importer([{ nom: path.basename(zip), octets: oct }]); v(rr2.nouvelles.fermees === 0 && rr2.nouvelles.tresorerie === 0, 'réel : réimporter le même fichier = 0 nouvelle ligne');
  const brut = JSON.stringify(await (await f2('https://w.test/sauvegarde', { headers: { 'X-Portefeuille-Code': env.PORTEFEUILLE_CODE } })).json()); v(!brut.includes('52423515'), 'réel : le numéro de compte n’est jamais stocké sur le Worker');
}
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
