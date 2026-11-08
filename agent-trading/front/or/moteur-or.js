/* ═════════════ CONTRÔLEUR DES DONNÉES DE L'OR (une seule source pour le tableau de bord, le terminal de Mars et le mode télé) ═════════════
   Charge les bougies (Kraken pour le prix, Binance pour volume / delta / niveaux), suit le prix en direct (transactions du WebSocket Kraken
   du carnet : un seul flux), calcule niveaux, zones, états, événements et lecture. fetch et horloge injectables (tests Node).
   Aucune valeur inventée : un champ inconnu reste null avec sa raison. */
import { PERIODES, REGLES } from './config-or.js';
import { bougiesKraken, bougiesBinance, ticker24hBinance, tickerKraken } from './sources-or.js';
import { fusionner, appliquerTransaction, regrouperBougies, atr, derniereValeur, ecartMesure, biaisH1 } from './bougies-or.js';
import { niveauxCles, zonesVolume, decaler, fusionnerNiveaux } from './niveaux-or.js';
import { zonesRetournement, etudeReaction } from './zones-or.js';
import { etatZone, evenementZone, creerAntiBruit } from './etats-or.js';
import { lecture, phraseEvenement } from './lecture-or.js';
import { marcheOr, retard, heureLocale, dateParis } from './temps-or.js';
import { niveauxPeriode, liquidite, fleches, bilanFleches } from './niveaux-periode.js';
import { flechesH1v2, bilanH1, DEPUIS_H1_V2, indicesCandidats, listesAvant } from './fleches-h1-v2.js';
import { CLE_REGISTRE, lireRegistre, ajouter, prefixeDe, flechesDu, VERSIONS } from './registre-fleches.js';
import { flechesH1v3 } from './fleches-h1-v3.js';
import { flechesH1v4, listesDetail } from './fleches-h1-v4.js';
import { flechesH1v5, listesDeux, selectionV5, bilans5, NOMS_5, REGLES_NIVEAUX_H1_V5 } from './fleches-h1-v5.js';
import { chargerHistorique, chargerPlusAncien, rafraichirVolume, serieAffichee } from './historique-or.js';

