/* ═════════════ TERMINAL « PRO » : branché sur le terminal existant (agent-trading/front/or.html) sans le réécrire ═════════════
   Ajoute : UNE seule moyenne mobile par graphique (MA200 H4 sur H4 et sur H1, MA200 Jour sur Jour) et les FLÈCHES de suivi de tendance posées SUR LA BOUGIE DE CONFIRMATION :
   cassure (clôture de l'autre côté de la MA200 avec 0,3 ATR de marge) et rebond sur la MA200 dans le sens de la tendance ; fond du graphique vert (tendance haussière) ou rouge (baissière) ;
   alerte vocale de Rayle + Telegram à chaque flèche (H4 et Jour). Un bouton « MA200 » (réglages, liste, alertes), un bouton « Données » (score, volume net) et un bouton « Détails ». Lecture seule : aucun ordre n'est envoyé. */
import { lireActifPro } from '../commun/donnees.js';
import { alertesParWorker } from '../commun/ui.js';
import { histoLong, phraseEcart } from './histo-long.js';
import { niveauxHistoriques } from './niveaux-historiques.js';
import { parler } from '../../agent-trading/front/or/tableau-or.js';
import { NOM_UNITE, PAS_UNITE } from '../commun/lecture-unite.js';
import { indexSurUnite, styleFleche, phraseFleche, typeLibelle, typeNom, ma200PourBougies, sensPourBougies, COULEURS, PAS, NOM_UNITE as NOM_U } from './ma200-h4.js';
import { analyseDe, nouvellesFleches, lireReglages, ecrireReglages, lireRegistre } from './fleches-registre.js';
import { monterDashboard } from '../commun/dashboard.js';
import { VERSION } from './version.js';
import { noterPrix, controlerCoherence } from '../commun/incidents-donnees.js';
import { monterDessins } from './dessins-ui.js';
import { monterAides } from './aides-ui.js';
import { chargerStats, phraseHistorique, typeStat, panneauHtml, chargerHonnetes, honnetesHtml } from './stats-ui.js';
import { noterPrise } from '../portefeuille/journal-stockage.js';
import { SETUPS, NOM_SETUP } from '../portefeuille/journal-setups.js';
import { CONTRATS_XTB } from './aides.js';
import { contexteEvenement, libelleContexte } from './contexte.js';
import { barresDaily } from './fleches-registre.js';

const ID_PRO = { OR: 'or', NASDAQ: 'us100', SP500: 'us500', BTC: 'btc', SOL: 'sol', DOGE: 'doge' };
const NOMS = { or: 'Or', us100: 'Nasdaq 100', us500: 'S&P 500', btc: 'Bitcoin', sol: 'Solana', doge: 'Dogecoin' };
const LS = { details: 'rayle_tp_details', avant: 'rayle_tp_couches_avant', alerte: 'rayle_tp_fleches_alertes' };
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage refusé */ } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v, d = 2) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ') : '—');
const dateJour = t => new Date(t).toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const COULEURS_UI = { ma: '#f1d34f', hausse: '#5fb894', baisse: '#d86a6a' }, COULEURS_FOND = COULEURS.fond;

