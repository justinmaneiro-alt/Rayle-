/* ═════════════ SUPPORTS, RÉSISTANCES, LIQUIDITÉ ET FLÈCHES DE REBOND DE LA PÉRIODE AFFICHÉE (pur, testé) ═════════════
   Règles FIGÉES « niveaux-periode-v1 » et « fleches-v1 » (écrites le 2026-11-07, avant toute mesure ; recopiées dans le rapport local).
   Tout est calculé sur les bougies CLOSES de la période affichée (prix Kraken ; avant le perpétuel : référence Binance décalée).
   Ce sont des informations de lecture du graphique, jamais un ordre. */
import { PERIODES } from './config-or.js';
import { atr, mediane } from './bougies-or.js';
import { decalage } from './temps-or.js';
import { alea } from './zones-or.js';
import { pluriel } from './texte-or.js';

export const REGLES_NIVEAUX = Object.freeze({
  version: 'niveaux-periode-v1',
  fenetreJours: Object.freeze({ M5: 5, M15: 5, H1: 30, H4: 182, J: 730 }),   // pivots cherchés sur cette durée (Jour : 2 ans ou tout l'historique)
  pivotK: Object.freeze({ M5: 5, M15: 4, H1: 3, H4: 3, J: 2 }),              // sommet : plus haut strict des k bougies avant et des k après (creux : symétrique)
  taille: Object.freeze({ M5: 1, M15: 2, H1: 3, H4: 4, J: 5 }),              // poids de la période dans l'importance
  regroupementAtr: 0.5,   // pivots à moins de 0,5 ATR de la période → un niveau
  espacementAtr: 1,       // niveaux à moins de 1 ATR → une seule bande
  parCote: 4, forts: 2,   // au plus 4 au-dessus et 4 au-dessous du prix ; les 2 plus forts de chaque côté bien visibles
  vue: 150,               // plus haut et plus bas des 150 dernières bougies (la vue par défaut) : toujours gardés, comme ceux de la fenêtre
  egauxAtr: 0.2,          // sommets égaux / creux égaux : pivots à moins de 0,2 ATR
  liquiditeParCote: 2
});
export const REGLES_FLECHES = Object.freeze({
  version: 'fleches-v1',
  toucheAtr: 0.15,        // le prix touche le niveau : extrême de la bougie (ou de la précédente) à moins de 0,15 ATR du niveau
  ecartAtr: 0.15,         // la bougie de confirmation CLÔTURE à au moins 0,15 ATR du niveau, du côté d'où vient le prix
  meche: 0.5,             // mèche de rejet ≥ la moitié de la bougie
  volumeMedianeN: 20,     // volume ≥ médiane des 20 bougies précédentes
  attenteMin: 60,         // 60 minutes avant une autre flèche sur le même niveau (même sens, à moins de 0,5 ATR)
  suiviBougies: 8, suiviAtr: 1, hasard: 1000, minFleches: 30
});
export const TEXTE_REGLES_FLECHES = `Règles figées ${REGLES_NIVEAUX.version} et ${REGLES_FLECHES.version} (2026-11-07, avant toute mesure) :
- pivots : sommet = plus haut strict des k bougies de chaque côté (k = 5 en M5, 4 en M15, 3 en H1 et H4, 2 en Jour), creux symétrique ; cherchés sur 5 jours (M5, M15), 30 jours (H1), 6 mois (H4), 2 ans ou tout l'historique (Jour) ;
- niveau = pivots à moins de 0,5 ATR (14) de la période affichée ; importance = touches × récence (1 → 0,5 sur la fenêtre) × taille de la période ;
- niveaux à moins de 1 ATR → une bande ; au plus 4 au-dessus et 4 au-dessous du prix ; plus haut et plus bas de la fenêtre et des 150 dernières bougies toujours gardés ;
- liquidité : sommets égaux / creux égaux (pivots à moins de 0,2 ATR), plus haut et plus bas de la veille, de la semaine et du mois précédents, tant qu'ils ne sont pas balayés (dépassés par une bougie) ;
- flèche (ATR = moyenne simple des 14 dernières étendues vraies) : le prix touche un niveau ou une zone de liquidité (à moins de 0,15 ATR), puis une bougie de la période CLÔTURE à au moins 0,15 ATR du niveau avec une mèche de rejet ≥ la moitié de la bougie et un volume ≥ la médiane des 20 précédentes ; flèche posée sur cette bougie, à sa clôture, avec les seuls niveaux connus AVANT elle (jamais redessinée) ; 60 minutes avant une autre flèche sur le même niveau ;
- bilan : part des flèches suivies d'un mouvement d'au moins 1 ATR dans leur sens dans les 8 bougies, contre 1000 flèches tirées au hasard aux mêmes heures ; « pas assez de données » sous 30 flèches.`;

