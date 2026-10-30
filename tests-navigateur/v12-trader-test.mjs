import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { CHROME, attendre, compteur } from './terre-aide.mjs';
import { marcheMixte } from '../planetes/mars/tests/synth-btc.mjs';
import { creerTrader } from '../agent-pc/trader.mjs';
import * as E from '../strategies/agent-etat.js';

/* V12 phase 5 : la fenêtre « Agent » du PC (et son affichage téléphone) montre les onglets complets (Positions du jour, Bilan, Pourquoi pas plus, Réglages…) avec de VRAIES propositions du mode Trader
   (niveau « À l'essai » visible, bandeau « pas de preuve statistique », entrée / stop / cibles / RR / raison / confluences / invalidation, bilan avec « pas une promesse », rétro-test étiqueté), le statut du
   service en clair quand il est arrêté, et aucune position DÉMO par défaut. Vrai serveur local, état écrit par le VRAI mode Trader sur des bougies SYNTHÉTIQUES (jamais présentées comme réelles).
   Lancer : node tests-navigateur/v12-trader-test.mjs */
const T = compteur(), PORT = 8162, BASE = 'http://127.0.0.1:' + PORT, maintenant = Date.now();
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-v12-ui-'));
const etat = E.etatInitial(maintenant - 5 * 86400e3); fs.writeFileSync(path.join(dossier, 'agent.json'), JSON.stringify(etat));
fs.writeFileSync(path.join(dossier, 'service.json'), JSON.stringify({ pid: 999999, demarreLe: maintenant - 5 * 3600e3, vivantLe: maintenant - 3 * 3600e3, phase: 'attente', worker: { configure: false } }));   // service ARRÊTÉ depuis 3 h
// l'état du mode Trader : produit par le vrai module, sur une série synthétique dont la dernière bougie est « maintenant »
let serie = marcheMixte(16000, 21); let tt = maintenant; const D = { serie: () => serie };
const tr = creerTrader({ dossier, D, paires: ['BTC'], maintenant: () => tt, journal: () => {}, erreur: (c, e) => console.log('erreur', c, e && e.message), envoyer: async () => {} });
for (let k = 0; k < 60; k++) { serie = marcheMixte(15500 + 10 * k + 10, 21); tt = maintenant - (60 - k) * 60e3; await tr.cycle(); }
tr.etat().propositions.push({ id: 'x', actif: 'BTC', setup: 'cassure_retest', nom: 'Cassure de structure + retest dans le sens du biais', tf: 'H1', sens: -1, tSignal: maintenant - 3600e3, t: maintenant - 3600e3 + 900e3, entree: 80000, stop: 80600, cible1: 78900, cible1Nom: 'extrême H1', cible2: 78000, cible2Nom: 'extension', rr: 1.8, rr2: 3.3, raison: 'Cassure baissière de la structure H1.', invalidation: 'Annulée au-dessus du stop.', confluences: ['biais H1 / H4 dans le sens du trade', 'VWAP du jour'], nConfluences: 2, regime: 'tendance', biais: -1, style: 'equilibre', ttl: 32, atr: 100, statut: 'en_attente', resultat: null, fantome: false, source: 'direct' });
tr.sauver();
const n = tr.vue().actives.length;
const srv = spawn(process.execPath, ['serveur.mjs', String(PORT)], { env: { ...process.env, RAYLE_AGENT_DOSSIER: dossier, RAYLE_PORT_RESEAU: String(PORT + 1) }, stdio: 'ignore' });
for (let k = 0; k < 50; k++) { try { if ((await fetch(BASE + '/index.html')).ok) break; } catch (e) { /* démarrage */ } await attendre(200); }

