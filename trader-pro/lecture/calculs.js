/* ═════════════ MOTEUR DE LECTURE : CALCULS PURS (faits calculés par le code, jamais par l'IA) ═════════════
   Entrées : bougies { t (ms, ouverture), o, h, l, c, v }. Toute décision n'utilise QUE des bougies CLÔTURÉES (t + pas ≤ maintenant) : jamais de bougie en formation, jamais de regard vers l'avenir.
   Rien n'est inventé : sans volume fiable, la lecture du volume est « indisponible » ; sans assez de bougies, la tendance est « indisponible ». Lecture seule : aucun ordre. */
import { sma, atr as atrSerie, niveauxCles } from '../commun/analyse.js';
import { creerCalcul, indicesClasses, similaires, suite, zones as zonesVolume, NOM_CONTEXTE, SEUIL_DEFAUT, SEUIL_EXTREME, MIN_CAS } from '../volume/bougies-volume-calcul.js';
import { reperes, balayages } from '../volume/ict-calcul.js';
import { sessionsRecentes, debutNuit, plageParis } from './sessions.js';

export const H = 3600e3, J = 86400e3;
export const PAS = Object.freeze({ M5: 300e3, M15: 900e3, H1: H, H4: 4 * H, J });
export const NOM_UNITE = Object.freeze({ M5: 'M5', M15: 'M15', H1: 'H1', H4: 'H4', J: 'Jour' });
/* nombre de clôtures consécutives du bon côté de la MA200 pour dire « confirmé » */
export const CLOTURES_CONFIRMATION = Object.freeze({ M5: 6, M15: 4, H1: 3, H4: 2, J: 2 });
/* fenêtre de recherche des croisements récents, par unité */
export const FENETRE_CROISEMENT = Object.freeze({ M5: 12 * H, M15: 36 * H, H1: 4 * J, H4: 10 * J, J: 30 * J });
export const MARGE_CROISEMENT_ATR = 0.3;   // même marge que les flèches de cassure de la MA200 du terminal
export const SEUIL_VRAIE_CASSURE = 2;      // volume relatif ≥ ×2 sur la bougie de cassure ou la suivante

export const cloturees = (B, pas, maintenant = Date.now()) => (B || []).filter(b => b && b.t + pas <= maintenant);
const signe = x => (x > 0 ? 1 : x < 0 ? -1 : 0);
const arr = (v, d = 2) => (Number.isFinite(v) ? +v.toFixed(d) : null);

/* ───── 1. tendance d'une unité : prix vs MA200, pente, distance en % et en ATR ───── */
export function tendanceUnite(Bbrut, unite, maintenant = Date.now()) {
  const B = cloturees(Bbrut, PAS[unite], maintenant), n = B.length;
  if (n < 30) return { unite, dispo: false, raison: `pas assez de bougies clôturées (${n})` };
  const c = B.map(b => b.c), M = sma(c, 200), A = atrSerie(B, 14), i = n - 1, a = A[i], px = c[i], ma = M[i];
  const r = { unite, dispo: true, n, t: B[i].t, cloture: arr(px, 6), atr: arr(a, 6), atrPct: a ? arr(a / px * 100, 3) : null, ma200: null };
  if (ma == null) return { ...r, raison: `MA200 indisponible (${n} bougies sur 200 nécessaires)`, sens: null };
  const pente = i >= 20 && M[i - 20] != null ? (ma - M[i - 20]) / M[i - 20] * 100 : null, pos = px >= ma ? 'dessus' : 'dessous';
  const sens = pente == null ? null : (pos === 'dessus' && pente >= 0 ? 'haussier' : pos === 'dessous' && pente <= 0 ? 'baissier' : 'mixte');
  return { ...r, ma200: arr(ma, 6), position: pos, ecartPct: arr((px - ma) / ma * 100, 3), ecartAtr: a ? arr((px - ma) / a, 2) : null, penteMa200Pct: arr(pente, 3), pente20: pente == null ? null : (pente > 0 ? 'montante' : pente < 0 ? 'descendante' : 'plate'), sens };
}

