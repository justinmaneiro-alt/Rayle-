/* ═════════════ VOIX AZURE SPEECH (v9, phase 3) — route /azure du Worker rayle-voix ═════════════
   Ressource Azure officielle à ton nom, niveau gratuit F0 : 500 000 caractères par mois, puis le service est BLOQUÉ (aucune facturation).
   Secrets du Worker : AZURE_SPEECH_KEY (clé) et AZURE_SPEECH_REGION (ex. francecentral). Compteur du mois dans Workers KV (liaison QUOTA, une écriture par phrase nouvelle).
   Une réponse = une requête. Les phrases déjà dites (alertes, salutations, briefing) viennent du cache (Cache API du Worker) et ne comptent pas. */
export const VOIX_AZURE = Object.freeze({
  'azure-vivienne': 'fr-FR-VivienneMultilingualNeural',
  'azure-denise': 'fr-FR-DeniseNeural',
  'azure-remy': 'fr-FR-RemyMultilingualNeural',
  'azure-henri': 'fr-FR-HenriNeural'
});
/* ton → débit et hauteur de base (en %), additionnés à la vitesse demandée par la page */
export const TONS_AZURE = Object.freeze({ naturel: { rate: 0, pitch: 0 }, chaleureux: { rate: -3, pitch: -2 }, pose: { rate: -8, pitch: -3 }, dynamique: { rate: 6, pitch: 2 } });
export const LIMITE_MOIS_DEFAUT = 490000;   // marge sous les 500 000 : on s'arrête avant que Microsoft ne bloque
export const SEUIL_ALERTE = 0.8;
export const TEXTE_MAX = 4000;
export const FORMAT_AUDIO = 'audio-24khz-48kbitrate-mono-mp3';

