import { evaluerBougie, fusionConfig, ouvrirPosition, resultatPosition, semaineUTC } from '../agent-btc/moteur.js';
import { construireMicro } from '../agent-btc/micro-mesures.js';
import { CONFIG_MS } from './simulation-ms.js';
import { PAS, signauxMS, masqueSortie, masqueEntree, etatConditionsMS, codesRegime, NOMS_REGIME } from './signaux-ms.js';
import { decrireCond } from './strategie-ms.js';

/* ═════════════ MODE ALERTES D'UNE STRATÉGIE DE L'UTILISATRICE (V1 ; module pur, testé : ms-alertes-test.mjs) ═════════════
   JAMAIS d'exécution automatique : seulement des alertes d'ENTRÉE et de SORTIE avec leur raison, et un COMPTE SIMULÉ qui suit chaque stratégie séparément (même logique d'exécution que le backtest).
   Chaque alerte porte une étiquette de confiance HONNÊTE : « NON TESTÉE », « NON VALIDÉE » (le test ne bat pas le hasard, ou pas assez de trades), « BACKTEST » (bat le hasard sur le passé, SANS être validée par
   le protocole : jeu final, critères v1 et v2) ou « CONFIRMÉE EN RÉEL (simulé) » (≥ 20 positions simulées en direct, espérance positive). Une stratégie qui ne bat pas le hasard reste utilisable si l'utilisatrice
   le décide, avec « NON VALIDÉE » bien visible. Appelé à chaque bougie M15 FERMÉE, par la page (application ouverte) et par le Veilleur (application fermée) : les identifiants d'alerte sont les mêmes (pas de doublon).
   Les décisions d'aide (gardien prop, taille conseillée) sont ajoutées par l'appelant (`jugement`), car elles dépendent du compte réel de l'utilisatrice. */
export const compteMSVide = () => ({ ouvertes: [], attente: [], fermees: [] });
export const etatMSVide = () => ({ version: 1, comptes: {}, vus: [], derniereBarre: {} });
const fmt = x => (x == null || !Number.isFinite(x) ? '—' : Math.round(x).toLocaleString('fr-FR'));
const virg = x => (x == null || !Number.isFinite(x) ? '—' : String(Math.round(x * 100) / 100).replace('.', ','));

/* Étiquette de confiance honnête, selon le dernier verdict du test et la performance simulée en direct. */
export function etiquetteConfiance({ dernierVerdict = null, direct = null } = {}) {
  if (direct && direct.n >= 20 && direct.esperance > 0) return { code: 'confirmee', etiquette: 'CONFIRMÉE EN RÉEL (simulé)', phrase: direct.n + ' positions simulées en direct, espérance ' + (direct.esperance >= 0 ? '+' : '−') + virg(Math.abs(direct.esperance)) + ' R : encourageant, pas une garantie.' };
  if (!dernierVerdict) return { code: 'non_testee', etiquette: 'NON TESTÉE', phrase: 'Cette stratégie n’a pas encore été testée sur le passé.' };
  if (dernierVerdict === 'bat_le_hasard') return { code: 'backtest', etiquette: 'BACKTEST', phrase: 'Bat le hasard sur le passé (zone de recherche), mais n’est PAS validée par le protocole complet (jeu final non ouvert).' };
  if (dernierVerdict === 'pas_assez') return { code: 'non_validee', etiquette: 'NON VALIDÉE', phrase: 'Pas assez de trades dans le test pour conclure : ses résultats passés ne prouvent rien.' };
  return { code: 'non_validee', etiquette: 'NON VALIDÉE', phrase: 'Ne bat pas le hasard sur le passé : tu l’utilises en connaissance de cause.' };
}
/* Performance des positions simulées en direct d'une stratégie. */
export function perfDirect(compte) {
  const f = compte.fermees || [], n = f.length; if (!n) return { n: 0, esperance: null, Rtotal: 0, gagnants: 0, tauxReussite: null };
  const R = f.reduce((s, x) => s + x.R, 0); return { n, esperance: R / n, Rtotal: R, gagnants: f.filter(x => x.R > 0).length, tauxReussite: f.filter(x => x.R > 0).length / n };
}

