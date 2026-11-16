/* ═════════════ SCORE DE MARCHÉ « façon grands fonds » : composite de −100 (très baissier) à +100 (très haussier) par actif (module PUR, testé) ═════════════
   Six composantes, chacune notée de −1 à +1 puis pondérée ; une composante sans donnée est SORTIE du calcul (les poids des autres sont renormalisés) et la « confiance » du score baisse d'autant.
   Rien n'est inventé : pas de donnée = composante marquée « indisponible » avec la raison. Le score DÉCRIT l'état du marché, il ne prévoit rien et n'est pas un conseil.
   Poids : Tendance 30 · Momentum 20 · Positionnement COT 15 · Macro 15 · Volatilité 10 · Flux de volume 10 (points sur 100 ; flux estimé = moitié du poids). */
import { tendance, rsi, atr, sma, dernier, ecartType, moyenne } from './analyse.js';
import { analyserCot } from '../marches/cot.js';

export const COMPOSANTS = Object.freeze([
  { id: 'tendance', nom: 'Tendance', poids: 30, regle: 'H1 (poids 20), H4 (30) et Jour (50) : tendance (prix et pente de la MA50 contre la MA200) et position du prix par rapport à la MA200 en ATR.' },
  { id: 'momentum', nom: 'Momentum', poids: 20, regle: 'RSI 14 du Jour (40), RSI 14 du H4 (20) et variation sur 20 jours rapportée à la volatilité (40).' },
  { id: 'cot', nom: 'Positionnement COT', poids: 15, regle: 'COT Index des fonds spéculatifs (0-100) autour de 50, variation de la semaine ; un extrême (≥ 80 ou ≤ 20) est amorti de moitié (position déjà très chargée).' },
  { id: 'macro', nom: 'Macro', poids: 15, regle: 'Or : taux réels 10 ans et dollar (DXY), sur 20 séances. Nasdaq 100 / S&P 500 : taux 10 ans. Bitcoin / Solana : dollar et taux 10 ans. Hausse des taux ou du dollar = négatif.' },
  { id: 'volatilite', nom: 'Volatilité', poids: 10, regle: 'Volatilité réalisée sur 20 jours contre sa moyenne sur 1 an : au-dessus de la normale = marché tendu (négatif), en dessous = calme (positif).' },
  { id: 'flux', nom: 'Flux de volume', poids: 10, regle: 'Volume net acheteur − vendeur sur 5 jours rapporté au volume total : acheteurs agresseurs en excès = positif. Données réelles quand elles existent (Binance), sinon estimation (moitié du poids).' }
]);
const poidsDe = id => COMPOSANTS.find(c => c.id === id).poids;
export const clip = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));
const th = x => Math.tanh(x);
const fr = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ') : '—');
const sg = (v, d = 2) => (v > 0 ? '+' : v < 0 ? '−' : '') + fr(Math.abs(v), d);
const c = (id, valeur, detail, note = null, poidsEff = null) => ({ id, nom: COMPOSANTS.find(x => x.id === id).nom, poids: poidsDe(id), valeur: Number.isFinite(valeur) ? clip(valeur) : null, dispo: Number.isFinite(valeur), detail, note, poidsEff: poidsEff == null ? poidsDe(id) : poidsEff });
const indispo = (id, raison) => ({ ...c(id, null, [], raison), dispo: false });

