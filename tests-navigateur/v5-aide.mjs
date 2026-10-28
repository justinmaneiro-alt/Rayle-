/* Aide commune aux tests Chrome des gestes V5 : ouvre la vraie page Rayle (serveur local), injecte la main synthétique et une petite bibliothèque de suites à 60 images/s
   (window.__T) pour piloter le moteur V5 SANS caméra. Ce ne sont PAS de vrais enregistrements : une vraie main devant un vrai téléphone reste « à valider par Justin ». */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME, attendre } from './terre-aide.mjs';
import { creerServeur } from '../serveur.mjs';

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const BIBLIOTHEQUE = `(() => {
  const H = MainSynthetique, IPS = 60, pas = 1000 / IPS;
  const W = () => innerWidth, Hh = () => innerHeight;
  const zone = () => { const r = Gestes.reglages(); return { l: r.zoneL, h: r.zoneH, cx: r.zoneCx, cy: r.zoneCy }; };
  const origine = (pose, extra) => { const m = H.creerMain({ pose, cx: 0.5, cy: 0.5, ...extra }); const p = pose === 'pince' ? [(m.pts[4][0] + m.pts[8][0]) / 2, (m.pts[4][1] + m.pts[8][1]) / 2] : [m.pts[8][0], m.pts[8][1]]; return { ox: p[0] - 0.5, oy: p[1] - 0.5 }; };
  /* position du poignet (cx, cy) pour que le point de visée de la pose tombe sur le pixel (x, y) de l'écran */
  const pour = (x, y, pose = 'pointer', extra) => { const z = zone(), o = origine(pose, extra), u = z.cx - z.l / 2 + (x / (W() - 1)) * z.l, v = z.cy - z.h / 2 + (y / (Hh() - 1)) * z.h; return { cx: (1 - u) - o.ox, cy: v - o.oy }; };
  const lisse = u => u * u * (3 - 2 * u);
  class Suite {
    constructor() { this.frames = []; this.t = 0; this.pos = { x: W() / 2, y: Hh() / 2 }; }
    img(mains) { this.frames.push({ t: Math.round(this.t), ratio: 4 / 3, mains }); this.t += pas; return this; }
    main(pose, x, y, o = {}) { const c = pour(x, y, pose === 'pince' ? 'pince' : 'pointer', o.extra); return H.creerMain({ pose, cx: c.cx, cy: c.cy, pince: o.pince == null ? 1 : o.pince, autres: o.autres || 'ouverts', lat: o.lat || 'Right', bruit: o.bruit || 0, alea: o.alea || null, taille: o.taille || 0.16 }); }
    tenir(pose, x, y, ms, o = {}) { const n = Math.max(1, Math.round(ms / pas)); for (let i = 0; i < n; i++) this.img([this.main(pose, x, y, o)]); this.pos = { x, y }; return this; }
    aller(pose, x1, y1, ms, o = {}) { const n = Math.max(2, Math.round(ms / pas)), x0 = this.pos.x, y0 = this.pos.y; for (let i = 1; i <= n; i++) { const u = lisse(i / n); this.img([this.main(pose, x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, o)]); } this.pos = { x: x1, y: y1 }; return this; }
    pointer(x, y, ms = 400) { return this.tenir('pointer', x, y, ms); }
    vers(x, y, ms = 500) { return this.aller('pointer', x, y, ms); }
    ouvrir(x, y, ms) { return this.tenir('ouverte', x, y, ms); }
    poing(x, y, ms) { return this.tenir('poing', x, y, ms); }
    fermerPince(x, y, ms = 80) { const n = Math.max(2, Math.round(ms / pas)); for (let i = 1; i <= n; i++) this.img([this.main('pince', x, y, { pince: i / n })]); return this; }
    rouvrirPince(x, y, ms = 80) { const n = Math.max(2, Math.round(ms / pas)); for (let i = n - 1; i >= 0; i--) this.img([this.main('pince', x, y, { pince: i / n })]); return this; }
    clic(x, y, tenir = 90) { this.fermerPince(x, y); this.tenir('pince', x, y, tenir); this.rouvrirPince(x, y); return this.tenir('pointer', x, y, 120); }
    /* pincer à (x0,y0), tenir, déplacer jusqu'à (x1,y1), relâcher */
    glisser(x0, y0, x1, y1, o = {}) { this.pointer(x0, y0, o.avant || 250); this.fermerPince(x0, y0); this.tenir('pince', x0, y0, o.tenir || 380); this.aller('pince', x1, y1, o.duree || 600); this.tenir('pince', x1, y1, o.fin || 120); this.rouvrirPince(x1, y1); return this.tenir('pointer', x1, y1, o.apres == null ? 150 : o.apres); }
    vide(ms) { const n = Math.max(1, Math.round(ms / pas)); for (let i = 0; i < n; i++) this.img([]); return this; }
    deux(poseG, poseD, xg0, yg0, xd0, yd0, xg1, yg1, xd1, yd1, ms) { const n = Math.max(2, Math.round(ms / pas)); for (let i = 0; i <= n; i++) { const u = lisse(i / n), g = this.main(poseG, xg0 + (xg1 - xg0) * u, yg0 + (yg1 - yg0) * u, { lat: 'Left', pince: 1 }), d = this.main(poseD, xd0 + (xd1 - xd0) * u, yd0 + (yd1 - yd0) * u, { lat: 'Right', pince: 1 }); this.img([g, d]); } this.pos = { x: xd1, y: yd1 }; return this; }
    engager(x = W() / 2, y = Hh() / 2) { return this.ouvrir(x, y, 1000); }
  }
  const jouer = async (s, o) => Gestes.rejouer(s.frames, { instantane: !!(o && o.instantane), ecart: 17 });   // temps RÉEL par défaut : les fenêtres calculent leur inertie avec l'horloge de la page
  return { Suite, jouer, pour, ips: IPS };
})()`;

export async function lancer({ port = 8140, largeur = 1400, hauteur = 900, avantPage = null, prefs = null, args = [] } = {}) {
  const dossierDonnees = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-v5-'));
  const serveur = creerServeur({ portReseau: 0, dossierDonnees, ip: '127.0.0.1' });
  await new Promise(r => serveur.listen(port, '127.0.0.1', r)); const BASE = 'http://127.0.0.1:' + port;
  const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=' + largeur + ',' + hauteur, ...args] });
  const page = await nav.newPage(); await page.setViewport({ width: largeur, height: hauteur }); const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message.slice(0, 220))); page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 220)); });
  await page.evaluateOnNewDocument(p => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); if (p) localStorage.setItem('rayle_gestes', JSON.stringify(p)); else localStorage.removeItem('rayle_gestes'); localStorage.removeItem('rayle_gestes_appr'); } catch (e) { /* stockage refusé */ } }, prefs);
  if (avantPage) await avantPage(page);
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(2500);
  await page.addScriptTag({ path: path.join(RACINE, 'core/gestes/main-synthetique.js') });
  await page.evaluate(code => { window.__T = eval(code); }, BIBLIOTHEQUE);
  const fermer = async () => { try { await nav.close(); } catch (e) { /* déjà fermé */ } await new Promise(r => serveur.close(r)); };
  return { page, nav, erreurs, BASE, fermer };
}
