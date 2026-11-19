/* Phrase parlée / affichée pour le meilleur candidat de couverture (partagée par la fenêtre Couverture et la voix de Rayle). Module pur.
   v3 : on lit la phrase claire (sens à prendre, pourquoi), le taux de protection mesuré et le coût (voir protection.js). */
import { phraseClaire, NIVEAUX, LIBELLE_VERDICT } from './protection.js';
import { parId } from './calcul.js';
const nfr = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ') : '?');
/* actifNom : nom de l'actif couvert (« Or ») ; idCouv : id de l'univers (facultatif, donne l'article « l'or ») */
export function phraseCouverture(actifNom, sens, x, notionnel = null, niveau = NIVEAUX[2]) {
  if (!x) return 'Je n’ai pas assez de données pour proposer une couverture de ' + actifNom + '.';
  const actif = Object.values(parId).find(a => a.nom === actifNom) || { nom: actifNom, art: actifNom.toLowerCase(), de: 'de ' + actifNom.toLowerCase() };
  const P = x.protection ? phraseClaire(actif, sens, x, niveau, notionnel) : null;
  if (!P) return `Pour couvrir ${sens > 0 ? 'un achat' : 'une vente'} sur ${actifNom}, le meilleur candidat est ${x.nom} en ${x.sensCouverture > 0 ? 'achat' : 'vente'}.`;
  const bt = x.backtest ? ` Sur les ${x.backtest.jours} derniers jours, sans regarder l’avenir, la volatilité aurait baissé de ${nfr(x.backtest.reductionVol * 100)} pour cent.` : '';
  const consigne = P.consigne.charAt(0).toUpperCase() + P.consigne.slice(1);
  return `${P.ta}. ${consigne} ${P.pourquoi} ${P.protege} ${P.cout} Verdict : ${LIBELLE_VERDICT[x.verdict.niveau] || x.verdict.niveau}.${bt} ${P.pedago}`.replace(/\s+/g, ' ').trim();
}
