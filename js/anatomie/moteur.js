/* ═════════════ MOTEUR 3D ANATOMIE (three.js) ═════════════
   new MoteurAnatomie(THREE, canvas, { store, etiquettes: Element|null, mini: bool, surSelection(id) })
   Le moteur suit l'état du store : calques, sélection, isolation, pathologies, appareillage. Rendu à la demande (pas d'animation inutile).
   Contrôles : glisser = rotation 360°, molette / pincement = zoom, clic droit ou Maj + glisser ou 2 doigts = translation, double clic = focaliser. */
import { construire, axeMembre } from './construction.js?v=2026.10.13.5';
import { construireAppareil } from './appareils3d.js?v=2026.10.13.5';
import { OS, VERTEBRES, REPERES, SACRUM_Y } from './donnees-os.js?v=2026.10.13.5';
import { MUSCLES } from './donnees-muscles.js?v=2026.10.13.5';
import { NERFS, ORGANES, DERMATOMES } from './donnees-nerfs-organes.js?v=2026.10.13.5';
import { AMPUTATIONS, APPAREILLAGES, FRACTURES } from './donnees-ortho.js?v=2026.10.13.5';
import { definition, base as baseDe, cote as coteDe, typeDe, instances, nomAffiche, musclesDe } from './registre.js?v=2026.10.13.5';
import { COULEURS } from './registre.js?v=2026.10.13.5';
import { chargerGLB } from './modeles-glb.js?v=2026.10.13.5';
import { points as pointsDe, ajuster as ajusterGLB, matriceAjustement } from './ajustement.js?v=2026.10.13.5';
import { TABLES } from './correspondance-squelette.js?v=2026.10.13.5';
import { groupeDe } from './groupes-os.js?v=2026.10.13.5';
import { CapsCoupe } from './coupes.js?v=2026.10.13.5';
import { creerMateriauPBR, ajouterAOCuite } from './pbr.js?v=2026.10.13.5';
import { studio, solOmbre, fondDegrade, environnement, pipeline, lireNiveau } from './rendu.js?v=2026.10.13.5';

const CALQUE_DE = { cartilage: 'squelette', os: 'squelette', muscle: 'muscles', nerf: 'nerfs', organe: 'organes', repere: 'reperes', dermatome: 'dermatomes', peau: 'peau' };
const DIST_DEFAUT = 3.5;
export const ZONES = { tronc: { cible: [0, 1.25, 0], dist: 1.7 }, bassin: { cible: [0, .98, 0], dist: 1.5 }, 'jambe-droite': { cible: [-.05, .52, 0], dist: 2.5 }, 'jambe-gauche': { cible: [.05, .52, 0], dist: 2.5 },
  'bras-droit': { cible: [-.2, 1.1, 0], dist: 1.7 }, 'bras-gauche': { cible: [.2, 1.1, 0], dist: 1.7 }, 'pied-droit': { cible: [-.09, .06, .05], dist: .9 }, 'pied-gauche': { cible: [.09, .06, .05], dist: .9 },
  'main-droite': { cible: [-.22, .78, 0], dist: .9 }, 'main-gauche': { cible: [.22, .78, 0], dist: .9 } };
export const VUES = { face: [0, 0], dos: [Math.PI, 0], gauche: [Math.PI / 2, 0], droite: [-Math.PI / 2, 0], dessus: [0, 1.45] };   // [azimut, élévation]

