import puppeteer from 'puppeteer-core';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';
import { repondreDirect } from './direct-fixtures.mjs';

/* Sources en direct (étape N) dans Chrome : hub à six onglets (événements, communiqués, télévisions, réseaux vérifiés, podcasts, aujourd'hui), filtres, favoris, lecteurs lancés seulement au clic,
   fenêtres ambiantes « Événements en direct » et « En direct » (absentes en mode léger), voix, Worker absent. Toutes les sources sont de FAUSSES réponses interceptées (direct-fixtures.mjs) : aucun réseau réel.
   Lancer :  node tests-navigateur/direct-hub-test.mjs   (serveur local : node serveur.mjs, port 8000) */
const { verifier, fin } = compteur();
const WORKER = 'http://127.0.0.1:8797';
const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const erreurs = [], externes = [];
async function ouvrir({ brutAbsent = false, hud = null } = {}) {
  const page = await navigateur.newPage(); await page.setViewport({ width: 1500, height: 1000 });
  page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 220)); });
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 220)));
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    if (url.startsWith(BASE) || url.startsWith('data:') || url.startsWith('blob:')) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } });
    externes.push(url);
    const r = repondreDirect(url, { workerBase: WORKER, brutAbsent });
    if (r) return req.respond({ status: r.statut || 200, contentType: r.type, headers: { 'Access-Control-Allow-Origin': '*' }, body: r.corps });
    req.respond({ status: 404, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '{"error":"route inconnue"}' });
  });
  await page.evaluateOnNewDocument((w, h) => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', w); localStorage.setItem('rayle_worker_token', 'test'); localStorage.removeItem('rayle_direct_favoris'); if (h) localStorage.setItem('rayle_entite_qualite', h); }, WORKER, hud);
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1300);
  return page;
}
const corpsHub = page => page.evaluate(() => (document.querySelector('.dx-hub') || { innerText: '' }).innerText);
const attendreHub = (page, re, ms = 15000) => page.waitForFunction(r => new RegExp(r).test((document.querySelector('.dx-corps') || { innerText: '' }).innerText), { timeout: ms }, re);
const onglet = async (page, nom) => { await page.evaluate(n => document.querySelector('.dx-onglet[data-onglet="' + n + '"]').click(), nom); await attendre(400); };

