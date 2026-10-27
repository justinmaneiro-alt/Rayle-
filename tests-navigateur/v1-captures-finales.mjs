// Captures APRÈS V1 pour le bilan : accueil (repos, réponse, retour, léger), poste de l'agent (six groupes), terminal 2D, fenêtre « Teste ma stratégie » (voir mars-ms-test.mjs).
// node v1-captures-finales.mjs   → captures-v1/apres/*.png   (les « avant » : v1-capture-avant.mjs ; le salon de Mars : mars-captures.mjs)
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:8000', CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
fs.mkdirSync('captures-v1/apres', { recursive: true });
const attendre = ms => new Promise(r => setTimeout(r, ms));
async function ouvrir({ qualite = null, largeur = 1600, hauteur = 900 } = {}) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${largeur},${hauteur}`] });
  const page = await b.newPage(); await page.setViewport({ width: largeur, height: hauteur });
  page.on('pageerror', e => console.log('ERREUR', e.message.slice(0, 200)));
  await page.evaluateOnNewDocument(q => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); if (q != null) localStorage.setItem('rayle_entite_qualite', String(q)); localStorage.setItem('rayle_tableau_bord', JSON.stringify({ meteo: { nom: 'Pau, Nouvelle-Aquitaine', lat: 43.3, lon: -0.37 } })); window.__RAYLE_TB_TEST__ = { sansReseau: true }; window.__RAYLE_POSTE_TEST__ = { exposer: true, sansRecherche: true, sansAlertesMS: true, sansVeilleurMS: true }; }, qualite);
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(4000); return { b, page };
}
const donnees = page => page.evaluate(() => {
  const TB = window.TableauBord, now = Date.now(), serie = (a, c, n = 40) => Array.from({ length: n }, (_, i) => a + (c - a) * i / n + Math.sin(i * 0.9) * (c - a) * 0.08);
  window.Panneaux.fermerTout();
  TB.injecter('meteo', { etat: 'ok', nom: 'Pau', temp: 14.2, ressenti: 12.8, categorie: 'eclaircies', libelle: 'Éclaircies', vent: 18, pluie: 0, jours: [{ jour: 'auj.', min: 9, max: 16, categorie: 'nuageux' }, { jour: 'sam.', min: 10, max: 15, categorie: 'pluie' }, { jour: 'dim.', min: 8, max: 18, categorie: 'soleil' }] });
  TB.injecter('actus', { titres: ['Le gouvernement présente son budget devant l’Assemblée', 'Tempête : vigilance orange sur la façade atlantique', 'Les marchés européens finissent en hausse', 'Un nouveau satellite météo mis en orbite', 'Football : le classement après la 9e journée', 'Santé : la campagne de vaccination démarre'].map((t, i) => ({ titre: t, source: ['Le Monde', 'France 3', 'Les Echos', 'AFP', 'L’Équipe', 'Le Figaro'][i], quand: 'il y a ' + (i + 1) + ' h', couleur: ['#8fd0e3', '#c9b27a', '#2fd18b'][i % 3] })), perime: false });
  TB.injecter('marche', { lignes: [{ id: 'BTC', nom: 'BTC', prix: 67890.4, decimales: 1, pct: 1.23, courbe: serie(66000, 67900), t: now }, { id: 'SOL', nom: 'SOL', prix: 152.31, decimales: 2, pct: -0.84, courbe: serie(156, 152), t: now }, { id: 'DOGE', nom: 'DOGE', prix: 0.16421, decimales: 5, pct: 2.4, courbe: serie(0.15, 0.164), t: now }, { id: 'XAU', nom: 'Or', prix: 2741.3, decimales: 2, pct: 0.31, courbe: serie(2725, 2741), t: now, differe: true }, { id: 'US100', nom: 'US100', prix: 20512.4, decimales: 1, pct: -0.42, courbe: serie(20650, 20512), t: now }] });
  TB.injecter('terre', { lignes: [{ id: 'a', type: 'seisme', titre: 'M 5.6 · 120 km au large du Chili', severite: 3, age: 'il y a 1 h' }, { id: 'b', type: 'seisme', titre: 'M 4.4 · Sud de l’Alaska', severite: 2, age: 'il y a 3 h' }, { id: 'c', type: 'seisme', titre: 'M 3.1 · Californie', severite: 1, age: 'il y a 5 h' }], etiquette: 'reel' });
  TB.injecter('reels', { 'gardien-prop': { etat: 'ok', pied: 'VERT · marge 678 $' }, 'regime-marche': { etat: 'ok', liste: [{ g: 'Bitcoin', d: '62/100 · Tendance haussière' }] }, 'propositions-agent': { etat: 'ok', etiquette: 'RÉEL', liste: [], vide: 'Pas de setup : l’agent n’alerte que s’il y a une stratégie validée' } }); TB.injecter('pilote', { paires: ['BTC', 'SOL'], enRecherche: true, valides: 0 });
});
{ // accueil : repos → réponse → retour
  const { b, page } = await ouvrir(); await donnees(page); await attendre(2500);
  await page.screenshot({ path: 'captures-v1/apres/01-accueil-repos.png' });
  await page.evaluate(() => { window.Entite.verrou(false); window.Entite.verrou = () => {}; window.Entite.etat('speaking'); window.Panneaux.ouvrir({ id: 'rep', type: 'holo-reponse', titre: 'Réponse', icone: '◈', etat: 'reel', corps: { html: '<p>Le Bitcoin vaut environ <b>67 890 dollars</b>, en hausse de 1,2 % sur la journée.</p><div class="pn-l"><span>RSI 14</span><b>58</b></div><div class="pn-l"><span>EMA 200</span><b>64 210</b></div>' } }); });
  await attendre(1800); await page.screenshot({ path: 'captures-v1/apres/02-accueil-reponse.png' });
  await page.evaluate(() => { window.Panneaux.fermerTout(); window.Entite.etat('idle'); }); await attendre(1600); await page.screenshot({ path: 'captures-v1/apres/03-accueil-retour.png' });
  await page.evaluate(() => { RayleBus.fusion('raylé', { etat: 'veille' }); }); await attendre(1200); await page.screenshot({ path: 'captures-v1/apres/04-accueil-veille.png' });
  await page.evaluate(() => { RayleBus.fusion('raylé', { etat: 'listening' }); }); await attendre(1200); await page.screenshot({ path: 'captures-v1/apres/05-accueil-actif.png' });
  await page.evaluate(() => { RayleBus.fusion('raylé', { etat: 'idle' }); document.getElementById('gear').click(); }); await attendre(900); await page.screenshot({ path: 'captures-v1/apres/06-reglages-activation-tableau.png' });
  await b.close();
}
{ // thème léger
  const { b, page } = await ouvrir({ qualite: 2 }); await donnees(page); await attendre(2000); await page.screenshot({ path: 'captures-v1/apres/07-accueil-leger.png' }); await b.close();
}
{ // poste de l'agent : six groupes (état vide : sans historique) + terminal 2D
  const { b, page } = await ouvrir({ largeur: 1700, hauteur: 950 });
  await page.evaluate(async () => { await import('/planetes/mars/pc/trading/fenetre-agent.js'); await window.PosteAgent.ouvrir({}); }); await attendre(1800);
  for (const g of ['apercu', 'marche', 'strategies', 'risque', 'journal', 'systeme']) { await page.evaluate(x => document.querySelector('.pa-onglets [data-groupe="' + x + '"]').click(), g); await attendre(1300); await page.screenshot({ path: `captures-v1/apres/10-agent-${g}.png` }); }
  await page.evaluate(() => document.querySelector('.pa-mode [data-mode="expert"]').click()); await attendre(500);
  for (const o of ['sante', 'journal', 'regime']) { await page.evaluate(x => document.querySelector('.pa-onglets [data-onglet="' + x + '"]').click(), o); await attendre(1500); await page.screenshot({ path: `captures-v1/apres/11-agent-expert-${o}.png` }); }
  await page.evaluate(() => window.PosteAgent && window.PosteAgent.fermer && window.PosteAgent.fermer()); await page.evaluate(() => window.Panneaux.fermerTout()); await attendre(600);
  await page.click('#btnOuvrirTerminal'); await attendre(3500); await page.screenshot({ path: 'captures-v1/apres/20-terminal-2d.png' });
  await b.close();
}
console.log('ok');
