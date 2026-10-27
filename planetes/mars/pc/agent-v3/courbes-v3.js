/* ═════════════ COURBES DE CAPITAL ET POSITIONS DU GRAPHIQUE (module pur, testé : galaxie/tests/agent-page-test.mjs) ═════════════
   DEUX courbes SÉPARÉES et étiquetées : (a) le compte SIMULÉ en direct (les trades que l'agent « fait » sans argent) ; (b) le BACKTEST hors échantillon (le passé rejoué, paramètres choisis sans voir
   le futur). On ne les additionne jamais. Les positions DÉMO (pour vérifier l'affichage) sont toujours marquées « DÉMO » et n'existent que si l'utilisateur les demande. */
export function reduire(points, max = 240) {
  if (points.length <= max) return points.slice();
  const pas = (points.length - 1) / (max - 1), out = []; for (let i = 0; i < max; i++) out.push(points[Math.round(i * pas)]); return out;
}
/* Courbe de capital du compte simulé : trades { tSortie, R } → [{ t, capital, R }] (capital de départ, risque fixe par trade). */
export function courbeSimulee(trades, { capital = 10000, risquePct = 1 } = {}) {
  const l = trades.slice().sort((a, b) => a.tSortie - b.tSortie); let c = capital, somme = 0; const out = l.length ? [{ t: l[0].t, capital, R: 0 }] : [];
  for (const x of l) { c *= 1 + risquePct / 100 * x.R; somme += x.R; out.push({ t: x.tSortie, capital: c, R: somme }); }
  return out;
}
/* Courbe du backtest hors échantillon à partir de la courbe en R cumulés gardée dans le résumé du backtest : [{ i, R }] (pas de dates : les trades sont mis bout à bout). */
export function courbeBacktest(courbeR, { capital = 10000, risquePct = 1 } = {}) {
  if (!Array.isArray(courbeR) || courbeR.length < 2) return [];
  return reduire(courbeR.map((R, i) => ({ i, R, capital: capital * (1 + risquePct / 100 * R) })), 240);
}
/* Positions à afficher : ouverte / en attente / clôturées récentes, filtrables par stratégie et par version. */
export function positionsGraphique(suivi, etat, { strategie = null, version = null, max = 40 } = {}) {
  const out = [];
  for (const [id, s] of Object.entries(suivi || {})) {
    if (!s || (strategie && id !== strategie)) continue; const strat = (etat.strategies || {})[id], nom = strat ? strat.nom + ' · ' + strat.paire : id;
    if (s.position) out.push({ statut: 'en cours', id, nom, sens: s.position.s, entree: s.position.fill, stop: s.position.stop, cible: s.position.cible, R: s.position.R, t: s.position.t, raison: s.position.raison || [], tailles: s.position.tailles || null });
    if (s.pendante) out.push({ statut: 'en préparation', id, nom, sens: s.pendante.sens, entree: null, stop: s.pendante.stop, cible: null, R: s.pendante.R, t: s.pendante.signalT + 900e3, raison: s.pendante.raison || [] });
    for (const x of (s.trades || []).slice(-max)) { if (version != null && x.version != null && x.version !== version) continue; out.push({ statut: x.R >= 0 ? 'clôturée (gain)' : 'clôturée (perte)', id, nom, sens: x.sens, entree: x.prixEntree, stop: x.stop, cible: x.cible, sortie: x.prixSortie, R: x.R, t: x.t, tSortie: x.tSortie, motif: x.motif }); }
  }
  return out.sort((a, b) => a.t - b.t);
}
/* Positions DÉMO (marquées DÉMO) pour vérifier l'affichage sans attendre un vrai setup : à partir d'un prix et d'un instant donnés. */
export function positionsDemo(prix, t, pas = 900e3) {
  const d = prix * 0.012;
  return [
    { demo: true, statut: 'en cours', id: 'DEMO', nom: 'DÉMO · achat', sens: 1, entree: prix, stop: prix - d, cible: prix + 3 * d, R: 3, t: t - 4 * pas, raison: ['DÉMO : exemple d’achat, entrée, stop et objectif à 3 R.', 'Cette position n’existe pas.'] },
    { demo: true, statut: 'clôturée (gain)', id: 'DEMO', nom: 'DÉMO · vente gagnante', sens: -1, entree: prix + 2 * d, stop: prix + 3 * d, cible: prix - d, sortie: prix - d, R: 3, t: t - 60 * pas, tSortie: t - 40 * pas, motif: 'cible' },
    { demo: true, statut: 'clôturée (perte)', id: 'DEMO', nom: 'DÉMO · achat perdant', sens: 1, entree: prix - d, stop: prix - 2 * d, cible: prix + 2 * d, sortie: prix - 2 * d, R: -1, t: t - 120 * pas, tSortie: t - 100 * pas, motif: 'stop' }
  ];
}
/* Couleur et libellé d'une position (le graphique ne dépend d'aucune couleur codée ailleurs). */
export const COULEURS_POSITION = Object.freeze({ achat: 'rgba(39,217,138,.9)', vente: 'rgba(255,77,94,.9)', stop: 'rgba(255,77,94,.85)', cible: 'rgba(39,217,138,.85)', entree: 'rgba(143,208,227,.95)', demo: 'rgba(201,178,122,.9)' });
export function libellePosition(p) {
  const sens = p.sens > 0 ? 'ACHAT' : 'VENTE', rr = p.R != null ? ' · 1 pour ' + p.R.toFixed(1).replace('.', ',') : '';
  return (p.demo ? 'DÉMO · ' : '') + sens + ' ' + p.statut + rr;
}
