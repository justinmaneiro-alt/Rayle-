/* Tests des flèches H1 version 3, du moteur commun v2 / v3, des bilans par version (Holm) : node agent-trading/tests/fleches-h1-v3-test.mjs
   Séries fabriquées : règle A corrigée (exemption sur support / liquidité basse, miroir), B et C inchangées, absence de redessin. */
import assert from 'node:assert/strict';
import { REGLES_H1_V2, DEPUIS_H1_V2, flechesH1v2 } from '../front/or/fleches-h1-v2.js';
import { REGLES_H1_V3, DEPUIS_H1_V3, DEPUIS_VERSIONS, moteurH1, moteurV2, flechesH1v3, bilansH1 } from '../front/or/fleches-h1-v3.js';
import { registreVide, ajouter, verifier, VERSIONS } from '../front/or/registre-fleches.js';
import { VERSIONS_FLECHE_H1, etiquetteComplete, valider } from '../front/or/journal-calcul.js';
import { alea } from '../front/or/zones-or.js';
let n = 0; const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; }, ok = (c, m) => { assert.ok(c, m); n++; };
const H = 3600e3, T0 = Date.UTC(2026, 9, 1);

// règles : figées, seuils de v2 repris tels quels, seule la règle A change
eq(Object.isFrozen(REGLES_H1_V3), true, 'règles v3 figées');
for (const k of Object.keys(REGLES_H1_V2).filter(k => !['version', 'ecrites'].includes(k))) eq(REGLES_H1_V3[k], REGLES_H1_V2[k], `seuil « ${k} » identique à v2`);
eq([REGLES_H1_V3.sansBlocageHausse, REGLES_H1_V3.sansBlocageBaisse], [['support', 'liquidité basse'], ['résistance', 'liquidité haute']], 'A corrigée : niveaux exemptés');
eq(DEPUIS_H1_V3.t, Date.parse('2026-11-08T01:45:13+01:00'), 'bilan v3 ouvert à la date du commit de ses règles');
ok(DEPUIS_VERSIONS['fleches-v1'].t < DEPUIS_H1_V2.t && DEPUIS_H1_V2.t < DEPUIS_H1_V3.t, 'chaque version a la date de sa propre règle');

/* série fabriquée (comme pour v2) */
const pente = 0.05, px = i => 2000 + pente * i;
function serie(nb, modif = {}) { const B = []; for (let i = 0; i < nb; i++) { const p = px(i); B.push({ t: T0 + i * H, o: p - 0.2, h: p + 1, l: p - 1, c: p + 0.2, v: 100 }); } for (const [i, f] of Object.entries(modif)) B[+i] = { ...B[+i], ...f(px(+i)) }; return B; }
const rejHausse = p => ({ o: p, c: p + 0.3, h: p + 0.5, l: p - 1.5 }), rejBaisse = p => ({ o: p, c: p - 0.3, h: p + 1.5, l: p - 0.5 });
const niv = (d, type) => i => [{ bas: px(i) + d, haut: px(i) + d, type }];
const support = niv(-1.5, 'support'), resistance = niv(1.5, 'résistance');
const plan = P => (C, i) => (P[i] ? P[i](i) : []), fin = B => B[B.length - 1].t + H;
const run = (f, B, P) => f(B, { maintenant: fin(B), listes: plan(P) }).map(x => `${x.sens}@${x.i}`);
const v2 = (B, P) => run(flechesH1v2, B, P), v3 = (B, P) => run(flechesH1v3, B, P), m2 = (B, P) => run(moteurV2, B, P);

// moteur commun en règle A « v2 » = flechesH1v2 (scénarios variés)
const creux = d => p => ({ l: p - d }), pic = d => p => ({ h: p + d });
const SCEN = [
  [serie(150, { 110: rejHausse }), { 110: support }], [serie(150, { 100: rejBaisse, 110: rejHausse }), { 100: resistance, 110: support }],
  [serie(150, { 90: creux(2), 100: rejBaisse, 104: creux(1.8), 110: rejHausse }), { 100: resistance, 110: support }],
  [serie(160, { 96: pic(4), 110: rejHausse, 113: pic(2), 117: rejBaisse }), { 110: support, 117: resistance }],
  [serie(150, { 110: rejHausse, 113: rejHausse }), { 110: support, 113: () => support(110) }]];
for (const [k, [B, P]] of SCEN.entries()) eq(m2(B, P), v2(B, P), `moteur commun (A de v2) = flechesH1v2, scénario ${k + 1}`);

