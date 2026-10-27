import * as THREE from 'three';
import * as M from './maquette-calcul.js';

/* ═════════════ NEPTUNE : L'ATELIER 3D (moteur) ═════════════
   Une scène Three.js à part (dessinée par la galaxie à la place de la sienne : G.surcharger). Importer (glTF/GLB avec Draco, Meshopt, KTX2 ; OBJ ; STL ; FBX), regarder (orbite, HDRI,
   ombres, PBR, mesures, plan de coupe, vue éclatée), ranger (arbre de pièces), animer (clips glTF + images clés + assemblage), visiter (trajets de caméra), modifier (déplacer, tourner,
   échelle, couleur, supprimer, dupliquer, symétrie), exporter (GLB, STL, OBJ), fabriquer (formes paramétriques), préparer l'impression 3D (étanchéité, volume, échelle).
   Les calculs sans Three.js sont dans maquette-calcul.js (testé sous Node). Aucune donnée n'est envoyée sur Internet : les fichiers restent dans le navigateur. */
const VENDOR = new URL('../../../galaxie/vendor/addons/', import.meta.url).href;
const EXTENSIONS = ['glb', 'gltf', 'obj', 'stl', 'fbx'];
const FONDS = { sombre: 0x0a0f16, noir: 0x000000, gris: 0x4a525c, clair: 0xdfe5ea };
const attendre = ms => new Promise(r => setTimeout(r, ms));

