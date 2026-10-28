import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { CHROME, attendre, compteur } from './terre-aide.mjs';

/* V3b : l'« Agent BTC » du terminal de Mars et les fenêtres de la table lisent l'état de l'agent KEPLER (service PC), pas l'ancien agent du navigateur.
   Test SUR LES VRAIS CHIFFRES : le serveur local lit le vrai dossier de l'agent (%LOCALAPPDATA%\Rayle\agent) et la page est comparée à `node agent-pc/service.mjs --statut` ; les bougies M15 du régime
   viennent du vrai Binance (gratuit, sans clé). Vérifie : page simple par défaut (phrase, trois chiffres, version, graphique ou message, rapport 5 lignes, Pause / Reprendre), plus de « Lancer la recherche »,
   onglet « Détails » = l'ancienne page intacte, fenêtres Agent BTC / Propositions / Régime utiles sans position, « Agent stratège » expliqué. Captures : docs/captures-v3b/.
   Navigateur piloté : Chrome par puppeteer-core (le projet n'utilise pas Playwright). Lancer : node tests-navigateur/v3b-agent-table-test.mjs   (le service de l'agent doit tourner : node agent-pc/service.mjs --statut) */
const T = compteur(), PORT = 8139, BASE = 'http://127.0.0.1:' + PORT;
fs.mkdirSync('docs/captures-v3b', { recursive: true });
const cli = JSON.parse(execFileSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'agent-pc/service.mjs', '--statut'], { encoding: 'utf8' }));
const fr = n => Number(n).toLocaleString('fr-FR').replace(/\s| /g, ' ');
const nombres = t => [Number(String(t).replace(/\D/g, ''))];
console.log('Service PC (CLI) :', cli.agent, '·', cli.statut, '·', cli.variantesTestees, 'variantes · en marche :', cli.service && cli.service.enMarche);
T.verifier('le service de l’agent tourne (vérité terrain de ce test)', !!(cli.service && cli.service.enMarche) && cli.variantesTestees > 0, JSON.stringify({ variantes: cli.variantesTestees, marche: cli.service && cli.service.enMarche }));

const serveur = spawn(process.execPath, ['serveur.mjs', String(PORT)], { env: { ...process.env, RAYLE_PORT_RESEAU: String(PORT + 1) }, stdio: 'ignore' });
for (let k = 0; k < 60; k++) { try { if ((await fetch(BASE + '/index.html')).ok) break; } catch (e) { /* démarrage */ } await attendre(200); }
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await nav.newPage(); await page.setViewport({ width: 1500, height: 950 });
const erreurs = []; page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 300)));
await page.setRequestInterception(true);
page.on('request', r => { const u = r.url(); if (/data-api\.binance\.vision\/api\/v3\/klines/.test(u) && /startTime=/.test(u)) r.abort(); else r.continue(); });   // le téléchargement d'historique de l'ancien agent n'est pas l'objet du test
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.removeItem('rayle_agent_vue'); } catch (e) { /* stockage refusé */ } });
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1500);
const ev = (f, ...a) => page.evaluate(f, ...a);

// ═══ 1. l'API locale donne les vrais chiffres ═══
const api = await ev(async () => (await fetch('/__agent/etat', { cache: 'no-store' })).json());
const sommeApi = api.etat && Object.values(api.etat.compteurVariantes).reduce((a, b) => a + b, 0);
T.verifier('/__agent/etat (serveur local) : le même nombre de variantes que service.mjs --statut', api.ok && api.existe && Math.abs(sommeApi - cli.variantesTestees) <= 400, `${sommeApi} vs ${cli.variantesTestees}`);

