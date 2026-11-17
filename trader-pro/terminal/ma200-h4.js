/* ═════════════ MA200 DAILY + H4 : le Daily décide du SENS, le H4 décide du MOMENT (module PUR, testé, navigateur et Node) ═════════════
   Remplace les Retournements Daily. Tout est calculé avec les données PASSÉES uniquement (le H4 est parcouru bougie par bougie, comme en direct) : aucune flèche ne bouge ni ne disparaît.
   1) SENS DAILY. Bande = MA200 Daily ± 0,5 × ATR(14) Daily. Haussier = 2 clôtures Daily consécutives au-dessus de la bande haute ; baissier = miroir. Tant que ce n'est pas confirmé (prix dans la bande, ou
      une seule clôture de l'autre côté) le sens est NEUTRE : aucune petite flèche. Le côté confirmé ne change que sur 2 clôtures de l'autre côté.
   2) GROSSE FLÈCHE (Daily) : le jour où le côté confirmé CHANGE (croisement confirmé), une seule par croisement ; le premier côté confirmé en début d'historique n'est pas un croisement : pas de flèche.
   3) PETITES FLÈCHES (H4), uniquement dans le sens Daily (haussier : achat ; baissier : miroir), jamais dans l'ancien sens après un changement :
      - REBOND : le prix recule vers un support (MA200 H4, MA200 Daily, S1 / S2 Daily ; zone = niveau ± 0,3 ATR Daily), puis une bougie H4 CLÔTURE au-dessus du dernier sommet H4 du repli (dans les 30 bougies H4) ;
      - CASSURE : une bougie H4 clôture au-dessus du plus haut des 20 dernières bougies H4.
      Au plus 1 petite flèche par repli (un repli = un recul d'au moins 1 ATR Daily depuis le plus haut atteint depuis la dernière flèche) et au moins 3 jours entre deux petites flèches.
   4) PLAN. Petite flèche : entrée = clôture H4 de confirmation, stop = 1 ATR Daily sous le dernier creux H4 du repli ; sortie = changement de sens Daily (côté confirmé opposé) ou clôture H4 sous le dernier creux H4 important
      (le creux du repli, remonté au fil des creux H4 à 3 bougies de chaque côté formés depuis l'entrée). Grosse flèche : entrée = clôture Daily du croisement, stop = 1 ATR Daily derrière la MA200 Daily, sortie = changement de sens Daily.
   Résultat affiché en R (R = |entrée − stop|). Bougies : { t (ouverture, ms UTC), o, h, l, c }. Les bougies Daily doivent être CLÔTURÉES (cloturees). */
import { atr, sma, niveauxCles } from '../commun/analyse.js';

export const J = 86400e3, H4 = 4 * 3600e3;
export const PARAMS = Object.freeze({ bande: 0.5, ATR_N: 14, MA_N: 200, espaceH4J: 3, cassureN: 20, repliATR: 1, stopATR: 1, zoneATR: 0.3, pivotH4: 2, remonteH4: 40, fenetreRebond: 30, pivotSortie: 3 });
export const cloturees = (B, maintenant = Date.now()) => (B || []).filter(b => b.t + J <= maintenant);

/* ───── 1) sens Daily ───── */
export function sensJour(B, P = PARAMS) {
  const A = atr(B, P.ATR_N), M = sma(B.map(b => b.c), P.MA_N), n = B.length, cote = new Array(n).fill(0), sens = new Array(n).fill(0), haut = new Array(n).fill(false), bas = new Array(n).fill(false), gros = [];
  let c0 = 0;
  for (let i = 0; i < n; i++) {
    if (A[i] == null || M[i] == null) { cote[i] = c0; continue; }
    haut[i] = B[i].c > M[i] + P.bande * A[i]; bas[i] = B[i].c < M[i] - P.bande * A[i];
    const confH = haut[i] && i >= 1 && haut[i - 1], confB = bas[i] && i >= 1 && bas[i - 1];
    if (confH && c0 !== 1) { if (c0 === -1) gros.push(grosse(B, i, 1, M[i], A[i], P)); c0 = 1; } else if (confB && c0 !== -1) { if (c0 === 1) gros.push(grosse(B, i, -1, M[i], A[i], P)); c0 = -1; }
    cote[i] = c0; sens[i] = haut[i] ? (c0 === 1 ? 1 : 0) : bas[i] ? (c0 === -1 ? -1 : 0) : 0;
  }
  return { A, M, cote, sens, gros };
}
function grosse(B, i, dir, m, a, P) {
  const stop = dir > 0 ? m - P.stopATR * a : m + P.stopATR * a;
  return { type: 'grosse', dir, i, t: B[i].t, tFin: B[i].t + J, entree: B[i].c, stop, R: Math.abs(B[i].c - stop), zone: 'MA200 Daily', ma200: m, atr: a };
}

