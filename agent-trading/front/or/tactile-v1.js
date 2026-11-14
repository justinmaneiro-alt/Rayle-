/* ═════════════ TERMINAL TACTILE « graphique d'abord » (téléphone et tablette ; 2026-11-13) ═════════════
   Écran tactile = le graphique en plein écran + une barre fine (instrument, M5 / M15 / H1 / H4 / Jour, sélecteur Flèches, ⋯) + une bande RSI repliable.
   Tout le reste (COT, Santé du marché, Institutions, Actualités, Calendrier, Journal, Capital) = petites cases derrière « Données » ; chaque case s'ouvre dans une fenêtre du bas
   (fermée par la croix ou un balayage vers le bas) et ne s'ajoute JAMAIS sous le graphique. Les données restent disponibles pour Rayle (les modules ne sont pas retirés, seulement masqués).
   Un seul gestionnaire de gestes : ceux de Lightweight Charts (glisser, pincer, appui long = réticule, axe des prix) + double appui (recentrer) ; touch-action: none sur le graphique,
   aucun balayage de carrousel depuis le graphique (le terminal est dans un cadre : la page de Rayle ne reçoit pas ses gestes). Outils de dessin : masqués ; actifs = navigation coupée + bandeau.
   Le terminal PC (souris) n'est pas modifié. Testé en ÉMULATION (Chrome), jamais sur un vrai appareil. */
import { INSTRUMENTS, actifCourant } from './instruments.js';
export const estTactile = () => {
  try { const q = new URLSearchParams(location.search); if (q.get('tactile') === '0') return false; if (q.get('tactile') === '1') return true;
    return matchMedia('(pointer: coarse)').matches && !matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (e) { return false; }
};
export const TUILES = Object.freeze([['marches', 'Marchés'], ['cot', 'Rapport COT'], ['sante', 'Santé du marché'], ['institutions', 'Institutions'], ['actualites', 'Actualités'], ['calendrier', 'Calendrier'], ['journal', 'Journal'], ['capital', 'Capital']]);
export const PERIODES_BARRE = Object.freeze([['M5', 'M5'], ['M15', 'M15'], ['H1', 'H1'], ['H4', 'H4'], ['J', 'Jour']]);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const attendre = async (f, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = f(); if (v) return v; await new Promise(r => setTimeout(r, 100)); } return null; };

