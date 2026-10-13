/* ═════════════ DRIVE : base locale des cours (IndexedDB, sur cet appareil seulement) ═════════════
   Deux « tables » : docs (un enregistrement par document : texte extrait, date de modification Drive…) et meta (réglages de la mémoire : dossiers suivis, dernière synchro).
   `ouvrirBase(idb)` renvoie la même interface que `baseMemoire()` (utilisée par les tests Node) : get / put / tout / supprimer / vider. Rien ne quitte l'appareil. */
const NOM = 'rayle_cours', VERSION = 1;

const req = r => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error || new Error('IndexedDB')); });
const fini = tx => new Promise((ok, ko) => { tx.oncomplete = () => ok(); tx.onerror = () => ko(tx.error || new Error('IndexedDB')); tx.onabort = () => ko(tx.error || new Error('IndexedDB interrompu')); });

export function ouvrirBase(idb = globalThis.indexedDB) {
  if (!idb) return Promise.reject(new Error('Ce navigateur n’a pas de base de données locale (IndexedDB).'));
  return new Promise((ok, ko) => {
    const o = idb.open(NOM, VERSION);
    o.onupgradeneeded = () => { const d = o.result; if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', { keyPath: 'id' }); if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'cle' }); };
    o.onerror = () => ko(o.error || new Error('Impossible d’ouvrir la base locale.'));
    o.onblocked = () => ko(new Error('La base locale est bloquée par un autre onglet de Raylé : ferme-le puis réessaie.'));
    o.onsuccess = () => {
      const d = o.result;
      const lot = (table, mode, f) => { const tx = d.transaction(table, mode), s = tx.objectStore(table), r = f(s); return fini(tx).then(() => r && 'result' in r ? r.result : undefined); };
      ok({
        get: (table, cle) => lot(table, 'readonly', s => s.get(cle)),
        tout: table => lot(table, 'readonly', s => s.getAll()),
        put: (table, valeur) => lot(table, 'readwrite', s => s.put(valeur)).then(() => undefined),
        supprimer: (table, cle) => lot(table, 'readwrite', s => s.delete(cle)).then(() => undefined),
        vider: table => lot(table, 'readwrite', s => s.clear()).then(() => undefined),
        fermer: () => d.close()
      });
    };
  });
}
export const supprimerBase = (idb = globalThis.indexedDB) => new Promise((ok, ko) => { const r = idb.deleteDatabase(NOM); r.onsuccess = () => ok(); r.onerror = () => ko(r.error); r.onblocked = () => ok(); });

/** même interface, en mémoire (tests) */
export function baseMemoire() {
  const t = { docs: new Map(), meta: new Map() }, cle = table => (table === 'docs' ? 'id' : 'cle'), copie = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
  return {
    get: async (table, k) => copie(t[table].get(k)),
    tout: async table => [...t[table].values()].map(copie),
    put: async (table, v) => { t[table].set(v[cle(table)], copie(v)); },
    supprimer: async (table, k) => { t[table].delete(k); },
    vider: async table => { t[table].clear(); },
    fermer: () => {}
  };
}
