/* Test Chrome de l'écran « Trades simulés » (or.html) avec le vrai fichier de données (analyse-realite.mjs doit avoir tourné).
   Usage : node agent-trading/tests/trades-simules-chrome.mjs   (lance lui-même le serveur local sur le port 8013 ; captures dans captures-or/) */
import { createRequire } from 'node:module'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json')), puppeteer = require('puppeteer-core');
const PORT = 8013, BASE = `http://127.0.0.1:${PORT}`, SORTIE = path.resolve('captures-or'); fs.mkdirSync(SORTIE, { recursive: true });
if (!fs.existsSync('agent-trading/front/or/donnees-trades/trades.json')) { console.log('Données absentes : lance analyse-realite.mjs'); process.exit(1); }
const srv = spawn(process.execPath, ['serveur.mjs', String(PORT)], { stdio: 'ignore' }); const w = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 30; i++) { try { if ((await fetch(BASE + '/agent-trading/front/or.html')).ok) break; } catch (e) { /* */ } await w(300); }
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
let nOk = 0; const echecs = [], erreurs = []; const v = (c, m, d = '') => { if (c) { nOk++; console.log('OK ', m); } else { echecs.push(m); console.log('ÉCHEC', m, d); } };
async function essai(l, h, mobile) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mobile, hasTouch: mobile });
  p.on('pageerror', e => erreurs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_|status of 40|net::|Failed to load resource/i.test(m.text())) erreurs.push(m.text()); });
  await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-a="positions-rayle"]', { timeout: 20000 }); v(true, `${l}px : le bouton « Positions de Rayle » est présent`);
  await p.click('[data-a="positions-rayle"]'); await p.waitForFunction(() => document.querySelectorAll('[data-ts="liste"] button').length > 0, { timeout: 30000 });
  const e0 = await p.evaluate(() => ({ ouvert: window.TradesSimules.ouvert(), n: document.querySelectorAll('[data-ts="liste"] button').length, g: window.TradesSimules.graphiqueEtat(), variantes: [...document.querySelectorAll('[data-ts="variante"] option')].map(o => o.value), resume: document.querySelector('[data-ts="resume"]').textContent, fiche: document.querySelector('[data-ts="fiche"]').innerText, worker: !!window.Worker }));
  v(e0.ouvert && e0.n > 0, `${l}px : panneau ouvert, ${e0.n} trades listés`);
  v(e0.variantes.includes('B-J-niveau+S') && e0.variantes.includes('B-H4-fractale+P'), `${l}px : variantes B-J-niveau+S et B-H4-fractale+P proposées (${e0.variantes.length} au total)`);
  v(e0.g.bars > 50 && e0.g.marques >= 1 && e0.g.lignes === 3, `${l}px : graphique dessiné (${e0.g.bars} bougies, ${e0.g.marques} trade, ${e0.g.lignes} lignes entrée/stop/cible)`, JSON.stringify(e0.g));
  for (const mot of ['Entrée', 'Stop', 'Cible', 'Sortie', 'R brut', 'Frais', 'R net', 'Bougies H1 tenues']) v(new RegExp(mot).test(e0.fiche), `${l}px : fiche contient « ${mot} »`);
  v(/R par once|\$ par once/.test(e0.fiche) && /\$ pour/.test(e0.fiche), `${l}px : frais en dollars et en R`);
  // navigation
  const t1 = await p.evaluate(() => window.TradesSimules.etat.courant); await p.keyboard.press('ArrowRight'); await p.waitForFunction(a => window.TradesSimules.etat.courant !== a, {}, t1); 
  const t2 = await p.evaluate(() => window.TradesSimules.etat.courant); v(t2 !== t1, `${l}px : flèche droite = trade suivant (${t1} → ${t2})`);
  await p.keyboard.press('ArrowLeft'); await p.waitForFunction(a => window.TradesSimules.etat.courant === a, {}, t1); v(true, `${l}px : flèche gauche = trade précédent`);
  await p.click('[data-ts="suivant"]'); await p.waitForFunction(a => window.TradesSimules.etat.courant !== a, {}, t1); v(true, `${l}px : bouton « Suivant »`);
  // filtres
  const compte = async f => { await p.evaluate(x => window.TradesSimules.filtre(x), f); return p.evaluate(() => ({ n: document.querySelectorAll('[data-ts="liste"] button').length, r: [...document.querySelectorAll('[data-ts="liste"] .r')].map(e => parseFloat(e.textContent.replace(',', '.'))) })); };
  const tous = await compte('tous'), gag = await compte('gagnants'), per = await compte('perdants'), be = await compte('be');
  v(gag.n + per.n === tous.n && gag.r.every(x => x > 0) && per.r.every(x => x <= 0.005), `${l}px : filtres gagnants (${gag.n}) + perdants (${per.n}) = tous (${tous.n}), signes cohérents`);
  v(be.n <= tous.n, `${l}px : filtre break-even (${be.n})`);
  await compte('tous');
  // variante B-H4-fractale+P (partielle) : sorties multiples
  await p.evaluate(() => window.TradesSimules.choisirVariante('B-H4-fractale+P')); await w(800);
  const part = await p.evaluate(() => ({ n: document.querySelectorAll('[data-ts="liste"] button').length, g: window.TradesSimules.graphiqueEtat() })); v(part.n > 0 && part.g.bars > 0, `${l}px : variante B-H4-fractale+P affichée (${part.n} trades)`);
  // mode période + dates de l'utilisateur
  await p.evaluate(() => window.TradesSimules.mode('periode')); await w(800);
  const dates = await p.evaluate(() => window.TradesSimules.periodes().map(q => q.nom)); v(dates.some(d => /22 mars/.test(d)) && dates.some(d => /septembre/.test(d)), `${l}px : périodes des dates réelles proposées (${dates.length})`);
  for (let k = 0; k < dates.length; k++) { await p.evaluate(i => window.TradesSimules.periode(i), k); await w(700); const g = await p.evaluate(() => window.TradesSimules.graphiqueEtat()); v(g.bars > 0, `${l}px : période « ${dates[k]} » : ${g.bars} bougies, ${g.marques} trades dessinés`); }
  await p.evaluate(() => window.TradesSimules.choisirVariante('B-J-niveau+S')); await p.evaluate(i => window.TradesSimules.periode(i), dates.findIndex(d => /22 mars/.test(d))); await w(1200);
  await p.screenshot({ path: path.join(SORTIE, `trades-simules-${l}.png`) });
  // clic sur un trade de la liste -> mode trade
  await p.evaluate(() => window.TradesSimules.mode('trade')); await w(800);
  await p.screenshot({ path: path.join(SORTIE, `trades-simules-trade-${l}.png`) });
  const debord = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2); v(!debord, `${l}px : pas de défilement horizontal`);
  await p.keyboard.press('Escape'); v(!(await p.evaluate(() => window.TradesSimules.ouvert())), `${l}px : Échap ferme le panneau`);
  await p.close();
}
await essai(1600, 900, false); await essai(390, 844, true);
v(erreurs.length === 0, 'aucune erreur JavaScript dans la console', erreurs.slice(0, 3).join(' | '));
await nav.close(); srv.kill();
console.log(`\ntrades-simules-chrome : ${nOk} OK, ${echecs.length} échec(s)`); process.exit(echecs.length ? 1 : 0);
