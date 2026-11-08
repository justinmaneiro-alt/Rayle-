/* Tests des flèches H1 version 7 : node agent-trading/tests/fleches-h1-v7-test.mjs
   Niveaux admis (≥ 8 touches, retournés compris, semaine / mois), rebond confirmé à 1,5 ATR sans nouvel extrême, alternance,
   24 bougies d'écart, rien en range ; listes partagées identiques ; absence de redessin ; bilans à 7 versions. */
import assert from 'node:assert/strict';
import { regimes } from '../front/or/fleches-h1-v2.js';
import { listesTrois, DEPUIS_H1_V6 } from '../front/or/fleches-h1-v6.js';
import { REGLES_H1_V7, DEPUIS_H1_V7, DEPUIS_7, bandesV7, listesQuatre, listesV7Seule, majeursAvant, flechesH1v7, indicesV7, segmentsV7, bilans7 } from '../front/or/fleches-h1-v7.js';
import { registreVide, ajouter, verifier, VERSIONS } from '../front/or/registre-fleches.js';
import { VERSIONS_FLECHE_H1, etiquetteComplete, valider } from '../front/or/journal-calcul.js';
import { alea } from '../front/or/zones-or.js';
let n = 0; const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; }, ok = (c, m) => { assert.ok(c, m); n++; };
const H = 3600e3, T0 = Date.UTC(2026, 9, 5, 0);   // lundi 5 octobre 2026, 02 h à Paris

// règles
eq(Object.isFrozen(REGLES_H1_V7), true, 'règles v7 figées');
eq([REGLES_H1_V7.touchesMin, REGLES_H1_V7.toucheAtr, REGLES_H1_V7.confirmationAtr, REGLES_H1_V7.espacementBougies, REGLES_H1_V7.majeurs], [8, 0.25, 1.5, 24, ['semaine', 'mois']], 'consigne : 8 touches, 0,25 ATR, 1,5 ATR, 24 bougies, semaine / mois');
eq(DEPUIS_H1_V7.t, Date.parse('2026-11-08T10:38:27+01:00'), 'bilan v7 ouvert à la date du commit de ses règles');
ok(DEPUIS_H1_V6.t < DEPUIS_H1_V7.t && Object.keys(DEPUIS_7).length === 7, 'sept versions suivies');

// niveaux admis : bandes d'au moins 8 touches, typées par leur position, sans limite de nombre
{ const b = (p, touches) => ({ bas: p, haut: p + 1, p: p + 0.5, touches, importance: touches, extreme: false, tDerniere: T0, niveaux: 1 });
  const N = { a: 5, toutes: [b(2100, 8), b(2150, 7), b(1900, 12), b(1800, 30), b(2300, 9), b(2400, 10), b(2500, 11)] }, L = bandesV7(N, 2000, []);
  eq(L.map(x => [x.bas, x.type]).sort((x, y) => x[0] - y[0]), [[1800, 'support'], [1900, 'support'], [2100, 'résistance'], [2300, 'résistance'], [2400, 'résistance'], [2500, 'résistance']], 'au moins 8 touches (7 écartée), typées par position, sans limite');
  ok(L.every(x => /^(Support|Résistance) [\d  –]+ · \d+ touches$/.test(x.libelle)), 'étiquette : type, prix, touches'); }
// plus hauts / plus bas de la semaine et du mois précédents
{ const B = []; for (let i = 0; i < 24 * 15; i++) { const p = 2000 + (i < 24 * 7 ? 0 : 50) + 10 * Math.sin(i / 5); B.push({ t: T0 + i * H, o: p, h: p + 2, l: p - 2, c: p }); }
  const M = majeursAvant(B), k = 24 * 14 + 10;
  ok(M[24 * 3] && M[24 * 3].length === 0, 'première semaine (incomplète du début) : pas de « semaine dernière » ni de « mois dernier »');
  // contrôle indépendant : semaines de Paris (lundi) par Intl ; la semaine précédant celle de la bougie k − 1, complète (pas la première)
  const lundi = t => { const d = new Date(new Date(t).toLocaleString('en-US', { timeZone: 'Europe/Paris' })); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toDateString(); };
  const sem = B.map(b => lundi(b.t)), ordre = [...new Set(sem)], cible = ordre[ordre.indexOf(sem[k - 1]) - 1], G = B.filter((b, i) => sem[i] === cible);
  const vus = (M[k] || []).filter(x => /semaine/.test(x.quoi)).map(x => x.p).sort((x, y) => x - y);
  eq(vus, [Math.min(...G.map(b => b.l)), Math.max(...G.map(b => b.h))], 'semaine dernière : plus bas et plus haut de la semaine complète précédente (heure de Paris)'); }

