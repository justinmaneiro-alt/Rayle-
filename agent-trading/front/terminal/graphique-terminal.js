/* ═════════════ TERMINAL : GRAPHIQUE (TradingView Lightweight Charts™ v5, Apache-2.0 ; logo d'attribution laissé visible) ═════════════
   Vierge par défaut : bougies, échelle de prix, volume discret. Tout le reste est une COUCHE ajoutée par l'utilisateur (SMA, niveaux…)
   ou un objet dessiné (dessin-terminal.js). Heure de Paris.
   L'historique complet reste en mémoire ; le graphique n'en affiche qu'une fenêtre (FENETRE bougies), élargie de PAS_FENETRE quand on fait
   défiler vers la gauche : un setData de 400 000 bougies figerait la page, un de 20 000 prend quelques dizaines de millisecondes. */
import { chargerLib } from '../graphique.js';
import { tempsCroissants, depuisTempsParis } from './indicateurs.js';
import { UNITES, fmt } from './actifs-terminal.js';

export const FENETRE = 6000, PAS_FENETRE = 6000;
export const COULEURS = Object.freeze({ fond: '#05080c', texte: '#9fb3bf', grille: 'rgba(143,208,227,.05)', haut: '#4fb892', bas: '#d9605a', cyan: '#8fd0e3', sable: '#c9b27a', violet: '#b79be0', rouge: '#ef5f5f', vert: '#4fd18b', doux: 'rgba(159,179,191,.55)' });

export class Primitive {
  constructor(dessiner, z = 'top') { this._d = dessiner; this._vues = [{ zOrder: () => z, renderer: () => ({ draw: c => c.useMediaCoordinateSpace(s => { try { this._d(s.context, s.mediaSize); } catch (e) { if (!this._e) { this._e = 1; console.error('graphique terminal :', e); } } }) }) }]; }
  attached(p) { this.maj = p.requestUpdate; } detached() { this.maj = null; }
  updateAllViews() {} paneViews() { return this._vues; }
}

/* indice logique (fractionnaire) d'un instant dans une liste de bougies triées ; extrapolé au-delà des bords (pur, testé) */
export function indiceDe(B, t, ms) {
  const n = B.length; if (!n) return null;
  if (t <= B[0].t) return (t - B[0].t) / ms;
  if (t >= B[n - 1].t) return n - 1 + (t - B[n - 1].t) / ms;
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (B[m].t <= t) lo = m; else hi = m; }
  return lo + (t - B[lo].t) / Math.max(1, B[hi].t - B[lo].t);
}
export function tempsDe(B, i, ms) {
  const n = B.length; if (!n || i == null) return null;
  if (i <= 0) return B[0].t + i * ms; if (i >= n - 1) return B[n - 1].t + (i - (n - 1)) * ms;
  const k = Math.floor(i), f = i - k; return B[k].t + f * (B[k + 1].t - B[k].t);
}

