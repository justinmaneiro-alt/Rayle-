// Test de la panne « les commandes vocales de la galaxie ne répondent plus » (cache du navigateur périmé).
// Il aurait détecté la panne : (1) le serveur dit-il au navigateur de revalider ? (2) une modification sur le disque est-elle vue après un
// rechargement ? (3) une page HTML périmée avec des modules à jour casse-t-elle la voix ? (4) un module périmé produit-il un message clair ?
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const RACINE = fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/');
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };
const attendre = ms => new Promise(r => setTimeout(r, ms));

/* 1. En-têtes du serveur */
const tete = await fetch(BASE + '/galaxie/soleil.js', { method: 'HEAD' });
v('serveur : Cache-Control: no-cache (revalidation obligatoire)', /no-cache/.test(tete.headers.get('cache-control') || ''), tete.headers.get('cache-control') || 'absent (serveur python ?)');
const etag = tete.headers.get('etag');
v('serveur : ETag présent', !!etag);
const rev = await fetch(BASE + '/galaxie/soleil.js', { headers: { 'If-None-Match': etag || 'x' } });
v('serveur : revalidation → 304 si inchangé', rev.status === 304, String(rev.status));
v('serveur : secrets jamais servis (worker/, .dev.vars)', (await fetch(BASE + '/worker/wrangler.toml')).status === 403 && (await fetch(BASE + '/worker/.dev.vars')).status === 403);

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(RACINE + 'tests-navigateur/.profil-'), args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const dossierProfil = b.process() && null;
try {
  /* 2. Une modification est vue au rechargement (cache chaud) */
  const marqueur = 'tests-navigateur/.marqueur-cache.js';
  fs.writeFileSync(RACINE + marqueur, 'window.__marqueur = 1;\n');
  const p = await b.newPage();
  await p.goto(BASE + '/' + 'index.html'); await attendre(800);
  const lire = () => p.evaluate(async m => (await (await fetch(m)).text()).trim(), '/' + marqueur);
  v('cache chaud : première lecture', (await lire()) === 'window.__marqueur = 1;');
  fs.writeFileSync(RACINE + marqueur, 'window.__marqueur = 2;\n');
  await p.reload(); await attendre(800);
  v('cache chaud : après modification et rechargement (F5), la nouvelle version est servie', (await lire()) === 'window.__marqueur = 2;', await lire());
  fs.rmSync(RACINE + marqueur, { force: true });

  /* 3. Page HTML périmée (sans le curseur de vitesse) avec les modules à jour : la voix doit marcher quand même */
  const periodique = await b.newPage(); await periodique.setViewport({ width: 1600, height: 900 });
  await periodique.setRequestInterception(true);
  periodique.on('request', async r => {
    if (/\/index\.html$/.test(r.url())) { const t = (await (await fetch(r.url())).text()).replace(/<label>Vitesse du système[^\n]*\n/, ''); r.respond({ status: 200, contentType: 'text/html', body: t }); }
    else r.continue();
  });
  await periodique.goto(BASE + '/index.html'); await attendre(1500);
  const rep = await periodique.evaluate(async () => { const o = []; for (const t of ['va sur Mars', 'retour à la galaxie', 'va sur la Lune']) o.push(await commandeGalaxie(t)); return { o, dispo: RayleOrdres.disponible('rayle', 'aller_a') }; });
  v('page périmée : « va sur Mars » marche', rep.o[0] === 'Cap sur Mars.', rep.o[0]);
  v('page périmée : « retour à la galaxie » marche', rep.o[1] === 'Retour à la vue d’ensemble.', rep.o[1]);
  v('page périmée : « va sur la Lune » marche', rep.o[2] === 'Cap sur la Lune.', rep.o[2]);
  v('page périmée : les ordres sont enregistrés sur le bus', rep.dispo === true);
  await periodique.close();

  /* 4. Module périmé qui empêche la galaxie de démarrer : message clair, vue fermée, pas de « prévu, pas encore disponible » */
  const casse = await b.newPage(); await casse.setViewport({ width: 1600, height: 900 });
  await casse.setRequestInterception(true);
  casse.on('request', async r => {
    if (/galaxie\/soleil\.js/.test(r.url())) { const t = (await (await fetch(r.url())).text()).replace(/echelle\(px\) \{[^}]*\},/, ''); r.respond({ status: 200, contentType: 'text/javascript', body: t }); }
    else r.continue();
  });
  await casse.goto(BASE + '/index.html'); await attendre(1500);
  const rc = await casse.evaluate(async () => ({ r: await commandeGalaxie('va sur Mars'), vue: RayleBus.demander('vue'), cachee: document.getElementById('vueGalaxie').hidden }));
  v('module périmé : message clair avec la marche à suivre (Ctrl+F5)', /Ctrl\+F5/.test(rc.r) && !/prévu, pas encore disponible/.test(rc.r), rc.r);
  v('module périmé : la vue galaxie ne reste pas ouverte à moitié', rc.vue === 'rayle' && rc.cachee === true);
  await casse.close();
} finally { await b.close(); for (const d of fs.readdirSync(RACINE + 'tests-navigateur')) if (d.startsWith('.profil-')) fs.rmSync(RACINE + 'tests-navigateur/' + d, { recursive: true, force: true }); }
console.log(`\n${ok} réussis, ${ko} échecs`);
process.exit(ko ? 1 : 0);
