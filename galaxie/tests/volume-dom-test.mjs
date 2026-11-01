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
