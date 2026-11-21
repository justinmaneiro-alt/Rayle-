// v7 phase 1.4 : la fenêtre Météo ne doit recouvrir aucun bouton de la barre du bas, sur 4 tailles d'écran.  node tests-navigateur/v7-meteo.mjs
import { ouvrirAppareil } from './v7b-aide.mjs';
let ko = 0;
for (const cle of ['pc1600', 'tab1024', 'tablette', 'tel390']) {
  const o = await ouvrirAppareil(cle, { attente: 3500 });
  const r = await o.page.evaluate(() => {
    const vis = e => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 4 && b.height > 4 && +s.opacity > 0.05; };
    const meteo = [...document.querySelectorAll('.ar-meteo, [class*="meteo"], [id*="meteo"]')].filter(vis).map(e => { const b = e.getBoundingClientRect(); return { c: String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className) || e.id, x: b.x, y: b.y, r: b.right, b: b.bottom }; });
    const boutons = [...document.querySelectorAll('.g1-dock button, .g1-dock-in *, #barre button, [class*="dock"] button, nav button')].filter(vis).map(e => { const b = e.getBoundingClientRect(); return { t: String(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 18), x: b.x, y: b.y, r: b.right, b: b.bottom }; }).filter(b => b.y > innerHeight * 0.5);
    const inter = (a, b) => a.x < b.r && a.r > b.x && a.y < b.b && a.b > b.y;
    const chev = []; for (const m of meteo) for (const b of boutons) if (inter(m, b)) chev.push(m.c + ' ∩ ' + b.t);
    return { W: innerWidth, H: innerHeight, meteo: meteo.map(m => [m.c, Math.round(m.x), Math.round(m.y), Math.round(m.r), Math.round(m.b)]), nbBoutons: boutons.length, chev };
  });
  console.log(cle, JSON.stringify(r)); if (r.chev.length) ko++;
  await o.page.screenshot({ path: `docs/captures-v7-meteo-${cle}.png` }).catch(() => {}); await o.navigateur.close();
}
process.exit(ko ? 1 : 0);
