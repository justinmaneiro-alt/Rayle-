import fs from 'node:fs';
import { historiqueReel } from '../tests/aide-btc.mjs';
import { rechercher } from '../pc/agent-btc/boucle.js';
/* Lance la VRAIE recherche (critères figés, vraies bougies, coffre dans donnees-btc-cache/coffre-essai.json : le jeu final n'est ouvert qu'une fois). `GEN=2` générations. */
const { serie } = await historiqueReel({ annees: 4 });
const fichier = new URL('../../../donnees-btc-cache/coffre-essai.json', import.meta.url);
const coffre = fs.existsSync(fichier) ? JSON.parse(fs.readFileSync(fichier, 'utf8')) : { ouverts: [] };
const t = Date.now();
const v = await rechercher({ m15: serie, coffre, generationsMax: Number(process.env.GEN) || 2, surEvenement: e => { if (e.type === 'journal' && e.entree.etape !== 'famille') console.log('[' + e.entree.etape + ']', e.entree.pourquoi); if (e.type === 'journal' && e.entree.etape === 'famille') console.log(`  g${e.entree.generation} ${e.entree.famille} → ${e.entree.decision}${e.entree.apresAjustement ? ' (après ajustement)' : ''} : ${e.entree.pourquoi.slice(0, 260)}`); } });
console.log('\nVERDICT', v.etat, '—', v.resume, '\nN variantes', v.nVariantes, 'durée', Math.round((Date.now() - t) / 1000), 's');
if (v.strategie && v.strategie.jeuFinal) console.log('jeu final', JSON.stringify(v.strategie.jeuFinal.stats));
if (process.env.SAUVER) fs.writeFileSync(fichier, JSON.stringify(v.coffre));
