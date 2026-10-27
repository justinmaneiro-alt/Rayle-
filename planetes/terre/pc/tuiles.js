import * as THREE from 'three';
import { cle, tuileLargeurKm, tuileDe, tuileCentre, R } from './geo.js';
import { selectionner, couper, aCharger } from './quadtree.js';
import { zMaxLocal, SOURCES_REGIONALES } from './imagerie-regionale.js';
import { lonDeX, latDeY } from './geo.js';
import { construireTuile } from './geometrie-tuile.js';
import * as src from './sources.js';
import { tuileRadar } from './radar.js';
import { TUILE_VERT, TUILE_FRAG, BAT_VERT, BAT_FRAG } from './shaders-terre.js';

/* ═════════════ GESTIONNAIRE DE TUILES ═════════════
   Choisit les tuiles visibles (quadtree), les fait charger par les Workers (image, relief, calque vectoriel), crée leurs textures sans
   jamais dépasser un petit budget par image, affiche chaque tuile avec son parent tant que ses enfants ne sont pas prêts, et libère
   les plus anciennes quand la mémoire visée est atteinte. Les ressources partagées (un relief sert 16 tuiles) sont comptées en références. */
const Z_MIN = 3, DUREE_FONDU = 260;   // ms : fondu entre niveaux de détail (tramage, sans trou)
export const PROFILS = {
  haute:   { grille: 32, pixelsMax: 300, tuiles: 460, vramMax: 800, zMax: 18, aniso: 8, simultanees: 10, budgetMs: 3.5 },
  moyenne: { grille: 24, pixelsMax: 560, tuiles: 220, vramMax: 380, zMax: 16, aniso: 4, simultanees: 8, budgetMs: 3 },
  basse:   { grille: 16, pixelsMax: 800, tuiles: 110, vramMax: 200, zMax: 14, aniso: 2, simultanees: 6, budgetMs: 2.5 }
};

