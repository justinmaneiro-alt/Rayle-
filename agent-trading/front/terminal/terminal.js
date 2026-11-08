/* ═════════════ TERMINAL DE TRADING DE RAYLE (PC d'abord ; simulation et lecture seulement : AUCUN ordre réel) ═════════════
   Disposition type TradingView : barre d'outils à gauche (par catégories), barre du haut (actif, unités, indicateurs, couches, alertes),
   graphique au centre, carnet d'ordres COMPLET à droite (toujours présent), panneau bas repliable (dashboards, journal, alertes, registre).
   Graphique vierge par défaut ; couches et dessins ajoutés par l'utilisateur, mémorisés par actif.
   Modules qui se branchent (chacun indépendant ; un échec n'empêche pas le reste) : dessin et alertes (phase B), positions et journal (phase C),
   Rayle (phase D), carte de chaleur (phase E). Ils reçoivent l'objet T (api ci-dessous). */
import { ACTIFS_TERMINAL, PAR_ID_T, UNITES, ORDRE_UNITES, ID_DEFAUT, fmt } from './actifs-terminal.js';
import { creerSerie, ouvrirCache } from './historique-terminal.js';
import { creerGraphique, COULEURS } from './graphique-terminal.js';
import { sma, smaProjetee, atr, derniere, tendance, sante as calcSante } from './indicateurs.js';
import { COUCHES, lireCouches, ecrireCouches } from './couches-terminal.js';
import { creerDashboards } from './dashboards-terminal.js';
import { creerCarnet } from '../carnet.js';
import { meilleurs, desequilibre } from '../carnet-kraken.js';
import { niveauxPeriode, liquidite as calcLiquidite } from '../or/niveaux-periode.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* refusé */ } };
export const CARNET_ID = Object.freeze({ OR: 'OR', NASDAQ: 'US100', BTC: 'BTC', SOL: 'SOL', DOGE: 'DOGE' });
const pause = () => new Promise(r => setTimeout(r, 0));

/* outils de la barre de gauche, rangés par catégories (les modules de dessin les rendent actifs) */
export const OUTILS = Object.freeze([
  { cat: 'Curseur', liste: [['curseur', '⌖', 'Curseur (sélection)']] },
  { cat: 'Lignes', liste: [['horizontale', '─', 'Ligne horizontale'], ['tendance', '╱', 'Ligne de tendance'], ['rayon', '⟋', 'Rayon'], ['verticale', '│', 'Ligne verticale']] },
  { cat: 'Zones', liste: [['zone', '▭', 'Zone (rectangle fin)']] },
  { cat: 'Mesure', liste: [['mesure', '⇕', 'Mesure']] },
  { cat: 'Position', liste: [['position', '⊿', 'Position (entrée, stop, objectif)']] },
  { cat: 'Texte', liste: [['texte', 'T', 'Texte']] },
  { cat: 'Gomme', liste: [['gomme', '⌫', 'Gomme (supprimer un objet)']] }
]);

let cssCharge = false;
export function chargerCss() {
  if (cssCharge || typeof document === 'undefined' || document.getElementById('tr-css')) return; cssCharge = true;
  for (const [f, id] of [['../jetons.css', 'at-jetons'], ['../agent.css', 'at-css'], ['./terminal.css', 'tr-css']]) { if (document.getElementById(id)) continue; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL(f, import.meta.url).href; l.id = id; document.head.appendChild(l); }
}

