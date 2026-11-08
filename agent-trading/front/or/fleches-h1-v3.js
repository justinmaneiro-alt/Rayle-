/* ═════════════ FLÈCHES H1, VERSION 3 (pur, testé) ═════════════
   Règles FIGÉES « fleches-h1-v3 », écrites le 2026-11-08 AVANT le code et tout test, dans leur propre commit (la date de ce commit ouvre
   le bilan de v3). v3 = v2 avec la règle A corrigée ; B et C inchangées ; aucun seuil réglé sur des flèches déjà vues (tous repris de v2,
   eux-mêmes repris de fleches-v1). v2 reste intacte et calculée en parallèle. Informations de lecture du graphique, jamais un ordre. */

export const REGLES_H1_V3 = Object.freeze({
  version: 'fleches-h1-v3', periode: 'H1', ecrites: '2026-11-08', base: 'fleches-h1-v2',
  // repris de v2 (inchangés)
  ecartAtr: 0.15, meche: 0.5, volumeMedianeN: 20, pivotK: 3,
  listeAtr: 0.25, fenetreListe: 1600,
  opposeeBougies: 8, approcheSortieAtr: 1, memeNiveauAtr: 0.5,
  suiviBougies: 8, suiviAtr: 1, regroupementBougies: 8, hasard: 1000, minFleches: 30, decision: 100,
  fraisTaker: 0.0005,
  // A corrigée : le blocage ne vaut que hors des niveaux « du bon côté »
  sansBlocageHausse: Object.freeze(['support', 'liquidité basse']),
  sansBlocageBaisse: Object.freeze(['résistance', 'liquidité haute'])
});

export const TEXTE_REGLES_H1_V3 = `Règles figées ${REGLES_H1_V3.version} (écrites le ${REGLES_H1_V3.ecrites}, avant le code et tout test, dans leur propre commit ; = fleches-h1-v2 avec la règle A corrigée) :
- ATR, régime H1, niveaux listés et rejet : exactement comme fleches-h1-v2 (seuils de fleches-v1 : clôture à ≥ 0,15 ATR du niveau, mèche ≥ la moitié de la bougie, volume ≥ la médiane des 20 précédentes) ;
- A corrigée : après un rejet sur résistance, une flèche verte n'attend un creux plus haut confirmé QUE si elle est posée ailleurs que sur un support ou une liquidité basse listés ; un achat sur un support ou une liquidité basse listés est autorisé dès la première touche, sans attendre de creux plus haut. Miroir : après un rebond sur support, une flèche rouge n'attend un sommet plus bas confirmé que si elle est posée ailleurs que sur une résistance ou une liquidité haute listées ;
- B inchangée : seulement sur un niveau ou une liquidité listés, à moins de 0,25 ATR ;
- C inchangée : aucune flèche en régime H1 « range » ; une seule flèche par approche (même niveau à moins de 0,5 ATR : une autre flèche seulement après une clôture à au moins 1 ATR du niveau) ; aucune flèche opposée à moins de 8 bougies ;
- flèche posée à la clôture de la bougie de confirmation (la bougie de rejet), jamais redessinée ni retirée ;
- bilan depuis la date du commit de ces règles : mêmes mesures que v2 (flèches indépendantes à 8 bougies, +1 ATR avant −1 ATR en 8 bougies, R net après frais preneur 0,05 % par côté et spread mesuré, 1000 tirages au hasard même régime et mêmes heures, « pas assez de données » sous 30) ; correction de Holm sur les 3 versions (v1, v2, v3) ; aucune décision avant 100 flèches indépendantes nouvelles.`;

/* ───────────── calcul (ajouté après le commit des règles eadb16f ; aucune règle ci-dessus n'a changé) ───────────── */
import { mediane } from './bougies-or.js';
import { closes, pivots, atrLocal } from './niveaux-periode.js';
import { REGLES_H1_V2, regimes, listesAvant, bilanH1, DEPUIS_H1_V2 } from './fleches-h1-v2.js';
import { deuxProportions, holm } from './zones-or.js';

