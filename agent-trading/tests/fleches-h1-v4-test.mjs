/* Tests des flèches H1 version 4, de la liste détaillée des niveaux et des bilans à 4 versions : node agent-trading/tests/fleches-h1-v4-test.mjs
   Séries fabriquées : niveaux admis (≥ 8 touches, liquidités semaine / mois), sens imposé par le type de niveau, confirmation à la clôture,
   une flèche par niveau et par approche, règle C ; absence de redessin ; v2 et v3 inchangées quand elles lisent la liste détaillée. */
import assert from 'node:assert/strict';
import { REGLES_H1_V2, flechesH1v2, listesAvant } from '../front/or/fleches-h1-v2.js';
import { REGLES_H1_V3, flechesH1v3, DEPUIS_H1_V3 } from '../front/or/fleches-h1-v3.js';
import { REGLES_H1_V4, DEPUIS_H1_V4, DEPUIS_4, flechesH1v4, listesDetail, admis, estMajeure, bilans4 } from '../front/or/fleches-h1-v4.js';
import { registreVide, ajouter, verifier, VERSIONS } from '../front/or/registre-fleches.js';
import { VERSIONS_FLECHE_H1, etiquetteComplete, valider } from '../front/or/journal-calcul.js';
import { alea } from '../front/or/zones-or.js';
let n = 0; const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; }, ok = (c, m) => { assert.ok(c, m); n++; };
const H = 3600e3, T0 = Date.UTC(2026, 9, 1);

// règles
eq(Object.isFrozen(REGLES_H1_V4), true, 'règles v4 figées');
eq([REGLES_H1_V4.touchesMin, REGLES_H1_V4.liquiditesMajeures], [8, ['semaine', 'mois']], 'consigne : 8 touches, liquidités semaine / mois');
for (const k of ['ecartAtr', 'meche', 'volumeMedianeN', 'listeAtr', 'fenetreListe', 'opposeeBougies', 'approcheSortieAtr', 'memeNiveauAtr', 'suiviBougies', 'suiviAtr', 'regroupementBougies', 'hasard', 'minFleches', 'decision', 'fraisTaker']) eq(REGLES_H1_V4[k], REGLES_H1_V3[k], `seuil « ${k} » repris de v3 (= v2)`);
eq(DEPUIS_H1_V4.t, Date.parse('2026-11-08T02:34:38+01:00'), 'bilan v4 ouvert à la date du commit de ses règles');
ok(DEPUIS_H1_V3.t < DEPUIS_H1_V4.t && Object.keys(DEPUIS_4).length === 4, 'quatre versions, chacune sa date');

// niveaux admis
eq([admis({ type: 'support', touches: 8 }), admis({ type: 'support', touches: 7 }), admis({ type: 'résistance', touches: 12 }), admis({ type: 'résistance' })], [true, false, true, false], 'supports / résistances : au moins 8 touches');
const liq = (type, raisons) => ({ type, raisons });
eq([admis(liq('liquidité basse', ['plus bas de la semaine dernière'])), admis(liq('liquidité haute', ['plus haut du mois dernier'])), admis(liq('liquidité basse', ['creux égaux'])), admis(liq('liquidité haute', ['plus haut de la veille'])), admis(liq('liquidité basse', ['creux égaux', 'plus bas de la semaine dernière'])), admis(liq('liquidité haute', ['sommets égaux']))],
  [true, true, false, false, true, false], 'liquidités : semaine / mois seulement (égaux et veille seuls exclus)');
eq(estMajeure({ raisons: ['plus bas du mois dernier'] }), true, 'mois = majeure');

/* série fabriquée (comme pour v2 / v3) */
const pente = 0.05, px = i => 2000 + pente * i;
function serie(nb, modif = {}) { const B = []; for (let i = 0; i < nb; i++) { const p = px(i); B.push({ t: T0 + i * H, o: p - 0.2, h: p + 1, l: p - 1, c: p + 0.2, v: 100 }); } for (const [i, f] of Object.entries(modif)) B[+i] = { ...B[+i], ...f(px(+i)) }; return B; }
const rejHausse = p => ({ o: p, c: p + 0.3, h: p + 0.5, l: p - 1.5 }), rejBaisse = p => ({ o: p, c: p - 0.3, h: p + 1.5, l: p - 0.5 });
const niv = (d, type, extra = {}) => i => [{ bas: px(i) + d, haut: px(i) + d, type, ...extra }];
const sup = (t = 8) => niv(-1.5, 'support', { touches: t }), res = (t = 8) => niv(1.5, 'résistance', { touches: t });
const plan = P => (C, i) => (P[i] ? P[i](i) : []), fin = B => B[B.length - 1].t + H;
const v4 = (B, P) => flechesH1v4(B, { maintenant: fin(B), listes: plan(P) }).map(x => `${x.sens}@${x.i}`);
const v3 = (B, P) => flechesH1v3(B, { maintenant: fin(B), listes: plan(P) }).map(x => `${x.sens}@${x.i}`);

