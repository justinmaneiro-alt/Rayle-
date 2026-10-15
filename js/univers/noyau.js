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

const VERSION = '2026.10.15.1';
const ASSETS = new URL('../../ui/assets/', import.meta.url).href;
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
const E = { ouvert: false, vue: null, canvas: null, renderer: null, themeId: null, inst: null, raf: 0, tPrec: 0, t: 0, fps: 60, ema: 16.7, mesures: 0, mauvais: 0, ctx: null, ouverture: 0, labels: null, passer: null, ctrls: [], tweens: new Set(), enCine: false, kDt: 1 };
const bus = (n, d) => { try { window.RayleBus && RayleBus.emit(n, d); } catch (e) {} };
const $ = (s, r) => (r || E.vue).querySelector(s);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

/* ═════════ vue plein écran et HUD ═════════ */
function construireVue() {
  if (E.vue) return;
  const v = el('div'); v.id = 'vueUnivers'; v.hidden = true;
  v.innerHTML = '<canvas class="univ-canvas" tabindex="0" aria-label="Scène 3D : glisser pour tourner, pincer ou molette pour zoomer"></canvas>'
    + '<div class="univ-labels"></div><div class="univ-fondu"></div>'
    + '<div class="univ-hud"><div class="univ-haut"><div><div class="univ-groupe univ-themes" role="group" aria-label="Thème"></div><div class="univ-sous" aria-label="Modes du thème"></div></div>'
    + '<div class="univ-groupe"><button type="button" class="univ-b" data-a="ranger" title="Réduire Raylé en petite bulle : toute la scène est à toi">🫧 Ranger Raylé</button>'
    + '<select class="univ-select" data-a="qualite" aria-label="Qualité"><option value="auto">Qualité : auto</option><option value="basse">Basse</option><option value="moyenne">Moyenne</option><option value="haute">Haute</option></select>'
    + '<button type="button" class="univ-b danger" data-a="quitter" title="Retour à Raylé">✕ Quitter</button></div></div>'
    + '<div class="univ-bas"><div class="univ-carte" hidden><button type="button" class="univ-x" aria-label="Fermer la fiche">✕</button><div class="univ-carte-c"></div></div><div class="univ-legende" role="status" aria-live="polite"></div></div>'
    + '<button type="button" class="univ-b univ-passer" hidden>⏭ Passer l’animation</button></div>'
    + '<div class="univ-charge"><div class="univ-charge-t">Chargement de l’Univers…</div><progress max="1" value="0"></progress></div>';
  const fond = document.getElementById('uiFond');
  if (fond && fond.parentNode) fond.parentNode.insertBefore(v, fond.nextSibling); else document.body.prepend(v);
  E.vue = v; E.canvas = $('canvas', v); E.labels = $('.univ-labels', v);
  const themes = $('.univ-themes');
  for (const [id, t] of Object.entries(THEMES)) { const b = el('button', 'univ-b', t.icone + ' ' + t.nom); b.type = 'button'; b.dataset.theme = id; b.addEventListener('click', () => changerTheme(id)); themes.appendChild(b); }
  v.querySelector('[data-a="quitter"]').addEventListener('click', () => fermer());
  v.querySelector('[data-a="ranger"]').addEventListener('click', () => { try { RayleRangement.basculer(); } catch (e) {} });
  const sel = v.querySelector('[data-a="qualite"]'); sel.value = choixQualite; sel.addEventListener('change', () => reglerQualite(sel.value));
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
    for (const it of items || []) { const b = el('button', 'univ-b', it.texte); b.type = 'button'; if (it.id) b.dataset.id = it.id; b.title = it.titre || ''; b.addEventListener('click', () => { try { it.clic(b); } catch (e) { console.warn(e); } }); if (it.actif) b.classList.add('actif'); s.appendChild(b); }
  },
  charge(texte, p) {
    const c = $('.univ-charge'); if (!c) return;
    if (texte === null) { c.classList.add('fin'); return; }
    c.classList.remove('fin'); if (texte) $('.univ-charge-t', c).textContent = texte; if (p != null) $('progress', c).value = p;
  },
  themeActif(id) { for (const b of E.vue.querySelectorAll('.univ-themes .univ-b')) b.classList.toggle('actif', b.dataset.theme === id); },
};

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
  E.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.dpr)); E.renderer.setSize(w, h, false);
  E.w = w; E.h = h;
  if (E.inst) { const c = E.inst.camera; if (c && c.isPerspectiveCamera) { c.aspect = w / h; c.updateProjectionMatrix(); } if (E.inst.redim) E.inst.redim(w, h); }
}
function redimensionner() { if (E.ouvert) appliquerTaille(); }

