/* ═════════════ TERMINAL OR : MES OUTILS (dessin, surveillance, alertes, registre) ═════════════
   Barre compacte (ligne, zone, tendance, rayon, position en lignes), liste modifiable, niveaux majeurs proposés (H4 et Jour),
   surveillance à la clôture des bougies H1 Kraken (fleches-v10.js : approche, touche, rebond confirmé, cassure, position, alerte libre),
   alertes (historique, son, notification, Telegram facultatif), registre daté en AJOUT SEUL avec excursions sur 48 bougies.
   Information de lecture seulement : jamais un ordre, jamais un signal ni une promesse. Tout reste sur l'appareil (IndexedDB). */
import { creer, modifier, libelle, calculPosition, NOMS, COULEURS, DEFAUTS_POSITION, exporter, importer } from './outils-calcul.js';
import { atrLocal } from './niveaux-periode.js';
import { detecterRetests, autoriser } from './zones-alertes.js';
import { surveiller, fractalesMajeures, niveauxProposes, excursionEvenement, bilanRegistre, bilanV10, REGLES_V10, TEXTE_REGLES_V10, DEPUIS_V10 } from './fleches-v10.js';
import { ouvrirStockage } from './stockage-outils.js';
import { bougiesKraken } from './sources-or.js';
import { chargerHistorique } from './historique-or.js';
import { fusionner } from './bougies-or.js';
import { heureParis } from './temps-or.js';

const H = 3600e3, CLE_REGL = 'rayle_or_outils_regl', CLE_PROP = 'rayle_or_proposes_v10';
export const REGLAGES_DEFAUT = Object.freeze({ ma200: false, ma200H1: false, niveauxAuto: false, anciennesFleches: false, aimant: true, son: false, notif: false, telegram: false, risquePct: DEFAUTS_POSITION.risquePct, capital: DEFAUTS_POSITION.capital });
const lireJ = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrireJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage refusé */ } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nb = (x, d = 2) => x == null || !Number.isFinite(+x) ? '—' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pause = () => new Promise(r => setTimeout(r, 0));
export const TEXTES_EV = Object.freeze({ approche: 'approche', retest: 'retest du niveau cassé', touche: 'touche', rebond: 'rebond confirmé', cassure: 'cassure confirmée', entree: 'prix d’entrée touché', stop: 'stop touché', objectif: 'objectif touché', plus1R: '+1 R atteint : tu peux envisager de remonter le stop au prix d’entrée (break-even)', alerte: 'prix d’alerte touché' });
const AVERT = 'Information de lecture, pas un signal ni une promesse.';
const OUTILS_BARRE = [['horizontale', '─', 'Support / résistance : un clic sur le prix'], ['zone', '▭', 'Zone : deux clics (bord haut et bord bas)'], ['tendance', '╱', 'Ligne de tendance : deux clics'], ['rayon', '↗', 'Rayon : deux clics'], ['position', '📐', 'Position : trois clics (entrée, stop, objectif)']];

/* SMA 200 (valeurs alignées sur les bougies) */
export function sma(B, n = 200) { const out = []; let s = 0; for (let i = 0; i < B.length; i++) { s += B[i].c; if (i >= n) s -= B[i - n].c; if (i >= n - 1) out.push({ t: B[i].t, v: s / n }); } return out; }
/* SMA 200 H1 posée sur les bougies affichées : dernière valeur H1 CLOSE à l'ouverture de chaque bougie affichée (aucun point inventé) */
export function smaSurBougies(B, M) { const out = []; let k = -1; for (const b of B) { while (k + 1 < M.length && M[k + 1].t + H <= b.t + 1) k++; if (k >= 0) out.push({ t: b.t, v: M[k].v }); } return out; }