// A corrigée : verte sur support listé après un rejet sur résistance, sans creux plus haut → v3 oui, v2 non
const S1 = serie(150, { 100: rejBaisse, 110: rejHausse });
eq(v2(S1, { 100: resistance, 110: support }), ['baisse@100'], 'v2 : verte bloquée par A');
eq(v3(S1, { 100: resistance, 110: support }), ['baisse@100', 'hausse@110'], 'v3 : verte sur SUPPORT listé dès la première touche');
eq(v3(S1, { 100: resistance, 110: niv(-1.5, 'liquidité basse') }), ['baisse@100', 'hausse@110'], 'v3 : verte sur LIQUIDITÉ BASSE listée');
eq(v3(S1, { 100: resistance, 110: niv(-1.5, 'résistance') }), ['baisse@100'], 'v3 : verte ailleurs (sur une résistance) : A s’applique toujours');
// miroir : rouge sur résistance après un rebond sur support, sans sommet plus bas
const S2 = serie(160, { 100: rejHausse, 110: rejBaisse });
eq(v2(S2, { 100: support, 110: resistance }), ['hausse@100'], 'v2 : rouge bloquée par A (miroir)');
eq(v3(S2, { 100: support, 110: resistance }), ['hausse@100', 'baisse@110'], 'v3 : rouge sur RÉSISTANCE listée dès la première touche');
eq(v3(S2, { 100: support, 110: niv(1.5, 'liquidité haute') }), ['hausse@100', 'baisse@110'], 'v3 : rouge sur LIQUIDITÉ HAUTE listée');
eq(v3(S2, { 100: support, 110: niv(1.5, 'support') }), ['hausse@100'], 'v3 : rouge ailleurs (sur un support) : A s’applique toujours');
// B et C inchangées en v3
eq(v3(serie(150, { 110: rejHausse }), {}), [], 'v3, B : aucun niveau listé : aucune flèche');
eq(v3(serie(150, { 110: rejHausse }), { 110: niv(-2.3, 'support') }), [], 'v3, B : niveau à plus de 0,25 ATR : aucune flèche');
eq(v3(serie(160, { 100: rejHausse, 104: rejBaisse }), { 100: support, 104: resistance }), ['hausse@100'], 'v3, C : rouge (exemptée de A) à 4 bougies d’une verte : bloquée');
eq(v3(serie(150, { 110: rejHausse, 113: rejHausse }), { 110: support, 113: () => support(110) }), ['hausse@110'], 'v3, C : une seule flèche par approche');
{ const osc = Array.from({ length: 150 }, (_, i) => { const p = 2000 + 3 * Math.sin(i * 0.7); return { t: T0 + i * H, o: p - 0.2, h: p + 1, l: p - 1, c: p + 0.2, v: 100 }; });
  let total = 0; for (let i = 100; i < 140; i++) { const X = osc.slice(), p = X[i].o + 0.2; X[i] = { ...X[i], ...rejHausse(p) }; const F = flechesH1v3(X, { maintenant: fin(X), listes: plan({ [i]: () => [{ bas: X[i].l, haut: X[i].l, type: 'support' }] }) }); const tr = []; moteurH1(X, { maintenant: fin(X), listes: plan({ [i]: () => [{ bas: X[i].l, haut: X[i].l, type: 'support' }] }), trace: e => { if (e.i === i) tr.push(e.etape); } }); if (tr.includes('C-range')) total += F.length; }
  eq(total, 0, 'v3, C : jamais de flèche quand la trace dit « range »'); }

// la trace ne change jamais le résultat ; rejeu bougie par bougie sans redessin (niveaux listés réels)
{ const r = alea(11), B = []; let p = 2000;
  for (let i = 0; i < 700; i++) { const d = (r() - 0.48) * 6, o = p, c = p + d; p = c; const wick = r() < 0.15 ? 4 + r() * 4 : 1; B.push({ t: T0 + i * H, o, c, h: Math.max(o, c) + (r() < 0.5 ? wick : 1), l: Math.min(o, c) - (r() < 0.5 ? wick : 1), v: 50 + r() * 100 }); }
  const cle = f => `${f.t}|${f.sens}|${f.niveau.toFixed(4)}|${f.type}`, tout = flechesH1v3(B, { maintenant: fin(B) }), ev = [];
  eq(moteurH1(B, { maintenant: fin(B), trace: e => ev.push(e) }).map(cle), tout.map(cle), 'la trace ne change pas le résultat');
  ok(ev.filter(e => e.etape === 'posee').length === tout.length, 'trace : une décision « posée » par flèche');
  eq(moteurV2(B, { maintenant: fin(B) }).map(cle), flechesH1v2(B, { maintenant: fin(B) }).map(cle), 'moteur commun (A de v2) = flechesH1v2 sur 700 bougies avec niveaux réels');
  let ecarts = 0; for (let i = B.length - 80; i < B.length; i++) { const pref = B.slice(0, i + 1), G = flechesH1v3(pref, { maintenant: pref[i].t + H }); if (G.map(cle).join(';') !== tout.filter(f => f.i <= i).map(cle).join(';')) ecarts++; }
  eq(ecarts, 0, `v3 : rejeu bougie par bougie, aucune flèche redessinée (${tout.length} flèches)`);
  ok(tout.length >= flechesH1v2(B, { maintenant: fin(B) }).length, 'v3 lève un blocage : au moins autant de flèches que v2 ici'); }

