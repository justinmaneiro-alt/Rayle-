// Cadrage responsive commun des fonds (ui/cadrage.js) : l'objet principal est TOUJOURS entier, sur tous les formats d'écran.   node tests/cadrage-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ctx = { console, setTimeout, Math };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../ui/cadrage.js', import.meta.url), 'utf8'), ctx);
const C = ctx.RayleUI.cadrage;

let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.message); process.exitCode = 1; } };

// mise en page type de Raylé (mêmes proportions que le vrai DOM : cadre de l'entité = min(86vw, 62vh, 520), titre, barre de boutons)
function mesure(W, H) {
  const box = Math.min(W * .86, H * .62, 520), cx = W / 2, cy = Math.max(box / 2 + 60, H * .42);
  const bas = H - (W < 700 ? 150 : 190);
  return { W, H, entite: { cx, cy, r: box * .30 }, haut: 62, bas, texteBas: Math.min(bas - 10, cy + box / 2 + 56), reserves: [] };
}
const FORMATS = { 'téléphone vertical': [390, 844], 'téléphone paysage': [844, 390], 'petit téléphone': [360, 640], 'tablette verticale': [768, 1024], 'tablette paysage': [1024, 768],
  'carré': [900, 900], 'PC 16:10': [1280, 800], 'PC 16:9': [1920, 1080], '21:9': [2560, 1080], '21:9 large': [3440, 1440], '32:9': [5120, 1440], 'fenêtre étroite': [500, 900], 'zoom 200 %': [960, 540] };
const cadre = (W, H, extra) => C.cadrer(Object.assign({ mesure: mesure(W, H), cam: { fov: 35, dist: 3.4 }, rayonBase: 1.09, echelleMax: .8, canvasW: W * 1.06, canvasH: H * 1.06 }, extra));

