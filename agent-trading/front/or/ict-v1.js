/* ═════════════ ANALYSE ICT EN UN CLIC (pur, testé, scellé SHA-256 avant affichage et avant toute statistique) ═════════════
   Règle « ict-v1 » : INTERPRÉTATION de l'ICT, définitions variables selon les sources. Rayle décrit et mesure ; jamais « achète » / « vends », jamais une promesse.
   Tout est posé à la clôture de la bougie qui rend l'élément connu, daté, et ne bouge plus ; un état ne fait qu'avancer (non rempli → partiel → rempli ; actif → balayé ; valide → invalidé).
   Heures : New York → Paris par les fuseaux America/New_York et Europe/Paris (jamais un décalage fixe : les changements d'heure américain et européen ne tombent pas le même jour).
   • Jour de marché : tranche de 24 h qui commence à 18:00 New York (ouverture des futures) ; semaine : du dimanche 18:00 NY au vendredi 17:00 NY.
   • Déplacement : une bougie H1 de corps ≥ 1,5 ATR(14) dont les mèches font au plus 25 % de l'étendue.
   • FVG : trois bougies H1, trou entre le plus haut de la 1re et le plus bas de la 3e (haussier) ou l'inverse, taille ≥ 0,3 ATR, corps de la bougie centrale ≥ 0,8 ATR ;
     rempli = le prix traverse tout le trou (mèche) ; partiel = il y entre sans le traverser ; inversé = une clôture H1 traverse le trou : il devient une zone du côté opposé.
   • Order block : dernière bougie contraire (parmi les 6 avant) d'un déplacement qui CLÔTURE au-delà du dernier pivot confirmé (fractale de 5) ; zone = étendue de cette bougie ;
     invalidé par une clôture au-delà de son extrémité opposée ; il devient alors un breaker (zone du côté opposé) jusqu'à une clôture au-delà de l'autre extrémité.
   • Liquidité : PDH/PDL (veille), PWH/PWL (semaine précédente), haut/bas de la plage asiatique (20:00–00:00 NY), des sessions Londres (02:00–05:00) et New York AM (07:00–10:00), sommets/creux égaux (≥ 2 pivots à ≤ 0,2 ATR) ;
     balayée = une mèche dépasse le niveau.
   • Premium / discount : plage de référence = plus haut / plus bas des 5 derniers jours de marché ; équilibre = 50 % ; OTE = 62 % à 79 % de retracement dans le sens de la dernière cassure de structure.
   • Temps : Asie 20h–00h, Londres 02h–05h, New York AM 07h–10h, clôture de Londres 10h–12h, Silver Bullet 03h–04h, 10h–11h, 14h–15h (heure de New York) ; ouverture de minuit et de 8h30 NY ; écarts d'ouverture de jour et de semaine.
   • AMD / Judas : accumulation = plage asiatique ; manipulation = première mèche au-delà du haut ou du bas asiatique pendant Londres ; distribution = mouvement de New York AM (07h–10h).
   • Biais : lecture (position du prix dans les plages de 20, 40 et 60 jours, côté premium / discount, liquidité non balayée la plus proche, dernière cassure) : jamais une prédiction. */
import { atrLocal } from './niveaux-periode.js';
import { pivotsK } from './schemas-retournement-v1.js';
import * as SM from './structure-marche-v1.js';

export const VERSION = 'ict-v1';
export const P = Object.freeze({
  deplacementAtr: 1.5, deplacementMeche: 0.25, fvgAtr: 0.3, fvgCorpsAtr: 0.8, fvgPortee: 24 * 12, obRegard: 6, obPortee: 24 * 12, egauxAtr: 0.2,
  fenetreJours: 5, plages: [20, 40, 60], oteBas: 0.62, oteHaut: 0.79, visibles: 8, ecartAtr: 0.1
});
export const KILLZONES = Object.freeze([
  { id: 'asie', nom: 'Asie', de: [20, 0], a: [24, 0] }, { id: 'londres', nom: 'Londres', de: [2, 0], a: [5, 0] }, { id: 'ny_am', nom: 'New York AM', de: [7, 0], a: [10, 0] },
  { id: 'londres_cloture', nom: 'Clôture de Londres', de: [10, 0], a: [12, 0] }, { id: 'sb_londres', nom: 'Silver Bullet Londres', de: [3, 0], a: [4, 0] },
  { id: 'sb_ny_am', nom: 'Silver Bullet NY AM', de: [10, 0], a: [11, 0] }, { id: 'sb_ny_pm', nom: 'Silver Bullet NY PM', de: [14, 0], a: [15, 0] }
]);

