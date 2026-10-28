// Enregistreur de carnet d'ordres et de flux (V4, phase 2) : Kraken (livre + transactions) et Binance (livre + transactions + liquidations, comptant ET futures) pour BTC, SOL, DOGE.
// Sources PUBLIQUES, aucune clé. Chaque seconde et par flux : meilleur bid / ask, spread, profondeur par tranches de 0,02 % sur ±3 % (carte de chaleur), transactions agrégées (volume agressif
// acheteur / vendeur), événements « gros ordres » (seuil adaptatif), liquidations ; chaque minute : un agrégat gardé indéfiniment ; toutes les 5 minutes : financement, intérêt ouvert, ratio long / short.
// Un trou (coupure, rupture de séquence) est NOTÉ, jamais comblé. Voir docs/FLUX_CARNET.md.
import { Livre, profondeurJusqua, desequilibre } from '../../strategies/liquidite/livre.js';
import { creerSynchro } from '../../strategies/liquidite/synchro-binance.js';
import { AgregateurTrades, DetecteurGrosOrdres } from '../../strategies/liquidite/agregation-flux.js';
import { encoderEnregistrement } from '../../strategies/liquidite/format-profondeur.js';
import { creerConnexion } from './connexion.mjs';

export const ACTIFS = Object.freeze({
  BTC: { binance: 'BTCUSDT', kraken: 'BTC/USD', plancherUsd: 100000 },
  SOL: { binance: 'SOLUSDT', kraken: 'SOL/USD', plancherUsd: 20000 },
  DOGE: { binance: 'DOGEUSDT', kraken: 'DOGE/USD', plancherUsd: 10000 }
});
export const PARAMS = Object.freeze({ pasPct: 0.02, demiLargeurPct: 3, uniteUsd: 1000 })   // 16 bits log : plafond 65 535 × 1 000 $ ≈ 65 M$ par tranche (100 $ saturait à 6,5 M$ sur BTC);
export const URLS = Object.freeze({
  binanceSpotWs: 'wss://stream.binance.com:9443/stream?streams=', binanceFutWs: 'wss://fstream.binance.com/stream?streams=', krakenWs: 'wss://ws.kraken.com/v2',
  binanceSpotDepth: s => 'https://api.binance.com/api/v3/depth?symbol=' + s + '&limit=5000', binanceFutDepth: s => 'https://fapi.binance.com/fapi/v1/depth?symbol=' + s + '&limit=1000',
  prime: s => 'https://fapi.binance.com/fapi/v1/premiumIndex?symbol=' + s, interet: s => 'https://fapi.binance.com/fapi/v1/openInterest?symbol=' + s,
  ratioComptes: s => 'https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=' + s + '&period=5m&limit=1', ratioTop: s => 'https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=' + s + '&period=5m&limit=1'
});
const nombre = x => { const n = parseFloat(x); return Number.isFinite(n) ? n : null; };

