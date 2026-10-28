import { CORRELES, INSTRUMENTS, ORDRE_UNITES, PRINCIPAUX, UNITES, WATCHLIST } from './instruments.js';
import { REGLAGES_DEFAUT, REGLAGES_LEGERS, LIBELLES, creerGraphique } from './graphique.js';
import { correlations, lectureCorrelation, resume } from './analyse.js';
import { age, heureParis } from './serie.js';
import { UNITES_DASHBOARD, colonne, constatsContexte, formaterUsd, global as globalDash, lignesContexte } from './dashboard.js';
import { creerTradingView } from './tradingview.js';
import { creerPanneauAgentV3 } from './panneau-agent-v3.js';
import { creerPanneauAlertes } from './panneau-alertes.js';
import { creerPanneauActus, creerPanneauBanques, creerPanneauCalendrier, creerPanneauCot, creerPanneauNasdaq, creerPanneauPublications, creerPanneauTaux } from './panneaux-finance.js';
import { lireCotations } from './cotations.js';

/* ═════════════ ESPACE DE TRAVAIL « BLOOMBERG » : le terminal de la base Mars ═════════════
   Une grande fenêtre multi-panneaux : graphique principal (chandeliers, indicateurs, profil de volume, supports / résistances), watchlist avec variation en direct,
   résumé de marché, et un dock à onglets (positions, corrélations, performance, signaux, puis les panneaux des étapes suivantes). Tout ce qui est réel affiche sa source et
   son heure ; ce qui ne l'est pas (positions, performance, signaux de l'agent) reste marqué EXEMPLE. Aucun appel à l'IA : zéro jeton.
   STRUCTURE POUR LA SUITE : PANNEAUX ci-dessous est le registre. M2b ajoutera cot, calendrier, actus, heatmap, dashboards (état 'bientot' → 'reel') ; M3 le backtest et la
   vraie performance ; M4 l'agent stratège. Ajouter un panneau = une entrée dans PANNEAUX (+ une fonction `creer`), rien d'autre à toucher. */
const CLE_PREFS = 'rayle_mars_trading';
const lirePrefs = () => { try { return JSON.parse(localStorage.getItem(CLE_PREFS) || '{}') || {}; } catch (e) { return {}; } };
const ecrirePrefs = p => { try { localStorage.setItem(CLE_PREFS, JSON.stringify(p)); } catch (e) { /* stockage interdit : tant pis */ } };
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nombre = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const signe = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + nombre(v, d));

/* Ligne « source · heure » d'une série : ce que l'interface doit toujours dire de ses données. */
export function descriptionSource(r, maintenant = Date.now()) {
  if (!r || (r.vide && !r.meta)) return { texte: r && r.erreur ? 'INDISPONIBLE : ' + r.erreur : 'chargement…', etiquettes: [r && r.erreur ? 'indisponible' : 'chargement'], ok: false };
  const m = r.meta, der = r.bougies[r.bougies.length - 1], et = [];
  if (m.secours) et.push('secours'); if (m.differe) et.push('différé ~15 min'); if (m.perime) et.push('périmé');
  const vol = r.volume ? (r.volume.type === 'reel' ? 'volume : réel' : r.volume.type === 'indice' ? 'volume : indice (≠ CFD)' : r.volume.type === 'proxy' ? 'volume : PROXY ' + Math.round((r.volume.couverture || 0) * 100) + ' %' : 'pas de volume gratuit') : '';
  return { texte: m.source + (m.symbole ? ' (' + m.symbole + ')' : '') + ' · dernière bougie ' + (der ? heureParis(der.t) : '—') + ' · reçu ' + age(maintenant - m.recuLe) + (vol ? ' · ' + vol : ''), etiquettes: et, ok: !m.perime, note: m.note, volume: r.volume };
}

