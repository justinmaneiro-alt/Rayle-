/* ═════════════ PROPOSITIONS H1 (pur, testé) ═════════════
   À la CLÔTURE d'une bougie H1 seulement (jamais de repaint : on n'évalue que la dernière bougie close, jamais la bougie en cours). Pas de proposition en régime de range : il faut une tendance H1 établie
   (SMA20 > SMA50, clôture > SMA50, SMA50 en hausse — ou l'inverse) et assez d'espace jusqu'à une cible sur un niveau de structure (≥ 2 ATR). Stop ≥ 1 ATR H1.
   Les chiffres de preuve (R net, nombre de trades, taux de réussite, période) viennent TOUS de la recherche (recherche-or-donnees.json, 2015–2019, frais déduits) : aucun chiffre inventé.
   Étiquettes : « Validé » (tous les critères de la recherche passés), « À l'étude » (R net positif dans le scénario CFD sur ≥ 100 trades mais critères non tous passés), « Lecture » (le reste). Jamais un ordre. */
export const TYPES = Object.freeze({
  repli: { nom: 'Repli dans la tendance', variante: 'f1', texte: 'tendance H1 établie, la bougie touche la SMA20 et repart dans le sens de la tendance' },
  cassure: { nom: 'Cassure de 20 bougies', variante: 'd1', texte: 'clôture au-delà du plus haut/bas des 20 dernières bougies, dans le sens de la tendance' },
  demarrage: { nom: 'Démarrage confirmé', variante: 'p2', texte: 'bougie à gros corps (≥ 1 ATR) et gros volume qui clôture au-delà d\'un niveau de structure, dans le sens de la tendance' },
  rejet: { nom: 'Rejet sur niveau de structure', variante: 'g1', texte: 'mèche sur le plus haut/bas de la veille puis clôture de l\'autre côté, dans le sens de la tendance' },
  vwap: { nom: 'Continuation au VWAP', variante: 'i3', texte: 'repli jusqu\'au VWAP de séance puis reprise dans le sens de la tendance' }
});
export const MIN_ESPACE_ATR = 2, STOP_ATR = 1.5, STOP_MAX_ATR = 2.5, PORTEE_ATR = 6, SORTIE_BOUGIES = 6;
const sma = (a, i, n) => { if (i < n - 1) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += a[k]; return s / n; };
export function atr14(B, i) { if (i < 14) return null; let s = 0; for (let k = i - 13; k <= i; k++) s += Math.max(B[k].h - B[k].l, Math.abs(B[k].h - B[k - 1].c), Math.abs(B[k].l - B[k - 1].c)); return s / 14; }
/* régime à la clôture de la bougie i : 1 haussier, −1 baissier, 0 range */
export function regime(B, i = B.length - 1) {
  if (i < 60) return { sens: 0, raison: 'pas assez de bougies H1' }; const c = B.map(b => b.c), s20 = sma(c, i, 20), s50 = sma(c, i, 50), s50b = sma(c, i - 10, 50);
  if (s20 > s50 && c[i] > s50 && s50 > s50b) return { sens: 1, raison: 'tendance H1 haussière établie' }; if (s20 < s50 && c[i] < s50 && s50 < s50b) return { sens: -1, raison: 'tendance H1 baissière établie' };
  return { sens: 0, raison: 'régime de range (pas de tendance H1 établie) : aucune proposition' };
}
export const etiquette = v => (!v ? 'Lecture' : v.statut === 'Validé' ? 'Validé' : v.rNetCfd != null && v.rNetCfd > 0 && v.trades >= 100 ? 'À l\'étude' : 'Lecture');
export function preuve(type, donnees) {
  const id = TYPES[type] && TYPES[type].variante, v = donnees && donnees.variantes && donnees.variantes.find(x => x.id === id); if (!v) return null;
  return { variante: v.id, libelle: v.libelle, trades: v.trades, rBrut: v.rBrut, rNetCfd: v.rNetCfd, rNetKraken: v.rNetKraken, rNetPire: v.rNetPire, tauxReussite: v.tauxReussite, anneesRentables: v.anneesRentables, pHolm: v.pHolm, statut: v.statut, periode: donnees.periodes && donnees.periodes.validation, frais: donnees.frais, note: 'chiffres de la recherche (stop 1,5 ATR, sortie par temps à 6 bougies), pas ceux de cette proposition' };
}
/* niveaux de structure : [{ p, nom }] ; la cible est le premier niveau au-delà du prix, à ≥ MIN_ESPACE_ATR et ≤ PORTEE_ATR */
export function choisirCible(sens, entree, atr, niveaux) {
  const L = niveaux.filter(n => Number.isFinite(n.p) && sens * (n.p - entree) >= MIN_ESPACE_ATR * atr && sens * (n.p - entree) <= PORTEE_ATR * atr).sort((a, b) => sens * (a.p - b.p)); return L[0] || null;
}
/* détecte les propositions à la clôture de la dernière bougie de B (B = bougies H1 CLOSES, Kraken). ctx : { niveaux: [{p,nom}] (structure), vwap (valeur à la bougie précédente ou null), donnees (recherche) } */
export function detecter(B, ctx = {}) {
  const i = B.length - 1, R = regime(B, i), out = []; if (i < 60 || !R.sens) return { propositions: out, regime: R };
  const a = atr14(B, i); if (!(a > 0)) return { propositions: out, regime: R }; const b = B[i], d = R.sens, s20 = sma(B.map(x => x.c), i, 20), niv = ctx.niveaux || [];
  const hi20 = Math.max(...B.slice(i - 20, i).map(x => x.h)), lo20 = Math.min(...B.slice(i - 20, i).map(x => x.l)), hiPrec = Math.max(...B.slice(i - 21, i - 1).map(x => x.h)), loPrec = Math.min(...B.slice(i - 21, i - 1).map(x => x.l));
  const vols = B.slice(i - 20, i).map(x => x.v || 0).sort((x, y) => x - y), medV = (vols[9] + vols[10]) / 2, corps = Math.abs(b.c - b.o), rng = Math.max(1e-9, b.h - b.l);
  const types = [];
  if (d > 0 ? b.l <= s20 && b.c > s20 && b.c > b.o : b.h >= s20 && b.c < s20 && b.c < b.o) types.push('repli');
  if (d > 0 ? b.c > hi20 && !(B[i - 1].c > hiPrec) : b.c < lo20 && !(B[i - 1].c < loPrec)) types.push('cassure');
  const lv24 = d > 0 ? hi20 : lo20, lvJ = niv.filter(n => /veille|semaine/.test(n.nom)).map(n => n.p);
  if (corps >= a && medV > 0 && b.v > medV && [lv24, ...lvJ].some(L => d > 0 ? b.c > L && B[i - 1].c <= L : b.c < L && B[i - 1].c >= L)) types.push('demarrage');
  const vj = niv.filter(n => /veille/.test(n.nom)).map(n => n.p); if (vj.some(L => d > 0 ? b.l < L && b.c > L && (Math.min(b.o, b.c) - b.l) / rng >= 0.5 : b.h > L && b.c < L && (b.h - Math.max(b.o, b.c)) / rng >= 0.5)) types.push('rejet');
  if (ctx.vwap != null && (d > 0 ? b.l <= ctx.vwap && b.c > ctx.vwap && b.c > b.o : b.h >= ctx.vwap && b.c < ctx.vwap && b.c < b.o)) types.push('vwap');
  for (const type of types) {
    const entree = b.c, stopDist = Math.min(STOP_MAX_ATR * a, Math.max(STOP_ATR * a, d > 0 ? entree - b.l + 0.1 * a : b.h - entree + 0.1 * a)), stop = entree - d * stopDist;
    const cible = choisirCible(d, entree, a, niv.filter(n => Math.abs(n.p - entree) > 1e-9)); if (!cible) { out.push({ ignoree: true, type, raison: 'pas assez d\'espace jusqu\'à un niveau de structure (cible ≥ 2 ATR)' }); continue; }
    const prf = preuve(type, ctx.donnees), etq = etiquette(prf);
    out.push({ id: `${b.t}|${type}|${d}`, t: b.t, tCloture: b.t + 3600e3, type, nom: TYPES[type].nom, texte: TYPES[type].texte, sens: d > 0 ? 'achat' : 'vente', d, entree, stop, cible: cible.p, niveauCible: cible.nom, atr: a, stopAtr: stopDist / a, rBrut: Math.abs(cible.p - entree) / stopDist, etiquette: etq, preuve: prf, regime: R.raison });
  }
  return { propositions: out, regime: R };
}
/* résultat d'une proposition PLUS TARD : 6 bougies H1 closes après la clôture (stop avant cible dans une même bougie : hypothèse défavorable). B = bougies H1 closes. null tant que pas résolue. */
export function resoudre(p, B) {
  const k = B.findIndex(x => x.t === p.t); if (k < 0) return null; const apres = B.slice(k + 1, k + 1 + SORTIE_BOUGIES), dist = Math.abs(p.entree - p.stop);
  for (const x of apres) { if (p.d > 0 ? x.l <= p.stop : x.h >= p.stop) return { issue: 'stop', R: -1, t: x.t }; if (p.d > 0 ? x.h >= p.cible : x.l <= p.cible) return { issue: 'cible', R: Math.abs(p.cible - p.entree) / dist, t: x.t }; }
  if (apres.length < SORTIE_BOUGIES) return null; const der = apres[apres.length - 1]; return { issue: 'temps', R: p.d * (der.c - p.entree) / dist, t: der.t };
}
export const texteStatut = (donnees, propositions = []) => {
  const val = (donnees && donnees.retenues) || [];
  if (!donnees) return 'Résultats de la recherche indisponibles : toutes les propositions sont de simples lectures.';
  if (!val.length) return 'Aucun type de setup n\'est validé par la recherche (2003–2019, frais déduits) : ce sont des lectures de structure, pas des signaux.';
  return `Types validés par la recherche : ${val.join(', ')}.`;
};
export const phrase = p => `${p.nom} (${p.etiquette}) : ${p.sens === 'achat' ? 'lecture haussière' : 'lecture baissière'}, entrée vers ${p.entree.toFixed(2)}, stop ${p.stop.toFixed(2)}, cible ${p.cible.toFixed(2)} (${p.niveauCible}), ${p.rBrut.toFixed(1)} R brut.`;