const nb = (p, d = 0) => Number(p).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ');
export const fourchette = (lo, hi) => nb(lo) === nb(hi) ? nb((lo + hi) / 2) : `${nb(lo)}–${nb(hi)}`;

/* heure de Paris rapide (décalage mis en cache par heure) : jour, semaine (lundi), mois, jour de la semaine, heure */
const cacheDec = new Map();
function paris(t) {
  const h = Math.floor(t / 3600e3); let d = cacheDec.get(h); if (d == null) { d = decalage(t); if (cacheDec.size > 50000) cacheDec.clear(); cacheDec.set(h, d); }
  const x = new Date(t + d), j = x.getUTCDay(), jour = x.toISOString().slice(0, 10);
  const l = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate() - ((j + 6) % 7)));
  return { jour, semaine: l.toISOString().slice(0, 10), mois: jour.slice(0, 7), j, h: x.getUTCHours(), m: x.getUTCMinutes() };
}
export const closes = (B, P, maintenant) => B.filter(b => b.t + P <= maintenant);

/* pivots confirmés (sommets / creux) d'indices [i0, i1], confirmés au plus tard à l'indice « jusqua » (il faut k bougies après) */
export function pivots(B, k, i0, i1, jusqua = B.length - 1) {
  const o = [];
  for (let i = Math.max(i0, k); i <= Math.min(i1, jusqua - k); i++) {
    let s = true, c = true;
    for (let d = 1; d <= k && (s || c); d++) { if (!(B[i].h > B[i - d].h && B[i].h > B[i + d].h)) s = false; if (!(B[i].l < B[i - d].l && B[i].l < B[i + d].l)) c = false; }
    if (s) o.push({ i, t: B[i].t, p: B[i].h, sorte: 'sommet' });
    if (c) o.push({ i, t: B[i].t, p: B[i].l, sorte: 'creux' });
  }
  return o;
}
/* regroupe des éléments {lo, hi} triés quand l'écart entre voisins est < tol, sans dépasser la largeur « max » (pas d'étirement en chaîne) */
function chainer(L, tol, max = Infinity) {
  const s = L.slice().sort((a, b) => a.lo - b.lo), G = [];
  for (const x of s) { const g = G[G.length - 1]; if (g && x.lo - g.hi < tol && x.hi - g.lo <= max) { g.items.push(x); g.hi = Math.max(g.hi, x.hi); } else G.push({ lo: x.lo, hi: x.hi, items: [x] }); }
  return G;
}