/* ── Registre des panneaux ── */
const MSG_STRATEGE = 'Il n’y a pas d’agent stratège séparé : la recherche de stratégies et les alertes sont faites par l’agent Kepler (onglet « Agent BTC »), et Raylé t’explique à la voix. Les scénarios commentés avant les séances ne sont pas construits : rien n’est inventé à leur place.';
export const PANNEAUX = {
  watchlist: { titre: 'Watchlist', zone: 'droite', etat: 'reel', creer: creerWatchlist },
  resume: { titre: 'Résumé de marché', zone: 'droite', etat: 'reel', creer: creerResume },
  dashboard: { titre: 'Dashboard analytique', zone: 'dock', etat: 'reel', creer: creerDashboard },
  contexte: { titre: 'Contexte de marché', zone: 'dock', etat: 'reel', creer: creerContexte },
  agent: { titre: 'Agent BTC', zone: 'dock', etat: 'reel', grand: true, creer: c => creerPanneauAgentV3(c) },   // V3b : page simple de l'agent Kepler (service PC / Worker) + onglet « Détails » (l'ancienne page, intacte)
  alertes: { titre: 'Alertes', zone: 'dock', etat: 'reel', grand: true, creer: () => creerPanneauAlertes() },
  correlations: { titre: 'Corrélations', zone: 'dock', etat: 'reel', creer: creerCorrelations },
  cot: { titre: 'COT (CFTC)', zone: 'dock', etat: 'reel', grand: true, creer: () => creerPanneauCot() },
  calendrier: { titre: 'Calendrier', zone: 'dock', etat: 'reel', grand: true, creer: () => creerPanneauCalendrier() },
  actus: { titre: 'Actus finance', zone: 'dock', etat: 'reel', grand: true, creer: () => creerPanneauActus() },
  banques: { titre: 'Banques centrales', zone: 'dock', etat: 'reel', grand: true, creer: () => creerPanneauBanques() },
  taux: { titre: 'Taux', zone: 'dock', etat: 'reel', grand: true, creer: () => creerPanneauTaux() },
  heatmap: { titre: 'Nasdaq 100', zone: 'dock', etat: 'reel', grand: true, creer: () => creerPanneauNasdaq() },
  publications: { titre: 'Banques et analyses', zone: 'dock', etat: 'reel', grand: true, creer: () => creerPanneauPublications() },
  strategie: { titre: 'Agent stratège', zone: 'dock', etat: 'info', creer: () => explication(MSG_STRATEGE) }
};
function explication(texte) { const e = h('div', 'tg-bientot'); e.innerHTML = '<b>PAS D’AGENT STRATÈGE SÉPARÉ</b><p>' + esc(texte) + '</p><i>Rien n’est affiché ici tant qu’aucune donnée réelle n’existe.</i>'; return { racine: e, maj() {}, detruire() {} }; }

function creerWatchlist(c) {
  const racine = h('div', 'tg-watch'), pied = h('div', 'tg-pied'); const lignes = {};
  racine.innerHTML = '<div class="tg-wl-tete"><span>Instrument</span><span>Dernier</span><span>Var. jour</span><span></span></div>';
  for (const id of WATCHLIST) {
    const l = h('button', 'tg-wl-ligne'); l.type = 'button'; l.dataset.id = id; l.innerHTML = '<span class="n">' + esc(INSTRUMENTS[id].court) + '<small>' + esc(INSTRUMENTS[id].nom) + '</small></span><span class="p">…</span><span class="v">…</span><svg class="s" viewBox="0 0 60 20" preserveAspectRatio="none"></svg>';
    l.addEventListener('click', () => c.choisirInstrument(id)); racine.appendChild(l); lignes[id] = l;
  }
  racine.appendChild(pied);
  async function maj() {
    const cot = await lireCotations(c.client, WATCHLIST), sources = new Set(); let plusVieux = null;
    for (const q of cot) {
      const l = lignes[q.id]; l.classList.toggle('indispo', !!q.vide);
      if (q.vide) { l.querySelector('.p').textContent = 'indispo.'; l.querySelector('.v').textContent = ''; l.title = 'INDISPONIBLE : ' + q.erreur; continue; }
      l.querySelector('.p').textContent = nombre(q.prix, q.decimales) + q.unite;
      const ve = l.querySelector('.v'); ve.textContent = q.pct != null ? signe(q.pct) + ' %' : '—'; ve.className = 'v ' + (q.pct > 0 ? 'hausse' : q.pct < 0 ? 'baisse' : '');
      if (q.courbe.length > 3) { const min = Math.min(...q.courbe), max = Math.max(...q.courbe), pts = q.courbe.map((x, i) => (i / (q.courbe.length - 1) * 60).toFixed(1) + ',' + (19 - (x - min) / ((max - min) || 1) * 18).toFixed(1)).join(' '); l.querySelector('.s').innerHTML = '<polyline fill="none" stroke="' + (q.pct < 0 ? '#ff4d5e' : '#27d98a') + '" stroke-width="1.5" points="' + pts + '"/>'; }
      l.title = q.longNom + ' · ' + (q.source || '') + (q.differe ? ' (différé ~15 min)' : '') + (q.secours ? ' · SECOURS' : '') + (q.perime ? ' · PÉRIMÉ' : '') + ' · dernière bougie ' + heureParis(q.t) + ' · reçu ' + age(Date.now() - q.recuLe);
      if (q.source) sources.add(q.source); if (q.t != null && (plusVieux == null || q.t < plusVieux)) plusVieux = q.t;
    }
    pied.textContent = 'Source : ' + ([...sources].join(' · ') || '—') + ' · dernier prix M15 contre clôture de la veille · mis à jour ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const sj = c.etat().instrument; for (const id of WATCHLIST) lignes[id].classList.toggle('actif', id === sj);
  }
  return { racine, maj, selection: id => { for (const k of WATCHLIST) lignes[k].classList.toggle('actif', k === id); }, detruire() {} };
}

