import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Livre, profondeurJusqua, desequilibre } from '../../strategies/liquidite/livre.js';
import { creerSynchro } from '../../strategies/liquidite/synchro-binance.js';
import { AgregateurTrades, DetecteurGrosOrdres, SeuilAdaptatif } from '../../strategies/liquidite/agregation-flux.js';
import { quantifier, dequantifier, encoderEntete, encoderEnregistrement, decoderFichier, tailleEnregistrement, TAILLE_ENTETE } from '../../strategies/liquidite/format-profondeur.js';
import { creerStockage } from '../../agent-pc/flux/stockage-flux.mjs';
import { creerConnexion } from '../../agent-pc/flux/connexion.mjs';
import { creerEnregistreur } from '../../agent-pc/flux/enregistreur.mjs';
import { statutFlux } from '../../agent-pc/flux/service-flux.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-flux-test-'));
const proche = (a, b, tol) => Math.abs(a - b) <= tol;

/* ── Livre ── */
const L = new Livre();
L.charger([['100.00', '2'], ['99.98', '5'], ['99.00', '10']], [['100.02', '1'], ['100.04', '3'], ['101.00', '8']]);
v('livre : meilleurs bid / ask', L.meilleurs().bid === 100 && L.meilleurs().ask === 100.02);
const tr = L.tranches(0.02, 2);
v('livre : milieu et spread', proche(tr.milieu, 100.01, 1e-9) && proche(tr.spreadPct, 0.02 / 100.01 * 100, 1e-6));
v('livre : 100 tranches par côté (±2 % par pas de 0,02 %)', tr.bid.length === 100 && tr.ask.length === 100);
v('livre : liquidité en dollars (100,00 × 2 = 200 $) dans la tranche 0 du bid', proche(tr.bid.reduce((a, b) => a + b, 0), 100 * 2 + 99.98 * 5 + 99 * 10, 1e-6));
v('livre : couverture = jusqu’au dernier niveau de l’instantané', proche(tr.couvBasPct, (100.01 - 99) / 100.01 * 100, 1e-6) && proche(tr.couvHautPct, (101 - 100.01) / 100.01 * 100, 1e-6));
L.appliquer('bid', [['99.98', '0']]); v('livre : quantité 0 = niveau supprimé', !L.bids.has(99.98));
const chg = []; L.appliquer('ask', [['100.02', '4']], (p, av, ap, cote) => chg.push([p, av, ap, cote])); v('livre : callback de changement', chg.length === 1 && chg[0][1] === 1 && chg[0][2] === 4 && chg[0][3] === 'ask');
L.appliquer('bid', [['100.05', '1']]); v('livre : carnet croisé détecté puis nettoyé', L.estCroise() && L.nettoyerCroisement() >= 1 && !L.estCroise());
v('livre : profondeur jusqu’à x % et déséquilibre', profondeurJusqua(Float64Array.from([1, 2, 3, 4]), 0.5, 1) === 3 && desequilibre(3, 1) === 0.5 && desequilibre(0, 0) === null);
v('livre : vide → null', new Livre().tranches() === null);

