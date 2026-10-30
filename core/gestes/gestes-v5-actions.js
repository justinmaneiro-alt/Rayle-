"use strict";
/* ═════════════ GESTES V5 : application des actions sur la page (curseur visible, fenêtres, objets 3D) ═════════════
   Reçoit les ACTIONS du moteur pur (gestes-v5-calcul.js) en pixels d'écran ABSOLUS et les rend avec les mêmes moyens que la télécommande de la tablette : événements de pointeur fabriqués DANS la page
   (window.Telecommande.placer / appliquer / verrou / lacher), API des gestionnaires de fenêtres (déplacer, dimensionner, ranger, fermer), Objets3DPad et canevas 3D. Rien ne touche à Windows.
   Le curseur est un grand anneau lumineux : repos · survol (agrandi) · pincement en cours (se resserre) · prise (plein) · pause (barré) · fermeture (anneau qui se vide) · pas engagé (pointillés).
   La souris, le clavier et le toucher ne sont jamais interceptés : ce module ne fait rien tant que les gestes sont éteints. */
const GestesV5Actions = (() => {
  const V5 = () => window.GestesV5, T = () => window.Telecommande;
  const CLIQUABLE = 'button,a[href],[role="button"],[role="tab"],[role="menuitem"],input,select,textarea,summary,label,[data-onglet],[data-a],.gf-t,.saf-t,.pn-tete,.g1-fen-barre,.gf-poignee,.saf-poignee,.gfx-bord,.gv5-demo-poignee,.gv5-t,[tabindex]:not([tabindex="-1"])';
  const P = { taille: 76, aimantation: 0.6, priseLarge: true, diagnostic: false, tamponMs: 0 };
  let dernierLibre = null, el = null, trace = [], points = [], cibles = [], ciblesT = 0, survolEl = null, tenue = null, prise = null, deux = null, inertie = null, tCache = 0, derniereEtat = null, flashT = 0, fermerEl = null, derniereVit = { vx: 0, vy: 0, t: 0, x: 0, y: 0 };
  let diag = null, diagCtx = null, diagT = 0;

  // ── curseur visible ──
  function creer() {
    if (el) return el;
    el = document.createElement('div'); el.id = 'gv5-curseur'; el.hidden = true; el.setAttribute('aria-hidden', 'true'); el.dataset.etat = 'repos';
    el.innerHTML = '<svg class="gv5-anneau" viewBox="-50 -50 100 100" aria-hidden="true"><circle class="gv5-fond" r="40"/><circle class="gv5-prog" r="40" pathLength="100"/></svg><i class="gv5-point"></i><i class="gv5-barre"></i>';
    document.body.appendChild(el);
    for (let i = 0; i < 6; i++) { const p = document.createElement('i'); p.className = 'gv5-trace'; p.hidden = true; p.style.opacity = String(0.5 - i * 0.07); document.body.appendChild(p); points.push(p); }
    appliquerTaille(); return el;
  }
  function appliquerTaille() { if (el) document.documentElement.style.setProperty('--gv5-t', P.taille + 'px'); }
  /* V10 : l'anneau est dessiné à CHAQUE image de l'écran (60 à 144 Hz), même si les points n'arrivent qu'à 30 Hz : FluiditeCalcul.creerRendu interpole entre les dernières mesures et prédit
     quelques millisecondes (jamais plus de 45) pour compenser le délai ; l'arrivée d'une mesure corrige en douceur, le curseur ne « saute » pas. Les événements (clics, prises) gardent les
     positions exactes du moteur : seule l'image de l'anneau est lissée. Sans FluiditeCalcul (page ancienne), l'anneau est posé à chaque mesure comme avant. */
  let rendu = null, rafRendu = 0, tImageRendu = 0, ecouteImage = null, posAff = null, tTrace = 0, decalHorloge = null, tMesure = null, tPrecMes = null, dtMes = 0;
  /* Heure de la MESURE (celle du moteur, espacement exact de la caméra) ramenée à l'horloge de l'écran : la vitesse se calcule sur l'espacement réel des mesures, jamais sur l'heure d'arrivée
     (deux paquets qui arrivent collés par la gigue ne donnent pas une vitesse infinie). Le décalage est le plus petit « maintenant − mesure » vu (le paquet le moins retardé), recalé lentement. */
  function noterMesure(tm) {
    if (!Number.isFinite(tm)) { tMesure = null; return; }
    const d = performance.now() - tm;
    decalHorloge = decalHorloge === null || Math.abs(d - decalHorloge) > 5000 ? d : Math.min(d, decalHorloge + 0.02);
    tMesure = tm + decalHorloge;
    if (tPrecMes != null && tm > tPrecMes && tm - tPrecMes < 500) { dtMes = dtMes ? dtMes * 0.9 + (tm - tPrecMes) * 0.1 : tm - tPrecMes; if (rendu) { const f = Math.max(0, Math.min(1, (1000 / dtMes - 12) / 18)); rendu.regler({ predictionMax: 45 * f, avance: 8 * f }); } }   // sous 12 images/s la prédiction s’éteint (elle dépasserait la cible), pleine à partir de 30
    tPrecMes = tm;
  }
  function poserTransform(x, y, t) {
    if (posAff && Math.abs(posAff[0] - x) < 0.04 && Math.abs(posAff[1] - y) < 0.04) return; posAff = [x, y];
    el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    if (t - tTrace < 30) return; tTrace = t;   // la traînée garde un rythme de ~30 points par seconde, quelle que soit la cadence de l'écran
    trace.unshift([x, y]); if (trace.length > 6) trace.pop();
    for (let i = 0; i < points.length; i++) { const q = trace[i + 1] || null; if (!q) { points[i].hidden = true; continue; } points[i].hidden = false; points[i].style.transform = 'translate(' + q[0].toFixed(1) + 'px,' + q[1].toFixed(1) + 'px) scale(' + (0.9 - i * 0.12).toFixed(2) + ')'; }
  }
  function boucleRendu(t) {
    rafRendu = requestAnimationFrame(boucleRendu);
    if (!el || el.hidden || !rendu) return;
    const p = rendu.position(t); if (!p) return;
    poserTransform(p.x, p.y, t);
    if (ecouteImage) ecouteImage(tImageRendu ? t - tImageRendu : 0, p.x, p.y, t);
    tImageRendu = t;
  }
  function placerVisuel(x, y) {
    creer(); el.hidden = false;
    const FC = window.FluiditeCalcul;
    if (FC && !rendu) { rendu = FC.creerRendu({ tampon: P.tamponMs }); }
    if (rendu) { rendu.echantillon(tMesure != null ? Math.min(tMesure, performance.now()) : performance.now(), x, y); if (!rafRendu) { tImageRendu = 0; rafRendu = requestAnimationFrame(boucleRendu); } }
    else poserTransform(x, y, performance.now());
    clearTimeout(tCache);
  }
  function etatVisuel(e, progres) {
    if (!el) return; if (el.dataset.etat !== e) el.dataset.etat = e;
    const v = progres ? progres.v : 0; el.style.setProperty('--gv5-p', String(v)); el.dataset.prog = progres ? progres.type : '';
  }
  function cacher() { if (el) el.hidden = true; for (const p of points) p.hidden = true; trace = []; posAff = null; cancelAnimationFrame(rafRendu); rafRendu = 0; if (rendu) rendu.reinitialiser(); document.body.classList.remove('gv5-actif'); }

  // ── cibles cliquables (aimantation et zones élargies) ──
  function actualiserCibles() {
    const t = performance.now(); if (t - ciblesT < 280) return cibles; ciblesT = t; cibles = [];
    const L = innerWidth, H = innerHeight;
    for (const e of document.querySelectorAll(CLIQUABLE)) {
      if (cibles.length > 420) break; if (e.closest('#gv5-curseur') || e.disabled) continue;
      const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.right < 0 || r.bottom < 0 || r.left > L || r.top > H) continue;
      const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
      cibles.push({ x: r.left, y: r.top, l: r.width, h: r.height, id: cibles.length, el: e });
    }
    return cibles;
  }
  /* Position aimantée (si l'élément visé est réellement visible à cet endroit) ; renvoie { x, y, el }. */
  function aimanter(x, y, force) {
    const v5 = V5(); if (!v5 || P.aimantation <= 0) return { x, y, el: null };
    const m = v5.aimanter(x, y, actualiserCibles(), { rayon: 56, force: force == null ? P.aimantation * 0.5 : force, min: 44, capture: force === 1 ? 28 : 0 });   // clic ou prise (force 1) : capture à 28 px
    if (m.cible === null) return { x, y, el: null };
    const c = cibles[m.cible]; if (!c) return { x, y, el: null };
    const dessus = document.elementFromPoint(m.x, m.y);
    if (!dessus || !(c.el === dessus || c.el.contains(dessus) || dessus.contains(c.el))) return { x, y, el: null };   // un autre élément recouvre la cible : pas d'aimant
    return { x: m.x, y: m.y, el: c.el };
  }
  function marquerSurvol(cible) {
    if (survolEl === cible) return; if (survolEl) survolEl.classList.remove('gv5-aimante');
    survolEl = cible; if (cible) cible.classList.add('gv5-aimante');
  }

  // ── fenêtres ──
  function fenetreSous(x, y) {
    const e = document.elementFromPoint(x, y); if (!e) return null;
    const racine = e.closest('.gf,.saf');
    if (racine) for (const api of (window.RayleGestionnaires || [])) { let liste = []; try { liste = api.liste(); } catch (err) { continue; } for (const f of liste) { const o = api.obtenir(f.id); if (o && o.el === racine) return { api, id: f.id, o, el: racine }; } }
    const pn = e.closest('.pn'); if (pn) return { pn, el: pn };
    const g1 = e.closest('#g1Fen'); if (g1 && window.G1) return { g1: true, el: g1 };   // la grande fenêtre de l'accueil (thème Aurore)
    return null;
  }
  const canevasSous = (x, y) => { const e = document.elementFromPoint(x, y); return e && e.tagName === 'CANVAS' ? e : null; };

  // ── application d'une action ──
  function inertieStop(lacher = true) { if (!inertie) return; cancelAnimationFrame(inertie.raf); inertie = null; if (lacher && T()) T().lacher(); }
  function inertieDemarrer(vx, vy) {
    let v = Math.hypot(vx, vy); if (v < 160 || !T()) { T() && T().lacher(); return; }
    const x0 = T().position().x, y0 = T().position().y; inertie = { raf: 0, vx: Math.min(1800, vx) , vy: Math.min(1800, vy), t0: performance.now(), tp: performance.now(), x: x0, y: y0 };
    const pas = t => {
      if (!inertie) return; const dt = Math.min(0.05, (t - inertie.tp) / 1000); inertie.tp = t; const k = Math.exp(-dt * 4.2);
      inertie.vx *= k; inertie.vy *= k; inertie.x = Math.max(1, Math.min(innerWidth - 2, inertie.x + inertie.vx * dt)); inertie.y = Math.max(1, Math.min(innerHeight - 2, inertie.y + inertie.vy * dt));
      T().placer(inertie.x, inertie.y);
      if (Math.hypot(inertie.vx, inertie.vy) < 40 || t - inertie.t0 > 1100) return inertieStop(true);
      inertie.raf = requestAnimationFrame(pas);
    };
    inertie.raf = requestAnimationFrame(pas);
  }
  function marquerTenue(genre) {
    const s = T() && T().saisie(); if (!s || !s.el) return;
    const fen = genre === 'poignee' ? s.el : s.el.closest('.gf,.saf,.pn,.pm-mobile,#g1Fen,.gv5-demo-fen') || s.el;
    tenue = fen; fen.classList.add(genre === 'poignee' ? 'gv5-poignee-active' : 'gv5-tenue');
  }
  function lacherMarques() { if (tenue) { tenue.classList.remove('gv5-tenue', 'gv5-poignee-active'); tenue = null; } }

  function deuxDebut(a) {
    deux = { type: a.type, mode: null, d: a.d, ang: a.ang, mx: (a.p1[0] + a.p2[0]) / 2, my: (a.p1[1] + a.p2[1]) / 2, acc: { z: 0, r: 0, p: 0 }, verrou: null, t0: performance.now() };
    const c1 = a.c1 || a.p1, c2 = a.c2 || a.p2, f1 = fenetreSous(c1[0], c1[1]), f2 = fenetreSous(c2[0], c2[1]);
    if (a.type === 'pince' && f1 && f2 && f1.el === f2.el && f1.api) {   // les deux mains tiennent la même fenêtre : agrandir / rétrécir
      const r = f1.o.rect; deux.mode = 'fenetre'; deux.f = f1; deux.r0 = { x: r.x, y: r.y, l: r.l, h: r.h }; f1.el.classList.add('gv5-tenue');
    } else {
      const cv = canevasSous((c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2) || canevasSous(c1[0], c1[1]) || canevasSous(c2[0], c2[1]) || (window.CartePad && window.CartePad.canevasPrincipal());
      if (cv) { deux.mode = '3d'; deux.cv = cv; }
    }
  }
  function deuxPas(a) {
    if (!deux) return; const mx = (a.p1[0] + a.p2[0]) / 2, my = (a.p1[1] + a.p2[1]) / 2;
    if (deux.mode === 'fenetre') {
      const k = Math.max(0.35, Math.min(3, a.d / Math.max(30, a.d0))), r0 = deux.r0, nl = Math.round(r0.l * k), nh = Math.round(r0.h * k), api = deux.f.api, id = deux.f.id;
      try { api.dimensionner(id, nl, nh); const n = api.obtenir(id); if (n) api.deplacer(id, r0.x + r0.l / 2 - n.rect.l / 2, r0.y + r0.h / 2 - n.rect.h / 2); } catch (e) { /* fenêtre fermée entre-temps */ }
    } else if (deux.mode === '3d' && T()) {
      const dz = (a.d - deux.d) * 2.4, da = (() => { let d = a.ang - deux.ang; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; })(), dmx = mx - deux.mx, dmy = my - deux.my;
      deux.acc.z += Math.abs(dz); deux.acc.r += Math.abs(da) * 400; deux.acc.p += Math.hypot(dmx, dmy);
      if (Math.abs(dz) > 1.2 && a.type === 'pince') T().objetSur(deux.cv, { g: 'zoom', delta: Math.max(-300, Math.min(300, dz)) });
      const tourne = a.type === 'ouvertes' || deux.acc.r >= deux.acc.p;   // rotation OU déplacement, selon ce que les mains font le plus ; le zoom se combine avec l'un ou l'autre
      if (tourne && Math.abs(da) > 0.004) T().objetSur(deux.cv, { g: 'tourner', dx: Math.max(-1, Math.min(1, -da * 0.6)), dy: 0 });
      else if (!tourne && Math.hypot(dmx, dmy) > 1) T().objetSur(deux.cv, { g: 'pan', dx: Math.max(-1, Math.min(1, -dmx / innerWidth)), dy: Math.max(-1, Math.min(1, -dmy / innerHeight)) });
    }
    deux.d = a.d; deux.ang = a.ang; deux.mx = mx; deux.my = my;
  }
  function deuxFin() { if (deux) { if (deux.f && deux.f.el) deux.f.el.classList.remove('gv5-tenue'); if (deux.mode === '3d' && T()) T().objetSur(deux.cv, { g: 'fin' }); deux = null; } }

  function appliquer(sortie) {
    const t = T(); if (!t || !sortie) return;
    noterMesure(sortie.t);
    creer(); document.body.classList.add('gv5-actif');
    for (const a of sortie.actions) {
      if (inertie && a.a !== 'curseur' && a.a !== 'deplace') inertieStop(true);
      switch (a.a) {
        case 'curseur': {
          if (inertie) { inertieStop(true); }
          let m;
          if (a.fige) m = dernierLibre && Math.hypot(a.x - dernierLibre.x, a.y - dernierLibre.y) < 2 ? { x: dernierLibre.mx, y: dernierLibre.my, el: survolEl } : { x: a.x, y: a.y, el: survolEl };   // figé : on garde la position aimantée d'avant le pincement
          else { m = aimanter(a.x, a.y); dernierLibre = { x: a.x, y: a.y, mx: m.x, my: m.y }; }
          t.placer(m.x, m.y); placerVisuel(m.x, m.y);
          const sous = document.elementFromPoint(m.x, m.y); const cliquable = m.el || (sous && sous.closest && sous.closest(CLIQUABLE));
          if (!a.fige) marquerSurvol(cliquable || null);
          break;
        }
        case 'clic': {
          const m = aimanter(a.x, a.y, 1); t.placer(m.x, m.y); placerVisuel(m.x, m.y); t.appliquer({ a: 'clic', n: a.n, bouton: a.bouton });
          if (el) { el.classList.remove('gv5-clic'); void el.offsetWidth; el.classList.add('gv5-clic'); clearTimeout(flashT); flashT = setTimeout(() => el.classList.remove('gv5-clic'), 320); }
          break;
        }
        case 'prise': {
          const m = aimanter(a.x, a.y, 1); t.placer(m.x, m.y); placerVisuel(m.x, m.y); derniereVit = { vx: 0, vy: 0, t: performance.now(), x: m.x, y: m.y };
          const ok = t.verrou(); if (ok) { const s = t.saisie(); marquerTenue(s && s.genre); } prise = { ok, genre: ok && t.saisie() ? t.saisie().genre : '' };
          break;
        }
        case 'deplace': {
          if (inertie) break; t.placer(a.x, a.y); placerVisuel(a.x, a.y);
          const now = performance.now(), dt = Math.max(1, now - derniereVit.t) / 1000; derniereVit.vx = derniereVit.vx * 0.6 + (a.x - derniereVit.x) / dt * 0.4; derniereVit.vy = derniereVit.vy * 0.6 + (a.y - derniereVit.y) / dt * 0.4; derniereVit.t = now; derniereVit.x = a.x; derniereVit.y = a.y;
          break;
        }
        case 'lache': {
          lacherMarques(); const g = prise && prise.genre; prise = null;
          if (g === '3d' && t.saisie()) { const vit = { vx: derniereVit.vx, vy: derniereVit.vy }; inertieDemarrer(vit.vx, vit.vy); } else t.lacher();
          break;
        }
        case 'defile': { if (a.x != null) t.placer(a.x, a.y); t.appliquer({ a: 'defile', dx: Math.max(-2000, Math.min(2000, a.dx)), dy: Math.max(-2000, Math.min(2000, a.dy)) }); break; }
        case 'ranger': {
          const f = fenetreSous(a.x, a.y);
          if (f && f.api) { try { if (!f.api.ranger(f.id)) f.api.reduire(f.id, true); } catch (e) { /* fenêtre non rangeable */ } }
          else if (f && f.g1) { try { window.G1.fermer(); } catch (e) { /* déjà fermée */ } }   // la grande fenêtre de l'accueil n'a pas de pile : la ranger, c'est revenir à l'accueil
          else if (f && f.pn) { const x = f.pn.querySelector('.pn-x'); if (x) x.click(); }
          else if (window.Gestes && window.Gestes.rangerFenetres) window.Gestes.rangerFenetres();
          break;
        }
        case 'fermer_debut': { const f = fenetreSous(a.x, a.y); if (f) { fermerEl = f.el; f.el.classList.add('gv5-ferme-prevu'); } break; }
        case 'fermer_annule': if (fermerEl) { fermerEl.classList.remove('gv5-ferme-prevu'); fermerEl = null; } break;
        case 'fermer': {
          const f = fenetreSous(a.x, a.y); if (fermerEl) { fermerEl.classList.remove('gv5-ferme-prevu'); fermerEl = null; }
          if (f) { try { if (f.api) f.api.fermer(f.id); else if (f.pn) { const x = f.pn.querySelector('.pn-x'); if (x) x.click(); } else if (f.g1) window.G1.fermer(); } catch (e) { /* déjà fermée */ } }
          break;
        }
        case 'vue_initiale': {
          const cv = canevasSous(a.x, a.y) || (window.CartePad && window.CartePad.canevasPrincipal());
          window.dispatchEvent(new CustomEvent('rayle:vue-initiale', { detail: { x: a.x, y: a.y, canvas: cv || null } }));
          for (const o of (window.Objets3DPad ? window.Objets3DPad.liste() : [])) { const r = window.Objets3DPad.obtenir(o.id); if (r && typeof r.reinitialiser === 'function' && o.actif) { try { r.reinitialiser(); } catch (e) { /* vue sans remise à zéro */ } } }
          if (document.body.classList.contains('vue-galaxie') && cv) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', code: 'KeyH', bubbles: true }));   // la galaxie : H = vue d'ensemble
          break;
        }
        case 'suivre': {
          const cv = canevasSous(a.x, a.y); window.dispatchEvent(new CustomEvent('rayle:suivre', { detail: { x: a.x, y: a.y, canvas: cv || null } }));
          if (cv) { t.placer(a.x, a.y); t.appliquer({ a: 'clic', n: 2, bouton: 0 }); }   // double clic sur l'objet visé : la galaxie le centre et s'en approche
          break;
        }
        case 'accueil': t.appliquer({ a: 'accueil3' }); break;
        case 'deux_debut': deuxDebut(a); break;
        case 'deux': if (!deux) deuxDebut(a); deuxPas(a); break;
        case 'deux_fin': deuxFin(); break;
      }
    }
  }

  /* Rend l'état (anneau, indicateur, diagnostic) : appelé à chaque image avec l'état du moteur. */
  function afficher(etat) {
    derniereEtat = etat; if (!etat) return; creer();
    let e = 'repos';
    if (etat.mode === 'pause') e = 'pause'; else if (etat.mode === 'repos' || etat.mode === 'sans-main') e = 'inactif';
    else if (etat.saisie) e = 'prise'; else if (etat.progres && etat.progres.type === 'fermer') e = 'fermer'; else if (etat.progres && etat.progres.type === 'pince') e = 'pince';
    else if (survolEl) e = 'survol';
    const pg = etat.progres && etat.progres.type === 'suivre' && !(etat.curseur && canevasSous(etat.curseur.x, etat.curseur.y)) ? null : etat.progres;   // « suivre » ne concerne que les objets 3D
    etatVisuel(e, pg);
    if (inertie && etat.pose === 'poing') inertieStop(true);   // un poing arrête net l'objet qui tourne encore
    if (e === 'inactif' || e === 'pause') { if (etat.curseur && etat.mains) placerVisuel(etat.curseur.x, etat.curseur.y); }
    if (!etat.mains && !inertie) { clearTimeout(tCache); tCache = setTimeout(() => { if (el && (!derniereEtat || !derniereEtat.mains)) el.hidden = true; }, 1400); }
    if (P.diagnostic) diagnostic(etat); else if (diag) diag.hidden = true;
  }

  // ── superposition de diagnostic ──
  const LIAISONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
  function diagnostic(etat) {
    const t = performance.now(); if (t - diagT < 66) return; diagT = t;
    if (!diag) { diag = document.createElement('div'); diag.id = 'gv5-diag'; diag.innerHTML = '<canvas width="200" height="150"></canvas><pre></pre>'; document.body.appendChild(diag); diagCtx = diag.querySelector('canvas').getContext('2d'); }
    diag.hidden = false; const c = diagCtx, w = 200, h = 150; c.clearRect(0, 0, w, h);
    const r = window.CameraRelais ? window.CameraRelais.etat() : null, ratio = 4 / 3;
    (etat.points || []).forEach((pts, i) => { c.strokeStyle = i ? '#c9b27a' : '#8fd0e3'; c.fillStyle = c.strokeStyle; c.lineWidth = 1.5; c.beginPath(); const X = p => p[0] / ratio * w, Y = p => p[1] * h; for (const [a, b] of LIAISONS) { c.moveTo(X(pts[a]), Y(pts[a])); c.lineTo(X(pts[b]), Y(pts[b])); } c.stroke(); for (const p of pts) c.fillRect(X(p) - 1.5, Y(p) - 1.5, 3, 3); });
    const pc = etat.pincement, o = window.Gestes && window.Gestes.reglages ? window.Gestes.reglages() : {};
    diag.querySelector('pre').textContent = ['état    : ' + etat.mode + (etat.saisie ? ' · prise' : '') + (etat.deux ? ' · deux mains (' + etat.deux + ')' : ''), 'pose    : ' + (etat.pose || '—') + ' · mains ' + etat.mains,
      'pince   : index ' + (pc ? pc.index.toFixed(2) : '—') + ' · majeur ' + (pc ? pc.majeur.toFixed(2) : '—'), 'seuils  : fermé < ' + ((o.seuilFerme || 0.3) * (o.sensibiliteClic || 1)).toFixed(2) + ' · ouvert > ' + ((o.seuilOuvre || 0.45) * (o.sensibiliteClic || 1)).toFixed(2),
      r ? 'liaison : ' + r.liaison + ' · ' + r.debit + ' paq/s · délai ' + (r.delaiTotal != null ? r.delaiTotal + ' ms' : '—') + ' · perte ' + Math.round((r.perte || 0) * 100) + ' %' : 'liaison : webcam du PC'].join('\n');
  }

  function arreter() { inertieStop(true); lacherMarques(); deuxFin(); marquerSurvol(null); if (fermerEl) { fermerEl.classList.remove('gv5-ferme-prevu'); fermerEl = null; } cacher(); if (diag) diag.hidden = true; if (T()) T().lacher(); prise = null; }
  function reglages(patch) { Object.assign(P, patch || {}); if (rendu) rendu.regler({ tampon: P.tamponMs || 0 }); appliquerTaille(); if (!P.diagnostic && diag) diag.hidden = true; }

  return { appliquer, afficher, arreter, reglages, ecouterImage: f => { ecouteImage = f; }, aimanter, fenetreSous, actualiserCibles, curseur: () => el, etat: () => ({ prise: !!prise, inertie: !!inertie, deux: deux ? deux.mode : null, survol: !!survolEl }) };
})();
window.GestesV5Actions = GestesV5Actions;
