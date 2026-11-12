/* Téléphone = même Raylé que le PC : plus d'ancienne interface mobile, service worker qui remplace les anciens caches, manifest or, serveur réseau local, page « Connecter le téléphone ».
   node galaxie/tests/mobile-unifie-test.mjs */
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm'; import http from 'node:http'; import { spawn } from 'node:child_process'; import { createRequire } from 'node:module';
const R = path.resolve(import.meta.dirname, '../..'), lire = f => fs.readFileSync(path.join(R, f), 'utf8');
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', n, d); } };

/* 1. plus d'ancienne interface mobile */
v('le dossier core/mobile n’existe plus', !fs.existsSync(path.join(R, 'core/mobile')));
const fichiers = []; (function parcourir(d) { for (const e of fs.readdirSync(path.join(R, d), { withFileTypes: true })) { const p = d + '/' + e.name; if (e.isDirectory()) { if (!/node_modules|vendor|assets-lourds|^idees|captures|backups|dist|docs|worker/.test(p) && !/^\.\/?(idees|dist)/.test(p)) parcourir(p); } else if (/\.(js|css|html|json|webmanifest)$/.test(e.name) && !/\.sceau\.json$/.test(e.name)) fichiers.push(p); } })('.');
const anciens = /core\/mobile\/|mobile-coque|mobile-accueil|mobile-actus|mobile-marche|mobile-plus|mobile-maj|\bm-coque\b|rayle_m_sw|MobileCoque|mobile\.css/;
const trouves = fichiers.filter(f => !/galaxie\/tests\/mobile-unifie-test|tests-navigateur\/|outils-restructuration\//.test(f) && anciens.test(lire(f)));
v('aucune référence à l’ancienne coque mobile dans le code, les styles et les pages', trouves.length === 0, trouves.join(', '));
const idx = lire('index.html');
v('index.html : une seule application (carrousel), aucun script ni style mobile séparé', !/mobile/i.test(idx.replace(/appareil-mobile|apple-mobile-web-app|mobile-web-app|panneaux-mobiles/gi, '')), (idx.match(/[^"'\s]*mobile[^"'\s]*/gi) || []).join(' '));

/* 2. versions et manifest */
const sw = lire('sw.js'), vSw = /const VERSION = '([^']+)'/.exec(sw)[1], vIdx = /RAYLE_VERSION='([^']+)'/.exec(idx)[1];
v('version du service worker = version de la page', vSw === vIdx && vSw >= '2026.11.12', vSw + ' / ' + vIdx);
const man = JSON.parse(lire('manifest.webmanifest'));
v('manifest : fond et couleur Jarvis or sombre', man.theme_color === '#080503' && man.background_color === '#080503');
v('manifest : icônes présentes', man.icons.length >= 2 && man.icons.every(i => fs.existsSync(path.join(R, i.src))));
v('favicon aux couleurs or (plus de cyan ni de rose)', /#ffae3d/i.test(lire('favicon.svg')) && !/#4de3ff/i.test(lire('favicon.svg')));

/* 3. service worker : une ancienne version en cache est remplacée */
{
  const journal = { supprimes: [], skip: 0, claim: 0 }, caches = new Map(['rayle-shell-2026.11.03.3', 'rayle-m-donnees-1', 'rayle-shell-' + vSw, 'rayle-images-1'].map(k => [k, {}]));
  const ecouteurs = {}, self_ = { addEventListener: (t, f) => { ecouteurs[t] = f; }, skipWaiting: () => { journal.skip++; return Promise.resolve(); }, clients: { claim: () => { journal.claim++; return Promise.resolve(); } }, location: { origin: 'http://x' } };
  const cachesApi = { keys: async () => [...caches.keys()], delete: async k => { journal.supprimes.push(k); caches.delete(k); return true; }, open: async () => ({ add: async () => {}, put: async () => {}, match: async () => undefined, keys: async () => [] }) };
  vm.runInNewContext(sw, { self: self_, caches: cachesApi, fetch: async () => ({}), Request: class { constructor(u) { this.url = u; } }, URL, Response: class {}, console, Promise, setTimeout });
  let attente; ecouteurs.install({ waitUntil: p => { attente = p; } }); await attente;
  v('installation : skipWaiting appelé (la nouvelle version prend la main)', journal.skip >= 1);
  ecouteurs.activate({ waitUntil: p => { attente = p; } }); await attente;
  v('activation : l’ancien cache de la coque mobile et tout cache inconnu sont supprimés', journal.supprimes.includes('rayle-shell-2026.11.03.3') && journal.supprimes.includes('rayle-m-donnees-1') && !journal.supprimes.includes('rayle-shell-' + vSw) && !journal.supprimes.includes('rayle-images-1'), journal.supprimes.join(','));
  v('activation : clients.claim', journal.claim === 1);
  v('réseau d’abord pour les fichiers du site', /async function reseauDAbord/.test(sw) && /fetch\(req, \{ cache: 'no-cache' \}\)/.test(sw));
}

/* 4. serveur : réseau local fermé par défaut, ouvert avec --reseau ; page « Connecter le téléphone » + QR */
const get = (port, chemin) => new Promise(res => http.get({ host: '127.0.0.1', port, path: chemin }, r => { let t = ''; r.on('data', c => t += c); r.on('end', () => res({ s: r.statusCode, t })); }).on('error', e => res({ s: 0, t: String(e) })));
const attendre = ms => new Promise(r => setTimeout(r, ms));
async function essai(port, args) {
  const p = spawn(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', path.join(R, 'serveur.mjs'), String(port), ...args], { cwd: R, stdio: 'ignore' });
  try { for (let k = 0; k < 40; k++) { await attendre(250); const r = await get(port, '/__reseau'); if (r.s) return { r, page: await get(port, '/connecter-telephone.html'), interdit: await get(port, '/backups/x'), manif: await get(port, '/manifest.webmanifest') }; } return null; } finally { p.kill(); }
}
const ferme = await essai(8127, []), ouvert = await essai(8128, ['--reseau']);
v('serveur par défaut : réseau local fermé', ferme && JSON.parse(ferme.r.t).reseau === false && JSON.parse(ferme.r.t).adresses.length === 0);
const jo = ouvert && JSON.parse(ouvert.r.t);
v('serveur --reseau : annonce l’adresse du PC (réseau privé) et son port', jo && jo.reseau === true && jo.port === 8128 && jo.adresses.every(a => /^http:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(a)), JSON.stringify(jo));
v('page « Connecter le téléphone » servie avec le QR', ouvert && ouvert.page.s === 200 && /qr-matrice\.js/.test(ouvert.page.t) && /Connecter le téléphone/.test(ouvert.page.t));
v('dossier de sauvegardes jamais servi', ouvert && ouvert.interdit.s === 403);
const { matriceQR } = createRequire(import.meta.url)('../../core/commun/qr-matrice.js');
const m = matriceQR('http://192.168.1.20:8000'); v('QR de l’adresse du PC généré', Array.isArray(m) && m.length >= 21 && m.length === m[0].length);

/* 5. le front n'utilise jamais localhost depuis un téléphone */
const cfg = lire('config.js'); v('config.js : sur le réseau local l’adresse du backend est celle de la page (pas localhost)', /workerUrl: local \? location\.origin : distant/.test(cfg));
const liaison = lire('core/commun/liaison-serveur.js'); v('message « Serveur injoignable » (jamais « copie ancienne »)', /Serveur injoignable/.test(liaison) && !/Copie ancienne/i.test(liaison) && /localhost\) n’existe pas depuis un téléphone/.test(liaison));
console.log(`${ok} OK, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
