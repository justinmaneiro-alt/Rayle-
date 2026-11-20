/* ═════════════ MODE VOLUME : CALCULS PURS (testés, navigateur et Node) — v4 ═════════════
   Bougie : { t (ms, ouverture), o, h, l, c, v (volume), bv? (volume acheteur agressif : « taker buy », Binance) }.
   DELTA = achats agressifs − ventes agressives. RÉEL quand bv est fourni (Binance : 2·bv − v) ; sinon ESTIMÉ depuis la bougie (position de la clôture dans la bougie × volume) et marqué comme tel
   par `deltaReel(B)` : aucune valeur de côté n'est inventée sans que ce soit dit. Les futures (NQ, ES, 6E) et l'or de Dukascopy n'ont pas de volume « côté » : delta estimé seulement.
   Rien ici n'envoie d'ordre : lecture seule. Aucune fonction ne regarde une bougie postérieure à celle qu'elle évalue (flèches : à la clôture de la bougie i, bougies ≤ i seulement). */
import { atr, dernier } from '../commun/analyse.js';

export const PARAMS_VOLUME = Object.freeze({ niveaux: 60, zoneValeur: 0.7, hvnMin: 1.3, lvnMax: 0.5, volumeFort: 1.5, volumeAnormal: 2, fenetreMoyenne: 20, fenetresNiveaux: [20, 60, 120], mfi: 14, minSignificatif: 30 });
const H = 3600e3, J = 86400e3;
const moy = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

/* ───── delta, CVD ───── */
export const deltaReel = B => !!(B && B.length && B.every(b => Number.isFinite(b.bv)));
export function deltaBarre(b) {
  if (Number.isFinite(b.bv)) return 2 * b.bv - (b.v || 0);
  const e = b.h - b.l; if (!(e > 0) || !(b.v > 0)) return 0;
  return b.v * ((b.c - b.l) - (b.h - b.c)) / e;          // estimation : clôture haute = acheteurs dominants
}
export const serieDelta = B => B.map(deltaBarre);
export function cvd(B, depart = 0) { let s = depart; return B.map(b => (s += deltaBarre(b))); }
export function volumeRelatif(B, n = PARAMS_VOLUME.fenetreMoyenne) {   // volume / moyenne des n bougies PRÉCÉDENTES
  return B.map((b, i) => { if (i < n) return null; const m = moy(B.slice(i - n, i).map(x => x.v || 0)); return m > 0 ? (b.v || 0) / m : null; });
}
export const volumeAnormal = (B, n = PARAMS_VOLUME.fenetreMoyenne, seuil = PARAMS_VOLUME.volumeAnormal) => volumeRelatif(B, n).map(r => r != null && r > seuil);

