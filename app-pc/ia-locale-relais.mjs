// Relais de l'IA locale (phase 9) : permet à la tablette / au téléphone d'interroger LM Studio qui tourne sur le PC.
// Sécurité : jeton obligatoire (en-tête X-Rayle-Ia ou ?jeton=), SEULES deux routes passent (GET /ia-locale/v1/models, POST /ia-locale/v1/chat/completions),
// corps limité à 200 Ko, pas de flux (stream forcé à false), max_tokens plafonné, délai de 120 s, cible fixe (LM Studio sur ce PC). Rien d'autre n'est relayé.
import http from 'node:http';
import crypto from 'node:crypto';

const LIMITE_CORPS = 200 * 1024, DELAI = 120000, ROUTES = new Map([['GET /ia-locale/v1/models', '/v1/models'], ['POST /ia-locale/v1/chat/completions', '/v1/chat/completions']]);
const memeJeton = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); };

export function creerRelaisIaLocale({ jeton, hote = '127.0.0.1', port = 1234, origines = null } = {}) {
  /* gerer(req, res, url) : renvoie true si la requête était pour le relais (qu'elle ait réussi ou été refusée). */
  function gerer(req, res, url) {
    const chemin = url.pathname; if (!chemin.startsWith('/ia-locale/')) return false;
    const reponse = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(origines ? { 'Access-Control-Allow-Origin': origines, 'Access-Control-Allow-Headers': 'Content-Type, X-Rayle-Ia', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } : {}) }); res.end(JSON.stringify(obj)); };
    if (req.method === 'OPTIONS') { reponse(204, {}); return true; }
    const cible = ROUTES.get(req.method + ' ' + chemin);
    if (!cible) { reponse(404, { erreur: 'route non relayée' }); return true; }
    if (!memeJeton(req.headers['x-rayle-ia'] || url.searchParams.get('jeton'), jeton)) { reponse(403, { erreur: 'jeton requis' }); return true; }
    const transmettre = corps => {
      const options = { host: hote, port, path: cible, method: req.method, headers: corps ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(corps) } : {}, timeout: DELAI };
      const amont = http.request(options, r => { res.writeHead(r.statusCode || 502, { 'Content-Type': r.headers['content-type'] || 'application/json', 'Cache-Control': 'no-store', ...(origines ? { 'Access-Control-Allow-Origin': origines } : {}) }); r.pipe(res); });
      amont.on('timeout', () => amont.destroy(new Error('LM Studio trop lent')));
      amont.on('error', e => { if (!res.headersSent) reponse(502, { erreur: 'LM Studio injoignable : ' + e.message }); else res.end(); });
      if (corps) amont.write(corps); amont.end();
    };
    if (req.method === 'GET') { transmettre(null); return true; }
    let taille = 0; const morceaux = [];
    req.on('data', d => { taille += d.length; if (taille > LIMITE_CORPS) { req.destroy(); if (!res.headersSent) reponse(413, { erreur: 'requête trop grosse' }); } else morceaux.push(d); });
    req.on('end', () => {
      if (res.headersSent) return;
      let j; try { j = JSON.parse(Buffer.concat(morceaux).toString('utf8')); } catch (e) { reponse(400, { erreur: 'JSON invalide' }); return; }
      if (!j || !Array.isArray(j.messages)) { reponse(400, { erreur: 'messages requis' }); return; }
      transmettre(JSON.stringify({ model: j.model, messages: j.messages, temperature: Math.min(2, Math.max(0, +j.temperature || 0.7)), max_tokens: Math.min(1024, Math.max(16, +j.max_tokens || 400)), stream: false }));
    });
    return true;
  }
  return { gerer };
}
