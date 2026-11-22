/* ═════════════ BOOKMAP : FLUX EN DIRECT (v12) ═════════════
   Binance perpétuels, sans clé : carnet complet par différences toutes les 100 ms (@depth@100ms, adresse « public ») + instantané REST de 1 000 niveaux, et transactions
   agrégées (@aggTrade, adresse « market », côté de l'AGRESSEUR). Le carnet local est resynchronisé tout seul à chaque trou. Lecture seule. */
import { ouvrir, BINANCE_WS_PUBLIC, BINANCE_WS_MARCHE, SYMBOLES_LIVE } from './volume-live.js';
import { creerCarnetLocal } from './bookmap-calcul.js';

export const SYMBOLES_BOOKMAP = Object.freeze({ or: 'XAUUSDT', btc: 'BTCUSDT', sol: 'SOLUSDT' });
export const BOOKMAP_POSSIBLE = id => !!SYMBOLES_BOOKMAP[id];
export const RAISON_INDISPONIBLE = 'Bookmap : réservé aux actifs qui ont un vrai carnet d’ordres gratuit (Bitcoin, Solana et l’or via les perpétuels Binance). Les indices (futures CME), le forex et le dollar n’ont pas de carnet public gratuit : il n’y a rien à cartographier.';

export function parseDepth(msg) { const d = msg && msg.data; if (!d || d.e !== 'depthUpdate') return null; return { U: d.U, u: d.u, pu: d.pu, b: d.b || [], a: d.a || [], E: d.E || d.T || Date.now() }; }
export function parseTrade(msg) { const d = msg && msg.data; if (!d || d.e !== 'aggTrade') return null; return { t: d.T, prix: +d.p, qte: +d.q, cote: d.m ? 'vente' : 'achat' }; }

/* surCarnet(carnetLocal, t) est appelé au plus toutes les `cadenceMs` ; surTrade(tr) à chaque transaction ; surEtat({ carnet, trades, raison }) */
export function demarrerFlux({ actif, surCarnet, surTrade, surEtat = () => {}, WS = globalThis.WebSocket, fetchFn = (...a) => (globalThis.__fetchReel || globalThis.fetch)(...a), cadenceMs = 200, maintenant = () => Date.now() } = {}) {
  const sym = SYMBOLES_BOOKMAP[actif], live = SYMBOLES_LIVE[actif]; if (!sym || !live) throw new Error('Bookmap : pas de carnet pour ' + actif);
  const carnet = creerCarnetLocal(); let ferme = false, enSync = false, essais = 0, tDernier = 0, etatC = 'connexion', etatT = 'connexion', timer = 0, nbDiff = 0, nbTrades = 0;
  const etat = () => surEtat({ carnet: etatC, trades: etatT, diffs: nbDiff, transactions: nbTrades, resyncs: carnet.resyncs(), niveaux: carnet.taille() });
  async function synchroniser() {
    if (ferme || enSync) return; enSync = true;
    try {
      const r = await fetchFn(`https://fapi.binance.com/fapi/v1/depth?symbol=${sym}&limit=1000`, { signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined }); if (!r.ok) throw new Error('HTTP ' + r.status);
      const s = await r.json(); const res = carnet.instantane({ lastUpdateId: s.lastUpdateId, bids: s.bids, asks: s.asks });
      if (res === 'resync') throw new Error('instantané en retard sur le flux'); essais = 0; etatC = 'connecte'; etat();
    } catch (e) { essais++; etatC = 'synchronisation'; etat(); clearTimeout(timer); if (!ferme) timer = setTimeout(synchroniser, Math.min(8000, 600 * Math.pow(1.6, essais))); }
    finally { enSync = false; }
  }
  const fD = ouvrir(BINANCE_WS_PUBLIC + `${live.binance}@depth@100ms`, { WS,
    surMessage: m => { const e = parseDepth(m); if (!e) return; nbDiff++; const r = carnet.evenement(e); if (r === 'resync') { etatC = 'synchronisation'; synchroniser(); } if (r === 'ok') { const t = maintenant(); if (t - tDernier >= cadenceMs) { tDernier = t; try { surCarnet(carnet, t); } catch (x) { /* l'affichage ne doit jamais couper le flux */ } } } },
    surEtat: e => { if (e.etat === 'connecte') { etatC = 'synchronisation'; carnet.reinitialiser(); synchroniser(); } else etatC = e.etat === 'erreur' ? 'injoignable' : e.etat; etat(); } });
  const fT = ouvrir(BINANCE_WS_MARCHE + `${live.binance}@aggTrade`, { WS,
    surMessage: m => { const t = parseTrade(m); if (t) { nbTrades++; try { surTrade(t); } catch (x) { /* idem */ } } },
    surEtat: e => { etatT = e.etat === 'connecte' ? 'connecte' : e.etat === 'erreur' ? 'injoignable' : e.etat; etat(); } });
  return { fermer() { ferme = true; clearTimeout(timer); try { fD.fermer(); fT.fermer(); } catch (e) { /* déjà fermés */ } }, carnet, etat: () => ({ carnet: etatC, trades: etatT, diffs: nbDiff, transactions: nbTrades, resyncs: carnet.resyncs(), niveaux: carnet.taille() }) };
}
