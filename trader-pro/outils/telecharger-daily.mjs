/* Télécharge l'historique Daily (10 ans, Yahoo Finance, données publiques) des actifs du terminal pour la vérification des flèches.
   Usage : node trader-pro/outils/telecharger-daily.mjs <dossier-de-sortie>
   Écrit un fichier <id>.json par actif : [[t, o, h, l, c], …] (t = ouverture de la bougie, ms UTC). Aucune donnée inventée : une bougie incomplète est écartée. */
import fs from 'node:fs'; import path from 'node:path';

export const ACTIFS_VERIF = Object.freeze([
  { id: 'or', sym: 'GC=F', nom: 'Or (futures GC=F)' }, { id: 'us100', sym: '^NDX', nom: 'Nasdaq 100' }, { id: 'btc', sym: 'BTC-USD', nom: 'Bitcoin' },
  { id: 'sol', sym: 'SOL-USD', nom: 'Solana' }, { id: 'doge', sym: 'DOGE-USD', nom: 'Dogecoin' }, { id: 'us500', sym: '^GSPC', nom: 'S&P 500' }
]);
export async function telecharger(sym, { fetchFn = fetch } = {}) {
  const r = await fetchFn(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=10y&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(sym + ' : Yahoo a répondu ' + r.status);
  const d = (await r.json()).chart.result[0], q = d.indicators.quote[0], out = [];
  d.timestamp.forEach((s, i) => { const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i]; if ([o, h, l, c].every(Number.isFinite) && c > 0 && h >= l) out.push([s * 1000, o, h, l, c]); });
  return out;
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))) {
  const dossier = path.resolve(process.argv[2] || '.'); fs.mkdirSync(dossier, { recursive: true });
  for (const a of ACTIFS_VERIF) { try { const B = await telecharger(a.sym); fs.writeFileSync(path.join(dossier, a.id + '.json'), JSON.stringify(B)); console.log(a.id, B.length, 'bougies', new Date(B[0][0]).toISOString().slice(0, 10), '→', new Date(B[B.length - 1][0]).toISOString().slice(0, 10)); } catch (e) { console.log(a.id, 'ÉCHEC', e.message); } }
}
