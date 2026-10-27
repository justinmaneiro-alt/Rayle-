// Pont « Caméra Rayle » (phase 11) : HTTPS auto-signé réel, jeton QR, appairage, liste blanche des points de main, instance séparée de la télécommande, limites.
//   node galaxie/tests/camera-pont-test.mjs        (utilise PowerShell pour fabriquer le certificat : Windows)
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { creerPontCamera } from '../../app-pc/camera-pont.mjs';
import { creerTelecommande } from '../../app-pc/telecommande.mjs';
import { masquee, ouvrirWSTls, requeteTls } from './ws-tls-aide.mjs';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), R = createRequire(import.meta.url), H = R('../../core/gestes/main-synthetique.js');
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const pause = ms => new Promise(r => setTimeout(r, ms));
const attendre = async (f, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await pause(15); } return false; };
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-cam-'));
const pont = creerPontCamera({ racine: RACINE, dossierDonnees: dossier, port: 0, ip: '127.0.0.1' });
const tablette = creerTelecommande({ racine: RACINE, dossierDonnees: dossier, port: 0, ip: '127.0.0.1' });
const local = http.createServer((q, r) => { const c = new URL(q.url, 'http://x').pathname; if (c.startsWith('/__cam/')) pont.gererLocal(q, r, c); else tablette.gererLocal(q, r, c); });
local.on('upgrade', (q, s) => { if (String(q.url).startsWith('/__cam/')) pont.upgradeLocal(q, s); else tablette.upgradeLocal(q, s); });
await new Promise(r => local.listen(0, '127.0.0.1', r)); const pl = local.address().port;
const api = async (chemin, corps, entete = 'x-rayle-cam') => { const r = await fetch('http://127.0.0.1:' + pl + chemin, { method: corps === undefined ? 'GET' : 'POST', headers: { [entete]: '1' }, body: corps === undefined ? undefined : JSON.stringify(corps) }); return { statut: r.status, json: await r.json().catch(() => null) }; };

v('désactivé par défaut', (await api('/__cam/etat')).json.actif === false);
v('routes locales : l’en-tête de la télécommande de la tablette ne suffit pas (instances séparées)', (await api('/__cam/etat', undefined, 'x-rayle-tele')).statut === 403);
const act = (await api('/__cam/activer', {})).json;
v('activation : URL en HTTPS /camera?jeton=…, code à 6 chiffres, QR', act.actif === true && act.https === true && /^https:\/\/127\.0\.0\.1:\d+\/camera\?jeton=[0-9a-f]{24}$/.test(act.url) && /^\d{6}$/.test(act.code) && act.qr.length > 20, JSON.stringify({ erreur: act.erreur, av: act.avertissement, url: act.url }));
if (!act.actif || !act.https) { console.log('Pont non démarré en HTTPS : ' + (act.avertissement || act.erreur)); process.exit(1); }
const port = Number(act.adresse.split(':')[1]), jetonQR = act.url.split('jeton=')[1];
v('certificat fabriqué et gardé (fichier .pfx + descripteur)', fs.existsSync(path.join(dossier, 'camera-lan.pfx')) && fs.existsSync(path.join(dossier, 'camera-lan.json')));

