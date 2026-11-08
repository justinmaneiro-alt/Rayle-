/* ═════════════ FLÈCHES H1, VERSION 7 (pur, testé) ═════════════
   Règles FIGÉES « fleches-h1-v7 », écrites le 2026-11-08 AVANT le code et tout test, dans leur propre commit (la date de ce commit ouvre
   le bilan de v7). Les seuils viennent de la consigne (8 touches, 0,25 ATR, 1,5 ATR, 24 bougies) ; les autres sont repris de v2 / v6
   (ATR, régime, fusion des bandes, cassure à 0,5 ATR pour les niveaux retournés). Aucun seuil réglé d'après ce qui a été vu sur les
   graphiques. v1 à v6 restent intactes et calculées en parallèle. Informations de lecture du graphique, jamais un ordre. */

export const REGLES_H1_V7 = Object.freeze({
  version: 'fleches-h1-v7', periode: 'H1', ecrites: '2026-11-08',
  // 1. niveaux admis
  touchesMin: 8,                                   // supports / résistances (bandes fusionnées, niveaux retournés compris) : au moins 8 touches
  majeurs: Object.freeze(['semaine', 'mois']),     // plus haut / plus bas de la semaine et du mois précédents (heure de Paris)
  fenetreListe: 1600, casseAtr: 0.5,               // repris de v2 / niveaux-h1-v6
  // 2. rebond confirmé
  toucheAtr: 0.25, confirmationAtr: 1.5,
  // 3. et 4. alternance, espacement
  espacementBougies: 24,
  // bilan (repris de v2)
  suiviBougies: 8, suiviAtr: 1, regroupementBougies: 8, hasard: 1000, minFleches: 30, decision: 100, fraisTaker: 0.0005
});

export const TEXTE_REGLES_H1_V7 = `Règles figées ${REGLES_H1_V7.version} (écrites le ${REGLES_H1_V7.ecrites}, avant le code et tout test, dans leur propre commit) :
- ATR = moyenne simple des 14 dernières étendues vraies (comme v2), mesurée à la bougie qui précède la touche ; régime H1 = biais H1 (EMA 20 / 50), « range » si les moyennes sont mêlées ;
- 1. niveaux admis, connus avant chaque bougie (seules les bougies closes d'avant) : les bandes de supports / résistances (calcul niveaux-periode-v1, fusion à moins de 1 ATR comme niveaux-h1-v5 / v6) d'au moins 8 touches, sans limite de nombre, niveaux retournés compris (mention « ancienne résistance » / « ancien support », cassure par une clôture à ≥ 0,5 ATR comme niveaux-h1-v6) ; les plus hauts et plus bas de la semaine et du mois précédents (heure de Paris), même déjà dépassés ; aucun autre niveau (ni niveau secondaire, ni sommets / creux égaux, ni veille) ; un niveau sous la clôture précédente est un support, au-dessus une résistance ;
- 2. rebond confirmé : une bougie TOUCHE un support admis (son plus bas à au plus 0,25 ATR du niveau) ; dès qu'une bougie suivante CLÔTURE à au moins 1,5 ATR au-dessus du niveau sans qu'aucune bougie depuis la touche (elle comprise) n'ait fait un plus bas sous celui de la touche, une flèche verte est posée à cette clôture, jamais déplacée ensuite ; pas de délai maximal (l'attente s'arrête au premier nouveau plus bas) ; miroir pour une flèche rouge sur une résistance admise ; si plusieurs touches se confirment à la même bougie, la plus ancienne compte ;
- 3. alternance : après une verte, la suivante est rouge, et inversement ; une confirmation du même sens que la dernière flèche ne donne rien (elle est consommée) ;
- 4. au moins 24 bougies entre deux flèches v7 ; une confirmation plus proche ne donne rien (elle est consommée) ;
- 5. rien en régime H1 « range » (régime de la bougie de confirmation) ; hors range, le sens n'est pas filtré par la tendance ;
- affichage : pour chaque flèche, un segment horizontal sur son niveau déclencheur, de la bougie de touche à la bougie de confirmation (type, prix, touches) ; au survol : régime, distance de la touche au niveau, bougie de touche, bougie de confirmation ;
- bilan depuis la date du commit de ces règles, mêmes mesures que v2 (flèches indépendantes à 8 bougies, +1 ATR avant −1 ATR en 8 bougies, R net après frais preneur 0,05 % par côté et spread mesuré, 1000 tirages au hasard même régime et mêmes heures, « pas assez de données » sous 30) ; correction de Holm sur toutes les versions suivies (v1 à v7) ; aucune décision avant 100 flèches indépendantes nouvelles.`;

