/* Tests purs des flux en direct du mode Volume et de ses données. node trader-pro/tests/volume-live-test.mjs */
import { parseBinance, creerCarnetKraken, parseKrakenTrade, creerEmpreinte, pasEmpreinte, creerChaleur, creerFlux, urlBinance, abonnementKraken, ouvrir } from '../volume/volume-live.js';
import { chargerBarres, bougiesBinance, badgeSource, parId, ACTIFS_VOLUME, ageDonnee } from '../volume/volume-donnees.js';
import { seuilGrosses } from '../volume/volume-calcul.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };

/* ───── Binance ───── */
const tA = parseBinance({ stream: 'btcusdt@aggTrade', data: { e: 'aggTrade', T: 1000, p: '60000.5', q: '0.25', m: false } }), tV = parseBinance({ stream: 'btcusdt@aggTrade', data: { e: 'aggTrade', T: 1001, p: '60000', q: '1', m: true } });
v(tA.cote === 'achat' && tA.prix === 60000.5 && tV.cote === 'vente', 'transaction Binance : m = faux → l’agresseur ACHÈTE ; m = vrai → il VEND');
const car = parseBinance({ stream: 'btcusdt@depth20@100ms', data: { e: 'depthUpdate', T: 5, b: [['99', '2'], ['100', '1'], ['98', '0']], a: [['102', '3'], ['101', '4']] } });
v(car.type === 'carnet' && car.bids[0][0] === 100 && car.asks[0][0] === 101 && car.bids.every(x => x[1] > 0), 'carnet Binance : meilleur prix en premier, niveaux vides retirés');
const kl = parseBinance({ stream: 'btcusdt@kline_1h', data: { e: 'kline', k: { t: 3600000, i: '1h', o: '1', h: '3', l: '0.5', c: '2', v: '10', V: '6', x: false } } }); v(kl.type === 'bougie' && kl.bougie.bv === 6 && kl.close === false, 'bougie Binance en cours : volume et volume acheteur');
v(parseBinance(null) === null && parseBinance({ stream: 'x', data: { e: 'inconnu' } }) === null, 'message inconnu : ignoré');
/* ───── Kraken ───── */
const K = creerCarnetKraken(); let b = K.appliquer({ feed: 'book_snapshot', bids: [{ price: 99, qty: 5 }, { price: 98, qty: 2 }], asks: [{ price: 101, qty: 4 }] });
v(b.bids[0][0] === 99 && b.asks[0][0] === 101, 'carnet Kraken : snapshot');
b = K.appliquer({ feed: 'book', side: 'buy', price: 100, qty: 7 }); v(b.bids[0][0] === 100 && b.bids[0][1] === 7, 'delta : nouveau meilleur achat');
b = K.appliquer({ feed: 'book', side: 'buy', price: 100, qty: 0 }); v(b.bids[0][0] === 99, 'delta : quantité 0 → niveau retiré');
v(parseKrakenTrade({ feed: 'trade', price: 100, qty: 2, side: 'sell', time: 1 }).cote === 'vente' && parseKrakenTrade({ feed: 'heartbeat' }) === null, 'transaction Kraken');
/* ───── empreinte, chaleur, flux ───── */
const E = creerEmpreinte({ pas: 0.5 }); E.ajouter(1000, 100.1, 2, 'achat'); E.ajouter(1000, 100.2, 1, 'vente'); E.ajouter(1000, 100.6, 3, 'achat');
const n = E.niveaux(1000); v(n.length === 2 && n[0].prix === 100.5 && n[1].achat === 2 && n[1].vente === 1 && E.a(1000) && !E.a(2000) && E.niveaux(2000).length === 0, 'empreinte : volume acheteur / vendeur par niveau de prix');
v(pasEmpreinte(60000) === 10 && pasEmpreinte(3600) === 0.5 && pasEmpreinte(1.085) === 0.0002, 'pas d’empreinte lisible : ' + [pasEmpreinte(60000), pasEmpreinte(3600), pasEmpreinte(1.085)].join(' '));
const C = creerChaleur({ ms: 1000, max: 3 }); const bk = { bids: [[1, 1]], asks: [[2, 1]] }; v(C.ajouter(bk, 5000) && !C.ajouter(bk, 5500) && C.ajouter(bk, 6000) && C.ajouter(bk, 7000) && C.ajouter(bk, 8000) && C.liste().length === 3, 'chaleur : un instantané par intervalle, 3 gardés');
const F = creerFlux(); let g = 0; for (let i = 0; i < 100; i++) F.ajouter({ qte: 1, cote: 'achat' }, seuilGrosses); v(F.ajouter({ qte: 40, cote: 'vente', prix: 1, t: 1 }, seuilGrosses) && F.liste()[0].qte === 40 && F.liste().length === 1, 'flux : seule la grosse transaction est retenue');
/* ───── connexion : reconnexion et abonnement ───── */
const msgs = [], etats = []; class FauxWS { constructor(u) { FauxWS.dernier = this; this.u = u; setTimeout(() => this.onopen && this.onopen(), 0); } send(x) { this.envoye = (this.envoye || []).concat(x); } close() { this.ferme = true; } }
const cnx = ouvrir('wss://exemple', { WS: FauxWS, surMessage: m => msgs.push(m), surEtat: e => etats.push(e.etat), abonner: ws => ws.send('abo') }); await new Promise(r => setTimeout(r, 10));
FauxWS.dernier.onmessage({ data: '{"a":1}' }); FauxWS.dernier.onmessage({ data: 'pas du json' }); v(msgs.length === 1 && etats.includes('connecte') && FauxWS.dernier.envoye[0] === 'abo', 'connexion : abonnement envoyé, message illisible ignoré'); cnx.fermer(); v(FauxWS.dernier.ferme === true, 'fermeture propre');
v(/btcusdt@aggTrade/.test(urlBinance('btc', '1h')) && /depth20@100ms/.test(urlBinance('btc', '1h')) && urlBinance('us100', '1h') === null && abonnementKraken('or')[0].product_ids[0] === 'PF_XAUUSD' && abonnementKraken('us500').length === 0, 'URLs et abonnements par actif (pas de flux pour les indices)');

