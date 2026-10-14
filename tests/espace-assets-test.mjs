// Fond « Espace » : fichiers, ordre de chargement, images fixes du mode Éco, poids des ajouts, service worker.   node tests/espace-assets-test.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const lire = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const taille = f => fs.statSync(new URL('../' + f, import.meta.url)).size;
let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.message); process.exitCode = 1; } };

const html = lire('index.html');
const ordre = [...html.matchAll(/<script src="((?:ui|js)\/[^"?]+)/g)].map(m => m[1]);
const pos = f => { const i = ordre.indexOf(f); assert.ok(i >= 0, f + ' absent de index.html'); return i; };

t('scripts de l’Espace chargés dans le bon ordre (astro → cadrage → réglages → ambiance → fonds → espace → fond-espace → orchestrateur → réglages Espace)', () => {
  assert.ok(pos('ui/astro.js') < pos('ui/cadrage.js') && pos('ui/cadrage.js') < pos('ui/settings.js'));
  assert.ok(pos('ui/settings.js') < pos('ui/ambiance.js') && pos('ui/ambiance.js') < pos('ui/ambiance-reglages.js'));
  assert.ok(pos('ui/fond-globe.js') < pos('ui/espace.js') && pos('ui/espace.js') < pos('ui/espace-textures.js') && pos('ui/espace-textures.js') < pos('ui/fond-espace.js'));
  assert.ok(pos('ui/fond-espace.js') < pos('ui/background.js'), 'le fond Espace est prêt avant l’orchestrateur');
  assert.ok(pos('ui/ambiance-reglages.js') < pos('ui/espace-reglages.js'), 'la section Espace vient après la section Ambiance');
  assert.ok(pos('ui/espace.js') < pos('ui/espace-reglages.js'), 'la section Espace a besoin de RayleUI.espace');
  for (const f of ordre.filter(x => x.startsWith('ui/'))) assert.ok(fs.existsSync(new URL('../' + f, import.meta.url)), f + ' introuvable');
});
t('toutes les balises <script> et <link> de l’interface portent la même version', () => {
  const versions = new Set([...html.matchAll(/(?:ui|js|css)\/[^"?]+\?v=([\w.-]+)/g)].map(m => m[1]));
  assert.equal(versions.size, 1, [...versions].join(' / '));
  assert.ok(html.includes("RAYLE_VERSION='" + [...versions][0] + "'"));
});
t('images fixes du mode Éco : ciel en portrait et en paysage + Terre pré-rendue, tous présents et légers', () => {
  const fond = lire('ui/background.js');
  for (const f of ['fond-espace-paysage.webp', 'fond-espace-portrait.webp', 'fond-globe-planete.webp']) {
    assert.ok(fs.existsSync(new URL('../ui/assets/' + f, import.meta.url)), f + ' manquant');
    assert.ok(fond.includes(f.replace('fond-espace-paysage.webp', 'fond-espace-').replace('fond-espace-portrait.webp', 'fond-espace-')) || f.includes('planete'), f + ' non référencé');
    assert.ok(taille('ui/assets/' + f) < 400 * 1024, f + ' trop lourd : ' + taille('ui/assets/' + f));
  }
  assert.match(fond, /innerHeight>innerWidth\?'portrait':'paysage'/, 'version selon l’orientation');
  const ajouts = ['fond-espace-paysage.webp', 'fond-espace-portrait.webp', 'fond-globe-planete.webp'].reduce((s, f) => s + taille('ui/assets/' + f), 0);
  assert.ok(ajouts < 4 * 1024 * 1024, 'poids total des ajouts : ' + ajouts);
  assert.ok(!fs.existsSync(new URL('../ui/assets/fond-etoiles.webp', import.meta.url)), 'l’ancienne tuile d’étoiles n’est plus utilisée : supprimée');
});
t('textures de secours dessinées par le code, et fond-espace.js ne nomme aucune image (les vraies textures passent par ui/espace-astres.js)', () => {
  const tex = lire('ui/espace-textures.js');
  assert.match(tex, /function lune\(/); assert.match(tex, /function planete\(/); assert.match(tex, /function ciel\(/); assert.match(tex, /function anneaux\(/);
  assert.ok(!/\.(?:jpg|png|webp|mp4)['"]/.test(lire('ui/fond-espace.js')), 'fond-espace.js ne charge aucune image');
});
t('service worker : l’image fixe de l’Espace est mise de côté pour le hors ligne', () => {
  const sw = lire('sw.js');
  for (const f of ['fond-espace-paysage.webp', 'fond-espace-portrait.webp', 'fond-globe-planete.webp']) assert.ok(sw.includes(f), f);
  assert.ok(!sw.includes('fond-etoiles'));
});
t('réglages : le fond s’appelle « Espace » (l’ancien « globe » enregistré est migré) et la Terre de la page Monde reste inchangée', () => {
  const s = lire('ui/settings.js');
  assert.match(s, /espace:'Espace'/); assert.ok(!/globe:'Globe'/.test(s)); assert.match(s, /f==='globe' \? 'espace'/);
  const g = lire('ui/fond-globe.js');
  assert.match(g, /UI\.fondsReels\.espace=/); assert.match(g, /UI\.fondsReels\.globe=async function/); assert.match(g, /interactif/, 'mode interactif de la page Monde conservé');
});
t('crédits : les nouveaux assets sont déclarés', () => {
  const c = lire('ui/assets/CREDITS.txt');
  assert.match(c, /fond-espace-paysage\.webp/); assert.match(c, /fond-espace-portrait\.webp/); assert.match(c, /fond-globe-planete\.webp/);
  assert.match(c, /Schlyter|éléments orbitaux/i);
});
t('l’orchestrateur ne casse rien : mêmes fonds d’avant, mêmes paliers', () => {
  const b = lire('ui/background.js');
  assert.match(b, /jarvis/); assert.match(b, /video/); assert.match(b, /UI\.fondsReels\[fond\]\(c,\{q,hd(?:,ultra)?\}\)/); assert.match(b, /palier>=2\?'fixe':'3d'/);
});
t('modèles NASA : manifeste, fichiers GLB (meshopt), poids raisonnable pour une tablette, crédits et licence citées', () => {
  const m = JSON.parse(lire('ui/assets/espace/modeles/manifest.json')), cred = lire('CREDITS.md'), tout = lire('ui/assets/CREDITS.txt');
  assert.deepEqual(Object.keys(m).sort(), ['iss', 'perseverance']);
  for (const [cle, fic] of Object.entries(m)) {
    assert.ok(/^[\w.-]+\.glb$/.test(fic), 'nom de fichier : ' + fic);
    const buf = fs.readFileSync(new URL('../ui/assets/espace/modeles/' + fic, import.meta.url)), lj = buf.readUInt32LE(12), j = JSON.parse(buf.subarray(20, 20 + lj).toString('utf8'));
    assert.equal(buf.toString('latin1', 0, 4), 'glTF'); assert.ok(buf.length < 2 * 1024 * 1024, cle + ' : ' + buf.length + ' octets');
    assert.ok(j.extensionsRequired.includes('EXT_meshopt_compression'), cle + ' : maillages compressés');
    assert.ok(!(j.animations || []).length, cle + ' : animations retirées');
    assert.ok(!(j.extensionsUsed || []).some(e => /transmission|draco/i.test(e)), cle + ' : extensions coûteuses retirées');
  }
  assert.match(cred, /NASA-3D-Resources/); assert.match(cred, /Curiosity/); assert.match(tout, /NASA 3D Resources/);
  assert.match(lire('ui/espace-extras.js'), /meshopt_decoder/);
});
t('carte du ciel réelle : 2k et 4k présentes, légères, crédit CC BY 4.0 (Solar System Scope) ; le repli dessiné par le code reste', () => {
  for (const r of ['2k', '4k']) assert.ok(taille('ui/assets/espace/ciel-' + r + '.webp') > 10000 && taille('ui/assets/espace/ciel-' + r + '.webp') < 1.5 * 1024 * 1024, r);
  assert.match(lire('CREDITS.md'), /ciel-2k\.webp[\s\S]*CC BY 4\.0/); assert.match(lire('ui/assets/CREDITS.txt'), /ciel-4k\.webp/);
  const fe = lire('ui/fond-espace.js'); assert.match(fe, /u_real/); assert.match(fe, /TEX\.ciel\(/);
});
t('poids total des fichiers ajoutés : aucun fichier de plus de 25 Mo dans le dépôt (GitHub Pages)', () => {
  const marche = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === '.git' || e.name === 'node_modules' ? [] : e.isDirectory() ? marche(d + '/' + e.name) : [[d + '/' + e.name, fs.statSync(d + '/' + e.name).size]]);
  const gros = marche(new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\/$/, '')).filter(([, n]) => n > 25 * 1024 * 1024);
  assert.deepEqual(gros, [], 'fichiers > 25 Mo : ' + gros.map(g => g[0]).join(', '));
});
console.log(ok + ' tests réussis');
