// ═════════════ UNIVERS 3D : noyau commun à tous les thèmes ═════════════
// Un thème = un module indépendant (js/univers/theme-*.js) enregistré ci-dessous. Le noyau fournit : la vue plein écran, le rendu (three.js), la boucle,
// les niveaux de qualité (Basse / Moyenne / Haute + réglage automatique), les contrôles tactiles et souris (OrbitControls), les étiquettes DOM,
// la légende et les cartes d'information, les mouvements de caméra, les cinématiques (avec « Passer l'animation ») et le fondu entre thèmes.
//
// Contrat d'un thème (export default) :  { id, nom, icone, async creer(ctx) → instance }
//   ctx      = { THREE, renderer, canvas, noyau, q (qualité vivante), options, assets(nom) }
//   instance = { scene, camera, maj(dt, t), redim(w, h)?, rendre(renderer)?, commande(nom, args)?, qualite(q)?, tap(x, y, ev)?, etat()?, detruire(), menu()? }
// Ajouter un thème plus tard : écrire js/univers/theme-xxx.js puis l'ajouter à THEMES ci-dessous (rien d'autre à toucher).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const VERSION = '2026.10.15.8';
const ASSETS = new URL('../../assets/', import.meta.url).href;
export const THEMES = {
  espace: { nom: 'Espace', icone: '🌍', url: './theme-espace.js?v=' + VERSION },
};

/* ───── qualité ───── */
export const QUALITES = {
  basse:   { id: 'basse',   nom: 'Basse',   dpr: .75, tex: 2048, segs: 64,  aa: false, nuages: true,  eclairs: false, etoiles: 1500, asteroides: 260,  fumee: .35, lod: 2, reflets: false, bordsPays: 'proches', relief: false },
  moyenne: { id: 'moyenne', nom: 'Moyenne', dpr: 1,   tex: 4096, segs: 96,  aa: true,  nuages: true,  eclairs: true,  etoiles: 3200, asteroides: 700,  fumee: .7, lod: 1, reflets: true,  bordsPays: 'tous', relief: true },
  haute:   { id: 'haute',   nom: 'Haute',   dpr: 1.5, tex: 8192, segs: 160, aa: true,  nuages: true,  eclairs: true,  etoiles: 6000, asteroides: 1600, fumee: 1,  lod: 0, reflets: true,  bordsPays: 'tous', relief: true },
};
const CLE_Q = 'rayle_univers_qualite';
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
function detecter() {
  try {
    const tactile = matchMedia('(pointer:coarse)').matches, coeurs = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
    if (coeurs <= 4 && mem <= 4) return 'basse';
    return tactile ? 'moyenne' : 'haute';
  } catch (e) { return 'moyenne'; }
}
let choixQualite = lsGet(CLE_Q) || 'auto';
if (!['auto', 'basse', 'moyenne', 'haute'].includes(choixQualite)) choixQualite = 'auto';
export const q = Object.assign({}, QUALITES[choixQualite === 'auto' ? detecter() : choixQualite]);   // objet vivant lu par les thèmes

/* ───── état ───── */
// mode : 'plein' (vue plein écran avec menu, HUD et contrôles) · 'fond' (la même scène, sans HUD, derrière l'accueil : Raylé la pilote par la voix) · null (fermé)
const E = { mode: null, fondVoulu: false, montage: null, tFond: 0, ouvert: false, vue: null, canvas: null, renderer: null, themeId: null, inst: null, raf: 0, tPrec: 0, t: 0, fps: 60, ema: 16.7, mesures: 0, mauvais: 0, ctx: null, ouverture: 0, labels: null, passer: null, ctrls: [], tweens: new Set(), enCine: false, kDt: 1, decal: 0, decalCible: 0, decalActif: false };
const bus = (n, d) => { try { window.RayleBus && RayleBus.emit(n, d); } catch (e) {} };
const $ = (s, r) => (r || E.vue).querySelector(s);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