function boucle(now) {
  if (!E.ouvert) return;
  E.raf = requestAnimationFrame(boucle);
  if (document.hidden) { E.tPrec = 0; return; }
  const dt = E.tPrec ? Math.min(.1, (now - E.tPrec) / 1000) : 0; E.tPrec = now; E.t += dt;
  if (dt > 0) { E.ema += (dt * 1000 - E.ema) * .06; E.fps = 1000 / E.ema; mesurerQualite(dt); }
  for (const tw of [...E.tweens]) tw.maj(dt * E.kDt);
  for (const c of E.ctrls) c.maj(dt);
  const inst = E.inst; if (!inst) return;
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
  const menu = inst.menu ? inst.menu() : []; hud.sousMenu(menu);
  hud.charge(null);
  bus('univers:theme', { theme: id });
  return inst;
}
function demonterTheme() {
  const inst = E.inst; E.inst = null;
  for (const tw of [...E.tweens]) E.tweens.delete(tw);
  for (const c of [...E.ctrls]) c.detruire();
  if (inst) { try { inst.detruire(); } catch (e) { console.warn('[univers] détruire', e); } }
  if (E.etiq) { E.etiq.vider(); E.etiq = null; }
  hud.carte(null); hud.legende(null); hud.sousMenu([]);
  E.themeId = null;
}
export async function ouvrir(themeId = 'espace', options = {}) {
  const n = ++E.ouverture;
  construireVue();
  if (!E.ouvert) {
    E.vue.hidden = false; document.body.classList.add('univers-actif'); E.ouvert = true; E.tPrec = 0;
    creerRenderer(); appliquerTaille();
    bus('univers:etat', { ouvert: true }); try { RayleBus.fusion('univers', { ouvert: true }); } catch (e) {}
    E.raf = requestAnimationFrame(boucle);
  }
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
export function fermer() {
  if (!E.ouvert) return;
  E.ouvert = false; cancelAnimationFrame(E.raf); E.ouverture++;
  demonterTheme();
  if (E.renderer) { try { E.renderer.dispose(); E.renderer.forceContextLoss(); } catch (e) {} E.renderer = null; E.canvas.replaceWith(E.canvas.cloneNode(false)); E.canvas = $('canvas', E.vue); wirerCanvas(); }
  E.vue.hidden = true; document.body.classList.remove('univers-actif');
  bus('univers:etat', { ouvert: false }); try { RayleBus.fusion('univers', { ouvert: false, theme: null }); } catch (e) {}
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
export const etat = () => ({ ouvert: E.ouvert, theme: E.themeId, fps: Math.round(E.fps), qualite: q.id, choixQualite, enCinematique: E.enCine, scene: E.inst && E.inst.etat ? E.inst.etat() : null });
export const instance = () => E.inst;
export const dims = () => ({ w: E.w, h: E.h });
export const rendu = () => E.renderer;
export const temps = () => E.t;

const API = { THREE, q, hud, fondu, vitesseAnimation, tween, attendre, cinematique, passerAnimation, enCinematique, orbite, texture, assets, creerEtiquettes, projeter, EASE, ouvrir, fermer, changerTheme, changerThemeBrut, commande, etat, instance, reglerQualite, dims, rendu, temps, THEMES, QUALITES };
export default API;
