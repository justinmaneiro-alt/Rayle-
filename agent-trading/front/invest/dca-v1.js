/* ═════════════ PLAN DCA — règle figée « dca-v1 » (SHA-256 dans dca-v1.sceau.json, posé AVANT le backtest) ═════════════
   Achat de base régulier (un par mois, au premier jour de bourse du mois) + tranche supplémentaire SEULEMENT quand le prix touche un support défini par une règle figée :
   support = plus bas des 120 séances PRÉCÉDENTES ; touche = le plus bas de la séance est ≤ ce support ; la tranche (= un montant mensuel) est achetée à la clôture de la séance ; deux tranches sont espacées de 30 jours au moins.
   Plafonds du plan : 8 % du portefeuille par valeur, 30 % par secteur. Pur, sans DOM ni réseau. Aucune promesse de rendement : un backtest décrit le passé. */
export const VERSION = 'dca-v1', FIGEES_LE = '2026-11-12';
export const P = Object.freeze({ supportJours: 120, espacementJours: 30, plafondValeur: 0.08, plafondSecteur: 0.30 });
export const TEXTE_REGLES = 'DCA v1 : un achat de base par mois ; tranche supplémentaire seulement quand le plus bas du jour touche le plus bas des 120 séances précédentes (au plus une par 30 jours) ; plafonds 8 % par valeur et 30 % par secteur.';
const J = 86400e3;
/* B : séances { t, o, h, l, c } triées ; renvoie { investi, valeur, parts, flux: [{ t, montant, type }], tranches } — extra = true pour « DCA + supports » */
export function simuler(B, { mensuel = 100, extra = false, depuis = 0, R = P } = {}) {
  let parts = 0, investi = 0, mois = null, derniereTranche = -Infinity; const flux = [];
  for (let i = 0; i < B.length; i++) {
    const b = B[i]; if (b.t < depuis) continue; const d = new Date(b.t), cle = d.getUTCFullYear() * 12 + d.getUTCMonth();
    if (cle !== mois) { mois = cle; parts += mensuel / b.c; investi += mensuel; flux.push({ t: b.t, montant: mensuel, type: 'base' }); }
    if (extra && i >= R.supportJours) { let sup = Infinity; for (let k = i - R.supportJours; k < i; k++) sup = Math.min(sup, B[k].l); if (b.l <= sup && b.t - derniereTranche >= R.espacementJours * J) { derniereTranche = b.t; parts += mensuel / b.c; investi += mensuel; flux.push({ t: b.t, montant: mensuel, type: 'tranche' }); } }
  }
  const dernier = B[B.length - 1]; return { investi, valeur: parts * dernier.c, parts, flux, tranches: flux.filter(f => f.type === 'tranche').length, tFin: dernier.t };
}
/* rendement annualisé pondéré par les flux (XIRR) : flux négatifs = versements, valeur finale positive à tFin ; méthode de la bissection ; null si indéfini */
export function xirr(flux, valeur, tFin) {
  const f = r => flux.reduce((s, x) => s - x.montant / Math.pow(1 + r, (x.t - flux[0].t) / (365.25 * J)), 0) + valeur / Math.pow(1 + r, (tFin - flux[0].t) / (365.25 * J));
  let lo = -0.9, hi = 5; if (!(f(lo) * f(hi) < 0)) return null; for (let k = 0; k < 100; k++) { const m = (lo + hi) / 2; if (f(lo) * f(m) <= 0) hi = m; else lo = m; } return (lo + hi) / 2;
}
/* répartition d'un versement entre des valeurs en respectant 8 % par valeur et 30 % par secteur du portefeuille APRÈS versement. positions : [{ ticker, secteur, valeur }] ; candidats : [{ ticker, secteur }] (poids égaux avant plafonds). Renvoie { achats: [{ ticker, montant }], reste } */
export function allouer(montant, candidats, positions, R = P) {
  const val = {}, sec = {}; let total = montant; for (const p of positions) { val[p.ticker] = (val[p.ticker] || 0) + p.valeur; sec[p.secteur || '?'] = (sec[p.secteur || '?'] || 0) + p.valeur; total += p.valeur; }
  const achats = Object.fromEntries(candidats.map(c => [c.ticker, 0])); let reste = montant, actifs = candidats.slice();
  for (let tour = 0; tour < 50 && reste > 1e-6 && actifs.length; tour++) {
    const part = reste / actifs.length; let place = 0; const sature = [];
    for (const c of actifs) { const s = c.secteur || '?', capV = R.plafondValeur * total - (val[c.ticker] || 0) - achats[c.ticker], capS = R.plafondSecteur * total - (sec[s] || 0) - candidats.filter(x => (x.secteur || '?') === s).reduce((t, x) => t + achats[x.ticker], 0), a = Math.max(0, Math.min(part, capV, capS)); achats[c.ticker] += a; place += a; if (a < part - 1e-9) sature.push(c); }
    reste -= place; actifs = actifs.filter(c => !sature.includes(c)); if (place < 1e-9) break;
  }
  return { achats: Object.entries(achats).filter(([, m]) => m > 0).map(([ticker, m]) => ({ ticker, montant: m })), reste };
}