/* niveaux (bandes) de la période affichée */
export function niveauxPeriode(B, { periode, maintenant = Date.now(), prix = null, R = REGLES_NIVEAUX } = {}) {
  const P = PERIODES[periode].ms, C = closes(B, P, maintenant), n = C.length;
  if (n < 30) return { a: null, bandes: [], pivots: [], n };
  const A = atr(C, 14), a = A[n - 1]; if (!a) return { a: null, bandes: [], pivots: [], n };
  const fen = R.fenetreJours[periode] * 86400e3, tDebut = C[n - 1].t + P - fen;
  let i0 = 0; while (i0 < n - 1 && C[i0].t < tDebut) i0++;
  const pv = pivots(C, R.pivotK[periode], i0, n - 1);
  // plus haut et plus bas de la fenêtre et des 150 dernières bougies (même au bord, sans confirmation) : toujours gardés
  const extr = [];
  for (const d of [i0, Math.max(i0, n - R.vue)]) {
    let ih = d, il = d; for (let i = d; i < n; i++) { if (C[i].h > C[ih].h) ih = i; if (C[i].l < C[il].l) il = i; }
    extr.push({ i: ih, t: C[ih].t, p: C[ih].h, sorte: 'sommet', extreme: true }, { i: il, t: C[il].t, p: C[il].l, sorte: 'creux', extreme: true });
  }
  for (const e of extr) { const x = pv.find(q => q.i === e.i && q.sorte === e.sorte); if (x) x.extreme = true; else pv.push({ ...e, ajoute: true }); }
  const ref = prix ?? C[n - 1].c, tFin = C[n - 1].t;
  const niveaux = chainer(pv.map(x => ({ ...x, lo: x.p, hi: x.p })), R.regroupementAtr * a, R.espacementAtr * a).map(g => {
    const tD = Math.max(...g.items.map(x => x.t)), rec = 1 - 0.5 * Math.min(1, (tFin - tD) / fen);
    return { lo: g.lo, hi: g.hi, touches: g.items.length, tDerniere: tD, extreme: g.items.some(x => x.extreme), importance: g.items.length * rec * R.taille[periode], pivots: g.items };
  });
  // bandes SANS chaîne : du niveau le plus important au moins important (extrêmes d'abord), un niveau à moins de 1 ATR du centre d'une bande
  // déjà formée s'y fond (sa largeur reste ≤ 2 ATR) ; sinon il ouvre une nouvelle bande. Deux bandes affichées sont donc espacées d'au moins 1 ATR.
  const ordre = niveaux.slice().sort((x, y) => (y.extreme - x.extreme) || (y.importance - x.importance)), groupes = [];
  for (const v of ordre) {
    const c = (v.lo + v.hi) / 2, g = groupes.find(g => Math.abs(c - g.c) < R.espacementAtr * a);
    if (g) g.items.push(v); else groupes.push({ c, items: [v] });
  }
  const bandes = groupes.map(g => {
    const it = g.items, cs = it.map(x => (x.lo + x.hi) / 2), lo = it.length > 1 ? Math.min(...cs) : it[0].lo, hi = it.length > 1 ? Math.max(...cs) : it[0].hi;   // bande bornée aux centres des niveaux fondus (≤ 2 ATR)
    return { bas: lo, haut: hi, p: (lo + hi) / 2, touches: it.reduce((s, x) => s + x.touches, 0), importance: it.reduce((s, x) => s + x.importance, 0), extreme: it.some(x => x.extreme), tDerniere: Math.max(...it.map(x => x.tDerniere)), niveaux: it.length };
  });
  // côté : la bande au-dessus du prix est une résistance, au-dessous un support (le prix dans la bande : selon son centre)
  // sélection : extrêmes d'abord, puis par importance ; une bande à moins de 1 ATR (bord à bord) d'une bande déjà retenue s'y fond (UNE bande) ;
  // au plus 4 de chaque côté du prix ; les 2 plus importantes de chaque côté sont « fortes » (bien visibles), les autres discrètes
  const sp = R.espacementAtr * a, pris = [], cote = b => (b.p > ref ? 'resistance' : 'support');
  for (const b of bandes.slice().sort((x, y) => (y.extreme - x.extreme) || (y.importance - x.importance))) {
    const g = pris.find(q => b.bas - q.haut < sp && q.bas - b.haut < sp);
    if (g) { g.touches += b.touches; g.importance += b.importance; g.niveaux += b.niveaux; g.extreme = g.extreme || b.extreme; g.tDerniere = Math.max(g.tDerniere, b.tDerniere); continue; }   // la bande retenue garde sa place, elle compte les touches de sa voisine
    if (pris.filter(q => cote(q) === cote(b)).length < R.parCote) pris.push({ ...b });
  }
  const fortes = new Set(['resistance', 'support'].flatMap(c => pris.filter(q => cote(q) === c).sort((x, y) => y.importance - x.importance).slice(0, R.forts)));
  const dessus = pris.filter(q => cote(q) === 'resistance').map(q => ({ ...q, cote: 'resistance', fort: fortes.has(q) })), dessous = pris.filter(q => cote(q) === 'support').map(q => ({ ...q, cote: 'support', fort: fortes.has(q) }));
  const sel = [...dessus, ...dessous].map(b => ({ ...b, texte: `${b.cote === 'resistance' ? 'Résistance' : 'Support'} ${fourchette(b.bas, b.haut)} · ${pluriel(b.touches, 'touche')}`,
    detail: [`${pluriel(b.niveaux, 'niveau regroupé', 'niveaux regroupés')}, ${pluriel(b.touches, 'touche')} (pivots ${periode} sur ${R.fenetreJours[periode]} jours)`, `dernière touche : ${new Date(b.tDerniere).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`, b.extreme ? 'plus haut ou plus bas majeur de l’historique visible' : null].filter(Boolean) }));
  return { a, bandes: sel.sort((x, y) => y.p - x.p), toutes: bandes, pivots: pv, n, i0 };
}

