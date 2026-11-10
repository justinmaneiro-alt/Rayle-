/* ═════════════ COUCHE « TRADES SIMULÉS » de l'écran de l'or ═════════════
   Bouton flottant → panneau plein écran : graphique H1 des bougies EXACTES de la simulation (PAXG, UTC), un sélecteur de variante, une liste filtrable,
   les trades dessinés (flèche d'entrée à la bougie et au prix utilisés, ligne de stop, ligne de cible, marqueur de sortie, couleur selon le R net),
   une fiche au clic, navigation « précédent / suivant » (flèches du clavier). Les calculs lourds sont dans un Worker (trades-simules-worker.js).
   Pourquoi un graphique à part : la simulation tourne sur les bougies PAXG ; le graphique principal affiche Kraken / Binance XAU, dont les prix diffèrent
   de quelques dollars : y dessiner les trades les déplacerait. Simulation seulement, jamais un ordre. */
import { chargerLib } from '../graphique.js';
import { FILTRES, voisin, couleurR, libelleSortie } from './trades-simules-calcul.js';

const URL_DONNEES = new URL('./donnees-trades/trades.json', import.meta.url).href, URL_WORKER = new URL('./trades-simules-worker.js', import.meta.url);
const CSS = `
.ts-bouton{position:fixed;left:14px;bottom:14px;z-index:60;background:#0b1620;color:#8fd0e3;border:1px solid rgba(143,208,227,.45);border-radius:6px;padding:9px 14px;font:600 13px system-ui,sans-serif;cursor:pointer;min-height:40px}
.ts-bouton:hover{background:#12222f}
.ts-voile{position:fixed;inset:0;z-index:200;background:#05080c;color:#d7e3ea;font:13px system-ui,sans-serif;display:none;flex-direction:column}
.ts-voile.ouvert{display:flex}
.ts-haut{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid rgba(143,208,227,.18)}
.ts-haut h2{margin:0 8px 0 0;font-size:14px;font-weight:600;color:#8fd0e3}
.ts-haut select,.ts-haut button{background:#0b1620;color:#d7e3ea;border:1px solid rgba(143,208,227,.3);border-radius:5px;padding:6px 9px;font:13px system-ui,sans-serif;min-height:34px;cursor:pointer}
.ts-haut button.actif{border-color:#8fd0e3;color:#8fd0e3}
.ts-corps{flex:1;display:grid;grid-template-columns:270px 1fr 320px;min-height:0}
.ts-liste{overflow:auto;border-right:1px solid rgba(143,208,227,.15)}
.ts-liste button{display:flex;width:100%;gap:8px;align-items:center;text-align:left;background:none;border:0;border-bottom:1px solid rgba(143,208,227,.07);color:#d7e3ea;padding:7px 10px;font:12px ui-monospace,Consolas,monospace;cursor:pointer;min-height:34px}
.ts-liste button.sel{background:#12222f}
.ts-liste .r{margin-left:auto;font-weight:600}
.ts-centre{position:relative;min-width:0;min-height:0}
.ts-graph{position:absolute;inset:0}
.ts-droite{overflow:auto;border-left:1px solid rgba(143,208,227,.15);padding:10px 12px}
.ts-droite dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:5px 10px}
.ts-droite dt{color:#8a9aa5}.ts-droite dd{margin:0;font-family:ui-monospace,Consolas,monospace;word-break:break-word}
.ts-resume{padding:8px 10px;color:#8a9aa5;border-bottom:1px solid rgba(143,208,227,.15);font-size:12px}
.ts-msg{padding:14px;color:#e0b25f}
.ts-nav{display:flex;gap:6px;margin-bottom:10px}
.ts-nav button{flex:1;background:#0b1620;color:#d7e3ea;border:1px solid rgba(143,208,227,.3);border-radius:5px;min-height:38px;cursor:pointer;font:13px system-ui}
.ts-avert{margin-top:12px;color:#8a9aa5;font-size:11px;line-height:1.4}
@media(max-width:900px){.ts-corps{grid-template-columns:1fr;grid-template-rows:38vh 1fr auto}.ts-liste{border-right:0;border-bottom:1px solid rgba(143,208,227,.15)}.ts-droite{border-left:0;border-top:1px solid rgba(143,208,227,.15);max-height:32vh}}
`;
const el = (tag, attrs = {}, ...enfants) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); } for (const c of enfants) e.append(c); return e; };
const dec = (x, d = 2) => (x == null ? '—' : Number(x).toFixed(d).replace('.', ','));
const jourCourt = t => new Date(t).toISOString().slice(5, 16).replace('T', ' ');

