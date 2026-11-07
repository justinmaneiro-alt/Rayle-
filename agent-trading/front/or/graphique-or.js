/* ═════════════ GRAPHIQUE DE L'OR (TradingView Lightweight Charts™ v5.2.1, Apache-2.0 ; logo d'attribution TradingView laissé visible) ═════════════
   Bougies : prix Kraken PF_XAUUSD, heure de Paris. Volume : référence Binance XAUUSDT (étiqueté). Exactement trois couches, cochables :
     1. zones de volume (rectangles semi-transparents) ; 2. supports / résistances (traits fins, étiquette courte au bord droit, sans chevauchement) ;
     3. zones de retournement (3 à 5, cadre fin + étiquette « tenue 4/6 »).
   Outil « Position » : entrée, stop, objectif posés au clic puis déplaçables ; ratio gain / risque affiché. Trades du journal : marques. */
import { chargerLib } from '../graphique.js';
import { espacerEtiquettes } from '../etiquettes-calcul.js';
import { tempsGraphique, tempsMonotones } from './temps-or.js';

export const COUCHES = Object.freeze({ volume: 'Zones de volume', sr: 'Supports et résistances', retournement: 'Zones de retournement' });
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage refusé */ } };
const nb = (p, d = 2) => Number(p).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ | /g, ' ');

class Primitive {
  constructor(dessiner, z = 'top') { this._d = dessiner; this._vues = [{ zOrder: () => z, renderer: () => ({ draw: c => c.useMediaCoordinateSpace(s => { try { this._d(s.context, s.mediaSize); } catch (e) { if (!this._e) { this._e = 1; console.error('graphique or :', e); } } }) }) }]; }
  attached(p) { this.chart = p.chart; this.series = p.series; this.maj = p.requestUpdate; }
  detached() { this.chart = this.series = null; }
  updateAllViews() {} paneViews() { return this._vues; }
}

/* ratio gain / risque (pur, testé) */
export function ratio(pos) {
  if (!pos || !(pos.entree > 0) || !(pos.stop > 0) || !(pos.objectif > 0)) return null;
  const risque = Math.abs(pos.entree - pos.stop), gain = Math.abs(pos.objectif - pos.entree); if (!risque) return null;
  const sens = pos.stop < pos.entree ? 'achat' : 'vente', coherent = sens === 'achat' ? pos.objectif > pos.entree : pos.objectif < pos.entree;
  return { sens, risque, gain, rr: gain / risque, coherent };
}