/* séries fabriquées */
const pxDe = p => i => 2000 + p * i;
function serie(nb, pente, modif = {}) { const px = pxDe(pente), s = Math.sign(pente || 1), B = []; for (let i = 0; i < nb; i++) { const p = px(i); B.push({ t: T0 + i * H, o: p - 0.2 * s, h: p + 1, l: p - 1, c: p + 0.2 * s, v: 100 }); } for (const [i, f] of Object.entries(modif)) B[+i] = { ...B[+i], ...f(px(+i), +i) }; return B; }
const plan = P => (C, i) => (P[i] ? P[i](i) : []), fin = B => B[B.length - 1].t + H;
const run = (B, P) => flechesH1v7(B, { maintenant: fin(B), listes: plan(P) }).map(f => `${f.sens}@${f.i}`);
const HA = 0.05, j = 110, nivH = pxDe(HA)(j) - 1, sup = (p = nivH, t = 9) => () => [{ bas: p, haut: p, p, type: 'support', touches: t, source: 'bande', libelle: 'Support test' }];
const monte = (k, c) => p => ({ o: p, c, h: c + 0.5, l: Math.max(p - 1, nivH + 0.1) });
eq(regimes(serie(200, HA))[150], 'haussier', 'série montante : régime haussier');
{ const B = serie(200, HA, { [j + 1]: p => ({ l: nivH + 0.1 }), [j + 3]: monte(j + 3, nivH + 3.4) }), F = flechesH1v7(B, { maintenant: fin(B), listes: plan({ [j]: sup() }) });
  eq(F.map(f => `${f.sens}@${f.i}`), [`hausse@${j + 3}`], 'verte : touche du support puis clôture à ≥ 1,5 ATR au-dessus, posée à cette clôture');
  eq([F[0].touche, F[0].tTouche, F[0].mode], [j, T0 + j * H, 'rebond confirmé'], 'flèche : bougie de touche notée');
  const S = segmentsV7(F); eq([S.length, S[0].t0, S[0].t1, S[0].p], [1, T0 + j * H, T0 + (j + 3) * H, nivH], 'segment : de la touche à la confirmation, sur le niveau'); }
eq(run(serie(200, HA, { [j + 1]: p => ({ l: nivH - 0.3 }), [j + 3]: monte(j + 3, nivH + 3.4) }), { [j]: sup() }), [], 'nouveau plus bas sous la touche avant la confirmation : rien');
eq(run(serie(200, HA, { [j + 1]: p => ({ l: nivH + 0.1 }), [j + 3]: monte(j + 3, nivH + 2.4) }), { [j]: sup() }).filter(x => x === `hausse@${j + 3}`), [], 'clôture à moins de 1,5 ATR : pas encore de flèche');
eq(run(serie(200, HA, { [j + 3]: monte(j + 3, nivH + 3.4) }), { [j]: () => [{ bas: nivH - 2, haut: nivH - 2, p: nivH - 2, type: 'support', touches: 9 }] }), [], 'niveau à plus de 0,25 ATR de la touche : rien');
eq(run(serie(200, HA, { [j + 3]: monte(j + 3, nivH + 3.4) }), { [j]: () => [{ bas: nivH, haut: nivH, p: nivH, type: 'résistance', touches: 9 }] }), [], 'verte jamais sur une résistance');
// pas de délai maximal : la confirmation peut venir longtemps après, tant qu'il n'y a pas de nouveau plus bas
{ const M = {}; for (let k = j + 1; k < j + 40; k++) M[k] = p => ({ l: nivH + 0.1, h: nivH + 1.5, o: nivH + 0.8, c: nivH + 0.9 }); M[j + 40] = p => ({ o: nivH + 1, c: nivH + 3.4, h: nivH + 3.6, l: nivH + 0.5 });
  eq(run(serie(200, HA, M), { [j]: sup() }), [`hausse@${j + 40}`], 'confirmation 40 bougies après la touche, sans nouveau plus bas : flèche'); }
