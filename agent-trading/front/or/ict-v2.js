/* ═════════════ MOTEUR ICT MULTI-UNITÉS « ict-v2 » (pur, testé, scellé SHA-256) ═════════════
   INTERPRÉTATION de l'ICT d'après la formation de Justin (docs/connaissances/06-ict.md et 07-ict-unites.md). Rayle décrit et mesure ; jamais « achète » / « vends », jamais une promesse.
   ict-v1 reste intact (H1 seulement, statistiques mesurées dans ict-stats.json) : ses chiffres restent valables pour le H1 et ne sont jamais attribués à ict-v2.
   RÈGLE D'OR : chaque calcul se fait sur les bougies de L'UNITÉ demandée (M15, H1, H4 ou J), avec l'ATR(14) de cette unité. Aucune bougie d'une autre unité n'entre dans le calcul,
   sauf les repères de période explicitement nommés (PDH / PDL, PWH / PWL, ouverture de minuit), qui gardent leur nom et sont construits avec les bougies de la même unité.
   • Bougies : seules les bougies CLOSES comptent (une bougie dont l'ouverture + la durée dépasse « maintenant » est ignorée). Tout est posé à la clôture de la bougie qui rend l'élément connu.
   • Swings : STH / STL = bougie plus haute (plus basse) que ses deux voisines, confirmée à la clôture de la suivante. ITH = STH encadré par deux STH plus bas (ITL : symétrique) ; LTH / LTL : même logique sur les ITH / ITL.
   • Tendance de l'unité : dernière cassure EN CLÔTURE d'un ITH (haussière) ou d'un ITL (baissière) ; indécise sans cassure dans la fenêtre ou si les cassures s'alternent (range). La cassure d'un STH / STL n'est que du « bruit ».
     BOS = cassure dans le sens de la tendance précédente, MSS = cassure qui la renverse ; « déplacement » = bougie de corps ≥ 1,5 ATR et mèches ≤ 25 % de l'étendue (la bougie de cassure ou la précédente).
   • Liquidité : EQH / EQL = au moins deux STH (STL) à moins de 0,1 ATR, non balayés ; PDH / PDL (jour de marché qui commence à 18 h New York), PWH / PWL, extrêmes de l'Asie et de Londres (M15 et H1) ;
     sweep = mèche au-delà puis clôture de retour (même bougie ou la suivante) ; un niveau balayé n'est plus actif.
   • FVG : trou de trois bougies ≥ 0,3 ATR avec bougie centrale de corps ≥ 0,8 ATR ; non rempli → CE touché → rempli ; inversé (IFVG) sur clôture au-delà.
   • Order block (définition de la formation, PAS celle d'ict-v1) : candidate = dernière bougie contraire ; reversal candle = l'une des deux bougies suivantes CLÔTURE au-delà de son plus haut (plus bas) — une mèche seule ne compte pas ;
     il faut un FVG (écart ≥ 0,1 ATR) dont la bougie du milieu est la reversal candle ou la suivante, sinon pas d'order block. Drapeaux : liquidite, fort, stopsDerriere. Statuts : frais → testé → cassé → breaker.
   • Premium / discount : dealing range = dernier ITL ↔ dernier ITH de l'unité, équilibre 50 %, OTE 62–79 % ; en J : plages de 20, 40 et 60 jours.
   • Temps (M15 et H1 seulement) : killzones, Silver Bullet, ouverture de minuit par les fuseaux (fonctions d'ict-v1).
   • Biais du jour : méthode PDH / PDL sur la bougie journalière d'hier. Checklist : les dix conditions de 06-ict.md (true / false / null quand l'outil ne peut pas savoir). */
import { jourMarche, jours as joursV1, fenetresKillzones, killzoneEnCours, partiesNY, instantNY, hhmmParis } from './ict-v1.js';

export const VERSION = 'ict-v2';
export const UNITES = Object.freeze({ M15: { id: 'M15', ms: 15 * 60e3, nom: 'M15' }, H1: { id: 'H1', ms: 3600e3, nom: 'H1' }, H4: { id: 'H4', ms: 4 * 3600e3, nom: 'H4' }, J: { id: 'J', ms: 86400e3, nom: 'Daily' } });
export const ORDRE_HAUT_BAS = Object.freeze(['J', 'H4', 'H1', 'M15']);
export const P = Object.freeze({
  atr: 14, egauxAtr: 0.1, fvgAtr: 0.3, fvgCorpsAtr: 0.8, obFvgAtr: 0.1, deplacementAtr: 1.5, deplacementMeche: 0.25,
  stopsMin: 4, stopsRegard: 12, stopsBandeAtr: 0.75, fenetreTendance: 400, rangeBougies: 40, oteBas: 0.62, oteHaut: 0.79, plagesJours: [20, 40, 60],
  portee: 300, recent: Object.freeze({ M15: 32, H1: 24, H4: 12, J: 10 }), cibleFois: 2, affiche: Object.freeze({ zones: 2, eq: 2 }), maxObjets: 12
});
export const nomUnite = u => (UNITES[u] ? UNITES[u].nom : String(u));
export const normaliserUnite = u => { const s = String(u || '').toUpperCase().replace(/\s/g, ''); return s === 'D' || s === 'D1' || s === 'JOUR' || s === 'DAILY' || s === 'J' ? 'J' : UNITES[s] ? s : null; };

/* ── briques ── */
export function atrSerie(B, n = P.atr) {   // moyenne des vrais écarts sur n bougies, propre à l'unité
  const o = new Array(B.length).fill(null); let s = 0; const tr = i => Math.max(B[i].h - B[i].l, Math.abs(B[i].h - B[i - 1].c), Math.abs(B[i].l - B[i - 1].c));
  for (let i = 1; i < B.length; i++) { s += tr(i); if (i > n) s -= tr(i - n); if (i >= n) o[i] = s / n; }
  return o;
}
const corps = b => Math.abs(b.c - b.o), etendue = b => b.h - b.l;
export const estDeplacement = (b, a, R = P) => !!a && etendue(b) > 0 && corps(b) >= R.deplacementAtr * a && (etendue(b) - corps(b)) <= R.deplacementMeche * etendue(b);
const nbf = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' '));

