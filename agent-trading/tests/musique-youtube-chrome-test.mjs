/* Test Chrome du lecteur YouTube corrigé, avec le VRAI lecteur officiel (réseau requis) :
   - aucun onglet ni aucune fenêtre ne s'ouvre tout seul (morceaux refusés, Mix, clics dans le lecteur : titre, logo « YouTube », publicité) ;
   - cadre restreint (sandbox sans allow-popups) et commandes du lecteur toujours fonctionnelles (pause, reprise, volume, suivant, stop) ;
   - liste contenant volontairement des vidéos qui refusent l'intégration (erreur 150) : passage automatique au suivant, message bref,
     panneau « Morceaux non lisibles » rempli ; liste entièrement refusée : arrêt net, message clair, aucune boucle ;
   - « Lien de ma playlist YouTube » enregistré (localStorage), playlist introuvable → Mix en secours ; tuile Musique et mode télé.
   Prérequis : node serveur.mjs 8011 (racine du dépôt).  Usage : node agent-trading/tests/musique-youtube-chrome-test.mjs  (captures dans captures-or/) */
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json'));
const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011', SORTIE = path.resolve('captures-or'); fs.mkdirSync(SORTIE, { recursive: true });
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
let nOk = 0; const echecs = [], erreurs = [];
const verifier = (c, m, d = '') => { if (c) { nOk++; console.log('OK ', m); } else { echecs.push(m); console.log('ÉCHEC', m, d); } };
const w = ms => new Promise(r => setTimeout(r, ms));
// toute nouvelle cible (onglet, fenêtre, popup) est comptée : il ne doit y en avoir AUCUNE en dehors des pages ouvertes par le test
let attendues = 0, intrus = [];
nav.on('targetcreated', t => { if (t.type() !== 'page') return; if (attendues > 0) { attendues--; return; } intrus.push(t.url() || '(vide)'); });
async function pageTest(l = 1600, h = 900, init = {}) {
  attendues++; const p = await nav.newPage(); await p.setViewport({ width: l, height: h, deviceScaleFactor: 1 });
  p.on('pageerror', e => erreurs.push(e.message));
  await p.evaluateOnNewDocument(i => { for (const [k, v] of Object.entries(i)) localStorage.setItem(k, JSON.stringify(v)); localStorage.removeItem('rayle_musique_playlist'); localStorage.removeItem('rayle_musique_non_lisibles'); }, init);
  return p;
}
const REFUS = ['kJQP7kiw5Fk', 'JGwWNGJdvx8', 'OPf0YbXqDm0'];   // refusent l'intégration (erreur 150) — vérifié par sonde au moment du test, voir plus bas
const LISIBLE = '5Xq5Up-6bSg';

const a = await pageTest(1600, 900, { rayle_musique_fixe: [{ id: REFUS[0], titre: 'Refusé exprès' }, { id: LISIBLE, titre: null }, { id: REFUS[1], titre: null }] });
await a.goto(BASE + '/index.html?appareil=pc', { waitUntil: 'load' }); await w(4000);
const M = () => a.evaluate(async () => { const m = (await import('/agent-trading/front/or/media-rayle.js')).lecteur(); window.__mu = m; return true; });
await M();
const etatLecteur = () => a.evaluate(() => { const p = window.__mu.lecteur(); try { return p ? p.getPlayerState() : null; } catch (e) { return 'x'; } });

/* 1. tuile Musique : fenêtre avec le champ de playlist et le panneau des morceaux non lisibles */
await a.click('#mdTuiles [data-md="musique"]'); await w(1200);
const f1 = await a.evaluate(() => { const b = [...document.querySelectorAll('.at-pc')].find(x => /MUSIQUE/.test(x.textContent)); return b && { champ: !!b.querySelector('[data-m-pl]'), lbl: /Lien de ma playlist YouTube/.test(b.textContent), nl: /Morceaux non lisibles \(0\)/.test(b.textContent), pl: !!b.querySelector('[data-m="playlist"]'), mix: !!b.querySelector('[data-m="mix"]') }; });
verifier(f1 && f1.champ && f1.lbl && f1.nl && f1.pl && f1.mix, 'tuile Musique : champ « Lien de ma playlist YouTube », panneau « Morceaux non lisibles », boutons', JSON.stringify(f1));

