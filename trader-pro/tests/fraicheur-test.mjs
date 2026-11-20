/* Tests purs de la fraîcheur des données et du budget gratuit Cloudflare (v6, B2). node trader-pro/tests/fraicheur-test.mjs */
import { statut, classePeremption, delaiPourSource, construireEtat, voyant, phraseDonnees, familleDe, lireEtat, noterErreur, erreurs24h, MIN, H, J } from '../commun/fraicheur.js';
import { LIMITES, budgetPrevu, pourcentages, niveau, facteurRalentissement, phraseBudget, creerCompteur } from '../commun/budget-cf.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const N = Date.UTC(2026, 10, 20, 12, 0, 0);
/* règle : orange > 2 × délai, rouge > 5 × */
v(statut(N - 10 * MIN, 15 * MIN, N).code === 'vert' && statut(N - 30 * MIN, 15 * MIN, N).code === 'vert', 'à 2 × le délai : encore vert');
v(statut(N - 31 * MIN, 15 * MIN, N).code === 'orange' && statut(N - 75 * MIN, 15 * MIN, N).code === 'orange', 'au-delà de 2 × : orange');
v(statut(N - 76 * MIN, 15 * MIN, N).code === 'rouge', 'au-delà de 5 × : rouge'); v(statut(NaN, 15 * MIN, N).code === 'inconnu', 'date inconnue : inconnu (jamais de fausse alerte)');
v(classePeremption(N - 40 * MIN, 15 * MIN, N) === 'orange' && classePeremption(N - 2 * H, 15 * MIN, N) === 'rouge' && classePeremption(N - 2 * H, null, N) === '', 'pastille : orange, rouge, et rien si le délai est inconnu');
v(delaiPourSource('Kraken (direct)') === 5 * MIN && delaiPourSource('Yahoo Finance (robot GitHub, différé)') === 30 * MIN && delaiPourSource('inconnue') === null, 'délai déduit de l\'étiquette de source');
v(familleDe('bougies-BTC_USD-1h.json').id === 'bougies' && familleDe('pro-or.json').id === 'analyse' && familleDe('marches-calendrier-or.json').id === 'calendrier' && familleDe('cot-OR.json').id === 'cot' && familleDe('index.json') === null, 'familles de fichiers');
/* construction de l'état et du voyant */
const frais = t => ({ t, ok: true });
const donnees = { fichiers: { 'bougies-BTC_USD-1h.json': frais(N - 5 * MIN), 'bougies-_NDX-1d.json': frais(N - 8 * MIN), 'pro-or.json': frais(N - 10 * MIN), 'marches-or.json': frais(N - 12 * MIN), 'cot-OR.json': frais(N - 3 * J), 'actus-or.json': frais(N - 20 * MIN) } };
let L = construireEtat({ donnees, footprint: { t: N - 6 * H }, historique: { t: N - 2 * J }, controle: { t: N - 10 * H } }, N); v(voyant(L) === 'vert' && L.every(x => x.statut === 'vert'), 'tout frais : voyant vert (' + L.map(x => x.id + ':' + x.statut).join(' ') + ')');
v(/Oui, tout est à jour/.test(phraseDonnees(L, N)), 'Rayle : « Oui, tout est à jour »');
const d2 = JSON.parse(JSON.stringify(donnees)); d2.fichiers['pro-or.json'].t = N - 3 * H; L = construireEtat({ donnees: d2, footprint: { t: N }, historique: { t: N } }, N); v(voyant(L) === 'orange' || voyant(L) === 'rouge', 'une source essentielle en retard : voyant non vert (' + voyant(L) + ')');
const ph = phraseDonnees(L, N); v(/Analyse H4/.test(ph) && /en (retard|panne)/.test(ph), 'Rayle nomme la source en retard : « ' + ph + ' »');
const d3 = JSON.parse(JSON.stringify(donnees)); for (const k of Object.keys(d3.fichiers)) d3.fichiers[k].t = N - 2 * J; L = construireEtat({ donnees: d3, footprint: { t: N - 30 * J }, historique: null }, N); v(voyant(L) === 'rouge', 'tout périmé ou index absent : voyant rouge'); v(L.find(x => x.id === 'historique').statut === 'rouge' && /absent/.test(L.find(x => x.id === 'historique').detail), 'index illisible = rouge, dit clairement');
const d4 = JSON.parse(JSON.stringify(donnees)); d4.fichiers['actus-or.json'].ok = false; L = construireEtat({ donnees: d4, footprint: { t: N }, historique: { t: N } }, N); v(L.find(x => x.id === 'actus').echecs === 1 && L.find(x => x.id === 'actus').statut !== 'vert', 'un fichier en échec fait passer sa famille à l\'orange');
v(voyant([]) === 'rouge' && /ne peux pas lire/.test(phraseDonnees([], N)), 'aucune information : rouge, et Rayle le dit au lieu d\'affirmer');
/* lecture réseau simulée : une panne ne bloque pas les autres et est comptée */
const mem = new Map(), st = { getItem: k => mem.get(k) || null, setItem: (k, x) => mem.set(k, x) }; noterErreur('donnees/index.json', st, N - 2 * J); noterErreur('x', st, N); noterErreur('x', st, N - 1000); v(JSON.stringify(erreurs24h(st, N)) === '{"x":2}', 'erreurs sur 24 h comptées (les plus anciennes oubliées)');
globalThis.localStorage = st; const fetchSimule = async u => { if (/footprint/.test(u)) throw new Error('réseau'); const corps = /donnees\/index/.test(u) ? donnees : /historique/.test(u) ? { t: N } : { t: N }; return { ok: true, json: async () => corps }; };
const E = await lireEtat({ fetchFn: fetchSimule, maintenant: N }); v(E.liste.find(x => x.id === 'footprint').statut === 'rouge' && E.liste.find(x => x.id === 'bougies').statut === 'vert', 'footprint injoignable : seule cette ligne est rouge'); v(erreurs24h(st, N)['footprint/index.json'] === 1, 'la panne est notée');
/* budget */
const b = budgetPrevu({ appareils: 3, heuresActivesParAppareil: 6 }); const p = pourcentages(b); v(b.kvEcritures === 0 && b.kvLectures === 0, 'prévision : aucune écriture ni lecture KV'); v(Math.max(...Object.values(p)) < 0.3, 'prévision : toutes les limites sous 30 % (pire ' + Math.round(Math.max(...Object.values(p)) * 100) + ' %, ' + b.requetes + ' requêtes)'); v(b.crons <= LIMITES.crons && b.cpuMsParExecution <= LIMITES.cpuMs && b.sousRequetesParCron <= LIMITES.sousRequetes, 'prévision : 1 cron, < 10 ms de CPU, < 50 sous-requêtes');
v(niveau({ requetes: 10000 }).niveau === 'ok' && niveau({ requetes: 40000 }).niveau === 'attention' && niveau({ requetes: 70000 }).niveau === 'alerte' && niveau({ d1Ecrites: 71000 }).pire === 'd1Ecrites', 'niveaux : ok < 30 % < attention < 70 % ≤ alerte');
v(facteurRalentissement(niveau({ requetes: 80000 })) === 4 && facteurRalentissement(niveau({ requetes: 10 })) === 1, 'à 70 % : rafraîchissements non essentiels ralentis ×4 ; en dessous : inchangés');
v(/ralentis/.test(phraseBudget(niveau({ kvEcritures: 800 }))) && /tout va bien/.test(phraseBudget(niveau({ requetes: 100 }))), 'phrases du budget');
const cpt = creerCompteur(); cpt.ajouter('requetes', 3); cpt.ajouter('d1Lues', 10); const dump = cpt.vider(); v(dump.requetes === 3 && cpt.lire().requetes === 0, 'compteur en mémoire vidé en une fois');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `fraicheur-test : tout passe (${ok})`); process.exit(ko ? 1 : 0);