/* ── Synchronisation Binance (comptant) ── */
{
  let demandes = 0; const trous = [];
  const S = creerSynchro({ surBesoinSnapshot: () => demandes++, surTrou: t => trous.push(t) });
  const ev = (U, u, b = [], a = []) => ({ U, u, b, a });
  S.recevoir(ev(95, 99)); S.recevoir(ev(100, 104, [['10', '1']])); S.recevoir(ev(105, 110, [['10', '2']]));
  v('synchro : avant l’instantané, on met en tampon et on le demande une seule fois', !S.pret() && demandes === 1 && S.etat().tampon === 3);
  const r = S.instantane({ lastUpdateId: 102, bids: [['9', '5']], asks: [['11', '5']] });
  v('synchro : instantané 102 → événements 95-99 jetés, 100-104 et 105-110 appliqués', r === 'synchro' && S.pret() && S.livre.bids.get(10) === 2, JSON.stringify(S.etat()));
  v('synchro : chaîne continue acceptée (U = u + 1)', S.recevoir(ev(111, 115, [['10', '3']])) === true && S.livre.bids.get(10) === 3);
  v('synchro : doublon ignoré', S.recevoir(ev(111, 115, [['10', '9']])) === false && S.livre.bids.get(10) === 3);
  S.recevoir(ev(130, 135, [['10', '7']]));                                                         // trou : 116 à 129 manquent
  v('synchro : rupture de séquence → trou noté, carnet remis en attente, nouvel instantané demandé', !S.pret() && trous.length === 1 && /rupture/.test(trous[0].raison) && demandes === 2 && S.livre.taille() === 0);
  const r2 = S.instantane({ lastUpdateId: 140, bids: [['9', '5']], asks: [['11', '5']] });
  v('synchro : instantané 140 plus récent que l’événement tamponné (u = 135) → synchro, événement jeté', r2 === 'synchro' && S.pret());
  v('synchro : ensuite l’événement U ≤ 141 ≤ u est accepté', S.recevoir(ev(138, 145, [['10', '1']])) === true);
  const T2 = []; const S5 = creerSynchro({ surTrou: t => T2.push(t) }); S5.recevoir(ev(1, 2)); S5.instantane({ lastUpdateId: 2, bids: [['9', '1']], asks: [['11', '1']] }); S5.recevoir(ev(50, 51));
  v('synchro : un instantané trop ancien PENDANT la synchro initiale n’est pas un trou (rien n’était enregistré)', T2.length === 0 && !S5.pret());
}
{
  let demandes = 0; const S = creerSynchro({ surBesoinSnapshot: () => demandes++ });
  S.recevoir({ U: 500, u: 505, b: [], a: [] });
  v('synchro : instantané trop ancien (U = 500 > 101) → refusé et redemandé', S.instantane({ lastUpdateId: 100, bids: [['9', '1']], asks: [['11', '1']] }) === 'trop-ancien' && !S.pret() && demandes === 2 && S.stats.tropAnciens === 1);
  v('synchro : un instantané correct suit', S.instantane({ lastUpdateId: 502, bids: [['9', '1']], asks: [['11', '1']] }) === 'synchro');
}
{
  const trous = []; const S = creerSynchro({ futures: true, surTrou: t => trous.push(t) });
  S.recevoir({ U: 10, u: 20, pu: 5, b: [], a: [] }); S.instantane({ lastUpdateId: 15, bids: [['9', '1']], asks: [['11', '1']] });
  v('futures : synchro avec pu', S.pret());
  v('futures : pu = u précédent accepté', S.recevoir({ U: 21, u: 30, pu: 20, b: [['9', '2']], a: [] }) === true);
  S.recevoir({ U: 40, u: 50, pu: 35, b: [], a: [] });
  v('futures : pu ≠ u précédent → trou', !S.pret() && trous.length === 1);
  const S2 = creerSynchro({ surTrou: t => trous.push(t) }); S2.recevoir({ U: 1, u: 2, b: [], a: [] }); S2.instantane({ lastUpdateId: 1, bids: [['9', '1']], asks: [['11', '1']] });
  S2.reconnexion(1000, 2000); v('reconnexion du flux : carnet invalidé, trou « flux coupé »', !S2.pret() && trous.some(t => /flux coupé/.test(t.raison)));
}

