/* ═════════════ MA200 DAILY + H4 : un seul niveau, la MA200 Daily (module PUR, testé, navigateur et Node) ═════════════
   Deux types de flèches seulement, tout est calculé avec les données PASSÉES (le H4 est parcouru bougie par bougie, comme en direct) : aucune flèche ne bouge ni ne disparaît.
   1) CASSURE (grosse flèche) : une clôture Daily franchit la MA200 Daily (la clôture change de côté), puis la cassure est CONFIRMÉE : par défaut, la première clôture H4 qui suit reste du bon côté (pas de réintégration) ;
      variantes testées : 2 clôtures Daily d'affilée, ou 1 clôture Daily à 0,5 ATR au-delà de la MA200. Filtre de pente : cassure haussière seulement si la MA200 Daily est plate ou montante sur les 20 derniers jours
      (plate = baisse de moins de 0,1 ATR) ; miroir en baisse ; une cassure contre la pente ne donne aucune flèche. Une seule flèche par cassure.
   2) REBOND (petite flèche) : tendance établie = les 10 dernières clôtures Daily du même côté de la MA200 Daily ET pente de la MA200 sur 20 jours dans le même sens. Le prix revient toucher la MA200 Daily (la mèche d'une bougie
      H4 passe à moins de 0,3 ATR de la MA200, sans clôturer de l'autre côté), puis une clôture H4 repart dans le sens de la tendance (au-delà du plus haut / plus bas de la dernière bougie de contact, dans les 30 bougies H4).
      Une seule flèche par contact avec la MA200 (un contact se termine quand une bougie H4 est entièrement à plus de 0,3 ATR de la MA200).
   Plan : entrée = clôture de la bougie de confirmation ; stop = 0,5 ATR de l'autre côté de la MA200 Daily ; sortie = stop, ou clôture Daily de l'autre côté de la MA200. Gain affiché en R (R = |entrée − stop|).
   Mêmes flèches sur le Jour et sur H4 (la bougie de confirmation), rien en H1. Bougies : { t (ouverture, ms UTC), o, h, l, c }. Les bougies Daily doivent être CLÔTURÉES (cloturees). */
import { atr, sma } from '../commun/analyse.js';

export const J = 86400e3, H4 = 4 * 3600e3;
export const PARAMS = Object.freeze({ ATR_N: 14, MA_N: 200, pente: 20, penteTol: 0.1, tendanceJours: 10, zoneATR: 0.3, stopATR: 0.5, margeATR: 0.5, fenetreRebond: 30 });
export const cloturees = (B, maintenant = Date.now()) => (B || []).filter(b => b.t + J <= maintenant);

/* confirmations de cassure comparées par le backtest (VERIFICATION-MA200.md) */
export const CONFIRMATIONS = Object.freeze({ h4: { nom: '1 clôture Daily + 1 clôture H4' }, daily2: { nom: '2 clôtures Daily' }, marge: { nom: '1 clôture Daily à 0,5 ATR' } });
export const CONFIRMATION_DEFAUT = 'daily2', PENTE_DEFAUT = false;   // fixés par le backtest
/* identifiant de l'algorithme : fait partie de la clé du registre sur l'appareil, pour qu'un changement de règles n'hérite jamais des flèches enregistrées par l'ancienne version (à changer à chaque modification des règles) */
export const ALGO_ID = () => `${CONFIRMATION_DEFAUT}-${PENTE_DEFAUT ? 'pente' : 'sanspente'}-r3`;

/* ───── contexte Daily : ATR, MA200, côté de la clôture, pente ───── */
export function contexteJour(B, P = PARAMS) {
  const A = atr(B, P.ATR_N), M = sma(B.map(b => b.c), P.MA_N), cote = B.map((b, i) => (M[i] == null ? 0 : b.c > M[i] ? 1 : b.c < M[i] ? -1 : 0));
  const pente = i => (i >= P.pente && M[i] != null && M[i - P.pente] != null ? M[i] - M[i - P.pente] : null);
  /* pente « dans le sens d » : stricte pour un rebond, large (plate ou montante) pour une cassure */
  const penteOk = (i, d, large) => { const p = pente(i); if (p == null || A[i] == null) return false; return large ? (d > 0 ? p >= -P.penteTol * A[i] : p <= P.penteTol * A[i]) : (d > 0 ? p > 0 : p < 0); };
  return { A, M, cote, pente, penteOk };
}

