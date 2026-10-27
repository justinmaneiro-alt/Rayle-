import { historiquePaire } from './m6c-donnees.mjs';
import { decouper } from '../pc/agent-btc/evaluation.js';
import { tranche } from '../pc/agent-btc/colonnes.js';
import { statistiques } from '../pc/agent-btc/moteur.js';
import { contexteRegime, REGLES, ORDRE_REGLES } from '../pc/agent-m6c/regles-regime.js';
import { simulerSuiveur } from '../pc/agent-m6c/simulateur-suiveur.js';
import { CODES } from '../pc/agent-m6c/detecteur-regime.js';

/* Exploration de développement : UNIQUEMENT la zone de recherche A (jamais le jeu final). Paramètres par défaut seulement. */
const paire = process.argv[2] || 'BTC';
const { serie } = await historiquePaire(paire);
const dec = decouper(serie), A = tranche(serie, 0, dec.finA);
const t0 = Date.now(), ctx = contexteRegime(A);
const R = ctx.reg.regime, comptes = [0, 0, 0, 0]; for (let i = 0; i < ctx.n; i++) comptes[R[i]]++;
console.log(paire, 'zone A', A.n, 'bougies', ((A.t[A.n - 1] - A.t[0]) / (365.25 * 86400e3)).toFixed(2), 'ans ; contexte', Date.now() - t0, 'ms');
console.log('part des régimes (M15) : transition', (comptes[0] / ctx.n * 100).toFixed(1), '% · haussier', (comptes[1] / ctx.n * 100).toFixed(1), '% · baissier', (comptes[2] / ctx.n * 100).toFixed(1), '% · range', (comptes[3] / ctx.n * 100).toFixed(1), '%');
for (const id of ORDRE_REGLES) {
  const r = REGLES[id], sig = r.signaux(ctx, r.defaut), sim = simulerSuiveur(A, sig, {}, { de: 0, a: A.n }), st = statistiques(sim.trades, { barres: A.n });
  console.log(id.padEnd(18), 'n', String(st.n).padStart(4), 'esp', st.esperance == null ? '—' : st.esperance.toFixed(3), 'R · taux', st.tauxReussite == null ? '—' : (st.tauxReussite * 100).toFixed(0) + ' %', '· PF', st.factProfit == null ? '—' : st.factProfit.toFixed(2), '· total', st.Rtotal.toFixed(1), 'R · creux', st.ddR.toFixed(1), 'R', sig.evenements.length ? '· événements ' + sig.evenements.length + ' (' + sig.evenements.filter(e => e.type === 'evitee').length + ' évitées)' : '');
}
