// Limites gratuites de la base D1 du Worker : index, résumé en quelques lignes, synchronisation espacée, purge, budget du jour et mode dégradé, message en français.
// FAUSSE base (node:sqlite) qui COMPTE les lignes lues comme D1 (scan complet d'une table = toutes ses lignes ; recherche par index = les lignes lues).
// Mesure aussi une journée entière (PC qui bat toutes les 30 s et synchronise, page ouverte qui interroge, cron) AVANT (index et résumé retirés) et APRÈS.
// Lancer :  node galaxie/tests/d1-limites-test.mjs
import fs from 'node:fs';
const racine = new URL('../../worker/src/', import.meta.url);
if (!fs.existsSync(new URL('agent/routes.js', racine))) { console.log('worker/ absent (ignoré par git) : test ignoré'); process.exit(0); }
const { DatabaseSync } = await import('node:sqlite');
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };

/* Fausse D1 qui rend meta.rows_read / rows_written comme la vraie */
function fausseD1() {
  const db = new DatabaseSync(':memory:'), tot = { lues: 0, ecrites: 0 };
  const lignesLues = (sql, vals, nb) => {
    if (/^\s*(CREATE|DROP|PRAGMA)/i.test(sql)) return 0;
    let n = nb;
    try { for (const p of db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...vals)) { const m = /^SCAN (\w+)/.exec(p.detail); if (m && !/COVERING INDEX/.test(p.detail) && !/^SCAN \w+ USING INDEX/.test(p.detail)) n = Math.max(n, db.prepare('SELECT COUNT(*) c FROM ' + m[1]).get().c); else if (/^SCAN \w+ USING (COVERING )?INDEX/.test(p.detail)) n = Math.max(n, nb); } } catch (e) { /* plan indisponible */ }
    return n;
  };
  const stmt = (sql, vals = []) => ({
    bind: (...x) => stmt(sql, x),
    run: async () => { const r = db.prepare(sql).run(...vals); const lu = /^\s*(DELETE|UPDATE|INSERT)/i.test(sql) ? 0 : lignesLues(sql, vals, 0); tot.lues += lu; tot.ecrites += Number(r.changes); return { meta: { changes: Number(r.changes), rows_read: lu, rows_written: Number(r.changes) } }; },
    all: async () => { const rows = db.prepare(sql).all(...vals).map(r => ({ ...r })); const lu = lignesLues(sql, vals, rows.length); tot.lues += lu; return { results: rows, meta: { rows_read: lu, rows_written: 0 } }; },
    first: async () => { const r = db.prepare(sql).get(...vals); const lu = lignesLues(sql, vals, r ? 1 : 0); tot.lues += lu; return r ? { ...r } : null; },
    _run: () => { const r = db.prepare(sql).run(...vals); tot.ecrites += Number(r.changes); }
  });
  return { prepare: sql => stmt(sql), batch: async list => { for (const s of list) s._run(); return []; }, _db: db, tot };
}
const R = await import(new URL('agent/routes.js', racine).href), D = await import(new URL('agent/d1-agent.js', racine).href), B = await import(new URL('infra/budget.js', racine).href), S = await import(new URL('agent/surveillance.js', racine).href);
const E = await import('../../strategies/agent-etat.js');
const cors = {}, J = 86400e3, BASE = Math.floor(Date.UTC(2026, 9, 29, 6, 0) / 900e3) * 900e3;
const appeler = async (env, methode, chemin, corps, t) => { const req = new Request('https://w.test' + chemin, { method: methode, body: corps ? JSON.stringify(corps) : undefined }); const r = await R.routeAgent(req, new URL(req.url), env, {}, cors, t); return { status: r.status, j: await r.json(), h: r.headers }; };
const nouvelEnv = () => { B._test.reinitialiser(); const brut = fausseD1(); return { brut, env: { DB: B.envelopper(brut) } }; };