/* ── swings ── */
export function swings(B) {
  const H = [], L = [];
  for (let i = 1; i < B.length - 1; i++) {
    if (B[i].h > B[i - 1].h && B[i].h > B[i + 1].h) H.push({ i, p: B[i].h, t: B[i].t, conf: i + 1 });
    if (B[i].l < B[i - 1].l && B[i].l < B[i + 1].l) L.push({ i, p: B[i].l, t: B[i].t, conf: i + 1 });
  }
  return { H, L };
}
/* niveau supérieur : un swing haut encadré par deux swings hauts plus bas (haut = true) ; un swing bas encadré par deux swings bas plus hauts (haut = false). Connu à la confirmation du swing suivant. */
export function encadres(S, haut) {
  const o = [];
  for (let k = 1; k < S.length - 1; k++) { const a = S[k - 1], x = S[k], b = S[k + 1]; if (haut ? x.p > a.p && x.p > b.p : x.p < a.p && x.p < b.p) o.push({ i: x.i, p: x.p, t: x.t, conf: b.conf }); }
  return o;
}
/* première clôture au-delà du niveau après l'indice « depuis » (haut : clôture au-dessus) */
const cassureCloture = (B, haut, p, depuis) => { for (let j = Math.max(1, depuis); j < B.length; j++) if (haut ? B[j].c > p : B[j].c < p) return j; return -1; };

/* ── structure et tendance ── */
export function structure(B, A, { R = P } = {}) {
  const S = swings(B), ITH = encadres(S.H, true), ITL = encadres(S.L, false), LTH = encadres(ITH, true), LTL = encadres(ITL, false);
  const evs = [];
  for (const [liste, haut, type] of [[ITH, true, 'ITH'], [ITL, false, 'ITL']]) for (const x of liste) {
    const j = cassureCloture(B, haut, x.p, x.i + 1); x.cassee = j >= 0; x.iCassure = j; if (j < 0) continue;
    const a = A[j] || A[j - 1] || null, dep = (estDeplacement(B[j], a, R) && (B[j].c > B[j].o) === haut) || (j > 0 && estDeplacement(B[j - 1], A[j - 1] || a, R) && (B[j - 1].c > B[j - 1].o) === haut);
    evs.push({ type, niveau: x.p, tNiveau: x.t, iNiveau: x.i, i: j, t: B[j].t, dir: haut ? 1 : -1, deplacement: !!dep });
  }
  evs.sort((a, b) => a.i - b.i || a.dir - b.dir);
  const fen = evs.filter(e => e.i >= B.length - R.fenetreTendance); let sens = 0;
  for (const e of evs) { e.nature = sens !== 0 && e.dir !== sens ? 'MSS' : 'BOS'; sens = e.dir; }
  // bruit : cassure d'un simple STH / STL (jamais un changement de tendance)
  const brutH = new Set(ITH.map(x => x.i)), brutL = new Set(ITL.map(x => x.i)), bruit = [];
  for (const [liste, haut, ens] of [[S.H, true, brutH], [S.L, false, brutL]]) for (const x of liste) { if (ens.has(x.i)) continue; const j = cassureCloture(B, haut, x.p, x.i + 1); if (j >= 0 && j >= B.length - 60) bruit.push({ type: haut ? 'STH' : 'STL', niveau: x.p, i: j, t: B[j].t, note: 'bruit' }); }
  bruit.sort((a, b) => a.i - b.i);
  const der = fen.length ? fen[fen.length - 1] : null; let tendance = 'indecise', pourquoi = 'aucune cassure d\'ITH ou d\'ITL dans la fenêtre';
  if (der) {
    const q = fen.slice(-3), range = q.length === 3 && q[0].dir !== q[1].dir && q[1].dir !== q[2].dir && q[2].i - q[0].i <= R.rangeBougies;
    if (range) { tendance = 'indecise'; pourquoi = 'les deux côtés ont été cassés à tour de rôle sur les dernières bougies (range)'; }
    else { tendance = der.dir > 0 ? 'haussiere' : 'baissiere'; pourquoi = `dernière cassure en clôture : ${der.type} à ${nbf(der.niveau)}`; }
  }
  const prix = B[B.length - 1].c, ith = [...ITH].reverse().find(x => !x.cassee) || null, itl = [...ITL].reverse().find(x => !x.cassee) || null;
  return { S, ITH, ITL, LTH, LTL, evenements: evs, bruit, tendance, pourquoi, sens: tendance === 'haussiere' ? 1 : tendance === 'baissiere' ? -1 : 0, derniereCassure: der, ithRef: ith, itlRef: itl, prix };
}

/* ── liquidité ── */
const balayage = (B, cote, p, depuis) => {   // première bougie qui dépasse le niveau par la mèche
  for (let j = Math.max(0, depuis); j < B.length; j++) if (cote === 'BSL' ? B[j].h > p : B[j].l < p) {
    const retour = x => x && (cote === 'BSL' ? x.c <= p : x.c >= p), ok = retour(B[j]) || retour(B[j + 1]);
    return { iSweep: j, tSweep: B[j].t, type: ok ? 'sweep' : (j >= B.length - 1 ? 'en_cours' : 'cassure') };
  }
  return null;
};
export function niveauxLiquidite(B, A, st, unite, { R = P } = {}) {
  const n = B.length, out = [], U = UNITES[unite], bas = Math.max(0, n - R.portee);
  const ajoute = (type, cote, p, iForm, extra = {}) => { const s = balayage(B, cote, p, iForm + 1); out.push({ id: `${type}|${B[iForm] ? B[iForm].t : 0}|${p}`, type, cote, p, iForm, tForm: B[iForm] ? B[iForm].t : null, iSweep: s ? s.iSweep : null, tSweep: s ? s.tSweep : null, balayee: !!s, typeBalayage: s ? s.type : null, ...extra }); };
  // swings simples (internes : servent au drapeau « liquidité » des order blocks, jamais affichés)
  for (const x of st.S.H) if (x.i >= bas) ajoute('STH', 'BSL', x.p, x.conf, { interne: true });
  for (const x of st.S.L) if (x.i >= bas) ajoute('STL', 'SSL', x.p, x.conf, { interne: true });
  // sommets / creux égaux : au moins deux swings à moins de 0,1 ATR, sans que le prix ait balayé le niveau entre les deux
  for (const [liste, haut] of [[st.S.H, true], [st.S.L, false]]) {
    for (let k = 1; k < liste.length; k++) {
      const b = liste[k]; if (b.i < bas) continue; const a0 = A[b.conf] || A[b.i] || null; if (!a0) continue;
      for (let m = k - 1; m >= 0 && b.i - liste[m].i <= 150; m--) {
        const a = liste[m]; if (b.i - a.i < 2 || Math.abs(a.p - b.p) > R.egauxAtr * a0) continue; const niv = haut ? Math.max(a.p, b.p) : Math.min(a.p, b.p);
        let libre = true; for (let j = a.i + 1; j < b.i; j++) if (haut ? B[j].h > niv : B[j].l < niv) { libre = false; break; } if (!libre) continue;
        ajoute(haut ? 'EQH' : 'EQL', haut ? 'BSL' : 'SSL', niv, b.conf, { pivots: 2, tPremier: a.t }); break;
      }
    }
  }
  // PDH / PDL (jour de marché), PWH / PWL (semaine) : construits avec les bougies de la même unité
  const J = joursV1(B); const sem = new Map(); for (const j of J) { let s = sem.get(j.semaine); if (!s) { s = { h: -Infinity, l: Infinity, i0: j.i0, cle: j.semaine }; sem.set(j.semaine, s); } s.h = Math.max(s.h, j.h); s.l = Math.min(s.l, j.l); }
  const S2 = [...sem.values()];
  for (let k = 1; k < J.length; k++) if (J[k].i0 >= bas) { ajoute('PDH', 'BSL', J[k - 1].h, Math.max(0, J[k].i0 - 1), { jour: J[k].cle }); ajoute('PDL', 'SSL', J[k - 1].l, Math.max(0, J[k].i0 - 1), { jour: J[k].cle }); }
  for (let k = 1; k < S2.length; k++) if (S2[k].i0 >= bas) { ajoute('PWH', 'BSL', S2[k - 1].h, Math.max(0, S2[k].i0 - 1), { semaine: S2[k].cle }); ajoute('PWL', 'SSL', S2[k - 1].l, Math.max(0, S2[k].i0 - 1), { semaine: S2[k].cle }); }
  // extrêmes de l'Asie et de Londres (M15 et H1 seulement) pour les derniers jours de marché
  if (unite === 'M15' || unite === 'H1') for (const j of J.slice(-3)) for (const f of fenetresKillzones(j.cle).filter(f => f.id === 'asie' || f.id === 'londres')) {
    let h = -Infinity, l = Infinity, i1 = -1, c = 0; for (let i = 0; i < n; i++) { if (B[i].t >= f.debut && B[i].t < f.fin) { h = Math.max(h, B[i].h); l = Math.min(l, B[i].l); i1 = i; c++; } }
    if (!c) continue; const fini = B[n - 1].t + U.ms >= f.fin, nom = f.id === 'asie' ? 'Asie' : 'Londres', est = f.id === 'asie' ? 'ASIE' : 'LDN';
    if (fini) { ajoute(est + '_H', 'BSL', h, i1, { session: nom, jour: j.cle, nom: `${nom} haut` }); ajoute(est + '_B', 'SSL', l, i1, { session: nom, jour: j.cle, nom: `${nom} bas` }); }
    else { for (const [t2, cote, p2] of [[est + '_H', 'BSL', h], [est + '_B', 'SSL', l]]) out.push({ id: `${t2}|${f.debut}|${p2}`, type: t2, cote, p: p2, iForm: i1, tForm: B[i1].t, iSweep: null, tSweep: null, balayee: false, typeBalayage: null, session: nom, jour: j.cle, nom: `${nom} ${cote === 'BSL' ? 'haut' : 'bas'}`, enCours: true }); }
  }
  return out;
}

