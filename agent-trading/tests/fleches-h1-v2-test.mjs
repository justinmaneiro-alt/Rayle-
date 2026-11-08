/* Tests des flèches H1 version 2, du registre en ajout seul et du bilan : node agent-trading/tests/fleches-h1-v2-test.mjs
   Séries fabriquées : chaque règle (A, B, C) est vérifiée seule ; absence de redessin par rejeu bougie par bougie. */
import assert from 'node:assert/strict';
import { REGLES_H1_V2, DEPUIS_H1_V2, regimes, flechesH1v2, issue, coutR, independantes, bilanH1, heureParis } from '../front/or/fleches-h1-v2.js';
import { registreVide, ajouter, verifier, prefixeDe, flechesDu, empreinte } from '../front/or/registre-fleches.js';
import { valider, CLES, etiquetteComplete, ETIQUETTES } from '../front/or/journal-calcul.js';
import { alea } from '../front/or/zones-or.js';
let n = 0; const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; }, ok = (c, m) => { assert.ok(c, m); n++; };
const H = 3600e3, T0 = Date.UTC(2026, 9, 1);

eq(Object.isFrozen(REGLES_H1_V2), true, 'règles figées');
eq([REGLES_H1_V2.listeAtr, REGLES_H1_V2.opposeeBougies, REGLES_H1_V2.regroupementBougies, REGLES_H1_V2.minFleches, REGLES_H1_V2.decision, REGLES_H1_V2.hasard, REGLES_H1_V2.fraisTaker], [0.25, 8, 8, 30, 100, 1000, 0.0005], 'seuils de la consigne');
eq([REGLES_H1_V2.ecartAtr, REGLES_H1_V2.meche, REGLES_H1_V2.volumeMedianeN], [0.15, 0.5, 20], 'seuils repris de fleches-v1, inchangés');
eq(DEPUIS_H1_V2.t, Date.parse('2026-11-08T01:07:14+01:00'), 'bilan ouvert à la date du commit des règles');

/* ── série fabriquée : tendance haussière lente, bougies neutres (mèches < moitié), volume constant ── */
const pente = 0.05, px = i => 2000 + pente * i;
function serie(nb, modif = {}) {
  const B = [];
  for (let i = 0; i < nb; i++) { const p = px(i); B.push({ t: T0 + i * H, o: p - 0.2, h: p + 1, l: p - 1, c: p + 0.2, v: 100 }); }
  for (const [i, f] of Object.entries(modif)) B[+i] = { ...B[+i], ...f(px(+i)) };
  return B;
}
const rejHausse = p => ({ o: p, c: p + 0.3, h: p + 0.5, l: p - 1.5 });   // mèche basse 1,5 sur 2 ; niveau = p − 1,5
const rejBaisse = p => ({ o: p, c: p - 0.3, h: p + 1.5, l: p - 0.5 });   // mèche haute 1,5 sur 2 ; niveau = p + 1,5
const support = i => [{ bas: px(i) - 1.5, haut: px(i) - 1.5, type: 'support' }], resistance = i => [{ bas: px(i) + 1.5, haut: px(i) + 1.5, type: 'résistance' }];
const plan = P => (C, i) => (P[i] ? P[i](i) : []);
const fin = B => B[B.length - 1].t + H;
const F = (B, P) => flechesH1v2(B, { maintenant: fin(B), listes: plan(P) }).map(f => `${f.sens}@${f.i}`);

// régime : tendance → haussier ; plat → range
const RG = regimes(serie(150)); eq([RG[10], RG[149]], ['inconnu', 'haussier'], 'régime : inconnu au début, haussier en tendance');
const plat = Array.from({ length: 150 }, (_, i) => ({ t: T0 + i * H, o: 2000, h: 2001, l: 1999, c: 2000, v: 100 }));
eq(regimes(plat)[149], 'range', 'régime : plat = range');

