/* Web Worker de la liste « Investissement » : filtrage, tri, scores et verdicts par horizon, saisonnalité de la fenêtre (module, voir calcul-liste.js).
   Messages : { type: 'init', lignes } · { type: 'saison', encodes, ref } · { type: 'calcul', n, params } → { type: 'resultat', n, ordre, verdicts, saison, comptes, total }. */
import { calculerListe } from './calcul-liste.js';
let lignes = [], encodes = null, ref = null, cache = new Map();
self.onmessage = e => {
  const m = e.data;
  try {
    if (m.type === 'init') { lignes = m.lignes; cache = new Map(); }
    else if (m.type === 'saison') { encodes = m.encodes; ref = m.ref; cache = new Map(); }
    else if (m.type === 'calcul') {
      const r = calculerListe(lignes, { ...m.params, encodes, ref, cache });
      self.postMessage({ type: 'resultat', n: m.n, ordre: r.ordre, verdicts: r.verdicts.map(v => ({ score: v.score, lib: v.lib, conf: v.conf, b: v.badges.map(b => b.id) })), saison: r.saison, comptes: r.comptes, total: r.total });
    }
  } catch (err) { self.postMessage({ type: 'erreur', n: m.n, message: String(err && err.message || err) }); }
};
