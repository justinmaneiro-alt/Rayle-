/* Worker « rayle-voix » : POST /tts { text, id, ton, vitesse } → audio WAV (Gemini TTS). GET /sante. Jeton vérifié par le /ping du Worker principal (comme rayle-agent-trading). */
import { routeGeminiTTS } from '../../worker-gemini/gemini-tts.js';
import { routeCerveau, modelesDisponibles, MODELES_TEXTE } from '../../worker-gemini/gemini-cerveau.js';
let modelesCache = { t: 0, v: null };
const json = (o, statut = 200, h = {}) => new Response(JSON.stringify(o), { status: statut, headers: { 'Content-Type': 'application/json; charset=utf-8', ...h } });
const cors = (req, env) => { const o = req.headers.get('Origin') || '', ok = String(env.ORIGINES || '').split(',').map(s => s.trim()).includes(o); return { 'Access-Control-Allow-Origin': ok ? o : 'null', 'Access-Control-Allow-Headers': 'X-Rayle-Token, X-Rayle-Worker, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Expose-Headers': 'X-Rayle-Voix, X-Rayle-Cache', 'Access-Control-Max-Age': '86400', Vary: 'Origin' }; };
const valides = new Map();   // jeton → expiration (5 min) : un seul contrôle par jeton et par isolat
/* Adresse du Worker principal : celle que la page utilise (en-tête X-Rayle-Worker) si elle est en https sur *.workers.dev du même compte, sinon WORKER_RAYLE. */
function adressePrincipale(req, env) {
  const defaut = String(env.WORKER_RAYLE || '').replace(/\/+$/, ''), voulue = (req.headers.get('X-Rayle-Worker') || '').trim().replace(/\/+$/, '');
  try { const d = new URL(defaut), v = new URL(voulue); if (v.protocol === 'https:' && v.hostname.endsWith('.' + d.hostname.split('.').slice(1).join('.'))) return v.origin; } catch (e) { /* adresse absente ou invalide */ }
  return defaut;
}
/* → { ok, raison } ; la raison ne contient JAMAIS le code d'accès */
async function verifierJeton(req, env) {
  const jeton = (req.headers.get('X-Rayle-Token') || '').trim();
  if (!jeton) return { ok: false, raison: 'code d’accès absent (en-tête X-Rayle-Token vide) : la page n’a pas envoyé de code' };
  const e = valides.get(jeton); if (e && e > Date.now()) return { ok: true };
  const base = adressePrincipale(req, env), hote = new URL(base).host, origine = req.headers.get('Origin') || '', essais = [];
  const variantes = [['X-Rayle-Token', { 'X-Rayle-Token': jeton }], ['X-Rayle-Token + Origin', { 'X-Rayle-Token': jeton, ...(origine ? { Origin: origine } : {}) }], ['Authorization Bearer', { Authorization: 'Bearer ' + jeton }]];
  for (const [nom, h] of variantes) {
    try { const demande = new Request(base + '/ping', { headers: h }), r = env.PRINCIPAL ? await env.PRINCIPAL.fetch(demande) : await fetch(demande, { signal: AbortSignal.timeout(8000) }); if (r.ok) { valides.set(jeton, Date.now() + 5 * 60e3); return { ok: true }; } essais.push(nom + ' : HTTP ' + r.status); }
    catch (err) { return { ok: false, raison: 'Worker principal injoignable (' + hote + ' /ping : ' + ((err && err.message) || err) + ')' }; }
  }
  return { ok: false, raison: 'refusé par le /ping du Worker principal (' + hote + ') — ' + essais.join(' ; ') };
}
export default {
  async fetch(req, env, ctx) {
    const h = cors(req, env), u = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (u.pathname === '/sante') {
      /* la Cache API est-elle réellement active sur cette adresse ? (elle est sans effet sur *.workers.dev) */
      let cacheServeur = false; try { const c = caches.default, k = new Request('https://rayle.local/sonde-cache'); const avant = await c.match(k); cacheServeur = !!avant;   /* vrai seulement si une requête PRÉCÉDENTE a gardé la sonde */ await c.put(k, new Response('ok', { headers: { 'Cache-Control': 'max-age=300' } })); } catch (e) { /* */ }
      let modeles = null; if (env.GEMINI_KEY) { if (Date.now() - modelesCache.t > 3600e3) { try { modelesCache = { t: Date.now(), v: await modelesDisponibles(env.GEMINI_KEY) }; } catch (e) { modelesCache = { t: Date.now() - 3000e3, v: 'erreur : ' + e.message }; } } modeles = modelesCache.v; }
      return json({ ok: true, service: 'rayle-voix', cle: !!env.GEMINI_KEY, cacheServeur, cerveau: { ordre: MODELES_TEXTE, disponibles: modeles } }, 200, h);
    }
    if (u.pathname === '/tts' && req.method === 'POST') {
      const v = await verifierJeton(req, env);
      if (!v.ok) return json({ error: 'jeton refusé : ' + v.raison }, 401, h);
      return routeGeminiTTS(req, env, ctx, h, { json });
    }
    if (u.pathname === '/cerveau' && req.method === 'POST') {
      const v = await verifierJeton(req, env);
      if (!v.ok) return json({ error: 'jeton refusé : ' + v.raison }, 401, h);
      return routeCerveau(req, env, ctx, h, { json });
    }
    return json({ error: 'route inconnue' }, 404, h);
  }
};
