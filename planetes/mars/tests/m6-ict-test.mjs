// M6 partie 5 : détecteurs ICT / smart money et figures chartistes, testés sur des cas construits à la main (un motif connu doit être trouvé, son absence ne doit rien déclencher).
// Lancer :  node planetes/mars/tests/m6-ict-test.mjs
import { FAMILLES_ICT, ORDRE_ICT, chantiersICT, nombreVariantesICT } from '../pc/agent-m6/ict.js';
import { FAMILLES, combinaisons } from '../pc/agent-btc/hypotheses.js';
import { construireContexte } from '../pc/agent-btc/contexte.js';
import { depuisBougies } from '../pc/agent-btc/colonnes.js';
import { alea } from '../pc/mars-calcul.js';
import { marcheMixte } from './synth-btc.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const T0 = Date.UTC(2025, 0, 6), PAS = 900e3;

/* Série de test : 760 bougies de bruit plat autour de 100 (ATR faible) puis les bougies du scénario ; les assertions ne regardent que les index ≥ 760 (le bruit peut produire des signaux au hasard). */
function scenario(bougies, { avant = 760, apres = 0, base = 100, graine = 3 } = {}) {
  const a = alea(graine), out = [];
  const plat = p => ({ o: p, c: p, h: p + 0.05, l: p - 0.05 });                                // base STRICTEMENT plate : aucun pivot, aucun signal parasite avant le scénario
  for (let i = 0; i < avant; i++) out.push(plat(base));
  for (const b of bougies) out.push({ ...b });
  const dernier = out[out.length - 1].c; for (let i = 0; i < apres; i++) out.push(plat(dernier));
  return depuisBougies(out.map((b, i) => ({ t: T0 + i * PAS, ...b, v: 100, vb: 50 })));
}
const ctxDe = s => construireContexte(s);
const tous = (sig, de = 0) => { const l = []; for (let i = de; i < sig.sens.length; i++) if (sig.sens[i]) l.push(i); return l; };
const apres760 = sig => tous(sig, 760);
const P = (id, o) => ({ ...combinaisons(FAMILLES_ICT[id].grille(0))[0], ...o });
const B = (o, h, l, c) => ({ o, h, l, c });
const fill = (n, p) => Array.from({ length: n }, () => B(p, p + 0.4, p - 0.4, p));                   // barres qui se chevauchent toutes : ni trou, ni déplacement
const miroir = sc => sc.map(b => ({ o: 200 - b.o, h: 200 - b.l, l: 200 - b.h, c: 200 - b.c }));

