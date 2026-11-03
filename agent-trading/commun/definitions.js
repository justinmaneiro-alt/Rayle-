/* ═════════════ UNE DÉFINITION PAR CHIFFRE (bouton ⓘ) ═════════════ */
export const DEFINITIONS = {
  capital: 'Capital = départ (10 000 $) + gains et pertes réalisés + gain ou perte flottant des positions ouvertes, au dernier prix échangé chez Kraken.',
  realise: 'Somme des P&L des positions clôturées, frais et glissement déduits.',
  flottant: 'Gain ou perte des positions encore ouvertes si on les fermait au dernier prix échangé (frais d’entrée déjà déduits, frais de sortie pas encore).',
  semaine: '« Cette semaine » = capital actuel − capital du lundi 00:00 (heure de Paris), flottant inclus.',
  objectif: 'Objectif de la semaine : un gain en % du capital du lundi 00:00. Indicatif : l’agent ne prend pas plus de risque pour l’atteindre.',
  baisseMax: 'Baisse max = la plus forte chute du capital depuis son plus haut (flottant inclus), mesurée chaque minute.',
  limite: 'Limite simulée : perte maximale autorisée, en % du départ. Mode statique = mesurée depuis le capital de départ ; mode suiveuse = depuis le plus haut atteint. Si elle est franchie : bandeau « LIMITE DÉPASSÉE » et plus aucune nouvelle proposition.',
  risque: 'Risque par trade = 0,5 % du capital RÉALISÉ (sans le flottant). Quantité = risque ÷ |entrée − stop|, arrondie au pas de lot de Kraken.',
  risqueOuvert: 'Somme des pertes possibles si tous les stops ouverts étaient touchés, en $ et en % du capital.',
  levier: 'Levier total = valeur des positions ouvertes ÷ capital. Orange au-dessus de 2, rouge au-dessus de 4.',
  r: 'R = résultat divisé par le risque prévu. +2 R = on a gagné deux fois ce qu’on risquait ; −1 R = le stop a été touché.',
  rMoyen: 'R moyen des trades clôturés, avec son intervalle de confiance à 95 % : la vraie moyenne a 95 % de chances d’être dans cette fourchette.',
  statut: 'RENTABLE : au moins 30 trades et la borne basse de l’intervalle de confiance au-dessus de 0. NON RENTABLE : au moins 30 trades et moyenne négative. Sinon : PAS ENCORE PROUVÉ.',
  echantillon: 'Sous 100 trades, les chiffres bougent beaucoup d’un trade à l’autre : on ne peut pas encore conclure.',
  frais: 'Frais = 0,05 % de la valeur à l’entrée et à la sortie (tarif preneur Kraken Futures). Glissement = écart entre le prix prévu et le prix obtenu (stop : parcours réel du carnet + 1 pas de prix).',
  version: 'Numéro de l’état publié par le moteur (il augmente à chaque envoi) et heure du dernier échange reçu de Kraken.',
  volumeNet: 'Volume net (delta) = volume des acheteurs agressifs − volume des vendeurs agressifs dans la bougie. CVD = somme des deltas. Réel seulement depuis le début de l’enregistrement.',
  profil: 'Profil de volume : volume échangé à chaque prix. POC = prix le plus échangé ; VAH / VAL = haut et bas de la zone où 70 % du volume s’est échangé.'
};
