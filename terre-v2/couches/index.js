/* ═════════════ TERRE 2.0 : REGISTRE DES COUCHES ═════════════
   Chaque couche : { id, nom, legende, sourceCourte, credit, intervalle (ms, rafraîchissement), cle? (réglage requis), procedure?, creer(ctx) → { activer, rafraichir, desactiver, etat } }.
   ctx = { Cesium, viewer, reglages, relais, dire, chargerScript }. Une erreur dans activer/rafraichir → la couche s'éteint, la Terre continue (index.js). */
import { seismes } from './seismes.js';
import { avions } from './avions.js';
import { satellites } from './satellites.js';
import { meteo } from './meteo.js';
import { lancements } from './lancements.js';
import { bateaux } from './bateaux.js';
import { incendies } from './incendies.js';
import { cameras } from './cameras.js';

export const COUCHES = [seismes, avions, satellites, meteo, lancements, bateaux, incendies, cameras];
export const PAR_ID = Object.fromEntries(COUCHES.map(c => [c.id, c]));

export { json, centreVue, nouvelleSource, retirerSource, heureFr } from './outils.js';
