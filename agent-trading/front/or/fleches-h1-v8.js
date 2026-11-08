/* ═════════════ FLÈCHES H1, VERSION 8 (pur, testé) ═════════════
   Règles FIGÉES « fleches-h1-v8 », écrites le 2026-11-08 AVANT le code et tout test, dans leur propre commit (la date de ce commit ouvre
   le bilan de v8). v8 = les flèches de fleches-h1-v2 telles quelles, filtrées par trois critères. Les seuils viennent de la consigne
   (8 touches, 120 bougies, 1 ATR, 24 bougies, 48 bougies, 2 % / 1 %) ou sont repris de v2 / v7 (0,25 ATR, bandes, plus hauts / bas
   majeurs). Aucun seuil réglé d'après ce qui a été vu sur les graphiques. v1 à v7 restent intactes et calculées en parallèle.
   Informations de lecture du graphique, jamais un ordre. */

export const REGLES_H1_V8 = Object.freeze({
  version: 'fleches-h1-v8', periode: 'H1', ecrites: '2026-11-08', base: 'fleches-h1-v2',
  // 1. gros niveau (bandes et plus hauts / bas majeurs de fleches-h1-v7)
  touchesMin: 8, toleranceAtr: 0.25,
  // 2. extrême de swing
  swingBougies: 120, swingAtr: 1,
  // 3. alternance et espacement
  espacementBougies: 24,
  // mesures (jamais utilisées comme filtre)
  excursionBougies: 48, gainPct: 2, pertePct: 1,
  // bilan (repris de v2)
  suiviBougies: 8, suiviAtr: 1, regroupementBougies: 8, hasard: 1000, minFleches: 30, decision: 100, fraisTaker: 0.0005
});

export const TEXTE_REGLES_H1_V8 = `Règles figées ${REGLES_H1_V8.version} (écrites le ${REGLES_H1_V8.ecrites}, avant le code et tout test, dans leur propre commit ; = les flèches de fleches-h1-v2 telles quelles, filtrées) :
- base : chaque flèche de fleches-h1-v2 (même déclencheur, règles A, B et C de v2, confirmation à la clôture, jamais redessinée), dans l'ordre du temps ; ATR = celui de la flèche v2 (moyenne simple des 14 étendues vraies à la bougie d'avant) ;
- 1. gros niveau : le prix de la flèche (son niveau déclencheur) est dans une bande d'au moins 8 touches (bandes de fleches-h1-v7 : calcul niveaux-periode-v1, fusion à moins de 1 ATR, niveaux retournés compris, connues avant la bougie) élargie de 0,25 ATR de chaque côté, ou à au plus 0,25 ATR d'un plus haut / plus bas de la semaine ou du mois précédents (heure de Paris) ;
- 2. extrême de swing : une flèche rouge n'est gardée que si la clôture de sa bougie est à moins de 1 ATR du plus haut des 120 dernières bougies H1 (elle comprise) ; une verte, à moins de 1 ATR du plus bas des 120 dernières bougies ;
- 3. alternance et espacement : la flèche gardée doit être de sens opposé à la dernière flèche v8 (verte puis rouge puis verte…) et au moins 24 bougies après elle ; sinon elle est écartée ;
- affichage : segment sur le niveau déclencheur, de sa dernière touche connue avant la flèche (bande : dernier pivot ; plus haut / bas majeur : début de la semaine ou du mois où il est devenu « précédent » ; 12 bougies avant la flèche à défaut) jusqu'à la flèche ; infobulle : régime, niveau, touches, distance de l'extrême au niveau, rang de swing (position de la clôture dans la plage des 120 dernières bougies, 0 % = plus bas, 100 % = plus haut) ;
- mesures, jamais utilisées comme filtre : excursion favorable maximale et excursion défavorable maximale dans les 48 bougies suivantes (depuis la clôture de la flèche), en ATR et en % ; flèche « +2 % avant −1 % » si, dans ces 48 bougies, le prix va d'au moins 2 % dans le sens de la flèche avant d'aller de 1 % contre elle (les deux dans la même bougie = contre) ; non mesurable tant que les 48 bougies ne sont pas closes ;
- bilan depuis la date du commit de ces règles, mêmes mesures que v2 (flèches indépendantes à 8 bougies, +1 ATR avant −1 ATR en 8 bougies, R net après frais preneur 0,05 % par côté et spread mesuré, 1000 tirages au hasard même régime et mêmes heures, « pas assez de données » sous 30) ; correction de Holm sur toutes les versions suivies (v1 à v8) ; aucune décision avant 100 flèches indépendantes nouvelles.`;

