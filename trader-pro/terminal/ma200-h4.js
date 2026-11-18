/* ═════════════ MA200 H4 + SUPPORTS / RÉSISTANCES MAJEURS H4 (module PUR, testé, navigateur et Node) ═════════════
   Base de calcul : TOUJOURS les bougies H4 clôturées (au moins 1500 chargées), quelle que soit l'unité affichée (H1, H4, Jour). Aucune autre donnée, aucun autre indicateur.
   Tout est causal : la bougie i ne voit que les bougies 0…i (un pivot de 10 bougies de chaque côté n'est connu que 10 bougies plus tard) : une flèche confirmée ne bouge ni ne disparaît jamais.

   MA200 H4 : moyenne simple 200 sur les clôtures H4. Tendance haussière = clôture au-dessus de la MA et pente positive sur 20 bougies ; baissière = l'inverse ; sinon neutre.

   ZONES MAJEURES : pivots H4 (10 bougies de chaque côté) regroupés en zones de largeur ≤ 0,5 × ATR14 H4. Zone majeure = au moins 3 touches ET au moins une réaction de 3 × ATR (le prix s'éloigne de 3 ATR dans les 10 bougies
   qui suivent un pivot de la zone). Une touche = un pivot de la zone, ou une mèche qui y entre au moins 6 bougies après la touche précédente. Maximum 3 zones au-dessus et 3 en dessous du prix.
   Une zone cassée nettement (clôture H4 à plus de 1 ATR au-delà) change de rôle : résistance → support, support → résistance.

   TROIS TYPES DE FLÈCHES, toujours confirmées à la clôture H4 :
   a) « rebond »  : rebond sur la MA200 H4 dans le sens de la tendance (la mèche touche la MA à moins de 0,25 ATR, la bougie clôture du bon côté avec une mèche de rejet ≥ 40 % de la bougie ou une bougie de reprise) ;
   b) « retest »  : cassure de la MA200 H4 (clôture franche à ≥ 0,5 ATR de l'autre côté) puis, dans les 10 bougies suivantes, retest respecté (même confirmation) ; jamais de flèche sur la cassure seule ;
   c) « zone »    : rebond sur une zone majeure dans le sens de la tendance (même confirmation).
   Grosse flèche = MA200 H4 et zone majeure au même endroit (moins de 1 ATR d'écart). Petite flèche = les autres cas.
   Seuils ajustés par le backtest (VERIFICATION-MA200.md) : b perdant à l'origine → cassure franche à 1 ATR, retest à 0,4 ATR avec rejet 50 % ; a perdant → pente de la MA200 sur 20 bougies d'au moins 0,5 ATR.
   Anti-bruit : 12 bougies H4 minimum entre deux flèches du même sens, jamais un achat et une vente à moins de 6 bougies, aucune flèche contre la tendance (sauf b), aucune flèche a ou c en tendance neutre.
   Résultat d'une flèche : gagnante si le prix fait +2 ATR dans son sens avant −1 ATR contre (les deux dans la même bougie = perdante) ; R = +2 ou −1. Bougies : { t (ouverture, ms UTC), o, h, l, c }. */
import { atr, sma } from '../commun/analyse.js';

export const J = 86400e3, H4 = 4 * 3600e3;
export const PARAMS = Object.freeze({
  ATR_N: 14, MA_N: 200, pente: 20, pivot: 10, largeurZone: 0.5, touchesMin: 3, reactionATR: 3, reactionBougies: 10, espaceTouche: 6, cassureZoneATR: 1, maxZones: 3,
  contactATR: 0.25, contactRetest: 0.4, profondeurMA: 99, penteMinMA: 0.5, retraitMA: 0, rejet: 0.4, rejetMA: 0.4, rejetRetest: 0.5, cassureMA: 1, fenetreRetest: 10, memeSens: 12, sensOppose: 6, confluenceATR: 1, gainATR: 2, perteATR: 1
});
/* identifiant de l'algorithme : fait partie de la clé du registre sur l'appareil (un changement de règles n'hérite jamais des flèches de l'ancienne version) : à changer à chaque modification des règles */
export const ALGO_ID = () => 'h4-v1';
export const cloturees = (B, maintenant = Date.now(), pas = H4) => (B || []).filter(b => b.t + pas <= maintenant);

