/* ═════════════ PORTEFEUILLE : statistiques, courbes, répartitions (calculs PURS, testés) ═════════════
   Entrée : positions fermées normalisées par import-xtb.js (pnl = résultat NET : brut + commission + swap) et opérations de trésorerie.
   Sorties en euros (devise du compte). Les dépôts, retraits et transferts sont EXCLUS de la performance. R = résultat net / risque initial (distance au stop FINAL × volume × valeur du point) :
   le stop final peut avoir été déplacé, donc R est une estimation ; absent sans stop, ou quand le stop final est du côté du gain (stop remonté au point d'entrée ou au-delà : le risque initial est alors inconnu). */
import { TYPES_CAPITAL, TYPES_POSITION } from './import-xtb.js';

export const H = 3600e3, J = 86400e3;
const med = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const somme = (L, f) => L.reduce((s, x) => s + (f(x) || 0), 0);
const r2 = v => Math.round(v * 100) / 100;
const fParis = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
export function partiesParis(t) { const o = {}; for (const p of fParis.formatToParts(new Date(t))) o[p.type] = p.value; return { jour: `${o.year}-${o.month}-${o.day}`, heure: +o.hour, semaine: o.weekday }; }
const JOURS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
export const jourSemaineIdx = t => (new Date(partiesParis(t).jour + 'T12:00:00Z').getUTCDay() + 6) % 7;
/* sessions (heures UTC, documentées) : Asie 0-7, Londres 7-13, New York 13-21, Nuit 21-24 */
export const session = t => { const h = new Date(t).getUTCHours(); return h < 7 ? 'Asie' : h < 13 ? 'Londres' : h < 21 ? 'New York' : 'Nuit'; };
export const BUCKETS_DUREE = [['< 5 min', 5 * 60e3], ['5 à 30 min', 30 * 60e3], ['30 min à 2 h', 2 * H], ['2 à 8 h', 8 * H], ['8 à 24 h', 24 * H], ['> 24 h', Infinity]];

