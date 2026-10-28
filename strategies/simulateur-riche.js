import { fusionConfig, semaineUTC } from '../planetes/mars/pc/agent-btc/moteur.js';
import { coutEstimeR, distanceMinimale } from './couts-r.js';

/* ═════════════ SIMULATEUR RICHE DE LA V6 (module pur, testé : galaxie/tests/simulateur-riche-test.mjs) ═════════════
   Même philosophie que planetes/mars/pc/agent-btc/moteur.js (le signal naît à la clôture de la bougie i ; UNE position à la fois ; stop avant objectif quand les deux sont touchés dans la même bougie ;
   gap = sortie à l'ouverture, au prix pire ; position encore ouverte à la fin des données = non comptée), avec en plus :
   · ENTRÉES À COURS LIMITÉ (maker) avec un modèle d'exécution HONNÊTE : l'ordre n'est rempli que si le prix TRAVERSE le niveau d'au moins `filePct` % (la file d'attente : toucher le niveau ne suffit pas),
     jamais d'amélioration de prix, ordres non remplis / expirés / « partis sans nous » comptés, et remplissages « adverses » comptés (la bougie de remplissage se referme contre nous) ;
   · STOP MINIMUM AUTOMATIQUE : un stop plus proche que la distance qui garde le coût (frais + spread + glissement) sous `coutPlafondR` (≈ 0,08 R) est ÉLARGI à cette distance ; sinon, avec `refuserSiCoutR`,
     le trade est refusé ; un rapport gain / risque minimal à l'entrée (`rrMin`) est exigé ;
   · SORTIES RICHES : objectif fixe ou absolu (aimant), sortie PARTIELLE (une part à X R, stop remonté à l'entrée), STOP SUIVEUR (ATR), sortie par le TEMPS, sortie sur INVALIDATION du contexte ;
   · frais maker pour les ordres limités (objectif, partielle), frais taker + glissement pour les ordres au marché (stop, temps, invalidation) ; spread variable selon l'heure UTC (`spreadParHeure`).
   Chaque trade porte les mêmes champs que ceux du moteur d'origine (R, Rbrut, coutsR, distancePct, entree, sortie, t, tSortie, sens, barres, motif…) plus RbrutIdeal et coutsTotalR (TOUS les coûts).
   Signaux : { riche: true, sens, stop, R, cible?, limite?, ttl?, atr?, invalide?, options? } ; options peut contenir : sortie { type, partielleR, partielleFraction, suiveurActiveR, suiveurAtr, tempsBarres, sansCible },
   stopMinAuto, coutPlafondR, refuserSiCoutR, rrMin, ttlBarres. Aucun ordre réel : c'est une simulation. */
export const SORTIES = Object.freeze(['fixe', 'partielle', 'suiveur', 'temps', 'mixte']);
const heureUTC = t => new Date(t).getUTCHours();
export const configRiche = (config = {}, options = {}) => {
  const c = { ...fusionConfig(config), ...options };
  c.fraisPct = c.fraisPct == null ? 0.06 : c.fraisPct; c.makerPct = c.makerPct == null ? +(c.fraisPct * 0.4).toFixed(4) : c.makerPct; c.filePct = c.filePct == null ? 0.02 : c.filePct;
  return c;
};
const invalideSens = (flag, s) => flag === 2 || flag === s;   // 2 = invalide les deux sens ; 1 / -1 = invalide les achats / les ventes

/* Dimensionnement d'une entrée (le même code sert au backtest ET au suivi en direct) : distance au stop, élargissement automatique pour tenir le plafond de coût, refus (coût, distance, rapport gain / risque),
   objectif. Renvoie { ok, raison, stop, dist, pct, cible, elargi }. `fill` = prix d'entrée supposé ; `entreeMaker` = ordre limité. */