/* ── un état réaliste : le PC a accumulé beaucoup d'historique ── */
const validation = { statut: 'validee_backtest', esperance: 0.4 };
function etatPC(n, extra = {}) {
  const etat = E.etatInitial(BASE - 40 * J);
  E.creerVersion(etat, { candidates: [{ famille: 'tendance', paire: 'BTC', params: { a: 1 }, validation }], raison: 'test' }, BASE - 40 * J);
  for (let i = 0; i < 150; i++) etat.alertes.push({ cle: 'a' + (n + i), type: 'RAPPORT', t: BASE - 39 * J + (n + i) * 60e3, titre: 'x', texte: 'x', mode: 'SIMULATION', lue: false });
  for (let i = 0; i < 200; i++) etat.journal.push({ t: BASE - 39 * J + (n + i) * 1000, type: 'recherche', texte: 'événement ' + (n + i) });
  for (let i = 0; i < 80; i++) etat.backtests.push({ id: 'b' + (n + i), t: BASE - 39 * J + (n + i) * 1000, nom: 'x' });
  return Object.assign(etat, extra);
}

/* ── 1. Index : les requêtes à LIMIT n'ont plus besoin de lire toute la table ── */
{
  const { brut, env } = nouvelEnv(); const db = await D.baseAgent(env);
  // le PC a poussé l'historique pendant des semaines : 1 550 lignes de journal, 990 de backtests… et rien ne les purgeait
  brut._db.prepare("INSERT INTO agent_identite (id, json, maj) VALUES (1, '{}', 0)").run();
  for (let i = 0; i < 1550; i++) brut._db.prepare('INSERT INTO agent_journal (id, t, json) VALUES (?, ?, ?)').run('j' + i, i, JSON.stringify({ t: i, type: 'x', texte: 'e' + i }));
  for (let i = 0; i < 990; i++) brut._db.prepare('INSERT INTO agent_backtests (id, t, json) VALUES (?, ?, ?)').run('b' + i, i, JSON.stringify({ id: 'b' + i, t: i }));
  for (let i = 0; i < 300; i++) brut._db.prepare('INSERT INTO agent_trades_simules (id, strategie, t, json) VALUES (?, ?, ?, ?)').run('t' + i, 's', i, JSON.stringify({ id: 't' + i }));
  const idx = brut._db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(x => x.name);
  for (const n of ['agent_journal_t', 'agent_backtests_t', 'agent_alertes_t', 'agent_trades_t', 'agent_commandes_attente']) v('index créé : ' + n, idx.includes(n));
  for (const [sql, args] of [['SELECT json FROM agent_journal ORDER BY t DESC LIMIT ?', [200]], ['SELECT json FROM agent_backtests ORDER BY t DESC LIMIT ?', [80]], ['SELECT json FROM agent_alertes ORDER BY t DESC LIMIT ?', [150]], ['SELECT json FROM agent_trades_simules ORDER BY t DESC LIMIT ?', [300]], ['SELECT json FROM agent_alertes WHERE t >= ? ORDER BY t', [0]], ['SELECT id, json FROM agent_commandes WHERE traite = 0 ORDER BY t LIMIT 20', []]]) {
    const plan = brut._db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...args).map(p => p.detail).join(' | ');
    v('plan sans balayage ni tri temporaire : ' + sql.slice(0, 60), /USING (COVERING )?INDEX/.test(plan) && !/TEMP B-TREE/.test(plan), plan);
  }
  brut.tot.lues = 0; await D.lireEtat(db);
  const avecIndex = brut.tot.lues;
  for (const n of ['agent_journal_t', 'agent_backtests_t', 'agent_alertes_t', 'agent_trades_t']) brut._db.exec('DROP INDEX ' + n);
  brut.tot.lues = 0; await D.lireEtat(db);
  const sansIndex = brut.tot.lues;
  console.log('   lireEtat (journal 1 550, backtests 990, trades 300 lignes) : ' + sansIndex + ' lignes lues SANS index → ' + avecIndex + ' AVEC index');
  v('lireEtat lit au moins 4 fois moins de lignes avec les index', avecIndex * 4 <= sansIndex, avecIndex + ' vs ' + sansIndex);
}

