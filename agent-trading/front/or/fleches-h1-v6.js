/* ═════════════ FLÈCHES H1, VERSION 6, ET NIVEAUX H1 AFFICHÉS v6 (pur, testé) ═════════════
   Règles FIGÉES « fleches-h1-v6 » et « niveaux-h1-v6 », écrites le 2026-11-08 AVANT le code et tout test, dans leur propre commit
   (la date de ce commit ouvre le bilan de v6). v6 = fleches-h1-v5 + deux ajouts. Seuils repris de v5 / v2 ; les seuils nouveaux viennent
   de la consigne (0,5 ATR, 6 bougies) ou sont fixés ici une fois pour toutes (2 niveaux retournés par côté). Aucun seuil réglé d'après ce
   qui a été vu sur les graphiques. v1 à v5 restent intactes et calculées en parallèle. Informations de lecture, jamais un ordre. */

export const REGLES_NIVEAUX_H1_V6 = Object.freeze({
  version: 'niveaux-h1-v6', base: 'niveaux-h1-v5', periode: 'H1',
  casseAtr: 0.5,          // un niveau est cassé par une clôture à au moins 0,5 ATR au-delà
  retournesParCote: 2     // niveaux retournés ajoutés à l'affichage : au plus 2 de chaque côté, les plus proches du prix (en plus des 6)
});

export const REGLES_H1_V6 = Object.freeze({
  version: 'fleches-h1-v6', periode: 'H1', ecrites: '2026-11-08', base: 'fleches-h1-v5', niveaux: REGLES_NIVEAUX_H1_V6.version,
  // repris de v5 (inchangés)
  ecartAtr: 0.15, meche: 0.5, volumeMedianeN: 20, pivotK: 3, listeAtr: 0.25, fenetreListe: 1600,
  opposeeBougies: 8, approcheSortieAtr: 1, memeNiveauAtr: 0.5,
  suiviBougies: 8, suiviAtr: 1, regroupementBougies: 8, hasard: 1000, minFleches: 30, decision: 100, fraisTaker: 0.0005,
  sensParRegime: Object.freeze({ haussier: 'hausse', baissier: 'baisse' }),
  niveauxHausse: Object.freeze(['support', 'liquidité basse']), niveauxBaisse: Object.freeze(['résistance', 'liquidité haute']),
  // ajout 1 : rebond confirmé (exception au sens aligné)
  confirmationBougies: 6, confirmationAtr: 0.5
});

export const TEXTE_REGLES_H1_V6 = `Règles figées ${REGLES_H1_V6.version} et ${REGLES_NIVEAUX_H1_V6.version} (écrites le ${REGLES_H1_V6.ecrites}, avant le code et tout test, dans leur propre commit ; = fleches-h1-v5 + deux ajouts) :
- tout v5 est repris tel quel : flèche de rejet dans le sens du régime H1 (haussier → verte sur support / liquidité basse, baissier → rouge sur résistance / liquidité haute), rien en régime « range », seulement sur un niveau affiché à au plus 0,25 ATR, seuils de rejet de v2 (clôture à ≥ 0,15 ATR du bon côté, mèche ≥ la moitié, volume ≥ la médiane des 20), règle A d'origine, une flèche par approche, aucune flèche opposée à moins de 8 bougies, posée à la clôture, jamais redessinée ;
- ajout 1, rebond confirmé (seule exception au sens aligné) : une bougie TOUCHE un niveau affiché (son plus bas à au plus 0,25 ATR d'un support ou d'une liquidité basse affichés pour une verte ; son plus haut d'une résistance ou d'une liquidité haute affichées pour une rouge ; ATR de la bougie d'avant) ; si, dans les 6 bougies qui suivent, une bougie CLÔTURE à au moins 0,5 ATR du bon côté du niveau (au-dessus pour une verte, au-dessous pour une rouge) sans qu'aucune bougie entre-temps (elle comprise) ne fasse un plus bas sous celui de la touche (verte) ou un plus haut au-dessus (rouge), une flèche contre le régime est posée à la clôture de cette bougie de confirmation, jamais déplacée ensuite ; seulement si le régime H1 de cette bougie est contraire à la flèche (baissier pour une verte, haussier pour une rouge ; jamais en range) ; une chute qui perce les niveaux l'un après l'autre fait de nouveaux plus bas et ne donne donc aucune verte ; une seule flèche par niveau et par approche, aucune flèche opposée à moins de 8 bougies (règles de v5) ; la règle A de v2 ne s'applique pas à ce cas (le « pas de nouveau plus bas / plus haut » la remplace) ; la bougie de touche n'a pas de condition de mèche ni de volume (la confirmation à la clôture la remplace) ;
- ajout 2, niveaux retournés (${REGLES_NIVEAUX_H1_V6.version}) : parmi les bandes de niveaux-h1-v5 (même calcul, fusion à moins de 1 ATR), une bande dépassée par une CLÔTURE à au moins 0,5 ATR au-delà (au-dessus pour une résistance, au-dessous pour un support), après sa dernière touche et alors que le prix était de l'autre côté, est « retournée » : tant que le prix reste du nouveau côté, l'ancienne résistance est affichée comme support (« ancienne résistance ») et l'ancien support comme résistance (« ancien support ») ; une bande retournée déjà affichée garde sa place avec cette mention ; sinon elle est ajoutée, au plus 2 de chaque côté, les plus proches du prix, en plus des 6 ; ces niveaux sont utilisés par les flèches v6 comme tous les niveaux affichés ;
- bilan depuis la date du commit de ces règles, mêmes mesures que v2 / v5 (flèches indépendantes à 8 bougies, +1 ATR avant −1 ATR en 8 bougies comptées depuis la bougie de la flèche, R net après frais preneur 0,05 % par côté et spread mesuré, 1000 tirages au hasard même régime et mêmes heures, « pas assez de données » sous 30) ; correction de Holm sur toutes les versions suivies (v1 à v6) ; aucune décision avant 100 flèches indépendantes nouvelles.`;

