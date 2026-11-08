/* ═════════════ VERSION 10 : SURVEILLANCE DE MES OUTILS DESSINÉS, FLÈCHES ET CROIX (pur, testé) ═════════════
   Règles FIGÉES « fleches-v10 », écrites le 2026-11-08 AVANT le code et tout test, dans leur propre commit (la date de ce commit ouvre le
   bilan de v10). Les seuils viennent de la consigne (0,5 ATR, 0,25 ATR, 1 ATR, 0,5 ATR, 48 bougies, 30 événements) ou sont repris de v2
   (ATR, bilan) ; les autres sont fixés ici une fois pour toutes. Aucun seuil réglé d'après les graphiques. v1 à v9 restent intactes et
   calculées en parallèle. Informations de lecture, pas un signal ni une promesse ; jamais un ordre. */

export const REGLES_V10 = Object.freeze({
  version: 'fleches-v10', ecrites: '2026-11-08',
  unite: 'H1',                     // détection sur les bougies H1 CLOSES de Kraken PF_XAUUSD (prix du graphique)
  atrN: 14,                        // ATR = moyenne simple des 14 dernières étendues vraies H1, connue à la clôture de la bougie d'avant
  approcheAtr: 0.5,                // approche : extrême de la bougie à moins de 0,5 ATR de l'objet
  toucheAtr: 0.25,                 // touche : extrême de la bougie à au plus 0,25 ATR de l'objet (ou au-delà)
  reboundAtr: 1,                   // rebond confirmé : clôture à au moins 1 ATR du bon côté, sans nouvel extrême depuis la touche
  cassureAtr: 0.5,                 // cassure confirmée : clôture à au moins 0,5 ATR au-delà de l'objet
  finApprocheAtr: 1,               // une approche finit à la première clôture à au moins 1 ATR de l'objet (de son côté)
  excursionBougies: 48,            // registre : excursion favorable / défavorable sur les 48 bougies H1 suivantes, en ATR et en %
  minEvenements: 30,               // bilan par type d'outil : « pas assez de données » sous 30 événements
  delaiAlerteMin: 30,              // alertes : une alerte identique (même objet, même type) au plus toutes les 30 minutes
  // bilan des flèches (repris de v2)
  suiviBougies: 8, suiviAtr: 1, regroupementBougies: 8, hasard: 1000, minFleches: 30, decision: 100, fraisTaker: 0.0005
});

export const TEXTE_REGLES_V10 = `Règles figées ${REGLES_V10.version} (écrites le ${REGLES_V10.ecrites}, avant le code et tout test, dans leur propre commit) :
- surveillance : sur les bougies H1 CLOSES de Kraken PF_XAUUSD (aucun repeint : un événement de la bougie i n'utilise que les bougies jusqu'à i) ; ATR = moyenne simple des 14 dernières étendues vraies H1 à la bougie d'avant ; chaque objet n'est surveillé qu'à partir de sa création (ou de sa confirmation pour un niveau proposé) ;
- valeur de l'objet à la bougie : ligne horizontale = son prix ; zone = de son bas à son haut ; ligne de tendance et rayon = la droite passant par leurs deux ancres, à l'heure de la bougie (surveillée à partir de la première ancre, prolongée à droite) ; position = ses trois prix ;
- côté : l'objet est un support si la clôture précédente est au-dessus de lui, une résistance si elle est au-dessous (zone : clôture au-dessus du haut ou au-dessous du bas ; dans la zone, le dernier côté connu) ; distance = écart entre l'extrême de la bougie tourné vers l'objet (plus bas pour un support, plus haut pour une résistance) et l'objet, 0 s'il l'atteint ou le dépasse ;
- approche : distance ≤ 0,5 ATR alors que l'approche précédente est finie ; une alerte légère ; touche : distance ≤ 0,25 ATR, une fois par approche ; une approche finit à la première clôture à au moins 1 ATR de l'objet, de son côté ;
- rebond confirmé (flèche v10) : après une touche, la première bougie qui CLÔTURE à au moins 1 ATR du bon côté (au-dessus d'un support, au-dessous d'une résistance), sans qu'aucune bougie depuis la touche (elle comprise) n'ait fait un nouvel extrême au-delà de celui de la touche ; petite flèche verte sur un support, rouge sur une résistance, posée à cette clôture, jamais déplacée ; une seule par objet et par approche ; un nouvel extrême annule l'attente (une nouvelle touche de la même approche peut la relancer) ;
- cassure confirmée : une CLÔTURE à au moins 0,5 ATR au-delà de l'objet → petite croix à cette bougie ; l'objet est marqué « retourné » (ancien support → résistance et inversement) et une nouvelle approche peut commencer ;
- position : touche de l'entrée, du stop, de l'objectif (une fois chacune), et +1 R atteint dans le sens de la position (proposer de passer à break-even) ; sens : achat si le stop est sous l'entrée ;
- alerte de prix libre (case « m'alerter ») : le prix atteint l'objet (distance 0), une fois par approche ;
- alertes : historique (objet, type, prix, heure) ; jamais deux alertes identiques (même objet, même type, même bougie) ; au plus une alerte du même type pour le même objet toutes les 30 minutes ; elles ne fonctionnent que tant que Rayle est ouvert ;
- registre daté, en ajout seul : chaque approche, touche, rebond confirmé et cassure, puis (quand les 48 bougies suivantes sont closes) son excursion favorable et défavorable, en ATR et en %, dans le sens du rebond (cassure : dans le sens de la cassure) ; jamais utilisé comme décision ; bilan par type d'outil, « pas assez de données » sous 30 événements ;
- bilan des flèches v10 depuis la date du commit de ces règles, mêmes mesures que v2 (flèches indépendantes à 8 bougies, +1 ATR avant −1 ATR en 8 bougies, R net après frais preneur 0,05 % par côté et spread mesuré, 1000 tirages au hasard même régime et mêmes heures, « pas assez de données » sous 30) ; correction de Holm sur toutes les versions suivies (v1 à v10) ; aucune décision avant 100 flèches indépendantes nouvelles.`;

