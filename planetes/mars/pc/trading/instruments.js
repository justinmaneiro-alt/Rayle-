/* ═════════════ INSTRUMENTS, UNITÉS DE TEMPS ET LANGAGE PARLÉ (module pur, testé : planetes/mars/tests/trading-instruments-test.mjs) ═════════════
   Un instrument = un identifiant du terminal (celui que le Worker comprend : /marche?actif=…), un nom, la précision d'affichage, et ses SOURCES RÉELLES
   (ce que dit l'interface : « Yahoo Finance ^NDX », « Twelve Data XAU/USD »…). Rien n'est inventé : si une donnée n'existe pas gratuitement, `volume` le dit. */
export const UNITES = {
  M15: { id: 'M15', tv: '15', worker: '15min', nom: 'M15', long: '15 minutes', ms: 900e3, rafraichir: 120e3, historiqueMax: 6000, alias: ['m15', '15 minutes', '15 min', 'quinze minutes', 'un quart d heure', 'quart d heure'] },
  H1: { id: 'H1', tv: '60', worker: '1h', nom: 'H1', long: '1 heure', ms: 3600e3, rafraichir: 180e3, historiqueMax: 5000, alias: ['h1', '1 heure', 'une heure', 'horaire', '60 minutes'] },
  H4: { id: 'H4', tv: '240', worker: '4h', nom: 'H4', long: '4 heures', ms: 14400e3, rafraichir: 300e3, historiqueMax: 3000, alias: ['h4', '4 heures', 'quatre heures', 'h 4'] },
  D1: { id: 'D1', tv: 'D', worker: '1day', nom: 'D1', long: 'journalier', ms: 86400e3, rafraichir: 600e3, historiqueMax: 3000, alias: ['d1', 'daily', 'journalier', 'quotidien', 'jour', 'journee', 'par jour', 'd 1', 'day'] }
};
export const ORDRE_UNITES = ['M15', 'H1', 'H4', 'D1'];

/* volume : 'indice' = volume fourni par la source pour cet instrument ; 'proxy' = volume d'un autre produit (étiqueté comme tel) ; 'aucun' = n'existe pas gratuitement.
   Pour l'or comptant (XAU/USD) il n'existe aucun volume gratuit : on utilise celui du contrat à terme COMEX (GC=F), clairement indiqué comme PROXY. */
