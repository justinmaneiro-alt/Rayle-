// V11 : relais temps réel du Worker (worker/src/camera/liaison.js) — tests SANS Cloudflare : faux WebSocket / faux état du Durable Object, fausse D1 qui COMPTE chaque accès.
// Vérifie : ticket du PC (signature, expiration, session), sous-protocoles, règles d'admission des messages (liste blanche, tailles, pas d'image, pas de binaire du PC), limite de débit,
// une seule connexion par rôle, expiration, serveurs ICE (STUN seul / TURN / panne), routes (version, ice, ticket, ws), et SURTOUT : aucun accès à D1 pendant le transfert des paquets.
// Lancer : node galaxie/tests/liaison-worker-test.mjs   (ignoré si worker/ est absent : ce dossier n'est pas dans git)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const chemin = path.join(RACINE, 'worker/src/camera/liaison.js');
if (!fs.existsSync(chemin)) { console.log('worker/ absent (ignoré par git) : test ignoré'); process.exit(0); }
const L = await import('file:///' + chemin.replace(/\\/g, '/'));
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const ReelleResponse = globalThis.Response;

// ── ticket du PC ──
const T0 = 1_800_000_000_000;
const t1 = await L.signerTicket('secret', 'sess12345', T0);
v('ticket : session, expiration (2 min) et signature', /^sess12345\.\d+\.[\w-]{43}$/.test(t1.ticket) && t1.expire === (Math.floor(T0 / 1000) + 120) * 1000, t1.ticket);
v('ticket valable pour sa session', await L.verifierTicket('secret', t1.ticket, 'sess12345', T0 + 60_000));
v('ticket expiré : refusé', !(await L.verifierTicket('secret', t1.ticket, 'sess12345', T0 + 130_000)));
v('ticket d’une autre session : refusé', !(await L.verifierTicket('secret', t1.ticket, 'autre-session', T0 + 1000)));
v('ticket fabriqué avec un autre secret : refusé', !(await L.verifierTicket('autre', t1.ticket, 'sess12345', T0 + 1000)));
const p = t1.ticket.split('.'); v('ticket modifié (expiration prolongée) : refusé', !(await L.verifierTicket('secret', p[0] + '.' + (Number(p[1]) + 9999) + '.' + p[2], 'sess12345', T0 + 1000)));
v('ticket vide / absurde : refusé', !(await L.verifierTicket('secret', '', 'sess12345', T0)) && !(await L.verifierTicket('secret', 'a.b', 'sess12345', T0)) && !(await L.verifierTicket('secret', undefined, 'sess12345', T0)));

// ── sous-protocoles ──
const pr = L.lireProtocoles('rayle.v1, k.AbC-_123');
v('sous-protocoles : clé du téléphone lue', pr.ok && pr.cle === 'AbC-_123' && !pr.ticket);
const pr2 = L.lireProtocoles('rayle.v1,t.sess.123.sig'); v('sous-protocoles : ticket du PC lu', pr2.ok && pr2.ticket === 'sess.123.sig' && !pr2.cle);
v('sous-protocoles : sans « rayle.v1 » : refusé', !L.lireProtocoles('k.abc').ok && !L.lireProtocoles('').ok && !L.lireProtocoles(null).ok);

