/* ═════════════ WORKER : CARNET DE COPILOTE (route /copilote/carnet) ═════════════
   Le carnet (idées, lectures avant / pendant / après, copie des bougies, positions XTB rattachées) est PRIVÉ : il vit dans TON D1, jamais dans le dépôt public. Le Worker le garde en TEXTE BRUT (10 ms de CPU
   seulement : il ne l'analyse pas) ; les appareils fusionnent entrée par entrée (dernière modification gagnante) et GitHub Actions le lit (code d'écriture) pour surveiller les positions ouvertes.
   Routes : GET /copilote/carnet → { entrees } ; PUT /copilote/carnet { entrees } (corps ≤ 700 Ko). Accès : code du portefeuille / jeton Rayle, ou X-Lecture-Code (GitHub Actions, lecture seule). */
import { egalTempsConstant } from './coeur.js';
export const CLE_CARNET = 'copilote:carnet', LIMITE = 7e5;
const rep = (obj, code, h) => new Response(JSON.stringify(obj), { status: code || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(h || {}) } });
export async function traiterCopilote(req, env, depot, { cors = {}, autoriser = null, fetchFn = fetch } = {}) {
  const p = new URL(req.url).pathname; if (p !== '/copilote/carnet') return null;
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    const code = req.headers.get('X-Lecture-Code') || '', lectureSeule = !!env.LECTURE_CODE && code.length >= 12 && egalTempsConstant(code, env.LECTURE_CODE);
    if (!(req.method === 'GET' && lectureSeule)) { if (autoriser) { const a = await autoriser(req, env, fetchFn); if (!a.ok) return rep({ error: a.raison }, a.code, cors); } }
    if (req.method === 'GET') { const brut = await depot.kvLire(CLE_CARNET); return new Response('{"entrees":' + (typeof brut === 'string' ? brut : '[]') + '}', { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors } }); }
    if (req.method === 'PUT') { const t = await req.text(); if (t.length > LIMITE) return rep({ error: 'carnet trop gros' }, 413, cors); if (!t.startsWith('{"entrees":[') || !t.endsWith(']}')) return rep({ error: 'format attendu : {"entrees":[…]}' }, 400, cors);   /* texte brut, jamais analysé ici (10 ms de CPU) */
      await depot.kvEcrire(CLE_CARNET, t.slice(11, -1)); return rep({ ok: true, octets: t.length }, 200, cors); }
    return rep({ error: 'méthode non permise' }, 405, cors);
  } catch (e) { return rep({ error: String(e && e.message || e).slice(0, 200) }, 500, cors); }
}
