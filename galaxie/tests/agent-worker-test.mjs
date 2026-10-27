// Tests du Worker de l'agent (fichiers locaux, ignorés par git) : routes /agent/*, surveillance par cron quand le PC est éteint, dédoublonnage des alertes, pause, dérive,
// avec une FAUSSE base D1 (node:sqlite), de FAUSSES bougies Binance et un FAUX Telegram. Lancer :  node galaxie/tests/agent-worker-test.mjs
import fs from 'node:fs';
const racine = new URL('../../worker/src/', import.meta.url);
if (!fs.existsSync(new URL('agent/routes.js', racine))) { console.log('worker/ absent (ignoré par git) : test ignoré'); process.exit(0); }
const { DatabaseSync } = await import('node:sqlite');
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };

/* Fausse D1 : prepare(sql).bind(...).run() / all() / first(), batch([...]) */
function fausseD1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, vals = []) => ({ bind: (...x) => stmt(sql, x), run: async () => { const r = db.prepare(sql).run(...vals); return { meta: { changes: Number(r.changes) } }; }, all: async () => ({ results: db.prepare(sql).all(...vals).map(r => ({ ...r })) }), first: async () => { const r = db.prepare(sql).get(...vals); return r ? { ...r } : null; }, _run: () => db.prepare(sql).run(...vals) });
  return { prepare: sql => stmt(sql), batch: async list => { for (const s of list) s._run(); return []; }, _db: db };
}
const R = await import(new URL('agent/routes.js', racine).href), S = await import(new URL('agent/surveillance.js', racine).href), D = await import(new URL('agent/d1-agent.js', racine).href);
const E = await import('../../strategies/agent-etat.js'), { FAMILLES } = await import('../../planetes/mars/pc/agent-btc/hypotheses.js'), { marcheMixte } = await import('../../planetes/mars/tests/synth-btc.mjs');
const { ETAT_REGLE_VIDE } = await import('../../strategies/direct-v3.js');
const cors = {}, J = 86400e3;
const appeler = async (env, methode, chemin, corps, t) => { const req = new Request('https://w.test' + chemin, { method: methode, body: corps ? JSON.stringify(corps) : undefined }); const r = await R.routeAgent(req, new URL(req.url), env, {}, cors, t); return { status: r.status, j: await r.json() }; };

/* ── une famille de test qui signale à une bougie choisie (le Worker utilise le même registre que le PC) ── */
let barreSignal = -1;
FAMILLES.test_signal = { id: 'test_signal', nom: 'TEST signal', description: 'signale à une bougie imposée', grille: () => ({ a: [1] }), signaux(ctx) { const n = ctx.n, o = { sens: new Int8Array(n), stop: new Float64Array(n), R: 3 }; const i = barreSignal >= 0 ? barreSignal : n - 1; if (i < n) { o.sens[i] = 1; o.stop[i] = ctx.m15.c[i] * 0.98; } return o; } };

const BASE = Math.floor(Date.UTC(2026, 9, 28, 10, 0) / 900e3) * 900e3, TOTAL = 3200, T_DEBUT = BASE - (TOTAL - 1) * 900e3 - 900e3;   // la dernière bougie s'ouvre à BASE − 15 min (fermée à BASE)
const synth = marcheMixte(TOTAL, 7), kline = i => [T_DEBUT + i * 900e3, String(synth.o[i]), String(synth.h[i]), String(synth.l[i]), String(synth.c[i]), String(synth.v[i]), 0, 0, 0, 0, String(synth.vb[i])];
let appelsBinance = 0, binanceEnPanne = false, krakenAppels = 0;
const fetchImpl = async url => {
  const u = String(url);
  if (/binance/.test(u)) { appelsBinance++; if (binanceEnPanne) return new Response('{}', { status: 451 }); const t0 = +/startTime=(\d+)/.exec(u)[1]; const out = []; for (let i = 0; i < TOTAL && out.length < 1000; i++) if (T_DEBUT + i * 900e3 >= t0) out.push(kline(i)); return new Response(JSON.stringify(out)); }
  if (/kraken/.test(u)) { krakenAppels++; const t0 = +/since=(\d+)/.exec(u)[1] * 1000, out = []; for (let i = 0; i < TOTAL; i++) if (T_DEBUT + i * 900e3 >= t0) out.push([(T_DEBUT + i * 900e3) / 1000, String(synth.o[i]), String(synth.h[i]), String(synth.l[i]), String(synth.c[i]), '0', String(synth.v[i]), 1]); return new Response(JSON.stringify({ error: [], result: { XBTUSD: out, last: 1 } })); }
  return new Response('{}', { status: 404 });
};
const envois = []; const envoyer = async (texte, type) => { envois.push({ texte, type }); };