/* ───── 3) petites flèches H4 ───── */
export function petitesFleches(Bj, Bh, S, { params = PARAMS, maintenant = Date.now() } = {}) {
  const P = params, H = (Bh || []).filter(b => b.t + H4 <= maintenant), n = H.length, M4 = sma(H.map(b => b.c), P.MA_N), out = [], cacheN = new Map();
  const niv = k => { if (!cacheN.has(k)) cacheN.set(k, niveauxCles(Bj.slice(Math.max(0, k + 1 - 300), k + 1), { max: 2, fenetre: 300 })); return cacheN.get(k); };
  const neuf = (der = -1e18) => ({ arme: true, pic: null, derniere: der, attente: null });
  const etat = { 1: neuf(), '-1': neuf() }; let k = -1, sensPrec = 0;
  /* dernier sommet (creux) H4 du repli : pivot à `pivotH4` bougies de chaque côté, au-dessus (au-dessous) du dernier cours, parmi les `remonteH4` dernières bougies */
  const declencheur = (h, dir) => {
    for (let p = h - P.pivotH4, m = 0; p >= P.pivotH4 && m < P.remonteH4; p--, m++) {
      let ok = true; for (let x = 1; x <= P.pivotH4 && ok; x++) ok = dir > 0 ? (H[p].h > H[p - x].h && H[p].h >= H[p + x].h) : (H[p].l < H[p - x].l && H[p].l <= H[p + x].l);
      if (ok && (dir > 0 ? H[p].h > H[h].c : H[p].l < H[h].c)) return dir > 0 ? H[p].h : H[p].l;
    }
    return null;
  };
  for (let h = 0; h < n; h++) {
    const b = H[h];
    while (k + 1 < Bj.length && Bj[k + 1].t + J <= b.t) k++;
    if (k < 0) continue;
    const s = S.sens[k], a = S.A[k];
    if (s !== sensPrec) { etat[-1].attente = null; etat[1].attente = null; if (s !== 0) etat[s] = neuf(etat[s].derniere); sensPrec = s; }
    if (s === 0 || a == null) continue;
    const dir = s, e = etat[dir];
    /* repli : recul d'au moins 1 ATR Daily depuis le plus haut (plus bas) atteint depuis la dernière flèche */
    if (e.pic == null) e.pic = dir > 0 ? b.h : b.l; else e.pic = dir > 0 ? Math.max(e.pic, b.h) : Math.min(e.pic, b.l);
    if (dir > 0 ? b.l <= e.pic - P.repliATR * a : b.h >= e.pic + P.repliATR * a) e.arme = true;
    const libre = e.arme && b.t - e.derniere >= P.espaceH4J * J;
    let type = null, zone = null;
    if (e.attente) {
      const at = e.attente;
      if (h - at.h0 > P.fenetreRebond) e.attente = null;
      else if (dir > 0 ? b.c > at.trigger : b.c < at.trigger) { if (libre) { type = 'rebond'; zone = at.zone; } e.attente = null; }
    }
    if (!type && h >= P.cassureN) {
      let ext = dir > 0 ? -Infinity : Infinity; for (let x = h - P.cassureN; x < h; x++) ext = dir > 0 ? Math.max(ext, H[x].h) : Math.min(ext, H[x].l);
      if (libre && (dir > 0 ? b.c > ext : b.c < ext)) { type = 'cassure'; zone = P.cassureN + ' dernières bougies H4'; }
    }
    if (type) {
      let pk = Math.max(0, h - P.remonteH4); for (let x = pk; x < h; x++) if (dir > 0 ? H[x].h >= H[pk].h : H[x].l <= H[pk].l) pk = x;
      let creux = dir > 0 ? Infinity : -Infinity; for (let x = pk; x <= h; x++) creux = dir > 0 ? Math.min(creux, H[x].l) : Math.max(creux, H[x].h);
      const stop = dir > 0 ? creux - P.stopATR * a : creux + P.stopATR * a;
      out.push({ type, dir, t: b.t, tFin: b.t + H4, iH4: h, entree: b.c, stop, R: Math.abs(b.c - stop), zone, creux, atr: a, sens: s });
      e.arme = false; e.derniere = b.t; e.pic = dir > 0 ? b.h : b.l;
    }
    /* touch d'un support (résistance) : prépare le rebond */
    if (!e.attente && h >= 1 && M4[h - 1] != null) {
      const N = niv(k), tol = P.zoneATR * a, prev = H[h - 1].c, niveaux = [{ nom: 'MA200 H4', v: M4[h - 1] }, { nom: 'MA200 Daily', v: S.M[k] }].concat((dir > 0 ? N.supports : N.resistances).slice(0, 2).map((x, i) => ({ nom: (dir > 0 ? 'S' : 'R') + (i + 1) + ' Daily', v: x.prix })));
      const touches = niveaux.filter(z => z.v != null && (dir > 0 ? (prev > z.v && b.l <= z.v + tol && b.c > z.v - tol) : (prev < z.v && b.h >= z.v - tol && b.c < z.v + tol)));
      if (touches.length) { const z = touches.reduce((u, v) => (dir > 0 ? (v.v > u.v ? v : u) : (v.v < u.v ? v : u))), trig = declencheur(h, dir); if (trig != null) e.attente = { zone: z.nom, trigger: trig, h0: h }; }
    }
  }
  return out;
}

