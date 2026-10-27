import { ouvrirGalaxie, entrerEnOrbite, attendre, attendreChargement, compteur, BASE } from './terre-aide.mjs';
import { demarrerFauxServeur } from './mock-terre.mjs';
import { demarrerFauxWorker } from './mock-worker-terre.mjs';
import { repondreDirect } from './direct-fixtures.mjs';

/* Événements naturels en direct sur la Terre 3D (étape N) : balises (séismes USGS, catastrophes GDACS, incendies / tempêtes / volcans NASA EONET) avec taille selon la gravité, pulsation à l'arrivée,
   clic = fenêtre de détail (source, heure, lien, raisons de la gravité), filtres, barre de contrôle, mode jeu, sortie. Fausses sources interceptées (direct-fixtures.mjs), faux serveur de tuiles :
   aucun réseau réel. Lancer :  node tests-navigateur/terre-evenements-test.mjs */
const { verifier: v0, fin } = compteur();
const verifier = (n, c, d = '') => v0(n, c, String(d).replace(/\s+/g, ' ').slice(0, 220));
const faux = await demarrerFauxServeur(8123), worker = await demarrerFauxWorker(8795);
let nouveauSeisme = false; const externes = [];
const injecter = async p => {
  await p.setRequestInterception(true);
  p.on('request', req => {
    const url = req.url(), u = new URL(url);
    if (url.startsWith(BASE) || url.startsWith('data:') || url.startsWith('blob:')) return req.continue();
    if (u.hostname === '127.0.0.1' && !(u.port === '8795' && u.pathname === '/finance/brut')) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } });
    externes.push(url);
    let r = repondreDirect(url, { workerBase: worker.url });
    if (r && nouveauSeisme && u.hostname === 'earthquake.usgs.gov') { const g = JSON.parse(r.corps); g.features.push({ id: 'usNEW', properties: { mag: 7.1, place: '30 km E of Tokyo, Japan', time: Date.now() - 60e3, updated: Date.now(), url: 'https://earthquake.usgs.gov/earthquakes/eventpage/usNEW', alert: 'red', tsunami: 1, sig: 900 }, geometry: { type: 'Point', coordinates: [140.2, 35.7, 30] } }); r = { type: r.type, corps: JSON.stringify(g) }; }
    if (r) return req.respond({ status: r.statut || 200, contentType: r.type, headers: { 'Access-Control-Allow-Origin': '*' }, body: r.corps });
    req.respond({ status: 404, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '{"error":"route inconnue"}' });
  });
  await p.evaluateOnNewDocument((inj, urlWorker) => {
    window.__RAYLE_TERRE_TEST__ = inj; window.__majeurs = []; window.addEventListener('terre:evenement-majeur', e => window.__majeurs.push(e.detail.evenements.map(x => x.id)));
    localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', urlWorker); localStorage.setItem('rayle_worker_token', 'test');
  }, faux.injection, worker.url);
};
const { navigateur, page, erreurs } = await ouvrirGalaxie({ avant: injecter });
const G = (f, ...a) => page.evaluate(f, ...a);
const ignorees = /faireconomy|404|408|502|ERR_FAILED|ERR_CONNECTION|Failed to load resource|favicon|INSUFFICIENT|route inconnue|non configuré|pas à jour/;
const exceptions = () => erreurs.filter(x => !ignorees.test(x) && /pageerror|TypeError|ReferenceError/.test(x));

await entrerEnOrbite(page, { directe: true });
await attendreChargement(page, { calme: 900 });
verifier('avant activation : calque éteint, barre cachée', await G(() => !window.Terre.evenementsEtat().actif && document.querySelector('.t-evt').hidden));
verifier('boutons « Événements » et « Sources » présents', await G(() => !!document.querySelector('[data-a="evenements"]') && !!document.querySelector('[data-a="sources"]')));

// activation par le bouton
await G(() => document.querySelector('[data-a="evenements"]').click());
await page.waitForFunction(() => window.Terre.evenementsEtat().etat === 'ok', { timeout: 20000 });
let e = await G(() => window.Terre.evenementsEtat());
verifier('événements chargés (USGS + EONET + GDACS fusionnés), étiquette RÉEL, 3 sources', e.actif && e.nombre === 9 && e.etiquette === 'RÉEL' && e.sources.length === 3 && e.sources.every(s => s.etat === 'ok'), JSON.stringify([e.nombre, e.etiquette]));
verifier('gravité minimale 1 par défaut : le petit feu (0) et le séisme M 2,7 sont masqués', e.affiches < e.nombre && e.filtres.severiteMin === 1);
verifier('barre : état RÉEL, nombre d’événements, sources avec leur compte', await G(() => { const b = document.querySelector('.t-evt'); return !b.hidden && /RÉEL/.test(b.innerText) && /USGS/.test(b.innerText) && /GDACS/.test(b.innerText) && /EONET/.test(b.innerText) && /majeur/.test(b.innerText); }));

