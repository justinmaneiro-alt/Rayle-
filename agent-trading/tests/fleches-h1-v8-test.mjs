/* Tests des flèches H1 version 8 (flèches v2 filtrées : gros niveau, extrême de swing, alternance + 24 bougies) : node agent-trading/tests/fleches-h1-v8-test.mjs
   Chaque critère seul sur des flèches v2 fabriquées ; mesures d'excursion (jamais un filtre) ; absence de redessin ; bilans à 8 versions. */
import assert from 'node:assert/strict';
import { flechesH1v2 } from '../front/or/fleches-h1-v2.js';
import { listesDetail } from '../front/or/fleches-h1-v4.js';
import { DEPUIS_H1_V7, majeursAvant } from '../front/or/fleches-h1-v7.js';
import { REGLES_H1_V8, DEPUIS_H1_V8, DEPUIS_8, flechesH1v8, bandesV8Avant, excursion, resumeExcursions, segmentsV8, bilans8 } from '../front/or/fleches-h1-v8.js';
import { registreVide, ajouter, verifier, VERSIONS } from '../front/or/registre-fleches.js';
import { VERSIONS_FLECHE_H1, etiquetteComplete, valider } from '../front/or/journal-calcul.js';
import { alea } from '../front/or/zones-or.js';
let n = 0; const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; }, ok = (c, m) => { assert.ok(c, m); n++; };
const H = 3600e3, T0 = Date.UTC(2026, 9, 5, 0);

eq(Object.isFrozen(REGLES_H1_V8), true, 'règles v8 figées');
eq([REGLES_H1_V8.touchesMin, REGLES_H1_V8.toleranceAtr, REGLES_H1_V8.swingBougies, REGLES_H1_V8.swingAtr, REGLES_H1_V8.espacementBougies, REGLES_H1_V8.excursionBougies, REGLES_H1_V8.gainPct, REGLES_H1_V8.pertePct], [8, 0.25, 120, 1, 24, 48, 2, 1], 'consigne : 8 touches, 120 bougies, 1 ATR, 24 bougies ; mesures 48 bougies, 2 % / 1 %');
eq(DEPUIS_H1_V8.t, Date.parse('2026-11-08T11:11:25+01:00'), 'bilan v8 ouvert à la date du commit de ses règles');
ok(DEPUIS_H1_V7.t < DEPUIS_H1_V8.t && Object.keys(DEPUIS_8).length === 8, 'huit versions suivies');