/* ───── contexte : ATR14, MA200, pente et tendance bougie par bougie ───── */
export function contexte(B, P = PARAMS) {
  const A = atr(B, P.ATR_N), M = sma(B.map(b => b.c), P.MA_N), pente = B.map((b, i) => (i >= P.pente && M[i] != null && M[i - P.pente] != null ? M[i] - M[i - P.pente] : null));
  const tend = B.map((b, i) => (M[i] == null || pente[i] == null ? 0 : b.c > M[i] && pente[i] > 0 ? 1 : b.c < M[i] && pente[i] < 0 ? -1 : 0));
  return { A, M, pente, tend };
}

/* ───── confirmation d'une bougie : mèche de rejet (≥ 40 % de la bougie) ou bougie de reprise ───── */
export function confirmee(B, i, dir, P = PARAMS, seuil = P.rejet) {
  const b = B[i], p = B[i - 1], rg = b.h - b.l; if (!(rg > 0)) return false;
  const meche = dir > 0 ? (Math.min(b.o, b.c) - b.l) / rg : (b.h - Math.max(b.o, b.c)) / rg;
  if (meche >= seuil) return true;
  return !!p && (dir > 0 ? p.c < p.o && b.c > b.o && b.c > p.o : p.c > p.o && b.c < b.o && b.c < p.o);   // reprise : bougie dans le sens, qui efface la précédente
}

