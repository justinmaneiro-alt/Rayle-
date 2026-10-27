import http from 'node:http';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

/* Mini-Worker LOCAL qui exécute les VRAIES routes /actualites, /actualites/fil et /meteo du dossier worker/ (ignoré par git) avec les vraies sources (flux RSS, Open-Meteo),
   sans passer par Cloudflare ni par l'authentification. Sert aux démonstrations et aux captures « avec de vraies données » avant que Justin déploie le Worker.
   Usage : node tests-navigateur/worker-local-reel.mjs [port]  (port 8796 par défaut) puis, dans la page : rayle_worker_url = http://127.0.0.1:8796 */
const RACINE = fileURLToPath(new URL('../worker/src/', import.meta.url));
export async function demarrerWorkerReel(port = 8796) {
  if (!fs.existsSync(RACINE + 'terre/actualites.js')) throw new Error('worker/ absent : rien à lancer');
  const stock = new Map();
  globalThis.caches = { default: { match: async k => stock.get(String(k.url || k)) || null, put: async (k, r) => { stock.set(String(k.url || k), new Response(await r.clone().text())); } } };
  const A = await import(pathToFileURL(RACINE + 'terre/actualites.js').href), M = await import(pathToFileURL(RACINE + 'terre/meteo.js').href);
  const F = fs.existsSync(RACINE + 'terre/fil.js') ? await import(pathToFileURL(RACINE + 'terre/fil.js').href) : null;
  const OUT = F ? (await import(pathToFileURL(RACINE + 'intelligence/outils/index.js').href)).OUTILS : null;
  const AG = F ? await import('./agent-local.mjs') : null;
  const MA = fs.existsSync(RACINE + 'terminal/marches.js') ? await import(pathToFileURL(RACINE + 'terminal/marches.js').href) : null;   // terminal de Mars : la VRAIE route /marche (Yahoo Finance, Twelve Data si la clé existe, secours)
  const ctx = { waitUntil: () => {} }, journal = [];
  // D1 en mémoire (la vraie base n'est pas touchée) : le fil d'actualités fonctionne comme en ligne, par lots rangés puis assemblés
  const m = new Map();
  const D1 = { prepare(sql) { const o = { args: [], bind(...a) { o.args = a; return o; },
    async first() { const r = m.get(o.args[0]); return r ? { valeur: r.valeur, expire: r.expire } : null; },
    async all() { const re = new RegExp('^' + o.args[0].replace(/%/g, '.*') + '$'); return { results: [...m.entries()].filter(([k, r]) => re.test(k) && r.expire > o.args[1]).map(([k, r]) => ({ cle: k, valeur: r.valeur })) }; },
    async run() { if (/INSERT OR REPLACE INTO cache/.test(sql)) m.set(o.args[0], { valeur: o.args[1], expire: o.args[2] }); return {}; } }; return o; }, async batch() { return []; } };
  const env = { DB: D1 };
  if (F) {   // tous les lots d'un coup au démarrage (en ligne : un lot par minute), puis toutes les 10 minutes
    const cycle = async () => { const t = Date.now(); await Promise.all(['france', 'monde'].flatMap(p => F.lotsDe(p).map((_, i) => F.lireLot(env, ctx, p, i, t).catch(() => null)))); await F.assembler(env, ctx, 'france', t).catch(() => null); await F.assembler(env, ctx, 'monde', t).catch(() => null); };
    await cycle(); setInterval(cycle, 600000).unref();
  }
  const srv = http.createServer(async (req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const u = new URL(req.url, 'http://x'); journal.push(u.pathname + u.search);
    const envoyer = async r => { res.writeHead(r.status, { ...cors, 'Content-Type': 'application/json' }); res.end(await r.text()); };
    const json = (o, c = 200) => { res.writeHead(c, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    try {
      if (u.pathname === '/ping') return json({ ok: true, version: 'local-reel', adresse: 'tu', voix: 'Test', feminin: true, vitesse: -8, ia: ['Local'], d1: false, mode: 'normal' });
      if (u.pathname === '/securite/etat') return json({ appareil: null, appaire: false, configure: false, deverrouille: false, expire_dans: 0, bloque_dans: 0, defi_dans: 0 });
      if (['/evenements', '/reglages', '/memoire', '/souvenirs'].includes(u.pathname)) return json({ alertes: [], mode: 'normal', notes: [], items: [] });
      if (u.pathname === '/marche' && MA) return envoyer(await MA.routeMarche(u, env, ctx, {}));
      if (u.pathname === '/actualites') return envoyer(await A.routeActualites(u, {}, ctx, {}));
      if (u.pathname === '/meteo') return envoyer(await M.routeMeteo(u, {}, ctx, {}));
      if (u.pathname === '/actualites/fil' && F) return envoyer(await F.routeFil(u, env, ctx, {}));
      if (u.pathname === '/chat' && req.method === 'POST' && AG) {   // SIMULATION d'agent : pas d'IA ici (aucune clé), des règles simples choisissent le vrai outil de la Terre
        let corps = ''; for await (const d of req) corps += d;
        let b = {}; try { b = JSON.parse(corps); } catch (e) {}
        return json(await AG.agentLocal(String(b.text || ''), OUT, ctx, env));
      }
      json({ error: 'route inconnue' }, 404);
    } catch (e) { json({ error: String(e && e.message || e) }, 500); }
  });
  return new Promise(ok => srv.listen(port, '127.0.0.1', () => ok({ url: 'http://127.0.0.1:' + port, journal, fermer: () => new Promise(r => srv.close(r)) })));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const w = await demarrerWorkerReel(Number(process.argv[2]) || 8796);
  console.log('Worker local (vraies sources) sur ' + w.url);
}
