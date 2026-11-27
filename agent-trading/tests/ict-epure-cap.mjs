/* Capture rapide pour la mise au point : node agent-trading/tests/ict-epure-cap.mjs <vue> <unite> <mode> <fichier> (REEL=1 pour les vraies bougies) */
import { initPrix, lancer, ouvrir, VUES, w } from './ict-visuel-aide.mjs';
const [vue = 'tab1440', u = 'J', mode = 'complet', f = 'cap.png'] = process.argv.slice(2);
await initPrix(); const nav = await lancer(); const p = await ouvrir(nav, VUES[vue]);
await p.evaluate(() => document.querySelector('.tp-b-ict').click()); await w(1200);
await p.evaluate(x => document.querySelector(`[data-periode="${x}"]`).click(), u); await w(5000);
await p.evaluate(m => window.__or.ict.mode(m), mode); await w(1500);
await p.screenshot({ path: f }); console.log('erreurs', p.__err); await nav.close();
