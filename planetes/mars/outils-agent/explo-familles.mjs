import { historiqueReel } from '../tests/aide-btc.mjs';
import { construireContexte } from '../pc/agent-btc/contexte.js';
import { FAMILLES, ORDRE_FAMILLES, combinaisons, cleParams } from '../pc/agent-btc/hypotheses.js';
import { decouper, evaluerVariante, walkForward, score, statsSur } from '../pc/agent-btc/evaluation.js';
const { serie } = await historiqueReel({ annees: 4 });
let t = Date.now(); const ctx = construireContexte(serie); console.log('contexte', Date.now() - t, 'ms');
const dec = decouper(serie); console.log('zone A mois', dec.moisZoneA.toFixed(1), 'jeu final mois', dec.moisFinal.toFixed(1), 'folds', dec.folds.length, dec.folds.map(f => f.train[1] + '|' + f.test[0] + '-' + f.test[1]).join(' '));
const cfg = {};
for (const f of ORDRE_FAMILLES) {
  const grille = combinaisons(FAMILLES[f].grille(0)); t = Date.now(); const lignes = [];
  for (const p of grille) { const e = evaluerVariante(ctx, f, p, cfg, { de: 0, a: dec.finA }); lignes.push(e); }
  const ms = Date.now() - t;
  const A = lignes.map(l => ({ ...l, sc: score(l.stats, 30) })).sort((a, b) => b.sc - a.sc);
  const pos = lignes.filter(l => l.stats.n >= 30 && l.stats.esperance > 0).length;
  console.log(`\n${f}: ${grille.length} variantes en ${ms} ms (${(ms / grille.length).toFixed(0)} ms/variante) ; n≥30 & E>0 : ${pos}`);
  for (const l of A.slice(0, 3)) console.log('  ', cleParams(l.params), 'n', l.stats.n, 'E', l.stats.esperance && l.stats.esperance.toFixed(3), 'PF', l.stats.factProfit && l.stats.factProfit.toFixed(2), 'WR', Math.round(l.stats.tauxReussite * 100) + '%', 'DD', l.stats.ddR.toFixed(1), '/sem', l.stats.parSemaine && l.stats.parSemaine.toFixed(2));
  const wf = walkForward(lignes, dec, cfg);
  console.log('   walk-forward OOS : n', wf.stats.n, 'E', wf.stats.esperance && wf.stats.esperance.toFixed(3), 'PF', wf.stats.factProfit && wf.stats.factProfit.toFixed(2), 'DD', wf.stats.ddR.toFixed(1), 'blocs', wf.blocs.map(b => b.test.n + '/' + (b.test.esperance == null ? '—' : b.test.esperance.toFixed(2))).join(' '));
}
