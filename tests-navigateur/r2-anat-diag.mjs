import { ouvrirGalaxie, attendre } from './mars-aide.mjs';

/* R2 phase 1 : fenêtres de l'anatomie en thème AURORE, à la taille de Justin : taille, opacité, position. */
const L = +process.env.L || 2560, H = +process.env.H || 1440;
const injecter = async p => { await p.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_boot_jarvis', '0'); }); };
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: L, hauteur: H, avant: injecter });
const ev = (f, ...a) => page.evaluate(f, ...a);
if (!process.env.JARVIS) await ev(() => { const s = document.getElementById('g1Theme'); s.value = 'aurore'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await ev(() => window.Galaxie.regler({ qualite: 'moyenne', fpsMax: 0 }));
const ordre = (a, p = {}) => ev((a, p) => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'saturne', action: a, params: p }), a, p);
await ev(() => window.Galaxie.nav.allerA('saturne', { entrer: true }));
await page.waitForFunction(() => window.Saturne && window.Saturne.etat().actif && window.Saturne.etat().entree, { timeout: 90000 }); await attendre(1000);
await ordre('ouvrir_salle_medicale');
await page.waitForFunction(() => { const a = window.Saturne.anatomieObjet && window.Saturne.anatomieObjet(); return a && a.etatPublic().visibles >= 200; }, { timeout: 90000 }); await attendre(1500);
const mesure = () => ev(() => [...document.querySelectorAll('.saf')].map(el => { const r = el.getBoundingClientRect(), c = getComputedStyle(el); return { id: el.dataset.id, genre: el.dataset.genre, r: [r.x, r.y, r.width, r.height].map(Math.round), op: c.opacity, anim: c.animationPlayState }; }));
await ev(() => document.querySelector('[data-a="cat-mouvements"]').click()); await attendre(1200);
console.log('catalogue mouvements', JSON.stringify(await mesure()));
await ev(() => document.querySelector('[data-a="cat-pathologies"]').click()); await attendre(1200);
console.log('+ pathologies', JSON.stringify(await mesure()));
await ordre('animer', { mouvement: 'squat' }); await attendre(2500);
console.log('+ squat', JSON.stringify(await mesure()));
console.log('erreurs', erreurs.filter(m => !/faireconomy|ERR_FAILED|404|CORS|bls/.test(m)).slice(0, 4));
await navigateur.close(); process.exit(0);