/* ───────────── calcul (ajouté après le commit des règles 529a682 ; aucune règle ci-dessus n'a changé) ───────────── */
import { closes, niveauxPeriode, fourchette, REGLES_NIVEAUX } from './niveaux-periode.js';
import { flechesH1v2, bilanH1, DEPUIS_H1_V2 } from './fleches-h1-v2.js';
import { listesDetail } from './fleches-h1-v4.js';
import { retournement } from './fleches-h1-v6.js';
import { majeursAvant, DEPUIS_7, NOMS_7 } from './fleches-h1-v7.js';
import { decalage } from './temps-or.js';
import { deuxProportions, holm } from './zones-or.js';
import { pluriel } from './texte-or.js';

/* date du commit des règles v8 (529a682, 2026-11-08 11:11:25 heure de Paris) : début du bilan de v8 */
export const DEPUIS_H1_V8 = Object.freeze({ commit: '529a682', t: 1794132685000, texte: '8 nov. 2026, 11 h 11' });
export const DEPUIS_8 = Object.freeze({ ...DEPUIS_7, 'fleches-h1-v8': DEPUIS_H1_V8 });
export const NOMS_8 = Object.freeze({ ...NOMS_7, 'fleches-h1-v8': 'v8' });
const H = 3600e3, FENETRE = 1600;

/* bandes d'au moins 8 touches connues avant la bougie i (même calcul que les bandes de v7), avec leur dernière touche */
function fusion(N, RN = REGLES_NIVEAUX) {
  const sp = RN.espacementAtr * N.a, pris = [];
  for (const b of N.toutes.slice().sort((x, y) => (y.extreme - x.extreme) || (y.importance - x.importance))) {
    const g = pris.find(q => b.bas - q.haut < sp && q.bas - b.haut < sp);
    if (g) { g.touches += b.touches; g.importance += b.importance; g.niveaux += b.niveaux; g.extreme = g.extreme || b.extreme; g.tDerniere = Math.max(g.tDerniere, b.tDerniere); continue; }
    pris.push({ ...b });
  }
  return pris;
}
export function bandesV8Avant(C, i, R = REGLES_H1_V8) {
  const Cs = C.slice(Math.max(0, i - FENETRE), i), ref = C[i - 1].c, N = niveauxPeriode(Cs, { periode: 'H1', maintenant: C[i].t, prix: ref });
  if (!N.a || !N.toutes) return [];
  return fusion(N).filter(q => q.touches >= R.touchesMin).map(q => { const type = q.p > ref ? 'résistance' : 'support', m = retournement(q, Cs, N.a, ref, { casseAtr: 0.5 });
    return { bas: q.bas, haut: q.haut, p: q.p, type, touches: q.touches, tDerniere: q.tDerniere, ...(m ? { retourne: m } : {}), libelle: `${type === 'support' ? 'Support' : 'Résistance'} ${fourchette(q.bas, q.haut)} · ${pluriel(q.touches, 'touche')}${m ? ' · ' + m : ''}` }; });
}
/* début du groupe (semaine ou mois, heure de Paris) de la bougie i − 1 : le plus haut / bas majeur est « précédent » depuis ce moment */
function debutGroupe(C, i, quoi) {
  const cle = t => { const d = new Date(t + decalage(t)); if (quoi === 'mois') return d.toISOString().slice(0, 7); const j = d.getUTCDay(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((j + 6) % 7))).toISOString().slice(0, 10); };
  const k = cle(C[i - 1].t); let j = i - 1; while (j > 0 && cle(C[j - 1].t) === k) j--; return C[j].t;
}

