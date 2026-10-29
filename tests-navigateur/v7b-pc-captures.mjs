// V7b : captures du PC AVANT / APRÈS la séparation PC / téléphone / tablette. Sur PC rien ne doit changer.
//   node tests-navigateur/v7b-pc-captures.mjs avant     → docs/captures-v7b/avant/*.png + signatures.json
//   node tests-navigateur/v7b-pc-captures.mjs apres     → docs/captures-v7b/apres/*.png + signatures.json, puis comparaison (signatures strictes, pixels avec tolérance)
// Les canevas WebGL (entité, galaxie) sont masqués et les animations figées : on compare l'interface, pas les neurones. Les textes qui changent d'une minute à l'autre (heure, cours) sont rendus transparents.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, CHROME, attendre } from './terre-aide.mjs';

const label = process.argv[2] || 'avant', dossier = path.join('docs', 'captures-v7b', label);
fs.mkdirSync(dossier, { recursive: true });
const FIGER = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}
canvas{visibility:hidden!important}
[data-live],.tb-f time,#horloge,.g1-heure,.g1-live,time,.cours,.px,.var,.tb-val{color:transparent!important;text-shadow:none!important}`;
const ETATS = [
  { nom: 'accueil-aurore', theme: null },
  { nom: 'accueil-jarvis', theme: 'jarvis' },
  { nom: 'terminal', theme: 'jarvis', hash: '#terminal' },
  { nom: 'galaxie', theme: 'jarvis', galaxie: true },
  { nom: 'reglages', theme: 'jarvis', reglages: true }
];
const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1920,1080'] });
const signatures = {};
for (const e of ETATS) {
  const page = await navigateur.newPage(); await page.setViewport({ width: 1920, height: 1080 });
  const erreurs = []; page.on('pageerror', x => erreurs.push(x.message.slice(0, 160)));
  await page.evaluateOnNewDocument(t => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_boot_jarvis', '0'); if (t) localStorage.setItem('rayle_theme', t); } catch (x) {} }, e.theme);
  await page.goto(BASE + '/index.html' + (e.hash || ''), { waitUntil: 'load' }); await attendre(2500);
  if (e.galaxie) { await page.evaluate(() => document.getElementById('btnOuvrirGalaxie').click()); await page.waitForFunction(() => document.getElementById('chargement')?.classList.contains('fini'), { timeout: 90000 }).catch(() => {}); await attendre(800); }
  if (e.reglages) { await page.evaluate(() => { const b = document.getElementById('gear') || document.querySelector('[data-a="reglages"],.btn-reglages'); if (b) b.click(); }); await attendre(900); }
  await page.addStyleTag({ content: FIGER }); await attendre(300);
  await page.screenshot({ path: path.join(dossier, e.nom + '.png') });
  signatures[e.nom] = await page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
    const arrondi = x => Math.round(x / 8) * 8;
    return { theme: document.body.className.split(/\s+/).filter(c => /^(g1|jarvis|vue-)/.test(c)).sort().join(' '), titre: document.title,
      elements: [...document.querySelectorAll('[id]')].filter(vis).map(el => { const r = el.getBoundingClientRect(); return el.id + '@' + arrondi(r.x) + ',' + arrondi(r.y) + ',' + arrondi(r.width) + ',' + arrondi(r.height); }).sort(),
      boutons: [...document.querySelectorAll('button')].filter(vis).map(b => (b.id || b.className.toString().split(' ')[0] || 'b') + ':' + (b.getAttribute('aria-label') || '').slice(0, 30)).sort(),
      scripts: [...document.scripts].map(s => s.src.replace(location.origin + '/', '')).filter(Boolean).length };
  });
  signatures[e.nom].erreurs = erreurs;
  await page.close();
}
await navigateur.close();
fs.writeFileSync(path.join(dossier, 'signatures.json'), JSON.stringify(signatures, null, 1));
console.log('captures écrites dans', dossier, Object.keys(signatures).map(k => k + ' (' + signatures[k].elements.length + ' éléments)').join(', '));
