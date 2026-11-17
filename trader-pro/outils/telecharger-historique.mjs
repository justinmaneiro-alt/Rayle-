/* Télécharge l'historique pour le backtest de « MA200 Daily + H4 » (Yahoo Finance, données publiques) :
   - Daily 10 ans avec volume (or : futures COMEX GC=F ; Nasdaq 100 : ^NDX) ;
   - H1 sur la plus longue période que Yahoo fournit (≈ 2 ans et plus), avec volume ; le H4 s'en déduit (regroupement ancré à 22 h UTC, comme le robot).
   Usage : node trader-pro/outils/telecharger-historique.mjs <dossier-de-sortie>
   Écrit <id>-j.json et <id>-h1.json : [[t, o, h, l, c, v], …] (t = ouverture, ms UTC). Une bougie incomplète est écartée ; le volume manquant vaut 0. */
import fs from 'node:fs'; import path from 'node:path';

export const ACTIFS_RETOURNEMENTS = Object.freeze([{ id: 'or', sym: 'GC=F', nom: 'Or (futures COMEX GC=F)' }, { id: 'us100', sym: '^NDX', nom: 'Nasdaq 100' }]);
export async function telecharger(sym, range, interval, { fetchFn = fetch } = {}) {
  const r = await fetchFn(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(sym + ' : Yahoo a répondu ' + r.status);
  const d = (await r.json()).chart.result[0], q = d.indicators.quote[0], out = [];
  d.timestamp.forEach((s, i) => { const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i]; if ([o, h, l, c].every(Number.isFinite) && c > 0 && h >= l) out.push([s * 1000, o, h, l, c, Number.isFinite(q.volume[i]) ? q.volume[i] : 0]); });
  return out;
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))) {
  const dossier = path.resolve(process.argv[2] || '.'); fs.mkdirSync(dossier, { recursive: true });
  for (const a of ACTIFS_RETOURNEMENTS) for (const [nom, range, interval] of [['j', '10y', '1d'], ['h1', '730d', '60m']]) {
    try { const B = await telecharger(a.sym, range, interval); fs.writeFileSync(path.join(dossier, `${a.id}-${nom}.json`), JSON.stringify(B)); console.log(a.id, nom, B.length, 'bougies', new Date(B[0][0]).toISOString().slice(0, 10), '→', new Date(B[B.length - 1][0]).toISOString().slice(0, 10)); } catch (e) { console.log(a.id, nom, 'ÉCHEC', e.message); }
  }
}
