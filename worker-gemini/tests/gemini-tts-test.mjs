import { pcmEnWav, tauxDepuisMime, construireDemande, appelerGemini, routeGeminiTTS, cleCacheTts, VOIX_GEMINI, MODELES_TTS, reinitialiser, compteurJour } from '../gemini-tts.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const pcm = Buffer.from(new Int16Array(2400).map((_, i) => Math.round(8000 * Math.sin(i / 8))).buffer).toString('base64');
const json = (o, s = 200, c = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', ...c } });
const faux = (reponses, appels = []) => async (url, opt) => { appels.push({ url, corps: JSON.parse(opt.body), cle: opt.headers['x-goog-api-key'] }); const r = reponses.shift(); return r instanceof Error ? Promise.reject(r) : r; };
const bon = () => json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm } }] } }] });
const cacheMem = () => { const m = new Map(); return { match: async k => (m.has(k) ? new Response(m.get(k)) : undefined), put: async (k, r) => { m.set(k, await r.arrayBuffer()); } }; };

/* WAV */
const w = pcmEnWav(pcm, 24000); v(String.fromCharCode(...w.slice(0, 4)) === 'RIFF' && String.fromCharCode(...w.slice(8, 12)) === 'WAVE' && w.length === 44 + 4800, 'en-tête WAV et taille'); v(new DataView(w.buffer).getUint32(24, true) === 24000, 'taux 24 kHz'); v(tauxDepuisMime('audio/L16;codec=pcm;rate=16000') === 16000 && tauxDepuisMime('') === 24000, 'taux depuis le type MIME');
/* demande */
const d = construireDemande({ texte: 'Bonjour.', voix: 'Kore', style: 'Avec une voix douce', ton: 'chaleureux', vitesse: -20 }); v(d.contents[0].parts[0].text.startsWith('Avec une voix douce, avec plus de chaleur, à un rythme lent et posé : Bonjour.'), 'consigne + ton + rythme + texte : ' + d.contents[0].parts[0].text); v(d.generationConfig.responseModalities[0] === 'AUDIO' && d.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName === 'Kore', 'modalité audio et voix prédéfinie');
v(Object.keys(VOIX_GEMINI).length === 6 && Object.values(VOIX_GEMINI).filter(x => x.genre === 'f').length === 3 && Object.values(VOIX_GEMINI).filter(x => x.genre === 'h').length === 3, '3 voix féminines et 3 masculines');
v(Object.values(VOIX_GEMINI).every(x => /français de France/.test(x.style)), 'consigne « français de France » partout'); v(MODELES_TTS[0] === 'gemini-3.1-flash-tts-preview' && MODELES_TTS[1] === 'gemini-2.5-flash-preview-tts', 'modèles essayés dans l ordre');
/* appel : repli sur le second modèle quand le premier n existe pas */
reinitialiser(); let ap = []; let r = await appelerGemini({ cle: 'K', texte: 'a', voix: 'Kore', style: 's', fetchFn: faux([json({ error: 'not found' }, 404), bon()], ap) });
v(ap.length === 2 && ap[0].url.includes(MODELES_TTS[0]) && ap[1].url.includes(MODELES_TTS[1]) && r.modele === MODELES_TTS[1] && r.wav.length > 44, 'repli sur gemini-2.5 si le 3.1 est absent'); v(ap[0].cle === 'K', 'clé envoyée en en-tête, jamais dans l URL'); v(!ap[0].url.includes('K'), 'clé absente de l URL');
ap = []; r = await appelerGemini({ cle: 'K', texte: 'b', voix: 'Kore', style: 's', fetchFn: faux([bon()], ap) }); v(ap.length === 1 && ap[0].url.includes(MODELES_TTS[1]), 'le modèle qui marche est mémorisé');
/* quota 429 → erreur quota puis blocage 10 min sans rappeler Google */
reinitialiser(); ap = []; let e1 = null; try { await appelerGemini({ cle: 'K', texte: 'c', voix: 'Kore', style: 's', fetchFn: faux([json({}, 429)], ap), maintenant: 1000 }); } catch (e) { e1 = e; } v(e1 && e1.quota && e1.statut === 429, '429 Google = erreur de quota');
let e2 = null; try { await appelerGemini({ cle: 'K', texte: 'c', voix: 'Kore', style: 's', fetchFn: faux([bon()], ap), maintenant: 2000 }); } catch (e) { e2 = e; } v(e2 && e2.quota && ap.length === 1, 'blocage de 10 min : Google n est pas rappelé');
reinitialiser(); let e3 = null; try { await appelerGemini({ cle: '', texte: 'x', voix: 'K', style: 's', fetchFn: faux([]) }); } catch (e) { e3 = e; } v(e3 && /GEMINI_KEY/.test(e3.message), 'clé absente : message clair');
/* route : cache, quota du jour */
reinitialiser(); const cache = cacheMem(), env = { GEMINI_KEY: 'K', GEMINI_TTS_LIMITE_JOUR: '2' }; ap = []; const fx = faux([bon(), bon(), bon()], ap);
const req = t => new Request('https://x/tts', { method: 'POST', body: JSON.stringify({ text: t, moteur: 'gemini', id: 'gemini-h1', ton: 'pose' }) });
let rr = await routeGeminiTTS(req('Bonjour Justin.'), env, null, {}, { json, cache, fetchFn: fx, maintenant: 5e12 }); v(rr.status === 200 && rr.headers.get('X-Rayle-Cache') === 'miss' && /gemini\/Algieba/.test(rr.headers.get('X-Rayle-Voix')) && rr.headers.get('Content-Type') === 'audio/wav', '1re phrase : audio WAV, cache miss, voix Algieba');
rr = await routeGeminiTTS(req('Bonjour Justin.'), env, null, {}, { json, cache, fetchFn: fx, maintenant: 5e12 }); v(rr.headers.get('X-Rayle-Cache') === 'hit' && ap.length === 1, 'même phrase : cache hit, Gemini non rappelé');
rr = await routeGeminiTTS(req('Deuxième phrase.'), env, null, {}, { json, cache, fetchFn: fx, maintenant: 5e12 }); v(rr.status === 200 && (await compteurJour(cache, 5e12)) === 2, 'compteur du jour = 2 phrases nouvelles');
rr = await routeGeminiTTS(req('Troisième phrase.'), env, null, {}, { json, cache, fetchFn: fx, maintenant: 5e12 }); v(rr.status === 429 && (await rr.json()).quota === true && ap.length === 2, 'limite du jour : 429 « quota », Gemini non appelé');
rr = await routeGeminiTTS(req('Deuxième phrase.'), env, null, {}, { json, cache, fetchFn: fx, maintenant: 5e12 }); v(rr.status === 200 && rr.headers.get('X-Rayle-Cache') === 'hit', 'les phrases en cache restent servies après la limite');
rr = await routeGeminiTTS(new Request('https://x/tts', { method: 'POST', body: JSON.stringify({ text: '  ' }) }), env, null, {}, { json, cache, fetchFn: fx }); v(rr.status === 400, 'texte vide refusé');
v((await cleCacheTts({ texte: 'a', voix: 'K', style: 's', ton: 'naturel', vitesse: 0 })) !== (await cleCacheTts({ texte: 'a', voix: 'K', style: 's', ton: 'pose', vitesse: 0 })), 'ton différent = autre entrée de cache');
console.log(`gemini-tts : ${ok} ok, ${ko} échec`); process.exit(ko ? 1 : 0);