export function dimensionner(cfg, s, fill, stopSig, R, cibleAbs, entreeMaker) {
  let stop = stopSig, dist = s > 0 ? fill - stop : stop - fill, elargi = false;
  if (!(dist > 0)) return { ok: false, raison: 'distance', stop, dist };
  let pct = dist / fill * 100;
  const cfgPct = { fraisPct: cfg.fraisPct, makerPct: cfg.makerPct, spreadPct: cfg.spreadPct, glissementPct: cfg.glissementPct }, optCout = { entree: entreeMaker ? 'limite' : 'marche', sortie: 'marche' }, plafond = cfg.coutPlafondR;
  if (plafond > 0) {
    if (coutEstimeR(cfgPct, pct, optCout) > plafond) {
      if (cfg.stopMinAuto) { const dmin = distanceMinimale(cfgPct, plafond, optCout); stop = fill - s * (dmin / 100 * fill); dist = Math.abs(fill - stop); pct = dmin; elargi = true; }
      else if (cfg.refuserSiCoutR) return { ok: false, raison: 'frais', stop, dist, pct };
    }
  }
  if (pct < cfg.distanceMinPct && !(cfg.stopMinAuto && plafond > 0)) return { ok: false, raison: 'distance', stop, dist, pct };
  if (pct > cfg.distanceMaxPct) return { ok: false, raison: 'distance', stop, dist, pct };
  const cible = Number.isFinite(cibleAbs) ? cibleAbs : fill + s * (R || 2) * dist;
  if (!(s > 0 ? cible > fill : cible < fill)) return { ok: false, raison: 'rr', stop, dist, pct };
  if (cfg.rrMin > 0 && Math.abs(cible - fill) / dist < cfg.rrMin) return { ok: false, raison: 'rr', stop, dist, pct };
  return { ok: true, stop, dist, pct, cible, elargi };
}

