/* ═════════════ FIL D'ACTUALITÉS PAR SUJETS : lecture depuis le Worker (/actualites/fil) ═════════════
   Cache de 5 minutes dans la page (le Worker garde le sien : 10 minutes, rafraîchi par sa tâche planifiée). Worker verrouillé, pas à jour ou source en panne :
   une erreur claire (jamais de sujets inventés). */
const TTL = 5 * 60 * 1000, memoire = new Map();
const workerOk = () => { try { return (typeof workerReady === 'function' && !!workerReady()); } catch (e) { return false; } };
const msg = e => { try { return window.errMsg(e); } catch (x) { return String((e && e.message) || e); } };

export async function chargerFil(portee, pays = '', { force = false } = {}) {
  const cle = portee + ':' + pays, c = memoire.get(cle);
  if (!force && c && Date.now() - c.t < TTL) return c.res;
  if (!window.wjson || !workerOk()) throw new Error('Worker verrouillé ou non configuré : déverrouillez Raylé pour voir l’actualité');
  let res;
  try { res = await window.wjson('/actualites/fil?portee=' + encodeURIComponent(portee) + (pays ? '&pays=' + encodeURIComponent(pays) : ''), 30000); }
  catch (e) {
    const m = msg(e);
    throw new Error(/404|introuvable|route inconnue|pas à jour/i.test(m) ? 'le Worker n’est pas à jour (route /actualites/fil absente) : il faut le déployer' : m);
  }
  if (!res || !Array.isArray(res.sujets)) throw new Error('réponse du Worker illisible');
  memoire.set(cle, { t: Date.now(), res });
  return res;
}
export const oublierFil = () => memoire.clear();
export const ageFil = (portee, pays = '') => { const c = memoire.get(portee + ':' + pays); return c ? Date.now() - c.t : Infinity; };