/* ── fuseaux ── */
const fmtNY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' });
const fmtParis = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hourCycle: 'h23', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const cacheNY = new Map();
export function partiesNY(t) {
  const k = Math.floor(t / 60000); let r = cacheNY.get(k); if (r) return r;
  const o = {}; for (const p of fmtNY.formatToParts(new Date(t))) o[p.type] = p.value;
  r = { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, jour: `${o.year}-${o.month}-${o.day}` }; if (cacheNY.size > 400000) cacheNY.clear(); cacheNY.set(k, r); return r;
}
export const decalageNY = t => { const p = partiesNY(t); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(t / 60000) * 60000; };   // négatif : −4 h ou −5 h
/* instant UTC d'une heure murale de New York (y, m, d, h, mi) ; h = 24 → minuit du lendemain. Heures inexistantes (saut de printemps) : décalées d'une heure ; ambiguës (retour d'hiver) : la première. */
export function instantNY(y, m, d, h, mi = 0) {
  const mur = Date.UTC(y, m - 1, d, h, mi); let t = mur - decalageNY(mur + 4 * 3600e3);
  for (let k = 0; k < 3; k++) { const t2 = mur - decalageNY(t); if (t2 === t) break; t = t2; }
  return t;
}
export const heureParis = t => fmtParis.format(new Date(t)).replace(',', '');
export const hhmmParis = t => heureParis(t).slice(-5);
/* jour de marché (clé AAAA-MM-JJ) : l'heure murale de NY + 6 h (le jour change à 18:00 NY) ; semaine = lundi du jour de marché */
export function jourMarche(t) {
  const p = partiesNY(t), s = new Date(Date.UTC(p.y, p.m - 1, p.d, p.h + 6, p.mi)), cle = s.toISOString().slice(0, 10), dow = s.getUTCDay();
  const lundi = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() - ((dow + 6) % 7))).toISOString().slice(0, 10);
  return { cle, semaine: lundi, dow, h: p.h, mi: p.mi, jourNY: p.jour };
}
/* fenêtres des killzones du jour de marché « cle » (UTC, ms) ; l'Asie 20h–00h NY appartient au jour de marché qui commence à 18:00 NY la veille */
export function fenetresKillzones(cle) {
  const [y, m, d] = cle.split('-').map(Number), veille = new Date(Date.UTC(y, m - 1, d - 1)), vy = veille.getUTCFullYear(), vm = veille.getUTCMonth() + 1, vd = veille.getUTCDate();
  return KILLZONES.map(k => {
    const asie = k.id === 'asie', Y = asie ? vy : y, M = asie ? vm : m, D = asie ? vd : d;
    return { id: k.id, nom: k.nom, debut: instantNY(Y, M, D, k.de[0], k.de[1]), fin: instantNY(Y, M, D, k.a[0], k.a[1]), jour: cle };
  });
}
export const ouvertures = cle => { const [y, m, d] = cle.split('-').map(Number); return { minuit: instantNY(y, m, d, 0, 0), huit30: instantNY(y, m, d, 8, 30) }; };

/* ── briques ── */
const corps = b => Math.abs(b.c - b.o), etendue = b => b.h - b.l;
export const estDeplacement = (b, a, R = P) => !!a && etendue(b) > 0 && corps(b) >= R.deplacementAtr * a && (etendue(b) - corps(b)) <= R.deplacementMeche * etendue(b);
const atrDe = (A, i) => A[i] || A[i - 1] || null;
const idx = (B, t) => { let lo = 0, hi = B.length; while (lo < hi) { const m = (lo + hi) >> 1; if (B[m].t < t) lo = m + 1; else hi = m; } return lo; };

