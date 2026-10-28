import { combinaisons } from '../planetes/mars/pc/agent-btc/hypotheses.js';
import { evaluerVariante } from '../planetes/mars/pc/agent-btc/evaluation.js';
import { famille } from './familles-v3.js';
import './familles-v4.js';
import { comparerMakerTaker } from './simulateur-riche.js';
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

/* Entrée au MARCHÉ (taker) contre entrée à COURS LIMITÉ (maker) pour une famille qui offre le choix (paramètre `entree`) : mêmes signaux, mêmes autres paramètres, deux façons d'entrer. Regroupe jusqu'à
   `maxVariantes` variantes (réparties dans la grille) et rend : trades, espérance et coût moyen de chaque façon, taux de remplissage, ordres jamais remplis, ordres « partis sans nous », espérance des trades MANQUÉS
   (si elle est positive, l'ordre limité rate justement les bons trades : c'est la sélection adverse) et part de remplissages « adverses » (la bougie de remplissage se referme contre nous). Des chiffres, jamais un verdict. */
export function comparerEntreesFamille(ctx, id, config, plage, { maxVariantes = 12 } = {}) {
  const fam = famille(id), g = fam && fam.grille(0); if (!g || !Array.isArray(g.entree) || !g.entree.includes('limite') || !g.entree.includes('marche')) return null;
  const toutes = combinaisons({ ...g, entree: ['marche'] }), pas = Math.max(1, Math.floor(toutes.length / maxVariantes)), choisies = toutes.filter((_, i) => i % pas === 0).slice(0, maxVariantes);
  const acc = { marche: { n: 0, R: 0, cout: 0 }, limite: { n: 0, R: 0, cout: 0 }, poses: 0, remplis: 0, nonRemplis: 0, partis: 0, adverses: 0, manques: 0, manquesR: 0, remplisMemesSignauxN: 0, remplisMemesSignauxR: 0 };
  for (const p of choisies) {
    const sm = fam.signaux(ctx, { ...p, entree: 'marche' }), sl = fam.signaux(ctx, { ...p, entree: 'limite' }), c = comparerMakerTaker(ctx.m15, sm, sl, config, plage);
    acc.marche.n += c.marche.n; acc.marche.R += (c.marche.esperance || 0) * c.marche.n; acc.marche.cout += (c.marche.couts || 0) * c.marche.n; acc.limite.n += c.limite.n; acc.limite.R += (c.limite.esperance || 0) * c.limite.n; acc.limite.cout += (c.limite.couts || 0) * c.limite.n;
    const o = c.limite.ordres; acc.poses += o.poses; acc.remplis += o.remplis; acc.nonRemplis += o.nonRemplis; acc.partis += o.partisSansNous; acc.adverses += o.adverses;
    acc.manques += c.selectionAdverse.nManques; acc.manquesR += (c.selectionAdverse.esperanceDesTradesManques || 0) * c.selectionAdverse.nManques;
  }
  const moy = (s, n) => (n ? s / n : null);
  return { id, nom: fam.nom, variantes: choisies.length, marche: { n: acc.marche.n, esperance: moy(acc.marche.R, acc.marche.n), couts: moy(acc.marche.cout, acc.marche.n) }, limite: { n: acc.limite.n, esperance: moy(acc.limite.R, acc.limite.n), couts: moy(acc.limite.cout, acc.limite.n) },
    ordres: { poses: acc.poses, remplis: acc.remplis, nonRemplis: acc.nonRemplis, partisSansNous: acc.partis }, tauxRemplissage: acc.poses ? acc.remplis / acc.poses : null, partAdverse: acc.remplis ? acc.adverses / acc.remplis : null,
    tradesManques: acc.manques, esperanceTradesManques: moy(acc.manquesR, acc.manques) };
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
