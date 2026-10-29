// Page « Agent » quand le Worker est limité (erreur 500 / 503 « daily row read limit ») : message simple en français, lecture directe depuis le service du PC si il tourne.
// Lancer :  node galaxie/tests/agent-limite-page-test.mjs
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
let appelsWorker = 0, modeWorker = '500';
globalThis.workerReady = () => true;
globalThis.window = { wjson: async () => { appelsWorker++; if (modeWorker === '500') throw new Error('HTTP 500 · D1_ERROR: Exceeded daily row read limit'); if (modeWorker === '503') throw new Error('HTTP 503 · la liaison Worker est limitée aujourd’hui'); return { etat: { identite: { nom: 'Kepler' } }, suivi: {}, meta: { maintenant: 1 } }; }, errMsg: e => 'ERREUR BRUTE ' + e.message };
const A = await import('../../planetes/mars/pc/trading/agent-accueil.js'), V = await import('../../planetes/mars/pc/agent-v3/vue-accueil.js');

// 1. Pas de service local (page sur tablette) : le Worker répond 500 → message simple, pas l'erreur brute
const sansPC = async () => ({ ok: false, status: 404, json: async () => ({}) });
let r = await A.lireEtatAgent({ fetchImpl: sansPC });
v('Worker en erreur 500 (limite D1) : message « limitée aujourd’hui »', r && r.limite === true && /^La liaison Worker est limitée aujourd’hui\./.test(r.erreur), JSON.stringify(r));
v('… sans le texte brut de D1', !/D1_ERROR|ERREUR BRUTE|daily row/.test(r.erreur));
modeWorker = '503'; r = await A.lireEtatAgent({ fetchImpl: sansPC });
v('Worker en 503 (mode dégradé) : même message', r.limite === true && /limitée aujourd’hui/.test(r.erreur));
v('le message s’affiche dans la fenêtre', /limitée aujourd’hui/.test(V.htmlIndisponible(r.erreur)));
v('une panne réseau ordinaire garde son message habituel', !A.workerLimite(new Error('Failed to fetch')) && A.messageWorker(new Error('Failed to fetch')) === 'ERREUR BRUTE Failed to fetch');

// 2. Le service de l'agent tourne sur le PC : la page lit l'état directement, sans toucher au Worker
modeWorker = '500'; appelsWorker = 0;
const avecPC = async () => ({ ok: true, json: async () => ({ ok: true, existe: true, enMarche: true, etat: { identite: { nom: 'Kepler' } }, suivi: {}, maintenant: 5, service: { phase: 'surveillance' } }) });
r = await A.lireEtatAgent({ fetchImpl: avecPC });
v('service du PC en marche : état lu directement (origine PC), Worker jamais appelé', r.origine === 'PC' && r.enMarche === true && appelsWorker === 0, JSON.stringify(r).slice(0, 120));
console.log(`\n${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
