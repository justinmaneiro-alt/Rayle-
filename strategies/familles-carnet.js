/* ═════════════ FAMILLES « CARNET D'ORDRES » (V4, phase 5 ; module pur, testé : galaxie/tests/familles-v4-test.mjs) ═════════════
   Ces familles reposent sur le carnet d'ordres (murs, pression, retraits) et sur le flux de liquidations. Il n'existe PAS d'historique gratuit du carnet : elles ne peuvent donc pas être « validées sur des
   années ». Elles sont testées (a) sur les jours ENREGISTRÉS par le service (relecture, phase 4), (b) en PÉPINIÈRE LIVE (phase 7 : trades simulés sur le marché réel, mêmes frais). Tant que la preuve manque,
   chaque proposition porte la mention « carnet : X jours ; preuve insuffisante avant Y » — l'interface ne la présente JAMAIS comme une stratégie validée ni comme un conseil.
   Ce fichier ne contient que des GÉNÉRATEURS DE PROPOSITIONS purs : `proposerCarnet(entree)` lit une analyse (strategies/liquidite/analyse.js) et l'état du marché, et rend des propositions
   { famille, sens, entree, stop, cible, R, raison[] }. Aucun ordre n'est passé : la pépinière les simule. Chaque famille a son hypothèse économique (HYPOTHESES_CARNET). */
export const JOURS_PREUVE_MIN = 14;
export const HYPOTHESES_CARNET = Object.freeze({
  rebond_mur: { nom: 'Rebond sur un mur fiable', hypothese: 'Qui perd : ceux qui vendent dans un mur d’achat qui a déjà été attaqué et qui a tenu (il est réel, quelqu’un veut vraiment acheter là). Pourquoi on peut gagner à leur place : un gros ordre limite réel absorbe l’agression ; le stop juste dessous est petit ; si le mur cède (il disparaît), on sort tout de suite.' },
  cassure_mur_disparait: { nom: 'Cassure d’un mur qui disparaît', hypothese: 'Qui perd : ceux qui comptaient sur un mur pour arrêter le prix (le mur retiré à l’approche était un leurre ou un renoncement). Pourquoi on peut gagner à leur place : quand la liquidité qui freinait disparaît, le prix glisse dans le vide ; on suit ce mouvement, stop de l’autre côté.' },
  continuation_desequilibre: { nom: 'Continuation par déséquilibre persistant', hypothese: 'Qui perd : ceux qui vont contre une pression du carnet qui dure. Pourquoi on peut gagner à leur place : un déséquilibre soutenu du carnet ET un flux agressif de même sens sont deux témoins indépendants d’une demande réelle ; le prix suit la ligne de moindre résistance.' },
  cascade_liquidations: { nom: 'Après une cascade de liquidations', hypothese: 'Qui perd : ceux qui entrent PENDANT une cascade (le prix est poussé par des ordres forcés, pas par une décision). Pourquoi on peut gagner à leur place : une fois la cascade finie (plus aucune liquidation depuis 2 min), la pression forcée a disparu et le prix a souvent dépassé sa valeur ; on prend le retour partiel, jamais pendant la cascade.' },
  aimant_carte: { nom: 'Aimant : la plus grosse zone au-dessus ou en dessous', hypothese: 'Qui perd : ceux qui s’opposent au mouvement vers la zone où se concentrent murs, stops et liquidations. Pourquoi on peut gagner à leur place : cette zone concentre la liquidité dont les gros ordres ont besoin ; invalidation claire (le niveau de défense).' }
});
const pct = (a, b) => Math.abs(a - b) / b * 100;
const base = (famille, entree, extra) => ({ famille, nom: HYPOTHESES_CARNET[famille].nom, actif: entree.actif, t: entree.t, entree: entree.prix, validee: false, ...extra,
  preuve: 'carnet : ' + (entree.joursCarnet != null ? entree.joursCarnet.toFixed(1).replace('.', ',') : '0') + ' jour(s) enregistré(s) ; preuve insuffisante avant ' + JOURS_PREUVE_MIN + ' jours' + ((entree.joursCarnet || 0) >= JOURS_PREUVE_MIN ? ' (seuil de jours atteint : la preuve doit encore venir des trades simulés)' : '') });
