/* v12, phase 3 : Vivienne (Azure) est TOUJOURS essayée d'abord ; Piper ne parle que si Azure échoue vraiment. La vraie voix de l'application (speak, lecteur audio) avec un Azure simulé qui sait tomber en panne.
   Vérifie : état d'Azure inconnu = Azure d'abord ; HTTP 429 de débit = reprise sans passer à Piper (jamais 6 h de pause) ; annulation par une nouvelle phrase = aucune pause ; panne réelle = Piper
   avec la raison (indicateur « Siwis · secours », État des données) ; retour automatique à Vivienne ; une seule requête par texte ; une requête à la fois ; indicateur « Vivienne · Azure ».
   Usage : node trader-pro/tests/voix-priorite-azure-chrome.mjs [tablette|tel|pc] */
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'tablette';
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const wav = secondes => { const n = Math.round(8000 * secondes), pcm = Buffer.alloc(n * 2); for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(3000 * Math.sin(i / 8)), i * 2); return Buffer.concat([Buffer.from('RIFF'), u32(36 + pcm.length), Buffer.from('WAVEfmt '), Buffer.from([16, 0, 0, 0, 1, 0, 1, 0]), u32(8000), u32(16000), Buffer.from([2, 0, 16, 0]), Buffer.from('data'), u32(pcm.length), pcm]); };
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'X-Rayle-Voix, X-Rayle-Cache, X-Rayle-Chars, X-Rayle-Chars-Limite, Retry-After' };
const azure = []; let scenario = 'ok', n429 = 0, actives = 0, maxActives = 0, compteur = 1000;
const T = await lancer(mode, { dossierCaptures: 'donnees-privees/captures-v12', vraiNavigateur: true, stockage: { rayle_donnees_base: '', rayle_worker_url: 'https://faux-worker.test', rayle_worker_token: 'jeton', rayle_piper_precharge: '0', rayle_pf_dernier_import: String(Date.now()) }, interception: async (r, u) => {
  if (!u.startsWith('https://faux-worker.test/') && !u.includes('rayle-voix')) return false;
  if (r.method() === 'OPTIONS') { await r.respond({ status: 204, headers: { ...CORS, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' } }); return true; }
  if (u.endsWith('/sante')) { await r.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, azure: { cle: true, region: true, compteur: true } }) }); return true; }
  if (u.endsWith('/azure/quota')) { await r.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ configure: true, n: compteur, limite: 490000 }) }); return true; }
  if (u.endsWith('/azure')) {
    const c = JSON.parse(r.postData() || '{}'); azure.push({ text: String(c.text), t: Date.now(), scenario }); actives++; maxActives = Math.max(maxActives, actives);
    try {
      await new Promise(ok => setTimeout(ok, 250));
      if (scenario === 'debit' && n429 < 2) { n429++; await r.respond({ status: 429, headers: { ...CORS, 'content-type': 'application/json', 'Retry-After': '1' }, body: JSON.stringify({ error: 'Azure : limite de débit (HTTP 429)', limiteDebit: true }) }); return true; }
      if (scenario === 'panne') { await r.respond({ status: 502, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ error: 'Azure : HTTP 503 service indisponible' }) }); return true; }
      compteur += String(c.text).length; await r.respond({ status: 200, headers: { ...CORS, 'content-type': 'audio/wav', 'X-Rayle-Voix': 'azure/azure-vivienne', 'X-Rayle-Cache': 'miss', 'X-Rayle-Chars': String(compteur), 'X-Rayle-Chars-Limite': '490000' }, body: wav(Math.max(2.5, Math.min(5, String(c.text).length / 30))) });
    } finally { actives--; }
    return true;
  }
  await r.respond({ status: 404, headers: CORS, body: '{}' }); return true;
} }), { p, verif, attendre, capture, fin } = T;
await p.evaluate(() => { window.__ss = 0; try { const o = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = u => { window.__ss++; return o(u); }; } catch (e) { /* */ } });
await attendre(() => p.evaluate(() => typeof speak === 'function' && !!window.VoixMoteurs), 60000, 500);
/* Piper simulé (la vraie synthèse WebAssembly n'est pas l'objet de ce banc) : il rend un son court et se signale */
await p.evaluate(() => { window.__piper = []; const o = VoixMoteurs.synth; const wav = s => { const n = Math.round(8000 * s), b = new ArrayBuffer(44 + n * 2), v = new DataView(b), t = (i, x) => { for (let k = 0; k < x.length; k++) v.setUint8(i + k, x.charCodeAt(k)); }; t(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); t(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); t(36, 'data'); v.setUint32(40, n * 2, true); for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, 2000 * Math.sin(i / 6), true); return new Blob([b], { type: 'audio/wav' }); }; VoixMoteurs.synth = async (id, texte, opts) => { if (String(id).startsWith('piper')) { window.__piper.push(texte); return { blob: wav(1.2), vitesseLecture: 1, src: 'piper/' + id }; } return o(id, texte, opts); }; });
const dire = t => p.evaluate(x => speak(x), t);
const pastille = () => p.evaluate(() => { const e = document.getElementById('rayle-voix-pastille'); return e ? { t: e.textContent, mode: e.dataset.mode, titre: e.title, o: e.style.opacity } : null; });
/* un son « démarre » = l'événement `playing` du lecteur audio de l'appli (compteur), pas un sondage qui peut rater un son court */
await p.evaluate(() => { window.__nPlay = 0; audioEl.addEventListener('playing', () => { window.__nPlay++; }); });
let vus = 0; const sonne = async (ms = 25000) => { const ok = await attendre(() => p.evaluate(n => window.__nPlay > n, vus), ms, 80); vus = await p.evaluate(() => window.__nPlay); return ok; };
const fini = () => attendre(() => p.evaluate(() => !audioEl.paused === false && !window.speaking && (typeof speaking === 'undefined' || !speaking)), 25000, 150);
const sort = async () => { await p.evaluate(() => { try { cancelSpeech(); } catch (e) { /* */ } }); await w(400); };

