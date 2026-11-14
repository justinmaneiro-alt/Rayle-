/* Réglages (téléphone et tablette) : la fenêtre s'ouvre, y compris par-dessus la Terre ; qualité, sauvegarde / restauration, état des sources, version.
   Prérequis : node serveur.mjs 8000 ; node outils-donnees/serveur-snapshots.mjs <snapshots> 8801.   Usage : node tests-navigateur/reglages-autonomie-test.mjs */
import { createRequire } from 'node:module'; import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const HOTE = 'http://rayle.test:8000', w = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0; const verif = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--host-resolver-rules=MAP rayle.test 127.0.0.1'] });
async function ouvrirPage(vp) {
  const p = await nav.newPage(); await p.setUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'); await p.setViewport({ ...vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_donnees_base', 'http://127.0.0.1:8801/'); localStorage.setItem('rayle_m_sw', '0'); } catch (e) { /* */ } });
  await p.setRequestInterception(true); p.on('request', async r => { const u = r.url(); if (/^(http:\/\/rayle\.test|http:\/\/127\.0\.0\.1|data:|blob:)/.test(u) || r.method() !== 'GET') return r.continue(); try { const x = await fetch(u, { signal: AbortSignal.timeout(15000) }); r.respond({ status: x.status, headers: { 'access-control-allow-origin': '*', 'content-type': x.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await x.arrayBuffer()) }); } catch (e) { r.abort('failed'); } });
  p.on('dialog', d => d.accept()); const erreurs = []; p.on('pageerror', e => erreurs.push(e.message.slice(0, 150)));
  await p.goto(HOTE + '/index.html', { waitUntil: 'domcontentloaded' }); await w(4000); return { p, erreurs };
}
const visible = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || r.width < 5 || r.height < 5) return false; const x = Math.min(innerWidth - 2, Math.max(2, r.x + r.width / 2)), y = Math.min(innerHeight - 2, Math.max(2, r.y + Math.min(r.height / 2, 30))); const t = document.elementFromPoint(x, y); return !!t && (e === t || e.contains(t) || t.contains(e)); }, sel);
for (const [nom, vp] of [['téléphone', { width: 412, height: 915 }], ['tablette', { width: 1024, height: 768 }]]) {
  console.log('— ' + nom + ' —'); const { p, erreurs } = await ouvrirPage(vp);
  await p.evaluate(() => document.getElementById('gear').click()); await w(1200);
  verif(await visible(p, '#cfg.open'), nom + ' : la fenêtre Réglages s\u2019affiche (et reçoit les touchers)');
  for (const id of ['raQualite', 'raTerre', 'raBase', 'raIA', 'raNotifInfo', 'raSauve', 'raRestaure', 'raEtat', 'raVersion']) verif(await p.evaluate(i => !!document.getElementById(i), id), nom + ' : bloc « ' + id + ' » présent');
  verif(await p.evaluate(() => /Application \d{4}\.\d+\.\d+/.test(document.getElementById('raVersion').textContent)), nom + ' : version affichée : ' + await p.evaluate(() => document.getElementById('raVersion').textContent));
  /* qualité */
  await p.evaluate(() => { const s = document.getElementById('raQualite'); s.value = 'economie'; s.dispatchEvent(new Event('change', { bubbles: true })); }); verif(await p.evaluate(() => localStorage.getItem('rayle_qualite') === 'economie'), nom + ' : qualité « économie » enregistrée');
  await p.evaluate(() => { const s = document.getElementById('raQualite'); s.value = 'auto'; s.dispatchEvent(new Event('change', { bubbles: true })); }); verif(await p.evaluate(() => localStorage.getItem('rayle_qualite') === null), nom + ' : retour en automatique');
  /* adresse refusée si ce n'est pas https */
  await p.evaluate(() => { document.getElementById('raBase').value = 'javascript:alert(1)'; document.getElementById('raBaseOk').click(); }); verif(await p.evaluate(() => /refusée/.test(document.getElementById('raSauveInfo').textContent)), nom + ' : adresse non https refusée');
  /* sauvegarde puis restauration */
  await p.evaluate(() => { localStorage.setItem('rayle_or_journal_test', JSON.stringify([{ id: 1, sens: 'achat' }])); localStorage.setItem('rayle_token', 'SECRET-A-NE-PAS-EXPORTER'); });
  const sauvegarde = await p.evaluate(async () => { const b = await window.ReglagesAutonomie.exporterBases(), P = window.ReglagesAutonomiePur; const s = P.construireSauvegarde({ stockage: localStorage, bases: b, version: 'test' }); return JSON.stringify(s); });
  verif(sauvegarde.includes('rayle_or_journal_test') && !sauvegarde.includes('SECRET-A-NE-PAS-EXPORTER'), nom + ' : sauvegarde contient le journal, jamais le secret');
  await p.evaluate(() => localStorage.removeItem('rayle_or_journal_test'));
  const fichier = path.resolve('outils-restructuration/captures-mobile-autonome/_sauvegarde-test.json'); (await import('node:fs')).writeFileSync(fichier, sauvegarde);
  const input = await p.$('#raFichier'); await input.uploadFile(fichier); await w(1500);
  verif(await p.evaluate(() => localStorage.getItem('rayle_or_journal_test') !== null), nom + ' : restauration remet le journal'); verif(/Restauré/.test(await p.evaluate(() => document.getElementById('raSauveInfo').textContent)), nom + ' : message de restauration');
  const mauvais = path.resolve('outils-restructuration/captures-mobile-autonome/_mauvais.json'); (await import('node:fs')).writeFileSync(mauvais, JSON.stringify({ format: 'rayle-sauvegarde-v1', cles: { rayle_token: 'x', rayle_ok: '1' } }));
  await p.evaluate(() => localStorage.removeItem('rayle_ok')); await (await p.$('#raFichier')).uploadFile(mauvais); await w(1000);
  verif(/refusée/.test(await p.evaluate(() => document.getElementById('raSauveInfo').textContent)) && await p.evaluate(() => localStorage.getItem('rayle_ok') === null), nom + ' : fichier douteux refusé, rien modifié');
  /* état des sources : après une lecture */
  await p.evaluate(async () => { const m = await import(new URL('agent-trading/front/donnees/routes.js', document.baseURI).href); await m.lireRoute('/__sante').catch(() => {}); await m.lireRoute('/__calendrier2').catch(() => {}); });
  await p.evaluate(() => document.getElementById('raEtat').click()); await w(2500);
  const tab = await p.evaluate(() => document.getElementById('raEtatTab').innerText.replace(/\s+/g, ' ')); verif(/sante/.test(tab) && /instantané|copie locale/.test(tab), nom + " : état des sources liste « sante » (instantané ou copie locale)"); verif(/Robot de données : dernier passage/.test(tab), nom + ' : état du robot affiché');
  await p.screenshot({ path: `outils-restructuration/captures-mobile-autonome/reglages-${nom}.png` });
  /* par-dessus la Terre */
  await p.evaluate(() => document.getElementById('cfgClose').click()); await w(500); await p.evaluate(() => window.Application.ouvrir('terre')); await w(4000);
  await p.evaluate(() => document.querySelector('#terre-mobile [data-a="reglages"]').click()); await w(1200);
  verif(await visible(p, '#cfg.open'), nom + ' : Réglages visibles par-dessus la Terre'); verif(await p.evaluate(() => +getComputedStyle(document.getElementById('cfg')).zIndex > 150), nom + ' : z-index supérieur à l\u2019aperçu de la Terre');
  verif(erreurs.length === 0, nom + ' : aucune erreur de page ' + erreurs.join(' | ')); await p.close();
}
console.log(`résultat : ${ok} vérifications, ${ko} échec(s)`); await nav.close(); process.exit(ko ? 1 : 0);
