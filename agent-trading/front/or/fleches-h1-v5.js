/* ═════════════ FLÈCHES H1, VERSION 5, ET NIVEAUX H1 AFFICHÉS (pur, testé) ═════════════
   Règles FIGÉES « fleches-h1-v5 » et « niveaux-h1-v5 », écrites le 2026-11-08 AVANT le code et tout test, dans leur propre commit
   (la date de ce commit ouvre le bilan de v5). v5 = fleches-h1-v2 telle quelle + trois corrections. Seuils repris de v2 (eux-mêmes de
   fleches-v1) ; les seuls seuils nouveaux viennent de la consigne (5 touches) ou sont fixés ici une fois pour toutes (6 par côté).
   Aucun seuil réglé d'après ce qui a été vu sur les graphiques. v1, v2, v3, v4 restent intactes et calculées en parallèle.
   Informations de lecture du graphique, jamais un ordre. */

/* niveaux H1 affichés (dessin du graphique en H1 ET niveaux des flèches v5) : même calcul que niveaux-periode-v1 (pivots, regroupement,
   bandes, fusion des bandes à moins de 1 ATR), seule la SÉLECTION change */
export const REGLES_NIVEAUX_H1_V5 = Object.freeze({
  version: 'niveaux-h1-v5', base: 'niveaux-periode-v1', periode: 'H1',
  touchesMin: 5,   // une bande est affichée si elle a au moins 5 touches (plus haut / plus bas majeurs : toujours gardés)
  parCote: 6,      // au plus 6 au-dessus et 6 au-dessous du prix (au lieu de 4)
  forts: 2         // les 2 plus importantes de chaque côté bien visibles, les autres discrètes (comme avant)
});

export const REGLES_H1_V5 = Object.freeze({
  version: 'fleches-h1-v5', periode: 'H1', ecrites: '2026-11-08', base: 'fleches-h1-v2', niveaux: REGLES_NIVEAUX_H1_V5.version,
  // repris de v2 (inchangés)
  ecartAtr: 0.15, meche: 0.5, volumeMedianeN: 20, pivotK: 3, listeAtr: 0.25, fenetreListe: 1600,
  opposeeBougies: 8, approcheSortieAtr: 1, memeNiveauAtr: 0.5,
  suiviBougies: 8, suiviAtr: 1, regroupementBougies: 8, hasard: 1000, minFleches: 30, decision: 100, fraisTaker: 0.0005,
  // correction 1 : sens aligné sur le régime H1
  sensParRegime: Object.freeze({ haussier: 'hausse', baissier: 'baisse' }),
  niveauxHausse: Object.freeze(['support', 'liquidité basse']), niveauxBaisse: Object.freeze(['résistance', 'liquidité haute'])
});

export const TEXTE_REGLES_H1_V5 = `Règles figées ${REGLES_H1_V5.version} et ${REGLES_NIVEAUX_H1_V5.version} (écrites le ${REGLES_H1_V5.ecrites}, avant le code et tout test, dans leur propre commit ; = fleches-h1-v2 telle quelle + trois corrections) :
- base v2 inchangée : ATR (moyenne simple des 14 dernières étendues vraies), régime H1 (biais : EMA 20 / 50), rejet (extrême à moins de 0,25 ATR du niveau, clôture à au moins 0,15 ATR du bon côté, mèche ≥ la moitié de la bougie, volume ≥ la médiane des 20 précédentes), règle A d'origine (pas de verte après un rejet sur résistance tant qu'un creux plus haut n'est pas confirmé, miroir pour les rouges), règle B (seulement sur un niveau listé), règle C (rien en range, une flèche par approche, aucune flèche opposée à moins de 8 bougies), flèche posée à la clôture de la bougie de rejet, jamais redessinée ;
- correction 1, sens aligné sur le régime H1 : régime haussier → seulement des flèches vertes, sur un support ou une liquidité basse ; régime baissier → seulement des flèches rouges, sur une résistance ou une liquidité haute ; régime « range » → aucune flèche ; jamais de flèche contre le régime ;
- correction 2, niveaux H1 affichés (${REGLES_NIVEAUX_H1_V5.version}) : même calcul que niveaux-periode-v1 (pivots, regroupement à 0,5 ATR, bandes, fusion des bandes à moins de 1 ATR bord à bord), mais une bande n'est gardée que si elle a au moins 5 touches (plus haut et plus bas majeurs toujours gardés), jusqu'à 6 au-dessus et 6 au-dessous du prix (au lieu de 4), les 2 plus importantes de chaque côté bien visibles ; zones de liquidité inchangées ; étiquettes sans chevauchement (une étiquette qui chevaucherait est omise, détail au survol) ; échelle calée sur les bougies visibles, jamais sur les niveaux lointains (repère ▲ / ▼ hors champ) ;
- correction 3 : les flèches v5 sont posées sur les niveaux effectivement affichés (même liste que le dessin : niveaux ${REGLES_NIVEAUX_H1_V5.version} et zones de liquidité, calculés avec les seules bougies closes avant la bougie), à au plus 0,25 ATR du niveau ; jamais sur un niveau non affiché ;
- bilan depuis la date du commit de ces règles, mêmes mesures que v2 (flèches indépendantes à 8 bougies, +1 ATR avant −1 ATR en 8 bougies, R net après frais preneur 0,05 % par côté et spread mesuré, 1000 tirages au hasard même régime et mêmes heures, « pas assez de données » sous 30) ; correction de Holm sur toutes les versions suivies (v1 à v5) ; aucune décision avant 100 flèches indépendantes nouvelles.`;

