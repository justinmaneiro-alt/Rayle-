/* ═════════════ VOIX GEMINI TTS (v7, phase 4) — route /tts du Worker, moteur « gemini » ═════════════
   Le Worker appelle l'API Gemini TTS (clé GEMINI_KEY, déjà utilisée par le chat : jamais envoyée à la page), transforme le PCM 24 kHz renvoyé en fichier WAV,
   et garde l'audio en cache (Cache API de Cloudflare : une phrase déjà dite n'est jamais redemandée à Google, donc ne consomme ni quota Gemini ni requêtes d'API).
   Quota : compteur du jour dans la Cache API (zéro écriture KV) ; au-delà de GEMINI_TTS_LIMITE_JOUR (90 par défaut, sous la limite gratuite connue) ou sur un 429 de Google,
   le Worker répond 429 : la page bascule sur son moteur de secours (voix du système, Edge Natural sur PC).
   Ce fichier est la SOURCE VERSIONNÉE : le code est recopié dans worker/worker.js (non versionné) entre les repères « // src/gemini-tts.js ». Testé : tests/gemini-tts-test.mjs.
   Voix originales uniquement (voix prédéfinies de Google) : aucune imitation d'une personne réelle. */
export const MODELES_TTS = Object.freeze(['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts']);
/* 6 propositions : 3 féminines (chaleureuses, élégantes), 3 masculines « majordome IA » (calmes, raffinées). `style` = consigne en français devant le texte. */
export const VOIX_GEMINI = Object.freeze({
  'gemini-f1': { voix: 'Sulafat', genre: 'f', nom: 'Sulafat · chaleureuse', style: 'Avec une voix féminine chaleureuse, posée, souriante et naturelle, en français de France' },
  'gemini-f2': { voix: 'Vindemiatrix', genre: 'f', nom: 'Vindemiatrix · douce', style: 'Avec une voix féminine douce, élégante, posée et naturelle, en français de France' },
  'gemini-f3': { voix: 'Achernar', genre: 'f', nom: 'Achernar · veloutée', style: 'Avec une voix féminine veloutée, calme, souriante et naturelle, en français de France' },
  'gemini-h1': { voix: 'Algieba', genre: 'h', nom: 'Algieba · majordome', style: 'Avec une voix masculine calme, raffinée et posée, d’assistant dévoué à l’élégance un peu britannique, mais en français de France' },
  'gemini-h2': { voix: 'Charon', genre: 'h', nom: 'Charon · posé', style: 'Avec une voix masculine grave, calme, précise et rassurante, d’assistant personnel, en français de France' },
  'gemini-h3': { voix: 'Iapetus', genre: 'h', nom: 'Iapetus · clair', style: 'Avec une voix masculine claire, mesurée, distinguée et naturelle, d’assistant personnel, en français de France' }
});
export const TONS = Object.freeze({ naturel: '', chaleureux: ', avec plus de chaleur', pose: ', sur un ton très posé et rassurant', dynamique: ', avec un peu plus d’énergie' });

/* PCM 16 bits little-endian mono (base64) → fichier WAV */
export function pcmEnWav(base64, taux = 24000) {
  const bin = atob(base64), n = bin.length, buf = new Uint8Array(44 + n), dv = new DataView(buf.buffer), ecrire = (o, s) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); };
  ecrire(0, 'RIFF'); dv.setUint32(4, 36 + n, true); ecrire(8, 'WAVE'); ecrire(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, taux, true); dv.setUint32(28, taux * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); ecrire(36, 'data'); dv.setUint32(40, n, true);
  for (let i = 0; i < n; i++) buf[44 + i] = bin.charCodeAt(i); return buf;
}
export const tauxDepuisMime = mime => { const m = /rate=(\d{4,6})/.exec(String(mime || '')); return m ? +m[1] : 24000; };

