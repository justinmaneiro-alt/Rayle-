/* ═════════════ MODE VOLUME : INTERFACE (v4) ═════════════
   Un terminal complet centré sur le volume : graphique (bougies, profil de volume de la zone visible avec POC / zone de valeur / HVN / LVN, VWAP ancrés et bandes, POC nus, MA200 et ses flèches,
   mes dessins), volume et delta au zoom (empreinte à fort zoom en H1 sur l'or et les cryptos quand les transactions sont disponibles), panneau Volume + delta + CVD, panneau MFI (ou RVOL),
   carnet d'ordres vivant (échelle, déséquilibre, murs, carte de chaleur, gros flux), supports / résistances par le volume (3 à 5), flèches Volume à la clôture.
   Lecture seule : aucun ordre. Chaque volume affiche sa source et son âge. Les calculs sont dans volume-calcul.js (pur, testé). */
import { esc, nf, lireLS, ecrireLS } from '../commun/ui.js';
import { chargerLib } from '../../agent-trading/front/graphique.js';
import { analyserUnite, styleFleche } from '../terminal/ma200-h4.js';
import { lireDessins } from '../terminal/dessins-stockage.js';
import { visibles } from '../terminal/dessins-fusion.js';
import { profil, vwapAncre, indexAncrePeriode, pocsNus, mfi, divergencesMfi, serieDelta, cvd, deltaReel, volumeRelatif, niveauxVolume, flechesVolume, desequilibre, murs, seuilGrosses, deltaBarre, TYPES_FLECHES_VOLUME } from './volume-calcul.js';
import { ACTIFS_VOLUME, parId, UNITES_VOLUME, PAS_UNITE, chargerBarres, badgeSource, ageDonnee } from './volume-donnees.js';
import { ouvrir as ouvrirFlux, parseBinance, creerCarnetKraken, parseKrakenTrade, creerEmpreinte, pasEmpreinte, creerChaleur, creerFlux, urlBinance, abonnementKraken, KRAKEN_WS, SYMBOLES_LIVE } from './volume-live.js';

const CLE = { actif: 'rayle_tpv_actif', unite: 'rayle_tpv_unite', opts: 'rayle_tpv_opts', types: 'rayle_tpv_types', reg: (a, u) => `rayle_tpv_reg_${a}_${u}`, ancres: (a, u) => `rayle_tpv_ancres_${a}_${u}` };
const OPTS_DEFAUT = { profil: true, vwap: true, nus: true, murs: true, chaleur: false, empreinte: true, niveaux: true, dessins: true, fleches: true, ma200: true, mfiMode: 'mfi', carnetSource: 'Binance', sourceVolume: 'reel' };
const NOM_U = { H1: 'H1', H4: 'H4', J: 'Daily' };
const COUL = { haut: '#5fb894', bas: '#d86a6a', sable: '#c9b27a', bleu: '#8fd0e3', ma: '#f1d34f', texte: '#aebcc4', doux: '#6b7a84' };
const tFr = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const tJ = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: 'short' });
const tH = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false });
const compact = v => { const a = Math.abs(v); return a >= 1e9 ? nf(v / 1e9, 1) + ' G' : a >= 1e6 ? nf(v / 1e6, 1) + ' M' : a >= 1e3 ? nf(v / 1e3, 1) + ' k' : nf(v, a >= 100 ? 0 : 1); };
const sgn = v => (v >= 0 ? '+' : '−') + compact(Math.abs(v));
const dec = a => parId[a].decimales;
const prix = (a, p) => nf(p, dec(a));

