/* Test Chrome des tuiles indépendantes Musique et Télé (hors de la page de l'or), avec le vrai lecteur YouTube :
   tuiles sur l'accueil Aurore et Jarvis (PC), fenêtres avec leurs commandes, voix depuis n'importe quel écran sans ouvrir la page de l'or
   (« lance ma playlist », « pause », « suivant »), phrases ambiguës laissées aux autres écrans, accès depuis Mars (fenêtre « ◈ » et terminal).
   Prérequis : node serveur.mjs 8011 (racine du dépôt).  Usage : node agent-trading/tests/media-chrome-test.mjs  (captures dans captures-or/) */
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json'));
const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011', SORTIE = path.resolve('captures-or'); fs.mkdirSync(SORTIE, { recursive: true });
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
let nOk = 0; const echecs = [], erreurs = [];
const verifier = (c, m, d = '') => { if (c) { nOk++; console.log('OK ', m); } else { echecs.push(m); console.log('ÉCHEC', m, d); } };
const w = ms => new Promise(r => setTimeout(r, ms));
async function accueil(theme, l = 1600, h = 900) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, deviceScaleFactor: 1 });
  p.on('pageerror', e => erreurs.push(`${theme} : ${e.message}`));
  await p.evaluateOnNewDocument(t => {
    if (t) localStorage.setItem('rayle_theme', t); else localStorage.removeItem('rayle_theme');
    localStorage.setItem('rayle_musique_fixe', JSON.stringify([{ id: '5Xq5Up-6bSg', titre: null }, { id: 'jfKfPfyJRdk', titre: null }]));
  }, theme);
  await p.goto(BASE + '/index.html?appareil=pc', { waitUntil: 'load' }); await w(4000);
  return p;
}

/* ── accueil Aurore (thème par défaut) ── */
const a = await accueil(null);
const t0 = await a.evaluate(() => { const n = document.getElementById('mdTuiles'), r = n && n.getBoundingClientRect(); return { ok: !!window.RayleMedia, vis: !!n && !n.hidden && r.width > 0, n: n ? n.querySelectorAll('button').length : 0, or: !!window.TableauOr }; });
verifier(t0.ok && t0.vis && t0.n === 2, 'accueil Aurore : tuiles ♪ Musique et 📺 Télé visibles', JSON.stringify(t0));
verifier(!t0.or, 'la page de l’or n’est pas ouverte');
await a.click('#mdTuiles [data-md="musique"]'); await w(1200);
const f1 = await a.evaluate(() => { const b = [...document.querySelectorAll('.at-pc')].find(x => /MUSIQUE/.test(x.textContent)); return b && { vis: !b.hidden, pl: !!b.querySelector('[data-m="playlist"]'), n: b.querySelector('[data-m-n]').textContent, tc: !!b.querySelector('[data-tc-form]'), graphe: !!b.querySelector('[data-graph]') }; });
verifier(f1 && f1.vis && f1.pl && !f1.graphe && !f1.tc, 'tuile Musique : fenêtre indépendante avec ses commandes (sans graphique de l’or)', JSON.stringify(f1));
verifier(f1 && f1.n === '2 morceaux', 'accord : « 2 morceaux »', f1 && f1.n);
await a.screenshot({ path: path.join(SORTIE, 'tuile-musique-pc.png') });
// voix depuis l'accueil, sans la page de l'or : le vrai chemin de Rayle (respond → RayleMedia)
const dire = t => a.evaluate(async x => { const r = await window.RayleMedia.commande(x); return r; }, t);
const v1 = await dire('Raylé, lance ma playlist'); await w(6000);
const etatP = () => a.evaluate(async () => { const M = await import('/agent-trading/front/or/media-rayle.js'), p = M.lecteur().lecteur(); return p && p.getPlayerState ? p.getPlayerState() : null; });
verifier(/lance ta playlist, 2 morceaux/.test(v1 || ''), '« lance ma playlist » depuis l’accueil', v1);
verifier([1, 3].includes(await etatP()), 'la playlist joue (lecteur YouTube officiel)', await etatP());
verifier(/^Pause/.test(await dire('pause') || ''), '« pause » depuis l’accueil'); await w(800);
verifier(await etatP() === 2, 'lecteur en pause');
verifier(/suivant/i.test(await dire('suivant') || ''), '« suivant » depuis l’accueil');
verifier(await dire('qu’est-ce qui se passe à Paris') === null, '« qu’est-ce qui se passe » n’est pas pris pour « passe au suivant »');
verifier(await dire('image suivante') === null && await dire('monte à bord') === null, 'phrases des autres écrans laissées aux autres écrans');
const rep = await a.evaluate(() => typeof respond === 'function');
if (rep) { await w(5000); await a.evaluate(() => { window.__lignes = []; const av = window.addLine; window.addLine = (q, t) => { window.__lignes.push(t); return av && av(q, t); }; respond('mets en pause la musique'); }); await w(2500); const L = await a.evaluate(() => window.__lignes), e = await etatP(); verifier(L.includes('Pause.') && e !== 1, 'chemin complet de Rayle (respond) : « mets en pause la musique » → Pause', JSON.stringify(L) + ' état ' + e); }
await a.evaluate(() => { const b = [...document.querySelectorAll('.at-pc')].find(x => /MUSIQUE/.test(x.textContent)); b.querySelector('[data-a="fermer"]').click(); });
await w(400);
verifier(await a.evaluate(() => [...document.querySelectorAll('.at-pc')].find(x => /MUSIQUE/.test(x.textContent)).hidden), 'fermer la tuile Musique la cache sans couper le lecteur');
const v2 = await dire('ouvre la télé'); await w(800);
const f2 = await a.evaluate(() => { const b = [...document.querySelectorAll('.at-pc')].find(x => /TÉLÉ/.test(x.querySelector('.at-pc-barre').textContent)); return b && { vis: !b.hidden, code: !!b.querySelector('[data-tc-code]'), lien: !!b.querySelector('a[href*="/tv/"]') }; });
verifier(/télé/.test(v2 || '') && f2 && f2.vis && f2.code && f2.lien, '« ouvre la télé » : tuile Télé (code de la télé, lien vers /tv)', JSON.stringify(f2));
await a.screenshot({ path: path.join(SORTIE, 'tuile-tele-pc.png') });
await dire('arrête la musique'); await a.close();