/* ── FVG ── */
export function fvgListe(B, { periode = 3600e3, A = atrLocal(B, 14), R = P } = {}) {
  const out = [];
  for (let i = 1; i < B.length - 1; i++) {
    const f = i + 1, a = atrDe(A, f); if (!a) continue; const b0 = B[i - 1], b1 = B[i], b2 = B[f];
    let dir = 0, bas, haut;
    if (b0.h < b2.l) { dir = 1; bas = b0.h; haut = b2.l; } else if (b0.l > b2.h) { dir = -1; bas = b2.h; haut = b0.l; }
    if (!dir || haut - bas < R.fvgAtr * a || corps(b1) < R.fvgCorpsAtr * a) continue;
    const z = { id: `fvg|${dir}|${B[i].t}`, kind: 'fvg', dir, bas, haut, i: f, t: B[f].t, tCloture: B[f].t + periode, statut: 'non_rempli', tPartiel: null, tRempli: null, inverse: false, tInverse: null };
    let min = Infinity, max = -Infinity;
    for (let j = f + 1; j < B.length && j <= f + R.fvgPortee; j++) {
      const b = B[j];
      if (dir > 0) { min = Math.min(min, b.l); if (z.tPartiel == null && b.l <= haut) z.tPartiel = b.t; if (z.tRempli == null && b.l <= bas) { z.tRempli = b.t; z.statut = 'rempli'; } if (b.c < bas && z.tInverse == null) { z.inverse = true; z.tInverse = b.t; break; } }
      else { max = Math.max(max, b.h); if (z.tPartiel == null && b.h >= bas) z.tPartiel = b.t; if (z.tRempli == null && b.h >= haut) { z.tRempli = b.t; z.statut = 'rempli'; } if (b.c > haut && z.tInverse == null) { z.inverse = true; z.tInverse = b.t; break; } }
      if (z.tRempli != null && !z.inverse) { /* on continue seulement pour chercher l'inversion */ }
    }
    if (z.statut !== 'rempli' && z.tPartiel != null) z.statut = 'partiel';
    out.push(z);
  }
  return out;
}

/* ── ORDER BLOCKS et BREAKERS ── */
export function orderBlocks(B, { periode = 3600e3, A = atrLocal(B, 14), pv = pivotsK(B), R = P } = {}) {
  const out = [];
  for (let d = 8; d < B.length; d++) {
    const a = atrDe(A, d); if (!a || !estDeplacement(B[d], a, R)) continue; const dir = B[d].c > B[d].o ? 1 : -1;
    // dernier pivot confirmé avant d, du côté cassé (sommet pour un déplacement haussier)
    let piv = null; for (let k = pv.length - 1; k >= 0; k--) { const x = pv[k]; if (x.conf > d - 1) continue; if (x.i < d - 60) break; if (x.type === (dir > 0 ? 'H' : 'L')) { piv = x; break; } }
    if (!piv || !(dir > 0 ? B[d].c > piv.p : B[d].c < piv.p)) continue;
    let ob = -1; for (let k = d - 1; k >= Math.max(0, d - R.obRegard); k--) if (dir > 0 ? B[k].c < B[k].o : B[k].c > B[k].o) { ob = k; break; } if (ob < 0) continue;
    const z = { id: `ob|${dir}|${B[ob].t}`, kind: 'ob', dir, bas: B[ob].l, haut: B[ob].h, iOb: ob, tOb: B[ob].t, i: d, t: B[d].t, tCloture: B[d].t + periode, statut: 'actif', tTouche: null, tInval: null, breaker: null, niveauCasse: piv.p };
    for (let j = d + 1; j < B.length && j <= d + R.obPortee; j++) {
      const b = B[j];
      if (z.tTouche == null && (b.l <= z.haut && b.h >= z.bas)) z.tTouche = b.t;
      if (dir > 0 ? b.c < z.bas : b.c > z.haut) { z.statut = 'invalide'; z.tInval = b.t; z.breaker = { dir: -dir, bas: z.bas, haut: z.haut, tDebut: b.t, tCloture: b.t + periode, statut: 'actif', tInval: null };
        for (let q = j + 1; q < B.length && q <= j + R.obPortee; q++) if (dir > 0 ? B[q].c > z.haut : B[q].c < z.bas) { z.breaker.statut = 'invalide'; z.breaker.tInval = B[q].t; break; }
        break; }
    }
    out.push(z);
  }
  return out;
}