function creerResume(c) {
  const racine = h('div', 'tg-resume');
  function maj() {
    const r = c.serieCourante(), ins = INSTRUMENTS[c.etat().instrument];
    if (!r || r.vide) { racine.innerHTML = '<p class="tg-vide">En attente des bougies…</p>'; return; }
    const s = resume(r.bougies); if (!s) { racine.innerHTML = '<p class="tg-vide">Historique trop court pour une lecture (30 bougies minimum).</p>'; return; }
    const d = ins.decimales, ligne = (k, v, cls) => '<div class="tg-l"><span>' + k + '</span><b class="' + (cls || '') + '">' + v + '</b></div>';
    const sr = (n, sup) => n.map((x, i) => ligne((sup ? 'S' : 'R') + (i + 1) + ' · ' + x.force, nombre(x.prix, d) + ' <small>(' + nombre(x.distance_atr, 1) + ' ATR · ' + x.touches + ' touches)</small>', sup ? 'hausse' : 'baisse')).join('');
    racine.innerHTML = '<div class="tg-titre-r">' + esc(ins.court) + ' · ' + UNITES[c.etat().unite].nom + '</div>'
      + ligne('Prix', nombre(s.prix, d))
      + ligne('Tendance', esc(s.tendanceMa200) + (s.distanceMa200Pct != null ? ' <small>(' + signe(s.distanceMa200Pct) + ' %)</small>' : ''), s.distanceMa200Pct == null ? '' : s.distanceMa200Pct >= 0 ? 'hausse' : 'baisse')
      + ligne('RSI 14', nombre(s.rsi, 1) + ' <small>' + (s.rsiEtat || '') + '</small>', s.rsiEtat === 'surachat' ? 'baisse' : s.rsiEtat === 'survente' ? 'hausse' : '')
      + ligne('MACD', s.macdEtat ? esc(s.macdEtat) : '—', s.macdHisto > 0 ? 'hausse' : s.macdHisto < 0 ? 'baisse' : '')
      + ligne('ATR 14', nombre(s.atr, d) + ' <small>(' + nombre(s.atrPct, 2) + ' % du prix)</small>')
      + ligne('Bollinger', s.bollingerPct == null ? '—' : nombre(s.bollingerPct, 0) + ' % <small>(0 = bande basse)</small>')
      + ligne('Structure', esc(s.structure))
      + ligne('Plus haut / bas 50', nombre(s.plusHaut50, d) + ' / ' + nombre(s.plusBas50, d))
      + (s.vwap != null && r.volume && r.volume.type !== 'aucun' ? ligne('VWAP', nombre(s.vwap, d) + (r.volume.type === 'proxy' ? ' <small>(volume proxy)</small>' : '')) : '')
      + (s.resistances.length || s.supports.length ? '<div class="tg-sep">Niveaux automatiques</div>' + sr(s.resistances.slice().reverse(), false) + sr(s.supports, true) : '')
      + '<p class="tg-note">Constats chiffrés calculés dans le navigateur à partir des bougies affichées. Ce ne sont ni des prévisions ni des conseils.</p>';
  }
  return { racine, maj, detruire() {} };
}

function creerCorrelations(c) {
  const racine = h('div', 'tg-corr'); let enCours = false;
  async function maj() {
    if (enCours) return; enCours = true;
    try {
      const series = {}; for (const id of CORRELES) { try { const r = await c.client.serie(id, 'D1', { rafraichirMs: 600e3 }); if (r.bougies.length) series[id] = r.bougies; } catch (e) { /* instrument absent */ } }
      const co = correlations(series, 60);
      if (co.ids.length < 2) { racine.innerHTML = '<p class="tg-vide">Pas assez de séries journalières pour les corrélations.</p>'; return; }
      let t = '<table class="tg-matrice"><tr><th></th>' + co.ids.map(i => '<th>' + esc(INSTRUMENTS[i].court) + '</th>').join('') + '</tr>';
      for (const a of co.ids) { t += '<tr><th>' + esc(INSTRUMENTS[a].court) + '</th>'; for (const b of co.ids) { const v = co.matrice[a][b], col = v == null ? 'rgba(120,120,120,.15)' : v >= 0 ? 'rgba(39,217,138,' + (0.12 + Math.abs(v) * 0.6).toFixed(2) + ')' : 'rgba(255,77,94,' + (0.12 + Math.abs(v) * 0.6).toFixed(2) + ')'; t += '<td style="background:' + col + '" title="' + esc(INSTRUMENTS[a].court + ' / ' + INSTRUMENTS[b].court + ' : ' + lectureCorrelation(v) + ' (' + co.observations[a][b] + ' jours)') + '">' + (v == null ? '—' : v.toFixed(2)) + '</td>'; } t += '</tr>'; }
      racine.innerHTML = t + '</table><p class="tg-note">Corrélation des variations quotidiennes sur les 60 derniers jours communs (Yahoo Finance / Twelve Data via le Worker). ' + esc(lectureCorrelation(co.matrice.US100 && co.matrice.US100.XAU).replace(/^/, 'US100 / or : ')) + '. Une corrélation passée ne prédit rien.</p>';
    } finally { enCours = false; }
  }
  return { racine, maj, detruire() {} };
}