export function creerTuiles({ scene, chargeur, partages, lire, modeleVecteur, renderer, ombres = null }) {
  const tuiles = new Map(), ressources = new Map();
  const vide4 = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1), videR = new THREE.DataTexture(new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType);
  vide4.needsUpdate = true; videR.needsUpdate = true;
  const flottantLineaire = renderer.extensions.has('OES_texture_float_linear');
  const groupe = new THREE.Group(); groupe.name = 'tuiles'; scene.add(groupe);
  const groupeBat = new THREE.Group(); groupeBat.name = 'batiments'; scene.add(groupeBat);
  const sortants = new Set();                    // tuiles encore dessinées pendant leur fondu de sortie
  const radar = { index: null, rang: 0 };       // images radar connues et image affichée (voir definirRadar)
  const AUCUN = { clef: '-', refs: 1e9, etat: 2, valeur: null, promesse: null, octets: 0, t2: 0 };   // « pas de calque » (pas d'adresse vectorielle)
  let dernierArgs = null, image = 0, derniereSelection = 0, dernierePose = null, affichage = [], aTraiter = [], vram = 0, sale = true, feuillesCourantes = null;
  const stats = { feuilles: 0, affichees: 0, enAttente: 0, tuiles: 0, batiments: 0, erreurs: 0 };

  /* ── ressources partagées ── */
  function ressource(clef, fabriquer) {
    let r = ressources.get(clef);
    if (!r) { r = { clef, refs: 0, etat: 0, valeur: null, promesse: null, octets: 0, t2: 0 }; ressources.set(clef, r); fabriquer(r); }
    return r;
  }
  function liberer(r) {
    if (--r.refs > 0) return;
    if (r.promesse && r.etat === 0 && r.promesse.annuler) r.promesse.annuler();
    if (r.valeur) { for (const k of ['tex', 'texA']) if (r.valeur[k]) r.valeur[k].dispose(); }
    vram -= r.octets; ressources.delete(r.clef);
  }
  const texImage = (bitmap, { srgb, aniso, prem }) => {
    const t = new THREE.Texture(bitmap);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.flipY = false; t.premultiplyAlpha = !!prem;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = aniso;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.onUpdate = () => { try { bitmap.close(); } catch (e) {} };
    t.needsUpdate = true; return t;
  };

  function demandeImage(t, prio) {
    const cands = src.imagerieCandidats(t.z, t.x, t.y, { eox: lire().eox, jour: lire().nuagesReels ? lire().jourImagerie : null, regional: lire().eox !== false && lire().regional !== false });
    t.imgCands = cands; t.imgRect = cands[cands.length - 1].rect;
    return acquerir(t, 'img', 'img|' + cands.map(c => c.url).join('>'), r => {
      r.promesse = chargeur.demander({ type: 'image', url: cands[cands.length - 1].url, candidats: cands.map(c => ({ url: c.url, source: c.source, zSource: c.zSource, xs: c.xs, ys: c.ys, regional: !!c.regional })) }, prio);
      r.promesse.then(rep => aTraiter.push({ r, rep, type: 'img' })).catch(() => { r.etat = 2; r.t2 = performance.now(); sale = true; });
    });
  }
  function demandeRelief(t, prio) {
    const cands = src.reliefCandidats(t.z, t.x, t.y);
    t.relCands = cands; t.relRect = cands[0].rect;
    return acquerir(t, 'rel', 'rel|' + cands.map(c => c.url).join('>'), r => {
      r.promesse = chargeur.demander({ type: 'relief', url: cands[cands.length - 1].url, candidats: cands.map(c => ({ url: c.url, source: c.source, zSource: c.zSource, xs: c.xs, ys: c.ys })) }, prio);
      r.promesse.then(rep => aTraiter.push({ r, rep, type: 'rel' })).catch(() => { r.etat = 2; r.t2 = performance.now(); sale = true; });
    });
  }
  function demandeVecteur(t, prio) {
    const modele = modeleVecteur(); if (!modele) { t.vec = AUCUN; return; }
    const v = src.vecteur(modele, t.z, t.x, t.y), avecB = t.z >= 15 && lire().batiments, ortho = !!(t.imgCands && t.imgCands[0].regional);
    t.vecRect = v.rect; t.uniforms.uOrtho.value = ortho ? 1 : 0;
    const taille = t.z >= 13 ? 512 : t.z >= 10 ? 384 : 256;
    return acquerir(t, 'vec', 'vec|' + v.url + '|' + (t.z > 14 ? t.cle : '') + '|' + taille + '|' + (avecB ? 1 : 0) + (ortho ? 'o' : ''), r => {
      r.promesse = chargeur.demander({ type: 'vecteur', url: v.url, z: t.z, x: t.x, y: t.y, zs: v.zSource, xs: t.x >> (t.z - v.zSource), ys: t.y >> (t.z - v.zSource), rect: v.rect, taille, batiments: avecB, batiments2D: !avecB, sansSurfaces: ortho, lat: tuileCentre(t.z, t.x, t.y).lat }, prio);
      r.promesse.then(rep => aTraiter.push({ r, rep, type: 'vec' })).catch(() => { r.etat = 2; r.t2 = performance.now(); sale = true; });
    });
  }
  function acquerir(t, champ, clef, fabriquer) {
    const r = ressource(clef, fabriquer); r.refs++; t[champ] = r; return r;
  }

  /* ── création / destruction d'une tuile ── */
  function creer(z, x, y) {
    const p = PROFILS[lire().profil] || PROFILS.haute, g = construireTuile(z, x, y, p.grille);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(g.position, 3)); geo.setAttribute('aRad', new THREE.BufferAttribute(g.rad, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(g.uv, 2)); geo.setAttribute('aJupe', new THREE.BufferAttribute(g.jupe, 1));
    geo.setIndex(new THREE.BufferAttribute(g.index, 1));
    const uniforms = {
      ...partages,
      uImg: { value: vide4 }, uImgR: { value: new THREE.Vector3(0, 0, 1) }, uImgOk: { value: 0 },
      uRel: { value: videR }, uRelR: { value: new THREE.Vector3(0, 0, 1) }, uRelOk: { value: 0 }, uRelN: { value: 256 },
      uVec: { value: vide4 }, uVecR: { value: new THREE.Vector3(0, 0, 1) }, uVecOk: { value: 0 },
      uRad: { value: vide4 }, uRadR: { value: new THREE.Vector3(0, 0, 1) }, uRadOk: { value: 0 },
      uTuile: { value: new THREE.Vector4(z, x, y, tuileLargeurKm(z, x, y)) },
      uFondu: { value: 1 }, uSens: { value: 0 }, uOrtho: { value: 0 }, uImgZ: { value: 8 }
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: TUILE_VERT, fragmentShader: TUILE_FRAG, uniforms, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.visible = false; mesh.matrixAutoUpdate = false;
    groupe.add(mesh);
    const t = { z, x, y, cle: cle(z, x, y), centre: g.centre, geo, mat, mesh, img: null, rel: null, vec: null, rad: null, radNouv: null, radRang: -1, radRect: [0, 0, 1], imgRect: [0, 0, 1], relRect: [0, 0, 1], vecRect: [0, 0, 1], usage: image, cree: performance.now(), bat: null, batEssaye: false, lieux: [], uniforms, fondu: null };
    tuiles.set(t.cle, t);
    return t;
  }
  function detruire(t) {
    groupe.remove(t.mesh); t.geo.dispose(); t.mat.dispose();
    if (t.bat) { groupeBat.remove(t.bat); t.bat.geometry.dispose(); t.bat.material.dispose(); }
    if (t.batOmbre) { ombres.groupe.remove(t.batOmbre); t.batOmbre.material.dispose(); t.batOmbre = null; }
    for (const k of ['img', 'rel', 'vec', 'rad', 'radNouv']) if (t[k] && t[k] !== AUCUN) liberer(t[k]);
    tuiles.delete(t.cle);
  }

  /* ── intégration des résultats des Workers dans des textures (budget par image) ── */
  function integrer(budgetMs) {
    const debut = performance.now(), p = PROFILS[lire().profil] || PROFILS.haute;
    while (aTraiter.length && performance.now() - debut < budgetMs) {
      const { r, rep, type, radar: radarOui } = aTraiter.shift();
      if (ressources.get(r.clef) !== r || r.refs <= 0) { if (rep.bitmap) rep.bitmap.close(); continue; }
      try {
        if (type === 'img') { r.valeur = { tex: texImage(rep.bitmap, { srgb: true, aniso: radarOui ? 1 : p.aniso }), utilise: rep.utilise || 0 }; r.octets = 256 * 256 * 4 * 1.33; }
        else if (type === 'rel') {
          const tex = new THREE.DataTexture(new Float32Array(rep.hauteurs), rep.w, rep.h, THREE.RedFormat, THREE.FloatType);
          tex.minFilter = tex.magFilter = flottantLineaire ? THREE.LinearFilter : THREE.NearestFilter; tex.generateMipmaps = false;
          tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
          r.valeur = { tex, w: rep.w, h: rep.h, min: rep.min, max: rep.max, utilise: rep.utilise || 0 }; r.octets = rep.w * rep.h * 4;
        } else {
          const taille = rep.bitmap.width;
          r.valeur = { tex: texImage(rep.bitmap, { srgb: false, aniso: p.aniso, prem: true }), lieux: rep.lieux || [], bat: rep.batiments || null };
          r.octets = taille * taille * 4 * 1.33;
        }
        r.etat = 1; vram += r.octets; sale = true;
      } catch (e) { console.error('[terre] texture :', e); r.etat = 2; }
    }
  }
  /* Branche sur chaque tuile les ressources arrivées. */
  function brancher(t) {
    if (t.img && t.img.etat === 1 && t.uniforms.uImgOk.value === 0) { const c = t.imgCands[t.img.valeur.utilise] || t.imgCands[t.imgCands.length - 1]; t.imgRect = c.rect; t.imgSource = c.source; t.uniforms.uImgZ.value = c.zSource; t.uniforms.uImg.value = t.img.valeur.tex; t.uniforms.uImgR.value.set(...c.rect); t.uniforms.uImgOk.value = 1; }
    if (t.rel && t.rel.etat === 1 && t.uniforms.uRelOk.value === 0) { const c = t.relCands[t.rel.valeur.utilise] || t.relCands[0]; t.relRect = c.rect; t.uniforms.uRel.value = t.rel.valeur.tex; t.uniforms.uRelR.value.set(...c.rect); t.uniforms.uRelN.value = t.rel.valeur.w; t.uniforms.uRelOk.value = 1; }
    if (t.vec && t.vec.etat === 1 && t.uniforms.uVecOk.value === 0) { t.uniforms.uVec.value = t.vec.valeur.tex; t.uniforms.uVecR.value.set(0, 0, 1); t.uniforms.uVecOk.value = 1; t.lieux = t.vec.valeur.lieux; }  /* le Worker a déjà découpé le sous-rectangle : la texture couvre exactement la tuile (l'appliquer deux fois agrandissait et décalait le plan au-delà du niveau 14) */
  }
  /* Une tuile s'affiche quand son image et son relief sont arrivés (ou ont échoué) ET que son calque vectoriel a suivi : sans cela, des tuiles nues
     voisineraient des tuiles tracées (effet de damier). Au bout de 2,5 s, le calque en retard n'empêche plus l'affichage. */
  /* Radar : l'image de la tuile suit le rang courant ; la nouvelle image remplace l'ancienne seulement quand elle est arrivée (pas de scintillement). */
  function majRadar(t) {
    const actif = lire().radar && radar.index && t.z <= 11;
    if (!actif) { if (t.uniforms.uRadOk.value) t.uniforms.uRadOk.value = 0; if (t.rad) { liberer(t.rad); t.rad = null; } if (t.radNouv) { liberer(t.radNouv); t.radNouv = null; } t.radRang = -1; return; }
    if (t.radNouv && t.radNouv.etat !== 0) {
      if (t.radNouv.etat === 1) { if (t.rad) liberer(t.rad); t.rad = t.radNouv; t.uniforms.uRad.value = t.rad.valeur.tex; t.uniforms.uRadR.value.set(...t.radRect); t.uniforms.uRadOk.value = 1; }
      else { liberer(t.radNouv); if (t.rad) { liberer(t.rad); t.rad = null; } t.uniforms.uRadOk.value = 0; }       // pas d'écho pour cette zone
      t.radNouv = null;
    }
    if (t.radRang !== radar.rang && !t.radNouv) {
      const tr = tuileRadar(radar.index, radar.rang, t.z, t.x, t.y);
      t.radRect = tr.rect; t.radRang = radar.rang;
      t.radNouv = acquerir(t, 'radNouv', 'rad|' + tr.url, r => {
        r.promesse = chargeur.demander({ type: 'image', url: tr.url, radar: true }, 5e5);
        r.promesse.then(rep => aTraiter.push({ r, rep, type: 'img', radar: true })).catch(() => { r.etat = 2; r.t2 = performance.now(); sale = true; });
      });
      if (t.radNouv.etat !== 0) sale = true;
    }
  }
  const pret = t => !!t && !!t.img && !!t.rel && t.img.etat !== 0 && t.rel.etat !== 0 && (!t.vec || t.vec.etat !== 0 || performance.now() - t.cree > 2500);

  function batiments(t) {
    if (t.bat || t.batEssaye || !t.vec || t.vec.etat !== 1 || !lire().batiments || t.z < 15) return;
    t.batEssaye = true;
    const b = t.vec.valeur.bat; if (!b || !b.n) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(b.pos, 3)); geo.setAttribute('aRad', new THREE.BufferAttribute(b.rad, 3));
    geo.setAttribute('aNorm', new THREE.BufferAttribute(b.nrm, 3)); geo.setAttribute('aUvc', new THREE.BufferAttribute(b.uvc, 2)); geo.setAttribute('aH', new THREE.BufferAttribute(b.h, 1));
    geo.setIndex(new THREE.BufferAttribute(b.idx, 1));
    const mat = new THREE.ShaderMaterial({ vertexShader: BAT_VERT, fragmentShader: BAT_FRAG, side: THREE.DoubleSide,
      uniforms: { uSoleil: partages.uSoleil, uExag: partages.uExag, uHaze: partages.uHaze, uLumieres: partages.uLumieres, uOmbre: partages.uOmbre, uOmbreM: partages.uOmbreM, uOmbreOn: partages.uOmbreOn, uRel: t.uniforms.uRel, uRelR: t.uniforms.uRelR, uRelOk: t.uniforms.uRelOk } });
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.matrixAutoUpdate = false; m.visible = false;
    groupeBat.add(m); t.bat = m; stats.batiments++;
    if (ombres) {                                   // même maillage, matériau « profondeur seule », dessiné dans la carte d'ombres du Soleil
      const mo = new THREE.Mesh(geo, ombres.materiau({ uExag: partages.uExag, uHaze: partages.uHaze, uRel: t.uniforms.uRel, uRelR: t.uniforms.uRelR, uRelOk: t.uniforms.uRelOk }));
      mo.frustumCulled = false; mo.matrixAutoUpdate = false; mo.visible = false; ombres.groupe.add(mo); t.batOmbre = mo;
    }
  }

  /* ── altitude du sol (km) en un point, d'après le relief déjà chargé le plus fin ── */
  function altitudeSol(lon, lat) {
    for (let z = 14; z >= Z_MIN; z--) {
      const k = tuileDe(lon, lat, z), t = tuiles.get(cle(z, k.x, k.y));
      if (!t || !t.rel || t.rel.etat !== 1) continue;
      const v = t.rel.valeur, u = (lon + 180) / 360 * 2 ** z - k.x, w = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z - k.y;
      const su = (t.relRect[0] + u * t.relRect[2]) * v.w - 0.5, sv = (t.relRect[1] + w * t.relRect[2]) * v.h - 0.5;
      const x0 = Math.max(0, Math.min(v.w - 1, Math.floor(su))), y0 = Math.max(0, Math.min(v.h - 1, Math.floor(sv))), x1 = Math.min(v.w - 1, x0 + 1), y1 = Math.min(v.h - 1, y0 + 1);
      const fx = Math.max(0, Math.min(1, su - x0)), fy = Math.max(0, Math.min(1, sv - y0)), H = v.tex.image.data;
      const h = (H[y0 * v.w + x0] * (1 - fx) + H[y0 * v.w + x1] * fx) * (1 - fy) + (H[y1 * v.w + x0] * (1 - fx) + H[y1 * v.w + x1] * fx) * fy;
      return Math.max(h, 0) / 1000;
    }
    return 0;
  }

  /* ── mise à jour à chaque image ── */
  function maj(pose, { fov, aspect, hauteurEcran, hTerrain = 0 }) {
    image++;
    const p = PROFILS[lire().profil] || PROFILS.haute, cam = pose.cam;
    integrer(p.budgetMs);
    const maintenant = performance.now();
    const bouge = !dernierePose || Math.hypot(cam[0] - dernierePose[0], cam[1] - dernierePose[1], cam[2] - dernierePose[2]) > Math.max(0.002, pose.altitude * 0.004);
    if (maintenant - derniereSelection > (bouge ? 70 : 400) || (sale && maintenant - derniereSelection > 30)) {
      derniereSelection = maintenant; dernierePose = cam.slice();
      dernierArgs = { cam: cam.slice(), avant: pose.avant, droite: pose.droite, haut: pose.haut, fov, aspect, hauteurEcran, altitude: pose.altitude };
      const feuilles = selectionner({ cam, avant: pose.avant, droite: pose.droite, haut: pose.haut, fov, aspect, hauteurEcran, zMax: p.zMax, zMin: Z_MIN, pixelsMax: p.pixelsMax, maxTuiles: p.tuiles, hTerrain, limiteZ: (z, x, y) => zMaxLocal(lonDeX(x + 0.5, z), latDeY(y + 0.5, z), { zMaxProfil: p.zMax, zMaxSentinel: Math.min(16, p.zMax), sources: src.EN_TEST || lire().regional === false ? [] : SOURCES_REGIONALES }) });
      stats.feuilles = feuilles.length;
      const besoin = aCharger(feuilles, Z_MIN), voulues = new Set();
      let nouvelles = 0;
      for (const n of besoin) {
        const k = cle(n.z, n.x, n.y); voulues.add(k);
        let t = tuiles.get(k);
        if (!t) { if (nouvelles >= 60) continue; t = creer(n.z, n.x, n.y); nouvelles++; }
        t.usage = image;
        for (const c of ['img', 'rel', 'vec']) { const r = t[c]; if (r && r !== AUCUN && r.etat === 2 && maintenant - r.t2 > 15000) { liberer(r); t[c] = null; } }   // nouvel essai après une panne
        const prio = n.z * 1e6 + n.d;
        if (!t.img) demandeImage(t, prio); else if (t.img.etat === 0 && t.img.promesse && t.img.promesse.changerPriorite) t.img.promesse.changerPriorite(prio);
        if (!t.rel) demandeRelief(t, prio); else if (t.rel.etat === 0 && t.rel.promesse && t.rel.promesse.changerPriorite) t.rel.promesse.changerPriorite(prio);
        if (!t.vec) demandeVecteur(t, prio + 0.5e6); else if (t.vec.etat === 0 && t.vec.promesse && t.vec.promesse.changerPriorite) t.vec.promesse.changerPriorite(prio + 0.5e6);
      }
      // demandes devenues inutiles : on annule celles qui n'ont pas encore commencé, la tuile pourra être redemandée plus tard
      for (const t of tuiles.values()) {
        if (voulues.has(t.cle)) continue;
        for (const c of ['img', 'rel', 'vec']) { const r = t[c]; if (r && r !== AUCUN && r.etat === 0 && r.promesse && r.refs === 1 && r.promesse.annuler) { r.promesse.annuler(); liberer(r); t[c] = null; } }
      }
      // mémoire : on libère les plus anciennes non utilisées
      if (tuiles.size > p.tuiles || vram > p.vramMax * 1048576) {
        const anciennes = [...tuiles.values()].filter(t => t.usage < image - 30 && !voulues.has(t.cle)).sort((a, b) => a.usage - b.usage);
        for (const t of anciennes) { if (tuiles.size <= p.tuiles * 0.9 && vram <= p.vramMax * 1048576 * 0.9) break; detruire(t); }
      }
      sale = true; derniereSelection = performance.now();
      feuillesCourantes = feuilles;
    }
    if (radar.index && lire().radar) for (const t of affichage) if (t.radNouv && t.radNouv.etat !== 0) sale = true;
    for (const t of tuiles.values()) if ((t.img && t.img.etat === 1 && t.uniforms.uImgOk.value === 0) || (t.rel && t.rel.etat === 1 && t.uniforms.uRelOk.value === 0) || (t.vec && t.vec.etat === 1 && t.uniforms.uVecOk.value === 0)) brancher(t);
    if (sale && feuillesCourantes) {
      sale = false;
      const liste = couper(feuillesCourantes, (z, x, y) => pret(tuiles.get(cle(z, x, y))), Z_MIN);
      const visibles = new Set(liste.map(l => cle(l.z, l.x, l.y)));
      const avant = new Set(affichage.map(t => t.cle)), maintenantF = performance.now();
      const duree = lire().fondu === false ? 0 : DUREE_FONDU;
      for (const t of tuiles.values()) {
        const v = visibles.has(t.cle);
        if (duree && avant.size && v && !avant.has(t.cle)) { t.fondu = { debut: maintenantF, sens: 1 }; sortants.delete(t.cle); }   // nouvelle venue : fondu d'entrée
        else if (duree && !v && avant.has(t.cle) && t.mesh.visible) { t.fondu = { debut: maintenantF, sens: -1 }; sortants.add(t.cle); }   // partante : reste affichée le temps du fondu
        else if (v && t.fondu && t.fondu.sens < 0) { t.fondu = null; sortants.delete(t.cle); t.uniforms.uSens.value = 0; t.uniforms.uFondu.value = 1; }   // revenue avant la fin de son fondu de sortie : de nouveau opaque
        else if (!v && t.fondu && t.fondu.sens > 0) { t.fondu = null; t.uniforms.uSens.value = 0; t.uniforms.uFondu.value = 1; }
        t.mesh.visible = v || sortants.has(t.cle);
        if (v) { t.usage = image; batiments(t); }
        majRadar(t);
        if (t.bat) { t.bat.visible = v; if (t.batOmbre) t.batOmbre.visible = v; }
      }
      affichage = liste.map(l => tuiles.get(cle(l.z, l.x, l.y))).filter(Boolean);
      for (const k of sortants) { const t = tuiles.get(k); if (!t) sortants.delete(k); }
      stats.affichees = affichage.length;
    }
    // fondus : avancement, puis fin (la partante disparaît, l'entrante devient opaque)
    if (sortants.size || affichage.some(t => t.fondu)) {
      const maintenantF = performance.now(), duree = DUREE_FONDU;
      for (const t of [...affichage, ...[...sortants].map(k => tuiles.get(k)).filter(Boolean)]) {
        if (!t.fondu) continue;
        const p = Math.min(1, (maintenantF - t.fondu.debut) / duree);
        if (p >= 1) {
          if (t.fondu.sens < 0) { t.mesh.visible = false; sortants.delete(t.cle); }
          t.fondu = null; t.uniforms.uSens.value = 0; t.uniforms.uFondu.value = 1;
        } else { t.uniforms.uSens.value = t.fondu.sens; t.uniforms.uFondu.value = p; }
      }
    }
    // positions relatives à la caméra (double précision côté JS)
    for (const k of sortants) { const t = tuiles.get(k); if (t) { const c = t.centre; t.mesh.position.set(c[0] - cam[0], c[1] - cam[1], c[2] - cam[2]); t.mesh.updateMatrix(); } }
    for (const t of affichage) {
      const c = t.centre;
      t.mesh.position.set(c[0] - cam[0], c[1] - cam[1], c[2] - cam[2]); t.mesh.updateMatrix();
      if (t.bat) { t.bat.position.copy(t.mesh.position); t.bat.updateMatrix(); if (t.batOmbre) { t.batOmbre.position.copy(t.mesh.position); t.batOmbre.updateMatrix(); } }
    }
    stats.tuiles = tuiles.size; stats.enAttente = chargeur.etat().enFile + chargeur.etat().actives;
  }

  return {
    maj, altitudeSol, stats, groupe,
    affichage: () => affichage,
    vram: () => vram,
    /* diagnostic : état des feuilles voulues et de leurs ancêtres (tests et audit) */
    diagnostic() {
      const hz = {}; for (const l of feuillesCourantes || []) hz[l.z] = (hz[l.z] || 0) + 1; const f = (feuillesCourantes || []).slice(0, 12).map(l => { const t = tuiles.get(cle(l.z, l.x, l.y)); return { z: l.z, x: l.x, y: l.y, existe: !!t, img: t && t.img ? t.img.etat : null, rel: t && t.rel ? t.rel.etat : null, vec: t && t.vec ? (t.vec === AUCUN ? 'aucun' : t.vec.etat) : null }; });
      const z3 = [...tuiles.values()].filter(t => t.z === 3).map(t => ({ k: t.cle, img: t.img ? t.img.etat : null, rel: t.rel ? t.rel.etat : null, vec: t.vec ? t.vec.etat : null }));
      // trous : feuilles voulues sans aucune tuile affichée dessus (ni elle-même, ni un ancêtre, ni un descendant)
      const aff = new Set(affichage.map(t => t.cle)), desc = new Set();
      for (const t of affichage) for (let z = t.z - 1, x = t.x >> 1, y = t.y >> 1; z >= 0; z--, x >>= 1, y >>= 1) desc.add(cle(z, x, y));
      let trous = 0;
      for (const l of feuillesCourantes || []) {
        let couvert = aff.has(cle(l.z, l.x, l.y)) || desc.has(cle(l.z, l.x, l.y));
        for (let z = l.z - 1, x = l.x >> 1, y = l.y >> 1; !couvert && z >= Z_MIN; z--, x >>= 1, y >>= 1) couvert = aff.has(cle(z, x, y));
        if (!couvert && l.z >= Z_MIN) trous++;
      }
      const echecs = affichage.filter(t => (t.img && t.img.etat === 2) || (t.rel && t.rel.etat === 2)).map(t => ({ k: t.cle, img: t.img && t.img.etat, rel: t.rel && t.rel.etat, imgOk: t.uniforms.uImgOk.value, u: t.imgCands && t.imgCands.map(c => c.source + c.zSource) }));
      const prox = affichage.map(t => ({ k: t.cle, src: t.imgSource, ir: t.imgRect && t.imgRect.map(v => +v.toFixed(3)), rr: t.relRect && t.relRect.map(v => +v.toFixed(3)), okI: t.uniforms.uImgOk.value, okR: t.uniforms.uRelOk.value, okV: t.uniforms.uVecOk.value, vis: t.mesh.visible, fo: t.uniforms.uFondu.value, se: t.uniforms.uSens.value, d: Math.hypot(t.centre[0] - (dernierArgs ? dernierArgs.cam[0] : 0), t.centre[1] - (dernierArgs ? dernierArgs.cam[1] : 0), t.centre[2] - (dernierArgs ? dernierArgs.cam[2] : 0)) })).sort((a, b) => a.d - b.d).slice(0, 8);
      const tous = affichage.map(t => t.cle + ' ' + (t.imgSource || '-') + ' i' + t.uniforms.uImgOk.value + ' r' + t.uniforms.uRelOk.value + ' v' + t.uniforms.uVecOk.value + ' e' + (t.img ? t.img.etat : '?') + (t.rel ? t.rel.etat : '?') + ' h' + (t.rel && t.rel.valeur ? Math.round(t.rel.valeur.min) + '/' + Math.round(t.rel.valeur.max) : ''));
      return { feuilles: (feuillesCourantes || []).length, hz, tous, prox, echecs, f, z3, args: dernierArgs, trous, vramMax: (PROFILS[lire().profil] || PROFILS.haute).vramMax };
    },
    /* sources d'imagerie régionales actuellement à l'écran : [id…] (crédits affichés dans l'interface) */
    sourcesAffichees() { const s = new Set(); for (const t of affichage) if (t.imgSource && t.imgSource !== 'eox' && t.imgSource !== 'gibs' && t.imgSource !== 'viirs') s.add(t.imgSource); return [...s]; },
    sourcesRelief() { const s = new Set(); for (const t of affichage) if (t.rel && t.rel.etat === 1 && t.relCands) s.add(t.relCands[t.rel.valeur.utilise || 0].source); return [...s]; },
    niveauMax() { return affichage.reduce((m, t) => Math.max(m, t.z), 0); },
    forcer() { sale = true; derniereSelection = 0; },
    /* index : images radar (voir radar.js) ou null ; rang : image affichée. Tout changement est appliqué à la prochaine image. */
    definirRadar(index, rang) { radar.index = index; radar.rang = rang; sale = true; },
    radarEtat: () => ({ index: !!radar.index, rang: radar.rang, tuiles: affichage.filter(t => t.uniforms.uRadOk.value === 1).length }),
    /* Réglage changé (imagerie, bâtiments, qualité) : tout est reconstruit à la prochaine image. */
    vider() { sortants.clear(); for (const t of [...tuiles.values()]) detruire(t); affichage = []; aTraiter = []; sale = true; derniereSelection = 0; dernierePose = null; feuillesCourantes = null; },
    arreter() { this.vider(); vide4.dispose(); videR.dispose(); scene.remove(groupe); scene.remove(groupeBat); }
  };
}
