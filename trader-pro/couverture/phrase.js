/* Phrase parlée / affichée pour le meilleur candidat de couverture (partagée par la fenêtre Couverture et la voix de Rayle). Module pur. */
const fr2 = v => (v == null ? '—' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(2).replace('.', ','));
const nfr = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ') : '?');
export function phraseCouverture(actifNom, sens, x, notionnel = null) {
  if (!x) return 'Je n’ai pas assez de données pour proposer une couverture de ' + actifNom + '.';
  const verdict = x.verdict.niveau === 'fiable' ? 'fiable' : x.verdict.niveau === 'fragile' ? 'fragile' : 'à éviter';
  const taille = notionnel ? `Taille conseillée : environ ${nfr(x.tailleNotionnel)} euros de notionnel, soit ${nfr(x.tailleRelative * 100)} pour cent de la position. ` : `Taille conseillée : ${nfr(x.tailleRelative * 100)} pour cent du notionnel de la position. `;
  const bt = x.backtest ? `Sur les ${x.backtest.jours} derniers jours, sans regarder l’avenir, la volatilité aurait baissé de ${nfr(x.backtest.reductionVol * 100)} pour cent. ` : '';
  return `Pour couvrir ${sens > 0 ? 'un achat' : 'une vente'} sur ${actifNom}, le meilleur candidat est ${x.nom} en ${x.sensCouverture > 0 ? 'achat' : 'vente'}. Corrélation sur 250 jours : ${fr2(x.c250)}. Verdict : ${verdict}. ${taille}${bt}Une corrélation passée ne garantit pas la suite.`;
}
