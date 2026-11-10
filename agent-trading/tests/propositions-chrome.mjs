/* Test Chrome : bouton « Propositions H1 » (PC 1600 px et téléphone 390 px) collé au graphique à côté de « Positions de Rayle », panneau, statut honnête, trois lignes sur le graphique,
   registre forward en ajout seul, commandes vocales, depuis la page seule ET l'écran Terminal de l'appli. */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('captures-or', { recursive: true });
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
async function essai(cadre, page, l, mobile) {
  await cadre.waitForSelector('[data-a="propositions-h1"]', { timeout: 40000 }); await w(6000);
  const g = await cadre.evaluate(() => { const bp = document.querySelector('[data-a="positions-rayle"]').getBoundingClientRect(), bq = document.querySelector('[data-a="propositions-h1"]').getBoundingClientRect(), gr = document.querySelector('.tor-graph').getBoundingClientRect(), lw = document.querySelector('.tor-graph-lw').getBoundingClientRect(), el = document.elementFromPoint(bq.left + bq.width / 2, bq.top + bq.height / 2);
    return { proche: Math.abs(bq.top - bp.top) < 60 && bq.left >= bp.right - 2 && bq.left - bp.right < 60, dedans: bq.left >= gr.left && bq.right <= gr.right && bq.bottom <= lw.top + 1, visible: bq.bottom <= innerHeight && bq.right <= innerWidth, cliquable: el === document.querySelector('[data-a="propositions-h1"]'), h: bq.height }; });
  v(g.proche && g.dedans && g.visible && g.cliquable && g.h >= 34, `${l}px : « Propositions H1 » collé au graphique, à côté de « Positions de Rayle », visible et cliquable`);
  await cadre.click('[data-a="propositions-h1"]'); await cadre.waitForFunction(() => !document.querySelector('[data-props]').hidden, { timeout: 5000 }); await w(1200);
  v(await cadre.evaluate(() => document.querySelector('[data-a="propositions-h1"]').classList.contains('actif')), `${l}px : bouton coloré quand le panneau est ouvert`);
  const txt = await cadre.evaluate(() => document.querySelector('[data-props]').innerText); v(/Aucun type de setup n.est validé/.test(txt), `${l}px : le panneau dit en tête qu'aucun setup n'est validé`); v(/Régime actuel/.test(txt), `${l}px : régime affiché`);
  // injection d'une proposition : trois lignes sur le graphique, fiche avec la preuve de la recherche, registre
  const r = await cadre.evaluate(() => { const T = window.__or.propositions, S = window.__or.graph; const der = window.__or.graph.serie().data().slice(-1)[0]; const prix = der.close; const q = T.injecter({ id: 'test|repli|1', t: Date.now() - 3600e3, tCloture: Date.now(), type: 'repli', nom: 'Repli dans la tendance', texte: 'test', sens: 'achat', d: 1, entree: prix, stop: prix - 12, cible: prix + 30, niveauCible: 'niveau rond de test', atr: 8, stopAtr: 1.5, rBrut: 2.5, regime: 'test' }); return { etiquette: q.etiquette, reg: T.registre().length, txt: document.querySelector('[data-props]').innerText }; });
  v(r.etiquette === 'Lecture' && /Entrée/.test(r.txt) && /Stop/.test(r.txt) && /Cible/.test(r.txt) && /R brut/.test(r.txt), `${l}px : fiche avec entrée, stop, cible, R brut et étiquette « Lecture »`);
  v(/Preuve \(recherche 2003|Preuve \(recherche 2015/.test(r.txt) && /trades/.test(r.txt) && /R net CFD/.test(r.txt) && /Kraken/.test(r.txt) && /réussite/.test(r.txt), `${l}px : preuve de la recherche (trades, réussite, R net CFD et Kraken, période)`);
  v(await cadre.evaluate(() => { const reg = window.__or.propositions.registre(); return reg.some(x => x.kind === 'proposition' && x.id === 'test|repli|1' && 'cvd' in x); }), `${l}px : proposition notée au registre forward (avec le champ CVD)`);
  const n1 = await cadre.evaluate(() => window.__or.propositions.registre().length); await cadre.evaluate(() => window.__or.propositions.maj(true)); const n2 = await cadre.evaluate(() => window.__or.propositions.registre().length); v(n2 >= n1, `${l}px : registre en ajout seul (${n1} → ${n2})`);
  await page.screenshot({ path: `captures-or/propositions-${l}.png` });
  const rep = await cadre.evaluate(async () => await window.TableauOr.commande('quelles sont les propositions H1 ?')); v(typeof rep === 'string' && /validé|lecture|proposition/i.test(rep) && !/(achète|vends)/i.test(rep), `${l}px : commande vocale « propositions H1 » : ${(rep || '').slice(0, 60)}…`);
  await cadre.click('[data-a="fermer-props"]'); v(await cadre.evaluate(() => document.querySelector('[data-props]').hidden), `${l}px : le panneau se ferme`);
  if (l < 600) return; /* téléphone : le panneau couvre l'écran, on le ferme par ✕ */
  await cadre.click('[data-a="propositions-h1"]'); await cadre.click('[data-a="propositions-h1"]'); v(await cadre.evaluate(() => document.querySelector('[data-props]').hidden && !document.querySelector('[data-a="propositions-h1"]').classList.contains('actif')), `${l}px : second clic ferme`);
}
for (const [l, h, mob] of [[1600, 900, false], [390, 844, true]]) { const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob }); const err = []; p.on('pageerror', e => err.push(e.message)); await p.evaluateOnNewDocument(() => { try { localStorage.removeItem('rayle_or_props_forward'); } catch (e) {} });
  await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' }); await essai(p, p, l, mob); v(err.length === 0, `${l}px : aucune erreur de page ${err[0] || ''}`); await p.close(); }
// dans l'appli (écran Terminal)
const a = await nav.newPage(); await a.setViewport({ width: 1600, height: 900 }); await a.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_boot_jarvis', '0'); localStorage.removeItem('rayle_or_props_forward'); } catch (e) {} });
await a.goto(BASE + '/index.html', { waitUntil: 'load' }); await w(3500); await a.evaluate(() => document.getElementById('btnOuvrirTerminal').click()); await a.waitForSelector('#vueTerminal iframe.tr-or', { timeout: 30000 }); const f = await (await a.$('#vueTerminal iframe.tr-or')).contentFrame();
await f.waitForSelector('[data-a="propositions-h1"]', { timeout: 40000 }); await f.click('[data-a="propositions-h1"]'); await w(800); v(await f.evaluate(() => !document.querySelector('[data-props]').hidden), 'appli (Terminal) : le panneau Propositions H1 s\'ouvre');
await nav.close(); console.log(ko ? ko + ' échec(s)' : 'tout passe'); process.exit(ko ? 1 : 0);
