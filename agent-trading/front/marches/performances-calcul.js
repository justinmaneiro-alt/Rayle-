/* PERFORMANCES HISTORIQUES PAR ACTIF (Phase 6, partie B) : calculs PURS, sans navigateur, testés sur jeux synthétiques (agent-trading/tests/performances-test.mjs).
   Règles figées AVANT tout test : horizons de persistance 6 et 12 mois, 50 % de réglage / 50 % de test, 1 000 tirages aléatoires (graine fixe), correction de Holm,
   moyenne mobile 200 jours pour la stratégie, n < 30 = « pas assez de données ». Le résultat HORS ÉCHANTILLON est celui qui est mis en avant.
   Jamais présenté comme une opportunité garantie : une tendance passée ne garantit pas la suite ; l'historique ne garantit rien ; pas un conseil d'investissement. */
export const MENTIONS = Object.freeze(['Une tendance passée ne garantit pas la suite.', 'L’historique ne garantit rien.', 'Ce n’est pas un conseil d’investissement.']);
export const REGLES = Object.freeze({ horizons: [6, 12], partReglage: 0.5, tirages: 1000, graine: 20261114, sma: 200, minMois: 30, minAns: 3, seuilP: 0.05, seuilPercentile: 95 });
const J = 86400e3, arr = (v, d = 2) => (Number.isFinite(v) ? +v.toFixed(d) : null);
const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const moyenne = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
export function ecartType(a) { if (a.length < 2) return NaN; const m = moyenne(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1)); }
const cle = (t, f) => { const d = new Date(t); return f === 'mois' ? d.toISOString().slice(0, 7) : f === 'an' ? String(d.getUTCFullYear()) : (() => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), j = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - j); return x.toISOString().slice(0, 10); })(); };
/* dernier point de chaque période : [[clé, t, c]] */
export function fins(serie, f) { const m = new Map(); for (const [t, c] of serie) m.set(cle(t, f), [t, c]); return [...m.entries()].map(([k, v]) => [k, v[0], v[1]]); }
/* rendement sur les `mois` derniers mois (calendaires) ; null si l'historique est trop court */
export function rendementMois(serie, mois) { if (serie.length < 2) return null; const [tf, cf] = serie[serie.length - 1], d = new Date(tf); d.setUTCMonth(d.getUTCMonth() - mois); const t0 = d.getTime(); if (serie[0][0] > t0 + 5 * J) return null; let c0 = null; for (let i = serie.length - 1; i >= 0; i--) if (serie[i][0] <= t0) { c0 = serie[i][1]; break; } return c0 ? (cf / c0 - 1) * 100 : null; }
export function parAnnee(serie) { const F = fins(serie, 'an'), out = []; for (let i = 0; i < F.length; i++) { const prev = i ? F[i - 1][2] : serie[0][1], debut = i ? F[i - 1][0] : null; out.push({ an: +F[i][0], pct: arr((F[i][2] / prev - 1) * 100), complet: i > 0 && i < F.length - 1 || (i === F.length - 1 && new Date(F[i][1]).getUTCMonth() === 11), partiel: i === 0 || (i === F.length - 1 && new Date(F[i][1]).getUTCMonth() < 11) }); } return out; }
export function pourcentHausse(serie, f) { const F = fins(serie, f); if (F.length < 3) return { n: F.length, pct: null }; let h = 0, n = 0; for (let i = 1; i < F.length; i++) { n++; if (F[i][2] > F[i - 1][2]) h++; } return { n, pct: arr(h / n * 100, 1) }; }
export function drawdown(serie) {
  let pic = serie[0][1], tp = serie[0][0], pire = 0, duree = 0, dMax = { de: null, a: null }, enCours = 0;
  for (const [t, c] of serie) { if (c >= pic) { const d = Math.round((t - tp) / J); if (d > duree) { duree = d; } pic = c; tp = t; } const dd = c / pic - 1; if (dd < pire) { pire = dd; dMax = { de: tp, a: t }; } }
  enCours = serie[serie.length - 1][1] / pic - 1; const dernierePicDuree = Math.round((serie[serie.length - 1][0] - tp) / J); if (dernierePicDuree > duree) duree = dernierePicDuree;
  return { max: arr(pire * 100), dureeJours: duree, enCoursPct: arr(enCours * 100), creuxLe: dMax.a };
}
export function series(serie) { let up = 0, dn = 0, mu = 0, md = 0; for (let i = 1; i < serie.length; i++) { if (serie[i][1] > serie[i - 1][1]) { up++; dn = 0; } else if (serie[i][1] < serie[i - 1][1]) { dn++; up = 0; } else { up = 0; dn = 0; } if (up > mu) mu = up; if (dn > md) md = dn; } return { plusLongueHausse: mu, plusLongueBaisse: md }; }
export const rendJour = serie => { const r = []; for (let i = 1; i < serie.length; i++) r.push(serie[i][1] / serie[i - 1][1] - 1); return r; };
export const sma = (c, n) => { const o = new Array(c.length).fill(null); let s = 0; for (let i = 0; i < c.length; i++) { s += c[i]; if (i >= n) s -= c[i - n]; if (i >= n - 1) o[i] = s / n; } return o; };
/* plus forte remontée contre la tendance : sous la SMA 200, du plus bas du régime jusqu'au sommet de la remontée */
export function remonteeContreTendance(serie, n = 200) { const c = serie.map(p => p[1]), m = sma(c, n); let min = Infinity, best = 0, quand = null; for (let i = 0; i < c.length; i++) { if (m[i] == null) continue; if (c[i] < m[i]) { if (c[i] < min) min = c[i]; const r = c[i] / min - 1; if (r > best) { best = r; quand = serie[i][0]; } } else min = Infinity; } return { pct: best ? arr(best * 100) : null, le: quand }; }
/* tendance de fond sur 3, 6, 12 mois : rendement comparé à la volatilité de l'horizon ; régularité = part des mois dans le sens ; changements de sens par an */
export function tendanceDeFond(serie, jours = 252) {
  const r = rendJour(serie), vol = ecartType(r) * Math.sqrt(jours), M = fins(serie, 'mois'), out = {};
  for (const h of [3, 6, 12]) {
    const rend = rendementMois(serie, h); if (rend == null) { out[h] = { sens: 'données insuffisantes' }; continue; }
    const sh = vol * Math.sqrt(h / 12) * 100, sens = rend > 0.5 * sh ? 'haussière' : rend < -0.5 * sh ? 'baissière' : 'sans tendance', mensuels = []; for (let i = Math.max(1, M.length - h); i < M.length; i++) mensuels.push(M[i][2] / M[i - 1][2] - 1);
    const reg = sens === 'sans tendance' || !mensuels.length ? null : mensuels.filter(x => Math.sign(x) === (sens === 'haussière' ? 1 : -1)).length / mensuels.length;
    out[h] = { sens, rendementPct: arr(rend), seuilPct: arr(0.5 * sh), regularitePct: reg == null ? null : arr(reg * 100, 0) };
  }
  const t3 = []; for (let i = 3; i < M.length; i++) t3.push(Math.sign(M[i][2] / M[i - 3][2] - 1)); const f36 = t3.slice(-36); let ch = 0; for (let i = 1; i < f36.length; i++) if (f36[i] !== f36[i - 1]) ch++;
  out.changementsParAn = f36.length >= 12 ? arr(ch / (f36.length / 12), 1) : null; out.volAnnuellePct = arr(vol * 100, 1); return out;
}
/* ───── persistance : la tendance passée (6 / 12 mois) a-t-elle prédit le mois suivant ? ───── */
export function holm(ps) { const idx = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]), m = ps.length, adj = new Array(m); let prec = 0; idx.forEach(([p, i], k) => { prec = Math.max(prec, Math.min(1, p * (m - k))); adj[i] = prec; }); return adj; }
function observationsPersistance(M, L) { const o = []; for (let i = L; i < M.length - 1; i++) { const sg = Math.sign(M[i][2] / M[i - L][2] - 1), suivant = M[i + 1][2] / M[i][2] - 1; if (sg !== 0) o.push({ sg, suivant }); } return o; }
const statP = o => (o.length ? moyenne(o.map(x => x.sg * x.suivant)) : NaN);
export function persistance(serie, { horizons = REGLES.horizons, tirages = REGLES.tirages, graine = REGLES.graine, partReglage = REGLES.partReglage } = {}) {
  const M = fins(serie, 'mois'), rng = mulberry(graine); if (M.length - 1 - Math.max(...horizons) < 2 * 15) return { verdict: 'pas assez de données', raison: `${M.length} mois d'historique : il en faut au moins ${REGLES.minMois + Math.max(...horizons)}`, nMois: M.length };
  const par = {}; for (const L of horizons) { const o = observationsPersistance(M, L), cut = Math.floor(o.length * partReglage), reg = o.slice(0, cut), test = o.slice(cut);
    let sup = 0; const obs = statP(test), vals = test.map(x => x.suivant), signes = test.map(x => x.sg);
    for (let k = 0; k < tirages; k++) { const p = vals.slice(); for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } let s = 0; for (let i = 0; i < p.length; i++) s += signes[i] * p[i]; if (s / p.length >= obs) sup++; }
    par[L] = { nReglage: reg.length, nTest: test.length, moyReglagePct: arr(statP(reg) * 100, 3), moyTestPct: arr(obs * 100, 3), tauxReussiteTestPct: arr(test.filter(x => Math.sign(x.suivant) === x.sg).length / (test.length || 1) * 100, 1), pBrut: (sup + 1) / (tirages + 1) }; }
  const L = horizons.slice(), ps = L.map(h => par[h].pBrut), adj = holm(ps); L.forEach((h, i) => { par[h].pHolm = arr(adj[i], 4); par[h].pBrut = arr(par[h].pBrut, 4); });
  const choisi = L.slice().sort((a, b) => (par[b].moyReglagePct ?? -1e9) - (par[a].moyReglagePct ?? -1e9))[0], c = par[choisi];
  let verdict, raison; if (c.nTest < REGLES.minMois) { verdict = 'indéterminé'; raison = `seulement ${c.nTest} mois de test (il en faut ${REGLES.minMois})`; } else if (c.pHolm < REGLES.seuilP && c.moyTestPct > 0) { verdict = 'persisté de façon significative'; raison = `hors échantillon, horizon ${choisi} mois : p corrigé (Holm) ${c.pHolm}`; } else { verdict = 'pas mieux que le hasard'; raison = `hors échantillon, horizon ${choisi} mois : p corrigé (Holm) ${c.pHolm} ≥ ${REGLES.seuilP}`; }
  return { verdict, raison, horizonChoisi: choisi, horizons: par, nMois: M.length, tirages, graine, regles: 'figées avant le test : horizons 6 et 12 mois, réglage sur la 1re moitié, test sur la 2e, Holm sur les 2 horizons' };
}
/* ───── stratégie « suivre la tendance » (au-dessus de la MA200 : acheter ; sous : vendre ou rester à l'écart) simulée AVEC coûts ───── */
export function simulerTendance(serie, p = {}) {
  const { mode = 'long-court', levier = 1, spreadPct = 0, slippagePct = 0, swapLongJourPct = null, swapCourtJourPct = null, jours365 = false, tirages = REGLES.tirages, graine = REGLES.graine, sma: n = REGLES.sma } = p;
  const c = serie.map(x => x[1]), m = sma(c, n), pos = c.map((v, i) => (m[i] == null ? 0 : v > m[i] ? 1 : (mode === 'long-court' ? -1 : 0)));
  const swapAbsent = swapLongJourPct == null && swapCourtJourPct == null, jours = jours365 ? 365 : 252;
  function jouer(posSerie, avecSwap = true, avecCouts = true) {
    let eq = 1, pic = 1, dd = 0, gains = 0, pertes = 0, nTr = 0, tempsMarche = 0; const rj = [], ret = [];
    for (let i = 1; i < c.length; i++) {
      const p0 = posSerie[i - 1], pPrev = i > 1 ? posSerie[i - 2] : 0; let r = p0 * levier * (c[i] / c[i - 1] - 1);
      if (avecCouts && p0 !== pPrev) { r -= Math.abs(p0 - pPrev) * levier * (spreadPct / 2 + slippagePct) / 100; if (p0 !== 0) nTr++; }
      if (avecSwap && p0 !== 0) { const cal = Math.max(1, Math.round((serie[i][0] - serie[i - 1][0]) / J)), sw = p0 > 0 ? swapLongJourPct : swapCourtJourPct; if (sw != null) r += sw / 100 * cal * levier; }
      if (p0 !== 0) tempsMarche++; eq *= 1 + r; if (eq > pic) pic = eq; dd = Math.min(dd, eq / pic - 1); if (r > 0) gains += r; else pertes -= r; rj.push(r); ret.push(r);
    }
    return { total: (eq - 1) * 100, dd: dd * 100, pf: pertes > 0 ? gains / pertes : null, nTr, tempsMarche: rj.length ? tempsMarche / rj.length : 0, rj, annees: (serie[serie.length - 1][0] - serie[0][0]) / (365.25 * J) };
  }
  const reel = jouer(pos), sansSwap = jouer(pos, false), sansCouts = jouer(pos, false, false), annees = reel.annees;
  /* comparaison au HASARD : la même série de positions décalée circulairement (même exposition, même nombre de retournements), mêmes coûts */
  const rng = mulberry(graine), tot = [], N = pos.length; for (let k = 0; k < tirages; k++) { const dec = 20 + Math.floor(rng() * Math.max(1, N - 40)); tot.push(jouer(pos.map((_, i) => pos[(i + dec) % N])).total); }
  const percentile = tot.filter(x => x < reel.total).length / tot.length * 100;
  const rBH = jouer(c.map((_, i) => (i === 0 ? 0 : 1)), false, false);
  /* comportement lors des retournements : rendement moyen de la stratégie sur les 10 jours qui suivent chaque changement de position */
  const apres = []; for (let i = 1; i < pos.length; i++) if (pos[i] !== pos[i - 1] && m[i] != null) { let s = 1; for (let k = i; k < Math.min(i + 10, c.length - 1); k++) s *= 1 + pos[k] * levier * (c[k + 1] / c[k] - 1); apres.push((s - 1) * 100); }
  return { mode, levier, nJours: c.length, ans: arr(annees, 1), totalPct: arr(reel.total), annualisePct: arr((Math.pow(Math.max(1 + reel.total / 100, 1e-9), 1 / annees) - 1) * 100), drawdownPct: arr(reel.dd), factorProfit: arr(reel.pf), nTrades: reel.nTr, tempsEnPositionPct: arr(reel.tempsMarche * 100, 0),
    sansCoutsTotalPct: arr(sansCouts.total), effetSwapPts: arr(reel.total - sansSwap.total), sansSwapTotalPct: arr(sansSwap.total), swapAbsent, avertissement: swapAbsent ? 'swap non saisi : résultat SANS swap, probablement trop optimiste (surtout monnaies et indices en CFD). Saisis les valeurs de ton courtier.' : null,
    neRienFaire: { totalPct: 0, note: 'rester en liquidités' }, acheterEtGarder: { totalPct: arr(rBH.total), drawdownPct: arr(rBH.dd) }, hasard: { tirages, moyenneTotalPct: arr(moyenne(tot)), percentile: arr(percentile, 1), meilleurQueHasard95: percentile >= REGLES.seuilPercentile },
    retournements: { n: apres.length, moyennePct10j: arr(moyenne(apres)), pirePct10j: apres.length ? arr(Math.min(...apres)) : null, partPerdantesPct: apres.length ? arr(apres.filter(x => x < 0).length / apres.length * 100, 0) : null }, jours };
}
/* ───── analyse complète d'un actif ───── */
export function analyse(serie, p = {}) {
  const s = (serie || []).filter(x => Number.isFinite(x[0]) && Number.isFinite(x[1]) && x[1] > 0); if (s.length < 30) return { statut: 'données insuffisantes', raison: `${s.length} observations`, n: s.length, mentions: MENTIONS };
  const jours = p.jours365 ? 365 : 252, ans = (s[s.length - 1][0] - s[0][0]) / (365.25 * J);
  const R = { n: s.length, debut: s[0][0], fin: s[s.length - 1][0], ans: arr(ans, 1), rendements: { '1 mois': arr(rendementMois(s, 1)), '3 mois': arr(rendementMois(s, 3)), '6 mois': arr(rendementMois(s, 6)), '1 an': arr(rendementMois(s, 12)), '3 ans': arr(rendementMois(s, 36)), '5 ans': arr(rendementMois(s, 60)) },
    parAnnee: parAnnee(s), moisHausse: pourcentHausse(s, 'mois'), semainesHausse: pourcentHausse(s, 'semaine'), drawdown: drawdown(s), series: series(s), volAnnuellePct: arr(ecartType(rendJour(s)) * Math.sqrt(jours) * 100, 1), remonteeContreTendance: remonteeContreTendance(s), tendance: tendanceDeFond(s, jours), mentions: MENTIONS };
  R.persistance = persistance(s, p); R.strategie = ans >= REGLES.minAns ? simulerTendance(s, { ...p, jours365: !!p.jours365 }) : null;
  const suff = ans >= REGLES.minAns && R.persistance.verdict !== 'pas assez de données' && R.strategie;
  R.classement = !suff ? 'données insuffisantes' : (R.persistance.verdict === 'persisté de façon significative' && R.strategie.hasard.meilleurQueHasard95 && R.strategie.totalPct > 0) ? 'tendance régulière observée' : 'pas de tendance exploitable';
  R.classementNote = R.classement === 'tendance régulière observée' ? 'Observée dans le passé, hors échantillon ET meilleure que le hasard : ce n’est pas une garantie.' : R.classement === 'pas de tendance exploitable' ? 'Ni la persistance mensuelle ni la stratégie ne battent le hasard avec le niveau de preuve exigé.' : 'Historique trop court ou trop pauvre pour conclure (au moins 3 ans et 30 mois de test).';
  return R;
}
/* B6 : la tendance de fond va-t-elle dans le même sens que la dernière flèche v8 ? (lecture seule : ne modifie ni ne filtre les flèches) */
export function memeSensQueFleche(sensTendance, dirFleche) { if (!sensTendance || sensTendance === 'sans tendance' || sensTendance === 'données insuffisantes' || !dirFleche) return { ok: null, texte: 'comparaison impossible' }; const same = (sensTendance === 'haussière' && dirFleche > 0) || (sensTendance === 'baissière' && dirFleche < 0); return { ok: same, texte: same ? 'oui : la tendance de fond va dans le même sens que la dernière flèche' : 'non : la tendance de fond va dans l’autre sens que la dernière flèche' }; }
