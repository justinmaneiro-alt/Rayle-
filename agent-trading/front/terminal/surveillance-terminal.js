/* ═════════════ TERMINAL : SURVEILLANCE DES OBJETS, REGISTRE ET ZONES DE RÉACTION (pur, testé) ═════════════
   Applique les règles figées « alertes-terminal-v1 » (regles-terminal.js) sur les bougies CLOSES de l'unité surveillée.
   Strictement causal : rejouer les bougies une à une donne exactement les mêmes événements, flèches et croix (aucun repeint). */
import { REGLES_TERMINAL } from './regles-terminal.js';
import { valeur, SURVEILLES } from './objets-calcul.js';

/* ATR à la bougie d'avant : A[i] = moyenne des 14 étendues vraies jusqu'à i ; on lit A[i - 1] */
export function atrSerie(C, n = REGLES_TERMINAL.atrN) {
  const A = new Array(C.length).fill(null); let s = 0; const tr = [];
  for (let i = 0; i < C.length; i++) { const b = C[i], pc = i ? C[i - 1].c : b.c; tr[i] = Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc)); s += tr[i]; if (i >= n) s -= tr[i - n]; if (i >= n - 1) A[i] = s / n; }
  return A;
}
/* bougies closes à l'instant « maintenant » (la bougie en cours est exclue) */
export const closes = (B, ms, maintenant = Date.now()) => { let k = B.length; while (k > 0 && B[k - 1].t + ms > maintenant) k--; return k === B.length ? B : B.slice(0, k); };

/* surveillance d'un objet (ligne, zone, tendance, rayon) ; ms = durée d'une bougie de l'unité surveillée */
export function surveillerObjet(C, A, o, ms, R = REGLES_TERMINAL) {
  const ev = [], fleches = [], croix = []; let cote = null, approche = false, touche = false, attente = null, flecheFaite = false, alerteFaite = false, retourne = false;
  const pousser = (type, i, niveau, extra = {}) => ev.push({ id: `${o.id}|${type}|${C[i].t}`, objet: o.id, outil: o.type, actif: o.actif, unite: o.unite, type, t: C[i].t, tFin: C[i].t + ms, prix: C[i].c, niveau, cote, atr: A[i - 1], ...extra });
  for (let i = 1; i < C.length; i++) {
    const b = C[i], a = A[i - 1]; if (!a || b.t + ms <= o.cree) continue;
    const v = valeur(o, b.t); if (v == null) continue;
    const bas = typeof v === 'object' ? v.bas : v, haut = typeof v === 'object' ? v.haut : v, ref = C[i - 1].c;
    if (!cote) { cote = ref > haut ? 'support' : ref < bas ? 'resistance' : null; if (!cote) continue; }   // v2 : côté collant, changé seulement par une cassure confirmée
    const sup = cote === 'support', bord = sup ? haut : bas, loin = sup ? bas : haut, ext = sup ? b.l : b.h, d = Math.max(0, sup ? ext - bord : bord - ext);
    if (sup ? b.c <= loin - R.cassureAtr * a : b.c >= loin + R.cassureAtr * a) {
      retourne = !retourne; pousser('cassure', i, loin, { retourne, sens: sup ? 'baisse' : 'hausse' }); croix.push({ t: b.t, i, niveau: loin, objet: o.id, sens: sup ? 'baisse' : 'hausse', prix: b.c });
      approche = false; touche = false; attente = null; flecheFaite = false; alerteFaite = false; cote = sup ? 'resistance' : 'support'; continue;
    }
    if (!approche && d <= R.approcheAtr * a) { approche = true; touche = false; attente = null; flecheFaite = false; pousser('approche', i, bord); }
    if (approche && d <= R.toucheAtr * a) {
      if (!touche) { touche = true; pousser('touche', i, bord); }
      if (!attente && !flecheFaite) attente = { j: i, ext };
    }
    if (o.alerte && !alerteFaite && d === 0) { alerteFaite = true; pousser('alerte', i, bord); }
    if (attente && i > attente.j && (sup ? b.l < attente.ext : b.h > attente.ext)) attente = (d <= R.toucheAtr * a && !flecheFaite) ? { j: i, ext } : null;
    const loinDuBord = sup ? b.c >= bord + R.reboundAtr * a : b.c <= bord - R.reboundAtr * a;
    if (attente && i >= attente.j && !flecheFaite && loinDuBord) {
      flecheFaite = true; const f = { t: b.t, i, sens: sup ? 'hausse' : 'baisse', niveau: bord, objet: o.id, outil: o.type, atr: a, tTouche: C[attente.j].t, prix: b.c, version: R.version };
      fleches.push(f); pousser('rebond', i, bord, { sens: f.sens, tTouche: f.tTouche }); attente = null;
    }
    if (approche && (sup ? b.c >= bord + R.finApprocheAtr * a : b.c <= bord - R.finApprocheAtr * a)) { approche = false; touche = false; attente = null; flecheFaite = false; alerteFaite = false; }
  }
  return { ev, fleches, croix, cote, retourne };
}
/* toutes les surveillances d'une unité (objets de cette unité seulement) */
export function surveiller(C, objets, ms, R = REGLES_TERMINAL) {
  const A = atrSerie(C, R.atrN), out = { ev: [], fleches: [], croix: [], etats: {} };
  for (const o of objets) { if (!SURVEILLES.includes(o.type)) continue; const r = surveillerObjet(C, A, o, ms, R);
    out.ev.push(...r.ev); out.fleches.push(...r.fleches); out.croix.push(...r.croix); out.etats[o.id] = { cote: r.cote || null, retourne: !!r.retourne }; }
  out.ev.sort((x, y) => x.t - y.t || (x.id < y.id ? -1 : 1)); out.fleches.sort((x, y) => x.t - y.t); return out;
}
/* l'objet a-t-il cette alerte active ? (cases par type ; « alerte » = case « m'alerter ») */
export const alerteActive = (o, type) => type === 'alerte' ? !!o.alerte : !(o.alertes && o.alertes[type] === false);