/* ───── profil de volume ───── */
/* Chaque bougie répartit son volume (et son delta) sur les niveaux qu'elle traverse, au prorata de la hauteur couverte. Renvoie { bins:[{lo,hi,p,v,d}], pas, poc, vah, val, total, hvn:[], lvn:[] }. */
export function profil(B, { niveaux = PARAMS_VOLUME.niveaux, bas = null, haut = null, zoneValeur = PARAMS_VOLUME.zoneValeur } = {}) {
  if (!B || !B.length) return null;
  const lo = bas != null ? bas : Math.min(...B.map(b => b.l)), hi = haut != null ? haut : Math.max(...B.map(b => b.h)); if (!(hi > lo)) return null;
  const pas = (hi - lo) / niveaux, bins = Array.from({ length: niveaux }, (_, i) => ({ lo: lo + i * pas, hi: lo + (i + 1) * pas, p: lo + (i + 0.5) * pas, v: 0, d: 0 }));
  for (const b of B) {
    const v = b.v || 0; if (!(v > 0)) continue; const d = deltaBarre(b), bl = Math.max(b.l, lo), bh = Math.min(b.h, hi);
    if (!(bh > bl)) { const k = Math.min(niveaux - 1, Math.max(0, Math.floor((b.c - lo) / pas))); bins[k].v += v; bins[k].d += d; continue; }
    const k0 = Math.max(0, Math.floor((bl - lo) / pas)), k1 = Math.min(niveaux - 1, Math.floor((bh - lo) / pas - 1e-12));
    for (let k = k0; k <= k1; k++) { const part = (Math.min(bh, bins[k].hi) - Math.max(bl, bins[k].lo)) / (bh - bl); if (part > 0) { bins[k].v += v * part; bins[k].d += d * part; } }
  }
  const total = bins.reduce((s, x) => s + x.v, 0); if (!(total > 0)) return null;
  let ip = 0; for (let k = 1; k < niveaux; k++) if (bins[k].v > bins[ip].v) ip = k;
  /* zone de valeur : on part du POC et on ajoute, de chaque côté, la paire de niveaux la plus lourde jusqu'à 70 % du volume */
  let a = ip, z = ip, cumul = bins[ip].v;
  while (cumul < zoneValeur * total && (a > 0 || z < niveaux - 1)) {
    const haut2 = z + 2 < niveaux ? bins[z + 1].v + bins[z + 2].v : z + 1 < niveaux ? bins[z + 1].v : -1, bas2 = a - 2 >= 0 ? bins[a - 1].v + bins[a - 2].v : a - 1 >= 0 ? bins[a - 1].v : -1;
    if (haut2 < 0 && bas2 < 0) break;
    if (haut2 >= bas2) { const n = z + 2 < niveaux ? 2 : 1; for (let q = 0; q < n; q++) { z++; cumul += bins[z].v; } } else { const n = a - 2 >= 0 ? 2 : 1; for (let q = 0; q < n; q++) { a--; cumul += bins[a].v; } }
  }
  /* nœuds : sur un profil lissé sur 3 niveaux, sommets locaux au-dessus de 1,3 × la moyenne (HVN) et creux locaux sous 0,5 × la moyenne (LVN), jamais aux extrémités */
  const lisse = bins.map((x, k) => (k === 0 || k === niveaux - 1 ? x.v : (bins[k - 1].v + x.v + bins[k + 1].v) / 3)), m = total / niveaux, hvn = [], lvn = [];
  for (let k = 1; k < niveaux - 1; k++) {
    if (lisse[k] > lisse[k - 1] && lisse[k] >= lisse[k + 1] && lisse[k] >= PARAMS_VOLUME.hvnMin * m) hvn.push({ prix: bins[k].p, v: bins[k].v, force: lisse[k] / m });
    if (lisse[k] < lisse[k - 1] && lisse[k] <= lisse[k + 1] && lisse[k] <= PARAMS_VOLUME.lvnMax * m) lvn.push({ prix: bins[k].p, v: bins[k].v, force: m / Math.max(lisse[k], 1e-9) });
  }
  return { bins, pas, lo, hi, total, poc: { prix: bins[ip].p, v: bins[ip].v, i: ip }, val: bins[a].lo, vah: bins[z].hi, hvn, lvn };
}

/* ───── VWAP ancré, bandes ±1 et ±2 écarts-types ───── */
export function vwapAncre(B, i0, { bandes = [1, 2] } = {}) {
  const out = []; let W = 0, M1 = 0, M2 = 0;
  for (let i = i0; i < B.length; i++) {
    const b = B[i], w = b.v || 0, tp = (b.h + b.l + b.c) / 3; W += w; M1 += w * tp; M2 += w * tp * tp;
    if (!(W > 0)) { out.push({ t: b.t, vwap: null, sd: null, bandes: {} }); continue; }
    const vw = M1 / W, sd = Math.sqrt(Math.max(0, M2 / W - vw * vw)), bd = {}; for (const k of bandes) { bd['+' + k] = vw + k * sd; bd['-' + k] = vw - k * sd; }
    out.push({ t: b.t, vwap: vw, sd, bandes: bd });
  }
  return out;
}
const debutSemaine = t => { const d = new Date(t), j = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - j); };   // lundi 00:00 UTC
const debutMois = t => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
export const debutPeriode = (t, periode) => (periode === 'mois' ? debutMois(t) : debutSemaine(t));
/* indice de la première bougie de la période (semaine ou mois) qui contient la dernière bougie */
export function indexAncrePeriode(B, periode) { if (!B.length) return -1; const d0 = debutPeriode(B[B.length - 1].t, periode); let i = B.length - 1; while (i > 0 && B[i - 1].t >= d0) i--; return i; }