/* date du commit des règles v3 (eadb16f, 2026-11-08 01:45:13 heure de Paris) : début du bilan de v3 */
export const DEPUIS_H1_V3 = Object.freeze({ commit: 'eadb16f', t: 1794098713000, texte: '8 nov. 2026, 01 h 45' });
const H = 3600e3;
const volumesDe = (C, volumes) => C.map(b => { const x = volumes && volumes.get(b.t); return x != null ? x : b.v; });
const dist = (x, L) => x < L.bas ? L.bas - x : x > L.haut ? x - L.haut : 0;
/* mêmes briques que fleches-h1-v2 (copie fidèle, vérifiée par test : moteurH1 en règle A « v2 » = flechesH1v2 exactement) */
function rejet(C, i, a, niv, R) {
  const b = C[i], av = C[i - 1], e = b.h - b.l, tol = R.listeAtr * a, ec = R.ecartAtr * a;
  const mecheH = b.h - Math.max(b.o, b.c), mecheB = Math.min(b.o, b.c) - b.l;
  let best = null;
  for (const L of niv) {
    if (L.type !== 'liquidité basse' && mecheH >= R.meche * e) {
      const x = dist(b.h, L) <= dist(av.h, L) ? b.h : av.h, d = dist(x, L), ref = Math.min(Math.max(x, L.bas), L.haut);
      if (d <= tol && b.c <= ref - ec && (!best || d < best.d)) best = { d, sens: 'baisse', niveau: ref, type: L.type };
    }
    if (L.type !== 'liquidité haute' && mecheB >= R.meche * e) {
      const x = dist(b.l, L) <= dist(av.l, L) ? b.l : av.l, d = dist(x, L), ref = Math.min(Math.max(x, L.bas), L.haut);
      if (d <= tol && b.c >= ref + ec && (!best || d < best.d)) best = { d, sens: 'hausse', niveau: ref, type: L.type };
    }
  }
  return best;
}
function candidate(C, V, A, i, R) {
  const a = A[i - 1], b = C[i], e = b.h - b.l; if (!a || !(e > 0)) return false;
  const med = mediane(V.slice(i - R.volumeMedianeN, i)); if (!(V[i] >= med)) return false;
  return b.h - Math.max(b.o, b.c) >= R.meche * e || Math.min(b.o, b.c) - b.l >= R.meche * e ? med : false;
}
/* MOTEUR commun v2 / v3 : regleA = 'v2' (blocage partout) ou 'v3' (blocage seulement hors des niveaux du bon côté).
   trace(e) facultatif : chaque décision avec les valeurs mesurées (diagnostic) ; ne change jamais le résultat. */
export function moteurH1(B, { maintenant = Date.now(), volumes = null, R = REGLES_H1_V3, regleA = 'v3', listes = listesAvant, trace = null } = {}) {
  const C = closes(B, H, maintenant), n = C.length, k = R.pivotK, out = [];
  if (n < 60) return out;
  const A = atrLocal(C, 14), V = volumesDe(C, volumes), REG = regimes(C);
  const pv = pivots(C, k, 0, n - 1), creux = pv.filter(p => p.sorte === 'creux'), sommets = pv.filter(p => p.sorte === 'sommet');
  const dernierRejet = { hausse: -1, baisse: -1 }, approches = [];
  const confirme = (L, r, i, plusHaut) => { for (let j = 0; j < L.length && L[j].i + k <= i; j++) { if (L[j].i <= r || j === 0) continue; if (plusHaut ? L[j].p > L[j - 1].p : L[j].p < L[j - 1].p) return L[j]; } return null; };
  const exempts = { hausse: R.sansBlocageHausse || [], baisse: R.sansBlocageBaisse || [] };
  const T = trace || null;
  for (let i = Math.max(R.volumeMedianeN + 1, 59); i < n; i++) {
    const a = A[i - 1], b = C[i];
    for (const x of approches) if (!x.finie && i > x.i && Math.abs(b.c - x.niveau) >= R.approcheSortieAtr * (A[i] || a)) x.finie = true;
    const med = candidate(C, V, A, i, R);
    if (med === false) { if (T) { const e = b.h - b.l; T({ i, t: b.t, etape: 'filtre', atr: a, volume: V[i], mediane: mediane(V.slice(i - R.volumeMedianeN, i)), mecheBasse: e > 0 ? (Math.min(b.o, b.c) - b.l) / e : null, mecheHaute: e > 0 ? (b.h - Math.max(b.o, b.c)) / e : null, regime: REG[i] }); } continue; }
    const niv = listes(C, i, R), rj = rejet(C, i, a, niv, R);
    if (!rj) { if (T) T({ i, t: b.t, etape: 'B', atr: a, regime: REG[i], niveaux: niv.map(L => ({ type: L.type, bas: L.bas, haut: L.haut, dBas: dist(Math.min(b.l, C[i - 1].l), L) / a, dHaut: dist(Math.max(b.h, C[i - 1].h), L) / a })) }); continue; }
    const autre = rj.sens === 'hausse' ? 'baisse' : 'hausse', rAutre = dernierRejet[autre];
    dernierRejet[rj.sens] = i;
    const exempte = regleA === 'v3' && exempts[rj.sens].includes(rj.type);
    if (rAutre >= 0 && !exempte) {
      const p = confirme(rj.sens === 'hausse' ? creux : sommets, rAutre, i, rj.sens === 'hausse');
      if (!p) { if (T) T({ i, t: b.t, etape: 'A', sens: rj.sens, niveau: rj.niveau, type: rj.type, atr: a, regime: REG[i], rejetOppose: { i: rAutre, t: C[rAutre].t }, pivots: (rj.sens === 'hausse' ? creux : sommets).filter(q => q.i > rAutre - 40 && q.i <= i).map(q => ({ i: q.i, t: q.t, p: q.p, confirme: q.i + k })) }); continue; }
      if (T) T({ i, t: b.t, etape: 'A-ok', sens: rj.sens, pivot: { i: p.i, t: p.t, p: p.p, confirme: p.i + k }, rejetOppose: { i: rAutre, t: C[rAutre].t } });
    } else if (T && rAutre >= 0) T({ i, t: b.t, etape: 'A-exempte', sens: rj.sens, type: rj.type, rejetOppose: { i: rAutre, t: C[rAutre].t } });
    if (REG[i] !== 'haussier' && REG[i] !== 'baissier') { if (T) T({ i, t: b.t, etape: 'C-range', sens: rj.sens, niveau: rj.niveau, type: rj.type, regime: REG[i] }); continue; }
    const op = out.find(f => f.sens === autre && i - f.i < R.opposeeBougies);
    if (op) { if (T) T({ i, t: b.t, etape: 'C-opposee', sens: rj.sens, niveau: rj.niveau, type: rj.type, opposee: { i: op.i, t: op.t, ecart: i - op.i } }); continue; }
    const ap = approches.find(x => !x.finie && Math.abs(x.niveau - rj.niveau) < R.memeNiveauAtr * a);
    if (ap) { if (T) T({ i, t: b.t, etape: 'C-approche', sens: rj.sens, niveau: rj.niveau, type: rj.type, approche: { i: ap.i, t: C[ap.i].t, niveau: ap.niveau } }); continue; }
    const f = { t: b.t, i, sens: rj.sens, niveau: rj.niveau, type: rj.type, regime: REG[i], atr: a, volume: V[i], mediane: med, version: R.version };
    out.push(f); approches.push({ i, niveau: rj.niveau, finie: false });
    if (T) T({ i, t: b.t, etape: 'posee', sens: f.sens, niveau: f.niveau, type: f.type, regime: f.regime, atr: a, volume: V[i], mediane: med, exempte });
  }
  return out;
}
/* FLÈCHES H1 v3 */
export const flechesH1v3 = (B, o = {}) => moteurH1(B, { ...o, R: REGLES_H1_V3, regleA: 'v3' });
/* contrôle : le moteur avec la règle A de v2 et les règles v2 (pour le diagnostic) */
export const moteurV2 = (B, o = {}) => moteurH1(B, { ...o, R: REGLES_H1_V2, regleA: 'v2' });

