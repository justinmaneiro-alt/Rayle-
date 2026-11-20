/* Tests purs des niveaux de réaction (v4.1). node trader-pro/tests/reaction-test.mjs */
import { flechesVolume } from '../volume/volume-calcul.js';
import { trouverReactions, niveauxReaction, etiquetteNiveau, niveauProche, phraseNiveaux, PARAMS_REACTION } from '../volume/reaction-calcul.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const H = 3600e3, T0 = Date.UTC(2026, 0, 1);
/* oscillation 100 ↔ 110 : n allers-retours de 10 bougies chacun, pas de 1 par bougie ; fond = plancher exact 100 (+ bruit déterministe) */
function oscille(n, { bas = 100, haut = 110, pas = 1 } = {}) {
  const B = []; let p = haut, sens = -1, t = T0; const push = (o, c) => { B.push({ t, o, h: Math.max(o, c) + 0.2, l: Math.min(o, c) - 0.2, c, v: 100 }); t += H; };
  for (let i = 0; i < 8; i++) push(haut - 0.1 * i, haut - 0.1 * i - 0.1);   // départ plat pour l'ATR
  p = haut; for (let k = 0; k < n; k++) { const cible = sens < 0 ? bas : haut; while (sens < 0 ? p > cible : p < cible) { const q = p + sens * pas; push(p, q); p = q; } sens = -sens; }
  return B;
}
const B = oscille(9);
const R = trouverReactions(B);
v(R.length >= 6 && R.some(r => r.sens === 'support' && Math.abs(r.prix - 99.8) < 0.5) && R.some(r => r.sens === 'resistance' && Math.abs(r.prix - 110.2) < 0.5), 'oscillation 100 ↔ 110 : rebonds sur 100 (supports) et rejets sur 110 (résistances)');
v(R.every(r => r.mouvement >= 1), 'chaque réaction est suivie d’un mouvement d’au moins 1 ATR');
const N = niveauxReaction(B, { unite: 'H4' });
v(N.niveaux.length >= 2 && N.niveaux.every(n => n.reactions >= PARAMS_REACTION.minReactions), 'niveaux : au moins 2 réactions chacun');
const bas = N.niveaux.find(n => Math.abs(n.prix - 99.8) < 1), haut = N.niveaux.find(n => Math.abs(n.prix - 110.2) < 1);
v(bas && haut && bas.reactions >= 3 && haut.reactions >= 3, 'les deux niveaux (≈ 100 et ≈ 110) ont 3 réactions ou plus (' + (bas && bas.reactions) + ', ' + (haut && haut.reactions) + ')');
v(N.niveaux.length <= 6 && N.niveaux.every((n, i, L) => i === 0 || L[i - 1].prix - n.prix >= N.atr), 'au plus 6 niveaux, séparés d’au moins 1 ATR, du haut vers le bas');
v(N.niveaux.every(n => n.forceRel > 0 && n.forceRel <= 1) && Math.max(...N.niveaux.map(n => n.forceRel)) === 1, 'force relative 0..1, la plus forte vaut 1');
v(bas.cote === 'support' || bas.cote === 'resistance', 'côté par rapport au prix actuel');
/* un seul rebond ne fait pas un niveau */
const U = oscille(2); const NU = niveauxReaction(U, { unite: 'H4' }); v(!NU.niveaux.some(n => n.reactions < 2), 'un seul rebond : pas de niveau');
v(niveauxReaction(B.slice(0, 30), { unite: 'H4' }).niveaux.length === 0, 'moins de 60 bougies : rien');
/* pas de regard vers l'avenir : sans les dernières bougies, le dernier rebond n'est pas confirmé */
const coupe = B.slice(0, B.length - 3); const Rc = trouverReactions(coupe); v(Rc.length <= R.length && Rc.every(r => r.i < coupe.length - PARAMS_REACTION.pivot), 'le pivot n’est confirmé qu’après 3 bougies : jamais sur les dernières bougies');
/* unités : Daily > H4 > H1 */
const f = u => niveauxReaction(B, { unite: u }).niveaux.reduce((s, n) => s + n.force, 0); v(f('J') > f('H4') && f('H4') > f('H1'), 'poids des unités : Daily > H4 > H1');
/* confluence volume : un HVN et un POC nu sur le niveau ≈ 100 ajoutent de la force */
const NC = niveauxReaction(B, { unite: 'H4', volume: { hvn: [99.9], nus: [99.85], empiles: [{ prixBas: 99.5, prixHaut: 100.5 }], absorptions: [99.8] } }), bC = NC.niveaux.find(n => Math.abs(n.prix - 99.8) < 1);
v(bC && bC.sources.length === 4 && bC.force > bas.force + 3, 'confluence : HVN, POC nu, déséquilibres empilés, absorption (4 sources, +0,8 chacune)');
v(niveauProche(N.niveaux, 100, N.atr, 0.5) && niveauProche(N.niveaux, 105, N.atr, 0.5) === null && niveauProche([], 100, 1) === null, 'niveau proche d’un prix (à 0,5 ATR près)');
v(/^Réaction ×\d+ · 100 · Daily$/.test(etiquetteNiveau({ reactions: 4, prix: 100.2, unite: 'J' })) && /Réaction ×4 · 3 612 · Daily/.test(etiquetteNiveau({ reactions: 4, prix: 3612, unite: 'J' }, x => Math.round(x).toLocaleString('fr-FR').replace(/\s/g, ' '))), 'étiquette « Réaction ×4 · 3 612 · Daily »');
v(/Niveaux de réaction de l’or/.test(phraseNiveaux(N.niveaux, 'l’or', 105)) && /Je ne trouve pas/.test(phraseNiveaux([], 'l’or', 105)), 'phrase parlée, avec et sans niveau');
/* marché sans oscillation : aucun pivot, aucun niveau inventé */
const P = Array.from({ length: 300 }, (_, i) => ({ t: T0 + i * H, o: 100, h: 100.2, l: 99.8, c: 100, v: 1 }));
v(niveauxReaction(P, { unite: 'H1' }).niveaux.length === 0, 'marché plat : aucun niveau inventé');
/* flèches : les niveaux de réaction n'existent qu'à partir de leur 2e réaction confirmée ; sans eux, le comportement de la v4 est inchangé */
v(NC.niveaux.every(n => Number.isFinite(n.actifDepuis) && n.actifDepuis > B[0].t && n.actifDepuis < B[B.length - 1].t), 'chaque niveau porte l’instant où il existe (2e réaction confirmée)');
const F0 = flechesVolume(B, { unite: 'H4' }), F1 = flechesVolume(B, { unite: 'H4', niveauxReac: N.niveaux }), F2 = flechesVolume(B, { unite: 'H4', niveauxReac: N.niveaux.map(n => ({ ...n, actifDepuis: B[B.length - 1].t + 1 })) });
v(Array.isArray(F1) && F2.length === F0.length && F2.every((f, i) => f.libelle === F0[i].libelle), 'niveaux pas encore actifs : flèches identiques à la v4 (aucun regard vers l’avenir)');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
