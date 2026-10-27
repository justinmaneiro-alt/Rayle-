// Images de réponse (fenêtre galerie holographique) avec un FAUX Worker : questions visuelles, sources, licences, commandes vocales, honnêteté, sûreté, modes, images/s.
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import http from 'node:http';
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };

/* ───── faux Worker : /chat, /images ───── */
const requetes = { images: [], chat: 0 };
const mini = (n, nom) => 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/' + nom + n + '.jpg/480px-' + nom + n + '.jpg';
const image = (n, nom, o = {}) => Object.assign({ titre: nom + ' ' + n, auteur: 'Auteur ' + n, licence: o.licence || 'CC BY-SA 4.0', licence_url: 'https://creativecommons.org/licenses/by-sa/4.0', source_url: 'https://commons.wikimedia.org/wiki/File:' + nom + n + '.jpg',
  miniature: mini(n, nom), grande: mini(n, nom).replace('480px', '960px'), largeur: 480, hauteur: 320, origine: n === 1 ? 'wikipedia' : 'commons' }, o);
const JEUX = {
  'Astérix et Obélix': { sujet: { titre: 'Astérix', langue: 'fr', url: 'https://fr.wikipedia.org/wiki/Ast%C3%A9rix', description: 'série française de bandes dessinées' }, images: [1, 2, 3, 4].map(n => image(n, 'Asterix')) },
  'navire du XVIIIe siècle': { sujet: { titre: 'Corvette (navire)', langue: 'fr', url: 'https://fr.wikipedia.org/wiki/Corvette_(navire)', description: 'classe de navires de guerre' }, images: [1, 2, 3, 4].map(n => image(n, 'Corvette', { origine: 'commons' })) },
  'Joconde': { sujet: { titre: 'La Joconde', langue: 'fr', url: 'https://fr.wikipedia.org/wiki/La_Joconde', description: 'peinture à l\'huile de Léonard de Vinci' }, images: [1, 2, 3].map(n => image(n, 'Mona', { licence: 'Public domain', licence_url: '', auteur: 'Léonard de Vinci' })) },
  'panda géant': { sujet: { titre: 'Panda géant', langue: 'fr', url: 'https://fr.wikipedia.org/wiki/Panda_g%C3%A9ant', description: 'espèce de mammifères' }, images: [1, 2, 3, 4].map(n => image(n, 'Panda')) },
  'Mickey': { sujet: { titre: 'Mickey Mouse', langue: 'fr', url: 'https://fr.wikipedia.org/wiki/Mickey_Mouse', description: 'personnage' }, images: [], raison: 'l\'image de l\'article n\'est pas sous licence libre et rien de libre n\'a été trouvé sur Wikimedia Commons ni Openverse' },
  'Hostile': { sujet: { titre: 'Hostile', langue: 'fr', url: 'https://fr.wikipedia.org/wiki/Hostile', description: '' }, images: [image(1, 'Ok'), Object.assign(image(2, 'Evil'), { miniature: 'https://evil.example.com/a.jpg' })] }
};
const srv = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const u = new URL(req.url, 'http://x');
  const fin = (code, o) => { res.writeHead(code, cors); res.end(JSON.stringify(o)); };
  if (u.pathname === '/images') {
    const q = u.searchParams.get('q'); requetes.images.push({ q, n: u.searchParams.get('n') });
    if (q === 'Panne') return fin(502, { error: 'les sources d\'images ne répondent pas' });
    if (q === 'Lent') return setTimeout(() => fin(200, JEUX['panda géant']), 4000);
    if (q === 'Calme') return setTimeout(() => fin(200, JEUX['Joconde']), 5000);
    const j = JEUX[q] || { sujet: null, images: [], raison: 'aucun article encyclopédique ne correspond à ce sujet' };
    return fin(200, Object.assign({ q, sources: ['Wikipédia'], cache: 'non' }, j));
  }
  if (u.pathname === '/chat') { requetes.chat++; return fin(200, { reply: 'Voici ma réponse de test, Justin.', engine: 'mock', actions: [], outils: [] }); }
  const rep = { '/ping': { ok: true, version: 'mock', adresse: 'tu', voix: 'Test', feminin: true, vitesse: -8, ia: ['Mock'], d1: true, mode: 'normal' }, '/securite/etat': { appareil: null, appaire: false, configure: false, deverrouille: false, expire_dans: 0, bloque_dans: 0, defi_dans: 0 }, '/evenements': { alertes: [] }, '/reglages': { mode: 'normal' }, '/memoire': { notes: [] }, '/souvenirs': { items: [] } }[u.pathname];
  res.writeHead(rep ? 200 : 404, cors); res.end(JSON.stringify(rep || { error: 'route inconnue' }));
});
await new Promise(r => srv.listen(8788, '127.0.0.1', r));
const png = (couleur) => { const p = new PNG({ width: 480, height: 320 }); for (let y = 0; y < 320; y++) for (let x = 0; x < 480; x++) { const i = (y * 480 + x) * 4; p.data[i] = couleur[0] * (0.5 + x / 960); p.data[i + 1] = couleur[1] * (0.5 + y / 640); p.data[i + 2] = couleur[2]; p.data[i + 3] = 255; } return PNG.sync.write(p); };

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'] });
const erreurs = [], imagesChargees = [];
async function page(opts = {}) {
  const p = await b.newPage(); await p.setViewport(opts.viewport || { width: 1600, height: 900 });
  if (opts.reduire) await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  p.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error' && !/calendar|faireconomy|ERR_FAILED|404|502|evil\.example/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });
  await p.setRequestInterception(true);
  p.on('request', r => {
    const u = r.url();
    if (/^https:\/\/(?:upload|thumb)\.wikimedia\.org\//.test(u)) { imagesChargees.push(u); return r.respond({ status: 200, contentType: 'image/png', body: png([200, 150, 120]) }); }
    if (/evil\.example\.com/.test(u)) { imagesChargees.push(u); return r.respond({ status: 200, contentType: 'image/png', body: png([255, 0, 0]) }); }
    r.continue();
  });
  await p.evaluateOnNewDocument(q => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_entite_qualite', String(q)); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', 'http://127.0.0.1:8788'); localStorage.setItem('rayle_worker_token', 'test'); }, opts.qualite ?? 0);
  await p.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(opts.attente || 3500);
  await p.evaluate(() => { Panneaux.fermerTout(); Entite.verrou(false); Entite.verrou = () => {}; window.__dit = []; speak = async t => { window.__dit.push(String(t)); }; });
  return p;
}
const dit = p => p.evaluate(() => window.__dit.slice());
const etat = p => p.evaluate(() => ImagesHolo.etat());
const demander = async (p, q, ms = 1800) => { requetes.images.length = 0; requetes.chat = 0; imagesChargees.length = 0; await p.evaluate(() => { window.__dit = []; }); await p.evaluate(t => { addLine('user', t); respond(t); }, q); await attendre(ms); };
const texte = (p, s) => p.evaluate(sel => { const e = document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, s);

let p = await page();
// ── 1. « Qui est Astérix et Obélix ? » : l'IA répond ET les images arrivent ; phrase qui nomme l'article ──
await demander(p, 'Qui est Astérix et Obélix ?');
let e = await etat(p), parole = await dit(p);
v('« qui est… » : la fenêtre d\'images s\'ouvre avec 4 images, article « Astérix »', e.ouvert && e.n === 4 && e.article === 'Astérix', JSON.stringify(e));
v('« qui est… » : l\'IA a répondu ET une phrase nomme l\'article Wikipédia d\'où viennent les images', requetes.chat === 1 && parole.length === 1 && /Voici ma réponse de test/.test(parole[0]) && /Voici les 4 images de l'article Wikipédia « Astérix »/.test(parole[0]), parole.join(' | '));
v('une seule recherche d\'images pour la question', requetes.images.length === 1 && requetes.images[0].q === 'Astérix et Obélix' && requetes.images[0].n === '4', JSON.stringify(requetes.images));
const cap = await texte(p, '.img-principale figcaption');
v('sous l\'image : titre, auteur, licence et lien de source toujours visibles', /Asterix 1/.test(cap) && /Auteur : Auteur 1/.test(cap) && /Licence : CC BY-SA 4\.0/.test(cap) && /Source : /.test(cap), cap);
v('liens : licence et source s\'ouvrent dans un nouvel onglet, sans référent', await p.evaluate(() => [...document.querySelectorAll('.img-principale figcaption a')].every(a => a.target === '_blank' && /noopener/.test(a.rel) && /^https:\/\//.test(a.href)) && document.querySelectorAll('.img-principale figcaption a').length === 2));
v('lien vers l\'article Wikipédia affiché', await p.evaluate(() => { const a = document.querySelector('.img-article a'); return !!a && /fr\.wikipedia\.org\/wiki\/Ast/.test(a.href) && /Wikipédia · Astérix/.test(a.textContent); }));
v('la première image est grande, les 4 vignettes en dessous', await p.evaluate(() => document.querySelectorAll('.img-vignettes button').length === 4 && document.querySelector('.img-principale img').getBoundingClientRect().width > 250));
v('chargement différé et sans référent sur toutes les images', await p.evaluate(() => [...document.querySelectorAll('#panneaux img')].every(i => i.loading === 'lazy' && i.referrerPolicy === 'no-referrer' && i.decoding === 'async')));
v('seules des miniatures de 480 px sont chargées (pas de grande image tant qu\'on n\'agrandit pas)', imagesChargees.length > 0 && imagesChargees.every(u => /480px/.test(u)), imagesChargees.length + ' images, ' + [...new Set(imagesChargees.map(u => /\d+px/.exec(u)[0]))].join());
v('style sobre : cadre fin, balayage, plus de scintillement ni de lignes de scan', await p.evaluate(() => { const pn = document.querySelector('.pn[data-type="holo-images"]'); const a = getComputedStyle(pn).animationName; return !!pn && a.includes('v1-balaye') && !a.includes('jv-scint') && getComputedStyle(pn.querySelector('.pn-scan')).display === 'none'; }));
await p.screenshot({ path: '../captures-accueil/images-asterix.png' });

// ── 2. commandes : agrandir, suivante, précédente, réduire, fermer (voix et clavier) ──
const cmd = async c => { await p.evaluate(t => { command(t); }, c); await attendre(500); return { e: await etat(p), dit: await dit(p) }; };
let r = await cmd('agrandis l image');
v('« agrandis l\'image » : l\'image s\'agrandit (grande taille chargée)', r.e.agrandi && r.e.lightbox && imagesChargees.some(u => /960px/.test(u)) && /agrandie/.test(r.dit.at(-1)), JSON.stringify(r.e) + ' ' + r.dit.at(-1));
v('agrandie : titre, auteur, licence, source et article toujours visibles', await p.evaluate(() => { const t = document.querySelector('#imagesLightbox .img-lb-leg').textContent; return /Asterix 1/.test(t) && /Auteur/.test(t) && /Licence/.test(t) && /Source/.test(t) && /Article Wikipédia : Astérix/.test(t); }));
await p.screenshot({ path: '../captures-accueil/images-agrandie.png' });
r = await cmd('image suivante'); v('« image suivante » : image 2 sur 4', r.e.index === 1 && /Image 2 sur 4/.test(r.dit.at(-1)) && /Asterix 2/.test(await texte(p, '#imagesLightbox h2')), JSON.stringify(r.e));
r = await cmd('la suivante'); r = await cmd('image suivante'); r = await cmd('image suivante'); v('dernière image : on ne dépasse pas', r.e.index === 3 && /dernière/.test(r.dit.at(-1)));
r = await cmd('image precedente'); v('« image précédente » : image 3 sur 4', r.e.index === 2 && /Image 3 sur 4/.test(r.dit.at(-1)));
await p.keyboard.press('ArrowLeft'); await attendre(300); v('clavier : flèche gauche = image précédente', (await etat(p)).index === 1);
await p.keyboard.press('Escape'); await attendre(400); e = await etat(p); v('Échap : réduit l\'image (la fenêtre reste ouverte)', !e.agrandi && !e.lightbox && e.ouvert);
r = await cmd('agrandis'); r = await cmd('reduis l image'); v('« réduis l\'image » : retour à la fenêtre', !r.e.agrandi && r.e.ouvert);
await p.click('.img-vignettes button:nth-child(3)'); await attendre(300); e = await etat(p); v('clic sur une vignette : image 3 en grand', e.index === 2 && /Asterix 3/.test(await texte(p, '.img-principale figcaption')));
await p.click('.img-zoom'); await attendre(1000); v('clic sur l\'image : agrandissement', (await etat(p)).agrandi);
await p.click('#imagesLightbox .img-nav.d'); await attendre(300); v('flèche à l\'écran : image suivante', (await etat(p)).index === 3);
r = await cmd('ferme l image'); v('« ferme l\'image » : tout est fermé', !r.e.ouvert && !r.e.lightbox && /fermée/.test(r.dit.at(-1)) && (await p.evaluate(() => document.querySelectorAll('.pn[data-type="holo-images"]').length === 0 || !![...document.querySelectorAll('.pn[data-type="holo-images"]')].every(x => x.classList.contains('hud-out')))), JSON.stringify(r.e));
v('les commandes d\'image sans fenêtre ouverte ne font rien (les autres commandes passent)', await p.evaluate(() => ImagesHolo.commande('image suivante') === null && ImagesHolo.commande('ferme l image') === null));

// ── 3. demandes explicites : sans IA, une phrase d'introduction ──
await demander(p, 'Montre-moi un navire du XVIIIe siècle'); e = await etat(p); parole = await dit(p);
v('« montre-moi un navire du XVIIIe siècle » : galerie de 4 images, article « Corvette (navire) », sans appel à l\'IA', e.ouvert && e.n === 4 && e.article === 'Corvette (navire)' && requetes.chat === 0, JSON.stringify(e) + ' chat=' + requetes.chat);
v('phrase d\'introduction : nomme l\'article et les sources', parole.length === 1 && /Voici les 4 images de l'article Wikipédia « Corvette \(navire\) » \(Wikimedia Commons\)\./.test(parole[0]), parole.join(' | '));
v('la phrase d\'introduction n\'ouvre pas en plus une fenêtre de texte', await p.evaluate(() => document.querySelectorAll('.pn[data-type="holo-points"]:not(.hud-out)').length === 0));
await p.screenshot({ path: '../captures-accueil/images-navire.png' });
await demander(p, 'à quoi ressemble la Joconde ?'); e = await etat(p);
const capJ = await texte(p, '.img-principale figcaption');
v('« à quoi ressemble la Joconde » : 3 images, licence « Public domain », auteur Léonard de Vinci', e.n === 3 && /Public domain/.test(capJ) && /Léonard de Vinci/.test(capJ) && requetes.chat === 0, capJ);
v('sans lien de licence : la licence s\'affiche en texte', await p.evaluate(() => !document.querySelector('.img-lic a')));
await p.screenshot({ path: '../captures-accueil/images-joconde.png' });
await demander(p, 'photo de panda géant'); e = await etat(p); v('« photo de panda géant » : 4 images, article « Panda géant »', e.n === 4 && e.article === 'Panda géant', JSON.stringify(e));
await p.screenshot({ path: '../captures-accueil/images-panda.png' });

// ── 4. honnêteté : aucune image libre, source en panne ou lente ──
await demander(p, 'montre-moi Mickey'); parole = await dit(p);
v('aucune image libre : la fenêtre le dit, avec la raison, et ne montre aucune image', await p.evaluate(() => { const t = document.querySelector('.pn[data-type="holo-images"]').textContent; return /aucune image libre trouvée/.test(t) && /licence libre/.test(t) && document.querySelectorAll('.pn[data-type="holo-images"] img').length === 0; }));
v('aucune image libre : Raylé le dit aussi, avec la raison', parole.length === 1 && /aucune image libre pour « Mickey »/.test(parole[0]) && /licence libre/.test(parole[0]), parole.join('|'));
await p.screenshot({ path: '../captures-accueil/images-aucune.png' });
await demander(p, 'montre-moi Panne'); parole = await dit(p);
v('source en panne : « indisponible » avec la raison, sans image', await p.evaluate(() => { const t = document.querySelector('.pn[data-type="holo-images"]').textContent; return /indisponible/.test(t) && !document.querySelector('.pn[data-type="holo-images"] img'); }) && /indisponible/.test(parole[0]), parole.join('|'));
// source lente : la fenêtre « recherche… » s'ouvre tout de suite, la réponse n'est pas bloquée pour « qui est »
requetes.images.length = 0; await p.evaluate(() => { window.__dit = []; addLine('user', 'montre-moi Lent'); respond('montre-moi Lent'); }); await attendre(800);
v('source lente : une fenêtre « Recherche d\'images libres… » s\'affiche aussitôt', /Recherche d'images libres/.test(await texte(p, '.pn[data-type="holo-images"]')));
await attendre(4200); e = await etat(p); v('source lente : les images arrivent ensuite', e.ouvert && e.n === 4 && (await dit(p)).length === 1);
await p.evaluate(() => { Panneaux.fermerTout(); });
const t0 = Date.now(); requetes.chat = 0; await p.evaluate(() => { window.__dit = []; window.__fin = 0; addLine('user', 'qui est Lent'); respond('qui est Lent').then(() => { window.__fin = performance.now(); }); window.__debut = performance.now(); });
await attendre(2600); const delai = await p.evaluate(() => window.__fin ? Math.round(window.__fin - window.__debut) : -1); parole = await dit(p);
v('« qui est… » avec une source lente : la réponse de l\'IA n\'attend pas (moins de 2,4 s)', delai > 0 && delai < 2400 && parole.length === 1 && !/Voici les/.test(parole[0]), delai + ' ms · ' + parole.join('|'));
await attendre(3500); e = await etat(p); v('… et les images s\'ouvrent quand elles arrivent, sans phrase en plus', e.ouvert && e.n === 4 && (await dit(p)).length === 1);
await p.evaluate(() => Panneaux.fermerTout());
await demander(p, 'qui est Panne'); parole = await dit(p);
v('« qui est… » avec une source en panne : la réponse passe, aucune fenêtre d\'erreur parasite', parole.length === 1 && /Voici ma réponse de test/.test(parole[0]) && !(await etat(p)).ouvert && (await p.evaluate(() => document.querySelectorAll('.pn[data-type="holo-images"]:not(.hud-out)').length === 0)), parole.join('|'));

// ── 5. sûreté : sensible, personnes privées, hôtes inconnus, pas de recherche inutile ──
await demander(p, 'montre-moi un cadavre'); parole = await dit(p);
v('contenu sensible : refus poli, aucune recherche réseau', requetes.images.length === 0 && /préfère ne pas chercher/.test(parole[0]), JSON.stringify(requetes.images) + parole.join('|'));
await demander(p, 'photo de ma voisine'); parole = await dit(p);
v('personne privée : refus, aucune recherche réseau', requetes.images.length === 0 && /personnes privées/.test(parole[0]));
await demander(p, 'montre-moi Hostile'); e = await etat(p);
v('une image qui vient d\'un hôte inconnu est écartée, jamais chargée', e.n === 1 && !imagesChargees.some(u => /evil\.example/.test(u)), JSON.stringify(e));
await p.evaluate(() => Panneaux.fermerTout());
await demander(p, 'Quelle heure est-il ?'); v('une question qui n\'est pas visuelle ne cherche aucune image', requetes.images.length === 0);
await demander(p, 'qui est le président de la France ?'); v('« qui est le président… » : pas de recherche d\'images', requetes.images.length === 0 && requetes.chat === 1);
await demander(p, 'bonjour Raylé'); v('une salutation ne cherche aucune image', requetes.images.length === 0);
await p.evaluate(() => Panneaux.fermerTout());

// ── 6. images/s en complet avec la galerie ouverte ──
const fps = pp => pp.evaluate(`new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(Math.round(n * 1000 / (performance.now() - t0))); }; requestAnimationFrame(f); })`);
await demander(p, 'montre-moi un panda géant', 1500);
let f = await fps(p), ent = await p.evaluate(() => Entite.info().fps);
v(`COMPLET : galerie ouverte, ≥ 100 images/s (page ${f}, entité ${ent})`, f >= 100 && ent >= 100, f + ' / ' + ent);
await p.evaluate(() => command('agrandis l image')); await attendre(800); f = await fps(p);
v(`COMPLET : image agrandie, ≥ 100 images/s (${f})`, f >= 100, String(f));
await p.close();

// ── 7. modes ──
p = await page({ qualite: 1 }); await demander(p, 'montre-moi un panda géant', 1500); f = await fps(p); e = await etat(p);
v(`NORMAL : galerie de 4 images, ≥ 100 images/s (${f})`, e.n === 4 && f >= 100, JSON.stringify(e) + ' ' + f); await p.close();
p = await page({ qualite: 2 }); await demander(p, 'montre-moi un panda géant', 1500); f = await fps(p); e = await etat(p);
v(`LÉGER : une seule image demandée et affichée, sans vignettes ni balayage, ≥ 100 images/s (${f})`, e.n === 1 && requetes.images[0].n === '1' && (await p.evaluate(() => document.querySelectorAll('.img-vignettes button').length === 0 && getComputedStyle(document.querySelector('.img-zoom'), '::after').display === 'none')) && f >= 100, JSON.stringify(e) + ' ' + f);
await p.close();
p = await page({ viewport: { width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, qualite: 2 });
const cdp = await p.createCDPSession(); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); await demander(p, 'montre-moi un panda géant', 1800); f = await fps(p);
v(`tablette simulée (léger, processeur ralenti ×4) : galerie ouverte, ≥ 60 images/s (${f})`, f >= 60, String(f)); await p.close();
p = await page({ reduire: true }); await demander(p, 'montre-moi un panda géant', 1500);
v('animations réduites : simple fondu (pas de balayage ni de scintillement)', await p.evaluate(() => { const pn = document.querySelector('.pn[data-type="holo-images"]'); return getComputedStyle(pn).animationName === 'none' && getComputedStyle(document.querySelector('.img-zoom'), '::after').display === 'none'; }));
await p.close();
p = await page({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, qualite: 2 }); await demander(p, 'montre-moi un panda géant', 1800);
const tel = await p.evaluate(() => { const r = document.querySelector('.pn[data-type="holo-images"]').getBoundingClientRect(); return { g: r.left, d: r.right, iw: innerWidth, sw: document.documentElement.scrollWidth }; });
v('téléphone : la fenêtre d\'images tient dans l\'écran, sans défilement horizontal', tel.g >= 0 && tel.d <= tel.iw && tel.sw <= tel.iw, JSON.stringify(tel));
await p.screenshot({ path: '../captures-accueil/images-telephone.png' }); await p.close();

v('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
console.log(`${ok} OK, ${ko} KO`); await b.close(); srv.close(); process.exit(ko ? 1 : 0);