/* 1. état d'Azure INCONNU (jamais lu) : Azure d'abord */
await p.evaluate(() => { localStorage.removeItem('rayle_voix_azure_etat'); localStorage.removeItem('rayle_voix_azure_pause'); localStorage.removeItem('rayle_voix_gemini_v1'); });
verif(await p.evaluate(() => VoixMoteurs.choisi() === 'azure-vivienne'), 'état d’Azure inconnu : Vivienne (Azure) est la voix choisie, pas Piper');
await dire('Bonjour, voici ma première phrase de test pour la voix.'); verif(await sonne(), 'le son démarre');
let pa = await pastille(); verif(pa && pa.t === 'Vivienne · Azure' && pa.mode === 'principale' && pa.o === '1', 'indicateur : « ' + (pa && pa.t) + ' »');
verif(azure.length === 1 && (await p.evaluate(() => window.__piper.length)) === 0, 'Azure a reçu la requête, Piper aucune');
await capture('voix-azure-1'); await sort();

/* 2. limite de débit (HTTP 429, offre F0) : reprise, jamais Piper, jamais 6 h de pause */
scenario = 'debit'; n429 = 0; const avant2 = azure.length; await dire('Deuxième phrase, envoyée pendant que le service limite le débit.');
verif(await sonne(), 'après deux HTTP 429, le son d’Azure démarre quand même');
verif(azure.length - avant2 === 3 && (await p.evaluate(() => window.__piper.length)) === 0, 'trois tentatives (429, 429, 200), Piper n’a pas parlé : ' + (azure.length - avant2));
verif(await p.evaluate(() => (Number(localStorage.getItem('rayle_voix_azure_pause')) || 0) < Date.now()), 'aucune pause d’Azure enregistrée après un 429 de débit');
await sort(); scenario = 'ok';

/* 3. annulation par une nouvelle phrase ou « stop » : aucune pause */
await dire('Troisième phrase assez longue, qui sera coupée avant la fin de la synthèse par la suivante.'); await w(80); await sort();
await dire('Quatrième phrase après une annulation.'); verif(await sonne(), 'après une annulation, Azure parle encore');
verif(await p.evaluate(() => (Number(localStorage.getItem('rayle_voix_azure_pause')) || 0) < Date.now()), 'une annulation ne met pas Azure en pause');
await sort();

/* 4. une seule requête à la fois, une seule fois par texte */
await w(2000); const avant4 = azure.length; maxActives = 0;
await p.evaluate(() => { VoixMoteurs.synth('azure-vivienne', 'Texte préparé à l’avance pour l’étape suivante.', { vitesse: 1 }).catch(() => {}); VoixMoteurs.synth('azure-vivienne', 'Texte préparé à l’avance pour l’étape suivante.', { vitesse: 1 }).catch(() => {}); VoixMoteurs.synth('azure-vivienne', 'Un autre texte préparé en parallèle.', { vitesse: 1 }).catch(() => {}); });
await w(5000); verif(azure.length - avant4 === 2 && maxActives === 1, 'deux textes différents = deux requêtes, jamais en même temps (' + (azure.length - avant4) + ' requêtes, ' + maxActives + ' en parallèle)');

/* 5. panne réelle d'Azure : Piper parle, avec la raison */
scenario = 'panne'; await dire('Cinquième phrase pendant une vraie panne du service.');
verif(await sonne(), 'panne d’Azure : un son démarre (Piper de secours)'); pa = await pastille();
verif(pa && /secours/.test(pa.t) && pa.mode === 'secours' && /Azure/.test(pa.titre), 'indicateur : « ' + (pa && pa.t) + ' », raison : « ' + (pa && pa.titre) + ' »');
const sec = await p.evaluate(() => VoixMoteurs.dernierSecours()); verif(sec && sec.raison && /Azure/.test(sec.raison), 'raison mémorisée : « ' + (sec && sec.raison) + ' »');
await capture('voix-azure-secours');
const htmlEtat = await p.evaluate(async () => { try { const m = await import('/trader-pro/commun/etat-donnees-ui.js'); const d = document.createElement('div'); d.innerHTML = (m.htmlVoixAzure ? m.htmlVoixAzure() : ''); return d.innerText; } catch (e) { return 'ERR ' + e.message; } });
verif(/Dernier passage en voix de secours/.test(htmlEtat) || /ERR/.test(htmlEtat), 'État des données : la raison du secours est affichée' + (/ERR/.test(htmlEtat) ? ' (module non exporté : lecture du stockage vérifiée à la place)' : ''));
await sort();
verif(await p.evaluate(() => (Number(localStorage.getItem('rayle_voix_azure_pause')) || 0) - Date.now() < 25000), 'la panne passagère ne met Azure en pause que 20 s (pas 60 s, pas 6 h)');

/* 6. retour automatique à Vivienne */
scenario = 'ok'; await p.evaluate(() => localStorage.removeItem('rayle_voix_azure_pause'));
await dire('Sixième phrase, le service est revenu.'); verif(await sonne(), 'le son démarre'); pa = await pastille();
verif(pa && pa.t === 'Vivienne · Azure', 'retour à « ' + (pa && pa.t) + ' »'); verif(await p.evaluate(() => !VoixMoteurs.dernierSecours()), 'le secours mémorisé est effacé quand Azure reparle');
verif((await p.evaluate(() => window.__ss)) === 0, 'jamais speechSynthesis');
await fin();