/* ═════════ vue plein écran et HUD ═════════ */
function construireVue() {
  if (E.vue) return;
  const v = el('div'); v.id = 'vueUnivers'; v.hidden = true;
  v.innerHTML = '<canvas class="univ-canvas" tabindex="0" aria-label="Scène 3D : glisser pour tourner, pincer ou molette pour zoomer"></canvas>'
    + '<div class="univ-labels"></div><div class="univ-fondu"></div>'
    + '<div class="univ-hud"><div class="univ-haut"><div class="univ-menu">'
    + '<button type="button" class="univ-b univ-burger" data-a="panneau" aria-expanded="false" aria-controls="univPanneau" aria-label="Menu de l’Univers" title="Menu : vues, outils, qualité…">☰</button>'
    + '<div class="univ-panneau" id="univPanneau" hidden><section class="univ-cat"><h4>Thème</h4><div class="univ-groupe univ-themes" role="group" aria-label="Thème"></div></section><div class="univ-sous" aria-label="Modes du thème"></div>'
    + '<section class="univ-cat"><h4>Raylé et affichage</h4><div class="univ-groupe"><button type="button" class="univ-b" data-a="ranger" title="Réduire Raylé en petite bulle : toute la scène est à toi">🫧 Ranger Raylé</button>'
    + '<select class="univ-select" data-a="entite" aria-label="Position de l’entité Raylé" title="Où placer Raylé : petite dans un coin, grande au centre ou sur le côté"></select>'
    + '<select class="univ-select" data-a="qualite" aria-label="Qualité"><option value="auto">Qualité : auto</option><option value="basse">Basse</option><option value="moyenne">Moyenne</option><option value="haute">Haute</option></select>'
    + '<button type="button" class="univ-b danger" data-a="quitter" title="Retour à Raylé">✕ Quitter</button></div></section></div></div></div>'
    + '<div class="univ-bas"><div class="univ-carte" hidden><button type="button" class="univ-x" aria-label="Fermer la fiche">✕</button><div class="univ-carte-c"></div></div><div class="univ-legende" role="status" aria-live="polite"></div></div>'
    + '<button type="button" class="univ-b univ-passer" hidden>⏭ Passer l’animation</button></div>'
    + '<div class="univ-charge"><div class="univ-charge-t">Chargement de l’Univers…</div><progress max="1" value="0"></progress></div>';
  const fond = document.getElementById('uiFond');
  if (fond && fond.parentNode) fond.parentNode.insertBefore(v, fond.nextSibling); else document.body.prepend(v);
  E.vue = v; E.canvas = $('canvas', v); E.labels = $('.univ-labels', v);
  const themes = $('.univ-themes');
  for (const [id, t] of Object.entries(THEMES)) { const b = el('button', 'univ-b', t.icone + ' ' + t.nom); b.type = 'button'; b.dataset.theme = id; b.addEventListener('click', () => changerTheme(id)); themes.appendChild(b); }
  const burger = v.querySelector('[data-a="panneau"]'), panneau = v.querySelector('#univPanneau');     // un seul panneau repliable (fermé par défaut) pour tous les boutons du haut
  const panneauOuvert = oui => { panneau.hidden = !oui; burger.setAttribute('aria-expanded', oui ? 'true' : 'false'); burger.textContent = oui ? '✕' : '☰'; };
  burger.addEventListener('click', () => panneauOuvert(panneau.hidden));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panneau.hidden && !E.enCine) panneauOuvert(false); });
  v.querySelector('[data-a="quitter"]').addEventListener('click', () => fermer());
  v.querySelector('[data-a="ranger"]').addEventListener('click', () => { try { RayleRangement.basculer(); } catch (e) {} });
  const sel = v.querySelector('[data-a="qualite"]'); sel.value = choixQualite; sel.addEventListener('change', () => reglerQualite(sel.value));
  brancherSelecteurEntite(v.querySelector('[data-a="entite"]'));
  $('.univ-x').addEventListener('click', () => hud.carte(null));
  $('.univ-passer').addEventListener('click', () => passerAnimation());
  document.addEventListener('keydown', e => { if (!E.ouvert) return; if (e.key === 'Escape' && E.enCine) passerAnimation(); else if (e.key === ' ' && E.enCine) { e.preventDefault(); passerAnimation(); } });
  wirerCanvas();   // un tap (sans glissement) sur la scène : le thème le traite (sélection d'une planète, d'un navire, d'un pays…)
  window.addEventListener('resize', redimensionner);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', redimensionner);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && E.ouvert) { E.tPrec = 0; boucle(performance.now()); } });
}

