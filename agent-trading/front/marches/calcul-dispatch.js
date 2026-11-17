/* Répartiteur de calculs (utilisé par le Worker et, en secours, par le fil principal). Modules purs : stats-marches, couverture-calcul, performances-calcul. */
import { analyseActif } from './stats-marches.js';
export async function repondre(m) {
  if (m.type === 'analyse') return analyseActif(m.series || {});   // rapide : affiché tout de suite
  if (m.type === 'matrice') { const C = await import('./couverture-calcul.js'); return C.matrice(m.series || {}, m.fenetres || [30, 90, 250]); }
  if (m.type === 'couverture') { const C = await import('./couverture-calcul.js'); return C.evaluerCouvertures(m.params || {}); }
  if (m.type === 'portefeuille') { const C = await import('./couverture-calcul.js'); return C.exposition(m.positions || [], m.facteurs || {}); }
  if (m.type === 'journal') { const J = await import('./journal-calcul.js'); return J.statistiques(m.trades || [], m.params || {}); }
  if (m.type === 'performances') { const P = await import('./performances-calcul.js'); return P.analyse(m.serie || [], m.params || {}); }
  throw new Error('calcul inconnu : ' + m.type);
}
