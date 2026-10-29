import { alea } from '../planetes/mars/pc/mars-calcul.js';
import { evaluerNiveau, CRITERES4 } from './criteres-v4.js';
import { nombreEffectif, rendementsJournaliers } from './essais-effectifs.js';

/* ═════════════ TEST DU RISQUE DE FAUSSES VALIDATIONS (V7, phase 2 ; module pur, testé : galaxie/tests/faux-positifs-test.mjs) ═════════════
   Question : si on teste beaucoup de stratégies SANS AUCUN avantage réel (rendements purement aléatoires, espérance nette exactement nulle), à quelle fréquence la meilleure est-elle déclarée « Validée » ?
   Le test est volontairement SÉVÈRE : on prend la meilleure des K variantes sur les MÊMES trades qui servent ensuite à la juger (c’est le biais de sélection que la correction doit absorber), et on ne vérifie que la
   partie STATISTIQUE du niveau Validée (espérance ≥ +0,12 R, ≥ 150 trades, borne basse du bootstrap > 0, Sharpe déflaté ≥ 95 % avec le nombre effectif d’essais) : les autres garde-fous (walk-forward, jeu final,
   Auditeur…) ne font qu’ajouter de la prudence. Limite annoncée : 5 %. Si elle est dépassée, `nombreEffectifPrudent` durcit le calcul (le N retenu se rapproche du nombre total de variantes).
   Deux scénarios : A) K variantes INDÉPENDANTES ; B) K variantes réparties en amas fortement corrélés (le nombre effectif est alors ESTIMÉ par `nombreEffectif`, comme dans la vraie recherche). */
export const LIMITE_FAUX_POSITIFS = 0.05;
const JOUR = 86400e3;

/* Un résultat de trade aléatoire d’espérance nulle : gain de +2 R avec la probabilité 1/3, sinon −1 R. */
const tirerR = a => (a() < 1 / 3 ? 2 : -1);

/* N effectif PRUDENT : on ne descend jamais sous `plancherPart` du nombre total de variantes (ou sous `plancherAbs`). Plus le plancher monte, plus la correction est dure. */
export function nombreEffectifPrudent(nEff, nTotal, { plancherPart = 0, plancherAbs = 1 } = {}) {
  return Math.max(1, Math.min(nTotal, Math.max(nEff, Math.ceil(nTotal * plancherPart), plancherAbs)));
}

/* Partie statistique du niveau « Validée » (équilibré) : tout le reste est supposé acquis (hypothèse la plus défavorable). */
function passeValideeStat(R, nVariantes, nEffectif) {
  const e = evaluerNiveau({ R, nVariantes, nEffectif, walkForwardPositif: true, ddPct: 0, pireJourPct: 0, rapportAuditeur: true, auditeur: { fait: true, ok: true }, esperanceFraisDoubles: 1,
    periodes: [{ n: 100, esperance: 1 }, { n: 100, esperance: 1 }] }, { version: 'equilibre' });
  return e.niveau === 'validee';
}

/* Scénario A : K variantes indépendantes de `n` trades chacune ; la meilleure (moyenne) est jugée avec N = K. */
export function scenarioIndependant({ simulations = 1000, K = 100, n = 200, graine = 20261029, plancher = {} } = {}) {
  const a = alea(graine); let faux = 0;
  for (let s = 0; s < simulations; s++) {
    let meilleur = null, mm = -Infinity;
    for (let k = 0; k < K; k++) { const R = new Array(n); let somme = 0; for (let i = 0; i < n; i++) { R[i] = tirerR(a); somme += R[i]; } if (somme > mm) { mm = somme; meilleur = R; } }
    if (passeValideeStat(meilleur, K, nombreEffectifPrudent(K, K, plancher))) faux++;
  }
  return { scenario: 'A : variantes indépendantes', simulations, K, n, fauxPositifs: faux, taux: faux / simulations };
}

/* Scénario B : K variantes en `amas` groupes ; dans un groupe 90 % des jours sont communs. N effectif ESTIMÉ par corrélation des rendements journaliers (comme en vrai). */
export function scenarioAmas({ simulations = 300, K = 120, amas = 12, jours = 250, partCommune = 0.9, graine = 20261030, plancher = {} } = {}) {
  const a = alea(graine); let faux = 0, nEffMoy = 0;
  for (let s = 0; s < simulations; s++) {
    const base = Array.from({ length: amas }, () => Float64Array.from({ length: jours }, () => (a() < 0.8 ? tirerR(a) : 0)));       // 80 % des jours ont un trade
    const series = []; let meilleur = null, mm = -Infinity;
    for (let k = 0; k < K; k++) {
      const b = base[k % amas], j = new Float64Array(jours); let somme = 0, n = 0;
      for (let d = 0; d < jours; d++) { j[d] = a() < partCommune ? b[d] : (a() < 0.8 ? tirerR(a) : 0); if (j[d] !== 0) n++; somme += j[d]; }
      series.push(j); if (somme > mm) { mm = somme; meilleur = j; }
    }
    const ne = nombreEffectif(series), R = Array.from(meilleur).filter(x => x !== 0), N = nombreEffectifPrudent(ne.nEff, K, plancher); nEffMoy += ne.nEff;
    if (passeValideeStat(R, K, N)) faux++;
  }
  return { scenario: 'B : amas de variantes corrélées', simulations, K, amas, jours, fauxPositifs: faux, taux: faux / simulations, nEffectifMoyen: nEffMoy / simulations };
}

/* Mesure les deux scénarios ; si l’un dépasse la limite, durcit automatiquement (plancher de N effectif en part du total) jusqu’à rentrer sous la limite. Rend { resultats, plancherRetenu, durci }. */
export function mesurerEtDurcir({ simulationsA = 1000, simulationsB = 300, limite = LIMITE_FAUX_POSITIFS, parametresA = {}, parametresB = {} } = {}) {
  const essais = [];
  for (const plancherPart of [0, 0.1, 0.25, 0.5, 1]) {
    const A = scenarioIndependant({ simulations: simulationsA, ...parametresA, plancher: { plancherPart } }), B = scenarioAmas({ simulations: simulationsB, ...parametresB, plancher: { plancherPart } });
    essais.push({ plancherPart, A, B, ok: A.taux <= limite && B.taux <= limite });
    if (A.taux <= limite && B.taux <= limite) break;
  }
  const retenu = essais[essais.length - 1];
  return { limite, essais, plancherRetenu: retenu.plancherPart, durci: retenu.plancherPart > 0, ok: retenu.ok };
}
export { CRITERES4, rendementsJournaliers, JOUR };
