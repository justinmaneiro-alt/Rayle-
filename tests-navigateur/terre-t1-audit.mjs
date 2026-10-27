/* T1 : audit par parcours (vrais serveurs de tuiles). Descente du monde à la rue sur 12 lieux, captures + mesures.
   Usage : node tests-navigateur/terre-t1-audit.mjs [dossier] ; env L, H, LIEUX=a,b ALTS=2400,200,20 */
import { ouvrirGalaxie, entrerEnOrbite, attendre, attendreChargement } from './terre-aide.mjs';
import fs from 'node:fs';
const dossier = process.argv[2] || 'docs/captures-t1/avant';
fs.mkdirSync(dossier, { recursive: true });
export const LIEUX = {
  paris: [2.3522, 48.8566], alpes: [6.865, 45.833], cote: [4.0, 43.45], desert: [10.0, 25.0], ocean: [-140, 0],
  pole_nord: [0, 89], pole_sud: [0, -89], date: [179.9, -17.7], tokyo: [139.69, 35.69], issac: [3.08, 45.65],
  commune: [1.17, 43.17], sans_tuiles: [-45, 75], italie: [9.1, 45.4]
};
const MOMENT = process.env.MOMENT || '';   // jour | crep | nuit : heure solaire locale simulée (équinoxe) ; vide = heure réelle
const choix = (process.env.LIEUX || Object.keys(LIEUX).join(',')).split(',');
const alts = (process.env.ALTS || '2400,300,40').split(',').map(Number);
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: +(process.env.L || 1600), hauteur: +(process.env.H || 900) });
await entrerEnOrbite(page);
const bilan = [];
for (const nom of choix) {
  const [lon, lat] = LIEUX[nom];
  for (const alt of [8000, ...alts]) {
    await page.evaluate(([lon, lat, d]) => window.Terre.placer({ lon, lat, dist: d, cap: 0.3, incl: d < 100 ? 0.9 : 0.2 }), [lon, lat, alt]);
    if (MOMENT) { const h = { jour: 12, crep: 17.7, nuit: 0.5 }[MOMENT]; const hu = ((h - lon / 15) % 24 + 24) % 24; await page.evaluate(([hu]) => window.Terre.definirDate(new Date(Date.UTC(2026, 8, 23, Math.floor(hu), Math.round((hu % 1) * 60)))), [hu]); }
    const ok = await attendreChargement(page, { calme: 700, max: 40000 });
    await page.screenshot({ path: `${dossier}/${nom}-${alt}${MOMENT ? '-' + MOMENT : ''}.png` });
    if (process.env.SRC) console.log('sources', JSON.stringify(await page.evaluate(() => window.Terre.sourcesAffichees ? window.Terre.sourcesAffichees() : null)));
    const s = await page.evaluate(() => { const s = window.Terre.stats(); return { aff: s.affichees.length, tuiles: s.tuiles, vram: Math.round(s.vram / 1048576), erreurs: s.erreurs }; });
    bilan.push({ nom, alt, ok, ...s });
    console.log(nom, alt, JSON.stringify(s), ok ? '' : 'CHARGEMENT INCOMPLET');
  }
}
fs.writeFileSync(`${dossier}/bilan.json`, JSON.stringify(bilan, null, 1));
console.log('erreurs :', erreurs.filter(e => !/faireconomy|404|408|ERR_FAILED/.test(e)).join('\n  ') || 'aucune');
await navigateur.close();
