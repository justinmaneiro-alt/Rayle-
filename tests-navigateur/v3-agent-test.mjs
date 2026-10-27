import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { CHROME, attendre, compteur } from './terre-aide.mjs';
import * as E from '../strategies/agent-etat.js';

/* V3 phase 2 — l'écran « Agent » simple, dans Chrome, avec un VRAI serveur local (routes /__agent/…), un état d'agent écrit sur le disque et de FAUSSES bougies Binance :
   phrase du haut, Pause / Reprendre (écrit commandes.json), trois chiffres + version, graphique avec positions (entrée, stop, objectifs en R), positions DÉMO étiquetées, deux courbes séparées,
   rapport en 5 lignes, mots expliqués, onglet Détails intact, PC / tablette / téléphone (aucun débordement horizontal). Captures : docs/captures-v3/. */
const T = compteur(), PORT = 8137, BASE = 'http://127.0.0.1:' + PORT, PAS = 900e3;
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-page-')); fs.mkdirSync('docs/captures-v3', { recursive: true });
const maintenant = Date.now(), J = 86400e3, validation = { statut: 'validee_backtest', esperance: 0.35, trades: 210, t: maintenant - 40 * J };
const etat = E.etatInitial(maintenant - 60 * J);
E.creerVersion(etat, { candidates: [{ famille: 'tendance_ma', paire: 'BTC', params: { touche: 0.3 }, validation }, { famille: 'fin_range', paire: 'SOL', params: { N: 96 }, validation }], raison: 'tendance_ma sur BTC, fin_range sur SOL validées' }, maintenant - 30 * J);
etat.compteurVariantes = { BTC: 2973, SOL: 1200, DOGE: 640 }; etat.recherche = { enCours: null, derniere: maintenant, cycles: 12, epuise: true };
etat.rapport = { t: maintenant - 3600e3, semaine: '2026-S44', lignes: ['Je surveille le marché avec 2 stratégies (version v1).', 'J’ai testé 4 813 variantes de stratégies jusqu’ici.', 'Meilleur essai : Tendance sur moyennes mobiles sur BTC, 0,35 R par trade hors échantillon.', 'Stratégies suivies : Tendance BTC (en simulation), Fin de range SOL (en simulation).', 'Rappel : les résultats passés ne garantissent rien et aucun ordre n’est exécuté.'], source: 'texte écrit par le code (aucun modèle utilisé)' };
etat.backtests.push({ id: 'tendance_ma:BTC:exploration', famille: 'tendance_ma', nom: 'Tendance sur moyennes mobiles', paire: 'BTC', statut: 'validee_backtest', t: maintenant, trades: 210, esperance: 0.35, courbeR: Array.from({ length: 120 }, (_, i) => +(i * 0.6 + Math.sin(i / 4) * 3).toFixed(2)) });
etat.alertes.push({ cle: 'a1', type: 'ENTREE', t: maintenant - 3600e3, titre: '🟢 SIMULATION · ACHAT · Tendance · BTC', texte: 't', mode: 'SIMULATION', lue: false });
const idBTC = E.idStrategie('tendance_ma', 'BTC', { touche: 0.3 }), prixBTC = 67000, dt = prixBTC * 0.01;
const suivi = { [idBTC]: { version: 1, derniereBarre: maintenant, pendante: null, position: { s: 1, fill: prixBTC, stop: prixBTC - dt, cible: prixBTC + 4 * dt, R: 4, t: maintenant - 4 * PAS, raison: ['Tendance sur moyennes mobiles : signal d’achat à la clôture de la bougie M15.', 'Contexte : H1 en phase « hausse », H4 « hausse ».'], tailles: { risque: 100, quantite: 0.1492, valeur: 10000, effet: 1 } },
  trades: [{ t: maintenant - 5 * J, tSortie: maintenant - 5 * J + 6 * 3600e3, sens: 1, prixEntree: 64000, stop: 63400, cible: 66400, prixSortie: 66400, R: 3.7, motif: 'cible', barres: 24, version: 1 }, { t: maintenant - 3 * J, tSortie: maintenant - 3 * J + 2 * 3600e3, sens: -1, prixEntree: 66000, stop: 66600, cible: 63600, prixSortie: 66600, R: -1.1, motif: 'stop', barres: 8, version: 1 }], equite: [] } };
