/* Tests purs du journal par setup : prises, rapprochement, attributions, statistiques, synthèse, import sans doublon. node trader-pro/tests/journal-setups-test.mjs */
import { SETUPS, setupDeTexte, creerPrise, creerAttribution, nettoyer, nettoyerListe, fusionner, supprimer, visibles, rapprocher, attributions, statsSetups, synthese, MIN_TRADES } from '../portefeuille/journal-setups.js';
import { diff, fusionner as fusionLignes } from '../portefeuille/stockage.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const H = 3600e3, T0 = Date.UTC(2026, 10, 10, 9);
/* setups */
v(SETUPS.length === 6 && ['rebond-ma200', 'cassure-ma200', 'rebond-niveau', 'cassure-niveau', 'fibonacci', 'autre'].every(id => SETUPS.some(s => s.id === id)), 'six setups : rebond MA200, cassure MA200, rebond niveau, cassure niveau, Fibonacci, autre');
v(setupDeTexte('setup rebond MA200') === 'rebond-ma200' && setupDeTexte('rebond sur la ma 200') === 'rebond-ma200' && setupDeTexte('cassure de la MA200') === 'cassure-ma200' && setupDeTexte('rebond de niveau') === 'rebond-niveau' && setupDeTexte('cassure d’un niveau') === 'cassure-niveau' && setupDeTexte('fibo') === 'fibonacci' && setupDeTexte('fibonacci') === 'fibonacci' && setupDeTexte('un truc') === null, 'reconnaissance du setup dans une phrase');
/* prises */
const p1 = creerPrise({ t: T0, ticker: 'gold', sens: 'BUY', prix: 3620, stop: 3600, setup: 'rebond-ma200', unite: 'H4', source: 'voix' });
v(p1 && p1.ticker === 'GOLD' && p1.kind === 'prise' && p1.stop === 3600 && p1.unite === 'H4' && p1.source === 'voix', 'prise créée (ticker normalisé)');
v(creerPrise({ ticker: 'GOLD', sens: 'LONG', prix: 1, setup: 'autre' }) === null && creerPrise({ ticker: 'GOLD', sens: 'BUY', prix: 0, setup: 'autre' }) === null && creerPrise({ ticker: 'GOLD', sens: 'BUY', prix: 1, setup: 'inconnu' }) === null && creerPrise({ ticker: '!!', sens: 'BUY', prix: 1, setup: 'autre' }) === null, 'prise invalide refusée');
v(nettoyer({ ...p1 }) && nettoyer({ id: 'x', kind: 'prise', maj: 1 }) === null && nettoyer({ id: 'a1', kind: 'attribution', positionId: '123', setup: 'autre', maj: 5 }).setup === 'autre' && nettoyer({ id: 'z', supprime: true, maj: 3 }).supprime, 'validation des enregistrements');
/* fusion */
const a = { ...p1, maj: 100 }, b = { ...p1, maj: 200, setup: 'autre' }; v(fusionner([a], [b])[0].setup === 'autre' && fusionner([b], [a])[0].setup === 'autre', 'fusion : le plus récent gagne');
v(visibles(fusionner(supprimer([a], p1.id, 300), [a])).length === 0, 'suppression propagée');
/* transactions XTB de test */
const F = (id, o = {}) => ({ id: String(id), ticker: 'GOLD', sens: 'BUY', volume: 0.1, prixOuv: 3620, tOuv: T0 + 20 * 60e3, prixFerm: 3650, tFerm: T0 + 5 * H, pnl: 100, brut: 100, sl: 3600, ...o });
/* rapprochement */
const f1 = F(1000), R = rapprocher([p1], [f1]); v(R.get(p1.id) === '1000', 'transaction rapprochée de la prise : même actif, même sens, 20 min et 0 % d’écart');
v(rapprocher([p1], [F(1, { sens: 'SELL' })]).size === 0, 'sens différent : pas de rapprochement'); v(rapprocher([p1], [F(1, { ticker: 'US100' })]).size === 0, 'actif différent : pas de rapprochement');
v(rapprocher([p1], [F(1, { tOuv: T0 + 4 * H })]).size === 0, 'ouverte 4 h après : trop loin'); v(rapprocher([p1], [F(1, { tOuv: T0 - 3 * H })]).size === 0, 'ouverte 3 h avant la prise : refusé'); v(rapprocher([p1], [F(1, { prixOuv: 3700 })]).size === 0, 'prix à 2 % : refusé');
const p2 = creerPrise({ t: T0 + H, ticker: 'GOLD', sens: 'BUY', prix: 3621, setup: 'cassure-niveau' }); const R2 = rapprocher([p1, p2], [F(1000), F(1001, { tOuv: T0 + 70 * 60e3, prixOuv: 3621 })]); v(R2.get(p1.id) === '1000' && R2.get(p2.id) === '1001', 'deux prises, deux transactions : chacune la plus proche, une seule fois');
v(rapprocher([p1, creerPrise({ t: T0, ticker: 'GOLD', sens: 'BUY', prix: 3620, setup: 'autre' })], [F(1000)]).size === 1, 'une transaction n’est rapprochée qu’une fois');
v(rapprocher([creerPrise({ ticker: 'BITCOIN', sens: 'BUY', prix: 60000, t: T0, setup: 'autre' })], [F(5, { ticker: 'BITCOIN', prixOuv: 60100 })]).size === 1, 'bitcoin');
/* attributions */
const J = [p1, creerAttribution('1001', 'fibonacci', 5)]; const at = attributions([F(1000), F(1001, { tOuv: T0 + 50 * H }), F(1002, { tOuv: T0 + 60 * H })], J);
v(at.map.get('1000').setup === 'rebond-ma200' && at.map.get('1000').source === 'prise' && at.map.get('1000').unite === 'H4', 'setup attaché par rapprochement (avec l’unité de temps)');
v(at.map.get('1001').setup === 'fibonacci' && at.map.get('1001').source === 'manuelle', 'setup attribué en un toucher');
v(at.sansSetup.length === 1 && at.sansSetup[0].id === '1002', 'une transaction sans setup reste à classer'); v(at.prisesSansTransaction.length === 0, 'aucune prise orpheline');
v(attributions([F(1)], [creerAttribution('1', 'autre', 1), { id: 'a1', supprime: true, maj: 9 }]).map.size === 0, 'attribution supprimée : plus de setup');
/* statistiques : 12 trades rebond MA200 H4 sur l'or (+0,8 R en moyenne), 12 cassures de niveau H1 perdantes, 4 Fibonacci */
const E = [], A = new Map(); let id = 1;
const ajout = (n, setup, unite, ticker, r, pnl) => { for (let i = 0; i < n; i++) { const t = { id: String(id++), ticker, pnl: pnl(i), r: r(i) }; E.push(t); A.set(t.id, { setup, unite }); } };
ajout(12, 'rebond-ma200', 'H4', 'GOLD', i => (i % 3 === 0 ? -1 : 1.7), i => (i % 3 === 0 ? -50 : 85));
ajout(12, 'cassure-niveau', 'H1', 'GOLD', i => (i % 3 ? -1 : 1), i => (i % 3 ? -40 : 40));
ajout(4, 'fibonacci', 'H4', 'US100', () => 0.5, () => 20);
const st = statsSetups(E, A), sr = st.parSetup.find(s => s.setup === 'rebond-ma200');
v(sr.n === 12 && sr.gagnants === 8 && Math.abs(sr.taux - 8 / 12) < 1e-9 && Math.abs(sr.rMoyen - (4 * -1 + 8 * 1.7) / 12) < 1e-9 && sr.pnl === 8 * 85 - 4 * 50, 'stats : nombre, taux de réussite, R moyen, gain en € : ' + JSON.stringify([sr.n, sr.taux, sr.rMoyen, sr.pnl]));
v(sr.suffisant === true && st.parSetup.find(s => s.setup === 'fibonacci').suffisant === false, `moins de ${MIN_TRADES} trades : pas assez de trades`);
v(sr.parActif[0].ticker === 'GOLD' && sr.parUnite[0].unite === 'H4', 'par actif et par unité');
const sy = synthese(st); console.log('  synthèse :', sy);
v(/Ton setup le plus rentable : rebond MA200 H4 sur l’or \(\+0,8 R par trade sur 12 trades\)/.test(sy), 'phrase de synthèse : meilleur setup avec R par trade et nombre de trades');
v(/Ton setup perdant : cassure de niveau H1 sur l’or/.test(sy) && /Pas encore assez de trades pour : Fibonacci/.test(sy), 'setup perdant et setups sans assez de trades');
v(/Pas encore assez de trades/.test(synthese(statsSetups(E.slice(24), A))) && /Pas encore de trade/.test(synthese(statsSetups([], new Map()))), 'peu de trades : « pas encore assez de trades »');
/* meilleure et pire unité de temps */
const E2 = [], A2 = new Map(); id = 1000; for (const [u, rr] of [['H1', -0.5], ['H4', 1], ['J', 0.2]]) for (let i = 0; i < 4; i++) { const t = { id: String(id++), ticker: 'GOLD', pnl: rr * 50, r: rr }; E2.push(t); A2.set(t.id, { setup: 'rebond-niveau', unite: u }); }
const s2 = statsSetups(E2, A2).parSetup[0]; v(s2.meilleureUnite === 'H4' && s2.pireUnite === 'H1', 'meilleure et pire unité de temps : ' + s2.meilleureUnite + ' / ' + s2.pireUnite);
/* import sans doublon : importer deux fois le même fichier */
const lot = Array.from({ length: 7 }, (_, i) => ({ id: String(2000 + i), ticker: 'GOLD', sens: 'BUY', volume: 0.1, prixOuv: 3600, tOuv: T0 + i, prixFerm: 3610, tFerm: T0 + i + 1e5, pnl: 5, brut: 5, sl: null }));
const d1 = diff([], lot), apres1 = fusionLignes([], [...d1.nouvelles, ...d1.modifiees]); const d2 = diff(apres1, lot);
v(d1.nouvelles.length === 7 && d2.nouvelles.length === 0 && d2.modifiees.length === 0 && d2.inchangees === 7 && fusionLignes(apres1, [...d2.nouvelles, ...d2.modifiees]).length === 7, 'importer deux fois le même fichier : 7 nouvelles puis 0 nouvelle, 7 déjà connues, aucun doublon');
const lot2 = [...lot, { ...lot[0], id: '3000' }, { ...lot[0], id: '3001' }]; const d3 = diff(apres1, lot2); v(d3.nouvelles.length === 2 && d3.inchangees === 7, 'ré-import de tout l’historique + 2 nouvelles : 2 nouvelles seulement');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
