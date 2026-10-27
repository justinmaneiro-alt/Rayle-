// Faux Worker local (port 8787) : répond comme le vrai pour /ping, /securite/etat, /evenements… afin de tester la page « Worker configuré ».
import http from 'http';
import { fileURLToPath } from 'node:url';
const RACINE = fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/');
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const srv = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const u = req.url.split('?')[0];
  const rep = {
    '/ping': { ok: true, version: 'mock', adresse: 'tu', voix: 'Test', feminin: true, vitesse: -8, ia: ['Mock'], d1: true, mode: 'normal' },
    '/securite/etat': { appareil: null, appaire: false, configure: false, deverrouille: false, expire_dans: 0, bloque_dans: 0, defi_dans: 0 },
    '/evenements': { alertes: [] }, '/reglages': { mode: 'normal' }, '/memoire': { notes: [] }, '/souvenirs': { items: [] }
  }[u];
  if (u === '/chat') { res.writeHead(200, cors); return res.end(JSON.stringify({ reply: 'Réponse de test de l’IA.', engine: 'mock', actions: [] })); }
  res.writeHead(rep ? 200 : 404, cors); res.end(JSON.stringify(rep || { error: 'mock : route inconnue' }));
});
srv.listen(8787, '127.0.0.1', () => console.log('faux Worker sur 8787'));