export function simulerRiche(m15, signaux, config = {}, plage = {}) {
  const cfg = configRiche(config, signaux.options || {}), { o, h, l, c, t } = m15, n = m15.n, de = Math.max(0, plage.de || 0), a = Math.min(n, plage.a == null ? n : plage.a);
  const { sens, stop: niveauStop } = signaux, sortie = cfg.sortie || { type: 'fixe' }, ts = sortie.type || 'fixe', avecPartielle = ts === 'partielle' || ts === 'mixte', avecSuiveur = ts === 'suiveur' || ts === 'mixte';
  const partR = sortie.partielleR || 1, partFrac = sortie.partielleFraction == null ? 0.5 : sortie.partielleFraction, tempsMax = sortie.tempsBarres || cfg.maxBarres;
  const fp = cfg.filePct / 100, taker = cfg.fraisPct / 100, maker = cfg.makerPct / 100, slip = cfg.glissementPct / 100, trades = [];
  const ordres = { signaux: 0, poses: 0, remplis: 0, nonRemplis: 0, partisSansNous: 0, adverses: 0, refusFrais: 0, refusRR: 0, refusDistance: 0, elargis: 0, refusSemaine: 0 };
  const spreadA = j => (cfg.spreadPct / 100) * (cfg.spreadParHeure ? (cfg.spreadParHeure[heureUTC(t[j])] || 1) : 1);
  let i = de, prochain = de, semaine = -1, nSemaine = 0, tronque = false, ouverte = null, enAttente = null;
  while (i < a - 1) {
    if (i < prochain || sens[i] === 0) { i++; continue; }
    const s = sens[i], e0 = i + 1; ordres.signaux++;
    const sem = semaineUTC(t[e0]); if (sem !== semaine) { semaine = sem; nSemaine = 0; }
    if (nSemaine >= cfg.maxParSemaine) { ordres.refusSemaine++; i++; continue; }
    const niveauLimite = signaux.limite ? signaux.limite[i] : NaN, cibleAbs = signaux.cible ? signaux.cible[i] : NaN, stopSig = niveauStop[i];
    let idxFill, fill, entreeMaker = false, adverse = false;
    if (Number.isFinite(niveauLimite)) {
      ordres.poses++; const ttl = signaux.ttl || cfg.ttlBarres || 8; let rempli = -1, parti = false;
      for (let j = e0; j < Math.min(a, e0 + ttl); j++) {
        if (s > 0 ? l[j] <= niveauLimite * (1 - fp) : h[j] >= niveauLimite * (1 + fp)) { rempli = j; break; }                 // le prix a TRAVERSÉ le niveau : l'ordre est exécuté
        if (Number.isFinite(cibleAbs) && (s > 0 ? h[j] >= cibleAbs : l[j] <= cibleAbs)) { parti = true; break; }              // le prix est parti vers l'objectif sans nous
      }
      if (rempli < 0) {
        if (!parti && e0 + ttl > a) { enAttente = { sens: s, niveau: niveauLimite, stop: stopSig, cible: Number.isFinite(cibleAbs) ? cibleAbs : null, signal: i, expire: e0 + ttl - 1 }; tronque = true; break; }   // l'ordre est encore valable à la fin des données : il attend
        if (parti) ordres.partisSansNous++; else ordres.nonRemplis++; i++; continue;
      }
      idxFill = rempli; fill = niveauLimite; entreeMaker = true; ordres.remplis++; adverse = s > 0 ? c[idxFill] < niveauLimite : c[idxFill] > niveauLimite; if (adverse) ordres.adverses++;
    } else { idxFill = e0; fill = o[e0] * (1 + s * (slip + spreadA(e0) / 2)); }
    if (idxFill >= a) { tronque = true; break; }
    // stop : minimum automatique, plafond de coût, distances, rapport gain / risque
    const dm = dimensionner(cfg, s, fill, stopSig, signaux.R, cibleAbs, entreeMaker);
    if (!dm.ok) { if (dm.raison === 'frais') ordres.refusFrais++; else if (dm.raison === 'rr') ordres.refusRR++; else ordres.refusDistance++; i++; continue; }
    const stop = dm.stop, dist = dm.dist, pct = dm.pct, cible = dm.cible; if (dm.elargi) ordres.elargis++;
    nSemaine++;
    // gestion de la position
    const qte = 1 / dist, idealEntree = entreeMaker ? fill : o[idxFill], legs = []; let reste = 1, stopCourant = stop, etatStop = 'initial', extreme = fill, partFaite = false, sortieIdx = -1, motifFinal = null;
    const jambe = (fraction, prix, ideal, typeSortie, motif) => legs.push({ fraction, prix, ideal, typeSortie, motif });
    for (let j = idxFill; j < a; j++) {
      const premiere = j === idxFill, detenues = j - idxFill + 1;
      if (!premiere && signaux.invalide && invalideSens(signaux.invalide[j - 1], s)) { jambe(reste, o[j] * (1 - s * (slip + spreadA(j) / 2)), o[j], 'taker', 'invalidation'); reste = 0; sortieIdx = j; motifFinal = 'invalidation'; break; }
      const touchStop = s > 0 ? l[j] <= stopCourant : h[j] >= stopCourant;
      if (touchStop) { const gap = !premiere && (s > 0 ? o[j] < stopCourant : o[j] > stopCourant), ideal = gap ? o[j] : stopCourant; const motif = etatStop === 'initial' ? 'stop' : etatStop; jambe(reste, ideal * (1 - s * slip), ideal, 'taker', motif); reste = 0; sortieIdx = j; motifFinal = motif; break; }
      if (avecPartielle && !partFaite && !(premiere && entreeMaker)) {
        const nivP = fill + s * partR * dist;
        if (s > 0 ? h[j] >= nivP * (1 + fp) : l[j] <= nivP * (1 - fp)) { jambe(partFrac, nivP, nivP, 'maker', 'partielle'); reste -= partFrac; partFaite = true; stopCourant = fill; if (etatStop === 'initial') etatStop = 'be'; }
      }
      if (!sortie.sansCible && !(premiere && entreeMaker) && (s > 0 ? h[j] >= cible * (1 + fp) : l[j] <= cible * (1 - fp))) {
        const gap = !premiere && (s > 0 ? o[j] > cible : o[j] < cible), ideal = gap ? o[j] : cible; jambe(reste, ideal, ideal, 'maker', 'cible'); reste = 0; sortieIdx = j; motifFinal = 'cible'; break;
      }
      if (avecSuiveur) {   // le stop suiveur n'est remonté qu'avec l'information de la bougie j ; il joue à partir de j + 1 (aucun regard vers le futur)
        extreme = s > 0 ? Math.max(extreme, h[j]) : Math.min(extreme, l[j]);
        const gain = s * (extreme - fill);
        if (gain >= (sortie.suiveurActiveR || 1) * dist) { const at = signaux.atr && signaux.atr[j] > 0 ? signaux.atr[j] : dist, trail = extreme - s * (sortie.suiveurAtr || 2) * at; if (s > 0 ? trail > stopCourant : trail < stopCourant) { stopCourant = trail; etatStop = 'suiveur'; } }
      }
      if (detenues >= tempsMax) { jambe(reste, c[j] * (1 - s * (slip + spreadA(j) / 2)), c[j], 'taker', 'temps'); reste = 0; sortieIdx = j; motifFinal = 'temps'; break; }
    }
    if (reste > 1e-9 || sortieIdx < 0) {                                                                                // position encore ouverte à la fin des données : non comptée dans les trades, mais rendue pour le suivi en direct
      tronque = true; ouverte = { sens: s, entree: idxFill, t: t[idxFill], prixEntree: fill, stop: stopCourant, stopInitial: stop, cible, dist, pct, partielleFaite: partFaite, maker: entreeMaker, signal: i, etatStop }; break;
    }
    let Rnet = 0, brut = 0, frais = 0, ideal = 0;
    for (const g of legs) {
      const gross = s * (g.prix - fill) * qte * g.fraction, feeEntree = (entreeMaker ? maker : taker) * fill * qte * g.fraction, feeSortie = (g.typeSortie === 'maker' ? maker : taker) * g.prix * qte * g.fraction;
      brut += gross; frais += feeEntree + feeSortie; Rnet += gross - feeEntree - feeSortie; ideal += s * (g.ideal - idealEntree) * qte * g.fraction;
    }
    const derniere = legs[legs.length - 1];
    trades.push({ signal: i, entree: idxFill, sortie: sortieIdx, t: t[idxFill], tSortie: t[sortieIdx], sens: s, prixEntree: fill, stop, cible, prixSortie: derniere.prix, motif: motifFinal, R: Rnet, Rbrut: brut, coutsR: frais,
      RbrutIdeal: ideal, coutsTotalR: ideal - Rnet, distancePct: pct, barres: sortieIdx - idxFill + 1, maker: entreeMaker, adverse, partielle: legs.length > 1 });
    prochain = sortieIdx + cfg.reposBarres; i = Math.max(sortieIdx, i + 1);
  }
  return { trades, tronque, config: cfg, ordres, ouverte, enAttente };
}

