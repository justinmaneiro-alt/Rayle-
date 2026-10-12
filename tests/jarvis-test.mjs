// Fond « Jarvis » (interface holographique) : suppression de la Ville 3D, réglage, commandes vocales, Worker, disposition responsive, paliers, images fixes Éco.   node tests/jarvis-test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const racine = new URL('../', import.meta.url);
const lire = f => fs.readFileSync(new URL(f, racine), 'utf8');
const existe = f => fs.existsSync(new URL(f, racine));
const taille = f => fs.statSync(new URL(f, racine)).size;
let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.message); process.exitCode = 1; } };

await t('la Ville 3D est supprimée : fichier, image fixe et toute référence ; la Ville réelle (vidéo) reste', () => {
  assert.ok(!existe('ui/fond-ville3d.js') && !existe('ui/assets/fond-ville3d-fixe.jpg'));
  for (const f of ['index.html', 'ui/settings.js', 'ui/background.js', 'ui/ambiance.js', 'ui/fond-jarvis.js', 'sw.js', 'ui/assets/CREDITS.txt'])
    assert.ok(!/ville3d|fond-ville3d/i.test(lire(f).replace(/(?:f|a.fond)==='ville3d'/g, '')), f + ' mentionne encore la Ville 3D');
  assert.ok(existe('ui/fond-video.js') && existe('ui/assets/ville-paysage.mp4') && existe('ui/assets/ville-portrait.mp4'));
  assert.match(lire('ui/settings.js'), /video:'Ville réelle'/);
});
await t('index.html : fond-jarvis.js chargé après fond-globe.js et avant background.js, même version que le reste', () => {
  const h = lire('index.html'), ordre = [...h.matchAll(/<script src="((?:ui|js)\/[^"?]+)/g)].map(m => m[1]);
  const p = f => { const i = ordre.indexOf(f); assert.ok(i >= 0, f); return i; };
  assert.ok(p('ui/fond-globe.js') < p('ui/fond-jarvis.js') && p('ui/fond-jarvis.js') < p('ui/background.js'));
  assert.equal(new Set([...h.matchAll(/(?:ui|js|css)\/[^"?]+\?v=([\w.-]+)/g)].map(m => m[1])).size, 1);
});
await t('réglage « Jarvis » : fonds proposés, ancien « ville3d » enregistré migré, défaut = Jarvis', () => {
  const s = lire('ui/settings.js');
  assert.match(s, /FONDS=\{aucun:'Aucun',espace:'Espace',jarvis:'Jarvis',video:'Ville réelle'\}/);
  assert.match(s, /f==='ville3d'\)\s*\?\s*'jarvis'/); assert.match(s, /\(mobile\?'aucun':'jarvis'\)/);
});
await t('Worker et agent : le fond « jarvis » est connu (l’IA peut le choisir), « ville3d » n’existe plus', () => {
  const a = lire('ui/ambiance.js'); assert.match(a, /\['aucun','espace','jarvis','video'\]\.includes\(a\.fond\)/); assert.match(a, /a\.fond==='ville3d'\) a\.fond='jarvis'/);
  if (existe('worker/worker.js')) {                                  // le Worker n'est pas versionné : testé s'il est là
    const w = lire('worker/worker.js'); assert.match(w, /enum: \["aucun", "espace", "jarvis", "video"\]/); assert.ok(!/ville3d/.test(w)); assert.match(w, /jarvis\|holograph/);
  }
});
await t('orchestrateur : image fixe Jarvis portrait / paysage + cœur pré-rendu, Auto dégrade le fond, Éco = image', () => {
  const b = lire('ui/background.js');
  assert.match(b, /jarvis:\(\)=>'fond-jarvis-'\+\(innerHeight>innerWidth\?'portrait':'paysage'\)\+'\.webp'/); assert.match(b, /COEUR='fond-jarvis-coeur\.webp'/);
  assert.match(b, /jarvisNoyau/); assert.match(b, /palier>=2\?'fixe':'3d'/); assert.match(b, /if\(ema>40 && q<2\)/); assert.match(b, /UI\.fondsReels\[fond\]\(c,\{q,hd\}\)/);
});

// ───── fond-jarvis.js sous node (sans WebGL) : disposition pure ─────
const ctx = { console, Math, Date, setTimeout, clearTimeout }; ctx.window = ctx; ctx.document = { baseURI: 'http://x/' }; ctx.innerWidth = 1280; ctx.innerHeight = 720;
vm.createContext(ctx);
vm.runInContext(lire('ui/cadrage.js'), ctx);
vm.runInContext(lire('ui/fond-jarvis.js'), ctx);
const UI = ctx.RayleUI, agencer = UI.fondsReels.jarvisAgencer;
const entite = (W, H) => ({ cx: W / 2, cy: Math.round(H * (W / H < 1 ? .4 : .44)), r: Math.min(W, H) * .15 });
function mesure(W, H) { return { W, H, entite: entite(W, H), haut: 56, bas: H - (W < 520 ? 150 : 110), texteBas: H * .6, reserves: [], texte: null }; }
function noyau(m) { const z = UI.cadrage.disposer(Object.assign({}, m, { placement: 'centre', marge: Math.max(22, Math.round(Math.min(m.W, m.H) * .03) + 10) })).zone; return { cx: (z.x0 + z.x1) / 2, cy: (z.y0 + z.y1) / 2, R: (z.x1 - z.x0) / 2 * .99, marge: 32 }; }
const TAILLES = [[390, 844], [360, 640], [844, 390], [768, 1024], [1024, 768], [1280, 720], [1366, 768], [1920, 1080], [2560, 1080], [3440, 1440], [1080, 1920], [1280, 800]];

await t('disposition : sur 12 formats, rien ne recouvre le cercle du cœur, tout reste dans l’écran, au moins 2 éléments (hors phone paysage minuscule)', () => {
  for (const [W, H] of TAILLES) {
    const m = mesure(W, H), n = noyau(m), r = agencer(m, n);
    assert.ok(n.R >= 40, W + 'x' + H + ' cœur trop petit');
    assert.ok(n.cx - n.R >= 0 && n.cx + n.R <= W && n.cy - n.R >= 0 && n.cy + n.R <= H, W + 'x' + H + ' : cœur entier à l’écran');
    assert.ok(r.placement.length >= 2, W + 'x' + H + ' : ' + r.placement.length + ' éléments');
    for (const c of r.cellules) {
      const dx = Math.max(Math.abs(c.cx - n.cx) - c.c / 2, 0), dy = Math.max(Math.abs(c.cy - n.cy) - c.c / 2, 0);
      assert.ok(Math.hypot(dx, dy) >= n.R, W + 'x' + H + ' : une cellule mord sur le cœur');
      assert.ok(c.cx - c.c / 2 >= -1 && c.cx + c.c / 2 <= W + 1 && c.cy - c.c / 2 >= m.haut - 1 && c.cy + c.c / 2 <= m.bas + 1, W + 'x' + H + ' : cellule hors zone');
    }
    const noms = r.placement.map(p => p.nom); assert.equal(new Set(noms).size, noms.length, 'un élément n’est placé qu’une fois');
  }
});
await t('disposition : plus l’écran est grand, plus il y a d’éléments ; les widgets (texte) exigent une cellule lisible', () => {
  const nb = (W, H) => { const m = mesure(W, H); return agencer(m, noyau(m)).placement.length; };
  assert.ok(nb(1920, 1080) > nb(1280, 720) && nb(1280, 720) >= nb(390, 844), 'monotone');
  assert.ok(nb(1920, 1080) >= 5, '1080p : au moins 5 éléments');
  for (const [W, H] of TAILLES) { const m = mesure(W, H); for (const p of agencer(m, noyau(m)).placement) if (p.nom === 'horloge') assert.ok(p.c >= 190, 'horloge illisible ' + W + 'x' + H); else if (p.nom === 'marches') assert.ok(p.c >= 210); }
  const tel = mesure(390, 844), r = agencer(tel, noyau(tel)); assert.ok(!r.placement.some(p => p.nom === 'horloge' || p.nom === 'marches'), 'pas de widget de texte sur téléphone vertical');
});
await t('disposition : panneaux HUD ouverts à droite → les cellules de droite se réduisent ou disparaissent, sans chevaucher le panneau', () => {
  const m = mesure(1920, 1080); m.reserves = [{ x0: 1500, x1: 1900, y0: 80, y1: 900 }];
  const r = agencer(m, noyau(m)); for (const c of r.cellules) assert.ok(c.cx + c.c / 2 <= 1500 - 11 || c.cx - c.c / 2 >= 1900, 'cellule sur le panneau');
});
await t('tablette verticale : le cœur se réduit (76 %) pour laisser une rangée d’éléments ; sur téléphone, il garde toute la largeur', () => {
  assert.match(lire('ui/fond-jarvis.js'), /m\.W\/m\.H<\.9\) R\*=\.76/);
  // le vrai noyauEcran passe par UI.cadrage.mesurer (DOM) : on vérifie le principe sur le calcul pur
  const m = mesure(768, 1024), brut = noyau(m).R, r = agencer(m, Object.assign(noyau(m), { R: brut * .76 })); assert.ok(r.placement.length >= 2, 'rangée d’éléments sur tablette verticale');
});