/* ── FVG ── */
export function fvgListe(B, A, { R = P } = {}) {
  const out = [];
  for (let i = 1; i < B.length - 1; i++) {
    const f = i + 1, a = A[f] || A[f - 1]; if (!a) continue; const b0 = B[i - 1], b1 = B[i], b2 = B[f]; let dir = 0, bas, haut;
    if (b0.h < b2.l) { dir = 1; bas = b0.h; haut = b2.l; } else if (b0.l > b2.h) { dir = -1; bas = b2.h; haut = b0.l; }
    if (!dir || haut - bas < R.fvgAtr * a || corps(b1) < R.fvgCorpsAtr * a) continue;
    out.push(zoneFvg(B, dir, bas, haut, i, f, R));
  }
  return out;
}
function zoneFvg(B, dir, bas, haut, iMilieu, iFin, R = P) {
  const ce = (bas + haut) / 2, z = { id: `fvg|${dir}|${B[iMilieu].t}`, type: 'FVG', dir, bas, haut, ce, iMilieu, i: iFin, t: B[iFin].t, statut: 'non_rempli', tCe: null, tRempli: null, inverse: false, tInverse: null, ifvgActif: false };
  for (let j = iFin + 1; j < B.length && j <= iFin + R.portee; j++) {
    const b = B[j];
    if (dir > 0) { if (z.tCe == null && b.l <= ce) z.tCe = b.t; if (z.tRempli == null && b.l <= bas) z.tRempli = b.t; if (b.c < bas) { z.inverse = true; z.tInverse = b.t; z.iInverse = j; break; } }
    else { if (z.tCe == null && b.h >= ce) z.tCe = b.t; if (z.tRempli == null && b.h >= haut) z.tRempli = b.t; if (b.c > haut) { z.inverse = true; z.tInverse = b.t; z.iInverse = j; break; } }
  }
  z.statut = z.tRempli != null ? 'rempli' : z.tCe != null ? 'ce_touche' : 'non_rempli';
  if (z.inverse) { z.ifvgActif = true; for (let j = z.iInverse + 1; j < B.length; j++) if (dir > 0 ? B[j].c > haut : B[j].c < bas) { z.ifvgActif = false; break; } }
  return z;
}

