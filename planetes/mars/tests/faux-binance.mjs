/* Faux échange pour les tests M5 : répond comme Binance (klines) avec une série synthétique ; `horloge.t` = « maintenant » (seules les bougies FERMÉES à cet instant sont servies). */
export function fauxBinance(serie, horloge) {
  const n = serie.n, PAS = 900e3;
  return async function lire(url) {
    const m = url.match(/startTime=(\d+)/), lim = Number((url.match(/limit=(\d+)/) || [])[1] || 1000);
    if (!/binance/.test(url)) throw new Error('source inconnue dans le test : ' + url);
    const t0 = m ? Number(m[1]) : 0; let i = 0; while (i < n && serie.t[i] < t0) i++;
    const out = [];
    for (; i < n && out.length < lim; i++) { if (serie.t[i] + PAS > horloge.t + 1) break; out.push([serie.t[i], String(serie.o[i]), String(serie.h[i]), String(serie.l[i]), String(serie.c[i]), String(serie.v[i]), serie.t[i] + PAS - 1, '0', 0, String(serie.vb[i]), '0', '0']); }
    return out;
  };
}
