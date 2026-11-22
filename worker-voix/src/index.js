/* Worker « rayle-voix » : POST /tts { text, id, ton, vitesse } → audio WAV (Gemini TTS). GET /sante. Jeton vérifié par le /ping du Worker principal (comme rayle-agent-trading). */
import { routeAzure, routeAzureQuota } from './azure-tts.js';
import { routeGeminiTTS } from '../../worker-gemini/gemini-tts.js';
import { routeCerveau, modelesDisponibles, MODELES_TEXTE, appelerCerveau } from '../../worker-gemini/gemini-cerveau.js';
import { DECLARATIONS as OUTILS_LECTURE } from '../../trader-pro/cerveau/outils.js';
import { DECLARATIONS as OUTILS_ACTION } from '../../trader-pro/cerveau/actions.js';
let modelesCache = { t: 0, v: null };
const json = (o, statut = 200, h = {}) => new Response(JSON.stringify(o), { status: statut, headers: { 'Content-Type': 'application/json; charset=utf-8', ...h } });
const cors = (req, env) => { const o = req.headers.get('Origin') || '', ok = String(env.ORIGINES || '').split(',').map(s => s.trim()).includes(o); return { 'Access-Control-Allow-Origin': ok ? o : 'null', 'Access-Control-Allow-Headers': 'X-Rayle-Token, X-Rayle-Worker, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Expose-Headers': 'X-Rayle-Voix, X-Rayle-Cache, X-Rayle-Chars, X-Rayle-Chars-Limite', 'Access-Control-Max-Age': '86400', Vary: 'Origin' }; };
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
      return json({ ok: true, service: 'rayle-voix', cle: !!env.GEMINI_KEY, azure: { cle: !!env.AZURE_SPEECH_KEY, region: !!env.AZURE_SPEECH_REGION, compteur: !!env.QUOTA }, cacheServeur, cerveau: { ordre: MODELES_TEXTE, disponibles: modeles } }, 200, h);
    }
    /* v9 : voix Azure Speech (niveau gratuit F0), clé et région en secrets ; compteur du mois dans KV */
    if (u.pathname === '/azure' && req.method === 'POST') {
      const v = await verifierJeton(req, env);
      if (!v.ok) return json({ error: 'jeton refusé : ' + v.raison }, 401, h);
      return routeAzure(req, env, ctx, h, { json });
    }
    if (u.pathname === '/azure/quota') {
      const v = await verifierJeton(req, env);
      if (!v.ok) return json({ error: 'jeton refusé : ' + v.raison }, 401, h);
      return routeAzureQuota(env, h, { json });
    }
    if (u.pathname === '/tts' && req.method === 'POST') {
      const v = await verifierJeton(req, env);
      if (!v.ok) return json({ error: 'jeton refusé : ' + v.raison }, 401, h);
      return routeGeminiTTS(req, env, ctx, h, { json });
    }
    /* Essai de bout en bout avec la VRAIE clé et les VRAIES déclarations d'outils (appel de fonction, puis réponse). Inactif sauf si la variable ESSAI_CERVEAU vaut « 1 » (posée seulement pour un contrôle, puis retirée). */
    if (u.pathname === '/cerveau/essai' && env.ESSAI_CERVEAU === '1') {
      const outils = OUTILS_LECTURE.concat(OUTILS_ACTION); let corpsPost = null; if (req.method === 'POST') { try { corpsPost = await req.json(); } catch (e) { corpsPost = null; } }
      const q = (corpsPost && corpsPost.q) || u.searchParams.get('q') || 'Rayle, fais-moi un point sur l’or', sortie = { question: q };
      try {
        const un = u.searchParams.get('m'), opt = { cle: env.GEMINI_KEY, modeles: un ? [un] : null, delai: 25000 }, t0 = Date.now(); sortie.modele = un || 'chaîne'; const c = [{ role: 'user', parts: [{ text: q }] }], r1 = await appelerCerveau({ system: (corpsPost && corpsPost.system) || 'Tu es Rayle, assistante de trading. Pour toute question sur un marché, appelle les outils ; pour toute question sur une fenêtre, appelle ouvrir_fenetre. Tutoie. Réponds en 2 phrases, puis une ligne ---DETAIL--- et un détail.', contents: (corpsPost && corpsPost.contents) || c, outils, maxTokens: 700 }, opt); sortie.ms1 = Date.now() - t0;
        sortie.tour1 = { model: r1.model, essais: r1.essais, parts: r1.parts.map(p => (p.functionCall ? { appel: p.functionCall.name, args: p.functionCall.args, signature: !!p.thoughtSignature } : { texte: String(p.text || '').slice(0, 200) })) };
        const appels = r1.parts.filter(p => p.functionCall);
        if (appels.length && !(corpsPost && corpsPost.tour1seul)) { c.push({ role: 'model', parts: r1.parts }); c.push({ role: 'user', parts: appels.map(p => ({ functionResponse: { name: p.functionCall.name, response: { resultat: p.functionCall.name === 'prix_et_tendance' ? { actif: 'or', nom: 'Or', prix: 3558.3, ma200: 3953.77, positionMa200: 'sous', ecartMa200Pct: -10, tendanceDaily: 'baissière', tendanceH4: 'baissière' } : { ok: true } } } })) });
          const r2 = await appelerCerveau({ system: 'Tu es Rayle, assistante de trading. Tutoie. 2 phrases, puis ---DETAIL--- et un détail.', contents: c, outils, maxTokens: 500 }, opt);
          sortie.tour2 = { model: r2.model, texte: r2.parts.map(p => p.text || '').join('').slice(0, 500) }; }
      } catch (e) { sortie.erreur = e.message; }
      return json(sortie, 200, h);
    }
    if (u.pathname === '/cerveau' && req.method === 'POST') {
      const v = await verifierJeton(req, env);
      if (!v.ok) return json({ error: 'jeton refusé : ' + v.raison }, 401, h);
      return routeCerveau(req, env, ctx, h, { json });
    }
    return json({ error: 'route inconnue' }, 404, h);
  }
};