t('silhouette : une sphère au centre est symétrique et correspond à la projection réelle', () => {
  const cam = { fov: 35, dist: 3.4, aspect: 1 };
  const b = C.silhouette(cam, 1000, 1000, { x: 0, y: 0, z: 0 }, 1);
  assert.ok(Math.abs((b.x0 + b.x1) / 2 - 500) < .5 && Math.abs((b.y0 + b.y1) / 2 - 500) < .5);
  assert.ok(Math.abs((b.x1 - b.x0) - (b.y1 - b.y0)) < 1);
  const rayonAttendu = 500 * Math.tan(Math.asin(1 / 3.4)) / Math.tan(35 * Math.PI / 360);   // angle sous lequel on voit la sphère
  assert.ok(Math.abs((b.x1 - b.x0) / 2 - rayonAttendu) < 1.5, (b.x1 - b.x0) / 2 + ' vs ' + rayonAttendu);
});
t('silhouette : une sphère décentrée est plus large (perspective), jamais nulle', () => {
  const cam = { fov: 35, dist: 3.4, aspect: 2 };
  const c = C.silhouette(cam, 2000, 1000, { x: 0, y: 0, z: 0 }, .8), d = C.silhouette(cam, 2000, 1000, { x: 2.5, y: 0, z: 0 }, .8);
  assert.ok(d && c && (d.x1 - d.x0) > (c.x1 - c.x0));
  assert.equal(C.silhouette(cam, 2000, 1000, { x: 0, y: 0, z: 3.4 }, .8), null);   // sphère qui englobe la caméra
});
t('l’objet est ENTIER et dans la zone libre sur tous les formats (téléphone, tablette, PC, ultra-large, zoom)', () => {
  for (const [nom, [W, H]] of Object.entries(FORMATS)) {
    const r = cadre(W, H);
    assert.ok(isFinite(r.x) && isFinite(r.y) && r.scale > 0, nom + ' : valeurs finies');
    if (r.mode === 'horizon') continue;                                      // le téléphone vertical garde la planète qui se lève (voir plus bas)
    const dx = W * .03, dy = H * .03, b = r.boite;                            // le canvas commence à (-3 %, -3 %) de l'écran
    assert.ok(b.x0 - dx >= -.5 && b.x1 - dx <= W + .5 && b.y0 - dy >= -.5 && b.y1 - dy <= H + .5, nom + ' : entier à l’écran ' + JSON.stringify(b));
    assert.ok(b.x0 >= r.zone.x0 - .5 && b.x1 <= r.zone.x1 + .5 && b.y0 >= r.zone.y0 - .5 && b.y1 <= r.zone.y1 + .5, nom + ' : dans la zone libre');
    assert.ok(r.scale <= .8 + 1e-9, nom + ' : jamais plus grand que la taille d’origine');
  }
});
t('écran large : l’objet est à droite de l’entité, sans recouvrir sa sphère', () => {
  for (const [W, H] of [[1280, 800], [1920, 1080], [2560, 1080], [3440, 1440], [5120, 1440], [1024, 768]]) {
    const m = mesure(W, H), r = cadre(W, H);
    assert.equal(r.mode, 'cote'); assert.equal(r.cote, 'droite');
    const centreEcranX = (r.boite.x0 + r.boite.x1) / 2 - W * .03, bordGauche = r.boite.x0 - W * .03;
    assert.ok(centreEcranX > W / 2, W + ' : à droite du centre');
    assert.ok(bordGauche >= m.entite.cx + m.entite.r * .35, W + ' : ne recouvre pas la sphère de l’entité (' + Math.round(bordGauche) + ' / ' + Math.round(m.entite.cx + m.entite.r * .35) + ')');
  }
});
t('l’objet reste grand : au moins ~30 % de la hauteur libre, même en 4:3', () => {
  for (const [W, H] of [[1280, 800], [1920, 1080], [2560, 1080], [1024, 768], [3440, 1440]]) {
    const m = mesure(W, H), r = cadre(W, H), h = r.boite.y1 - r.boite.y0;
    assert.ok(h >= .3 * (m.bas - m.haut), W + 'x' + H + ' : hauteur ' + Math.round(h) + ' px trop petite');
  }
});
t('tablette verticale : sous (ou au-dessus de) l’entité, entier, sans recouvrir sa sphère', () => {
  const m = mesure(768, 1024), r = cadre(768, 1024);
  assert.equal(r.mode, 'vertical');
  const y0 = r.boite.y0 - 1024 * .03, y1 = r.boite.y1 - 1024 * .03;
  assert.ok(r.cote === 'bas' ? y0 >= m.entite.cy + m.entite.r : y1 <= m.entite.cy - m.entite.r, 'ne recouvre pas la sphère');
});
t('téléphone vertical : la planète se lève sous le texte de l’entité (rendu d’origine conservé)', () => {
  const m = mesure(390, 844), r = cadre(390, 844);
  assert.equal(r.mode, 'horizon');
  const haut = r.boite.y0 - 844 * .03, largeur = r.boite.x1 - r.boite.x0;
  assert.ok(Math.abs(haut - (m.texteBas + 10)) < 2, 'sommet juste sous le texte : ' + Math.round(haut) + ' / ' + Math.round(m.texteBas + 10));
  assert.ok(largeur > 390 * 1.4 && largeur < 390 * 2.2, 'planète plus large que l’écran : ' + Math.round(largeur));
});
t('rotation en direct : portrait → paysage → portrait redonne exactement la même pose (déterministe)', () => {
  const a = cadre(768, 1024), b = cadre(1024, 768), c = cadre(768, 1024);
  assert.notEqual(a.mode, b.mode);
  assert.deepEqual([a.x, a.y, a.scale], [c.x, c.y, c.scale]);
});
t('redimensionnement progressif à la souris : la pose varie sans saut (continuité)', () => {
  let prec = null, maxSaut = 0;
  for (let W = 1500; W >= 960; W -= 10) {   // sans franchir le ratio 1,15 (changement de disposition : le fond glisse alors en douceur, voir fond-globe.js)
    const r = cadre(W, 800), px = { x: (r.boite.x0 + r.boite.x1) / 2 / W, d: (r.boite.x1 - r.boite.x0) / W };
    if (prec) maxSaut = Math.max(maxSaut, Math.abs(px.x - prec.x), Math.abs(px.d - prec.d));
    prec = px;
  }
  assert.ok(maxSaut < .08, 'saut maximal ' + maxSaut.toFixed(3));
});
t('panneaux HUD ouverts à droite : l’objet passe à gauche, entier, sans les toucher', () => {
  const m = mesure(1920, 1080); m.reserves = [{ x0: 1500, x1: 1900, y0: 60, y1: 900 }];
  const r = C.cadrer({ mesure: m, cam: { fov: 35, dist: 3.4 }, rayonBase: 1.09, echelleMax: .8, canvasW: 1920 * 1.06, canvasH: 1080 * 1.06 });
  assert.equal(r.cote, 'gauche');
  assert.ok(r.boite.x1 - 1920 * .03 <= m.entite.cx - m.entite.r * .3, 'à gauche de l’entité');
});
t('panneaux des deux côtés : valeurs valides, pas de taille absurde', () => {
  const m = mesure(1600, 900); m.reserves = [{ x0: 10, x1: 400, y0: 60, y1: 800 }, { x0: 1200, x1: 1590, y0: 60, y1: 800 }];
  const r = C.cadrer({ mesure: m, cam: { fov: 35, dist: 3.4 }, rayonBase: 1.09, echelleMax: .8, canvasW: 1600 * 1.06, canvasH: 900 * 1.06 });
  assert.ok(isFinite(r.scale) && r.scale > 0 && r.scale <= .8);
});
t('l’ancien bug : décalage codé en dur — la planète d’origine dépassait à droite en 16:9', () => {
  // reproduction : position x = 1,3 · min(1,8; ratio)/1,5, échelle 0,8, caméra à 3,4 (fov 35) sur un canvas 1,06 × l'écran
  const W = 1920 * 1.06, H = 1080 * 1.06, cam = { fov: 35, dist: 3.4, aspect: W / H };
  const b = C.silhouette(cam, W, H, { x: 1.3 * Math.min(1.8, W / H) / 1.5, y: -.1, z: 0 }, 1.09 * .8);
  assert.ok(b.x1 > 1920 * 1.03, 'l’ancien réglage sortait de l’écran (' + Math.round(b.x1) + ' px)');
  const r = cadre(1920, 1080);
  assert.ok(r.boite.x1 <= 1920 * 1.03 - 10, 'le nouveau cadrage est entier');
});
t('téléphone en paysage : la planète ne recouvre pas le texte d’état de l’entité quand il reste de la place', () => {
  const m = mesure(844, 390); m.texte = { x0: 215, x1: 630, y0: 255, y1: 275 };
  const sans = cadre(844, 390), avec = C.cadrer({ mesure: m, cam: { fov: 35, dist: 3.4 }, rayonBase: 1.09, echelleMax: .8, canvasW: 844 * 1.06, canvasH: 390 * 1.06 });
  assert.ok(avec.boite.x0 - 844 * .03 >= 630 + 10, 'à droite du texte : ' + Math.round(avec.boite.x0 - 844 * .03));
  assert.ok(avec.boite.x1 - avec.boite.x0 >= .5 * (m.bas - m.haut) * .9, 'reste de taille correcte');
  assert.ok(sans.boite.x0 < avec.boite.x0, 'sans le texte, elle serait plus à gauche');
});
t('zone minuscule ou absurde : pas de plantage, échelle quasi nulle mais valide', () => {
  const r = C.ajuster({ fov: 35, dist: 3.4, aspect: 1.5 }, 1500, 1000, { x0: 700, x1: 702, y0: 500, y1: 501 }, 1.09, { echelleMax: .8, marge: 4 });
  assert.ok(isFinite(r.scale) && r.scale >= 0 && r.scale < .05);
});
console.log(ok + ' tests réussis');