export const hud = {
  legende(texte, ms = 7000) {
    const l = $('.univ-legende'); if (!l) return; clearTimeout(hud._t);
    if (!texte) { l.classList.remove('vu'); return; }
    l.textContent = texte; l.classList.add('vu');
    if (ms) hud._t = setTimeout(() => l.classList.remove('vu'), ms);
  },
  // carte d'information : {titre, html (déjà sûr), actions:[{texte, clic}]} ou null pour la fermer
  carte(c) {
    const box = $('.univ-carte'); if (!box) return;
    if (!c) { box.hidden = true; return; }
    const corps = $('.univ-carte-c'); corps.textContent = '';
    if (c.titre) corps.appendChild(el('h3', '', c.titre));
    const d = el('div'); d.innerHTML = c.html || ''; corps.appendChild(d);
    if (c.actions && c.actions.length) { const a = el('div', 'univ-actions'); for (const x of c.actions) { const b = el('button', 'univ-b', x.texte); b.type = 'button'; b.addEventListener('click', () => { try { x.clic(); } catch (e) {} }); a.appendChild(b); } corps.appendChild(a); }
    box.hidden = false;
  },
  sousMenu(items) {
    const s = $('.univ-sous'); if (!s) return; s.textContent = '';
    const cats = new Map();                                            // rangées par catégorie (it.cat), dans l'ordre de première apparition
    for (const it of items || []) { const c = it.cat || 'Outils'; if (!cats.has(c)) cats.set(c, []); cats.get(c).push(it); }
    for (const [nom, liste] of cats) {
      const sec = el('section', 'univ-cat'), g = el('div', 'univ-groupe'); sec.appendChild(el('h4', '', nom));
      for (const it of liste) { const b = el('button', 'univ-b', it.texte); b.type = 'button'; if (it.id) b.dataset.id = it.id; b.title = it.titre || ''; b.addEventListener('click', () => { try { it.clic(b); } catch (e) { console.warn(e); } }); if (it.actif) b.classList.add('actif'); g.appendChild(b); }
      sec.appendChild(g); s.appendChild(sec);
    }
  },
  charge(texte, p) {
    const c = $('.univ-charge'); if (!c) return;
    if (texte === null) { c.classList.add('fin'); return; }
    c.classList.remove('fin'); if (texte) $('.univ-charge-t', c).textContent = texte; if (p != null) $('progress', c).value = p;
  },
  themeActif(id) { for (const b of E.vue.querySelectorAll('.univ-themes .univ-b')) b.classList.toggle('actif', b.dataset.theme === id); },
};

/* ═════════ place laissée à l'entité Raylé : sélecteur et décalage de la scène ═════════ */
// Sélecteur « position de l'entité » de la barre du haut : même liste et même réglage que ⚙ Réglages (js/rayle/position-entite.js, chargé avant l'Univers)
function brancherSelecteurEntite(sel) {
  const EP = window.RayleEntitePosition; if (!sel) return;
  if (!EP) { sel.hidden = true; return; }
  for (const o of EP.options()) { const x = el('option', '', o.court || o.libelle); x.value = o.valeur; x.title = o.libelle; sel.appendChild(x); }
  const sync = () => { sel.value = EP.valeur(); };
  sync(); sel.addEventListener('change', () => EP.definirValeur(sel.value));
  try { window.RayleBus.on('entite:position', sync); } catch (e) { /* pas de bus */ }
}
// Décale la scène de `px` pixels vers la droite (négatif : vers la gauche) en déplaçant le centre de projection de la caméra : la planète occupe le reste de l'écran quand l'entité est grande sur un côté.
// Le décalage est animé ; les clics (tap), les étiquettes et le lancer de rayon restent justes parce que la matrice de projection porte le décalage.
export function decalerVue(px) { E.decalCible = Math.max(-2000, Math.min(2000, Math.round(+px || 0))); }
function appliquerDecalage(camera, dt) {
  if (E.decal !== E.decalCible) { const d = E.decalCible - E.decal; E.decal = Math.abs(d) < .6 ? E.decalCible : E.decal + d * Math.min(1, dt * 7); }
  if (!camera || !camera.isPerspectiveCamera || !E.w) return;
  if (E.decal) { camera.setViewOffset(E.w, E.h, -Math.round(E.decal), 0, E.w, E.h); E.decalActif = true; }
  else if (E.decalActif) { camera.clearViewOffset(); E.decalActif = false; }
}

