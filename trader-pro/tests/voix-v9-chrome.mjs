/* Test Chrome v9 (phases 3 et 4) : voix par défaut Azure (Vivienne Multilingual), une seule requête par réponse, une seule voix du début à la fin, secours Piper sans voix robotique,
   panneau Réglages → Voix (4 voix Microsoft + 4 voix Piper, « Écouter », vitesse, ton, indicateur), compteur du mois et alerte à 80 %, choix mémorisé.
   Le Worker rayle-voix est simulé ; Piper est simulé ici (son vrai fonctionnement est testé par piper-chrome.mjs). Prérequis : node serveur.mjs 8000. Usage : node trader-pro/tests/voix-v9-chrome.mjs [tablette|tel|pc] */
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'tablette';
const pcm = Buffer.alloc(24000 * 2); for (let i = 0; i < 24000; i++) pcm.writeInt16LE(Math.round(6000 * Math.sin(i / 10)), i * 2);
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const wav = Buffer.concat([Buffer.from('RIFF'), u32(36 + pcm.length), Buffer.from('WAVEfmt '), Buffer.from([16, 0, 0, 0, 1, 0, 1, 0]), u32(24000), u32(48000), Buffer.from([2, 0, 16, 0]), Buffer.from('data'), u32(pcm.length), pcm]);
let azure = [], gemini = [], panne = false, compteur = 100, cle = true;
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'X-Rayle-Voix, X-Rayle-Cache, X-Rayle-Chars, X-Rayle-Chars-Limite' };
const T = await lancer(mode, { dossierCaptures: 'donnees-privees/captures-v9', stockage: { rayle_worker_url: 'https://faux-worker.test', rayle_worker_token: 'jeton', rayle_piper_precharge: '0' }, interception: async (r, u) => {
  if (!u.startsWith('https://faux-worker.test/') && !u.includes('rayle-voix')) return false;
  if (r.method() === 'OPTIONS') { await r.respond({ status: 204, headers: { ...CORS, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' } }); return true; }
  if (u.endsWith('/sante')) { await r.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, cle: true, azure: { cle, region: cle, compteur: true } }) }); return true; }
  if (u.endsWith('/azure/quota')) { await r.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ configure: cle, n: compteur, limite: 490000 }) }); return true; }
  if (u.endsWith('/azure')) { const c = JSON.parse(r.postData() || '{}'); azure.push(c); if (panne) { await r.respond({ status: 503, headers: { ...CORS, 'content-type': 'application/json' }, body: '{"error":"Azure injoignable"}' }); return true; } compteur += String(c.text).length; await r.respond({ status: 200, headers: { ...CORS, 'content-type': 'audio/mpeg', 'X-Rayle-Voix': 'azure/' + c.voix, 'X-Rayle-Cache': 'miss', 'X-Rayle-Chars': String(compteur), 'X-Rayle-Chars-Limite': '490000' }, body: wav }); return true; }
  if (u.endsWith('/tts')) { gemini.push(JSON.parse(r.postData() || '{}')); await r.respond({ status: 200, headers: { ...CORS, 'content-type': 'audio/wav', 'X-Rayle-Voix': 'gemini/Sulafat', 'X-Rayle-Cache': 'miss' }, body: wav }); return true; }
  await r.respond({ status: 404, headers: CORS, body: '{}' }); return true;
} }), { p, verif, attendre, fin } = T;
await p.evaluate(() => {
  window.__ss = 0; window.__max = 0; window.__en = new Set(); window.__piper = [];
  try { const o = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = u => { window.__ss++; return o(u); }; } catch (e) { /* */ }
  const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { const el = this; if (!el.__esp) { el.__esp = 1; el.addEventListener('playing', () => { window.__en.add(el); window.__max = Math.max(window.__max, window.__en.size); }); ['ended', 'pause', 'emptied'].forEach(e => el.addEventListener(e, () => window.__en.delete(el))); } return play.call(el); };
  /* Piper simulé : une voix prête qui renvoie un son et note les phrases reçues */
  const ctx = new AudioContext(); const n = 8000, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), e = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  e(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); e(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 22050, true); v.setUint32(28, 44100, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); e(36, 'data'); v.setUint32(40, n * 2, true); for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(5000 * Math.sin(i / 8)), true);
  PiperLocal.synth = async (id, t, o) => { window.__piper.push({ id, t }); return { blob: new Blob([b], { type: 'audio/wav' }), vitesseLecture: (o && o.vitesseLecture) || 1, src: 'piper/' + id }; };
  PiperLocal.pret = id => true; PiperLocal.etat = id => ({ etat: 'prete', pct: 100 });
});
await VoixMoteursLire(p); await w(1500);
async function VoixMoteursLire(p) { await p.evaluate(() => VoixMoteurs.rafraichirAzure()); }
verif(await p.evaluate(() => VoixMoteurs.azureDispo()), 'Azure détecté comme prêt (clé en place dans le Worker)');
verif(await p.evaluate(() => VoixMoteurs.choisi() === 'azure-vivienne'), 'voix par défaut : Vivienne Multilingual (Azure)');
/* 10 questions : une requête Azure et une seule voix par réponse */
const QUESTIONS = ['Voici le point sur l’or : il est au-dessus de sa moyenne mobile. Le volume reste faible, donc prudence.', 'Le Bitcoin se tient sous sa moyenne à deux cents jours.', 'Napoléon Bonaparte est né en mille sept cent soixante-neuf, en Corse. Il est mort en mille huit cent vingt et un.', 'Le calendrier annonce l’inflation américaine à quatorze heures trente.', 'Ton risque engagé aujourd’hui reste modéré.', 'Mars est la quatrième planète du système solaire.', 'La tour Eiffel mesure trois cent trente mètres.', 'Le Nasdaq cent est en repli de cinq pour cent.', 'Pour te couvrir sur l’or, la meilleure paire est le dollar.', 'Voilà, c’est tout pour ce point.'];
for (let i = 0; i < QUESTIONS.length; i++) {
  const n0 = azure.length; await p.evaluate(t => { addLine('ray', t); speak(t); }, QUESTIONS[i]);
  await attendre(() => azure.length > n0, 8000); await attendre(() => p.evaluate(() => window.__en.size === 0 && !document.querySelector('[data-etat="speaking"]')), 8000); await w(400);
  verif(azure.length === n0 + 1 && azure[n0].voix === 'azure-vivienne', 'réponse ' + (i + 1) + ' : une seule requête Azure, Vivienne (' + (azure.length - n0) + ')');
}
verif(await p.evaluate(() => window.__ss === 0), 'aucun appel à speechSynthesis'); verif(await p.evaluate(() => window.__max <= 1), 'jamais deux lectures en même temps (max ' + await p.evaluate(() => window.__max) + ')');
verif(await p.evaluate(() => window.__piper.length === 0), 'Azure disponible : Piper ne parle pas'); verif(gemini.length === 0, 'Gemini n’est plus appelé par défaut');
verif(await p.evaluate(() => /Vivienne.*Azure/.test(document.getElementById('voiceName').textContent)), 'indicateur : ' + await p.evaluate(() => document.getElementById('voiceName').textContent));
/* compteur du mois lu dans la page (et affiché dans État des données) */
const q = await p.evaluate(() => VoixMoteurs.quotaAzure()); verif(q && q.n > 100 && q.limite === 490000, 'compteur du mois reçu du Worker : ' + JSON.stringify(q));
verif(await p.evaluate(() => /Caractères Azure utilisés ce mois-ci : [\d\s  ]+ \/ 500 000/.test(document.getElementById('vxAzQuota').textContent)), 'Réglages → Voix : compteur « x / 500 000 »');
/* panneau Réglages → Voix */
const pan = await p.evaluate(() => ({ az: document.querySelectorAll('#vxAzure [data-ecouter]').length, pi: document.querySelectorAll('#vxPiper [data-ecouter]').length, gm: document.querySelectorAll('#vxGemini [data-ecouter]').length, noms: [...document.querySelectorAll('#vxAzure b, #vxPiper b')].map(e => e.textContent).join(' | '), vit: !!document.getElementById('vxGemVit'), ton: document.getElementById('vxGemTon').options.length }));
verif(pan.az === 4 && pan.pi === 4, 'panneau : 4 voix Microsoft + 4 voix Piper, chacune avec « Écouter » (' + pan.az + '+' + pan.pi + ')'); verif(/Vivienne/.test(pan.noms) && /Denise/.test(pan.noms) && /Rémy/.test(pan.noms) && /Henri/.test(pan.noms) && /Siwis/.test(pan.noms) && /Jessica/.test(pan.noms) && /Pierre/.test(pan.noms) && /Tom/.test(pan.noms), 'panneau : noms ' + pan.noms);
verif(pan.vit && pan.ton === 4, 'panneau : réglages de vitesse et de ton'); verif(pan.gm === 6, 'Gemini reste proposé comme choix (' + pan.gm + ' voix)');
/* « Écouter » : même phrase d'essai, voix précise */
const n1 = azure.length; await p.evaluate(() => document.querySelector('#vxAzure [data-ecouter="azure-henri"]').click()); await attendre(() => azure.length > n1, 6000); await w(1500);
verif(azure.length === n1 + 1 && azure[n1].voix === 'azure-henri' && /Bonjour, je suis Rayle/.test(azure[n1].text), '« Écouter » Henri : la phrase d’essai, voix Henri');
const np = await p.evaluate(() => window.__piper.length); await p.evaluate(() => document.querySelector('#vxPiper [data-ecouter="piper-tom"]').click()); await attendre(() => p.evaluate(n => window.__piper.length > n, np), 6000); await w(1000);
verif(await p.evaluate(() => window.__piper.slice(-1)[0].id === 'piper-tom'), '« Écouter » Tom (Piper) : voix Tom');
/* choix mémorisé et synchronisé (clé rayle_voix_gemini_v1) */
await p.evaluate(() => { const r = document.querySelector('#vxAzure input[value="azure-denise"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
verif(await p.evaluate(() => JSON.parse(localStorage.getItem('rayle_voix_gemini_v1')).moteur === 'azure-denise' && VoixMoteurs.choisi() === 'azure-denise'), 'choix Denise mémorisé dans la clé synchronisée');
const n2 = azure.length; await p.evaluate(() => { speak('Une phrase pour Denise.'); }); await attendre(() => azure.length > n2, 6000); verif(azure[n2] && azure[n2].voix === 'azure-denise', 'la voix choisie (Denise) parle');
await w(1500);
/* vitesse et ton transmis au Worker */
await p.evaluate(() => { VoixMoteurs.definirGemini({ ton: 'chaleureux', vitesse: 10 }); }); const n3 = azure.length; await p.evaluate(() => { speak('Phrase avec ton chaleureux et vitesse plus rapide.'); }); await attendre(() => azure.length > n3, 6000);
verif(azure[n3] && azure[n3].ton === 'chaleureux' && azure[n3].vitesse === 2, 'ton et vitesse (réglage +10 % et vitesse de base −8 % = +2 %) envoyés : ' + JSON.stringify(azure[n3] && { ton: azure[n3].ton, vitesse: azure[n3].vitesse })); await w(1500);
/* panne d'Azure : la réponse entière est lue par Piper, une seule voix, aucune voix du système */
panne = true; await p.evaluate(() => { VoixMoteurs.choisir('auto'); window.__piper.length = 0; }); const nb = azure.length;
await p.evaluate(() => { addLine('ray', 'Réponse pendant une panne.'); speak('Réponse pendant une panne d’Azure. Elle doit être lue entièrement par Piper, avec une seule voix, du début à la fin.'); });
await attendre(() => p.evaluate(() => window.__piper.length >= 1), 8000); await attendre(() => p.evaluate(() => window.__en.size === 0 && !document.querySelector('[data-etat="speaking"]')), 8000); await w(500);
const secours = await p.evaluate(() => window.__piper.map(x => x.id)); verif(secours.length >= 1 && new Set(secours).size === 1 && secours[0] === 'piper-siwis', 'panne Azure : Piper (Siwis) lit la réponse avec une seule voix : ' + secours.join(','));
verif(azure.length === nb + 1, 'panne Azure : une seule tentative Azure pour la réponse (' + (azure.length - nb) + ')'); verif(await p.evaluate(() => window.__ss === 0 && !/indisponible/.test(document.getElementById('voiceName').textContent)), 'panne Azure : pas de voix du système, pas de message d’échec puisque Piper a parlé');
/* Azure en pause après un échec ? (une panne n'est PAS une pause : seul le quota ou la clé refusée mettent en pause) */
panne = false; await p.evaluate(() => localStorage.removeItem('rayle_voix_azure_pause'));
/* alerte à 80 % */
await p.evaluate(() => { localStorage.removeItem('rayle_voix_azure_alerte'); }); compteur = 410000; await p.evaluate(() => { VoixMoteurs.choisir('azure-vivienne'); speak('Une phrase qui fait passer le compteur au-dessus de quatre-vingts pour cent.'); }); await attendre(() => p.evaluate(() => (VoixMoteurs.quotaAzure() || {}).pct >= 80), 6000); await w(300);
verif(await p.evaluate(() => /80 %/.test(document.getElementById('log') ? document.getElementById('log').innerText : document.body.innerText)), 'alerte à 80 % affichée dans la conversation');
verif(await p.evaluate(() => /plus de 80 %/i.test(document.getElementById('vxAzQuota').textContent)), 'alerte à 80 % dans Réglages → Voix');
await T.capture('voix-v9');
await fin();
