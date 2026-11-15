/* ═════════════ GRAPHIQUES (Lightweight Charts v5, local) : même style partout ═════════════
   monterGraphique(boite, options) → { chart, bougies, ligne, histo, aire, niveau, marqueurs, ajuster, detruire }
   Les temps sont des ms UTC (convertis en secondes) ou des dates 'AAAA-MM-JJ' ; les points sans valeur sont ignorés ; les temps dupliqués ou désordonnés sont écartés. */
import { chargerLib } from '../../agent-trading/front/graphique.js';

export const COULEURS = Object.freeze({ texte: '#8497a1', grille: 'rgba(143,208,227,.07)', hausse: '#5fb894', baisse: '#d86a6a', accent: '#8fd0e3', or: '#f1d34f', violet: '#b49cf0', orange: '#e8a85a', gris: '#6e8089' });
const FMT_J = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: 'short' });
const FMT_H = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false });
const FMT_MA = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'short', year: '2-digit' });
const FMT_A = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', year: 'numeric' });
const FMT_JH = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const msDe = t => (typeof t === 'number' ? t * 1000 : typeof t === 'string' ? Date.parse(t.length === 10 ? t + 'T00:00:00Z' : t) : t && t.year ? Date.UTC(t.year, t.month - 1, t.day) : NaN);
const jourSeul = t => typeof t !== 'number';
export const temps = t => (typeof t === 'number' ? Math.floor(t / 1000) : t);
function propres(pts, cle = 'value') {
  const out = []; let prec = null;
  for (const p of pts) { if (p == null || p[cle] == null && p.close == null || p.time == null) continue; const k = typeof p.time === 'number' ? p.time : Date.parse(p.time + 'T00:00:00Z') / 1000; if (prec != null && k <= prec) continue; prec = k; out.push(p); }
  return out;
}
export async function monterGraphique(box, { hauteur = 260, intraday = true, dec = 2, gauche = false, droite = true } = {}) {
  const LW = await chargerLib(); box.innerHTML = ''; box.style.height = hauteur + 'px';
  const chart = LW.createChart(box, {
    autoSize: true, height: hauteur,
    layout: { attributionLogo: false, background: { type: 'solid', color: 'transparent' }, textColor: COULEURS.texte, fontSize: 11, panes: { separatorColor: 'rgba(143,208,227,.14)' } },
    grid: { vertLines: { color: COULEURS.grille }, horzLines: { color: COULEURS.grille } },
    crosshair: { mode: 0 }, rightPriceScale: { borderVisible: false, visible: droite }, leftPriceScale: { borderVisible: false, visible: gauche },
    timeScale: { borderVisible: false, timeVisible: intraday, secondsVisible: false, rightOffset: 4, tickMarkFormatter: (t, type) => { const ms = msDe(t); if (!Number.isFinite(ms)) return ''; if (type === 0) return FMT_A.format(ms); if (type === 1) return FMT_MA.format(ms); return jourSeul(t) || type === 2 ? FMT_J.format(ms) : FMT_H.format(ms); } },
    localization: { locale: 'fr-FR', timeFormatter: t => { const ms = msDe(t); if (!Number.isFinite(ms)) return ''; return jourSeul(t) ? FMT_J.format(ms) : FMT_JH.format(ms); } },
    handleScroll: { pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false, mouseWheel: false }, handleScale: { pinch: true, mouseWheel: false, axisPressedMouseMove: true }
  });
  const fmt = { type: 'price', precision: dec, minMove: dec ? Math.pow(10, -dec) : 1 };
  let vue = null, touche = false; const appliquer = () => { try { const ts = chart.timeScale(); if (!vue) return; if (vue.type === 'tout') { if (nMax > 1) ts.setVisibleLogicalRange({ from: -1, to: nMax + 2 }); else ts.fitContent(); } else ts.setVisibleLogicalRange({ from: Math.max(0, vue.total - vue.n), to: vue.total + 3 }); } catch (e) { /* graphique libéré */ } };
  box.addEventListener('pointerdown', () => { touche = true; }, { passive: true }); box.addEventListener('wheel', () => { touche = true; }, { passive: true });
  try { chart.timeScale().subscribeSizeChange(() => { if (!touche) appliquer(); }); } catch (e) { /* version sans cet évènement */ }
  let nMax = 0; const note = L => { if (L.length > nMax) nMax = L.length; return L; };
  const api = {
    chart, LW,
    bougies(B, { pane = 0 } = {}) { const s = chart.addSeries(LW.CandlestickSeries, { upColor: COULEURS.hausse, downColor: COULEURS.baisse, borderVisible: false, wickUpColor: COULEURS.hausse, wickDownColor: COULEURS.baisse, priceFormat: fmt }, pane); s.setData(note(propres(B.map(b => ({ time: temps(b.t), open: b.o, high: b.h, low: b.l, close: b.c })), 'close'))); return s; },
    ligne(pts, { couleur = COULEURS.accent, epaisseur = 1.5, echelle = 'right', titre = '', pane = 0, pointille = false, format = fmt, derniere = false, horsEchelle = false } = {}) {
      const s = chart.addSeries(LW.LineSeries, { color: couleur, lineWidth: epaisseur, priceScaleId: echelle, title: titre, lineStyle: pointille ? 2 : 0, lastValueVisible: derniere || !!titre, priceLineVisible: false, crosshairMarkerVisible: false, priceFormat: format, ...(horsEchelle ? { autoscaleInfoProvider: () => null } : {}) }, pane);
      s.setData(note(propres(pts.map(p => ({ time: temps(p.t != null ? p.t : p.d), value: p.v }))))); return s;
    },
    histo(pts, { couleur = COULEURS.accent, echelle = 'right', pane = 0, format } = {}) {
      const s = chart.addSeries(LW.HistogramSeries, { priceScaleId: echelle, priceLineVisible: false, lastValueVisible: false, ...(format ? { priceFormat: format } : {}) }, pane);
      s.setData(note(propres(pts.map(p => ({ time: temps(p.t != null ? p.t : p.d), value: p.v, color: p.couleur || (p.v >= 0 ? COULEURS.hausse : COULEURS.baisse) }))))); return s;
    },
    niveau(serie, prix, { couleur = COULEURS.gris, titre = '', style = 2, largeur = 1 } = {}) { return serie.createPriceLine({ price: prix, color: couleur, lineWidth: largeur, lineStyle: style, axisLabelVisible: true, title: titre }); },
    marqueurs(serie, L) { try { if (LW.createSeriesMarkers && L && L.length) LW.createSeriesMarkers(serie, L.sort((a, b) => (a.time > b.time ? 1 : -1))); } catch (e) { /* marqueurs facultatifs */ } },
    /* toute la série visible. La largeur réelle n'est connue qu'après la première mise en page : on réapplique la plage à chaque changement de taille, jusqu'à ce que l'utilisateur touche au graphique. */
    ajuster() { vue = { type: 'tout' }; appliquer(); },
    montrerDerniers(n, total) { vue = { type: 'derniers', n, total }; appliquer(); },
    detruire() { try { chart.remove(); } catch (e) { /* déjà libéré */ } }
  };
  box._graphique = api;   // pour les tests et le débogage
  return api;
}