/* Aide à la décision d'un signal d'entrée : régime, qualité de cassure, risque de fausse cassure (estimations simples), à compléter par le gardien et la taille. */
export function aideSignal(ctx, strat, s, j) {
  const rg = NOMS_REGIME[codesRegime(ctx)[j]], aide = { regime: rg, bornes: null, qualiteCassure: null, fausseCassure: null };
  if (strat.conditions.some(c => c.type === 'cassure')) {
    const vr = construireMicro(ctx).volRel[j], vol = Number.isFinite(vr) ? vr : null;
    aide.qualiteCassure = vol == null ? 'volume inconnu' : vol >= 1.5 ? 'volume en expansion (' + virg(vol) + ' × la moyenne) : cassure de qualité' : vol >= 1 ? 'volume correct (' + virg(vol) + ' ×)' : 'volume faible (' + virg(vol) + ' ×) : cassure peu convaincante';
    aide.fausseCassure = vol == null ? 'inconnu' : (vol < 0.8 || rg === 'range') ? 'élevé' : (vol >= 1.5 && (rg === 'haussier' || rg === 'baissier')) ? 'faible' : 'moyen';
  }
  return aide;
}

function ouvrirSimulee(cfg, strat, a, bougie) {
  const pos = ouvrirPosition(cfg, a.sens, bougie.o, a.stop, 1); if (!pos) return null;
  const so = strat.sortie;
  pos.cible = so.type === 'cible_R' ? pos.fill + a.sens * so.R * pos.dist : (a.sens > 0 ? Infinity : -Infinity);
  return { ...a, pos, entreeT: bougie.t, ext: pos.fill, dsv: a.suivi || 0, detenues: 0, stopInitial: pos.stop };
}
const resume = (strat, ctx, j, s) => etatConditionsMS(ctx, strat, s, j).reunies.map(c => (c.type === 'filtre' ? 'filtre : ' + c.texte : decrireCond(c)));

/* Fait avancer le compte simulé de chaque stratégie d'UNE bougie fermée (la dernière de `ctx`) et rend les alertes nouvelles.
   entrée : { etat, ctx, strategies: [{ id, nom, strategie, confiance: {etiquette, phrase, code} }], paire, config, maintenant }. Rend { alertes, etat }. */