/* ───── analyse complète : grosses + petites, triées par heure de confirmation, et le sens Daily bougie par bougie ───── */
export function analyserMA(Bj, Bh, { params = PARAMS, maintenant = Date.now() } = {}) {
  const S = sensJour(Bj, params), petites = Bh && Bh.length ? petitesFleches(Bj, Bh, S, { params, maintenant }) : [];
  const tout = S.gros.concat(petites).sort((x, y) => x.tFin - y.tFin || (x.type === 'grosse' ? -1 : 1));
  return { S, grosses: S.gros, petites, tout, sens: Bj.map((b, i) => ({ t: b.t, tFin: b.t + J, sens: S.sens[i], cote: S.cote[i] })) };
}

/* ───── 5) suivi d'une flèche : gain en R (sortie = stop, changement de sens Daily, ou cassure du dernier creux H4 important) ─────
   Renvoie { r, etat: 'sortie' | 'en cours', motif, prix, t }. Stop avant tout le reste dans une même bougie ; ouverture au-delà du stop = sortie à l'ouverture. */
export function suivre(f, Bj, Bh, S, { params = PARAMS } = {}) {
  const L = f.dir > 0, P = params, R = f.R, gain = x => (L ? x - f.entree : f.entree - x) / R, rep = (prix, motif, t) => ({ r: gain(prix), etat: 'sortie', motif, prix, t });
  const flips = S.gros.filter(g => g.dir !== f.dir && g.tFin > f.tFin);
  if (f.type === 'grosse') {
    for (let j = f.i + 1; j < Bj.length; j++) {
      const b = Bj[j];
      if (L ? b.o <= f.stop : b.o >= f.stop) return rep(b.o, 'stop', b.t); if (L ? b.l <= f.stop : b.h >= f.stop) return rep(f.stop, 'stop', b.t);
      const g = flips.find(x => x.i === j); if (g) return rep(b.c, 'changement de sens Daily', b.t + J);
    }
    const d = Bj[Bj.length - 1]; return { r: gain(d.c), etat: 'en cours', prix: d.c, t: d.t + J };
  }
  let niveau = f.creux, dernier = f.iH4;
  for (let i = f.iH4 + 1; i < Bh.length; i++) {
    const b = Bh[i];
    if (L ? b.o <= f.stop : b.o >= f.stop) return rep(b.o, 'stop', b.t); if (L ? b.l <= f.stop : b.h >= f.stop) return rep(f.stop, 'stop', b.t);
    if (flips.some(g => g.tFin <= b.t + H4)) return rep(b.c, 'changement de sens Daily', b.t + H4);
    /* creux (sommets) H4 importants formés depuis l'entrée : pivots à `pivotSortie` bougies de chaque côté, confirmés à la bougie i */
    const p = i - P.pivotSortie; if (p > f.iH4 && p >= P.pivotSortie) { let ok = true; for (let x = 1; x <= P.pivotSortie && ok; x++) ok = L ? (Bh[p].l < Bh[p - x].l && Bh[p].l <= Bh[p + x].l) : (Bh[p].h > Bh[p - x].h && Bh[p].h >= Bh[p + x].h); if (ok) niveau = L ? Math.max(niveau, Bh[p].l) : Math.min(niveau, Bh[p].h); }
    if (L ? b.c < niveau : b.c > niveau) return rep(b.c, 'cassure du dernier creux H4', b.t + H4);
    dernier = i;
  }
  const d = Bh[dernier] || { c: f.entree, t: f.t }; return { r: gain(d.c), etat: 'en cours', prix: d.c, t: d.t + H4 };
}

