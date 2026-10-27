import { PAIRES } from './paires.js';

/* ═════════════ COÛT D'EXÉCUTION PAR STRATÉGIE, EN R PAR TRADE (M6 ; module pur, testé : m6-fiabilite-test.mjs) ═════════════
   Un trade coûte : frais à l'entrée et à la sortie (en % du montant), spread (l'écart acheteur / vendeur : on paie la moitié à l'entrée, la moitié à la sortie) et glissement (l'ordre au marché
   s'exécute un peu plus loin). Exprimé en R (le risque pris : distance au stop), le coût vaut  (2·frais + spread + 2·glissement) ÷ distance au stop (en %). Plus le stop est PROCHE, plus les frais pèsent :
   c'est pourquoi les signaux en H1 / H4 (stops larges) souffrent moins que ceux en M15.
   Les valeurs de Kraken Prop ne sont pas publiées par l'API : les coûts sont RÉGLABLES, avec des valeurs prudentes par paire (à vérifier dans le contrat). Changer ces coûts après avoir vu un résultat
   est de la sur-optimisation : ne le faire que si ce sont les VRAIS coûts. */
export const COUTS_DEFAUT = Object.freeze({ BTC: PAIRES.BTC.couts, SOL: PAIRES.SOL.couts, DOGE: PAIRES.DOGE.couts });

export function coutsDe(idPaire, surcharge = {}) { return { ...(COUTS_DEFAUT[idPaire] || PAIRES.BTC.couts), ...surcharge }; }
export const configMoteurDe = (idPaire, surcharge = {}) => { const c = coutsDe(idPaire, surcharge); return { fraisPct: c.fraisPct, spreadPct: c.spreadPct, glissementPct: c.glissementPct }; };

/* Coût en R d'un trade dont le stop est à distancePct % du prix d'entrée. */
export function coutEnR(cfg, distancePct) {
  if (!(distancePct > 0)) return null;
  const frais = 2 * cfg.fraisPct / distancePct, spread = cfg.spreadPct / distancePct, glissement = 2 * cfg.glissementPct / distancePct;
  return { frais, spread, glissement, total: frais + spread + glissement };
}
/* Décompose le coût moyen d'une liste de trades { distancePct, R, coutsR… } : valeur théorique (par la distance au stop) et part déjà déduite des R rapportés. */
export function coutMoyenTrades(trades, cfg) {
  const t = trades.filter(x => x.distancePct > 0);
  if (!t.length) return { n: 0, total: null, frais: null, spread: null, glissement: null, distanceMoyennePct: null, phrase: 'pas de trade : coût inconnu' };
  let f = 0, s = 0, g = 0, d = 0;
  for (const x of t) { const c = coutEnR(cfg, x.distancePct); f += c.frais; s += c.spread; g += c.glissement; d += x.distancePct; }
  const n = t.length, r = { n, frais: f / n, spread: s / n, glissement: g / n, total: (f + s + g) / n, distanceMoyennePct: d / n };
  r.phrase = 'Coût moyen ' + r.total.toFixed(2).replace('.', ',') + ' R par trade (frais ' + r.frais.toFixed(2).replace('.', ',') + ' + spread ' + r.spread.toFixed(2).replace('.', ',') + ' + glissement ' + r.glissement.toFixed(2).replace('.', ',') + ') pour un stop moyen à ' + r.distanceMoyennePct.toFixed(2).replace('.', ',') + ' % du prix.';
  return r;
}
/* Sensibilité : que devient l'espérance si les coûts réels sont m fois ceux supposés ? Approximation (les R rapportés contiennent déjà 1× les coûts) ; sert à juger la fragilité, jamais à choisir. */
export function sensibiliteCouts(trades, cfg, multiples = [0.5, 1, 1.5, 2]) {
  const t = trades.filter(x => x.distancePct > 0); if (!t.length) return [];
  return multiples.map(m => {
    let somme = 0; for (const x of t) { const c = coutEnR(cfg, x.distancePct).total; somme += x.R - (m - 1) * c; }
    return { multiple: m, esperance: somme / t.length, Rtotal: somme };
  });
}
/* La stratégie survit-elle à des coûts 1,5 fois plus élevés ? (information, pas un critère de validation) */
export const phraseFragilite = sens => {
  const s15 = sens.find(x => x.multiple === 1.5), s1 = sens.find(x => x.multiple === 1); if (!s15 || !s1) return '';
  return s15.esperance > 0 ? 'Avec des coûts 50 % plus élevés, l’espérance reste positive (' + s15.esperance.toFixed(2).replace('.', ',') + ' R).' : 'Avec des coûts 50 % plus élevés, l’espérance devient négative (' + s15.esperance.toFixed(2).replace('.', ',') + ' R) : stratégie FRAGILE face aux frais.';
};