/* liquidité de la période : sommets égaux / creux égaux, veille, semaine, mois ; balayée = dépassée par une bougie close ensuite */
export function liquidite(B, { periode, maintenant = Date.now(), prix = null, a = null, pivotsL = null, i0 = 0, R = REGLES_NIVEAUX } = {}) {
  const P = PERIODES[periode].ms, C = closes(B, P, maintenant), n = C.length; if (!n || !a) return { zones: [], balayages: [] };
  const K = C.map(b => paris(b.t)), zones = [];
  const balayage = (sorte, p, depuis) => { for (let i = depuis; i < n; i++) if (sorte === 'haute' ? C[i].h > p : C[i].l < p) return i; return -1; };
  // sommets égaux / creux égaux
  const pv = (pivotsL || pivots(C, R.pivotK[periode], i0, n - 1)).filter(x => !x.ajoute);   // vrais pivots confirmés seulement
  for (const sorte of ['sommet', 'creux']) {
    for (const g of chainer(pv.filter(x => x.sorte === sorte).map(x => ({ ...x, lo: x.p, hi: x.p })), R.egauxAtr * a)) {
      if (g.items.length < 2) continue;
      const p = sorte === 'sommet' ? g.hi : g.lo, dernier = Math.max(...g.items.map(x => x.i));
      zones.push({ p, sorte: sorte === 'sommet' ? 'haute' : 'basse', raison: sorte === 'sommet' ? 'sommets égaux' : 'creux égaux', depuis: C[dernier].t, iFin: dernier + 1 });
    }
  }
  // veille (dernière journée de marché complète, lundi → vendredi), semaine et mois précédents
  const groupes = { jour: new Map(), semaine: new Map(), mois: new Map() };
  for (let i = 0; i < n; i++) for (const k of ['jour', 'semaine', 'mois']) { const c = K[i][k]; const g = groupes[k].get(c); if (g) { g.h = Math.max(g.h, C[i].h); g.l = Math.min(g.l, C[i].l); g.fin = i; g.nb++; } else groupes[k].set(c, { h: C[i].h, l: C[i].l, debut: i, fin: i, nb: 1, j: K[i].j }); }
  const cour = K[n - 1];
  const prec = (k, ok = () => true) => [...groupes[k].entries()].filter(([c, g]) => c !== cour[k] && ok(g)).sort((x, y) => (x[0] < y[0] ? -1 : 1)).pop();
  const nomJ = { jour: 'de la veille', semaine: 'de la semaine dernière', mois: 'du mois dernier' };
  for (const k of ['jour', 'semaine', 'mois']) {
    const e = prec(k, g => k !== 'jour' || (g.j !== 0 && g.j !== 6)); if (!e) continue;
    const [, g] = e; if (k === 'mois' && g.debut === 0 && periode !== 'J') continue;   // mois incomplet au début des données
    zones.push({ p: g.h, sorte: 'haute', raison: `plus haut ${nomJ[k]}`, depuis: C[g.fin].t, iFin: g.fin + 1 }, { p: g.l, sorte: 'basse', raison: `plus bas ${nomJ[k]}`, depuis: C[g.fin].t, iFin: g.fin + 1 });
  }
  const actives = [], balayages = [];
  for (const z of zones) { const ib = balayage(z.sorte, z.p, z.iFin); if (ib < 0) actives.push(z); else balayages.push({ t: C[ib].t, p: z.p, sorte: z.sorte, raison: z.raison }); }
  // zones voisines (< 0,2 ATR) réunies ; les plus proches du prix, 2 de chaque côté
  const ref = prix ?? C[n - 1].c, out = [];
  for (const sorte of ['haute', 'basse']) {
    const G = chainer(actives.filter(z => z.sorte === sorte && (sorte === 'haute' ? z.p >= ref : z.p <= ref)).map(z => ({ ...z, lo: z.p, hi: z.p })), R.egauxAtr * a)
      .map(g => ({ p: sorte === 'haute' ? g.hi : g.lo, sorte, raisons: [...new Set(g.items.map(x => x.raison))], depuis: Math.min(...g.items.map(x => x.depuis)) }))
      .sort((x, y) => Math.abs(x.p - ref) - Math.abs(y.p - ref)).slice(0, R.liquiditeParCote);
    out.push(...G);
  }
  // étiquette courte (« Liquidité basse 3 874 (semaine dernière, mois dernier) ») ; les raisons complètes restent dans le détail
  const court = r => r.replace(/^plus (haut|bas) (de la |du )?/, '');
  return { zones: out.map(z => ({ ...z, texte: `Liquidité ${z.sorte} ${nb(z.p)} (${z.raisons.map(court).join(', ')})` })), balayages: balayages.filter(b => b.t >= (C[i0] ? C[i0].t : 0)) };
}

