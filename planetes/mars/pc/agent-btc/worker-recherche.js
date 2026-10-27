import { rechercher } from './boucle.js';

/* ═════════════ WORKER DE NAVIGATEUR : la recherche de stratégie tourne ICI, jamais sur le thread de l'interface ni dans le Worker Cloudflare ═════════════
   Messages reçus : { type: 'demarrer', m15, config, budget, coffre, nVarianteDepart, charge, generationsMax } | { type: 'arret' }.
   Messages émis : { type: 'journal' | 'progres' | 'fin', … } (les mêmes événements que boucle.js). charge : 'max' (aucune pause), 'normale' (petite pause), 'douce' (la moitié du processeur : pour jouer en même temps). */
let arret = false;
const PAUSE_MS = { max: 0, normale: 8, douce: 40 };
self.onmessage = async e => {
  const m = e.data;
  if (m.type === 'arret') { arret = true; return; }
  if (m.type !== 'demarrer') return;
  arret = false;
  const pause = PAUSE_MS[m.charge] == null ? PAUSE_MS.normale : PAUSE_MS[m.charge];
  try {
    await rechercher({ m15: m.m15, config: m.config || {}, budget: m.budget || {}, coffre: m.coffre || { ouverts: [] }, nVarianteDepart: m.nVarianteDepart || 0, generationsMax: m.generationsMax || 2, criteres: m.criteres || undefined, ...(m.familles ? { familles: m.familles } : {}), derivBrut: m.derivBrut || null,
      surEvenement: ev => self.postMessage(ev), cede: () => new Promise(r => setTimeout(r, pause)), arret: () => arret });
  } catch (err) { self.postMessage({ type: 'erreur', message: String(err && err.message || err) }); }
};
