/* ═════════════ POINT D'ENTRÉE DU MODULE ANATOMIE & ORTHOPÉDIE ═════════════
   Chargé à la demande (import dynamique) par js/rayle/commandes-anatomie.js et par les boutons des fenêtres.
   Architecture (voir docs/anatomie-3d.md) :
     store.js            état global (calques, sélection, isolation, pathologies, appareillage, fenêtres)
     donnees-*.js        contenu (os, muscles, nerfs, organes, repères, amputations, scolioses, fractures, appareillages, matériaux)
     registre.js         recherche par nom, fiches, liens os ↔ muscles
     construction.js     géométries procédurales (repli sans modèle GLB)  ·  modeles-glb.js : modèles GLB optionnels
     moteur.js           scène three.js : calques, isolation, caméra, sélection, plans de coupe
     appareils3d.js      prothèses, corsets, orthèses, appuis et décharges
     fenetre.js          fenêtre plein écran  ·  quickview.js : pop-up 3D flottant
     cours.js            base de connaissances (cours de l'utilisateur)  ·  commandes.js : ordres de Raylé */
import { useAnatomieStore as S, actions as A } from './store.js?v=2026.10.13.8';

export { afficherQuick, fermerQuick, quickOuvert } from './quickview.js?v=2026.10.13.8';
export { analyser, executer } from './commandes.js?v=2026.10.13.8';
export { chercher as chercherCours, contexte as contexteCours, lister as listerCours } from './cours.js?v=2026.10.13.8';
export { trouver, fiche, resume } from './registre.js?v=2026.10.13.8';
export { useAnatomieStore, actions } from './store.js?v=2026.10.13.8';

/** Ouvre la fenêtre Anatomie & Orthopédie ; options : { onglet, selection, isoler } */
export async function ouvrirAnatomie(options = {}) {
  if (window.RayleBus && RayleBus.demander('vue') !== 'anatomie') await RayleBus.demander('vue:ouvrir-anatomie', options.onglet ? { onglet: options.onglet } : null);
  for (let i = 0; i < 40 && !S.obtenir().fenetre.ouverte; i++) await new Promise(r => setTimeout(r, 50));
  if (options.selection) { A.selectionner(options.selection); if (options.isoler) A.isoler(options.selection); }
}
