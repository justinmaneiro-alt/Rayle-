/* ═════════════ CONTRÔLEUR DES DONNÉES DE L'OR (une seule source pour le tableau de bord, le terminal de Mars et le mode télé) ═════════════
   Charge les bougies (Kraken pour le prix, Binance pour volume / delta / niveaux), suit le prix en direct (transactions du WebSocket Kraken
   du carnet : un seul flux), calcule niveaux, zones, états, événements et lecture. fetch et horloge injectables (tests Node).
   Aucune valeur inventée : un champ inconnu reste null avec sa raison. */
import { PERIODES, PERIODES_AFFICHEES, REGLES } from './config-or.js';
import { bougiesKraken, bougiesBinance, ticker24hBinance, tickerKraken } from './sources-or.js';
import { fusionner, appliquerTransaction, regrouperBougies, atr, derniereValeur, ecartMesure, biaisH1 } from './bougies-or.js';
import { niveauxCles, zonesVolume, decaler, fusionnerNiveaux } from './niveaux-or.js';
import { zonesRetournement, etudeReaction } from './zones-or.js';
import { etatZone, evenementZone, creerAntiBruit } from './etats-or.js';
import { lecture, phraseEvenement } from './lecture-or.js';
import { marcheOr, retard, heureLocale, dateParis } from './temps-or.js';
import { instrument, actifCourant } from './instruments.js';
import { marcheInstrument, retardInstrument } from './marche-instrument.js';
const INSTR = instrument(actifCourant());
import { niveauxPeriode, liquidite } from './niveaux-periode.js';
import { lireCacheBougies, ecrireCacheBougies } from './cache-bougies.js';
import { selectionV6, REGLES_NIVEAUX_H1_V6 } from './niveaux-h1.js';
import { chargerHistorique, chargerPlusAncien, rafraichirVolume, serieAffichee } from './historique-or.js';
import { ID_HISTO } from '../../../trader-pro/terminal/histo-long.js';
import { analyser as analyserStructure, CLE_REGISTRE_STRUCTURE, lireRegistre as lireRegStructure, ajouter as ajouterStructure, prefixeDe as prefixeStructure, bilan as bilanStructure } from './structure-alerte.js';

