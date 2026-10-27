// Essai à blanc de la recherche sans fin sur les vraies bougies : le jeu final n'est JAMAIS ouvert (on ne le regarde pas pendant le développement).
import { historiqueReel } from '../tests/aide-btc.mjs';
import { trancher, etatInitial } from '../pc/agent-btc/recherche-continue.js';
import fs from 'node:fs';
import os from 'node:os';
try { os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) { /* tant pis */ }
const minutes = Number(process.argv[2] || 10), sortie = process.argv[3] || 'essai-m5.json';
const { serie } = await historiqueReel({ annees: 9 });
const etat = etatInitial(), t0 = Date.now();
let tranches = 0;
while (Date.now() - t0 < minutes * 60000) {
  const r = await trancher(etat, { m15: serie, sansJeuFinal: true, budget: { chantiersMax: 400, tempsMs: 60000 }, surEvenement: e => { if (e.type === 'candidat_sans_jeu_final') console.log('CANDIDATE', e.nom, JSON.stringify(e.oos)); } });
  tranches++;
  console.log(((Date.now() - t0) / 60000).toFixed(1) + ' min · N=' + etat.N + ' · niveau ' + etat.niveau + ' curseur ' + etat.curseur + ' · graine ' + etat.graine + ' · finalistes ' + etat.finalistes.length + ' · pistes ' + etat.pistes.length);
  fs.writeFileSync(sortie, JSON.stringify(etat));
  if (r.stop === 'arret' || r.stop === 'refus') break;
}
console.log('compteurs', JSON.stringify(etat.compteurs));
console.log('presque', JSON.stringify(etat.presque.map(p => [p.nom, p.n, +p.esperance.toFixed(3), +p.Rtotal.toFixed(1), p.echecs.length])));
