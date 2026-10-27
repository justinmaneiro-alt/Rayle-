import { BASE, attendre, compteur, ouvrirGalaxie } from './terre-aide.mjs';
export { BASE, attendre, compteur, ouvrirGalaxie };

/* Position écran de Mars dans la galaxie. */
export const positionMars = page => page.evaluate(() => {
  const G = window.Galaxie, o = G.systeme.parId('mars'), v = o.porteur.getWorldPosition(G.camera.position.clone().set(0, 0, 0)).project(G.camera);
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
});
/* Va sur Mars (même commande que la voix) et attend l'arrivée en orbite : module chargé, fondu fini, vol d'approche terminé. */
export async function entrerSurMars(page, { attenteMax = 90000 } = {}) {
  await page.evaluate(() => window.Galaxie.nav.allerA('mars', { entrer: true }));
  await page.waitForFunction(() => window.Mars && window.Mars.etat().actif && !window.Mars.etat().transition && !document.getElementById('m-fondu').classList.contains('noir'), { timeout: attenteMax });
  await page.waitForFunction(() => !window.Mars.etat().vol, { timeout: 20000 });
  await attendre(300);
}
export async function attendreMode(page, mode, max = 40000) {
  await page.waitForFunction(m => window.Mars && window.Mars.etat().mode === m && !window.Mars.etat().transition && !document.getElementById('m-fondu').classList.contains('noir'), { timeout: max }, mode);
  await attendre(400);
}
