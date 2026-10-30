import { parcourir, ETIQUETTE_RETRO } from './serie.js';
import { simuler, COUTS_TRADER, GESTIONS } from './suivi.js';
import { bilanTrader, statsR, hasardMemeFrequence } from './bilan.js';
import { preparer, SETUPS } from './moteur.js';

/* ═════════════ RÉTRO-TEST HONNÊTE ET COMPARAISON DE GESTION (V12, phase 3 ; module pur, testé : galaxie/tests/trader-niveaux-test.mjs) ═════════════
   Le rétro-test rejoue le moteur SANS le modifier sur les `mois` derniers mois de chaque actif (règles fixées à l'avance). Son résultat porte l'étiquette « rétro-test à titre d'exemple — pas une preuve » :
   il ne promeut jamais un type. Quand une règle est AJUSTÉE, on sépare la période d'étude (où l'on a le droit de regarder) de la période jamais vue (où l'on mesure) ; la comparaison de gestion garde
   la meilleure sortie SEULEMENT si elle tient aussi sur la période jamais vue. */
export const MOIS_M15 = 2920;            // ≈ 30,4 jours de bougies M15

export function retroTest(m15, { actif, mois = 12, style = 'equilibre', couts = COUTS_TRADER, gestion = 'partielle', P = null } = {}) {
  const fin = m15.n - 1, de = Math.max(1, fin - mois * MOIS_M15), prep = P || preparer(m15);
  const props = parcourir(m15, { actif, style, de, a: fin, couts, gestion, P: prep }); for (const p of props) p.source = 'retro';
  const bilan = bilanTrader(props, { m15ParActif: { [actif]: m15 }, couts });
  return { etiquette: ETIQUETTE_RETRO, actif, mois, style, de: m15.t[de], a: m15.t[fin], propositions: props, bilan };
}

/* Mesure l'effet de différentes sorties sur les MÊMES entrées. `coupe` : index séparant l'étude (avant) de la période jamais vue (après). */
export function comparerGestion(m15, props, { couts = COUTS_TRADER, coupe = null } = {}) {
  const idx = props.map(p => p.i).sort((a, b) => a - b), c = coupe == null ? idx[Math.floor(idx.length * 0.6)] : coupe, lignes = [];
  for (const g of Object.keys(GESTIONS)) {
    const etude = [], vue = [];
    for (const p of props) { const r = simuler(m15, p, { couts, gestion: g }); if (r.statut !== 'cloturee') continue; (p.i < c ? etude : vue).push(r.R); }
    lignes.push({ gestion: g, texte: GESTIONS[g], etude: statsR(etude), inconnue: statsR(vue) });
  }
  const base = lignes.find(l => l.gestion === 'partielle'), meilleure = lignes.slice().sort((a, b) => (b.etude.esperance ?? -9) - (a.etude.esperance ?? -9))[0];
  const tient = meilleure.gestion !== 'partielle' && meilleure.inconnue.esperance != null && base.inconnue.esperance != null && meilleure.inconnue.esperance > base.inconnue.esperance && meilleure.etude.esperance > base.etude.esperance;
  return { coupe: c, lignes, retenue: tient ? meilleure.gestion : 'partielle', phrase: tient ? 'La sortie « ' + GESTIONS[meilleure.gestion] + ' » fait mieux sur l’étude ET sur la période jamais vue : retenue.' : 'Aucune sortie ne fait mieux que la sortie actuelle à la fois sur l’étude et sur la période jamais vue : on garde « ' + GESTIONS.partielle + ' ».' };
}
export { hasardMemeFrequence, SETUPS };
