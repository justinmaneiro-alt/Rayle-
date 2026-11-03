/* ═════════════ LA FENÊTRE UNIQUE DE L'AGENT (PC, tablette, téléphone : même composant, même JSON) ═════════════
   PC : grille (graphique + carnet / positions + portefeuille). Téléphone et tablette : onglets DANS la même fenêtre
   (Graphique | Carnet | Positions | Portefeuille). Rien n'est calculé ici : tout vient de l'état publié par le moteur. */
import { ACTIFS, PAR_ID } from '../commun/actifs.js';
import { fmtPrix, heureParis, fmtDuree, fmtNombre } from '../commun/format.js';
import { creerConnexion } from './connexion.js';
import { creerGraphique } from './graphique.js';
import { creerCarnet } from './carnet.js';
import { htmlPositions, htmlHistorique, csvHistorique, htmlPortefeuille, htmlJournal, animerCapital, dessinerCourbe, brancherDefinitions, esc, info } from './panneaux.js';
import { montrerCarte } from './carte-alerte.js';

const lire = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* refusé */ } };
let cssCharge = false;
export function chargerCss() {
  if (cssCharge || document.getElementById('at-css')) return; cssCharge = true;
  for (const f of ['jetons.css', 'agent.css']) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./' + f, import.meta.url).href; if (f === 'agent.css') l.id = 'at-css'; document.head.appendChild(l); }
}

