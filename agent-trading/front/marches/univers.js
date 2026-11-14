/* Univers de la couverture et des performances (Phase 6) : actifs, source gratuite, fréquence, profondeur, retard. PUR (sans navigateur).
   Honnêteté : pour chaque actif, la source et ses limites sont écrites ; sans donnée gratuite fiable, on le dit au lieu de combler par des approximations. */
export const UNIVERS = Object.freeze([
  { id: 'XAUUSD', nom: 'Or (XAU/USD)', groupe: 'matières', yahoo: 'GC=F', jours365: false, source: 'Yahoo Finance GC=F (contrat à terme or, proxy du spot : écart de base)', retard: 'différé ~15 min', profondeur: '≈ 10 ans (journalier)', facteur: 'or' },
  { id: 'US100', nom: 'Nasdaq 100 (US100)', groupe: 'indices', yahoo: '^NDX', jours365: false, source: 'Yahoo Finance ^NDX (indice, sans dividendes)', retard: 'différé ~15 min', profondeur: '≈ 10 ans', facteur: 'actions' },
  { id: 'US500', nom: 'S&P 500 (US500)', groupe: 'indices', yahoo: '^GSPC', jours365: false, source: 'Yahoo Finance ^GSPC (indice, sans dividendes)', retard: 'différé ~15 min', profondeur: '≈ 10 ans', facteur: 'actions' },
  { id: 'BTC', nom: 'Bitcoin', groupe: 'crypto', yahoo: 'BTC-USD', jours365: true, source: 'Yahoo Finance BTC-USD (agrégé) ; Kraken en direct pour le prix du moment', retard: 'quasi temps réel', profondeur: '≈ 10 ans (depuis 2014)', facteur: 'crypto' },
  { id: 'SOL', nom: 'Solana', groupe: 'crypto', yahoo: 'SOL-USD', jours365: true, source: 'Yahoo Finance SOL-USD', retard: 'quasi temps réel', profondeur: '≈ 5 ans (depuis 2020) : historique court', facteur: 'crypto' },
  { id: 'EURUSD', nom: 'EUR/USD', groupe: 'monnaies', yahoo: 'EURUSD=X', jours365: false, source: 'Yahoo Finance EURUSD=X (taux interbancaire, sans swap)', retard: 'quasi temps réel', profondeur: '≈ 10 ans', facteur: 'dollar', signeDollar: -1 },
  { id: 'USDCHF', nom: 'USD/CHF', groupe: 'monnaies', yahoo: 'CHF=X', jours365: false, source: 'Yahoo Finance CHF=X', retard: 'quasi temps réel', profondeur: '≈ 10 ans', facteur: 'franc', signeDollar: 1 },
  { id: 'GBPUSD', nom: 'GBP/USD', groupe: 'monnaies', yahoo: 'GBPUSD=X', jours365: false, source: 'Yahoo Finance GBPUSD=X', retard: 'quasi temps réel', profondeur: '≈ 10 ans', facteur: 'dollar', signeDollar: -1, optionnel: true },
  { id: 'USDJPY', nom: 'USD/JPY', groupe: 'monnaies', yahoo: 'JPY=X', jours365: false, source: 'Yahoo Finance JPY=X', retard: 'quasi temps réel', profondeur: '≈ 10 ans', facteur: 'dollar', signeDollar: 1, optionnel: true },
  { id: 'EURCHF', nom: 'EUR/CHF', groupe: 'monnaies', yahoo: 'EURCHF=X', jours365: false, source: 'Yahoo Finance EURCHF=X', retard: 'quasi temps réel', profondeur: '≈ 10 ans', facteur: 'franc', optionnel: true },
  { id: 'AUDUSD', nom: 'AUD/USD', groupe: 'monnaies', yahoo: 'AUDUSD=X', jours365: false, source: 'Yahoo Finance AUDUSD=X', retard: 'quasi temps réel', profondeur: '≈ 10 ans', facteur: 'dollar', signeDollar: -1, optionnel: true },
  { id: 'DXY', nom: 'Indice dollar (DXY)', groupe: 'contexte', yahoo: 'DX-Y.NYB', jours365: false, source: 'Yahoo Finance DX-Y.NYB', retard: 'différé', profondeur: '≈ 10 ans', facteur: 'dollar', contexte: true },
  { id: 'US10Y', nom: 'Taux US 10 ans', groupe: 'contexte', yahoo: '^TNX', jours365: false, source: 'Yahoo Finance ^TNX (rendement en %, la variation est une différence de points)', retard: 'différé', profondeur: '≈ 10 ans', contexte: true, taux: true },
  { id: 'US2Y', nom: 'Taux US 2 ans', groupe: 'contexte', fred: 'DGS2', jours365: false, source: 'FRED DGS2 (Réserve fédérale de St. Louis), via instantané', retard: '1 jour ouvré', profondeur: '≈ 10 ans', contexte: true, taux: true },
  { id: 'VIX', nom: 'VIX (volatilité)', groupe: 'contexte', yahoo: '^VIX', jours365: false, source: 'Yahoo Finance ^VIX', retard: 'différé', profondeur: '≈ 10 ans', contexte: true }
]);
export const parId = Object.freeze(Object.fromEntries(UNIVERS.map(u => [u.id, u])));
export const PRINCIPAUX = Object.freeze(['XAUUSD', 'US100', 'US500', 'BTC', 'SOL', 'EURUSD', 'USDCHF']);
/* l'inflation sert de contexte (affichée à part) : JAMAIS dans les corrélations */
export const CONTEXTE_SEUL = Object.freeze({ id: 'INFLATION', nom: 'Inflation (CPI États-Unis)', fred: 'CPIAUCSL', source: 'FRED CPIAUCSL (mensuelle, publiée avec ~1 mois de retard)' });
export const nomFichierJour = id => `jour-${String(id).replace(/[^A-Za-z0-9]/g, '_')}.json`;
export const nomFichierHoraire = id => `horaire-${String(id).replace(/[^A-Za-z0-9]/g, '_')}.json`;
/* facteurs d'exposition (convention simple et documentée, pas une mesure) : position longue = +1 sur le facteur */
export const FACTEURS = Object.freeze({ dollar: 'Dollar', actions: 'Risque actions', or: 'Or', crypto: 'Crypto', franc: 'Franc suisse' });
export function expositions(actifId, sens) {   // sens : +1 achat, -1 vente
  const u = parId[actifId]; if (!u) return {}; const s = sens >= 0 ? 1 : -1, o = {};
  if (u.id === 'DXY') { o.dollar = s; return o; }
  if (u.id === 'USDCHF') { o.dollar = s; o.franc = -s; return o; }
  if (u.id === 'EURCHF') { o.franc = -s; return o; }
  if (u.facteur === 'dollar' && u.signeDollar) { o.dollar = s * u.signeDollar; return o; }
  if (u.facteur && !u.contexte) o[u.facteur] = s;
  return o;
}
/* un symbole saisi par l'utilisateur (action) : seulement ce que le robot publie ; sinon un message honnête */
export const SYMBOLE_VALIDE = /^[A-Z0-9^][A-Z0-9.=^-]{0,14}$/;
export function messageSansDonnee(symbole) { return `Aucune donnée gratuite publiée pour « ${symbole} » : l'appli ne peut pas lire cette source depuis le téléphone sans le PC. Ajoute ce symbole à outils-donnees/univers-utilisateur.json (une ligne) : le robot GitHub le téléchargera à son prochain passage (prix ajustés des splits et dividendes). Rien n'est estimé à la place.`; }