/* ── accueil Jarvis ── */
const j = await accueil('jarvis');
const tj = await j.evaluate(() => { const n = document.getElementById('mdTuiles'), r = n && n.getBoundingClientRect(); return { vis: !!n && !n.hidden && r.width > 0, bas: r && r.bottom <= innerHeight }; });
verifier(tj.vis && tj.bas, 'accueil Jarvis : tuiles visibles', JSON.stringify(tj));
await j.click('#mdTuiles [data-md="tele"]'); await w(800);
verifier(await j.evaluate(() => !![...document.querySelectorAll('.at-pc')].find(x => !x.hidden && /TÉLÉ/.test(x.textContent))), 'Jarvis : la tuile Télé s’ouvre');
await j.screenshot({ path: path.join(SORTIE, 'tuile-tele-jarvis.png') });
await j.close();

/* ── Mars : la fenêtre « ◈ » donne accès aux tuiles ── */
const m = await accueil(null);
await m.evaluate(async () => { const f = await import('/agent-trading/front/fenetre-agent.js'); f.ouvrirFenetre(); }); await w(3000);
await m.click('.at-pc-barre [data-a="musique"]'); await w(800);
const fm = await m.evaluate(() => ({ mu: !![...document.querySelectorAll('.at-pc')].find(x => !x.hidden && /MUSIQUE/.test(x.querySelector('.at-pc-barre').textContent)), dansOr: !!document.querySelector('.tor:not(.md-tuile) [data-m="playlist"]') }));
verifier(fm.mu && !fm.dansOr, 'fenêtre « ◈ » : ♪ ouvre la tuile Musique, rien dans la page de l’or', JSON.stringify(fm));
await m.screenshot({ path: path.join(SORTIE, 'mars-fenetre-tuile.png') });
await m.close();

/* ── téléphone : tuile plein écran ── */
const tel = await nav.newPage(); await tel.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await tel.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' }); await w(3000);
await tel.evaluate(async () => { const M = await import('/agent-trading/front/or/media-rayle.js'); M.ouvrir('musique'); }); await w(800);
const ft = await tel.evaluate(() => { const b = [...document.querySelectorAll('.at-pc')].find(x => !x.hidden); const r = b.getBoundingClientRect(); return { l: r.width, ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
verifier(ft.l <= 390 && ft.ovf <= 0, 'téléphone : tuile Musique en plein écran, sans débordement', JSON.stringify(ft));
await tel.screenshot({ path: path.join(SORTIE, 'tuile-musique-telephone.png') });
await tel.close();

/* ── téléphone : menu « Plus » de la coque mobile → tuile Musique ── */
const tm = await nav.newPage(); await tm.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await tm.setUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
await tm.evaluateOnNewDocument(() => { localStorage.setItem('rayle_m_sw', '0'); });
await tm.goto(BASE + '/index.html?appareil=telephone', { waitUntil: 'load' }); await w(4000);
await tm.evaluate(() => window.MobileCoque && MobileCoque.aller('plus')); await w(800);
const plus = await tm.evaluate(() => { const b = document.querySelector('.m-tuile[data-id="musique"]'), t = document.querySelector('.m-tuile[data-id="tele"]'); if (b) b.click(); return !!b && !!t; }); await w(1200);
const tmu = await tm.evaluate(() => !![...document.querySelectorAll('.at-pc')].find(x => !x.hidden && /MUSIQUE/.test(x.textContent)));
verifier(plus && tmu, 'téléphone : menu « Plus » → tuiles Musique et Télé ; Musique s’ouvre', JSON.stringify({ plus, tmu }));
await tm.screenshot({ path: path.join(SORTIE, 'tuile-musique-menu-plus-telephone.png') }); await tm.close();

verifier(!erreurs.length, 'aucune erreur de page', erreurs.slice(0, 5).join(' | '));
await nav.close();
console.log(`\n${nOk} réussis, ${echecs.length} échecs`); process.exit(echecs.length ? 1 : 0);
