/* Test d'indépendance du PC : la page est servie sous un nom d'hôte NON local (comme GitHub Pages), les snapshots viennent d'un serveur de fichiers séparé,
   puis le réseau est coupé. Chaque onglet du terminal doit afficher des données ou « hors ligne : dernière donnée du … », jamais d'erreur brute ni d'écran vide.
   Prérequis : node serveur.mjs 8000 ; node outils-donnees/serveur-snapshots.mjs <dossier de snapshots> 8801
   Usage : node tests-navigateur/independance-pc-test.mjs [tel|tablette] ; sortie : captures dans outils-restructuration/captures-mobile-autonome/ */
import { createRequire } from 'node:module'; import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const mode = process.argv[2] || 'tel', HOTE = 'http://rayle.test:8000';
const w = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0; const echecs = []; const verif = (c, m) => { if (c) ok++; else { ko++; echecs.push(m); console.log('  ✗ ' + m); } };
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--host-resolver-rules=MAP rayle.test 127.0.0.1'] });
const p = await nav.newPage();
await p.setUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36');
if (mode === 'tablette') await p.setViewport({ width: 1024, height: 768, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); else await p.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.setRequestInterception(true);
p.on('request', async r => {
  const u = r.url(); if (/^(http:\/\/rayle\.test|http:\/\/127\.0\.0\.1|data:|blob:)/.test(u) || r.method() !== 'GET') return r.continue();
  if (reseauCoupe) return r.abort('internetdisconnected');
  try { const x = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0', origin: 'https://justinmaneiro-alt.github.io' }, signal: AbortSignal.timeout(15000) }); const buf = Buffer.from(await x.arrayBuffer());
    r.respond({ status: x.status, headers: { 'access-control-allow-origin': '*', 'content-type': x.headers.get('content-type') || 'application/octet-stream' }, body: buf }); } catch (e) { r.abort('failed'); }
});
let reseauCoupe = false;
const erreursConsole = []; p.on('pageerror', e => erreursConsole.push('PAGEERR ' + e.message.slice(0, 140)));
await p.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_donnees_base', 'http://127.0.0.1:8801/'); localStorage.setItem('rayle_m_sw', '0'); } catch (e) { /* */ } });
await p.goto(HOTE + '/index.html', { waitUntil: 'domcontentloaded' }); await w(3500);
await p.evaluate(() => window.Application.ouvrir('terminal'));
let F = null; for (let i = 0; i < 100; i++) { F = p.frames().find(f => /or\.html/.test(f.url())); if (F && await F.evaluate(() => !!document.querySelector('.esp-barre,[data-esp]')).catch(() => false)) break; await w(250); }
verif(!!F, 'cadre du terminal chargé');
const onglets = [['Marchés', 'marches'], ['Actualités', 'actualites'], ['COT', 'cot'], ['Santé du marché', 'sante'], ['Institutions', 'institutions'], ['Calendrier', 'calendrier'], ['Journal', 'journal'], ['Capital', 'capital']];
const texte = async () => (await F.evaluate(() => (document.querySelector('.esp-zone:not([hidden]):not(:empty)') || document.body).innerText.slice(0, 1500))).replace(/\s+/g, ' ');
const BRUT = /HTTP \d{3}|le serveur du PC ne répond|relance l.application|route \/__|Failed to fetch|undefined|\[object/i;
async function passe(etiq, attente = 6000) {
  for (const [nom, cle] of onglets) {
    const clic = await F.evaluate(k => { const b = document.querySelector('.esp-barre [data-espace="' + k + '"]'); if (b) { b.click(); return true; } return false; }, cle);
    if (!clic) { verif(false, `${etiq} : bouton « ${nom} » introuvable`); continue; }
    await w(attente); const t = await texte();
    verif(t.length > 40, `${etiq} · ${nom} : contenu non vide (${t.length} car.)`); verif(!BRUT.test(t), `${etiq} · ${nom} : aucune erreur brute (${(() => { const m = t.match(BRUT); return m ? t.slice(Math.max(0, m.index - 40), m.index + 30) : ''; })()})`);
    verif(!/Données indisponibles : HTTP/.test(t), `${etiq} · ${nom} : pas de « Données indisponibles : HTTP »`);
    if (process.env.CAPTURES) await p.screenshot({ path: `outils-restructuration/captures-mobile-autonome/${etiq}-${mode}-${nom.replace(/\W+/g, '_')}.png` });
    console.log(`  ${etiq} · ${nom} : ${t.slice(0, 110)}`);
  }
}
console.log('— PC arrêté, réseau actif (snapshots) —'); await passe('reseau');
console.log('— réseau coupé après un premier chargement : copies locales, page rechargée —');
reseauCoupe = true;
await p.goto(HOTE + '/index.html', { waitUntil: 'domcontentloaded' }); await w(3500);
await p.evaluate(() => window.Application.ouvrir('terminal'));
for (let i = 0; i < 100; i++) { F = p.frames().find(f => /or.html/.test(f.url())); if (F && await F.evaluate(() => !!document.querySelector('.esp-barre')).catch(() => false)) break; await w(250); }
await passe('horsligne', 5000);
const pagesHL = ['Actualités', 'COT', 'Santé du marché', 'Institutions', 'Calendrier'];
for (const nom of pagesHL) { const cle = onglets.find(o => o[0] === nom)[1]; await F.evaluate(k => document.querySelector('.esp-barre [data-espace="' + k + '"]').click(), cle); await w(1500); const t = await texte(); verif(/hors ligne : dernière donnée du|copie locale du/.test(t), 'hors ligne · ' + nom + ' : badge de copie locale datée ou « hors ligne : dernière donnée du … »'); }
console.log(`résultat : ${ok} vérifications, ${ko} échec(s)`); if (erreursConsole.length) console.log('erreurs de page :', erreursConsole.slice(0, 5).join(' | '));
await nav.close(); process.exit(ko ? 1 : 0);
