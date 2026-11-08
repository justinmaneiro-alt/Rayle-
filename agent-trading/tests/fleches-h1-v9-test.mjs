/* Tests des flèches H1 version 9 (flèches v2, trois filtres : niveau ≥ 5 touches ou majeur, alternance, 24 bougies) : node agent-trading/tests/fleches-h1-v9-test.mjs
   Chaque filtre seul ; aucun filtre d'extrême de swing ; segments sans étiquette permanente ; mesures d'excursion ; bilans à 9 versions. */
import assert from 'node:assert/strict';
import { flechesH1v2 } from '../front/or/fleches-h1-v2.js';
import { listesDetail } from '../front/or/fleches-h1-v4.js';
import { majeursAvant } from '../front/or/fleches-h1-v7.js';
import { DEPUIS_H1_V8, flechesH1v8 } from '../front/or/fleches-h1-v8.js';
import { REGLES_H1_V9, DEPUIS_H1_V9, DEPUIS_9, flechesH1v9, bandesV9Avant, segmentsV9, bilans9 } from '../front/or/fleches-h1-v9.js';
import { registreVide, ajouter, verifier, VERSIONS } from '../front/or/registre-fleches.js';
import { VERSIONS_FLECHE_H1, etiquetteComplete, valider } from '../front/or/journal-calcul.js';
import { alea } from '../front/or/zones-or.js';
let n = 0; const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; }, ok = (c, m) => { assert.ok(c, m); n++; };
const H = 3600e3, T0 = Date.UTC(2026, 9, 5, 0);

eq(Object.isFrozen(REGLES_H1_V9), true, 'règles v9 figées');
eq([REGLES_H1_V9.touchesMin, REGLES_H1_V9.toleranceAtr, REGLES_H1_V9.espacementBougies, REGLES_H1_V9.swingAtr, REGLES_H1_V9.excursionBougies], [5, 0.25, 24, Infinity, 48], 'consigne : 5 touches, 24 bougies, aucun filtre de swing ; mesures sur 48 bougies');
eq(DEPUIS_H1_V9.t, Date.parse('2026-11-08T13:03:36+01:00'), 'bilan v9 ouvert à la date du commit de ses règles');
ok(DEPUIS_H1_V8.t < DEPUIS_H1_V9.t && Object.keys(DEPUIS_9).length === 9, 'neuf versions suivies');

/* série plate oscillante, flèches v2 fabriquées, bandes injectées */
const B = Array.from({ length: 400 }, (_, i) => { const p = 2000 + 8 * Math.sin(i / 9); return { t: T0 + i * H, o: p, h: p + 2, l: p - 2, c: p, v: 100 }; });
const fin = B[B.length - 1].t + H, fl = (i, sens, niveau, atr = 4) => ({ t: B[i].t, i, sens, niveau, type: sens === 'hausse' ? 'support' : 'résistance', regime: 'haussier', atr, version: 'fleches-h1-v2' });
const bande = (bas, haut, touches) => () => [{ bas, haut, p: (bas + haut) / 2, type: 'support', touches, tDerniere: T0, libelle: `Support · ${touches} touches` }];
const run = (F2, bandes) => flechesH1v9(B, { maintenant: fin, F2, bandes }).map(f => `${f.sens}@${f.i}`);
const N0 = B[200].c + 1.3, v = fl(200, 'hausse', N0);
// 1. niveau d'au moins 5 touches (ou majeur)
eq(run([v], bande(N0 - 1, N0 + 1, 5)), ['hausse@200'], 'bande de 5 touches : gardée');
eq(run([v], bande(N0 - 1, N0 + 1, 4)), [], 'bande de 4 touches : écartée');
eq(run([v], bande(N0 + 1.5, N0 + 3, 9)), [], 'bande à plus de 0,25 ATR : écartée');
eq(flechesH1v8(B, { maintenant: fin, F2: [v], bandes: bande(N0 - 1, N0 + 1, 5) }).length, 0, 'contrôle : v8 (8 touches) l’écartait');
{ let k3 = 340; for (let i = 340; i < 399; i++) if (B[i].c < B[k3].c) k3 = i; const maj = majeursAvant(B)[k3].find(m => /plus bas de la semaine/.test(m.quoi));
  eq(run([fl(k3, 'hausse', maj.p)], () => []), [`hausse@${k3}`], 'plus bas de la semaine précédente : gardée (majeur)'); }
