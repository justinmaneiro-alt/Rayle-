/* Tests des flèches H1 version 6 (rebond confirmé, niveaux retournés) : node agent-trading/tests/fleches-h1-v6-test.mjs
   Séries fabriquées : rebond confirmé contre le régime (touche, clôture à ≥ 0,5 ATR en ≤ 6 bougies, sans nouvel extrême), chute qui perce
   les niveaux (aucune verte), niveaux retournés ; v6 sans ses ajouts = v5 ; absence de redessin ; listes partagées identiques. */
import assert from 'node:assert/strict';
import { regimes } from '../front/or/fleches-h1-v2.js';
import { REGLES_H1_V5, flechesH1v5, listesDeux, DEPUIS_H1_V5 } from '../front/or/fleches-h1-v5.js';
import { REGLES_H1_V6, REGLES_NIVEAUX_H1_V6, DEPUIS_H1_V6, DEPUIS_6, retournement, selectionV6, listesTrois, flechesH1v6, indicesV6, bilans6 } from '../front/or/fleches-h1-v6.js';
import { registreVide, ajouter, verifier, VERSIONS } from '../front/or/registre-fleches.js';
import { VERSIONS_FLECHE_H1, etiquetteComplete, valider } from '../front/or/journal-calcul.js';
import { alea } from '../front/or/zones-or.js';
let n = 0; const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; }, ok = (c, m) => { assert.ok(c, m); n++; };
const H = 3600e3, T0 = Date.UTC(2026, 9, 1);

// règles
eq([Object.isFrozen(REGLES_H1_V6), Object.isFrozen(REGLES_NIVEAUX_H1_V6)], [true, true], 'règles v6 figées');
for (const k of Object.keys(REGLES_H1_V5).filter(k => !['version', 'ecrites', 'base', 'niveaux'].includes(k))) eq(REGLES_H1_V6[k], REGLES_H1_V5[k], `seuil « ${k} » identique à v5`);
eq([REGLES_H1_V6.confirmationBougies, REGLES_H1_V6.confirmationAtr, REGLES_NIVEAUX_H1_V6.casseAtr, REGLES_NIVEAUX_H1_V6.retournesParCote], [6, 0.5, 0.5, 2], 'consigne : 6 bougies, 0,5 ATR ; cassure 0,5 ATR ; 2 retournés par côté');
eq(DEPUIS_H1_V6.t, Date.parse('2026-11-08T03:18:03+01:00'), 'bilan v6 ouvert à la date du commit de ses règles');
ok(DEPUIS_H1_V5.t < DEPUIS_H1_V6.t && Object.keys(DEPUIS_6).length === 6, 'six versions suivies');

/* niveaux retournés */
{ const q = { bas: 2100, haut: 2102, tDerniere: T0 }, bar = (i, c) => ({ t: T0 + i * H, o: c, h: c + 1, l: c - 1, c });
  const Cs = [bar(1, 2095), bar(2, 2098), bar(3, 2106), bar(4, 2108)];   // dessous, puis clôture à 2106 ≥ 2102 + 0,5 × 6
  eq(retournement(q, Cs, 6, 2108), 'ancienne résistance', 'résistance cassée par une clôture à ≥ 0,5 ATR, prix au-dessus : support');
  eq(retournement(q, Cs, 6, 2099), null, 'prix revenu sous la bande : plus retournée');
  eq(retournement(q, [bar(1, 2095), bar(2, 2104)], 6, 2104), null, 'clôture à moins de 0,5 ATR au-delà : pas cassée');
  eq(retournement(q, [bar(1, 2106), bar(2, 2108)], 6, 2108), null, 'jamais dessous après la dernière touche : pas de cassure');
  eq(retournement(q, [bar(1, 2104), bar(2, 2096), bar(3, 2090)], 6, 2090), 'ancien support', 'support cassé vers le bas : résistance');
  eq(retournement({ ...q, tDerniere: T0 + 3 * H }, Cs, 6, 2108), null, 'cassure avant la dernière touche : ignorée');
  // sélection : une bande retournée non sélectionnée (2 touches) est ajoutée, avec la mention, étiquette courte
  const b = (p, touches, importance) => ({ bas: p, haut: p + 2, p: p + 1, touches, importance, extreme: false, tDerniere: T0, niveaux: 1 });
  const N = { a: 6, toutes: [b(2100, 2, 2), b(2200, 6, 6), b(2000, 7, 7)] }, S = selectionV6(N, 2108, Cs);
  const r = S.find(x => x.bas === 2100);
  ok(r && r.cote === 'support' && r.retourne === 'ancienne résistance' && /^Support 2 100–2 102 · 2 touches · ancienne résistance$/.test(r.texte), 'bande retournée ajoutée comme support, étiquette « … · ancienne résistance »', r && r.texte);
  ok(S.some(x => x.bas === 2200 && x.cote === 'resistance' && !x.retourne) && S.some(x => x.bas === 2000), 'les bandes v5 restent'); }