/* ───── POC « nus » : POC des périodes terminées jamais retouchés depuis ───── */
export function pocsNus(B, periode, { max = 6, niveaux = PARAMS_VOLUME.niveaux } = {}) {
  if (!B || B.length < 10) return [];
  const groupes = new Map(); for (let i = 0; i < B.length; i++) { const k = debutPeriode(B[i].t, periode); if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(i); }
  const cles = [...groupes.keys()].sort((a, b) => a - b), out = [];
  for (let g = 0; g < cles.length - 1; g++) {   // la dernière période est en cours : pas de POC « terminé »
    const idx = groupes.get(cles[g]), P = profil(idx.map(i => B[i]), { niveaux }); if (!P) continue;
    const fin = idx[idx.length - 1]; let touche = null;
    for (let i = fin + 1; i < B.length; i++) if (B[i].l <= P.poc.prix && B[i].h >= P.poc.prix) { touche = i; break; }
    out.push({ prix: P.poc.prix, periode, debut: cles[g], tFin: B[fin].t, iFin: fin, nu: touche == null, touche: touche == null ? null : touche, v: P.poc.v });
  }
  return out.filter(x => x.nu).sort((a, b) => b.tFin - a.tFin).slice(0, max);
}
/* les mêmes, tels qu'ils étaient connus à la clôture de la bougie i (pour les flèches) : jamais d'information future */
export function pocsNusA(tous, i) { return tous.filter(x => x.iFin < i && (x.touche == null || x.touche > i)); }
export function tousPocsPeriode(B, periode, opt = {}) { return pocsNus(B, periode, { ...opt, max: 1e9 }).concat(pocsTouches(B, periode, opt)); }
function pocsTouches(B, periode, { niveaux = PARAMS_VOLUME.niveaux } = {}) {
  const groupes = new Map(); for (let i = 0; i < B.length; i++) { const k = debutPeriode(B[i].t, periode); if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(i); }
  const cles = [...groupes.keys()].sort((a, b) => a - b), out = [];
  for (let g = 0; g < cles.length - 1; g++) {
    const idx = groupes.get(cles[g]), P = profil(idx.map(i => B[i]), { niveaux }); if (!P) continue; const fin = idx[idx.length - 1]; let touche = null;
    for (let i = fin + 1; i < B.length; i++) if (B[i].l <= P.poc.prix && B[i].h >= P.poc.prix) { touche = i; break; }
    if (touche != null) out.push({ prix: P.poc.prix, periode, debut: cles[g], tFin: B[fin].t, iFin: fin, nu: false, touche, v: P.poc.v });
  }
  return out;
}

/* ───── MFI (« RSI du volume ») ───── */
export function mfi(B, n = PARAMS_VOLUME.mfi) {
  const out = new Array(B.length).fill(null), tp = B.map(b => (b.h + b.l + b.c) / 3), flux = B.map((b, i) => tp[i] * (b.v || 0));
  for (let i = n; i < B.length; i++) {
    let pos = 0, neg = 0; for (let j = i - n + 1; j <= i; j++) { if (tp[j] > tp[j - 1]) pos += flux[j]; else if (tp[j] < tp[j - 1]) neg += flux[j]; }
    out[i] = neg === 0 ? (pos === 0 ? 50 : 100) : 100 - 100 / (1 + pos / neg);
  }
  return out;
}
/* divergences prix / MFI : deux sommets (ou creux) de prix consécutifs, l'un plus haut (bas) que l'autre, alors que le MFI fait l'inverse. Détectées au pivot confirmé (k bougies après). */
export function divergencesMfi(B, M, k = 3, maxEcart = 40) {
  const out = [], hauts = [], bas = [];
  for (let i = k; i < B.length - k; i++) {
    let h = true, l = true; for (let j = 1; j <= k; j++) { if (!(B[i].h > B[i - j].h && B[i].h >= B[i + j].h)) h = false; if (!(B[i].l < B[i - j].l && B[i].l <= B[i + j].l)) l = false; }
    const c = i + k;   // confirmation
    if (h && M[i] != null) { const p = hauts[hauts.length - 1]; if (p && i - p.i <= maxEcart && B[i].h > p.px && M[i] < p.m) out.push({ i: c, pivot: i, avant: p.i, type: 'baissiere' }); hauts.push({ i, px: B[i].h, m: M[i] }); }
    if (l && M[i] != null) { const p = bas[bas.length - 1]; if (p && i - p.i <= maxEcart && B[i].l < p.px && M[i] > p.m) out.push({ i: c, pivot: i, avant: p.i, type: 'haussiere' }); bas.push({ i, px: B[i].l, m: M[i] }); }
  }
  return out;
}

