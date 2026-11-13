/* Fil de calcul (Worker de module) de l'historique des flèches v8 : le calcul ne bloque jamais l'interface.
   Messages reçus : { type:'historique', B, depart } → { type:'progres', v } puis { type:'fini', res } ; { type:'bilan', B, fleches, de, a } → { type:'bilan-fini', res }.
   Aucune règle ici : tout vient de fleches-historique-v1.js / fleches-simples-v8.js (figées). */
import { calculerHistorique } from './fleches-historique-v1.js';
import { analyserEnsembles } from './fleches-bilan-v1.js';
import { atrSerie } from './fleches-terminal-v1.js';
self.onmessage = async e => {
  const m = e.data || {};
  try {
    if (m.type === 'historique') { const res = await calculerHistorique(m.B, { depart: m.depart || 0, onProgres: v => self.postMessage({ type: 'progres', v }), cede: () => new Promise(r => setTimeout(r, 0)) }); self.postMessage({ type: 'fini', res }); }
    else if (m.type === 'segment') {   // un segment [a, b[ d'une longue série (S = série[lo, b[, contexte et recouvrement inclus) : plusieurs Workers en parallèle
      const r = await calculerHistorique(m.S, { depart: m.a - m.lo, onProgres: v => self.postMessage({ type: 'progres', v }), cede: () => new Promise(q => setTimeout(q, 0)) });
      const fl = r.fleches.map(f => ({ ...f, i: f.i + m.lo, indexDessin: f.indexDessin + m.lo, indexApparition: f.indexApparition + m.lo, touchI: f.touchI != null ? f.touchI + m.lo : undefined }));
      self.postMessage({ type: 'fini', res: { fleches: fl, retirees: r.retirees, invalidees: r.invalidees } });
    }
    else if (m.type === 'bilan') { const res = analyserEnsembles(m.B, atrSerie(m.B), m.fleches, { de: m.de || 0, a: m.a == null ? Infinity : m.a }); res.T = res.T.length; res.ens = Object.fromEntries(Object.entries(res.ens).map(([k, v]) => [k, v.length])); self.postMessage({ type: 'bilan-fini', res }); }
  } catch (err) { self.postMessage({ type: 'erreur', message: String(err && err.message || err) }); }
};
