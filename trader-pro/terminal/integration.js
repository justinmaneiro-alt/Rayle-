/* ═════════════ TERMINAL « PRO » : branché sur le terminal existant (agent-trading/front/or.html) sans le réécrire ═════════════
   Ajoute : UNE seule moyenne mobile (la MA200 de l'unité affichée H1 / H4 / Jour, calculée sur ses vraies bougies) ; les niveaux les plus forts de l'unité affichée et du Jour (3 au plus de chaque côté,
   étiquettes jamais superposées) ; les FLÈCHES DAILY (rouge au-dessus d'un sommet Daily, verte sous un creux Daily : très peu, posées à la clôture de la bougie Daily qui confirme le retournement, jamais redessinées,
   visibles aussi sur H1 et H4 à la date de la bougie Daily) avec leur bilan de backtest ; un bouton « Flèches Daily » (panneau) et un bouton « Détails ».
   Graphique PROPRE par défaut : tout le reste (zones, boîtes de position, flèches H1, volume, RSI, bandeaux de sources…) est derrière « Détails ». Lecture seule : aucun ordre n'est envoyé. */
import { lireActifPro } from '../commun/donnees.js';
import { parler } from '../../agent-trading/front/or/tableau-or.js';
import { ma200Unite, bandeauMA, niveauxUniteEtJour, sansChevauchement, avecRang, NOM_UNITE, PAS_UNITE } from '../commun/lecture-unite.js';
import { indexSurUnite, RETENUE } from './fleches-daily.js';
import { flechesDe, nouvellesFleches } from './fleches-registre.js';

const ID_PRO = { OR: 'or', NASDAQ: 'us100', SP500: 'us500', BTC: 'btc', SOL: 'sol' };
const NOMS = { or: 'Or', us100: 'Nasdaq 100', us500: 'S&P 500', btc: 'Bitcoin', sol: 'Solana' };
const LS = { details: 'rayle_tp_details', avant: 'rayle_tp_couches_avant', alerte: 'rayle_tp_fleches_alertes' };
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage refusé */ } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v, d = 2) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ') : '—');
const dateJour = t => new Date(t).toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const COULEURS = { ma: '#f1d34f', hausse: '#5fb894', baisse: '#d86a6a' };