// B : une flèche seulement sur un niveau LISTÉ à moins de 0,25 ATR
eq(F(serie(150, { 110: rejHausse }), { 110: support }), ['hausse@110'], 'rejet sur un support listé : flèche');
eq(F(serie(150, { 110: rejHausse }), {}), [], 'B : même rejet sans niveau listé : aucune flèche');
eq(F(serie(150, { 110: rejHausse }), { 110: i => [{ bas: px(i) - 2.3, haut: px(i) - 2.3, type: 'support' }] }), [], 'B : niveau listé à plus de 0,25 ATR : aucune flèche');
eq(F(serie(150, { 110: rejHausse }), { 110: i => [{ bas: px(i) - 1.8, haut: px(i) - 1.8, type: 'support' }] }), ['hausse@110'], 'B : niveau à 0,3 $ (< 0,25 ATR) : flèche');
eq(F(serie(150, { 110: rejHausse }), { 110: i => [{ bas: px(i) - 1.5, haut: px(i) - 1.5, type: 'liquidité haute' }] }), [], 'liquidité haute : jamais de flèche verte');
eq(F(serie(150, { 110: rejHausse }), { 110: i => [{ bas: px(i) - 3, haut: px(i) - 1.4, type: 'support' }] }), ['hausse@110'], 'bande large : le bas de bougie dans la bande compte');
eq(F(serie(150, { 110: p => ({ ...rejHausse(p), v: 50 }) }), { 110: support }), [], 'volume sous la médiane : aucune flèche (seuil v1)');

// C : aucune flèche en range
{ // oscillation : moyennes mêlées ; on choisit une bougie de rejet dont le régime (calculé avec elle) est bien « range »
  const osc = Array.from({ length: 150 }, (_, i) => { const p = 2000 + 3 * Math.sin(i * 0.7); return { t: T0 + i * H, o: p - 0.2, h: p + 1, l: p - 1, c: p + 0.2, v: 100 }; });
  let j = -1, B;
  for (let i = 100; i < 140 && j < 0; i++) { const X = osc.slice(); const p = X[i].o + 0.2; X[i] = { ...X[i], ...rejHausse(p) }; if (regimes(X)[i] === 'range') { j = i; B = X; } }
  ok(j > 0, 'bougie de rejet en régime range trouvée');
  const L = B[j].l, avec = flechesH1v2(B, { maintenant: fin(B), listes: plan({ [j]: () => [{ bas: L, haut: L, type: 'support' }] }) });
  eq(avec.length, 0, 'C : régime range : aucune flèche'); }

// C : une seule flèche par approche
eq(F(serie(150, { 110: rejHausse, 113: rejHausse }), { 110: support, 113: i => support(110) }), ['hausse@110'], 'C : deuxième rejet sur le même niveau, même approche : aucune flèche');
eq(F(serie(150, { 110: rejHausse, 111: p => ({ o: p, c: p + 2.5, h: p + 2.7, l: p - 0.2 }), 113: rejHausse }), { 110: support, 113: i => support(110) }), ['hausse@110', 'hausse@113'], 'C : après une clôture à ≥ 1 ATR du niveau, nouvelle approche : flèche');

// A : pas de flèche verte après un rejet sur résistance tant qu'un creux plus haut n'est pas confirmé
const creux = (d = 2) => p => ({ l: p - d });
eq(F(serie(150, { 100: rejBaisse, 110: rejHausse }), { 100: resistance, 110: support }), ['baisse@100'], 'A : rejet sur résistance puis rebond sans creux plus haut : pas de flèche verte');
eq(F(serie(150, { 90: creux(2), 100: rejBaisse, 104: creux(1.8), 110: rejHausse }), { 100: resistance, 110: support }), ['baisse@100', 'hausse@110'], 'A : creux plus haut confirmé après le rejet : flèche verte');
eq(F(serie(150, { 90: creux(1.2), 100: rejBaisse, 104: creux(3), 110: rejHausse }), { 100: resistance, 110: support }), ['baisse@100'], 'A : creux formé après le rejet mais plus BAS : pas de flèche verte');
eq(F(serie(150, { 90: creux(2), 100: rejBaisse, 106: creux(1.8), 110: rejHausse }), { 100: resistance, 110: support }), ['baisse@100', 'hausse@110'], 'A : creux confirmé exactement à la bougie de la flèche (106 + 3 ≤ 110)');
eq(F(serie(150, { 90: creux(2), 100: rejBaisse, 108: creux(1.8), 110: rejHausse }), { 100: resistance, 110: support }), ['baisse@100'], 'A : creux pas encore confirmé (108 + 3 > 110) : pas de flèche verte');
// A miroir + C : flèche opposée à moins de 8 bougies
const pic = d => p => ({ h: p + d });
eq(F(serie(160, { 96: pic(4), 110: rejHausse, 113: pic(2), 117: rejBaisse }), { 110: support, 117: resistance }), ['hausse@110'], 'C : flèche rouge à 7 bougies d’une verte : aucune');
eq(F(serie(160, { 96: pic(4), 110: rejHausse, 113: pic(2), 118: rejBaisse }), { 110: support, 118: resistance }), ['hausse@110', 'baisse@118'], 'C : à 8 bougies : flèche (sommet plus bas confirmé)');
eq(F(serie(160, { 96: pic(2), 110: rejHausse, 113: pic(4), 118: rejBaisse }), { 110: support, 118: resistance }), ['hausse@110'], 'A miroir : rebond sur support puis sommet plus HAUT : pas de flèche rouge');