await t('paliers : q0 tout · q1 sans halo et moins d’éléments · q2 anneaux + grille simples ; Auto/Éco gérés par background.js', () => {
  const j = lire('ui/fond-jarvis.js');
  assert.match(j, /u_glow\.value=q===0\?1:0/); assert.match(j, /u_det\.value=q<2\?1:0/); assert.match(j, /u_simple\.value=q===2\?1:0/);
  assert.match(j, /const sec=q===0\?1:q===1\?0:-1/, 'q2 : aucun hologramme'); assert.match(j, /particules\.visible=q<2/); assert.match(j, /const n=q===0\?30:q===1\?12:0/, 'circuits');
  assert.match(j, /if\(q===0\) for\(const r of reticules\)/, 'réticules : palier 0 seulement');
  assert.match(j, /\[Math\.min\(window\.devicePixelRatio\|\|1,1\.5\),\.9,\.65\]\[q\]/);
});
await t('réactions : parole (amplitude réelle), réflexion, écoute, veille ; ambiance : nuit/jour, pluie, neige, brouillard, orage', () => {
  const j = lire('ui/fond-jarvis.js');
  assert.match(j, /Entite\.info\(\)/); for (const e of ['veille', 'listening', 'thinking', 'speaking']) assert.ok(j.includes(e), e);
  assert.match(j, /u_amp/); assert.match(j, /u_think/); assert.match(j, /u_listen/);
  assert.match(j, /UI\.ambiance\.lisse/); for (const k of ['L.jour', 'L.pluie', 'L.neige', 'L.brouillard', 'L.orage']) assert.ok(j.includes(k), k);
  assert.match(j, /UI\.couleurs/, 'couleurs du thème actif, fondu inclus');
  assert.match(j, /_ouverte/, 'marchés ouverts / fermés : le calcul du globe');
});
await t('aucune marque : pas de nom, de logo ni de texte du film dans le fond', () => {
  const j = lire('ui/fond-jarvis.js').toLowerCase(); for (const mot of ['stark', 'iron man', 'j.a.r.v.i.s', 'marvel', 'avengers']) assert.ok(!j.includes(mot), mot);
});
await t('images fixes Éco : paysage 1920×1080, portrait 1080×1920, cœur 1024×1024 transparent, légères ; crédits à jour', () => {
  const dim = f => { const b = fs.readFileSync(new URL('ui/assets/' + f, racine)); const k = b.toString('ascii', 12, 16);
    if (k === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3), alpha: !!(b[20] & 0x10) };
    if (k === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, alpha: false };
    throw new Error(f + ' ' + k); };
  const a = dim('fond-jarvis-paysage.webp'), b = dim('fond-jarvis-portrait.webp'), c = dim('fond-jarvis-coeur.webp');
  assert.deepEqual([a.w, a.h], [1920, 1080]); assert.deepEqual([b.w, b.h], [1080, 1920]); assert.deepEqual([c.w, c.h, c.alpha], [1024, 1024, true]);
  for (const f of ['fond-jarvis-paysage.webp', 'fond-jarvis-portrait.webp', 'fond-jarvis-coeur.webp']) assert.ok(taille('ui/assets/' + f) < 400 * 1024, f);
  assert.match(lire('ui/assets/CREDITS.txt'), /fond-jarvis-coeur\.webp/);
});
console.log(ok + ' tests réussis');