/* ── JOURS DE MARCHÉ ── */
export function jours(B) {
  const m = new Map(), L = [];
  B.forEach((b, i) => { const j = jourMarche(b.t); let g = m.get(j.cle); if (!g) { g = { cle: j.cle, semaine: j.semaine, dow: j.dow, i0: i, i1: i, o: b.o, h: b.h, l: b.l, c: b.c, n: 0 }; m.set(j.cle, g); L.push(g); } g.i1 = i; g.h = Math.max(g.h, b.h); g.l = Math.min(g.l, b.l); g.c = b.c; g.n++; });
  return L;
}
const dansFenetre = (B, f) => { const i0 = idx(B, f.debut), i1 = idx(B, f.fin); return i1 > i0 ? { i0, i1: i1 - 1 } : null; };   // barres dont l'ouverture est dans [debut, fin[
function etendueFenetre(B, f) { const w = dansFenetre(B, f); if (!w || w.i0 >= B.length || B[w.i0].t >= f.fin) return null; let h = -Infinity, l = Infinity, n = 0; for (let i = w.i0; i <= Math.min(w.i1, B.length - 1); i++) { h = Math.max(h, B[i].h); l = Math.min(l, B[i].l); n++; } return n ? { h, l, n, i0: w.i0, i1: Math.min(w.i1, B.length - 1), o: B[w.i0].o, c: B[Math.min(w.i1, B.length - 1)].c } : null; }

/* ── LIQUIDITÉ ── */
export function liquidites(B, J, { periode = 3600e3, A = atrLocal(B, 14), pv = pivotsK(B), R = P } = {}) {
  const out = [], n = B.length;
  const balaye = (cote, p, depuisT) => { for (let i = idx(B, depuisT); i < n; i++) if (cote === 'BSL' ? B[i].h > p : B[i].l < p) return B[i].t; return null; };
  const ajoute = (nom, cote, p, tForm, extra = {}) => { const tS = balaye(cote, p, tForm); out.push({ id: `liq|${nom}|${cote}|${tForm}`, kind: 'liquidite', nom, cote, p, tForm, tSweep: tS, statut: tS == null ? 'non_balayee' : 'balayee', ...extra }); };
  // veille / semaine précédente
  const sem = new Map(); for (const j of J) { let s = sem.get(j.semaine); if (!s) { s = { h: -Infinity, l: Infinity, i0: j.i0 }; sem.set(j.semaine, s); } s.h = Math.max(s.h, j.h); s.l = Math.min(s.l, j.l); s.i1 = j.i1; s.cle = j.semaine; }
  const sems = [...sem.values()];
  for (let k = 1; k < J.length; k++) { const p = J[k - 1], t = B[J[k].i0].t; ajoute('PDH', 'BSL', p.h, t, { jour: J[k].cle }); ajoute('PDL', 'SSL', p.l, t, { jour: J[k].cle }); }
  for (let k = 1; k < sems.length; k++) { const p = sems[k - 1], t = B[sems[k].i0].t; ajoute('PWH', 'BSL', p.h, t, { semaine: sems[k].cle }); ajoute('PWL', 'SSL', p.l, t, { semaine: sems[k].cle }); }
  // plages de sessions
  for (const j of J) for (const f of fenetresKillzones(j.cle).filter(f => ['asie', 'londres', 'ny_am'].includes(f.id))) { const e = etendueFenetre(B, f); if (!e || e.n < Math.round(((f.fin - f.debut) / periode) * 0.75)) continue; const nom = { asie: 'plage asiatique', londres: 'session de Londres', ny_am: 'session New York AM' }[f.id], t = B[Math.min(n - 1, e.i1)].t + periode;
    ajoute(`haut ${nom}`, 'BSL', e.h, t, { jour: j.cle, session: f.id }); ajoute(`bas ${nom}`, 'SSL', e.l, t, { jour: j.cle, session: f.id }); }
  // sommets / creux égaux : au moins 2 pivots à ≤ 0,2 ATR (le 2e confirmé fixe la date)
  for (const type of ['H', 'L']) { const L = pv.filter(x => x.type === type);
    for (let k = 1; k < L.length; k++) { const a = L[k - 1], b = L[k], at = atrDe(A, b.conf); if (!at || Math.abs(a.p - b.p) > R.egauxAtr * at || b.i - a.i < 3 || b.i - a.i > 120) continue;
      ajoute(type === 'H' ? 'sommets égaux' : 'creux égaux', type === 'H' ? 'BSL' : 'SSL', (a.p + b.p) / 2, B[b.conf].t + periode, { jour: jourMarche(B[b.i].t).cle, pivots: 2 }); } }
  return out;
}