/* ── état de l'agent, comme le pousserait le PC ── */
const T0 = BASE - 40 * J, validation = { statut: 'validee_backtest', esperance: 0.4 };
const etat = E.etatInitial(T0);
E.creerVersion(etat, { candidates: [{ famille: 'test_signal', paire: 'BTC', params: { a: 1 }, validation }], raison: 'test' }, T0);
const id = E.idStrategie('test_signal', 'BTC', { a: 1 });
etat.alertes.push({ cle: 'ancienne', type: 'RAPPORT', t: T0, titre: 'x', texte: 'x', mode: 'SIMULATION', lue: false }); etat.journal.push({ t: T0, type: 'test', texte: 'un événement' });
const env = { DB: fausseD1() };

// ── routes ──
let r = await appeler(env, 'GET', '/agent/statut', null, BASE);
v('avant tout envoi du PC : statut « aucune stratégie validée »', r.status === 200 && r.j.existe === false && r.j.statut.code === 'aucune');
r = await appeler(env, 'POST', '/agent/sync', { etat, suivi: {} }, BASE);
v('sync : état accepté, 1 règle exportée', r.status === 200 && r.j.ok && r.j.regles === 1, JSON.stringify(r.j));
r = await appeler(env, 'POST', '/agent/sync', { etat: { versions: 1 } }, BASE); v('sync : état invalide refusé', r.status === 400);
r = await appeler(env, 'GET', '/agent/etat', null, BASE);
v('état relu depuis D1 : identité, version active, stratégie, alerte, journal', r.j.etat.identite.nom === 'Kepler' && r.j.etat.active === 1 && r.j.etat.strategies[id].phase === 'simulation' && r.j.etat.alertes.length === 1 && r.j.etat.journal.length >= 2);
r = await appeler(env, 'GET', '/agent/statut', null, BASE + 60e3);
v('statut juste après la synchronisation : le PC est vivant, en surveillance', r.j.pcVivant === true && r.j.statut.code === 'surveillance' && r.j.chiffres.version === 1 && r.j.avertissement.includes('Aucun ordre'));
r = await appeler(env, 'GET', '/agent/statut', null, BASE + 20 * 60e3);
v('statut 20 minutes plus tard sans battement : « PC éteint : surveillance seule »', r.j.pcVivant === false && r.j.statut.code === 'pc_eteint');
r = await appeler(env, 'POST', '/agent/commande', { type: 'n_importe_quoi' }, BASE); v('commande inconnue refusée', r.status === 400);
r = await appeler(env, 'POST', '/agent/commande', { type: 'charge', valeur: 'énorme' }, BASE); v('charge invalide refusée', r.status === 400);
r = await appeler(env, 'POST', '/agent/commande', { type: 'charge', valeur: 'faible' }, BASE); v('commande de charge acceptée (attend le PC)', r.j.ok && /PC éteint|prochain battement/.test(r.j.note));
r = await appeler(env, 'POST', '/agent/battement', { phase: 'recherche', rechercheEnCours: true }, BASE + 120e3);
v('battement : rend la commande en attente', r.j.ok && r.j.commandes.length === 1 && r.j.commandes[0].type === 'charge' && r.j.commandes[0].valeur === 'faible');
await appeler(env, 'POST', '/agent/commandes/traitees', { ids: [r.j.commandes[0].id] }, BASE);
r = await appeler(env, 'POST', '/agent/battement', { phase: 'x' }, BASE + 130e3); v('commande traitée : plus en attente', r.j.commandes.length === 0);
r = await appeler(env, 'GET', '/agent/statut', null, BASE + 150e3); v('statut : la recherche en cours est visible', r.j.statut.code === 'recherche' || r.j.statut.code === 'surveillance');

