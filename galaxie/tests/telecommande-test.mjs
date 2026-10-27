// Télécommande K2 : appairage, jeton incorrect, expiration, déconnexion, liste blanche, latence, conflit de port, réseau local seulement.
//   node galaxie/tests/telecommande-test.mjs
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { creerTelecommande, trameTexte } from '../../app-pc/telecommande.mjs';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const T = globalThis.TeleCalcul;
let ok = 0, ko = 0;
const verifier = (nom, v) => { if (v) ok++; else { ko++; console.log('ÉCHEC :', nom); } };
const pause = ms => new Promise(r => setTimeout(r, ms));

// ── pur ──
verifier('réseau local : privées oui', ['192.168.1.5', '10.0.0.2', '172.16.4.1', '172.31.255.1', '127.0.0.1', '::1', '::ffff:192.168.0.9', 'fe80::1', 'fd12::1'].every(T.estReseauLocal));
verifier('réseau local : publiques non', ['8.8.8.8', '172.32.0.1', '172.15.0.1', '1.2.3.4', '2001:db8::1', ''].every(a => !T.estReseauLocal(a)));
verifier('liste blanche : action inconnue ignorée', T.valider({ a: 'executer', cmd: 'calc.exe' }) === null && T.valider({ a: '__proto__' }) === null && T.valider({ a: 'constructor' }) === null);
verifier('liste blanche : commande hors liste ignorée', T.valider({ a: 'commande', id: 'format_c' }) === null && T.valider({ a: 'commande', id: 'terre' }).id === 'terre');
verifier('liste blanche : valeurs mal formées ignorées', T.valider({ a: 'pointeur', dx: 'x', dy: 1 }) === null && T.valider({ a: 'pointeur', dx: NaN, dy: 1 }) === null && T.valider({ a: 'texte', c: 'abc' }) === null && T.valider({ a: 'special', k: 'F4' }) === null);
verifier('liste blanche : déplacement borné', T.valider({ a: 'pointeur', dx: 9999, dy: -9999 }).dx === 300);
verifier('pilote : sticks → touches', [...T.touchesPilote({ tx: 0, ty: 1, rx: -1, ry: 0, poussee: 0, post: true, roulis: 0 })].sort().join() === 'ArrowLeft,KeyW,ShiftLeft');
verifier('inertie : décroît puis s\'arrête', (() => { let v = { vx: 20, vy: 0 }, n = 0; while (!v.fini && n < 5000) { v = T.pasInertie(v.vx, v.vy, 16); n++; } return v.fini && n > 5 && n < 2000; })());

// ── client WebSocket de test (masqué, comme un vrai navigateur) ──
function masquee(texte) {
  const b = Buffer.from(texte), cle = crypto.randomBytes(4), n = b.length; const h = n < 126 ? Buffer.from([0x81, 0x80 | n]) : Buffer.concat([Buffer.from([0x81, 0xfe]), Buffer.from([n >> 8, n & 255])]);
  return Buffer.concat([h, cle, Buffer.from(b.map((x, i) => x ^ cle[i & 3]))]);
}
function ouvrirWS(port, chemin, entetes = {}) {
  return new Promise(res => {
    const req = http.request({ host: '127.0.0.1', port, path: chemin, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), 'Sec-WebSocket-Version': '13', ...entetes } });
    req.on('upgrade', (r, sock, head) => {
      const recus = []; let tampon = Buffer.alloc(0), ferme = null;
      const lire = d => {
        tampon = Buffer.concat([tampon, d]);
        for (;;) {
          if (tampon.length < 2) break; let n = tampon[1] & 127, pos = 2; if (n === 126) { if (tampon.length < 4) break; n = tampon.readUInt16BE(2); pos = 4; }
          if (tampon.length < pos + n) break; const op = tampon[0] & 15, ch = tampon.subarray(pos, pos + n); tampon = tampon.subarray(pos + n);
          if (op === 1) { try { recus.push(JSON.parse(ch.toString())); } catch (e) {} } else if (op === 8) ferme = ch.length >= 2 ? ch.readUInt16BE(0) : 1005;
        }
      };
      sock.on('data', lire); if (head && head.length) lire(head);
      sock.on('close', () => { ferme = ferme ?? 1006; });
      res({ ok: true, envoyer: o => sock.write(masquee(JSON.stringify(o))), recus, sock, ferme: () => ferme });
    });
    req.on('response', r => res({ ok: false, statut: r.statusCode })); req.on('error', () => res({ ok: false, statut: 0 })); req.end();
  });
}
const attendre = async (f, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await pause(15); } return false; };

