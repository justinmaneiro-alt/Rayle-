/* ═════════════ MOTEUR 3D DU CERVEAU (three.js) ═════════════
   Formes : cerveau-bp3d.glb (BodyParts3D, CC BY 4.0), chargé par modeles-glb.js ; repli sans fichier : ellipsoïdes schématiques aux positions d'atlas (formeSecours).
   Couches : cortex, substance blanche, noyaux profonds, tronc et cervelet, ventricules, faisceaux (tracés schématiques), neurones animés, carte de Brodmann (approximative).
   Neurones animés : impulsions lumineuses qui parcourent les faisceaux et des réseaux locaux sous le cortex ; leur nombre et leur intensité suivent la zone ou le réseau choisi.
   Qualité : eco · standard · haute · ultra (jamais choisi automatiquement) ; si l'image devient trop lente le moteur le signale (surDegrade) pour redescendre d'un palier.
   Repère du modèle : mètres, y vers le haut, face vers +z, côté gauche du sujet vers +x (comme tout le module Anatomie). */
import { chargerCouche } from './modeles-glb.js?v=2026.10.14.3';
import * as D from './donnees-cerveau.js?v=2026.10.14.3';
import { zoneDeStructure } from './cerveau-recherche.js?v=2026.10.14.3';

export const NIVEAUX_CERVEAU = ['eco', 'standard', 'haute', 'ultra'];
export const NOMS_NIVEAUX_CERVEAU = { eco: 'Éco', standard: 'Standard', haute: 'Haute', ultra: 'Ultra' };
export const QUALITE = {
  eco:      { dpr: 1,   impulsions: 120,  locaux: 30,  tubes: false, dendrites: false, bloom: 0,   physique: false, msaa: 0 },
  standard: { dpr: 1.5, impulsions: 360,  locaux: 90,  tubes: true,  dendrites: false, bloom: 0,   physique: true,  msaa: 0 },
  haute:    { dpr: 2,   impulsions: 800,  locaux: 200, tubes: true,  dendrites: true,  bloom: .55, physique: true,  msaa: 4 },
  ultra:    { dpr: 2.5, impulsions: 1800, locaux: 420, tubes: true,  dendrites: true,  bloom: .95, physique: true,  msaa: 8 }
};
export const CALQUES_CERVEAU = ['cortex', 'blanche', 'profond', 'tronc', 'liquide', 'faisceaux', 'neurones', 'brodmann'];
export const NOMS_CALQUES_CERVEAU = { cortex: 'Cortex', blanche: 'Substance blanche', profond: 'Noyaux profonds', tronc: 'Tronc et cervelet', liquide: 'Ventricules', faisceaux: 'Faisceaux', neurones: 'Neurones', brodmann: 'Aires de Brodmann' };
const TYPE_CALQUE = { cortex: 'cortex', blanche: 'blanche', profond: 'profond', tronc: 'tronc', liquide: 'liquide', aire: null };
const ORDRE = { liquide: 1, profond: 2, tronc: 2, blanche: 3, aire: 6, cortex: 5 };

/** Formes de secours (sans fichier 3D) : [centre g, a, s ; rayons] en mm d'atlas, un seul côté (miroir pour l'autre) */
const FORMES_SECOURS = {
  'lobe-frontal': [[28, 38, 22], [28, 36, 34]], 'lobe-parietal': [[28, -50, 44], [28, 28, 28]], 'lobe-temporal': [[48, -14, -12], [18, 38, 16]], 'lobe-occipital': [[20, -86, 8], [24, 16, 24]],
  cervelet: [[0, -62, -34], [46, 26, 16], true], mesencephale: [[0, -24, -16], [9, 10, 12], true], pont: [[0, -28, -34], [14, 12, 12], true], bulbe: [[0, -40, -52], [9, 9, 16], true],
  thalamus: [[11, -18, 8], [9, 14, 8]], hippocampe: [[27, -24, -12], [6, 20, 6]], amygdale: [[23, -4, -20], [7, 7, 7]], 'noyau-caude': [[13, 10, 14], [5, 14, 8]], putamen: [[25, 4, 2], [6, 14, 10]], 'globus-pallidus': [[18, 0, 2], [4, 7, 6]],
  'ventricule-lateral': [[10, -10, 20], [6, 30, 10]], 'troisieme-ventricule': [[0, -10, 6], [2, 8, 8], true], 'quatrieme-ventricule': [[0, -44, -32], [5, 5, 6], true], hypothalamus: [[0, -2, -8], [6, 6, 6], true],
  'corps-calleux': [[0, -4, 26], [5, 40, 5], true], insula: [[38, 6, 6], [4, 16, 12]], 'gyrus-cingulaire': [[6, -2, 32], [4, 38, 5]], hypophyse: [[0, 2, -26], [4, 4, 4], true], epiphyse: [[0, -36, 12], [3, 3, 3], true],
  'substance-blanche': [[22, -18, 22], [34, 54, 30]], fornix: [[6, -8, 14], [3, 16, 10], true]
};