/* corps de la requête Gemini : consigne de style, deux-points, texte à dire */
export function construireDemande({ texte, voix, style, ton = 'naturel', vitesse = 0 }) {
  const rythme = vitesse >= 12 ? ', à un rythme un peu soutenu' : vitesse <= -12 ? ', à un rythme lent et posé' : '';
  return { contents: [{ parts: [{ text: `${style}${TONS[ton] || ''}${rythme} : ${texte}` }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voix } } } } };
}
export class ErreurGemini extends Error { constructor(msg, statut, quota = false) { super(msg); this.statut = statut; this.quota = quota; } }
let modeleOk = null, bloqueJusqua = 0;
/* appelle Gemini ; essaie les modèles dans l'ordre (le premier qui répond est mémorisé) ; 429 → ErreurGemini quota */
export async function appelerGemini({ cle, texte, voix, style, ton, vitesse, fetchFn = (...a) => fetch(...a), maintenant = Date.now(), delai = 25000 }) {
  if (!cle) throw new ErreurGemini('clé GEMINI_KEY absente des secrets du Worker', 400);
  if (maintenant < bloqueJusqua) throw new ErreurGemini('quota Gemini atteint (nouvel essai plus tard)', 429, true);
  const corps = JSON.stringify(construireDemande({ texte, voix, style, ton, vitesse })), liste = modeleOk ? [modeleOk, ...MODELES_TTS.filter(m => m !== modeleOk)] : MODELES_TTS, erreurs = [];
  for (const m of liste) {
    let r; try { r = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cle }, body: corps, signal: AbortSignal.timeout ? AbortSignal.timeout(delai) : undefined }); } catch (e) { erreurs.push(m + ' : ' + e.message); continue; }
    if (r.status === 429) {
      /* le message de Google dit quelle limite est touchée (par minute ou par jour, modèle, valeur) : on le garde pour l'afficher et le noter */
      const brut = await r.text().catch(() => ''); let detail = ''; try { const j = JSON.parse(brut), e = j.error || {}; const viol = ((e.details || []).find(d => d.violations) || {}).violations || []; detail = [e.message, ...viol.map(v => (v.quotaMetric || '') + ' ' + (v.quotaId || '') + (v.quotaValue ? ' limite=' + v.quotaValue : ''))].filter(Boolean).join(' | '); } catch (x) { detail = brut; }
      detail = String(detail).replace(/s+/g, ' ').slice(0, 500); const parJour = /PerDay|per day|daily/i.test(detail);
      bloqueJusqua = maintenant + (parJour ? 3 * 3600e3 : 20e3); try { console.log('gemini 429 ' + m + ' : ' + detail); } catch (x) { /* */ }
      const er = new ErreurGemini('quota Gemini atteint (429) [' + m + '] ' + detail, 429, true); er.parJour = parJour; throw er; }
    if (r.status === 404 || r.status === 400) { erreurs.push(m + ' : HTTP ' + r.status); continue; }   // modèle absent ou refusé : on essaie le suivant
    if (!r.ok) { erreurs.push(m + ' : HTTP ' + r.status); continue; }
    const j = await r.json().catch(() => null), part = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts.find(p => p.inlineData || p.inline_data), d = part && (part.inlineData || part.inline_data);
    if (!d || !d.data) { erreurs.push(m + ' : réponse sans audio'); continue; }
    modeleOk = m; return { wav: pcmEnWav(d.data, tauxDepuisMime(d.mimeType || d.mime_type)), modele: m };
  }
  throw new ErreurGemini('Gemini TTS indisponible : ' + erreurs.join(' ; '), 503);
}
export const reinitialiser = () => { modeleOk = null; bloqueJusqua = 0; };

/* clé de cache stable (SHA-256) : voix, consigne, ton, vitesse, texte */
export async function cleCacheTts({ texte, voix, style, ton, vitesse }) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode([voix, style, ton, vitesse, texte].join('\u0001')));
  return 'https://rayle.cache/tts-gemini/' + [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const jourCleTts = (maintenant = Date.now()) => 'https://rayle.cache/tts-gemini-n/' + new Date(maintenant).toISOString().slice(0, 10);
export async function compteurJour(cache, maintenant = Date.now()) { try { const r = await cache.match(jourCleTts(maintenant)); return r ? parseInt(await r.text(), 10) || 0 : 0; } catch (e) { return 0; } }
export async function incrementerJour(cache, maintenant = Date.now()) { try { const n = (await compteurJour(cache, maintenant)) + 1; await cache.put(jourCleTts(maintenant), new Response(String(n), { headers: { 'Cache-Control': 'max-age=90000' } })); return n; } catch (e) { return null; } }

/* route : corps JSON { text, moteur: 'gemini', id: 'gemini-f1', ton, vitesse } → audio/wav ; en-têtes X-Rayle-Voix (« gemini/Sulafat ») et X-Rayle-Cache (« hit » / « miss ») */
export async function routeGeminiTTS(request, env, ctx, cors, { json, cache = (typeof caches !== 'undefined' ? caches.default : null), fetchFn, maintenant = Date.now() } = {}) {
  const b = await request.json().catch(() => null), texte = String(b && b.text || '').trim().slice(0, 600);
  if (!texte) return json({ error: 'texte manquant' }, 400, cors);
  const V = VOIX_GEMINI[b && b.id] || VOIX_GEMINI['gemini-f1'], ton = TONS[b && b.ton] != null ? b.ton : 'naturel', vitesse = Math.max(-40, Math.min(30, Math.round(Number(b && b.vitesse) || 0)));
  const cle = cache ? await cleCacheTts({ texte, voix: V.voix, style: V.style, ton, vitesse }) : null;
  const rep = (wav, etat, modele) => new Response(wav, { status: 200, headers: Object.assign({ 'Content-Type': 'audio/wav', 'X-Rayle-Voix': 'gemini/' + V.voix + (modele ? ' (' + modele + ')' : ''), 'X-Rayle-Cache': etat, 'Cache-Control': 'no-store' }, cors) });
  if (cache) { try { const hit = await cache.match(cle); if (hit) return rep(await hit.arrayBuffer(), 'hit'); } catch (e) { /* cache indisponible : on appelle Gemini */ } }
  const limite = Number(env.GEMINI_TTS_LIMITE_JOUR) || 90;
  if (cache && (await compteurJour(cache, maintenant)) >= limite) return json({ error: 'quota du jour atteint (' + limite + ' phrases nouvelles) : moteur de secours', quota: true }, 429, cors);
  try {
    const g = await appelerGemini({ cle: env.GEMINI_KEY, texte, voix: V.voix, style: V.style, ton, vitesse, fetchFn, maintenant });
    if (cache) { try { const copie = new Response(g.wav, { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'public, max-age=2592000' } }); if (ctx && ctx.waitUntil) { ctx.waitUntil(cache.put(cle, copie)); ctx.waitUntil(incrementerJour(cache, maintenant)); } else { await cache.put(cle, copie); await incrementerJour(cache, maintenant); } } catch (e) { /* tant pis : pas de cache */ } }
    return rep(g.wav, 'miss', g.modele);
  } catch (e) { return json({ error: e.message, quota: !!e.quota, jour: !!e.parJour }, e.statut || 503, cors); }
}