/* ───────────── calcul (ajouté après le commit des règles 38e4b7b ; aucune règle ci-dessus n'a changé) ───────────── */
import { mediane } from './bougies-or.js';
import { closes, pivots, atrLocal, niveauxPeriode, liquidite, fourchette, REGLES_NIVEAUX } from './niveaux-periode.js';
import { regimes, bilanH1, DEPUIS_H1_V2 } from './fleches-h1-v2.js';
import { selectionV5, DEPUIS_5, NOMS_5 } from './fleches-h1-v5.js';
import { deuxProportions, holm } from './zones-or.js';
import { pluriel } from './texte-or.js';

/* date du commit des règles v6 (38e4b7b, 2026-11-08 03:18:03 heure de Paris) : début du bilan de v6 */
export const DEPUIS_H1_V6 = Object.freeze({ commit: '38e4b7b', t: 1794104283000, texte: '8 nov. 2026, 03 h 18' });
export const DEPUIS_6 = Object.freeze({ ...DEPUIS_5, 'fleches-h1-v6': DEPUIS_H1_V6 });
export const NOMS_6 = Object.freeze({ ...NOMS_5, 'fleches-h1-v6': 'v6' });
const H = 3600e3;

/* bandes fusionnées à moins de 1 ATR (même algorithme que selectionV5, avant le filtre des touches) */
function fusion(N, RN = REGLES_NIVEAUX) {
  const sp = RN.espacementAtr * N.a, pris = [];
  for (const b of N.toutes.slice().sort((x, y) => (y.extreme - x.extreme) || (y.importance - x.importance))) {
    const g = pris.find(q => b.bas - q.haut < sp && q.bas - b.haut < sp);
    if (g) { g.touches += b.touches; g.importance += b.importance; g.niveaux += b.niveaux; g.extreme = g.extreme || b.extreme; g.tDerniere = Math.max(g.tDerniere, b.tDerniere); continue; }
    pris.push({ ...b });
  }
  return pris;
}
/* bande retournée ? (ajout 2) : après sa dernière touche, le prix était d'un côté puis une CLÔTURE à ≥ 0,5 ATR l'a dépassée de l'autre ;
   le dernier franchissement décide ; retournée tant que le prix (ref) reste du nouveau côté. → 'ancienne résistance' | 'ancien support' | null */