/* ───── données ───── */
const klines = n => Array.from({ length: n }, (_, i) => [1e12 + i * 3600e3, '100', '101', '99', '100.5', '10', 0, 0, 0, '6']);
const fetchB = async url => ({ ok: true, json: async () => (url.includes('endTime') && !/endTime=1\d{12}&/.test(url) ? [] : klines(60)) });
const bb = await bougiesBinance('BTCUSDT', 'H1', { fetchFn: async () => ({ ok: true, json: async () => klines(60) }), pages: 1, maintenant: 2e12 }); v(bb.length === 60 && bb[0].bv === 6 && bb[0].v === 10, 'Binance : bougies avec volume acheteur (champ 9)');
const r1 = await chargerBarres('btc', 'H1', { fetchFn: async () => ({ ok: true, json: async () => klines(80) }), maintenant: 2e12 }); v(r1.deltaReel === true && r1.source === 'reel' && r1.aVolume, 'Bitcoin : delta réel');
const snap = { t: 5, b: Array.from({ length: 30 }, (_, i) => [1e12 + i * 3600e3, 100, 101, 99, 100, 50]) }; const r2 = await chargerBarres('us100', 'H4', { fetchFn: async () => ({ ok: true, json: async () => snap }) });
v(r2.deltaReel === false && r2.bougies.length >= 7 && r2.bougies[0].v === 50 * 4 || r2.bougies.length > 0, 'Nasdaq : futures NQ via l’instantané, H4 construit, delta estimé');
const r3 = await chargerBarres('or', 'J', { source: 'ref', fetchFn: async () => ({ ok: true, json: async () => snap }) }); v(r3.source === 'ref' && r3.deltaReel === false, 'Or, option COMEX : volume de référence institutionnel, delta estimé');
v(/Binance XAUUSDT/.test(badgeSource('or')) && /delta réel/.test(badgeSource('or')) && /COMEX GC/.test(badgeSource('or', 'ref')) && /delta estimé/.test(badgeSource('or', 'ref')) && /futures CME/.test(badgeSource('us100')) && /delta estimé/.test(badgeSource('eurusd')), 'badges : source, type de volume, delta réel ou estimé');
v(ACTIFS_VOLUME.length === 6 && ACTIFS_VOLUME.filter(a => a.carnet).map(a => a.id).join() === 'or,btc,sol' && !parId.us100.live, 'carnet seulement pour l’or, le Bitcoin et Solana');
let e = null; try { await chargerBarres('doge', 'H1'); } catch (x) { e = x; } v(e && /inconnu/.test(e.message), 'actif inconnu : erreur claire');
v(ageDonnee(0, 5 * 60000) === 'il y a 5 min' && ageDonnee(null) === 'âge inconnu', 'âge des données');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
