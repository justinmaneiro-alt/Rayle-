/* Fenêtre « Marchés » du carrousel : entrée dans la liste, miniature vivante, barre du bas, ouverture, sections (Aujourd'hui, Par actif, Actualité, Alertes, Panneaux, Couverture et performances),
   journal XTB importé, hors ligne. Téléphone et tablette. Prérequis : node serveur.mjs 8000 ; node outils-donnees/serveur-snapshots.mjs <snapshots> 8801.
   Usage : node tests-navigateur/marches-carrousel-test.mjs [tel|tablette] */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const mode = process.argv[2] || 'tel', HOTE = 'http://rayle.test:8000', w = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0; const verif = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--host-resolver-rules=MAP rayle.test 127.0.0.1'] });
const p = await nav.newPage(); await p.setUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36');
await p.setViewport(mode === 'tablette' ? { width: 1024, height: 768, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
let coupe = false; const vus = [], erreurs = [];
await p.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_donnees_base', 'http://127.0.0.1:8801/'); localStorage.setItem('rayle_m_sw', '0'); } catch (e) { /* */ } });
await p.setRequestInterception(true);
p.on('request', async r => { const u = r.url(); vus.push(u); if (/calendrier2.json/.test(u) && !coupe) { const n = Date.now(); return r.respond({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ t: n, evenements: [{ title: 'CPI y/y', country: 'USD', date: new Date(n + 125e3).toISOString(), impact: 'High', forecast: '3.1%', previous: '3.0%' }, { title: 'Retail Sales', country: 'EUR', date: new Date(n + 26 * 3600e3).toISOString(), impact: 'High', forecast: '', previous: '0.2%' }] }) }); } if (/^(http:\/\/rayle\.test|data:|blob:)/.test(u) || r.method() !== 'GET') return r.continue(); if (coupe) return r.abort('internetdisconnected'); if (/^http:\/\/127\.0\.0\.1/.test(u)) return r.continue();
  try { const x = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) }); r.respond({ status: x.status, headers: { 'access-control-allow-origin': '*', 'content-type': x.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await x.arrayBuffer()) }); } catch (e) { r.abort('failed'); } });
p.on('pageerror', e => erreurs.push(e.message.slice(0, 160))); p.on('dialog', d => d.accept());
const attendre = async (f, ms = 40000, pas = 250) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await w(pas); } return false; };
const texte = sel => p.evaluate(s => (document.querySelector(s) || {}).innerText || '', sel);
async function ouvrirMarches() { await p.evaluate(() => window.Application.ouvrir('marches')); return attendre(() => p.evaluate(() => !!document.querySelector('#marches-fenetre'))); }

