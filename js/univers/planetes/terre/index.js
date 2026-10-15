// Planète « terre » : l'intérieur est la CARTE DU MONDE (le globe interactif du thème Espace : pays, océans, actualités, satellites, ISS).
// Le globe fait partie du cœur du thème : il est déjà en mémoire quand on ouvre l'Univers, entrer n'a donc rien à importer ; sortir ramène au système solaire.
import { interieurVue } from '../commun.js?v=2026.10.15.3';
export default interieurVue({
  id: 'terre', vue: 'terre',
  texteEntree: 'Me voici sur la Terre : la carte du monde. Glisse pour tourner, pince pour zoomer, touche un pays. Dis « retour au système solaire » pour ressortir.',
  texteSortie: 'Je quitte la Terre.',
});
