/* Client du calcul des marchés : Worker de module si possible, sinon calcul sur le fil principal (toujours une promesse : l'affichage n'est jamais bloqué). */
import { repondre } from './calcul-dispatch.js';
let worker = null, essai = false, n = 0; const attentes = new Map();
function obtenir() {
  if (essai) return worker; essai = true;
  try {
    worker = new Worker(new URL('./calcul-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = e => { const a = attentes.get(e.data.id); if (!a) return; attentes.delete(e.data.id); e.data.ok ? a.ok(e.data.resultat) : a.ko(new Error(e.data.erreur)); };
    worker.onerror = () => { const L = [...attentes.values()]; attentes.clear(); worker = null; L.forEach(a => a.ko(new Error('calcul interrompu'))); };
  } catch (e) { worker = null; }
  return worker;
}
export function calculer(message, { delaiMs = 60000 } = {}) {
  const w = obtenir();
  if (!w) return repondre(message);
  return new Promise((ok, ko) => {
    const id = ++n, t = setTimeout(() => { attentes.delete(id); ko(new Error('calcul trop long')); }, delaiMs);
    attentes.set(id, { ok: v => { clearTimeout(t); ok(v); }, ko: e => { clearTimeout(t); ko(e); } }); w.postMessage({ ...message, id });
  }).catch(e => (/interrompu/.test(e.message) ? repondre(message) : Promise.reject(e)));
}
export const arreter = () => { if (worker) { worker.terminate(); worker = null; essai = false; attentes.clear(); } };
