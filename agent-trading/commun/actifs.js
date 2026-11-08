/* ═════════════ ACTIFS DE L'AGENT DE TRADING (partagé moteur + affichage) ═════════════
   Source unique : Kraken Futures (perpétuels « PF_ »), données PUBLIQUES seulement. Vérifié le 2026-11-03 (voir RAPPORT-AGENT.md).
   « lot » = pas de quantité (contractValueTradePrecision), « tick » = pas de prix. « tradable » = l'agent peut proposer des positions SI la porte
   de liquidité (volume 24 h + profondeur du carnet, recalculée en direct par le moteur) est franchie ; sinon l'actif est en LECTURE SEULE. */
export const ACTIFS = [
  { id: 'BTC',    nom: 'Bitcoin',          symbole: 'PF_XBTUSD',  lot: 0.0001, tick: 1,     unite: 'BTC',  decimales: 0, tradable: true },
  { id: 'ETH',    nom: 'Ether',            symbole: 'PF_ETHUSD',  lot: 0.001,  tick: 0.1,   unite: 'ETH',  decimales: 2, tradable: true },
  { id: 'HYPE',   nom: 'Hyperliquid',      symbole: 'PF_HYPEUSD', lot: 0.1,    tick: 0.001, unite: 'HYPE', decimales: 3, tradable: true },
  { id: 'OR',     nom: 'Or (once)',        symbole: 'PF_XAUUSD',  lot: 0.001,  tick: 0.01,  unite: 'oz',   decimales: 2, tradable: true },
  { id: 'SP500',  nom: 'S&P 500 (SPYx)',   symbole: 'PF_SPYXUSD', lot: 0.001,  tick: 0.01,  unite: 'SPYx', decimales: 2, tradable: false,
    raison: 'Perpétuel sur le jeton SPYx : ~200 000 $ échangés par jour et ~40 niveaux de carnet. Ce volume ne reflète pas le vrai S&P 500 : lecture seule.' },
  { id: 'NASDAQ', nom: 'Nasdaq 100 (QQQx)', symbole: 'PF_QQQXUSD', lot: 0.001, tick: 0.01,  unite: 'QQQx', decimales: 2, tradable: false,
    raison: 'Perpétuel sur le jeton QQQx : ~370 000 $ échangés par jour et ~40 niveaux de carnet. Ce volume ne reflète pas le vrai Nasdaq : lecture seule.' }
];
/* Périmètre de l'interface (2026-11-07) : l'OR seul. BTC, ETH, HYPE, S&P et Nasdaq sont MASQUÉS (pas supprimés ; le moteur continue de les suivre ;
   copie de leur code et de leurs données dans idees/actifs-hors-or/). Réglage pour les réafficher : localStorage « rayle_at_tous_actifs » = « 1 ». */
export const ACTIFS_INTERFACE = ['OR'];
export function actifsVisibles(store = globalThis.localStorage) {
  let tous = false; try { tous = !!store && store.getItem('rayle_at_tous_actifs') === '1'; } catch (e) { /* stockage refusé */ }
  return tous ? ACTIFS : ACTIFS.filter(a => ACTIFS_INTERFACE.includes(a.id));
}
/* Terminal de Rayle (2026-11-08) : instruments supplémentaires connus du CARNET seulement (jamais suivis par le moteur : ils ne sont pas dans ACTIFS). */
export const ACTIFS_CARNET_TERMINAL = [
  { id: 'US100', nom: 'Nasdaq 100', symbole: 'PF_US100USD', lot: 0.0001, tick: 1,       unite: 'indice', decimales: 0, tradable: false },
  { id: 'SOL',   nom: 'Solana',     symbole: 'PF_SOLUSD',   lot: 0.01,   tick: 0.01,    unite: 'SOL',    decimales: 2, tradable: false },
  { id: 'DOGE',  nom: 'Dogecoin',   symbole: 'PF_DOGEUSD',  lot: 1,      tick: 0.00001, unite: 'DOGE',   decimales: 5, tradable: false }
];
export const PAR_ID = Object.fromEntries(ACTIFS.concat(ACTIFS_CARNET_TERMINAL).map(a => [a.id, a]));
export const PAR_SYMBOLE = Object.fromEntries(ACTIFS.map(a => [a.symbole, a]));
export const UNITES = { M15: 15 * 60e3, H1: 60 * 60e3 };
