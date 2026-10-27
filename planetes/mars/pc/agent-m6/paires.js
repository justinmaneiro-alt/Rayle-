/* ═════════════ LES TROIS PAIRES DE L'AGENT : BTC, SOL, DOGE (M6 ; module pur, testé : planetes/mars/tests/m6-fiabilite-test.mjs) ═════════════
   Limites des API vérifiées EN VRAI le 2026-10-23 depuis le PC (France) :
   - Binance data-api.binance.vision : CORS ouvert (Access-Control-Allow-Origin: *), 1000 bougies par appel, volume acheteur « taker » (delta RÉEL). Début de l'historique M15 :
     BTCUSDT 2017-08, SOLUSDT 2020-08-11, DOGEUSDT 2019-07-05. Principale pour l'historique profond ET le direct (appel direct du navigateur).
   - Kraken api.kraken.com /0/public/OHLC : 721 bougies au plus (≈ 7,5 jours en M15), le paramètre `since` n'y change rien pour les vieilles dates (renvoie toujours les 720 dernières) ; AUCUN en-tête
     Access-Control-Allow-Origin : le navigateur ne peut PAS l'appeler directement. Paires : XBTUSD (clé de réponse XXBTZUSD), SOLUSD, XDGUSD (DOGE = XDG chez Kraken). Les frais ne sont PAS publiés par
     /AssetPairs (liste vide) : ils sont donc RÉGLABLES ici, avec des valeurs prudentes marquées « à vérifier dans ton contrat Kraken Prop ». /Trades : 1000 transactions par appel (historique tick par tick, non utilisé).
   - Le recoupement avec Kraken passe par le Veilleur du PC (Node n'a pas de CORS) ou par le Worker (route /marche) ; sans lui : « recoupement indisponible », jamais inventé. */
export const PAIRES = Object.freeze({
  BTC: { id: 'BTC', nom: 'Bitcoin', binance: 'BTCUSDT', kraken: 'XBTUSD', krakenCle: 'XXBTZUSD', futuresBinance: 'BTCUSDT', decimales: 1, ronds: [1000, 5000], debutHistorique: Date.UTC(2017, 7, 17), couts: { fraisPct: 0.06, spreadPct: 0.02, glissementPct: 0.02 } },
  SOL: { id: 'SOL', nom: 'Solana', binance: 'SOLUSDT', kraken: 'SOLUSD', krakenCle: 'SOLUSD', futuresBinance: 'SOLUSDT', decimales: 2, ronds: [5, 10], debutHistorique: Date.UTC(2020, 7, 11), couts: { fraisPct: 0.06, spreadPct: 0.04, glissementPct: 0.04 } },
  DOGE: { id: 'DOGE', nom: 'Dogecoin', binance: 'DOGEUSDT', kraken: 'XDGUSD', krakenCle: 'XDGUSD', futuresBinance: 'DOGEUSDT', decimales: 5, ronds: [0.01, 0.05], debutHistorique: Date.UTC(2019, 6, 5), couts: { fraisPct: 0.06, spreadPct: 0.06, glissementPct: 0.06 } }
});
export const ORDRE_PAIRES = ['BTC', 'SOL', 'DOGE'];
export const paire = id => PAIRES[String(id).toUpperCase()] || null;
export const ALIAS_PAIRES = { BTC: ['btc', 'bitcoin', 'bit coin', 'xbt'], SOL: ['sol', 'solana'], DOGE: ['doge', 'dogecoin', 'doge coin', 'dodge'] };
export function trouverPaire(texte) {
  const t = ' ' + String(texte || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  let meilleur = null, taille = 0;
  for (const [id, alias] of Object.entries(ALIAS_PAIRES)) for (const a of alias) if (a.length > taille && t.includes(' ' + a + ' ')) { meilleur = id; taille = a.length; }
  return meilleur;
}

/* Sources de bougies M15 d'une paire : même forme que agent-btc/sources.js (Binance pour l'historique et le direct). Le secours Bitstamp existe pour BTC seulement (SOL et DOGE n'y ont pas
   d'historique profond d'après la sonde) : pour SOL et DOGE, sans Binance (pays fermés), l'historique profond est INDISPONIBLE et l'agent le dit. */
export function sourceBinance(id) {
  const p = paire(id); if (!p) throw new Error('paire inconnue : ' + id);
  return {
    id: 'binance', nom: 'Binance', symbole: p.binance, paire: p.nom + '/USDT', deltaReel: true, limite: 1000, pauseMs: 150,
    url: (t0, limite) => 'https://data-api.binance.vision/api/v3/klines?symbol=' + p.binance + '&interval=15m&limit=' + limite + '&startTime=' + t0,
    analyser: j => { if (!Array.isArray(j)) throw new Error('réponse Binance inattendue'); return j.map(k => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5], vb: k.length >= 10 ? +k[9] : NaN })); }
  };
}
/* Kraken : lecture d'une réponse OHLC (bougies fermées seulement : la dernière, en cours, est écartée). */
export function analyserKraken(j, id) {
  const p = paire(id); if (!p) throw new Error('paire inconnue');
  if (!j || (j.error && j.error.length)) throw new Error('Kraken : ' + (j && j.error && j.error[0] || 'réponse vide'));
  const liste = j.result && (j.result[p.krakenCle] || j.result[Object.keys(j.result).find(k => k !== 'last')]);
  if (!Array.isArray(liste)) throw new Error('réponse Kraken inattendue');
  return liste.slice(0, -1).map(k => ({ t: +k[0] * 1000, o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[6] }));
}
export const urlKraken = (id, depuis = null) => 'https://api.kraken.com/0/public/OHLC?pair=' + paire(id).kraken + '&interval=15' + (depuis ? '&since=' + Math.floor(depuis / 1000) : '');
export const URL_FUNDING = (id, t0, limite = 1000) => 'https://fapi.binance.com/fapi/v1/fundingRate?symbol=' + paire(id).futuresBinance + '&startTime=' + t0 + '&limit=' + limite;

export const LIMITES_API = Object.freeze({
  binance: { bougiesParAppel: 1000, cors: true, delta: 'réel', historique: { BTC: '2017-08', SOL: '2020-08-11', DOGE: '2019-07-05' } },
  kraken: { bougiesParAppel: 721, cors: false, delta: 'aucun', fraisPublies: false, note: '720 dernières bougies seulement (≈ 7,5 jours en M15) ; pas de CORS : passer par le Veilleur ou le Worker' },
  bitstamp: { bougiesParAppel: 1000, cors: true, delta: 'estimé', note: 'secours pour BTC seulement' }
});
