/* ═════════════ STOCKAGE DE L'HISTORIQUE : IndexedDB (secours : mémoire) ═════════════
   Base « rayle-trading », magasin « series » (une entrée par instrument + unité : bougies, métadonnées de source, volume, instant de la dernière lecture).
   Les données de marché ne sont PAS personnelles ; elles restent sur l'appareil, jamais envoyées nulle part. Si IndexedDB est interdit (navigation privée…),
   on continue en mémoire : l'historique est alors seulement celui de la session. */
const NOM = 'rayle-trading', MAGASIN = 'series';

export function ouvrirStockage(indexedDBImpl = typeof indexedDB !== 'undefined' ? indexedDB : null) {
  const secours = new Map();
  const memoire = { type: 'memoire', lire: async k => secours.get(k) || null, ecrire: async e => { secours.set(e.cle, e); }, vider: async () => secours.clear(), liste: async () => [...secours.keys()] };
  if (!indexedDBImpl) return Promise.resolve(memoire);
  return new Promise(resolve => {
    let ouvert;
    try { ouvert = indexedDBImpl.open(NOM, 1); } catch (e) { return resolve(memoire); }
    ouvert.onupgradeneeded = () => { try { ouvert.result.createObjectStore(MAGASIN, { keyPath: 'cle' }); } catch (e) { /* déjà là */ } };
    ouvert.onerror = () => resolve(memoire);
    ouvert.onblocked = () => resolve(memoire);
    ouvert.onsuccess = () => {
      const db = ouvert.result;
      const tx = (mode, f) => new Promise((ok, ko) => { try { const t = db.transaction(MAGASIN, mode), r = f(t.objectStore(MAGASIN)); t.oncomplete = () => ok(r && r.result !== undefined ? r.result : null); t.onerror = () => ko(t.error); t.onabort = () => ko(t.error); } catch (e) { ko(e); } });
      resolve({
        type: 'indexeddb',
        lire: async k => { try { return (await tx('readonly', s => s.get(k))) || null; } catch (e) { return secours.get(k) || null; } },
        ecrire: async e => { secours.set(e.cle, e); try { await tx('readwrite', s => s.put(e)); } catch (x) { /* quota : on garde la copie mémoire */ } },
        vider: async () => { secours.clear(); try { await tx('readwrite', s => s.clear()); } catch (e) { /* rien */ } },
        liste: async () => { try { return (await tx('readonly', s => s.getAllKeys())) || []; } catch (e) { return [...secours.keys()]; } }
      });
    };
  });
}