// pages servies
v('sans jeton : refusé', (await requeteTls(port, '/camera')).statut === 403 && (await requeteTls(port, '/camera?jeton=' + '0'.repeat(24))).statut === 403);
v('le reste du site est refusé', (await requeteTls(port, '/index.html?jeton=' + jetonQR)).statut === 403 && (await requeteTls(port, '/clavier?jeton=' + jetonQR)).statut === 403 && (await requeteTls(port, '/__cam/etat?jeton=' + jetonQR)).statut === 403);
const page = await requeteTls(port, '/camera?jeton=' + jetonQR), cookie = String(page.entetes['set-cookie'] || '').split(';')[0];
v('page « Caméra Rayle » servie avec le jeton ; cookie Secure, HttpOnly, SameSite', page.statut === 200 && /Caméra Rayle/.test(page.corps.toString()) && /^rayle_cam=/.test(cookie) && /Secure/.test(String(page.entetes['set-cookie'])) && /HttpOnly/.test(String(page.entetes['set-cookie'])) && /SameSite=Strict/.test(String(page.entetes['set-cookie'])));
v('scripts de la page servis (cookie du jeton)', (await requeteTls(port, '/camera/camera.js', { entetes: { cookie } })).statut === 200 && (await requeteTls(port, '/camera/gestes-calcul.js', { entetes: { cookie } })).statut === 200);
const vendor = await requeteTls(port, '/camera/vendor/vision_bundle.mjs', { entetes: { cookie } });
v('fichiers MediaPipe servis depuis assets-lourds/gestes (mjs, wasm, modèle)', fs.existsSync(path.join(RACINE, 'assets-lourds/gestes/vision_bundle.mjs')) ? vendor.statut === 200 && (await requeteTls(port, '/camera/vendor/wasm/vision_wasm_internal.wasm', { entetes: { cookie } })).statut === 200 && (await requeteTls(port, '/camera/vendor/hand_landmarker.task', { entetes: { cookie } })).statut === 200 : vendor.statut === 404);
v('chemins dangereux refusés (remontée de dossier, mauvaise extension)', [(await requeteTls(port, '/camera/vendor/..%2F..%2Fserveur.mjs', { entetes: { cookie } })).statut, (await requeteTls(port, '/camera/vendor/package.json', { entetes: { cookie } })).statut, (await requeteTls(port, '/camera/..%2Fserveur.mjs', { entetes: { cookie } })).statut].every(s => s === 403 || s === 404));
v('méthode non permise refusée', (await requeteTls(port, '/camera?jeton=' + jetonQR, { methode: 'DELETE' })).statut === 405);
v('statut de jeton sans effet de bord', JSON.parse((await requeteTls(port, '/camera/statut?jeton=abc', { entetes: { cookie } })).corps.toString()).jetonValide === false);

// appairage
const appairer = async (code, nom = 'Téléphone test') => { const r = await requeteTls(port, '/camera/appairer', { methode: 'POST', entetes: { cookie }, corps: JSON.stringify({ code, nom }) }); return { statut: r.statut, json: JSON.parse(r.corps.toString() || '{}') }; };
v('appairage : mauvais code refusé', (await appairer(act.code === '000000' ? '111111' : '000000')).statut === 403);
const bon = await appairer(act.code);
v('appairage : bon code → jeton d’appareil de 48 caractères', bon.statut === 200 && /^[0-9a-f]{48}$/.test(bon.json.jeton));
v('appairage : le code ne sert qu’une fois', (await appairer(act.code)).statut === 403);
const jeton = bon.json.jeton;

// instance séparée de la télécommande : un jeton de tablette ne marche pas ici, et inversement
const actT = (await api('/__tele/activer', {}, 'x-rayle-tele')).json, portT = Number(actT.adresse.split(':')[1]);
const pageT = await fetch('http://127.0.0.1:' + portT + '/clavier?jeton=' + actT.url.split('jeton=')[1]), cookieT = (pageT.headers.get('set-cookie') || '').split(';')[0];
const bonT = await (await fetch('http://127.0.0.1:' + portT + '/clavier/appairer', { method: 'POST', headers: { cookie: cookieT }, body: JSON.stringify({ code: actT.code, nom: 'Tablette' }) })).json();
v('un jeton de TABLETTE n’ouvre pas la liaison de la caméra du téléphone', (await ouvrirWSTls(port, '/camera/ws?jeton=' + bonT.jeton)).ok === false);

// liaison
v('liaison : jeton incorrect, absent ou origine étrangère refusés', (await ouvrirWSTls(port, '/camera/ws?jeton=' + 'f'.repeat(48))).ok === false && (await ouvrirWSTls(port, '/camera/ws')).ok === false && (await ouvrirWSTls(port, '/camera/ws?jeton=' + jeton, { Origin: 'https://x.example' })).ok === false);
const pc = await (async () => { const sock = await new Promise(res => { const req = http.request({ host: '127.0.0.1', port: pl, path: '/__cam/ws', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), 'Sec-WebSocket-Version': '13', Origin: 'http://127.0.0.1:' + pl } }); const recus = []; req.on('upgrade', (r, s, head) => { let tampon = Buffer.from(head || []); const lire = () => { for (;;) { if (tampon.length < 2) break; let n = tampon[1] & 127, pos = 2; if (n === 126) { if (tampon.length < 4) break; n = tampon.readUInt16BE(2); pos = 4; } if (tampon.length < pos + n) break; const op = tampon[0] & 15, ch = tampon.subarray(pos, pos + n); tampon = tampon.subarray(pos + n); if (op === 1) { try { recus.push(JSON.parse(ch.toString())); } catch (e) { /* ignoré */ } } } }; s.on('data', d => { tampon = Buffer.concat([tampon, d]); lire(); }); lire(); res({ ok: true, recus, sock: s }); }); req.on('response', () => res({ ok: false })); req.on('error', () => res({ ok: false })); req.end(); }); return sock; })();
v('liaison de la page Rayle du PC acceptée (même origine)', pc.ok === true);
const tel = await ouvrirWSTls(port, '/camera/ws?jeton=' + jeton);
v('liaison du téléphone acceptée, bienvenue avec « PC présent »', tel.ok === true && await attendre(() => tel.recus.some(m => m.t === 'bienvenue' && m.pc === true)));
v('le PC voit le téléphone connecté', await attendre(() => pc.recus.some(m => m.t === 'etat' && m.etat.appareils.some(a => a.connecte && a.nom === 'Téléphone test'))));