fs.writeFileSync(path.join(dossier, 'agent.json'), JSON.stringify(etat)); fs.writeFileSync(path.join(dossier, 'suivi.json'), JSON.stringify(suivi));
fs.writeFileSync(path.join(dossier, 'service.json'), JSON.stringify({ pid: process.pid, vivantLe: maintenant, phase: 'attente', raison: null, worker: { configure: false } }));

const serveur = spawn(process.execPath, ['serveur.mjs', String(PORT)], { env: { ...process.env, RAYLE_AGENT_DOSSIER: dossier, RAYLE_PORT_RESEAU: String(PORT + 1) }, stdio: 'ignore' });
for (let k = 0; k < 50; k++) { try { if ((await fetch(BASE + '/index.html')).ok) break; } catch (e) { /* démarrage */ } await attendre(200); }
const klines = () => { const out = []; const fin = Math.floor(Date.now() / PAS) * PAS - PAS; for (let i = 499; i >= 0; i--) { const t = fin - i * PAS, c = prixBTC + Math.sin(i / 20) * 600 + (500 - i) * 2; out.push([t, String(c - 20), String(c + 60), String(c - 70), String(c), '10', 0, 0, 0, '5']); } return out; };

async function ouvrirPage({ largeur, hauteur, tactile = false }) {
  const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await nav.newPage(); await page.setViewport({ width: largeur, height: hauteur, hasTouch: tactile, isMobile: tactile, deviceScaleFactor: tactile ? 2 : 1 });
  const erreurs = []; page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 300))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|CORS/.test(m.text())) erreurs.push(m.text().slice(0, 240)); });
  await page.setRequestInterception(true);
  page.on('request', r => { if (/data-api\.binance\.vision/.test(r.url())) r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(klines()) }); else r.continue(); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.removeItem('rayle_agent_vue'); localStorage.removeItem('rayle_agent_demo'); });
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1200);
  await page.evaluate(async () => { await import('/planetes/mars/pc/trading/fenetre-agent.js'); await window.PosteAgent.ouvrir({ vue: 'agent' }); });
  await page.waitForSelector('.av3-phrase', { timeout: 15000 }); await attendre(1800);
  return { nav, page, erreurs };
}
let { nav, page, erreurs } = await ouvrirPage({ largeur: 1500, hauteur: 950 });
const ev = (f, ...a) => page.evaluate(f, ...a), txt = s => ev(sel => (document.querySelector(sel) || {}).textContent || '', s);

