import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { CHROME, attendre, compteur } from './terre-aide.mjs';

/* Le Veilleur dans la page (Chrome) : serveur local réel (dossier temporaire), faux fichiers du Veilleur. AUCUN Telegram, aucun Worker réel.
   Vérifie : réglages dans ⚙, lecture des alertes, présentation (fenêtre holographique, entité, journal), pas de rejeu au rechargement, voix « active / désactive le veilleur » et « montre-moi les alertes »,
   liaison sans afficher le jeton, panneau « Alertes » de Mars, aucune erreur JavaScript. Lancer :  node tests-navigateur/veilleur-page-test.mjs */
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'veilleur-page-'));
process.env.RAYLE_VEILLEUR_DOSSIER = dossier; process.env.RAYLE_VEILLEUR_SANS_LANCEMENT = '1';
const { creerServeur } = await import('../serveur.mjs');
const srv = creerServeur(); await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port;
const { verifier, fin } = compteur();
const ecrire = (f, o) => fs.writeFileSync(path.join(dossier, f), typeof o === 'string' ? o : JSON.stringify(o));
const lireF = f => { try { return JSON.parse(fs.readFileSync(path.join(dossier, f), 'utf8')); } catch (e) { return null; } };
const JETON = 'rd_FAUXJETONPAGE_987654';

const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await navigateur.newPage(); await page.setViewport({ width: 1400, height: 900 });
const erreurs = [];
page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 200)); });
page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 200)));
await page.evaluateOnNewDocument((j) => {
  localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', 'https://rayle.exemple.workers.dev'); localStorage.setItem('rayle_worker_token', j);
  window.__evts = []; const o = window.addEventListener; // les événements du bus sont écoutés plus bas
}, JETON);
await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await attendre(1500);
await page.evaluate(() => { window.__evts = []; RayleBus.on && RayleBus.on('raylé:alerte-prix', e => window.__evts.push(e)); });
await page.waitForFunction(() => window.VeilleurPage && window.VeilleurPage.disponible() === true, { timeout: 15000 });

verifier('page : réglages du Veilleur présents dans ⚙', await page.evaluate(() => !!document.querySelector('#vlSection .vl-etat') && /ARRÊTÉ/.test(document.querySelector('#vlSection .vl-etat').textContent)));
verifier('par défaut : désactivé', await page.evaluate(() => /désactivé/.test(document.querySelector('#vlSection .vl-etat').textContent) && !document.querySelector('#vlSection [data-r="actif"]').checked));

// liaison : le jeton est copié vers le fichier local, jamais affiché
let r = await page.evaluate(() => VeilleurPage.lier());
verifier('liaison : fichier local écrit avec l’adresse et le jeton', r.ok && lireF('config.local.json') && lireF('config.local.json').jeton === JETON);
verifier('liaison : le jeton n’apparaît ni dans la page ni dans les réponses', !(await page.evaluate(() => document.body.innerText)).includes('FAUXJETON') && !JSON.stringify(await page.evaluate(() => VeilleurPage.etat())).includes('FAUXJETON'));

// voix
let t = await page.evaluate(() => VeilleurPage.commande('Raylé, active le veilleur'));
verifier('voix : « active le veilleur » écrit le réglage et prévient qu’aucune stratégie n’est validée', /activé/.test(t) && /aucune stratégie/i.test(t) && lireF('reglages.json').actif === true, t);
t = await page.evaluate(() => VeilleurPage.commande('désactive le veilleur'));
verifier('voix : « désactive le veilleur »', /désactivé/.test(t) && lireF('reglages.json').actif === false, t);
t = await page.evaluate(() => VeilleurPage.commande('montre-moi les alertes'));
verifier('voix : « montre-moi les alertes » sans alerte = le dit', /Aucune alerte/.test(t), t);
verifier('voix : phrases étrangères ignorées', (await page.evaluate(() => VeilleurPage.commande('quelle heure est-il'))) === null && (await page.evaluate(() => VeilleurPage.commande('montre-moi les alertes de prix'))) === null);

