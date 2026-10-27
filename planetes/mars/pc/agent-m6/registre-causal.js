import { FAMILLES_ICT, ORDRE_ICT } from './ict.js';
import { combinaisons } from '../agent-btc/hypotheses.js';

/* Registre des détecteurs et indicateurs ajoutés par M6, contrôlés par le test du poison du futur (planetes/mars/tests/m6-poison-test.mjs).
   Chaque entrée : { nom, type: 'signaux' | 'colonnes', calculer(serie, ctxDe) } où ctxDe(serie) construit le contexte du moteur. Ajouter un détecteur = ajouter ici une entrée (le test échoue
   s'il y a la moindre fuite du futur, et refuse un registre sans ICT). */
export const REGISTRE_DETECTEURS_M6 = [];
for (const id of ORDRE_ICT) {
  const liste = combinaisons(FAMILLES_ICT[id].grille(0)), jeux = [liste[0], liste[Math.floor(liste.length / 3)], liste[Math.floor(liste.length * 2 / 3)], liste[liste.length - 1]];
  jeux.forEach((p, k) => REGISTRE_DETECTEURS_M6.push({ nom: id + ' #' + (k + 1), type: 'signaux', calculer: (s, ctxDe) => FAMILLES_ICT[id].signaux(ctxDe(s), p) }));
}
