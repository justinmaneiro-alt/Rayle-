import { ouvrirGalaxie, attendre, attendreChargement } from './terre-aide.mjs';
import { demarrerWorkerReel } from './worker-local-reel.mjs';

/* Démonstration avec de VRAIES données : vrais flux d'actualités (médias français, régionaux, internationaux), vraie météo, vraies tuiles ; l'« agent » est la simulation
   locale (agent-local.mjs : règles simples + vrais outils, sans IA). Captures dans captures-terre/actus-reel/. */
import fs from 'node:fs'; const SORTIE = '../captures-terre/actus-reel/'; fs.mkdirSync(SORTIE, { recursive: true });
const worker = await demarrerWorkerReel(8798);
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: +(process.env.L || 1600), hauteur: +(process.env.H || 900), avant: async p => {
  await p.evaluateOnNewDocument(u => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', u); localStorage.setItem('rayle_worker_token', 'test'); }, worker.url);
} });
const G = (f, ...a) => page.evaluate(f, ...a);
await G(() => { window.__dits = []; window.speak = async t => { const s = window.Terre ? window.Terre.sujetsEtat() : {}; window.__dits.push({ t, ecl: s.eclaire }); await new Promise(r => setTimeout(r, 4200)); }; });
const demander = async (phrase, captures) => {
  await G(p => { window.__fini = false; window.__dits.length = 0; respond(p).then(() => { window.__fini = true; }); }, phrase);
  let k = 0; const t0 = Date.now();
  while (!(await G(() => window.__fini)) && Date.now() - t0 < 120000) {
    const n = await G(() => window.__dits.length);
    if (n > k && captures) { k = n; await attendre(3300); await page.screenshot({ path: SORTIE + captures + '-' + String(k).padStart(2, '0') + '.png' }); }
    await attendre(300);
  }
  const d = await G(() => window.__dits.slice()); const e = await G(() => window.Terre && window.Terre.sujetsEtat());
  console.log('«', phrase, '» →', d.length, 'segments parlés');
  d.forEach((x, i) => console.log('   ' + i + ' [' + (x.ecl || '-') + '] ' + x.t.slice(0, 170)));
  return { d, e };
};
await demander('montre-moi l’actualité en France', 'france');
await attendre(1500); await page.screenshot({ path: SORTIE + 'france-fin.png' });
await demander('quoi de neuf dans le Sud-Ouest ?', 'sud-ouest');
await attendre(1500); await page.screenshot({ path: SORTIE + 'sud-ouest-fin.png' });
await demander('dis-moi l’actualité mondiale', 'monde');
await attendre(1500); await page.screenshot({ path: SORTIE + 'monde-fin.png' });
await demander('qu’est-ce qui se passe au Japon ?', 'japon');
await demander('quel temps fait-il à Biarritz ?', null); await attendre(3500); await attendreChargement(page, { calme: 900 }); await page.screenshot({ path: SORTIE + 'meteo-biarritz.png' });
console.log('erreurs :', erreurs.filter(e => !/faireconomy|404|408|ERR_FAILED|Failed to load/.test(e)).join('\n  ') || 'aucune');
await navigateur.close(); await worker.fermer();
process.exit(0);
