// VRAIE recherche M4 (hypotheses de microstructure preenregistrees dans docs/microstructure-btc.md, section 3) sur les vraies donnees :
// 4 ans de bougies M15 Binance + financement, interet ouvert, ratios (cache donnees-btc-cache/deriv, voir telecharger-deriv.mjs).
// Criteres d'acceptation version 1 INCHANGES (empreinte c9995253). Compteur de variantes cumule : demarre a 2973 (cinq premieres familles). Une seule generation (grilles declarees).
// Le jeu final n'est ouvert que si une candidate passe tout le reste, UNE seule fois (coffre sauvegarde dans donnees-btc-cache/coffre-micro.json).
// Lancer :  node planetes/mars/outils-agent/recherche-micro.mjs      (SAUVER=1 pour memoriser le coffre et le verdict)
import fs from 'node:fs';
import path from 'node:path';
import { historiqueReel, DOSSIER_CACHE } from '../tests/aide-btc.mjs';
import { rechercher } from '../pc/agent-btc/boucle.js';
import { ORDRE_MICRO } from '../pc/agent-btc/hypotheses-micro.js';
import { empreinteCriteres } from '../pc/agent-btc/criteres.js';
import { creerDeriv } from '../pc/agent-btc/deriv-donnees.js';
import { stockageFichier } from '../../../app-pc/veilleur/stockage-fichier.mjs';

const { serie } = await historiqueReel({ annees: 4 });
const deriv = creerDeriv({ stockage: stockageFichier(path.join(DOSSIER_CACHE, 'deriv')), annees: 4 }); await deriv.charger();
const brut = deriv.brut();
console.log('Bougies M15 :', serie.n, '| financement :', brut.funding.length, '| mesures 5 min :', brut.metrics.length, '| criteres', empreinteCriteres());
const fichierCoffre = path.join(DOSSIER_CACHE, 'coffre-micro.json');
const coffre = fs.existsSync(fichierCoffre) ? JSON.parse(fs.readFileSync(fichierCoffre, 'utf8')) : { ouverts: [] };
const t = Date.now();
const v = await rechercher({ m15: serie, coffre, nVarianteDepart: 2973, familles: ORDRE_MICRO, generationsMax: 1, derivBrut: brut, budget: { variantesMax: 5000, tempsMs: 900000 },
  surEvenement: e => { if (e.type === 'journal') { const x = e.entree; if (x.etape === 'famille') { const h = x.resultats && x.resultats.horsEchantillon, z = x.resultats && x.resultats.zoneA; console.log('[' + x.famille + (x.apresAjustement ? ' (apres ajustement)' : '') + '] ' + x.decision.toUpperCase() + ' | zone de recherche: ' + (z ? 'n=' + z.n + ' esp=' + (z.esperance == null ? '-' : z.esperance.toFixed(3)) + 'R' : '-') + ' | hors echantillon: ' + (h ? 'n=' + h.n + ' esp=' + (h.esperance == null ? '-' : h.esperance.toFixed(3)) + 'R PF=' + (h.factProfit == null ? '-' : h.factProfit.toFixed(2)) : '-') + '\n     ' + x.pourquoi.slice(0, 420)); } else console.log('[' + x.etape + '] ' + String(x.pourquoi).slice(0, 300)); } } });
console.log('\nVERDICT', v.etat, '-', v.resume, '\nN variantes (cumul)', v.nVariantes, '(cette recherche :', v.nVariantesCetteRecherche + ') duree', Math.round((Date.now() - t) / 1000), 's');
if (v.strategie && v.strategie.jeuFinal) console.log('jeu final', JSON.stringify(v.strategie.jeuFinal.stats));
if (process.env.SAUVER) { fs.writeFileSync(fichierCoffre, JSON.stringify(v.coffre)); const g = { ...v }; delete g.journal; fs.writeFileSync(path.join(DOSSIER_CACHE, 'verdict-micro.json'), JSON.stringify(g)); fs.writeFileSync(path.join(DOSSIER_CACHE, 'journal-micro.json'), JSON.stringify(v.journal)); }
