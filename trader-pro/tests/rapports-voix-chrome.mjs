/* v11 phase 5 : la VRAIE voix de l'application (speak, lecteur audio, Azure simulé qui renvoie un son dont la durée suit la longueur du texte) pilotée par le lecteur de rapports.
   Vérifie : une requête Azure par étape (jamais deux fois le même texte), l'animation suit l'horloge du lecteur audio, la pause arrête VRAIMENT le son et « reprends » le continue au même endroit,
   une question en cours de rapport met le rapport en attente puis « reprends » relit l'étape, aucun speechSynthesis, jamais deux sons en même temps.
   Usage : node trader-pro/tests/rapports-voix-chrome.mjs [tablette|tel|pc]   (prérequis : node serveur.mjs 8000 ; données de production) */
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'tablette';
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const wav = secondes => { const n = Math.round(8000 * secondes), pcm = Buffer.alloc(n * 2); for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(3000 * Math.sin(i / 8)), i * 2); return Buffer.concat([Buffer.from('RIFF'), u32(36 + pcm.length), Buffer.from('WAVEfmt '), Buffer.from([16, 0, 0, 0, 1, 0, 1, 0]), u32(8000), u32(16000), Buffer.from([2, 0, 16, 0]), Buffer.from('data'), u32(pcm.length), pcm]); };
const azure = [], CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'X-Rayle-Voix, X-Rayle-Cache, X-Rayle-Chars, X-Rayle-Chars-Limite' }; let compteur = 1000;
const ACCEL = 2.5;   // le son simulé dure 2,5 fois moins longtemps qu'une vraie voix (le banc est plus court, la synchronisation est la même)
const T = await lancer(mode, { dossierCaptures: 'donnees-privees/captures-v11', vraiNavigateur: true, stockage: { rayle_donnees_base: '', rayle_worker_url: 'https://faux-worker.test', rayle_worker_token: 'jeton', rayle_piper_precharge: '0', rayle_pf_dernier_import: String(Date.now()) }, interception: async (r, u) => {
  if (!u.startsWith('https://faux-worker.test/') && !u.includes('rayle-voix')) return false;
  if (r.method() === 'OPTIONS') { await r.respond({ status: 204, headers: { ...CORS, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' } }); return true; }
  if (u.endsWith('/sante')) { await r.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, cle: true, azure: { cle: true, region: true, compteur: true } }) }); return true; }
  if (u.endsWith('/azure/quota')) { await r.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ configure: true, n: compteur, limite: 490000 }) }); return true; }
  if (u.endsWith('/azure')) { const c = JSON.parse(r.postData() || '{}'); azure.push({ text: String(c.text), t: Date.now() }); compteur += String(c.text).length; await r.respond({ status: 200, headers: { ...CORS, 'content-type': 'audio/wav', 'X-Rayle-Voix': 'azure/azure-vivienne', 'X-Rayle-Cache': 'miss', 'X-Rayle-Chars': String(compteur), 'X-Rayle-Chars-Limite': '490000' }, body: wav(Math.max(1.5, String(c.text).length / (14.5 * ACCEL))) }); return true; }
  await r.respond({ status: 404, headers: CORS, body: '{}' }); return true;
} }), { p, verif, attendre, fin } = T;
await p.evaluate(() => {
  window.__ss = 0; try { const o = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = u => { window.__ss++; return o(u); }; } catch (e) { /* */ }
  window.__sons = new Set(); window.__maxSons = 0; const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { const el = this; if (!el.__esp) { el.__esp = 1; el.addEventListener('playing', () => { window.__sons.add(el); window.__maxSons = Math.max(window.__maxSons, window.__sons.size); }); ['ended', 'pause', 'emptied'].forEach(e => el.addEventListener(e, () => window.__sons.delete(el))); } return play.apply(this, arguments); };
});
await attendre(() => p.evaluate(() => !!window.LecteurRapports && typeof speak === 'function' && !!window.VoixMoteurs), 60000, 500); await p.evaluate(() => VoixMoteurs.rafraichirAzure()); await w(1500);
verif(await p.evaluate(() => VoixMoteurs.choisi() === 'azure-vivienne'), 'voix : Vivienne (Azure) choisie');
/* suivi de la synchronisation : à chaque nouvelle entrée du journal, on note la fraction du son déjà jouée */
await p.evaluate(() => { window.__sync = []; let n = 0; setInterval(() => { try { const J = window.LecteurRapports.journal(); while (n < J.length) { const x = J[n++]; if (x.k != null) window.__sync.push({ id: x.id, k: x.k, f: audioEl.duration > 0 ? +(audioEl.currentTime / audioEl.duration).toFixed(2) : null, t: x.t, paused: audioEl.paused }); } } catch (e) { /* */ } }, 40); });
const rep = await p.evaluate(async () => await Application.commande('Rayle, rapport COT sur l’or')); verif(/Je prépare le rapport COT/.test(rep), 'demande vocale : « ' + rep + ' »');
await p.evaluate(() => { addLine('ray', 'Je prépare le rapport COT sur l’or.'); speak('Je prépare le rapport COT sur l’or.'); });
const joue = () => p.evaluate(() => !audioEl.paused && audioEl.currentTime > 0.3);
verif(await attendre(joue, 120000, 200), 'le son de la première étape démarre (lecteur audio réel)');
const bloc = await p.evaluate(() => (document.querySelector('#lr-barre .lr-chap') || {}).textContent); console.log('étape en cours :', bloc);
/* pause : le son s'arrête vraiment, la position est gardée */
await w(1500); const avant = await p.evaluate(() => ({ t: audioEl.currentTime, d: audioEl.duration }));
verif(await p.evaluate(() => Application.commande('Rayle, pause')) === '✔', '« pause » traité'); await w(300);
const p1 = await p.evaluate(() => ({ paused: audioEl.paused, t: audioEl.currentTime })); await w(1800); const p2 = await p.evaluate(() => ({ paused: audioEl.paused, t: audioEl.currentTime, sons: window.__sons.size }));
verif(p1.paused && p2.paused && Math.abs(p2.t - p1.t) < 0.05 && p2.sons === 0, 'pause : le son est réellement arrêté, position gardée (' + p1.t.toFixed(2) + ' s → ' + p2.t.toFixed(2) + ' s)');
const nSync = await p.evaluate(() => window.__sync.length); await w(1500); verif(await p.evaluate(n => window.__sync.length === n, nSync), 'pause : aucune animation ne se déclenche');
verif(await p.evaluate(() => Application.commande('reprends')) === '✔', '« reprends » traité'); await w(600);
const r1 = await p.evaluate(() => ({ paused: audioEl.paused, t: audioEl.currentTime }));
verif(!r1.paused && r1.t >= p2.t - 0.05 && r1.t < p2.t + 1.5, 'reprise : le son continue au même endroit (' + p2.t.toFixed(2) + ' s → ' + r1.t.toFixed(2) + ' s), il ne recommence pas');
/* une question pendant le rapport : le rapport attend, la réponse passe, « reprends » relit l'étape */
const nAz = azure.length; const chap0 = await p.evaluate(() => (document.querySelector('#lr-barre .lr-chap') || {}).textContent);
const retour = await p.evaluate(async () => await Application.commande('quelle heure est-il')); verif(retour === null || retour === undefined, 'la question n’est pas avalée par le lecteur (elle passe au cerveau)');
await w(200); verif(await p.evaluate(() => LecteurRapports.etat().pause), 'la question met le rapport en attente');
await p.evaluate(() => { addLine('ray', 'Il est quatorze heures.'); speak('Il est quatorze heures.'); }); await attendre(() => p.evaluate(() => audioEl.paused || audioEl.ended), 20000, 200); await w(2500);
verif(await p.evaluate(() => LecteurRapports.etat().pause) && await p.evaluate(() => (document.querySelector('#lr-barre .lr-sous') || {}).textContent.includes('reprends')), 'pendant l’attente : la barre dit « reprends »');
verif(await p.evaluate(() => Application.commande('reprends')) === '✔', '« reprends » après la réponse'); verif(await attendre(joue, 20000, 200), 'l’étape interrompue est relue');
verif(await p.evaluate(c => (document.querySelector('#lr-barre .lr-chap') || {}).textContent === c, chap0), 'même étape (« ' + chap0 + ' »)');
/* synchronisation : au moment où chaque phrase s'allume, la fraction jouée du son colle à la position de la phrase */
await attendre(() => p.evaluate(() => { const b = document.getElementById('lr-barre'); return b && b.classList.contains('fini'); }), 400000, 2000);
const S = await p.evaluate(() => window.__sync), parEtape = {}; for (const x of S) (parEtape[x.id] = parEtape[x.id] || []).push(x);
const croissantes = Object.values(parEtape).every(L => L.filter(x => x.f != null && !x.paused).every((x, i, A) => i === 0 || x.f >= A[i - 1].f - 0.2 || x.f < 0.2));
console.log('synchronisation :', Object.entries(parEtape).map(([id, L]) => id + '[' + L.map(x => x.k + '@' + (x.f == null ? '?' : x.f)).join(' ') + ']').join(' '));
verif(S.length >= 10 && croissantes, 'les phrases s’allument au fil du son (fraction jouée croissante), ' + S.length + ' mises en avant');
const lues = azure.map(a => a.text); verif(new Set(lues).size === lues.length, 'Azure : jamais deux fois le même texte (' + lues.length + ' requêtes pour 6 étapes + les phrases parlées)');
const stepTexts = lues.filter(t => !/^(Je prépare|Il est)/.test(t)); verif(stepTexts.length >= 6 && stepTexts.length <= 8, 'Azure : une requête par étape du rapport COT (' + stepTexts.length + ')');
verif(await p.evaluate(() => window.__ss === 0), 'aucun appel à speechSynthesis'); verif(await p.evaluate(() => window.__maxSons <= 1), 'jamais deux sons en même temps (max ' + await p.evaluate(() => window.__maxSons) + ')');
const d = await p.evaluate(() => LecteurRapports.dernier()); console.log('blancs (ms) :', d.ecarts.join(', '), '· caractères lus :', d.caracteres, '· compteur Azure simulé :', compteur);
verif(d.ecarts.length >= 4 && Math.max(...d.ecarts) <= 2500, 'avec la vraie voix : blancs entre étapes ≤ 2,5 s (max ' + Math.max(...d.ecarts) + ' ms ; l’attente de la synthèse Azure y est comprise)');
await T.capture('rapport-voix-fin'); await fin();