/* ───── 2. croisements récents de la MA200 : où, quand, confirmé ou non, avec ou sans fort volume ───── */
export function croisementsMa200(Bbrut, unite, actif, maintenant = Date.now(), { fenetre = FENETRE_CROISEMENT[unite] } = {}) {
  const pas = PAS[unite], B = cloturees(Bbrut, pas, maintenant), n = B.length; if (n < 210) return [];
  const calc = creerCalcul(actif).maj(B), requis = CLOTURES_CONFIRMATION[unite], debut = Math.max(201, B.findIndex(b => b.t >= maintenant - fenetre));
  const sorties = []; let etat = 0;
  for (let i = 200; i < n; i++) {
    const m = calc.ma(i), a = calc.atr(i); if (m == null || !a) continue; const b = B[i];
    if (etat === 0) { if (Math.abs(b.c - m) >= MARGE_CROISEMENT_ATR * a) etat = b.c > m ? 1 : -1; continue; }
    const franchi = etat > 0 ? b.c < m - MARGE_CROISEMENT_ATR * a : b.c > m + MARGE_CROISEMENT_ATR * a;
    if (!franchi) continue; etat = -etat; if (i < debut) continue;
    let tenue = 0, revenu = false;
    for (let j = i + 1; j < n; j++) { const mj = calc.ma(j); if (mj == null) break; if (signe(B[j].c - mj) === etat) tenue++; else { revenu = true; break; } }
    const rels = [calc.rel(i), i + 1 < n ? calc.rel(i + 1) : null].filter(x => x != null), relMax = rels.length ? Math.max(...rels) : null;
    const statut = tenue >= requis ? (revenu ? 'confirmee_puis_perdue' : 'confirmee') : revenu ? 'echouee' : 'en_attente';
    sorties.push({
      unite, t: b.t, tFin: b.t + pas, dir: etat, prix: arr(b.c, 6), ma200: arr(m, 6), margeAtr: arr(Math.abs(b.c - m) / a, 2), statut, tenue, requis, ageMs: maintenant - (b.t + pas),
      volumeRel: arr(calc.rel(i), 2), volumeRelMax: arr(relMax, 2), volumeDisponible: relMax != null, fortVolume: relMax != null && relMax >= SEUIL_VRAIE_CASSURE,
      vraieCassure: relMax != null && relMax >= SEUIL_VRAIE_CASSURE && statut !== 'echouee'
    });
  }
  return sorties.reverse();
}

/* ───── 3. bougies de fort / extrême volume récentes, contexte et statistiques « et après ? » (réutilise le module Bougies volume) ───── */
export function bougiesVolumeRecentes(Bbrut, unite, actif, maintenant = Date.now(), { jours = unite === 'J' ? 20 : unite === 'H4' ? 7 : 3, max = 6 } = {}) {
  const pas = PAS[unite], B = cloturees(Bbrut, pas, maintenant), n = B.length; if (n < 80) return { disponible: false, raison: `pas assez de bougies (${n})`, liste: [] };
  const calc = creerCalcul(actif).maj(B), { liste, dernier } = indicesClasses(B, calc, { seuil: SEUIL_DEFAUT, pas, maintenant });
  if (!B.some(b => b.v > 0)) return { disponible: false, raison: 'volume non disponible pour cet actif', liste: [] };
  const sorties = liste.filter(x => B[x.i].t >= maintenant - jours * J).slice(-max).reverse().map(x => {
    const i = x.i, b = B[i], st = similaires(B, calc, i, { seuil: SEUIL_DEFAUT, pas, maintenant }), s = suite(B, calc, i, dernier), ma = calc.ma(i);
    return {
      unite, t: b.t, tFin: b.t + pas, dir: x.dir, niveau: x.niveau === 2 ? 'extreme' : 'fort', volumeRel: arr(x.rel, 2), prixClos: arr(b.c, 6), haut: arr(b.h, 6), bas: arr(b.l, 6),
      contexte: calc.ctx(i), nomContexte: NOM_CONTEXTE[calc.ctx(i)] || null, positionMa200: ma == null ? null : (b.c >= ma ? 'dessus' : 'dessous'), ageMs: maintenant - (b.t + pas),
      stats: { n: st.n, petit: st.petit, n5: st.n5, continuation5Pct: st.petit ? null : arr(st.cont5, 0), retournement5Pct: st.petit ? null : arr(st.ret5, 0), moyenne5Atr: st.petit ? null : arr(st.moy5, 2), moyenne10Atr: st.petit ? null : arr(st.moy10, 2) },
      apres: s.horizons.filter(h => h.pct != null).map(h => ({ bougies: h.h, pct: arr(h.pct, 2), atr: arr(h.atr, 2) })), nbBougiesDepuis: s.nBougies
    };
  });
  const extremes = sorties.filter(x => x.niveau === 'extreme').length;
  const zs = zonesVolume(B, calc, { pas, maintenant, max: 4 }).map(z => ({ unite, t: z.t, dir: z.dir, bas: arr(z.bas, 6), haut: arr(z.haut, 6), volumeRel: arr(z.rel, 2) }));
  return { disponible: true, seuil: SEUIL_DEFAUT, seuilExtreme: SEUIL_EXTREME, minCas: MIN_CAS, liste: sorties, nbExtremes: extremes, zones: zs };
}

