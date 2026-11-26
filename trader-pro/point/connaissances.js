/* Choix des connaissances à charger selon la question : score = nombre de mots-clés présents ; au plus `max` fichiers. Le texte dit « tendance générale, pas une règle » : l'IA ne doit jamais le présenter comme une règle. */
import { CONNAISSANCES } from './connaissances-data.js';
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function choisirConnaissances(question, { max = 2, ids = null } = {}) {
  if (ids) return CONNAISSANCES.filter(c => ids.includes(c.id));
  const q = norm(question), L = CONNAISSANCES.map(c => ({ c, s: c.mots.reduce((n, m) => n + (q.includes(norm(m)) ? 1 : 0), 0) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  return L.slice(0, max).map(x => x.c);
}
/* La question touche-t-elle l'ICT ? (mots de 06-ict.md et des questions de lecture, ou mode ICT affiché) */
export const MOTS_ICT = /\b(ict|fvg|fair value|order ?blocks?|breakers?|unicorn|mss|bos|choch|eqh|eql|equal (high|low)s?|sommets? egaux|creux egaux|bsl|ssl|sweeps?|turtle soup|premium|discount|ote|killzones?|silver bullet|power of 3|amd|judas|smt|ith|itl|sth|stl|ifvg|dealing range|pd arrays?|top[ -]?down|liquidites?|balayages?|deplacements?|biais du jour|pdh|pdl|pwh|pwl)\b/;
export const toucheIct = (question, modeIct = false) => !!modeIct || MOTS_ICT.test(norm(question).replace(/[’'`]/g, ' ').replace(/\s+/g, ' '));
/* connaissances à joindre à une question : celles que les mots désignent ; quand elle touche l'ICT, TOUJOURS les deux fichiers ict et ict-unites (le routage par mots seul peut en perdre un : le mot-clé « w » du fichier structure attrape « lows »), puis les autres */
export function connaissancesPour(question, { modeIct = false, max = 2 } = {}) {
  const L = choisirConnaissances(question, { max }); if (!toucheIct(question, modeIct)) return L;
  const I = choisirConnaissances('', { ids: ['ict', 'ict-unites'] }); return [...I, ...L.filter(c => !I.some(i => i.id === c.id))];
}
export const texteConnaissances = L => L.map(c => c.texte).join('\n\n');
export { CONNAISSANCES };