/* Compare, pour les MÊMES signaux, l'entrée au marché (taker) et l'entrée à cours limité (maker) : espérance nette, nombre de trades, taux de remplissage, trades manqués, remplissages adverses.
   `signauxMarche` / `signauxLimite` : les deux jeux de signaux (le second contient `limite`). Rend des chiffres, jamais un verdict. */
export function comparerMakerTaker(m15, signauxMarche, signauxLimite, config, plage, statistiques) {
  const ma = simulerRiche(m15, signauxMarche, config, plage), li = simulerRiche(m15, signauxLimite, config, plage), moy = tr => (tr.length ? tr.reduce((a, x) => a + x.R, 0) / tr.length : null);
  const cles = new Set(ma.trades.map(x => x.signal)), manquesGagnants = ma.trades.filter(x => !li.trades.some(y => y.signal === x.signal)), remplis = li.trades.filter(x => cles.has(x.signal));
  return { marche: { n: ma.trades.length, esperance: moy(ma.trades), couts: moy(ma.trades.map(x => ({ R: x.coutsTotalR }))) }, limite: { n: li.trades.length, esperance: moy(li.trades), couts: moy(li.trades.map(x => ({ R: x.coutsTotalR }))), ordres: li.ordres },
    tauxRemplissage: li.ordres.poses ? li.ordres.remplis / li.ordres.poses : null, selectionAdverse: { esperanceDesTradesManques: moy(manquesGagnants), esperanceMemesSignauxRemplis: moy(remplis), nManques: manquesGagnants.length, part: li.ordres.remplis ? li.ordres.adverses / li.ordres.remplis : null } };
}