const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-tele-'));
let horloge = 1_000_000;
const tele = creerTelecommande({ racine: RACINE, dossierDonnees: dossier, port: 0, ip: '127.0.0.1', maintenant: () => horloge });
const local = http.createServer((q, r) => tele.gererLocal(q, r, new URL(q.url, 'http://x').pathname));
local.on('upgrade', (q, s) => tele.upgradeLocal(q, s));
await new Promise(r => local.listen(0, '127.0.0.1', r));
const pl = local.address().port, H = { 'x-rayle-tele': '1' };
const appeler = async (chemin, corps, entetes = H) => { const r = await fetch('http://127.0.0.1:' + pl + chemin, { method: corps === undefined ? 'GET' : 'POST', headers: entetes, body: corps === undefined ? undefined : JSON.stringify(corps) }); return { statut: r.status, json: await r.json().catch(() => null) }; };

// Routes locales : en-tête obligatoire, origine étrangère refusée
verifier('local : sans en-tête refusé (CSRF)', (await appeler('/__tele/etat', undefined, {})).statut === 403);
verifier('local : origine étrangère refusée', (await appeler('/__tele/etat', undefined, { ...H, Origin: 'https://site-malveillant.example' })).statut === 403);
verifier('désactivé par défaut', (await appeler('/__tele/etat')).json.actif === false);
const act = (await appeler('/__tele/activer', {})).json;
verifier('activation depuis Rayle', act.actif === true && /^\d{6}$/.test(act.code) && /\/clavier\?jeton=[0-9a-f]{24}$/.test(act.url) && act.qr.length > 20);
const portR = Number(act.adresse.split(':')[1]), jetonQR = act.url.split('jeton=')[1];

// Page PC : même origine obligatoire
verifier('liaison PC sans origine refusée', (await ouvrirWS(pl, '/__tele/ws')).ok === false);
verifier('liaison PC d\'une origine étrangère refusée', (await ouvrirWS(pl, '/__tele/ws', { Origin: 'https://x.example' })).ok === false);
const pc = await ouvrirWS(pl, '/__tele/ws', { Origin: 'http://127.0.0.1:' + pl, Host: '127.0.0.1:' + pl });
verifier('liaison PC acceptée', pc.ok === true);

// Serveur réseau : jeton QR requis, appairage par code
const get = async (u, h = {}) => (await fetch('http://127.0.0.1:' + portR + u, { headers: h })).status;
verifier('réseau : sans jeton refusé', await get('/clavier') === 403 && await get('/clavier?jeton=' + '0'.repeat(24)) === 403);
verifier('réseau : le reste du site refusé', await get('/index.html?jeton=' + jetonQR) === 403 && await get('/__tele/etat?jeton=' + jetonQR) === 403);
const page = await fetch('http://127.0.0.1:' + portR + '/clavier?jeton=' + jetonQR);
const cookie = (page.headers.get('set-cookie') || '').split(';')[0];
verifier('réseau : page servie avec le jeton QR', page.status === 200 && /rayle_k2=/.test(cookie));
verifier('réseau : calcul partagé servi', await get('/clavier/telecommande-calcul.js', { cookie }) === 200);
const appairer = async (code, nom = 'Tablette test') => { const r = await fetch('http://127.0.0.1:' + portR + '/clavier/appairer', { method: 'POST', headers: { cookie }, body: JSON.stringify({ code, nom }) }); return { statut: r.status, json: await r.json() }; };
const mauvais = (await appairer(act.code === '000000' ? '111111' : '000000')).statut;
verifier('appairage : mauvais code refusé', mauvais === 403);
verifier('appairage : sans cookie refusé', (await fetch('http://127.0.0.1:' + portR + '/clavier/appairer', { method: 'POST', body: JSON.stringify({ code: act.code }) })).status === 403);
const bon = await appairer(act.code);
verifier('appairage : bon code → jeton d\'appareil', bon.statut === 200 && /^[0-9a-f]{48}$/.test(bon.json.jeton));
verifier('appairage : le code ne sert qu\'une fois', (await appairer(act.code, 'Autre')).statut === 403);
const jeton = bon.json.jeton;

// Liaison tablette
verifier('liaison : jeton incorrect refusé', (await ouvrirWS(portR, '/clavier/ws?jeton=' + 'f'.repeat(48))).ok === false);
verifier('liaison : sans jeton refusé', (await ouvrirWS(portR, '/clavier/ws')).ok === false);
verifier('liaison : origine étrangère refusée', (await ouvrirWS(portR, '/clavier/ws?jeton=' + jeton, { Origin: 'https://x.example' })).ok === false);
const tab = await ouvrirWS(portR, '/clavier/ws?jeton=' + jeton);
verifier('liaison : jeton valide accepté', tab.ok === true && await attendre(() => tab.recus.some(m => m.t === 'bienvenue' && m.pc === true && m.delaiMax === 5000)));
verifier('PC informé de l\'appareil connecté', await attendre(() => pc.recus.some(m => m.t === 'etat' && m.etat.appareils.some(a => a.connecte && a.nom === 'Tablette test'))));

