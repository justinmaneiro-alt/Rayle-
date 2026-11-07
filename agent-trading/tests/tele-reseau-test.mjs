/* Test RÉSEAU du relais dédié (vrai Worker rayle-or-relais) : appairage, commande admise relayée, commande hors liste ignorée, code inconnu refusé.
   Usage : node agent-trading/tests/tele-reseau-test.mjs */
import assert from 'node:assert/strict';
const U = 'wss://rayle-or-relais.justinmaneiro.workers.dev/tele/ws', code = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
const ouvrir = role => new Promise((ok, ko) => { const w = new WebSocket(`${U}?code=${code}&role=${role}`); w.onopen = () => ok(w); w.onerror = () => ko(new Error('refusé')); });
const tv = await ouvrir('tele'), recus = []; tv.onmessage = e => recus.push(JSON.parse(e.data));
const tc = await ouvrir('commande'); await new Promise(r => setTimeout(r, 800));
tc.send(JSON.stringify({ t: 'cmd', cmd: 'pause' })); tc.send(JSON.stringify({ t: 'cmd', cmd: 'effacer-tout' })); tc.send(JSON.stringify({ t: 'cmd', cmd: 'volume_plus', v: 30, nom: 'Justin' }));
await new Promise(r => setTimeout(r, 1500));
assert.deepEqual(recus, [{ t: 'appaire' }, { t: 'cmd', cmd: 'pause' }, { t: 'cmd', cmd: 'volume_plus', v: 30 }], 'seulement les commandes admises, sans champ en plus');
let refuse = false; try { const w = await new Promise((ok, ko) => { const x = new WebSocket(`${U}?code=${code === '0000' ? '0001' : '0000'}x&role=commande`); x.onopen = () => ok(x); x.onerror = () => ko(); }); w.close(); } catch (e) { refuse = true; }
assert.ok(refuse, 'code invalide refusé');
tv.close(); tc.close(); console.log('tele-reseau-test : 2 vérifications OK (code ' + code + ')'); process.exit(0);