/* ── AMD / Judas, jour par jour ── */
export function amdJours(B, J, { periode = 3600e3, A = atrLocal(B, 14), R = P } = {}) {
  const out = [];
  for (const j of J) {
    const F = Object.fromEntries(fenetresKillzones(j.cle).map(f => [f.id, f])), asie = etendueFenetre(B, F.asie), ldn = F.londres, ny = F.ny_am; if (!asie || asie.n < 3) continue;
    const e = { jour: j.cle, id: `amd|${j.cle}`, accumulation: { h: asie.h, l: asie.l, t0: F.asie.debut, t1: F.asie.fin }, manipulation: null, distribution: null, sens: null, statut: 'accumulation' };
    // première mèche au-delà de la plage asiatique pendant Londres (au moins 0,1 ATR)
    const w = dansFenetre(B, ldn); if (w) for (let i = w.i0; i <= Math.min(w.i1, B.length - 1); i++) { const a = atrDe(A, i) || 1, b = B[i];
      const haut = b.h > asie.h + R.ecartAtr * a, bas = b.l < asie.l - R.ecartAtr * a; if (!haut && !bas) continue;
      const cote = haut && bas ? (b.c > b.o ? 'bas' : 'haut') : haut ? 'haut' : 'bas';
      e.manipulation = { cote, i, t: b.t, tCloture: b.t + periode, extreme: cote === 'haut' ? b.h : b.l, depasse: cote === 'haut' ? b.h - asie.h : asie.l - b.l, clotureAu: cote === 'haut' ? b.c > asie.h : b.c < asie.l, ref: b.c, atr: a }; e.statut = 'manipulation'; break; }
    const dn = etendueFenetre(B, ny);
    if (dn && dn.n >= 2 && B[dn.i1].t + periode <= B[B.length - 1].t + periode && ny.fin <= B[B.length - 1].t + periode) { e.distribution = { o: dn.o, c: dn.c, mouvement: dn.c - dn.o, h: dn.h, l: dn.l, tCloture: ny.fin, i1: dn.i1 }; e.statut = 'distribution'; }
    if (e.manipulation && e.distribution) { const baisse = e.distribution.mouvement < 0; e.sens = (e.manipulation.cote === 'haut' && baisse) || (e.manipulation.cote === 'bas' && !baisse) ? 'judas' : 'continuation'; }
    out.push(e);
  }
  return out;
}

/* ── ÉCARTS D'OUVERTURE (jour et semaine) ── */
export function ecartsOuverture(B, { periode = 3600e3, A = atrLocal(B, 14), R = P } = {}) {
  const out = [];
  for (let i = 1; i < B.length; i++) {
    const trou = B[i].t - B[i - 1].t; if (trou <= periode) continue; const a = atrDe(A, i); if (!a) continue; const g = B[i].o - B[i - 1].c; if (Math.abs(g) < R.ecartAtr * a) continue;
    const sem = trou > 30 * 3600e3; out.push({ id: `ecart|${sem ? 'semaine' : 'jour'}|${B[i].t}`, kind: 'ecart', portee: sem ? 'semaine' : 'jour', dir: g > 0 ? 1 : -1, bas: Math.min(B[i].o, B[i - 1].c), haut: Math.max(B[i].o, B[i - 1].c), t: B[i].t, tCloture: B[i].t + periode, taille: Math.abs(g), i });
  }
  return out;
}