/* bilans par version, chacune depuis le commit de sa règle, Holm sur 3 versions */
{ const r = alea(5), B = []; let p = 2000; const t0 = DEPUIS_VERSIONS['fleches-v1'].t - 1500 * H;
  for (let i = 0; i < 2000; i++) { const o = p, c = p + (r() - 0.5) * 6; p = c; B.push({ t: t0 + i * H, o, c, h: Math.max(o, c) + r() * 3, l: Math.min(o, c) - r() * 3, v: 100 }); }
  const Fl = []; for (let i = 100; i < 1990; i += 9) Fl.push({ t: B[i].t, sens: i % 2 ? 'hausse' : 'baisse' });
  const tout = bilansH1(B, { 'fleches-v1': Fl, 'fleches-h1-v2': Fl, 'fleches-h1-v3': Fl }, { maintenant: fin(B), spread: 0.5 });
  ok(tout['fleches-v1'].total >= tout['fleches-h1-v2'].total && tout['fleches-h1-v2'].total >= tout['fleches-h1-v3'].total, 'chaque version compte depuis SA date (v1 ≥ v2 ≥ v3)');
  eq(tout['fleches-h1-v3'].total, Fl.filter(f => f.t >= DEPUIS_H1_V3.t).length, 'v3 : flèches depuis le commit eadb16f seulement');
  ok(/depuis le 7 nov\. 2026, 20 h 47/.test(tout['fleches-v1'].texte) && /depuis le 8 nov\. 2026, 01 h 45/.test(tout['fleches-h1-v3'].texte), 'textes : la date de chaque règle');
  const ps = Object.values(tout).map(b => b.pHolm);
  ok(Object.values(tout).every(b => !b.assez || (b.pHolm >= b.p && /Holm, 3 versions/.test(b.texte))), 'Holm : p corrigée ≥ p brute, dite dans le texte');
  ok(Object.values(tout).every(b => !b.assez || b.pHolm != null) && ps.some(x => x != null), 'Holm : calculée pour les versions mesurées');
  eq(bilansH1(B.slice(0, 200), { 'fleches-h1-v3': [] }, { maintenant: B[199].t + H })['fleches-h1-v3'].pHolm, null, 'pas assez de données : pas de p'); }

/* registre : la liste v3 s'ajoute sans toucher v1 ni v2 */
{ eq(VERSIONS.slice(0, 3), ['fleches-v1', 'fleches-h1-v2', 'fleches-h1-v3'], 'registre : v1, v2, v3 (v4 ajoutée ensuite à côté)');
  const f = (t, s = 'hausse') => ({ t, sens: s, niveau: 2000, type: 'support' });
  let R = registreVide(1); R = ajouter(R, 'fleches-v1', [f(5)], { vu: 10 }).registre; R = ajouter(R, 'fleches-h1-v2', [f(6)], { vu: 10 }).registre;
  const avant = JSON.stringify([R.versions['fleches-v1'], R.versions['fleches-h1-v2']]);
  R = ajouter(R, 'fleches-h1-v3', [f(5), f(7)], { vu: 20 }).registre;
  eq(JSON.stringify([R.versions['fleches-v1'], R.versions['fleches-h1-v2']]), avant, 'registres v1 et v2 intacts');
  eq([R.versions['fleches-h1-v3'].length, verifier(R, 'fleches-h1-v3').ok], [2, true], 'registre v3 chaîné'); }

/* journal : flèche H1 + v1 / v2 / v3 */
ok(['fleches-h1-v3', 'fleches-h1-v2', 'fleches-v1'].every(v => VERSIONS_FLECHE_H1.includes(v)), 'journal : v1, v2, v3 proposées');
const tr = { source: 'saisie', sens: 'achat', entree: 4000, stop: 3990, taille: 1, etiquette: 'flèche H1', versionFleche: 'fleches-h1-v3' };
eq([valider(tr), etiquetteComplete(tr)], [[], 'flèche H1 · fleches-h1-v3'], 'journal : étiquette « flèche H1 · fleches-h1-v3 »');

console.log(`fleches-h1-v3-test : ${n} vérifications OK`);