// les deux régimes : une verte en régime baissier est valable (hors range)
{ const BA = -0.5, jb = 110, nb = pxDe(BA)(jb) - 1, hautBas = p => ({ l: nb + 0.1, o: nb + 0.6, c: nb + 0.5, h: nb + 1 }), B = serie(200, BA, { [jb + 1]: hautBas, [jb + 2]: hautBas, [jb + 3]: p => ({ o: nb + 0.6, c: nb + 4.2, h: nb + 4.5, l: nb + 0.2 }) });
  const F = flechesH1v7(B, { maintenant: fin(B), listes: plan({ [jb]: () => [{ bas: nb, haut: nb, p: nb, type: 'support', touches: 9 }] }) });
  eq(F.map(f => `${f.sens}@${f.i}:${f.regime}`), [`hausse@${jb + 3}:baissier`], 'verte en régime baissier : valable (le sens n’est pas filtré)'); }
// alternance et espacement
const rouge = (k, d = 1) => ({ [k]: p => ({ h: p + d }) });
{ const niv2 = pxDe(HA)(j + 30) - 1, P = { [j]: sup(), [j + 30]: sup(niv2) };
  const B = serie(260, HA, { [j + 1]: p => ({ l: nivH + 0.1 }), [j + 3]: monte(j + 3, nivH + 3.4), [j + 31]: p => ({ l: niv2 + 0.1 }), [j + 33]: p => ({ o: p, c: niv2 + 3.4, h: niv2 + 3.9, l: niv2 + 0.2 }) });
  eq(run(B, P), [`hausse@${j + 3}`], 'alternance : deux vertes de suite → la seconde ne compte pas'); }
// en tendance haussière forte (régime haussier tenu) : verte confirmée naturellement, puis rouge sur une résistance
const FORT = 0.5, pF = pxDe(FORT), supF = () => [{ bas: pF(j) - 1, haut: pF(j) - 1, p: pF(j) - 1, type: 'support', touches: 9 }];
const resF = k0 => () => [{ bas: pF(k0) + 1, haut: pF(k0) + 1, p: pF(k0) + 1, type: 'résistance', touches: 9 }];
const rougeF = k0 => ({ [k0 + 1]: p => ({ h: pF(k0) + 0.9, o: pF(k0) + 0.4, c: pF(k0) + 0.3 }), [k0 + 2]: p => ({ o: pF(k0) + 0.3, c: pF(k0) + 1 - 4, h: pF(k0) + 0.8, l: pF(k0) - 3.5 }) });
{ const k0 = j + 30, B = serie(260, FORT, rougeF(k0)), F = flechesH1v7(B, { maintenant: fin(B), listes: plan({ [j]: supF, [k0]: resF(k0) }) }), REG = regimes(B);
  eq(F.map(f => f.sens), ['hausse', 'baisse'], 'verte puis rouge à ≥ 24 bougies : les deux');
  ok(F[1].i === k0 + 2 && REG[k0 + 2] === 'haussier' && F[1].i - F[0].i >= 24, 'rouge confirmée en régime haussier (sens non filtré), ≥ 24 bougies après la verte'); }
{ const k0 = j + 10, B = serie(260, FORT, rougeF(k0)), F = flechesH1v7(B, { maintenant: fin(B), listes: plan({ [j]: supF, [k0]: resF(k0) }) });
  eq(F.map(f => f.sens), ['hausse'], 'espacement : rouge confirmée moins de 24 bougies après la verte → rien'); }
// range : rien
{ const osc = Array.from({ length: 200 }, (_, i) => { const p = 2000 + 3 * Math.sin(i * 0.7); return { t: T0 + i * H, o: p - 0.2, h: p + 1, l: p - 1, c: p + 0.2, v: 100 }; });
  const REG = regimes(osc), F = flechesH1v7(osc, { maintenant: fin(osc), listes: (C, i) => [{ bas: C[i - 1].c - 3, haut: C[i - 1].c - 3, p: C[i - 1].c - 3, type: 'support', touches: 9 }, { bas: C[i - 1].c + 3, haut: C[i - 1].c + 3, p: C[i - 1].c + 3, type: 'résistance', touches: 9 }] });
  ok(F.every(f => REG[f.i] === 'haussier' || REG[f.i] === 'baissier'), `jamais de flèche en régime range (${F.length})`); }

