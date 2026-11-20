/* Test de la synchronisation personnelle (Ma liste, Mon plan, réglages, risque…) entre deux appareils à travers le Worker (SQLite réel). node trader-pro/tests/sync-perso-test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { traiter } from '../worker/src/coeur.js';
import { depotD1, d1DepuisSqlite } from '../worker/src/depot-d1.js';
import { nettoyerSync, fusionnerSync, CLES_SYNC as CLES_W } from '../worker/src/sync.js';
import { synchroniser, diffLocale, appliquerDistant, CLES_SYNC } from '../commun/sync-perso.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
v(JSON.stringify([...CLES_W]) === JSON.stringify([...CLES_SYNC]), 'mêmes clés côté Worker et côté appareil');
const env = { PORTEFEUILLE_CODE: 'code-de-test-123456', ORIGINES: 'https://justinmaneiro-alt.github.io' }, depot = depotD1(d1DepuisSqlite(new DatabaseSync(':memory:')));
let ecritures = 0; const kvE = depot.kvEcrire; depot.kvEcrire = async (...a) => { if (a[0] === 'sync') ecritures++; return kvE(...a); };
const fetchWorker = async (url, o = {}) => traiter(new Request(url, { method: o.method || 'GET', headers: { Origin: 'https://justinmaneiro-alt.github.io', ...(o.headers || {}) }, body: o.body }), env, depot);
const appareil = nom => { const m = new Map(), meta = { v: null }; return { nom, m, st: { lire: k => (m.has(k) ? JSON.parse(m.get(k)) : undefined), ecrire: (k, x) => m.set(k, JSON.stringify(x)), lireMeta: () => meta.v, ecrireMeta: x => { meta.v = x; } }, passe: t => synchroniser({ conn: { url: 'https://w.test', code: 'code-de-test-123456' }, st: { lire: k => (m.has(k) ? JSON.parse(m.get(k)) : undefined), ecrire: (k, x) => m.set(k, JSON.stringify(x)), lireMeta: () => meta.v, ecrireMeta: x => { meta.v = x; } }, fetchFn: fetchWorker, maintenant: t }) }; };
const A = appareil('téléphone'), B = appareil('tablette'), C = appareil('pc');
const T0 = Date.UTC(2026, 10, 20, 10, 0, 0);
/* A modifie Ma liste ; B la voit à la passe suivante */
A.m.set('rayle_lt_liste_v1', JSON.stringify(['AAPL', 'MSFT'])); let r = await A.passe(T0); v(r.ok && r.envoyees === 1, 'A : envoie Ma liste (1 clé)');
r = await B.passe(T0 + 30000); v(r.ok && r.recues.includes('rayle_lt_liste_v1') && JSON.stringify(B.st.lire('rayle_lt_liste_v1')) === JSON.stringify(['AAPL', 'MSFT']), 'B : reçoit Ma liste dans la passe suivante (< 1 minute)');
/* pas d'écriture inutile : une passe sans changement n'écrit rien dans D1 */
const e0 = ecritures; await A.passe(T0 + 60000); await B.passe(T0 + 60000); v(ecritures === e0, 'aucune écriture D1 quand rien n\'a changé (' + (ecritures - e0) + ')');
/* pas de doublons : B renvoie la même valeur → inchangée */
v((await depot.kvLire('sync')).cles.rayle_lt_liste_v1.valeur.length === 2, 'pas de doublon dans Ma liste');
/* conflit : A et B modifient Mon plan ; la dernière modification gagne, avec trace */
A.m.set('rayle_invest_plan_v1', JSON.stringify({ capital: 1000 })); await A.passe(T0 + 100000);
B.m.set('rayle_invest_plan_v1', JSON.stringify({ capital: 2000 })); await B.passe(T0 + 130000); await A.passe(T0 + 160000);
v(A.st.lire('rayle_invest_plan_v1').capital === 2000, 'conflit : la dernière modification (tablette) gagne sur le téléphone');
const traces = (await depot.kvLire('sync')).traces; v(traces.length >= 1 && traces.at(-1).cle === 'rayle_invest_plan_v1', 'conflit : une trace est gardée (' + traces.length + ')');
/* hors liste blanche et énormes valeurs : refusés */
v(Object.keys(nettoyerSync({ cles: { mauvaise_cle: { valeur: 1, maj: 5 }, rayle_lt_liste_v1: { valeur: 'x'.repeat(70000), maj: 5 } } })).length === 0, 'clés hors liste blanche et valeurs de plus de 60 ko refusées');
v(nettoyerSync({ cles: { rayle_lt_liste_v1: { valeur: 1, maj: T0 + 99 * 3600e3, appareil: 'z' } } }, T0).rayle_lt_liste_v1.maj <= T0 + 5 * 60e3, 'horodatage du futur borné à « maintenant + 5 min »');
/* mauvais code : refus */
const mauvais = await synchroniser({ conn: { url: 'https://w.test', code: 'mauvais-code-123456' }, st: C.st, fetchFn: fetchWorker, maintenant: T0 }); v(!mauvais.ok && mauvais.statut === 401, 'mauvais code : refus 401');
/* hors ligne : pas d'exception, modification gardée puis envoyée au retour */
const panne = await synchroniser({ conn: { url: 'https://w.test', code: 'c' }, st: C.st, fetchFn: async () => { throw new Error('réseau coupé'); }, maintenant: T0 }); v(!panne.ok && /réseau/.test(panne.erreur), 'hors ligne : aucune exception, erreur lisible');
C.m.set('rayle_pf_risque_v1', JSON.stringify({ capital: 5000, risque: 100 })); r = await C.passe(T0 + 200000); v(r.ok && (await depot.kvLire('sync')).cles.rayle_pf_risque_v1.valeur.capital === 5000, 'retour du réseau : la modification locale part');
v(!(await synchroniser({ conn: null, st: C.st })).ok && (await synchroniser({ conn: null, st: C.st })).horsConfig, 'sans Worker configuré : rien ne se passe');
/* briques pures */
const d = diffLocale({ valeurs: { rayle_lt_liste_v1: [1] }, vu: {}, maj: {}, maintenant: 7 }); v(d.envoi.rayle_lt_liste_v1 && d.maj.rayle_lt_liste_v1 === 7, 'diffLocale : nouvelle valeur horodatée');
const ap = appliquerDistant({ distant: { rayle_lt_liste_v1: { valeur: [2], maj: 9 } }, valeurs: { rayle_lt_liste_v1: [1] }, maj: { rayle_lt_liste_v1: 7 } }); v(JSON.stringify(ap.ecrire.rayle_lt_liste_v1) === '[2]', 'appliquerDistant : plus récent → écrit');
const ap2 = appliquerDistant({ distant: { rayle_lt_liste_v1: { valeur: [2], maj: 5 } }, valeurs: { rayle_lt_liste_v1: [1] }, maj: { rayle_lt_liste_v1: 7 } }); v(!('rayle_lt_liste_v1' in ap2.ecrire), 'appliquerDistant : plus ancien → ignoré');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `sync-perso-test : tout passe (${ok})`); process.exit(ko ? 1 : 0);