export function creerGraphique(el, { mobile = false } = {}) {
  const E = { tout: [], vue: [], d0: 0, actif: 'OR', unite: 'M15', ms: UNITES.M15.ms, debutKraken: null, info: null, ma: {}, prims: [], pret: null, surVue: [], surClic: [], surDeplace: [], surBas: [], surHaut: [] };
  let LW = null, chart = null, serie = null, vol = null, ro = null, elargir = false;
  const maSeries = {};
  E.pret = chargerLib().then(L => {
    LW = L;
    chart = L.createChart(el, {
      autoSize: true, layout: { background: { type: 'solid', color: COULEURS.fond }, textColor: COULEURS.texte, fontSize: mobile ? 11 : 12, fontFamily: "'Segoe UI', system-ui, sans-serif", attributionLogo: true },
      grid: { vertLines: { color: COULEURS.grille }, horzLines: { color: COULEURS.grille } },
      rightPriceScale: { borderColor: 'rgba(143,208,227,.14)', scaleMargins: { top: 0.08, bottom: 0.14 } },
      timeScale: { borderColor: 'rgba(143,208,227,.14)', timeVisible: true, secondsVisible: false, rightOffset: 8, barSpacing: 7, shiftVisibleRangeOnNewBar: true },
      crosshair: { mode: 0, vertLine: { color: 'rgba(143,208,227,.35)', labelBackgroundColor: '#14303c' }, horzLine: { color: 'rgba(143,208,227,.35)', labelBackgroundColor: '#14303c' } },
      localization: { locale: 'fr-FR', priceFormatter: p => fmt(E.actif, p) }
    });
    serie = chart.addSeries(L.CandlestickSeries, { upColor: COULEURS.haut, downColor: COULEURS.bas, borderVisible: false, wickUpColor: COULEURS.haut, wickDownColor: COULEURS.bas, priceLineColor: 'rgba(143,208,227,.5)', priceLineStyle: 2 });
    vol = chart.addSeries(L.HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.88, bottom: 0 }, visible: false });
    vol.applyOptions({ visible: E.volVisible !== false });
    for (const p of E.prims) serie.attachPrimitive(p);
    chart.timeScale().subscribeVisibleLogicalRangeChange(r => {
      if (r && r.from < 60 && E.d0 > 0 && !elargir) { elargir = true; requestAnimationFrame(() => { etendre(); elargir = false; }); }
      for (const f of E.surVue) f(r);
    });
    chart.subscribeClick(p => { const x = coordDepuis(p); for (const f of E.surClic) f(x, p); });
    chart.subscribeCrosshairMove(p => { const x = coordDepuis(p); for (const f of E.surDeplace) f(x, p); });
    return api;
  });
  function coordDepuis(p) {
    if (!p || !p.point || !serie) return null;
    const prix = serie.coordinateToPrice(p.point.y), li = chart.timeScale().coordinateToLogical(p.point.x);
    return { x: p.point.x, y: p.point.y, prix, t: li == null ? null : tempsDe(E.vue, li, E.ms) };
  }
  const versLW = (B, S) => B.map((b, i) => ({ time: S[i], open: b.o, high: b.h, low: b.l, close: b.c }));
  const volLW = (B, S) => B.map((b, i) => ({ time: S[i], value: b.bande ? 0 : b.v, color: b.c >= b.o ? 'rgba(79,184,146,.22)' : 'rgba(217,96,90,.22)' }));
  let S = [];
  function poser(garderVue = false) {
    if (!serie) return;
    const ts = chart.timeScale(), r = garderVue ? ts.getVisibleLogicalRange() : null, avant = E.vue.length;
    E.vue = E.tout.slice(E.d0); S = tempsCroissants(E.vue);
    serie.setData(versLW(E.vue, S)); vol.setData(volLW(E.vue, S));
    for (const id of Object.keys(maSeries)) poserMA(id);
    if (r) { const d = E.vue.length - avant; ts.setVisibleLogicalRange({ from: r.from + d, to: r.to + d }); }
    for (const p of E.prims) p.maj && p.maj();
  }
  function etendre() { if (E.d0 <= 0) return; E.d0 = Math.max(0, E.d0 - PAS_FENETRE); poser(true); }
  function poserMA(id) {
    const m = E.ma[id], s = maSeries[id]; if (!m || !s) return;
    const L = []; for (let i = 0; i < E.vue.length; i++) { const v = m.valeurs[E.d0 + i]; if (v != null) L.push({ time: S[i], value: v }); }
    s.setData(L);
  }

  const api = {
    pret: () => E.pret.then(a => { if (!chart) throw new Error('graphique fermé'); return a; }),
    /* nouvelles bougies (série complète) ; nouvelle=true : changement d'actif ou d'unité (vue remise à droite) */
    afficher(B, { actif, unite, info = null, nouvelle = false } = {}) {
      if (actif) E.actif = actif; if (unite) { E.unite = unite; E.ms = UNITES[unite].ms; }
      const ancienTotal = E.tout.length, ancienD0 = E.d0; E.tout = B; E.info = info;
      E.debutKraken = info && info.debutKraken;
      if (nouvelle || !ancienTotal) E.d0 = Math.max(0, B.length - FENETRE);
      else { const i0 = B.length && E.vue.length ? indexDe(B, E.vue[0].t) : 0; E.d0 = Math.max(0, Math.min(i0, B.length - FENETRE)); }
      if (!serie) return;
      if (chart) chart.applyOptions({ localization: { locale: 'fr-FR', priceFormatter: p => fmt(E.actif, p) } });
      poser(!nouvelle && ancienTotal > 0);
      if (nouvelle) { chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, E.vue.length - 160), to: E.vue.length + 8 }); }
    },
    /* mise à jour légère de la dernière bougie (prix en direct) */
    majDerniere() {
      if (!serie || !E.vue.length) return; const b = E.tout[E.tout.length - 1];
      if (E.vue[E.vue.length - 1] !== b) { if (b.t > E.vue[E.vue.length - 1].t) { poser(true); return; } }
      const s = S[S.length - 1]; serie.update({ time: s, open: b.o, high: b.h, low: b.l, close: b.c }); vol.update({ time: s, value: b.v, color: b.c >= b.o ? 'rgba(79,184,146,.22)' : 'rgba(217,96,90,.22)' });
    },
    /* lignes de moyenne : valeurs alignées sur la série complète */
    ligne(id, valeurs, { couleur = COULEURS.sable, titre = '', epaisseur = 1, style = 0 } = {}) {
      if (!valeurs) { if (maSeries[id] && chart) chart.removeSeries(maSeries[id]); delete maSeries[id]; delete E.ma[id]; return; }
      E.ma[id] = { valeurs };
      if (!chart) return;
      if (!maSeries[id]) maSeries[id] = chart.addSeries(LW.LineSeries, { color: couleur, lineWidth: epaisseur, lineStyle: style, title: titre, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false });
      poserMA(id);
    },
    ajouterPrimitive(dessiner, z) { const p = new Primitive(dessiner, z); E.prims.push(p); if (serie) serie.attachPrimitive(p); return p; },
    redessiner() { for (const p of E.prims) p.maj && p.maj(); },
    yDe: p => serie ? serie.priceToCoordinate(p) : null,
    prixDe: y => serie ? serie.coordinateToPrice(y) : null,
    xDe(t) {
      if (!chart || !E.vue.length) return null; const ts = chart.timeScale(), n = E.vue.length, li = indiceDe(E.vue, t, E.ms);
      // au-delà des bougies (instant présent dans la bougie en cours, futur) : extrapolé avec l'espacement des bougies (Lightweight Charts renvoie 0)
      const bord = li > n - 1 ? n - 1 : li < 0 ? 0 : null; if (bord == null) return ts.logicalToCoordinate(li);
      const x0 = ts.logicalToCoordinate(bord), x1 = ts.logicalToCoordinate(bord === 0 ? Math.min(1, n - 1) : bord - 1), pas = n > 1 ? Math.abs(x0 - x1) : (ts.options().barSpacing || 6);
      return x0 == null ? null : x0 + (li - bord) * pas;
    },
    tDe(x) { if (!chart) return null; const li = chart.timeScale().coordinateToLogical(x); return li == null ? null : tempsDe(E.vue, li, E.ms); },
    largeur: () => el.clientWidth, hauteur: () => el.clientHeight,
    bougies: () => E.tout, visibles() { if (!chart) return []; const r = chart.timeScale().getVisibleLogicalRange(); if (!r) return []; return E.vue.slice(Math.max(0, Math.floor(r.from)), Math.ceil(r.to) + 1); },
    etat: () => ({ actif: E.actif, unite: E.unite, n: E.tout.length, affichees: E.vue.length, info: E.info }),
    /* zoom sur un intervalle de temps (et de prix, facultatif) */
    zoomer(t0, t1, p0, p1) {
      if (!chart || !E.vue.length) return false;
      while (E.d0 > 0 && t0 < E.vue[0].t) etendre();
      const a = indiceDe(E.vue, t0, E.ms), b = indiceDe(E.vue, t1, E.ms), m = Math.max(4, (b - a) * 0.08);
      chart.timeScale().setVisibleLogicalRange({ from: a - m, to: b + m });
      if (p0 != null && p1 != null && p1 > p0) { const d = (p1 - p0) * 0.15; serie.priceScale().applyOptions({ autoScale: false }); serie.priceScale().setVisibleRange && serie.priceScale().setVisibleRange({ from: p0 - d, to: p1 + d }); }
      return true;
    },
    volumeVisible(v) { E.volVisible = !!v; if (vol) vol.applyOptions({ visible: !!v }); },
    autoEchelle() { if (serie) serie.priceScale().applyOptions({ autoScale: true }); },
    recadrer() { if (!chart) return; api.autoEchelle(); chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, E.vue.length - 160), to: E.vue.length + 8 }); },
    marqueurs: null,
    surVue: f => E.surVue.push(f), surClic: f => E.surClic.push(f), surDeplace: f => E.surDeplace.push(f),
    element: el, lib: () => LW, chart: () => chart, serie: () => serie, ms: () => E.ms, unite: () => E.unite, actif: () => E.actif,
    detruire() { try { ro && ro.disconnect(); chart && chart.remove(); } catch (e) { /* */ } chart = serie = vol = null; for (const k of Object.keys(maSeries)) delete maSeries[k]; E.prims.length = 0; }
  };
  function indexDe(B, t) { let lo = 0, hi = B.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (B[m].t < t) lo = m + 1; else hi = m; } return lo; }
  return api;
}
export { depuisTempsParis };
