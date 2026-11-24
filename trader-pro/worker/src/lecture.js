/* ═════════════ WORKER : FICHES DE LECTURE DE MARCHÉ (copilote, phase 1) ═════════════
   Les fiches sont CALCULÉES par GitHub Actions (outils-donnees/lecture.mjs : bougies, MA200, volume… sont trop lourds pour les 10 ms de CPU du plan gratuit du Worker) puis ENVOYÉES ici,
   où elles sont stockées dans D1 (une seule ligne « lecture:tout » : une écriture par envoi) et lues par tous les appareils (PC, tablette, téléphone). Le Worker ne calcule rien.
   Routes :
     PUT /lecture/fiches   { t, fiches: { <actif>: fiche } }   écriture : en-tête X-Lecture-Code = secret LECTURE_CODE (jamais dans le dépôt)
     GET /lecture/tout     → { t, fiches }                      lecture : code d'accès du portefeuille / jeton Rayle (comme les autres routes)
     GET /lecture/fiche/<actif>                                 une seule fiche
   Sans le secret LECTURE_CODE, l'écriture est refusée (503) : la lecture reste possible avec les copies publiées sur la branche « donnees » (lecture-<actif>.json). */
import { egalTempsConstant } from './coeur.js';

export const CLE_LECTURE = 'lecture:tout', LIMITE_CORPS = 1.5e6, MAX_FICHES = 12;
const rep = (obj, code, h) => new Response(JSON.stringify(obj), { status: code || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(h || {}) } });
const ACTIF = /^[a-z0-9]{2,12}$/;

export function nettoyerFiches(b) {
  const out = {}; if (!b || typeof b !== 'object' || !b.fiches || typeof b.fiches !== 'object') return out;
  for (const [id, f] of Object.entries(b.fiches).slice(0, MAX_FICHES)) { if (!ACTIF.test(id) || !f || typeof f !== 'object' || f.actif !== id || !Number.isFinite(f.t) || !Number.isFinite(f.version)) continue; out[id] = f; }
  return out;
}
export async function traiterLecture(req, env, depot, { cors = {}, autoriser = null, fetchFn = fetch } = {}) {
  const url = new URL(req.url), p = url.pathname; if (!p.startsWith('/lecture/')) return null;
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    if (p === '/lecture/fiches' && req.method === 'PUT') {
      if (!env.LECTURE_CODE) return rep({ error: 'secret LECTURE_CODE absent sur le Worker : voir LISEZMOI.md' }, 503, cors);
      if (!egalTempsConstant(req.headers.get('X-Lecture-Code') || '', env.LECTURE_CODE) || (req.headers.get('X-Lecture-Code') || '').length < 12) return rep({ error: 'code refusé' }, 401, cors);
      const texte = await req.text(); if (texte.length > LIMITE_CORPS) return rep({ error: 'corps trop gros' }, 413, cors);
      let b; try { b = JSON.parse(texte); } catch (e) { return rep({ error: 'JSON illisible' }, 400, cors); }
      const F = nettoyerFiches(b); if (!Object.keys(F).length) return rep({ error: 'aucune fiche valide' }, 400, cors);
      const ancien = (await depot.kvLire(CLE_LECTURE)) || { t: 0, fiches: {} }, fiches = { ...ancien.fiches };
      for (const [id, f] of Object.entries(F)) if (!fiches[id] || f.t >= fiches[id].t) fiches[id] = f;   // une fiche plus ancienne n'écrase jamais une plus récente
      const t = Math.max(...Object.values(fiches).map(f => f.t)); await depot.kvEcrire(CLE_LECTURE, { t, fiches });
      return rep({ ok: true, actifs: Object.keys(fiches), t }, 200, cors);
    }
    if (req.method === 'GET' && (p === '/lecture/tout' || p.startsWith('/lecture/fiche/'))) {
      if (autoriser) { const a = await autoriser(req, env, fetchFn); if (!a.ok) return rep({ error: a.raison }, a.code, cors); }
      const d = (await depot.kvLire(CLE_LECTURE)) || { t: 0, fiches: {} };
      if (p === '/lecture/tout') return rep(d, 200, cors);
      const id = decodeURIComponent(p.slice('/lecture/fiche/'.length)); if (!ACTIF.test(id)) return rep({ error: 'actif invalide' }, 400, cors);
      return d.fiches[id] ? rep(d.fiches[id], 200, cors) : rep({ error: 'aucune fiche pour cet actif' }, 404, cors);
    }
    return rep({ error: 'route inconnue' }, 404, cors);
  } catch (e) { return rep({ error: String(e && e.message || e).slice(0, 200) }, 500, cors); }
}