const echapper = t => String(t).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const pct = n => (n >= 0 ? '+' : '') + Math.round(n) + '%';
const borne = (n, a, b) => Math.max(a, Math.min(b, Number(n) || 0));
export function parametres({ ton, vitesse } = {}) { const t = TONS_AZURE[ton] || TONS_AZURE.naturel; return { rate: borne(t.rate + borne(vitesse, -50, 100), -50, 100), pitch: borne(t.pitch, -30, 30) }; }
/* SSML : débit naturel, ton chaleureux ; les points et virgules déjà présents donnent les pauses */
export function construireSsml({ texte, voix, ton, vitesse }) {
  const nom = VOIX_AZURE[voix]; if (!nom) throw new Error('voix Azure inconnue : ' + voix);
  const p = parametres({ ton, vitesse });
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="fr-FR"><voice name="${nom}"><prosody rate="${pct(p.rate)}" pitch="${pct(p.pitch)}">${echapper(texte)}</prosody></voice></speak>`;
}
export const moisCle = (maintenant = Date.now()) => 'chars-' + new Date(maintenant).toISOString().slice(0, 7);
export function etatQuota(n, limite) { const l = Number(limite) || LIMITE_MOIS_DEFAUT; return { n, limite: l, pct: Math.round((n / l) * 1000) / 10, alerte: n / l >= SEUIL_ALERTE, bloque: n >= l }; }
async function empreinte(t) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function lireCompteur(env, maintenant) { try { return env.QUOTA ? Number(await env.QUOTA.get(moisCle(maintenant))) || 0 : 0; } catch (e) { return 0; } }

/* GET /azure/quota : état de la ressource et compteur du mois (sans rien consommer) */
export async function routeAzureQuota(env, cors, { json, maintenant = Date.now() } = {}) {
  const configure = !!(env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION), n = await lireCompteur(env, maintenant), limite = Number(env.AZURE_LIMITE_MOIS) || LIMITE_MOIS_DEFAUT;
  return json({ configure, region: configure ? env.AZURE_SPEECH_REGION : null, mois: moisCle(maintenant).slice(6), compteur: !!env.QUOTA, ...etatQuota(n, limite), plafondAzure: 500000 }, 200, cors);
}

export async function routeAzure(request, env, ctx, cors, { json, cache = (typeof caches !== 'undefined' ? caches.default : null), fetchFn = fetch, maintenant = Date.now() } = {}) {
  let c; try { c = await request.json(); } catch (e) { return json({ error: 'corps JSON attendu' }, 400, cors); }
  const texte = String(c.text || '').trim(), voix = String(c.voix || 'azure-vivienne');
  if (!texte) return json({ error: 'texte vide' }, 400, cors);
  if (texte.length > TEXTE_MAX) return json({ error: 'texte trop long (' + texte.length + ' > ' + TEXTE_MAX + ' caractères)' }, 413, cors);
  if (!VOIX_AZURE[voix]) return json({ error: 'voix Azure inconnue : ' + voix }, 400, cors);
  if (!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION) return json({ error: 'Azure Speech non configuré : secrets AZURE_SPEECH_KEY et AZURE_SPEECH_REGION absents de rayle-voix', nonConfigure: true }, 503, cors);
  const p = parametres({ ton: c.ton, vitesse: c.vitesse }), limite = Number(env.AZURE_LIMITE_MOIS) || LIMITE_MOIS_DEFAUT;
  const cleCache = new Request('https://rayle.cache/tts-azure/' + await empreinte([voix, p.rate, p.pitch, texte].join('\u0001')));
  const entetes = { ...cors, 'Content-Type': 'audio/mpeg', 'X-Rayle-Voix': 'azure/' + voix, 'X-Rayle-Chars-Limite': String(limite) };
  if (cache) { try { const hit = await cache.match(cleCache); if (hit) return new Response(hit.body, { status: 200, headers: { ...entetes, 'X-Rayle-Cache': 'hit', 'X-Rayle-Chars': String(await lireCompteur(env, maintenant)) } }); } catch (e) { /* pas de cache : on synthétise */ } }
  const avant = await lireCompteur(env, maintenant);
  if (avant + texte.length > limite) return json({ error: 'quota Azure du mois atteint (' + avant + ' / ' + limite + ' caractères) : voix locale Piper', mois: true, n: avant, limite }, 429, cors);
  let r;
  try { r = await fetchFn('https://' + env.AZURE_SPEECH_REGION + '.tts.speech.microsoft.com/cognitiveservices/v1', { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': env.AZURE_SPEECH_KEY, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': FORMAT_AUDIO, 'User-Agent': 'rayle-voix' }, body: construireSsml({ texte, voix, ton: c.ton, vitesse: c.vitesse }) }); }
  catch (e) { return json({ error: 'Azure injoignable : ' + ((e && e.message) || e) }, 502, cors); }
  if (!r.ok) {
    let d = ''; try { d = (await r.text()).slice(0, 200); } catch (e) { /* */ }
    if (r.status === 401 || r.status === 403) return json({ error: 'clé Azure refusée (HTTP ' + r.status + ') : vérifier AZURE_SPEECH_KEY et AZURE_SPEECH_REGION ' + d, cleRefusee: true }, 502, cors);
    if (r.status === 429) return json({ error: 'Azure : trop de requêtes ou quota F0 atteint (HTTP 429)', mois: true, n: avant, limite }, 429, cors);
    return json({ error: 'Azure : HTTP ' + r.status + ' ' + d }, 502, cors);
  }
  const audio = await r.arrayBuffer(), apres = avant + texte.length;
  if (env.QUOTA) { const ecrire = env.QUOTA.put(moisCle(maintenant), String(apres), { expirationTtl: 70 * 86400 }).catch(() => {}); if (ctx && ctx.waitUntil) ctx.waitUntil(ecrire); }
  if (cache) { const mise = cache.put(cleCache, new Response(audio.slice(0), { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=2592000' } })).catch(() => {}); if (ctx && ctx.waitUntil) ctx.waitUntil(mise); }
  return new Response(audio, { status: 200, headers: { ...entetes, 'X-Rayle-Cache': 'miss', 'X-Rayle-Chars': String(apres) } });
}
