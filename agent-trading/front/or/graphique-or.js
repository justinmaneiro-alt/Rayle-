/* ═════════════ GRAPHIQUE DE L'OR (TradingView Lightweight Charts™ v5.2.1, Apache-2.0 ; logo d'attribution TradingView laissé visible) ═════════════
   Bougies : prix Kraken PF_XAUUSD, heure de Paris. Volume : référence Binance XAUUSDT (étiqueté). Exactement trois couches, cochables :
     1. zones de volume (rectangles semi-transparents) ; 2. supports / résistances (traits fins, étiquette courte au bord droit, sans chevauchement) ;
     3. zones de retournement (3 à 5, cadre fin + étiquette « tenue 4/6 »).
   Outil « Position » : entrée, stop, objectif posés au clic puis déplaçables ; ratio gain / risque affiché. Trades du journal : marques. */
import { chargerLib } from '../graphique.js';
import { espacerEtiquettes } from '../etiquettes-calcul.js';
import { tempsGraphique, tempsMonotones } from './temps-or.js';

export const COUCHES = Object.freeze({ sr: 'Supports et résistances', liquidite: 'Zones de liquidité', fleches: 'Flèches de rebond', volume: 'Zones de volume' });
const COUCHES_DEFAUT = Object.freeze({ sr: true, liquidite: true, fleches: true, volume: false });
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
  const etat = { bougies: [], volumes: [], cle: null, debutKraken: null, ecart: null, chargementAncien: false, zonesVol: [], niveaux: [], retournement: [], bandes: [], liquidite: [], balayages: [], fleches: [], a: null, cadres: [], marques: [], tSerie: new Map(), barres: new Map(), couches: { ...COUCHES_DEFAUT, ...lire('rayle_or_couches_v2', {}) }, pos: lire('rayle_or_position', null), outil: null, prix: null };
  let LW = null, chart = null, serie = null, vol = null, pret = null;
  const C = { liquidite: '#c39be0', flecheHaut: '#4fd18b', flecheBas: '#ef5f5f', refHaut: 'rgba(160,170,150,.55)', refBas: 'rgba(170,140,140,.55)', bande: 'rgba(201,178,122,.07)', sable: '#c9b27a', haut: '#5fb894', bas: '#d86a6a', volZone: '143,136,204', support: '#86c3e8', resistance: '#e2ae62', retour: '#e8e2cf', texte: '#cfd8dc', doux: '#7d8a90', fond: 'rgba(8,12,16,.86)' };
  const yDe = p => serie ? serie.priceToCoordinate(p) : null;

  /* bande « historique de référence » : tout ce qui est avant la première bougie Kraken (Binance décalé de l'écart mesuré) */
  function xDebutKraken(T) {
    if (!chart || etat.debutKraken == null || !etat.bougies.length || !etat.bougies[0].ref) return null;
    const ts = chart.timeScale(), x = ts.timeToCoordinate(tempsGraphique(etat.debutKraken)); if (x != null) return x;
    const r = ts.getVisibleRange(); if (!r) return null;
    return tempsGraphique(etat.debutKraken) <= r.from ? -1 : T.width;   // perpétuel à gauche de la vue : pas de bande ; à droite : toute la largeur
  }
  const primBande = new Primitive((ctx, T) => {
    const x = xDebutKraken(T); if (x == null || x <= 0) return;
    const fs = mobile ? 10 : 11; ctx.fillStyle = C.bande; ctx.fillRect(0, 0, x, T.height);
    ctx.strokeStyle = 'rgba(201,178,122,.55)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, T.height); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = `600 ${fs}px system-ui, sans-serif`; ctx.fillStyle = C.sable;
    const e = etat.ecart == null ? 'non mesuré' : `${etat.ecart >= 0 ? '+' : '−'}${nb(Math.abs(etat.ecart))} $`;
    const L = [['Historique de référence', `Binance XAUUSDT décalé de ${e}`], ['Kraken PF_XAUUSD →', 'mise en ligne du perpétuel']];
    const d = fs + 10;   // la première ligne reste aux repères des niveaux hors champ (▲)
    const w0 = Math.max(...L[0].map(t => ctx.measureText(t).width)) + 12;
    if (x > w0 + 6) { ctx.fillStyle = 'rgba(8,12,16,.86)'; ctx.fillRect(6, 6 + d, w0, fs * 2 + 12); ctx.fillStyle = C.sable; ctx.fillText(L[0][0], 12, 8 + fs + d); ctx.font = `${fs}px system-ui, sans-serif`; ctx.fillText(L[0][1], 12, 12 + fs * 2 + d); }
    ctx.font = `${fs}px system-ui, sans-serif`; const w1 = Math.max(...L[1].map(t => ctx.measureText(t).width)) + 12;
    if (x + w1 + 6 < T.width * (mobile ? 0.34 : 0.55)) {   // jamais dans la colonne des étiquettes de niveaux (à droite)
      ctx.fillStyle = 'rgba(8,12,16,.86)'; ctx.fillRect(x + 6, 6 + d, w1, fs * 2 + 12); ctx.fillStyle = C.sable; ctx.fillText(L[1][0], x + 12, 8 + fs + d); ctx.fillText(L[1][1], x + 12, 12 + fs * 2 + d); }
  }, 'bottom');
  const primFond = new Primitive((ctx, T) => {
    if (!serie) return;
    if (etat.couches.volume) for (const z of etat.zonesVol) {
      const y0 = yDe(z.haut), y1 = yDe(z.bas); if (y0 == null || y1 == null) continue;
      ctx.fillStyle = `rgba(${C.volZone},${(0.10 + 0.15 * (z.force || 0)).toFixed(3)})`; ctx.fillRect(0, y0, T.width, Math.max(1, y1 - y0));
    }
  }, 'bottom');

  const primTexte = new Primitive((ctx, T) => {
    if (!serie) return;
    const fs = mobile ? 10 : 11; ctx.font = `${fs}px system-ui, 'Segoe UI', sans-serif`;
    /* supports et résistances de LA PÉRIODE (au plus 4 au-dessus, 4 au-dessous) : les plus forts bien visibles, les autres discrets ;
       liquidité en pointillés ; étiquettes courtes alignées à droite, SANS trait de rappel : une étiquette qui chevaucherait est omise (détail au survol) */
    const etq = [], hors = { haut: null, bas: null }, xDe = t => { const x = chart.timeScale().timeToCoordinate(etat.tSerie.get(t) ?? tempsGraphique(t)); return x == null ? 0 : Math.max(0, x); };
    if (etat.couches.sr !== false) for (const b of etat.bandes) {
      const col = b.cote === 'resistance' ? C.resistance : C.support, y0 = yDe(b.haut), y1 = yDe(b.bas); if (y0 == null || y1 == null) continue;
      if (y1 < 0 || y0 > T.height) { const k = y1 < 0 ? 'haut' : 'bas'; if (!hors[k] || Math.abs(b.p - (etat.prix ?? b.p)) < Math.abs(hors[k].p - (etat.prix ?? b.p))) hors[k] = b; continue; }
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = b.fort ? 1.5 : 1; ctx.setLineDash(b.fort ? [] : [4, 4]);
      if (y1 - y0 >= 3) { ctx.globalAlpha = b.fort ? 0.13 : 0.05; ctx.fillRect(0, y0, T.width, y1 - y0); }
      ctx.globalAlpha = b.fort ? 0.85 : 0.35; ctx.beginPath();
      for (const y of y1 - y0 >= 3 ? [y0, y1] : [(y0 + y1) / 2]) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(T.width, Math.round(y) + 0.5); }
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      etq.push({ y: (y0 + y1) / 2, texte: b.texte, col, prio: b.fort ? 3 : 1, gras: b.fort, g: { texte: b.texte, detail: b.detail, p: b.p } });
    }
    if (etat.couches.liquidite !== false) for (const z of etat.liquidite) {
      const y = yDe(z.p); if (y == null || y < 0 || y > T.height) continue;
      ctx.strokeStyle = C.liquidite; ctx.globalAlpha = 0.85; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(xDe(z.depuis), Math.round(y) + 0.5); ctx.lineTo(T.width, Math.round(y) + 0.5); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      etq.push({ y, texte: z.texte, col: C.liquidite, prio: 2, g: { texte: z.texte, detail: [`zone de liquidité ${z.sorte} non balayée : ${z.raisons.join(', ')}`, 'disparaît dès qu’une bougie la dépasse (une marque reste à cet endroit)'], p: z.p } });
    }
    for (const [k, b] of Object.entries(hors)) if (b) { const t = `${k === 'haut' ? '▲' : '▼'} ${b.texte}${etat.prix != null ? ` · ${b.p >= etat.prix ? '+' : '−'}${nb(Math.abs(b.p - etat.prix), 0)} $` : ''}`; etq.push({ y: k === 'haut' ? fs : T.height - fs, texte: t, col: C.doux, prio: 2.5, g: { texte: t, detail: b.detail, p: b.p, bord: k } }); }
    etat.cadres = [];
    const wMax = Math.max(120, T.width * (mobile ? 0.66 : 0.45)), h = fs + 6, places = [];
    for (const e of etq.sort((x, y) => y.prio - x.prio)) {
      const y = Math.max(h / 2 + 1, Math.min(T.height - h / 2 - 1, e.y));
      if (places.some(q => Math.abs(q - y) < h + 2)) continue;   // chevauchement : étiquette omise (jamais d'éventail)
      places.push(y); ctx.font = `${e.gras ? '600 ' : ''}${fs}px system-ui, 'Segoe UI', sans-serif`;
      let t = e.texte; while (ctx.measureText(t).width > wMax - 10 && t.length > 8) t = t.slice(0, -2);
      if (t !== e.texte) t = t.replace(/\s*\S?$/, '') + '…';
      const w = ctx.measureText(t).width + 10, x = T.width - w - 2, y0 = y - h / 2;
      ctx.fillStyle = C.fond; ctx.fillRect(x, y0, w + 2, h); ctx.fillStyle = e.col; ctx.globalAlpha = e.prio === 1 ? 0.75 : 1; ctx.fillText(t, x + 5, y + fs / 2 - 1); ctx.globalAlpha = 1;
      etat.cadres.push({ x, y: y0, w, h, g: e.g });
    }
    ctx.font = `${fs}px system-ui, 'Segoe UI', sans-serif`;
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

  const pointBougie = (b, t) => b.ref ? { time: t, open: b.o, high: b.h, low: b.l, close: b.c, color: b.c >= b.o ? C.refHaut : C.refBas, wickColor: b.c >= b.o ? C.refHaut : C.refBas } : { time: t, open: b.o, high: b.h, low: b.l, close: b.c };
  const pointVolume = (b, t) => ({ time: t, value: b.v, color: b.c >= b.o ? 'rgba(95,184,148,.35)' : 'rgba(216,106,106,.35)' });
  let sig = null;   // signature des données déjà envoyées : seule la dernière bougie change → update (pas de setData de 20 000 bougies)
  function versSerie() {
    if (!serie) return;
    const B = etat.bougies, V = etat.volumes, s = { n: B.length, t0: B.length ? B[0].t : null, nv: V.length, v0: V.length ? V[0].t : null, ref: B.length ? B.filter(b => b.ref).length : 0, e: etat.ecart };
    if (sig && s.t0 === sig.t0 && s.v0 === sig.v0 && s.ref === sig.ref && s.e === sig.e && s.n >= sig.n && s.n - sig.n <= 1 && s.nv >= sig.nv && s.nv - sig.nv <= 1 && B.length) {
      const tb = tempsMonotones(B.slice(-3).map(b => b.t)); for (let i = Math.max(0, B.length - 2), j = tb.length - (B.length - Math.max(0, B.length - 2)); i < B.length; i++, j++) { serie.update(pointBougie(B[i], tb[j])); etat.tSerie.set(B[i].t, tb[j]); etat.barres.set(tb[j], B[i]); }
      if (V.length) { const tv = tempsMonotones(V.slice(-3).map(b => b.t)); for (let i = Math.max(0, V.length - 2), j = tv.length - (V.length - Math.max(0, V.length - 2)); i < V.length; i++, j++) vol.update(pointVolume(V[i], tv[j])); }
    } else {
      const tb = tempsMonotones(B.map(b => b.t)), tv = tempsMonotones(V.map(b => b.t));
      serie.setData(B.map((b, i) => pointBougie(b, tb[i]))); vol.setData(V.map((b, i) => pointVolume(b, tv[i])));
      etat.tSerie = new Map(B.map((b, i) => [b.t, tb[i]])); etat.barres = new Map(B.map((b, i) => [tb[i], b]));
    }
    sig = s;
    if (marqueurs) marqueurs.setMarkers(marquesLW());
  }
  /* vue par défaut : les 150 dernières bougies, calées à droite, petite marge */
  const VUE_DEFAUT = 150, MARGE_DROITE = 5;
  function vueDefaut() { if (!chart || !etat.bougies.length) return; const n = etat.bougies.length; chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - VUE_DEFAUT), to: n - 1 + MARGE_DROITE }); }
  let marqueurs = null;
  /* marques du graphique (dessinées par Lightweight Charts, à la bougie près) : flèches de rebond, zones de liquidité balayées, trades du journal */
  const tDe = t => etat.tSerie.get(t) ?? tempsGraphique(t);
  const court = v => ({ 'fleches-v1': 'v1', 'fleches-h1-v2': 'v2', 'fleches-h1-v3': 'v3', 'fleches-h1-v4': 'v4', 'fleches-h1-v5': 'v5', 'fleches-h1-v6': 'v6' }[v] || 'v1');
  const plusieursVersions = () => new Set(etat.fleches.map(f => f.version || 'fleches-v1')).size > 1;
  const marquesLW = () => [
    ...(etat.couches.fleches !== false ? etat.fleches.map(f => ({ id: 'f' + f.t + (plusieursVersions() ? '-' + court(f.version) : ''), time: tDe(f.t), position: f.sens === 'baisse' ? 'aboveBar' : 'belowBar', color: f.sens === 'baisse' ? C.flecheBas : C.flecheHaut, shape: f.sens === 'baisse' ? 'arrowDown' : 'arrowUp', size: 0.6, ...(plusieursVersions() ? { text: court(f.version) } : {}) })) : []),
    ...(etat.couches.liquidite !== false ? etat.balayages.map(b => ({ id: 'b' + b.t + b.sorte, time: tDe(b.t), position: b.sorte === 'haute' ? 'aboveBar' : 'belowBar', color: 'rgba(195,155,224,.75)', shape: 'circle', size: 0.35 })) : []),
    ...marquesJournal()].filter(m => m.time != null).sort((a, b) => a.time - b.time);
  const marquesJournal = () => etat.marques.filter(m => m.t).map(m => ({ time: tDe(m.t), position: m.sens === 'achat' ? 'belowBar' : 'aboveBar', color: m.r == null ? '#cfd8dc' : m.r >= 0 ? C.haut : C.bas, shape: m.sens === 'achat' ? 'arrowUp' : 'arrowDown', text: m.texte || '' })).sort((a, b) => a.time - b.time);

  async function monter() {
    LW = await chargerLib();
    chart = LW.createChart(el, {
      autoSize: true,
      layout: { attributionLogo: true, background: { type: 'solid', color: 'transparent' }, textColor: C.doux, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: mobile ? 10 : 11 },
      grid: { vertLines: { color: 'rgba(143,208,227,.05)' }, horzLines: { color: 'rgba(143,208,227,.05)' } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },   // l'échelle se cale sur les bougies VISIBLES (+ marge) : ni les niveaux ni le volume ne la tirent
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: MARGE_DROITE },
      crosshair: { mode: 0 }, localization: { locale: 'fr-FR', priceFormatter: p => nb(p) }
    });
    serie = chart.addSeries(LW.CandlestickSeries, { upColor: C.haut, downColor: C.bas, wickUpColor: C.haut, wickDownColor: C.bas, borderVisible: false, priceLineColor: '#cfd8dc', priceLineStyle: 2 });
    // volume : son propre panneau sous le graphique, avec sa propre échelle
    vol = chart.addSeries(LW.HistogramSeries, { priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false }, 1);
    try { const P = chart.panes(); P[0].setStretchFactor(mobile ? 4 : 5); P[1].setStretchFactor(1); } catch (e) { /* ancienne version : panneau par défaut */ }
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.12, bottom: 0 }, borderVisible: false });
    serie.attachPrimitive(primBande); serie.attachPrimitive(primFond); serie.attachPrimitive(primTexte);
    if (LW.createSeriesMarkers) marqueurs = LW.createSeriesMarkers(serie, []);
    chart.subscribeClick(p => {
      if (!p.point || !serie) return; const prix = serie.coordinateToPrice(p.point.y); if (prix == null) return;
      if (etat.outil) { poser(prix); return; }
      surClicPrix && surClicPrix(prix, p);
    });
    // glisser vers la gauche : arrivée près du bord des données → un morceau plus ancien (Kraken, puis la référence)
    chart.timeScale().subscribeVisibleLogicalRangeChange(r => { if (r && r.from < 40 && etat.bougies.length && api.surBordGauche) api.surBordGauche(); redessiner(); });
    brancherGlisser(); brancherInfo(); versSerie(); vueDefaut();
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
  /* détail d'une étiquette au survol (souris) ou au clic / toucher (épinglé jusqu'au clic suivant) */
  function brancherInfo() {
    const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const tip = document.createElement('div'); tip.className = 'tor-info'; tip.hidden = true; tip.setAttribute('role', 'tooltip');
    tip.style.cssText = 'position:absolute;right:8px;z-index:4;max-width:min(360px,80%);padding:7px 10px;background:#0b1117;border:1px solid rgba(143,208,227,.4);border-radius:5px;color:#d7e3ea;font:12.5px/1.4 system-ui,sans-serif;pointer-events:none;box-shadow:0 6px 20px rgba(0,0,0,.5)';
    el.appendChild(tip);
    let epingle = null;
    const trouver = (x, y) => { const c = etat.cadres.find(c => x >= c.x - 2 && x <= c.x + c.w + 2 && y >= c.y - 2 && y <= c.y + c.h + 2); return c ? c.g : marqueSous(x, y); };
    /* flèche ou marque de balayage sous le pointeur (au-dessus de la mèche haute, ou sous la mèche basse, de la bougie) */
    const NOMS = { 'résistance': 'sous une résistance', support: 'sur un support', 'liquidité haute': 'sous une zone de liquidité haute', 'liquidité basse': 'sur une zone de liquidité basse' };
    function marqueSous(x, y) {
      if (!chart) return null; const t = chart.timeScale().coordinateToTime(x), b = t != null ? etat.barres.get(t) : null; if (!b) return null;
      const yH = yDe(b.h), yL = yDe(b.l), dessus = yH != null && y <= yH + 3 && y >= yH - 30, dessous = yL != null && y >= yL - 3 && y <= yL + 30;
      const f = etat.couches.fleches !== false && etat.fleches.find(q => q.t === b.t && (q.sens === 'baisse' ? dessus : dessous));
      if (f) return { p: f.niveau, texte: `Rebond ${NOMS[f.type] || 'sur un niveau'} · flèche ${f.sens === 'baisse' ? 'rouge' : 'verte'}`, detail: [f.touches != null ? `niveau ${nb(f.niveau)} · ${f.touches} touche${f.touches >= 2 ? 's' : ''}` : `niveau ${nb(f.niveau)} · régime H1 ${f.regime || '—'}`, ...(f.version && f.version !== 'fleches-v1' || plusieursVersions() ? [`version ${f.version || 'fleches-v1'}`] : []), ...(f.raisons ? [`liquidité : ${f.raisons.join(', ')}`] : []), ...(f.retourne ? [`niveau retourné (${f.retourne})`] : []), ...(f.mode === 'rebond confirmé' ? [`rebond confirmé contre le régime : touche du niveau à ${new Date(f.tTouche).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })}, confirmée à la clôture de cette bougie`] : []), `volume ${nb(f.volume, 0)} (médiane des 20 bougies précédentes : ${nb(f.mediane, 0)})`, `posée à la clôture de cette bougie, avec les seuls niveaux connus avant elle (jamais redessinée)`, 'information de lecture, jamais un ordre'] };
      const z = etat.couches.liquidite !== false && etat.balayages.find(q => q.t === b.t && (q.sorte === 'haute' ? dessus : dessous));
      if (z) return { p: z.p, texte: `Liquidité ${z.sorte} ${nb(z.p, 0)} balayée`, detail: [`${z.raison} dépassé par cette bougie`] };
      return null;
    }
    const montrer = (g, y) => {
      const L = (g.detail || []).filter(d => d !== g.texte);
      tip.innerHTML = `<b>${esc(g.bord ? texteBord(g, etat.prix) : g.texte)}</b>${L.length ? '<ul style="margin:4px 0 0;padding-left:16px">' + L.map(d => `<li>${esc(d)}</li>`).join('') + '</ul>' : ''}<div style="color:#7d8a90;margin-top:3px">${etat.prix != null ? `à ${nb(Math.abs(g.p - etat.prix), 2)} $ du prix` : ''}</div>`;
      tip.hidden = false; tip.style.top = Math.max(4, Math.min(y + 16, el.clientHeight - tip.offsetHeight - 4)) + 'px';
    };
    const pos = e => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    el.addEventListener('pointermove', e => { if (epingle) return; const [x, y] = pos(e), g = trouver(x, y); if (g) montrer(g, y); else tip.hidden = true; el.style.cursor = g ? 'help' : ''; });
    el.addEventListener('pointerleave', () => { if (!epingle) tip.hidden = true; });
    el.addEventListener('click', e => { const [x, y] = pos(e), g = trouver(x, y); if (g) { e.stopPropagation(); epingle = epingle === g.texte ? null : g.texte; if (epingle) montrer(g, y); else tip.hidden = true; } else if (epingle) { epingle = null; tip.hidden = true; } }, true);
    api.info = (texte) => { const c = etat.cadres.find(c => c.g.texte === texte); if (!c) return null; montrer(c.g, c.y); epingle = texte; return tip.innerText; };
  }
  const redessiner = () => { primTexte.maj && primTexte.maj(); primFond.maj && primFond.maj(); };

  const api = {
    pret: () => pret,
    /* L : bougies affichées (référence décalée « ref: true » puis Kraken) ; cle : la période (nouvelle période → vue par défaut) */
    bougies(L, volumes, { cle = null, debutKraken = null, ecart = null } = {}) {
      const nouvelle = (cle !== etat.cle) || (!etat.bougies.length && L.length);
      etat.bougies = L; if (volumes) etat.volumes = volumes; etat.cle = cle; etat.debutKraken = debutKraken; etat.ecart = ecart;
      if (nouvelle) sig = null;
      try { versSerie(); } catch (e) { console.warn('bougies :', e.message); }
      if (nouvelle && chart && L.length) vueDefaut();
      redessiner();
    },
    vueDefaut,
    majDerniere(b) {
      if (!serie || !b) return; const der = etat.bougies[etat.bougies.length - 1]; sig = sig && { ...sig, n: etat.bougies.length };
      if (der && b.t < der.t) return;
      if (!der) return;
      try { serie.update({ time: tempsGraphique(b.t), open: b.o, high: b.h, low: b.l, close: b.c }); } catch (e) { console.warn('bougie en cours :', e.message); }
    },
    couches(c) { if (c) { etat.couches = { ...etat.couches, ...c }; ecrire('rayle_or_couches_v2', etat.couches); redessiner(); if (marqueurs) marqueurs.setMarkers(marquesLW()); } return { ...etat.couches }; },
    fleches: () => etat.fleches.slice(), marquesAffichees: () => marquesLW(),
    dessin({ zonesVol, niveaux, retournement, prix, a, bandes, liquidite, balayages, fleches }) { if (bandes) etat.bandes = bandes; if (liquidite) etat.liquidite = liquidite; if (balayages) etat.balayages = balayages; if (fleches) { const ch = fleches !== etat.fleches; etat.fleches = fleches; if (ch && marqueurs) marqueurs.setMarkers(marquesLW()); } if (zonesVol) etat.zonesVol = zonesVol.slice().sort((x, y) => (y.force || 0) - (x.force || 0)).slice(0, 3); if (niveaux) etat.niveaux = niveaux; if (retournement) etat.retournement = retournement; if (a != null) etat.a = a; if (prix != null) etat.prix = prix; redessiner(); },
    etiquettes: () => etat.cadres.map(c => ({ texte: c.g.texte, bord: c.g.bord || null, n: c.g.n, detail: c.g.detail, x: c.x, y: c.y, w: c.w, h: c.h })),
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
