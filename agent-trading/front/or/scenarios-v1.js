/* ═════════════ SCÉNARIOS DESSINÉS — règle figée « scenarios-v1 » (SHA-256 dans scenarios-v1.sceau.json, posé AVANT l'affichage et AVANT les statistiques) ═════════════
   Document de référence : STRATEGIE-RAYLE.md §7. Fonctions pures, sans DOM. « Scénarios, pas prévisions. »
   Recalculés SEULEMENT à la clôture de chaque bougie H1 (aucun repaint : l'ancien tracé est archivé, pâle, daté). Chaque probabilité est une fréquence empirique de PREMIER PASSAGE mesurée
   sur l'historique Dukascopy (touche du niveau cible avant celle de l'invalidation), TOUJOURS affichée à côté de la valeur du hasard b / (a + b) et de n ; « écart non net » quand l'intervalle
   de confiance contient le hasard ; « pas assez de données » sous 30 cas. Le contexte non validé (carnet, delta, annonces) est affiché à part, jamais intégré à la probabilité. Aucun ordre. */
export const VERSION = 'scenarios-v1', FIGEES_LE = '2026-11-11';
export const P = Object.freeze({
  horizons: Object.freeze({ '1j': 24, '3j': 72, '1sem': 120 }),
  grille: Object.freeze([0.5, 1, 1.5, 2, 3]),     // distances (ATR) des tables de premier passage
  grilleMin: 0.35, grilleMax: 4.5,
  echantillonPas: 24,                              // bougies entre deux échantillons (réduit le recouvrement)
  regimeFenetre: 500, regimeBas: 1 / 3, regimeHaut: 2 / 3,   // régime de volatilité = tercile de l'ATR sur les 500 dernières bougies
  casMin: 30, niveauMinAtr: 0.5, projectionAtr: 1.5, stopIndicatifAtr: 1.5, rejetMaxAtr: 2, marge: 0.25
});
export const TEXTE_REGLES = 'Scénarios v1 : recalculés à la clôture de chaque bougie H1. Cône de volatilité = amplitude réelle sur 24, 72 et 120 bougies (percentiles 50 % et 80 %, par régime de volatilité). Probabilité = fréquence empirique de premier passage (cible touchée avant l\'invalidation) selon la distance de chaque niveau en ATR, l\'état de tendance H1/H4 et la position par rapport à la SMA 200, toujours comparée à b / (a + b). Scénario A = continuation de la structure, B = retournement ou opposé. Scénarios, pas prévisions.';
const H = 3600e3;
const nb = (x, d = 0) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' '));
export const wilson = (k, n, z = 1.96) => { if (!n) return [0, 1]; const p = k / n, c = (p + z * z / (2 * n)) / (1 + z * z / n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n); return [c - h, c + h]; };

/* ── régime de volatilité et état de contexte (causaux) ── */
export function regimeVol(A, i, R = P) {
  const v = A[i]; if (v == null) return null; const L = []; for (let k = Math.max(0, i - R.regimeFenetre + 1); k <= i; k++) if (A[k] != null) L.push(A[k]); if (L.length < 100) return null;
  let rang = 0; for (const x of L) if (x <= v) rang++; const q = rang / L.length; return q < R.regimeBas ? 'bas' : q < R.regimeHaut ? 'moyen' : 'haut';
}
export const etatTendance = (t1, t4) => (t1 > 0 && t4 > 0 ? 'haussier' : t1 < 0 && t4 < 0 ? 'baissier' : 'mixte');
/* classe de la grille la plus proche (échelle logarithmique) ; null hors table */
export function classeDistance(d, R = P) { if (!(d >= R.grilleMin) || d > R.grilleMax) return null; let m = R.grille[0], e = Infinity; for (const g of R.grille) { const x = Math.abs(Math.log(d / g)); if (x < e) { e = x; m = g; } } return m; }
export const cleCellule = (a, b) => `${a}|${b}`;

/* ── cône de volatilité : { t, p50h, p50b, p80h, p80b } pour chaque bougie future jusqu'à l'horizon ── */
export function cone(stats, regime, prix, atr, tDerniere, bougies) {
  const r = stats && stats.cone && stats.cone[regime]; if (!r) return null; const L = [];
  for (let h = 1; h <= bougies; h++) { const k = h - 1; if (r.p50h[k] == null) break; L.push({ t: tDerniere + h * H, h, p50h: prix + r.p50h[k] * atr, p50b: prix - r.p50b[k] * atr, p80h: prix + r.p80h[k] * atr, p80b: prix - r.p80b[k] * atr }); }
  return L;
}
/* bougies nécessaires pour que l'excursion médiane (p50) atteigne d ATR dans un sens ; plafonné à l'horizon */
export function dureeMediane(stats, regime, d, sens, bougies) {
  const r = stats && stats.cone && stats.cone[regime]; if (!r) return null; const T = sens > 0 ? r.p50h : r.p50b; for (let h = 1; h <= Math.min(bougies, T.length); h++) if (T[h - 1] >= d) return h; return bougies;
}

