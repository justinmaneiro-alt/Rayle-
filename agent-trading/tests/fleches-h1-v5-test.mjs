/* Tests des flèches H1 version 5 et des niveaux H1 affichés (niveaux-h1-v5) : node agent-trading/tests/fleches-h1-v5-test.mjs
   Séries fabriquées : sens aligné sur le régime H1, niveaux affichés seulement, règle A d'origine, B et C de v2 ; sélection v5 des bandes ;
   absence de redessin ; liste partagée identique pour v2 / v3 / v4. */
import assert from 'node:assert/strict';
import { REGLES_H1_V2, flechesH1v2, regimes } from '../front/or/fleches-h1-v2.js';
import { listesDetail, DEPUIS_H1_V4 } from '../front/or/fleches-h1-v4.js';
import { REGLES_H1_V5, REGLES_NIVEAUX_H1_V5, DEPUIS_H1_V5, DEPUIS_5, selectionV5, listesDeux, flechesH1v5, bilans5 } from '../front/or/fleches-h1-v5.js';
import { niveauxPeriode, REGLES_NIVEAUX } from '../front/or/niveaux-periode.js';
import { registreVide, ajouter, verifier, VERSIONS } from '../front/or/registre-fleches.js';
import { VERSIONS_FLECHE_H1, etiquetteComplete, valider } from '../front/or/journal-calcul.js';
import { alea } from '../front/or/zones-or.js';
let n = 0; const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; }, ok = (c, m) => { assert.ok(c, m); n++; };
const H = 3600e3, T0 = Date.UTC(2026, 9, 1);

// règles
eq([Object.isFrozen(REGLES_H1_V5), Object.isFrozen(REGLES_NIVEAUX_H1_V5)], [true, true], 'règles v5 figées');
for (const k of Object.keys(REGLES_H1_V2).filter(k => !['version', 'ecrites'].includes(k))) eq(REGLES_H1_V5[k], REGLES_H1_V2[k], `seuil « ${k} » identique à v2`);
eq([REGLES_NIVEAUX_H1_V5.touchesMin, REGLES_NIVEAUX_H1_V5.parCote, REGLES_NIVEAUX_H1_V5.forts], [5, 6, 2], 'niveaux v5 : 5 touches, 6 par côté, 2 forts');
eq(DEPUIS_H1_V5.t, Date.parse('2026-11-08T02:58:46+01:00'), 'bilan v5 ouvert à la date du commit de ses règles');
ok(DEPUIS_H1_V4.t < DEPUIS_H1_V5.t && Object.keys(DEPUIS_5).length === 5, 'cinq versions suivies, chacune sa date');

/* sélection v5 des bandes */
{ const b = (p, touches, importance, extreme = false) => ({ bas: p, haut: p, p, touches, importance, extreme, tDerniere: T0, niveaux: 1 });
  const N = { a: 10, toutes: [b(2100, 6, 6), b(2140, 5, 5), b(2180, 4, 40), b(2220, 9, 9), b(2260, 7, 7), b(2300, 5, 5.5), b(2340, 6, 6.5), b(2380, 8, 8), b(2500, 1, 0.1, true), b(1950, 3, 3), b(1900, 5, 5), b(1855, 5, 5.2), b(1855 + 4, 2, 2)] };
  const S = selectionV5(N, 2000), R = S.filter(x => x.cote === 'resistance'), Su = S.filter(x => x.cote === 'support');
  ok(R.length === 6 && Su.length === 2, `au plus 6 par côté (${R.length} / ${Su.length})`);
  ok(S.every(x => x.touches >= 5 || x.extreme), 'au moins 5 touches (ou plus haut / plus bas majeur)');
  ok(R.some(x => x.extreme && x.p === 2500), 'le plus haut majeur est toujours gardé');
  ok(!S.some(x => x.p === 2180), 'bande de 4 touches écartée même très importante');
  ok(Su.some(x => x.p === 1855 && x.touches === 7), 'bandes à moins de 1 ATR fusionnées (5 + 2 touches)');
  eq(['resistance', 'support'].map(c => S.filter(x => x.cote === c && x.fort).length), [2, 2], '2 bandes fortes de chaque côté');
  ok(S.every((x, i) => !i || S[i - 1].p >= x.p) && S.every(x => /^(Résistance|Support) [\d  ]+.* · \d+ touches?$/.test(x.texte)), 'triées, étiquettes courtes en français'); }
