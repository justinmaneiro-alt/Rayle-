// Démarrage de Rayle : on atterrit directement dans l'univers, thème unique « système solaire », écran sans interface.
// La scène vient de js/univers/ (noyau + thème). Le toucher sert seulement à tourner / zoomer (OrbitControls) : on coupe la sélection
// des planètes ; on se déplace à la voix (rayle/univers-voix.js) ou avec le petit menu (rayle/menu-planetes.js).
// window.RayleMonde : ce que Rayle (scripts classiques) appelle pour piloter la caméra.
import * as noyau from './univers/noyau.js?v=2026.10.15.8';

const pret = (async () => {
  const inst = await noyau.ouvrir('espace');
  inst.tap = null;
  await inst.commande('systeme', {});
  return inst;
})();
pret.catch(e => console.error('[rayle] démarrage', e));
window.RayleMonde = { pret, commande: async (nom, args = {}) => { await pret; return noyau.commande(nom, args); }, etat: noyau.etat };

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js?v=2026.10.15.8').then(r => { try { r.update(); } catch (e) {} }).catch(() => {});
}