/* Dashboard analytique : tendance, RSI 14, volume net, support, résistance et score par unité (M15 / H1 / H4 / D1) et global, pour l'instrument choisi. */
function creerDashboard(c) {
  const racine = h('div', 'tg-dash'); let jeton = 0, dernierId = null;
  racine.innerHTML = '<p class="tg-vide">Calcul en cours…</p>';
  async function maj() {
    const mon = ++jeton, id = c.etat().instrument, ins = INSTRUMENTS[id], d = ins.decimales;
    const series = [];
    for (const u of UNITES_DASHBOARD) { try { series.push(await c.client.serie(id, u)); } catch (e) { series.push({ vide: true, bougies: [], erreur: String(e && e.message || e) }); } if (mon !== jeton) return; }
    const reel = ins.volume.type === 'reel', cols = series.map(r => colonne(r.bougies, { volumeReel: reel && r.volume && r.volume.type === 'reel' })), g = globalDash(cols);
    if (!cols.some(x => x.dispo)) { const er = series.find(r => r.erreur); racine.innerHTML = '<p class="tg-vide">' + (er ? 'INDISPONIBLE : ' + esc(er.erreur) : 'En attente des bougies…') + '</p>'; return; }
    const cel = (f, cls) => '<td class="' + (cls || '') + '">' + f + '</td>', nd = '<td class="nd">—</td>';
    let t = '<table class="tg-grille"><thead><tr><th>' + esc(ins.court) + '</th>' + UNITES_DASHBOARD.map(u => '<th>' + UNITES[u].nom + '</th>').join('') + '<th>GLOBAL</th></tr></thead><tbody>';
    t += '<tr><td>Tendance</td>' + cols.map(x => (!x.dispo || x.bull == null) ? nd : cel(x.bull ? '▲ Haus.' : '▼ Bais.', x.bull ? 'hausse' : 'baisse')).join('') + (g.tendance ? cel(g.tendance === 'Haussier' ? '▲' : '▼', g.tendance === 'Haussier' ? 'hausse' : 'baisse') : nd) + '</tr>';
    t += '<tr><td>RSI 14</td>' + cols.map(x => (!x.dispo || x.rsi == null) ? nd : cel(nombre(x.rsi, 1), x.rsi > 70 ? 'baisse' : x.rsi < 30 ? 'hausse' : '')).join('') + nd + '</tr>';
    t += '<tr><td title="somme de ±volume × clôture sur les 20 dernières bougies ; seulement quand le volume est réel">Vol. net $</td>' + cols.map(x => (!x.dispo || x.net == null) ? '<td class="nd" title="pas de volume réel pour cet instrument">n/d</td>' : cel(formaterUsd(x.net), x.net >= 0 ? 'hausse' : 'baisse')).join('') + (cols[1] && cols[1].net != null ? cel(cols[1].net >= 0 ? 'ACHAT' : 'VENTE', cols[1].net >= 0 ? 'hausse' : 'baisse') : '<td class="nd">n/d</td>') + '</tr>';
    t += '<tr><td>Support</td>' + cols.map(x => (!x.dispo || x.support == null) ? nd : cel(nombre(x.support, d), 'hausse')).join('') + nd + '</tr>';
    t += '<tr><td>Résist.</td>' + cols.map(x => (!x.dispo || x.resistance == null) ? nd : cel(nombre(x.resistance, d), 'baisse')).join('') + nd + '</tr>';
    t += '<tr><td>Score</td>' + cols.map(x => (!x.dispo || x.score == null) ? nd : cel(String(x.score), x.score >= 50 ? 'hausse' : 'baisse')).join('') + (g.score != null ? cel(g.score + '/100', g.score >= 50 ? 'hausse' : 'baisse') : nd) + '</tr></tbody></table>';
    const meta = series.map(r => r.meta).filter(Boolean), src = meta[0], et = [];
    if (meta.some(m => m.secours)) et.push('SECOURS'); if (meta.some(m => m.differe)) et.push('DIFFÉRÉ'); if (meta.some(m => m.perime)) et.push('PÉRIMÉ'); else et.push('RÉEL');
    racine.innerHTML = t + '<div class="tg-pied">Source : ' + esc(src ? src.source + (src.symbole ? ' (' + src.symbole + ')' : '') : '—') + ' · ' + et.map(x => '<span class="tg-tag ' + (x === 'RÉEL' ? 'ok' : 'alerte') + '">' + x + '</span>').join(' ') + ' · calculé dans le navigateur à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + ' · ni prévision ni conseil · score : 60 ou 40 selon l’EMA 200, ± RSI, ± volume net</div>';
    dernierId = id;
  }
  return { racine, maj, dernier: () => dernierId, detruire() { jeton++; } };
}

