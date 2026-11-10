/* ═════════════ TERMINAL DE RAYLE : LES 5 ACTIFS (pur, testé) ═════════════
   Vérifié le 2026-11-08 sur https://futures.kraken.com/derivatives/api/v3/instruments (tous « tradeable ») :
     PF_XAUUSD   or (once)            tick 0,01   précision de quantité 3   ouvert le 2026-08-05
     PF_US100USD Nasdaq 100 (indice)  tick 1      précision 4               ouvert le 2026-08-25
     PF_XBTUSD   Bitcoin              tick 1      précision 4               ouvert le 2022-03-22
     PF_SOLUSD   Solana               tick 0,01   précision 2               ouvert le 2022-03-22
     PF_DOGEUSD  Dogecoin             tick 0,00001 précision 0              ouvert le 2022-06-20
   Contrat = 1 unité de l'actif (contractSize 1) pour les cinq.
   Référence (historique plus ancien, volume) : Binance (CORS ouvert), décalée de l'écart MESURÉ sur les bougies communes.
   Or : PAXG (Binance spot PAXGUSDT, depuis 2020) en bande étiquetée, sans volume ni zones.
   Nasdaq : aucune référence Binance ; QQQx (PF_QQQXUSD, depuis 2025-12) mis à l'échelle par le RAPPORT mesuré, en bande étiquetée. */
export const ACTIFS_TERMINAL = Object.freeze([
  { id: 'OR', nom: 'Or', long: 'Or (once)', symbole: 'PF_XAUUSD', tick: 0.01, pasQ: 0.001, decimales: 2, unite: 'oz', ouvert: '2026-08-05',
    ref: { source: 'binance-f', symbole: 'XAUUSDT', nom: 'Binance XAUUSDT' }, bande: { source: 'binance-s', symbole: 'PAXGUSDT', nom: 'PAXG (Binance)', mode: 'ecart' }, cot: 'XAU' },
  { id: 'NASDAQ', nom: 'Nasdaq', long: 'Nasdaq 100', symbole: 'PF_US100USD', tick: 1, pasQ: 0.0001, decimales: 0, unite: 'indice', ouvert: '2026-08-25',
    ref: null, bande: { source: 'kraken', symbole: 'PF_QQQXUSD', nom: 'QQQx (Kraken) × rapport mesuré', mode: 'rapport' }, cot: 'NDX', secours: { source: 'worker', actif: 'NDX', nom: 'Yahoo ^NDX (indice) par le Worker' } },
  { id: 'BTC', nom: 'Bitcoin', long: 'Bitcoin', symbole: 'PF_XBTUSD', tick: 1, pasQ: 0.0001, decimales: 0, unite: 'BTC', ouvert: '2022-03-22',
    ref: { source: 'binance-f', symbole: 'BTCUSDT', nom: 'Binance BTCUSDT' }, bande: null, cot: 'BTC' },
  { id: 'SOL', nom: 'Solana', long: 'Solana', symbole: 'PF_SOLUSD', tick: 0.01, pasQ: 0.01, decimales: 2, unite: 'SOL', ouvert: '2022-03-22',
    ref: { source: 'binance-f', symbole: 'SOLUSDT', nom: 'Binance SOLUSDT' }, bande: null, cot: null },
  { id: 'DOGE', nom: 'Dogecoin', long: 'Dogecoin', symbole: 'PF_DOGEUSD', tick: 0.00001, pasQ: 1, decimales: 5, unite: 'DOGE', ouvert: '2022-06-20',
    ref: { source: 'binance-f', symbole: 'DOGEUSDT', nom: 'Binance DOGEUSDT' }, bande: null, cot: null }
]);
export const PAR_ID_T = Object.freeze(Object.fromEntries(ACTIFS_TERMINAL.map(a => [a.id, a])));
export const PAR_SYMBOLE_T = Object.freeze(Object.fromEntries(ACTIFS_TERMINAL.map(a => [a.symbole, a])));
export const ID_DEFAUT = 'OR';

export const UNITES = Object.freeze({
  M5:  { id: 'M5',  ms: 5 * 60e3,   kraken: '5m',  binance: '5m',  nom: '5 min' },
  M15: { id: 'M15', ms: 15 * 60e3,  kraken: '15m', binance: '15m', nom: '15 min' },
  H1:  { id: 'H1',  ms: 3600e3,     kraken: '1h',  binance: '1h',  nom: '1 h' },
  H4:  { id: 'H4',  ms: 4 * 3600e3, kraken: '4h',  binance: '4h',  nom: '4 h' },
  J:   { id: 'J',   ms: 86400e3,    kraken: '1d',  binance: '1d',  nom: 'Jour' }
});
export const ORDRE_UNITES = Object.freeze(['M5', 'M15', 'H1', 'H4', 'J']);

/* format d'un prix selon l'actif (espaces fines françaises) ; un formateur par nombre de décimales, créé une seule fois (même texte que toLocaleString, bien plus rapide) */
const FORMATEURS = new Map();
export function fmt(id, p, d) {
  if (p == null || !Number.isFinite(+p)) return '—';
  const a = PAR_ID_T[id], k = d != null ? d : a ? a.decimales : 2;
  let F = FORMATEURS.get(k); if (!F) { F = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: k, maximumFractionDigits: k }); FORMATEURS.set(k, F); }
  return F.format(Number(p)).replace(/[  ]/g, ' ');
}
/* arrondi au pas de prix de l'actif */
export function auTick(id, p) { const t = (PAR_ID_T[id] || {}).tick || 0.01; return Math.round(p / t) * t; }
/* reconnaît un actif dans une phrase (« le bitcoin », « nasdaq », « l'or », « doge ») */
export function actifDepuisTexte(texte) {
  const t = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/\b(bitcoin|btc|xbt)\b/.test(t)) return 'BTC';
  if (/\b(solana|sol)\b/.test(t)) return 'SOL';
  if (/\b(dogecoin|doge)\b/.test(t)) return 'DOGE';
  if (/\b(nasdaq|us100|us 100|ndx|nas100)\b/.test(t)) return 'NASDAQ';
  if (/\b(l'or|lor|or|gold|xau|xauusd)\b/.test(t)) return 'OR';
  return null;
}
export function uniteDepuisTexte(texte) {
  const t = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/\b(m5|5 ?min(ute)?s?|cinq minutes)\b/.test(t)) return 'M5';
  if (/\b(m15|15 ?min(ute)?s?|quinze minutes|quart d'heure)\b/.test(t)) return 'M15';
  if (/\b(h4|4 ?h(eures?)?|quatre heures)\b/.test(t)) return 'H4';
  if (/\b(h1|1 ?h(eure)?|une heure|horaire)\b/.test(t)) return 'H1';
  if (/\b(jour|journalier|daily|d1|quotidien)\b/.test(t)) return 'J';
  return null;
}
