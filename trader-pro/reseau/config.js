/* ═════════════ RÉSEAU D'INFORMATION : sources et personnalités suivies (config simple, modifiable depuis Réglages) ═════════════
   Toutes les sources sont GRATUITES et sans clé. Chacune est testée à chaque passage : si elle ne répond pas, elle est marquée « hors ligne » dans le tableau d'état (jamais d'invention).
   X / Twitter : PAS d'API (payante) ; les déclarations passent par les fils de marché et Google News.
   Testé le 2026-11-24 : OK = financialjuice, investinglive (/feed), trumpstruth (/feed/), fed, bce, maison blanche, coindesk, cointelegraph, Google News, EDGAR (data.sec.gov) ;
   BLS (403 aux robots), OPEP (Cloudflare) et Trésor (pas de RSS) passent donc par Google News (« site: »), le flux direct du BLS est essayé et marqué hors ligne s'il refuse. */
export const UA = 'Mozilla/5.0 (compatible; RayleReader/1.0; +https://github.com/justinmaneiro-alt/Rayle-)';
export const UA_SEC = 'Rayle-Invest outil de recherche personnel';
const gn = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

/* voie « rapide » : interrogée toutes les 2 minutes par le Worker (et à chaque passage de GitHub Actions) ; voie « lente » : toutes les 10 à 15 minutes par GitHub Actions */
export const SOURCES = Object.freeze([
  { id: 'financialjuice', nom: 'FinancialJuice', url: 'https://www.financialjuice.com/feed.ashx?xy=rss', voie: 'rapide', genre: 'marche', nettoyer: /^FinancialJuice:\s*/i },
  { id: 'investinglive', nom: 'investingLive', url: 'https://investinglive.com/feed', voie: 'rapide', genre: 'marche' },
  { id: 'trump', nom: 'Truth Social (Trump)', url: 'https://trumpstruth.org/feed/', voie: 'rapide', genre: 'personne', personne: 'trump' },
  { id: 'fed-presse', nom: 'Fed : communiqués', url: 'https://www.federalreserve.gov/feeds/press_all.xml', voie: 'lente', genre: 'officiel', poids: 5, actifs: ['or', 'us100', 'us500', 'dxy', 'btc'] },
  { id: 'fed-discours', nom: 'Fed : discours', url: 'https://www.federalreserve.gov/feeds/speeches.xml', voie: 'lente', genre: 'officiel', poids: 4, actifs: ['or', 'us100', 'us500', 'dxy'] },
  { id: 'bce', nom: 'BCE', url: 'https://www.ecb.europa.eu/rss/press.html', voie: 'lente', genre: 'officiel', poids: 4, actifs: ['dxy', 'or', 'us500'] },
  { id: 'maison-blanche', nom: 'Maison Blanche : actions présidentielles', url: 'https://www.whitehouse.gov/presidential-actions/feed/', voie: 'lente', genre: 'officiel', poids: 4, personne: 'trump' },
  { id: 'tresor', nom: 'Trésor US (via Google News)', url: gn('site:home.treasury.gov when:2d'), voie: 'lente', genre: 'officiel', poids: 4, actifs: ['dxy', 'or', 'us500'] },
  { id: 'bls', nom: 'BLS (emploi, inflation)', url: 'https://www.bls.gov/feed/bls_latest.rss', voie: 'lente', genre: 'officiel', poids: 4, actifs: ['dxy', 'or', 'us100', 'us500'] },
  { id: 'opep', nom: 'OPEP (via Google News)', url: gn('OPEC production OR output when:1d'), voie: 'lente', genre: 'officiel', poids: 4, actifs: ['petrole', 'dxy'], personne: 'opep' },
  { id: 'coindesk', nom: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss', voie: 'lente', genre: 'crypto', actifs: ['btc', 'sol'] },
  { id: 'cointelegraph', nom: 'Cointelegraph', url: 'https://cointelegraph.com/rss', voie: 'lente', genre: 'crypto', actifs: ['btc', 'sol'] },
  ...[['nvda', 'Nvidia', '0001045810'], ['aapl', 'Apple', '0000320193'], ['msft', 'Microsoft', '0000789019'], ['tsla', 'Tesla', '0001318605']].map(([id, nom, cik]) => ({ id: 'sec-' + id, nom: `SEC EDGAR : ${nom}`, url: `https://data.sec.gov/submissions/CIK${cik}.json`, type: 'edgar', entreprise: nom, voie: 'lente', genre: 'officiel', poids: 3, actifs: ['us100', 'us500'], ua: UA_SEC })),
  { id: 'gn-actifs', nom: 'Google News : marchés', url: gn('gold OR nasdaq OR bitcoin OR "oil prices" OR "dollar index" when:6h'), voie: 'lente', genre: 'marche' }
]);

/* Personnalités : poids d'impact de 1 à 5, actifs liés ('tous' = les 7), alias pour les reconnaître dans les titres, requête Google News pour leurs déclarations.
   Bluesky : seulement si un compte OFFICIEL vérifié est indiqué (champ `bluesky`, handle) ; aucun n'est présumé (les recherches ne donnent que des comptes parodiques). */
export const TOUS = Object.freeze(['or', 'us100', 'us500', 'btc', 'sol', 'petrole', 'dxy']);
export const PERSONNES = Object.freeze([
  { id: 'trump', court: 'Trump', nom: 'Donald Trump', role: 'Président des États-Unis', poids: 5, actifs: 'tous', alias: ['trump', 'truth social', 'white house', 'maison blanche'], requete: 'Trump tariffs OR sanctions OR economy OR Fed OR dollar when:1d' },
  { id: 'powell', court: 'Powell', nom: 'Jerome Powell', role: 'Président de la Fed', poids: 5, actifs: ['or', 'us100', 'us500', 'dxy'], alias: ['powell', 'fed chair'], requete: '"Powell" Fed rates when:1d' },
  { id: 'bessent', court: 'Bessent', nom: 'Scott Bessent', role: 'Secrétaire au Trésor', poids: 4, actifs: ['dxy', 'or', 'us500'], alias: ['bessent'], requete: 'Bessent Treasury when:1d' },
  { id: 'lutnick', court: 'Lutnick', nom: 'Howard Lutnick', role: 'Secrétaire au Commerce', poids: 3, actifs: ['us100', 'us500', 'dxy'], alias: ['lutnick'], requete: 'Lutnick tariffs OR chips OR commerce when:1d' },
  { id: 'lagarde', court: 'Lagarde', nom: 'Christine Lagarde', role: 'Présidente de la BCE', poids: 4, actifs: ['dxy', 'or', 'us500'], alias: ['lagarde'], requete: 'Lagarde ECB when:1d' },
  { id: 'fed-membres', court: 'Un membre de la Fed', nom: 'Membres de la Fed', role: 'Waller, Williams, Jefferson, Cook, Bowman…', poids: 3, actifs: ['or', 'us100', 'us500', 'dxy'], alias: ['waller', 'jefferson', 'bowman', 'fed governor', 'fed\'s williams', 'fed\'s cook', 'fed\'s barr', 'fed\'s kashkari', 'fed\'s goolsbee', 'fed\'s logan', 'fed\'s hammack', 'fed\'s musalem'], requete: 'Fed governor OR Waller OR Williams OR Jefferson rates when:1d' },
  { id: 'musk', court: 'Musk', nom: 'Elon Musk', role: 'Tesla, SpaceX, X', poids: 3, actifs: ['us100', 'btc', 'sol'], alias: ['musk'], requete: 'Musk Tesla OR bitcoin OR dogecoin when:1d' },
  { id: 'huang', court: 'Jensen Huang', nom: 'Jensen Huang', role: 'PDG de Nvidia', poids: 4, actifs: ['us100', 'us500'], alias: ['jensen huang', 'huang', 'nvidia ceo'], requete: '"Jensen Huang" Nvidia when:1d' },
  { id: 'saylor', court: 'Saylor', nom: 'Michael Saylor', role: 'Strategy (MicroStrategy)', poids: 2, actifs: ['btc'], alias: ['saylor', 'strategy inc', 'microstrategy'], requete: 'Saylor bitcoin Strategy when:1d' },
  { id: 'opep', court: 'L’OPEP', nom: 'OPEP et ministres du pétrole', role: 'OPEP / OPEP+, Arabie saoudite', poids: 4, actifs: ['petrole', 'dxy'], alias: ['opec', 'opep', 'saudi energy minister', 'abdulaziz'], requete: 'OPEC OR "Saudi energy minister" production when:1d' }
]);

/* Sujets : motif (anglais et français), poids de 0 à 20, actifs concernés. Un sujet n'est jamais un signal : il dit « de quoi ça parle ». */
export const SUJETS = Object.freeze([
  { id: 'droits_douane', nom: 'droits de douane', poids: 20, motif: /tariff|droits? de douane|trade war|guerre commerciale|import dut/i, actifs: ['us100', 'us500', 'or', 'dxy', 'btc'] },
  { id: 'taux', nom: 'taux d’intérêt', poids: 20, motif: /rate (cut|hike|decision)|(cut|raise|hike|lower|slash)s? (interest )?rates?|interest rate|fomc|rates? (on hold|unchanged)|baisse des taux|hausse des taux|taux directeur|dot plot|fed funds|hawkish|dovish/i, actifs: ['or', 'us100', 'us500', 'dxy', 'btc'] },
  { id: 'inflation', nom: 'inflation', poids: 18, motif: /\bcpi\b|\bpce\b|inflation|consumer prices|\bppi\b/i, actifs: ['or', 'us100', 'us500', 'dxy', 'btc'] },
  { id: 'emploi', nom: 'emploi', poids: 16, motif: /nonfarm|non-farm|payrolls?|unemployment|jobless|jobs report|chômage/i, actifs: ['dxy', 'or', 'us100', 'us500'] },
  { id: 'sanctions', nom: 'sanctions', poids: 16, motif: /sanction|embargo|price cap|plafonnement/i, actifs: ['petrole', 'or', 'dxy'] },
  { id: 'guerre', nom: 'guerre / géopolitique', poids: 18, motif: /\bwar\b|missile|airstrike|invasion|ceasefire|cessez-le-feu|attack on|troops|nuclear|strait of hormuz|escalat/i, actifs: ['or', 'petrole', 'dxy', 'us500'] },
  { id: 'export', nom: 'interdiction d’export / puces', poids: 18, motif: /export (ban|control|restriction)|chip (ban|curb|export)|semiconductor.{0,20}(ban|restrict|curb)|interdiction d.export/i, actifs: ['us100', 'us500'] },
  { id: 'crypto_regulation', nom: 'régulation crypto', poids: 16, motif: /crypto.{0,30}(regulat|ban|law|bill)|\bsec\b.{0,25}(crypto|bitcoin|etf|solana)|stablecoin|spot (btc|bitcoin|solana|sol) etf|etf (approval|inflow|outflow)|strategic bitcoin reserve|réserve (stratégique )?de bitcoin/i, actifs: ['btc', 'sol'] },
  { id: 'resultats', nom: 'résultats d’entreprise', poids: 12, motif: /earnings|\beps\b|revenue (beat|miss)|guidance|quarterly results|résultats trimestriels|net revenue/i, actifs: ['us100', 'us500'] },
  { id: 'fusion', nom: 'rachat / fusion', poids: 10, motif: /acquir|acquisition|takeover|buyout|merger|rachat|fusion|to buy .{0,25} for \$/i, actifs: ['us100', 'us500'] },
  { id: 'opep', nom: 'OPEP / production de pétrole', poids: 18, motif: /\bopec\b|opep|production (cut|hike|quota)|output (cut|hike)|crude (inventor|stocks)|eia (inventor|stocks)|oil (inventor|supply)/i, actifs: ['petrole', 'dxy'] },
  { id: 'banques_centrales_or', nom: 'banques centrales et or', poids: 12, motif: /central bank.{0,20}gold|gold reserves|gold purchases|world gold council|achats d.or/i, actifs: ['or'] },
  { id: 'dollar', nom: 'dollar et obligations', poids: 10, motif: /dollar index|\bdxy\b|treasury yields?|10-year yield|bond (auction|selloff|rally)|rendement/i, actifs: ['dxy', 'or', 'us500'] },
  { id: 'crypto_marche', nom: 'marché crypto', poids: 8, motif: /bitcoin|\bbtc\b|solana|\bsol\b|crypto|liquidations?/i, actifs: ['btc', 'sol'] },
  { id: 'or_marche', nom: 'or', poids: 6, motif: /\bgold\b|\bxau\b|bullion|safe.haven/i, actifs: ['or'] },
  { id: 'petrole_marche', nom: 'pétrole', poids: 6, motif: /\boil\b|crude|\bwti\b|brent/i, actifs: ['petrole'] },
  { id: 'indices_marche', nom: 'actions américaines', poids: 6, motif: /nasdaq|s&p 500|wall street|stocks (rally|fall|slide|surge|tumble)|equities/i, actifs: ['us100', 'us500'] }
]);

/* sens du propos (pour repérer un REVIREMENT dans un fil) : +1 = escalade / durcissement, −1 = apaisement / assouplissement */
export const STANCE = Object.freeze({
  escalade: /\b(impos|raise|hike|new tariff|threaten|retaliat|double|increase|ban\b|escalat|strike|attack|sanction(s)? (on|against)|durci|menace|relèv)|\b(100|50|25|10)%/i,
  apaisement: /\b(pause|delay|postpon|exempt|suspend|lift|drop|scrap|cancel|deal|agreement|truce|ceasefire|reduce|cut tariff|ease|walk back|backtrack|reverse|accord|trêve|allège)/i
});
export const NOMS_ACTIFS = Object.freeze({ or: 'l’or', us100: 'le Nasdaq', us500: 'le S&P 500', btc: 'le Bitcoin', sol: 'Solana', petrole: 'le pétrole', dxy: 'le dollar' });
export const NOMS_COURTS = Object.freeze({ or: 'Or', us100: 'Nasdaq', us500: 'S&P 500', btc: 'Bitcoin', sol: 'Solana', petrole: 'Pétrole', dxy: 'Dollar' });

/* une source Google News par personnalité (déclarations relayées par la presse : X / Twitter n'a pas d'API gratuite) */
export const sourcesPersonnes = personnes => personnes.map(p => ({ id: 'gn-' + p.id, nom: 'Google News : ' + (p.court || p.nom), url: gn(p.requete || p.nom), voie: 'lente', genre: 'personne', personne: p.id }));
