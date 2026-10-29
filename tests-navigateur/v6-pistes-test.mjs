import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { CHROME, attendre, compteur } from './terre-aide.mjs';
import * as E from '../strategies/agent-etat.js';
import { etatPepiniereVide, ajouterCandidate } from '../strategies/pepiniere.js';

/* V6 phase 3 — onglet « Meilleures pistes » de la fenêtre Agent, avec le VRAI serveur local et un vrai état écrit sur le disque (résultats de recherche, pépinière, plan d'attente) : cartes des 5 meilleures pistes
   (réussite, gain / risque, équilibre, avant / après frais, trades, preuve manquante), suivi en pépinière, filtre « 45 % / RR ≥ 2 » réglable, phrase des frais, plan d'attente ; PC et téléphone ; aucune erreur.
   Lancer : node tests-navigateur/v6-pistes-test.mjs */
const T = compteur(), PORT = 8158, BASE = 'http://127.0.0.1:' + PORT, maintenant = Date.now();
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-v6-ui-'));
const etat = E.etatInitial(maintenant - 5 * 86400e3);
const bt = (o = {}) => ({ id: 'x', famille: 'tendance_pullback_h4', nom: 'Tendance H4, repli sur H1', paire: 'BTC', type: 'exploration', statut: 'non_validee', esperance: 0.17, trades: 110, moisTest: 8, tauxReussite: 0.45, factProfit: 1.7, coutMoyenR: 0.06, bootstrapBas: -0.05, dsr: 0.7, propDdPct: 4, ddR: 8, ratees: ['Voisins des paramètres positifs'], retenus: { ema: 20, stopATR: 2, R: 2, sortie: 'fixe' }, t: maintenant, ...o });
etat.backtests.push(bt(), bt({ famille: 'cassure_h1_retest', nom: 'Cassure H1 avec volume, retest en ordre limite', paire: 'SOL', esperance: 0.12, bootstrapBas: 0.02, trades: 220, tauxReussite: 0.3, factProfit: 1.25, retenus: { N: 24 } }), bt({ famille: 'balayage_h1_delta', nom: 'Balayage de liquidité H1', paire: 'DOGE', esperance: -0.2, trades: 300, bootstrapBas: -0.3, tauxReussite: 0.28, factProfit: 0.8 }));
etat.frais = { t: maintenant, coutMoyenR: 0.25, trades: 1140738 }; etat.compteurVariantes = { BTC: 9000, SOL: 8000, DOGE: 7000 };
etat.recherche.niveaux = [{ id: 0, nom: 'base', total: 100, faits: 100 }, { id: 1, nom: 'guidée', total: 100, faits: 100 }, { id: 2, nom: 'filtrées', total: 288, faits: 288 }];
etat.recherche.attente = { attente: true, t: maintenant, lignes: ['J’ai exploré tout l’espace défini ET élargi : niveau 0 : 100 tâches ; niveau 1 : 100 tâches ; niveau 2 : 288 tâches — 24 000 variantes testées en tout (le compteur ne baisse jamais).', 'Ce que j’attends : les trades en direct de la pépinière ; de nouvelles hypothèses du Chercheur (sa prochaine séance est dans environ 9 heures).'], reprise: { heures: 9, texte: 'prochaine échéance dans environ 9 heures' } };
fs.writeFileSync(path.join(dossier, 'agent.json'), JSON.stringify(etat));
fs.writeFileSync(path.join(dossier, 'service.json'), JSON.stringify({ pid: process.pid, vivantLe: maintenant, phase: 'attente', raison: null, worker: { configure: false } }));
const pep = etatPepiniereVide(); ajouterCandidate(pep, { famille: 'tendance_pullback_h4', params: { ema: 20, stopATR: 2, R: 2, sortie: 'fixe' }, paire: 'BTC', nom: 'Tendance H4, repli sur H1', source: 'recherche (non validée : à surveiller)' }, maintenant - 10 * 86400e3);
pep.candidates[0].trades.push({ t: 1, tSortie: 2, sens: 1, R: 0.5, motif: 'cible' }, { t: 3, tSortie: 4, sens: 1, R: -1, motif: 'stop' }); fs.writeFileSync(path.join(dossier, 'pepiniere.json'), JSON.stringify(pep));
const srv = spawn(process.execPath, ['serveur.mjs', String(PORT)], { env: { ...process.env, RAYLE_AGENT_DOSSIER: dossier, RAYLE_PORT_RESEAU: String(PORT + 1) }, stdio: 'ignore' });
for (let k = 0; k < 50; k++) { try { if ((await fetch(BASE + '/index.html')).ok) break; } catch (e) { /* démarrage */ } await attendre(200); }