/* ═════════ étiquettes DOM accrochées à des points 3D ═════════ */
export function creerEtiquettes() {
  const items = new Map(), pool = [];
  const v3 = new THREE.Vector3();
  function ajouter(o) {
    // o = {id, texte|html, classe, position:Vector3|()=>Vector3, visible?:(v3)=>bool, echelleMin?, onClick?}
    retirer(o.id);
    const n = pool.pop() || el('div', 'univ-lab');
    n.className = 'univ-lab ' + (o.classe || ''); if (o.html != null) n.innerHTML = o.html; else n.textContent = o.texte || '';
    n.onclick = o.onClick ? e => { e.stopPropagation(); o.onClick(o); } : null;
    E.labels.appendChild(n); items.set(o.id, { o, n, vu: true });
    return o.id;
  }
  function retirer(id) { const it = items.get(id); if (!it) return; it.n.remove(); it.n.onclick = null; items.delete(id); pool.push(it.n); }
  function vider(prefixe) { for (const id of [...items.keys()]) if (!prefixe || String(id).startsWith(prefixe)) retirer(id); }
  function maj(camera, w, h) {
    for (const it of items.values()) {
      const o = it.o, p = typeof o.position === 'function' ? o.position() : o.position;
      v3.copy(p); const ok = (!o.visible || o.visible(v3, camera));
      v3.project(camera);
      const dedans = ok && v3.z < 1 && v3.z > -1 && v3.x > -1.05 && v3.x < 1.05 && v3.y > -1.05 && v3.y < 1.05;
      const alpha = dedans ? (o.alpha ? o.alpha(camera) : 1) : 0;
      if (alpha <= .01) { if (it.vu) { it.n.style.display = 'none'; it.vu = false; } continue; }
      if (!it.vu) { it.n.style.display = ''; it.vu = true; }
      it.n.style.transform = 'translate(' + ((v3.x * .5 + .5) * w).toFixed(1) + 'px,' + ((-v3.y * .5 + .5) * h).toFixed(1) + 'px) translate(-50%,-50%)';
      it.n.style.opacity = alpha >= .99 ? '' : alpha.toFixed(2);
    }
  }
  return { ajouter, retirer, vider, maj, items };
}

/* ═════════ rendu et boucle ═════════ */
function creerRenderer() {
  if (E.renderer) return E.renderer;
  const r = new THREE.WebGLRenderer({ canvas: E.canvas, antialias: q.aa, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0x02030a, 1);
  E.renderer = r; appliquerTaille(); return r;
}
function appliquerTaille() {
  if (!E.renderer) return;
  const w = E.vue.clientWidth || innerWidth, h = E.vue.clientHeight || innerHeight;
  E.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, E.mode === 'fond' ? Math.min(q.dpr, 1) : q.dpr)); E.renderer.setSize(w, h, false);   // en fond, la scène se contente de 1 pixel par pixel CSS
  E.w = w; E.h = h;
  if (E.inst) { const c = E.inst.camera; if (c && c.isPerspectiveCamera) { c.aspect = w / h; c.updateProjectionMatrix(); } if (E.inst.redim) E.inst.redim(w, h); }
}
function redimensionner() { if (E.ouvert) appliquerTaille(); }