/* ── ANALYSE DE LA SEMAINE GLISSANTE ── */
export function analyser(B, { periode = 3600e3, R = P } = {}) {
  if (!B || B.length < 120) return null;
  const A = atrLocal(B, 14), pv = pivotsK(B), J = jours(B), a = atrDe(A, B.length - 1), prix = B[B.length - 1].c;
  const dernier = J[J.length - 1], jf = J.slice(-R.fenetreJours), iDebut = jf[0].i0, tDebut = B[iDebut].t;
  const semCourante = dernier.semaine, sems = [...new Set(J.map(j => j.semaine))], semPrec = sems[sems.indexOf(semCourante) - 1] || null, iRef = semPrec ? J.find(j => j.semaine === semPrec).i0 : iDebut;
  const garde = e => (e.tCloture ?? e.t) >= B[iRef].t;
  const fvg = fvgListe(B, { periode, A, R }).filter(garde), ob = orderBlocks(B, { periode, A, pv, R }).filter(garde);
  const liq = liquidites(B, J, { periode, A, pv, R }).filter(l => l.tForm >= B[iRef].t);
  const amd = amdJours(B, jf, { periode, A, R }), ecarts = ecartsOuverture(B, { periode, A, R }).filter(garde);
  // structure (réutilise structure-marche-v1) : MSS = changement de caractère, BOS = cassure de structure
  const S = SM.analyser(B, { K: SM.P.K, periode }), evS = S.events.filter(e => (e.tCloture ?? e.t) >= B[iRef].t);
  const mss = evS.filter(e => e.type === 'choch'), bos = evS.filter(e => e.type === 'bos'), depl = []; for (let i = iRef; i < B.length; i++) { const at = atrDe(A, i); if (estDeplacement(B[i], at, R)) depl.push({ id: `depl|${B[i].t}`, dir: B[i].c > B[i].o ? 1 : -1, i, t: B[i].t, tCloture: B[i].t + periode, taille: corps(B[i]) / at }); }
  // premium / discount sur la plage des 5 derniers jours
  let H5 = -Infinity, L5 = Infinity; for (let i = iDebut; i < B.length; i++) { H5 = Math.max(H5, B[i].h); L5 = Math.min(L5, B[i].l); }
  const dirS = S.etat.tendance, eq = (H5 + L5) / 2, r5 = H5 - L5, pd = { haut: H5, bas: L5, equilibre: eq, cote: prix > eq ? 'premium' : 'discount', position: r5 > 0 ? (prix - L5) / r5 : null, dir: dirS,
    ote: dirS > 0 ? { bas: H5 - P.oteHaut * r5, haut: H5 - P.oteBas * r5, sens: 'achat (retracement dans la zone discount)' } : dirS < 0 ? { bas: L5 + P.oteBas * r5, haut: L5 + P.oteHaut * r5, sens: 'vente (retracement dans la zone premium)' } : null };
  // temps : killzones des jours de la fenêtre, ouvertures et écarts
  const temps = { killzones: jf.flatMap(j => fenetresKillzones(j.cle)).filter(f => f.fin > tDebut), ouvertures: jf.map(j => { const o = ouvertures(j.cle), i0 = idx(B, o.minuit), i8 = idx(B, o.huit30 - (o.huit30 % periode)); return { jour: j.cle, minuit: o.minuit, huit30: o.huit30, prixMinuit: i0 < B.length && B[i0].t - o.minuit < periode ? B[i0].o : null, prixHuit30: i8 < B.length && o.huit30 - B[i8].t < periode ? (B[i8].t === o.huit30 ? B[i8].o : B[i8].o + (B[i8].c - B[i8].o) * 0.5) : null }; }) };
  // biais (lecture)
  const plage = nj => { const js = J.slice(-nj); let h = -Infinity, l = Infinity; for (let i = js[0].i0; i < B.length; i++) { h = Math.max(h, B[i].h); l = Math.min(l, B[i].l); } return { jours: js.length, h, l, position: h > l ? (prix - l) / (h - l) : null }; };
  const nonBal = liq.filter(l => l.statut === 'non_balayee'), proche = cote => nonBal.filter(l => l.cote === cote && (cote === 'BSL' ? l.p > prix : l.p < prix)).sort((x, y) => Math.abs(x.p - prix) - Math.abs(y.p - prix))[0] || null;
  const dernierBos = [...evS].filter(e => e.type === 'bos' || e.type === 'choch').sort((x, y) => (x.tCloture ?? 0) - (y.tCloture ?? 0)).pop() || null;
  const biais = { plages: R.plages.map(plage), cote: pd.cote, bsl: proche('BSL'), ssl: proche('SSL'), derniereCassure: dernierBos ? { type: dernierBos.type === 'choch' ? 'MSS' : 'BOS', dir: dernierBos.dir, t: dernierBos.tCloture ?? dernierBos.t, niveau: dernierBos.niveau } : null, tendance: dirS };
  return { version: VERSION, periode, a, prix, tDebut, tFin: B[B.length - 1].t + periode, jours: jf.map(j => j.cle), fvg, ob, liquidites: liq, amd, ecarts, mss, bos, deplacements: depl, pd, temps, biais, n: B.length };
}

