import { construireCarte, echelleIntensite } from '../../../../strategies/liquidite/carte-chaleur.js';
import { serieDesequilibre, cumulDelta } from '../../../../strategies/liquidite/flux-indicateurs.js';
import { fmtPrix } from '../../../../strategies/liquidite/aimants.js';
import { dessiner, miseEnPage, convertisseurs, plagePrix, couleurMur } from './rendu-carte.js';
import { creerSourcePC, creerSourceDirecte } from './sources.js';

/* ═════════════ FENÊTRE « CARTE DE LIQUIDITÉ » (V4, phase 4) — une carte de chaleur du carnet d'ordres, comme Bookmap ═════════════
   Ouverte par `window.CarteLiquidite.ouvrir({ actif, flux })`, depuis le terminal de Mars, l'agent, la voix (« ouvre la carte de liquidité ») ou le tableau de bord. Même moteur de fenêtres que le reste
   (Panneaux : déplaçable, redimensionnable, rangeable). Sources : le service PC (historique + relecture) sinon la connexion directe du navigateur (direct seulement) ; si rien n'est joignable, la fenêtre le dit.
   Aucun ordre, aucune promesse : le panneau « Où va le marché ? » est une HYPOTHÈSE de lecture du marché, toujours accompagnée de ses limites. */
const ID = 'liquidite-carte', FLUX = { 'binance-spot': 'Binance comptant', 'binance-fut': 'Binance futures', kraken: 'Kraken' }, ACTIFS = ['BTC', 'SOL', 'DOGE'];
let instance = null, ouverture = null;
const lire = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }, ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* interdit */ } };
const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const heure = t => new Date(t).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour12: false });
const dateHeure = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

function creerTampon(max = 3600) {
  let enregs = [], trades = [], evts = [], entete = null, derniereSec = 0, premiereSec = Infinity;
  return {
    vider() { enregs = []; trades = []; evts = []; derniereSec = 0; premiereSec = Infinity; },
    enregs(d) { if (!d || !d.enregistrements) return 0; if (d.entete) entete = d.entete; let n = 0; for (const r of d.enregistrements) if (r.tSec > derniereSec) { enregs.push(r); derniereSec = r.tSec; n++; } if (enregs.length > max) enregs.splice(0, enregs.length - max); if (enregs.length) premiereSec = enregs[0].tSec; return n; },
    enregsAvant(d) { if (!d || !d.enregistrements || !d.enregistrements.length) return; if (d.entete) entete = d.entete; const avant = d.enregistrements.filter(r => r.tSec < premiereSec); enregs = avant.concat(enregs); premiereSec = enregs[0].tSec; derniereSec = enregs[enregs.length - 1].tSec; },
    lignes(type, l) { const cible = type === 'trades' ? trades : evts; const dernier = cible.length ? cible[cible.length - 1].t : 0; for (const x of l) if (x.t > dernier) cible.push(x); if (cible.length > 20000) cible.splice(0, cible.length - 20000); },
    fenetre(t0, t1) { return { donnees: { entete, enregistrements: enregs.filter(r => r.tSec * 1000 >= t0 && r.tSec * 1000 <= t1) }, trades: trades.filter(t => t.t >= t0 && t.t <= t1), evenements: evts.filter(e => e.t >= t0 && e.t <= t1) }; },
    bornes: () => (enregs.length ? { debut: enregs[0].tSec * 1000, fin: derniereSec * 1000 } : null), derniere: () => derniereSec * 1000, taille: () => enregs.length
  };
}

export async function ouvrirCarte(demande = {}) {
  if (instance) { await instance.regler(demande); return instance.api; }
  if (ouverture) { await ouverture; if (instance) await instance.regler(demande); return instance && instance.api; }
  chargerCss(); if (!window.Panneaux) throw new Error('panneaux indisponibles');
  ouverture = new Promise((ok, ko) => {
    try { window.Panneaux.ouvrir({ id: ID, type: 'liquidite', titre: 'CARTE DE LIQUIDITÉ', icone: '💧', taille: 'large', corps: el => { const c = construire(el, demande); instance = c; ok(); return () => { c.detruire(); if (instance === c) instance = null; }; } }); } catch (e) { ko(e); }
  });
  try { await ouverture; } finally { ouverture = null; }
  return instance && instance.api;
}
function chargerCss() { if (document.getElementById('liquidite-css')) return; const l = document.createElement('link'); l.id = 'liquidite-css'; l.rel = 'stylesheet'; l.href = new URL('./liquidite.css', import.meta.url).href; document.head.appendChild(l); }