/* ───── analyse complète ───── */
export function analyser(Bh, { params = PARAMS, maintenant = Date.now() } = {}) {
  const P = params, B = cloturees(Bh, maintenant), n = B.length, C = contexte(B, P), { A, M, tend } = C;
  const zones = [], fleches = []; let dernier = { 1: -1e9, '-1': -1e9 }, casse = null;
  const majeure = z => z.touches >= P.touchesMin && z.reaction;
  const pivotHaut = p => { for (let k = p - P.pivot; k <= p + P.pivot; k++) if (k !== p && (k < p ? B[k].h >= B[p].h : B[k].h > B[p].h)) return false; return true; };
  const pivotBas = p => { for (let k = p - P.pivot; k <= p + P.pivot; k++) if (k !== p && (k < p ? B[k].l <= B[p].l : B[k].l < B[p].l)) return false; return true; };
  const ajouterPivot = (p, prix, role, reaction, i) => {
    const a = A[i]; let meilleure = null, larg = Infinity;
    for (const z of zones) { const w = Math.max(z.hi, prix) - Math.min(z.lo, prix); if (w <= P.largeurZone * a && w < larg) { meilleure = z; larg = w; } }
    if (meilleure) { const z = meilleure; z.lo = Math.min(z.lo, prix); z.hi = Math.max(z.hi, prix); z.pivots++; if (p - z.dernTouche >= P.espaceTouche) z.touches++; z.dernTouche = Math.max(z.dernTouche, p); z.reaction = z.reaction || reaction; z.role = role; }
    else zones.push({ lo: prix, hi: prix, role, pivots: 1, touches: 1, dernTouche: p, reaction, cree: i });
  };
  for (let i = 0; i < n; i++) {
    const a = A[i], b = B[i]; if (a == null) continue;
    /* 1) pivot confirmé 10 bougies plus tard */
    const p = i - P.pivot;
    if (p >= P.pivot) {
      if (pivotHaut(p)) { let bas = Infinity; for (let k = p + 1; k <= Math.min(n - 1, p + P.reactionBougies, i); k++) bas = Math.min(bas, B[k].l); ajouterPivot(p, B[p].h, -1, B[p].h - bas >= P.reactionATR * a, i); }
      if (pivotBas(p)) { let haut = -Infinity; for (let k = p + 1; k <= Math.min(n - 1, p + P.reactionBougies, i); k++) haut = Math.max(haut, B[k].h); ajouterPivot(p, B[p].l, 1, haut - B[p].l >= P.reactionATR * a, i); }
    }
    /* 2) touches par mèche, changement de rôle après une cassure nette */
    for (const z of zones) {
      if (b.l <= z.hi && b.h >= z.lo && i - z.dernTouche >= P.espaceTouche) { z.touches++; z.dernTouche = i; }
      if (z.role < 0 && b.c > z.hi + P.cassureZoneATR * a) z.role = 1; else if (z.role > 0 && b.c < z.lo - P.cassureZoneATR * a) z.role = -1;
    }
    if (M[i] == null || tend[i] === undefined || i < 1) continue;
    /* 3) flèches */
    const m = M[i], t = tend[i], majeures = zones.filter(majeure);
    const prochePrix = (z, x) => (x >= z.lo && x <= z.hi ? 0 : Math.min(Math.abs(x - z.lo), Math.abs(x - z.hi)));
    const confluence = majeures.some(z => prochePrix(z, m) < P.confluenceATR * a);
    let cand = null;
    /* le rebond sur la MA200 suit un vrai retrait : une bougie des 12 dernières s'est éloignée de la MA d'au moins `retraitMA` ATR dans le sens de la tendance */
    const retrait = (k, d) => { if (!P.retraitMA) return true; for (let x = Math.max(0, k - 12); x < k; x++) if (M[x] != null && A[x] != null && d * (B[x].c - M[x]) >= P.retraitMA * A[x]) return true; return false; };
    /* b) cassure franche de la MA200 puis retest respecté dans les 10 bougies */
    if (casse && i - casse.j > P.fenetreRetest) casse = null;
    if (casse && (casse.dir > 0 ? b.c < m - P.cassureMA * a : b.c > m + P.cassureMA * a)) casse = null;   // retour franc de l'autre côté : la cassure est annulée
    if (casse && i > casse.j) {
      const d = casse.dir, touche = d > 0 ? b.l <= m + P.contactRetest * a : b.h >= m - P.contactRetest * a, bonCote = d > 0 ? b.c > m : b.c < m;
      if (touche && bonCote && confirmee(B, i, d, P, P.rejetRetest)) { cand = { type: 'retest', dir: d, grosse: confluence }; casse = null; }
    }
    for (const d of [1, -1]) {   // nouvelle cassure franche (après une clôture de l'autre côté dans les 6 dernières bougies)
      const franche = d > 0 ? b.c > m + P.cassureMA * a : b.c < m - P.cassureMA * a; if (!franche) continue;
      const avant = d > 0 ? B[i - 1].c <= M[i - 1] + P.cassureMA * A[i - 1] : B[i - 1].c >= M[i - 1] - P.cassureMA * A[i - 1]; if (!avant || M[i - 1] == null) continue;
      let vientDeLautre = false; for (let k = Math.max(0, i - 6); k < i; k++) if (M[k] != null && (d > 0 ? B[k].c < M[k] : B[k].c > M[k])) vientDeLautre = true;
      if (vientDeLautre) casse = { dir: d, j: i };
    }
    /* a) rebond sur la MA200 H4, c) rebond sur une zone majeure : seulement dans le sens de la tendance */
    if (!cand && t !== 0) {
      const d = t, contactMA = d > 0 ? b.l <= m + P.contactATR * a && b.l >= m - P.profondeurMA * a && b.c > m : b.h >= m - P.contactATR * a && b.h <= m + P.profondeurMA * a && b.c < m;
      if (contactMA && d * C.pente[i] >= P.penteMinMA * a && retrait(i, d) && confirmee(B, i, d, P, P.rejetMA)) cand = { type: 'rebond', dir: d, grosse: confluence };
      else {
        const z = majeures.filter(z => z.role === d && (d > 0 ? b.l <= z.hi + P.contactATR * a && b.l >= z.lo - 0.5 * a && b.c > z.hi : b.h >= z.lo - P.contactATR * a && b.h <= z.hi + 0.5 * a && b.c < z.lo)).sort((x, y) => prochePrix(x, b.c) - prochePrix(y, b.c))[0];
        if (z && confirmee(B, i, d, P)) cand = { type: 'zone', dir: d, grosse: Math.abs((z.lo + z.hi) / 2 - m) < P.confluenceATR * a, niveau: (z.lo + z.hi) / 2 };
      }
    }
    if (cand && i - dernier[cand.dir] >= P.memeSens && i - dernier[-cand.dir] >= P.sensOppose) {
      dernier[cand.dir] = i; const d = cand.dir;
      fleches.push({ type: cand.type, dir: d, t: b.t, tFin: b.t + H4, entree: b.c, stop: b.c - d * P.perteATR * a, R: P.perteATR * a, atr: a, grosse: !!cand.grosse, ma200: m, zone: cand.niveau ?? null, mode: 'h4', iH4: i });
    }
  }
  const prix = n ? B[n - 1].c : null, aF = n ? A[n - 1] : null;
  const maj = zones.filter(majeure).map(z => ({ lo: z.lo, hi: z.hi, milieu: (z.lo + z.hi) / 2, role: z.role, touches: z.touches }));
  const dessus = prix == null ? [] : maj.filter(z => z.milieu > prix).sort((x, y) => x.milieu - y.milieu).slice(0, P.maxZones), dessous = prix == null ? [] : maj.filter(z => z.milieu <= prix).sort((x, y) => y.milieu - x.milieu).slice(0, P.maxZones);
  const sens = B.map((b, i) => ({ t: b.t, tFin: b.t + H4, sens: tend[i], cote: tend[i] }));
  return { B, S: C, A, M, tend, fleches, zones: [...dessus, ...dessous], toutesZones: maj, sens, stats: statistiques(fleches, B, P) };
}