/* ───────────── calcul (ajouté après le commit des règles 980f1b2 ; aucune règle ci-dessus n'a changé) ───────────── */
import { mediane } from './bougies-or.js';
import { closes, pivots, atrLocal, niveauxPeriode, liquidite, fourchette, REGLES_NIVEAUX } from './niveaux-periode.js';
import { regimes, bilanH1, DEPUIS_H1_V2 } from './fleches-h1-v2.js';
import { DEPUIS_4, NOMS_4 } from './fleches-h1-v4.js';
import { deuxProportions, holm } from './zones-or.js';
import { pluriel } from './texte-or.js';

/* date du commit des règles v5 (980f1b2, 2026-11-08 02:58:46 heure de Paris) : début du bilan de v5 */
export const DEPUIS_H1_V5 = Object.freeze({ commit: '980f1b2', t: 1794103126000, texte: '8 nov. 2026, 02 h 58' });
export const DEPUIS_5 = Object.freeze({ ...DEPUIS_4, 'fleches-h1-v5': DEPUIS_H1_V5 });
export const NOMS_5 = Object.freeze({ ...NOMS_4, 'fleches-h1-v5': 'v5' });
const H = 3600e3;

/* sélection v5 des bandes (correction 2) à partir de toutes les bandes de niveauxPeriode (niveaux-periode-v1) */
export function selectionV5(N, ref, { RN = REGLES_NIVEAUX, R = REGLES_NIVEAUX_H1_V5 } = {}) {
  if (!N || !N.a || !N.toutes) return [];
  const sp = RN.espacementAtr * N.a, pris = [], cote = b => (b.p > ref ? 'resistance' : 'support');
  for (const b of N.toutes.slice().sort((x, y) => (y.extreme - x.extreme) || (y.importance - x.importance))) {
    const g = pris.find(q => b.bas - q.haut < sp && q.bas - b.haut < sp);   // fusion bord à bord à moins de 1 ATR (comme niveaux-periode-v1)
    if (g) { g.touches += b.touches; g.importance += b.importance; g.niveaux += b.niveaux; g.extreme = g.extreme || b.extreme; g.tDerniere = Math.max(g.tDerniere, b.tDerniere); continue; }
    pris.push({ ...b });
  }
  const gardes = pris.filter(q => q.touches >= R.touchesMin || q.extreme), out = [];
  for (const c of ['resistance', 'support']) {
    const L = gardes.filter(q => cote(q) === c).sort((x, y) => (y.extreme - x.extreme) || (y.importance - x.importance)).slice(0, R.parCote);
    const fortes = new Set(L.slice().sort((x, y) => y.importance - x.importance).slice(0, R.forts));
    for (const b of L) out.push({ ...b, cote: c, fort: fortes.has(b), texte: `${c === 'resistance' ? 'Résistance' : 'Support'} ${fourchette(b.bas, b.haut)} · ${pluriel(b.touches, 'touche')}`,
      detail: [`${pluriel(b.niveaux, 'niveau regroupé', 'niveaux regroupés')}, ${pluriel(b.touches, 'touche')} (pivots H1 sur ${RN.fenetreJours.H1} jours ; affichée : au moins ${R.touchesMin} touches)`, `dernière touche : ${new Date(b.tDerniere).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`, b.extreme ? 'plus haut ou plus bas majeur de l’historique visible' : null, `règles ${R.version}`].filter(Boolean) });
  }
  return out.sort((x, y) => y.p - x.p);
}
/* niveaux connus avant la bougie i, calculés UNE fois : la liste détaillée de v4 (= listesAvant de v2 pour bas, haut, type, texte ;
   lue par v2, v3, v4) et la liste AFFICHÉE de v5 (bandes niveaux-h1-v5 + mêmes zones de liquidité) */