/* ── probabilité de premier passage : cible à aUp ATR vers le haut, invalidation à bDn ATR vers le bas (table construite sur l'historique) ── */
export function celluleUpFirst(stats, { aUp, bDn, horizon, etat, sma }, R = P) {
  const A = classeDistance(aUp, R), Bc = classeDistance(bDn, R); if (A == null || Bc == null || !stats || !stats.ppp) return null;
  const essai = (fen, et, sm) => { const c = stats.ppp[fen] && stats.ppp[fen][horizon] && stats.ppp[fen][horizon][et] && stats.ppp[fen][horizon][et][sm] && stats.ppp[fen][horizon][et][sm][cleCellule(A, Bc)]; return c || null; };
  const out = { classeA: A, classeB: Bc, tous: false };
  for (const fen of ['long', 'recent']) { let c = essai(fen, etat, String(sma)); if (!c || c.nT < R.casMin) { const t = essai(fen, 'tous', 'tous'); if (t && (!c || t.nT > c.nT)) { c = t; out.tous = true; } } out[fen] = c; }
  return out;
}
/* probabilité d'un scénario : touche la cible (distance a, sens dir) avant l'invalidation (distance b, sens opposé). Renvoie { taux, ic, hasard, n, ecart, texte… } */
export function probabilite(stats, { dir, a, b, horizon, etat, sma }, R = P) {
  const hasard = b / (a + b);
  const cel = dir > 0 ? celluleUpFirst(stats, { aUp: a, bDn: b, horizon, etat, sma }, R) : celluleUpFirst(stats, { aUp: b, bDn: a, horizon, etat, sma }, R);   // P(bas d'abord) = 1 − P(haut d'abord) dans le même contexte réel
  const sens = c => { if (!c) return null; const k = dir > 0 ? c.k : c.nT - c.k, ic = wilson(k, c.nT); return { n: c.nT, k, taux: c.nT ? k / c.nT : null, ic, mediane: c.mediane ?? null }; };
  const L = cel && sens(cel.long), Rc = cel && sens(cel.recent);
  const out = { hasard, a, b, dir, long: L, recent: Rc, tous: !!(cel && cel.tous), mesure: !!cel };
  if (!L || L.n < R.casMin) { out.verdict = 'pas assez de données'; out.taux = null; out.n = L ? L.n : 0; return out; }
  out.taux = L.taux; out.n = L.n; out.ic = L.ic;
  out.verdict = L.ic[0] > hasard ? 'au-dessus du hasard' : L.ic[1] < hasard ? 'en dessous du hasard' : 'écart non net';
  return out;
}

/* ── niveaux : dédoublonnage et tri par distance ── */
export function niveauxOrientes(niveaux, prix, atr, dir, R = P) {
  const L = niveaux.filter(n => (dir > 0 ? n.p > prix : n.p < prix) && Math.abs(n.p - prix) >= R.niveauMinAtr * atr).sort((x, y) => Math.abs(x.p - prix) - Math.abs(y.p - prix)), out = [];
  for (const n of L) if (!out.length || Math.abs(n.p - out[out.length - 1].p) >= R.niveauMinAtr * atr) out.push(n); return out;
}

