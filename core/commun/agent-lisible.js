"use strict";
/* ═════════════ FENÊTRE AGENT LISIBLE (V13) : AFFICHAGE PARTAGÉ PC / TABLETTE / TÉLÉPHONE ═════════════
   Un seul composant, window.AgentLisible.monter(hote, options). De haut en bas : barre d'état d'une ligne, quatre chiffres, le graphique M15 (bougies + une zone entrée → stop / entrée → objectif par
   position en attente ou en cours, trois au plus, un marqueur ✔ / ✖ par position terminée) avec la mini-courbe de performance sous le même axe de temps, puis la liste compacte en trois groupes.
   Tout le reste est derrière le bouton « Détails » (callback options.surDetails). Les couches liquidité / carnet / zone diamant sont des interrupteurs éteints par défaut. Aucune valeur inventée : sans donnée
   l'écran dit « aucune position en attente » ou « indisponible ». Simulation seulement : aucun ordre. Calculs et textes purs : agent-lisible-calcul.js. */
(function (root) {
  const K = root.AgentLisibleCalcul; if (!K) return;
  const lireLocal = k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, ecrireLocal = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* interdit */ } };
  const COUL = { fond: '#06080c', texte: '#b8c7cf', grille: 'rgba(143,208,227,.06)', bord: 'rgba(143,208,227,.22)' };

  function monter(hote, options = {}) {
    const mobile = !!options.mobile, taillePolice = mobile ? 14 : 13;
    const S = { actif: options.actifInitial || lireLocal('rayle_agent_paire') || 'BTC', lu: null, bougies: [], bougiesActif: null, chart: null, serie: null, perf: null, serieP: null, marqueurs: null, zones: [], focus: null, forcee: null,
      ouverts: {}, lignesOuvertes: new Set(), couches: JSON.parse(lireLocal('rayle_al_couches') || '{}') || {}, detruit: false, htmlListes: '', htmlBarre: '', htmlChiffres: '', LW: null, enCours: false, echecs: 0, minuteur: null, erreurGraphe: '', synchro: false };
    if (!K.ACTIFS.includes(S.actif)) S.actif = 'BTC';
    hote.classList.add('al-hote'); hote.innerHTML = '';
    const racine = document.createElement('div'); racine.className = 'al' + (mobile ? ' al-mobile' : ''); racine.dataset.al = '';
    racine.innerHTML = '<div class="al-haut"><div class="al-barre-hote" data-al-barre></div>' + (options.surDetails ? '<button type="button" class="al-details" data-al-details aria-label="Détails de l’agent">Détails</button>' : '') + '</div>'
      + '<div data-al-chiffres></div>'
      + '<section class="al-graphe" aria-label="Graphique M15"><div class="al-chart" data-al-chart><div class="al-sque" data-al-sque><i></i><i></i><i></i></div></div><div class="al-perf-hote" data-al-perf-hote><div class="al-perf" data-al-perf></div><p class="al-perf-vide" data-al-perf-vide hidden>Pas encore de trade terminé</p></div>'
      + '<details class="al-couches" data-al-couches><summary>Couches</summary><div class="al-couches-liste">'
      + ['liquidite|Liquidité', 'carnet|Carnet d’ordres', 'diamant|Zones diamant'].map(c => { const [id, nom] = c.split('|'); return '<label class="al-couche"><input type="checkbox" data-al-couche="' + id + '"' + (S.couches[id] ? ' checked' : '') + '> ' + nom + '</label>'; }).join('')
      + '</div></details></section>'
      + '<div class="al-listes" data-al-listes><div class="al-sque"><i></i><i></i></div></div>';
    hote.appendChild(racine);
    const q = s => racine.querySelector(s), boite = q('[data-al-chart]');

    /* ── zones dessinées sur le graphique (primitive de série : sous les bougies) ── */
    const primitive = {
      attached(p) { S.prim = p; }, detached() { S.prim = null; }, updateAllViews() {},
      paneViews() {
        return [{ zOrder: () => 'bottom', renderer: () => ({ draw: cible => cible.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => dessinerZones(ctx, mediaSize)) }) }];
      }
    };
    function dessinerZones(ctx, taille) {
      if (!S.serie || !S.chart || !S.zones.length) return;
      const ts = S.chart.timeScale(), yy = v => S.serie.priceToCoordinate(v), L = taille.width, etiq = [];
      for (const z of S.zones) {
        const yE = yy(z.entree), yS = yy(z.stop), yO = yy(z.obj); if (yE == null || yS == null) continue;
        const xd = ts.timeToCoordinate(Math.floor(z.t / K.PAS) * K.PAS / 1000), x0 = Math.max(0, xd == null ? 0 : xd), fort = S.focus === z.id;
        const rect = (ya, yb, col, a) => { ctx.fillStyle = col; ctx.globalAlpha = a; ctx.fillRect(x0, Math.min(ya, yb), Math.max(1, L - x0), Math.abs(ya - yb)); ctx.globalAlpha = 1; };
        rect(yE, yS, K.COULEURS.perte, fort ? .3 : .18); if (yO != null) rect(yE, yO, K.COULEURS.gain, fort ? .3 : .18);
        ctx.strokeStyle = z.enCours ? K.COULEURS.texte : K.COULEURS.attente; ctx.lineWidth = fort ? 2.5 : 1.5; ctx.setLineDash(z.enCours ? [] : [6, 4]); ctx.beginPath(); ctx.moveTo(x0, yE); ctx.lineTo(L, yE); ctx.stroke(); ctx.setLineDash([]);
        if (fort || z.diamant && S.couches.diamant) { ctx.strokeStyle = fort ? K.COULEURS.texte : K.COULEURS.attente; ctx.lineWidth = 1; ctx.strokeRect(x0 + .5, Math.min(yS, yO == null ? yE : yO) + .5, Math.max(1, L - x0 - 1), Math.abs((yO == null ? yE : yO) - yS) - 1); }
        etiq.push({ y: yE, texte: (z.diamant && S.couches.diamant ? '💎 ' : '') + z.etiquette, couleur: z.enCours ? K.COULEURS.texte : K.COULEURS.attente });
      }
      ctx.font = '600 ' + taillePolice + 'px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
      for (const e of K.fusionnerEtiquettes(etiq, taillePolice + 8)) {
        const w = ctx.measureText(e.texte).width + 12, x = L - 6, y = e.y; ctx.fillStyle = 'rgba(6,8,12,.86)'; ctx.fillRect(x - w, y - taillePolice / 2 - 3, w, taillePolice + 6);
        ctx.strokeStyle = e.couleur; ctx.lineWidth = 1; ctx.strokeRect(x - w + .5, y - taillePolice / 2 - 2.5, w - 1, taillePolice + 5); ctx.fillStyle = e.couleur; ctx.fillText(e.texte, x - 6, y + .5);
      }
    }

    /* ── graphique (créé une fois, données remplacées à chaque rafraîchissement) ── */
    async function creerGraphiques() {
      if (S.chart || S.detruit) return true;
      try { S.LW = await options.bibliotheque(); } catch (e) { S.erreurGraphe = 'bibliothèque de graphique introuvable'; return false; }
      if (S.detruit) return false; const LW = S.LW; boite.innerHTML = '';
      const base = { autoSize: true, layout: { background: { type: 'solid', color: COUL.fond }, textColor: COUL.texte, fontFamily: 'Consolas, "Cascadia Mono", ui-monospace, monospace', fontSize: mobile ? 12 : 12, attributionLogo: false }, grid: { vertLines: { color: COUL.grille }, horzLines: { color: COUL.grille } } };
      S.chart = LW.createChart(boite, { ...base, rightPriceScale: { borderColor: COUL.bord, minimumWidth: 70, scaleMargins: { top: .08, bottom: .08 } }, timeScale: { borderColor: COUL.bord, timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: mobile ? 7 : 8 },
        crosshair: { mode: LW.CrosshairMode ? LW.CrosshairMode.Normal : 0 }, handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false }, handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true } });
      S.serie = S.chart.addSeries(LW.CandlestickSeries, { upColor: K.COULEURS.gain, downColor: K.COULEURS.perte, borderUpColor: K.COULEURS.gain, borderDownColor: K.COULEURS.perte, wickUpColor: K.COULEURS.gain, wickDownColor: K.COULEURS.perte, priceLineVisible: true,
        autoscaleInfoProvider: orig => { const r = orig(); if (!r || !r.priceRange || !S.zones.length) return r; let mn = r.priceRange.minValue, mx = r.priceRange.maxValue; for (const z of S.zones) for (const v of [z.stop, z.obj, z.entree]) if (Number.isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } return { ...r, priceRange: { minValue: mn, maxValue: mx } }; } });   // les zones restent toujours visibles
      S.serie.attachPrimitive(primitive); S.marqueurs = LW.createSeriesMarkers(S.serie, []);
      const hp = q('[data-al-perf]');
      S.perf = LW.createChart(hp, { ...base, rightPriceScale: { borderColor: COUL.bord, minimumWidth: 70, scaleMargins: { top: .12, bottom: .12 } }, timeScale: { visible: false, borderColor: COUL.bord }, handleScroll: false, handleScale: false, crosshair: { mode: LW.CrosshairMode ? LW.CrosshairMode.Magnet : 1 } });
      const vert = K.COULEURS.gain, rouge = K.COULEURS.perte;
      S.serieP = S.perf.addSeries(LW.BaselineSeries, { baseValue: { type: 'price', price: 0 }, topLineColor: vert, topFillColor1: 'rgba(39,217,138,.38)', topFillColor2: 'rgba(39,217,138,.04)', bottomLineColor: rouge, bottomFillColor1: 'rgba(255,77,94,.04)', bottomFillColor2: 'rgba(255,77,94,.38)', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, priceFormat: { type: 'custom', formatter: v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1).replace('.', ',') + ' R', minMove: .1 } });
      // même axe de temps : une valeur de la courbe par bougie, plages logiques liées dans les deux sens
      const lier = (a, b) => a.timeScale().subscribeVisibleLogicalRangeChange(r => { if (!r || S.synchro) return; S.synchro = true; try { b.timeScale().setVisibleLogicalRange(r); } catch (e) { /* pas encore de données */ } S.synchro = false; });
      lier(S.chart, S.perf); lier(S.perf, S.chart);
      return true;
    }
    function demandeRedessin() { try { S.chart && S.chart.timeScale().applyOptions({}); } catch (e) { /* rien */ } if (S.prim && S.prim.requestUpdate) S.prim.requestUpdate(); }

    async function bougiesDe(actif) {
      if (options.chargerBougies) { try { const b = await options.chargerBougies(actif); if (b && b.length > 20) return { liste: b, source: 'marché' }; } catch (e) { /* secours : les bougies du mode Trader */ } }
      const l = K.bougiesDeLaVue(S.lu && S.lu.vue, actif); return { liste: l, source: l.length ? 'service' : null };
    }
    async function dessinerGraphique(actualiser) {
      const vue = S.lu && S.lu.vue; if (!vue) { if (!S.chart) boite.innerHTML = '<p class="al-vide al-vide-g">Le graphique apparaît dès que le service Kepler a publié ses données.</p>'; return; }
      const ok = await creerGraphiques(); if (!ok) { boite.innerHTML = '<p class="al-vide al-vide-g">Graphique indisponible : ' + K.esc(S.erreurGraphe) + '. Les positions restent dans la liste.</p>'; return; }
      if (actualiser || S.bougiesActif !== S.actif || !S.bougies.length) { const r = await bougiesDe(S.actif); if (S.detruit) return; if (!r.liste.length) { S.bougies = []; S.serie.setData([]); boite.dataset.source = ''; } else { S.bougies = r.liste; S.serie.setData(S.bougies); boite.dataset.source = r.source; if (S.bougiesActif !== S.actif) S.chart.timeScale().scrollToRealTime(); S.bougiesActif = S.actif; } }
      const px = K.prixActuel(vue, S.actif, S.bougies), pv = K.positionsVisibles(vue, S.actif, px, K.MAX_ZONES);
      let zs = pv.visibles.slice(); if (S.forcee) { const f = K.positionsActif(vue, S.actif).find(p => p.id === S.forcee); if (f && !zs.some(p => p.id === f.id)) zs = zs.slice(0, K.MAX_ZONES - 1).concat(f); }
      S.zones = zs.map(p => ({ id: p.id, t: p.t, entree: p.entree, stop: p.stop, obj: p.cible1, sens: p.sens, enCours: p.statut === 'ouverte', etiquette: K.etiquette(p), diamant: !!p.diamant }));
      const mq = K.marqueursTermines(vue, S.actif).filter(m => !S.bougies.length || m.time >= S.bougies[0].time);
      S.marqueurs.setMarkers(mq.map(m => ({ time: m.time, position: m.gain ? 'aboveBar' : 'belowBar', color: m.gain ? K.COULEURS.gain : K.COULEURS.perte, shape: m.gain ? 'arrowUp' : 'arrowDown', text: m.texte })));
      boite.dataset.nzones = String(S.zones.length); boite.dataset.nmarq = String(mq.length); boite.dataset.actif = S.actif;
      // courbe de performance alignée sur les bougies : une valeur par bougie
      const c = K.courbeAlignee(vue, S.bougies), vide = !c.length || !(vue.courbe && vue.courbe.length);
      q('[data-al-perf-vide]').hidden = !vide; q('[data-al-perf]').style.visibility = vide ? 'hidden' : 'visible';
      S.serieP.setData(vide ? [] : c);
      if (!S.vueFixee && S.bougies.length) { S.vueFixee = true; const n = S.bougies.length; S.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 110), to: n + 6 }); }
      demandeRedessin();
    }

    /* ── barre, chiffres, listes ── */
    function dessinerTexte() {
      const d = S.lu, vue = d && d.vue, now = Date.now();
      const hb = K.htmlBarreEtat({ service: d && d.service, vue, actif: S.actif, comptes: K.comptes(vue), maintenant: now, origine: d && d.origine, recuLe: d && d.recuLe });
      if (hb !== S.htmlBarre) { S.htmlBarre = hb; q('[data-al-barre]').innerHTML = hb; }
      const hc = vue ? K.htmlChiffres(K.quatreChiffres(vue)) : '<div class="al-chiffres" data-vide="1"><span class="al-vide-c">Pas encore de trade terminé</span></div>';
      if (hc !== S.htmlChiffres) { S.htmlChiffres = hc; q('[data-al-chiffres]').innerHTML = hc; }
      let hl;
      if (!vue) hl = '<p class="al-vide">' + (d === null ? 'Je ne vois ni le service du PC ni la copie du serveur. Lance le service Kepler (une étape) : node agent-pc/service.mjs.' : 'Pas encore de données.') + '</p>';
      else { const g = K.groupes(vue, S.actif); hl = (g.attente.length || g.cours.length || g.terminees.length ? '' : K.htmlVide(vue, S.actif, now)) + K.htmlListes(g, S.ouverts); }
      if (hl !== S.htmlListes) {
        const sauve = q('[data-al-listes]').scrollTop; S.htmlListes = hl; const zl = q('[data-al-listes]'); zl.innerHTML = hl;
        zl.querySelectorAll('.al-ligne').forEach(li => { if (S.lignesOuvertes.has(li.dataset.id)) ouvrirLigne(li, true); }); zl.scrollTop = sauve;
      }
    }
    function ouvrirLigne(li, ouvert) { const e = li.querySelector('.al-expl'), b = li.querySelector('.al-ligne-b'); if (e) e.hidden = !ouvert; if (b) b.setAttribute('aria-expanded', ouvert ? 'true' : 'false'); li.classList.toggle('al-ouverte', ouvert); }

    async function rafraichir() {
      if (S.detruit || S.enCours) return; S.enCours = true;
      try {
        const d = await options.lire(); S.lu = d || null; S.echecs = d ? 0 : S.echecs + 1; dessinerTexte(); await dessinerGraphique(true);
      } catch (e) { S.echecs++; S.lu = S.lu || null; dessinerTexte(); }
      finally { S.enCours = false; racine.dataset.charge = '1'; q('[data-al-sque]') && q('[data-al-sque]').remove(); }
    }
    function planifier() {
      if (S.detruit) return; const masque = typeof document !== 'undefined' && document.hidden, base = (options.intervalle || 15000) * (masque ? 5 : 1) * (S.lu && S.lu.origine === 'Worker' ? 3 : 1);
      S.minuteur = setTimeout(async () => { await rafraichir(); planifier(); }, Math.min(base * Math.pow(2, Math.min(S.echecs, 5)), 600e3));
    }

    /* ── interactions ── */
    racine.addEventListener('click', ev => {
      const t = ev.target;
      const a = t.closest('[data-al-actif]'); if (a) { S.actif = a.dataset.alActif; ecrireLocal('rayle_agent_paire', S.actif); S.forcee = null; S.focus = null; S.vueFixee = false; S.htmlBarre = ''; S.htmlListes = ''; dessinerTexte(); dessinerGraphique(true); return; }
      if (t.closest('[data-al-details]')) { options.surDetails && options.surDetails(); return; }
      const v = t.closest('[data-al-voir]'); if (v) { const id = v.dataset.alVoir; S.forcee = id; S.focus = id; dessinerGraphique(false).then(() => { try { boite.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); S.chart.timeScale().scrollToRealTime(); } catch (e) { /* rien */ } demandeRedessin(); }); setTimeout(() => { if (S.focus === id) { S.focus = null; demandeRedessin(); } }, 4000); return; }
      const l = t.closest('[data-al-ligne]'); if (l) { const li = l.closest('.al-ligne'), ouvre = !li.classList.contains('al-ouverte'); ouvrirLigne(li, ouvre); if (ouvre) S.lignesOuvertes.add(li.dataset.id); else S.lignesOuvertes.delete(li.dataset.id); return; }
    });
    racine.addEventListener('toggle', ev => { const g = ev.target.closest && ev.target.closest('[data-groupe]'); if (g) S.ouverts[g.dataset.groupe] = g.open; }, true);
    racine.addEventListener('change', ev => {
      const c = ev.target.closest('[data-al-couche]'); if (!c) return; S.couches[c.dataset.alCouche] = c.checked; ecrireLocal('rayle_al_couches', JSON.stringify(S.couches));
      if (c.dataset.alCouche !== 'diamant' && c.checked && options.surCouche) options.surCouche(c.dataset.alCouche, S.actif);
      demandeRedessin();
    });

    rafraichir().then(planifier);
    return {
      racine, rafraichir: () => rafraichir(), choisirActif(a) { const b = racine.querySelector('[data-al-actif="' + a + '"]'); if (b) b.click(); },
      etat: () => ({ actif: S.actif, zones: S.zones.map(z => z.id), nZones: S.zones.length, etiquettes: S.zones.map(z => z.etiquette), couches: { ...S.couches }, bougies: S.bougies.length, source: boite.dataset.source || '', charge: racine.dataset.charge === '1' }),
      detruire() { S.detruit = true; clearTimeout(S.minuteur); try { S.chart && S.chart.remove(); S.perf && S.perf.remove(); } catch (e) { /* déjà détruit */ } racine.remove(); }
    };
  }
  root.AgentLisible = { monter, K };
})(typeof window !== 'undefined' ? window : globalThis);