/* ───────────── calcul (ajouté après le commit des règles f9a9b5b ; aucune règle ci-dessus n'a changé) ───────────── */
import { closes, atrLocal, niveauxPeriode, liquidite, fourchette, REGLES_NIVEAUX } from './niveaux-periode.js';
import { regimes, bilanH1, DEPUIS_H1_V2 } from './fleches-h1-v2.js';
import { selectionV5 } from './fleches-h1-v5.js';
import { selectionV6, retournement, indicesV6, DEPUIS_6, NOMS_6 } from './fleches-h1-v6.js';
import { decalage } from './temps-or.js';
import { deuxProportions, holm } from './zones-or.js';
import { pluriel } from './texte-or.js';

/* date du commit des règles v7 (f9a9b5b, 2026-11-08 10:38:27 heure de Paris) : début du bilan de v7 */
export const DEPUIS_H1_V7 = Object.freeze({ commit: 'f9a9b5b', t: 1794130707000, texte: '8 nov. 2026, 10 h 38' });
export const DEPUIS_7 = Object.freeze({ ...DEPUIS_6, 'fleches-h1-v7': DEPUIS_H1_V7 });
export const NOMS_7 = Object.freeze({ ...NOMS_6, 'fleches-h1-v7': 'v7' });
const H = 3600e3;

/* bandes fusionnées à moins de 1 ATR (même algorithme que niveaux-h1-v5 / v6) */
function fusion(N, RN = REGLES_NIVEAUX) {
  const sp = RN.espacementAtr * N.a, pris = [];
  for (const b of N.toutes.slice().sort((x, y) => (y.extreme - x.extreme) || (y.importance - x.importance))) {
    const g = pris.find(q => b.bas - q.haut < sp && q.bas - b.haut < sp);
    if (g) { g.touches += b.touches; g.importance += b.importance; g.niveaux += b.niveaux; g.extreme = g.extreme || b.extreme; g.tDerniere = Math.max(g.tDerniere, b.tDerniere); continue; }
    pris.push({ ...b });
  }
  return pris;
}
/* bandes admises par v7 (règle 1) : au moins 8 touches, typées par leur position (niveaux retournés compris, avec leur mention) */
export function bandesV7(N, ref, Cs, R = REGLES_H1_V7) {
  if (!N || !N.a || !N.toutes) return [];
  return fusion(N).filter(q => q.touches >= R.touchesMin).map(q => {
    const type = q.p > ref ? 'résistance' : 'support', m = retournement(q, Cs, N.a, ref, { casseAtr: R.casseAtr });
    return { bas: q.bas, haut: q.haut, p: q.p, type, touches: q.touches, source: 'bande', ...(m ? { retourne: m } : {}),
      libelle: `${type === 'support' ? 'Support' : 'Résistance'} ${fourchette(q.bas, q.haut)} · ${pluriel(q.touches, 'touche')}${m ? ' · ' + m : ''}` };
  });
}
const versListe = (bandes, zones) => [...bandes.map(b => ({ bas: b.bas, haut: b.haut, type: b.cote === 'resistance' ? 'résistance' : 'support', texte: b.texte, touches: b.touches, fort: b.fort, ...(b.retourne ? { retourne: b.retourne } : {}) })),
  ...zones.map(z => ({ bas: z.p, haut: z.p, type: z.sorte === 'haute' ? 'liquidité haute' : 'liquidité basse', texte: z.texte, raisons: z.raisons }))];
/* niveaux connus avant la bougie i, calculés UNE fois pour v2 à v7 : détail (v2–v4), affichés v5, affichés v6 (= listesTrois de v6, vérifié), bandes v7 */
export function listesQuatre(C, i, R = REGLES_H1_V7) {
  const Cs = C.slice(Math.max(0, i - R.fenetreListe), i), ref = C[i - 1].c, N = niveauxPeriode(Cs, { periode: 'H1', maintenant: C[i].t, prix: ref });
  if (!N.a) return { detail: [], v5: [], v6: [], v7: [] };
  const L = liquidite(Cs, { periode: 'H1', maintenant: C[i].t, prix: ref, a: N.a, pivotsL: N.pivots, i0: N.i0 });
  return { detail: versListe(N.bandes, L.zones), v5: versListe(selectionV5(N, ref), L.zones), v6: versListe(selectionV6(N, ref, Cs), L.zones), v7: bandesV7(N, ref, Cs, R) };
}
export const listesV7 = (C, i, R) => listesQuatre(C, i, R).v7;
/* même liste v7 sans calculer la liquidité (bougies dont seule v7 a besoin) : identique à listesQuatre(...).v7 (vérifié par test) */
export function listesV7Seule(C, i, R = REGLES_H1_V7) {
  const Cs = C.slice(Math.max(0, i - R.fenetreListe), i), ref = C[i - 1].c, N = niveauxPeriode(Cs, { periode: 'H1', maintenant: C[i].t, prix: ref });
  return N.a ? bandesV7(N, ref, Cs, R) : [];
}