// En fond, la scène se met en pause quand l'accueil n'est plus à l'écran (onglet caché, terminal, anatomie, réglages) et se limite à ~30 images/s
const FOND_FPS = 30;
function fondMasque() {
  try { if (document.hidden) return true; const v = window.RayleBus && RayleBus.demander('vue'); if (v === 'terminal' || v === 'anatomie') return true; const cfg = document.getElementById('cfg'); return !!(cfg && cfg.classList.contains('open')); } catch (e) { return false; }
}
function boucle(now) {
  if (!E.ouvert) return;
  E.raf = requestAnimationFrame(boucle);
  if (E.mode === 'fond') { if (fondMasque()) { E.tPrec = 0; return; } if (now - E.tFond < 1000 / FOND_FPS - 2 && !E.enCine) return; E.tFond = now; }
  if (document.hidden) { E.tPrec = 0; return; }
  const dt = E.tPrec ? Math.min(.1, (now - E.tPrec) / 1000) : 0; E.tPrec = now; E.t += dt;
  if (dt > 0) { E.ema += (dt * 1000 - E.ema) * .06; E.fps = 1000 / E.ema; mesurerQualite(dt); }
  for (const tw of [...E.tweens]) tw.maj(dt * E.kDt);
  for (const c of E.ctrls) c.maj(dt);
  const inst = E.inst; if (!inst) return;
  appliquerDecalage(inst.camera, dt);
  try { inst.maj(dt, E.t); } catch (e) { console.warn('[univers] maj', e); }
  try { if (inst.rendre) inst.rendre(E.renderer); else E.renderer.render(inst.scene, inst.camera); } catch (e) { console.warn('[univers] rendu', e); }
  if (E.etiq) E.etiq.maj(inst.camera, E.w, E.h);
}
// qualité automatique : si l'écran rame plusieurs secondes de suite, la résolution d'abord, puis le palier
let tQual = 0;
function mesurerQualite(dt) {
  E.mesures++; tQual += dt; if (tQual < 3) return; tQual = 0;
  if (choixQualite !== 'auto' || E.enCine) { E.mauvais = 0; return; }
  if (E.fps < 24) { if (++E.mauvais >= 2) { E.mauvais = 0; baisser(); } } else E.mauvais = 0;
}
function baisser() {
  if (q.dpr > .65) { q.dpr = Math.max(.6, q.dpr * .82); appliquerTaille(); hud.legende('Qualité allégée automatiquement (résolution ' + Math.round(q.dpr * 100) + ' %)', 4000); return; }
  const ordre = ['haute', 'moyenne', 'basse'], i = ordre.indexOf(q.id);
  if (i >= 0 && i < 2) { Object.assign(q, QUALITES[ordre[i + 1]]); appliquerTaille(); try { E.inst && E.inst.qualite && E.inst.qualite(q); } catch (e) {} hud.legende('Qualité « ' + q.nom + ' » appliquée automatiquement pour rester fluide.', 5000); }
}
export function reglerQualite(choix) {
  if (!['auto', 'basse', 'moyenne', 'haute'].includes(choix)) return false;
  choixQualite = choix; lsSet(CLE_Q, choix);
  Object.assign(q, QUALITES[choix === 'auto' ? detecter() : choix]);
  if (E.vue) { const s = $('[data-a="qualite"]'); if (s) s.value = choix; }
  appliquerTaille(); try { E.inst && E.inst.qualite && E.inst.qualite(q); } catch (e) {}
  bus('univers:qualite', { choix, q: q.id });
  return true;
}
export const choixQ = () => choixQualite;

/* ═════════ tweens, attente, cinématique ═════════ */
const douce = t => t * t * (3 - 2 * t), douceSortie = t => 1 - Math.pow(1 - t, 3), douceEntree = t => t * t * t;
export const EASE = { douce, douceSortie, douceEntree, lineaire: t => t, sinus: t => .5 - .5 * Math.cos(Math.PI * t) };
// tween(duree en s, fn(t 0..1), {ease}) → Promise ; une cinématique passée (skip) termine tout de suite à t = 1
export function tween(duree, fn, { ease = douce } = {}) {
  return new Promise(ok => {
    let t = 0; const tw = { maj(dt) { t += dt; const k = Math.min(1, duree > 0 ? t / duree : 1); try { fn(ease(k), k); } catch (e) { console.warn(e); } if (k >= 1) fin(); }, fin };
    function fin() { if (!E.tweens.has(tw)) return; E.tweens.delete(tw); try { fn(ease(1), 1); } catch (e) {} ok(); }
    E.tweens.add(tw); if (duree <= 0) fin();
  });
}
export const attendre = s => new Promise(ok => { let t = 0; const tw = { maj(dt) { t += dt; if (t >= s) fin(); }, fin }; function fin() { if (!E.tweens.has(tw)) return; E.tweens.delete(tw); ok(); } E.tweens.add(tw); });
// Cinématique : fn(api) où api.tween/api.attendre sont passables. « Passer l'animation » force chaque étape à sa fin, sans coupure visuelle.
export async function cinematique(fn, { passable = true, fin } = {}) {
  if (E.enCine) passerAnimation();
  E.enCine = true; const b = $('.univ-passer'); if (b) b.hidden = !passable;
  let passe = false; E.passer = () => { passe = true; for (const tw of [...E.tweens]) tw.fin(); };
  const api = { tween: (d, f, o) => passe ? (f((o && o.ease || douce)(1), 1), Promise.resolve()) : tween(d, f, o), attendre: s => passe ? Promise.resolve() : attendre(s), get passee() { return passe; } };
  try { await fn(api); } finally { E.enCine = false; E.passer = null; if (b) b.hidden = true; if (fin) try { fin(); } catch (e) {} }
}
export function passerAnimation() { if (E.passer) E.passer(); }
export const enCinematique = () => E.enCine;
// outil de test : multiplie la vitesse des animations (tweens, cinématiques) ; 1 = normal
export const vitesseAnimation = k => { E.kDt = Math.max(.1, Math.min(20, +k || 1)); };