export async function monterPro(T) {
  window.__tpVersion = VERSION;   // or.html compare ce numéro à la version publiée et force la mise à jour si le code chargé n'est pas le bon
  const actif = (document.body.dataset.actif || 'OR'), id = ID_PRO[actif], tactile = document.documentElement.classList.contains('tm-tactile'), barre = tactile ? document.querySelector('.tt-periodes') : document.querySelector('.tor-periodes') || document.querySelector('.tt-periodes');
  document.documentElement.classList.add('tp-terminal'); document.documentElement.classList.toggle('tp-details', lire(LS.details, false) === true);
  const E = { statsData: null, statsActif: id, statsUnite: 'H4', id, D: null, fleches: [], reglages: lireReglages(), series: {}, lignes: [], marqueurs: null, cle: '', panneau: null, details: lire(LS.details, false) === true, seq: 0 };
  /* ───── boutons ───── */
  const bDet = document.createElement('button'); bDet.type = 'button'; bDet.className = 'tp-b-details'; bDet.textContent = 'Détails'; bDet.setAttribute('aria-pressed', String(E.details)); bDet.title = 'Afficher tous les calques, bandeaux et sources du terminal';
  const bHJ = document.createElement('button'); bHJ.type = 'button'; bHJ.className = 'tp-b-hj'; bHJ.textContent = 'MA200'; bHJ.title = 'cassures de la MA200 H4 : flèches, réglage et alertes'; bHJ.setAttribute('aria-expanded', 'false');
  const bStats = document.createElement('button'); bStats.type = 'button'; bStats.className = 'tp-b-donnees tp-b-stats'; bStats.textContent = 'Stats'; bStats.title = 'Statistiques de chaque type de flèche (taux de réussite, R médian, nombre de cas)'; bStats.setAttribute('aria-expanded', 'false');
  const bDon = document.createElement('button'); bDon.type = 'button'; bDon.className = 'tp-b-donnees'; bDon.textContent = 'Données'; bDon.title = 'Score de marché, tendance, volume net, données pro'; bDon.setAttribute('aria-expanded', 'false');
  /* PC : à la suite des unités de temps ; tactile : sur une ligne à part sous les unités de temps (la grille de 5 colonnes du mode tactile ne les accueille pas) */
  if (tactile || (barre && barre.classList.contains('tt-periodes'))) { const ligne = document.createElement('div'); ligne.className = 'tp-ligne-boutons'; ligne.append(bHJ, bDon, bStats, bDet); E.ligneTactile = ligne; } else if (barre) { barre.appendChild(bHJ); barre.appendChild(bDon); barre.appendChild(bStats); barre.appendChild(bDet); } else document.body.append(bHJ, bDon, bStats, bDet);
  const attendreGraphique = async () => { for (let i = 0; i < 200; i++) { const g = T.graph; if (g && g.chart && g.chart() && g.serie && g.serie() && T.moteur) return g; await new Promise(r => setTimeout(r, 250)); } return null; };
  const graph = await attendreGraphique(); if (!graph) return null;
  const LW = window.LightweightCharts;
  /* v4.1 : étirer le graphique dans tous les sens (axes, Ctrl + molette, pincement, double appui, Auto, Log) */
  try { const LOGK = 'rayle_tp_log_' + id, m = await import('../commun/echelles.js'); E.ech = m.creerEchelles({ chart: graph.chart(), serie: graph.serie(), hote: graph.conteneur(), LW, boutonLog: true, journalInitial: lire(LOGK, false) === true, surChange: ev => { if (ev && ev.log !== undefined) ecrire(LOGK, ev.log); } }); } catch (e) { console.warn('[tp] échelles indisponibles :', e && e.message || e); }
  if (E.ligneTactile) (graph.conteneur() || document.body).appendChild(E.ligneTactile);   // tactile : sur le graphique, sous la légende des MA200

  /* ───── v4 : sélecteur « Classique | Volume » en haut à droite. Le mode Classique reste strictement inchangé ; le mode Volume est un terminal complet (trader-pro/volume/), chargé à la première ouverture. ───── */
  const MODE = 'rayle_tp_mode', VOL_DE_ACTIF = { OR: 'or', NASDAQ: 'us100', SP500: 'us500', BTC: 'btc', SOL: 'sol', EURUSD: 'eurusd', DXY: 'dxy', USDCHF: 'usdchf' };
  /* v7 : le dernier prix du Classique est noté (échelle d'affichage retirée) ; le contrôle de cohérence compare toutes les surfaces à 0,5 % près */
  /* v7 : le Classique affiche l'indice au comptant (comme XTB) ; en petit, l'écart réel avec les futures (NQ, ES) */
  { const cible = { NASDAQ: 'us100', SP500: 'us500' }[actif]; if (cible) import('../volume/volume-donnees.js').then(m => { const poser = async () => { try { const e = await m.ecartFutures(cible), el = document.querySelector('[data-or-var]'); if (!e || !el) return; let x = document.querySelector('[data-tp-ecart]'); if (!x) { x = document.createElement('small'); x.setAttribute('data-tp-ecart', ''); x.className = 'tor-var'; x.style.cssText = 'opacity:.7;margin-left:8px;font-size:.8em'; el.after(x); } x.textContent = m.texteEcart(e, v => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })); } catch (err) { /* écart non affiché */ } }; poser(); setInterval(poser, 5 * 60e3); }).catch(() => {}); }
  { const ECH = { DXY: 100, EURUSD: 10000, USDCHF: 10000 }; const noter = () => { try { if (document.hidden) return; const d = graph.serie().data(), b = d && d[d.length - 1]; const v = b ? (b.close != null ? b.close : b.value) : null; if (Number.isFinite(v)) noterPrix(actif, 'classique', v / (ECH[actif] || 1)); controlerCoherence(); } catch (e) { /* graphique vide */ } }; setTimeout(noter, 8000); setInterval(noter, 30000); }
  /* v7 : UN SEUL sélecteur d'actif et d'unité, celui du Classique (barre du haut) ; le mode Volume les lit, il n'a plus les siens */
  const uniteClassique = () => { const b = document.querySelector('[data-periode][aria-pressed="true"]'); const p = b && b.dataset.periode; return p === 'H1' || p === 'H4' || p === 'J' ? p : null; };
  (function selecteurMode() {
    const teteBrute = document.querySelector('.tor-tete'), teteVisible = !!(teteBrute && teteBrute.getBoundingClientRect().width > 0 && getComputedStyle(teteBrute).display !== 'none'), tete = teteVisible ? teteBrute : null, sel = document.createElement('div'); sel.className = 'tp-mode'; sel.setAttribute('role', 'group'); sel.setAttribute('aria-label', 'Mode du terminal');
    sel.innerHTML = '<button type="button" data-mode="classique" aria-pressed="true">Classique</button><button type="button" data-mode="volume" aria-pressed="false">Volume</button>';
    if (tete) tete.appendChild(sel); else { sel.classList.add('tp-mode-flottant'); (graph.conteneur() || document.body).appendChild(sel); }
    let ctrl = null, charge = null;
    const uniteVolume = () => 'H4';   // le mode Volume s'ouvre en H4 (puis garde le dernier choix de l'utilisateur)
    const css = () => { if (!document.querySelector('link[data-tpv]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../volume/volume.css', import.meta.url).href; l.dataset.tpv = '1'; document.head.appendChild(l); } };
    const assurer = async () => { if (ctrl) return ctrl; css(); charge = charge || import('../volume/volume-ui.js').then(m => m.monterVolume({ racine: document.body, T, parler, surClassique: () => aller('classique'), idDefaut: VOL_DE_ACTIF[actif] || 'or', unite0: uniteVolume() })); ctrl = await charge; return ctrl; };
    const placerHaut = () => { const h = tete ? tete.getBoundingClientRect().bottom : (graph.conteneur() ? graph.conteneur().getBoundingClientRect().top : 56); document.documentElement.style.setProperty('--tpv-haut', Math.max(0, Math.round(h)) + 'px'); };
    const maj = m => { sel.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m))); };
    async function aller(m, o = {}) {
      ecrire(MODE, m); maj(m);
      if (m === 'volume') { placerHaut(); try { const c = await assurer(); c.ouvrir(true, { actif: o.actif || VOL_DE_ACTIF[actif], unite: o.unite || uniteClassique() }); for (const ms of [800, 2500, 5000]) setTimeout(() => { const u = uniteClassique(); if (ctrl && ctrl.estOuvert() && u && ctrl.etat().unite !== u) ctrl.definir({ unite: u }); }, ms); /* le Classique applique sa période juste après le montage : on se recale dessus */ } catch (e) { maj('classique'); ecrire(MODE, 'classique'); console.warn('[tp] mode Volume indisponible :', e && e.message || e); } }
      else if (ctrl) ctrl.fermer();
    }
    sel.addEventListener('click', ev => { const b = ev.target.closest('[data-mode]'); if (b) aller(b.dataset.mode); });
    window.addEventListener('resize', () => { if (ctrl && ctrl.estOuvert()) placerHaut(); });
    /* l'unité du Classique pilote le Volume (un toucher sur H1 / H4 / Jour de la barre du haut) */
    document.addEventListener('click', ev => { if (!ctrl || !ctrl.estOuvert() || !ev.target.closest('[data-periode],[data-tt-periode]')) return; setTimeout(() => { const u = uniteClassique(); if (u && ctrl.etat().unite !== u) ctrl.definir({ unite: u }); }, 60); });
    window.__tpVolume = { appel: (n, ...x) => (ctrl && typeof ctrl[n] === 'function' ? ctrl[n](...x) : null), barres: () => (ctrl ? ctrl.barres() : []), controle: () => (ctrl ? ctrl.controle() : null), ouvrirMode: o => aller('volume', o || {}), fermerMode: () => aller('classique'), attendre: async () => { for (let k = 0; k < 60; k++) { const e = ctrl && ctrl.etat(); if (e && (e.charge || e.erreur)) return; await new Promise(r => setTimeout(r, 250)); } }, analyse: () => (ctrl ? ctrl.analyse() : ''), ancrer: () => (ctrl ? ctrl.ancrer() : ''), pocsNus: () => (ctrl ? ctrl.pocsNus() : ''), etat: () => (ctrl ? ctrl.etat() : null), zoomer: (...x) => (ctrl ? ctrl.zoomer(...x) : false), reaction: () => (ctrl ? ctrl.reaction() : ''), definir: o => (ctrl ? ctrl.definir(o) : null), definirOpt: (k, v) => (ctrl ? ctrl.definirOpt(k, v) : null), echelle: () => (ctrl && ctrl.echelle ? ctrl.echelle() : null), echelleAuto: () => (ctrl ? ctrl.echelleAuto() : null), echelleV: (...x) => (ctrl ? ctrl.echelleV(...x) : null), classique: () => ({ echelle: E.ech ? E.ech.etat() : null, auto: () => (E.ech ? E.ech.auto() : null), zoomerV: (f, y) => (E.ech ? E.ech.zoomerV(f, y) : null) }) };
    if (lire(MODE, 'classique') === 'volume') aller('volume');
  })();

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
  function ligneMA(titre) { if (!E.series.ma) E.series.ma = graph.chart().addSeries(LW.LineSeries, { color: COULEURS_UI.ma, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null }); E.series.ma.applyOptions({ title: titre }); return E.series.ma; }
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
    const u = uniteAffichee(), su = srcUnite(u), AU = E.A && E.A[su], cle = `${u}|${B.length}|${B[B.length - 1].t}|${AU ? AU.B.length : 0}`;
    if (force || cle !== E.cle) {
      E.cle = cle;
      /* la MA200 de l'unité d'analyse (H4 sur H1 et H4, Jour sur Jour) : la valeur connue à la clôture de chaque bougie affichée */
      const m = new Map(); let derniere = null;
      if (AU && AU.M && AU.B) { const v = ma200PourBougies(B, AU.B, AU.M, PAS_UNITE[u], PAS[su]); B.forEach((b, i) => { const t = temps(b.t); if (t != null && Number.isFinite(v[i])) m.set(t, v[i]); }); for (let k = AU.M.length - 1; k >= 0; k--) if (AU.M[k] != null) { derniere = AU.M[k]; break; } }
      ligneMA('MA200 ' + NOM_U[su]).setData([...m.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value })));
      E.ma = { unite: su, source: 'bougies ' + NOM_U[su] + ' clôturées', derniere };
      legendeMA(B, u); if (!m.size && AU && AU.M && AU.M.some(x => x != null)) E.cle = null;   // le graphique n'a pas encore placé ses bougies dans le temps : on recommence au passage suivant
    }
    poserFleches(B, u); poserNiveauxHist(u);
  }
  /* v4 : niveaux historiques majeurs (plus haut historique, plus hauts / bas annuels, zones de réaction sur 10 ans) en lignes fines pointillées avec une étiquette courte.
     Activés par défaut en Daily ; en H4 et H1 seulement si « partout » est coché dans les réglages. */
  const ECHELLE_AFFICHAGE = { eurusd: 10000 };
  function poserNiveauxHist(u) {
    try {
      const s = graph.serie(), actif = E.reglages.niveauxHist !== false && (u === 'J' || E.reglages.niveauxPartout === true), J = E.D ? barresDaily(id, E.D.j) : [];
      const cle = [u, actif, J.length, J.length ? J[J.length - 1].t : 0, E.longN ? 1 : 0].join('|'); if (cle === E.cleNivHist) return; E.cleNivHist = cle;
      for (const l of E.lignesHist || []) { try { s.removePriceLine(l); } catch (e) { /* déjà retirée */ } } E.lignesHist = [];
      if (!actif || !J.length) { E.nivHist = []; return; }
      const R = niveauxHistoriques(J, { echelle: ECHELLE_AFFICHAGE[id] || 1 }); E.nivHist = R.niveaux;
      for (const n of R.niveaux) E.lignesHist.push(s.createPriceLine({ price: n.prix, color: n.type === 'zone' ? 'rgba(201,178,122,.55)' : n.type === 'ath' ? 'rgba(143,208,227,.6)' : 'rgba(150,165,175,.5)', lineWidth: 1, lineStyle: 3, axisLabelVisible: false, title: n.etiquette }));
    } catch (e) { /* les niveaux historiques ne doivent jamais casser le graphique */ }
  }
  const srcUnite = u => (u === 'J' ? 'J' : 'H4');   // unité d'analyse : le Jour a sa MA200 Jour, H4 et H1 utilisent la MA200 H4
  /* flèches de l'unité d'analyse (H4 sur H1 et H4, Jour sur Jour), posées sur la bougie de confirmation ; petite flèche verte ▲ sous la bougie (achat), rouge ▼ au-dessus (vente), sans texte. */
  function poserFleches(B, u) {
    const su = srcUnite(u), actives = E.reglages.actif !== false, cle = [u, B.length, B[B.length - 1].t, E.fleches.length, actives, E.reglages.fondTend === true, E.A && E.A[su] ? E.A[su].sens.length : 0, E.dess ? E.dess.cle() : ''].join('|'); if (cle === E.cleFleches) return; E.cleFleches = cle;
    const M = [], vus = new Set(), infos = new Map(), pas = PAS_UNITE[u];
    if (actives) for (const f of E.fleches.filter(f => (f.unite || 'H4') === su)) {
      const k = indexSurUnite(B, f, pas); if (k < 0) continue; const t = temps(B[k].t); if (t == null) { E.cleFleches = null; continue; } const cl = t + '|' + f.dir; if (vus.has(cl)) continue; vus.add(cl);
      const s = styleFleche(f); M.push({ time: t, position: s.position, color: s.couleur, shape: s.forme, size: s.taille * (tactile ? 1.25 : 1) });
      infos.set(t, { f, haut: f.dir < 0, texte: texteFleche(f) });
    }
    /* flèches des niveaux tracés à la main (rebond, cassure, retest) : même style, posées à la clôture de la bougie de confirmation */
    if (E.dess) for (const m of E.dess.marqueurs(B, u, indexSurUnite)) { M.push({ time: m.time, position: m.position, color: m.color, shape: m.shape, size: m.size }); const ex = infos.get(m.time); infos.set(m.time, ex ? { ...ex, texte: ex.texte + '\n' + m.texte } : { f: { entree: m.prix }, haut: m.haut, texte: m.texte }); }
    M.sort((a, b) => a.time - b.time); E.marques = M.length; E.M = M; E.infos = infos; E.infoEl && (E.infoEl.style.display = 'none'); infoFleche(); poserFond(B, u, actives);
    if (LW.createSeriesMarkers) { const s = graph.serie(); if (!E.marqueurs) E.marqueurs = LW.createSeriesMarkers(s, M); else E.marqueurs.setMarkers(M); }
  }
  /* fond du graphique : bandes pleine hauteur, très transparentes, selon la tendance MA200 H4 en vigueur (une bande par période de même sens, dessinée DERRIÈRE les bougies par une « primitive » du graphique : continue, sans interstice) */
  function primitiveFond() {
    const o = { segs: [], req: null, chart: graph.chart(), attached(p) { this.req = p.requestUpdate; }, detached() { this.req = null; }, updateAllViews() { /* rien à préparer */ },
      paneViews() { const me = this; return [{ zOrder: () => 'bottom', renderer: () => ({ draw() { /* tout est dans drawBackground */ }, drawBackground(cible) { cible.useBitmapCoordinateSpace(sc => {
        const ts = me.chart.timeScale(), sp = ts.options().barSpacing, hr = sc.horizontalPixelRatio, ctx = sc.context;
        for (const g of me.segs) { const x1 = ts.timeToCoordinate(g.t1), x2 = ts.timeToCoordinate(g.t2); if (x1 == null || x2 == null) continue; const a1 = Math.round((x1 - sp / 2) * hr), a2 = Math.round((x2 + sp / 2) * hr); ctx.fillStyle = g.couleur; ctx.fillRect(a1, 0, a2 - a1, sc.bitmapSize.height); }
      }); } }) }]; } };
    return o;
  }
  function poserFond(B, u, actives) {
    const voulu = actives && E.reglages.fondTend === true && E.A && E.A[srcUnite(u)] && E.A[srcUnite(u)].sens.length > 0;
    try {
      const serie = graph.serie();
      if (!E.fondPrim || E.fondSerie !== serie) { if (E.fondPrim && E.fondSerie) { try { E.fondSerie.detachPrimitive(E.fondPrim); } catch (e) { /* */ } } E.fondPrim = primitiveFond(); E.fondSerie = serie; serie.attachPrimitive(E.fondPrim); }
      if (!voulu) { E.fondPrim.segs = []; E.fondN = 0; E.fondSens = null; E.fondPrim.req && E.fondPrim.req(); return; }
      const sens = sensPourBougies(B, E.A[srcUnite(u)].sens, PAS_UNITE[u]), segs = []; let cur = null, n = 0;
      B.forEach((b, i) => { const t = temps(b.t); if (t == null) return; n++; const x = sens[i] || 0; if (cur && cur.sens === x) cur.t2 = t; else { cur = { sens: x, t1: t, t2: t, couleur: COULEURS_FOND[x] }; segs.push(cur); } });
      E.fondPrim.segs = segs; E.fondN = n; E.fondSens = sens.length ? sens[sens.length - 1] : 0; E.fondSegs = segs.length; E.fondPrim.req && E.fondPrim.req();
    } catch (e) { console.warn('[tp] fond :', e.message); }
  }
  /* texte de l'info-bulle : type, entrée, stop et gain en R (gain réalisé si la flèche est sortie, sinon gain latent) */
  function texteFleche(f) {
    /* contexte : « contre-tendance » (contraire à la tendance Daily) et « pendant annonce » (dans la bande de 1 h avant / après une annonce majeure) */
    let cx = ''; try { const c = contexteEvenement(E.A, { dir: f.dir, entree: f.entree, tFin: f.tFin, unite: f.unite || 'H4', annonce: E.aides ? E.aides.dansAnnonce(f.tFin) : false }); if (c) { c.ma = null; cx = libelleContexte(c); } } catch (e) { cx = ''; }
    return `${f.dir > 0 ? '▲ Achat' : '▼ Vente'} · ${typeLibelle(f)}\nConfirmée à la clôture ${NOM_U[f.unite || 'H4']} : ${nf(f.entree)}\nMA200 ${NOM_U[f.unite || 'H4']} : ${nf(f.ma200)}${cx ? '\n' + cx : ''}\n${phraseHistorique(E.statsData, id, f.unite || 'H4', typeStat({ source: 'ma200', type: f.type }))}`;
  }
    /* info-bulle : petite, posée À CÔTÉ de la flèche, dans la zone des bougies (jamais sur l'échelle des prix ni en haut à gauche). Elle n'apparaît QUE sur une action de l'utilisateur (survol à la souris, toucher sur téléphone)
     et se referme seule au bout de 6 s : les mises à jour du graphique (nouveau cours, nouvelle bougie) ne la réaffichent JAMAIS (sur téléphone, le curseur reste posé après le toucher et le graphique le signale à chaque cours : l'ancienne info-bulle restait donc affichée en permanence). */
  function infoFleche() {
    if (E.infoOk) return; const c = graph.conteneur(); if (!c) return; E.infoOk = true;
    const el = document.createElement('div'); el.className = 'tp-fleche-info'; el.style.display = 'none'; c.appendChild(el); E.infoEl = el;
    let minuteur = null, cle = null, tPointeur = 0;
    const cacher = () => { clearTimeout(minuteur); minuteur = null; cle = null; el.style.display = 'none'; };
    const montrer = (time, x) => {
      if (cle === time && el.style.display === 'block') return; cle = time; el.textContent = x.texte; el.style.display = 'block';
      try {
        /* la zone utile est le graphique SANS l'échelle des prix (à droite) : l'info-bulle ne la recouvre jamais */
        const ps = (() => { try { return graph.chart().priceScale('right').width() || 0; } catch (e) { return 0; } })(), W = c.clientWidth - ps, Hh = c.clientHeight, cx = graph.chart().timeScale().timeToCoordinate(time);
        el.style.maxWidth = Math.max(120, W - 12) + 'px'; const w = el.offsetWidth, h = el.offsetHeight, py = graph.serie().priceToCoordinate(x.f.entree), bas = Number.isFinite(py) ? py : Hh / 2;
        const gauche = cx - w - 14, droite = cx + 14; let left = cx > W / 2 ? gauche : droite;   // à droite de la flèche si elle est dans la moitié gauche, sinon à gauche
        if (left < 6 || left + w > W - 6) left = gauche >= 6 ? gauche : (droite + w <= W - 6 ? droite : Math.max(6, Math.min(W - w - 6, left)));
        el.style.left = Math.max(6, left) + 'px'; el.style.top = Math.max(tactile ? 96 : 40, Math.min(Hh - h - 30, x.haut ? bas - h - 10 : bas - h / 2)) + 'px';
      } catch (e) { /* position par défaut */ }
      clearTimeout(minuteur); minuteur = setTimeout(cacher, 6000);
    };
    const touche = () => { tPointeur = Date.now(); };
    for (const n of ['pointerdown', 'pointermove', 'touchstart', 'touchmove', 'wheel']) c.addEventListener(n, touche, { passive: true });
    c.addEventListener('pointerleave', cacher);
    const info = p => (p && p.time != null && E.infos ? E.infos.get(p.time) : null);
    graph.chart().subscribeCrosshairMove(p => { if (Date.now() - tPointeur > 600) return; const x = info(p); if (x) montrer(p.time, x); else cacher(); });   // seulement quand le doigt / la souris bouge vraiment
    graph.chart().subscribeClick(p => { const x = info(p); if (x) { tPointeur = Date.now(); montrer(p.time, x); } else cacher(); });
    graph.chart().timeScale().subscribeVisibleLogicalRangeChange(() => { if (Date.now() - tPointeur < 600) cacher(); });   // défilement / zoom par l'utilisateur : on ferme
  }
  /* bandeau du haut : seulement la MA200 de l'unité affichée (valeur + distance du prix en %) */
  /* numéro de version du code, en petit, toujours visible dans la légende du graphique (pendant une mise à jour forcée : « mise à jour → v… ») */
  const versionHtml = () => { const m = window.__majVersion; return `<span class="tp-version" title="Version du code affichée sur ce graphique">${m ? 'mise à jour → v' + esc(m.cible) + '…' : 'v' + esc(VERSION)}</span>`; };
  function legendeMA(B, u) {
    const c = graph.conteneur(); if (!c) return; let el = c.querySelector('.tp-ma-legende'); if (!el) { el = document.createElement('div'); el.className = 'tp-ma-legende'; c.appendChild(el); }
    const su = srcUnite(u), nom = 'MA200 ' + NOM_U[su], v = E.ma && Number.isFinite(E.ma.derniere) ? E.ma.derniere : null, px = prixRef(B), dist = v ? (px / v - 1) * 100 : null, S = E.A && E.A[su] && E.A[su].sens, ten = S && S.length ? S[S.length - 1].sens : null;
    el.innerHTML = (v ? `<span style="color:${COULEURS_UI.ma}">${nom} ${nf(v, 0)} · prix ${nf(Math.abs(dist), 1)} % ${dist >= 0 ? 'au-dessus' : 'sous'} · tendance ${ten === 1 ? 'haussière' : ten === -1 ? 'baissière' : 'neutre'}</span>` : `<span style="color:${COULEURS_UI.ma}">${nom} : indisponible (moins de 200 bougies)</span>`) + versionHtml();
    el.title = 'Moyenne mobile simple sur 200 clôtures ' + NOM_U[su] + (u === 'H1' ? ' (sur H1 : la MA200 H4)' : '') + ' ; distance calculée avec le prix de référence de l’appli';
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
    if (!id) { E.raison = 'Les flèches MA200 sont disponibles pour l’or, le Nasdaq 100, le S&P 500, le Bitcoin et Solana.'; rendrePanneau(); return; }
    const n = ++E.seq;
    try { const r = await lireActifPro(id, { delai: 8000 }); if (n !== E.seq) return; E.D = r.donnees; E.meta = r; E.raison = null; E.A = analyseDe(id, E.D); E.fleches = E.A.reg; }
    catch (e) { E.raison = 'Données H4 / Jour indisponibles : ' + (e && e.message || e) + ' (le robot publie ces séries toutes les 30 minutes). Les flèches déjà confirmées restent affichées.'; E.A = null; try { E.fleches = lireRegistre(id); } catch (e2) { /* aucune */ } }
    E.cleFleches = null; dessiner(true); rendrePanneau(); alerter(); if (E.dess) E.dess.evaluer(true);
    enrichirLong(n);
  }
  /* v4 : la MA200 et ses flèches sont recalculées sur l'historique COMPLET (Daily jusqu'à 40 ans, H4 8 ans) : l'historique long (recalé sur le cours direct) est ajouté AVANT l'instantané.
     Les flèches plus anciennes que 36 h ne sont jamais annoncées (nouvellesFleches) : aucune alerte pour le passé. */
  async function enrichirLong(n) {
    if (!id || !E.D || E.D.__long) return;
    try {
      const ajoutees = {}, desc = {};
      for (const [u, cle, nb] of [['J', 'j', 40], ['H4', 'h4', 8], ['H1', 'h1', 3]]) {
        const arr = E.D[cle] || []; if (!arr.length) continue;
        desc[u] = await histoLong.description(id, u).catch(() => null);
        if (u === 'H1') continue;                         // le H1 n'entre pas dans l'analyse MA200 (H4 et Jour) : seulement sa description
        const L = await histoLong.avant(id, u, arr[0].t, nb); if (!L.bougies.length) continue;
        E.D[cle] = L.bougies.map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })).concat(arr); ajoutees[u] = L.bougies.length;
      }
      if (n !== E.seq) return; E.longDesc = desc; E.D.__long = true;
      if (Object.keys(ajoutees).length) { E.longN = ajoutees; E.A = analyseDe(id, E.D); E.fleches = E.A.reg; E.cleFleches = null; dessiner(true); }
      rendrePanneau();
    } catch (e) { E.longErreur = String(e && e.message || e).slice(0, 120); rendrePanneau(); }
  }
  window.RayleRaccordTexte = () => { const d = E.longDesc && E.longDesc[uniteAffichee()]; return d ? phraseEcart(d) : ''; };
  /* alertes : SEULEMENT les nouvelles flèches confirmées (H4 et Jour) : UNE annonce vocale de Rayle (« Or : cassure MA200 H4 à la hausse », « Or : rebond MA200 Jour à l'achat ») + une notification + un message Telegram (pont du Worker existant).
     Une flèche n'est annoncée qu'une fois (registre de l'appareil : vueLe), et jamais si elle date de plus de 36 h. Interrupteur « Flèches » coupé : aucune annonce. */
  function alerter() {
    if (E.reglages.actif === false || !E.fleches.length) return; const att = lire(LS.alerte, {}), nouvelles = nouvellesFleches(id, E.fleches);
    for (const f of nouvelles.slice(0, 2)) { const texte = phraseFleche(NOMS[id], f); parler(texte); try { if (T.notifier) T.notifier(texte, { niveau: 'info', dit: false, raison: 'flèche MA200' }); } catch (e) { /* */ } try { if (att.telegram !== false && T.envoyerTelegram && !alertesParWorker()) T.envoyerTelegram(`${texte} · lecture seule, aucun ordre`); } catch (e) { /* */ } }
  }

  /* ───── panneau « MA200 H4 » ───── */
  /* réglages : interrupteur « Flèches » (même bloc dans le panneau et dans « Affichage » du terminal) */
  function reglagesHtml() {
    const R = E.reglages;
    return `<div class="tp-reg" data-tp-reg><label class="tp-case"><input type="checkbox" data-reg="actif"${R.actif !== false ? ' checked' : ''}> Flèches MA200 (cassures et rebonds)</label>
      <label class="tp-case"><input type="checkbox" data-reg="niveauxHist"${R.niveauxHist !== false ? ' checked' : ''}> Niveaux historiques majeurs (plus hauts / bas annuels, zones sur 10 ans ; Daily)</label>
      <label class="tp-case"><input type="checkbox" data-reg="fondTend"${R.fondTend === true ? ' checked' : ''}> Colorier le fond selon la tendance MA200 (désactivé par défaut)</label></div>`;
  }
    function appliquerReglage(el) {
    const R = E.reglages; if (el.dataset.reg === 'actif') R.actif = el.checked; else if (el.dataset.reg === 'fondTend') R.fondTend = el.checked; else if (el.dataset.reg === 'niveauxHist') { R.niveauxHist = el.checked; E.cleNivHist = null; }
    ecrireReglages(R); majFleches();
  }
  /* recalcule les flèches, redessine et synchronise les deux blocs de réglages */
  function majFleches() {
    if (E.D) { try { E.A = analyseDe(id, E.D); E.fleches = E.A.reg; } catch (e) { E.A = null; E.fleches = []; } } else { E.A = null; try { E.fleches = lireRegistre(id); } catch (e) { E.fleches = []; } }
    E.cleFleches = null; dessiner(true); rendrePanneau(); synchroReglages(); alerter();
  }
  const zonesReglages = () => [...document.querySelectorAll('[data-tp-reg]')];
  function synchroReglages() { for (const z of zonesReglages()) for (const k of ['actif', 'fondTend', 'niveauxHist']) { const c = z.querySelector('[data-reg="' + k + '"]'); if (c) c.checked = k === 'fondTend' ? E.reglages[k] === true : E.reglages[k] !== false; } }
  document.addEventListener('change', ev => { const el = ev.target.closest && ev.target.closest('[data-reg]'); if (el && el.closest('[data-tp-reg]')) appliquerReglage(el); });
  /* « Affichage » du terminal : le même bloc de réglages (s'il existe) */
  (function dansAffichage() { const pan = document.querySelector('.tor-ob-pan'); if (!pan || pan.querySelector('[data-tp-reg]')) return; const d = document.createElement('div'); d.innerHTML = reglagesHtml(); pan.insertBefore(d.firstElementChild, pan.querySelector('hr') || pan.firstChild); })();
  function rendrePanneau() {
    const p = E.panneau; if (!p) return; const att = lire(LS.alerte, {}), L = E.fleches.slice().reverse().slice(0, 10);
    const ligne = u => { const S = E.A && E.A[u] && E.A[u].sens, t = S && S.length ? S[S.length - 1].sens : null; return `<p>MA200 ${NOM_U[u]} : tendance ${t === 1 ? '<b class="tp-h">haussière</b>' : t === -1 ? '<b class="tp-b">baissière</b>' : '<b>indéterminée</b>'}</p>`; };
    p.innerHTML = `<header><b>MA200 · ${esc(NOMS[id] || actif)}</b><button type="button" data-fermer aria-label="Fermer">✕</button></header>
      ${E.raison ? `<p class="tp-doux">${esc(E.raison)}</p>` : ''}
      ${ligne('H4')}${ligne('J')}
      <p class="tp-doux">Chaque unité a sa MA200 (H4 sur H4 et H1, Jour sur Jour). <b>Cassure</b> : une bougie clôture de l’autre côté de la MA200 avec au moins 0,3 ATR de marge, la tendance change. <b>Rebond</b> : dans le sens de la tendance, le prix revient toucher la MA200 et la bougie clôture du bon côté ; une seule flèche par retour (le prix doit s’éloigner d’au moins 1 ATR avant la suivante). Jamais de flèche contre la tendance. <b class="tp-h">Verte ▲</b> = achat, <b class="tp-b">rouge ▼</b> = vente, posées sur la bougie de confirmation. Le coloriage du fond selon la tendance est une option (désactivée par défaut) dans les réglages ci-dessous.</p>
      <h4>Historique long</h4>${['J', 'H4', 'H1'].map(u => E.longDesc && E.longDesc[u] ? `<p class="tp-doux"><b>${NOM_U[u] || u}</b> : ${esc(phraseEcart(E.longDesc[u]))}</p>` : '').join('') || `<p class="tp-doux">${E.longErreur ? 'Historique long indisponible : ' + esc(E.longErreur) : 'Historique long : chargement…'}</p>`}${E.longN ? `<p class="tp-doux">La MA200 et ses flèches sont calculées sur ${Object.entries(E.longN).map(([u, n]) => nf(n, 0) + ' bougies ' + (NOM_U[u] || u) + ' de plus').join(', ')} (historique complet).</p>` : ''}
      <h4>Réglages</h4>${reglagesHtml()}
      <h4>Dernières flèches</h4>${L.length ? `<ul class="tp-sigs">${L.map(f => `<li class="${f.dir > 0 ? 'tp-h' : 'tp-b'}"><b>${f.dir > 0 ? '▲ achat' : '▼ vente'} · ${NOM_U[f.unite || 'H4']}</b> <span>${esc(dateJour(f.t))} · clôture ${nf(f.entree, f.entree >= 100 ? 0 : 2)}</span><small>${esc(typeLibelle(f))}</small></li>`).join('')}</ul>` : '<p class="tp-doux">Aucune flèche pour le moment.</p>'}
      <h4>Alertes</h4><label class="tp-case"><input type="checkbox" data-al="telegram"${att.telegram !== false ? ' checked' : ''}> Telegram (pont du Worker de Rayle)</label><p class="tp-doux">À chaque nouvelle flèche confirmée : une seule annonce de Rayle (« ${esc(phraseFleche(NOMS[id] || actif, { type: 'rebond', unite: 'J', dir: 1 }))} »), une notification et un message Telegram. Une flèche n’est annoncée qu’une fois. Aucun autre signal.</p>`;
  }
  function ouvrirPanneau(o) {
    if (o && E.stats && !E.stats.hidden) { E.stats.hidden = true; bStats.setAttribute('aria-expanded', 'false'); }
    if (!E.panneau) { E.panneau = document.createElement('aside'); E.panneau.className = 'tp-panneau'; E.panneau.setAttribute('aria-label', 'MA200 H4'); document.body.appendChild(E.panneau); E.panneau.addEventListener('click', ev => { if (ev.target.closest('[data-fermer]')) ouvrirPanneau(false); });
      E.panneau.addEventListener('change', ev => { const c = ev.target.closest('[data-al]'); if (c) { const a = lire(LS.alerte, {}); a[c.dataset.al] = c.checked; ecrire(LS.alerte, a); } }); }
    if (o && E.donnees && !E.donnees.hidden) ouvrirDonnees(false); E.panneau.hidden = !o; bHJ.setAttribute('aria-expanded', String(!!o)); document.documentElement.classList.toggle('tp-panneau-ouvert', !!o); if (o) rendrePanneau();
  }
  bHJ.addEventListener('click', () => ouvrirPanneau(!(E.panneau && !E.panneau.hidden)));

  /* ───── panneau « Données » : score de marché, tendance / RSI / MA200 (H1, H4, Jour), volume net USD, données pro (même module que Marchés > Actifs) ───── */
  function ouvrirDonnees(o) {
    if (o && E.stats && !E.stats.hidden) { E.stats.hidden = true; bStats.setAttribute('aria-expanded', 'false'); }
    if (!id) return;
    if (!E.donnees) { E.donnees = document.createElement('aside'); E.donnees.className = 'tp-panneau tp-donnees'; E.donnees.setAttribute('aria-label', 'Données de marché'); E.donnees.hidden = true; E.donnees.innerHTML = '<header><b>Données · ' + esc(NOMS[id] || actif) + '</b><button type="button" data-fermer aria-label="Fermer">✕</button></header><div data-dash-zone></div>'; document.body.appendChild(E.donnees); E.donnees.addEventListener('click', ev => { if (ev.target.closest('[data-fermer]')) ouvrirDonnees(false); }); }
    E.donnees.hidden = !o; bDon.setAttribute('aria-expanded', String(!!o)); document.documentElement.classList.toggle('tp-panneau-ouvert', !!o || !!(E.panneau && !E.panneau.hidden));
    if (o) { ouvrirPanneau(false); if (!E.dash) E.dash = monterDashboard(E.donnees.querySelector('[data-dash-zone]'), id, { prixRef: () => (window.__tpPrixRef && Number.isFinite(window.__tpPrixRef.prix) ? window.__tpPrixRef.prix : null), parler }); }
    else if (E.dash) { E.dash.detruire(); E.dash = null; E.donnees.querySelector('[data-dash-zone]').innerHTML = ''; }
  }
  bDon.addEventListener('click', () => ouvrirDonnees(!(E.donnees && !E.donnees.hidden)));

  /* ───── niveaux tracés à la main : barre d'outils, dessin, flèches à la clôture (dessins-ui.js) ───── */
  const barresPour = u => { const aff = T.moteur.serie() || []; if (u === uniteAffichee() && aff.length >= 40) return aff; if (!E.D) return []; return u === 'H4' ? E.D.h4 : u === 'J' ? barresDaily(id, E.D.j) : E.D.h1; };
  try {
    E.dess = id ? monterDessins({ id, nomActif: NOMS[id] || actif, graph, LW, tactile, uniteAffichee, barresAffichees: () => T.moteur.serie() || [], barresOrigine: barresPour, analyse: () => E.A, temps, parler, historique: (o, e) => phraseHistorique(E.statsData, id, e.unite, typeStat({ source: 'niveau', type: e.type, niveau: o.type === 'fibo' ? 'fibo' : null })), dansAnnonce: t => !!(E.aides && E.aides.dansAnnonce(t)),
      notifier: (t, o) => { if (T.notifier) T.notifier(t, o); }, telegramActif: () => lire(LS.alerte, {}).telegram !== false, envoyerTelegram: t => { if (T.envoyerTelegram) T.envoyerTelegram(t); } }) : null;
  } catch (e) { console.warn('[tp] dessins :', e && e.message); E.dess = null; }

  /* ───── aides à la décision : régime, voyant d'alignement, annonces, taille de position XTB (aides-ui.js) ───── */
  try {
    E.aides = id ? monterAides({ id, graph, tactile, uniteAffichee, barresAffichees: () => T.moteur.serie() || [], barresJour: () => (E.D ? barresDaily(id, E.D.j) : null), analyse: () => E.A, temps }) : null;
    /* bouton « Je l'ai pris » de l'outil Position : le trade est noté avec son setup et sera rapproché de l'import XTB */
    if (id) T.jeLaiPris = { setups: () => SETUPS, noter: (o, setup) => { const stop = o.stop < o.entree, r = noterPrise({ t: Date.now(), ticker: (CONTRATS_XTB[id] || {}).xtb || id.toUpperCase(), sens: stop ? 'BUY' : 'SELL', prix: o.entree, stop: o.stop, cible: o.objectif, setup, unite: uniteAffichee(), source: 'terminal' }); return r ? { id: r.id, texte: `Noté : ${stop ? 'achat' : 'vente'} ${r.ticker} à ${nf(o.entree, o.entree >= 100 ? 0 : 2)}, setup ${NOM_SETUP[setup]} ${uniteAffichee() === 'J' ? 'Jour' : uniteAffichee()}.` } : null; } };
    if (E.aides) { T.tailleXtb = o => E.aides.tailleXtb(o); T.reglerTailleXtb = (k, v) => E.aides.reglerTaille(k, v); }
  } catch (e) { console.warn('[tp] aides :', e && e.message); E.aides = null; }

  /* ───── panneau « Statistiques » : taux de réussite, espérance et R médian de chaque type de flèche ───── */
  function rendreStats() { if (!E.stats) return; E.stats.innerHTML = panneauHtml(E.statsData, E.statsActif, E.statsUnite) + "<div data-honnetes></div>"; chargerHonnetes().then(H => { const z = E.stats && E.stats.querySelector("[data-honnetes]"); if (z) z.innerHTML = honnetesHtml(H, E.statsActif, E.statsUnite); }); }
  function ouvrirStats(o) {
    if (!E.stats) { E.stats = document.createElement('aside'); E.stats.className = 'tp-panneau tp-stats'; E.stats.setAttribute('aria-label', 'Statistiques des flèches'); E.stats.hidden = true; document.body.appendChild(E.stats);
      E.stats.addEventListener('click', ev => { if (ev.target.closest('[data-fermer]')) { ouvrirStats(false); return; } const a = ev.target.closest('[data-stat-actif]'), u = ev.target.closest('[data-stat-unite]'); if (a) { E.statsActif = a.dataset.statActif; rendreStats(); } if (u) { E.statsUnite = u.dataset.statUnite; rendreStats(); } }); }
    if (o) { ouvrirPanneau(false); ouvrirDonnees(false); }
    E.stats.hidden = !o; bStats.setAttribute('aria-expanded', String(!!o)); document.documentElement.classList.toggle('tp-panneau-ouvert', !!o || !!(E.panneau && !E.panneau.hidden) || !!(E.donnees && !E.donnees.hidden)); if (o) rendreStats();
  }
  bStats.addEventListener('click', () => ouvrirStats(!(E.stats && !E.stats.hidden)));
  chargerStats().then(S => { E.statsData = S; if (S && !S.actifs[E.statsActif]) E.statsActif = 'or'; E.cleFleches = null; dessiner(true); rendreStats(); });

  /* ───── cycle ───── */
  await charger(); majSpot(); const spot = setInterval(majSpot, 30000);
  const suivi = setInterval(() => dessiner(), 1500), maj = setInterval(() => { if (!document.hidden) charger(); }, 120000);
  window.addEventListener('pagehide', () => { clearInterval(suivi); clearInterval(maj); clearInterval(spot); });
  return { dessins: () => E.dess, aides: () => E.aides, stats: () => ({ charge: !!E.statsData, actifs: E.statsData ? Object.keys(E.statsData.actifs) : [], ouvert: !!(E.stats && !E.stats.hidden) }), ouvrirStats, charger, majSpot, dessiner: () => dessiner(true), fleches: () => E.fleches.slice(), sens: () => (E.A && E.A[srcUnite(uniteAffichee())] ? E.A[srcUnite(uniteAffichee())].sens.map(x => ({ ...x })) : []), fond: () => ({ n: E.fondN || 0, segments: E.fondN ? (E.fondSegs || 0) : 0, sens: E.fondSens ?? null }), infos: () => [...(E.infos || new Map()).entries()].map(([t, x]) => ({ time: t, texte: x.texte })), marqueurs: () => (E.M || []).map(m => ({ ...m })), maPoints: () => (E.series.ma ? E.series.ma.data() : []), maInfo: () => (E.ma ? { ...E.ma } : null), reglages: () => JSON.parse(JSON.stringify(E.reglages)), etat: () => ({ id, details: E.details, fleches: E.fleches.length, marques: E.marques || 0, ma: Object.keys(E.series) }), ouvrirPanneau, ouvrirDonnees, dashboard: () => E.dash, appliquerDetails };
}