/* valeur du point : € par unité de prix et par lot, mesurée sur les positions elles-mêmes (médiane de brut / (Δprix × sens × volume)) */
export function valeursDuPoint(fermees) {
  const par = {};
  for (const t of fermees) { if (t.prixFerm == null || t.prixOuv == null || !(t.volume > 0)) continue; const d = (t.prixFerm - t.prixOuv) * (t.sens === 'BUY' ? 1 : -1) * t.volume; if (Math.abs(d) < 1e-9 || Math.abs(t.brut) < 0.03) continue; const k = t.brut / d; if (Number.isFinite(k) && k > 0) (par[t.ticker] = par[t.ticker] || []).push(k); }
  const out = {}; for (const [k, L] of Object.entries(par)) if (L.length >= 3) { const m = med(L); out[k] = { k: m, n: L.length, ecart: m ? med(L.map(x => Math.abs(x / m - 1))) : null }; } return out;
}
/* trade enrichi : durée, R, session, jour et heure de Paris */
export function enrichir(fermees, vp = valeursDuPoint(fermees)) {
  return fermees.map(t => {
    const k = vp[t.ticker] && vp[t.ticker].k, stopInitialPlausible = t.sl != null && t.prixOuv != null && (t.sens === 'BUY' ? t.sl < t.prixOuv : t.sl > t.prixOuv), risque = stopInitialPlausible && k ? Math.abs(t.prixOuv - t.sl) * t.volume * k : null, p = partiesParis(t.tOuv), pf = partiesParis(t.tFerm);
    return { ...t, duree: t.tFerm - t.tOuv, risque, r: risque && risque > 0.01 ? t.pnl / risque : null, session: session(t.tOuv), jourSemaine: jourSemaineIdx(t.tOuv), heure: p.heure, jourFerm: pf.jour, jourOuv: p.jour, sansStop: t.sl == null };
  }).sort((a, b) => a.tFerm - b.tFerm);
}
export function series(T) {   // plus longues séries gagnante / perdante (en nombre de trades consécutifs)
  let g = 0, p = 0, mg = 0, mp = 0; for (const t of T) { if (t.pnl > 0) { g++; p = 0; } else if (t.pnl < 0) { p++; g = 0; } else { g = 0; p = 0; } if (g > mg) mg = g; if (p > mp) mp = p; } return { gagnante: mg, perdante: mp };
}
export function drawdown(valeurs) { let pic = -Infinity, max = 0, dernier = 0; const dd = valeurs.map(v => { if (v > pic) pic = v; dernier = v - pic; if (dernier < max) max = dernier; return dernier; }); return { courbe: dd, max }; }
export function resume(T) {
  const n = T.length; if (!n) return { n: 0 };
  const g = T.filter(t => t.pnl > 0), p = T.filter(t => t.pnl < 0), sg = somme(g, t => t.pnl), sp = somme(p, t => t.pnl), cum = []; let c = 0; for (const t of T) { c += t.pnl; cum.push(c); }
  const dd = drawdown(cum), rs = T.map(t => t.r).filter(Number.isFinite);
  return { n, gagnants: g.length, perdants: p.length, nuls: n - g.length - p.length, winRate: g.length / n, pnl: r2(c), brut: r2(somme(T, t => t.brut)), swaps: r2(somme(T, t => t.swap)), commissions: r2(somme(T, t => t.commission)),
    gainMoyen: g.length ? sg / g.length : null, perteMoyenne: p.length ? sp / p.length : null, payoff: g.length && p.length ? (sg / g.length) / Math.abs(sp / p.length) : null, profitFactor: sp < 0 ? sg / Math.abs(sp) : null, esperance: c / n,
    meilleur: T.reduce((m, t) => (t.pnl > m.pnl ? t : m), T[0]), pire: T.reduce((m, t) => (t.pnl < m.pnl ? t : m), T[0]), series: series(T), drawdownMax: r2(dd.max), esperanceR: rs.length ? rs.reduce((s, x) => s + x, 0) / rs.length : null, nR: rs.length,
    dureeMediane: med(T.map(t => t.duree)), dureeGagnantes: med(g.map(t => t.duree)), dureePerdantes: med(p.map(t => t.duree)) };
}
/* regroupement générique : { cle, n, pnl, gagnants, winRate, moyenne } */
export function grouper(T, fCle) { const m = new Map(); for (const t of T) { const k = fCle(t); if (k == null) continue; const o = m.get(k) || { cle: k, n: 0, pnl: 0, gagnants: 0 }; o.n++; o.pnl += t.pnl; if (t.pnl > 0) o.gagnants++; m.set(k, o); } return [...m.values()].map(o => ({ ...o, pnl: r2(o.pnl), winRate: o.gagnants / o.n, moyenne: o.pnl / o.n })); }
export const parDuree = T => { const L = grouper(T, t => BUCKETS_DUREE.findIndex(b => t.duree < b[1])); return L.sort((a, b) => a.cle - b.cle).map(o => ({ ...o, cle: BUCKETS_DUREE[o.cle][0] })); };
export function parTaille(T) {
  const v = T.map(t => t.volume).sort((a, b) => a - b); if (v.length < 9) return []; const q1 = v[Math.floor(v.length / 3)], q2 = v[Math.floor(2 * v.length / 3)];
  return grouper(T, t => (t.volume <= q1 ? 'petites' : t.volume <= q2 ? 'moyennes' : 'grosses')).map(o => ({ ...o, seuil: o.cle === 'petites' ? '≤ ' + q1 : o.cle === 'moyennes' ? '≤ ' + q2 : '> ' + q2 })).sort((a, b) => ['petites', 'moyennes', 'grosses'].indexOf(a.cle) - ['petites', 'moyennes', 'grosses'].indexOf(b.cle));
}
export const nomJour = i => JOURS[i];

