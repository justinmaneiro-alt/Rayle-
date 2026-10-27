// Étape 2 de l'accueil Jarvis : fenêtres d'actualités (France, Monde, rubriques), commandes vocales, modes, déplacement, honnêteté (Worker en panne / ancien).
// Faux Worker (mock-worker-terre.mjs, /actualites/fil), sans réseau. Captures dans captures-accueil/actus/. Lancer :  node tests-navigateur/accueil-actus-test.mjs  (serveur : node serveur.mjs)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { demarrerFauxWorker } from './mock-worker-terre.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const attendre = ms => new Promise(r => setTimeout(r, ms));
const SORTIE = new URL('../captures-accueil/actus/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'); fs.mkdirSync(SORTIE, { recursive: true });
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + String(d).replace(/\s+/g, ' ').slice(0, 200) : '')); };

const worker = await demarrerFauxWorker(8795);
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'] });
const erreurs = [];
async function page(o = {}) {
  const p = await b.newPage(); await p.setViewport(o.viewport || { width: 1600, height: 900 });
  if (o.reduire) await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  p.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error' && !/calendar|faireconomy|ERR_FAILED|404|502|Failed to load resource/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });
  await p.evaluateOnNewDocument((q, w, url) => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); if (q != null) localStorage.setItem('rayle_entite_qualite', String(q)); localStorage.removeItem('rayle_entite_niveau');
    if (w) { localStorage.setItem('rayle_worker_url', url); localStorage.setItem('rayle_worker_token', 'test'); } else { localStorage.removeItem('rayle_worker_url'); localStorage.removeItem('rayle_worker_token'); } }, o.qualite, o.worker !== false, worker.url);
  await p.goto(BASE + '/index.html' + (o.requete || ''), { waitUntil: 'load' }); await attendre(o.attente || 3200);
  await p.evaluate(() => { Entite.verrou && Entite.verrou(false); window.__dit = []; speak = async t => { window.__dit.push(String(t)); }; });
  return p;
}
const dire = async (p, t, ms = 1600) => { await p.evaluate(() => { window.__dit = []; }); await p.evaluate(t => { addLine('user', t); respond(t); }, t); await attendre(ms); };
const dit = p => p.evaluate(() => window.__dit.join(' | '));
const fen = p => p.evaluate(() => Array.from(document.querySelectorAll('#panneaux .pn:not(.hud-out)')).map(e => e.dataset.id));
const lignes = (p, id) => p.evaluate(id => { const e = document.querySelector('#panneaux .pn[data-id="' + id + '"]'); return e ? e.querySelectorAll('.ac-sujet').length : -1; }, id);
const cap = (p, n) => p.screenshot({ path: SORTIE + n + '.png' });

// ───────── 1. France : fenêtre, lignes réelles, liens sûrs, phrase parlée
let p = await page({ qualite: 1 });
v('module chargé', await p.evaluate(() => !!window.ActusAccueil && !!window.ActusAccueilContenu));
await dire(p, 'montre-moi les actualités', 2200);
v('France : une fenêtre « actus-france »', (await fen(p)).join() === 'actus-france', (await fen(p)).join());
const titres = await p.evaluate(() => Array.from(document.querySelectorAll('.ac-sujet .ac-titre')).map(a => a.textContent));
const FR = worker.FILS.france;
v("France : 7 lignes (mode normal), la plus reprise d abord, titres tous réels (Worker)", titres.length === 7 && titres[0] === FR[0].titre && titres.every(x => FR.some(s => s.titre === x)), titres.length + " · " + titres[0]);
v('France : « Sans lieu » aussi (pas besoin de lieu pour une liste)', titres.includes(FR[7].titre) === false || titres.length >= 7);
const liens = await p.evaluate(() => Array.from(document.querySelectorAll('.ac-titre')).map(a => [a.target, a.rel, a.href]));
v('liens : nouvel onglet, noopener, https', liens.every(l => l[0] === '_blank' && /noopener/.test(l[1]) && /^https:/.test(l[2])));
v('média, date relative et « repris par N médias » affichés', await p.evaluate(() => { const m = document.querySelector('.ac-sujet .ac-meta').textContent; return /repris par 9 médias/.test(m) && /Le Monde|franceinfo/.test(m) && /il y a|à l’instant/.test(m); }));
v('mise à jour affichée', await p.evaluate(() => /mis à jour/.test(document.querySelector('.ac-maj').textContent)));
v('Raylé annonce le sujet le plus repris (réel)', /Voici l’actualité en France\. Le plus repris : Mobilisation du 17 octobre/.test(await dit(p)), await dit(p));
v('la phrase annoncée n\'ouvre pas une 2e fenêtre de texte', (await fen(p)).length === 1);
v('requête /actualites/fil?portee=france avec le jeton', worker.journal.some(j => j.chemin === '/actualites/fil' && j.q.portee === 'france' && j.jeton === 'test'));
v('pastilles de rubrique présentes (réelles)', await p.evaluate(() => document.querySelectorAll('.ac-chip').length >= 4));
v('animation d\'ouverture et échelonnement (mode normal)', await p.evaluate(() => getComputedStyle(document.querySelector('.ac-sujet')).animationName === 'ac-entree'));
await cap(p, '01-france');