export function creerGraphiqueOr(el, { surClicPrix, mobile = false } = {}) {
  const etat = { bougies: [], volumes: [], zonesVol: [], niveaux: [], retournement: [], marques: [], couches: lire('rayle_or_couches', { volume: true, sr: true, retournement: true }), pos: lire('rayle_or_position', null), outil: null, prix: null };
  let LW = null, chart = null, serie = null, vol = null, pret = null;
  const C = { haut: '#5fb894', bas: '#d86a6a', volZone: '143,136,204', support: '#86c3e8', resistance: '#e2ae62', retour: '#e8e2cf', texte: '#cfd8dc', doux: '#7d8a90', fond: 'rgba(8,12,16,.86)' };
  const yDe = p => serie ? serie.priceToCoordinate(p) : null;

  const primFond = new Primitive((ctx, T) => {
    if (!serie) return;
    if (etat.couches.volume) for (const z of etat.zonesVol) {
      const y0 = yDe(z.haut), y1 = yDe(z.bas); if (y0 == null || y1 == null) continue;
      ctx.fillStyle = `rgba(${C.volZone},${(0.10 + 0.15 * (z.force || 0)).toFixed(3)})`; ctx.fillRect(0, y0, T.width, Math.max(1, y1 - y0));
    }
    if (etat.couches.retournement) for (const z of etat.retournement) {
      const y0 = yDe(z.haut), y1 = yDe(z.bas); if (y0 == null || y1 == null) continue;
      ctx.strokeStyle = 'rgba(232,226,207,.55)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.strokeRect(0.5, y0 + 0.5, T.width - 1, Math.max(1, y1 - y0)); ctx.setLineDash([]);
    }
  }, 'bottom');

  const primTexte = new Primitive((ctx, T) => {
    if (!serie) return;
    const etq = [], fs = mobile ? 10 : 11; ctx.font = `${fs}px ui-monospace, Consolas, monospace`;
    if (etat.couches.sr) for (const n of etat.niveaux) {
      const y = yDe(n.p); if (y == null || y < 0 || y > T.height) continue;
      const col = etat.prix != null && n.p > etat.prix ? C.resistance : C.support;
      ctx.strokeStyle = col; ctx.globalAlpha = 0.7; ctx.lineWidth = 1; ctx.setLineDash(n.types.includes('rond') && n.types.length === 1 ? [1, 3] : n.types.includes('seance') && !n.types.some(t => t === 'veille' || t === 'semaine') ? [5, 4] : []);
      ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(T.width - 4, Math.round(y) + 0.5); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      etq.push({ y, texte: n.court, col });
    }
    if (etat.couches.volume) for (const z of etat.zonesVol) { const y0 = yDe(z.haut), y1 = yDe(z.bas); if (y0 == null || y1 == null) continue; const y = (y0 + y1) / 2; if (y > 0 && y < T.height) etq.push({ y, texte: 'Vol.', col: `rgb(${C.volZone})` }); }
    if (etat.couches.retournement) etat.retournement.forEach((z, i) => { const y = yDe(z.p); if (y != null && y > 0 && y < T.height) etq.push({ y, texte: `Z${i + 1} ${z.tests ? z.tenues + '/' + z.tests : 'neuve'}`, col: C.retour }); });
    for (const e of espacerEtiquettes(etq, fs + 3, T.height)) {
      const w = ctx.measureText(e.texte).width + 8, x = T.width - w - 2;
      ctx.fillStyle = C.fond; ctx.fillRect(x, e.y - fs / 2 - 2, w, fs + 4); ctx.fillStyle = e.col; ctx.fillText(e.texte, x + 4, e.y + fs / 2 - 2);
    }
    // outil Position
    const r = ratio(etat.pos);
    if (etat.pos && etat.pos.entree) {
      const yE = yDe(etat.pos.entree), yS = etat.pos.stop ? yDe(etat.pos.stop) : null, yO = etat.pos.objectif ? yDe(etat.pos.objectif) : null, x0 = T.width * 0.55, x1 = T.width - 70;
      if (yE != null && yO != null) { ctx.fillStyle = 'rgba(95,184,148,.16)'; ctx.fillRect(x0, Math.min(yE, yO), x1 - x0, Math.abs(yO - yE)); }
      if (yE != null && yS != null) { ctx.fillStyle = 'rgba(216,106,106,.16)'; ctx.fillRect(x0, Math.min(yE, yS), x1 - x0, Math.abs(yS - yE)); }
      for (const [y, col, t] of [[yE, C.texte, 'Entrée'], [yS, C.bas, 'Stop'], [yO, C.haut, 'Objectif']]) if (y != null) { ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.fillStyle = col; ctx.fillText(t, x0 + 4, y - 4); }
      if (r && yE != null) { const t = `${r.sens === 'achat' ? 'Achat' : 'Vente'} · gain/risque ${nb(r.rr, 1)}${r.coherent ? '' : ' (objectif du mauvais côté)'}`; ctx.fillStyle = C.fond; const w = ctx.measureText(t).width + 10; ctx.fillRect(x0, yE + 4, w, fs + 6); ctx.fillStyle = r.coherent ? C.texte : C.bas; ctx.fillText(t, x0 + 5, yE + fs + 5); }
    }
  });

  function versSerie() {
    if (!serie) return;
    const tb = tempsMonotones(etat.bougies.map(b => b.t)), tv = tempsMonotones(etat.volumes.map(b => b.t));
    serie.setData(etat.bougies.map((b, i) => ({ time: tb[i], open: b.o, high: b.h, low: b.l, close: b.c })));
    vol.setData(etat.volumes.map((b, i) => ({ time: tv[i], value: b.v, color: b.c >= b.o ? 'rgba(95,184,148,.35)' : 'rgba(216,106,106,.35)' })));
    if (marqueurs) marqueurs.setMarkers(marquesLW());
  }
  let marqueurs = null;
  const marquesLW = () => etat.marques.filter(m => m.t).map(m => ({ time: tempsGraphique(m.t), position: m.sens === 'achat' ? 'belowBar' : 'aboveBar', color: m.r == null ? '#cfd8dc' : m.r >= 0 ? C.haut : C.bas, shape: m.sens === 'achat' ? 'arrowUp' : 'arrowDown', text: m.texte || '' })).sort((a, b) => a.time - b.time);

  async function monter() {
    LW = await chargerLib();
    chart = LW.createChart(el, {
      autoSize: true,
      layout: { attributionLogo: true, background: { type: 'solid', color: 'transparent' }, textColor: C.doux, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: mobile ? 10 : 11 },
      grid: { vertLines: { color: 'rgba(143,208,227,.05)' }, horzLines: { color: 'rgba(143,208,227,.05)' } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.06, bottom: 0.2 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 6 },
      crosshair: { mode: 0 }, localization: { locale: 'fr-FR', priceFormatter: p => nb(p) }
    });
    serie = chart.addSeries(LW.CandlestickSeries, { upColor: C.haut, downColor: C.bas, wickUpColor: C.haut, wickDownColor: C.bas, borderVisible: false, priceLineColor: '#cfd8dc', priceLineStyle: 2 });
    vol = chart.addSeries(LW.HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    serie.attachPrimitive(primFond); serie.attachPrimitive(primTexte);
    if (LW.createSeriesMarkers) marqueurs = LW.createSeriesMarkers(serie, []);
    chart.subscribeClick(p => {
      if (!p.point || !serie) return; const prix = serie.coordinateToPrice(p.point.y); if (prix == null) return;
      if (etat.outil) { poser(prix); return; }
      surClicPrix && surClicPrix(prix, p);
    });
    brancherGlisser(); versSerie(); if (etat.bougies.length) chart.timeScale().scrollToRealTime();
    return api;
  }
  /* outil Position : clic 1 = entrée, clic 2 = stop, clic 3 = objectif ; ensuite, glisser un trait le déplace */
  function poser(prix) {
    const o = etat.outil; prix = Math.round(prix * 100) / 100;
    if (o === 'entree') { etat.pos = { entree: prix, stop: null, objectif: null }; etat.outil = 'stop'; }
    else if (o === 'stop') { etat.pos.stop = prix; etat.outil = 'objectif'; }
    else if (o === 'objectif') { etat.pos.objectif = prix; etat.outil = null; }
    ecrire('rayle_or_position', etat.pos); api.surPosition && api.surPosition(etat.pos, etat.outil); redessiner();
  }
  function brancherGlisser() {
    let prise = null;
    el.addEventListener('pointerdown', e => {
      if (!etat.pos || etat.outil || !serie) return; const r = el.getBoundingClientRect(), y = e.clientY - r.top;
      for (const k of ['entree', 'stop', 'objectif']) { const yk = etat.pos[k] ? yDe(etat.pos[k]) : null; if (yk != null && Math.abs(yk - y) < (e.pointerType === 'touch' ? 14 : 6) && e.clientX - r.left > r.width * 0.55) { prise = k; e.preventDefault(); e.stopPropagation(); chart.applyOptions({ handleScroll: false, handleScale: false }); el.setPointerCapture && el.setPointerCapture(e.pointerId); return; } }
    }, true);
    el.addEventListener('pointermove', e => { if (!prise) return; const r = el.getBoundingClientRect(), p = serie.coordinateToPrice(e.clientY - r.top); if (p != null) { etat.pos[prise] = Math.round(p * 100) / 100; redessiner(); } }, true);
    const fin = () => { if (!prise) return; prise = null; chart.applyOptions({ handleScroll: true, handleScale: true }); ecrire('rayle_or_position', etat.pos); api.surPosition && api.surPosition(etat.pos, null); };
    el.addEventListener('pointerup', fin, true); el.addEventListener('pointercancel', fin, true);
  }
  const redessiner = () => { primTexte.maj && primTexte.maj(); primFond.maj && primFond.maj(); };

  const api = {
    pret: () => pret,
    bougies(L, volumes) { const premier = !etat.bougies.length; etat.bougies = L; if (volumes) etat.volumes = volumes; try { versSerie(); } catch (e) { console.warn('bougies :', e.message); } if (premier && chart && L.length) chart.timeScale().scrollToRealTime(); },
    majDerniere(b) {
      if (!serie || !b) return; const der = etat.bougies[etat.bougies.length - 1];
      if (der && b.t < der.t) return;
      if (!der) return;
      try { serie.update({ time: tempsGraphique(b.t), open: b.o, high: b.h, low: b.l, close: b.c }); } catch (e) { console.warn('bougie en cours :', e.message); }
    },
    couches(c) { if (c) { etat.couches = { ...etat.couches, ...c }; ecrire('rayle_or_couches', etat.couches); redessiner(); } return { ...etat.couches }; },
    dessin({ zonesVol, niveaux, retournement, prix }) { if (zonesVol) etat.zonesVol = zonesVol; if (niveaux) etat.niveaux = niveaux; if (retournement) etat.retournement = retournement; if (prix != null) etat.prix = prix; redessiner(); },
    marques(L) { etat.marques = L || []; if (marqueurs) marqueurs.setMarkers(marquesLW()); },
    outil(v) { etat.outil = v; if (v === 'entree') etat.pos = null; redessiner(); return etat.outil; },
    position: () => etat.pos, effacerPosition() { etat.pos = null; etat.outil = null; ecrire('rayle_or_position', null); redessiner(); },
    allerA(t) { if (!chart) return; const ts = chart.timeScale(), s = tempsGraphique(t); ts.setVisibleRange({ from: s - 60 * 3600, to: s + 30 * 3600 }); },
    yDe, chart: () => chart, serie: () => serie, etat: () => etat,
    detruire() { try { chart && chart.remove(); } catch (e) { /* */ } }
  };
  pret = monter();
  return api;
}
