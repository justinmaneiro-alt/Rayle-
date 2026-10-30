/* ═════════════ SÉRIE DE VOLUME (V14, phase 1 ; module pur, testé : galaxie/tests/volume-v14-test.mjs) ═════════════
   UNE SEULE implémentation, utilisée par l'affichage ET par la recherche de stratégies : bougies M15 avec volume acheteur / vendeur AGRESSIF (reconstruit des vraies transactions),
   delta, CVD, profils de volume (jour précédent, 7 jours précédents : POC, VAH, VAL, HVN, LVN), empreinte (footprint) par bougie, déséquilibres diagonaux, absorption.
   Tout est CAUSAL : la valeur en i n'utilise que les barres 0..i et des JOURS DÉJÀ TERMINÉS (jamais le jour en cours). Une barre : { t, achatUsd, venteUsd, n, plusGrosUsd, ouv, haut, bas, cloture, fp: [[k, achatUsd, venteUsd], …] }. */
import { profilDepuisTranches, noeudsVolume, prixDeTranche, MS15 } from '../liquidite/barres-flux.js';

export const JOUR = 86400e3, HEURE = 3600e3;
const num = x => (Number.isFinite(x) ? x : 0);

function profilResume(map, debut, fin, haut, bas) {
  const p = profilDepuisTranches(map); if (!p) return null;
  const nv = noeudsVolume(p);
  return { debut, fin, haut, bas, poc: p.poc, vah: p.vah, val: p.val, totalUsd: p.total, hvn: nv.hvn.sort((a, b) => b.force - a.force).slice(0, 6).map(x => x.prix), lvn: nv.lvn.sort((a, b) => a.force - b.force).slice(0, 6).map(x => x.prix) };
}
const fusion = (cartes) => { const m = new Map(); for (const c of cartes) for (const [k, e] of c) { let x = m.get(k); if (!x) m.set(k, x = { achat: 0, vente: 0 }); x.achat += e.achat; x.vente += e.vente; } return m; };

/* Construit la série barre par barre (chargement en flux : jamais toutes les empreintes en mémoire). `garderFp` = nombre de barres RÉCENTES dont on garde l'empreinte (affichage). */
export function creerConstructeur({ garderFp = 1500, joursProfilLong = 7 } = {}) {
  const T = [], O = [], H = [], L = [], C = [], A = [], V = [], N = [], G = [], FP = [], jIdx = [];
  const jours = [], semaines = []; let jourCle = null, carte = new Map(), hautJ = -Infinity, basJ = Infinity, debutJ = 0; const cartesJours = [];
  const fermerJour = fin => {
    const p = profilResume(carte, debutJ, fin, hautJ, basJ); if (!p) { carte = new Map(); return; }
    jours.push(p); cartesJours.push(carte); if (cartesJours.length > joursProfilLong) cartesJours.shift();
    const hauts = jours.slice(-joursProfilLong), s = profilResume(fusion(cartesJours), hauts[0].debut, fin, Math.max(...hauts.map(x => x.haut)), Math.min(...hauts.map(x => x.bas)));
    semaines.push(s); carte = new Map();
  };
  return {
    ajouter(b) {
      const j = Math.floor(b.t / JOUR);
      if (j !== jourCle) { if (jourCle != null) fermerJour(b.t); jourCle = j; debutJ = b.t; hautJ = -Infinity; basJ = Infinity; carte = new Map(); }
      for (const [k, a, v] of b.fp || []) { let e = carte.get(k); if (!e) carte.set(k, e = { achat: 0, vente: 0 }); e.achat += a; e.vente += v; }
      hautJ = Math.max(hautJ, b.haut); basJ = Math.min(basJ, b.bas);
      T.push(b.t); O.push(b.ouv); H.push(b.haut); L.push(b.bas); C.push(b.cloture); A.push(num(b.achatUsd)); V.push(num(b.venteUsd)); N.push(num(b.n)); G.push(num(b.plusGrosUsd)); FP.push(b.fp || null);
      jIdx.push(jours.length - 1);
    },
    finir() {
      const n = T.length, fp = new Array(n).fill(null); for (let i = Math.max(0, n - garderFp); i < n; i++) fp[i] = FP[i];
      return construireSerie({ unite: 'M15', pas: MS15, t: Float64Array.from(T), o: Float64Array.from(O), h: Float64Array.from(H), l: Float64Array.from(L), c: Float64Array.from(C), achat: Float64Array.from(A), vente: Float64Array.from(V), n: Float64Array.from(N), gros: Float64Array.from(G), fp, jIdx: Int32Array.from(jIdx), jours, semaines });
    }
  };
}

