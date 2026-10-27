import { chargerBibliotheque } from './graphique.js';
import { calculerIndicateur, parserIndicateur } from '../agent-m6/chart-etat.js';
import { COULEURS } from '../agent-m6/dessins.js';
import { creerRejeu } from '../agent-m6/rejeu.js';

/* ═════════════ GRAPHIQUE DU POSTE DE PILOTAGE (M5) ═════════════
   Chandeliers (TradingView Lightweight Charts v5) avec :
   - les POSITIONS À PRENDRE (entrée, stop, objectif en lignes ET en zones colorées, R visé) pour les alertes d'ENTRÉE encore valables et les positions simulées ouvertes ;
   - les TRADES PASSÉS (flèche d'entrée, rond de sortie ; vert = gagnant, rouge = perdant) ;
   - les DONNÉES utilisées par les stratégies, activables une à une : POC, zone de valeur, VWAP, extrêmes de l'Asie et de la veille, phase du marché, session ;
   - un clic sur un trade : détail et contexte ; un rejeu pas à pas d'un trade (M15).
   Aucun calcul de stratégie ici : tout vient de l'hôte (bougies, surcouches, trades). Le temps est en secondes UTC (convention de la bibliothèque). */
const C = { fond: '#05090e', texte: '#a9c3d1', grille: 'rgba(77,227,255,.07)', bordure: 'rgba(77,227,255,.25)', haut: '#27d98a', bas: '#ff4d5e', ambre: '#ffb000', cyan: '#4de3ff', violet: '#b78cff', blanc: '#e8f4fa', vwap: '#f9f871' };
const MS = { m15: 900e3, h1: 3600e3, h4: 14400e3 };
export const COUCHES = Object.freeze([
  { id: 'poc', nom: 'POC' }, { id: 'zone', nom: 'Zone de valeur' }, { id: 'vwap', nom: 'VWAP' }, { id: 'asie', nom: 'Extrêmes de l’Asie' }, { id: 'veille', nom: 'Extrêmes de la veille' }, { id: 'liquidite', nom: 'Zones de liquidité' }, { id: 'phase', nom: 'Phase du marché' }, { id: 'session', nom: 'Session' },
  { id: 'ma200', nom: 'MA 200' }, { id: 'ema50', nom: 'EMA 50' }, { id: 'bollinger', nom: 'Bollinger' }, { id: 'rsi', nom: 'RSI (panneau du bas)' }
]);
export const COUCHES_DEFAUT = Object.freeze({ poc: true, zone: false, vwap: false, asie: false, veille: false, liquidite: false, phase: true, session: false, ma200: false, ema50: false, bollinger: false, rsi: false });
const RGBA = { haussier: [39, 217, 138], baissier: [255, 77, 94], neutre: [169, 195, 209], alerte: [255, 176, 0], info: [77, 227, 255], liquidite: [255, 111, 177], valeur: [183, 140, 255] };
const rgba = (couleur, a) => { const c = RGBA[couleur] || RGBA.info; return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
const FORME_MARQUEUR = { fleche_haut: ['belowBar', 'arrowUp'], fleche_bas: ['aboveBar', 'arrowDown'], cercle: ['inBar', 'circle'], carre: ['inBar', 'square'] };
const COUL_PHASE = { 1: 'rgba(39,217,138,.8)', 2: 'rgba(255,77,94,.8)', 3: 'rgba(150,170,185,.6)', 0: 'rgba(255,176,0,.55)' };
const COUL_SESSION = { 0: 'rgba(183,140,255,.7)', 1: 'rgba(77,227,255,.7)', 2: 'rgba(255,176,0,.75)', 3: 'rgba(120,130,140,.5)' };

/* Primitive de dessin : rectangles colorés entre deux prix, d'un instant à un autre (zones de stop et d'objectif). */
function primitiveZones() {
  let zones = [], textes = [], series = null, chart = null, demander = () => {};
  const rendu = { draw(cible) {
    if (!series || !chart || (!zones.length && !textes.length)) return;
    cible.useBitmapCoordinateSpace(({ context: ctx, bitmapSize, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const ts = chart.timeScale();
      for (const z of zones) {
        const y1 = series.priceToCoordinate(z.p1), y2 = series.priceToCoordinate(z.p2); if (y1 == null || y2 == null) continue;
        let x1 = ts.timeToCoordinate(z.t1), x2 = z.t2 == null ? bitmapSize.width / hr : ts.timeToCoordinate(z.t2); if (x1 == null) x1 = 0; if (x2 == null) x2 = bitmapSize.width / hr;
        const x = Math.min(x1, x2) * hr, w = Math.max(2, Math.abs(x2 - x1) * hr), y = Math.min(y1, y2) * vr, h = Math.max(1, Math.abs(y2 - y1) * vr);
        // V2 : une zone plus haute que 70 % du graphique (stop très loin du prix) ne peint JAMAIS un fond : seul le contour reste (c'était le « fond rouge » sur tout le graphique)
        const trop = h > 0.7 * bitmapSize.height;
        if (!trop) { ctx.fillStyle = z.couleur; ctx.fillRect(x, y, w, h); }
        if (z.bordure || trop) { ctx.strokeStyle = z.bordure || z.couleurTexte || '#ffb3bc'; ctx.setLineDash(trop ? [6 * hr, 4 * hr] : []); ctx.lineWidth = Math.max(1, hr); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]); }
        if (z.texte) { ctx.fillStyle = z.couleurTexte || '#fff'; ctx.font = Math.round(11 * vr) + 'px Consolas, monospace'; ctx.fillText(z.texte, x + 4 * hr, y + 13 * vr); }
      }
      for (const tx of textes) {                                    // étiquettes posées à (instant, prix)
        const y = series.priceToCoordinate(tx.prix), x = ts.timeToCoordinate(tx.t); if (y == null || x == null) continue;
        ctx.fillStyle = tx.couleur || '#fff'; ctx.font = Math.round(11 * vr) + 'px Consolas, monospace'; ctx.fillText(tx.texte, x * hr + 4 * hr, y * vr - 4 * vr);
      }
    });
  } };
  const vue = { renderer: () => rendu, zOrder: () => 'bottom' };
  /* les zones entrent dans l'échelle automatique : le prix du stop et de l'objectif restent visibles, la zone est bornée par le graphique */
  const autoscaleInfo = () => { const v = zones.flatMap(z => [z.p1, z.p2]).filter(Number.isFinite); return v.length ? { priceRange: { minValue: Math.min(...v), maxValue: Math.max(...v) } } : null; };
  return { autoscaleInfo, attached(p) { series = p.series; chart = p.chart; demander = p.requestUpdate; }, detached() { series = null; chart = null; }, paneViews: () => [vue], updateAllViews() {}, definir(z, t = []) { zones = z; textes = t; demander(); } };
}