/* ── 2. Synchronisation : un état identique n'écrit rien, un historique trop long est purgé ── */
{
  const { brut, env } = nouvelEnv(); let t = BASE;
  const etat = etatPC(0), suivi = {};
  let r = await appeler(env, 'POST', '/agent/sync', { etat, suivi }, t);
  v('première synchronisation acceptée', r.status === 200 && r.j.ok && !r.j.inchange, JSON.stringify(r.j));
  const eEcrit = brut.tot.ecrites; brut.tot.lues = 0;
  r = await appeler(env, 'POST', '/agent/sync', { etat, suivi }, t + 30e3);
  v('même état 30 s plus tard : « inchangé », rien écrit en dehors du battement', r.j.inchange === true && brut.tot.ecrites - eEcrit <= 0, 'écritures +' + (brut.tot.ecrites - eEcrit));
  v('… et une poignée de lignes lues', brut.tot.lues <= 8, brut.tot.lues + ' lignes');
  const etat2 = JSON.parse(JSON.stringify(etat)); etat2.journal.push({ t: t + 31e3, type: 'recherche', texte: 'un petit événement' });
  const e1 = brut.tot.ecrites; r = await appeler(env, 'POST', '/agent/sync', { etat: etat2, suivi }, t + 60e3);
  v('changement SANS importance < 5 min plus tard : différé, rien écrit', r.j.inchange === true && brut.tot.ecrites - e1 <= 0);
  r = await appeler(env, 'POST', '/agent/sync', { etat: etat2, suivi }, t + 6 * 60e3);
  v('changement après 5 minutes : écrit', r.j.ok && !r.j.inchange);
  r = await appeler(env, 'POST', '/agent/sync', { etat: etat2, suivi, forcer: true }, t + 6 * 60e3 + 1000);
  v('forcer: toujours écrit', r.j.ok && !r.j.inchange);
  // le PC arrive avec une nouvelle version : changement important → écrit tout de suite
  const etat3 = JSON.parse(JSON.stringify(etat2)); E.creerVersion(etat3, { candidates: [{ famille: 'tendance', paire: 'SOL', params: { a: 2 }, validation }], raison: 'v2' }, t + 7 * 60e3);
  r = await appeler(env, 'POST', '/agent/sync', { etat: etat3, suivi }, t + 6 * 60e3 + 2000);
  v('nouvelle version = changement important : écrit immédiatement', r.j.ok && !r.j.inchange && r.j.regles >= 1);
  // l'état relu par la page est bien le résumé, identique à la reconstruction depuis les tables
  const a = await appeler(env, 'GET', '/agent/etat', null, t + 7 * 60e3), direct = await D.lireEtat(await D.baseAgent(env));
  v('/agent/etat : état = résumé = tables', a.j.etat.versions.length === 2 && a.j.etat.journal.length === direct.journal.length && a.j.etat.alertes.length === 150);
  const n1 = (brut._db.prepare("SELECT COUNT(*) c FROM agent_resume").get()).c;
  v('le résumé tient en peu de lignes', n1 >= 1 && n1 <= 4, n1 + ' ligne(s)');
  brut.tot.lues = 0; await appeler(env, 'GET', '/agent/etat', null, t + 7 * 60e3 + 1000);
  v('lecture de /agent/etat à partir du résumé : moins de 25 lignes lues', brut.tot.lues < 25, brut.tot.lues + ' lignes');
  brut.tot.lues = 0; await appeler(env, 'GET', '/agent/statut', null, t + 7 * 60e3 + 2000);
  v('lecture de /agent/statut : moins de 25 lignes lues', brut.tot.lues < 25, brut.tot.lues + ' lignes');
  // la pause invalide le résumé : la page la voit
  await appeler(env, 'POST', '/agent/commande', { type: 'pause' }, t + 8 * 60e3);
  const ap = await appeler(env, 'GET', '/agent/etat', null, t + 8 * 60e3 + 1000);
  v('pause : visible tout de suite dans l’état relu', ap.j.etat.parametresRisque.pause === true);
}

/* ── 3. Purge ── */
{
  const { brut, env } = nouvelEnv(); const db = await D.baseAgent(env);
  for (let i = 0; i < 1000; i++) brut._db.prepare('INSERT INTO agent_journal (id, t, json) VALUES (?, ?, ?)').run('j' + i, i, '{}');
  for (let i = 0; i < 500; i++) brut._db.prepare('INSERT INTO agent_backtests (id, t, json) VALUES (?, ?, ?)').run('b' + i, i, '{}');
  brut._db.prepare("INSERT INTO agent_commandes (id, t, json, traite) VALUES ('c1', 1, '{}', 1), ('c2', ?, '{}', 0)").run(BASE);
  const f = await D.purger(db, BASE);
  const nj = brut._db.prepare('SELECT COUNT(*) c FROM agent_journal').get().c, nb = brut._db.prepare('SELECT COUNT(*) c FROM agent_backtests').get().c;
  v('purge : journal ramené à 600, backtests à 250, les plus récents gardés', nj === D.GARDER.journal && nb === D.GARDER.backtests && brut._db.prepare('SELECT MIN(t) m FROM agent_journal').get().m === 400, nj + ' ' + nb);
  v('purge : commande traitée ancienne supprimée, commande en attente gardée', brut._db.prepare('SELECT COUNT(*) c FROM agent_commandes').get().c === 1 && f.commandes === 1);
  v('purge : pas deux fois dans les 6 heures', (await D.purger(db, BASE + 3600e3)) === null && (await D.purger(db, BASE + 7 * 3600e3)) !== null);
}