export class MoteurAnatomie {
  constructor(THREE, canvas, opts = {}) {
    this.THREE = THREE; this.canvas = canvas; this.opts = opts; this.store = opts.store; this.mini = !!opts.mini;
    this.C = construire(THREE);
    this.entrees = new Map();            // sid → { sid, type, base, cote, obj, mats, membre }
    this.clip = [];                      // { mat, membre, cote }
    this.construits = {};
    this.dernier = null; this.mort = false; this.dirty = true; this.raf = 0;
    this.notes = [];                     // notes 3D → HTML : { p:Vector3, el, texte }
    this.etiquettes = opts.etiquettes || null;
    this.survol = null;

    const rendu = this.rendu = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, stencil: true, powerPreference: 'low-power' });
    rendu.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.mini ? 1.5 : 2));
    rendu.localClippingEnabled = true;
    // qualité : eco (matériaux simples) · standard (PBR, studio 3 points, ombres douces) · haute (+ SSAO, bloom, tonalité ACES) ; le pop-up reste en standard au maximum
    this.niveau = opts.qualite || lireNiveau(this.mini); if (this.mini && this.niveau === 'haute') this.niveau = 'standard';
    rendu.toneMapping = this.niveau === 'eco' ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping; rendu.toneMappingExposure = 1.05;
    if (this.niveau !== 'eco' && rendu.shadowMap) { rendu.shadowMap.enabled = true; rendu.shadowMap.type = THREE.PCFSoftShadowMap; }
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, .02, 60);
    this.cible = new THREE.Vector3(0, .92, 0);
    this.az = 0; this.el = .08; this.dist = this.mini ? 1 : DIST_DEFAUT;
    this.auto = !!opts.rotationAuto;
    this.anim = null;

    this.studio = studio(THREE, this.scene, this.niveau, this.mini);
    if (this.niveau !== 'eco') { this.sol = solOmbre(THREE); this.scene.add(this.sol); }
    this.pipeline = null;
    if (this.niveau !== 'eco') this.initialiserRendu();
    if (!this.mini) {
      const grille = new THREE.GridHelper(2, 20, 0x4de3ff, 0x1e3a4a); grille.material.transparent = true; grille.material.opacity = .28; grille.material.depthWrite = false; this.scene.add(grille);
      this.grille = grille;
    }
    this.calques = {};
    ['squelette', 'muscles', 'nerfs', 'organes', 'peau', 'reperes', 'dermatomes', 'pathologie', 'appareil', 'marques'].forEach(n => { const g = new THREE.Group(); g.name = n; this.calques[n] = g; this.scene.add(g); });

    this.caps = new CapsCoupe(THREE, this.scene);
    this.brancherControles();
    this.obs = new ResizeObserver(() => this.redimensionner()); this.obs.observe(canvas.parentElement || canvas);
    this.redimensionner();
    this.desabonne = this.store.abonner((e, a) => this.synchroniser(e, a));
    this.synchroniser(this.store.obtenir(), null);
    this.placerCamera(); this.demander();
  }

  // ───────────────────────── matériaux ─────────────────────────
  mat(type, couleur, extra) {
    const T = this.THREE;
    const m = this.niveau !== 'eco' && ['os', 'muscle', 'nerf', 'organe', 'peau', 'cartilage', 'ligament'].includes(type)
      ? creerMateriauPBR(T, type, couleur, Object.assign({ envMapIntensity: .6 }, extra || {}))
      : new T.MeshStandardMaterial(Object.assign({ color: couleur, roughness: type === 'os' ? .62 : .5, metalness: 0, side: T.DoubleSide }, extra || {}));
    if (this.niveau === 'eco' && type === 'os') ajouterAOCuite(m);
    m.userData.base = { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite, emissive: m.emissive.getHex(), ei: m.emissiveIntensity };
    return m;
  }
  enregistrer(sid, type, obj, mats, membre, cote) {
    this.retirer(sid);
    obj.userData.sid = sid; obj.traverse(o => { o.userData.sid = sid; });
    const calque = this.calques[CALQUE_DE[type] || 'squelette']; calque.add(obj);
    const e = { sid, type, base: baseDe(sid), cote: cote || coteDe(sid), obj, mats, membre: membre || null };
    this.entrees.set(sid, e);
    if (membre) mats.forEach(m => { m.clipShadows = true; this.clip.push({ mat: m, membre, cote: e.cote }); });
    if (this.niveau !== 'eco' && ['os', 'muscle', 'nerf', 'organe', 'cartilage'].includes(type)) obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.surchargerGLB(e);
    return e;
  }
  /** Os d'un même groupe (main, pied) : une seule transformation, calculée sur l'ensemble du groupe (formes schématiques d'un côté, nœuds du modèle de l'autre).
      Les formes schématiques sont photographiées de façon synchrone au premier appel, avant qu'aucun os du groupe soit remplacé ; les autres appels attendent la même promesse. */
  matriceGroupe(en, meta) {
    const T = this.THREE, cle = meta.groupe + ':' + en.cote;
    this.groupesAjustes = this.groupesAjustes || new Map();
    if (this.groupesAjustes.has(cle)) return this.groupesAjustes.get(cle);
    const table = (TABLES[meta.table] || {}).os || {};
    const freres = Object.keys(table).filter(b => table[b].groupe === meta.groupe && this.entrees.get(b + ':' + en.cote));
    const formes = []; freres.forEach(b => formes.push(...pointsDe(T, this.entrees.get(b + ':' + en.cote).obj)));
    const p = (async () => {
      const modeles = [];
      for (const b of freres) { const r = await chargerGLB(b, en.cote); if (r && r.meta.table === meta.table) modeles.push(...pointsDe(T, r.scene.clone(true))); }
      let M = formes.length && modeles.length ? matriceAjustement(T, modeles, formes, 'boite') : null;
      if (M && meta.groupe === 'main') M = await this.recalerPoignet(M, en);
      return M;
    })();
    this.groupesAjustes.set(cle, p); return p;
  }
  /** Poignet : la transformation du groupe « main » (centre et taille de la forme schématique) peut laisser un écart avec l'avant-bras réellement affiché. Une fois le radius et l'ulna en place,
      on translate la main pour que la rangée proximale du carpe (scaphoïde, lunatum, triquétrum) vienne au contact de la surface articulaire du radius (quelques mm, comme l'interligne réel) et
      se centre sous l'avant-bras. Écart plafonné à 8 cm : au-delà le modèle est jugé incohérent et la transformation d'origine est gardée. */
  async recalerPoignet(M, en) {
    const T = this.THREE, cote = en.cote;
    const rad = this.entrees.get('radius:' + cote), uln = this.entrees.get('ulna:' + cote), car = this.entrees.get('carpe:' + cote);
    if (!rad || !uln || !car) return M;
    await Promise.all([rad.pret, uln.pret].filter(Boolean));
    const res = await chargerGLB('carpe', cote); if (!res) return M;
    const ptsCarpe = pointsDe(T, res.scene.clone(true)).map(p => p.applyMatrix4(M));
    const ptsAvb = [...pointsDe(T, rad.obj), ...pointsDe(T, uln.obj)];
    if (!ptsCarpe.length || !ptsAvb.length) return M;
    const bas = pointsDe(T, rad.obj), yMin = Math.min(...bas.map(p => p.y)), tranche = bas.filter(p => p.y < yMin + .025);
    const yRef = tranche.reduce((a, p) => a + p.y, 0) / tranche.length;                 // niveau de la surface articulaire distale du radius (la styloïde descend un peu plus bas)
    const yHaut = Math.max(...ptsCarpe.map(p => p.y)), hautCarpe = ptsCarpe.filter(p => p.y > yHaut - .012);
    const centre = pts => pts.reduce((a, p) => a.add(p), new T.Vector3()).multiplyScalar(1 / pts.length);
    const tAvb = ptsAvb.filter(p => p.y < yMin + .025), cA = centre(tAvb), cC = centre(hautCarpe);
    const d = new T.Vector3(cA.x - cC.x, yRef - .003 - yHaut, cA.z - cC.z);
    if (d.length() > .08) return M;
    return new T.Matrix4().makeTranslation(d.x, d.y, d.z).multiply(M);
  }
  /** Le rachis et les côtes ne sont repris d'un GLB que s'ils n'ont pas à se déformer (ni scoliose, ni fracture vertébrale) */
  rachisGLBPossible() {
    const p = this.store.obtenir().pathologie, f = p.fracture;
    return !p.scoliose && !(f && f.os && f.os.some(o => o.id.startsWith('vertebre-')));
  }
  /** Remplace la forme procédurale par le modèle GLB de la structure, s'il y en a un (voir modeles-glb.js) ; le modèle est recalé sur la forme schématique (ajustement.js) */
  surchargerGLB(en) {
    if (typeof fetch === 'undefined' || !['os', 'muscle', 'nerf', 'organe', 'cartilage'].includes(en.type)) return;
    const rachis = /^(vertebre-|cote-|disque-)/.test(en.sid);
    if (/^(moelle|nerfs-spinaux)/.test(en.sid) || en.obj.children.length > 1) return;     // moelle : toujours procédurale ; os fracturés : forme procédurale
    en.pret = chargerGLB(en.base, en.cote, { avecRachis: !rachis || this.rachisGLBPossible() }).then(async res => {
      if (!res || this.mort || this.entrees.get(en.sid) !== en) return;
      if (rachis && !this.rachisGLBPossible()) return;                                  // la pathologie est apparue pendant le chargement
      const T = this.THREE, { scene: src, meta } = res;
      const g = src.clone(true);
      g.scale.set(...meta.echelle); g.rotation.set(...meta.rotation.map(d => d * Math.PI / 180)); g.position.set(...meta.decalage);
      const pack = new T.Group(); pack.add(g); if (meta.miroir) pack.scale.x = -1;     // entrées individuelles : le côté droit est le miroir du modèle gauche
      pack.updateMatrixWorld(true);
      const forme = pointsDe(T, en.obj);
      // garde-fou : un modèle dont la taille n'a rien à voir avec la forme procédurale (mauvaise unité ou mauvais repère) est écarté
      const tm = new T.Box3().setFromObject(pack).getSize(new T.Vector3()).length(), tp = forme.length ? new T.Box3().setFromPoints(forme).getSize(new T.Vector3()).length() : 0;
      if (!(tm > 0) || (tp > 0 && (tm / tp > 4 || tm / tp < .25))) { console.warn('[anatomie] GLB ' + en.base + ' écarté : dimensions incohérentes (' + tm.toFixed(2) + ' m contre ' + tp.toFixed(2) + ' m) → forme procédurale conservée'); return; }
      const Mg = meta.groupe ? await this.matriceGroupe(en, meta) : null;
      if (this.mort || this.entrees.get(en.sid) !== en) return;
      if (en.obj.matrixAutoUpdate === false) { en.obj.matrixAutoUpdate = true; en.obj.matrix.identity(); en.obj.position.set(0, 0, 0); en.obj.quaternion.identity(); en.obj.scale.set(1, 1, 1); }   // vertèbres : la matrice était portée par l'objet
      pack.traverse(o => { if (o.isMesh) { const ge = o.geometry; if (ge.attributes._fibre && !ge.attributes.aFibre) ge.setAttribute('aFibre', ge.attributes._fibre); o.material = en.mats[0]; o.userData.sid = en.sid; o.castShadow = o.receiveShadow = this.niveau !== 'eco'; } });
      if (en.obj.isMesh) { en.obj.geometry.dispose(); en.obj.geometry = new T.BufferGeometry(); }     // muscle, nerf, organe : un seul Mesh
      else en.obj.children.slice().forEach(c => { en.obj.remove(c); c.geometry && c.geometry.dispose(); });   // os : groupe
      en.obj.add(pack); en.obj.updateMatrixWorld(true);
      if (meta.groupe) { if (Mg) { pack.updateMatrix(); pack.matrixAutoUpdate = false; pack.matrix.copy(Mg.clone().multiply(pack.matrix)); pack.updateMatrixWorld(true); } }
      else ajusterGLB(T, pack, forme, meta.ajuster || 'aucun');
      en.obj.traverse(o => { o.userData.sid = en.sid; }); en.glb = true; if (this.planCoupe) this.caps.maj(this.planCoupe, this.entrees); this.demander();
    }).catch(e => { console.warn('[anatomie] GLB ' + en.sid + ' : ' + (e && e.message || e)); });
  }
  retirer(sid) {
    const e = this.entrees.get(sid); if (!e) return;
    e.obj.parent && e.obj.parent.remove(e.obj);
    e.obj.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    e.mats.forEach(m => m.dispose()); this.clip = this.clip.filter(c => !e.mats.includes(c.mat));
    this.entrees.delete(sid);
  }

  // ───────────────────────── construction des calques ─────────────────────────
  assurer(nom) {
    if (this.construits[nom]) return;
    this.construits[nom] = true;
    const f = { squelette: () => this.construireSquelette(), muscles: () => this.construireMuscles(), nerfs: () => this.construireNerfs(), organes: () => this.construireOrganes(), peau: () => this.construirePeau(), reperes: () => this.construireReperes(), dermatomes: () => this.construireDermatomes() }[nom];
    if (f) f();
  }
  assurerType(type) { this.assurer(CALQUE_DE[type] || 'squelette'); }

  specFracture(osBase, cote) {
    const f = this.store.obtenir().pathologie.fracture; if (!f || !f.os) return null;
    const o = f.os.find(x => x.id === osBase); if (!o) return null;
    if ((f.cote || 'D') !== cote) return null;
    return Object.assign({ os: true, type: f.type, angulation: f.angulation, decalage: f.decalage, raccourcissement: f.raccourcissement, rotation: f.rotation, plan: f.plan }, o);
  }
  construireSquelette() {
    const T = this.THREE;
    for (const def of OS) for (const c of (def.sym ? ['D', 'G'] : [null])) this.ajouterOs(def, c);
    this.reconstruireRachis();
  }
  ajouterOs(def, c) {
    const T = this.THREE, sid = def.sym ? def.id + ':' + c : def.id;
    const r = this.C.geoOs(def, c, def.sym ? this.specFracture(def.id, c) : null);
    const grp = new T.Group(), m = this.mat('os', COULEURS.os);
    grp.add(new T.Mesh(r.geoms, m));
    const mats = [m];
    if (r.distal) {
      grp.add(new T.Mesh(r.distal, m));
      r.eclats.forEach(g => grp.add(new T.Mesh(g, m)));
      const tr = r.trait, anneau = new T.Mesh(new T.TorusGeometry(tr.r, .0012, 5, 24), new T.MeshBasicMaterial({ color: 0xff3030, depthTest: false, transparent: true, opacity: .9, toneMapped: false }));
      anneau.renderOrder = 9; anneau.position.set(...tr.p);
      anneau.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), new T.Vector3(...tr.axe).normalize());
      anneau.rotateX(tr.incl * .6); grp.add(anneau); mats.push(anneau.material);
    }
    this.enregistrer(sid, 'os', grp, mats, def.membre, c);
  }
  reconstruireRachis() {
    const T = this.THREE, C = this.C, e = this.store.obtenir();
    for (const sid of Array.from(this.entrees.keys())) if (sid.startsWith('vertebre-') || sid.startsWith('cote-') || sid.startsWith('disque-') || sid === 'cartilages-costaux') this.retirer(sid);
    this.positions = C.positionsRachis(this.courbesEffectives(e));
    const frac = e.pathologie.fracture;
    this.positions.forEach(p => {
      const t = frac && frac.os && frac.os.find(o => o.id === 'vertebre-' + p.id);
      const m = this.mat('os', COULEURS.os), mesh = new T.Mesh(C.geoVertebre(p.v, t ? t.tassement : 0, t && t.eclat), m);
      mesh.applyMatrix4(C.matriceVertebre(p)); mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      this.enregistrer('vertebre-' + p.id, 'os', mesh, [m]);
    });
    // disques intervertébraux : cartilage laiteux entre deux vertèbres voisines (suivent la scoliose)
    for (let k = 0; k + 1 < this.positions.length; k++) {
      const a = this.positions[k], b = this.positions[k + 1], rr = (a.v.region === 'lombaire' ? .022 : a.v.region === 'thoracique' ? .0175 : .0125) * 1.1;
      const hh = Math.max(.0045, Math.abs(b.y - a.y) - (a.v.region === 'lombaire' ? .03 : a.v.region === 'thoracique' ? .021 : .015) * .92);
      const g = new T.CylinderGeometry(rr, rr, hh, 14, 1, false); g.scale(1, 1, .85);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, rotY: (a.rotY + b.rotY) / 2, rotZ: (a.rotZ + b.rotZ) / 2 };
      const m = this.mat('cartilage', 0xd5e3e6), mesh = new T.Mesh(g, m); mesh.applyMatrix4(C.matriceVertebre(mid)); mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      this.enregistrer('disque-' + a.id + '-' + b.id, 'cartilage', mesh, [m]);
    }
    const cartilages = [];
    this.positions.filter(p => p.v.region === 'thoracique').forEach(p => {
      const i = parseInt(p.id.slice(1), 10);
      ['D', 'G'].forEach(c => { const m = this.mat('os', COULEURS.os); this.enregistrer('cote-' + i + ':' + c, 'os', new T.Mesh(C.geoCote(i, c, p), m), [m], null, c); const g = C.geoCartilageCostal(i, c, p); if (g) cartilages.push(g); });
    });
    { const m = this.mat('cartilage', 0xcfdfe4); this.enregistrer('cartilages-costaux', 'cartilage', new T.Mesh(C.fusion(cartilages), m), [m]); }     // cartilages costaux : côtes 1 à 10 jusqu'au sternum et à l'arc costal
    if (this.construits.nerfs) this.reconstruireMoelle();
    if (this.construits.dermatomes === undefined) { /* rien */ }
    this.vertebreTourne = true;
    this.appliquerCoupesSiBesoin();
  }
  courbesEffectives(e) {
    const s = e.pathologie.scoliose; if (!s) return [];
    const modele = e.appareillage.actif && APPAREILLAGES.find(a => a.id === e.appareillage.modele);
    const k = modele && modele.pour.scoliose ? 1 - e.appareillage.correction / 100 : 1;
    return s.courbes.map(c => Object.assign({}, c, { cobb: c.cobb * k }));
  }
  construireMuscles() {
    const T = this.THREE;
    for (const def of MUSCLES) for (const c of (def.sym ? ['D', 'G'] : [null])) {
      const m = this.mat('muscle', COULEURS.muscle, { roughness: .55 });
      this.enregistrer(def.sym ? def.id + ':' + c : def.id, 'muscle', new T.Mesh(this.C.geoMuscle(def, c), m), [m], def.membre, c);
    }
    this.appliquerCoupesSiBesoin();
  }
  construireNerfs() {
    const T = this.THREE;
    for (const def of NERFS) for (const c of (def.sym ? ['D', 'G'] : [null])) {
      const m = this.mat('nerf', def.couleur, { emissive: def.couleur, emissiveIntensity: .35, roughness: .4 });
      this.enregistrer(def.sym ? def.id + ':' + c : def.id, 'nerf', new T.Mesh(this.C.geoNerf(def, c), m), [m], def.membre, c);
    }
    this.reconstruireMoelle(); this.appliquerCoupesSiBesoin();
  }
  reconstruireMoelle() {
    const T = this.THREE, C = this.C;
    if (!this.positions) this.positions = C.positionsRachis(this.courbesEffectives(this.store.obtenir()));
    const canal = p => { const z = p.v.region === 'lombaire' ? -.03 : p.v.region === 'thoracique' ? -.026 : -.019; return new T.Vector3(0, 0, z).applyMatrix4(C.matriceVertebre(p)); };
    const hauts = this.positions.filter(p => p.y >= 1.14 || p.v.region !== 'lombaire' || p.id === 'L1' || p.id === 'L2');
    const pts = hauts.filter(p => p.y >= 1.14).map(canal);
    const m = this.mat('nerf', 0xfff0a8, { emissive: 0xffe680, emissiveIntensity: .45 });
    this.enregistrer('moelle', 'nerf', new T.Mesh(C.nettoie(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 60, .0055, 8)), m), [m]);
    const racines = [];
    this.positions.filter(p => p.y >= 1.14).forEach(p => { const c0 = canal(p), s = [-1, 1]; s.forEach(sg => racines.push(...C.geoCap([c0.x, c0.y, c0.z], [c0.x + sg * .05, c0.y - .012, c0.z + .02], .0016, .0016, false))); });
    const m2 = this.mat('nerf', 0xffd24d, { emissive: 0xffd24d, emissiveIntensity: .3 });
    this.enregistrer('nerfs-spinaux', 'nerf', new T.Mesh(C.fusion(racines), m2), [m2]);
  }
  construireOrganes() {
    const T = this.THREE;
    for (const def of ORGANES) {
      const m = this.mat('organe', def.couleur, { transparent: def.alpha != null, opacity: def.alpha == null ? 1 : def.alpha, roughness: .45 });
      m.userData.base.opacity = m.opacity; m.userData.base.transparent = m.transparent;
      this.enregistrer(def.id, 'organe', new T.Mesh(this.C.geoOrgane(def), m), [m]);
    }
  }
  construirePeau() {
    const T = this.THREE, g = this.C.geoPeau();
    const mk = () => this.mat('peau', 0xd9a98a, { transparent: true, opacity: .16, depthWrite: false, roughness: .8 });
    const m0 = mk(); this.enregistrer('peau:tronc', 'peau', new T.Mesh(this.C.fusion(g.tronc), m0), [m0]);
    ['MI', 'MS'].forEach(mb => ['D', 'G'].forEach(c => { const m = mk(); this.enregistrer('peau:' + mb + ':' + c, 'peau', new T.Mesh(this.C.fusion(g[mb][c]), m), [m], mb, c); }));
    this.appliquerCoupesSiBesoin();
  }
  construireDermatomes() {
    const T = this.THREE;
    for (const def of DERMATOMES) for (const c of ['D', 'G']) {
      const m = this.mat('dermatome', def.couleur, { transparent: true, opacity: .55, depthWrite: false, emissive: def.couleur, emissiveIntensity: .25 });
      const mb = def.zones.some(z => z.k === 'arc') ? (def.zones[0].c[0] > .15 && def.zones[0].y0 > .6 ? 'MS' : 'MI') : null;
      this.enregistrer('dermatome:' + def.id + ':' + c, 'dermatome', new T.Mesh(this.C.geoDermatome(def, c), m), [m], mb, c);
    }
    this.appliquerCoupesSiBesoin();
  }
  construireReperes() {
    const T = this.THREE;
    for (const def of REPERES) for (const c of (def.sym === false ? [null] : ['D', 'G'])) {
      const p = def.sym === false ? def.p : [def.p[0] * (c === 'D' ? -1 : 1), def.p[1], def.p[2]];
      const m = new T.MeshBasicMaterial({ color: COULEURS.repere, depthTest: false, transparent: true, opacity: .95, toneMapped: false });
      m.userData.base = { opacity: .95, transparent: true, depthWrite: true };
      const mesh = new T.Mesh(new T.SphereGeometry(.0075, 10, 8), m); mesh.position.set(...p); mesh.renderOrder = 8;
      const mb = def.os && /^(humerus|radius|ulna|carpe|metacarpiens|phalanges-main)$/.test(def.os) ? 'MS' : def.os && /^(femur|tibia|fibula|patella|talus|calcaneus|tarse-anterieur|metatarsiens)$/.test(def.os) ? 'MI' : null;
      this.enregistrer('repere:' + def.id + (c ? ':' + c : ''), 'repere', mesh, [m], mb, c);
    }
    this.appliquerCoupesSiBesoin();
  }

  // ───────────────────────── amputations (plans de coupe) ─────────────────────────
  appliquerCoupesSiBesoin() { this.coupes(this.store.obtenir().pathologie.amputation); }
  coupes(amp) {
    if (this.pipeline) this.pipeline.ssao.enabled = !amp;
    const T = this.THREE, def = amp && AMPUTATIONS.find(a => a.id === amp.niveau);
    const cotes = def ? (amp.cote === 'DG' ? ['D', 'G'] : [amp.cote]) : [];
    this.clip.forEach(({ mat, membre, cote }) => {
      const actif = def && membre === def.membre && cotes.includes(cote);
      const avant = !!mat.clippingPlanes && mat.clippingPlanes.length;
      if (actif) {
        const s = cote === 'D' ? -1 : 1;
        mat.clippingPlanes = def.retire.map(r => new T.Plane(new T.Vector3(-r.n[0] * s, -r.n[1], -r.n[2]), r.d));
        mat.clipIntersection = true;
      } else mat.clippingPlanes = null;
      if (!!avant !== !!(mat.clippingPlanes && mat.clippingPlanes.length)) mat.needsUpdate = true;
    });
    // moignons : dôme de peau à l'extrémité
    const g = this.calques.pathologie; while (g.children.length) { const o = g.children.pop(); o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); }
    cotes.forEach(c => {
      const s = c === 'D' ? -1 : 1, m = new T.MeshStandardMaterial({ color: 0xe0a38b, transparent: true, opacity: .55, roughness: .7, side: T.DoubleSide, depthWrite: false });
      let mesh;
      if (def.cap.y != null) { const ax = axeMembre(def.membre, def.cap.y), r = Math.max(ax.r, .02); mesh = new T.Mesh(this.C.geoEll([ax.x * s, def.cap.y + .004, ax.z], [r, r * .5, r]), m); }
      else { const z = def.cap.z; mesh = new T.Mesh(this.C.geoEll([.09 * s, .03, z - .004], [.044, .034, .018]), m); }
      g.add(mesh);
    });
    this.demander();
  }

  // ───────────────────────── appareillage ─────────────────────────
  reconstruireAppareil() {
    const T = this.THREE, e = this.store.obtenir(), g = this.calques.appareil;
    while (g.children.length) { const o = g.children[0]; g.remove(o); o.traverse(q => { q.geometry && q.geometry.dispose(); }); }
    (this.matsAppareil || []).forEach(m => m.dispose()); this.matsAppareil = [];
    this.notesAppareil = [];
    const modele = e.appareillage.actif && APPAREILLAGES.find(a => a.id === e.appareillage.modele);
    if (modele) {
      const amp = e.pathologie.amputation && AMPUTATIONS.find(a => a.id === e.pathologie.amputation.niveau);
      const ctx = { etat: e, amp: amp ? Object.assign({}, amp, { cote: e.pathologie.amputation.cote }) : null, modele, positions: this.positions || this.C.positionsRachis(this.courbesEffectives(e)), courbes: this.courbesEffectives(e),
        pos: (id, c) => { const r = REPERES.find(q => q.id === id); if (!r) return null; return r.sym === false ? r.p.slice() : [r.p[0] * (c === 'D' ? -1 : 1), r.p[1], r.p[2]]; } };
      try { const r = construireAppareil(T, this.C, ctx); g.add(r.group); if (this.niveau !== 'eco') r.group.traverse(o => { if (o.isMesh && o.material && !o.material.depthTest === false) { o.castShadow = true; } }); this.matsAppareil = r.mats; this.notesAppareil = r.notes; } catch (err) { console.error('[anatomie] appareil', err); }
    }
    this.reconstruireNotes(); this.demander();
  }

  // ───────────────────────── annotations 3D (Cobb, repères, sélection) ─────────────────────────
  reconstruireMarques() {
    const T = this.THREE, e = this.store.obtenir(), g = this.calques.marques;
    while (g.children.length) { const o = g.children[0]; g.remove(o); o.traverse(q => { q.geometry && q.geometry.dispose(); q.material && q.material.dispose && q.material.dispose(); }); }
    this.notesMarques = [];
    const s = e.pathologie.scoliose;
    if (s && s.lignesCobb && this.positions) {
      const pos = this.positions, orig = s.courbes, eff = this.courbesEffectives(e);
      eff.forEach((c, i) => {
        const v = VERTEBRES.find(q => q.id === c.apex), L = v.region === 'lombaire' ? .22 : .26;
        const bornes = [v.y + L / 2, v.y - L / 2].map(y => pos.reduce((b, p) => Math.abs(p.y - y) < Math.abs(b.y - y) ? p : b));
        bornes.forEach(p => {
          const a = new T.Vector3(-.11, 0, 0).applyAxisAngle(new T.Vector3(0, 0, 1), p.rotZ), b = new T.Vector3(.11, 0, 0).applyAxisAngle(new T.Vector3(0, 0, 1), p.rotZ);
          const geo = new T.BufferGeometry().setFromPoints([a.add(new T.Vector3(p.x, p.y, p.z - .045)), b.add(new T.Vector3(p.x, p.y, p.z - .045))]);
          const l = new T.Line(geo, new T.LineBasicMaterial({ color: 0x4de3ff, depthTest: false, transparent: true, toneMapped: false })); l.renderOrder = 9; g.add(l);
        });
        const ap = pos.find(p => p.id === c.apex) || bornes[0];
        this.notesMarques.push({ p: [ap.x + (c.convexite === 'D' ? -.16 : .16), ap.y, ap.z], texte: 'Cobb ' + Math.round(c.cobb) + '° (' + c.apex + ', convexe ' + (c.convexite === 'D' ? 'droite' : 'gauche') + ')', classe: 'cobb' });
      });
    }
    // origine et insertion du muscle isolé
    const sel = e.selection;
    if (sel && typeDe(sel) === 'muscle' && (e.isolation || this.mini)) {
      const d = definition(sel), c = coteDe(sel), sg = c === 'D' ? -1 : 1;
      const f0 = d.faisceaux[0], oP = f0[0], iP = f0[f0.length - 1];
      [[oP, 0x39d98a, 'Origine'], [iP, 0xff5b6e, 'Terminaison']].forEach(([p, col, txt]) => {
        const m = new T.Mesh(new T.SphereGeometry(.012, 12, 10), new T.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: .9, toneMapped: false })); m.position.set(p[0] * sg, p[1], p[2]); m.renderOrder = 10; g.add(m);
        this.notesMarques.push({ p: [p[0] * sg, p[1] + .03, p[2]], texte: txt, classe: txt === 'Origine' ? 'origine' : 'insertion' });
      });
    }
    this.reconstruireNotes(); this.demander();
  }
  reconstruireNotes() {
    if (!this.etiquettes) return;
    this.notes.forEach(n => n.el.remove()); this.notes = [];
    const T = this.THREE, ajout = (p, texte, classe, cle) => { const el = document.createElement('div'); el.className = 'an-note ' + (classe || ''); el.textContent = texte; if (cle) el.dataset.sid = cle; this.etiquettes.appendChild(el); this.notes.push({ p: new T.Vector3(...p), el, cle }); };
    (this.notesAppareil || []).forEach(n => ajout(n.p, n.texte, n.classe));
    (this.notesMarques || []).forEach(n => ajout(n.p, n.texte, n.classe));
    this.etiquettesRepere();
  }
  etiquettesRepere() {
    // étiquettes des repères visibles (si peu nombreux) et de la sélection
    if (!this.etiquettes) return;
    this.notes = this.notes.filter(n => { if (n.cle) { n.el.remove(); return false; } return true; });
    const e = this.store.obtenir(), T = this.THREE;
    const vis = Array.from(this.entrees.values()).filter(x => x.type === 'repere' && x.obj.visible);
    const liste = vis.length <= 12 ? vis : vis.filter(x => x.sid === e.selection);
    liste.forEach(x => { const el = document.createElement('div'); el.className = 'an-note repere'; el.textContent = nomAffiche(x.sid).replace(/ \(.*\)/, ''); this.etiquettes.appendChild(el); this.notes.push({ p: x.obj.position.clone().add(new T.Vector3(0, .016, 0)), el, cle: x.sid }); });
    const sel = e.selection && this.entrees.get(e.selection);
    if (sel && sel.type !== 'repere' && sel.obj.visible && !this.mini) {
      const box = new T.Box3().setFromObject(sel.obj), c = box.getCenter(new T.Vector3()); c.y = box.max.y + .02;
      const el = document.createElement('div'); el.className = 'an-note selection'; el.textContent = this.libelle(sel.sid); this.etiquettes.appendChild(el); this.notes.push({ p: c, el, cle: 'sel' });
    }
  }

  // ───────────────────────── synchronisation avec le store ─────────────────────────
  synchroniser(e, a) {
    if (this.mort) return;
    const d = a || {}, p = e.pathologie, pd = d.pathologie || {};
    for (const n of ['squelette', 'muscles', 'nerfs', 'organes', 'peau', 'reperes', 'dermatomes']) if (e.calques[n]) this.assurer(n);
    if (e.reperesAffiches.length) this.assurer('reperes');
    const sel = e.selection; if (sel) this.assurerType(typeDe(sel) || 'os');
    if (e.groupe) e.groupe.forEach(i => this.assurerType(typeDe(i) || 'os'));
    if (this.mini) this.assurer('squelette');
    let modifRachis = false;
    const rachisCle = x => JSON.stringify([x.pathologie.scoliose, x.pathologie.fracture && x.pathologie.fracture.os && x.pathologie.fracture.os.some(o => o.id.startsWith('vertebre-')) && x.pathologie.fracture, x.appareillage.actif && x.appareillage.modele, x.appareillage.correction]);
    if (!a || rachisCle(e) !== rachisCle(a) || !this.positions) { if (this.construits.squelette) { this.reconstruireRachis(); modifRachis = true; } }
    if (!a || p.fracture !== pd.fracture) {
      const ids = new Set(); [p.fracture, pd.fracture].forEach(f => f && f.os && f.os.forEach(o => { if (!o.id.startsWith('vertebre-')) ids.add(o.id); }));
      if (this.construits.squelette) ids.forEach(id => { const df = OS.find(o => o.id === id); if (df) (df.sym ? ['D', 'G'] : [null]).forEach(c => this.ajouterOs(df, c)); });
      this.appliquerCoupesSiBesoin();
    }
    if (!a || p.amputation !== pd.amputation) this.coupes(p.amputation);
    if (!a || p.amputation !== pd.amputation || p.scoliose !== pd.scoliose || p.fracture !== pd.fracture || e.appareillage !== d.appareillage) this.reconstruireAppareil();
    if (!a || p.scoliose !== pd.scoliose || e.appareillage.actif !== (d.appareillage || {}).actif || e.appareillage.correction !== (d.appareillage || {}).correction || e.selection !== d.selection || e.isolation !== d.isolation) this.reconstruireMarques();
    this.appliquerVisibilite(e);
    this.appliquerAffichage(e);
    if (!this.mini) this.etiquettesRepere();
    if (e.selection && e.selection !== (d.selection || null) && (e.isolation || this.mini) && !(this.mini && e.groupe)) this.focaliser(e.selection);
    else if (!e.selection && d.selection && this.mini === false && a && d.isolation) this.vue('face');
    if (a && e.isolation && !d.isolation && e.selection) this.focaliser(e.selection);
    if (a && !e.isolation && d.isolation) this.vue('face');
    if (e.isolationGroupe !== d.isolationGroupe && !this.mini) {
      if (e.isolationGroupe) this.focaliser(Array.from(this.entrees.values()).filter(x => (x.type === 'os' || x.type === 'cartilage') && groupeDe(x.base) === e.isolationGroupe).map(x => x.sid));
      else if (a) this.vue('face');
    }
    this.dernier = e; this.demander();
  }

  liees(sid) {
    const s = new Set(), t = typeDe(sid), c = coteDe(sid);
    if (t === 'muscle') {
      const d = definition(sid);
      [d.origine && d.origine.os, d.insertion && d.insertion.os].forEach(b => { if (!b) return; if (/^(vertebre-|sacrum)/.test(b) || !definition(b)) { s.add(b); return; } instances(b).forEach(i => { if (!coteDe(i) || !c || coteDe(i) === c) s.add(i); }); });
    } else if (t === 'repere') { const d = definition(sid); if (d.os) instances(d.os).forEach(i => { if (!coteDe(i) || !c || coteDe(i) === c) s.add(i); }); }
    return s;
  }
  appliquerVisibilite(e) {
    const sel = e.selection, groupe = this.mini && e.groupe && e.groupe.length ? e.groupe : null, iso = e.isolation && sel && !groupe;
    const lies = iso ? this.liees(sel) : null;
    for (const en of this.entrees.values()) {
      let vis, ghost = false;
      if (groupe) vis = groupe.includes(en.sid);
      else if (iso) { vis = en.sid === sel || (e.contexte || this.mini) && lies.has(en.sid); ghost = vis && en.sid !== sel; }
      else if (e.isolationGroupe && !this.mini && (en.type === 'os' || en.type === 'cartilage')) {      // région du squelette isolée (voir groupes-os.js)
        const dedans = groupeDe(en.base) === e.isolationGroupe;
        vis = dedans || !!e.contexte; ghost = vis && !dedans;
      }
      else if (e.isolationGroupe && !this.mini) vis = false;                                           // muscles, nerfs, organes… : masqués pendant l'isolation d'une région
      else {
        vis = !!e.calques[CALQUE_DE[en.type]] && !e.masques.includes(en.sid);
        if (en.type === 'repere') vis = vis || e.reperesAffiches.includes(en.sid);
        if (en.sid === 'nerfs-spinaux' && !e.calques.nerfs) vis = false;
        if (en.sid === sel) vis = true;
      }
      en.obj.visible = vis;
      if (en.type === 'os' || en.type === 'muscle' || en.type === 'nerf' || en.type === 'organe' || en.type === 'cartilage') this.fantome(en, ghost);
      this.surbrillance(en, en.sid === sel && !iso && !groupe ? 2 : en.sid === sel && groupe ? 2 : en.sid === this.survol ? 1 : 0);
    }
    this.grille && (this.grille.visible = !iso);
    // contexte global en isolation avec « garder le reste » : tout le squelette en fantôme
    if (iso && e.contexte && !this.mini) for (const en of this.entrees.values()) if (en.type === 'os' && en.sid !== sel) { en.obj.visible = true; this.fantome(en, true); }
    this.calques.pathologie.visible = !iso; this.calques.appareil.visible = !iso;
  }
  /** Transparence par calque, plan de coupe global et passes optionnelles du post-traitement */
  appliquerAffichage(e) {
    const T = this.THREE, af = e.affichage || {}, ops = af.opacites || {}, opsOs = af.opacitesOs || {};
    for (const en of this.entrees.values()) {
      const kc = ops[CALQUE_DE[en.type]], kg = en.type === 'os' || en.type === 'cartilage' ? opsOs[groupeDe(en.base)] : undefined;
      const k = kc === undefined && kg === undefined ? undefined : (kc === undefined ? 1 : kc) * (kg === undefined ? 1 : kg);       // calque × région
      if (k !== undefined && k <= .02) en.obj.visible = false;
      if (k === undefined && !en.opaciteAppliquee) continue;
      en.opaciteAppliquee = k !== undefined;
      en.mats.forEach(m => {
        const b = m.userData.base; if (!b || m.userData.fantome || !m.emissive) return;
        const t = k === undefined ? b.transparent : (b.transparent || k < 1);
        if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; }
        m.opacity = k === undefined ? b.opacity : k; m.depthWrite = k !== undefined && k < 1 ? false : b.depthWrite;
      });
    }
    const c = af.coupe || {};
    if (c.actif) {
      const [lo, hi] = { y: [0, 1.85], x: [-.5, .5], z: [-.22, .22] }[c.axe] || [0, 1.85], v = lo + (hi - lo) * c.position;
      const n = new T.Vector3(c.axe === 'x' ? 1 : 0, c.axe === 'y' ? 1 : 0, c.axe === 'z' ? 1 : 0).multiplyScalar(c.inverse ? -1 : 1);
      this.planCoupe = new T.Plane(n, -v * (c.inverse ? -1 : 1));
      this.rendu.clippingPlanes = [this.planCoupe];
    } else { this.planCoupe = null; this.rendu.clippingPlanes = []; }
    this.caps.maj(this.planCoupe, this.entrees);
    this.majPasses();
  }
  /** SSAO et profondeur de champ n'aiment pas les plans de coupe (leurs passes de profondeur les ignorent) : désactivés tant qu'une coupe est active */
  majPasses() {
    const p = this.pipeline; if (!p) return;
    const e = this.store.obtenir(), coupe = this.planCoupe || e.pathologie.amputation;
    p.ssao.enabled = !coupe;
    p.activerDOF(!!(e.affichage && e.affichage.profondeurChamp) && !this.planCoupe);
  }
  fantome(en, oui) {
    en.mats.forEach(m => {
      const b = m.userData.base; if (!b || !m.emissive) return;
      if (oui) { if (!m.userData.fantome) { m.userData.fantome = true; m.transparent = true; m.opacity = this.mini ? .24 : .13; m.depthWrite = false; m.needsUpdate = true; } }
      else if (m.userData.fantome) { m.userData.fantome = false; m.transparent = b.transparent; m.opacity = b.opacity; m.depthWrite = b.depthWrite; m.needsUpdate = true; }
    });
  }
  surbrillance(en, niveau) {
    en.mats.forEach(m => {
      if (!m.emissive || !m.userData.base) return;
      const b = m.userData.base;
      if (niveau === 2) { m.emissive.setHex(0x1ec8ff); m.emissiveIntensity = .55; }
      else if (niveau === 1) { m.emissive.setHex(0x1e7fff); m.emissiveIntensity = .3; }
      else { m.emissive.setHex(b.emissive); m.emissiveIntensity = b.ei; }
    });
  }

  // ───────────────────────── caméra et contrôles ─────────────────────────
  placerCamera() {
    const T = this.THREE, ce = Math.cos(this.el), se = Math.sin(this.el);
    this.camera.position.set(this.cible.x + this.dist * Math.sin(this.az) * ce, this.cible.y + this.dist * se, this.cible.z + this.dist * Math.cos(this.az) * ce);
    this.camera.lookAt(this.cible);
  }
  redimensionner() {
    const p = this.canvas.parentElement || this.canvas, w = Math.max(p.clientWidth, 10), h = Math.max(p.clientHeight, 10);
    this.rendu.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); if (this.pipeline) this.pipeline.setSize(w, h); this.largeur = w; this.hauteur = h; this.demander();
  }
  /** Cadre la zone touchée par une amputation (jambe, pied, bras, main…), de face */
  cadrerAmputation(niveau, cote) {
    const d = AMPUTATIONS.find(a => a.id === niveau); if (!d) return this.vue('face');
    if (cote === 'DG') return this.vue('face');
    const s = cote === 'D' ? 'droit' : 'gauche', f = cote === 'D' ? 'droite' : 'gauche';
    const zone = niveau === 'hanche' ? 'bassin' : /^(syme|chopart|lisfranc)$/.test(niveau) ? 'pied-' + s : d.membre === 'MI' ? 'jambe-' + f : /^(doigts|transmetacarpienne)$/.test(niveau) ? 'main-' + f : 'bras-' + s;
    this.vue('face', zone);
  }
  /** Point de vue prédéfini (face, dos, gauche, droite, dessus), éventuellement cadré sur une zone : 'tronc', 'bassin', 'jambe-droite', 'jambe-gauche', 'bras-droit', 'bras-gauche', 'pied-droit', 'pied-gauche', 'main-droite', 'main-gauche' */
  vue(nom, zone) {
    const v = VUES[nom] || VUES.face, z = ZONES[zone];
    this.allerA({ az: this.plusProche(v[0]), el: v[1], dist: this.mini ? this.dist : (z ? z.dist : DIST_DEFAUT), cible: new this.THREE.Vector3(...(z ? z.cible : [0, .9, 0])) });
  }
  plusProche(a) { let d = a - this.az; d = Math.atan2(Math.sin(d), Math.cos(d)); return this.az + d; }
  allerA(v, ms = 650) {
    this.anim = { t0: performance.now(), ms, de: { az: this.az, el: this.el, dist: this.dist, cible: this.cible.clone() }, vers: { az: v.az == null ? this.az : v.az, el: v.el == null ? this.el : v.el, dist: v.dist == null ? this.dist : v.dist, cible: v.cible || this.cible.clone() } };
    this.demander();
  }
  /** Focalisation dynamique sur une structure (ou un groupe d'ids) */
  focaliser(ids) {
    const T = this.THREE, liste = [].concat(ids), box = new T.Box3();
    liste.forEach(i => { const en = this.entrees.get(i); if (en && en.obj.visible !== false) box.expandByObject(en.obj); });
    if (box.isEmpty()) return;
    const c = box.getCenter(new T.Vector3()), t = box.getSize(new T.Vector3()), taille = Math.max(t.x, t.y, t.z * .8, .05);
    const dist = Math.min(Math.max(taille * (this.mini ? 2.1 : 2.6), this.mini ? .22 : .35), 5);
    this.allerA({ cible: c, dist });
  }
  brancherControles() {
    const cv = this.canvas, pts = new Map(); let depart = null, deplace = 0, dernierClic = 0;
    const T = this.THREE;
    cv.style.touchAction = 'none';
    const bas = ev => {
      cv.setPointerCapture && cv.setPointerCapture(ev.pointerId);
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      depart = { x: ev.clientX, y: ev.clientY, t: performance.now(), pan: ev.button === 2 || ev.shiftKey || ev.button === 1 }; deplace = 0; this.anim = null; this.auto = false;
    };
    const mouv = ev => {
      if (!pts.has(ev.pointerId)) { this.survolPoint(ev); return; }
      const avant = pts.get(ev.pointerId), dx = ev.clientX - avant.x, dy = ev.clientY - avant.y;
      deplace += Math.abs(dx) + Math.abs(dy);
      if (pts.size === 1) {
        if (depart && depart.pan) this.translater(dx, dy);
        else { this.az -= dx * .0075; this.el = Math.min(Math.max(this.el + dy * .0075, -1.5), 1.5); }
      } else if (pts.size === 2) {
        const autre = Array.from(pts.entries()).find(([k]) => k !== ev.pointerId)[1];
        const d0 = Math.hypot(avant.x - autre.x, avant.y - autre.y), d1 = Math.hypot(ev.clientX - autre.x, ev.clientY - autre.y);
        if (d0 > 0 && d1 > 0) this.dist = Math.min(Math.max(this.dist * d0 / d1, .12), 9);
        this.translater(dx / 2, dy / 2);
      }
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); this.placerCamera(); this.demander();
    };
    const haut = ev => {
      const clic = pts.size === 1 && deplace < 6 && depart && performance.now() - depart.t < 500;
      pts.delete(ev.pointerId);
      if (clic) {
        const r = this.cliquer(ev);
        const now = performance.now(); if (now - dernierClic < 350 && r) this.focaliser(r); dernierClic = now;
      }
    };
    cv.addEventListener('pointerdown', bas); cv.addEventListener('pointermove', mouv); cv.addEventListener('pointerup', haut); cv.addEventListener('pointercancel', ev => pts.delete(ev.pointerId));
    cv.addEventListener('contextmenu', ev => ev.preventDefault());
    cv.addEventListener('wheel', ev => { ev.preventDefault(); this.anim = null; this.dist = Math.min(Math.max(this.dist * Math.exp(ev.deltaY * .0012), .12), 9); this.placerCamera(); this.demander(); }, { passive: false });
    this.nettoyerControles = () => { };
  }
  translater(dx, dy) {
    const T = this.THREE, k = this.dist * .0016 * (32 / 32);
    const droite = new T.Vector3().setFromMatrixColumn(this.camera.matrix, 0), haut = new T.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
    this.cible.addScaledVector(droite, -dx * k).addScaledVector(haut, dy * k);
    this.cible.y = Math.min(Math.max(this.cible.y, -.2), 2.2);
  }
  // ───────────────────────── sélection ─────────────────────────
  pointer(ev) {
    const T = this.THREE, r = this.canvas.getBoundingClientRect(), v = new T.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    const rc = this.raycaster || (this.raycaster = new T.Raycaster()); rc.setFromCamera(v, this.camera);
    const cibles = []; for (const en of this.entrees.values()) if (en.obj.visible && en.type !== 'peau' && en.type !== 'dermatome' && en.type !== 'cartilage') cibles.push(en.obj);
    const hits = rc.intersectObjects(cibles, true);
    for (const h of hits) {
      const m = h.object.material;
      if (this.planCoupe && this.planCoupe.distanceToPoint(h.point) < 0) continue;      // partie retirée par le plan de coupe
      if (m && m.clippingPlanes && m.clippingPlanes.length && m.clippingPlanes.every(pl => pl.distanceToPoint(h.point) < 0)) continue;   // partie retirée par une amputation : on ne la touche pas
      const sid = h.object.userData.sid; if (sid) return sid;
    }
    return null;
  }
  survolPoint(ev) {
    if (this.mini || ev.pointerType === 'touch') return;
    const t = performance.now(); if (t - (this.dernierSurvol || 0) < 60) return; this.dernierSurvol = t;
    const sid = this.pointer(ev);
    if (sid !== this.survol) { const prec = this.survol; this.survol = sid; const e = this.store.obtenir(); [prec, sid].forEach(i => { const en = i && this.entrees.get(i); if (en) this.surbrillance(en, en.sid === e.selection ? 2 : en.sid === this.survol ? 1 : 0); }); this.canvas.style.cursor = sid ? 'pointer' : 'grab'; this.noteSurvol(sid); if (this.opts.surSurvol) this.opts.surSurvol(sid); this.demander(); }
  }
  /** Nom français et, quand la fiche le donne, nom latin : « Fémur (Femur) » */
  libelle(sid) {
    const d = definition(sid), n = nomAffiche(sid), plat = x => String(x).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return d && d.latin && !/^vertebre|^cote/.test(sid) && !plat(n).startsWith(plat(d.latin).split(' ')[0]) ? n + ' · ' + d.latin : n;     // pas de doublon quand le nom français ressemble au nom latin
  }
  /** Étiquette au survol : nom de la structure sous le pointeur (la sélection garde la sienne) */
  noteSurvol(sid) {
    if (!this.etiquettes) return;
    this.notes = this.notes.filter(n => { if (n.cle === 'hov') { n.el.remove(); return false; } return true; });
    const en = sid && this.entrees.get(sid); if (!en || sid === this.store.obtenir().selection) return;
    const T = this.THREE, box = new T.Box3().setFromObject(en.obj), c = box.getCenter(new T.Vector3()); c.y = box.max.y + .015;
    const el = document.createElement('div'); el.className = 'an-note survol'; el.textContent = this.libelle(sid); this.etiquettes.appendChild(el); this.notes.push({ p: c, el, cle: 'hov' });
  }
  cliquer(ev) {
    const sid = this.pointer(ev);
    if (this.opts.surSelection) this.opts.surSelection(sid, ev);
    return sid;
  }

  // ───────────────────────── rendu ─────────────────────────
  demander() { this.dirty = true; if (!this.raf && !this.mort) this.raf = requestAnimationFrame(t => this.image(t)); }
  image(t) {
    this.raf = 0; if (this.mort) return;
    let continuer = false;
    if (this.anim) {
      const k = Math.min((performance.now() - this.anim.t0) / this.anim.ms, 1), s = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2, a = this.anim;
      this.az = a.de.az + (a.vers.az - a.de.az) * s; this.el = a.de.el + (a.vers.el - a.de.el) * s; this.dist = a.de.dist + (a.vers.dist - a.de.dist) * s;
      this.cible.lerpVectors(a.de.cible, a.vers.cible, s); this.placerCamera();
      if (k >= 1) this.anim = null; else continuer = true;
    }
    if (this.auto) { this.az += .006; this.placerCamera(); continuer = true; }
    if (!document.hidden) { if (this.pipeline) { this.pipeline.focus(this.dist); this.pipeline.render(); } else this.rendu.render(this.scene, this.camera); this.placerNotes(); }
    this.dirty = false;
    if (continuer) this.raf = requestAnimationFrame(t2 => this.image(t2));
  }
  placerNotes() {
    if (!this.notes.length) return;
    const T = this.THREE, w = this.largeur, h = this.hauteur, v = new T.Vector3(), places = [];
    // les étiquettes prioritaires (sélection, survol) se placent d'abord ; les autres sont décalées vers le haut tant qu'elles en recouvrent une autre
    const ordre = this.notes.slice().sort((a, b) => (b.cle ? 1 : 0) - (a.cle ? 1 : 0));
    for (const n of ordre) {
      v.copy(n.p).project(this.camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      n.el.style.display = visible ? '' : 'none';
      if (!visible) continue;
      const x = (v.x * .5 + .5) * w; let y = (-v.y * .5 + .5) * h;
      const lw = n.largeur || (n.largeur = n.el.offsetWidth || 60), lh = n.hauteur || (n.hauteur = n.el.offsetHeight || 20);
      for (let k = 0; k < 10; k++) {
        const r = places.find(q => Math.abs(q.x - x) < (q.w + lw) / 2 && Math.abs(q.y - y) < (q.h + lh) / 2 + 1);
        if (!r) break; y = r.y - (r.h + lh) / 2 - 3;
      }
      places.push({ x, y, w: lw, h: lh });
      n.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-100%)';
    }
  }
  rotationAuto(oui) { this.auto = !!oui; this.demander(); }
  /** Environnement de studio (reflets) puis, au niveau haute, post-traitement : chargés à la demande, le rendu simple reste actif entre-temps ou en cas d'échec */
  async initialiserRendu() {
    try {
      const env = await environnement(this.THREE, this.rendu); if (this.mort) return;
      this.scene.environment = env; this.envTex = env;
      if (this.niveau === 'haute') {
        this.scene.background = fondDegrade(this.THREE);
        this.pipeline = await pipeline(this.THREE, this.rendu, this.scene, this.camera, this.largeur || 800, this.hauteur || 600);
        if (this.mort) { this.pipeline.dispose(); this.pipeline = null; return; }
        this.majPasses();
      }
      this.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
    } catch (e) { console.warn('[anatomie] rendu avancé indisponible : ' + (e && e.message || e)); this.niveau = 'standard'; this.scene.background = null; this.pipeline = null; }
    this.demander();
  }
  capture() { this.rendu.render(this.scene, this.camera); return this.canvas.toDataURL('image/png'); }
  dispose() {
    this.mort = true; cancelAnimationFrame(this.raf); this.desabonne && this.desabonne(); this.obs && this.obs.disconnect();
    this.notes.forEach(n => n.el.remove());
    this.caps && this.caps.dispose();
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => m.dispose()); });
    if (this.pipeline) this.pipeline.dispose(); if (this.envTex) this.envTex.dispose(); this.studio && this.studio.retirer();
    this.rendu.dispose(); try { this.rendu.forceContextLoss(); } catch (e) { }
  }
}
