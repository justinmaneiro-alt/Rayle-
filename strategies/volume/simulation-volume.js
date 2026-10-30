/* ═════════════ SIMULATION, STATISTIQUES, PORTEFEUILLE VIRTUEL (V14, phases 3 et 5 ; module pur, testé) ═════════════
   Ordres LIMITES réalistes : rempli seulement si le prix TRAVERSE le niveau (low < prix pour un achat) dans les `validite` barres suivantes ; dans la barre de remplissage, la cible n'est jamais comptée
   (on ne sait pas dans quel ordre le prix a bougé) mais le stop oui (hypothèse prudente). Frais maker à l'entrée et sur la cible ; frais taker + glissement + demi-spread sur un stop ou une sortie au temps.
   Résultat en R net de frais. Aucun ordre réel n'existe ici. */

export const COUTS_DEFAUT = Object.freeze({ makerPct: 0.024, fraisPct: 0.06, glissementPct: 0.02, spreadPct: 0.02, hypothese: 'valeurs prudentes par défaut (couts.json absent ou vide)' });

/* Coût total d'un trade en fraction du prix d'entrée (en %). */
export function coutPct(statut, c = COUTS_DEFAUT) {
  if (statut === 'cible') return 2 * c.makerPct;
  if (statut === 'stop') return c.makerPct + c.fraisPct + c.glissementPct + c.spreadPct / 2;
  return c.makerPct + c.fraisPct + c.glissementPct / 2 + c.spreadPct / 2;                    // sortie au temps
}

/* Simule UN signal sur la série s (barres futures i+1…). Retourne null si l'ordre n'est jamais rempli. */
export function simulerSignal(s, sg, couts = COUTS_DEFAUT, { maxBarres = 48 } = {}) {
  const L = sg.niveau, long = sg.sens > 0, risque = Math.abs(L - sg.stop), cible = long ? L + sg.rr * risque : L - sg.rr * risque; let rempli = -1;
  const fin = Math.min(s.nBarres - 1, sg.i + sg.validite);
  for (let q = sg.i + 1; q <= fin; q++) {
    if (long ? s.h[q] >= cible : s.l[q] <= cible) break;                                   // le prix est parti sans nous : ordre annulé
    if (long ? s.l[q] < L : s.h[q] > L) { rempli = q; break; }
  }
  if (rempli < 0) return null;
  let statut = 'temps', sortie = null, qs = Math.min(s.nBarres - 1, rempli + maxBarres);
  if (long ? s.l[rempli] <= sg.stop : s.h[rempli] >= sg.stop) { statut = 'stop'; sortie = sg.stop; qs = rempli; }
  else {
    for (let q = rempli + 1; q <= Math.min(s.nBarres - 1, rempli + maxBarres); q++) {
      if (long ? s.l[q] <= sg.stop : s.h[q] >= sg.stop) { statut = 'stop'; sortie = sg.stop; qs = q; break; }          // stop d'abord si les deux sont touchés dans la même barre
      if (long ? s.h[q] >= cible : s.l[q] <= cible) { statut = 'cible'; sortie = cible; qs = q; break; }
    }
    if (statut === 'temps') { if (rempli + maxBarres >= s.nBarres) return { ...base(sg, s, rempli), statut: 'ouvert', ouvert: true }; sortie = s.c[qs]; }
  }
  const brut = (long ? sortie - L : L - sortie) / risque, cout = coutPct(statut, couts) / 100 * L / risque;
  return { ...base(sg, s, rempli), tSortie: s.t[qs] + s.pas, iSortie: qs, sortie, statut, brutR: brut, coutR: cout, R: brut - cout, ouvert: false };
}
const base = (sg, s, rempli) => ({ iSignal: sg.i, tSignal: s.t[sg.i] + s.pas, tEntree: s.t[rempli], iEntree: rempli, sens: sg.sens, entree: sg.niveau, stop: sg.stop, rr: sg.rr, setup: sg.setup, niv: sg.niv, raison: sg.raison, unite: s.unite });

export function simulerTout(s, signaux, couts, opts) {
  const trades = []; let nonRemplis = 0; let dernierSortie = -1;
  for (const sg of signaux) {
    if (sg.i <= dernierSortie) continue;                                       // une seule position à la fois par série et par setup : pas de recouvrement
    const t = simulerSignal(s, sg, couts, opts); if (!t) { nonRemplis++; continue; }
    trades.push(t); dernierSortie = t.iSortie != null ? t.iSortie : sg.i + 1e9;
  }
  return { trades, nonRemplis, signaux: signaux.length };
}