export async function monterTactile(T) {
  if (!estTactile() || document.documentElement.dataset.ttMonte) return null;
  const html = document.documentElement; html.dataset.ttMonte = '1'; html.classList.add('tm-tactile');
  const E = { feuille: null, donnees: false, outilsVisibles: false, geste: false, dernierAppui: null };
  window.__ttGeste = false; window.__ttTactile = true;
  const orienter = () => { const w = innerWidth, h = innerHeight; html.classList.toggle('tt-paysage', w >= 900 && w > h); html.classList.toggle('tt-etroit', w < 440); };
  orienter(); addEventListener('resize', orienter);
  const esp = await attendre(() => window.__espaces);
  const g = T.graph, R = document.querySelector('.tor') || document.body;

  /* ── barre du haut ── */
  const barre = document.createElement('header'); barre.className = 'tt-barre'; barre.setAttribute('role', 'toolbar'); barre.setAttribute('aria-label', 'Graphique');
  const actif = actifCourant();
  barre.innerHTML = `<label class="tt-instr"><span class="tt-sr">Instrument</span><select data-tt-instr aria-label="Instrument">${INSTRUMENTS.map(i => `<option value="${i.id}"${i.id === actif ? ' selected' : ''}>${esc(i.court || i.nom)}</option>`).join('')}</select></label>`
    + `<nav class="tt-periodes" aria-label="Période">${PERIODES_BARRE.map(([k, n]) => `<button type="button" data-tt-periode="${k}">${n}</button>`).join('')}</nav>`
    + `<label class="tt-fl"><span class="tt-sr">Flèches</span><select data-tt-fleches aria-label="Flèches"><option value="direct">Direct</option><option value="v7">v7 validée</option><option value="stable">Stable</option><option value="historique">Historique</option></select></label>`
    + `<button type="button" class="tt-plus" data-tt-plus aria-label="Réglages du graphique" aria-haspopup="dialog">⋯</button>`;
  document.body.appendChild(barre);
  barre.querySelector('[data-tt-instr]').addEventListener('change', ev => { if (esp && esp.changerInstrument) esp.changerInstrument(ev.target.value); });
  barre.querySelector('.tt-periodes').addEventListener('click', ev => { const b = ev.target.closest('[data-tt-periode]'); if (!b) return; const o = R.querySelector(`[data-periode="${b.dataset.ttPeriode}"]`); if (o) o.click(); majBarre(); });
  barre.querySelector('[data-tt-fleches]').addEventListener('change', ev => { try { T.flechesT.fixerMode(ev.target.value); } catch (e) { /* */ } });
  function majBarre() {
    for (const b of barre.querySelectorAll('[data-tt-periode]')) { const o = R.querySelector(`[data-periode="${b.dataset.ttPeriode}"]`); b.setAttribute('aria-pressed', String(!!o && o.getAttribute('aria-pressed') === 'true')); }
    try { const m = T.flechesT.mode(), s = barre.querySelector('[data-tt-fleches]'); if (s && s.value !== m) s.value = m; } catch (e) { /* */ }
  }
  majBarre(); setInterval(majBarre, 1500);

  /* ── réglages ⋯ : couches (cases du menu d'origine, mêmes événements), outils de dessin, notifications ── */
  const reglages = document.createElement('section'); reglages.className = 'tt-reglages'; reglages.hidden = true; reglages.setAttribute('role', 'dialog'); reglages.setAttribute('aria-label', 'Réglages du graphique');
  document.body.appendChild(reglages);
  function construireReglages() {
    const orig = [...document.querySelectorAll('[data-couche]')].filter(c => c.type === 'checkbox'), notif = document.querySelector('[data-ft-notif]');
    reglages.innerHTML = `<div class="tt-feuille-tete"><b>Réglages du graphique</b><button type="button" class="tt-x" data-tt-ferme-reglages aria-label="Fermer">✕</button></div><div class="tt-reglages-corps">`
      + `<button type="button" class="tt-gros" data-tt-outils aria-pressed="${E.outilsVisibles}">Outils de dessin : ${E.outilsVisibles ? 'visibles' : 'masqués'}</button>`
      + `<h3>Couches</h3>` + orig.map(c => `<label class="tt-case"><input type="checkbox" data-tt-couche="${esc(c.dataset.couche)}"${c.checked ? ' checked' : ''}> ${esc((c.closest('label') ? c.closest('label').textContent : c.dataset.couche).trim())}</label>`).join('')
      + `<h3>Notifications</h3><div data-tt-notif></div></div>`;
    const h = reglages.querySelector('[data-tt-notif]'); if (notif && h) { reglages.__notif = notif; reglages.__parent = notif.parentNode; h.appendChild(notif); notif.open = true; }
  }
  const fermerReglages = () => { if (reglages.hidden) return; reglages.hidden = true; if (reglages.__notif && reglages.__parent) { reglages.__notif.open = false; reglages.__parent.appendChild(reglages.__notif); reglages.__notif = null; } };
  barre.querySelector('[data-tt-plus]').addEventListener('click', () => { if (!reglages.hidden) { fermerReglages(); return; } fermerFeuille(); construireReglages(); reglages.hidden = false; });
  reglages.addEventListener('click', ev => {
    if (ev.target.closest('[data-tt-ferme-reglages]')) { fermerReglages(); return; }
    if (ev.target.closest('[data-tt-outils]')) { E.outilsVisibles = !E.outilsVisibles; html.classList.toggle('tt-outils-visibles', E.outilsVisibles); const b = ev.target.closest('[data-tt-outils]'); b.setAttribute('aria-pressed', String(E.outilsVisibles)); b.textContent = `Outils de dessin : ${E.outilsVisibles ? 'visibles' : 'masqués'}`; if (!E.outilsVisibles) terminerOutil(); window.dispatchEvent(new Event('resize')); }
  });
  reglages.addEventListener('change', ev => { const c = ev.target.closest('[data-tt-couche]'); if (!c) return; const o = document.querySelector(`[data-couche="${c.dataset.ttCouche}"]`); if (o) { o.checked = c.checked; o.dispatchEvent(new Event('change', { bubbles: true })); } });
  let yR = null; reglages.querySelector && reglages.addEventListener('pointerdown', ev => { if (ev.target.closest('.tt-feuille-tete')) yR = ev.clientY; }); reglages.addEventListener('pointerup', ev => { if (yR != null && ev.clientY - yR > 70) fermerReglages(); yR = null; });

  /* ── petites cases « Données » + fenêtre du bas ── */
  const tuiles = document.createElement('nav'); tuiles.className = 'tt-tuiles'; tuiles.setAttribute('aria-label', 'Données'); tuiles.hidden = true;
  tuiles.innerHTML = TUILES.map(([k, n]) => `<button type="button" class="tt-tuile" data-tt-tuile="${k}">${esc(n)}</button>`).join('');
  const bd = document.createElement('button'); bd.type = 'button'; bd.className = 'tt-donnees'; bd.dataset.ttDonnees = ''; bd.setAttribute('aria-expanded', 'false'); bd.textContent = 'Données';
  const rsiB = document.createElement('button'); rsiB.type = 'button'; rsiB.className = 'tt-rsi'; rsiB.dataset.ttRsi = ''; rsiB.setAttribute('aria-pressed', 'false'); rsiB.textContent = 'RSI ▲';
  document.body.append(tuiles, bd, rsiB);
  const tete = document.createElement('div'); tete.className = 'tt-feuille-haut'; tete.hidden = true; tete.innerHTML = `<i class="tt-poignee" aria-hidden="true"></i><b data-tt-titre></b><button type="button" class="tt-x" data-tt-ferme aria-label="Fermer">✕</button>`; document.body.appendChild(tete);
  bd.addEventListener('click', () => { E.donnees = !E.donnees; tuiles.hidden = !E.donnees; bd.setAttribute('aria-expanded', String(E.donnees)); bd.textContent = E.donnees ? 'Données ✕' : 'Données'; fermerReglages(); });
  tuiles.addEventListener('click', ev => { const b = ev.target.closest('[data-tt-tuile]'); if (b) ouvrirFeuille(b.dataset.ttTuile); });
  async function ouvrirFeuille(k) {
    if (!esp || !TUILES.some(t => t[0] === k)) return false; fermerReglages(); if (E.feuille) { try { document.querySelector(`[data-zone="${E.feuille}"]`)?.classList.remove('tt-feuille'); } catch (e) { /* */ } }
    E.feuille = k; html.classList.add('tt-feuille-ouverte'); html.dataset.ttFeuille = k; tete.hidden = false; tete.querySelector('[data-tt-titre]').textContent = TUILES.find(t => t[0] === k)[1];
    await esp.aller(k); const z = document.querySelector(`[data-zone="${k}"]`); if (z) z.classList.add('tt-feuille'); return true;
  }
  async function fermerFeuille() {
    if (!E.feuille) return; const k = E.feuille; E.feuille = null; html.classList.remove('tt-feuille-ouverte'); delete html.dataset.ttFeuille; tete.hidden = true;
    const z = document.querySelector(`[data-zone="${k}"]`); if (z) z.classList.remove('tt-feuille'); if (esp) await esp.aller('trading'); window.dispatchEvent(new Event('resize'));
  }
  tete.addEventListener('click', ev => { if (ev.target.closest('[data-tt-ferme]')) fermerFeuille(); });
  { let y0 = null; tete.addEventListener('pointerdown', ev => { y0 = ev.clientY; }); tete.addEventListener('pointerup', ev => { if (y0 != null && ev.clientY - y0 > 60) fermerFeuille(); y0 = null; }); tete.addEventListener('pointercancel', () => { y0 = null; }); }
  { let y0 = null, haut = false; document.addEventListener('pointerdown', ev => { const z = ev.target.closest && ev.target.closest('.tt-feuille'); if (!z) { y0 = null; return; } y0 = ev.clientY; haut = z.scrollTop <= 0; }, true); document.addEventListener('pointerup', ev => { if (y0 != null && haut && ev.clientY - y0 > 140) fermerFeuille(); y0 = null; }, true); }
  /* bande RSI repliable (repliée par défaut) : la case d'origine, mêmes événements */
  const caseRsi = () => document.querySelector('[data-couche="rsi"]');
  const poserRsi = on => { const c = caseRsi(); if (c) { c.checked = on; c.dispatchEvent(new Event('change', { bubbles: true })); } rsiB.setAttribute('aria-pressed', String(on)); rsiB.textContent = on ? 'RSI ▼' : 'RSI ▲'; html.classList.toggle('tt-rsi-ouvert', on); };
  rsiB.addEventListener('click', () => poserRsi(rsiB.getAttribute('aria-pressed') !== 'true'));
  poserRsi(false);

  /* ── outils de dessin : actifs = navigation coupée + bandeau ── */
  const bandeau = document.createElement('div'); bandeau.className = 'tt-bandeau-outil'; bandeau.hidden = true; bandeau.setAttribute('role', 'status');
  bandeau.innerHTML = `<span>Outil de dessin actif : le graphique ne se déplace plus.</span><button type="button" data-tt-fin-outil>Terminer</button>`; document.body.appendChild(bandeau);
  const outilActif = () => { try { const o = T.strategie.pro.outil(); return !!o && o !== 'curseur'; } catch (e) { return false; } };
  function navigation(on) { try { const c = g.chart(); c.applyOptions({ handleScroll: on ? { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true } : false, handleScale: on ? { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: true } : false }); } catch (e) { /* graphique pas prêt */ } }
  function terminerOutil() { try { T.strategie.pro.choisir('curseur'); } catch (e) { /* */ } syncOutil(); }
  function syncOutil() { const a = outilActif(); bandeau.hidden = !a; html.classList.toggle('tt-outil-actif', a); navigation(!a); }
  bandeau.addEventListener('click', ev => { if (ev.target.closest('[data-tt-fin-outil]')) terminerOutil(); });
  document.addEventListener('click', () => setTimeout(syncOutil, 0), true); setInterval(syncOutil, 1000);

  /* ── graphique : options de gestes, 150 à 250 bougies, volume masqué, double appui = recentrer ── */
  const zoneG = await attendre(() => document.querySelector('.tor-graph-lw'));
  const bougiesMax = 250;
  async function configurerGraphique() {
    const c = await attendre(() => { try { return g.chart(); } catch (e) { return null; } }); if (!c) return;
    try { const LW = window.LightweightCharts; c.applyOptions({ kineticScroll: { touch: true, mouse: false }, trackingMode: { exitMode: LW && LW.TrackingModeExitMode ? LW.TrackingModeExitMode.OnTouchEnd : 0 } }); } catch (e) { /* */ }
    const largeur = () => Math.max(200, (zoneG && zoneG.clientWidth) || innerWidth);
    const regler = () => { try { c.applyOptions({ timeScale: { minBarSpacing: Math.max(1.2, (largeur() - 60) / bougiesMax) } }); } catch (e) { /* */ } };
    regler(); addEventListener('resize', regler);
    try { if (g.tactile) g.tactile(true); } catch (e) { /* */ }
    navigation(true); recentrer();
  }
  function recentrer() {
    try { const c = g.chart(), n = (g.etat().bougies || []).length; if (!n) return; const vis = Math.min(170, n); c.timeScale().setVisibleLogicalRange({ from: n - vis, to: n + 4 }); c.priceScale('right').applyOptions({ autoScale: true }); } catch (e) { /* */ }
  }
  if (zoneG) {
    zoneG.addEventListener('pointerdown', ev => {
      if (ev.pointerType === 'mouse') return; window.__ttGeste = true; const t = performance.now(), p = E.dernierAppui;
      if (p && t - p.t < 320 && Math.hypot(ev.clientX - p.x, ev.clientY - p.y) < 28 && !outilActif()) { recentrer(); E.dernierAppui = null; } else E.dernierAppui = { t, x: ev.clientX, y: ev.clientY };
    }, true);
    let appuiDebut = null; zoneG.addEventListener('pointerdown', ev => { if (ev.pointerType !== 'mouse') appuiDebut = { t: performance.now(), x: ev.clientX, y: ev.clientY }; }, true);
    zoneG.addEventListener('pointerup', ev => {   // un appui court (sans glisser) : infobulle de la flèche touchée
      const d = appuiDebut; appuiDebut = null; if (!d || ev.pointerType === 'mouse' || outilActif() || performance.now() - d.t > 450 || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 10) return;
      try { const r = zoneG.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top, t = g.chart().timeScale().coordinateToTime(x); if (t != null) T.flechesT.bulleA(t, x, y); } catch (e) { /* */ }
    }, true);
    const fin = () => { setTimeout(() => { window.__ttGeste = false; }, 150); };
    zoneG.addEventListener('pointerup', fin, true); zoneG.addEventListener('pointercancel', fin, true);
    zoneG.addEventListener('touchmove', ev => { if (ev.cancelable && !outilActif()) ev.preventDefault(); }, { passive: false });   // jamais de défilement de page ni de rafraîchissement par tirage depuis le graphique
  }
  configurerGraphique();
  window.RayleTactile = { actif: true, ouvrirFeuille, fermerFeuille, recentrer, geste: () => !!window.__ttGeste, etat: () => ({ feuille: E.feuille, donnees: E.donnees, outilsVisibles: E.outilsVisibles, outilActif: outilActif(), rsi: rsiB.getAttribute('aria-pressed') === 'true', tuiles: TUILES.map(t => t[0]) }), terminerOutil };
  return window.RayleTactile;
}