const noeud = nom => { const p = nom.split('__'); return { id: p[0], cote: p[1] || 'M' }; };
const hasard = (() => { let s = 20241014; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();

export class MoteurCerveau {
  constructor(THREE, canvas, opts = {}) {
    this.T = THREE; this.canvas = canvas; this.opts = opts; this.niveau = NIVEAUX_CERVEAU.includes(opts.niveau) ? opts.niveau : 'standard';
    this.etat = {
      calques: { cortex: true, blanche: false, profond: true, tronc: true, liquide: false, faisceaux: true, neurones: true, brodmann: false },
      opacites: { cortex: .55, blanche: .85, profond: 1, tronc: 1, liquide: .8 },
      couleurs: 'lobes', cote: 'les deux', zone: null, reseau: null, coupe: null, vitesse: 1
    };
    this.formes = new Map(); this.chemins = []; this.pulses = []; this.notes = []; this.mort = false; this.t0 = performance.now();
    this.imagesMesurees = []; this.prete = false; this.source = 'aucune'; this.fondus = new Set();
    this.rendu = new THREE.WebGLRenderer({ canvas, antialias: this.niveau !== 'eco', alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.capture });
    this.rendu.localClippingEnabled = false; this.rendu.setClearColor(0x070912, 1);
    if (THREE.SRGBColorSpace) this.rendu.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x070912);
    this.camera = new THREE.PerspectiveCamera(32, 1, .01, 6);
    this.racine = new THREE.Group(); this.scene.add(this.racine);
    this.reseauG = new THREE.Group(); this.racine.add(this.reseauG);
    this.cible = new THREE.Vector3(); this.az = -Math.PI / 2 + .55; this.el = .22; this.dist = .5; this.anim = null;
    const hem = new THREE.HemisphereLight(0xdfe9ff, 0x2a1d26, .55); const cle = new THREE.DirectionalLight(0xfff1e0, 2.0); cle.position.set(.6, .9, .8);
    const rempl = new THREE.DirectionalLight(0x9fc0ff, .7); rempl.position.set(-.8, .2, .5); const contre = new THREE.DirectionalLight(0xffffff, .9); contre.position.set(-.2, .6, -.9);
    this.lumieres = [hem, cle, rempl, contre]; this.lumieres.forEach(l => this.scene.add(l));
    this.rect = canvas.getBoundingClientRect();
  }

  // ───────────────────────── démarrage ─────────────────────────
  async init() {
    const T = this.T;
    try { const { OrbitControls } = await import('three/addons/controls/OrbitControls.js'); this.controles = new OrbitControls(this.camera, this.canvas); Object.assign(this.controles, { enableDamping: true, dampingFactor: .08, minDistance: .1, maxDistance: 1.2, rotateSpeed: .8, zoomSpeed: .9 }); this.controles.addEventListener('start', () => { this.anim = null; }); }
    catch (e) { console.warn('[cerveau] OrbitControls indisponible : contrôles tactiles simples'); this.controlesSimples(); }
    this.redimensionner();
    let c = null; try { c = await chargerCouche('cerveau-bp3d.glb'); } catch (e) { c = null; }
    if (this.mort) return;
    if (c && c.scene) { this.construireDepuisGLB(c.scene); this.source = 'BodyParts3D'; } else { this.construireSecours(); this.source = 'schématique'; }
    this.calerRepere();
    this.construireFaisceaux(); this.construireReseau();
    this.appliquerQualite(); this.appliquerCalques(true);
    this.brancherSouris();
    this.placerCamera(); this.prete = true; if (this.opts.surPret) this.opts.surPret(this.source);
    this.boucle();
  }
  /** Contrôles minimaux si OrbitControls ne se charge pas : glisser = tourner, molette ou pincement = zoom */
  controlesSimples() {
    const cv = this.canvas, pts = new Map(); let dp = 0; cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture && cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); this.anim = null; });
    cv.addEventListener('pointermove', e => { const p = pts.get(e.pointerId); if (!p) return; const dx = e.clientX - p[0], dy = e.clientY - p[1]; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) { this.az -= dx * .007; this.el = Math.max(-1.4, Math.min(1.4, this.el + dy * .007)); }
      else if (pts.size === 2) { const a = [...pts.values()], d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); if (dp) this.dist = Math.max(.1, Math.min(1.2, this.dist * dp / d)); dp = d; }
      this.placerCamera(); });
    const fin = e => { pts.delete(e.pointerId); dp = 0; }; cv.addEventListener('pointerup', fin); cv.addEventListener('pointercancel', fin);
    cv.addEventListener('wheel', e => { e.preventDefault(); this.dist = Math.max(.1, Math.min(1.2, this.dist * (e.deltaY > 0 ? 1.1 : .9))); this.placerCamera(); }, { passive: false });
    this.controlesSimplesActifs = true;
  }

  // ───────────────────────── formes ─────────────────────────
  materiau(def, cote) {
    const T = this.T, q = QUALITE[this.niveau], lobes = def.type === 'cortex' && this.etat.couleurs === 'lobes';
    const couleur = def.type === 'cortex' ? (lobes ? def.couleur : 0xd8a79d) : def.couleur;
    const base = { color: couleur, transparent: false, opacity: 1, side: T.FrontSide };
    let m;
    if (!q.physique) m = new T.MeshLambertMaterial(base);
    else if (def.type === 'cortex') m = new T.MeshPhysicalMaterial(Object.assign(base, { roughness: .52, metalness: 0, clearcoat: .3, clearcoatRoughness: .45, sheen: .25, sheenColor: new T.Color(0xffd6d0) }));
    else if (def.type === 'liquide') m = new T.MeshPhysicalMaterial(Object.assign(base, { roughness: .12, metalness: 0, clearcoat: 1 }));
    else m = new T.MeshStandardMaterial(Object.assign(base, { roughness: .6, metalness: 0 }));
    m.userData = { couleur, type: def.type };
    if (def.type === 'aire') { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; }
    return m;
  }
  ajouterForme(id, cote, mesh) {
    const def = D.STRUCTURE_PAR_ID[id]; if (!def) return;
    let f = this.formes.get(id); if (!f) { f = { id, def, meshes: [], op: 0, cible: 0, zone: zoneDeStructure(id) && zoneDeStructure(id).id, emissif: 0 }; this.formes.set(id, f); }
    mesh.material = this.materiau(def, cote); mesh.userData.forme = id; mesh.userData.cote = cote; mesh.renderOrder = ORDRE[def.type] || 3;
    mesh.visible = false; this.racine.add(mesh); f.meshes.push(mesh);
  }
  construireDepuisGLB(scene) {
    const T = this.T, liste = []; scene.traverse(o => { if (o.isMesh) liste.push(o); });
    for (const o of liste) {
      const { id, cote } = noeud(o.name || ''); if (!D.STRUCTURE_PAR_ID[id]) continue;
      const g = o.geometry; if (!g.attributes.normal) g.computeVertexNormals(); g.computeBoundingBox();
      const m = new T.Mesh(g); this.ajouterForme(id, cote, m);
    }
    if (!this.formes.size) throw new Error('aucune forme reconnue');
  }
  construireSecours() {
    const T = this.T;
    for (const [id, [c, r, centre]] of Object.entries(FORMES_SECOURS)) {
      for (const cote of centre ? ['M'] : ['G', 'D']) {
        const sg = cote === 'D' ? -1 : 1, g = new T.SphereGeometry(1, 28, 20), m = new T.Mesh(g);
        m.userData.secours = [c[0] * sg * (centre ? 0 : 1), c[1], c[2], r[0], r[1], r[2]];
        this.ajouterForme(id, cote, m);
      }
    }
    this.secoursPlace = false;
  }
  /** Convertit les coordonnées d'atlas (mm) en coordonnées du modèle ; en mode secours, place les ellipsoïdes. Recentre la racine sur le cerveau. */
  calerRepere() {
    const T = this.T;
    const hem = new T.Box3();
    if (this.source === 'schématique') {
      // atlas ↔ mètres : 1 mm = 0,001 m, axes (g, a, s) → (x, z, y)
      this.mm = { echelle: .001, centre: new T.Vector3(0, 0, 0) };
      for (const f of this.formes.values()) for (const m of f.meshes) { const s = m.userData.secours; m.position.set(s[0] * .001, s[2] * .001, s[1] * .001); m.scale.set(s[3] * .001, s[5] * .001, s[4] * .001); }
      this.racine.updateMatrixWorld(true);
      for (const f of this.formes.values()) if (f.def.type === 'cortex') for (const m of f.meshes) hem.expandByObject(m);
      this.racine.position.set(0, 0, 0);
    } else {
      this.racine.updateMatrixWorld(true);
      for (const f of this.formes.values()) if (f.def.type === 'cortex') for (const m of f.meshes) hem.expandByObject(m);
    }
    if (hem.isEmpty()) hem.set(new T.Vector3(-.07, -.05, -.09), new T.Vector3(.07, .07, .08));
    this.boiteCortex = hem.clone(); const c = hem.getCenter(new T.Vector3()), s = hem.getSize(new T.Vector3());
    this.centre = c; this.demi = s.multiplyScalar(.5);
    this.racine.position.copy(c).negate();      // le cerveau est centré sur l'origine du monde
    this.racine.updateMatrixWorld(true);
    // boîte de tout le cerveau, pour les plans de coupe
    const tout = new T.Box3(); this.racine.traverse(o => { if (o.isMesh && o.userData.forme) tout.expandByObject(o); }); this.boiteTout = tout;
    this.dist = this.distCadre(); this.cible.set(0, 0, 0);
  }
  /** atlas (g, a, s) en mm → point dans le repère local de `racine` (celui des maillages) */
  mni(g, a, s) {
    const A = D.ATLAS_MNI, T = this.T;
    return new T.Vector3(this.centre.x + (g - A.centre[0]) / A.demi[0] * this.demi.x, this.centre.y + (s - A.centre[2]) / A.demi[2] * this.demi.y, this.centre.z + (a - A.centre[1]) / A.demi[1] * this.demi.z);
  }

  // ───────────────────────── faisceaux et neurones ─────────────────────────
  construireFaisceaux() {
    const T = this.T, q = QUALITE[this.niveau]; this.faisceauxG = new T.Group(); this.reseauG.add(this.faisceauxG);
    this.matFaisceau = new Map();
    for (const f of D.FAISCEAUX_CERVEAU) {
      const courbes = [], voies = f.ens || [f.pts];
      for (const pts of voies) for (const sg of f.sym ? [1, -1] : [1]) courbes.push({ pts: pts.map(p => this.mni(p[0] * sg, p[1], p[2])), cote: sg > 0 ? 'G' : 'D' });
      const mat = q.tubes ? new T.MeshBasicMaterial({ color: f.couleur, transparent: true, opacity: .32, depthWrite: false }) : new T.LineBasicMaterial({ color: f.couleur, transparent: true, opacity: .45, depthWrite: false });
      this.matFaisceau.set(f.id, mat);
      for (const c of courbes) {
        const courbe = new T.CatmullRomCurve3(c.pts, false, 'centripetal'), echant = courbe.getPoints(64);
        let obj;
        if (q.tubes) obj = new T.Mesh(new T.TubeGeometry(courbe, 56, this.demi.x * .0065, 5, false), mat);
        else obj = new T.Line(new T.BufferGeometry().setFromPoints(echant), mat);
        obj.renderOrder = 7; this.faisceauxG.add(obj);
        this.chemins.push({ i: 0, faisceau: f.id, cote: c.cote, pts: echant, couleur: new T.Color(f.couleur), sens: f.sens, activite: .2, cible: .2, locale: false, structures: null });
      }
    }
  }
  construireReseau() {
    const T = this.T, q = QUALITE[this.niveau];
    // réseaux locaux : arcs courts sous le cortex, entre deux points proches d'une même région (échantillonnés sur les sommets du cortex)
    const sources = [];
    for (const f of this.formes.values()) if (f.def.type === 'cortex' || f.def.type === 'aire') for (const m of f.meshes) { const p = m.geometry.attributes.position, pas = Math.max(1, Math.floor(p.count / 160)); for (let i = (hasard() * pas) | 0; i < p.count; i += pas) sources.push([f.id, m, i]); }
    const centreLocal = this.centre, v = new T.Vector3(), w = new T.Vector3();
    const point = (s, creux) => { const [id, m, i] = s, p = m.geometry.attributes.position; v.set(p.getX(i), p.getY(i), p.getZ(i)); const r = v.clone(); r.lerp(centreLocal, creux); return r; };
    const nLocaux = sources.length ? q.locaux : 0;
    for (let k = 0; k < nLocaux; k++) {
      const a = sources[(hasard() * sources.length) | 0]; let b = null, bd = 1e9;
      for (let essai = 0; essai < 14; essai++) { const c = sources[(hasard() * sources.length) | 0]; if (c === a) continue; const d = point(a, 0).distanceTo(point(c, 0)); if (d > this.demi.x * .12 && d < bd && d < this.demi.x * .75) { bd = d; b = c; } }
      if (!b) continue;
      const pa = point(a, .08), pb = point(b, .08), milieu = pa.clone().lerp(pb, .5).lerp(centreLocal, .14 + .12 * hasard());
      const courbe = new T.QuadraticBezierCurve3(pa, milieu, pb), echant = courbe.getPoints(24);
      this.chemins.push({ faisceau: null, cote: 'M', pts: echant, couleur: new T.Color().setHSL(.55 + .1 * hasard(), .8, .62), sens: 'bidirectionnel', activite: .12, cible: .12, locale: true, structures: [a[0], b[0]] });
      if (k < nLocaux * .5) { const g = new T.BufferGeometry().setFromPoints(echant); const l = new T.Line(g, new T.LineBasicMaterial({ color: 0x4d6bd0, transparent: true, opacity: .16, depthWrite: false })); l.renderOrder = 7; l.userData.local = true; this.faisceauxG.add(l); }
    }
    this.chemins.forEach((c, i) => { c.i = i; });
    // longueurs de chemin
    for (const c of this.chemins) { let L = 0; for (let i = 1; i < c.pts.length; i++) L += c.pts[i].distanceTo(c.pts[i - 1]); c.longueur = L || 1; }
    // soma : extrémités des chemins ; synapses : arrivée des impulsions
    const extr = []; for (const c of this.chemins) { extr.push({ c, bout: 0 }); extr.push({ c, bout: 1 }); }
    this.extr = extr;
    const mat = () => new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, clipping: true, uniforms: { echelle: { value: 400 } },
      vertexShader: 'attribute float aAlpha; attribute float aSize; attribute vec3 aColor; varying float vA; varying vec3 vC; uniform float echelle;\n#include <clipping_planes_pars_vertex>\nvoid main(){ vA=aAlpha; vC=aColor; vec4 mvPosition=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mvPosition; gl_PointSize=max(1.0,aSize*echelle/-mvPosition.z);\n#include <clipping_planes_vertex>\n}',
      fragmentShader: '#include <clipping_planes_pars_fragment>\nvarying float vA; varying vec3 vC; void main(){\n#include <clipping_planes_fragment>\nfloat d=length(gl_PointCoord-vec2(0.5)); float a=smoothstep(0.5,0.0,d); a=a*a*vA; if(a<0.01) discard; gl_FragColor=vec4(vC*(1.0+1.4*a),a); }'
    });
    const points = (n) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('aAlpha', new T.BufferAttribute(new Float32Array(n), 1)); g.setAttribute('aSize', new T.BufferAttribute(new Float32Array(n).fill(1), 1)); g.setAttribute('aColor', new T.BufferAttribute(new Float32Array(n * 3), 3)); g.boundingSphere = new T.Sphere(new T.Vector3(), 10); return g; };
    // impulsions
    const N = q.impulsions; this.geoImp = points(N); this.matImp = mat(); this.ptsImp = new T.Points(this.geoImp, this.matImp); this.ptsImp.frustumCulled = false; this.ptsImp.renderOrder = 9; this.reseauG.add(this.ptsImp);
    const taille = this.demi.x * .028; this.tailleImp = taille;
    for (let i = 0; i < N; i++) { this.pulses.push({ c: null, t: hasard(), v: 0, s: 1 }); this.reaffecter(this.pulses[i], true); }
    // somas et synapses
    const M = extr.length; this.geoSoma = points(M); this.matSoma = mat(); this.ptsSoma = new T.Points(this.geoSoma, this.matSoma); this.ptsSoma.frustumCulled = false; this.ptsSoma.renderOrder = 9; this.reseauG.add(this.ptsSoma);
    extr.forEach((e, i) => { const p = e.c.pts[e.bout ? e.c.pts.length - 1 : 0]; this.geoSoma.attributes.position.setXYZ(i, p.x, p.y, p.z); this.geoSoma.attributes.aColor.setXYZ(i, e.c.couleur.r, e.c.couleur.g, e.c.couleur.b); this.geoSoma.attributes.aSize.setX(i, this.demi.x * (e.bout ? .022 : .03)); e.flash = 0; });
    // dendrites des somas (haute et ultra) : petites branches
    if (q.dendrites) {
      const seg = [], R = this.demi.x * .09;
      extr.forEach((e, i) => { if (i % 2) return; const p = e.c.pts[e.bout ? e.c.pts.length - 1 : 0]; for (let b = 0; b < 4; b++) { const d = new T.Vector3(hasard() - .5, hasard() - .5, hasard() - .5).normalize().multiplyScalar(R * (.5 + hasard())), m = p.clone().add(d), f = m.clone().add(new T.Vector3(hasard() - .5, hasard() - .5, hasard() - .5).multiplyScalar(R * .7)); seg.push(p, m, m, f); } });
      this.dendrites = new T.LineSegments(new T.BufferGeometry().setFromPoints(seg), new T.LineBasicMaterial({ color: 0x8fb4ff, transparent: true, opacity: .28, depthWrite: false })); this.dendrites.renderOrder = 7; this.reseauG.add(this.dendrites);
    }
    this.ptsImp.userData.nb = N;
  }
  reaffecter(p, init) {
    const cs = this.chemins; if (!cs.length) return;
    for (let k = 0; k < 24; k++) { const c = cs[(hasard() * cs.length) | 0]; if (hasard() < .06 + .94 * c.activite * c.activite) { p.c = c; break; } p.c = cs[(hasard() * cs.length) | 0]; }
    const sens = p.c.sens; p.s = sens === 'bidirectionnel' ? (hasard() < .5 ? 1 : -1) : 1;
    p.v = Math.min(.9, (.2 + .15 * hasard()) * Math.pow(this.demi.x * 2 / Math.max(.01, p.c.longueur), .6)); p.t = init ? hasard() : (p.s > 0 ? 0 : 1);
  }
  majReseau(dt) {
    if (!this.ptsImp) return;
    const visible = this.etat.calques.neurones; this.ptsImp.visible = this.ptsSoma.visible = visible; if (this.dendrites) this.dendrites.visible = visible;
    // intensité des chemins : lissage vers la cible
    for (const c of this.chemins) c.activite += (c.cible - c.activite) * Math.min(1, dt * 4);
    if (!visible) return;
    const g = this.geoImp, pos = g.attributes.position, al = g.attributes.aAlpha, co = g.attributes.aColor, sz = g.attributes.aSize, vit = this.etat.vitesse;
    for (let i = 0; i < this.pulses.length; i++) {
      const p = this.pulses[i], c = p.c; p.t += p.s * p.v * dt * vit;
      if (p.t > 1 || p.t < 0) { if (c && this.extr) { const e = this.extr[c.i * 2 + (p.t > 1 ? 1 : 0)]; if (e) e.flash = Math.min(1, e.flash + .6 * c.activite + .15); } this.reaffecter(p); }
      const u = Math.min(.999, Math.max(0, p.t)) * (c.pts.length - 1), k = Math.floor(u), f = u - k, a = c.pts[k], b = c.pts[k + 1] || a;
      pos.setXYZ(i, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
      al.setX(i, Math.min(1, .25 + c.activite * 1.1) * Math.sin(Math.PI * Math.min(1, Math.max(0, p.t))) ** .5);
      co.setXYZ(i, c.couleur.r, c.couleur.g, c.couleur.b); sz.setX(i, this.tailleImp * (.6 + 1.1 * c.activite));
    }
    pos.needsUpdate = al.needsUpdate = co.needsUpdate = sz.needsUpdate = true;
    const gs = this.geoSoma, sa = gs.attributes.aAlpha;
    for (let i = 0; i < this.extr.length; i++) { const e = this.extr[i]; e.flash *= Math.exp(-dt * 3.2); sa.setX(i, Math.min(1, .15 + e.c.activite * .5 + e.flash)); }
    sa.needsUpdate = true;
  }
  /** Intensité des chemins pour la sélection courante : zone → faisceaux de la zone ; réseau → ses faisceaux et zones ; aucune → veille faible */
  majActivite() {
    const e = this.etat, z = e.zone && D.ZONE_PAR_ID[e.zone], r = e.reseau && D.RESEAU_PAR_ID[e.reseau];
    const faisceaux = new Set(), structs = new Set();
    if (z) { (z.faisceaux || []).forEach(f => faisceaux.add(f)); z.structures.forEach(s => structs.add(s)); if (z.reseau && D.RESEAU_PAR_ID[z.reseau] && !r) (D.RESEAU_PAR_ID[z.reseau].faisceaux || []).forEach(f => faisceaux.add(f)); }
    if (r) { r.faisceaux.forEach(f => faisceaux.add(f)); r.zones.forEach(id => { const zz = D.ZONE_PAR_ID[id]; zz && zz.structures.forEach(s => structs.add(s)); }); }
    const actif = !!(z || r);
    for (const c of this.chemins) {
      if (!actif) { c.cible = c.locale ? .12 : .2; continue; }
      if (c.locale) c.cible = c.structures.some(s => structs.has(s)) ? .85 : .05;
      else c.cible = faisceaux.has(c.faisceau) ? 1 : .06;
    }
    for (const [id, mat] of this.matFaisceau) mat.opacity = actif ? (faisceaux.has(id) ? .95 : .06) : .32;
  }

  // ───────────────────────── état → scène ─────────────────────────
  appliquerCalques(immediat) {
    const e = this.etat, zone = e.zone && D.ZONE_PAR_ID[e.zone], reseau = e.reseau && D.RESEAU_PAR_ID[e.reseau];
    const mis = new Set(); if (zone) zone.structures.forEach(s => mis.add(s)); if (reseau) reseau.zones.forEach(id => { const z = D.ZONE_PAR_ID[id]; z && z.structures.forEach(s => mis.add(s)); });
    this.misEnValeur = mis;
    for (const f of this.formes.values()) {
      const t = f.def.type, cal = TYPE_CALQUE[t];
      let cible = 0;
      if (t === 'aire') cible = mis.has(f.id) ? 1 : 0;
      else cible = (e.calques[cal] || (e.coupe && cal === 'blanche')) ? (e.opacites[cal] == null ? 1 : e.opacites[cal]) : 0;
      if (e.coupe && cible > 0 && (cal === 'cortex' || cal === 'blanche')) cible = Math.max(cible, .97);      // une coupe se lit mieux sur des surfaces opaques
      if (mis.has(f.id) && t !== 'aire') cible = Math.max(cible, 1);
      else if ((zone || reseau) && cible > 0) cible = Math.min(cible, t === 'cortex' ? .1 : .16);      // le reste passe en fantôme
      if (!zone && !reseau && t === 'aire') cible = 0;
      if (e.cote !== 'les deux') { f.meshes.forEach(m => { m.userData.coteMasque = (m.userData.cote === 'G' && e.cote === 'droit') || (m.userData.cote === 'D' && e.cote === 'gauche'); }); } else f.meshes.forEach(m => { m.userData.coteMasque = false; });
      f.cible = cible; f.emissif = mis.has(f.id) ? .45 : 0;
      if (immediat) f.op = cible;
      this.fondus.add(f);
    }
    if (this.faisceauxG) this.faisceauxG.visible = !!e.calques.faisceaux;
    this.majActivite(); this.appliquerCoupe(); this.appliquerBrodmann(); this.demander();
  }
  avancerFondus(dt) {
    const k = Math.min(1, dt * 7);
    for (const f of this.fondus) {
      f.op += (f.cible - f.op) * k; if (Math.abs(f.cible - f.op) < .004) { f.op = f.cible; this.fondus.delete(f); }
      for (const m of f.meshes) {
        const mat = m.material, vis = f.op > .01 && !m.userData.coteMasque; m.visible = vis;
        const transp = f.op < .995; if (mat.transparent !== transp) { mat.transparent = transp; mat.needsUpdate = true; }
        mat.opacity = f.op; mat.depthWrite = f.op > .65;
        if (mat.emissive) { mat.emissive.setHex(mat.userData.couleur); mat.emissiveIntensity = f.emissif * Math.min(1, f.op * 1.4); }
        if (m.userData.cap) { m.userData.cap.visible = vis && !!this.etat.coupe; m.userData.cap.material.transparent = transp; m.userData.cap.material.opacity = f.op; }
      }
    }
  }
  appliquerCouleurs() {
    for (const f of this.formes.values()) if (f.def.type === 'cortex') for (const m of f.meshes) { const c = this.etat.couleurs === 'lobes' ? f.def.couleur : 0xd8a79d; if (!m.material.vertexColors) m.material.color.setHex(c); m.material.userData.couleur = c; m.material.needsUpdate = true; }
    this.demander();
  }
  /** Carte de Brodmann : couleur de chaque sommet du cortex = aire dont le centre moyen est le plus proche (schéma de Voronoï, approximatif) */
  appliquerBrodmann() {
    const T = this.T, on = !!this.etat.calques.brodmann;
    if (on && !this.brodmannPret) {
      const centres = []; for (const a of D.AIRES_BRODMANN) for (const sg of [1, -1]) centres.push({ p: this.mni(a.c[0] * sg, a.c[1], a.c[2]), col: new T.Color(a.col), sg });
      const v = new T.Vector3();
      for (const f of this.formes.values()) if (f.def.type === 'cortex') for (const m of f.meshes) {
        const g = m.geometry, p = g.attributes.position, col = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) { v.set(p.getX(i), p.getY(i), p.getZ(i)); let b = null, bd = 1e9; for (const c of centres) { if ((v.x - this.centre.x) * c.sg < -this.demi.x * .05 && Math.abs(v.x - this.centre.x) > this.demi.x * .05) continue; const d = v.distanceToSquared(c.p); if (d < bd) { bd = d; b = c; } } if (b) { col[3 * i] = b.col.r; col[3 * i + 1] = b.col.g; col[3 * i + 2] = b.col.b; } }
        g.setAttribute('color', new T.BufferAttribute(col, 3));
      }
      this.brodmannPret = true;
    }
    for (const f of this.formes.values()) if (f.def.type === 'cortex') for (const m of f.meshes) { if (m.material.vertexColors !== on && m.geometry.attributes.color) { m.material.vertexColors = on; m.material.color.setHex(on ? 0xffffff : m.material.userData.couleur); m.material.needsUpdate = true; } }
    if (this.legendeBrodmann) this.legendeBrodmann(on);
  }
  /** Aire de Brodmann approximative au point du modèle donné (pour l'info-bulle de clic) */
  brodmannPres(pointLocal) {
    let b = null, bd = 1e9; const sg = pointLocal.x >= this.centre.x ? 1 : -1;
    for (const a of D.AIRES_BRODMANN) { const p = this.mni(a.c[0] * sg, a.c[1], a.c[2]), d = pointLocal.distanceToSquared(p); if (d < bd) { bd = d; b = a; } }
    return b;
  }

  // ───────────────────────── sections ─────────────────────────
  appliquerCoupe() {
    const T = this.T, c = this.etat.coupe; this.rendu.clippingPlanes = [];
    if (!c || !this.boiteTout) { this.formes.forEach(f => f.meshes.forEach(m => { if (m.userData.cap) m.userData.cap.visible = false; })); this.plan = null; this.demander(); return; }
    const b = this.boiteTout, ax = { x: 'x', y: 'y', z: 'z' }[c.axe] || 'x', lo = b.min[ax], hi = b.max[ax], v = lo + (hi - lo) * Math.min(1, Math.max(0, c.position));
    const garder = ax === 'x' ? 1 : -1, n = new T.Vector3(ax === 'x' ? 1 : 0, ax === 'y' ? 1 : 0, ax === 'z' ? 1 : 0).multiplyScalar(garder * (c.inverse ? -1 : 1));
    this.plan = new T.Plane(n, -v * n.dot(new T.Vector3(ax === 'x' ? 1 : 0, ax === 'y' ? 1 : 0, ax === 'z' ? 1 : 0)));
    this.rendu.clippingPlanes = [this.plan];
    // face de coupe : l'intérieur des coques (faces arrière) est dessiné en aplat clair — gris pour le cortex, blanc pour la substance blanche
    for (const f of this.formes.values()) for (const m of f.meshes) {
      if (!m.userData.cap) {
        const col = f.def.type === 'cortex' ? 0x8e8f99 : f.def.type === 'blanche' ? 0xf1ece0 : f.def.couleur;
        const cap = new T.Mesh(m.geometry, new T.MeshBasicMaterial({ color: col, side: T.BackSide, transparent: false })); cap.renderOrder = (m.renderOrder || 3) - 0.5; m.userData.cap = cap; m.add(cap);
      }
      m.userData.cap.visible = m.visible; m.userData.cap.material.opacity = 1;
      m.userData.cap.material.transparent = m.material.transparent; m.userData.cap.material.opacity = m.material.opacity;
    }
    this.demander();
  }

  // ───────────────────────── caméra, vues, étiquettes ─────────────────────────
  /** Distance qui fait entrer tout le cerveau dans l'image, en paysage comme en portrait */
  distCadre() {
    const t = Math.tan(this.camera.fov * Math.PI / 360), a = Math.max(.5, this.camera.aspect || 1);
    return Math.max(this.demi.z * 1.3 / (t * Math.min(a, 1.7)), this.demi.y * 1.7 / t, this.demi.x * 1.3 / (t * Math.min(a, 1.7)));
  }
  placerCamera() {
    const ce = Math.cos(this.el), se = Math.sin(this.el);
    this.camera.position.set(this.cible.x + this.dist * Math.sin(this.az) * ce, this.cible.y + this.dist * se, this.cible.z + this.dist * Math.cos(this.az) * ce);
    this.camera.lookAt(this.cible); if (this.controles) { this.controles.target.copy(this.cible); this.controles.update(); }
  }
  /** Position actuelle de la caméra → (az, el, dist) : après un geste de l'utilisateur */
  lireCamera() {
    if (!this.controles) return;
    const d = this.camera.position.clone().sub(this.controles.target); this.dist = d.length(); this.el = Math.asin(Math.max(-1, Math.min(1, d.y / this.dist))); this.az = Math.atan2(d.x, d.z); this.cible.copy(this.controles.target);
  }
  allerA(v, ms = 900) {
    this.lireCamera();
    let az = v.az == null ? this.az : v.az; let d = az - this.az; d = Math.atan2(Math.sin(d), Math.cos(d)); az = this.az + d;
    this.anim = { t0: performance.now(), ms, de: { az: this.az, el: this.el, dist: this.dist, cible: this.cible.clone() }, vers: { az, el: v.el == null ? this.el : v.el, dist: v.dist == null ? this.dist : v.dist, cible: v.cible || this.cible.clone() } };
    this.demander();
  }
  vue(nom) {
    const v = D.VUES_CEREBRALES[nom]; if (!v) return false;
    const droit = this.etat.cote === 'droit';
    this.etat.coupe = v.coupe ? { axe: v.coupe.axe, position: v.coupe.position, inverse: nom === 'mediane' && droit } : null;
    let az = v.az;
    if (nom === 'laterale') az = droit ? -Math.PI / 2 : Math.PI / 2;      // face externe de l'hémisphère gauche (par défaut) ou droit
    if (nom === 'mediane') az = droit ? Math.PI / 2 : -Math.PI / 2;         // face interne de l'hémisphère conservé
    this.vueNom = nom;
    this.allerA({ az, el: v.el, dist: this.distCadre(), cible: new this.T.Vector3() });
    this.appliquerCoupe(); return true;
  }
  coupe(c) { this.etat.coupe = c ? Object.assign({ inverse: false }, this.etat.coupe || {}, c) : null; this.appliquerCoupe(); }
  centreForme(ids) {
    const T = this.T, b = new T.Box3();
    this.racine.updateMatrixWorld(true);
    for (const id of [].concat(ids)) { const f = this.formes.get(id); if (f) for (const m of f.meshes) if (!m.userData.coteMasque) b.expandByObject(m); }
    return b.isEmpty() ? null : b;
  }
  focaliser(ids, ms) {
    const b = this.centreForme(ids); if (!b) return;
    const c = b.getCenter(new this.T.Vector3()), s = b.getSize(new this.T.Vector3()), t = Math.max(s.x, s.y, s.z, .02);
    this.allerA({ cible: c, dist: Math.min(Math.max(t * 2.6, .13), .9) }, ms);
  }
  etiquette(cle, point, texte, classe = '') {
    if (!this.opts.etiquettes) return; this.retirerEtiquette(cle);
    const el = document.createElement('div'); el.className = 'ce-note ' + classe; el.textContent = texte; this.opts.etiquettes.appendChild(el);
    this.notes.push({ cle, p: point.clone(), el, w: 0, h: 0 }); this.demander();
  }
  retirerEtiquette(cle) { this.notes = this.notes.filter(n => { if (cle == null || n.cle === cle || (typeof cle === 'string' && cle.endsWith('*') && n.cle.startsWith(cle.slice(0, -1)))) { n.el.remove(); return false; } return true; }); }
  /** Étiquette « nom · latin » sur une forme (point le plus haut de sa boîte) */
  etiquetteForme(cle, id, texte, classe) {
    const b = this.centreForme(id); if (!b) return;
    const c = b.getCenter(new this.T.Vector3()); c.y = b.max.y; this.etiquette(cle, c, texte, classe);
  }
  placerNotes() {
    if (!this.notes.length) return;
    const T = this.T, w = this.largeur, h = this.hauteur, v = new T.Vector3(), places = [];
    for (const n of this.notes) {
      v.copy(n.p).project(this.camera); const visible = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05; n.el.style.display = visible ? '' : 'none'; if (!visible) continue;
      const x = (v.x * .5 + .5) * w; let y = (-v.y * .5 + .5) * h; const lw = n.w || (n.w = n.el.offsetWidth || 70), lh = n.h || (n.h = n.el.offsetHeight || 22);
      for (let k = 0; k < 10; k++) { const r = places.find(q => Math.abs(q.x - x) < (q.w + lw) / 2 && Math.abs(q.y - y) < (q.h + lh) / 2 + 1); if (!r) break; y = r.y - (r.h + lh) / 2 - 3; }
      places.push({ x, y, w: lw, h: lh }); n.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-100%)';
    }
  }

  // ───────────────────────── interaction ─────────────────────────
  brancherSouris() {
    const T = this.T, ray = new T.Raycaster(), p = new T.Vector2(); let bas = null;
    this.canvas.addEventListener('pointerdown', e => { bas = [e.clientX, e.clientY, performance.now()]; });
    this.canvas.addEventListener('pointerup', e => {
      if (!bas || Math.hypot(e.clientX - bas[0], e.clientY - bas[1]) > 6 || performance.now() - bas[2] > 600) return; bas = null;
      const r = this.canvas.getBoundingClientRect(); p.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(p, this.camera);
      const cibles = []; for (const f of this.formes.values()) for (const m of f.meshes) if (m.visible && f.op > .3) cibles.push(m);
      const hits = ray.intersectObjects(cibles, false).filter(h => !this.plan || this.plan.distanceToPoint(h.point) >= 0);
      if (hits.length && this.opts.surSelection) { const h = hits[0], loc = this.racine.worldToLocal(h.point.clone()); this.opts.surSelection(h.object.userData.forme, { brodmann: this.brodmannPres(loc), cote: h.object.userData.cote }); }
    });
  }

  // ───────────────────────── qualité ─────────────────────────
  appliquerQualite() {
    const q = QUALITE[this.niveau], dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
    this.rendu.setPixelRatio(dpr); this.redimensionner();
    this.preparerPostTraitement();
  }
  /** Change de niveau : les matériaux, les neurones et le post-traitement sont reconstruits */
  async changerNiveau(n) {
    if (!NIVEAUX_CERVEAU.includes(n) || n === this.niveau) return;
    this.niveau = n; const T = this.T;
    for (const f of this.formes.values()) for (const m of f.meshes) { const old = m.material; m.material = this.materiau(f.def, m.userData.cote); old.dispose(); if (m.userData.cap) { m.remove(m.userData.cap); m.userData.cap = null; } }
    this.reseauG.clear(); this.chemins = []; this.pulses = []; this.dendrites = null; this.faisceauxG = null; this.brodmannPret = false;
    this.construireFaisceaux(); this.construireReseau(); this.appliquerQualite(); this.appliquerCalques(true); this.appliquerCouleurs();
  }
  async preparerPostTraitement() {
    const q = QUALITE[this.niveau], jeton = this.jetonPost = (this.jetonPost || 0) + 1; this.composer = null;
    if (!q.bloom) return;
    try {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'), import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/OutputPass.js')]);
      if (jeton !== this.jetonPost || this.mort) return;
      const T = this.T, w = this.largeur, h = this.hauteur, pr = this.rendu.getPixelRatio();
      let cible; try { if (this.rendu.capabilities.isWebGL2 && q.msaa) cible = new T.WebGLRenderTarget(w * pr, h * pr, { type: T.HalfFloatType, samples: q.msaa }); } catch (e) { cible = undefined; }
      const comp = new EffectComposer(this.rendu, cible); comp.setPixelRatio(pr); comp.setSize(w, h);
      comp.addPass(new RenderPass(this.scene, this.camera)); comp.addPass(new UnrealBloomPass(new T.Vector2(w, h), q.bloom, .65, .82)); comp.addPass(new OutputPass());
      this.composer = comp; this.demander();
    } catch (e) { console.warn('[cerveau] post-traitement indisponible : rendu simple', e && e.message); this.composer = null; }
  }

  // ───────────────────────── boucle ─────────────────────────
  redimensionner() {
    const p = this.canvas.parentElement || this.canvas, w = Math.max(p.clientWidth, 10), h = Math.max(p.clientHeight, 10);
    this.rendu.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.largeur = w; this.hauteur = h;
    if (this.composer) this.composer.setSize(w, h);
    const tampon = this.T.Vector2 ? this.rendu.getDrawingBufferSize(new this.T.Vector2()) : { y: h }, ech = tampon.y / (2 * Math.tan(this.camera.fov * Math.PI / 360));
    for (const m of [this.matImp, this.matSoma]) if (m) m.uniforms.echelle.value = ech;
    this.demander();
  }
  demander() { this.sale = true; }
  boucle() {
    if (this.mort) return; this.raf = requestAnimationFrame(() => this.boucle());
    if (document.hidden) return;
    const maintenant = performance.now(), dt = Math.min(.1, (maintenant - (this.dernier || maintenant)) / 1000); this.dernier = maintenant;
    if (this.anim) {
      const k = Math.min((maintenant - this.anim.t0) / this.anim.ms, 1), s = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2, a = this.anim;
      this.az = a.de.az + (a.vers.az - a.de.az) * s; this.el = a.de.el + (a.vers.el - a.de.el) * s; this.dist = a.de.dist + (a.vers.dist - a.de.dist) * s; this.cible.lerpVectors(a.de.cible, a.vers.cible, s);
      this.placerCamera(); if (k >= 1) { this.anim = null; if (this.opts.surArrivee) this.opts.surArrivee(); }
    } else if (this.controles) this.controles.update();
    if (this.rotationAuto) { if (!this.anim) this.lireCamera(); this.az += dt * .35; this.placerCamera(); }
    this.avancerFondus(dt); this.majReseau(dt);
    if (this.composer) this.composer.render(); else this.rendu.render(this.scene, this.camera);
    this.placerNotes();
    // surveillance : trop lent pendant trois secondes → on le signale (le niveau ultra n'est jamais maintenu s'il ne tient pas)
    if (dt > 0) { this.imagesMesurees.push(dt); if (this.imagesMesurees.length >= 90) { const moy = this.imagesMesurees.reduce((a, b) => a + b, 0) / this.imagesMesurees.length; this.imagesMesurees = []; this.fps = Math.round(1 / moy); if (this.opts.autoDegrade !== false && this.fps < 18 && this.niveau !== 'eco' && this.opts.surDegrade) this.opts.surDegrade(this.fps); } }
  }
  etatTexte() { return { niveau: this.niveau, source: this.source, formes: this.formes.size, chemins: this.chemins.length, impulsions: this.pulses.length, fps: this.fps || null, zone: this.etat.zone, reseau: this.etat.reseau, vue: this.vueNom || null }; }
  capture() { this.rendu.render(this.scene, this.camera); return this.canvas.toDataURL('image/png'); }
  dispose() {
    this.mort = true; cancelAnimationFrame(this.raf);
    try { this.controles && this.controles.dispose(); this.composer && this.composer.dispose(); } catch (e) { }
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => m.dispose && m.dispose()); });
    this.rendu.dispose(); this.notes.forEach(n => n.el.remove()); this.notes = [];
  }
}
