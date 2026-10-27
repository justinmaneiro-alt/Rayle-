// Test de la route locale /__veilleur/kraken (M6) : proxy en LECTURE SEULE vers l'API publique de Kraken, avec une fausse réponse (aucun appel réseau réel).
// Lancer :  node galaxie/tests/kraken-route-test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'kraken-route-'));
process.env.RAYLE_VEILLEUR_DOSSIER = dossier; process.env.RAYLE_VEILLEUR_SANS_LANCEMENT = '1';
const { creerServeur } = await import('../../serveur.mjs');
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); };
const srv = creerServeur(); await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;

// Faux Kraken : seules les adresses de Kraken sont interceptées ; les appels vers le serveur local passent par le vrai fetch.
const vraiFetch = globalThis.fetch, appels = []; let mode = 'ok';
globalThis.fetch = async (url, opt) => {
  const u = String(url);
  if (!u.startsWith('https://api.kraken.com/')) return vraiFetch(url, opt);
  appels.push(u);
  if (mode === 'http500') return new Response('boom', { status: 500 });
  if (mode === 'panne') throw new Error('réseau coupé');
  return new Response(JSON.stringify({ error: [], result: { XXBTZUSD: [[1792687500, '80000', '80100', '79900', '80050', '80010', '12.5', 100]], last: 1792687500 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const get = p => vraiFetch(base + p).then(async r => ({ s: r.status, j: await r.json() }));

// Pannes d'abord (une panne n'est jamais mise en cache)
mode = 'http500'; let r = await get('/__veilleur/kraken?paire=BTC');
v('Kraken répond 500 : 502 avec le motif, jamais de données inventées', r.s === 502 && r.j.ok === false && /500/.test(r.j.erreur) && !r.j.result, JSON.stringify(r.j));
mode = 'panne'; r = await get('/__veilleur/kraken?paire=SOL');
v('Kraken injoignable : 502 « injoignable » avec le motif', r.s === 502 && /injoignable/.test(r.j.erreur) && /réseau coupé/.test(r.j.erreur), JSON.stringify(r.j));
r = await vraiFetch(base + '/__veilleur/kraken?paire=BTC', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rayle-Multi': '1' }, body: '{}' });
v('en lecture seule : un POST sur cette route n’obtient pas de données de Kraken', r.status !== 200);
mode = 'ok'; appels.length = 0;

r = await get('/__veilleur/kraken?paire=BTC');
v('BTC : la réponse de Kraken est relayée telle quelle', r.s === 200 && r.j.error.length === 0 && Array.isArray(r.j.result.XXBTZUSD), JSON.stringify(r.j).slice(0, 120));
v('une seule adresse possible : l’API publique OHLC de Kraken en M15, sans clé ni en-tête secret', appels.length === 1 && /^https:\/\/api\.kraken\.com\/0\/public\/OHLC\?pair=[A-Z]+&interval=15$/.test(appels[0]), appels[0]);
r = await get('/__veilleur/kraken?paire=BTC');
v('cache de 60 s : le second appel ne retourne pas chez Kraken', r.s === 200 && appels.length === 1, appels.length);
r = await get('/__veilleur/kraken?paire=SOL');
v('SOL : une autre adresse (propre à la paire)', r.s === 200 && appels.length === 2 && /SOL/.test(appels[1]), appels[1]);
r = await get('/__veilleur/kraken?paire=DOGE');
v('DOGE : le symbole Kraken de Dogecoin (XDG)', r.s === 200 && appels.length === 3 && /XDG/.test(appels[2]), appels[2]);
r = await get('/__veilleur/kraken?paire=ETH');
v('paire inconnue : refusée (400) sans aucun appel externe', r.s === 400 && appels.length === 3, r.s);
r = await get('/__veilleur/kraken?paire=../../etc/passwd');
v('paire piégée : refusée (400), pas d’injection dans l’adresse', r.s === 400 && appels.length === 3);


globalThis.fetch = vraiFetch; srv.close(); fs.rmSync(dossier, { recursive: true, force: true });
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