/* ───── résultat d'une flèche : +2 ATR dans son sens avant −1 ATR contre (les deux dans la même bougie = perdante) ───── */
export function suivre(f, B, P = PARAMS) {
  const L = f.dir > 0, a = f.atr || f.R, cible = L ? f.entree + P.gainATR * a : f.entree - P.gainATR * a, stop = L ? f.entree - P.perteATR * a : f.entree + P.perteATR * a;
  for (let i = f.iH4 + 1; i < B.length; i++) {
    const b = B[i], perdu = L ? b.l <= stop : b.h >= stop, gagne = L ? b.h >= cible : b.l <= cible;
    if (perdu) return { r: -P.perteATR, etat: 'perdante', prix: stop, t: b.t + H4 };
    if (gagne) return { r: P.gainATR, etat: 'gagnante', prix: cible, t: b.t + H4 };
  }
  const d = B[B.length - 1] || { c: f.entree, t: f.t }; return { r: (L ? d.c - f.entree : f.entree - d.c) / a, etat: 'en cours', prix: d.c, t: d.t + H4 };
}
/* statistiques : nombre de flèches, % de réussite et R moyen (flèches résolues seulement), au total et par type */
export function statistiques(fleches, B, P = PARAMS) {
  const vide = () => ({ nombre: 0, resolues: 0, gagnantes: 0, enCours: 0, pct: null, rMoyen: null, somme: 0 });
  const tot = vide(), parType = { rebond: vide(), retest: vide(), zone: vide() }, grosses = vide(), petites = vide();
  for (const f of fleches) {
    const s = suivre(f, B, P);
    for (const g of [tot, parType[f.type] || (parType[f.type] = vide()), f.grosse ? grosses : petites]) {
      g.nombre++; if (s.etat === 'en cours') g.enCours++; else { g.resolues++; g.somme += s.r; if (s.etat === 'gagnante') g.gagnantes++; }
    }
  }
  for (const g of [tot, grosses, petites, ...Object.values(parType)]) { g.pct = g.resolues ? g.gagnantes / g.resolues * 100 : null; g.rMoyen = g.resolues ? g.somme / g.resolues : null; }
  const jours = B.length > 1 ? (B[B.length - 1].t - B[0].t) / J : 0;
  return { total: tot, parType, grosses, petites, jours, parMois: jours ? tot.nombre / (jours / 30.44) : null, bougies: B.length };
}

/* ───── REGISTRE : une flèche confirmée ne bouge plus et n'est annoncée qu'une fois ───── */
export const idFleche = (actif, f) => `${actif}|${f.t}|${f.dir}|${f.type}`;
export function fusionnerRegistre(actif, existantes = [], calculees = []) {
  const vus = new Set(existantes.map(f => f.id)), out = existantes.slice();
  for (const f of calculees.slice().sort((x, y) => x.tFin - y.tFin)) {
    const id = idFleche(actif, f); if (vus.has(id)) continue;
    const der = out[out.length - 1]; if (der && f.tFin < der.tFin) continue;   // jamais d'insertion dans le passé
    out.push({ id, type: f.type, dir: f.dir, t: f.t, tFin: f.tFin, entree: f.entree, stop: f.stop, R: f.R, atr: f.atr, grosse: !!f.grosse, ma200: f.ma200, zone: f.zone ?? null, mode: 'h4', iH4: f.iH4 ?? null, vueLe: null }); vus.add(id);
  }
  return out;
}
/* une flèche du registre (sans index) retrouve sa bougie H4 par son heure d'ouverture : nécessaire pour `suivre` */
export function ancrer(f, B) {
  const g = { ...f }; g.iH4 = (B || []).findIndex(b => b.t === f.t); if (g.iH4 < 0) return null;
  if (!Number.isFinite(g.atr) || !g.atr) g.atr = g.R || Math.abs(f.entree - f.stop); if (!Number.isFinite(g.R) || !g.R) g.R = g.atr;
  return g;
}

