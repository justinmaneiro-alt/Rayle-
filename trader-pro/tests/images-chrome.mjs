/* Test Chrome v8 phase 4 : images libres (Wikipédia / Wikimedia Commons) pour les questions générales. Le modèle est simulé (il appelle afficher_images) ; Wikipédia est interrogée pour de vrai (réseau requis).
   Sujets : Napoléon Bonaparte, Jules César, la tour Eiffel, Mars, le lion, la Joconde ; plus un sujet sans image. Un seul navigateur. Usage : node trader-pro/tests/images-chrome.mjs [tablette|tel|pc] */
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'tablette';
const pcm = Buffer.alloc(24000 * 2 * 2); const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const wav = Buffer.concat([Buffer.from('RIFF'), u32(36 + pcm.length), Buffer.from('WAVEfmt '), Buffer.from([16, 0, 0, 0, 1, 0, 1, 0]), u32(24000), u32(48000), Buffer.from([2, 0, 16, 0]), Buffer.from('data'), u32(pcm.length), pcm]);
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'X-Rayle-Voix, X-Rayle-Cache' };
const SUJETS = [['Qui était Napoléon Bonaparte ?', 'Napoléon Bonaparte', true], ['Qui était Jules César ?', 'Jules César', true], ['Parle-moi de Mars', 'planète Mars', false], ['C’est quoi un lion ?', 'lion', false]];
let tts = [];
const T = await lancer(mode, { dossierCaptures: 'donnees-privees/captures-v8', stockage: { rayle_worker_url: 'https://faux-worker.test', rayle_worker_token: 'jeton' }, interception: async (r, u) => {
  if (!u.startsWith('https://faux-worker.test/') && !u.includes('rayle-voix')) return false;
  const rep = (statut, corps) => r.respond({ status: statut, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(corps) });
  if (r.method() === 'OPTIONS') { await r.respond({ status: 204, headers: { ...CORS, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' } }); return true; }
  if (u.endsWith('/tts')) { tts.push(JSON.parse(r.postData() || '{}')); await r.respond({ status: 200, headers: { ...CORS, 'content-type': 'audio/wav', 'X-Rayle-Voix': 'gemini/Sulafat', 'X-Rayle-Cache': 'miss' }, body: wav }); return true; }
  if (u.endsWith('/cerveau')) {
    const b = JSON.parse(r.postData() || '{}'), dernier = b.contents[b.contents.length - 1], fr = dernier.parts.find(p => p.functionResponse), texte = (dernier.parts[0] || {}).text || '';
    if (fr) { const res = fr.functionResponse.response.resultat; await rep(200, { model: 'gemini-2.5-flash', parts: [{ text: res.ok ? 'Voici ' + res.titre + '. ' + (res.resume || '').slice(0, 120) : 'Je n’ai pas d’image pour ce sujet, mais je peux te répondre.' }] }); return true; }
    const sc = SUJETS.find(s => texte.includes(s[0].slice(0, 14))); if (sc) { await rep(200, { model: 'gemini-2.5-flash', parts: [{ functionCall: { name: 'afficher_images', args: { sujet: sc[1] } } }] }); return true; }
    await rep(200, { model: 'gemini-2.5-flash', parts: [{ text: 'D’accord.' }] }); return true;
  }
  await r.respond({ status: 404, headers: CORS, body: '{}' }); return true;
} }), { p, verif, attendre, fin, capture } = T;
const poser = async q => { const n = tts.length; await p.evaluate(q2 => { VoixMoteurs.razLimiteurGem && VoixMoteurs.razLimiteurGem(); const f = document.getElementById('form'), t = document.getElementById('txt'); t.value = q2; f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); }, q); await attendre(() => tts.length > n, 60000); await w(1200); };
const galerie = () => p.evaluate(() => { const g = document.getElementById('ra-galerie'); if (!g || g.hidden) return null; const im = g.querySelector('.rg-grande img'); return { titre: g.querySelector('.rg-titre').textContent, mini: g.querySelectorAll('.rg-mini button').length, dates: [...g.querySelectorAll('.rg-dates li')].map(l => l.textContent), licence: (g.querySelector('.rg-leg small') || {}).textContent || '', src: (g.querySelector('.rg-src') || {}).textContent || '', chargee: !!(im && im.complete && im.naturalWidth > 0), nomImg: im && im.src }; });
await w(2500);
for (const [q, sujet, personne] of SUJETS) {
  await p.evaluate(() => { const g = document.getElementById('ra-galerie'); if (g) g.hidden = true; });
  await poser(q); await attendre(() => p.evaluate(() => { const g = document.getElementById('ra-galerie'); return g && !g.hidden && g.querySelector('.rg-grande img'); }), 20000); await w(2500);
  const G = await galerie();
  verif(G && G.mini >= 3 && G.mini <= 5, sujet + ' : panneau d’images ouvert avec 1 principale + ' + (G ? G.mini - 1 : 0) + ' secondaires');
  verif(G && /^(CC|Public|Domaine|GFDL|Attribution|PD)/i.test(G.licence), sujet + ' : licence affichée (' + (G && G.licence.slice(0, 60)) + ')');
  verif(G && /Wikipédia/.test(G.src), sujet + ' : source affichée');
  verif(!personne || (G && G.dates.some(d => /Naissance/.test(d))), sujet + ' : dates clés' + (personne ? ' (' + (G && G.dates.join(' | ')) + ')' : ''));
  verif(G && G.chargee, sujet + ' : l’image principale est chargée');
  verif(tts.length >= 1, sujet + ' : la voix a parlé pendant ce temps (' + tts[tts.length - 1].text.slice(0, 50) + '…)');
  if (sujet === 'Napoléon Bonaparte') await capture('images-napoleon'); if (process.env.SEUL) await fin();
  await w(9000);   // courtoisie envers l'API Wikimedia
}
/* demandes explicites (sans le modèle : réponse directe) */
for (const [q, attendu] of [['Montre-moi la tour Eiffel', /Eiffel/i], ['Montre-moi la Joconde', /Joconde/i]]) {
  await p.evaluate(() => { const g = document.getElementById('ra-galerie'); if (g) g.hidden = true; });
  await poser(q); await attendre(() => p.evaluate(() => { const g = document.getElementById('ra-galerie'); return g && !g.hidden; }), 20000); const G = await galerie();
  verif(G && attendu.test(G.titre) && G.mini >= 3, q + ' : panneau d’images (' + (G && G.titre) + ', ' + (G ? G.mini : 0) + ' images)'); await w(9000);
}
/* aucun résultat : pas de panneau vide */
await p.evaluate(() => { const g = document.getElementById('ra-galerie'); if (g) g.hidden = true; });
await poser('Montre-moi xqzvbnmwk'); await w(2000);
verif(await p.evaluate(() => { const g = document.getElementById('ra-galerie'); return !g || g.hidden; }), 'sujet sans image libre : aucun panneau vide, la réponse seule');
await fin();