/* ── 4. Budget du jour, mode dégradé, message en français ── */
{
  const { brut, env } = nouvelEnv(); const db = await D.baseAgent(env);
  await appeler(env, 'POST', '/agent/sync', { etat: etatPC(0), suivi: {} }, BASE);
  await B.vider(env, BASE, { force: true });
  const l = brut._db.prepare('SELECT * FROM agent_budget').get();
  v('budget : une ligne par jour avec les lectures et écritures comptées', l && l.jour === '2026-10-29' && l.lectures > 0 && l.ecritures > 0 && brut._db.prepare('SELECT COUNT(*) c FROM agent_budget').get().c === 1, JSON.stringify(l));
  let e = await B.etat(env, BASE); v('budget bas : pas de mode dégradé', !e.degrade && !e.critique && e.ratio < 0.01);
  brut._db.prepare('UPDATE agent_budget SET lectures = 4100000').run(); B._test.reinitialiser();
  e = await B.etat(env, BASE + 1000); v('82 % des lectures : mode dégradé, pas encore critique', e.degrade && !e.critique, JSON.stringify(e));
  brut.tot.lues = 0;
  let r = await appeler(env, 'GET', '/agent/etat', null, BASE + 1000);
  v('mode dégradé sans copie en cache : 503 avec le message simple, sans relire la base', r.status === 503 && r.j.limite === true && r.j.error === 'la liaison Worker est limitée aujourd’hui' && brut.tot.lues <= 2, brut.tot.lues + ' ' + JSON.stringify(r.j));
  r = await appeler(env, 'POST', '/agent/battement', { phase: 'x' }, BASE + 2000); v('mode dégradé : battement sans écriture, commandes vides', r.status === 200 && r.j.degrade === true && r.j.commandes.length === 0);
  r = await appeler(env, 'POST', '/agent/sync', { etat: etatPC(1), suivi: {} }, BASE + 3000); v('mode dégradé : synchronisation différée (rien écrit)', r.j.differe === true);
  brut._db.prepare('UPDATE agent_budget SET lectures = 4900000').run(); B._test.reinitialiser();
  e = await B.etat(env, BASE + 4000); v('98 % : critique (le cron ne fait plus que les alertes de prix)', e.critique);
  // la base elle-même refuse : « daily row read limit »
  B._test.reinitialiser();
  const refus = { prepare() { throw new Error('D1_ERROR: Exceeded daily row read limit: SQLITE_FULL'); }, batch: async () => { throw new Error('D1_ERROR: daily row read limit'); } };
  r = await appeler({ DB: B.envelopper(refus) }, 'GET', '/agent/etat', null, BASE);
  v('D1 refuse (limite atteinte) : 503 avec le message en français, jamais l’erreur brute', r.status === 503 && r.j.limite === true && !/D1_ERROR|SQLITE/.test(JSON.stringify(r.j)), JSON.stringify(r.j));
  v('l’instance retient la limite 10 minutes', B.limiteMarquee(BASE + 5 * 60e3) && !B.limiteMarquee(BASE + 11 * 60e3));
  v('estErreurLimite reconnaît la vraie erreur', B.estErreurLimite(new Error('D1_ERROR: Exceeded daily row read limit')) && !B.estErreurLimite(new Error('HTTP 404')));
}

/* ── 5. Une journée entière : combien de lignes lues, avant / après ? ──
   Journée type : le PC bat toutes les 30 s et propose sa synchronisation toutes les 30 s (état qui change vraiment toutes les 15 min), une page de l'agent reste ouverte et interroge le Worker,
   le cron de surveillance passe chaque minute (PC allumé 24 h : il laisse faire). Le cache Cloudflare (Cache API) n'existe pas dans Node : le résultat « après » est donc un MAXIMUM (la vraie journée est encore plus basse). */