export function creerEnregistreur({ stockage, actifs = Object.keys(ACTIFS), maintenant = () => Date.now(), fetchJson = null, WebSocketImpl = globalThis.WebSocket, urls = URLS, params = PARAMS,
  options = {}, surErreur = () => {} } = {}) {
  const get = fetchJson || (async (url) => { const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 Rayle-flux' }, signal: AbortSignal.timeout(20000) }); if (!r.ok) { const e = new Error('HTTP ' + r.status); e.statut = r.status; e.retryApres = Number(r.headers.get('retry-after')) || null; throw e; } return r.json(); });
  const n = Math.round(params.demiLargeurPct / params.pasPct), entete = { nTranches: n, pasPct: params.pasPct, unite: params.uniteUsd };
  const flux = new Map();                                        // clé → { cle, livre|synchro, detecteur, trades, agg, ... }
  const connexions = [], erreurs = []; let arret = true, minuteur = null, derives = null, dernierDerives = 0, derniereSeconde = 0;
  const erreur = (ou, e) => { const m = ou + ' : ' + String(e && e.message || e).slice(0, 140); erreurs.unshift({ t: maintenant(), msg: m }); erreurs.length = Math.min(erreurs.length, 10); try { surErreur(m); } catch (x) { /* rien */ } };
  const noterTrou = t => { try { stockage.noterTrou(t); } catch (e) { /* disque */ } };

  function creerFlux(cle, actif, typeSource) {
    const a = ACTIFS[actif], f = { cle, actif, type: typeSource, detecteur: new DetecteurGrosOrdres({ plancherUsd: options.plancherUsd || a.plancherUsd, quantile: options.quantile || 0.995, minEchantillons: options.minEchantillons || 1500 }),
      trades: new AgregateurTrades(), liq: { longUsd: 0, shortUsd: 0, n: 0 }, minute: null, derniereEcriture: null, secondesEcrites: 0, bufBid: new Float64Array(n), bufAsk: new Float64Array(n), dernierNiveau: null, evenements: 0 };
    if (typeSource === 'kraken') { f.livre = new Livre(); f.synchro = null; f.pret = () => f.livre.taille() > 0 && f.prete === true; f.prete = false; }
    else {
      const futures = typeSource === 'binance-fut';
      f.synchro = creerSynchro({ futures, maintenant, surBesoinSnapshot: () => recupererInstantane(f, futures), surTrou: t => noterTrou({ ...t, flux: cle }) });
      f.livre = f.synchro.livre; f.pret = () => f.synchro.pret();
    }
    flux.set(cle, f); return f;
  }
  async function recupererInstantane(f, futures) {
    let attente = 2000;
    for (let essai = 0; essai < 1000 && !arret; essai++) {
      const depuis = Date.now() - (f.dernierInstantane || 0); if (depuis < 1500) await new Promise(r => setTimeout(r, 1500 - depuis));          // jamais plus d'un instantané toutes les 1,5 s par flux (limites de l'API)
      f.dernierInstantane = Date.now();
      try { const s = await get((futures ? urls.binanceFutDepth : urls.binanceSpotDepth)(ACTIFS[f.actif].binance)); f.synchro.instantane({ lastUpdateId: s.lastUpdateId, bids: s.bids, asks: s.asks }); return; }
      catch (e) { erreur('instantané ' + f.cle, e); const apres = e.retryApres ? e.retryApres * 1000 : attente; await new Promise(r => setTimeout(r, Math.min(60000, apres))); attente = Math.min(60000, attente * 2); }
    }
  }
  const changement = (f, cote, t) => (p, avant, apres) => { const e = f.detecteur.niveau(cote, p, avant, apres, t); if (e) f.evenements++; };

  /* ── Binance : un seul flux combiné par type (comptant / futures) ── */
  function messageBinance(typeSource) {
    return (texte, t) => {
      let m; try { m = JSON.parse(texte); } catch (e) { return; }
      const d = m && m.data; if (!d || !m.stream) return;
      const actif = actifs.find(a => ACTIFS[a].binance === d.s || ACTIFS[a].binance.toLowerCase() === m.stream.split('@')[0]); if (!actif) return;
      const f = flux.get(typeSource + '-' + actif); if (!f) return;
      if (d.e === 'depthUpdate') { const ev = { U: d.U, u: d.u, pu: d.pu, b: d.b, a: d.a }; const tt = d.E || t; f.synchro.recevoir(ev, (p, av, ap, cote) => { const e = f.detecteur.niveau(cote, p, av, ap, tt); if (e) f.evenements++; }); }
      else if (d.e === 'aggTrade') { const prix = nombre(d.p), qte = nombre(d.q); if (prix && qte) { f.trades.ajouter({ prix, qte, vendeurAgresseur: d.m === true }); f.detecteur.noterTrade(prix, qte, d.T || t); } }
      else if (d.e === 'forceOrder' && d.o) { const o = d.o, prix = nombre(o.ap) || nombre(o.p), qte = nombre(o.z) || nombre(o.q); if (prix && qte) { const longLiquide = o.S === 'SELL', usd = prix * qte; if (longLiquide) f.liq.longUsd += usd; else f.liq.shortUsd += usd; f.liq.n++; try { stockage.ecrireLigne('liquidations', f.cle, d.E || t, { t: d.E || t, cote: longLiquide ? 'long' : 'short', prix, qte, usd }); } catch (e) { /* disque */ } } }
    };
  }
  /* ── Kraken v2 ── */
  function messageKraken(texte, t) {
    let m; try { m = JSON.parse(texte); } catch (e) { return; }
    if (m.channel === 'book' && Array.isArray(m.data)) for (const d of m.data) {
      const actif = actifs.find(a => ACTIFS[a].kraken === d.symbol); if (!actif) continue; const f = flux.get('kraken-' + actif); if (!f) continue;
      const conv = l => (l || []).map(x => [x.price, x.qty]);
      if (m.type === 'snapshot') { f.livre.charger(conv(d.bids), conv(d.asks)); f.prete = true; }
      else if (f.prete) { f.livre.appliquer('bid', conv(d.bids), changement(f, 'bid', t)); f.livre.appliquer('ask', conv(d.asks), changement(f, 'ask', t)); }
    } else if (m.channel === 'trade' && Array.isArray(m.data)) for (const d of m.data) {
      const actif = actifs.find(a => ACTIFS[a].kraken === d.symbol); if (!actif) continue; const f = flux.get('kraken-' + actif); if (!f) continue;
      const prix = nombre(d.price), qte = nombre(d.qty); if (prix && qte) { f.trades.ajouter({ prix, qte, vendeurAgresseur: d.side === 'sell' }); f.detecteur.noterTrade(prix, qte, t); }
    }
  }

  /* ── la seconde : carnet → fichier ── */
  function agregatMinute(f, tMs, tr, resume) {
    const minute = Math.floor(tMs / 60000) * 60000;
    if (f.minute && f.minute.t !== minute) { try { stockage.ecrireAgg1m(f.cle, f.minute.t, finirMinute(f.minute)); } catch (e) { /* disque */ } f.minute = null; }
    if (!f.minute) f.minute = { t: minute, s: 0, ouv: tr.milieu, haut: tr.milieu, bas: tr.milieu, cloture: tr.milieu, spread: 0, d01b: 0, d01a: 0, d05b: 0, d05a: 0, d1b: 0, d1a: 0, achat: 0, vente: 0, nTrades: 0, liqLong: 0, liqShort: 0 };
    const x = f.minute; x.s++; if (tr.milieu > x.haut) x.haut = tr.milieu; if (tr.milieu < x.bas) x.bas = tr.milieu; x.cloture = tr.milieu; x.spread += tr.spreadPct;
    x.d01b += resume.d01b; x.d01a += resume.d01a; x.d05b += resume.d05b; x.d05a += resume.d05a; x.d1b += resume.d1b; x.d1a += resume.d1a;
    if (resume.trades) { x.achat += resume.trades.achatUsd; x.vente += resume.trades.venteUsd; x.nTrades += resume.trades.n; }
    x.liqLong += f.liq.longUsd; x.liqShort += f.liq.shortUsd; f.liq.longUsd = 0; f.liq.shortUsd = 0;
  }
  const finirMinute = x => ({ t: x.t, secondes: x.s, ouv: x.ouv, haut: x.haut, bas: x.bas, cloture: x.cloture, spreadPct: x.spread / x.s, profondeurUsd: { b01: x.d01b / x.s, a01: x.d01a / x.s, b05: x.d05b / x.s, a05: x.d05a / x.s, b1: x.d1b / x.s, a1: x.d1a / x.s },
    desequilibre05: desequilibre(x.d05b, x.d05a), achatUsd: x.achat, venteUsd: x.vente, deltaUsd: x.achat - x.vente, nTrades: x.nTrades, liqLongUsd: x.liqLong, liqShortUsd: x.liqShort });

  function seconde() {
    const t = maintenant(), tSec = Math.floor(t / 1000); if (tSec === derniereSeconde) return; derniereSeconde = tSec; const tMs = tSec * 1000;
    for (const f of flux.values()) {
      try {
        const tradesSec = f.trades.vider(); if (tradesSec) stockage.ecrireLigne('trades', f.cle, tMs, { t: tMs, ...tradesSec });
        for (const e of f.detecteur.prendre()) stockage.ecrireLigne('evenements', f.cle, e.t || tMs, { ...e, t: e.t || tMs });
        if (!f.pret()) continue;
        if (f.livre.estCroise()) { f.livre.nettoyerCroisement(); f.croisements = (f.croisements || 0) + 1; }
        const tr = f.livre.tranches(params.pasPct, params.demiLargeurPct, f.bufBid, f.bufAsk); if (!tr) continue;
        stockage.ecrireProfondeur(f.cle, tMs, encoderEnregistrement(tSec, tr, entete), entete);
        const resume = { d01b: profondeurJusqua(tr.bid, params.pasPct, 0.1), d01a: profondeurJusqua(tr.ask, params.pasPct, 0.1), d05b: profondeurJusqua(tr.bid, params.pasPct, 0.5), d05a: profondeurJusqua(tr.ask, params.pasPct, 0.5), d1b: profondeurJusqua(tr.bid, params.pasPct, 1), d1a: profondeurJusqua(tr.ask, params.pasPct, 1), trades: tradesSec };
        agregatMinute(f, tMs, tr, resume); f.secondesEcrites++; f.derniereEcriture = tMs; f.dernierNiveau = { milieu: tr.milieu, spreadPct: tr.spreadPct, couvBasPct: tr.couvBasPct, couvHautPct: tr.couvHautPct };
      } catch (e) { erreur('seconde ' + f.cle, e); }
    }
  }
  async function relevesDerives() {
    const t = maintenant(); dernierDerives = t;
    for (const a of actifs) {
      const s = ACTIFS[a].binance; const o = { t, actif: a };
      try { const p = await get(urls.prime(s)); o.financement = nombre(p.lastFundingRate); o.mark = nombre(p.markPrice); o.index = nombre(p.indexPrice); o.prochainFinancement = p.nextFundingTime || null; } catch (e) { o.erreurPrime = String(e.message).slice(0, 60); }
      try { const p = await get(urls.interet(s)); o.interetOuvert = nombre(p.openInterest); } catch (e) { o.erreurInteret = String(e.message).slice(0, 60); }
      try { const p = await get(urls.ratioComptes(s)); if (Array.isArray(p) && p[0]) { o.ratioComptes = nombre(p[0].longShortRatio); o.longComptes = nombre(p[0].longAccount); } } catch (e) { o.erreurRatio = String(e.message).slice(0, 60); }
      try { const p = await get(urls.ratioTop(s)); if (Array.isArray(p) && p[0]) o.ratioGrosComptes = nombre(p[0].longShortRatio); } catch (e) { /* facultatif */ }
      try { stockage.ecrireLigne('derives', 'binance-fut-' + a, t, o); } catch (e) { /* disque */ }
    }
    derives = { t, dernier: true };
  }

  function demarrer() {
    if (!arret) return; arret = false;
    for (const a of actifs) { creerFlux('binance-spot-' + a, a, 'binance-spot'); creerFlux('binance-fut-' + a, a, 'binance-fut'); creerFlux('kraken-' + a, a, 'kraken'); }
    const noms = actifs.map(a => ACTIFS[a].binance.toLowerCase());
    const spot = noms.flatMap(s => [s + '@depth@100ms', s + '@aggTrade']).join('/'), fut = noms.flatMap(s => [s + '@depth@100ms', s + '@aggTrade', s + '@forceOrder']).join('/');
    const co = (nom, url, extra) => connexions.push(creerConnexion({ nom, url, WebSocketImpl, maintenant, noterTrou, ...extra }));
    co('binance-spot', urls.binanceSpotWs + spot, { surMessage: messageBinance('binance-spot'), surCoupure: () => { for (const a of actifs) flux.get('binance-spot-' + a).synchro.reconnexion(); }, surOuverture: () => {} });
    co('binance-fut', urls.binanceFutWs + fut, { surMessage: messageBinance('binance-fut'), surCoupure: () => { for (const a of actifs) flux.get('binance-fut-' + a).synchro.reconnexion(); } });
    co('kraken', urls.krakenWs, { surMessage: messageKraken, abonnement: () => [{ method: 'subscribe', params: { channel: 'book', symbol: actifs.map(a => ACTIFS[a].kraken), depth: 500 } }, { method: 'subscribe', params: { channel: 'trade', symbol: actifs.map(a => ACTIFS[a].kraken), snapshot: false } }],
      surCoupure: () => { for (const a of actifs) { const f = flux.get('kraken-' + a); f.prete = false; f.livre.vider(); } } });
    for (const c of connexions) c.ouvrir();
    minuteur = setInterval(() => { seconde(); if (maintenant() - dernierDerives >= 300000) relevesDerives().catch(e => erreur('dérivés', e)); }, 250); if (minuteur.unref) minuteur.unref();
    relevesDerives().catch(e => erreur('dérivés', e));
  }
  function arreter() {
    if (arret) return; arret = true; clearInterval(minuteur); for (const c of connexions) c.fermer(); connexions.length = 0;
    for (const f of flux.values()) if (f.minute && f.minute.s) { try { stockage.ecrireAgg1m(f.cle, f.minute.t, finirMinute(f.minute)); } catch (e) { /* disque */ } }
    stockage.vider(); flux.clear();
  }
  const etat = () => ({
    enMarche: !arret, derniereSeconde: derniereSeconde * 1000, derives, erreurs: erreurs.slice(0, 5),
    connexions: connexions.map(c => c.etat()),
    flux: Object.fromEntries([...flux.values()].map(f => [f.cle, { pret: f.pret(), secondes: f.secondesEcrites, derniere: f.derniereEcriture, niveau: f.dernierNiveau, niveaux: f.livre.taille(), evenementsGrosOrdres: f.evenements, seuilUsd: Number.isFinite(f.detecteur.seuil(maintenant())) ? Math.round(f.detecteur.seuil(maintenant())) : null, synchro: f.synchro ? f.synchro.etat() : null }]))
  });
  return { demarrer, arreter, etat, seconde, relevesDerives, flux };
}