/* ── 1. tendance : B = { H1, H4, J } (bougies) ── */
export function compTendance(B, prix) {
  const W = { J: 0.5, H4: 0.3, H1: 0.2 }, NOM = { J: 'Jour', H4: 'H4', H1: 'H1' }, det = []; let s = 0, w = 0;
  for (const u of ['J', 'H4', 'H1']) {
    const X = B[u] || []; if (X.length < 60) { det.push(`${NOM[u]} : pas assez de bougies (${X.length})`); continue; }
    const T = tendance(X), sens = T.sens === 'haussière' ? 1 : T.sens === 'baissière' ? -1 : 0, M = dernier(sma(X.map(b => b.c), 200)), a = dernier(atr(X, 14)), px = Number.isFinite(prix) ? prix : X[X.length - 1].c;
    const pos = M != null && a ? th((px - M) / (2 * a)) : null, v = pos == null ? sens : 0.5 * sens + 0.5 * pos;
    det.push(`${NOM[u]} : ${T.sens}${M != null && a ? `, prix ${sg((px - M) / a, 1)} ATR de la MA200` : ' (MA200 indisponible)'} → ${sg(v)}`); s += W[u] * v; w += W[u];
  }
  return w ? c('tendance', s / w, det) : indispo('tendance', 'pas assez de bougies');
}
/* ── 2. momentum ── */
export function compMomentum(B) {
  const J = B.J || [], H4 = B.H4 || []; if (J.length < 60) return indispo('momentum', 'pas assez de bougies Jour');
  const det = [], parts = []; const rj = dernier(rsi(J.map(b => b.c), 14)), a = dernier(atr(J, 14));
  if (rj != null) { const v = clip((rj - 50) / 25); det.push(`RSI 14 Jour ${fr(rj, 0)} → ${sg(v)}`); parts.push([0.4, v]); }
  const r4 = H4.length > 60 ? dernier(rsi(H4.map(b => b.c), 14)) : null; if (r4 != null) { const v = clip((r4 - 50) / 25); det.push(`RSI 14 H4 ${fr(r4, 0)} → ${sg(v)}`); parts.push([0.2, v]); }
  if (J.length > 21 && a) { const v = th((J[J.length - 1].c - J[J.length - 21].c) / (a * Math.sqrt(20))); det.push(`variation sur 20 jours ${sg((J[J.length - 1].c / J[J.length - 21].c - 1) * 100, 1)} % → ${sg(v)}`); parts.push([0.4, v]); }
  const w = parts.reduce((x, p) => x + p[0], 0); return w ? c('momentum', parts.reduce((x, p) => x + p[0] * p[1], 0) / w, det) : indispo('momentum', 'indicateurs indisponibles');
}
/* ── 3. COT : `an` = résultat de analyserCot ── */
export function compCot(an) {
  const d = an && an.dernier; if (!d || d.indexSpec == null) return indispo('cot', an ? 'historique COT trop court (moins d’un an)' : 'données COT indisponibles pour cet actif');
  const idx = d.indexSpec, base = (idx - 50) / 50, ext = d.extremeSpec, v0 = ext ? base * 0.5 : base, oi = d.oi, vv = oi ? clip((d.varSpec || 0) / oi * 25) : 0, v = 0.75 * v0 + 0.25 * vv;
  return c('cot', v, [`COT Index des fonds ${fr(idx, 1)} sur 100 → ${sg(base)}${ext ? ' (extrême ' + (ext === 'haut' ? 'acheteur' : 'vendeur') + ' : amorti de moitié)' : ''}`, `variation de la semaine ${d.varSpec == null ? '—' : sg(d.varSpec, 0)} contrats → ${sg(vv)}`], `mesure du ${d.date}`);
}
/* ── 4. macro : M = { reel10: [{t,v}], us10: [{t,v}], dxy: [{t,c}] } (séries quotidiennes) ── */
const variation = (S, n, cle = 'v', relatif = false) => { const L = (S || []).filter(p => Number.isFinite(p[cle])); if (L.length <= n) return null; const a = L[L.length - 1 - n][cle], b = L[L.length - 1][cle]; return relatif ? (b / a - 1) * 100 : b - a; };
export function compMacro(id, M) {
  M = M || {}; const det = [], parts = [];
  const reel = variation(M.reel10, 20), us10 = variation(M.us10, 20), dxy = variation(M.dxy, 20, 'c', true);
  const addReel = () => { if (reel != null) { const v = -th(reel / 0.25); det.push(`taux réel 10 ans ${sg(reel, 2)} point sur 20 séances → ${sg(v)}`); parts.push(v); } };
  const addUs10 = () => { if (us10 != null) { const v = -th(us10 / 0.30); det.push(`taux US 10 ans ${sg(us10, 2)} point sur 20 séances → ${sg(v)}`); parts.push(v); } };
  const addDxy = () => { if (dxy != null) { const v = -th(dxy / 2); det.push(`dollar (DXY) ${sg(dxy, 1)} % sur 20 séances → ${sg(v)}`); parts.push(v); } };
  if (id === 'or') { addReel(); if (reel == null) addUs10(); addDxy(); }
  else if (id === 'us100' || id === 'us500') addUs10();
  else if (id === 'btc' || id === 'sol') { addDxy(); addUs10(); }
  else return indispo('macro', 'pas de lecture macro définie pour cet actif');
  return parts.length ? c('macro', moyenne(parts), det, id === 'or' && reel == null ? 'taux réels indisponibles : taux nominaux utilisés' : null) : indispo('macro', 'séries de taux / dollar indisponibles');
}
/* ── 5. volatilité ── */
export function compVolatilite(J, ann = 252) {
  if (!J || J.length < 120) return indispo('volatilite', 'pas assez de bougies Jour');
  const r = []; for (let i = 1; i < J.length; i++) if (J[i - 1].c > 0 && J[i].c > 0) r.push(Math.log(J[i].c / J[i - 1].c));
  const v20 = ecartType(r.slice(-20)), v250 = ecartType(r.slice(-250)); if (!v250) return indispo('volatilite', 'volatilité nulle');
  const ratio = v20 / v250, v = clip(-(ratio - 1) * 1.5);
  return c('volatilite', v, [`volatilité 20 jours ${fr(v20 * Math.sqrt(ann) * 100, 1)} % par an contre ${fr(v250 * Math.sqrt(ann) * 100, 1)} % sur 1 an (rapport ${fr(ratio, 2)}) → ${sg(v)}`]);
}
/* ── 6. flux : F = { source: 'reel' | 'estimation' | null, unite, jours: [{ t, net, total }] } ── */
export function compFlux(F) {
  if (!F || !F.jours || F.jours.length < 5 || !F.source) return indispo('flux', F && F.raison ? F.raison : 'données acheteur / vendeur indisponibles');
  const L = F.jours.slice(-5), net = L.reduce((s, x) => s + x.net, 0), tot = L.reduce((s, x) => s + x.total, 0); if (!(tot > 0)) return indispo('flux', 'volume nul');
  const rel = net / tot, v = clip(rel * 4), est = F.source !== 'reel';
  return c('flux', v, [`volume net 5 jours ${sg(rel * 100, 1)} % du volume total → ${sg(v)}`], est ? 'estimation (pas de données acheteur / vendeur réelles) : poids divisé par deux' : 'données réelles acheteur / vendeur (agresseurs)', est ? poidsDe('flux') / 2 : poidsDe('flux'));
}