/* ── order blocks (définition de la formation) ── */
export function orderBlocks(B, A, st, liq, { R = P } = {}) {
  const out = [], n = B.length;
  for (let c = 1; c < n - 1; c++) {
    for (const dir of [1, -1]) {
      const contraire = x => (dir > 0 ? x.c < x.o : x.c > x.o); if (!contraire(B[c])) continue;
      // reversal candle : l'une des deux bougies suivantes CLÔTURE au-delà de la candidate ; la candidate est la dernière bougie contraire avant elle
      let r = -1; for (let k = c + 1; k <= Math.min(n - 1, c + 2); k++) { if (dir > 0 ? B[k].c > B[c].h : B[k].c < B[c].l) { r = k; break; } if (contraire(B[k])) break; }
      if (r < 0) continue;
      // FVG dont la bougie du milieu est la reversal candle ou la suivante
      let fv = null; for (const mid of [r, r + 1]) { if (mid - 1 < 0 || mid + 1 >= n) continue; const a = A[mid + 1] || A[mid] || null; if (!a) continue; const b0 = B[mid - 1], b2 = B[mid + 1];
        if (dir > 0 && b0.h < b2.l && b2.l - b0.h >= R.obFvgAtr * a) { fv = { mid, bas: b0.h, haut: b2.l }; break; } if (dir < 0 && b0.l > b2.h && b0.l - b2.h >= R.obFvgAtr * a) { fv = { mid, bas: b2.h, haut: b0.l }; break; } }
      if (!fv) continue;
      const conf = fv.mid + 1, a = A[c] || A[c - 1] || A[conf] || null, bas = B[c].l, haut = B[c].h;
      // drapeaux
      const cote = dir > 0 ? 'SSL' : 'BSL', prise = liq.some(x => x.cote === cote && x.iSweep != null && (x.iSweep === c || x.iSweep === c - 1) && x.iForm < x.iSweep);
      let fort = false, casse = null; for (const x of (dir > 0 ? st.S.H : st.S.L)) { if (x.i >= c || x.i < c - 80) continue; if (dir > 0 ? x.p <= haut : x.p >= bas) continue; let deja = false; for (let j = x.i + 1; j < r; j++) if (dir > 0 ? B[j].c > x.p : B[j].c < x.p) { deja = true; break; } if (deja) continue;
        if ((dir > 0 ? B[r].c > x.p : B[r].c < x.p) || (r + 1 < n && (dir > 0 ? B[r + 1].c > x.p : B[r + 1].c < x.p))) { fort = true; casse = (dir > 0 ? st.ITH : st.ITL).some(y => y.i === x.i) ? (dir > 0 ? 'ITH' : 'ITL') : (dir > 0 ? 'STH' : 'STL'); break; } }
      let stops = false;   // consolidation d'au moins 4 bougies aux creux (sommets) intacts juste sous (au-dessus de) la zone, avant la candidate
      if (a) { const lo = dir > 0 ? bas - R.stopsBandeAtr * a : haut, hi = dir > 0 ? bas : haut + R.stopsBandeAtr * a; let run = 0, best = 0, extr = null;
        for (let k = c - 1; k >= Math.max(0, c - R.stopsRegard); k--) { const v = dir > 0 ? B[k].l : B[k].h; if (v >= lo && v <= hi) { run++; extr = extr == null ? v : (dir > 0 ? Math.min(extr, v) : Math.max(extr, v)); best = Math.max(best, run); } else { if (best >= R.stopsMin) break; run = 0; extr = null; } }
        if (best >= R.stopsMin && extr != null) { stops = true; for (let j = c + 1; j < n; j++) if (dir > 0 ? B[j].l < extr : B[j].h > extr) { stops = false; break; } } }
      const z = { id: `ob|${dir}|${B[c].t}`, type: 'OB', dir, bas, haut, meanThreshold: (bas + haut) / 2, iCandidate: c, tCandidate: B[c].t, iReversal: r, tReversal: B[r].t, fvg: { bas: fv.bas, haut: fv.haut, iMilieu: fv.mid }, i: conf, t: B[conf].t,
        liquidite: !!prise, fort, casse, stopsDerriere: stops, statut: 'frais', tTeste: null, tCasse: null, breaker: null };
      for (let j = conf + 1; j < n; j++) { const b = B[j];
        if (dir > 0 ? b.c < bas : b.c > haut) { z.statut = 'casse'; z.tCasse = b.t; let vivant = true, teste = null; for (let q = j + 1; q < n; q++) { if (dir > 0 ? B[q].c > haut : B[q].c < bas) { vivant = false; break; } if (teste == null && (dir > 0 ? B[q].h >= bas : B[q].l <= haut)) teste = B[q].t; }
          if (vivant) z.breaker = { id: z.id + '|brk', type: 'breaker', dir: -dir, bas, haut, i: j, t: b.t, statut: teste != null ? 'teste' : 'frais', tTeste: teste, avecLiquidite: !!prise }; break; }
        if (z.tTeste == null && (dir > 0 ? b.l <= haut : b.h >= bas)) { z.tTeste = b.t; z.statut = 'teste'; } }
      out.push(z);
    }
  }
  return out;
}

/* ── jours, biais du jour ── */
export function biaisDuJour(Jb, { maintenant = null, ms = 86400e3 } = {}) {
  // Jb : bougies journalières (de l'unité elle-même en J, regroupées par jour de marché sinon) ; la dernière est ignorée si elle n'est pas close
  const L = Jb.filter(b => maintenant == null || b.t + ms <= maintenant); if (L.length < 2) return { sens: null, cas: 'indisponible', raison: 'pas assez de jours complets' };
  const hier = L[L.length - 1], av = L[L.length - 2], pdh = av.h, pdl = av.l; let sens = null, cas, raison;
  if (hier.c > pdh) { sens = 'haussier'; cas = 'cloture_au_dessus_pdh'; raison = `hier a clôturé au-dessus du PDH (${nbf(pdh)})`; }
  else if (hier.c < pdl) { sens = 'baissier'; cas = 'cloture_sous_pdl'; raison = `hier a clôturé sous le PDL (${nbf(pdl)})`; }
  else if (hier.h > pdh && hier.l >= pdl) { sens = 'baissier'; cas = 'meche_au_dessus_pdh'; raison = `hier a dépassé le PDH (${nbf(pdh)}) par la mèche puis clôturé en dessous : cassure ratée`; }
  else if (hier.l < pdl && hier.h <= pdh) { sens = 'haussier'; cas = 'meche_sous_pdl'; raison = `hier a dépassé le PDL (${nbf(pdl)}) par la mèche puis clôturé au-dessus : cassure ratée`; }
  else if (hier.h > pdh && hier.l < pdl) { sens = null; cas = 'outside_day'; raison = 'hier a dépassé le PDH et le PDL sans clôturer au-delà : pas de biais clair'; }
  else { sens = null; cas = 'inside_day'; raison = 'hier est resté entre le PDH et le PDL (inside day) : pas de biais clair'; }
  return { sens, cas, raison, pdh, pdl, hier: { t: hier.t, h: hier.h, l: hier.l, c: hier.c } };
}
const joursDe = B => joursV1(B).map(g => ({ t: B[g.i0].t, o: g.o, h: g.h, l: g.l, c: g.c, cle: g.cle, i0: g.i0, i1: g.i1 }));

/* ── premium / discount ── */
export function premiumDiscount(B, st, unite, prix) {
  let ith = st.ITH.length ? st.ITH[st.ITH.length - 1] : null, itl = st.ITL.length ? st.ITL[st.ITL.length - 1] : null; let pd = null;
  /* dealing range recalculé après chaque BOS ou MSS : un extrême déjà cassé en clôture est remplacé par le plus haut (ou le plus bas) atteint depuis, le prix reste dans son range */
  if (ith && ith.cassee && Number.isInteger(ith.i)) { let h = -Infinity, t = ith.t; for (let k = ith.i; k < B.length; k++) if (B[k].h > h) { h = B[k].h; t = B[k].t; } if (h > ith.p) ith = { ...ith, p: h, t }; }
  if (itl && itl.cassee && Number.isInteger(itl.i)) { let l = Infinity, t = itl.t; for (let k = itl.i; k < B.length; k++) if (B[k].l < l) { l = B[k].l; t = B[k].t; } if (l < itl.p) itl = { ...itl, p: l, t }; }
  if (ith && itl && ith.p > itl.p) {
    const r = ith.p - itl.p, eq = (ith.p + itl.p) / 2, pos = (prix - itl.p) / r;
    pd = { haut: ith.p, bas: itl.p, equilibre: eq, position: pos, pct: Math.round(pos * 100), zone: prix > eq ? 'premium' : prix < eq ? 'discount' : 'equilibre', tDebut: Math.min(ith.t, itl.t),
      oteAchat: { bas: ith.p - P.oteHaut * r, haut: ith.p - P.oteBas * r }, oteVente: { bas: itl.p + P.oteBas * r, haut: itl.p + P.oteHaut * r }, ote: null };
    pd.ote = st.sens > 0 ? { ...pd.oteAchat, sens: 'achat' } : st.sens < 0 ? { ...pd.oteVente, sens: 'vente' } : null;
  }
  const plages = unite === 'J' ? P.plagesJours.filter(nj => B.length >= nj).map(nj => { const L = B.slice(-nj); let h = -Infinity, l = Infinity; for (const b of L) { h = Math.max(h, b.h); l = Math.min(l, b.l); } const pos = h > l ? (prix - l) / (h - l) : null; return { jours: nj, haut: h, bas: l, equilibre: (h + l) / 2, position: pos, pct: pos == null ? null : Math.round(pos * 100), zone: pos == null ? null : prix > (h + l) / 2 ? 'premium' : 'discount' }; }) : null;
  return { pd, plages };
}

