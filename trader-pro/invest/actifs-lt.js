/* ═════════════ AUTRES ACTIFS LONG TERME : or, S&P 500, Nasdaq 100, Bitcoin, Solana (module PUR, testé) ═════════════
   Pas de comptes d'entreprise pour ces actifs : repères de LONG TERME fondés sur le prix lui-même.
   - Distance à la moyenne mobile de 200 SEMAINES (≈ 4 ans) : repère classique de valorisation de long terme ; on la situe dans SON PROPRE historique (centile).
   - Multiple de Mayer (prix / MA200 jours), repère historique du Bitcoin : < 1 = bon marché, > 2,4 = cher.
   - Recul depuis le plus haut historique.
   Badge PAS CHER / PRIX JUSTE / CHER : centile de la distance à la MA200 semaines (≤ 30 % pas cher, ≥ 70 % cher) ; pour le Bitcoin, moyenné avec le Mayer.
   Estimation descriptive, pas un conseil. Série d'entrée : [{ d, t, c }] clôtures journalières (voir series.js). */
import { sma } from '../commun/analyse.js';

export const ACTIFS_LT = Object.freeze([
  { id: 'or', nom: 'Or', jour: 'XAUUSD', cot: 'OR', mayer: false }, { id: 'us500', nom: 'S&P 500', jour: 'US500', mayer: false }, { id: 'us100', nom: 'Nasdaq 100', jour: 'US100', mayer: false },
  { id: 'btc', nom: 'Bitcoin', jour: 'BTC', mayer: true }, { id: 'sol', nom: 'Solana', jour: 'SOL', mayer: true }
]);
const SEMAINE = 7 * 86400e3, fin = x => typeof x === 'number' && Number.isFinite(x);
/* clôtures hebdomadaires (dernière clôture de chaque semaine ISO, lundi → dimanche UTC) */
export function enSemaines(S) {
  const m = new Map(); for (const x of S || []) { if (!(x.c > 0)) continue; const j = Math.floor((x.t - 4 * 86400e3) / SEMAINE); m.set(j, { t: x.t, c: x.c }); }   // le 1er janvier 1970 est un jeudi : décalage de 4 jours pour démarrer à lundi
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}
export const centile = (valeurs, x) => { const L = valeurs.filter(fin); return L.length ? L.filter(v => v <= x).length / L.length : null; };
export const BADGE_LT = Object.freeze({ PAS: 'PAS CHER', JUSTE: 'PRIX JUSTE', CHER: 'CHER', ND: 'N/D' });
export function analyserActifLT(def, S) {
  const base = { id: def.id, nom: def.nom, badge: BADGE_LT.ND, avertissements: [], reperes: [] };
  if (!S || S.length < 300) return { ...base, avertissements: ['historique trop court'] };
  const W = enSemaines(S), prix = S[S.length - 1].c, tPrix = S[S.length - 1].t, mmW = sma(W.map(x => x.c), 200), mmJ = sma(S.map(x => x.c), 200), mJ = mmJ[mmJ.length - 1];
  const dW = W.map((x, i) => (mmW[i] ? x.c / mmW[i] - 1 : null)), dActuelle = dW[dW.length - 1], hist = dW.filter(fin), ath = Math.max(...S.map(x => x.c)), mayer = mJ ? prix / mJ : null;
  const res = { ...base, prix, tPrix, ma200s: mmW[mmW.length - 1], distance200s: dActuelle, centile: dActuelle == null ? null : centile(hist, dActuelle), mayer, ma200j: mJ, ath, recul: prix / ath - 1, semaines: W.length };
  if (dActuelle == null) base.avertissements.push('moins de 200 semaines d’historique : MA200 semaines indisponible'); else if (hist.length < 100) base.avertissements.push('peu de points d’historique pour situer la distance (' + hist.length + ' semaines)');
  const scores = []; if (res.centile != null && hist.length >= 52) scores.push(res.centile);
  if (def.mayer && mayer != null) scores.push(mayer <= 1 ? 0.1 : mayer >= 2.4 ? 0.9 : 0.1 + 0.8 * (mayer - 1) / 1.4);
  if (scores.length) { const s = scores.reduce((a, b) => a + b, 0) / scores.length; res.score = s; res.badge = s <= 0.30 ? BADGE_LT.PAS : s >= 0.70 ? BADGE_LT.CHER : BADGE_LT.JUSTE; }
  res.reperes = [
    { nom: 'Distance à la MA200 semaines', valeur: dActuelle, format: 'pct', detail: dActuelle == null ? 'indisponible' : `MA200 semaines ${res.ma200s.toFixed(res.ma200s >= 100 ? 0 : 2)} ; centile ${(res.centile * 100).toFixed(0)} % dans son historique (${hist.length} semaines)` },
    { nom: 'Multiple de Mayer (prix / MA200 jours)', valeur: mayer, format: 'x', detail: mayer == null ? 'indisponible' : `MA200 jours ${mJ.toFixed(mJ >= 100 ? 0 : 2)} ; repère du Bitcoin : < 1 bon marché, > 2,4 cher${def.mayer ? '' : ' (donné à titre indicatif)'}` },
    { nom: 'Recul depuis le plus haut', valeur: res.recul, format: 'pct', detail: `plus haut historique ${ath.toFixed(ath >= 100 ? 0 : 2)}` }];
  res.histo = { semaines: W.slice(-260).map(x => [x.t, x.c]), ma200s: W.slice(-260).map((x, i, a) => [x.t, mmW[W.length - a.length + i]]).filter(p => fin(p[1])) };
  return res;
}
export function phraseActifLT(a) {
  if (a.badge === BADGE_LT.ND) return `Je ne peux pas situer ${a.nom} sur le long terme : ${a.avertissements[0] || 'données insuffisantes'}.`;
  const d = a.distance200s == null ? null : (a.distance200s * 100).toFixed(0), P = [`${a.nom} est jugé ${a.badge.toLowerCase()} sur le long terme.`];
  if (d != null) P.push(`Le prix est ${a.distance200s >= 0 ? 'au-dessus' : 'sous'} de ${Math.abs(d)} pour cent de sa moyenne à deux cents semaines, ce qui le place au ${(a.centile * 100).toFixed(0)}ᵉ centile de son historique.`);
  if (a.mayer != null && /Bitcoin|Solana/.test(a.nom)) P.push(`Le multiple de Mayer est de ${a.mayer.toFixed(2).replace('.', ',')}.`);
  P.push('C’est un repère de valorisation relative à son propre passé, pas une prévision ni un conseil.'); return P.join(' ');
}