// ═══ 2. le panneau « Agent BTC » du terminal de Mars (onglet du bas) ═══
await ev(async () => { const M = await import('/planetes/mars/pc/trading/fenetre.js'); await M.ouvrirEspace({ instrument: 'BTC', unite: 'M15', dock: 'agent', focus: 'agent' }); });
await page.waitForSelector('.tg-agent-v3 .av3-phrase', { timeout: 30000 }); await attendre(2500);
const p1 = await ev(() => {
  const r = document.querySelector('.tg-agent-v3'), vis = e => !!e && e.offsetParent !== null, t = r.querySelector('.av3-pane-agent');
  return { texte: t.innerText, onglets: [...r.querySelectorAll('[data-av3-vue]')].map(b => b.textContent + (b.classList.contains('actif') ? '*' : '')), phrase: (r.querySelector('.av3-phrase p') || {}).textContent || '',
    cartes: [...r.querySelectorAll('.av3-carte')].map(c => ({ b: c.querySelector('b').textContent, s: c.querySelector('span').textContent })), rapport: [...r.querySelectorAll('.av3-rapport li')].length, graphique: !!r.querySelector('.av3-graphique, .av3-graph, [data-av3-graph]') || /Graphique|position/i.test(t.innerText),
    src: (r.querySelector('.av3-src') || {}).textContent || '', boutons: [...r.querySelectorAll('.av3-pane-agent button')].filter(vis).map(b => b.textContent.trim()), paneDetailsVide: r.querySelector('.av3-pane-details').children.length === 0 };
});
T.verifier('Agent BTC : la page simple est affichée par défaut (onglet « Agent » actif, « Détails » à côté)', p1.onglets[0] === 'Agent*' && p1.onglets[1] === 'Détails', JSON.stringify(p1.onglets));
T.verifier('Agent BTC : plus de « PAS DE RECHERCHE » ni de « Lancer la recherche » sur la page principale', !/PAS DE RECHERCHE|Lancer la recherche|Relancer la recherche/i.test(p1.texte), p1.texte.slice(0, 100));
T.verifier('Agent BTC : la phrase d’état est là (« Que fait l’agent maintenant ? »)', /que fait l’agent/i.test(p1.texte) && p1.phrase.length > 20, p1.phrase);
const variantes = p1.cartes.find(c => /variantes/.test(c.s));
T.verifier('Agent BTC : « variantes testées » = le vrai chiffre du service PC (pas 0)', variantes && nombres(variantes.b)[0] >= cli.variantesTestees && nombres(variantes.b)[0] < cli.variantesTestees + 5000, JSON.stringify(p1.cartes));
T.verifier('Agent BTC : stratégies validées, version active présentes', p1.cartes.some(c => /validées/.test(c.s)) && p1.cartes.some(c => /version active/.test(c.s)), JSON.stringify(p1.cartes.map(c => c.s)));
T.verifier('Agent BTC : la source est dite (« État lu sur : PC »)', /État lu sur : PC/.test(p1.src), p1.src);
T.verifier('Agent BTC : rapport de l’agent (au plus 5 lignes) ou mention claire', p1.rapport <= 5 && (p1.rapport > 0 || /rapport/i.test(p1.texte)), String(p1.rapport));
T.verifier('Agent BTC : graphique avec positions, ou message clair s’il n’y en a pas', /Graphique|position|Aucune/i.test(p1.texte), p1.texte.slice(0, 300).replace(/\n/g, ' | '));
T.verifier('Agent BTC : Pause / Reprendre présents, AUCUN bouton « Lancer »', p1.boutons.some(b => /Pause|Reprendre|reprendre|pause/i.test(b)) && !p1.boutons.some(b => /Lancer|Démarrer/i.test(b)), JSON.stringify(p1.boutons));
T.verifier('Agent BTC : l’ancienne page n’est pas construite tant qu’on ne clique pas « Détails » (rien de téléchargé pour rien)', p1.paneDetailsVide);
await page.screenshot({ path: 'docs/captures-v3b/agent-btc-terminal.png' });
// onglet Détails
await ev(() => document.querySelector('.tg-agent-v3 [data-av3-vue="details"]').click()); await attendre(1500);
const d1 = await ev(() => { const r = document.querySelector('.tg-agent-v3'); const d = r.querySelector('.av3-pane-details'); return { vue: r.querySelector('.av3-wrap').dataset.vue, contenu: !!d.querySelector('.tg-agent .ag-haut, .ag-grille'), boutons: [...d.querySelectorAll('button')].map(b => b.textContent.trim()), texte: d.innerText.slice(0, 400) }; });
T.verifier('« Détails » : l’ancienne page est là, intacte (grille marché, setup, journal…)', d1.vue === 'details' && d1.contenu, JSON.stringify(d1).slice(0, 200));
T.verifier('« Détails » : le bouton « Lancer la recherche » est supprimé (l’agent tourne tout seul)', !d1.boutons.some(b => /Lancer|Relancer|Arrêter/.test(b)), JSON.stringify(d1.boutons));
T.verifier('« Détails » : les autres commandes de l’ancienne page restent (mise à jour des données)', d1.boutons.some(b => /Mettre à jour/.test(b)), JSON.stringify(d1.boutons));
await page.screenshot({ path: 'docs/captures-v3b/agent-btc-details.png' });
await ev(() => document.querySelector('.tg-agent-v3 [data-av3-vue="agent"]').click()); await attendre(500);
T.verifier('retour à l’onglet « Agent »', await ev(() => document.querySelector('.tg-agent-v3 .av3-wrap').dataset.vue === 'agent'));