/* ── génération des scénarios A (continuation) et B (retournement / opposé) ── */
export function construire(ctx, R = P) {
  const { B, atr, prix, t1, t4, positionMa, niveaux = [], ligne = null, stats, horizon = '1j', contexte = [], regime = null, tDerniere = B[B.length - 1].t } = ctx;
  const N = R.horizons[horizon] || 24, rg = regime || 'moyen', etat = etatTendance(t1, t4), sma = positionMa >= 0 ? 1 : -1;
  const dirA = t1 !== 0 ? t1 : t4 !== 0 ? t4 : (positionMa >= 0 ? 1 : -1), dirB = -dirA, enveloppe = stats && stats.cone && stats.cone[rg] ? stats.cone[rg].p80h[Math.min(N, stats.cone[rg].p80h.length) - 1] : null;
  const dist = p => Math.abs(p - prix) / atr;
  const nomN = n => (n ? `${n.nom} ${nb(n.p, 0)}` : null);
  const au = niveauxOrientes(niveaux, prix, atr, dirA, R), contre = niveauxOrientes(niveaux, prix, atr, dirB, R);
  const L1 = au[0] || null, L2 = au[1] || null;
  const cibleA = L2 && (!enveloppe || dist(L2.p) <= enveloppe * 1.25) ? L2 : L1 || { p: prix + dirA * R.projectionAtr * atr, nom: 'projection 1,5 ATR (aucun niveau connu)', projection: true };
  const invA = ligne && ((dirA > 0 && ligne.dir < 0) || (dirA < 0 && ligne.dir > 0)) ? { p: ligne.p, nom: 'ligne de retournement' } : { p: prix - dirA * R.stopIndicatifAtr * atr, nom: 'stop indicatif 1,5 ATR', indicatif: true };
  const rejet = L1 && dist(L1.p) <= R.rejetMaxAtr ? L1 : null, M1 = contre[0] || null, M2 = contre[1] || null;
  const cibleB = rejet ? (M1 || { p: prix + dirB * R.projectionAtr * atr, nom: 'projection 1,5 ATR (aucun niveau connu)', projection: true }) : (M2 || M1 || { p: prix + dirB * R.projectionAtr * atr, nom: 'projection 1,5 ATR (aucun niveau connu)', projection: true });
  const invB = rejet ? { p: rejet.p + dirA * R.marge * atr, nom: `au-delà de ${nomN(rejet)}` } : { p: prix + dirA * R.stopIndicatifAtr * atr, nom: 'stop indicatif 1,5 ATR', indicatif: true };
  const tau = (d, sens) => Math.min(N, Math.max(1, dureeMediane(stats, rg, d, sens, N) ?? Math.round(Math.min(N, d * 6))));
  const trace = niv => { const pts = [{ t: tDerniere, p: prix }]; let h = 0, pPrec = prix; for (const n of niv) { const d = Math.abs(n.p - pPrec) / atr, sens = n.p >= pPrec ? 1 : -1; h = Math.min(N, h + Math.max(1, tau(d, sens))); pts.push({ t: tDerniere + h * H, p: n.p, nom: n.nom }); pPrec = n.p; } return pts; };
  const cheminA = (L1 && cibleA !== L1 ? [L1, cibleA] : [cibleA]), cheminB = rejet ? [rejet, cibleB] : (M1 && cibleB !== M1 ? [M1, cibleB] : [cibleB]);
  const fabrique = (id, dir, cible, inv, chemin, declenchement, titre) => {
    const a = dist(cible.p), b = dist(inv.p), pr = probabilite(stats, { dir, a, b, horizon: N, etat, sma }, R), points = trace(chemin);
    // le trajet du rejet remonte d'abord vers le niveau avant de repartir : sens du premier segment = sens de A
    const d = pr.long && pr.long.mediane != null ? Math.round(pr.long.mediane) : null;
    const etiquette = pr.taux != null ? `Scénario ${id} · ${Math.round(pr.taux * 100)} % (hasard ${Math.round(pr.hasard * 100)} %, n = ${pr.n})` : `Scénario ${id} · pas assez de données (hasard ${Math.round(pr.hasard * 100)} %)`;
    const phraseMesure = pr.taux != null ? `fréquence mesurée de premier passage ${Math.round(pr.taux * 100)} % [${Math.round(pr.ic[0] * 100)} – ${Math.round(pr.ic[1] * 100)} %] contre ${Math.round(pr.hasard * 100)} % pour le hasard b / (a + b) (n = ${pr.n}) → ${pr.verdict}${pr.tous ? ' (tous contextes : le contexte précis manque de cas)' : ''}` : `pas assez de données dans ce contexte (${pr.n} cas, il en faut ${R.casMin}) ; valeur du hasard ${Math.round(pr.hasard * 100)} %`;
    const anomalies = cible.projection ? ['la cible est une projection, aucun niveau connu dans ce sens'] : [];
    return { id, couleur: id, dir, cible: { p: cible.p, nom: cible.nom, projection: !!cible.projection }, invalidation: { p: inv.p, nom: inv.nom, indicatif: !!inv.indicatif }, declenchement, a, b, proba: pr, points, etiquette,
      condition: `condition : ${declenchement} · invalidation : clôture H1 ${dir > 0 ? 'sous' : 'au-dessus de'} ${nb(inv.p, 0)}`, dureeTypique: d,
      detail: [titre, `cible ${nb(cible.p, 0)} (${cible.nom}) à ${nb(a, 1)} ATR · invalidation ${nb(inv.p, 0)} (${inv.nom}) à ${nb(b, 1)} ATR`, `condition de déclenchement : ${declenchement}`, phraseMesure, d != null ? `durée typique mesurée jusqu'au premier passage : ${d} bougies H1` : 'durée typique : pas assez de données', 'scénarios, pas prévisions ; une description, jamais un ordre', ...anomalies] };
  };
  const A = fabrique('A', dirA, cibleA, invA, cheminA, L1 ? `clôture H1 ${dirA > 0 ? 'au-dessus de' : 'sous'} ${nb(L1.p, 0)}` : `clôture H1 ${dirA > 0 ? 'au-dessus de' : 'sous'} ${nb(prix + dirA * 0.5 * atr, 0)}`, `Scénario A : continuation de la structure ${dirA > 0 ? 'haussière' : 'baissière'} (${etat === 'mixte' ? 'tendances H1 et H4 mixtes' : 'tendances H1 et H4 alignées'}).`);
  const B_ = fabrique('B', dirB, cibleB, invB, cheminB, ligne ? ligne.texte.replace(/^Retournement (baissier|haussier) si /, '') : (M1 ? `clôture H1 ${dirB > 0 ? 'au-dessus de' : 'sous'} ${nb(M1.p, 0)}` : `clôture H1 ${dirB > 0 ? 'au-dessus de' : 'sous'} ${nb(prix + dirB * 0.5 * atr, 0)}`), rejet ? `Scénario B : rejet de ${nomN(rejet)} puis retour vers ${nomN(cibleB)}.` : `Scénario B : retournement, le prix repart dans le sens ${dirB > 0 ? 'haussier' : 'baissier'}.`);
  return { horizon, bougies: N, regime: rg, etat, sma, prix, atr, tPose: tDerniere + H, cone: cone(stats, rg, prix, atr, tDerniere, N), actifs: [A, B_], contexte, rappel: 'Scénarios, pas prévisions.' };
}

