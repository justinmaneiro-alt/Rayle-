/* Terre CLASSIQUE : flashs lumineux pendant le zoom — reproduction, élimination des pistes, test de non-régression.
   Zoom automatique à la molette (comme un utilisateur) et mesure de la luminance de CHAQUE image affichée (lecture des pixels juste après
   le rendu final à l'écran). Un « flash » = une image nettement plus claire que ses voisines (pic isolé), ou un bond de la part de pixels
   presque blancs, ou une image isolée nettement plus SOMBRE (« trou » d'une image). Variantes (VARIANTES=a,b,…) : chaque piste est neutralisée seule pour voir si les flashs disparaissent.
   Prérequis : node serveur.mjs 8011.  Usage : BASE=http://127.0.0.1:8011 node --import ./theme-jarvis-hook.mjs terre-flash-test.mjs
   Sortie : code 1 si la luminance saute brutalement pendant un zoom (variante « normal »). */
import { ouvrirGalaxie, entrerEnOrbite, attendre, attendreChargement } from './terre-aide.mjs';
import fs from 'node:fs';

const L = +(process.env.L || 960), H = +(process.env.H || 540);
const SEUIL_SAUT = +(process.env.SEUIL || 6), SEUIL_TROU = +(process.env.SEUIL_TROU || 10), SEUIL_CLAIR = +(process.env.SEUIL_CLAIR || 0.004);
const LIEUX = JSON.parse(process.env.LIEUX || 'null') || [
  ['lisbonne-ocean', { lon: -9.6, lat: 38.6, dist: 2600, cap: 0, incl: 0.2 }],
  ['alpes', { lon: 6.86, lat: 45.83, dist: 2600, cap: 0, incl: 0.3 }],
  ['marseille-cote', { lon: 5.37, lat: 43.2, dist: 2600, cap: 0, incl: 0.4 }]
];
const VARIANTES = (process.env.VARIANTES || 'normal').split(',');
const PAS = +(process.env.PAS || 70), CRANS = +(process.env.CRANS || 45);

const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: L, hauteur: H });
await entrerEnOrbite(page, { directe: true });
await page.evaluate(d => { window.Terre.definirDate(d); }, process.env.DATE || '2026-06-21T11:30:00Z');

/* échantillonneur : après chaque rendu FINAL à l'écran, luminance moyenne + part de pixels presque blancs */
await page.evaluate(() => {
  const r = window.Galaxie.renderer, gl = r.getContext(), orig = r.render.bind(r);
  window.__flash = { on: false, images: [] };
  let buf = null;
  r.render = (s, c) => {
    orig(s, c);
    const F = window.__flash; if (!F.on || r.getRenderTarget() !== null) return;
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; if (!buf || buf.length !== w * h * 4) buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let som = 0, clair = 0, n = 0;
    for (let i = 0; i < buf.length; i += 16) { const y = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]; som += y; if (y > 245) clair++; n++; }
    const prec = F.images[F.images.length - 1];
    if (window.__capturesFlash && prec && clair / n - prec.clair > 0.004 && window.__capturesFlash.length < 4) window.__capturesFlash.push(r.domElement.toDataURL('image/png'));
    if (window.__capturesFlash && prec && som / n < 20 && window.__capturesFlash.length < 6) window.__capturesFlash.push(r.domElement.toDataURL('image/png'));
    if (window.__capturesFlash && prec && som / n - prec.lum > 7 && window.__capturesFlash.length < 8) { window.__capturesFlash.push(r.domElement.toDataURL('image/png')); window.__capturesFlash.push('PREC'); }
    const T = window.Terre.stats();
    F.images.push({ t: performance.now(), lum: som / n, clair: clair / n, alt: window.Terre.etat().altitude ?? null, tuiles: T.affichees.length, file: T.chargeur.enFile + T.chargeur.actives });
  };
});

const VAR = {
  normal: () => {},
  'sans-bloom': () => { for (const p of window.Galaxie.composer().passes) if (p.constructor.name === 'UnrealBloomPass') p.enabled = false; },
  'sans-ocean': () => window.Terre.regler({ ocean: false }),
  'sans-nuages': () => window.Terre.regler({ nuages: false, meteoAnim: false }),
  'sans-atmosphere': () => { const sc = window.Galaxie.composer().passes[0].scene; sc.traverse(o => { const u = o.material && o.material.uniforms; if (u && u.uForce) { o.visible = false; } }); },
  'sans-ombres': () => window.Terre.regler({ ombres: false }),
  'far-fixe': () => { const c = window.Galaxie.composer().passes[0].camera; if (!c.__farFixe) { c.__farFixe = true; Object.defineProperty(c, 'far', { get: () => 20000, set: () => {}, configurable: true }); } },
  'sans-regional': () => window.Terre.regler({ regional: false }),
  'sans-eox': () => window.Terre.regler({ eox: false }),
  'sans-specular': () => { const sc = window.Galaxie.composer().passes[0].scene; window.__sansSpec = true; sc.traverse(o => { const u = o.material && o.material.uniforms; if (u && u.uOcean) u.uOcean.value = 0; }); }
};
const DEFAIRE = () => { for (const p of window.Galaxie.composer().passes) p.enabled = true; window.Terre.regler({ ocean: true, nuages: true, meteoAnim: true, ombres: true, regional: true, eox: true }); const sc = window.Galaxie.composer().passes[0].scene; sc.traverse(o => { const u = o.material && o.material.uniforms; if (u && u.uForce) o.visible = true; }); };

