/* ═════════════ TERMINAL « PRO » : branché sur le terminal existant (agent-trading/front/or.html) sans le réécrire ═════════════
   Ajoute : UNE seule moyenne mobile (la MA200 de l'unité affichée H1 / H4 / Jour, calculée sur ses vraies bougies) ; les niveaux les plus forts de l'unité affichée et du Jour (3 au plus de chaque côté,
   étiquettes jamais superposées) ; les FLÈCHES DAILY (sommets et creux majeurs du Daily, zigzag ATR : rouge au-dessus de la mèche d'un sommet, verte sous la mèche d'un creux, posées sur la bougie extrême,
   pleines dans le sens de la tendance MA200 Daily, pâles contre elle ; sur le Jour et sur H4 seulement, jamais sur H1 ; jamais redessinées) ; un bouton « Flèches Daily » (réglages, liste) et un bouton « Détails ».
   Réglages : interrupteur « Flèches Daily » (activé par défaut) et multiplicateur ATR par actif (2,5 par défaut), aussi dans « Affichage ».
   Graphique PROPRE par défaut : tout le reste (zones, boîtes de position, volume, RSI, bandeaux de sources…) est derrière « Détails ». Lecture seule : aucun ordre n'est envoyé. */
import { lireActifPro } from '../commun/donnees.js';
import { parler } from '../../agent-trading/front/or/tableau-or.js';
import { ma200Unite, bandeauMA, niveauxUniteEtJour, sansChevauchement, avecRang, NOM_UNITE, PAS_UNITE } from '../commun/lecture-unite.js';
import { indexSurUnite, indexConfirmation, styleFleche, phraseFleche, MULT_DEFAUT, COULEURS as COULEURS_RVB } from './zigzag-daily.js';
import { flechesDe, nouvellesFleches, lireReglages, ecrireReglages, multActif, lireRegistre } from './fleches-registre.js';
import { monterDashboard } from '../commun/dashboard.js';