eq(v4(serie(150, { 110: rejHausse }), { 110: sup(8) }), ['hausse@110'], 'verte sur support de 8 touches');
eq(v4(serie(150, { 110: rejHausse }), { 110: sup(7) }), [], 'support de 7 touches (secondaire) : aucune flèche');
eq(v3(serie(150, { 110: rejHausse }), { 110: sup(7) }), ['hausse@110'], 'contrôle : v3 la posait');
eq(v4(serie(150, { 110: rejHausse }), { 110: niv(-1.5, 'liquidité basse', { raisons: ['plus bas de la semaine dernière'] }) }), ['hausse@110'], 'verte sur liquidité basse de la semaine');
eq(v4(serie(150, { 110: rejHausse }), { 110: niv(-1.5, 'liquidité basse', { raisons: ['creux égaux'] }) }), [], 'creux égaux : aucune flèche');
eq(v4(serie(150, { 110: rejHausse }), { 110: niv(-1.5, 'résistance', { touches: 12 }) }), [], 'verte sur une résistance : jamais');
eq(v4(serie(150, { 110: rejBaisse }), { 110: res(9) }), ['baisse@110'], 'rouge sur résistance de 9 touches');
eq(v4(serie(150, { 110: rejBaisse }), { 110: niv(1.5, 'support', { touches: 12 }) }), [], 'rouge sur un support : jamais');
eq(v4(serie(150, { 110: rejBaisse }), { 110: niv(1.5, 'liquidité haute', { raisons: ['plus haut du mois dernier'] }) }), ['baisse@110'], 'rouge sur liquidité haute du mois');
eq(v4(serie(150, { 110: rejBaisse }), { 110: niv(1.5, 'liquidité haute', { raisons: ['plus haut de la veille'] }) }), [], 'veille seule : aucune flèche');
// confirmation à la clôture du bon côté (≥ 0,15 ATR)
eq(v4(serie(150, { 110: p => ({ o: p, c: p - 1.45, h: p + 0.5, l: p - 1.5 }) }), { 110: sup() }), [], 'clôture trop près du support (mèche insuffisante, côté) : aucune flèche');
eq(v4(serie(150, { 110: p => ({ ...rejHausse(p), v: 50 }) }), { 110: sup() }), [], 'volume sous la médiane : aucune flèche (seuil repris)');
// pas de règle A : verte sur support juste après un rejet sur résistance
eq(v4(serie(150, { 100: rejBaisse, 110: rejHausse }), { 100: res(), 110: sup() }), ['baisse@100', 'hausse@110'], 'pas de règle A : verte sur support admis sans attendre de creux plus haut');
// une flèche par niveau et par approche
eq(v4(serie(150, { 110: rejHausse, 113: rejHausse }), { 110: sup(), 113: () => sup()(110) }), ['hausse@110'], 'même niveau, même approche : une seule flèche');
eq(v4(serie(150, { 110: rejHausse, 111: p => ({ o: p, c: p + 2.5, h: p + 2.7, l: p - 0.2 }), 113: rejHausse }), { 110: sup(), 113: () => sup()(110) }), ['hausse@110', 'hausse@113'], 'après une clôture à ≥ 1 ATR puis retour : nouvelle flèche');
// C : opposée < 8 bougies, range
eq(v4(serie(160, { 100: rejHausse, 104: rejBaisse }), { 100: sup(), 104: res() }), ['hausse@100'], 'C : flèche opposée à 4 bougies : bloquée');
eq(v4(serie(160, { 100: rejHausse, 108: rejBaisse }), { 100: sup(), 108: res() }), ['hausse@100', 'baisse@108'], 'C : à 8 bougies : posée');
{ const osc = Array.from({ length: 150 }, (_, i) => { const p = 2000 + 3 * Math.sin(i * 0.7); return { t: T0 + i * H, o: p - 0.2, h: p + 1, l: p - 1, c: p + 0.2, v: 100 }; });
  let vus = 0, poses = 0; for (let i = 100; i < 140; i++) { const X = osc.slice(), p = X[i].o + 0.2; X[i] = { ...X[i], ...rejHausse(p) }; const P = { [i]: () => [{ bas: X[i].l, haut: X[i].l, type: 'support', touches: 9 }] }, tr = [];
    const F = flechesH1v4(X, { maintenant: fin(X), listes: plan(P), trace: e => { if (e.i === i) tr.push(e.etape); } }); if (tr.includes('C-range')) { vus++; poses += F.filter(f => f.i === i).length; } }
  ok(vus > 0 && poses === 0, `C : jamais de flèche en régime range (${vus} cas)`); }

