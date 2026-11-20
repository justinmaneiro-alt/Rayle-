/* ═════════════ ÉCHELLES DU GRAPHIQUE : étirer dans tous les sens (v4.1) — modes Classique et Volume ═════════════
   · Axe des prix (à droite) : glisser vers le haut ou le bas étire / écrase les bougies en hauteur (natif Lightweight Charts) ; axe du temps (en bas) : glisser = bougies plus larges / plus serrées (natif).
   · Molette : zoom horizontal (natif) ; Ctrl + molette : zoom VERTICAL autour du curseur (ici).
   · Tactile : pincement à deux doigts dans la direction du geste : horizontal, vertical ou diagonal (ici ; le pincement natif, uniquement horizontal, est coupé).
   · Double-clic / double-tap sur l'axe des prix : retour à l'échelle automatique ; sur l'axe du temps : retour à l'espacement initial.
   · Bouton « Auto » dans le coin de l'axe des prix : allumé quand l'échelle est automatique ; un appui y revient. Bouton « Log » (option) : échelle logarithmique.
   Les fonctions géométriques sont pures et testées (trader-pro/tests/echelles-test.mjs) ; le branchement DOM est vérifié par les tests Chrome. */

/* intervalle [bas, haut] zoomé d'un facteur f (> 1 = on resserre) autour de `centre` ; en échelle logarithmique, le calcul se fait sur les logarithmes */
export function zoomerIntervalle(bas, haut, centre, f, { log = false } = {}) {
  if (!(f > 0) || !Number.isFinite(bas) || !Number.isFinite(haut) || !(haut > bas)) return { from: bas, to: haut };
  if (log && bas > 0 && haut > 0 && centre > 0) { const a = Math.log(bas), b = Math.log(haut), c = Math.log(centre); return { from: Math.exp(c - (c - a) / f), to: Math.exp(c + (b - c) / f) }; }
  return { from: centre - (centre - bas) / f, to: centre + (haut - centre) / f };
}
/* pincement : { fx, fy } = facteurs de zoom horizontal et vertical entre le début du geste (écarts dx0, dy0) et maintenant (dx, dy).
   Une direction n'est prise en compte que si les doigts y étaient assez écartés au départ (minPx) : un pincement vertical ne change pas la largeur, un pincement horizontal ne change pas la hauteur. */
export function facteursPincement(dx0, dy0, dx, dy, { minPx = 28, min = 0.2, max = 6 } = {}) {
  const borne = x => Math.max(min, Math.min(max, x));
  const fx = dx0 >= minPx ? borne(dx / dx0) : 1, fy = dy0 >= minPx ? borne(dy / dy0) : 1;
  return { fx: Number.isFinite(fx) ? fx : 1, fy: Number.isFinite(fy) ? fy : 1, horizontal: dx0 >= minPx, vertical: dy0 >= minPx };
}
/* plage logique visible zoomée d'un facteur f autour de la position logique `centre` */
export function zoomerLogique(from, to, centre, f) { if (!(f > 0)) return { from, to }; return { from: centre - (centre - from) / f, to: centre + (to - centre) / f }; }
/* double appui : deux appuis proches dans le temps et dans l'espace */
export const estDoubleAppui = (a, b, { ms = 380, px = 32 } = {}) => !!a && !!b && b.t - a.t <= ms && Math.hypot(b.x - a.x, b.y - a.y) <= px;
/* zone touchée : 'prix' (axe de droite), 'temps' (axe du bas) ou 'graphique' */
export const zoneDe = (x, y, largeur, hauteur, largeurAxePrix, hauteurAxeTemps) => (x >= largeur - largeurAxePrix ? 'prix' : y >= hauteur - hauteurAxeTemps ? 'temps' : 'graphique');

const CSS = `.tpe-barre{position:absolute;top:4px;right:4px;z-index:9;display:flex;gap:4px;pointer-events:none}
.tpe-barre button{pointer-events:auto;background:#0b1117;color:#6b7a84;border:1px solid #22323c;border-radius:3px;padding:1px 6px;font:10px/1.5 ui-monospace,Consolas,monospace;cursor:pointer;min-height:20px}
.tpe-barre button[aria-pressed="true"]{color:#8fd0e3;border-color:rgba(143,208,227,.6);background:#12202a}
@media (pointer:coarse){.tpe-barre button{min-height:30px;padding:3px 10px;font-size:11px}}`;