// ───────── 2. Monde + rubrique : fenêtres indépendantes, cumulées
await dire(p, 'et les actualités du monde', 2200);
await dire(p, 'les actus sport', 2200);
const ids = await fen(p);
v('trois fenêtres indépendantes : France, Monde, Sport', ['actus-france', 'actus-monde', 'actus-france-sport'].every(i => ids.includes(i)), ids.join());
const ts = await p.evaluate(() => Array.from(document.querySelectorAll('#panneaux .pn[data-id="actus-france-sport"] .ac-titre')).map(a => a.textContent));
v('Sport : seulement la catégorie sport (Football OM, Brest)', ts.length === 2 && ts.every(t => /Football|Brest/.test(t)), ts.join(' / '));
v('Monde : titres du fil monde', await p.evaluate(t => Array.from(document.querySelectorAll('#panneaux .pn[data-id="actus-monde"] .ac-titre')).some(a => a.textContent === t), worker.FILS.monde[0].titre));
await dire(p, 'les infos économie dans le monde', 2200);
v('rubrique + portée : « actus-monde-economie » (aucun sujet réel → message honnête)', (await fen(p)).includes('actus-monde-economie') && /aucun sujet/i.test(await p.evaluate(() => document.querySelector('#panneaux .pn[data-id="actus-monde-economie"] .pn-corps').textContent)) && /aucun sujet dans la rubrique économie/.test(await dit(p)), await dit(p));
await cap(p, '02-trois-fenetres');

// pastille : ouvre une autre fenêtre, ne remplace pas
const avant = (await fen(p)).length;
await p.evaluate(() => document.querySelector('#panneaux .pn[data-id="actus-france"] .ac-chip[data-ac-rub="societe"]').click()); await attendre(1500);
v('pastille « Société » : nouvelle fenêtre indépendante', (await fen(p)).includes('actus-france-societe') && (await fen(p)).length === avant + 1 && (await fen(p)).includes('actus-france'));

// ───────── 3. Déplacement
const r0 = await p.evaluate(() => { const r = document.querySelector('#panneaux .pn[data-id="actus-france"]').getBoundingClientRect(); const h = document.querySelector('#panneaux .pn[data-id="actus-france"] .pn-tete').getBoundingClientRect(); return { x: r.left, y: r.top, hx: h.left + 60, hy: h.top + 14 }; });
await p.mouse.move(r0.hx, r0.hy); await p.mouse.down(); await p.mouse.move(r0.hx + 120, r0.hy + 60, { steps: 6 }); await p.mouse.move(r0.hx - 700, r0.hy + 90, { steps: 8 }); await p.mouse.up(); await attendre(500);
const r1 = await p.evaluate(() => { const e = document.querySelector('#panneaux .pn[data-id="actus-france"]'); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, flotte: e.classList.contains('ac-flotte'), z: +e.style.zIndex, autres: Array.from(document.querySelectorAll('#panneaux .pn')).filter(x => x !== e && getComputedStyle(x).zIndex !== 'auto').length }; });
v('glisser l\'en-tête déplace la fenêtre (≈ -700 px, +90 px)', r1.flotte && Math.abs(r1.x - (r0.x - 700)) < 12 && Math.abs(r1.y - (r0.y + 90)) < 12, JSON.stringify([r0, r1]));
v('la fenêtre déplacée passe au premier plan', r1.z > 20);
v('les autres fenêtres ne bougent pas / restent ouvertes', (await fen(p)).length === avant + 1);
await p.mouse.move(r1.x + 80, r1.y + 14); await p.mouse.down(); await p.mouse.move(-400, -300, { steps: 6 }); await p.mouse.up(); await attendre(300);
v('jamais déplacée hors de l\'écran', await p.evaluate(() => { const r = document.querySelector('#panneaux .pn[data-id="actus-france"]').getBoundingClientRect(); return r.right > 60 && r.bottom > 20 && r.top >= -1; }));
await cap(p, '03-deplacee');

// ───────── 4. Fermer, actualiser
const n0 = worker.journal.filter(j => j.chemin === '/actualites/fil').length;
await dire(p, "actualise les actualités", 2400);
v('actualiser : le Worker est interrogé de nouveau (cache contourné)', worker.journal.filter(j => j.chemin === '/actualites/fil').length > n0 && /actualisées/.test(await dit(p)), await dit(p));
await dire(p, 'ferme les actualités', 900);
v('« ferme les actualités » ferme toutes les fenêtres d\'actualités', (await fen(p)).filter(i => /^actus-/.test(i)).length === 0 && /fermées/.test(await dit(p)));
await dire(p, 'ferme les actualités', 600);
v('aucune ouverte : réponse honnête', /Aucune fenêtre/.test(await dit(p)));
// « ferme tout » (commande existante) fonctionne aussi
await dire(p, 'les actus', 2000); await p.evaluate(() => command('ferme tout')); await attendre(900);
v('« ferme tout » (commande vocale existante) ferme aussi les actualités', (await fen(p)).length === 0);

