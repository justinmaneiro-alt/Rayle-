// Médias dans les réponses (images + vidéos en complément) avec un FAUX Worker : quand (recherche / actualité seulement), combien (modes, réglages ⚙), après quoi (texte d'abord),
// quoi (hôtes autorisés, licence et source visibles), vidéos au clic seulement, vignettes des actualités, galerie « de cette actualité », commandes vocales, honnêteté.
// Lancer :  node tests-navigateur/accueil-medias-test.mjs      (serveur local sur le port 8000 : node serveur.mjs ; CAPTURES=<dossier> pour enregistrer des captures)
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import http from 'node:http';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CAPTURES = process.env.CAPTURES || '';
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };

/* ───── faux Worker : /chat, /images, /videos, /actualites/fil ───── */
const req = { images: [], videos: [], chat: 0 };
const delais = { images: 0, videos: 0, chat: 0 };
let panne = false;
const mini = (n, nom) => 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/' + nom + n + '.jpg/480px-' + nom + n + '.jpg';
const image = (n, nom, o = {}) => ({ titre: nom + ' ' + n, auteur: 'Auteur ' + n, licence: 'CC BY-SA 4.0', licence_url: 'https://creativecommons.org/licenses/by-sa/4.0', source_url: 'https://commons.wikimedia.org/wiki/File:' + nom + n + '.jpg', miniature: mini(n, nom), grande: mini(n, nom).replace('480px', '960px'), largeur: 480, hauteur: 320, origine: n === 1 ? 'wikipedia' : 'commons', ...o });
const IMAGES = {
  'tour Eiffel': { sujet: { titre: 'Tour Eiffel', langue: 'fr', url: 'https://fr.wikipedia.org/wiki/Tour_Eiffel', description: 'monument de Paris' }, images: [1, 2, 3, 4].map(n => image(n, 'Eiffel')) },
  'Bordeaux': { sujet: { titre: 'Bordeaux', langue: 'fr', url: 'https://fr.wikipedia.org/wiki/Bordeaux', description: 'commune française' }, images: [1, 2, 3, 4].map(n => image(n, 'Bordeaux')) },
  'Titanic': { sujet: { titre: 'Titanic', langue: 'fr', url: 'https://fr.wikipedia.org/wiki/Titanic', description: 'paquebot' }, images: [1, 2].map(n => image(n, 'Titanic')) },
  'Hostile': { sujet: { titre: 'Hostile', langue: 'fr', url: 'https://fr.wikipedia.org/wiki/Hostile', description: '' }, images: [image(1, 'Ok'), image(2, 'Evil', { miniature: 'https://evil.example.com/a.png' }), image(3, 'NC', { licence: 'CC BY-NC 4.0' })] }
};
const ytVideo = (id, titre, chaine) => ({ plateforme: 'youtube', id, titre, auteur: chaine, licence: 'Lecteur officiel YouTube · vidéo publiée par le média', date: new Date().toISOString(), source_url: 'https://www.youtube.com/watch?v=' + id, embed: 'https://www.youtube-nocookie.com/embed/' + id, miniature: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg', origine: 'youtube' });
const VIDEOS = {
  'Bordeaux|actu': [ytVideo('abcDEFghi_1', 'Bordeaux : le tramway à nouveau en service', 'franceinfo'), ytVideo('abcDEFghi_2', 'Bordeaux : la crue de la Garonne', 'BFMTV')],
  'tour Eiffel|savoir': [{ plateforme: 'commons', id: '5', titre: 'Timelapse Tour Eiffel', auteur: 'Un auteur', licence: 'CC BY-SA 2.0', licence_url: 'https://creativecommons.org/licenses/by-sa/2.0', source_url: 'https://commons.wikimedia.org/wiki/File:Timelapse.webm', fichier: 'https://upload.wikimedia.org/wikipedia/commons/a/Timelapse.webm', type_mime: 'video/webm', miniature: 'https://upload.wikimedia.org/thumb/Timelapse.jpg', duree: 30, origine: 'commons' },
    { plateforme: 'archive', id: 'eiffel_film', titre: 'Le Mystère de la Tour Eiffel', auteur: 'Archives', licence: 'Domaine public', licence_url: 'https://creativecommons.org/publicdomain/mark/1.0/', source_url: 'https://archive.org/details/eiffel_film', embed: 'https://archive.org/embed/eiffel_film', miniature: 'https://archive.org/services/img/eiffel_film', origine: 'archive' }],
  'Mauvais|savoir': [ytVideo('abcDEFghi_3', 'Vidéo piégée', 'Pirate'), { ...ytVideo('abcDEFghi_4', 'Autre', 'X'), embed: 'https://evil.example.com/embed/abcDEFghi_4' }]
};
const sujetFil = (id, titre, cat, imp, sources) => ({ id, titre, categorie: cat, importance: imp, score: imp * 10, date: new Date(Date.now() - 900000).toISOString(), lieu: null, regions: [], resume: '', image: (sources.find(s => s.image) || {}).image || null, sources: sources.map(s => ({ nom: s.nom, url: 'https://' + s.nom.toLowerCase().replace(/\W/g, '') + '.test/' + id, date: new Date(Date.now() - 900000).toISOString(), titre: s.titre || titre, langue: 'fr', image: s.image || null })) });
const FIL = [
  sujetFil('incendie-lyon', 'Lyon : un incendie ravage un entrepôt', 'justice', 4, [{ nom: 'Média A', image: 'https://img.media-a.test/lyon.jpg', titre: 'Un incendie ravage un entrepôt à Lyon' }, { nom: 'Média B', image: 'https://img.media-b.test/lyon2.jpg' }, { nom: 'Média C' }]),
  sujetFil('reforme', 'Réforme des retraites : le texte présenté', 'politique', 3, [{ nom: 'Média A', image: 'https://img.media-a.test/reforme.jpg' }, { nom: 'Média D' }]),
  sujetFil('sans-image', 'Un sujet sans aucune image dans les flux', 'societe', 2, [{ nom: 'Média E' }, { nom: 'Média F' }]),
  sujetFil('casse', 'Un sujet dont l’image est introuvable', 'sport', 2, [{ nom: 'Média G', image: 'https://img.media-g.test/introuvable.jpg' }, { nom: 'Média H' }])
];
const srv = http.createServer((rq, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Content-Type': 'application/json' };
  if (rq.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const u = new URL(rq.url, 'http://x');
  const fin = (code, o, ms = 0) => setTimeout(() => { res.writeHead(code, cors); res.end(JSON.stringify(o)); }, ms);
  if (u.pathname === '/images') {
    const q = u.searchParams.get('q'); req.images.push({ q, n: u.searchParams.get('n') });
    if (panne) return fin(502, { error: 'les sources d\'images ne répondent pas' });
    return fin(200, { q, sources: ['Wikipédia'], cache: 'non', ...(IMAGES[q] || { sujet: null, images: [], raison: 'aucun article encyclopédique ne correspond à ce sujet' }) }, delais.images);
  }
  if (u.pathname === '/videos') {
    const q = u.searchParams.get('q'), type = u.searchParams.get('type'); req.videos.push({ q, type, n: u.searchParams.get('n') });
    if (panne) return fin(502, { error: 'les sources de vidéos ne répondent pas' });
    const liste = VIDEOS[q + '|' + type] || [];
    return fin(200, { q, type, videos: liste.slice(0, Number(u.searchParams.get('n')) || 3), sources: ['test'], raison: liste.length ? undefined : 'aucune vidéo fiable ne correspond à ce sujet' }, delais.videos);
  }
  if (u.pathname === '/actualites/fil') return fin(200, { portee: u.searchParams.get('portee'), pays: null, sujets: FIL, genere: new Date().toISOString(), sources: { ok: ['Média A'], indisponibles: [] } });
  if (u.pathname === '/chat') { req.chat++; return fin(200, { reply: 'Voici ma réponse de test, Justin.', engine: 'mock', actions: [], outils: [] }, delais.chat); }
  const rep = { '/ping': { ok: true, version: 'mock', adresse: 'tu', voix: 'Test', feminin: true, vitesse: -8, ia: ['Mock'], d1: true, mode: 'normal' }, '/securite/etat': { appareil: null, appaire: false, configure: false, deverrouille: false, expire_dans: 0, bloque_dans: 0, defi_dans: 0 }, '/evenements': { alertes: [] }, '/reglages': { mode: 'normal' }, '/memoire': { notes: [] }, '/souvenirs': { items: [] } }[u.pathname];
  res.writeHead(rep ? 200 : 404, cors); res.end(JSON.stringify(rep || { error: 'route inconnue' }));
});
await new Promise(r => srv.listen(8789, '127.0.0.1', r));
const png = (couleur) => { const p = new PNG({ width: 320, height: 200 }); for (let y = 0; y < 200; y++) for (let x = 0; x < 320; x++) { const i = (y * 320 + x) * 4; p.data[i] = couleur[0] * (0.5 + x / 640); p.data[i + 1] = couleur[1] * (0.5 + y / 400); p.data[i + 2] = couleur[2]; p.data[i + 3] = 255; } return PNG.sync.write(p); };

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'] });
const erreurs = [], chargees = [], lecteurs = [];
async function page(opts = {}) {
  const p = await b.newPage(); await p.setViewport(opts.viewport || { width: 1600, height: 900 });
  p.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
  p.on('console', m => { if (/\[médias\]/.test(m.text())) console.log('   console page :', m.text().slice(0, 300)); });
  p.on('console', m => { if (m.type() === 'error' && !/calendar|faireconomy|ERR_FAILED|404|502|evil\.example|introuvable/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });
  await p.setRequestInterception(true);
  p.on('request', r => {
    const u = r.url();
    if (/^https:\/\/(?:www\.youtube-nocookie\.com|archive\.org\/embed)\//.test(u)) { lecteurs.push(u); return r.respond({ status: 200, contentType: 'text/html', body: '<html><body style="margin:0;background:#112"><p style="color:#fff">lecteur de test</p></body></html>' }); }
    if (/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/a\/Timelapse\.webm/.test(u)) { lecteurs.push(u); return r.respond({ status: 200, contentType: 'video/webm', body: Buffer.alloc(10) }); }
    if (/^https:\/\/img\.media-g\.test\//.test(u)) { chargees.push(u); return r.respond({ status: 404, body: 'introuvable' }); }
    if (/^https:\/\/(?:upload|thumb)\.wikimedia\.org\/|^https:\/\/i\.ytimg\.com\/|^https:\/\/archive\.org\/services\/img\/|^https:\/\/img\.media-[a-f]\.test\//.test(u)) { chargees.push(u); return r.respond({ status: 200, contentType: 'image/png', body: png([200, 150, 120]) }); }
    if (/evil\.example\.com/.test(u)) { chargees.push(u); return r.respond({ status: 200, contentType: 'image/png', body: png([255, 0, 0]) }); }
    r.continue();
  });
  await p.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_entite_qualite', '3'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', 'http://127.0.0.1:8789'); localStorage.setItem('rayle_worker_token', 'essai'); });
  await p.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(opts.attente || 3500);
  await p.evaluate(m => { Panneaux.fermerTout(); Entite.verrou(false); Entite.verrou = () => {}; window.__dit = []; speak = async t => { window.__dit.push(String(t)); }; window.__hudFixe = m; document.body.dataset.hud = m; new MutationObserver(() => { if (window.__hudFixe && document.body.dataset.hud !== window.__hudFixe) document.body.dataset.hud = window.__hudFixe; }).observe(document.body, { attributes: true, attributeFilter: ['data-hud'] }); window.__t = {}; new MutationObserver(() => { const l = [...document.querySelectorAll('#log .line.ray')].some(x => /Voici ma réponse/.test(x.textContent)); if (l && !window.__t.texte) window.__t.texte = performance.now(); if (document.querySelector('.pn[data-type="holo-medias"]') && !window.__t.medias) window.__t.medias = performance.now(); }).observe(document.body, { childList: true, subtree: true }); }, opts.mode || 'normal');
  return p;
}
const remise = () => { req.images.length = 0; req.videos.length = 0; req.chat = 0; chargees.length = 0; lecteurs.length = 0; delais.images = delais.videos = delais.chat = 0; panne = false; };
const demander = async (p, q, ms = 1800, enPanne = false) => { remise(); panne = enPanne; await p.evaluate(() => { window.__dit = []; window.__t = {}; Panneaux.fermerTout(); }); await p.evaluate(t => { addLine('user', t); window.__fin = null; respond(t).then(() => { window.__fin = performance.now(); }); window.__debut = performance.now(); }, q); await attendre(ms); };
const etat = p => p.evaluate(() => MediasHolo.etat());
const cmd = async (p, t, ms = 700) => { await p.evaluate(() => { window.__dit = []; }); const r = await p.evaluate(t => command(t), t); await attendre(ms); return { r, dit: await p.evaluate(() => window.__dit.slice()) }; };
const capture = async (p, nom) => { if (!CAPTURES) return; fs.mkdirSync(CAPTURES, { recursive: true }); await p.screenshot({ path: CAPTURES + '/' + nom + '.png' }); };
const reglage = (p, cle, val) => p.evaluate((k, x) => { localStorage.setItem(k, x); const m = document.getElementById('kMedias'); }, cle, val);

let p = await page();
// ══ 1. QUESTION DE RECHERCHE : le texte d'abord, les médias ensuite, en complément ══
delais.images = 1500;
remise(); delais.images = 1500; delais.videos = 400;
await p.evaluate(() => { window.__dit = []; window.__t = {}; Panneaux.fermerTout(); });
await p.evaluate(() => { addLine('user', 'parle-moi de la tour Eiffel'); window.__debut = performance.now(); respond('parle-moi de la tour Eiffel').then(() => { window.__fin = performance.now(); }); });
await attendre(900);
let e = await etat(p), parole = await p.evaluate(() => window.__dit.slice());
v('recherche : la réponse écrite et parlée est déjà là pendant que les images chargent (rien ne bloque)', parole.length === 1 && /Voici ma réponse de test/.test(parole[0]) && !e.ouvert, JSON.stringify([parole, e]));
await attendre(1800); e = await etat(p);
v('recherche : images (3 en mode normal) et 1 vidéo arrivent ensuite, dans une petite fenêtre', e.ouvert && e.images === 3 && e.videos === 1, JSON.stringify(e));
const ordre = await p.evaluate(() => window.__t);
v('recherche : le TEXTE est affiché AVANT les médias', ordre.texte && ordre.medias && ordre.texte < ordre.medias, JSON.stringify(ordre));
v('recherche : Worker interrogé une seule fois par source, avec le bon sujet et le bon nombre', req.images.length === 1 && req.images[0].q === 'tour Eiffel' && req.images[0].n === '3' && req.videos.length === 1 && req.videos[0].q === 'tour Eiffel' && req.videos[0].type === 'savoir' && req.videos[0].n === '1', JSON.stringify([req.images, req.videos]));
const taille = await p.evaluate(() => { const r = document.querySelector('.pn[data-type="holo-medias"]').getBoundingClientRect(); return { l: Math.round(r.width), h: Math.round(r.height), vh: innerHeight, iw: innerWidth, d: r.right <= innerWidth + 1 }; });
v('recherche : fenêtre petite (≤ 340 px de large, moins de la moitié de la hauteur de l’écran)', taille.l <= 342 && taille.h < taille.vh * 0.5 && taille.d, JSON.stringify(taille));
const leg = await p.evaluate(() => document.querySelector('.med-legende').textContent.replace(/\s+/g, ' '));
v('légende d’image : titre, auteur, « Source : … », « Licence : … » toujours visibles', /Eiffel 1/.test(leg) && /Auteur 1/.test(leg) && /Source : /.test(leg) && /Licence : CC BY-SA 4\.0/.test(leg), leg);
v('liens de la légende : nouvel onglet, sans référent', await p.evaluate(() => [...document.querySelectorAll('.pn[data-type="holo-medias"] a')].every(a => a.target === '_blank' && /noopener/.test(a.rel) && /^https:/.test(a.href))));
const vid = await p.evaluate(() => document.querySelector('.med-video figcaption').textContent.replace(/\s+/g, ' '));
v('légende de vidéo : titre, source, auteur, licence, lien', /Timelapse Tour Eiffel/.test(vid) && /Source : Wikimedia Commons/.test(vid) && /Licence : CC BY-SA 2\.0/.test(vid) && /Ouvrir sur la source/.test(vid), vid);
v('images chargées depuis leur source (Wikimedia), jamais ailleurs', chargees.length > 0 && chargees.every(u => /wikimedia\.org|ytimg\.com|archive\.org/.test(u)), chargees.slice(0, 3).join(' '));
await capture(p, '1-recherche-complement');
// vidéos : AUCUN lecteur avant le clic
e = await etat(p);
v('vidéo : aucun lecteur (iframe / video) tant qu’on n’a pas cliqué, aucune requête de lecteur', e.iframes === 0 && lecteurs.length === 0, JSON.stringify([e.iframes, lecteurs]));
await p.click('.med-video .med-play'); await attendre(900); e = await etat(p);
v('vidéo : le clic crée le lecteur (Wikimedia, fichier libre) — jamais avant', e.iframes === 1 && lecteurs.some(u => /upload\.wikimedia\.org/.test(u)), JSON.stringify([e.iframes, lecteurs]));
// repli
await p.click('.med-plier'); await attendre(300);
const replie = await p.evaluate(() => ({ visible: getComputedStyle(document.querySelector('.med-corps')).display !== 'none', aria: document.querySelector('.med-plier').getAttribute('aria-expanded'), h: Math.round(document.querySelector('.pn[data-type="holo-medias"]').getBoundingClientRect().height) }));
v('repli : un clic replie la fenêtre (corps caché, titre gardé)', !replie.visible && replie.aria === 'false' && replie.h < 90, JSON.stringify(replie));
await p.click('.med-plier'); await attendre(300);
v('repli : un second clic la déplie', await p.evaluate(() => getComputedStyle(document.querySelector('.med-corps')).display !== 'none' && document.querySelector('.med-plier').getAttribute('aria-expanded') === 'true'));
// agrandissement
await p.click('.med-thumb:nth-child(2)'); await attendre(500);
const lb = await p.evaluate(() => ({ ouvert: !!document.querySelector('.med-lb'), titre: document.querySelector('.med-lb h2')?.textContent, leg: document.querySelector('.med-lb-leg')?.textContent.replace(/\s+/g, ' ') }));
v('agrandissement : un clic sur la vignette ouvre l’image en grand avec sa légende', lb.ouvert && /Eiffel 2/.test(lb.titre) && /Licence : /.test(lb.leg), JSON.stringify(lb));
await capture(p, '2-image-agrandie');
await p.keyboard.press('Escape'); await attendre(300);
v('agrandissement : Échap referme', await p.evaluate(() => !document.querySelector('.med-lb')));

// vidéo YouTube : lecteur nocookie, sandbox, au clic seulement (actualité)
await p.evaluate(() => Panneaux.fermerTout());
await demander(p, 'que se passe-t-il à Bordeaux', 2600);
e = await etat(p);
v('actualité : « que se passe-t-il à Bordeaux » → images ET vidéos de chaînes officielles', e.ouvert && e.images === 3 && e.videos === 1 && req.videos[0].type === 'actu' && req.videos[0].q === 'Bordeaux', JSON.stringify([e, req.videos]));
v('actualité : la miniature vient de YouTube, aucun lecteur avant le clic', e.iframes === 0 && lecteurs.length === 0 && chargees.some(u => /i\.ytimg\.com/.test(u)));
await capture(p, '3-actualite-video');
await p.click('.med-video .med-play'); await attendre(900);
const lec = await p.evaluate(() => { const f = document.querySelector('.pn[data-type="holo-medias"] iframe'); return f ? { src: f.src, sandbox: f.getAttribute('sandbox'), rp: f.referrerPolicy } : null; });
v('YouTube : lecteur « nocookie » créé au clic, sandbox, sans référent complet', lec && /^https:\/\/www\.youtube-nocookie\.com\/embed\/abcDEFghi_1\?autoplay=1/.test(lec.src) && /allow-scripts/.test(lec.sandbox) && !/allow-top-navigation/.test(lec.sandbox) && lec.rp === 'strict-origin-when-cross-origin', JSON.stringify(lec));
v('YouTube : la lecture (autoplay) n’est demandée qu’après le clic', lecteurs.length === 1 && /autoplay=1/.test(lecteurs[0]));

// ══ 2. JAMAIS DE MÉDIA pour les commandes et les conversations simples ══
const simples = ['bonjour', 'merci', 'comment tu vas', 'quelle heure est-il', 'c\'est quoi le RSI', 'parle-moi de la météo', 'parle-moi de mon voisin', 'qui est le président de la France', 'active le mode multi-écrans', 'identifie les écrans', 'ferme tout', 'tu m\'entends ?', 'les actualités du sport', 'coupure'];
let cumul = { images: 0, videos: 0, ouvert: false };
for (const t of simples) { await demander(p, t, 900); const x = await etat(p); cumul.images += req.images.length; cumul.videos += req.videos.length; if (x.ouvert || await p.evaluate(() => !!document.querySelector('.pn[data-type="holo-images"], .pn[data-type="holo-medias"]'))) { cumul.ouvert = true; console.log('   média inattendu pour : ' + t); } }
v('AUCUN média (ni requête, ni fenêtre) pour ' + simples.length + ' commandes, conversations simples et sujets internes', cumul.images === 0 && cumul.videos === 0 && !cumul.ouvert, JSON.stringify(cumul));

// ══ 3. LA RÉPONSE TEXTE NE DÉPEND PAS DES MÉDIAS ══
delais.images = 4000; delais.videos = 4000;
await demander(p, 'raconte-moi l\'histoire du Titanic', 1500);
const dureeReponse = await p.evaluate(() => ({ fin: window.__fin && Math.round(window.__fin - window.__debut), dit: window.__dit.slice() }));
v('sources de médias très lentes (4 s) : la réponse est donnée en moins de 1,5 s', dureeReponse.fin !== null && dureeReponse.fin < 1500 && dureeReponse.dit.length === 1, JSON.stringify(dureeReponse));
await attendre(3500);
v('… et les médias arrivent plus tard, en complément', (await etat(p)).ouvert);
await demander(p, 'parle-moi de la tour Eiffel', 1800, true);
parole = await p.evaluate(() => window.__dit.slice());
v('Worker de médias en panne : la réponse passe, aucune fenêtre d’erreur, aucune exception', parole.length === 1 && !(await etat(p)).ouvert && !(await p.evaluate(() => !!document.querySelector('.pn[data-type="holo-images"]'))) && erreurs.length === 0, JSON.stringify([parole, erreurs]));
remise();
await demander(p, 'parle-moi de Sujetinconnu', 1800);
v('rien de fiable trouvé : aucune fenêtre, aucun faux contenu (la réponse écrite suffit)', !(await etat(p)).ouvert && req.images.length === 1);

// ══ 4. HONNÊTETÉ : adresses étrangères, licences non libres, lecteurs piégés ══
remise();
await demander(p, 'c\'est quoi Hostile', 2000);
e = await etat(p);
v('image sur un hôte étranger ou sous licence non libre : écartée (1 seule image gardée)', e.ouvert && e.images === 1 && !chargees.some(u => /evil\.example/.test(u)), JSON.stringify([e, chargees.filter(u => /evil/.test(u))]));
remise(); VIDEOS['Mauvais|actu'] = VIDEOS['Mauvais|savoir'];
const rv = await p.evaluate(() => MediasHolo.videoDe('Mauvais'));
const nVid = await p.evaluate(() => [...document.querySelectorAll('.med-video figcaption')].map(f => f.textContent));
v('vidéo avec un lecteur sur un autre site : écartée ; la vidéo officielle valide est la seule gardée', nVid.length === 1 && /Vidéo piégée/.test(nVid[0]) && !nVid.some(t => /Autre/.test(t)) && !lecteurs.some(u => /evil/.test(u)), JSON.stringify(nVid));
await p.evaluate(() => Panneaux.fermerTout());

// ══ 5. RÉGLAGES ⚙ ══
await p.evaluate(() => Panneaux.fermerTout());
await p.click('#gear'); await attendre(400);
v('⚙ : cases « images » et « vidéos » présentes et cochées', await p.evaluate(() => document.getElementById('kMedias')?.checked === true && document.getElementById('kVideos')?.checked === true));
v('⚙ : une ligne dit ce que fait le mode actuel (normal : jusqu’à 3 images et 1 vidéo)', await p.evaluate(() => /Mode actuel de l’accueil : Normal.*3 images.*1 vidéo/.test(document.getElementById('infoMedias').textContent)), await p.evaluate(() => document.getElementById('infoMedias').textContent));
await p.click('#kVideos'); await attendre(200);
v('⚙ : décocher « vidéos » est mémorisé', await p.evaluate(() => localStorage.getItem('rayle_videos') === '0'));
await p.click('#cfgClose'); await attendre(300);
await demander(p, 'parle-moi de la tour Eiffel', 2200);
e = await etat(p);
v('vidéos désactivées : images oui, aucune demande de vidéo', e.ouvert && e.images === 3 && e.videos === 0 && req.videos.length === 0, JSON.stringify([e, req.videos]));
await p.click('#gear'); await attendre(300); await p.click('#kMedias'); await attendre(200);
v('⚙ : décocher « images » coupe aussi les vidéos et est mémorisé', await p.evaluate(() => localStorage.getItem('rayle_medias') === '0' && document.getElementById('kVideos').disabled === true));
await p.click('#cfgClose'); await attendre(300);
await demander(p, 'parle-moi de la tour Eiffel', 2000);
v('images désactivées : plus aucune recherche de médias, la réponse est donnée', req.images.length === 0 && req.videos.length === 0 && !(await etat(p)).ouvert && (await p.evaluate(() => window.__dit.length)) === 1);
const refus = await cmd(p, 'montre-moi des images de la tour Eiffel');
await p.evaluate(() => { Panneaux.fermerTout(); });
await p.evaluate(() => { localStorage.setItem('rayle_medias', '1'); localStorage.setItem('rayle_videos', '1'); document.getElementById('kMedias').checked = true; document.getElementById('kVideos').checked = true; });

// ══ 6. MODES ══
await p.evaluate(() => { window.__hudFixe = 'leger'; document.body.dataset.hud = 'leger'; });
await demander(p, 'parle-moi de la tour Eiffel', 2000);
v('LÉGER : aucun complément automatique (ni images, ni vidéos)', req.images.length === 0 && req.videos.length === 0 && !(await etat(p)).ouvert);
await p.evaluate(() => { window.__hudFixe = 'complet'; document.body.dataset.hud = 'complet'; });
await demander(p, 'parle-moi de la tour Eiffel', 2400);
e = await etat(p);
v('COMPLET : 4 images et jusqu’à 2 vidéos', req.images[0] && req.images[0].n === '4' && req.videos[0] && req.videos[0].n === '2' && e.images === 4 && e.videos === 2, JSON.stringify([req.images, req.videos, e]));
await p.evaluate(() => { window.__hudFixe = 'normal'; document.body.dataset.hud = 'normal'; });

// ══ 7. COMMANDES VOCALES ══
await demander(p, 'parle-moi de la tour Eiffel', 2200);
let c = await cmd(p, 'enlève les images');
v('« enlève les images » : la fenêtre se ferme, Raylé confirme', c.r === true && !(await etat(p)).ouvert && /retirées/.test(c.dit.join(' ')), JSON.stringify(c));
c = await cmd(p, 'enlève les images');
v('« enlève les images » sans image affichée : réponse honnête', /aucune image à retirer/.test(c.dit.join(' ')));
c = await cmd(p, 'désactive les vidéos');
v('« désactive les vidéos » : réglage coupé, case ⚙ mise à jour', await p.evaluate(() => localStorage.getItem('rayle_videos') === '0' && document.getElementById('kVideos').checked === false) && /vidéos sont désactivées/.test(c.dit.join(' ')), JSON.stringify(c.dit));
c = await cmd(p, 'active les vidéos');
v('« active les vidéos » : de retour', await p.evaluate(() => localStorage.getItem('rayle_videos') === '1'));
c = await cmd(p, 'désactive les images');
v('« désactive les images » : tout est coupé et dit', await p.evaluate(() => localStorage.getItem('rayle_medias') === '0') && /désactivées/.test(c.dit.join(' ')));
c = await cmd(p, 'active les images');
v('« active les images » : de retour', await p.evaluate(() => localStorage.getItem('rayle_medias') === '1') && /de retour/.test(c.dit.join(' ')));
c = await cmd(p, 'montre-moi une vidéo de la tour Eiffel', 1800);
e = await etat(p);
v('« montre-moi une vidéo de la tour Eiffel » : vidéos (Commons, Internet Archive), sans lecture automatique', c.r === true && e.ouvert && e.videos === 2 && e.iframes === 0 && /vidéos/.test(c.dit.join(' ')), JSON.stringify([e, c.dit]));
c = await cmd(p, 'montre-moi une vidéo de Riendutout', 1500);
v('vidéo introuvable : message simple et honnête', /aucune vidéo fiable/.test(c.dit.join(' ')), JSON.stringify(c.dit));
// « montre-moi des images de … » reste la galerie existante
await p.evaluate(() => Panneaux.fermerTout());
await demander(p, 'montre-moi des images de la tour Eiffel', 2000);
v('« montre-moi des images de … » : la galerie de la demande explicite s’ouvre (pas le complément)', await p.evaluate(() => !!document.querySelector('.pn[data-type="holo-images"]') && !document.querySelector('.pn[data-type="holo-medias"]')));

// ══ 8. ACTUALITÉS : vignettes, galerie « de cette actualité » ══
await p.evaluate(() => Panneaux.fermerTout());
await p.evaluate(() => ActusAccueil.ouvrir('france')); await attendre(2500);
let vig = await p.evaluate(() => ({ n: document.querySelectorAll('.ac-vignette').length, rp: [...document.querySelectorAll('.ac-vignette')].every(i => i.referrerPolicy === 'no-referrer' && /^https:\/\/img\.media-/.test(i.src)), titre: document.querySelector('.ac-vignette')?.title }));
v('actualités : une vignette par sujet qui en a une (2 sur 4), tirée du flux du média, sans référent', vig.n >= 2 && vig.n <= 3 && vig.rp && /flux RSS/.test(vig.titre), JSON.stringify(vig));
await attendre(500);
v('actualités : une image introuvable disparaît sans laisser de trou', await p.evaluate(() => { const l = [...document.querySelectorAll('.ac-sujet')].find(x => /introuvable/.test(x.textContent)); return !!l && !l.querySelector('.ac-vignette') && !l.classList.contains('ac-avec-image'); }));
v('actualités : un sujet sans image reste sans image (rien d’inventé)', await p.evaluate(() => { const l = [...document.querySelectorAll('.ac-sujet')].find(x => /sans aucune image/.test(x.textContent)); return !!l && !l.querySelector('.ac-vignette'); }));
await capture(p, '4-actualites-vignettes');
c = await cmd(p, 'montre-moi les images de cette actualité', 2200);
e = await etat(p);
const legA = await p.evaluate(() => document.querySelector('.med-legende')?.textContent.replace(/\s+/g, ' '));
v('« montre-moi les images de cette actualité » : galerie liée au premier sujet (2 médias, 2 images)', c.r === true && e.ouvert && e.images === 2 && /Lyon/.test(e.titre) && /Source : Média A \(flux RSS du média\)/.test(legA) && /Licence : image fournie par le flux RSS du média/.test(legA), JSON.stringify([e, legA]));
v('galerie d’actualité : lien vers l’article du média', await p.evaluate(() => [...document.querySelectorAll('.med-legende a')].some(a => /\.test\/incendie-lyon/.test(a.href))));
v('galerie d’actualité : images tirées du site du média', chargees.some(u => /img\.media-a\.test\/lyon\.jpg/.test(u)) && chargees.some(u => /img\.media-b\.test/.test(u)));
await capture(p, '5-galerie-actualite');
c = await cmd(p, 'montre-moi les images de la deuxième actualité', 1800);
e = await etat(p);
v('« … de la deuxième actualité » : le deuxième sujet', e.ouvert && /Réforme/.test(e.titre) && e.images === 1, JSON.stringify(e));
c = await cmd(p, 'montre-moi les images de la troisième actualité', 1500);
v('actualité sans image : message honnête, aucune fenêtre vide', /ni image ni vidéo/.test(c.dit.join(' ')), JSON.stringify(c.dit));
await p.evaluate(() => Panneaux.fermer('holo-medias'));
remise();
c = await cmd(p, 'montre-moi les vidéos de cette actualité', 1500);
v('« … les vidéos de cette actualité » : cherche les vidéos de chaînes officielles pour ce sujet', req.videos.length === 1 && req.videos[0].type === 'actu' && /Lyon/.test(req.videos[0].q), JSON.stringify(req.videos));
// réglage coupé : les vignettes partent aussitôt
await p.evaluate(() => { Panneaux.fermer('holo-medias'); });
c = await cmd(p, 'désactive les images', 1500);
v('« désactive les images » : les vignettes des actualités disparaissent', await p.evaluate(() => document.querySelectorAll('.ac-vignette').length === 0));
c = await cmd(p, 'active les images', 1500);
v('« active les images » : les vignettes reviennent', await p.evaluate(() => document.querySelectorAll('.ac-vignette').length >= 2));
await p.evaluate(() => { window.__hudFixe = 'leger'; document.body.dataset.hud = 'leger'; });
await p.evaluate(() => ActusAccueil.ouvrir('france')); await attendre(1500);
v('LÉGER : pas de vignettes dans les actualités', await p.evaluate(() => document.querySelectorAll('.ac-vignette').length === 0 || [...document.querySelectorAll('.ac-vignette')].every(i => getComputedStyle(i).display === 'none')));
await p.evaluate(() => { window.__hudFixe = 'normal'; document.body.dataset.hud = 'normal'; });
await p.close();

// ══ 9. TÉLÉPHONE : la fenêtre tient dans l'écran ══
p = await page({ viewport: { width: 390, height: 780 } });
await demander(p, 'parle-moi de la tour Eiffel', 2400);
const tel = await p.evaluate(() => { const r = document.querySelector('.pn[data-type="holo-medias"]')?.getBoundingClientRect(); return r ? { g: Math.round(r.left), d: Math.round(r.right), iw: innerWidth, sw: document.documentElement.scrollWidth } : null; });
v('téléphone : la fenêtre des médias reste dans l’écran, sans défilement horizontal', tel && tel.g >= 0 && tel.d <= tel.iw + 1 && tel.sw <= tel.iw + 1, JSON.stringify(tel));
await capture(p, '6-telephone');
await p.close();

v('aucune exception ni erreur de page pendant tout le test', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
await b.close(); srv.close();
console.log(`\n${ok} réussis, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