/* 2. « lance ma playlist » sans playlist enregistrée → liste de morceaux ; 1er morceau refusé exprès : sauté, noté, aucun onglet */
const r1 = await a.evaluate(() => window.__mu.commande('playlist'));
await w(1500);
const flashVu = await a.waitForFunction(() => { const f = document.querySelector('.mu-flot [data-m-flash]'); return f && !f.hidden && /non lisible dans Rayle, passé/.test(f.textContent); }, { timeout: 15000 }).then(() => true, () => false);
await a.screenshot({ path: path.join(SORTIE, 'musique-refus-passe.png') });
verifier(/lance ta playlist, 3 morceaux/.test(r1), '« lance ma playlist » sans lien enregistré : la liste de morceaux', r1);
verifier(flashVu, 'message bref « morceau non lisible dans Rayle, passé » dans la petite fenêtre');
await w(6000);
const s1 = await a.evaluate(() => { const p = window.__mu.lecteur(); return { etat: p.getPlayerState(), id: (p.getVideoData() || {}).video_id, idx: p.getPlaylistIndex(), nl: window.__mu.nonLisibles().map(m => m.id) }; });
verifier([1, 3].includes(s1.etat) && s1.id === LISIBLE, 'passage automatique au morceau suivant (lisible), qui joue', JSON.stringify(s1));
verifier(s1.nl.includes(REFUS[0]), 'morceau refusé ajouté aux « Morceaux non lisibles »', JSON.stringify(s1.nl));
const panneau = await a.evaluate(id => { const b = [...document.querySelectorAll('.at-pc')].find(x => /MUSIQUE/.test(x.textContent)); const li = b && [...b.querySelectorAll('[data-m-nl] li')].find(x => x.textContent.includes(id)); return li && { titre: /Refusé exprès/.test(li.textContent), lien: li.querySelector('a') && li.querySelector('a').href, cible: li.querySelector('a') && li.querySelector('a').target }; }, REFUS[0]);
verifier(panneau && panneau.titre && /youtube\.com\/watch\?v=kJQP7kiw5Fk/.test(panneau.lien), 'panneau : titre connu et lien (ouvert seulement sur clic volontaire)', JSON.stringify(panneau));