T.verifier('l’écran s’ouvre sur « Agent » (pas sur le poste chargé d’avant)', await ev(() => document.querySelector('.mars-poste [data-vue], [data-vue]').dataset.vue === 'agent') && await ev(() => getComputedStyle(document.querySelector('.av3-pane-agent')).display !== 'none' && getComputedStyle(document.querySelector('.av3-pane-details')).display === 'none'));
T.verifier('en haut : UNE phrase « Que fait l’agent maintenant ? » et le statut', /Que fait l’agent maintenant/.test(await txt('.av3-phrase')) && /position proposée/i.test(await txt('.av3-rep')), await txt('.av3-rep'));
T.verifier('pas de bouton « Lancer » : Pause et charge seulement', await ev(() => { const c = document.querySelector('.av3-ctl'); return !!c.querySelector('[data-av3="pause"]') && !!c.querySelector('[data-av3-charge]') && !/lancer/i.test(c.textContent) && ![...document.querySelectorAll('.av3 button')].some(b => /lancer/i.test(b.textContent)); }));
T.verifier('trois chiffres : 4 813 variantes, 2 stratégies validées, alertes ; version v1 et sa date', await ev(() => { const t = document.querySelector('.av3-chiffres').textContent.replace(/\s/g, ' '); return /4 813/.test(t) && /2stratégies validées/.test(t) && /alertes actives/.test(t) && /v1/.test(t) && /validée le/.test(t); }), (await txt('.av3-chiffres')).replace(/\s+/g, ' '));
T.verifier('« variantes testées » est expliqué (survol / toucher)', await ev(() => { const a = [...document.querySelectorAll('.av3-chiffres abbr.av3-t')].find(x => /variantes/.test(x.textContent)); return !!a && /pas une note|plus il est grand/.test(a.dataset.def) && a.tabIndex === 0; }));
T.verifier('le dernier rapport : 5 lignes, source indiquée', await ev(() => document.querySelectorAll('.av3-rapport li').length === 5 && /source/.test(document.querySelector('.av3-rapport small').textContent)));
T.verifier('l’avertissement « ne garantissent rien / aucun ordre » est visible', /ne garantissent rien/.test(await txt('.av3-pied')) && /Aucun ordre/.test(await txt('.av3-pied')));
T.verifier('l’origine de l’état est dite : lu sur le PC', /État lu sur : PC/.test(await txt('.av3-src')));
// graphique
await page.waitForSelector('.av3-graph-boite canvas', { timeout: 15000 });
T.verifier('graphique : bougies tracées (canvas), barre paire / stratégie / version', await ev(() => document.querySelectorAll('.av3-graph-boite canvas').length >= 1 && !!document.querySelector('[data-av3-strat]') && !!document.querySelector('[data-av3-version]') && document.querySelectorAll('[data-av3-paire]').length === 3));
T.verifier('position en cours : ACHAT, entrée, stop, objectifs, raison, taille pour 1 %', await ev(() => { const l = document.querySelector('.av3-liste').textContent; return /ACHAT en cours · 1 pour 4,0/.test(l) && /entrée 67 000|entrée 67000|entrée 67/.test(l.replace(/\s/g, ' ')) && /stop 66/.test(l) && /taille pour risquer 1 %/.test(l) && /Contexte : H1/.test(l); }), await txt('.av3-liste'));
T.verifier('positions passées avec leur résultat en R (gain et perte)', await ev(() => { const l = document.querySelector('.av3-liste').textContent; return /clôturée \(gain\)/.test(l) && /clôturée \(perte\)/.test(l) && /\+3,7 R/.test(l) && /−1,1 R/.test(l); }));
T.verifier('deux courbes de capital SÉPARÉES et étiquetées (simulé / backtest)', await ev(() => { const c = [...document.querySelectorAll('.av3-courbe h4')].map(x => x.textContent); return c.length === 2 && /simulé/i.test(c[0]) && /Backtest hors échantillon/.test(c[1]) && document.querySelectorAll('.av3-courbe canvas').length >= 2; }));
// démo
await ev(() => document.querySelector('[data-av3-demo]').click()); await attendre(1500);
T.verifier('positions DÉMO : cochées, TOUTES marquées « DÉMO »', await ev(() => { const l = [...document.querySelectorAll('.av3-liste li.av3-demo')]; return l.length === 3 && l.every(x => /DÉMO/.test(x.textContent)); }));
await page.screenshot({ path: 'docs/captures-v3/agent-accueil-pc.png' });
await ev(() => document.querySelector('[data-av3-demo]').click()); await attendre(1200);
T.verifier('démo décochée : plus aucune position DÉMO', await ev(() => document.querySelectorAll('.av3-liste li.av3-demo').length === 0));
// pause / reprise
await ev(() => document.querySelector('[data-av3="pause"]').click()); await attendre(1500);
let cmd = JSON.parse(fs.readFileSync(path.join(dossier, 'commandes.json'), 'utf8'));
T.verifier('« Pause » : la commande est écrite pour le service (commandes.json)', cmd.length === 1 && cmd[0].type === 'pause', JSON.stringify(cmd));
await ev(() => { const s = document.querySelector('[data-av3-charge]'); s.value = 'faible'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await attendre(1000);
cmd = JSON.parse(fs.readFileSync(path.join(dossier, 'commandes.json'), 'utf8'));
T.verifier('charge « faible » : commande écrite', cmd.some(c => c.type === 'charge' && c.valeur === 'faible'));
// le service applique : on simule en réécrivant l'état avec pause
const e2 = JSON.parse(fs.readFileSync(path.join(dossier, 'agent.json'), 'utf8')); e2.parametresRisque.pause = true; fs.writeFileSync(path.join(dossier, 'agent.json'), JSON.stringify(e2));
await ev(() => window.PosteAgent.accueil().rafraichir()); await attendre(1800);
T.verifier('état en pause : « en pause » et bouton « Reprendre »', /en pause/i.test(await txt('.av3-rep')) && await ev(() => !!document.querySelector('[data-av3="reprendre"]')));
// glossaire au survol (title + data-def)
T.verifier('mot technique expliqué en une ligne (title et data-def)', await ev(() => { const a = document.querySelector('abbr.av3-t'); return !!a && a.title.length > 20 && a.title === a.dataset.def; }));
// onglet Détails intact
await ev(() => document.querySelector('[data-av3-vue="details"]').click()); await attendre(1200);
T.verifier('« Détails » : le poste de pilotage d’avant est là (onglets marché, stratégies, portefeuille, gardien, journal…)', await ev(() => { const p = document.querySelector('.av3-pane-details'); return getComputedStyle(p).display !== 'none' && !!p.querySelector('.pa-poste') && p.querySelectorAll('.pa-onglets [data-onglet]').length >= 14; }));
await page.screenshot({ path: 'docs/captures-v3/agent-details-pc.png' });
await ev(() => document.querySelector('[data-av3-vue="agent"]').click()); await attendre(800);
T.verifier('retour à « Agent »', await ev(() => getComputedStyle(document.querySelector('.av3-pane-agent')).display !== 'none'));
T.verifier('aucune erreur JavaScript (PC)', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
await nav.close();
// tablette et téléphone : aucun débordement horizontal, graphique lisible
for (const [nom, l, h] of [['tablette', 1180, 820], ['telephone', 390, 844]]) {
  ({ nav, page, erreurs } = await ouvrirPage({ largeur: l, hauteur: h, tactile: true }));
  const ev2 = (f, ...a) => page.evaluate(f, ...a);
  T.verifier(nom + ' : aucun défilement horizontal de la page', await ev2(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && ![...document.querySelectorAll('.av3, .av3-pane-agent, .av3 section')].some(e => e.scrollWidth > e.clientWidth + 2)));
  T.verifier(nom + ' : boutons tactiles d’au moins 40 px', await ev2(() => [...document.querySelectorAll('.av3-btn, .av3-vues button, .av3-paires button')].every(b => b.getBoundingClientRect().height >= 40)));
  T.verifier(nom + ' : le graphique et les courbes s’affichent', await ev2(() => { const g = document.querySelector('.av3-graph-boite'); return g.getBoundingClientRect().width > 250 && g.querySelectorAll('canvas').length >= 1 && document.querySelectorAll('.av3-courbe canvas').length >= 2; }));
  await ev2(() => document.querySelector('[data-av3-demo]').click()); await attendre(1200);
  await page.screenshot({ path: 'docs/captures-v3/agent-accueil-' + nom + '.png' });
  T.verifier(nom + ' : aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2).join(' | '));
  await nav.close();
}
// service arrêté / aucune donnée : écran honnête
fs.unlinkSync(path.join(dossier, 'agent.json'));
({ nav, page } = await ouvrirPage({ largeur: 1300, hauteur: 800 }).catch(() => ({})));
if (page) { T.verifier('sans agent ni Worker : « Je ne peux pas le savoir » (aucun chiffre inventé) et la marche à suivre', await page.evaluate(() => /Je ne peux pas le savoir/.test(document.body.textContent) && /installer-agent/.test(document.body.textContent) && !document.querySelector('.av3-chiffres'))); await nav.close(); }
serveur.kill(); fs.rmSync(dossier, { recursive: true, force: true });
process.exit(T.fin() ? 1 : 0);
