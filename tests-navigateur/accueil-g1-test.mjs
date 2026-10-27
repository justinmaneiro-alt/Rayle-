// Accueil « Aurore » (R1, phases 2 et 4) : noyau énorme, repos en petit texte, dock avec vague, UNE grande fenêtre à la demande (météo avec recherche de ville,
// à faire, messages, santé, marché en bougies avec rotation, actualités, alertes, événements, systèmes), voix, mode léger, thème Jarvis de secours, tailles d'écran.
// Données injectées, Open-Meteo et client de marché simulés. Captures : docs/captures-r1/g1-fenetre-marche.png.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:8000', CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const attendre = ms => new Promise(r => setTimeout(r, ms));
mkdirSync('docs/captures-r1', { recursive: true });
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1920,1080'] });
const erreurs = [];
const PREV = { current: { time: '2026-10-24T14:30', temperature_2m: 17.2, apparent_temperature: 16, relative_humidity_2m: 60, wind_speed_10m: 11, uv_index: 2.1 },
  hourly: { temperature_2m: Array.from({ length: 24 }, (_, i) => +(10 + Math.sin(i / 4) * 6).toFixed(1)), apparent_temperature: Array.from({ length: 24 }, (_, i) => 9 + i / 3), relative_humidity_2m: Array.from({ length: 24 }, (_, i) => 80 - i) },
  daily: { temperature_2m_min: [9], temperature_2m_max: [19], sunrise: ['2026-10-24T08:01'], sunset: ['2026-10-24T18:40'], precipitation_probability_max: [35] } };