/* 3. cadre restreint + commandes du lecteur toujours fonctionnelles */
const cadre = await a.evaluate(() => { const f = document.querySelector('.mu-flot iframe'); return f && { sb: f.getAttribute('sandbox'), allow: f.getAttribute('allow'), src: f.src.split('?')[0] }; });
verifier(cadre && cadre.sb === 'allow-scripts allow-same-origin allow-presentation' && !/popups/.test(cadre.sb), 'iframe du lecteur restreint (sandbox sans allow-popups ni allow-top-navigation)', JSON.stringify(cadre));
verifier(cadre && /youtube-nocookie\.com\/embed\//.test(cadre.src), 'lecteur officiel (embed youtube-nocookie)', cadre && cadre.src);
await a.evaluate(() => window.__mu.commande('pause')); await w(1200); const ep = await etatLecteur();
await a.evaluate(() => window.__mu.commande('reprendre')); await w(2000); const er = await etatLecteur();
const vol = await a.evaluate(async () => { await window.__mu.commande('volume_moins'); return window.__mu.lecteur().getVolume(); });
verifier(ep === 2 && [1, 3].includes(er) && typeof vol === 'number', 'commandes : pause, reprise, volume (dans le cadre restreint)', JSON.stringify({ ep, er, vol }));

/* 4. clics dans le lecteur (titre en haut, logo « YouTube » en bas à droite, centre = zone d'une publicité) : aucun onglet, la page reste */
const bx = await a.evaluate(() => { const r = document.querySelector('.mu-flot iframe').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const avantUrl = a.url(), n0 = intrus.length;
for (const [dx, dy] of [[0.25, 0.08], [0.9, 0.9], [0.83, 0.92], [0.5, 0.5]]) { await a.mouse.click(bx.x + bx.w * dx, bx.y + bx.h * dy); await w(900); }
await w(2500);
verifier(intrus.length === n0 && a.url() === avantUrl, 'clics sur le titre, le logo « YouTube » et la zone de publicité : aucun nouvel onglet, Rayle reste affichée', JSON.stringify(intrus));
await a.screenshot({ path: path.join(SORTIE, 'musique-clics-lecteur.png') });

/* 5. liste ENTIÈREMENT refusée : arrêt net, message clair, aucune boucle */
const b = await pageTest(1600, 900, { rayle_musique_fixe: REFUS.map(id => ({ id, titre: null })) });
await b.goto(BASE + '/index.html?appareil=pc', { waitUntil: 'load' }); await w(3500);
await b.evaluate(async () => { const m = (await import('/agent-trading/front/or/media-rayle.js')).lecteur(); window.__mu = m; let erreurs = 0; window.__nErr = () => erreurs; m.commande('fixe'); const t = setInterval(() => { const p = m.lecteur(); if (p && !p.__espion) { p.__espion = 1; p.addEventListener('onError', () => { erreurs++; }); } }, 50); setTimeout(() => clearInterval(t), 4000); });
await w(16000);
const s2 = await b.evaluate(() => ({ actif: window.__mu.actif(), src: window.__mu.source(), nl: window.__mu.nonLisibles().length, err: window.__nErr(), msg: document.querySelector('.mu-flot [data-m-flash]').textContent, cache: document.querySelector('.mu-flot').hidden }));
verifier(!s2.actif && s2.src === null && s2.cache, 'liste entièrement refusée : lecture arrêtée', JSON.stringify(s2));
verifier(/Aucun morceau de ta liste de morceaux n’est lisible dans Rayle/.test(s2.msg), 'message clair', s2.msg);
verifier(s2.nl === 3 && s2.err <= 3, 'aucune boucle : 3 refus, 3 morceaux notés, puis plus rien', JSON.stringify(s2));
await w(5000); verifier(await b.evaluate(() => window.__nErr()) === s2.err, 'toujours arrêté 5 s plus tard (pas de relance)');

/* 6. Mix refusé ou non : jamais d'onglet ; « Lien de ma playlist YouTube » enregistré, introuvable → Mix en secours */
await a.evaluate(() => { const b = [...document.querySelectorAll('.at-pc')].find(x => /MUSIQUE/.test(x.textContent)); b.querySelector('[data-m-pl]').value = 'pas un lien'; b.querySelector('[data-m="pl_enregistrer"]').click(); });
const msgInv = await a.evaluate(() => document.querySelector('.at-pc [data-m-etat]').textContent);
verifier(/Lien non reconnu/.test(msgInv), 'lien invalide refusé avec un message', msgInv);
const FAUX = 'PLzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz00';
await a.evaluate(l => { const b = [...document.querySelectorAll('.at-pc')].find(x => /MUSIQUE/.test(x.textContent)); b.querySelector('[data-m-pl]').value = l; b.querySelector('[data-m="pl_enregistrer"]').click(); }, 'https://www.youtube.com/playlist?list=' + FAUX);
const enr = await a.evaluate(() => ({ ls: localStorage.getItem('rayle_musique_playlist'), msg: document.querySelector('.at-pc [data-m-etat]').textContent }));
verifier(enr.ls === JSON.stringify(FAUX) && /Playlist enregistrée/.test(enr.msg), 'lien de playlist enregistré sur l’appareil (identifiant extrait du lien)', JSON.stringify(enr));
const r6 = await a.evaluate(() => window.__mu.commande('playlist'));
await w(14000);
const s6 = await a.evaluate(() => ({ src: window.__mu.source(), etat: document.querySelector('.at-pc [data-m-etat]').textContent, flash: document.querySelector('.mu-flot [data-m-flash]').textContent }));
verifier(/playlist YouTube/.test(r6) && s6.src === 'mix' && /Mix en secours/.test(s6.flash + s6.etat), '« lance ma playlist » : playlist introuvable → le Mix en secours, dit clairement', JSON.stringify({ r6, ...s6 }));
await w(4000); verifier([1, 3].includes(await etatLecteur()), 'le Mix (secours) joue dans le lecteur intégré', await etatLecteur());
await a.screenshot({ path: path.join(SORTIE, 'musique-playlist-secours.png') });
// rechargement : le lien est toujours là
const c = await pageTest(1600, 900, {}); await c.evaluateOnNewDocument(l => localStorage.setItem('rayle_musique_playlist', JSON.stringify(l)), FAUX);
await c.goto(BASE + '/index.html?appareil=pc', { waitUntil: 'load' }); await w(3000); await c.click('#mdTuiles [data-md="musique"]'); await w(1000);
verifier(await c.evaluate(l => { const b = [...document.querySelectorAll('.at-pc')].find(x => /MUSIQUE/.test(x.textContent)); return b && b.querySelector('[data-m-pl]').value === l; }, FAUX), 'au rechargement, le champ montre la playlist enregistrée');
// stockage refusé : la page marche quand même
await c.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('refusé'); }; const b = [...document.querySelectorAll('.at-pc')].find(x => /MUSIQUE/.test(x.textContent)); b.querySelector('[data-m-pl]').value = 'PLyyyyyyyyyyyyyyyyyyyyyyyy'; b.querySelector('[data-m="pl_enregistrer"]').click(); });
verifier(/session seulement/.test(await c.evaluate(() => document.querySelector('.at-pc [data-m-etat]').textContent)), 'stockage refusé : erreur rattrapée, message « pour cette session seulement »');
await c.close();
await a.evaluate(() => window.__mu.commande('stop')); await b.close();

