/* ═════════════ RETOURNEMENTS DAILY : flèches rares, seulement sur les gros retournements (module PUR, testé, navigateur et Node) ═════════════
   Remplace le zigzag ATR. Tout est calculé avec les données PASSÉES uniquement (aucune bougie future : l'algorithme avance bougie H4 par bougie H4, comme en direct).
   1) ZONES Daily (connues avant la bougie testée) : les 3 derniers sommets et les 3 derniers creux Daily confirmés (pivot à 5 bougies de chaque côté, donc connu 5 jours après), R1 / R2 / S1 / S2 (niveaux clés du terminal :
      les 2 plus forts au-dessus et au-dessous du prix), MA200 Daily. Zone = niveau ± 0,3 × ATR(14) Daily.
   2) SETUP : une bougie Daily clôturée touche une zone de support (le prix venait d'au-dessus) ou de résistance (le prix venait d'en dessous) sans clôturer au-delà, avec un volume ≥ 1,2 × la moyenne des 20 jours précédents.
      Volume : or = futures COMEX GC (l'or au comptant n'a pas de volume réel) ; indices et cryptos = volume de leur source. Version « sans filtre volume » : cette condition est ignorée.
   3) CONFIRMATION H4 (dans les 5 jours qui suivent la bougie du touch) : une bougie H4 CLÔTURE au-dessus du dernier sommet H4 formé pendant la descente vers le support (miroir : sous le dernier creux H4 pour une résistance).
      La flèche apparaît sur CETTE bougie H4 et ne bouge plus. Setup annulé si une bougie Daily clôture au-delà de la zone (support cassé / résistance cassée) ou si rien n'est confirmé en 5 jours.
   4) ANTI-BRUIT : 1 seule flèche par zone (zones mobiles R/S et MA200 : une par nom et par semaine) ; au moins 10 jours entre deux flèches de même sens ; pas de flèche si la zone opposée est à moins de 2 R.
   Plan : entrée = clôture de la bougie de confirmation ; stop = 0,2 ATR au-delà de la mèche du touch ; objectif = bord proche de la zone opposée la plus proche (3 R s'il n'y en a aucune) ; R = |entrée − stop|.
   Bougies : { t (ouverture, ms UTC), o, h, l, c, v }. Les bougies Daily passées doivent être CLÔTURÉES (cloturees). */
import { atr, sma, niveauxCles } from '../commun/analyse.js';

export const J = 86400e3, H4 = 4 * 3600e3;
export const PARAMS = Object.freeze({ zoneATR: 0.3, volMult: 1.2, volN: 20, fenetreJ: 5, espaceMemeSensJ: 10, minR: 2, stopATR: 0.2, pivotJ: 5, pivotH4: 2, ATR_N: 14, MA_N: 200, nPivots: 3, remonteH4: 40 });
/* les 3 versions comparées par le backtest (VERIFICATION-RETOURNEMENTS.md) */
export const VERSIONS = Object.freeze({
  complete: { nom: 'Complète', volume: true, tendance: false },
  sansVolume: { nom: 'Sans filtre volume', volume: false, tendance: false },
  tendance: { nom: 'Sens de la MA200 seulement', volume: true, tendance: true }
});
export const VERSION_DEFAUT = 'sansVolume';   // fixée par le backtest (voir VERIFICATION-RETOURNEMENTS.md)
export const versionDe = v => (VERSIONS[v] ? v : VERSION_DEFAUT);

export const cloturees = (B, maintenant = Date.now()) => (B || []).filter(b => b.t + J <= maintenant);

/* pivots Daily : indices des sommets (h) et creux (l) à `n` bougies de chaque côté ; le pivot k n'est connu qu'à la clôture de la bougie k + n */
function pivotsJour(B, n) {
  const H = [], L = [];
  for (let k = n; k < B.length - n; k++) {
    let ph = true, pl = true;
    for (let x = 1; x <= n; x++) {
      if (!(B[k].h > B[k - x].h && B[k].h >= B[k + x].h)) ph = false;
      if (!(B[k].l < B[k - x].l && B[k].l <= B[k + x].l)) pl = false;
      if (!ph && !pl) break;
    }
    if (ph) H.push(k); if (pl) L.push(k);
  }
  return { H, L };
}

