import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { CHROME, attendre, compteur } from './terre-aide.mjs';
import { marcheMixte } from '../planetes/mars/tests/synth-btc.mjs';
import { creerTrader } from '../agent-pc/trader.mjs';
import * as E from '../strategies/agent-etat.js';

/* V13 : la fenêtre Agent est UNE vue lisible (barre d'état, quatre chiffres, graphique M15 avec au plus 3 zones par actif, mini-courbe de performance, liste en 3 groupes) ; tout le reste est derrière « Détails ».
   Vrai serveur local, état écrit par le VRAI mode Trader sur des bougies SYNTHÉTIQUES (jamais présentées comme réelles). État vide testé en remplaçant la réponse de /__agent/trader.
   Lancer : node tests-navigateur/v13-agent-lisible-test.mjs        Captures « avant » (ancienne version, dossier d'un worktree) : AVANT=C:/chemin/worktree node tests-navigateur/v13-agent-lisible-test.mjs */
const T = compteur(), PORT = 8163, BASE = 'http://127.0.0.1:' + PORT, maintenant = Date.now(), RACINE = process.env.AVANT || process.cwd(), AVANT = !!process.env.AVANT;
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-v13-ui-'));
const etat = E.etatInitial(maintenant - 5 * 86400e3); fs.writeFileSync(path.join(dossier, 'agent.json'), JSON.stringify(etat));
fs.writeFileSync(path.join(dossier, 'service.json'), JSON.stringify({ pid: 999999, demarreLe: maintenant - 5 * 3600e3, vivantLe: maintenant - 3 * 3600e3, phase: 'attente', worker: { configure: false } }));   // service ARRÊTÉ depuis 3 h
let serie = marcheMixte(16000, 21); let tt = maintenant; const D = { serie: () => serie };
const tr = creerTrader({ dossier, D, paires: ['BTC'], maintenant: () => tt, journal: () => {}, erreur: (c, e) => console.log('erreur', c, e && e.message), envoyer: async () => {} });
for (let k = 0; k < 60; k++) { serie = marcheMixte(15500 + 10 * k + 10, 21); tt = maintenant - (60 - k) * 60e3; await tr.cycle(); }
const px = serie.c[serie.n - 1];
const modele = { id: 'x', actif: 'BTC', setup: 'cassure_retest', nom: 'Cassure de structure + retest dans le sens du biais', tf: 'H1', sens: 1, tSignal: maintenant - 3600e3, t: maintenant - 3600e3 + 900e3, rr: 1.8, rr2: 3.3, raison: 'Cassure haussière de la structure H1.', invalidation: 'Annulée sous le stop.', confluences: ['biais H1 / H4 dans le sens du trade', 'VWAP du jour'], nConfluences: 2, regime: 'tendance', biais: 1, style: 'equilibre', ttl: 32, atr: 100, statut: 'en_attente', resultat: null, fantome: false, source: 'direct' };
const ajouts = [0, 1, 2, 3, 4].map(k => ({ ...modele, id: 'att' + k, entree: px * (1 - 0.002 * (k + 1)), stop: px * (1 - 0.002 * (k + 1) - 0.004), cible1: px * (1 - 0.002 * (k + 1) + 0.012), cible1Nom: 'extrême H1', cible2: px * (1 + 0.02), cible2Nom: 'extension', t: modele.t - k * 900e3 }));
ajouts.push({ ...modele, id: 'gain1', statut: 'cloturee', entree: px * 0.99, stop: px * 0.986, cible1: px * 1.01, cible2: px * 1.02, resultat: { statut: 'cloturee', R: 1.4, Rbrut: 1.6, couts: 0.2, motif: 'cible 1 atteinte' }, tEntree: maintenant - 5 * 3600e3, tSortie: maintenant - 4 * 3600e3, t: maintenant - 6 * 3600e3 });
ajouts.push({ ...modele, id: 'perte1', sens: -1, statut: 'cloturee', entree: px * 1.01, stop: px * 1.014, cible1: px * 0.99, cible2: px * 0.98, resultat: { statut: 'cloturee', R: -1.1, Rbrut: -1, couts: 0.1, motif: 'stop touché' }, tEntree: maintenant - 3 * 3600e3, tSortie: maintenant - 2 * 3600e3, t: maintenant - 4 * 3600e3 });
tr.etat().propositions.push(...ajouts); tr.sauver();
const srv = spawn(process.execPath, [path.join(RACINE, 'serveur.mjs'), String(PORT)], { cwd: RACINE, env: { ...process.env, RAYLE_AGENT_DOSSIER: dossier, RAYLE_PORT_RESEAU: String(PORT + 1) }, stdio: 'ignore' });
for (let k = 0; k < 50; k++) { try { if ((await fetch(BASE + '/index.html')).ok) break; } catch (e) { /* démarrage */ } await attendre(200); }
let mode = 'normal';
const vider = j => ({ ...j, vue: { ...j.vue, actives: [], recentes: [], courbe: [], pourquoi: [], bilan: { ...j.vue.bilan, tous: { ...j.vue.bilan.tous, stats: { n: 0, esperance: null, ic: null, taux: null, rrRealise: null, total: 0, drawdown: 0, serieMax: 0, honnete: 'Aucun trade terminé.' } } } } });

