/* ═════════════ TERMINAL : CALCULS (pur, testé ; aucune dépendance au navigateur) ═════════════ */

/* heure de Paris rapide (règle de l'Union européenne : heure d'été du dernier dimanche de mars 01:00 UTC au dernier dimanche d'octobre 01:00 UTC).
   Sans Intl par bougie : 400 000 bougies se convertissent en quelques millisecondes. */
const cacheEte = new Map();
function bornesEte(an) {
  let b = cacheEte.get(an); if (b) return b;
  const dernierDim = m => { const d = new Date(Date.UTC(an, m + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.getTime(); };
  b = [dernierDim(2), dernierDim(9)]; cacheEte.set(an, b); return b;
}
export function decalageParis(t) { const an = new Date(t).getUTCFullYear(), [d, f] = bornesEte(an); return t >= d && t < f ? 7200e3 : 3600e3; }
export const tempsParis = t => Math.floor((t + decalageParis(t)) / 1000);   // secondes « murales » de Paris pour le graphique
export const depuisTempsParis = s => { const a = s * 1000; return a - decalageParis(a - 3600e3); };
/* temps strictement croissants (deux bougies au même instant mural au changement d'heure) */
export function tempsCroissants(B) { const out = new Array(B.length); let p = -Infinity; for (let i = 0; i < B.length; i++) { let s = tempsParis(B[i].t); if (s <= p) s = p + 1; out[i] = p = s; } return out; }

/* SMA sur TOUTE la série (valeur null tant qu'il n'y a pas n clôtures) */
export function sma(B, n = 200) {
  const out = new Array(B.length); let s = 0;
  for (let i = 0; i < B.length; i++) { s += B[i].c; if (i >= n) s -= B[i - n].c; out[i] = i >= n - 1 ? s / n : null; }
  return out;
}
/* SMA d'une autre unité (H1, Jour) reportée sur les bougies affichées : à l'instant t, la SMA de la DERNIÈRE bougie CLOSE de l'autre unité
   (aucune valeur du futur). M = bougies de l'autre unité, msM = sa durée. */
export function smaProjetee(B, M, msM, n = 200) {
  const v = sma(M, n), out = new Array(B.length); let k = -1;
  for (let i = 0; i < B.length; i++) { while (k + 1 < M.length && M[k + 1].t + msM <= B[i].t) k++; out[i] = k >= 0 ? v[k] : null; }
  return out;
}
/* ATR (moyenne simple des étendues vraies) ; out[i] = ATR des n bougies jusqu'à i comprise */
export function atr(B, n = 14) {
  const out = new Array(B.length); let s = 0; const tr = new Array(B.length);
  for (let i = 0; i < B.length; i++) {
    const b = B[i], pc = i ? B[i - 1].c : b.c; tr[i] = Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
    s += tr[i]; if (i >= n) s -= tr[i - n]; out[i] = i >= n - 1 ? s / n : null;
  }
  return out;
}
export const derniere = a => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i]; return null; };

/* tendance simple et lisible (pour la lecture et Rayle) : clôture face à la SMA 200 et pente de la SMA sur 20 bougies */
export function tendance(B, m200) {
  const i = B.length - 1; if (i < 21 || m200[i] == null || m200[i - 20] == null) return { sens: 'inconnue', raison: 'pas assez de bougies pour la SMA 200' };
  const au = B[i].c > m200[i], pente = m200[i] - m200[i - 20];
  if (au && pente > 0) return { sens: 'haussière', raison: 'prix au-dessus d’une SMA 200 qui monte' };
  if (!au && pente < 0) return { sens: 'baissière', raison: 'prix au-dessous d’une SMA 200 qui baisse' };
  return { sens: 'neutre', raison: au ? 'prix au-dessus d’une SMA 200 qui baisse' : 'prix au-dessous d’une SMA 200 qui monte' };
}

/* santé du marché (bougies affichées + carnet) : volatilité (ATR relatif à sa médiane), volume relatif (dernière bougie close / médiane 20),
   spread et déséquilibre (fournis par le carnet). Les valeurs inconnues restent null. */
const med = x => { const s = x.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
export function sante(B, { spread = null, desequilibre = null, prix = null } = {}) {
  const K = B.filter(b => !b.bande), n = K.length; if (n < 30) return { volatilite: null, volumeRelatif: null, spread, spreadPct: null, desequilibre };
  const A = atr(K, 14), a = A[n - 2], ref = med(A.slice(Math.max(0, n - 200), n - 1));
  const vols = K.slice(Math.max(0, n - 21), n - 1).map(b => b.v), vmed = med(vols), vder = K[n - 2].v;
  return {
    volatilite: a && ref ? { atr: a, rapport: a / ref, mot: a / ref > 1.4 ? 'élevée' : a / ref < 0.7 ? 'faible' : 'normale' } : null,
    volumeRelatif: vmed > 0 && Number.isFinite(vder) ? { rapport: vder / vmed, mot: vder / vmed > 1.8 ? 'fort' : vder / vmed < 0.5 ? 'faible' : 'normal' } : null,
    spread, spreadPct: spread != null && prix > 0 ? spread / prix * 100 : null, desequilibre
  };
}