// ── cron : le PC surveille → le Worker ne fait rien ──
await D.metaEcrire(env.DB, 'pc_vivant_le', BASE + 60e3, BASE + 60e3);
let c = await S.cronAgent(env, {}, BASE + 2 * 60e3, { fetchImpl, envoyer });
v('cron : PC vivant → le Worker laisse faire', /PC surveille/.test(c.action) && envois.length === 0 && appelsBinance === 0);
c = await S.cronAgent(env, {}, BASE, { fetchImpl, envoyer }); v('cron : minute de clôture → rien', /clôture/.test(c.action));

// ── PC éteint : le Worker surveille avec la version active ──
await D.metaEcrire(env.DB, 'pc_vivant_le', BASE - 3600e3, BASE);                                    // PC éteint depuis une heure
env.DB._db.exec("DELETE FROM agent_meta WHERE cle='cron_erreur'");
let t = BASE + 60e3;                                                                               // minute 1 du quart d'heure → règle n° 1
const tCpu = process.hrtime.bigint();
c = await S.cronAgent(env, {}, t, { fetchImpl, envoyer });
console.log('   (exécution du cron, première fois, 3 000 bougies : ' + (Number(process.hrtime.bigint() - tCpu) / 1e6).toFixed(0) + ' ms, dont le téléchargement simulé ; en régime normal une seule règle, ~5 ms de calcul)');
v('cron PC éteint : règle surveillée, bougies récupérées chez Binance', c.action === 'surveillé' && c.regle === id && c.nouvelles > 0 && c.source === 'Binance', JSON.stringify(c));
const cache = await D.bougiesLire(env.DB, 'BTC');
v('cache D1 des bougies : 3 000 bougies, la dernière est fermée (ouverture < dernière clôture)', cache.t.length === 3000 && cache.t[cache.t.length - 1] === BASE - 900e3, cache.t.length + ' ' + (cache.t[cache.t.length - 1] - BASE));
v('un signal à la dernière bougie : entrée proposée, alerte ENTREE envoyée à Telegram', c.evenements.includes('ENTREE') && envois.some(e => e.type === 'ENTREE' && /SIMULATION/.test(e.texte) && /Aucun ordre n’est exécuté automatiquement/.test(e.texte)), JSON.stringify(envois.map(e => e.type)));
v('l’alerte indique le niveau de preuve et la taille de position pour 1 %', /Preuve : validée en backtest/.test(envois[0].texte) && /Taille pour risquer 1 %/.test(envois[0].texte));
const nEnvois = envois.length;
c = await S.cronAgent(env, {}, t, { fetchImpl, envoyer });
v('même minute rejouée : aucune nouvelle alerte (pas de doublon)', envois.length === nEnvois && c.evenements.length === 0, JSON.stringify(c));
const suivi = (await D.suiviLire(env.DB))[id];
v('suivi enregistré : entrée en attente de la prochaine bougie', suivi && suivi.pendante && suivi.derniereBarre === BASE - 900e3);
// la règle suivante (n° 2) n'existe pas ; minute 3 → pas de règle
c = await S.cronAgent(env, {}, BASE + 3 * 60e3, { fetchImpl, envoyer }); v('cron : pas de règle pour ce créneau → rien', /pas de règle/.test(c.action));

// ── panne de Binance : bascule sur Kraken ──
await D.bougiesEcrire(env.DB, 'BTC', (() => { const b = { t: [], o: [], h: [], l: [], c: [], v: [], vb: [] }; for (let i = 0; i < 3100; i++) { b.t.push(T_DEBUT + i * 900e3); b.o.push(synth.o[i]); b.h.push(synth.h[i]); b.l.push(synth.l[i]); b.c.push(synth.c[i]); b.v.push(synth.v[i]); b.vb.push(null); } return b; })(), BASE);
binanceEnPanne = true; barreSignal = 3198;
const t2 = BASE + 60e3 + 0; const c2 = await S.majBougies(env.DB, 'BTC', { fetchImpl, maintenant: t2 });
v('Binance en panne : Kraken prend le relais (la source est dite)', c2.source === 'Kraken' && c2.nouvelles > 0 && krakenAppels > 0, JSON.stringify([c2.source, c2.nouvelles]));
binanceEnPanne = false;