const proposer = (famille, entree, sens, stop, R, raison, cible = null) => {
  const risque = Math.abs(entree.prix - stop); if (!(risque > 0)) return null; const dist = pct(stop, entree.prix); if (dist > 1.5 || dist < 0.02) return null;        // stop hors limites : jamais proposé
  return base(famille, entree, { sens, stop, R, cible: cible != null ? cible : entree.prix + sens * R * risque, risquePct: dist, raison });
};
const murs = e => (e.analyse && e.analyse.murs || []).filter(m => m.actif);

/* Rebond sur un mur FIABLE : à 0,03 – 0,2 % du prix, fiabilité ≥ 0,7, déjà attaqué au moins une fois (exécutions ≥ 1) ou tenu ≥ 10 min ; la pression du carnet ne doit pas être fortement contre. */
export function reboundMur(e, { R = 2, fiabiliteMin = 0.7, dureeMinS = 600 } = {}) {
  const out = []; const pr = e.analyse && e.analyse.pression && e.analyse.pression.pression || 0;
  for (const m of murs(e)) {
    if (!m.fiabilite || m.fiabilite.score < fiabiliteMin || !(m.fiabilite.executions >= 1 || m.dureeS >= dureeMinS) || m.distancePct < 0.03 || m.distancePct > 0.2) continue;
    const sens = m.cote === 'bid' ? 1 : -1; if (pr * sens < -0.3) continue;
    const marge = Math.max(e.prix * 0.0005, (e.atr || 0) * 0.3), p = proposer('rebond_mur', e, sens, m.cote === 'bid' ? m.prix - marge : m.prix + marge, R, ['mur ' + (m.cote === 'bid' ? 'acheteur' : 'vendeur') + ' fiable à ' + m.distancePct.toFixed(2).replace('.', ',') + ' % (' + Math.round(m.usdMax / 1e3) + ' k$, tenu ' + Math.round(m.dureeS / 60) + ' min)', 'sortie immédiate si le mur disparaît']);
    if (p) out.push(p);
  }
  return out;
}
/* Cassure d'un mur qui disparaît : un RETRAIT (pas une exécution) d'un gros mur à moins de 0,15 % dans les 20 dernières secondes. Mur vendeur retiré → haussier ; mur acheteur retiré → baissier. */
export function cassureMurDisparait(e, { R = 1.5, fenetreMs = 20000 } = {}) {
  const out = []; for (const ev of e.evenementsRecents || []) {
    if (ev.type !== 'retrait' || e.t - ev.t > fenetreMs || pct(ev.prix, e.prix) > 0.15 || ev.usd < (e.seuilUsd || 0)) continue;
    const sens = ev.cote === 'ask' ? 1 : -1, stop = e.prix * (1 - sens * Math.max(0.002, (e.atr || 0) / e.prix)), p = proposer('cassure_mur_disparait', e, sens, stop, R, ['un mur ' + (ev.cote === 'ask' ? 'vendeur' : 'acheteur') + ' de ' + Math.round(ev.usd / 1e3) + ' k$ vient d’être RETIRÉ sans être exécuté']);
    if (p) out.push(p);
  }
  return out;
}
/* Continuation par déséquilibre : pression du carnet persistante (≥ 0,1 en valeur absolue, même signe 80 % du temps) ET delta des 60 dernières secondes de même sens ET régime pas contraire. */
export function continuationDesequilibre(e, { R = 2 } = {}) {
  const pr = e.analyse && e.analyse.pression; if (!pr || !pr.persistante || pr.pression == null) return []; const sens = pr.pression > 0 ? 1 : -1, c = e.analyse.cvd;
  if (!c || c.delta60s * sens <= 0) return []; if (e.regime === 'range' || (e.tendance && e.tendance * sens < 0)) return [];
  const p = proposer('continuation_desequilibre', e, sens, e.prix * (1 - sens * Math.max(0.0025, 0.8 * (e.atr || 0) / e.prix)), R, ['pression du carnet ' + (sens > 0 ? 'acheteuse' : 'vendeuse') + ' persistante (' + pr.pression.toFixed(2).replace('.', ',') + ')', 'delta des 60 dernières secondes de même sens']); return p ? [p] : [];
}
/* Après une cascade de liquidations FINIE (calme depuis `calmeS`) : retour partiel à contre-sens, jamais pendant. `cascades` = sorties de cascadesLiquidations. */
export function apresCascade(e, { R = 2, calmeS = 120, seuilUsd = 1e6, maxAgeS = 900 } = {}) {
  const out = []; for (const c of e.cascades || []) {
    const age = (e.t - c.fin) / 1000; if (c.usd < seuilUsd || age < calmeS || age > maxAgeS) continue;
    const sens = c.cote === 'long' ? 1 : -1, extreme = c.cote === 'long' ? c.bas : c.haut, stop = extreme - sens * Math.max(e.prix * 0.0008, 0.2 * (e.atr || 0)), p = proposer('cascade_liquidations', e, sens, stop, R, ['cascade de liquidations de ' + (c.cote === 'long' ? 'longs' : 'courts') + ' (' + (c.usd / 1e6).toFixed(1).replace('.', ',') + ' M$) terminée il y a ' + Math.round(age) + ' s', 'on n’entre jamais pendant la cascade']);
    if (p) out.push(p);
  }
  return out;
}
/* Aimant : la carte des aimants a un objectif de confiance ≥ « moyenne » à 0,2 – 1,5 %, un niveau de défense et une invalidation ; on suit le prix vers l'objectif, stop = invalidation, R = distance / risque (≥ 1,2). */
export function aimantCarte(e, { rMin = 1.2 } = {}) {
  const A = e.analyse && e.analyse.aimants; if (!A || !A.objectif || !A.invalidation || A.confiance === 'très faible' || A.confiance === 'faible' || A.confiance === 'aucune') return [];
  const d = Math.abs(A.objectif.distancePct); if (d < 0.2 || d > 1.5) return []; const sens = A.objectif.cote === 'haut' ? 1 : -1, stop = A.invalidation.prix, risque = Math.abs(e.prix - stop); if (!(risque > 0) || Math.sign(e.prix - stop) !== sens) return [];
  const R = Math.abs(A.objectif.prix - e.prix) / risque; if (R < rMin) return [];
  const p = proposer('aimant_carte', e, sens, stop, +R.toFixed(2), ['objectif ' + A.objectif.prix.toFixed(2) + ' : ' + A.objectif.explication, 'invalidation : ' + A.invalidation.texte], A.objectif.prix); return p ? [p] : [];
}
export const GENERATEURS_CARNET = Object.freeze({ rebond_mur: reboundMur, cassure_mur_disparait: cassureMurDisparait, continuation_desequilibre: continuationDesequilibre, cascade_liquidations: apresCascade, aimant_carte: aimantCarte });
export const ORDRE_CARNET = Object.freeze(Object.keys(GENERATEURS_CARNET));
/* Toutes les propositions de l'instant. `entree` = { actif, t, prix, atr, analyse, evenementsRecents, cascades, joursCarnet, regime, tendance, seuilUsd }. */
export function proposerCarnet(entree, { familles = ORDRE_CARNET } = {}) {
  if (!entree || !(entree.prix > 0)) return []; const out = [];
  for (const id of familles) { try { for (const p of GENERATEURS_CARNET[id](entree)) out.push(p); } catch (e) { /* une famille cassée ne bloque pas les autres */ } }
  return out;
}