/* ── Statistiques ── */
export const clefTrimestre = t => { const d = new Date(t); return d.getUTCFullYear() + 'T' + (Math.floor(d.getUTCMonth() / 3) + 1); };
export function stats(trades) {
  const R = trades.filter(t => !t.ouvert).map(t => t.R), n = R.length; if (!n) return { n: 0, rMoyen: 0, tauxReussite: 0, ic95: [0, 0], drawdownR: 0, totalR: 0, trimestres: [], partTrimestresPositifs: 0 };
  const m = R.reduce((a, b) => a + b, 0) / n, sd = n > 1 ? Math.sqrt(R.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : 0, es = sd / Math.sqrt(n);
  let c = 0, pic = 0, dd = 0; for (const r of R) { c += r; if (c > pic) pic = c; if (pic - c > dd) dd = pic - c; }
  const tri = new Map(); for (const t of trades) { if (t.ouvert) continue; const k = clefTrimestre(t.tSortie); let e = tri.get(k); if (!e) tri.set(k, e = { trimestre: k, n: 0, R: 0 }); e.n++; e.R += t.R; }
  const trimestres = [...tri.values()].sort((a, b) => (a.trimestre < b.trimestre ? -1 : 1)).map(x => ({ ...x, rMoyen: x.R / x.n })), gros = trimestres.filter(x => x.n >= 3);
  return { n, rMoyen: m, tauxReussite: R.filter(r => r > 0).length / n, ic95: [m - 1.96 * es, m + 1.96 * es], drawdownR: dd, totalR: c, trimestres, partTrimestresPositifs: gros.length ? gros.filter(x => x.R > 0).length / gros.length : 0, nTrimestres: gros.length };
}

/* ── Découpage chronologique : apprentissage / validation / test (test jamais touché par le choix) ── */
export function decouper(tMin, tMax, parts = [0.5, 0.25, 0.25]) { const d = tMax - tMin; return { appr: [tMin, tMin + d * parts[0]], valid: [tMin + d * parts[0], tMin + d * (parts[0] + parts[1])], test: [tMin + d * (parts[0] + parts[1]), tMax + 1] }; }
export const dans = (t, [a, b]) => t >= a && t < b;

/* ── Portefeuille virtuel avec intérêts composés ── */
export function portefeuille(trades, { capital0 = 10000, risquePct = 1, maxOuvertes = 3, risqueParCle = null, cleDe = t => t.cle || t.setup, bornes = null } = {}) {
  const liste = trades.filter(t => !t.ouvert && (!bornes || (t.tEntree >= bornes[0] && t.tEntree < bornes[1]))).sort((a, b) => a.tEntree - b.tEntree);
  let capital = capital0, pic = capital0, ddMax = 0; const ouvertes = [], courbe = [[liste.length ? liste[0].tEntree : 0, capital0]], par = new Map(), pris = [];
  const fermerAvant = t => { ouvertes.sort((a, b) => a.tSortie - b.tSortie); while (ouvertes.length && ouvertes[0].tSortie <= t) { const o = ouvertes.shift(); capital += o.pnl; if (capital > pic) pic = capital; ddMax = Math.max(ddMax, (pic - capital) / pic); courbe.push([o.tSortie, capital]); } };
  for (const t of liste) {
    fermerAvant(t.tEntree); if (ouvertes.length >= maxOuvertes) continue;
    const cle = cleDe(t), rp = risqueParCle && risqueParCle[cle] ? risqueParCle[cle] : risquePct, risque = capital * rp / 100, pnl = risque * t.R;
    ouvertes.push({ tSortie: t.tSortie, pnl }); pris.push({ ...t, risqueUsd: risque, pnlUsd: pnl });
    let e = par.get(cle); if (!e) par.set(cle, e = { cle, n: 0, gagnes: 0, pnlUsd: 0, R: 0 }); e.n++; e.pnlUsd += pnl; e.R += t.R; if (t.R > 0) e.gagnes++;
  }
  fermerAvant(Infinity);
  const n = pris.length, gagnes = pris.filter(t => t.R > 0).length, finT = courbe[courbe.length - 1][0], semaine = pris.filter(t => t.tSortie >= finT - 7 * 86400e3).reduce((a, t) => a + t.pnlUsd, 0);
  return { capital0, capital, gainUsd: capital - capital0, gainPct: (capital / capital0 - 1) * 100, drawdownMaxPct: ddMax * 100, nTrades: n, tauxReussite: n ? gagnes / n : 0, rMoyen: n ? pris.reduce((a, t) => a + t.R, 0) / n : 0, courbe, parStrategie: [...par.values()].sort((a, b) => b.pnlUsd - a.pnlUsd).map(x => ({ ...x, tauxReussite: x.n ? x.gagnes / x.n : 0 })), semaineUsd: semaine, pris };
}

/* État d'un signal à un instant donné (suivi en direct) : l'ordre est-il encore en attente, rempli (position ouverte), terminé, ou annulé ? Déterministe : on rejoue le signal sur la série actuelle. */
export function etatSignal(s, sg, couts = COUTS_DEFAUT, opts = {}) {
  const r = simulerSignal(s, sg, couts, opts);
  if (r) return r.ouvert ? { statut: 'ouverte', trade: r } : { statut: 'terminee', trade: r };
  const L = sg.niveau, long = sg.sens > 0, fin = Math.min(s.nBarres - 1, sg.i + sg.validite);
  for (let q = sg.i + 1; q <= fin; q++) if (long ? s.h[q] >= (L + sg.rr * Math.abs(L - sg.stop)) : s.l[q] <= (L - sg.rr * Math.abs(L - sg.stop))) return { statut: 'annulee', raison: 'le prix est parti dans le bon sens sans toucher l’ordre' };
  return sg.i + sg.validite <= s.nBarres - 1 ? { statut: 'annulee', raison: 'ordre non touché dans les ' + sg.validite + ' barres' } : { statut: 'en_attente' };
}
