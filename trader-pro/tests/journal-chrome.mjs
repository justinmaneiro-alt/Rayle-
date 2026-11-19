/* Test Chrome du journal par setup (onglet « Setups » du Portefeuille) avec un export XTB SYNTHÉTIQUE (CSV) : import en un geste, importer deux fois = aucun doublon, rapprochement d'une prise notée,
   attribution en un toucher, statistiques, synthèse de Rayle. Usage : node trader-pro/tests/journal-chrome.mjs [pc|tablette|tel] */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'pc', T = await lancer(mode), { p, verif, attendre, texte, capture } = T;
/* 14 positions fermées sur l'or (GOLD) : 12 gagnantes/perdantes « rebond MA200 », 2 sans setup */
const base = Date.UTC(2026, 10, 2, 9, 0), lignes = ['Instrument;Ticker;Category;Type;Volume;Open Price;Open Time (UTC);Close Price;Close Time (UTC);Product;Profit/Loss;Gross Profit;Commission;Margin;Swap;Rollover;Stop Loss;Take Profit;Close Origin;Position ID;Comment'];
const iso = t => new Date(t).toISOString().slice(0, 19).replace('T', ' ');
const trades = []; for (let i = 0; i < 14; i++) { const o = base + i * 3 * 3600e3 + i * 86400e3, gagne = i % 3 !== 0, entree = 3600 + i, sortie = gagne ? entree + 17 : entree - 10; trades.push({ id: 9000 + i, tOuv: o, entree, sortie, gagne, pnl: gagne ? 85 : -50 }); lignes.push(`GOLD;GOLD;CFD;BUY;0.1;${entree};${iso(o)};${sortie};${iso(o + 2 * 3600e3)};CFD;${gagne ? 85 : -50};${gagne ? 85 : -50};0;100;0;0;${entree - 10};${entree + 40};Manual;${9000 + i};`); }
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'xtb-test-')), fichier = path.join(dossier, 'EUR_000_historique.csv'); fs.writeFileSync(fichier, lignes.join('\n'));
await p.evaluate(() => window.Application.ouvrir('portefeuille'));
verif(await attendre(() => p.evaluate(() => !!document.querySelector('#portefeuille-fenetre .tp-nav'))), 'la fenêtre Portefeuille s’ouvre');
await p.evaluate(() => document.querySelector('#portefeuille-fenetre [data-onglet="setups"]').click()); await w(800);
verif(await p.evaluate(() => !!document.querySelector('#portefeuille-fenetre [data-onglet="setups"]') && document.querySelector('#portefeuille-fenetre [data-onglet="setups"]').getAttribute('aria-selected') === 'true'), 'onglet « Setups » présent');
verif(await p.evaluate(() => { const d = document.querySelector('#portefeuille-fenetre [data-dropzone]'); return !!d && d.getBoundingClientRect().height >= 80; }), 'zone d’import bien visible (glisser-déposer / sélecteur de fichier)');
await capture('journal-vide');
console.log('— import en un geste, puis le même fichier une seconde fois —');
let input = await p.$('#portefeuille-fenetre input[data-fichier]'); await input.uploadFile(fichier);
verif(await attendre(() => p.evaluate(() => /Import terminé/.test((document.querySelector('#portefeuille-fenetre [data-bandeau]') || {}).innerText || '')), 20000), 'import terminé');
const msg1 = await p.evaluate(() => document.querySelector('#portefeuille-fenetre [data-bandeau]').innerText); console.log('  ', msg1.slice(0, 150));
verif(/14 nouvelles transactions/.test(msg1), 'résumé : « 14 nouvelles transactions »');
await w(2500); await p.evaluate(() => { document.querySelector('#portefeuille-fenetre [data-onglet="setups"]').click(); }); await w(800);
input = await p.$('#portefeuille-fenetre input[data-fichier]'); await input.uploadFile(fichier);
verif(await attendre(() => p.evaluate(() => /0 nouvelle/.test((document.querySelector('#portefeuille-fenetre [data-bandeau]') || {}).innerText || '')), 20000), 'second import du même fichier : 0 nouvelle transaction');
const msg2 = await p.evaluate(() => document.querySelector('#portefeuille-fenetre [data-bandeau]').innerText); verif(/14 déjà connue/.test(msg2) && /Total : 14 positions/.test(msg2), 'aucun doublon : ' + msg2.slice(0, 120));
await w(2000); await p.evaluate(() => document.querySelector('#portefeuille-fenetre [data-onglet="setups"]').click()); await w(800);
console.log('— rapprochement automatique d’une prise notée —');
const rapp = await p.evaluate(async t => {
  const J = await import('/trader-pro/portefeuille/journal-stockage.js'), S = await import('/trader-pro/portefeuille/journal-setups.js'), vus = [];
  for (const x of t) { const prise = S.creerPrise({ t: x.tOuv - 10 * 60e3, ticker: 'GOLD', sens: 'BUY', prix: x.entree + 0.5, stop: x.entree - 10, setup: 'rebond-ma200', unite: 'H4', source: 'voix' }); J.ajouter(prise, { sync: false }); vus.push(prise.id); }
  return vus.length;
}, trades.slice(2, 14));
verif(rapp === 12, '12 prises notées (rebond MA200 H4)');
await p.evaluate(() => { document.querySelector('#portefeuille-fenetre [data-onglet="trans"]').click(); }); await w(500); await p.evaluate(() => { document.querySelector('#portefeuille-fenetre [data-onglet="setups"]').click(); }); await w(1200);
const t1 = await texte('#portefeuille-fenetre .tp-setups'); console.log('  ', t1.replace(/\n/g, ' | ').slice(0, 220));
verif(/rebond MA200/.test(t1) && /12/.test(t1), 'statistiques : le setup « rebond MA200 » a 12 trades (rapprochés de l’import)');
verif(/Transactions sans setup \(2\)/i.test(await texte('#portefeuille-fenetre [data-zone]')), '2 transactions restent sans setup');
const syn = await texte('#portefeuille-fenetre [data-synthese]'); console.log('  synthèse :', syn);
verif(/Ton setup le plus rentable : rebond MA200 H4 sur l’or/.test(syn), 'synthèse de Rayle : le setup le plus rentable');
console.log('— attribution en un toucher —');
await p.evaluate(() => document.querySelector('#portefeuille-fenetre [data-setup-attrib][data-setup="fibonacci"]').click()); await w(800);
verif(/Transactions sans setup \(1\)/i.test(await texte('#portefeuille-fenetre [data-zone]')), 'un toucher classe la transaction (reste 1)');
verif(/Fibonacci/.test(await texte('#portefeuille-fenetre .tp-setups')) && /pas encore assez de trades/i.test(await texte('#portefeuille-fenetre .tp-setups')), 'Fibonacci apparaît avec « pas encore assez de trades » (1 trade)');
console.log('— saisie rapide depuis la fenêtre —');
await p.evaluate(() => { const f = document.querySelector('#portefeuille-fenetre [data-prise-form]'); f.querySelector('[name=prix]').value = '3 650,5'; f.querySelector('[name=stop]').value = '3640'; f.querySelector('[name=setup]').value = 'cassure-niveau'; f.requestSubmit(); }); await w(800);
verif(/Trades notés, pas encore retrouvés/i.test(await texte('#portefeuille-fenetre [data-zone]')), 'le trade noté à la main attend son import');
verif(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'pas de défilement horizontal de la page');
await capture('journal-setups');
await T.fin();
