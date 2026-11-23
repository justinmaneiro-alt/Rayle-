/* v12, phase 5 : un rapport en vrai (vraies données de production, vraie voix de l'appli, Azure simulé, Piper simulé pour le DÉTECTER).
   Vérifie : Vivienne (Azure) du début à la fin (Piper n'a jamais parlé, l'indicateur dit « Vivienne · Azure » à chaque échantillon) ; narration explicative : au plus deux chiffres PARLÉS par étape ;
   plus de case de texte qui recopie la réponse (ni #ra-panneau .ra-texte, ni le coin de la petite Rayle, ni aucun élément visible portant le texte dit).
   Usage : node trader-pro/tests/rapports-v12-chrome.mjs [tablette|tel|pc] [complet|cot|marche|macro] [actif]   (prérequis : node serveur.mjs 8000 ; réseau) */
import { lancer, w } from './aide-chrome.mjs';
import { compterChiffres } from './rapports-textes.mjs';
const mode = process.argv[2] || 'tablette', type = process.argv[3] || 'complet', actif = process.argv[4] || 'or';
const DEMANDE = { complet: { or: 'Rayle, rapport complet sur l’or', us100: 'Rayle, rapport complet sur le Nasdaq' }, cot: { or: 'Rayle, rapport COT sur l’or', us100: 'Rayle, rapport COT sur le Nasdaq' }, marche: { _: 'Rayle, rapport sur le marché' }, macro: { _: 'Rayle, quelles annonces cette semaine' } };
const phrase = (DEMANDE[type] || {})[actif] || (DEMANDE[type] || {})._;
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const wav = secondes => { const n = Math.round(8000 * secondes), pcm = Buffer.alloc(n * 2); for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(3000 * Math.sin(i / 8)), i * 2); return Buffer.concat([Buffer.from('RIFF'), u32(36 + pcm.length), Buffer.from('WAVEfmt '), Buffer.from([16, 0, 0, 0, 1, 0, 1, 0]), u32(8000), u32(16000), Buffer.from([2, 0, 16, 0]), Buffer.from('data'), u32(pcm.length), pcm]); };
const azure = [], CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'X-Rayle-Voix, X-Rayle-Cache, X-Rayle-Chars, X-Rayle-Chars-Limite' }; let compteur = 1000;
const ACCEL = 3;   // le son simulé dure 3 fois moins longtemps qu'une vraie voix
const T = await lancer(mode, { dossierCaptures: 'donnees-privees/captures-v12', vraiNavigateur: true, stockage: { rayle_donnees_base: '', rayle_worker_url: 'https://faux-worker.test', rayle_worker_token: 'jeton', rayle_piper_precharge: '0', rayle_pf_dernier_import: String(Date.now()) }, interception: async (r, u) => {
  if (!u.startsWith('https://faux-worker.test/') && !u.includes('rayle-voix')) return false;
  if (r.method() === 'OPTIONS') { await r.respond({ status: 204, headers: { ...CORS, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' } }); return true; }
  if (u.endsWith('/sante')) { await r.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, azure: { cle: true, region: true, compteur: true } }) }); return true; }
  if (u.endsWith('/azure/quota')) { await r.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ configure: true, n: compteur, limite: 490000 }) }); return true; }
  if (u.endsWith('/azure')) { const c = JSON.parse(r.postData() || '{}'); azure.push({ text: String(c.text), t: Date.now() }); compteur += String(c.text).length; await r.respond({ status: 200, headers: { ...CORS, 'content-type': 'audio/wav', 'X-Rayle-Voix': 'azure/azure-vivienne', 'X-Rayle-Cache': 'miss', 'X-Rayle-Chars': String(compteur), 'X-Rayle-Chars-Limite': '490000' }, body: wav(Math.max(1.2, String(c.text).length / 14.5 / ACCEL)) }); return true; }
  await r.respond({ status: 404, headers: CORS, body: '{}' }); return true;
} }), { p, verif, attendre, capture, fin } = T;
await attendre(() => p.evaluate(() => !!window.LecteurRapports && typeof speak === 'function' && !!window.VoixMoteurs), 60000, 500);
await p.evaluate(() => {
  window.__ss = 0; try { const o = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = u => { window.__ss++; return o(u); }; } catch (e) { /* */ }
  window.__piper = []; const o = VoixMoteurs.synth; VoixMoteurs.synth = async (id, texte, opts) => { if (String(id).startsWith('piper')) window.__piper.push(texte); return o(id, texte, opts); };
  /* les textes BRUTS passés à speak() (avant la mise en toutes lettres des nombres, qui rendrait le comptage des chiffres vain) */
  window.__dits = []; const spk = window.speak; window.speak = function (t, o2) { try { window.__dits.push(String(t)); } catch (e) { /* */ } return spk.call(this, t, o2); };
  window.__pastilles = []; window.__cases = [];
  setInterval(() => { try { const e = document.getElementById('rayle-voix-pastille'); if (e && e.style.opacity === '1' && e.textContent) window.__pastilles.push(e.textContent + '|' + e.dataset.mode); const ra = document.querySelector('#ra-panneau'); if (ra && !ra.hidden && ra.querySelector('.ra-texte')) window.__cases.push('ra-texte'); const md = document.getElementById('miniDit'); if (md && md.textContent && !/^VOUS/.test(md.textContent)) window.__cases.push('miniDit:' + md.textContent.slice(0, 40)); } catch (x) { /* */ } }, 400);
});
await p.evaluate(() => VoixMoteurs.rafraichirAzure()); await w(1500);
verif(await p.evaluate(() => VoixMoteurs.choisi() === 'azure-vivienne'), 'voix choisie : Vivienne (Azure)');
const rep = await p.evaluate(async q => await Application.commande(q), phrase); verif(/pr[ée]pare/i.test(String(rep)), 'demande vocale : « ' + rep + ' »');
await p.evaluate(r => { addLine('ray', r); speak(r); }, rep);
/* échantillonne le DOM pendant le rapport : un texte dit ne doit apparaître dans aucun élément visible (hors journal technique) */
let trouve = [], vus = 0;
const fini = () => p.evaluate(() => { const b = document.getElementById('lr-barre'); return !!(b && b.classList.contains('fini')); });
const t0 = Date.now(); let derniereCapture = 0;
while (Date.now() - t0 < 900000 && !(await fini())) {
  const dits = (await p.evaluate(() => window.__dits.slice(-2)));
  for (const d of dits) { const cle = d.replace(/\s+/g, ' ').slice(0, 38); if (cle.length < 25) continue; const hit = await p.evaluate(c => { const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) { if (!n.nodeValue || !n.nodeValue.replace(/\s+/g, ' ').includes(c)) continue; const el = n.parentElement; if (!el || el.closest('#log, script, style, #lr-historique')) continue; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); if (r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0') return el.id || el.className || el.tagName; } return null; }, cle); vus++; if (hit) trouve.push(hit + ' : ' + cle); }
  if (Date.now() - derniereCapture > 60000) { derniereCapture = Date.now(); await capture('v12-' + type + '-' + (azure.length)); }
  await w(1500);
}
verif(await fini(), 'le rapport va jusqu’au bout (' + azure.length + ' requêtes de voix)');
const R = await p.evaluate(() => ({ piper: window.__piper, pastilles: [...new Set(window.__pastilles)], cases: [...new Set(window.__cases)], ss: window.__ss, dernier: window.LecteurRapports.dernier() }));
verif(R.piper.length === 0, 'Vivienne (Azure) du début à la fin : Piper n’a jamais parlé (' + R.piper.length + ')');
verif(R.pastilles.length > 0 && R.pastilles.every(x => x === 'Vivienne · Azure|principale'), 'indicateur : toujours « Vivienne · Azure » (' + R.pastilles.join(' ; ') + ')');
verif(R.ss === 0, 'jamais speechSynthesis');
const brut = await p.evaluate(() => window.__dits), lues = brut.filter(t => !/^(Je prépare|Je lance|Voici)/.test(t)), par = lues.map(t => ({ t, n: compterChiffres(t) }));
console.log('  requêtes de voix :', azure.length, '· prises de parole :', brut.length, '· caractères :', lues.reduce((s, t) => s + t.length, 0), '· chiffres par prise de parole :', par.map(x => x.n).join(','));
console.log('  exemple :', (lues[2] || lues[0] || '').slice(0, 260));
verif(par.every(x => x.n <= 2), 'narration explicative : au plus deux chiffres parlés par étape (max ' + Math.max(...par.map(x => x.n)) + ')');
verif(lues.every(t => !/ATR|A\.T\.R\.|percentile|contrats nets|fois la moyenne/.test(t)), 'narration : pas de jargon récité');
verif(R.cases.length === 0, 'aucune case de texte ne recopie la réponse (#ra-panneau .ra-texte, coin de la petite Rayle) : ' + (R.cases.join(' ; ') || 'aucune'));
verif(trouve.length === 0, 'aucun élément visible ne porte le texte dit (' + vus + ' contrôles) : ' + (trouve.slice(0, 3).join(' ; ') || 'aucun'));
console.log('  blancs entre étapes (ms) :', (R.dernier.ecarts || []).join(', '));
await capture('v12-' + type + '-fin'); await fin();