/* ───── 1) cassures ───── */
const flecheMA = (type, dir, t, tFin, entree, M, a, P, extra) => { const stop = dir > 0 ? M - P.stopATR * a : M + P.stopATR * a; return { type, dir, t, tFin, entree, stop, R: Math.abs(entree - stop), zone: 'MA200 Daily', ma200: M, atr: a, ...extra }; };
/* `proxyH4` (backtest sur 10 ans, là où il n'y a pas de H4) : la confirmation « 1 clôture H4 » est remplacée par « l'ouverture du lendemain reste du bon côté », entrée à cette ouverture */
export function cassures(B, H, C, { confirmation = CONFIRMATION_DEFAUT, pente = PENTE_DEFAUT, params = PARAMS, proxyH4 = false } = {}) {
  const P = params, out = [], n = B.length; let hp = 0;
  for (let i = 1; i < n; i++) {
    const d = C.cote[i]; if (!d || !C.cote[i - 1] || d === C.cote[i - 1] || C.A[i] == null) continue;   // clôture Daily qui franchit la MA200 Daily
    if (pente && !C.penteOk(i, d, true)) continue;                                                     // cassure contre la pente : aucune flèche
    const M = C.M[i], a = C.A[i], tFinJ = B[i].t + J;
    if (confirmation === 'marge') { if (d > 0 ? B[i].c > M + P.margeATR * a : B[i].c < M - P.margeATR * a) out.push(flecheMA('cassure', d, B[i].t, tFinJ, B[i].c, M, a, P, { mode: 'jour', i, jSuivi: i + 1 })); }
    else if (confirmation === 'daily2') { const j = i + 1; if (j < n && C.cote[j] === d && C.A[j] != null) out.push(flecheMA('cassure', d, B[j].t, B[j].t + J, B[j].c, C.M[j], C.A[j], P, { mode: 'jour', i: j, jSuivi: j + 1 })); }
    else {
      while (hp < H.length && H[hp].t < tFinJ) hp++;
      if (hp < H.length && H[0].t <= tFinJ) { const b = H[hp]; if (d > 0 ? b.c > M : b.c < M) out.push(flecheMA('cassure', d, b.t, b.t + H4, b.c, M, a, P, { mode: 'h4', iH4: hp, i })); }   // la première clôture H4 qui suit reste du bon côté
      else if (proxyH4 && i + 1 < n) { if (d > 0 ? B[i + 1].o > M : B[i + 1].o < M) out.push(flecheMA('cassure', d, B[i + 1].t, B[i + 1].t + H4, B[i + 1].o, M, a, P, { mode: 'jour', i: i + 1, jSuivi: i + 1, proxy: true })); }
    }
  }
  return out;
}

/* ───── 2) rebonds sur la MA200 Daily ───── */
export function rebonds(B, Hbrut, C, { params = PARAMS, maintenant = Date.now() } = {}) {
  const P = params, H = (Hbrut || []).filter(b => b.t + H4 <= maintenant), out = [], neuf = () => ({ contact: false, tire: false, attente: null });
  const etat = { 1: neuf(), '-1': neuf() }; let k = -1;
  for (let h = 0; h < H.length; h++) {
    const b = H[h]; while (k + 1 < B.length && B[k + 1].t + J <= b.t) k++;
    if (k < P.tendanceJours) continue;
    const a = C.A[k], M = C.M[k], d = C.cote[k]; if (!d || a == null || M == null) { etat[1] = neuf(); etat[-1] = neuf(); continue; }
    const e = etat[d], autre = etat[-d]; autre.contact = false; autre.tire = false; autre.attente = null;
    let etabli = C.penteOk(k, d, false); for (let x = 0; x < P.tendanceJours && etabli; x++) etabli = C.cote[k - x] === d;   // 10 clôtures du même côté + pente dans le même sens
    if (!etabli) { e.contact = false; e.tire = false; e.attente = null; continue; }
    const zone = P.zoneATR * a, touche = d > 0 ? (b.l <= M + zone && b.c > M) : (b.h >= M - zone && b.c < M), loin = d > 0 ? b.l > M + zone : b.h < M - zone;
    /* départ après un contact : une clôture H4 repart dans le sens de la tendance au-delà de la dernière bougie de contact */
    if (e.attente && !e.tire) {
      if (h - e.attente.h0 > P.fenetreRebond) e.attente = null;
      else if (d > 0 ? b.c > e.attente.ext : b.c < e.attente.ext) { out.push(flecheMA('rebond', d, b.t, b.t + H4, b.c, M, a, P, { mode: 'h4', iH4: h, i: k })); e.tire = true; e.attente = null; }
    }
    if (loin) { e.contact = false; e.tire = false; e.attente = null; }
    else if (touche) { e.contact = true; if (!e.tire) e.attente = { ext: d > 0 ? b.h : b.l, h0: h }; }
  }
  return out;
}

