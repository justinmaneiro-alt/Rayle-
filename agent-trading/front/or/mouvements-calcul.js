/* ═════════════ COUCHE « MOUVEMENTS H1 » : fiche, statistiques et export (pur, testé) ═════════════
   Rétrospectif : ces mouvements sont repérés après coup. Ils ne prédisent pas le suivant. Aucun signal, aucun ordre.
   La détection est dans mouvements-v1.js (définition figée) ; ici, seulement la description de chaque mouvement déjà détecté. */
import { detecter, fermees } from './mouvements-v1.js';
const H = 3600e3, J = 24 * H, H4 = 4 * H;
export const AVERTISSEMENT = 'Rétrospectif : ces mouvements sont repérés après coup. Ils ne prédisent pas le suivant.';
const NB = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const fmtParis = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour12: false });
export function parisDe(t) {
  const o = {}; for (const p of fmtParis.formatToParts(new Date(t))) o[p.type] = p.value;
  const heure = +o.hour % 24; return { heure, minute: +o.minute, jour: o.weekday, date: `${o.day}/${o.month}/${o.year}`, texte: `${o.weekday} ${o.day}/${o.month}/${o.year} ${String(heure).padStart(2, '0')}:${o.minute} (heure de Paris)` };
}
export const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const borne = (arr, f) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (f(arr[m])) lo = m + 1; else hi = m; } return lo; };
const agreger = (B, pas) => { const o = []; let g = null; for (const b of B) { const t = Math.floor(b.t / pas) * pas; if (!g || g.t !== t) { if (g) o.push(g); g = { t, o: b.o, h: b.h, l: b.l, c: b.c }; } else { if (b.h > g.h) g.h = b.h; if (b.l < g.l) g.l = b.l; g.c = b.c; } } if (g) o.push(g); return o; };
/* contexte de description : pivots H4 (5 bougies de chaque côté, connus à la clôture de la 5e suivante) et SMA200 Jour (jours UTC complets) */
export function preparer(B) {
  const H4b = agreger(B, H4), piv = [], K = 5;
  for (let i = K; i + K < H4b.length; i++) {
    let s = true, c = true;
    for (let d = 1; d <= K && (s || c); d++) { if (!(H4b[i].h > H4b[i - d].h && H4b[i].h > H4b[i + d].h)) s = false; if (!(H4b[i].l < H4b[i - d].l && H4b[i].l < H4b[i + d].l)) c = false; }
    const tConf = H4b[i + K].t + H4; if (s) piv.push({ t: H4b[i].t, p: H4b[i].h, sorte: 'sommet', tConf }); if (c) piv.push({ t: H4b[i].t, p: H4b[i].l, sorte: 'creux', tConf });
  }
  piv.sort((a, b) => a.tConf - b.tConf);
  const Jb = agreger(B, J), fins = Jb.map(b => b.t + J), sma = new Array(Jb.length).fill(null); let s = 0;
  for (let i = 0; i < Jb.length; i++) { s += Jb[i].c; if (i >= 200) s -= Jb[i - 200].c; if (i >= 199) sma[i] = s / 200; }
  return { piv, fins, sma };
}
/* description d'un mouvement (B = bougies utilisées pour la détection, mêmes indices) ; ne regarde que ce qui précède la bougie de départ */
export function decrire(m, B, ctx) {
  const d = m.d, p = parisDe(m.t0), debut = m.depart, tCoupe = B[m.i0].t;
  const n = borne(ctx.piv, x => x.tConf <= tCoupe), lim = tCoupe - 365 * J; let niv = null;
  for (let q = n - 1; q >= 0; q--) { const v = ctx.piv[q]; if (v.t < lim) continue; if (!niv || Math.abs(v.p - debut) < Math.abs(niv.p - debut)) niv = v; }
  const k = borne(ctx.fins, x => x <= tCoupe) - 1, sma = k >= 0 ? ctx.sma[k] : null;
  let extreme = d > 0 ? Infinity : -Infinity; for (let q = Math.max(0, m.i0 - 48); q < m.i0; q++) extreme = d > 0 ? Math.min(extreme, B[q].l) : Math.max(extreme, B[q].h);
  const balaye = m.i0 >= 1 && (d > 0 ? debut < extreme : debut > extreme);
  return { ...m, dateUTC: new Date(m.t0).toISOString(), dureeH: m.bougies, heureParis: p.heure, jourParis: p.jour, parisTexte: p.texte, ampleurUSD: m.gain,
    niveau: niv ? { prix: niv.p, sorte: niv.sorte === 'creux' ? 'creux H4' : 'sommet H4', distance: Math.abs(debut - niv.p), date: new Date(niv.t).toISOString().slice(0, 10) } : null,
    sma200J: sma, distanceSma200J: sma == null ? null : debut - sma, balayage: balaye ? (d > 0 ? 'plus bas des 48 dernières heures' : 'plus haut des 48 dernières heures') : null };
}
export function calculer(B, { seuilAtr, maintenant = Infinity } = {}) {
  const C = fermees(B, maintenant), r = detecter(C, { seuilAtr, maintenant }), ctx = preparer(C);
  const moves = r.moves.map(m => decrire(m, C, ctx));
  return { moves, n: r.n, seuilAtr: r.seuilAtr, stats: statistiques(moves, C), debut: C.length ? C[0].t : null, fin: C.length ? C[C.length - 1].t + H : null };
}
const mediane = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export function statistiques(moves, C) {
  const n = moves.length, semaines = C.length > 1 ? (C[C.length - 1].t + H - C[0].t) / (7 * J) : 0, usd = moves.map(m => m.gain), atr = moves.map(m => m.gainAtr), moy = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const parHeure = new Array(24).fill(0), parJour = Object.fromEntries(JOURS.map(j => [j, 0]));
  for (const m of moves) { const h = m.heureParis ?? parisDe(m.t0).heure, j = m.jourParis ?? parisDe(m.t0).jour; parHeure[h]++; if (j in parJour) parJour[j]++; }
  return { n, hausse: moves.filter(m => m.d > 0).length, baisse: moves.filter(m => m.d < 0).length, enCours: moves.filter(m => m.enCours).length, semaines, parSemaine: semaines ? n / semaines : null,
    ampleurMoyUSD: moy(usd), ampleurMedUSD: mediane(usd), ampleurMoyAtr: moy(atr), ampleurMedAtr: mediane(atr), parHeure, parJour, dureeMoy: moy(moves.map(m => m.bougies)) };
}
/* texte court d'étiquette : « +38 $ · 5 bougies » */
export const etiquette = m => `${m.d > 0 ? '+' : '−'}${NB.format(Math.abs(m.gain))} $ · ${m.bougies} bougies${m.enCours ? ' · en cours' : ''}`;
/* lignes de la fiche (clic sur un mouvement) */
export function fiche(m) {
  const usd = x => `${NB.format(Math.abs(x))} $`, dec = (x, d = 1) => Number(x).toFixed(d).replace('.', ',');
  const L = [`${m.d > 0 ? 'Mouvement haussier' : 'Mouvement baissier'}${m.enCours ? ' · EN COURS (peut encore changer)' : ''}`,
    `Départ : ${m.parisTexte}`, `Durée : ${m.bougies} bougies H1 (${m.bougies} h)${m.contraires ? ' dont 1 bougie contraire' : ''}`, `Ampleur : ${usd(m.gain)} · ${dec(m.gainAtr)} ATR (ATR H1 ${dec(m.atr, 2)} $ au départ)`];
  L.push(m.niveau ? `Niveau structurel le plus proche du départ : ${m.niveau.sorte} à ${NB.format(m.niveau.prix)} $ (${usd(m.niveau.distance)} du départ, formé le ${m.niveau.date})` : 'Niveau structurel le plus proche du départ : aucun repéré');
  L.push(m.sma200J == null ? 'SMA 200 Jour : indisponible (historique trop court)' : `SMA 200 Jour : ${NB.format(m.sma200J)} $ · le départ est ${m.distanceSma200J >= 0 ? 'au-dessus' : 'en dessous'} de ${usd(m.distanceSma200J)}`);
  L.push(m.balayage ? `Le départ a balayé le ${m.balayage}` : 'Le départ n’a balayé aucun extrême récent (48 h)', AVERTISSEMENT);
  return L;
}
/* export */
const COL = ['dateUTC', 'heureParis', 'jourParis', 'sens', 'bougies', 'depart', 'fin', 'ampleurUSD', 'ampleurATR', 'atrDepart', 'contraires', 'enCours', 'niveauPrix', 'niveauDistance', 'sma200Jour', 'distanceSma200Jour', 'balayage'];
export const ligneExport = m => ({ dateUTC: m.dateUTC, heureParis: m.heureParis, jourParis: m.jourParis, sens: m.sens, bougies: m.bougies, depart: +m.depart.toFixed(2), fin: +m.fin.toFixed(2), ampleurUSD: +m.gain.toFixed(2), ampleurATR: +m.gainAtr.toFixed(3), atrDepart: +m.atr.toFixed(3), contraires: m.contraires, enCours: !!m.enCours,
  niveauPrix: m.niveau ? +m.niveau.prix.toFixed(2) : null, niveauDistance: m.niveau ? +m.niveau.distance.toFixed(2) : null, sma200Jour: m.sma200J == null ? null : +m.sma200J.toFixed(2), distanceSma200Jour: m.distanceSma200J == null ? null : +m.distanceSma200J.toFixed(2), balayage: m.balayage || null });
export const versJSON = (moves, meta = {}) => JSON.stringify({ ...meta, avertissement: AVERTISSEMENT, mouvements: moves.map(ligneExport) }, null, 1);
export const versCSV = moves => [COL.join(';'), ...moves.map(m => { const l = ligneExport(m); return COL.map(c => { const v = l[c]; return v == null ? '' : typeof v === 'string' && /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v).replace('.', ','); }).join(';'); })].join('\n') + '\n';
