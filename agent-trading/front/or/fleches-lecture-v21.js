/* ═════════════ FLÈCHES DE LECTURE v2.1 — « fleches-lecture-v21 » (2026-11-12) ═════════════
   Écrite APRÈS avoir vu le rejeu de la v2 (58 cassures MA200 en grappes) : les règles ci-dessous ont donc été AJUSTÉES en connaissant les données ; elles ne prouvent aucune performance.
   La v2 (scellée) n'est pas modifiée : rebonds sur zones, levelId, issue, distance de 6 bougies viennent d'elle. Seule change la MA200 :
   1. Hystérésis : après une cassure, une cassure dans l'autre sens n'est possible que si une clôture H1 est à ≥ 1 ATR de l'autre côté de la MA200, OU après 24 bougies H1 avec une
      clôture à ≥ 0,3 ATR de l'autre côté. Entre-temps les zigzags ne produisent AUCUNE flèche (même règle pour une cassure du même sens après une fausse cassure).
   2. Retest : au plus un par cassure, dans les 48 bougies, sans re-cassure ; aucun retest si la cassure a été étiquetée « fausse ».
   3. Fausse cassure : une seule étiquette qui remplace la cassure concernée (retour à ≥ 0,3 ATR de l'autre côté dans les 6 bougies) ; aucune flèche ajoutée.
   4. Une zone qui change de rôle reste UN niveau : au moins 12 bougies entre une flèche d'un rôle et celle du rôle suivant du même niveau (ajout de la v2.1, décidé après le rejeu).
   Les zones surveillées sont normalisées par zones-fines-v1.js, AVANT dessin et surveillance (dessin = surveillance). */
import * as V2 from './fleches-lecture-v2.js';
import { atrSerie, resultat } from './fleches-terminal-v1.js';
import { sma } from './fleches-lecture-v1.js';

export const VERSION = 'fleches-lecture-v21', ECRITES_LE = '2026-11-12';
export const H = 3600e3;
export const P = Object.freeze({ ...V2.P, hystereseAtr: 1, hystereseBougies: 24 });
export const TYPES = V2.TYPES, idNiveau = V2.idNiveau, detail = V2.detail, textesRes = V2.textesRes, issue = V2.issue, fusionnerRegistre = V2.fusionnerRegistre, evenementsNiveaux = V2.evenementsNiveaux, espacer = V2.espacer;
const FORCE_MA = 1000;

export function evenementsMa(B, A, M = sma(B)) {
  const out = []; let cote = 0, derniere = null, retest = null;
  for (let i = 1; i < B.length; i++) {
    const m = M[i], a = A[i]; if (m == null || !(a > 0)) continue;
    const c = B[i].c, d = c - m;
    if (cote === 0) { if (Math.abs(d) >= P.cassureAtr * a) cote = Math.sign(d); continue; }
    if (Math.sign(d) === -cote && Math.abs(d) >= P.cassureAtr * a) {
      // fausse cassure : retour dans les 6 bougies ; l'étiquette remplace la flèche, rien n'est ajouté
      if (derniere && !derniere.fausse && i - derniere.i <= P.confirmation) { derniere.fausse = true; derniere.fausseI = i; cote = -derniere.dir; retest = null; continue; }
      // hystérésis
      const libre = !derniere || Math.abs(d) >= P.hystereseAtr * a || (i - derniere.i >= P.hystereseBougies);
      if (!libre) continue;
      const f = { type: 'ma_cassure', dir: Math.sign(d), i, prix: c, niveau: m, atr: a, levelId: 'MA200', force: FORCE_MA, source: 'MA200', nom: (d > 0 ? 'Cassure haussière' : 'Cassure baissière') + ' de la MA200', fausse: false };
      out.push(f); derniere = f; retest = { dir: f.dir, i, fait: false }; cote = f.dir; continue;
    }
    if (retest && !retest.fait && !(derniere && derniere.fausse) && i - retest.i <= P.retestFenetre && i > retest.i + 1) {
      const dir = retest.dir, touche = dir > 0 ? B[i].l <= m + P.retestAtr * a : B[i].h >= m - P.retestAtr * a, bonCote = dir > 0 ? c > m : c < m;
      if (touche && bonCote && Math.abs(d) >= 0.1 * a) { out.push({ type: 'ma_retest', dir, i, prix: c, niveau: m, atr: a, levelId: 'MA200', force: FORCE_MA - 1, source: 'MA200', nom: (dir > 0 ? 'Retest haussier' : 'Retest baissier') + ' de la MA200 : le prix y revient et tient', cassureI: retest.i }); retest.fait = true; }
    } else if (retest && i - retest.i > P.retestFenetre) retest = null;
  }
  // un retest dont la cassure a fini étiquetée « fausse » n'existe pas
  return out.filter(f => !(f.type === 'ma_retest' && out.some(g => g.type === 'ma_cassure' && g.i === f.cassureI && g.fausse)));
}

export function calculer(B, zones, { maintenant = Date.now(), jours = null } = {}) {
  const closes = (B || []).filter(b => b.t + H <= maintenant && b.c > 0);
  if (closes.length < 40) return { fleches: [], toutes: [], n: closes.length, raison: `seulement ${closes.length} bougies H1 closes` };
  const A = atrSerie(closes), M = sma(closes), fin = closes[closes.length - 1].t, depuisT = jours == null ? -Infinity : fin - jours * 86400e3;
  let tous = evenementsNiveaux(closes, A, zones || []);
  // 4. une zone qui change de rôle (support devenu résistance) reste UN niveau : au moins 12 bougies entre deux flèches du même niveau lorsqu'il a changé de rôle entre-temps (support devenu résistance et inversement)
  const dernierNiv = new Map(); tous = tous.sort((x, y) => x.i - y.i).filter(f => { const k = String(f.levelId).split('@')[0], d = dernierNiv.get(k); if (d && d.seg !== f.levelId && f.i - d.i < P.repos) return false; dernierNiv.set(k, { i: f.i, seg: f.levelId }); return true; });
  tous = tous.concat(evenementsMa(closes, A, M));
  tous = espacer(tous).map(f => ({ ...f, id: `${f.type}|${closes[f.i].t}|${f.dir}|${f.levelId}`, t: closes[f.i].t, tCloture: closes[f.i].t + H, version: VERSION })).filter(f => f.tCloture > depuisT);
  const res = tous.map(f => ({ ...f, resultat: resultat(closes, f), issue: issue(closes, f) }));
  return { fleches: res.filter(f => !f.masquee), toutes: res, n: closes.length, raison: null };
}