/* 7. mode télé : même lecteur restreint, refus sautés, aucun onglet */
const tv = await pageTest(1920, 1080, { rayle_musique_fixe: [{ id: REFUS[2], titre: null }, { id: LISIBLE, titre: null }] });
await tv.goto(BASE + '/tv/', { waitUntil: 'domcontentloaded' }); await w(9000);
await tv.evaluate(() => window.__tele.executer('musique'));
await w(12000);
const st = await tv.evaluate(() => { const m = window.__tele.musique, f = document.querySelector('.mu-flot iframe'), p = m.lecteur(); return { sb: f && f.getAttribute('sandbox'), id: p && (p.getVideoData() || {}).video_id, etat: p && p.getPlayerState(), nl: m.nonLisibles().map(x => x.id), fil: document.querySelector('[data-musique]').textContent }; });
verifier(st.sb === 'allow-scripts allow-same-origin allow-presentation', 'télé : cadre restreint', st.sb);
verifier(st.id === LISIBLE && [1, 3].includes(st.etat) && st.nl.includes(REFUS[2]), 'télé : morceau refusé sauté, le suivant joue', JSON.stringify(st));
await tv.screenshot({ path: path.join(SORTIE, 'musique-tele.png') });
await tv.evaluate(() => window.__tele.musique.commande('stop')); await tv.close();

verifier(intrus.length === 0, 'AUCUN onglet ni fenêtre ouverts automatiquement pendant tout le test', JSON.stringify(intrus));
const errUtiles = erreurs.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|net::/.test(e));
verifier(errUtiles.length === 0, 'aucune erreur de page', JSON.stringify(errUtiles.slice(0, 4)));
await a.close(); await nav.close();
console.log(`\nmusique-youtube-chrome-test : ${nOk} OK, ${echecs.length} échec(s)`); if (echecs.length) { console.log(echecs.join('\n')); process.exitCode = 1; }