await p.goto(HOTE + '/index.html', { waitUntil: 'domcontentloaded' }); await w(4500);
console.log('— carrousel —');
verif(await p.evaluate(() => window.Application.fenetres.some(f => f.id === 'marches' && f.nom === 'Marchés')), 'Marchés est une fenêtre du carrousel (au niveau des autres)');
verif(await p.evaluate(() => window.Application.fenetres.map(f => f.id).join(',')) === 'rayle,terminal,marches,anatomie,terre,dev3d', 'ordre : ' + await p.evaluate(() => window.Application.fenetres.map(f => f.id).join(',')));
verif(await p.evaluate(() => !!document.querySelector('.ac-p[data-id="marches"]')), 'panneau « Marchés » dans le carrousel');
verif(await p.evaluate(() => !!document.querySelector('#g1Icones [data-i="marches"]')), 'icône « Marchés » dans la barre du bas');
await p.evaluate(() => window.Application.aller('marches')); await w(1800);
verif(await attendre(() => p.evaluate(() => { const c = document.querySelector('.ac-p[data-id="marches"] canvas'); return !!c && c.dataset.m === '1'; }), 8000), 'miniature vivante créée');
verif(await attendre(() => p.evaluate(() => { const c = document.querySelector('.ac-p[data-id="marches"] canvas'); if (!c) return false; const x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 0; i < d.length; i += 64) if (d[i] > 120 || d[i + 1] > 120) k++; return k > 40; }), 20000), 'la miniature affiche du contenu (annonce, actualité, cours)');
await p.screenshot({ path: `outils-restructuration/captures-mobile-autonome/marches-carrousel-${mode}.png` });
console.log('— grande fenêtre —');
verif(await ouvrirMarches(), 'ouverture de Marchés en grand');
verif(await attendre(() => p.evaluate(() => document.querySelectorAll('#marches-fenetre .mf-annonces li').length > 0 || /Aucune annonce/.test(document.querySelector('#marches-fenetre [data-c="aujourdhui"]').innerText)), 30000), 'section Aujourd\u2019hui chargée');
const c1 = await p.evaluate(() => (document.querySelector('#marches-fenetre [data-cr]') || {}).textContent || ''); await w(2300); const c2 = await p.evaluate(() => (document.querySelector('#marches-fenetre [data-cr]') || {}).textContent || ''); verif(c1 !== '' && c1 !== c2, `le compte à rebours avance (${c1} → ${c2})`);
verif(/heure de Paris/i.test(await texte('#marches-fenetre [data-c="aujourdhui"]')), 'heure de Paris affichée');
verif(await attendre(() => p.evaluate(() => /Tendance/i.test(document.querySelector('#marches-fenetre [data-c="actifs"]').innerText)), 60000), 'fiche d\u2019actif : tendance affichée (Bitcoin)');
verif(await attendre(() => p.evaluate(() => !!document.querySelector('#marches-fenetre [data-graph] canvas')), 30000), 'mini-graphique dessiné');
const f1 = await texte('#marches-fenetre [data-c="actifs"]'); verif(/RSI/i.test(f1) && /Annonces liées/i.test(f1) && /Actualités filtrées/i.test(f1) && /COT/i.test(f1), 'fiche complète : RSI, annonces liées, actualités, publications publiques');
for (const a of ['or', 'us100', 'us500', 'sol']) { await p.evaluate(a => document.querySelector(`#marches-fenetre [data-actif="${a}"]`).click(), a); verif(await attendre(() => p.evaluate(() => /Tendance|Aucune bougie/i.test(((document.querySelector('#marches-fenetre [data-c="actifs"] [data-fiche]') || {}).innerText || ''))), 60000), `fiche ${a} affichée`); }
await p.evaluate(() => document.querySelector('#marches-fenetre [data-actif="sante"]').click()); verif(await attendre(() => p.evaluate(() => /Taux|Indice dollar|VIX/.test(((document.querySelector('#marches-fenetre [data-c="actifs"] [data-fiche]') || {}).innerText || ''))), 30000), 'Santé du marché affichée');
/* sections repliées : ouverture à la demande */
for (const k of ['actualite', 'alertes', 'panneaux', 'couverture']) { await p.evaluate(k => { const d = document.querySelector(`#marches-fenetre details[data-s="${k}"]`); d.open = true; }, k); await w(300); }
verif(await attendre(() => p.evaluate(() => document.querySelectorAll('#marches-fenetre [data-c="actualite"] .mf-theme').length > 0), 30000), 'Comprendre l\u2019actualité : thèmes'); verif(await attendre(() => p.evaluate(() => !!document.querySelector('#marches-fenetre [data-c="panneaux"] .mk-corps')), 30000), 'panneaux détaillés montés (scénarios, analyse IA)');
/* alertes : une alerte déjà franchie se déclenche et est notée */
await p.evaluate(() => { const f = document.querySelector('#marches-fenetre [data-alerte]'); f.querySelector('[name=actif]').value = 'btc'; f.querySelector('[name=sens]').value = 'dessus'; f.querySelector('[name=niveau]').value = '1'; f.requestSubmit(); });
verif(await attendre(() => p.evaluate(() => /est passé au-dessus de 1/.test(document.querySelector('#marches-fenetre [data-c="alertes"]').innerText) || !!document.querySelector('#marches-fenetre .mf-toast')), 30000), 'alerte de prix : déclenchée et affichée');
/* Couverture et performances */
console.log('— couverture et performances —');
verif(await attendre(() => p.evaluate(() => document.querySelectorAll('#marches-fenetre .cp-cel').length > 20), 60000), 'matrice de corrélations de rendements affichée');
const mat = await texte('#marches-fenetre [data-c="couverture"]'); verif(/jamais des prix/.test(mat) && /inflation/.test(mat), 'matrice : rendements, inflation hors corrélations');
await p.evaluate(() => document.querySelector('#marches-fenetre .cp-cel:not([disabled])[data-a="XAUUSD"][data-b="US100"]').click()); verif(/observations sur la fenêtre/.test(await texte('#marches-fenetre [data-detail]')), 'détail d\u2019une paire : observations et stabilité');
await p.evaluate(() => document.querySelector('#marches-fenetre [data-v="couv"]').click()); await w(500); await p.evaluate(() => document.querySelector('#marches-fenetre [data-c="couverture"] form[data-form]').requestSubmit());
verif(await attendre(() => p.evaluate(() => document.querySelectorAll('#marches-fenetre .cp-carte .cp-verdict').length >= 5), 90000), 'couvertures classées avec verdict'); const cv = await texte('#marches-fenetre [data-c="couverture"]'); verif(/Jambe à ouvrir/.test(cv) && /Ratio à variance minimale/.test(cv) && /part du risque|du risque/.test(cv) && /(non renseigné|saisies)/.test(cv), 'couvertures : jambe, ratio en risque, coût non inventé');
verif(/Une couverture réduit le risque, pas l’espérance de gain/.test(await texte('#marches-fenetre [data-c="couverture"]')) && /corrélations changent, surtout en crise/.test(await texte('#marches-fenetre [data-c="couverture"]')), 'mentions permanentes');
await p.evaluate(() => document.querySelector('#marches-fenetre [data-v="port"]').click()); await w(400); for (const id of ['US100', 'US500']) { await p.evaluate(id => { const f = document.querySelector('#marches-fenetre [data-c="couverture"] form[data-form]'); f.querySelector('[name=actif]').value = id; f.requestSubmit(); }, id); await w(1200); }
verif(/la même exposition/.test(await texte('#marches-fenetre [data-c="couverture"]')), 'portefeuille : deux achats d\u2019indices = même exposition signalée');
/* journal : fichier fictif */
const lignes = ['Position ID;Symbol;Type;Volume;Open time (UTC);Open price;Close time (UTC);Close price;Stop loss;Take profit;Commission;Swap;Profit/Loss']; let t0 = Date.UTC(2026, 0, 5, 8, 0); for (let i = 0; i < 40; i++) { const pl = i % 3 ? 3.2 : -4.1, ouv = 4000 + i; lignes.push([9000 + i, i % 2 ? 'GOLD' : 'US100', 'BUY', 0.01, new Date(t0).toISOString().replace('T', ' ').slice(0, 19), ouv, new Date(t0 + 3 * 3600e3).toISOString().replace('T', ' ').slice(0, 19), ouv + (pl > 0 ? 3 : -4), ouv - 5, '', -0.1, -0.1, pl].join(';')); t0 += 26 * 3600e3; }
const fic = path.resolve('outils-restructuration/captures-mobile-autonome/_journal-fictif.csv'); fs.writeFileSync(fic, lignes.join('\n'));
await p.evaluate(() => document.querySelector('#marches-fenetre [data-v="jour"]').click()); await w(500); await (await p.$('#marches-fenetre input[data-f]')).uploadFile(fic);
verif(await attendre(() => p.evaluate(() => /40 trades/.test(document.querySelector('#marches-fenetre [data-c="couverture"]').innerText)), 15000), 'journal XTB fictif importé (40 trades)'); verif(/Revanche/.test(await texte('#marches-fenetre [data-c="couverture"]')) && /Factor de profit/.test(await texte('#marches-fenetre [data-c="couverture"]')), 'statistiques du journal');
/* performances */
await p.evaluate(() => document.querySelector('#marches-fenetre [data-v="perf"]').click()); await w(500); await p.evaluate(() => document.querySelector('#marches-fenetre [data-c="couverture"] form[data-form]').requestSubmit());
verif(await attendre(() => p.evaluate(() => /La tendance passée a-t-elle prédit la suite/.test(document.querySelector('#marches-fenetre [data-c="couverture"]').innerText)), 90000), 'performances : persistance de la tendance (hors échantillon)'); const pf = await texte('#marches-fenetre [data-c="couverture"]'); verif(/Stratégie « suivre la tendance » simulée/.test(pf) && /Ne rien faire/.test(pf) && /hasard/.test(pf) && /swap/i.test(pf), 'stratégie simulée : swap, hasard, ne rien faire'); verif(/Une tendance passée ne garantit pas la suite/.test(pf), 'mention : une tendance passée ne garantit pas la suite');
await p.screenshot({ path: `outils-restructuration/captures-mobile-autonome/marches-perf-${mode}.png` });
verif(!/HTTP \d{3}|undefined|\[object/.test(await texte('#marches-fenetre')), 'aucune erreur brute dans la fenêtre'); verif(!vus.some(u => /\/__/.test(u) && /rayle\.test/.test(u)), 'aucun appel au serveur du PC');
await p.evaluate(() => window.Application.fermer()); await w(1500); verif(await p.evaluate(() => !document.querySelector('#marches-fenetre')), 'fermeture : fenêtre retirée');
console.log('— hors ligne —'); coupe = true; await p.goto(HOTE + '/index.html', { waitUntil: 'domcontentloaded' }); await w(4000); await ouvrirMarches(); await w(9000);
const hl = await texte('#marches-fenetre'); verif(hl.length > 200, 'hors ligne : la fenêtre n\u2019est pas vide'); verif(!/HTTP \d{3}|undefined|\[object/.test(hl), 'hors ligne : aucune erreur brute'); verif(/copie locale|hors ligne|Aucune donnée pour le moment|Annonce|annonce/i.test(hl), 'hors ligne : copie locale datée ou message clair');
await p.screenshot({ path: `outils-restructuration/captures-mobile-autonome/marches-horsligne-${mode}.png` });
verif(erreurs.length === 0, 'aucune erreur de page : ' + erreurs.slice(0, 3).join(' | '));
console.log(`résultat : ${ok} vérifications, ${ko} échec(s)`); await nav.close(); process.exit(ko ? 1 : 0);