export function creerAtelier({ renderer, canvas }) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
  const modele = new THREE.Group(); modele.name = 'Modèle'; scene.add(modele);
  const decor = new THREE.Group(); scene.add(decor);
  const etat = { unite: 'm', fond: 'sombre', grille: true, ombres: true, hdri: 'studio', exposition: 1, eclate: 0, coupe: { actif: false, axe: 1, position: 0, inverse: false }, mesure: false, selection: null, lecture: null, visite: null, mode: 'orbite', tourAuto: false };
  const ctrl = { az: 0.7, el: 0.35, dist: 5, cible: new THREE.Vector3(), cibleVisee: null };
  const raycaster = new THREE.Raycaster(), ecouteurs = new Map(), mixers = [], clips = [];
  let pmrem = null, envStudio = null, envHdri = null, boiteSel = null, mesureObj = null, rayon = 1, sol = null, grille = null, lumDir = null, lumHemi = null, pistes = [], tPistes = 0, lecturePistes = null, derniereMesure = null;
  const eclatBase = new Map();   // id → { position repos, decalage }

  const emettre = (nom, d) => (ecouteurs.get(nom) || []).forEach(f => { try { f(d); } catch (e) { console.warn('[atelier]', e); } });
  const sur = (nom, f) => { if (!ecouteurs.has(nom)) ecouteurs.set(nom, []); ecouteurs.get(nom).push(f); };

  // ── décor : lumières, environnement, sol ──
  lumHemi = new THREE.HemisphereLight(0xdde8ff, 0x303844, 0.55); decor.add(lumHemi);
  lumDir = new THREE.DirectionalLight(0xffffff, 2.2); lumDir.castShadow = true; lumDir.shadow.mapSize.set(2048, 2048); lumDir.shadow.bias = -0.0005; decor.add(lumDir, lumDir.target);
  sol = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.35 })); sol.rotation.x = -Math.PI / 2; sol.receiveShadow = true; sol.name = '__sol'; decor.add(sol);
  scene.background = new THREE.Color(FONDS.sombre);
  async function preparerEnvironnement() {
    pmrem = pmrem || new THREE.PMREMGenerator(renderer);
    const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
    envStudio = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; if (etat.hdri === 'studio') scene.environment = envStudio;
  }
  const pret = preparerEnvironnement().catch(e => console.warn('[atelier] environnement :', e));

  /* HDRI : un fichier .hdr ou .exr déposé par l'utilisateur remplace l'éclairage « studio » (rien n'est téléchargé tout seul). */
  async function chargerHDRI(fichier) {
    const { RGBELoader } = await import('three/addons/loaders/RGBELoader.js'), url = URL.createObjectURL(fichier);
    try { const tex = await new RGBELoader().loadAsync(url); tex.mapping = THREE.EquirectangularReflectionMapping; pmrem = pmrem || new THREE.PMREMGenerator(renderer); envHdri = pmrem.fromEquirectangular(tex).texture; tex.dispose(); etat.hdri = 'hdri'; scene.environment = envHdri; emettre('etat'); }
    finally { URL.revokeObjectURL(url); }
  }
  function regler(patch) {
    Object.assign(etat, patch);
    if ('fond' in patch) scene.background = new THREE.Color(FONDS[etat.fond] ?? FONDS.sombre);
    if ('grille' in patch && grille) grille.visible = etat.grille;
    if ('ombres' in patch) { renderer.shadowMap.enabled = true; lumDir.castShadow = etat.ombres; sol.visible = etat.ombres; modele.traverse(o => { if (o.isMesh) o.castShadow = etat.ombres; }); }
    if ('hdri' in patch) scene.environment = etat.hdri === 'hdri' && envHdri ? envHdri : (etat.hdri === 'aucun' ? null : envStudio);
    if ('exposition' in patch) renderer.toneMappingExposure = etat.exposition;
    if ('coupe' in patch || 'eclate' in patch) { appliquerCoupe(); }
    emettre('etat');
  }

  // ── cadrage, orbite ──
  const boiteModele = () => { const b = new THREE.Box3(); modele.updateWorldMatrix(true, true); b.setFromObject(modele, true); return b; };
  function mettreAJourDecor() {
    const b = boiteModele(); if (b.isEmpty()) { rayon = 1; grille && (grille.visible = false); sol.visible = false; return; }
    const taille = b.getSize(new THREE.Vector3()), centre = b.getCenter(new THREE.Vector3()); rayon = Math.max(taille.length() / 2, 1e-4);
    camera.near = rayon / 500; camera.far = rayon * 400; camera.updateProjectionMatrix();
    if (grille) { decor.remove(grille); grille.geometry.dispose(); }
    const cote = Math.max(taille.x, taille.z, rayon) * 3, pas = Math.pow(10, Math.floor(Math.log10(cote / 10)));
    grille = new THREE.GridHelper(Math.ceil(cote / pas) * pas, Math.max(2, Math.round(cote / pas)), 0x5b7080, 0x2d3844); grille.position.set(centre.x, b.min.y - rayon * 0.002, centre.z); grille.visible = etat.grille; grille.material.transparent = true; grille.material.opacity = 0.6; decor.add(grille);
    sol.scale.setScalar(cote * 1.5); sol.position.set(centre.x, b.min.y - rayon * 0.001, centre.z); sol.visible = etat.ombres;
    const d = rayon * 3; lumDir.position.set(centre.x + d * 0.6, b.max.y + d, centre.z + d * 0.4); lumDir.target.position.copy(centre);
    const c = lumDir.shadow.camera; c.left = -rayon * 1.6; c.right = rayon * 1.6; c.top = rayon * 1.6; c.bottom = -rayon * 1.6; c.near = d * 0.1; c.far = d * 4; c.updateProjectionMatrix();
  }
  function cadrer(objet = modele, animer = true) {
    const b = new THREE.Box3(); objet.updateWorldMatrix(true, true); b.setFromObject(objet, true); if (b.isEmpty()) return;
    const c = b.getCenter(new THREE.Vector3()), r = Math.max(b.getSize(new THREE.Vector3()).length() / 2, 1e-4), dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2) * 1.05;
    if (!animer) { ctrl.cible.copy(c); ctrl.dist = dist; ctrl.cibleVisee = null; return; }
    ctrl.cibleVisee = { c, dist, t: 0, c0: ctrl.cible.clone(), d0: ctrl.dist };
  }
  function appliquerCamera() {
    const ce = Math.cos(ctrl.el);
    camera.position.set(ctrl.cible.x + Math.sin(ctrl.az) * ce * ctrl.dist, ctrl.cible.y + Math.sin(ctrl.el) * ctrl.dist, ctrl.cible.z + Math.cos(ctrl.az) * ce * ctrl.dist); camera.lookAt(ctrl.cible);
  }
  const souris = {
    tourner(dx, dy) { if (etat.visite) arreterVisite(); ctrl.cibleVisee = null; ctrl.az -= dx * 0.006; ctrl.el = Math.max(-1.5, Math.min(1.5, ctrl.el + dy * 0.006)); },
    deplacer(dx, dy) { if (etat.visite) arreterVisite(); ctrl.cibleVisee = null; const k = ctrl.dist * 0.0016, d = new THREE.Vector3(); camera.getWorldDirection(d); const droite = new THREE.Vector3().crossVectors(d, camera.up).normalize(), haut = new THREE.Vector3().crossVectors(droite, d).normalize(); ctrl.cible.addScaledVector(droite, -dx * k).addScaledVector(haut, dy * k); },
    zoom(d) { ctrl.cibleVisee = null; ctrl.dist = Math.max(rayon * 0.02, Math.min(rayon * 80, ctrl.dist * Math.exp(d * 0.0012))); }
  };
  function dimensionner(l, h) { camera.aspect = Math.max(1, l) / Math.max(1, h); camera.updateProjectionMatrix(); }

  // ── identifiants, parcours ──
  const parNom = nom => { let r = null; modele.traverse(o => { if (!r && o !== modele && o.name === nom) r = o; }); return r ? r.uuid : null; };
  const parId = id => { let r = null; modele.traverse(o => { if (!r && o.uuid === id) r = o; }); return r; };
  function arbre(noeud = modele) {
    const n = { id: noeud.uuid, nom: noeud.name || (noeud.isMesh ? 'Maillage' : 'Groupe'), type: noeud.isMesh ? 'maillage' : noeud.isLight ? 'lumière' : 'groupe', visible: noeud.visible, enfants: [] };
    if (noeud.isMesh) { n.sommets = noeud.geometry.attributes.position.count; n.materiau = noeud.material && (Array.isArray(noeud.material) ? noeud.material[0] : noeud.material).name || ''; }
    for (const e of noeud.children) if (!e.userData.__aide) n.enfants.push(arbre(e));
    return n;
  }
  function pieces() {
    let racines = modele.children.filter(o => !o.userData.__aide);
    while (racines.length === 1 && !racines[0].isMesh && racines[0].children.length) racines = racines[0].children.filter(o => !o.userData.__aide);
    return racines.length >= 2 ? racines : (racines.length === 1 && racines[0].isMesh ? racines : (() => { const m = []; modele.traverse(o => { if (o.isMesh) m.push(o); }); return m; })());
  }
  function infoPiece(o) {
    const b = new THREE.Box3().setFromObject(o, true), c = b.getCenter(new THREE.Vector3()), t = b.getSize(new THREE.Vector3());
    let vol = 0; o.traverse(m => { if (m.isMesh) { try { vol += M.statsMaillage(maillageMonde(m)).volume; } catch (e) { /* maillage illisible */ } } });
    return { id: o.uuid, nom: o.name || 'Pièce', volume: vol || t.x * t.y * t.z, boite: { dim: [t.x, t.y, t.z] }, centre: [c.x, c.y, c.z], rayon: t.length() / 2, objet: o };
  }
  function maillageMonde(mesh) {
    mesh.updateWorldMatrix(true, false); const g = mesh.geometry, p = g.attributes.position, v = new THREE.Vector3(), pos = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld); pos[3 * i] = v.x; pos[3 * i + 1] = v.y; pos[3 * i + 2] = v.z; }
    let index = g.index ? Uint32Array.from(g.index.array) : null;
    if (mesh.matrixWorld.determinant() < 0 && index) for (let t = 0; t < index.length; t += 3) { const x = index[t + 1]; index[t + 1] = index[t + 2]; index[t + 2] = x; }
    return { positions: pos, index: index || undefined };
  }
  function maillageDe(id) {
    const o = id ? parId(id) : modele, liste = []; if (!o) return null;
    o.traverse(m => { if (m.isMesh && m.visible && !m.userData.__aide) liste.push(maillageMonde(m)); });
    return liste.length ? M.fusionner(liste) : null;
  }

  // ── import ──
  let chargeurs = null;
  async function preparerChargeurs() {
    if (chargeurs) return chargeurs;
    const [{ GLTFLoader }, { DRACOLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/loaders/DRACOLoader.js'), import('three/addons/loaders/KTX2Loader.js'), import('three/addons/libs/meshopt_decoder.module.js')]);
    const draco = new DRACOLoader().setDecoderPath(VENDOR + 'libs/draco/gltf/'), ktx2 = new KTX2Loader().setTranscoderPath(VENDOR + 'libs/basis/').detectSupport(renderer);
    chargeurs = { GLTFLoader, draco, ktx2, MeshoptDecoder }; return chargeurs;
  }
  const extensionDe = nom => (/\.([a-z0-9]+)$/i.exec(nom) || [])[1]?.toLowerCase() || '';
  function nommer(objet, nom) { objet.name = objet.name || nom; return objet; }
  function preparerMateriaux(racine, { defaut = true } = {}) {
    racine.traverse(o => {
      if (!o.isMesh) return; o.castShadow = etat.ombres; o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m, i) => { if (!m) return; if (defaut && !(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) { const n = new THREE.MeshStandardMaterial({ color: m.color ? m.color.clone() : 0xb8c2cc, metalness: 0.1, roughness: 0.55, map: m.map || null, vertexColors: !!m.vertexColors }); n.name = m.name || ''; if (Array.isArray(o.material)) o.material[i] = n; else o.material = n; m = n; } m.side = THREE.DoubleSide === m.side ? m.side : THREE.FrontSide; });
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
    });
  }
  /* fichiers : File[] (un modèle, éventuellement accompagné de ses .bin, textures, .mtl) ; attribution : fiche facultative (extras du GLB exporté). */
  async function importer(fichiers, { attribution = null, unite = null } = {}) {
    const liste = [...fichiers], principal = liste.find(f => EXTENSIONS.includes(extensionDe(f.name)));
    if (!principal) throw new Error('Format non pris en charge : ' + (liste[0] ? liste[0].name : '(aucun fichier)') + '. Formats : GLB, glTF, OBJ, STL, FBX.');
    const ext = extensionDe(principal.name), urls = new Map(liste.map(f => [f.name, URL.createObjectURL(f)])), gestion = new THREE.LoadingManager();
    gestion.setURLModifier(u => { const nom = decodeURIComponent(u.split('/').pop().split('?')[0]); return urls.get(nom) || u; });
    let racine;
    try {
      if (ext === 'glb' || ext === 'gltf') {
        const C = await preparerChargeurs(), chargeur = new C.GLTFLoader(gestion).setDRACOLoader(C.draco).setKTX2Loader(C.ktx2).setMeshoptDecoder(C.MeshoptDecoder), gltf = await chargeur.loadAsync(urls.get(principal.name));
        racine = gltf.scene; racine.userData.clips = gltf.animations || [];
        racine.traverse(o => { if (o.userData && typeof o.userData.name === 'string' && o.userData.name) o.name = o.userData.name; });   // GLTFLoader remplace les espaces par « _ » : on garde le nom d'origine
        if (gltf.animations && gltf.animations.length) { const mx = new THREE.AnimationMixer(racine); mixers.push(mx); for (const c of gltf.animations) clips.push({ nom: c.name || 'Animation', action: mx.clipAction(c), duree: c.duration }); }
        if (gltf.parser && gltf.parser.json && gltf.parser.json.asset && gltf.parser.json.asset.extras && gltf.parser.json.asset.extras.attribution && !attribution) attribution = gltf.parser.json.asset.extras.attribution;
        preparerMateriaux(racine, { defaut: false });
      } else if (ext === 'stl') {
        const { STLLoader } = await import('three/addons/loaders/STLLoader.js'), geo = await new STLLoader(gestion).loadAsync(urls.get(principal.name));
        geo.computeVertexNormals(); const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xb8c2cc, metalness: 0.1, roughness: 0.5 })); racine = new THREE.Group(); racine.add(m); preparerMateriaux(racine);
      } else if (ext === 'obj') {
        const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js'), mtlFichier = liste.find(f => extensionDe(f.name) === 'mtl'); const ol = new OBJLoader(gestion);
        if (mtlFichier) { const { MTLLoader } = await import('three/addons/loaders/MTLLoader.js'), mats = await new MTLLoader(gestion).loadAsync(urls.get(mtlFichier.name)); mats.preload(); ol.setMaterials(mats); }
        racine = await ol.loadAsync(urls.get(principal.name)); preparerMateriaux(racine);
      } else if (ext === 'fbx') {
        const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js'); racine = await new FBXLoader(gestion).loadAsync(urls.get(principal.name));
        if (racine.animations && racine.animations.length) { const mx = new THREE.AnimationMixer(racine); mixers.push(mx); for (const c of racine.animations) clips.push({ nom: c.name || 'Animation', action: mx.clipAction(c), duree: c.duration }); }
        preparerMateriaux(racine);
      }
    } finally { setTimeout(() => urls.forEach(u => URL.revokeObjectURL(u)), 4000); }
    const nomModele = principal.name.replace(/\.[a-z0-9]+$/i, ''), groupe = new THREE.Group(); groupe.name = nomModele; groupe.add(racine); groupe.userData.source = principal.name; groupe.userData.extension = ext;
    if (attribution) groupe.userData.attribution = attribution;
    if (ext === 'stl' || ext === 'obj') groupe.userData.unite = unite || null;
    modele.add(groupe); remettreAZeroEclate(); mettreAJourDecor(); cadrer(groupe); nommerAnonymes(groupe);
    emettre('modele'); return { nom: nomModele, extension: ext, sommets: compter(groupe).sommets, meshes: compter(groupe).meshes, clips: groupe.userData.clips ? groupe.userData.clips.length : 0, groupe };
  }
  function nommerAnonymes(racine) { let i = 1; racine.traverse(o => { if (o !== racine && !o.name) o.name = (o.isMesh ? 'Maillage ' : 'Groupe ') + (i++); }); }
  function compter(racine) { let sommets = 0, meshes = 0; racine.traverse(o => { if (o.isMesh) { meshes++; sommets += o.geometry.attributes.position.count; } }); return { sommets, meshes }; }

  // ── sélection ──
  function selectionner(id) {
    etat.selection = id || null; if (boiteSel) { scene.remove(boiteSel); boiteSel.geometry.dispose(); boiteSel = null; }
    const o = id ? parId(id) : null;
    if (o) { boiteSel = new THREE.BoxHelper(o, 0x8fd0e3); boiteSel.userData.__aide = true; boiteSel.material.depthTest = false; boiteSel.renderOrder = 999; scene.add(boiteSel); }
    emettre('selection', id ? (o ? { id, nom: o.name } : null) : null);
  }
  function sousLeCurseur(x, y) {
    const r = canvas.getBoundingClientRect(); raycaster.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
    const cibles = []; modele.traverse(o => { if (o.isMesh && o.visible) cibles.push(o); });
    return raycaster.intersectObjects(cibles, false)[0] || null;
  }
  function clic(x, y, { parent = false } = {}) {
    const h = sousLeCurseur(x, y);
    if (etat.mesure) { if (h) ajouterPointMesure(h.point); return h; }
    if (!h) { selectionner(null); return null; }
    let o = h.object; if (parent && o.parent && o.parent !== modele) o = o.parent;
    selectionner(o.uuid); return h;
  }

  // ── visibilité, nom, couleur, matériau ──
  function afficher(id, oui) { const o = parId(id); if (!o) return false; o.visible = !!oui; mettreAJourDecor(); emettre('modele'); return true; }
  function isoler(id) {
    const cible = parId(id); if (!cible) return false;
    const garde = new Set(); cible.traverse(o => garde.add(o)); let p = cible.parent; while (p && p !== scene) { garde.add(p); p = p.parent; }
    modele.traverse(o => { if (o === modele) return; if (o.isMesh || o.isGroup || o.isObject3D) o.visible = garde.has(o); });
    emettre('modele'); return true;
  }
  function toutAfficher() { modele.traverse(o => { o.visible = true; }); mettreAJourDecor(); emettre('modele'); }
  function renommer(id, nom) { const o = parId(id); if (!o) return false; o.name = String(nom).slice(0, 80); emettre('modele'); return true; }
  const matsDe = o => { const l = []; o.traverse(m => { if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x && l.push(x)); }); return l; };
  function couleur(id, hex) { const o = parId(id); if (!o) return false; for (const m of matsDe(o)) { if (m.color) m.color.set(hex); } emettre('modele'); return true; }
  function materiau(id, { metal, rugosite, opacite } = {}) {
    const o = parId(id); if (!o) return false;
    for (const m of matsDe(o)) { if (metal !== undefined && 'metalness' in m) m.metalness = metal; if (rugosite !== undefined && 'roughness' in m) m.roughness = rugosite; if (opacite !== undefined) { m.transparent = opacite < 1; m.opacity = opacite; } }
    emettre('modele'); return true;
  }

  // ── modifier ──
  function deplacer(id, d) { const o = parId(id); if (!o) return false; o.position.add(new THREE.Vector3(...d)); eclatBase.delete(o.uuid); majSelection(); emettre('modele'); return true; }
  function tourner(id, deg) { const o = parId(id); if (!o) return false; o.rotation.x += THREE.MathUtils.degToRad(deg[0]); o.rotation.y += THREE.MathUtils.degToRad(deg[1]); o.rotation.z += THREE.MathUtils.degToRad(deg[2]); majSelection(); emettre('modele'); return true; }
  function echelle(id, f) { const o = parId(id); if (!o || !(f > 0)) return false; o.scale.multiplyScalar(f); mettreAJourDecor(); majSelection(); emettre('modele'); return true; }
  function supprimer(id) {
    const o = parId(id); if (!o || o === modele) return false; if (etat.selection === id) selectionner(null);
    o.parent.remove(o); o.traverse(m => { if (m.isMesh) { m.geometry.dispose(); matsDe(m).forEach(x => x.dispose && x.dispose()); } }); mettreAJourDecor(); emettre('modele'); return true;
  }
  function dupliquer(id) { const o = parId(id); if (!o) return null; const c = o.clone(true); c.name = (o.name || 'Pièce') + ' (copie)'; const b = new THREE.Box3().setFromObject(o); c.position.x += (b.max.x - b.min.x) * 1.1; o.parent.add(c); mettreAJourDecor(); emettre('modele'); return c.uuid; }
  /* Symétrie : crée la copie miroir par rapport à un plan passant par le centre de la boîte de l'objet (axe 0 = x, 1 = y, 2 = z). Les normales sont corrigées à l'export. */
  function symetrie(id, axe = 0) {
    const o = parId(id); if (!o) return null; const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3()), copie = o.clone(true);
    const e = [1, 1, 1]; e[axe] = -1; copie.scale.multiply(new THREE.Vector3(...e)); const p = copie.position.toArray(); p[axe] = 2 * c.getComponent(axe) - p[axe]; copie.position.fromArray(p); copie.name = (o.name || 'Pièce') + ' (symétrique)';
    copie.traverse(m => { if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map(x => x.clone()) : m.material.clone(); });
    o.parent.add(copie); mettreAJourDecor(); emettre('modele'); return copie.uuid;
  }
  const majSelection = () => { if (boiteSel) boiteSel.update(); };

  // ── mesures ──
  // les valeurs restent dans l'unité du fichier ; l'affichage dit laquelle (réglage « unité du fichier »)
  const formaterLongueur = v => +v.toPrecision(4) + ' ' + etat.unite;
  function ajouterPointMesure(p) {
    if (!mesureObj || mesureObj.points.length >= 2) { effacerMesure(); mesureObj = { points: [], ligne: null, billes: [] }; }
    mesureObj.points.push(p.clone());
    const bille = new THREE.Mesh(new THREE.SphereGeometry(rayon * 0.01, 12, 8), new THREE.MeshBasicMaterial({ color: 0xc9b27a, depthTest: false })); bille.position.copy(p); bille.renderOrder = 1000; bille.userData.__aide = true; scene.add(bille); mesureObj.billes.push(bille);
    if (mesureObj.points.length === 2) {
      const g = new THREE.BufferGeometry().setFromPoints(mesureObj.points); mesureObj.ligne = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xc9b27a, depthTest: false })); mesureObj.ligne.renderOrder = 1000; mesureObj.ligne.userData.__aide = true; scene.add(mesureObj.ligne);
      const dist = mesureObj.points[0].distanceTo(mesureObj.points[1]); derniereMesure = { distance: dist, texte: formaterLongueur(dist), dx: Math.abs(mesureObj.points[0].x - mesureObj.points[1].x), dy: Math.abs(mesureObj.points[0].y - mesureObj.points[1].y), dz: Math.abs(mesureObj.points[0].z - mesureObj.points[1].z) };
    } else derniereMesure = null;
    emettre('mesure', derniereMesure);
  }
  function effacerMesure() { if (!mesureObj) return; mesureObj.billes.forEach(b => { scene.remove(b); b.geometry.dispose(); b.material.dispose(); }); if (mesureObj.ligne) { scene.remove(mesureObj.ligne); mesureObj.ligne.geometry.dispose(); mesureObj.ligne.material.dispose(); } mesureObj = null; derniereMesure = null; emettre('mesure', null); }
  function projeter(v) { const p = v.clone().project(camera); return { x: (p.x * 0.5 + 0.5), y: (-p.y * 0.5 + 0.5), devant: p.z < 1 }; }
  function milieuMesure() { return mesureObj && mesureObj.points.length === 2 ? projeter(mesureObj.points[0].clone().add(mesureObj.points[1]).multiplyScalar(0.5)) : null; }
  /* Circonférence d'un membre scanné : coupe l'objet (ou tout le modèle) par un plan perpendiculaire à l'axe, à une hauteur relative (0..1 de la boîte). */
  function circonference(id, axe = 1, relatif = 0.5) {
    const m = maillageDe(id); if (!m) return { ok: false, raison: 'Rien à mesurer : sélectionne une pièce visible.' };
    const b = M.boite(m), h = b.min[axe] + (b.max[axe] - b.min[axe]) * Math.max(0, Math.min(1, relatif)), c = M.coupe(m, axe, h);
    if (c.vide) return { ok: false, raison: 'Le plan ne coupe rien à cette hauteur.' };
    return { ok: true, hauteur: h, boucles: c.nbBoucles, fermee: c.tousFermes, circonference: c.longueurContour, aire: c.aire, unite: etat.unite, note: 'Le contour est mesuré sur le maillage tel qu’il est dans le fichier (' + etat.unite + ') : vérifie l’unité du fichier et ne l’utilise pas comme mesure clinique sans contrôle.' };
  }

  // ── plan de coupe ──
  const plan = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  function appliquerCoupe() {
    renderer.localClippingEnabled = true; const c = etat.coupe, n = [0, 0, 0]; n[c.axe] = c.inverse ? 1 : -1; plan.normal.fromArray(n);
    const b = boiteModele(); const mn = b.min.getComponent(c.axe), mx = b.max.getComponent(c.axe), pos = mn + (mx - mn) * c.position; plan.constant = c.inverse ? -pos : pos;
    modele.traverse(o => { if (o.isMesh) matsDe(o).forEach(m => { m.clippingPlanes = c.actif ? [plan] : null; m.side = c.actif ? THREE.DoubleSide : THREE.FrontSide; m.needsUpdate = true; }); });
  }

  // ── vue éclatée ──
  function remettreAZeroEclate() { for (const [id, b] of eclatBase) { const o = parId(id); if (o) o.position.fromArray(b.repos); } eclatBase.clear(); etat.eclate = 0; }
  function eclater(facteur) {
    const ps = pieces().map(infoPiece); if (ps.length < 2) return { ok: false, raison: 'Il faut au moins 2 pièces pour éclater la vue.' };
    if (!eclatBase.size) { const dec = M.exploser(ps, 1); for (const p of ps) eclatBase.set(p.id, { repos: p.objet.position.toArray(), decalage: dec.get(p.id) }); }
    etat.eclate = Math.max(0, facteur);
    for (const [id, b] of eclatBase) { const o = parId(id); if (!o) continue; const local = o.parent ? new THREE.Vector3(...b.decalage).applyQuaternion(o.parent.getWorldQuaternion(new THREE.Quaternion()).invert()) : new THREE.Vector3(...b.decalage); o.position.set(b.repos[0] + local.x * etat.eclate, b.repos[1] + local.y * etat.eclate, b.repos[2] + local.z * etat.eclate); }
    if (facteur === 0) eclatBase.clear();
    majSelection(); emettre('etat'); return { ok: true, pieces: ps.length };
  }
  /* Assemblage / désassemblage animé : les pièces glissent entre leur position éclatée et leur position de repos. */
  function animerAssemblage(sens = 'assembler', duree = 3) {
    const ps = pieces().map(infoPiece); if (ps.length < 2) return { ok: false, raison: 'Il faut au moins 2 pièces.' };
    if (!eclatBase.size) { const dec = M.exploser(ps, 1); for (const p of ps) eclatBase.set(p.id, { repos: p.objet.position.toArray(), decalage: dec.get(p.id) }); }
    const dec = new Map([...eclatBase].map(([id, b]) => [id, b.decalage])), rep = new Map([...eclatBase].map(([id, b]) => [id, b.repos]));
    lecturePistes = { pistes: M.pistesAssemblage(dec, rep, { sens, duree }), t: 0, fin: () => { if (sens === 'assembler') { eclatBase.clear(); etat.eclate = 0; } else etat.eclate = 1; emettre('etat'); } };
    for (const p of lecturePistes.pistes) { const o = parId(p.cible); if (o) o.position.fromArray(M.evaluerPiste(p, 0)); }
    return { ok: true, duree: M.dureePistes(lecturePistes.pistes) };
  }

  // ── animation : clips glTF, images clés ──
  function lireClip(i, jouer = true) { const c = clips[i]; if (!c) return false; if (jouer) { c.action.reset().play(); } else c.action.stop(); emettre('etat'); return true; }
  const listeClips = () => clips.map((c, i) => ({ i, nom: c.nom, duree: c.duree, joue: c.action.isRunning() }));
  /* Images clés simples : on pose une clé (position, rotation en degrés ou échelle courante) d'une pièce à l'instant t. */
  function poserCle(id, propriete, t) {
    const o = parId(id); if (!o) return false;
    const v = propriete === 'position' ? o.position.toArray() : propriete === 'rotation' ? [o.rotation.x, o.rotation.y, o.rotation.z].map(x => THREE.MathUtils.radToDeg(x)) : o.scale.toArray();
    let p = pistes.find(x => x.cible === id && x.propriete === propriete); if (!p) { p = { cible: id, propriete, cles: [] }; pistes.push(p); }
    p.cles = p.cles.filter(c => Math.abs(c.t - t) > 1e-6); p.cles.push({ t, v, ease: 'doux' }); p.cles.sort((a, b) => a.t - b.t); emettre('pistes'); return true;
  }
  const effacerPistes = () => { pistes = []; lecturePistes = null; emettre('pistes'); };
  const etatPistes = () => ({ pistes: pistes.map(p => ({ cible: p.cible, nom: (parId(p.cible) || {}).name, propriete: p.propriete, cles: p.cles.length })), duree: M.dureePistes(pistes) });
  function lirePistes() { if (!pistes.length) return { ok: false, raison: 'Aucune image clé : pose au moins deux clés sur une pièce.' }; lecturePistes = { pistes, t: 0, fin: null, reprise: true }; return { ok: true, duree: M.dureePistes(pistes) }; }
  function appliquerPiste(p, t) {
    const o = parId(p.cible); if (!o) return; const v = M.evaluerPiste(p, t); if (!v) return;
    if (p.propriete === 'position') o.position.fromArray(v); else if (p.propriete === 'rotation') o.rotation.set(...v.map(x => THREE.MathUtils.degToRad(x))); else o.scale.fromArray(v);
  }

  // ── visites de caméra ──
  function lancerVisite(genre) {
    const b = boiteModele(); if (b.isEmpty()) return { ok: false, raison: 'Aucun modèle à visiter.' };
    const g = genre || M.genreDepuisNom(modele.children.map(o => o.name).join(' ')), bb = { min: b.min.toArray(), max: b.max.toArray(), dim: b.getSize(new THREE.Vector3()).toArray(), centre: b.getCenter(new THREE.Vector3()).toArray() };
    const pts = M.visiteCamera(bb, g); etat.visite = { pts, t: 0, duree: M.dureeTrajet(pts), genre: g, derniereNote: '' }; emettre('etat'); return { ok: true, genre: g, duree: etat.visite.duree };
  }
  function arreterVisite() { if (!etat.visite) return; etat.visite = null; emettre('etat'); }

  // ── présentation pièce par pièce (la voix est fournie par la page : dire(texte) rend une promesse) ──
  let presentationEnCours = null;
  async function presenter({ dire = async () => {}, annule = () => false, unite = null, sansIntro = false } = {}) {
    const ps = M.ordrePresentation(pieces().map(infoPiece)); if (!ps.length) return { ok: false, raison: 'Aucune pièce à présenter.' };
    presentationEnCours = { annule: false }; const stop = () => presentationEnCours.annule || annule();
    remettreAZeroEclate(); toutAfficher(); const nom = modele.children[0] ? modele.children[0].name : 'ce modèle';
    if (!sansIntro) await dire(M.introPresentation(nom, ps.length)); if (stop()) { toutAfficher(); return { ok: true, interrompu: true }; }
    let i = 0;
    for (const p of ps) {
      if (stop()) break; isoler(p.id); selectionner(p.id); cadrer(p.objet, true);
      await attendre(700); await dire(M.textePiece(p, i, ps.length, { unite: unite || etat.unite })); i++;
    }
    const interrompu = stop(); toutAfficher(); selectionner(null); cadrer(modele, true); presentationEnCours = null;
    if (!interrompu) await dire('C’était la dernière pièce.');
    return { ok: true, interrompu, pieces: ps.length };
  }
  const arreterPresentation = () => { if (presentationEnCours) presentationEnCours.annule = true; };

  // ── fabrication paramétrique ──
  function fabriquer(description) {
    const r = M.interpreterDescription(description); if (!r.ok) return r;
    const groupe = new THREE.Group(); groupe.name = 'Fabrication : ' + String(description).slice(0, 40); let x = 0;
    for (const p of r.pieces) {
      const f = M.construireForme(p), geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(f.positions, 3)); geo.setIndex(new THREE.BufferAttribute(f.index, 1)); geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: p.couleur || 0xb8c2cc, metalness: 0.3, roughness: 0.45 })); mesh.name = p.nom; mesh.castShadow = etat.ombres; mesh.receiveShadow = true; mesh.userData.parametrique = p;
      geo.computeBoundingBox(); const bx = geo.boundingBox; mesh.position.x = x - bx.min.x; if (p.type === 'mat') mesh.position.y = 0; x += (bx.max.x - bx.min.x) * 1.15 + 0.02; groupe.add(mesh);
    }
    if (r.pieces.some(p => p.type === 'coque') && r.pieces.some(p => p.type === 'mat')) { const coque = groupe.children.find(o => o.userData.parametrique.type === 'coque'), mat = groupe.children.find(o => o.userData.parametrique.type === 'mat'); mat.position.set(coque.position.x + (coque.userData.parametrique.params.longueur * 0.05), coque.userData.parametrique.params.francBord, 0); }
    groupe.userData.fabrique = true; modele.add(groupe); remettreAZeroEclate(); mettreAJourDecor(); cadrer(groupe); emettre('modele'); return { ...r, groupe: groupe.uuid };
  }

  // ── export, impression ──
  function telecharger(blob, nom) { const a = document.createElement('a'), u = URL.createObjectURL(blob); a.href = u; a.download = nom; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
  async function exporter(format, { echelleSTL = 1, selection = null, nom = null, telechargement = true } = {}) {
    const base = nom || (modele.children[0] && modele.children[0].name) || 'maquette'; let blob, fichier;
    if (format === 'glb') {
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js'), cible = selection ? parId(selection) : modele; if (!cible) throw new Error('pièce introuvable');
      // les fiches d'attribution (userData.attribution des modèles importés) voyagent dans les « extras » des nœuds du GLB
      const res = await new GLTFExporter().parseAsync(cible, { binary: true, onlyVisible: true, animations: [] });
      blob = new Blob([res], { type: 'model/gltf-binary' }); fichier = base + '.glb';
    } else if (format === 'stl' || format === 'obj') {
      const m = maillageDe(selection); if (!m) throw new Error('Aucun maillage visible à exporter.');
      if (format === 'stl') { blob = new Blob([M.exporterSTLBinaire(m, { echelle: echelleSTL, nom: base })], { type: 'model/stl' }); fichier = base + '.stl'; }
      else { blob = new Blob([M.exporterOBJ(m, { nom: base, echelle: echelleSTL })], { type: 'text/plain' }); fichier = base + '.obj'; }
    } else throw new Error('Format d’export inconnu : ' + format);
    if (telechargement) telecharger(blob, fichier); return { blob, fichier, octets: blob.size };
  }
  function controleImpression(id = null) {
    const m = maillageDe(id); if (!m) return { ok: false, raison: 'Aucun maillage visible.' };
    const r = M.verifierImpression(m); return { ok: true, ...r, hypotheses: M.hypothesesEchelle(m), attention: 'Un modèle importé peut avoir plusieurs pièces séparées : l’étanchéité est évaluée sur l’ensemble visible.' };
  }
  function fichesAttribution() { const l = []; modele.children.forEach(g => { if (g.userData.attribution) l.push({ modele: g.name, ...g.userData.attribution }); }); return l; }

  // ── boucle ──
  const tmp = new THREE.Vector3();
  function maj(dt) {
    for (const mx of mixers) mx.update(dt);
    if (lecturePistes) {
      lecturePistes.t += dt; const fin = M.dureePistes(lecturePistes.pistes); for (const p of lecturePistes.pistes) appliquerPiste(p, lecturePistes.t);
      majSelection(); if (lecturePistes.t >= fin + 0.05) { const f = lecturePistes.fin; lecturePistes = null; if (f) f(); }
    }
    if (ctrl.cibleVisee) { const c = ctrl.cibleVisee; c.t = Math.min(1, c.t + dt / 0.8); const u = c.t * c.t * (3 - 2 * c.t); ctrl.cible.lerpVectors(c.c0, c.c, u); ctrl.dist = c.d0 + (c.dist - c.d0) * u; if (c.t >= 1) ctrl.cibleVisee = null; }
    if (etat.visite) {
      const v = etat.visite; v.t += dt; const e = M.echantillonnerTrajet(v.pts, (v.t / v.duree) % 1.0001); if (v.t >= v.duree) { etat.visite = null; emettre('etat'); }
      else { camera.position.fromArray(e.pos); camera.lookAt(tmp.fromArray(e.cible)); const idx = M.echantillonnerTrajet(v.pts, v.t / v.duree).indice, note = v.pts[idx] && v.pts[idx].texte; if (note && note !== v.derniereNote) { v.derniereNote = note; emettre('visite', note); } return; }
    }
    if (etat.tourAuto) ctrl.az += dt * 0.25;
    appliquerCamera();
  }
  function dispose() {
    arreterVisite(); effacerMesure(); selectionner(null); modele.traverse(o => { if (o.isMesh) { o.geometry.dispose(); matsDe(o).forEach(x => x.dispose && x.dispose()); } });
    scene.clear(); mixers.length = 0; clips.length = 0; if (pmrem) pmrem.dispose(); if (chargeurs) { chargeurs.draco.dispose(); chargeurs.ktx2.dispose(); }
    renderer.localClippingEnabled = false;
  }
  appliquerCamera(); mettreAJourDecor();
  return { scene, camera, modele, etat, pret, sur, maj, dispose, dimensionner, cadrer, souris, regler, chargerHDRI, importer, arbre, pieces: () => pieces().map(infoPiece), parId, selectionner, clic, parNom, afficher, isoler, toutAfficher, renommer, couleur, materiau, deplacer, tourner, echelle, supprimer, dupliquer, symetrie,
    effacerMesure, milieuMesure, derniereMesure: () => derniereMesure, circonference, eclater, animerAssemblage, lireClip, listeClips, poserCle, effacerPistes, etatPistes, lirePistes, lancerVisite, arreterVisite, presenter, arreterPresentation, fabriquer, exporter, controleImpression, fichesAttribution,
    stats: () => { const c = compter(modele); return { ...c, pieces: pieces().length }; }, maillageDe, formatsPris: EXTENSIONS };
}
