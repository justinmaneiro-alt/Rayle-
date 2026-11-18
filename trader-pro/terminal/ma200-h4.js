/* ═════════════ FLÈCHES MA200 DE SUIVI DE TENDANCE (module PUR, testé, navigateur et Node) ═════════════
   Chaque unité de temps a sa propre MA200 (moyenne simple de 200 clôtures) : MA200 H4 sur H4, MA200 Jour sur Jour ; sur H1 on affiche la MA200 H4 et ses flèches.
   Tout est calculé avec les données PASSÉES, bougie par bougie : la flèche est posée SUR LA BOUGIE DE CONFIRMATION (là où l'on achète ou vend), jamais en arrière dans le temps.
   - CASSURE : une bougie clôture de l'autre côté de la MA200 avec au moins 0,3 ATR14 de marge → petite flèche sur cette bougie (verte dessous si hausse, rouge dessus si baisse) ; la tendance change.
   - REBOND : en tendance haussière, le prix revient toucher la MA200 par le haut (le plus bas de la bougie atteint la MA) et la bougie clôture au-dessus → petite flèche verte ; en baissière, l'inverse → rouge.
     Une seule flèche par retour sur la MA : le prix doit s'éloigner d'au moins 1 ATR de la MA avant qu'une nouvelle flèche de rebond soit possible (après une cassure ou un rebond).
   - Jamais de flèche contre la tendance : seule une nouvelle cassure la change. La tendance initiale est le côté de la première clôture au-delà de la MA200 (sans flèche).
   Bougies : { t (ouverture, ms UTC), o, h, l, c }. */
import { atr, sma } from '../commun/analyse.js';

export const J = 86400e3, H4 = 4 * 3600e3;
export const PAS = Object.freeze({ H4, J });
export const PARAMS = Object.freeze({ MA_N: 200, ATR_N: 14, margeCassure: 0.3, eloignement: 1 });
/* identifiant de l'algorithme : fait partie de la clé du registre sur l'appareil (un changement de règles n'hérite jamais des flèches de l'ancienne version) */
export const ALGO_ID = () => 'suivi-ma200-v1';
export const cloturees = (B, maintenant = Date.now(), pas = H4) => (B || []).filter(b => b.t + pas <= maintenant);
export const NOM_UNITE = Object.freeze({ H4: 'H4', J: 'Jour' });

/* analyse d'une unité : `B` = bougies de CETTE unité (H4 ou J), `unite` = 'H4' | 'J' */
export function analyserUnite(Bbrut, unite = 'H4', { params = PARAMS, maintenant = Date.now() } = {}) {
  const P = params, pas = PAS[unite], B = cloturees(Bbrut, maintenant, pas), n = B.length, M = sma(B.map(b => b.c), P.MA_N), A = atr(B, P.ATR_N);
  const tend = new Array(n).fill(0), fleches = []; let t = 0, arme = false;
  for (let i = 0; i < n; i++) {
    const m = M[i], a = A[i], b = B[i]; if (m == null || a == null) continue;
    if (t === 0) { if (Math.abs(b.c - m) >= P.margeCassure * a) { t = b.c > m ? 1 : -1; arme = t > 0 ? b.h - m >= P.eloignement * a : m - b.l >= P.eloignement * a; } tend[i] = t; continue; }   // tendance initiale : sans flèche
    const pousse = (type, dir) => fleches.push({ type, dir, unite, t: b.t, tFin: b.t + pas, entree: b.c, ma200: m, atr: a, mode: unite === 'J' ? 'jour' : 'h4', iH4: i });
    if (t > 0 ? b.c < m - P.margeCassure * a : b.c > m + P.margeCassure * a) { t = -t; arme = false; pousse('cassure', t); tend[i] = t; continue; }   // cassure : la tendance change
    if (!arme && (t > 0 ? b.h - m >= P.eloignement * a : m - b.l >= P.eloignement * a)) arme = true;   // le prix s'est éloigné d'au moins 1 ATR de la MA
    else if (arme && (t > 0 ? b.l <= m && b.c > m : b.h >= m && b.c < m)) { pousse('rebond', t); arme = false; }   // retour sur la MA par le bon côté, clôture du bon côté
    tend[i] = t;
  }
  return { unite, B, M, A, tend, fleches, sens: B.map((b, k) => ({ t: b.t, tFin: b.t + pas, sens: tend[k], cote: tend[k] })) };
}

