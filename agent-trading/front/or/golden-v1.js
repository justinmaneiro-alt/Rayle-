/* ═════════════ GOLDEN ZONE — règle figée « golden-v1 » (SHA-256 dans golden-v1.sceau.json, posé AVANT l'affichage) ═════════════
   Zone de 61,8 % à 78,6 % du DERNIER ÉLAN de la structure H1 (fractales de 5 de structure-marche-v1, connues 5 bougies après leur extrême). Élan = du dernier extrême confirmé à l'extrême opposé précédent,
   d'au moins 2 ATR(14). Élan haussier (creux puis sommet) : zone d'achat [sommet − 78,6 % de l'élan ; sommet − 61,8 %] ; élan baissier : zone de vente [creux + 61,8 % ; creux + 78,6 %].
   Invalidée par une clôture H1 au-delà de l'origine de l'élan (retracement de plus de 100 %). Posée à la clôture de la bougie qui confirme le dernier extrême, jamais modifiée ensuite. Une description, jamais un ordre. */
export const VERSION = 'golden-v1', FIGEES_LE = '2026-11-12';
export const P = Object.freeze({ bas: 0.618, haut: 0.786, elanMinAtr: 2, prolongement: 40 });
export const TEXTE_REGLES = 'Golden zone v1 : zone de 61,8 % à 78,6 % du dernier élan H1 (au moins 2 ATR), invalidée par une clôture au-delà de l\'origine de l\'élan.';
/* B = bougies H1 closes ; swings = swings de structure-marche-v1 (type 'H' | 'L', i, p, t, conf) ; A = ATR(14) par bougie. Renvoie la zone du dernier élan ou null. */
export function golden(B, swings, A, R = P) {
  const n = B.length, S = swings.filter(s => s.conf <= n - 1).sort((a, b) => a.i - b.i); if (S.length < 2) return null;
  const s1 = S[S.length - 1]; let s0 = null; for (let k = S.length - 2; k >= 0; k--) if (S[k].type !== s1.type) { s0 = S[k]; break; } if (!s0) return null;
  const a = A[s1.conf] ?? A[n - 1]; if (a == null) return null; const elan = Math.abs(s1.p - s0.p); if (elan < R.elanMinAtr * a) return null;
  const monte = s1.type === 'H', hi = monte ? s1.p - R.bas * elan : s1.p + R.haut * elan, lo = monte ? s1.p - R.haut * elan : s1.p + R.bas * elan;
  const origine = s0.p; let tInval = null; for (let k = s1.conf + 1; k < n; k++) if (monte ? B[k].c < origine : B[k].c > origine) { tInval = B[k].t + 3600e3; break; }
  const prix = B[n - 1].c, dans = prix >= lo && prix <= hi;
  return { cote: monte ? 'achat' : 'vente', bas: lo, haut: hi, elan: { de: s0.p, a: s1.p, atr: elan / a, tDe: s0.t, tA: s1.t }, tPose: B[s1.conf].t + 3600e3, tInval, invalide: tInval != null, prix, dansLaZone: dans && tInval == null, id: `golden|${s1.t}|${s1.type}` };
}
export const etiquette = z => `Golden zone ${z.cote === 'achat' ? 'd’achat' : 'de vente'} · 61,8–78,6 % · élan ${z.elan.atr.toFixed(1).replace('.', ',')} ATR`;