/* séries fabriquées : tendance baissière rapide (régime baissier) ou haussière */
const pxDe = p => i => 2000 + p * i;
function serie(nb, pente, modif = {}) { const px = pxDe(pente), s = Math.sign(pente || 1), B = []; for (let i = 0; i < nb; i++) { const p = px(i); B.push({ t: T0 + i * H, o: p - 0.2 * s, h: p + 1, l: p - 1, c: p + 0.2 * s, v: 100 }); } for (const [i, f] of Object.entries(modif)) B[+i] = { ...B[+i], ...f(px(+i), +i) }; return B; }
const plan = P => (C, i) => (P[i] ? P[i](i) : []), fin = B => B[B.length - 1].t + H;
const run = (B, P, o = {}) => flechesH1v6(B, { maintenant: fin(B), listes: plan(P), ...o });
const BA = -0.5, HA = 0.5, j = 110, pj = pxDe(BA)(j), niveau = pj - 1;   // touche : plus bas de la bougie j sur un support
const sup = () => [{ bas: niveau, haut: niveau, type: 'support', touches: 6 }];
const plats = (k0, k1) => Object.fromEntries(Array.from({ length: k1 - k0 + 1 }, (_, d) => [k0 + d, p => ({ l: niveau + 0.05, o: Math.max(p + 0.2, niveau + 0.3), c: Math.max(p - 0.2, niveau + 0.2) })]));   // pas de nouveau plus bas sous la touche
const rebond = { ...plats(j + 1, j + 1), [j + 2]: p => ({ o: p, c: pj + 0.2, h: pj + 0.5, l: niveau + 0.1 }) };   // clôture ≥ niveau + 0,5 ATR, aucun plus bas sous la touche
eq(regimes(serie(150, BA, rebond))[j + 2], 'baissier', 'contrôle : régime baissier à la bougie de confirmation');
{ const F = run(serie(150, BA, rebond), { [j]: sup });
  eq(F.map(f => `${f.sens}@${f.i}:${f.mode}`), [`hausse@${j + 2}:rebond confirmé`], 'rebond confirmé : verte contre le régime, posée à la CLÔTURE de la bougie de confirmation');
  eq([F[0].touche, F[0].tTouche, F[0].regime], [j, T0 + j * H, 'baissier'], 'flèche : bougie de touche et régime notés'); }
eq(flechesH1v5(serie(150, BA, rebond), { maintenant: fin(serie(150, BA, rebond)), listes: plan({ [j]: sup }) }).length, 0, 'contrôle : v5 ne la posait pas (contre le régime)');
eq(run(serie(150, BA, { ...rebond, [j + 1]: p => ({ l: niveau - 0.5 }) }), { [j]: sup }).length, 0, 'nouveau plus bas sous la touche avant la confirmation : aucune flèche');
eq(run(serie(150, BA, { ...plats(j + 1, j + 6), [j + 7]: p => ({ o: p, c: pj + 0.2, h: pj + 0.5, l: niveau + 0.1 }) }), { [j]: sup }).length, 0, 'confirmation après 6 bougies : aucune flèche');
eq(run(serie(150, BA, { ...plats(j + 1, j + 1), [j + 2]: p => ({ o: p, c: niveau + 0.5, h: niveau + 0.8, l: niveau + 0.1 }) }), { [j]: sup }).length, 0, 'clôture à moins de 0,5 ATR au-dessus du niveau : aucune flèche');
eq(run(serie(150, BA, rebond), { [j]: () => [{ bas: niveau - 3, haut: niveau - 3, type: 'support', touches: 6 }] }).length, 0, 'niveau affiché à plus de 0,25 ATR de la touche : aucune flèche');
eq(run(serie(150, BA, rebond), { [j]: () => [{ bas: niveau, haut: niveau, type: 'résistance', touches: 6 }] }).length, 0, 'verte jamais sur une résistance');
eq(run(serie(150, BA, rebond), {}).length, 0, 'aucun niveau affiché : aucune flèche');
// chute qui perce les niveaux l'un après l'autre : chaque bougie fait un nouveau plus bas → aucune verte
{ const P = {}; for (let i = 100; i < 140; i += 3) P[i] = i2 => [{ bas: pxDe(BA)(i2) - 1, haut: pxDe(BA)(i2) - 1, type: 'support', touches: 8 }];
  eq(run(serie(150, BA), P).filter(f => f.sens === 'hausse').length, 0, 'chute qui perce successivement des supports : aucune flèche verte'); }