/* ATR local (moyenne simple des 14 dernières étendues vraies) : ne dépend que des 15 dernières bougies, donc ni du début des données
   chargées ni de l'historique ajouté en glissant vers la gauche (l'ATR de Wilder, récursif, dépend de tout ce qui précède) */
export function atrLocal(b, n = 14) {
  const o = new Array(b.length).fill(null); let s = 0; const tr = i => Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c));
  for (let i = 1; i < b.length; i++) { s += tr(i); if (i > n) s -= tr(i - n); if (i >= n) o[i] = s / n; }
  return o;
}
/* FLÈCHES DE REBOND, strictement causales : la flèche de la bougie i ne dépend que des bougies 0..i (rejouable bougie par bougie) */
export function fleches(B, { periode, maintenant = Date.now(), volumes = null, RN = REGLES_NIVEAUX, RF = REGLES_FLECHES } = {}) {
  const P = PERIODES[periode].ms, C = closes(B, P, maintenant), n = C.length, k = RN.pivotK[periode], fen = RN.fenetreJours[periode] * 86400e3;
  if (n < 2 * k + RF.volumeMedianeN + 15) return [];
  const A = atrLocal(C, 14), V = C.map(b => { const x = volumes && volumes.get(b.t); return x != null ? x : b.v; });
  const pv = pivots(C, k, 0, n - 1), K = C.map(b => paris(b.t)), out = [], recentes = [];
  // liquidité de date (veille, semaine, mois) suivie bougie par bougie
  const acc = { jour: null, semaine: null, mois: null }, prec = { jour: null, semaine: null, mois: null };
  let w0 = 0, ip = 0; const actifs = [];   // pivots confirmés dans la fenêtre
  for (let i = 0; i < n; i++) {
    // 1) état connu AVANT la bougie i : pivots confirmés à i − 1 au plus tard, liquidité non balayée jusqu'à i − 1
    while (ip < pv.length && pv[ip].i + k <= i - 1) actifs.push(pv[ip++]);
    while (w0 < i && C[w0].t < C[i].t - fen) w0++;
    while (actifs.length && actifs[0].i < w0) actifs.shift();
    const a = A[i - 1];
    if (i > 0) for (const c of ['jour', 'semaine', 'mois']) {   // la bougie i − 1 met à jour les groupes ; un nouveau groupe fige le précédent (veille : jours de semaine seulement)
      const kc = K[i - 1][c], b = C[i - 1];
      if (!acc[c] || acc[c].cle !== kc) {
        if (acc[c] && (c !== 'jour' || (acc[c].j !== 0 && acc[c].j !== 6)) && acc[c].complet) prec[c] = { h: acc[c].h, l: acc[c].l, hB: false, lB: false };
        acc[c] = { cle: kc, h: b.h, l: b.l, j: K[i - 1].j, complet: i - 1 > 0 };
      } else { acc[c].h = Math.max(acc[c].h, b.h); acc[c].l = Math.min(acc[c].l, b.l); }
      if (prec[c]) { if (b.h > prec[c].h) prec[c].hB = true; if (b.l < prec[c].l) prec[c].lB = true; }
    }
    if (!a || i < RF.volumeMedianeN + 1) continue;
    // niveaux à cet instant : pivots regroupés à 0,5 ATR ; liquidité : sommets / creux égaux non balayés, veille, semaine, mois
    const niv = chainer(actifs.map(x => ({ ...x, lo: x.p, hi: x.p })), RN.regroupementAtr * a, RN.espacementAtr * a).map(g => ({ p: g.items.reduce((s, x) => s + x.p, 0) / g.items.length, touches: g.items.length, type: 'niveau' }));
    for (const s of ['sommet', 'creux']) for (const g of chainer(actifs.filter(x => x.sorte === s).map(x => ({ ...x, lo: x.p, hi: x.p })), RN.egauxAtr * a)) {
      if (g.items.length < 2) continue; const p = s === 'sommet' ? g.hi : g.lo, der = Math.max(...g.items.map(x => x.i));
      let balaye = false; for (let j = der + 1; j < i; j++) if (s === 'sommet' ? C[j].h > p : C[j].l < p) { balaye = true; break; }
      if (!balaye) niv.push({ p, touches: g.items.length, type: s === 'sommet' ? 'liquidité haute' : 'liquidité basse' });
    }
    for (const c of ['jour', 'semaine', 'mois']) if (prec[c]) { if (!prec[c].hB) niv.push({ p: prec[c].h, touches: 1, type: 'liquidité haute' }); if (!prec[c].lB) niv.push({ p: prec[c].l, touches: 1, type: 'liquidité basse' }); }
    // 2) la bougie i : touche, clôture à l'écart, mèche de rejet, volume
    const b = C[i], av = C[i - 1], e = b.h - b.l; if (!(e > 0)) continue;
    const med = mediane(V.slice(i - RF.volumeMedianeN, i)); if (!(V[i] >= med)) continue;
    const mecheH = b.h - Math.max(b.o, b.c), mecheB = Math.min(b.o, b.c) - b.l, tol = RF.toucheAtr * a, ec = RF.ecartAtr * a;
    let best = null;
    for (const L of niv) {
      if (L.type !== 'liquidité basse' && mecheH >= RF.meche * e && (Math.abs(b.h - L.p) <= tol || Math.abs(av.h - L.p) <= tol) && b.c <= L.p - ec) { const d = Math.abs(b.h - L.p); if (!best || d < best.d) best = { d, sens: 'baisse', L }; }
      if (L.type !== 'liquidité haute' && mecheB >= RF.meche * e && (Math.abs(b.l - L.p) <= tol || Math.abs(av.l - L.p) <= tol) && b.c >= L.p + ec) { const d = Math.abs(b.l - L.p); if (!best || d < best.d) best = { d, sens: 'hausse', L }; }
    }
    if (!best) continue;
    if (recentes.some(f => f.sens === best.sens && Math.abs(f.niveau - best.L.p) < 0.5 * a && b.t - f.t < RF.attenteMin * 60e3)) continue;
    const f = { t: b.t, i, sens: best.sens, niveau: best.L.p, type: best.L.type === 'niveau' ? (best.sens === 'baisse' ? 'résistance' : 'support') : best.L.type, touches: best.L.touches, volume: V[i], mediane: med, atr: a };
    out.push(f); recentes.push(f); while (recentes.length && b.t - recentes[0].t > RF.attenteMin * 60e3) recentes.shift();
  }
  return out;
}

