/* ═════════════ COHÉRENCE DES POSITIONS (module pur, testé : galaxie/tests/coherence-test.mjs) ═════════════
   Règle : sur un même actif, l'agent ne tient JAMAIS deux positions de sens contraire en même temps (acheteuse et vendeuse, quels que soient le setup et l'unité de temps). Une position opposée tant que la première
   est en attente ou ouverte se paie deux fois : les frais des deux côtés, puis l'une des deux touche son stop. La nouvelle idée est refusée avec sa raison (visible dans « pourquoi pas plus » / le journal) ;
   elle pourra revenir quand la première position sera terminée ou annulée. Ce n'est PAS un filtre de tendance ajouté aux signaux : c'est de la gestion de position, appliquée de la même façon en direct, dans le
   rejoué et dans les backtests (les chiffres mesurés correspondent donc à ce que l'agent fait vraiment). */
export const VIVANTES = Object.freeze(['en_attente', 'ouverte']);

/* Première position vivante de l'actif dont le sens contredit `sens` (+1 / −1), ou null. Les fantômes (positions masquées, jamais proposées) et les démos ne comptent pas. */
export function positionOpposee(positions, { actif, sens }) {
  if (!Array.isArray(positions) || !(sens === 1 || sens === -1)) return null;
  for (const p of positions) { if (!p || p.fantome || p.demo || p.actif !== actif || !VIVANTES.includes(p.statut)) continue; const s = Number(p.sens) < 0 ? -1 : 1; if (s !== sens) return p; }
  return null;
}
/* Phrase française du refus. */
export const raisonConflit = (p, actif) => 'position ' + (Number(p.sens) < 0 ? 'vendeuse' : 'acheteuse') + ' déjà ' + (p.statut === 'ouverte' ? 'ouverte' : 'en attente') + ' sur ' + actif + ' : pas de position de sens contraire en même temps (elle reviendra quand la première sera terminée)';
