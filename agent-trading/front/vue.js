/* ═════════════ LA PAGE UNIQUE DE L'AGENT (PC, tablette, téléphone : même composant, même JSON) ═════════════
   UNE seule page qui défile (plus aucun onglet) ; le défilement est celui de la fenêtre de l'agent (.at-defil), la page de Rayle ne bouge pas.
   PC (≥ 1000 px et paysage) : écran 1 = graphique (~68 %) + narration | carnet complet + grosses transactions (~32 %), même hauteur ;
   puis, en défilant : Positions en cours · Historique · Portefeuille · Backtest 7 jours · Journal du bot.
   Téléphone / tablette en portrait : une colonne dans l'ordre graphique → narration → carnet → grosses transactions → positions → … → journal.
   Bouton ⤢ « Plein écran » du graphique (touche F sur PC) : API plein écran, repli en superposition CSS ; Échap, le bouton ou « retour »
   ramènent à la page à la même position de défilement. Rien n'est calculé ici : tout vient de l'état publié par le moteur. */
import { PAR_ID, actifsVisibles } from '../commun/actifs.js';
const ACTIFS = actifsVisibles();   // l'or seul par défaut (réglage rayle_at_tous_actifs)
import { fmtPrix, heureParis, fmtDuree, fmtNombre, fmtUSD } from '../commun/format.js';
import { creerConnexion } from './connexion.js';
import { creerGraphique } from './graphique.js';
import { creerCarnet } from './carnet.js';
import { COUCHES_DEFAUT, NOMS_COUCHES } from './niveaux-graphique.js';
import { creerGraphiqueKraken } from './graphique-kraken.js';
import { htmlPositions, htmlRejeuCopilote, htmlHistorique, csvHistorique, htmlPortefeuille, htmlJournal, htmlBacktest7j, animerCapital, dessinerCourbe, brancherDefinitions, esc, info, htmlBacktestGraphe, tradesBacktestGraphe, htmlPlanLecons } from './panneaux.js';
import { montrerCarte } from './carte-alerte.js';
import { creerCopiloteVisuel, HTML_HAUT, HTML_BAS, HTML_ALERTE } from './copilote-visuel.js';
import { adapterNiveaux } from './copilote-info.js';

const lire = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* refusé */ } };
let cssCharge = false;
export function chargerCss() {
  if (cssCharge || document.getElementById('at-css')) return; cssCharge = true;
  for (const f of ['jetons.css', 'agent.css']) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./' + f, import.meta.url).href; if (f === 'agent.css') l.id = 'at-css'; document.head.appendChild(l); }
}

/* disposition : « pc » si la fenêtre fait au moins 1000 px de large ET est en paysage, sinon « colonne » */
export const disposition = (l, h) => (l >= 1000 && l >= h ? 'pc' : 'colonne');

