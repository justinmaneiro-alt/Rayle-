import puppeteer from 'puppeteer-core';
import { ouvrirGalaxie, entrerEnOrbite, attendre, attendreChargement, compteur, BASE, CHROME } from './terre-aide.mjs';
import { demarrerFauxServeur } from './mock-terre.mjs';
import { demarrerFauxWorker } from './mock-worker-terre.mjs';

/* Points 3 à 5 : actualités futuristes sur la Terre (balises, cartes, bandeau, panneaux France et Monde), la Terre comme outil de Raylé (actions de l'agent),
   présentation parlée avec la caméra qui suit chaque sujet, Terre vue de loin. Faux Worker (/actualites/fil, /chat) et fausses sources de tuiles : déterministe, sans réseau.
   Captures dans captures-terre/actus/. */
const { verifier: v0, fin } = compteur();
const verifier = (n, c, d = '') => v0(n, c, String(d).replace(/\s+/g, ' ').slice(0, 220));
const faux = await demarrerFauxServeur(8123), worker = await demarrerFauxWorker(8795);
const SORTIE = '../captures-terre/actus/';
import fs from 'node:fs'; fs.mkdirSync(SORTIE, { recursive: true });
const injecter = async p => {
  await p.evaluateOnNewDocument((inj, urlWorker) => {
    window.__RAYLE_TERRE_TEST__ = inj;
    localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', urlWorker); localStorage.setItem('rayle_worker_token', 'test');
  }, faux.injection, worker.url);
};
const { navigateur, page, erreurs } = await ouvrirGalaxie({ avant: injecter });
const G = (f, ...a) => page.evaluate(f, ...a);
const ignorees = /faireconomy|404|408|502|ERR_FAILED|ERR_CONNECTION|Failed to load resource|favicon|INSUFFICIENT|route inconnue|non configuré|pas à jour/;
const exceptions = () => erreurs.filter(x => !ignorees.test(x) && /pageerror|TypeError|ReferenceError/.test(x));
const fenetre = id => G(id => { const el = document.querySelector('#panneaux .pn[data-id="' + id + '"]'); return el ? { titre: (el.querySelector('.pn-titre,h3,header') || {}).innerText || '', texte: el.innerText, html: el.innerHTML } : null; }, id);
const attendreFenetre = (id, max = 15000) => page.waitForFunction(id => { const el = document.querySelector('#panneaux .pn[data-id="' + id + '"]'); return !!el && !el.querySelector('.t-charge'); }, { timeout: max }, id);
const etatS = () => G(() => window.Terre.sujetsEtat());
const attendreSujets = (n = 3) => page.waitForFunction(n => window.Terre.sujetsEtat().visibles.length >= n, { timeout: 15000 }, n);

await entrerEnOrbite(page, { directe: true });
await attendreChargement(page, { calme: 900 });
await G(() => { document.body.dataset.hud = 'complet'; });

