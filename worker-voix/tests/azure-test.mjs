/* Route Azure Speech de rayle-voix (v9) : SSML, voix, ton, compteur du mois, quota, cache, erreurs. Usage : node worker-voix/tests/azure-test.mjs */
import { routeAzure, routeAzureQuota, construireSsml, parametres, etatQuota, moisCle, VOIX_AZURE, LIMITE_MOIS_DEFAUT } from '../src/azure-tts.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', ...h } });
const kv = () => { const m = new Map(); return { m, get: async k => m.get(k) ?? null, put: async (k, x) => { m.set(k, x); } }; };
const cacheFaux = () => { const m = new Map(); return { m, match: async r => { const x = m.get(r.url); return x ? x.clone() : undefined; }, put: async (r, x) => { m.set(r.url, x); } }; };
const ctx = { waitUntil: p => p };
const req = o => new Request('https://x/azure', { method: 'POST', body: JSON.stringify(o) });
const maintenant = Date.UTC(2026, 10, 22);
const env0 = () => ({ AZURE_SPEECH_KEY: 'k', AZURE_SPEECH_REGION: 'francecentral', QUOTA: kv() });
const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3]);
const appels = []; const azureOk = async (u, o) => { appels.push({ u, o }); return new Response(mp3, { status: 200 }); };

