import { evaluerBougie, fusionConfig, ouvrirPosition, resultatPosition, semaineUTC, statistiques } from '../agent-btc/moteur.js';

/* ═════════════ SIMULATEUR AVEC STOP SUIVEUR (M6c ; module pur, testé : m6c-simulateur-test.mjs) ═════════════
   Même exécution que moteur.js (mêmes briques : ouvrirPosition, evaluerBougie, resultatPosition → ce qui est testé est ce qui tourne) mais la sortie peut être un STOP SUIVEUR :
   - le signal naît à la clôture de la bougie i, l'entrée est à l'ouverture de i + 1 (spread et glissement défavorables), frais déduits, UNE position à la fois ;
   - le stop initial est celui du signal ; ensuite, à la fin de chaque bougie sans sortie, le stop monte (long) ou descend (court) à « extrême atteint − distance de suivi » et ne recule JAMAIS ;
     le nouveau stop ne vaut qu'à partir de la bougie suivante (aucune information de la bougie en cours n'est utilisée avant sa fin) ;
   - objectif facultatif (cible absolue, NaN = aucun : on laisse courir) ; stop et objectif dans la même bougie → le stop est compté (hypothèse prudente) ;
   - le résultat est en R : multiple de la distance du stop INITIAL (risque pris).
   signaux = { sens: Int8Array, stop: Float64Array, cible?: Float64Array (NaN = aucune), suivi?: Float64Array (distance de suivi en prix, 0/NaN = aucun), etiq?: Uint8Array, regime?: Uint8Array }. */
export const CONFIG_SUIVEUR = Object.freeze({ maxBarres: 1344, maxParSemaine: 7, reposBarres: 16 });   // 14 jours de détention au plus
export function simulerSuiveur(m15, signaux, config = {}, plage = {}) {
  const cfg = fusionConfig({ ...CONFIG_SUIVEUR, ...config }), { o, h, l, c, t } = m15, n = m15.n, de = Math.max(0, plage.de || 0), a = Math.min(n, plage.a == null ? n : plage.a);
  const { sens, stop: niveauStop, cible, suivi, etiq, regime } = signaux;
  const trades = []; let i = de, prochain = de, semaine = -1, nSemaine = 0, tronque = false;
  while (i < a - 1) {
    if (i < prochain || sens[i] === 0) { i++; continue; }
    const s = sens[i], e = i + 1, sem = semaineUTC(t[e]); if (sem !== semaine) { semaine = sem; nSemaine = 0; }
    if (nSemaine >= cfg.maxParSemaine) { i++; continue; }
    const pos = ouvrirPosition(cfg, s, o[e], niveauStop[i], 1);
    if (!pos) { i++; continue; }
    const cb = cible && Number.isFinite(cible[i]) ? cible[i] : null; pos.cible = cb != null ? cb : (s > 0 ? Infinity : -Infinity);
    const dsv = suivi && suivi[i] > 0 ? suivi[i] : 0, stopInitial = pos.stop; let ext = pos.fill;
    nSemaine++;
    let sortie = -1, ex = null;
    for (let j = e; j < a; j++) {
      ex = evaluerBougie(cfg, pos, { o: o[j], h: h[j], l: l[j], c: c[j] }, j === e, j - e + 1);
      if (ex) { if (ex.motif === 'stop' && pos.stop !== stopInitial) ex = { ...ex, motif: 'stop suiveur' }; sortie = j; break; }
      if (dsv > 0) {
        if (s > 0) { if (h[j] > ext) ext = h[j]; const ns = ext - dsv; if (ns > pos.stop) pos.stop = ns; }
        else { if (l[j] < ext) ext = l[j]; const ns = ext + dsv; if (ns < pos.stop) pos.stop = ns; }
      }
    }
    if (sortie < 0) { tronque = true; break; }                              // position encore ouverte à la fin des données : non comptée
    const r = resultatPosition(cfg, pos, ex.prix);
    trades.push({ signal: i, entree: e, sortie, t: t[e], tSortie: t[sortie], sens: s, prixEntree: pos.fill, stop: stopInitial, stopFinal: pos.stop, cible: cb, prixSortie: ex.prix, motif: ex.motif, R: r.R, Rbrut: r.Rbrut, coutsR: r.coutsR,
      distancePct: pos.pct, barres: sortie - e + 1, etiq: etiq ? etiq[i] : 0, regime: regime ? regime[i] : 0 });
    prochain = sortie + cfg.reposBarres; i = Math.max(sortie, i + 1);
  }
  return { trades, tronque, config: cfg };
}
export { statistiques };
