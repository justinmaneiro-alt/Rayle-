import puppeteer from 'puppeteer-core';
export const BASE = process.env.BASE || 'http://127.0.0.1:8000';
export const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const attendre = ms => new Promise(r => setTimeout(r, ms));
export function compteur() {
  let ok = 0, ko = 0;
  return { verifier(nom, cond, detail = '') { cond ? ok++ : ko++; console.log((cond ? 'OK  ' : 'KO  ') + nom + (detail ? ' — ' + detail : '')); }, fin() { console.log(`\n${ok} réussis, ${ko} échecs`); return ko; } };
}
/* Ouvre la page, la galaxie, et renvoie { navigateur, page, erreurs }. largeur/hauteur : taille de la fenêtre. mock : fonction (page) appelée avant le chargement (interception réseau). */
export async function ouvrirGalaxie({ largeur = 1600, hauteur = 900, avant = null } = {}) {
  const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${largeur},${hauteur}`, ...(process.env.SANSVSYNC ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [])] });
  const page = await navigateur.newPage();
  await page.setViewport({ width: largeur, height: hauteur });
  const erreurs = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) erreurs.push(m.text().slice(0, 240)); });
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 240)));
  if (avant) await avant(page);
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await attendre(800);
  await page.click('#btnOuvrirGalaxie');
  await page.waitForFunction(() => document.getElementById('chargement')?.classList.contains('fini'), { timeout: 90000 });
  await attendre(500);
  return { navigateur, page, erreurs };
}
/* Position écran de la Terre dans la galaxie. */
export const positionTerre = page => page.evaluate(() => {
  const G = window.Galaxie, o = G.systeme.parId('terre'), v = o.porteur.getWorldPosition(G.camera.position.clone().set(0, 0, 0)).project(G.camera);
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
});
/* Clique sur la Terre et attend l'arrivée en orbite (module chargé, fondu fini). */
export async function entrerEnOrbite(page, { attenteMax = 60000, directe = false } = {}) {
  if (directe) await page.evaluate(() => window.Galaxie.nav.allerA('terre', { entrer: true }));   // même commande que la voix (la Terre peut passer derrière le soleil à l'écran)
  else { const p = await positionTerre(page); await page.mouse.click(p.x + 1, p.y + 1); }
  await page.waitForFunction(() => window.Terre && window.Terre.etat().actif && !document.getElementById('terre-fondu').classList.contains('noir'), { timeout: attenteMax });
  await page.waitForFunction(() => window.Terre.etat().entree && !window.Terre.etat().vol, { timeout: 20000 });   // le vol d'arrivée en orbite doit être fini
  await attendre(300);
}

/* Attend que plus rien ne se charge : file des Workers vide, tuiles affichées stables, pendant `calme` ms d'affilée. */
export async function attendreChargement(page, { calme = 900, max = 60000 } = {}) {
  const debut = Date.now(); let derniere = '', depuis = Date.now();
  while (Date.now() - debut < max) {
    const e = await page.evaluate(() => { const s = window.Terre.stats(); return s.chargeur.enFile + '|' + s.chargeur.actives + '|' + s.affichees.length + '|' + s.enAttente; });
    const [f, a, n, w] = e.split('|').map(Number);
    if (f !== 0 || a !== 0 || w !== 0 || e !== derniere) { derniere = e; depuis = Date.now(); }
    else if (Date.now() - depuis >= calme) return true;
    await attendre(120);
  }
  return false;
}
