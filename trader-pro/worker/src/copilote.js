/* ═════════════ WORKER : CARNET DE COPILOTE (route /copilote/carnet) ═════════════
   Le carnet (idées, lectures avant / pendant / après, copie des bougies, positions XTB rattachées) est PRIVÉ : il vit dans TON D1, jamais dans le dépôt public. Le Worker le garde en TEXTE BRUT (10 ms de CPU
   seulement : il ne l'analyse pas) ; les appareils fusionnent entrée par entrée (dernière modification gagnante) et GitHub Actions le lit (code d'écriture) pour surveiller les positions ouvertes.
   Routes : GET /copilote/carnet → { entrees } ; PUT /copilote/carnet { entrees } (corps ≤ 700 Ko). Accès : code du portefeuille / jeton Rayle, ou X-Lecture-Code (GitHub Actions, lecture seule). */
import { egalTempsConstant } from './coeur.js';
export const CLE_CARNET = 'copilote:carnet', CLE_MATIN = 'copilote:matin', CLE_PREVISIONS = 'copilote:previsions', LIMITE = 7e5;
const rep = (obj, code, h) => new Response(JSON.stringify(obj), { status: code || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(h || {}) } });
export async function traiterCopilote(req, env, depot, { cors = {}, autoriser = null, fetchFn = fetch } = {}) {
  const p = new URL(req.url).pathname; if (p === '/copilote/matin') return traiterMatin(req, env, depot, { cors, fetchFn });
  if (p === '/copilote/previsions') return traiterPrevisions(req, env, depot, { cors, autoriser, fetchFn });
  if (p !== '/copilote/carnet') return null;
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

/* ═════ POINT DU MATIN SUR TELEGRAM : route /copilote/matin (écriture réservée à GitHub Actions : code d'écriture) ═════
   GET  → { dernierEnvoi: 'AAAA-MM-JJ' | null }  (pour ne l'envoyer qu'une fois par jour)
   POST (multipart : texte, jour, voix = fichier OGG/Opus facultatif) → envoie le MESSAGE VOCAL (sendVoice) puis la version TEXTE ; si la voix échoue, le texte part quand même.
   Les secrets Telegram restent dans le Worker : GitHub Actions n'en a aucun. Pendant « alertes silencieuses » : envoi sans notification. */
export async function traiterMatin(req, env, depot, { cors = {}, fetchFn = fetch } = {}) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const code = req.headers.get('X-Lecture-Code') || '', ok = !!env.LECTURE_CODE && code.length >= 12 && egalTempsConstant(code, env.LECTURE_CODE); if (!ok) return rep({ error: env.LECTURE_CODE ? 'code refusé' : 'secret LECTURE_CODE absent sur le Worker' }, env.LECTURE_CODE ? 401 : 503, cors);
  try {
    if (req.method === 'GET') return rep({ dernierEnvoi: (await depot.kvLire(CLE_MATIN)) || null }, 200, cors);
    if (req.method !== 'POST') return rep({ error: 'méthode non permise' }, 405, cors);
    const f = await req.formData(), texte = String(f.get('texte') || '').slice(0, 3800), jour = String(f.get('jour') || ''), voix = f.get('voix'); if (!texte || !/^\d{4}-\d{2}-\d{2}$/.test(jour)) return rep({ error: 'texte et jour (AAAA-MM-JJ) requis' }, 400, cors);
    if ((await depot.kvLire(CLE_MATIN)) === jour && f.get('forcer') !== '1') return rep({ deja: true, jour }, 200, cors);
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return rep({ error: 'Telegram non configuré sur le Worker' }, 503, cors);
    const reg = (await depot.kvLire('reseau:reglages')) || {}, silencieux = (reg.silenceJusqua || 0) > Date.now(), base = 'https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/', res = { vocal: false, texte: false };
    if (voix && typeof voix === 'object' && voix.size > 500 && voix.size < 3e6) {
      try { const fd = new FormData(); fd.append('chat_id', env.TELEGRAM_CHAT_ID); fd.append('voice', new Blob([await voix.arrayBuffer()], { type: 'audio/ogg' }), 'point-du-matin.ogg'); if (silencieux) fd.append('disable_notification', 'true'); const r = await fetchFn(base + 'sendVoice', { method: 'POST', body: fd, signal: AbortSignal.timeout(25000) }); res.vocal = r.ok; } catch (e) { res.vocal = false; }
    }
    try { const r = await fetchFn(base + 'sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: texte, ...(silencieux ? { disable_notification: true } : {}) }), signal: AbortSignal.timeout(15000) }); res.texte = r.ok; } catch (e) { res.texte = false; }
    if (res.vocal || res.texte) await depot.kvEcrire(CLE_MATIN, jour); return rep({ ok: res.vocal || res.texte, ...res, jour }, res.vocal || res.texte ? 200 : 502, cors);
  } catch (e) { return rep({ error: String(e && e.message || e).slice(0, 200) }, 500, cors); }
}

/* ═════ CARNET DE PRÉVISIONS : route /copilote/previsions ═════
   GET → { previsions: [...] } (code d'accès de l'appli, ou code de lecture de GitHub Actions) ; PUT { previsions: [...] } (code d'écriture : seul GitHub Actions écrit, il enregistre et vérifie).
   Données publiques de marché (scénarios et verdicts), texte brut dans D1 (jamais analysé ici : 10 ms de CPU). */
export async function traiterPrevisions(req, env, depot, { cors = {}, autoriser = null, fetchFn = fetch } = {}) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    const code = req.headers.get('X-Lecture-Code') || '', ecriture = !!env.LECTURE_CODE && code.length >= 12 && egalTempsConstant(code, env.LECTURE_CODE);
    if (req.method === 'PUT') { if (!ecriture) return rep({ error: env.LECTURE_CODE ? 'code refusé' : 'secret LECTURE_CODE absent sur le Worker' }, env.LECTURE_CODE ? 401 : 503, cors); const t = await req.text(); if (t.length > 4e5) return rep({ error: 'trop gros' }, 413, cors); if (!t.startsWith('{"previsions":[') || !t.endsWith(']}')) return rep({ error: 'format attendu : {"previsions":[…]}' }, 400, cors); await depot.kvEcrire(CLE_PREVISIONS, t.slice(14, -1)); return rep({ ok: true, octets: t.length }, 200, cors); }
    if (req.method !== 'GET') return rep({ error: 'méthode non permise' }, 405, cors);
    if (!ecriture && autoriser) { const a = await autoriser(req, env, fetchFn); if (!a.ok) return rep({ error: a.raison }, a.code, cors); }
    const brut = await depot.kvLire(CLE_PREVISIONS); return new Response('{"previsions":' + (typeof brut === 'string' ? brut : '[]') + '}', { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors } });
  } catch (e) { return rep({ error: String(e && e.message || e).slice(0, 200) }, 500, cors); }
}
