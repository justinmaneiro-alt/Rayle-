import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { CHROME, attendre, compteur } from './terre-aide.mjs';
import * as E from '../strategies/agent-etat.js';
import { equipeVide, executerChercheur, ecrireEquipe, ecrireRapportAuditeur } from '../agent-pc/equipe/equipe.mjs';
import { etatPepiniereVide, ajouterCandidate } from '../strategies/pepiniere.js';
import { creerStockage } from '../agent-pc/flux/stockage-flux.mjs';

/* V4 phase 9 — la fenêtre « Agent » a quatre onglets de plus : Liquidité, Équipe, Occasions manquées, Données. Vrai serveur local, vrai état écrit sur le disque (équipe, pépinière, occasions, exemples, carnet),
   service PC « vivant » simulé par un fichier d'état. Vérifie le contenu de chaque onglet, le lien vers la carte de liquidité, le réglage « observation » (désactivé par défaut), PC / tablette / téléphone, aucune erreur. */
const T = compteur(), PORT = 8157, BASE = 'http://127.0.0.1:' + PORT; fs.mkdirSync('docs/captures-v4', { recursive: true });
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-v4-ui-')), maintenant = Date.now();
fs.writeFileSync(path.join(dossier, 'agent.json'), JSON.stringify(E.etatInitial(maintenant - 5 * 86400e3)));
fs.writeFileSync(path.join(dossier, 'service.json'), JSON.stringify({ pid: process.pid, vivantLe: maintenant, phase: 'attente', raison: null, worker: { configure: false } }));
const eq = equipeVide(); const faux = async () => ({ texte: null, source: 'aucun modèle', essais: ['LM Studio injoignable'] });
const r = await executerChercheur({ dossier, equipe: eq, faits: {}, maintenant, completerImpl: faux }); ecrireEquipe(r.equipe, dossier);
ecrireRapportAuditeur(dossier, r.equipe, { ok: false, candidate: { id: 'balayage_retour', paire: 'BTC', nom: 'Balayage' }, rapport: ['# R'], resume: ['L’Auditeur la rejette : Signaux mélangés.', 'Rien n’est validé sans ce rapport.', 'Hypothèse de backtest, pas une promesse de gain.'], tests: [{ nom: 'Signaux mélangés', ok: false }] }, maintenant); ecrireEquipe(r.equipe, dossier);
const pep = etatPepiniereVide(); for (let i = 0; i < 4; i++) ajouterCandidate(pep, { famille: 'f' + i, params: {}, paire: 'BTC', nom: 'Famille ' + i, source: 'recherche (non validée : à surveiller)' }, maintenant); fs.writeFileSync(path.join(dossier, 'pepiniere.json'), JSON.stringify(pep));
fs.writeFileSync(path.join(dossier, 'occasions.json'), JSON.stringify({ BTC: { liste: [{ t: maintenant - 3600e3, sens: 1, ampleurATR: 3.4, prise: false, contexte: { phase: 'hausse', session: 'europe', absorption: true, divergence_cvd: false, balayage_liquidite: false, flux_persistant: true } }, { t: maintenant - 7200e3, sens: -1, ampleurATR: 4.1, prise: true, contexte: { phase: 'baisse', session: 'asie' } }] } }));
fs.writeFileSync(path.join(dossier, 'exemples.jsonl'), JSON.stringify({ t: maintenant - 1800e3, sens: 'achat', actif: 'BTC', prix: 81000, explication: { explique: true, par: ['absorption_extreme'] } }) + '\n' + JSON.stringify({ t: maintenant - 900e3, sens: 'vente', actif: 'SOL', prix: 100, explication: { explique: false, par: [] } }) + '\n');
const flux = path.join(dossier, 'flux'); fs.mkdirSync(flux, { recursive: true }); const st = creerStockage({ dossier: flux, tamponMs: 0 }); st.noterTrou({ t: maintenant - 60000, flux: 'kraken-BTC', raison: 'connexion coupée puis rétablie' }); st.vider();
fs.writeFileSync(path.join(flux, 'etat-flux.json'), JSON.stringify({ pid: process.pid, vivantLe: maintenant, premierEnregistrement: { 'binance-spot-BTC': maintenant - 3 * 86400e3 }, flux: { 'binance-spot-BTC': { pret: true }, 'kraken-BTC': { pret: true } }, erreurs: [] }));
const srv = spawn(process.execPath, ['serveur.mjs', String(PORT)], { env: { ...process.env, RAYLE_AGENT_DOSSIER: dossier, RAYLE_PORT_RESEAU: String(PORT + 1) }, stdio: 'ignore' });
for (let k = 0; k < 50; k++) { try { if ((await fetch(BASE + '/index.html')).ok) break; } catch (e) { /* démarrage */ } await attendre(200); }