/* ── analyse d'une unité ── */
export function analyser(Bbrut, { unite = 'H1', maintenant = null, prix = null, annonces = null, biais = false, R = P } = {}) {
  const u = normaliserUnite(unite); if (!u) return null; const U = UNITES[u];
  const B = (Bbrut || []).filter(b => b && Number.isFinite(b.o) && Number.isFinite(b.c) && (maintenant == null || b.t + U.ms <= maintenant));
  if (B.length < 40) return { version: VERSION, unite: u, nom: U.nom, ok: false, raison: `pas assez de bougies ${U.nom} closes (${B.length}, il en faut 40)`, n: B.length };
  const A = atrSerie(B, R.atr), n = B.length, a = A[n - 1] || A[n - 2] || null, px = Number.isFinite(prix) ? prix : B[n - 1].c;
  const st = structure(B, A, { R }), niv = niveauxLiquidite(B, A, st, u, { R }), fvg = fvgListe(B, A, { R }), ob = orderBlocks(B, A, st, niv, { R }), bas = Math.max(0, n - R.portee);
  const dist = o => (px >= o.bas && px <= o.haut ? 0 : Math.min(Math.abs(px - o.bas), Math.abs(px - o.haut)));
  // tableaux publics
  const jDernier = jourMarche(B[n - 1].t), Jb = joursDe(B), cleAuj = Jb[Jb.length - 1].cle, semAuj = jDernier.semaine;
  const liquidites = niv.filter(x => !x.interne && ((x.type === 'EQH' || x.type === 'EQL') ? x.iForm >= bas : x.type === 'PDH' || x.type === 'PDL' ? x.jour === cleAuj : x.type === 'PWH' || x.type === 'PWL' ? x.semaine === semAuj : x.jour === cleAuj))
    .map(x => ({ ...x, unite: u, distance: x.p - px, distanceAtr: a ? (x.p - px) / a : null }));
  const pdArrays = [];
  for (const z of fvg) { if (z.iMilieu < bas - 1) continue; const vivant = z.statut !== 'rempli' && !z.inverse; if (vivant) pdArrays.push({ ...z, unite: u, type: 'FVG', sens: z.dir > 0 ? 'haussier' : 'baissier', actif: true, creeEn: z.i });
    if (z.ifvgActif) pdArrays.push({ ...z, id: z.id + '|inv', unite: u, type: 'FVG', dir: -z.dir, sens: z.dir > 0 ? 'baissier' : 'haussier', inverse: true, statut: 'inverse', actif: true, creeEn: z.iInverse }); }
  for (const z of ob) { if (z.i < bas) continue; if (z.statut !== 'casse') pdArrays.push({ ...z, unite: u, sens: z.dir > 0 ? 'haussier' : 'baissier', actif: true, creeEn: z.i }); if (z.breaker) pdArrays.push({ ...z.breaker, unite: u, sens: z.breaker.dir > 0 ? 'haussier' : 'baissier', actif: true, creeEn: z.breaker.i, fort: false, liquidite: z.breaker.avecLiquidite }); }
  for (const z of pdArrays) { z.distance = dist(z); z.distanceAtr = a ? z.distance / a : null; z.dedans = z.distance === 0; }
  const { pd, plages } = premiumDiscount(B, st, u, px);
  // temps (M15 et H1 seulement)
  let temps = null;
  if (u === 'M15' || u === 'H1') {
    const kz = killzoneEnCours(maintenant == null ? B[n - 1].t + U.ms : maintenant), en = kz.enCours, sb = en.find(f => /^sb_/.test(f.id)) || null, princ = en.filter(f => !/^sb_/.test(f.id));
    const ny = partiesNY(B[n - 1].t), mn = instantNY(ny.y, ny.m, ny.d, 0, 0), im = B.findIndex(b => b.t === mn);
    temps = { killzone: princ.length ? { id: princ[0].id, nom: princ[0].nom, finParis: hhmmParis(princ[0].fin) } : null, silverBullet: sb ? { nom: sb.nom, finParis: hhmmParis(sb.fin) } : null, prochaine: kz.prochaine ? { id: kz.prochaine.id, nom: kz.prochaine.nom, debutParis: hhmmParis(kz.prochaine.debut) } : null, minuit: im >= 0 ? { prix: B[im].o, t: mn } : null, tradable: en.some(f => f.id !== 'asie') };
  }
  // biais du jour
  const bj = u === 'J' ? biaisDuJour(Jb.map(g => ({ t: g.t, h: g.h, l: g.l, c: g.c })), { maintenant, ms: U.ms }) : biaisDuJour(Jb.slice(0, -1).map(g => ({ t: g.t, h: g.h, l: g.l, c: g.c })), { maintenant: null });
  const an = { version: VERSION, unite: u, nom: U.nom, ok: true, n, atr: a, prix: px, tFin: B[n - 1].t + U.ms, bougies: B, A,
    tendance: { sens: st.tendance, pourquoi: st.pourquoi, ith: st.ithRef ? { p: st.ithRef.p, t: st.ithRef.t } : null, itl: st.itlRef ? { p: st.itlRef.p, t: st.itlRef.t } : null, derniereCassure: st.derniereCassure ? { type: st.derniereCassure.nature, niveau: st.derniereCassure.type, prix: st.derniereCassure.niveau, t: st.derniereCassure.t, dir: st.derniereCassure.dir, deplacement: st.derniereCassure.deplacement, i: st.derniereCassure.i } : null, bruit: st.bruit.slice(-3) },
    structure: { ITH: st.ITH, ITL: st.ITL, LTH: st.LTH, LTL: st.LTL, evenements: st.evenements, swings: st.S }, liquidites, niveaux: niv, fvg, ob, pdArrays, premiumDiscount: pd, plages, temps, biaisDuJour: (u === 'J' || biais) ? bj : null, _biais: bj };
  an.checklist = checklist(an, annonces, maintenant, R); an.penche = penche(an, R);
  return an;
}

