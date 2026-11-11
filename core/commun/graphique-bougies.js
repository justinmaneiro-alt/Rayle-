"use strict";
/* ═════════════ GRAPHIQUE EN BOUGIES DE L'ACCUEIL (fenêtre « Marché ») ═════════════
   Un vrai graphique en bougies japonaises (Lightweight Charts, déjà copié dans terminal/vendor) alimenté par le MÊME client de marché que le terminal
   et la table de Mars (planetes/mars/pc/trading/session.js : Worker /marche, historique gardé dans le navigateur). Aucune donnée inventée :
   panne ou série vide = « Données indisponibles » avec la raison. Rotation automatique entre BTC, SOL, DOGE, or et US100 (et, au fil des tours,
   M15, H1, H4, D1), arrêtée au survol et au clic, pastilles pour choisir à la main. Mode léger : graphique statique, aucune rotation.
   Calculs purs : graphique-bougies-calcul.js (testé). Utilisation : GraphiqueBougies.monter(conteneur, { leger, surOuvrir }) → { detruire, choisir, pause, reprendre, etat }. */
(function () {
  const K = window.GraphiqueBougiesCalcul; if (!K) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lire = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* stockage refusé */ } };
  const NOMS = { BTC: 'BTC', SOL: 'SOL', DOGE: 'DOGE', XAU: 'OR', US100: 'US100' };
  const LIB_UNITE = { M15: 'M15', H1: 'H1', H4: 'H4', D1: 'D' };
  const base = p => new URL(p, document.baseURI).href;
  let modules = null;
  const charger = () => modules || (modules = Promise.all([import(base('planetes/mars/pc/trading/session.js')), import(base('planetes/mars/pc/trading/instruments.js')), import(base('planetes/mars/pc/trading/serie.js')), import(base('planetes/mars/pc/trading/graphique.js'))])
    .then(([session, instr, serie, graph]) => ({ session, instr, serie, graph })).catch(e => { modules = null; throw e; }));

  function monter(conteneur, opts = {}) {
    let leger = !!opts.leger, enPause = false, pauseSurvol = false, pauseClic = false, idx = Math.max(0, K.indexDe('BTC', 'H1')), minuteur = 0, actif = true, chart = null, serieBougies = null, serieVolume = null, jeton = 0;
    let intervalle = K.intervalleValide(lire('rayle_g1_rotation') || K.INTERVALLE_DEFAUT);
    conteneur.classList.add('gb');
    conteneur.innerHTML =
      '<div class="gb-tete"><div class="gb-nom"><b data-r="nom">—</b><span data-r="unite"></span><em data-r="etat" hidden></em></div>'
     + '<div class="gb-prix"><b data-r="prix">—</b><span data-r="var"></span></div></div>'
     + '<div class="gb-zone"><div class="gb-graph" data-r="graph"></div><p class="gb-msg" data-r="msg" hidden></p></div>'
     + '<div class="gb-pied"><div class="gb-pastilles" data-r="pastilles" role="tablist" aria-label="Instrument"></div><div class="gb-unites" data-r="unites" role="tablist" aria-label="Unité de temps"></div>'
     + '<div class="gb-rot"><button type="button" class="gb-pause" data-r="pause" aria-label="Rotation automatique"></button>'
     + '<label>toutes les <select data-r="delai" aria-label="Délai de rotation">' + [10, 20, 30, 60].map(s => '<option value="' + s + '">' + s + ' s</option>').join('') + '</select></label></div></div>';
    const R = {}; conteneur.querySelectorAll('[data-r]').forEach(e => { R[e.dataset.r] = e; });
    if (![10, 20, 30, 60].includes(intervalle)) R.delai.insertAdjacentHTML('beforeend', '<option value="' + intervalle + '">' + intervalle + ' s</option>');
    R.delai.value = String(intervalle);
    R.pastilles.innerHTML = K.INSTRUMENTS.map(i => '<button type="button" data-i="' + i + '" role="tab">' + NOMS[i] + '</button>').join('');
    R.unites.innerHTML = K.UNITES.slice().sort((a, b) => ['M15', 'H1', 'H4', 'D1'].indexOf(a) - ['M15', 'H1', 'H4', 'D1'].indexOf(b)).map(u => '<button type="button" data-u="' + u + '" role="tab">' + LIB_UNITE[u] + '</button>').join('');

    const paireCourante = () => K.paire(idx);
    function marquer() {
      const p = paireCourante();
      R.pastilles.querySelectorAll('button').forEach(b => { const on = b.dataset.i === p.instrument; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      R.unites.querySelectorAll('button').forEach(b => { const on = b.dataset.u === p.unite; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      const arret = enPause || leger;
      R.pause.textContent = leger ? 'statique' : arret ? '⏵ reprendre' : '⏸ arrêter'; R.pause.disabled = leger;
      conteneur.dataset.rotation = arret ? 'arret' : 'marche';
    }
    function message(txt) { R.msg.hidden = !txt; R.msg.textContent = txt || ''; R.graph.style.visibility = txt ? 'hidden' : 'visible'; }
    function etiqueter(e) { R.etat.hidden = !e; if (e) { R.etat.dataset.etat = e.etat; R.etat.textContent = e.texte; } }

    async function creerChart(m) {
      if (chart) return;
      const LW = await m.graph.chargerBibliotheque();
      const css = getComputedStyle(document.body), acc = (css.getPropertyValue('--g1-a') || '#ff5aa5').trim();
      chart = LW.createChart(R.graph, {
        autoSize: true, layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#9aa3b8', fontFamily: 'Consolas, "Cascadia Mono", ui-monospace, monospace', fontSize: 10, attributionLogo: false },
        grid: { vertLines: { color: 'rgba(255,255,255,.035)' }, horzLines: { color: 'rgba(255,255,255,.045)' } },
        rightPriceScale: { borderColor: 'rgba(255,255,255,.12)', scaleMargins: { top: 0.08, bottom: 0.24 } },
        timeScale: { borderColor: 'rgba(255,255,255,.12)', timeVisible: true, secondsVisible: false, rightOffset: 3, barSpacing: 6, minBarSpacing: 1.5, fixLeftEdge: true,
          tickMarkFormatter: (t, type) => { const d = new Date(t * 1000), o = type >= 3 ? { hour: '2-digit', minute: '2-digit', hour12: false } : { day: 'numeric', month: 'short' }; return d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', ...o }); } },
        crosshair: { mode: LW.CrosshairMode.Normal, vertLine: { color: acc + '66', labelBackgroundColor: '#1b1e30' }, horzLine: { color: acc + '66', labelBackgroundColor: '#1b1e30' } },
        handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false }, handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: false }
      });
      serieBougies = chart.addSeries(LW.CandlestickSeries, { upColor: '#7fe3b0', downColor: '#ff7d8f', borderUpColor: '#7fe3b0', borderDownColor: '#ff7d8f', wickUpColor: '#7fe3b0', wickDownColor: '#ff7d8f', priceLineVisible: true, lastValueVisible: true });
      serieVolume = chart.addSeries(LW.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume', priceLineVisible: false, lastValueVisible: false });
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    }

    async function afficher(motif) {
      const mon = ++jeton, p = paireCourante(); marquer();
      R.nom.textContent = NOMS[p.instrument]; R.unite.textContent = LIB_UNITE[p.unite];
      let m;
      try { m = await charger(); } catch (e) { if (mon === jeton) { etiqueter({ etat: 'indispo', texte: 'INDISPONIBLE' }); R.prix.textContent = '—'; R.var.textContent = ''; message('Données indisponibles : ' + String(e && e.message || e).slice(0, 80)); } return; }
      let client, serie, d1 = null;
      try {
        client = await m.session.obtenirClient();
        serie = await client.serie(p.instrument, p.unite);
        if (p.unite !== 'D1') { try { d1 = await client.serie(p.instrument, 'D1'); } catch (e) { d1 = null; } } else d1 = serie;
      } catch (e) { serie = { bougies: [], erreur: String(e && e.message || e) }; }
      if (mon !== jeton || !actif) return;
      const et = K.etiquette(serie); etiqueter(et);
      if (!serie.bougies || !serie.bougies.length) { R.prix.textContent = '—'; R.var.textContent = ''; message('Données indisponibles' + (serie.erreur ? ' : ' + String(serie.erreur).slice(0, 80) : '')); return; }
      message('');
      try { await creerChart(m); } catch (e) { message('Données indisponibles : graphique non chargé'); return; }
      if (mon !== jeton || !actif) return;
      const ins = m.instr.INSTRUMENTS[p.instrument], dec = ins ? ins.decimales : 2, dn = K.donneesGraphique(serie.bougies, p.unite);
      serieBougies.applyOptions({ priceFormat: { type: 'price', precision: dec, minMove: Math.pow(10, -dec) } });
      serieBougies.setData(dn.bougies); serieVolume.setData(dn.avecVolume ? dn.volumes : []);
      chart.timeScale().fitContent();
      const der = serie.bougies[serie.bougies.length - 1], v = d1 && d1.bougies && d1.bougies.length > 1 ? m.serie.variationJour(d1.bougies, der.c) : null, vr = K.variation(v ? v.pct : null);
      R.prix.textContent = K.prix(der.c, dec); R.var.textContent = vr.texte + (v ? ' · jour' : ''); R.var.dataset.sens = vr.sens;
      conteneur.title = (serie.meta && serie.meta.source ? serie.meta.source + ' · ' : '') + 'dernière bougie ' + m.serie.heureParis(der.t) + ' · ' + m.serie.age(Date.now() - der.t).replace('il y a ', 'il y a ') + (serie.volume && serie.volume.note ? ' · volume : ' + serie.volume.note : '');
      conteneur.dataset.instrument = p.instrument; conteneur.dataset.unite = p.unite; conteneur.dataset.bougies = String(dn.bougies.length);
      if (motif === 'rotation' && !leger) { R.graph.classList.remove('gb-entre'); void R.graph.offsetWidth; R.graph.classList.add('gb-entre'); }
    }

    function planifier() {
      clearTimeout(minuteur); if (!actif || leger || enPause) return;
      minuteur = setTimeout(async () => {
        if (!actif || leger || enPause || document.hidden || !conteneur.offsetParent) { planifier(); return; }
        R.graph.classList.add('gb-sort');
        await new Promise(r => setTimeout(r, 220));
        R.graph.classList.remove('gb-sort');
        idx = (idx + 1) % (K.INSTRUMENTS.length * K.UNITES.length); await afficher('rotation'); planifier();
      }, intervalle * 1000);
    }
    const majPause = () => { enPause = pauseSurvol || pauseClic; marquer(); planifier(); };

    conteneur.addEventListener('pointerenter', () => { if (leger) return; pauseSurvol = true; majPause(); });
    conteneur.addEventListener('pointerleave', () => { pauseSurvol = false; majPause(); });
    conteneur.addEventListener('click', ev => {
      const bi = ev.target.closest('[data-i]'), bu = ev.target.closest('[data-u]'), bp = ev.target.closest('[data-r=pause]');
      if (bi) { choisir(bi.dataset.i, paireCourante().unite); pauseClic = true; majPause(); return; }
      if (bu) { choisir(paireCourante().instrument, bu.dataset.u); pauseClic = true; majPause(); return; }
      if (bp) { pauseClic = !pauseClic; if (!pauseClic) pauseSurvol = false; majPause(); return; }
      if (ev.target.closest('select')) return;
      if (!leger && !pauseClic) { pauseClic = true; majPause(); }   // un clic sur le graphique arrête la rotation
    });
    R.delai.addEventListener('change', () => { intervalle = K.intervalleValide(R.delai.value); ecrire('rayle_g1_rotation', String(intervalle)); planifier(); });

    function choisir(instrument, unite) { const i = K.indexDe(instrument, unite || paireCourante().unite); if (i < 0) return false; idx = i; afficher('choix'); return true; }
    function detruire() { actif = false; clearTimeout(minuteur); try { chart && chart.remove(); } catch (e) { /* déjà retiré */ } chart = null; conteneur.innerHTML = ''; }
    marquer(); afficher('depart').then(planifier);
    const rafraichir = setInterval(() => { if (actif && !document.hidden && conteneur.offsetParent && !leger) afficher('maj'); }, 60000);
    return {
      detruire: () => { clearInterval(rafraichir); detruire(); },
      choisir, pause: () => { pauseClic = true; majPause(); }, reprendre: () => { pauseClic = false; pauseSurvol = false; majPause(); },
      definirLeger: v => { leger = !!v; majPause(); }, actualiser: () => afficher('maj'),
      etat: () => ({ ...paireCourante(), pause: enPause, leger, intervalle, bougies: +conteneur.dataset.bougies || 0 })
    };
  }
  window.GraphiqueBougies = { monter };
})();