const lireJ = (k, d) => { try { const v = globalThis.localStorage && localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrireJ = (k, v) => { try { globalThis.localStorage && localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* plein ou refusé */ } };

export function creerMoteurOr({ fetchFn = (...a) => fetch(...a), horloge = () => Date.now(), surMaj = () => {}, surEvenement = () => {}, etudeAuto = true } = {}) {
  const S = {
    periode: lireJ('rayle_or_periode', 'M15'), k: [], kM15: [], refM15: [], refH1: [], refP: [], atrH1: [], ecart: null, ecartN: 0,
    prix: null, tPrix: null, ticker: null, ref24h: null, erreurs: {}, niveaux: [], zonesVol: [], zones: [], etats: {}, lecture: null, etude: null, etudeEtat: 'à faire',
    chargement: true, derniereRefM15: null, evenements: [], hist: null, chargementAncien: false, niveauxP: null, liquidite: null, fleches: null, bilanFleches: null, spreads: lireJ('rayle_or_spreads', []).filter(x => x && x.s > 0), registreH1: null
  };
  if (!PERIODES[S.periode]) S.periode = 'M15';
  const anti = creerAntiBruit(); const regl = lireJ('rayle_or_alertes', null); if (regl) { anti.regler(regl); if (regl.coupe) anti.couper(true); }
  let minuteries = [], arrete = false;
  const err = (k, e) => { S.erreurs[k] = e ? (e.message || String(e)) : null; };

  /* historique de la période affichée : Kraken paginé jusqu'à la mise en ligne du perpétuel, puis la référence Binance (historique-or.js) */
  async function chargerPeriode() {
    const p = S.periode;
    try {
      const H = await chargerHistorique(p, { fetchFn, maintenant: horloge() }); if (p !== S.periode) return;
      S.hist = H; S.k = H.k.slice(); S.refP = H.vol; err('kraken', null); err('binanceP', H.erreurRef);
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
  const spreadMesure = () => { const L = S.spreads.map(x => x.s).sort((a, b) => a - b); return L.length ? L[L.length >> 1] : null; };
  /* registre H1 daté en AJOUT SEUL (registre-fleches.js) : on n'écrit que si ce qui est stocké en est un préfixe exact */
  function enregistrerH1(par, vu) {
    const stocke = lireJ(CLE_REGISTRE, null); let reg = lireRegistre(stocke, vu), a = 0, r;
    for (const v of VERSIONS) if (par[v]) { r = ajouter(reg, v, par[v], { depuis: DEPUIS_H1_V2.t, vu }); reg = r.registre; a += r.ajoutes; }
    if (a && (!stocke || prefixeDe(lireRegistre(stocke, vu), reg))) ecrireJ(CLE_REGISTRE, reg);
    S.registreH1 = reg; return reg;
  }
  /* H1 : versions affichées (cases à cocher v1 / v2 / v3 ; v3 par défaut), mémorisées sur l'appareil */
  // v5 par défaut ; seules v5 et v2 sont proposées à l'affichage (v1, v3, v4 tournent en arrière-plan, registres seulement) ; nouvelle clé : un ancien choix ne masque pas v5
  const DEFAUT_H1 = ['fleches-h1-v5'], AFFICHABLES_H1 = ['fleches-h1-v2', 'fleches-h1-v5'], CLE_CHOIX_H1 = 'rayle_or_fleches_h1_choix_v5';
  let versionsH1 = (lireJ(CLE_CHOIX_H1, null) || []).filter(v => AFFICHABLES_H1.includes(v)); if (!versionsH1.length) versionsH1 = DEFAUT_H1.slice();
  function composerH1() {
    if (!S.flechesH1 || S.periode !== 'H1') return;
    const sel = VERSIONS.filter(v => versionsH1.includes(v)), liste = sel.flatMap(v => S.flechesH1[v].map(f => ({ ...f, version: v }))).sort((x, y) => x.t - y.t || (x.version < y.version ? -1 : 1));
    S.fleches = { periode: 'H1', liste, version: sel[0], versions: sel };
    const B = S.bilansH1 || {};
    S.bilanFleches = sel.length === 1 ? { ...B[sel[0]], titre: `Flèches H1 (version ${NOMS_5[sel[0]].slice(1)})` }
      : { titre: 'Flèches H1 (comparaison)', parVersion: B, texte: sel.map(v => `${NOMS_5[v]} : ${B[v] ? B[v].texte : 'calcul en cours'}`).join(' | ') };
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
    S.a = a; S.biais = biaisH1(h1c); S.marche = marcheOr(n); S.retard = retard(S.tPrix, n, S.marche.ouvert);
    const v24 = S.ref24h ? +S.ref24h.quoteVolume : null; S.fiable = v24 == null ? null : v24 >= REGLES.volumeFaible24h; S.volume24h = v24;
    analysePeriode(n);
    S.lecture = lecture({ prix: S.prix, zones: S.zones, biais: S.biais, etats: S.etats, marche: S.marche, fiable: S.fiable !== false });
    S.chargement = false;
  }
  /* supports, résistances, liquidité et flèches de LA PÉRIODE AFFICHÉE (niveaux-periode.js) : recalculés seulement quand une bougie se
     clôt (ou que le prix change de demi-ATR) ; les flèches, plus longues à calculer, juste après le rendu (sans bloquer la page) */
  let cleNiv = null, cleFl = null, minuterieFl = null, cacheListes = { cle: null, m: new Map() }; const memoFleches = new Map();
  function analysePeriode(n) {
    const serie = serieAffichee(S.hist, S.k, S.ecart); if (serie.length < 30) { S.niveauxP = null; S.liquidite = null; return; }
    const P = PERIODES[S.periode].ms; let j = serie.length - 1; while (j >= 0 && serie[j].t + P > n) j--;
    const base = `${S.periode}|${serie[0].t}|${j >= 0 ? serie[j].t : 0}|${Math.round((S.ecart || 0) * 10)}`, a = S.niveauxP && S.niveauxP.a;
    const cle = base + '|' + (a && S.prix ? Math.round(S.prix / (0.5 * a)) : 0);
    if (cle !== cleNiv) {
      cleNiv = cle;
      S.niveauxP = niveauxPeriode(serie, { periode: S.periode, maintenant: n, prix: S.prix });
      // H1 : niveaux affichés selon niveaux-h1-v5 (même calcul, sélection v5) ; les autres périodes ne changent pas
      if (S.periode === 'H1' && S.niveauxP.a) { const cs = serie.filter(b => b.t + P <= n); S.niveauxP = { ...S.niveauxP, bandes: selectionV5(S.niveauxP, S.prix ?? (cs.length ? cs[cs.length - 1].c : null)), version: REGLES_NIVEAUX_H1_V5.version }; }
      S.liquidite = liquidite(serie, { periode: S.periode, maintenant: n, prix: S.prix, a: S.niveauxP.a, pivotsL: S.niveauxP.pivots, i0: S.niveauxP.i0 });
    }
    if (base !== cleFl) {
      cleFl = base; const periode = S.periode, V = new Map((S.refP || []).map(b => [b.t, b.v]));
      clearTimeout(minuterieFl);
      const cleLancee = base;
      minuterieFl = setTimeout(async () => {
        if (arrete || periode !== S.periode) return;
        const F = fleches(serie, { periode, maintenant: n, volumes: V });
        // une flèche affichée ne disparaît jamais et ne bouge jamais : elles sont gardées par période (même si l'on charge un historique plus ancien)
        const garder = (cle, L) => { const memo = memoFleches.get(cle) || new Map(); for (const f of L) if (!memo.has(f.t)) memo.set(f.t, f); memoFleches.set(cle, memo); return [...memo.values()].sort((x, y) => x.t - y.t); };
        const liste1 = garder(periode, F);
        if (periode !== 'H1') { S.fleches = { periode, liste: liste1, version: 'fleches-v1' }; S.bilanFleches = bilanFleches(serie, liste1, { periode, maintenant: n }); surMaj(S); return; }
        // H1 : la version 2 est AFFICHÉE ; la version 1 reste calculée en arrière-plan (registre seulement, jamais affichée)
        // niveaux listés de chaque bougie candidate : précalculés par morceaux (la page reste fluide), gardés pour les bougies déjà closes
        const cc = `${serie[0].t}|${Math.round((S.ecart || 0) * 10)}`; if (cacheListes.cle !== cc) cacheListes = { cle: cc, m: new Map() };
        const { C, indices } = indicesCandidats(serie, { maintenant: n, volumes: V }), manque = indices.filter(i => !cacheListes.m.has(C[i].t));
        for (let d = 0; d < manque.length; d += 40) {
          for (const i of manque.slice(d, d + 40)) cacheListes.m.set(C[i].t, listesDeux(C, i));   // une fois par bougie : liste détaillée (v2, v3, v4 : identique, vérifié) + liste affichée v5
          await new Promise(r => setTimeout(r, 0)); if (arrete || periode !== S.periode || cleFl !== cleLancee) return;
        }
        const deux = (X, i) => cacheListes.m.get(X[i].t) || listesDeux(X, i), lst = (X, i) => deux(X, i).detail, lst5 = (X, i) => deux(X, i).v5;
        const liste2 = garder('H1|v2', flechesH1v2(serie, { maintenant: n, volumes: V, listes: lst })), liste3 = garder('H1|v3', flechesH1v3(serie, { maintenant: n, volumes: V, listes: lst })), liste4 = garder('H1|v4', flechesH1v4(serie, { maintenant: n, volumes: V, listes: lst })), liste5 = garder('H1|v5', flechesH1v5(serie, { maintenant: n, volumes: V, listes: lst5 }));
        const par = { 'fleches-v1': liste1, 'fleches-h1-v2': liste2, 'fleches-h1-v3': liste3, 'fleches-h1-v4': liste4, 'fleches-h1-v5': liste5 }, reg = enregistrerH1(par, horloge());
        S.flechesH1 = par; // bilan : registre (ajout seul) ∪ flèches recalculées (causales, donc identiques) : v1 part du commit de sa règle, avant l'ouverture du registre
        const union = v => { const m = new Map(flechesDu(reg, v).map(f => [f.t + '|' + f.sens, f])); for (const f of par[v]) if (!m.has(f.t + '|' + f.sens)) m.set(f.t + '|' + f.sens, f); return [...m.values()]; };
        S.bilansH1 = bilans5(serie, Object.fromEntries(VERSIONS.map(v => [v, union(v)])), { maintenant: n, spread: spreadMesure() });
        composerH1(); surMaj(S);
      }, 0);
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
  async function etude() {
    const cache = lireJ('rayle_or_etude', null);
    if (cache && cache.version === REGLES.version && horloge() - cache.calcule < 24 * 3600e3) { S.etude = cache.etude; S.etudeEtat = 'faite'; return; }
    S.etudeEtat = 'en cours'; surMaj(S);
    try {
      const n = horloge(), m15 = await bougiesBinance('M15', { depuis: n - 365 * 86400e3, jusqua: n, fetchFn, max: 30 });
      const h1 = regrouperBougies(m15, 3600e3), a = atr(h1, REGLES.atr);
      await new Promise(r => setTimeout(r, 0));
      S.etude = etudeReaction(m15, h1, a); S.etudeEtat = 'faite';
      ecrireJ('rayle_or_etude', { version: REGLES.version, calcule: n, etude: S.etude });
    } catch (e) { S.etudeEtat = 'échec : ' + e.message; }
    surMaj(S);
  }
  async function cycleLent() { if (arrete) return; const av = { ...S.etats }; await chargerReference(); calculer(); detecter(av); surMaj(S); }
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
      return S;
    },
    versionsH1(sel) { if (sel) { const L = VERSIONS.filter(v => sel.includes(v) && AFFICHABLES_H1.includes(v)); versionsH1 = L.length ? L : DEFAUT_H1.slice(); ecrireJ(CLE_CHOIX_H1, versionsH1); composerH1(); surMaj(S); } return versionsH1.slice(); },
    async periode(p) { if (!PERIODES[p] || p === S.periode) return; S.periode = p; ecrireJ('rayle_or_periode', p); S.k = []; S.hist = null; await chargerPeriode(); calculer(); surMaj(S); },
    /* transactions du WebSocket Kraken (carnet) : prix en direct et bougie en cours */
    transactions(L) {
      let maj = false;
      for (const tr of L) if (tr.t > (S.tPrix || 0) && tr.p > 0) { S.prix = tr.p; S.tPrix = tr.t; appliquerTransaction(S.k, PERIODES[S.periode].ms, tr); maj = true; }
      if (maj) { const av = { ...S.etats }; calculer(); detecter(av); }
      return maj;
    },
    anti, etude, calculer, plusAncien,
    /* bougies affichées : référence décalée (avant le perpétuel) + Kraken */
    serie: () => serieAffichee(S.hist, S.k, S.ecart),
    reglerAlertes(o) { anti.regler(o); if ('coupe' in o) anti.couper(o.coupe); ecrireJ('rayle_or_alertes', { ...anti.reglages() }); },
    arreter() { arrete = true; minuteries.forEach(clearInterval); minuteries = []; }
  };
  return api;
}
