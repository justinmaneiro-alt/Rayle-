import * as C from './carte-calcul.js';
import { imagerie, CREDITS_COURT } from '../pc/sources.js';

/* ═════════════ TERRE, MODE LÉGER : LA CARTE PLATE (canvas 2D) ═════════════
   Même imagerie que le globe (NASA GIBS Blue Marble, EOX Sentinel-2 si autorisé), mais dessinée à plat : aucun travail 3D, peu de mémoire, une batterie qui tient. Toucher : un doigt fait glisser, deux doigts
   zooment et déplacent, double appui zoome, appui bref choisit un point. Souris : glisser, molette, double clic. Rendu seulement quand quelque chose change (images arrivées, geste, animation de vol). */
export function creerCarte({ zone, eox = true, zMax = 12, vueInitiale = { lon: 10, lat: 30, zoom: 1.5 }, surChange = () => {}, surAppui = () => {}, surPose = () => {}, fenetreImage = Image, maintenant = () => performance.now() } = {}) {
  const canvas = document.createElement('canvas'); canvas.className = 'tl-carte'; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Carte satellite du monde, déplaçable et zoomable'); canvas.style.touchAction = 'none';
  zone.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });
  const etat = { eox, vue: { ...vueInitiale }, l: 1, h: 1, dpr: 1, images: new Map(), enAttente: 0, vol: null, inertie: null, doigts: new Map(), pincement: null, appui: null, dernierTap: null, dessine: false, detruit: false };
  const MAX_IMAGES = 220, SIMULTANEES = 6;
  let demande = 0, file = [];

  // ── dimensions ──
  function mesurer() {
    const r = zone.getBoundingClientRect(); etat.l = Math.max(1, r.width); etat.h = Math.max(1, r.height); etat.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(etat.l * etat.dpr); canvas.height = Math.round(etat.h * etat.dpr); canvas.style.width = etat.l + 'px'; canvas.style.height = etat.h + 'px';
    etat.vue = C.contraindre(etat.vue, etat.l, etat.h, { zoomMax: zMax }); planifier();
  }
  const observateur = typeof ResizeObserver === 'function' ? new ResizeObserver(mesurer) : null; if (observateur) observateur.observe(zone); else window.addEventListener('resize', mesurer);

  // ── images (une par adresse source ; l'ancêtre sert de repli flou pendant que la tuile nette arrive) ──
  function source(z, x, y) { const s = imagerie(z, x, y, { eox: etat.eox }); return s; }
  function image(url) {
    let e = etat.images.get(url);
    if (e) { e.vu = demande; return e; }
    e = { url, img: null, etat: 'attente', vu: demande }; etat.images.set(url, e); file.push(e); pomper();
    if (etat.images.size > MAX_IMAGES) purger();
    return e;
  }
  function pomper() {
    while (etat.enAttente < SIMULTANEES && file.length) {
      const e = file.pop();   // la dernière demandée d'abord : c'est ce que l'écran montre maintenant
      if (e.vu < demande - 1 && e.etat === 'attente') { etat.images.delete(e.url); continue; }   // plus visible : on ne la charge pas
      etat.enAttente++; e.etat = 'charge'; const img = new fenetreImage(); img.crossOrigin = 'anonymous'; img.referrerPolicy = 'no-referrer'; img.decoding = 'async';
      img.onload = () => { e.img = img; e.etat = 'ok'; etat.enAttente--; pomper(); planifier(); };
      img.onerror = () => { e.etat = 'erreur'; etat.enAttente--; pomper(); planifier(); };
      img.src = e.url;
    }
  }
  function purger() {
    const liste = [...etat.images.values()].filter(e => e.etat !== 'charge').sort((a, b) => a.vu - b.vu);
    for (const e of liste.slice(0, Math.max(0, etat.images.size - MAX_IMAGES + 20))) { etat.images.delete(e.url); const i = file.indexOf(e); if (i >= 0) file.splice(i, 1); }
  }

  // ── dessin ──
  function dessiner() {
    etat.dessine = false; if (etat.detruit) return; demande++;
    const { l, h, dpr, vue } = etat; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#05080f'; ctx.fillRect(0, 0, l, h); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'medium';
    const tuiles = C.tuilesVisibles(vue, l, h, { zMax, dpr }); let manque = 0;
    for (const q of tuiles) {
      const s = source(q.z, q.x, q.y), e = image(s.url), t = Math.ceil(q.t) + 1;
      if (e.etat === 'ok') { const w = e.img.naturalWidth, k = s.rect[2]; ctx.drawImage(e.img, s.rect[0] * w, s.rect[1] * e.img.naturalHeight, w * k, e.img.naturalHeight * k, q.px, q.py, t, t); continue; }
      manque++;
      // repli : le plus proche ancêtre déjà chargé, étiré (flou, mais jamais de trou noir)
      let trouve = false;
      for (let zs = q.z - 1; zs >= 0 && !trouve; zs--) {
        const a = C.ancetreTuile(q.z, q.x, q.y, zs), sa = source(zs, a.x, a.y), ea = etat.images.get(sa.url);
        if (ea && ea.etat === 'ok') { const w = ea.img.naturalWidth, hh = ea.img.naturalHeight, sk = sa.rect[2], u = sa.rect[0] + a.u * sk, v = sa.rect[1] + a.v * sk, kk = a.k * sk; ctx.drawImage(ea.img, u * w, v * hh, w * kk, hh * kk, q.px, q.py, t, t); trouve = true; }
      }
    }
    // voile léger aux pôles et bords : le monde n'est pas infini
    etat.manque = manque; surChange({ ...vue }, { l, h, manque });
  }
  function planifier() { if (etat.dessine || etat.detruit) return; etat.dessine = true; requestAnimationFrame(dessiner); }

  // ── mouvements ──
  const appliquer = v => { etat.vue = C.contraindre(v, etat.l, etat.h, { zoomMax: zMax }); planifier(); };
  const rect = () => canvas.getBoundingClientRect();
  function pointDe(e) { const r = rect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function arreterVol() { etat.vol = null; etat.inertie = null; }
  function boucleAnim() {
    if (etat.detruit) return;
    const t = maintenant();
    if (etat.vol) {
      const f = etat.vol, u = Math.min(1, (t - f.t0) / f.duree), e = u * u * (3 - 2 * u);
      const d = (((f.lon1 - f.lon0 + 540) % 360) + 360) % 360 - 180, lon = f.lon0 + d * e;   // plus court chemin autour du monde
      appliquer({ lon: C.normaliserLon(lon), lat: f.lat0 + (f.lat1 - f.lat0) * e, zoom: f.zoom0 + (f.zoom1 - f.zoom0) * e });
      if (u >= 1) { etat.vol = null; surPose({ ...etat.vue }); }
    } else if (etat.inertie) {
      const i = etat.inertie, dt = Math.min(48, t - i.t); i.t = t; const k = Math.pow(0.0025, dt / 1000);
      i.vx *= k; i.vy *= k; appliquer(C.deplacer(etat.vue, i.vx * dt, i.vy * dt));
      if (Math.hypot(i.vx, i.vy) < 0.01) { etat.inertie = null; surPose({ ...etat.vue }); }
    }
    requestAnimationFrame(boucleAnim);
  }
  requestAnimationFrame(boucleAnim);

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId); arreterVol();
    etat.doigts.set(e.pointerId, { ...pointDe(e), t: maintenant() });
    if (etat.doigts.size === 1) etat.appui = { x: etat.doigts.get(e.pointerId).x, y: etat.doigts.get(e.pointerId).y, t: maintenant(), bouge: 0, derniers: [] };
    else { etat.appui = null; const [a, b] = [...etat.doigts.values()]; etat.pincement = { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } }; }
  });
  canvas.addEventListener('pointermove', e => {
    const d = etat.doigts.get(e.pointerId); if (!d) return;
    const p = pointDe(e), dx = p.x - d.x, dy = p.y - d.y; d.x = p.x; d.y = p.y;
    if (etat.doigts.size === 1 && etat.appui) {
      etat.appui.bouge += Math.abs(dx) + Math.abs(dy); const t = maintenant(); etat.appui.derniers.push({ dx, dy, t }); if (etat.appui.derniers.length > 6) etat.appui.derniers.shift();
      appliquer(C.deplacer(etat.vue, dx, dy));
    } else if (etat.doigts.size >= 2 && etat.pincement) {
      const [a, b] = [...etat.doigts.values()], pc = C.pincement(etat.pincement.a, etat.pincement.b, a, b);
      let v = C.zoomerAutour(etat.vue, etat.l, etat.h, pc.m0.x, pc.m0.y, pc.deltaZoom); v = C.deplacer(v, pc.m1.x - pc.m0.x, pc.m1.y - pc.m0.y);
      etat.pincement = { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } }; appliquer(v);
    }
  });
  const fin = e => {
    const d = etat.doigts.get(e.pointerId); if (!d) return; etat.doigts.delete(e.pointerId); try { canvas.releasePointerCapture(e.pointerId); } catch (x) { /* déjà relâché */ }
    if (etat.doigts.size < 2) etat.pincement = null;
    const a = etat.appui;
    if (a && etat.doigts.size === 0) {
      const dur = maintenant() - a.t;
      if (a.bouge < 8 && dur < 450) {   // appui bref : double appui = zoom ; simple = point choisi
        const tap = { x: a.x, y: a.y, t: maintenant() }, dt = etat.dernierTap;
        if (dt && tap.t - dt.t < 380 && Math.hypot(tap.x - dt.x, tap.y - dt.y) < 28) { etat.dernierTap = null; zoomVers(tap.x, tap.y, 1); }
        else { etat.dernierTap = tap; setTimeout(() => { if (etat.dernierTap === tap) { etat.dernierTap = null; surAppui(versLonLat(tap.x, tap.y), { x: tap.x, y: tap.y }); } }, 390); }
      } else if (a.derniers.length >= 2) {   // lancer : la vitesse des derniers 100 ms
        const t = maintenant(), r = a.derniers.filter(m => t - m.t < 100); if (r.length >= 2) { const s = r.reduce((q, m) => ({ dx: q.dx + m.dx, dy: q.dy + m.dy }), { dx: 0, dy: 0 }), dtm = Math.max(16, r[r.length - 1].t - r[0].t); let vx = s.dx / dtm, vy = s.dy / dtm; const vit = Math.hypot(vx, vy), VMAX = 2.2; if (vit > VMAX) { vx *= VMAX / vit; vy *= VMAX / vit; } if (vit > 0.15) etat.inertie = { vx, vy, t }; }   // px/ms, plafonné : un lancer ne fait pas le tour du monde
        if (!etat.inertie) surPose({ ...etat.vue });
      } else surPose({ ...etat.vue });
      etat.appui = null;
    }
  };
  canvas.addEventListener('pointerup', fin); canvas.addEventListener('pointercancel', fin);
  canvas.addEventListener('wheel', e => { e.preventDefault(); arreterVol(); const p = pointDe(e); appliquer(C.zoomerAutour(etat.vue, etat.l, etat.h, p.x, p.y, -e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016))); }, { passive: false });
  canvas.addEventListener('dblclick', e => { const p = pointDe(e); zoomVers(p.x, p.y, 1); });

  // ── API ──
  function versLonLat(px, py) { const c = C.versPixel(etat.vue.lon, etat.vue.lat, etat.vue.zoom); return C.versLonLat(c.x - etat.l / 2 + px, c.y - etat.h / 2 + py, etat.vue.zoom); }
  function versEcran(lon, lat) { const c = C.versPixel(etat.vue.lon, etat.vue.lat, etat.vue.zoom), p = C.versPixel(lon, lat, etat.vue.zoom), m = C.monde(etat.vue.zoom); let dx = p.x - c.x; if (dx > m / 2) dx -= m; else if (dx < -m / 2) dx += m; return { x: etat.l / 2 + dx, y: etat.h / 2 + (p.y - c.y) }; }
  function zoomVers(px, py, dz) { arreterVol(); const cible = C.zoomerAutour(etat.vue, etat.l, etat.h, px, py, dz), c = C.contraindre(cible, etat.l, etat.h, { zoomMax: zMax }); volerVers(c.lon, c.lat, c.zoom, 260); }
  function volerVers(lon, lat, zoom, duree = 900) {
    arreterVol(); const cible = C.contraindre({ lon, lat, zoom }, etat.l, etat.h, { zoomMax: zMax });
    // grand écart (continents) : un petit recul de zoom pendant le vol serait joli, mais on garde la simplicité : interpolation douce
    etat.vol = { t0: maintenant(), duree: Math.max(1, duree), lon0: etat.vue.lon, lat0: etat.vue.lat, zoom0: etat.vue.zoom, lon1: cible.lon, lat1: cible.lat, zoom1: cible.zoom }; planifier();
  }
  function zoomer(dz) { zoomVers(etat.l / 2, etat.h / 2, dz); }
  function regler({ eox: e } = {}) { if (typeof e === 'boolean' && e !== etat.eox) { etat.eox = e; etat.images.clear(); file = []; planifier(); } }
  function detruire() { etat.detruit = true; if (observateur) observateur.disconnect(); else window.removeEventListener('resize', mesurer); canvas.remove(); etat.images.clear(); file = []; }
  mesurer();
  return { vue: () => ({ ...etat.vue }), taille: () => ({ l: etat.l, h: etat.h }), versEcran, versLonLat, volerVers, zoomer, regler, redessiner: planifier, mesurer, detruire, canvas,
    etat: () => ({ images: etat.images.size, enAttente: etat.enAttente, manque: etat.manque || 0, vol: !!etat.vol, eox: etat.eox, zoom: etat.vue.zoom }), credits: CREDITS_COURT };
}
