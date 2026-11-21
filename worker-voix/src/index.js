/* Worker « rayle-voix » : POST /tts { text, id, ton, vitesse } → audio WAV (Gemini TTS). GET /sante. Jeton vérifié par le /ping du Worker principal. */
import { routeGeminiTTS } from '../../worker-gemini/gemini-tts.js';
const json = (o, statut = 200, h = {}) => new Response(JSON.stringify(o), { status: statut, headers: { 'Content-Type': 'application/json; charset=utf-8', ...h } });
const cors = (req, env) => { const o = req.headers.get('Origin') || '', ok = String(env.ORIGINES || '').split(',').map(s => s.trim()).includes(o); return { 'Access-Control-Allow-Origin': ok ? o : 'null', 'Access-Control-Allow-Headers': 'X-Rayle-Token, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Expose-Headers': 'X-Rayle-Voix, X-Rayle-Cache', 'Access-Control-Max-Age': '86400', Vary: 'Origin' }; };
const valides = new Map();   // jeton → expiration (5 min) : un seul /ping par jeton et par isolat
async function jetonValide(env, jeton) {
  if (!jeton) return false; const e = valides.get(jeton); if (e && e > Date.now()) return true;
  try { const r = await fetch(env.WORKER_RAYLE.replace(/\/+$/, '') + '/ping', { headers: { 'X-Rayle-Token': jeton }, signal: AbortSignal.timeout(8000) }); if (r.ok) { valides.set(jeton, Date.now() + 5 * 60e3); return true; } } catch (e) { /* injoignable : refusé */ }
  return false;
}
export default {
  async fetch(req, env, ctx) {
    const h = cors(req, env), u = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (u.pathname === '/sante') return json({ ok: true, service: 'rayle-voix', cle: !!env.GEMINI_KEY }, 200, h);
    if (u.pathname === '/tts' && req.method === 'POST') {
      if (!(await jetonValide(env, req.headers.get('X-Rayle-Token') || ''))) return json({ error: 'jeton refusé' }, 401, h);
      return routeGeminiTTS(req, env, ctx, h, { json });
    }
    return json({ error: 'route inconnue' }, 404, h);
  }
};