/* Branche les échelles sur un graphique Lightweight Charts. serie : la série principale (bougies) ; hote : élément qui contient le graphique (position non statique).
   Retourne { estAuto, auto, journal, estJournal, zoomerV, detruire }. */
export function creerEchelles({ chart, serie, hote, LW, panneau = 0, boutonLog = false, journalInitial = false, surChange = () => {}, doc = document } = {}) {
  if (doc.defaultView && doc.defaultView.getComputedStyle(hote).position === 'static') hote.style.position = 'relative';
  const etat = { navOff: false, manuel: false, log: false, pinch: null, dernierAppui: null, intervalle: 0 };
  if (!doc.getElementById('tpe-css')) { const st = doc.createElement('style'); st.id = 'tpe-css'; st.textContent = CSS; doc.head.appendChild(st); }
  const ps = () => chart.priceScale('right', panneau), ts = () => chart.timeScale();
  /* le pincement natif (horizontal seulement) est coupé quelle que soit l'origine des réglages : tout `handleScale` appliqué plus tard (outils de dessin, tactile) est normalisé */
  const origine = chart.applyOptions.bind(chart);
  chart.applyOptions = o => {
    if (o && Object.prototype.hasOwnProperty.call(o, 'handleScale')) {
      if (o.handleScale === false) etat.navOff = true; else { etat.navOff = false; const h = o.handleScale === true || o.handleScale == null ? { mouseWheel: true, axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: true, price: true } } : { ...o.handleScale }; h.pinch = false; o = { ...o, handleScale: h }; }
    }
    return origine(o);
  };
  origine({ handleScale: { mouseWheel: true, pinch: false, axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: true, price: true } } });
  const rect = () => hote.getBoundingClientRect();
  const estAuto = () => { try { return ps().options().autoScale !== false; } catch (e) { return true; } };
  function auto() { try { ps().setAutoScale(true); } catch (e) { /* ignoré */ } etat.manuel = false; majBoutons(); surChange({ auto: true }); }
  function journal(on) { etat.log = !!on; try { ps().applyOptions({ mode: on ? (LW && LW.PriceScaleMode ? LW.PriceScaleMode.Logarithmic : 1) : (LW && LW.PriceScaleMode ? LW.PriceScaleMode.Normal : 0) }); } catch (e) { /* ignoré */ } majBoutons(); surChange({ log: etat.log }); }
  function zoomerV(f, yRel) {
    if (etat.navOff || !(f > 0)) return; let r = null, c = null; try { r = ps().getVisibleRange(); c = serie.coordinateToPrice(yRel); } catch (e) { return; } if (!r || c == null) return;
    const n = zoomerIntervalle(r.from, r.to, c, f, { log: etat.log }); try { ps().setVisibleRange(n); etat.manuel = true; majBoutons(); surChange({ auto: false }); } catch (e) { /* ignoré */ }
  }
  /* ── boutons ── */
  const barre = doc.createElement('div'); barre.className = 'tpe-barre';
  const bAuto = doc.createElement('button'); bAuto.type = 'button'; bAuto.textContent = 'Auto'; bAuto.title = 'Échelle verticale automatique (allumé = automatique ; appuyer pour y revenir)'; bAuto.dataset.tpeAuto = '1';
  bAuto.addEventListener('click', ev => { ev.stopPropagation(); auto(); });
  const bLog = doc.createElement('button'); bLog.type = 'button'; bLog.textContent = 'Log'; bLog.title = 'Échelle logarithmique des prix'; bLog.dataset.tpeLog = '1'; bLog.addEventListener('click', ev => { ev.stopPropagation(); journal(!etat.log); });
  if (boutonLog) barre.appendChild(bLog); barre.appendChild(bAuto); hote.appendChild(barre);
  function majBoutons() { bAuto.setAttribute('aria-pressed', String(estAuto())); bLog.setAttribute('aria-pressed', String(etat.log)); }
  etat.intervalle = setInterval(majBoutons, 400); majBoutons(); if (journalInitial) journal(true);
  /* ── Ctrl + molette : zoom vertical autour du curseur ── */
  const surRoue = ev => { if (!ev.ctrlKey || etat.navOff) return; ev.preventDefault(); ev.stopPropagation(); const k = ev.deltaMode === 1 ? 16 : 1; zoomerV(Math.exp(-ev.deltaY * k * 0.0022), ev.clientY - rect().top); };
  hote.addEventListener('wheel', surRoue, { capture: true, passive: false });
  /* ── pincement à deux doigts : horizontal, vertical ou diagonal ── */
  const doigts = ev => { const a = ev.touches[0], b = ev.touches[1]; return { dx: Math.abs(a.clientX - b.clientX), dy: Math.abs(a.clientY - b.clientY), cx: (a.clientX + b.clientX) / 2 - rect().left, cy: (a.clientY + b.clientY) / 2 - rect().top }; };
  const surDebut = ev => {
    if (ev.touches.length === 2 && !etat.navOff) {
      const d = doigts(ev); let lr = null, pr = null, centreP = null, centreL = null; try { lr = ts().getVisibleLogicalRange(); pr = ps().getVisibleRange(); centreP = serie.coordinateToPrice(d.cy); centreL = ts().coordinateToLogical(d.cx); } catch (e) { /* ignoré */ }
      etat.pinch = { ...d, lr, pr, centreP, centreL }; ev.preventDefault();
    }
  };
  const surMouvement = ev => {
    const P = etat.pinch; if (!P || ev.touches.length !== 2) return; ev.preventDefault(); const d = doigts(ev), F = facteursPincement(P.dx, P.dy, d.dx, d.dy);
    try {
      if (F.horizontal && P.lr && P.centreL != null) ts().setVisibleLogicalRange(zoomerLogique(P.lr.from, P.lr.to, P.centreL, F.fx));
      if (F.vertical && P.pr && P.centreP != null) { ps().setVisibleRange(zoomerIntervalle(P.pr.from, P.pr.to, P.centreP, F.fy, { log: etat.log })); etat.manuel = true; majBoutons(); surChange({ auto: false }); }
    } catch (e) { /* ignoré */ }
  };
  const surFin = ev => { if (etat.pinch && ev.touches.length < 2) etat.pinch = null; };
  hote.addEventListener('touchstart', surDebut, { capture: true, passive: false }); hote.addEventListener('touchmove', surMouvement, { capture: true, passive: false });
  hote.addEventListener('touchend', surFin, { capture: true }); hote.addEventListener('touchcancel', surFin, { capture: true });
  /* ── double appui / double clic sur un axe ── */
  const dansAxe = (cx, cy) => { const r = rect(); let lp = 0, ht = 0; try { lp = ps().width(); ht = ts().height(); } catch (e) { /* ignoré */ } return zoneDe(cx - r.left, cy - r.top, r.width, r.height, lp || 56, ht || 26); };
  const surRetour = (cx, cy) => { const z = dansAxe(cx, cy); if (z === 'prix') { auto(); return true; } if (z === 'temps') { try { ts().resetTimeScale(); } catch (e) { /* ignoré */ } surChange({ temps: true }); return true; } return false; };
  hote.addEventListener('dblclick', ev => { surRetour(ev.clientX, ev.clientY); }, { capture: true });
  hote.addEventListener('touchend', ev => { if (etat.pinch || !ev.changedTouches.length) return; const t = ev.changedTouches[0], a = { t: Date.now(), x: t.clientX, y: t.clientY }; if (estDoubleAppui(etat.dernierAppui, a)) { if (surRetour(a.x, a.y)) { etat.dernierAppui = null; return; } } etat.dernierAppui = a; }, { capture: true, passive: true });
  return { estAuto, auto, journal, estJournal: () => etat.log, zoomerV, majBoutons, etat: () => { let plage = null, espace = null; try { plage = ps().getVisibleRange(); const r = ts().getVisibleLogicalRange(); espace = r ? ts().width() / (r.to - r.from) : null; } catch (e) { /* ignoré */ } return { manuel: etat.manuel, auto: estAuto(), log: etat.log, navOff: etat.navOff, plage, espace }; },
    detruire() { clearInterval(etat.intervalle); hote.removeEventListener('wheel', surRoue, { capture: true }); hote.removeEventListener('touchstart', surDebut, { capture: true }); hote.removeEventListener('touchmove', surMouvement, { capture: true }); try { barre.remove(); chart.applyOptions = origine; } catch (e) { /* ignoré */ } } };
}