/* plus hauts / plus bas de la semaine et du mois PRÉCÉDENTS, connus avant chaque bougie (heure de Paris ; groupe incomplet du début ignoré) */
const cacheDec = new Map();
function cles(t) { const k = Math.floor(t / H); let d = cacheDec.get(k); if (d == null) { d = decalage(t); if (cacheDec.size > 50000) cacheDec.clear(); cacheDec.set(k, d); }
  const x = new Date(t + d), j = x.getUTCDay(), l = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate() - ((j + 6) % 7)));
  return { semaine: l.toISOString().slice(0, 10), mois: x.toISOString().slice(0, 7) }; }
export function majeursAvant(C) {
  const out = new Array(C.length).fill(null), acc = { semaine: null, mois: null }, prec = { semaine: null, mois: null };
  for (let i = 1; i < C.length; i++) {
    const b = C[i - 1], K = cles(b.t);
    for (const g of ['semaine', 'mois']) {
      if (!acc[g] || acc[g].cle !== K[g]) { if (acc[g] && acc[g].complet) prec[g] = { h: acc[g].h, l: acc[g].l }; acc[g] = { cle: K[g], h: b.h, l: b.l, complet: i - 1 > 0 }; }
      else { acc[g].h = Math.max(acc[g].h, b.h); acc[g].l = Math.min(acc[g].l, b.l); }
    }
    const L = []; const nom = { semaine: 'de la semaine dernière', mois: 'du mois dernier' };
    for (const g of ['semaine', 'mois']) if (prec[g]) L.push({ p: prec[g].h, quoi: `plus haut ${nom[g]}` }, { p: prec[g].l, quoi: `plus bas ${nom[g]}` });
    out[i] = L;
  }
  return out;
}
/* filtre nécessaire (bon marché) d'une touche qui POURRAIT être confirmée : identique avec ou sans lui (le niveau est à ≤ 0,25 ATR de l'extrême) */
function touchePossible(C, A, REG, j, sens, R) {
  const a = A[j - 1]; if (!a) return false;
  const ext = sens === 'hausse' ? C[j].l : C[j].h, seuil = (R.confirmationAtr - R.toucheAtr) * a;
  for (let k = j + 1; k < C.length; k++) {
    if (sens === 'hausse' ? C[k].l < ext : C[k].h > ext) return false;
    if ((sens === 'hausse' ? C[k].c >= ext + seuil : C[k].c <= ext - seuil) && REG[k] !== 'range' && REG[k] !== 'inconnu') return true;
  }
  return false;
}
/* bougies où v7 a besoin des bandes : les touches qui pourraient être confirmées */
export function indicesV7(B, { maintenant = Date.now(), R = REGLES_H1_V7 } = {}) {
  const C = closes(B, H, maintenant), n = C.length, o = []; if (n < 60) return { C, indices: o };
  const A = atrLocal(C, 14), REG = regimes(C);
  for (let i = 59; i < n; i++) if (touchePossible(C, A, REG, i, 'hausse', R) || touchePossible(C, A, REG, i, 'baisse', R)) o.push(i);
  return { C, indices: o };
}
/* indices de v6 ∪ v7 : toutes les bougies où une version lit les niveaux */
export function indicesV6V7(B, o = {}) { const a = indicesV6(B, o), b = indicesV7(B, o); return { C: a.C, indices: [...new Set([...a.indices, ...b.indices])].sort((x, y) => x - y) }; }

const dist = (x, L) => x < L.bas ? L.bas - x : x > L.haut ? x - L.haut : 0;
/* FLÈCHES H1 v7, strictement causales (flèche posée à la bougie de confirmation, avec les seules bougies jusqu'à elle).
   listes : (C, i) → bandes admises v7 avant i (listesV7). trace facultative (ne change pas le résultat). */
