// Astres réalistes du fond « Espace » : textures réelles (poids, tailles, crédits, cache), table des planètes, chargeur, paliers, vol, images fixes Éco.   node tests/espace-astres-test.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const racine = new URL('../', import.meta.url);
const lire = f => fs.readFileSync(new URL(f, racine), 'utf8');
const taille = f => fs.statSync(new URL(f, racine)).size;
let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.message); process.exitCode = 1; } };

// espace-astres.js sous node : window et document factices
globalThis.window = globalThis; globalThis.document = { baseURI: 'http://rayle.test/' };
await import(new URL('ui/espace-astres.js', racine));
const AST = window.RayleUI.espaceAstres;

const CORPS = ['lune', 'mercure', 'venus', 'mars', 'jupiter', 'saturne', 'uranus', 'neptune'];

await t('textures réelles : 1k et 2k pour la Lune et les 7 planètes, anneaux, relief et océans de la Terre — tous présents, WebP', () => {
  for (const n of CORPS) for (const r of ['1k', '2k']) {
    const f = `ui/assets/espace/${n}-${r}.webp`; assert.ok(fs.existsSync(new URL(f, racine)), f + ' manquant');
    assert.equal(lire(f).slice(0, 4), 'RIFF'); assert.ok(taille(f) > 1000, f + ' vide');
  }
  for (const f of ['saturne-anneaux', 'terre-relief-2k', 'terre-ocean-1k']) assert.ok(fs.existsSync(new URL(`ui/assets/espace/${f}.webp`, racine)), f);
});
await t('poids : tout ui/assets/espace pèse au plus 6 Mo, et le palier par défaut (1k) reste léger', () => {
  const tous = fs.readdirSync(new URL('ui/assets/espace/', racine)).map(f => taille('ui/assets/espace/' + f));
  const total = tous.reduce((a, b) => a + b, 0);
  assert.ok(total <= 6 * 1024 * 1024, 'total ' + total);
  const un = CORPS.reduce((s, n) => s + taille(`ui/assets/espace/${n}-1k.webp`), 0);
  assert.ok(un < 1.2 * 1024 * 1024, '1k : ' + un);
  for (const n of CORPS) assert.ok(taille(`ui/assets/espace/${n}-2k.webp`) < 1.2 * 1024 * 1024, n + ' 2k trop lourd');
});
await t('dimensions des textures : 1024×512 (1k) et 2048×1024 (2k)', () => {
  const dim = f => { const b = fs.readFileSync(new URL(f, racine)); const k = b.toString('ascii', 12, 16);
    if (k === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (k === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (k === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; } throw new Error(k); };
  for (const n of CORPS) { assert.deepEqual(dim(`ui/assets/espace/${n}-1k.webp`), [1024, 512], n + ' 1k'); assert.deepEqual(dim(`ui/assets/espace/${n}-2k.webp`), [2048, 1024], n + ' 2k'); }
});
await t('crédits : Solar System Scope (CC BY 4.0), NASA, relief calculé, tout est déclaré', () => {
  const c = lire('ui/assets/CREDITS.txt');
  assert.match(c, /Solar System Scope/); assert.match(c, /CC BY 4\.0/); assert.match(c, /terre-relief-2k/); assert.match(c, /terre-ocean-1k/); assert.match(c, /saturne-anneaux/);
  assert.match(c, /NASA/); assert.match(c, /GEBCO|Topography/);
});
await t('service worker : textures en cache d’abord, dans un cache à part qui survit aux nouvelles versions', () => {
  const sw = lire('sw.js');
  assert.match(sw, /CACHE_TEX\s*=\s*'rayle-tex-/); assert.match(sw, /\/ui\/assets\/espace\//); assert.match(sw, /texturesCacheDabord/);
  assert.match(sw, /k\.startsWith\('rayle-tex-'\)/, 'l’activation ne supprime pas le cache des textures');
});
await t('index.html : espace-astres.js est chargé après espace-textures.js et avant fond-espace.js, même version', () => {
  const h = lire('index.html'), ordre = [...h.matchAll(/<script src="((?:ui|js)\/[^"?]+)/g)].map(m => m[1]);
  const p = f => { const i = ordre.indexOf(f); assert.ok(i >= 0, f); return i; };
  assert.ok(p('ui/espace-textures.js') < p('ui/espace-astres.js') && p('ui/espace-astres.js') < p('ui/fond-espace.js'));
  assert.equal(new Set([...h.matchAll(/(?:ui|js|css)\/[^"?]+\?v=([\w.-]+)/g)].map(m => m[1])).size, 1);
});

await t('table des planètes : pôles IAU, rotation rétrograde de Vénus et d’Uranus, anneaux de Saturne seulement, tailles et cadrages', () => {
  const P = AST.PLANETES; assert.deepEqual(Object.keys(P), ['mercure', 'venus', 'mars', 'jupiter', 'saturne', 'uranus', 'neptune']);
  for (const [n, d] of Object.entries(P)) {
    assert.ok(d.pole[0] >= 0 && d.pole[0] < 360 && Math.abs(d.pole[1]) <= 90, n + ' pôle');
    assert.ok(d.ang > 0 && d.cadre > 3 && d.couleur.length === 3, n);
    assert.ok(d.term[0] < d.term[1], n + ' terminateur');
  }
  assert.ok(P.venus.spin < 0 && P.uranus.spin < 0 && P.jupiter.spin > 0 && P.mars.spin > 0, 'sens de rotation');
  assert.ok(Math.abs(P.jupiter.spin) > 800 && Math.abs(P.jupiter.spin) < 900, 'Jupiter ≈ 9,9 h');
  assert.ok(Math.abs(P.mars.spin - 350.89) < 1, 'Mars ≈ 24,6 h');
  assert.deepEqual(Object.keys(P).filter(n => P[n].anneaux), ['saturne']);
  assert.ok(P.venus.anim === 1 && P.jupiter.anim === 2 && P.saturne.anim === 3, 'animations : nuages de Vénus, bandes de Jupiter, Saturne');
  assert.ok(P.mercure.bump > 0 && P.mars.bump > 0 && !P.jupiter.bump, 'relief : Mercure et Mars, pas les géantes');
  assert.ok(P.venus.atmo && P.mars.atmo && P.jupiter.atmo && !P.mercure.atmo, 'atmosphères');
  assert.ok(AST.RING.in > 1 && AST.RING.out > AST.RING.in && AST.GAIN_LUNE > 1);
});
await t('anneaux : les bornes du code et celles de la texture dessinée de secours sont les mêmes', () => {
  const tex = lire('ui/espace-textures.js'); assert.ok(tex.includes('r=' + AST.RING.in + '+t*(' + AST.RING.out + '-' + AST.RING.in + ')'));
});

await t('chargeur : 1k par défaut, 2k à la demande, cache, libération, échec propre (hors ligne)', async () => {
  const charges = [], liberes = [];
  const THREE = { RepeatWrapping: 1, ClampToEdgeWrapping: 2, NoColorSpace: '', LinearFilter: 3,
    TextureLoader: class { load(url, ok, _p, ko) { charges.push(url); if (url.includes('introuvable')) ko(new Error('404')); else queueMicrotask(() => ok({ url, dispose() { liberes.push(url); } })); } } };
  const C = AST.chargeur(THREE);
  const a = await C.tex('mars', '1k'), b = await C.tex('mars', '1k');
  assert.equal(a, b, 'une seule texture pour deux demandes'); assert.equal(charges.length, 1);
  assert.match(charges[0], /^http:\/\/rayle\.test\/ui\/assets\/espace\/mars-1k\.webp$/);
  const c = await C.tex('mars', '2k'); assert.notEqual(c, a); assert.match(charges[1], /mars-2k\.webp$/);
  const r = await C.tex('saturne-anneaux', '', { lineaire: true }); assert.match(charges[2], /espace\/saturne-anneaux\.webp$/); assert.equal(r.generateMipmaps, false);
  C.liberer('mars', '2k'); assert.deepEqual(liberes, [charges[1]]); assert.ok(!C.tailles().includes('mars-2k'));
  await assert.rejects(C.tex('introuvable', '1k')); assert.ok(!C.tailles().includes('introuvable-1k'), 'un échec ne reste pas en cache');
  C.toutLiberer(); assert.equal(C.tailles().length, 0); assert.equal(liberes.length, 3);
});

await t('shaders : relief, atmosphère, terminateur doux, nuages de Vénus, bandes de Jupiter, ombre des anneaux, Soleil (granulation, couronne, éruptions), Terre (océans, ombre des nuages)', () => {
  for (const s of ['VS_CORPS', 'FS_CORPS', 'FS_LUEUR', 'FS_ANNEAU', 'VS_SOLEIL', 'FS_SOLEIL', 'FS_TERRE', 'FS_NUAGES', 'FS_ATMO']) assert.ok(typeof AST[s] === 'string' && AST[s].includes('void main'), s);
  const c = AST.FS_CORPS;
  for (const m of [/u_bump/, /u_atmoK/, /smoothstep\(u_term\.x,u_term\.y/, /u_anim/, /u_ringOn/, /u_shine/, /u_gain/, /u_limb/, /0\.371,0\.391/]) assert.match(c, m);
  assert.match(AST.FS_ANNEAU, /smoothstep\(u_R\*0\.965/, 'ombre de la planète adoucie sur les anneaux');
  assert.match(AST.FS_SOLEIL, /vn3\(/); assert.match(AST.FS_SOLEIL, /protubérance|éruptions/); assert.match(AST.FS_SOLEIL, /jamais aveuglant/);
  assert.match(AST.FS_TERRE, /u_relief/); assert.match(AST.FS_TERRE, /u_ocean/); assert.match(AST.FS_TERRE, /ombre portée des nuages/);
  assert.match(AST.FS_ATMO, /fin=pow/, 'liseré brillant au bord');
});

await t('fond-espace.js : paliers (q0 complet · q1 1k sans relief · q2 couleurs simples), 2k pour l’astre visité, Auto inchangé', () => {
  const f = lire('ui/fond-espace.js');
  assert.match(f, /q>=2\)\{ videCorps\(c\)/, 'q2 : plus aucune texture');
  assert.match(f, /\(q===0&&c\.bumpK&&u\.u_hasMap\.value>\.5\)\?c\.bumpK\*w\/2048:0/, 'relief seulement au palier 0');
  assert.match(f, /capable2k=\(\)=>q===0&&!mobile/); assert.match(f, /\(capable2k\(\)&&c\.nom===cible\)\?'2k':'1k'/);
  assert.match(f, /etape\(el\.planetes,'planetes',etapePlanetes\)/, 'planètes aussi au palier 2 (sphères de couleur)');
  assert.match(f, /terreRes/); assert.match(f, /CH\.toutLiberer\(\)/);
  assert.ok(!/\.(?:jpg|png|webp|mp4)['"]/.test(f), 'fond-espace.js ne nomme aucune image : tout passe par le chargeur');
  assert.match(lire('ui/background.js'), /if\(ema>40 && q<2\)/, 'dégradation automatique conservée');
});
await t('fond-espace.js : Lune (libration, lueur cendrée, phase réelle), planètes (pôles réels, vitesses crédibles), lunes de Jupiter et Titan, Soleil animé', () => {
  const f = lire('ui/fond-espace.js');
  assert.match(f, /7\.9\*RAD\*Math\.sin/); assert.match(f, /6\.7\*RAD\*Math\.sin/); assert.match(f, /u_shine/); assert.match(f, /A\.lune\(now\)\.eclairee/);
  assert.match(f, /setFromUnitVectors\(V3\(0,1,0\),p0\)/); assert.match(f, /spinRad:d\.spin\*RAD\*AST\.TEMPS_ACCELERE\/86400/);
  for (const n of ['Io', 'Europe', 'Ganymède', 'Callisto', 'Titan']) assert.ok(f.includes("'" + n + "'"), n);
  assert.match(f, /distS|s\.dist\)\.addScaledVector\(o\.dir,-p\.dist\)/, 'lumière : direction héliocentrique réelle'); assert.match(f, /EXT_SOLEIL/); assert.match(f, /matSoleil/);
  assert.match(lire('ui/espace-textures.js'), /function satellite\(/);
});
await t('vol cinématique : trajectoire en arc, arrivée douce, dérive autour de l’astre, retour seul sur la Terre', () => {
  const f = lire('ui/fond-espace.js');
  assert.match(f, /douce=t=>t\*t\*t\*\(t\*\(t\*6-15\)\+10\)/); assert.match(f, /Math\.sin\(Math\.PI\*e\)\*seg\.length\(\)/); assert.match(f, /applyAxisAngle\(up,\.42\*Math\.sin\(arrivee/);
  assert.match(f, /arrivee>DUREE_VISITE&&cible!==\(ESP\.accueil&&ESP\.accueil\(\)\)\) retour\(\)/); assert.match(f, /DUREE_VISITE=24/);
  const e = lire('ui/espace.js'); assert.match(e, /'Direction '\)\+nomCible\(a\.cible\)\+'\. '\+fi\.parle/, 'Raylé annonce l’astre et dit ses faits');
});
await t('images fixes Éco : portrait 1080×1920, paysage 1920×1080, Terre 1024×1024 transparente, toutes légères', () => {
  const dim = f => { const b = fs.readFileSync(new URL('ui/assets/' + f, racine)); const k = b.toString('ascii', 12, 16);
    if (k === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3), alpha: !!(b[20] & 0x10) };
    if (k === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, alpha: false };
    throw new Error(f + ' ' + k); };
  assert.deepEqual([dim('fond-espace-paysage.webp').w, dim('fond-espace-paysage.webp').h], [1920, 1080]);
  assert.deepEqual([dim('fond-espace-portrait.webp').w, dim('fond-espace-portrait.webp').h], [1080, 1920]);
  const p = dim('fond-globe-planete.webp'); assert.deepEqual([p.w, p.h, p.alpha], [1024, 1024, true]);
  for (const f of ['fond-espace-paysage.webp', 'fond-espace-portrait.webp', 'fond-globe-planete.webp']) assert.ok(taille('ui/assets/' + f) < 400 * 1024, f);
});
await t('atmosphère à diffusion de Rayleigh : shader, coefficients ∝ 1/λ⁴ pour la Terre, une entrée par atmosphère', () => {
  assert.match(AST.FS_RAYLEIGH, /RAY_PAS/); assert.ok(AST.FS_RAYLEIGH.includes('exp(-(u_beta')); assert.ok(AST.VS_RAYLEIGH.includes('modelMatrix[3]'));
  const b = AST.ATMO_RAYLEIGH.terre.beta;
  assert.ok(b[2] > b[1] && b[1] > b[0], 'le bleu est diffusé plus que le vert, plus que le rouge');
  const rapport = b[2] / b[0]; assert.ok(rapport > 4.5 && rapport < 7, 'rapport bleu / rouge réel ≈ 5,7 : ' + rapport.toFixed(2));
  for (const n of ['terre', 'venus', 'mars', 'jupiter', 'saturne', 'uranus', 'neptune']) { const a = AST.ATMO_RAYLEIGH[n]; assert.ok(a && a.beta.length === 3 && a.beta.every(x => x > 0) && a.ratio > 1 && a.H > 0, n); }
});
await t('cirrus et rochers instanciés : shaders présents, fabriques exportées', () => {
  assert.match(AST.FS_CIRRUS, /u_nuages/); assert.equal(typeof AST.rocheInstancee, 'function'); assert.equal(typeof AST.rayleigh, 'function');
});
await t('lunes : chaque lune du fond a sa texture dessinée (couleurs réelles)', () => {
  const src = lire('ui/fond-espace.js'), tex = lire('ui/espace-textures.js');
  const bloc = src.slice(src.indexOf('const LUNES={'), src.indexOf('};', src.indexOf('const LUNES={')));
  const noms = [...bloc.matchAll(/\['([^']+)',[\d.]+,/g)].map(m => m[1]);
  assert.ok(noms.length >= 16, 'lunes : ' + noms.join(', '));
  for (const n of noms) assert.ok(tex.includes("'" + n + "':") || tex.includes('    ' + n + ':'), 'texture manquante : ' + n);
  for (const n of ['Phobos', 'Deimos', 'Titan', 'Encelade', 'Triton']) assert.ok(noms.includes(n), n);
  assert.ok(bloc.includes("'Triton',5.5,.04,[.88,.81,.77],-5.876854"), 'Triton est rétrograde (période négative)');
});
console.log(ok + ' tests réussis');