/* ── objets à dessiner : au plus « max » (les plus proches du prix) ── */
export function objetsVisibles(an, { max = P.visibles, prix = an && an.prix } = {}) {
  if (!an) return [];
  const L = [], a = an.a || 1, tFin = an.tFin;
  for (const z of an.fvg) { if (z.tInverse != null || z.statut !== 'rempli') L.push({ id: z.id, kind: 'fvg', dir: z.dir, bas: z.bas, haut: z.haut, tDebut: z.tCloture, tFin: z.tRempli ?? z.tInverse ?? null, actif: z.statut !== 'rempli' && z.tInverse == null, statut: z.statut, nom: `FVG ${z.dir > 0 ? 'haussier' : 'baissier'}${z.statut === 'partiel' ? ' (partiel)' : ''}`, brut: z });
    if (z.inverse) L.push({ id: z.id + '|inv', kind: 'ifvg', dir: -z.dir, bas: z.bas, haut: z.haut, tDebut: z.tInverse + an.periode, tFin: null, actif: true, statut: 'inverse', nom: 'FVG inversé', brut: z }); }
  for (const z of an.ob) { L.push({ id: z.id, kind: 'ob', dir: z.dir, bas: z.bas, haut: z.haut, tDebut: z.tOb, tFin: z.tInval, actif: z.statut === 'actif', statut: z.statut, nom: `Order block ${z.dir > 0 ? 'haussier' : 'baissier'}`, brut: z });
    if (z.breaker) L.push({ id: z.id + '|brk', kind: 'breaker', dir: z.breaker.dir, bas: z.breaker.bas, haut: z.breaker.haut, tDebut: z.breaker.tCloture, tFin: z.breaker.tInval, actif: z.breaker.statut === 'actif', statut: z.breaker.statut, nom: `Breaker ${z.breaker.dir > 0 ? 'haussier' : 'baissier'}`, brut: z }); }
  for (const l of an.liquidites) L.push({ id: l.id, kind: 'liquidite', dir: l.cote === 'BSL' ? -1 : 1, p: l.p, bas: l.p, haut: l.p, tDebut: l.tForm, tFin: l.tSweep, actif: l.tSweep == null, statut: l.statut, nom: `${l.cote} · ${l.nom}`, brut: l });
  if (an.pd.ote) L.push({ id: 'ote', kind: 'ote', dir: an.pd.dir, bas: an.pd.ote.bas, haut: an.pd.ote.haut, tDebut: an.tDebut, tFin: null, actif: true, statut: 'actif', nom: 'Zone OTE (62 % – 79 %)', brut: an.pd });
  for (const e of an.ecarts) L.push({ id: e.id, kind: 'ecart', dir: e.dir, bas: e.bas, haut: e.haut, tDebut: e.tCloture, tFin: null, actif: true, statut: 'actif', nom: `Écart d'ouverture ${e.portee}`, brut: e });
  const dist = o => (prix >= o.bas && prix <= o.haut ? 0 : Math.min(Math.abs(prix - o.bas), Math.abs(prix - o.haut))), actifs = L.filter(o => o.actif).sort((x, y) => dist(x) - dist(y)), inactifs = L.filter(o => !o.actif).sort((x, y) => (y.tFin || 0) - (x.tFin || 0));
  return [...actifs.slice(0, max), ...inactifs.slice(0, Math.max(2, Math.floor(max / 2)))].map(o => ({ ...o, dist: dist(o), distAtr: dist(o) / a }));
}