/* ───── analyse complète : cassures + rebonds triés par heure de confirmation, et le côté de la MA200 Daily bougie par bougie (fond du graphique) ───── */
export function analyserMA(Bj, Bh, { confirmation = CONFIRMATION_DEFAUT, pente = PENTE_DEFAUT, params = PARAMS, proxyH4 = false, avecRebonds = true, maintenant = Date.now() } = {}) {
  const C = contexteJour(Bj, params), H = (Bh || []).filter(b => b.t + H4 <= maintenant);
  const cs = cassures(Bj, H, C, { confirmation, pente, params, proxyH4 }), rs = avecRebonds && H.length ? rebonds(Bj, H, C, { params, maintenant }) : [];
  const tout = cs.concat(rs).sort((x, y) => x.tFin - y.tFin || (x.type === 'cassure' ? -1 : 1));
  return { S: C, cassures: cs, rebonds: rs, tout, sens: Bj.map((b, i) => ({ t: b.t, tFin: b.t + J, sens: C.cote[i], cote: C.cote[i] })) };
}

/* ───── suivi d'une flèche : gain en R (sortie = stop, ou clôture Daily de l'autre côté de la MA200) ─────
   Renvoie { r, etat: 'sortie' | 'en cours', motif, prix, t }. Stop avant tout le reste dans une même bougie ; ouverture au-delà du stop = sortie à l'ouverture.
   Flèche sur une bougie H4 (mode 'h4') : suivie sur les bougies H4 ; flèche Daily (mode 'jour') : suivie sur les bougies Daily (base : 'jour' force le suivi Daily, pour comparer des flèches de modes différents). */
export function suivre(f, Bj, Bh, S, { base = null } = {}) {
  const L = f.dir > 0, R = f.R, gain = x => (L ? x - f.entree : f.entree - x) / R, rep = (prix, motif, t) => ({ r: gain(prix), etat: 'sortie', motif, prix, t });
  const apresJour = j0 => {
    for (let j = j0; j < Bj.length; j++) {
      const b = Bj[j];
      if (L ? b.o <= f.stop : b.o >= f.stop) return rep(b.o, 'stop', b.t); if (L ? b.l <= f.stop : b.h >= f.stop) return rep(f.stop, 'stop', b.t);
      if (S.cote[j] === -f.dir) return rep(b.c, 'clôture Daily de l’autre côté de la MA200', b.t + J);
    }
    const d = Bj[Bj.length - 1]; return { r: gain(d.c), etat: 'en cours', prix: d.c, t: d.t + J };
  };
  if (f.mode === 'jour') return apresJour(f.jSuivi);
  if (base === 'jour') { const j = Bj.findIndex(b => b.t + J > f.tFin); return j < 0 ? { r: 0, etat: 'en cours', prix: f.entree, t: f.tFin } : apresJour(j); }   // flèche H4 suivie sur le Daily : à partir de la bougie Daily en cours
  let tSortie = Infinity; for (let j = 0; j < Bj.length; j++) if (S.cote[j] === -f.dir && Bj[j].t + J > f.tFin) { tSortie = Bj[j].t + J; break; }
  for (let i = f.iH4 + 1; i < Bh.length; i++) {
    const b = Bh[i];
    if (L ? b.o <= f.stop : b.o >= f.stop) return rep(b.o, 'stop', b.t); if (L ? b.l <= f.stop : b.h >= f.stop) return rep(f.stop, 'stop', b.t);
    if (b.t + H4 >= tSortie) return rep(b.c, 'clôture Daily de l’autre côté de la MA200', b.t + H4);
  }
  const d = Bh[Bh.length - 1] || { c: f.entree, t: f.t }; return { r: gain(d.c), etat: 'en cours', prix: d.c, t: d.t + H4 };
}