/* ───── 4. mouvement récent décrit simplement ───── */
const frPct = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export function mouvementRecent(Bbrut, unite, maintenant = Date.now(), { k = unite === 'J' ? 5 : 6, fenetreExtremes = unite === 'H1' ? 24 : unite === 'H4' ? 30 : 20 } = {}) {
  const B = cloturees(Bbrut, PAS[unite], maintenant), n = B.length; if (n < k + 2) return { unite, dispo: false };
  const dernier = B[n - 1], avant = B[n - 1 - k], pct = (dernier.c / avant.c - 1) * 100, A = atrSerie(B, 14), a = A[n - 1];
  let consec = 0, sens = signe(dernier.c - dernier.o); for (let i = n - 1; i >= 0 && sens !== 0 && signe(B[i].c - B[i].o) === sens; i--) consec++;
  const W = B.slice(-fenetreExtremes); let hi = W[0], lo = W[0]; for (const b of W) { if (b.h > hi.h) hi = b; if (b.l < lo.l) lo = b; }
  return { unite, dispo: true, bougies: k, pct: arr(pct, 2), atr: a ? arr((dernier.c - avant.c) / a, 2) : null, sens: signe(pct), consecutives: { n: consec, sens }, fenetreExtremes, plusHaut: { prix: arr(hi.h, 6), t: hi.t }, plusBas: { prix: arr(lo.l, 6), t: lo.t },
    texte: `${frPct(pct)} % en ${k} bougies ${NOM_UNITE[unite]}` };
}

/* ───── 5. mouvement PAR SESSION (Asie, Londres, New York) : amplitude, sens, qui a fait le mouvement de la nuit ───── */
function agregat(B) { let h = -Infinity, l = Infinity; for (const b of B) { if (b.h > h) h = b.h; if (b.l < l) l = b.l; } return { o: B[0].o, h, l, c: B[B.length - 1].c, n: B.length }; }
export function mouvementSessions(Bbrut, unite, maintenant = Date.now(), { atrJ = null, jours = 3 } = {}) {
  const pas = PAS[unite], B = cloturees(Bbrut, pas, maintenant), L = [];
  for (const s of sessionsRecentes(maintenant, jours)) {
    const X = B.filter(b => b.t >= s.debut && b.t < Math.min(s.fin, maintenant)); if (X.length < 2) continue;
    const g = agregat(X), pct = (g.c / g.o - 1) * 100, amp = (g.h - g.l) / g.o * 100;
    L.push({ id: s.id, nom: s.nom, jour: s.jour, debut: s.debut, fin: s.fin, plageParis: plageParis(s), enCours: s.enCours, o: arr(g.o, 6), h: arr(g.h, 6), l: arr(g.l, 6), c: arr(g.c, 6), pct: arr(pct, 2), amplitudePct: arr(amp, 2), amplitudeAtrJ: atrJ ? arr((g.h - g.l) / atrJ, 2) : null, sens: signe(pct), nBougies: g.n });
  }
  for (const s of L) s.comportement = comportementSession(s, L);
  return L;
}
/* « comportement typique de la session ou inhabituel » : règles simples et transparentes */
export function comportementSession(s, toutes) {
  const memeJour = id => toutes.find(x => x.jour === s.jour && x.id === id), asie = memeJour('asie'), londres = memeJour('londres'), amp = s.amplitudeAtrJ;
  if (s.id === 'asie') {
    if (amp == null) return { code: 'inconnu', typique: null, texte: 'amplitude non comparable (ATR indisponible)' };
    if (amp < 0.5) return { code: 'range_asiatique', typique: true, texte: 'session calme : range asiatique classique' };
    return amp > 0.9 ? { code: 'asie_agitee', typique: false, texte: 'Asie inhabituellement agitée' } : { code: 'asie_normale', typique: true, texte: 'Asie d’amplitude normale' };
  }
  if (s.id === 'londres' && asie) {
    const hautBalaye = s.h > asie.h, basBalaye = s.l < asie.l;
    if (hautBalaye && basBalaye) return { code: 'londres_double_balayage', typique: false, texte: 'Londres a balayé le haut ET le bas du range asiatique' };
    if (hautBalaye) return s.c < asie.h ? { code: 'balayage_haut_puis_retour', typique: true, texte: 'Londres a balayé le haut du range asiatique puis est revenu dessous' } : { code: 'cassure_haut_asie', typique: true, texte: 'Londres a cassé le haut du range asiatique et tient au-dessus' };
    if (basBalaye) return s.c > asie.l ? { code: 'balayage_bas_puis_retour', typique: true, texte: 'Londres a balayé le bas du range asiatique puis est revenu dessus' } : { code: 'cassure_bas_asie', typique: true, texte: 'Londres a cassé le bas du range asiatique et tient en dessous' };
    return { code: 'londres_dans_range', typique: false, texte: 'Londres est resté dans le range asiatique' };
  }
  if (s.id === 'newyork' && londres) {
    if (!s.sens || !londres.sens) return { code: 'ny_neutre', typique: true, texte: 'New York n’a pas pris de direction' };
    return s.sens === londres.sens ? { code: 'ny_continuation', typique: true, texte: 'New York a prolongé le mouvement de Londres' } : { code: 'ny_retournement', typique: true, texte: 'New York a retourné le mouvement de Londres' };
  }
  return { code: 'autre', typique: null, texte: '' };
}
/* la nuit = depuis la clôture de New York : qui a fait le mouvement ? */
export function mouvementNuit(Bbrut, unite, maintenant = Date.now(), sessions = []) {
  const pas = PAS[unite], t0 = debutNuit(maintenant), X = cloturees(Bbrut, pas, maintenant).filter(b => b.t >= t0); if (X.length < 2) return { dispo: false, depuis: t0 };
  const g = agregat(X), pct = (g.c / g.o - 1) * 100, apres = sessions.filter(s => s.debut >= t0).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  return { dispo: true, depuis: t0, o: arr(g.o, 6), h: arr(g.h, 6), l: arr(g.l, 6), c: arr(g.c, 6), pct: arr(pct, 2), sens: signe(pct), nBougies: g.n, fait: apres.length ? { id: apres[0].id, nom: apres[0].nom, pct: apres[0].pct } : null };
}

