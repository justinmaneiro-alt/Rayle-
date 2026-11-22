/* ═════════════ BOOKMAP : STOCKAGE LOCAL (v12) — IndexedDB, sur l'appareil seulement ═════════════
   Les colonnes de la carte (une par seconde) et les grosses transactions sont écrites par blocs d'environ 30 s ; au démarrage, les blocs des dernières heures sont relus
   pour que la carte ne reparte pas de zéro si la page a été fermée peu avant. Rien n'est envoyé nulle part. Le magasin est injectable (tests : en mémoire). */
const NOM_BASE = 'rayle-bookmap', ST = 'blocs';

export function creerMagasinMemoire() {
  const M = new Map();
  return { async put(cle, val) { M.set(cle, structuredClone ? structuredClone(val) : val); }, async tous() { return [...M.values()]; }, async supprimer(cle) { M.delete(cle); }, async cles() { return [...M.keys()]; } };
}

export function creerMagasinIDB(nom = NOM_BASE) {
  let ouverture = null;
  const ouvrir = () => ouverture || (ouverture = new Promise(res => { try { const r = indexedDB.open(nom, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null); } catch (e) { res(null); } }));
  const tx = async (mode, f) => { const d = await ouvrir(); if (!d) return null; return new Promise(res => { try { const t = d.transaction(ST, mode), s = t.objectStore(ST), q = f(s); if (q) { q.onsuccess = () => res(q.result); q.onerror = () => res(null); } t.oncomplete = () => { if (!q) res(true); }; t.onabort = () => res(null); t.onerror = () => res(null); } catch (e) { res(null); } }); };
  return { put: (cle, val) => tx('readwrite', s => { s.put(val, cle); return null; }), tous: async () => (await tx('readonly', s => s.getAll())) || [], supprimer: cle => tx('readwrite', s => { s.delete(cle); return null; }), cles: async () => (await tx('readonly', s => s.getAllKeys())) || [] };
}

/* un bloc : { cle, actif, palier, t0, t1, cols: [{ t, mid, i0, q: Float32Array }], bulles: [{ t, p, q, cote }] } */
export function creerStockage({ magasin, actif, maintenant = () => Date.now() } = {}) {
  const cle = (a, t0) => a + '|' + t0;
  return {
    async sauver({ palier, cols, bulles }) {
      if (!cols.length && !bulles.length) return false;
      const t0 = cols.length ? cols[0].t : bulles[0].t, t1 = cols.length ? cols[cols.length - 1].t : bulles[bulles.length - 1].t;
      await magasin.put(cle(actif, t0), { cle: cle(actif, t0), actif, palier, t0, t1, cols: cols.map(c => ({ t: c.t, mid: c.mid, i0: c.i0, q: c.q })), bulles }); return true;
    },
    /* blocs de l'actif dont la fin est dans les `dureeMs` dernières ; filtrés par palier si `palier` est donné (une carte à un autre palier n'est pas comparable) */
    async charger({ dureeMs, palier = null }) {
      const t = maintenant(), blocs = (await magasin.tous()).filter(b => b && b.actif === actif && b.t1 >= t - dureeMs).sort((a, b) => a.t0 - b.t0);
      const palierStocke = blocs.length ? blocs[blocs.length - 1].palier : null;
      const bons = blocs.filter(b => palier == null || b.palier === palier);
      return { colonnes: bons.flatMap(b => b.cols), bulles: bons.flatMap(b => b.bulles || []), palierStocke, blocs: bons.length };
    },
    /* supprime tous les blocs (de tous les actifs) plus vieux que la durée gardée */
    async purger({ dureeMs }) { const t = maintenant(); let n = 0; for (const b of await magasin.tous()) if (b && b.t1 < t - dureeMs) { await magasin.supprimer(b.cle); n++; } return n; },
    async octets() { let n = 0; for (const b of await magasin.tous()) if (b) n += (b.cols || []).reduce((s, c) => s + 24 + (c.q ? c.q.byteLength : 0), 0) + (b.bulles || []).length * 40; return n; }
  };
}
