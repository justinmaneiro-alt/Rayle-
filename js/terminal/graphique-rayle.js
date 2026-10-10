/* ═════════════ GRAPHIQUE « RAYLÉ » (TradingView Lightweight Charts, hébergé ici dans js/vendor) ═════════════
   Contrairement au widget TradingView (une fenêtre fermée dont on ne peut ni lire ni piloter le contenu), ce graphique est dessiné par la page
   avec les données du Worker (/graphique) : Raylé règle tout (unité de temps, RSI en sous-fenêtre, EMA 200, supports et résistances, annotations,
   numérotation des bougies) et lit exactement les mêmes chiffres. Le widget TradingView reste disponible pour l'analyse manuelle. */
import { appelWorker, esc, hhmm, nombre, sansAnimation } from './hud.js';

const IV_WORKER = { '5': '5min', '15': '15min', '60': '1h', '240': '4h', 'D': '1day' };
export const LIBELLE_IV = { '5': 'M5', '15': 'M15', '60': 'H1', '240': 'H4', 'D': 'D1' };
const COULEURS = { haut: '#17d98a', bas: '#ff3b5e', ema: '#ff3399', rsi: '#b78cff', texte: '#9a8fa6', grille: 'rgba(255,0,127,.07)', bordure: 'rgba(255,0,127,.25)', fond: '#06040b', neutre: '#f5b642' };
const PARIS = 'Europe/Paris';
const fHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, hour: '2-digit', minute: '2-digit' });
const fJour = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, day: 'numeric', month: 'short' });
const fMois = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, month: 'short' });

let lwcPromesse = null;
function chargerLWC() {
  if (window.LightweightCharts) return Promise.resolve(window.LightweightCharts);
  if (lwcPromesse) return lwcPromesse;
  lwcPromesse = new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = new URL('js/vendor/lightweight-charts.js', document.baseURI).href; s.async = true;
    s.onload = () => window.LightweightCharts ? ok(window.LightweightCharts) : ko(new Error('bibliothèque de graphique vide'));
    s.onerror = () => { lwcPromesse = null; ko(new Error('bibliothèque de graphique introuvable')); };
    document.head.appendChild(s);
  });
  return lwcPromesse;
}