/* ───── 6. niveaux clés ───── */
export function niveauxLecture(B, maintenant = Date.now(), { sessionsMv = [] } = {}) {
  const J_ = cloturees(B.J, PAS.J, maintenant), H4 = cloturees(B.H4, PAS.H4, maintenant), H1 = cloturees(B.H1, PAS.H1, maintenant), out = { reperes: {}, supports: [], resistances: [], rangeAsie: null, balayages: [] };
  const R = reperes(B.J || [], maintenant);
  if (R) { for (const x of R.niveaux) out.reperes[x.id] = arr(x.prix, 6); for (const o of R.ouvertures) out.reperes[o.id] = arr(o.prix, 6); }
  for (const [u, X] of [['J', J_], ['H4', H4]]) { if (X.length < 60) continue; const N = niveauxCles(X, { max: 3 }); const px = X[X.length - 1].c;
    for (const x of N.supports) out.supports.push({ prix: arr(x.prix, 6), touches: x.touches, unite: u, distancePct: arr((x.prix - px) / px * 100, 2), distanceAtr: N.atr ? arr((x.prix - px) / N.atr, 2) : null });
    for (const x of N.resistances) out.resistances.push({ prix: arr(x.prix, 6), touches: x.touches, unite: u, distancePct: arr((x.prix - px) / px * 100, 2), distanceAtr: N.atr ? arr((x.prix - px) / N.atr, 2) : null }); }
  out.supports.sort((a, b) => b.prix - a.prix); out.resistances.sort((a, b) => a.prix - b.prix);   // les 4 plus proches de chaque côté (les niveaux lointains n'aident pas la lecture)
  out.supports = out.supports.slice(0, 4); out.resistances = out.resistances.slice(0, 4);
  const asie = [...sessionsMv].reverse().find(s => s.id === 'asie'); if (asie) out.rangeAsie = { jour: asie.jour, haut: asie.h, bas: asie.l, enCours: asie.enCours, debut: asie.debut, fin: asie.fin };
  const niv = []; for (const [id, type] of [['PDH', 'haut'], ['PDL', 'bas'], ['PWH', 'haut'], ['PWL', 'bas']]) if (out.reperes[id] != null && R) { const x = R.niveaux.find(y => y.id === id); niv.push({ id, prix: x.prix, type, depuis: x.depuis }); }
  if (out.rangeAsie && !out.rangeAsie.enCours) { niv.push({ id: 'Asie haut', prix: out.rangeAsie.haut, type: 'haut', depuis: out.rangeAsie.fin }, { id: 'Asie bas', prix: out.rangeAsie.bas, type: 'bas', depuis: out.rangeAsie.fin }); }
  if (H1.length > 40 && niv.length) out.balayages = balayages(H1, niv, { recent: 36 }).map(b => ({ niveau: b.niveau, prix: arr(b.prix, 6), type: b.type, t: b.t, sensProbable: b.sens }));
  return out;
}

