// Carnet d'ordres en échelle : niveaux, parts, totaux, variation (pour l'animation).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const C = createRequire(import.meta.url)('../../core/commun/volume-vivant-calcul.js');
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); };
ok(C.niveauxDom(null) === null && C.niveauxDom({ ok: false }) === null && C.niveauxDom({ ok: true, echelle: [] }) === null, 'carnet absent ou vide : null, rien d’inventé');
const c = { ok: true, prix: 100, echelle: [{ distancePct: 0.1, bidUsd: 400, askUsd: 100 }, { distancePct: 0.2, bidUsd: 200, askUsd: 800 }] };
const d = C.niveauxDom(c);
ok(d.asks.map(l => l.distance).join() === '+0.2 %,+0.1 %' && d.bids.map(l => l.distance).join() === '−0.1 %,−0.2 %', 'ventes loin en haut, achats loin en bas');
ok(d.asks[0].part === 1 && d.bids[0].part === 0.5, 'part relative à la plus grosse ligne');
ok(d.totalBid === 600 && d.totalAsk === 900 && Math.abs(d.partAchat - 0.4) < 1e-9, 'totaux et part acheteuse');
ok(C.niveauxDom(c, 1).asks.length === 1, 'limite de lignes');
ok(C.variation(null, 500) === 0 && C.variation(100, 100) === 0 && C.variation(100, 150) === 1 && C.variation(100, 50) === -1 && C.variation(100, 102) === 0, 'variation avec seuil');
console.log('volume-dom : ' + n + ' vérifications OK');

/* ── portefeuille piloté par les trades, flux d'exécution, trades normalisés ── */
{
  let k = 0; const okk = (c, m) => { k++; assert.ok(c, m); }; const T0 = 1_800_000_000_000, H = 3600e3;
  const tr = (id, statut, extra = {}) => ({ id, actif: 'BTC', tf: 'M15', sens: 1, entree: 100, stop: 99, cible1: 102, tSignal: T0, statut, ...extra });
  const vue = { actives: [tr('o', 'ouverte', { tEntree: T0 + 5 * H }), tr('w', 'en_attente'), tr('f', 'ouverte', { fantome: true })], recentes: [
    tr('g', 'cloturee', { tEntree: T0, tSortie: T0 + H, resultat: { R: 2, motif: 'objectif' } }), tr('p', 'cloturee', { tEntree: T0 + 2 * H, tSortie: T0 + 3 * H, resultat: { R: -1, motif: 'stop' } }), tr('x', 'expiree'), tr('sansR', 'cloturee', { tSortie: T0 })], bougies: { BTC: [[T0, 100, 101, 99, 100.5, 1]] } };
  const trades = C.tousTrades(vue, null); okk(trades.map(t => t.id).sort().join() === 'g,o,p,w', 'fantômes, expirées et terminées sans R écartées');
  okk(Math.abs(trades.find(t => t.id === 'g').sortie - 102) < 1e-9 && Math.abs(trades.find(t => t.id === 'p').sortie - 99) < 1e-9, 'prix de sortie déduit du R');
  const pf = C.portefeuilleTrades(trades, { BTC: C.dernierPrix(vue, null, 'BTC') }, { capital0: 10000, risquePct: 1, maintenant: T0 + 10 * H });
  // +2 R puis −1 R à 1 % composé : 10000 → 10200 → 10098 ; ouverte à 100,5 (entrée 100, stop 99) = +0,5 R flottant = +0,5 % du capital réalisé
  okk(Math.abs(pf.realiseUsd - 98) < 1e-9, 'capital réalisé composé (10 098 $)'); okk(Math.abs(pf.cumulR - 1) < 1e-9 && pf.nTrades === 2 && pf.nOuverts === 1 && pf.nEnAttente === 1, 'cumul R, nombres');
  okk(Math.abs(pf.flottantUsd - 10098 * 0.01 * 0.5) < 1e-6, 'flottant de la position ouverte'); okk(Math.abs(pf.capital - (10098 + 50.49)) < 1e-6 && pf.gainUsd > 98, 'le capital affiché inclut le flottant');
  okk(pf.courbe.length === 4 && pf.courbe[0][1] === 10000 && pf.courbe.at(-1)[1] === pf.capital, 'courbe : départ, deux sorties, point live'); okk(Math.abs(pf.drawdownMaxPct - (10200 - 10098) / 10200 * 100) < 1e-6, 'baisse max');
  const vide = C.portefeuilleTrades([], {}, { maintenant: T0 }); okk(vide.capital === 10000 && vide.gainUsd === 0 && vide.nTrades === 0, 'sans trade le capital reste au départ (rien d’inventé)');
  const flux = C.fluxExecution(trades); okk(flux[0].t >= flux.at(-1).t && flux.some(e => e.type === 'sortie' && e.gain === true && /\+2,00 R/.test(e.texte)) && flux.some(e => e.type === 'entree') && flux.some(e => e.type === 'signal'), 'flux : signal, entrée, sortie avec R, plus récent d’abord');
  console.log('volume-dom (trades) : ' + k + ' vérifications OK');
}

