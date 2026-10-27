// Capture rapide de l'accueil V1 avec des données injectées (sans réseau). node v1-accueil-capture.mjs [dossier] [etat]
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:8000', CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dossier = process.argv[2] || 'captures-v1', L = +process.env.L || 1600, H = +process.env.H || 900; fs.mkdirSync(dossier, { recursive: true });
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${L},${H}`] });
const page = await b.newPage(); await page.setViewport({ width: L, height: H });
page.on('pageerror', e => console.log('ERREUR', e.message.slice(0, 300))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load|CORS/.test(m.text())) console.log('console.error', m.text().slice(0, 200)); });
await page.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_tableau_bord', JSON.stringify({ meteo: { nom: 'Pau, Nouvelle-Aquitaine', lat: 43.3, lon: -0.37 } })); window.__RAYLE_TB_TEST__ = { sansReseau: true }; });
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await new Promise(r => setTimeout(r, 4000));
await page.evaluate(() => {
  const TB = window.TableauBord, now = Date.now(), serie = (a, b, n = 40) => Array.from({ length: n }, (_, i) => a + (b - a) * i / n + Math.sin(i * 0.9) * (b - a) * 0.08);
  TB.injecter('meteo', { etat: 'ok', nom: 'Pau', temp: 14.2, ressenti: 12.8, categorie: 'eclaircies', libelle: 'Éclaircies', vent: 18, pluie: 0, jours: [{ jour: 'auj.', min: 9, max: 16, categorie: 'nuageux' }, { jour: 'sam.', min: 10, max: 15, categorie: 'pluie' }, { jour: 'dim.', min: 8, max: 18, categorie: 'soleil' }] });
  TB.injecter('actus', { titres: ['Le gouvernement présente son budget devant l’Assemblée', 'Tempête : vigilance orange sur la façade atlantique', 'Les marchés européens finissent en hausse', 'Un nouveau satellite météo mis en orbite', 'Football : le classement après la 9e journée', 'Santé : la campagne de vaccination démarre'].map((t, i) => ({ titre: t, source: ['Le Monde', 'France 3', 'Les Echos', 'AFP', 'L’Équipe', 'Le Figaro'][i], quand: 'il y a ' + (i + 1) + ' h', couleur: ['#8fd0e3', '#c9b27a', '#2fd18b'][i % 3] })), perime: false });
  TB.injecter('marche', { lignes: [{ id: 'BTC', nom: 'BTC', prix: 67890.4, decimales: 1, pct: 1.23, courbe: serie(66000, 67900), t: now }, { id: 'SOL', nom: 'SOL', prix: 152.31, decimales: 2, pct: -0.84, courbe: serie(156, 152), t: now }, { id: 'DOGE', nom: 'DOGE', prix: 0.16421, decimales: 5, pct: 2.4, courbe: serie(0.15, 0.164), t: now }, { id: 'XAU', nom: 'Or', prix: 2741.3, decimales: 2, pct: 0.31, courbe: serie(2725, 2741), t: now, differe: true }, { id: 'US100', nom: 'US100', prix: 20512.4, decimales: 1, pct: -0.42, courbe: serie(20650, 20512), t: now }] });
  TB.injecter('terre', { lignes: [{ id: 'a', type: 'seisme', titre: 'M 5.6 · 120 km au large du Chili', severite: 3, age: 'il y a 1 h' }, { id: 'b', type: 'seisme', titre: 'M 4.4 · Sud de l’Alaska', severite: 2, age: 'il y a 3 h' }, { id: 'c', type: 'seisme', titre: 'M 3.1 · Californie', severite: 1, age: 'il y a 5 h' }], etiquette: 'reel' });
  TB.injecter('reels', { 'gardien-prop': { etat: 'ok', pied: 'VERT · marge 678 $' }, 'regime-marche': { etat: 'ok', liste: [{ g: 'Bitcoin', d: '62/100 · Tendance haussière' }] }, 'propositions-agent': { etat: 'ok', etiquette: 'RÉEL', liste: [], vide: 'Pas de setup : l’agent n’alerte que s’il y a une stratégie validée' } });
  TB.injecter('pilote', { paires: ['BTC', 'SOL'], enRecherche: true, valides: 0 });
});
await page.evaluate(() => window.Panneaux.fermerTout()); await new Promise(r => setTimeout(r, 2500));
await page.screenshot({ path: dossier + '/accueil-repos.png' });
await page.evaluate(() => { try { window.Entite.verrou(false); window.Entite.verrou = () => {}; window.Entite.etat('speaking'); window.Panneaux.ouvrir({ id: 'rep', type: 'holo-reponse', titre: 'Réponse', icone: '◈', etat: 'reel', corps: { html: '<p>Le Bitcoin vaut environ <b>67 890 dollars</b>, en hausse de 1,2 % sur la journée.</p><div class="pn-l"><span>RSI 14</span><b>58</b></div><div class="pn-l"><span>EMA 200</span><b>64 210</b></div>' } }); } catch (x) { console.log(x.message); } });
await new Promise(r => setTimeout(r, 1800));
await page.screenshot({ path: dossier + '/accueil-reponse.png' });
await page.evaluate(() => { window.Panneaux.fermerTout(); }); await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: dossier + '/accueil-retour.png' });
await b.close(); console.log('ok');
