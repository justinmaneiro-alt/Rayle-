// Fond « Univers » : fichiers, ordre de chargement, images fixes du mode Éco, poids des ajouts, service worker.   node tests/espace-assets-test.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const lire = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const taille = f => fs.statSync(new URL('../' + f, import.meta.url)).size;
let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.message); process.exitCode = 1; } };

const html = lire('index.html');
const ordre = [...html.matchAll(/<script src="((?:ui|js)\/[^"?]+)/g)].map(m => m[1]);
const pos = f => { const i = ordre.indexOf(f); assert.ok(i >= 0, f + ' absent de index.html'); return i; };

t('scripts de l’Espace chargés dans le bon ordre (astro → cadrage → réglages → ambiance → fonds → espace → orchestrateur) ; l’ancien fond (astéroïdes, planètes dessinées) n’existe plus', () => {
  assert.ok(pos('ui/astro.js') < pos('ui/cadrage.js') && pos('ui/cadrage.js') < pos('ui/settings.js'));
  assert.ok(pos('ui/settings.js') < pos('ui/ambiance.js') && pos('ui/ambiance.js') < pos('ui/ambiance-reglages.js'));
  assert.ok(pos('ui/fond-globe.js') < pos('ui/espace.js') && pos('ui/espace.js') < pos('ui/background.js'), 'RayleUI.espace est prêt avant l’orchestrateur');
  assert.ok(pos('js/rayle/commandes-univers.js') < pos('ui/background.js'), 'RayleUnivers (le fond Univers) est prêt avant l’orchestrateur');
  for (const f of ordre.filter(x => x.startsWith('ui/'))) assert.ok(fs.existsSync(new URL('../' + f, import.meta.url)), f + ' introuvable');
  for (const f of ['fond-espace', 'espace-astres', 'espace-textures', 'espace-extras', 'espace-terre-3d', 'espace-reglages']) { assert.ok(!fs.existsSync(new URL('../ui/' + f + '.js', import.meta.url)), f + '.js devrait être supprimé'); assert.ok(!html.includes(f + '.js'), f + '.js encore dans index.html'); }
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
t('l’ancien fond n’a laissé aucune trace : plus d’astéroïdes dessinés dans ui/, plus de UI.espaceMonter', () => {
  for (const f of fs.readdirSync(new URL('../ui/', import.meta.url)).filter(x => x.endsWith('.js'))) { const c = lire('ui/' + f).replace(/\/\*[\s\S]*?\*\//g, ''); assert.ok(!/espaceMonter|espaceAstres|espaceTex\b|espaceExtras|espaceTerre3D/.test(c), f + ' référence l’ancien fond'); }
  assert.ok(!/fondsReels\.espace\b(?!Cadrage)/.test(lire('ui/background.js')), 'background.js ne demande plus de scène à fondsReels.espace');
});
t('service worker : l’image fixe de l’Espace est mise de côté pour le hors ligne', () => {
  const sw = lire('sw.js');
  for (const f of ['fond-espace-paysage.webp', 'fond-espace-portrait.webp', 'fond-globe-planete.webp']) assert.ok(sw.includes(f), f);
  assert.ok(!sw.includes('fond-etoiles'));
});
t('réglages : le fond s’appelle « Univers » (l’ancien « globe » enregistré est migré) et la Terre de la page Monde reste inchangée', () => {
  const s = lire('ui/settings.js');
  assert.match(s, /espace:'Univers'/); assert.ok(!/globe:'Globe'/.test(s)); assert.match(s, /f==='globe' \? 'espace'/);
  const g = lire('ui/fond-globe.js');
  assert.ok(!/UI\.fondsReels\.espace=/.test(g), 'plus de fond « espace » dans fond-globe.js'); assert.match(g, /UI\.fondsReels\.globe=async function/); assert.match(g, /interactif/, 'mode interactif de la page Monde conservé');
});
t('crédits : les nouveaux assets sont déclarés', () => {
  const c = lire('ui/assets/CREDITS.txt');
  assert.match(c, /fond-espace-paysage\.webp/); assert.match(c, /fond-espace-portrait\.webp/); assert.match(c, /fond-globe-planete\.webp/);
  assert.match(c, /Schlyter|éléments orbitaux/i);
});
t('l’orchestrateur : le fond Univers est la scène 3D du bouton Univers (mode « fond »), Jarvis garde son canvas, l’Éco reste une image fixe', () => {
  const b = lire('ui/background.js');
  assert.match(b, /jarvis/); assert.ok(!/video/.test(b), 'plus de fond vidéo'); assert.match(b, /UI\.fondsReels\[fond\]\(c,\{q,hd(?:,ultra)?\}\)/); assert.match(b, /palier>=2\?'fixe':'3d'/);
  assert.match(b, /RayleUnivers\.fond\(true\)/, 'le fond Univers demande la scène au noyau'); assert.match(b, /RayleUnivers\.fond\(false\)/, 'et la rend en changeant de fond');
  assert.match(b, /montrerFixe\(fond\)/, 'repli : image fixe si three.js ou WebGL manque');
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
  assert.match(lire('js/univers/espace/mars/rover.js'), /meshopt/i);
});
t('carte du ciel réelle : 2k et 4k présentes, légères, crédit CC BY 4.0 (Solar System Scope) ; le repli dessiné par le code reste', () => {
  for (const r of ['2k', '4k']) assert.ok(taille('ui/assets/espace/ciel-' + r + '.webp') > 10000 && taille('ui/assets/espace/ciel-' + r + '.webp') < 1.5 * 1024 * 1024, r);
  assert.match(lire('CREDITS.md'), /ciel-2k\.webp[\s\S]*CC BY 4\.0/); assert.match(lire('ui/assets/CREDITS.txt'), /ciel-4k\.webp/);
  assert.match(lire('js/univers/espace/ciel.js'), /espace\/ciel-4k\.webp/);
});
t('poids total des fichiers ajoutés : aucun fichier de plus de 25 Mo dans le dépôt (GitHub Pages)', () => {
  const marche = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === '.git' || e.name === 'node_modules' ? [] : e.isDirectory() ? marche(d + '/' + e.name) : [[d + '/' + e.name, fs.statSync(d + '/' + e.name).size]]);
  const gros = marche(new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\/$/, '')).filter(([, n]) => n > 25 * 1024 * 1024);
  assert.deepEqual(gros, [], 'fichiers > 25 Mo : ' + gros.map(g => g[0]).join(', '));
});
console.log(ok + ' tests réussis');
