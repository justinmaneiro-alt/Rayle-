import { chargerBibliotheque } from './graphique.js';
import '../../../../core/commun/trader-vue.js';
import '../../../../core/commun/agent-lisible-calcul.js';
import '../../../../core/commun/agent-lisible.js';
import { htmlAccueil, htmlIndisponible, esc } from '../agent-v3/vue-accueil.js';
import { courbeSimulee, courbeBacktest, positionsGraphique, COULEURS_POSITION, libellePosition } from '../agent-v3/courbes-v3.js';
import { versionActive, strategiesActives } from '../../../../strategies/agent-etat.js';
import { PAIRES } from '../agent-m6/paires.js';

/* ═════════════ ÉCRAN D'ACCUEIL DE L'AGENT (page ; la partie calcul est dans agent-v3/, testée en Node) ═════════════
   Source de l'état : d'abord le PC (routes locales /__agent/…, instantané, marche même si le Worker n'est pas déployé), sinon le Worker (/agent/etat : PC, tablette et téléphone voient LE MÊME état).
   Aucun bouton « Lancer » : seulement Pause / Reprendre et la charge de calcul. Rayle reste la seule voix : pas de chat direct avec l'agent. */
const PAS = 900e3;
const lireLocal = k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, ecrireLocal = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* interdit */ } };

export async function lireEtatAgent({ fetchImpl = fetch } = {}) {
  try {
    const r = await fetchImpl('/__agent/etat', { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); if (j && j.ok && j.existe) return { origine: 'PC', enMarche: j.enMarche, etat: j.etat, suivi: j.suivi || {}, t: j.maintenant, service: j.service }; }
  } catch (e) { /* pas de serveur local (tablette, GitHub Pages) */ }
  try {
    if (window.wjson && typeof workerReady !== 'undefined' && workerReady()) {
      const j = await window.wjson('/agent/etat', 15000); if (j && j.etat) { const m = j.meta || {}; return { origine: 'Worker', enMarche: !!(m.pcVivantLe && (m.maintenant || Date.now()) - m.pcVivantLe < 4 * 60e3), etat: j.etat, suivi: j.suivi || {}, t: m.maintenant || Date.now(), meta: m }; }
    }
  } catch (e) { return { erreur: messageWorker(e), limite: workerLimite(e) }; }
  return null;
}
/* Worker limité (limite gratuite de la base D1 : erreur 500/503 « daily row read limit ») : un message simple en français, jamais l'erreur brute. */
export const MESSAGE_LIMITE = 'La liaison Worker est limitée aujourd’hui.';
export function workerLimite(e) { const m = String((e && e.message) || e || ''); return /D1_ERROR|row (read|written)|limit|HTTP 5[0-9][0-9]|liaison Worker/i.test(m); }
export function messageWorker(e) {
  if (workerLimite(e)) return MESSAGE_LIMITE + ' Elle revient d’elle-même (remise à zéro à minuit UTC). Pour l’état en direct, lance le service de l’agent sur le PC : la page le lit alors directement.';
  return window.errMsg ? window.errMsg(e) : String((e && e.message) || e);
}
export async function envoyerCommande(cmd) {
  try { const r = await fetch('/__agent/commande', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rayle-Multi': '1' }, body: JSON.stringify(cmd) }); if (r.ok) return { ok: true, via: 'PC', ...(await r.json()) }; } catch (e) { /* pas de serveur local */ }
  try { if (typeof workerReady !== 'undefined' && workerReady()) { const r = await window.wfetch('/agent/commande', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) }); if (r.ok) return { ok: true, via: 'Worker', ...(await r.json()) }; } } catch (e) { /* injoignable */ }
  return { ok: false };
}
/* Mode Trader (V12) : le PC d'abord (/__agent/trader), sinon la copie publiée par le PC sur le Worker (paquet mobile). Rend { vue, service, origine, recuLe } ou null. */
export async function lireTrader({ fetchImpl = fetch } = {}) {
  try { const r = await fetchImpl('/__agent/trader', { cache: 'no-store' }); if (r.ok) { const j = await r.json(); if (j && j.ok) return { vue: j.existe ? j.vue : null, service: j.service, origine: 'PC' }; } } catch (e) { /* pas de serveur local */ }
  try { if (window.wjson && typeof workerReady !== 'undefined' && workerReady()) { const j = await window.wjson('/agent/mobile', 15000); if (j && j.paquet && j.paquet.trader) return { vue: j.paquet.trader, service: null, origine: 'Worker', recuLe: j.recuLe, pcVivantLe: j.pcVivantLe }; } } catch (e) { /* Worker injoignable ou limité */ }
  return null;
}
async function bougies(paire, n = 500) {
  const sym = PAIRES[paire].binance, r = await fetch('https://data-api.binance.vision/api/v3/klines?symbol=' + sym + '&interval=15m&limit=' + n); if (!r.ok) throw new Error('Binance HTTP ' + r.status);
  const j = await r.json(); return j.slice(0, -1).map(k => ({ time: Math.floor(+k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4] }));
}