/* ───── trésorerie : capital, performance, calendrier ───── */
export const estCapital = c => TYPES_CAPITAL.test(c.type);
/* revenus et frais du compte hors positions (intérêts, taxes sur intérêts, corrections non rattachées…) */
export const estAutre = c => !TYPES_CAPITAL.test(c.type) && !TYPES_POSITION.test(c.type);
export function courbes(C, T, soldeInitial = 0) {
  const ops = [...C].sort((a, b) => a.t - b.t); let solde = Number.isFinite(soldeInitial) && soldeInitial > 0 ? soldeInitial : 0, flux = 0, apporte = 0, perf = 0; const soldePts = [], perfPts = [], apportePts = [];
  for (const o of ops) {
    if (estCapital(o)) { solde += o.montant; flux += o.montant; if (o.montant > 0) apporte += o.montant; } else { solde += o.montant; perf += o.montant; }
    soldePts.push({ t: o.t, v: r2(solde) }); perfPts.push({ t: o.t, v: r2(perf) }); apportePts.push({ t: o.t, v: r2(apporte) });
  }
  /* drawdown : baisse depuis le plus haut précédent du résultat cumulé (en euros) ; en % du capital apporté jusque-là (les retraits ne sont pas des pertes ; une valeur relative au solde explose quand le solde est proche de zéro) */
  /* % : baisse depuis le plus haut du résultat, rapportée à la valeur du compte à CE plus haut (capital apporté jusque-là + résultat au plus haut) ; les dépôts faits après le plus haut ne diluent pas la baisse */
  const dd = drawdown(perfPts.map(p => p.v)); let picPerf = -Infinity, apporteAuPic = 0;
  const ddPct = dd.courbe.map((d, i) => { if (perfPts[i].v > picPerf) { picPerf = perfPts[i].v; apporteAuPic = apportePts[i].v; } const base = apporteAuPic + Math.max(0, picPerf); return base > 0 ? +(d / base * 100).toFixed(2) : 0; });
  return { solde: soldePts, perf: perfPts, apporte: apportePts, drawdownPerf: perfPts.map((p, i) => ({ t: p.t, v: r2(dd.courbe[i]) })), drawdownPct: perfPts.map((p, i) => ({ t: p.t, v: ddPct[i] })), soldeFinal: soldePts.length ? soldePts[soldePts.length - 1].v : 0, fluxNet: r2(flux), capitalApporte: r2(apporte), perfTotale: r2(perf), drawdownPerfMax: r2(dd.max), drawdownPctMax: ddPct.length ? Math.min(0, ...ddPct) : 0 };
}
/* P&L par jour (date de Paris de la fermeture) */
export function pnlParJour(T) { const m = new Map(); for (const t of T) m.set(t.jourFerm, (m.get(t.jourFerm) || 0) + t.pnl); return [...m].map(([jour, pnl]) => ({ jour, pnl: r2(pnl) })).sort((a, b) => (a.jour < b.jour ? -1 : 1)); }
export function cumulerPeriode(jours, fCle) { const m = new Map(); for (const j of jours) { const k = fCle(j.jour); m.set(k, (m.get(k) || 0) + j.pnl); } return [...m].map(([cle, pnl]) => ({ cle, pnl: r2(pnl) })); }
export const cleSemaine = jour => { const d = new Date(jour + 'T12:00:00Z'), jj = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - jj); return d.toISOString().slice(0, 10); };
export const cleMois = jour => jour.slice(0, 7);

/* ───── positions ouvertes ───── */
export function exposition(ouvertes, vp, capital, prix = {}) {
  const L = ouvertes.map(o => {
    const k = vp[o.ticker] && vp[o.ticker].k, p = prix[o.ticker] != null ? prix[o.ticker] : o.prixCourant, s = o.sens === 'BUY' ? 1 : -1;
    const latent = k && p != null && o.prixOuv != null ? (p - o.prixOuv) * s * o.volume * k + (o.swap || 0) : o.pnl, risque = k && o.sl != null && o.prixOuv != null ? (o.sl - o.prixOuv) * s * o.volume * k : null;
    return { ...o, prixUtilise: p, latent, source: prix[o.ticker] != null ? 'prix en direct' : 'prix du fichier', risqueAuStop: risque };
  });
  const risque = somme(L.filter(x => x.risqueAuStop != null && x.risqueAuStop < 0), x => -x.risqueAuStop), sansStop = L.filter(x => x.sl == null);
  return { positions: L, valeur: r2(somme(L, x => x.valeur)), latent: r2(somme(L, x => x.latent)), risqueAuStop: r2(risque), risquePct: capital > 0 ? risque / capital * 100 : null, exposePct: capital > 0 ? somme(L, x => x.valeur) / capital * 100 : null, sansStop: sansStop.length };
}

/* ───── tableau filtré ───── */
export function filtrer(T, { actif = null, periode = null, sens = null, resultat = null, texte = '', maintenant = Date.now() } = {}) {
  const depuis = periode ? maintenant - periode * J : null, q = String(texte || '').trim().toLowerCase();
  return T.filter(t => (!actif || t.ticker === actif) && (!depuis || t.tFerm >= depuis) && (!sens || t.sens === sens) && (!resultat || (resultat === 'gagnant' ? t.pnl > 0 : t.pnl < 0)) && (!q || `${t.id} ${t.ticker} ${t.instrument} ${t.commentaire} ${t.origine}`.toLowerCase().includes(q)));
}
export function trier(T, cle = 'tFerm', sensTri = -1) { const f = { tFerm: t => t.tFerm, tOuv: t => t.tOuv, pnl: t => t.pnl, r: t => (t.r == null ? -Infinity : t.r), duree: t => t.duree, volume: t => t.volume, ticker: t => t.ticker }[cle] || (t => t.tFerm); return [...T].sort((a, b) => (f(a) > f(b) ? 1 : f(a) < f(b) ? -1 : 0) * sensTri); }
export const formatDuree = ms => { if (!Number.isFinite(ms)) return '—'; const m = Math.round(ms / 60e3); if (m < 1) return '< 1 min'; if (m < 60) return m + ' min'; const h = Math.floor(m / 60); if (h < 24) return h + ' h ' + String(m % 60).padStart(2, '0'); const j = Math.floor(h / 24); return j + ' j ' + (h % 24) + ' h'; };