/* bilan honnête : part des flèches suivies d'un mouvement ≥ 1 ATR dans leur sens dans les 8 bougies, contre 1000 flèches au hasard aux mêmes heures */
export function bilanFleches(B, F, { periode, maintenant = Date.now(), RF = REGLES_FLECHES, graine = 7 } = {}) {
  const P = PERIODES[periode].ms, C = closes(B, P, maintenant), n = C.length, A = atr(C, 14), idx = new Map(C.map((b, i) => [b.t, i]));
  const suivie = (i, sens) => { const a = A[i]; if (!a || i + RF.suiviBougies >= n) return null; for (let j = i + 1; j <= i + RF.suiviBougies; j++) if (sens === 'baisse' ? C[j].l <= C[i].c - RF.suiviAtr * a : C[j].h >= C[i].c + RF.suiviAtr * a) return true; return false; };
  const mesur = F.map(f => ({ f, i: idx.get(f.t) })).filter(x => x.i != null).map(x => ({ ...x, ok: suivie(x.i, x.f.sens) })).filter(x => x.ok != null);
  const N = mesur.length, reussies = mesur.filter(x => x.ok).length;
  if (N < RF.minFleches) return { n: F.length, mesurees: N, assez: false, texte: `${pluriel(F.length, 'flèche')} sur l’historique chargé · pas assez de données pour un bilan (${pluriel(N, 'flèche mesurable', 'flèches mesurables')}, il en faut ${RF.minFleches}).` };
  // hasard : même heure de Paris (heure et minute) et même sens que chaque flèche tirée
  const parHeure = new Map(); for (let i = 15; i + RF.suiviBougies < n; i++) { const p = paris(C[i].t), c = p.h * 60 + p.m; (parHeure.get(c) || parHeure.set(c, []).get(c)).push(i); }
  const r = alea(graine); let ok = 0, tot = 0;
  for (let k = 0; k < RF.hasard; k++) { const x = mesur[Math.floor(r() * N)], p = paris(x.f.t), L = parHeure.get(p.h * 60 + p.m); if (!L || !L.length) continue; const s = suivie(L[Math.floor(r() * L.length)], x.f.sens); if (s == null) continue; tot++; if (s) ok++; }
  const taux = reussies / N, tauxH = tot ? ok / tot : null;
  return { n: F.length, mesurees: N, assez: true, taux, hasard: tauxH, tirages: tot,
    texte: `${pluriel(F.length, 'flèche')} · ${Math.round(taux * 100)} % suivies d’un mouvement d’au moins 1 ATR dans leur sens en 8 bougies (${reussies} sur ${N}) · au hasard aux mêmes heures : ${tauxH == null ? 'non mesurable' : Math.round(tauxH * 100) + ' %'} (${tot} tirages). Mesure passée, pas une promesse ni un signal.` };
}