export function monterOutils(T, { stockage = null, fetchFn = fetch, maintenant = () => Date.now(), intervalle = 60e3, chargerH1 = null, chargerHist = null } = {}) {
  const R = T.R, q = s => R.querySelector(s), graph = T.graph, moteur = T.moteur;
  const regl = { ...REGLAGES_DEFAUT, ...lireJ(CLE_REGL, {}) };
  const E = { objets: [], decisions: [], alertes: [], registre: [], suivis: [], C: [], res: { ev: [], fleches: [], croix: [], etats: {} }, proposes: [], fractales: [], selection: null, pret: false, derAnalyse: 0, pireTache: 0, erreur: null, derAlerte: new Map(), dejaDit: new Set(), etapeTexte: '' };
  let st = null, minuteur = null, enCours = false, detruit = false;

  /* ─── barre compacte (dans l'en-tête, à la place de l'ancien bouton Position) ─── */
  const barre = q('.tor-outils'), ancien = barre.querySelector('[data-a="position"]');
  const htmlBarre = `<span class="tor-ob" role="toolbar" aria-label="Outils de dessin">${OUTILS_BARRE.map(([t, g, titre]) => `<button type="button" data-outil="${t}" title="${esc(titre)}" aria-pressed="false">${g}<span class="tor-ob-nom"> ${t === 'horizontale' ? 'Ligne' : t === 'position' ? 'Position' : NOMS[t]}</span></button>`).join('')}<button type="button" data-o="aimant" title="Aimantation aux hauts et bas des bougies" aria-pressed="${regl.aimant}">🧲</button>
    <details class="tor-ob-aff"><summary title="Affichage">Affichage</summary><div class="tor-ob-pan">
      <label><input type="checkbox" data-or="ma200"> MA200 (SMA 200 de l’unité affichée)</label>
      <label><input type="checkbox" data-or="ma200H1"> SMA 200 H1 sur toutes les unités</label>
      <label><input type="checkbox" data-or="niveauxAuto"> Niveaux automatiques détaillés</label>
      <label><input type="checkbox" data-or="anciennesFleches"> Anciennes flèches (v1 à v9)</label>
      <hr><button type="button" data-o="exporter">Exporter mes outils (JSON)</button><label class="tor-ob-imp">Importer <input type="file" accept="application/json,.json" data-o="importer"></label></div>
    </details></span>`;
  if (ancien) ancien.outerHTML = htmlBarre; else barre.insertAdjacentHTML('afterbegin', htmlBarre);
  const etape = q('[data-pos]');

  /* ─── bloc « Mes outils » sous le graphique ─── */
  const bloc = document.createElement('section'); bloc.className = 'tor-bloc tor-mo'; bloc.dataset.outilsBloc = '';
  bloc.innerHTML = `<h2>Mes outils <small>surveillés à la clôture des bougies H1 · ${esc(AVERT)}</small></h2>
    <p class="tor-doux" data-mo-etat>Chargement…</p>
    <div class="tor-mo-grille">
      <div><h3>Mes objets</h3><ol class="tor-mo-liste" data-mo-liste></ol><div data-mo-edition></div></div>
      <div><h3>Niveaux majeurs proposés <small>grands creux et sommets H4 et Jour (60 bougies de chaque côté)</small></h3><ol class="tor-mo-liste" data-mo-proposes></ol></div>
      <div><h3>Alertes <small>fonctionnent tant que Rayle est ouvert</small></h3>
        <div class="tor-mo-regl"><label><input type="checkbox" data-or="son"> Son discret</label> <label><input type="checkbox" data-or="notif"> Notification</label> <label><input type="checkbox" data-or="telegram"> Telegram (désactivé par défaut)</label></div>
        <ol class="tor-mo-alertes" data-mo-alertes></ol></div>
    </div>
    <details><summary>Registre et bilans <small>mesures, jamais une décision</small></summary><div data-mo-bilan></div></details>
    <details><summary>Règles figées des flèches ${REGLES_V10.version} (commit ${DEPUIS_V10.commit}, ${DEPUIS_V10.texte})</summary><pre class="tor-regles">${esc(TEXTE_REGLES_V10)}</pre></details>`;
  const ecran = q('.tor-ecran1'); ecran.after(bloc);
  const b = s => bloc.querySelector(s);

  /* ─── réglages d'affichage ─── */
  function appliquerAffichage() {
    graph.couches({ sr: regl.niveauxAuto, liquidite: regl.niveauxAuto, flechesTout: regl.anciennesFleches });
    for (const c of R.querySelectorAll('[data-couche]')) c.checked = graph.couches()[c.dataset.couche] !== false;
    for (const s of ['[data-bilan-fleches]']) { const x = q(s); if (x) x.hidden = !regl.anciennesFleches; }
    const vh = q('[data-versions-h1]'); if (vh && !regl.anciennesFleches) vh.hidden = true;
    graph.aimant(regl.aimant); majMA();
  }
  for (const c of R.querySelectorAll('[data-or]')) {
    c.checked = !!regl[c.dataset.or];
    c.addEventListener('change', async () => {
      const k = c.dataset.or; regl[k] = c.checked;
      if (k === 'notif' && c.checked && typeof Notification !== 'undefined' && Notification.permission !== 'granted') { try { const p = await Notification.requestPermission(); if (p !== 'granted') { regl.notif = false; c.checked = false; T.notifier('Notifications refusées par le navigateur.', { niveau: 'doux', dit: false, raison: 'autorisation' }); } } catch (e) { regl.notif = false; c.checked = false; } }
      ecrireJ(CLE_REGL, regl); appliquerAffichage(); if (k === 'anciennesFleches' || k === 'niveauxAuto') T.rendre && T.rendre();
    });
  }

  /* ─── MA200 ─── */
  let derMA = '';
  function majMA() {
    if (!regl.ma200 && !regl.ma200H1) { if (derMA) { graph.ma200(null); derMA = ''; } return; }
    const B = moteur.serie() || [], P = moteur.S.periode; if (!B.length) return;
    const pts = regl.ma200H1 ? smaSurBougies(B, sma(E.C, 200)) : sma(B, 200);
    const cle = `${P}|${regl.ma200H1}|${B.length}|${B[B.length - 1].t}|${B[B.length - 1].c}|${E.C.length}`; if (cle === derMA) return; derMA = cle;
    graph.ma200(pts);
  }

  /* ─── création, sélection, modification ─── */
  function choisirOutil(type) {
    const m = graph.modeOutil(graph.etat().modeOutil === type ? null : type);
    for (const x of R.querySelectorAll('[data-outil]')) x.setAttribute('aria-pressed', String(x.dataset.outil === m));
    if (etape) { etape.hidden = !m; etape.textContent = m ? texteEtape(m, 0) : ''; }
  }
  const texteEtape = (m, n) => m === 'position' ? ['Clique sur le prix d’entrée.', 'Clique sur le stop.', 'Clique sur l’objectif.'][n] : m === 'horizontale' ? 'Clique sur le prix du niveau.' : m === 'zone' ? ['Clique sur un bord de la zone.', 'Clique sur l’autre bord.'][n] : ['Clique sur le premier point.', 'Clique sur le second point.'][n];
  graph.surEtapeOutil = (m, n) => { if (etape) etape.textContent = texteEtape(m, n); };
  graph.surCreationOutil = async (type, pts) => {
    for (const x of R.querySelectorAll('[data-outil]')) x.setAttribute('aria-pressed', 'false'); if (etape) etape.hidden = true;
    const t = maintenant(), d = type === 'horizontale' ? { p: pts[0].p } : type === 'zone' ? { bas: pts[0].p, haut: pts[1].p } : type === 'position' ? { entree: pts[0].p, stop: pts[1].p, objectif: pts[2].p, t0: pts[0].t, risquePct: regl.risquePct, capital: regl.capital } : { t1: pts[0].t, p1: pts[0].p, t2: pts[1].t, p2: pts[1].p };
    const o = creer(type, d, { t }); if (!o) { T.notifier('Objet invalide : recommence (deux points différents, stop différent de l’entrée).', { niveau: 'doux', dit: false, raison: 'saisie' }); return; }
    await enregistrer(o); selectionner(o.id); analyser();
  };
  graph.surModifOutil = (id, champs) => changer(id, champs);
  graph.surSelectionOutil = id => selectionner(id);
  graph.surClicPropose = pr => { const li = b(`[data-cle="${CSS.escape(pr.cle)}"]`); if (li) { li.scrollIntoView({ block: 'nearest' }); li.classList.add('tor-mo-vu'); setTimeout(() => li.classList.remove('tor-mo-vu'), 1500); } };
  const GEOM = ['p', 'bas', 'haut', 't1', 'p1', 't2', 'p2', 'entree', 'stop', 'objectif'];
  async function changer(id, champs) {
    const o = E.objets.find(x => x.id === id); if (!o) return null;
    const n = modifier(o, champs); if (!n) { T.notifier('Modification refusée (valeur invalide).', { niveau: 'doux', dit: false, raison: 'saisie' }); envoyerAuGraphique(); return null; }
    // la surveillance repart de la modification : le passé d'un objet déplacé n'est jamais réécrit (les flèches déjà posées restent au registre)
    n.modifie = GEOM.some(k => k in champs && champs[k] !== o[k]) ? maintenant() : o.modifie;
    await enregistrer(n); analyser(); return n;
  }
  async function enregistrer(o) { const i = E.objets.findIndex(x => x.id === o.id); if (i >= 0) E.objets[i] = o; else E.objets.push(o); if (st) await st.mettre('objets', o); rendreListe(); envoyerAuGraphique(); }
  async function supprimer(id) { E.objets = E.objets.filter(x => x.id !== id); if (st) await st.supprimer('objets', id); if (E.selection === id) E.selection = null; rendreListe(); analyser(); }
  function selectionner(id) { E.selection = id; graph.outils({ selection: id }); rendreListe(); }

  /* ─── liste et édition ─── */
  function rendreListe() {
    const L = b('[data-mo-liste]');
    L.innerHTML = E.objets.map(o => `<li data-id="${esc(o.id)}" class="${o.id === E.selection ? 'tor-mo-sel' : ''}"><i style="background:${esc(o.couleur)}"></i><button type="button" data-mo="choisir" data-id="${esc(o.id)}">${esc(libelle({ ...o, retourne: etatDe(o).retourne }))}</button>${o.alerte ? ' <small>alerte</small>' : ''}</li>`).join('') || '<li class="tor-doux">Aucun objet : choisis un outil dans la barre puis clique sur le graphique.</li>';
    const o = E.objets.find(x => x.id === E.selection), ed = b('[data-mo-edition]');
    if (!o) { ed.innerHTML = ''; return; }
    const champ = (k, lab) => `<label>${lab} <input type="number" step="0.01" data-c="${k}" value="${o[k]}"></label>`;
    const geo = o.type === 'horizontale' ? champ('p', 'Prix') : o.type === 'zone' ? champ('haut', 'Haut') + champ('bas', 'Bas') : o.type === 'position' ? champ('entree', 'Entrée') + champ('stop', 'Stop') + champ('objectif', 'Objectif') + `<label>Risque % <input type="number" step="0.05" min="0.05" max="5" data-c="risquePct" value="${o.risquePct}"></label><label>Compte $ <input type="number" step="100" min="100" data-c="capital" value="${o.capital}"></label>` : champ('p1', 'Prix 1') + champ('p2', 'Prix 2');
    const c = o.type === 'position' ? calculPosition(o) : null;
    ed.innerHTML = `<div class="tor-mo-ed" data-ed="${esc(o.id)}"><b>${esc(NOMS[o.type])}</b>${geo}
      <label>Étiquette <input type="text" maxlength="40" data-c="etiquette" value="${esc(o.etiquette)}"></label>
      <label>Couleur <input type="color" data-c="couleur" value="${esc(/^#[0-9a-f]{6}$/i.test(o.couleur) ? o.couleur : COULEURS[o.type])}"></label>
      <label>Épaisseur <select data-c="epaisseur">${[1, 2, 3].map(e => `<option${e === o.epaisseur ? ' selected' : ''}>${e}</option>`).join('')}</select></label>
      <label><input type="checkbox" data-c="alerte"${o.alerte ? ' checked' : ''}> M’alerter</label>
      <label><input type="checkbox" data-c="muet"${o.muet ? ' checked' : ''}> Muet (journal seulement)</label>
      <label><input type="checkbox" data-c="repete"${o.repete !== false ? ' checked' : ''}> Annoncer à chaque fois (sinon une seule fois)</label>
      ${c ? `<p class="tor-doux">${c.sens === 'achat' ? 'Achat' : 'Vente'} (déduit du stop) · risque ${nb(c.risque, 0)} $ · taille ${nb(c.taille, 3)} contrats (1 oz) · risque réel ${nb(c.risqueReel, 0)} $</p><button type="button" data-mo="journal">Enregistrer dans mon journal</button>` : ''}
      <button type="button" data-mo="supprimer">Supprimer</button> <button type="button" data-mo="fermer">Fermer</button></div>`;
  }
  bloc.addEventListener('click', async e => {
    const x = e.target.closest('[data-mo]'); if (!x) return; const a = x.dataset.mo;
    if (a === 'choisir') selectionner(x.dataset.id);
    else if (a === 'fermer') selectionner(null);
    else if (a === 'supprimer' && E.selection) supprimer(E.selection);
    else if (a === 'journal') versJournal(E.objets.find(o => o.id === E.selection));
    else if (a === 'confirmer' || a === 'rejeter') decider(x.dataset.cle, a === 'confirmer');
  });
  bloc.addEventListener('change', e => {
    const i = e.target.closest('[data-c]'), ed = e.target.closest('[data-ed]'); if (!i || !ed) return; const k = i.dataset.c;
    const v = i.type === 'checkbox' ? i.checked : i.type === 'number' || k === 'epaisseur' ? +i.value : i.value;
    if (k === 'risquePct' || k === 'capital') { regl[k] = v; ecrireJ(CLE_REGL, regl); }
    changer(ed.dataset.ed, { [k]: v });
  });
  function versJournal(o) {
    if (!o || o.type !== 'position') return; const c = calculPosition(o);
    graph.poserPosition({ entree: o.entree, stop: o.stop, objectif: o.objectif });
    const g = T.modules && T.modules.gardien; if (g && g.majPosition) g.majPosition(graph.position());   // le calculateur de taille du gardien reprend la position
    const jb = q('[data-journal-bloc]'), btn = jb && jb.querySelector('[data-a="j-depuis-position"]');
    if (!btn) { T.notifier('Le journal n’est pas chargé ici.', { niveau: 'doux', dit: false, raison: 'module absent' }); return; }
    btn.click(); const t = jb.querySelector('[name="taille"]'); if (t && c) t.value = c.taille;
    jb.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ─── niveaux proposés ─── */
  async function decider(cle, confirmer) {
    const pr = E.proposes.find(p => p.cle === cle); if (!pr) return;
    const d = { cle, etat: confirmer ? 'confirme' : 'supprime', p: pr.p, t: maintenant() }; E.decisions.push(d); if (st) await st.mettre('decisions', d);
    if (confirmer) { const o = creer('horizontale', { p: pr.p, origine: 'propose', etiquette: '' }, { t: maintenant() }); if (o) await enregistrer(o); }
    majProposes(); analyser();
  }
  function majProposes() {
    E.proposes = niveauxProposes(E.fractales, E.decisions, maintenant());
    b('[data-mo-proposes]').innerHTML = E.proposes.map(p => `<li data-cle="${esc(p.cle)}"><span>${p.sorte === 'sommet' ? 'Sommet' : 'Creux'} ${p.unite === 'J' ? 'Jour' : p.unite} <b>${nb(p.p)}</b> <small>${new Date(p.t).toLocaleDateString('fr-FR')}</small></span> <button type="button" data-mo="confirmer" data-cle="${esc(p.cle)}">Mon niveau</button><button type="button" data-mo="rejeter" data-cle="${esc(p.cle)}">Supprimer</button></li>`).join('') || `<li class="tor-doux">${E.fractales.length ? 'Tous les niveaux proposés sont traités.' : 'Calcul des grands creux et sommets…'}</li>`;
    envoyerAuGraphique();
  }
  async function chargerFractales() {
    const c = lireJ(CLE_PROP, null); if (c && c.t > maintenant() - 6 * H && Array.isArray(c.f)) { E.fractales = c.f; majProposes(); return; }
    try {
      const f = [];
      for (const [u, P0] of [['H4', 4 * H], ['J', 24 * H]]) { const Hh = await (chargerHist ? chargerHist(u) : chargerHistorique(u, { fetchFn })); const B = fusionner(Hh.ref || [], Hh.k || []).filter(x => x.t + P0 <= maintenant()); await pause(); f.push(...fractalesMajeures(B, 60, P0, u)); await pause(); }
      E.fractales = f; ecrireJ(CLE_PROP, { t: maintenant(), f }); majProposes();
    } catch (e) { b('[data-mo-proposes]').innerHTML = `<li class="tor-doux">Niveaux proposés indisponibles : ${esc(e.message)}</li>`; }
  }

  /* ─── surveillance (H1 Kraken, bougies closes seulement : aucun repeint) ─── */
  const etatDe = o => (E.res.etats && E.res.etats[o.id]) || {};
  const effectifs = () => E.objets.map(o => o.modifie ? { ...o, cree: Math.max(o.cree, o.modifie) } : o);
  async function analyser() {
    if (enCours || detruit) { analyser.encore = true; return; } enCours = true;
    try {
      const n = maintenant(), C = E.C.filter(x => x.t + H <= n); const out = { ev: [], fleches: [], croix: [], etats: {} };
      // par morceaux : un objet à la fois, la main est rendue entre deux (jamais de longue pause de l'interface)
      for (const o of effectifs()) { const t0 = performance.now(), r = surveiller(C, [o]); out.ev.push(...r.ev); out.fleches.push(...r.fleches); out.croix.push(...r.croix); Object.assign(out.etats, r.etats); E.pireTache = Math.max(E.pireTache, performance.now() - t0); await pause(); if (detruit) return; }
      { const A2 = atrLocal(C, REGLES_V10.atrN); const rt = detecterRetests(C, out.ev, A2); out.ev.push(...rt); for (const r of rt) out.fleches.push({ t: r.t, objet: r.objet, sens: r.sens, niveau: r.niveau, type: 'retest' }); }
      out.ev.sort((x, y) => x.t - y.t); E.res = out; E.derAnalyse = n;
      await enregistrerEvenements(C, out.ev, n); await suivre(C);
      envoyerAuGraphique(); rendreListe(); rendreBilan(C); majMA(); rendreEtat();
    } catch (e) { E.erreur = e.message; rendreEtat(); }
    finally { enCours = false; if (analyser.encore) { analyser.encore = false; setTimeout(analyser, 0); } }
  }
  async function enregistrerEvenements(C, ev, n) {
    const connus = new Set(E.registre.map(x => x.id));
    for (const e of ev) {
      if (connus.has(e.id)) continue; const o = E.objets.find(x => x.id === e.objet);
      const rec = { ...e, nom: o ? libelle(o) : e.objet, vu: n, version: REGLES_V10.version };
      const ok = st ? await st.ajouter('registre', rec) : true; if (!ok) continue; E.registre.push(rec); connus.add(e.id);
      // annoncé seulement si la bougie vient de clore (les événements trouvés au rattrapage sont seulement enregistrés)
      if (e.t + H >= n - 2 * H) await alerter(rec, o);
    }
  }
  async function suivre(C) {
    const faits = new Set(E.suivis.map(s => s.id));
    for (const e of E.registre) { if (faits.has(e.id) || e.type === 'alerte') continue; const x = excursionEvenement(C, e); if (!x) continue; const rec = { ...x, outil: e.outil, type: e.type, mesure: maintenant() }; if (!st || await st.ajouter('suivis', rec)) { E.suivis.push(rec); faits.add(rec.id); } }
  }

  /* ─── alertes ─── */
  let audio = null;
  function bip() { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = 660; g.gain.value = 0.04; o.connect(g); g.connect(audio.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.25); o.stop(audio.currentTime + 0.26); } catch (e) { /* audio refusé */ } }
  async function alerter(e, o) {
    const cle = `${e.objet}|${e.type}`, annonce = autoriser(o, e, E.dejaDit), der = E.derAlerte.get(cle) || 0, n = maintenant(), leger = e.type === 'approche';
    const texte = `${o ? libelle(o) : 'Objet supprimé'} : ${TEXTES_EV[e.type] || e.type} à ${nb(e.prix)} (bougie H1 de ${heureParis(e.t)}). ${AVERT}`;
    const dit = annonce && n - der >= REGLES_V10.delaiAlerteMin * 60e3;   // anti-doublon : même objet et même type, délai minimum
    const a = { id: e.id, objet: e.objet, type: e.type, prix: e.prix, t: e.t, heure: n, texte, dit }; E.alertes.unshift(a); E.alertes.length = Math.min(E.alertes.length, 300); if (st) await st.mettre('alertes', a);
    rendreAlertes(); if (!dit) return; E.derAlerte.set(cle, n); E.dejaDit.add(cle);
    T.notifier(texte, { niveau: leger ? 'doux' : e.type === 'cassure' || e.type === 'stop' ? 'fort' : 'info', dit: true, t: n });
    if (regl.son && !leger) bip();
    if (regl.notif && typeof Notification !== 'undefined' && Notification.permission === 'granted') { try { new Notification('Rayle · or', { body: texte, tag: cle, silent: !regl.son }); } catch (x) { /* refusé */ } }
    if (regl.telegram && !leger && T.envoyerTelegram) T.envoyerTelegram(texte);
  }
  function rendreAlertes() {
    b('[data-mo-alertes]').innerHTML = E.alertes.slice(0, 60).map(a => `<li class="${a.dit ? '' : 'tor-doux'}"><time>${heureParis(a.heure)}</time> <b>${esc(TEXTES_EV[a.type] || a.type)}</b> ${nb(a.prix)} · ${esc((E.objets.find(o => o.id === a.objet) && libelle(E.objets.find(o => o.id === a.objet))) || 'objet supprimé')}${a.dit ? '' : ' <small>(non annoncée : délai anti-doublon)</small>'}</li>`).join('') || '<li class="tor-doux">Aucune alerte pour l’instant.</li>';
  }

  /* ─── graphique : objets, proposés, flèches v10 et croix (registre ∪ calcul : une flèche posée n'est jamais déplacée ni retirée) ─── */
  function marques() {
    const F = new Map(), X = new Map();
    for (const e of E.registre) { if (e.type === 'rebond') F.set(e.id, { t: e.t, sens: e.sens, niveau: e.niveau, objet: e.objet }); if (e.type === 'cassure') X.set(e.id, { t: e.t, niveau: e.niveau, objet: e.objet }); }
    for (const f of E.res.fleches) F.set(`${f.objet}|${f.type === 'retest' ? 'retest' : 'rebond'}|${f.t}`, f); for (const c of E.res.croix) X.set(`${c.objet}|cassure|${c.t}`, c);
    return { fleches: [...F.values()], croix: [...X.values()] };
  }
  function envoyerAuGraphique() {
    const { fleches, croix } = marques();
    // posées à la clôture de la bougie H1 (instant t + 1 h − 1 ms), sur la bougie affichée qui contient cet instant
    graph.outils({ objets: E.objets.map(o => ({ ...o, retourne: !!etatDe(o).retourne })), proposes: E.proposes, selection: E.selection,
      fleches10: fleches.map(f => ({ ...f, t: f.t + H - 1 })), croix: croix.map(c => ({ ...c, t: c.t + H - 1 })) });
  }

  /* ─── bilans ─── */
  function rendreBilan(C) {
    const L = bilanRegistre(E.registre, E.suivis), { fleches } = marques();
    const autres = Object.fromEntries(Object.entries(moteur.S.bilansH1 || {}).map(([v, x]) => [v, { p: x && x.p != null ? x.p : null }]));
    let bv = null; try { bv = bilanV10(C, fleches, { maintenant: maintenant(), autres }); } catch (e) { bv = null; }
    const ligne = x => `<tr><td>${esc(NOMS[x.outil])}</td><td>${esc(TEXTES_EV[x.type] || x.type)}</td><td>${x.n}</td><td>${x.assez ? `${nb(x.favAtr)} ATR (${nb(x.favPct)} %)` : 'pas assez de données'}</td><td>${x.assez ? `${nb(x.advAtr)} ATR (${nb(x.advPct)} %)` : `${x.mesures} / ${REGLES_V10.minEvenements}`}</td></tr>`;
    b('[data-mo-bilan]').innerHTML = `<p class="tor-doux">Registre daté, en ajout seul : ${E.registre.length} événement(s), ${E.suivis.length} mesuré(s) sur ${REGLES_V10.excursionBougies} bougies H1. Les excursions décrivent ce qui s’est passé ensuite ; elles ne servent jamais de décision.</p>
      <table class="tor-mo-tab"><thead><tr><th>Outil</th><th>Événement</th><th>N</th><th>Excursion favorable (médiane)</th><th>Défavorable (médiane)</th></tr></thead><tbody>${L.map(ligne).join('') || '<tr><td colspan="5">Aucun événement enregistré pour l’instant.</td></tr>'}</tbody></table>
      <p data-mo-bilan-v10><b>Flèches ${REGLES_V10.version}</b> (depuis son commit ${DEPUIS_V10.commit}, ${DEPUIS_V10.texte}) : ${bv ? esc(bv.texte) : 'pas encore de bougie H1 depuis le commit.'}</p>`;
    E.bilanV10 = bv;
  }
  function rendreEtat() {
    const n = E.objets.length, txt = E.erreur ? `Surveillance interrompue : ${E.erreur}` : !E.C.length ? 'Chargement des bougies H1 de Kraken…' : `${n} objet(s) surveillé(s) sur ${E.C.length} bougies H1 closes · dernière analyse ${heureParis(E.derAnalyse)} · stockage ${st ? st.type : '—'}. Les alertes fonctionnent tant que Rayle est ouvert.`;
    b('[data-mo-etat]').textContent = txt;
  }

  /* ─── boucle : bougies H1 Kraken (indépendantes de l'unité affichée) ─── */
  async function tour() {
    if (detruit) return;
    try { const L = chargerH1 ? await chargerH1() : await bougiesKraken('H1', { n: 1500, fetchFn, maintenant: maintenant() }); if (L && L.length) { E.C = fusionner(E.C, L); E.erreur = null; } }
    catch (e) { E.erreur = 'bougies H1 indisponibles (' + e.message + ')'; rendreEtat(); }
    await analyser();
  }

  /* ─── barre : clics ─── */
  barre.addEventListener('click', e => {
    const x = e.target.closest('[data-outil],[data-o]'); if (!x) return;
    if (x.dataset.outil) { choisirOutil(x.dataset.outil); return; }
    if (x.dataset.o === 'aimant') { regl.aimant = !regl.aimant; x.setAttribute('aria-pressed', String(regl.aimant)); ecrireJ(CLE_REGL, regl); graph.aimant(regl.aimant); }
    else if (x.dataset.o === 'exporter') {
      const txt = exporter(E.objets, E.decisions), u = URL.createObjectURL(new Blob([txt], { type: 'application/json' })), a = document.createElement('a');
      a.href = u; a.download = `rayle-or-outils-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); E.dernierExport = txt;
    }
  });
  const imp = barre.querySelector('[data-o="importer"]');
  imp.addEventListener('change', async () => { const f = imp.files && imp.files[0]; if (!f) return; await importerTexte(await f.text()); imp.value = ''; });
  async function importerTexte(txt) {
    const r = importer(txt); if (r.erreur) { T.notifier('Import impossible : ' + r.erreur, { niveau: 'doux', dit: false, raison: 'import' }); return r; }
    for (const o of r.objets) await enregistrer(o);
    for (const d of r.decisions) if (!E.decisions.some(x => x.cle === d.cle)) { E.decisions.push(d); if (st) await st.mettre('decisions', d); }
    T.notifier(`${r.objets.length} objet(s) importé(s)${r.ignores ? `, ${r.ignores} ignoré(s)` : ''}.`, { niveau: 'doux', dit: false, raison: 'import' }); majProposes(); analyser(); return r;
  }
  addEventListener('keydown', surTouche);
  function surTouche(e) {
    if (e.key === 'Escape' && graph.etat().modeOutil) choisirOutil(null);
    else if ((e.key === 'Delete' || e.key === 'Backspace') && E.selection && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) supprimer(E.selection);
  }

  /* ─── démarrage ─── */
  const pret = (async () => {
    st = stockage || await ouvrirStockage();
    [E.objets, E.decisions, E.alertes, E.registre, E.suivis] = await Promise.all(['objets', 'decisions', 'alertes', 'registre', 'suivis'].map(s => st.tous(s)));
    E.objets.sort((a, b2) => a.cree - b2.cree); E.alertes.sort((a, b2) => b2.heure - a.heure);
    appliquerAffichage(); rendreListe(); rendreAlertes(); envoyerAuGraphique(); majProposes(); rendreEtat();
    await tour(); minuteur = setInterval(tour, intervalle); setTimeout(chargerFractales, 1500); E.pret = true;
  })();

  const api = {
    E, regl, pret, analyser, tour, choisirOutil, changer, supprimer, selectionner, importerTexte, decider, chargerFractales,
    creer: async (type, d) => { const o = creer(type, { ...d, ...(type === 'position' ? { risquePct: d.risquePct ?? regl.risquePct, capital: d.capital ?? regl.capital } : {}) }, { t: d.cree ?? maintenant() }); if (o) { await enregistrer(o); await analyser(); } return o; },
    ajouterBougies: async L => { E.C = fusionner(E.C, L); await analyser(); },
    regler: k => { Object.assign(regl, k); ecrireJ(CLE_REGL, regl); for (const c of R.querySelectorAll('[data-or]')) c.checked = !!regl[c.dataset.or]; appliquerAffichage(); },
    majMarche: () => majMA(),
    detruire() { detruit = true; clearInterval(minuteur); removeEventListener('keydown', surTouche); }
  };
  return api;
}