export function monterVue(el, { mode = 'auto', connexion = null } = {}) {
  chargerCss();
  const cnx = connexion || creerConnexion();
  const etat = { actif: ACTIFS.some(a => a.id === lire('rayle_at_actif', 'OR')) ? lire('rayle_at_actif', 'OR') : ACTIFS[0].id, unite: lire('rayle_at_unite', 'M15'), passees: lire('rayle_at_passees', '0') === '1', profil: lire('rayle_at_profil', '0') === '1', selection: null, histoActif: null, plein: false, rejoue: null,
    btg: { actif: false, jours: ['5', '7', '14'].includes(lire('rayle_at_btg_jours', '7')) ? Number(lire('rayle_at_btg_jours', '7')) : 7 } };
  if (!PAR_ID[etat.actif]) etat.actif = 'BTC';
  const boutonsActifs = cls => ACTIFS.map(a => `<button type="button" class="${cls}" data-actif="${a.id}"><b>${a.id}</b><span data-prix="${a.id}">—</span></button>`).join('');
  el.innerHTML = `<div class="at" data-mode="${mode}">
    <header class="at-tete">
      <nav class="at-actifs" aria-label="Actifs">${boutonsActifs('')}</nav>
      <div class="at-etat"><span class="at-cap" title="Capital (réalisé + flottant), au centime"><small>Capital</small><output data-cap>—</output></span><span class="at-statut" data-statut>…</span><span class="at-live" data-live>connexion…</span></div>
    </header>
    <div class="at-bandeau at-bandeau-observation" data-observation hidden></div>
    <div class="at-bandeau at-bandeau-limite" hidden>LIMITE DÉPASSÉE : plus aucune nouvelle position (simulation)</div>
    <div class="at-bandeau at-bandeau-horsligne" hidden></div>
    <div class="at-defil">
      <div class="at-ecran1">
        <section class="at-zone at-zone-graphique" aria-label="Graphique">
          <div class="at-outils">
            <span class="at-unites"><button type="button" data-unite="M15">M15</button><button type="button" data-unite="H1">H1</button></span>
            <label class="at-fs-seul at-fs-actif"><span class="at-sr">Actif</span><select data-choix-actif>${ACTIFS.map(a => `<option value="${a.id}">${a.id}</option>`).join('')}</select></label>
            <span class="at-fs-seul at-fs-prix" data-fs-prix>—</span>
            <button type="button" class="at-btn" data-passees aria-pressed="false" title="Montrer les positions passées">Passées</button>
            <button type="button" class="at-btn" data-profil aria-pressed="false" hidden title="Profil de volume (VAH / POC / VAL) et annotations : masqués par défaut">Profil</button>
            <span class="at-btg-outil"><button type="button" class="at-btn" data-btg-ouvrir aria-pressed="false" title="Rejouer les positions de la stratégie sur le graphique (ne touche jamais le portefeuille)">Backtest</button><select data-btg-jours aria-label="Durée du backtest"><option value="5">5 j</option><option value="7" selected>7 j</option><option value="14">14 j</option></select><button type="button" class="at-btn" data-btg-effacer hidden>Effacer le backtest</button></span>
            <button type="button" class="at-btn" data-recadrer title="Revenir aux 120 dernières bougies">120 bougies</button>
            <button type="button" class="at-btn" data-tout-voir title="Voir tout l’historique chargé">Tout voir</button>
            <button type="button" class="at-btn" data-cop-reglages aria-pressed="false" title="Réglages du copilote">⚙</button>
            <span class="at-cop-msg" data-cop-msg hidden></span>
            <span class="at-lecture" data-lecture hidden></span><span class="at-delta" data-delta></span>
            <button type="button" class="at-btn at-btn-fs" data-plein title="Plein écran (touche F)" aria-label="Plein écran">⤢ <span class="at-pas-fs">Plein écran</span><span class="at-fs-seul">Quitter</span></button>
          </div>
          <p class="at-fs-seul at-fs-paysage">Tournez le téléphone en paysage pour un graphique plus large.</p>
          <div class="at-rejoue-bandeau" data-rejoue hidden></div>
          <div class="at-cop-notif" data-cop-notif role="status" aria-live="polite" hidden></div>
          ${HTML_HAUT}
          <div class="at-vue-g" role="tablist" aria-label="Graphique"><button type="button" role="tab" data-vue-g="copilote" aria-selected="true">Graphique copilote</button><button type="button" role="tab" data-vue-g="kraken" aria-selected="false" title="Widget TradingView, symboles Kraken (sans les zones du copilote)">Graphique Kraken</button>
            <span class="at-couches" data-couches>${Object.entries(NOMS_COUCHES).map(([k, n]) => `<label><input type="checkbox" data-couche="${k}"> ${n}</label>`).join('')}</span></div>
          <div class="at-graphique"></div>
          <div class="at-tv" data-tv hidden></div>
          ${HTML_ALERTE}
          <div class="at-cop-bilan" data-cop-bilan hidden></div>
          <div class="at-cop-reglages" data-cop-panneau hidden><b>Réglages du copilote</b><label><input type="checkbox" data-cop-telegram disabled> Alertes Telegram des flèches</label><p class="at-doux">Désactivé. Même activé plus tard, rien ne partirait tant que l’agent est en OBSERVATION. Les flèches sont signalées ici seulement, discrètement.</p></div>
          <div class="at-flux-direct" data-flux-direct title="Bougie en cours : volume des acheteurs et des vendeurs agressifs (en dollars), enregistré par le moteur"><span class="at-fx-lbl">Volume net en bougies · bougie en cours</span><span class="at-achat">Achats agressifs <b data-fx-a>—</b></span><span class="at-fx-barre" aria-hidden="true"><i data-fx-barre></i></span><span class="at-vente">Ventes agressives <b data-fx-v>—</b></span></div>
          <div class="at-btg" data-btg hidden></div>
          <div class="at-recit"><p data-recit>…</p></div>
        </section>
        <section class="at-zone at-zone-carnet" aria-label="Carnet"><h3>Carnet <small data-carnet-actif></small></h3><div class="at-carnet"></div></section>
      </div>
      <section class="at-section cv-section-direct" data-section="copilote-direct" aria-label="Copilote en direct">${HTML_BAS}</section>
      <section class="at-section" data-section="positions"><h3>Positions en cours</h3><div data-positions></div></section>
      <section class="at-section" data-section="historique"><h3>Historique des positions <button type="button" class="at-btn" data-csv>Export CSV</button></h3><div data-historique></div></section>
      <section class="at-section" data-section="portefeuille"><h3>Performance du portefeuille</h3><div data-pf></div></section>
      <section class="at-section" data-section="backtest"><h3>Backtest 7 jours <span class="at-badge at-badge-rejoue">REJOUÉ, pas réel</span></h3><div data-bt></div></section>
      <section class="at-section" data-section="copilote"><h3>Copilote d’information : pertinence des événements et alertes <span class="at-badge">INFO MARCHÉ, pas un signal</span></h3><div data-cv-section></div></section>
      <section class="at-section" data-section="journal"><h3>Journal du bot</h3><div data-v4-journal></div><div data-journal></div></section>
      <footer class="at-pied"><span data-version></span><span class="at-sim">SIMULATION · aucun ordre réel · données publiques Kraken Futures ${info('version')}</span><span class="at-licence">Graphique : <a href="https://www.tradingview.com/" target="_blank" rel="noopener">TradingView Lightweight Charts™</a> (Apache-2.0)</span></footer>
    </div>
  </div>`;
  const R = el.querySelector('.at'), $ = s => R.querySelector(s), defil = $('.at-defil'), zoneG = $('.at-zone-graphique');
  brancherDefinitions(R);
  // disposition et hauteur de l'écran 1 : mesurées sur la fenêtre de l'agent (pas sur la page de Rayle)
  const majMode = () => {
    const m = mode === 'pc' || mode === 'colonne' ? mode : disposition(R.clientWidth, R.clientHeight);
    R.dataset.disposition = m;
    R.style.setProperty('--at-h', Math.max(320, defil.clientHeight) + 'px');
  };
  const ro = new ResizeObserver(majMode); ro.observe(R); majMode();

  const graph = creerGraphique($('.at-graphique'), { racine: R, surSelection: id => { etat.selection = id; rendrePositions(true); } });
  const carnet = creerCarnet($('.at-carnet'), { racine: R });
  // couches affichées (mémoire sur l'appareil) et onglet du graphique
  let couches = { ...COUCHES_DEFAUT }; try { couches = { ...couches, ...JSON.parse(lire('rayle_at_couches', '{}')) }; } catch (e) { /* défauts */ }
  etat.profil = couches.profil;
  const appliquerCouches = () => { for (const c of R.querySelectorAll('[data-couche]')) c.checked = !!couches[c.dataset.couche]; graph.couches(couches); };
  R.querySelector('[data-couches]').addEventListener('change', e => { const k = e.target.dataset.couche; if (!k) return; couches[k] = e.target.checked; ecrire('rayle_at_couches', JSON.stringify(couches)); if (k === 'profil') { etat.profil = couches.profil; ecrire('rayle_at_profil', etat.profil ? '1' : '0'); } appliquerCouches(); surcouches(); });
  graph.pret.then(appliquerCouches);
  const tvK = creerGraphiqueKraken($('[data-tv]')); etat.vueG = 'copilote';
  const montrerVueG = v => { etat.vueG = v; for (const b of R.querySelectorAll('[data-vue-g]')) b.setAttribute('aria-selected', String(b.dataset.vueG === v)); $('.at-graphique').hidden = v !== 'copilote'; $('[data-tv]').hidden = v !== 'kraken'; if (v === 'kraken') tvK.afficher(etat.actif, etat.unite); };
  R.querySelector('.at-vue-g').addEventListener('click', e => { const b = e.target.closest('[data-vue-g]'); if (b) montrerVueG(b.dataset.vueG); });
  const cv = creerCopiloteVisuel(R, { cnx, graph, actif: () => etat.actif, lire, ecrire });
  let derniers = {}, vus = new Set(JSON.parse(lire('rayle_at_vus', '[]')));

  function choisirActif(a) { if (!PAR_ID[a]) return; etat.actif = a; ecrire('rayle_at_actif', a); cnx.regarder(a); etat.histoActif = null; tout(); }
  R.addEventListener('click', e => {
    const ex = e.target.closest('[data-bt-id]'); if (ex) return voirExemple(ex.dataset.btId);
    const carte = e.target.closest('[data-positions] [data-id], [data-historique] tr[data-id]');
    if (carte) { etat.selection = etat.selection === carte.dataset.id ? null : carte.dataset.id; graph.selectionner(etat.selection); rendrePositions(true); return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.actif) choisirActif(b.dataset.actif);
    else if (b.dataset.unite) { etat.unite = b.dataset.unite; ecrire('rayle_at_unite', etat.unite); etat.histoActif = null; tout(); }
    else if (b.hasAttribute('data-profil')) { etat.profil = !etat.profil; ecrire('rayle_at_profil', etat.profil ? '1' : '0'); surcouches(); majBoutons(); }
    else if (b.hasAttribute('data-passees')) { etat.passees = !etat.passees; ecrire('rayle_at_passees', etat.passees ? '1' : '0'); graph.montrerPassees(etat.passees); surcouches(); majBoutons(); }
    else if (b.hasAttribute('data-cop-reglages')) { const z = $('[data-cop-panneau]'); z.hidden = !z.hidden; b.setAttribute('aria-pressed', String(!z.hidden)); }
    else if (b.hasAttribute('data-recadrer')) graph.recadrer();
    else if (b.hasAttribute('data-tout-voir')) graph.toutVoir();
    else if (b.hasAttribute('data-plein')) basculerPlein();
    else if (b.hasAttribute('data-fin-rejoue')) { etat.rejoue = null; graph.rejoue(null); majRejoue(); }
    else if (b.hasAttribute('data-btg-ouvrir')) { etat.btg.actif = true; derniers.btg = null; majBtg(); }
    else if (b.hasAttribute('data-btg-effacer')) { etat.btg.actif = false; majBtg(); }
    else if (b.hasAttribute('data-csv')) { const blob = new Blob([csvHistorique(cnx.store.lent)], { type: 'text/csv' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'historique-agent-trading.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  });
  $('[data-choix-actif]').addEventListener('change', e => choisirActif(e.target.value));
  $('[data-btg-jours]').value = String(etat.btg.jours);
  $('[data-btg-jours]').addEventListener('change', e => { etat.btg.jours = Number(e.target.value); ecrire('rayle_at_btg_jours', e.target.value); derniers.btg = null; majBtg(); });

  /* ─── bouton « Backtest » : positions REJOUÉES (précalculées par le moteur, identiques sur tous les écrans), jamais le portefeuille ─── */
  function majBtg() {
    const bg = cnx.store.lent && cnx.store.lent.backtestGraphe, z = $('[data-btg]');
    z.hidden = !etat.btg.actif;
    $('[data-btg-effacer]').hidden = !etat.btg.actif;
    const o = $('[data-btg-ouvrir]'); o.setAttribute('aria-pressed', String(etat.btg.actif)); o.classList.toggle('actif', etat.btg.actif);
    if (!etat.btg.actif) { graph.backtest(null); graph.flechesRejeu(null); derniers.btg = null; z.innerHTML = ''; return; }
    const e = cnx.store.etat, cp = e && e.actifs[etat.actif] && e.actifs[etat.actif].copilote, rj = cp && cp.rejeu && cp.rejeu.fenetres[etat.btg.jours];
    graph.flechesRejeu(rj ? rj.fleches : null);
    const html = htmlBacktestGraphe(bg, etat.btg.jours, etat.actif) + htmlRejeuCopilote(rj, etat.btg.jours, etat.actif);
    if (derniers.btg !== html) { z.innerHTML = html; derniers.btg = html; }
    graph.backtest(tradesBacktestGraphe(bg, etat.btg.jours, etat.actif));
  }

  /* ─── plein écran du graphique ─── */
  let scrollAvant = 0, etatHistorique = false;
  function entrerPlein() {
    if (etat.plein) return; etat.plein = true; scrollAvant = defil.scrollTop;
    zoneG.classList.add('at-fs'); R.classList.add('at-en-plein');
    const natif = zoneG.requestFullscreen ? zoneG.requestFullscreen({ navigationUI: 'hide' }) : null;
    if (natif && natif.then) natif.then(() => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (x) { /* refusé */ } }).catch(() => { /* repli : superposition CSS (déjà en place) */ });
    try { history.pushState(Object.assign({}, history.state, { atPlein: true }), ''); etatHistorique = true; } catch (x) { etatHistorique = false; }
    majBoutons();
  }
  function sortirPlein(depuisRetour) {
    if (!etat.plein) return; etat.plein = false;
    zoneG.classList.remove('at-fs'); R.classList.remove('at-en-plein');
    if (document.fullscreenElement === zoneG) document.exitFullscreen().catch(() => {});
    try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (x) { /* rien */ }
    if (etatHistorique && !depuisRetour) { etatHistorique = false; try { history.back(); } catch (x) { /* rien */ } }
    etatHistorique = false;
    majBoutons();
    requestAnimationFrame(() => requestAnimationFrame(() => { defil.scrollTop = scrollAvant; }));
  }
  const basculerPlein = () => (etat.plein ? sortirPlein(false) : entrerPlein());
  const surPleinEcran = () => { if (etat.plein && document.fullscreenElement !== zoneG) sortirPlein(false); };
  const surRetour = () => { if (etat.plein) { etatHistorique = false; sortirPlein(true); } };
  const surTouche = e => {
    if (!R.isConnected || e.ctrlKey || e.metaKey || e.altKey) return;
    const cible = e.target, saisie = cible && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName));
    if (e.key === 'Escape' && etat.plein) { e.preventDefault(); e.stopImmediatePropagation(); sortirPlein(false); return; }
    if ((e.key === 'f' || e.key === 'F') && !saisie && R.dataset.disposition === 'pc') { e.preventDefault(); e.stopImmediatePropagation(); basculerPlein(); }
  };
  document.addEventListener('fullscreenchange', surPleinEcran);
  window.addEventListener('popstate', surRetour);
  window.addEventListener('keydown', surTouche, true);

  /* ─── exemple du backtest : le graphique va à ce moment et montre la position REJOUÉE ─── */
  function voirExemple(id) {
    const bt = cnx.store.lent && cnx.store.lent.backtest7j, s = bt && (bt.signaux || []).concat(bt.derniers || []).find(x => x.id === id); if (!s) return;
    etat.rejoue = s;
    const aller = () => { graph.rejoue(s); graph.allerA(s.tSignal); majRejoue(); };
    if (etat.actif !== s.actif || etat.unite !== 'M15') { etat.actif = s.actif; etat.unite = 'M15'; ecrire('rayle_at_actif', s.actif); ecrire('rayle_at_unite', 'M15'); cnx.regarder(s.actif); etat.histoActif = null; etat.allerApres = aller; tout(); }   // aller APRÈS le chargement des bougies de cet actif
    else aller();
    defil.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  function majRejoue() {
    const z = $('[data-rejoue]'), s = etat.rejoue; z.hidden = !s;
    z.innerHTML = s ? `REJOUÉ, pas réel · ${esc(s.actif)} ${s.sens === 'achat' ? '▲ haussier' : '▼ baissier'}${s.categorie === 'grande' ? ' GRANDE' : ''} du ${heureParis(s.tSignal)} <button type="button" class="at-btn" data-fin-rejoue>Masquer</button>` : '';
  }

  function majBoutons() {
    R.querySelectorAll('[data-actif]').forEach(b => b.classList.toggle('actif', b.dataset.actif === etat.actif));
    R.querySelectorAll('[data-unite]').forEach(b => b.classList.toggle('actif', b.dataset.unite === etat.unite));
    const p = $('[data-passees]'); p.setAttribute('aria-pressed', String(etat.passees)); p.classList.toggle('actif', etat.passees);
    const pf = $('[data-profil]'); if (pf) { pf.setAttribute('aria-pressed', String(!!etat.profil)); pf.classList.toggle('actif', !!etat.profil); }
    $('[data-choix-actif]').value = etat.actif;
    const fs = $('[data-plein]'); fs.setAttribute('aria-label', etat.plein ? 'Quitter le plein écran' : 'Plein écran'); fs.title = etat.plein ? 'Quitter le plein écran (Échap)' : 'Plein écran (touche F)';
  }

  /* ─── rendus ─── */
  function rendreHistorique() {
    const h = cnx.store.historiques[etat.actif] && cnx.store.historiques[etat.actif][etat.unite], cle = etat.actif + etat.unite;
    if (!h || etat.histoActif === cle) return;
    graph.afficher({ actif: etat.actif, unite: etat.unite, liste: h, recadrer: etat.vueCle !== cle });   // recadrer seulement si l'actif ou l'unité change
    etat.histoActif = cle; etat.vueCle = cle;
    if (etat.allerApres) { const f = etat.allerApres; etat.allerApres = null; f(); }
  }
  function surcouches() {
    const e = cnx.store.etat; if (!e) return;
    const x = e.actifs[etat.actif], lent = cnx.store.lent, pos = Object.fromEntries(e.compte.positions.map(p => [p.id, p]));
    const positions = e.trades.enCours.filter(t => t.actif === etat.actif).map(t => Object.assign({}, t, { pnlAffiche: pos[t.id] ? pos[t.id].pnl : null }));
    const passees = (lent && lent.passes || []).filter(t => t.actif === etat.actif && t.statut === 'clos').slice(-30).map(t => Object.assign({}, t, { pnlAffiche: t.pnl }));
    const profils = [];
    // or : 8 niveaux au plus sur le graphique → ni profil VAH/POC/VAL ni zones du copilote générique
    if (etat.profil && x.profils && x.profils.jour && x.profils.jour.niveaux) profils.push(Object.assign({ etiquette: 'jour', pas: x.pas }, x.profils.jour, { fin: Date.now() }));
    if (etat.profil) for (const a of (x.annotations && x.annotations.liste) || []) if (a.type === 'profil') profils.push(Object.assign({ etiquette: 'agent' }, a));
    copilote(x.copilote);
    graph.surcouches({ positions, passees, profils, annotations: etat.profil ? (x.annotations && x.annotations.liste || []).filter(a => a.type !== 'profil') : [], prix: x.prix, tPrix: x.tPrix, live: cnx.fraicheur().live, copilote: null, visuel: x.info && x.info.v2 ? null : adapterNiveaux(x.info), info: x.info || null });
    if (etat.vueG === 'kraken') tvK.afficher(etat.actif, etat.unite);
    cv.maj();
  }
  /* ─── copilote : bilan des flèches (près du graphique), message « marché instable », notification discrète d'une nouvelle flèche ─── */
  function copilote(cp) {
    const bl = $('[data-cop-bilan]'), msg = $('[data-cop-msg]');
    if (!cp) { bl.hidden = true; msg.hidden = true; return; }
    const b = cp.bilan || { n: 0, finies: 0, gagnantes: 0, Rtotal: 0, tropPetit: true }, R = (b.Rtotal > 0 ? '+' : '') + String(b.Rtotal).replace('.', ',');
    const txt = `Bilan des flèches : ${b.n}, gagnantes ${b.gagnantes}, R total ${R} (frais inclus)${b.finies < 30 ? ' · échantillon trop petit pour conclure' : ''}`;
    if (bl.textContent !== txt) bl.textContent = txt; bl.hidden = false; bl.title = 'Toutes les flèches du copilote (BTC, ETH, HYPE, or), résultat réel mesuré après coup. Information, jamais des ordres.';
    msg.hidden = !cp.message; if (cp.message) msg.textContent = cp.message;
    for (const f of cp.fleches || []) {
      if (vusCop.has(f.id)) continue; vusCop.add(f.id); ecrire('rayle_at_cop_vus', JSON.stringify([...vusCop].slice(-100)));
      if (Date.now() - f.t < 30 * 60e3 && f.statut === 'active' && cnx.fraicheur().live) notifier(f);
    }
  }
  let vusCop = new Set(JSON.parse(lire('rayle_at_cop_vus', '[]'))), minuterieNotif = null;
  function notifier(f) {
    const z = $('[data-cop-notif]'); z.textContent = `Copilote : idée ${f.sens === 'achat' ? '▲ achat' : '▼ vente'} ${f.actif} (non validée)`; z.hidden = false;
    clearTimeout(minuterieNotif); minuterieNotif = setTimeout(() => { z.hidden = true; }, 9000);
  }
  function rendreTete() {
    const e = cnx.store.etat, f = cnx.fraicheur();
    if (e) for (const a of ACTIFS) { const x = e.actifs[a.id]; if (!x) continue; R.querySelectorAll(`[data-prix="${a.id}"]`).forEach(s => { s.textContent = x.prix != null ? fmtPrix(a.id, x.prix) : '—'; s.parentNode.classList.toggle('at-lecture-seule', !x.porte.ok); s.parentNode.title = x.porte.ok ? '' : 'Lecture seule : ' + x.porte.raison; }); }
    const live = $('[data-live]'), bh = $('.at-bandeau-horsligne');
    if (!e) { live.textContent = cnx.store.connexion; live.className = 'at-live at-off'; bh.hidden = !cnx.store.erreur; bh.textContent = cnx.store.erreur || ''; return; }
    if (f.live) { live.textContent = '● en direct'; live.className = 'at-live at-on'; bh.hidden = true; }
    else { const t = cnx.store.moteur.moteurVu || e.t; live.textContent = '○ hors ligne'; live.className = 'at-live at-off'; bh.hidden = false; bh.textContent = `Agent hors ligne depuis ${fmtDuree(Date.now() - t)} · dernier état du ${heureParis(e.t, true)} (pas en direct)`; }
    const st = $('[data-statut]'); st.textContent = e.statut; st.className = 'at-statut ' + (e.statut === 'RENTABLE' ? 'at-gain' : e.statut === 'NON RENTABLE' ? 'at-perte' : 'at-alerte');
    st.title = e.statuts ? `normales : ${e.statuts.normale} · grandes : ${e.statuts.grande}` : '';
    $('[data-cap]').textContent = fmtUSD(e.compte.capital);
    $('.at-bandeau-limite').hidden = !e.compte.baisse.depassee;
    const obs = $('[data-observation]'); obs.hidden = e.mode !== 'observation' && !e.bandeau; obs.textContent = e.bandeau || '';
    const x = e.actifs[etat.actif];
    $('[data-version]').textContent = `état n° ${e.seq} · dernier prix ${x && x.tPrix ? heureParis(x.tPrix, true) : '—'}`;
    $('[data-fs-prix]').textContent = x && x.prix != null ? `${etat.actif} ${fmtPrix(etat.actif, x.prix)}` : '—';
    const lec = $('[data-lecture]'); lec.hidden = x.porte.ok; lec.textContent = x.porte.ok ? '' : 'LECTURE SEULE : ' + x.porte.raison;
    const d = $('[data-delta]'); d.textContent = x.delta != null ? `volume net ${x.delta >= 0 ? '+' : ''}${fmtNombre(x.delta, 3)}${x.deltaComplet ? '' : ' (incomplet)'}` : 'volume net : pas encore enregistré'; d.className = 'at-delta ' + (x.delta > 0 ? 'at-achat' : x.delta < 0 ? 'at-vente' : '');
    $('[data-recit]').textContent = x.recit ? x.recit.texte + (x.recit.source === 'ia' ? '  (IA locale)' : '') : '…';
    $('[data-carnet-actif]').textContent = etat.actif;
    // volume acheteur / vendeur agressif de la bougie EN COURS (montants enregistrés par le moteur, sinon « — » : jamais inventés)
    const bc = x.bougies && x.bougies[etat.unite], der = bc && bc[bc.length - 1], va = der ? der[12] : null, vv = der ? der[13] : null;
    $('[data-fx-a]').textContent = va != null ? fmtUSD(va, 0) : '—'; $('[data-fx-v]').textContent = vv != null ? fmtUSD(vv, 0) : '—';
    const barre = $('[data-fx-barre]'); barre.style.width = va != null && vv != null && va + vv > 0 ? (va / (va + vv) * 100).toFixed(1) + '%' : '0%'; barre.parentNode.classList.toggle('at-fx-inconnu', !(va != null && vv != null && va + vv > 0));
  }
  const remplacer = (cle, sel, html) => { if (derniers[cle] === html) return; const z = $(sel), sc = z.querySelector('.at-tab-defil, .at-journal'), top = sc && sc.scrollTop; z.innerHTML = html; derniers[cle] = html; const n = z.querySelector('.at-tab-defil, .at-journal'); if (top && n) n.scrollTop = top; };
  function rendrePositions(force) {
    const e = cnx.store.etat; if (!e) return;
    if (force) derniers = Object.assign({}, derniers, { pos: null });
    remplacer('pos', '[data-positions]', htmlPositions(e, etat.selection));
    remplacer('hist', '[data-historique]', htmlHistorique(cnx.store.lent));
    remplacer('journal', '[data-journal]', htmlJournal(cnx.store.lent));
    remplacer('v4j', '[data-v4-journal]', htmlPlanLecons(cnx.store.lent && cnx.store.lent.v4));
    remplacer('bt', '[data-bt]', htmlBacktest7j(cnx.store.lent && cnx.store.lent.backtest7j));
  }
  function rendrePortefeuille() {
    const e = cnx.store.etat; if (!e) return;
    const z = $('[data-pf]'), html = htmlPortefeuille(e, cnx.store.lent), sans = html.replace(/<output class="at-capital"[^>]*>[^<]*<\/output>/, '');
    if (sans !== derniers.pf) { const ancien = z.querySelector('.at-capital'), aff = ancien && ancien.dataset.affiche; z.innerHTML = html; derniers.pf = sans; const o = z.querySelector('.at-capital'); if (aff) o.dataset.affiche = aff; dessinerCourbe(z.querySelector('.at-courbe'), cnx.store.courbe && cnx.store.courbe.points, R); }
    animerCapital(z.querySelector('.at-capital'), Math.round(e.compte.capital * 100), R);
  }
  function alertesNouvelles() {
    const e = cnx.store.etat; if (!e) return;
    for (const tr of e.trades.enCours) if (tr.statut === 'propose' && !vus.has(tr.id)) {
      vus.add(tr.id); ecrire('rayle_at_vus', JSON.stringify([...vus].slice(-200)));
      if (Date.now() - tr.tSignal < 10 * 60e3 && cnx.fraicheur().live) montrerCarte(R, tr);
    }
  }
  function tout() { cv.majLent(); cv.maj(); majBoutons(); rendreTete(); rendreHistorique(); surcouches(); const e = cnx.store.etat; if (e) carnet.maj(etat.actif, e.actifs[etat.actif]); rendrePositions(); rendrePortefeuille(); majBtg(); }

  const desabonner = cnx.abonner(quoi => {
    if (quoi === 'etat') {
      const e = cnx.store.etat, x = e.actifs[etat.actif];
      if (etat.histoActif === etat.actif + etat.unite && x.bougies[etat.unite]) graph.bougieLive(x.bougies[etat.unite]); else rendreHistorique();
      rendreTete(); surcouches(); carnet.maj(etat.actif, x); rendrePositions(); rendrePortefeuille(); alertesNouvelles(); if (etat.btg.actif) majBtg();
    } else if (quoi.startsWith('historique:')) { if (quoi === 'historique:' + etat.actif) { etat.histoActif = null; rendreHistorique(); surcouches(); } }
    else if (quoi === 'lent') { rendrePositions(); rendrePortefeuille(); surcouches(); majBtg(); cv.majLent(); }
    else if (quoi === 'courbe') { derniers.pf = null; rendrePortefeuille(); }
    else rendreTete();
  });
  graph.pret.then(() => { cnx.regarder(etat.actif); tout(); }).catch(e => { $('.at-graphique').innerHTML = '<p class="at-vide">' + esc(e.message) + '</p>'; tout(); });
  graph.montrerPassees(etat.passees);
  return {
    connexion: cnx, racine: R, graphique: graph, defil, copiloteVisuel: cv,
    choisir: choisirActif, pleinEcran: () => etat.plein, entrerPlein, sortirPlein: () => sortirPlein(false), voirExemple,
    detruire() { if (etat.plein) sortirPlein(false); desabonner(); ro.disconnect(); document.removeEventListener('fullscreenchange', surPleinEcran); window.removeEventListener('popstate', surRetour); window.removeEventListener('keydown', surTouche, true); graph.detruire(); carnet.detruire(); if (!connexion) cnx.fermer(); }
  };
}