/* ── Agrégation ── */
{
  const A = new AgregateurTrades(); A.ajouter({ prix: 100, qte: 1, vendeurAgresseur: false }); A.ajouter({ prix: 101, qte: 2, vendeurAgresseur: true }); A.ajouter({ prix: 100.5, qte: 0.5, vendeurAgresseur: false });
  const r = A.vider(); v('trades : volume agressif acheteur / vendeur', r.n === 3 && proche(r.achatUsd, 150.25, 1e-9) && proche(r.venteUsd, 202, 1e-9) && proche(r.deltaUsd, -51.75, 1e-9) && r.plusGros.cote === 'vente' && r.ouv === 100 && r.cloture === 100.5);
  v('trades : seconde vide → null, remise à zéro', A.vider() === null);
  const Sa = new SeuilAdaptatif({ capacite: 1000, quantile: 0.99, minEchantillons: 100, plancherUsd: 0, recalculMs: 0 }); v('seuil : infini sans assez d’échantillons (aucun événement inventé)', Sa.seuil(1) === Infinity);
  for (let i = 1; i <= 1000; i++) Sa.ajouter(i); v('seuil : quantile 99 % de 1…1000 ≈ 990', Sa.seuil(2) >= 985 && Sa.seuil(2) <= 995, String(Sa.seuil(2)));
  const D = new DetecteurGrosOrdres({ plancherUsd: 10000, minEchantillons: 50 }); let t = 0;
  for (let i = 0; i < 400; i++) D.niveau('bid', 100 + i * 0.01, 1, 1 + (i % 10) * 0.2, t += 100);                // petits niveaux : calibre le seuil
  D.prendre(); const seuil = D.seuil(t + 20000); v('détecteur : le seuil s’adapte (≥ plancher)', seuil >= 10000 && Number.isFinite(seuil), String(seuil));
  t += 20000; const e1 = D.niveau('bid', 90, 0, 1000, t);
  v('détecteur : un gros niveau qui apparaît → « apparition »', e1 && e1.type === 'apparition' && e1.usd === 90000);
  v('détecteur : pas de nouvelle apparition tant que le niveau reste gros (pas de scintillement)', D.niveau('bid', 90, 1000, 1010, t + 50) === null && D.niveau('bid', 90, 1010, 995, t + 80) === null);
  const e2 = D.niveau('bid', 90, 995, 0, t + 3000); v('détecteur : disparu sans transaction → « retrait » (candidat faux mur), avec sa durée de vie', e2 && e2.type === 'retrait' && e2.dureeMs === 3000, JSON.stringify(e2));
  D.niveau('ask', 110, 0, 900, t + 4000); D.noterTrade(110, 700, t + 6000); const e3 = D.niveau('ask', 110, 900, 5, t + 6100);
  v('détecteur : disparu pendant des transactions à ce prix → « exécution »', e3 && e3.type === 'execution', JSON.stringify(e3));
  const D2 = new DetecteurGrosOrdres({ plancherUsd: 10000, minEchantillons: 50 }); t = 0; for (let i = 0; i < 400; i++) D2.niveau('bid', 100 + i * 0.01, 1, 1 + (i % 10) * 0.2, t += 100); D2.prendre(); t += 20000;
  D2.niveau('bid', 80, 900, 950, t); v('détecteur : un niveau déjà gros avant qu’on le voie ne crée pas d’« apparition » inventée', D2.prendre().length === 0);
}

/* ── Format binaire ── */
{
  v('quantification : 0 $ → 0, aller-retour à 0,02 % près', quantifier(0, 100) === 0 && [150, 5000, 123456, 4e6].every(x => Math.abs(dequantifier(quantifier(x, 100), 100) - x) / x < 2e-4));
  v('quantification : écrêtage au plafond', quantifier(1e15, 100) === 65535);
  const n = 6, e = { nTranches: n, unite: 100 }, bid = Float64Array.from([0, 500, 1e5, 0, 7, 2e6]), ask = Float64Array.from([300, 0, 0, 9e4, 1e3, 12]);
  const eh = encoderEntete({ nTranches: n, pasPct: 0.02, unite: 100 }), r1 = encoderEnregistrement(1000, { meilleurBid: 81000.5, meilleurAsk: 81000.6, couvBasPct: 1.5, couvHautPct: 0.25, bid, ask }, e), r2 = encoderEnregistrement(1001, { meilleurBid: 81001, meilleurAsk: 81001.1, couvBasPct: 1.5, couvHautPct: 0.25, bid, ask }, e);
  v('format : taille d’enregistrement', r1.length === tailleEnregistrement(n));
  const tout = new Uint8Array(eh.length + r1.length + r2.length); tout.set(eh, 0); tout.set(r1, eh.length); tout.set(r2, eh.length + r1.length);
  const d = decoderFichier(tout); v('format : 2 enregistrements relus', d && d.enregistrements.length === 2 && d.enregistrements[1].tSec === 1001 && d.enregistrements[0].meilleurBid === 81000.5 && proche(d.enregistrements[0].couvHautPct, 0.25, 1e-6));
  v('format : valeurs relues à 0,02 % près', proche(d.enregistrements[0].bid[2], 1e5, 25) && d.enregistrements[0].bid[0] === 0 && proche(d.enregistrements[0].ask[3], 9e4, 20));
  const coupe = decoderFichier(tout.subarray(0, tout.length - 7)); v('format : un enregistrement coupé (arrêt brutal) est ignoré', coupe.enregistrements.length === 1 && coupe.tronque === true);
  v('format : mauvais en-tête refusé', decoderFichier(new Uint8Array(64)) === null && TAILLE_ENTETE === 16);
}