/* ── ce qui penche, checklist ── */
function sensDe(an) {
  const t = an.tendance.sens === 'haussiere' ? 1 : an.tendance.sens === 'baissiere' ? -1 : 0, rec = P.recent[an.unite], d = an.tendance.derniereCassure;
  const mss = d && d.type === 'MSS' && an.bougies.length - 1 - d.i <= rec ? d.dir : 0, b = an._biais && an._biais.sens ? (an._biais.sens === 'haussier' ? 1 : -1) : 0;
  const pd = an.premiumDiscount ? (an.premiumDiscount.zone === 'discount' ? 0.5 : an.premiumDiscount.zone === 'premium' ? -0.5 : 0) : 0;
  const score = 2 * t + mss + b + pd; return { score, sens: score >= 2 ? 1 : score <= -2 ? -1 : 0, t, mss, b, pd };
}
export function checklist(an, annonces, maintenant, R = P) {
  const S = sensDe(an), sens = S.sens, B = an.bougies, n = B.length, rec = R.recent[an.unite], u = an.unite, nom = 'conditions';
  const pdDeSens = an.pdArrays.filter(z => (z.dir > 0 ? 1 : -1) === sens), d = an.tendance.derniereCassure;
  const prise = sens === 0 ? null : an.niveaux.some(x => x.cote === (sens > 0 ? 'SSL' : 'BSL') && x.iSweep != null && x.iSweep >= n - rec && x.iForm < x.iSweep && (x.typeBalayage === 'sweep'));
  const mss = sens === 0 ? null : !!(d && d.type === 'MSS' && d.dir === sens && d.deplacement && d.i >= n - rec);
  const pdOk = sens === 0 ? null : (mss ? pdDeSens.some(z => z.creeEn >= d.i - 3 && z.creeEn <= d.i + 3) : false);
  const pdz = an.premiumDiscount; const zone = sens === 0 || !pdz ? null : sens > 0 ? pdz.zone === 'discount' : pdz.zone === 'premium';
  const inv = invalidation(an, sens), cible = sens === 0 || !inv ? null : (() => { const c = an.liquidites.filter(x => x.cote === (sens > 0 ? 'BSL' : 'SSL') && !x.balayee && (sens > 0 ? x.p > an.prix : x.p < an.prix)).sort((x, y) => Math.abs(x.p - an.prix) - Math.abs(y.p - an.prix))[0]; if (!c) return false; return Math.abs(c.p - an.prix) >= R.cibleFois * Math.abs(an.prix - inv.prix); })();
  const kzRelevant = u === 'M15' || u === 'H1';
  const ann = Array.isArray(annonces) && maintenant != null ? !annonces.some(t => t >= maintenant && t - maintenant <= 3600e3) : null;
  const b = an._biais;
  const L = [
    { condition: 'Biais du jour noté', ok: b && b.cas !== 'indisponible' ? !!b.sens : null, obligatoire: true },
    { condition: 'Pas d\'annonce majeure imminente', ok: ann, obligatoire: true },
    { condition: 'Dans une killzone', ok: kzRelevant ? (an.temps ? !!an.temps.tradable : null) : null, obligatoire: kzRelevant },
    { condition: 'Liquidité prise contre le biais', ok: prise, obligatoire: true },
    { condition: 'MSS avec déplacement', ok: mss, obligatoire: true },
    { condition: 'PD array créé par ce déplacement', ok: pdOk, obligatoire: true },
    { condition: sens < 0 ? 'Premium pour une vente' : 'Discount pour un achat', ok: zone, obligatoire: true },
    { condition: 'Invalidation logique au-delà de la manipulation', ok: sens === 0 ? null : !!inv, obligatoire: true },
    { condition: 'Cible de liquidité nettement plus loin que l\'invalidation', ok: cible, obligatoire: true },
    { condition: 'SMT (bonus)', ok: null, obligatoire: false }
  ];
  void nom; return L;
}
function invalidation(an, sens) {
  if (!sens) return null; const n = an.bougies.length, rec = P.recent[an.unite], B = an.bougies; let p = null, quoi = null;
  const sw = an.niveaux.filter(x => x.cote === (sens > 0 ? 'SSL' : 'BSL') && x.iSweep != null && x.iSweep >= n - rec && x.iForm < x.iSweep).sort((x, y) => y.iSweep - x.iSweep)[0];
  if (sw) { p = sens > 0 ? B[sw.iSweep].l : B[sw.iSweep].h; quoi = 'extrême de la prise de liquidité'; }
  const zs = an.pdArrays.filter(z => (z.dir > 0 ? 1 : -1) === sens && !z.inverse).sort((x, y) => x.distance - y.distance)[0];
  if (p == null && zs) { p = sens > 0 ? zs.bas : zs.haut; quoi = `${zs.type === 'OB' ? 'order block' : zs.type === 'breaker' ? 'breaker' : 'FVG'} ${an.nom} ${zs.sens}`; }
  if (p == null) { const r = sens > 0 ? an.tendance.itl : an.tendance.ith; if (r) { p = r.p; quoi = sens > 0 ? 'ITL de référence' : 'ITH de référence'; } }
  return p == null ? null : { prix: p, quoi };
}
export function penche(an, R = P) {
  const S = sensDe(an), sens = S.sens, R2 = [], u = an.nom;
  const t = an.tendance.sens, d = an.tendance.derniereCassure;
  R2.push(t === 'indecise' ? `structure ${u} indécise (${an.tendance.pourquoi})` : `structure ${u} ${t === 'haussiere' ? 'haussière' : 'baissière'} (${an.tendance.pourquoi})`);
  if (d && d.type === 'MSS' && S.mss) R2.push(`MSS ${d.dir > 0 ? 'haussier' : 'baissier'}${d.deplacement ? ' avec déplacement' : ' sans déplacement'}`);
  if (an._biais && an._biais.sens) R2.push(`biais du jour ${an._biais.sens} (${an._biais.raison})`);
  if (an.premiumDiscount) R2.push(`prix en ${an.premiumDiscount.zone} du dealing range ${u} (${an.premiumDiscount.pct} %)`);
  const cl = an.checklist, manque = cl.filter(x => x.obligatoire && x.ok === false).map(x => x.condition), inconnu = cl.filter(x => x.obligatoire && x.ok === null).map(x => x.condition);
  const inv = invalidation(an, sens);
  return { sens: sens > 0 ? 'achat' : sens < 0 ? 'vente' : 'neutre', score: S.score, raisons: R2, manque, inconnu, complete: sens !== 0 && manque.length === 0, invalidation: inv };
}