/* ───── supports et résistances par le volume ───── */
/* Candidats : POC, VAH, VAL et HVN des profils des 20, 60 et 120 dernières bougies, POC nus de la semaine et du mois. Regroupés à moins de 0,5 ATR ; force = volume cumulé relatif + réactions passées + ancienneté.
   On ne garde que les `max` (3 à 5) plus forts, séparés d'au moins 1 ATR. */
export function niveauxVolume(B, { max = 5, fenetres = PARAMS_VOLUME.fenetresNiveaux } = {}) {
  if (!B || B.length < 40) return { niveaux: [], atr: null };
  const a = dernier(atr(B, 14)); if (!(a > 0)) return { niveaux: [], atr: null };
  const cand = [], px = B[B.length - 1].c;
  for (const f of fenetres) {
    const X = B.slice(-f); if (X.length < Math.min(f, 20)) continue; const P = profil(X); if (!P) continue; const m = P.total / P.bins.length;
    cand.push({ prix: P.poc.prix, type: 'POC ' + f, poids: 3 * P.poc.v / m / 3 });
    cand.push({ prix: P.vah, type: 'VAH ' + f, poids: 1.2 }); cand.push({ prix: P.val, type: 'VAL ' + f, poids: 1.2 });
    for (const h of P.hvn) cand.push({ prix: h.prix, type: 'HVN ' + f, poids: h.force });
  }
  for (const periode of ['semaine', 'mois']) for (const n of pocsNus(B, periode, { max: 3 })) cand.push({ prix: n.prix, type: 'POC nu ' + periode, poids: 2.5, ageBarres: B.length - 1 - n.iFin });
  cand.sort((x, y) => x.prix - y.prix);
  const groupes = []; for (const c of cand) { const g = groupes[groupes.length - 1]; if (g && c.prix - g.hi <= 0.5 * a) { g.items.push(c); g.hi = c.prix; } else groupes.push({ items: [c], hi: c.prix }); }
  const reactions = prix => { let n = 0; const tol = 0.25 * a; for (const b of B.slice(-250)) if (b.l <= prix + tol && b.h >= prix - tol && ((b.c > prix && b.l <= prix + tol) || (b.c < prix && b.h >= prix - tol))) n++; return n; };
  const liste = groupes.map(g => {
    const prix = g.items.reduce((s, c) => s + c.prix * c.poids, 0) / g.items.reduce((s, c) => s + c.poids, 0), r = reactions(prix), age = Math.max(...g.items.map(c => c.ageBarres || 0)), types = [...new Set(g.items.map(c => c.type))];
    const force = g.items.reduce((s, c) => s + c.poids, 0) + 0.15 * Math.min(r, 20) + 0.004 * Math.min(age, 250) + 0.4 * (types.length - 1);
    return { prix, force: +force.toFixed(3), reactions: r, sources: types, cote: prix >= px ? 'resistance' : 'support' };
  }).sort((x, y) => y.force - x.force);
  const retenus = []; for (const l of liste) { if (retenus.length >= max) break; if (retenus.every(x => Math.abs(x.prix - l.prix) >= a)) retenus.push(l); }
  return { niveaux: retenus.sort((x, y) => y.prix - x.prix), atr: a };
}