export async function creerGraphiquePoste({ boite, hote, surTrade = () => {}, surBougie = () => {}, surDessin = () => {}, surMessage = () => {} }) {
  const LW = await chargerBibliotheque();
  boite.innerHTML = '<div class="pg-zone"></div><div class="pg-etat"></div>';
  const zone = boite.querySelector('.pg-zone'), etat = boite.querySelector('.pg-etat');
  const chart = LW.createChart(zone, {
    autoSize: true, layout: { background: { type: 'solid', color: C.fond }, textColor: C.texte, fontFamily: 'Consolas, "Cascadia Mono", ui-monospace, monospace', fontSize: 11, attributionLogo: true },
    grid: { vertLines: { color: C.grille }, horzLines: { color: C.grille } }, crosshair: { mode: LW.CrosshairMode.Normal }, rightPriceScale: { borderColor: C.bordure, scaleMargins: { top: 0.06, bottom: 0.12 } },
    timeScale: { borderColor: C.bordure, timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 7, minBarSpacing: 0.3 },
    localization: { locale: 'fr-FR', timeFormatter: t => new Date(t * 1000).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) },
    handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false }, handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true }
  });
  const sec = t => Math.floor(t / 1000);
  const bougiesSerie = chart.addSeries(LW.CandlestickSeries, { upColor: C.haut, downColor: C.bas, borderUpColor: C.haut, borderDownColor: C.bas, wickUpColor: C.haut, wickDownColor: C.bas, priceLineVisible: true });
  const zonesPrim = primitiveZones(); bougiesSerie.attachPrimitive(zonesPrim);
  const marqueurs = LW.createSeriesMarkers(bougiesSerie, []);
  const lignes = {}, lignesPrix = [], lignesLiquidite = [], phaseSerie = chart.addSeries(LW.HistogramSeries, { priceScaleId: 'phase', priceLineVisible: false, lastValueVisible: false }), sessionSerie = chart.addSeries(LW.HistogramSeries, { priceScaleId: 'session', priceLineVisible: false, lastValueVisible: false });
  chart.priceScale('phase').applyOptions({ scaleMargins: { top: 0.95, bottom: 0 } }); chart.priceScale('session').applyOptions({ scaleMargins: { top: 0.915, bottom: 0.045 } });
  let unite = 'm15', couches = { ...COUCHES_DEFAUT }, tradesCourants = [], selection = null, bougiesCourantes = [], positions = [], rejeu = null, detruit = false, fenetre = null, optionsTrades = true;
  let dessins = [], lignesDessins = [], seriesObliques = [], modeDessin = null, pointDessin = null, rsiSerie = null;       // M6 : dessins de l'agent et de l'utilisateur, outil de tracé, RSI en panneau du bas
  const bucket = t => Math.floor(t / MS[unite]) * MS[unite];

  function ligneSerie(nom, couleur, style = 0, largeur = 1.4) {
    if (!lignes[nom]) lignes[nom] = chart.addSeries(LW.LineSeries, { color: couleur, lineWidth: largeur, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    return lignes[nom];
  }
  function videLigne(nom) { if (lignes[nom]) lignes[nom].setData([]); }

  function dessinerCouches(sur) {
    const ok = sur && sur.t.length; const pas = MS[unite];
    const pts = (tab) => { const m = new Map(); for (let i = 0; i < sur.t.length; i++) { const b = unite === 'm15' ? sur.t[i] : bucket(sur.t[i]); if (Number.isFinite(tab[i])) m.set(b, tab[i]); } return [...m].map(([b, v]) => ({ time: sec(b), value: v })); };      // une valeur par bougie : la dernière connue (jamais de point sans valeur)
    const fixe = (nom, couleur, tab, on, style, l) => { const s = ligneSerie(nom, couleur, style, l); s.setData(ok && on ? pts(tab).filter(p => Number.isFinite(p.value)) : []); };
    fixe('poc', C.ambre, sur && sur.poc, couches.poc, 0, 1.6); fixe('vah', 'rgba(77,227,255,.55)', sur && sur.vah, couches.zone, 2, 1); fixe('val', 'rgba(77,227,255,.55)', sur && sur.val, couches.zone, 2, 1);
    fixe('vwap', C.vwap, sur && sur.vwap, couches.vwap, 0, 1.3); fixe('asieH', C.violet, sur && sur.asieHaut, couches.asie, 2, 1); fixe('asieB', C.violet, sur && sur.asieBas, couches.asie, 2, 1); fixe('veilleH', C.blanc, sur && sur.veilleHaut, couches.veille, 3, 1); fixe('veilleB', C.blanc, sur && sur.veilleBas, couches.veille, 3, 1);
    const bande = (serie, tab, on, coul) => { if (!ok || !on) { serie.setData([]); return; } const out = [], vus = new Set(); for (let i = 0; i < sur.t.length; i++) { const b = unite === 'm15' ? sur.t[i] : bucket(sur.t[i]); if (vus.has(b)) { out[out.length - 1].color = coul[tab[i]]; continue; } vus.add(b); out.push({ time: sec(b), value: 1, color: coul[tab[i]] }); } serie.setData(out); };
    for (const l of lignesLiquidite.splice(0)) { try { bougiesSerie.removePriceLine(l); } catch (e) { /* déjà retirée */ } }
    if (ok && couches.liquidite) for (const z of (sur.liquidite || []).slice(0, 6)) lignesLiquidite.push(bougiesSerie.createPriceLine({ price: z.prix, color: 'rgba(255,111,177,.8)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'liq. ' + z.type }));
    bande(phaseSerie, sur && sur.phase, couches.phase, COUL_PHASE); bande(sessionSerie, sur && sur.session, couches.session, COUL_SESSION);
  }

  /* ── M6 : indicateurs en surcouche (MA 200, EMA 50, Bollinger, RSI), calculés ici avec les mêmes fonctions que l'API du graphique, sur les bougies affichées + 260 de chauffe ── */
  function dessinerIndicateurs(tous) {
    const aff = new Set(bougiesCourantes.map(b => b.t)), pts = tab => { const out = []; for (let i = 0; i < tous.length; i++) if (aff.has(tous[i].t) && tab[i] != null) out.push({ time: sec(tous[i].t), value: tab[i] }); return out; };
    const ligne = (nom, couleur, tab, on, style = 0, l = 1.4) => { const s = ligneSerie(nom, couleur, style, l); s.setData(on && tous.length ? pts(tab) : []); };
    const calc = id => calculerIndicateur(tous, parserIndicateur(id)).colonnes;
    ligne('ma200', '#ffffff', couches.ma200 ? calc('ma200').valeur : [], couches.ma200, 0, 1.6);
    ligne('ema50', '#ffb000', couches.ema50 ? calc('ema50').valeur : [], couches.ema50, 0, 1.2);
    const bb = couches.bollinger ? calc('bollinger') : { haut: [], bas: [], milieu: [] };
    ligne('bollH', 'rgba(183,140,255,.8)', bb.haut, couches.bollinger, 2, 1); ligne('bollB', 'rgba(183,140,255,.8)', bb.bas, couches.bollinger, 2, 1); ligne('bollM', 'rgba(183,140,255,.45)', bb.milieu, couches.bollinger, 3, 1);
    if (couches.rsi && tous.length) {
      if (!rsiSerie) { try { rsiSerie = chart.addSeries(LW.LineSeries, { color: '#4de3ff', lineWidth: 1.4, priceLineVisible: false, lastValueVisible: true }, 1); } catch (e) { rsiSerie = null; } }
      if (rsiSerie) rsiSerie.setData(pts(calc('rsi14').valeur));
    } else if (rsiSerie) { try { chart.removeSeries(rsiSerie); } catch (e) { /* déjà retirée */ } rsiSerie = null; }
  }

  /* ── M6 : dessins (agent et utilisateur) ── */
  function dessinerDessins() {
    for (const l of lignesDessins.splice(0)) { try { bougiesSerie.removePriceLine(l); } catch (e) { /* déjà retirée */ } }
    for (const s of seriesObliques.splice(0)) { try { chart.removeSeries(s); } catch (e) { /* déjà retirée */ } }
    const zones = [], textes = [];
    for (const d of dessins) {
      if (d.visible === false) continue; const couleur = COULEURS[d.couleur] || COULEURS.info, nom = d.etiquette ? d.etiquette : '', moi = d.auteur === 'utilisateur' ? '✎ ' : '';
      if (d.type === 'zone' || d.type === 'zone_liquidite' || d.type === 'zone_valeur') zones.push({ t1: d.de != null ? sec(bucket(d.de)) : sec(bougiesCourantes.length ? bougiesCourantes[0].t : 0), t2: d.a != null ? sec(bucket(d.a)) : null, p1: d.prixHaut, p2: d.prixBas, couleur: rgba(d.couleur, d.type === 'zone' ? 0.16 : 0.12), bordure: rgba(d.couleur, 0.55), texte: moi + nom, couleurTexte: couleur });
      else if (d.type === 'ligne_h' || d.type === 'poc') lignesDessins.push(bougiesSerie.createPriceLine({ price: d.prix, color: couleur, lineWidth: d.type === 'poc' ? 2 : 1, lineStyle: d.type === 'poc' ? 0 : 2, axisLabelVisible: true, title: moi + (nom || (d.type === 'poc' ? 'POC' : '')) }));
      else if (d.type === 'ligne') { const s = chart.addSeries(LW.LineSeries, { color: couleur, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }); s.setData([{ time: sec(bucket(d.de)), value: d.prixDe }, { time: sec(bucket(d.a)), value: d.prixA }]); seriesObliques.push(s); if (nom) textes.push({ t: sec(bucket(d.a)), prix: d.prixA, texte: moi + nom, couleur }); }
      else if (d.type === 'etiquette') textes.push({ t: sec(bucket(d.t)), prix: d.prix, texte: moi + nom, couleur });
      else if (d.type === 'trade') {
        const t1 = sec(bucket(d.t != null ? d.t : Date.now())), t2 = d.a ? sec(bucket(d.a)) : null, long = d.sens > 0;
        zones.push({ t1, t2, p1: d.entree, p2: d.stop, couleur: 'rgba(255,77,94,.18)', texte: 'Stop', couleurTexte: '#ffb3bc' }, { t1, t2, p1: d.entree, p2: d.objectif, couleur: 'rgba(39,217,138,.16)', texte: 'Objectif · ' + d.R.toFixed(1).replace('.', ',') + ' R', couleurTexte: '#b7f7d4' });
        lignesDessins.push(bougiesSerie.createPriceLine({ price: d.entree, color: COULEURS.info, lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: moi + (nom ? nom + ' · ' : '') + (long ? 'ACHAT' : 'VENTE') }), bougiesSerie.createPriceLine({ price: d.stop, color: COULEURS.baissier, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'stop' }), bougiesSerie.createPriceLine({ price: d.objectif, color: COULEURS.haussier, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'objectif' }));
      }
    }
    zonesPrim.definir([...zonesPosition, ...zones], textes);
  }
  let zonesPosition = [];

  function dessinerMarqueurs() {
    const liste = [], tempsValides = new Set(bougiesCourantes.map(b => b.t));
    for (const d of dessins) if (d.type === 'marqueur' && d.visible !== false && tempsValides.has(bucket(d.t))) { const f = FORME_MARQUEUR[d.forme] || FORME_MARQUEUR.cercle; liste.push({ time: sec(bucket(d.t)), position: f[0], color: COULEURS[d.couleur] || COULEURS.info, shape: f[1], text: (d.auteur === 'utilisateur' ? '✎ ' : '') + (d.etiquette || ''), size: 1 }); }
    if (optionsTrades) for (const x of tradesCourants) {
      const te = bucket(x.t), ts = x.tSortie ? bucket(x.tSortie) : null, gagne = x.R > 0, couleur = gagne ? C.haut : C.bas, choisi = selection && selection.t === x.t && selection.strategie === x.strategie;
      if (tempsValides.has(te)) liste.push({ time: sec(te), position: x.sens > 0 ? 'belowBar' : 'aboveBar', color: choisi ? '#ffffff' : couleur, shape: x.sens > 0 ? 'arrowUp' : 'arrowDown', text: choisi ? (x.sens > 0 ? 'Achat ' : 'Vente ') + (x.R > 0 ? '+' : '') + x.R.toFixed(2) + ' R' : '', size: choisi ? 2 : 1 });
      if (ts != null && tempsValides.has(ts)) liste.push({ time: sec(ts), position: x.sens > 0 ? 'aboveBar' : 'belowBar', color: choisi ? '#ffffff' : couleur, shape: 'circle', text: choisi ? 'Sortie (' + x.motif + ')' : '', size: choisi ? 2 : 1 });
    }
    liste.sort((a, b) => a.time - b.time); marqueurs.setMarkers(liste);
  }

  function dessinerPositions() {
    for (const l of lignesPrix.splice(0)) { try { bougiesSerie.removePriceLine(l); } catch (e) { /* déjà retirée */ } }
    const zones = [];
    for (const p of positions) {
      const t1 = sec(bucket(p.t)), t2 = p.tFin ? sec(bucket(p.tFin)) : null, long = p.sens > 0, nom = (p.nom ? p.nom + ' · ' : '');
      const R = Math.abs(p.entree - p.stop) > 0 ? Math.abs(p.cible - p.entree) / Math.abs(p.entree - p.stop) : null;
      zones.push({ t1, t2, p1: p.entree, p2: p.stop, couleur: 'rgba(255,77,94,.20)', texte: 'Stop', couleurTexte: '#ffb3bc' }, { t1, t2, p1: p.entree, p2: p.cible, couleur: 'rgba(39,217,138,.18)', texte: 'Objectif' + (R ? ' · ' + R.toFixed(1).replace('.', ',') + ' R' : ''), couleurTexte: '#b7f7d4' });
      lignesPrix.push(bougiesSerie.createPriceLine({ price: p.entree, color: C.cyan, lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: nom + (long ? 'ACHAT' : 'VENTE') + ' ' + (p.etiquette || '') }), bougiesSerie.createPriceLine({ price: p.stop, color: C.bas, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'stop' }), bougiesSerie.createPriceLine({ price: p.cible, color: C.haut, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'objectif' }));
    }
    zonesPosition = zones; dessinerDessins();
  }

  /* Charge les bougies : les plus récentes, ou une fenêtre [t0, t1] (aller à un trade). */
  async function charger(opt = {}) {
    if (opt.unite) unite = opt.unite; if (opt.couches) couches = { ...couches, ...opt.couches }; if (opt.trades !== undefined) tradesCourants = opt.trades || []; if (opt.positions !== undefined) positions = opt.positions || []; if (opt.optionsTrades !== undefined) optionsTrades = !!opt.optionsTrades; if (opt.fenetre !== undefined) fenetre = opt.fenetre; if (opt.dessins !== undefined) dessins = opt.dessins || [];
    const n = unite === 'm15' ? 1500 : unite === 'h1' ? 1100 : 700;
    const r = fenetre ? hote.bougiesEntre(unite, fenetre.t0, fenetre.t1) : hote.bougies(unite, n);
    const veutIndic = couches.ma200 || couches.ema50 || couches.bollinger || couches.rsi, tousIndic = veutIndic ? (fenetre ? r.bougies : hote.bougies(unite, n + 260).bougies) : [];
    bougiesCourantes = r.bougies.map(b => ({ ...b, t: b.t })); etat.textContent = bougiesCourantes.length ? '' : 'Aucune bougie : l’historique n’est pas encore chargé.';
    bougiesSerie.setData(bougiesCourantes.map(b => ({ time: sec(b.t), open: b.o, high: b.h, low: b.l, close: b.c })));
    let sur = null; if (!fenetre && (couches.poc || couches.zone || couches.vwap || couches.asie || couches.veille || couches.liquidite || couches.phase || couches.session)) { try { sur = hote.surcouches(unite === 'm15' ? 1500 : unite === 'h1' ? 4000 : 6000); } catch (e) { sur = null; } }
    dessinerCouches(sur); dessinerIndicateurs(tousIndic); dessinerMarqueurs(); dessinerPositions();
    if (fenetre && Object.values(couches).some(Boolean) && bougiesCourantes.length) etat.textContent = 'Les données de stratégie (POC, VWAP, phase…) ne s’affichent que sur la période récente. Clique sur « Dernier trade » ou une stratégie pour revenir au présent.';
    if (opt.cadrer !== false) { if (fenetre) chart.timeScale().fitContent(); else chart.timeScale().scrollToRealTime(); }
    return bougiesCourantes.length;
  }
  function selectionner(x) { selection = x; dessinerMarqueurs(); }
  /* Clic : le trade dont l'entrée ou la sortie est à la bougie cliquée. */
  chart.subscribeClick(p => {
    if (!p.time) return; const t = p.time * 1000;
    if (modeDessin) { clicDessin(p); return; }                                        // outil de tracé actif : le clic place un point
    const x = tradesCourants.find(x => bucket(x.t) === t || (x.tSortie && bucket(x.tSortie) === t)) || tradesCourants.find(x => t >= bucket(x.t) && x.tSortie && t <= bucket(x.tSortie));
    if (x) { selectionner(x); surTrade(x); return; }
    if (unite === 'm15' || unite === 'h1' || unite === 'h4') surBougie({ t, unite });                                  // clic sur une bougie : Rayle explique son contexte
  });

  /* ── M6 : tracer ses propres dessins (zone en deux clics, ligne horizontale en un clic) ── */
  function clicDessin(p) {
    const prix = bougiesSerie.coordinateToPrice(p.point ? p.point.y : 0); if (prix == null || !Number.isFinite(prix)) return;
    const t = p.time * 1000;
    if (modeDessin === 'ligne') { const m = modeDessin; modeDessin = null; pointDessin = null; zone.style.cursor = ''; surDessin({ type: 'ligne_h', prix, etiquette: 'ma ligne', auteur: 'utilisateur', groupe: 'mes dessins' }, m); return; }
    if (modeDessin === 'zone') {
      if (!pointDessin) { pointDessin = { t, prix }; surMessage('Zone : clique le deuxième coin.'); return; }
      const a = pointDessin; pointDessin = null; modeDessin = null; zone.style.cursor = '';
      if (Math.abs(a.prix - prix) < 1e-12) { surMessage('Zone annulée : les deux coins ont le même prix.'); return; }
      surDessin({ type: 'zone', prixHaut: Math.max(a.prix, prix), prixBas: Math.min(a.prix, prix), de: Math.min(a.t, t), a: Math.max(a.t, t) === Math.min(a.t, t) ? null : Math.max(a.t, t), etiquette: 'ma zone', auteur: 'utilisateur', groupe: 'mes dessins' }, 'zone');
    }
  }
  function demarrerDessin(mode) { modeDessin = mode === 'zone' || mode === 'ligne' ? mode : null; pointDessin = null; zone.style.cursor = modeDessin ? 'crosshair' : ''; surMessage(modeDessin === 'zone' ? 'Zone : clique le premier coin.' : modeDessin === 'ligne' ? 'Ligne : clique le niveau.' : ''); }

  /* ── Rejeu pas à pas d'un trade (bougies M15) ── */
  function demarrerRejeu(x) {
    const r = hote.bougiesEntre('m15', x.t - 20 * 900e3, (x.tSortie || x.t) + 8 * 900e3, 600).bougies; if (!r.length) return null;
    unite = 'm15'; fenetre = { t0: r[0].t, t1: r[r.length - 1].t }; rejeu = { ctl: creerRejeu({ bougies: r, debut: Math.max(1, r.findIndex(b => b.t >= x.t)) + 1, entree: x }), x };
    for (const k of Object.keys(lignes)) videLigne(k); phaseSerie.setData([]); sessionSerie.setData([]);
    const e = pasRejeu(0); return { total: e.total, entree: e.i };
  }
  /* Rejeu d'une PÉRIODE (sans trade) : de t0 à t1, bougie par bougie, avec le passé seul. */
  function demarrerRejeuPeriode(t0, t1) {
    const r = hote.bougiesEntre('m15', t0, t1, 800).bougies.filter(b => b.t >= t0 && b.t <= t1); if (r.length < 3) return null;
    unite = 'm15'; fenetre = { t0: r[0].t, t1: r[r.length - 1].t }; rejeu = { ctl: creerRejeu({ bougies: r, debut: 2 }), x: null };
    for (const k of Object.keys(lignes)) videLigne(k); phaseSerie.setData([]); sessionSerie.setData([]);
    const e = pasRejeu(0); return { total: e.total, entree: e.i };
  }
  function pasRejeu(d) {
    if (!rejeu) return null; const e = rejeu.ctl.pas(d), x = rejeu.x, vus = e.vues, dernier = e.derniere;
    bougiesSerie.setData(vus.map(b => ({ time: sec(b.t), open: b.o, high: b.h, low: b.l, close: b.c }))); bougiesCourantes = vus;
    const entreePrise = !!(x && dernier.t >= x.t), sortieFaite = !!(x && x.tSortie && dernier.t >= bucket(x.tSortie));
    positions = entreePrise ? [{ t: x.t, tFin: sortieFaite ? x.tSortie : null, sens: x.sens, entree: x.prixEntree, stop: x.stop, cible: x.cible, nom: x.nomStrategie, etiquette: '' }] : []; dessinerPositions();
    const m = []; if (entreePrise) m.push({ time: sec(bucket(x.t)), position: x.sens > 0 ? 'belowBar' : 'aboveBar', color: C.cyan, shape: x.sens > 0 ? 'arrowUp' : 'arrowDown', text: 'Entrée' }); if (sortieFaite) m.push({ time: sec(bucket(x.tSortie)), position: x.sens > 0 ? 'aboveBar' : 'belowBar', color: x.R > 0 ? C.haut : C.bas, shape: 'circle', text: x.motif + ' ' + (x.R > 0 ? '+' : '') + x.R.toFixed(2) + ' R' }); marqueurs.setMarkers(m);
    chart.timeScale().scrollToRealTime();
    return { i: e.i, total: e.total, entreePrise, sortieFaite, fini: e.fini, phrase: e.phrase || null };
  }
  function finRejeu() { rejeu = null; fenetre = null; }
  function detruire() { detruit = true; try { chart.remove(); } catch (e) { /* déjà retiré */ } }
  return { charger, selectionner, demarrerRejeu, demarrerRejeuPeriode, pasRejeu, finRejeu, demarrerDessin, detruire, ajuster: () => chart.timeScale().fitContent(), periodeAffichee: () => (bougiesCourantes.length ? { t0: bougiesCourantes[0].t, t1: bougiesCourantes[bougiesCourantes.length - 1].t } : null),
    etat: () => ({ unite, couches, nBougies: bougiesCourantes.length, nMarqueurs: tradesCourants.length, positions: positions.length, rejeu: !!rejeu, fenetre, dessins: dessins.length, dessinsVisibles: dessins.filter(d => d.visible !== false).length, lignesDessins: lignesDessins.length, modeDessin, rsi: !!rsiSerie }) };
}
