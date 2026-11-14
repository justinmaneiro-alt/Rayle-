/* Séries JOURNALIÈRES de l'univers « Couverture et performances » (Phase 6), AJUSTÉES (splits et dividendes quand la source les fournit).
   Yahoo Finance (graphique journalier 10 ans, `adjclose`) ; FRED (taux US 2 ans) en CSV. Format compact : { id, nom, devise, source, t, b: [[t_ms, clôture, clôture_ajustée], ...] }.
   Aucune estimation : une source en échec ne produit PAS de fichier (la copie précédente reste, voir snapshots.mjs). Symboles ajoutés par l'utilisateur : univers-utilisateur.json. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { UNIVERS, nomFichierJour, SYMBOLE_VALIDE } from '../agent-trading/front/marches/univers.js';
const ici = path.dirname(fileURLToPath(import.meta.url)), AGENT = { 'User-Agent': 'Mozilla/5.0 (compatible; rayle-donnees)', Accept: '*/*' };
async function lire(url, ms = 25000) { const r = await fetch(url, { headers: AGENT, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(new URL(url).host + ' a répondu ' + r.status); return r.text(); }
export function lireYahooJour(d, id) {
  const r = d && d.chart && d.chart.result && d.chart.result[0]; if (!r) throw new Error((d && d.chart && d.chart.error && d.chart.error.description) || 'réponse vide');
  const t = r.timestamp || [], q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {}, adj = r.indicators && r.indicators.adjclose && r.indicators.adjclose[0] && r.indicators.adjclose[0].adjclose, m = r.meta || {}, b = [];
  for (let i = 0; i < t.length; i++) { const c = q.close && q.close[i]; if (!Number.isFinite(c) || !(c > 0)) continue; const a = adj && Number.isFinite(adj[i]) && adj[i] > 0 ? adj[i] : c; b.push([t[i] * 1000, +c.toFixed(6), +a.toFixed(6)]); }
  if (b.length < 30) throw new Error('trop peu de points (' + b.length + ')');
  return { id, nom: m.shortName || m.longName || id, devise: m.currency || '', ajuste: !!adj, b, t: Date.now() };
}
export function lireFredCsv(txt, id, serie) { const L = String(txt).trim().split(/\r?\n/).slice(1), b = []; for (const l of L) { const [d, v] = l.split(','), x = parseFloat(v), t = Date.parse(d + 'T00:00:00Z'); if (Number.isFinite(x) && Number.isFinite(t)) b.push([t, x, x]); } if (b.length < 30) throw new Error('trop peu de points FRED'); return { id, nom: serie, devise: '%', ajuste: false, b, t: Date.now() }; }
export function listeUnivers() {
  const L = UNIVERS.map(u => ({ id: u.id, yahoo: u.yahoo || null, fred: u.fred || null, source: u.source }));
  try { const u = JSON.parse(fs.readFileSync(path.join(ici, 'univers-utilisateur.json'), 'utf8')); for (const x of Array.isArray(u) ? u : []) if (x && SYMBOLE_VALIDE.test(String(x.yahoo || x.id || '')) && !L.some(y => y.id === x.id)) L.push({ id: String(x.id || x.yahoo).toUpperCase().replace(/[^A-Z0-9]/g, ''), yahoo: x.yahoo || x.id, fred: null, source: 'Yahoo Finance (symbole ajouté par l’utilisateur)' }); } catch (e) { /* aucun symbole ajouté */ }
  return L;
}
export async function telechargerJour(u) {
  if (u.yahoo) return lireYahooJour(JSON.parse(await lire(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(u.yahoo)}?range=10y&interval=1d&events=div%2Csplits&includeAdjustedClose=true`)), u.id);
  if (u.fred) return lireFredCsv(await lire('https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + u.fred + '&cosd=' + new Date(Date.now() - 3700 * 864e5).toISOString().slice(0, 10)), u.id, u.fred);
  throw new Error('aucune source pour ' + u.id);
}
export { nomFichierJour };