// ── admission des messages ──
const bin = (n, premier = 1) => { const b = new Uint8Array(n); b[0] = premier; return b.buffer; };
v('admission : paquet binaire du téléphone (1 main = 100 octets)', L.admettre('tel', bin(100)) === 'ok');
v('admission : paquet binaire à deux mains (184 octets)', L.admettre('tel', bin(184)) === 'ok');
v('admission : binaire trop gros (> 184) refusé', L.admettre('tel', bin(185)) !== 'ok' && L.admettre('tel', bin(5000)) !== 'ok');
v('admission : binaire trop court refusé', L.admettre('tel', bin(15)) !== 'ok');
v('admission : mauvaise version de paquet refusée', L.admettre('tel', bin(100, 7)) !== 'ok');
v('admission : le PC n’envoie jamais de binaire', L.admettre('pc', bin(100)) !== 'ok');
for (const t of ['ping', 'pong', 'caps', 'tel', 'stats', 'cfg', 'rtt', 'fin', 'diag']) v('admission : message de contrôle « ' + t + ' »', L.admettre('tel', JSON.stringify({ t })) === 'ok' && L.admettre('pc', JSON.stringify({ t })) === 'ok');
v('admission : AUCUN aperçu vidéo / image par le Worker', L.admettre('tel', JSON.stringify({ a: 'image', d: 'data:image/jpeg;base64,AAAA' })) !== 'ok');
v('admission : la négociation vidéo (sdp) reste en direct, jamais par le Worker', L.admettre('tel', JSON.stringify({ t: 'sdp', type: 'offer', sdp: 'v=0' })) !== 'ok' && L.admettre('pc', JSON.stringify({ t: 'sdp', type: 'answer', sdp: 'v=0' })) !== 'ok');
v('admission : message inconnu / illisible refusé', L.admettre('tel', '{"t":"autre"}') !== 'ok' && L.admettre('tel', 'pas du json') !== 'ok' && L.admettre('tel', '42') !== 'ok' && L.admettre('tel', '') !== 'ok');
v('admission : message de contrôle de plus de 4 Ko refusé', L.admettre('tel', JSON.stringify({ t: 'diag', x: 'a'.repeat(5000) })) !== 'ok');
v('admission : trame texte (ancien format) acceptée du téléphone seulement', L.admettre('tel', JSON.stringify({ a: 'mains', t: 1, mains: [] })) === 'ok' && L.admettre('pc', JSON.stringify({ a: 'mains', t: 1, mains: [] })) !== 'ok');
v('admission : trame texte à 3 mains refusée', L.admettre('tel', JSON.stringify({ a: 'mains', t: 1, mains: [1, 2, 3] })) !== 'ok');
const sdp = 'v=0\r\n' + 'a=x\r\n'.repeat(100);
v('admission : signalisation offre / réponse / candidat / fin', L.admettre('tel', JSON.stringify({ t: 'sig', m: { k: 'offre', sdp } })) === 'ok' && L.admettre('pc', JSON.stringify({ t: 'sig', m: { k: 'reponse', sdp } })) === 'ok' && L.admettre('tel', JSON.stringify({ t: 'sig', m: { k: 'ice', c: { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host' } } })) === 'ok' && L.admettre('pc', JSON.stringify({ t: 'sig', m: { k: 'fin' } })) === 'ok');
v('admission : signalisation invalide refusée (sdp qui ne commence pas par v=0, sdp énorme, type inconnu)', L.admettre('tel', JSON.stringify({ t: 'sig', m: { k: 'offre', sdp: 'pas un sdp' } })) !== 'ok' && L.admettre('tel', JSON.stringify({ t: 'sig', m: { k: 'offre', sdp: 'v=0' + 'x'.repeat(5200) } })) !== 'ok' && L.admettre('tel', JSON.stringify({ t: 'sig', m: { k: 'script', x: 1 } })) !== 'ok');

// ── serveurs ICE ──
L._viderCacheIce();
const sans = await L.obtenirIce({}, T0);
v('ICE sans secrets : STUN seul, dit pourquoi', sans.turn === false && sans.iceServers.length === 1 && /TURN non configuré/.test(sans.raison) && sans.v === 11);
let appels = 0, dernier = null;
const faux = async (url, init) => { appels++; dernier = { url, init }; return { ok: true, json: async () => ({ iceServers: { urls: ['stun:stun.cloudflare.com:3478', 'turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turns:turn.cloudflare.com:5349?transport=tcp'], username: 'u1', credential: 'c1' } }) }; };
const avec = await L.obtenirIce({ TURN_KEY_ID: 'cle id', TURN_KEY_API_TOKEN: 'jeton' }, T0, faux);
v('ICE avec secrets : STUN + TURN (identifiants temporaires), port 53 retiré', avec.turn === true && avec.iceServers.length === 2 && avec.iceServers[1].username === 'u1' && avec.iceServers[1].credential === 'c1' && !avec.iceServers[1].urls.some(u => /:53(\?|$)/.test(u)) && avec.iceServers[1].urls.length === 3, JSON.stringify(avec.iceServers[1]));
v('ICE : appel à l’API Cloudflare avec le jeton en en-tête (jamais dans l’adresse), durée de vie 6 h', /rtc\.live\.cloudflare\.com\/v1\/turn\/keys\/cle%20id\/credentials\/generate$/.test(dernier.url) && dernier.init.headers.Authorization === 'Bearer jeton' && JSON.parse(dernier.init.body).ttl === 21600 && !dernier.url.includes('jeton'));
await L.obtenirIce({ TURN_KEY_ID: 'a', TURN_KEY_API_TOKEN: 'b' }, T0 + 1000, faux); v('ICE : les identifiants sont mis en cache (un seul appel à Cloudflare)', appels === 1);
L._viderCacheIce();
const panne = await L.obtenirIce({ TURN_KEY_ID: 'a', TURN_KEY_API_TOKEN: 'b' }, T0, async () => ({ ok: false, status: 401 }));
v('ICE : API Cloudflare en panne → STUN seul, jamais d’exception, la raison est dite', panne.turn === false && panne.iceServers.length === 1 && /TURN indisponible : HTTP 401/.test(panne.raison), JSON.stringify(panne));
L._viderCacheIce();
const reseau = await L.obtenirIce({ TURN_KEY_ID: 'a', TURN_KEY_API_TOKEN: 'b' }, T0, async () => { throw new Error('réseau coupé'); });
v('ICE : réseau coupé → STUN seul', reseau.turn === false && /réseau coupé/.test(reseau.raison));
L._viderCacheIce();

// ── routes ──
const CORS = { 'Access-Control-Allow-Origin': '*' };
const urlDe = (p, q = '') => new URL('https://w.example' + p + q);
const reqDe = (methode, corps, entetes = {}) => new Request('https://w.example/x', { method: methode, body: corps === undefined ? undefined : JSON.stringify(corps), headers: entetes });
let acces = 0; const cleOK = async (db, s, cle) => (s === 'sess12345' && cle === 'bonne-cle' ? { id: s, cle_expire: T0 + 600_000 } : null);
const env0 = { RAYLE_TOKEN: 'secret' };
const rep = async (r) => ({ st: r.status, j: await r.json().catch(() => null) });
let r = await rep(await L.routeLiaison(reqDe('GET'), urlDe('/camera/version'), { ...env0, LIAISON: {} }, CORS, { db: async () => (acces++, null), cleValable: cleOK }, T0));
v('GET /camera/version : version 11, relais présent, TURN absent — sans toucher D1', r.st === 200 && r.j.v === 11 && r.j.relais === true && r.j.turn === false && acces === 0, JSON.stringify(r.j));
r = await rep(await L.routeLiaison(reqDe('GET'), urlDe('/camera/version'), { ...env0, TURN_KEY_ID: 'a', TURN_KEY_API_TOKEN: 'b' }, CORS, { db: async () => null, cleValable: cleOK }, T0));
v('GET /camera/version sans Durable Object : relais = false (le PC saura dire « redéployer »)', r.j.relais === false && r.j.turn === true);
r = await rep(await L.routeLiaison(reqDe('POST', { s: 'sess12345' }), urlDe('/camera/ticket'), env0, CORS, { db: async () => (acces++, null), cleValable: cleOK }, T0));
v('POST /camera/ticket : ticket signé, sans D1', r.st === 200 && /^sess12345\./.test(r.j.ticket) && acces === 0);
r = await rep(await L.routeLiaison(reqDe('POST', { s: '../mauvais' }), urlDe('/camera/ticket'), env0, CORS, { db: async () => null, cleValable: cleOK }, T0));
v('POST /camera/ticket : session invalide refusée', r.st === 400);
r = await rep(await L.routeLiaison(reqDe('POST', { s: 'sess12345', cle: 'mauvaise' }), urlDe('/camera/ice'), env0, CORS, { db: async () => ({}), cleValable: cleOK }, T0));
v('POST /camera/ice : clé refusée → 403', r.st === 403);
r = await rep(await L.routeLiaison(reqDe('POST', { s: 'sess12345', cle: 'bonne-cle' }), urlDe('/camera/ice'), env0, CORS, { db: async () => ({}), cleValable: cleOK }, T0));
v('POST /camera/ice : clé valable → serveurs ICE', r.st === 200 && Array.isArray(r.j.iceServers) && r.j.iceServers.length >= 1);
r = await rep(await L.routeLiaison(reqDe('POST', {}), urlDe('/camera/ice-pc'), env0, CORS, { db: async () => null, cleValable: cleOK }, T0));
v('POST /camera/ice-pc : serveurs ICE pour le PC', r.st === 200 && Array.isArray(r.j.iceServers));
r = await rep(await L.routeLiaison(reqDe('GET'), urlDe('/camera/ws', '?s=sess12345'), { ...env0, LIAISON: {} }, CORS, { db: async () => ({}), cleValable: cleOK }, T0));
v('GET /camera/ws sans en-tête Upgrade : 426', r.st === 426);
const avecUpgrade = (proto) => new Request('https://w.example/camera/ws?s=sess12345', { headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': proto } });
r = await rep(await L.routeLiaison(avecUpgrade('rayle.v1,k.bonne-cle'), urlDe('/camera/ws', '?s=sess12345'), env0, CORS, { db: async () => ({}), cleValable: cleOK }, T0));
v('GET /camera/ws sans Durable Object (Worker pas redéployé) : 501 avec le message « redéployer »', r.st === 501 && /redéployer/.test(r.j.error));
const appelsDO = []; const LIAISON = { idFromName: n => 'id:' + n, get: id => ({ fetch: async (u, init) => { appelsDO.push({ id, u }); return new ReelleResponse('relayé', { status: 200 }); } }) };
const envDO = { ...env0, LIAISON };
r = await rep(await L.routeLiaison(avecUpgrade('rayle.v1,k.mauvaise'), urlDe('/camera/ws', '?s=sess12345'), envDO, CORS, { db: async () => ({}), cleValable: cleOK }, T0));
v('GET /camera/ws : clé du téléphone refusée → 403, le Durable Object n’est pas touché', r.st === 403 && appelsDO.length === 0);
r = await rep(await L.routeLiaison(avecUpgrade('rayle.v1,t.sess12345.1.fausse'), urlDe('/camera/ws', '?s=sess12345'), envDO, CORS, { db: async () => ({}), cleValable: cleOK }, T0));
v('GET /camera/ws : ticket faux → 403', r.st === 403 && appelsDO.length === 0);
r = await rep(await L.routeLiaison(avecUpgrade('rayle.v1'), urlDe('/camera/ws', '?s=sess12345'), envDO, CORS, { db: async () => ({}), cleValable: cleOK }, T0));
v('GET /camera/ws : sans identification → 401', r.st === 401);
r = await rep(await L.routeLiaison(avecUpgrade('rayle.v1,k.bonne-cle'), urlDe('/camera/ws', '?s=session invalide!'), envDO, CORS, { db: async () => ({}), cleValable: cleOK }, T0));
v('GET /camera/ws : nom de session invalide → 400', r.st === 400);
const tk = await L.signerTicket('secret', 'sess12345', T0);
await L.routeLiaison(avecUpgrade('rayle.v1,t.' + tk.ticket), urlDe('/camera/ws', '?s=sess12345'), envDO, CORS, { db: async () => (acces++, {}), cleValable: cleOK }, T0 + 1000);
await L.routeLiaison(avecUpgrade('rayle.v1,k.bonne-cle'), urlDe('/camera/ws', '?s=sess12345'), envDO, CORS, { db: async () => (acces++, {}), cleValable: cleOK }, T0 + 1000);
v('GET /camera/ws : PC (ticket) et téléphone (clé) sont envoyés au Durable Object de LA session, avec leur rôle', appelsDO.length === 2 && appelsDO.every(a => a.id === 'id:sess12345') && /role=pc/.test(appelsDO[0].u) && /role=tel/.test(appelsDO[1].u) && /exp=\d+/.test(appelsDO[1].u), JSON.stringify(appelsDO.map(a => a.u)));
v('le ticket du PC n’a pas besoin de D1 ; la clé du téléphone est vérifiée UNE fois, à la connexion', acces === 1, String(acces));
v('route inconnue : null (laissée à relais.js)', (await L.routeLiaison(reqDe('GET'), urlDe('/camera/lire'), env0, CORS, { db: async () => null, cleValable: cleOK }, T0)) === null);
await L.fermerLiaison({ LIAISON }, 'sess12345'); v('fermer la session ferme aussi le Durable Object', appelsDO.some(a => /\/fin$/.test(a.u)));
v('fermer : session invalide ignorée, sans erreur', (await L.fermerLiaison({ LIAISON }, '../x')) === false && (await L.fermerLiaison({}, 'sess12345')) === false);

// ── Durable Object (faux état, faux WebSocket) ──
class FauxWs { constructor() { this.recu = []; this.ferme = null; this.att = null; } send(m) { if (this.ferme) throw new Error('fermé'); this.recu.push(m); } close(code, raison) { this.ferme = { code, raison }; } serializeAttachment(a) { this.att = a; } deserializeAttachment() { return this.att; } }
globalThis.WebSocketPair = class { constructor() { this[0] = new FauxWs(); this[1] = new FauxWs(); } };
function fauxEtat() { const liste = []; let alarme = null; return { liste, get alarme() { return alarme; }, acceptWebSocket(ws, tags) { ws.tags = tags; liste.push(ws); }, getWebSockets(tag) { return liste.filter(w => !w.ferme && (!tag || (w.tags || []).includes(tag))); }, getTags: w => w.tags, storage: { setAlarm: async t => { alarme = t; } } }; }
// Un environnement qui LÈVE une exception au moindre accès : le Durable Object ne doit jamais toucher D1 (ni rien d'autre)
let accesInterdits = 0; const envPiege = new Proxy({}, { get() { accesInterdits++; throw new Error('accès interdit'); } });
globalThis.Response = function (corps, init) { return { corps, status: init && init.status, webSocket: init && init.webSocket, headers: init && init.headers }; };   // le vrai Response refuse le statut 101 hors de Cloudflare
const etat = fauxEtat(), DO = new L.LiaisonCamera(etat, envPiege);
const upg = q => ({ url: 'https://liaison/ws?' + q, headers: { get: h => (h === 'Upgrade' ? 'websocket' : null) } });
const rPc = await DO.fetch(upg('role=pc&exp=' + (Date.now() + 600_000))); const pcServeur = etat.liste[0];
v('Durable Object : connexion du PC acceptée (101, sous-protocole rayle.v1)', rPc.status === 101 && !!rPc.webSocket && rPc.headers['Sec-WebSocket-Protocol'] === 'rayle.v1');
v('Durable Object : le PC reçoit « bienvenue » (sans téléphone encore)', JSON.parse(pcServeur.recu[0]).t === 'bienvenue' && JSON.parse(pcServeur.recu[0]).pair === false);
const rTel = await DO.fetch(upg('role=tel&exp=' + (Date.now() + 300_000))); const telServeur = etat.liste[1];
v('Durable Object : l’arrivée du téléphone est annoncée au PC (« pair »)', pcServeur.recu.some(m => { const j = JSON.parse(m); return j.t === 'pair' && j.present === true && j.role === 'tel'; }) && JSON.parse(telServeur.recu[0]).pair === true);
v('Durable Object : une alarme d’expiration est armée à la plus proche des échéances', etat.alarme != null && Math.abs(etat.alarme - telServeur.att.exp) < 5);
// transfert de paquets : 3000 paquets du téléphone au PC
const avantPc = pcServeur.recu.length;
for (let i = 0; i < 3000; i++) { if (i % 150 === 0) { telServeur.att = { ...telServeur.att }; } DO.webSocketMessage(telServeur, bin(100)); if (i % 150 === 149) DO.cpt = new WeakMap(); }   // le compteur est remis à zéro toutes les 150 pour simuler 50 paquets/s sur 1 minute
v('Durable Object : 3000 paquets transmis au PC (≈ 1 minute à 50/s), dans l’ordre, sans copie ni modification', pcServeur.recu.length - avantPc === 3000 && pcServeur.recu[pcServeur.recu.length - 1].byteLength === 100);
v('Durable Object : AUCUN accès à D1 (ni à l’environnement) pendant tout ce transfert', accesInterdits === 0, String(accesInterdits));
// le PC répond
const avantTel = telServeur.recu.length; DO.webSocketMessage(pcServeur, JSON.stringify({ t: 'ping', n: 1 })); DO.webSocketMessage(pcServeur, JSON.stringify({ t: 'cfg', res: 320 }));
v('Durable Object : les messages du PC arrivent au téléphone', telServeur.recu.length - avantTel === 2);
DO.webSocketMessage(pcServeur, bin(100)); v('Durable Object : un binaire envoyé par le PC est jeté', telServeur.recu.length - avantTel === 2);
DO.webSocketMessage(telServeur, JSON.stringify({ a: 'image', d: 'data:image/jpeg;base64,AAAA' })); v('Durable Object : un aperçu vidéo est jeté (jamais par le Worker)', !pcServeur.recu.some(m => typeof m === 'string' && /image/.test(m)));
DO.webSocketMessage(telServeur, bin(5000)); DO.webSocketMessage(telServeur, 'x'.repeat(9000)); v('Durable Object : message énorme jeté', !pcServeur.recu.some(m => (m.byteLength || m.length) > 1000));
// limite de débit : 200 messages par seconde
const etat2 = fauxEtat(), DO2 = new L.LiaisonCamera(etat2, envPiege); await DO2.fetch(upg('role=pc')); await DO2.fetch(upg('role=tel')); const pc2 = etat2.liste[0], tel2 = etat2.liste[1], base2 = pc2.recu.length;
for (let i = 0; i < 1000; i++) DO2.webSocketMessage(tel2, bin(100));
v('Durable Object : limite de débit — pas plus de 200 messages par seconde par connexion (1000 envoyés d’un coup → 200 passent)', pc2.recu.length - base2 === 200, String(pc2.recu.length - base2));
// une seule connexion par rôle
const etat3 = fauxEtat(), DO3 = new L.LiaisonCamera(etat3, envPiege); await DO3.fetch(upg('role=tel')); const ancienne = etat3.liste[0]; await DO3.fetch(upg('role=tel'));
v('Durable Object : une seule connexion par rôle — la nouvelle remplace l’ancienne (code 4000)', ancienne.ferme && ancienne.ferme.code === 4000 && etat3.getWebSockets('tel').length === 1);
// fin de session
const etat4 = fauxEtat(), DO4 = new L.LiaisonCamera(etat4, envPiege); await DO4.fetch(upg('role=pc')); await DO4.fetch(upg('role=tel'));
await DO4.fetch({ url: 'https://liaison/fin', headers: { get: () => null } }); v('Durable Object : /fin ferme tout (code 4003)', etat4.liste.every(w => w.ferme && w.ferme.code === 4003));
// expiration
const etat5 = fauxEtat(), DO5 = new L.LiaisonCamera(etat5, envPiege); await DO5.fetch(upg('role=tel&exp=' + (Date.now() + 1000))); await DO5.fetch(upg('role=pc&exp=' + (Date.now() + 600_000)));
await new Promise(r => setTimeout(r, 1100)); await DO5.alarm();
v('Durable Object : à l’échéance de la clé, la connexion du téléphone se ferme (4002), pas celle du PC', etat5.liste[0].ferme && etat5.liste[0].ferme.code === 4002 && !etat5.liste[1].ferme);
// départ d'un pair
const etat6 = fauxEtat(), DO6 = new L.LiaisonCamera(etat6, envPiege); await DO6.fetch(upg('role=pc')); await DO6.fetch(upg('role=tel')); const n6 = etat6.liste[0].recu.length;
DO6.webSocketClose(etat6.liste[1], 1001); v('Durable Object : le départ du téléphone est annoncé au PC', etat6.liste[0].recu.slice(n6).some(m => { const j = JSON.parse(m); return j.t === 'pair' && j.present === false; }));
v('Durable Object : tout ceci sans jamais lire l’environnement (donc sans D1)', accesInterdits === 0);
globalThis.Response = ReelleResponse;

// ── la version de l’application est la même côté page, côté service worker et côté Worker ──
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8');
const vPage = (/RAYLE_VERSION='([^']+)'/.exec(html) || [])[1], vSw = (/const VERSION = '([^']+)'/.exec(sw) || [])[1];
v('version de l’application : index.html = sw.js = Worker (VERSION_APP)', vPage && vPage === vSw && vPage === L.VERSION_APP, [vPage, vSw, L.VERSION_APP].join(' / '));
console.log('Liaison du Worker (V11) : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