/* ── type de clôture (TP / SL) pour la flèche sur la bougie ── */
{
  assert.equal(C.typeSortie('objectif atteint', -1), 'TP'); assert.equal(C.typeSortie('stop touché', 2), 'SL'); assert.equal(C.typeSortie('', 1.5), 'TP'); assert.equal(C.typeSortie('sortie au temps', -0.3), 'SL');
  const n = C.normaliser({ id: 'z', actif: 'BTC', sens: 1, entree: 100, stop: 99, cible1: 102, statut: 'cloturee', tSortie: 5, resultat: { R: 2, motif: 'objectif' } }, 'BTC', 'trader'); assert.equal(n.type, 'TP');
  console.log('volume-dom (TP/SL) : 5 vérifications OK');
}

/* ── fenêtre du graphique (zoom / déplacement) et tableau d'historique ── */
{
  let k = 0; const okk = (c, m) => { k++; assert.ok(c, m); };
  const f = C.fenetreBougies(100, 0, 0, 64); okk(f.nVis === 64 && f.deb === 36 && f.fin === 100 && f.dec === 0, 'fenêtre par défaut : les 64 dernières bougies');
  okk(C.fenetreBougies(30, 0, 0, 64).nVis === 30 && C.fenetreBougies(100, 3, 0, 64).nVis === 8, 'bornes : pas plus que les données, pas moins de 8');
  okk(C.fenetreBougies(100, 20, 500, 64).dec === 80 && C.fenetreBougies(100, 20, -5, 64).dec === 0, 'décalage borné (jamais après la dernière ni avant la première bougie)');
  const z = C.zoomerFenetre({ n: 100, visibles: 64, decalage: 0, facteur: 0.5, ancre: 0.5, defaut: 64 }); okk(z.visibles === 32 && z.decalage === 16, 'zoom avant au centre');
  const a = C.fenetreBougies(100, 64, 0, 64), b = C.fenetreBougies(100, z.visibles, z.decalage, 64); okk(Math.abs((a.deb + 0.5 * a.nVis) - (b.deb + 0.5 * b.nVis)) <= 1, 'la bougie sous le curseur reste sous le curseur');
  const zd = C.zoomerFenetre({ n: 100, visibles: 64, decalage: 0, facteur: 0.5, ancre: 1, defaut: 64 }); okk(zd.decalage === 0, 'ancre à droite : la bougie la plus récente reste visible');
  const zo = C.zoomerFenetre({ n: 100, visibles: 64, decalage: 0, facteur: 10, ancre: 0.5, defaut: 64 }); okk(zo.visibles === 100 && zo.decalage === 0, 'dézoom maximal = toutes les données');
  okk(C.deplacerFenetre({ n: 100, visibles: 20, decalage: 0, barres: 15, defaut: 64 }).decalage === 15 && C.deplacerFenetre({ n: 100, visibles: 20, decalage: 10, barres: -50, defaut: 64 }).decalage === 0, 'déplacement borné');
  const c = C.centrerFenetre({ n: 100, visibles: 20, idx: 30, defaut: 64 }); const fc = C.fenetreBougies(100, c.visibles, c.decalage, 64); okk(fc.deb <= 30 && fc.fin > 30 && Math.abs(fc.deb + 10 - 30) <= 1, 'centrage sur un trade');

  const T0 = 1_800_000_000_000, H = 3600e3, mk = (id, R, tS, extra = {}) => ({ id, actif: 'BTC', tf: 'M15', sens: 1, entree: 100, stop: 99, cible: 102, statut: 'terminee', tSignal: tS, tEntree: tS, tSortie: tS + H, R, sortie: 100 + R, nom: 'A', type: R > 0 ? 'TP' : 'SL', motif: '', ...extra });
  const trades = [mk('a', 2, T0), mk('b', -1, T0 + 2 * H), mk('c', 1, T0 + 4 * H, { nom: 'B', actif: 'SOL' }), mk('o', null, T0 + 6 * H, { statut: 'ouverte', tSortie: null, sortie: null, tEntree: T0 + 6 * H, type: null }), mk('w', null, T0 + 7 * H, { statut: 'en_attente', tSortie: null, sortie: null, tEntree: null, type: null })];
  const tb = C.tableHistorique(trades, { capital0: 10000, risquePct: 1, prix: { BTC: 100.5 } });
  okk(tb.lignes.length === 5 && tb.lignes[0].id === 'w' && tb.lignes[1].id === 'o' && tb.lignes[2].id === 'c', 'vivantes d’abord (plus récente en tête), puis terminées de la plus récente à la plus ancienne');
  const la = tb.lignes.find(l => l.id === 'a'), lb = tb.lignes.find(l => l.id === 'b'), lc = tb.lignes.find(l => l.id === 'c');
  okk(Math.abs(la.usd - 200) < 1e-9 && Math.abs(lb.usd - (-102)) < 1e-9 && Math.abs(lc.usd - 100.98) < 1e-9, 'gain simulé en $ composé dans l’ordre des sorties (200, −102, +100,98)');
  okk(Math.abs(lc.capApres - 10198.98) < 1e-6 && la.dureeMs === H && Math.abs(la.rr - 2) < 1e-9, 'capital après, durée, ratio');
  okk(Math.abs(tb.lignes.find(l => l.id === 'o').flottantR - 0.5) < 1e-9 && tb.lignes.find(l => l.id === 'o').usd > 0 && tb.lignes.find(l => l.id === 'w').usd === null, 'position ouverte : R flottant ; ordre en attente : aucun résultat inventé');
  const r = tb.resume; okk(r.n === 3 && r.gagnes === 2 && r.perdus === 1 && Math.abs(r.taux - 2 / 3) < 1e-9 && r.cumulR === 2 && Math.abs(r.facteurProfit - 3) < 1e-9 && r.meilleur === 2 && r.pire === -1 && r.baisseMaxR === 1 && r.ouverts === 1 && r.enAttente === 1, 'résumé : réussite, cumul, facteur de profit 3, meilleur / pire, baisse max');
  okk(r.parNom.length === 2 && r.parNom[0].cle === 'A' && r.parActif.length === 2, 'regroupement par stratégie et par actif');
  const v = C.tableHistorique([mk('a', 1, T0)]); okk(v.resume.facteurProfit === null, 'aucune perte : facteur de profit « — » (jamais infini)'); okk(C.tableHistorique([]).lignes.length === 0 && C.tableHistorique([]).resume.taux === null, 'historique vide : pas de chiffre inventé');
  console.log('volume-dom (fenêtre, historique) : ' + k + ' vérifications OK');
}