/* ───────────── calcul (ajouté après le commit des règles eceda99 ; aucune règle ci-dessus n'a changé) ───────────── */
import { atrLocal } from './niveaux-periode.js';
import { bilanH1, DEPUIS_H1_V2 } from './fleches-h1-v2.js';
import { holm, deuxProportions } from './zones-or.js';
import { valeur } from './outils-calcul.js';

/* date du commit des règles v10 (eceda99, 2026-11-08 16:14:02 heure de Paris) : début du bilan de v10 */
export const DEPUIS_V10 = Object.freeze({ commit: 'eceda99', t: 1794150842000, texte: '8 nov. 2026, 16 h 14' });
const H = 3600e3;

/* surveillance d'un objet (ligne, zone, tendance, rayon) sur les bougies H1 closes C ; strictement causal.
   Rend les événements (approche, touche, rebond, cassure, alerte), les flèches et les croix. */
export function surveillerObjet(C, A, o, R = REGLES_V10) {
  const ev = [], fleches = [], croix = []; let cote = null, approche = false, touche = false, attente = null, flecheFaite = false, alerteFaite = false, retourne = false;
  const pousser = (type, i, niveau, extra = {}) => ev.push({ id: `${o.id}|${type}|${C[i].t}`, objet: o.id, outil: o.type, type, t: C[i].t, prix: C[i].c, niveau, cote, atr: A[i - 1], ...extra });
  for (let i = 1; i < C.length; i++) {
    const b = C[i], a = A[i - 1]; if (!a || b.t + H <= o.cree) continue;
    const v = valeur(o, b.t); if (v == null) continue;
    const bas = typeof v === 'object' ? v.bas : v, haut = typeof v === 'object' ? v.haut : v, ref = C[i - 1].c;
    const c2 = ref > haut ? 'support' : ref < bas ? 'resistance' : cote; if (!c2) continue;
    if (c2 !== cote && cote != null) { approche = false; touche = false; attente = null; flecheFaite = false; alerteFaite = false; }
    cote = c2;
    const sup = cote === 'support', bord = sup ? haut : bas, loin = sup ? bas : haut, ext = sup ? b.l : b.h, d = Math.max(0, sup ? ext - bord : bord - ext);
    // cassure confirmée : clôture à ≥ 0,5 ATR au-delà de l'objet (au-delà de son bord éloigné pour une zone)
    if (sup ? b.c <= loin - R.cassureAtr * a : b.c >= loin + R.cassureAtr * a) {
      retourne = !retourne; pousser('cassure', i, loin, { retourne }); croix.push({ t: b.t, i, niveau: loin, objet: o.id, sens: sup ? 'baisse' : 'hausse' });
      approche = false; touche = false; attente = null; flecheFaite = false; alerteFaite = false; cote = sup ? 'resistance' : 'support'; continue;
    }
    if (!approche && d <= R.approcheAtr * a) { approche = true; touche = false; attente = null; flecheFaite = false; pousser('approche', i, bord); }
    if (approche && d <= R.toucheAtr * a) {
      if (!touche) { touche = true; pousser('touche', i, bord); }
      if (!attente && !flecheFaite) attente = { j: i, ext };
    }
    if (o.alerte && !alerteFaite && d === 0) { alerteFaite = true; pousser('alerte', i, bord); }
    // nouvel extrême au-delà de celui de la touche : l'attente est annulée (relancée si la bougie retouche l'objet)
    if (attente && i > attente.j && (sup ? b.l < attente.ext : b.h > attente.ext)) attente = (d <= R.toucheAtr * a && !flecheFaite) ? { j: i, ext } : null;
    const loinDuBord = sup ? b.c >= bord + R.reboundAtr * a : b.c <= bord - R.reboundAtr * a;
    // la clôture de la bougie de touche vient après la touche : elle peut confirmer (rejet net) ; sinon la première bougie suivante
    if (attente && i >= attente.j && !flecheFaite && loinDuBord) {
      flecheFaite = true; const f = { t: b.t, i, sens: sup ? 'hausse' : 'baisse', niveau: bord, objet: o.id, outil: o.type, atr: a, tTouche: C[attente.j].t, version: R.version };
      fleches.push(f); pousser('rebond', i, bord, { sens: f.sens, tTouche: f.tTouche }); attente = null;
    }
    // fin de l'approche : clôture à ≥ 1 ATR de l'objet, de son côté
    if (approche && (sup ? b.c >= bord + R.finApprocheAtr * a : b.c <= bord - R.finApprocheAtr * a)) { approche = false; touche = false; attente = null; flecheFaite = false; alerteFaite = false; }
  }
  return { ev, fleches, croix, cote, retourne };
}
/* surveillance d'une position : touche de l'entrée, du stop, de l'objectif ; +1 R (après la touche de l'entrée) */
export function surveillerPosition(C, A, o) {
  const ev = [], d = o.stop < o.entree ? 1 : -1, risque = Math.abs(o.entree - o.stop), un = o.entree + d * risque, fait = {};
  const pousser = (type, i, niveau) => { if (fait[type]) return; fait[type] = true; ev.push({ id: `${o.id}|${type}|${C[i].t}`, objet: o.id, outil: 'position', type, t: C[i].t, prix: C[i].c, niveau, cote: d > 0 ? 'achat' : 'vente', atr: A[i - 1] }); };
  for (let i = 1; i < C.length; i++) {
    const b = C[i]; if (b.t + H <= o.cree) continue;
    const dans = p => b.l <= p && b.h >= p;
    if (dans(o.entree)) pousser('entree', i, o.entree);
    if (d > 0 ? b.l <= o.stop : b.h >= o.stop) pousser('stop', i, o.stop);
    if (d > 0 ? b.h >= o.objectif : b.l <= o.objectif) pousser('objectif', i, o.objectif);
    if (fait.entree && (d > 0 ? b.h >= un : b.l <= un)) pousser('plus1R', i, un);
    if (o.alerte && dans(o.entree)) pousser('alerte', i, o.entree);
  }
  return { ev, fleches: [], croix: [] };
}
/* toutes les surveillances */
export function surveiller(C, objets, R = REGLES_V10) {
  const A = atrLocal(C, R.atrN), out = { ev: [], fleches: [], croix: [], etats: {} };
  for (const o of objets) { const r = o.type === 'position' ? surveillerPosition(C, A, o) : surveillerObjet(C, A, o, R);
    out.ev.push(...r.ev); out.fleches.push(...r.fleches); out.croix.push(...r.croix); out.etats[o.id] = { cote: r.cote || null, retourne: !!r.retourne }; }
  out.ev.sort((x, y) => x.t - y.t || (x.id < y.id ? -1 : 1)); out.fleches.sort((x, y) => x.t - y.t); return out;
}

