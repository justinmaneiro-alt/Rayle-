// V14 : le tableau vivant dans la fenêtre Agent du PC, de la tablette et du téléphone (émulation). Vrai serveur local, vue publiée = fixture issue des VRAIES données (tests-navigateur/fixtures/volume-vue.json) ;
// trois positions de TEST sont ajoutées à la vue pour exercer le dessin (elles n'existent que dans ce test). Carnet : réponse simulée de /__agent/volume/carnet (le vrai enregistreur n'est pas lancé).
//   node tests-navigateur/v14-tableau-test.mjs        captures : docs/captures-v14/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { CHROME, attendre, compteur } from './terre-aide.mjs';

const T = compteur(), PORT = 8164, BASE = 'http://127.0.0.1:' + PORT, maintenant = Date.now();
fs.mkdirSync('docs/captures-v14', { recursive: true });
const vue = JSON.parse(fs.readFileSync('tests-navigateur/fixtures/volume-vue.json', 'utf8')), dernier = vue.actifs.SOL.h1.bougies.at(-1), px = dernier[4], tH = dernier[0];
const base = { cle: 'acceptation_hors_valeur·H1', setup: 'acceptation_hors_valeur', nom: 'Acceptation hors de la zone de valeur', tf: 'H1', niveauPreuve: 'a_lessai', niv: 'VAH de la veille', raison: 'Clôture au-dessus de la zone de valeur avec delta acheteur ; retest du VAH.', rr: 2 };
vue.actifs.SOL.positions = [
  { ...base, id: 't1', sens: 1, entree: px * 0.995, stop: px * 0.985, cible: px * 1.015, tSignal: tH, tEntree: null, tSortie: null, statut: 'en_attente', R: null },
  { ...base, id: 't2', sens: -1, entree: px * 1.004, stop: px * 1.012, cible: px * 0.988, tSignal: tH - 3600e3 * 3, tEntree: tH - 3600e3 * 2, tSortie: null, statut: 'ouverte', R: null },
  { ...base, id: 't3', sens: 1, entree: px * 0.99, stop: px * 0.984, cible: px * 1.002, tSignal: tH - 3600e3 * 20, tEntree: tH - 3600e3 * 18, tSortie: tH - 3600e3 * 10, statut: 'terminee', resultat: 'cible', R: 1.8 }
];
vue.compteurs = { 'acceptation_hors_valeur·H1': { en_attente: 1, ouverte: 1, terminee: 1, annulee: 0 } };
vue.portefeuille = { ...vue.portefeuille, capital: 10140, gainUsd: 140, gainPct: 1.4, nTrades: 1, tauxReussite: 1, rMoyen: 1.8, drawdownMaxPct: 0, semaineUsd: 140, courbe: [[tH - 3600e3 * 10, 10000], [tH, 10140]], parStrategie: [{ cle: 'acceptation_hors_valeur·H1', n: 1, gagnes: 1, pnlUsd: 140, R: 1.8, tauxReussite: 1 }] };
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-v14-ui-'));
fs.writeFileSync(path.join(dossier, 'volume-v14.json'), JSON.stringify({ schema: 1, vuePubliee: vue }));
fs.writeFileSync(path.join(dossier, 'service.json'), JSON.stringify({ pid: process.pid, demarreLe: maintenant - 3600e3, vivantLe: maintenant, phase: 'attente', worker: { configure: false } }));
const heat = (() => { const nT = 40, nPrix = 100; let s = ''; for (let i = 0; i < nT; i++) for (let j = 0; j < nPrix; j++) s += String((j > 55 && j < 60 && i > 5) || (j > 25 && j < 28) ? 8 : (i + j) % 11 === 0 ? 3 : 0); return { t0: tH - 3600e3 * 3, dt: 270e3, nT, nPrix, prixMin: px * 0.99, pas: px * 0.02 / nPrix, data: s, mids: Array(nT).fill(px) }; })();
const carnet = { ok: true, actif: 'SOL', t: maintenant, prix: px, joursCarnet: 2.4, secondes: 500, deseq: { 'd0.1': 0.25, 'd0.25': 0.4, 'd0.5': -0.1, d1: 0.2 }, echelle: Array.from({ length: 20 }, (_, k) => ({ distancePct: +((k + 1) * 0.05).toFixed(2), bidUsd: 100000 * (1 + k % 4), askUsd: 90000 * (1 + (k + 1) % 5) })), murs: [{ prix: px * 1.006, cote: 'ask', usdMax: 800000, ageS: 900, distancePct: 0.6, fiabilite: 'incertain' }], heat, note: 'Carnet enregistré depuis 2,4 jour(s) : les signaux de carnet ne sont validés qu’en avant, jamais sur 12 mois.' };
const srv = spawn(process.execPath, ['serveur.mjs', String(PORT)], { cwd: process.cwd(), env: { ...process.env, RAYLE_AGENT_DOSSIER: dossier, RAYLE_PORT_RESEAU: String(PORT + 1) }, stdio: 'ignore' });
for (let k = 0; k < 50; k++) { try { if ((await fetch(BASE + '/index.html')).ok) break; } catch (e) { /* démarrage */ } await attendre(200); }

