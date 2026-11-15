/* ═════════════ SIGNAUX H4 / JOUR : pour capturer les gros mouvements de plusieurs jours (module PUR, testé) ═════════════
   Règles écrites AVANT tout calcul, peu nombreuses :
   1. BIAIS donné par le Jour : acheteur si la clôture J est au-dessus de la MA200 J ET que la MA200 J ne baisse pas ; vendeur dans le cas inverse ; sinon aucun signal.
   2. SIGNAL à la CLÔTURE d'une bougie H4 ou Jour (jamais en cours de bougie, jamais redessiné), dans le sens du biais :
        a. rebond confirmé sur un support / une résistance (Jour ou H4) ;  b. rebond confirmé sur la MA200 H4 ou J ;  c. cassure d'un niveau suivie de son retest qui tient.
   3. STOP au-delà du dernier swing (6 dernières bougies) plus une marge d'ATR ; OBJECTIF au prochain niveau Jour situé à au moins 2 R (au plus 6 R), sinon 3 R ; risque entre 0,5 et 3 ATR sinon pas de signal.
   4. Quelques signaux par mois et par actif : délai minimal entre deux signaux de même sens sur la même unité de temps (H4 : 12 bougies = 2 jours, porté de 6 à 12 après un premier essai à 6,3 signaux par mois sur l'or, trop pour « quelques » : choix fait sur le NOMBRE de signaux, pas sur leur résultat ; Jour : 3 jours).
   Les paramètres sont FIXES (pas de réglage sur l'historique). Bougie = { t (ouverture, ms), o, h, l, c }. Aucune donnée inventée : peu de bougies = aucun signal. */
import { sma, atr, pivots } from '../commun/analyse.js';

export const PARAMS = Object.freeze({ tol: 0.3, pente: 10, pivotK: 5, fenetreNiveaux: 300, regroupement: 0.6, toucheMin: 2, cassure: 0.3, retestFen: 12, swing: 6, margeSL: 0.25, risqueMin: 0.5, risqueMax: 3, rrMin: 2, rrMax: 6, rrDefaut: 3, delai: { H4: 12, J: 3 }, maxBougies: 30, forceCloture: 0.55 });
const PAS = { H4: 4 * 3600e3, J: 86400e3 };

/* niveaux (regroupement de pivots CONFIRMÉS à la bougie i : pivot p connu seulement à p + k) ; chaque niveau : { prix, touches } */
export function niveauxA(B, pivs, i, a, P = PARAMS) {
  const debut = Math.max(0, i - P.fenetreNiveaux), pts = pivs.filter(p => p.i + P.pivotK <= i && p.i >= debut).map(p => p.prix).sort((x, y) => x - y), out = []; if (!pts.length || !a) return out;
  let g = [pts[0]]; const flush = () => { out.push({ prix: g.reduce((s, x) => s + x, 0) / g.length, touches: g.length }); };
  for (let k = 1; k < pts.length; k++) { if (pts[k] - g[g.length - 1] <= P.regroupement * a) g.push(pts[k]); else { flush(); g = [pts[k]]; } } flush();
  return out.filter(n => n.touches >= P.toucheMin);
}
const indexAvant = (B, t) => { let lo = 0, hi = B.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (B[m].t < t) { r = m; lo = m + 1; } else hi = m - 1; } return r; };   // dernière bougie qui OUVRE avant t