export function retournement(q, Cs, a, ref, R = REGLES_NIVEAUX_H1_V6) {
  let dessous = false, dessus = false, dernier = null; const marge = R.casseAtr * a;
  for (let m = 0; m < Cs.length; m++) { if (Cs[m].t <= q.tDerniere) continue; const c = Cs[m].c;
    if (dessous && c >= q.haut + marge) { dernier = 'haut'; dessous = false; }
    else if (dessus && c <= q.bas - marge) { dernier = 'bas'; dessus = false; }
    if (c <= q.haut) dessous = true; if (c >= q.bas) dessus = true; }
  if (dernier === 'haut' && ref > q.haut) return 'ancienne résistance';
  if (dernier === 'bas' && ref < q.bas) return 'ancien support';
  return null;
}
const texteBande = (b, cote, mention) => `${cote === 'resistance' ? 'Résistance' : 'Support'} ${fourchette(b.bas, b.haut)} · ${pluriel(b.touches, 'touche')}${mention ? ' · ' + mention : ''}`;
/* sélection v6 : bandes v5 (avec la mention si elles sont retournées) + au plus 2 bandes retournées de chaque côté en plus */
export function selectionV6(N, ref, Cs, { R = REGLES_NIVEAUX_H1_V6 } = {}) {
  if (!N || !N.a || !N.toutes) return [];
  const S5 = selectionV5(N, ref), pris = fusion(N), cle = b => b.bas.toFixed(6) + '|' + b.haut.toFixed(6);
  const ret = new Map(); for (const q of pris) { const m = retournement(q, Cs, N.a, ref, R); if (m) ret.set(cle(q), m); }
  const out = S5.map(b => { const m = ret.get(cle(b)); return m ? { ...b, retourne: m, texte: texteBande(b, b.cote, m), detail: [...b.detail, `${m} : cassée par une clôture à au moins ${String(R.casseAtr).replace('.', ',')} ATR au-delà (${R.version})`] } : b; });
  const dans = new Set(S5.map(cle));
  for (const c of ['resistance', 'support']) {
    const L = pris.filter(q => ret.has(cle(q)) && !dans.has(cle(q)) && (q.p > ref ? 'resistance' : 'support') === c).sort((x, y) => Math.abs(x.p - ref) - Math.abs(y.p - ref)).slice(0, R.retournesParCote);
    for (const q of L) { const m = ret.get(cle(q)); out.push({ ...q, cote: c, fort: false, retourne: m, texte: texteBande(q, c, m),
      detail: [`${pluriel(q.niveaux, 'niveau regroupé', 'niveaux regroupés')}, ${pluriel(q.touches, 'touche')} (pivots H1)`, `${m} : cassée par une clôture à au moins ${String(R.casseAtr).replace('.', ',')} ATR au-delà, affichée comme ${c === 'support' ? 'support' : 'résistance'} tant que le prix reste de ce côté (${R.version})`] }); }
  }
  return out.sort((x, y) => y.p - x.p);
}
const versListe = (bandes, zones) => [...bandes.map(b => ({ bas: b.bas, haut: b.haut, type: b.cote === 'resistance' ? 'résistance' : 'support', texte: b.texte, touches: b.touches, fort: b.fort, ...(b.retourne ? { retourne: b.retourne } : {}) })),
  ...zones.map(z => ({ bas: z.p, haut: z.p, type: z.sorte === 'haute' ? 'liquidité haute' : 'liquidité basse', texte: z.texte, raisons: z.raisons }))];
/* niveaux connus avant la bougie i, calculés UNE fois : liste détaillée (v2, v3, v4), liste affichée v5, liste affichée v6 */
export function listesTrois(C, i, R = REGLES_H1_V6) {
  const Cs = C.slice(Math.max(0, i - R.fenetreListe), i), ref = C[i - 1].c, N = niveauxPeriode(Cs, { periode: 'H1', maintenant: C[i].t, prix: ref });
  if (!N.a) return { detail: [], v5: [], v6: [] };
  const L = liquidite(Cs, { periode: 'H1', maintenant: C[i].t, prix: ref, a: N.a, pivotsL: N.pivots, i0: N.i0 });
  return { detail: versListe(N.bandes, L.zones), v5: versListe(selectionV5(N, ref), L.zones), v6: versListe(selectionV6(N, ref, Cs), L.zones) };
}
export const listesV6 = (C, i, R) => listesTrois(C, i, R).v6;

const dist = (x, L) => x < L.bas ? L.bas - x : x > L.haut ? x - L.haut : 0;
const volumesDe = (C, volumes) => C.map(b => { const x = volumes && volumes.get(b.t); return x != null ? x : b.v; });
/* rejet et filtre de v5 (copies fidèles ; vérifié par test : sans les deux ajouts, v6 = v5) */
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
/* filtre nécessaire (bon marché) d'une touche qui POURRAIT être confirmée (ajout 1) : sans lui la touche ne peut jamais donner de flèche,
   on évite donc d'y calculer les niveaux ; le résultat est identique avec ou sans ce filtre (le niveau est à ≤ 0,25 ATR de l'extrême) */
