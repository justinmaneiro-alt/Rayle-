/* Génère le nuage de neurones hors du fil principal (la page reste fluide pendant ~0,6 s sur PC, plus sur téléphone).
   Reçoit {N?, graine?} ; renvoie les tableaux prêts pour le GPU (transférés, pas copiés). */
import { genererReseau } from '../../galaxie/reseau.js';
import { preparerDonnees } from './donnees-reseau.js';

self.onmessage = e => {
  try {
    const t0 = performance.now();
    const r = genererReseau(e.data && e.data.N, e.data && e.data.graine), d = preparerDonnees(r);
    const sortie = { N: r.N, pos: r.pos, poids: r.poids, hub: r.hub, maxParArete: r.maxParArete, donnees: d, ms: Math.round(performance.now() - t0) };
    const a = [r.pos.buffer, r.poids.buffer, r.hub.buffer, r.maxParArete.buffer, ...['graine', 'pL', 'aU', 'aPh', 'aV', 'aW', 'aGr', 'aRad'].map(k => d[k].buffer)];
    self.postMessage(sortie, a);
  } catch (err) { self.postMessage({ erreur: String(err && err.message || err) }); }
};