/* Calcule tous les signaux sur une unité de temps. `jour` = bougies Jour (pour le biais, la MA200 J et les objectifs) ; `tf` = 'H4' | 'J' ; `B` = bougies de l'unité. */
export function signaux(B, jour, tf = 'J', P = PARAMS) {
  const out = []; if (B.length < 60 || jour.length < 215) return out;
  const pas = PAS[tf], A = atr(B, 14), AJ = atr(jour, 14), cJ = jour.map(b => b.c), m200J = sma(cJ, 200), m200T = tf === 'J' ? m200J : sma(B.map(b => b.c), 200);
  const pivB = pivots(B, P.pivotK), pivJ = pivots(jour, P.pivotK), dernier = { 1: -1e9, '-1': -1e9 }, cass = [];   // cass : cassures récentes { dir, niveau, i }
  for (let i = 40; i < B.length; i++) {
    const b = B[i], a = A[i]; if (a == null || !(b.h >= b.l)) continue; const tCloture = b.t + pas;
    /* le Jour connu à cet instant : dernière bougie Jour entièrement clôturée (ouverture + 1 jour ≤ clôture de la bougie courante) */
    const j = tf === 'J' ? indexAvant(jour, b.t + 1) : indexAvant(jour, tCloture - PAS.J + 1); if (j < 205 || m200J[j] == null) continue;
    const pente = m200J[j] - m200J[j - P.pente], haut = jour[j].c > m200J[j], biais = haut && pente >= 0 ? 1 : (!haut && pente <= 0 ? -1 : 0); if (!biais) continue;
    if (i - dernier[biais] < P.delai[tf]) continue;
    const nT = niveauxA(B, pivB, i, a, P), nJ = niveauxA(jour, pivJ, j, AJ[j], P), tous = [...nJ.map(n => ({ ...n, src: 'J' })), ...nT.map(n => ({ ...n, src: tf }))];
    const mas = [{ prix: m200J[j], src: 'MA200 J' }]; if (tf === 'H4' && m200T[i] != null) mas.push({ prix: m200T[i], src: 'MA200 H4' }); else if (tf === 'J' && m200T[i] != null) { /* même série */ }
    const bull = b.c > b.o && (b.c - b.l) / Math.max(1e-9, b.h - b.l) >= P.forceCloture, bear = b.c < b.o && (b.h - b.c) / Math.max(1e-9, b.h - b.l) >= P.forceCloture, tol = P.tol * a;
    let type = null, niveau = null;
    /* c. cassure puis retest : on note les cassures par clôture, puis on cherche le retest qui tient */
    for (const n of tous) { if (biais === 1 && B[i - 1].c <= n.prix && b.c > n.prix + P.cassure * a) cass.push({ dir: 1, niveau: n.prix, i }); if (biais === -1 && B[i - 1].c >= n.prix && b.c < n.prix - P.cassure * a) cass.push({ dir: -1, niveau: n.prix, i }); }
    while (cass.length && i - cass[0].i > P.retestFen) cass.shift();
    if (biais === 1 && bull) {
      for (const n of [...mas, ...tous.filter(x => x.prix < b.c)]) if (b.l <= n.prix + tol && b.l >= n.prix - 1.2 * a && b.c > n.prix + 0.1 * a) { type = n.src.startsWith('MA200') ? 'rebond MA200' : 'rebond niveau'; niveau = n; break; }
      if (!type) for (const c of cass) if (c.dir === 1 && c.i < i && b.l <= c.niveau + tol && b.c > c.niveau && !B.slice(c.i + 1, i).some(x => x.c < c.niveau - tol)) { type = 'cassure + retest'; niveau = { prix: c.niveau, src: tf }; break; }
    } else if (biais === -1 && bear) {
      for (const n of [...mas, ...tous.filter(x => x.prix > b.c)]) if (b.h >= n.prix - tol && b.h <= n.prix + 1.2 * a && b.c < n.prix - 0.1 * a) { type = n.src.startsWith('MA200') ? 'rebond MA200' : 'rebond niveau'; niveau = n; break; }
      if (!type) for (const c of cass) if (c.dir === -1 && c.i < i && b.h >= c.niveau - tol && b.c < c.niveau && !B.slice(c.i + 1, i).some(x => x.c > c.niveau + tol)) { type = 'cassure + retest'; niveau = { prix: c.niveau, src: tf }; break; }
    }
    if (!type) continue;
    const swing = biais === 1 ? Math.min(...B.slice(i - P.swing, i + 1).map(x => x.l)) : Math.max(...B.slice(i - P.swing, i + 1).map(x => x.h));
    const sl = biais === 1 ? swing - P.margeSL * a : swing + P.margeSL * a, risque = Math.abs(b.c - sl); if (risque < P.risqueMin * a || risque > P.risqueMax * a) continue;
    /* objectif : prochain niveau Jour à au moins rrMin R (au plus rrMax R), sinon rrDefaut R */
    const cands = nJ.map(n => n.prix).filter(p => (biais === 1 ? p - b.c : b.c - p) >= P.rrMin * risque && (biais === 1 ? p - b.c : b.c - p) <= P.rrMax * risque).sort((x, y) => (biais === 1 ? x - y : y - x));
    const tp = cands.length ? cands[0] : b.c + biais * P.rrDefaut * risque, rr = Math.abs(tp - b.c) / risque;
    dernier[biais] = i; out.push({ tf, i, t: b.t, tCloture, dir: biais, type, niveau: niveau && +niveau.prix.toFixed(2), source: niveau && niveau.src, entree: b.c, sl: +sl.toFixed(4), tp: +tp.toFixed(4), risque: +risque.toFixed(4), rr: +rr.toFixed(2), atr: +a.toFixed(4), objectifNiveau: cands.length > 0, biaisJ: biais });
  }
  return out;
}

