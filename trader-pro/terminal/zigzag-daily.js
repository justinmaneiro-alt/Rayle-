/* ═════════════ FLÈCHES DAILY : sommets et creux MAJEURS (zigzag basé sur l'ATR, module PUR, testé, navigateur et Node) ═════════════
   Une flèche = un sommet ou un creux majeur du Daily, CONFIRMÉ. Rouge vers le bas AU-DESSUS de la mèche du sommet, verte vers le haut SOUS la mèche du creux, posée sur la bougie EXTRÊME
   (pas sur la bougie de confirmation). Aucune étiquette.
   Règles (fixées par la consigne) :
   - ATR(14) Daily ; sommet confirmé quand la CLÔTURE d'une bougie est au moins `mult` × ATR sous le plus haut du mouvement ; creux : le miroir (clôture `mult` × ATR au-dessus du plus bas) ;
   - au moins `ESPACE_MIN` bougies Daily entre deux flèches ; alternance STRICTE (sommet, creux, sommet…) : tant qu'un creux n'est pas confirmé, un nouveau plus haut DÉPLACE le sommet en cours
     (jamais de seconde flèche) ;
   - CAUSAL, donc sans repaint : la flèche confirmée à la bougie i n'utilise que les bougies 0…i ; ni le sommet en cours ni le creux en cours ne sont dessinés (pas de flèche « en formation ») ;
   - tendance : MA200 Daily. Un creux au-dessus de la MA200 ou un sommet en dessous = dans le sens de la tendance (`pleine` = vrai, flèche pleine) ; sinon (ou sans 200 bougies) flèche pâle.
   Bougie = { t (ouverture, ms UTC), o, h, l, c }. Les bougies passées doivent être CLÔTURÉES (la bougie du jour en cours est écartée par `cloturees`). */
import { atr, sma } from '../commun/analyse.js';

export const J = 86400e3;
export const MULT_DEFAUT = 2.5, ESPACE_MIN = 5, ATR_N = 14, MA_N = 200, OPACITE_PALE = 0.4;
/* multiplicateur retenu PAR ACTIF après vérification sur tout l'historique Daily (voir VERIFICATION-FLECHES.md) ; 2,5 tant que l'actif n'a pas besoin d'autre chose */
export const MULT_PAR_ACTIF = Object.freeze({ or: 2.5, us100: 2.5, us500: 2.5, btc: 2.5, sol: 2.5, doge: 2.5 });
export const multDe = (id, reglages = null) => { const v = reglages && Number(reglages[id]); return Number.isFinite(v) && v >= 0.5 && v <= 10 ? v : (MULT_PAR_ACTIF[id] ?? MULT_DEFAUT); };

/* bougies Daily CLÔTURÉES (la bougie du jour en cours est écartée) */
export const cloturees = (B, maintenant = Date.now()) => (B || []).filter(b => b.t + J <= maintenant);

/* zigzag : renvoie les flèches confirmées, dans l'ordre. i = index de la bougie EXTRÊME, iConf = index de la bougie qui confirme.
   dir = −1 : sommet (flèche rouge vers le bas) ; dir = +1 : creux (flèche verte vers le haut). */
export function zigzag(B, { mult = MULT_DEFAUT, espace = ESPACE_MIN } = {}) {
  const out = [], n = B.length, A = atr(B, ATR_N), M = sma(B.map(b => b.c), MA_N);
  /* mode 0 : rien de confirmé (on suit plus haut ET plus bas) ; −1 : dernier = sommet, on cherche un creux ; +1 : dernier = creux, on cherche un sommet.
     Un candidat (plus haut / plus bas du mouvement) doit se trouver à au moins `espace` bougies de la dernière flèche : sinon il ne peut pas devenir une flèche. */
  let mode = 0, hi = -1, lo = -1, derniere = -1e9;
  const pousser = (k, dir, i) => {
    const pleine = M[k] == null ? false : dir > 0 ? B[k].l > M[k] : B[k].h < M[k];
    out.push({ i: k, t: B[k].t, dir, iConf: i, tConf: B[i].t, tCloture: B[i].t + J, niveau: dir < 0 ? B[k].h : B[k].l, pleine, ma200: M[k], atr: A[i], mult });
    derniere = k; hi = -1; lo = -1;
    for (let x = k + espace; x <= i; x++) { if (dir < 0 ? (lo < 0 || B[x].l <= B[lo].l) : (hi < 0 || B[x].h >= B[hi].h)) { if (dir < 0) lo = x; else hi = x; } }   // le candidat suivant repart des bougies déjà vues
  };
  for (let i = 0; i < n; i++) {
    const libre = i - derniere >= espace;
    if (mode >= 0 && libre && (hi < 0 || B[i].h >= B[hi].h)) hi = i;     // un nouveau plus haut DÉPLACE le sommet en cours
    if (mode <= 0 && libre && (lo < 0 || B[i].l <= B[lo].l)) lo = i;
    const a = A[i]; if (a == null) continue;
    const sommet = hi >= 0 && B[i].c <= B[hi].h - mult * a, creux = lo >= 0 && B[i].c >= B[lo].l + mult * a;
    if (mode === 0) { if (sommet && (!creux || hi < lo)) { pousser(hi, -1, i); mode = -1; } else if (creux) { pousser(lo, +1, i); mode = +1; } }
    else if (mode === -1) { if (creux) { pousser(lo, +1, i); mode = +1; } }
    else if (sommet) { pousser(hi, -1, i); mode = -1; }
  }
  return out;
}