/* liste détaillée = listesAvant (bas, haut, type, texte) ; v2 / v3 inchangées en la lisant ; rejeu sans redessin de v4 */
{ const r = alea(11), B = []; let p = 2000;
  for (let i = 0; i < 700; i++) { const d = (r() - 0.48) * 6, o = p, c = p + d; p = c; const wick = r() < 0.15 ? 4 + r() * 4 : 1; B.push({ t: T0 + i * H, o, c, h: Math.max(o, c) + (r() < 0.5 ? wick : 1), l: Math.min(o, c) - (r() < 0.5 ? wick : 1), v: 50 + r() * 100 }); }
  let diff = 0; for (let i = 60; i < B.length; i += 7) { const A = listesAvant(B, i), D = listesDetail(B, i).map(({ bas, haut, type, texte }) => ({ bas, haut, type, texte })); if (JSON.stringify(A) !== JSON.stringify(D)) diff++; }
  eq(diff, 0, 'liste détaillée : mêmes bas, haut, type, texte que listesAvant');
  const cle = f => `${f.t}|${f.sens}|${f.niveau.toFixed(4)}|${f.type}`, m = fin(B);
  eq(flechesH1v2(B, { maintenant: m, listes: listesDetail }).map(cle), flechesH1v2(B, { maintenant: m }).map(cle), 'v2 inchangée avec la liste détaillée');
  eq(flechesH1v3(B, { maintenant: m, listes: listesDetail }).map(cle), flechesH1v3(B, { maintenant: m }).map(cle), 'v3 inchangée avec la liste détaillée');
  const tout = flechesH1v4(B, { maintenant: m }); let ecarts = 0;
  for (let i = B.length - 80; i < B.length; i++) { const pref = B.slice(0, i + 1), G = flechesH1v4(pref, { maintenant: pref[i].t + H }); if (G.map(cle).join(';') !== tout.filter(f => f.i <= i).map(cle).join(';')) ecarts++; }
  eq(ecarts, 0, `v4 : rejeu bougie par bougie, aucune flèche redessinée (${tout.length} flèches)`);
  ok(tout.every(f => (f.sens === 'hausse') === (f.type === 'support' || f.type === 'liquidité basse')), 'v4 : verte ⇔ support / liquidité basse, rouge ⇔ résistance / liquidité haute');
  ok(tout.every(f => f.type.startsWith('liquidité') ? estMajeure(f) : f.touches >= 8), 'v4 : seulement des niveaux admis'); }

/* bilans à 4 versions, Holm sur 4 */
{ const r = alea(5), B = []; let p = 2000; const t0 = DEPUIS_4['fleches-v1'].t - 1500 * H;
  for (let i = 0; i < 2000; i++) { const o = p, c = p + (r() - 0.5) * 6; p = c; B.push({ t: t0 + i * H, o, c, h: Math.max(o, c) + r() * 3, l: Math.min(o, c) - r() * 3, v: 100 }); }
  const Fl = []; for (let i = 100; i < 1990; i += 9) Fl.push({ t: B[i].t, sens: i % 2 ? 'hausse' : 'baisse' });
  const T = bilans4(B, Object.fromEntries(Object.keys(DEPUIS_4).map(v => [v, Fl])), { maintenant: fin(B), spread: 0.5 });
  ok(T['fleches-h1-v3'].total >= T['fleches-h1-v4'].total && T['fleches-h1-v4'].total === Fl.filter(f => f.t >= DEPUIS_H1_V4.t).length, 'v4 : flèches depuis le commit 632b26d seulement');
  ok(/depuis le 8 nov\. 2026, 02 h 34/.test(T['fleches-h1-v4'].texte), 'texte : date du commit v4');
  ok(Object.values(T).every(b => !b.assez || (b.pHolm >= b.p && /Holm, 4 versions/.test(b.texte))), 'Holm sur 4 versions, dit dans le texte'); }

/* registre et journal */
{ eq(VERSIONS.slice(0, 4), ['fleches-v1', 'fleches-h1-v2', 'fleches-h1-v3', 'fleches-h1-v4'], 'registre : v1 à v4 (v5 ajoutée ensuite à côté)');
  const f = (t, s = 'hausse') => ({ t, sens: s, niveau: 2000, type: 'support' });
  let R = registreVide(1); for (const v of VERSIONS.slice(0, 3)) R = ajouter(R, v, [f(5)], { vu: 10 }).registre;
  const avant = JSON.stringify(VERSIONS.slice(0, 3).map(v => R.versions[v]));
  R = ajouter(R, 'fleches-h1-v4', [f(5), f(9)], { vu: 20 }).registre;
  eq(JSON.stringify(VERSIONS.slice(0, 3).map(v => R.versions[v])), avant, 'registres v1, v2, v3 intacts');
  eq([R.versions['fleches-h1-v4'].length, verifier(R, 'fleches-h1-v4').ok], [2, true], 'registre v4 chaîné'); }
ok(VERSIONS_FLECHE_H1.includes('fleches-h1-v4'), 'journal : v4 proposée');
const tr = { source: 'saisie', sens: 'achat', entree: 4000, stop: 3990, taille: 1, etiquette: 'flèche H1', versionFleche: 'fleches-h1-v4' };
eq([valider(tr), etiquetteComplete(tr)], [[], 'flèche H1 · fleches-h1-v4'], 'journal : flèche H1 · fleches-h1-v4');
ok(REGLES_H1_V2.version === 'fleches-h1-v2', 'v2 toujours là');

console.log(`fleches-h1-v4-test : ${n} vérifications OK`);
