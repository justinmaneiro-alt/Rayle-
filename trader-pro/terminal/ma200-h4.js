/* ═════════════ CASSURE DE LA MA200 H4 (module PUR, testé, navigateur et Node) ═════════════
   Un seul indicateur : la MA200 H4 (moyenne simple sur 200 clôtures H4), tracée sur H1, H4 et Jour. Tout est calculé sur les bougies H4 clôturées.
   Cassure validée = 2 clôtures H4 d'affilée du même côté de la MA200 H4 (une seule clôture ne suffit pas : fausse cassure).
   - 2 clôtures au-dessus → flèche verte d'ACHAT, posée tout en bas du mouvement : sous le plus bas atteint avant la cassure ;
   - 2 clôtures en dessous → flèche rouge de VENTE, posée tout en haut du mouvement : au-dessus du plus haut atteint avant la cassure.
   Les flèches ALTERNENT toujours (achat, vente, achat…) : jamais deux flèches du même sens d'affilée.
   Le mouvement = depuis la flèche précédente (la première flèche : depuis le début de la série de clôtures de l'autre côté de la MA200).
   La flèche est connue à la 2e clôture (alerte à ce moment-là) ; elle est dessinée sur la bougie qui porte l'extrême du mouvement. Bougies : { t (ouverture, ms UTC), o, h, l, c }. */
import { sma } from '../commun/analyse.js';

export const J = 86400e3, H4 = 4 * 3600e3;
export const PARAMS = Object.freeze({ MA_N: 200, confirmations: 2 });
/* identifiant de l'algorithme : fait partie de la clé du registre sur l'appareil (un changement de règles n'hérite jamais des flèches de l'ancienne version) */
export const ALGO_ID = () => 'cassure-ma200-v1';
export const cloturees = (B, maintenant = Date.now(), pas = H4) => (B || []).filter(b => b.t + pas <= maintenant);

export function analyser(Bh, { params = PARAMS, maintenant = Date.now() } = {}) {
  const P = params, B = cloturees(Bh, maintenant), n = B.length, M = sma(B.map(b => b.c), P.MA_N), cote = B.map((b, i) => (M[i] == null ? 0 : b.c > M[i] ? 1 : b.c < M[i] ? -1 : 0));
  const fleches = []; let dernier = null;
  for (let i = P.confirmations - 1; i < n; i++) {
    const d = cote[i]; if (!d || (dernier && dernier.dir === d)) continue;
    let ok = true; for (let k = 0; k < P.confirmations && ok; k++) ok = cote[i - k] === d; if (!ok) continue;
    /* début du mouvement : la flèche précédente, ou le début de la série de clôtures de l'autre côté de la MA200 */
    let debut = dernier ? dernier.iH4 : i - P.confirmations + 1; if (!dernier) while (debut > 0 && cote[debut - 1] === -d) debut--;
    let ext = i; for (let k = debut; k <= i; k++) if (d > 0 ? B[k].l < B[ext].l : B[k].h > B[ext].h) ext = k;
    const f = { type: 'cassure', dir: d, t: B[i].t, tFin: B[i].t + H4, entree: B[i].c, stop: d > 0 ? B[ext].l : B[ext].h, ma200: M[i], tExt: B[ext].t, mode: 'h4', iH4: i };
    fleches.push(f); dernier = f;
  }
  const sens = B.map((b, k) => ({ t: b.t, tFin: b.t + H4, sens: cote[k], cote: cote[k] }));
  return { B, M, cote, fleches, sens };
}

/* ───── REGISTRE : une flèche confirmée ne bouge plus et n'est annoncée qu'une fois ───── */
export const idFleche = (actif, f) => `${actif}|${f.t}|${f.dir}|${f.type}`;
export function fusionnerRegistre(actif, existantes = [], calculees = []) {
  const vus = new Set(existantes.map(f => f.id)), out = existantes.slice();
  for (const f of calculees.slice().sort((x, y) => x.tFin - y.tFin)) {
    const id = idFleche(actif, f); if (vus.has(id)) continue;
    const der = out[out.length - 1]; if (der && f.tFin < der.tFin) continue;   // jamais d'insertion dans le passé
    out.push({ id, type: f.type, dir: f.dir, t: f.t, tFin: f.tFin, entree: f.entree, stop: f.stop, ma200: f.ma200, tExt: f.tExt, mode: 'h4', iH4: f.iH4 ?? null, vueLe: null }); vus.add(id);
  }
  return out;
}

/* ───── style, placement, textes ───── */
export const COULEURS = Object.freeze({ haussier: [95, 184, 148], baissier: [216, 106, 106] });
/* verte ▲ sous la bougie (achat), rouge ▼ au-dessus (vente) ; sans texte ; une seule taille */
export function styleFleche(f) {
  const [r, g, b] = f.dir > 0 ? COULEURS.haussier : COULEURS.baissier;
  return { couleur: `rgba(${r},${g},${b},1)`, position: f.dir > 0 ? 'belowBar' : 'aboveBar', forme: f.dir > 0 ? 'arrowUp' : 'arrowDown', taille: 2 };
}
/* la bougie affichée qui porte la flèche : celle qui contient l'extrême du mouvement (plus bas / plus haut avant la cassure), sinon la bougie de confirmation. Renvoie l'index, ou −1. */
export function indexSurUnite(Bunite, f, pas) {
  if (!Bunite || !Bunite.length || !(pas > 0)) return -1;
  const m = (Number.isFinite(f.tExt) ? f.tExt + H4 : f.tFin) - 1;
  for (let i = Bunite.length - 1; i >= 0; i--) if (Bunite[i].t <= m && m < Bunite[i].t + pas) return i;
  return -1;
}
/* valeur de la MA200 H4 pour chaque bougie affichée : la dernière bougie H4 CLÔTURÉE à la clôture de la bougie affichée ; la ligne est la même sur H1, H4 et Jour */
export function ma200PourBougies(Bunite, B4, M, pas) {
  const out = []; let k = -1;
  for (const b of Bunite) { const lim = b.t + pas; while (k + 1 < B4.length && B4[k + 1].t + H4 <= lim) k++; out.push(k < 0 ? null : M[k]); }
  return out;
}
export function niveauParle(v) {
  if (!Number.isFinite(v)) return '';
  const d = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 2 : 4;
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d }).replace(/[  ]/g, ' ');
}
export const typeNom = f => (f.dir > 0 ? 'Cassure à la hausse' : 'Cassure à la baisse');
export const typeLibelle = f => `cassure MA200 H4 à la ${f.dir > 0 ? 'hausse' : 'baisse'}`;
export const phraseFleche = (nom, f) => `${nom} : ${typeLibelle(f)}`;