/* ───── flèches du mode Volume (à la clôture uniquement, une par événement) ───── */
export const TYPES_FLECHES_VOLUME = Object.freeze([
  { id: 'vol-absorption', nom: 'Absorption sur niveau de volume' }, { id: 'vol-cassure', nom: 'Cassure validée par le volume' }, { id: 'vol-faux', nom: 'Faux breakout' }
]);
const fmtNb = (x, d = 0) => Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ');
const decimales = p => (p >= 1000 ? 0 : p >= 100 ? 1 : p >= 10 ? 2 : 4);
/* Toutes les flèches sur la série B (la bougie i n'utilise que les bougies ≤ i) ; unite : 'H1' | 'H4' | 'J' pour le libellé ; renvoie une liste triée par bougie. */
export function flechesVolume(B, { unite = 'H4', fenetre = 60, minBarres = 80, cooldown = 8 } = {}) {
  if (!B || B.length < minBarres) return [];
  const A = atr(B, 14), D = serieDelta(B), R = volumeRelatif(B), nusS = tousPocsPeriode(B, 'semaine'), nusM = tousPocsPeriode(B, 'mois'), out = [], dernier_ = new Map();
  const U = unite === 'J' ? 'Jour' : unite;
  const pousser = (i, type, dir, niv, nom) => {
    /* une flèche par événement : même type et même sens = au plus une toutes les `cooldown` bougies (12 pour le faux breakout), quel que soit le niveau */
    const k = type + '|' + dir; const d = dernier_.get(k); if (d != null && i - d < (type === 'vol-faux' ? Math.max(cooldown, 12) : cooldown)) return; dernier_.set(k, i);
    const b = B[i], dec = decimales(b.c), fl = dir > 0 ? '↑' : '↓';
    const nomType = type === 'vol-absorption' ? 'Absorption' : type === 'vol-cassure' ? 'Cassure' : 'Faux breakout';
    out.push({ i, t: b.t, tFin: b.t + (unite === 'J' ? J : unite === 'H4' ? 4 * H : H), type, dir, niveau: niv, nomNiveau: nom, volRatio: R[i], delta: D[i], atr: A[i],
      libelle: `${nomType} ${U} · ${nom} ${fmtNb(niv, dec)} · volume ×${fmtNb(R[i] || 0, 1)} · delta ${D[i] >= 0 ? '↑' : '↓'}${type === 'vol-faux' ? ' · retour dans la zone de valeur' : ''}`, fleche: fl });
  };
  for (let i = Math.max(fenetre + 1, 25); i < B.length; i++) {
    const a = A[i]; if (!(a > 0) || R[i] == null) continue;
    const P = profil(B.slice(i - fenetre, i)); if (!P) continue;                       // profil des bougies PRÉCÉDENTES : rien de futur
    const b = B[i], rng = b.h - b.l, corps = Math.abs(b.c - b.o), tol = 0.25 * a, fort = R[i] > PARAMS_VOLUME.volumeFort;
    const niveaux = [{ p: P.val, n: 'VAL' }, { p: P.vah, n: 'VAH' }, { p: P.poc.prix, n: 'POC' }, ...P.hvn.map(h => ({ p: h.prix, n: 'HVN' })), ...pocsNusA(nusS, i).map(x => ({ p: x.prix, n: 'POC nu sem.' })), ...pocsNusA(nusM, i).map(x => ({ p: x.prix, n: 'POC nu mois' }))];
    /* absorption : volume fort sur un niveau, petit corps, longue mèche du côté du niveau, delta qui se retourne */
    if (fort && rng > 0 && corps <= 0.4 * rng) {
      const dPrec = D[i - 1] + (D[i - 2] || 0);
      for (const nv of niveaux) {
        if (!(b.l - tol <= nv.p && b.h + tol >= nv.p)) continue;
        const bas = Math.min(b.o, b.c) - b.l, haut = b.h - Math.max(b.o, b.c);
        if (bas >= 0.5 * rng && b.c > nv.p - tol && b.c >= (b.h + b.l) / 2 && D[i] > 0 && dPrec <= 0 && b.l <= nv.p + tol) { pousser(i, 'vol-absorption', +1, nv.p, nv.n); break; }
        if (haut >= 0.5 * rng && b.c < nv.p + tol && b.c <= (b.h + b.l) / 2 && D[i] < 0 && dPrec >= 0 && b.h >= nv.p - tol) { pousser(i, 'vol-absorption', -1, nv.p, nv.n); break; }
      }
    }
    /* cassure validée : clôture au-delà de la VAH / VAL / d'un HVN, venant de l'autre côté, volume fort, delta dans le sens */
    if (fort) {
      const prev = B[i - 1].c, cas = [{ p: P.vah, n: 'VAH', dir: +1 }, { p: P.val, n: 'VAL', dir: -1 }, ...P.hvn.map(h => ({ p: h.prix, n: 'HVN', dir: h.prix >= prev ? +1 : -1 }))];
      for (const c of cas) {
        const ok = c.dir > 0 ? prev <= c.p && b.c > c.p + 0.1 * a && D[i] > 0 : prev >= c.p && b.c < c.p - 0.1 * a && D[i] < 0;
        if (ok && Math.abs(D[i]) >= 0.1 * (b.v || 1)) { pousser(i, 'vol-cassure', c.dir, c.p, c.n); break; }
      }
    }
    /* faux breakout : une bougie récente (≤ 3) a clôturé HORS de la zone de valeur sans volume (≤ moyenne), et celle-ci referme DANS la zone */
    if (b.c <= P.vah && b.c >= P.val) {
      for (let j = i - 1; j >= Math.max(1, i - 3); j--) {
        const bj = B[j]; if (R[j] == null || R[j] > 0.8) continue;                 // sortie SANS volume (≤ 0,8 × la moyenne)
        if (bj.c > P.vah + 0.15 * a && b.c <= P.vah - 0.1 * a) { pousser(i, 'vol-faux', -1, P.vah, 'VAH'); break; }   // sortie nette (≥ 0,15 ATR), retour net (≥ 0,1 ATR) dans la zone
        if (bj.c < P.val - 0.15 * a && b.c >= P.val + 0.1 * a) { pousser(i, 'vol-faux', +1, P.val, 'VAL'); break; }
      }
    }
  }
  return out;
}
/* événements au format des statistiques de flèches : { 'vol-absorption': [{ i, dir, atr }], … } */
export function evenementsVolume(B, unite = 'H4') {
  const out = Object.fromEntries(TYPES_FLECHES_VOLUME.map(t => [t.id, []]));
  for (const f of flechesVolume(B, { unite })) out[f.type].push({ i: f.i, dir: f.dir, atr: f.atr });
  return out;
}