/* contexte précalculé sur le Daily ; zonesA(k) = zones connues avec les bougies 0…k seulement */
export function contexteJour(B, P = PARAMS) {
  const A = atr(B, P.ATR_N), M = sma(B.map(b => b.c), P.MA_N), pv = pivotsJour(B, P.pivotJ);
  const derniers = (arr, k) => { const out = []; for (let i = arr.length - 1; i >= 0 && out.length < P.nPivots; i--) if (arr[i] + P.pivotJ <= k) out.push(arr[i]); return out; };
  const semaine = k => Math.floor(B[k].t / (7 * J));
  function zonesA(k) {
    const a = A[k]; if (k < 1 || a == null) return [];
    const w = P.zoneATR * a, Z = [], z = (id, nom, niveau, type) => Z.push({ id, nom, niveau, bas: niveau - w, haut: niveau + w, type });
    for (const p of derniers(pv.H, k)) z('SH|' + B[p].t, 'Sommet Daily du ' + new Date(B[p].t).toISOString().slice(0, 10), B[p].h, 'sommet');
    for (const p of derniers(pv.L, k)) z('SB|' + B[p].t, 'Creux Daily du ' + new Date(B[p].t).toISOString().slice(0, 10), B[p].l, 'creux');
    /* R1 / R2 / S1 / S2 : les mêmes niveaux que ceux affichés par le terminal (niveauxCles sur les 300 dernières bougies Daily) ; un niveau = une zone persistante (identifiée par son prix à 0,4 % près) */
    const N = niveauxCles(B.slice(Math.max(0, k + 1 - 300), k + 1), { max: 2, fenetre: 300 }), idN = p => 'N|' + Math.round(Math.log(p) / 0.004);
    N.resistances.slice(0, 2).forEach((x, i) => z(idN(x.prix), 'R' + (i + 1), x.prix, 'niveau')); N.supports.slice(0, 2).forEach((x, i) => z(idN(x.prix), 'S' + (i + 1), x.prix, 'niveau'));
    if (M[k] != null) z('MA|' + semaine(k), 'MA200 Daily', M[k], 'ma200');
    return Z;
  }
  return { A, M, zonesA };
}

/* signaux : { t, tFin, dir (+1 haussier / −1 baissier), zone, tTouch, volume, volMoy, ratio, entree, stop, objectif, R, rr, … }, dans l'ordre chronologique.
   `maintenant` : les bougies H4 non terminées sont ignorées. Renvoie aussi des compteurs (diagnostic). */