/* ═════════════ objets à afficher, selon l'unité (sobre : une douzaine au plus) ═════════════ */
const plusProchesParCote = (L, px, k, cle = z => z.bas) => { const h = L.filter(z => cle(z) >= px).sort((a, b) => cle(a) - cle(b)).slice(0, k), b = L.filter(z => cle(z) < px).sort((a, b) => cle(b) - cle(a)).slice(0, k); return [...h, ...b]; };
export function modeleAffichage(an, { max = P.maxObjets, couches = null } = {}) {
  if (!an || !an.ok) return { badge: null, objets: [], killzones: [], legende: [] };
  const u = an.unite, px = an.prix, a = an.atr || 1, on = k => !couches || couches[k] !== false, O = [], tf = an.nom;
  const t = an.tendance, badge = { sens: t.sens, unite: tf, texte: `Tendance ${tf} : ${t.sens === 'haussiere' ? 'haussière' : t.sens === 'baissiere' ? 'baissière' : 'indécise'}${t.sens === 'haussiere' && t.itl ? ` · ITL ${nbf(t.itl.p, 0)} tient` : t.sens === 'baissiere' && t.ith ? ` · ITH ${nbf(t.ith.p, 0)} tient` : ''}${u === 'J' && an.biaisDuJour && an.biaisDuJour.sens ? ` · biais du jour ${an.biaisDuJour.sens}` : ''}` };
  if (on('ictStructure') && (u === 'H4' || u === 'J')) { for (const [L, nom] of [[an.structure.ITH, 'ITH'], [an.structure.ITL, 'ITL']]) { const x = [...L].reverse().find(y => !y.cassee); if (x) O.push({ id: `${nom}|${x.t}`, kind: 'swing', famille: 'structure', nom: `${nom} ${tf}`, p: x.p, tDebut: x.t, dir: nom === 'ITH' ? -1 : 1 }); }
    if (u === 'J') for (const [L, nom] of [[an.structure.LTH, 'LTH'], [an.structure.LTL, 'LTL']]) { const x = L[L.length - 1]; if (x) O.push({ id: `${nom}|${x.t}`, kind: 'swing', famille: 'structure', nom: `${nom} ${tf}`, p: x.p, tDebut: x.t, dir: nom === 'LTH' ? -1 : 1 }); } }
  if (on('ictLiquidite')) {
    const lq = an.liquidites.filter(x => !x.balayee);
    for (const x of plusProchesParCote(lq.filter(y => y.type === 'EQH' || y.type === 'EQL'), px, P.affiche.eq, y => y.p)) O.push({ id: x.id, kind: 'liquidite', famille: 'liquidite', nom: `${x.type}${u === 'M15' || u === 'H1' ? '' : ' ' + tf}`, p: x.p, tDebut: x.tPremier || x.tForm, dir: x.cote === 'BSL' ? -1 : 1 });
    const types = u === 'J' ? ['PWH', 'PWL'] : u === 'H4' ? ['PWH', 'PWL', 'PDH', 'PDL'] : ['PDH', 'PDL', 'ASIE_H', 'ASIE_B', 'LDN_H', 'LDN_B'];
    for (const x of lq.filter(y => types.includes(y.type))) O.push({ id: x.id, kind: 'liquidite', famille: 'repere', nom: x.nom || x.type, p: x.p, tDebut: x.tForm, dir: x.cote === 'BSL' ? -1 : 1 });
  }
  if (on('ictFvg')) {
    const Z = an.pdArrays.filter(z => z.actif && (u !== 'J' ? true : z.type === 'FVG'));
    for (const z of plusProchesParCote(Z.filter(z => z.type === 'FVG'), px, P.affiche.zones)) O.push({ id: z.id, kind: z.inverse ? 'ifvg' : 'fvg', famille: 'zone', nom: `FVG ${tf}${z.inverse ? ' inversé' : ''}`, bas: z.bas, haut: z.haut, ce: z.ce, tDebut: z.t, dir: z.dir });
    if (u !== 'J') for (const z of plusProchesParCote(Z.filter(z => z.type === 'OB' || z.type === 'breaker'), px, P.affiche.zones)) O.push({ id: z.id, kind: z.type === 'OB' ? 'ob' : 'breaker', famille: 'zone', nom: z.type === 'OB' ? `OB ${z.fort ? 'fort ' : ''}${tf}` : `Breaker ${tf}`, bas: z.bas, haut: z.haut, tDebut: z.t, dir: z.dir, fort: !!z.fort, liquidite: !!z.liquidite, stopsDerriere: !!z.stopsDerriere });
  }
  if (on('ictPd')) { if (u === 'J') { const p20 = an.plages && an.plages.find(x => x.jours === 20); if (p20) O.push({ id: 'eq20', kind: 'equilibre', famille: 'pd', nom: 'Équilibre 20 j', p: p20.equilibre, tDebut: an.bougies[Math.max(0, an.bougies.length - 20)].t }); } else if (an.premiumDiscount) O.push({ id: 'eq', kind: 'equilibre', famille: 'pd', nom: `Équilibre ${tf}`, p: an.premiumDiscount.equilibre, tDebut: an.premiumDiscount.tDebut, haut: an.premiumDiscount.haut, bas: an.premiumDiscount.bas }); }
  if (on('ictTemps') && (u === 'M15' || u === 'H1') && an.temps && an.temps.minuit) O.push({ id: 'minuit', kind: 'ouverture', famille: 'temps', nom: 'Minuit NY', p: an.temps.minuit.prix, tDebut: an.temps.minuit.t });
  // priorité : repères et zones les plus proches du prix d'abord, au plus « max »
  const d = o => (o.p != null ? Math.abs(o.p - px) : (px >= o.bas && px <= o.haut ? 0 : Math.min(Math.abs(px - o.bas), Math.abs(px - o.haut)))), obj = O.sort((x, y) => d(x) - d(y)).slice(0, max).map(o => ({ ...o, distanceAtr: d(o) / a }));
  return { badge, objets: obj, killzones: (u === 'M15' || u === 'H1') && on('ictTemps') ? killzonesDuJour(an) : [], legende: LEGENDE };
}
const LEGENDE = Object.freeze([['liquidite', 'Liquidité (EQH, EQL, PDH, PDL, sessions)'], ['zone', 'FVG, order blocks, breakers (plein = fort, contour = simple)'], ['pd', 'Équilibre du dealing range (gris pointillé)']]);
function killzonesDuJour(an) {
  const B = an.bougies, j = jourMarche(B[B.length - 1].t); return fenetresKillzones(j.cle).filter(f => f.id !== 'asie' && !/^sb_/.test(f.id) && f.fin > B[Math.max(0, B.length - 200)].t).map(f => ({ id: f.id, nom: f.nom, debut: f.debut, fin: f.fin }));
}

