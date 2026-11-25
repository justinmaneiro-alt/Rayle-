/* ═════════════ WORKER : RÉSEAU D'INFORMATION (copilote, phase 3) ═════════════
   Voie RAPIDE : toutes les 2 minutes (second déclencheur planifié, voir wrangler.toml) le Worker lit FinancialJuice, investingLive et Trump (3 appels réseau), dédoublonne, note (règles), range dans D1 et
   envoie par Telegram les alertes (score ≥ seuil). Voie COMPLÈTE : GitHub Actions (toutes les sources, réaction réelle du marché sur bougies M5, précédents) envoie son état par PUT /reseau/etat (stocké en texte brut) et ses alertes par POST /reseau/alertes.
   Plan gratuit : 10 ms de CPU par exécution → on ne relit pas tout (seules les cartes neuves sont analysées), au plus 25 articles par flux, un seul écrit D1 par passage.
   Routes : GET /reseau/etat · PUT /reseau/etat (code d'écriture, secret LECTURE_CODE) · GET et PUT /reseau/personnes · GET et PUT /reseau/reglages. Lecture : code d'accès habituel ou code d'écriture. */
import { parserFlux } from '../../reseau/parse.js';
import { SOURCES, PERSONNES, UA, TOUS } from '../../reseau/config.js';
import { integrer, etatVide, majSources, alertesDe, SEUIL_ALERTE } from '../../reseau/etat.js';
import { egalTempsConstant } from './coeur.js';

export const CLES = Object.freeze({ etat: 'reseau:etat', rapide: 'reseau:rapide', personnes: 'reseau:personnes', reglages: 'reseau:reglages', envoyees: 'reseau:envoyees', reanalyser: 'reseau:reanalyser', alertes: 'reseau:alertes' });
export const CRON_RESEAU = '*/2 * * * *';
const rep = (obj, code, h) => new Response(JSON.stringify(obj), { status: code || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(h || {}) } });

export async function lireSource(s, fetchFn = fetch, { max = 25, ms = 6000 } = {}) {
  try {
    const r = await fetchFn(s.url, { headers: { 'User-Agent': s.ua || UA, Accept: 'application/rss+xml, application/atom+xml, text/xml, */*' }, signal: AbortSignal.timeout(ms), redirect: 'follow' });
    if (!r.ok) return { id: s.id, ok: false, erreur: 'HTTP ' + r.status, articles: [] };
    const A = parserFlux(await r.text(), { max }).map(a => ({ ...a, source: s.id }));
    return A.length ? { id: s.id, ok: true, articles: A } : { id: s.id, ok: false, erreur: 'flux vide ou illisible', articles: [] };
  } catch (e) { return { id: s.id, ok: false, erreur: String(e && e.message || e).slice(0, 100), articles: [] }; }
}
export async function envoyerTelegram(env, texte, fetchFn = fetch) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;
  try { const r = await fetchFn(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: texte }), signal: AbortSignal.timeout(8000) }); return r.ok; } catch (e) { return false; }
}
export async function lirePersonnes(depot) { const P = await depot.kvLire(CLES.personnes); return Array.isArray(P) && P.length ? P : PERSONNES; }
export const lireReglages = async depot => ({ seuilAlerte: SEUIL_ALERTE, ...((await depot.kvLire(CLES.reglages)) || {}) });

/* tâche du déclencheur de 2 minutes : état RAPIDE (petit : cartes des 6 dernières heures issues des 3 sources rapides) ; l'état COMPLET (72 h, toutes sources, réactions du marché) est celui de GitHub Actions,
   stocké tel quel (texte brut, jamais relu ni fusionné ici : 10 ms de CPU seulement). Les appareils et GitHub Actions fusionnent les deux. */