const AIR = { current: { european_aqi: 33, pm2_5: 8.4 }, hourly: { european_aqi: Array.from({ length: 24 }, (_, i) => 25 + (i % 7) * 3) } };
const GEO = { results: [{ name: 'Lourdes', admin1: 'Occitanie', country: 'France', latitude: 43.09, longitude: -0.05 }] };
const cors = { 'access-control-allow-origin': '*' };
async function page(opts = {}) {
  const p = await b.newPage(); await p.setViewport(opts.viewport || { width: 1600, height: 900 });
  p.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error' && !/calendar|faireconomy|ERR_FAILED|404|Failed to load|CORS|net::|bls\.gov/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });
  await p.setRequestInterception(true);
  p.on('request', r => {
    const u = r.url();
    if (/air-quality-api\.open-meteo/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(AIR) });
    if (/geocoding-api\.open-meteo/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(GEO) });
    if (/api\.open-meteo\.com\/v1\/forecast/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(PREV) });
    r.continue();
  });
  await p.evaluateOnNewDocument((q, theme, rot, vider) => {
    window.__RAYLE_TB_TEST__ = { sansReseau: true };
    if (q != null) localStorage.setItem('rayle_entite_qualite', String(q)); else localStorage.removeItem('rayle_entite_qualite');
    localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_boot_jarvis', '0');
    if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); localStorage.setItem('rayle_tableau_bord', JSON.stringify({ version: 1, actif: true, meteo: { nom: 'Pau', lat: 43.3, lon: -0.37 } })); localStorage.removeItem('rayle_g1_taches'); }
    if (rot) localStorage.setItem('rayle_g1_rotation', String(rot));
    if (theme) localStorage.setItem('rayle_theme', theme); else localStorage.removeItem('rayle_theme'); if (!sessionStorage.getItem('__c')) { localStorage.removeItem('rayle_g1_couleur'); sessionStorage.setItem('__c', '1'); }
    window.__geoAppels = 0; try { Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (ok, ko) => { window.__geoAppels++; ok({ coords: { latitude: 43.2951, longitude: -0.3708 } }); } }, configurable: true }); } catch (e) {}
  }, opts.qualite ?? null, opts.theme || null, opts.rotation || null);
  await p.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(opts.attente || 3500);
  return p;
}
const injecter = p => p.evaluate(async () => {
  const TB = window.TableauBord, now = Date.now();
  const serie = (a, c, n = 40) => Array.from({ length: n }, (_, i) => a + (c - a) * i / n + Math.sin(i) * Math.abs(c - a) * 0.05);
  TB.injecter('actus', { titres: Array.from({ length: 6 }, (_, i) => ({ titre: 'Titre d’actualité numéro ' + (i + 1), source: 'Source ' + i, quand: 'il y a ' + (i + 1) + ' h' })), perime: false });
  TB.injecter('marche', { lignes: [{ id: 'BTC', nom: 'BTC', prix: 67890.4, decimales: 1, pct: 1.23, courbe: serie(66000, 67900), t: now }, { id: 'SOL', nom: 'SOL', prix: 152.31, decimales: 2, pct: -0.84, courbe: serie(158, 152), t: now }, { id: 'XAU', nom: 'Or', prix: 2650.3, decimales: 2, pct: 0.1, courbe: [2650.1, 2650.4, 2650.2, 2650.5, 2650.3, 2650.6, 2650.2, 2650.4, 2650.3, 2650.35], t: now }, { id: 'US100', nom: 'US100', prix: 20123.4, decimales: 1, pct: 0.4, courbe: serie(20000, 20123), t: now }] });
  TB.injecter('terre', { lignes: [{ id: 'a', type: 'seisme', titre: 'M 5.6 · Chili', severite: 3, age: 'il y a 1 h' }], etiquette: 'reel' });
  // faux client de marché (le même module que la table de Mars) : DOGE est en panne, l'or est très calme
  const m = await import(new URL('planetes/mars/pc/trading/session.js', document.baseURI).href);
  const MS = { M15: 900e3, H1: 3600e3, H4: 14400e3, D1: 86400e3 };
  window.__demandes = [];
  m.obtenirClient({ serie: async (inst, un) => {
    window.__demandes.push(inst + '|' + un);
    if (inst === 'DOGE') return { bougies: [], erreur: 'Worker injoignable (test)', vide: true };
    const n = 200, base = { BTC: 67000, SOL: 150, XAU: 2650, US100: 20000 }[inst] || 100, amp = inst === 'XAU' ? 0.0008 : 0.01; let p = base, t0 = Date.now() - 90e3 - (n - 1) * MS[un];
    const bougies = Array.from({ length: n }, (_, i) => { const o = p; p = o * (1 + Math.sin(i / 7 + inst.length) * amp * 0.4 + Math.cos(i * 1.3) * amp * 0.15); const h = Math.max(o, p) * (1 + amp * 0.2), l = Math.min(o, p) * (1 - amp * 0.2); return { t: t0 + i * MS[un], o, h, l, c: p, v: inst === 'US100' ? 0 : 100 + (i % 9) * 15 }; });
    return { instrument: inst, unite: un, bougies, meta: { source: 'Test', differe: inst === 'US100' }, volume: { type: 'reel', note: 'volume de test' }, erreur: null, vide: false };
  } });
  window.G1.actualiser();
});
const compte = (p, sel) => p.evaluate(s => document.querySelectorAll(s).length, sel);
const rect = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);
const inter = (a, c) => a && c && a.x < c.r - 0.5 && c.x < a.r - 0.5 && a.y < c.b - 0.5 && c.y < a.b - 0.5;

