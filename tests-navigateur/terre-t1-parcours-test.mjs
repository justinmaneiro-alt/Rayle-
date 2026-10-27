/* T1 : parcours automatisé sur plusieurs lieux et altitudes, avec chargement LENT (chaque tuile retardée) :
   jamais de trou ni de page vide, mémoire vidéo sous le plafond, caméra jamais sous le sol, aucune erreur de page.
   Usage : node tests-navigateur/terre-t1-parcours-test.mjs [LENT=ms]  (par défaut 700 ms de retard par tuile) */
import { ouvrirGalaxie, entrerEnOrbite, attendre, attendreChargement, compteur } from './terre-aide.mjs';
const RETARD = +(process.env.LENT ?? 700);
const c = compteur();
const LIEUX = { paris: [2.35, 48.86], alpes: [6.87, 45.83], ocean: [-140, 0], pole_nord: [0, 84.5], date: [179.9, -17.7], tokyo: [139.69, 35.69], issac: [3.08, 45.65], sans_tuiles: [-45, 75] };
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: 1280, hauteur: 720, avant: async p => {
  if (!RETARD) return;
  await p.setRequestInterception(true);
  p.on('request', r => {
    const u = r.url();
    if (/gibs\.earthdata|tiles\.maps\.eox|elevation-tiles|openfreemap/.test(u)) setTimeout(() => r.continue().catch(() => {}), RETARD * (0.4 + Math.random())); else r.continue().catch(() => {});
  });
} });
await entrerEnOrbite(page);
let pireVram = 0, trousMax = 0, sousSol = 0, videsPendant = 0, echantillons = 0;
for (const [nom, [lon, lat]] of Object.entries(LIEUX)) {
  for (const dist of [3000, 120, 12, 2.4]) {
    await page.evaluate(([lon, lat, dist]) => window.Terre.placer({ lon, lat, dist, cap: 0.3, incl: dist < 100 ? 0.9 : 0.1 }), [lon, lat, dist]);
    // pendant le chargement lent : la scène ne doit jamais être vide
    for (let i = 0; i < 6; i++) {
      await attendre(250);
      const s = await page.evaluate(() => ({ aff: window.Terre.stats().affichees.length, d: window.Terre.diagnostic().feuilles }));
      echantillons++; if (s.d > 0 && s.aff === 0 && i > 3) videsPendant++;
    }
    const fini = await attendreChargement(page, { calme: 900, max: 90000 });
    const s = await page.evaluate(() => {
      const d = window.Terre.diagnostic(), st = window.Terre.stats(), e = window.Terre.etat();
      return { aff: st.affichees.length, trous: d.trous, vram: st.vram / 1048576, vramMax: d.vramMax, alt: e.altitude, sol: e.sol };
    });
    pireVram = Math.max(pireVram, s.vram); trousMax = Math.max(trousMax, s.trous);
    if (s.sol !== null && s.alt < s.sol + 0.0349) sousSol++;
    c.verifier(`${nom} dist ${dist} : chargement terminé, tuiles affichées, aucun trou`, fini && s.aff > 0 && s.trous === 0, `aff ${s.aff}, trous ${s.trous}`);
  }
}
c.verifier('jamais de scène vide pendant le chargement lent', videsPendant === 0, `${videsPendant}/${echantillons}`);
c.verifier('mémoire vidéo sous le plafond du profil', pireVram <= 800 * 1.1, `pire ${Math.round(pireVram)} Mo`);
c.verifier('caméra jamais sous le sol', sousSol === 0, `${sousSol} cas`);
const e = erreurs.filter(x => !/faireconomy|404|408|ERR_FAILED|CONNECTION_REFUSED|CORS|Failed to load resource/.test(x));
c.verifier('aucune erreur de page', e.length === 0, e.slice(0, 3).join(' | '));
await navigateur.close();
process.exit(c.fin() ? 1 : 0);
