import { combinaisons } from '../planetes/mars/pc/agent-btc/hypotheses.js';
import { evaluerVariante } from '../planetes/mars/pc/agent-btc/evaluation.js';
import { famille } from './familles-v3.js';
import './familles-v4.js';
import { parBandeDeStop, resumeCouts, avantageDetruit, partMangee, moyenne, tauxEquilibre, phraseFrais, BANDES_STOP } from './couts-r.js';

/* ═════════════ OÙ LES FRAIS DÉTRUISENT L'AVANTAGE (V6, phase 1 ; module pur, testé : galaxie/tests/couts-r-analyse-test.mjs) ═════════════
   Pour une famille de stratégies sur un actif, simule TOUTES les variantes de sa grille de base sur la zone de recherche (jamais le jeu final) et regroupe leurs trades pour mesurer, par taille de stop :
   l'espérance AVANT frais (Rbrut), le coût moyen en R, l'espérance APRÈS frais (R). C'est un outil de COMPRÉHENSION : les trades de variantes voisines se recouvrent, et ces données servent déjà à choisir,
   donc les chiffres sont optimistes ; rien ici ne valide quoi que ce soit. */
const z = x => (Math.abs(x) < 0.005 ? 0 : x);   // jamais « -0,00 »
export const uniteDe = id => { const f = famille(id); return (f && f.unite) || 'M15'; };

/* Analyse d'une famille sur un actif : agrégat des trades de toutes les variantes (champs minimaux gardés), bandes de stop, résumé, meilleure variante. */
export function analyserFamilleCouts(ctx, id, config, plage, { grille = null, nMinBon = 30 } = {}) {
  const fam = famille(id); if (!fam) throw new Error('famille inconnue : ' + id);
  const combos = combinaisons(grille || fam.grille(0)), tous = [], variantes = [];
  for (const params of combos) {
    const e = evaluerVariante(ctx, id, params, config, plage), st = e.stats;
    for (const t of e.trades) tous.push({ R: t.R, Rbrut: t.RbrutIdeal != null ? t.RbrutIdeal : t.Rbrut, coutsR: t.coutsTotalR != null ? t.coutsTotalR : t.coutsR, distancePct: t.distancePct });   // avant frais = AVANT tous les coûts (prix idéaux) ; coûts = frais + spread + glissement
    variantes.push({ params, n: st.n, esperance: st.esperance, brute: e.trades.length ? moyenne(e.trades.map(t => (t.RbrutIdeal != null ? t.RbrutIdeal : t.Rbrut))) : null, couts: e.trades.length ? moyenne(e.trades.map(t => (t.coutsTotalR != null ? t.coutsTotalR : t.coutsR))) : null, ordres: e.ordres || null });
  }
  const bons = variantes.filter(v => v.n >= nMinBon), meilleur = bons.slice().sort((a, b) => b.esperance - a.esperance)[0] || null;
  return { id, nom: fam.nom, unite: uniteDe(id), variantes: variantes.length, avecAssezDeTrades: bons.length, positivesBrutes: bons.filter(v => v.brute > 0).length, positivesNettes: bons.filter(v => v.esperance > 0).length,
    bandes: parBandeDeStop(tous), resume: resumeCouts(tous), meilleur, tradesPoolesN: tous.length };
}

/* Tableau à plat : une ligne par famille × actif × bande de stop. `analyses` = [{ paire, analyse }]. */
export function lignesTableau(analyses) {
  const out = [];
  for (const { paire, analyse: a } of analyses) for (const b of a.bandes) if (b.n > 0) out.push({ famille: a.nom, id: a.id, paire, unite: a.unite, bande: b.libelle, n: b.n, brute: b.brute, couts: b.couts, nette: b.nette, tauxReussite: b.tauxReussite, distanceMoyennePct: b.distanceMoyennePct });
  return out;
}
/* Synthèse en phrases, tirées des chiffres. */
export function syntheseCouts(analyses, { hasard = [] } = {}) {
  const lignes = lignesTableau(analyses), detruit = avantageDetruit(lignes, { nMin: 100 }), tout = analyses.map(a => a.analyse.resume).filter(r => r.n > 0);
  const nTotal = tout.reduce((a, r) => a + r.n, 0), coutMoyen = nTotal ? tout.reduce((a, r) => a + r.couts * r.n, 0) / nTotal : null;
  const L = [];
  if (coutMoyen != null) L.push('Sur l’ensemble de ce qui a été testé (' + nTotal.toLocaleString('fr-FR') + ' trades simulés, toutes variantes), les frais coûtent en moyenne ' + coutMoyen.toFixed(2).replace('.', ',') + ' R par trade. ' + phraseFrais({ coutMoyenR: coutMoyen }));
  const courts = lignes.filter(l => l.distanceMoyennePct < 1 && l.n >= 100), longs = lignes.filter(l => l.distanceMoyennePct >= 2 && l.n >= 100);
  if (courts.length && longs.length) { const c = moyenne(courts.map(l => l.couts)), g = moyenne(longs.map(l => l.couts)); L.push('Les stops de moins de 1 % coûtent ' + c.toFixed(2).replace('.', ',') + ' R de frais en moyenne ; ceux de 2 % et plus, ' + g.toFixed(2).replace('.', ',') + ' R : l’écart est ce que gagnent les décisions en H1 / H4 (stops larges).'); }
  const pm = partMangee(lignes.filter(l => l.n >= 100)); if (pm != null) L.push('Dans ' + Math.round(pm * 100) + ' % des cases (famille × actif × taille de stop) qui montrent un avantage brut positif, les frais en mangent plus de la moitié.');
  if (detruit.length) { const d = detruit[0]; L.push('Plus gros avantage détruit : « ' + d.famille + ' » sur ' + d.paire + ', stops ' + d.bande + ' : ' + z(d.brute).toFixed(2).replace('.', ',') + ' R par trade avant frais, ' + z(d.nette).toFixed(2).replace('.', ',') + ' R après (frais : ' + d.couts.toFixed(2).replace('.', ',') + ' R).'); }
  else L.push('Aucune case avec assez de trades ne montre un avantage brut positif détruit par les frais : là où il n’y a pas d’avantage avant frais, les frais ne sont pas le seul problème.');
  const h = (hasard || []).filter(x => x && x.essais); if (h.length) L.push('Le hasard (entrées aléatoires, mêmes coûts) donne ' + moyenne(h.map(x => x.esperanceMoyenne)).toFixed(2).replace('.', ',') + ' R par trade en moyenne : c’est le plancher à battre, et il est négatif parce que les frais sont un coût certain.');
  return { lignes: L, detruit: detruit.slice(0, 10), coutMoyen, nTotal };
}
export { BANDES_STOP, tauxEquilibre };
