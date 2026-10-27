import { construireContexte } from '../agent-btc/contexte.js';
import { decouper } from '../agent-btc/evaluation.js';
import { testerStrategie } from './test-ms.js';
import { avancerMS } from './alertes-ms.js';

/* ═════════════ WORKER DE NAVIGATEUR : les tests et le suivi des alertes de « Teste ma stratégie » tournent ICI (jamais sur le fil de l'interface, jamais dans le Worker Cloudflare) ═════════════
   Messages : { id, type: 'tester', m15, strat, config, nVariantes, tirages, graine }  →  { id, type: 'resultat', rapport }
              { id, type: 'avancer', fenetres: [m15…], strategies, etat, paire, config }  →  { id, type: 'alertes', alertes, etat }      (une fenêtre par bougie à traiter, de la plus ancienne à la plus récente)
   Même protocole en processus (tests Node) : voir ms-page.js `calculateurEnProcessus`. */
export function traiter(m) {
  if (m.type === 'tester') {
    const ctx = construireContexte(m.m15), decoupe = decouper(m.m15);
    return { id: m.id, type: 'resultat', rapport: testerStrategie({ ctx, strat: m.strat, decoupe, config: m.config || {}, nVariantes: m.nVariantes || 1, tirages: m.tirages == null ? undefined : m.tirages, graine: m.graine }) };
  }
  if (m.type === 'avancer') {
    let etat = m.etat; const alertes = [];
    for (const f of m.fenetres) { const r = avancerMS({ etat, ctx: construireContexte(f), strategies: m.strategies, paire: m.paire, config: m.config || {} }); etat = r.etat; alertes.push(...r.alertes); }
    return { id: m.id, type: 'alertes', alertes, etat };
  }
  return { id: m.id, type: 'erreur', message: 'message inconnu : ' + m.type };
}
if (typeof self !== 'undefined' && typeof window === 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = e => { try { self.postMessage(traiter(e.data)); } catch (err) { self.postMessage({ id: e.data && e.data.id, type: 'erreur', message: String(err && err.message || err) }); } };
}