export function creerGraphique({ boite, surChangement }) {
  boite.innerHTML =
    '<div class="rc-wrap">'
    + '<div class="rc-bar" role="toolbar" aria-label="Réglages du graphique Raylé">'
    + '<button type="button" data-r="rsi" title="RSI 14 en sous-fenêtre">RSI</button>'
    + '<button type="button" data-r="ma200" title="Moyenne mobile exponentielle 200">EMA 200</button>'
    + '<button type="button" data-r="supports" title="Supports et résistances calculés automatiquement">Supports</button>'
    + '<button type="button" data-a="bougies" title="Numéroter et décrire les 10 dernières bougies">Bougies</button>'
    + '<button type="button" data-a="effacer" title="Effacer annotations et numéros">Effacer</button>'
    + '<span class="rc-info" id="rcInfo"></span>'
    + '</div>'
    + '<div class="rc-canvas"></div>'
    + '<div class="rc-legende" aria-live="off"></div>'
    + '<div class="rc-bougies" hidden></div>'
    + '<div class="rc-etat"></div>'
    + '<i class="rc-scan"></i>'
    + '</div>';
  const $ = s => boite.querySelector(s);
  const zone = $('.rc-canvas'), legende = $('.rc-legende'), etat = $('.rc-etat'), liste = $('.rc-bougies'), info = $('#rcInfo');

  const reglages = { rsi: true, ma200: true, supports: true };
  let LW = null, chart = null, bougies = null, ema = null, rsiS = null, marqueurs = null;
  let actif = 'NDX', iv = '60', donnees = null, lignesSR = [], lignesRSI = [], annotations = [], lignesAnnot = [], numeros = [];
  let jeton = 0, minuteur = null, visible = false, rafraichirMs = 60000;
  let cadrageAuto = true, tailleNulle = false, attenteTaille = null;

  const secondes = t => Math.floor(t / 1000);
  const dec = () => (donnees && donnees.decimales != null) ? donnees.decimales : 2;
  const formatPrix = v => v == null ? '—' : nombre(v, dec());

  function syncBoutons() {
    boite.querySelectorAll('[data-r]').forEach(b => b.classList.toggle('actif', !!reglages[b.dataset.r]));
  }
  function message(txt, erreur) { etat.textContent = txt || ''; etat.className = 'rc-etat' + (txt ? (erreur ? ' erreur' : ' visible') : ''); }

  async function creer() {
    if (chart) return true;
    try { LW = await chargerLWC(); } catch (e) { message('Graphique Raylé indisponible : ' + e.message, true); return false; }
    chart = LW.createChart(zone, {
      autoSize: true,
      layout: { background: { type: 'solid', color: COULEURS.fond }, textColor: COULEURS.texte, fontFamily: '"Courier New", monospace', fontSize: 11, panes: { separatorColor: 'rgba(255,0,127,.35)', separatorHoverColor: 'rgba(255,0,127,.6)' } },
      grid: { vertLines: { color: COULEURS.grille }, horzLines: { color: COULEURS.grille } },
      crosshair: { mode: LW.CrosshairMode.Normal, vertLine: { color: 'rgba(255,51,153,.6)', labelBackgroundColor: '#ff007f' }, horzLine: { color: 'rgba(255,51,153,.6)', labelBackgroundColor: '#ff007f' } },
      rightPriceScale: { borderColor: COULEURS.bordure },
      timeScale: {
        borderColor: COULEURS.bordure, timeVisible: true, secondsVisible: false, rightOffset: 6,
        tickMarkFormatter: (t, type) => type >= 3 ? fHeure.format(t * 1000) : type === 1 ? fMois.format(t * 1000) : fJour.format(t * 1000)
      },
      localization: { timeFormatter: t => fJour.format(t * 1000) + ' ' + fHeure.format(t * 1000) },
      handleScale: { axisPressedMouseMove: true }
    });
    bougies = chart.addSeries(LW.CandlestickSeries, { upColor: COULEURS.haut, downColor: COULEURS.bas, borderUpColor: COULEURS.haut, borderDownColor: COULEURS.bas, wickUpColor: COULEURS.haut, wickDownColor: COULEURS.bas, priceLineColor: '#ff3399' }, 0);
    ema = chart.addSeries(LW.LineSeries, { color: COULEURS.ema, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0);
    marqueurs = LW.createSeriesMarkers(bougies, []);
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => requestAnimationFrame(etiquettesSansChevauchement));
    chart.subscribeCrosshairMove(p => {
      const c = p && p.seriesData && p.seriesData.get(bougies);
      if (!c) { majLegende(); return; }
      legende.innerHTML = ligneLegende(c, p.seriesData.get(rsiS));
    });
    const manuel = () => { cadrageAuto = false; };
    zone.addEventListener('wheel', manuel, { passive: true }); zone.addEventListener('pointerdown', manuel, { passive: true });
    new ResizeObserver(() => {
      const w = zone.clientWidth, h = zone.clientHeight;
      if (!w || !h) { tailleNulle = true; return; }                 // panneau caché : on attend qu'il redevienne visible
      try { chart.resize(w, h); } catch (e) {}
      if (tailleNulle || cadrageAuto) { tailleNulle = false; if (donnees) cadrer(); }
      requestAnimationFrame(etiquettesSansChevauchement);
      if (attenteTaille) { const f = attenteTaille; attenteTaille = null; f(); }
    }).observe(zone);
    return true;
  }

  function ligneLegende(c, r) {
    const cl = c.close >= c.open ? 'up' : 'down';
    return '<b>' + esc(donnees ? donnees.nom || actif : actif) + '</b>' + (donnees && donnees.secours ? ' <span class="warn">[SECOURS ' + esc(donnees.symbole_source) + ']</span>' : '') + ' · ' + LIBELLE_IV[iv] + ' <span class="' + cl + '">O ' + formatPrix(c.open) + ' H ' + formatPrix(c.high) + ' B ' + formatPrix(c.low) + ' C ' + formatPrix(c.close) + '</span>'
      + (r && r.value != null ? ' · RSI <span>' + nombre(r.value, 1) + '</span>' : '');
  }
  function majLegende() {
    if (!donnees) { legende.textContent = ''; return; }
    const b = donnees.bougies[donnees.bougies.length - 1];
    legende.innerHTML = ligneLegende({ open: b.o, high: b.h, low: b.l, close: b.c }, rsiS ? { value: donnees.rsi_dernier } : null);
  }

  function cadrer() {                  // montre les ~130 dernières bougies, calées à droite
    if (!chart || !donnees) return;
    const n = donnees.bougies.length;
    try { chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 130), to: n + 6 }); } catch (e) {}
    cadrageAuto = true;
  }
  // Le graphique ne se dessine correctement que dans un conteneur qui a une taille : on attend (3 s au plus) qu'il en ait une
  function attendreTaille() {
    if (zone.clientWidth > 0 && zone.clientHeight > 0) return Promise.resolve();
    return new Promise(ok => { const t = setTimeout(() => { attenteTaille = null; ok(); }, 3000); attenteTaille = () => { clearTimeout(t); ok(); }; });
  }

  /* ── Données ── */
  const valide = b => [b.o, b.h, b.l, b.c].every(v => typeof v === 'number' && isFinite(v));
  const barres = d => {            // temps croissants et uniques (obligatoire pour Lightweight Charts), sans valeur invalide
    const vus = new Set(), out = [];
    for (const b of d.bougies.slice().sort((u, v) => u.t - v.t)) {
      const t = secondes(b.t);
      if (!valide(b) || vus.has(t)) continue;
      vus.add(t); out.push({ time: t, open: b.o, high: b.h, low: b.l, close: b.c });
    }
    return out;
  };
  const serie = (d, tab) => {
    const vus = new Set(), out = [];
    d.bougies.map((b, i) => [secondes(b.t), tab[i]]).sort((u, v) => u[0] - v[0]).forEach(([t, v]) => {
      if (vus.has(t)) return; vus.add(t); out.push(v == null || !isFinite(v) ? { time: t } : { time: t, value: v });
    });
    return out;
  };

  function poserRSI() {
    if (!chart) return;
    if (reglages.rsi && !rsiS && donnees) {
      rsiS = chart.addSeries(LW.LineSeries, {
        color: COULEURS.rsi, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
        autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } })
      }, 1);
      rsiS.setData(serie(donnees, donnees.rsi));
      try { chart.priceScale('right', 1).applyOptions({ scaleMargins: { top: 0.08, bottom: 0.08 } }); } catch (e) {}
      lignesRSI = [[70, COULEURS.bas], [50, 'rgba(255,0,127,.35)'], [30, COULEURS.haut]].map(([p, c]) => rsiS.createPriceLine({ price: p, color: c, lineWidth: 1, lineStyle: LW.LineStyle.Dashed, axisLabelVisible: p !== 50, title: '' }));
      try { const ps = chart.panes(); if (ps[0] && ps[0].setStretchFactor) { ps[0].setStretchFactor(3); ps[1].setStretchFactor(1); } } catch (e) {}
    } else if (!reglages.rsi && rsiS) {
      try { chart.removeSeries(rsiS); } catch (e) {}
      rsiS = null; lignesRSI = [];
    }
    majLegende();
  }
  function poserEMA() {
    if (!ema) return;
    if (reglages.ma200 && donnees) ema.setData(donnees.ema200_disponible ? serie(donnees, donnees.ema200) : []);
    else ema.setData([]);
  }
  function poserSupports() {
    if (!bougies) return;
    lignesSR.forEach(o => { try { bougies.removePriceLine(o.l); } catch (e) {} });
    lignesSR = [];
    if (!reglages.supports || !donnees) return;
    const tracer = (liste, couleur, pre) => liste.forEach((z, i) => {
      const titre = pre + (i + 1) + (z.force === 'forte' ? ' ●' : '');
      lignesSR.push({ prix: z.prix, titre, visible: true, l: bougies.createPriceLine({ price: z.prix, color: couleur, lineWidth: z.force === 'forte' ? 2 : 1, lineStyle: LW.LineStyle.Dashed, axisLabelVisible: true, title: titre }) });
    });
    tracer(donnees.supports, COULEURS.haut, 'S'); tracer(donnees.resistances, COULEURS.bas, 'R');
    requestAnimationFrame(etiquettesSansChevauchement);
  }
  // Les étiquettes de prix ne doivent jamais se chevaucher (téléphone) : de la plus proche du prix à la plus lointaine, on cache celles qui gêneraient
  function etiquettesSansChevauchement() {
    if (!bougies || !lignesSR.length || !donnees) return;
    const HAUT = 17, pris = [], y0 = bougies.priceToCoordinate(donnees.prix);
    if (y0 != null) pris.push(y0);
    lignesSR.slice().sort((u, v) => Math.abs(u.prix - donnees.prix) - Math.abs(v.prix - donnees.prix)).forEach(o => {
      const y = bougies.priceToCoordinate(o.prix);
      const ok = y != null && pris.every(q => Math.abs(q - y) >= HAUT);
      if (ok) pris.push(y);
      if (ok !== o.visible) { o.visible = ok; try { o.l.applyOptions({ axisLabelVisible: ok, title: ok ? o.titre : '' }); } catch (e) {} }
    });
  }
  function poserAnnotations() {
    if (!bougies) return;
    lignesAnnot.forEach(l => { try { bougies.removePriceLine(l); } catch (e) {} });
    lignesAnnot = annotations.map(a => bougies.createPriceLine({
      price: a.prix, color: a.couleur === 'haussier' ? COULEURS.haut : a.couleur === 'baissier' ? COULEURS.bas : COULEURS.neutre,
      lineWidth: 2, lineStyle: LW.LineStyle.Dotted, axisLabelVisible: true, title: a.texte || ''
    }));
  }

  function afficherSource() {
    const d = donnees; if (!d) { info.textContent = ''; return; }
    const tags = (d.secours ? ' · SECOURS (' + d.symbole_source + ')' : '') + (d.differe ? ' · DIFFÉRÉ' : '') + (d.perime ? ' · ANCIENNE COPIE' : '');
    info.textContent = d.source + tags + ' · màj ' + hhmm(Date.now()) + (reglages.ma200 && !d.ema200_disponible ? ' · EMA 200 : pas assez de bougies' : '');
    info.title = d.note || ''; info.className = 'rc-info' + (d.secours || d.perime ? ' warn' : '');
  }

  async function charger(a, i, options) {
    if (a) actif = a;
    if (i) iv = i;
    const moi = ++jeton, nouveau = !(options && options.silencieux);
    if (!(await creer())) return;
    if (nouveau) message('Chargement ' + actif + ' ' + LIBELLE_IV[iv] + '…');
    let d;
    try { d = await appelWorker('/graphique?actif=' + encodeURIComponent(actif) + '&intervalle=' + IV_WORKER[iv] + '&n=320', null, 25000); }
    catch (e) {
      if (moi !== jeton) return;
      if (e.code === 401) { message("Code d'accès refusé : vérifie ⚙ Réglages de Raylé.", true); return; }
      if (nouveau || !donnees) message('Graphique indisponible : ' + e.message + '. Nouvel essai automatique.', true);
      return;
    }
    if (moi !== jeton) return;
    await attendreTaille();
    if (moi !== jeton) return;
    const memeSerie = donnees && donnees.actif === d.actif && donnees.intervalle === d.intervalle && !nouveau;
    donnees = d;
    message('');
    try {
    bougies.applyOptions({ priceFormat: { type: 'price', precision: d.decimales, minMove: 1 / Math.pow(10, d.decimales) } });
    if (memeSerie) {                    // mise à jour discrète : on remplace les données sans rejouer l'animation
      bougies.setData(barres(d)); poserEMA(); if (rsiS) rsiS.setData(serie(d, d.rsi));
    } else {
      bougies.setData(barres(d));       // les bougies d'abord : si le reste échoue, elles sont déjà là
      poserRSI(); poserEMA(); if (rsiS) rsiS.setData(serie(d, d.rsi));
      cadrer();
      if (!sansAnimation()) {        // le graphique se dévoile de gauche à droite (CSS), avec un trait lumineux qui le balaye
        zone.classList.remove('revele'); zone.parentNode.classList.remove('balayage'); void zone.offsetWidth;
        zone.classList.add('revele'); zone.parentNode.classList.add('balayage');
      }
    }
    poserRSI(); poserSupports(); poserAnnotations(); afficherSource(); majLegende();
    } catch (e) { message('Graphique Raylé : dessin impossible (' + (e && e.message || e) + ')', true); }
    if (surChangement) surChangement(etatPublic());
  }

  /* ── Réglages (voix ou boutons) ── */
  function regler(r) {
    let change = false;
    for (const k of ['rsi', 'ma200', 'supports']) if (typeof r[k] === 'boolean' && reglages[k] !== r[k]) { reglages[k] = r[k]; change = true; }
    syncBoutons();
    if (!chart) { if (surChangement) surChangement(etatPublic()); return change; }
    if (change) { poserRSI(); poserEMA(); poserSupports(); afficherSource(); }
    if (surChangement) surChangement(etatPublic());
    return change;
  }
  function annoter(a) {
    if (a.effacer) { annotations = []; effacerNumeros(); poserAnnotations(); if (surChangement) surChangement(etatPublic()); return; }
    annotations = annotations.filter(x => Math.abs(x.prix - a.prix) > Math.max(1e-9, a.prix * 0.0002)).concat([{ prix: +a.prix, texte: a.texte || '', couleur: a.couleur || 'neutre' }]).slice(-12);
    poserAnnotations();
    if (surChangement) surChangement(etatPublic());
  }

  /* ── Bougies numérotées et décrites ── */
  function effacerNumeros() {
    numeros = [];
    if (marqueurs) marqueurs.setMarkers([]);
    liste.hidden = true; liste.innerHTML = '';
  }
  async function numeroter(n) {
    n = Math.min(30, Math.max(3, parseInt(n, 10) || 10));
    if (!(await creer())) return false;
    let d;
    try { d = await appelWorker('/bougies?actif=' + encodeURIComponent(actif) + '&intervalle=' + IV_WORKER[iv] + '&n=' + n, null, 25000); }
    catch (e) { message('Bougies indisponibles : ' + e.message, true); setTimeout(() => message(''), 4000); return false; }
    numeros = d.bougies;
    marqueurs.setMarkers(numeros.map((b, i) => ({
      time: secondes(b.t), position: b.sens === 'haussière' ? 'belowBar' : 'aboveBar', shape: 'circle',
      color: b.sens === 'haussière' ? COULEURS.haut : b.sens === 'baissière' ? COULEURS.bas : COULEURS.neutre, text: String(i + 1), size: 1
    })).sort((u, v) => u.time - v.time));
    liste.hidden = false;
    liste.innerHTML = '<div class="rc-bg-tete"><b>' + numeros.length + ' bougies · ' + LIBELLE_IV[iv] + '</b><button type="button" class="rc-x" aria-label="Fermer">✕</button></div>'
      + numeros.map((b, i) => '<div class="rc-bg ' + (b.sens === 'haussière' ? 'up' : b.sens === 'baissière' ? 'down' : '') + '"><span class="n">' + (i + 1) + '</span><span class="h">' + esc(b.heure) + (b.en_cours ? ' · en cours' : '') + '</span>'
        + '<span class="t">' + esc(b.sens) + ', amplitude ' + esc(b.amplitude) + (b.figures.length ? ' · ' + esc(b.figures.join(', ')) : '') + (b.notes.length ? ' · ' + esc(b.notes[0]) : '') + (b.rsi != null ? ' · RSI ' + nombre(b.rsi, 0) : '') + '</span></div>').join('');
    liste.querySelector('.rc-x').onclick = () => { effacerNumeros(); if (surChangement) surChangement(etatPublic()); };
    liste.scrollTop = liste.scrollHeight;
    if (surChangement) surChangement(etatPublic());
    return true;
  }

  /* ── Cycle de vie ── */
  function planifier() {
    clearTimeout(minuteur);
    if (!visible) return;
    minuteur = setTimeout(async () => { if (visible && !document.hidden) await charger(null, null, { silencieux: true }); planifier(); }, rafraichirMs);
  }
  function montrer() { visible = true; planifier(); if (chart && zone.clientWidth > 0) { try { chart.resize(zone.clientWidth, zone.clientHeight); } catch (e) {} if (cadrageAuto) cadrer(); } }
  function cacher() { visible = false; clearTimeout(minuteur); }
  function frequence(ms) { rafraichirMs = ms; planifier(); }

  function etatPublic() {
    const d = donnees;
    return {
      actif, unite: LIBELLE_IV[iv], rsi: reglages.rsi, ma200: reglages.ma200, supports_traces: reglages.supports,
      supports: d && reglages.supports ? d.supports.map(z => z.prix) : [], resistances: d && reglages.supports ? d.resistances.map(z => z.prix) : [],
      ema200: d && d.ema200_disponible ? d.ema200_dernier : null, rsi_dernier: d ? d.rsi_dernier : null, prix: d ? d.prix : null,
      annotations: annotations.map(a => ({ prix: a.prix, texte: a.texte })), bougies_numerotees: numeros.length, source: d ? d.source : null
    };
  }

  boite.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.r) regler({ [b.dataset.r]: !reglages[b.dataset.r] });
    else if (b.dataset.a === 'bougies') numeroter(10);
    else if (b.dataset.a === 'effacer') { annoter({ effacer: true }); }
  });
  syncBoutons();

  return {
    charger, regler, annoter, numeroter, effacerNumeros, montrer, cacher, frequence, etat: etatPublic,
    reglages: () => Object.assign({}, reglages),
    donnees: () => donnees,
    redessiner: () => { if (chart && zone.clientWidth > 0) { try { chart.resize(zone.clientWidth, zone.clientHeight); } catch (e) {} if (cadrageAuto) cadrer(); } }
  };
}