export function monterVue(el, { mode = 'auto', connexion = null } = {}) {
  chargerCss();
  const cnx = connexion || creerConnexion();
  const etat = { actif: lire('rayle_at_actif', 'BTC'), unite: lire('rayle_at_unite', 'M15'), onglet: 'graphique', passees: lire('rayle_at_passees', '0') === '1', selection: null, histoActif: null, panneauBas: 'positions' };
  if (!PAR_ID[etat.actif]) etat.actif = 'BTC';
  el.innerHTML = `<div class="at" data-mode="${mode}" data-onglet="graphique">
    <header class="at-tete">
      <nav class="at-actifs" role="tablist">${ACTIFS.map(a => `<button type="button" role="tab" data-actif="${a.id}"><b>${a.id}</b><span data-prix="${a.id}">—</span></button>`).join('')}</nav>
      <div class="at-etat"><span class="at-statut" data-statut>…</span><span class="at-live" data-live>connexion…</span></div>
    </header>
    <div class="at-bandeau at-bandeau-limite" hidden>LIMITE DÉPASSÉE : plus aucune nouvelle position (simulation)</div>
    <div class="at-bandeau at-bandeau-horsligne" hidden></div>
    <nav class="at-onglets" role="tablist"><button type="button" data-onglet="graphique">Graphique</button><button type="button" data-onglet="carnet">Carnet</button><button type="button" data-onglet="positions">Positions</button><button type="button" data-onglet="portefeuille">Portefeuille</button></nav>
    <main class="at-corps">
      <section class="at-zone at-zone-graphique" data-zone="graphique">
        <div class="at-outils"><span class="at-unites"><button type="button" data-unite="M15">M15</button><button type="button" data-unite="H1">H1</button></span>
          <button type="button" class="at-btn" data-passees aria-pressed="false">Passées</button><button type="button" class="at-btn" data-recadrer>⤢</button>
          <span class="at-lecture" data-lecture hidden></span><span class="at-delta" data-delta></span></div>
        <div class="at-graphique"></div>
        <div class="at-recit"><p data-recit>…</p></div>
      </section>
      <section class="at-zone at-zone-carnet" data-zone="carnet"><h3>Carnet <small data-carnet-actif></small></h3><div class="at-carnet"></div></section>
      <section class="at-zone at-zone-positions" data-zone="positions">
        <div class="at-sous"><button type="button" data-bas="positions" class="actif">Positions en cours</button><button type="button" data-bas="historique">Historique</button><button type="button" data-bas="journal">Journal du bot</button><button type="button" class="at-btn" data-csv hidden>Export CSV</button></div>
        <div class="at-bas" data-bas-contenu></div>
      </section>
      <section class="at-zone at-zone-portefeuille" data-zone="portefeuille"><h3>Performance du portefeuille</h3><div data-pf></div></section>
    </main>
    <footer class="at-pied"><span data-version></span><span class="at-sim">SIMULATION · aucun ordre réel · données publiques Kraken Futures ${info('version')}</span><span class="at-licence">Graphique : <a href="https://www.tradingview.com/" target="_blank" rel="noopener">TradingView Lightweight Charts™</a> (Apache-2.0)</span></footer>
  </div>`;
  const R = el.querySelector('.at'), $ = s => R.querySelector(s);
  brancherDefinitions(R);
  // mode : PC = grille ; tablette et téléphone = onglets (largeur de la fenêtre)
  const majMode = () => { const m = mode !== 'auto' ? mode : (R.clientWidth >= 1100 ? 'pc' : 'mobile'); R.dataset.disposition = m; };
  const ro = new ResizeObserver(majMode); ro.observe(R); majMode();

  const graph = creerGraphique($('.at-graphique'), { racine: R, surSelection: id => { etat.selection = id; rendrePositions(); } });
  const carnet = creerCarnet($('.at-carnet'), { racine: R });
  let dernierPf = '', dernierBas = '', vus = new Set(JSON.parse(lire('rayle_at_vus', '[]')));

  R.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.actif) { etat.actif = b.dataset.actif; ecrire('rayle_at_actif', etat.actif); cnx.regarder(etat.actif); etat.histoActif = null; tout(); }
    else if (b.dataset.unite) { etat.unite = b.dataset.unite; ecrire('rayle_at_unite', etat.unite); etat.histoActif = null; tout(); }
    else if (b.dataset.onglet) { etat.onglet = b.dataset.onglet; R.dataset.onglet = etat.onglet; tout(); }
    else if (b.hasAttribute('data-passees')) { etat.passees = !etat.passees; ecrire('rayle_at_passees', etat.passees ? '1' : '0'); graph.montrerPassees(etat.passees); surcouches(); majBoutons(); }
    else if (b.hasAttribute('data-recadrer')) graph.recadrer();
    else if (b.dataset.bas) { etat.panneauBas = b.dataset.bas; dernierBas = ''; rendrePositions(); majBoutons(); }
    else if (b.hasAttribute('data-csv')) { const blob = new Blob([csvHistorique(cnx.store.lent)], { type: 'text/csv' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'historique-agent-trading.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  });
  $('[data-bas-contenu]').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; etat.selection = etat.selection === tr.dataset.id ? null : tr.dataset.id; graph.selectionner(etat.selection); rendrePositions(); });

  function majBoutons() {
    R.querySelectorAll('[data-actif]').forEach(b => b.classList.toggle('actif', b.dataset.actif === etat.actif));
    R.querySelectorAll('[data-unite]').forEach(b => b.classList.toggle('actif', b.dataset.unite === etat.unite));
    R.querySelectorAll('.at-onglets [data-onglet]').forEach(b => b.classList.toggle('actif', b.dataset.onglet === etat.onglet));
    R.querySelectorAll('[data-bas]').forEach(b => b.classList.toggle('actif', b.dataset.bas === etat.panneauBas));
    const p = $('[data-passees]'); p.setAttribute('aria-pressed', String(etat.passees)); p.classList.toggle('actif', etat.passees);
    $('[data-csv]').hidden = etat.panneauBas !== 'historique';
  }

  /* ─── rendus ─── */
  function rendreHistorique() {
    const h = cnx.store.historiques[etat.actif] && cnx.store.historiques[etat.actif][etat.unite], cle = etat.actif + etat.unite;
    if (!h || etat.histoActif === cle) return;
    graph.afficher({ actif: etat.actif, unite: etat.unite, liste: h, recadrer: etat.vueCle !== cle });   // recadrer seulement si l'actif ou l'unité change (jamais pendant que l'on zoome)
    etat.histoActif = cle; etat.vueCle = cle;
  }
  function surcouches() {
    const e = cnx.store.etat; if (!e) return;
    const x = e.actifs[etat.actif], lent = cnx.store.lent, pos = Object.fromEntries(e.compte.positions.map(p => [p.id, p]));
    const positions = e.trades.enCours.filter(t => t.actif === etat.actif).map(t => Object.assign({}, t, { pnlAffiche: pos[t.id] ? pos[t.id].pnl : null }));
    const passees = (lent && lent.passes || []).filter(t => t.actif === etat.actif && t.statut === 'clos').slice(-30).map(t => Object.assign({}, t, { pnlAffiche: t.pnl }));
    const profils = [];
    if (x.profils && x.profils.jour && x.profils.jour.niveaux) profils.push(Object.assign({ etiquette: 'jour', pas: x.pas }, x.profils.jour, { fin: Date.now() }));
    for (const a of (x.annotations && x.annotations.liste) || []) if (a.type === 'profil') profils.push(Object.assign({ etiquette: 'agent' }, a));
    graph.surcouches({ positions, passees, profils, annotations: (x.annotations && x.annotations.liste || []).filter(a => a.type !== 'profil'), prix: x.prix, tPrix: x.tPrix, live: cnx.fraicheur().live });
  }
  function rendreTete() {
    const e = cnx.store.etat, f = cnx.fraicheur();
    if (e) for (const a of ACTIFS) { const x = e.actifs[a.id], s = R.querySelector(`[data-prix="${a.id}"]`); if (x && s) { s.textContent = x.prix != null ? fmtPrix(a.id, x.prix) : '—'; s.parentNode.classList.toggle('at-lecture-seule', !x.porte.ok); s.parentNode.title = x.porte.ok ? '' : 'Lecture seule : ' + x.porte.raison; } }
    const live = $('[data-live]'), bh = $('.at-bandeau-horsligne');
    if (!e) { live.textContent = cnx.store.connexion; live.className = 'at-live at-off'; bh.hidden = !cnx.store.erreur; bh.textContent = cnx.store.erreur || ''; return; }
    if (f.live) { live.textContent = '● en direct'; live.className = 'at-live at-on'; bh.hidden = true; }
    else { const t = cnx.store.moteur.moteurVu || e.t; live.textContent = 'hors ligne'; live.className = 'at-live at-off'; bh.hidden = false; bh.textContent = `Agent hors ligne depuis ${fmtDuree(Date.now() - t)} · dernier état du ${heureParis(e.t, true)} (pas en direct)`; }
    $('[data-statut]').textContent = e.statut; $('[data-statut]').className = 'at-statut ' + (e.statut === 'RENTABLE' ? 'at-gain' : e.statut === 'NON RENTABLE' ? 'at-perte' : 'at-alerte');
    $('.at-bandeau-limite').hidden = !e.compte.baisse.depassee;
    const x = e.actifs[etat.actif];
    $('[data-version]').textContent = `état n° ${e.seq} · dernier prix ${x && x.tPrix ? heureParis(x.tPrix, true) : '—'}`;
    const lec = $('[data-lecture]'); lec.hidden = x.porte.ok; lec.textContent = x.porte.ok ? '' : 'LECTURE SEULE : ' + x.porte.raison;
    const d = $('[data-delta]'); d.textContent = x.delta != null ? `volume net bougie ${x.delta >= 0 ? '+' : ''}${fmtNombre(x.delta, 3)}${x.deltaComplet ? '' : ' (incomplet)'}` : 'volume net : pas encore enregistré'; d.className = 'at-delta ' + (x.delta > 0 ? 'at-achat' : x.delta < 0 ? 'at-vente' : '');
    $('[data-recit]').textContent = x.recit ? x.recit.texte + (x.recit.source === 'ia' ? '  (IA locale)' : '') : '…';
    $('[data-carnet-actif]').textContent = etat.actif;
  }
  function rendrePositions() {
    const e = cnx.store.etat; if (!e) return;
    const z = $('[data-bas-contenu]'); let h;
    if (etat.panneauBas === 'positions') h = htmlPositions(e, etat.selection);
    else if (etat.panneauBas === 'historique') h = htmlHistorique(cnx.store.lent);
    else h = htmlJournal(cnx.store.lent);
    if (h !== dernierBas) { const s = z.firstElementChild && z.firstElementChild.scrollTop; z.innerHTML = h; dernierBas = h; if (s && z.firstElementChild) z.firstElementChild.scrollTop = s; }
  }
  function rendrePortefeuille() {
    const e = cnx.store.etat; if (!e) return;
    const z = $('[data-pf]'), html = htmlPortefeuille(e, cnx.store.lent), sans = html.replace(/<output class="at-capital"[^>]*>[^<]*<\/output>/, '');
    if (sans !== dernierPf) { const ancien = z.querySelector('.at-capital'), aff = ancien && ancien.dataset.affiche; z.innerHTML = html; dernierPf = sans; const o = z.querySelector('.at-capital'); if (aff) o.dataset.affiche = aff; dessinerCourbe(z.querySelector('.at-courbe'), cnx.store.courbe && cnx.store.courbe.points, R); }
    animerCapital(z.querySelector('.at-capital'), Math.round(e.compte.capital * 100), R);
  }
  function alertesNouvelles() {
    const e = cnx.store.etat; if (!e) return;
    for (const tr of e.trades.enCours) if (tr.statut === 'propose' && !vus.has(tr.id)) {
      vus.add(tr.id); ecrire('rayle_at_vus', JSON.stringify([...vus].slice(-200)));
      if (Date.now() - tr.tSignal < 10 * 60e3 && cnx.fraicheur().live) montrerCarte(R, tr);
    }
  }
  function tout() { majBoutons(); rendreTete(); rendreHistorique(); surcouches(); const e = cnx.store.etat; if (e) carnet.maj(etat.actif, e.actifs[etat.actif]); rendrePositions(); rendrePortefeuille(); }

  const desabonner = cnx.abonner(quoi => {
    if (quoi === 'etat') {
      const e = cnx.store.etat, x = e.actifs[etat.actif];
      if (etat.histoActif === etat.actif + etat.unite && x.bougies[etat.unite]) graph.bougieLive(x.bougies[etat.unite]); else rendreHistorique();
      rendreTete(); surcouches(); carnet.maj(etat.actif, x); rendrePositions(); rendrePortefeuille(); alertesNouvelles();
    } else if (quoi.startsWith('historique:')) { if (quoi === 'historique:' + etat.actif) { etat.histoActif = null; rendreHistorique(); surcouches(); } }
    else if (quoi === 'lent') { rendrePositions(); rendrePortefeuille(); surcouches(); }
    else if (quoi === 'courbe') { dernierPf = ''; rendrePortefeuille(); }
    else rendreTete();
  });
  graph.pret.then(() => { cnx.regarder(etat.actif); tout(); }).catch(e => { $('.at-graphique').innerHTML = '<p class="at-vide">' + esc(e.message) + '</p>'; tout(); });
  graph.montrerPassees(etat.passees);
  return { connexion: cnx, racine: R, graphique: graph, choisir(a) { if (PAR_ID[a]) { etat.actif = a; cnx.regarder(a); etat.histoActif = null; tout(); } }, detruire() { desabonner(); ro.disconnect(); graph.detruire(); carnet.detruire(); if (!connexion) cnx.fermer(); } };
}
