// Démarrage de Rayle : on atterrit directement dans l'univers, thème unique « système solaire », écran sans aucune interface.
// La scène vient de js/univers/ (noyau + thème). Le toucher sert seulement à tourner / zoomer (OrbitControls) : on coupe la sélection
// des planètes, puisqu'aucun bouton ne permettrait de revenir d'une planète.
import * as noyau from './univers/noyau.js?v=2026.10.15.7';

async function lancer() {
  const inst = await noyau.ouvrir('espace');
  inst.tap = null;
  await inst.commande('systeme', {});
}
lancer().catch(e => console.error('[rayle] démarrage', e));

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js?v=2026.10.15.7').then(r => { try { r.update(); } catch (e) {} }).catch(() => {});
}
