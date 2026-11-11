/* EMA300 pondérée par le volume (« VEMA ») : EMA(volume × clôture) / EMA(volume), alpha = 2 / (n + 1), n = 300 ; si le volume d'une bougie est nul ou absent, son poids est 1. Pur. */
export const VERSION = 'vema-v1';
export function vemaSerie(B, n = 300) {
  const k = 2 / (n + 1), o = new Array(B.length).fill(null); let num = null, den = null;
  for (let i = 0; i < B.length; i++) { const w = B[i].v > 0 ? B[i].v : 1; if (num == null) { num = w * B[i].c; den = w; } else { num = k * w * B[i].c + (1 - k) * num; den = k * w + (1 - k) * den; } if (i >= n - 1) o[i] = num / den; }
  return o;
}
