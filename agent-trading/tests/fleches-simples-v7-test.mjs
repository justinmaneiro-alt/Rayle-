/* Flèches v7 « Direct » (affinage) : anti-aller-retour, rebond après base, régime MA200 (désactivé par défaut), cas de contrôle, non-repaint, flux simulé, cohérence levelId.   node agent-trading/tests/fleches-simples-v7-test.mjs */
import { serie13 } from '../recherche-or/fleches-v6-diag.mjs';
import * as V6 from '../front/or/fleches-simples-v6.js'; import * as V7 from '../front/or/fleches-simples-v7.js'; import { zonesDirect } from '../front/or/zones-direct.js';
import { niveauxSignal } from '../front/or/signal-niveaux.js'; import { evenements, formater } from '../front/or/fleches-notif.js'; import { atrSerie } from '../front/or/fleches-terminal-v1.js';
const H = 3600e3; let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', n, d); } };
const K = serie13(), now = K.at(-1).t + H, o = { maintenant: now, bougies: 1e5 }, cle = f => f.id, U = (m, j, h) => Date.UTC(2026, m, j, h);
const r6 = V6.calculer(K, zonesDirect, o), r7 = V7.calculer(K, zonesDirect, o), rReg = V7.calculer(K, zonesDirect, { ...o, regime: true });
const sansTout = V7.calculer(K, zonesDirect, { ...o, anti: false, rebond: false });
v('sans anti ni rebond, v7 = v6 flèche pour flèche (aucune règle de la stable modifiée)', sansTout.fleches.map(cle).join() === r6.fleches.map(cle).join(), `${sansTout.fleches.length} / ${r6.fleches.length}`);
v('la version stable (v6) reste intacte : même résultat qu\'avant (49 flèches, 46 colorées)', r6.fleches.length === 49 && r6.fleches.filter(f => !f.contre).length === 46);
// ── cas de contrôle
const col = f => !f.contre && !f.invalidee;
v('contrôle : cassure MA200 baissière du 10 nov. (17:00 UTC)', r7.fleches.some(f => f.type === 'ma_cassure' && f.dir < 0 && f.tCloture >= U(10, 10, 16) && f.tCloture <= U(10, 10, 22)));
v('contrôle : vente rouge du 5 nov. (VAH mensuel)', r7.fleches.some(f => f.type === 'retournement' && f.dir < 0 && col(f) && f.tCloture >= U(10, 5, 0) && f.tCloture < U(10, 6, 0)));
const c9 = r7.fleches.find(f => f.type === 'retournement' && f.dir < 0 && f.tCloture === U(10, 9, 21));
v('contrôle : vente rouge du 9 nov. 21:00 (2ᵉ touche, niveau 4 131–4 144)', c9 && col(c9) && c9.deuxiemeTouche && c9.zoneHaut > 4120 && c9.zoneBas < 4150);
v('contrôle : cassure MA200 haussière du début de rallye', r7.fleches.some(f => f.type === 'ma_cassure' && f.dir > 0));
v('contrôle : zéro achat coloré dans la chute du 12 nov. (6 h–19 h UTC) hors stabilisation', r7.fleches.filter(f => f.dir > 0 && f.type !== 'ma_cassure' && col(f) && !f.stabilisation && f.tCloture >= U(10, 12, 6) && f.tCloture <= U(10, 12, 19)).length === 0);
// ── rebond après base
const rb = r7.fleches.filter(f => f.type === 'rebond_base');
const rb2 = rb.find(f => f.dir > 0 && f.tCloture === U(10, 2, 0));
v('rebond après base : le rebond du 2 nov. (≈ 3 900 après la base du week-end) produit la flèche', !!rb2 && rb2.baseBougies >= 8 && rb2.chuteAtr >= 5, JSON.stringify(rb2 && { L: rb2.baseBougies, c: rb2.chuteAtr }));
v('rebond après base : stop sous le bas de la base (0,2 ATR), TP 1 R / 2 R', rb2 && (() => { const n = niveauxSignal(rb2); return Math.abs(n.stop - (rb2.zoneBas - 0.2 * rb2.atr)) < 1e-6 && Math.abs(n.tp1 - (n.entree + n.r)) < 1e-6 && Math.abs(n.tp2 - (n.entree + 2 * n.r)) < 1e-6; })());
v('rebond après base : jamais deux rebonds de même sens à moins de 48 bougies', rb.every((f, k) => rb.slice(k + 1).every(g => g.dir !== f.dir || Math.abs(g.i - f.i) >= 48)));
v('rebond après base : notification formatée (titre « Rebond après base ») et signal invalidable sans erreur', rb2 && /Rebond après base/.test(formater({ genre: 'fleche', f: rb2 }).titre) && evenements([rb2], { maintenant: rb2.tCloture + 1000 }).length === 1);
v('rebond après base : infobulle (base, chute, entrée/stop/TP)', rb2 && V7.detail(rb2).some(x => /Rebond après base/.test(x)) && V7.detail(rb2).some(x => /Stop .*TP1 .*TP2/.test(x)));
{ // base synthétique : chute de 8 ATR, base de 10 bougies, clôture au-dessus
  const B = []; let t = Date.UTC(2026, 0, 5), p = 2000; const add = (o, c, h, l) => { B.push({ t, o, c, h, l, v: 1 }); t += H; };
  for (let k = 0; k < 80; k++) { const c = p + (k % 2 ? 2 : -2); add(p, c, Math.max(p, c) + 2, Math.min(p, c) - 2); p = c; }
  for (let k = 0; k < 8; k++) { const c = p - 12; add(p, c, p + 1, c - 1); p = c; }        // chute de ≈ 100 pts (≈ 8-9 ATR)
  for (let k = 0; k < 10; k++) { const c = p + (k % 2 ? 1.5 : -1.5); add(p, c, Math.max(p, c) + 1, Math.min(p, c) - 1); p = c; }   // base serrée
  add(p, p + 30, p + 31, p - 1);
  const A = atrSerie(B), e = V7.rebondApresBase(B, A, B.length - 1, 1), nul = V7.rebondApresBase(B, A, B.length - 2, 1);
  v('rebond après base (cas synthétique) : base de ≥ 8 bougies puis clôture au-dessus = flèche', !!e && e.baseBougies >= 8 && e.dir === 1, JSON.stringify(e));
  v('rebond après base (synthétique) : pas de flèche sans clôture au-dessus', nul === null);
  const M = B.map(b => ({ ...b, o: 4000 - b.o, c: 4000 - b.c, h: 4000 - b.l, l: 4000 - b.h })), AM = atrSerie(M), em = V7.rebondApresBase(M, AM, M.length - 1, -1);
  v('rebond après base (miroir : base de sommet puis clôture sous le bas) = vente', !!em && em.dir === -1, JSON.stringify(em));
}
// ── anti-aller-retour
const col2 = r7.fleches.filter(f => !f.contre);
{ let bon = true; for (const f of col2) for (const g of col2) if (g !== f && f.dir !== g.dir && g.i > f.i && g.i - f.i < 12 && g.type !== 'ma_cassure' && !f.invalidee && !g.deuxiemeTouche) bon = false; v('anti-aller-retour : aucune flèche colorée de sens opposé à moins de 12 bougies (sauf cassure MA200, invalidée, 2ᵉ touche)', bon); }
v('anti-aller-retour : des flèches sont bien supprimées sur la série, listées avec la flèche en cause', r7.supprimees.length > 0 && r7.supprimees.every(s => s.avecId));
v('anti-aller-retour : une cassure MA200, une 2ᵉ touche ou une flèche invalidée ne sont jamais supprimées', !r7.supprimees.some(s => s.type === 'ma_cassure') && !r7.supprimees.some(s => { const f = r6.fleches.find(q => q.id === s.id); return f && f.deuxiemeTouche; }));
// ── régime par la MA200 (option, DÉSACTIVÉE par défaut parce qu'elle fait disparaître deux cas de contrôle)
const cReg9 = rReg.fleches.find(f => f.type === 'retournement' && f.dir < 0 && f.tCloture === U(10, 9, 21));
v('régime MA200 (option) : fait bien passer des flèches en contre-tendance', rReg.fleches.filter(f => f.contre).length > r7.fleches.filter(f => f.contre).length);
v('régime MA200 : DÉSACTIVÉ par défaut, car il fait disparaître la vente du 5 nov. (cas de contrôle)', !rReg.fleches.some(f => f.type === 'retournement' && f.dir < 0 && col(f) && f.tCloture >= U(10, 5, 0) && f.tCloture < U(10, 6, 0)) && r7.fleches.some(f => f.type === 'retournement' && f.dir < 0 && col(f) && f.tCloture >= U(10, 5, 0) && f.tCloture < U(10, 6, 0)));
v('régime MA200 : sens correct (achat contre-tendance après cassure baissière, vente après cassure haussière)', V7.contreRegime(-1, 1) && !V7.contreRegime(-1, -1) && V7.contreRegime(1, -1) && !V7.contreRegime(1, 1) && !V7.contreRegime(0, 1));
void cReg9;
// ── invariants
v('cohérence levelId : id = type|t|dir|levelId pour chaque flèche', r7.fleches.every(f => f.id === `${f.type}|${f.t}|${f.dir}|${f.levelId}` && f.levelId));
v('indexApparition = indexDessin (décidé à la clôture de la bougie)', r7.fleches.every(f => f.indexApparition === f.indexDessin && f.indexDessin === f.i));
{ const ts = [...r7.fleches.map(f => f.t), ...r7.contacts.map(k => k.t)]; v('un seul marqueur (flèche ou point) par bougie', new Set(ts).size === ts.length); }
{ let bon = true; for (let k = 1; k < r7.fleches.length; k++) { const a = r7.fleches[k - 1], b = r7.fleches[k]; if (a.type !== 'ma_cassure' && b.type !== 'ma_cassure' && b.i - a.i < V7.P.distanceMin) bon = false; } v('6 bougies minimum entre deux flèches (hors MA200)', bon); }
{ const final = new Set(r7.fleches.map(cle)); let bon = true;
  for (const n of [900, 1000, 1100, 1250, K.length - 1]) { const P = V7.calculer(K.slice(0, n), zonesDirect, { maintenant: K[n - 1].t + H, bougies: 1e5 }); if (!P.fleches.every(f => final.has(cle(f))) || r7.fleches.filter(f => f.i < n).length !== P.fleches.length) bon = false; }
  v('non-repaint : le rendu après n bougies = le début du rendu complet (5 coupes)', bon); }
{ // flux simulé : registre en ajout seul, indexApparition = indexDessin à chaque pas
  let reg = [], bon = true;
  for (const n of [1250, 1300, 1350, 1400, K.length]) { const S = K.slice(0, n), r = V7.calculer(S, zonesDirect, { maintenant: S[n - 1].t + H, bougies: 1e5 }); const avant = reg.map(f => f.id); reg = V7.fusionnerRegistre(reg, r.fleches, r.invalidees || []); if (!avant.every(id => reg.some(f => f.id === id))) bon = false; if (!r.fleches.every(f => f.indexApparition === f.indexDessin)) bon = false; }
  v('flux simulé : le registre ne perd jamais une flèche posée, indexApparition = indexDessin', bon && reg.length > 0); }
v('niveau masqué : l\'option exclure fonctionne aussi en v7 (aucune erreur, résultat identique sans masque)', V7.calculer(K, zonesDirect, { ...o, exclure: () => false }).fleches.map(cle).join() === r7.fleches.map(cle).join());
console.log(`${ok} OK, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