export async function tacheReseauRapide(env, depot, t = Date.now(), { fetchFn = fetch } = {}) {
  let E = (await depot.kvLire(CLES.rapide)) || etatVide(); const personnes = await lirePersonnes(depot), reg = await lireReglages(depot), reanalyser = !!(await depot.kvLire(CLES.reanalyser));
  const R = await Promise.all(SOURCES.filter(s => s.voie === 'rapide').map(s => lireSource(s, fetchFn)));
  E.sources = majSources(E, R, t); E = integrer(E, R.flatMap(r => r.articles), t, { personnes, reanalyser });
  E.cartes = E.cartes.filter(c => c.t >= t - 6 * 3600e3);
  const A = alertesDe(E, t, { seuil: reg.seuilAlerte, personnes }), env_ = (await depot.kvLire(CLES.envoyees)) || []; await depot.kvEcrire(CLES.rapide, A.etat);
  const envoyees = await envoyerAlertes(env, depot, A.nouvelles.map(a => ({ carteId: a.carteId, texte: a.texte, revirement: a.revirement })), env_, fetchFn);
  return { lues: R.reduce((n, r) => n + r.articles.length, 0), enLigne: R.filter(r => r.ok).length, alertes: A.nouvelles.length, envoyees };
}
/* envoie par Telegram les alertes dont la carte n'a jamais été annoncée (registre commun à la voie rapide et à GitHub Actions) */
export async function envoyerAlertes(env, depot, alertes, deja, fetchFn = fetch) {
  const registre = Array.isArray(deja) ? deja.slice() : []; let n = 0;
  for (const a of alertes.slice(0, 8)) {
    if (!a || typeof a.carteId !== 'string' || registre.includes(a.carteId)) continue; const texte = String(a.texte || '').slice(0, 400); if (!texte) continue;
    if (await envoyerTelegram(env, (a.revirement ? '🔁 ' : '🔔 ') + texte + '\n(Lecture seule : aucun ordre.)', fetchFn)) { registre.push(a.carteId); n++; }
  }
  if (n) await depot.kvEcrire(CLES.envoyees, registre.slice(-150)); return n;
}

/* ───── validation ───── */
export function nettoyerPersonnes(L) {
  if (!Array.isArray(L)) return null; const out = [], vus = new Set();
  for (const p of L.slice(0, 40)) {
    if (!p || typeof p !== 'object' || !/^[a-z0-9-]{2,20}$/.test(p.id || '') || vus.has(p.id) || typeof p.nom !== 'string' || !p.nom.trim()) continue; vus.add(p.id);
    const poids = Math.round(+p.poids); if (!(poids >= 1 && poids <= 5)) continue;
    const actifs = p.actifs === 'tous' ? 'tous' : Array.isArray(p.actifs) ? p.actifs.filter(a => TOUS.includes(a)) : []; if (actifs !== 'tous' && !actifs.length) continue;
    const alias = (Array.isArray(p.alias) ? p.alias : []).filter(a => typeof a === 'string' && a.trim()).map(a => a.toLowerCase().slice(0, 40)).slice(0, 12); if (!alias.length) alias.push(p.nom.toLowerCase().slice(0, 40));
    out.push({ id: p.id, court: typeof p.court === 'string' ? p.court.slice(0, 30) : p.nom.slice(0, 30), nom: p.nom.slice(0, 60), role: typeof p.role === 'string' ? p.role.slice(0, 80) : '', poids, actifs, alias, requete: typeof p.requete === 'string' ? p.requete.slice(0, 160) : p.nom.slice(0, 60) });
  }
  return out;
}