/* ───── REGISTRE : une flèche confirmée ne bouge plus et n'est annoncée qu'une fois ───── */
export const idFleche = (actif, f) => `${actif}|${f.unite || 'H4'}|${f.t}|${f.dir}|${f.type}`;
export function fusionnerRegistre(actif, existantes = [], calculees = []) {
  const vus = new Set(existantes.map(f => f.id)), out = existantes.slice();
  for (const f of calculees.slice().sort((x, y) => x.tFin - y.tFin)) {
    const id = idFleche(actif, f); if (vus.has(id)) continue;
    const der = out[out.length - 1]; if (der && f.tFin < der.tFin) continue;   // jamais d'insertion dans le passé
    out.push({ id, type: f.type, dir: f.dir, unite: f.unite || 'H4', t: f.t, tFin: f.tFin, entree: f.entree, ma200: f.ma200, atr: f.atr, vueLe: null }); vus.add(id);
  }
  return out;
}

/* ───── style, placement, textes ───── */
export const COULEURS = Object.freeze({ haussier: [95, 184, 148], baissier: [216, 106, 106], fond: { 1: 'rgba(95,184,148,0.09)', '-1': 'rgba(216,106,106,0.09)', 0: 'rgba(150,160,170,0.05)' } });
/* petite flèche : verte ▲ sous la bougie (achat), rouge ▼ au-dessus (vente) ; sans texte */
export function styleFleche(f) {
  const [r, g, b] = f.dir > 0 ? COULEURS.haussier : COULEURS.baissier;
  return { couleur: `rgba(${r},${g},${b},1)`, position: f.dir > 0 ? 'belowBar' : 'aboveBar', forme: f.dir > 0 ? 'arrowUp' : 'arrowDown', taille: 1.3 };
}
/* la bougie affichée qui CONTIENT l'instant de confirmation (la clôture de la bougie de l'unité d'analyse). Renvoie l'index, ou −1. */
export function indexSurUnite(Bunite, f, pas) {
  if (!Bunite || !Bunite.length || !(pas > 0)) return -1;
  const m = f.tFin - 1;
  for (let i = Bunite.length - 1; i >= 0; i--) if (Bunite[i].t <= m && m < Bunite[i].t + pas) return i;
  return -1;
}
/* valeur de la MA200 (calculée sur les bougies `Bsrc` de pas `pasSrc`) pour chaque bougie affichée : la dernière bougie source CLÔTURÉE à la clôture de la bougie affichée */
export function ma200PourBougies(Bunite, Bsrc, M, pas, pasSrc = H4) {
  const out = []; let k = -1;
  for (const b of Bunite) { const lim = b.t + pas; while (k + 1 < Bsrc.length && Bsrc[k + 1].t + pasSrc <= lim) k++; out.push(k < 0 ? null : M[k]); }
  return out;
}
/* tendance de la source pour chaque bougie affichée (fond du graphique) : H1 / H4 : connue à l'ouverture de la bougie ; Jour : à sa clôture */
export function sensPourBougies(Bunite, tableau, pas) {
  const out = []; let k = -1;
  for (const b of Bunite) { const lim = pas >= J ? b.t + pas : b.t; while (k + 1 < tableau.length && tableau[k + 1].tFin <= lim) k++; out.push(k < 0 ? 0 : tableau[k].sens); }
  return out;
}
export function niveauParle(v) {
  if (!Number.isFinite(v)) return '';
  const d = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 2 : 4;
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d }).replace(/[  ]/g, ' ');
}
export const typeNom = f => (f.type === 'rebond' ? 'Rebond' : 'Cassure');
/* « cassure MA200 H4 à la hausse », « rebond MA200 Jour à l'achat » */
export const typeLibelle = f => (f.type === 'rebond' ? `rebond MA200 ${NOM_UNITE[f.unite || 'H4']} à ${f.dir > 0 ? 'l’achat' : 'la vente'}` : `cassure MA200 ${NOM_UNITE[f.unite || 'H4']} à la ${f.dir > 0 ? 'hausse' : 'baisse'}`);
export const phraseFleche = (nom, f) => `${nom} : ${typeLibelle(f)}`;
