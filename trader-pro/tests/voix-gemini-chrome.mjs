/* Test Chrome v7 phase 4 : Réglages > Voix (6 voix Gemini, Écouter, cache, repli). Le Worker est simulé (aucune clé n'est nécessaire). Prérequis : node serveur.mjs 8000. Usage : node trader-pro/tests/voix-gemini-chrome.mjs [pc|tablette|tel] */
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'pc';
const pcm = Buffer.alloc(24000 * 2); for (let i = 0; i < 24000; i++) pcm.writeInt16LE(Math.round(6000 * Math.sin(i / 10)), i * 2);
const wav = Buffer.concat([Buffer.from('RIFF'), (() => { const b = Buffer.alloc(4); b.writeUInt32LE(36 + pcm.length); return b; })(), Buffer.from('WAVEfmt '), Buffer.from([16, 0, 0, 0, 1, 0, 1, 0]), (() => { const b = Buffer.alloc(8); b.writeUInt32LE(24000, 0); b.writeUInt32LE(48000, 4); return b; })(), Buffer.from([2, 0, 16, 0]), Buffer.from('data'), (() => { const b = Buffer.alloc(4); b.writeUInt32LE(pcm.length); return b; })(), pcm]);
let appels = [], mode429 = false;
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'X-Rayle-Voix, X-Rayle-Cache' };
const T = await lancer(mode, { dossierCaptures: 'donnees-privees/captures-v7', stockage: { rayle_worker_url: 'https://faux-worker.test', rayle_worker_token: 'jeton' }, interception: async (r, u) => {
  if (!u.startsWith('https://faux-worker.test/') && !u.includes('rayle-voix')) return false;
  if (r.method() === 'OPTIONS') { await r.respond({ status: 204, headers: { ...CORS, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' } }); return true; }
  if (u.endsWith('/tts')) { const b = JSON.parse(r.postData() || '{}'); appels.push(b); if (mode429) { await r.respond({ status: 429, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ error: 'quota', quota: true }) }); return true; } await r.respond({ status: 200, headers: { ...CORS, 'content-type': 'audio/wav', 'X-Rayle-Voix': 'gemini/Algieba (gemini-2.5-flash-preview-tts)', 'X-Rayle-Cache': 'miss' }, body: wav }); return true; }
  await r.respond({ status: 404, headers: CORS, body: '{}' }); return true;
} }), { p, verif, attendre, capture, fin } = T;
await p.evaluate(() => { const b = document.querySelector('#vxGemini'); if (b) b.scrollIntoView(); });
verif(await attendre(() => p.evaluate(() => !!document.querySelector('#vxGemini [data-ecouter]')), 15000), 'la liste des voix Gemini est affichée');
const L = await p.evaluate(() => [...document.querySelectorAll('#vxGemini [data-ecouter]')].map(b => ({ id: b.dataset.ecouter, off: b.disabled })));
verif(L.length === 6 && L.filter(x => /-f/.test(x.id)).length === 3 && L.filter(x => /-h/.test(x.id)).length === 3, '3 voix féminines + 3 masculines : ' + L.map(x => x.id).join(','));
verif(L.every(x => !x.off), 'boutons « Écouter » actifs quand le Worker est configuré');
verif(await p.evaluate(() => !!document.querySelector('#vxGemVit') && !!document.querySelector('#vxGemTon') && /Phrases nouvelles aujourd/.test(document.querySelector('#vxGemQuota').innerText)), 'réglages de vitesse et de ton + compteur de quota');
/* réglages puis écoute */
await p.evaluate(() => { const t = document.querySelector('#vxGemTon'); t.value = 'pose'; t.dispatchEvent(new Event('change', { bubbles: true })); const v = document.querySelector('#vxGemVit'); v.value = '-10'; v.dispatchEvent(new Event('input', { bubbles: true })); });
await p.evaluate(() => { try { speechSynthesis.cancel(); } catch (e) { /* */ } document.querySelector('#vxGemini [data-ecouter="gemini-h1"]').click(); });
verif(await attendre(() => appels.length >= 1, 15000), 'Écouter envoie la phrase au Worker'); const a = appels[0];
verif(a.id === 'gemini-h1' && a.ton === 'pose' && a.vitesse <= -10 && a.vitesse >= -25 && /Rayle/.test(a.text), 'corps de la requête : ' + JSON.stringify({ ...a, text: a.text.slice(0, 24) + '…' }));
await attendre(() => p.evaluate(() => /Algieba|Gemini/.test(document.querySelector("#vxMoteur").innerText)), 10000);
verif(await p.evaluate(() => /Algieba|Gemini/.test(document.querySelector('#vxMoteur').innerText)), 'indicateur du moteur utilisé : ' + await p.evaluate(() => document.querySelector('#vxMoteur').innerText));
const n1 = appels.length; await p.evaluate(() => document.querySelector('#vxGemini [data-ecouter="gemini-h1"]').click()); await w(2500); verif(appels.length === n1, 'même phrase, mêmes réglages : copie de l appareil, aucune nouvelle requête');
/* choix mémorisé */
await p.evaluate(() => { const r = document.querySelector('#vxGemini input[value="gemini-f2"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
verif(await p.evaluate(() => JSON.parse(localStorage.getItem('rayle_voix_gemini_v1')).moteur === 'gemini-f2' && VoixMoteurs.choisi() === 'gemini-f2'), 'choix de la voix mémorisé (clé synchronisée rayle_voix_gemini_v1)');
/* quota : 429 → le moteur de secours parle, pause de 15 minutes, plus de requête */
mode429 = true; appels = []; await p.evaluate(() => speak('Une phrase nouvelle pour le quota.')); await w(3500);
verif(appels.length === 1, 'Gemini est appelé une fois'); verif(await p.evaluate(() => VoixMoteurs.pauseGem() > Date.now()), 'après le 429 : pause de 15 minutes');
await p.evaluate(() => speak('Encore une autre phrase.')); await w(2500); verif(appels.length === 1, 'pendant la pause : plus d appel à Gemini');
verif(await p.evaluate(() => /secours/.test(VoixMoteurs.dernier())), 'indicateur : moteur de secours (' + await p.evaluate(() => VoixMoteurs.dernier()) + ')');
await p.evaluate(() => { const b = [...document.querySelectorAll('button,a,div')].find(e => e.children.length < 3 && /^Réglages$/.test((e.innerText || '').trim())); if (b) b.click(); }); await w(1200); await p.evaluate(() => { document.querySelector('#vxGemini').scrollIntoView({ block: 'center' }); }); await w(600); await capture('voix-gemini');
await fin();