/* ── Stockage ── */
{
  const dos = path.join(tmp, 'stock'), t0 = Date.UTC(2026, 9, 1, 10, 0, 0); let horloge = t0;
  const S = creerStockage({ dossier: dos, maintenant: () => horloge, quotaOctets: 60000, tamponMs: 0 });
  const e = { nTranches: 4, pasPct: 0.02, unite: 100 }, mk = (ts, p) => encoderEnregistrement(Math.floor(ts / 1000), { meilleurBid: p, meilleurAsk: p + 0.1, couvBasPct: 3, couvHautPct: 3, bid: Float64Array.from([1, 2, 3, 4]), ask: Float64Array.from([4, 3, 2, 1]) }, e);
  for (let s = 0; s < 30; s++) S.ecrireProfondeur('kraken-BTC', t0 + s * 1000, mk(t0 + s * 1000, 100 + s), e);
  S.ecrireLigne('trades', 'kraken-BTC', t0 + 5000, { t: t0 + 5000, n: 3 }); S.ecrireAgg1m('kraken-BTC', t0, { t: t0, secondes: 30 }); S.noterTrou({ t: t0, flux: 'kraken', de: t0 - 5000, a: t0 });
  const lu = S.lireProfondeur('kraken-BTC', t0, t0 + 60000); v('stockage : 30 secondes de profondeur écrites puis relues', lu.enregistrements.length === 30 && lu.enregistrements[29].meilleurBid === 129, String(lu.enregistrements.length));
  v('stockage : lignes, agrégats et trous relus', S.lireLignes('trades', 'kraken-BTC', t0, t0 + 9000).length === 1 && S.lireAgg1m('kraken-BTC', t0 - 1000, t0 + 1000).length === 1 && S.lireTrous(0).length === 1);
  horloge = t0 + 2 * 3600e3; v('stockage : les heures finies sont compressées (.gz) et lisibles', S.compresserFinis() >= 2 && fs.existsSync(path.join(dos, 'profondeur', 'kraken-BTC', '2026-10-01', '10.bin.gz')) && S.lireProfondeur('kraken-BTC', t0, t0 + 60000).enregistrements.length === 30);
  // quota : 3 jours de gros fichiers → les plus vieux partent, le dernier jour et les agrégats restent
  for (const j of [1, 2, 3]) { const d = path.join(dos, 'evenements', 'kraken-BTC', '2026-09-0' + j); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, '00.jsonl.gz'), Buffer.alloc(30000, j)); }
  horloge = Date.UTC(2026, 9, 5); const p = S.purger();
  v('quota : purge les jours les plus anciens d’abord', p.supprimes[0] === '2026-09-01' && p.apres <= 60000 * 0.9 + 1 && fs.existsSync(path.join(dos, 'evenements', 'kraken-BTC', '2026-09-03')) === (p.supprimes.length < 3), JSON.stringify(p));
  v('quota : agrégats d’une minute et journal des trous jamais purgés', S.lireAgg1m('kraken-BTC', t0 - 1000, t0 + 1000).length === 1 && S.lireTrous(0).length === 1);
  // reprise après arrêt brutal : fin de fichier coupée
  horloge = t0 + 5 * 3600e3; const S2 = creerStockage({ dossier: dos, maintenant: () => horloge, tamponMs: 0 }); const f = path.join(dos, 'profondeur', 'kraken-BTC', '2026-10-01', '15.bin');
  S2.ecrireProfondeur('kraken-BTC', horloge, mk(horloge, 1), e); fs.appendFileSync(f, Buffer.alloc(11)); const S3 = creerStockage({ dossier: dos, maintenant: () => horloge, tamponMs: 0 });
  S3.ecrireProfondeur('kraken-BTC', horloge + 1000, mk(horloge + 1000, 2), e);
  const apres = S3.lireProfondeur('kraken-BTC', horloge, horloge + 5000); v('reprise : un enregistrement coupé est rogné, le suivant est bien aligné', apres.enregistrements.length === 2 && apres.enregistrements[1].meilleurBid === 2, String(apres.enregistrements.length));
}