// alerte arrivée du Veilleur
const maintenant = Date.now();
ecrire('alertes.jsonl', JSON.stringify({ id: 'E:1', type: 'ENTREE', t: maintenant, texte: '🟢 ENTRÉE BITCOIN (stratégie validée)\nSens : ACHAT\nEntrée : 100 000', resume: 'ACHAT Bitcoin vers 100 000', validee: true, canaux: ['telegram', 'application'] }) + '\n');
await page.evaluate(() => VeilleurPage.rafraichir()); await attendre(500);
verifier('alerte : fenêtre holographique demandée (raylé:alerte-prix)', await page.evaluate(() => window.__evts.some(e => /ENTRÉE/.test(e.actif))));
verifier('alerte : listée côté page', await page.evaluate(() => VeilleurPage.alertes().length === 1));
await page.evaluate(() => VeilleurPage.rafraichir()); await attendre(300);
verifier('alerte : pas présentée deux fois', await page.evaluate(() => window.__evts.filter(e => /ENTRÉE/.test(e.actif)).length === 1));
// OBSERVATION : jamais présentée comme une entrée
ecrire('alertes.jsonl', fs.readFileSync(path.join(dossier, 'alertes.jsonl'), 'utf8') + JSON.stringify({ id: 'O:1', type: 'OBSERVATION', t: maintenant + 10, texte: '🔵 OBSERVATION BITCOIN — NON VALIDÉ\nVolume élevé', resume: 'Volume élevé', validee: false, canaux: ['application'] }) + '\n');
await page.evaluate(() => VeilleurPage.rafraichir()); await attendre(300);
verifier('observation : étiquetée « non validé » dans la fenêtre', await page.evaluate(() => window.__evts.some(e => /OBSERVATION \(non validé\)/.test(e.actif))));

// rechargement : l'historique réapparaît mais ne rejoue rien
await page.reload({ waitUntil: 'load' }); await attendre(1500);
await page.evaluate(() => { window.__evts = []; RayleBus.on('raylé:alerte-prix', e => window.__evts.push(e)); });
await page.waitForFunction(() => window.VeilleurPage && window.VeilleurPage.alertes().length === 2, { timeout: 15000 }).catch(() => {});
verifier('rechargement : l’historique est relu', await page.evaluate(() => VeilleurPage.alertes().length === 2));
verifier('rechargement : aucune alerte déjà vue n’est rejouée', await page.evaluate(() => window.__evts.length === 0));

// réglages depuis l'interface
await page.evaluate(() => { const c = document.querySelector('#vlSection [data-r="types.OBSERVATION"]'); c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); });
await attendre(800);
verifier('réglages : une case coche enregistre dans reglages.json', lireF('reglages.json').types.OBSERVATION === true);
await page.evaluate(() => { const n = document.querySelector('#vlSection [data-n="maxParJour"]'); n.value = '2'; n.dispatchEvent(new Event('change', { bubbles: true })); });
await attendre(800);
verifier('réglages : un nombre est enregistré', lireF('reglages.json').maxParJour === 2);

// panneau Mars (rendu seul, sans galaxie) : module chargeable et rendu
const html = await page.evaluate(async () => {
  const m = await import(new URL('planetes/mars/pc/trading/panneau-alertes.js', document.baseURI).href);
  const p = m.creerPanneauAlertes(); document.body.appendChild(p.racine); await new Promise(r => setTimeout(r, 600)); const t = p.racine.textContent; p.detruire(); return t;
});
verifier('panneau Alertes : liste les alertes et dit les limites', /ENTRÉE · stratégie validée/.test(html) && /OBSERVATION · NON VALIDÉ/.test(html) && /PC est allumé/.test(html));
verifier('panneau Alertes : réglages visibles', /Activer le veilleur/.test(html));
const filtrees = erreurs.filter(e => !/Failed to load resource|ERR_|net::|workers\.dev|faireconomy/.test(e));
verifier('aucune erreur JavaScript', filtrees.length === 0, filtrees.slice(0, 3).join(' | '));
await navigateur.close(); srv.close();
process.exit(fin() ? 1 : 0);
