/* Test Chrome de la fenêtre Portefeuille avec le VRAI fichier XTB (s'il existe) et un faux Worker (logique réelle + SQLite) branché sur https://pf.test.
   Usage : node trader-pro/tests/portefeuille-chrome.mjs [tel|tablette|pc] */
import fs from 'node:fs'; import path from 'node:path'; import { DatabaseSync } from 'node:sqlite';
import { lancer, w } from './aide-chrome.mjs';
import { traiter } from '../worker/src/coeur.js'; import { depotD1, d1DepuisSqlite } from '../worker/src/depot-d1.js';
const mode = process.argv[2] || 'tel', CODE = 'code-de-test-123456';
let zip = null; try { zip = fs.readdirSync('donnees-privees').filter(f => /^\d+_.*\.zip$/.test(f)).map(f => path.join('donnees-privees', f))[0]; } catch (e) { /* */ }
if (!zip) { console.log('Pas de fichier XTB dans donnees-privees/ : test ignoré.'); process.exit(0); }
const depot = depotD1(d1DepuisSqlite(new DatabaseSync(':memory:'))), env = { PORTEFEUILLE_CODE: CODE, ORIGINES: 'http://rayle.test:8000' };
const interception = async (r, u) => {
  if (!u.startsWith('https://pf.test')) return false;
  const rep = await traiter(new Request(u, { method: r.method() === 'OPTIONS' ? 'OPTIONS' : r.method(), headers: r.headers(), body: ['GET', 'HEAD', 'OPTIONS'].includes(r.method()) ? undefined : r.postData() }), env, depot);
  r.respond({ status: rep.status, headers: Object.fromEntries(rep.headers), body: Buffer.from(await rep.arrayBuffer()) }); return true;
};
const T = await lancer(mode, { interception, stockage: { rayle_pf_conn_v1: { url: 'https://pf.test', code: CODE } } }), { p, verif, attendre, texte, capture } = T;
const zipAbs = path.resolve(zip);
await p.evaluate(() => window.Application.ouvrir('portefeuille'));
verif(await attendre(() => p.evaluate(() => !!document.querySelector('#portefeuille-fenetre .tp-nav'))), 'la fenêtre Portefeuille s’ouvre');
console.log('— premier lancement —'); verif(/Importer mon historique XTB/i.test(await texte('#portefeuille-fenetre [data-zone]')), 'invitation à importer quand rien n’est encore importé'); await capture('pf-vide');
console.log('— import du vrai fichier —');
const input = await p.$('#portefeuille-fenetre input[data-fichier]'); await input.uploadFile(zipAbs);
verif(await attendre(() => p.evaluate(() => /Import terminé/.test((document.querySelector('#portefeuille-fenetre [data-bandeau]') || {}).textContent || '')), 60000), 'import terminé');
const msg = await texte('#portefeuille-fenetre [data-bandeau]'); console.log('  ' + msg.slice(0, 260).replace(/\d+ nouvelle/, m => m)); verif(/1730 nouvelle/.test(msg) && /Total : 1730/.test(msg), 'les 1730 positions du fichier sont importées');
verif(/Synchronisé avec les autres appareils/.test(msg), 'synchronisé avec le Worker');
console.log('— vue globale —'); verif(await attendre(() => p.evaluate(() => document.querySelectorAll('#portefeuille-fenetre [data-g1] canvas').length > 0), 20000), 'courbe de capital dessinée');
const g = await texte('#portefeuille-fenetre [data-zone]'); verif(/Résultat net des positions/i.test(g) && /Facteur de profit/i.test(g) && /Drawdown maximal/i.test(g), 'chiffres clés présents'); await capture('pf-globale');
verif(await p.evaluate(() => document.documentElement.scrollWidth <= visualViewport.width + 1), 'pas de défilement horizontal de la page');
await p.evaluate(() => { document.querySelector('#portefeuille-fenetre [data-per="mois"]').click(); }); verif(await attendre(() => p.evaluate(() => !!document.querySelector('#portefeuille-fenetre [data-g3] canvas')), 15000), 'résultat par mois dessiné'); await p.evaluate(() => document.querySelector('#portefeuille-fenetre [data-per="jours"]').click()); await w(600);
verif(await p.evaluate(() => document.querySelectorAll('#portefeuille-fenetre .tp-cal b').length > 100), 'calendrier de résultats par jour'); await p.evaluate(() => { const c = document.querySelector('#portefeuille-fenetre .tp-corps'); c.scrollTop = c.scrollHeight; }); await w(400); await capture('pf-calendrier');
for (const [k, test] of [['trans', /Fermeture/i], ['actif', /Courbe de résultat/i], ['ou', /Par actif/i], ['pos', /Résultat latent|Aucune position ouverte/i], ['coach', /Note de discipline/i], ['reglages', /Synchronisation entre appareils/i]]) {
  console.log('— onglet ' + k + ' —'); await p.evaluate(k2 => document.querySelector(`#portefeuille-fenetre [data-onglet="${k2}"]`).click(), k); await w(1800);
  const t = await texte('#portefeuille-fenetre [data-zone]'); verif(test.test(t) && !/Affichage impossible/.test(t), k + ' : contenu affiché'); await capture('pf-' + k);
  verif(await p.evaluate(() => document.documentElement.scrollWidth <= visualViewport.width + 1), k + ' : pas de défilement horizontal');
}
await p.evaluate(() => document.querySelector('#portefeuille-fenetre [data-onglet="trans"]').click()); await w(800);
verif(await p.evaluate(() => document.querySelectorAll('#portefeuille-fenetre .tp-trans tr').length === 51), 'tableau : 50 premières lignes'); await p.evaluate(() => document.querySelector('#portefeuille-fenetre [data-plus]').click()); await w(500); verif(await p.evaluate(() => document.querySelectorAll('#portefeuille-fenetre .tp-trans tr').length === 101), 'tableau : 50 lignes de plus');
await p.evaluate(() => { const s = document.querySelector('#portefeuille-fenetre [data-f="resultat"]'); s.value = 'gagnant'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await w(600); const nb = await p.evaluate(() => (document.querySelector('#portefeuille-fenetre [data-zone] p b') || {}).textContent); verif(+nb > 500 && +nb < 700, 'filtre « gagnants » : ' + nb + ' positions (641 attendues)');
console.log('— coach : rapport et voix —'); await p.evaluate(() => document.querySelector('#portefeuille-fenetre [data-onglet="coach"]').click()); await w(1500);
verif(/Rapport/i.test(await texte('#portefeuille-fenetre [data-zone]')) && /note de discipline/i.test(await texte('#portefeuille-fenetre [data-rapport]')), 'rapport calculé affiché (sans IA : le Worker de Rayle n’est pas configuré dans ce test)');
console.log('— réimport : aucun doublon —'); await p.evaluate(() => document.querySelector('#portefeuille-fenetre [data-onglet="globale"]').click()); await w(800); const input2 = await p.$('#portefeuille-fenetre input[data-fichier]'); await input2.uploadFile(zipAbs);
verif(await attendre(() => p.evaluate(() => /0 nouvelle\(s\) position/.test((document.querySelector('#portefeuille-fenetre [data-bandeau]') || {}).textContent || '')), 60000), 'réimporter le même fichier : 0 nouvelle position'); verif(/Total : 1730/.test(await texte('#portefeuille-fenetre [data-bandeau]')), 'toujours 1730 positions');
console.log('— second appareil (autre profil) —');
const ctx = await T.nav.createBrowserContext(), p2 = await ctx.newPage(); await p2.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await p2.setUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36');
await p2.evaluateOnNewDocument(c => { try { localStorage.setItem('rayle_donnees_base', 'http://127.0.0.1:8801/'); localStorage.setItem('rayle_m_sw', '0'); localStorage.setItem('rayle_pf_conn_v1', JSON.stringify({ url: 'https://pf.test', code: c })); } catch (e) { /* */ } }, CODE);
await p2.setRequestInterception(true); p2.on('request', async r => { const u = r.url(); if (await interception(r, u)) return; if (u.includes('.workers.dev')) return r.respond({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: '{"ok":true}' }); r.continue(); });
await p2.goto('http://rayle.test:8000/index.html', { waitUntil: 'domcontentloaded', timeout: 120000 }); await w(4000); await p2.evaluate(() => window.Application.ouvrir('portefeuille'));
verif(await p2.waitForFunction(() => /Résultat net des positions/i.test((document.querySelector('#portefeuille-fenetre [data-zone]') || {}).innerText || ''), { timeout: 60000 }).then(() => true, () => false), 'l’autre appareil retrouve tout via le Worker, sans importer');
const t2 = await p2.evaluate(() => document.querySelector('#portefeuille-fenetre [data-zone]').innerText), t1 = await texte('#portefeuille-fenetre [data-zone]'); const pick = s => (/Résultat net des positions\s*\n?\s*([^\n]+)/.exec(s) || [])[1]; verif(pick(t1) && pick(t1) === pick(t2), 'même résultat net sur les deux appareils : ' + pick(t2));
await ctx.close();
console.log('— fermeture —'); await p.evaluate(() => window.Application.fermer()); await w(1200); verif(await p.evaluate(() => !document.querySelector('#portefeuille-fenetre')), 'la fenêtre se ferme proprement');
await T.fin();