/* série plate oscillante (prix entre 1990 et 2010), flèches v2 fabriquées, bandes injectées */
const B = Array.from({ length: 400 }, (_, i) => { const p = 2000 + 8 * Math.sin(i / 9); return { t: T0 + i * H, o: p, h: p + 2, l: p - 2, c: p, v: 100 }; });
const fin = B[B.length - 1].t + H, lo120 = i => Math.min(...B.slice(Math.max(0, i - 119), i + 1).map(b => b.l)), hi120 = i => Math.max(...B.slice(Math.max(0, i - 119), i + 1).map(b => b.h));
const fl = (i, sens, niveau, atr = 4) => ({ t: B[i].t, i, sens, niveau, type: sens === 'hausse' ? 'support' : 'résistance', regime: 'haussier', atr, version: 'fleches-h1-v2' });
const bande = (bas, haut, touches) => () => [{ bas, haut, p: (bas + haut) / 2, type: 'support', touches, tDerniere: T0, libelle: `Bande ${touches}` }];
const run = (F2, bandes) => flechesH1v8(B, { maintenant: fin, F2, bandes }).map(f => `${f.sens}@${f.i}`);
// une verte au creux (clôture proche du plus bas des 120), une rouge au sommet (clôture proche du plus haut)
const iBas = (() => { let k = 200; for (let i = 180; i < 260; i++) if (B[i].c < B[k].c) k = i; return k; })(), iHaut = (() => { let k = 260; for (let i = 240; i < 320; i++) if (B[i].c > B[k].c) k = i; return k; })();
ok(B[iBas].c - lo120(iBas) < 4 && hi120(iHaut) - B[iHaut].c < 4, 'contrôle : creux et sommet choisis à moins de 1 ATR de l’extrême des 120 bougies');
const N0 = B[iBas].l + 1.5, vBas = fl(iBas, 'hausse', N0), rHaut = fl(iHaut, 'baisse', B[iHaut].h - 1.5);   // niveaux à 1,5 $ des extrêmes : jamais confondus avec un plus haut / bas de la semaine
// 1. gros niveau
eq(run([vBas], bande(N0 - 1, N0 + 1, 9)), [`hausse@${iBas}`], 'niveau dans une bande de 9 touches : gardée');
eq(run([vBas], bande(N0 - 1, N0 + 1, 7)), [], 'bande de 7 touches (pas un gros niveau) : écartée');
eq(run([vBas], bande(N0 + 1.5, N0 + 3, 9)), [], 'bande à plus de 0,25 ATR du niveau : écartée');
eq(run([vBas], bande(N0 + 0.9, N0 + 3, 9)), [`hausse@${iBas}`], 'bande à moins de 0,25 ATR (0,9 $ pour un ATR de 4) : gardée');
// plus bas majeur : sans bande, le plus bas de la semaine précédente (= creux de l'oscillation) compte comme gros niveau
{ let k3 = 340; for (let i = 340; i < 399; i++) if (B[i].c < B[k3].c) k3 = i;   // creux de la 3e semaine (la 1re, incomplète, est ignorée)
  const maj = majeursAvant(B)[k3].find(m => /plus bas de la semaine/.test(m.quoi));
  ok(maj && B[k3].c - lo120(k3) < 4, 'contrôle : plus bas de la semaine précédente connu au 3e creux');
  eq(run([fl(k3, 'hausse', maj.p)], () => []), [`hausse@${k3}`], `niveau sur le plus bas de la semaine précédente (${maj.p.toFixed(1)}) : gardée (majeur)`); }
eq(run([vBas], () => []), [], 'ni bande ni majeur à moins de 0,25 ATR : écartée');
// 2. extrême de swing
{ const iMilieu = (() => { for (let i = 200; i < 300; i++) if (B[i].c - lo120(i) > 6 && hi120(i) - B[i].c > 6) return i; })();
  eq(run([fl(iMilieu, 'hausse', B[iMilieu].l)], bande(B[iMilieu].l - 1, B[iMilieu].l + 1, 9)), [], 'verte au milieu de la plage (à plus de 1 ATR du plus bas) : écartée');
  eq(run([fl(iMilieu, 'baisse', B[iMilieu].h)], bande(B[iMilieu].h - 1, B[iMilieu].h + 1, 9)), [], 'rouge au milieu de la plage : écartée'); }