/* ───── carnet d'ordres ───── */
/* book : { bids: [[prix, qté]…] (du meilleur au pire), asks: [[prix, qté]…] } → déséquilibre sur les n premiers niveaux : (B − A) / (B + A) dans [−1 ; 1] */
export function desequilibre(book, n) {
  if (!book || !book.bids || !book.asks) return null;
  const b = book.bids.slice(0, n).reduce((s, x) => s + x[1], 0), a = book.asks.slice(0, n).reduce((s, x) => s + x[1], 0); if (!(a + b > 0)) return null;
  return { acheteurs: b, vendeurs: a, ratio: (b - a) / (b + a), part: b / (a + b) };
}
/* murs : ordres > k × la médiane des quantités du carnet affiché (k = 4 par défaut), du plus gros au plus petit */
export function murs(book, { k = 4, max = 6 } = {}) {
  if (!book || !book.bids || !book.asks) return [];
  const toutes = [...book.bids, ...book.asks].map(x => x[1]).filter(q => q > 0).sort((x, y) => x - y); if (toutes.length < 6) return [];
  const med = toutes[toutes.length >> 1], seuil = k * med, f = (L, cote) => L.filter(x => x[1] >= seuil).map(x => ({ prix: x[0], qte: x[1], cote, x: x[1] / med }));
  return [...f(book.bids, 'achat'), ...f(book.asks, 'vente')].sort((a, b) => b.qte - a.qte).slice(0, max);
}
/* grosses transactions : seuil = max(5 × la médiane des tailles récentes, le 98ᵉ centile) */
export function seuilGrosses(tailles) {
  const s = tailles.filter(x => x > 0).sort((a, b) => a - b); if (s.length < 30) return Infinity;
  const med = s[s.length >> 1], q98 = s[Math.floor(s.length * 0.98)]; return Math.max(5 * med, q98);
}

/* ───── agrégation H1 → H4 (grille UTC), volumes et volumes acheteurs sommés ───── */
export function enH4(B1) {
  const out = []; let cur = null;
  for (const b of B1) { const t0 = Math.floor(b.t / (4 * H)) * 4 * H; if (!cur || cur.t !== t0) { cur = { t: t0, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0, ...(Number.isFinite(b.bv) ? { bv: b.bv } : {}) }; out.push(cur); } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v || 0; if (Number.isFinite(b.bv) && Number.isFinite(cur.bv)) cur.bv += b.bv; else delete cur.bv; } }
  return out;
}
