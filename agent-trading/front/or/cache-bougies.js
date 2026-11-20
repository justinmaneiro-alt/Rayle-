/* Copie locale des dernières bougies du graphique (IndexedDB) : à l'ouverture du terminal, le graphique s'affiche TOUT DE SUITE avec la dernière copie connue, puis le réseau la remplace.
   Rien n'est inventé : la copie est datée et remplacée dès que le réseau répond ; sans IndexedDB (navigation privée), le terminal fonctionne comme avant. */
const DB = 'rayle-or-cache', ST = 'historique', MAX = 40000;
let ouverture = null;
const ouvrir = () => ouverture || (ouverture = new Promise(res => { try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null); } catch (e) { res(null); } }));
export async function lireCacheBougies(cle) {
  const d = await ouvrir(); if (!d) return null;
  return new Promise(res => { try { const q = d.transaction(ST, 'readonly').objectStore(ST).get(cle); q.onsuccess = () => res(q.result && q.result.v ? { ...q.result.v, depuisCache: q.result.t } : null); q.onerror = () => res(null); } catch (e) { res(null); } });
}
export async function ecrireCacheBougies(cle, H) {
  const d = await ouvrir(); if (!d || !H || !Array.isArray(H.k)) return false;
  const v = { ...H, k: H.k.slice(-MAX), vol: (H.vol || []).slice(-MAX), ref: (H.ref || []).slice(-MAX), long: H.long ? H.long.slice(-MAX) : H.long };
  if (H.long && H.long.length > MAX) { v.longEpuise = false; v.refEpuise = false; }   // v4 : copie tronquée → on pourra recharger les années plus anciennes
  const premiers = [v.ref[0] && v.ref[0].t, v.k[0] && v.k[0].t].filter(Number.isFinite); if (premiers.length) v.debut = Math.min(...premiers);
  return new Promise(res => { try { const t = d.transaction(ST, 'readwrite'); t.objectStore(ST).put({ t: Date.now(), v }, cle); t.oncomplete = () => res(true); t.onerror = () => res(false); t.onabort = () => res(false); } catch (e) { res(false); } });
}
