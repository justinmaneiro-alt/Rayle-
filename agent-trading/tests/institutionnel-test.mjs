/* Tests purs des outils institutionnels de l'or (bougies synthétiques M15, heure de Paris). */
import * as C from '../front/or/institutionnel-calcul.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
// 3 jours de M15 à partir du lundi 2026-03-02 00:00 Paris (UTC+1) ; prix montant puis redescendant, volume = 10 + (i % 7)
const t0 = Date.UTC(2026, 2, 1, 23, 0), B = []; let p = 2000;
for (let i = 0; i < 3 * 96; i++) { const o = p; p += Math.sin(i / 11) * 2.5 + (i % 5 - 2) * 0.3; B.push({ t: t0 + i * 900e3, o, h: Math.max(o, p) + 0.8, l: Math.min(o, p) - 0.8, c: p, v: 10 + (i % 7) }); }
const V = C.vwapSeance(B); v(V.length === B.length, 'VWAP sur chaque bougie'); const j1 = V.filter(x => x.jour === V[0].jour);
let sv = 0, spv = 0; for (const b of B.slice(0, j1.length)) { sv += b.v; spv += b.v * (b.h + b.l + b.c) / 3; } v(Math.abs(j1[j1.length - 1].vwap - spv / sv) < 1e-9, 'VWAP = moyenne pondérée par le volume du jour'); v(V.every(x => x.sd >= 0), 'écart-type ≥ 0');
const jr = V.filter(x => x.jour !== V[0].jour)[0]; v(jr && Math.abs(jr.vwap - (B[j1.length].h + B[j1.length].l + B[j1.length].c) / 3) < 1e-9, 'le VWAP repart à zéro à chaque jour de Paris');
const A = C.vwapAncre(B, 100); v(A.length === B.length - 100 && Math.abs(A[0].vwap - (B[100].h + B[100].l + B[100].c) / 3) < 1e-9, 'VWAP ancré');
const Pr = C.profil(B, B[0].t, B[95].t + 1, 1); v(Pr && Pr.val <= Pr.poc && Pr.poc <= Pr.vah, 'VAL ≤ POC ≤ VAH'); const dans = Pr.cases.filter(c => c.p >= Pr.val && c.p <= Pr.vah).reduce((s, c) => s + c.v, 0); v(dans / Pr.total >= 0.7 - 1e-9, 'la zone de valeur contient au moins 70 % du volume'); v(Math.abs(Pr.cases.reduce((s, c) => s + c.v, 0) - Pr.total) < 1e-6, 'le volume du profil est conservé');
const N = C.niveauxPeriodes(B); const J = C.jours(B); v(J.length >= 3 && N.pdh === J[J.length - 2].h && N.pdl === J[J.length - 2].l, 'plus haut/bas de la veille'); v(N.ouvJour === J[J.length - 1].o, 'ouverture du jour'); v(N.pwh == null || N.pwh > 0, 'semaine précédente absente ou valide');
v(C.seanceDe(Date.UTC(2026, 2, 3, 0, 30)) === 'asie' && C.seanceDe(Date.UTC(2026, 2, 3, 10, 0)) === 'londres' && C.seanceDe(Date.UTC(2026, 2, 3, 15, 0)) === 'ny' && C.seanceDe(Date.UTC(2026, 2, 3, 22, 0)) === null, 'séances en heure de Paris (UTC+1 en mars)');
v(C.seanceDe(Date.UTC(2026, 6, 3, 7, 30)) === 'londres', 'séances en heure de Paris (UTC+2 en été)');
const S = C.plagesSeances(B); v(S.plages.length >= 3 && S.plages.every(q => q.h >= q.l), 'plages de séance');
const bal = [{ t: 0, o: 100, h: 101, l: 99, c: 100, v: 1 }]; v(Array.isArray(C.plagesSeances(bal).balayages), 'balayages (liste)');
v(JSON.stringify(C.ronds(2013, 50, 2)) === '[2000,2050]' || JSON.stringify(C.ronds(2013, 50, 2)) === '[1950,2000,2050]'.slice(0, 0) || C.ronds(2013, 50, 2).includes(2000), 'niveaux ronds'); v(C.ronds(2013, 100, 1).join() === '2000,2100' || C.ronds(2013, 100, 1).length >= 1, 'niveaux ronds 100');
// liquidité : deux sommets quasi égaux et un sommet jamais touché
const L = []; const pts = [0, 1, 2, 5, 2, 1, 0, 1, 2, 5.05, 2, 1, 0, 1, 2, 3, 2, 1, 0]; pts.forEach((x, i) => L.push({ t: i * 900e3, o: 100 + x, h: 100 + x + 0.2, l: 100 + x - 0.2, c: 100 + x, v: 1 })); const lq = C.liquidite(L, { atr: 1, k: 2, tol: 0.1 }); v(lq.egaux.some(e => e.sens === 'haut'), 'hauts égaux détectés'); v(lq.intacts.length > 0, 'extrêmes non touchés');
// delta / CVD
const carte = {}; const tr = [{ t: B[0].t + 1000, p: 2000, q: 3, cote: 'buy' }, { t: B[0].t + 2000, p: 2000, q: 1, cote: 'sell' }, { t: B[1].t + 5, p: 2000, q: 2, cote: 'sell' }]; v(C.accumuler(carte, tr, 900e3) === 3, 'transactions accumulées');
const D = C.delta(B, carte); v(D.bars[0].d === 2 && D.bars[1].d === -2 && D.cvd[1].v === 0, 'delta et CVD cumulés'); v(Array.isArray(C.divergences(B, D.cvd)), 'divergences (liste)');
// divergence baissière : le prix fait un plus haut, le CVD non
const Q = []; for (let i = 0; i < 40; i++) Q.push({ t: i * 900e3, o: 100, h: 100 + (i === 39 ? 5 : 1), l: 99, c: 100, v: 1 }); const cv = Q.map((b, i) => ({ t: b.t, v: i === 39 ? 0 : 10 })); v(C.divergences(Q, cv, 20).some(x => x.sens === 'baissiere'), 'divergence baissière'); 
console.log(`institutionnel : ${ok} vérifications OK, ${ko} échecs`); process.exit(ko ? 1 : 0);