// ── registre ──
{
  v('six familles ICT / figures enregistrées dans le registre du moteur', ORDRE_ICT.length === 6 && ORDRE_ICT.every(id => FAMILLES[id] && FAMILLES[id].signaux && FAMILLES[id].grille));
  const ch = chantiersICT(); v('chantiers de la file : un par famille, variantes = produit de la grille, niveau 6', ch.length === 6 && ch.every(c => c.niveau === 6 && c.variants.length === combinaisons(FAMILLES_ICT[c.famille].grille(0)).length && c.variants.every(x => x.famille === c.famille)));
  v('nombre total de variantes ICT connu et fini (grilles figées avant les tests)', nombreVariantesICT() === ch.reduce((s, c) => s + c.variants.length, 0) && nombreVariantesICT() > 300 && nombreVariantesICT() < 2000, nombreVariantesICT());
  v('chaque famille a nom, description honnête et grille sans ambiguïté', ORDRE_ICT.every(id => FAMILLES_ICT[id].nom.length > 10 && /hypoth|testée|classique/i.test(FAMILLES_ICT[id].description)));
}
// ── fair value gap ──
{
  const gap = [B(100.05, 100.1, 99.98, 100.02), B(100.0, 102.1, 99.95, 102.0), B(102.0, 102.6, 100.9, 102.1)];              // bougies i−2, i−1 (déplacement), i (le trou : 100,10 → 100,90)
  const sc = [...fill(10, 100), ...gap, ...fill(7, 102.1), B(100.8, 101.3, 100.5, 101.2), ...fill(8, 101.2)];
  const S = scenario(sc), p = P('ict_fvg', { minGap: 0.2, dispo: 0.8, maxAge: 96, pad: 0.25, R: 3, tendance: 0 }), sig = FAMILLES_ICT.ict_fvg.signaux(ctxDe(S), p);
  const i = 760 + 10 + 3 + 7;                                                                // bougie de retour dans le trou
  v('FVG haussier : le retour dans le trou et le rejet déclenchent UN achat à la bonne bougie', apres760(sig).length === 1 && sig.sens[i] === 1, JSON.stringify(apres760(sig)) + ' attendu ' + i);
  v('FVG : stop sous le bas du trou (100,10) moins 0,25 ATR, objectif en R', sig.stop[i] < 100.1 && sig.stop[i] > 99.5 && sig.R === 3, sig.stop[i]);
  const sm = FAMILLES_ICT.ict_fvg.signaux(ctxDe(scenario(miroir(sc))), p);
  v('FVG baissier (miroir exact) : une VENTE à la même bougie', apres760(sm).length === 1 && sm.sens[i] === -1 && sm.stop[i] > 99.9, JSON.stringify(apres760(sm)));
  const sans = scenario([...fill(10, 100), ...gap, ...fill(30, 102.1)]);
  v('sans retour dans le trou : aucun signal', apres760(FAMILLES_ICT.ict_fvg.signaux(ctxDe(sans), p)).length === 0);
  const invalide = scenario([...fill(10, 100), ...gap, ...fill(3, 102.1), B(102.0, 102.0, 99.0, 99.4), B(99.5, 101.3, 99.4, 101.2), ...fill(10, 101.2)]);
  v('trou traversé par une clôture sous son bas : invalidé, pas de signal au retour', apres760(FAMILLES_ICT.ict_fvg.signaux(ctxDe(invalide), p)).length === 0);
  const vieux = scenario([...fill(10, 100), ...gap, ...fill(60, 102.1), B(100.8, 101.3, 100.5, 101.2)]);
  v('trou trop ancien : pas de signal avec maxAge 48 ; un signal avec maxAge 96', apres760(FAMILLES_ICT.ict_fvg.signaux(ctxDe(vieux), { ...p, maxAge: 48 })).length === 0 && apres760(FAMILLES_ICT.ict_fvg.signaux(ctxDe(vieux), { ...p, maxAge: 96 })).length === 1);
  v('le filtre de tendance H4 bloque (le contexte n’est pas haussier)', apres760(FAMILLES_ICT.ict_fvg.signaux(ctxDe(S), { ...p, tendance: 1 })).length === 0);
}
// ── order block ──
{
  const sc = [...fill(10, 100), B(100.05, 100.1, 99.8, 99.85), B(99.9, 101.0, 99.9, 100.9), ...fill(8, 100.9), B(100.0, 100.35, 99.95, 100.3), ...fill(8, 100.4)];
  const S = scenario(sc), p = P('ict_order_block', { L: 24, dispo: 1.5, maxAge: 96, pad: 0.25, R: 3 }), sig = FAMILLES_ICT.ict_order_block.signaux(ctxDe(S), p), i = 760 + 10 + 2 + 8;
  v('order block haussier : retour sur la dernière bougie baissière avant la cassure → achat', apres760(sig).length === 1 && sig.sens[i] === 1, JSON.stringify(apres760(sig)) + ' attendu ' + i);
  v('order block : stop sous le bas de la zone (99,80)', sig.stop[i] < 99.8 && sig.stop[i] > 99.2);
  const sm = FAMILLES_ICT.ict_order_block.signaux(ctxDe(scenario(miroir(sc))), p);
  v('order block baissier (miroir) : une vente à la même bougie', apres760(sm).length === 1 && sm.sens[i] === -1, JSON.stringify(apres760(sm)));
  const faible = scenario([...fill(10, 100), B(100.05, 100.1, 99.95, 99.96), B(99.97, 100.2, 99.97, 100.15), ...fill(30, 100.15)]);
  v('mouvement trop faible (déplacement 0,2 < 1,5 ATR) : aucune zone, aucun signal', apres760(FAMILLES_ICT.ict_order_block.signaux(ctxDe(faible), p)).length === 0);
  const jamais = scenario([...fill(10, 100), B(100.05, 100.1, 99.8, 99.85), B(99.9, 101.0, 99.9, 100.9), ...fill(40, 100.9)]);
  v('pas de retour sur la zone : aucun signal', apres760(FAMILLES_ICT.ict_order_block.signaux(ctxDe(jamais), p)).length === 0);
}
// ── balayage de liquidité ──
{
  // 60 barres à plancher plat 99,95 (beaucoup de touches : liquidité égale), puis une mèche sous le plancher refermée au-dessus
  const plancher = n => Array.from({ length: n }, () => B(100.0, 100.05, 99.95, 100.02)), meche = B(99.97, 100.05, 99.5, 100.0);
  const S = scenario([...plancher(60), meche, ...plancher(10)]), i = 760 + 60, mk = (S2, o) => FAMILLES_ICT.ict_sweep.signaux(ctxDe(S2), P('ict_sweep', { N: 48, eq: 2, meche: 0.5, pad: 0.25, R: 3, ...o }));
  const s2 = mk(S, {}); v('plancher touché de nombreuses fois, balayé puis refermé (mèche 82 %) → achat à cette bougie', s2.sens[i] === 1 && apres760(s2).length === 1, JSON.stringify(apres760(s2)) + ' attendu ' + i);
  v('stop sous la mèche (99,50) moins 0,25 ATR', s2.stop[i] < 99.5 && s2.stop[i] > 99.0);
  v('exiger 60 touches (il n’y en a que 48 dans la fenêtre) : le motif ne compte plus', mk(S, { eq: 60 }).sens[i] === 0);
  // creux unique : un seul point bas à 99,95 dans une zone à 100,30 ; le balayer ne compte que si l'on accepte une seule touche
  const haut = n => Array.from({ length: n }, () => B(100.3, 100.6, 100.3, 100.45)), unique = [...haut(20), B(100.3, 100.6, 99.95, 100.45), ...haut(39)], S1 = scenario([...unique, B(100.3, 100.6, 99.5, 100.45), ...haut(10)]);
  v('creux unique balayé : refusé avec eq = 2, accepté avec eq = 1', mk(S1, { eq: 2 }).sens[760 + 60] === 0 && mk(S1, { eq: 1 }).sens[760 + 60] === 1, JSON.stringify([mk(S1, { eq: 2 }).sens[820], mk(S1, { eq: 1 }).sens[820]]));
  const sansMeche = scenario([...plancher(60), B(99.52, 100.05, 99.5, 100.0), ...plancher(10)]);
  v('corps plein sous le plancher (mèche < 50 %) : pas de signal', mk(sansMeche, {}).sens[760 + 60] === 0);
  const sm = mk(scenario(miroir([...plancher(60), meche, ...plancher(10)])), {});
  v('balayage baissier (miroir) : une vente à la même bougie', sm.sens[i] === -1 && sm.stop[i] > 100.5);
}
// ── figures : double creux, drapeau ──
{
  const seg = (a, b, n) => Array.from({ length: n }, (_, k) => { const p0 = a + (b - a) * k / n, p1 = a + (b - a) * (k + 1) / n; return B(p0, Math.max(p0, p1) + 0.03, Math.min(p0, p1) - 0.03, p1); });
  const creux = (p, l) => B(p, p + 0.3, l, p + 0.2);                                          // chaque creux est UNE barre bien distincte (pivot strict)
  const sc = [...seg(100, 95.5, 20), creux(95.4, 94.9), ...seg(95.6, 100.1, 20), ...seg(100.1, 95.7, 20), creux(95.5, 95.0), ...seg(95.7, 99.6, 14), ...seg(99.6, 100.5, 6), B(100.5, 100.9, 100.4, 100.8), ...fill(10, 100.8)];
  const S = scenario(sc), p = P('figure_double', { tol: 1, k: 3, pad: 0.25, R: 3 }), sig = FAMILLES_ICT.figure_double.signaux(ctxDe(S), p), l = tous(sig, 760);
  v('double creux (94,9 et 95,0) : un achat à la cassure de la ligne de cou', l.length === 1 && sig.sens[l[0]] === 1 && l[0] >= 760 + 75 && l[0] <= 760 + 90, JSON.stringify(l));
  v('double creux : stop sous les deux creux', l.length && sig.stop[l[0]] < 94.9 && sig.stop[l[0]] > 93.5);
  const sm = FAMILLES_ICT.figure_double.signaux(ctxDe(scenario(miroir(sc))), p), lm = tous(sm, 760);
  v('double sommet (miroir) : une vente', lm.length === 1 && sm.sens[lm[0]] === -1, JSON.stringify(lm));
  const incomplet = scenario([...seg(100, 95.5, 20), creux(95.4, 94.9), ...seg(95.6, 100.1, 20), ...seg(100.1, 92.5, 20), creux(92.4, 91.9), ...seg(92.6, 98, 14), ...fill(15, 98)]);
  v('deuxième creux trop différent du premier (91,9 contre 94,9) : aucune figure', tous(FAMILLES_ICT.figure_double.signaux(ctxDe(incomplet), { ...p, tol: 0.5 }), 760).length === 0);
  // drapeau : impulsion de 6 en 24 bougies, pause serrée de 8 bougies, reprise
  const imp = seg(100, 106, 24), pause = Array.from({ length: 8 }, (_, k) => B(105.4 + (k % 2) * 0.2, 105.8, 105.0, 105.5 + (k % 2) * 0.2));
  const dr = [...imp, ...pause, B(105.6, 106.4, 105.55, 106.3), ...fill(10, 106.3)], pd = P('figure_drapeau', { imp: 3, C: 8, cons: 0.35, pad: 0.25, R: 2 });
  const sf = FAMILLES_ICT.figure_drapeau.signaux(ctxDe(scenario(dr)), pd), lf = tous(sf, 760);
  v('drapeau haussier : une seule entrée à la sortie de la pause', lf.length === 1 && sf.sens[lf[0]] === 1 && lf[0] === 760 + 24 + 8, JSON.stringify(lf));
  v('drapeau : stop sous la pause (105,0)', lf.length && sf.stop[lf[0]] < 105.0 && sf.stop[lf[0]] > 104);
  const sfm = FAMILLES_ICT.figure_drapeau.signaux(ctxDe(scenario(miroir(dr))), pd), lfm = tous(sfm, 760);
  v('drapeau baissier (miroir) : une vente', lfm.length === 1 && sfm.sens[lfm[0]] === -1, JSON.stringify(lfm));
  const large = scenario([...imp, ...Array.from({ length: 8 }, () => B(103, 105.8, 101.5, 104)), B(105.6, 106.4, 105.55, 106.3), ...fill(10, 106.3)]);
  v('pause trop large (3 sur 6) : ce n’est pas un drapeau', tous(FAMILLES_ICT.figure_drapeau.signaux(ctxDe(large), pd), 760).length === 0);
}
// ── premium / discount : propriétés sur une vraie tendance synthétique ──
{
  const M = marcheMixte(14000, 5), ctx = ctxDe(M);
  for (const tf of ['h1', 'h4']) {
    const p = P('ict_premium_discount', { W: 192, niveau: 0.382, tf, pad: 0.25, R: 3 }), sig = FAMILLES_ICT.ict_premium_discount.signaux(ctx, p), phase = tf === 'h4' ? ctx.h4.phase : ctx.h1.phase;
    let bon = true, n = 0; for (const i of tous(sig)) { n++; let hi = -Infinity, lo = Infinity; for (let j = i - 191; j <= i; j++) { hi = Math.max(hi, M.h[j]); lo = Math.min(lo, M.l[j]); } const pos = (M.c[i] - lo) / (hi - lo); if (sig.sens[i] > 0 ? !(phase[i] === 1 && pos <= 0.382 && sig.stop[i] < M.c[i]) : !(phase[i] === 2 && pos >= 0.618 && sig.stop[i] > M.c[i])) bon = false; }
    v('premium/discount ' + tf + ' : chaque signal respecte son contexte de tendance, sa position dans l’intervalle et le côté du stop (' + n + ' signaux)', bon);
  }
}
// ── propriétés générales sur un marché synthétique : stops du bon côté, déterminisme ──
{
  const M = marcheMixte(9000, 8), ctx = ctxDe(M); let total = 0, faux = 0;
  for (const id of ORDRE_ICT) {
    const liste = combinaisons(FAMILLES_ICT[id].grille(0));
    for (const p of [liste[0], liste[liste.length - 1], liste[Math.floor(liste.length / 2)]]) { const sig = FAMILLES_ICT[id].signaux(ctx, p); for (const i of tous(sig)) { total++; if (sig.sens[i] > 0 ? !(sig.stop[i] < M.c[i]) : !(sig.stop[i] > M.c[i])) faux++; } }
  }
  v('sur 9 000 bougies synthétiques : jamais un stop du mauvais côté (' + total + ' signaux)', faux === 0 && total > 0, faux + ' mauvais sur ' + total);
  const a = FAMILLES_ICT.ict_fvg.signaux(ctx, P('ict_fvg')), b = FAMILLES_ICT.ict_fvg.signaux(ctx, P('ict_fvg'));
  v('déterministe : deux calculs identiques', JSON.stringify(Array.from(a.sens)) === JSON.stringify(Array.from(b.sens)) && JSON.stringify(Array.from(a.stop)) === JSON.stringify(Array.from(b.stop)));
}
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