/* ═════════════ compléments pour l'affichage complet (ict-v2.1, fonctions pures) ═════════════ */
/* liquidité interne / externe : externe = extrémités du dealing range de l'unité (dernier ITH / ITL) et tout ce qui est au-delà (LTH / LTL, PWH / PWL) ; interne = tout ce qui est à l'intérieur */
export function porteeLiquidite(an, niveau) {
  const pd = an.premiumDiscount, t = niveau.type;
  if (t === 'PWH' || t === 'PWL' || t === 'LTH' || t === 'LTL') return 'externe';
  if (!pd) return 'interne';
  return niveau.p >= pd.haut - 1e-9 || niveau.p <= pd.bas + 1e-9 ? 'externe' : 'interne';
}
/* consolidations : au moins « min » bougies consécutives dont l'étendue totale reste sous « atr » ATR */
export function consolidations(B, A, { min = 8, atr = 1.2, depuis = 0 } = {}) {
  const out = []; let i = Math.max(0, depuis);
  while (i < B.length - min) {
    const a = A[i + min - 1] || A[i] || null; if (!a) { i++; continue; }
    let h = -Infinity, l = Infinity, j = i;
    for (; j < B.length; j++) { const h2 = Math.max(h, B[j].h), l2 = Math.min(l, B[j].l); if (h2 - l2 > atr * a) break; h = h2; l = l2; }
    if (j - i >= min) { out.push({ i0: i, i1: j - 1, t0: B[i].t, t1: B[j - 1].t, haut: h, bas: l, n: j - i }); i = j; } else i++;
  }
  return out;
}
/* BOS / MSS avec leur segment (instant du swing cassé → instant de la cassure) */
export function listeCassures(an, { depuis = 0 } = {}) {
  return an.structure.evenements.filter(e => e.i >= depuis).map(e => ({ nature: e.nature, dir: e.dir, type: e.type, niveau: e.niveau, tNiveau: e.tNiveau, t: e.t, i: e.i, deplacement: e.deplacement }));
}
/* HH / HL / LH / LL : chaque swing comparé au précédent swing du même côté */
export function etiquettesSwings(an, { depuis = 0, max = 8 } = {}) {
  const out = [], S = an.structure.swings;
  for (const [L, haut] of [[S.H, true], [S.L, false]]) for (let k = 1; k < L.length; k++) { const x = L[k], a = L[k - 1]; if (x.i < depuis) continue; out.push({ nom: haut ? (x.p > a.p ? 'HH' : 'LH') : (x.p > a.p ? 'HL' : 'LL'), p: x.p, t: x.t, i: x.i, haut }); }
  return out.sort((x, y) => x.i - y.i).slice(-max);
}
const recouvre = (a, b) => { const bas = Math.max(a.bas, b.bas), haut = Math.min(a.haut, b.haut); return haut > bas ? { bas, haut } : null; };
/* Unicorn = FVG qui chevauche un breaker du même sens ; BPR = FVG haussier et FVG baissier qui se chevauchent */
export function unicornBpr(an) {
  const fvg = an.pdArrays.filter(z => z.type === 'FVG' && !z.inverse), brk = an.pdArrays.filter(z => z.type === 'breaker'), U = [], B2 = [];
  for (const f of fvg) for (const b of brk) { if ((f.dir > 0) !== (b.dir > 0)) continue; const r = recouvre(f, b); if (r) U.push({ ...r, dir: f.dir, t: Math.max(f.t, b.t), refs: [f.id, b.id] }); }
  const h = fvg.filter(z => z.dir > 0), s = fvg.filter(z => z.dir < 0);
  for (const a of h) for (const b of s) { const r = recouvre(a, b); if (r) B2.push({ ...r, t: Math.max(a.t, b.t), refs: [a.id, b.id] }); }
  return { unicorn: U, bpr: B2 };
}
/* écarts d'ouverture non comblés : NWOG (après le week-end) et NDOG (nouveau jour de marché), H4 et Jour */
export function gapsOuverture(B, A, unite, { depuis = 0, R = P } = {}) {
  if (unite !== 'H4' && unite !== 'J') return [];
  const out = [];
  for (let i = Math.max(1, depuis); i < B.length; i++) {
    const a = A[i] || A[i - 1] || null; if (!a) continue; const g = B[i].o - B[i - 1].c; if (Math.abs(g) < 0.1 * a) continue;
    const semaine = B[i].t - B[i - 1].t > 36 * 3600e3, nouveauJour = jourMarche(B[i].t).cle !== jourMarche(B[i - 1].t).cle; if (!semaine && !nouveauJour) continue;
    const bas = Math.min(B[i].o, B[i - 1].c), haut = Math.max(B[i].o, B[i - 1].c); let comble = false;
    for (let j = i; j < B.length; j++) if (B[j].l <= bas && B[j].h >= haut) { comble = true; break; }
    if (!comble) out.push({ type: semaine ? 'NWOG' : 'NDOG', bas, haut, t: B[i].t, i, dir: g > 0 ? 1 : -1 });
  }
  void R; return out;
}
/* projections −1 et −2 de la jambe du dernier MSS (1 et 2 fois la jambe au-delà du swing cassé) */
export function projections(an) {
  const e = [...an.structure.evenements].reverse().find(x => x.nature === 'MSS'); if (!e) return null; const B = an.bougies;
  let ext = e.dir > 0 ? Infinity : -Infinity; for (let k = e.iNiveau; k <= e.i; k++) ext = e.dir > 0 ? Math.min(ext, B[k].l) : Math.max(ext, B[k].h);
  const jambe = Math.abs(e.niveau - ext); if (!(jambe > 0)) return null;
  return { dir: e.dir, depart: ext, fin: e.niveau, jambe, p1: e.niveau + e.dir * jambe, p2: e.niveau + e.dir * 2 * jambe, t: e.t };
}
/* Fibonacci du dealing range : 0 au sommet pour une lecture haussière (retracement vers le bas), 0 au creux pour une lecture baissière */
export const NIVEAUX_FIB = Object.freeze([0, 0.5, 0.618, 0.705, 0.786, 1]);
export function fibonacci(an) {
  const pd = an.premiumDiscount; if (!pd) return null; const bas = an.tendance.sens === 'baissiere', r = pd.haut - pd.bas;
  return { haut: pd.haut, bas: pd.bas, sens: bas ? 'baissier' : 'haussier', tDebut: pd.tDebut, niveaux: NIVEAUX_FIB.map(k => ({ k, p: bas ? pd.bas + k * r : pd.haut - k * r })) };
}