async function journee({ ancien }) {
  const { brut, env } = nouvelEnv(); const db = await D.baseAgent(env);
  if (ancien) for (const n of ['agent_journal_t', 'agent_backtests_t', 'agent_alertes_t', 'agent_trades_t', 'agent_commandes_attente']) brut._db.exec('DROP INDEX ' + n);
  // historique déjà accumulé par des semaines de synchronisations sans purge
  for (let i = 0; i < 1550; i++) brut._db.prepare('INSERT INTO agent_journal (id, t, json) VALUES (?, ?, ?)').run('j' + i, i, JSON.stringify({ t: i, type: 'x', texte: 'e' + i }));
  for (let i = 0; i < 990; i++) brut._db.prepare('INSERT INTO agent_backtests (id, t, json) VALUES (?, ?, ?)').run('b' + i, i, JSON.stringify({ id: 'b' + i, t: i }));
  const pollsPage = ancien ? 2255 : 1440, parMinute = ancien ? 1 : 1;      // mesuré avant : 2 255 appels /agent/etat + /agent/statut dans la journée ; après : une page à 60 s
  let t = BASE, n = 0; brut.tot.lues = 0; brut.tot.ecrites = 0;
  const intervallePage = Math.floor(86400 / pollsPage);
  let version = 0, etat = etatPC(0);
  for (let s = 0; s < 86400; s += 30) {
    t = BASE + s * 1000;
    if (s % 900 === 0 && s) { version++; etat = etatPC(version * 7); }
    if (ancien) {
      // ancien comportement : battement = 2 écritures meta, synchronisation complète à chaque cycle (INSERT OR IGNORE de tout), lectures complètes sans résumé
      await appeler(env, 'POST', '/agent/battement', { phase: 'x' }, t);
      const dbA = db; await D.ecrireEtat(dbA, JSON.parse(JSON.stringify(etat)), t); await D.metaEcrire(dbA, 'pc_vivant_le', t, t); await D.metaEcrire(dbA, 'regles', [], t);
    } else {
      await appeler(env, 'POST', '/agent/battement', { phase: 'x' }, t);
      await appeler(env, 'POST', '/agent/sync', { etat: JSON.parse(JSON.stringify(etat)), suivi: {} }, t);
    }
    if (s % intervallePage < 30) { if (ancien) { await D.lireEtat(db); await appeler(env, 'GET', '/agent/etat', null, t).catch(() => 0); } else { await appeler(env, 'GET', '/agent/etat', null, t); if (s % 120 === 0) await appeler(env, 'GET', '/agent/statut', null, t); } n++; }
    if (s % 60 === 0) await S.cronAgent(env, {}, t, { fetchImpl: async () => new Response('{}', { status: 404 }), envoyer: async () => {} });
  }
  return { lues: brut.tot.lues, ecrites: brut.tot.ecrites, pages: n };
}
const avant = await journee({ ancien: true }), apres = await journee({ ancien: false });
console.log('   Journée simulée — AVANT (sans index, sans résumé) : ' + avant.lues.toLocaleString('fr-FR') + ' lignes lues, ' + avant.ecrites.toLocaleString('fr-FR') + ' écrites');
console.log('   Journée simulée — APRÈS                          : ' + apres.lues.toLocaleString('fr-FR') + ' lignes lues, ' + apres.ecrites.toLocaleString('fr-FR') + ' écrites  (' + (100 - Math.round(100 * apres.lues / avant.lues)) + ' % de moins en lecture ; sans le cache Cloudflare)');
v('une journée : au moins 10 fois moins de lignes lues', apres.lues * 10 <= avant.lues, apres.lues + ' vs ' + avant.lues);
v('une journée : très en dessous de la limite de 5 000 000 (moins de 5 %)', apres.lues < 250000, String(apres.lues));
v('une journée : moins d’écritures qu’avant', apres.ecrites < avant.ecrites, apres.ecrites + ' vs ' + avant.ecrites);
v('une journée : très en dessous de la limite de 100 000 écritures', apres.ecrites < 30000, String(apres.ecrites));

console.log(`\n${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