const ID_PRO = { OR: 'or', NASDAQ: 'us100', SP500: 'us500', BTC: 'btc', SOL: 'sol', DOGE: 'doge' };
const NOMS = { or: 'Or', us100: 'Nasdaq 100', us500: 'S&P 500', btc: 'Bitcoin', sol: 'Solana', doge: 'Dogecoin' };
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
  const E = { id, D: null, fleches: [], reglages: lireReglages(), series: {}, lignes: [], marqueurs: null, cle: '', panneau: null, details: lire(LS.details, false) === true, seq: 0 };
  /* ───── boutons ───── */
  const bDet = document.createElement('button'); bDet.type = 'button'; bDet.className = 'tp-b-details'; bDet.textContent = 'Détails'; bDet.setAttribute('aria-pressed', String(E.details)); bDet.title = 'Afficher tous les calques, bandeaux et sources du terminal';
  const bHJ = document.createElement('button'); bHJ.type = 'button'; bHJ.className = 'tp-b-hj'; bHJ.textContent = 'Flèches Daily'; bHJ.title = 'Flèches Daily : sommets et creux majeurs du Daily, réglages (interrupteur, multiplicateur ATR) et alertes'; bHJ.setAttribute('aria-expanded', 'false');
  const bDon = document.createElement('button'); bDon.type = 'button'; bDon.className = 'tp-b-donnees'; bDon.textContent = 'Données'; bDon.title = 'Score de marché, tendance, volume net, données pro'; bDon.setAttribute('aria-expanded', 'false');
  /* PC : à la suite des unités de temps ; tactile : sur une ligne à part sous les unités de temps (la grille de 5 colonnes du mode tactile ne les accueille pas) */
  if (tactile || (barre && barre.classList.contains('tt-periodes'))) { const ligne = document.createElement('div'); ligne.className = 'tp-ligne-boutons'; ligne.append(bHJ, bDon, bDet); E.ligneTactile = ligne; } else if (barre) { barre.appendChild(bHJ); barre.appendChild(bDon); barre.appendChild(bDet); } else document.body.append(bHJ, bDon, bDet);
  const attendreGraphique = async () => { for (let i = 0; i < 200; i++) { const g = T.graph; if (g && g.chart && g.chart() && g.serie && g.serie() && T.moteur) return g; await new Promise(r => setTimeout(r, 250)); } return null; };
  const graph = await attendreGraphique(); if (!graph) return null;
  const LW = window.LightweightCharts;
  if (E.ligneTactile) (graph.conteneur() || document.body).appendChild(E.ligneTactile);   // tactile : sur le graphique, sous la légende des MA200

  /* ───── graphique propre / détails ───── */
  const COUCHES_PROPRES = () => ({ ...Object.fromEntries(Object.keys(graph.couches()).map(k => [k, false])), rayMa: false, rayBoites: false, rayGolden: false, rayNiveaux: false, rayScenarios: false });
  /* calques de la stratégie de Rayle (MA200 H1 colorée, boîtes, golden zone, BOS / MSS…) : leur modèle ne se recalcule que sur l'événement « change » de leur case (ou maj(true)) ; changer les calques du graphique ne suffit pas */
  const RAYLE = ['rayMa', 'rayBoites', 'rayGolden', 'rayNiveaux', 'rayScenarios'];
  function majRayle(ks) {
    for (const k of ks) { const c = document.querySelector('[data-couche="' + k + '"]'); if (c && c.checked) { c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); } }
    try { graph.couches(Object.fromEntries(ks.map(k => [k, false]))); } catch (e) { /* */ } try { if (T.strategie && T.strategie.maj) T.strategie.maj(true); } catch (e) { /* */ }
  }
  function appliquerDetails(b, { sauver = true } = {}) {
    E.details = b; ecrire(LS.details, b); document.documentElement.classList.toggle('tp-details', b); bDet.setAttribute('aria-pressed', String(b));
    try { if (b) { const av = lire(LS.avant, null); if (av) graph.couches({ ...av, rayMa: false }); } else { if (sauver) ecrire(LS.avant, graph.couches()); graph.couches(COUCHES_PROPRES()); } majRayle(b ? ['rayMa'] : RAYLE); } catch (e) { console.warn('[tp] couches :', e.message); }
    setTimeout(() => { try { graph.chart().timeScale().applyOptions({}); graph.chart().resize(graph.conteneur().clientWidth, graph.conteneur().clientHeight); } catch (e) { /* */ } }, 50);
  }
  if (!E.details) { appliquerDetails(false, { sauver: !lire(LS.avant, null) }); for (const ms of [2500, 7000]) setTimeout(() => { if (!E.details) appliquerDetails(false, { sauver: false }); }, ms); }   // le mode tactile règle ses propres calques un peu plus tard : on réaffirme le graphique propre
  bDet.addEventListener('click', () => appliquerDetails(!E.details));
  /* UNE seule moyenne sur le graphique : la MA200 de l'unité affichée (la nôtre). Les anciennes options « MA200 » du terminal sont coupées (et masquées par terminal-pro.css). */
  const couperAnciennesMA = () => { try { for (const k of ['ma200', 'ma200H1']) { const c = document.querySelector(`[data-or="${k}"]`); if (c && c.checked) c.click(); } if (graph.couches().rayMa !== false) graph.couches({ rayMa: false }); const m = T.strategie && T.strategie.modele && T.strategie.modele(); if (m && (m.ma || (!E.details && ((m.boites && m.boites.length) || (m.structure && m.structure.length) || m.ligne)))) majRayle(E.details ? ['rayMa'] : RAYLE); } catch (e) { /* option absente */ } };
  couperAnciennesMA(); for (const ms of [2500, 7000]) setTimeout(couperAnciennesMA, ms);
  try { graph.chart().timeScale().applyOptions({ rightOffset: 8 }); } catch (e) { /* marge à droite : les étiquettes de niveaux ne couvrent plus les dernières bougies */ }

  /* ───── dessin sur le graphique : UNE moyenne (celle de l'unité affichée), des niveaux sans chevauchement ───── */
  const temps = t => { try { return graph.tempsDeBougie(t); } catch (e) { return null; } };
  const uniteAffichee = () => { const p = T.moteur.S.periode; return p === 'H4' || p === 'J' ? p : 'H1'; };
  function ligneMA(titre) { if (!E.series.ma) E.series.ma = graph.chart().addSeries(LW.LineSeries, { color: COULEURS.ma, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null }); E.series.ma.applyOptions({ title: titre }); return E.series.ma; }
  /* après un changement d'unité de temps, le graphique d'origine pouvait rester calé sur l'ancienne plage (H4 → Jour : une seule bougie tout à gauche) : on le recadre sur les dernières bougies pendant 10 s, seulement si la dernière bougie n'est pas visible */
  function recadrer(B) {
    const per = T.moteur.S.periode; if (per !== E.derPeriode) { E.derPeriode = per; E.recadrerJusqua = Date.now() + 10000; if (!E.details) for (const ms of [1500, 5000]) setTimeout(() => { if (!E.details) appliquerDetails(false, { sauver: false }); }, ms); }   // un changement d'unité réactive les calques par défaut de la stratégie : on les recoupe
    if (!(Date.now() < E.recadrerJusqua) || B.length < 30) return;
    try { const ts = graph.chart().timeScale(), r = ts.getVisibleLogicalRange(), n = B.length; if (!r || r.to < n - 12 || r.from > n) ts.setVisibleLogicalRange({ from: Math.max(0, n - 150), to: n - 1 + 5 }); } catch (e) { /* graphique en cours de rechargement */ }
  }
  /* prix de référence pour les distances : le XAU/USD de l'appli pour l'or, sinon le dernier cours du graphique */
  const prixRef = B => (window.__tpPrixRef && Number.isFinite(window.__tpPrixRef.prix) ? window.__tpPrixRef.prix : B[B.length - 1].c);
  function dessiner(force = false) {
    const B = T.moteur.serie() || []; if (B.length < 5) return; recadrer(B); couperAnciennesMA();   // la MA200 H1 de la stratégie de Rayle ne doit JAMAIS s'afficher à côté de celle de l'unité
    const u = uniteAffichee(), bj = u === 'J' ? B : (E.D && E.D.j && E.D.j.length ? E.D.j : null);
    const cle = `${u}|${B.length}|${B[B.length - 1].t}|${bj ? bj.length : 0}`;
    if (force || cle !== E.cle) {
      E.cle = cle;
      /* la MA200 de l'unité affichée, sur ses vraies bougies ; sous 200 bougies affichées, repli sur l'instantané de la MÊME unité */
      let S = ma200Unite(B), source = 'bougies affichées';
      /* historique trop court pour tracer la MA200 dès le bord gauche de l'écran (l'or n'a que quelques mois de Daily Kraken) : on complète AVANT la première bougie avec la série de la MÊME unité de l'instantané du robot */
      { const alt = E.D && { H1: E.D.h1, H4: E.D.h4, J: E.D.j }[u]; if (B.length < 450 && alt && alt.length) { const pas = PAS_UNITE[u], avant = alt.filter(b => b.t < B[0].t); if (avant.length && B[0].t - avant[avant.length - 1].t <= Math.max(4 * pas, 3 * 86400e3)) { const ext = ma200Unite(avant.concat(B)).filter(p => p.t >= B[0].t); if (ext.length > S.length) { S = ext; source = 'bougies affichées + instantané du robot (même unité) avant la première bougie'; } } } }
      if (!S.length && E.D) { const alt = { H1: E.D.h1, H4: E.D.h4, J: E.D.j }[u]; if (alt && alt.length) { S = ma200Unite(alt); source = 'instantané du robot'; } }
      const m = new Map(); for (const p of S) { const t = temps(p.t); if (t != null && Number.isFinite(p.v)) m.set(t, p.v); }
      ligneMA('MA200 ' + NOM_UNITE[u]).setData([...m.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value })));
      E.ma = { unite: u, source, derniere: S.length ? S[S.length - 1].v : null };
      legendeMA(B, u);
      E.cand = niveauxUniteEtJour(B, bj, B[B.length - 1].c, { unite: u }); E.cleNiv = null;
    }
    niveauxSansChevauchement(B, u); poserFleches(B, u);
  }
  /* flèches Daily : sommets et creux majeurs, posées sur la bougie EXTRÊME. Jour : la bougie Daily ; H4 : la bougie H4 qui contient le plus haut / plus bas exact de la journée ; H1 : aucune flèche.
     Pleine = dans le sens de la tendance (MA200 Daily), pâle (40 %) = contre la tendance ; aucun texte. */
  function poserFleches(B, u) {
    const actives = E.reglages.actif !== false && u !== 'H1', cle = [u, B.length, B[B.length - 1].t, E.fleches.length, actives, multActif(id, E.reglages)].join('|'); if (cle === E.cleFleches) return; E.cleFleches = cle;
    const M = [], vus = new Set(), infos = new Map(), pas = PAS_UNITE[u], ch = graph.chart();
    for (const s of E.traits || []) { try { ch.removeSeries(s); } catch (e) { /* déjà retirée */ } } E.traits = [];
    if (actives) for (const f of E.fleches) {
      const kx = indexSurUnite(B, f, pas), kc = indexConfirmation(B, f, pas); if (kx < 0 || kc < 0) continue;
      const tx = temps(B[kx].t), tc = temps(B[kc].t); if (tx == null || tc == null) continue; const cl = tc + '|' + f.dir; if (vus.has(cl)) continue; vus.add(cl);
      const s = styleFleche(f), prixC = Number.isFinite(f.prixConf) ? f.prixConf : B[kc].c, [r, g, b] = f.dir > 0 ? COULEURS_RVB.creux : COULEURS_RVB.sommet, sens = f.dir < 0 ? 'Sommet' : 'Creux';
      /* flèche principale : sur la bougie de CONFIRMATION, au prix de clôture de ce jour-là (le moment où elle apparaît en direct) */
      M.push({ time: tc, position: f.dir > 0 ? 'atPriceBottom' : 'atPriceTop', price: prixC, color: s.couleur, shape: s.forme, size: tactile ? 2.2 : 1.8 });
      /* sur la bougie extrême : un petit point discret et transparent, relié à la flèche par un trait pointillé fin */
      M.push({ time: tx, position: 'atPriceMiddle', price: f.niveau, color: `rgba(${r},${g},${b},0.5)`, shape: 'circle', size: 0.5 });
      if (tx !== tc) { try { const tr = ch.addSeries(LW.LineSeries, { color: `rgba(${r},${g},${b},${f.pleine ? 0.9 : 0.55})`, lineWidth: 1, lineStyle: LW.LineStyle ? LW.LineStyle.Dotted : 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null }); tr.setData([{ time: Math.min(tx, tc), value: tx < tc ? f.niveau : prixC }, { time: Math.max(tx, tc), value: tx < tc ? prixC : f.niveau }]); E.traits.push(tr); } catch (e) { /* trait facultatif */ } }
      const dec = Math.round((f.tConf - f.t) / 86400e3), txt = `${sens} Daily${f.pleine ? '' : ' (contre la tendance)'}\nExtrême : ${dateJour(f.t)} · ${nf(f.niveau)}\nApparu : ${dateJour(f.tConf)} · ${nf(prixC)}\nDécalage : ${dec} j`;
      infos.set(tc, txt); if (!infos.has(tx)) infos.set(tx, txt);
    }
    M.sort((a, b) => a.time - b.time); E.marques = M.length; E.M = M; E.infos = infos; infoFleche();
    if (LW.createSeriesMarkers) { const s = graph.serie(); if (!E.marqueurs) E.marqueurs = LW.createSeriesMarkers(s, M); else E.marqueurs.setMarkers(M); }
  }
  /* niveaux : 3 au plus de chaque côté ; deux étiquettes à moins de 24 px l'une de l'autre → on garde la plus proche du prix. Recalculé à chaque passage (zoom, défilement, taille). */
  /* info-bulle des flèches : survol (PC) ou toucher (téléphone) de la flèche ou du point de l'extrême */
  function infoFleche() {
    if (E.infoOk) return; const c = graph.conteneur(); if (!c) return; E.infoOk = true;
    const el = document.createElement('div'); el.className = 'tp-fleche-info'; el.style.display = 'none'; c.appendChild(el); E.infoEl = el;
    graph.chart().subscribeCrosshairMove(p => { const t = p && p.time != null ? E.infos && E.infos.get(p.time) : null; if (!t) { el.style.display = 'none'; return; } el.textContent = t; el.style.display = 'block'; });
  }
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
    try { const r = await lireActifPro(id, { delai: 8000 }); if (n !== E.seq) return; E.D = r.donnees; E.meta = r; E.raison = null; E.fleches = flechesDe(id, E.D.j, { mult: multActif(id, E.reglages) }); }
    catch (e) { E.raison = 'Données Daily indisponibles : ' + (e && e.message || e) + ' (le robot publie ces séries toutes les 30 minutes). Les flèches déjà confirmées restent affichées.'; try { E.fleches = lireRegistre(id, multActif(id, E.reglages)); } catch (e2) { /* aucune */ } }
    E.cleFleches = null; dessiner(true); rendrePanneau(); alerter();
  }
  /* alertes : SEULEMENT les nouvelles flèches Daily confirmées : UNE annonce vocale de Rayle (« Or : sommet Daily confirmé, vers 2 650 ») + une notification + un message Telegram (pont du Worker existant).
     Une flèche n'est annoncée qu'une fois (registre de l'appareil : vueLe), et jamais si elle date de plus de 36 h. Interrupteur « Flèches Daily » coupé : aucune annonce. */
  function alerter() {
    if (E.reglages.actif === false || !E.fleches.length) return; const att = lire(LS.alerte, {}), nouvelles = nouvellesFleches(id, E.fleches, { mult: multActif(id, E.reglages) });
    for (const f of nouvelles.slice(0, 2)) { const texte = phraseFleche(NOMS[id], f); parler(texte); try { if (T.notifier) T.notifier(texte, { niveau: 'info', dit: false, raison: 'flèche Daily' }); } catch (e) { /* */ } try { if (att.telegram !== false && T.envoyerTelegram) T.envoyerTelegram(texte + (f.pleine ? ' (dans le sens de la tendance)' : ' (contre la tendance)') + ' · lecture seule, aucun ordre'); } catch (e) { /* */ } }
  }

  /* ───── panneau « Flèches Daily » ───── */
  const IDS_REGLAGES = ['or', 'us100', 'us500', 'btc', 'sol', 'doge'];
  /* réglages : interrupteur « Flèches Daily » + multiplicateur ATR par actif (même bloc dans le panneau « Flèches Daily » et dans « Affichage » du terminal) */
  function reglagesHtml() {
    const R = E.reglages;
    return `<div class="tp-reg" data-tp-reg><label class="tp-case"><input type="checkbox" data-reg="actif"${R.actif !== false ? ' checked' : ''}> Flèches Daily (sommets et creux majeurs)</label>
      <div class="tp-reg-mult"><span>Multiplicateur ATR par actif</span>${IDS_REGLAGES.map(k => `<label class="tp-reg-l${k === id ? ' tp-reg-ici' : ''}"><span>${esc(NOMS[k])}</span><input type="number" inputmode="decimal" min="0.5" max="10" step="0.1" value="${multActif(k, R)}" data-reg-mult="${k}" aria-label="Multiplicateur ATR ${esc(NOMS[k])}"></label>`).join('')}</div>
      <small class="tp-doux">Défaut ${String(MULT_DEFAUT).replace('.', ',')} : plus le nombre est grand, moins il y a de flèches (le recul exigé pour confirmer un sommet ou un creux = multiplicateur × ATR 14 Daily).</small></div>`;
  }
  function appliquerReglage(el) {
    const R = E.reglages;
    if (el.dataset.reg === 'actif') R.actif = el.checked;
    else if (el.dataset.regMult) { const v = Number(String(el.value).replace(',', '.')); if (Number.isFinite(v) && v >= 0.5 && v <= 10) R.mult[el.dataset.regMult] = Math.round(v * 100) / 100; else { el.value = multActif(el.dataset.regMult, R); return; } }
    ecrireReglages(R); majFleches();
  }
  /* recalcule les flèches avec les réglages courants (autre multiplicateur = autre registre), redessine et synchronise les deux blocs de réglages */
  function majFleches() {
    if (E.D) { try { E.fleches = flechesDe(id, E.D.j, { mult: multActif(id, E.reglages) }); } catch (e) { E.fleches = []; } } else { try { E.fleches = lireRegistre(id, multActif(id, E.reglages)); } catch (e) { E.fleches = []; } }
    E.cleFleches = null; dessiner(true); rendrePanneau(); synchroReglages(); alerter();
  }
  const zonesReglages = () => [...document.querySelectorAll('[data-tp-reg]')];
  function synchroReglages() { for (const z of zonesReglages()) { const c = z.querySelector('[data-reg="actif"]'); if (c) c.checked = E.reglages.actif !== false; for (const i of z.querySelectorAll('[data-reg-mult]')) if (document.activeElement !== i) i.value = multActif(i.dataset.regMult, E.reglages); } }
  document.addEventListener('change', ev => { const el = ev.target.closest && ev.target.closest('[data-reg],[data-reg-mult]'); if (el && el.closest('[data-tp-reg]')) appliquerReglage(el); });
  /* « Affichage » du terminal : le même bloc de réglages (s'il existe) */
  (function dansAffichage() { const pan = document.querySelector('.tor-ob-pan'); if (!pan || pan.querySelector('[data-tp-reg]')) return; const d = document.createElement('div'); d.innerHTML = reglagesHtml(); pan.insertBefore(d.firstElementChild, pan.querySelector('hr') || pan.firstChild); })();
  function rendrePanneau() {
    const p = E.panneau; if (!p) return; const att = lire(LS.alerte, {}), L = E.fleches.slice().reverse().slice(0, 10);
    p.innerHTML = `<header><b>Flèches Daily · ${esc(NOMS[id] || actif)}</b><button type="button" data-fermer aria-label="Fermer">✕</button></header>
      ${E.raison ? `<p class="tp-doux">${esc(E.raison)}</p>` : ''}
      <p class="tp-doux">Flèche <b class="tp-b">rouge ▼</b> au-dessus de la mèche d’un sommet, <b class="tp-h">verte ▲</b> sous la mèche d’un creux : seulement les grands mouvements du Daily. Un sommet (creux) est confirmé quand le prix a reculé (remonté) d’au moins ${esc(String(multActif(id, E.reglages)).replace('.', ','))} × l’ATR 14 Daily, avec au moins 5 bougies Daily entre deux flèches et une alternance stricte. La flèche est posée sur la bougie extrême, ne bouge plus et ne disparaît plus. <b>Pleine</b> = dans le sens de la tendance (creux au-dessus de la MA200 Daily, sommet en dessous), <b>pâle</b> = contre la tendance. Sur H4, elle est posée sur la bougie H4 du plus haut / plus bas exact de la journée ; aucune flèche sur H1.</p>
      <h4>Réglages</h4>${reglagesHtml()}
      <h4>Dernières flèches</h4>${L.length ? `<ul class="tp-sigs">${L.map(f => `<li class="${f.dir > 0 ? 'tp-h' : 'tp-b'}"><b>${f.dir > 0 ? '▲ creux' : '▼ sommet'} ${f.pleine ? '(dans le sens de la tendance)' : '(contre la tendance)'}</b> <span>${esc(dateJour(f.t))} · vers ${nf(f.niveau, f.niveau >= 100 ? 0 : 2)}</span><small>confirmé le ${esc(dateJour(f.tCloture - 1))}</small></li>`).join('')}</ul>` : '<p class="tp-doux">Aucune flèche pour le moment.</p>'}
      <h4>Alertes</h4><label class="tp-case"><input type="checkbox" data-al="telegram"${att.telegram !== false ? ' checked' : ''}> Telegram (pont du Worker de Rayle)</label><p class="tp-doux">À chaque nouvelle flèche confirmée : une seule annonce de Rayle (« ${esc(phraseFleche(NOMS[id] || actif, { dir: -1, niveau: 2650 }))} »), une notification et un message Telegram. Une flèche n’est annoncée qu’une fois. Aucun autre signal.</p>`;
  }
  function ouvrirPanneau(o) {
    if (!E.panneau) { E.panneau = document.createElement('aside'); E.panneau.className = 'tp-panneau'; E.panneau.setAttribute('aria-label', 'Flèches Daily'); document.body.appendChild(E.panneau); E.panneau.addEventListener('click', ev => { if (ev.target.closest('[data-fermer]')) ouvrirPanneau(false); });
      E.panneau.addEventListener('change', ev => { const c = ev.target.closest('[data-al]'); if (c) { const a = lire(LS.alerte, {}); a[c.dataset.al] = c.checked; ecrire(LS.alerte, a); } }); }
    if (o && E.donnees && !E.donnees.hidden) ouvrirDonnees(false); E.panneau.hidden = !o; bHJ.setAttribute('aria-expanded', String(!!o)); document.documentElement.classList.toggle('tp-panneau-ouvert', !!o); if (o) rendrePanneau();
  }
  bHJ.addEventListener('click', () => ouvrirPanneau(!(E.panneau && !E.panneau.hidden)));

  /* ───── panneau « Données » : score de marché, tendance / RSI / MA200 (H1, H4, Jour), volume net USD, données pro (même module que Marchés > Actifs) ───── */
  function ouvrirDonnees(o) {
    if (!id) return;
    if (!E.donnees) { E.donnees = document.createElement('aside'); E.donnees.className = 'tp-panneau tp-donnees'; E.donnees.setAttribute('aria-label', 'Données de marché'); E.donnees.hidden = true; E.donnees.innerHTML = '<header><b>Données · ' + esc(NOMS[id] || actif) + '</b><button type="button" data-fermer aria-label="Fermer">✕</button></header><div data-dash-zone></div>'; document.body.appendChild(E.donnees); E.donnees.addEventListener('click', ev => { if (ev.target.closest('[data-fermer]')) ouvrirDonnees(false); }); }
    E.donnees.hidden = !o; bDon.setAttribute('aria-expanded', String(!!o)); document.documentElement.classList.toggle('tp-panneau-ouvert', !!o || !!(E.panneau && !E.panneau.hidden));
    if (o) { ouvrirPanneau(false); if (!E.dash) E.dash = monterDashboard(E.donnees.querySelector('[data-dash-zone]'), id, { prixRef: () => (window.__tpPrixRef && Number.isFinite(window.__tpPrixRef.prix) ? window.__tpPrixRef.prix : null), parler }); }
    else if (E.dash) { E.dash.detruire(); E.dash = null; E.donnees.querySelector('[data-dash-zone]').innerHTML = ''; }
  }
  bDon.addEventListener('click', () => ouvrirDonnees(!(E.donnees && !E.donnees.hidden)));

  /* ───── cycle ───── */
  await charger(); majSpot(); const spot = setInterval(majSpot, 30000);
  const suivi = setInterval(() => dessiner(), 1500), maj = setInterval(() => { if (!document.hidden) charger(); }, 120000);
  window.addEventListener('pagehide', () => { clearInterval(suivi); clearInterval(maj); clearInterval(spot); });
  return { charger, majSpot, dessiner: () => dessiner(true), fleches: () => E.fleches.slice(), marqueurs: () => (E.M || []).map(m => ({ ...m })), maPoints: () => (E.series.ma ? E.series.ma.data() : []), maInfo: () => (E.ma ? { ...E.ma } : null), reglages: () => JSON.parse(JSON.stringify(E.reglages)), niveaux: () => (E.niveaux || []).map(n => ({ nom: n.nom, src: n.src, cote: n.cote, prix: n.prix, y: graph.serie().priceToCoordinate(n.prix) })), etat: () => ({ id, details: E.details, niveaux: E.lignes.length, fleches: E.fleches.length, marques: E.marques || 0, ma: Object.keys(E.series) }), ouvrirPanneau, ouvrirDonnees, dashboard: () => E.dash, appliquerDetails };
}
