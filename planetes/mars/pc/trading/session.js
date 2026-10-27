import { creerClient } from './client.js';
import { ouvrirStockage } from './stockage.js';

/* Le client des données de marché, un seul par page (partagé par la table, l'espace de travail et les ordres vocaux). Le Worker est celui de Raylé (⚙ Réglages) ;
   `workerReady` est un `const` de script classique : on l'appelle par son nom, pas par `window`. */
let promesse = null;
const workerPret = () => { try { return typeof workerReady === 'function' && !!workerReady(); } catch (e) { return false; } };
export function obtenirClient(surcharge = null) {
  if (surcharge) { promesse = Promise.resolve(surcharge); return promesse; }   // tests : client factice
  if (!promesse) promesse = (async () => {
    const stockage = await ouvrirStockage();
    return creerClient({ stockage, appeler: path => { if (!workerPret()) return Promise.reject(new Error('Worker non configuré (⚙ Réglages de Raylé)')); return window.wjson(path, 20000); } });
  })();
  return promesse;
}
export const oublierClient = () => { promesse = null; };
