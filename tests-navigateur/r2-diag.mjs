import { ouvrirGalaxie, entrerSurMars, attendreMode, attendre } from './mars-aide.mjs';
import { demarrerFauxWorkerMarche } from './mock-worker-marche.mjs';

/* R2 phase 1 : diagnostic en thème AURORE (celui de Justin), à sa taille d'écran. Affiche l'état réel du DOM des fenêtres. */
const L = +process.env.L || 2560, H = +process.env.H || 1440;
const worker = await demarrerFauxWorkerMarche(8797);
const injecter = async p => { await p.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_boot_jarvis', '0'); }); };
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: L, hauteur: H, avant: injecter });
const ev = (f, ...a) => page.evaluate(f, ...a);
if (process.env.AURORE) await ev(() => { const s = document.getElementById('g1Theme'); s.value = 'aurore'; s.dispatchEvent(new Event('change', { bubbles: true })); });
console.log('theme', await ev(() => [localStorage.getItem('rayle_theme'), document.body.className]));
await entrerSurMars(page);
await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur');
await ev(() => window.Mars.placerInterieur({ yaw: 0, pitch: -0.07, avancee: 0.2 })); await attendre(700);
const fens = await ev(() => window.Mars.positionsEcran());
for (const f of fens.slice(0, 3)) {
  await page.mouse.move(f.x, f.y); await attendre(200); await page.mouse.click(f.x, f.y); await attendre(2500);
  const sous = await ev((x, y) => { const e = document.elementFromPoint(x, y); const c = []; let n = e; while (n && c.length < 5) { c.push((n.id ? '#' + n.id : '') + '.' + String(n.className).slice(0, 40)); n = n.parentElement; } return c; }, f.x, f.y); console.log('sous le clic', f.id, f.x, f.y, JSON.stringify(sous));
  const d = await ev(() => {
    const out = {}; out.etat = window.Mars.etat().fenetre;
    const pn = [...document.querySelectorAll('.pn')].map(el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el), par = el.parentElement, pc = getComputedStyle(par); const w = document.getElementById('panneaux'), wc = getComputedStyle(w);
      return { id: el.dataset.id, cls: el.className, rect: [r.x, r.y, r.width, r.height].map(Math.round), vis: cs.visibility, disp: cs.display, op: cs.opacity, z: cs.zIndex, pos: cs.position, pe: cs.pointerEvents, parent: par.className, parentRect: (r2 => [r2.x, r2.y, r2.width, r2.height].map(Math.round))(par.getBoundingClientRect()), parentDisp: pc.display, parentPE: pc.pointerEvents, panneauxRect: (r3 => [r3.x, r3.y, r3.width, r3.height].map(Math.round))(w.getBoundingClientRect()), panneauxCls: w.className, panneauxDisp: wc.display, panneauxZ: wc.zIndex, panneauxOp: wc.opacity }; });
    out.pn = pn; const top = document.elementFromPoint(innerWidth / 2, innerHeight / 2); out.auCentre = top && (top.id || top.className || top.tagName); out.body = document.body.className; return out;
  });
  console.log(JSON.stringify(d, null, 1));
  await ev(() => window.Panneaux && window.Panneaux.fermerTout()); await attendre(800);
}
console.log('erreurs', erreurs.slice(0, 6));
await navigateur.close(); worker.close && worker.close(); process.exit(0);