/* ═════════ contrôles tactiles + souris ═════════ */
// Une orbite autour de `cible` (OrbitControls) : un doigt = tourner, deux doigts = pincer/zoomer, molette = zoomer. Les thèmes règlent min/max et la vitesse.
export function orbite(camera, { cible = new THREE.Vector3(), min = 1.1, max = 30, rotation = 1, zoom = 1, pan = false, amorti = true } = {}) {
  const c = new OrbitControls(camera, E.canvas);
  c.target.copy(cible); c.enableDamping = amorti; c.dampingFactor = .09; c.enablePan = pan; c.minDistance = min; c.maxDistance = max; c.rotateSpeed = rotation; c.zoomSpeed = zoom;
  c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: pan ? THREE.TOUCH.DOLLY_PAN : THREE.TOUCH.DOLLY_ROTATE };
  c.screenSpacePanning = true;
  const ref = { c, avant: null, maj(dt) { if (ref.avant) ref.avant(c, dt); if (c.enabled) c.update(); }, detruire() { c.dispose(); E.ctrls.splice(E.ctrls.indexOf(ref), 1); } };
  E.ctrls.push(ref); return ref;
}

/* ═════════ assets ═════════ */
const cacheTex = new Map();
export const assets = nom => ASSETS + nom;
export function texture(nom, { srgb = true, aniso = 4, repeat = false, url } = {}) {
  const cle = (url || nom) + '|' + srgb;
  if (cacheTex.has(cle)) return cacheTex.get(cle);
  const p = new Promise((ok, ko) => new THREE.TextureLoader().load(url || (ASSETS + nom), t => {
    t.anisotropy = Math.min(aniso, E.renderer ? E.renderer.capabilities.getMaxAnisotropy() : 4); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; ok(t);
  }, undefined, () => ko(new Error('texture introuvable : ' + nom))));
  cacheTex.set(cle, p); p.catch(() => cacheTex.delete(cle)); return p;
}
export const projeter = (v, camera) => { const p = v.clone().project(camera); return { x: (p.x * .5 + .5) * (E.w || innerWidth), y: (-p.y * .5 + .5) * (E.h || innerHeight), derriere: p.z > 1 }; };

