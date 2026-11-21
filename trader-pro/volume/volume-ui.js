/* ═════════════ MODE VOLUME : INTERFACE (v4) ═════════════
   Un terminal complet centré sur le volume : graphique (bougies, profil de volume de la zone visible avec POC / zone de valeur / HVN / LVN, VWAP ancrés et bandes, POC nus, MA200 et ses flèches,
   mes dessins), volume et delta au zoom (empreinte à fort zoom en H1 sur l'or et les cryptos quand les transactions sont disponibles), panneau Volume + delta + CVD, panneau MFI (ou RVOL),
   carnet d'ordres vivant (échelle, déséquilibre, murs, carte de chaleur, gros flux), supports / résistances par le volume (3 à 5), flèches Volume à la clôture.
   Lecture seule : aucun ordre. Chaque volume affiche sa source et son âge. Les calculs sont dans volume-calcul.js (pur, testé). */
import { esc, nf, lireLS, ecrireLS, alertesParWorker } from '../commun/ui.js';
import { chargerLib } from '../../agent-trading/front/graphique.js';
import { creerEchelles } from '../commun/echelles.js';
import { analyserUnite, styleFleche } from '../terminal/ma200-h4.js';
import { lireDessins } from '../terminal/dessins-stockage.js';
import { visibles } from '../terminal/dessins-fusion.js';
import { profil, vwapAncre, indexAncrePeriode, pocsNus, mfi, divergencesMfi, serieDelta, cvd, deltaReel, volumeRelatif, niveauxVolume, flechesVolume, desequilibre, murs, seuilGrosses, deltaBarre, TYPES_FLECHES_VOLUME } from './volume-calcul.js';
import { ACTIFS_VOLUME, parId, UNITES_VOLUME, PAS_UNITE, chargerBarres, badgeSource, ageDonnee } from './volume-donnees.js';
import { ouvrir as ouvrirFlux, parseBinance, creerCarnetKraken, parseKrakenTrade, creerChaleur, creerFlux, urlsBinance, abonnementKraken, KRAKEN_WS, SYMBOLES_LIVE } from './volume-live.js';
import { niveauxReaction, etiquetteNiveau, niveauProche, phraseNiveaux } from './reaction-calcul.js';
import { creerStoreFootprint, creerLive, creerRattrapage, TEXTE_ABSENT } from './footprint-donnees.js';
import { histoLong } from '../terminal/histo-long.js';
import { raccorder, controler, verifierRaccord, resume as resumeControle } from '../commun/serie-continue.js';
import { noterIncident, noterPrix } from '../commun/incidents-donnees.js';
import { dessiner as dessinerFootprint, infoCase, COULEUR_REACTION } from './footprint-rendu.js';
import { PALETTE, PRESETS, NOM_PRESETS, appliquerPreset } from './palette.js';
import { profilDe, PROFILS } from './profils-actifs.js';
import { creerSuiviGros, creerHistoDeseq, fusionnerCarnets, PALIER_DEFAUT } from './carnet-calcul.js';
import { creerEtiquettesAxe, creerZones } from './etiquettes-axe.js';
import { construire as construireIct, etiquettesAxe as etiqIct, ICT_DEFAUT } from './ict-affichage.js';
import { atrDaily, sessions as sessionsH1 } from './ict-calcul.js';
import { monterPanneau } from './panneau-droite.js';

const FIN_FOOTPRINT = { or: 0.5, btc: 5, sol: 0.05 };   // case la plus fine de l'archive (outils-donnees/footprint-historique.mjs) : le direct s'y aligne

const CLE = { actif: 'rayle_tpv_actif', unite: 'rayle_tpv_unite', opts: a => `rayle_tpv_opts6_${a}`, types: 'rayle_tpv_types', reg: (a, u) => `rayle_tpv_reg_${a}_${u}`, ancres: (a, u) => `rayle_tpv_ancres_${a}_${u}` };
const OPTS_DEFAUT = { ...PRESETS.epure, preset: 'epure', empMode: 'bidask', log: false, pVol: true, pCvd: true, pMfi: true, mfiMode: 'mfi', carnetSource: 'Binance', sourceVolume: 'reel', ict: { ...ICT_DEFAUT } };
const NOM_U = { H1: 'H1', H4: 'H4', J: 'Daily' };
const NOM_PARLE = { or: 'l’or', btc: 'le Bitcoin', sol: 'Solana', us100: 'le Nasdaq 100', us500: 'le S&P 500', eurusd: 'l’EUR/USD', usdchf: 'l’USD/CHF', dxy: 'l’indice dollar' };
const COUL = { haut: PALETTE.haut, bas: PALETTE.bas, sable: '#c9b27a', bleu: PALETTE.vwap, ma: PALETTE.or, texte: PALETTE.texte, doux: PALETTE.doux };
const tFr = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const tJ = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: 'short' });
const tH = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false });
const compact = v => { const a = Math.abs(v); return a >= 1e9 ? nf(v / 1e9, 1) + ' G' : a >= 1e6 ? nf(v / 1e6, 1) + ' M' : a >= 1e3 ? nf(v / 1e3, 1) + ' k' : nf(v, a >= 100 ? 0 : 1); };
const sgn = v => (v >= 0 ? '+' : '−') + compact(Math.abs(v));
const dec = a => parId[a].decimales;
const prix = (a, p) => nf(p, dec(a));

