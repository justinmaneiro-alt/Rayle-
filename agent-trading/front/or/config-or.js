/* ═════════════ TABLEAU DE BORD DE L'OR : CONSTANTES ET RÈGLES FIGÉES (version « zones-or-v1 », écrite le 2026-11-07 avant toute mesure) ═════════════
   Rien ici ne change sans changer de version. Ces règles sont recopiées mot pour mot dans le rapport local (RAPPORT-TABLEAU-OR.md). */
export const RELAIS = 'https://rayle-or-relais.justinmaneiro.workers.dev';
export const KRAKEN = Object.freeze({ symbole: 'PF_XAUUSD', tailleContrat: 1, pasQuantite: 0.001, pasPrix: 0.01 });   // vérifié le 2026-11-07 : contractSize 1 (once), contractValueTradePrecision 3
export const BINANCE = Object.freeze({ symbole: 'XAUUSDT', klines: 'https://fapi.binance.com/fapi/v1/klines', ticker: 'https://fapi.binance.com/fapi/v1/ticker/24hr' });
export const PERIODES = Object.freeze({
  M5:  { id: 'M5',  ms: 5 * 60e3,   kraken: '5m',  binance: '5m',  nom: '5 min' },
  M15: { id: 'M15', ms: 15 * 60e3,  kraken: '15m', binance: '15m', nom: '15 min' },
  H1:  { id: 'H1',  ms: 60 * 60e3,  kraken: '1h',  binance: '1h',  nom: '1 h' },
  H4:  { id: 'H4',  ms: 4 * 3600e3, kraken: '4h',  binance: '4h',  nom: '4 h' },
  J:   { id: 'J',   ms: 86400e3,    kraken: '1d',  binance: '1d',  nom: 'jour' }
});
export const REGLES = Object.freeze({
  version: 'zones-or-v1',
  atr: 14,                       // ATR H1 sur 14 bougies
  approche: 0.5,                 // « approche » : moins de 0,5 ATR H1 du bord de la zone
  sur: 0.25,                     // « sur la zone » : moins de 0,25 ATR H1 du bord (ou dedans)
  rejetEcart: 0.25,              // « rejet » : clôture M15 qui s'éloigne de la zone d'au moins 0,25 ATR H1…
  cassureEcart: 0.25,            // « cassure » : clôture M15 au-delà de la zone de 0,25 ATR H1…
  volumeMedianeN: 20,            // … avec un volume ≥ la médiane des 20 dernières M15 (référence Binance)
  reaction: { rejet: 0.5, depassement: 0.25 },   // zone qui « tient » : rejet ≥ 0,5 ATR H1 avant de la dépasser de 0,25 ATR H1
  minCas: 30,                    // « pas assez de données » sous 30 cas
  hasard: 1000,                  // 1000 niveaux tirés au hasard
  rondPas: 50,                   // niveaux ronds de 50 $
  zonesMax: 5, zonesMin: 3,
  repetitionMin: 60,             // un seul message par zone et par événement, 60 min avant de répéter
  plafondJour: 8,
  calme: { de: 23, a: 7 },
  volumeFaible24h: 50e6          // référence Binance : sous 50 M$ échangés sur 24 h → « données peu fiables »
});
export const TEXTE_REGLES = `Règles figées ${REGLES.version} (écrites le 2026-11-07 avant toute mesure) :
- « loin » : à plus de 0,5 ATR H1 du bord le plus proche de la zone ;
- « approche » : à moins de 0,5 ATR H1 du bord ;
- « sur la zone » : dans la zone ou à moins de 0,25 ATR H1 de son bord ;
- « rejet » : une bougie M15 clôture à au moins 0,25 ATR H1 de la zone, du côté d'où le prix est venu, avec un volume ≥ la médiane des 20 dernières M15 et un delta qui se retourne (delta de la bougie de signe opposé à celui de la bougie précédente, dans le sens du rejet) ;
- « cassure » : une bougie M15 clôture au-delà de la zone d'au moins 0,25 ATR H1, avec un volume ≥ la médiane des 20 dernières M15 ;
- une zone « tient » lors d'un test si le prix s'en éloigne d'au moins 0,5 ATR H1 avant de la dépasser de 0,25 ATR H1 ; le taux de réaction de chaque type est comparé à 1000 niveaux tirés au hasard ; « pas assez de données » sous 30 cas.`;