// sur une vraie onde : plus de bandes que niveaux-periode-v1 quand il y en a, toutes espacées d'au moins 1 ATR
{ const r = alea(3), onde = []; for (let i = 0; i < 40 * 24; i++) { const m = 2000 + 100 * Math.sin(i / 12) + 30 * Math.sin(i / 47) + (r() - 0.5) * 6, o = m + (r() - 0.5) * 8; onde.push({ t: T0 + i * H, o, h: Math.max(o, m) + 4 + r() * 3, l: Math.min(o, m) - 4 - r() * 3, c: m, v: 50 + r() * 100 }); }
  const N = niveauxPeriode(onde, { periode: 'H1', maintenant: onde[onde.length - 1].t + H, prix: 2000 }), S = selectionV5(N, 2000), tri = S.slice().sort((x, y) => x.bas - y.bas);
  ok(tri.every((b, i) => !i || b.bas - tri[i - 1].haut >= N.a - 1e-6), 'bandes v5 espacées d’au moins 1 ATR (pas de chevauchement)');
  ok(S.filter(b => b.cote === 'resistance').length <= 6 && S.filter(b => b.cote === 'support').length <= 6, 'v5 : au plus 6 de chaque côté');
  ok(N.bandes.length <= 2 * REGLES_NIVEAUX.parCote, 'contrôle : niveaux-periode-v1 inchangé (≤ 4 par côté)'); }

/* série fabriquée en tendance (haussière ou baissière) */
const pxDe = p => i => 2000 + p * i;
function serie(nb, pente, modif = {}) { const px = pxDe(pente), B = []; for (let i = 0; i < nb; i++) { const p = px(i); B.push({ t: T0 + i * H, o: p - 0.2 * Math.sign(pente || 1), h: p + 1, l: p - 1, c: p + 0.2 * Math.sign(pente || 1), v: 100 }); } for (const [i, f] of Object.entries(modif)) B[+i] = { ...B[+i], ...f(px(+i)) }; return B; }
const rejHausse = p => ({ o: p, c: p + 0.3, h: p + 0.5, l: p - 1.5 }), rejBaisse = p => ({ o: p, c: p - 0.3, h: p + 1.5, l: p - 0.5 });
const niv = (pente, d, type, extra = {}) => i => [{ bas: pxDe(pente)(i) + d, haut: pxDe(pente)(i) + d, type, touches: 6, ...extra }];
const plan = P => (C, i) => (P[i] ? P[i](i) : []), fin = B => B[B.length - 1].t + H;
const run = (f, B, P) => f(B, { maintenant: fin(B), listes: plan(P) }).map(x => `${x.sens}@${x.i}`);
const v5 = (B, P) => run(flechesH1v5, B, P), v2 = (B, P) => run(flechesH1v2, B, P);
const HA = 0.05, BA = -0.05;
eq(regimes(serie(150, HA))[120], 'haussier', 'série montante : régime haussier'); eq(regimes(serie(150, BA))[120], 'baissier', 'série descendante : régime baissier');

