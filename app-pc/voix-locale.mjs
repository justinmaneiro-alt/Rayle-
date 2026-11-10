/* Voix locale de Raylé (gratuite, hors ligne) : routes /__voix/… de serveur.mjs.
   Lance à la demande le service Python app-pc/voix/serveur-voix.py (Kokoro et Piper, modèles dans assets-lourds/voix/), puis relaie les requêtes.
   Réservé à la machine elle-même (127.0.0.1) : jamais exposé sur le réseau local.
   Routes : GET /__voix/etat · POST /__voix/synth · POST /__voix/arreter */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

export function creerVoixLocale({ racine, port = Number(process.env.RAYLE_VOIX_PORT) || 8766 } = {}) {
  const dossier = path.join(racine, 'assets-lourds', 'voix');
  const python = path.join(dossier, 'py', 'Scripts', 'python.exe');
  const pythonUnix = path.join(dossier, 'py', 'bin', 'python');
  const script = path.join(racine, 'app-pc', 'voix', 'serveur-voix.py');
  const modeles = path.join(dossier, 'modeles');
  let enfant = null, demarrage = null, derniereErreur = '';

  const exe = () => (fs.existsSync(python) ? python : fs.existsSync(pythonUnix) ? pythonUnix : null);
  const installe = () => !!exe() && fs.existsSync(path.join(modeles, 'fr_FR-siwis-medium.onnx'));

  function appeler(methode, chemin, corps, ms = 30000) {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: chemin, method: methode, headers: corps ? { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(corps) } : {} }, r => {
        const morceaux = []; r.on('data', c => morceaux.push(c)); r.on('end', () => resolve({ statut: r.statusCode, type: r.headers['content-type'] || '', corps: Buffer.concat(morceaux) }));
      });
      req.setTimeout(ms, () => req.destroy(new Error('délai dépassé')));
      req.on('error', reject);
      if (corps) req.write(corps);
      req.end();
    });
  }
  const vivant = async () => { try { const r = await appeler('GET', '/sante', null, 1500); return r.statut === 200; } catch (e) { return false; } };

  async function assurer() {
    if (await vivant()) return true;
    if (!installe()) throw new Error('voix locale non installée (lancer : node app-pc/installer-voix.mjs)');
    if (!demarrage) {
      demarrage = (async () => {
        derniereErreur = '';
        enfant = spawn(exe(), [script, String(port)], { cwd: racine, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', RAYLE_VOIX_PORT: String(port) } });
        enfant.stderr.on('data', d => { derniereErreur = (derniereErreur + d.toString()).slice(-600); });
        enfant.on('exit', () => { enfant = null; });
        for (let i = 0; i < 60; i++) { if (await vivant()) return true; if (!enfant) break; await new Promise(r => setTimeout(r, 250)); }
        throw new Error('le service de voix locale ne démarre pas' + (derniereErreur ? ' : ' + derniereErreur.split('\n').filter(Boolean).pop() : ''));
      })().finally(() => { demarrage = null; });
    }
    return demarrage;
  }

  const json = (res, code, obj) => { const b = Buffer.from(JSON.stringify(obj)); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length, 'Cache-Control': 'no-store' }); res.end(b); };
  const local = req => { const a = req.socket.remoteAddress || ''; return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1'; };

  async function gerer(req, res, chemin) {
    if (!local(req)) return json(res, 403, { erreur: 'voix locale : réservée à cette machine' });
    try {
      if (chemin === '/__voix/etat') {
        if (!installe()) return json(res, 200, { installe: false, demarre: false, moteurs: {}, voix: [], raison: 'non installée : lancer node app-pc/installer-voix.mjs' });
        await assurer();
        const r = await appeler('GET', '/sante');
        return json(res, 200, { installe: true, demarre: true, ...JSON.parse(r.corps.toString('utf-8')) });
      }
      if (chemin === '/__voix/synth' && req.method === 'POST') {
        const morceaux = []; let n = 0;
        for await (const c of req) { n += c.length; if (n > 20000) return json(res, 413, { erreur: 'texte trop long' }); morceaux.push(c); }
        await assurer();
        const r = await appeler('POST', '/synth', Buffer.concat(morceaux).toString('utf-8'), 60000);
        res.writeHead(r.statut, { 'Content-Type': r.type, 'Content-Length': r.corps.length, 'Cache-Control': 'no-store' });
        return res.end(r.corps);
      }
      if (chemin === '/__voix/arreter' && req.method === 'POST') { arreter(); return json(res, 200, { ok: true }); }
      return json(res, 404, { erreur: 'route inconnue' });
    } catch (e) { return json(res, 503, { erreur: String(e.message || e) }); }
  }

  function arreter() { try { if (enfant) enfant.kill(); } catch (e) { /* déjà arrêté */ } enfant = null; }
  process.on('exit', arreter);
  return { gerer, arreter, installe };
}
