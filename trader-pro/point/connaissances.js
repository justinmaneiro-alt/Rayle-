/* Choix des connaissances à charger selon la question : score = nombre de mots-clés présents ; au plus `max` fichiers. Le texte dit « tendance générale, pas une règle » : l'IA ne doit jamais le présenter comme une règle. */
import { CONNAISSANCES } from './connaissances-data.js';
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function choisirConnaissances(question, { max = 2, ids = null } = {}) {
  if (ids) return CONNAISSANCES.filter(c => ids.includes(c.id));
  const q = norm(question), L = CONNAISSANCES.map(c => ({ c, s: c.mots.reduce((n, m) => n + (q.includes(norm(m)) ? 1 : 0), 0) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  return L.slice(0, max).map(x => x.c);
}
export const texteConnaissances = L => L.map(c => c.texte).join('\n\n');
export { CONNAISSANCES };