export const INSTRUMENTS = {
  US100: { id: 'US100', actif: 'NDX', nom: 'US100 · Nasdaq 100', court: 'US100', decimales: 1, categorie: 'indice', tv: 'CAPITALCOM:US100',
    alias: ['us100', 'us 100', 'nasdaq', 'nasdaq 100', 'nas100', 'nas 100', 'ndx', 'nasdac', 'le nasdaq', 'nasdaq cent'],
    volume: { type: 'indice', note: "volume des actions du Nasdaq 100 (indice, Yahoo) : ce n'est PAS le volume du CFD US100 de XTB", proxy: 'Y:NQ=F', proxyNote: 'volume du contrat à terme Nasdaq 100 (NQ=F, CME)' } },
  XAU: { id: 'XAU', actif: 'XAU', nom: 'XAU/USD · Or', court: 'Or', decimales: 2, categorie: 'matiere', tv: 'OANDA:XAUUSD', quota: true,   // quota : source à budget limité (Twelve Data), rafraîchie moins souvent dans la watchlist
    alias: ['xau', 'xau usd', 'xauusd', 'or', 'l or', 'gold', 'once d or', 'metal jaune'],
    volume: { type: 'proxy', note: "pas de volume gratuit pour l'or comptant : volume du contrat à terme COMEX (GC=F), PROXY", proxy: 'Y:GC=F', proxyNote: "volume du contrat à terme or COMEX (GC=F), proxy du comptant" } },
  BTC: { id: 'BTC', actif: 'BTC', nom: 'Bitcoin · BTC/USD', court: 'BTC', decimales: 1, categorie: 'crypto', tv: 'BINANCE:BTCUSDT',
    alias: ['btc', 'bitcoin', 'bit coin', 'le bitcoin', 'btc usd', 'btcusd', 'xbt'],
    volume: { type: 'reel', note: 'volume réel de la place de cotation (Kraken, secours Binance), en bitcoins' } },
  SOL: { id: 'SOL', actif: 'SOL', nom: 'Solana · SOL/USD', court: 'SOL', decimales: 2, categorie: 'crypto', tv: 'BINANCE:SOLUSDT',
    alias: ['sol', 'solana', 'solana usd', 'sol usd', 'la solana'],
    volume: { type: 'reel', note: 'volume réel de la place de cotation (Kraken, secours Binance)' } },
  DOGE: { id: 'DOGE', actif: 'DOGE', nom: 'Dogecoin · DOGE/USD', court: 'DOGE', decimales: 5, categorie: 'crypto', tv: 'BINANCE:DOGEUSDT',
    alias: ['doge', 'dogecoin', 'doge coin', 'doge usd', 'dodge', 'le doge'],
    volume: { type: 'reel', note: 'volume réel de la place de cotation (Kraken, secours Binance)' } },
  EUR: { id: 'EUR', actif: 'EUR', nom: 'EUR/USD', court: 'EUR/USD', decimales: 5, categorie: 'devise', tv: 'FX:EURUSD', quota: true,
    alias: ['eur usd', 'eurusd', 'euro dollar', 'euro', 'l euro', 'eur'],
    volume: { type: 'aucun', note: 'pas de volume centralisé sur le marché des changes' } },
  DXY: { id: 'DXY', actif: 'Y:DX-Y.NYB', nom: 'Dollar (DXY)', court: 'DXY', decimales: 3, categorie: 'macro', tv: 'TVC:DXY', alias: ['dxy', 'dollar', 'dollar index', 'indice dollar', 'le dollar'], volume: { type: 'aucun', note: 'pas de volume sur cet indice' } },
  US10Y: { id: 'US10Y', actif: 'Y:^TNX', nom: 'Taux US 10 ans', court: 'US10Y', decimales: 3, categorie: 'macro', unite: '%', tv: 'TVC:US10Y', alias: ['us10y', 'us 10y', 'taux', 'taux us', 'taux 10 ans', 'rendement', 'rendement 10 ans', 'les taux'], volume: { type: 'aucun', note: 'pas de volume sur cet indice' } },
  VIX: { id: 'VIX', actif: 'Y:^VIX', nom: 'VIX (volatilité)', court: 'VIX', decimales: 2, categorie: 'macro', tv: 'TVC:VIX', alias: ['vix', 'volatilite', 'indice de la peur', 'la volatilite'], volume: { type: 'aucun', note: 'pas de volume sur cet indice' } }
};
export const PRINCIPAUX = ['US100', 'XAU'];                   // ceux qu'on trace en M15, H1, H4 et D1
export const WATCHLIST = ['US100', 'XAU', 'BTC', 'SOL', 'DOGE', 'EUR', 'DXY', 'US10Y', 'VIX'];
export const CORRELES = ['US100', 'XAU', 'DXY', 'US10Y', 'VIX'];
export const instrument = id => INSTRUMENTS[id] || null;
export const unite = id => UNITES[id] || null;

const sans = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'\-\/_.,;:!?()]/g, ' ').replace(/\s+/g, ' ').trim();
export const normaliser = sans;
const contient = (t, a) => new RegExp('(?:^| )' + a.replace(/ /g, ' ') + '(?: |$)').test(t);

/* Trouve un instrument dans une phrase (la plus longue expression gagne : « nasdaq 100 » avant « nasdaq »). */
export function trouverInstrument(texte) {
  const t = sans(texte); let meilleur = null, taille = 0;
  for (const i of Object.values(INSTRUMENTS)) for (const a of i.alias) if (a.length > taille && contient(t, a)) { meilleur = i.id; taille = a.length; }
  return meilleur;
}
export function trouverUnite(texte) {
  const t = sans(texte); let meilleur = null, taille = 0;
  for (const u of Object.values(UNITES)) for (const a of u.alias) if (a.length > taille && contient(t, a)) { meilleur = u.id; taille = a.length; }
  return meilleur;
}
/* Phrase parlée → { instrument?, unite? } ou null. « montre-moi l'or en H1 », « le nasdaq en daily », « passe en H4 », « mets l'or ». */
export function analyserDemande(texte) {
  const t = sans(texte);
  if (!t || t.split(' ').length > 12) return null;
  if (/\b(prix|cours|combien|quel|quelle|quels|explique|pourquoi|comment|resume|achat|vente|ordre|stop|alerte|previens|meteo|actu|actus)\b/.test(t)) return null;
  const verbe = /^(?:raylé |rayle )?(?:ouvre|ouvrir|montre|montrer|affiche|afficher|passe|passer|mets|met|mettre|change|changer|bascule|basculer|va|aller|charge|donne|regarde|selectionne|je veux|je voudrais)\b/.test(t);
  if (!verbe) return null;
  const i = trouverInstrument(t), u = trouverUnite(t);
  if (!i && !u) return null;
  if (!i && u && !/\b(?:passe|passer|mets|met|mettre|change|changer|bascule|basculer|en|sur|vers)\b/.test(t)) return null;
  return { instrument: i, unite: u };
}
export const libelleDemande = (i, u) => (i ? INSTRUMENTS[i].court : '') + (i && u ? ' en ' : '') + (u ? UNITES[u].nom : '');
