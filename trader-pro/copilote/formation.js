/* ═════════════ « FORMATION » : relire les gros mouvements des derniers mois, bougie par bougie, sur le vrai graphique ═════════════
   100 % concret, pas de cours ni de quiz : Rayle détecte AUTOMATIQUEMENT les plus gros mouvements récents de mes actifs (retournements et cassures de MA200 qui ont donné plusieurs jours de mouvement),
   montre ce que disaient les outils AVANT et AU DÉBUT du mouvement (surtout les bougies de volume, puis la MA200, la session, le niveau), et termine par ce qui se répète d'un gros mouvement à l'autre
   (avec le nombre de cas : « sur les 8 plus gros retournements de l'or, 6 ont commencé par… »). Module pur, testé. Seulement des bougies passées ; l'échantillon petit est dit. Lecture seule. */
import { creerCalcul } from '../volume/bougies-volume-calcul.js';
import { sma, atr as atrSerie } from '../commun/analyse.js';
import { sessionEn } from '../lecture/sessions.js';
import { actifParId } from '../lecture/fiche.js';

export const J = 86400e3, H4 = 4 * 3600e3;
const fr = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ').replace('-', '−') : '?');
const jourFr = t => new Date(t).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' }).replace(/^1 /, '1er ');
const deNom = s => String(s).replace(/^le /, 'du ').replace(/^la /, 'de la ').replace(/^l’/, 'de l’').replace(/^les /, 'des ');