export function libelleScore(s) {
  if (s == null) return 'indéterminé';
  return s <= -60 ? 'très baissier' : s <= -25 ? 'baissier' : s <= -10 ? 'plutôt baissier' : s < 10 ? 'neutre' : s < 25 ? 'plutôt haussier' : s < 60 ? 'haussier' : 'très haussier';
}
/* assemble : D = { id, B: {H1,H4,J}, prix, cot (analyserCot), macro, flux, ann } */
export function scoreMarche(D) {
  const comps = [compTendance(D.B || {}, D.prix), compMomentum(D.B || {}), compCot(D.cot), compMacro(D.id, D.macro), compVolatilite((D.B || {}).J, D.ann || 252), compFlux(D.flux)];
  const dispo = comps.filter(x => x.dispo), W = dispo.reduce((s, x) => s + x.poidsEff, 0), total = comps.reduce((s, x) => s + x.poids, 0);
  for (const x of comps) { x.part = x.dispo && W ? x.poidsEff / W : 0; x.points = x.dispo && W ? 100 * x.part * x.valeur : null; }
  const score = W ? Math.round(dispo.reduce((s, x) => s + x.points, 0)) : null;
  return { score, libelle: libelleScore(score), confiance: dispo.reduce((s, x) => s + x.poidsEff, 0) / total, composants: comps, manquants: comps.filter(x => !x.dispo).map(x => x.nom) };
}

/* historique du score sur les `jours` derniers jours, SANS regard vers l'avenir : à chaque date, seules les données connues ce jour-là (Daily : tendance, momentum, volatilité ; COT publié ; macro).
   H1 / H4 et le flux de volume n'ont pas d'historique long : ils sont absents de cette courbe (elle le dit). */
export function historiqueScore(D, { jours = 120, pas = 2 } = {}) {
  const J = (D.B || {}).J || []; if (J.length < 300) return [];
  const out = [], cotSerie = D.cotBrut && Array.isArray(D.cotBrut.serie) ? D.cotBrut.serie : null;
  for (let k = J.length - jours; k < J.length; k += pas) {
    if (k < 260) continue; const t = J[k].t, Jk = J.slice(Math.max(0, k - 400), k + 1);
    const cotK = cotSerie ? analyserCot({ ...D.cotBrut, serie: cotSerie.filter(x => Date.parse(x.date) + 3 * 86400e3 <= t) }) : null;
    const cut = S => (S || []).filter(p => p.t <= t), M = D.macro ? { reel10: cut(D.macro.reel10), us10: cut(D.macro.us10), dxy: cut(D.macro.dxy) } : null;
    const S = scoreMarche({ id: D.id, B: { J: Jk }, prix: Jk[Jk.length - 1].c, cot: cotK, macro: M, flux: null, ann: D.ann });
    if (S.score != null) out.push({ t, score: S.score });
  }
  return out;
}

/* phrase de Rayle, en clair (lue à voix haute) */
export function phraseScore(nom, S) {
  if (!S || S.score == null) return `Je ne peux pas calculer de score de marché pour ${nom} : il manque trop de données.`;
  const dispo = S.composants.filter(x => x.dispo), haut = [...dispo].sort((a, b) => b.points - a.points), bas = [...dispo].sort((a, b) => a.points - b.points);
  const pt = x => `${x.nom.toLowerCase()} (${sg(x.points, 0)} points)`, P = [`Le score de marché de ${nom} est de ${sg(S.score, 0)} sur 100 : ${S.libelle}.`];
  const pos = haut.filter(x => x.points > 2).slice(0, 2), neg = bas.filter(x => x.points < -2).slice(0, 2);
  if (pos.length) P.push('Ce qui le soutient : ' + pos.map(pt).join(' et ') + '.'); if (neg.length) P.push('Ce qui le pèse : ' + neg.map(pt).join(' et ') + '.');
  if (!pos.length && !neg.length) P.push('Aucune composante ne domine : les signaux se compensent.');
  P.push(S.manquants.length ? `Confiance ${Math.round(S.confiance * 100)} pour cent : ${S.manquants.map(x => x.toLowerCase()).join(' et ')} ${S.manquants.length > 1 ? 'sont indisponibles' : 'est indisponible'}.` : 'Toutes les composantes sont disponibles.');
  P.push('C’est une photographie du marché, pas une prévision ni un conseil.');
  return P.join(' ');
}