/* Contexte de marché : VIX, dollar, taux US 10 ans et grandes valeurs du Nasdaq 100 (route /contexte du Worker, déjà déployée). */
function creerContexte(c) {
  const racine = h('div', 'tg-contexte'); let enCours = false, dernier = null;
  racine.innerHTML = '<p class="tg-vide">Chargement du contexte…</p>';
  async function maj() {
    if (enCours) return; enCours = true;
    try {
      const d = await c.client.appeler('/contexte'), ctx = lignesContexte(d);
      if (!ctx.lignes.length) throw new Error((d && d.error) || 'réponse inattendue');
      dernier = ctx;
      const cst = constatsContexte(ctx);
      racine.innerHTML = '<table class="tg-grille"><tbody>' + ctx.lignes.map(l => {
        const v = l.variation, cls = v == null ? '' : v >= 0 ? 'hausse' : 'baisse', px = l.prix == null ? '—' : nombre(l.prix, 2) + (l.unite ? ' ' + l.unite : '');
        return '<tr><td>' + esc(l.label) + (l.secours ? ' <span class="tg-tag alerte">SECOURS</span>' : '') + '</td><td>' + px + '</td><td class="' + cls + '">' + (v == null ? '—' : signe(v) + ' %') + '</td></tr>';
      }).join('') + '</tbody></table>'
        + (cst.length ? '<ul class="tg-constats">' + cst.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '')
        + '<div class="tg-pied">Source : ' + esc(ctx.sources.join(', ') || '—') + ' · ' + ctx.etiquettes.map(x => '<span class="tg-tag ' + (/ancienne|secours|indispo/.test(x) ? 'alerte' : '') + '">' + esc(x.toUpperCase()) + '</span>').join(' ') + ' · Worker à ' + (ctx.maj ? heureParis(ctx.maj, false) : '—') + ' · constats chiffrés, ni prévision ni conseil</div>';
    } catch (e) {
      if (!dernier) racine.innerHTML = '<p class="tg-vide">INDISPONIBLE : ' + esc(String(e && e.message || e)) + '</p>';
      else racine.insertAdjacentHTML('beforeend', '<div class="tg-erreur">Mise à jour impossible : ' + esc(String(e && e.message || e)) + ' (dernières valeurs affichées)</div>');
    } finally { enCours = false; }
  }
  return { racine, maj, detruire() {} };
}

