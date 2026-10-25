import { creerGestionnaire } from '../../../core/commun/gestionnaire-fenetres.js';
import { calculAnatomie } from './anatomie-fenetres-calcul.js';

/* ═════════════ ANATOMIE : FENÊTRES HOLOGRAPHIQUES ═════════════
   Fenêtres explicatives en HTML posées par-dessus la scène : toujours droites, face à l'écran, nettes (texte 14 px au moins), jamais tronquées par un bord, déplaçables
   par la barre de titre (souris ou doigt), redimensionnables par le coin ou à deux doigts, agrandissables, réductibles, fermables ; barre « Fenêtres » (tout réduire,
   réorganiser, tout fermer). Depuis R2 c'est le gestionnaire COMMUN (core/commun/gestionnaire-fenetres.js) avec le préfixe de style « saf » et le calcul de placement de la
   salle médicale (panneau de commande à gauche, modèle au centre). Positions mémorisées pour la visite de la salle. */
export function creerFenetres({ ui, ecran = () => ({ l: window.innerWidth, h: window.innerHeight }), surChangement = () => {}, surRanger = null }) {
  return creerGestionnaire({ ui, ecran, surChangement, prefixe: 'saf', calc: calculAnatomie, cle: 'anatomie', idRacine: 'sa-fenetres', vue: 'Anatomie', surRanger, rangeableParDefaut: id => !!surRanger && /^(fiche|mouvement|pathologie)/.test(id) });
}