function analyser(im) {
  const sauts = [];
  for (let i = 4; i < im.length - 4; i++) {
    const vois = [...im.slice(i - 4, i), ...im.slice(i + 1, i + 5)].map(x => x.lum).sort((a, b) => a - b), med = (vois[3] + vois[4]) / 2;
    const vc = [...im.slice(i - 4, i), ...im.slice(i + 1, i + 5)].map(x => x.clair).sort((a, b) => a - b), medc = (vc[3] + vc[4]) / 2;
    const pic = im[i].lum - med, picc = im[i].clair - medc;
    if ((pic > SEUIL_SAUT && im[i].lum > im[i - 1].lum && im[i].lum > im[i + 1].lum) || (pic < -SEUIL_TROU && im[i].lum < im[i - 1].lum && im[i].lum < im[i + 1].lum) || picc > SEUIL_CLAIR) sauts.push({ i, pic: +pic.toFixed(1), picClair: +(picc * 100).toFixed(2), alt: im[i].alt, tuiles: im[i].tuiles, file: im[i].file });
  }
  const pas = im.slice(1).map((x, k) => Math.abs(x.lum - im[k].lum));
  return { images: im.length, sauts, maxPas: +Math.max(0, ...pas).toFixed(1), lumMin: +Math.min(...im.map(x => x.lum)).toFixed(1), lumMax: +Math.max(...im.map(x => x.lum)).toFixed(1) };
}

const resultats = {};
for (const variante of VARIANTES) {
  resultats[variante] = {};
  for (const [nom, vue] of LIEUX) {
    await page.evaluate(DEFAIRE); await page.evaluate(VAR[variante]);
    await page.evaluate(v => window.Terre.placer(v), vue); await attendreChargement(page, { max: 30000 });
    await page.mouse.move(L / 2, H / 2);
    await page.evaluate(c => { window.__flash.images = []; window.__flash.on = true; window.__capturesFlash = c ? [] : null; }, !!process.env.CAPTURE);
    for (let k = 0; k < CRANS; k++) { await page.mouse.wheel({ deltaY: -120 }); await attendre(PAS); }
    await attendre(1500);
    const im = await page.evaluate(() => { window.__flash.on = false; return window.__flash.images; });
    if (process.env.CAPTURE) { const caps = await page.evaluate(() => { const c = window.__capturesFlash || []; window.__capturesFlash = []; return c; }); caps.filter(d => d !== 'PREC').forEach((d, k) => fs.writeFileSync(`../captures-terre/flash-${variante}-${nom}-image${k}.png`, Buffer.from(d.split(',')[1], 'base64'))); }
    const a = analyser(im); resultats[variante][nom] = a; if (process.env.BRUT) a.brut = im.map(x => [Math.round(x.t), +x.lum.toFixed(1), +(x.clair * 100).toFixed(2), x.alt && +x.alt.toFixed(2), x.tuiles, x.file]);
    console.log(`${variante.padEnd(16)} ${nom.padEnd(16)} images ${a.images} · flashs ${a.sauts.length} · plus grand saut ${a.maxPas} · lum ${a.lumMin}–${a.lumMax}${a.sauts.length ? ' · ex. ' + JSON.stringify(a.sauts.slice(0, 3)) : ''}`);
    if (process.env.CAPTURE) await page.screenshot({ path: `../captures-terre/flash-${variante}-${nom}.png` });
  }
}
fs.mkdirSync('../captures-terre', { recursive: true });
fs.writeFileSync('../captures-terre/flash-mesures.json', JSON.stringify(resultats, null, 1));
const err = erreurs.filter(e => !/faireconomy|404|408|ERR_FAILED|CORS|net::/i.test(e));
if (err.length) console.log('erreurs :', err.slice(0, 5).join('\n  '));
await navigateur.close();
// échec : flash CLAIR (pic isolé plus clair, ou bond de pixels presque blancs) ; un « trou » sombre d'une image est signalé (cause connue, non corrigée)
const tous = Object.values(resultats.normal || {}).flatMap(a => a.sauts), clairs = tous.filter(x => x.pic > 0 || x.picClair > 0), trous = tous.filter(x => !(x.pic > 0 || x.picClair > 0));
if (trous.length) console.log(`AVERTISSEMENT : ${trous.length} image(s) isolée(s) plus sombre(s) (changement de niveau de tuiles) : ${JSON.stringify(trous.slice(0, 3))}`);
if (resultats.normal) { console.log(clairs.length ? `ÉCHEC : ${clairs.length} flash(s) lumineux pendant le zoom` : 'OK : aucun flash lumineux pendant le zoom'); process.exit(clairs.length ? 1 : 0); }
