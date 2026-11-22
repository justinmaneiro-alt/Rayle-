/* v9 phase 5 : mode avion. Premier lancement EN LIGNE : Piper télécharge sa voix (une seule fois) et parle. Second lancement dans un NOUVEAU navigateur (même profil) où TOUT réseau extérieur est coupé
   (seule la page locale passe, comme une application déjà installée) : Piper doit parler sans aucune requête externe, et Azure indisponible ne doit rien changer.
   Prérequis : node serveur.mjs 8000. Usage : node trader-pro/tests/piper-avion-chrome.mjs [tablette|tel] */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs'; import os from 'node:os';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const mode = process.argv[2] || 'tablette', w = ms => new Promise(r => setTimeout(r, ms));
const VUES = { tel: { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, tablette: { width: 1024, height: 768, deviceScaleFactor: 1, isMobile: true, hasTouch: true } };
const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-avion-')); let ok = 0, ko = 0; const verif = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
async function session(avion) {
  const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: profil, args: ['--no-sandbox', '--host-resolver-rules=MAP rayle.test 127.0.0.1'] });
  const p = await nav.newPage(); await p.setViewport(VUES[mode]); const externes = [];
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_m_sw', '0'); localStorage.setItem('rayle_piper_precharge', '0'); localStorage.setItem('rayle_voix_gemini_v1', JSON.stringify({ moteur: 'piper-siwis', ton: 'naturel', vitesse: 0 })); localStorage.setItem('rayle_voix_v9', '1'); } catch (e) { /* */ } });
  await p.setRequestInterception(true);
  p.on('request', r => { const u = r.url(); if (/^(https?:\/\/rayle\.test:8000|data:|blob:)/.test(u)) return r.continue(); if (/^https?:/.test(u)) { externes.push(u); if (avion) return r.abort('internetdisconnected'); } r.continue(); });
  await p.goto('http://127.0.0.1:8000/index.html', { waitUntil: 'domcontentloaded', timeout: 120000 }); await w(3000);
  return { nav, p, externes };
}
const dire = (p, t) => p.evaluate(async t => { const t0 = performance.now(); try { const a = await PiperLocal.synth('piper-siwis', t, {}); return { ok: true, octets: a.blob.size, ms: Math.round(performance.now() - t0) }; } catch (e) { return { ok: false, erreur: String(e.message || e) }; } }, t);
console.log('1/2 en ligne : téléchargement de la voix Piper, une seule fois…');
{ const { nav, p, externes } = await session(false);
  const e = await p.evaluate(async () => { try { await PiperLocal.charger('piper-siwis'); return PiperLocal.etat('piper-siwis'); } catch (e) { return { erreur: String(e.message || e) }; } });
  verif(e.etat === 'prete', 'voix téléchargée et prête : ' + JSON.stringify(e)); verif(externes.some(u => /huggingface|hf\.co/.test(u)), 'le modèle vient du dépôt officiel Piper (Hugging Face)');
  const r = await dire(p, 'Bonjour, je suis Rayle.'); verif(r.ok && r.octets > 20000, 'en ligne : Piper parle ' + JSON.stringify(r));
  console.log('DIAG', JSON.stringify(await p.evaluate(async () => { const c = await caches.open('rayle-piper-v1'); const ks = await c.keys(); const est = await navigator.storage.estimate(); return { diag: PiperLocal.diag(), cles: ks.map(k => k.url.split('/').pop()), usage: est.usage, quota: est.quota }; }))); await nav.close(); }
console.log('2/2 mode avion (réseau extérieur coupé, nouveau navigateur) : Piper doit parler…');
{ const { nav, p, externes } = await session(true);
  console.log('DIAG2', JSON.stringify(await p.evaluate(async () => { const n = await caches.keys(); const c = await caches.open('rayle-piper-v1'); return { caches: n, cles: (await c.keys()).map(k => k.url.split('/').pop()) }; })));
  const r = await dire(p, 'Je parle sans aucun réseau.'); console.log(JSON.stringify(r)); verif(r.ok && r.octets > 20000, 'mode avion : Piper parle avec la voix gardée dans le cache de l’appareil');
  verif(externes.length === 0 || externes.every(u => !/huggingface|hf\.co/.test(u)), 'mode avion : aucune requête vers Hugging Face (' + externes.filter(u => /huggingface|hf\.co/.test(u)).length + ')');
  /* une réponse complète passe par speak() : voix Piper, aucune voix du système */
  const s = await p.evaluate(async () => { window.__ss = 0; try { const o = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = u => { window.__ss++; return o(u); }; } catch (e) { /* */ } let lu = ''; const el = document.getElementById('voiceName'); await speak('Réponse lue hors ligne.'); lu = el.textContent; return { lu, ss: window.__ss }; });
  verif(/Siwis.*Piper/.test(s.lu) && s.ss === 0, 'mode avion : réponse lue par Piper (Siwis), sans voix du système : ' + JSON.stringify(s));
  await nav.close(); }
fs.rmSync(profil, { recursive: true, force: true });
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tout passe (${ok})`); process.exit(ko ? 1 : 0);