const versListe = (bandes, zones) => [...bandes.map(b => ({ bas: b.bas, haut: b.haut, type: b.cote === 'resistance' ? 'résistance' : 'support', texte: b.texte, touches: b.touches, fort: b.fort })),
  ...zones.map(z => ({ bas: z.p, haut: z.p, type: z.sorte === 'haute' ? 'liquidité haute' : 'liquidité basse', texte: z.texte, raisons: z.raisons }))];
export function listesDeux(C, i, R = REGLES_H1_V5) {
  const Cs = C.slice(Math.max(0, i - R.fenetreListe), i), ref = C[i - 1].c, N = niveauxPeriode(Cs, { periode: 'H1', maintenant: C[i].t, prix: ref });
  if (!N.a) return { detail: [], v5: [] };
  const L = liquidite(Cs, { periode: 'H1', maintenant: C[i].t, prix: ref, a: N.a, pivotsL: N.pivots, i0: N.i0 });
  return { detail: versListe(N.bandes, L.zones), v5: versListe(selectionV5(N, ref), L.zones) };
}
export const listesV5 = (C, i, R) => listesDeux(C, i, R).v5;

const dist = (x, L) => x < L.bas ? L.bas - x : x > L.haut ? x - L.haut : 0;
const volumesDe = (C, volumes) => C.map(b => { const x = volumes && volumes.get(b.t); return x != null ? x : b.v; });
/* rejet (copie fidèle de v2) ; « seul » restreint le sens et les types de niveaux (correction 1) */
function rejet(C, i, a, niv, R, seul = null) {
  const b = C[i], av = C[i - 1], e = b.h - b.l, tol = R.listeAtr * a, ec = R.ecartAtr * a;
  const mecheH = b.h - Math.max(b.o, b.c), mecheB = Math.min(b.o, b.c) - b.l;
  let best = null;
  for (const L of niv) {
    if (L.type !== 'liquidité basse' && mecheH >= R.meche * e && (!seul || (seul === 'baisse' && R.niveauxBaisse.includes(L.type)))) {
      const x = dist(b.h, L) <= dist(av.h, L) ? b.h : av.h, d = dist(x, L), ref = Math.min(Math.max(x, L.bas), L.haut);
      if (d <= tol && b.c <= ref - ec && (!best || d < best.d)) best = { d, sens: 'baisse', niveau: ref, type: L.type, L };
    }
    if (L.type !== 'liquidité haute' && mecheB >= R.meche * e && (!seul || (seul === 'hausse' && R.niveauxHausse.includes(L.type)))) {
      const x = dist(b.l, L) <= dist(av.l, L) ? b.l : av.l, d = dist(x, L), ref = Math.min(Math.max(x, L.bas), L.haut);
      if (d <= tol && b.c >= ref + ec && (!best || d < best.d)) best = { d, sens: 'hausse', niveau: ref, type: L.type, L };
    }
  }
  return best;
}
function candidate(C, V, A, i, R) {
  const a = A[i - 1], b = C[i], e = b.h - b.l; if (!a || !(e > 0)) return false;
  const med = mediane(V.slice(i - R.volumeMedianeN, i)); if (!(V[i] >= med)) return false;
  return b.h - Math.max(b.o, b.c) >= R.meche * e || Math.min(b.o, b.c) - b.l >= R.meche * e ? med : false;
}
/* FLÈCHES H1 v5, strictement causales. listes : (C, i) → niveaux AFFICHÉS (v5) avant i. trace facultative (ne change pas le résultat). */
export function flechesH1v5(B, { maintenant = Date.now(), volumes = null, R = REGLES_H1_V5, listes = listesV5, trace = null } = {}) {
  const C = closes(B, H, maintenant), n = C.length, k = R.pivotK, out = [];
  if (n < 60) return out;
  const A = atrLocal(C, 14), V = volumesDe(C, volumes), REG = regimes(C), T = trace;
  const pv = pivots(C, k, 0, n - 1), creux = pv.filter(p => p.sorte === 'creux'), sommets = pv.filter(p => p.sorte === 'sommet');
  const dernierRejet = { hausse: -1, baisse: -1 }, approches = [];
  const confirme = (L, r, i, plusHaut) => { for (let j = 0; j < L.length && L[j].i + k <= i; j++) { if (L[j].i <= r || j === 0) continue; if (plusHaut ? L[j].p > L[j - 1].p : L[j].p < L[j - 1].p) return true; } return false; };
  for (let i = Math.max(R.volumeMedianeN + 1, 59); i < n; i++) {
    const a = A[i - 1], b = C[i];
    for (const x of approches) if (!x.finie && i > x.i && Math.abs(b.c - x.niveau) >= R.approcheSortieAtr * (A[i] || a)) x.finie = true;
    const med = candidate(C, V, A, i, R); if (med === false) continue;
    const niv = listes(C, i, R), libre = rejet(C, i, a, niv, R), seul = R.sensParRegime[REG[i]] || null, rj = seul ? rejet(C, i, a, niv, R, seul) : null;
    if (!libre && !rj) { if (T) T({ i, t: b.t, etape: 'B', regime: REG[i] }); continue; }
    // règle A d'origine (v2) : tout rejet compte, dans les deux sens, qu'une flèche soit posée ou non
    const sens = rj ? rj.sens : null, rAutre = sens ? dernierRejet[sens === 'hausse' ? 'baisse' : 'hausse'] : -1;
    if (libre) dernierRejet[libre.sens] = i; if (rj) dernierRejet[rj.sens] = i;
    if (!rj) { if (T) T({ i, t: b.t, etape: REG[i] === 'range' || REG[i] === 'inconnu' ? 'C-range' : 'sens', regime: REG[i], rejet: libre && { sens: libre.sens, type: libre.type, niveau: libre.niveau } }); continue; }   // correction 1
    if (rAutre >= 0 && !confirme(sens === 'hausse' ? creux : sommets, rAutre, i, sens === 'hausse')) { if (T) T({ i, t: b.t, etape: 'A', sens, regime: REG[i] }); continue; }
    const autre = sens === 'hausse' ? 'baisse' : 'hausse';
    if (out.some(f => f.sens === autre && i - f.i < R.opposeeBougies)) { if (T) T({ i, t: b.t, etape: 'C-opposee', sens }); continue; }
    if (approches.some(x => !x.finie && Math.abs(x.niveau - rj.niveau) < R.memeNiveauAtr * a)) { if (T) T({ i, t: b.t, etape: 'C-approche', sens }); continue; }
    const f = { t: b.t, i, sens, niveau: rj.niveau, type: rj.type, touches: rj.L.touches ?? null, raisons: rj.L.raisons || null, regime: REG[i], atr: a, volume: V[i], mediane: med, version: R.version };
    out.push(f); approches.push({ i, niveau: rj.niveau, finie: false });
    if (T) T({ i, t: b.t, etape: 'posee', sens, type: f.type, regime: f.regime });
  }
  return out;
}