/* ── absence de redessin : rejeu bougie par bougie, niveaux listés réels (listesAvant) sur une marche au hasard ── */
{ const r = alea(11), B = []; let p = 2000;
  for (let i = 0; i < 700; i++) { const d = (r() - 0.48) * 6, o = p, c = p + d; p = c; const wick = r() < 0.15 ? 4 + r() * 4 : 1; B.push({ t: T0 + i * H, o, c, h: Math.max(o, c) + (r() < 0.5 ? wick : 1), l: Math.min(o, c) - (r() < 0.5 ? wick : 1), v: 50 + r() * 100 }); }
  const cle = f => `${f.t}|${f.sens}|${f.niveau.toFixed(4)}|${f.type}`, tout = flechesH1v2(B, { maintenant: fin(B) });
  let ecarts = 0; for (let i = B.length - 80; i < B.length; i++) { const pref = B.slice(0, i + 1), G = flechesH1v2(pref, { maintenant: pref[i].t + H }); if (G.map(cle).join(';') !== tout.filter(f => f.i <= i).map(cle).join(';')) ecarts++; }
  eq(ecarts, 0, `rejeu bougie par bougie : aucune flèche redessinée (${tout.length} flèches sur 700 bougies)`);
  ok(tout.every(f => f.regime === 'haussier' || f.regime === 'baissier'), 'jamais de flèche en range');
  ok(tout.every((f, k) => tout.every((g, j) => j >= k || g.sens === f.sens || f.i - g.i >= 8)), 'jamais deux flèches opposées à moins de 8 bougies'); }

/* ── bilan ── */
{ const B = serie(40); B[11] = { ...B[11], h: px(11) + 3 }; B[21] = { ...B[21], l: px(21) - 3, h: px(21) + 3 };
  eq(issue(B, 10, 'hausse', 2).ok, true, 'issue : +1 ATR atteint d’abord');
  eq(issue(B, 20, 'hausse', 2).r, -1, 'issue : cible et stop dans la même bougie = −1 ATR (prudent)');
  eq(issue(B, 35, 'hausse', 2), null, 'issue : 8 bougies pas encore closes = non mesurée');
  const x = issue(B, 0, 'baisse', 50); ok(x.temps && Math.abs(x.r - (B[8].c - B[0].c) * -1 / 50) < 1e-9, 'issue : ni cible ni stop = clôture de la 8e bougie'); }
eq(+coutR(4000, 10, 0.5).toFixed(4), +((2 * 0.0005 * 4000 + 0.5) / 10).toFixed(4), 'coût : frais preneur des deux côtés + spread, en R');
eq(independantes([{ i: 10 }, { i: 14 }, { i: 20 }, { i: 30 }, { i: 37 }, { i: 45 }]).map(f => f.i), [10, 30, 45], 'indépendantes : regroupées à moins de 8 bougies (chaîne)');
{ const B = serie(120); const Fl = [{ t: B[50].t, sens: 'hausse' }];
  const b1 = bilanH1(B, Fl, { maintenant: fin(B), depuis: B[0].t }); eq([b1.assez, b1.independantes], [false, 1], 'bilan : pas assez de données sous 30');
  ok(/pas assez de données/.test(b1.texte) && /Aucune décision avant 100/.test(b1.texte), 'bilan : textes « pas assez » et « aucune décision avant 100 »');
  eq(bilanH1(B, Fl, { maintenant: fin(B), depuis: B[60].t }).total, 0, 'bilan : seules les flèches depuis la date du commit'); }
{ const r = alea(5), B = []; let p = 2000; for (let i = 0; i < 2000; i++) { const o = p, c = p + (r() - 0.5) * 6; p = c; B.push({ t: T0 + i * H, o, c, h: Math.max(o, c) + r() * 3, l: Math.min(o, c) - r() * 3, v: 100 }); }
  const Fl = []; for (let i = 100; i < 1900; i += 12) Fl.push({ t: B[i].t, sens: i % 24 ? 'hausse' : 'baisse' });
  const b = bilanH1(B, Fl, { maintenant: fin(B), depuis: B[0].t, spread: 0.6 });
  ok(b.assez && b.independantes === Fl.length && b.hasard && b.hasard.tirages > 900, `bilan : mesuré, ${b.hasard && b.hasard.tirages} tirages au hasard`);
  ok(b.decision && Math.abs(b.reussite - b.hasard.reussite) < 0.12, `marche au hasard : réussite ≈ hasard (${Math.round(b.reussite * 100)} % contre ${Math.round(b.hasard.reussite * 100)} %)`);
  ok(b.rNet < 0.05 && /spread mesuré 0,60 \$/.test(b.texte), 'R net après frais et spread, dit dans le texte');
  eq(bilanH1(B, Fl, { maintenant: fin(B), depuis: B[0].t, spread: 0.6 }).hasard, b.hasard, 'hasard reproductible (graine)');
  ok(/spread non mesuré/.test(bilanH1(B, Fl, { maintenant: fin(B), depuis: B[0].t }).texte), 'sans spread : « spread non mesuré » dit clairement'); }