/* ───── 7. régime : tendance ou range, compression, ATR ───── */
export function efficacite(B, n = 20) { const c = B.slice(-n - 1).map(b => b.c); if (c.length < n + 1) return null; let somme = 0; for (let i = 1; i < c.length; i++) somme += Math.abs(c[i] - c[i - 1]); return somme > 0 ? Math.abs(c[c.length - 1] - c[0]) / somme : 0; }
export const mediane = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
export function regime(Bbrut, unite, maintenant = Date.now()) {
  const B = cloturees(Bbrut, PAS[unite], maintenant); if (B.length < 60) return { unite, dispo: false };
  const er = efficacite(B, 20), A = atrSerie(B, 14).filter(x => x != null), a = A[A.length - 1], med = mediane(A.slice(-100)), ratio = med ? a / med : null;
  return { unite, dispo: true, efficacite: arr(er, 2), type: er > 0.3 ? 'tendance' : 'range', atr: arr(a, 6), atrPct: arr(a / B[B.length - 1].c * 100, 3), atrVsMediane: arr(ratio, 2), compression: ratio != null && ratio < 0.75 };
}

/* ───── 8. gros mouvements : seuil CALIBRÉ sur l'historique pour garder quelques situations par semaine et par actif ───── */
export const BOUGIES_JOUR_H4 = 6;
export function mouvementsH4(Bbrut, maintenant = Date.now(), { k = BOUGIES_JOUR_H4 } = {}) {   // amplitude de chaque fenêtre glissante de k bougies H4, en ATR H4
  const B = cloturees(Bbrut, PAS.H4, maintenant), A = atrSerie(B, 14), L = [];
  for (let i = k; i < B.length; i++) { if (!A[i - k]) continue; const net = (B[i].c - B[i - k].c) / A[i - k]; L.push({ i, t: B[i].t, tFin: B[i].t + PAS.H4, atr: net }); }
  return { B, L };
}
export function calibrerSeuil(Bbrut, maintenant = Date.now(), { parSemaineMax = 3, grille = [2, 2.5, 3, 3.5, 4, 5, 6, 8, 10], k = BOUGIES_JOUR_H4 } = {}) {
  const { B, L } = mouvementsH4(Bbrut, maintenant, { k }); if (L.length < 200) return { seuil: 4, calibre: false, raison: 'historique H4 trop court' };
  const semaines = Math.max(1, (L[L.length - 1].tFin - L[0].t) / (7 * J));
  for (const s of grille) { let n = 0, dern = -1e9; for (const x of L) if (Math.abs(x.atr) >= s && x.i - dern > k) { n++; dern = x.i; } if (n / semaines <= parSemaineMax) return { seuil: s, calibre: true, parSemaine: arr(n / semaines, 2), semaines: arr(semaines, 0), k };
  }
  return { seuil: grille[grille.length - 1], calibre: true, parSemaine: 0, semaines: arr(semaines, 0), k };
}
/* gros mouvements survenus dans les `heures` dernières heures (fenêtres fusionnées) */
export function grosMouvements(Bbrut, maintenant = Date.now(), { seuil, heures = 72, k = BOUGIES_JOUR_H4 } = {}) {
  const { B, L } = mouvementsH4(Bbrut, maintenant, { k }), t0 = maintenant - heures * H, S = L.filter(x => x.tFin >= t0 && Math.abs(x.atr) >= seuil), out = [];
  for (const x of S) { const d = Math.sign(x.atr), der = out[out.length - 1]; if (der && der.sens === d && x.i - der.iFin <= k) { der.iFin = x.i; if (Math.abs(x.atr) > Math.abs(der.atr)) der.atr = x.atr; der.tFin = x.tFin; } else out.push({ sens: d, iDebut: x.i - k, iFin: x.i, atr: x.atr, tFin: x.tFin }); }
  return out.map(g => { const a = B[g.iDebut], z = B[g.iFin], hi = Math.max(...B.slice(g.iDebut + 1, g.iFin + 1).map(b => b.h)), lo = Math.min(...B.slice(g.iDebut + 1, g.iFin + 1).map(b => b.l));
    return { sens: g.sens, depart: a.t + PAS.H4, fin: z.t + PAS.H4, pct: arr((z.c / a.c - 1) * 100, 2), atrH4: arr(g.atr, 1), bougiesH4: g.iFin - g.iDebut, plusHaut: arr(hi, 6), plusBas: arr(lo, 6), seuil }; });
}