/* ── RAPPORT DE LA SEMAINE (texte simple, valeurs réelles) ── */
const nb = (x, d = 0) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' '));
const pct = x => (x == null ? '—' : Math.round(x * 100) + ' %');
export function killzoneEnCours(maintenant) {
  const j = jourMarche(maintenant), fen = [...fenetresKillzones(j.cle), ...fenetresKillzones(new Date(Date.UTC(+j.cle.slice(0, 4), +j.cle.slice(5, 7) - 1, +j.cle.slice(8, 10) + 1)).toISOString().slice(0, 10))];
  const en = fen.filter(f => maintenant >= f.debut && maintenant < f.fin), suivantes = fen.filter(f => f.debut > maintenant).sort((x, y) => x.debut - y.debut);
  return { enCours: en, prochaine: suivantes[0] || null };
}
export function rapport(an, { maintenant = an ? an.tFin : Date.now() } = {}) {
  if (!an) return { titre: 'Rapport ICT de la semaine', lignes: ['Pas assez de bougies H1 pour analyser la semaine.'], texte: 'Pas assez de bougies H1 pour analyser la semaine.' };
  const o = objetsVisibles(an, { max: 8 }).filter(x => x.actif), kz = killzoneEnCours(maintenant), b = an.biais, L = [];
  L.push(`Fenêtre : ${an.jours.length} jours de marché (${an.jours[0]} → ${an.jours[an.jours.length - 1]}), ATR H1 ${nb(an.a, 1)} $, prix ${nb(an.prix, 2)}. Interprétation de l'ICT, définitions variables selon les sources.`);
  const bsl = b.bsl, ssl = b.ssl; L.push(`Liquidité non balayée la plus proche : ${bsl ? `au-dessus, ${bsl.nom} à ${nb(bsl.p, 2)} (${nb(bsl.p - an.prix, 1)} $, ${nb((bsl.p - an.prix) / an.a, 1)} ATR)` : 'rien au-dessus'} ; ${ssl ? `au-dessous, ${ssl.nom} à ${nb(ssl.p, 2)} (${nb(an.prix - ssl.p, 1)} $, ${nb((an.prix - ssl.p) / an.a, 1)} ATR)` : 'rien au-dessous'}.`);
  L.push(`Prix dans la plage de la semaine : ${pct(an.pd.position)} (${an.pd.cote}), équilibre ${nb(an.pd.equilibre, 2)} ; dans les plages de ${b.plages.map(p => `${p.jours} jours ${pct(p.position)}`).join(', ')}.`);
  if (an.pd.ote) L.push(`Zone OTE dans le sens de la dernière cassure : ${nb(an.pd.ote.bas, 2)} à ${nb(an.pd.ote.haut, 2)} (${an.pd.ote.sens}).`);
  L.push(b.derniereCassure ? `Dernière cassure de structure : ${b.derniereCassure.type} ${b.derniereCassure.dir > 0 ? 'haussier' : 'baissier'} le ${heureParis(b.derniereCassure.t)} (heure de Paris), niveau ${nb(b.derniereCassure.niveau, 2)}.` : 'Pas de cassure de structure récente.');
  const fv = an.fvg.filter(z => z.statut !== 'rempli' && z.tInverse == null); L.push(`FVG non remplis : ${fv.length}${fv.length ? ' (' + fv.slice(-3).map(z => `${z.dir > 0 ? 'haussier' : 'baissier'} ${nb(z.bas, 1)}–${nb(z.haut, 1)}`).join(' ; ') + ')' : ''}. Order blocks actifs : ${an.ob.filter(z => z.statut === 'actif').length}.`);
  const ad = an.amd.filter(e => e.manipulation).slice(-3); if (ad.length) L.push('Derniers jours (AMD) : ' + ad.map(e => `${e.jour} : plage asiatique ${nb(e.accumulation.l, 1)}–${nb(e.accumulation.h, 1)}, ${e.manipulation.cote === 'haut' ? 'mèche au-dessus' : 'mèche au-dessous'} à ${hhmmParis(e.manipulation.t)} (${nb(e.manipulation.depasse, 1)} $)${e.distribution ? `, New York AM ${e.distribution.mouvement >= 0 ? '+' : '−'}${nb(Math.abs(e.distribution.mouvement), 1)} $` : ''}${e.sens ? ' (' + (e.sens === 'judas' ? 'schéma Judas' : 'continuation') + ')' : ''}`).join(' ; ') + '.');
  L.push(`Killzone : ${kz.enCours.length ? 'en cours ' + kz.enCours.map(f => f.nom).join(' / ') + ' jusqu\'à ' + hhmmParis(kz.enCours[0].fin) + ' (heure de Paris)' : 'aucune en cours'}${kz.prochaine ? ` ; prochaine : ${kz.prochaine.nom} à ${hhmmParis(kz.prochaine.debut)} (heure de Paris)` : ''}.`);
  L.push(`Zones actives (les plus proches) : ${o.length ? o.slice(0, 6).map(x => `${x.nom} ${nb(x.bas, 1)}${x.haut !== x.bas ? '–' + nb(x.haut, 1) : ''} à ${nb(x.distAtr, 1)} ATR`).join(' ; ') : 'aucune'}.`);
  L.push('Ce rapport décrit la situation et les repères ; il ne prédit rien et n\'est jamais un ordre.');
  return { titre: 'Rapport ICT de la semaine', lignes: L, texte: L.join(' '), objets: o };
}