/* ───────────── niveaux majeurs proposés : fractales de 60 bougies de chaque côté en H4 et Jour ───────────── */
export function fractalesMajeures(B, k, P0, unite) {
  const o = [];
  for (let i = k; i + k < B.length; i++) { let s = true, c = true;
    for (let dd = 1; dd <= k && (s || c); dd++) { if (!(B[i].h > B[i - dd].h && B[i].h > B[i + dd].h)) s = false; if (!(B[i].l < B[i - dd].l && B[i].l < B[i + dd].l)) c = false; }
    if (s) o.push({ cle: `${unite}|sommet|${B[i].t}`, unite, sorte: 'sommet', t: B[i].t, p: B[i].h, tConf: B[i + k].t + P0 });
    if (c) o.push({ cle: `${unite}|creux|${B[i].t}`, unite, sorte: 'creux', t: B[i].t, p: B[i].l, tConf: B[i + k].t + P0 }); }
  return o;
}
/* niveaux proposés non traités (décisions : confirme / supprime, avec leur prix), formés dans les 730 derniers jours, sans doublon à moins de 0,1 %
   (ni entre eux, ni avec un niveau déjà confirmé ou supprimé) */
export function niveauxProposes(fractales, decisions, maintenant = Date.now()) {
  const traites = new Set(decisions.map(d => d.cle)), lim = maintenant - 730 * 86400e3, out = [];
  for (const f of fractales.filter(f => f.t >= lim && f.tConf <= maintenant).sort((a, b) => b.t - a.t)) {
    if (traites.has(f.cle) || out.some(x => Math.abs(x.p - f.p) / f.p < 0.001) || decisions.some(d => d.p > 0 && Math.abs(d.p - f.p) / f.p < 0.001)) continue; out.push(f);
  }
  return out.sort((a, b) => b.p - a.p);
}