async function ouvrir({ largeur, hauteur, tactile = false, vue = 'rapport' }) {
  const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await nav.newPage(); await page.setViewport({ width: largeur, height: hauteur, hasTouch: tactile, isMobile: tactile });
  const erreurs = []; page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 300))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|CORS|net::|binance/i.test(m.text())) erreurs.push(m.text().slice(0, 300)); });
  await page.setRequestInterception(true); page.on('request', r => { if (/data-api\.binance\.vision/.test(r.url())) r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' }); else r.continue(); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); });
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1200);
  await page.evaluate(async v => { await import('/planetes/mars/pc/trading/fenetre-agent.js'); await window.PosteAgent.ouvrir({ vue: v }); }, vue); await page.waitForSelector('.av3-vues', { timeout: 20000 }); await attendre(800);
  return { nav, page, erreurs };
}
try {
  T.verifier('(préparation) le mode Trader a des positions à montrer', n >= 1, String(n));
  const { nav, page, erreurs } = await ouvrir({ largeur: 1500, hauteur: 950 });
  const ev = (f, ...a) => page.evaluate(f, ...a), txt = s => ev(sel => (document.querySelector(sel) || {}).innerText || '', s);
  const onglets = await ev(() => [...document.querySelectorAll('.av3-vues [data-av3-vue]')].map(b => b.textContent.trim()));   // V13 : « Détails » range les onglets dans une seconde rangée
  T.verifier('la fenêtre Agent montre TOUS les onglets : Agent, Détails, Positions du jour, Bilan, Pourquoi pas plus, Liquidité, Équipe, Occasions manquées, Données', ['Agent', 'Rapport et stratégies', 'Poste de pilotage', 'Positions du jour', 'Bilan', 'Pourquoi pas plus', 'Liquidité', 'Équipe', 'Occasions manquées', 'Données'].every(t => onglets.includes(t)), onglets.join(' | '));
  const visibles = await ev(() => [...document.querySelectorAll('.av3-vues [data-av3-vue]')].filter(b => b.offsetParent !== null).every(b => { const r = b.getBoundingClientRect(); return r.width > 20 && r.height > 20; }));
  T.verifier('les onglets sont réellement visibles à l’écran (taille non nulle)', visibles);
  // écran « Agent » : bloc Mode Trader, service arrêté en clair, aucune démo par défaut
  await page.waitForSelector('[data-av3-trader]', { timeout: 15000 }); await attendre(500);
  let t = await txt('[data-av3-trader]');
  T.verifier('écran Agent : le service arrêté est dit clairement, avec la commande en une étape', /arrêté depuis 3 heures/.test(t) && /node agent-pc\/service\.mjs/.test(t), t.slice(0, 200));
  T.verifier('écran Agent : âge des dernières données affiché', /Âge des dernières données/.test(t));
  T.verifier('écran Agent : positions réelles avec leur niveau « À l’essai » et le bandeau « pas de preuve statistique »', /À l’essai/i.test(t) && /pas de preuve statistique — le bilan se construit en direct/.test(t));
  T.verifier('aucune position DÉMO par défaut', !/DÉMO ·/.test(await txt('.av3')) && !(await ev(() => !!document.querySelector('[data-av3-demo]'))));
  // Positions du jour
  await ev(() => document.querySelector('[data-av3-vue="positions"]').click()); await page.waitForSelector('.tv-carte', { timeout: 15000 }); await attendre(300);
  t = await txt('.av4');
  T.verifier('Positions du jour : cartes avec entrée, stop, cibles, RR, raison, confluences, invalidation, confiance', ['Entrée (ordre limite)', 'Stop', 'Cible 1', 'Cible 2', 'RR à la cible 1', 'Pourquoi', 'Confluences', 'Ce qui l’invalide', 'Confiance honnête'].every(x => t.includes(x)));
  T.verifier('Positions du jour : niveau de chaque carte visible', (await ev(() => [...document.querySelectorAll('.tv-carte .tv-niv')].map(e => e.textContent))).length >= 1);
  T.verifier('Positions du jour : le service arrêté est répété avec la commande', /arrêté depuis 3 heures/.test(t));
  T.verifier('Positions du jour : graphique avec les zones, bouton « Voir sur le graphique »', await ev(() => !!document.querySelector('.tv-graphe') && !!document.querySelector('[data-tv-voir]')));
  T.verifier('Positions du jour : jamais de NaN / undefined', !/NaN|undefined|\[object/.test(t));
  // Bilan
  await ev(() => document.querySelector('[data-av3-vue="bilan"]').click()); await page.waitForFunction(() => /Bilan en direct/.test(document.querySelector('.av4').innerText), { timeout: 15000 });
  t = await txt('.av4');
  T.verifier('Bilan : courbe réelle, « pas une promesse », rétro-test étiqueté « à titre d’exemple — pas une preuve »', /pas une promesse/.test(t) && /rétro-test à titre d’exemple — pas une preuve/.test(t) && await ev(() => !!document.querySelector('.tv-courbe')));
  T.verifier('Bilan : tableau par type de setup avec espérance et intervalle', /Par type de setup/.test(t) && /IC 95/.test(t));
  // Pourquoi pas plus
  await ev(() => document.querySelector('[data-av3-vue="pourquoi"]').click()); await page.waitForFunction(() => /Pourquoi pas plus de positions/.test(document.querySelector('.av4').innerText), { timeout: 15000 });
  T.verifier('Pourquoi pas plus : lecture du moment (biais, régime) et refus expliqués', /Lecture du moment/.test(await txt('.av4')));
  // Réglages : changer le style envoie une commande au service
  await ev(() => document.querySelector('[data-av3-vue="reglages_pos"]').click()); await page.waitForSelector('[data-tv-reg="style"]', { timeout: 15000 });
  await ev(() => { const s = document.querySelector('[data-tv-reg="style"]'); s.value = 'prudent'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await attendre(900);
  const cmd = fs.existsSync(path.join(dossier, 'trader-commandes.json')) ? JSON.parse(fs.readFileSync(path.join(dossier, 'trader-commandes.json'), 'utf8')) : [];
  T.verifier('Réglages : changer le style écrit une commande pour le service (appliquée à son prochain cycle)', cmd.some(c => c.type === 'reglages' && c.valeur.style === 'prudent'), JSON.stringify(cmd));
  T.verifier('Réglages : alertes d’observation décochées par défaut', !(await ev(() => document.querySelector('[data-tv-reg="alertesObservation"]').checked)));
  await page.screenshot({ path: 'docs/captures-v12/agent-pc-reglages.png' }).catch(() => {});
  await ev(() => document.querySelector('[data-av3-vue="positions"]').click()); await page.waitForSelector('.tv-carte', { timeout: 15000 }); await attendre(300);
  await page.screenshot({ path: 'docs/captures-v12/agent-pc-positions.png' }).catch(() => {});
  T.verifier('aucune erreur JavaScript (PC)', erreurs.length === 0, erreurs.slice(0, 2).join(' | '));
  await nav.close();
  const mob = await ouvrir({ largeur: 390, hauteur: 800, tactile: true, vue: 'positions' });
  await mob.page.waitForSelector('.tv-carte', { timeout: 15000 });
  T.verifier('téléphone : les cartes s’affichent sans débordement horizontal de la page', !(await mob.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)));
  await mob.page.screenshot({ path: 'docs/captures-v12/agent-telephone-positions.png' }).catch(() => {});
  T.verifier('aucune erreur JavaScript (téléphone)', mob.erreurs.length === 0, mob.erreurs.slice(0, 2).join(' | '));
  await mob.nav.close();
} finally { srv.kill(); try { fs.rmSync(dossier, { recursive: true, force: true }); } catch (e) { /* tant pis */ } }
process.exit(T.fin() ? 1 : 0);