export async function traiterReseau(req, env, depot, { cors = {}, autoriser = null, fetchFn = fetch, maintenant = Date.now() } = {}) {
  const url = new URL(req.url), p = url.pathname; if (!p.startsWith('/reseau/')) return null;
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const codeEcriture = req.headers.get('X-Lecture-Code') || '', ecritureOk = !!env.LECTURE_CODE && codeEcriture.length >= 12 && egalTempsConstant(codeEcriture, env.LECTURE_CODE);
  const acces = async () => { if (ecritureOk) return null; if (!autoriser) return null; const a = await autoriser(req, env, fetchFn); return a.ok ? null : rep({ error: a.raison }, a.code, cors); };
  const corps = async () => { const t = await req.text(); if (t.length > 1.5e6) throw Object.assign(new Error('corps trop gros'), { code: 413 }); try { return JSON.parse(t); } catch (e) { throw Object.assign(new Error('JSON illisible'), { code: 400 }); } };
  try {
    if (p === '/reseau/etat' && req.method === 'GET') { const r = await acces(); if (r) return r; const brut = await depot.kvLire(CLES.etat), rap = await depot.kvLire(CLES.rapide);   // textes bruts : aucun parsing ici (10 ms de CPU)
      return new Response('{"etat":' + (typeof brut === 'string' ? brut : 'null') + ',"rapide":' + (rap ? JSON.stringify(rap) : 'null') + ',"reanalyser":' + (await depot.kvLire(CLES.reanalyser) ? 'true' : 'false') + '}', { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors } }); }
    if (p === '/reseau/etat' && req.method === 'PUT') {
      if (!env.LECTURE_CODE) return rep({ error: 'secret LECTURE_CODE absent sur le Worker : voir LISEZMOI.md' }, 503, cors); if (!ecritureOk) return rep({ error: 'code refusé' }, 401, cors);
      const t = await req.text(); if (t.length > 1.2e6) return rep({ error: 'corps trop gros' }, 413, cors); if (t[0] !== '{' || !t.includes('"cartes"')) return rep({ error: 'état illisible' }, 400, cors);
      await depot.kvEcrire(CLES.etat, t); if (url.searchParams.get('reanalyse') === '1') await depot.kvEcrire(CLES.reanalyser, 0); return rep({ ok: true, octets: t.length }, 200, cors);
    }
    if (p === '/reseau/alertes' && req.method === 'POST') {   // alertes calculées par GitHub Actions (score relevé par la réaction du marché) : le Worker les envoie par Telegram
      if (!ecritureOk) return rep({ error: 'code refusé' }, 401, cors); const b = await corps(), L = Array.isArray(b.alertes) ? b.alertes : [], n = await envoyerAlertes(env, depot, L, await depot.kvLire(CLES.envoyees), fetchFn);
      const anciennes = (await depot.kvLire(CLES.alertes)) || [], neuves = L.filter(a => a && typeof a.carteId === 'string' && a.texte && !anciennes.some(x => x.carteId === a.carteId)).slice(0, 10).map(a => ({ id: 'a' + a.carteId, carteId: a.carteId, t: maintenant, score: Math.round(+a.score) || 0, revirement: !!a.revirement, texte: String(a.texte).slice(0, 400), actifs: Array.isArray(a.actifs) ? a.actifs.slice(0, 7) : [] }));
      if (neuves.length) await depot.kvEcrire(CLES.alertes, [...neuves, ...anciennes].slice(0, 30)); return rep({ envoyees: n, enregistrees: neuves.length }, 200, cors);
    }
    if (p === '/reseau/alertes' && req.method === 'GET') {   // petite liste (30 au plus) pour la voix de l'appli : l'appareil l'interroge souvent, sans télécharger tout l'état
      const r = await acces(); if (r) return r; const rap = await depot.kvLire(CLES.rapide), L = [...((await depot.kvLire(CLES.alertes)) || []), ...((rap && rap.alertes) || [])].sort((a, b) => b.t - a.t).filter((a, i, T) => T.findIndex(x => x.carteId === a.carteId) === i).slice(0, 30);
      return rep({ alertes: L, t: maintenant }, 200, cors);
    }
    if (p === '/reseau/personnes') {
      const r = await acces(); if (r) return r;
      if (req.method === 'GET') return rep({ personnes: await lirePersonnes(depot), parDefaut: !(await depot.kvLire(CLES.personnes)) }, 200, cors);
      if (req.method === 'PUT') { if (ecritureOk) return rep({ error: 'réservé à l’appli' }, 403, cors); const b = await corps(), L = nettoyerPersonnes(b.personnes); if (!L || !L.length) return rep({ error: 'liste invalide' }, 400, cors);
        await depot.kvEcrire(CLES.personnes, L); await depot.kvEcrire(CLES.reanalyser, 1); return rep({ personnes: L }, 200, cors); }
    }
    if (p === '/reseau/reglages') {
      const r = await acces(); if (r) return r; if (req.method === 'GET') return rep(await lireReglages(depot), 200, cors);
      if (req.method === 'PUT') { const b = await corps(), s = Math.round(+b.seuilAlerte); if (!(s >= 50 && s <= 100)) return rep({ error: 'seuil entre 50 et 100' }, 400, cors); await depot.kvEcrire(CLES.reglages, { seuilAlerte: s }); return rep({ seuilAlerte: s }, 200, cors); }
    }
    return rep({ error: 'route inconnue' }, 404, cors);
  } catch (e) { return rep({ error: String(e && e.message || e).slice(0, 200) }, Number.isInteger(e && e.code) ? e.code : 500, cors); }
}
