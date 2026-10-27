import { simuler, evaluerBougie, fusionConfig, ouvrirPosition, resultatPosition, semaineUTC, statistiques } from '../agent-btc/moteur.js';
import { simulerSuiveur } from '../agent-m6c/simulateur-suiveur.js';
import { signauxMS, masqueSortie } from './signaux-ms.js';

/* ═════════════ SIMULATION D'UNE STRATÉGIE DE L'UTILISATRICE (V1 ; module pur, testé : ms-moteur-test.mjs) ═════════════
   Réutilise EXACTEMENT les briques d'exécution du moteur de backtest (moteur.js : ouverture à la bougie suivante, spread, glissement, frais, stop prioritaire si stop et objectif sont touchés
   dans la même bougie, gap, une position à la fois, repos, maximum par semaine, position ouverte à la fin des données non comptée) :
   · sortie « objectif en R » → moteur.js `simuler` ; · sortie « stop suiveur » → simulateur-suiveur.js ; · sortie « signal » → boucle ci-dessous (la condition de sortie est lue à la clôture de la bougie j,
   la sortie se fait à l'OUVERTURE de j + 1, au marché : même coût que la sortie « temps » du moteur). Aucun regard vers le futur. */
export const CONFIG_MS = Object.freeze({ maxParSemaine: 10, reposBarres: 8, maxBarres: 576 });   // 10 positions par semaine au plus, repos de 2 h, 6 jours de détention au plus (sortie sur signal)

export function simulerSortieSignal(m15, signaux, masquesSortie, config = {}, plage = {}) {
  const cfg = fusionConfig({ ...CONFIG_MS, ...config }), { o, h, l, c, t } = m15, n = m15.n, de = Math.max(0, plage.de || 0), a = Math.min(n, plage.a == null ? n : plage.a);
  const { sens, stop: niveauStop } = signaux, slip = cfg.glissementPct / 100, demi = cfg.spreadPct / 200;
  const trades = []; let i = de, prochain = de, semaine = -1, nSemaine = 0, tronque = false;
  while (i < a - 1) {
    if (i < prochain || sens[i] === 0) { i++; continue; }
    const s = sens[i], e = i + 1, sem = semaineUTC(t[e]); if (sem !== semaine) { semaine = sem; nSemaine = 0; }
    if (nSemaine >= cfg.maxParSemaine) { i++; continue; }
    const pos = ouvrirPosition(cfg, s, o[e], niveauStop[i], 1);
    if (!pos) { i++; continue; }
    pos.cible = s > 0 ? Infinity : -Infinity; nSemaine++;
    const sortieM = masquesSortie[s]; let sortie = -1, ex = null;
    for (let j = e; j < a; j++) {
      ex = evaluerBougie(cfg, pos, { o: o[j], h: h[j], l: l[j], c: c[j] }, j === e, j - e + 1);
      if (ex) { sortie = j; break; }
      if (sortieM[j] && j + 1 < a) { ex = { prix: o[j + 1] * (1 - s * (slip + demi)), motif: 'signal' }; sortie = j + 1; break; }   // lu à la clôture de j, exécuté à l'ouverture de j + 1
    }
    if (sortie < 0) { tronque = true; break; }
    const r = resultatPosition(cfg, pos, ex.prix);
    trades.push({ signal: i, entree: e, sortie, t: t[e], tSortie: t[sortie], sens: s, prixEntree: pos.fill, stop: pos.stop, cible: null, prixSortie: ex.prix, motif: ex.motif, R: r.R, Rbrut: r.Rbrut, coutsR: r.coutsR, distancePct: pos.pct, barres: sortie - e + 1 });
    prochain = sortie + cfg.reposBarres; i = Math.max(sortie, i + 1);
  }
  return { trades, tronque, config: cfg };
}

/* Simule une stratégie sur [de, a). `signaux` peut être fourni (entrées aléatoires de la comparaison). */
export function simulerMS(ctx, strat, config = {}, plage = {}, signaux = null) {
  const sig = signaux || signauxMS(ctx, strat), so = strat.sortie, cfg = { ...CONFIG_MS, ...config };
  if (so.type === 'cible_R') return simuler(ctx.m15, { sens: sig.sens, stop: sig.stop, R: so.R }, cfg, plage);
  if (so.type === 'suiveur') return simulerSuiveur(ctx.m15, { sens: sig.sens, stop: sig.stop, suivi: sig.suivi }, { ...cfg, maxBarres: 1344 }, plage);
  const masques = { 1: masqueSortie(ctx, strat, 1), [-1]: masqueSortie(ctx, strat, -1) };
  return simulerSortieSignal(ctx.m15, sig, masques, cfg, plage);
}
export { statistiques };