export async function monterVolume({ racine, T = {}, parler = () => {}, idDefaut = 'or', unite0 = 'H4' } = {}) {
  const LW = await chargerLib();
  const opts = { ...OPTS_DEFAUT, ...lireLS(CLE.opts, {}) };
  const types = { 'vol-absorption': true, 'vol-cassure': true, 'vol-faux': true, ...lireLS(CLE.types, {}) };
  const S = { actif: parId[lireLS(CLE.actif, idDefaut)] ? lireLS(CLE.actif, idDefaut) : idDefaut, unite: UNITES_VOLUME.includes(lireLS(CLE.unite, unite0)) ? lireLS(CLE.unite, unite0) : unite0, bars: [], donnees: null, erreur: null, charge: false, seq: 0,
    prof: null, niveaux: [], fleches: [], flechesMA: [], book: null, gros: creerFlux(), emp: creerEmpreinte({ pas: 1 }), chaleur: creerChaleur(), etatFlux: {}, modeAncre: false, lignes: [], seriesVwap: [], seriesDessins: [], info: null, flux: [], krakenBook: creerCarnetKraken(), ouvert: false };

  /* ───── DOM ───── */
  const el = document.createElement('section'); el.className = 'tpv'; el.hidden = true; el.setAttribute('aria-label', 'Terminal Volume');
  el.innerHTML = `<div class="tpv-barre">
      <select data-actif aria-label="Actif">${ACTIFS_VOLUME.map(a => `<option value="${a.id}">${esc(a.nom)}</option>`).join('')}</select>
      <div class="tpv-unites" role="group" aria-label="Unité">${UNITES_VOLUME.map(u => `<button type="button" data-unite="${u}">${NOM_U[u]}</button>`).join('')}</div>
      <span class="tpv-badge" data-badge role="status"></span>
      <span class="tpv-vide"></span>
      <button type="button" data-ancrer title="Touche ensuite une bougie : un VWAP s’y ancre (bandes ±1 et ±2 écarts-types)">Ancrer VWAP</button>
      <button type="button" data-effacer-vwap title="Retire mes VWAP ancrés">Effacer</button>
      <button type="button" data-reglages aria-expanded="false">Calques</button></div>
    <div class="tpv-reglages" data-panneau-reglages hidden>${[['profil', 'Profil de volume'], ['vwap', 'VWAP semaine / mois'], ['nus', 'POC nus'], ['niveaux', 'Supports / résistances (volume)'], ['murs', 'Murs du carnet'], ['chaleur', 'Carte de chaleur du carnet'], ['empreinte', 'Volume / delta par bougie et empreinte'], ['dessins', 'Mes dessins'], ['fleches', 'Flèches Volume'], ['ma200', 'MA200 et flèches']].map(([k, n]) => `<label><input type="checkbox" data-opt="${k}"> ${n}</label>`).join('')}
      <label>Panneau du bas <select data-opt-select="mfiMode"><option value="mfi">MFI 14 (RSI du volume)</option><option value="rvol">Volume relatif (RVOL)</option></select></label>
      <label>Carnet et gros flux <select data-opt-select="carnetSource"><option>Binance</option><option>Kraken</option></select></label>
      <label data-ligne-source-volume>Volume de l’or <select data-opt-select="sourceVolume"><option value="reel">Perpétuel Binance (réel)</option><option value="ref">Futures COMEX GC (institutionnel)</option></select></label>
      <fieldset><legend>Alertes des flèches Volume</legend>${TYPES_FLECHES_VOLUME.map(t => `<label><input type="checkbox" data-type="${t.id}"> ${esc(t.nom)}</label>`).join('')}</fieldset></div>
    <div class="tpv-corps"><div class="tpv-graph" data-graph><div class="tpv-info" data-info hidden></div><p class="tpv-att" data-att role="status">Chargement…</p></div>
      <aside class="tpv-droite" data-droite aria-label="Carnet d’ordres et flux"></aside></div>
    <p class="tpv-note" data-note></p>`;
  racine.appendChild(el);
  const $ = s => el.querySelector(s), $$ = s => [...el.querySelectorAll(s)];
  const zoneGraph = $('[data-graph]'), zoneDroite = $('[data-droite]');

  /* ───── graphique ───── */
  let chart = null, sBou = null, sVol = null, sMoy = null, sCvd = null, sMfi = null, sRv = null, sMa = null, marqueurs = null, couche = null, sauteRange = false, tempsProfil = 0;
  const temps = t => Math.floor(t / 1000);
  function creerGraphique() {
    if (chart) return;   // un seul graphique pour toute la vie du mode : le recréer à chaque changement d'actif ou d'unité provoque des erreurs « Object is disposed » de Lightweight Charts
    const hote = document.createElement('div'); hote.className = 'tpv-lw'; zoneGraph.appendChild(hote);
    chart = LW.createChart(hote, { autoSize: true, layout: { background: { type: 'solid', color: '#000' }, textColor: COUL.texte, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11, panes: { separatorColor: '#1a232b', separatorHoverColor: '#2b3a46' }, attributionLogo: true },
      grid: { vertLines: { color: '#0b1116' }, horzLines: { color: '#0b1116' } }, rightPriceScale: { borderColor: '#1a232b', scaleMargins: { top: 0.06, bottom: 0.06 } }, leftPriceScale: { visible: false, borderColor: '#1a232b' },
      timeScale: { borderColor: '#1a232b', rightOffset: 12, barSpacing: 9, minBarSpacing: 1.5, timeVisible: true, tickMarkFormatter: (t, type) => { const d = new Date(t * 1000); return type >= 3 ? tH.format(d) : tJ.format(d); } },
      localization: { timeFormatter: t => tFr.format(new Date(t * 1000)) }, crosshair: { mode: 0 }, handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false }, handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true } });
    sBou = chart.addSeries(LW.CandlestickSeries, { upColor: COUL.haut, downColor: COUL.bas, wickUpColor: COUL.haut, wickDownColor: COUL.bas, borderVisible: false, priceLineVisible: true }, 0);
    sMa = chart.addSeries(LW.LineSeries, { color: COUL.ma, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: 'MA200' }, 0);
    sVol = chart.addSeries(LW.HistogramSeries, { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false }, 1);
    sMoy = chart.addSeries(LW.LineSeries, { color: 'rgba(241,211,79,.7)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 1);
    sCvd = chart.addSeries(LW.LineSeries, { color: COUL.bleu, lineWidth: 1, priceScaleId: 'left', priceLineVisible: false, lastValueVisible: true, title: 'CVD' }, 1);
    chart.priceScale('left', 1).applyOptions({ visible: true, borderColor: '#1a232b' });
    sMfi = chart.addSeries(LW.LineSeries, { color: COUL.sable, lineWidth: 1, priceLineVisible: false, title: 'MFI' }, 2);
    sRv = chart.addSeries(LW.HistogramSeries, { priceFormat: { type: 'price', precision: 1, minMove: 0.1 }, priceLineVisible: false, lastValueVisible: false, title: 'RVOL' }, 2);
    try { const P = chart.panes(); P[0].setStretchFactor(6); P[1].setStretchFactor(2); P[2].setStretchFactor(2); } catch (e) { /* version sans panneaux ajustables */ }
    couche = creerCouche(); sBou.attachPrimitive(couche);
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => { if (sauteRange) return; clearTimeout(tempsProfil); tempsProfil = setTimeout(() => { calculerProfil(); couche && couche.req && couche.req(); }, 60); });
    chart.subscribeClick(p => { if (!p || p.time == null) return; if (S.modeAncre) { ancrerEn(p.time * 1000); return; } montrerInfoFleche(p.time * 1000, p.point); });
    chart.subscribeCrosshairMove(p => { if (!p || p.time == null) { if (S.info && !S.infoFixe) $('[data-info]').hidden = true; return; } });
  }

  /* ───── primitive : carte de chaleur (fond), profil, volume / delta par bougie, empreinte (premier plan) ───── */
  function creerCouche() {
    const o = { req: null, attached(p) { this.req = p.requestUpdate; }, detached() { this.req = null; }, updateAllViews() { /* tout est lu au dessin */ },
      paneViews() { return [{ zOrder: () => 'bottom', renderer: () => ({ draw() { /* rien */ }, drawBackground: cible => cible.useBitmapCoordinateSpace(sc => { try { dessinerChaleur(sc); } catch (e) { /* ne casse pas le graphique */ } }) }) },
        { zOrder: () => 'top', renderer: () => ({ draw: cible => cible.useBitmapCoordinateSpace(sc => { try { dessinerProfil(sc); dessinerBougies(sc); } catch (e) { /* idem */ } }) }) }]; } };
    return o;
  }
  const yDe = p => sBou.priceToCoordinate(p), xDe = t => chart.timeScale().timeToCoordinate(temps(t));
  function dessinerChaleur(sc) {
    if (!opts.chaleur || !S.chaleur.liste().length) return; const c = sc.context, hr = sc.horizontalPixelRatio, vr = sc.verticalPixelRatio, L = S.chaleur.liste(); let max = 0; for (const s of L) for (const x of [...s.bids, ...s.asks]) max = Math.max(max, x[1]); if (!(max > 0)) return;
    for (let i = 0; i < L.length; i++) {
      const x0 = xDe(L[i].t), x1 = i + 1 < L.length ? xDe(L[i + 1].t) : xDe(L[i].t) + 4; if (x0 == null || x1 == null) continue;
      for (const [cote, lst] of [['b', L[i].bids], ['a', L[i].asks]]) for (const [p, q] of lst) { const y = yDe(p); if (y == null) continue; c.fillStyle = (cote === 'b' ? 'rgba(95,184,148,' : 'rgba(216,106,106,') + Math.min(0.5, 0.55 * q / max).toFixed(3) + ')'; c.fillRect(x0 * hr, (y - 2) * vr, Math.max(2, (x1 - x0) * hr), 4 * vr); }
    }
  }
  function dessinerProfil(sc) {
    const P = S.prof; if (!opts.profil || !P) return; const c = sc.context, hr = sc.horizontalPixelRatio, vr = sc.verticalPixelRatio, W = sc.bitmapSize.width, maxL = Math.min(W * 0.22, 190 * hr); let mv = 0; for (const b of P.bins) mv = Math.max(mv, b.v); if (!(mv > 0)) return;
    const xFin = W - 4 * hr;
    for (const b of P.bins) {
      const y1 = yDe(b.hi), y2 = yDe(b.lo); if (y1 == null || y2 == null) continue; const h = Math.max(1, (y2 - y1) * vr - 1), L = maxL * b.v / mv, dansVa = b.hi > P.val && b.lo < P.vah;
      c.fillStyle = dansVa ? 'rgba(143,208,227,.30)' : 'rgba(143,208,227,.14)'; c.fillRect(xFin - L, y1 * vr, L, h);
      if (opts.profil && Number.isFinite(b.d) && b.v > 0) { const part = Math.max(0, Math.min(1, 0.5 + 0.5 * b.d / b.v)); c.fillStyle = 'rgba(95,184,148,.45)'; c.fillRect(xFin - L, y1 * vr, L * part, h); c.fillStyle = 'rgba(216,106,106,.35)'; c.fillRect(xFin - L + L * part, y1 * vr, L * (1 - part), h); }
    }
    const ligne = (p, couleur, txt, tirets) => { const y = yDe(p); if (y == null) return; c.strokeStyle = couleur; c.lineWidth = Math.max(1, hr); c.setLineDash(tirets ? [5 * hr, 4 * hr] : []); c.beginPath(); c.moveTo(xFin - maxL - 6 * hr, y * vr); c.lineTo(xFin, y * vr); c.stroke(); c.setLineDash([]); c.fillStyle = couleur; c.font = `${10 * hr}px ui-monospace, monospace`; c.fillText(txt, xFin - maxL - 6 * hr - c.measureText(txt).width - 4 * hr, y * vr + 3 * vr); };
    ligne(P.poc.prix, '#f1d34f', 'POC ' + prix(S.actif, P.poc.prix), false); ligne(P.vah, COUL.bleu, 'VAH ' + prix(S.actif, P.vah), true); ligne(P.val, COUL.bleu, 'VAL ' + prix(S.actif, P.val), true);
    for (const h of P.hvn.slice(0, 5)) { const y = yDe(h.prix); if (y == null) continue; c.fillStyle = 'rgba(241,211,79,.9)'; c.beginPath(); c.moveTo(xFin - maxL - 2 * hr, y * vr); c.lineTo(xFin - maxL - 9 * hr, (y - 4) * vr); c.lineTo(xFin - maxL - 9 * hr, (y + 4) * vr); c.fill(); }
    for (const l of P.lvn.slice(0, 5)) { const y = yDe(l.prix); if (y == null) continue; c.strokeStyle = 'rgba(160,170,180,.45)'; c.setLineDash([2 * hr, 4 * hr]); c.beginPath(); c.moveTo(xFin - maxL, y * vr); c.lineTo(xFin, y * vr); c.stroke(); c.setLineDash([]); }
  }
  function dessinerBougies(sc) {
    if (!opts.empreinte || !S.bars.length) return; const ts = chart.timeScale(), esp = ts.options().barSpacing; if (esp < 30) return;
    const c = sc.context, hr = sc.horizontalPixelRatio, vr = sc.verticalPixelRatio, r = ts.getVisibleRange(); if (!r) return; const a = parId[S.actif], peutEmpreinte = a.live && S.unite === 'H1' && esp >= 70;
    c.textAlign = 'center'; c.font = `${(esp >= 60 ? 11 : 10) * hr}px ui-monospace, monospace`;
    for (const b of S.bars) {
      const tt = temps(b.t); if (tt < r.from - 2 || tt > r.to + 2) continue; const x = xDe(b.t), yH = yDe(b.h), yL = yDe(b.l); if (x == null || yH == null) continue;
      const d = deltaBarre(b);
      if (peutEmpreinte && S.emp.a(b.t)) {
        for (const n of S.emp.niveaux(b.t)) { const y = yDe(n.prix); if (y == null) continue; c.fillStyle = n.achat >= n.vente ? 'rgba(95,184,148,.9)' : 'rgba(216,106,106,.9)'; c.fillText(`${compact(n.vente)}×${compact(n.achat)}`, x * hr, y * vr + 3 * vr); }
      } else {
        c.fillStyle = 'rgba(190,200,208,.85)'; c.fillText('V ' + compact(b.v || 0), x * hr, (yH - 14) * vr); c.fillStyle = d >= 0 ? 'rgba(95,184,148,.95)' : 'rgba(216,106,106,.95)'; c.fillText('Δ ' + sgn(d), x * hr, (yH - 3) * vr);
      }
    }
    c.textAlign = 'start';
  }

  /* ───── calculs affichés ───── */
  function calculerProfil() {
    if (!chart || !S.bars.length) { S.prof = null; return; }
    const r = chart.timeScale().getVisibleLogicalRange(); if (!r) return; const i0 = Math.max(0, Math.floor(r.from)), i1 = Math.min(S.bars.length - 1, Math.ceil(r.to)); const X = S.bars.slice(i0, i1 + 1); if (X.length < 3) { S.prof = null; return; }
    const hi = Math.max(...X.map(b => b.h)), lo = Math.min(...X.map(b => b.l)); S.prof = profil(X, { niveaux: Math.max(24, Math.min(90, Math.round((hi - lo) / ((S.niveauxAtr || (hi - lo) / 60) * 0.18)))) });
    majPanneauNiveauxTexte();
  }
  const moyenne = (B, n = 20) => B.map((_, i) => (i < n ? null : B.slice(i - n, i).reduce((s, b) => s + (b.v || 0), 0) / n));
  function peindre(recadrer) {
    const B = S.bars; if (!chart || !B.length) return; sauteRange = true;
    sBou.setData(B.map(b => ({ time: temps(b.t), open: b.o, high: b.h, low: b.l, close: b.c })));
    const D = serieDelta(B), R = volumeRelatif(B), moy = moyenne(B);
    sVol.setData(B.map((b, i) => ({ time: temps(b.t), value: b.v || 0, color: R[i] != null && R[i] > 2 ? (D[i] >= 0 ? '#7ee3b0' : '#ff8a8a') : (D[i] >= 0 ? 'rgba(95,184,148,.6)' : 'rgba(216,106,106,.6)') })));
    sMoy.setData(B.map((b, i) => (moy[i] == null ? null : { time: temps(b.t), value: moy[i] })).filter(Boolean));
    const C = cvd(B); sCvd.setData(B.map((b, i) => ({ time: temps(b.t), value: C[i] }))); sCvd.applyOptions({ title: 'CVD' + (deltaReel(B) ? '' : ' (estimé)') });
    const M = mfi(B); const mode = opts.mfiMode === 'rvol';
    sMfi.setData(mode ? [] : B.map((b, i) => (M[i] == null ? null : { time: temps(b.t), value: M[i] })).filter(Boolean)); sRv.setData(mode ? B.map((b, i) => (R[i] == null ? null : { time: temps(b.t), value: R[i], color: R[i] > 2 ? '#f1d34f' : 'rgba(143,208,227,.5)' })).filter(Boolean) : []);
    try { for (const l of S.lignesMfi || []) sMfi.removePriceLine(l); S.lignesMfi = mode ? [] : [80, 20].map(v => sMfi.createPriceLine({ price: v, color: '#2b3a46', lineStyle: 2, lineWidth: 1, axisLabelVisible: true, title: String(v) })); } catch (e) { /* ignoré */ }
    const m200 = []; if (B.length >= 200) { let s = 0; for (let i = 0; i < B.length; i++) { s += B[i].c; if (i >= 200) s -= B[i - 200].c; if (i >= 199) m200.push({ time: temps(B[i].t), value: s / 200 }); } }
    sMa.setData(opts.ma200 ? m200 : []);
    S.niveauxAtr = null; calculerAnnexes(); sauteRange = false;
    if (recadrer) { const n = B.length; chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 120), to: n + 10 }); }
    calculerProfil(); couche && couche.req && couche.req(); majDroite();
  }
  /* VWAP, POC nus, niveaux, flèches, dessins : recalculés quand les bougies changent (pas à chaque transaction) */
  function calculerAnnexes() {
    const B = S.bars; if (!B.length) return;
    for (const s of S.seriesVwap) { try { chart.removeSeries(s); } catch (e) { /* déjà retirée */ } } S.seriesVwap = [];
    for (const l of S.lignes) { try { sBou.removePriceLine(l); } catch (e) { /* déjà retirée */ } } S.lignes = [];
    const ajouterVwap = (i0, couleur, bandes, titre) => {
      if (i0 < 0 || i0 >= B.length) return; const V = vwapAncre(B, i0, { bandes }), mk = (cle, coul, ep, st) => { const s = chart.addSeries(LW.LineSeries, { color: coul, lineWidth: ep, lineStyle: st, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: cle === 'v' ? titre : '' }, 0); s.setData(V.map((x, k) => ({ time: temps(B[i0 + k].t), value: cle === 'v' ? x.vwap : x.bandes[cle] })).filter(p => p.value != null)); S.seriesVwap.push(s); };
      mk('v', couleur, 2, 0); for (const k of bandes) { mk('+' + k, couleur + (k === 1 ? '99' : '55'), 1, 2); mk('-' + k, couleur + (k === 1 ? '99' : '55'), 1, 2); }
    };
    if (opts.vwap) { ajouterVwap(indexAncrePeriode(B, 'semaine'), '#8fd0e3', [1], 'VWAP sem.'); ajouterVwap(indexAncrePeriode(B, 'mois'), '#c9b27a', [1], 'VWAP mois'); }
    for (const t of lireLS(CLE.ancres(S.actif, S.unite), [])) { const i = B.findIndex(b => b.t >= t); if (i >= 0) ajouterVwap(i, '#e8a85a', [1, 2], 'VWAP ancré'); }
    if (opts.nus) for (const periode of ['semaine', 'mois']) for (const n of pocsNus(B, periode, { max: 3 })) S.lignes.push(sBou.createPriceLine({ price: n.prix, color: periode === 'mois' ? 'rgba(201,178,122,.8)' : 'rgba(143,208,227,.75)', lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: 'POC nu ' + (periode === 'mois' ? 'mois' : 'sem.') + ' ' + prix(S.actif, n.prix) }));
    S.niveaux = []; if (S.unite !== 'H1' || opts.niveaux) { const N = niveauxVolume(B, { max: 5 }); S.niveaux = N.niveaux; S.niveauxAtr = N.atr; if (opts.niveaux && S.unite !== 'H1') for (const n of N.niveaux) S.lignes.push(sBou.createPriceLine({ price: n.prix, color: n.cote === 'resistance' ? 'rgba(216,106,106,.75)' : 'rgba(95,184,148,.75)', lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: (n.cote === 'resistance' ? 'Rés. volume ' : 'Sup. volume ') + 'force ' + nf(n.force, 1) })); }
    if (opts.murs && S.book) for (const m of murs(S.book)) S.lignes.push(sBou.createPriceLine({ price: m.prix, color: m.cote === 'achat' ? 'rgba(95,184,148,.55)' : 'rgba(216,106,106,.55)', lineWidth: 1, lineStyle: 3, axisLabelVisible: false, title: 'Mur ' + (m.cote === 'achat' ? 'achat ' : 'vente ') + compact(m.qte) }));
    for (const s of S.seriesDessins) { try { chart.removeSeries(s); } catch (e) { /* déjà retirée */ } } S.seriesDessins = [];
    if (opts.dessins) tracerDessins();
    calculerFleches();
  }
  function tracerDessins() {
    let L = []; try { L = visibles(lireDessins(S.actif)); } catch (e) { return; }
    const ligneP = (p, coul, titre) => S.lignes.push(sBou.createPriceLine({ price: p, color: coul, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: titre }));
    for (const o of L) {
      if (o.type === 'horizontale') ligneP(o.p, o.couleur, 'Ligne');
      else if (o.type === 'boite') { ligneP(o.haut, o.couleur, 'Boîte'); ligneP(o.bas, o.couleur, ''); }
      else if (o.type === 'tendance') { const s = chart.addSeries(LW.LineSeries, { color: o.couleur, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0); s.setData([{ time: temps(o.t1), value: o.p1 }, { time: temps(o.t2), value: o.p2 }]); S.seriesDessins.push(s); }
      else if (o.type === 'fibo') { const A = o.p1, Bp = o.p2, ret = r => Bp - (Bp - A) * r; for (const [r, t] of [[0.5, '0,5'], [0.618, '0,618'], [0.705, '0,705'], [0.382, '0,382']]) ligneP(ret(r), o.couleur, 'Fib ' + t); }
    }
  }
  /* flèches : Volume (à la clôture) + MA200 ; la dernière bougie n'est jamais évaluée tant qu'elle n'est pas close */
  function calculerFleches() {
    const B = S.bars, now = Date.now(), pas = PAS_UNITE[S.unite], closes = B.filter(b => b.t + pas <= now);
    S.fleches = closes.length >= 80 ? flechesVolume(closes, { unite: S.unite }) : [];
    let ma = []; try { if (closes.length >= 205 && opts.ma200) ma = analyserUnite(closes, S.unite === 'H1' ? 'H1' : S.unite, { maintenant: now }).fleches; } catch (e) { ma = []; } S.flechesMA = ma;
    const M = [];
    if (opts.fleches) for (const f of S.fleches) if (types[f.type] !== false || true) M.push({ time: temps(f.t), position: f.dir > 0 ? 'belowBar' : 'aboveBar', color: f.dir > 0 ? '#4fd18b' : '#ef5f5f', shape: f.dir > 0 ? 'arrowUp' : 'arrowDown', size: 1, id: 'v' + f.type + f.t });
    if (opts.ma200) for (const f of ma) { const st = styleFleche(f), b = closes[f.iH4]; if (b) M.push({ time: temps(b.t), position: st.position, color: st.couleur, shape: st.forme, size: st.taille, id: 'm' + f.type + b.t }); }
    M.sort((a, b) => a.time - b.time); try { if (!marqueurs) marqueurs = LW.createSeriesMarkers(sBou, M); else marqueurs.setMarkers(M); } catch (e) { /* marqueurs absents */ }
    annoncer();
  }
  /* annonce vocale + notification + Telegram : seulement les NOUVELLES flèches Volume de moins de 36 h ; le premier calcul sur l'appareil enregistre tout comme déjà vu */
  function annoncer() {
    const cle = CLE.reg(S.actif, S.unite), reg = lireLS(cle, null), vus = new Set(reg || []), ids = S.fleches.map(f => f.type + '|' + f.t + '|' + f.dir), maintenant = Date.now();
    if (reg == null) { ecrireLS(cle, ids); return; }
    const neuves = S.fleches.filter(f => !vus.has(f.type + '|' + f.t + '|' + f.dir) && maintenant - f.tFin < 36 * 3600e3 && f.tFin <= maintenant);
    if (!neuves.length && ids.length === vus.size) return; ecrireLS(cle, [...new Set([...vus, ...ids])].slice(-400));
    for (const f of neuves.slice(0, 2)) {
      if (types[f.type] === false) continue; const txt = `${parId[S.actif].nom} : ${f.libelle}`;
      try { parler(txt); } catch (e) { /* voix absente */ } try { if (T.notifier) T.notifier(txt, { niveau: 'info', dit: false, raison: 'flèche Volume' }); } catch (e) { /* ignoré */ }
      try { if (T.envoyerTelegram) T.envoyerTelegram(`${txt} · lecture seule, aucun ordre n’est passé`); } catch (e) { /* ignoré */ }
    }
  }
  function montrerInfoFleche(tMs, point) {
    const f = S.fleches.find(x => x.t === tMs), g = S.flechesMA.find(x => (S.bars.filter(b => b.t + PAS_UNITE[S.unite] <= Date.now())[x.iH4] || {}).t === tMs), boite = $('[data-info]');
    const txt = f ? f.libelle : g ? `${g.type === 'cassure' ? 'Cassure' : 'Rebond'} MA200 ${NOM_U[S.unite]}` : null; if (!txt) { boite.hidden = true; return; }
    boite.textContent = txt; boite.hidden = false; boite.style.left = Math.min(Math.max(8, (point ? point.x : 20) - 20), zoneGraph.clientWidth - 280) + 'px'; boite.style.top = Math.max(8, (point ? point.y : 40) + 18) + 'px'; clearTimeout(S.infoT); S.infoT = setTimeout(() => { boite.hidden = true; }, 6000);
  }
  function ancrerEn(tMs) {
    const cle = CLE.ancres(S.actif, S.unite), L = lireLS(cle, []); const b = S.bars.find(x => x.t >= tMs); if (!b) return; if (!L.includes(b.t)) L.push(b.t); ecrireLS(cle, L.slice(-6)); S.modeAncre = false; $('[data-ancrer]').setAttribute('aria-pressed', 'false'); zoneGraph.classList.remove('tpv-ancre'); calculerAnnexes(); parler('VWAP ancré sur cette bougie.');
  }

  /* ───── panneau de droite : carnet, déséquilibre, murs, gros flux ───── */
  let rafDroite = 0; const majDroite = () => { if (!rafDroite) rafDroite = requestAnimationFrame(() => { rafDroite = 0; dessinerDroite(); }); };
  function dessinerDroite() {
    const a = parId[S.actif]; let h = '';
    if (!a.carnet) {
      const P = S.prof, rows = P ? [...P.bins].sort((x, y) => y.v - x.v).slice(0, 12).sort((x, y) => y.p - x.p) : [], mx = rows.length ? Math.max(...rows.map(r => r.v)) : 1;
      h = `<h4>Carnet</h4><p class="tpv-doux">Carnet non disponible gratuitement pour cet actif (${esc(a.nom)}). À la place : le volume par niveau de prix de la zone visible.</p><h4>Volume par niveau de prix</h4><div class="tpv-lad">${rows.map(r => `<div class="tpv-ligne"><i style="width:${Math.round(100 * r.v / mx)}%"></i><span>${prix(S.actif, r.p)}</span><b>${compact(r.v)}</b></div>`).join('') || '<p class="tpv-doux">—</p>'}</div>`;
    } else {
      const bk = S.book, e = S.etatFlux[S.parSource || opts.carnetSource] || S.etatFlux.Binance || {};
      if (!bk) h = `<h4>Carnet ${esc(opts.carnetSource)}</h4><p class="tpv-doux">${e.etat === 'erreur' ? 'Flux injoignable : ' + esc(e.raison || '') : 'Connexion au carnet…'}</p>`;
      else {
        const n = 12, A = bk.asks.slice(0, n).reverse(), Bd = bk.bids.slice(0, n), mx = Math.max(...A.map(x => x[1]), ...Bd.map(x => x[1]), 1), M = new Map(murs(bk).map(m => [m.prix, m])), d10 = desequilibre(bk, 10), d25 = desequilibre(bk, 25);
        const li = (x, c) => `<div class="tpv-ligne ${c}${M.has(x[0]) ? ' tpv-mur' : ''}"><i style="width:${Math.round(100 * x[1] / mx)}%"></i><span>${prix(S.actif, x[0])}</span><b>${compact(x[1])}</b></div>`;
        const jauge = (d, nom) => d ? `<div class="tpv-jauge" title="${nom} niveaux : acheteurs ${compact(d.acheteurs)} · vendeurs ${compact(d.vendeurs)}"><span>${nom}</span><i><u style="width:${Math.round(d.part * 100)}%"></u></i><b class="${d.ratio >= 0 ? 'tpv-h' : 'tpv-b'}">${d.ratio >= 0 ? '+' : '−'}${nf(Math.abs(d.ratio) * 100, 0)} %</b></div>` : '';
        h = `<h4>Carnet ${esc(opts.carnetSource)} <small>${esc(ageDonnee(bk.t))}</small></h4>${jauge(d10, '10')}${jauge(d25, '25')}<div class="tpv-lad">${A.map(x => li(x, 'tpv-ask')).join('')}<div class="tpv-mid">${prix(S.actif, (bk.asks[0][0] + bk.bids[0][0]) / 2)}</div>${Bd.map(x => li(x, 'tpv-bid')).join('')}</div>${M.size ? `<p class="tpv-doux">Murs (≥ 4 × la médiane) : ${[...M.values()].slice(0, 4).map(m => `${m.cote === 'achat' ? 'achat' : 'vente'} ${prix(S.actif, m.prix)} (${compact(m.qte)})`).join(' · ')}</p>` : ''}`;
      }
      const g = S.gros.liste().slice(0, 10); h += `<h4>Gros flux <small>${g.length ? 'seuil ≈ ' + compact(g[0].seuil) : 'en attente'}</small></h4><div class="tpv-flux">${g.map(x => `<div class="${x.cote === 'achat' ? 'tpv-h' : 'tpv-b'}"><span>${tH.format(new Date(x.t))}</span><b>${x.cote === 'achat' ? 'ACHAT' : 'VENTE'}</b><span>${compact(x.qte)} @ ${prix(S.actif, x.prix)}</span></div>`).join('') || '<p class="tpv-doux">Aucune grosse transaction pour le moment.</p>'}</div>`;
    }
    const N = S.niveaux; h += `<h4>Supports / résistances (volume)</h4>${N.length ? `<ul class="tpv-niv">${N.map(n => `<li class="${n.cote === 'resistance' ? 'tpv-b' : 'tpv-h'}"><b>${prix(S.actif, n.prix)}</b> <small>${n.cote === 'resistance' ? 'résistance' : 'support'} · force ${nf(n.force, 1)} · ${n.reactions} réactions · ${esc(n.sources.slice(0, 3).join(', '))}</small></li>`).join('')}</ul>` : '<p class="tpv-doux">Pas assez de bougies.</p>'}`;
    const F = S.fleches.slice(-4).reverse(); h += `<h4>Dernières flèches</h4>${F.length ? `<ul class="tpv-niv">${F.map(f => `<li class="${f.dir > 0 ? 'tpv-h' : 'tpv-b'}">${f.dir > 0 ? '▲' : '▼'} ${esc(f.libelle)} <small>${tFr.format(new Date(f.t))}</small></li>`).join('')}</ul>` : '<p class="tpv-doux">Aucune flèche Volume pour le moment (clôtures seulement).</p>'}`;
    zoneDroite.innerHTML = h;
  }
  const majPanneauNiveauxTexte = () => { if (!S.charge) return; majDroite(); };

  /* ───── badge, note, état ───── */
  function majBadge() {
    const a = parId[S.actif], d = S.donnees; $('[data-badge]').textContent = badgeSource(a, S.donnees ? S.donnees.source : 'reel') + (d ? ' · ' + ageDonnee(d.t) : '');
    const flux = Object.entries(S.etatFlux).map(([n, e]) => `${n} : ${e.etat === 'connecte' ? 'en direct' : e.etat === 'erreur' ? 'injoignable' : e.etat}`).join(' · ');
    $('[data-note]').innerHTML = esc(`${NOM_U[S.unite]} · ${S.bars.length} bougies. ${a.live ? '' : 'Pas de flux direct gratuit pour cet actif : données différées (' + ageDonnee(d && d.t) + '). '}${flux ? 'Flux : ' + flux + '. ' : ''}`) + 'Delta ' + (d && d.deltaReel ? 'réel (côté de l’agresseur).' : 'estimé depuis la bougie (le volume de cette source n’a pas de côté).') + ' Lecture seule : aucun ordre. L’historique de transactions gratuit est court : l’empreinte n’existe que pour les bougies vues en direct.';
    $('[data-ligne-source-volume]').hidden = S.actif !== 'or';
  }

  /* ───── flux en direct ───── */
  let fluxB = null, fluxK = null, kline = null;
  function arreterFlux() { for (const f of [fluxB, fluxK]) try { f && f.fermer(); } catch (e) { /* déjà fermé */ } fluxB = fluxK = null; S.etatFlux = {}; S.book = null; S.chaleur.vider(); S.gros = creerFlux(); S.emp.effacer(); }
  function demarrerFlux() {
    arreterFlux(); const a = parId[S.actif]; if (!a.live || !S.ouvert) { majBadge(); return; }
    const pas = pasEmpreinte(S.bars.length ? S.bars[S.bars.length - 1].c : 1); S.emp = creerEmpreinte({ pas }); const iv = { H1: '1h', H4: '4h', J: '1d' }[S.unite], durable = opts.carnetSource, sur = (src, m) => {
      if (!m) return;
      if (m.type === 'carnet') { if (src !== opts.carnetSource) return; S.book = m; S.chaleur.ajouter(m); majDroite(); couche && couche.req && couche.req(); }
      else if (m.type === 'trade') {
        if (src !== opts.carnetSource) return; const pasB = PAS_UNITE[S.unite], tb = Math.floor(m.t / PAS_UNITE.H1) * PAS_UNITE.H1; S.emp.ajouter(tb, m.prix, m.qte, m.cote); if (S.gros.ajouter(m, seuilGrosses)) majDroite();
      } else if (m.type === 'bougie' && src === 'Binance' && m.intervalle === iv) mettreAJourBougie(m.bougie, m.close);
    };
    const u = urlBinance(S.actif, iv); if (u) fluxB = ouvrirFlux(u, { surMessage: msg => sur('Binance', parseBinance(msg)), surEtat: e => { S.etatFlux.Binance = e; majBadge(); } });
    const abo = abonnementKraken(S.actif); if (abo.length && durable === 'Kraken') { S.krakenBook = creerCarnetKraken(); fluxK = ouvrirFlux(KRAKEN_WS, { abonner: ws => abo.forEach(x => ws.send(JSON.stringify(x))), surMessage: msg => { sur('Kraken', S.krakenBook.appliquer(msg)); sur('Kraken', parseKrakenTrade(msg)); }, surEtat: e => { S.etatFlux.Kraken = e; majBadge(); } }); }
  }
  function mettreAJourBougie(b, close) {
    if (!S.bars.length) return; const dern = S.bars[S.bars.length - 1];
    if (b.t === dern.t) { Object.assign(dern, b); sBou.update({ time: temps(b.t), open: b.o, high: b.h, low: b.l, close: b.c }); const d = deltaBarre(dern); sVol.update({ time: temps(b.t), value: b.v, color: d >= 0 ? 'rgba(95,184,148,.6)' : 'rgba(216,106,106,.6)' }); }
    else if (b.t > dern.t) { S.bars.push({ ...b }); sBou.update({ time: temps(b.t), open: b.o, high: b.h, low: b.l, close: b.c }); sVol.update({ time: temps(b.t), value: b.v, color: 'rgba(95,184,148,.6)' }); peindre(false); return; }
    if (close) { calculerFleches(); }
    couche && couche.req && couche.req(); clearTimeout(S.tProfil); S.tProfil = setTimeout(() => { calculerProfil(); couche && couche.req && couche.req(); majDroite(); }, 800);
  }

  /* ───── chargement ───── */
  async function charger(recadrer = true) {
    const n = ++S.seq; S.charge = false; S.erreur = null; $('[data-att]').hidden = false; $('[data-att]').textContent = 'Chargement du volume ' + parId[S.actif].nom + ' ' + NOM_U[S.unite] + '…'; majBadge();
    try {
      const r = await chargerBarres(S.actif, S.unite, { source: S.actif === 'or' ? opts.sourceVolume : 'reel' }); if (n !== S.seq) return;
      S.donnees = r; S.bars = r.bougies; S.charge = true; $('[data-att]').hidden = true; creerGraphique(); peindre(recadrer); majBadge(); demarrerFlux();
    } catch (e) {
      if (n !== S.seq) return; S.erreur = String(e && e.message || e); S.bars = []; $('[data-att]').hidden = false; $('[data-att]').innerHTML = `Données de volume indisponibles : ${esc(S.erreur)} <button type="button" data-reessayer>Réessayer</button>`; zoneDroite.innerHTML = ''; majBadge();
    }
  }

  /* ───── commandes et événements ───── */
  function synchroUI() {
    $('[data-actif]').value = S.actif; $$('[data-unite]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.unite === S.unite)));
    $$('[data-opt]').forEach(c => { c.checked = !!opts[c.dataset.opt]; }); $$('[data-opt-select]').forEach(s => { s.value = opts[s.dataset.optSelect]; }); $$('[data-type]').forEach(c => { c.checked = types[c.dataset.type] !== false; });
  }
  el.addEventListener('click', ev => {
    const u = ev.target.closest('[data-unite]'); if (u) { S.unite = u.dataset.unite; ecrireLS(CLE.unite, S.unite); synchroUI(); charger(); return; }
    if (ev.target.closest('[data-reessayer]')) { charger(); return; }
    if (ev.target.closest('[data-ancrer]')) { S.modeAncre = !S.modeAncre; ev.target.closest('[data-ancrer]').setAttribute('aria-pressed', String(S.modeAncre)); zoneGraph.classList.toggle('tpv-ancre', S.modeAncre); return; }
    if (ev.target.closest('[data-effacer-vwap]')) { ecrireLS(CLE.ancres(S.actif, S.unite), []); calculerAnnexes(); return; }
    const r = ev.target.closest('[data-reglages]'); if (r) { const p = $('[data-panneau-reglages]'); p.hidden = !p.hidden; r.setAttribute('aria-expanded', String(!p.hidden)); }
  });
  el.addEventListener('change', ev => {
    const t = ev.target;
    if (t.matches('[data-actif]')) { S.actif = t.value; ecrireLS(CLE.actif, S.actif); charger(); return; }
    if (t.matches('[data-opt]')) { opts[t.dataset.opt] = t.checked; ecrireLS(CLE.opts, opts); if (t.dataset.opt === 'ma200' || t.dataset.opt === 'fleches' || t.dataset.opt === 'vwap' || t.dataset.opt === 'nus' || t.dataset.opt === 'niveaux' || t.dataset.opt === 'murs' || t.dataset.opt === 'dessins') peindre(false); else couche && couche.req && couche.req(); return; }
    if (t.matches('[data-opt-select]')) { opts[t.dataset.optSelect] = t.value; ecrireLS(CLE.opts, opts); if (t.dataset.optSelect === 'carnetSource') { S.book = null; demarrerFlux(); majDroite(); } else if (t.dataset.optSelect === 'sourceVolume') charger(); else peindre(false); return; }
    if (t.matches('[data-type]')) { types[t.dataset.type] = t.checked; ecrireLS(CLE.types, types); }
  });
  /* analyse parlée : 4 à 5 phrases (POC, zone de valeur, carnet, murs proches, dernière flèche) */
  function analyse() {
    const a = parId[S.actif]; if (!S.charge || !S.bars.length) return `Le terminal Volume de ${a.nom} n’a pas encore de données.`;
    const B = S.bars, px = B[B.length - 1].c, P = S.prof || profil(B.slice(-60)), U = NOM_U[S.unite], f = [];
    if (P) { const place = px > P.vah ? 'au-dessus de la zone de valeur' : px < P.val ? 'sous la zone de valeur' : 'dans la zone de valeur'; f.push(`${a.nom} en ${U} : le point de contrôle est à ${prix(S.actif, P.poc.prix)}, la zone de valeur va de ${prix(S.actif, P.val)} à ${prix(S.actif, P.vah)}, et le prix de ${prix(S.actif, px)} est ${place}.`); }
    if (S.book) { const d = desequilibre(S.book, 10), m = murs(S.book).filter(x => Math.abs(x.prix - px) / px < 0.01).slice(0, 2); f.push(d ? `Le carnet ${opts.carnetSource} penche ${d.ratio >= 0.1 ? 'côté acheteurs' : d.ratio <= -0.1 ? 'côté vendeurs' : 'de façon équilibrée'} (${Math.round(d.ratio * 100)} % sur dix niveaux)${m.length ? ', avec ' + m.map(x => `un mur ${x.cote === 'achat' ? 'acheteur' : 'vendeur'} à ${prix(S.actif, x.prix)}`).join(' et ') : ', sans mur proche'}.` : ''); }
    else if (!a.carnet) f.push('Il n’y a pas de carnet gratuit pour cet actif : je m’appuie sur le volume par niveau de prix.');
    const nn = S.niveaux[0]; if (nn) f.push(`Le niveau de volume le plus fort est ${nn.cote === 'resistance' ? 'une résistance' : 'un support'} à ${prix(S.actif, nn.prix)}.`);
    const l = S.fleches[S.fleches.length - 1]; f.push(l ? `Dernière flèche : ${l.libelle}.` : 'Aucune flèche Volume récente.');
    return f.filter(Boolean).join(' ');
  }
  const pocsNusTexte = () => { const L = ['semaine', 'mois'].flatMap(p => pocsNus(S.bars, p, { max: 3 }).map(n => ({ ...n, p }))); opts.nus = true; ecrireLS(CLE.opts, opts); synchroUI(); calculerAnnexes(); return L.length ? 'POC nus : ' + L.map(n => `${prix(S.actif, n.prix)} (${n.p})`).join(', ') + '.' : 'Aucun POC nu sur cette période.'; };
  function ouvrirMode(o, { actif, unite } = {}) {
    S.ouvert = o; el.hidden = !o; document.documentElement.classList.toggle('tpv-actif', !!o);
    if (o) { if (actif && parId[actif]) { S.actif = actif; ecrireLS(CLE.actif, actif); } if (unite && UNITES_VOLUME.includes(unite)) { S.unite = unite; ecrireLS(CLE.unite, unite); } synchroUI(); if (!S.charge || (actif && S.donnees == null)) charger(); else { demarrerFlux(); majBadge(); peindre(false); } }
    else arreterFlux();
  }
  synchroUI(); majBadge();
  return { ouvrir: ouvrirMode, fermer: () => ouvrirMode(false), estOuvert: () => S.ouvert, analyse, pocsNus: pocsNusTexte, ancrer: () => { S.modeAncre = true; $('[data-ancrer]').setAttribute('aria-pressed', 'true'); zoneGraph.classList.add('tpv-ancre'); return 'Touche la bougie où ancrer le VWAP.'; },
    ancrerDerniere: () => { if (S.bars.length) ancrerEn(S.bars[S.bars.length - 1].t); return 'VWAP ancré sur la dernière bougie.'; }, definir: ({ actif, unite }) => { if (actif && parId[actif]) { S.actif = actif; ecrireLS(CLE.actif, actif); } if (unite && UNITES_VOLUME.includes(unite)) { S.unite = unite; ecrireLS(CLE.unite, unite); } synchroUI(); return charger(); },
    etat: () => ({ ouvert: S.ouvert, actif: S.actif, unite: S.unite, bougies: S.bars.length, charge: S.charge, erreur: S.erreur, poc: S.prof && S.prof.poc.prix, val: S.prof && S.prof.val, vah: S.prof && S.prof.vah, hvn: S.prof ? S.prof.hvn.length : 0, niveaux: S.niveaux.length, fleches: S.fleches.length, flechesMA: S.flechesMA.length, deltaReel: S.donnees && S.donnees.deltaReel, source: S.donnees && S.donnees.source,
      flux: Object.fromEntries(Object.entries(S.etatFlux).map(([k, v]) => [k, v.etat])), carnet: !!S.book, murs: S.book ? murs(S.book).length : 0, gros: S.gros.liste().length, badge: $('[data-badge]').textContent, empreintes: S.emp.nBougies(), panneaux: chart ? chart.panes().length : 0, lignes: S.lignes.length, series: S.seriesVwap.length }) };
}