/* zigzag Daily : un pivot est confirmé quand le prix s'en éloigne de `k` ATR dans l'autre sens ; ne regarde que le passé de chaque pivot (pas de repaint pour les pivots confirmés) */
export function pivotsJournaliers(Jb, { k = 3.5 } = {}) {
  const A = atrSerie(Jb, 14), P = []; let dir = 0, hi = { i: 0, p: Jb[0].h }, lo = { i: 0, p: Jb[0].l }, ext = null;
  for (let i = 1; i < Jb.length; i++) {
    const a = A[i], h = Jb[i].h, l = Jb[i].l;
    if (dir === 0) { if (h > hi.p) hi = { i, p: h }; if (l < lo.p) lo = { i, p: l }; if (!a) continue;
      if (h - lo.p >= k * a && lo.i < i) { P.push({ type: 'bas', i: lo.i, p: lo.p }); dir = 1; ext = { i, p: h }; } else if (hi.p - l >= k * a && hi.i < i) { P.push({ type: 'haut', i: hi.i, p: hi.p }); dir = -1; ext = { i, p: l }; } continue; }
    if (dir === 1) { if (h > ext.p) ext = { i, p: h }; if (a && ext.p - l >= k * a) { P.push({ type: 'haut', i: ext.i, p: ext.p }); dir = -1; ext = { i, p: l }; } }
    else { if (l < ext.p) ext = { i, p: l }; if (a && h - ext.p >= k * a) { P.push({ type: 'bas', i: ext.i, p: ext.p }); dir = 1; ext = { i, p: h }; } }
  }
  return P;
}
/* signaux autour du début d'un mouvement (pivot) : volume extrême, niveau majeur, MA200, balayage, session */
export function signauxDuDepart({ Jb, H4b, actif, pivot, pivotsAvant }) {
  const t0 = Jb[pivot.i].t, S = {}, calc = creerCalcul(actif).maj(H4b), A = atrSerie(Jb, 14), atrJ = A[pivot.i] || A.filter(Boolean).pop(), haut = pivot.type === 'haut';
  const i0 = H4b.findIndex(b => b.t >= t0 - 2 * J), i1 = H4b.findIndex(b => b.t > t0 + J);
  let best = null; for (let i = Math.max(0, i0); i >= 0 && i < (i1 === -1 ? H4b.length : i1); i++) { const r = calc.rel(i); if (r != null && r >= 3 && (!best || r > best.rel)) best = { i, rel: r, dir: H4b[i].c >= H4b[i].o ? 1 : -1, t: H4b[i].t }; }
  S.volumeExtreme = best ? { rel: best.rel, dir: best.dir, t: best.t, contreMouvement: haut ? best.dir > 0 : best.dir < 0 } : null;   // au sommet d'un retournement baissier, la grosse bougie est acheteuse (dernière poussée) : « dans le sens de l'ancien mouvement »
  const prec = (pivotsAvant || []).filter(p => p.type === pivot.type && Jb[p.i].t < t0 - 3 * J), proche = prec.map(p => ({ p, d: Math.abs(p.p - pivot.p) / atrJ })).sort((a, b) => a.d - b.d)[0];
  S.niveauMajeur = proche && proche.d <= 0.6 ? { prix: proche.p.p, distanceAtr: proche.d, t: Jb[proche.p.i].t } : null;
  S.balayage = proche && (haut ? pivot.p > proche.p.p : pivot.p < proche.p.p) && proche.d <= 1.2 && !!(S.niveauMajeur || proche.d <= 1.2) ? { niveau: proche.p.p, depassementAtr: Math.abs(pivot.p - proche.p.p) / atrJ } : null;
  const M = sma(H4b.map(b => b.c), 200), ih = H4b.findIndex(b => b.t > t0), iM = Math.max(0, (ih === -1 ? H4b.length : ih) - 1), a4 = atrSerie(H4b, 14)[iM];
  S.ma200 = M[iM] != null && a4 ? { contactAtr: Math.abs(H4b[iM].c - M[iM]) / a4, cote: H4b[iM].c >= M[iM] ? 'dessus' : 'dessous', ecartAtr: (H4b[iM].c - M[iM]) / a4, contact: Math.abs(H4b[iM].c - M[iM]) / a4 <= 1.5 } : null;
  let extreme = null; for (const b of H4b) { if (b.t < t0 - 6 * 3600e3 || b.t > t0 + J) continue; if (!extreme || (haut ? b.h > extreme.h : b.l < extreme.l)) extreme = b; }   /* la bougie H4 qui a fait le sommet ou le creux */
  S.session = extreme ? (sessionEn(extreme.t + 2 * 3600e3).id === 'creux' ? 'creux du soir' : sessionEn(extreme.t + 2 * 3600e3).nom) : sessionEn(t0 + 12 * 3600e3).nom; return S;
}
/* les `n` plus gros mouvements (en ATR) des `mois` derniers mois : [{ sens, t0, t1, pct, atr, signaux, resume }] */
export function plusGrosMouvements({ Jb, H4b, actif, mois = 6, n = 8, k = 3.5, maintenant = Date.now() }) {
  if (!Jb || Jb.length < 260 || !H4b || H4b.length < 400) return { moves: [], raison: 'pas assez d’historique pour relire les gros mouvements' };
  const P = pivotsJournaliers(Jb, { k }), A = atrSerie(Jb, 14), legs = [];
  for (let j = 1; j < P.length; j++) { const a = P[j - 1], b = P[j], t0 = Jb[a.i].t, t1 = Jb[b.i].t; if (t1 < maintenant - mois * 30 * J || Jb[b.i].t + J > maintenant) continue; const pct = (b.p / a.p - 1) * 100, atr = Math.abs(b.p - a.p) / (A[a.i] || A[b.i] || 1); legs.push({ a, b, t0, t1, pct, atr, sens: b.p > a.p ? 1 : -1 }); }
  const top = legs.sort((x, y) => y.atr - x.atr).slice(0, n).sort((x, y) => x.t0 - y.t0), nom = actifParId[actif] ? actifParId[actif].nom : actif;
  const moves = top.map(l => { const sig = signauxDuDepart({ Jb, H4b, actif, pivot: l.a, pivotsAvant: P.slice(0, Math.max(0, P.indexOf(l.a))) }); return { actif, sens: l.sens, t0: l.t0, t1: l.t1, pct: l.pct, atr: l.atr, jours: Math.round((l.t1 - l.t0) / J), signaux: sig, resume: resumeMouvement(nom, l, sig) }; });
  return { moves, repete: ceQuiSeRepete(moves, nom), nom };
}
function resumeMouvement(nom, l, s) {
  const P = [`${l.sens > 0 ? 'Hausse' : 'Baisse'} de ${fr(Math.abs(l.pct), 1)} % en ${Math.round((l.t1 - l.t0) / J)} jours (${fr(l.atr, 1)} ATR), du ${jourFr(l.t0)} au ${jourFr(l.t1)}.`];
  if (s.volumeExtreme) P.push(`Au départ : bougie de volume extrême (${fr(s.volumeExtreme.rel, 1)} fois la normale) le ${jourFr(s.volumeExtreme.t)}.`);
  if (s.niveauMajeur) P.push(`Le départ s’est fait au contact d’un niveau majeur (${fr(s.niveauMajeur.prix, Math.abs(s.niveauMajeur.prix) >= 100 ? 0 : 2)}).`);
  if (s.balayage) P.push('Le départ a balayé le dernier sommet / creux avant de repartir.');
  if (s.ma200 && s.ma200.contact) P.push(`Le prix était au contact de la MA200 H4 (${fr(s.ma200.contactAtr, 1)} ATR).`);
  P.push(`Session au départ : ${s.session}.`); return P.join(' ');
}
/* ce qui se répète d'un gros mouvement à l'autre, avec le nombre de cas */
export function ceQuiSeRepete(moves, nom = 'l’actif') {
  const N = moves.length; if (N < 3) return { n: N, texte: `Seulement ${N} gros mouvement${N > 1 ? 's' : ''} détecté${N > 1 ? 's' : ''} : trop peu pour dire ce qui se répète.`, lignes: [] };
  const c = f => moves.filter(f).length, L = [], petit = N < 6 ? ` (échantillon petit : ${N} cas)` : '';
  const vn = c(m => m.signaux.volumeExtreme && m.signaux.niveauMajeur), v = c(m => m.signaux.volumeExtreme), nm = c(m => m.signaux.niveauMajeur), ba = c(m => m.signaux.balayage), ma = c(m => m.signaux.ma200 && m.signaux.ma200.contact);
  if (v) L.push({ cle: 'volume', n: v, texte: `${v} sur ${N} ont commencé par une bougie de volume extrême` }); if (vn) L.push({ cle: 'volume+niveau', n: vn, texte: `${vn} sur ${N} ont commencé par une bougie de volume extrême au contact d’un niveau majeur` });
  if (nm) L.push({ cle: 'niveau', n: nm, texte: `${nm} sur ${N} sont partis d’un niveau majeur déjà testé` }); if (ba) L.push({ cle: 'balayage', n: ba, texte: `${ba} sur ${N} ont balayé le dernier sommet ou creux avant de repartir` }); if (ma) L.push({ cle: 'ma200', n: ma, texte: `${ma} sur ${N} sont partis au contact de la MA200 H4` });
  const ses = {}; for (const m of moves) ses[m.signaux.session] = (ses[m.signaux.session] || 0) + 1; const top = Object.entries(ses).sort((a, b) => b[1] - a[1])[0]; if (top && top[1] >= 3) L.push({ cle: 'session', n: top[1], texte: `${top[1]} sur ${N} ont démarré pendant la session ${top[0]}` });
  L.sort((a, b) => b.n - a.n); const retenues = L.slice(0, 3);
  return { n: N, lignes: L, texte: `Sur les ${N} plus gros mouvements ${deNom(nom)} ces derniers mois${petit} : ${retenues.map(x => x.texte).join(' ; ')}. Ce sont des constats sur le passé, pas des règles.` };
}
