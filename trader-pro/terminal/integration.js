/* ═════════════ TERMINAL « PRO » : branché sur le terminal existant (agent-trading/front/or.html) sans le réécrire ═════════════
   Ajoute : UNE seule moyenne mobile, la MA200 H4 (bougies H4 clôturées, tracée sur H1, H4 et Jour) et les FLÈCHES de cassure : 2 clôtures H4 d'affilée de l'autre côté de la MA200 H4 →
   flèche verte d'achat tout en bas du mouvement (sous le plus bas avant la cassure) ou rouge de vente tout en haut ; elles alternent toujours. Alerte vocale de Rayle + Telegram à la cassure validée.
   Rien d'autre sur le graphique. Un bouton « MA200 H4 » (réglage, liste, alertes) et un bouton « Détails ». Lecture seule : aucun ordre n'est envoyé. */
import { lireActifPro } from '../commun/donnees.js';
import { parler } from '../../agent-trading/front/or/tableau-or.js';
import { NOM_UNITE, PAS_UNITE } from '../commun/lecture-unite.js';
import { indexSurUnite, styleFleche, phraseFleche, typeLibelle, typeNom, ma200PourBougies } from './ma200-h4.js';
import { analyseDe, nouvellesFleches, lireReglages, ecrireReglages, lireRegistre } from './fleches-registre.js';
import { monterDashboard } from '../commun/dashboard.js';
import { VERSION } from './version.js';

const ID_PRO = { OR: 'or', NASDAQ: 'us100', SP500: 'us500', BTC: 'btc', SOL: 'sol', DOGE: 'doge' };
const NOMS = { or: 'Or', us100: 'Nasdaq 100', us500: 'S&P 500', btc: 'Bitcoin', sol: 'Solana', doge: 'Dogecoin' };
const LS = { details: 'rayle_tp_details', avant: 'rayle_tp_couches_avant', alerte: 'rayle_tp_fleches_alertes' };
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage refusé */ } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v, d = 2) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ') : '—');
const dateJour = t => new Date(t).toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const COULEURS_UI = { ma: '#f1d34f', hausse: '#5fb894', baisse: '#d86a6a' };