// rouge : rebond confirmé contre un régime haussier, miroir
{ const ph = pxDe(HA)(j), nh = ph + 1, P = { [j]: () => [{ bas: nh, haut: nh, type: 'résistance', touches: 6 }] };
  const B = serie(150, HA, { [j + 1]: p => ({ h: nh - 0.05, o: Math.min(p - 0.2, nh - 0.3), c: Math.min(p + 0.2, nh - 0.2) }), [j + 2]: p => ({ o: p, c: ph - 0.2, h: nh - 0.1, l: ph - 0.5 }) });
  eq(run(B, P).map(f => `${f.sens}@${f.i}:${f.mode}`), [`baisse@${j + 2}:rebond confirmé`], 'miroir : rouge contre un régime haussier, confirmée à la clôture'); }
// une seule flèche par approche : deux touches du même niveau, deux confirmations → une flèche
eq(run(serie(150, BA, { ...rebond, [j + 3]: p => ({ o: p, c: pj, h: pj + 0.3, l: niveau + 0.05 }), [j + 4]: p => ({ o: p, c: pj + 0.1, h: pj + 0.4, l: niveau + 0.2 }) }), { [j]: sup, [j + 3]: sup }).length, 1, 'même niveau, même approche : une seule flèche');
// niveau retourné utilisé par les flèches
eq(run(serie(150, BA, rebond), { [j]: () => [{ bas: niveau, haut: niveau, type: 'support', touches: 2, retourne: 'ancienne résistance' }] }).map(f => f.retourne), ['ancienne résistance'], 'flèche sur un niveau retourné : notée');
// range : aucune flèche (oscillation)
{ const osc = Array.from({ length: 150 }, (_, i) => { const p = 2000 + 3 * Math.sin(i * 0.7); return { t: T0 + i * H, o: p - 0.2, h: p + 1, l: p - 1, c: p + 0.2, v: 100 }; });
  const REG = regimes(osc), F = flechesH1v6(osc, { maintenant: fin(osc), listes: (C, i) => [{ bas: C[i - 1].c - 4, haut: C[i - 1].c - 4, type: 'support', touches: 9 }, { bas: C[i - 1].c + 4, haut: C[i - 1].c + 4, type: 'résistance', touches: 9 }] });
  ok(F.every(f => REG[f.i] === 'haussier' || REG[f.i] === 'baissier'), `jamais de flèche en régime range (${F.length} flèches)`); }