function construire(el, demande) {
  const section = el.parentNode; if (section && section.classList) section.classList.add('lq-fenetre');
  const etat = { actif: ACTIFS.includes(String(demande.actif || '').toUpperCase()) ? String(demande.actif).toUpperCase() : lire('rayle_lq_actif', 'BTC'), flux: FLUX[demande.flux] ? demande.flux : lire('rayle_lq_flux', 'binance-spot'),
    mode: 'direct', lecture: false, vitesse: 5, fenetreS: Number(lire('rayle_lq_fenetre', '600')) || 600, pct: Number(lire('rayle_lq_zoom', '0.5')) || 0.5, tCurseur: null, analyse: null, erreur: null, source: null, plage: null,
    options: { bulles: lire('rayle_lq_bulles', '1') !== '0', murs: lire('rayle_lq_murs', '1') !== '0', aimants: lire('rayle_lq_aimants', '1') !== '0' } };
  if (!ACTIFS.includes(etat.actif)) etat.actif = 'BTC'; if (!FLUX[etat.flux]) etat.flux = 'binance-spot';
  el.innerHTML = `<div class="lq" data-mode="direct">
    <div class="lq-haut">
      <label>Actif <select data-k="actif">${ACTIFS.map(a => `<option>${a}</option>`).join('')}</select></label>
      <label>Flux <select data-k="flux">${Object.entries(FLUX).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label>
      <label>Fenêtre <select data-k="fenetre"><option value="300">5 min</option><option value="600">10 min</option><option value="1200">20 min</option><option value="1800">30 min</option></select></label>
      <label>Zoom prix <select data-k="zoom"><option value="0.25">±0,25 %</option><option value="0.5">±0,5 %</option><option value="1">±1 %</option><option value="2">±2 %</option></select></label>
      <span class="lq-modes" role="group"><button type="button" data-mode="direct" class="actif">En direct</button><button type="button" data-mode="relecture">Relecture</button></span>
      <span class="lq-puce" data-puce="source"><i></i><b>source ?</b></span>
    </div>
    <div class="lq-note" hidden></div>
    <div class="lq-msg" role="status" hidden></div>
    <div class="lq-corps">
      <div class="lq-carte"><canvas></canvas></div>
      <aside class="lq-lat">
        <section class="lq-ou"><h4>Où va le marché ? <small>hypothèse, pas une promesse</small></h4><ol class="lq-ou-l"><li>En attente de données…</li></ol><ul class="lq-avert"></ul></section>
        <section class="lq-murs"><h4>Murs <small>liquidité posée</small></h4><ul class="lq-murs-l"></ul></section>
        <section class="lq-etat"><h4>Données <small>ce qui est réel</small></h4><ul class="lq-etat-l"></ul></section>
      </aside>
    </div>
    <div class="lq-rel" hidden>
      <button type="button" data-a="lecture" title="Lecture / pause">▶</button>
      <button type="button" data-a="recul" title="−30 s">⏪ 30 s</button><button type="button" data-a="avance" title="+30 s">30 s ⏩</button>
      <label>Vitesse <select data-k="vitesse"><option value="1">1×</option><option value="2">2×</option><option value="5">5×</option><option value="10">10×</option><option value="30">30×</option><option value="60">60×</option></select></label>
      <input type="range" data-k="curseur" min="0" max="1000" value="1000" aria-label="Moment à rejouer"><output class="lq-heure"></output>
    </div>
    <div class="lq-bas">
      <label><input type="checkbox" data-o="bulles"> Bulles de transactions</label><label><input type="checkbox" data-o="murs"> Murs</label><label><input type="checkbox" data-o="aimants"> Aimants</label>
      <span class="lq-marques"><button type="button" data-a="achat" title="Noter : ici j’aurais acheté">＋ J’aurais acheté ici</button><button type="button" data-a="vente" title="Noter : ici j’aurais vendu">− J’aurais vendu ici</button><small class="lq-marques-n"></small></span>
    </div>
    <p class="lq-pied">Carnet agrégé par niveau de prix (pas l’identité des acteurs) : certaines grosses lignes sont des <b>leurres</b>. Pas d’historique gratuit du carnet complet : les idées fondées sur le carnet se prouvent avec des <b>semaines</b> d’enregistrement. Aucun ordre n’est passé.</p>
  </div>`;
  const $ = s => el.querySelector(s), canvas = $('canvas'), ctx = canvas.getContext('2d'), tampon = creerTampon(), racine = $('.lq');
  const note = t => { const n = $('.lq-note'); n.hidden = !t; n.textContent = t || ''; };
  const msg = (t, type = 'info') => { const m = $('.lq-msg'); m.hidden = !t; m.textContent = t || ''; m.dataset.type = type; };
  let source = null, bouclePoll = 0, boucleAnalyse = 0, raf = 0, sale = true, modele = null, tReception = 0, dernierPeint = 0, rafPrevT = 0, detruit = false, ref = 0, occupe = false, plage = null;
  const cle = () => etat.flux + '-' + etat.actif, enReplay = () => etat.mode === 'relecture';
  const etroit = () => canvas.clientWidth < 560;

  async function choisirSource() {
    if (source && source.arreter) source.arreter(); source = null; etat.source = null;
    if (window.__RAYLE_LIQUIDITE_SOURCE__) { source = window.__RAYLE_LIQUIDITE_SOURCE__; }
    else {
      try { const pc = creerSourcePC(), s = await pc.statut(); if (s.ok && (s.enregistre || (s.jours || 0) > 0)) { source = pc; if (!s.enregistre) msg('Le service PC est joint mais l’enregistrement est arrêté : tu vois ce qui a été enregistré, plus rien de neuf. Relance-le : node agent-pc/flux/service-flux.mjs', 'avert'); } } catch (e) { /* service absent */ }
      if (!source) { try { source = await creerSourceDirecte({ actif: etat.actif }); note('Service PC non joint : connexion DIRECTE aux flux publics (direct seulement, pas d’historique, rien n’est gardé après fermeture).'); } catch (e) { msg('Aucune source disponible : le service PC ne répond pas et la connexion directe aux flux publics a échoué (' + String(e.message).slice(0, 80) + '). Vérifie ta connexion Internet.', 'erreur'); } }
    }
    if (source && source.nom !== 'directe') note(''); etat.source = source ? source.nom : null; majPuce();
  }
  function majPuce() { const p = $('[data-puce="source"]'); if (!p) return; p.dataset.etat = !source ? 'ko' : source.nom === 'pc' ? 'pc' : 'directe'; p.querySelector('b').textContent = !source ? 'aucune source' : source.nom === 'pc' ? 'service PC' : source.nom === 'directe' ? 'direct (navigateur)' : source.nom; p.title = source ? source.libelle : 'aucune source'; }

  /* ── tirage des données ── */
  async function tirerLive() {
    if (!source || occupe || enReplay()) return; occupe = true;
    try {
      const t1 = Date.now(), dep = tampon.derniere() || t1 - etat.fenetreS * 1000 - 5000, t0 = tampon.derniere() ? dep + 1 : dep;
      const [d, tr, ev] = await Promise.all([source.profondeur(cle(), t0, t1), source.lignes('trades', cle(), t0 - 1000, t1), source.lignes('evenements', cle(), t0 - 1000, t1)]);
      const n = tampon.enregs(d); tampon.lignes('trades', tr); tampon.lignes('evenements', ev); if (n) { tReception = performance.now(); sale = true; }
      etat.erreur = null;
      if (!tampon.taille()) msg(source.nom === 'directe' ? 'Connexion aux flux… (quelques secondes avant les premières données)' : 'Aucune seconde de carnet enregistrée pour ' + cle() + ' dans cette fenêtre. Le service enregistre-t-il ? (node agent-pc/flux/service-flux.mjs --statut)', 'info'); else if ($('.lq-msg').dataset.type === 'info' && source.nom !== 'directe') msg('');
    } catch (e) { etat.erreur = String(e.message).slice(0, 100); msg('Lecture impossible : ' + etat.erreur, 'erreur'); } finally { occupe = false; }
  }
  async function analyser() {
    if (!source) return;
    try { etat.analyse = await source.analyse(etat.actif, etat.flux, { minutes: Math.ceil(etat.fenetreS / 60) + 5, t: enReplay() ? etat.tCurseur : null }); majLateral(); } catch (e) { /* l'analyse est facultative : la carte continue */ }
  }
  async function chargerReplay(tCentre) {
    if (!source || !source.historique) { msg('La relecture demande le service PC (le mode direct n’a pas d’historique).', 'avert'); return false; }
    const t1 = Math.min(Date.now(), tCentre + 600e3), t0 = Math.max(tCentre - etat.fenetreS * 1000 - 60e3, t1 - 1800e3); tampon.vider();
    try { const [d, tr, ev] = await Promise.all([source.profondeur(cle(), t0, t1), source.lignes('trades', cle(), t0, t1), source.lignes('evenements', cle(), t0, t1)]); tampon.enregs(d); tampon.lignes('trades', tr); tampon.lignes('evenements', ev); sale = true; return tampon.taille() > 0; }
    catch (e) { msg('Lecture impossible : ' + String(e.message).slice(0, 100), 'erreur'); return false; }
  }

  /* ── modèle et dessin ── */
  function preparer() {
    const tFin = enReplay() ? etat.tCurseur : (tampon.derniere() || Date.now()), t0 = tFin - etat.fenetreS * 1000, f = tampon.fenetre(t0, tFin + 1000);
    if (!f.donnees.enregistrements.length) { modele = { message: enReplay() ? 'Pas de données enregistrées à ce moment-là.' : (source ? 'En attente de données…' : 'Aucune source de données.') }; return; }
    const carte = construireCarte(f.donnees, { agregationS: etat.fenetreS > 900 ? 2 : 1 }), ech = echelleIntensite(carte); ref = Math.max(ref * 0.97, ech.reference); ech.reference = ref; const e = ech; e.intensite = x => (x > 0 ? Math.min(1, Math.sqrt(x / ref)) : 0);
    const mids = f.donnees.enregistrements.map(r => [r.tSec * 1000, (r.meilleurBid + r.meilleurAsk) / 2]), pas = f.donnees.entete ? f.donnees.entete.pasPct : 0.02;
    const delta = Float64Array.from(f.trades, x => x.achatUsd - x.venteUsd), cvd = cumulDelta(delta), cvdPoints = f.trades.map((x, i) => [x.t, cvd[i]]);
    const desequ = serieDesequilibre(f.donnees.enregistrements.filter((_, i, a) => a.length < 400 || i % 2 === 0), pas).map((d, i, a) => ({ ...d, t: d.t }));
    const A = etat.analyse && etat.analyse.aimants, murs = etat.analyse ? etat.analyse.murs : [];
    modele = { carte, ech: e, mids, trades: f.trades.map(x => ({ ...x, cloture: x.cloture })), murs, aimants: A, profil: etat.analyse && etat.analyse.profil, cvdPoints, desequ, fenetreS: etat.fenetreS, pct: etat.pct, options: etat.options, tFin };
  }
  function peindre(now) {
    if (detruit) return; raf = requestAnimationFrame(peindre);
    const cadence = etroit() ? 15 : 30; if (now - dernierPeint < 1000 / cadence - 2) return; dernierPeint = now;
    if (!document.body.contains(canvas) || canvas.clientWidth < 10) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = canvas.clientWidth, H = canvas.clientHeight; if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); sale = true; }
    if (sale) { sale = false; preparer(); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (modele && modele.carte) { const base = modele.tFin, glisse = enReplay() ? 0 : Math.min(1000, performance.now() - tReception); dessiner(ctx, W, H, { ...modele, tFin: base + glisse }); } else dessiner(ctx, W, H, modele || { message: 'En attente de données…' });
    // lecture de la relecture
    if (enReplay() && etat.lecture) { const dt = rafPrevT ? now - rafPrevT : 0; etat.tCurseur = Math.min(Date.now(), etat.tCurseur + dt * etat.vitesse); majCurseur(); if (Math.floor(etat.tCurseur / 1000) !== Math.floor((etat.tCurseur - dt * etat.vitesse) / 1000)) sale = true; const b = tampon.bornes(); if (b && etat.tCurseur > b.fin - 120e3 && !occupe) rechargerSuite(); }
    rafPrevT = now;
  }
  async function rechargerSuite() { occupe = true; try { await chargerReplay(etat.tCurseur); } finally { occupe = false; } }

  /* ── panneaux latéraux ── */
  function majLateral() {
    const a = etat.analyse; if (!a) return;
    const ou = $('.lq-ou-l'), av = $('.lq-avert'), ml = $('.lq-murs-l'), el2 = $('.lq-etat-l');
    ou.innerHTML = a.aimants && a.aimants.resume ? a.aimants.resume.map(t => '<li>' + esc(t) + '</li>').join('') : '<li>Pas de zone attractive assez nette autour du prix.</li>';
    av.innerHTML = (a.avertissements || []).map(t => '<li>' + esc(t) + '</li>').join('');
    ml.innerHTML = (a.murs || []).filter(m => m.actif).slice(0, 6).map(m => `<li><i style="background:${couleurMur(m.fiabilite && m.fiabilite.niveau)}"></i><b>${fmtPrix(m.prix)}</b> ${m.cote === 'bid' ? 'acheteur' : 'vendeur'} · ${m.usdMax >= 1e6 ? (m.usdMax / 1e6).toFixed(1) + ' M$' : Math.round(m.usdMax / 1e3) + ' k$'} · ${Math.round(m.dureeS / 60) || '<1'} min · ${esc(m.fiabilite ? m.fiabilite.niveau : '?')}</li>`).join('') || '<li class="lq-doux">Aucun mur actif.</li>';
    const S = a.sources || {}, lig = [];
    lig.push(`Carnet : ${S.carnet && S.carnet.ok ? S.carnet.secondes + ' s dans la fenêtre' : 'indisponible'}${a.couverture ? ' · couverture ±' + Math.min(a.couverture.basPct, a.couverture.hautPct).toFixed(2).replace('.', ',') + ' %' : ''}`);
    lig.push(`Historique du carnet : ${a.joursCarnet != null ? a.joursCarnet.toFixed(1).replace('.', ',') + ' jour(s) enregistrés' : 'direct seulement'} — preuve insuffisante avant 14 jours`);
    lig.push(`Profil de volume : ${S.profil && S.profil.ok ? S.profil.origine : 'indisponible'}`); lig.push(`Stops : ${S.stops && S.stops.ok ? (S.stops.hauts + S.stops.bas) + ' piscines repérées' : 'indisponible'}`); lig.push(`Liquidations : ${S.liquidations && S.liquidations.ok ? 'ESTIMÉES (intérêt ouvert)' : 'indisponible'}`);
    el2.innerHTML = lig.map(t => '<li>' + esc(t) + '</li>').join('');
  }
  function majCurseur() {
    const s = $('[data-k="curseur"]'), o = $('.lq-heure'); if (!plage) return; const f = (etat.tCurseur - plage.debut) / Math.max(1, plage.fin - plage.debut); s.value = String(Math.round(Math.max(0, Math.min(1, f)) * 1000)); o.textContent = dateHeure(etat.tCurseur);
  }
  function majMarques() { try { const l = JSON.parse(lire('rayle_lq_exemples', '[]')); $('.lq-marques-n').textContent = l.length ? l.length + ' exemple(s) noté(s)' : ''; } catch (e) { /* illisible */ } }

  /* ── commandes ── */
  async function regler(d = {}) {
    let recharger = false;
    if (d.actif && ACTIFS.includes(String(d.actif).toUpperCase()) && String(d.actif).toUpperCase() !== etat.actif) { etat.actif = String(d.actif).toUpperCase(); recharger = true; }
    if (d.flux && FLUX[d.flux] && d.flux !== etat.flux) { etat.flux = d.flux; recharger = true; }
    if (d.fenetreS) { etat.fenetreS = d.fenetreS; sale = true; } if (d.zoom) { etat.pct = d.zoom; sale = true; }
    if (d.mode) await basculer(d.mode, d.t);
    if (recharger) { ecrire('rayle_lq_actif', etat.actif); ecrire('rayle_lq_flux', etat.flux); tampon.vider(); ref = 0; etat.analyse = null; if (source && source.nom === 'directe') await choisirSource(); if (enReplay()) await chargerReplay(etat.tCurseur); else await tirerLive(); analyser(); }
    synchroniserControles();
  }
  async function basculer(mode, t) {
    if (mode === 'relecture') {
      if (!source || !source.historique) { msg('La relecture demande le service PC qui enregistre le carnet (le mode direct n’a pas d’historique).', 'avert'); synchroniserControles(); return; }
      plage = await source.plage(cle()).catch(() => null); if (!plage) { msg('Rien d’enregistré à rejouer pour ' + cle() + ' pour l’instant.', 'avert'); return; }
      etat.mode = 'relecture'; etat.lecture = false; etat.tCurseur = Math.max(plage.debut + etat.fenetreS * 1000, Math.min(plage.fin, t || plage.fin - 600e3)); racine.dataset.mode = 'relecture'; $('.lq-rel').hidden = false;
      await chargerReplay(etat.tCurseur); majCurseur(); analyser();
    } else { etat.mode = 'direct'; etat.lecture = false; racine.dataset.mode = 'direct'; $('.lq-rel').hidden = true; tampon.vider(); await tirerLive(); analyser(); }
    synchroniserControles();
  }
  function synchroniserControles() {
    el.querySelectorAll('.lq-modes button').forEach(b => b.classList.toggle('actif', b.dataset.mode === etat.mode));
    $('[data-k="actif"]').value = etat.actif; $('[data-k="flux"]').value = etat.flux; $('[data-k="fenetre"]').value = String(etat.fenetreS); $('[data-k="zoom"]').value = String(etat.pct); $('[data-k="vitesse"]').value = String(etat.vitesse);
    for (const k of ['bulles', 'murs', 'aimants']) $('[data-o="' + k + '"]').checked = !!etat.options[k]; $('[data-a="lecture"]').textContent = etat.lecture ? '⏸' : '▶';
  }
  el.addEventListener('change', async ev => {
    const k = ev.target.dataset && ev.target.dataset.k, o = ev.target.dataset && ev.target.dataset.o;
    if (o) { etat.options[o] = ev.target.checked; ecrire('rayle_lq_' + o, ev.target.checked ? '1' : '0'); sale = true; return; }
    if (k === 'actif') await regler({ actif: ev.target.value }); else if (k === 'flux') await regler({ flux: ev.target.value });
    else if (k === 'fenetre') { ecrire('rayle_lq_fenetre', ev.target.value); await regler({ fenetreS: Number(ev.target.value) }); if (enReplay()) await chargerReplay(etat.tCurseur); }
    else if (k === 'zoom') { ecrire('rayle_lq_zoom', ev.target.value); await regler({ zoom: Number(ev.target.value) }); } else if (k === 'vitesse') etat.vitesse = Number(ev.target.value);
  });
  el.addEventListener('input', async ev => { if (ev.target.dataset && ev.target.dataset.k === 'curseur' && plage) { etat.lecture = false; etat.tCurseur = plage.debut + Number(ev.target.value) / 1000 * (plage.fin - plage.debut); majCurseur(); synchroniserControles(); clearTimeout(ev.target._t); ev.target._t = setTimeout(async () => { await chargerReplay(etat.tCurseur); analyser(); }, 250); } });
  el.addEventListener('click', async ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.mode) return regler({ mode: b.dataset.mode });
    const a = b.dataset.a; if (a === 'lecture') { etat.lecture = !etat.lecture; rafPrevT = 0; synchroniserControles(); }
    else if (a === 'recul' || a === 'avance') { etat.tCurseur += (a === 'recul' ? -30e3 : 30e3); if (plage) etat.tCurseur = Math.max(plage.debut, Math.min(plage.fin, etat.tCurseur)); majCurseur(); const bo = tampon.bornes(); if (!bo || etat.tCurseur < bo.debut + etat.fenetreS * 1000 || etat.tCurseur > bo.fin) await chargerReplay(etat.tCurseur); sale = true; }
    else if (a === 'achat' || a === 'vente') marquer(a);
  });
  function marquer(sens) {
    const t = enReplay() ? etat.tCurseur : (tampon.derniere() || Date.now()), prix = modele && modele.carte ? modele.carte.mid[modele.carte.nT - 1] : null; if (!prix) { msg('Rien à marquer : pas de prix pour l’instant.', 'avert'); return; }
    let l = []; try { l = JSON.parse(lire('rayle_lq_exemples', '[]')); } catch (e) { /* neuf */ } const x = { t, sens, actif: etat.actif, flux: etat.flux, prix, source: enReplay() ? 'relecture' : 'direct', cree: Date.now(), analyse: etat.analyse && etat.analyse.aimants ? { objectif: etat.analyse.aimants.objectif && etat.analyse.aimants.objectif.prix, defense: etat.analyse.aimants.defense && etat.analyse.aimants.defense.prix } : null };
    l.push(x); ecrire('rayle_lq_exemples', JSON.stringify(l.slice(-500))); majMarques(); window.dispatchEvent(new CustomEvent('rayle:exemple-liquidite', { detail: x })); msg('Exemple noté : ' + (sens === 'achat' ? 'achat' : 'vente') + ' vers ' + fmtPrix(prix) + ' à ' + heure(t) + '. Kepler s’en sert pour former des hypothèses, jamais pour valider.', 'info');
  }
  canvas.addEventListener('wheel', ev => { ev.preventDefault(); if (ev.shiftKey) { const l = [300, 600, 1200, 1800], i = Math.max(0, Math.min(3, l.indexOf(etat.fenetreS) + (ev.deltaY > 0 ? 1 : -1))); etat.fenetreS = l[i]; ecrire('rayle_lq_fenetre', String(l[i])); } else { const z = [0.25, 0.5, 1, 2], i = Math.max(0, Math.min(3, z.indexOf(etat.pct) + (ev.deltaY > 0 ? 1 : -1))); etat.pct = z[i]; ecrire('rayle_lq_zoom', String(z[i])); } synchroniserControles(); sale = true; }, { passive: false });

  /* ── démarrage ── */
  synchroniserControles(); majMarques(); majPuce();
  (async () => {
    await choisirSource(); if (detruit) return; await tirerLive(); analyser();
    bouclePoll = setInterval(() => { if (!document.hidden) tirerLive(); }, 1000); boucleAnalyse = setInterval(() => { if (!document.hidden && !(enReplay() && !etat.lecture)) analyser(); }, 5000);
    if (demande.mode === 'relecture') regler({ mode: 'relecture', t: demande.t });
  })();
  raf = requestAnimationFrame(peindre);
  const api = {
    regler, etat: () => ({ ...etat, secondes: tampon.taille(), source: etat.source, murs: etat.analyse ? etat.analyse.murs.length : 0 }), analyse: () => etat.analyse, modele: () => modele, marquer, tampon,
    fermer: () => window.Panneaux && window.Panneaux.fermer(ID), definirSource: async s => { if (source && source.arreter) source.arreter(); source = s; etat.source = s.nom; majPuce(); tampon.vider(); await tirerLive(); analyser(); }
  };
  return { api, regler, detruire() { detruit = true; clearInterval(bouclePoll); clearInterval(boucleAnalyse); cancelAnimationFrame(raf); if (source && source.arreter) source.arreter(); } };
}
export const carteOuverte = () => !!instance;
window.CarteLiquidite = { ouvrir: d => ouvrirCarte(d || {}), fermer: () => { if (window.Panneaux) window.Panneaux.fermer(ID); }, api: () => (instance ? instance.api : null), ouverte: carteOuverte };