async function ouvrir({ largeur, hauteur, tactile = false, vue = 'agent' }) {
  const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await nav.newPage(); await page.setViewport({ width: largeur, height: hauteur, hasTouch: tactile, isMobile: tactile });
  const erreurs = []; page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 300))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|CORS|net::|binance/i.test(m.text())) erreurs.push(m.text().slice(0, 300)); });
  await page.setRequestInterception(true);
  page.on('request', async r => {
    const u = r.url();
    if (/data-api\.binance\.vision/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
    if (mode === 'vide' && /\/__agent\/trader/.test(u)) { try { const rep = await fetch(u); const j = await rep.json(); return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(vider(j)) }); } catch (e) { return r.continue(); } }
    r.continue();
  });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.removeItem('rayle_agent_vue'); });
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1200);
  await page.evaluate(async v => { await import('/planetes/mars/pc/trading/fenetre-agent.js'); await window.PosteAgent.ouvrir({ vue: v }); }, vue); await page.waitForSelector('.av3-vues', { timeout: 20000 }); await attendre(1500);
  return { nav, page, erreurs };
}
try {
  if (AVANT) {   // captures de l'ancienne version seulement
    for (const [nom, l, h, t] of [['pc', 1500, 950, false], ['tablette', 1024, 768, true], ['telephone', 390, 800, true]]) { const o = await ouvrir({ largeur: l, hauteur: h, tactile: t, vue: 'agent' }); await attendre(1500); await o.page.screenshot({ path: 'docs/captures-v13/avant-agent-' + nom + '.png' }); await o.nav.close(); }
    srv.kill(); process.exit(0);
  }
  const { nav, page, erreurs } = await ouvrir({ largeur: 1500, hauteur: 950 });
  const ev = (f, ...a) => page.evaluate(f, ...a), txt = s => ev(sel => (document.querySelector(sel) || {}).innerText || '', s);
  await page.waitForFunction(() => document.querySelector('[data-al-chart]') && document.querySelector('[data-al-chart]').dataset.nzones != null, { timeout: 20000 }); await attendre(800);
  // ── structure de la vue principale
  T.verifier('la fenêtre Agent s’ouvre sur la vue lisible (pas sur l’ancien écran)', await ev(() => !!document.querySelector('.al') && document.querySelector('.av3-wrap').dataset.vue === 'agent'));
  T.verifier('barre « Agent / Détails » : seulement trois boutons visibles (V14 : Tableau vivant, Agent, Détails), les autres onglets sont rangés', await ev(() => { const vis = [...document.querySelectorAll('.av3-vues button')].filter(b => b.offsetParent !== null).map(b => b.textContent.trim()); return vis.length === 3 && vis.includes('Tableau vivant') && vis.includes('Agent') && vis.includes('Détails'); }));
  let barre = await txt('.al-barre');
  T.verifier('barre d’état : service arrêté depuis 3 h, dernière bougie, « simulation, aucun ordre réel »', /Service arrêté depuis 3 h/.test(barre) && /Dernière bougie \d\d:\d\d/.test(barre) && /simulation, aucun ordre réel/.test(barre), barre.replace(/\n/g, ' | '));
  T.verifier('trois gros boutons d’actif BTC / SOL / DOGE (≥ 44 px de haut), BTC choisi', await ev(() => { const b = [...document.querySelectorAll('[data-al-actif]')]; return b.length === 3 && b.every(x => x.getBoundingClientRect().height >= 44) && b[0].getAttribute('aria-selected') === 'true'; }));
  let chiffres = await txt('.al-chiffres');
  T.verifier('quatre chiffres : trades terminés, réussite, R moyen, cumul', /trades terminés/.test(chiffres) && /réussite/.test(chiffres) && /R moyen/.test(chiffres) && /cumul/.test(chiffres), chiffres.replace(/\n/g, ' | '));
  T.verifier('moins de 20 trades : « échantillon trop petit pour juger » en petit, sans paragraphe', /échantillon trop petit pour juger/.test(chiffres) && chiffres.length < 160);
  // ── graphique
  const g = await ev(() => { const gr = document.querySelector('.al-graphe').getBoundingClientRect(), pn = document.querySelector('.pn[data-id="mars-poste-agent"]').getBoundingClientRect(), c = document.querySelector('[data-al-chart]'); return { hg: gr.height, hp: pn.height, nz: +c.dataset.nzones, nm: +c.dataset.nmarq, source: c.dataset.source, perf: document.querySelectorAll('[data-al-perf] canvas').length, perfVide: !document.querySelector('[data-al-perf-vide]').hidden }; });
  T.verifier('le graphique occupe au moins 60 % de la hauteur de la fenêtre', g.hg / g.hp >= 0.6, (g.hg / g.hp).toFixed(2));
  T.verifier('5 positions en attente mais 3 zones au plus sur le graphique', g.nz === 3, 'zones ' + g.nz);
  T.verifier('un marqueur par position terminée (✔ / ✖), sans ligne', g.nm === 2, 'marqueurs ' + g.nm);
  T.verifier('mini-courbe de performance présente, non vide (2 trades terminés)', g.perf > 0 && !g.perfVide);
  T.verifier('les bougies viennent du service (secours quand le marché ne répond pas), indiquées', g.source === 'service' || g.source === 'marché', g.source);
  T.verifier('les zones sont réellement dessinées (ligne d’entrée bleu clair présente dans le canevas)', await ev(() => { let n = 0; for (const c of document.querySelectorAll('[data-al-chart] canvas')) { try { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i + 2] > 235 && d[i + 1] > 185 && d[i] < 150) n++; } catch (e) { /* canevas indisponible */ } } return n > 150; }));
  T.verifier('couches liquidité / carnet / zone diamant : interrupteurs éteints par défaut', await ev(() => { const c = [...document.querySelectorAll('[data-al-couche]')]; return c.length === 3 && c.every(x => !x.checked); }));
  // ── liste
  const l = await ev(() => ({ att: document.querySelectorAll('[data-groupe="attente"] .al-ligne').length, attOuvert: document.querySelector('[data-groupe="attente"]').open, termOuvert: document.querySelector('[data-groupe="terminees"]').open, term: document.querySelectorAll('[data-groupe="terminees"] .al-ligne').length, texte: document.querySelector('[data-groupe="attente"]').innerText }));
  T.verifier('liste : « En attente » ouvert avec les 5 positions (les 2 hors graphique y sont), « Terminées » replié', l.att === 5 && l.attOuvert && !l.termOuvert && l.term >= 2, JSON.stringify({ a: l.att, o: l.attOuvert, t: l.termOuvert, n: l.term }));
  T.verifier('une ligne : sens, entrée, stop, objectif, ratio, « valable jusqu’à », bouton « Voir sur le graphique »', ['ACHAT', 'entrée', 'stop', 'objectif', '1:', 'valable jusqu’à', 'Voir sur le graphique'].every(x => l.texte.includes(x)));
  T.verifier('aucune phrase d’explication dans la liste (fermée)', await ev(() => [...document.querySelectorAll('[data-groupe="attente"] .al-expl')].every(e => e.hidden || e.offsetParent === null)));
  await ev(() => document.querySelector('[data-groupe="attente"] .al-ligne-b').click()); await attendre(200);
  T.verifier('un clic sur la ligne ouvre pourquoi / invalidation / confiance', await ev(() => { const t = document.querySelector('[data-groupe="attente"] .al-expl').innerText; return /Pourquoi/.test(t) && /Ce qui l’invalide/.test(t); }));
  const ids = await ev(() => [...document.querySelectorAll('[data-groupe="attente"] .al-ligne')].map(x => x.dataset.id));
  const visibles = await ev(() => window.PosteAgent.lisible().etat().zones);
  const autre = ids.find(i => !visibles.includes(i));
  await ev(id => document.querySelector('[data-al-voir="' + id + '"]').click(), autre); await attendre(700);
  const apres = await ev(() => window.PosteAgent.lisible().etat());
  T.verifier('« Voir sur le graphique » sur une position hors graphique l’affiche, toujours 3 zones au plus', apres.zones.includes(autre) && apres.nZones <= 3, JSON.stringify(apres.zones));
  // ── honnêteté : aucune démo
  T.verifier('aucune position DÉMO ni case « démonstration » (vue principale)', !/DÉMO|démonstration/i.test(await txt('.al')));
  await page.screenshot({ path: 'docs/captures-v13/apres-agent-pc.png' });
  // ── Détails : tout est rangé, rien de perdu
  await ev(() => document.querySelector('[data-av3-details]').click()); await attendre(500);
  const sous = await ev(() => ({ visible: !document.querySelector('[data-av3-sous]').hidden, noms: [...document.querySelectorAll('[data-av3-sous] button')].map(b => b.textContent.trim()), vue: document.querySelector('.av3-wrap').dataset.vue }));
  T.verifier('« Détails » montre toutes les rubriques rangées', sous.visible && ['Rapport et stratégies', 'Poste de pilotage', 'Positions du jour', 'Bilan', 'Pourquoi pas plus', 'Liquidité', 'Équipe', 'Occasions manquées', 'Données'].every(x => sous.noms.includes(x)), sous.noms.join(' | '));
  T.verifier('« Détails » ouvre le rapport et les stratégies (ancien écran Agent, avec sa phrase d’état)', sous.vue === 'rapport' && /Que fait l’agent maintenant/i.test(await txt('.av3-pane-rapport')));
  T.verifier('la case des positions de démonstration n’existe plus nulle part', await ev(() => !document.querySelector('[data-av3-demo]') && !/positions de démonstration/.test(document.body.innerText)));
  await ev(() => document.querySelector('[data-av3-vue="positions"]').click()); await page.waitForSelector('.tv-carte', { timeout: 15000 });
  T.verifier('Détails › Positions du jour : les cartes complètes sont toujours là', await ev(() => document.querySelectorAll('.tv-carte').length >= 1));
  await ev(() => document.querySelector('[data-av3-vue="bilan"]').click()); await page.waitForFunction(() => /Bilan en direct/.test(document.querySelector('.av4').innerText), { timeout: 15000 });
  T.verifier('Détails › Bilan : le bilan complet est toujours là', true);
  await ev(() => document.querySelector('[data-av3-vue="details"]').click()); await attendre(600);
  T.verifier('Détails › Poste de pilotage : le poste complet est toujours là', await ev(() => !!document.querySelector('.av3-pane-details *')));
  await ev(() => document.querySelector('[data-av3-vue="agent"]').click()); await attendre(500);
  T.verifier('le bouton « Agent » ramène à la vue lisible', await ev(() => document.querySelector('.av3-wrap').dataset.vue === 'agent' && document.querySelector('[data-av3-sous]').hidden));
  // ── lisibilité
  T.verifier('texte de la liste ≥ 13 px', await ev(() => ['.al-ligne-b', '.al-niv', '.al-groupe > summary', '.al-barre'].every(s => { const e = document.querySelector(s); return !e || parseFloat(getComputedStyle(e).fontSize) >= 13; })));
  // ── changer d'actif
  await ev(() => document.querySelector('[data-al-actif="SOL"]').click()); await attendre(900);
  const sol = await ev(() => ({ n: +document.querySelector('[data-al-chart]').dataset.nzones, vide: document.querySelector('.al-vide') ? document.querySelector('.al-vide').innerText : '' }));
  T.verifier('SOL (aucune position) : état vide propre sur la liste, 0 zone', sol.n === 0 && /Aucune position en attente\. Kepler surveille BTC \/ SOL \/ DOGE\./.test(sol.vide), sol.vide);
  // ── état vide complet
  mode = 'vide'; await ev(() => document.querySelector('[data-al-actif="BTC"]').click()); await ev(() => window.PosteAgent.lisible().rafraichir()); await attendre(1500);
  const vide = await ev(() => ({ t: document.querySelector('.al').innerText, nz: +document.querySelector('[data-al-chart]').dataset.nzones, nm: +document.querySelector('[data-al-chart]').dataset.nmarq, perfVide: !document.querySelector('[data-al-perf-vide]').hidden }));
  T.verifier('état vide : « Aucune position en attente. Kepler surveille BTC / SOL / DOGE. » + heure de la dernière analyse', /Aucune position en attente\. Kepler surveille BTC \/ SOL \/ DOGE\./.test(vide.t) && /Dernière analyse : \d\d:\d\d/.test(vide.t), vide.t.slice(0, 60));
  T.verifier('état vide : « Pas encore de trade terminé », aucune zone, aucun marqueur, courbe masquée', /Pas encore de trade terminé/.test(vide.t) && vide.nz === 0 && vide.nm === 0 && vide.perfVide);
  T.verifier('état vide : jamais de fausse position (aucune ligne dans la liste)', await ev(() => document.querySelectorAll('.al-ligne').length === 0));
  await page.screenshot({ path: 'docs/captures-v13/apres-agent-pc-vide.png' });
  mode = 'normal';
  T.verifier('aucune erreur JavaScript (PC)', erreurs.length === 0, erreurs.slice(0, 2).join(' | '));
  await nav.close();
  // ── tablette et téléphone (émulation tactile) : même vue, sans débordement
  for (const [nom, l, h] of [['tablette', 1024, 768], ['telephone', 390, 800]]) {
    const o = await ouvrir({ largeur: l, hauteur: h, tactile: true }); await o.page.waitForFunction(() => document.querySelector('[data-al-chart]') && document.querySelector('[data-al-chart]').dataset.nzones != null, { timeout: 20000 }); await attendre(900);
    const m = await o.page.evaluate(() => { const gr = document.querySelector('.al-graphe').getBoundingClientRect(), pn = document.querySelector('.pn[data-id="mars-poste-agent"]').getBoundingClientRect(); return { debord: document.documentElement.scrollWidth > innerWidth + 2, large: document.querySelector('.al-graphe').scrollWidth > document.querySelector('.al-graphe').clientWidth + 2, ratio: gr.height / pn.height, boutons: [...document.querySelectorAll('[data-al-actif]')].every(b => b.getBoundingClientRect().height >= 44 && b.getBoundingClientRect().right <= innerWidth + 1), nz: +document.querySelector('[data-al-chart]').dataset.nzones, ligne: parseFloat(getComputedStyle(document.querySelector('.al-ligne-b')).fontSize) }; });
    T.verifier(nom + ' : pas de débordement horizontal, trois boutons d’actif tactiles, 3 zones, texte ≥ 13 px', !m.debord && !m.large && m.boutons && m.nz === 3 && m.ligne >= 13, JSON.stringify(m));
    T.verifier(nom + ' : le graphique prend l’essentiel de la fenêtre (≥ 50 %)', m.ratio >= 0.5, m.ratio.toFixed(2));
    await o.page.screenshot({ path: 'docs/captures-v13/apres-agent-' + nom + '.png' });
    T.verifier('aucune erreur JavaScript (' + nom + ')', o.erreurs.length === 0, o.erreurs.slice(0, 2).join(' | '));
    await o.nav.close();
  }
} finally { srv.kill(); try { fs.rmSync(dossier, { recursive: true, force: true }); } catch (e) { /* tant pis */ } }
process.exit(T.fin() ? 1 : 0);