/* ───── REGISTRE : une flèche confirmée ne bouge plus et n'est annoncée qu'une fois ───── */
export const idFleche = (actif, f) => `${actif}|${f.t}|${f.dir}|${f.type}`;
export function fusionnerRegistre(actif, existantes = [], calculees = []) {
  const vus = new Set(existantes.map(f => f.id)), out = existantes.slice();
  for (const f of calculees.slice().sort((x, y) => x.tFin - y.tFin)) {
    const id = idFleche(actif, f); if (vus.has(id)) continue;
    const der = out[out.length - 1]; if (der && f.tFin < der.tFin) continue;   // jamais d'insertion dans le passé
    out.push({ id, type: f.type, dir: f.dir, t: f.t, tFin: f.tFin, entree: f.entree, stop: f.stop, R: f.R, zone: f.zone, mode: f.mode, i: f.i ?? null, iH4: f.iH4 ?? null, jSuivi: f.jSuivi ?? null, vueLe: null }); vus.add(id);
  }
  return out;
}
/* une flèche du registre (sans index) retrouve ses bougies par leur heure d'ouverture : nécessaire pour `suivre` */
export function ancrer(f, Bj, Bh) {
  const g = { ...f };
  if (f.mode === 'jour') { g.i = Bj.findIndex(b => b.t === f.t); if (g.i < 0) return null; g.jSuivi = f.proxy ? g.i : g.i + 1; }
  else { g.iH4 = (Bh || []).findIndex(b => b.t === f.t); if (g.iH4 < 0) return null; }
  if (!Number.isFinite(g.R) || !g.R) g.R = Math.abs(f.entree - f.stop);
  return g;
}

/* ───── style, placement, textes ───── */
export const COULEURS = Object.freeze({ haussier: [95, 184, 148], baissier: [216, 106, 106], fond: { 1: 'rgba(95,184,148,0.11)', '-1': 'rgba(216,106,106,0.11)', 0: 'rgba(150,160,170,0.08)' } });
/* cassure = grosse flèche, rebond = petite ; haussier = verte vers le haut sous la bougie, baissier = rouge vers le bas au-dessus ; sans texte */
export function styleFleche(f) {
  const [r, g, b] = f.dir > 0 ? COULEURS.haussier : COULEURS.baissier;
  return { couleur: `rgba(${r},${g},${b},1)`, position: f.dir > 0 ? 'belowBar' : 'aboveBar', forme: f.dir > 0 ? 'arrowUp' : 'arrowDown', taille: f.type === 'cassure' ? 2.6 : 1.2 };
}
/* la bougie affichée qui CONTIENT l'instant de confirmation. Les mêmes flèches sur le Jour et sur H4, au même endroit ; H1 / M15 / M5 : aucune. Renvoie l'index de la bougie, ou −1. */
export function indexSurUnite(Bunite, f, pas) {
  if (!Bunite || !Bunite.length || pas < H4 - 1) return -1;
  const m = f.tFin - 1;
  for (let i = Bunite.length - 1; i >= 0; i--) if (Bunite[i].t <= m && m < Bunite[i].t + pas) return i;
  return -1;
}
/* côté de la MA200 Daily pour chaque bougie affichée (fond du graphique) : H4 / H1 = côté connu à l'ouverture de la bougie ; Jour = côté à la clôture de la bougie */
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
export const typeNom = f => (f.type === 'cassure' ? 'Cassure' : 'Rebond');
export const typeLibelle = f => (f.type === 'cassure' ? `cassure ${f.dir > 0 ? 'haussière' : 'baissière'} de la MA200 Daily` : `rebond ${f.dir > 0 ? 'haussier' : 'baissier'} sur la MA200 Daily`);
export const phraseFleche = (nom, f) => `${nom} : ${typeLibelle(f)} confirmé${f.type === 'cassure' ? 'e' : ''}, entrée vers ${niveauParle(f.entree)}, stop ${niveauParle(f.stop)}`;
