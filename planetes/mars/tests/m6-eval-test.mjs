// M6 partie 5 : simulation de réussite de l'évaluation, vérifiée sur des cas connus (marche aléatoire calculée par programmation dynamique, séries déterministes).
// Lancer :  node planetes/mars/tests/m6-eval-test.mjs
import { simulerEvaluation, rejouerHistorique, HYPOTHESES } from '../pc/agent-m6/simulation-eval.js';
import { wilson, bootstrapMoyenne, resumeR, alea, qualiteEchantillon, pct, fR } from '../pc/agent-m6/stats-m6.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const proche = (a, b, e) => Math.abs(a - b) <= e;

// ── statistiques de base ──
{
  const w = wilson(50, 100); v('Wilson 50/100 ≈ [40,4 % ; 59,6 %]', proche(w.bas, 0.4038, 0.002) && proche(w.haut, 0.5962, 0.002) && w.p === 0.5);
  const w0 = wilson(0, 10); v('Wilson 0/10 : borne haute ≈ 27,8 %, borne basse 0', w0.bas === 0 && proche(w0.haut, 0.2775, 0.003));
  v('Wilson sans cas : tout nul', wilson(0, 0).n === 0 && wilson(0, 0).p === null);
  const b1 = bootstrapMoyenne([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), b2 = bootstrapMoyenne([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  v('bootstrap : graine fixe → même résultat ; la moyenne est dans son intervalle', b1.bas === b2.bas && b1.haut === b2.haut && b1.bas < 5.5 && b1.haut > 5.5);
  const r = resumeR([2, -1, -1, 2, -1, 2, -1, -1, 2, -1]); v('résumé de R : n, réussite, espérance, facteur de profit', r.n === 10 && r.gagnants === 4 && proche(r.esperance, 0.2, 1e-9) && proche(r.facteurProfit, 8 / 6, 1e-9) && r.taux.n === 10);
  v('qualité d’échantillon en mots', qualiteEchantillon(5) === 'très insuffisant' && qualiteEchantillon(20) === 'insuffisant' && qualiteEchantillon(80) === 'modeste' && qualiteEchantillon(200) === 'correct' && qualiteEchantillon(1000) === 'solide');
  v('formats français', pct(0.456, 0) === '46 %' && fR(1.5) === '+1,50 R' && fR(-0.25) === '−0,25 R' && pct(null) === '—');
}
// ── cas déterministes ──
{
  const gagnant = Array(30).fill(1), r = simulerEvaluation({ R: gagnant, tradesParSemaine: 3, risquesPct: [1], gain: 322, regles: {}, nExt: 10, nInt: 100 });
  v('toujours +1 R à 1 % de risque : l’objectif est atteint dans ≈ 100 % des scénarios', r.ok && r.niveaux[0].pObjectif.moy > 0.97 && r.niveaux[0].pDrawdown.moy === 0 && r.niveaux[0].pJour.moy === 0, JSON.stringify(r.niveaux[0].pObjectif));
  const perdant = Array(30).fill(-1), q = simulerEvaluation({ R: perdant, tradesParSemaine: 3, risquesPct: [1], gain: 322, regles: {}, nExt: 10, nInt: 100 });
  v('toujours −1 R : aucune chance d’atteindre l’objectif, une limite se touche', q.niveaux[0].pObjectif.moy === 0 && q.niveaux[0].pDrawdown.moy + q.niveaux[0].pJour.moy > 0.95, JSON.stringify([q.niveaux[0].pDrawdown, q.niveaux[0].pJour]));
  v('espérance négative : aucune plage de risque raisonnable, dit clairement', q.plage === null && /Aucun niveau de risque/.test(q.phrases.join(' ')));
  const peu = simulerEvaluation({ R: [1, -1, 1], tradesParSemaine: 3 }); v('moins de 8 trades : refus explicite', !peu.ok && /au moins 8/.test(peu.erreur));
  // trop de risque : 3 % par trade avec des pertes → la perte du jour (3 %) tombe dès la première perte
  const demi = Array.from({ length: 40 }, (_, i) => (i % 2 ? -1 : 1)), g = simulerEvaluation({ R: demi, tradesParSemaine: 7, risquesPct: [3], gain: 0, regles: {}, nExt: 10, nInt: 100 });
  v('3 % de risque par trade : une seule perte touche la limite du jour', g.niveaux[0].pJour.moy > 0.3, JSON.stringify(g.niveaux[0].pJour));
}
// ── marche aléatoire équilibrée : comparaison avec la programmation dynamique exacte ──
{
  // Gain visé : 678 $ restants, arrondi à 7 pas de 100 $ (risque 1 %) ; drawdown suiveur de 6 pas ; perte du jour désactivée (50 %).
  const cible = 7, dd = 6;
  const cle = (c, m) => c + ',' + m, memo = new Map();
  function P(c, m) {                                   // probabilité d'atteindre +7 avant de tomber à 6 pas sous le maximum atteint
    if (c >= cible) return 1; if (m - c >= dd) return 0; const k = cle(c, m); if (memo.has(k)) return memo.get(k);
    // pas de borne basse naturelle : on tronque à profondeur 60 (la probabilité d'y revenir est négligeable)
    memo.set(k, 0.5); let a = 0.5; for (let it = 0; it < 400; it++) { const h = P1(c + 1, Math.max(m, c + 1)), b = P1(c - 1, m); a = 0.5 * h + 0.5 * b; break; } return a;
  }
  // La marche est absorbée dans un domaine fini (c ∈ [m−5, 6]) : résolution exacte par itération sur la grille.
  const etats = []; for (let m = 0; m <= cible - 1; m++) for (let c = m - (dd - 1); c <= m; c++) etats.push([c, m]);
  const val = new Map(); for (const [c, m] of etats) val.set(c + ',' + m, 0.5);
  const lire = (c, m) => (c >= cible ? 1 : (m - c >= dd ? 0 : val.get(c + ',' + m)));
  for (let it = 0; it < 4000; it++) for (const [c, m] of etats) val.set(c + ',' + m, 0.5 * lire(c + 1, Math.max(m, c + 1)) + 0.5 * lire(c - 1, m));
  const exact = val.get('0,0');
  function P1() { return 0; }
  const flips = Array.from({ length: 6000 }, (_, i) => (i % 2 ? -1 : 1));      // grand échantillon : l'incertitude d'échantillon (très forte avec 400 trades : fourchette 25 % à 59 %) ne brouille pas la comparaison
  const r = simulerEvaluation({ R: flips, tradesParSemaine: 7, risquesPct: [1], gain: 322, regles: { perteJourPct: 50 }, horizonJours: 3650, nExt: 40, nInt: 200, graine: 7 });
  const niv = r.niveaux[0];
  v('pièce équilibrée : P(objectif) simulée proche de la valeur exacte (' + exact.toFixed(3) + ')', proche(niv.pObjectif.moy, exact, 0.03), niv.pObjectif.moy + ' vs ' + exact);
  v('pièce équilibrée : objectif + drawdown + jour + délai = 100 %', proche(niv.pObjectif.moy + niv.pDrawdown.moy + niv.pJour.moy + niv.pDelai.moy, 1, 1e-9));
  v('la fourchette contient la probabilité moyenne', niv.pObjectif.bas <= niv.pObjectif.moy && niv.pObjectif.moy <= niv.pObjectif.haut && niv.pObjectif.haut - niv.pObjectif.bas > 0);
  v('exact ≈ 2/(1+...)? valeur plausible entre 0,3 et 0,6', exact > 0.3 && exact < 0.6, exact);
  v('graine fixe : exactement le même rapport', JSON.stringify(simulerEvaluation({ R: flips, tradesParSemaine: 7, risquesPct: [1], gain: 322, regles: { perteJourPct: 50 }, horizonJours: 3650, nExt: 6, nInt: 40, graine: 7 })) === JSON.stringify(simulerEvaluation({ R: flips, tradesParSemaine: 7, risquesPct: [1], gain: 322, regles: { perteJourPct: 50 }, horizonJours: 3650, nExt: 6, nInt: 40, graine: 7 })));
}
// ── stratégie avec un avantage réel : plage de risque raisonnable, garde-fou ──
{
  const a = alea(5), R = Array.from({ length: 200 }, () => { const x = a(); return x < 0.4 ? 2.4 : -1; });            // 40 % de gagnants à 2,4 R : espérance +0,36 R
  const r = simulerEvaluation({ R, tradesParSemaine: 4, gain: 322, regles: {}, nExt: 20, nInt: 150, graine: 3, trades: R.map((x, i) => ({ R: x, tSortie: Date.UTC(2025, 0, 1) + i * 2 * 86400e3 })) });
  v('stratégie à avantage réel : espérance positive, plage de risque proposée', r.ok && r.esperance > 0.2 && r.plage && r.plage.de >= 0.25 && r.plage.a <= 2, JSON.stringify(r.plage));
  const p05 = r.niveaux.find(x => x.risquePct === 0.5), p2 = r.niveaux.find(x => x.risquePct === 2);
  v('à 2 % de risque, les limites se touchent plus souvent qu’à 0,5 %', p2.pDrawdown.moy + p2.pJour.moy > p05.pDrawdown.moy + p05.pJour.moy, JSON.stringify([p2.pDrawdown.moy + p2.pJour.moy, p05.pDrawdown.moy + p05.pJour.moy]));
  v('le garde-fou (arrêt du jour à 80 %) ne fait pas pire sur la perte du jour', p2.avecGarde.pJour.moy <= p2.pJour.moy + 0.02, JSON.stringify([p2.avecGarde.pJour.moy, p2.pJour.moy]));
  v('rapport : phrases avec fourchette, plage, échantillon et avertissement', r.phrases.length >= 4 && /fourchette/.test(r.phrases.join(' ')) && /Plage de risque raisonnable/.test(r.phrases.join(' ')) && /pas un conseil financier/.test(r.phrases.join(' ')) && /précision dépend de la taille de l’échantillon/.test(r.phrases.join(' ')));
  v('hypothèses listées (indépendance, risque fixe, clôture…)', HYPOTHESES.length >= 4 && r.hypotheses.some(h => /indépendants/.test(h)));
  v('historique rejoué présent, avec avertissement sur le chevauchement', r.historique && r.historique.departs === 200 && /se chevauchent/.test(r.historique.note));
  const faible = simulerEvaluation({ R: R.slice(0, 20), tradesParSemaine: 4, gain: 322, regles: {}, nExt: 6, nInt: 40 }); v('petit échantillon (20 trades) : avertissement explicite', /(ici 20 trades : peu)/.test(faible.phrases.join(' ')) && faible.echantillon === 'insuffisant');
}
// ── rejeu de l'histoire réelle ──
{
  const J = 86400e3, T = Date.UTC(2025, 0, 1), liste = Array.from({ length: 40 }, (_, i) => ({ R: 1, tSortie: T + i * J }));
  const h = rejouerHistorique({ trades: liste, risquePct: 1, regles: {}, gain: 322 });
  v('histoire +1 R par jour, risque 1 % (100 $) : 7 trades pour passer de +322 à +1 000 → tous les départs avec ≥ 7 trades après', h.objectif === 34 && h.incomplet === 6 && h.departs === 40 && h.complets === 34, JSON.stringify(h));
  const sem = rejouerHistorique({ trades: Array.from({ length: 40 }, (_, i) => ({ R: -1, tSortie: T + i * J })), risquePct: 1, regles: {}, gain: 322 });
  v('histoire de pertes : le drawdown suiveur est touché au 6e trade', sem.drawdown > 0 && sem.objectif === 0, JSON.stringify(sem));
  const jour = rejouerHistorique({ trades: [{ R: -1, tSortie: T }, { R: -1, tSortie: T + 1000 }, { R: -1, tSortie: T + 2000 }, { R: 1, tSortie: T + J }], risquePct: 1, regles: {}, gain: 322 });
  v('3 pertes de 1 % le même jour : la perte du jour (3 %) est touchée', jour.jour === 1, JSON.stringify(jour));
  const delai = rejouerHistorique({ trades: [{ R: 0.01, tSortie: T }, { R: 0.01, tSortie: T + 200 * J }], risquePct: 1, regles: {}, gain: 322, horizonJours: 90 }); v('trop lent : délai dépassé', delai.delai >= 1);
}
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