/* Complète une série : delta, CVD du jour, ATR(14), delta typique causal, volume relatif. */
export function construireSerie(s) {
  const n = s.t.length, delta = new Float64Array(n), cvd = new Float64Array(n), atr = new Float64Array(n), typique = new Float64Array(n), volTyp = new Float64Array(n);
  let somme = 0, jour = -1, ema = 0, vu = 0, emaV = 0;
  for (let i = 0; i < n; i++) {
    delta[i] = s.achat[i] - s.vente[i];
    const j = Math.floor(s.t[i] / JOUR); if (j !== jour) { jour = j; somme = 0; } somme += delta[i]; cvd[i] = somme;
    typique[i] = ema; vu++; ema = vu < 30 ? ema + (Math.abs(delta[i]) - ema) / vu : ema + (Math.abs(delta[i]) - ema) / 96;
    volTyp[i] = emaV; const v = s.achat[i] + s.vente[i]; emaV = vu < 30 ? emaV + (v - emaV) / vu : emaV + (v - emaV) / 96;
    const tr = i ? Math.max(s.h[i] - s.l[i], Math.abs(s.h[i] - s.c[i - 1]), Math.abs(s.l[i] - s.c[i - 1])) : s.h[i] - s.l[i];
    atr[i] = i < 14 ? (i ? (atr[i - 1] * i + tr) / (i + 1) : tr) : (atr[i - 1] * 13 + tr) / 14;
  }
  return { ...s, nBarres: n, delta, cvd, atr, typique, volTyp };
}

/* Agrège la série M15 en H1 (mêmes jours / profils ; l'empreinte détaillée n'est pas gardée en H1). */
export function agregerH1(s) {
  const t = [], o = [], h = [], l = [], c = [], A = [], V = [], N = [], G = [], jIdx = [], debutM15 = []; let cle = null;
  for (let i = 0; i < s.nBarres; i++) {
    const k = Math.floor(s.t[i] / HEURE);
    if (k !== cle) { cle = k; t.push(k * HEURE); o.push(s.o[i]); h.push(s.h[i]); l.push(s.l[i]); c.push(s.c[i]); A.push(0); V.push(0); N.push(0); G.push(0); jIdx.push(s.jIdx[i]); debutM15.push(i); }
    const q = t.length - 1; h[q] = Math.max(h[q], s.h[i]); l[q] = Math.min(l[q], s.l[i]); c[q] = s.c[i]; A[q] += s.achat[i]; V[q] += s.vente[i]; N[q] += s.n[i]; G[q] = Math.max(G[q], s.gros[i]);
  }
  // une heure incomplète (moins de 4 barres M15 présentes) est écartée pour ne jamais fausser le delta
  const garde = []; for (let q = 0; q < t.length; q++) { const fin = q + 1 < t.length ? debutM15[q + 1] : s.nBarres; if (fin - debutM15[q] === 4) garde.push(q); }
  const pick = a => Float64Array.from(garde, q => a[q]);
  return construireSerie({ unite: 'H1', pas: HEURE, t: pick(t), o: pick(o), h: pick(h), l: pick(l), c: pick(c), achat: pick(A), vente: pick(V), n: pick(N), gros: pick(G), fp: new Array(garde.length).fill(null), jIdx: Int32Array.from(garde, q => jIdx[q]), jours: s.jours, semaines: s.semaines, debutM15: Int32Array.from(garde, q => debutM15[q]) });
}