/* ───── REGISTRE : une flèche confirmée ne bouge plus et n'est annoncée qu'une fois ───── */
export const idFleche = (actif, f) => `${actif}|${f.t}|${f.dir}|${f.type}`;
export function fusionnerRegistre(actif, existantes = [], calculees = []) {
  const vus = new Set(existantes.map(f => f.id)), out = existantes.slice();
  for (const f of calculees.slice().sort((x, y) => x.tFin - y.tFin)) {
    const id = idFleche(actif, f); if (vus.has(id)) continue;
    const der = out[out.length - 1]; if (der && f.tFin < der.tFin) continue;   // jamais d'insertion dans le passé
    out.push({ id, type: f.type, dir: f.dir, t: f.t, tFin: f.tFin, entree: f.entree, stop: f.stop, R: f.R, zone: f.zone, creux: f.creux ?? null, i: f.i ?? null, iH4: f.iH4 ?? null, vueLe: null }); vus.add(id);
  }
  return out;
}

/* ───── style, placement, textes ───── */
export const COULEURS = Object.freeze({ haussier: [95, 184, 148], baissier: [216, 106, 106], fond: { 1: 'rgba(95,184,148,0.11)', '-1': 'rgba(216,106,106,0.11)', 0: 'rgba(150,160,170,0.08)' } });
/* grosse flèche = Daily (grande), petite = H4 (petite) ; haussier = verte vers le haut sous la bougie, baissier = rouge vers le bas au-dessus ; sans texte */
export function styleFleche(f) {
  const [r, g, b] = f.dir > 0 ? COULEURS.haussier : COULEURS.baissier;
  return { couleur: `rgba(${r},${g},${b},1)`, position: f.dir > 0 ? 'belowBar' : 'aboveBar', forme: f.dir > 0 ? 'arrowUp' : 'arrowDown', taille: f.type === 'grosse' ? 2.6 : 1.2 };
}
/* la bougie affichée qui CONTIENT l'instant de confirmation (grosse : la bougie Daily du croisement ; H4 : la bougie H4 de confirmation exacte quand les bougies sont alignées sur 22 h UTC).
   Les mêmes flèches sur le Jour et sur H4, au même endroit ; H1 / M15 / M5 : aucune. Renvoie l'index de la bougie, ou −1. */
export function indexSurUnite(Bunite, f, pas) {
  if (!Bunite || !Bunite.length || pas < H4 - 1) return -1;
  const m = f.tFin - 1;
  for (let i = Bunite.length - 1; i >= 0; i--) if (Bunite[i].t <= m && m < Bunite[i].t + pas) return i;
  return -1;
}
/* sens Daily en vigueur pour chaque bougie affichée (fond du graphique) : H4 / H1 = sens connu à l'ouverture de la bougie ; Jour = sens à la clôture de la bougie */
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
export const typeLibelle = f => (f.type === 'grosse' ? `croisement MA200 Daily ${f.dir > 0 ? 'haussier' : 'baissier'}` : f.type === 'rebond' ? `rebond sur ${f.zone}` : `cassure des ${PARAMS.cassureN} dernières bougies H4`);
export const phraseFleche = (nom, f) => (f.type === 'grosse'
  ? `${nom} : grosse flèche ${f.dir > 0 ? 'haussière' : 'baissière'} Daily, la MA200 Daily est franchie, entrée vers ${niveauParle(f.entree)}`
  : `${nom} : petite flèche H4 ${f.dir > 0 ? 'haussière' : 'baissière'}, ${f.type === 'rebond' ? 'rebond sur ' + f.zone : 'cassure'}, entrée vers ${niveauParle(f.entree)}, stop ${niveauParle(f.stop)}`);

/* une flèche du registre (sans index) retrouve ses bougies par leur heure d'ouverture : nécessaire pour `suivre` */
export function ancrer(f, Bj, Bh) {
  const g = { ...f };
  if (f.type === 'grosse') { g.i = Bj.findIndex(b => b.t === f.t); if (g.i < 0) return null; if (!Number.isFinite(g.R) || !g.R) g.R = Math.abs(f.entree - f.stop); }
  else { g.iH4 = (Bh || []).findIndex(b => b.t === f.t); if (g.iH4 < 0 || !Number.isFinite(g.creux)) return null; }
  return g;
}
