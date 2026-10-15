// Planète « mars » : l'intérieur est la BASE MARTIENNE (atterrissage, rovers Perseverance et Curiosity, pièces cliquables), chargée à la demande
// (js/univers/espace/vue-mars.js) et détruite à la sortie : la mémoire de Mars est rendue.
import { interieurVue } from '../commun.js?v=2026.10.15.7';
export default interieurVue({
  id: 'mars', vue: 'mars',
  optionsEntree: o => ({ mode: o.mode || 'rover', rover: o.rover, force: true }),
  texteEntree: 'Me voici sur Mars, au sol, près du rover. Dis « atterris sur Mars » pour l’atterrissage, ou « retour au système solaire » pour ressortir.',
  texteSortie: 'Je quitte Mars.',
});