/* ── registre : excursions sur 48 bougies, bilan par type d'outil ── */
export function excursion(C, e, R = REGLES_TERMINAL) {
  const i = C.findIndex(b => b.t === e.t); if (i < 0 || i + R.excursionBougies >= C.length || !e.atr) return null;
  const haussier = e.type === 'cassure' ? e.cote === 'resistance' : e.outil === 'position' ? e.cote === 'achat' : e.cote === 'support', d = haussier ? 1 : -1, p0 = C[i].c;
  let fav = 0, adv = 0; for (let j = i + 1; j <= i + R.excursionBougies; j++) { fav = Math.max(fav, d > 0 ? C[j].h - p0 : p0 - C[j].l); adv = Math.max(adv, d > 0 ? p0 - C[j].l : C[j].h - p0); }
  return { id: e.id, favAtr: fav / e.atr, advAtr: adv / e.atr, favPct: 100 * fav / p0, advPct: 100 * adv / p0, sens: haussier ? 'hausse' : 'baisse' };
}
const med = L => { const s = L.slice().sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
export function bilanRegistre(evenements, suivis, R = REGLES_TERMINAL) {
  const S = new Map(suivis.map(s => [s.id, s])), out = [];
  for (const outil of ['horizontale', 'zone', 'tendance', 'rayon']) for (const type of ['approche', 'touche', 'rebond', 'cassure']) {
    const E = evenements.filter(e => e.outil === outil && e.type === type); if (!E.length) continue; const X = E.map(e => S.get(e.id)).filter(Boolean);
    out.push({ outil, type, n: E.length, mesures: X.length, assez: X.length >= R.minEvenements, favAtr: med(X.map(x => x.favAtr)), advAtr: med(X.map(x => x.advAtr)), favPct: med(X.map(x => x.favPct)), advPct: med(X.map(x => x.advPct)) });
  }
  return out;
}

/* ── zones de réaction : profil de volume + statistiques réelles des tests ── */
export function profilVolume(C, cases = REGLES_TERMINAL.profilCases) {
  if (!C.length) return null; let lo = Infinity, hi = -Infinity; for (const b of C) { if (b.l < lo) lo = b.l; if (b.h > hi) hi = b.h; }
  if (!(hi > lo)) return null; const pas = (hi - lo) / cases, vol = new Array(cases).fill(0);
  for (const b of C) { if (!(b.v > 0)) continue; const i0 = Math.max(0, Math.floor((b.l - lo) / pas)), i1 = Math.min(cases - 1, Math.floor((b.h - lo) / pas)), part = b.v / (i1 - i0 + 1); for (let k = i0; k <= i1; k++) vol[k] += part; }
  return { lo, hi, pas, vol };
}
export function zonesReaction(Ctout, { R = REGLES_TERMINAL, ms } = {}) {
  const C = Ctout.filter(b => !b.bande).slice(-R.profilBougies); if (C.length < 60) return [];
  const P = profilVolume(C, R.profilCases); if (!P) return [];
  const m = med(P.vol.filter(v => v > 0)); if (!(m > 0)) return [];
  const cand = [];
  for (let k = 0; k < P.vol.length; k++) { const v = P.vol[k]; if (v < R.zonesSeuil * m) continue; if ((k > 0 && P.vol[k - 1] > v) || (k < P.vol.length - 1 && P.vol[k + 1] >= v)) continue; cand.push({ k, v }); }
  const A = atrSerie(C, R.atrN);
  return cand.sort((a, b) => b.v - a.v).slice(0, R.zonesMax).map(({ k, v }) => {
    const bas = P.lo + k * P.pas, haut = bas + P.pas, st = testsZone(C, A, bas, haut, R);
    return { bas, haut, p: (bas + haut) / 2, volume: v, force: v / m, tests: st.tests, tenues: st.tenues, enCours: st.enCours, depuis: C[0].t, jusqua: C[C.length - 1].t + (ms || 0) };
  }).sort((a, b) => b.p - a.p);
}
/* tests d'une zone : approches (règles v1) ; « tient » = éloignement ≥ 0,5 ATR avant un dépassement ≥ 0,25 ATR */
export function testsZone(C, A, bas, haut, R = REGLES_TERMINAL) {
  let tests = 0, tenues = 0, cote = null, approche = false, enCours = null;
  for (let i = 1; i < C.length; i++) {
    const b = C[i], a = A[i - 1]; if (!a) continue; const ref = C[i - 1].c;
    if (!cote) { cote = ref > haut ? 'support' : ref < bas ? 'resistance' : null; if (!cote) continue; }
    const sup = cote === 'support', bord = sup ? haut : bas, loin = sup ? bas : haut, d = Math.max(0, sup ? b.l - bord : bord - b.h);
    if (sup ? b.c <= loin - R.cassureAtr * a : b.c >= loin + R.cassureAtr * a) { enCours = null; approche = false; cote = sup ? 'resistance' : 'support'; continue; }   // cassure confirmée : le côté change
    if (enCours) {
      if (sup ? b.l < loin - R.zoneTenue.depassement * a : b.h > loin + R.zoneTenue.depassement * a) { enCours = null; }
      else if (sup ? b.h >= bord + R.zoneTenue.rejet * a : b.l <= bord - R.zoneTenue.rejet * a) { tenues++; enCours = null; }
    }
    if (!approche && d <= R.approcheAtr * a) { approche = true; tests++; enCours = { i }; }
    if (approche && (sup ? b.c >= bord + R.finApprocheAtr * a : b.c <= bord - R.finApprocheAtr * a)) approche = false;
  }
  return { tests, tenues, enCours: !!enCours };
}
