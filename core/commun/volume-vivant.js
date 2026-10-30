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
    try { if (racine.wjson && typeof workerReady !== 'undefined' && workerReady()) { const j = await racine.wjson('/agent/mobile', 15000); if (j && j.paquet && j.paquet.volume) return { vue: j.paquet.volume, service: null, origine: 'Worker', recuLe: j.recuLe }; if (j && j.paquet) return { vue: null, origine: 'Worker', note: 'Le PC n’a pas encore publié le tableau de volume.' }; } } catch (e) { /* Worker injoignable */ }
    return null;
  }
  async function lireCarnetDefaut(actif) { try { const r = await delai(5000, fetch('/__agent/volume/carnet?actif=' + actif, { cache: 'no-store' })); if (r.ok) return await r.json(); } catch (e) { /* pas de PC */ } return null; }

  function monter(conteneur, { lire = lireVueDefaut, lireCarnet = lireCarnetDefaut, intervalle = 15000, maintenant = () => Date.now(), leger = false } = {}) {
    const racineEl = document.createElement('section'); racineEl.className = 'vv'; racineEl.setAttribute('aria-label', 'Tableau vivant de l’agent'); conteneur.appendChild(racineEl);
    const S = { data: null, service: null, origine: null, actif: lireLocal('rayle_vv_actif') || 'BTC', tf: lireLocal('rayle_vv_tf') || 'H1', preset: lireLocal('rayle_vv_preset') || 'complet', couches: null, visibles: 0, carnet: null, carnetActif: null, detruit: false, enCours: false, ouvertes: new Set(), anim: 0, chart: null, dernierCapital: null };
    S.couches = Object.assign(C.couches(S.preset), JSON.parse(lireLocal('rayle_vv_couches') || '{}'));
    let minuteur = null, rafId = 0, observateur = null;

    racineEl.innerHTML = '<div class="vv-etat" data-vv="etat" role="status"></div>'
      + '<div class="vv-haut"><div class="vv-pf" data-vv="pf"></div><div class="vv-verdict" data-vv="verdict"></div></div>'
      + '<div class="vv-outils" data-vv="outils"></div>'
      + '<div class="vv-zone"><canvas class="vv-graph" data-vv="graph" aria-label="Graphique des prix avec volume, profil, carnet et positions" role="img"></canvas><canvas class="vv-dot" data-vv="dot" aria-hidden="true"></canvas><div class="vv-info" data-vv="info" aria-live="polite"></div></div>'
      + '<div class="vv-net"><div class="vv-titre">Volume net <small>acheteurs agressifs moins vendeurs agressifs, bougie par bougie</small></div><canvas class="vv-netc" data-vv="net" aria-label="Volume net par bougie et CVD" role="img"></canvas><p class="vv-phrase" data-vv="phrase"></p><p class="vv-legende">Vert : les acheteurs ont poussé le prix. Rouge : les vendeurs. La ligne claire (CVD) est le cumul de la journée : si elle monte, les acheteurs gagnent du terrain.</p></div>'
      + '<div class="vv-carnet" data-vv="carnet"></div>'
      + '<div class="vv-listes" data-vv="listes"></div>'
      + '<div class="vv-rejoue" data-vv="rejoue"></div>';
    const q = n => racineEl.querySelector('[data-vv="' + n + '"]');
    const E = { dot: q('dot'), etat: q('etat'), pf: q('pf'), verdict: q('verdict'), outils: q('outils'), graph: q('graph'), info: q('info'), net: q('net'), phrase: q('phrase'), carnet: q('carnet'), listes: q('listes'), rejoue: q('rejoue') };

    /* ── haut de page ── */
    function rendreEtat() {
      const d = S.data; if (!d) { E.etat.innerHTML = '<span class="vv-ko">Ni le service du PC ni le Worker ne m’ont répondu.</span> <span>simulation, aucun ordre réel</span>'; return; }
      if (!d.vue) { E.etat.innerHTML = '<span class="vv-ko">' + esc(d.note || 'Le tableau de volume n’est pas encore calculé.') + '</span> <span>simulation, aucun ordre réel</span>'; return; }
      const b = C.barreEtat(d.vue, S.service, maintenant());
      E.etat.innerHTML = '<span class="' + (b.serviceOk ? 'vv-ok' : 'vv-ko') + '">● ' + esc(b.service) + '</span><span>' + esc(b.bougie) + '</span><span>' + esc(b.carnet) + '</span><span class="vv-sim">' + esc(b.simulation) + '</span>' + (S.origine === 'Worker' ? '<span>copie du Worker</span>' : '');
    }
    function animerChiffre(el, vers, fmt) {
      if (reduit() || leger || S.dernierCapital == null || S.dernierCapital === vers) { el.textContent = fmt(vers); S.dernierCapital = vers; return; }
      const de = S.dernierCapital, t0 = performance.now(); S.dernierCapital = vers;
      const pas = t => { const k = Math.min(1, (t - t0) / 600); el.textContent = fmt(de + (vers - de) * (1 - Math.pow(1 - k, 3))); if (k < 1 && !S.detruit) requestAnimationFrame(pas); };
      requestAnimationFrame(pas);
    }
    function rendrePortefeuille() {
      const v = S.data && S.data.vue; if (!v) { E.pf.innerHTML = ''; E.verdict.innerHTML = ''; return; }
      const p = v.portefeuille, gagne = p.gainUsd >= 0;
      E.pf.innerHTML = '<div class="vv-pf-etiquette">Portefeuille virtuel <b>SIMULÉ</b> · départ ' + C.usd(p.capital0) + ' · risque ' + C.fr(p.risquePct, 1) + ' % par trade</div>'
        + '<div class="vv-pf-grand ' + (gagne ? 'vv-hausse' : 'vv-baisse') + '"><span data-vv="capital">' + C.usd(p.capital) + '</span></div>'
        + '<div class="vv-pf-gain ' + (gagne ? 'vv-hausse' : 'vv-baisse') + '">' + C.signe(p.gainUsd) + ' $ · ' + C.signe(p.gainPct) + ' % · cette semaine ' + C.signe(p.semaineUsd, 0) + ' $</div>'
        + '<div class="vv-pf-stats">' + (p.nTrades ? p.nTrades + ' trades suivis · réussite ' + C.fr(p.tauxReussite * 100, 0) + ' % · R moyen ' + C.signe(p.rMoyen) + ' · baisse max ' + C.fr(p.drawdownMaxPct, 1) + ' %' : 'Aucun trade terminé pour l’instant : l’agent suit chaque proposition dès qu’elle arrive.') + '</div>'
        + '<canvas class="vv-pf-courbe" data-vv="courbe" aria-label="Courbe de capital" role="img"></canvas>'
        + '<div class="vv-pf-legende"><span class="vv-trait">▬</span> live (suivi en direct) <span class="vv-pointille">┅</span> si on avait suivi depuis le début (REJOUÉ, pas réel)</div>'
        + (p.parStrategie && p.parStrategie.length ? '<ul class="vv-pf-strat">' + p.parStrategie.map(s => '<li class="' + (s.pnlUsd >= 0 ? 'vv-hausse' : 'vv-baisse') + '">' + esc(s.cle) + ' : ' + C.signe(s.pnlUsd, 0) + ' $ (' + s.n + ')</li>').join('') + '</ul>' : '')
        + '<div class="vv-confirme">Risque par trade : valeur de départ à confirmer par toi (1 % par défaut).</div>';
      animerChiffre(E.pf.querySelector('[data-vv="capital"]'), p.capital, x => C.usd(x));
      dessinerCourbe();
      E.verdict.innerHTML = '<div class="vv-titre">Verdict honnête</div><p>' + esc(v.verdict ? v.verdict.texte : '') + '</p>'
        + (v.configs && v.configs.length ? '<ul class="vv-cfg">' + v.configs.map(c => '<li><b>' + esc(c.nom) + '</b> ' + esc(c.tf) + ' · ' + esc(c.niveauLibelle) + (c.oosR != null ? ' · R ' + C.signe(c.oosR) + ' sur ' + c.oosN + ' trades hors apprentissage' : '') + (c.pause ? ' · EN PAUSE' : '') + '</li>').join('') + '</ul>' : '')
        + ((v.nonSuivis && Object.keys(v.nonSuivis).length) ? '<p class="vv-note">Non suivis en direct : ' + esc(Object.entries(v.nonSuivis).map(([a, r]) => a + ' (' + r + ')').join(' ; ')) + '.</p>' : '');
    }
    function dessinerCourbe() {
      const v = S.data && S.data.vue, cv = racineEl.querySelector('[data-vv="courbe"]'); if (!v || !cv) return;
      const c = prepare(cv, 90), ctx = c.ctx, W = c.W, H = c.H, p = v.portefeuille, live = C.courbeJours(p.courbe, v.demarreLe), rj = v.rejoue && v.rejoue.portefeuille ? C.courbeJours(v.rejoue.portefeuille.courbe) : [];
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
        + '<div class="vv-seg" aria-label="Zoom"><button type="button" data-zoom="-1" aria-label="Moins de bougies (zoom avant)">＋</button><button type="button" data-zoom="1" aria-label="Plus de bougies (zoom arrière)">－</button></div>'
        + '<div class="vv-seg" aria-label="Préréglage"><button type="button" data-preset="epure" aria-pressed="' + (S.preset === 'epure') + '">Épuré</button><button type="button" data-preset="complet" aria-pressed="' + (S.preset === 'complet') + '">Complet</button></div>'
        + '<details class="vv-couches"><summary>Couches</summary>' + L('heat', 'Carnet (heatmap)', S.couches.heat) + L('profil', 'Profil de volume', S.couches.profil) + L('footprint', 'Empreinte (zoom)', S.couches.footprint) + L('positions', 'Positions', S.couches.positions) + L('rejoue', 'Rejoué', S.couches.rejoue) + L('murs', 'Murs du carnet', S.couches.murs) + '</details>';
    }
    racineEl.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (b) {
        if (b.dataset.actif) { S.actif = b.dataset.actif; ecrireLocal('rayle_vv_actif', S.actif); S.carnet = null; toutRendre(); chargerCarnet(); }
        else if (b.dataset.tf) { S.tf = b.dataset.tf; ecrireLocal('rayle_vv_tf', S.tf); S.visibles = 0; toutRendre(); }
        else if (b.dataset.zoom) { S.visibles = Math.max(8, Math.round((S.visibles || nParDefaut()) * (b.dataset.zoom === '1' ? 1.4 : 0.7))); dessiner(); }
        else if (b.dataset.preset) { S.preset = b.dataset.preset; S.couches = C.couches(S.preset); ecrireLocal('rayle_vv_preset', S.preset); ecrireLocal('rayle_vv_couches', '{}'); rendreOutils(); dessiner(); }
        else if (b.dataset.ligne) { const id = b.dataset.ligne; S.ouvertes.has(id) ? S.ouvertes.delete(id) : S.ouvertes.add(id); rendreListes(); }
      }
    });
    racineEl.addEventListener('change', ev => { const c = ev.target.closest('[data-couche]'); if (!c) return; S.couches[c.dataset.couche] = c.checked; ecrireLocal('rayle_vv_couches', JSON.stringify(S.couches)); dessiner(); });

    /* ── canvas ── */
    function prepare(cv, hauteur) {
      const dpr = Math.min(2, racine.devicePixelRatio || 1), W = Math.max(200, cv.clientWidth || cv.parentNode.clientWidth || 320), H = hauteur || cv.clientHeight || 300;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; }
      const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); return { ctx, W, H };
    }
    const nParDefaut = () => (S.tf === 'H1' ? 72 : 64);
    const detail = () => C.niveauDetail({ largeur: racineEl.clientWidth || 800, leger });
    function dessiner() { dessinerGraphique(); dessinerNet(); }

    function dessinerGraphique() {
      const v = S.data && S.data.vue, a = v && v.actifs && v.actifs[S.actif]; const cv = E.graph;
      if (!a) { const c = prepare(cv, 120); c.ctx.fillStyle = COL.texte; c.ctx.font = '13px system-ui'; c.ctx.fillText(v ? 'Pas de données pour ' + S.actif + '.' : 'En attente des données du service Kepler…', 12, 40); return; }
      const serie = S.tf === 'H1' ? a.h1 : a.m15; if (!serie) return;
      const cvH = Math.max(280, Math.min(520, Math.round((racineEl.clientWidth || 800) * (racineEl.clientWidth < 600 ? 0.9 : 0.5)))), { ctx, W, H } = prepare(cv, cvH);
      const nVis = Math.min(serie.bougies.length, S.visibles || nParDefaut()), bougies = serie.bougies.slice(-nVis), det = detail();
      const droite = S.couches.profil ? Math.min(78, W * 0.13) : 0, marge = { g: 6, d: 58, h: 8, b: 20 };
      // niveaux à inclure dans l'échelle : positions affichées
      const pos = S.couches.positions ? C.positionsAffichees(a.positions || []) : [], extra = []; for (const p of pos) extra.push(p.entree, p.stop, p.cible);
      const R = C.repere({ n: bougies.length, largeur: W, hauteur: H, marge, hauts: bougies.map(b => b[2]).concat(extra.length ? [Math.min(Math.max(...extra), Math.max(...bougies.map(b => b[2])) * 1.01)] : []), bas: bougies.map(b => b[3]).concat(extra.length ? [Math.max(Math.min(...extra), Math.min(...bougies.map(b => b[3])) * 0.99)] : []), droite });
      const ts = bougies.map(b => [b[0]]), pas = S.tf === 'H1' ? 3600e3 : 900e3;
      // grille + axe des prix
      ctx.font = '10px system-ui'; ctx.fillStyle = COL.texte; ctx.strokeStyle = COL.grille; ctx.textAlign = 'left';
      for (let k = 0; k <= 5; k++) { const p = R.min + (R.max - R.min) * k / 5, y = R.y(p); ctx.beginPath(); ctx.moveTo(marge.g, y); ctx.lineTo(W - marge.d, y); ctx.stroke(); ctx.fillText(C.prixTexte(p), W - marge.d + 4, y + 3); }
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
      // positions
      const iDe = t => { const k = Math.floor((t - bougies[0][0]) / pas); return Math.max(0, Math.min(bougies.length - 1, k)); };
      for (const p of pos) {
        const x0 = R.x(p.tEntree ? iDe(p.tEntree) : iDe(p.tSignal)), x1 = p.tSortie ? R.x(iDe(p.tSortie)) : R.x(bougies.length - 1) + 40, yE = R.y(p.entree), yS = R.y(p.stop), yC = R.y(p.cible), fini = p.statut === 'terminee', att = p.statut === 'en_attente';
        ctx.fillStyle = 'rgba(239,91,91,' + (fini ? .1 : .18) + ')'; ctx.fillRect(x0, Math.min(yE, yS), x1 - x0, Math.abs(yS - yE)); ctx.fillStyle = 'rgba(62,207,142,' + (fini ? .1 : .18) + ')'; ctx.fillRect(x0, Math.min(yE, yC), x1 - x0, Math.abs(yC - yE));
        ctx.strokeStyle = att ? COL.attente : COL.accent; ctx.setLineDash(att ? [5, 3] : []); ctx.beginPath(); ctx.moveTo(x0, yE); ctx.lineTo(x1, yE); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = COL.texte; ctx.font = '10px system-ui'; ctx.fillText((p.sens > 0 ? 'ACHAT ' : 'VENTE ') + (att ? 'en attente' : fini ? (p.R > 0 ? '✔ ' + C.signe(p.R) + ' R' : '✖ ' + C.signe(p.R) + ' R') : 'en cours') + ' · ' + p.niveauPreuve.replace('a_lessai', 'À l’essai'), Math.min(x0 + 4, W - 200), Math.min(yE, yS, yC) - 3);
      }
      // trades REJOUÉS visibles dans la fenêtre
      if (S.couches.rejoue && a.rejoue) for (const r of a.rejoue) {
        const [cle, sens, tE, tS, entree, stop, sortie, statut, Rr] = r; if (!r[0].endsWith('·' + S.tf) || tE < bougies[0][0] || tE > bougies[bougies.length - 1][0] + pas) continue;
        const xe = R.x(iDe(tE)), xs = R.x(iDe(tS)); ctx.strokeStyle = COL.rejoue; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xe, R.y(entree)); ctx.lineTo(xs, R.y(sortie)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = COL.rejoue; ctx.fillText((Rr > 0 ? '✔' : '✖') + ' rejoué ' + C.signe(Rr, 1) + ' R', xs + 3, R.y(sortie) - 3);
      }
      // dernière bougie : point pulsé
      const dernierX = R.x(bougies.length - 1), dernierY = R.y(bougies[bougies.length - 1][4]); S.dot = { x: dernierX, y: dernierY, W, H };
      ctx.fillStyle = COL.accent; ctx.beginPath(); ctx.arc(dernierX, dernierY, 3, 0, 7); ctx.fill(); dessinerPoint();
      ctx.fillStyle = COL.accent; ctx.fillText(C.prixTexte(bougies[bougies.length - 1][4]), W - marge.d + 4, dernierY + 3);
      // axe du temps
      ctx.fillStyle = COL.texte; ctx.textAlign = 'center'; for (let k = 0; k < 5; k++) { const i = Math.round((bougies.length - 1) * k / 4), d = new Date(bougies[i][0]); ctx.fillText(d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ''), Math.min(W - 50, Math.max(40, R.x(i))), H - 5); } ctx.textAlign = 'left';
      E.info.textContent = (S.couches.heat && !heat ? (S.origine === 'Worker' ? 'Carnet (heatmap, murs) : disponible depuis le PC seulement. ' : 'Carnet : ' + (S.carnet && S.carnet.raison ? S.carnet.raison : 'en chargement') + '. ') : '') + (a.approximatif ? 'Les bougies du direct ont une empreinte approchée (volume placé à la clôture de chaque seconde). ' : '') + (S.couches.footprint && R.pas < 34 ? 'Zoome sur les bougies M15 pour voir l’empreinte (volume acheteur / vendeur par prix). ' : '');
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
      const serie = S.tf === 'H1' ? a.h1 : a.m15, n = Math.min(serie.bougies.length, S.visibles || nParDefaut()), b = serie.bougies.slice(-n), cvd = serie.cvd.slice(-n), tr = C.volumeNetTrace(b, cvd), { ctx, W, H } = prepare(cv, 120), pad = 4, mid = H / 2, pasX = (W - 60) / b.length;
      ctx.strokeStyle = COL.grille; ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();
      tr.barres.forEach((x, i) => { ctx.fillStyle = x >= 0 ? 'rgba(62,207,142,.8)' : 'rgba(239,91,91,.8)'; const h = Math.abs(x) * (mid - pad); ctx.fillRect(6 + i * pasX + 0.5, x >= 0 ? mid - h : mid, Math.max(1, pasX - 1), Math.max(1, h)); });
      ctx.strokeStyle = COL.accent; ctx.lineWidth = 1.6; ctx.beginPath(); tr.cvd.forEach((x, i) => { const px = 6 + i * pasX + pasX / 2, py = H - pad - x * (H - 2 * pad); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = COL.texte; ctx.font = '10px system-ui'; ctx.fillText('CVD', W - 52, 12); ctx.fillText('delta', W - 52, mid - 4);
      const dom = serie.dominance; E.phrase.innerHTML = '<span class="' + (dom.sens > 0 ? 'vv-hausse' : 'vv-baisse') + '">' + esc(dom.texte) + '</span> <span class="vv-note">(' + C.fr(dom.part * 100, 0) + ' % des échanges agressifs sont des achats' + (serie.dernier && serie.dernier.absorption ? ' · absorption ' + (serie.dernier.absorption > 0 ? 'acheteuse' : 'vendeuse') + ' sur la dernière bougie' : '') + ')</span>';
    }

    /* ── carnet ── */
    function rendreCarnet() {
      const v = S.data && S.data.vue; if (!v) { E.carnet.innerHTML = ''; return; }
      const c = S.carnet; let h = '<div class="vv-titre">Carnet d’ordres <small>' + esc(S.actif) + '</small></div>';
      if (!c) h += '<p class="vv-note">' + (S.origine === 'Worker' ? 'Le carnet enregistré n’est lisible que depuis le PC (il n’est pas publié sur le Worker).' : 'Chargement du carnet…') + '</p>';
      else if (!c.ok) h += '<p class="vv-note">' + esc(c.raison || 'Carnet indisponible.') + '</p>';
      else {
        const maxD = Math.max(1, ...c.echelle.map(l => Math.max(l.bidUsd, l.askUsd)));
        h += '<div class="vv-deseq">' + Object.entries(c.deseq).map(([k, x]) => '<span>' + k.slice(1) + ' % : <b class="' + (x >= 0 ? 'vv-hausse' : 'vv-baisse') + '">' + (x == null ? '—' : C.signe(x * 100, 0) + ' %') + '</b></span>').join('') + '</div><p class="vv-note">Déséquilibre : plus de liquidité posée côté achat (+) ou côté vente (−) à cette distance du prix.</p>';
        h += '<div class="vv-echelle" aria-label="Échelle de profondeur">' + c.echelle.slice(0, 12).reverse().map(l => '<div class="vv-niv"><i class="vv-ask" style="width:' + Math.round(l.askUsd / maxD * 100) + '%"></i><em>+' + l.distancePct + ' %</em></div>').join('') + '<div class="vv-prix">' + C.prixTexte(c.prix) + '</div>' + c.echelle.slice(0, 12).map(l => '<div class="vv-niv"><i class="vv-bid" style="width:' + Math.round(l.bidUsd / maxD * 100) + '%"></i><em>−' + l.distancePct + ' %</em></div>').join('') + '</div>';
        h += c.murs && c.murs.length ? '<ul class="vv-murs">' + c.murs.map(m => '<li>Mur ' + (m.cote === 'bid' ? 'acheteur' : 'vendeur') + ' à ' + C.prixTexte(m.prix) + ' · ' + C.compact(m.usdMax) + ' $ · posé depuis ' + C.il(Date.now() - m.ageS * 1000, Date.now()) + ' · à ' + C.fr(m.distancePct, 2) + ' %' + (m.fiabilite ? ' · ' + esc(m.fiabilite) : '') + '</li>').join('') + '</ul>' : '<p class="vv-note">Aucun gros mur actif près du prix.</p>';
        h += '<p class="vv-note">' + esc(c.note) + '</p>';
      }
      E.carnet.innerHTML = h;
    }
    async function chargerCarnet() {
      if (S.origine === 'Worker') { S.carnet = null; rendreCarnet(); return; }
      const actif = S.actif; try { const c = await lireCarnet(actif); if (c) c.actif = c.actif || actif; S.carnet = c; } catch (e) { S.carnet = { ok: false, raison: 'carnet illisible' }; }
      if (S.actif === actif && !S.detruit) { rendreCarnet(); dessinerGraphique(); }
    }

    /* ── listes ── */
    function rendreListes() {
      const v = S.data && S.data.vue; if (!v) { E.listes.innerHTML = ''; return; }
      const L = C.listes(v, null), bloc = (titre, l, vide) => '<div class="vv-liste"><div class="vv-titre">' + titre + ' <small>' + l.length + '</small></div>' + (l.length ? l.slice(0, 12).map(p => { const t = C.lignePosition(p), ouv = S.ouvertes.has(p.id); return '<button type="button" class="vv-ligne ' + (t.gagnant === true ? 'vv-hausse' : t.gagnant === false ? 'vv-baisse' : '') + '" data-ligne="' + esc(p.id) + '" aria-expanded="' + ouv + '">' + esc(t.texte) + '<small> · ' + esc(p.niveauPreuve.replace('a_lessai', 'À l’essai').replace('candidate', 'Candidate').replace('validee', 'Validée')) + '</small></button>' + (ouv ? '<p class="vv-expl">' + esc(p.raison || '') + ' Niveau : ' + esc(p.niv || '') + '. ' + (p.raisonFin ? esc(p.raisonFin) + '.' : '') + ' Simulation : aucun ordre réel.</p>' : ''); }).join('') : '<p class="vv-note">' + vide + '</p>') + '</div>';
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

    function toutRendre() { rendreEtat(); rendrePortefeuille(); rendreOutils(); rendreCarnet(); rendreListes(); rendreRejoue(); dessiner(); }
    async function rafraichir() {
      if (S.detruit || S.enCours) return; S.enCours = true;
      try {
        const d = await lire(); S.data = d; S.service = d && d.service || null; S.origine = d && d.origine || null;
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
    rafraichir(); minuteur = setInterval(rafraichir, intervalle); rafId = requestAnimationFrame(boucle);
    return { rafraichir, etat: () => S, detruire() { S.detruit = true; clearInterval(minuteur); cancelAnimationFrame(rafId); if (observateur) observateur.disconnect(); racineEl.remove(); } };
  }
  racine.VolumeVivant = { monter, lireVueDefaut };
}(typeof window !== 'undefined' ? window : globalThis));