// ── pause ──
r = await appeler(env, 'POST', '/agent/commande', { type: 'pause' }, BASE + 5 * 60e3); v('pause : appliquée tout de suite côté Worker', r.j.ok);
c = await S.cronAgent(env, {}, BASE + 10 * 60e3 + 60e3 - 60e3 + 60e3, { fetchImpl, envoyer }); v('en pause : le Worker ne surveille plus', /pause/.test(c.action), JSON.stringify(c));
r = await appeler(env, 'GET', '/agent/statut', null, BASE + 5 * 60e3 + 1000); v('statut : en pause', r.j.statut.code === 'pause');
r = await appeler(env, 'POST', '/agent/commande', { type: 'reprendre' }, BASE + 6 * 60e3); v('reprise acceptée', r.j.ok);

// ── dérive : le Worker met la règle en pause et prévient ──
{
  const env2 = { DB: fausseD1() }, etat2 = E.etatInitial(T0); E.creerVersion(etat2, { candidates: [{ famille: 'test_signal', paire: 'BTC', params: { a: 1 }, validation: { statut: 'validee_backtest', esperance: 0.6 } }], raison: 'test dérive' }, T0);
  const mauvais = ETAT_REGLE_VIDE(); mauvais.derniereBarre = BASE - 2 * 900e3; for (let i = 0; i < 12; i++) mauvais.trades.push({ t: BASE - (40 - i) * 3600e3, tSortie: BASE - (39 - i) * 3600e3, sens: 1, R: -1.2, motif: 'stop', barres: 3, prixEntree: 1, prixSortie: 1, stop: 1, cible: 2, signalT: 0 });
  await appeler(env2, 'POST', '/agent/sync', { etat: etat2, suivi: { [id]: mauvais } }, BASE); await D.metaEcrire(env2.DB, 'pc_vivant_le', BASE - 3600e3, BASE);
  const e2 = []; const c3 = await S.cronAgent(env2, {}, BASE + 60e3, { fetchImpl, envoyer: async (x, y) => { e2.push({ texte: x, type: y }); } });
  v('dérive détectée : alerte « stratégie dégradée » et règle mise en pause', c3.derive === true && e2.some(x => /dégradée|PAUSE/i.test(x.texte)) && !!(await D.metaLire(env2.DB, 'pause_regle:' + id)), JSON.stringify(c3));
  const n2 = e2.length, c4 = await S.cronAgent(env2, {}, BASE + 16 * 60e3, { fetchImpl, envoyer: async (x, y) => { e2.push({ texte: x, type: y }); } });
  v('règle en pause (dérive) : plus de surveillance ni d’alerte', /règle en pause/.test(c4.action) && e2.length === n2, JSON.stringify(c4));
}
// ── conflit PC / Worker : le suivi du Worker, plus récent, est conservé ──
{
  const env3 = { DB: fausseD1() }; const e3 = E.etatInitial(T0); E.creerVersion(e3, { candidates: [{ famille: 'test_signal', paire: 'BTC', params: { a: 1 }, validation }], raison: 'conflit' }, T0);
  const recent = ETAT_REGLE_VIDE(); recent.derniereBarre = BASE; const ancien = ETAT_REGLE_VIDE(); ancien.derniereBarre = BASE - 10 * 900e3;
  await appeler(env3, 'POST', '/agent/sync', { etat: e3, suivi: { [id]: recent } }, BASE);
  const rr = await appeler(env3, 'POST', '/agent/sync', { etat: e3, suivi: { [id]: ancien } }, BASE + 1000);
  v('conflit : le PC revient avec un suivi PLUS ANCIEN → le Worker garde le sien et le rend', rr.j.suiviWorker[id] && rr.j.suiviWorker[id].derniereBarre === BASE && (await D.suiviLire(env3.DB))[id].derniereBarre === BASE);
}
// ── rapport ──
r = await appeler(env, 'GET', '/agent/rapport', null, BASE + 60e3);
v('rapport en 5 lignes, avec le rappel', r.j.lignes.length === 5 && /ne garantissent rien/.test(r.j.lignes[4]));
delete FAMILLES.test_signal;
console.log(`\n${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
