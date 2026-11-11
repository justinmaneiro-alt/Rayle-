/* ═════════════ RSI, DIVERGENCES ET SCHÉMAS DE RETOURNEMENT (pur, testé, scellé SHA-256 avant affichage et avant toute statistique) ═════════════
   Règle « schemas-retournement-v1 ». Tout est posé à la CLÔTURE de la bougie de confirmation (jamais avant), daté, ne bouge plus ; invalidé = grisé mais visible.
   • RSI(14) de Wilder sur les clôtures. ATR = moyenne simple des 14 dernières étendues vraies (atrLocal, comme les niveaux).
   • Pivots : fractale de 5 bougies (2 de chaque côté), confirmés 2 bougies après (jamais avant).
   • Divergence : deux pivots consécutifs de même sorte, écartés de 5 à 60 bougies. Régulière haussière : creux plus bas sur le prix, creux plus haut sur le RSI ;
     régulière baissière : sommet plus haut sur le prix, plus bas sur le RSI ; cachée haussière : creux plus haut sur le prix, plus bas sur le RSI ; cachée baissière : l'inverse.
     Posée à la bougie qui confirme le 2e pivot.
   • Double sommet / creux : 2 pivots à ≤ 0,5 ATR, écartés d'au moins 8 bougies (au plus 60), sans extrême plus haut entre eux ; ligne de cou = plus bas (haut) entre eux ;
     confirmé par une clôture au-delà de la ligne de cou, invalidé par une clôture à plus de 0,25 ATR au-delà de l'extrême des deux pivots, expiré après 30 bougies.
   • Tête et épaules (et inversé) : 3 sommets consécutifs, la tête dépasse les épaules d'au moins 0,5 ATR, épaules à ≤ 1 ATR l'une de l'autre, ≥ 5 bougies entre sommets ;
     ligne de cou par les 2 creux ; confirmé par une clôture au-delà de la ligne de cou ; même invalidation et expiration.
   • Balayage de liquidité avec réintégration : une mèche dépasse d'au moins 0,1 ATR un pivot des 48 dernières bougies (jamais dépassé depuis), la bougie CLÔTURE de nouveau en deçà.
   • Bougies de retournement (marteau, étoile filante, avalement) : seulement en zone (support pour les haussières, résistance pour les baissières), étendue ≥ 0,5 ATR.
   Cible indicative d'un schéma = hauteur du schéma reportée depuis la ligne de cou : un repère de lecture, jamais une promesse. */
import { atrLocal } from './niveaux-periode.js';

export const VERSION = 'schemas-retournement-v1';
export const P = Object.freeze({
  rsiN: 14, K: 2, espaceMin: 5, espaceMax: 60,
  doubleAtr: 0.5, doubleEcartMin: 8, doubleEcartMax: 60, confirmMax: 30, invalidAtr: 0.25,
  teteAtr: 0.5, epaulesAtr: 1.0, teteEcartMin: 5, teteEtendueMax: 90,
  balayageRegard: 48, balayageMecheAtr: 0.1,
  bougieEtendueAtr: 0.5, zoneAtr: 0.3
});
export const NOMS = Object.freeze({ reguliere: 'régulière', cachee: 'cachée', double: 'double sommet / creux', tete: 'tête et épaules', balayage: 'balayage de liquidité avec réintégration', bougie: 'bougie de retournement' });

