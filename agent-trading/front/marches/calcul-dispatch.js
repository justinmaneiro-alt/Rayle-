/* Répartiteur de calculs (utilisé par le Worker et, en secours, par le fil principal). Modules purs : stats-marches, couverture-calcul, performances-calcul. */
import { analyseActif } from './stats-marches.js';
export async function repondre(m) {
  if (m.type === 'analyse') return analyseActif(m.series || {});   // rapide : affiché tout de suite
  if (m.type === 'fleches') {
    const r = {}; let fleches = [];
    try {
      const F8 = await import('../or/fleches-simples-v8.js'), Z = await import('../or/zones-direct.js'), H1 = (m.series && m.series.H1) || [];
      if (H1.length > 300) { const res = F8.calculer(H1, Z.zonesDirect, { maintenant: m.maintenant || Date.now(), bougies: 720, exception: true }); fleches = (res.fleches || []).filter(f => f.type !== 'ma_cassure').map(f => ({ t: f.tCloture || f.t, dir: f.dir, type: f.type, prix: f.prix })); r.flechesNote = 'flèches v8 en lecture seule : les règles ne sont pas modifiées'; }
      else r.flechesNote = 'pas assez de bougies H1 pour les flèches';
    } catch (e) { r.flechesNote = 'flèches indisponibles : ' + String(e.message || e).slice(0, 80); }
    return { ...r, fleches };
  }
  if (m.type === 'matrice') { const C = await import('./couverture-calcul.js'); return C.matrice(m.series || {}, m.fenetres || [30, 90, 250]); }
  if (m.type === 'couverture') { const C = await import('./couverture-calcul.js'); return C.evaluerCouvertures(m.params || {}); }
  if (m.type === 'portefeuille') { const C = await import('./couverture-calcul.js'); return C.exposition(m.positions || [], m.facteurs || {}); }
  if (m.type === 'journal') { const J = await import('./journal-calcul.js'); return J.statistiques(m.trades || [], m.params || {}); }
  if (m.type === 'performances') { const P = await import('./performances-calcul.js'); return P.analyse(m.serie || [], m.params || {}); }
  throw new Error('calcul inconnu : ' + m.type);
}
