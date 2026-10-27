// Démonstration RÉELLE : un petit serveur local qui joue le rôle du Worker pour /images en appelant VRAIMENT Wikipédia, Wikimedia Commons et Openverse
// (le code de worker/src/intelligence/images.js), puis la page affiche les vraies images. Sert aux captures et au relevé des licences.
//   node images-reel.mjs
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { chercherImages } = await import(new URL('../worker/src/intelligence/images.js', import.meta.url).href);
const attendre = ms => new Promise(r => setTimeout(r, ms));
const releve = [];
const srv = http.createServer(async (req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const u = new URL(req.url, 'http://x'), fin = (c, o) => { res.writeHead(c, cors); res.end(JSON.stringify(o)); };
  if (u.pathname === '/images') {
    const t0 = Date.now();
    try { const r = await chercherImages(u.searchParams.get('q'), Number(u.searchParams.get('n')) || 4); r.duree_ms = Date.now() - t0; return fin(200, r); }
    catch (e) { return fin(502, { error: e.message, erreurs: e.erreurs }); }
  }
  if (u.pathname === '/chat') return fin(200, { reply: 'Voici ma réponse de test, Justin.', engine: 'mock', actions: [], outils: [] });
  const rep = { '/ping': { ok: true, version: 'mock', adresse: 'tu', voix: 'Test', feminin: true, vitesse: -8, ia: ['Mock'], d1: true, mode: 'normal' }, '/securite/etat': { appareil: null, appaire: false, configure: false, deverrouille: false, expire_dans: 0, bloque_dans: 0, defi_dans: 0 }, '/evenements': { alertes: [] }, '/reglages': { mode: 'normal' }, '/memoire': { notes: [] }, '/souvenirs': { items: [] } }[u.pathname];
  res.writeHead(rep ? 200 : 404, cors); res.end(JSON.stringify(rep || { error: 'route inconnue' }));
});
await new Promise(r => srv.listen(8788, '127.0.0.1', r));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'] });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 900 });
p.on('pageerror', e => console.log('ERREUR page', e.message.slice(0, 200)));
await p.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_entite_qualite', '0'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', 'http://127.0.0.1:8788'); localStorage.setItem('rayle_worker_token', 'test'); });
await p.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(3500);
await p.evaluate(() => { Panneaux.fermerTout(); Entite.verrou(false); Entite.verrou = () => {}; window.__dit = []; speak = async t => { window.__dit.push(String(t)); }; });
const questions = [['asterix', 'Qui est Astérix et Obélix ?'], ['navire', 'Montre-moi un navire du XVIIIe siècle'], ['bateau1700', 'À quoi ressemble un bateau de 1700 ?'], ['joconde', 'Montre-moi la Joconde'], ['panda', 'Montre-moi un panda géant']];
for (const [id, q] of questions) {
  await p.evaluate(() => { Panneaux.fermerTout(); window.__dit = []; });
  await p.evaluate(t => { addLine('user', t); respond(t); }, q);
  await p.waitForFunction(() => ImagesHolo.etat().ouvert || document.querySelector('.pn[data-type="holo-images"] .img-vide b:not(.img-attente)'), { timeout: 30000 }).catch(() => {});
  await attendre(3500);   // images chargées depuis leur source réelle
  const info = await p.evaluate(() => {
    const e = ImagesHolo.etat(), dit = window.__dit.slice();
    const panneau = document.querySelector('.pn[data-type="holo-images"]');
    const charge = panneau ? [...panneau.querySelectorAll('img')].map(i => ({ ok: i.complete && i.naturalWidth > 0, w: i.naturalWidth, h: i.naturalHeight })) : [];
    return { e, dit, texte: panneau ? panneau.textContent.replace(/\s+/g, ' ').slice(0, 300) : '', charge };
  });
  // relevé des licences : on parcourt la galerie en cliquant sur les vignettes
  const fiches = [];
  const n = info.e.n;
  for (let i = 0; i < n; i++) {
    await p.evaluate(k => { const b = document.querySelectorAll('.img-vignettes button')[k]; if (b) b.click(); else ImagesHolo.agir('precedente'); }, i); await attendre(250);
    fiches.push(await p.evaluate(() => { const c = document.querySelector('.img-principale figcaption'); return { titre: c.querySelector('.img-titre').textContent, auteur: c.querySelector('.img-aut').textContent.replace('Auteur : ', ''), licence: c.querySelector('.img-lic').textContent.replace('Licence : ', ''), source: c.querySelector('.img-src').href }; }));
  }
  await p.evaluate(() => { const b = document.querySelectorAll('.img-vignettes button')[0]; if (b) b.click(); }); await attendre(1500);
  await p.screenshot({ path: `../captures-accueil/images-reel-${id}.png` });
  releve.push({ question: q, dit: info.dit, galerie: info.e, chargees: info.charge, fiches, texte: n ? undefined : info.texte });
}
fs.writeFileSync('../captures-accueil/images-reel.json', JSON.stringify(releve, null, 1));
for (const r of releve) {
  console.log('\n■ ' + r.question + '\n  Raylé dit : ' + r.dit.join(' | ') + '\n  Article : ' + r.galerie.article + ' · ' + r.galerie.n + ' image(s) · chargées : ' + r.chargees.filter(c => c.ok).length + '/' + r.chargees.length);
  r.fiches.forEach((f, i) => console.log('   ' + (i + 1) + '. ' + f.titre + ' — ' + f.auteur.slice(0, 60) + ' — ' + f.licence + ' — ' + f.source));
  if (r.texte) console.log('  Fenêtre : ' + r.texte);
}
await b.close(); srv.close();
