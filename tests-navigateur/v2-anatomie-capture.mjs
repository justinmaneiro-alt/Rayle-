import fs from 'node:fs';
import { ouvrirGalaxieTheme, attendre } from './r2-aide.mjs';
/* V2 phase 5 : captures du squat avec les MUSCLES affichés (vue principale), à plusieurs phases. Sortie : docs/captures-v2/anat-*.png.
   MOUVEMENT=squat PHASES=0,0.3,0.5,0.75 SYSTEMES=muscles    node tests-navigateur/v2-anatomie-capture.mjs */
const SORTIE = 'docs/captures-v2/'; fs.mkdirSync(SORTIE, { recursive: true });
const mouv = process.env.MOUVEMENT || 'squat', phases = (process.env.PHASES || '0,0.3,0.5,0.75').split(',').map(Number), systemes = (process.env.SYSTEMES || 'muscles').split(',');
const { navigateur, page, erreurs } = await ouvrirGalaxieTheme({ largeur: 1600, hauteur: 900 });
const G = (f, ...a) => page.evaluate(f, ...a);
await G(() => window.Galaxie.nav.allerA('saturne', { entrer: true }));
await page.waitForFunction(() => window.Saturne && window.Saturne.etat().actif && window.Saturne.etat().entree, { timeout: 60000 }); await attendre(1000);
await G(() => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'saturne', action: 'ouvrir_salle_medicale', params: {} }));
await page.waitForFunction(() => { const a = window.Saturne.anatomieObjet && window.Saturne.anatomieObjet(); return a && a.etatPublic().visibles >= 200; }, { timeout: 60000 }); await attendre(1000);
for (const s of systemes) { await G(async s => { await window.Saturne.anatomieObjet().afficherSysteme(s); }, s); }
await attendre(1500);
await G(() => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'saturne', action: 'animer', params: { mouvement: 'squat' } }));
await attendre(2500);
if (process.env.SANS_FENETRES !== '0') await G(() => { const o = window.Saturne.anatomieObjet(); o.orchestre.glue.fenetres.fermerTout(); document.querySelector('.saf-barre') && (document.querySelector('.saf-barre').hidden = true); });
await G(() => window.Saturne.anatomieObjet().mouvementObjet().pause(true));
for (const ph of phases) {
  await G(p => window.Saturne.anatomieObjet().mouvementObjet().phase(p), ph); await attendre(900);
  await page.screenshot({ path: SORTIE + 'anat-' + mouv + '-' + String(ph).replace('.', '_') + '.png' }); console.log('capture phase', ph);
}
const d = await G(() => window.Saturne.anatomieObjet().mouvementObjet().detail());
console.log(JSON.stringify(d));
console.log('erreurs :', erreurs.filter(e => !/faireconomy|404|ERR_FAILED/.test(e)).slice(0, 5).join(' | ') || 'aucune');
await navigateur.close();
