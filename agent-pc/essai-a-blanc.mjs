// ESSAI À BLANC : évalue les six familles de la V3 sur les VRAIES bougies d'une ou plusieurs paires, SANS toucher à l'état de l'agent, SANS ouvrir le jeu final et SANS rien envoyer.
//   node agent-pc/essai-a-blanc.mjs [--repo] [--paires BTC,SOL,DOGE] [--familles tendance_ma,fin_range]
// --repo : lit les caches de développement du dépôt (donnees-btc-cache, donnees-sol-cache, donnees-doge-cache) au lieu des données de l'agent.
// Les critères sont ceux de strategies/CRITERES.md (jamais assouplis) ; le jeu final est le dernier quart de l'historique. Un verdict « validée en backtest » ici N'EST PAS une validation de l'agent
// (il faut encore le jeu final, ouvert une seule fois par le service, puis la simulation en direct).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerHistorique } from '../planetes/mars/pc/agent-btc/historique.js';
import { decouper } from '../planetes/mars/pc/agent-btc/evaluation.js';
import { stockageFichier } from '../app-pc/veilleur/stockage-fichier.mjs';
import { stockageFichiers } from '../planetes/mars/tests/aide-btc.mjs';
import { validerV3 } from '../strategies/validation-v3.js';
import { ORDRE_V3, NOMS_V3 } from '../strategies/familles-v3.js';
import { configMoteurDe } from '../planetes/mars/pc/agent-m6/couts.js';
import { dossierAgent } from './etat-agent.mjs';

const args = process.argv.slice(2), val = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const paires = (val('--paires') || 'BTC,SOL,DOGE').split(','), familles = (val('--familles') || ORDRE_V3.join(',')).split(','), racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
async function charger(p) {
  const stockage = args.includes('--repo') ? stockageFichiers(path.join(racine, p === 'BTC' ? 'donnees-btc-cache' : 'donnees-' + p.toLowerCase() + '-cache')) : stockageFichier(path.join(dossierAgent(), 'donnees', 'donnees', p.toLowerCase()));
  const h = creerHistorique({ stockage, lire: null }); await h.charger(); return h.serie();
}
const series = {}; for (const p of paires) { series[p] = await charger(p); console.log(p + ' : ' + series[p].n + ' bougies M15 (' + (series[p].n ? ((series[p].t[series[p].n - 1] - series[p].t[0]) / (365.25 * 86400e3)).toFixed(1) : 0) + ' ans)'); }
const lignes = []; let variantes = 0;
for (const p of paires) {
  const s = series[p]; if (!s.n) continue; const d = decouper(s); if (!d.ok) { console.log(p + ' : ' + d.raison); continue; }
  const autres = paires.filter(x => x !== p && series[x].n).map(x => ({ nom: x, m15: series[x] }));
  for (const f of familles) {
    const t0 = Date.now(), r = validerV3(s, f, { config: configMoteurDe(p), variantesAvant: variantes, autres, debutFinal: d.debutFinal });
    variantes += r.variantesDeCetteEvaluation || 0;
    const st = r.wf && r.wf.stats;
    lignes.push({ paire: p, famille: f, statut: r.statut, trades: st ? st.n : null, esperance: st ? st.esperance : null, ic: r.bootstrap ? r.bootstrap.bas : null, dsr: r.dsr ? r.dsr.dsr : null, ddProp: r.prop ? r.prop.ddPct : null, ratees: r.ratees || [r.raison].filter(Boolean), s: Math.round((Date.now() - t0) / 1000) });
    const l = lignes[lignes.length - 1]; console.log(p.padEnd(5) + (NOMS_V3[f] || f).padEnd(42) + (l.statut).padEnd(20) + ' n=' + String(l.trades).padEnd(5) + ' E=' + (l.esperance == null ? '—' : l.esperance.toFixed(2)).padEnd(6) + ' IC>' + (l.ic == null ? '—' : l.ic.toFixed(2)).padEnd(6) + ' DSR=' + (l.dsr == null ? '—' : (l.dsr * 100).toFixed(0) + '%').padEnd(5) + ' (' + l.s + ' s)');
  }
}
console.log('\n' + lignes.filter(l => l.statut === 'validee_backtest').length + ' validée(s) en backtest sur ' + lignes.length + ' essais ; ' + variantes + ' variantes testées dans cet essai. Jeu final : JAMAIS ouvert.');
if (!lignes.some(l => l.statut === 'validee_backtest')) console.log('Aucune stratégie validée pour l’instant. Preuves insuffisantes.');
console.log(JSON.stringify(lignes.map(l => ({ ...l, ratees: l.ratees.slice(0, 4) }))));
