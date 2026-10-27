import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';
import { defautsTexte } from './texte-visible.mjs';

/* V1 partie 5 : poste de l'agent (état vide, sans historique). Navigation en 6 groupes, mode Simple épuré, Santé (SOL / DOGE « non activé », pas de panne rouge,
   pas de « [object Object] »), texte visible sans « undefined » / « NaN » dans AUCUN onglet, aucune trame de lignes, captures de chaque groupe (captures-v1/). */
fs.mkdirSync('captures-v1', { recursive: true });
const { verifier, fin } = compteur();
const L = Number(process.env.L) || 1700, H = Number(process.env.H) || 950;
const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${L},${H}`] });
const page = await navigateur.newPage(); await page.setViewport({ width: L, height: H });
const erreurs = []; page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 240)); }); page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 400)));
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0');
  window.__RAYLE_POSTE_TEST__ = { exposer: true, sansRecherche: true, lire: async () => { throw new Error('hors ligne (test)'); } };
});
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1200);
const ev = (f, ...a) => page.evaluate(f, ...a);
const onglet = async nom => { await ev(n => document.querySelector('.pa-onglets [data-onglet="' + n + '"]').click(), nom); await attendre(900); };
await ev(async () => { await import('/planetes/mars/pc/trading/fenetre-agent.js'); await window.PosteAgent.ouvrir({}); }); await attendre(1800);

verifier('navigation : 6 groupes et 16 sous-onglets (dont « Teste ma stratégie »)', await ev(() => document.querySelectorAll('.pa-onglets [data-groupe]').length === 6 && document.querySelectorAll('.pa-onglets [data-onglet]').length === 16));
verifier('un seul groupe a ses sous-onglets visibles', await ev(() => { const v = [...document.querySelectorAll('.pa-onglets [data-onglet]')].filter(b => !b.hidden); return new Set(v.map(b => b.dataset.g)).size === 1; }));
verifier('aucune trame de lignes dans le poste (pas de repeating-linear-gradient)', await ev(() => ![...document.querySelectorAll('.pa-poste, .pa-poste *, .pn.mars-poste')].some(e => /repeating-linear-gradient/.test(getComputedStyle(e).backgroundImage))));
verifier('mode Simple : sous-onglets « expert » cachés', await ev(() => [...document.querySelectorAll('.pa-onglets .pa-x')].every(b => getComputedStyle(b).display === 'none')));

const groupes = ['apercu', 'marche', 'strategies', 'risque', 'journal', 'systeme'];
for (const g of groupes) {
  await ev(x => document.querySelector('.pa-onglets [data-groupe="' + x + '"]').click(), g); await attendre(1200);
  verifier('groupe ' + g + ' : actif et un sous-onglet actif', await ev(x => document.querySelector('.pa-onglets [data-groupe="' + x + '"]').classList.contains('actif') && !!document.querySelector('.pa-onglets [data-onglet].actif'), g));
  await page.screenshot({ path: `captures-v1/agent-${g}.png` });
}

// Santé : SOL et DOGE non activés = neutre, avec un bouton ; pas de panne
await onglet('sante'); await attendre(2500);
const sante = await ev(() => ({ texte: document.querySelector('.pa-corps').innerText, boutons: [...document.querySelectorAll('[data-a="sante-activer-paire"]')].map(b => b.dataset.paire), neutres: document.querySelectorAll('.pa-sante .pa-pt.neutre').length, comptes: document.body.innerText.includes('[object Object]') }));
verifier('Santé : « Données du compte » lisible (pas de [object Object])', !sante.comptes && /Données du compte/i.test(sante.texte));
verifier('Santé : SOL et DOGE « non activé » avec bouton « Activer et charger l’historique »', sante.boutons.includes('SOL') && sante.boutons.includes('DOGE') && /n’est pas encore activé/.test(sante.texte) && /Activer et charger l’historique/.test(sante.texte));
verifier('Santé : les paires non activées ne sont pas des pannes rouges', sante.neutres >= 2);
verifier('Santé : le niveau global n’est pas KO à cause de SOL / DOGE', await ev(() => !/point\(s\) en panne/.test(document.querySelector('.pa-corps').innerText) || document.querySelectorAll('.pa-sante .pa-pt.ko').length > 0));
await page.screenshot({ path: 'captures-v1/agent-sante.png' });

// Texte visible : tous les onglets, mode Simple puis Expert, trois paires
const tous = await ev(() => [...document.querySelectorAll('.pa-onglets [data-onglet]')].map(b => b.dataset.onglet));
for (const mode of ['simple', 'expert']) {
  await ev(m => document.querySelector('.pa-mode [data-mode="' + m + '"]').click(), mode); await attendre(500);
  for (const p of ['BTC', 'SOL', 'DOGE']) {
    await ev(x => document.querySelector('.pa-paires [data-paire="' + x + '"]').click(), p); await attendre(700);
    for (const o of tous) { await onglet(o); const d = await defautsTexte(page, '.pa-poste'); verifier(`texte visible propre : ${mode} / ${p} / ${o}`, d && d.length === 0, d ? d.join(' | ') : 'poste introuvable'); }
  }
}
const vraies = erreurs.filter(e => !/Failed to load resource|CORS policy|faireconomy/.test(e));   // réseau externe du terminal : hors sujet
verifier('aucune erreur JavaScript', vraies.length === 0, vraies.slice(0, 3).join(' | '));
await navigateur.close(); fin();
