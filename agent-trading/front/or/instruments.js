/* ═════════════ INSTRUMENTS DU TERMINAL (pur, testé) ═════════════
   UN seul Terminal. L'or est l'instrument par défaut ; le sélecteur change l'instrument du graphique (et recharge la vue : les modules du moteur
   lisent leurs constantes au chargement). Chaque instrument dit d'où viennent ses prix, avec quel retard, et s'il a un carnet / un volume réel.
   Aucune valeur inventée : source et retard sont affichés. Les bougies des instruments autres que l'or sont lues par le serveur du PC (/__bougies, Yahoo). */
export const CLE_ACTIF = 'rayle_terminal_actif';
export const INSTRUMENTS = Object.freeze([
  { id: 'OR', nom: 'Or', long: 'Or (XAU/USD)', court: 'XAU/USD', yahoo: null, decimales: 2, continu: false, volume: 'reel', source: 'Kraken PF_XAUUSD (prix) · Binance XAUUSDT (volume)', retard: 'temps réel', carnet: true, cot: 'OR', alias: ['or', 'gold', 'xau', 'xauusd', 'l or'] },
  { id: 'NASDAQ', nom: 'Nasdaq 100', long: 'Nasdaq 100 (indice)', court: 'US100', yahoo: '^NDX', decimales: 1, continu: false, volume: 'aucun', source: 'Yahoo Finance ^NDX (indice, lu par le PC)', retard: 'différé d’environ 15 minutes', carnet: false, cot: 'NASDAQ', alias: ['nasdaq', 'us100', 'ndx', 'nas100', 'nasdaq 100'] },
  { id: 'SP500', nom: 'S&P 500', long: 'S&P 500 (indice)', court: 'US500', yahoo: '^GSPC', decimales: 1, continu: false, volume: 'aucun', source: 'Yahoo Finance ^GSPC (indice, lu par le PC)', retard: 'différé d’environ 15 minutes', carnet: false, cot: 'SP500', alias: ['sp500', 's&p', 's&p 500', 'us500', 'spx', 'standard and poor'] },
  { id: 'BTC', nom: 'Bitcoin', long: 'Bitcoin (BTC/USD)', court: 'BTC/USD', yahoo: 'BTC-USD', decimales: 0, continu: true, volume: 'reel', source: 'Yahoo Finance BTC-USD (lu par le PC)', retard: 'quasi temps réel', carnet: false, cot: 'BTC', alias: ['bitcoin', 'btc'] },
  { id: 'SOL', nom: 'Solana', long: 'Solana (SOL/USD)', court: 'SOL/USD', yahoo: 'SOL-USD', decimales: 2, continu: true, volume: 'reel', source: 'Yahoo Finance SOL-USD (lu par le PC)', retard: 'quasi temps réel', carnet: false, cot: 'SOL', alias: ['solana', 'sol'] },
  { id: 'DXY', nom: 'Dollar', long: 'Indice dollar (DXY)', court: 'DXY', yahoo: 'DX-Y.NYB', echelle: 100, decimales: 3, continu: false, volume: 'aucun', source: 'Yahoo Finance DX-Y.NYB (lu par le PC)', retard: 'différé possible (quelques minutes)', carnet: false, cot: 'DXY', alias: ['dollar', 'dxy', 'indice dollar', 'usd index'] },
  { id: 'EURUSD', nom: 'EUR/USD', long: 'Euro / dollar', court: 'EUR/USD', yahoo: 'EURUSD=X', echelle: 10000, decimales: 5, continu: false, volume: 'aucun', source: 'Yahoo Finance EURUSD=X (lu par le PC)', retard: 'quasi temps réel', carnet: false, cot: 'EURUSD', alias: ['eurusd', 'eur usd', 'euro dollar', 'euro'] },
  { id: 'USDCHF', nom: 'USD/CHF', long: 'Dollar / franc suisse', court: 'USD/CHF', yahoo: 'CHF=X', echelle: 10000, decimales: 5, continu: false, volume: 'aucun', source: 'Yahoo Finance CHF=X (lu par le PC)', retard: 'quasi temps réel', carnet: false, cot: 'USDCHF', alias: ['usdchf', 'usd chf', 'franc suisse', 'dollar franc'] }
]);
export const PAR_ID = Object.freeze(Object.fromEntries(INSTRUMENTS.map(i => [i.id, i])));
export const ID_DEFAUT = 'OR';
/* échelle d'affichage : les cours à faible valeur (devises, dollar) sont multipliés pour que tous les libellés du terminal (niveaux, zones, flèches)
   gardent une précision d'une unité de pipette ; elle est écrite dans la barre (« EUR/USD ×10 000 : 1,0850 s'affiche 10 850 »). */
export const echelleDe = i => (i && i.echelle) || 1;
export const noteEchelle = i => (echelleDe(i) > 1 ? `Prix affichés ×${echelleDe(i).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} : ${i.id === 'DXY' ? '99,12 s’affiche 9 912' : i.id === 'EURUSD' ? '1,0850 s’affiche 10 850' : '0,8050 s’affiche 8 050'} (lecture en pipettes).` : null);
export const instrument = id => PAR_ID[id] || PAR_ID[ID_DEFAUT];

/* l'instrument choisi : ?actif=… de l'adresse, sinon le dernier choix mémorisé, sinon l'or */
export function actifCourant(loc = globalThis.location, stockage = globalThis.localStorage) {
  try { const q = new URLSearchParams(loc && loc.search).get('actif'); if (q && PAR_ID[q.toUpperCase()]) return q.toUpperCase(); } catch (e) { /* */ }
  try { const m = stockage && stockage.getItem(CLE_ACTIF); if (m && PAR_ID[m]) return m; } catch (e) { /* */ }
  return ID_DEFAUT;
}
/* reconnaît un instrument dans une phrase (« mets le bitcoin », « passe sur l'euro dollar ») */
export function instrumentDepuisTexte(texte) {
  const n = ` ${String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/\s+/g, ' ')} `;
  let meilleur = null, taille = 0;
  for (const i of INSTRUMENTS) for (const a of i.alias) { const k = ` ${a} `; if (n.includes(k) && a.length > taille) { meilleur = i.id; taille = a.length; } }
  return meilleur;
}
/* préfixe de stockage : les données de l'or restent à leurs clés d'origine ; chaque autre instrument a les siennes (zones, outils, registres) */
export const suffixe = id => (id && id !== ID_DEFAUT ? '__' + id : '');
export function cleDe(cle, id) { return /^rayle_or_/.test(cle) && id !== ID_DEFAUT ? cle + suffixe(id) : cle; }
export const baseDe = (nom, id) => (nom === 'rayle-or-outils' && id !== ID_DEFAUT ? nom + suffixe(id) : nom);
/* avertissement affiché sous le graphique pour tout instrument autre que l'or */
export function avertissement(id) {
  const i = instrument(id); if (i.id === ID_DEFAUT) return null;
  const ech = noteEchelle(i);
  return `${i.long} : ${ech ? ech + ' '  : ''}les règles scellées sont les mêmes que pour l’or, mais les statistiques de réaction affichées ont été mesurées sur l’or et ne sont pas transposables. ${i.volume === 'aucun' ? 'Cette source ne donne pas de volume : les règles qui demandent un volume ne se déclenchent pas. ' : ''}Pas de carnet d’ordres pour cet instrument.`;
}