export function retournements(Bj, Bh, { version = VERSION_DEFAUT, params = PARAMS, maintenant = Date.now() } = {}) {
  const V = VERSIONS[versionDe(version)], P = params, bilan = { touches: 0, setups: 0, annules: 0, expires: 0, sansDeclencheur: 0, refusVolume: 0, refusTendance: 0, refusSens: 0, refusEspace: 0, refus2R: 0, sansZoneOpposee: 0, refusStop: 0 };
  const sig = [], C = contexteJour(Bj, P), H = (Bh || []).filter(b => b.t + H4 <= maintenant);
  const attente = [], pris = new Set(), dernierPar = { 1: -1e18, '-1': -1e18 };
  let di = 0;   // prochaine bougie Daily à intégrer
  const tClose = d => Bj[d].t + J;

  /* dernier sommet H4 (haussier : au-dessus du dernier cours) / creux H4 (baissier : sous le dernier cours) connu à l'instant Tc, formé AVANT le touch */
  function declencheur(h0, Tc, dir) {
    let last = h0 - 1; while (last >= 0 && H[last].t + H4 > Tc) last--; if (last < P.pivotH4 * 2) return null;
    const c = H[last].c;
    for (let p = last - P.pivotH4, n = 0; p >= P.pivotH4 && n < P.remonteH4; p--, n++) {
      let ok = true;
      for (let x = 1; x <= P.pivotH4 && ok; x++) ok = dir > 0 ? (H[p].h > H[p - x].h && H[p].h >= H[p + x].h) : (H[p].l < H[p - x].l && H[p].l <= H[p + x].l);
      if (ok && (dir > 0 ? H[p].h > c : H[p].l < c)) return { niveau: dir > 0 ? H[p].h : H[p].l, tPivot: H[p].t };
    }
    return null;
  }
  function integrer(d, h0) {
    const b = Bj[d], Tc = tClose(d);
    for (let i = attente.length - 1; i >= 0; i--) { const s = attente[i]; if (s.Tc < Tc && (s.dir > 0 ? b.c < s.zone.bas : b.c > s.zone.haut)) { attente.splice(i, 1); bilan.annules++; } }
    if (d < 1) return;
    const Z = C.zonesA(d - 1), prev = Bj[d - 1].c, a = C.A[d - 1]; if (!Z.length || a == null) return;
    const m = (() => { let s = 0, n = 0; for (let x = Math.max(0, d - P.volN); x < d; x++) { s += Bj[x].v || 0; n++; } return n === P.volN ? s / n : 0; })();
    for (const dir of [1, -1]) {
      const cand = Z.filter(z => (dir > 0 ? (prev > z.haut && b.l <= z.haut && b.c > z.bas) : (prev < z.bas && b.h >= z.bas && b.c < z.haut)));
      if (!cand.length) continue; bilan.touches++;
      const z = cand.reduce((u, v) => (dir > 0 ? (v.niveau > u.niveau ? v : u) : (v.niveau < u.niveau ? v : u)));
      const ratio = m > 0 ? (b.v || 0) / m : 0;
      if (V.volume && !(m > 0 && ratio >= P.volMult)) { bilan.refusVolume++; continue; }
      if (V.tendance && (C.M[d] == null || (dir > 0 ? b.c <= C.M[d] : b.c >= C.M[d]))) { bilan.refusTendance++; continue; }
      const dec = declencheur(h0, Tc, dir); if (!dec) { bilan.sansDeclencheur++; continue; }
      if (attente.some(s => s.dir === dir && s.zone.id === z.id)) continue;
      attente.push({ dir, zone: z, Tc, d, touchH: b.h, touchL: b.l, atr: C.A[d], volume: b.v || 0, volMoy: m, ratio, declencheur: dec.niveau, tDecl: dec.tPivot, tTouch: b.t }); bilan.setups++;
    }
  }
  for (let h = 0; h < H.length; h++) {
    const bar = H[h];
    while (di < Bj.length && tClose(di) <= bar.t) { integrer(di, h); di++; }
    const k = di - 1;   // dernière bougie Daily connue
    for (let i = attente.length - 1; i >= 0; i--) {
      const s = attente[i];
      if (bar.t >= s.Tc + P.fenetreJ * J) { attente.splice(i, 1); bilan.expires++; continue; }
      if (!(s.dir > 0 ? bar.c > s.declencheur : bar.c < s.declencheur)) continue;
      attente.splice(i, 1);   // consommé : confirmé (flèche ou refus par un filtre anti-bruit), jamais reconsidéré
      if (pris.has(s.zone.id)) { bilan.refusSens++; continue; }
      if (bar.t - dernierPar[s.dir] < P.espaceMemeSensJ * J) { bilan.refusEspace++; continue; }
      const entree = bar.c, stop = s.dir > 0 ? s.touchL - P.stopATR * s.atr : s.touchH + P.stopATR * s.atr, R = Math.abs(entree - stop);
      if (!(R > 0) || (s.dir > 0 ? stop >= entree : stop <= entree)) { bilan.refusStop++; continue; }
      const opp = C.zonesA(k).filter(z => (s.dir > 0 ? z.bas > entree : z.haut < entree)); /* aucune zone opposée (prix au-dessus / au-dessous de toutes les zones connues, ex. plus haut historique) : rien ne gêne à moins de 2 R, l'objectif est alors fixé à 3 R */
      const zo = opp.length ? opp.reduce((u, v) => (s.dir > 0 ? (v.bas < u.bas ? v : u) : (v.haut > u.haut ? v : u))) : null; if (!zo) bilan.sansZoneOpposee++;
      const objectif = zo ? (s.dir > 0 ? zo.bas : zo.haut) : entree + s.dir * 3 * R, rr = Math.abs(objectif - entree) / R;
      if (rr < P.minR) { bilan.refus2R++; continue; }
      pris.add(s.zone.id); dernierPar[s.dir] = bar.t;
      sig.push({ t: bar.t, tFin: bar.t + H4, iH4: h, dir: s.dir, zone: { id: s.zone.id, nom: s.zone.nom, niveau: s.zone.niveau, bas: s.zone.bas, haut: s.zone.haut }, zoneOpposee: zo ? zo.nom : null, tTouch: s.tTouch, volume: s.volume, volMoy: s.volMoy, ratio: s.ratio, entree, stop, objectif, R, rr, declencheur: s.declencheur, ma200: C.M[k], tendance: C.M[k] == null ? null : (bar.c > C.M[k] ? 1 : -1) });
    }
  }
  return { signaux: sig, bilan };
}

