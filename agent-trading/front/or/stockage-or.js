/* ═════════════ STOCKAGE LOCAL DE L'APPAREIL (jamais envoyé nulle part, jamais dans le dépôt) ═════════════
   Journal : localStorage (petit JSON). Captures d'écran : IndexedDB (images réduites à 1280 px, JPEG). Toute erreur est rattrapée :
   navigation privée ou stockage refusé = la page marche quand même, avec un message. */
export function lireJSON(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
export function ecrireJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

let base = null;
function ouvrir() {
  if (base) return base;
  base = new Promise((ok, ko) => { try { const r = indexedDB.open('rayle-or', 1); r.onupgradeneeded = () => r.result.createObjectStore('captures'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); } catch (e) { ko(e); } });
  base.catch(() => { base = null; }); return base;
}
export async function enregistrerCapture(cle, fichier) {
  const url = await reduire(fichier), db = await ouvrir();
  await new Promise((ok, ko) => { const tx = db.transaction('captures', 'readwrite'); tx.objectStore('captures').put(url, cle); tx.oncomplete = ok; tx.onerror = () => ko(tx.error); });
  return cle;
}
export async function lireCapture(cle) { try { const db = await ouvrir(); return await new Promise(ok => { const r = db.transaction('captures').objectStore('captures').get(cle); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); }); } catch (e) { return null; } }
function reduire(fichier, max = 1280) {
  return new Promise((ok, ko) => {
    const img = new Image(), u = URL.createObjectURL(fichier);
    img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c.toDataURL('image/jpeg', 0.72)); };
    img.onerror = () => { URL.revokeObjectURL(u); ko(new Error('image illisible')); }; img.src = u;
  });
}
export async function copier(texte) {
  try { await navigator.clipboard.writeText(texte); return true; } catch (e) {
    try { const t = document.createElement('textarea'); t.value = texte; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok; } catch (e2) { return false; }
  }
}