/* RSI de Wilder (null avant n clôtures) */
export function rsi(B, n = P.rsiN) {
  const o = new Array(B.length).fill(null); if (B.length <= n) return o;
  let g = 0, p = 0; for (let i = 1; i <= n; i++) { const d = B[i].c - B[i - 1].c; if (d > 0) g += d; else p -= d; } g /= n; p /= n;
  o[n] = p === 0 ? 100 : 100 - 100 / (1 + g / p);
  for (let i = n + 1; i < B.length; i++) { const d = B[i].c - B[i - 1].c; g = (g * (n - 1) + Math.max(d, 0)) / n; p = (p * (n - 1) + Math.max(-d, 0)) / n; o[i] = p === 0 ? 100 : 100 - 100 / (1 + g / p); }
  return o;
}
/* pivots confirmés (fractale de 2K+1) : { i, conf, type 'H'|'L', p } ; égalité tolérée du côté droit (un sommet double compte une fois) */
export function pivotsK(B, K = P.K) {
  const o = [];
  for (let i = K; i < B.length - K; i++) {
    let h = true, l = true;
    for (let d = 1; d <= K; d++) { if (!(B[i].h > B[i - d].h && B[i].h >= B[i + d].h)) h = false; if (!(B[i].l < B[i - d].l && B[i].l <= B[i + d].l)) l = false; }
    if (h) o.push({ i, conf: i + K, type: 'H', p: B[i].h }); if (l) o.push({ i, conf: i + K, type: 'L', p: B[i].l });
  }
  return o;
}
const atrDe = (B, A, i) => A[i] || A[i - 1] || null;
const mk = (B, tf, periode, extra) => ({ tf, ...extra, t: B[extra.i].t, tCloture: B[extra.i].t + periode });

/* ── DIVERGENCES RSI ── */
export function divergences(B, { tf = 'H1', periode = 3600e3, R = rsi(B), pv = pivotsK(B), zones = null, A = atrLocal(B, 14) } = {}) {
  const out = [];
  for (const type of ['H', 'L']) {
    const L = pv.filter(x => x.type === type);
    for (let k = 1; k < L.length; k++) {
      const a = L[k - 1], b = L[k], e = b.i - a.i; if (e < P.espaceMin || e > P.espaceMax) continue;
      const r1 = R[a.i], r2 = R[b.i]; if (r1 == null || r2 == null) continue;
      let sous = null, dir = 0;
      if (type === 'H') { if (b.p > a.p && r2 < r1) { sous = 'reguliere'; dir = -1; } else if (b.p < a.p && r2 > r1) { sous = 'cachee'; dir = -1; } }
      else { if (b.p < a.p && r2 > r1) { sous = 'reguliere'; dir = 1; } else if (b.p > a.p && r2 < r1) { sous = 'cachee'; dir = 1; } }
      if (!sous) continue;
      const a14 = atrDe(B, A, b.conf); if (!a14) continue;
      const ev = mk(B, tf, periode, { kind: 'divergence', sous, dir, i: b.conf, i1: a.i, i2: b.i, t1: B[a.i].t, t2: B[b.i].t, p1: a.p, p2: b.p, r1, r2, id: `${tf}|div|${sous}|${dir}|${B[b.i].t}`, statut: 'pose' });
      ev.enZone = zones ? zones(b.i, dir, B[b.i]) : null;
      out.push(ev);
    }
  }
  return out.sort((x, y) => x.i - y.i);
}