async function ouvrir({ largeur, hauteur, tactile = false }) {
  const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await nav.newPage(); await page.setViewport({ width: largeur, height: hauteur, hasTouch: tactile, isMobile: tactile });
  const erreurs = []; page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 300))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|CORS|net::|binance/i.test(m.text())) erreurs.push(m.text().slice(0, 300)); });
  await page.setRequestInterception(true); page.on('request', r => { if (/data-api\.binance\.vision/.test(r.url())) r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' }); else r.continue(); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); });
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1200);
  await page.evaluate(async () => { await import('/planetes/mars/pc/trading/fenetre-agent.js'); await window.PosteAgent.ouvrir({ vue: 'agent' }); }); await page.waitForSelector('.av3-vues', { timeout: 20000 }); await attendre(600);
  return { nav, page, erreurs };
}
try {
  const { nav, page, erreurs } = await ouvrir({ largeur: 1500, hauteur: 950 });
  const ev = (f, ...a) => page.evaluate(f, ...a), txt = s => ev(sel => (document.querySelector(sel) || {}).innerText || '', s);
  T.verifier('l’onglet « Meilleures pistes » existe dans la fenêtre Agent', await ev(() => [...document.querySelectorAll('[data-av3-vue]')].some(b => /Meilleures pistes/i.test(b.textContent))));
  await ev(() => document.querySelector('[data-av3-vue="pistes"]').click()); await page.waitForSelector('.av4-piste', { timeout: 15000 }); await attendre(300);
  const t = await txt('.av4'), cartes = await ev(() => document.querySelectorAll('.av4-piste').length);
  T.verifier('trois cartes (une par piste connue), la meilleure d’abord', cartes === 3 && /Tendance H4/.test(t.split('Balayage')[0]), String(cartes));
  T.verifier('la phrase des frais de l’état est affichée', /Frais moyens : 0,25 R par trade\. Taux de réussite minimal pour être rentable avec RR=2 : 42 %\./.test(t));
  T.verifier('statut honnête, preuve manquante en clair, avant / après frais, trades sur 150', /PROMETTEUSE, NON PROUVÉE/i.test(t) && /Preuve manquante/i.test(t) && /il manque 40 trades/.test(t) && /110 \/ 150/.test(t) && /Avant frais/i.test(t) && /Après frais/i.test(t));
  T.verifier('suivi en pépinière affiché pour la piste qui y est (2 trades, 10 jours)', /2<\/b> trade|2 trade\(s\) en 10 jour/.test(await ev(() => document.querySelector('.av4').innerHTML)) || /2 trade\(s\) en 10 jour/.test(t));
  T.verifier('plan d’attente : ce que Kepler attend et pour combien de temps', /Kepler attend, et sait quoi/i.test(t) && /Ce que j’attends/.test(t) && /environ 9 heures/.test(t));
  T.verifier('nombre de variantes et niveaux affichés', /24\s?000 variantes/.test(t) && /0 \(100\/100\)/.test(t));
  T.verifier('règle des tests multiples : ancienne par défaut', /ancienne \(tous les essais comptés/.test(t));
  const avant = await ev(() => document.querySelectorAll('.av4 .av4-profil ~ ul li').length);
  T.verifier('filtre de profil : liste initiale non vide (réussite 38–55 %, gain/risque ≥ 2)', avant >= 1, String(avant));
  await ev(() => { const c = document.querySelector('[data-av4-profil="tauxMin"]'); c.value = '60'; c.dispatchEvent(new Event('change', { bubbles: true })); });
  await attendre(200);
  T.verifier('changer le profil (réussite min 60 %) change la liste immédiatement (plus rien ne correspond)', /Aucune piste ne ressemble à ce profil/.test(await txt('.av4')));
  await ev(() => { const c = document.querySelector('[data-av4-profil="tauxMin"]'); c.value = '20'; c.dispatchEvent(new Event('change', { bubbles: true })); const m = document.querySelector('[data-av4-profil="tauxMax"]'); m.value = '60'; m.dispatchEvent(new Event('change', { bubbles: true })); const r = document.querySelector('[data-av4-profil="rrMin"]'); r.value = '1'; r.dispatchEvent(new Event('change', { bubbles: true })); });
  await attendre(200); T.verifier('un profil plus large retrouve des pistes, avec l’indication de ce qui est prometteur', /seulement prometteur/.test(await txt('.av4')));
  await page.screenshot({ path: 'docs/captures-v6/pistes-pc.png' }).catch(() => {});
  T.verifier('aucune erreur JavaScript (PC)', erreurs.length === 0, erreurs.slice(0, 2).join(' | '));
  await nav.close();
  const mob = await ouvrir({ largeur: 390, hauteur: 800, tactile: true });
  await mob.page.evaluate(() => document.querySelector('[data-av3-vue="pistes"]').click()); await mob.page.waitForSelector('.av4-piste', { timeout: 15000 });
  const debord = await mob.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
  T.verifier('téléphone : les cartes s’affichent sans débordement horizontal de la page', !debord);
  T.verifier('aucune erreur JavaScript (téléphone)', mob.erreurs.length === 0, mob.erreurs.slice(0, 2).join(' | '));
  await mob.nav.close();
} finally { srv.kill(); }
process.exit(T.fin() ? 1 : 0);
