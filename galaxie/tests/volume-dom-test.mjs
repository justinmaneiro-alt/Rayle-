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
