import { INSTRUMENTS, UNITES } from './instruments.js';
import * as I from './indicateurs.js';
import { heureParis } from './serie.js';

/* ═════════════ GRAPHIQUE PROFESSIONNEL (TradingView Lightweight Charts v5, copié dans terminal/vendor ; licence Apache 2.0, voir CREDITS.md) ═════════════
   Chandeliers, zoom (molette) et défilement (glisser), repère croisé, légende des valeurs sous le curseur. Indicateurs CALCULÉS ICI (indicateurs.js), jamais par le Worker :
   MA / EMA (20, 50, 200), Bollinger, VWAP, volume, profil de volume, supports et résistances automatiques, RSI, MACD, ATR (sous-fenêtres). */
const COULEURS = {
  fond: '#05080c', texte: '#9db0bb', grille: 'rgba(143,208,227,.045)', bordure: 'rgba(143,208,227,.18)', haut: '#2fd18b', bas: '#ff5d6e', ambre: '#e9a23b', cyan: '#8fd0e3', violet: '#b78cff', rose: '#ff6fb1', blanc: '#e8f4fa',
  ma20: '#9ad7ff', ma50: '#ffd166', ma200: '#ffb000', ema20: '#5ee6c8', ema50: '#c4a1ff', ema200: '#ff7a59', boll: 'rgba(120,180,255,.75)', bollFond: 'rgba(120,180,255,.06)', vwap: '#f9f871'
};
export const REGLAGES_DEFAUT = { volume: true, profil: false, niveaux: true, ma20: false, ma50: false, ma200: true, ema20: false, ema50: false, ema200: false, bollinger: false, vwap: false, rsi: true, macd: false, atr: false };
export const REGLAGES_LEGERS = { volume: true, profil: false, niveaux: true, ma20: false, ma50: false, ma200: true, ema20: false, ema50: false, ema200: false, bollinger: false, vwap: false, rsi: true, macd: false, atr: false };
export const LIBELLES = { volume: 'Volume', profil: 'Profil de volume', niveaux: 'Supports / résistances', ma20: 'MA 20', ma50: 'MA 50', ma200: 'MA 200', ema20: 'EMA 20', ema50: 'EMA 50', ema200: 'EMA 200', bollinger: 'Bollinger', vwap: 'VWAP', rsi: 'RSI 14', macd: 'MACD', atr: 'ATR 14' };

let lwcPromesse = null;
export function chargerBibliotheque() {
  if (typeof window === 'undefined') return Promise.reject(new Error('pas de navigateur'));
  if (window.LightweightCharts) return Promise.resolve(window.LightweightCharts);
  if (lwcPromesse) return lwcPromesse;
  lwcPromesse = new Promise((ok, ko) => {
    const s = document.createElement('script'); s.async = true;
    s.src = new URL('terminal/vendor/lightweight-charts.js', document.baseURI).href;
    s.onload = () => (window.LightweightCharts ? ok(window.LightweightCharts) : ko(new Error('bibliothèque de graphique vide')));
    s.onerror = () => { lwcPromesse = null; ko(new Error('bibliothèque de graphique introuvable')); };
    document.head.appendChild(s);
  });
  return lwcPromesse;
}

const fParis = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false });
const fJour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' });
const fMois = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', month: 'short' });
const compact = v => (v == null ? '—' : Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(2) + ' G' : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + ' M' : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + ' k' : v.toFixed(0));