export function creerAccueilAgent({ conteneur, intervalle = 15000, lire = lireEtatAgent, commande = envoyerCommande, chargerBougies = bougies }) {
  const racine = document.createElement('div'); racine.className = 'av3'; conteneur.appendChild(racine);
  const S = { donnees: null, paire: lireLocal('rayle_agent_paire') || 'BTC', strategie: '', version: '', graphique: null, courbes: [], trader: null, detruit: false, dernierHtml: '', chart: null, serie: null, lignes: [], marqueurs: null, derniereBougies: [] };
  let minuteur = null, enCours = false;

  function message(t) { let m = racine.querySelector('[data-av3-msg]'); if (!m) { m = document.createElement('div'); m.dataset.av3Msg = ''; m.setAttribute('role', 'status'); m.className = 'av3-msg'; racine.prepend(m); } m.textContent = t || ''; m.hidden = !t; if (t) setTimeout(() => { if (m.textContent === t) { m.textContent = ''; m.hidden = true; } }, 5000); }

  async function rafraichir() {
    if (S.detruit || enCours) return; enCours = true;
    try {
      const d = await lire(); S.donnees = d;
      if (!d || d.erreur || !d.etat) { echecs++; racine.innerHTML = htmlIndisponible(d && d.erreur ? d.erreur : 'Ni le service du PC ni le Worker ne m’ont répondu.'); S.dernierHtml = ''; return; }
      echecs = 0;
      try { S.trader = await lireTrader(); } catch (e) { S.trader = null; }
      const e = d.etat, suivi = d.suivi || {}, ctx = { pcVivant: d.enMarche, rechercheEnCours: !!(e.recherche && e.recherche.enCours), enPreparation: Object.values(suivi).some(s => s && s.pendante), positionOuverte: Object.values(suivi).some(s => s && s.position) };
      const html = htmlAccueil(e, { ctx, source: { origine: d.origine, enMarche: d.enMarche, t: d.t }, suivi, maintenant: d.t || Date.now() });
      if (html !== S.dernierHtml) {                                                    // ne redessine que si quelque chose a changé (le graphique n'est pas reconstruit pour rien)
        const ancienScroll = racine.scrollTop; S.dernierHtml = html; racine.innerHTML = html; racine.scrollTop = ancienScroll; S.chart = null; S.serie = null; S.courbes = [];
        brancher(); blocTrader(); await dessiner();
      } else { blocTrader(); await dessiner(true); }
    } catch (err) { echecs++; racine.innerHTML = htmlIndisponible(messageWorker(err)); S.dernierHtml = ''; }
    finally { enCours = false; }
  }
  function brancher() {
    racine.querySelector('[data-av3="pause"],[data-av3="reprendre"]')?.addEventListener('click', async ev => { const t = ev.currentTarget.dataset.av3; const r = await commande({ type: t }); message(r.ok ? (t === 'pause' ? 'Agent mis en pause (appliqué à son prochain cycle, environ 30 s).' : 'Agent repris.') : 'Commande impossible : ni le PC ni le Worker ne répondent.'); setTimeout(rafraichir, 1200); });
    racine.querySelector('[data-av3-charge]')?.addEventListener('change', async ev => { const r = await commande({ type: 'charge', valeur: ev.target.value }); message(r.ok ? 'Charge de calcul : ' + ev.target.value + '.' : 'Commande impossible.'); });
    racine.querySelectorAll('abbr.av3-t').forEach(a => a.addEventListener('click', () => { a.classList.toggle('av3-ouvert'); }));
  }

  /* Bloc « Mode Trader » : état du service en clair, âge des données, positions proposées du moment (niveau visible), lien vers les onglets complets. */
  function blocTrader() {
    const TV = window.TraderVue; if (!TV) return; let b = racine.querySelector('[data-av3-trader]');
    if (!b) { b = document.createElement('section'); b.className = 'av3-trader tv-bloc'; b.dataset.av3Trader = ''; const g = racine.querySelector('[data-av3-graphique]'); if (g) g.before(b); else racine.append(b); }
    const T = S.trader, v = T && T.vue, m = Date.now(); let h = '<h3>Mode Trader · positions proposées</h3>';
    if (!T) h += '<div class="tv-bande tv-alerte"><b>Je ne vois ni le service du PC ni la copie du Worker.</b> Lance le service (une étape) : node agent-pc/service.mjs (ou double-clic sur agent-pc/RayleAgent.vbs).</div>';
    else {
      h += TV.serviceHtml(T.service, v, m);
      if (T.origine === 'Worker') h += '<div class="tv-bande">Ce que le Worker voit : une copie publiée par ton PC ' + TV.esc(T.recuLe ? 'à ' + new Date(T.recuLe).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '(heure inconnue)') + (T.pcVivantLe && m - T.pcVivantLe > 4 * 60e3 ? ' — ton PC ne s’est pas manifesté depuis plus de 4 minutes' : '') + '. Le Worker ne calcule pas de nouvelles positions.</div>';
      if (v) { h += '<div class="tv-garde"><b>' + TV.esc(v.bandeau) + '</b></div>'; const a = v.actives || []; h += a.length ? '<div class="tv-liste">' + a.slice(0, 4).map(p => TV.carte(p, m)).join('') + '</div>' + (a.length > 4 ? '<p class="tv-doux">+ ' + (a.length - 4) + ' autre(s) dans l’onglet « Positions du jour ».</p>' : '') : '<p class="tv-doux">Aucune position à suivre en ce moment. ' + TV.esc(v.bilan.phrase) + '</p>'; }
      else h += '<p class="tv-doux">Le mode Trader n’a pas encore calculé de position (à chaque clôture de bougie M15, service en marche).</p>';
    }
    b.innerHTML = h;
  }
  /* ── graphique avec les positions ── */
  function barreGraphique(boite) {
    const e = S.donnees.etat, actives = strategiesActives(e), versions = e.versions.map(v => v.numero);
    const b = document.createElement('div'); b.className = 'av3-gbarre';
    b.innerHTML = '<span class="av3-paires" role="group" aria-label="Paire du graphique">' + ['BTC', 'SOL', 'DOGE'].map(p => '<button type="button" data-av3-paire="' + p + '" class="' + (p === S.paire ? 'actif' : '') + '">' + p + '</button>').join('') + '</span>'
      + '<label>Stratégie <select data-av3-strat><option value="">toutes</option>' + actives.map(s => '<option value="' + esc(s.id) + '"' + (S.strategie === s.id ? ' selected' : '') + '>' + esc(s.nom + ' · ' + s.paire) + '</option>').join('') + '</select></label>'
      + '<label>Version <select data-av3-version><option value="">toutes</option>' + versions.map(n => '<option value="' + n + '"' + (String(S.version) === String(n) ? ' selected' : '') + '>v' + n + '</option>').join('') + '</select></label>';
    boite.parentNode.insertBefore(b, boite);
    b.querySelectorAll('[data-av3-paire]').forEach(x => x.addEventListener('click', () => { S.paire = x.dataset.av3Paire; ecrireLocal('rayle_agent_paire', S.paire); S.dernierHtml = ''; rafraichir(); }));
    b.querySelector('[data-av3-strat]').addEventListener('change', ev => { S.strategie = ev.target.value; const s = e.strategies[S.strategie]; if (s && s.paire !== S.paire) { S.paire = s.paire; } S.dernierHtml = ''; rafraichir(); });
    b.querySelector('[data-av3-version]').addEventListener('change', ev => { S.version = ev.target.value; S.dernierHtml = ''; rafraichir(); });
  }
  async function dessiner(leger = false) {
    const boite = racine.querySelector('[data-av3-graph]'); if (!boite) return;
    const e = S.donnees.etat, suivi = S.donnees.suivi || {};
    let pos = positionsGraphique(suivi, e, { strategie: S.strategie || null, version: S.version === '' ? null : Number(S.version) }).filter(p => { const s = e.strategies[p.id]; return !s || s.paire === S.paire; });
    try {
      if (!S.chart) {
        racine.querySelector('[data-av3-gtitre]').textContent = '· ' + PAIRES[S.paire].nom + ' · M15';
        barreGraphique(boite);
        const LW = await chargerBibliotheque(); boite.innerHTML = '';
        S.chart = LW.createChart(boite, { autoSize: true, layout: { background: { type: 'solid', color: '#06080c' }, textColor: '#b8c7cf', fontFamily: 'Consolas, "Cascadia Mono", ui-monospace, monospace', fontSize: 12 }, grid: { vertLines: { color: 'rgba(143,208,227,.06)' }, horzLines: { color: 'rgba(143,208,227,.06)' } }, rightPriceScale: { borderColor: 'rgba(143,208,227,.25)' }, timeScale: { borderColor: 'rgba(143,208,227,.25)', timeVisible: true, secondsVisible: false }, handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false }, handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true } });
        S.serie = S.chart.addSeries(LW.CandlestickSeries, { upColor: '#27d98a', downColor: '#ff4d5e', borderUpColor: '#27d98a', borderDownColor: '#ff4d5e', wickUpColor: '#27d98a', wickDownColor: '#ff4d5e' });
        S.marqueurs = LW.createSeriesMarkers(S.serie, []); S.LW = LW;
        S.derniereBougies = await chargerBougies(S.paire); S.serie.setData(S.derniereBougies); S.chart.timeScale().fitContent();
        creerCourbes();
      } else if (!leger) { S.derniereBougies = await chargerBougies(S.paire); S.serie.setData(S.derniereBougies); }
      if (S.trader && S.trader.vue && window.TraderVue) pos = pos.concat(window.TraderVue.positionsGraphique(S.trader.vue, S.paire));
      afficherPositions(pos);
    } catch (err) { boite.innerHTML = '<p class="av3-vide">Graphique indisponible : ' + esc(String(err && err.message || err)) + '. Les chiffres ci-dessus restent valables.</p>'; }
  }
  function afficherPositions(pos) {
    for (const l of S.lignes) { try { S.serie.removePriceLine(l); } catch (e) { /* déjà retirée */ } } S.lignes = [];
    const mk = [], ouvertes = pos.filter(p => p.statut === 'en cours' || p.statut === 'en préparation');
    for (const p of pos) {
      const demo = p.demo ? 'DÉMO · ' : '', t = Math.floor((p.t) / 1000), tr = Math.floor((p.tSortie || 0) / 1000);
      if (p.statut.startsWith('clôturée')) { mk.push({ time: t, position: p.sens > 0 ? 'belowBar' : 'aboveBar', color: p.demo ? COULEURS_POSITION.demo : COULEURS_POSITION.entree, shape: p.sens > 0 ? 'arrowUp' : 'arrowDown', text: demo + (p.sens > 0 ? 'achat' : 'vente') }); if (tr) mk.push({ time: tr, position: p.sens > 0 ? 'aboveBar' : 'belowBar', color: p.R >= 0 ? COULEURS_POSITION.cible : COULEURS_POSITION.stop, shape: 'circle', text: (p.R >= 0 ? '+' : '−') + Math.abs(p.R).toFixed(1).replace('.', ',') + ' R' }); }
    }
    for (const p of ouvertes) {
      const pre = (p.demo ? 'DÉMO · ' : '') + (p.sens > 0 ? 'ACHAT' : 'VENTE');
      if (p.entree != null) S.lignes.push(S.serie.createPriceLine({ price: p.entree, color: COULEURS_POSITION.entree, lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: pre + ' · zone d’entrée' }));
      S.lignes.push(S.serie.createPriceLine({ price: p.stop, color: COULEURS_POSITION.stop, lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'stop' }));
      if (p.entree != null && p.cibles) p.cibles.forEach((c, k) => { if (Number.isFinite(c)) S.lignes.push(S.serie.createPriceLine({ price: c, color: COULEURS_POSITION.cible, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'cible ' + (k + 1) })); });
      else if (p.entree != null && p.R != null) for (const r of [1, 2, p.R].filter((x, i, a) => a.indexOf(x) === i)) S.lignes.push(S.serie.createPriceLine({ price: p.entree + p.sens * r * Math.abs(p.entree - p.stop), color: COULEURS_POSITION.cible, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: r.toFixed(r % 1 ? 1 : 0).replace('.', ',') + ' R' }));
    }
    mk.sort((a, b) => a.time - b.time); S.marqueurs.setMarkers(mk);
    let liste = racine.querySelector('[data-av3-liste]'); if (!liste) { liste = document.createElement('div'); liste.dataset.av3Liste = ''; liste.className = 'av3-liste'; racine.querySelector('[data-av3-graph]').after(liste); }
    const recentes = pos.slice(-8).reverse();
    liste.innerHTML = recentes.length ? '<ul>' + recentes.map(p => '<li class="' + (p.demo ? 'av3-demo' : '') + '"><b>' + esc(libellePosition(p)) + '</b> <span>' + esc(p.nom) + '</span>' + (p.entree != null ? '<small>entrée ' + p.entree.toFixed(p.entree < 10 ? 4 : 1).replace('.', ',') + ' · stop ' + p.stop.toFixed(p.stop < 10 ? 4 : 1).replace('.', ',') + (p.sortie != null ? ' · sortie ' + p.sortie.toFixed(p.sortie < 10 ? 4 : 1).replace('.', ',') + ' (' + (p.R >= 0 ? '+' : '−') + Math.abs(p.R).toFixed(1).replace('.', ',') + ' R)' : '') + '</small>' : '') + (p.tailles ? '<small>taille pour risquer 1 % : ' + p.tailles.quantite.toFixed(p.tailles.quantite < 10 ? 4 : 2).replace('.', ',') + ' unités (' + Math.round(p.tailles.valeur) + ' $)</small>' : '') + (p.raison && p.raison.length ? '<small>' + esc(p.raison.join(' ')) + '</small>' : '') + '</li>').join('') + '</ul>' : '<p class="av3-vide">Aucune position pour l’instant : l’agent attend un setup (une semaine sans setup vaut 0 R).</p>';
  }
  /* ── deux courbes de capital, séparées ── */
  function creerCourbes() {
    const zone = racine.querySelector('[data-av3-courbes]'); if (!zone || !S.LW) return;
    const e = S.donnees.etat, suivi = S.donnees.suivi || {}, rk = e.parametresRisque || {};
    const trades = Object.entries(suivi).filter(([id]) => !S.strategie || id === S.strategie).flatMap(([, s]) => (s && s.trades) || []);
    const sim = courbeSimulee(trades, { capital: rk.capital || 10000, risquePct: rk.risquePct || 1 });
    const bt = (e.backtests || []).filter(b => b.courbeR && b.statut === 'validee_backtest' && (!S.strategie || (S.strategie.startsWith(b.famille + ':' + b.paire)))).slice(-1)[0] || (e.backtests || []).filter(b => b.courbeR).slice(-1)[0];
    const btc = bt ? courbeBacktest(bt.courbeR, { capital: rk.capital || 10000, risquePct: rk.risquePct || 1 }) : [];
    const carte = (titre, sous, vide) => { const d = document.createElement('div'); d.className = 'av3-courbe'; d.innerHTML = '<h4>' + esc(titre) + '</h4><small>' + esc(sous) + '</small><div class="av3-cb"></div>' + (vide ? '<p class="av3-vide">' + esc(vide) + '</p>' : ''); zone.appendChild(d); return d.querySelector('.av3-cb'); };
    const tracer = (boite, pts, cle, couleur) => { const c = S.LW.createChart(boite, { autoSize: true, layout: { background: { type: 'solid', color: '#06080c' }, textColor: '#9fb2bb', fontSize: 11 }, grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(143,208,227,.06)' } }, rightPriceScale: { borderColor: 'rgba(143,208,227,.2)' }, timeScale: { visible: cle === 't', borderColor: 'rgba(143,208,227,.2)' }, handleScroll: false, handleScale: false }); const s = c.addSeries(S.LW.LineSeries, { color: couleur, lineWidth: 2 }); s.setData(pts.map((p, i) => ({ time: cle === 't' ? Math.floor(p.t / 1000) : i + 1, value: p.capital }))); c.timeScale().fitContent(); S.courbes.push(c); };
    const b1 = carte('Compte simulé (en direct, sans argent)', trades.length + ' trade(s) simulé(s) · départ ' + (rk.capital || 10000).toLocaleString('fr-FR') + ' $', sim.length < 2 ? 'Pas encore de trade simulé clos.' : '');
    if (sim.length >= 2) tracer(b1, sim, 't', '#8fd0e3');
    const b2 = carte('Backtest hors échantillon (le passé rejoué)', bt ? bt.nom + ' · ' + bt.paire + ' · ' + bt.trades + ' trades mis bout à bout' + (bt.statut === 'validee_backtest' ? '' : ' · NON validé') : 'aucun backtest', btc.length < 2 ? 'Pas de courbe de backtest disponible.' : '');
    if (btc.length >= 2) tracer(b2, btc, 'i', '#c9b27a');
  }
  /* Rafraîchissement raisonnable : 4× plus lent quand l'état vient du Worker, 5× plus lent quand la fenêtre est masquée, retrait progressif (×2 jusqu'à 10 min) après une erreur. */
  let echecs = 0;
  function prochain() {
    if (S.detruit) return;
    const masque = typeof document !== 'undefined' && document.hidden, base = (S.donnees && S.donnees.origine === 'Worker' ? intervalle * 4 : intervalle) * (masque ? 5 : 1);
    minuteur = setTimeout(async () => { await rafraichir(); prochain(); }, Math.min(base * Math.pow(2, Math.min(echecs, 6)), Math.max(base, 600e3)));
  }
  rafraichir().then(prochain);
  return { rafraichir, detruire() { S.detruit = true; clearTimeout(minuteur); try { if (S.chart) S.chart.remove(); S.courbes.forEach(c => c.remove()); } catch (e) { /* déjà détruit */ } racine.remove(); }, racine, etat: () => S };
}
export { versionActive };

/* ═════════════ V13 : LA VUE « AGENT » LISIBLE (PC) ═════════════
   La vue principale de la fenêtre Agent est maintenant le composant partagé core/commun/agent-lisible.js (barre d'état, quatre chiffres, graphique, courbe, liste). Cette page-ci (creerAccueilAgent) est
   l'ancien écran complet, rangé derrière « Détails › Rapport et stratégies » : rien n'est supprimé. Les données viennent de lireTrader() (PC d'abord, sinon la copie du Worker). */
export function creerAgentLisible({ conteneur, surDetails, surCouche, lire = lireTrader, chargerBougies = bougies, intervalle = 15000 }) {
  return window.AgentLisible.monter(conteneur, { lire: async () => { const t = await lire(); if (!t) return null; const sv = t.service || null; return { vue: t.vue, service: sv ? { enMarche: sv.enMarche, arretDepuis: sv.arretDepuis ? Date.now() - sv.arretDepuis : null } : (t.origine === 'Worker' ? { enMarche: !!(t.pcVivantLe && Date.now() - t.pcVivantLe < 4 * 60e3), arretDepuis: t.pcVivantLe ? Date.now() - t.pcVivantLe : null } : null), origine: t.origine, recuLe: t.recuLe || null }; },
    bibliotheque: chargerBibliotheque, chargerBougies: async actif => chargerBougies(actif, 500), surDetails, surCouche, intervalle });
}