const page = await ouvrir();
verifier('bouton « Sources » présent sur l’accueil', await page.evaluate(() => !!document.getElementById('btnSources')));
await page.evaluate(() => document.getElementById('btnSources').click());
await page.waitForSelector('.dx-hub', { timeout: 10000 }); await attendreHub(page, 'Séisme M 6\\.4');
let t = await corpsHub(page);
verifier('hub : six onglets', await page.evaluate(() => [...document.querySelectorAll('.dx-onglet')].map(o => o.textContent).join('|')) === 'Événements|Communiqués|Télévisions|Réseaux|Podcasts|Aujourd’hui');
verifier('événements : séismes, cyclone, volcan avec âge, gravité, source ; RÉEL', /Séisme M 6\.4/.test(t) && /Super Typhoon Champi/.test(t) && /Etna/.test(t) && /RÉEL/.test(t) && /USGS \+ GDACS/.test(t) && /majeure/.test(t), t.slice(0, 300));
verifier('événements : la gravité s’explique (raisons) et l’échelle est dite indicative', /gravité : magnitude 6\.4/.test(t) && /échelle indicative/.test(t));
verifier('événements : 3 sources listées avec leur état', /USGS · séismes/.test(t) && /GDACS/.test(t) && /EONET/.test(t));
verifier('événements : petit feu (gravité 0) masqué par défaut', !/Small brush fire/.test(t));
await page.evaluate(() => document.querySelector('.dx-chip[data-grav="0"]').click()); await attendre(500);
verifier('filtre « Tout » : le petit feu apparaît', /Small brush fire/.test(await corpsHub(page)));
await page.evaluate(() => document.querySelector('.dx-chip[data-grav="3"]').click()); await attendre(500);
t = await corpsHub(page);
verifier('filtre « Majeurs » : seulement gravité forte ou majeure', /Séisme M 6\.4/.test(t) && !/Banda Sea/.test(t));
await page.evaluate(() => document.querySelector('.dx-chip[data-type="seisme"]').click()); await attendre(500);
verifier('filtre par type : séismes décochés = plus de séismes', !/Séisme M 6\.4/.test(await corpsHub(page)));
// favoris
await page.evaluate(() => document.querySelector('.dx-chip[data-type="seisme"]').click()); await attendre(500);
await page.evaluate(() => document.querySelector('.dx-etoile').click()); await attendre(200);
verifier('favoris : une étoile est enregistrée sur l’appareil', await page.evaluate(() => JSON.parse(localStorage.getItem('rayle_direct_favoris') || '[]').length === 1));
await page.evaluate(() => { const c = document.querySelector('[data-fav-seul]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }); await attendre(600);
verifier('favoris seulement : la liste se réduit aux types favoris', await page.evaluate(() => document.querySelectorAll('.dx-liste li').length) >= 1 && await page.evaluate(() => [...document.querySelectorAll('.dx-liste li')].every(l => l.querySelector('.dx-etoile.on'))));
await page.evaluate(() => { const c = document.querySelector('[data-fav-seul]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }); await attendre(300);

// communiqués
await onglet(page, 'communiques'); await attendreHub(page, 'WHO issues alert');
t = await corpsHub(page);
verifier('communiqués : ONU, OMS, Commission, NASA, ESA, BCE ; SOURCE OFFICIELLE ; résumé court ; langue d’origine', /UN chief calls/.test(t) && /WHO issues alert/.test(t) && /nouveau cadre pour l’énergie/.test(t) && /NASA selects/.test(t) && /ESA signs/.test(t) && /ECB keeps/.test(t) && /SOURCE OFFICIELLE/.test(t) && /Résumé court/.test(t));
verifier('communiqués : liens sûrs', await page.evaluate(() => [...document.querySelectorAll('.dx-liste a')].every(a => a.target === '_blank' && /noopener/.test(a.rel))));
await page.evaluate(() => document.querySelector('.dx-chip[data-source="nasa"]').click()); await attendre(500);
verifier('communiqués : filtre par source', !/WHO issues/.test(await corpsHub(page)) && /NASA selects/.test(await corpsHub(page)));

// télévisions : rien ne démarre seul, lecture au clic
await onglet(page, 'tv'); t = await corpsHub(page);
const avantTv = await page.evaluate(() => document.querySelectorAll('.dx-tv iframe, .dx-tv video').length);
verifier('télévisions : 7 chaînes officielles, aucun lecteur lancé tant qu’on ne clique pas', avantTv === 0 && await page.evaluate(() => document.querySelectorAll('.dx-tv').length) === 7 && /qu’au clic/.test(t) && /FRANCE 24 \(français\)/.test(t) && /NHK WORLD-JAPAN/.test(t));
const ytAvant = externes.filter(u => /youtube/.test(u)).length;
await page.evaluate(() => document.querySelector('[data-lancer-tv="f24_fr"]').click()); await attendre(600);
const src = await page.evaluate(() => (document.querySelector('.dx-tv[data-tv="f24_fr"] iframe') || {}).src || '');
verifier('télévisions : un clic crée le lecteur YouTube sans cookies de la chaîne officielle', /^https:\/\/www\.youtube-nocookie\.com\/embed\/live_stream\?channel=UCCCPCZNChQdGa9EkATeye4g/.test(src), src);
verifier('télévisions : aucun appel à YouTube avant le clic', ytAvant === 0);
await page.evaluate(() => document.querySelector('[data-lancer-tv="euronews"]').click()); await attendre(400);
verifier('télévisions : un seul lecteur à la fois', await page.evaluate(() => document.querySelectorAll('.dx-tv iframe').length) === 1 && await page.evaluate(() => !document.querySelector('.dx-tv[data-tv="f24_fr"] iframe')));
await page.evaluate(() => document.querySelector('[data-arret-tv]').click()); await attendre(300);
verifier('télévisions : « Arrêter » retire le lecteur', await page.evaluate(() => document.querySelectorAll('.dx-tv iframe').length) === 0);
verifier('télévisions : lien vers le site officiel', await page.evaluate(() => [...document.querySelectorAll('.dx-tv-pied a')].every(a => /youtube\.com\/channel\/|nhk\.or\.jp/.test(a.href))));

// réseaux sociaux
await onglet(page, 'social'); await attendreHub(page, 'Message officiel');
t = await corpsHub(page);
verifier('réseaux : comptes VÉRIFIÉS lus (Bluesky + Mastodon), plateforme citée, republications ignorées', /Message officiel de who\.int/.test(t) && /Bluesky/.test(t) && /Mastodon/.test(t) && /Eilmeldung der tagesschau/.test(t) && /COMPTE VÉRIFIÉ/.test(t) && !/republication à ignorer/.test(t));
verifier('réseaux : comptes de fans écartés dits dans le pied de page', /Sources écartées/.test(t));

// podcasts
await onglet(page, 'podcasts'); await attendreHub(page, 'épisode 1');
t = await corpsHub(page);
verifier('podcasts : épisodes avec durée et radio publique ; rien ne joue seul', /Global News/.test(t) && /12 min/.test(t) && /BBC \(service public/.test(t) && await page.evaluate(() => document.querySelectorAll('.dx-lecteur audio').length) === 0);
await page.evaluate(() => document.querySelector('[data-ecouter="0"]').click()); await attendre(400);
verifier('podcasts : un clic crée le lecteur audio du fichier officiel (pas de transcription)', await page.evaluate(() => { const a = document.querySelector('.dx-lecteur audio'); return !!a && /ep1\.mp3$/.test(a.src) && a.controls; }));
await page.evaluate(() => document.querySelector('[data-podcast="npr_news"]').click()); await attendreHub(page, 'NPR News Now');
verifier('podcasts : autre podcast', /NPR/.test(await corpsHub(page)));

// aujourd'hui
await onglet(page, 'aujourdhui'); await attendreHub(page, 'Wikinews');
t = await corpsHub(page);
verifier('aujourd’hui : événements du jour (Wikipédia), « dans l’actualité », licence CC BY-SA', /ouragan Mitch/.test(t) && /Hôtel de Ville/.test(t) && /CC BY-SA/.test(t));
verifier('Wikinews : annoncé FERMÉ avec la date', /FERMÉ/.test(t) && /3 mai 2026/.test(t));

// voix
const voix = p => page.evaluate(p => window.DirectPage.commande(p), p);
let r = await voix('mets France 24 en direct');
verifier('voix : « mets France 24 en direct » ouvre le hub et lance la chaîne officielle', /Je lance FRANCE 24/.test(r) && await page.evaluate(() => !!document.querySelector('.dx-tv[data-tv="f24_fr"] iframe')), String(r).slice(0, 160));
r = await voix('un podcast de la BBC');
verifier('voix : « un podcast de la BBC » (rien ne démarre seul)', /BBC World Service/.test(r) && /Appuie sur Écouter/.test(r), String(r).slice(0, 200));
r = await voix('que dit l’OMS');
verifier('voix : « que dit l’OMS »', /Derniers communiqués officiels de OMS/.test(r) && /WHO issues alert/.test(r), String(r).slice(0, 200));
r = await voix('que dit l’AFP sur Bluesky');
verifier('voix : réseaux sociaux vérifiés', /Derniers messages de comptes publics vérifiés/.test(r) && /AFP/.test(r), String(r).slice(0, 200));
r = await voix('que s’est-il passé un 22 octobre');
verifier('voix : éphéméride Wikipédia', /dans l’histoire/.test(r) && /Mitch/.test(r), String(r).slice(0, 200));
r = await voix('ouvre les sources en direct');
verifier('voix : « ouvre les sources »', /sources en direct/.test(r));
verifier('voix : phrases étrangères ignorées', (await voix('quelle heure est-il')) == null && (await voix('la fed a décidé quoi')) == null);

// fenêtres ambiantes (accueil) : modes
await page.evaluate(() => { document.querySelectorAll('#panneaux .pn').forEach(p => p.remove()); document.body.classList.remove('avec-panneaux'); document.body.dataset.hud = 'complet'; });
const amb = await page.evaluate(async () => { window.TableauBord.rafraichir(); await new Promise(r => setTimeout(r, 4000)); return (document.querySelector('.tb-f[data-id="terre"]') || { innerText: '' }).innerText + '|' + ((document.querySelector('.tb-f[data-id="terre"] .tb-et') || {}).textContent || ''); });
verifier('tableau de bord (complet) : « Événements Terre » liste de vrais événements, étiquette RÉEL', /M 6\.4/.test(amb) && /RÉEL/.test(amb), amb.replace(/\n/g, ' | ').slice(0, 200));
// (l'ancienne fenêtre ambiante « En direct » (communiqués) n'existe plus : les communiqués restent dans le hub Sources)
await page.close();

// mode léger : aucune fenêtre ambiante en direct, aucun appel aux sources
const pl = await ouvrir({ hud: '2' }); const avant = externes.length;
await pl.evaluate(() => { document.body.dataset.hud = 'leger'; });
await attendre(7000);
const typesLeger = await pl.evaluate(() => [...document.querySelectorAll('.tb-f')].map(e => e.dataset.id));
verifier('mode léger : jamais de fenêtre « Événements Terre »', !typesLeger.includes('terre'), typesLeger.join());
verifier('mode léger : aucun appel aux sources en direct tout seul', externes.slice(avant).filter(u => /usgs|eonet|who\.int|ec\.europa|nasa\.gov|bsky|wikimedia/.test(u)).length === 0);
await pl.close();

// Worker non déployé : GDACS et flux Worker indisponibles, le reste marche
const p2 = await ouvrir({ brutAbsent: true });
await p2.evaluate(() => document.getElementById('btnSources').click()); await p2.waitForSelector('.dx-hub'); await attendreHub(p2, 'Séisme M 6\\.4');
t = await corpsHub(p2);
verifier('Worker non déployé : événements USGS + EONET affichés, GDACS « route du Worker non déployée »', /Séisme M 6\.4/.test(t) && /route du Worker non déployée/.test(t) && !/USGS \+ GDACS/.test(t));
await onglet(p2, 'communiques'); await attendreHub(p2, 'WHO issues alert');
t = await corpsHub(p2);
verifier('Worker non déployé : communiqués directs (OMS, Commission, NASA) affichés, ONU / ESA / BCE indisponibles dits', /WHO issues alert/.test(t) && !/UN chief calls/.test(t) && /route du Worker non déployée/.test(t));
await p2.close();

const filtrees = erreurs.filter(e => !/Failed to load resource|net::ERR|route inconnue|\b404\b|\b502\b/.test(e));
verifier('aucune erreur JavaScript inattendue', filtrees.length === 0, filtrees.slice(0, 3).join(' | '));
await navigateur.close();
process.exit(fin() ? 1 : 0);
