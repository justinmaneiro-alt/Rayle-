/* Dépôt de données sur Cloudflare D1 (SQLite). Aucune donnée de trading n'est dans le dépôt GitHub : tout est ici, dans TON compte Cloudflare, derrière un code d'accès.
   Tables : fermees et tresorerie (une ligne par identifiant : id, rev, data JSON), kv (réglages, alertes, rapport, positions ouvertes, compteur de révision).
   `rev` = numéro de révision croissant : un appareil ne redemande que les lignes plus récentes que sa dernière révision. */
const LOT = 30, PAQUET = 20;   // lignes par INSERT (3 paramètres chacune ≤ 100) et instructions par batch
export const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS fermees (id TEXT PRIMARY KEY, rev INTEGER NOT NULL, data TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS tresorerie (id TEXT PRIMARY KEY, rev INTEGER NOT NULL, data TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS kv (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL, maj INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS i_fermees_rev ON fermees(rev)', 'CREATE INDEX IF NOT EXISTS i_tresorerie_rev ON tresorerie(rev)'
];
export const TABLES = ['fermees', 'tresorerie'];
const decouper = (L, n) => { const o = []; for (let i = 0; i < L.length; i += n) o.push(L.slice(i, i + n)); return o; };

export function depotD1(db) {
  let pret = null;
  const init = () => pret || (pret = db.batch(SCHEMA.map(s => db.prepare(s))).then(() => true));
  const kvLire = async cle => { await init(); const r = await db.prepare('SELECT valeur FROM kv WHERE cle = ?').bind(cle).first(); return r ? JSON.parse(r.valeur) : null; };
  const kvEcrire = async (cle, valeur) => { await init(); await db.prepare('INSERT INTO kv (cle, valeur, maj) VALUES (?, ?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur, maj = excluded.maj').bind(cle, JSON.stringify(valeur), Date.now()).run(); };
  return {
    init, kvLire, kvEcrire,
    async revision() { return (await kvLire('rev')) || 0; },
    async prochaineRevision() { const r = (await kvLire('rev') || 0) + 1; await kvEcrire('rev', r); return r; },
    async lireDepuis(table, depuis) { await init(); if (!TABLES.includes(table)) throw new Error('table inconnue'); const { results } = await db.prepare(`SELECT id, data FROM ${table} WHERE rev > ? ORDER BY rev, id`).bind(depuis).all(); return results.map(r => JSON.parse(r.data)); },
    async compter(table) { await init(); if (!TABLES.includes(table)) throw new Error('table inconnue'); const r = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first(); return r ? r.n : 0; },
    /* upsert de lignes { id, ... } ; renvoie le nombre de lignes écrites */
    async ecrireLignes(table, lignes, rev) {
      await init(); if (!TABLES.includes(table)) throw new Error('table inconnue'); let n = 0;
      const instr = decouper(lignes, LOT).map(L => { n += L.length; return db.prepare(`INSERT INTO ${table} (id, rev, data) VALUES ${L.map(() => '(?, ?, ?)').join(', ')} ON CONFLICT(id) DO UPDATE SET rev = excluded.rev, data = excluded.data`).bind(...L.flatMap(x => [x.id, rev, JSON.stringify(x)])); });
      for (const P of decouper(instr, PAQUET)) await db.batch(P); return n;
    },
    async toutEffacer() { await init(); await db.batch([db.prepare('DELETE FROM fermees'), db.prepare('DELETE FROM tresorerie'), db.prepare("DELETE FROM kv WHERE cle NOT LIKE 'lt:%'")]); },
    async supprimerLignes(table, ids) { await init(); for (const P of decouper(ids, 90)) await db.prepare(`DELETE FROM ${table} WHERE id IN (${P.map(() => '?').join(',')})`).bind(...P).run(); }
  };
}
/* adaptateur de test : fait ressembler node:sqlite à l'API de D1 (les instructions sont compilées au dernier moment, comme sur D1) */
export function d1DepuisSqlite(sqlite) {
  const enrober = sql => ({
    bind: (...p) => ({ _sql: sql, _p: p, async first() { return sqlite.prepare(sql).get(...p) || null; }, async all() { return { results: sqlite.prepare(sql).all(...p) }; }, async run() { sqlite.prepare(sql).run(...p); return { success: true }; } }),
    _sql: sql, _p: [], async first() { return sqlite.prepare(sql).get() || null; }, async all() { return { results: sqlite.prepare(sql).all() }; }, async run() { sqlite.prepare(sql).run(); return { success: true }; }
  });
  return { prepare: enrober, async batch(L) { sqlite.exec('BEGIN'); try { for (const x of L) sqlite.prepare(x._sql).run(...x._p); sqlite.exec('COMMIT'); } catch (e) { sqlite.exec('ROLLBACK'); throw e; } return L.map(() => ({ success: true })); } };
}
