// Aides de test : client WebSocket et requêtes HTTPS vers un serveur à certificat auto-signé (pont caméra). Utilisé par galaxie/tests/camera-pont-test.mjs et tests-navigateur/v2-gestes-test.mjs.
import https from 'node:https';
import tls from 'node:tls';
import crypto from 'node:crypto';
export const masquee = texte => { const b = Buffer.from(texte), cle = crypto.randomBytes(4), n = b.length; const h = n < 126 ? Buffer.from([0x81, 0x80 | n]) : n < 65536 ? Buffer.concat([Buffer.from([0x81, 0xfe]), Buffer.from([n >> 8, n & 255])]) : null; return Buffer.concat([h, cle, Buffer.from(b.map((x, i) => x ^ cle[i & 3]))]); };
export function ouvrirWSTls(port, chemin, entetes = {}) {
  return new Promise(res => {
    const sock = tls.connect({ host: '127.0.0.1', port, rejectUnauthorized: false, servername: 'rayle.local' }, () => {
      sock.write('GET ' + chemin + ' HTTP/1.1\r\nHost: 127.0.0.1:' + port + '\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: ' + crypto.randomBytes(16).toString('base64') + '\r\nSec-WebSocket-Version: 13\r\n' + Object.entries(entetes).map(([k, x]) => k + ': ' + x + '\r\n').join('') + '\r\n');
    });
    let tete = Buffer.alloc(0), ouvert = false, tampon = Buffer.alloc(0), ferme = null; const recus = [];
    const lireTrames = () => { for (;;) { if (tampon.length < 2) break; let n = tampon[1] & 127, pos = 2; if (n === 126) { if (tampon.length < 4) break; n = tampon.readUInt16BE(2); pos = 4; } if (tampon.length < pos + n) break; const op = tampon[0] & 15, ch = tampon.subarray(pos, pos + n); tampon = tampon.subarray(pos + n); if (op === 1) { try { recus.push(JSON.parse(ch.toString())); } catch (e) { /* trame non JSON */ } } else if (op === 8) ferme = ch.length >= 2 ? ch.readUInt16BE(0) : 1005; } };
    sock.on('data', d => {
      if (!ouvert) { tete = Buffer.concat([tete, d]); const i = tete.indexOf('\r\n\r\n'); if (i < 0) return; const ligne = tete.subarray(0, i).toString().split('\r\n')[0]; if (!/ 101 /.test(ligne)) { sock.destroy(); return res({ ok: false, statut: Number((/ (\d{3}) /.exec(ligne) || [])[1]) || 0 }); } ouvert = true; tampon = tete.subarray(i + 4); res({ ok: true, envoyer: o => sock.write(masquee(typeof o === 'string' ? o : JSON.stringify(o))), recus, sock, ferme: () => ferme }); lireTrames(); return; }
      tampon = Buffer.concat([tampon, d]); lireTrames();
    });
    sock.on('close', () => { ferme = ferme ?? 1006; if (!ouvert) res({ ok: false, statut: 0 }); }); sock.on('error', () => {});
  });
}
export const requeteTls = (port, chemin, { methode = 'GET', corps, entetes = {} } = {}) => new Promise(res => { const r = https.request({ host: '127.0.0.1', port, path: chemin, method: methode, rejectUnauthorized: false, headers: entetes }, rep => { const morceaux = []; rep.on('data', d => morceaux.push(d)); rep.on('end', () => res({ statut: rep.statusCode, entetes: rep.headers, corps: Buffer.concat(morceaux) })); }); r.on('error', () => res({ statut: 0, entetes: {}, corps: Buffer.alloc(0) })); if (corps) r.write(corps); r.end(); });

