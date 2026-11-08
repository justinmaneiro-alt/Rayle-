/* ═════════════ TERMINAL : STOCKAGE LOCAL (IndexedDB « rayle-terminal-outils », sur l'appareil seulement) ═════════════
   objets (par actif), registre et suivis (AJOUT SEUL : add(), jamais put() ni delete()), alertes (historique), positions, journal, contexte.
   Sans IndexedDB (navigation privée…) : mémoire de la page, et l'interface le dit. */
export const BASE = 'rayle-terminal-outils', VERSION = 1;
export const MAGASINS = Object.freeze({ objets: null, registre: 'id', suivis: 'id', alertes: 'id', positions: 'id', journal: 'id', contexte: 'id' });
export const AJOUT_SEUL = Object.freeze(['registre', 'suivis']);

const promesse = rq => new Promise((ok, ko) => { rq.onsuccess = () => ok(rq.result); rq.onerror = () => ko(rq.error); });
export async function ouvrirStockage({ nom = BASE, idb = globalThis.indexedDB } = {}) {
  let db = null;
  if (idb) {
    try {
      db = await new Promise((ok, ko) => {
        const q = idb.open(nom, VERSION);
        q.onupgradeneeded = () => { for (const [m, k] of Object.entries(MAGASINS)) if (!q.result.objectStoreNames.contains(m)) q.result.createObjectStore(m, k ? { keyPath: k } : undefined); };
        q.onsuccess = () => ok(q.result); q.onerror = () => ko(q.error); q.onblocked = () => ko(new Error('base bloquée'));
      });
    } catch (e) { db = null; }
  }
  const mem = Object.fromEntries(Object.keys(MAGASINS).map(m => [m, new Map()]));
  const tx = (m, mode) => db.transaction(m, mode).objectStore(m);
  return {
    persistant: !!db,
    async lire(m, cle) { if (!db) return mem[m].get(cle) ?? null; return (await promesse(tx(m, 'readonly').get(cle))) ?? null; },
    async tout(m) { if (!db) return [...mem[m].values()]; return promesse(tx(m, 'readonly').getAll()); },
    /* écriture (objets, alertes, positions, journal, contexte) ; refusée pour les magasins en ajout seul */
    async ecrire(m, val, cle) {
      if (AJOUT_SEUL.includes(m)) throw new Error(m + ' : ajout seul');
      if (!db) { mem[m].set(cle ?? val[MAGASINS[m]], val); return true; }
      await promesse(MAGASINS[m] ? tx(m, 'readwrite').put(val) : tx(m, 'readwrite').put(val, cle)); return true;
    },
    async supprimer(m, cle) { if (AJOUT_SEUL.includes(m)) throw new Error(m + ' : ajout seul'); if (!db) { mem[m].delete(cle); return true; } await promesse(tx(m, 'readwrite').delete(cle)); return true; },
    /* ajout seul : un enregistrement existant n'est jamais remplacé (renvoie false) */
    async ajouter(m, val) {
      const k = val[MAGASINS[m]];
      if (!db) { if (mem[m].has(k)) return false; mem[m].set(k, Object.freeze({ ...val })); return true; }
      return new Promise((ok, ko) => { const rq = tx(m, 'readwrite').add(val); rq.onsuccess = () => ok(true); rq.onerror = ev => { const e = rq.error; if (e && e.name === 'ConstraintError') { ev.preventDefault(); ev.stopPropagation(); ok(false); } else ko(e); }; });
    },
    fermer() { try { db && db.close(); } catch (e) { /* */ } }
  };
}
