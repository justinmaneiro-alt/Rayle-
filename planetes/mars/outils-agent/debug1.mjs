import { construireContexte } from '../pc/agent-btc/contexte.js';
import { FAMILLES, combinaisons } from '../pc/agent-btc/hypotheses.js';
import { decouper, evaluerVariante, walkForward, monteCarlo } from '../pc/agent-btc/evaluation.js';
import { marcheMixte } from '../tests/synth-btc.mjs';
const S = marcheMixte(105000, 3), d = decouper(S), ctx = construireContexte(S);
const lignes = combinaisons(FAMILLES.cassure_range.grille(0)).slice(0, 60).map(p => evaluerVariante(ctx, 'cassure_range', p, {}, { de: 0, a: d.finA }));
console.log(lignes.map(l => l.stats.n).join(' '));
const wf = walkForward(lignes, d, {}); console.log(wf.stats.n, wf.blocs.map(b => [b.params && JSON.stringify(b.params), b.test.n]));
console.log(monteCarlo(wf.trades));