/* Profils du jour précédent (session) et des 7 jours précédents pour la barre i. Jamais le jour en cours. */
export const profilJour = (s, i) => (s.jIdx[i] >= 0 ? s.jours[s.jIdx[i]] : null);
export const profilSemaine = (s, i) => (s.jIdx[i] >= 0 ? s.semaines[s.jIdx[i]] : null);

/* Volume net d'une barre : { achat, vente, delta, agressivite (part acheteuse, 0..1), relatif (|delta| / delta typique) }. */
export function volumeNet(s, i) {
  const a = s.achat[i], v = s.vente[i], tot = a + v;
  return { achat: a, vente: v, delta: a - v, agressivite: tot > 0 ? a / tot : 0.5, relatif: s.typique[i] > 0 ? Math.abs(a - v) / s.typique[i] : 0 };
}
/* CVD glissant sur `fen` barres. */
export function cvdGlissant(s, i, fen = 96) { let x = 0; for (let q = Math.max(0, i - fen + 1); q <= i; q++) x += s.delta[q]; return x; }

/* Phrase claire « les acheteurs / vendeurs dominent depuis X minutes » : nombre de barres consécutives (en arrière depuis i) dont le delta a le même signe que la somme récente. */
export function dominance(s, i, { seuilPart = 0.52 } = {}) {
  const pasMin = s.pas / 60000; let sens = 0, k = 0, a = 0, v = 0;
  for (let q = i; q >= 0 && k < 48; q--) {
    const tot = s.achat[q] + s.vente[q]; if (!(tot > 0)) break; const part = s.achat[q] / tot, sg = part >= seuilPart ? 1 : part <= 1 - seuilPart ? -1 : 0;
    if (k === 0) sens = sg || (s.delta[q] >= 0 ? 1 : -1); if (sg !== 0 && sg !== sens) break; a += s.achat[q]; v += s.vente[q]; k++;
  }
  const minutes = Math.round(k * pasMin), part = a + v > 0 ? a / (a + v) : 0.5;
  return { sens, minutes, part, texte: sens > 0 ? 'Les acheteurs dominent depuis ' + minutes + ' min' : 'Les vendeurs dominent depuis ' + minutes + ' min' };
}

/* Empreinte d'une barre : niveaux { prix, achat, vente, desAch, desVen } avec déséquilibres DIAGONAUX (achat au niveau k contre vente au niveau k−1, et inversement), rapport ≥ `ratio`. */
export function empreinteBarre(fp, { ratio = 3, minUsd = 0 } = {}) {
  if (!fp || !fp.length) return { ok: false, niveaux: [], poc: null };
  const parK = new Map(fp.map(([k, a, v]) => [k, [a, v]])), niveaux = []; let maxK = null, maxV = -1;
  for (const [k, a, v] of fp) {
    const dessous = parK.get(k - 1), dessus = parK.get(k + 1);
    const desAch = !!(dessous && a >= minUsd && a >= ratio * Math.max(1, dessous[1])), desVen = !!(dessus && v >= minUsd && v >= ratio * Math.max(1, dessus[0]));
    niveaux.push({ k, prix: prixDeTranche(k), achat: a, vente: v, desAch, desVen }); if (a + v > maxV) { maxV = a + v; maxK = k; }
  }
  return { ok: true, niveaux, poc: maxK == null ? null : prixDeTranche(maxK), nDesAch: niveaux.filter(x => x.desAch).length, nDesVen: niveaux.filter(x => x.desVen).length };
}

/* Absorption causale : +1 si de gros ventes agressives n'ont pas fait baisser le prix (soutien absorbé), −1 pour des achats énormes sans hausse. facteur × delta typique ; tolérance en ATR. */
export function absorption(s, i, { facteur = 2, tolAtr = 0.25 } = {}) {
  const d = s.delta[i], t = s.typique[i], a = s.atr[i]; if (!(t > 0) || !(a > 0) || Math.abs(d) < facteur * t) return { sens: 0, force: 0 };
  const progres = s.c[i] - s.o[i];
  if (d < 0 && progres >= -tolAtr * a) return { sens: 1, force: Math.abs(d) / t };
  if (d > 0 && progres <= tolAtr * a) return { sens: -1, force: Math.abs(d) / t };
  return { sens: 0, force: 0 };
}