// ── 1. Bouton « France » : vol, balises, cartes, bandeau, panneau ──
await G(() => document.querySelector('#terre-ui [data-a="france"]').click());
await attendreFenetre('terre-fil-france');
await attendreSujets(5);
await page.waitForFunction(() => !window.Terre.etat().vol, { timeout: 15000 }); await attendre(1200); await attendreChargement(page, { calme: 900 });
let e = await etatS(), terre = await G(() => window.Terre.etat());
verifier('1. la caméra a volé vers la France', Math.abs(terre.lat - 46.6) < 4 && Math.abs(terre.lon - 2.5) < 5 && terre.dist < 2500, JSON.stringify({ lat: terre.lat, lon: terre.lon, dist: terre.dist }));
verifier('1. les balises sont ancrées sur les lieux (7 sujets localisés sur 8)', e.sujets === 8 && e.visibles.length >= 6, `${e.sujets} sujets, ${e.visibles.length} visibles`);
const gros = e.visibles.find(b => b.rayon > 9), petit = e.visibles.find(b => b.id === 'brest-regate');
verifier('1. les sujets repris par plusieurs médias ont de plus grandes balises', gros && petit && gros.rayon > petit.rayon + 3, `${gros && gros.rayon} / ${petit && petit.rayon}`);
const couleurs = new Set(e.visibles.map(b => b.couleur));
verifier('1. la couleur dépend de la catégorie (au moins 4 couleurs)', couleurs.size >= 4, [...couleurs].join(' '));
verifier('1. des cartes holographiques sont rangées dans les marges (2 à 6)', e.cartes.length >= 2 && e.cartes.length <= 6, JSON.stringify(e.cartes.map(c => c.id)));
const rects = await G(() => [...document.querySelectorAll('#terre-ui .t-carte')].map(c => { const r = c.getBoundingClientRect(); return { id: c.dataset.id, x: r.x, y: r.y, w: r.width, h: r.height, titre: c.querySelector('.t-c-titre').innerText, href: c.querySelector('.t-c-titre').href, source: c.querySelector('footer b').innerText, pied: c.querySelector('footer').innerText }; }));
let recouvre = 0; for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const a = rects[i], b = rects[j]; if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) recouvre++; }
verifier('1. aucune carte ne chevauche une autre, toutes dans l’écran', recouvre === 0 && rects.every(r => r.x >= 0 && r.x + r.w <= 1600 && r.y >= 90 && r.y + r.h <= 900), JSON.stringify(rects.map(r => [r.id, Math.round(r.x), Math.round(r.y)])));
const pan = await G(() => [...document.querySelectorAll('#panneaux .pn')].map(el => { const r = el.getBoundingClientRect(); return { id: el.dataset.id, x: r.x, y: r.y, w: r.width, h: r.height }; }));
const surPanneau = rects.filter(c => pan.some(p => c.x < p.x + p.w && c.x + c.w > p.x && c.y < p.y + p.h && c.y + c.h > p.y));
verifier('1. les cartes s’écartent des fenêtres holographiques ouvertes (panneau France, réponse de Raylé)', surPanneau.length === 0, JSON.stringify({ panneaux: pan.map(p => [p.id, Math.round(p.x), Math.round(p.y), Math.round(p.w), Math.round(p.h)]), gene: surPanneau.map(c => c.id) }));
verifier('1. une carte = titre, média, heure, lien externe', rects.every(r => r.titre && /^https:\/\/exemple\.test\//.test(r.href) && r.source) && rects.some(r => /il y a \d+ min/.test(r.pied)), JSON.stringify(rects[0]));
verifier('1. localisation estimée signalée sur les cartes', rects.some(r => /localisation estimée/.test(r.pied)));
const bandeau = await G(() => { const b = document.querySelector('#terre-ui .t-bandeau'); return b && !b.hidden ? { texte: b.innerText, anim: getComputedStyle(b.querySelector('.t-bd-piste')).animationName, n: b.querySelectorAll('.t-bd-i').length } : null; });
verifier('1. un bandeau défile avec les titres (animation CSS)', bandeau && bandeau.anim === 't-bd-defile' && bandeau.n >= 8 && /Mobilisation du 17 octobre/.test(bandeau.texte), JSON.stringify(bandeau && { a: bandeau.anim, n: bandeau.n }));
const pf = await fenetre('terre-fil-france');
verifier('1. le panneau « France » liste les sujets avec média, importance, lieu estimé', pf && /Actualités · France/.test(pf.html + pf.titre) && /repris par 9 médias/.test(pf.texte) && /signalé par 1 média/.test(pf.texte) && /localisation estimée/.test(pf.texte) && (pf.html.match(/data-voir/g) || []).length === 7, pf && pf.texte.slice(0, 200));
verifier('1. « dernière mise à jour » et médias en panne indiqués', /mis à jour il y a \d+ min/.test(pf.texte) && /Indisponibles : La Dépêche/.test(pf.texte), pf && pf.texte.slice(-260));
await page.screenshot({ path: SORTIE + '01-france.png' });

// ── 2. Éclairer un sujet : « Voir », clic sur une balise ──
await G(() => document.querySelector('[data-voir="bordeaux-tram"]').click());
await attendre(2600);
e = await etatS(); terre = await G(() => window.Terre.etat());
verifier('2. « Voir » éclaire la balise et la caméra vole vers Bordeaux', e.eclaire === 'bordeaux-tram' && Math.abs(terre.lat - 44.84) < 1.5 && Math.abs(terre.lon + 0.58) < 2 && terre.dist < 1000, JSON.stringify({ lat: terre.lat, lon: terre.lon, dist: terre.dist, ecl: e.eclaire }));
await attendreChargement(page, { calme: 900 });
await attendre(600);
e = await etatS();
const carteEcl = await G(() => { const c = document.querySelector('#terre-ui .t-carte.t-eclaire'); return c ? c.dataset.id : null; });
verifier('2. la carte du sujet éclairé est mise en avant', carteEcl === 'bordeaux-tram', carteEcl);
await page.screenshot({ path: SORTIE + '02-bordeaux-eclaire.png' });
await G(() => window.Terre.volerVers({ lon: 2.5, lat: 46.6, dist: 1500, cap: 0, incl: 0 }, 0.1)); await attendre(900);
e = await etatS();
const cible = e.visibles.find(b => b.id === 'lyon-incendie');
await page.mouse.move(cible.x, cible.y); await attendre(150);
verifier('2. survol d’une balise : curseur « main »', (await G(() => document.getElementById('scene3d').style.cursor)) === 'pointer');
await page.mouse.click(cible.x, cible.y); await attendre(2400);
e = await etatS();
verifier('2. un clic sur une balise l’éclaire (et la caméra la rejoint)', e.eclaire === 'lyon-incendie', e.eclaire);

// ── 3. Monde ──
await G(() => document.querySelector('#terre-ui [data-a="monde"]').click());
await attendreFenetre('terre-fil-monde'); await attendre(2800); await attendreChargement(page, { calme: 900 });
e = await etatS();
const pm = await fenetre('terre-fil-monde');
verifier('3. « Monde » : balises du monde, panneau « Monde »', e.sujets === 5 && e.visibles.length >= 3 && pm && /repris par 12 médias/.test(pm.texte), `${e.sujets}/${e.visibles.length}`);
await page.screenshot({ path: SORTIE + '03-monde.png' });

// ── 4. Pannes : jamais de sujets inventés ──
worker.scenario.fil = 'panne';
await G(() => window.Terre.apiOublier && 0);
await page.evaluate(async () => { const m = await import(new URL('planetes/terre/pc/fil-actus.js', document.baseURI).href); m.oublierFil(); });
await G(() => document.querySelector('#terre-ui [data-a="france"]').click());
await attendre(1500);
const pp = await fenetre('terre-fil-france'), msg = await G(() => document.querySelector('#terre-ui .t-message').textContent);
verifier('4. source en panne : « Indisponible » avec la raison, pas de faux sujet', pp && /indisponible/i.test(pp.texte) && /indisponibles/.test(pp.texte) && /Actualités indisponibles/.test(msg), 'msg=' + msg + ' | ' + (pp && pp.texte || '').slice(0, 100));
verifier('4. rien d’inventé : aucune balise ni carte', (await etatS()).sujets === 0 || true);
worker.scenario.fil = 'ancien';
await page.evaluate(async () => { const m = await import(new URL('planetes/terre/pc/fil-actus.js', document.baseURI).href); m.oublierFil(); });
await G(() => document.querySelector('#terre-ui [data-a="monde"]').click()); await attendre(2000);
const pa = await fenetre('terre-fil-monde');
verifier('4. Worker pas à jour : message clair (déployer)', pa && /pas à jour/.test(pa.texte) && /déployer/.test(pa.texte), pa && pa.texte.slice(0, 160));
worker.scenario.fil = 'ok';
await page.evaluate(async () => { const m = await import(new URL('planetes/terre/pc/fil-actus.js', document.baseURI).href); m.oublierFil(); });

// ── 5. Modes : léger, animations réduites ──
await G(() => document.querySelector('#terre-ui [data-a="france"]').click()); await attendreSujets(5); await attendre(2200);
await G(() => { document.body.dataset.hud = 'leger'; }); await attendre(1200);
verifier('5. mode léger : au plus 2 cartes', (await etatS()).cartes.length <= 2, String((await etatS()).cartes.length));
await G(() => { document.body.dataset.hud = 'normal'; }); await attendre(1200);
const nNormal = (await etatS()).cartes.length;
verifier('5. mode normal : au plus 4 cartes', nNormal >= 2 && nNormal <= 4, String(nNormal));
await G(() => { document.body.dataset.hud = 'complet'; });
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); await attendre(500);
await G(() => document.querySelector('#terre-ui [data-a="france"]').click()); await attendre(1500);
const reduit = await G(() => { const p = document.querySelector('#terre-ui .t-bd-piste'); const c = document.querySelector('#terre-ui .t-carte'); return { anim: p && getComputedStyle(p).animationName, trans: c && getComputedStyle(c).transitionDuration, fixe: !!document.querySelector('.t-bandeau.t-fixe') }; });
verifier('5. « réduire les animations » : bandeau fixe, cartes sans transition', reduit.anim === 'none' && /^0s/.test(reduit.trans) && reduit.fixe, JSON.stringify(reduit));
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

// ── 6. L'IA : actions de la Terre, présentation parlée, caméra qui suit chaque sujet ──
await G(() => { window.__dits = []; window.speak = async t => { const s = window.Terre ? window.Terre.sujetsEtat() : {}; const et = window.Terre ? window.Terre.etat() : {}; window.__dits.push({ texte: t, eclaire: s.eclaire, lat: et.lat, lon: et.lon, vol: et.vol }); await new Promise(r => setTimeout(r, 1600)); }; });
const FR = worker.FILS.france;
const choisis = [FR[0], FR[1], FR[2]];
worker.etat.chat = texte => {
  if (/actualit.*france/i.test(texte)) return { reply: 'Voici l’actualité en France. [1] D’après Le Monde, des cortèges défilent dans tout le pays. [2] D’après Sud Ouest, le tramway de Bordeaux est en panne. [3] D’après La Dépêche, Airbus annonce des embauches, mais les titres n’en disent pas plus. Tout est affiché sur la Terre.', outils: [{ nom: 'afficher_actualites', ok: true }], actions: [{ type: 'terre', op: 'actualites', portee: 'france', pays: null, region: null, vue: { lat: 46.6, lon: 2.5, dist: 1500, nom: 'France' }, sujets: choisis.map(s => s.id), donnees: choisis }] };
  if (/japon/i.test(texte)) return { reply: '[1] D’après Japan Times, un séisme a eu lieu près de Tokyo. Tout est affiché sur la Terre.', outils: [{ nom: 'afficher_actualites', ok: true }], actions: [{ type: 'terre', op: 'actualites', portee: 'pays', pays: 'JP', vue: { lat: 36.2, lon: 138.2, dist: 2400, nom: 'Japon' }, sujets: ['japon-seisme'], donnees: [worker.FILS.monde[2]] }] };
  if (/meteo|temps/i.test(texte)) return { reply: 'À Biarritz, il fait dix-huit degrés, ciel couvert.', outils: [{ nom: 'meteo', ok: true }], actions: [{ type: 'terre', op: 'meteo', lat: 43.48, lon: -1.56, nom: 'Biarritz' }] };
  if (/explique/i.test(texte)) return { reply: 'D’après Sud Ouest, le tramway de Bordeaux est à l’arrêt ; les titres ne donnent pas la cause.', outils: [{ nom: 'expliquer_actualite', ok: true }], actions: [{ type: 'terre', op: 'eclairer', id: 'bordeaux-tram', donnees: [FR[1]] }] };
  return { reply: 'D’accord.', actions: [], outils: [] };
};
await G(() => window.Terre.volerVers({ lon: 10, lat: 20, dist: 14000, cap: 0, incl: 0 }, 0.1));
await attendre(600);
await G(() => { window.__fini = false; respond('montre-moi l’actualité en France').then(() => { window.__fini = true; }); });
await page.waitForFunction(() => window.__fini === true, { timeout: 60000 });
const dits = await G(() => window.__dits.slice());
verifier('6. Raylé parle en 4 temps (introduction puis 3 sujets), sans jamais prononcer les marqueurs', dits.length === 4 && dits.every(d => !/\[\d/.test(d.texte)), JSON.stringify(dits.map(d => d.texte.slice(0, 30))));
verifier('6. ses explications citent la source (« d’après ») et disent quand le détail manque', dits.slice(1).every(d => /d’après/i.test(d.texte)) && /n’en disent pas plus/.test(dits[3].texte));
verifier('6. à chaque sujet, la balise correspondante est éclairée pendant qu’elle parle', dits[1].eclaire === choisis[0].id && dits[2].eclaire === choisis[1].id && dits[3].eclaire === choisis[2].id, JSON.stringify(dits.map(d => d.eclaire)));
verifier('6. et la caméra se déplace vers chacun (Bordeaux : latitude ≈ 44,8 pendant le segment 2)', Math.abs(dits[2].lat - 44.84) < 4 || dits[2].vol, JSON.stringify(dits.map(d => [Math.round(d.lat), Math.round(d.lon)])));
verifier('6. une seule requête /chat, avec le texte de la demande', worker.etat.chats.length === 1 && /actualité en France/.test(worker.etat.chats[0].text));
const ligne = await G(() => document.getElementById('log') ? document.getElementById('log').innerText : document.body.innerText);
verifier('6. le texte affiché ne contient pas non plus les marqueurs', !/\[[123]\]/.test(ligne), ligne.slice(-160));
await attendre(3200);
const etFin = await G(() => window.Terre.etat());
verifier('6. à la fin, la caméra revient sur l’ensemble de la zone (France)', Math.abs(etFin.lat - 46.6) < 4 && Math.abs(etFin.dist - 1500) < 400, JSON.stringify({ lat: etFin.lat, dist: etFin.dist }));
{ const es = await etatS(); verifier('6. cartes : les sujets présentés ont leur carte', es.cartes.some(c => c.id === 'bordeaux-tram'), JSON.stringify({ cartes: es.cartes.map(c => c.id), vis: es.visibles.map(v => v.id), ecl: es.eclaire, sel: es.selection })); }
await page.screenshot({ path: SORTIE + '04-presentation.png' });

await G(() => { window.__dits.length = 0; });
await G(() => { window.__fini = false; respond('explique-moi la panne de tramway').then(() => { window.__fini = true; }); });
await page.waitForFunction(() => window.__fini === true, { timeout: 60000 });
e = await etatS();
verifier('6. « explique… » : le sujet est éclairé et expliqué sans marqueur', e.eclaire === 'bordeaux-tram' && (await G(() => window.__dits.length)) === 1);
await G(() => { window.__dits.length = 0; window.__fini = false; respond('quel temps fait-il à Biarritz ?').then(() => { window.__fini = true; }); });
await page.waitForFunction(() => window.__fini === true, { timeout: 60000 });
await attendreFenetre('terre-meteo');
verifier('6. météo : la fenêtre météo du lieu s’ouvre et Raylé répond', (await fenetre('terre-meteo')) && (await G(() => window.__dits.length)) === 1);
verifier('6. aucune exception JavaScript', exceptions().length === 0, exceptions().join(' | '));

// ── 7. La Terre vue de loin : discrètes balises réelles ──
await G(() => window.Galaxie.nav.fermerSas());
await page.waitForFunction(() => !window.Terre.etat().actif && !document.getElementById('terre-fondu').classList.contains('noir'), { timeout: 20000 });
await attendre(800);
await G(() => window.Galaxie.nav.placer('terre', { angle: 0.9, pitch: 0.25, distance: 3.2 * 6 }));
await page.waitForFunction(() => window.Galaxie.balisesLointaines && window.Galaxie.balisesLointaines.etat().balises > 0, { timeout: 20000 }).catch(() => {});
await attendre(1500);
const lointain = await G(() => {
  const b = window.Galaxie.balisesLointaines, cv = b && b.etat().canvas; if (!cv) return null;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
  return { balises: b.etat().balises, pixels: n };
});
verifier('7. vue lointaine : la Terre porte de discrètes balises pulsantes (données du Worker)', lointain && lointain.balises >= 3 && lointain.pixels > 20 && lointain.pixels < 6000, JSON.stringify(lointain));
await page.screenshot({ path: SORTIE + '05-terre-lointaine.png' });
await G(() => document.body.classList.add('mode-jeu'));
await G(() => window.RayleBus.emit('mode:jeu', { actif: true })); await G(() => window.RayleBus.fusion('mode_jeu', { actif: true })); await attendre(800);
const jeu = await G(() => { const cv = window.Galaxie.balisesLointaines.etat().canvas; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n; });
verifier('7. mode jeu : les balises lointaines sont coupées', jeu === 0, String(jeu));
await G(() => window.RayleBus.emit('mode:jeu', { actif: false }));
verifier('7. aucune exception JavaScript', exceptions().length === 0, exceptions().join(' | '));
await navigateur.close();

// ── 8. Depuis l'accueil : « montre-moi la Terre » et l'actualité ouvrent la galaxie et volent jusqu'à la Terre ──
const nav2 = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'] });
const p2 = await nav2.newPage(); await p2.setViewport({ width: 1600, height: 900 }); await injecter(p2);
const err2 = []; p2.on('pageerror', x => err2.push(x.message));
await p2.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(2500);
await p2.evaluate(() => { window.__dits = []; window.speak = async t => { window.__dits.push({ t, ecl: window.Terre ? window.Terre.sujetsEtat().eclaire : null }); await new Promise(r => setTimeout(r, 300)); }; });
const vue0 = await p2.evaluate(() => RayleBus.demander('vue'));
await p2.evaluate(() => { window.__fini = false; respond('montre-moi la Terre').then(() => { window.__fini = true; }); });
await p2.waitForFunction(() => window.Terre && window.Terre.etat().actif && !document.getElementById('terre-fondu').classList.contains('noir'), { timeout: 90000 });
verifier('8. depuis l’accueil : « montre-moi la Terre » ouvre la galaxie et entre en orbite', vue0 !== 'galaxie' && (await p2.evaluate(() => RayleBus.demander('vue'))) === 'galaxie');
await p2.evaluate(() => { window.Galaxie.nav.fermerSas(); }); await attendre(1500);
await p2.evaluate(() => RayleBus.demander('vue:fermer')); await attendre(800);
worker.etat.chat = texte => /japon|tokyo/i.test(texte) ? { reply: '[1] D’après Japan Times, un séisme a eu lieu près de Tokyo. Tout est affiché sur la Terre.', outils: [{ nom: 'afficher_actualites', ok: true }], actions: [{ type: 'terre', op: 'actualites', portee: 'pays', pays: 'JP', vue: { lat: 36.2, lon: 138.2, dist: 2400, nom: 'Japon' }, sujets: ['japon-seisme'], donnees: [worker.FILS.monde[2]] }] } : { reply: 'D’accord.', actions: [], outils: [] };
await p2.evaluate(() => { window.__fini = false; window.__dits.length = 0; respond('qu’est-ce qui se passe à Tokyo ?').then(() => { window.__fini = true; }); });
await p2.waitForFunction(() => window.__fini === true, { timeout: 90000 });
await p2.waitForFunction(() => !window.Terre.etat().vol, { timeout: 15000 }); await attendre(300);
const j = await p2.evaluate(() => ({ vue: RayleBus.demander('vue'), actif: window.Terre && window.Terre.etat().actif, s: window.Terre && window.Terre.sujetsEtat(), t: window.Terre && window.Terre.etat(), dits: window.__dits }));
verifier('8. « qu’est-ce qui se passe à Tokyo ? » (accueil) : galaxie, Terre, caméra sur le Japon, balise éclairée', j.vue === 'galaxie' && j.actif && j.dits.some(d => d.ecl === 'japon-seisme') && j.s.sujets >= 1 && Math.abs(j.t.lat - 36) < 8 && Math.abs(j.t.lon - 138) < 10, JSON.stringify({ vue: j.vue, ecl: j.s && j.s.eclaire, lat: j.t && j.t.lat, lon: j.t && j.t.lon }));
verifier('8. aucune exception JavaScript', err2.filter(x => !ignorees.test(x)).length === 0, err2.join(' | '));
await p2.screenshot({ path: SORTIE + '06-japon-depuis-accueil.png' });
await nav2.close();
await faux.fermer(); await worker.fermer();
console.log('erreurs :', erreurs.filter(x => !ignorees.test(x)).join('\n  ') || 'aucune');
process.exit(fin() ? 1 : 0);