/* niveaux réels : listes partagées, v6 sans ajouts = v5, rejeu sans redessin, indices suffisants */
{ const r = alea(11), B = []; let p = 2000;
  for (let i = 0; i < 600; i++) { const d = (r() - 0.48) * 6, o = p, c = p + d; p = c; const wick = r() < 0.15 ? 4 + r() * 4 : 1; B.push({ t: T0 + i * H, o, c, h: Math.max(o, c) + (r() < 0.5 ? wick : 1), l: Math.min(o, c) - (r() < 0.5 ? wick : 1), v: 50 + r() * 100 }); }
  const m = fin(B), memo = new Map(), L3 = (X, i) => { if (!memo.has(X[i].t)) memo.set(X[i].t, listesTrois(X, i)); return memo.get(X[i].t); };
  let diff = 0; for (let i = 60; i < B.length; i += 9) { const D = listesDeux(B, i), T = L3(B, i); if (JSON.stringify(D.detail) !== JSON.stringify(T.detail) || JSON.stringify(D.v5) !== JSON.stringify(T.v5)) diff++; }
  eq(diff, 0, 'listes partagées : détail et v5 identiques à listesDeux');
  const cle = f => `${f.t}|${f.sens}|${f.niveau.toFixed(4)}|${f.type}`;
  eq(flechesH1v6(B, { maintenant: m, listes: (X, i) => L3(X, i).v5, ajouts: false }).map(cle), flechesH1v5(B, { maintenant: m, listes: (X, i) => L3(X, i).v5 }).map(cle), 'v6 sans ses deux ajouts = v5 exactement');
  const appels = new Set(), tout = flechesH1v6(B, { maintenant: m, listes: (X, i) => { appels.add(i); return L3(X, i).v6; } }), { indices } = indicesV6(B, { maintenant: m });
  ok([...appels].every(i => indices.includes(i)), `indicesV6 couvre toutes les bougies où v6 lit les niveaux (${indices.length} sur ${B.length})`);
  let ecarts = 0; for (let i = B.length - 80; i < B.length; i++) { const pref = B.slice(0, i + 1), G = flechesH1v6(pref, { maintenant: pref[i].t + H, listes: (X, k) => L3(X, k).v6 }); if (G.map(cle).join(';') !== tout.filter(f => f.i <= i).map(cle).join(';')) ecarts++; }
  eq(ecarts, 0, `v6 : rejeu bougie par bougie, aucune flèche redessinée ni déplacée (${tout.length} flèches)`);
  const REG = regimes(B);
  ok(tout.every(f => f.mode === 'rejet' ? (f.sens === 'hausse') === (REG[f.i] === 'haussier') : (f.sens === 'hausse') === (REG[f.i] === 'baissier')), 'rejet : dans le sens du régime ; rebond confirmé : contre le régime'); }

/* bilans, registre, journal */
{ const r = alea(5), B = []; let p = 2000; const t0 = DEPUIS_6['fleches-v1'].t - 1500 * H;
  for (let i = 0; i < 2000; i++) { const o = p, c = p + (r() - 0.5) * 6; p = c; B.push({ t: t0 + i * H, o, c, h: Math.max(o, c) + r() * 3, l: Math.min(o, c) - r() * 3, v: 100 }); }
  const Fl = []; for (let i = 100; i < 1990; i += 9) Fl.push({ t: B[i].t, sens: i % 2 ? 'hausse' : 'baisse' });
  const T = bilans6(B, Object.fromEntries(Object.keys(DEPUIS_6).map(v => [v, Fl])), { maintenant: fin(B), spread: 0.5 });
  ok(T['fleches-h1-v6'].total === Fl.filter(f => f.t >= DEPUIS_H1_V6.t).length && /depuis le 8 nov\. 2026, 03 h 18/.test(T['fleches-h1-v6'].texte), 'v6 : depuis le commit 38e4b7b');
  ok(Object.values(T).every(b => !b.assez || (b.pHolm >= b.p && /Holm, 6 versions suivies/.test(b.texte))), 'Holm sur les 6 versions suivies'); }
{ eq(VERSIONS.length, 6, 'registre : six versions'); const f = (t, s = 'hausse') => ({ t, sens: s, niveau: 2000, type: 'support' });
  let R = registreVide(1); for (const v of VERSIONS.slice(0, 5)) R = ajouter(R, v, [f(5)], { vu: 10 }).registre;
  const avant = JSON.stringify(VERSIONS.slice(0, 5).map(v => R.versions[v])); R = ajouter(R, 'fleches-h1-v6', [f(5), f(9)], { vu: 20 }).registre;
  eq(JSON.stringify(VERSIONS.slice(0, 5).map(v => R.versions[v])), avant, 'registres v1 à v5 intacts'); eq(verifier(R, 'fleches-h1-v6').ok, true, 'registre v6 chaîné'); }
eq(VERSIONS_FLECHE_H1[0], 'fleches-h1-v6', 'journal : v6 en premier');
const tr = { source: 'saisie', sens: 'achat', entree: 4000, stop: 3990, taille: 1, etiquette: 'flèche H1', versionFleche: 'fleches-h1-v6' };
eq([valider(tr), etiquetteComplete(tr)], [[], 'flèche H1 · fleches-h1-v6'], 'journal : flèche H1 · fleches-h1-v6');

console.log(`fleches-h1-v6-test : ${n} vérifications OK`);