/* Simulation SANS regard vers l'avenir : entrée à l'ouverture de la bougie SUIVANTE ; stop et objectif vérifiés bougie par bougie (si les deux sont touchés dans la même bougie : stop d'abord) ;
   sortie à la clôture après `maxBougies`. Coûts en unités de prix (spread + glissement). Résultat en R. */
export function simuler(B, sigs, { cout = 0, P = PARAMS } = {}) {
  const T = [];
  for (const s of sigs) {
    const k = s.i + 1; if (k >= B.length) continue; const e = B[k].o, d = s.dir, risque = (e - s.sl) * d; if (risque <= 0 || (s.tp - e) * d <= 0) continue;   // ouverture au-delà du stop ou de l'objectif : on ne prend pas
    let sortie = null, raison = null, kk = k;
    for (kk = k; kk < Math.min(B.length, k + P.maxBougies); kk++) {
      const x = B[kk], touchStop = d === 1 ? x.l <= s.sl : x.h >= s.sl, touchObj = d === 1 ? x.h >= s.tp : x.l <= s.tp;
      if (touchStop) { sortie = s.sl; raison = 'stop'; break; } if (touchObj) { sortie = s.tp; raison = 'objectif'; break; }
    }
    if (sortie == null) { kk = Math.min(B.length - 1, k + P.maxBougies - 1); sortie = B[kk].c; raison = 'durée'; }
    T.push({ ...s, tEntree: B[k].t, entreeReelle: e, sortie, raison, tSortie: B[kk].t, r: ((sortie - e) * d - cout) / risque });
  }
  return T;
}
export function statistiques(T) {
  const n = T.length; if (!n) return { n: 0 };
  const g = T.filter(t => t.r > 0), p = T.filter(t => t.r <= 0), sg = g.reduce((s, t) => s + t.r, 0), sp = p.reduce((s, t) => s + t.r, 0); let c = 0, pic = 0, dd = 0; for (const t of T) { c += t.r; if (c > pic) pic = c; dd = Math.min(dd, c - pic); }
  return { n, gagnants: g.length, winRate: g.length / n, rMoyen: (sg + sp) / n, profitFactor: sp < 0 ? sg / Math.abs(sp) : null, rTotal: sg + sp, drawdownR: dd, gainMoyenR: g.length ? sg / g.length : null, perteMoyenneR: p.length ? sp / p.length : null, courbe: T.reduce((a, t) => { a.push((a.length ? a[a.length - 1] : 0) + t.r); return a; }, []) };
}