/* ── L'espace de travail ── */
export function creerEspace({ conteneur, client, tactile = false, depart = {}, surChangement = () => {}, fermer = () => {} }) {
  const prefs = lirePrefs();
  const etat = { instrument: depart.instrument || prefs.instrument || 'US100', unite: depart.unite || prefs.unite || 'H1', reglages: { ...(tactile ? REGLAGES_LEGERS : REGLAGES_DEFAUT), ...(prefs.reglages || {}) }, dock: depart.dock || prefs.dock || 'dashboard', source: depart.source || prefs.source || 'tv', plein: false, focus: null };
  if (etat.source !== 'tv' && etat.source !== 'rayle') etat.source = 'tv';
  if (!INSTRUMENTS[etat.instrument]) etat.instrument = 'US100'; if (!UNITES[etat.unite]) etat.unite = 'H1';
  conteneur.classList.add('tg-espace'); conteneur.innerHTML = '';
  const barre = h('div', 'tg-barre'), principal = h('div', 'tg-principal'), colonne = h('div', 'tg-colonne'), dock = h('div', 'tg-dock'), pied = h('div', 'tg-credit');
  const zoneGraph = h('div', 'tg-graphique'), infos = h('div', 'tg-infos');
  const zoneTV = h('div', 'tg-zone tg-zone-tv'), zoneRayle = h('div', 'tg-zone tg-zone-rayle'); zoneGraph.append(zoneTV, zoneRayle);
  principal.append(infos, zoneGraph);
  const corps = h('div', 'tg-corps'); corps.append(principal, colonne, dock);
  conteneur.append(barre, corps, pied);
  pied.innerHTML = 'Graphique : <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView Lightweight Charts™</a> · données : Yahoo Finance et Twelve Data via le Worker de Raylé · indicateurs calculés dans le navigateur · aucune IA, aucun jeton';

  // barre : instruments, unités, indicateurs, actions
  const chips = h('div', 'tg-chips'), unites = h('div', 'tg-unites'), actions = h('div', 'tg-actions');
  for (const id of WATCHLIST) { const b = h('button', 'tg-chip', esc(INSTRUMENTS[id].court)); b.type = 'button'; b.dataset.id = id; b.title = INSTRUMENTS[id].nom; b.onclick = () => choisirInstrument(id); chips.appendChild(b); }
  for (const u of ORDRE_UNITES) { const b = h('button', 'tg-unite', UNITES[u].nom); b.type = 'button'; b.dataset.u = u; b.title = UNITES[u].long; b.onclick = () => choisirUnite(u); unites.appendChild(b); }
  const menuInd = h('details', 'tg-menu'); menuInd.innerHTML = '<summary>Indicateurs</summary><div class="tg-menu-liste"></div>';
  const listeInd = menuInd.querySelector('.tg-menu-liste');
  for (const k of Object.keys(LIBELLES)) { const l = h('label'); l.innerHTML = '<input type="checkbox" data-k="' + k + '"> ' + esc(LIBELLES[k]); listeInd.appendChild(l); }
  listeInd.addEventListener('change', e => { const k = e.target.dataset.k; if (k) { graphique && graphique.regler({ [k]: e.target.checked }); etat.reglages[k] = e.target.checked; sauver(); majResume(); } });
  const bRecadrer = h('button', 'tg-btn', '⤢ Recadrer'), bPlein = h('button', 'tg-btn', '▣ Graphique seul'), bRafraichir = h('button', 'tg-btn', '↻'), bDock = h('button', 'tg-btn', '▾ Panneaux du bas');
  bRecadrer.type = bPlein.type = bRafraichir.type = bDock.type = 'button'; bRafraichir.title = 'Redemander les bougies maintenant';
  bDock.onclick = () => { const r = conteneur.classList.toggle('tg-replie'); bDock.textContent = r ? '▴ Panneaux du bas' : '▾ Panneaux du bas'; };
  bRecadrer.onclick = () => graphique && graphique.recadrer(); bRafraichir.onclick = () => { charger(true); if (etat.source === 'tv') majTV(); };
  bPlein.onclick = () => { etat.plein = !etat.plein; conteneur.classList.toggle('tg-plein', etat.plein); bPlein.textContent = etat.plein ? '▤ Espace complet' : '▣ Graphique seul'; };
  const sourceBtns = h('div', 'tg-source'); sourceBtns.title = 'Graphique : widget TradingView (MA 200 + RSI préchargés) ou graphique maison de Raylé';
  for (const [k, nom] of [['tv', 'TradingView'], ['rayle', 'Raylé']]) { const b = h('button', 'tg-btn tg-src-btn', nom); b.type = 'button'; b.dataset.source = k; b.onclick = () => choisirSource(k); sourceBtns.appendChild(b); }
  // V4 : carte de liquidité (fenêtre) et surimpression des murs / aimants sur le graphique Raylé
  const ACT_LIQ = { BTC: 'BTC', SOL: 'SOL', DOGE: 'DOGE' };
  const bLiq = h('button', 'tg-btn tg-liq', '💧 Carte de liquidité'); bLiq.type = 'button'; bLiq.title = 'Ouvrir la carte de liquidité (carnet d’ordres de Kraken et Binance, enregistré par Kepler)';
  bLiq.onclick = () => import('../liquidite/fenetre-liquidite.js').then(m => m.ouvrirCarte({ actif: ACT_LIQ[etat.instrument] || undefined })).catch(() => { /* indisponible */ });
  const lblSur = h('label', 'tg-sur'); lblSur.innerHTML = '<input type="checkbox" data-sur> Murs et cibles sur le graphique'; lblSur.title = 'Visible sur le graphique Raylé (pas sur le widget TradingView) ; BTC, SOL, DOGE ; demande le service PC';
  const noteSur = h('span', 'tg-sur-note'); let surimp = null;
  lblSur.querySelector('input').onchange = async e => {
    if (!surimp) { const M = await import('../liquidite/surimpression.js'); surimp = M.creerSurimpression({ graphique: () => graphique, instrument: () => etat.instrument, surEtat: x => { noteSur.textContent = x.texte || ''; noteSur.dataset.ok = x.ok ? '1' : '0'; } }); }
    try { localStorage.setItem('rayle_lq_surimpression', e.target.checked ? '1' : '0'); } catch (x) { /* interdit */ }
    if (e.target.checked) { if (etat.source === 'tv') { noteSur.textContent = 'Passe au graphique « Raylé » pour voir les niveaux (TradingView ne se laisse pas dessiner).'; } surimp.activer(); } else surimp.desactiver();
  };
  actions.append(sourceBtns, menuInd, bRecadrer, bDock, bPlein, bRafraichir, bLiq, lblSur, noteSur);
  barre.append(chips, unites, actions);

  // panneaux
  const instances = {}; const onglets = h('div', 'tg-onglets'), corpsDock = h('div', 'tg-dock-corps');
  dock.append(onglets, corpsDock);
  const ctxPanneau = { client, etat: () => ({ ...etat }), serieCourante: () => derniere, choisirInstrument, choisirUnite };
  for (const [id, p] of Object.entries(PANNEAUX)) {
    const inst = p.creer(ctxPanneau); instances[id] = inst;
    const boite = h('section', 'tg-p tg-e-' + p.etat); boite.dataset.panneau = id;
    const tete = h('header', '', '<b>' + esc(p.titre) + '</b>' + (p.etat === 'exemple' ? '<em class="ex">EXEMPLE</em>' : p.etat === 'bientot' ? '<em class="bt">BIENTÔT · ' + p.etape + '</em>' : p.etat === 'info' ? '' : '<em class="re">RÉEL</em>')); boite.append(tete, inst.racine); inst.boite = boite;
    if (p.zone === 'droite') colonne.appendChild(boite);
    else { const o = h('button', 'tg-onglet tg-e-' + p.etat, esc(p.titre)); o.type = 'button'; o.dataset.panneau = id; o.onclick = () => choisirDock(id); onglets.appendChild(o); corpsDock.appendChild(boite); boite.classList.add('tg-dock-p'); }
  }
  function choisirDock(id) {
    etat.dock = id; conteneur.classList.toggle('tg-agent-ouvert', !!(PANNEAUX[id] && PANNEAUX[id].grand)); for (const o of onglets.children) o.classList.toggle('actif', o.dataset.panneau === id);
    for (const b of corpsDock.children) b.classList.toggle('visible', b.dataset.panneau === id);
    if (instances[id] && instances[id].maj) instances[id].maj(); sauver();
  }

  // graphique et données
  let graphique = null, derniere = null, desabonner = null, detruit = false, chargement = 0;
  const sauver = () => ecrirePrefs({ instrument: etat.instrument, unite: etat.unite, reglages: etat.reglages, dock: etat.dock, source: etat.source });
  function majBarre() {
    for (const b of chips.children) b.classList.toggle('actif', b.dataset.id === etat.instrument);
    for (const b of unites.children) b.classList.toggle('actif', b.dataset.u === etat.unite);
    for (const i of listeInd.querySelectorAll('input')) i.checked = !!(graphique ? graphique.reglages() : etat.reglages)[i.dataset.k];
    if (instances.watchlist) instances.watchlist.selection(etat.instrument);
    for (const b of sourceBtns.children) b.classList.toggle('actif', b.dataset.source === etat.source);
    conteneur.classList.toggle('tg-mode-tv', etat.source === 'tv'); zoneTV.style.display = etat.source === 'tv' ? '' : 'none'; zoneRayle.style.display = etat.source === 'tv' ? 'none' : '';
  }
  const tv = creerTradingView({ boite: zoneTV, surAlternative: () => choisirSource('rayle') });
  const majTV = () => { if (etat.source === 'tv') tv.definir(etat.instrument, etat.unite); };
  function choisirSource(k) {
    if (k !== 'tv' && k !== 'rayle') return false; if (k === etat.source) return true;
    etat.source = k; sauver(); majBarre();
    if (k === 'tv') majTV(); else if (graphique) setTimeout(() => graphique.recadrer(), 30);
    return true;
  }
  function majInfos() {
    const d = descriptionSource(derniere), r = derniere;
    infos.innerHTML = '<b class="tg-nom">' + esc(INSTRUMENTS[etat.instrument].nom) + ' · ' + UNITES[etat.unite].long + '</b>'
      + d.etiquettes.map(t => '<em class="tg-et ' + (/indispo|périmé|secours/.test(t) ? 'alerte' : '') + '">' + esc(t) + '</em>').join('')
      + '<span class="tg-src">' + esc(d.texte) + '</span>'
      + (r && r.volume && r.volume.type !== 'indice' && r.volume.note ? '<span class="tg-vol">' + esc(r.volume.note) + '</span>' : '')
      + (r && r.volume && r.volume.type === 'indice' ? '<span class="tg-vol">' + esc(r.volume.note) + '</span>' : '')
      + (r && r.meta && r.meta.note ? '<span class="tg-vol">' + esc(r.meta.note) + '</span>' : '')
      + (r && r.erreur && r.bougies.length ? '<span class="tg-erreur">Dernière mise à jour impossible : ' + esc(r.erreur) + ' (dernières bougies connues affichées)</span>' : '');
  }
  function majResume() { if (instances.resume) instances.resume.maj(); }
  function appliquer(r, premiere) {
    if (detruit || !r || r.instrument !== etat.instrument || r.unite !== etat.unite) return;
    derniere = r; majInfos();
    if (graphique) {
      if (r.vide) graphique.message(r.erreur ? 'INDISPONIBLE : ' + r.erreur : 'Chargement…');
      else { graphique.message(''); if (premiere) graphique.definir({ instrument: r.instrument, unite: r.unite, bougies: r.bougies }); else graphique.maj(r.bougies); }
    }
    majResume(); surChangement({ ...etat, source: r.meta && r.meta.source });
  }
  async function charger(forcer = false) {
    const mon = ++chargement; if (desabonner) { desabonner(); desabonner = null; }
    derniere = null; majInfos(); if (graphique) graphique.message('Chargement…');
    let premiere = true;
    desabonner = client.abonner(etat.instrument, etat.unite, r => { if (mon !== chargement) return; appliquer(r, premiere && !r.vide); if (!r.vide) premiere = false; }, { tick: 15000, forcer });
  }
  function choisirInstrument(id) { if (!INSTRUMENTS[id] || id === etat.instrument) return false; etat.instrument = id; setTimeout(() => surimp && surimp.maj(), 1500); sauver(); majBarre(); charger(); majTV(); if (etat.dock === 'dashboard') instances.dashboard.maj(); return true; }
  function choisirUnite(u) { if (!UNITES[u] || u === etat.unite) return false; etat.unite = u; sauver(); majBarre(); charger(); majTV(); return true; }
  /* Focus venant d'une fenêtre de la table : un graphique, ou un panneau du dock (mis en valeur). */
  function appliquerDemande(o = {}) {
    if (o.source) choisirSource(o.source);
    if (o.instrument) choisirInstrument(o.instrument); if (o.unite) choisirUnite(o.unite);
    if (o.dock && PANNEAUX[o.dock] && PANNEAUX[o.dock].zone === 'dock') choisirDock(o.dock);
    if (o.focus) { for (const b of conteneur.querySelectorAll('.tg-p')) b.classList.toggle('focus', b.dataset.panneau === o.focus); setTimeout(() => { for (const b of conteneur.querySelectorAll('.tg-p.focus')) b.classList.remove('focus'); }, 2600); }
  }
  choisirDock(PANNEAUX[etat.dock] && PANNEAUX[etat.dock].zone === 'dock' ? etat.dock : 'dashboard'); majBarre(); majTV();
  const miseAJour = setInterval(() => { for (const id of ['watchlist']) instances[id].maj(); if (etat.dock === 'correlations') instances.correlations.maj(); if (etat.dock === 'dashboard') instances.dashboard.maj(); if (etat.dock === 'contexte') instances.contexte.maj(); }, 60000);
  instances.watchlist.maj(); setTimeout(() => instances.correlations.maj(), 1500);
  creerGraphique({ boite: zoneRayle, reglages: etat.reglages, surReglage: r => { etat.reglages = r; sauver(); majBarre(); } }).then(g => {
    if (detruit) { g.detruire(); return; } graphique = g; majBarre(); if (derniere && !derniere.vide) { g.definir({ instrument: derniere.instrument, unite: derniere.unite, bougies: derniere.bougies }); g.message(''); majResume(); } else g.message('Chargement…');
  }).catch(e => { zoneRayle.innerHTML = '<div class="tg-etat" style="display:flex">Graphique indisponible : ' + esc(e.message) + '</div>'; });
  charger();
  return {
    appliquer: appliquerDemande, choisirInstrument, choisirUnite, choisirDock, etat: () => ({ ...etat, graphique: graphique ? graphique.etat() : null, source: derniere && derniere.meta ? derniere.meta.source : null, bougies: derniere ? derniere.bougies.length : 0, erreur: derniere ? derniere.erreur : null, description: descriptionSource(derniere) }),
    graphique: () => graphique, serie: () => derniere, panneaux: instances, source: () => etat.source, choisirSource, tv: () => tv,
    detruire() { detruit = true; clearInterval(miseAJour); if (desabonner) desabonner(); tv.detruire(); if (graphique) graphique.detruire(); for (const i of Object.values(instances)) { try { i.detruire(); } catch (e) { /* déjà vide */ } } conteneur.innerHTML = ''; conteneur.classList.remove('tg-espace', 'tg-plein', 'tg-replie'); }
  };
}