/* ───── REGISTRE : une flèche confirmée ne bouge plus et ne disparaît plus ─────
   `existantes` : flèches déjà publiées sur cet appareil ; `calculees` : flèches recalculées sur les bougies actuelles. On garde les existantes TELLES QUELLES et on n'ajoute que les nouvelles
   (confirmées après la dernière flèche connue ET dans le sens opposé : l'alternance reste stricte même si l'historique chargé change de point de départ). Une flèche qui ne se reproduirait
   plus reste affichée. Les nouvelles flèches ont `vueLe = null` (pas encore annoncées). */
export const idFleche = (actif, f) => `${actif}|${f.t}|${f.dir}`;
export function fusionnerRegistre(actif, existantes = [], calculees = []) {
  const vus = new Set(existantes.map(f => f.id)), out = existantes.slice();
  for (const f of calculees.slice().sort((x, y) => x.tCloture - y.tCloture)) {
    const id = idFleche(actif, f); if (vus.has(id)) continue;
    const der = out[out.length - 1];
    if (der && (f.tCloture <= der.tCloture || f.dir === der.dir || f.t <= der.t)) continue;   // alternance stricte et jamais d'insertion dans le passé
    out.push({ id, t: f.t, dir: f.dir, tConf: f.tConf, tCloture: f.tCloture, niveau: f.niveau, pleine: f.pleine, vueLe: null }); vus.add(id);
  }
  return out;
}

/* style d'une flèche : couleur et opacité (pleine = dans le sens de la tendance, pâle = contre la tendance) */
export const COULEURS = Object.freeze({ creux: [95, 184, 148], sommet: [216, 106, 106] });
export function styleFleche(f) {
  const [r, g, b] = f.dir > 0 ? COULEURS.creux : COULEURS.sommet, alpha = f.pleine ? 1 : OPACITE_PALE;
  return { couleur: `rgba(${r},${g},${b},${alpha})`, alpha, position: f.dir > 0 ? 'belowBar' : 'aboveBar', forme: f.dir > 0 ? 'arrowUp' : 'arrowDown' };
}

/* ───── placement sur un graphique H1 / H4 / Jour ─────
   Une flèche appartient à la bougie Daily extrême `t`. Jour : la bougie Daily elle-même. H4 : la bougie H4 de CETTE journée qui contient le plus haut (sommet) ou le plus bas (creux) exact.
   H1 : aucune flèche. `Bunite` : bougies affichées (t ascendant), `pas` : durée d'une bougie en ms. Renvoie l'index de la bougie, ou −1. */
export function indexSurUnite(Bunite, f, pas) {
  if (!Bunite || !Bunite.length || pas < 4 * 3600e3 - 1) return -1;
  if (pas >= J) { for (let i = Bunite.length - 1; i >= 0; i--) if (Bunite[i].t <= f.t && f.t < Bunite[i].t + pas) return i; return -1; }
  const j0 = Math.floor(f.t / J) * J;   // jour UTC de la bougie Daily (les futures Yahoo sont horodatés 04:00 / 05:00 UTC : c'est bien la même journée)
  let r = -1;
  for (let i = 0; i < Bunite.length; i++) {
    const b = Bunite[i]; if (b.t >= j0 + J) break; if (b.t < j0 || b.t + pas > j0 + J + 1) continue;   // bougies H4 entièrement dans la journée (UTC)
    if (r < 0 || (f.dir < 0 ? b.h >= Bunite[r].h : b.l <= Bunite[r].l)) r = i;
  }
  return r;
}

/* texte lu par Rayle et envoyé à Telegram : « Or : sommet Daily confirmé, vers 2 650 » */
export function niveauParle(v) {
  if (!Number.isFinite(v)) return '';
  const d = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 2 : 4;
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d }).replace(/[  ]/g, ' ');
}
export const phraseFleche = (nom, f) => `${nom} : ${f.dir < 0 ? 'sommet' : 'creux'} Daily confirmé, vers ${niveauParle(f.niveau)}`;