ok(heureParis(Date.UTC(2026, 6, 1, 10)) === 12 && heureParis(Date.UTC(2026, 11, 1, 10)) === 11, 'heure de Paris (été / hiver)');

/* ── registre daté, en ajout seul ── */
{ const f = (t, s = 'hausse') => ({ t, sens: s, niveau: 2000.123456, type: 'support' });
  let R = registreVide(1); let x = ajouter(R, 'fleches-h1-v2', [f(5), f(3), f(1)], { depuis: 2, vu: 100 }); R = x.registre;
  eq([x.ajoutes, R.versions['fleches-h1-v2'].map(e => e.t)], [2, [3, 5]], 'registre : avant la date du commit, rien ; tri par date');
  const avant = R; x = ajouter(R, 'fleches-h1-v2', [f(3), f(5), f(9)], { depuis: 2, vu: 200 }); R = x.registre;
  eq([x.ajoutes, R.versions['fleches-h1-v2'].map(e => [e.t, e.vu])], [1, [[3, 100], [5, 100], [9, 200]]], 'registre : ajout seul, les entrées gardent leur date de première vue');
  eq(avant.versions['fleches-h1-v2'].length, 2, 'registre : l’ancien objet n’est pas modifié');
  ok(Object.isFrozen(R.versions['fleches-h1-v2'][0]), 'entrée gelée');
  eq(verifier(R, 'fleches-h1-v2').ok, true, 'chaîne d’empreintes valide');
  const T = JSON.parse(JSON.stringify(R)); T.versions['fleches-h1-v2'][1].niveau = 1999; eq(verifier(T, 'fleches-h1-v2').ok, false, 'entrée retouchée : détectée');
  const S2 = JSON.parse(JSON.stringify(R)); S2.versions['fleches-h1-v2'].splice(1, 1); eq(verifier(S2, 'fleches-h1-v2').ok, false, 'entrée supprimée : détectée');
  eq([prefixeDe(avant, R), prefixeDe(R, avant), prefixeDe(T, R)], [true, false, false], 'écriture seulement si le stocké est un préfixe exact');
  x = ajouter(R, 'fleches-v1', [f(4, 'baisse')], { depuis: 2, vu: 300 }); eq([x.registre.versions['fleches-v1'].length, x.registre.versions['fleches-h1-v2'].length], [1, 3], 'registres v1 et v2 côte à côte');
  eq(flechesDu(R, 'fleches-h1-v2').map(e => e.version), ['fleches-h1-v2', 'fleches-h1-v2', 'fleches-h1-v2'], 'lecture des flèches pour le bilan');
  assert.throws(() => ajouter(R, 'v3', [f(10)])); n++;
  eq(empreinte('abc'), empreinte('abc'), 'empreinte stable'); }

/* ── journal : étiquette « flèche H1 » + version ── */
ok(ETIQUETTES.includes('flèche H1'), 'étiquette « flèche H1 »');
const tr = { source: 'saisie', sens: 'achat', entree: 4000, stop: 3990, taille: 1, etiquette: 'flèche H1' };
eq(valider(tr), ['version de la flèche H1'], 'version obligatoire');
eq(valider({ ...tr, versionFleche: 'fleches-h1-v2' }), [], 'avec la version : valide');
eq([etiquetteComplete({ ...tr, versionFleche: 'fleches-h1-v2' }), CLES.etiquette({ ...tr, versionFleche: 'fleches-v1' }), etiquetteComplete({ etiquette: 'balayage' })], ['flèche H1 · fleches-h1-v2', 'flèche H1 · fleches-v1', 'balayage'], 'bilan du journal séparé par version');

console.log(`fleches-h1-v2-test : ${n} vérifications OK`);