/* ── SCHÉMAS : double sommet / creux, tête et épaules (et inversé) ── */
function suite(B, A, schema, confirme, invalide, finMin) {
  // parcourt les bougies APRÈS la formation ; renvoie { statut, i } à la première clôture qui confirme ou invalide, expire après confirmMax bougies
  const lim = Math.min(B.length - 1, schema.iFormation + P.confirmMax + 2);
  for (let j = Math.max(finMin, schema.i2 + 1); j <= lim; j++) { if (invalide(j)) return { statut: 'invalide', raison: 'invalidé par une clôture au-delà de l\'extrême', i: j }; if (confirme(j)) return { statut: 'confirme', i: j }; }
  if (B.length - 1 > schema.iFormation + P.confirmMax + 2) return { statut: 'invalide', raison: 'expiré (aucune confirmation en ' + P.confirmMax + ' bougies)', i: schema.iFormation + P.confirmMax + 2 };
  return { statut: 'formation', i: null };
}
export function schemasDoubles(B, { tf = 'H1', periode = 3600e3, pv = pivotsK(B), A = atrLocal(B, 14) } = {}) {
  const out = [];
  for (const type of ['H', 'L']) {
    const L = pv.filter(x => x.type === type), dir = type === 'H' ? -1 : 1;
    for (let k = 1; k < L.length; k++) {
      const a = L[k - 1], b = L[k], e = b.i - a.i, at = atrDe(B, A, b.conf); if (!at || e < P.doubleEcartMin || e > P.doubleEcartMax || Math.abs(a.p - b.p) > P.doubleAtr * at) continue;
      const ext = type === 'H' ? Math.max(a.p, b.p) : Math.min(a.p, b.p);
      let nl = type === 'H' ? Infinity : -Infinity, inl = a.i, depasse = false;
      for (let j = a.i + 1; j < b.i; j++) { if (type === 'H') { if (B[j].l < nl) { nl = B[j].l; inl = j; } if (B[j].h > ext + 0.1 * at) depasse = true; } else { if (B[j].h > nl) { nl = B[j].h; inl = j; } if (B[j].l < ext - 0.1 * at) depasse = true; } }
      if (depasse) continue;
      const S = { kind: 'double', dir, type, i1: a.i, i2: b.i, iFormation: b.conf, inl, nl, ext, id: `${tf}|double|${dir}|${B[b.i].t}`, points: [{ t: B[a.i].t, p: a.p }, { t: B[b.i].t, p: b.p }], cou: { t0: B[inl].t, p0: nl, t1: null, p1: nl }, hauteur: Math.abs(ext - nl), cible: dir < 0 ? nl - Math.abs(ext - nl) : nl + Math.abs(ext - nl), atr: at };
      const r = suite(B, A, S, j => (dir < 0 ? B[j].c < nl : B[j].c > nl), j => (dir < 0 ? B[j].c > ext + P.invalidAtr * at : B[j].c < ext - P.invalidAtr * at), b.conf);
      out.push(finir(B, tf, periode, S, r));
    }
  }
  return out.sort((x, y) => x.iFormation - y.iFormation);
}
export function schemasTete(B, { tf = 'H1', periode = 3600e3, pv = pivotsK(B), A = atrLocal(B, 14) } = {}) {
  const out = [];
  for (const type of ['H', 'L']) {
    const L = pv.filter(x => x.type === type), dir = type === 'H' ? -1 : 1, s = dir < 0 ? 1 : -1;   // s : signe « vers l'extérieur » (haut pour une tête haute)
    for (let k = 2; k < L.length; k++) {
      const a = L[k - 2], h = L[k - 1], b = L[k], at = atrDe(B, A, b.conf); if (!at) continue;
      if (h.i - a.i < P.teteEcartMin || b.i - h.i < P.teteEcartMin || b.i - a.i > P.teteEtendueMax) continue;
      if (!(s * (h.p - a.p) >= P.teteAtr * at && s * (h.p - b.p) >= P.teteAtr * at && Math.abs(a.p - b.p) <= P.epaulesAtr * at)) continue;
      const creux = (i0, i1) => { let m = null, im = i0; for (let j = i0 + 1; j < i1; j++) { const v = dir < 0 ? B[j].l : B[j].h; if (m == null || (dir < 0 ? v < m : v > m)) { m = v; im = j; } } return { p: m, i: im }; };
      const c1 = creux(a.i, h.i), c2 = creux(h.i, b.i); if (c1.p == null || c2.p == null || c1.i === c2.i) continue;
      const pente = (c2.p - c1.p) / (c2.i - c1.i), cou = j => c1.p + pente * (j - c1.i);
      if (dir < 0 ? (c1.p > h.p - 0.3 * at) : (c1.p < h.p + 0.3 * at)) continue;
      const hauteur = Math.abs(h.p - cou(h.i)), S = { kind: 'tete', dir, type, i1: a.i, i2: b.i, iTete: h.i, iFormation: b.conf, id: `${tf}|tete|${dir}|${B[b.i].t}`, points: [{ t: B[a.i].t, p: a.p }, { t: B[h.i].t, p: h.p }, { t: B[b.i].t, p: b.p }], cou: { t0: B[c1.i].t, p0: c1.p, t1: B[c2.i].t, p1: c2.p, pente }, hauteur, atr: at, ext: h.p };
      const r = suite(B, A, S, j => (dir < 0 ? B[j].c < cou(j) : B[j].c > cou(j)), j => (dir < 0 ? B[j].c > h.p + P.invalidAtr * at : B[j].c < h.p - P.invalidAtr * at), b.conf);
      if (r.statut === 'confirme') S.cible = cou(r.i) + (dir < 0 ? -hauteur : hauteur); else S.cible = cou(b.i) + (dir < 0 ? -hauteur : hauteur);
      out.push(finir(B, tf, periode, S, r));
    }
  }
  return out.sort((x, y) => x.iFormation - y.iFormation);
}
function finir(B, tf, periode, S, r) {
  const o = { ...S, tf, statut: r.statut, raison: r.raison || null, tFormation: B[S.iFormation].t, tCloFormation: B[S.iFormation].t + periode };
  if (r.statut === 'confirme') { o.iConfirm = Math.max(r.i, S.iFormation); o.i = o.iConfirm; o.tConfirm = B[o.iConfirm].t; o.tCloture = o.tConfirm + periode; }
  else if (r.statut === 'invalide') { o.iInval = Math.max(r.i, S.iFormation); o.i = o.iFormation; o.tInval = B[Math.min(B.length - 1, o.iInval)].t; o.tCloture = o.tCloFormation; }
  else { o.i = o.iFormation; o.tCloture = o.tCloFormation; }
  o.t = B[o.i].t; return o;
}