/* ───────────── registre : excursions sur 48 bougies, bilan par type d'outil ───────────── */
export function excursionEvenement(C, e, R = REGLES_V10) {
  const i = C.findIndex(b => b.t === e.t); if (i < 0 || i + R.excursionBougies >= C.length || !e.atr) return null;
  const haussier = e.type === 'cassure' ? e.cote === 'resistance' : e.outil === 'position' ? e.cote === 'achat' : e.cote === 'support', d = haussier ? 1 : -1, p0 = C[i].c;
  let fav = 0, adv = 0; for (let j = i + 1; j <= i + R.excursionBougies; j++) { fav = Math.max(fav, d > 0 ? C[j].h - p0 : p0 - C[j].l); adv = Math.max(adv, d > 0 ? p0 - C[j].l : C[j].h - p0); }
  return { id: e.id, favAtr: fav / e.atr, advAtr: adv / e.atr, favPct: 100 * fav / p0, advPct: 100 * adv / p0, sens: haussier ? 'hausse' : 'baisse' };
}
export function bilanRegistre(evenements, suivis, R = REGLES_V10) {
  const S = new Map(suivis.map(s => [s.id, s])), med = L => { const s = L.slice().sort((a, b) => a - b); return s.length ? s[s.length >> 1] : null; }, out = [];
  for (const outil of ['horizontale', 'zone', 'tendance', 'rayon', 'position']) for (const type of ['approche', 'touche', 'rebond', 'cassure']) {
    const E = evenements.filter(e => e.outil === outil && e.type === type); if (!E.length) continue; const X = E.map(e => S.get(e.id)).filter(Boolean);
    out.push({ outil, type, n: E.length, mesures: X.length, assez: X.length >= R.minEvenements, favAtr: med(X.map(x => x.favAtr)), advAtr: med(X.map(x => x.advAtr)), favPct: med(X.map(x => x.favPct)), advPct: med(X.map(x => x.advPct)) });
  }
  return out;
}

/* ───────────── bilan des flèches v10 (depuis son commit), Holm sur toutes les versions suivies ───────────── */
export function bilanV10(C, fleches, { maintenant = Date.now(), spread = null, autres = {} } = {}) {
  const b = bilanH1(C, fleches, { maintenant, depuis: DEPUIS_V10.t, spread, version: REGLES_V10.version });
  const texte = b.texte.replace(DEPUIS_H1_V2.texte, DEPUIS_V10.texte);
  const p = b.assez && b.hasard ? deuxProportions(Math.round(b.reussite * b.mesurees), b.mesurees, Math.round(b.hasard.reussite * b.hasard.tirages), b.hasard.tirages) : null;
  const vs = Object.keys(autres), ps = [...vs.map(v => autres[v] && autres[v].p != null ? autres[v].p : null), p];
  const adj = holm(ps), pHolm = adj[adj.length - 1], m = ps.filter(x => x != null).length;
  return { ...b, p, texte: b.assez && pHolm != null ? texte.replace(' Aucune décision avant', ` Écart au hasard : p corrigée (Holm, ${vs.length + 1} versions suivies) ${pHolm.toFixed(3).replace('.', ',')}. Aucune décision avant`) : texte, pHolm, versionsHolm: vs.length + 1, mesuresHolm: m };
}