/* ───────────── bilans des trois versions, chacune depuis le commit de SA règle ───────────── */
export const DEPUIS_VERSIONS = Object.freeze({
  'fleches-v1': Object.freeze({ commit: 'f1311fc', t: 1794080871000, texte: '7 nov. 2026, 20 h 47' }),   // règles fleches-v1 (commit qui les a ajoutées, avec leur code)
  'fleches-h1-v2': DEPUIS_H1_V2, 'fleches-h1-v3': DEPUIS_H1_V3
});
export const NOM_VERSION = Object.freeze({ 'fleches-v1': 'v1', 'fleches-h1-v2': 'v2', 'fleches-h1-v3': 'v3' });
/* parVersion : { version: flèches } ; même calcul que le bilan v2 ; p = écart de réussite au hasard (deux proportions), corrigé par Holm sur les 3 versions */
export function bilansH1(B, parVersion, { maintenant = Date.now(), spread = null } = {}) {
  const vs = Object.keys(DEPUIS_VERSIONS), out = {};
  for (const v of vs) { if (!parVersion[v]) continue; const d = DEPUIS_VERSIONS[v], b = bilanH1(B, parVersion[v], { maintenant, depuis: d.t, spread, version: v });
    out[v] = { ...b, commit: d.commit, depuisTexte: d.texte, texte: b.texte.replace(DEPUIS_H1_V2.texte, d.texte) }; }
  const ps = vs.map(v => { const b = out[v]; return b && b.assez && b.hasard ? deuxProportions(Math.round(b.reussite * b.mesurees), b.mesurees, Math.round(b.hasard.reussite * b.hasard.tirages), b.hasard.tirages) : null; });
  const adj = holm(ps);
  vs.forEach((v, k) => { const b = out[v]; if (!b) return; b.p = ps[k]; b.pHolm = adj[k]; if (b.assez) b.texte = b.texte.replace(' Aucune décision avant', ` Écart au hasard : p corrigée (Holm, 3 versions) ${adj[k] == null ? '—' : adj[k].toFixed(3).replace('.', ',')}. Aucune décision avant`); });
  return out;
}