// aucun filtre d'extrême de swing : une flèche au milieu de la plage est gardée
{ let iM = 200; for (let i = 200; i < 300; i++) { const w = B.slice(i - 119, i + 1), lo = Math.min(...w.map(b => b.l)), hi = Math.max(...w.map(b => b.h)); if (B[i].c - lo > 6 && hi - B[i].c > 6) { iM = i; break; } }
  eq(run([fl(iM, 'hausse', B[iM].c)], bande(B[iM].c - 1, B[iM].c + 1, 6)), [`hausse@${iM}`], 'flèche loin des extrêmes des 120 bougies : gardée (pas de filtre de swing)'); }
// 2. alternance, 3. espacement
const large = () => [{ bas: 1900, haut: 2100, p: 2000, type: 'support', touches: 20, tDerniere: T0, libelle: 'Large' }];
eq(run([fl(150, 'hausse', 1999), fl(180, 'hausse', 1999)], large), ['hausse@150'], 'deux vertes de suite : la seconde est écartée');
eq(run([fl(150, 'hausse', 1999), fl(170, 'baisse', 2001)], large), ['hausse@150'], 'rouge 20 bougies après la verte : écartée (< 24)');
eq(run([fl(150, 'hausse', 1999), fl(174, 'baisse', 2001), fl(198, 'hausse', 1999)], large), ['hausse@150', 'baisse@174', 'hausse@198'], 'verte, rouge, verte à 24 bougies : toutes');
eq(run([fl(150, 'hausse', 1999), fl(160, 'baisse', 2001), fl(180, 'baisse', 2001)], large), ['hausse@150', 'baisse@180'], 'une rouge trop proche est écartée, la suivante (≥ 24) est gardée');
// segments sans étiquette permanente, infobulle complète
{ const F = flechesH1v9(B, { maintenant: fin, F2: [v], bandes: () => [{ bas: N0 - 1, haut: N0 + 1, p: N0, type: 'support', touches: 6, tDerniere: B[170].t, libelle: 'Support test · 6 touches' }] }), S = segmentsV9(B, F);
  eq([S.length, S[0].t0, S[0].t1, S[0].sansEtiquette], [1, B[170].t, B[200].t, true], 'segment de la dernière touche à la flèche, sans étiquette permanente');
  ok(S[0].detail.some(l => /^régime H1/.test(l)) && S[0].detail.some(l => /6 touches/.test(l)) && S[0].detail.some(l => /distance de l'extrême/.test(l)) && S[0].detail.some(l => /excursion favorable .* ATR \(.* %\), défavorable/.test(l)), 'infobulle : régime, niveau, touches, distance, excursions');
  eq(F[0].version, 'fleches-h1-v9', 'flèches marquées fleches-h1-v9'); }

/* niveaux réels : v9 ⊂ v2, alternance et espacement, rejeu sans redessin */
{ const r = alea(17), R = []; let p = 2000;
  for (let i = 0; i < 900; i++) { const d = (r() - 0.5) * 7, o = p, c = p + d; p = c; const wk = r() < 0.2 ? 5 + r() * 5 : 1; R.push({ t: T0 + i * H, o, c, h: Math.max(o, c) + (r() < 0.5 ? wk : 1), l: Math.min(o, c) - (r() < 0.5 ? wk : 1), v: 50 + r() * 100 }); }
  const m = R[R.length - 1].t + H, memo = new Map(), L = (X, i) => { if (!memo.has(X[i].t)) memo.set(X[i].t, listesDetail(X, i)); return memo.get(X[i].t); };
  const mb = new Map(), Bd = (X, i) => { if (!mb.has(X[i].t)) mb.set(X[i].t, bandesV9Avant(X, i)); return mb.get(X[i].t); };
  const F2 = flechesH1v2(R, { maintenant: m, listes: L }), F9 = flechesH1v9(R, { maintenant: m, F2, bandes: Bd }), cle = f => `${f.t}|${f.sens}|${f.niveau.toFixed(4)}`;
  eq(flechesH1v9(R, { maintenant: m, listes: L, bandes: Bd }).map(cle), F9.map(cle), 'v9 identique avec les flèches v2 données ou recalculées');
  ok(F9.length > 0 && F9.every(f => F2.some(g => g.t === f.t && g.sens === f.sens && g.niveau === f.niveau)), `toutes les flèches v9 sont des flèches v2 (${F9.length} sur ${F2.length})`);
  ok(F9.every((f, k) => !k || (f.sens !== F9[k - 1].sens && f.i - F9[k - 1].i >= 24)), 'alternance et ≥ 24 bougies');
  ok(F9.every(f => f.gros.source === 'majeur' || f.gros.touches >= 5), 'niveau d’au moins 5 touches ou majeur');
  let ecarts = 0; for (let i = R.length - 60; i < R.length; i++) { const pref = R.slice(0, i + 1), G = flechesH1v9(pref, { maintenant: pref[i].t + H, listes: L, bandes: Bd }); if (G.map(cle).join(';') !== F9.filter(f => f.i <= i).map(cle).join(';')) ecarts++; }
  eq(ecarts, 0, 'v9 : rejeu bougie par bougie, aucune flèche redessinée'); }

/* bilans, registre, journal */
{ const r = alea(5), Bh = []; let p = 2000; const t0 = DEPUIS_9['fleches-v1'].t - 1500 * H;
  for (let i = 0; i < 2000; i++) { const o = p, c = p + (r() - 0.5) * 6; p = c; Bh.push({ t: t0 + i * H, o, c, h: Math.max(o, c) + r() * 3, l: Math.min(o, c) - r() * 3, v: 100 }); }
  const Fl = []; for (let i = 100; i < 1990; i += 9) Fl.push({ t: Bh[i].t, sens: i % 2 ? 'hausse' : 'baisse', atr: 3 });
  const T = bilans9(Bh, Object.fromEntries(Object.keys(DEPUIS_9).map(v => [v, Fl])), { maintenant: Bh[Bh.length - 1].t + H, spread: 0.5 });
  ok(T['fleches-h1-v9'].total === Fl.filter(f => f.t >= DEPUIS_H1_V9.t).length && /depuis le 8 nov\. 2026, 13 h 03/.test(T['fleches-h1-v9'].texte), 'v9 : depuis le commit f677034');
  ok(Object.values(T).every(b => !b.assez || (b.pHolm >= b.p && /Holm, 9 versions suivies/.test(b.texte))), 'Holm sur les 9 versions suivies');
  ok(/pas un filtre/.test(T['fleches-h1-v9'].texte) && T['fleches-h1-v9'].excursions, 'bilan v9 : excursions jointes, dites « pas un filtre »'); }
{ eq(VERSIONS.length, 9, 'registre : neuf versions'); const f = (t, s = 'hausse') => ({ t, sens: s, niveau: 2000, type: 'support' });
  let R = registreVide(1); for (const v of VERSIONS.slice(0, 8)) R = ajouter(R, v, [f(5)], { vu: 10 }).registre;
  const avant = JSON.stringify(VERSIONS.slice(0, 8).map(v => R.versions[v])); R = ajouter(R, 'fleches-h1-v9', [f(5), f(9)], { vu: 20 }).registre;
  eq(JSON.stringify(VERSIONS.slice(0, 8).map(v => R.versions[v])), avant, 'registres v1 à v8 intacts'); eq(verifier(R, 'fleches-h1-v9').ok, true, 'registre v9 chaîné'); }
eq(VERSIONS_FLECHE_H1[0], 'fleches-h1-v9', 'journal : v9 en premier');
const tr = { source: 'saisie', sens: 'achat', entree: 4000, stop: 3990, taille: 1, etiquette: 'flèche H1', versionFleche: 'fleches-h1-v9' };
eq([valider(tr), etiquetteComplete(tr)], [[], 'flèche H1 · fleches-h1-v9'], 'journal : flèche H1 · fleches-h1-v9');

console.log(`fleches-h1-v9-test : ${n} vérifications OK`);