// correction 1 : sens aligné sur le régime
eq(v5(serie(150, HA, { 110: rejHausse }), { 110: niv(HA, -1.5, 'support') }), ['hausse@110'], 'haussier : verte sur support');
eq(v5(serie(150, HA, { 110: rejBaisse }), { 110: niv(HA, 1.5, 'résistance') }), [], 'haussier : aucune rouge (contre le régime)');
eq(v2(serie(150, HA, { 110: rejBaisse }), { 110: niv(HA, 1.5, 'résistance') }), ['baisse@110'], 'contrôle : v2 posait cette rouge contre le régime');
eq(v5(serie(150, BA, { 110: rejBaisse }), { 110: niv(BA, 1.5, 'résistance') }), ['baisse@110'], 'baissier : rouge sur résistance');
eq(v5(serie(150, BA, { 110: rejHausse }), { 110: niv(BA, -1.5, 'support') }), [], 'baissier : aucune verte (contre le régime)');
eq(v2(serie(150, BA, { 110: rejHausse }), { 110: niv(BA, -1.5, 'support') }), ['hausse@110'], 'contrôle : v2 posait cette verte contre le régime');
eq(v5(serie(150, HA, { 110: rejHausse }), { 110: niv(HA, -1.5, 'résistance') }), [], 'haussier : verte sur une RÉSISTANCE : jamais');
eq(v5(serie(150, BA, { 110: rejBaisse }), { 110: niv(BA, 1.5, 'support') }), [], 'baissier : rouge sur un SUPPORT : jamais');
eq(v5(serie(150, HA, { 110: rejHausse }), { 110: niv(HA, -1.5, 'liquidité basse', { raisons: ['creux égaux'] }) }), ['hausse@110'], 'haussier : verte sur liquidité basse affichée');
eq(v5(serie(150, BA, { 110: rejBaisse }), { 110: niv(BA, 1.5, 'liquidité haute', { raisons: ['plus haut de la veille'] }) }), ['baisse@110'], 'baissier : rouge sur liquidité haute affichée');
{ const osc = Array.from({ length: 150 }, (_, i) => { const p = 2000 + 3 * Math.sin(i * 0.7); return { t: T0 + i * H, o: p - 0.2, h: p + 1, l: p - 1, c: p + 0.2, v: 100 }; });
  let vus = 0, poses = 0; for (let i = 100; i < 140; i++) { const X = osc.slice(), p = X[i].o + 0.2; X[i] = { ...X[i], ...rejHausse(p) }; if (regimes(X)[i] !== 'range') continue; vus++; poses += flechesH1v5(X, { maintenant: fin(X), listes: plan({ [i]: () => [{ bas: X[i].l, haut: X[i].l, type: 'support', touches: 9 }] }) }).length; }
  ok(vus > 0 && poses === 0, `range : aucune flèche (${vus} cas)`); }
// correction 3 / règle B : seulement sur un niveau affiché, à ≤ 0,25 ATR
eq(v5(serie(150, HA, { 110: rejHausse }), {}), [], 'aucun niveau affiché : aucune flèche');
eq(v5(serie(150, HA, { 110: rejHausse }), { 110: niv(HA, -2.3, 'support') }), [], 'niveau affiché à plus de 0,25 ATR : aucune flèche');
// règle A d'origine : en tendance haussière, un rejet sur résistance (non affiché en flèche) bloque la verte suivante sans creux plus haut
eq(v5(serie(150, HA, { 100: rejBaisse, 110: rejHausse }), { 100: niv(HA, 1.5, 'résistance'), 110: niv(HA, -1.5, 'support') }), [], 'A (v2) : rejet sur résistance avant → verte bloquée sans creux plus haut');
eq(v5(serie(150, HA, { 90: p => ({ l: p - 2 }), 100: rejBaisse, 104: p => ({ l: p - 1.8 }), 110: rejHausse }), { 100: niv(HA, 1.5, 'résistance'), 110: niv(HA, -1.5, 'support') }), ['hausse@110'], 'A (v2) : creux plus haut confirmé → verte');
// C : une par approche
eq(v5(serie(150, HA, { 110: rejHausse, 113: rejHausse }), { 110: niv(HA, -1.5, 'support'), 113: () => niv(HA, -1.5, 'support')(110) }), ['hausse@110'], 'C : une seule flèche par approche');