export function avancerMS({ etat, ctx, strategies, paire, config = {}, maintenant = Date.now() }) {
  const j = ctx.n - 1, m = ctx.m15, bougie = { t: m.t[j], o: m.o[j], h: m.h[j], l: m.l[j], c: m.c[j] }, alertes = [];
  if (etat.derniereBarre[paire] != null && bougie.t <= etat.derniereBarre[paire]) return { alertes, etat };        // bougie déjà traitée : rien à refaire (pas de doublon après un redémarrage)
  const cfg = fusionConfig({ ...CONFIG_MS, ...config }), slip = cfg.glissementPct / 100, demi = cfg.spreadPct / 200, vus = new Set(etat.vus);
  for (const rec of strategies) {
    const strat = rec.strategie, cle = rec.id + ':' + paire, cp = etat.comptes[cle] || (etat.comptes[cle] = compteMSVide());
    // 1. ordres en attente (signal de la bougie précédente) : exécutés à l'ouverture de cette bougie
    for (const a of cp.attente.slice()) {
      cp.attente = cp.attente.filter(x => x !== a);
      if (bougie.t !== a.tSignal + PAS) { a.annule = 'signal trop ancien (l’application n’a pas tourné)'; continue; }
      const p = ouvrirSimulee(cfg, strat, a, bougie); if (!p) { a.annule = 'distance au stop hors limites à l’exécution'; continue; } cp.ouvertes.push(p);
    }
    // 2. positions ouvertes : sortie prévue (signal lu à la clôture précédente), stop, objectif, temps ; stop suiveur ; condition de sortie lue à la clôture de cette bougie
    const exitMasks = strat.sortie.type === 'signal' ? { 1: masqueSortie(ctx, strat, 1), [-1]: masqueSortie(ctx, strat, -1) } : null;
    for (const p of cp.ouvertes.slice()) {
      p.detenues++; let ex = null;
      if (p.sortiePrevue) ex = { prix: bougie.o * (1 - p.sens * (slip + demi)), motif: 'signal' };
      else ex = evaluerBougie(cfg, p.pos, bougie, p.detenues === 1, p.detenues);
      if (!ex && strat.sortie.type === 'suiveur' && p.dsv > 0) {
        if (p.sens > 0) { if (bougie.h > p.ext) p.ext = bougie.h; const ns = p.ext - p.dsv; if (ns > p.pos.stop) p.pos.stop = ns; } else { if (bougie.l < p.ext) p.ext = bougie.l; const ns = p.ext + p.dsv; if (ns < p.pos.stop) p.pos.stop = ns; }
      }
      if (!ex && exitMasks && exitMasks[p.sens][j]) { p.sortiePrevue = true; continue; }
      if (!ex) continue;
      const r = resultatPosition(cfg, p.pos, ex.prix); cp.ouvertes = cp.ouvertes.filter(x => x !== p);
      const trade = { id: p.id, strategie: rec.id, paire, t: p.entreeT, tSortie: bougie.t + PAS, sens: p.sens, prixEntree: p.pos.fill, stop: p.stopInitial, prixSortie: ex.prix, motif: ex.motif === 'stop' && p.pos.stop !== p.stopInitial ? 'stop suiveur' : ex.motif, R: r.R, barres: p.detenues, distancePct: p.pos.pct };
      cp.fermees.push(trade); if (cp.fermees.length > 500) cp.fermees.splice(0, cp.fermees.length - 500);
      const idS = 'S:' + rec.id + ':' + paire + ':' + p.entreeT;
      if (!vus.has(idS)) { vus.add(idS); alertes.push({ id: idS, type: 'SORTIE', paire, strategie: rec.id, nomStrategie: rec.nom, etiquette: rec.confiance.etiquette, confiance: rec.confiance.phrase, t: trade.tSortie, tSignal: bougie.t, sens: p.sens, entree: p.pos.fill, sortie: ex.prix, motif: trade.motif, R: r.R,
        texte: rec.confiance.etiquette + ' · ' + rec.nom + ' : SORTIE ' + paire + ' ' + (p.sens > 0 ? 'de l’achat' : 'de la vente') + ' (' + ({ stop: 'stop touché', cible: 'objectif atteint', temps: 'temps maximal', signal: 'signal de sortie', 'stop suiveur': 'stop suiveur touché' }[trade.motif] || trade.motif) + ') à ' + fmt(ex.prix) + ' · ' + (r.R >= 0 ? '+' : '−') + virg(Math.abs(r.R)) + ' R (simulé). Aucun ordre n’est passé.' }); }
    }
    // 3. nouvelle entrée sur la dernière bougie
    if (cp.ouvertes.length || cp.attente.length) continue;
    const sig = signauxMS(ctx, strat), s = sig.sens[j]; if (!s) continue;
    const sem = semaineUTC(bougie.t + PAS), cetteSemaine = [...cp.fermees, ...cp.ouvertes].filter(x => semaineUTC(x.entreeT || x.t) === sem).length;
    if (cetteSemaine >= cfg.maxParSemaine) continue;
    const derniere = cp.fermees.length ? Math.max(...cp.fermees.map(x => x.tSortie)) : -Infinity; if (bougie.t + PAS - derniere < cfg.reposBarres * PAS) continue;
    const px = bougie.c, stop = sig.stop[j], dist = Math.abs(px - stop), idE = 'E:' + rec.id + ':' + paire + ':' + bougie.t;
    if (!ouvrirPosition(cfg, s, px, stop, 1)) continue;                                  // stop trop proche ou trop loin : pas de signal
    const R = strat.sortie.type === 'cible_R' ? strat.sortie.R : null, cible = R ? px + s * R * dist : null, aide = aideSignal(ctx, strat, s, j), raison = resume(strat, ctx, j, s);
    const sortieTxt = strat.sortie.type === 'cible_R' ? 'objectif ' + fmt(cible) + ' (' + virg(R) + ' R)' : strat.sortie.type === 'suiveur' ? 'stop suiveur ' + virg(strat.sortie.k) + ' ATR ' + strat.sortie.tf.toUpperCase() : 'sortie sur signal';
    cp.attente.push({ id: idE, tSignal: bougie.t, sens: s, stop, suivi: sig.suivi[j] });
    if (vus.has(idE)) continue; vus.add(idE);
    alertes.push({ id: idE, type: 'ENTREE', paire, strategie: rec.id, nomStrategie: rec.nom, etiquette: rec.confiance.etiquette, confiance: rec.confiance.phrase, t: bougie.t + PAS, tSignal: bougie.t, sens: s, entree: px, stop, cible, R, risquePct: strat.filtres && strat.filtres.risqueMaxPct || null, sortie: sortieTxt,
      raison, aide, distancePct: dist / px * 100,
      texte: rec.confiance.etiquette + ' · ' + rec.nom + ' : ' + (s > 0 ? 'ACHAT' : 'VENTE') + ' ' + paire + ' vers ' + fmt(px) + ' · stop ' + fmt(stop) + ' · ' + sortieTxt + ' · raison : ' + raison.join(' ; ') + ' · régime ' + aide.regime + (aide.qualiteCassure ? ' · cassure : ' + aide.qualiteCassure + ' (risque de fausse cassure ' + aide.fausseCassure + ')' : '') + '. Aucun ordre n’est passé.' });
  }
  etat.vus = [...vus].slice(-300); etat.derniereBarre[paire] = bougie.t;
  return { alertes, etat };
}
export { masqueEntree };