// ═══ 3. « Agent stratège » ═══
const strat = await ev(async () => { const E = await import('/planetes/mars/pc/trading/espace.js'); const inst = E.PANNEAUX.strategie.creer({}); return { etat: E.PANNEAUX.strategie.etat, texte: inst.racine.innerText }; });
T.verifier('« Agent stratège » : plus de « Arrive à l’étape M4 »', !/ARRIVE|M4/i.test(strat.texte), strat.texte);
T.verifier('« Agent stratège » : une phrase claire (pas d’agent séparé, Kepler fait le travail, rien d’inventé)', /pas d’agent stratège séparé/i.test(strat.texte) && /Kepler/.test(strat.texte) && /inventé/.test(strat.texte));

// ═══ 4. les fenêtres de la table (Agent BTC, Propositions, Régime) ═══
const reels = await ev(async () => {
  const M6 = await import('/planetes/mars/pc/trading/fenetres-m6.js'), R = await import('/planetes/mars/pc/trading/rendu-reel.js'); window.__reels = {};
  window.__stop = M6.demarrerFenetresM6({ majReel: (id, r) => { window.__reels[id] = r; }, actif: () => true });
  const t0 = Date.now(); while (Date.now() - t0 < 60000) { const r = window.__reels; if (r['agent-btc'] && r['propositions-agent'] && r['regime-marche'] && r['regime-marche'].etat === 'ok' && r['regime-marche'].liste.length >= 3) break; await new Promise(x => setTimeout(x, 500)); }
  const out = {}; for (const id of ['agent-btc', 'propositions-agent', 'regime-marche']) { const r = window.__reels[id]; out[id] = r ? { etat: r.etat, etiquette: r.etiquette, liste: r.liste, entete: r.entete, pied: r.pied, erreur: r.erreur, message: r.message, html: R.reelVersHtml(r, {}) } : null; }
  return out;
});
const a = reels['agent-btc'], pr = reels['propositions-agent'], rg = reels['regime-marche'];
T.verifier('fenêtre « Agent BTC » de la table : état ok lu sur le service du PC', a && a.etat === 'ok' && /service du PC/.test(a.etiquette), a && a.etiquette);
T.verifier('fenêtre « Agent BTC » : variantes testées = vrai chiffre du service (pas 0)', a && nombres(a.liste.find(x => x.g === 'Variantes testées').d)[0] >= cli.variantesTestees, JSON.stringify(a && a.liste.slice(0, 3)));
T.verifier('fenêtre « Agent BTC » : aucune trace de l’ancienne page', a && !/PAS DE RECHERCHE|pas de recherche|Lancer/i.test(a.html));
T.verifier('« Propositions de l’agent » : contenu utile sans position (pourquoi pas de setup)', pr && pr.etat === 'ok' && pr.liste.length >= 5 && /Pourquoi/.test(pr.liste[0].g), JSON.stringify(pr && pr.liste && pr.liste.map(x => x.g)));
T.verifier('« Propositions » : ce qu’il manque pour valider, avec les vrais seuils', pr && pr.liste.some(x => x.g === 'Pour valider' && /150/.test(x.d) && /0,25/.test(x.d) && /95 %/.test(x.d)));
T.verifier('« Propositions » : meilleure piste de chaque actif (espérance réelle de l’agent)', pr && pr.liste.filter(x => /meilleure piste/.test(x.g)).length >= 2, JSON.stringify(pr && pr.liste.filter(x => /piste/.test(x.g))));
T.verifier('« Régime de marché » : un régime par actif (vrais calculs sur Binance)', rg && rg.etat === 'ok' && rg.liste.length === 3 && rg.liste.every(x => !/indisponible/.test(x.d)), JSON.stringify(rg && rg.liste));
T.verifier('« Régime » : noms de régime valides (tendance, range ou transition)', rg && rg.liste.every(x => /tendance haussière|tendance baissière|range|transition/.test(x.d)));
T.verifier('« Régime » : jamais « paire non activée » ni « active l’agent sur une paire »', !/non activée|active l’agent/.test(JSON.stringify(rg) + JSON.stringify(pr)));
await attendre(300);
await ev(() => { window.__stop && window.__stop(); });

// ═══ 5. le Worker prend le relais quand le service local ne répond pas ═══
const lecW = await ev(async () => {
  const M = await import('/planetes/mars/pc/trading/agent-accueil.js'); const faux = async () => { throw new Error('pas de serveur local'); };
  return await M.lireEtatAgent({ fetchImpl: faux });   // sans Worker configuré dans ce test : null (jamais d'état inventé)
});
T.verifier('sans serveur local ni Worker : aucune donnée inventée (null)', lecW === null || lecW.erreur);
T.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
await nav.close(); serveur.kill(); T.fin();
process.exit(0);