/* ── BALAYAGE DE LIQUIDITÉ AVEC RÉINTÉGRATION ── */
export function balayages(B, { tf = 'H1', periode = 3600e3, pv = pivotsK(B), A = atrLocal(B, 14), zones = null } = {}) {
  const out = [], pris = new Set();
  for (let j = P.K + 2; j < B.length; j++) {
    const at = atrDe(B, A, j); if (!at) continue;
    for (const x of pv) {
      if (x.conf > j - 1 || x.i < j - P.balayageRegard || pris.has(x.i + x.type)) continue;
      const haut = x.type === 'H', depasse = haut ? B[j].h > x.p + P.balayageMecheAtr * at : B[j].l < x.p - P.balayageMecheAtr * at, reintegre = haut ? B[j].c < x.p : B[j].c > x.p;
      if (!depasse) continue;
      // déjà dépassé avant ? alors ce n'est plus un balayage (le niveau n'existe plus)
      let avant = false; for (let q = x.conf; q < j; q++) if (haut ? B[q].h > x.p : B[q].l < x.p) { avant = true; break; }
      if (avant) { pris.add(x.i + x.type); continue; }
      pris.add(x.i + x.type);
      if (reintegre) { const dir = haut ? -1 : 1; const ev = mk(B, tf, periode, { kind: 'balayage', dir, i: j, niveau: x.p, tNiveau: B[x.i].t, id: `${tf}|balayage|${dir}|${B[j].t}`, statut: 'pose', mecheAtr: Math.abs((haut ? B[j].h : B[j].l) - x.p) / at }); ev.enZone = zones ? zones(j, dir, B[j]) : null; out.push(ev); }
    }
  }
  return out;
}

/* ── BOUGIES DE RETOURNEMENT, seulement en zone ── */
export function bougies(B, { tf = 'H1', periode = 3600e3, A = atrLocal(B, 14), zones = null } = {}) {
  const out = []; if (!zones) return out;
  for (let j = 1; j < B.length; j++) {
    const b = B[j], at = atrDe(B, A, j), e = b.h - b.l; if (!at || e < P.bougieEtendueAtr * at) continue;
    const corps = Math.abs(b.c - b.o), haut = b.h - Math.max(b.o, b.c), bas = Math.min(b.o, b.c) - b.l, pr = B[j - 1], corpsPr = Math.abs(pr.c - pr.o);
    const marteau = bas >= 2 * Math.max(corps, 0.05 * e) && haut <= 0.3 * e && (Math.min(b.o, b.c) - b.l) >= 0.55 * e;
    const etoile = haut >= 2 * Math.max(corps, 0.05 * e) && bas <= 0.3 * e && haut >= 0.55 * e;
    const avHaus = pr.c < pr.o && b.c > b.o && b.c >= pr.o && b.o <= pr.c && corps >= 0.4 * at && corps > corpsPr;
    const avBais = pr.c > pr.o && b.c < b.o && b.c <= pr.o && b.o >= pr.c && corps >= 0.4 * at && corps > corpsPr;
    const noms = []; if (marteau) noms.push(['marteau', 1]); if (etoile) noms.push(['étoile filante', -1]); if (avHaus) noms.push(['avalement haussier', 1]); if (avBais) noms.push(['avalement baissier', -1]);
    for (const [nom, dir] of noms) { const z = zones(j, dir, b); if (!z) continue; out.push(mk(B, tf, periode, { kind: 'bougie', nom, dir, i: j, id: `${tf}|bougie|${nom}|${b.t}`, statut: 'pose', enZone: z })); }
  }
  return out;
}