/* Primitive de dessin : le profil de volume (histogramme horizontal collé au bord droit), POC et zone de valeur. */
function primitiveProfil() {
  let profil = null, series = null, demander = () => {};
  const rendu = { draw(cible) {
    if (!profil || !series) return;
    cible.useBitmapCoordinateSpace(({ context: ctx, bitmapSize, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const max = Math.max(...profil.niveaux.map(n => n.volume)); if (!(max > 0)) return;
      const largeur = bitmapSize.width * 0.22, pas = (profil.max - profil.min) / profil.niveaux.length;
      for (const n of profil.niveaux) {
        const y1 = series.priceToCoordinate(n.prix + pas / 2), y0 = series.priceToCoordinate(n.prix - pas / 2); if (y1 == null || y0 == null) continue;
        const w = largeur * n.volume / max, dansValeur = n.prix >= profil.val && n.prix <= profil.vah;
        ctx.fillStyle = dansValeur ? 'rgba(77,227,255,.28)' : 'rgba(120,150,170,.20)';
        ctx.fillRect(bitmapSize.width - w, Math.min(y0, y1) * vr + 1, w, Math.max(1, Math.abs(y0 - y1) * vr - 1));
      }
      const yp = series.priceToCoordinate(profil.poc);
      if (yp != null) { ctx.fillStyle = 'rgba(255,176,0,.9)'; ctx.fillRect(bitmapSize.width - largeur, yp * vr - 1, largeur, 2 * vr); }
    });
  } };
  const vue = { renderer: () => rendu, zOrder: () => 'bottom' };
  return { attached(p) { series = p.series; demander = p.requestUpdate; }, detached() { series = null; }, paneViews: () => [vue], updateAllViews() {}, definir(p) { profil = p; demander(); } };
}

export async function creerGraphique({ boite, reglages = REGLAGES_DEFAUT, surReglage = () => {} }) {
  const LW = await chargerBibliotheque();
  boite.classList.add('tg-boite');
  boite.innerHTML = '<div class="tg-legende" aria-live="off"></div><div class="tg-zone"></div><div class="tg-etat"></div>';
  const zone = boite.querySelector('.tg-zone'), legende = boite.querySelector('.tg-legende'), etat = boite.querySelector('.tg-etat');
  const reg = { ...REGLAGES_DEFAUT, ...reglages };
  const chart = LW.createChart(zone, {
    autoSize: true,
    layout: { background: { type: 'solid', color: COULEURS.fond }, textColor: COULEURS.texte, fontFamily: 'Consolas, "Cascadia Mono", ui-monospace, monospace', fontSize: 11, attributionLogo: true, panes: { separatorColor: COULEURS.bordure, separatorHoverColor: 'rgba(143,208,227,.4)', enableResize: true } },
    grid: { vertLines: { color: COULEURS.grille }, horzLines: { color: COULEURS.grille } },
    crosshair: { mode: LW.CrosshairMode.Normal, vertLine: { color: 'rgba(143,208,227,.4)', labelBackgroundColor: '#16303a' }, horzLine: { color: 'rgba(143,208,227,.4)', labelBackgroundColor: '#16303a' } },
    rightPriceScale: { borderColor: COULEURS.bordure, scaleMargins: { top: 0.06, bottom: 0.04 } },
    timeScale: { borderColor: COULEURS.bordure, timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 7, minBarSpacing: 0.4,
      tickMarkFormatter: (t, type) => { const d = new Date(t * 1000); return type >= 3 ? fParis.format(d) : type === 2 ? fJour.format(d) : type === 1 ? fMois.format(d) : String(new Date(t * 1000).getUTCFullYear()); } },
    localization: { timeFormatter: t => heureParis(t * 1000), locale: 'fr-FR' },
    handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false }, handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true }
  });
  let ins = INSTRUMENTS.US100, un = UNITES.H1, donnees = [], res = null, ind = null;
  const series = {}, lignesNiveaux = [], profilPrimitive = primitiveProfil();
  let bougies = null, tailleTime = new Map(), indexParTemps = new Map();
  const dec = () => ins.decimales;
  const fmt = v => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(dec()));
  const sec = t => Math.floor(t / 1000);
  const opts = (type, p) => ({ priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...p });

  function supprimer(nom) { if (series[nom]) { try { chart.removeSeries(series[nom]); } catch (e) { /* déjà retirée */ } delete series[nom]; } }
  function ligne(nom, valeurs, couleur, volet = 0, extra = {}) {
    if (!series[nom]) series[nom] = chart.addSeries(LW.LineSeries, opts('line', { color: couleur, lineWidth: extra.epaisseur || 1.5, lineStyle: extra.style || 0, priceFormat: { type: 'price', precision: extra.precision != null ? extra.precision : dec(), minMove: Math.pow(10, -(extra.precision != null ? extra.precision : dec())) }, ...(extra.serie || {}) }), volet);
    series[nom].setData(donnees.map((b, i) => (valeurs[i] == null ? { time: sec(b.t) } : { time: sec(b.t), value: valeurs[i] })));
  }

  function construire() {
    if (!bougies) {
      bougies = chart.addSeries(LW.CandlestickSeries, { upColor: COULEURS.haut, downColor: COULEURS.bas, borderUpColor: COULEURS.haut, borderDownColor: COULEURS.bas, wickUpColor: COULEURS.haut, wickDownColor: COULEURS.bas, priceLineColor: COULEURS.ambre, priceFormat: { type: 'price', precision: dec(), minMove: Math.pow(10, -dec()) } }, 0);
      bougies.attachPrimitive(profilPrimitive);
    }
    bougies.applyOptions({ priceFormat: { type: 'price', precision: dec(), minMove: Math.pow(10, -dec()) } });
    bougies.setData(donnees.map(b => ({ time: sec(b.t), open: b.o, high: b.h, low: b.l, close: b.c })));
    indexParTemps = new Map(donnees.map((b, i) => [sec(b.t), i]));
    ind = donnees.length ? I.calculerTout(donnees) : null;
    const avecVolume = donnees.some(b => b.v > 0);
    // moyennes, bandes, VWAP (volet principal)
    const l = (nom, cle, serie, couleur, ep) => { if (reg[cle] && ind && serie) ligne(nom, serie, couleur, 0, { epaisseur: ep }); else supprimer(nom); };
    l('ma20', 'ma20', ind && ind.ma20, COULEURS.ma20, 1.2); l('ma50', 'ma50', ind && ind.ma50, COULEURS.ma50, 1.4); l('ma200', 'ma200', ind && ind.ma200, COULEURS.ma200, 2);
    l('ema20', 'ema20', ind && ind.ema20, COULEURS.ema20, 1.2); l('ema50', 'ema50', ind && ind.ema50, COULEURS.ema50, 1.4); l('ema200', 'ema200', ind && ind.ema200, COULEURS.ema200, 2);
    if (reg.bollinger && ind) { ligne('bollH', ind.bollinger.haut, COULEURS.boll, 0, { epaisseur: 1 }); ligne('bollM', ind.bollinger.milieu, 'rgba(120,180,255,.4)', 0, { epaisseur: 1, style: 2 }); ligne('bollB', ind.bollinger.bas, COULEURS.boll, 0, { epaisseur: 1 }); }
    else { supprimer('bollH'); supprimer('bollM'); supprimer('bollB'); }
    if (reg.vwap && ind && avecVolume && un.id !== 'D1' && un.id !== 'H4') ligne('vwap', ind.vwap, COULEURS.vwap, 0, { epaisseur: 1.5 }); else supprimer('vwap');
    // volume : histogramme au pied du volet principal
    if (reg.volume && avecVolume) {
      if (!series.volume) { series.volume = chart.addSeries(LW.HistogramSeries, { priceFormat: { type: 'custom', formatter: compact }, priceScaleId: 'volume', priceLineVisible: false, lastValueVisible: false }, 0); chart.priceScale('volume', 0).applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } }); }
      series.volume.setData(donnees.map(b => ({ time: sec(b.t), value: b.v, color: b.c >= b.o ? 'rgba(39,217,138,.38)' : 'rgba(255,77,94,.38)' })));
    } else supprimer('volume');
    // sous-fenêtres : RSI, MACD, ATR
    if (reg.rsi && ind) {
      ligne('rsi', ind.rsi, COULEURS.violet, 1, { epaisseur: 1.6, precision: 1, serie: { autoscaleInfoProvider: () => ({ priceRange: { minValue: 10, maxValue: 90 } }) } });
      if (!series.rsi70) { series.rsi70 = series.rsi.createPriceLine({ price: 70, color: 'rgba(255,77,94,.5)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' }); series.rsi30 = series.rsi.createPriceLine({ price: 30, color: 'rgba(39,217,138,.5)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' }); }
    } else { supprimer('rsi'); delete series.rsi70; delete series.rsi30; }
    if (reg.macd && ind) {
      const volet = reg.rsi ? 2 : 1;
      if (!series.macdH) series.macdH = chart.addSeries(LW.HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: { type: 'price', precision: 3, minMove: 0.001 } }, volet);
      series.macdH.setData(donnees.map((b, i) => (ind.macd.histogramme[i] == null ? { time: sec(b.t) } : { time: sec(b.t), value: ind.macd.histogramme[i], color: ind.macd.histogramme[i] >= 0 ? 'rgba(39,217,138,.6)' : 'rgba(255,77,94,.6)' })));
      ligne('macdL', ind.macd.macd, COULEURS.cyan, volet, { epaisseur: 1.3, precision: 3 }); ligne('macdS', ind.macd.signal, COULEURS.ambre, volet, { epaisseur: 1.3, precision: 3 });
    } else { supprimer('macdH'); supprimer('macdL'); supprimer('macdS'); }
    if (reg.atr && ind) ligne('atr', ind.atr, COULEURS.rose, (reg.rsi ? 1 : 0) + (reg.macd ? 1 : 0) + 1, { epaisseur: 1.5, precision: dec() }); else supprimer('atr');
    niveaux(); profil();
    mettreLegende(null);
  }

  // supports et résistances automatiques, point de contrôle du profil
  function niveaux() {
    while (lignesNiveaux.length) { try { bougies.removePriceLine(lignesNiveaux.pop()); } catch (e) { /* retirée */ } }
    if (!reg.niveaux || donnees.length < 30) return;
    const nv = I.niveauxCles(donnees.slice(-Math.min(donnees.length, 400)), ind ? I.atr(donnees, 14)[donnees.length - 1] : null);
    const ajout = (n, i, sup) => lignesNiveaux.push(bougies.createPriceLine({ price: n.prix, color: sup ? 'rgba(39,217,138,.85)' : 'rgba(255,77,94,.85)', lineWidth: n.force === 'forte' ? 2 : 1, lineStyle: n.force === 'faible' ? 3 : 2, axisLabelVisible: true, title: (sup ? 'S' : 'R') + (i + 1) + ' ' + n.force }));
    nv.supports.forEach((n, i) => ajout(n, i, true)); nv.resistances.forEach((n, i) => ajout(n, i, false));
    niveauxCourants = nv;
  }
  let niveauxCourants = null;
  let profilCourant = null;
  function profil() {
    if (!reg.profil || !donnees.some(b => b.v > 0)) { profilPrimitive.definir(null); profilCourant = null; return; }
    const plage = chart.timeScale().getVisibleLogicalRange();
    const a = plage ? Math.max(0, Math.floor(plage.from)) : Math.max(0, donnees.length - 200), z = plage ? Math.min(donnees.length - 1, Math.ceil(plage.to)) : donnees.length - 1;
    profilCourant = I.profilVolume(donnees.slice(a, z + 1), 48); profilPrimitive.definir(profilCourant);
  }
  let minuteurProfil = 0;
  chart.timeScale().subscribeVisibleLogicalRangeChange(() => { if (!reg.profil) return; clearTimeout(minuteurProfil); minuteurProfil = setTimeout(profil, 120); });

  // légende : valeurs sous le curseur (ou de la dernière bougie)
  function mettreLegende(t) {
    if (!donnees.length) { legende.innerHTML = ''; return; }
    const i = t != null && indexParTemps.has(t) ? indexParTemps.get(t) : donnees.length - 1, b = donnees[i], p = i > 0 ? donnees[i - 1].c : b.o, haus = b.c >= p;
    const val = (nom, cle, serie, c) => (reg[cle] && ind && ind[serie] && ind[serie][i] != null ? '<span style="color:' + c + '">' + nom + ' ' + fmt(ind[serie][i]) + '</span>' : '');
    legende.innerHTML = '<b>' + ins.court + ' · ' + un.nom + '</b> <span>' + heureParis(b.t) + '</span> <span>O ' + fmt(b.o) + '</span> <span>H ' + fmt(b.h) + '</span> <span>L ' + fmt(b.l) + '</span> <span style="color:' + (haus ? COULEURS.haut : COULEURS.bas) + '">C ' + fmt(b.c) + ' (' + (b.c - p >= 0 ? '+' : '') + ((b.c - p) / p * 100).toFixed(2) + ' %)</span>'
      + (b.v > 0 ? ' <span>Vol ' + compact(b.v) + '</span>' : '')
      + val('MA20', 'ma20', 'ma20', COULEURS.ma20) + val('MA50', 'ma50', 'ma50', COULEURS.ma50) + val('MA200', 'ma200', 'ma200', COULEURS.ma200) + val('EMA20', 'ema20', 'ema20', COULEURS.ema20) + val('EMA50', 'ema50', 'ema50', COULEURS.ema50) + val('EMA200', 'ema200', 'ema200', COULEURS.ema200)
      + (reg.vwap && ind && ind.vwap[i] != null ? '<span style="color:' + COULEURS.vwap + '">VWAP ' + fmt(ind.vwap[i]) + '</span>' : '')
      + (reg.rsi && ind && ind.rsi[i] != null ? '<span style="color:' + COULEURS.violet + '">RSI ' + ind.rsi[i].toFixed(1) + '</span>' : '')
      + (reg.macd && ind && ind.macd.macd[i] != null ? '<span style="color:' + COULEURS.cyan + '">MACD ' + ind.macd.macd[i].toFixed(2) + '</span>' : '')
      + (reg.atr && ind && ind.atr[i] != null ? '<span style="color:' + COULEURS.rose + '">ATR ' + fmt(ind.atr[i]) + '</span>' : '');
  }
  chart.subscribeCrosshairMove(p => mettreLegende(p && p.time != null ? p.time : null));
  zone.addEventListener('wheel', e => { e.stopPropagation(); }, { passive: true });

  function tailleVolets() {
    try { const p = chart.panes(); if (p.length > 1) { const h = zone.clientHeight || 400, bas = Math.max(70, Math.round(h * 0.17)); p[0].setHeight(Math.max(120, h - bas * (p.length - 1) - 8)); for (let k = 1; k < p.length; k++) p[k].setHeight(bas); } } catch (e) { /* version sans réglage de hauteur */ }
  }
  function definir({ instrument, unite, bougies: b }) {
    ins = INSTRUMENTS[instrument] || ins; un = UNITES[unite] || un; donnees = b || [];
    construire(); tailleVolets();
    chart.timeScale().fitContent(); if (donnees.length > 150) chart.timeScale().setVisibleLogicalRange({ from: donnees.length - 140, to: donnees.length + 4 });
  }
  /* Mise à jour sans bouger la vue (rafraîchissement automatique). */
  function maj(b) { const plage = chart.timeScale().getVisibleLogicalRange(); donnees = b || []; construire(); if (plage) chart.timeScale().setVisibleLogicalRange(plage); }
  function regler(p) { Object.assign(reg, p); construire(); tailleVolets(); surReglage({ ...reg }); }
  const message = t => { etat.textContent = t || ''; etat.style.display = t ? 'flex' : 'none'; };
  return {
    definir, maj, regler, reglages: () => ({ ...reg }), message, chart, series,
    recadrer() { chart.timeScale().fitContent(); }, aujourdhui() { chart.timeScale().scrollToRealTime(); },
    etat: () => ({ bougies: donnees.length, visibles: chart.timeScale().getVisibleLogicalRange(), series: Object.keys(series), volets: chart.panes().length, niveaux: niveauxCourants, profil: profilCourant, instrument: ins.id, unite: un.id }),
    detruire() { clearTimeout(minuteurProfil); try { chart.remove(); } catch (e) { /* déjà détruit */ } }
  };
}