/* ───── REGISTRE : une flèche confirmée ne bouge plus et n'est annoncée qu'une fois ───── */
export const idRetournement = (actif, f) => `${actif}|${f.t}|${f.dir}`;
export function fusionnerRegistre(actif, existantes = [], calculees = []) {
  const vus = new Set(existantes.map(f => f.id)), out = existantes.slice();
  for (const f of calculees.slice().sort((x, y) => x.t - y.t)) {
    const id = idRetournement(actif, f); if (vus.has(id)) continue;
    const der = out[out.length - 1]; if (der && f.t <= der.t) continue;   // jamais d'insertion dans le passé
    out.push({ id, t: f.t, tFin: f.tFin, dir: f.dir, zone: f.zone, tTouch: f.tTouch, volume: f.volume, volMoy: f.volMoy, ratio: f.ratio, entree: f.entree, stop: f.stop, objectif: f.objectif, R: f.R, rr: f.rr, vueLe: null }); vus.add(id);
  }
  return out;
}

/* style : haussier = flèche verte vers le haut sous la bougie, baissier = flèche rouge vers le bas au-dessus ; toujours pleine, sans texte */
export const COULEURS = Object.freeze({ haussier: [95, 184, 148], baissier: [216, 106, 106] });
export function styleFleche(f) {
  const [r, g, b] = f.dir > 0 ? COULEURS.haussier : COULEURS.baissier;
  return { couleur: `rgba(${r},${g},${b},1)`, position: f.dir > 0 ? 'belowBar' : 'aboveBar', forme: f.dir > 0 ? 'arrowUp' : 'arrowDown' };
}

/* placement : la bougie affichée qui CONTIENT l'instant de confirmation (la fin de la bougie H4 de confirmation). H4 : c'est la bougie H4 de confirmation exacte quand les bougies sont alignées comme celles du robot (22 h UTC) ;
   Jour : la bougie Daily du jour de confirmation ; H1 / M15 / M5 : aucune. Renvoie l'index de la bougie, ou −1. */
export function indexSurUnite(Bunite, f, pas) {
  if (!Bunite || !Bunite.length || pas < H4 - 1) return -1;
  const m = (f.tFin != null ? f.tFin : f.t + H4) - 1;
  for (let i = Bunite.length - 1; i >= 0; i--) if (Bunite[i].t <= m && m < Bunite[i].t + pas) return i;
  return -1;
}

/* textes */
export function niveauParle(v) {
  if (!Number.isFinite(v)) return '';
  const d = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 2 : 4;
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d }).replace(/[  ]/g, ' ');
}
export const phraseFleche = (nom, f) => `${nom} : retournement ${f.dir > 0 ? 'haussier' : 'baissier'} Daily confirmé, entrée vers ${niveauParle(f.entree)}`;

/* backtest : sortie au premier de stop / objectif sur les bougies H4 suivantes (stop avant objectif si les deux sont touchés dans la même bougie ; ouverture au-delà du stop = sortie à l'ouverture) ;
   au bout de `maxBougies` bougies H4 sans stop ni objectif, sortie à la clôture. Résultat en multiples de R (frais et glissement non comptés). */
export function simuler(f, Bh, maxBougies = 240) {
  const L = f.dir > 0, i0 = f.iH4 + 1;
  for (let i = i0; i < Bh.length && i < i0 + maxBougies; i++) {
    const b = Bh[i];
    if (L ? b.o <= f.stop : b.o >= f.stop) return { r: (L ? b.o - f.entree : f.entree - b.o) / f.R, sortie: 'stop', i };
    if (L ? b.l <= f.stop : b.h >= f.stop) return { r: -1, sortie: 'stop', i };
    if (L ? b.h >= f.objectif : b.l <= f.objectif) return { r: f.rr, sortie: 'objectif', i };
  }
  const i = Math.min(Bh.length - 1, i0 + maxBougies - 1); if (i < i0) return { r: null, sortie: 'en cours', i: Bh.length - 1 };
  const fin = i - i0 + 1 >= maxBougies;
  return { r: (L ? Bh[i].c - f.entree : f.entree - Bh[i].c) / f.R, sortie: fin ? 'temps' : 'en cours', i };
}