/* ── Connexion robuste (faux WebSocket) ── */
class FauxWS {
  static instances = [];
  constructor(url) { this.url = url; this.readyState = 0; this.envoyes = []; FauxWS.instances.push(this); setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 1); }
  send(m) { this.envoyes.push(m); } close() { this.readyState = 3; setTimeout(() => this.onclose && this.onclose(), 1); }
  recevoir(o) { this.onmessage && this.onmessage({ data: typeof o === 'string' ? o : JSON.stringify(o) }); }
}
const dormir = ms => new Promise(r => setTimeout(r, ms));
{
  FauxWS.instances.length = 0; const trous = [], msgs = []; let coupures = 0, ouvertures = 0;
  const C = creerConnexion({ nom: 'test', url: 'ws://x', abonnement: [{ a: 1 }], WebSocketImpl: FauxWS, surMessage: m => msgs.push(m), noterTrou: t => trous.push(t), surCoupure: () => coupures++, surOuverture: () => ouvertures++, attenteMinMs: 10, attenteMaxMs: 40, silenceMaxMs: 80, verifierMs: 15 });
  C.ouvrir(); await dormir(10); v('connexion : ouverte, abonnement envoyé', FauxWS.instances.length === 1 && FauxWS.instances[0].envoyes[0] === '{"a":1}' && ouvertures === 1);
  FauxWS.instances[0].recevoir({ x: 1 }); v('connexion : message transmis', msgs.length === 1);
  FauxWS.instances[0].close(); await dormir(60);
  v('connexion : coupure → reconnexion automatique', coupures >= 1 && FauxWS.instances.length >= 2 && ouvertures >= 2);
  FauxWS.instances[FauxWS.instances.length - 1].recevoir({ x: 2 }); v('connexion : le trou est noté quand les données reprennent (jamais comblé)', trous.length === 1 && trous[0].flux === 'test' && trous[0].a > trous[0].de, JSON.stringify(trous));
  const avant = FauxWS.instances.length; await dormir(200);
  v('connexion : silence de plus de 80 ms → reconnexion forcée (surveillance)', FauxWS.instances.length > avant && /silence/.test(C.etat().derniereErreur || ''));
  C.fermer(); const n = FauxWS.instances.length; await dormir(100); v('connexion : après fermeture, plus de reconnexion', FauxWS.instances.length === n);
}

