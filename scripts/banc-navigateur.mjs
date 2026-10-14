// Banc d'essai navigateur : sert le dossier du projet en local, lance Chrome (sans fenêtre) et le pilote par le protocole DevTools.
//   import { lancer } from './banc-navigateur.mjs';  const b = await lancer({ largeur: 1280, hauteur: 800 });
//   await b.ouvrir('/index.html'); await b.eval('document.title'); await b.capture('essai.png'); await b.fermer();
// Rendu logiciel (SwiftShader) : les images/s mesurées ici n'ont AUCUNE valeur pour une tablette ; ce banc sert à voir si ça s'affiche et si rien ne casse.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const RACINE = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json', '.md': 'text/plain; charset=utf-8' };
const CHROMES = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'];

function serveur() {
  return new Promise(ok => {
    const s = http.createServer((req, rep) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = path.join(RACINE, p);
      if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rep.writeHead(404); return rep.end('absent'); }
      rep.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(rep);
    }).listen(0, '127.0.0.1', () => ok(s));
  });
}

export async function lancer({ largeur = 1280, hauteur = 800, tactile = false, args = [] } = {}) {
  const srv = await serveur(), port = srv.address().port;
  const exe = CHROMES.find(x => fs.existsSync(x)); if (!exe) throw new Error('Chrome ou Edge introuvable');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-chrome-'));
  const chrome = spawn(exe, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + prof, '--no-first-run', '--no-default-browser-check', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--window-size=' + largeur + ',' + hauteur, ...args, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((ok, ko) => {
    let buf = ''; const t = setTimeout(() => ko(new Error('Chrome ne répond pas')), 20000);
    chrome.stderr.on('data', d => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) { clearTimeout(t); ok(m[1]); } });
    chrome.on('exit', c => ko(new Error('Chrome arrêté (' + c + ')')));
  });
  const portCdp = new URL(wsUrl).port;
  const cibles = await (await fetch(`http://127.0.0.1:${portCdp}/json`)).json();
  const page = cibles.find(c => c.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
  let id = 0; const attente = new Map(), journal = [], ecouteurs = [];
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && attente.has(d.id)) { const { ok, ko } = attente.get(d.id); attente.delete(d.id); d.error ? ko(new Error(d.error.message)) : ok(d.result); }
    else if (d.method) {
      if (d.method === 'Runtime.consoleAPICalled') journal.push({ type: d.params.type, texte: d.params.args.map(a => a.value !== undefined ? a.value : a.description || '').join(' ') });
      if (d.method === 'Runtime.exceptionThrown') journal.push({ type: 'exception', texte: (d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description) || d.params.exceptionDetails.text });
      if (d.method === 'Log.entryAdded') journal.push({ type: d.params.entry.level, texte: d.params.entry.text + ' ' + (d.params.entry.url || '') });
      ecouteurs.forEach(f => f(d));
    }
  };
  const cdp = (method, params = {}) => new Promise((ok, ko) => { const i = ++id; attente.set(i, { ok, ko }); ws.send(JSON.stringify({ id: i, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Log.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: largeur, height: hauteur, deviceScaleFactor: 1, mobile: tactile });
  if (tactile) await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const api = {
    port, journal, cdp,
    url: p => `http://127.0.0.1:${port}${p}`,
    async ouvrir(p, { attente = 1500 } = {}) {
      await cdp('Page.navigate', { url: api.url(p) });
      await new Promise(ok => { const f = d => { if (d.method === 'Page.loadEventFired') { ecouteurs.splice(ecouteurs.indexOf(f), 1); ok(); } }; ecouteurs.push(f); setTimeout(ok, 25000); });
      await api.pause(attente);
    },
    async eval(expr, { attendre = true } = {}) {
      const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: attendre, returnByValue: true, userGesture: true });
      if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
      return r.result.value;
    },
    async capture(fichier, { clip } = {}) {
      const r = await cdp('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
      fs.writeFileSync(fichier, Buffer.from(r.data, 'base64')); return fichier;
    },
    souris: (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra }),
    async glisser(x0, y0, x1, y1, pas = 12) {
      await api.souris('mousePressed', x0, y0);
      for (let i = 1; i <= pas; i++) await api.souris('mouseMoved', x0 + (x1 - x0) * i / pas, y0 + (y1 - y0) * i / pas);
      await api.souris('mouseReleased', x1, y1);
    },
    async molette(x, y, dy) { await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy }); },
    async cliquer(x, y) { await api.souris('mouseMoved', x, y); await api.souris('mousePressed', x, y); await api.souris('mouseReleased', x, y); },
    async toucher(points) { await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points.map(p => ({ x: p[0], y: p[1], id: p[2] || 0 })) }); },
    pause: ms => new Promise(ok => setTimeout(ok, ms)),
    erreurs: () => journal.filter(j => j.type === 'exception' || j.type === 'error'),
    async fermer() { try { ws.close(); } catch (e) {} chrome.kill(); srv.close(); try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {} },
  };
  return api;
}