const lireJ = (k, d) => { try { const v = globalThis.localStorage && localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrireJ = (k, v) => { try { globalThis.localStorage && localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* plein ou refusé */ } };

export function creerMoteurOr({ fetchFn = (...a) => fetch(...a), horloge = () => Date.now(), surMaj = () => {}, surEvenement = () => {}, etudeAuto = true, structureAuto = etudeAuto, chargerH1 = null } = {}) {
  const S = {
    periode: lireJ('rayle_or_periode', 'H1'), k: [], kM15: [], refM15: [], refH1: [], refP: [], atrH1: [], ecart: null, ecartN: 0,
    prix: null, tPrix: null, ticker: null, ref24h: null, erreurs: {}, niveaux: [], zonesVol: [], zones: [], etats: {}, lecture: null, etude: null, etudeEtat: 'à faire',
    chargement: true, derniereRefM15: null, evenements: [], hist: null, chargementAncien: false, niveauxP: null, liquidite: null, spreads: lireJ('rayle_or_spreads', []).filter(x => x && x.s > 0)
  };
  if (!PERIODES[S.periode] || !PERIODES_AFFICHEES.includes(S.periode)) S.periode = 'H1';   // une ancienne préférence M5 / M15 devient H1
  const anti = creerAntiBruit(); const regl = lireJ('rayle_or_alertes', null); if (regl) { anti.regler(regl); if (regl.coupe) anti.couper(true); }
  let minuteries = [], arrete = false;
  const err = (k, e) => { S.erreurs[k] = e ? (e.message || String(e)) : null; };

  /* historique de la période affichée : Kraken paginé jusqu'à la mise en ligne du perpétuel, puis la référence Binance (historique-or.js) */
  async function chargerPeriode() {
    const p = S.periode, clePeriode = (INSTR.id || 'OR') + '|' + p;
    /* 2026-11-15 : la dernière copie des bougies s'affiche tout de suite (le réseau la remplace ensuite) : plus d'attente devant un graphique vide */
    if (!S.k.length) { try { const c = await lireCacheBougies(clePeriode); if (c && p === S.periode && !S.k.length && Array.isArray(c.k) && c.k.length > 50) { S.hist = c; S.k = c.k.slice(); S.refP = c.vol || []; try { calculer(); } catch (e) { /* les références arrivent avec le réseau */ } surMaj(S); } } catch (e) { /* pas de copie : on attend le réseau */ } }
    try {
      const H = await chargerHistorique(p, { fetchFn, maintenant: horloge(), actifLong: ID_HISTO[INSTR.id] || null }); if (p !== S.periode) return;
      S.hist = H; S.k = H.k.slice(); S.refP = H.vol; err('kraken', null); err('binanceP', H.erreurRef); ecrireCacheBougies(clePeriode, H);
    } catch (e) {
      err('kraken', e);   // secours : les 1500 dernières bougies, comme avant
      try { S.k = await bougiesKraken(p, { fetchFn, maintenant: horloge(), n: p === 'J' ? 400 : 1500 }); S.hist = null; err('kraken', null); } catch (e2) { /* l'erreur reste affichée */ }
    }
  }
  /* glisser vers la gauche : un morceau plus ancien (Kraken tant qu'il en a, puis la référence) */
  async function plusAncien() {
    if (!S.hist || S.chargementAncien || (S.hist.krakenEpuise && S.hist.refEpuise)) return false;
    const p = S.periode, avant = S.hist.debut; S.chargementAncien = true; surMaj(S);
    try {
      const H = await chargerPlusAncien(S.hist, { fetchFn }); if (p !== S.periode) return false;
      const nouveaux = H.k.filter(b => !S.k.length || b.t < S.k[0].t);
      S.hist = H; S.k = [...nouveaux, ...S.k]; S.refP = H.vol; err('ancien', null);
      return H.debut !== avant;
    } catch (e) { err('ancien', e); return false; }
    finally { S.chargementAncien = false; surMaj(S); }
  }
  async function chargerReference() {
    const n = horloge();
    try {
      S.refM15 = fusionner(S.refM15, await bougiesBinance('M15', { depuis: S.refM15.length ? S.refM15[S.refM15.length - 1].t : n - 30 * 86400e3, jusqua: n + 1, fetchFn, max: 4 }));
      S.refH1 = fusionner(S.refH1, await bougiesBinance('H1', { depuis: S.refH1.length ? S.refH1[S.refH1.length - 1].t : n - 90 * 86400e3, jusqua: n + 1, fetchFn, max: 3 }));
      S.atrH1 = atr(S.refH1.filter(b => b.t + 3600e3 <= n), REGLES.atr); err('binance', null);
    } catch (e) { err('binance', e); }
    if (S.periode !== 'M15') try { S.kM15 = await bougiesKraken('M15', { fetchFn, maintenant: n, n: 700 }); } catch (e) { /* écart seulement */ }
    if (S.hist) try { const p = S.periode, H = await rafraichirVolume(S.hist, { fetchFn, maintenant: n }); if (p === S.periode) { S.hist = H; S.refP = H.vol; } } catch (e) { /* volume de la bougie en cours : au prochain tour */ }
    try { S.ref24h = await ticker24hBinance({ fetchFn }); } catch (e) { S.ref24h = null; }
    try { S.ticker = await tickerKraken({ fetchFn }); if (S.ticker && S.ticker.last > 0 && !S.prix) { S.prix = S.ticker.last; S.tPrix = Date.parse(S.ticker.lastTime) || n; } noterSpread(S.ticker, n); } catch (e) { /* le WebSocket donnera le prix */ }
  }
  /* spread MESURÉ (ask − bid du ticker Kraken), marché ouvert seulement ; 500 dernières mesures gardées sur l'appareil ; médiane pour le bilan */
  function noterSpread(t, n) {
    if (!t || !(t.ask > t.bid) || !(S.marche && S.marche.ouvert)) return;
    S.spreads = [...S.spreads, { t: n, s: +(t.ask - t.bid).toFixed(4) }].slice(-500); ecrireJ('rayle_or_spreads', S.spreads);
  }
  function calculer() {
    const n = horloge(), m15c = S.refM15.filter(b => b.t + 15 * 60e3 <= n), h1c = S.refH1.filter(b => b.t + 3600e3 <= n), a = derniereValeur(S.atrH1);
    const E = ecartMesure(S.periode === 'M15' ? S.k : S.kM15, S.refM15); if (E.ecart != null) { S.ecart = E.ecart; S.ecartN = E.n; }
    if (!S.prix && S.k.length) { S.prix = S.k[S.k.length - 1].c; S.tPrix = S.k[S.k.length - 1].t; }
    const e = S.ecart ?? 0, prixRef = S.prix != null ? S.prix - e : null;
    const nivRef = niveauxCles(m15c.slice(-12 * 96), n, { prix: prixRef, ecart: e }), volRef = zonesVolume(m15c, n);
    S.zonesRef = zonesRetournement({ niveaux: nivRef, volumes: volRef, prix: prixRef, a, m15: m15c, h1: h1c, atrH1: S.atrH1 });
    S.niveaux = fusionnerNiveaux(decaler(nivRef, e), a ? 0.05 * a : 0.5); S.zonesVol = decaler(volRef, e); S.zones = decaler(S.zonesRef, e);
    S.etats = Object.fromEntries(S.zonesRef.map(z => [z.id, etatZone(prixRef, z, a)]));
    S.a = a; S.biais = biaisH1(h1c); S.marche = INSTR.id === 'OR' ? marcheOr(n) : marcheInstrument(INSTR, n, S.tPrix); S.retard = INSTR.id === 'OR' ? retard(S.tPrix, n, S.marche.ouvert) : retardInstrument(INSTR, S.tPrix, n, S.marche.ouvert);
    const v24 = S.ref24h && Number.isFinite(+S.ref24h.quoteVolume) ? +S.ref24h.quoteVolume : null; S.fiable = v24 == null ? null : v24 >= REGLES.volumeFaible24h; S.volume24h = v24;
    analysePeriode(n);
    S.lecture = lecture({ prix: S.prix, zones: S.zones, biais: S.biais, etats: S.etats, marche: S.marche, fiable: S.fiable !== false });
    S.chargement = false;
  }
  /* supports, résistances et liquidité de LA PÉRIODE AFFICHÉE (niveaux-periode.js) : recalculés seulement quand une bougie se
     clôt (ou que le prix change de demi-ATR) */
  let cleNiv = null;
  function analysePeriode(n) {
    const serie = serieAffichee(S.hist, S.k, S.ecart); if (serie.length < 30) { S.niveauxP = null; S.liquidite = null; return; }
    const P = PERIODES[S.periode].ms; let j = serie.length - 1; while (j >= 0 && serie[j].t + P > n) j--;
    const base = `${S.periode}|${serie[0].t}|${j >= 0 ? serie[j].t : 0}|${Math.round((S.ecart || 0) * 10)}`, a = S.niveauxP && S.niveauxP.a;
    const cle = base + '|' + (a && S.prix ? Math.round(S.prix / (0.5 * a)) : 0);
    if (cle !== cleNiv) {
      cleNiv = cle;
      S.niveauxP = niveauxPeriode(serie, { periode: S.periode, maintenant: n, prix: S.prix });
      // H1 : niveaux affichés selon niveaux-h1-v6 (sélection v5 + niveaux retournés) ; les autres périodes ne changent pas
      if (S.periode === 'H1' && S.niveauxP.a) { const cs = serie.filter(b => b.t + P <= n); S.niveauxP = { ...S.niveauxP, bandes: selectionV6(S.niveauxP, S.prix ?? (cs.length ? cs[cs.length - 1].c : null), cs.slice(-1600)), version: REGLES_NIVEAUX_H1_V6.version }; }
      S.liquidite = liquidite(serie, { periode: S.periode, maintenant: n, prix: S.prix, a: S.niveauxP.a, pivotsL: S.niveauxP.pivots, i0: S.niveauxP.i0 });
    }
  }
  /* événements : à chaque nouvelle M15 de référence close, et à chaque changement d'état « approche » / « sur » */
  function detecter(ancienEtats) {
    const n = horloge(), m15c = S.refM15.filter(b => b.t + 15 * 60e3 <= n), der = m15c[m15c.length - 1];
    const nouveaux = [];
    for (const z of S.zonesRef || []) {
      const eAv = ancienEtats[z.id], eAp = S.etats[z.id];
      if (eAp !== eAv && (eAp === 'approche' || eAp === 'sur') && eAv) nouveaux.push({ type: eAp, z });
    }
    if (der && der.t !== S.derniereRefM15) { if (S.derniereRefM15 != null) for (const z of S.zonesRef || []) { const ev = evenementZone(m15c, z, S.a); if (ev) nouveaux.push({ type: ev.type, sens: ev.sens, z }); } S.derniereRefM15 = der.t; }
    const { h } = heureLocale(n, 'Europe/Paris');
    for (const x of nouveaux) {
      const zAff = S.zones.find(y => y.id === x.z.id) || x.z, ok = anti.autoriser(x.z.id + ':' + x.type, n, h, dateParis(n));
      const ev = { t: n, type: x.type, zone: zAff.id, texte: phraseEvenement({ type: x.type, sens: x.sens }, zAff), dit: ok.ok, raison: ok.raison };
      S.evenements.unshift(ev); S.evenements.length = Math.min(S.evenements.length, 50);
      surEvenement(ev);
    }
  }
  /* l'étude tourne dans un Worker du navigateur (même fonction, même résultat) ; repli sur le calcul direct (Node, Worker refusé) */
  function etudeHorsFil(m15, h1, a) {
    if (typeof Worker === 'undefined') return Promise.resolve(etudeReaction(m15, h1, a));
    return new Promise(ok => { let w; try { w = new Worker(new URL('./etude-worker.js', import.meta.url), { type: 'module' }); } catch (e) { ok(etudeReaction(m15, h1, a)); return; }
      const fin = r => { w.terminate(); ok(r); };
      w.onmessage = e => fin(e.data && e.data.ok ? e.data.etude : etudeReaction(m15, h1, a)); w.onerror = e => { e.preventDefault && e.preventDefault(); fin(etudeReaction(m15, h1, a)); };
      w.postMessage({ m15, h1, a }); });
  }
  async function etude() {
    const cache = lireJ('rayle_or_etude', null);
    if (cache && cache.version === REGLES.version && horloge() - cache.calcule < 24 * 3600e3) { S.etude = cache.etude; S.etudeEtat = 'faite'; return; }
    S.etudeEtat = 'en cours'; surMaj(S);
    try {
      const n = horloge(), m15 = await bougiesBinance('M15', { depuis: n - 365 * 86400e3, jusqua: n, fetchFn, max: 30 });
      const h1 = regrouperBougies(m15, 3600e3), a = atr(h1, REGLES.atr);
      await new Promise(r => setTimeout(r, 0));
      S.etude = await etudeHorsFil(m15, h1, a); S.etudeEtat = 'faite';
      ecrireJ('rayle_or_etude', { version: REGLES.version, calcule: n, etude: S.etude });
    } catch (e) { S.etudeEtat = 'échec : ' + e.message; }
    surMaj(S);
  }
  /* alerte « setup possible » (structure-v1) : à chaque nouvelle bougie H1 close, une seule fois ; registre daté en ajout seul ; information de lecture, jamais un signal */
  let hStruct = null, cleStruct = null, enStruct = false;
  async function suiviStructure() {
    if (arrete || enStruct) return; const n = horloge(), cle = Math.floor(n / 3600e3); if (cle === cleStruct) return;
    enStruct = true;
    try {
      if (!hStruct) hStruct = await (chargerH1 ? chargerH1(n) : chargerHistorique('H1', { fetchFn, maintenant: n }));
      else { const r = await (chargerH1 ? chargerH1(n, true) : chargerHistorique('H1', { fetchFn, maintenant: n, jours: 5 })); hStruct = { ...hStruct, k: fusionner(hStruct.k, r.k) }; }
      const C = serieAffichee(hStruct, hStruct.k, S.ecart).filter(b => b.t + 3600e3 <= n), res = analyserStructure(C);
      const stocke = lireJ(CLE_REGISTRE_STRUCTURE, null); let reg = lireRegStructure(stocke, n);
      const r = ajouterStructure(reg, res.setups, { vu: n }); reg = r.registre;
      if (r.ajoutes && (!stocke || prefixeStructure(lireRegStructure(stocke, n), reg))) ecrireJ(CLE_REGISTRE_STRUCTURE, reg);
      S.structure = { t: n, tBougie: res.tBougie, setups: res.setups, registre: reg, bilan: bilanStructure(reg, C), raison: res.raison || null }; cleStruct = cle; err('structure', null);
      const { h } = heureLocale(n, 'Europe/Paris');
      for (const e of r.nouveaux) { const s = res.setups.find(x => x.famille === e.famille && x.sens === e.sens), ok = anti.autoriser('structure:' + e.famille + e.sens, n, h, dateParis(n));
        const ev = { t: n, type: 'structure', zone: 'structure', texte: s ? s.texte : 'Setup possible (' + e.famille + ').', dit: ok.ok, raison: ok.raison }; S.evenements.unshift(ev); S.evenements.length = Math.min(S.evenements.length, 50); surEvenement(ev); }
      surMaj(S);
    } catch (e) { err('structure', e); } finally { enStruct = false; }
  }
  async function cycleLent() { if (arrete) return; if (structureAuto) suiviStructure(); const av = { ...S.etats }; await chargerReference(); calculer(); detecter(av); surMaj(S); }
  async function cycleRapide() {
    if (arrete) return;
    try { const L = await bougiesKraken(S.periode, { fetchFn, maintenant: horloge(), n: 3 }); S.k = fusionner(S.k, L); if (S.periode === 'M15') S.kM15 = S.k; err('kraken', null); } catch (e) { err('kraken', e); }
    const av = { ...S.etats }; calculer(); detecter(av); surMaj(S);
  }
  const api = {
    S,
    async demarrer() {
      await chargerPeriode(); await chargerReference(); if (S.periode === 'M15' && !S.hist) S.refP = S.refM15; calculer(); S.derniereRefM15 = (S.refM15.filter(b => b.t + 15 * 60e3 <= horloge()).pop() || {}).t ?? null; surMaj(S);
      minuteries.push(setInterval(cycleRapide, 15e3), setInterval(cycleLent, 60e3));
      if (etudeAuto) setTimeout(etude, 3000);
      if (structureAuto) setTimeout(suiviStructure, 6000);
      return S;
    },
    async periode(p) { if (!PERIODES_AFFICHEES.includes(p) || p === S.periode) return; S.periode = p; ecrireJ('rayle_or_periode', p); S.k = []; S.hist = null; await chargerPeriode(); calculer(); surMaj(S); },
    /* transactions du WebSocket Kraken (carnet) : prix en direct et bougie en cours */
    transactions(L) {
      let maj = false;
      for (const tr of L) if (tr.t > (S.tPrix || 0) && tr.p > 0) { S.prix = tr.p; S.tPrix = tr.t; appliquerTransaction(S.k, PERIODES[S.periode].ms, tr); maj = true; }
      if (maj) { const av = { ...S.etats }; calculer(); detecter(av); }
      return maj;
    },
    anti, etude, calculer, plusAncien, suiviStructure,
    /* bougies affichées : référence décalée (avant le perpétuel) + Kraken */
    serie: () => serieAffichee(S.hist, S.k, S.ecart),
    reglerAlertes(o) { anti.regler(o); if ('coupe' in o) anti.couper(o.coupe); ecrireJ('rayle_or_alertes', { ...anti.reglages() }); },
    arreter() { arrete = true; minuteries.forEach(clearInterval); minuteries = []; }
  };
  return api;
}