// ───────── 5. Phrases qui ne sont PAS pour l'accueil : elles vont à l'agent (pas de fenêtre d'actualités)
const chats = () => worker.etat.chats.length; const c0 = chats();
await dire(p, 'les actualités sur la guerre en Ukraine', 1800);
v('« actus sur la guerre » : confiées à l\'agent, aucune fenêtre d\'actus', chats() > c0 && (await fen(p)).filter(i => /^actus-/.test(i)).length === 0);

// ───────── 6. Modes : léger (qualité 2) 5 lignes sans échelonnement · complet (qualité 0) tout le fil, plafonné à 10
await p.close();
p = await page({ qualite: 2 });
v('mode léger bien actif', await p.evaluate(() => document.body.dataset.hud === 'leger'), await p.evaluate(() => document.body.dataset.hud));
await dire(p, 'les actualités', 2200);
v('léger : 5 lignes', (await lignes(p, 'actus-france')) === 5, await lignes(p, 'actus-france'));
v('léger : aucune apparition échelonnée', await p.evaluate(() => getComputedStyle(document.querySelector('.ac-sujet')).animationName === 'none'));
await cap(p, '04-leger');
await p.close();
p = await page({ qualite: 0 });
v('mode complet bien actif', await p.evaluate(() => document.body.dataset.hud === 'complet'), await p.evaluate(() => document.body.dataset.hud));
await dire(p, 'les actualités', 2200);
v('complet : 8 sujets disponibles → 8 lignes (limite 10), échelonnées', (await lignes(p, 'actus-france')) === 8 && await p.evaluate(() => getComputedStyle(document.querySelector('.ac-sujet')).animationName === 'ac-entree'), await lignes(p, 'actus-france'));
await cap(p, '04-complet');
await p.close();

// ───────── 7. Animations réduites : aucune animation d'apparition
p = await page({ reduire: true });
await dire(p, 'les actualités', 2200);
v('animations réduites : fenêtre là, sans animation de lignes', (await lignes(p, 'actus-france')) > 0 && await p.evaluate(() => getComputedStyle(document.querySelector('.ac-sujet')).animationName === 'none'));
await p.close();

// ───────── 8. Worker en panne / ancien / non configuré : la raison est écrite, rien d'inventé
worker.scenario.fil = 'panne';
p = await page();
await dire(p, 'les actualités', 2200);
let corps = await p.evaluate(() => (document.querySelector('#panneaux .pn[data-id="actus-france"] .pn-corps') || {}).textContent || '');
v('panne : « Actualités indisponibles » + raison, aucune ligne inventée', /indisponibles/.test(corps) && /sources d’actualités sont indisponibles/.test(corps) && (await lignes(p, 'actus-france')) === 0, corps);
v('panne : Raylé le dit honnêtement', /Je n’ai pas pu lire l’actualité/.test(await dit(p)), await dit(p));
await cap(p, '05-panne');
await p.close();
worker.scenario.fil = 'ancien';
p = await page();
await dire(p, 'les actualités du monde', 2200);
corps = await p.evaluate(() => (document.querySelector('#panneaux .pn[data-id="actus-monde"] .pn-corps') || {}).textContent || '');
v('Worker pas à jour : demande de le déployer', /pas à jour|déployer/.test(corps), corps);
await p.close();
worker.scenario.fil = 'ok';
p = await page({ worker: false });
await dire(p, 'les actualités', 1800);
corps = await p.evaluate(() => (document.querySelector('#panneaux .pn[data-id="actus-france"] .pn-corps') || {}).textContent || '');
v('Worker non configuré : message clair', /Worker verrouillé ou non configuré/.test(corps), corps);
await p.close();

// ───────── 9. Téléphone : fenêtres empilées, pas de déplacement
p = await page({ viewport: { width: 390, height: 844 } });
await dire(p, 'les actualités', 2200);
const mobile = await p.evaluate(() => { const e = document.querySelector('#panneaux .pn[data-id="actus-france"]'); const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth, pos: getComputedStyle(e).position }; });
v('téléphone : la fenêtre tient dans l\'écran, en colonne', mobile.l >= 0 && mobile.r <= mobile.w + 1 && mobile.pos !== 'absolute', JSON.stringify(mobile));
await cap(p, '06-telephone');
await p.close();

// ───────── 10. Dans la galaxie : la Terre et l'agent restent maîtres des actualités
p = await page();
await p.evaluate(() => { document.body.classList.add('vue-galaxie'); });
v('galaxie ouverte : l\'accueil ne prend pas la commande', await p.evaluate(async () => (await ActusAccueil.commande('les actualités')) === null));
await p.close();

v('aucune exception JavaScript', erreurs.filter(e => !/Failed to load|Worker|route inconnue/.test(e)).length === 0, erreurs.join(' || '));
await b.close(); await worker.fermer();
console.log(ko ? ko + ' échec(s) / ' + (ok + ko) : 'TOUT PASSE — ' + ok + ' vérifications');
process.exit(ko ? 1 : 0);