eq(run([fl(iBas, 'baisse', B[iBas].h)], bande(B[iBas].h - 1, B[iBas].h + 1, 9)), [], 'rouge au creux (loin du plus haut) : écartée');
// 3. alternance et espacement
const tous = (bas, haut) => () => [{ bas: 1900, haut: 2100, p: 2000, type: 'support', touches: 20, tDerniere: T0, libelle: 'Large' }];
eq(run([vBas, rHaut], tous()), [`hausse@${iBas}`, `baisse@${iHaut}`], 'verte au creux puis rouge au sommet : les deux');
{ const iBas2 = iBas + 56 < 400 ? (() => { let k = iBas + 40; for (let i = iBas + 40; i < iBas + 80; i++) if (B[i].c < B[k].c) k = i; return k; })() : null;
  eq(run([vBas, fl(iBas2, 'hausse', B[iBas2].l)], tous()), [`hausse@${iBas}`], 'deux vertes de suite : la seconde est écartée'); }
{ const k = iBas + 10; eq(run([vBas, { ...fl(k, 'baisse', B[k].h), atr: 40 }], tous()), [`hausse@${iBas}`], 'rouge moins de 24 bougies après la verte : écartée'); }
// segment et infobulle
{ const F = flechesH1v8(B, { maintenant: fin, F2: [vBas], bandes: () => [{ bas: N0 - 1, haut: N0 + 1, p: N0, type: 'support', touches: 9, tDerniere: B[iBas - 30].t, libelle: 'Support test · 9 touches' }] });
  const S = segmentsV8(B, F);
  eq([S.length, S[0].t0, S[0].t1, S[0].p], [1, B[iBas - 30].t, B[iBas].t, vBas.niveau], 'segment : de la dernière touche connue du niveau jusqu’à la flèche');
  ok(S[0].detail.some(l => /^régime H1/.test(l)) && S[0].detail.some(l => /9 touches/.test(l)) && S[0].detail.some(l => /distance de l'extrême/.test(l)) && S[0].detail.some(l => /rang de swing : \d+ %/.test(l)), 'infobulle : régime, niveau, touches, distance, rang de swing');
  ok(F[0].rang >= 0 && F[0].rang < 0.2, `rang de swing au creux : ${Math.round(F[0].rang * 100)} %`); }

/* mesures d'excursion (jamais un filtre) */
{ const C = Array.from({ length: 80 }, (_, i) => ({ t: T0 + i * H, o: 2000, h: 2000 + (i > 10 && i < 20 ? 50 : 1), l: 2000 - (i === 30 ? 30 : 1), c: 2000 }));
  const x = excursion(C, { i: 5, sens: 'hausse', atr: 10 });
  ok(Math.abs(x.favAtr - 5) < 1e-9 && Math.abs(x.favPct - 2.5) < 1e-9 && Math.abs(x.advAtr - 3) < 1e-9 && Math.abs(x.advPct - 1.5) < 1e-9, 'excursions favorable / défavorable en ATR et en %');
  eq(x.deuxAvantUn, true, '+2 % atteint (bougie 11) avant −1 % (bougie 30)');
  eq(excursion(C, { i: 5, sens: 'baisse', atr: 10 }).deuxAvantUn, false, 'rouge : −1 % contre elle (bougie 11) avant +2 %');
  eq(excursion(C, { i: 40, sens: 'hausse', atr: 10 }), null, '48 bougies pas encore closes : non mesurable');
  const Cm = C.map((b, i) => i === 8 ? { ...b, h: 2050, l: 1975 } : b);
  eq(excursion(Cm, { i: 5, sens: 'hausse', atr: 10 }).deuxAvantUn, false, 'les deux dans la même bougie : contre la flèche');
  const R = resumeExcursions(C, [{ t: C[5].t, sens: 'hausse', atr: 10 }, { t: C[6].t, sens: 'baisse', atr: 10 }]); eq([R.n, R.deux], [2, 1], 'résumé des excursions'); }
// le filtre n'utilise jamais l'excursion : une flèche identique gardée quel que soit l'avenir
{ const futurBas = B.map((b, i) => i > iBas ? { ...b, h: b.h - 50, l: b.l - 50, o: b.o - 50, c: b.c - 50 } : b);
  eq(flechesH1v8(futurBas, { maintenant: fin, F2: [vBas], bandes: bande(N0 - 1, N0 + 1, 9) }).length, 1, 'avenir très défavorable : la flèche est gardée quand même (mesure ≠ filtre)'); }

/* niveaux réels : v8 avec ou sans F2 identique, sous-ensemble de v2, rejeu sans redessin */
{ const r = alea(17), R = []; let p = 2000;
  for (let i = 0; i < 900; i++) { const d = (r() - 0.5) * 7, o = p, c = p + d; p = c; const wk = r() < 0.2 ? 5 + r() * 5 : 1; R.push({ t: T0 + i * H, o, c, h: Math.max(o, c) + (r() < 0.5 ? wk : 1), l: Math.min(o, c) - (r() < 0.5 ? wk : 1), v: 50 + r() * 100 }); }
  const m = R[R.length - 1].t + H, memo = new Map(), L = (X, i) => { if (!memo.has(X[i].t)) memo.set(X[i].t, listesDetail(X, i)); return memo.get(X[i].t); };
  const mb = new Map(), Bd = (X, i) => { if (!mb.has(X[i].t)) mb.set(X[i].t, bandesV8Avant(X, i)); return mb.get(X[i].t); };
  const F2 = flechesH1v2(R, { maintenant: m, listes: L }), F8 = flechesH1v8(R, { maintenant: m, F2, bandes: Bd }), cle = f => `${f.t}|${f.sens}|${f.niveau.toFixed(4)}`;
  eq(flechesH1v8(R, { maintenant: m, listes: L, bandes: Bd }).map(cle), F8.map(cle), 'v8 identique avec les flèches v2 données ou recalculées');
  ok(F8.every(f => F2.some(g => g.t === f.t && g.sens === f.sens && g.niveau === f.niveau)), `toutes les flèches v8 sont des flèches v2 (${F8.length} sur ${F2.length})`);
  ok(F8.every((f, k) => !k || (f.sens !== F8[k - 1].sens && f.i - F8[k - 1].i >= 24)), 'alternance et ≥ 24 bougies');
  let ecarts = 0; for (let i = R.length - 60; i < R.length; i++) { const pref = R.slice(0, i + 1), G = flechesH1v8(pref, { maintenant: pref[i].t + H, listes: L, bandes: Bd }); if (G.map(cle).join(';') !== F8.filter(f => f.i <= i).map(cle).join(';')) ecarts++; }
  eq(ecarts, 0, 'v8 : rejeu bougie par bougie, aucune flèche redessinée'); }

/* bilans, registre, journal */
{ const r = alea(5), Bh = []; let p = 2000; const t0 = DEPUIS_8['fleches-v1'].t - 1500 * H;
  for (let i = 0; i < 2000; i++) { const o = p, c = p + (r() - 0.5) * 6; p = c; Bh.push({ t: t0 + i * H, o, c, h: Math.max(o, c) + r() * 3, l: Math.min(o, c) - r() * 3, v: 100 }); }
  const Fl = []; for (let i = 100; i < 1990; i += 9) Fl.push({ t: Bh[i].t, sens: i % 2 ? 'hausse' : 'baisse', atr: 3 });
  const T = bilans8(Bh, Object.fromEntries(Object.keys(DEPUIS_8).map(v => [v, Fl])), { maintenant: Bh[Bh.length - 1].t + H, spread: 0.5 });
  ok(T['fleches-h1-v8'].total === Fl.filter(f => f.t >= DEPUIS_H1_V8.t).length && /depuis le 8 nov\. 2026, 11 h 11/.test(T['fleches-h1-v8'].texte), 'v8 : depuis le commit 529a682');
  ok(Object.values(T).every(b => !b.assez || (b.pHolm >= b.p && /Holm, 8 versions suivies/.test(b.texte))), 'Holm sur les 8 versions suivies');
  ok(/Mesures \(pas un filtre\)|Mesures d’excursion \(pas un filtre\)/.test(T['fleches-h1-v8'].texte) && T['fleches-h1-v8'].excursions, 'bilan v8 : mesures d’excursion jointes, dites « pas un filtre »'); }
{ ok(VERSIONS.length >= 8 && VERSIONS[7] === 'fleches-h1-v8', 'registre : v1 à v8 (v9 ajoutée ensuite à côté)'); const f = (t, s = 'hausse') => ({ t, sens: s, niveau: 2000, type: 'support' });
  let R = registreVide(1); for (const v of VERSIONS.slice(0, 7)) R = ajouter(R, v, [f(5)], { vu: 10 }).registre;
  const avant = JSON.stringify(VERSIONS.slice(0, 7).map(v => R.versions[v])); R = ajouter(R, 'fleches-h1-v8', [f(5), f(9)], { vu: 20 }).registre;
  eq(JSON.stringify(VERSIONS.slice(0, 7).map(v => R.versions[v])), avant, 'registres v1 à v7 intacts'); eq(verifier(R, 'fleches-h1-v8').ok, true, 'registre v8 chaîné'); }
ok(VERSIONS_FLECHE_H1.includes('fleches-h1-v8'), 'journal : v8 proposée');
const tr = { source: 'saisie', sens: 'achat', entree: 4000, stop: 3990, taille: 1, etiquette: 'flèche H1', versionFleche: 'fleches-h1-v8' };
eq([valider(tr), etiquetteComplete(tr)], [[], 'flèche H1 · fleches-h1-v8'], 'journal : flèche H1 · fleches-h1-v8');

console.log(`fleches-h1-v8-test : ${n} vérifications OK`);
