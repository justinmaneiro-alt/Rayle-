/* ═════════════ STOCKAGE LOCAL DES OUTILS (IndexedDB « rayle-or-outils », repli en mémoire si refusé) ═════════════
   objets (mes dessins), decisions (niveaux proposés confirmés / supprimés), alertes (historique), registre et suivis (AJOUT SEUL :
   un enregistrement n'est jamais réécrit ni supprimé). Sur l'appareil seulement, jamais envoyé au Worker. */
const BASE = 'rayle-or-outils', VERSION = 1;
const MAGASINS = Object.freeze({ objets: 'id', decisions: 'cle', alertes: 'id', registre: 'id', suivis: 'id' });
export const AJOUT_SEUL = Object.freeze(['registre', 'suivis']);

function memoire() {
  const M = Object.fromEntries(Object.keys(MAGASINS).map(k => [k, new Map()]));
  return { type: 'mémoire', async tous(s) { return [...M[s].values()]; }, async mettre(s, o) { if (AJOUT_SEUL.includes(s)) throw new Error('ajout seul'); M[s].set(o[MAGASINS[s]], o); },
    async ajouter(s, o) { const k = o[MAGASINS[s]]; if (M[s].has(k)) return false; M[s].set(k, o); return true; }, async supprimer(s, k) { if (AJOUT_SEUL.includes(s)) throw new Error('ajout seul'); M[s].delete(k); } };
}
export async function ouvrirStockage({ nom = BASE, idb = globalThis.indexedDB } = {}) {
  if (!idb) return memoire();
  try {
    const db = await new Promise((ok, ko) => { const r = idb.open(nom, VERSION); r.onupgradeneeded = () => { for (const [s, k] of Object.entries(MAGASINS)) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: k }); }; r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); r.onblocked = () => ko(new Error('base bloquée')); });
    const tx = (s, mode, f) => new Promise((ok, ko) => { const t = db.transaction(s, mode), st = t.objectStore(s); let res; const q = f(st); if (q) q.onsuccess = () => { res = q.result; }; t.oncomplete = () => ok(res); t.onerror = e => { e.preventDefault && e.preventDefault(); ko(t.error); }; t.onabort = () => ko(t.error); });
    return {
      type: 'IndexedDB',
      tous: s => tx(s, 'readonly', st => st.getAll()),
      async mettre(s, o) { if (AJOUT_SEUL.includes(s)) throw new Error('ajout seul'); await tx(s, 'readwrite', st => st.put(o)); },
      async ajouter(s, o) { try { await tx(s, 'readwrite', st => st.add(o)); return true; } catch (e) { if (e && e.name === 'ConstraintError') return false; throw e; } },   // déjà présent : jamais réécrit
      async supprimer(s, k) { if (AJOUT_SEUL.includes(s)) throw new Error('ajout seul'); await tx(s, 'readwrite', st => st.delete(k)); }
    };
  } catch (e) { const m = memoire(); m.erreur = e.message; return m; }
}
