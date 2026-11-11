/* Test Chrome des espaces : barre Investissement / Trading actif / Capital, étude de marché (candidats, fiche, source et date, « pas un conseil financier »), plan DCA, intérêts composés, portefeuille saisi, Rayle Capital, commandes vocales. PC 1600, tablette 1024, téléphone 390. */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('captures-or', { recursive: true });
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
for (const [l, h, mob] of [[1600, 900, false], [1024, 768, true], [390, 844, true]]) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob }); p.__err = []; p.on('pageerror', e => p.__err.push(e.message));
  await p.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/^rayle_(or|invest)_/.test(k)) localStorage.removeItem(k); } catch (e) {} window.speak = () => {}; });
  await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__espaces && window.TableauOr, { timeout: 40000 }).catch(() => {}); await w(800);
  v(await p.evaluate(() => document.querySelectorAll('.esp-barre [data-espace]').length === 3 && !document.getElementById('vue').hidden && window.__espaces.etat().actif === 'trading'), `${l}px : barre des trois espaces, Trading actif par défaut`);
  const cmd = t => p.evaluate(async t => await window.TableauOr.commande(t), t);
  const r1 = await cmd('ouvre l\'investissement'); await w(1500);
  v(/Investissement|étude|conseil financier/i.test(String(r1)) && await p.evaluate(() => document.getElementById('vue').hidden && !document.querySelector('[data-zone="investissement"]').hidden), `${l}px : « ouvre l'investissement » : ${String(r1).slice(0, 70)}…`);
  const e = await p.evaluate(() => ({ lignes: document.querySelectorAll('[data-inv-fiche]').length, avert: /pas un conseil financier/i.test(document.querySelector('[data-zone="investissement"]').innerText), poids: /Poids du score composite/.test(document.body.innerText), src: /Yahoo Finance/.test(document.body.innerText), refs: !!document.querySelector('tr.ref'), ia: /éclatement de la bulle IA/.test(document.body.innerText) }));
  v(e.lignes >= 15 && e.avert && e.poids && e.src && e.refs && e.ia, `${l}px : étude de marché : ${e.lignes} lignes, poids du score, source et date, références, thèse IA pour et contre, « pas un conseil financier »`);
  await p.evaluate(() => document.querySelector('[data-inv-fiche]').click()); await w(300);
  v(await p.evaluate(() => /Ce qui pourrait mal tourner/.test(document.querySelector('.inv-fiche').innerText) && /Éligibilité PEA/.test(document.querySelector('.inv-fiche').innerText) && /récupéré le \d{4}-\d{2}-\d{2}/.test(document.querySelector('.inv-fiche').innerText)), `${l}px : fiche : risques, éligibilité PEA, source et date`);
  const r2 = await cmd('fiche de TotalEnergies'); v(/TotalEnergies/.test(String(r2)) && /pas un conseil financier/i.test(String(r2)), `${l}px : « fiche de TotalEnergies » à la voix : ${String(r2).slice(0, 80)}…`);
  const r3 = await cmd('plan DCA'); await w(300); v(/non prouvée/.test(String(r3)) && await p.evaluate(() => /DCA \+ supports/.test(document.body.innerText) && /Règle non prouvée/.test(document.body.innerText) && /Répartition du versement/.test(document.body.innerText)), `${l}px : plan DCA et backtest honnête : « règle non prouvée »`);
  const r4 = await cmd('intérêts composés'); await w(300); v(/hypothèses/.test(String(r4)) && await p.evaluate(() => document.querySelectorAll('.inv-corps tbody tr').length === 3 && /aucune promesse/.test(document.body.innerText)), `${l}px : intérêts composés : 3 scénarios, hypothèses visibles`);
  await cmd('mon portefeuille'); await w(300);
  await p.evaluate(() => { const f = document.querySelector('[data-inv-form-op]'); f.type.value = 'achat'; f.ticker.value = 'TTE.PA'; f.secteur.value = 'Énergie'; f.quantite.value = '10'; f.prix.value = '60'; f.date.value = '2026-01-10'; f.requestSubmit(); }); await w(300);
  await p.evaluate(() => { const i = document.querySelector('[data-inv-prix="TTE.PA"]'); i.value = '70'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await w(300);
  const pf = await p.evaluate(() => window.__espaces.etat() && document.querySelector('.inv-resume').innerText);
  v(/Valeur 700,00/.test(pf) && /Coût 600,00/.test(pf) && /16,7 %/.test(pf), `${l}px : portefeuille saisi : valeur 700, coût 600, performance 16,7 % (${pf.replace(/\n/g, ' ').slice(0, 90)})`);
  const r5 = await cmd('ouvre Rayle Capital'); await w(800);
  v(/Rayle Capital/.test(String(r5)) && await p.evaluate(() => /Poche Investissement/.test(document.querySelector('[data-zone="capital"]').innerText) && /Poche Trading actif/.test(document.querySelector('[data-zone="capital"]').innerText) && /risque ouvert/.test(document.querySelector('[data-zone="capital"]').innerText) && /non prouvée/.test(document.querySelector('[data-zone="capital"]').innerText)), `${l}px : Rayle Capital : deux poches, risque par poche, règle non prouvée`);
  await p.screenshot({ path: `captures-or/espaces-${l}.png` });
  const r6 = await cmd('ouvre le trading actif'); await w(500); v(/Trading actif/.test(String(r6)) && await p.evaluate(() => !document.getElementById('vue').hidden && document.querySelector('[data-zone="capital"]').hidden), `${l}px : « ouvre le trading actif » : retour au graphique`);
  if (mob) { await p.evaluate(() => window.__espaces.aller('investissement')); await w(500); v(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${l}px : pas de défilement horizontal (investissement)`); await p.evaluate(() => window.__espaces.aller('trading')); }
  v(p.__err.length === 0, `${l}px : aucune erreur de page ${p.__err.slice(0, 2).join(' | ')}`); await p.close();
}
await nav.close(); console.log(ko ? ko + ' échec(s)' : 'tout passe'); process.exit(ko ? 1 : 0);
