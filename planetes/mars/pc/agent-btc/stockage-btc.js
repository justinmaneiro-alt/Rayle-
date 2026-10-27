/* ═════════════ STOCKAGE DE L'HISTORIQUE BITCOIN : IndexedDB « rayle-btc » (secours : mémoire) ═════════════
   Un enregistrement par mois UTC de bougies M15 (colonnes typées), plus un enregistrement « meta » (source, dates, état de la recherche…).
   Les données de marché ne sont pas personnelles : elles restent sur l'appareil. IndexedDB interdit (navigation privée) → mémoire seulement (l'historique est alors celui de la session). */
const NOM = 'rayle-btc', MAGASIN = 'blocs';

export function ouvrirStockageBtc(indexedDBImpl = typeof indexedDB !== 'undefined' ? indexedDB : null, nomBase = NOM) {   // M6 : une base par paire (« rayle-sol », « rayle-doge »)
  const secours = new Map();
  const memoire = { type: 'memoire', lire: async k => secours.get(k) || null, ecrire: async (k, v) => { secours.set(k, { ...v, cle: k }); }, supprimer: async k => { secours.delete(k); }, vider: async () => secours.clear(), liste: async () => [...secours.keys()] };
  if (!indexedDBImpl) return Promise.resolve(memoire);
  return new Promise(resolve => {
    let ouvert;
    try { ouvert = indexedDBImpl.open(nomBase, 1); } catch (e) { return resolve(memoire); }
    ouvert.onupgradeneeded = () => { try { ouvert.result.createObjectStore(MAGASIN, { keyPath: 'cle' }); } catch (e) { /* déjà là */ } };
    ouvert.onerror = () => resolve(memoire);
    ouvert.onblocked = () => resolve(memoire);
    ouvert.onsuccess = () => {
      const db = ouvert.result;
      const tx = (mode, f) => new Promise((ok, ko) => { try { const t = db.transaction(MAGASIN, mode), r = f(t.objectStore(MAGASIN)); t.oncomplete = () => ok(r && r.result !== undefined ? r.result : null); t.onerror = () => ko(t.error); t.onabort = () => ko(t.error); } catch (e) { ko(e); } });
      resolve({
        type: 'indexeddb',
        lire: async k => { try { return (await tx('readonly', s => s.get(k))) || null; } catch (e) { return secours.get(k) || null; } },
        ecrire: async (k, v) => { const e = { ...v, cle: k }; secours.set(k, e); try { await tx('readwrite', s => s.put(e)); } catch (x) { /* quota : copie mémoire gardée */ } },
        supprimer: async k => { secours.delete(k); try { await tx('readwrite', s => s.delete(k)); } catch (e) { /* rien */ } },
        vider: async () => { secours.clear(); try { await tx('readwrite', s => s.clear()); } catch (e) { /* rien */ } },
        liste: async () => { try { return (await tx('readonly', s => s.getAllKeys())) || []; } catch (e) { return [...secours.keys()]; } }
      });
    };
  });
}