/* ═════════ cycle de vie ═════════ */
async function monterTheme(id, options) {
  const def = THEMES[id]; if (!def) throw new Error('thème inconnu : ' + id);
  hud.charge('Chargement : ' + def.nom + '…', .1);
  const mod = await import(/* @vite-ignore */ new URL(def.url, import.meta.url).href);
  hud.charge(null);
  E.etiq = creerEtiquettes();
  const ctx = { THREE, renderer: E.renderer, canvas: E.canvas, noyau: API, q, options: options || {}, assets, texture, etiquettes: E.etiq };
  hud.charge('Création de la scène…', .35);
  const inst = await (mod.default || mod).creer(ctx);
  E.inst = inst; E.themeId = id; E.ctx = ctx;
  hud.themeActif(id); appliquerTaille();
  try { if (inst.mode) inst.mode(E.mode); } catch (e) { console.warn('[univers] mode', e); }
  const menu = inst.menu ? inst.menu() : []; hud.sousMenu(menu);
  hud.charge(null);
  bus('univers:theme', { theme: id });
  return inst;
}
function demonterTheme() {
  const inst = E.inst; E.inst = null; E.decalActif = false;
  for (const tw of [...E.tweens]) E.tweens.delete(tw);
  for (const c of [...E.ctrls]) c.detruire();
  if (inst) { try { inst.detruire(); } catch (e) { console.warn('[univers] détruire', e); } }
  if (E.etiq) { E.etiq.vider(); E.etiq = null; }
  hud.carte(null); hud.legende(null); hud.sousMenu([]);
  E.themeId = null;
}
// Bascule entre le plein écran et le fond. L'état partagé « univers.ouvert » ne vaut vrai qu'en plein écran (c'est ce qui place l'entité en petite bulle) ;
// « univers.fond » dit que la scène tourne derrière l'accueil.
function definirMode(m) {
  E.mode = m;
  if (E.vue) { E.vue.classList.toggle('univ-fond', m === 'fond'); if (m === 'fond') requestAnimationFrame(() => E.vue && E.vue.classList.add('pret')); else E.vue.classList.remove('pret'); }
  document.body.classList.toggle('univers-actif', m === 'plein');
  document.body.classList.toggle('univers-fond', m === 'fond');
  if (m !== 'plein') { E.decal = E.decalCible = 0; E.decalActif = false; try { E.inst && E.inst.camera && E.inst.camera.clearViewOffset && E.inst.camera.clearViewOffset(); } catch (e) {} }
  if (E.renderer) appliquerTaille();
  try { E.inst && E.inst.mode && E.inst.mode(m); } catch (e) { console.warn('[univers] mode', e); }
  bus('univers:etat', { ouvert: m === 'plein', fond: m === 'fond', mode: m });
  try { RayleBus.fusion('univers', { ouvert: m === 'plein', fond: m === 'fond', mode: m }); } catch (e) {}
}
function demarrer(m) {
  construireVue();
  E.vue.hidden = false; E.ouvert = true; E.tPrec = 0; E.tFond = 0;
  creerRenderer(); definirMode(m);
  E.raf = requestAnimationFrame(boucle);
}
// Le fond de l'accueil : la scène de l'Univers sans menu ni HUD, que Raylé pilote par la voix (commande(…)). Sans effet si elle tourne déjà (en fond ou en plein écran).
export async function ouvrirFond(themeId = 'espace', options = {}) {
  E.fondVoulu = true;
  if (E.montage) return E.montage;
  if (E.ouvert) return E.inst;
  const n = ++E.ouverture;
  demarrer('fond');
  E.montage = (async () => {
    try {
      const inst = await monterTheme(themeId, options);
      if (n !== E.ouverture) { if (E.inst === inst) { try { demonterTheme(); } catch (e) {} } return null; }   // fermé pendant le chargement
      return inst;
    } catch (e) { if (n === E.ouverture) arreter(); throw e; }
    finally { E.montage = null; }
  })();
  return E.montage;
}
export async function ouvrir(themeId = 'espace', options = {}) {
  if (E.montage) { try { await E.montage; } catch (e) { /* on retente en plein écran */ } }
  const n = ++E.ouverture;
  construireVue();
  if (E.ouvert && E.mode === 'fond') definirMode('plein');
  else if (!E.ouvert) demarrer('plein');
  if (E.inst && E.themeId && E.themeId !== themeId && THEMES[themeId]) return changerTheme(themeId, options);
  if (E.themeId === themeId && E.inst) { if (options && Object.keys(options).length && E.inst.commande) await E.inst.commande('options', options); return E.inst; }
  hud.charge('Chargement…', .05);
  try {
    if (E.inst) demonterTheme();
    const inst = await monterTheme(themeId, options);
    if (n !== E.ouverture) return inst;
    return inst;
  } catch (e) {
    console.error('[univers]', e); hud.charge(null); hud.legende('Impossible de charger ce thème : ' + (e && e.message || e), 9000);
    throw e;
  }
}
// quitte le plein écran ; si le fond Univers est voulu, la scène reste en fond derrière l'accueil (même scène, même vue)
export function fermer() {
  if (!E.ouvert) return;
  if (E.mode === 'plein' && E.fondVoulu) { definirMode('fond'); return; }
  arreter();
}
// libère tout : scène, rendu, contexte WebGL
export function arreter() {
  if (!E.ouvert) return;
  E.ouvert = false; E.mode = null; cancelAnimationFrame(E.raf); E.ouverture++; E.decal = E.decalCible = 0; E.decalActif = false;
  demonterTheme();
  if (E.renderer) { try { E.renderer.dispose(); E.renderer.forceContextLoss(); } catch (e) {} E.renderer = null; E.canvas.replaceWith(E.canvas.cloneNode(false)); E.canvas = $('canvas', E.vue); wirerCanvas(); }
  E.vue.hidden = true; E.vue.classList.remove('univ-fond', 'pret'); document.body.classList.remove('univers-actif', 'univers-fond');
  bus('univers:etat', { ouvert: false, fond: false, mode: null }); try { RayleBus.fusion('univers', { ouvert: false, fond: false, mode: null, theme: null }); } catch (e) {}
}
// le fond Univers est-il voulu (réglage Fond = Univers) ? false : la scène se ferme dès qu'on quitte le plein écran
export async function fond(oui) {
  E.fondVoulu = !!oui;
  if (oui) return ouvrirFond();
  if (E.ouvert && E.mode === 'fond') arreter();
  return null;
}
// tap sur la scène (appelé à chaque nouveau canvas : un canvas ne change pas de contexte, il est recréé à la fermeture)
function wirerCanvas() {
  let d0 = null;
  E.canvas.addEventListener('pointerdown', e => { d0 = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; });
  E.canvas.addEventListener('pointerup', e => {
    if (!d0 || e.pointerId !== d0.id) return;
    const bouge = Math.hypot(e.clientX - d0.x, e.clientY - d0.y), duree = performance.now() - d0.t; d0 = null;
    if (bouge < 8 && duree < 500 && E.inst && E.inst.tap) { const r = E.canvas.getBoundingClientRect(); try { E.inst.tap(e.clientX - r.left, e.clientY - r.top, e); } catch (er) { console.warn('[univers] tap', er); } }
  });
}
// changement brut : fondu au noir, démontage, montage
export async function changerThemeBrut(id, options) {
  if (!E.ouvert) return ouvrir(id, options);
  if (E.themeId === id) return E.inst;
  const f = $('.univ-fondu'); f.classList.add('vu'); await new Promise(r => setTimeout(r, 520));
  try { demonterTheme(); return await monterTheme(id, options); }
  finally { f.classList.remove('vu'); }
}
export async function changerTheme(id, options) {
  if (!E.ouvert) return ouvrir(id, options);
  if (E.themeId === id) return E.inst;
  return changerThemeBrut(id, options);
}
// fondu au noir (0,5 s) pour passer d'une vue à l'autre sans coupure brutale
export const fondu = oui => new Promise(ok => { const f = E.vue && $('.univ-fondu'); if (!f) return ok(); f.classList.toggle('vu', !!oui); setTimeout(ok, 520); });
// commandes communes à tous les thèmes (qualité, passer l'animation, changer de thème) ; le reste est transmis au thème actif
export const commande = async (nom, args = {}) => {
  if (nom === 'qualite') { const n = ['auto', 'basse', 'moyenne', 'haute'].includes(args.niveau) ? args.niveau : 'auto'; reglerQualite(n); return { ok: true, texte: n === 'auto' ? 'Qualité automatique.' : 'Qualité ' + n + '.' }; }
  if (nom === 'passer') { if (E.enCine) { passerAnimation(); return { ok: true, texte: 'J’ai passé l’animation.' }; } return { ok: true, texte: 'Il n’y a pas d’animation en cours.' }; }
  if (nom === 'theme') { if (!THEMES[args.theme]) return { ok: false, texte: 'Thème inconnu.' }; await changerTheme(args.theme, args); return { ok: true, texte: 'C’est fait.' }; }
  return E.inst && E.inst.commande ? E.inst.commande(nom, args) : { ok: false, texte: 'Aucune scène ouverte.' };
};
export const etat = () => ({ decalage: E.decalCible, ouvert: E.ouvert, plein: E.mode === 'plein', fond: E.mode === 'fond', fondVoulu: E.fondVoulu, theme: E.themeId, fps: Math.round(E.fps), qualite: q.id, choixQualite, enCinematique: E.enCine, scene: E.inst && E.inst.etat ? E.inst.etat() : null });
export const instance = () => E.inst;
export const decalage = () => E.decal;                 // décalage horizontal (px) actuellement appliqué à la scène : la carte détaillée le suit
export const dims = () => ({ w: E.w, h: E.h });
export const rendu = () => E.renderer;
export const temps = () => E.t;

const API = { THREE, q, hud, decalerVue, decalage, fondu, vitesseAnimation, tween, attendre, cinematique, passerAnimation, enCinematique, orbite, texture, assets, creerEtiquettes, projeter, EASE, ouvrir, ouvrirFond, fond, arreter, fermer, changerTheme, changerThemeBrut, commande, etat, instance, reglerQualite, dims, rendu, temps, THEMES, QUALITES };
export default API;
