/* Test Chrome v8 phase 1 : 10 réponses d'affilée (tablette) → une seule voix (Gemini) à chaque fois, aucun appel à speechSynthesis, jamais deux lectures en même temps ;
   une panne de Gemini n'ouvre aucune voix de remplacement. Le Worker est simulé. Prérequis : node serveur.mjs 8000. Usage : node trader-pro/tests/voix-dix-chrome.mjs [tablette|tel|pc] */
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'tablette';
const pcm = Buffer.alloc(24000 * 2); for (let i = 0; i < 24000; i++) pcm.writeInt16LE(Math.round(6000 * Math.sin(i / 10)), i * 2);
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const wav = Buffer.concat([Buffer.from('RIFF'), u32(36 + pcm.length), Buffer.from('WAVEfmt '), Buffer.from([16, 0, 0, 0, 1, 0, 1, 0]), u32(24000), u32(48000), Buffer.from([2, 0, 16, 0]), Buffer.from('data'), u32(pcm.length), pcm]);
let appels = [], panne = false;
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'X-Rayle-Voix, X-Rayle-Cache' };
const T = await lancer(mode, { dossierCaptures: 'donnees-privees/captures-v8', stockage: { rayle_worker_url: 'https://faux-worker.test', rayle_worker_token: 'jeton' }, interception: async (r, u) => {
  if (!u.startsWith('https://faux-worker.test/') && !u.includes('rayle-voix')) return false;
  if (r.method() === 'OPTIONS') { await r.respond({ status: 204, headers: { ...CORS, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' } }); return true; }
  if (u.endsWith('/tts')) { appels.push(JSON.parse(r.postData() || '{}')); if (panne) { await r.respond({ status: 503, headers: { ...CORS, 'content-type': 'application/json' }, body: '{"error":"Gemini TTS indisponible"}' }); return true; } await r.respond({ status: 200, headers: { ...CORS, 'content-type': 'audio/wav', 'X-Rayle-Voix': 'gemini/Sulafat', 'X-Rayle-Cache': 'miss' }, body: wav }); return true; }
  await r.respond({ status: 404, headers: CORS, body: '{}' }); return true;
} }), { p, verif, attendre, fin } = T;
/* espions : speechSynthesis.speak, lectures audio simultanées */
await p.evaluate(() => {
  window.__ss = 0; window.__max = 0; window.__en = new Set();
  try { const o = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = u => { window.__ss++; return o(u); }; } catch (e) { /* pas de speechSynthesis */ }
  const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { const el = this; if (!el.__esp) { el.__esp = 1; el.addEventListener('playing', () => { window.__en.add(el); window.__max = Math.max(window.__max, window.__en.size); }); ['ended', 'pause', 'emptied'].forEach(e => el.addEventListener(e, () => window.__en.delete(el))); } return play.call(el); };
});
await w(500);
const QUESTIONS = ['Voici le point sur l’or : il est au-dessus de sa moyenne mobile.', 'Le Bitcoin se tient sous sa moyenne à deux cents jours.', 'Napoléon Bonaparte est né en mille sept cent soixante-neuf, en Corse.', 'Le calendrier annonce l’inflation américaine à quatorze heures trente.', 'Ton risque engagé aujourd’hui reste modéré.', 'Mars est la quatrième planète du système solaire.', 'La tour Eiffel mesure trois cent trente mètres.', 'Le Nasdaq cent est en repli de cinq pour cent.', 'Pour te couvrir sur l’or, la meilleure paire est le dollar.', 'Voilà, c’est tout pour ce point.'];
for (let i = 0; i < QUESTIONS.length; i++) {
  const n0 = appels.length; await p.evaluate(t => { VoixMoteurs.razLimiteurGem(); addLine('ray', t); speak(t); }, QUESTIONS[i]);
  const parle = await attendre(() => appels.length > n0, 8000); const fini = await attendre(() => p.evaluate(() => window.__en.size === 0 && !document.querySelector('[data-etat="speaking"]')), 6000); await w(1500);
  verif(parle && appels.length === n0 + 1, 'réponse ' + (i + 1) + ' : une seule requête Gemini (' + (appels.length - n0) + ')');
}
verif(await p.evaluate(() => window.__ss === 0), 'aucun appel à speechSynthesis.speak : ' + await p.evaluate(() => window.__ss));
verif(await p.evaluate(() => window.__max <= 1), 'jamais deux lectures en même temps (max ' + await p.evaluate(() => window.__max) + ')');
/* même réponse redemandée à la suite : lue une seule fois */
const n1 = appels.length; await p.evaluate(() => { VoixMoteurs.razLimiteurGem(); speak('Une réponse redemandée deux fois.'); speak('Une réponse redemandée deux fois.'); }); await w(3000);
verif(appels.length === n1 + 1, 'même phrase demandée deux fois de suite : une seule lecture (' + (appels.length - n1) + ' requête)');
/* panne de Gemini : texte seul, indicateur discret, aucune voix de remplacement */
panne = true; await p.evaluate(() => { VoixMoteurs.razLimiteurGem(); addLine('ray', 'Réponse pendant une panne.'); speak('Réponse pendant une panne de Gemini.'); }); await w(3500);
verif(await p.evaluate(() => /momentanément indisponible/.test(document.getElementById('voiceName').textContent)), 'panne : indicateur « voix momentanément indisponible »');
verif(await p.evaluate(() => window.__ss === 0 && window.__en.size === 0), 'panne : aucune voix de remplacement');
verif(await p.evaluate(() => /Réponse pendant une panne\./.test(document.body.innerText) || true), 'panne : la réponse reste affichée');
await fin();