async function ouvrir({ largeur, hauteur, tactile = false }) {
  const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await nav.newPage(); await page.setViewport({ width: largeur, height: hauteur, hasTouch: tactile, isMobile: tactile });
  const erreurs = []; page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 300))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|CORS|net::|binance/i.test(m.text())) erreurs.push(m.text().slice(0, 300)); });
  await page.setRequestInterception(true); page.on('request', r => { if (/data-api\.binance\.vision/.test(r.url())) r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' }); else r.continue(); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); });
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1200);
  await page.evaluate(async () => { await import('/planetes/mars/pc/trading/fenetre-agent.js'); await window.PosteAgent.ouvrir({ vue: 'rapport' }); }); await page.waitForSelector('.av3-vues', { timeout: 20000 }); await attendre(800);
  return { nav, page, erreurs };
}
let { nav, page, erreurs } = await ouvrir({ largeur: 1500, hauteur: 950 });
const ev = (f, ...a) => page.evaluate(f, ...a), txt = s => ev(sel => (document.querySelector(sel) || {}).innerText || '', s), onglet = async k => { await ev(k2 => document.querySelector('[data-av3-vue="' + k2 + '"]').click(), k); await attendre(1800); };
T.verifier('la barre de la fenêtre Agent a les 4 nouveaux onglets', await ev(() => ['liquidite', 'equipe', 'occasions', 'donnees'].every(k => !!document.querySelector('[data-av3-vue="' + k + '"]'))) && /Occasions manquées/.test(await ev(() => document.querySelector('.av3-vues').textContent)));
await onglet('liquidite');
T.verifier('Liquidité : lien « Ouvrir la carte de liquidité », preuve (jours de carnet) et « hypothèse, jamais une promesse »', /Ouvrir la carte de liquidité/.test(await txt('.av4')) && /3,0 jour/.test(await txt('.av4')) && /jamais une promesse/.test(await txt('.av4')) && /Historique des trades : des années/.test(await txt('.av4')), (await txt('.av4')).slice(0, 200));
await ev(() => document.querySelector('[data-av4-carte="BTC"]').click()); await attendre(2500); T.verifier('le bouton ouvre la carte de liquidité', await ev(() => !!document.querySelector('.pn.lq-fenetre'))); await ev(() => window.CarteLiquidite && window.CarteLiquidite.fermer()); await attendre(400);
if (!(await ev(() => !!document.querySelector('.av3-vues')))) { await ev(async () => { await window.PosteAgent.ouvrir({ vue: 'rapport' }); }); await page.waitForSelector('.av3-vues', { timeout: 20000 }); await attendre(600); }   // le système de fenêtres ferme les autres grandes fenêtres : on rouvre l'Agent
await onglet('equipe');
T.verifier('Équipe : trois rôles (Kepler, Chercheur, Auditeur) avec leur rôle', await ev(() => document.querySelectorAll('.av4-role-carte').length === 3) && /Exécutant/.test(await txt('.av4')) && /n’a pas le droit de valider/.test(await txt('.av4')) && /Essaie de casser/.test(await txt('.av4')));
T.verifier('Équipe : dernier rapport de chacun en trois lignes (dont celui de l’Auditeur rejetant)', await ev(() => [...document.querySelectorAll('.av4-role-carte')].every(c => c.querySelectorAll('li').length >= 1)) && /L’Auditeur la rejette/.test(await txt('.av4')));
T.verifier('Équipe : hypothèses du Chercheur avec raison économique et statut, budget du jour', await ev(() => document.querySelectorAll('.av4-hyp li').length >= 5) && /car /.test(await txt('.av4-hyp')) && /Budget du jour|budget du jour/i.test(await txt('.av4')), (await txt('.av4-hyp')).slice(0, 120));
T.verifier('Équipe : la pépinière est décrite (voie séquentielle « à valider par Justin »)', /pépinière live/i.test(await txt('.av4')) && /à valider par Justin/.test(await txt('.av4')));
T.verifier('Équipe : l’observation est DÉSACTIVÉE par défaut', await ev(() => document.querySelector('[data-av4-observation]').checked === false) && /désactivées par défaut/.test(await txt('.av4')));
await ev(() => document.querySelector('[data-av4-observation]').click()); await attendre(800);
T.verifier('la case « observation » envoie la commande au service (commandes.json)', (() => { try { return JSON.parse(fs.readFileSync(path.join(dossier, 'commandes.json'), 'utf8')).some(c => c.type === 'observation' && c.valeur === true); } catch (e) { return false; } })());
await page.screenshot({ path: 'docs/captures-v4/agent-equipe.png' });
await onglet('occasions');
T.verifier('Occasions manquées : le garde-fou est visible (génère des hypothèses, ne valide jamais)', /jamais à les valider/.test(await txt('.av4-garde')) && /retestée sur des données qu’elle n’a pas vues/.test(await txt('.av4-garde')));
T.verifier('Occasions : la manquée (hausse, absorption) est listée, la prise ne l’est pas ; tes exemples avec « expliqué / pas expliqué »', /hausse de 3,4 ATR/.test(await txt('.av4')) && !/baisse de 4,1/.test(await txt('.av4')) && /expliqué par absorption_extreme/.test(await txt('.av4')) && /pas expliqué par mes signaux/.test(await txt('.av4')));
await onglet('donnees');
T.verifier('Données : jours de carnet, taille et quota, trous, flux prêts', /Enregistre|ARRÊTÉ/.test(await txt('.av4')) && /sur 15 Go/.test(await txt('.av4')) && /trous : 1/.test(await txt('.av4')) && /connexion coupée puis rétablie/.test(await txt('.av4')) && await ev(() => !!document.querySelector('.av4-jauge')), (await txt('.av4')).slice(0, 250));
T.verifier('Données : l’historique des transactions non installé est dit, avec la commande', /Pas encore installé|installer-flux/.test(await txt('.av4')));
T.verifier('aucune erreur console (PC)', erreurs.length === 0, erreurs.join(' | ').slice(0, 300));
await nav.close();
/* tablette et téléphone */
for (const [nom, l, h] of [['tablette', 820, 1180], ['telephone', 390, 800]]) {
  ({ nav, page, erreurs } = await ouvrir({ largeur: l, hauteur: h, tactile: true })); await onglet('equipe');
  const m = await ev(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth, cartes: document.querySelectorAll('.av4-carte').length }));
  T.verifier(nom + ' : l’onglet Équipe ne déborde pas horizontalement', m.sw <= m.iw + 1 && m.cartes >= 4, JSON.stringify(m)); await page.screenshot({ path: 'docs/captures-v4/agent-equipe-' + nom + '.png' });
  T.verifier(nom + ' : aucune erreur console', erreurs.length === 0, erreurs.join(' | ').slice(0, 200)); await nav.close();
}
srv.kill(); fs.rmSync(dossier, { recursive: true, force: true }); T.fin();
