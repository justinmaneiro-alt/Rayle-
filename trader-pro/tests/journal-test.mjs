/* Tests : stockage et synchronisation du journal par setup (Worker, vrai SQLite), rappel hebdomadaire d'import. node trader-pro/tests/journal-test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { traiter } from '../worker/src/coeur.js';
import { rappelImport } from '../worker/src/rappel.js';
import { depotD1, d1DepuisSqlite } from '../worker/src/depot-d1.js';
import { lireJournal, ecrireJournal, noterPrise, attribuer, retirer, synchroniser, visibles, doitRappeler, partiesParis, noterImport, dernierImport, lireConn } from '../portefeuille/journal-stockage.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, x) => m.set(k, String(x)), removeItem: k => m.delete(k) }; };
const st = mem(), T = Date.now() - 60000;
/* stockage local */
const p = noterPrise({ t: T, ticker: 'GOLD', sens: 'BUY', prix: 3620, stop: 3600, setup: 'rebond-ma200', unite: 'H4', source: 'terminal' }, { st, sync: false }); v(p && lireJournal(st).length === 1, 'trade noté et enregistré sur l’appareil');
attribuer('555', 'fibonacci', { st, sync: false }); v(lireJournal(st).length === 2 && lireJournal(st).some(r => r.kind === 'attribution' && r.positionId === '555'), 'setup attribué en un toucher');
v(noterPrise({ ticker: 'X', sens: 'BUY', prix: 1, setup: 'autre' }, { st, sync: false }) === null && lireJournal(st).length === 2, 'prise invalide : rien d’enregistré');
st.setItem('rayle_pf_journal_v1', '{cassé'); v(lireJournal(st).length === 0, 'stockage corrompu : liste vide sans erreur');
/* Worker + synchro */
const env = { PORTEFEUILLE_CODE: 'code-de-test-123456', ORIGINES: 'https://x.test' }, depot = depotD1(d1DepuisSqlite(new DatabaseSync(':memory:')));
const fetchW = async (url, opt = {}) => { const r = await traiter(new Request(url, { method: opt.method || 'GET', headers: { ...(opt.headers || {}), Origin: 'https://x.test' }, body: opt.body }), env, depot); const t = await r.text(); return { ok: r.status < 400, status: r.status, json: async () => JSON.parse(t) }; };
const conn = { url: 'https://w.test', code: 'code-de-test-123456' };
const pc = [p, { id: 'a555', kind: 'attribution', positionId: '555', setup: 'fibonacci', maj: T }];
let r = await synchroniser(pc, { conn, fetchFn: fetchW }); v(r.ok && r.journal.length === 2, 'PC : envoi des prises et des attributions au Worker');
const tel = await synchroniser([], { conn, fetchFn: fetchW }); v(tel.ok && tel.journal.length === 2 && tel.journal.some(x => x.kind === 'prise' && x.setup === 'rebond-ma200'), 'téléphone : récupère le journal du PC');
const retire = tel.journal.map(x => (x.id === p.id ? { id: p.id, supprime: true, maj: T + 5 } : x)); await synchroniser(retire, { conn, fetchFn: fetchW });
const pc2 = await synchroniser(pc, { conn, fetchFn: fetchW }); v(visibles(pc2.journal).length === 1, 'une suppression faite sur le téléphone se propage au PC');
const mauvais = await synchroniser(pc, { conn: { url: 'https://w.test', code: 'mauvais-code-123' }, fetchFn: fetchW }); v(mauvais.ok === false && mauvais.statut === 401 && mauvais.journal === pc, 'mauvais code : 401, journal local conservé');
v((await synchroniser(pc, { conn: null })).horsConfig === true && (await synchroniser(pc, { conn, fetchFn: async () => { throw new Error('hors ligne'); } })).ok === false, 'sans Worker ou hors ligne : aucune erreur, journal local conservé');
const sale = await traiter(new Request('https://w.test/journal', { method: 'PUT', headers: { 'X-Portefeuille-Code': 'code-de-test-123456', Origin: 'https://x.test' }, body: JSON.stringify({ journal: [{ id: 'evil', kind: 'prise', ticker: '<script>', sens: 'BUY', prix: 1, setup: 'autre', maj: 1 }, { id: 'ok1', kind: 'attribution', positionId: '77', setup: 'autre', maj: 2 }] }) }), env, depot); const js = await sale.json(); v(js.journal.every(x => x.id !== 'evil') && js.journal.some(x => x.id === 'ok1'), 'le Worker rejette une prise invalide et garde la valide');
/* rappel hebdomadaire : dimanche 22/11/2026, heure de Paris */
const dim11h = Date.UTC(2026, 10, 22, 10, 0), dim9h = Date.UTC(2026, 10, 22, 8, 0), sam = Date.UTC(2026, 10, 21, 10, 0), jour = 86400e3;
v(partiesParis(dim11h).dimanche === true && partiesParis(dim11h).jour === '2026-11-22' && partiesParis(sam).dimanche === false, 'jour et heure de Paris (dimanche 22/11/2026 à 11 h)');
v(doitRappeler({ maintenant: dim11h, dernierImport: null }) === true, 'dimanche, jamais importé : rappel');
v(doitRappeler({ maintenant: dim11h, dernierImport: dim11h - 3 * jour }) === false, 'importé il y a 3 jours : pas de rappel');
v(doitRappeler({ maintenant: dim11h, dernierImport: dim11h - 8 * jour }) === true, 'rien importé depuis 8 jours : rappel');
v(doitRappeler({ maintenant: dim11h, dernierImport: dim11h - 8 * jour, dernierRappel: '2026-11-22' }) === false, 'déjà rappelé aujourd’hui : une seule fois');
v(doitRappeler({ maintenant: dim9h, dernierImport: null }) === false && doitRappeler({ maintenant: sam, dernierImport: null }) === false, 'pas avant 10 h, pas un autre jour que dimanche');
const s2 = mem(); noterImport(dim11h - 9 * jour, s2); v(dernierImport(s2) === dim11h - 9 * jour && dernierImport(mem()) === null, 'date du dernier import mémorisée');
/* Telegram par le Worker */
const envT = { ...env, TELEGRAM_BOT_TOKEN: 'tok', TELEGRAM_CHAT_ID: '1' }; const envoyes = []; const fetchT = async (u, o) => { envoyes.push([u, JSON.parse(o.body)]); return { ok: true, status: 200 }; };
let rr = await rappelImport(envT, depot, { maintenant: dim11h, fetchFn: fetchT }); v(rr.envoye === true && envoyes.length === 1 && /importer ton historique XTB/.test(envoyes[0][1].text) && /Lecture seule/.test(envoyes[0][1].text), 'Telegram : rappel envoyé le dimanche');
rr = await rappelImport(envT, depot, { maintenant: dim11h + 600e3, fetchFn: fetchT }); v(rr.envoye === false && envoyes.length === 1, 'Telegram : un seul rappel par dimanche');
const depot2 = depotD1(d1DepuisSqlite(new DatabaseSync(':memory:'))); await depot2.kvEcrire('ouvertes', { t: dim11h - 2 * jour, positions: [] }); rr = await rappelImport(envT, depot2, { maintenant: dim11h, fetchFn: fetchT }); v(rr.envoye === false, 'Telegram : import récent : pas de rappel');
v((await rappelImport(env, depot2, { maintenant: dim11h, fetchFn: fetchT })).envoye === false, 'Telegram non configuré : rien');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