export function flechesH1v7(B, { maintenant = Date.now(), R = REGLES_H1_V7, listes = listesV7, trace = null } = {}) {
  const C = closes(B, H, maintenant), n = C.length, out = [];
  if (n < 60) return out;
  const A = atrLocal(C, 14), REG = regimes(C), MAJ = majeursAvant(C), T = trace, attente = [];
  for (let i = 59; i < n; i++) {
    const b = C[i];
    // 2) confirmations à la bougie i (la plus ancienne touche confirmée compte ; les autres sont consommées)
    let conf = null;
    for (let q = 0; q < attente.length; q++) {
      const x = attente[q];
      if (x.sens === 'hausse' ? b.l < x.ext : b.h > x.ext) { attente.splice(q--, 1); continue; }
      if (x.sens === 'hausse' ? b.c >= x.niveau + R.confirmationAtr * x.a : b.c <= x.niveau - R.confirmationAtr * x.a) { attente.splice(q--, 1); if (!conf) conf = x; }
    }
    if (conf) {
      const der = out[out.length - 1], raison = REG[i] === 'range' || REG[i] === 'inconnu' ? 'range' : der && der.sens === conf.sens ? 'alternance' : der && i - der.i < R.espacementBougies ? 'espacement' : null;
      if (raison) { if (T) T({ i, t: b.t, etape: raison, sens: conf.sens, touche: conf.j, regime: REG[i] }); }
      else { const f = { t: b.t, i, sens: conf.sens, niveau: conf.niveau, type: conf.type, touches: conf.touches, retourne: conf.retourne || null, source: conf.source, libelle: conf.libelle ?? `${conf.type === 'résistance' ? 'Résistance' : 'Support'} ${fourchette(conf.pMaj, conf.pMaj)} · ${conf.quoi}`, regime: REG[i], atr: conf.a, distance: conf.d / conf.a, touche: conf.j, tTouche: C[conf.j].t, mode: 'rebond confirmé', version: R.version };
        out.push(f); if (T) T({ i, t: b.t, etape: 'posee', sens: f.sens, touche: f.touche }); }
    }
    // 1) la bougie i touche-t-elle un niveau admis ? (support pour une verte, résistance pour une rouge ; position par rapport à la clôture précédente)
    const a = A[i - 1], ref = C[i - 1].c; if (!a) continue;
    for (const sens of ['hausse', 'baisse']) {
      if (!touchePossible(C, A, REG, i, sens, R)) continue;
      const ext = sens === 'hausse' ? b.l : b.h, type = sens === 'hausse' ? 'support' : 'résistance';
      const niv = [...listes(C, i, R), ...(MAJ[i] || []).map(m => ({ bas: m.p, haut: m.p, p: m.p, type: m.p > ref ? 'résistance' : 'support', touches: null, source: 'majeur', quoi: m.quoi, libelle: null }))];   // étiquette mise en forme à la pose
      let best = null;
      for (const L of niv) { if (L.type !== type) continue; const d = dist(ext, L); if (d <= R.toucheAtr * a && (!best || d < best.d)) best = { d, L }; }
      if (best) attente.push({ j: i, sens, ext, a, d: best.d, niveau: Math.min(Math.max(ext, best.L.bas), best.L.haut), type, touches: best.L.touches, retourne: best.L.retourne, source: best.L.source, libelle: best.L.libelle, quoi: best.L.quoi || null, pMaj: best.L.p });
    }
  }
  return out;
}
/* segments des flèches v7 (affichage) : de la bougie de touche à la bougie de confirmation, sur le niveau déclencheur */
export const segmentsV7 = F => F.filter(f => f.version === 'fleches-h1-v7').map(f => ({ t0: f.tTouche, t1: f.t, p: f.niveau, sens: f.sens, libelle: f.libelle, regime: f.regime, distance: f.distance, tTouche: f.tTouche, tConfirmation: f.t }));

/* bilans de toutes les versions suivies (v1 à v7), chacune depuis le commit de sa règle ; Holm sur toutes */
export function bilans7(B, parVersion, { maintenant = Date.now(), spread = null } = {}) {
  const vs = Object.keys(DEPUIS_7), out = {};
  for (const v of vs) { if (!parVersion[v]) continue; const d = DEPUIS_7[v], b = bilanH1(B, parVersion[v], { maintenant, depuis: d.t, spread, version: v });
    out[v] = { ...b, commit: d.commit, depuisTexte: d.texte, texte: b.texte.replace(DEPUIS_H1_V2.texte, d.texte) }; }
  const ps = vs.map(v => { const b = out[v]; return b && b.assez && b.hasard ? deuxProportions(Math.round(b.reussite * b.mesurees), b.mesurees, Math.round(b.hasard.reussite * b.hasard.tirages), b.hasard.tirages) : null; });
  const adj = holm(ps), m = vs.filter(v => out[v]).length;
  vs.forEach((v, k) => { const b = out[v]; if (!b) return; b.p = ps[k]; b.pHolm = adj[k]; if (b.assez) b.texte = b.texte.replace(' Aucune décision avant', ` Écart au hasard : p corrigée (Holm, ${m} versions suivies) ${adj[k] == null ? '—' : adj[k].toFixed(3).replace('.', ',')}. Aucune décision avant`); });
  return out;
}