export function monterTerminal(el, { contexte = 'vue', fetchFn, WS, modules: mods = ['dessin', 'positions', 'rayle', 'chaleur'] } = {}) {
  chargerCss();
  const S = { actif: lire('rayle_term_actif', ID_DEFAUT), unite: null, couches: null, series: new Map(), serie: null, prix: null, t24: null, outil: 'curseur', bas: lire('rayle_term_bas', { ouvert: true, onglet: 'dash', h: 260 }), cache: null, niveaux: null, liq: null, modules: {}, ecouteurs: {}, gen: 0 };
  if (!PAR_ID_T[S.actif]) S.actif = ID_DEFAUT;
  S.unite = lire('rayle_term_unite_' + S.actif, 'M15'); if (!UNITES[S.unite]) S.unite = 'M15';
  S.couches = lireCouches(S.actif);

  el.innerHTML = `<div class="tr" data-contexte="${esc(contexte)}">
  <header class="tr-haut-barre">
    <div class="tr-marque">RAYLÉ<span>//</span>TERMINAL</div>
    <label class="tr-actif-sel"><span class="sr">Actif</span><select data-actif aria-label="Actif">${ACTIFS_TERMINAL.map(a => `<option value="${a.id}">${esc(a.nom)}</option>`).join('')}</select></label>
    <div class="tr-prix"><b data-prix>—</b><small data-var></small></div>
    <nav class="tr-unites" aria-label="Unité de temps">${ORDRE_UNITES.map(u => `<button type="button" data-unite="${u}">${u === 'J' ? 'Jour' : u}</button>`).join('')}</nav>
    <div class="tr-menus">
      <div class="tr-menu"><button type="button" data-m="indicateurs" aria-haspopup="true">Indicateurs ▾</button><div class="tr-deroule" data-deroule="indicateurs" hidden></div></div>
      <div class="tr-menu"><button type="button" data-m="couches" aria-haspopup="true">Couches ▾</button><div class="tr-deroule" data-deroule="couches" hidden></div></div>
      <button type="button" class="tr-cloche" data-a="alertes" title="Alertes">🔔<i data-alertes-n hidden>0</i></button>
    </div>
    <span class="tr-source" data-source title="Source des bougies"></span>
    <span class="tr-espace"></span>
    <button type="button" class="tr-btn" data-a="rayle" title="Demander à Rayle (voix ou texte)">◉ Rayle</button>
    <button type="button" class="tr-btn" data-a="retour" title="Revenir à l’écran de Rayle">✕</button>
  </header>
  <aside class="tr-outils" aria-label="Outils de dessin">${OUTILS.map(g => `<div class="tr-cat" title="${esc(g.cat)}">${g.liste.map(([id, ic, nom]) => `<button type="button" data-outil="${id}" title="${esc(nom)}" aria-label="${esc(nom)}">${ic}</button>`).join('')}</div>`).join('')}
    <div class="tr-cat tr-cat-bas"><button type="button" data-a="annuler" title="Annuler (Ctrl+Z)" aria-label="Annuler">↶</button><button type="button" data-a="retablir" title="Rétablir (Ctrl+Y)" aria-label="Rétablir">↷</button><button type="button" data-a="aimant" title="Aimantation aux bougies" aria-label="Aimantation">⊕</button><button type="button" data-a="tout-effacer" title="Supprimer tout ce que j’ai dessiné" aria-label="Tout effacer">🗑</button></div>
  </aside>
  <main class="tr-centre">
    <div class="tr-graph" data-graph></div>
    <div class="tr-graph-info" data-hist></div>
    <div class="tr-edition" data-edition hidden></div>
    <div class="tr-bandeau" data-bandeau role="status" hidden></div>
  </main>
  <aside class="tr-carnet at" data-carnet aria-label="Carnet d’ordres"></aside>
  <section class="tr-bas" data-bas>
    <nav class="tr-bas-onglets"><button type="button" data-onglet="dash">Dashboards</button><button type="button" data-onglet="journal">Journal</button><button type="button" data-onglet="alertes">Alertes</button><button type="button" data-onglet="registre">Registre</button><button type="button" data-onglet="rayle">Rayle</button><span class="tr-espace"></span><span class="tr-mention">Information de lecture, pas un signal ni une promesse · aucun ordre réel</span><button type="button" data-a="replier" title="Replier / déplier">▾</button></nav>
    <div class="tr-bas-corps"><div data-panneau="dash"></div><div data-panneau="journal" hidden><p class="tr-doux">Journal : chargement…</p></div><div data-panneau="alertes" hidden><p class="tr-doux">Alertes : chargement…</p></div><div data-panneau="registre" hidden><p class="tr-doux">Registre : chargement…</p></div><div data-panneau="rayle" hidden><p class="tr-doux">Rayle : chargement…</p></div></div>
  </section>
</div>`;
  const R = el.firstElementChild, q = s => R.querySelector(s), qa = s => [...R.querySelectorAll(s)];
  const graph = creerGraphique(q('[data-graph]'));
  const carnet = creerCarnet(q('[data-carnet]'), { racine: q('[data-carnet]'), WS });
  const emettre = (nom, d) => { for (const f of S.ecouteurs[nom] || []) { try { f(d); } catch (e) { console.error('terminal', nom, e); } } };

  /* ── barre du haut ── */
  q('[data-actif]').value = S.actif;
  q('[data-actif]').addEventListener('change', e => api.choisirActif(e.target.value));
  R.addEventListener('click', e => {
    const u = e.target.closest('[data-unite]'); if (u) return api.choisirUnite(u.dataset.unite);
    const m = e.target.closest('[data-m]'); if (m) { const d = q(`[data-deroule="${m.dataset.m}"]`), ouvert = d.hidden; qa('[data-deroule]').forEach(x => { x.hidden = true; }); d.hidden = !ouvert; if (ouvert) rendreDeroule(m.dataset.m); return; }
    if (!e.target.closest('.tr-menu')) qa('[data-deroule]').forEach(x => { x.hidden = true; });
    const o = e.target.closest('[data-outil]'); if (o) return api.choisirOutil(o.dataset.outil);
    const on = e.target.closest('[data-onglet]'); if (on) return api.ongletBas(on.dataset.onglet);
    const a = e.target.closest('[data-a]'); if (!a) return;
    if (a.dataset.a === 'replier') { S.bas.ouvert = !S.bas.ouvert; ecrire('rayle_term_bas', S.bas); majBas(); }
    else if (a.dataset.a === 'retour') { try { if (window.RayleBus) RayleBus.emit('vue:demande', { vue: 'rayle' }); else history.back(); } catch (x) { /* */ } }
    else emettre('action', a.dataset.a);
  });
  R.addEventListener('change', e => {
    const c = e.target.closest('[data-couche]'); if (c) return api.couche(c.dataset.couche, c.checked);
  });
  function rendreDeroule(id) {
    const d = q(`[data-deroule="${id}"]`);
    if (id === 'couches') {
      let g = null; d.innerHTML = COUCHES.map(c => { const t = c.groupe !== g ? `<h4>${esc(c.groupe)}</h4>` : ''; g = c.groupe; return t + `<label><input type="checkbox" data-couche="${c.id}" ${S.couches[c.id] ? 'checked' : ''}> ${esc(c.nom)}</label>`; }).join('') + `<p class="tr-mini">Mémorisé pour ${esc(PAR_ID_T[S.actif].nom)} sur cet appareil.</p>`;
    } else {
      d.innerHTML = `<h4>Moyennes mobiles</h4>${COUCHES.filter(c => c.groupe === 'Moyennes').map(c => `<label><input type="checkbox" data-couche="${c.id}" ${S.couches[c.id] ? 'checked' : ''}> ${esc(c.nom)}</label>`).join('')}<p class="tr-mini">SMA 200 calculée sur TOUT l’historique chargé de l’unité (il se complète vers le passé en arrière-plan).</p>`;
    }
  }

  /* ── panneau bas ── */
  function majBas() {
    q('[data-bas]').classList.toggle('replie', !S.bas.ouvert); q('[data-a="replier"]').textContent = S.bas.ouvert ? '▾' : '▴';
    R.style.setProperty('--tr-bas-h', (S.bas.ouvert ? S.bas.h : 34) + 'px');
    qa('[data-onglet]').forEach(b => b.classList.toggle('actif', b.dataset.onglet === S.bas.onglet));
    qa('[data-panneau]').forEach(p => { p.hidden = p.dataset.panneau !== S.bas.onglet; });
  }
  const dash = creerDashboards(q('[data-panneau="dash"]'), { actif: () => S.actif, unite: () => S.unite, choisirActif: a => api.choisirActif(a), sante: () => api.sante() });

  /* ── données ── */
  async function serieDe(actif, unite) {
    const k = actif + '|' + unite; let s = S.series.get(k);
    if (!s) { if (!S.cache) S.cache = await ouvrirCache(); s = creerSerie({ actif, unite, cache: S.cache, ...(fetchFn ? { fetchFn } : {}) }); s._pret = s.demarrer(); S.series.set(k, s); }
    try { await s._pret; } catch (e) { if (S.series.get(k) === s) S.series.delete(k); throw e; }   // échec : on réessaiera au prochain choix
    return s;
  }
  function cotation() {
    const s = S.serie; if (!s) return; const B = s.bougies(), b = B[B.length - 1];
    S.prix = b ? b.c : null;
    const t24 = B.length ? B[B.length - 1].t - 86400e3 : 0; let o = null; for (let i = B.length - 1; i >= 0 && B[i].t >= t24; i--) o = B[i].o;
    q('[data-prix]').textContent = fmt(S.actif, S.prix);
    q('[data-var]').textContent = S.prix && o ? `${S.prix >= o ? '+' : ''}${(S.prix / o * 100 - 100).toFixed(2).replace('.', ',')} % 24 h` : '';
    q('[data-var]').className = S.prix >= o ? 'tr-up' : 'tr-down';
    carnet.maj(CARNET_ID[S.actif], S.prix ? { prix: S.prix } : null);
  }
  function texteSource(info) {
    const A = PAR_ID_T[S.actif];
    const nom = info.source === 'kraken' ? `Kraken ${A.symbole}` : info.source === 'worker' ? 'SECOURS · ' + (A.secours ? A.secours.nom : 'Worker') : info.source === 'binance' ? `SECOURS · ${A.ref ? A.ref.nom : 'Binance'} (relais à redéployer)` : info.source;
    const s = q('[data-source]'); s.textContent = nom; s.classList.toggle('secours', info.source !== 'kraken');
    const d = info.debut ? new Date(info.debut).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', month: 'short', year: 'numeric' }) : '—';
    const parts = [`${info.n.toLocaleString('fr-FR')} bougies ${S.unite} depuis ${d}`];
    if (info.nRef) parts.push(`${info.nRef.toLocaleString('fr-FR')} de référence ${A.ref ? A.ref.nom : ''}${info.ecart ? ` (écart mesuré ${info.ecart.valeur >= 0 ? '+' : ''}${fmt(S.actif, info.ecart.valeur)})` : ''}`);
    if (info.nBande) parts.push(`${info.nBande.toLocaleString('fr-FR')} en bande ${A.bande ? A.bande.nom : ''}`);
    parts.push(info.toutFini ? 'historique complet' : info.enCours ? 'chargement vers le passé…' : 'défiler à gauche pour en voir plus');
    if (info.erreurs && (info.erreurs.k || info.erreurs.ancien)) parts.push('⚠ ' + (info.erreurs.k || info.erreurs.ancien));
    q('[data-hist]').textContent = parts.join(' · ');
  }

  /* ── couches calculées ── */
  const V = { ma200: null, ma200H1: null, ma200J: null };
  async function calculerCouches() {
    const s = S.serie; if (!s || S.detruit) return; const B = s.bougies(), gen = S.gen;
    graph.ligne('ma200', S.couches.ma200 ? (V.ma200 = sma(B, 200)) : null, { couleur: COULEURS.sable, titre: 'SMA 200' });
    for (const [id, u, coul, t] of [['ma200H1', 'H1', COULEURS.cyan, 'SMA 200 H1'], ['ma200J', 'J', COULEURS.violet, 'SMA 200 J']]) {
      if (!S.couches[id]) { graph.ligne(id, null); V[id] = null; continue; }
      if (S.unite === u) { graph.ligne(id, (V[id] = sma(B, 200)), { couleur: coul, titre: t }); continue; }
      const m = await serieDe(S.actif, u); if (gen !== S.gen) return;
      { const i = m.info(); if (!i.enCours && !i.toutFini) m.remonterTout({ surPage: () => { if (S.serie === s) planifierCouches(); } }); }
      graph.ligne(id, (V[id] = smaProjetee(B, m.bougies(), UNITES[u].ms, 200)), { couleur: coul, titre: t, style: 2 });
    }
    // supports / résistances et liquidités : règles figées niveaux-periode-v1 (inchangées), sur les 1500 dernières bougies closes Kraken
    if (S.couches.sr || S.couches.liquidite) {
      await pause(); if (gen !== S.gen) return;
      const K = B.filter(b => !b.bande).slice(-1500), now = Date.now();
      let np = null; try { np = niveauxPeriode(K, { periode: S.unite, maintenant: now, prix: S.prix }); } catch (e) { np = null; }
      S.niveaux = S.couches.sr ? np : null;
      try { S.liq = S.couches.liquidite && np && np.a ? calcLiquidite(K, { periode: S.unite, maintenant: now, prix: S.prix, a: np.a, pivotsL: np.pivots, i0: np.i0 || 0 }) : null; } catch (e) { S.liq = null; }
    } else { S.niveaux = null; S.liq = null; }
    emettre('couches', S.couches); graph.redessiner();
  }
  let tCouches = null; const planifierCouches = () => { if (tCouches) return; tCouches = setTimeout(() => { tCouches = null; calculerCouches(); }, 1500); };
  /* niveaux automatiques dessinés (couche « sr », « liquidite ») : traits fins + étiquette au bord droit */
  graph.ajouterPrimitive((ctx, T) => {
    const L = [];
    if (S.couches.sr && S.niveaux && S.niveaux.bandes) for (const b of S.niveaux.bandes) { const res = S.prix != null ? b.p >= S.prix : false; L.push({ p: b.p, col: res ? 'rgba(217,96,90,.75)' : 'rgba(79,184,146,.75)', t: `${res ? 'R' : 'S'} ${fmt(S.actif, b.p)} · ${b.touches} touches`, fort: b.touches >= 8 || b.extreme }); }
    if (S.couches.liquidite && S.liq && S.liq.zones) for (const z of S.liq.zones) L.push({ p: z.p, col: 'rgba(183,155,224,.85)', t: `liq. ${fmt(S.actif, z.p)}`, pointille: true });
    if (!L.length) return;
    ctx.font = '11px Segoe UI, system-ui, sans-serif'; const places = [];
    for (const n of L) {
      const y = graph.yDe(n.p); if (y == null || y < 0 || y > T.height) continue;
      ctx.strokeStyle = n.col; ctx.lineWidth = n.fort ? 1.4 : 1; ctx.setLineDash(n.pointille ? [2, 3] : n.fort ? [] : [5, 4]);
      ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(T.width, Math.round(y) + 0.5); ctx.stroke(); ctx.setLineDash([]);
      if (places.some(v => Math.abs(v - y) < 15)) continue; places.push(y);
      const w = ctx.measureText(n.t).width + 8; ctx.fillStyle = 'rgba(5,8,12,.82)'; ctx.fillRect(T.width - w - 4, y - 8, w, 15); ctx.fillStyle = n.col; ctx.fillText(n.t, T.width - w, y + 4);
    }
  }, 'top');
  /* bandes d'historique : référence Binance et bande ancienne, étiquetées */
  graph.ajouterPrimitive((ctx, T) => {
    const B = graph.bougies(); if (!B.length || !(B[0].ref || B[0].bande)) return;
    const A = PAR_ID_T[S.actif]; let iRef = -1, iK = -1;
    for (let i = 0; i < B.length; i++) { if (iRef < 0 && B[i].ref) iRef = i; if (!B[i].ref && !B[i].bande) { iK = i; break; } }
    const xK = iK >= 0 ? graph.xDe(B[iK].t) : null, xR = iRef >= 0 ? graph.xDe(B[iRef].t) : null;
    ctx.font = '600 11px Segoe UI, system-ui, sans-serif';
    const zone = (x0, x1, fond, t1, t2) => { const a = Math.max(0, x0 == null ? 0 : x0), b = Math.min(T.width, x1 == null ? T.width : x1); if (b <= a + 2) return; ctx.fillStyle = fond; ctx.fillRect(a, 0, b - a, T.height); ctx.strokeStyle = 'rgba(201,178,122,.5)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(Math.round(b) + 0.5, 0); ctx.lineTo(Math.round(b) + 0.5, T.height); ctx.stroke(); ctx.setLineDash([]); if (b - a > 150) { ctx.fillStyle = 'rgba(5,8,12,.85)'; ctx.fillRect(a + 6, 6, Math.max(ctx.measureText(t1).width, ctx.measureText(t2).width) + 12, 34); ctx.fillStyle = '#c9b27a'; ctx.fillText(t1, a + 12, 20); ctx.font = '11px Segoe UI, system-ui, sans-serif'; ctx.fillText(t2, a + 12, 34); ctx.font = '600 11px Segoe UI, system-ui, sans-serif'; } };
    const inf = S.serie ? S.serie.info() : {};
    if (B[0].bande) zone(null, xR != null ? xR : xK, 'rgba(201,178,122,.07)', 'Bande ancienne (sans volume ni zones)', A.bande ? A.bande.nom + (inf.rapport ? ` · ${A.bande.mode === 'rapport' ? '×' : '+'} ${fmt(S.actif, inf.rapport.valeur, A.bande.mode === 'rapport' ? 3 : undefined)}` : '') : '');
    if (iRef >= 0) zone(xR, xK, 'rgba(143,208,227,.04)', 'Historique de référence', A.ref ? `${A.ref.nom} décalé de ${inf.ecart ? fmt(S.actif, inf.ecart.valeur) : '—'}` : '');
  }, 'bottom');

  /* ── changement d'actif / d'unité ── */
  async function charger() {
    const gen = ++S.gen, actif = S.actif, unite = S.unite;
    qa('[data-unite]').forEach(b => b.classList.toggle('actif', b.dataset.unite === unite));
    q('[data-actif]').value = actif; q('[data-hist]').textContent = 'Chargement des bougies…';
    for (const [k, s] of S.series) if (!k.startsWith(actif + '|')) s.arreter();
    try { await graph.pret(); } catch (e) { return; }
    S.serie = null; S.prix = null; S.niveaux = S.liq = null; graph.afficher([], { actif, unite, nouvelle: true }); q('[data-source]').textContent = ''; q('[data-prix]').textContent = '—'; q('[data-var]').textContent = ''; carnet.maj(CARNET_ID[actif], null);
    let s;
    try { s = await serieDe(actif, unite); } catch (e) { if (gen === S.gen) { q('[data-hist]').textContent = '⚠ Bougies indisponibles : ' + (e.message || e); bandeau('Bougies indisponibles : ' + (e.message || e)); } return; }
    if (gen !== S.gen) return;
    S.serie = s; graph.afficher(s.bougies(), { actif, unite, info: s.info(), nouvelle: true });
    cotation(); texteSource(s.info()); calculerCouches(); dash.actualiser(); emettre('serie', { actif, unite });
    { const i = s.info(); if (!i.enCours && !i.toutFini) s.remonterTout({ surPage: () => { if (S.serie === s) apresPage(s); } }); }
  }
  /* nouvelle page d'historique : affichage regroupé au plus toutes les 2 s (jamais un réassemblage par page) */
  let tPage = null;
  function apresPage(s) { if (tPage) return; tPage = setTimeout(() => { tPage = null; if (S.serie !== s) return; graph.afficher(s.bougies(), { info: s.info() }); texteSource(s.info()); planifierCouches(); emettre('historique', s.info()); }, 2000); }
  function bandeau(t, ms = 6000) { const b = q('[data-bandeau]'); b.textContent = t; b.hidden = !t; clearTimeout(b._t); if (t) b._t = setTimeout(() => { b.hidden = true; }, ms); }

  /* prix en direct : transactions du WebSocket du carnet (un seul flux), clôtures par sondage toutes les 15 s */
  let derTr = 0;
  const pompe = setInterval(() => {
    const L = carnet._flux.transactions().filter(x => x.t > derTr); if (!L.length || !S.serie) return; derTr = L[L.length - 1].t;
    let ok = false; for (const x of L) ok = S.serie.prix(x.p, x.t) || ok;
    if (ok) { graph.majDerniere(); cotation(); emettre('prix', S.prix); }
  }, 400);
  let dernierT = 0;
  const sondage = setInterval(async () => {
    const s = S.serie; if (!s || document.hidden) return;
    await s.rafraichir(); if (s !== S.serie) return;
    const B = s.bougies(), t = B.length ? B[B.length - 1].t : 0;
    graph.afficher(B, { info: s.info() }); cotation(); texteSource(s.info());
    if (t !== dernierT) { const nouv = dernierT && t > dernierT; dernierT = t; if (nouv) { planifierCouches(); emettre('cloture', { actif: S.actif, unite: S.unite, bougies: B }); } }
  }, 15000);
  const sondageDash = setInterval(() => { if (!document.hidden) { dash.actualiser(); } }, 60000);
  const santeTimer = setInterval(() => dash.rendreSante(), 3000);

  const api = {
    R, graph, carnet, dash, S,
    actif: () => S.actif, unite: () => S.unite, prix: () => S.prix, couches: () => ({ ...S.couches }), serie: () => S.serie, valeursMA: () => V,
    niveauxAuto: () => ({ niveaux: S.niveaux, liquidite: S.liq }),
    choisirActif(a) { if (!PAR_ID_T[a] || a === S.actif) return false; S.actif = a; ecrire('rayle_term_actif', a); S.unite = lire('rayle_term_unite_' + a, S.unite); if (!UNITES[S.unite]) S.unite = 'M15'; S.couches = lireCouches(a); S.niveaux = S.liq = null; dernierT = 0; emettre('actif', a); charger(); return true; },
    choisirUnite(u) { if (!UNITES[u] || u === S.unite) return false; S.unite = u; ecrire('rayle_term_unite_' + S.actif, u); dernierT = 0; charger(); emettre('unite', u); return true; },
    couche(id, on) { if (!(id in S.couches)) return false; S.couches[id] = on == null ? !S.couches[id] : !!on; ecrireCouches(S.actif, S.couches); const d = q('[data-deroule="couches"]'); if (!d.hidden) rendreDeroule('couches'); if (id === 'volume') graph.volumeVisible(S.couches.volume); else calculerCouches(); emettre('couches', S.couches); return true; },
    choisirOutil(o) { S.outil = o; qa('[data-outil]').forEach(b => b.classList.toggle('actif', b.dataset.outil === o)); emettre('outil', o); return true; },
    outil: () => S.outil,
    ongletBas(o) { S.bas.onglet = o; S.bas.ouvert = true; ecrire('rayle_term_bas', S.bas); majBas(); emettre('onglet', o); return true; },
    panneau: id => q(`[data-panneau="${id}"]`),
    bandeau, esc, q, qa,
    on(nom, f) { (S.ecouteurs[nom] = S.ecouteurs[nom] || []).push(f); return () => { S.ecouteurs[nom] = S.ecouteurs[nom].filter(x => x !== f); }; },
    emettre,
    module: n => S.modules[n],
    /* état du carnet (résumé) : meilleurs prix, spread, déséquilibre */
    etatCarnet() { const c = carnet._flux.carnet(); if (!c || !c.pret) return null; const m = meilleurs(c); if (!m) return null; return { ...m, desequilibre: desequilibre(c, m.milieu), carnet: c, transactions: carnet._flux.transactions() }; },
    sante() { const s = S.serie; if (!s) return null; const c = api.etatCarnet(); return calcSante(s.bougies(), { spread: c ? c.spread : null, desequilibre: c && c.desequilibre != null ? { achat: c.desequilibre } : null, prix: S.prix }); },
    atr() { const s = S.serie; if (!s) return null; return derniere(atr(s.bougies().filter(b => !b.bande), 14)); },
    tendance() { const s = S.serie; if (!s) return null; const B = s.bougies(); return tendance(B, V.ma200 || sma(B, 200)); },
    recharger: () => charger(),
    detruire() { S.detruit = true; S.gen++; clearTimeout(tPage); clearTimeout(tCouches); clearInterval(pompe); clearInterval(sondage); clearInterval(sondageDash); clearInterval(santeTimer); for (const s of S.series.values()) s.arreter(); for (const m of Object.values(S.modules)) { try { m && m.detruire && m.detruire(); } catch (e) { /* */ } } carnet.detruire(); graph.detruire(); el.innerHTML = ''; }
  };
  graph.volumeVisible(S.couches.volume);

  // raccourcis clavier
  const clavier = e => {
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (!R.isConnected || R.offsetParent === null) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); emettre('action', e.shiftKey ? 'retablir' : 'annuler'); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); emettre('action', 'retablir'); }
    else if (e.key === 'Escape') { api.choisirOutil('curseur'); emettre('action', 'echap'); }
    else if (e.key === 'Delete' || e.key === 'Backspace') emettre('action', 'supprimer-selection');
  };
  document.addEventListener('keydown', clavier);
  const detruire0 = api.detruire; api.detruire = () => { document.removeEventListener('keydown', clavier); detruire0(); };

  majBas(); api.choisirOutil('curseur'); charger();
  // modules (chacun indépendant)
  (async () => {
    const LISTE = { dessin: ['./dessin-terminal.js', 'monterDessin'], positions: ['./positions-terminal.js', 'monterPositions'], rayle: ['./rayle-terminal.js', 'monterRayle'], chaleur: ['./chaleur-terminal.js', 'monterChaleur'] };
    for (const n of mods) {
      const d = LISTE[n]; if (!d) continue;
      try { const m = await import(d[0]); S.modules[n] = await m[d[1]](api); emettre('module', n); }
      catch (e) { if (!/Failed to fetch|Cannot find module|Importing a module script failed|error loading dynamically/i.test(String(e && e.message))) console.error('terminal : module', n, e); }
    }
  })();
  window.TerminalRayle = api;
  return api;
}