/* ── archive forward : marquage à l'échéance « réalisé », « invalidé » ou « expiré » (touches de la cible et de l'invalidation, mêmes que la mesure) ── */
export function enregistrement(scen, sc, tPose) { return { kind: 'pose', id: `${scen.horizon}|${tPose}|${sc.id}`, tPose, horizon: scen.horizon, bougies: scen.bougies, scenario: sc.id, dir: sc.dir, prix: scen.prix, atr: scen.atr, cible: sc.cible.p, invalidation: sc.invalidation.p, proba: sc.proba.taux, hasard: sc.proba.hasard, n: sc.proba.n, verdict: sc.proba.verdict, etiquette: sc.etiquette, points: sc.points, condition: sc.condition }; }
export function resoudre(pose, B) {
  const i0 = B.findIndex(b => b.t >= pose.tPose); if (i0 < 0) return null; const fin = Math.min(B.length - 1, i0 + pose.bougies - 1);
  for (let k = i0; k <= fin; k++) { const b = B[k], cible = pose.dir > 0 ? b.h >= pose.cible : b.l <= pose.cible, inval = pose.dir > 0 ? b.l <= pose.invalidation : b.h >= pose.invalidation; if (inval) return { statut: 'invalide', t: b.t }; if (cible) return { statut: 'realise', t: b.t }; }
  return B.length - 1 >= i0 + pose.bougies - 1 ? { statut: 'expire', t: B[fin].t } : null;
}
/* fiabilité : courbe de calibration, score de Brier, par horizon ; seules les poses tranchées (réalisé / invalidé) comptent */
export function fiabilite(registre, R = P) {
  const poses = registre.filter(x => x.kind === 'pose'), res = new Map(registre.filter(x => x.kind === 'resultat').map(x => [x.id, x])), sortie = { horizons: {}, total: poses.length };
  for (const h of Object.keys(R.horizons)) {
    const S = poses.filter(p => p.horizon === h && p.proba != null).map(p => ({ p, r: res.get(p.id) })).filter(x => x.r && x.r.statut !== 'expire'), n = S.length, expires = poses.filter(p => p.horizon === h && res.get(p.id) && res.get(p.id).statut === 'expire').length;
    const o = { n, expires, assez: n >= R.casMin, brier: null, courbe: [], phrase: '' };
    if (n) { o.brier = S.reduce((s, x) => s + (x.p.proba - (x.r.statut === 'realise' ? 1 : 0)) ** 2, 0) / n; for (const [lo, hi] of [[0, 0.3], [0.3, 0.5], [0.5, 0.7], [0.7, 1.01]]) { const T = S.filter(x => x.p.proba >= lo && x.p.proba < hi); if (T.length) o.courbe.push({ lo, hi: Math.min(1, hi), n: T.length, prevu: T.reduce((s, x) => s + x.p.proba, 0) / T.length, observe: T.filter(x => x.r.statut === 'realise').length / T.length }); } }
    o.phrase = o.assez ? `Horizon ${h} : score de Brier ${o.brier.toFixed(3)} sur ${n} scénarios tranchés (0,25 = niveau d'une pièce à pile ou face ; plus petit = mieux)${expires ? `, ${expires} expirés non comptés` : ''}.` : `Horizon ${h} : pas assez de données (${n} scénario${n > 1 ? 's' : ''} tranché${n > 1 ? 's' : ''}, il en faut ${R.casMin}).`;
    sortie.horizons[h] = o;
  }
  return sortie;
}