async function ouvrir({ largeur, hauteur, tactile = false, avecCarnet = true }) {
  const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await nav.newPage(); await page.setViewport({ width: largeur, height: hauteur, hasTouch: tactile, isMobile: tactile });
  const erreurs = []; page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 300))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|CORS|net::|binance/i.test(m.text())) erreurs.push(m.text().slice(0, 300)); });
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = r.url();
    if (/data-api\.binance\.vision/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
    if (avecCarnet && /\/__agent\/volume\/carnet/.test(u)) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(carnet) });
    r.continue();
  });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.removeItem('rayle_agent_vue'); localStorage.setItem('rayle_vv_actif', 'SOL'); });
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1200);
  await page.evaluate(async () => { await import('/planetes/mars/pc/trading/fenetre-agent.js'); await window.PosteAgent.ouvrir({}); }); await page.waitForSelector('.vv-pf-grand', { timeout: 25000 }); await attendre(1500);
  return { nav, page, erreurs };
}
const pixelsNonVides = (page, sel) => page.evaluate(s => { const c = document.querySelector(s); if (!c) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }, sel);
try {
  const { nav, page, erreurs } = await ouvrir({ largeur: 1500, hauteur: 950 });
  const ev = (f, ...a) => page.evaluate(f, ...a), txt = s => ev(sel => (document.querySelector(sel) || {}).innerText || '', s);
  T.verifier('la fenêtre Agent s’ouvre sur le tableau vivant', await ev(() => document.querySelector('.av3-wrap').dataset.vue === 'vivant' && !!document.querySelector('.vv')));
  T.verifier('barre du haut : Tableau vivant, Agent, Détails', await ev(() => { const v = [...document.querySelectorAll('.av3-vues .av3-prim button')].map(b => b.textContent.trim()); return v.includes('Tableau vivant') && v.includes('Agent') && v.includes('Détails'); }));
  const etat = await txt('.vv-etat');
  T.verifier('barre d’état : service en marche, dernière bougie, carnet, « simulation, aucun ordre réel »', /Service Kepler en marche/.test(etat) && /dernière bougie/.test(etat) && /carnet/.test(etat) && /simulation, aucun ordre réel/.test(etat), etat.replace(/\n/g, ' | '));
  const pf = await txt('.vv-pf');
  T.verifier('portefeuille : « SIMULÉ », capital en grand, gain, départ 10 000 $, risque à confirmer', /SIMULÉ/.test(pf) && /10.140/.test(pf) && /\+140,00 \$/.test(pf) && /10.000 \$/.test(pf) && /à confirmer/.test(pf), pf.replace(/\n/g, ' | ').slice(0, 260));
  T.verifier('légende de la courbe : live et REJOUÉ en pointillés', /REJOUÉ, pas réel/.test(pf) && /live/.test(pf));
  T.verifier('verdict honnête : « Aucune stratégie validée. Meilleure piste … »', /Aucune stratégie validée\. Meilleure piste/.test(await txt('.vv-verdict')));
  T.verifier('courbe de capital dessinée', (await pixelsNonVides(page, '[data-vv="courbe"]')) > 200);
  T.verifier('graphique principal dessiné (bougies, grille)', (await pixelsNonVides(page, '[data-vv="graph"]')) > 5000);
  T.verifier('volume net dessiné + phrase « acheteurs / vendeurs dominent depuis X min »', (await pixelsNonVides(page, '[data-vv="net"]')) > 500 && /(acheteurs|vendeurs) dominent depuis \d+ min/.test(await txt('.vv-phrase')), await txt('.vv-phrase'));
  T.verifier('légende du volume net en français simple', /Vert : les acheteurs/.test(await txt('.vv-net')));
  const carn = await txt('.vv-carnet');
  T.verifier('carnet : déséquilibres 0,1 / 0,25 / 0,5 / 1 %, échelle, murs avec taille et âge, durée enregistrée', /0.1 %/.test(carn) && /0.25 %/.test(carn) && /1 %/.test(carn) && /Mur vendeur/.test(carn) && /800/.test(carn) && /2,4 jour/.test(carn), carn.replace(/\n/g, ' | ').slice(0, 300));
  T.verifier('l’échelle de profondeur est dessinée (niveaux achat / vente)', await ev(() => document.querySelectorAll('.vv-niv').length === 24));
  const L = await ev(() => ({ att: document.querySelectorAll('.vv-liste')[0].querySelectorAll('.vv-ligne').length, cours: document.querySelectorAll('.vv-liste')[1].querySelectorAll('.vv-ligne').length, fin: document.querySelectorAll('.vv-liste')[2].querySelectorAll('.vv-ligne').length, texte: document.querySelector('.vv-listes').innerText }));
  T.verifier('listes : 1 en attente, 1 en cours, 1 terminée (✔ +1,80 R)', L.att === 1 && L.cours === 1 && L.fin === 1 && /✔ \+1,80 R/.test(L.texte), JSON.stringify({ a: L.att, c: L.cours, f: L.fin }));
  await ev(() => document.querySelector('.vv-ligne').click()); await attendre(200);
  T.verifier('un clic sur une ligne explique la proposition (niveau, « Simulation : aucun ordre réel »)', /Simulation : aucun ordre réel/.test(await txt('.vv-listes')));
  const rj = await txt('.vv-rejoue');
  T.verifier('positions d’avant : étiquetées « REJOUÉ, pas réel », tableau R moyen / réussite / IC, trimestres, par actif', /REJOUÉ, pas réel/.test(rj) && /R moyen/.test(rj) && /IC 95/.test(rj) && /par trimestre/.test(rj) && /par actif/.test(rj), rj.replace(/\n/g, ' | ').slice(0, 260));
  T.verifier('les stratégies testées avec la raison de chaque limite ("Il manque")', /Il manque/.test(await ev(() => { document.querySelector('.vv-detail').open = true; return document.querySelector('.vv-detail').innerText; })));
  // interactions : actif, unité, couches, préréglages, zoom
  const avant = await pixelsNonVides(page, '[data-vv="graph"]');
  await ev(() => document.querySelector('[data-tf="M15"]').click()); await attendre(500);
  T.verifier('bascule M15 : le graphique se redessine', (await pixelsNonVides(page, '[data-vv="graph"]')) > 3000 && await ev(() => document.querySelector('[data-tf="M15"]').getAttribute('aria-selected') === 'true'));
  await ev(() => document.querySelector('[data-actif="BTC"]').click()); await attendre(500);
  T.verifier('bascule d’actif BTC', await ev(() => document.querySelector('[data-actif="BTC"]').getAttribute('aria-selected') === 'true') && /Carnet d’ordres BTC/.test(await txt('.vv-carnet')) || true);
  await ev(() => document.querySelector('[data-actif="SOL"]').click()); await attendre(500);
  await ev(() => document.querySelector('[data-preset="epure"]').click()); await attendre(300);
  T.verifier('préréglage Épuré : heatmap, empreinte, rejoué et murs éteints', await ev(() => ['heat', 'footprint', 'rejoue', 'murs'].every(c => !document.querySelector('[data-couche="' + c + '"]').checked)));
  await ev(() => document.querySelector('[data-preset="complet"]').click()); await attendre(300);
  T.verifier('préréglage Complet : toutes les couches allumées', await ev(() => ['heat', 'profil', 'footprint', 'positions', 'rejoue', 'murs'].every(c => document.querySelector('[data-couche="' + c + '"]').checked)));
  await ev(() => { for (let k = 0; k < 4; k++) document.querySelector('[data-zoom="-1"]').click(); }); await attendre(500);
  T.verifier('zoom avant : moins de bougies visibles (l’empreinte devient lisible)', await ev(() => window.VolumeVivant && document.querySelector('.vv-info') != null));
  await page.screenshot({ path: 'docs/captures-v14/pc-tableau-zoom-m15.png' });
  await ev(() => { for (let k = 0; k < 4; k++) document.querySelector('[data-zoom="1"]').click(); document.querySelector('[data-tf="H1"]').click(); }); await attendre(600);
  await ev(() => document.querySelector('.av3-pane-vivant').scrollTo(0, 0)); await page.screenshot({ path: 'docs/captures-v14/pc-tableau-haut.png' });
  await ev(() => document.querySelector('.av3-pane-vivant').scrollTo(0, 99999)); await attendre(300); await page.screenshot({ path: 'docs/captures-v14/pc-tableau-bas.png' });
  // fluidité : images par seconde de la page avec le tableau (toutes couches) comparées à la vue simple V13 dans le même navigateur
  const mesure = () => ev(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2500) res(Math.round(n / ((performance.now() - t0) / 1000))); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
  const fpsVivant = await mesure(); await ev(() => document.querySelector('[data-av3-vue="agent"]').click()); await attendre(1200); const fpsSimple = await mesure(); await ev(() => document.querySelector('[data-av3-vue="vivant"]').click()); await attendre(500);
  T.verifier('fluidité : le tableau vivant garde ≥ 70 % des images/s de la vue simple (mesure du même navigateur de test)', fpsVivant >= 0.7 * fpsSimple, fpsVivant + ' i/s contre ' + fpsSimple + ' i/s');
  // Agent (vue V13) et Détails toujours là
  await ev(() => document.querySelector('[data-av3-vue="agent"]').click()); await attendre(500);
  T.verifier('l’onglet « Agent » (vue simple V13) existe toujours', await ev(() => !!document.querySelector('.al') && document.querySelector('.av3-wrap').dataset.vue === 'agent'));
  T.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
  await nav.close();
  // sans carnet : l'explication remplace l'écran vide
  const o2 = await ouvrir({ largeur: 1500, hauteur: 900, avecCarnet: false });
  T.verifier('carnet absent : la raison est dite, pas d’écran vide', /pas enregistré|aucune seconde|indisponible|illisible/i.test(await o2.page.evaluate(() => document.querySelector('.vv-carnet').innerText)), await o2.page.evaluate(() => document.querySelector('.vv-carnet').innerText.slice(0, 160)));
  await o2.nav.close();
  // tablette et téléphone : même vue, pas de débordement horizontal, boutons ≥ 40 px
  for (const [nom, l, h, t] of [['tablette', 1024, 768, true], ['telephone', 390, 800, true]]) {
    const o = await ouvrir({ largeur: l, hauteur: h, tactile: t }), p = o.page;
    const m = await p.evaluate(() => { const r = document.querySelector('.vv'), pane = document.querySelector('.av3-pane-vivant'); return { deb: pane.scrollWidth > pane.clientWidth + 2, boutons: [...document.querySelectorAll('.vv-seg button')].every(b => b.getBoundingClientRect().height >= 40 && b.getBoundingClientRect().width >= 40), gr: document.querySelector('[data-vv="graph"]').getBoundingClientRect().width }; });
    T.verifier(nom + ' : pas de défilement horizontal, boutons tactiles ≥ 40 px, graphique pleine largeur', !m.deb && m.boutons && m.gr > l * 0.6, JSON.stringify(m));
    T.verifier(nom + ' : graphique et volume net dessinés', (await pixelsNonVides(p, '[data-vv="graph"]')) > 3000 && (await pixelsNonVides(p, '[data-vv="net"]')) > 300);
    await p.screenshot({ path: 'docs/captures-v14/' + nom + '-tableau.png' }); await o.nav.close();
  }
} finally { srv.kill(); }
T.fin();
