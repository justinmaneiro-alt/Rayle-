/* ═════════════ CRITÈRES D'ACCEPTATION — ÉCRITS AVANT TOUT TEST (M3b) ═════════════
   Ces seuils sont fixés ici, une fois pour toutes, AVANT de regarder le moindre résultat, et ne sont jamais ajustés après coup pour « faire passer » une stratégie. Le journal d'expériences
   enregistre la version des critères et leur empreinte au début de chaque recherche. Les modifier = nouvelle version, nouveau jeu de données final (le jeu final déjà ouvert reste brûlé).
   Unité : R = multiple du risque pris sur un trade, frais, spread et glissement déjà déduits. */
export const CRITERES = Object.freeze({
  version: 1,
  figesLe: '2026-10-21',
  decoupage: Object.freeze({
    fractionRecherche: 0.75,        // premiers 75 % des données : recherche + walk-forward ; derniers 25 % (≈ 1 an) : JEU FINAL, intouché, ouvert UNE seule fois
    entrainementMois: 12,           // premier bloc d'entraînement du walk-forward
    blocTestMois: 6,                // chaque bloc de test hors échantillon (le bloc d'entraînement s'allonge ensuite : fenêtre croissante)
    moisMinHistorique: 24           // en dessous, on refuse de chercher (trop court pour séparer entraînement, test et validation)
  }),
  recherche: Object.freeze({        // pour qu'une famille passe de l'entraînement au walk-forward
    tradesMin: 30, esperanceMin: 0.1, factProfitMin: 1.05
  }),
  horsEchantillon: Object.freeze({  // walk-forward : tous les blocs de test mis bout à bout, paramètres rechoisis à chaque bloc sur l'entraînement seulement
    esperanceMin: 0.25,             // espérance NETTE moyenne ≥ +0,25 R par trade
    tradesMin: 40,                  // au moins 40 trades hors échantillon
    factProfitMin: 1.3,
    drawdownMaxR: 12,               // creux maximal de la courbe en R
    parSemaineMax: 5,               // jamais plus de 5 positions par semaine en moyenne (pas de scalping)
    parSemaineMin: 0.2,             // au moins 1 position toutes les 5 semaines (sinon l'échantillon est trop rare pour juger)
    trimestresPositifsMin: 0.6,     // au moins 60 % des trimestres (≥ 2 trades) ont un total en R positif
    trimestresTradesMin: 2,
    concentrationMax: 0.35          // le meilleur trade ne fait pas plus de 35 % du gain brut (pas de coup de chance isolé)
  }),
  robustesse: Object.freeze({       // paramètres retenus sur toute la zone de recherche, voisins = un paramètre décalé d'un cran
    voisinsPositifsMin: 0.7,        // ≥ 70 % des voisins ont une espérance positive
    voisinsMin: 4,                  // au moins 4 voisins testables
    medianeVoisinsVsMeilleur: 0.5   // l'espérance médiane des voisins ≥ 50 % de celle du meilleur (pas un pic isolé)
  }),
  monteCarlo: Object.freeze({
    simulations: 2000,
    drawdownP95MaxR: 20,            // 95 % des ordres possibles des trades donnent un creux ≤ 20 R
    esperanceP5Min: 0               // rééchantillonnage : le 5e centile de l'espérance reste > 0
  }),
  comparaisonsMultiples: Object.freeze({
    facteur: 1.0                    // l'espérance hors échantillon doit dépasser σ·√(2 ln N)/√n (maximum attendu du hasard parmi N variantes testées)
  }),
  jeuFinal: Object.freeze({         // ouvert une seule fois, avec les paramètres figés
    esperanceMin: 0, tradesMin: 12, factProfitMin: 1.15, drawdownMaxR: 12, parSemaineMax: 5
  })
});

/* Empreinte courte et stable des critères (affichée dans le journal). */
export function empreinteCriteres(c = CRITERES) {
  const s = JSON.stringify(c); let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
export function texteCriteres(c = CRITERES) {
  const o = c.horsEchantillon, r = c.robustesse, m = c.monteCarlo, f = c.jeuFinal, d = c.decoupage;
  return [
    'Découpage : ' + Math.round(d.fractionRecherche * 100) + ' % des données pour la recherche et le walk-forward (entraînement ' + d.entrainementMois + ' mois, puis blocs de test de ' + d.blocTestMois + ' mois), le reste en jeu final ouvert une seule fois.',
    'Hors échantillon : espérance nette ≥ +' + o.esperanceMin + ' R, au moins ' + o.tradesMin + ' trades, facteur de profit ≥ ' + o.factProfitMin + ', creux ≤ ' + o.drawdownMaxR + ' R, entre ' + o.parSemaineMin + ' et ' + o.parSemaineMax + ' positions par semaine, ≥ ' + Math.round(o.trimestresPositifsMin * 100) + ' % de trimestres positifs, meilleur trade ≤ ' + Math.round(o.concentrationMax * 100) + ' % du gain brut.',
    'Robustesse : ≥ ' + Math.round(r.voisinsPositifsMin * 100) + ' % de voisins positifs (au moins ' + r.voisinsMin + '), médiane des voisins ≥ ' + Math.round(r.medianeVoisinsVsMeilleur * 100) + ' % du meilleur.',
    'Monte Carlo (' + m.simulations + ' tirages) : creux au 95e centile ≤ ' + m.drawdownP95MaxR + ' R ; espérance au 5e centile > ' + m.esperanceP5Min + '.',
    'Comparaisons multiples : l’espérance doit dépasser le maximum attendu du hasard parmi toutes les variantes testées (σ·√(2 ln N)/√n).',
    'Jeu final (une seule ouverture) : espérance ≥ ' + f.esperanceMin + ' R, au moins ' + f.tradesMin + ' trades, facteur de profit ≥ ' + f.factProfitMin + ', creux ≤ ' + f.drawdownMaxR + ' R.'
  ];
}
