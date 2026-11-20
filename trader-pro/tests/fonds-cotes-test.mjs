/* Tests : fonds fermés et véhicules (investment trusts, holdings, SPAC, trackers, BDC) hors du classement Actions. node trader-pro/tests/fonds-cotes-test.mjs */
import { typeFondCote, appliquerFondsCotes, jugementDecote, phraseFonds, CLASSE_FONDS } from '../invest/fonds-cotes.js';
import { verdictLigne, LIBELLES } from '../invest/modele.js';
import { passeFiltres, calculerListe } from '../invest/calcul-liste.js';
import { CLASSES, creerDonnees } from '../invest/donnees-invest.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const L = (id, n, i, margeNette, extra = {}) => ({ id, y: id, n, c: 'action', p: 'UK', z: 'Europe', s: 'Finance', i, d: 'GBP', px: 10, r: { margeNette, pbInv: 1.0, vol: 0.18, m12_1: 0.1, vs200d: 0.05, vs200w: 0.1, mdd3: -0.15, beta: 0.7, liq: 2e6 }, f: { mom: 60, ris: 70, ma: 60, mc: 55, set: 50, val: 90, qua: 40, gro: 50, iv: 80 }, ...extra });
/* les quatre fonds cités */
const FEML = L('FEML.UK', 'Fidelity Emerging Markets Ord', 'Asset Management', 0.983), BGFD = L('BGFD.UK', 'Baillie Gifford Japan Ord', 'Asset Management', 0.9793), UEM = L('UEM.UK', 'Utilico Emerging Markets Ord', 'Asset Management', 0.9545), MNKS = L('MNKS.UK', 'Monks Ord', 'Asset Management', 0.9934);
v([FEML, BGFD, UEM, MNKS].every(l => typeFondCote(l) && typeFondCote(l).type === 'fonds-ferme'), 'FEML, BGFD, UEM, MNKS détectés comme fonds fermés');
/* vraies entreprises de gestion d'actifs : jamais classées fonds */
const ops = [L('ABDN.UK', 'Aberdeen Group Plc', 'Asset Management', 0.2975), L('JUP.UK', 'Jupiter Fund Management Plc', 'Asset Management', 0.2156), L('ASHM.UK', 'Ashmore Group Plc', 'Asset Management', 0.7159), L('EMG.UK', 'Man Group Plc', 'Asset Management', 0.1246), L('STJ.UK', 'St. James’s Place plc', 'Asset Management', 0.0176), L('AMUN.FR', 'Amundi S.A.', 'Asset Management', 0.35)];
v(ops.every(l => typeFondCote(l) === null), 'gestionnaires d’actifs opérationnels (Aberdeen, Jupiter, Ashmore, Man, SJP, Amundi) : restent des entreprises');
v(typeFondCote(L('AAPL', 'Apple Inc.', 'Consumer Electronics', 0.25)) === null && typeFondCote(L('LVMH', 'LVMH', 'Luxury Goods', 0.2)) === null, 'entreprises ordinaires : inchangées');
v(typeFondCote(L('AGT.UK', 'AVI Global Trust Ord', 'Asset Management', 0.5344)).type === 'fonds-ferme' && typeFondCote(L('AIE.UK', 'Ashoka India Equity Investment Ord', 'Asset Management', null)).type === 'fonds-ferme', 'trusts à marge moyenne ou inconnue détectés par leur nom');
/* autres véhicules */
v(typeFondCote(L('SPAC1', 'Foo Acquisition Corp', 'Shell Companies', null)).type === 'spac' && typeFondCote(L('SPAC2', 'Bar Holdings', 'Shell Companies', null)).type === 'spac', 'SPAC (industrie « Shell Companies » ou nom)');
v(typeFondCote(L('INVEB.SE', 'Investor AB (publ)', 'Asset Management', 0.1)).type === 'holding' && typeFondCote(L('EXO.NL', 'Exor N.V.', 'Asset Management', 0.1)).type === 'holding' && typeFondCote(L('MF.FR', 'Wendel', 'Asset Management', 0.1)).type === 'holding', 'holdings d’investissement (Investor, Exor, Wendel)');
v(typeFondCote(L('T1', 'iShares Core Foo ETF', 'Asset Management', null)).type === 'tracker', 'tracker / ETF coté parmi les « actions »');
v(typeFondCote(L('ARCC.US', 'Ares Capital Corporation', 'Asset Management', 0.7)).type === 'fonds-ferme' && typeFondCote(L('KKR.US', 'KKR & Co. Inc.', 'Asset Management', 0.2)) === null && typeFondCote(L('BX.US', 'Blackstone Inc.', 'Asset Management', 0.3)) === null, 'BDC (fonds fermé réglementé) détecté ; KKR et Blackstone non');
v(typeFondCote(L('X', 'Closed Foo', 'Closed-End Fund - Equity', null)).type === 'fonds-ferme', 'industrie « Closed-End Fund »');
v(typeFondCote({ ...FEML, c: 'ETF' }) === null, 'les vrais ETF du catalogue ne sont pas retouchés');
/* classement Actions */
const C = appliquerFondsCotes([FEML, BGFD, ops[0], UEM, MNKS]); v(C.filter(l => l.c === CLASSE_FONDS).length === 4 && C.find(l => l.id === 'ABDN.UK').c === 'action', 'appliquerFondsCotes : 4 fonds, 1 entreprise');
v(C.find(l => l.id === 'FEML.UK').fc.type === 'fonds-ferme' && C.find(l => l.id === 'FEML.UK').c0 === 'action', 'type et classe d’origine conservés');
const F0 = { classe: 'action', zone: '', pays: '', secteur: '', caps: [] };
v(C.filter(l => passeFiltres(l, F0, null)).length === 1, 'le classement « Actions » ne contient plus aucun fonds (1 entreprise sur 5)');
v(C.filter(l => passeFiltres(l, { ...F0, classe: CLASSE_FONDS }, null)).length === 4, 'la classe « Fonds cotés » les contient (4)');
const cl = calculerListe(C, { horizon: 'moyen', filtres: { classe: 'action' } }); v(cl.total === 1 && cl.ordre.every(i => C[i].c === 'action'), 'calculerListe : classement Actions sans fonds');
v(CLASSES.some(([k, n]) => k === 'fonds coté' && n === 'Fonds cotés'), 'la classe « Fonds cotés » existe dans l’interface');
/* verdicts */
const fonds = C.find(l => l.id === 'FEML.UK'), tac = verdictLigne(fonds, 'tactique'), moy = verdictLigne(fonds, 'moyen'), lg = verdictLigne(fonds, 'long');
v(tac.lib !== LIBELLES.ND && tac.score != null, 'tactique : jugé sur la tendance et le risque (pas de valorisation requise)');
v(moy.lib === LIBELLES.ND && moy.score == null && moy.badges.some(b => b.id === 'sans-nav') && lg.lib === LIBELLES.ND, '1–3 ans et 5–10 ans sans valeur liquidative : AUCUN verdict de valorisation');
v(moy.badges.some(b => b.id === 'fonds' && /pas une entreprise/.test(b.texte)), 'badge « ce n’est pas une entreprise »');
v(!/dcf|multiple|graham/i.test(JSON.stringify(moy.contributions || [])), 'aucune contribution DCF / multiples / Graham dans le verdict d’un fonds');
const avecNav = appliquerFondsCotes([{ ...FEML, nav: 12.5, px: 10 }])[0], vN = verdictLigne({ ...avecNav, f: { ...avecNav.f, decote: 90 } }, 'moyen');
v(Math.abs(avecNav.fc.decote - (-0.2)) < 1e-9 && vN.lib !== LIBELLES.ND && vN.score > 60, 'avec une valeur liquidative : décote de 20 % → jugé sur la décote (' + vN.lib + ', ' + vN.score + ')');
v(jugementDecote(avecNav).niveau === 'decote-forte' && /20 %/.test(jugementDecote(avecNav).texte) && jugementDecote(fonds) === null, 'jugement décote / prime');
v(jugementDecote({ fc: { decote: 0.12 } }).niveau === 'prime' && jugementDecote({ fc: { decote: 0.01 } }).niveau === 'proche', 'prime et « proche de la valeur liquidative »');
v(/Valeur liquidative indisponible : aucun verdict de valorisation/.test(phraseFonds(fonds)) && /décote/.test(phraseFonds(avecNav)), 'phrases');
/* couche de données : les lignes publiées sont reclassées à la lecture */
const shard = { t: 1, lignes: [FEML, ops[0], MNKS] }, base = { version: 2, t: 1, shards: [{ id: 'actions-Europe', n: 3, classe: 'action' }], ajust: {} };
const D = creerDonnees({ base: () => 'https://x/', fetchFn: async u => ({ ok: true, json: async () => (/manifest/.test(u) ? base : shard) }) });
const lignes = await D.lignes(['fonds coté']); v(lignes.filter(l => l.c === CLASSE_FONDS).length === 2 && lignes.filter(l => l.c === 'action').length === 1, 'lecture des données publiées : les fonds sont reclassés immédiatement (sans attendre le calcul de la nuit)');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