// Relais + liste blanche
tab.envoyer({ a: 'commande', id: 'terre' }); tab.envoyer({ a: 'executer', cmd: 'calc.exe' }); tab.envoyer({ a: 'commande', id: 'format_c' }); tab.envoyer({ a: 'texte', c: 'é' });
await pause(250);
const evs = pc.recus.filter(m => m.t === 'ev').map(m => m.m);
verifier('relais : actions de la liste blanche reçues par la page', evs.length === 2 && evs[0].id === 'terre' && evs[1].c === 'é');
verifier('relais : actions hors liste ignorées (et notées)', tele.etat().journal.filter(j => j.evt === 'action ignorée').length === 2);

// Latence : ping/pong + mesure rapportée
tab.envoyer({ t: 'ping', n: 7, l: 23 });
verifier('latence : pong renvoyé', await attendre(() => tab.recus.some(m => m.t === 'pong' && m.n === 7)));
verifier('latence : mesure affichée côté PC', await attendre(() => tele.etat().appareils[0].latence === 23));

// PC → tablette
pc.envoyer({ t: 'reponse', texte: 'Bonjour Justin' });
verifier('réponse de Rayle affichée sur la tablette', await attendre(() => tab.recus.some(m => m.t === 'reponse' && m.texte === 'Bonjour Justin')));

// Expiration réglable
verifier('réglage de l\'expiration', (await appeler('/__tele/reglages', { expirationHeures: 2 })).json.ok === true && (await appeler('/__tele/reglages', { expirationHeures: 0 })).json.ok === false);
horloge += 31 * 24 * 3600 * 1000;   // l'appareil a été appairé avec 720 h : expiré
tab.envoyer({ a: 'commande', id: 'mars' });
verifier('expiration : liaison coupée en cours de route', await attendre(() => tab.ferme() !== null));
verifier('expiration : nouvelle liaison refusée', (await ouvrirWS(portR, '/clavier/ws?jeton=' + jeton)).ok === false);
verifier('expiration : journalisée', tele.etat().journal.some(j => /expiré/.test(j.raison || '')));

// Déconnexion (révocation) depuis Rayle
const act2 = (await appeler('/__tele/etat')).json;
const b2 = await appairer(act2.code, 'Téléphone');
const tab2 = await ouvrirWS(portR, '/clavier/ws?jeton=' + b2.json.jeton);
verifier('appairage d\'un second appareil', tab2.ok === true);
const id2 = (await appeler('/__tele/etat')).json.appareils.find(a => a.nom === 'Téléphone').id;
verifier('déconnecter : réponse ok', (await appeler('/__tele/deconnecter', { id: id2 })).json.ok === true);
verifier('déconnecter : liaison coupée', await attendre(() => tab2.ferme() !== null));
verifier('déconnecter : jeton révoqué', (await ouvrirWS(portR, '/clavier/ws?jeton=' + b2.json.jeton)).ok === false);

// Verrou après 5 mauvais codes
let derniers = []; for (let i = 0; i < 6; i++) derniers.push((await appairer('999999')).statut);
verifier('appairage : verrouillé après des essais répétés', derniers.every(s => s === 403) && tele.etat().journal.some(j => /verrouillé/.test(j.raison || '')));

// Journal sans secret
const jr = JSON.stringify(tele.etat().journal) + fs.readFileSync(path.join(dossier, 'telecommande.json'), 'utf8');
verifier('journal et fichier : aucun jeton en clair', !jr.includes(jeton) && !jr.includes(b2.json.jeton) && !jr.includes(jetonQR));

// Conflit de port
const occupe = net.createServer(); await new Promise(r => occupe.listen(0, '127.0.0.1', r));
const t2 = creerTelecommande({ racine: RACINE, dossierDonnees: dossier, port: occupe.address().port, ip: '127.0.0.1' });
let msg = ''; try { await t2.activer(); } catch (e) { msg = e.message; }
verifier('port occupé : message clair', /déjà utilisé/.test(msg) && /RAYLE_PORT_RESEAU/.test(msg) && t2.etat().actif === false);
occupe.close();

// Arrêt d'urgence
const urg = (await appeler('/__tele/urgence', {})).json;
verifier('urgence : serveur fermé, appareils effacés', urg.actif === false && urg.appareils.length === 0);
verifier('urgence : plus aucune réponse sur le réseau', await fetch('http://127.0.0.1:' + portR + '/clavier?jeton=' + jetonQR).then(() => false, () => true));
verifier('urgence : journalisée', tele.etat().journal.some(j => j.evt === 'arrêt d’urgence'));

pc.sock.destroy(); local.close(); tele.fermerTout(); fs.rmSync(dossier, { recursive: true, force: true });
console.log(`${ok} vérifications réussies, ${ko} échec(s).`);
process.exit(ko ? 1 : 0);