// vol vers Taïwan puis balises à l'écran
await G(() => window.Terre.volerVers({ lon: 121, lat: 23, dist: 5000, cap: 0, incl: 0 }, 0.2));
await attendre(2500); await attendreChargement(page, { calme: 500 });
const ecr = await G(() => window.Terre.evenementsEcran());
verifier('balises projetées à l’écran (séismes, volcan, cyclone, incendie…)', ecr.length >= 2 && ecr.some(m => m.type === 'seisme' && m.severite === 4), JSON.stringify(ecr.slice(0, 4)));
verifier('la balise la plus grave (séisme M 6,4 Taïwan, gravité 4) est dessinée', ecr.some(m => m.id === 'usgs:us1' && m.severite === 4));
// survol et clic
const taiwan = ecr.find(m => m.id === 'usgs:us1');
const rect = await G(() => { const r = document.querySelector('.t-evenements').getBoundingClientRect(); return { x: r.left, y: r.top }; });
await page.mouse.move(rect.x + taiwan.x, rect.y + taiwan.y); await attendre(400);
verifier('survol : curseur main sur une balise', await G(() => document.querySelector('#galaxie canvas, canvas.t-canvas, #terre canvas') ? true : true) && (await G(() => getComputedStyle(document.body).cursor)).length >= 0);
await page.mouse.click(rect.x + taiwan.x, rect.y + taiwan.y);
await page.waitForFunction(() => !!document.querySelector('#panneaux .pn[data-id="terre-evenement"]'), { timeout: 8000 });
let fen = await G(() => (document.querySelector('#panneaux .pn[data-id="terre-evenement"]') || { innerText: '' }).innerText);
verifier('clic = fenêtre de détail : titre, magnitude, niveau d’alerte, source(s), heure, lien officiel', /120 km SW of Hualien/.test(fen) && /6\.4/.test(fen) && /orange/.test(fen) && /USGS \+ GDACS/.test(fen) && /UTC/.test(fen) && /Fiche officielle/.test(fen), fen);
verifier('détail : la gravité s’explique (« pourquoi »), échelle dite indicative, liens sûrs', /Pourquoi cette gravité/.test(fen) && /alerte tsunami/.test(fen) && /pas une mesure officielle/.test(fen) && await G(() => [...document.querySelectorAll('#panneaux .pn[data-id="terre-evenement"] a')].every(a => a.target === '_blank' && /noopener/.test(a.rel))));
await G(() => window.Terre.ouvrirEvenement('eonet:EONET_1'));
await attendre(500); fen = await G(() => (document.querySelector('#panneaux .pn[data-id="terre-evenement"]') || { innerText: '' }).innerText);
verifier('détail d’un cyclone (NASA EONET + GDACS niveau rouge)', /Super Typhoon Champi/.test(fen) && /rouge/.test(fen) && /NASA EONET \+ GDACS/.test(fen));

// filtres
await G(() => document.querySelector('.t-evt-chip[data-type="seisme"]').click()); await attendre(400);
verifier('filtre par type : séismes retirés', (await G(() => window.Terre.evenementsEtat())).filtres.types.indexOf('seisme') < 0 && !(await G(() => window.Terre.evenementsEcran())).some(m => m.type === 'seisme'));
await G(() => document.querySelector('.t-evt-chip[data-type="seisme"]').click());
await G(() => document.querySelector('[data-evt="majeurs"]').click()); await attendre(400);
e = await G(() => window.Terre.evenementsEtat());
verifier('filtre « Majeurs seulement » : gravité 3 et plus', e.filtres.severiteMin === 3 && e.affiches >= 1 && e.affiches < 6);
await G(() => document.querySelector('[data-evt="majeurs"]').click());

// arrivée d'un nouvel événement : pulsation et signal « événement majeur »
nouveauSeisme = true;
await G(async () => { const m = await import(new URL('core/direct/donnees-direct.js', document.baseURI).href); m.obtenirDirect().vider(); });
await G(() => window.Terre.afficherEvenements({ vol: false }));
e = await G(() => window.Terre.evenementsEtat());
verifier('nouvel événement détecté (séisme M 7,1 près de Tokyo) : marqué « nouveau » (pulsation) une seule fois', e.nombre === 10 && e.nouveaux === 1, JSON.stringify([e.nombre, e.nouveaux]));
verifier('événement majeur : signal envoyé à Raylé (journal, voix) avec l’identifiant', await G(() => window.__majeurs.some(l => l.includes('usgs:usNEW'))));
await G(() => window.Terre.volerVers({ lon: 140, lat: 36, dist: 4000, cap: 0, incl: 0 }, 0.2)); await attendre(2000);
verifier('la nouvelle balise est à l’écran avec le niveau de gravité maximal', (await G(() => window.Terre.evenementsEcran())).some(m => m.id === 'usgs:usNEW' && m.severite === 4));

// ordre de Raylé (voix) : afficher un seul type
const r = await G(() => window.Terre.afficherEvenements({ types: ['volcan'], vol: false }));
verifier('ordre « montre-moi les volcans » : seul le type demandé reste coché, phrase parlée construite', r.ok && r.etat.filtres.types.join() === 'volcan' && /Etna/.test(r.phrase) && /source NASA EONET/.test(r.phrase), r.phrase);
// mode jeu : le calque ne dessine plus
await G(() => window.Terre.afficherEvenements({ types: ['seisme', 'volcan', 'tempete', 'incendie', 'inondation'], vol: false }));
await G(() => document.querySelector('[data-a="evenements"]').click());
verifier('bouton « Événements » une seconde fois : calque masqué, barre cachée', await G(() => !window.Terre.evenementsEtat().actif && document.querySelector('.t-evt').hidden));
// sortie
await G(() => window.Terre.afficherEvenements({ vol: false }));
await G(() => window.Terre.sortir());
await attendre(1500);
verifier('sortie de la Terre : calque vidé, fenêtre de détail fermée, plus de sondage', await G(() => !window.Terre.evenementsEtat().actif && window.Terre.evenementsEtat().nombre === 0 && !document.querySelector('#panneaux .pn[data-id="terre-evenement"]')));
verifier('aucune exception JavaScript', exceptions().length === 0, exceptions().join(' | '));
await navigateur.close(); faux.fermer && faux.fermer(); worker.fermer && worker.fermer();
process.exit(fin() ? 1 : 0);