/* ── Enregistreur complet avec faux flux ── */
{
  FauxWS.instances.length = 0; const dos = path.join(tmp, 'rec'); let horloge = Date.UTC(2026, 9, 10, 8, 0, 0, 100);
  const S = creerStockage({ dossier: dos, maintenant: () => horloge, tamponMs: 0 });
  const snapSpot = { lastUpdateId: 1000, bids: [['100.00', '5'], ['99.99', '5']], asks: [['100.02', '5'], ['100.03', '5']] };
  const get = async url => /api\/v3\/depth/.test(url) ? snapSpot : /fapi\/v1\/depth/.test(url) ? { lastUpdateId: 2000, bids: [['100.00', '3']], asks: [['100.02', '3']] } : /premiumIndex/.test(url) ? { lastFundingRate: '0.0001', markPrice: '100', indexPrice: '100.1', nextFundingTime: 1 } : /openInterest/.test(url) ? { openInterest: '5000' } : /LongShort/.test(url) ? [{ longShortRatio: '1.5', longAccount: '0.6' }] : {};
  const R = creerEnregistreur({ stockage: S, actifs: ['BTC'], maintenant: () => horloge, fetchJson: get, WebSocketImpl: FauxWS, options: { minEchantillons: 20, plancherUsd: 5000 } });
  R.demarrer(); await dormir(50);
  const spot = FauxWS.instances.find(w => /stream\.binance\.com/.test(w.url)), fut = FauxWS.instances.find(w => /fstream/.test(w.url)), kr = FauxWS.instances.find(w => /kraken/.test(w.url));
  v('enregistreur : 3 connexions (Binance comptant, Binance futures, Kraken) vers les bons flux', !!spot && !!fut && !!kr && /btcusdt@depth@100ms/.test(spot.url) && /btcusdt@aggTrade/.test(spot.url) && /forceOrder/.test(fut.url) && /book/.test(kr.envoyes[0]) && /BTC\/USD/.test(kr.envoyes[0]) && /"depth":500/.test(kr.envoyes[0]));
  spot.recevoir({ stream: 'btcusdt@depth@100ms', data: { e: 'depthUpdate', E: horloge, s: 'BTCUSDT', U: 1001, u: 1003, b: [['100.00', '6']], a: [] } });
  await dormir(30);
  spot.recevoir({ stream: 'btcusdt@depth@100ms', data: { e: 'depthUpdate', E: horloge, s: 'BTCUSDT', U: 1004, u: 1004, b: [['99.50', '800']], a: [['100.50', '900']] } });
  spot.recevoir({ stream: 'btcusdt@aggTrade', data: { e: 'aggTrade', E: horloge, s: 'BTCUSDT', p: '100.02', q: '2', T: horloge, m: false } });
  spot.recevoir({ stream: 'btcusdt@aggTrade', data: { e: 'aggTrade', E: horloge, s: 'BTCUSDT', p: '100.00', q: '1', T: horloge, m: true } });
  fut.recevoir({ stream: 'btcusdt@forceOrder', data: { e: 'forceOrder', E: horloge, o: { s: 'BTCUSDT', S: 'SELL', q: '2', p: '99', ap: '99.5', z: '2', T: horloge } } });
  fut.recevoir({ stream: 'btcusdt@depth@100ms', data: { e: 'depthUpdate', E: horloge, s: 'BTCUSDT', U: 2001, u: 2002, pu: 1999, b: [['100.00', '4']], a: [] } });
  await dormir(30);
  kr.recevoir({ channel: 'book', type: 'snapshot', data: [{ symbol: 'BTC/USD', bids: [{ price: 99.9, qty: 4 }], asks: [{ price: 100.1, qty: 4 }] }] });
  kr.recevoir({ channel: 'trade', type: 'update', data: [{ symbol: 'BTC/USD', side: 'sell', qty: 0.5, price: 99.9 }] });
  horloge += 1000; R.seconde(); horloge += 1000; R.seconde(); horloge += 60000; R.seconde();
  const e = R.etat();
  v('enregistreur : les trois carnets de BTC sont prêts et écrivent', e.flux['binance-spot-BTC'].pret && e.flux['binance-fut-BTC'].pret && e.flux['kraken-BTC'].pret && e.flux['binance-spot-BTC'].secondes >= 2, JSON.stringify(e.flux['binance-spot-BTC']));
  const t1 = horloge; const p = S.lireProfondeur('binance-spot-BTC', t1 - 120000, t1);
  v('enregistreur : profondeur relue (meilleur bid 100,00 → quantité 6 appliquée)', p.enregistrements.length >= 2 && p.enregistrements[0].meilleurBid === 100 && p.enregistrements[0].meilleurAsk === 100.02, JSON.stringify(p.enregistrements[0] && [p.enregistrements[0].meilleurBid, p.enregistrements[0].meilleurAsk]));
  v('enregistreur : trades agrégés (achat 200,04 $, vente 100 $)', (() => { const l = S.lireLignes('trades', 'binance-spot-BTC', t1 - 120000, t1); return l.length >= 1 && proche(l[0].achatUsd, 200.04, 1e-6) && proche(l[0].venteUsd, 100, 1e-6); })());
  v('enregistreur : liquidation d’un long enregistrée', S.lireLignes('liquidations', 'binance-fut-BTC', t1 - 120000, t1).some(l => l.cote === 'long' && proche(l.usd, 199, 1e-6)));
  v('enregistreur : dérivés (financement, intérêt ouvert, ratio) écrits', await (async () => { await dormir(30); const l = S.lireLignes('derives', 'binance-fut-BTC', horloge - 3600e3, horloge + 3600e3); return l.length >= 1 && l[0].financement === 0.0001 && l[0].interetOuvert === 5000 && l[0].ratioComptes === 1.5; })());
  v('enregistreur : agrégat d’une minute écrit au changement de minute', S.lireAgg1m('binance-spot-BTC', Date.UTC(2026, 9, 10), Date.UTC(2026, 9, 11)).length >= 1);
  // rupture de séquence côté comptant : trou noté + nouvel instantané demandé
  spot.recevoir({ stream: 'btcusdt@depth@100ms', data: { e: 'depthUpdate', E: horloge, s: 'BTCUSDT', U: 5000, u: 5001, b: [], a: [] } }); await dormir(30);
  v('enregistreur : rupture de séquence → trou dans le journal', S.lireTrous(0).some(t => t.flux === 'binance-spot-BTC' && /rupture/.test(t.raison)));
  // coupure Kraken
  const avantTrous = S.lireTrous(0).length; kr.close(); await dormir(1200); const kr2 = FauxWS.instances.filter(w => /kraken/.test(w.url)).pop(); kr2.recevoir({ channel: 'book', type: 'snapshot', data: [{ symbol: 'BTC/USD', bids: [{ price: 99.9, qty: 4 }], asks: [{ price: 100.1, qty: 4 }] }] });
  v('enregistreur : coupure Kraken → reconnexion, réabonnement, trou noté', kr2 !== kr && kr2.envoyes.length === 2 && S.lireTrous(0).length > avantTrous);
  R.arreter(); v('enregistreur : arrêt propre', !R.etat().enMarche);
  const st = statutFlux(dos, { stockage: S, maintenant: horloge });
  v('statut sans état : phrase claire', /jamais démarré/.test(st.phrase));
  fs.mkdirSync(path.join(dos, 'flux'), { recursive: true });
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(ok + ' réussis, ' + ko + ' échecs'); process.exit(ko ? 1 : 0);
