import { creerHoteLocal } from '../pc/agent-btc/hote-local.js';
import { ouvrirStockageBtc } from '../pc/agent-btc/stockage-btc.js';
import { marcheM5 } from '../tests/synth-m5.mjs';
import { fauxBinance } from '../tests/faux-binance.mjs';
const PAS = 900e3, derive = h => (h >= 14 && h < 15 ? 0.25 : 0), now0 = Math.floor(Date.UTC(2023, 5, 1, 12, 0) / PAS) * PAS, t0 = now0 - 110000 * PAS;
const serie = marcheM5({ n: 110200, graine: 9, derive, t0 }), horloge = { t: now0 }, lire = fauxBinance(serie, horloge), stockage = await ouvrirStockageBtc(null);
const hote = creerHoteLocal({ stockage, lire, maintenant: () => horloge.t, periodeMs: 3600e3, pausePersonnalisee: 0, annees: 9, surChangement: () => {}, surAlerte: () => {}, surNotification: () => {}, envoyerTelegram: async () => {} });
const T = Date.now(); await hote.demarrer({ synchro: true, boucleDirect: false }); console.log('données', hote.vue().donnees.n, (Date.now() - T) / 1000);
const regle = { nom: 'NY', cote: 'long', conditions: [{ type: 'session', valeurs: [2] }, { type: 'volume', min: 1 }, { type: 'delta', sens: 'avec', ratioMin: 0 }], stop: { type: 'atr', tf: 'h1', k: 1.5 }, R: 2 };
const id = (await hote.commande({ type: 'idee_proposer', regle })).id; await hote.commande({ type: 'profil', patch: { cible: 1 } }); console.log(JSON.stringify((await hote.commande({ type: 'idee_valider', id })).message));
for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 20)); const v = hote.vue(); console.log(i, JSON.stringify(v.progres), 'N', v.recherche.N, 'strat', v.strategies.length, 'boucle', hote._boucle(), 'err', v.erreur); if (!hote._boucle() && v.strategies.length) break; }
hote.detruire(); process.exit(0);