/* niveaux réels : listes partagées, liste allégée, rejeu sans redessin, indices suffisants, alternance et espacement */
{ const r = alea(13), B = []; let p = 2000;
  for (let i = 0; i < 700; i++) { const d = (r() - 0.49) * 7, o = p, c = p + d; p = c; B.push({ t: T0 + i * H, o, c, h: Math.max(o, c) + r() * 3, l: Math.min(o, c) - r() * 3, v: 50 + r() * 100 }); }
  const m = fin(B); let diff = 0, diff7 = 0;
  for (let i = 60; i < B.length; i += 11) { const T = listesTrois(B, i), Q = listesQuatre(B, i); if (['detail', 'v5', 'v6'].some(k => JSON.stringify(T[k]) !== JSON.stringify(Q[k]))) diff++; if (JSON.stringify(Q.v7) !== JSON.stringify(listesV7Seule(B, i))) diff7++; }
  eq([diff, diff7], [0, 0], 'listes partagées identiques à listesTrois ; liste allégée v7 identique');
  const memo = new Map(), l7 = (X, i) => { if (!memo.has(X[i].t)) memo.set(X[i].t, listesV7Seule(X, i)); return memo.get(X[i].t); };
  const appels = new Set(), tout = flechesH1v7(B, { maintenant: m, listes: (X, i) => { appels.add(i); return l7(X, i); } }), { indices } = indicesV7(B, { maintenant: m });
  ok([...appels].every(i => indices.includes(i)), `indicesV7 couvre toutes les bougies où v7 lit les niveaux (${indices.length} sur ${B.length})`);
  ok(tout.every((f, k) => !k || (f.sens !== tout[k - 1].sens && f.i - tout[k - 1].i >= 24)), `alternance et ≥ 24 bougies d’écart (${tout.length} flèches)`);
  const cle = f => `${f.t}|${f.sens}|${f.niveau.toFixed(4)}`; let ecarts = 0;
  for (let i = B.length - 80; i < B.length; i++) { const pref = B.slice(0, i + 1), G = flechesH1v7(pref, { maintenant: pref[i].t + H, listes: l7 }); if (G.map(cle).join(';') !== tout.filter(f => f.i <= i).map(cle).join(';')) ecarts++; }
  eq(ecarts, 0, 'v7 : rejeu bougie par bougie, aucune flèche redessinée ni déplacée'); }

/* bilans, registre, journal */
{ const r = alea(5), B = []; let p = 2000; const t0 = DEPUIS_7['fleches-v1'].t - 1500 * H;
  for (let i = 0; i < 2000; i++) { const o = p, c = p + (r() - 0.5) * 6; p = c; B.push({ t: t0 + i * H, o, c, h: Math.max(o, c) + r() * 3, l: Math.min(o, c) - r() * 3, v: 100 }); }
  const Fl = []; for (let i = 100; i < 1990; i += 9) Fl.push({ t: B[i].t, sens: i % 2 ? 'hausse' : 'baisse' });
  const T = bilans7(B, Object.fromEntries(Object.keys(DEPUIS_7).map(v => [v, Fl])), { maintenant: fin(B), spread: 0.5 });
  ok(T['fleches-h1-v7'].total === Fl.filter(f => f.t >= DEPUIS_H1_V7.t).length && /depuis le 8 nov\. 2026, 10 h 38/.test(T['fleches-h1-v7'].texte), 'v7 : depuis le commit f9a9b5b');
  ok(Object.values(T).every(b => !b.assez || (b.pHolm >= b.p && /Holm, 7 versions suivies/.test(b.texte))), 'Holm sur les 7 versions suivies'); }
{ eq(VERSIONS.length, 7, 'registre : sept versions'); const f = (t, s = 'hausse') => ({ t, sens: s, niveau: 2000, type: 'support' });
  let R = registreVide(1); for (const v of VERSIONS.slice(0, 6)) R = ajouter(R, v, [f(5)], { vu: 10 }).registre;
  const avant = JSON.stringify(VERSIONS.slice(0, 6).map(v => R.versions[v])); R = ajouter(R, 'fleches-h1-v7', [f(5), f(9)], { vu: 20 }).registre;
  eq(JSON.stringify(VERSIONS.slice(0, 6).map(v => R.versions[v])), avant, 'registres v1 à v6 intacts'); eq(verifier(R, 'fleches-h1-v7').ok, true, 'registre v7 chaîné'); }
eq(VERSIONS_FLECHE_H1[0], 'fleches-h1-v7', 'journal : v7 en premier');
const tr = { source: 'saisie', sens: 'achat', entree: 4000, stop: 3990, taille: 1, etiquette: 'flèche H1', versionFleche: 'fleches-h1-v7' };
eq([valider(tr), etiquetteComplete(tr)], [[], 'flèche H1 · fleches-h1-v7'], 'journal : flèche H1 · fleches-h1-v7');

console.log(`fleches-h1-v7-test : ${n} vérifications OK`);