export function monterTradesSimules({ conteneur = document.body } = {}) {
  if (document.querySelector('.ts-voile')) return window.TradesSimules;
  const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
  // ── Worker (repli : traitement dans le fil principal si le Worker est refusé) ──
  let worker = null, nReq = 0; const attente = new Map(), local = { D: null };
  const appel = (msg) => new Promise((ok, ko) => { const id = ++nReq; attente.set(id, { ok, ko }); worker.postMessage({ id, ...msg }); });
  try { worker = new Worker(URL_WORKER, { type: 'module' }); worker.onmessage = e => { const r = e.data, a = attente.get(r.id); if (!a) return; attente.delete(r.id); r.ok ? a.ok(r) : a.ko(new Error(r.erreur)); }; worker.onerror = ev => { ev.preventDefault && ev.preventDefault(); etat.erreurWorker = String(ev.message || 'erreur du Worker'); }; }
  catch (e) { worker = null; }
  if (!worker) { // repli : même logique, sans Worker
    const pseudo = { postMessage(m) { import('./trades-simules-calcul.js').then(async C => { const rep = o => queueMicrotask(() => { const a = attente.get(m.id); if (!a) return; attente.delete(m.id); o.ok ? a.ok(o) : a.ko(new Error(o.erreur)); });
      try { if (m.type === 'charger') { local.D = await (await fetch(m.url, { cache: 'no-store' })).json(); const D = local.D; rep({ ok: true, variantes: D.variantes.map(v => ({ id: v.id, famille: v.famille, n: v.trades.length })), dates: D.dates, genere: D.genere, source: D.source, capital: D.capital, risquePct: D.risquePct }); return; }
        const D = local.D, v = D.variantes.find(x => x.id === m.variante);
        if (m.type === 'liste') { const idx = C.lister(v.trades, m.filtre, { debut: m.debut ?? -Infinity, fin: m.fin ?? Infinity }); rep({ ok: true, indices: idx, resume: C.resume(v.trades, idx), lignes: idx.map(i => ({ i, te: v.trades[i].te, sens: v.trades[i].sens, Rnet: v.trades[i].Rnet, sortie: v.trades[i].sortie })) }); }
        else if (m.type === 'trade') { const t = v.trades[m.index]; rep({ ok: true, trade: t, bars: C.fenetre(D.bars, t), dessin: C.dessin(t), fiche: C.fiche(t, { capital: D.capital, risquePct: D.risquePct }) }); }
        else if (m.type === 'ensemble') { const idx = C.lister(v.trades, m.filtre || 'tous', { debut: m.debut, fin: m.fin }); rep({ ok: true, bars: D.bars.filter(b => b[0] >= m.debut && b[0] <= m.fin).slice(0, 9000), trades: idx.map(i => ({ i, dessin: C.dessin(v.trades[i]), trade: v.trades[i] })), mouvements: [] }); }
      } catch (err) { rep({ ok: false, erreur: String(err.message) }); } }); } };
    worker = pseudo;
  }
  const etat = { variante: null, filtre: 'tous', mode: 'trade', periode: null, indices: [], courant: null, info: null, erreurWorker: null, dessines: 0, charge: false, trade: null };
  // ── interface ──
  const bouton = el('button', { class: 'ts-bouton', type: 'button', 'data-ts': 'bouton', title: 'Trades simulés des études « structure »' }, 'Trades simulés');
  const selVar = el('select', { 'data-ts': 'variante', 'aria-label': 'Variante' }), selFiltre = el('select', { 'data-ts': 'filtre', 'aria-label': 'Filtre' }), selPer = el('select', { 'data-ts': 'periode', 'aria-label': 'Période' });
  for (const [k, nom] of FILTRES) selFiltre.append(el('option', { value: k }, nom));
  const bTrade = el('button', { type: 'button', 'data-ts': 'mode-trade' }, 'Un trade'), bEns = el('button', { type: 'button', 'data-ts': 'mode-periode' }, 'Période');
  const bFerme = el('button', { type: 'button', 'data-ts': 'fermer' }, 'Fermer');
  const haut = el('div', { class: 'ts-haut' }, el('h2', {}, 'Trades simulés'), selVar, selFiltre, bTrade, bEns, selPer, bFerme);
  const liste = el('div', { class: 'ts-liste', 'data-ts': 'liste' }), resume = el('div', { class: 'ts-resume', 'data-ts': 'resume' }), graph = el('div', { class: 'ts-graph', 'data-ts': 'graphique' }), droite = el('div', { class: 'ts-droite', 'data-ts': 'fiche' });
  const gauche = el('div', { style: 'display:flex;flex-direction:column;min-height:0;border-right:1px solid rgba(143,208,227,.15)' }, resume, liste); liste.style.borderRight = '0'; liste.style.flex = '1';
  const voile = el('div', { class: 'ts-voile', 'data-ts': 'voile', role: 'dialog', 'aria-label': 'Trades simulés' }, haut, el('div', { class: 'ts-corps' }, gauche, el('div', { class: 'ts-centre' }, graph), droite));
  conteneur.append(bouton, voile);
  // ── graphique ──
  let LW = null, chart = null, serie = null, marqueurs = null, lignes = [], dernieresBars = [], tradesAffiches = [];
  async function graphique() {
    if (chart) return;
    LW = await chargerLib();
    chart = LW.createChart(graph, { autoSize: true, layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#8a9aa5', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11 }, grid: { vertLines: { color: 'rgba(143,208,227,.05)' }, horzLines: { color: 'rgba(143,208,227,.05)' } },
      rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false }, localization: { locale: 'fr-FR' } });
    serie = chart.addSeries(LW.CandlestickSeries, { upColor: '#4cc38a', downColor: '#e5645f', wickUpColor: '#4cc38a', wickDownColor: '#e5645f', borderVisible: false });
    if (LW.createSeriesMarkers) marqueurs = LW.createSeriesMarkers(serie, []);
    chart.subscribeClick(p => { if (etat.mode !== 'periode' || p.time == null) return; const t = p.time * 1000; let meilleur = null, d0 = Infinity;
      for (const x of tradesAffiches) { const d = t >= x.trade.te - 3600e3 && t <= x.trade.tx + 3600e3 ? 0 : Math.min(Math.abs(t - x.trade.te), Math.abs(t - x.trade.tx)); if (d < d0) { d0 = d; meilleur = x; } }
      if (meilleur && d0 <= 6 * 3600e3) montrerFiche(meilleur.trade, meilleur.i); });
  }
  const nettoyer = () => { for (const l of lignes) { try { chart.removeSeries(l); } catch (e) { /* */ } } lignes = []; };
  function poserBars(bars) { serie.setData(bars.map(b => ({ time: Math.floor(b[0] / 1000), open: b[1], high: b[2], low: b[3], close: b[4] }))); dernieresBars = bars; }
  function dessiner(items, { avecLignes }) {
    nettoyer(); const marques = []; let n = 0;
    for (const { dessin: d } of items) { marques.push(...d.marques); if (avecLignes) for (const s of d.segments) { const l = chart.addSeries(LW.LineSeries, { color: s.id === 'entree' ? d.couleur : s.couleur, lineWidth: s.id === 'entree' ? 1 : 2, lineStyle: s.trait, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }); l.setData([{ time: s.t0, value: s.a }, { time: Math.max(s.t1, s.t0 + 3600), value: s.a }]); lignes.push(l); n++; } }
    marques.sort((a, b) => a.time - b.time); if (marqueurs) marqueurs.setMarkers(marques); etat.dessines = items.length; etat.lignes = n;
  }
  // ── logique ──
  function montrerFiche(t, i) {
    etat.courant = i; etat.trade = t; droite.replaceChildren();
    const nav = el('div', { class: 'ts-nav' }, el('button', { type: 'button', 'data-ts': 'precedent', onclick: () => aller(-1) }, '← Précédent'), el('button', { type: 'button', 'data-ts': 'suivant', onclick: () => aller(1) }, 'Suivant →'));
    const dl = el('dl'); const cap = 10000, risque = cap * 0.5 / 100;
    const lignesF = fichePage(t, risque); for (const [k, v] of lignesF) dl.append(el('dt', {}, k), el('dd', { style: k === 'R net' ? `color:${couleurR(t.Rnet)};font-weight:700` : '' }, v));
    droite.append(el('div', { style: `border-left:4px solid ${couleurR(t.Rnet)};padding-left:8px;margin-bottom:8px;font-weight:600` }, `${t.sens === 'achat' ? 'Achat' : 'Vente'} · ${dec(t.Rnet, 2)} R net`), nav, dl,
      el('div', { class: 'ts-avert' }, 'Simulation sur les bougies PAXG H1 (UTC), frais « futures taker ». Information de lecture, jamais un ordre. Hypothèse : si stop et cible sont touchés dans la même heure, le stop est supposé touché d’abord.'));
    for (const b of liste.querySelectorAll('button')) b.classList.toggle('sel', +b.dataset.i === i);
    const sel = liste.querySelector('button.sel'); if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
  }
  function fichePage(t, risqueUSD) {   // même contenu que trades-simules-calcul.fiche (importé dynamiquement par le Worker) ; recalculé ici pour rester synchrone
    const dh = x => new Date(x).toISOString().replace('T', ' ').slice(0, 16) + ' UTC', fraisUSD = t.fraisR * risqueUSD, unites = risqueUSD / t.risque;
    return [['Date du signal', dh(t.t)], ['Entrée', `${dh(t.te)} · ${dec(t.entree)}`], ['Stop', dec(t.stop)], ['Cible', dec(t.cible)],
      ['Sortie', t.sorties.map(s => `${s.part === 'p1' ? '1re moitié' : s.part === 'p2' ? '2e moitié' : 'tout'} : ${libelleSortie(s.raison)} à ${dec(s.prix)} (${dh(s.t)})`).join(' ; ')],
      ['Distance du stop', `${dec(t.risque)} (${dec(t.distATR)} ATR H1)`], ['Cible visée', `${dec(t.objR, 1)} R`], ['R brut', `${t.R >= 0 ? '+' : ''}${dec(t.R, 3)} R`],
      ['Frais', `${dec(t.fraisR, 3)} R · ${dec(t.fraisPerOnce, 2)} $ par once · ${dec(fraisUSD, 2)} $ pour ${dec(risqueUSD, 0)} $ risqués (${dec(unites, 3)} once)`], ['R net', `${t.Rnet >= 0 ? '+' : ''}${dec(t.Rnet, 3)} R`],
      ['Bougies H1 tenues', String(t.bougies)], ['Niveau', `${t.type || ''} ${dec(t.niveau)}`.trim()], ['Régime SMA200 H1', t.regime]];
  }
  async function afficherTrade(i) {
    const r = await appel({ type: 'trade', variante: etat.variante, index: i }); await graphique();
    poserBars(r.bars); dessiner([{ dessin: r.dessin }], { avecLignes: true }); tradesAffiches = [{ i, trade: r.trade, dessin: r.dessin }];
    const d = r.trade; chart.timeScale().setVisibleRange({ from: Math.floor((d.te - 30 * 3600e3) / 1000), to: Math.floor((d.tx + 30 * 3600e3) / 1000) });
    montrerFiche(r.trade, i);
  }
  function aller(sens) { const i = voisin(etat.indices, etat.courant, sens); if (i == null) return; if (etat.mode === 'trade') afficherTrade(i); else { const x = tradesAffiches.find(q => q.i === i); if (x) { montrerFiche(x.trade, i); const d = x.trade; chart.timeScale().setVisibleRange({ from: Math.floor((d.te - 60 * 3600e3) / 1000), to: Math.floor((d.tx + 60 * 3600e3) / 1000) }); } } }
  async function rafraichirListe() {
    const p = etat.periode, r = await appel({ type: 'liste', variante: etat.variante, filtre: etat.filtre, debut: etat.mode === 'periode' && p ? p.debut : undefined, fin: etat.mode === 'periode' && p ? p.fin : undefined });
    etat.indices = r.indices; const s = r.resume;
    resume.textContent = s.n ? `${s.n} trades · ${s.gagnants} gagnants · R brut moyen ${dec(s.Rbrut, 2)} · frais ${dec(s.fraisR, 2)} R · R net moyen ${dec(s.Rnet, 2)}` : 'Aucun trade pour ce filtre.';
    liste.replaceChildren(...r.lignes.map(l => el('button', { type: 'button', 'data-i': String(l.i), onclick: () => { if (etat.mode === 'trade') afficherTrade(l.i); else { const x = tradesAffiches.find(q => q.i === l.i); if (x) { montrerFiche(x.trade, l.i); aller(0); } } } },
      el('span', {}, jourCourt(l.te)), el('span', {}, l.sens === 'achat' ? '▲' : '▼'), el('span', { class: 'r', style: `color:${couleurR(l.Rnet)}` }, (l.Rnet >= 0 ? '+' : '') + dec(l.Rnet, 2)))));
    if (!r.indices.length) { droite.replaceChildren(el('div', { class: 'ts-msg' }, 'Aucun trade à afficher.')); if (chart) { nettoyer(); if (marqueurs) marqueurs.setMarkers([]); } return; }
    if (etat.mode === 'trade') await afficherTrade(r.indices.includes(etat.courant) ? etat.courant : r.indices[0]); else await afficherPeriode();
  }
  async function afficherPeriode() {
    const p = etat.periode || periodes()[0], r = await appel({ type: 'ensemble', variante: etat.variante, filtre: etat.filtre, debut: p.debut, fin: p.fin }); await graphique();
    poserBars(r.bars); tradesAffiches = r.trades; dessiner(r.trades, { avecLignes: r.trades.length <= 15 });
    chart.timeScale().setVisibleRange({ from: Math.floor(p.debut / 1000), to: Math.floor(p.fin / 1000) });
    if (r.trades.length) montrerFiche(r.trades[0].trade, r.trades[0].i);
  }
  function periodes() { const D = etat.info.dates || [], fin = etat.info.fin; return [{ nom: '30 derniers jours', debut: fin - 30 * 86400e3, fin }, ...D.map(d => ({ nom: d.nom, debut: d.t - 4 * 86400e3, fin: d.t + 5 * 86400e3 })), { nom: '2026 (toute l’année)', debut: Date.UTC(2026, 0, 1), fin }]; }
  async function choisirVariante(id) { etat.variante = id; etat.courant = null; await rafraichirListe(); }
  async function ouvrir(idVariante) {
    voile.classList.add('ouvert'); bouton.style.display = 'none';
    if (!etat.charge) {
      droite.replaceChildren(el('div', { class: 'ts-msg' }, 'Chargement des trades…'));
      try {
        etat.info = await appel({ type: 'charger', url: URL_DONNEES }); etat.charge = true;
        selVar.replaceChildren(...etat.info.variantes.map(v => el('option', { value: v.id }, `${v.id} (${v.n})`)));
        selPer.replaceChildren(...periodes().map((p, k) => el('option', { value: String(k) }, p.nom))); etat.periode = periodes()[0];
        etat.variante = etat.info.variantes[0].id;
      } catch (e) { droite.replaceChildren(el('div', { class: 'ts-msg' }, 'Données absentes. Génère-les avec : node agent-trading/moteur/copilote/structure/audit/analyse-realite.mjs (' + e.message + ')')); return; }
    }
    if (idVariante && etat.info.variantes.some(v => v.id === idVariante)) etat.variante = idVariante;
    selVar.value = etat.variante; selFiltre.value = etat.filtre; await rafraichirListe();
  }
  function fermer() { voile.classList.remove('ouvert'); bouton.style.display = ''; }
  bouton.addEventListener('click', () => ouvrir());
  bFerme.addEventListener('click', fermer);
  selVar.addEventListener('change', () => choisirVariante(selVar.value));
  selFiltre.addEventListener('change', () => { etat.filtre = selFiltre.value; rafraichirListe(); });
  selPer.addEventListener('change', () => { etat.periode = periodes()[+selPer.value]; if (etat.mode === 'periode') rafraichirListe(); });
  const majMode = () => { bTrade.classList.toggle('actif', etat.mode === 'trade'); bEns.classList.toggle('actif', etat.mode === 'periode'); selPer.style.display = etat.mode === 'periode' ? '' : 'none'; };
  bTrade.addEventListener('click', () => { etat.mode = 'trade'; majMode(); rafraichirListe(); }); bEns.addEventListener('click', () => { etat.mode = 'periode'; majMode(); rafraichirListe(); }); majMode();
  document.addEventListener('keydown', e => { if (!voile.classList.contains('ouvert')) return; if (e.key === 'Escape') fermer(); else if (e.key === 'ArrowRight') { aller(1); e.preventDefault(); } else if (e.key === 'ArrowLeft') { aller(-1); e.preventDefault(); } });
  const api = { ouvrir, fermer, aller, etat, choisirVariante, montrerFiche, periodes: () => periodes(), elements: { voile, liste, droite, graph }, ouvert: () => voile.classList.contains('ouvert'), mode: m => { etat.mode = m; majMode(); return rafraichirListe(); }, filtre: f => { etat.filtre = f; selFiltre.value = f; return rafraichirListe(); }, periode: k => { etat.periode = periodes()[k]; selPer.value = String(k); return etat.mode === 'periode' ? rafraichirListe() : null; }, graphiqueEtat: () => ({ bars: dernieresBars.length, marques: etat.dessines, lignes: etat.lignes || 0 }) };
  window.TradesSimules = api; return api;
}