/* bilans de TOUTES les versions suivies (v1 à v5), chacune depuis le commit de sa règle ; Holm sur 5 versions */
export function bilans5(B, parVersion, { maintenant = Date.now(), spread = null } = {}) {
  const vs = Object.keys(DEPUIS_5), out = {};
  for (const v of vs) { if (!parVersion[v]) continue; const d = DEPUIS_5[v], b = bilanH1(B, parVersion[v], { maintenant, depuis: d.t, spread, version: v });
    out[v] = { ...b, commit: d.commit, depuisTexte: d.texte, texte: b.texte.replace(DEPUIS_H1_V2.texte, d.texte) }; }
  const ps = vs.map(v => { const b = out[v]; return b && b.assez && b.hasard ? deuxProportions(Math.round(b.reussite * b.mesurees), b.mesurees, Math.round(b.hasard.reussite * b.hasard.tirages), b.hasard.tirages) : null; });
  const adj = holm(ps), m = vs.filter(v => out[v]).length;
  vs.forEach((v, k) => { const b = out[v]; if (!b) return; b.p = ps[k]; b.pHolm = adj[k]; if (b.assez) b.texte = b.texte.replace(' Aucune décision avant', ` Écart au hasard : p corrigée (Holm, ${m} versions suivies) ${adj[k] == null ? '—' : adj[k].toFixed(3).replace('.', ',')}. Aucune décision avant`); });
  return out;
}