function touchePossible(C, A, REG, j, sens, R) {
  const a = A[j - 1]; if (!a) return false;
  const ext = sens === 'hausse' ? C[j].l : C[j].h, seuil = (R.confirmationAtr - R.listeAtr) * a, contraire = sens === 'hausse' ? 'baissier' : 'haussier';
  for (let k = j + 1; k <= j + R.confirmationBougies && k < C.length; k++) {
    if (sens === 'hausse' ? C[k].l < ext : C[k].h > ext) return false;
    if ((sens === 'hausse' ? C[k].c >= ext + seuil : C[k].c <= ext - seuil) && REG[k] === contraire) return true;
  }
  return false;
}
/* bougies où v6 a besoin des niveaux : candidates au rejet (comme v2 / v5) ∪ touches qui pourraient être confirmées */
export function indicesV6(B, { maintenant = Date.now(), volumes = null, R = REGLES_H1_V6 } = {}) {
  const C = closes(B, H, maintenant), n = C.length, o = []; if (n < 60) return { C, indices: o };
  const A = atrLocal(C, 14), V = volumesDe(C, volumes), REG = regimes(C);
  for (let i = Math.max(R.volumeMedianeN + 1, 59); i < n; i++) if (candidate(C, V, A, i, R) !== false || touchePossible(C, A, REG, i, 'hausse', R) || touchePossible(C, A, REG, i, 'baisse', R)) o.push(i);
  return { C, indices: o };
}

/* FLÈCHES H1 v6, strictement causales (une flèche de rebond confirmé est posée à la bougie de confirmation, avec les seules bougies jusqu'à elle).
   listes : (C, i) → niveaux AFFICHÉS v6 avant i. ajouts : false pour désactiver les deux ajouts (contrôle : v6 sans ajouts = v5). */