// points de main : acceptés, bornés, sinon ignorés
const main = H.creerMain({ pose: 'ouverte' }), msgOk = { a: 'mains', t: 1000, ratio: 1.33, mains: [{ lat: 'Right', pts: main.pts }] };
tel.envoyer(msgOk);
v('points de main valides relayés au PC', await attendre(() => pc.recus.some(m => m.t === 'ev' && m.m && m.m.a === 'mains' && m.m.mains[0].pts.length === 21)));
const avant = pc.recus.length;
for (const mauvais of [{ a: 'commande', id: 'terre' }, { a: 'pointeur', dx: 5, dy: 5 }, { a: 'clic', n: 1 }, { ...msgOk, mains: [msgOk.mains[0], msgOk.mains[0], msgOk.mains[0]] }, { ...msgOk, mains: [{ lat: 'Right', pts: main.pts.slice(0, 10) }] }, { ...msgOk, mains: [{ lat: 'Right', pts: main.pts.map(() => ['x', 'y']) }] }, { a: 'executer', cmd: 'calc.exe' }, 'pas du json {']) tel.envoyer(mauvais);
await pause(400);
v('messages hors liste blanche ou mal formés ignorés (aucune action de la tablette n’est possible depuis la caméra)', pc.recus.length === avant, JSON.stringify(pc.recus.slice(avant)));
tel.envoyer({ a: 'mains', t: 5, ratio: 1.33, mains: [{ lat: 'Left', pts: main.pts.map(p => [999, -999, 9]) }] }); await pause(200);
const born = pc.recus.filter(m => m.t === 'ev').at(-1);
v('coordonnées absurdes ramenées aux bornes', born.m.mains[0].pts.every(p => p[0] <= 2 && p[1] >= -1 && p[2] <= 2));
v('latence mesurée par ping/pong', (tel.envoyer({ t: 'ping', n: 7, l: 12 }), await attendre(() => tel.recus.some(m => m.t === 'pong' && m.n === 7))));
const gros = ouvrirWSTls; void gros;
tel.envoyer(JSON.stringify({ a: 'mains', t: 1, mains: [], bourrage: 'x'.repeat(20000) })); v('trame de plus de 16 Ko : liaison fermée', await attendre(() => tel.ferme() !== null, 2000));

// déconnexion et arrêt
const tel2 = await ouvrirWSTls(port, '/camera/ws?jeton=' + jeton); v('reconnexion possible avec le même jeton', tel2.ok === true);
const id = (await api('/__cam/etat')).json.appareils[0].id;
await api('/__cam/deconnecter', { id }); v('retrait d’un téléphone : liaison coupée (4001) et jeton révoqué', await attendre(() => tel2.ferme() === 4001) && (await ouvrirWSTls(port, '/camera/ws?jeton=' + jeton)).ok === false);
const arret = (await api('/__cam/desactiver', {})).json; v('extinction du pont : actif = faux', arret.actif === false);
v('après extinction : plus rien n’écoute', (await requeteTls(port, '/camera?jeton=' + jetonQR)).statut === 0);
v('journal : refus et connexions tracés, sans les points', (journal => journal.some(j => j.evt === 'appairage') && journal.some(j => j.evt === 'refus') && !JSON.stringify(journal).includes('pts'))(arret.journal || (pont.etat().journal)));
await api('/__tele/desactiver', {}, 'x-rayle-tele'); pc.sock.destroy(); local.close(); pont.fermerTout(); tablette.fermerTout(); fs.rmSync(dossier, { recursive: true, force: true });
console.log(ko ? ko + ' échec(s) / ' + (ok + ko) : ok + ' vérifications réussies.'); process.exit(ko ? 1 : 0);