/* SSML */
const s = construireSsml({ texte: 'L’or & le <Bitcoin> "montent"', voix: 'azure-vivienne', ton: 'chaleureux', vitesse: 5 });
v('SSML : voix Vivienne Multilingual', s.includes('fr-FR-VivienneMultilingualNeural')); v('SSML : langue fr-FR', /xml:lang="fr-FR"/.test(s));
v('SSML : texte échappé', s.includes('L’or &amp; le &lt;Bitcoin&gt; &quot;montent&quot;')); v('SSML : ton chaleureux + vitesse +5 → débit +2 %, hauteur -2 %', s.includes('rate="+2%"') && s.includes('pitch="-2%"'), s);
v('4 voix Microsoft', Object.keys(VOIX_AZURE).length === 4 && VOIX_AZURE['azure-denise'] === 'fr-FR-DeniseNeural' && VOIX_AZURE['azure-remy'] === 'fr-FR-RemyMultilingualNeural' && VOIX_AZURE['azure-henri'] === 'fr-FR-HenriNeural');
v('voix inconnue refusée', (() => { try { construireSsml({ texte: 'a', voix: 'x' }); return false; } catch (e) { return true; } })());
v('paramètres bornés', parametres({ ton: 'pose', vitesse: 900 }).rate <= 100 && parametres({ vitesse: -900 }).rate >= -50);
/* quota */
v('mois UTC', moisCle(maintenant) === 'chars-2026-11'); const q = etatQuota(400000, 500000); v('80 % = alerte', q.alerte && !q.bloque && q.pct === 80); v('limite par défaut sous 500 000', LIMITE_MOIS_DEFAUT < 500000);
/* route */
{ const env = env0(), cache = cacheFaux(); const r = await routeAzure(req({ text: 'Bonjour Justin.', voix: 'azure-vivienne' }), env, ctx, {}, { json, cache, fetchFn: azureOk, maintenant });
  v('synthèse : 200 audio mpeg', r.status === 200 && r.headers.get('content-type') === 'audio/mpeg'); v('une seule requête Azure', appels.length === 1);
  v('en-têtes Azure : clé, SSML, format mp3', appels[0].o.headers['Ocp-Apim-Subscription-Key'] === 'k' && appels[0].o.headers['Content-Type'] === 'application/ssml+xml' && /mp3/.test(appels[0].o.headers['X-Microsoft-OutputFormat']) && appels[0].u.startsWith('https://francecentral.tts.speech.microsoft.com/'));
  v('compteur du mois = 15 caractères', env.QUOTA.m.get('chars-2026-11') === '15' && r.headers.get('X-Rayle-Chars') === '15');
  const r2 = await routeAzure(req({ text: 'Bonjour Justin.', voix: 'azure-vivienne' }), env, ctx, {}, { json, cache, fetchFn: azureOk, maintenant });
  v('phrase déjà dite : cache, pas de nouvel appel, compteur inchangé', r2.headers.get('X-Rayle-Cache') === 'hit' && appels.length === 1 && env.QUOTA.m.get('chars-2026-11') === '15');
  const r3 = await routeAzure(req({ text: 'Bonjour Justin.', voix: 'azure-denise' }), env, ctx, {}, { json, cache, fetchFn: azureOk, maintenant }); v('autre voix = autre phrase en cache', r3.headers.get('X-Rayle-Cache') === 'miss' && appels.length === 2);
  const rq = await routeAzureQuota(env, {}, { json, maintenant }); const jq = await rq.json(); v('/azure/quota : configuré, 30 caractères', jq.configure && jq.n === 30 && jq.limite === LIMITE_MOIS_DEFAUT && jq.mois === '2026-11', JSON.stringify(jq)); }
{ const env = env0(); env.QUOTA.m.set('chars-2026-11', String(LIMITE_MOIS_DEFAUT - 5)); const r = await routeAzure(req({ text: 'Ce texte dépasse le quota.' }), env, ctx, {}, { json, cache: null, fetchFn: azureOk, maintenant }); const j = await r.json();
  v('quota du mois atteint : 429 avec mois:true, sans appeler Azure', r.status === 429 && j.mois === true && appels.length === 2, JSON.stringify(j)); }
{ const env = { QUOTA: kv() }; const r = await routeAzure(req({ text: 'Bonjour.' }), env, ctx, {}, { json, cache: null, fetchFn: azureOk, maintenant }); const j = await r.json(); v('sans clé : 503 « non configuré »', r.status === 503 && j.nonConfigure === true); }
{ const env = env0(); const r = await routeAzure(req({ text: 'Bonjour.' }), env, ctx, {}, { json, cache: null, fetchFn: async () => new Response('denied', { status: 401 }), maintenant }); const j = await r.json(); v('clé refusée par Microsoft : message clair, compteur inchangé', r.status === 502 && j.cleRefusee === true && !env.QUOTA.m.size); }
/* v12 : un HTTP 429 d'Azure n'est PAS la fin du quota du mois (limite de débit de l'offre gratuite) */
{ const env = env0(); let n429 = 0; const r = await routeAzure(req({ text: 'Bonjour débit.' }), env, ctx, {}, { json, cache: null, maintenant, pause: async () => {}, fetchFn: async () => { n429++; return new Response('Too many requests', { status: 429 }); } }); const j = await r.json();
  v('429 d’Azure : limite de débit (limiteDebit, PAS mois), Retry-After, une reprise côté Worker', r.status === 429 && j.limiteDebit === true && !j.mois && r.headers.get('Retry-After') === '3' && n429 === 2, JSON.stringify(j) + ' appels ' + n429);
  v('429 d’Azure : le compteur du mois n’a pas bougé', !env.QUOTA.m.get('chars-2026-11')); }
{ const env = env0(); let n = 0; const r = await routeAzure(req({ text: 'Bonjour reprise.' }), env, ctx, {}, { json, cache: null, maintenant, pause: async () => {}, fetchFn: async () => (++n === 1 ? new Response('busy', { status: 429 }) : new Response(mp3, { status: 200 })) });
  v('429 passager : la reprise côté Worker réussit (200 audio)', r.status === 200 && n === 2); }
{ const env = env0(); const r = await routeAzure(req({ text: 'Bonjour quota.' }), env, ctx, {}, { json, cache: null, maintenant, pause: async () => {}, fetchFn: async () => new Response('Your free tier quota exceeded', { status: 429 }) }); const j = await r.json();
  v('429 qui dit « quota » : mois:true', r.status === 429 && j.mois === true); }
{ const env = env0(); const r = await routeAzure(req({ text: 'x'.repeat(4001) }), env, ctx, {}, { json, cache: null, fetchFn: azureOk, maintenant }); v('texte trop long : 413', r.status === 413); }
{ const env = env0(); const r = await routeAzure(req({ text: 'Bonjour.' }), env, ctx, {}, { json, cache: null, fetchFn: async () => { throw new Error('réseau'); }, maintenant }); v('réseau coupé : 502', r.status === 502); }
console.log(`${ok} ok, ${ko} KO`); process.exit(ko ? 1 : 0);