export async function monterPro(T) {
  window.__tpVersion = VERSION;   // or.html compare ce numéro à la version publiée et force la mise à jour si le code chargé n'est pas le bon
  const actif = (document.body.dataset.actif || 'OR'), id = ID_PRO[actif], tactile = document.documentElement.classList.contains('tm-tactile'), barre = tactile ? document.querySelector('.tt-periodes') : document.querySelector('.tor-periodes') || document.querySelector('.tt-periodes');
  document.documentElement.classList.add('tp-terminal'); document.documentElement.classList.toggle('tp-details', lire(LS.details, false) === true);
  const E = { id, D: null, fleches: [], reglages: lireReglages(), series: {}, lignes: [], marqueurs: null, cle: '', panneau: null, details: lire(LS.details, false) === true, seq: 0 };
  /* ───── boutons ───── */
  const bDet = document.createElement('button'); bDet.type = 'button'; bDet.className = 'tp-b-details'; bDet.textContent = 'Détails'; bDet.setAttribute('aria-pressed', String(E.details)); bDet.title = 'Afficher tous les calques, bandeaux et sources du terminal';
  const bHJ = document.createElement('button'); bHJ.type = 'button'; bHJ.className = 'tp-b-hj'; bHJ.textContent = 'MA200 H4'; bHJ.title = 'cassures de la MA200 H4 : flèches, réglage et alertes'; bHJ.setAttribute('aria-expanded', 'false');
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
    const u = uniteAffichee(), A4 = E.A, cle = `${u}|${B.length}|${B[B.length - 1].t}|${A4 ? A4.Bh.length : 0}`;
    if (force || cle !== E.cle) {
      E.cle = cle;
      /* la MA200 H4 (bougies H4 clôturées), sur H1, H4 et Jour : la valeur connue à la clôture de chaque bougie affichée */
      const m = new Map(); let derniere = null;
      if (A4 && A4.M && A4.Bh) { const v = ma200PourBougies(B, A4.Bh, A4.M, PAS_UNITE[u]); B.forEach((b, i) => { const t = temps(b.t); if (t != null && Number.isFinite(v[i])) m.set(t, v[i]); }); for (let k = A4.M.length - 1; k >= 0; k--) if (A4.M[k] != null) { derniere = A4.M[k]; break; } }
      ligneMA('MA200 H4').setData([...m.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value })));
      E.ma = { unite: u, source: 'bougies H4 clôturées', derniere };
      legendeMA(B, u); if (!m.size && A4 && A4.M && A4.M.some(x => x != null)) E.cle = null;   // le graphique n'a pas encore placé ses bougies dans le temps : on recommence au passage suivant
    }
    poserFleches(B, u);
  }
  /* Cassure de la MA200 H4 : flèche verte ▲ (achat) sous le plus bas du mouvement, rouge ▼ (vente) au-dessus du plus haut ; sans texte ; elles alternent. Info-bulle : sens, clôture de confirmation, extrême du mouvement. */
  function poserFleches(B, u) {
    const actives = E.reglages.actif !== false, cle = [u, B.length, B[B.length - 1].t, E.fleches.length, actives, E.A ? E.A.sens.length : 0].join('|'); if (cle === E.cleFleches) return; E.cleFleches = cle;
    const M = [], vus = new Set(), infos = new Map(), pas = PAS_UNITE[u];
    if (actives) for (const f of E.fleches.slice().sort((x, y) => (x.grosse ? 0 : 1) - (y.grosse ? 0 : 1))) {
      const k = indexSurUnite(B, f, pas); if (k < 0) continue; const t = temps(B[k].t); if (t == null) { E.cleFleches = null; continue; } const cl = t + '|' + f.dir; if (vus.has(cl)) continue; vus.add(cl);
      const s = styleFleche(f); M.push({ time: t, position: s.position, color: s.couleur, shape: s.forme, size: s.taille * (tactile ? 1.25 : 1) });
      infos.set(t, { f, haut: f.dir < 0, texte: texteFleche(f) });
    }
    M.sort((a, b) => a.time - b.time); E.marques = M.length; E.M = M; E.infos = infos; E.infoEl && (E.infoEl.style.display = 'none'); infoFleche();
    if (LW.createSeriesMarkers) { const s = graph.serie(); if (!E.marqueurs) E.marqueurs = LW.createSeriesMarkers(s, M); else E.marqueurs.setMarkers(M); }
  }
  /* texte de l'info-bulle : type, entrée, stop et gain en R (gain réalisé si la flèche est sortie, sinon gain latent) */
  function texteFleche(f) {
    return `${f.dir > 0 ? '▲ Achat' : '▼ Vente'} · ${typeLibelle(f)}\nConfirmée à la 2e clôture H4 : ${nf(f.entree)}\n${f.dir > 0 ? 'Plus bas' : 'Plus haut'} du mouvement : ${nf(f.stop)}`;
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
        el.style.maxWidth = Math.max(120, W - 12) + 'px'; const w = el.offsetWidth, h = el.offsetHeight, py = graph.serie().priceToCoordinate(x.f.stop), bas = Number.isFinite(py) ? py : Hh / 2;
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
    const v = E.ma && Number.isFinite(E.ma.derniere) ? E.ma.derniere : null, px = prixRef(B), dist = v ? (px / v - 1) * 100 : null;
    el.innerHTML = (v ? `<span style="color:${COULEURS_UI.ma}">MA200 H4 ${nf(v, 0)} · prix ${nf(Math.abs(dist), 1)} % ${dist >= 0 ? 'au-dessus' : 'sous'}</span>` : `<span style="color:${COULEURS_UI.ma}">MA200 H4 : indisponible (moins de 200 bougies H4)</span>`) + versionHtml();
    el.title = 'Moyenne mobile simple sur 200 clôtures H4, la même sur H1, H4 et Jour ; distance calculée avec le prix de référence de l’appli';
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
    if (!id) { E.raison = 'Les flèches MA200 H4 sont disponibles pour l’or, le Nasdaq 100, le S&P 500, le Bitcoin et Solana.'; rendrePanneau(); return; }
    const n = ++E.seq;
    try { const r = await lireActifPro(id, { delai: 8000 }); if (n !== E.seq) return; E.D = r.donnees; E.meta = r; E.raison = null; E.A = analyseDe(id, E.D); E.fleches = E.A.reg; }
    catch (e) { E.raison = 'Données H4 indisponibles : ' + (e && e.message || e) + ' (le robot publie ces séries toutes les 30 minutes). Les flèches déjà confirmées restent affichées.'; E.A = null; try { E.fleches = lireRegistre(id); } catch (e2) { /* aucune */ } }
    E.cleFleches = null; dessiner(true); rendrePanneau(); alerter();
  }
  /* alertes : SEULEMENT les nouvelles flèches H4 confirmées : UNE annonce vocale de Rayle (« Or : achat, rebond haussier sur la MA200 H4, entrée vers 2 650, stop 2 620 ») + une notification + un message Telegram (pont du Worker existant).
     Une flèche n'est annoncée qu'une fois (registre de l'appareil : vueLe), et jamais si elle date de plus de 36 h. Interrupteur « Flèches » coupé : aucune annonce. */
  function alerter() {
    if (E.reglages.actif === false || !E.fleches.length) return; const att = lire(LS.alerte, {}), nouvelles = nouvellesFleches(id, E.fleches);
    for (const f of nouvelles.slice(0, 2)) { const texte = phraseFleche(NOMS[id], f); parler(texte); try { if (T.notifier) T.notifier(texte, { niveau: 'info', dit: false, raison: 'cassure MA200 H4' }); } catch (e) { /* */ } try { if (att.telegram !== false && T.envoyerTelegram) T.envoyerTelegram(`${texte} · lecture seule, aucun ordre`); } catch (e) { /* */ } }
  }

  /* ───── panneau « MA200 H4 » ───── */
  /* réglages : interrupteur « Flèches » (même bloc dans le panneau et dans « Affichage » du terminal) */
  function reglagesHtml() {
    const R = E.reglages;
    return `<div class="tp-reg" data-tp-reg><label class="tp-case"><input type="checkbox" data-reg="actif"${R.actif !== false ? ' checked' : ''}> Flèches de cassure de la MA200 H4</label></div>`;
  }
    function appliquerReglage(el) {
    const R = E.reglages; if (el.dataset.reg === 'actif') R.actif = el.checked;
    ecrireReglages(R); majFleches();
  }
  /* recalcule les flèches, redessine et synchronise les deux blocs de réglages */
  function majFleches() {
    if (E.D) { try { E.A = analyseDe(id, E.D); E.fleches = E.A.reg; } catch (e) { E.A = null; E.fleches = []; } } else { E.A = null; try { E.fleches = lireRegistre(id); } catch (e) { E.fleches = []; } }
    E.cleFleches = null; dessiner(true); rendrePanneau(); synchroReglages(); alerter();
  }
  const zonesReglages = () => [...document.querySelectorAll('[data-tp-reg]')];
  function synchroReglages() { for (const z of zonesReglages()) for (const k of ['actif']) { const c = z.querySelector('[data-reg="' + k + '"]'); if (c) c.checked = E.reglages[k] !== false; } }
  document.addEventListener('change', ev => { const el = ev.target.closest && ev.target.closest('[data-reg]'); if (el && el.closest('[data-tp-reg]')) appliquerReglage(el); });
  /* « Affichage » du terminal : le même bloc de réglages (s'il existe) */
  (function dansAffichage() { const pan = document.querySelector('.tor-ob-pan'); if (!pan || pan.querySelector('[data-tp-reg]')) return; const d = document.createElement('div'); d.innerHTML = reglagesHtml(); pan.insertBefore(d.firstElementChild, pan.querySelector('hr') || pan.firstChild); })();
  function rendrePanneau() {
    const p = E.panneau; if (!p) return; const att = lire(LS.alerte, {}), L = E.fleches.slice().reverse().slice(0, 10);
    const sens = E.A && E.A.sens.length ? E.A.sens[E.A.sens.length - 1].sens : null, sensTxt = sens === 1 ? '<b class="tp-h">au-dessus de la MA200 H4</b>' : sens === -1 ? '<b class="tp-b">sous la MA200 H4</b>' : '<b>sur la MA200 H4</b>';
    p.innerHTML = `<header><b>MA200 H4 · ${esc(NOMS[id] || actif)}</b><button type="button" data-fermer aria-label="Fermer">✕</button></header>
      ${E.raison ? `<p class="tp-doux">${esc(E.raison)}</p>` : ''}
      ${sens === null ? '' : `<p>Dernière clôture H4 : ${sensTxt}</p>`}
      <p class="tp-doux">Un seul indicateur : la <b>MA200 H4</b> (moyenne simple de 200 clôtures H4, tracée sur H1, H4 et Jour). <b>Cassure validée</b> = 2 clôtures H4 d’affilée du même côté. <b class="tp-h">Flèche verte ▲</b> = achat, posée sous le plus bas atteint avant la cassure ; <b class="tp-b">flèche rouge ▼</b> = vente, posée au-dessus du plus haut atteint avant la cassure. Les flèches alternent toujours (achat, vente, achat…). Touchez une flèche pour le détail.</p>
      <h4>Réglages</h4>${reglagesHtml()}
      <h4>Dernières flèches</h4>${L.length ? `<ul class="tp-sigs">${L.map(f => `<li class="${f.dir > 0 ? 'tp-h' : 'tp-b'}"><b>${f.dir > 0 ? '▲ achat' : '▼ vente'}</b> <span>${esc(dateJour(f.t))} · clôture ${nf(f.entree, f.entree >= 100 ? 0 : 2)}</span><small>${esc(typeLibelle(f))}</small></li>`).join('')}</ul>` : '<p class="tp-doux">Aucune flèche pour le moment.</p>'}
      <h4>Alertes</h4><label class="tp-case"><input type="checkbox" data-al="telegram"${att.telegram !== false ? ' checked' : ''}> Telegram (pont du Worker de Rayle)</label><p class="tp-doux">À chaque nouvelle flèche confirmée : une seule annonce de Rayle (« ${esc(phraseFleche(NOMS[id] || actif, { dir: 1 }))} »), une notification et un message Telegram. Une flèche n’est annoncée qu’une fois. Aucun autre signal.</p>`;
  }
  function ouvrirPanneau(o) {
    if (!E.panneau) { E.panneau = document.createElement('aside'); E.panneau.className = 'tp-panneau'; E.panneau.setAttribute('aria-label', 'MA200 H4'); document.body.appendChild(E.panneau); E.panneau.addEventListener('click', ev => { if (ev.target.closest('[data-fermer]')) ouvrirPanneau(false); });
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
  return { charger, majSpot, dessiner: () => dessiner(true), fleches: () => E.fleches.slice(), sens: () => (E.A ? E.A.sens.map(x => ({ ...x })) : []), infos: () => [...(E.infos || new Map()).entries()].map(([t, x]) => ({ time: t, texte: x.texte })), marqueurs: () => (E.M || []).map(m => ({ ...m })), maPoints: () => (E.series.ma ? E.series.ma.data() : []), maInfo: () => (E.ma ? { ...E.ma } : null), reglages: () => JSON.parse(JSON.stringify(E.reglages)), etat: () => ({ id, details: E.details, fleches: E.fleches.length, marques: E.marques || 0, ma: Object.keys(E.series) }), ouvrirPanneau, ouvrirDonnees, dashboard: () => E.dash, appliquerDetails };
}