/* ───── style, placement, textes ───── */
export const COULEURS = Object.freeze({ haussier: [95, 184, 148], baissier: [216, 106, 106], fond: { 1: 'rgba(95,184,148,0.11)', '-1': 'rgba(216,106,106,0.11)', 0: 'rgba(150,160,170,0.08)' }, zone: { 1: 'rgba(95,184,148,0.16)', '-1': 'rgba(216,106,106,0.16)' } });
/* grosse flèche = MA200 H4 et zone majeure au même endroit, petite = les autres cas ; haussier = verte vers le haut sous la bougie, baissier = rouge vers le bas au-dessus ; sans texte */
export function styleFleche(f) {
  const [r, g, b] = f.dir > 0 ? COULEURS.haussier : COULEURS.baissier;
  return { couleur: `rgba(${r},${g},${b},1)`, position: f.dir > 0 ? 'belowBar' : 'aboveBar', forme: f.dir > 0 ? 'arrowUp' : 'arrowDown', taille: f.grosse ? 2.6 : 1.2 };
}
/* la bougie affichée qui CONTIENT l'instant de confirmation (clôture de la bougie H4) : la même heure sur H1, H4 et Jour. Renvoie l'index de la bougie, ou −1. */
export function indexSurUnite(Bunite, f, pas) {
  if (!Bunite || !Bunite.length || !(pas > 0)) return -1;
  const m = f.tFin - 1;
  for (let i = Bunite.length - 1; i >= 0; i--) if (Bunite[i].t <= m && m < Bunite[i].t + pas) return i;
  return -1;
}
/* côté de la MA200 H4 (tendance) pour chaque bougie affichée (fond du graphique) : la dernière bougie H4 CLÔTURÉE à l'ouverture de la bougie affichée (Jour : à sa clôture) */
export function sensPourBougies(Bunite, tableau, pas) {
  const out = []; let k = -1;
  for (const b of Bunite) { const lim = pas >= J ? b.t + pas : b.t; while (k + 1 < tableau.length && tableau[k + 1].tFin <= lim) k++; out.push(k < 0 ? 0 : tableau[k].sens); }
  return out;
}
/* valeur de la MA200 H4 pour chaque bougie affichée (même règle que le fond) : la ligne est la même sur H1, H4 et Jour */
export function ma200PourBougies(Bunite, B4, M, pas) {
  const out = []; let k = -1;
  for (const b of Bunite) { const lim = pas >= J ? b.t + pas : b.t + pas; while (k + 1 < B4.length && B4[k + 1].t + H4 <= lim) k++; out.push(k < 0 ? null : M[k]); }
  return out;
}
export function niveauParle(v) {
  if (!Number.isFinite(v)) return '';
  const d = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 2 : 4;
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d }).replace(/[  ]/g, ' ');
}
export const typeNom = f => (f.type === 'retest' ? 'Cassure + retest' : f.type === 'zone' ? 'Rebond sur zone' : 'Rebond MA200');
export const typeLibelle = f => (f.type === 'retest' ? `cassure ${f.dir > 0 ? 'haussière' : 'baissière'} puis retest de la MA200 H4` : f.type === 'zone' ? `rebond ${f.dir > 0 ? 'haussier sur un support' : 'baissier sur une résistance'} majeur H4` : `rebond ${f.dir > 0 ? 'haussier' : 'baissier'} sur la MA200 H4`) + (f.grosse ? ' (MA200 et zone majeure au même endroit)' : '');
export const phraseFleche = (nom, f) => `${nom} : ${f.dir > 0 ? 'achat' : 'vente'}, ${typeLibelle(f)}, entrée vers ${niveauParle(f.entree)}, stop ${niveauParle(f.stop)}`;
