/* Test Chrome v7 phase 3 : Investissement > « Mes actifs ». Prérequis : node serveur.mjs 8000. Le fichier mes-actifs.json (produit par outils-donnees/invest/mes-actifs.mjs) est servi depuis le chemin donné en 3e argument.
   Usage : node trader-pro/tests/mes-actifs-chrome.mjs [pc|tablette|tel] <dossier contenant mes-actifs.json> */
import fs from 'node:fs';
import path from 'node:path';
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'pc', dossier = process.argv[3]; if (!dossier) { console.log('dossier de mes-actifs.json manquant'); process.exit(2); }
const corps = fs.readFileSync(path.join(dossier, 'mes-actifs.json'));
const T = await lancer(mode, { dossierCaptures: 'donnees-privees/captures-v7', interception: async (r, u) => { if (/mes-actifs\.json/.test(u)) { await r.respond({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: corps }); return true; } return false; } }), { p, verif, attendre, capture, fin } = T;
await p.evaluate(() => window.Application.ouvrir('invest')); await w(2500);
await p.evaluate(() => document.querySelector('#invest-fenetre [data-onglet="mesactifs"]').click());
verif(await attendre(() => p.evaluate(() => document.querySelectorAll('[data-ma-actif]').length >= 6), 20000), 'six cartes affichées');
const info = await p.evaluate(() => [...document.querySelectorAll('[data-ma-actif]')].map(c => ({ id: c.dataset.maActif, xtb: (c.querySelector('.ma-xtb') || {}).innerText, verdicts: c.querySelectorAll('.ma-hor .ma-v').length, pq: c.querySelectorAll('.ma-pq li').length })));
console.log(JSON.stringify(info));
verif(info.every(c => c.verdicts === 4 && c.pq === 3 && /XTB/.test(c.xtb)), 'chaque carte : symbole XTB, 4 verdicts, 3 raisons');
await capture('mesactifs-cartes');
await p.evaluate(() => document.querySelector('[data-ma-actif="or"]').click()); await w(600);
const fiche = await p.evaluate(() => ({ ind: document.querySelectorAll('.ma-ind').length, svg: document.querySelectorAll('.ma-ind svg').length, pc: document.querySelectorAll('.ma-pc').length, src: document.querySelectorAll('.ma-ind .tp-src').length }));
verif(fiche.ind >= 5 && fiche.svg >= 5 && fiche.src === fiche.ind, 'fiche de l or : ' + JSON.stringify(fiche)); await capture('mesactifs-fiche-or');
await p.evaluate(() => document.querySelector('[data-ma-h="long"]').click()); await w(300); verif(await p.evaluate(() => document.querySelector('.ma-h-on').innerText.includes('5–10')), 'changement d horizon dans la fiche');
await p.evaluate(() => document.querySelector('[data-ma-retour]').click()); await w(300); verif(await p.evaluate(() => document.querySelectorAll('[data-ma-actif]').length === 6), 'retour à la liste');
/* voix */
const dit = await p.evaluate(async () => { const m = await import(new URL('trader-pro/commun/voix-trader.js', document.baseURI).href); return m.commande('Rayle, est-ce que l\'or est cher ?'); }); verif(typeof dit === 'string' && /jamais un conseil/.test(dit), 'voix « l or est-il cher » : ' + String(dit).slice(0, 140));
const dit2 = await p.evaluate(async () => { const m = await import(new URL('trader-pro/commun/voix-trader.js', document.baseURI).href); return m.commande('Rayle, où en est le Bitcoin sur 1 à 3 ans ?'); }); verif(typeof dit2 === 'string' && /Bitcoin/.test(dit2) && /1–3 ans/.test(dit2), 'voix Bitcoin 1 à 3 ans : ' + String(dit2).slice(0, 140));
await fin();