/* FLÈCHES H1 v8 : les flèches v2 (calculées, ou données par F2) filtrées par les critères 1, 2, 3. Strictement causal. */
export function flechesH1v8(B, { maintenant = Date.now(), volumes = null, R = REGLES_H1_V8, listes = listesDetail, bandes = bandesV8Avant, F2 = null, trace = null } = {}) {
  const C = closes(B, H, maintenant), n = C.length, out = [], T = trace;
  if (n < 60) return out;
  const base = (F2 || flechesH1v2(B, { maintenant, volumes, listes })).slice().sort((x, y) => x.i - y.i), MAJ = majeursAvant(C);
  for (const f0 of base) {
    const i = f0.i, b = C[i], a = f0.atr, tol = R.toleranceAtr * a, niv = f0.niveau;
    // 1. gros niveau
    const bd = bandes(C, i, R).filter(L => L.touches >= R.touchesMin && niv >= L.bas - tol && niv <= L.haut + tol).sort((x, y) => y.touches - x.touches)[0] || null;
    const mj = bd ? null : (MAJ[i] || []).filter(m => Math.abs(m.p - niv) <= tol).sort((x, y) => Math.abs(x.p - niv) - Math.abs(y.p - niv))[0] || null;
    if (!bd && !mj) { if (T) T({ i, t: b.t, etape: 'niveau', sens: f0.sens }); continue; }
    // 2. extrême de swing (120 dernières bougies, elle comprise)
    let hi = -Infinity, lo = Infinity; for (let k = Math.max(0, i - R.swingBougies + 1); k <= i; k++) { if (C[k].h > hi) hi = C[k].h; if (C[k].l < lo) lo = C[k].l; }
    const distSwing = f0.sens === 'baisse' ? (hi - b.c) / a : (b.c - lo) / a, rang = hi > lo ? (b.c - lo) / (hi - lo) : 0.5;
    if (!(distSwing < R.swingAtr)) { if (T) T({ i, t: b.t, etape: 'swing', sens: f0.sens, distSwing }); continue; }
    // 3. alternance et espacement
    const der = out[out.length - 1];
    if (der && (der.sens === f0.sens || i - der.i < R.espacementBougies)) { if (T) T({ i, t: b.t, etape: der.sens === f0.sens ? 'alternance' : 'espacement', sens: f0.sens }); continue; }
    const av = C[i - 1], ext = f0.sens === 'baisse' ? Math.min(Math.abs(b.h - niv), Math.abs(av.h - niv)) : Math.min(Math.abs(b.l - niv), Math.abs(av.l - niv));
    const gros = bd ? { source: 'bande', bas: bd.bas, haut: bd.haut, touches: bd.touches, retourne: bd.retourne || null, libelle: bd.libelle, t0: bd.tDerniere }
      : { source: 'majeur', p: mj.p, touches: null, libelle: `${mj.p > av.c ? 'Résistance' : 'Support'} ${fourchette(mj.p, mj.p)} · ${mj.quoi}`, t0: debutGroupe(C, i, /mois/.test(mj.quoi) ? 'mois' : 'semaine') };
    const f = { ...f0, version: R.version, base: 'fleches-h1-v2', gros, touches: gros.touches, libelle: gros.libelle, distance: ext / a, distSwing, rang, tTouche: b.t };
    out.push(f); if (T) T({ i, t: b.t, etape: 'gardee', sens: f.sens });
  }
  return out;
}
/* mesures jamais utilisées comme filtre : excursions sur 48 bougies, « +2 % avant −1 % » */
export function excursion(C, f, R = REGLES_H1_V8) {
  const i = f.i, n = C.length; if (i + R.excursionBougies >= n) return null;
  const e = C[i].c, d = f.sens === 'hausse' ? 1 : -1, a = f.atr; let fav = 0, adv = 0, deux = false, fini = false;
  for (let j = i + 1; j <= i + R.excursionBougies; j++) {
    const haut = (C[j].h - e) * d, bas = (C[j].l - e) * d, favJ = d > 0 ? haut : bas, advJ = d > 0 ? -bas : -haut;
    fav = Math.max(fav, favJ); adv = Math.max(adv, advJ);
    if (!fini) { const perte = advJ >= e * R.pertePct / 100, gain = favJ >= e * R.gainPct / 100; if (perte) fini = true; else if (gain) { deux = true; fini = true; } }
  }
  return { favAtr: fav / a, advAtr: adv / a, favPct: 100 * fav / e, advPct: 100 * adv / e, deuxAvantUn: deux };
}
export function resumeExcursions(C, F, R = REGLES_H1_V8) {
  const idx = new Map(C.map((b, k) => [b.t, k])), M = F.map(f => ({ ...f, i: idx.get(f.t) })).filter(f => f.i != null).map(f => excursion(C, f, R)).filter(Boolean);
  const med = L => { const s = L.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
  return { n: M.length, favAtr: med(M.map(m => m.favAtr)), advAtr: med(M.map(m => m.advAtr)), favPct: med(M.map(m => m.favPct)), advPct: med(M.map(m => m.advPct)), deux: M.filter(m => m.deuxAvantUn).length };
}
/* segments des flèches v8 : de la dernière touche connue du niveau (ou 12 bougies avant) jusqu'à la flèche */
export function segmentsV8(C, F) {
  const idx = new Map(C.map((b, k) => [b.t, k])), nb = (x, d = 2) => Number(x).toFixed(d).replace('.', ',');
  return F.filter(f => f.version === 'fleches-h1-v8').map(f => { const i = idx.get(f.t) ?? f.i, t0 = f.gros && f.gros.t0 && f.gros.t0 < f.t ? f.gros.t0 : C[Math.max(0, i - 12)].t;
    const ex = i != null ? excursion(C, { ...f, i }) : null;
    return { t0, t1: f.t, p: f.niveau, sens: f.sens, libelle: f.libelle, titre: `${f.libelle} · niveau déclencheur de la flèche v8 ${f.sens === 'baisse' ? 'rouge' : 'verte'}`,
      detail: [`régime H1 : ${f.regime}`, `niveau ${nb(f.niveau)} · ${f.gros.source === 'bande' ? pluriel(f.gros.touches, 'touche') : 'plus haut / plus bas majeur'}`, `distance de l'extrême au niveau : ${nb(f.distance)} ATR`,
        `rang de swing : ${Math.round(f.rang * 100)} % de la plage des 120 dernières bougies (à ${nb(f.distSwing)} ATR de l'extrême)`,
        ex ? `48 bougies suivantes : excursion favorable ${nb(ex.favAtr)} ATR (${nb(ex.favPct)} %), défavorable ${nb(ex.advAtr)} ATR (${nb(ex.advPct)} %), +2 % avant −1 % : ${ex.deuxAvantUn ? 'oui' : 'non'}` : '48 bougies suivantes pas encore closes', 'information de lecture, jamais un ordre'] }; });
}

/* bilans de toutes les versions suivies (v1 à v8) ; Holm sur toutes ; pour v8, résumé des excursions (mesure, pas un filtre) */
export function bilans8(B, parVersion, { maintenant = Date.now(), spread = null } = {}) {
  const vs = Object.keys(DEPUIS_8), out = {}, C = closes(B, H, maintenant);
  for (const v of vs) { if (!parVersion[v]) continue; const d = DEPUIS_8[v], b = bilanH1(B, parVersion[v], { maintenant, depuis: d.t, spread, version: v });
    out[v] = { ...b, commit: d.commit, depuisTexte: d.texte, texte: b.texte.replace(DEPUIS_H1_V2.texte, d.texte) }; }
  const ps = vs.map(v => { const b = out[v]; return b && b.assez && b.hasard ? deuxProportions(Math.round(b.reussite * b.mesurees), b.mesurees, Math.round(b.hasard.reussite * b.hasard.tirages), b.hasard.tirages) : null; });
  const adj = holm(ps), m = vs.filter(v => out[v]).length;
  vs.forEach((v, k) => { const b = out[v]; if (!b) return; b.p = ps[k]; b.pHolm = adj[k]; if (b.assez) b.texte = b.texte.replace(' Aucune décision avant', ` Écart au hasard : p corrigée (Holm, ${m} versions suivies) ${adj[k] == null ? '—' : adj[k].toFixed(3).replace('.', ',')}. Aucune décision avant`); });
  const b8 = out['fleches-h1-v8'];
  if (b8) { const Fd = parVersion['fleches-h1-v8'].filter(f => f.t >= DEPUIS_H1_V8.t), X = resumeExcursions(C, Fd), nb = x => x == null ? '—' : x.toFixed(2).replace('.', ',');
    b8.excursions = X; b8.texte += X.n ? ` Mesures (pas un filtre) sur ${X.n} flèche(s) aux 48 bougies closes : excursion favorable médiane ${nb(X.favAtr)} ATR (${nb(X.favPct)} %), défavorable ${nb(X.advAtr)} ATR (${nb(X.advPct)} %), +2 % avant −1 % : ${X.deux} sur ${X.n}.` : ' Mesures d’excursion (pas un filtre) : aucune flèche aux 48 bougies closes pour l’instant.'; }
  return out;
}