let p = await page({ rotation: 5 }); await p.evaluate(() => Panneaux.fermerTout()); await injecter(p); await attendre(1500);
v('thème Aurore par défaut (body.g1)', await p.evaluate(() => document.body.classList.contains('g1') && window.G1.theme() === 'aurore'));
// 1. noyau énorme ; 2. repos : fines colonnes, aucune grosse carte permanente
const rr = await rect(p, '#reactor');
v('noyau énorme : réacteur ≥ 90 % de la hauteur (le nuage visible ≈ 40 %)', rr.h >= 0.9 * 900 && rr.w >= 0.9 * 900, Math.round(rr.w) + ' px');
v('noyau centré (± 6 % de la largeur)', Math.abs(rr.x + rr.w / 2 - 800) < 96);
v('aucune grosse carte permanente (pas de .g1-f), fenêtre fermée', (await compte(p, '.g1-f')) === 0 && await p.evaluate(() => document.getElementById('g1Fen').hidden));
v('anneaux d’arcs et éclats angulaires roses (≥ 12 polygones) autour du noyau', (await compte(p, '#g1Anneaux path')) >= 6 && (await compte(p, '#g1Eclats polygon')) >= 12);
v('colonne de repos à gauche : actualités et journal en petit texte', await p.evaluate(() => { const f = document.getElementById('g1Fil'); return f.querySelectorAll('.g1-fil-l li').length >= 3 && f.querySelectorAll('.g1-fil-j li').length >= 1 && parseFloat(getComputedStyle(f.querySelector('.g1-fil-l b')).fontSize) <= 12.5; }));
v('petits graphiques discrets en haut à droite (BTC, OR, US100)', await p.evaluate(() => { const g = document.getElementById('g1Graphs'), r = g.getBoundingClientRect(); return g.querySelectorAll('.g1-pg').length === 3 && (document.body.classList.contains('g1-mini') ? !!document.querySelector('.gf[data-id="mini-marche"]') : r.right > innerWidth * 0.8 && r.top < 120); }));   // R2 : les petites fenêtres du gestionnaire commun remplacent la colonne de mini-courbes
v('courbe de l’or : amplitude plancher (ne zigzague plus)', await p.evaluate(() => { const d = document.querySelector('.g1-pg[data-inst=XAU] svg path').getAttribute('d'); const ys = [...d.matchAll(/ ([\d.]+)/g)].map(m => +m[1]); return ys.length > 3 && Math.max(...ys) - Math.min(...ys) < 12; }));
const texteAccueil = await p.evaluate(() => document.body.innerText);
v('plus aucun reste de l’ancien affichage de la Terre (IPS, LAT, REMP…)', !/\bIPS\b|\bLAT\b|REMP\s?(GI|SR|RR)/i.test(texteAccueil));
// 3. dock
v('dock : bague d’état + cinq icônes avec libellés', await p.evaluate(() => { const t = [...document.querySelectorAll('.g1-ic small')].map(e => e.textContent); return !!document.querySelector('#g1Etat i') && t.join(',') === 'Accueil,Vie,Communications,Espaces,Réglages'; }));
v('libellés des icônes entièrement visibles (sans « … »)', await p.evaluate(() => [...document.querySelectorAll('.g1-ic small')].every(e => e.scrollWidth <= e.clientWidth + 1)));
await p.evaluate(() => document.querySelector('[data-i=espaces]').click());
v('menu Espaces : Terre, Mars, Saturne…', await p.evaluate(() => { const m = document.getElementById('g1Menu'); return !m.hidden && ['Terre', 'Mars', 'Saturne', 'Terminal', 'Galaxie'].every(n => m.textContent.includes(n)); }));
await p.evaluate(() => document.querySelector('[data-i=espaces]').click());
v('vague du dock dessinée dans le tiers inférieur, sur toute la largeur', await p.evaluate(() => { const c = document.getElementById('g1Vague'), r = c.getBoundingClientRect(), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++; return n > 200 && r.width >= innerWidth * 0.95 && r.top > innerHeight * 0.6; }));
// 4. fenêtre à la demande : Vie → météo (ville enregistrée : Pau)
await p.evaluate(() => document.querySelector('[data-i=vie]').click()); await attendre(1500);
v('clic sur « Vie » : UNE grande fenêtre verticale devant le noyau', await p.evaluate(() => { const f = document.getElementById('g1Fen'), r = f.getBoundingClientRect(); return !f.hidden && f.dataset.id === 'meteo' && r.height > r.width * 1.15 && r.height > innerHeight * 0.5 && document.querySelectorAll('.g1-fen:not([hidden])').length === 1; }));
v('cadre néon épais arrondi, titre au-dessus du cadre', await p.evaluate(() => { const c = document.querySelector('.g1-fen-cadre'), s = getComputedStyle(c), t = document.getElementById('g1FenTitre').getBoundingClientRect(), r = c.getBoundingClientRect(); return parseFloat(s.borderTopWidth) >= 3 && parseFloat(s.borderTopLeftRadius) >= 20 && /rgb/.test(s.boxShadow) && t.bottom <= r.top + 6 && /Météo/i.test(document.getElementById('g1FenTitre').textContent); }));
v('légèrement inclinée en perspective', await p.evaluate(() => /matrix3d/.test(getComputedStyle(document.getElementById('g1Fen')).transform)));
v('le noyau recule, s’assombrit et reste visible (flou) derrière', await p.evaluate(() => { const s = getComputedStyle(document.getElementById('reactor')); return /blur/.test(s.filter) && /brightness/.test(s.filter) && document.body.classList.contains('g1-grand') && document.getElementById('reactor').getBoundingClientRect().width > 300; }));
v('fenêtre entièrement dans l’écran', await p.evaluate(() => { const r = document.getElementById('g1Fen').getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
v('météo : 8 tuiles, courbe dégradée jaune-rose-bleu, trois petits graphiques', await p.evaluate(() => { const f = document.getElementById('g1FenC'); return f.querySelectorAll('.g1-tuiles>div').length === 8 && /Température/.test(f.textContent) && /Qualité de l’air/.test(f.textContent) && /Indice UV/.test(f.textContent) && /url\(#g1Grad\)/.test(f.querySelector('.g1-jour .trait').outerHTML) && f.querySelectorAll('.g1-jour linearGradient stop').length >= 3 && f.querySelectorAll('.g1-petites svg').length === 3; }));
v('météo : champ de recherche + « Utiliser ma position », ville affichée', await p.evaluate(() => !!document.getElementById('g1Ville') && /Utiliser ma position/.test(document.getElementById('g1FenC').textContent) && /Pau/.test(document.querySelector('.g1-lieu').textContent)));
v('géolocalisation JAMAIS demandée avant le clic', (await p.evaluate(() => window.__geoAppels)) === 0);
await p.type('#g1Ville', 'Lourdes'); await p.keyboard.press('Enter'); await attendre(900);
v('recherche de ville : résultat proposé', await p.evaluate(() => /Lourdes/.test(document.getElementById('g1Res').textContent)));
await p.evaluate(() => document.querySelector('#g1Res [data-a=choisir]').click()); await attendre(1200);
v('ville choisie : mémorisée (stockage de l’appareil) et affichée', await p.evaluate(() => /Lourdes/.test(document.querySelector('.g1-lieu').textContent) && /Lourdes/.test(localStorage.getItem('rayle_tableau_bord'))));
await p.evaluate(() => document.querySelector('[data-a=position]').click()); await attendre(1200);
v('« Utiliser ma position » : demandée au clic seulement, ville mémorisée', await p.evaluate(() => window.__geoAppels === 1 && /Ma position/.test(document.querySelector('.g1-lieu').textContent) && /Ma position/.test(localStorage.getItem('rayle_tableau_bord'))));
// à faire
await p.evaluate(() => document.querySelector('#g1Onglets [data-t=afaire]').click()); await attendre(300);
v('à faire : compteurs ouvertes / en retard / pour aujourd’hui à zéro, état vide propre', await p.evaluate(() => { const c = [...document.querySelectorAll('.g1-cpt b')].map(e => e.textContent); return c.join(',') === '0,0,0' && /Aucune tâche/.test(document.getElementById('g1FenC').textContent); }));
await p.type('#g1Tache', 'Rendre le rapport'); await p.evaluate(() => { document.getElementById('g1TacheDate').value = '2020-01-02'; document.querySelector('#g1Ajout [type=submit]').click(); }); await attendre(300);
await p.type('#g1Tache', 'Appeler le labo'); await p.keyboard.press('Enter'); await attendre(300);
v('à faire : deux tâches, une en retard, liste à cocher', await p.evaluate(() => [...document.querySelectorAll('.g1-cpt b')].map(e => e.textContent).join(',') === '2,1,0' && document.querySelectorAll('.g1-todo li').length === 2 && document.querySelectorAll('.g1-coche svg circle').length === 2));
await p.evaluate(() => document.querySelector('.g1-todo li .g1-coche').click()); await attendre(200);
v('à faire : cocher met à jour les compteurs, mémorisé sur l’appareil', await p.evaluate(() => [...document.querySelectorAll('.g1-cpt b')].map(e => e.textContent).join(',') === '1,0,0' && JSON.parse(localStorage.getItem('rayle_g1_taches')).length === 2));
// messages, santé
await p.evaluate(() => document.querySelector('#g1Onglets [data-t=messages]').click()); await attendre(200);
v('messages : le message de bienvenue de Raylé est déjà listé, rien d’inventé', await p.evaluate(() => document.querySelectorAll('.g1-msgs li').length <= 1));
await p.evaluate(() => { RayleBus.emit('raylé:question', { texte: 'Quelle heure est-il ?' }); RayleBus.emit('raylé:reponse', { texte: 'Il est vingt et une heures.' }); }); await attendre(300);
v('messages : liste à puces des échanges', await p.evaluate(() => document.querySelectorAll('.g1-msgs li').length >= 2 && /vingt et une/.test(document.querySelector('.g1-msgs').textContent) && /Quelle heure/.test(document.querySelector('.g1-msgs').textContent)));
await p.evaluate(() => document.querySelector('#g1Onglets [data-t=sante]').click()); await attendre(200);
v('santé : silhouette en traits néon, indicateurs « non connecté » (rien d’inventé)', await p.evaluate(() => { const f = document.getElementById('g1FenC'); return !!f.querySelector('svg.g1-corps') && f.querySelectorAll('.g1-ind li').length === 4 && [...f.querySelectorAll('.g1-ind b')].every(e => e.textContent === '—') && /NON CONNECTÉ/.test(f.textContent); }));
// actualités, alertes, événements, systèmes
for (const [id, re] of [['actus', /Titre d’actualité numéro 1/], ['alertes', /Aucune alerte|Agent/], ['terre', /Chili/], ['systemes', /\d+ %/]]) {
  await p.evaluate(i => document.querySelector('#g1Onglets [data-t=' + i + ']').click(), id); await attendre(250);
  v('contenu « ' + id + ' » affiché', await p.evaluate(r => new RegExp(r).test(document.getElementById('g1FenC').textContent), re.source));
}
// marché : bougies, rotation, pause, pastilles
await p.evaluate(() => document.querySelector('#g1Onglets [data-t=marche]').click()); await attendre(2500);
const gb = () => p.evaluate(() => { const g = window.G1.graphique(); return g ? g.etat() : null; });
let e0 = await gb();
v('marché : vrai graphique en bougies (canvas), volume discret, dernière valeur, variation, étiquette', await p.evaluate(() => { const c = document.getElementById('g1Marche'); return !!c.querySelector('canvas') && c.querySelectorAll('canvas').length >= 2 && /[\d]/.test(c.querySelector('[data-r=prix]').textContent) && /%/.test(c.querySelector('[data-r=var]').textContent) && c.querySelector('[data-r=etat]').textContent === 'RÉEL' && +c.dataset.bougies > 50; }), JSON.stringify(e0));
v('marché : départ BTC en H1, rotation toutes les 5 s (réglage mémorisé)', e0 && e0.instrument === 'BTC' && e0.unite === 'H1' && e0.intervalle === 5 && !e0.pause);
await p.screenshot({ path: 'docs/captures-r1/g1-fenetre-marche.png' });
await attendre(6500);
let e1 = await gb();
v('marché : rotation automatique vers l’instrument suivant (SOL)', e1 && e1.instrument === 'SOL' && e1.unite === 'H1', JSON.stringify(e1));
await p.hover('#g1Marche .gb-zone'); await attendre(300); const e2 = await gb(); await attendre(6500); const e3 = await gb();
v('marché : arrêtée au survol (aucun changement pendant 6 s)', e2.pause && e3.instrument === e2.instrument, JSON.stringify([e2, e3]));
await p.mouse.move(5, 5); await attendre(300);
await p.evaluate(() => document.querySelector('#g1Marche [data-i=DOGE]').click()); await attendre(1200);
v('marché : pastille DOGE = « Données indisponibles » + raison, aucune courbe inventée', await p.evaluate(() => { const c = document.getElementById('g1Marche'), m = c.querySelector('[data-r=msg]'); return !m.hidden && /Données indisponibles/.test(m.textContent) && /Worker injoignable/.test(m.textContent) && c.querySelector('[data-r=etat]').textContent === 'INDISPONIBLE' && c.querySelector('[data-r=prix]').textContent === '—'; }));
await p.evaluate(() => document.querySelector('#g1Marche [data-i=XAU]').click()); await attendre(1200);
await p.evaluate(() => document.querySelector('#g1Marche [data-u=D1]').click()); await attendre(1200);
v('marché : pastilles instrument + unité (OR en D)', await p.evaluate(() => { const c = document.getElementById('g1Marche'); return c.dataset.instrument === 'XAU' && c.dataset.unite === 'D1' && c.querySelector('[data-r=msg]').hidden && c.querySelector('[data-r=nom]').textContent === 'OR'; }));
v('marché : clic = rotation arrêtée jusqu’à « reprendre »', (await gb()).pause === true);
await p.evaluate(() => document.querySelector('#g1Marche [data-r=pause]').click()); await attendre(200);
v('marché : « reprendre » relance la rotation', (await gb()).pause === false);
v('marché : bouton « Ouvrir la vue complète »', await p.evaluate(() => /Ouvrir la vue complète/.test(document.getElementById('g1FenP').textContent)));
// fermer : Échap, Accueil, fond
await p.keyboard.press('Escape'); await attendre(1000);
v('Échap : la fenêtre se ferme, le noyau revient', await p.evaluate(() => document.getElementById('g1Fen').hidden && !document.body.classList.contains('g1-grand') && !/blur/.test(getComputedStyle(document.getElementById('reactor')).filter)));
// voix et télécommande
const rep = await p.evaluate(() => window.G1.commande('ouvre la fenêtre météo'));
v('voix : « ouvre la fenêtre météo » ouvre la fenêtre', /fenêtre météo/.test(rep || '') && await p.evaluate(() => window.G1.courant() === 'meteo'));
v('voix : « ferme la fenêtre » la ferme', !!(await p.evaluate(() => window.G1.commande('ferme la fenêtre'))) && await p.evaluate(() => window.G1.courant() === null));
v('voix : une phrase ordinaire n’est pas prise', (await p.evaluate(() => window.G1.commande('quel temps fait-il demain'))) === null);
await p.evaluate(() => window.Telecommande && window.Telecommande.appliquer({ a: 'rayle', id: 'fenetre', nom: 'marche' })); await attendre(800);
v('télécommande : « fenêtre marché » ouvre la grande fenêtre', await p.evaluate(() => window.G1.courant() === 'marche'));
await p.evaluate(() => document.querySelector('[data-i=accueil]').click()); await attendre(500);
v('icône Accueil : ferme la fenêtre', await p.evaluate(() => window.G1.courant() === null));
v('un clic sur un petit graphique ouvre le marché sur cet instrument', await (async () => { await p.evaluate(() => document.querySelector('.g1-pg[data-inst=US100]').click()); await attendre(1500); return p.evaluate(() => window.G1.courant() === 'marche' && window.G1.graphique().etat().instrument === 'US100'); })());
await p.evaluate(() => window.G1.fermer());
// couleur et thème
v('options de couleur : doré et cyan disponibles', await p.evaluate(() => { const o = [...document.querySelectorAll('#g1Couleur option')].map(x => x.textContent); return o.some(t => /Doré/.test(t)) && o.some(t => /Cyan/.test(t)) && /Rose/.test(o[0]); }));
await p.evaluate(() => window.G1.definir(null, 'cyan'));
v('couleur cyan : le noyau reprend ses couleurs d’origine', await p.evaluate(async () => { const m = await import(new URL('skins/neurone/etats-reseau.js', document.baseURI).href); return Math.abs(m.ETATS.idle.c[0] - .2) < 2 && window.G1.couleur() === 'cyan'; }));
await p.select('#g1Theme', 'jarvis'); await attendre(500);
v('thème Jarvis de secours : tableau Jarvis revient, g1 disparaît', await p.evaluate(() => !document.body.classList.contains('g1') && getComputedStyle(document.getElementById('tableau')).display !== 'none' && getComputedStyle(document.getElementById('g1')).display === 'none'));
await p.close();

// mode léger : noyau simplifié, une fenêtre à la fois, graphique statique, aucune animation continue
p = await page({ qualite: 2, rotation: 5 }); await injecter(p); await attendre(1200);
v('mode léger : pas d’éclats, aucune animation continue du noyau et des anneaux', await p.evaluate(() => getComputedStyle(document.getElementById('g1Eclats')).display === 'none' && getComputedStyle(document.querySelector('#g1Anneaux .a1')).animationName === 'none'));
await p.evaluate(() => window.G1.ouvrir('marche')); await attendre(2500);
const el0 = await p.evaluate(() => window.G1.graphique().etat()); await attendre(6500); const el1 = await p.evaluate(() => window.G1.graphique().etat());
v('mode léger : graphique statique (aucune rotation), une seule fenêtre', el0.leger && el1.instrument === el0.instrument && el1.unite === el0.unite && (await compte(p, '.g1-fen:not([hidden])')) === 1);
await p.close();

// thème Jarvis choisi et conservé au rechargement
p = await page({ theme: 'jarvis', attente: 2500 });
v('thème Jarvis mémorisé : pas de body.g1 au démarrage', await p.evaluate(() => !document.body.classList.contains('g1')));
await p.close();

// toutes les tailles d'écran : rien ne se chevauche (bague d'état, « VERROUILLÉ », icônes, fenêtre), pas de défilement horizontal
for (const [L, H, tactile] of [[1280, 720, false], [1024, 600, false], [1600, 900, false], [1920, 1080, false], [768, 1024, true], [390, 844, true], [844, 390, true]]) {
  p = await page({ viewport: { width: L, height: H, isMobile: tactile, hasTouch: tactile } }); await p.evaluate(() => Panneaux.fermerTout()); await injecter(p); await attendre(800);
  await p.evaluate(() => { document.getElementById('g1EtatT').textContent = 'VERROUILLÉ'; });   // le libellé le plus long
  const ba = await rect(p, '#g1Etat'), lib = await rect(p, '#g1EtatT'), ic = await rect(p, '.g1-icones'), bag = await rect(p, '#g1Etat i'), dock = await rect(p, '.g1-dock-in');
  v(L + '×' + H + ' : « VERROUILLÉ » ne chevauche ni la bague, ni les icônes, et reste dans l’écran', !inter(lib, ic) && !inter(lib, bag) && !inter(bag, ic) && lib.x >= 0 && lib.r <= L && dock.x >= 0 && dock.r <= L + 1 && dock.b <= H, JSON.stringify({ lib, ic: ic && { x: ic.x, r: ic.r } }));
  v(L + '×' + H + ' : pas de défilement horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.evaluate(() => window.G1.ouvrir('meteo')); await attendre(700);
  const fe = await rect(p, '#g1Fen'), ic2 = await rect(p, '.g1-icones');
  v(L + '×' + H + ' : fenêtre dans l’écran et au-dessus du dock', fe.x >= 0 && fe.y >= 0 && fe.r <= L + 1 && fe.b <= H && !inter(fe, ic2) && !inter(fe, lib) && !inter(fe, bag), JSON.stringify(fe));
  if (L === 1600) await p.evaluate(() => window.G1.fermer());
  await p.close();
}

v('aucune erreur de page', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
await b.close();
console.log('\n' + ok + ' OK, ' + ko + ' KO'); process.exit(ko ? 1 : 0);