export function flechesH1v6(B, { maintenant = Date.now(), volumes = null, R = REGLES_H1_V6, listes = listesV6, trace = null, ajouts = true } = {}) {
  const C = closes(B, H, maintenant), n = C.length, k = R.pivotK, out = [];
  if (n < 60) return out;
  const A = atrLocal(C, 14), V = volumesDe(C, volumes), REG = regimes(C), T = trace;
  const pv = pivots(C, k, 0, n - 1), creux = pv.filter(p => p.sorte === 'creux'), sommets = pv.filter(p => p.sorte === 'sommet');
  const dernierRejet = { hausse: -1, baisse: -1 }, approches = [], attente = [];
  const confirme = (L, r, i, plusHaut) => { for (let j = 0; j < L.length && L[j].i + k <= i; j++) { if (L[j].i <= r || j === 0) continue; if (plusHaut ? L[j].p > L[j - 1].p : L[j].p < L[j - 1].p) return true; } return false; };
  const libreDe = (i, sens, niveau, a) => !out.some(f => f.sens !== sens && i - f.i < R.opposeeBougies) && !approches.some(x => !x.finie && Math.abs(x.niveau - niveau) < R.memeNiveauAtr * a);
  const poser = f => { out.push(f); approches.push({ i: f.i, niveau: f.niveau, finie: false }); if (T) T({ i: f.i, t: f.t, etape: 'posee', mode: f.mode, sens: f.sens, type: f.type, regime: f.regime, touche: f.touche }); };
  for (let i = Math.max(R.volumeMedianeN + 1, 59); i < n; i++) {
    const a = A[i - 1], b = C[i];
    for (const x of approches) if (!x.finie && i > x.i && Math.abs(b.c - x.niveau) >= R.approcheSortieAtr * (A[i] || a)) x.finie = true;
    let niv = null; const lst = () => (niv || (niv = listes(C, i, R)));
    // 1) v5 : rejet dans le sens du régime
    const med = candidate(C, V, A, i, R);
    if (med !== false) {
      const libre = rejet(C, i, a, lst(), R), seul = R.sensParRegime[REG[i]] || null, rj = seul ? rejet(C, i, a, lst(), R, seul) : null;
      if (libre || rj) {
        const sens = rj ? rj.sens : null, rAutre = sens ? dernierRejet[sens === 'hausse' ? 'baisse' : 'hausse'] : -1;
        if (libre) dernierRejet[libre.sens] = i; if (rj) dernierRejet[rj.sens] = i;
        if (rj && !(rAutre >= 0 && !confirme(sens === 'hausse' ? creux : sommets, rAutre, i, sens === 'hausse')) && libreDe(i, sens, rj.niveau, a))
          poser({ t: b.t, i, sens, niveau: rj.niveau, type: rj.type, touches: rj.L.touches ?? null, raisons: rj.L.raisons || null, retourne: rj.L.retourne || null, regime: REG[i], atr: a, volume: V[i], mediane: med, mode: 'rejet', version: R.version });
      }
    }
    if (!ajouts) continue;
    // 2) ajout 1 : confirmation des touches en attente (bougie i = bougie de confirmation éventuelle)
    for (let q = attente.length - 1; q >= 0; q--) {
      const x = attente[q];
      if (i - x.j > R.confirmationBougies || (x.sens === 'hausse' ? b.l < x.ext : b.h > x.ext)) { attente.splice(q, 1); continue; }
      const ok = x.sens === 'hausse' ? b.c >= x.niveau + R.confirmationAtr * x.a : b.c <= x.niveau - R.confirmationAtr * x.a;
      if (!ok) continue;
      attente.splice(q, 1);
      const contraire = x.sens === 'hausse' ? 'baissier' : 'haussier';
      if (REG[i] !== contraire) { if (T) T({ i, t: b.t, etape: 'confirmee-non-contraire', sens: x.sens, regime: REG[i], touche: x.j }); continue; }   // aligné ou range : pas cette exception
      if (!libreDe(i, x.sens, x.niveau, a)) { if (T) T({ i, t: b.t, etape: 'C', sens: x.sens, touche: x.j }); continue; }
      poser({ t: b.t, i, sens: x.sens, niveau: x.niveau, type: x.type, touches: x.touches, raisons: x.raisons, retourne: x.retourne, regime: REG[i], atr: x.a, mode: 'rebond confirmé', touche: x.j, tTouche: C[x.j].t, version: R.version });
    }
    // 3) ajout 1 : la bougie i touche-t-elle un niveau affiché ? (mise en attente, confirmation dans les 6 bougies suivantes)
    for (const sens of ['hausse', 'baisse']) {
      if (!touchePossible(C, A, REG, i, sens, R)) continue;
      const ext = sens === 'hausse' ? b.l : b.h, types = sens === 'hausse' ? R.niveauxHausse : R.niveauxBaisse; let best = null;
      for (const L of lst()) { if (!types.includes(L.type)) continue; const d = dist(ext, L); if (d <= R.listeAtr * a && (!best || d < best.d)) best = { d, L, niveau: Math.min(Math.max(ext, L.bas), L.haut) }; }
      if (best) attente.push({ j: i, sens, ext, a, niveau: best.niveau, type: best.L.type, touches: best.L.touches ?? null, raisons: best.L.raisons || null, retourne: best.L.retourne || null });
    }
  }
  return out.sort((x, y) => x.i - y.i);
}

/* bilans de toutes les versions suivies (v1 à v6), chacune depuis le commit de sa règle ; Holm sur toutes */
export function bilans6(B, parVersion, { maintenant = Date.now(), spread = null } = {}) {
  const vs = Object.keys(DEPUIS_6), out = {};
  for (const v of vs) { if (!parVersion[v]) continue; const d = DEPUIS_6[v], b = bilanH1(B, parVersion[v], { maintenant, depuis: d.t, spread, version: v });
    out[v] = { ...b, commit: d.commit, depuisTexte: d.texte, texte: b.texte.replace(DEPUIS_H1_V2.texte, d.texte) }; }
  const ps = vs.map(v => { const b = out[v]; return b && b.assez && b.hasard ? deuxProportions(Math.round(b.reussite * b.mesurees), b.mesurees, Math.round(b.hasard.reussite * b.hasard.tirages), b.hasard.tirages) : null; });
  const adj = holm(ps), m = vs.filter(v => out[v]).length;
  vs.forEach((v, k) => { const b = out[v]; if (!b) return; b.p = ps[k]; b.pHolm = adj[k]; if (b.assez) b.texte = b.texte.replace(' Aucune décision avant', ` Écart au hasard : p corrigée (Holm, ${m} versions suivies) ${adj[k] == null ? '—' : adj[k].toFixed(3).replace('.', ',')}. Aucune décision avant`); });
  return out;
}
