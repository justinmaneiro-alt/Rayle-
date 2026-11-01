"use strict";
/* ═════════════ TABLEAU VIVANT V14 (script classique : window.VolumeVivant) ═════════════
   Une seule vue pour PC, tablette et téléphone : barre d'état, portefeuille virtuel (capital, gain, courbe live + rejoué en pointillés), graphique principal M15 / H1 avec couches (heatmap du carnet,
   profil de volume, empreinte au zoom, positions en attente / en cours / terminées, trades REJOUÉS du passé), volume net lisible, carnet d'ordres, listes. Rendu canvas. Aucune donnée inventée :
   tout vient de la vue publiée par le service Kepler (PC : /__agent/volume ; téléphone : copie du Worker) ; ce qui manque est DIT. Calculs purs : volume-vivant-calcul.js. */
(function (racine) {
  const C = racine.VolumeVivantCalcul;
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lireLocal = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const ecrireLocal = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } };
  const reduit = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const COL = { fond: '#0b0f14', grille: 'rgba(143,208,227,.08)', texte: '#9fb3bf', hausse: '#3ecf8e', baisse: '#ef5b5b', accent: '#8fd0e3', rejoue: '#b79cf5', attente: '#7fb4ff', sable: '#c9b27a' };

  async function delai(ms, p) { return Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error('délai dépassé')), ms))]); }
  async function lireVueDefaut() {
    try { const r = await delai(4000, fetch('/__agent/volume', { cache: 'no-store' })); if (r.ok) { const j = await r.json(); if (j && j.ok) return { vue: j.existe ? j.vue : null, service: j.service, origine: 'PC', note: j.note }; } } catch (e) { /* pas de serveur local */ }
    try { if (racine.wjson && typeof workerReady !== 'undefined' && workerReady()) { const j = await racine.wjson('/agent/mobile', 15000); if (j && j.paquet && j.paquet.volume) return { vue: j.paquet.volume, trader: j.paquet.trader || null, service: null, origine: 'Worker', recuLe: j.recuLe }; if (j && j.paquet) return { vue: null, origine: 'Worker', note: 'Le PC n’a pas encore publié le tableau de volume.' }; } } catch (e) { /* Worker injoignable */ }
    return null;
  }
  async function lireTraderDefaut() {
    try { const r = await delai(4000, fetch('/__agent/trader', { cache: 'no-store' })); if (r.ok) { const j = await r.json(); if (j && j.ok && j.existe) return j.vue; } } catch (e) { /* pas de serveur local */ }
    return null;
  }
  /* Prix en direct (Binance, CORS ouvert) pour le résultat flottant au centime près. Échec = on garde le dernier prix connu des bougies (jamais de prix inventé). */
  const SYMBOLES = { BTC: 'BTCUSDT', SOL: 'SOLUSDT', DOGE: 'DOGEUSDT' };
  async function lirePrixDefaut() {
    try { const r = await delai(4000, fetch('https://data-api.binance.vision/api/v3/ticker/price?symbols=' + encodeURIComponent(JSON.stringify(Object.values(SYMBOLES))), { cache: 'no-store' })); if (!r.ok) return null; const j = await r.json(), o = {};
      for (const [a, sym] of Object.entries(SYMBOLES)) { const x = Array.isArray(j) && j.find(e => e.symbol === sym), v = x ? parseFloat(x.price) : NaN; if (Number.isFinite(v) && v > 0) o[a] = v; } return Object.keys(o).length ? o : null; } catch (e) { return null; }
  }
  /* Bougies plus anciennes (Binance, CORS ouvert) : [t, o, h, l, c, 0, 0] (pas de volume net avant le suivi de Kepler). `null` = échec réseau, [] = plus rien. */
  const INTERVALLES = { M15: '15m', H1: '1h' };
  async function lireKlinesDefaut(actif, tf, finT, limite = 1000) {
    try { const r = await delai(8000, fetch('https://data-api.binance.vision/api/v3/klines?symbol=' + SYMBOLES[actif] + '&interval=' + INTERVALLES[tf] + '&endTime=' + Math.round(finT) + '&limit=' + limite, { cache: 'no-store' })); if (!r.ok) return null; const j = await r.json(); if (!Array.isArray(j)) return null;
      return j.map(k => [+k[0], +k[1], +k[2], +k[3], +k[4], 0, 0]).filter(b => Number.isFinite(b[0]) && Number.isFinite(b[4])); } catch (e) { return null; }
  }
  async function lireCarnetDefaut(actif) { try { const r = await delai(5000, fetch('/__agent/volume/carnet?actif=' + actif, { cache: 'no-store' })); if (r.ok) return await r.json(); } catch (e) { /* pas de PC */ } return null; }

  function monter(conteneur, { lire = lireVueDefaut, lireTrader = lireTraderDefaut, lireCarnet = lireCarnetDefaut, lirePrix = lirePrixDefaut, lireKlines = lireKlinesDefaut, intervallePrix = 0, intervalle = 15000, maintenant = () => Date.now(), leger = false } = {}) {
    const racineEl = document.createElement('section'); racineEl.className = 'vv'; racineEl.setAttribute('aria-label', 'Tableau vivant de l’agent'); conteneur.appendChild(racineEl);
    const S = { data: null, service: null, origine: null, actif: lireLocal('rayle_vv_actif') || 'BTC', tf: lireLocal('rayle_vv_tf') || 'H1', preset: lireLocal('rayle_vv_preset') || 'complet', couches: null, visibles: 0, carnet: null, carnetActif: null, detruit: false, enCours: false, ouvertes: new Set(), anim: 0, chart: null, dernierCapital: null, gauche: null, ext: {}, hf: { actif: 'tous', res: 'tous' }, geo: null, centrer: null };
    S.couches = Object.assign(C.couches(S.preset), JSON.parse(lireLocal('rayle_vv_couches') || '{}'));
    let minuteur = null, rafId = 0, observateur = null;

    racineEl.innerHTML = '<div class="vv-etat" data-vv="etat" role="status"></div>'
      + '<div class="vv-haut"><div class="vv-pf" data-vv="pf"></div><div class="vv-verdict" data-vv="verdict"></div></div>'
      + '<div class="vv-outils" data-vv="outils"></div>'
      + '<div class="vv-zone"><canvas class="vv-graph" data-vv="graph" aria-label="Graphique des prix avec volume, profil, carnet et positions" role="img"></canvas><canvas class="vv-dot" data-vv="dot" aria-hidden="true"></canvas><div class="vv-info" data-vv="info" aria-live="polite"></div></div>'
      + '<div class="vv-histo" data-vv="histo"></div>'
      + '<div class="vv-net"><div class="vv-titre">Volume net <small>acheteurs agressifs moins vendeurs agressifs, bougie par bougie</small></div><canvas class="vv-netc" data-vv="net" aria-label="Volume net par bougie et CVD" role="img"></canvas><p class="vv-phrase" data-vv="phrase"></p><p class="vv-legende">Vert : les acheteurs ont poussé le prix. Rouge : les vendeurs. La ligne claire (CVD) est le cumul de la journée : si elle monte, les acheteurs gagnent du terrain.</p></div>'
      + '<div class="vv-carnet" data-vv="carnet"><div class="vv-titre">Carnet d’ordres <small data-vv="carnetActif"></small><span class="vv-direct" data-vv="direct" hidden>● direct</span></div><div data-vv="carnetMsg"></div><div class="vv-dom" data-vv="dom" hidden></div><div data-vv="carnetPied"></div></div>'
      + '<div class="vv-flux" data-vv="flux"></div>'
      + '<div class="vv-listes" data-vv="listes"></div>'
      + '<div class="vv-rejoue" data-vv="rejoue"></div>';
    const q = n => racineEl.querySelector('[data-vv="' + n + '"]');
    const E = { histo: q('histo'), flux: q('flux'), dot: q('dot'), etat: q('etat'), pf: q('pf'), verdict: q('verdict'), outils: q('outils'), graph: q('graph'), info: q('info'), net: q('net'), phrase: q('phrase'), carnet: q('carnet'), carnetActif: q('carnetActif'), direct: q('direct'), carnetMsg: q('carnetMsg'), dom: q('dom'), carnetPied: q('carnetPied'), listes: q('listes'), rejoue: q('rejoue') };

    /* ── haut de page ── */
    function rendreEtat() {
      const d = S.data; if (!d) { E.etat.innerHTML = '<span class="vv-ko">Ni le service du PC ni le Worker ne m’ont répondu.</span> <span>simulation, aucun ordre réel</span>'; return; }
      if (!d.vue) { E.etat.innerHTML = '<span class="vv-ko">' + esc(d.note || 'Le tableau de volume n’est pas encore calculé.') + '</span> <span>simulation, aucun ordre réel</span>'; return; }
      const b = C.barreEtat(d.vue, S.service, maintenant());
      E.etat.innerHTML = '<span class="' + (b.serviceOk ? 'vv-ok' : 'vv-ko') + '">● ' + esc(b.service) + '</span><span>' + esc(b.bougie) + '</span><span>' + esc(b.carnet) + '</span><span class="vv-sim">' + esc(b.simulation) + '</span>' + (S.origine === 'Worker' ? '<span>copie du Worker</span>' : '');
    }
    /* Le chiffre affiche TOUJOURS la valeur exacte tout de suite (au centime) ; un bref éclat vert / rouge signale seulement qu'il vient de bouger. */
    function animerChiffre(el, vers, fmt) {
      const de = S.dernierCapital; el.textContent = fmt(vers); S.dernierCapital = vers;
      if (de != null && de !== vers && !reduit() && !leger) { el.classList.remove('vv-tic-h', 'vv-tic-b'); void el.offsetWidth; el.classList.add(vers > de ? 'vv-tic-h' : 'vv-tic-b'); }
    }
    /* Portefeuille virtuel : piloté par les TRADES de l'agent (terminés + flottant des ouverts) dès que le mode Trader est lisible ; sinon celui de la vue de volume. */
    const tradesDe = actif => C.tousTrades(S.data && S.data.trader, S.data && S.data.vue, actif);
    const portefeuilleCourant = v => C.portefeuilleAffiche(S.data && S.data.trader, v, S.prixLive, { maintenant: maintenant() });   // la même fonction sur tous les appareils
    function rendrePortefeuille() {
      const v = S.data && S.data.vue; if (!v) { E.pf.innerHTML = ''; E.verdict.innerHTML = ''; return; }
      const p = portefeuilleCourant(v), gagne = p.gainUsd >= 0; if (racine.AgentAlertes && p.source === 'trades') racine.AgentAlertes.reglerSim({ capital: p.capital, risquePct: p.risquePct });
      E.pf.innerHTML = '<div class="vv-pf-etiquette">Portefeuille virtuel <b>SIMULÉ</b> · départ ' + C.usd(p.capital0) + ' · risque ' + C.fr(p.risquePct, 1) + ' % par trade' + (p.source === 'trades' ? ' · piloté par les trades de l’agent' : '') + '</div>'
        + '<div class="vv-pf-grand ' + (gagne ? 'vv-hausse' : 'vv-baisse') + '"><span data-vv="capital">' + C.usd(p.capital, 2) + '</span></div>'
        + '<div class="vv-pf-gain ' + (gagne ? 'vv-hausse' : 'vv-baisse') + '">' + C.signe(p.gainUsd) + ' $ · ' + C.signe(p.gainPct) + ' % · cette semaine ' + C.signe(p.semaineUsd, 2) + ' $</div>'
        + (p.source === 'trades' ? '<div class="vv-pf-stats" data-vv="pf-r">Cumul réalisé <b class="' + (p.cumulR >= 0 ? 'vv-hausse' : 'vv-baisse') + '">' + C.signe(p.cumulR, 1) + ' R</b> (' + C.signe(p.realiseUsd, 2) + ' $)' + (p.nOuverts ? ' · flottant ' + C.signe(p.flottantR, 1) + ' R (' + C.signe(p.flottantUsd, 2) + ' $) sur ' + p.nOuverts + ' position' + (p.nOuverts > 1 ? 's' : '') + ' ouverte' + (p.nOuverts > 1 ? 's' : '') : ' · aucune position ouverte') + (p.nEnAttente ? ' · ' + p.nEnAttente + ' ordre(s) limite en attente (pas encore touchés : ils ne comptent pas)' : '') + (p.incomplet ? ' · historique partiel : ' + p.nTrades + ' trades sur ' + p.incomplet + '' : '') + '</div>' : '')
        + '<div class="vv-pf-stats">' + (p.nTrades ? p.nTrades + ' trades suivis · réussite ' + C.fr(p.tauxReussite * 100, 0) + ' % · R moyen ' + C.signe(p.rMoyen) + ' · baisse max ' + C.fr(p.drawdownMaxPct, 1) + ' %' : 'Aucun trade terminé pour l’instant : l’agent suit chaque proposition dès qu’elle arrive.') + '</div>'
        + (() => { const r = C.reglesProp(p); const b = (nom, o, mal) => '<div class="vv-prop' + (mal ? ' vv-prop-mal' : '') + '"><span>' + nom + ' ' + C.fr(o.valeur, 1) + ' % / ' + o.limite + ' %</span><i style="--k:' + o.part + '"></i></div>'; return '<div class="vv-props" aria-label="Règles prop simulées">' + b('Objectif', r.objectif, false) + b('Baisse max', r.drawdown, r.drawdown.depasse) + '<small>Règles prop SIMULÉES (défauts à régler) · risque ' + C.fr(r.risque.valeur, 1) + ' % / ' + r.risque.limite + ' % par trade' + (r.risque.depasse ? ' · TROP ÉLEVÉ' : '') + '</small></div>'; })()
        + '<canvas class="vv-pf-courbe" data-vv="courbe" aria-label="Courbe de capital" role="img"></canvas>'
        + '<div class="vv-pf-legende"><span class="vv-trait">▬</span> live (suivi en direct) <span class="vv-pointille">┅</span> si on avait suivi depuis le début (REJOUÉ, pas réel)</div>'
        + (p.parStrategie && p.parStrategie.length ? '<ul class="vv-pf-strat">' + p.parStrategie.map(s => '<li class="' + (s.pnlUsd >= 0 ? 'vv-hausse' : 'vv-baisse') + '">' + esc(s.cle) + ' : ' + C.signe(s.pnlUsd, 0) + ' $ (' + s.n + ')</li>').join('') + '</ul>' : '')
        + '<div class="vv-confirme">Risque par trade : valeur de départ à confirmer par toi (1 % par défaut).</div>';
      animerChiffre(E.pf.querySelector('[data-vv="capital"]'), p.capital, x => C.usd(x, 2));
      dessinerCourbe();
      E.verdict.innerHTML = '<div class="vv-titre">Verdict honnête</div><p>' + esc(v.verdict ? v.verdict.texte : '') + '</p>'
        + (v.configs && v.configs.length ? '<ul class="vv-cfg">' + v.configs.map(c => '<li><b>' + esc(c.nom) + '</b> ' + esc(c.tf) + ' · ' + esc(c.niveauLibelle) + (c.oosR != null ? ' · R ' + C.signe(c.oosR) + ' sur ' + c.oosN + ' trades hors apprentissage' : '') + (c.pause ? ' · EN PAUSE' : '') + '</li>').join('') + '</ul>' : '')
        + ((v.nonSuivis && Object.keys(v.nonSuivis).length) ? '<p class="vv-note">Non suivis en direct : ' + esc(Object.entries(v.nonSuivis).map(([a, r]) => a + ' (' + r + ')').join(' ; ')) + '.</p>' : '');
    }
    function dessinerCourbe() {
      const v = S.data && S.data.vue, cv = racineEl.querySelector('[data-vv="courbe"]'); if (!v || !cv) return;
      const c = prepare(cv, 90), ctx = c.ctx, W = c.W, H = c.H, p = portefeuilleCourant(v), live = C.courbeJours(p.courbe, p.source === 'trades' ? (p.courbe.length ? p.courbe[0][0] : null) : v.demarreLe), rj = v.rejoue && v.rejoue.portefeuille ? C.courbeJours(v.rejoue.portefeuille.courbe) : [];
      const toutes = live.concat(rj); if (toutes.length < 2) { ctx.fillStyle = COL.texte; ctx.font = '12px system-ui'; ctx.fillText('Courbe disponible après les premiers trades', 8, H / 2); return; }
      const xs = toutes.map(a => a[0]), ys = toutes.map(a => a[1]).concat([p.capital0]), x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 1), y0 = Math.min(...ys), y1 = Math.max(...ys, y0 + 1), X = x => 4 + (x - x0) / (x1 - x0) * (W - 8), Y = y => H - 6 - (y - y0) / (y1 - y0) * (H - 12);
      ctx.strokeStyle = COL.grille; ctx.beginPath(); ctx.moveTo(0, Y(p.capital0)); ctx.lineTo(W, Y(p.capital0)); ctx.stroke();
      const trace = (pts, couleur, pointille, largeur) => { if (pts.length < 2) return; ctx.save(); ctx.setLineDash(pointille ? [4, 4] : []); ctx.lineWidth = largeur; ctx.strokeStyle = couleur; ctx.beginPath(); pts.forEach((a, i) => (i ? ctx.lineTo(X(a[0]), Y(a[1])) : ctx.moveTo(X(a[0]), Y(a[1])))); ctx.stroke(); ctx.restore(); };
      trace(rj, COL.rejoue, true, 1.3); trace(live, p.gainUsd >= 0 ? COL.hausse : COL.baisse, false, 2);
      ctx.fillStyle = COL.texte; ctx.font = '10px system-ui'; ctx.fillText(C.usd(y1), 4, 10); ctx.fillText(C.usd(y0), 4, H - 2);
    }

    /* ── outils ── */
    function rendreOutils() {
      const v = S.data && S.data.vue; if (!v) { E.outils.innerHTML = ''; return; }
      const actifs = Object.keys(v.actifs || {}), L = (id, txt, on) => '<label class="vv-chk"><input type="checkbox" data-couche="' + id + '"' + (on ? ' checked' : '') + '> ' + txt + '</label>';
      E.outils.innerHTML = '<div class="vv-seg" role="tablist" aria-label="Actif">' + actifs.map(a => '<button type="button" role="tab" data-actif="' + a + '" aria-selected="' + (a === S.actif) + '">' + a + '</button>').join('') + '</div>'
        + '<div class="vv-seg" role="tablist" aria-label="Unité de temps">' + ['M15', 'H1'].map(t => '<button type="button" role="tab" data-tf="' + t + '" aria-selected="' + (t === S.tf) + '">' + t + '</button>').join('') + '</div>'
        + '<div class="vv-seg" aria-label="Zoom"><button type="button" data-zoom="-1" aria-label="Moins de bougies (zoom avant)">＋</button><button type="button" data-zoom="1" aria-label="Plus de bougies (zoom arrière)">－</button><button type="button" data-zoom="0" aria-label="Revoir tout le graphique" title="Tout revoir (ou double clic sur le graphique)">⟲</button></div>'
        + '<div class="vv-seg" aria-label="Préréglage"><button type="button" data-preset="epure" aria-pressed="' + (S.preset === 'epure') + '">Épuré</button><button type="button" data-preset="complet" aria-pressed="' + (S.preset === 'complet') + '">Complet</button></div>'
        + '<details class="vv-couches"><summary>Couches</summary>' + L('heat', 'Carnet (heatmap)', S.couches.heat) + L('profil', 'Profil de volume', S.couches.profil) + L('footprint', 'Empreinte (zoom)', S.couches.footprint) + L('positions', 'Positions', S.couches.positions) + L('rejoue', 'Rejoué', S.couches.rejoue) + L('murs', 'Murs du carnet', S.couches.murs) + '</details>';
    }
    racineEl.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (b) {
        if (b.dataset.actif) { S.actif = b.dataset.actif; ecrireLocal('rayle_vv_actif', S.actif); S.carnet = null; S.gauche = null; toutRendre(); chargerCarnet(); }
        else if (b.dataset.tf) { S.tf = b.dataset.tf; ecrireLocal('rayle_vv_tf', S.tf); S.visibles = 0; S.gauche = null; toutRendre(); }
        else if (b.dataset.zoom === '0') { arreterMouvements(); S.visibles = 0; S.gauche = null; dessiner(); }
        else if (b.dataset.zoom) { arreterMouvements(); const s2 = serieCourante(); if (s2) { const z = C.zoomLibre({ n: s2.bougies.length, visibles: S.visibles, gauche: S.gauche, facteur: b.dataset.zoom === '1' ? 1.4 : 0.7, ancre: 1, defaut: nParDefaut() }); S.visibles = z.visibles; S.gauche = z.gauche; } dessiner(); }
        else if (b.dataset.hf) { const [k, val] = b.dataset.hf.split(':'); S.hf[k] = val; rendreHisto(); }
        else if (b.dataset.preset) { S.preset = b.dataset.preset; S.couches = C.couches(S.preset); ecrireLocal('rayle_vv_preset', S.preset); ecrireLocal('rayle_vv_couches', '{}'); rendreOutils(); dessiner(); }
        else if (b.dataset.ligne) { const id = b.dataset.ligne; S.ouvertes.has(id) ? S.ouvertes.delete(id) : S.ouvertes.add(id); rendreListes(); }
      }
    });
    racineEl.addEventListener('click', ev => { const l = ev.target.closest('tr[data-histo]'); if (l) voirTrade(l.dataset.histo); });
    racineEl.addEventListener('keydown', ev => { if (ev.key === 'Enter') { const l = ev.target.closest && ev.target.closest('tr[data-histo]'); if (l) voirTrade(l.dataset.histo); } });
    racineEl.addEventListener('change', ev => { const c = ev.target.closest('[data-couche]'); if (!c) return; S.couches[c.dataset.couche] = c.checked; ecrireLocal('rayle_vv_couches', JSON.stringify(S.couches)); dessiner(); });

    /* ── canvas ── */
    function prepare(cv, hauteur) {
      const dpr = Math.min(2, racine.devicePixelRatio || 1), W = Math.max(200, cv.clientWidth || cv.parentNode.clientWidth || 320), H = hauteur || cv.clientHeight || 300;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; }
      const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); return { ctx, W, H };
    }
    const nParDefaut = () => (S.tf === 'H1' ? 72 : 64);
    const detail = () => C.niveauDetail({ largeur: racineEl.clientWidth || 800, leger });
    /* ── Historique plus ancien : quand on remonte jusqu'au bord gauche, on charge d'autres bougies chez Binance (1 000 à la fois, sans limite arbitraire tant que Binance en a). Ces bougies plus anciennes n'ont pas
       de volume net (seul le service Kepler le calcule) : elles sont dessinées sans, et le dit. ── */
    const clefExt = () => S.actif + '|' + S.tf;
    const extDe = () => (S.ext[clefExt()] = S.ext[clefExt()] || { bougies: [], cvd: [], fin: false, charge: false, echecLe: 0 });
    function serieEff(a, tf) {
      const base = tf === 'H1' ? a.h1 : a.m15, e = S.ext[S.actif + '|' + tf]; if (!base || !e || !e.bougies.length) return base;
      if (!e.cache || e.cache.nb !== base.bougies.length || e.cache.ne !== e.bougies.length || e.cache.base !== base) e.cache = { nb: base.bougies.length, ne: e.bougies.length, base, serie: { ...base, bougies: e.bougies.concat(base.bougies), cvd: e.cvd.concat(base.cvd) } };
      return e.cache.serie;
    }
    async function chargerHistoriqueSiBesoin() {
      const v = S.data && S.data.vue, a = v && v.actifs && v.actifs[S.actif]; if (!a) return; const f = fenetreActuelle(); if (!f || f.gauche > Math.max(40, f.vis * 0.4)) return;
      const e = extDe(); if (e.charge || e.fin || Date.now() - e.echecLe < 30000 || e.bougies.length >= 30000) return;
      const base = (S.tf === 'H1' ? a.h1 : a.m15).bougies, plus = e.bougies.length ? e.bougies[0][0] : base[0][0], actif = S.actif, tf = S.tf; e.charge = true;
      try {
        const lot = await lireKlines(actif, tf, plus - 1, 1000), nv = (lot || []).filter(b => b[0] < plus);
        if (S.detruit) return; if (!lot) { e.echecLe = Date.now(); return; } if (!nv.length) { e.fin = true; dessinerNav(); return; }
        e.bougies = nv.concat(e.bougies); e.cvd = nv.map(() => 0).concat(e.cvd); e.cache = null;
        if (actif === S.actif && tf === S.tf) { if (S.gauche != null) S.gauche += nv.length; if (nav.cible) nav.cible.idx += nv.length; dessinerNav(); }
      } catch (err) { e.echecLe = Date.now(); } finally { e.charge = false; }
    }
    function dessiner() { dessinerGraphique(); dessinerNet(); }
    /* ── navigation du graphique, à la TradingView : molette = zoom fluide centré sur le curseur (la bougie sous la souris reste sous la souris), glisser = déplacement libre au pixel près avec inertie au
       relâchement, aucune butée arbitraire (on peut aller dans le passé aussi loin que l'historique chargé le permet, et dans le vide du futur), pincement à deux doigts, double clic = tout revoir ── */
    const serieCourante = () => { const v = S.data && S.data.vue, a = v && v.actifs && v.actifs[S.actif]; return a ? serieEff(a, S.tf) : null; };
    let rafNav = 0; const dessinerNav = () => { if (rafNav) return; rafNav = requestAnimationFrame(() => { rafNav = 0; if (!S.detruit) dessiner(); }); };
    const ancreDe = x => { const g = S.geo; return g ? Math.max(0, Math.min(1, (x - g.g) / Math.max(1, g.W))) : 1; };
    const nav = { cible: null, rafZoom: 0, rafInertie: 0, v: 0 };
    const fenetreActuelle = () => { const s = serieCourante(); return s ? C.fenetreLibre(s.bougies.length, S.visibles, S.gauche, nParDefaut()) : null; };
    function arreterMouvements() { nav.cible = null; nav.v = 0; if (nav.rafZoom) { cancelAnimationFrame(nav.rafZoom); nav.rafZoom = 0; } if (nav.rafInertie) { cancelAnimationFrame(nav.rafInertie); nav.rafInertie = 0; } }
    /* Zoom animé : on glisse vers la taille visée en gardant l'ancre exactement sous le curseur à chaque image. */
    function zoomer(facteur, x) {
      const s = serieCourante(); if (!s) return; const n = s.bougies.length, a = ancreDe(x), f = fenetreActuelle(), vis = Math.max(C.MIN_VISIBLES, Math.min(Math.max(n * 3, 30), (nav.cible ? nav.cible.vis : f.vis) * facteur));
      nav.cible = { vis, idx: f.gauche + a * f.vis, a };   // la bougie sous le curseur est celle de l'état courant : elle y reste pendant toute l'animation
      if (reduit()) { S.visibles = vis; S.gauche = nav.cible.idx - a * vis; nav.cible = null; dessinerNav(); chargerHistoriqueSiBesoin(); return; }
      if (!nav.rafZoom) { const pas = () => { nav.rafZoom = 0; const c = nav.cible; if (!c || S.detruit) return; const cur = fenetreActuelle(), nv = cur.vis + (c.vis - cur.vis) * 0.34, fini = Math.abs(c.vis - nv) < Math.max(0.01, c.vis * 0.001); S.visibles = fini ? c.vis : nv; S.gauche = c.idx - c.a * S.visibles; dessiner(); if (fini) { nav.cible = null; chargerHistoriqueSiBesoin(); } else nav.rafZoom = requestAnimationFrame(pas); }; nav.rafZoom = requestAnimationFrame(pas); }
    }
    function deplacer(px) {
      const s = serieCourante(), g = S.geo; if (!s || !g) return; const z = C.deplacerLibre({ n: s.bougies.length, visibles: S.visibles, gauche: S.gauche, barres: -px / g.pas, defaut: nParDefaut() }); S.visibles = z.visibles; S.gauche = z.gauche; dessinerNav(); chargerHistoriqueSiBesoin();
    }
    /* Inertie : à la vitesse du relâchement, freinage doux (≈ 0,25 s de constante de temps), interrompue par le moindre contact. */
    function lancerInertie(v) {
      if (reduit() || Math.abs(v) < 0.05) return; nav.v = Math.max(-4, Math.min(4, v)); let t0 = performance.now();
      const pas = t => { nav.rafInertie = 0; const dt = Math.min(48, t - t0); t0 = t; deplacer(nav.v * dt); nav.v *= Math.exp(-dt / 240); if (Math.abs(nav.v) > 0.04 && !S.detruit) nav.rafInertie = requestAnimationFrame(pas); }; nav.rafInertie = requestAnimationFrame(pas);
    }
    const zoneG = racineEl.querySelector('.vv-zone'), pointeurs = new Map(); let dernier = null, echantillons = [];
    zoneG.addEventListener('wheel', ev => { ev.preventDefault(); if (nav.rafInertie) { cancelAnimationFrame(nav.rafInertie); nav.rafInertie = 0; } const r = E.graph.getBoundingClientRect(), dy = ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaY; zoomer(Math.exp(Math.max(-250, Math.min(250, dy)) * 0.0016), ev.clientX - r.left); }, { passive: false });
    zoneG.addEventListener('pointerdown', ev => { if (ev.button > 0) return; arreterMouvements(); pointeurs.set(ev.pointerId, { x: ev.clientX }); dernier = null; echantillons = [{ t: performance.now(), x: ev.clientX }]; try { zoneG.setPointerCapture(ev.pointerId); } catch (e) { /* rien */ } zoneG.classList.add('vv-saisi'); });
    zoneG.addEventListener('pointermove', ev => {
      const p = pointeurs.get(ev.pointerId); if (!p) return;
      if (pointeurs.size === 2) { p.x = ev.clientX; const [c, d] = [...pointeurs.values()], apres = Math.abs(c.x - d.x), r = E.graph.getBoundingClientRect(); if (dernier != null && apres > 8 && dernier > 8) { nav.cible = null; const f = fenetreActuelle(), a = ancreDe((c.x + d.x) / 2 - r.left), nv = Math.max(C.MIN_VISIBLES, f.vis * dernier / apres); S.gauche = f.gauche + a * f.vis - a * nv; S.visibles = nv; dessinerNav(); } dernier = apres; return; }
      const dx = ev.clientX - p.x; p.x = ev.clientX; echantillons.push({ t: performance.now(), x: ev.clientX }); if (echantillons.length > 8) echantillons.shift(); deplacer(dx);
    });
    const lacher = ev => {
      const etait = pointeurs.has(ev.pointerId); pointeurs.delete(ev.pointerId); dernier = null;
      if (!pointeurs.size) { zoneG.classList.remove('vv-saisi'); if (etait && ev.type === 'pointerup' && echantillons.length > 1) { const fin = echantillons[echantillons.length - 1], deb = echantillons.find(e => fin.t - e.t <= 100) || echantillons[0], dt = fin.t - deb.t; if (dt > 0 && performance.now() - fin.t < 80) lancerInertie((fin.x - deb.x) / dt); } echantillons = []; }
    };
    zoneG.addEventListener('pointerup', lacher); zoneG.addEventListener('pointercancel', lacher); zoneG.addEventListener('dblclick', () => { arreterMouvements(); S.visibles = 0; S.gauche = null; dessinerNav(); });


    function dessinerGraphique() {
      const v = S.data && S.data.vue, a = v && v.actifs && v.actifs[S.actif]; const cv = E.graph;
      if (!a) { const c = prepare(cv, 120); c.ctx.fillStyle = COL.texte; c.ctx.font = '13px system-ui'; c.ctx.fillText(v ? 'Pas de données pour ' + S.actif + '.' : 'En attente des données du service Kepler…', 12, 40); return; }
      const serie = S.tf === 'H1' ? a.h1 : a.m15; if (!serie) return;
      const cvH = Math.max(280, Math.min(520, Math.round((racineEl.clientWidth || 800) * (racineEl.clientWidth < 600 ? 0.9 : 0.5)))), { ctx, W, H } = prepare(cv, cvH);
      const ser = serieEff(a, S.tf), n = ser.bougies.length; if (!n) return;
      if (S.centrer != null) { const idx = ser.bougies.findIndex(b => b[0] + (S.tf === 'H1' ? 3600e3 : 900e3) > S.centrer), z = C.centrerLibre({ n, visibles: S.visibles, idx: idx < 0 ? n - 1 : idx, defaut: nParDefaut() }); S.visibles = z.visibles; S.gauche = z.gauche; S.centrer = null; }
      const fen = C.fenetreLibre(n, S.visibles, S.gauche, nParDefaut()), i0 = Math.max(0, fen.i0), i1 = Math.min(n, fen.i1), bougies = ser.bougies.slice(i0, i1), off = i0 - fen.gauche, det = detail();   // la fenêtre garde toujours au moins une bougie
      const droite = S.couches.profil ? Math.min(78, W * 0.13) : 0, marge = { g: 6, d: 58, h: 8, b: 20 };
      // niveaux à inclure dans l'échelle : positions affichées
      const tousP = S.couches.positions ? tradesDe(S.actif) : [], pos = tousP.filter(p => p.statut !== 'terminee'), extra = []; for (const p of pos) extra.push(p.entree, p.stop, p.cible != null ? p.cible : p.entree);
      const vis = bougies.filter((b, k) => { const x = (k + off + 0.5) * (1 / fen.vis); return x > -0.02 && x < 1.02; }), bEch = vis.length ? vis : bougies, hMax = Math.max(...bEch.map(b => b[2])), bMin = Math.min(...bEch.map(b => b[3])), amp = Math.max(hMax - bMin, hMax * 1e-6), inc = extra.filter(v => Number.isFinite(v) && v >= bMin - 1.5 * amp && v <= hMax + 1.5 * amp);
      const R = C.repere({ n: fen.vis, largeur: W, hauteur: H, marge, hauts: bEch.map(b => b[2]).concat(inc.length ? [Math.max(...inc)] : []), bas: bEch.map(b => b[3]).concat(inc.length ? [Math.min(...inc)] : []), droite });
      const rx0 = R.x; R.x = k => rx0(k + off);   // décalage fractionnaire : la molette et le glisser déplacent au pixel près
      const ts = bougies.map(b => [b[0]]), pas = S.tf === 'H1' ? 3600e3 : 900e3;
      // grille + axe des prix
      ctx.font = '10px system-ui'; ctx.fillStyle = COL.texte; ctx.strokeStyle = COL.grille; ctx.textAlign = 'left';
      for (let k = 0; k <= 5; k++) { const p = R.min + (R.max - R.min) * k / 5, y = R.y(p); ctx.beginPath(); ctx.moveTo(marge.g, y); ctx.lineTo(W - marge.d, y); ctx.stroke(); ctx.fillText(C.prixTexte(p), W - marge.d + 4, y + 3); }
      ctx.save(); ctx.beginPath(); ctx.rect(marge.g, 0, R.W, R.bas + 2); ctx.clip();
      // heatmap du carnet (PC seulement, alignée sur le temps)
      const heat = S.couches.heat && S.carnet && S.carnet.ok && S.carnet.actif === S.actif ? C.decoderHeat(S.carnet.heat) : null;
      if (heat) {
        const t0 = bougies[0][0], t1 = bougies[bougies.length - 1][0] + pas;
        for (let i = 0; i < heat.nT; i += det.heatPas) {
          const t = heat.t0 + i * heat.dt, k = Math.floor((t - t0) / pas); if (k < 0 || k >= bougies.length) continue; const x = R.x(k) - R.pas / 2, w = Math.max(1.5, R.pas * (heat.dt * det.heatPas / pas)) ;
          for (let j = 0; j < heat.nPrix; j++) { const val = heat.val(i, j); if (val < 0.12) continue; const p = heat.prixMin + (j + 0.5) * heat.pas, y = R.y(p); if (y < marge.h || y > R.bas) continue; ctx.fillStyle = 'rgba(' + (p < (heat.mids[i] || p) ? '62,207,142' : '239,91,91') + ',' + (val * 0.45).toFixed(3) + ')'; ctx.fillRect(x, y - 1.5, w, 3); }
        }
      }
      // bougies
      const larg = Math.max(1, Math.min(18, R.pas * 0.66));
      bougies.forEach((b, i) => { const x = R.x(i), h = b[4] >= b[1]; ctx.strokeStyle = ctx.fillStyle = h ? COL.hausse : COL.baisse; ctx.beginPath(); ctx.moveTo(x, R.y(b[2])); ctx.lineTo(x, R.y(b[3])); ctx.stroke(); const y1 = R.y(Math.max(b[1], b[4])), y2 = R.y(Math.min(b[1], b[4])); ctx.fillRect(x - larg / 2, y1, larg, Math.max(1, y2 - y1)); });
      // empreinte (footprint) : seulement quand les bougies sont larges
      if (S.couches.footprint && det.footprint && R.pas >= 34 && S.tf === 'M15' && a.footprint && a.footprint.length) {
        ctx.font = '9px system-ui'; ctx.textAlign = 'center';
        for (const f of a.footprint) { const i = bougies.findIndex(b => b[0] === f.t); if (i < 0) continue; const x = R.x(i); for (const n of f.niveaux) { const y = R.y(n[0]); ctx.fillStyle = n[3] ? 'rgba(62,207,142,.9)' : COL.texte; ctx.fillText(C.compact(n[1]), x - R.pas * 0.22, y + 3); ctx.fillStyle = n[4] ? 'rgba(239,91,91,.9)' : COL.texte; ctx.fillText(C.compact(n[2]), x + R.pas * 0.22, y + 3); } }
        ctx.textAlign = 'left';
      }
      ctx.restore();
      // profil de volume à droite : zone de valeur, POC, VAH, VAL, HVN / LVN de la veille
      const pr = a.profil && a.profil.veille;
      if (S.couches.profil && pr) {
        const xFin = W - marge.d - droite, xD = xFin + 6; ctx.fillStyle = 'rgba(143,208,227,.06)'; ctx.fillRect(marge.g, R.y(pr.vah), W - marge.d - marge.g, R.y(pr.val) - R.y(pr.vah));
        const ligne = (p, txt, col, ep) => { if (p == null || p < R.min || p > R.max) return; ctx.strokeStyle = col; ctx.lineWidth = ep; ctx.beginPath(); ctx.moveTo(marge.g, R.y(p)); ctx.lineTo(W - marge.d, R.y(p)); ctx.stroke(); ctx.lineWidth = 1; ctx.fillStyle = col; ctx.fillText(txt, xD, R.y(p) + 3); };
        ligne(pr.poc, 'POC', COL.sable, 1.4); ligne(pr.vah, 'VAH', COL.accent, 1); ligne(pr.val, 'VAL', COL.accent, 1);
        for (const h of pr.hvn || []) if (h >= R.min && h <= R.max) { ctx.fillStyle = 'rgba(201,178,122,.6)'; ctx.fillRect(xFin + 36, R.y(h) - 1, 14, 2); }
        for (const l of pr.lvn || []) if (l >= R.min && l <= R.max) { ctx.fillStyle = 'rgba(143,208,227,.6)'; ctx.fillRect(xFin + 54, R.y(l) - 1, 8, 2); }
      }
      // murs du carnet
      if (S.couches.murs && S.carnet && S.carnet.ok && S.carnet.actif === S.actif) for (const m of S.carnet.murs || []) { if (m.prix < R.min || m.prix > R.max) continue; ctx.strokeStyle = m.cote === 'bid' ? 'rgba(62,207,142,.7)' : 'rgba(239,91,91,.7)'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(marge.g, R.y(m.prix)); ctx.lineTo(W - marge.d, R.y(m.prix)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = COL.texte; ctx.fillText('mur ' + C.compact(m.usdMax) + ' $', marge.g + 4, R.y(m.prix) - 2); }
      // positions : TOUTES les vivantes, puis TOUS les trades terminés visibles (entrée, sortie, stop, objectif, résultat en R) pour BTC, SOL et DOGE
      const iDe = t => {   // indice de la bougie qui contient t (recherche dans les VRAIES heures : les trous de données ne décalent plus les boîtes) ; après la dernière bougie, au pas régulier
        if (t < bougies[0][0]) return Math.floor((t - bougies[0][0]) / pas); let lo = 0, hi = bougies.length - 1; while (lo < hi) { const k = (lo + hi + 1) >> 1; if (bougies[k][0] <= t) lo = k; else hi = k - 1; }
        return lo < bougies.length - 1 ? lo : Math.min(bougies.length + 3, lo + Math.floor((t - bougies[lo][0]) / pas)); };
      ctx.save(); ctx.beginPath(); ctx.rect(marge.g, marge.h, W - marge.d - marge.g, R.bas - marge.h); ctx.clip();
      const tFinFen = bougies[bougies.length - 1][0] + pas; S.zonesDessinees = [];
      for (const p of tousP) {
        const fini = p.statut === 'terminee', att = p.statut === 'en_attente', tDeb = p.tEntree || p.tSignal; if (!tDeb) continue; if (fini && (p.tSortie < bougies[0][0] || tDeb > tFinFen)) continue;
        const x0 = R.x(iDe(tDeb)), x1 = fini ? R.x(iDe(p.tSortie)) : Math.max(R.x(bougies.length - 1) + R.pas * 0.5, x0 + R.pas * 1.5), yE = R.y(p.entree), yS = R.y(p.stop), yC = p.cible != null ? R.y(p.cible) : yE, gain = fini && p.R > 0;
        S.zonesDessinees.push({ id: p.id, statut: p.statut, x0, x1, yE, yS, yC, cible: p.cible, entree: p.entree, stop: p.stop }); const w = Math.max(2, x1 - x0), nx = Math.round(x0) + .5, haut = (ya, yb) => [Math.min(ya, yb), Math.abs(ya - yb)];
        const zone = (ya, yb, rvb, bord) => { const [y, h] = haut(ya, yb); ctx.fillStyle = 'rgba(' + rvb + ',' + (fini ? .1 : .2) + ')'; ctx.fillRect(nx, y, w, h); ctx.strokeStyle = 'rgba(' + rvb + ',' + bord + ')'; ctx.lineWidth = 1; ctx.strokeRect(nx, Math.round(y) + .5, Math.round(w), Math.max(1, Math.round(h))); };
        zone(yE, yS, '239,91,91', fini ? .45 : .8); if (p.cible != null) zone(yE, yC, '62,207,142', fini ? .45 : .8);   // SL en rouge (entrée → stop), TP en vert (entrée → objectif), bords nets
        ctx.strokeStyle = att ? COL.attente : COL.accent; ctx.lineWidth = 1.2; ctx.setLineDash(att ? [5, 3] : []); ctx.beginPath(); ctx.moveTo(nx, Math.round(yE) + .5); ctx.lineTo(Math.max(x1, x0 + 2), Math.round(yE) + .5); ctx.stroke(); ctx.setLineDash([]);
        if (!fini) { ctx.font = '600 10px ui-monospace,Consolas,monospace'; ctx.textAlign = 'left'; const xr = Math.min(x1 + 4, W - marge.d - 76); const dedans = y => Math.max(marge.h + 11, Math.min(R.bas - 3, y)), fleche = y => (y < marge.h ? '↑ ' : y > R.bas ? '↓ ' : ''); ctx.fillStyle = 'rgba(62,207,142,.95)'; if (p.cible != null) ctx.fillText(fleche(yC) + 'TP ' + C.prixTexte(p.cible), xr, dedans(yC + (yC < yE ? 11 : -3))); ctx.fillStyle = 'rgba(239,91,91,.95)'; ctx.fillText(fleche(yS) + 'SL ' + C.prixTexte(p.stop), xr, dedans(yS + (yS > yE ? -3 : 11))); ctx.textAlign = 'left'; }
        ctx.fillStyle = COL.texte; ctx.font = '10px system-ui'; ctx.textAlign = 'left';
        if (fini) {   // entrée ▲/▼, trait entrée → sortie, point de sortie et résultat
          const yX = R.y(p.sortie), coul = gain ? COL.hausse : COL.baisse; ctx.strokeStyle = coul; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x0, yE); ctx.lineTo(x1, yX); ctx.stroke(); ctx.lineWidth = 1;
          ctx.fillStyle = COL.accent; ctx.fillText(p.sens > 0 ? '▲' : '▼', x0 - 4, p.sens > 0 ? yE + 11 : yE - 3); ctx.fillStyle = coul; ctx.beginPath(); ctx.arc(x1, yX, 3.5, 0, 7); ctx.fill();
          const ibR = iDe(p.tSortie), ib = Math.max(0, Math.min(bougies.length - 1, ibR)), bc = bougies[ib], ax = R.x(ib), ay = R.y(bc[2]) - 5, tp = p.type === 'TP', visible = ibR >= 0 && ibR < bougies.length && ax >= marge.g && ax <= marge.g + R.W;   // flèche sur la BOUGIE de clôture : verte = objectif touché (TP), rouge = stop touché (SL)
          if (visible) { ctx.fillStyle = tp ? COL.hausse : COL.baisse; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - 6, ay - 11); ctx.lineTo(ax + 6, ay - 11); ctx.closePath(); ctx.fill(); ctx.font = '700 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText((p.type || (tp ? 'TP' : 'SL')) + ' ' + C.signe(p.R, 1) + ' R', Math.min(W - marge.d - 34, Math.max(marge.g + 34, ax)), ay - 14); ctx.textAlign = 'left'; }
          
        } else { ctx.fillStyle = COL.accent; ctx.fillText(p.sens > 0 ? '▲' : '▼', x0 - 4, p.sens > 0 ? yE + 11 : yE - 3); ctx.fillStyle = COL.texte; ctx.fillText((p.sens > 0 ? 'ACHAT ' : 'VENTE ') + (att ? 'en attente' : 'en cours'), Math.min(x0 + 8, W - marge.d - 120), Math.min(yE, yS, yC) - 3); }
      }
      ctx.restore();
      // trades REJOUÉS visibles dans la fenêtre
      if (S.couches.rejoue && a.rejoue) for (const r of a.rejoue) {
        const [cle, sens, tE, tS, entree, stop, sortie, statut, Rr] = r; if (!r[0].endsWith('·' + S.tf) || tE < bougies[0][0] || tE > bougies[bougies.length - 1][0] + pas) continue;
        const xe = R.x(iDe(tE)), xs = R.x(iDe(tS)); ctx.strokeStyle = COL.rejoue; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xe, R.y(entree)); ctx.lineTo(xs, R.y(sortie)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = COL.rejoue; ctx.fillText((Rr > 0 ? '✔' : '✖') + ' rejoué ' + C.signe(Rr, 1) + ' R', xs + 3, R.y(sortie) - 3);
      }
      // dernière bougie : point pulsé
      S.geo = { g: marge.g, W: R.W, pas: R.pas, min: R.min, max: R.max, haut: marge.h, bas: R.bas, H, deb: i0, n: bougies.length, total: n, gauche: fen.gauche, vis: fen.vis, off, t0: ser.bougies[0][0], pasT: pas };
      const dernierX = R.x(bougies.length - 1), derniereVisible = i1 >= n && dernierX >= marge.g && dernierX <= marge.g + R.W, dernierY = R.y(bougies[bougies.length - 1][4]); S.dot = derniereVisible ? { x: dernierX, y: dernierY, W, H } : null;
      if (derniereVisible) { ctx.fillStyle = COL.accent; ctx.beginPath(); ctx.arc(dernierX, dernierY, 3, 0, 7); ctx.fill(); dessinerPoint(); ctx.fillText(C.prixTexte(bougies[bougies.length - 1][4]), W - marge.d + 4, dernierY + 3); }
      // axe du temps : cinq repères à intervalles réguliers de l'écran ; hors des données, la date est prolongée à pas constant
      ctx.fillStyle = COL.texte; ctx.textAlign = 'center'; for (let k = 0; k < 5; k++) { const idx = fen.gauche + fen.vis * (k + 0.5) / 5, j = Math.round(idx), t = j >= 0 && j < n ? ser.bougies[j][0] : ser.bougies[0][0] + idx * pas; ctx.fillText(new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ''), marge.g + R.W * (k + 0.5) / 5, H - 5); } ctx.textAlign = 'left';
      E.info.textContent = 'Molette : zoom · glisser : déplacer · pincer : zoom · double clic : tout revoir' + (fen.live ? '. ' : ' · vue décalée (double clic pour revenir au direct). ') + (extDe().charge ? 'Chargement de bougies plus anciennes… ' : '') + (fen.gauche < 0 && extDe().fin ? 'Début de l’historique disponible. ' : '') + (i0 < ((S.ext[clefExt()] || {}).bougies || []).length ? 'Avant le suivi de Kepler : bougies seulement (pas de volume net). ' : '') + (S.couches.heat && !heat ? (S.origine === 'Worker' ? 'Carnet (heatmap, murs) : disponible depuis le PC seulement. ' : 'Carnet : ' + (S.carnet && S.carnet.raison ? S.carnet.raison : 'en chargement') + '. ') : '') + (a.approximatif ? 'Les bougies du direct ont une empreinte approchée (volume placé à la clôture de chaque seconde). ' : '') + (S.couches.footprint && R.pas < 34 ? 'Zoome sur les bougies M15 pour voir l’empreinte (volume acheteur / vendeur par prix). ' : '');
    }

    /* Le point qui pulse sur la dernière bougie vit sur une couche à part : on ne redessine jamais tout le graphique pour une animation. */
    function dessinerPoint() {
      const d = S.dot, cv = E.dot; if (!d || !cv) return; const dpr = Math.min(2, racine.devicePixelRatio || 1);
      if (cv.width !== Math.round(d.W * dpr) || cv.height !== Math.round(d.H * dpr)) { cv.width = Math.round(d.W * dpr); cv.height = Math.round(d.H * dpr); cv.style.width = d.W + 'px'; cv.style.height = d.H + 'px'; }
      const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(d.x - 14, d.y - 14, 28, 28);
      if (reduit() || leger || !detail().animations) return; const k = (Math.sin(S.anim / 14) + 1) / 2; ctx.strokeStyle = 'rgba(143,208,227,' + (0.55 * (1 - k)).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(d.x, d.y, 4 + 8 * k, 0, 7); ctx.stroke();
    }
    function dessinerNet() {
      const v = S.data && S.data.vue, a = v && v.actifs && v.actifs[S.actif]; const cv = E.net; if (!a) { E.phrase.textContent = ''; return; }
      const serie = serieEff(a, S.tf), nn = serie.bougies.length, fen = C.fenetreLibre(nn, S.visibles, S.gauche, nParDefaut()), j0 = Math.max(0, fen.i0), j1 = Math.min(nn, fen.i1), b = serie.bougies.slice(j0, j1), cvd = serie.cvd.slice(j0, j1), tr = C.volumeNetTrace(b, cvd), { ctx, W, H } = prepare(cv, 120), pad = 4, mid = H / 2, pasX = (W - 60) / b.length;
      ctx.strokeStyle = COL.grille; ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();
      tr.barres.forEach((x, i) => { ctx.fillStyle = x >= 0 ? 'rgba(62,207,142,.8)' : 'rgba(239,91,91,.8)'; const h = Math.abs(x) * (mid - pad); ctx.fillRect(6 + i * pasX + 0.5, x >= 0 ? mid - h : mid, Math.max(1, pasX - 1), Math.max(1, h)); });
      ctx.strokeStyle = COL.accent; ctx.lineWidth = 1.6; ctx.beginPath(); tr.cvd.forEach((x, i) => { const px = 6 + i * pasX + pasX / 2, py = H - pad - x * (H - 2 * pad); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = COL.texte; ctx.font = '10px system-ui'; ctx.fillText('CVD', W - 52, 12); ctx.fillText('delta', W - 52, mid - 4);
      const dom = serie.dominance; E.phrase.innerHTML = '<span class="' + (dom.sens > 0 ? 'vv-hausse' : 'vv-baisse') + '">' + esc(dom.texte) + '</span> <span class="vv-note">(' + C.fr(dom.part * 100, 0) + ' % des échanges agressifs sont des achats' + (serie.dernier && serie.dernier.absorption ? ' · absorption ' + (serie.dernier.absorption > 0 ? 'acheteuse' : 'vendeuse') + ' sur la dernière bougie' : '') + ')</span>';
    }

    /* ── Tableau d'historique sous le graphique : toutes les positions de l'agent (mode Trader + tableau de volume), filtrables ; un clic sur une ligne place le graphique sur ce trade ── */
    const heureP = t => (t ? new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
    const dureeP = ms => (ms == null ? '—' : ms < 5400e3 ? Math.round(ms / 60000) + ' min' : ms < 172800e3 ? C.fr(ms / 3600e3, 1) + ' h' : C.fr(ms / 86400e3, 1) + ' j');
    function rendreHisto() {
      const v = S.data && S.data.vue; if (!v) { E.histo.innerHTML = ''; return; }
      const p = portefeuilleCourant(v), prix = {}; for (const a of ['BTC', 'SOL', 'DOGE']) prix[a] = C.prixDe(S.data.trader, v, a, S.prixLive);
      const T = C.tableHistorique(C.tousTrades(S.data.trader, v), { capital0: p.capital0 || 10000, risquePct: p.risquePct || 1, prix, capitalAvant: p.capitalAvantListe != null ? p.capitalAvantListe : null, publie: p.resumePub || null }), r = T.resume, f = S.hf;
      const lignes = T.lignes.filter(l => (f.actif === 'tous' || l.actif === f.actif) && (f.res === 'tous' || (f.res === 'gagnants' && l.statut === 'terminee' && l.R > 0) || (f.res === 'perdants' && l.statut === 'terminee' && l.R <= 0) || (f.res === 'ouverts' && l.statut !== 'terminee')));
      const seg = (cle, vals) => '<div class="vv-seg" role="group">' + vals.map(([k, t]) => '<button type="button" data-hf="' + cle + ':' + k + '" aria-pressed="' + (f[cle] === k) + '">' + t + '</button>').join('') + '</div>';
      const chip = (t, x, cls) => '<span class="vv-chip"><small>' + t + '</small><b class="' + (cls || '') + '">' + x + '</b></span>', sg = x => (x == null ? '' : x >= 0 ? 'vv-hausse' : 'vv-baisse');
      let h = '<div class="vv-titre">Historique des positions <small>simulation · tous les trades suivis par l’agent</small></div>';
      h += '<div class="vv-chips">' + chip('trades terminés', r.n) + chip('réussite', r.taux == null ? '—' : C.fr(r.taux * 100, 0) + ' %') + chip('R moyen', r.rMoyen == null ? '—' : C.signe(r.rMoyen, 2), sg(r.rMoyen)) + chip('cumul', C.signe(r.cumulR, 1) + ' R', sg(r.cumulR)) + chip('gain simulé', C.signe(r.gainUsd, 2) + ' $', sg(r.gainUsd))
        + chip('facteur de profit', r.facteurProfit == null ? '—' : C.fr(r.facteurProfit, 2)) + chip('meilleur / pire', r.meilleur == null ? '—' : C.signe(r.meilleur, 1) + ' / ' + C.signe(r.pire, 1) + ' R') + chip('baisse max', C.fr(r.baisseMaxR, 1) + ' R') + (r.ouverts || r.enAttente ? chip('en cours / attente', r.ouverts + ' / ' + r.enAttente) : '') + '</div>';
      h += '<div class="vv-histo-filtres">' + seg('actif', [['tous', 'Tous'], ['BTC', 'BTC'], ['SOL', 'SOL'], ['DOGE', 'DOGE']]) + seg('res', [['tous', 'Tous'], ['gagnants', 'Gagnants'], ['perdants', 'Perdants'], ['ouverts', 'En cours']]) + '<span class="vv-note">' + lignes.length + ' ligne' + (lignes.length > 1 ? 's' : '') + '</span></div>';
      if (r.partiel) h += '<p class="vv-note">Statistiques d’ensemble sur les ' + r.n + ' trades ; meilleur / pire, facteur de profit et baisse max sur les ' + r.nListes + ' derniers listés.</p>';
      if (r.parNom.length > 1 || r.parActif.length > 1) h += '<p class="vv-note vv-histo-par">Ce qui a marché : ' + r.parNom.slice(0, 4).map(e => esc(e.cle) + ' ' + C.signe(e.R, 1) + ' R (' + e.n + ', ' + C.fr(e.taux * 100, 0) + ' %)').join(' · ') + ' — par actif : ' + r.parActif.map(e => esc(e.cle) + ' ' + C.signe(e.R, 1) + ' R (' + e.n + ')').join(' · ') + '</p>';
      h += lignes.length ? '<div class="vv-table-wrap vv-histo-wrap"><table class="vv-table vv-histo-table"><thead><tr><th>Entrée (date)</th><th>Actif</th><th>Sens</th><th>Entrée</th><th>Stop</th><th>TP</th><th>Sortie</th><th>Résultat</th><th>R</th><th>Gain simulé</th><th>Durée</th></tr></thead><tbody>'
        + lignes.map(l => { const fini = l.statut === 'terminee', gain = fini && l.R > 0, R = fini ? l.R : l.flottantR, etat = fini ? (l.type || (gain ? 'TP' : 'SL')) + (gain ? ' ✔' : ' ✖') : l.statut === 'ouverte' ? 'en cours' : 'en attente';
          return '<tr tabindex="0" data-histo="' + esc(l.id) + '" data-actif="' + esc(l.actif) + '" class="' + (fini ? (gain ? 'vv-ligne-g' : 'vv-ligne-p') : 'vv-ligne-v') + '"><td data-l="Entrée (date)">' + heureP(l.tEntree) + '</td><td data-l="Actif">' + esc(l.actif) + ' <small>' + esc(l.tf) + '</small></td><td data-l="Sens">' + (l.sens > 0 ? 'Achat' : 'Vente') + '</td><td data-l="Entrée">' + C.prixTexte(l.entree) + '</td><td data-l="Stop">' + C.prixTexte(l.stop) + '</td><td data-l="TP">' + (l.cible != null ? C.prixTexte(l.cible) : '—') + '</td><td data-l="Sortie">' + (fini ? C.prixTexte(l.sortie) : '—') + '</td><td data-l="Résultat" class="' + (fini ? (gain ? 'vv-hausse' : 'vv-baisse') : '') + '">' + etat + '</td><td data-l="R" class="' + sg(R) + '">' + (R == null ? '—' : C.signe(R, 2)) + (fini || R == null ? '' : ' <small>flott.</small>') + '</td><td data-l="Gain simulé" class="' + sg(l.usd) + '">' + (l.usd == null ? '—' : C.signe(l.usd, 2) + ' $') + '</td><td data-l="Durée">' + dureeP(l.dureeMs) + '</td></tr>'; }).join('')
        + '</tbody></table></div><p class="vv-note">Gain simulé : risque ' + C.fr(p.risquePct || 1, 1) + ' % du capital à chaque trade, capital composé dans l’ordre des sorties. Prix de sortie déduit du R. Un clic sur une ligne montre le trade sur le graphique.' + (p.incomplet ? ' Historique partiel : ' + r.n + ' trades sur ' + p.incomplet + ' enregistrés par l’agent.' : '') + '</p>'
        : '<p class="vv-note">Aucune position ne correspond' + (T.lignes.length ? ' à ces filtres.' : ' : l’agent n’a encore pris aucun trade. Dès qu’il en prend un, il apparaît ici avec son résultat.') + '</p>';
      const defil = E.histo.querySelector('.vv-histo-wrap'), top = defil ? defil.scrollTop : 0; E.histo.innerHTML = h; const w = E.histo.querySelector('.vv-histo-wrap'); if (w) w.scrollTop = top;
    }
    function voirTrade(id) {
      const t = C.tousTrades(S.data && S.data.trader, S.data && S.data.vue).find(x => String(x.id) === String(id)); if (!t) return;
      const v = S.data.vue; if (v.actifs[t.actif]) S.actif = t.actif; ecrireLocal('rayle_vv_actif', S.actif); if (t.tf === 'H1' || t.tf === 'M15') { S.tf = t.tf; ecrireLocal('rayle_vv_tf', S.tf); }
      S.centrer = t.tEntree || t.tSignal || t.tSortie; S.carnet = null; toutRendre(); chargerCarnet(); try { E.graph.scrollIntoView({ block: 'nearest', behavior: reduit() ? 'auto' : 'smooth' }); } catch (e) { /* rien */ }
    }

    /* ── carnet ── */
    function rendreCarnet() {
      const v = S.data && S.data.vue; E.carnetActif.textContent = S.actif; if (!v) { E.carnetMsg.innerHTML = ''; E.dom.hidden = true; E.carnetPied.innerHTML = ''; E.direct.hidden = true; return; }
      const c = S.carnet; let msg = '', pied = '';
      if (!c) msg = '<p class="vv-note">' + (S.origine === 'Worker' ? 'Le carnet enregistré n’est lisible que depuis le PC (il n’est pas publié sur le Worker).' : 'Chargement du carnet…') + '</p>';
      else if (!c.ok) msg = '<p class="vv-note">' + esc(c.raison || 'Carnet indisponible.') + '</p>';
      else {
        pied += '<div class="vv-deseq">' + Object.entries(c.deseq).map(([k, x]) => '<span>' + k.slice(1) + ' % : <b class="' + (x >= 0 ? 'vv-hausse' : 'vv-baisse') + '">' + (x == null ? '—' : C.signe(x * 100, 0) + ' %') + '</b></span>').join('') + '</div><p class="vv-note">Déséquilibre : plus de liquidité posée côté achat (+) ou côté vente (−) à cette distance du prix. Les lignes regroupent la liquidité par distance au prix, pas par prix exact.</p>';
        pied += c.murs && c.murs.length ? '<ul class="vv-murs">' + c.murs.map(m => '<li>Mur ' + (m.cote === 'bid' ? 'acheteur' : 'vendeur') + ' à ' + C.prixTexte(m.prix) + ' · ' + C.compact(m.usdMax) + ' $ · posé depuis ' + C.il(Date.now() - m.ageS * 1000, Date.now()) + ' · à ' + C.fr(m.distancePct, 2) + ' %' + (m.fiabilite ? ' · ' + esc(m.fiabilite) : '') + '</li>').join('') + '</ul>' : '<p class="vv-note">Aucun gros mur actif près du prix.</p>';
        pied += '<p class="vv-note">' + esc(c.note) + '</p>';
      }
      E.carnetMsg.innerHTML = msg; E.carnetPied.innerHTML = pied; majDom(c);
    }
    /* Échelle animée : les lignes sont créées UNE fois (clé = côté + distance) puis seulement mises à jour, pour que la largeur glisse (transition CSS) et que la ligne clignote quand sa taille change. */
    function majDom(c) {
      const d = C.niveauxDom(c), el = E.dom; if (!d) { el.hidden = true; E.direct.hidden = true; S.domVu = null; return; }
      el.hidden = false; E.direct.hidden = !!(S.origine === 'Worker');
      if (!el.firstChild || S.domActif !== S.actif) { el.innerHTML = ''; S.domLignes = new Map(); S.domActif = S.actif; }
      const ligne = (l, pos) => { let r = S.domLignes.get(l.cle); if (!r) { const n = document.createElement('div'); n.className = 'vv-dl vv-dl-' + l.cote; n.innerHTML = '<span class="vv-dl-d"></span><span class="vv-dl-b"><i></i></span><span class="vv-dl-u"></span>'; r = { n, b: n.querySelector('i'), u: n.querySelector('.vv-dl-u'), d: n.querySelector('.vv-dl-d'), usd: null }; S.domLignes.set(l.cle, r); } r.d.textContent = l.distance; r.b.style.width = Math.round(l.part * 100) + '%'; r.u.textContent = C.compact(l.usd) + ' $';
        const dir = C.variation(r.usd, l.usd); if (dir && !reduit() && !leger) { r.n.dataset.flash = dir > 0 ? 'plus' : 'moins'; r.n.classList.remove('vv-dl-f'); void r.n.offsetWidth; r.n.classList.add('vv-dl-f'); } r.usd = l.usd; if (r.n.parentNode !== el || el.children[pos] !== r.n) el.insertBefore(r.n, el.children[pos] || null); return r; };
      let pos = 0; for (const l of d.asks) ligne(l, pos++);
      let mid = el.querySelector('.vv-dl-mid'); if (!mid) { mid = document.createElement('div'); mid.className = 'vv-dl-mid'; } mid.innerHTML = '<span class="vv-hausse">' + Math.round(d.partAchat * 100) + ' % achat</span><b>' + C.prixTexte(d.prix) + '</b><span class="vv-baisse">' + Math.round((1 - d.partAchat) * 100) + ' % vente</span><i class="vv-dl-rap"><u style="width:' + Math.round(d.partAchat * 100) + '%"></u></i>'; el.insertBefore(mid, el.children[pos] || null); pos++;
      for (const l of d.bids) ligne(l, pos++);
    }
    async function chargerCarnet() {
      if (S.origine === 'Worker') { S.carnet = null; rendreCarnet(); return; }
      const actif = S.actif; try { const c = await lireCarnet(actif); if (c) c.actif = c.actif || actif; S.carnet = c; } catch (e) { S.carnet = { ok: false, raison: 'carnet illisible' }; }
      if (S.actif === actif && !S.detruit) { rendreCarnet(); if (S.couches.heat || S.couches.murs) dessinerGraphique(); }
    }

    /* ── listes ── */
    function rendreListes() {
      const v = S.data && S.data.vue; if (!v) { E.listes.innerHTML = ''; return; }
      const L = C.listes(v, null), bloc = (titre, l, vide) => '<div class="vv-liste"><div class="vv-titre">' + titre + ' <small>' + l.length + '</small></div>' + (l.length ? l.map(p => { const t = C.lignePosition(p), ouv = S.ouvertes.has(p.id); return '<button type="button" class="vv-ligne ' + (t.gagnant === true ? 'vv-hausse' : t.gagnant === false ? 'vv-baisse' : '') + '" data-ligne="' + esc(p.id) + '" aria-expanded="' + ouv + '">' + esc(t.texte) + '<small> · ' + esc(p.niveauPreuve.replace('a_lessai', 'À l’essai').replace('candidate', 'Candidate').replace('validee', 'Validée')) + '</small></button>' + (ouv ? '<p class="vv-expl">' + esc(p.raison || '') + ' Niveau : ' + esc(p.niv || '') + '. ' + (p.raisonFin ? esc(p.raisonFin) + '.' : '') + ' Simulation : aucun ordre réel.</p>' : ''); }).join('') : '<p class="vv-note">' + vide + '</p>') + '</div>';
      const heure = v.actifs && Object.values(v.derniereBarre || {}).length ? new Date(Math.max(...Object.values(v.derniereBarre))).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }) : '—';
      E.listes.innerHTML = bloc('En attente', L.attente, 'Aucune position en attente. Kepler surveille BTC / SOL / DOGE (dernière bougie analysée ' + heure + ').') + bloc('En cours', L.cours, 'Aucune position ouverte.') + bloc('Terminées', L.finies, 'Pas encore de trade terminé en direct.') + (L.annulees ? '<p class="vv-note">' + L.annulees + ' ordre(s) non touché(s), annulé(s).</p>' : '');
    }

    /* ── rejoué ── */
    function rendreRejoue() {
      const v = S.data && S.data.vue; if (!v) { E.rejoue.innerHTML = ''; return; }
      const r = v.rejoue; let h = '<div class="vv-titre">Positions d’avant <span class="vv-rejoue-badge">REJOUÉ, pas réel</span></div>';
      if (!r) h += '<p class="vv-note">Le passé n’a pas encore été rejoué (la recherche tourne une fois par jour).</p>';
      else {
        const cov = Object.entries(r.couvertures || {}).map(([a, c]) => a + ' ' + c.de + ' → ' + c.a).join(' · ');
        h += '<p class="vv-note">Ce que les stratégies suivies AURAIENT pris sur les données réelles (' + esc(cov) + '), frais et glissement inclus. Les signaux de carnet ne sont rejoués que sur la période enregistrée.</p>';
        h += '<div class="vv-table-wrap"><table class="vv-table"><thead><tr><th>Stratégie</th><th>Trades</th><th>R moyen</th><th>Réussite</th><th>IC 95 %</th><th>Baisse max</th></tr></thead><tbody>' + C.rejoueTrimestres(r).map(c => '<tr><td>' + esc(c.cle) + '</td><td>' + c.n + '</td><td class="' + (c.rMoyen >= 0 ? 'vv-hausse' : 'vv-baisse') + '">' + C.signe(c.rMoyen, 3) + '</td><td>' + C.fr(c.tauxReussite * 100, 0) + ' %</td><td>' + C.signe(c.ic95[0], 2) + ' … ' + C.signe(c.ic95[1], 2) + '</td><td>' + C.fr(c.drawdownR, 1) + ' R</td></tr>').join('') + '</tbody></table></div>';
        for (const c of C.rejoueTrimestres(r)) h += '<div class="vv-trims"><b>' + esc(c.cle) + '</b> par trimestre : ' + c.trimestres.filter(t => t.n >= 3).map(t => '<span class="' + (t.R >= 0 ? 'vv-hausse' : 'vv-baisse') + '">' + esc(t.trimestre) + ' ' + C.signe(t.R, 1) + ' R (' + t.n + ')</span>').join(' · ') + '<br>par actif : ' + Object.entries(c.parActif || {}).map(([a, x]) => a + ' ' + C.signe(x.rMoyen, 2) + ' R (' + x.n + ')').join(' · ') + '</div>';
        if (v.recherche && v.recherche.finalistes && v.recherche.finalistes.length) h += '<details class="vv-detail"><summary>Stratégies testées (' + v.recherche.nEssais + ' variantes comptées)</summary><ul>' + v.recherche.finalistes.map(f => '<li><b>' + esc(f.id) + '</b> — ' + esc(f.niveau === 'a_lessai' ? 'À l’essai' : f.niveau === 'candidate' ? 'Candidate' : 'Validée') + ' : apprentissage ' + C.signe(f.appr.rMoyen, 2) + ' (' + f.appr.n + '), validation ' + C.signe(f.valid.rMoyen, 2) + ' (' + f.valid.n + '), test ' + C.signe(f.test.rMoyen, 2) + ' (' + f.test.n + '), au hasard ' + C.signe(f.hasard, 2) + ' R. ' + (f.manque.length ? 'Il manque : ' + esc(f.manque.join(' ; ')) + '.' : '') + ' Fréquence : ' + C.fr(f.parSemaineActif, 1) + ' par semaine et par actif.</li>').join('') + '</ul></details>';
      }
      E.rejoue.innerHTML = h;
    }

    function rendreFlux() {
      const v = S.data && S.data.vue; if (!v) { E.flux.innerHTML = ''; return; }
      const ev = C.fluxExecution(C.tousTrades(S.data.trader, v)), cles = new Set(ev.map(e => e.id + e.type)), premier = !S.fluxVus;
      const co = v.coherence, noteCoh = co && (co.evites || co.remplaces) ? '<p class="vv-note vv-coh" data-vv="coherence">Cohérence : jamais acheteur et vendeur en même temps sur un actif. ' + co.evites + ' ordre(s) de sens contraire écarté(s), ' + co.remplaces + ' ordre(s) en attente remplacé(s) par une impulsion' + (co.derniers && co.derniers.length ? ' — dernier : ' + esc(co.derniers[co.derniers.length - 1].actif + ', ' + co.derniers[co.derniers.length - 1].raison) : '') + '.</p>' : '';
      E.flux.innerHTML = '<div class="vv-titre">Flux d’exécution <small>simulation, plus récent d’abord</small></div>' + noteCoh + (ev.length ? '<ul>' + ev.map(e => '<li data-type="' + e.type + '" class="' + (!premier && !S.fluxVus.has(e.id + e.type) ? 'vv-neuf ' : '') + (e.type === 'sortie' ? (e.gain ? 'vv-hausse' : 'vv-baisse') : '') + '"><time>' + new Date(e.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }) + '</time><span>' + esc(e.texte) + '</span></li>').join('') + '</ul>' : '<p class="vv-note">Aucun trade pour l’instant : dès que l’agent prend une position, chaque étape (signal, entrée, sortie) apparaît ici.</p>');
      S.fluxVus = cles;
    }
    function toutRendre() { rendreHisto(); rendreFlux(); rendreEtat(); rendrePortefeuille(); rendreOutils(); rendreCarnet(); rendreListes(); rendreRejoue(); dessiner(); }
    async function rafraichir() {
      if (S.detruit || S.enCours) return; S.enCours = true;
      try {
        const d = await lire(); if (d && d.vue && !d.trader) { try { d.trader = await lireTrader(); } catch (e) { d.trader = null; } } S.data = d; if (d && d.vue && racine.AgentAlertes) racine.AgentAlertes.surVue(d.vue); S.service = d && d.service || null; S.origine = d && d.origine || null;
        if (d && d.vue && !d.vue.actifs[S.actif]) S.actif = Object.keys(d.vue.actifs)[0] || S.actif;
        toutRendre(); if (d && d.vue && (!S.carnet || Date.now() - (S.carnet.t || 0) > 60000)) chargerCarnet();
      } catch (e) { E.etat.innerHTML = '<span class="vv-ko">Lecture impossible : ' + esc(e.message || e) + '</span> <button type="button" class="vv-reessayer">Réessayer</button>'; }
      finally { S.enCours = false; }
    }
    racineEl.addEventListener('click', ev => { if (ev.target.closest('.vv-reessayer')) rafraichir(); });
    E.etat.innerHTML = '<span>Chargement…</span>'; E.pf.innerHTML = '<div class="vv-sq"></div>';
    function boucle() { S.anim++; if (!S.detruit && S.data && S.data.vue && !document.hidden && S.anim % 4 === 0 && S.visible !== false) dessinerPoint(); rafId = requestAnimationFrame(boucle); }
    try { new IntersectionObserver(es => { S.visible = es.some(e => e.isIntersecting); }).observe(E.graph); } catch (e) { /* pas d'IntersectionObserver */ }
    try { observateur = new ResizeObserver(() => { if (S.data && S.data.vue) { dessiner(); dessinerCourbe(); } }); observateur.observe(racineEl); } catch (e) { /* pas de ResizeObserver */ }
    const prixRapide = setInterval(async () => { if (S.detruit || document.hidden || S.visible === false || S.prixEnCours || !S.data || !S.data.trader) return; if (!C.tousTrades(S.data.trader, S.data.vue).some(t => t.statut === 'ouverte')) return;
      S.prixEnCours = true; try { const px = await lirePrix(); if (px && !S.detruit) { S.prixLive = { ...(S.prixLive || {}), ...px }; rendrePortefeuille(); rendreHisto(); dessinerGraphique(); } } catch (e) { /* on garde le dernier prix */ } finally { S.prixEnCours = false; } }, intervallePrix || (leger ? 15000 : 5000));   // résultat flottant en direct
    const carnetRapide = setInterval(() => { if (!S.detruit && S.origine === 'PC' && S.data && S.data.vue && !document.hidden && S.visible !== false && !S.carnetEnCours) { S.carnetEnCours = true; chargerCarnet().finally(() => { S.carnetEnCours = false; }); } }, leger ? 10000 : 4000);   // carnet quasi direct (PC seulement)
    rafraichir(); minuteur = setInterval(rafraichir, intervalle); rafId = requestAnimationFrame(boucle);
    return { rafraichir, etat: () => S, voirTrade, detruire() { S.detruit = true; clearInterval(minuteur); clearInterval(carnetRapide); clearInterval(prixRapide); cancelAnimationFrame(rafId); if (observateur) observateur.disconnect(); racineEl.remove(); } };
  }
  racine.VolumeVivant = { monter, lireVueDefaut };
}(typeof window !== 'undefined' ? window : globalThis));
