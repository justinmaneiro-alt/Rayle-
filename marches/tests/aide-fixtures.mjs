// Faux réseau rejouant les VRAIES réponses enregistrées (fixtures/reponses.json) ; partagé par les tests Node et Chrome.
import fs from 'node:fs';
import { creerHub } from '../donnees/hub.js';
export const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/reponses.json', import.meta.url), 'utf8'));
export const T0 = Date.parse(fx.enregistreLe);
export const cle = u => String(u).replace(/start_timestamp=\d+&end_timestamp=\d+/, 'DVOL').replace(/cosd=\d{4}-\d{2}-\d{2}/, 'cosd=X').replace(/\/v1\/\d{4}-\d{2}-\d{2}\.\./, '/v1/DEBUT..').replace(/&timespan=\w+/, '');
const index = new Map(Object.entries(fx.reponses).map(([u, r]) => [cle(u), r]));
/* surcharge : objet MODIFIABLE { motif: { status, corps } | 'reseau' } (les tests Chrome le changent en cours de route) */
export const fauxReseau = (surcharge = {}) => async (url) => {
  for (const [motif, rep] of Object.entries(surcharge)) if (String(url).includes(motif)) { if (rep === 'reseau') throw new TypeError('fetch failed'); return new Response(rep.corps, { status: rep.status }); }
  const r = index.get(cle(url)); if (!r) return new Response('absent des fixtures : ' + url, { status: 404 });
  return new Response(r.corps, { status: r.status });
};
export const hubFixtures = (surcharge = {}, maintenant = () => Date.now()) => creerHub({ fetch: fauxReseau(surcharge), maintenant, env: {}, attente: async () => {} });