/* liste partagée et rejeu sans redessin (niveaux réels) */
{ const r = alea(11), B = []; let p = 2000;
  for (let i = 0; i < 700; i++) { const d = (r() - 0.48) * 6, o = p, c = p + d; p = c; const wick = r() < 0.15 ? 4 + r() * 4 : 1; B.push({ t: T0 + i * H, o, c, h: Math.max(o, c) + (r() < 0.5 ? wick : 1), l: Math.min(o, c) - (r() < 0.5 ? wick : 1), v: 50 + r() * 100 }); }
  let diff = 0; for (let i = 60; i < B.length; i += 7) if (JSON.stringify(listesDeux(B, i).detail) !== JSON.stringify(listesDetail(B, i))) diff++;
  eq(diff, 0, 'liste partagée : partie détaillée identique à listesDetail (v2, v3, v4 inchangées)');
  const cle = f => `${f.t}|${f.sens}|${f.niveau.toFixed(4)}|${f.type}`, m = fin(B), REG = regimes(B);
  const tout = flechesH1v5(B, { maintenant: m }); let ecarts = 0;
  for (let i = B.length - 80; i < B.length; i++) { const pref = B.slice(0, i + 1), G = flechesH1v5(pref, { maintenant: pref[i].t + H }); if (G.map(cle).join(';') !== tout.filter(f => f.i <= i).map(cle).join(';')) ecarts++; }
  eq(ecarts, 0, `v5 : rejeu bougie par bougie, aucune flèche redessinée (${tout.length} flèches)`);
  ok(tout.every(f => (f.sens === 'hausse' && REG[f.i] === 'haussier' && ['support', 'liquidité basse'].includes(f.type)) || (f.sens === 'baisse' && REG[f.i] === 'baissier' && ['résistance', 'liquidité haute'].includes(f.type))), 'v5 : toutes les flèches dans le sens du régime, sur le bon type de niveau');
  ok(tout.every(f => { const L = listesDeux(B, f.i).v5; return L.some(x => f.niveau >= x.bas - 1e-9 && f.niveau <= x.haut + 1e-9); }), 'v5 : toutes posées sur un niveau AFFICHÉ (liste v5 de leur bougie)'); }

/* bilans sur 5 versions */
{ const r = alea(5), B = []; let p = 2000; const t0 = DEPUIS_5['fleches-v1'].t - 1500 * H;
  for (let i = 0; i < 2000; i++) { const o = p, c = p + (r() - 0.5) * 6; p = c; B.push({ t: t0 + i * H, o, c, h: Math.max(o, c) + r() * 3, l: Math.min(o, c) - r() * 3, v: 100 }); }
  const Fl = []; for (let i = 100; i < 1990; i += 9) Fl.push({ t: B[i].t, sens: i % 2 ? 'hausse' : 'baisse' });
  const T = bilans5(B, Object.fromEntries(Object.keys(DEPUIS_5).map(v => [v, Fl])), { maintenant: fin(B), spread: 0.5 });
  ok(T['fleches-h1-v5'].total === Fl.filter(f => f.t >= DEPUIS_H1_V5.t).length && /depuis le 8 nov\. 2026, 02 h 58/.test(T['fleches-h1-v5'].texte), 'v5 : depuis le commit 980f1b2');
  ok(Object.values(T).every(b => !b.assez || (b.pHolm >= b.p && /Holm, 5 versions suivies/.test(b.texte))), 'Holm sur les 5 versions suivies'); }

/* registre et journal */
{ eq(VERSIONS, ['fleches-v1', 'fleches-h1-v2', 'fleches-h1-v3', 'fleches-h1-v4', 'fleches-h1-v5'], 'registre : cinq versions');
  const f = (t, s = 'hausse') => ({ t, sens: s, niveau: 2000, type: 'support' });
  let R = registreVide(1); for (const v of VERSIONS.slice(0, 4)) R = ajouter(R, v, [f(5)], { vu: 10 }).registre;
  const avant = JSON.stringify(VERSIONS.slice(0, 4).map(v => R.versions[v]));
  R = ajouter(R, 'fleches-h1-v5', [f(5), f(9)], { vu: 20 }).registre;
  eq(JSON.stringify(VERSIONS.slice(0, 4).map(v => R.versions[v])), avant, 'registres v1 à v4 intacts');
  eq([R.versions['fleches-h1-v5'].length, verifier(R, 'fleches-h1-v5').ok], [2, true], 'registre v5 chaîné'); }
eq(VERSIONS_FLECHE_H1[0], 'fleches-h1-v5', 'journal : v5 en premier');
const tr = { source: 'saisie', sens: 'achat', entree: 4000, stop: 3990, taille: 1, etiquette: 'flèche H1', versionFleche: 'fleches-h1-v5' };
eq([valider(tr), etiquetteComplete(tr)], [[], 'flèche H1 · fleches-h1-v5'], 'journal : flèche H1 · fleches-h1-v5');

console.log(`fleches-h1-v5-test : ${n} vérifications OK`);