export async function monterPro(T) {
  const actif = (document.body.dataset.actif || 'OR'), id = ID_PRO[actif], tactile = document.documentElement.classList.contains('tm-tactile'), barre = tactile ? document.querySelector('.tt-periodes') : document.querySelector('.tor-periodes') || document.querySelector('.tt-periodes');
  document.documentElement.classList.add('tp-terminal'); document.documentElement.classList.toggle('tp-details', lire(LS.details, false) === true);
  const E = { id, D: null, fleches: [], bt: null, series: {}, lignes: [], marqueurs: null, cle: '', panneau: null, details: lire(LS.details, false) === true, seq: 0 };
  /* ───── boutons ───── */
  const bDet = document.createElement('button'); bDet.type = 'button'; bDet.className = 'tp-b-details'; bDet.textContent = 'Détails'; bDet.setAttribute('aria-pressed', String(E.details)); bDet.title = 'Afficher tous les calques, bandeaux et sources du terminal';
  const bHJ = document.createElement('button'); bHJ.type = 'button'; bHJ.className = 'tp-b-hj'; bHJ.textContent = 'Flèches Daily'; bHJ.title = 'Flèches Daily : retournements des gros mouvements, bilan du backtest et alertes'; bHJ.setAttribute('aria-expanded', 'false');
  /* PC : à la suite des unités de temps ; tactile : sur une ligne à part sous les unités de temps (la grille de 5 colonnes du mode tactile ne les accueille pas) */
  if (tactile || (barre && barre.classList.contains('tt-periodes'))) { const ligne = document.createElement('div'); ligne.className = 'tp-ligne-boutons'; ligne.append(bHJ, bDet); E.ligneTactile = ligne; } else if (barre) { barre.appendChild(bHJ); barre.appendChild(bDet); } else document.body.append(bHJ, bDet);
  const attendreGraphique = async () => { for (let i = 0; i < 200; i++) { const g = T.graph; if (g && g.chart && g.chart() && g.serie && g.serie() && T.moteur) return g; await new Promise(r => setTimeout(r, 250)); } return null; };
  const graph = await attendreGraphique(); if (!graph) return null;
  const LW = window.LightweightCharts;
  if (E.ligneTactile) (graph.conteneur() || document.body).appendChild(E.ligneTactile);   // tactile : sur le graphique, sous la légende des MA200

  /* ───── graphique propre / détails ───── */
  const COUCHES_PROPRES = () => Object.fromEntries(Object.keys(graph.couches()).map(k => [k, false]));
  function appliquerDetails(b, { sauver = true } = {}) {
    E.details = b; ecrire(LS.details, b); document.documentElement.classList.toggle('tp-details', b); bDet.setAttribute('aria-pressed', String(b));
    try { if (b) { const av = lire(LS.avant, null); if (av) graph.couches({ ...av, rayMa: false }); } else { if (sauver) ecrire(LS.avant, graph.couches()); graph.couches(COUCHES_PROPRES()); } } catch (e) { console.warn('[tp] couches :', e.message); }
    setTimeout(() => { try { graph.chart().timeScale().applyOptions({}); graph.chart().resize(graph.conteneur().clientWidth, graph.conteneur().clientHeight); } catch (e) { /* */ } }, 50);
  }
  if (!E.details) { appliquerDetails(false, { sauver: !lire(LS.avant, null) }); for (const ms of [2500, 7000]) setTimeout(() => { if (!E.details) appliquerDetails(false, { sauver: false }); }, ms); }   // le mode tactile règle ses propres calques un peu plus tard : on réaffirme le graphique propre
  bDet.addEventListener('click', () => appliquerDetails(!E.details));
  /* UNE seule moyenne sur le graphique : la MA200 de l'unité affichée (la nôtre). Les anciennes options « MA200 » du terminal sont coupées (et masquées par terminal-pro.css). */
  const couperAnciennesMA = () => { try { for (const k of ['ma200', 'ma200H1']) { const c = document.querySelector(`[data-or="${k}"]`); if (c && c.checked) c.click(); } const cc = graph.couches(); if (cc && cc.rayMa) graph.couches({ ...cc, rayMa: false }); } catch (e) { /* option absente */ } };
  couperAnciennesMA(); for (const ms of [2500, 7000]) setTimeout(couperAnciennesMA, ms);
  try { graph.chart().timeScale().applyOptions({ rightOffset: 8 }); } catch (e) { /* marge à droite : les étiquettes de niveaux ne couvrent plus les dernières bougies */ }

  /* ───── dessin sur le graphique : UNE moyenne (celle de l'unité affichée), des niveaux sans chevauchement ───── */
  const temps = t => { try { return graph.tempsDeBougie(t); } catch (e) { return null; } };
  const uniteAffichee = () => { const p = T.moteur.S.periode; return p === 'H4' || p === 'J' ? p : 'H1'; };
  function ligneMA(titre) { if (!E.series.ma) E.series.ma = graph.chart().addSeries(LW.LineSeries, { color: COULEURS.ma, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null }); E.series.ma.applyOptions({ title: titre }); return E.series.ma; }
  /* après un changement d'unité de temps, le graphique d'origine pouvait rester calé sur l'ancienne plage (H4 → Jour : une seule bougie tout à gauche) : on le recadre sur les dernières bougies pendant 10 s, seulement si la dernière bougie n'est pas visible */
  function recadrer(B) {
    const per = T.moteur.S.periode; if (per !== E.derPeriode) { E.derPeriode = per; E.recadrerJusqua = Date.now() + 10000; }
    if (!(Date.now() < E.recadrerJusqua) || B.length < 30) return;
    try { const ts = graph.chart().timeScale(), r = ts.getVisibleLogicalRange(), n = B.length; if (!r || r.to < n - 12 || r.from > n) ts.setVisibleLogicalRange({ from: Math.max(0, n - 150), to: n - 1 + 5 }); } catch (e) { /* graphique en cours de rechargement */ }
  }
  /* prix de référence pour les distances : le XAU/USD de l'appli pour l'or, sinon le dernier cours du graphique */
  const prixRef = B => (window.__tpPrixRef && Number.isFinite(window.__tpPrixRef.prix) ? window.__tpPrixRef.prix : B[B.length - 1].c);
  function dessiner(force = false) {
    const B = T.moteur.serie() || []; if (B.length < 5) return; recadrer(B);
    const u = uniteAffichee(), bj = u === 'J' ? B : (E.D && E.D.j && E.D.j.length ? E.D.j : null);
    const cle = `${u}|${B.length}|${B[B.length - 1].t}|${bj ? bj.length : 0}`;
    if (force || cle !== E.cle) {
      E.cle = cle;
      /* la MA200 de l'unité affichée, sur ses vraies bougies ; sous 200 bougies affichées, repli sur l'instantané de la MÊME unité */
      let S = ma200Unite(B), source = 'bougies affichées';
      if (!S.length && E.D) { const alt = { H1: E.D.h1, H4: E.D.h4, J: E.D.j }[u]; if (alt && alt.length) { S = ma200Unite(alt); source = 'instantané du robot'; } }
      const m = new Map(); for (const p of S) { const t = temps(p.t); if (t != null && Number.isFinite(p.v)) m.set(t, p.v); }
      ligneMA('MA200 ' + NOM_UNITE[u]).setData([...m.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value })));
      E.ma = { unite: u, source, derniere: S.length ? S[S.length - 1].v : null };
      legendeMA(B, u);
      E.cand = niveauxUniteEtJour(B, bj, B[B.length - 1].c, { unite: u }); E.cleNiv = null;
    }
    niveauxSansChevauchement(B, u); poserFleches(B, u);
  }
  /* flèches Daily : rouge au-dessus d'un sommet, verte sous un creux ; sur H1 et H4 elles sont posées sur la DERNIÈRE bougie de la journée Daily concernée */
  function poserFleches(B, u) {
    const cle = u + '|' + B.length + '|' + B[B.length - 1].t + '|' + E.fleches.length; if (cle === E.cleFleches) return; E.cleFleches = cle;
    const M = [], vus = new Set(); for (const f of E.fleches) { const i = indexSurUnite(B, f.t, PAS_UNITE[u]); if (i < 0) continue; const t = temps(B[i].t); if (t == null) continue; const k = t + '|' + f.dir; if (vus.has(k)) continue; vus.add(k); M.push({ time: t, position: f.dir > 0 ? 'belowBar' : 'aboveBar', color: f.dir > 0 ? COULEURS.hausse : COULEURS.baisse, shape: f.dir > 0 ? 'arrowUp' : 'arrowDown', size: 2 }); }
    M.sort((a, b) => a.time - b.time); E.marques = M.length;
    if (LW.createSeriesMarkers) { const s = graph.serie(); if (!E.marqueurs) E.marqueurs = LW.createSeriesMarkers(s, M); else E.marqueurs.setMarkers(M); }
  }
  /* niveaux : 3 au plus de chaque côté ; deux étiquettes à moins de 24 px l'une de l'autre → on garde la plus proche du prix. Recalculé à chaque passage (zoom, défilement, taille). */
  function niveauxSansChevauchement(B, u) {
    const s = graph.serie(), px = B[B.length - 1].c, gardes = sansChevauchement(avecRang(E.cand || [], px, u), p => { try { return s.priceToCoordinate(p); } catch (e) { return NaN; } }, 24);
    const k = gardes.map(n => n.nom + n.src + Math.round(n.prix * 100)).join('|'); if (k === E.cleNiv) return; E.cleNiv = k;
    for (const l of E.lignes) { try { s.removePriceLine(l); } catch (e) { /* */ } } E.lignes = [];
    for (const n of gardes) E.lignes.push(s.createPriceLine({ price: n.prix, color: n.cote === 'R' ? 'rgba(216,106,106,.8)' : 'rgba(95,184,148,.8)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `${n.nom} ${n.src === 'J' ? 'Jour' : n.src}` }));   // le prix est déjà sur l'axe : l'étiquette reste courte pour ne pas masquer les dernières bougies ni leurs flèches
    E.niveaux = gardes;
  }

  /* bandeau du haut : seulement la MA200 de l'unité affichée (valeur + distance du prix en %) */
  function legendeMA(B, u) {
    const c = graph.conteneur(); if (!c) return; let el = c.querySelector('.tp-ma-legende'); if (!el) { el = document.createElement('div'); el.className = 'tp-ma-legende'; c.appendChild(el); }
    const b = bandeauMA(B, u, prixRef(B)), v = b.ok ? b : (E.ma && Number.isFinite(E.ma.derniere) ? { ok: true, nom: 'MA200 ' + NOM_UNITE[u], valeur: E.ma.derniere, distancePct: prixRef(B) / E.ma.derniere * 100 - 100 } : b);
    el.innerHTML = v.ok ? `<span style="color:${COULEURS.ma}">${esc(v.nom)} ${nf(v.valeur, 0)} · prix ${nf(Math.abs(v.distancePct), 1)} % ${v.distancePct >= 0 ? 'au-dessus' : 'sous'}</span>` : `<span style="color:${COULEURS.ma}">${esc(v.nom)} : ${esc(v.raison)}</span>`;
    el.title = 'Moyenne mobile simple sur 200 bougies ' + NOM_UNITE[u] + (E.ma ? ' (' + E.ma.source + ')' : '') + ' ; distance calculée avec le prix de référence de l’appli';
  }

  /* l'or a UN seul prix dans l'appli : le XAU/USD au comptant (celui de l'accueil et de XTB), ou son dernier cours de clôture avec la mention « marché fermé ».
     Le graphique trace le perpétuel Kraken (bougies) : son dernier cours n'est donc pas affiché sur l'échelle, et l'en-tête montre le prix de référence (voir tableau-or.js : window.__tpPrixRef). */
  async function majSpot() {
    if (id !== 'or' || document.hidden) return; let p = null;
    try { const tp = window.parent !== window ? window.parent.TraderPro : window.TraderPro; p = tp && tp.prixOr ? await tp.prixOr() : null; } catch (e) { p = null; }
    if (!p) { try { p = await (await import('../commun/donnees.js')).prixOr(); } catch (e) { p = null; } }
    window.__tpPrixRef = p && p.reference ? p : null;
    const etiq = document.querySelector('.tor-titre small'); if (etiq && window.__tpPrixRef) { etiq.textContent = 'XAU/USD · bougies Kraken'; etiq.title = p.source + (p.note ? ' — ' + p.note : ''); }
    const cible = document.querySelector('[data-or-prix]'); if (cible && window.__tpPrixRef) { cible.textContent = nf(p.prix, 2); cible.title = p.source + (p.note ? ' — ' + p.note : ''); const v = document.querySelector('[data-or-var]'); if (v) v.textContent = p.ferme ? 'marché fermé · dernier cours' : (Number.isFinite(p.pct) ? (p.pct >= 0 ? '+' : '') + nf(p.pct, 2) + ' % sur le jour' : ''); }
    try { if (window.__tpPrixRef) graph.serie().applyOptions({ lastValueVisible: false, priceLineVisible: false }); } catch (e) { /* option absente */ }
  }

  /* ───── données, alertes ───── */
  async function charger() {
    if (!id) { E.raison = 'Les flèches Daily sont disponibles pour l’or, le Nasdaq 100, le S&P 500, le Bitcoin et Solana.'; rendrePanneau(); return; }
    const n = ++E.seq;
    try { const r = await lireActifPro(id, { delai: 8000 }); if (n !== E.seq) return; E.D = r.donnees; E.meta = r; E.raison = null; E.fleches = flechesDe(id, E.D.j); }
    catch (e) { E.raison = 'Données Daily indisponibles : ' + (e && e.message || e) + ' (le robot publie ces séries toutes les 30 minutes). Les flèches déjà publiées restent affichées.'; try { E.fleches = (await import('./fleches-registre.js')).lireRegistre(id); } catch (e2) { /* aucune */ } }
    E.cleFleches = null; dessiner(true); rendrePanneau(); alerter();
  }
  async function chargerBacktest() { try { const r = await fetch(new URL('./backtest-fleches.json', import.meta.url), { cache: 'no-cache' }); if (r.ok) E.bt = await r.json(); } catch (e) { /* le panneau le dit */ } rendrePanneau(); }
  /* alertes : SEULEMENT les nouvelles flèches Daily (voix de Rayle, notification, Telegram) ; une flèche n'est annoncée qu'une fois, et jamais si elle date de plus de 36 h */
  const texteAlerte = f => `Flèche Daily ${f.dir < 0 ? 'rouge' : 'verte'} sur ${NOMS[id]} : ${f.dir < 0 ? 'un sommet' : 'un creux'} semble confirmé, le ${dateJour(f.tExtreme)} (décalage ${f.decalageJours} jours). C’est un retournement possible, pas un ordre.`;
  function alerter() {
    if (!E.fleches.length) return; const att = lire(LS.alerte, {}), nouvelles = nouvellesFleches(id, E.fleches);
    for (const f of nouvelles.slice(0, 2)) { const texte = texteAlerte(f); parler(texte); try { if (T.notifier) T.notifier(texte, { niveau: 'info', dit: false, raison: 'flèche Daily' }); } catch (e) { /* */ } try { if (att.telegram !== false && T.envoyerTelegram) T.envoyerTelegram(texte + ' (lecture seule, aucun ordre)'); } catch (e) { /* */ } }
  }

  /* ───── panneau « Flèches Daily » ───── */
  const pc = (v, d = 0) => (Number.isFinite(v) ? nf(v * 100, d) + ' %' : '—'), pcv = (v, d = 1) => (Number.isFinite(v) ? nf(v, d) + ' %' : '—');
  function bilanHtml() {
    const bt = E.bt, m = bt && bt.retenue && bt.methodes[bt.retenue], r = m && m.horsEchantillon.parActif[id], t = m && m.toutePeriode[id];
    if (!bt) return '<p class="tp-doux">Bilan indisponible (fichier du backtest non chargé).</p>';
    if (!r) return '<p class="tp-doux">Pas de backtest pour cet actif : les flèches utilisent la même méthode, mais aucune mesure n’existe ici. Le backtest couvre l’or, le Nasdaq 100 et le Bitcoin.</p>';
    const ligne = (nom, a, b) => `<tr><th>${nom}</th><td>${a}</td><td>${b}</td></tr>`;
    return `<table class="tp-bt"><tr><th></th><th>Hors échantillon (${esc(r.debut)} → ${esc(r.fin)})</th><th>Toute la période (${esc(t.debut)} → ${esc(t.fin)})</th></tr>
      ${ligne('Nombre de flèches', r.n + ' (' + nf(r.parTrimestre, 1) + ' par trimestre)', t.n + ' (' + nf(t.parTrimestre, 1) + ' par trimestre)')}
      ${ligne('Bonnes flèches', pc(r.precision) + ' (' + r.bonnes + ' sur ' + r.n + ')', pc(t.precision) + ' (' + t.bonnes + ' sur ' + t.n + ')')}
      ${ligne('Gros mouvements captés', pc(r.rappel) + ' (' + r.couverts + ' sur ' + r.majeurs + ')', pc(t.rappel) + ' (' + t.couverts + ' sur ' + t.majeurs + ')')}
      ${ligne('Mouvement moyen capté', pcv(r.mouvementCaptePct), pcv(t.mouvementCaptePct))}
      ${ligne('Pire fausse flèche', pcv(r.pireFausseAdversePct) + ' contre la flèche', pcv(t.pireFausseAdversePct) + ' contre la flèche')}
      ${ligne('Décalage moyen sommet/creux → flèche', nf(r.decalageMoyenJours, 1) + ' jours', nf(t.decalageMoyenJours, 1) + ' jours')}
      ${ligne('Mouvement 20 jours après la flèche', pcv(r.mouvement20jPct) + ' (dans le sens de la flèche)', pcv(t.mouvement20jPct) + ' (dans le sens de la flèche)')}</table>
      <p class="tp-doux"><b>${esc(bt.verdict.texte)}</b> Au hasard, ${pc(r.precisionHasard)} des flèches seraient « bonnes » sur cet actif (p = ${nf(r.pHasard, 3)}). La flèche confirme un retournement DÉJÀ amorcé (décalage ci-dessus) : elle ne prédit pas la suite, et le mouvement des 20 jours qui suivent est en moyenne proche de zéro. Une « bonne » flèche = posée dans les 15 jours après un vrai sommet ou creux majeur (retournement d’au moins ${nf(bt.actifs[id].seuilMajeurPct, 1)} %). Rapport complet : <code>trader-pro/terminal/BACKTEST-FLECHES.md</code>.</p>`;
  }
  function rendrePanneau() {
    const p = E.panneau; if (!p) return; const att = lire(LS.alerte, {}), L = E.fleches.slice().reverse().slice(0, 10), bilanOuvert = !!(p.querySelector('details.tp-bilan') || {}).open;   // l'encart reste ouvert quand le panneau se redessine
    p.innerHTML = `<header><b>Flèches Daily · ${esc(NOMS[id] || actif)}</b><button type="button" data-fermer aria-label="Fermer">✕</button></header>
      ${E.raison ? `<p class="tp-doux">${esc(E.raison)}</p>` : ''}
      <p class="tp-doux">Flèche <b class="tp-b">rouge ▼</b> au-dessus d’un sommet Daily, <b class="tp-h">verte ▲</b> sous un creux Daily : seulement les retournements des gros mouvements. Elle apparaît à la <b>clôture de la bougie Daily qui confirme</b> le retournement, ne bouge plus jamais, et s’affiche aussi sur H1 et H4 à la date de cette bougie. Méthode : ${esc(E.bt && E.bt.methodes && E.bt.methodes[RETENUE.methode] ? E.bt.methodes[RETENUE.methode].court : 'pivot de swing confirmé')} (plus haut / plus bas sur ${RETENUE.params.L} jours de chaque côté, mouvement d’au moins ${RETENUE.params.amp} ATR).</p>
      <h4>Dernières flèches</h4>${L.length ? `<ul class="tp-sigs">${L.map(f => `<li class="${f.dir > 0 ? 'tp-h' : 'tp-b'}"><b>${f.dir > 0 ? '▲ creux' : '▼ sommet'}</b> <span>confirmé le ${esc(dateJour(f.tCloture - 1))}</span><small>${f.dir > 0 ? 'creux' : 'sommet'} du ${esc(dateJour(f.tExtreme))} · décalage ${f.decalageJours} j · niveau de la bougie ${nf(f.niveau, 0)}</small></li>`).join('')}</ul>` : '<p class="tp-doux">Aucune flèche pour le moment.</p>'}
      <details class="tp-bilan"><summary>Bilan de la méthode (backtest, nombre de flèches, bonnes flèches…)</summary>${bilanHtml()}</details>
      <h4>Alertes</h4><label class="tp-case"><input type="checkbox" data-al="telegram"${att.telegram !== false ? ' checked' : ''}> Telegram (terminal ouvert ; robot GitHub appli fermée)</label><p class="tp-doux">La voix de Rayle, la notification et Telegram annoncent SEULEMENT une nouvelle flèche Daily (une fois, dans les 36 h qui suivent sa clôture). Aucun autre signal.</p>`;
    if (bilanOuvert) { const d = p.querySelector('details.tp-bilan'); if (d) d.open = true; }
  }
  function ouvrirPanneau(o) {
    if (!E.panneau) { E.panneau = document.createElement('aside'); E.panneau.className = 'tp-panneau'; E.panneau.setAttribute('aria-label', 'Flèches Daily'); document.body.appendChild(E.panneau); E.panneau.addEventListener('click', ev => { if (ev.target.closest('[data-fermer]')) ouvrirPanneau(false); });
      E.panneau.addEventListener('change', ev => { const c = ev.target.closest('[data-al]'); if (c) { const a = lire(LS.alerte, {}); a[c.dataset.al] = c.checked; ecrire(LS.alerte, a); } }); }
    E.panneau.hidden = !o; bHJ.setAttribute('aria-expanded', String(!!o)); document.documentElement.classList.toggle('tp-panneau-ouvert', !!o); if (o) rendrePanneau();
  }
  bHJ.addEventListener('click', () => ouvrirPanneau(!(E.panneau && !E.panneau.hidden)));

  /* ───── cycle ───── */
  await charger(); chargerBacktest(); majSpot(); const spot = setInterval(majSpot, 30000);
  const suivi = setInterval(() => dessiner(), 1500), maj = setInterval(() => { if (!document.hidden) charger(); }, 120000);
  window.addEventListener('pagehide', () => { clearInterval(suivi); clearInterval(maj); clearInterval(spot); });
  return { charger, majSpot, dessiner: () => dessiner(true), fleches: () => E.fleches.slice(), niveaux: () => (E.niveaux || []).map(n => ({ nom: n.nom, src: n.src, cote: n.cote, prix: n.prix, y: graph.serie().priceToCoordinate(n.prix) })), etat: () => ({ id, details: E.details, niveaux: E.lignes.length, fleches: E.fleches.length, marques: E.marques || 0, ma: Object.keys(E.series) }), ouvrirPanneau, appliquerDetails };
}