/* ── tout, d'un coup (la même fonction sert l'interface, les tests et les statistiques) ── */
export function analyser(B, { tf = 'H1', periode = 3600e3, zones = null } = {}) {
  if (!B || B.length < 40) return { rsi: [], divergences: [], doubles: [], tetes: [], balayages: [], bougies: [], tf, n: B ? B.length : 0 };
  const R = rsi(B), pv = pivotsK(B), A = atrLocal(B, 14);
  return { tf, n: B.length, rsi: R, divergences: divergences(B, { tf, periode, R, pv, zones, A }), doubles: schemasDoubles(B, { tf, periode, pv, A }), tetes: schemasTete(B, { tf, periode, pv, A }), balayages: balayages(B, { tf, periode, pv, A, zones }), bougies: bougies(B, { tf, periode, A, zones }) };
}
/* callback « en zone » pour une liste de zones datées { bas, haut, cote, tDebut, tFin } : une bougie est en zone si sa mèche (basse pour une haussière, haute pour une baissière)
   est dans une zone du bon côté À SON ÉPOQUE (jamais une zone née plus tard : pas de repaint) */
export function enZoneListe(zones, A, B) {
  return (j, dir, b) => {
    const at = A[j] || A[j - 1]; if (!at) return null; const tol = P.zoneAtr * at, t = B[j].t;
    for (const z of zones) {
      if (z.tDebut != null && z.tDebut > t) continue; if (z.tFin != null && z.tFin <= t) continue;
      if (dir > 0 && z.cote === 'support' && B[j].l <= z.haut + tol && B[j].l >= z.bas - tol) return z;
      if (dir < 0 && z.cote === 'resistance' && B[j].h >= z.bas - tol && B[j].h <= z.haut + tol) return z;
    }
    return null;
  };
}
/* phrase d'attention (jamais un ordre) pour un événement ; contre : { sens: 'achat'|'vente' } ou null */
export function phraseAttention(e, { contre = null } = {}) {
  const dirNom = e.dir < 0 ? 'baissière' : 'haussière', zone = e.enZone ? (e.dir < 0 ? ' en zone de vente' : ' en zone d\'achat') : '';
  let t;
  if (e.kind === 'divergence') t = `Attention : divergence ${e.dir < 0 ? 'baissière' : 'haussière'}${e.sous === 'cachee' ? ' cachée' : ''} RSI ${e.tf}${zone}`;
  else if (e.kind === 'double') t = `Attention : ${e.dir < 0 ? 'double sommet' : 'double creux'} ${e.statut === 'confirme' ? 'confirmé' : 'en formation'} ${e.tf}${zone}`;
  else if (e.kind === 'tete') t = `Attention : ${e.dir < 0 ? 'tête et épaules' : 'tête et épaules inversée'} ${e.statut === 'confirme' ? 'confirmée' : 'en formation'} ${e.tf}`;
  else if (e.kind === 'balayage') t = `Attention : balayage de liquidité ${e.dir < 0 ? 'haute' : 'basse'} avec réintégration ${e.tf}${zone}`;
  else t = `Attention : ${e.nom} ${e.tf}${zone}`;
  if (contre && ((contre.sens === 'achat' && e.dir < 0) || (contre.sens === 'vente' && e.dir > 0))) t += ' — contre ta position : protection ou réduction à envisager';
  return t + ' (information, jamais un ordre)';
}