export async function monterVolume({ racine, T = {}, parler = () => {}, idDefaut = 'or', unite0 = 'H4', surClassique = () => {} } = {}) {
  const LW = await chargerLib();
  const actif0 = parId[lireLS(CLE.actif, idDefaut)] ? lireLS(CLE.actif, idDefaut) : idDefaut;
  const opts = { ...OPTS_DEFAUT, ...lireLS(CLE.opts(actif0), {}) };
  const optsPourActif = a => { for (const k of Object.keys(opts)) delete opts[k]; Object.assign(opts, { ...OPTS_DEFAUT, ...lireLS(CLE.opts(a), {}) }); };
  let sauverOpts = () => {};
  const types = { 'vol-absorption': true, 'vol-cassure': true, 'vol-faux': true, ...lireLS(CLE.types, {}) };
  const S = { actif: parId[lireLS(CLE.actif, idDefaut)] ? lireLS(CLE.actif, idDefaut) : idDefaut, unite: UNITES_VOLUME.includes(lireLS(CLE.unite, unite0)) ? lireLS(CLE.unite, unite0) : unite0, bars: [], donnees: null, erreur: null, charge: false, seq: 0,
    prof: null, niveaux: [], fleches: [], flechesMA: [], book: null, gros: creerFlux(), live: null, fp: null, reaction: [], reactionAtr: null, zonesEmp: new Map(), chaleur: creerChaleur(), etatFlux: {}, modeAncre: false, lignes: [], seriesVwap: [], seriesDessins: [], info: null, flux: [], krakenBook: creerCarnetKraken(), ouvert: false, cache: new Map(), etiqAnnexes: [], lignesIct: [], lignesGros: [], suiviGros: creerSuiviGros(), histoDeseq: creerHistoDeseq(), bookProfond: null, bookAff: null, etiq: [], ict: null, barresJ: null, barresH1: null };
  sauverOpts = () => ecrireLS(CLE.opts(S.actif), opts);

  /* ───── DOM ───── */
  const el = document.createElement('section'); el.className = 'tpv'; el.hidden = true; el.setAttribute('aria-label', 'Terminal Volume');
  el.innerHTML = `<div class="tpv-barre">
      <select data-actif aria-label="Actif">${ACTIFS_VOLUME.map(a => `<option value="${a.id}">${esc(a.nom)}</option>`).join('')}</select>
      <div class="tpv-unites" role="group" aria-label="Unité">${UNITES_VOLUME.map(u => `<button type="button" data-unite="${u}">${NOM_U[u]}</button>`).join('')}</div>
      <span class="tpv-profil" data-profil title="Profil de l’actif : décide de ce qui est affiché"></span>
      <button type="button" data-fp aria-pressed="false" title="Empreinte (footprint) dans les bougies, quand elles sont assez larges">Footprint</button>
      <span class="tpv-badge" data-badge role="status" tabindex="0" title="Touche pour les détails"></span>
      <span class="tpv-vide"></span>
      <button type="button" data-ancrer title="Touche ensuite une bougie : un VWAP s’y ancre (bandes ±1 et ±2 écarts-types)">Ancrer VWAP</button>
      <button type="button" data-effacer-vwap title="Retire mes VWAP ancrés">Effacer</button>
      <button type="button" data-reglages aria-expanded="false">Calques</button>
      <div class="tp-mode tpv-mode" role="group" aria-label="Mode du terminal"><button type="button" data-vers-classique>Classique</button><button type="button" aria-pressed="true">Volume</button></div></div>
    <div class="tpv-reglages" data-panneau-reglages hidden>
      <label class="tpv-preset">Préréglage <select data-preset>${Object.entries(NOM_PRESETS).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}<option value="perso">Personnalisé</option></select></label>
      ${[['profil', 'Profil de volume (20 % max.)'], ['poc', 'POC, VAH, VAL (axe des prix)'], ['vwap', 'VWAP semaine + ancré'], ['bandesVwap', 'Bandes VWAP ±1σ ±2σ'], ['nus', 'POC nus'], ['reaction', 'Niveaux de réaction (3 plus forts, près du prix)'], ['log', 'Échelle logarithmique des prix'], ['niveaux', 'Supports / résistances (volume)'], ['murs', 'Murs du carnet'], ['chaleur', 'Carte de chaleur du carnet'], ['empreinte', 'Empreinte (au zoom)'], ['vd', 'Volume / delta au-dessus des bougies'], ['dessins', 'Mes dessins'], ['pVol', 'Panneau Volume'], ['pCvd', 'CVD'], ['pMfi', 'Panneau MFI / RVOL'], ['fleches', 'Flèches Volume'], ['ma200', 'MA200 et flèches'], ['ictPrincipal', 'Repères ICT sur le graphique'], ['sessions', 'Sessions (H1 : indices, forex)']].map(([k, n]) => `<label data-calque="${k}"><input type="checkbox" data-opt="${k}"> ${n}</label>`).join('')}
      <label>Empreinte (affichage au zoom) <select data-opt-select="empMode"><option value="bidask">Vendeurs × acheteurs (bid × ask)</option><option value="delta">Delta par niveau</option><option value="volume">Volume seul (profil dans la bougie)</option></select></label>
      <label>Panneau du bas <select data-opt-select="mfiMode"><option value="mfi">MFI 14 (RSI du volume)</option><option value="rvol">Volume relatif (RVOL)</option></select></label>
      <label>Carnet et gros flux <select data-opt-select="carnetSource"><option>Binance</option><option>Kraken</option></select></label>
      <label data-ligne-source-volume>Volume de l’or <select data-opt-select="sourceVolume"><option value="reel">Perpétuel Binance (réel)</option><option value="ref">Futures COMEX GC (institutionnel)</option></select></label>
      <fieldset><legend>Alertes des flèches Volume</legend>${TYPES_FLECHES_VOLUME.map(t => `<label><input type="checkbox" data-type="${t.id}"> ${esc(t.nom)}</label>`).join('')}</fieldset></div>
    <div class="tpv-corps"><div class="tpv-graph" data-graph><div class="tpv-legende" data-legende aria-live="off"></div><button type="button" class="tpv-temps-reel" data-temps-reel title="Revenir à la dernière bougie" hidden>»</button><div class="tpv-info" data-info hidden></div><p class="tpv-att" data-att role="status">Chargement…</p></div>
      <aside class="tpv-droite" data-droite aria-label="Panneau de droite : carnet, repères ICT, bougie du jour"></aside></div>
    <p class="tpv-note" data-note></p>`;
  racine.appendChild(el);
  const $ = s => el.querySelector(s), $$ = s => [...el.querySelectorAll(s)];
  const zoneGraph = $('[data-graph]'), zoneDroite = $('[data-droite]');

  /* ───── graphique ───── */
  let etiqAxe = null, zonesPrinc = null, chart = null, sBou = null, sVol = null, sMoy = null, sCvd = null, sMfi = null, sRv = null, sMa = null, marqueurs = null, couche = null, sauteRange = false, tempsProfil = 0;
  const temps = t => Math.floor(t / 1000);
  /* pendant l'empreinte, l'échelle des prix suit les bougies seulement (MA200 et VWAP, souvent loin du prix, écraseraient les cases) */
  const horsEchelleFp = original => (S.bougiesFp ? null : original());
  function creerGraphique() {
    if (chart) return;   // un seul graphique pour toute la vie du mode : le recréer à chaque changement d'actif ou d'unité provoque des erreurs « Object is disposed » de Lightweight Charts
    const hote = document.createElement('div'); hote.className = 'tpv-lw'; zoneGraph.appendChild(hote);
    chart = LW.createChart(hote, { autoSize: true, layout: { background: { type: 'solid', color: '#000' }, textColor: COUL.texte, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11, panes: { separatorColor: '#1a232b', separatorHoverColor: '#2b3a46' }, attributionLogo: true },
      grid: { vertLines: { color: '#0b1116' }, horzLines: { color: '#0b1116' } }, rightPriceScale: { borderColor: '#1a232b', scaleMargins: { top: 0.06, bottom: 0.06 } }, leftPriceScale: { visible: false, borderColor: '#1a232b' },
      timeScale: { borderColor: '#1a232b', rightOffset: 12, barSpacing: 9, minBarSpacing: 1.5, timeVisible: true, tickMarkFormatter: (t, type) => { const d = new Date(t * 1000); return type >= 3 ? tH.format(d) : tJ.format(d); } },
      localization: { timeFormatter: t => tFr.format(new Date(t * 1000)) }, crosshair: { mode: 0 }, handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true }, kineticScroll: { mouse: false, touch: true }, handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true } });
    sBou = chart.addSeries(LW.CandlestickSeries, { upColor: COUL.haut, downColor: COUL.bas, wickUpColor: COUL.haut, wickDownColor: COUL.bas, borderVisible: false, priceLineVisible: true }, 0);
    sMa = chart.addSeries(LW.LineSeries, { color: COUL.ma, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: 'MA200', autoscaleInfoProvider: horsEchelleFp }, 0);
    sVol = chart.addSeries(LW.HistogramSeries, { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false, autoscaleInfoProvider: () => echelleVolume() }, 1);
    sMoy = chart.addSeries(LW.LineSeries, { color: 'rgba(241,211,79,.7)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => echelleVolume() }, 1);
    sCvd = chart.addSeries(LW.LineSeries, { color: COUL.bleu, lineWidth: 1, priceScaleId: 'left', priceLineVisible: false, lastValueVisible: true, title: 'CVD' }, 1);
    chart.priceScale('left', 1).applyOptions({ visible: true, borderColor: '#1a232b' });
    sMfi = chart.addSeries(LW.LineSeries, { color: COUL.sable, lineWidth: 1, priceLineVisible: false, title: 'MFI' }, 2);
    sRv = chart.addSeries(LW.HistogramSeries, { priceFormat: { type: 'price', precision: 1, minMove: 0.1 }, priceLineVisible: false, lastValueVisible: false, title: 'RVOL' }, 2);
    try { const P = chart.panes(); P[0].setStretchFactor(6); P[1].setStretchFactor(2); P[2].setStretchFactor(2); } catch (e) { /* version sans panneaux ajustables */ }
    couche = creerCouche(); sBou.attachPrimitive(couche); zonesPrinc = creerZones(); sBou.attachPrimitive(zonesPrinc); etiqAxe = creerEtiquettesAxe(); sBou.attachPrimitive(etiqAxe);
    try { S.ech = creerEchelles({ chart, serie: sBou, hote: zoneGraph, LW, panneau: 0, journalInitial: !!opts.log, surChange: () => { couche && couche.req && couche.req(); } }); } catch (e) { console.warn('[tpv] échelles indisponibles :', e && e.message || e); }
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => { majTempsReel(); if (sauteRange) return; clearTimeout(tempsProfil); tempsProfil = setTimeout(() => { calculerProfil(); couche && couche.req && couche.req(); }, 60); });
    chart.subscribeClick(p => { if (!p || p.time == null) return; if (S.modeAncre) { ancrerEn(p.time * 1000); return; } if (infoSurCase(p.point, p.time * 1000, true)) return; montrerInfoFleche(p.time * 1000, p.point); });
    chart.subscribeCrosshairMove(p => { legende(p && p.time != null ? p.time * 1000 : null); const boite = $('[data-info]'); if (!p || p.time == null || !p.point) { if (S.survol) { S.survol = false; boite.hidden = true; } return; } if (S.modeAncre) return; if (infoSurCase(p.point, p.time * 1000, false)) S.survol = true; else if (S.survol) { S.survol = false; boite.hidden = true; } });
  }

  /* ───── légende OHLC + volume + delta (suit le curseur, sinon dernière bougie) et bouton « » » (retour à la dernière bougie) ───── */
  function legende(tMs) {
    const L = $('[data-legende]'); if (!L || !S.bars.length) return; const B = S.bars; let i = B.length - 1;
    if (tMs != null) { let lo = 0, hi = B.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (B[m].t <= tMs) lo = m; else hi = m - 1; } i = lo; }
    const b = B[i], pr = i > 0 ? B[i - 1].c : b.o, v = (b.c - pr) / pr * 100, up = b.c >= b.o, d = deltaBarre(b), cl = up ? 'tpv-h' : 'tpv-b', a = S.actif;
    L.innerHTML = `<b>${esc(parId[a].court)} · ${NOM_U[S.unite]}</b> <time>${tFr.format(new Date(b.t))}</time> <span class="${cl}">O ${prix(a, b.o)} H ${prix(a, b.h)} B ${prix(a, b.l)} C ${prix(a, b.c)} (${v >= 0 ? '+' : '−'}${nf(Math.abs(v), 2)} %)</span> ${S.donnees && S.donnees.aVolume === false ? '' : `<span>Vol ${compact(b.v || 0)}</span> <span class="${d >= 0 ? 'tpv-h' : 'tpv-b'}">Δ ${sgn(d)}${S.donnees && S.donnees.deltaReel ? '' : ' ~'}</span>`}`;
  }
  /* panneaux du bas : chacun peut être masqué ; un panneau sans série visible se réduit à un filet */
  /* v7 : échelle du panneau de volume = partie VISIBLE seulement, valeurs aberrantes écrêtées au 99e percentile (plus d'échelle « 50 B » qui écrase les barres) */
  function echelleVolume() {
    try { const r = chart && chart.timeScale().getVisibleLogicalRange(), B = S.bars; if (!r || !B.length) return null; const i0 = Math.max(0, Math.floor(r.from)), i1 = Math.min(B.length - 1, Math.ceil(r.to)); const v = []; for (let i = i0; i <= i1; i++) if (B[i].v > 0) v.push(B[i].v); if (!v.length) return null; v.sort((a, b) => a - b); const max = v[Math.min(v.length - 1, Math.floor(v.length * 0.99))] * 1.15; return { priceRange: { minValue: 0, maxValue: max } }; } catch (e) { return null; }
  }
  function appliquerPanneaux() {
    if (!chart) return; const sansVol = !!(S.donnees && S.donnees.aVolume === false), vol = opts.pVol !== false && !sansVol, cvdv = opts.pCvd !== false && !sansVol, mf = opts.pMfi !== false && !sansVol;   // v6 : sans volume (DXY, secours), les panneaux de volume sont masqués, pas affichés vides
    try { sVol.applyOptions({ visible: vol }); sMoy.applyOptions({ visible: vol }); sCvd.applyOptions({ visible: cvdv }); sMfi.applyOptions({ visible: mf }); sRv.applyOptions({ visible: mf }); const P = chart.panes(); P[1].setStretchFactor(vol || cvdv ? 2 : 0.001); P[2].setStretchFactor(mf ? 2 : 0.001); } catch (e) { /* version sans panneaux ajustables */ }
  }
  function majTempsReel() {
    const bt = $('[data-temps-reel]'); if (!bt || !chart || !S.bars.length) return; const r = chart.timeScale().getVisibleLogicalRange(); bt.hidden = !r || r.to >= S.bars.length + 1; try { const h = chart.panes()[0].getHeight(); if (h > 80) bt.style.top = (h - 44) + 'px'; } catch (e) { /* hauteur inconnue */ }
  }

  /* ───── primitive : carte de chaleur (fond), profil, volume / delta par bougie, empreinte (premier plan) ───── */
  function creerCouche() {
    const o = { req: null, attached(p) { this.req = p.requestUpdate; }, detached() { this.req = null; }, updateAllViews() { /* tout est lu au dessin */ },
      paneViews() { return [{ zOrder: () => 'bottom', renderer: () => ({ draw() { /* rien */ }, drawBackground: cible => cible.useBitmapCoordinateSpace(sc => { try { dessinerChaleur(sc); } catch (e) { /* ne casse pas le graphique */ } }) }) },
        { zOrder: () => 'top', renderer: () => ({ draw: cible => cible.useBitmapCoordinateSpace(sc => { try { dessinerSessions(sc); dessinerProfil(sc); dessinerReaction(sc); dessinerBougies(sc); } catch (e) { /* idem */ } }) }) }]; } };
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
  /* niveaux de réaction (v6) : fines zones semi-transparentes (jamais de lignes pleines ni de texte flottant) ; l'étiquette « R×4 » est sur l'axe des prix, le détail au survol de la liste de « Détails » */
  function dessinerReaction(sc) {
    if (!opts.reaction || !S.reaction.length) return; const c = sc.context, vr = sc.verticalPixelRatio, hr = sc.horizontalPixelRatio, W = sc.bitmapSize.width;
    for (const n of S.reaction) {
      const y = yDe(n.prix), yh = yDe(n.haut), yb = yDe(n.bas); if (y == null) continue; const fr = n.forceRel || 0.5, bande = yh != null && yb != null ? Math.max(3 * vr, (yb - yh) * vr) : 4 * vr, top = y * vr - bande / 2;
      c.fillStyle = `rgba(127,179,194,${(0.07 + 0.07 * fr).toFixed(3)})`; c.fillRect(0, top, W, bande); c.strokeStyle = `rgba(127,179,194,${(0.22 + 0.2 * fr).toFixed(3)})`; c.lineWidth = Math.max(1, hr * 0.8); c.beginPath(); c.moveTo(0, y * vr); c.lineTo(W, y * vr); c.stroke();
    }
  }
  /* profil de volume (v6) : à droite, semi-transparent, 20 % de la largeur au plus ; POC (blanc), VAH et VAL (gris) en traits courts, étiquetés sur l'axe (S.etiqProfil), pas de texte flottant */
  function dessinerProfil(sc) {
    const P = S.prof; if (!P || !(opts.profil || opts.poc)) return; const c = sc.context, hr = sc.horizontalPixelRatio, vr = sc.verticalPixelRatio, W = sc.bitmapSize.width, maxL = Math.min(W * 0.2, 190 * hr); let mv = 0; for (const b of P.bins) mv = Math.max(mv, b.v); if (!(mv > 0)) return;
    const xFin = W - 4 * hr;
    if (opts.profil) for (const b of P.bins) {
      const y1 = yDe(b.hi), y2 = yDe(b.lo); if (y1 == null || y2 == null) continue; const h = Math.max(1, (y2 - y1) * vr - 1), L = maxL * b.v / mv, dansVa = b.hi > P.val && b.lo < P.vah;
      c.fillStyle = dansVa ? 'rgba(200,210,218,.22)' : 'rgba(200,210,218,.10)'; c.fillRect(xFin - L, y1 * vr, L, h);
      if (Number.isFinite(b.d) && b.v > 0) { const part = Math.max(0, Math.min(1, 0.5 + 0.5 * b.d / b.v)); c.fillStyle = 'rgba(95,184,148,.30)'; c.fillRect(xFin - L, y1 * vr, L * part, h); c.fillStyle = 'rgba(216,106,106,.26)'; c.fillRect(xFin - L + L * part, y1 * vr, L * (1 - part), h); }
    }
    const trait = (p, couleur, tirets) => { const y = yDe(p); if (y == null) return; c.strokeStyle = couleur; c.lineWidth = Math.max(1, hr); c.setLineDash(tirets ? [5 * hr, 4 * hr] : []); c.beginPath(); c.moveTo(xFin - maxL - 6 * hr, y * vr); c.lineTo(xFin, y * vr); c.stroke(); c.setLineDash([]); };
    trait(P.poc.prix, PALETTE.poc, false); trait(P.vah, PALETTE.vahVal, true); trait(P.val, PALETTE.vahVal, true);
  }

  /* empreinte dans les bougies (v4.1) : le dessin est dans footprint-rendu.js ; ici l'environnement et la bascule du style des bougies natives (transparentes quand l'empreinte est affichée : corps et mèches sont redessinés en fin contour) */
  const envFootprint = () => ({ footprint: profilDe(S.actif).footprint, chart, opts, bars: S.bars, actif: S.actif, unite: S.unite, store: S.fp, live: S.live, reaction: S.reaction, xDe, yDe, rendu: S.rendu, demanderHeures: hs => { if (S.ratt) S.ratt.demander(hs); }, rattrapageEnCours: () => !!(S.ratt && (S.ratt.etat.enCours || S.ratt.fileLongueur())) });
  function dessinerBougies(sc) {
    if (!S.bars.length || !S.fp || (!opts.empreinte && !opts.vd)) { basculerBougies(false); return; }
    const env = envFootprint(), t0 = performance.now(); dessinerFootprint(sc, env); if (env.rendu) { const d = performance.now() - t0; env.rendu.ms = d; S.msMax = Math.max(S.msMax || 0, d); S.msN = (S.msN || 0) + 1; S.msSomme = (S.msSomme || 0) + d; } S.rendu = env.rendu; S.envRendu = env; collecterEmpiles(env.rendu); basculerBougies(!!(env.rendu && env.rendu.actif));
  }
  function collecterEmpiles(r) {
    if (!r || !r.lignes) return; let neuf = 0;
    for (const [t, L] of r.lignes) if (L.A && L.pas && !(L.res && L.res.partielle)) for (const z of L.A.zones) { const k = t + '|' + z.prixBas + '|' + L.pas; if (!S.zonesEmp.has(k)) { S.zonesEmp.set(k, { prixBas: z.prixBas, prixHaut: z.prixHaut + L.pas, cote: z.cote, t }); neuf++; } }
    if (S.zonesEmp.size > 500) for (const k of [...S.zonesEmp.keys()].slice(0, S.zonesEmp.size - 500)) S.zonesEmp.delete(k);
    if (neuf && opts.reaction !== false) { clearTimeout(S.tReac); S.tReac = setTimeout(() => { calculerReaction(); couche && couche.req && couche.req(); majDroite(); }, 800); }
  }
  function basculerBougies(fp) {
    if (S.bougiesFp === fp) return; S.bougiesFp = fp;
    setTimeout(() => { try { sBou.applyOptions(fp ? { upColor: 'rgba(0,0,0,0)', downColor: 'rgba(0,0,0,0)', wickUpColor: 'rgba(0,0,0,0)', wickDownColor: 'rgba(0,0,0,0)', borderVisible: false } : { upColor: COUL.haut, downColor: COUL.bas, wickUpColor: COUL.haut, wickDownColor: COUL.bas, borderVisible: false }); if (!S.ech || S.ech.estAuto()) chart.priceScale('right').applyOptions({ autoScale: true }); } catch (e) { /* graphique fermé */ } }, 0);
  }
  /* survol (souris) ou toucher d'une case : prix, acheteurs, vendeurs, delta, transactions */
  function infoSurCase(point, tMs, persister) {
    if (!S.envRendu || !S.envRendu.rendu || !S.envRendu.rendu.actif || !point) return false;
    const prixPt = sBou.coordinateToPrice(point.y); if (prixPt == null) return false; const html = infoCase(S.envRendu, tMs, prixPt, v => prix(S.actif, v)); if (!html) return false;
    const boite = $('[data-info]'); boite.innerHTML = html; boite.hidden = false; boite.style.left = Math.min(Math.max(8, point.x + 16), Math.max(8, zoneGraph.clientWidth - 280)) + 'px'; boite.style.top = Math.max(8, point.y + 16) + 'px';
    clearTimeout(S.infoT); if (persister) S.infoT = setTimeout(() => { boite.hidden = true; }, 7000); return true;
  }

  /* ───── calculs affichés ───── */
  function calculerProfil() {
    if (!chart || !S.bars.length) { S.prof = null; return; }
    const r = chart.timeScale().getVisibleLogicalRange(); if (!r) return; const i0 = Math.max(0, Math.floor(r.from)), i1 = Math.min(S.bars.length - 1, Math.ceil(r.to)); const X = S.bars.slice(i0, i1 + 1); if (X.length < 3) { S.prof = null; return; }
    const hi = Math.max(...X.map(b => b.h)), lo = Math.min(...X.map(b => b.l)); S.prof = profil(X, { niveaux: Math.max(24, Math.min(90, Math.round((hi - lo) / ((S.niveauxAtr || (hi - lo) / 60) * 0.18)))) });
    S.etiqProfil = S.prof && (opts.poc || opts.profil) ? [{ prix: S.prof.poc.prix, texte: 'POC ' + prix(S.actif, S.prof.poc.prix), fond: PALETTE.poc, couleur: '#05080c' }, { prix: S.prof.vah, texte: 'VAH', fond: 'rgba(200,210,218,.75)', couleur: '#05080c' }, { prix: S.prof.val, texte: 'VAL', fond: 'rgba(200,210,218,.75)', couleur: '#05080c' }] : []; majEtiquettes();
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
    appliquerPanneaux(); calculerProfil(); couche && couche.req && couche.req(); majDroite(); legende(null); majTempsReel();
  }
  /* VWAP, POC nus, niveaux, flèches, dessins : recalculés quand les bougies changent (pas à chaque transaction) */
  /* v6 : étiquettes de prix → axe des prix (empilées, sans chevauchement) ; jamais de texte flottant dans la zone des bougies */
  const etiqPrix = (p, texte, fond, couleur = '#05080c') => S.etiqAnnexes.push({ prix: p, texte, fond, couleur });
  function majEtiquettes() {
    if (!etiqAxe) return; const L = [...S.etiqAnnexes, ...(S.etiqProfil || []), ...(S.etiqReac || []), ...(S.etiqIct || []), ...(S.etiqGros || [])];
    etiqAxe.set(L);
  }
  function calculerAnnexes() {
    const B = S.bars; if (!B.length) return; S.etiqAnnexes = [];
    for (const s of S.seriesVwap) { try { chart.removeSeries(s); } catch (e) { /* déjà retirée */ } } S.seriesVwap = [];
    for (const l of S.lignes) { try { sBou.removePriceLine(l); } catch (e) { /* déjà retirée */ } } S.lignes = [];
    const ligne = (p, couleur, style, largeur = 1) => S.lignes.push(sBou.createPriceLine({ price: p, color: couleur, lineWidth: largeur, lineStyle: style, axisLabelVisible: false, title: '' }));
    /* VWAP : un seul bleu ; au plus 2 en même temps (semaine + ancré) ; bandes ±1σ ±2σ masquées par défaut */
    const ajouterVwap = (i0, bandes, titre) => {
      if (i0 < 0 || i0 >= B.length) return; const V = vwapAncre(B, i0, { bandes }), mk = (cle, coul, ep, st) => { const s = chart.addSeries(LW.LineSeries, { color: coul, lineWidth: ep, lineStyle: st, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: '', autoscaleInfoProvider: horsEchelleFp }, 0); s.setData(V.map((x, k) => ({ time: temps(B[i0 + k].t), value: cle === 'v' ? x.vwap : x.bandes[cle] })).filter(p => p.value != null)); S.seriesVwap.push(s); };
      mk('v', PALETTE.vwap, 1.5, 0); if (opts.bandesVwap) for (const k of bandes) { mk('+' + k, 'rgba(111,180,212,' + (k === 1 ? '.6' : '.35') + ')', 1, 2); mk('-' + k, 'rgba(111,180,212,' + (k === 1 ? '.6' : '.35') + ')', 1, 2); }
      const dv = V[V.length - 1]; if (dv && Number.isFinite(dv.vwap)) etiqPrix(dv.vwap, titre, PALETTE.vwap);
    };
    if (opts.vwap) ajouterVwap(indexAncrePeriode(B, 'semaine'), [1, 2], 'VWAP sem.');
    const ancres = lireLS(CLE.ancres(S.actif, S.unite), []); if (ancres.length) { const t = ancres[ancres.length - 1], i = B.findIndex(b => b.t >= t); if (i >= 0) ajouterVwap(i, [1, 2], 'VWAP ancré'); }
    if (opts.nus) for (const periode of ['semaine', 'mois']) for (const n of pocsNus(B, periode, { max: 3 })) { ligne(n.prix, 'rgba(200,210,218,.45)', 1); etiqPrix(n.prix, 'POC nu ' + (periode === 'mois' ? 'M' : 'S'), 'rgba(200,210,218,.8)'); }
    S.niveaux = []; if (S.unite !== 'H1' || opts.niveaux) { const N = niveauxVolume(B, { max: 5 }); S.niveaux = N.niveaux; S.niveauxAtr = N.atr; if (opts.niveaux && S.unite !== 'H1') for (const n of N.niveaux) { ligne(n.prix, 'rgba(127,179,194,.55)', 0); etiqPrix(n.prix, (n.cote === 'resistance' ? 'Rés. ' : 'Sup. ') + prix(S.actif, n.prix), PALETTE.niveau); } }
    if (opts.murs && S.book) for (const m of murs(S.book).slice(0, 3)) { ligne(m.prix, 'rgba(200,210,218,.4)', 3); etiqPrix(m.prix, 'Mur ' + compact(m.qte), 'rgba(200,210,218,.75)'); }
    for (const s of S.seriesDessins) { try { chart.removeSeries(s); } catch (e) { /* déjà retirée */ } } S.seriesDessins = [];
    if (opts.dessins) tracerDessins();
    majEtiquettes(); calculerFleches();
  }
  function tracerDessins() {
    let L = []; try { L = visibles(lireDessins(S.actif)); } catch (e) { return; }
    const ligneP = (p, coul, titre) => { S.lignes.push(sBou.createPriceLine({ price: p, color: coul, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' })); if (titre) etiqPrix(p, titre, coul); };
    for (const o of L) {
      if (o.type === 'horizontale') ligneP(o.p, o.couleur, 'Ligne');
      else if (o.type === 'boite') { ligneP(o.haut, o.couleur, 'Boîte'); ligneP(o.bas, o.couleur, ''); }
      else if (o.type === 'tendance') { const s = chart.addSeries(LW.LineSeries, { color: o.couleur, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0); s.setData([{ time: temps(o.t1), value: o.p1 }, { time: temps(o.t2), value: o.p2 }]); S.seriesDessins.push(s); }
      else if (o.type === 'fibo') { const A = o.p1, Bp = o.p2, ret = r => Bp - (Bp - A) * r; for (const [r, t] of [[0.5, '0,5'], [0.618, '0,618'], [0.705, '0,705'], [0.382, '0,382']]) ligneP(ret(r), o.couleur, 'Fib ' + t); }
    }
  }
  /* flèches : Volume (à la clôture) + MA200 ; la dernière bougie n'est jamais évaluée tant qu'elle n'est pas close */
  /* niveaux de réaction (v4.1, v6) : calculés TOUJOURS (les flèches Volume s'en servent : S.reactionTous), AFFICHÉS seulement si le calque est actif : les 3 plus forts à moins de 3 ATR Daily du prix, zones fines, étiquette « R×4 » sur l'axe */
  function calculerReaction() {
    S.reaction = []; S.reactionTous = []; S.reactionAtr = null; const B = S.bars; if (B.length < 60) return;
    const clos = B.filter(b => b.t + PAS_UNITE[S.unite] <= Date.now()); let hvn = []; try { const P = profil(clos.slice(-250)); hvn = P ? P.hvn.map(h => h.prix) : []; } catch (e) { hvn = []; }
    const nus = ['semaine', 'mois'].flatMap(p => pocsNus(B, p, { max: 3 }).map(n => n.prix)), absorptions = (S.fleches || []).filter(f => f.type === 'vol-absorption' && !/^Réaction/.test(f.nomNiveau || '')).map(f => f.niveau);   // les absorptions repérées SUR un niveau de réaction ne le renforcent pas (pas de cercle vicieux)
    try { const r = niveauxReaction(clos, { unite: S.unite, volume: { hvn, nus, empiles: [...S.zonesEmp.values()], absorptions } }); S.reactionTous = r.niveaux; S.reactionAtr = r.atr; } catch (e) { S.reactionTous = []; }
    const atrJ = atrDaily(B, S.unite) || S.reactionAtr, px = B[B.length - 1].c;
    S.reaction = atrJ ? S.reactionTous.filter(n => Math.abs(n.prix - px) <= 3 * atrJ).sort((x, y) => y.force - x.force).slice(0, 3) : [];
    S.etiqReac = opts.reaction ? S.reaction.map(n => ({ prix: n.prix, texte: 'R×' + n.reactions, fond: PALETTE.niveau, couleur: '#05080c' })) : []; majEtiquettes();
  }
  function calculerFleches() {
    const B = S.bars, now = Date.now(), pas = PAS_UNITE[S.unite], closes = B.filter(b => b.t + pas <= now); calculerReaction();
    S.fleches = closes.length >= 80 ? flechesVolume(closes, { unite: S.unite, niveauxReac: S.reactionTous }) : [];
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
      try { if (T.envoyerTelegram && !alertesParWorker()) T.envoyerTelegram(`${txt} · lecture seule, aucun ordre n’est passé`); } catch (e) { /* ignoré */ }
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

  /* ───── panneau de droite à onglets (v6) : Carnet / Bougies HTF-ICT / Bougie du jour — voir panneau-droite.js ───── */
  let tDessin = 0; const demanderDessin = () => { if (!tDessin) tDessin = setTimeout(() => { tDessin = 0; couche && couche.req && couche.req(); }, 350); };
  let panneau = null, rafDroite = 0; const majDroite = () => { if (!rafDroite) rafDroite = requestAnimationFrame(() => { rafDroite = 0; dessinerDroite(); }); };
  function dessinerDroite() {
    if (!panneau) return; const t = Date.now();
    if (t - (S.tBook || 0) > 400) { S.tBook = t; S.bookAff = S.bookProfond && S.book ? fusionnerCarnets(S.bookProfond, S.book) : (S.book || S.bookProfond); if (S.bookAff) { S.suiviGros.observer(S.bookAff, t); S.histoDeseq.ajouter(S.bookAff, t); } majGrosPersistants(); }
    panneau.rendre();
  }
  /* gros ordres restés plus de 2 minutes : fins traits pointillés sur le graphique, étiquette sur l'axe seulement */
  function majGrosPersistants() {
    if (!sBou) return; const P = S.suiviGros.persistants(Date.now()), sig = P.map(x => x.cote + x.prix).join(); if (sig === S.sigGros) return; S.sigGros = sig;
    for (const l of S.lignesGros || []) { try { sBou.removePriceLine(l); } catch (e) { /* retirée */ } } S.lignesGros = P.map(x => sBou.createPriceLine({ price: x.prix, color: x.cote === 'achat' ? 'rgba(95,184,148,.5)' : 'rgba(216,106,106,.5)', lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: '' }));
    S.etiqGros = P.map(x => ({ prix: x.prix, texte: compact(x.qte), fond: x.cote === 'achat' ? 'rgba(95,184,148,.85)' : 'rgba(216,106,106,.85)', couleur: '#05080c' })); majEtiquettes();
  }
  /* « Détails » : tout ce qui est long ou secondaire (aide, sources, masquages du profil, listes de niveaux et de flèches) */
  function detailsHtml() {
    const a = parId[S.actif], p = profilDe(S.actif), d = S.donnees, R = S.reaction, N = S.niveaux, F = S.fleches.slice(-4).reverse();
    const liste = L => (L.length ? `<ul class="tpv-niv">${L.join('')}</ul>` : '<p class="tpv-doux">—</p>');
    const flux = Object.entries(S.etatFlux).map(([n, e]) => `${n} : ${e.etat === 'connecte' ? 'en direct' : e.etat === 'erreur' ? 'injoignable' : e.etat}`).join(' · ');
    return `<p class="tpv-doux"><b>${esc(a.nom)} · profil ${esc(p.nom)}</b><br>${esc(badgeSource(a, d ? d.source : 'reel'))}${d ? ' · ' + esc(ageDonnee(d.t)) : ''}.</p>
      <p class="tpv-doux">${esc(NOM_U[S.unite])} · ${S.bars.length} bougies. ${S.controle ? esc(resumeControle(S.controle)) + '. ' : ''}${S.raccord && S.raccord.refuse ? 'Historique long refusé (raccord incohérent : ' + esc(S.raccord.raison === 'saut' ? 'écart de prix' : 'bougies manquantes') + '), source récente seule. ' : S.raccord && S.raccord.methode ? `Historique long raccordé (${esc(S.raccord.methode)}, écart ${nf((S.raccord.ratio - 1) * 100, 3)} %, ${S.raccord.longues} bougies). ` : ''}${d && d.repli ? 'Repli : ' + esc(d.repli) + '. ' : ''}${d && d.note ? esc(d.note) : ''}</p>
      <p class="tpv-doux">${flux ? 'Flux : ' + esc(flux) + '. ' : (a.live ? '' : 'Pas de flux direct gratuit pour cet actif : données différées. ')}Delta ${d && d.deltaReel ? 'réel (côté de l’agresseur)' : 'estimé depuis la bougie'}.</p>
      <p class="tpv-doux">${esc(texteEmpreinte())}</p>
      ${p.masques.length || (d && d.aVolume === false) ? `<p class="tpv-doux"><b>Masqué</b><br>${[...p.masques, ...(d && d.aVolume === false ? ['Panneaux Volume, CVD et MFI : cette source ne fournit aucun volume pour ' + a.nom + '.'] : [])].map(esc).join('<br>')}</p>` : ''}
      <h4>Niveaux de réaction</h4>${liste(R.map(n => `<li><b>${prix(S.actif, n.prix)}</b> <small>${n.cote === 'resistance' ? 'résistance' : 'support'} · ×${n.reactions} réactions · force ${nf(n.forceRel * 100, 0)} % · ${NOM_U[n.unite] || n.unite}${n.sources.length ? ' · ' + esc(n.sources.join(', ')) : ''}</small></li>`))}
      <h4>Supports / résistances (volume)</h4>${liste(N.map(n => `<li class="${n.cote === 'resistance' ? 'tpv-b' : 'tpv-h'}"><b>${prix(S.actif, n.prix)}</b> <small>${n.cote === 'resistance' ? 'résistance' : 'support'} · force ${nf(n.force, 1)} · ${n.reactions} réactions · ${esc(n.sources.slice(0, 3).join(', '))}</small></li>`))}
      <h4>Dernières flèches</h4>${liste(F.map(f => `<li class="${f.dir > 0 ? 'tpv-h' : 'tpv-b'}">${f.dir > 0 ? '▲' : '▼'} ${esc(f.libelle)} <small>${tFr.format(new Date(f.t))}</small></li>`))}
      <p class="tpv-aide"><b>Aide.</b> <u>Empreinte</u> : zoome sur les bougies ; chaque ligne est une case de prix (vendeurs agressifs à gauche × acheteurs à droite), POC de la bougie encadré, déséquilibres 3:1 en gras, déséquilibres empilés soulignés dans la marge ; toucher une case pour le détail. <u>Étirer</u> : glisser dans le graphique (déplace en tous sens), glisser sur l’axe des prix (hauteur) ou du temps (largeur), pincement dans le sens voulu, molette = largeur, Ctrl + molette = hauteur, double clic / double appui sur un axe ou « Auto » = échelle automatique. <u>Palette</u> : vert / rouge = bougies et delta, or = MA200, un seul bleu = VWAP, blanc / gris = POC, VAH, VAL, teinte discrète = niveaux. Lecture seule : aucun ordre. Graphiques TradingView Lightweight Charts™ (Apache 2.0).</p>`;
  }
  const majPanneauNiveauxTexte = () => { if (!S.charge) return; majDroite(); };

  /* ───── badge court, pied de page d'une ligne, état ───── */
  function texteEmpreinte() {
    const a = parId[S.actif], p = profilDe(S.actif); if (!p.footprint || !a.live) return 'Empreinte masquée : ' + TEXTE_ABSENT + ' (pas de transactions gratuites avec le côté de l’agresseur pour ' + a.nom + ') ; seul le volume par bougie est affiché.';
    const I = S.fp && S.fp.info(S.actif);
    if (!I) { const err = S.fp && S.fp.erreurIndex(); return err ? 'Empreinte : archive injoignable (' + err + ') ; bougies et volume affichés sans empreinte, nouvel essai toutes les minutes.' : S.fp && S.fp.indexPret() ? 'Empreinte : aucune archive pour cet actif ; bougies et volume affichés sans empreinte.' : 'Empreinte : archive en cours de chargement (délai maximum 12 s).'; }
    const live = S.live && S.live.depuis() != null ? ' Jour en cours : en direct' + (S.live.partielle('H1', Math.floor(Date.now() / 3600e3) * 3600e3) ? ' depuis ' + tH.format(new Date(S.live.depuis())) + ' (partielle avant)' : ' (heure complète)') : '';
    return 'Empreinte : archive Binance du ' + I.debut + ' au ' + I.dernier + ' (' + I.jours + ' jours' + (I.trous ? ', ' + I.trous + ' manquants' : '') + ') ; avant : ' + TEXTE_ABSENT + '.' + live;
  }
  function badgeCourt() {
    const a = parId[S.actif], d = S.donnees, direct = Object.values(S.etatFlux).some(e => e.etat === 'connecte'), age = d ? ageDonnee(d.t) : '…';
    if (d && d.source === 'repli') return 'Volume indisponible · bougies de secours · ' + age;
    if (a.typeVolume === 'aucun' || (d && !d.aVolume && d.source !== 'repli')) return 'Volume indisponible pour cet actif · prix ' + a.court + ' · ' + age;
    if (a.typeVolume === 'futures') return 'Futures ' + (a.yahooNom || 'CME') + ' · différé · ' + age;
    if (d && d.source === 'ref') return 'Futures ' + (a.yahooNom || 'COMEX') + ' · différé · ' + age;
    return 'Volume réel · Binance + Kraken · ' + (direct ? 'direct' : age);
  }
  function majBadge() {
    const a = parId[S.actif], p = profilDe(S.actif); $('[data-badge]').textContent = badgeCourt(); $('[data-badge]').title = badgeSource(a, S.donnees ? S.donnees.source : 'reel') + ' — touche pour les détails';
    const pf = $('[data-profil]'); if (pf) { pf.textContent = p.nom; pf.dataset.profil = p.id; }
    $('[data-note]').textContent = `${NOM_U[S.unite]} · ${S.bars.length} bougies${S.controle ? ' · ' + (S.controle.incidents.length || S.controle.trous.length ? resumeControle(S.controle).replace('Contrôle : ', '') : 'série continue') : ''}${S.donnees && S.donnees.repli ? ' · repli' : ''} · lecture seule, aucun ordre · TradingView Lightweight Charts™`;
    $('[data-ligne-source-volume]').hidden = S.actif !== 'or'; if (panneau) panneau.rendreDetails();
  }

  /* ───── flux en direct ───── */
  let fluxB = null, fluxP = null, fluxK = null, kline = null, sondeP = 0;
  function arreterFlux() { for (const f of [fluxB, fluxP, fluxK]) try { f && f.fermer(); } catch (e) { /* déjà fermé */ } fluxB = fluxP = fluxK = null; clearInterval(sondeP); sondeP = 0; S.etatFlux = {}; S.book = null; S.bookProfond = null; S.bookAff = null; S.suiviGros.vider(); S.histoDeseq.vider(); S.sigGros = ''; S.chaleur.vider(); S.gros = creerFlux(); S.live = null; if (S.ratt) S.ratt.arreter(); S.ratt = null; }
  /* carnet PROFOND (1 000 niveaux, REST public, toutes les 3 s, seulement quand l'onglet Carnet est visible) : le flux (20 niveaux) ne couvre que quelques dollars, trop peu pour regrouper par palier */
  async function sondeProfondeur() {
    const a = parId[S.actif]; if (!a.binance || !S.ouvert || document.hidden || !panneau || panneau.onglet() !== 'carnet' || opts.carnetSource !== 'Binance') return; const n = S.seq, act = S.actif;
    try { const r = await fetch(`https://fapi.binance.com/fapi/v1/depth?symbol=${a.binance}&limit=1000`, { signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined }); if (!r.ok) return; const d = await r.json(); if (act !== S.actif || !Array.isArray(d.bids)) return;
      S.bookProfond = { type: 'carnet', t: Date.now(), bids: d.bids.map(x => [+x[0], +x[1]]), asks: d.asks.map(x => [+x[0], +x[1]]) }; S.tBook = 0; majDroite(); } catch (e) { /* le flux de 20 niveaux reste affiché */ }
  }
  function demarrerFlux() {
    arreterFlux(); const a = parId[S.actif]; if (!a.live || !S.ouvert) { majBadge(); return; }
    S.live = creerLive(FIN_FOOTPRINT[S.actif] || 1); const iv = { H1: '1h', H4: '4h', J: '1d' }[S.unite], durable = opts.carnetSource, sur = (src, m) => {
      if (!m) return;
      if (m.type === 'carnet') { if (src !== opts.carnetSource) return; S.book = m; S.chaleur.ajouter(m); majDroite(); couche && couche.req && couche.req(); }
      else if (m.type === 'trade') {
        if (src === 'Binance' && S.live) {   // l'empreinte suit TOUJOURS Binance (même volume que l'archive), quel que soit le carnet choisi
          S.live.ajouterTrade(m); demanderDessin();
          if (!S.ratt && a.binance) { S.ratt = creerRattrapage(S.live, a.binance, { surChange: demanderDessin }); S.ratt.demander([Math.floor(m.t / 3600e3) * 3600e3]); }
        }
        if (src !== opts.carnetSource) return; const seuil = lireLS(`rayle_tpv_seuilgros_${S.actif}`, null); if (S.gros.ajouter(m, seuil != null ? () => seuil : seuilGrosses)) majDroite();
      } else if (m.type === 'bougie' && src === 'Binance' && m.intervalle === iv) mettreAJourBougie(m.bougie, m.close);
    };
    const u = urlsBinance(S.actif, iv);
    if (u) { fluxB = ouvrirFlux(u.marche, { surMessage: msg => sur('Binance', parseBinance(msg)), surEtat: e => { S.etatFlux.Binance = e; majBadge(); } }); fluxP = ouvrirFlux(u.public, { surMessage: msg => sur('Binance', parseBinance(msg)), surEtat: e => { S.etatFlux['Binance carnet'] = e; majBadge(); } }); }
    const abo = abonnementKraken(S.actif); if (abo.length && durable === 'Kraken') { S.krakenBook = creerCarnetKraken(); fluxK = ouvrirFlux(KRAKEN_WS, { abonner: ws => abo.forEach(x => ws.send(JSON.stringify(x))), surMessage: msg => { sur('Kraken', S.krakenBook.appliquer(msg)); sur('Kraken', parseKrakenTrade(msg)); }, surEtat: e => { S.etatFlux.Kraken = e; majBadge(); } }); }
    if (a.binance && profilDe(S.actif).carnet) { sondeProfondeur(); sondeP = setInterval(sondeProfondeur, 3000); }
  }
  function mettreAJourBougie(b, close) {
    if (!S.bars.length) return; const dern = S.bars[S.bars.length - 1];
    if (b.t === dern.t) { Object.assign(dern, b); sBou.update({ time: temps(b.t), open: b.o, high: b.h, low: b.l, close: b.c }); const d = deltaBarre(dern); sVol.update({ time: temps(b.t), value: b.v, color: d >= 0 ? 'rgba(95,184,148,.6)' : 'rgba(216,106,106,.6)' }); }
    else if (b.t > dern.t) { S.bars.push({ ...b }); sBou.update({ time: temps(b.t), open: b.o, high: b.h, low: b.l, close: b.c }); sVol.update({ time: temps(b.t), value: b.v, color: 'rgba(95,184,148,.6)' }); peindre(false); return; }
    if (close) { calculerFleches(); }
    legende(null); couche && couche.req && couche.req(); clearTimeout(S.tProfil); S.tProfil = setTimeout(() => { calculerProfil(); couche && couche.req && couche.req(); majDroite(); }, 800);
  }

  /* ───── chargement ───── */
  async function charger(recadrer = true) {
    const n = ++S.seq; S.charge = false; S.erreur = null; $('[data-att]').hidden = false; $('[data-att]').textContent = 'Chargement du volume ' + parId[S.actif].nom + ' ' + NOM_U[S.unite] + '…'; majBadge();
    try {
      const r = await chargerBarres(S.actif, S.unite, { source: S.actif === 'or' ? opts.sourceVolume : 'reel' }); if (n !== S.seq) return;
      S.zonesEmp.clear(); S.donnees = r; const C = controler(r.bougies, { unite: S.unite, actif: S.actif }); S.controle = C; S.raccord = null; S.bars = C.bougies.length >= 20 ? C.bougies : r.bougies; S.charge = true; $('[data-att]').hidden = true; creerGraphique(); peindre(recadrer); majBadge(); demarrerFlux(); etendreHistorique(n); majIctPrincipal(); if (panneau) panneau.rendre();
    } catch (e) {
      if (n !== S.seq) return; S.erreur = String(e && e.message || e); S.bars = []; $('[data-att]').hidden = false; $('[data-att]').innerHTML = `Données de volume indisponibles : ${esc(S.erreur)} <button type="button" data-reessayer>Réessayer</button>`; majBadge(); if (panneau) panneau.rendre();
    }
  }

  /* v7 : dernier prix du mode Volume noté pour le contrôle de cohérence (clés d'actif du Classique) */
  { const CLE_CL = { or: 'OR', us100: 'NASDAQ', us500: 'SP500', btc: 'BTC', sol: 'SOL', dxy: 'DXY', eurusd: 'EURUSD', usdchf: 'USDCHF' }; setInterval(() => { try { if (!S.ouvert || document.hidden || !S.charge || !S.bars.length) return; const a = parId[S.actif]; if (a.id === 'us100' || a.id === 'us500' || a.id === 'eurusd' || (a.id === 'or' && opts.sourceVolume === 'ref') || (S.donnees && S.donnees.repli)) return;   /* prix de futures (base différente du comptant) : non comparés */ noterPrix(CLE_CL[S.actif], 'volume', S.bars[S.bars.length - 1].c); } catch (e) { /* rien */ } }, 20000); }
  /* A2 : historique long raccordé AVANT la source récente (recalé sur les bougies communes), puis contrôle (bougies isolées, trous). */
  async function etendreSerie(a, u, bars) {
    const NB = { J: 40, H4: 8, H1: 3 }; if (!bars.length) return { bougies: bars, raccord: null, controle: null };
    const fin = bars[bars.length - 1].t + PAS_UNITE[u], fiche = await histoLong.fiche(a, u); if (!fiche) return { bougies: bars, raccord: null, controle: null };
    const lireLongues = async () => { const f = await histoLong.fiche(a, u); await Promise.all(f.annees.slice(-(NB[u] || 3) - 1).map(y => histoLong.annee(a, u, y).catch(() => []))); return histoLong.avant(a, u, fin, NB[u] || 3); };
    let L = await lireLongues(); if (!L.bougies.length) return { bougies: bars, raccord: null, controle: null };
    /* v7 : contrôle du raccord (écart > 10 % ou plus de 2 bougies manquantes) : on recharge l'historique depuis la source (la même que le Classique), puis on refuse la série raccordée */
    let V = verifierRaccord(L.bougies, bars, { unite: u, actif: a });
    if (!V.ok) { histoLong.oublier(); try { L = await lireLongues(); V = verifierRaccord(L.bougies, bars, { unite: u, actif: a }); } catch (e) { /* source injoignable : le refus ci-dessous s'applique */ } }
    if (!V.ok) { noterIncident({ type: 'raccord', actif: a, unite: u, detail: (V.raison === 'saut' ? 'écart de ' + Math.round(Math.abs(V.saut) * 100) + ' %' : V.manquantes + ' bougies manquantes') + ' entre l’historique et la bougie en direct : série raccordée refusée' }); return { bougies: bars, raccord: { refuse: true, raison: V.raison, manquantes: V.manquantes, saut: V.saut }, controle: null }; }
    const R = raccorder(L.bougies, bars), C = controler(R.bougies, { unite: u, actif: a }); return { bougies: C.bougies, raccord: { ratio: R.ratio, methode: R.methode, n: R.n, longues: L.bougies.length }, controle: C };
  }
  /* la vue ne bouge pas : conservée par le temps, pas par l'indice */
  async function etendreHistorique(n) {
    if (!S.bars.length) return;
    try {
      const E = await etendreSerie(S.actif, S.unite, S.bars); if (n !== S.seq) return; if (E.raccord) { S.raccord = E.raccord; S.controle = E.controle; }
      if (!E.raccord || E.bougies.length <= S.bars.length) { majBadge(); return; }
      const vue = chart.timeScale().getVisibleRange(); S.bars = E.bougies; peindre(false); try { if (vue) chart.timeScale().setVisibleRange(vue); } catch (e) { /* vue vide */ } majBadge();
    } catch (e) { S.raccord = { erreur: String(e && e.message || e).slice(0, 100) }; majBadge(); }
  }
  /* séries annexes pour les onglets ICT et « Bougie du jour » : Daily (historique complet) et H1 (jour en cours), chargées à la demande et gardées en mémoire */
  function serieCache(u, etendre) {
    const k = S.actif + '|' + u; if (!S.cache.has(k)) S.cache.set(k, (async () => { const r = await chargerBarres(S.actif, u, { source: S.actif === 'or' ? opts.sourceVolume : 'reel' }); let B = controler(r.bougies, { unite: u, actif: S.actif }).bougies; if (etendre) { try { B = (await etendreSerie(S.actif, u, B)).bougies; } catch (e) { /* source récente seule */ } } return B; })().catch(err => { S.cache.delete(k); throw err; })); return S.cache.get(k);
  }
  const donneesJ = async () => (S.unite === 'J' ? S.bars : serieCache('J', true)), donneesH1 = async () => (S.unite === 'H1' ? S.bars : serieCache('H1', false));
  /* repères ICT reportés sur le graphique principal : lignes fines, zones grisées, étiquettes sur l'axe des prix seulement */
  async function majIctPrincipal() {
    if (!sBou || !zonesPrinc) return; const retirer = () => { for (const l of S.lignesIct || []) { try { sBou.removePriceLine(l); } catch (e) { /* retirée */ } } S.lignesIct = []; zonesPrinc.set([]); S.etiqIct = []; majEtiquettes(); };
    if (!opts.ictPrincipal) { retirer(); return; } let J = null; try { J = await donneesJ(); } catch (e) { retirer(); return; } if (!opts.ictPrincipal || !J) return;
    const A = construireIct(J, { ...ICT_DEFAUT, ...(opts.ict || {}) }, { fmt: v => prix(S.actif, v) }); retirer();
    S.lignesIct = A.lignes.map(l => sBou.createPriceLine({ price: l.prix, color: l.couleur, lineWidth: 1, lineStyle: l.tirets ? 2 : 0, axisLabelVisible: false, title: '' })); zonesPrinc.set(A.zones); S.etiqIct = etiqIct(A); majEtiquettes();
  }
  /* sessions (indices, forex) : fines bandes en haut du H1 avec le plus haut et le plus bas de chaque session */
  function dessinerSessions(sc) {
    if (!opts.sessions || S.unite !== 'H1' || !profilDe(S.actif).sessions || !S.bars.length) return; const r = chart.timeScale().getVisibleRange(); if (!r) return; const c = sc.context, hr = sc.horizontalPixelRatio, vr = sc.verticalPixelRatio;
    const L = sessionsH1(S.bars.filter(b => b.t / 1000 >= r.from - 3 * 86400), { jours: 4 }), alpha = { asie: 0.10, londres: 0.2, newyork: 0.14 }, sigle = { asie: 'A', londres: 'L', newyork: 'NY' }; c.font = `${9 * hr}px ui-monospace, Consolas, monospace`; c.textBaseline = 'middle';
    for (const s of L) {
      const x0 = xDe(s.t0), x1 = xDe(s.t1); if (x0 == null || x1 == null || x1 < 0) continue; c.fillStyle = `rgba(200,210,218,${alpha[s.id]})`; c.fillRect(x0 * hr, 0, (x1 - x0) * hr, 8 * vr); c.fillStyle = 'rgba(200,210,218,.55)'; c.fillText(sigle[s.id], (x0 + 3) * hr, 4 * vr);
      c.strokeStyle = 'rgba(200,210,218,.35)'; c.lineWidth = Math.max(1, hr * 0.8); c.setLineDash([2 * hr, 3 * hr]); for (const p of [s.haut, s.bas]) { const y = yDe(p); if (y == null) continue; c.beginPath(); c.moveTo(x0 * hr, y * vr); c.lineTo(x1 * hr, y * vr); c.stroke(); } c.setLineDash([]);
    }
    c.textBaseline = 'alphabetic';
  }

  /* ───── commandes et événements ───── */
  function synchroUI() {
    const p = profilDe(S.actif); $('[data-actif]').value = S.actif; $$('[data-unite]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.unite === S.unite)));
    $$('[data-opt]').forEach(c => { c.checked = !!opts[c.dataset.opt]; }); $$('[data-opt-select]').forEach(s => { s.value = opts[s.dataset.optSelect]; }); $$('[data-type]').forEach(c => { c.checked = types[c.dataset.type] !== false; });
    const ps = $('[data-preset]'); if (ps) ps.value = PRESETS[opts.preset] ? opts.preset : 'perso';
    const fp = $('[data-fp]'); if (fp) { fp.hidden = !p.footprint; fp.setAttribute('aria-pressed', String(!!opts.empreinte)); }
    const cache = { murs: !p.carnet, chaleur: !p.carnet, empreinte: !p.footprint, sessions: !p.sessions }; $$('[data-calque]').forEach(l => { l.hidden = !!cache[l.dataset.calque]; });
    const cs = $('[data-opt-select="carnetSource"]'); if (cs && cs.parentElement) cs.parentElement.hidden = !p.carnet;
  }
  el.addEventListener('click', ev => {
    const u = ev.target.closest('[data-unite]'); if (u) { S.unite = u.dataset.unite; ecrireLS(CLE.unite, S.unite); synchroUI(); charger(); return; }
    if (ev.target.closest('[data-reessayer]')) { charger(); return; }
    if (ev.target.closest('[data-temps-reel]')) { try { const r = chart.timeScale().getVisibleLogicalRange(), n = S.bars.length; if (r) { const larg = r.to - r.from; chart.timeScale().setVisibleLogicalRange({ from: n + 11 - larg, to: n + 11 }); } else chart.timeScale().scrollToRealTime(); } catch (e) { /* graphique fermé */ } return; }
    if (ev.target.closest('[data-vers-classique]')) { surClassique(); return; }
    if (ev.target.closest('[data-fp]')) { opts.empreinte = !opts.empreinte; opts.preset = 'perso'; sauverOpts(); synchroUI(); couche && couche.req && couche.req(); return; }
    if (ev.target.closest('[data-badge]')) { const d = zoneDroite.querySelector('[data-details]'); if (d) { d.open = true; try { d.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ancien navigateur */ } } return; }
    if (ev.target.closest('[data-ancrer]')) { S.modeAncre = !S.modeAncre; ev.target.closest('[data-ancrer]').setAttribute('aria-pressed', String(S.modeAncre)); zoneGraph.classList.toggle('tpv-ancre', S.modeAncre); return; }
    if (ev.target.closest('[data-effacer-vwap]')) { ecrireLS(CLE.ancres(S.actif, S.unite), []); calculerAnnexes(); return; }
    const r = ev.target.closest('[data-reglages]'); if (r) { const p = $('[data-panneau-reglages]'); p.hidden = !p.hidden; r.setAttribute('aria-expanded', String(!p.hidden)); }
  });
  function changerActif(a) {
    S.actif = a; ecrireLS(CLE.actif, a); optsPourActif(a); S.etiqIct = []; S.etiqProfil = []; S.etiqReac = []; S.etiqGros = []; S.lignesIct = S.lignesIct || []; if (S.ech && S.ech.estJournal() !== !!opts.log) S.ech.journal(!!opts.log);
    arreterFlux(); if (panneau) panneau.changerActif(); synchroUI(); charger();
  }
  el.addEventListener('change', ev => {
    const t = ev.target;
    if (t.matches('[data-actif]')) { changerActif(t.value); return; }
    if (t.matches('[data-preset]')) { if (PRESETS[t.value]) { Object.assign(opts, PRESETS[t.value], { preset: t.value }); sauverOpts(); synchroUI(); if (panneau) panneau.synchroIct(); peindre(false); majIctPrincipal(); } return; }
    if (t.matches('[data-opt]')) {
      const k = t.dataset.opt; opts[k] = t.checked; opts.preset = 'perso'; sauverOpts(); const ps = $('[data-preset]'); if (ps) ps.value = 'perso';
      if (/^p(Vol|Cvd|Mfi)$/.test(k)) { appliquerPanneaux(); return; } if (k === 'log') { if (S.ech) S.ech.journal(t.checked); return; }
      if (k === 'ictPrincipal') { if (panneau) panneau.synchroIct(); majIctPrincipal(); return; } if (k === 'reaction') { calculerReaction(); couche && couche.req && couche.req(); return; }
      if (k === 'ma200' || k === 'fleches' || k === 'vwap' || k === 'bandesVwap' || k === 'nus' || k === 'niveaux' || k === 'murs' || k === 'dessins') peindre(false); else if (k === 'poc' || k === 'profil') { calculerProfil(); couche && couche.req && couche.req(); } else couche && couche.req && couche.req(); return;
    }
    if (t.matches('[data-opt-select]')) { opts[t.dataset.optSelect] = t.value; sauverOpts(); if (t.dataset.optSelect === 'carnetSource') { S.book = null; demarrerFlux(); majDroite(); } else if (t.dataset.optSelect === 'sourceVolume') { S.cache.clear(); charger(); } else if (t.dataset.optSelect === 'empMode') couche && couche.req && couche.req(); else peindre(false); return; }
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
  const pocsNusTexte = () => { const L = ['semaine', 'mois'].flatMap(p => pocsNus(S.bars, p, { max: 3 }).map(n => ({ ...n, p }))); opts.nus = true; sauverOpts(); synchroUI(); calculerAnnexes(); return L.length ? 'POC nus : ' + L.map(n => `${prix(S.actif, n.prix)} (${n.p})`).join(', ') + '.' : 'Aucun POC nu sur cette période.'; };
  function ouvrirMode(o, { actif, unite } = {}) {
    S.ouvert = o; el.hidden = !o; document.documentElement.classList.toggle('tpv-actif', !!o);
    if (o) { S.cache.clear(); if (actif && parId[actif] && actif !== S.actif) { S.actif = actif; ecrireLS(CLE.actif, actif); optsPourActif(actif); if (panneau) panneau.changerActif(); } if (unite && UNITES_VOLUME.includes(unite)) { S.unite = unite; ecrireLS(CLE.unite, unite); } synchroUI(); if (!S.charge || (actif && S.donnees == null)) charger(); else { demarrerFlux(); majBadge(); peindre(false); } }
    else arreterFlux();
  }
  panneau = monterPanneau({ zone: zoneDroite, LW, S, opts, esc, nf, compact, sgn, prix, tH, tFr, parId, NOM_U, lireLS, ecrireLS, sauverOpts: () => sauverOpts(), creerEchelles, seuilGrosses, niveauProche, ageDonnee,
    donneesJ: () => donneesJ(), donneesH1: () => donneesH1(), detailsHtml, surIct: (A, force) => { if (force) majIctPrincipal(); } });
  S.fp = creerStoreFootprint({ surChange: () => { couche && couche.req && couche.req(); majBadge(); } }); S.fp.chargerIndex();
  synchroUI(); majBadge();
  return { ouvrir: ouvrirMode, fermer: () => ouvrirMode(false), estOuvert: () => S.ouvert, analyse, pocsNus: pocsNusTexte, ancrer: () => { S.modeAncre = true; $('[data-ancrer]').setAttribute('aria-pressed', 'true'); zoneGraph.classList.add('tpv-ancre'); return 'Touche la bougie où ancrer le VWAP.'; },
    reaction: () => (!S.charge || !S.bars.length ? `Le terminal Volume de ${parId[S.actif].nom} n’a pas encore de données.` : (calculerReaction(), phraseNiveaux(S.reactionTous, NOM_PARLE[S.actif] || parId[S.actif].nom, S.bars[S.bars.length - 1].c, v => prix(S.actif, v)))),
    barres: () => S.bars.map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, long: !!b.long })), controle: () => ({ incidents: S.controle ? S.controle.incidents.length : null, trous: S.controle ? S.controle.trous : null, raccord: S.raccord || null, repli: S.donnees && S.donnees.repli || null, source: S.donnees && S.donnees.source }),
    echelle: () => (S.ech ? S.ech.etat() : null), echelleAuto: () => { if (S.ech) S.ech.auto(); }, echelleV: (f, y) => { if (S.ech) S.ech.zoomerV(f, y == null ? zoneGraph.clientHeight * 0.4 : y); },
    zoomer: (n = 8, decalage = 0) => { const L = S.bars.length; if (!chart || !L) return false; sauteRange = false; chart.timeScale().setVisibleLogicalRange({ from: L - n - decalage, to: L + 1 - decalage }); return true; },
    definirOpt: (k, v) => { opts[k] = v; sauverOpts(); synchroUI(); peindre(false); },
    ancrerDerniere: () => { if (S.bars.length) ancrerEn(S.bars[S.bars.length - 1].t); return 'VWAP ancré sur la dernière bougie.'; }, definir: ({ actif, unite }) => { if (actif && parId[actif] && actif !== S.actif) { S.actif = actif; ecrireLS(CLE.actif, actif); optsPourActif(actif); if (panneau) panneau.changerActif(); } if (unite && UNITES_VOLUME.includes(unite)) { S.unite = unite; ecrireLS(CLE.unite, unite); } synchroUI(); return charger(); },
    etat: () => ({ ouvert: S.ouvert, actif: S.actif, unite: S.unite, bougies: S.bars.length, charge: S.charge, erreur: S.erreur, poc: S.prof && S.prof.poc.prix, val: S.prof && S.prof.val, vah: S.prof && S.prof.vah, hvn: S.prof ? S.prof.hvn.length : 0, niveaux: S.niveaux.length, reactionTous: S.reactionTous ? S.reactionTous.length : 0, onglet: panneau ? panneau.onglet() : null, profil: profilDe(S.actif).id, etiquettes: etiqAxe ? etiqAxe.taille() : 0, reaction: S.reaction.map(n => ({ prix: n.prix, reactions: n.reactions, force: n.force, forceRel: n.forceRel, sources: n.sources, unite: n.unite })), empiles: S.zonesEmp.size, fleches: S.fleches.length, flechesMA: S.flechesMA.length, deltaReel: S.donnees && S.donnees.deltaReel, source: S.donnees && S.donnees.source,
      flux: Object.fromEntries(Object.entries(S.etatFlux).map(([k, v]) => [k, v.etat])), carnet: !!S.book, murs: S.book ? murs(S.book).length : 0, gros: S.gros.liste().length, badge: $('[data-badge]').textContent, empreintes: S.live ? S.live.nHeures() : 0, fp: { index: !!(S.fp && S.fp.indexPret()), erreur: S.fp && S.fp.erreurIndex(), info: S.fp && S.fp.info(S.actif) && { debut: S.fp.info(S.actif).debut, dernier: S.fp.info(S.actif).dernier }, rendu: S.rendu ? { actif: S.rendu.actif, esp: Math.round(S.rendu.esp), pas: S.rendu.pas, px: S.rendu.px, ms: S.rendu.ms, msMoy: S.msN ? S.msSomme / S.msN : null, msMax: S.msMax, bougies: S.rendu.lignes ? [...S.rendu.lignes.values()].filter(x => x.A).length : 0, sansEmpreinte: S.rendu.lignes ? [...S.rendu.lignes.values()].filter(x => !x.A).length : 0, partielles: S.rendu.lignes ? [...S.rendu.lignes.values()].filter(x => x.res && x.res.partielle).length : 0 } : null, chargement: S.fp ? S.fp.chargement() : 0, rattrapage: S.ratt ? { ...S.ratt.etat, file: S.ratt.fileLongueur(), heures: S.live ? S.live.nCompletes() : 0 } : null }, panneaux: chart ? chart.panes().length : 0, lignes: S.lignes.length, series: S.seriesVwap.length }) };
}
