/* ═════════════ MODÈLES GLB OPTIONNELS ═════════════
   Si ui/assets/anatomie/manifest.json existe, chaque structure qu'il liste est chargée depuis son fichier GLB à la place de la forme procédurale
   (qui reste le repli : l'application fonctionne sans aucun fichier 3D). Une entrée est soit un nom de fichier, soit un objet :
       { "humerus": "humerus.glb",
         "crane":   { "fichier": "crane.glb", "echelle": 1, "decalage": [0, 1.62, 0], "rotation": [0, 0, 0],
                      "licence": "CC0-1.0", "source": "https://…", "auteur": "…" } }                 (clés = identifiants de base, voir registre.js)
   « echelle » (nombre ou [x, y, z]), « decalage » (mètres) et « rotation » (degrés, ordre XYZ) recalent un modèle exprimé dans un autre repère.
   Sans transformation, le GLB doit être dans le repère de l'application : mètres, y vers le haut, face vers +z, pieds au sol, structures du côté GAUCHE (x > 0) ;
   le côté droit est obtenu par miroir. Les matériaux du GLB sont remplacés par ceux de l'application (couleurs, surbrillance, coupes d'amputation).

   Atlas : un seul GLB aux nœuds nommés peut habiller de nombreux os. Le manifeste le déclare ainsi :
       { "_atlas": { "fichier": "squelette-cc0.glb", "table": "squelette-cc0", "licence": "CC0-1.0", "auteur": "…", "source": "https://…" } }
   et js/anatomie/correspondance-squelette.js (table de correspondance) dit quel nœud va sur quel os ; une entrée individuelle du manifeste a priorité sur l'atlas.
   Le fichier n'est lu et analysé qu'une fois ; `avecRachis:false` (scoliose, fracture vertébrale) fait garder au rachis et aux côtes leur forme procédurale déformable.

   Robustesse : cache mémoire + cache du navigateur (Cache API, le fichier n'est téléchargé qu'une fois), indicateur de chargement (abonnerChargement),
   et repli automatique sur la forme procédurale en cas d'absence, d'échec réseau, de fichier invalide ou de dimensions aberrantes (le moteur compare les boîtes englobantes). */
import { TABLES } from './correspondance-squelette.js?v=2026.10.14.4';

const cache = new Map();
const NOM_CACHE = 'rayle-anatomie-glb-v1';
let manifeste;
const etat = { demandes: 0, termines: 0, echecs: 0, enCours: 0, repli: [], noms: new Set() };
const NOMS_COUCHES = { 'muscles-bp3d.glb': 'muscles', 'tendons-bp3d.glb': 'tendons', 'arteres-bp3d.glb': 'artères', 'arteres-fin-bp3d.glb': 'artères fines', 'veines-bp3d.glb': 'veines', 'veines-fin-bp3d.glb': 'veines fines', 'organes-bp3d.glb': 'organes', 'nerfs-bp3d.glb': 'nerfs', 'os-axial-bp3d.glb': 'squelette', 'os-detail-bp3d.glb': 'mains, pieds et crâne', 'squelette-cc0.glb': 'squelette (secours)' };
const ecouteurs = new Set();

const notifier = () => { const e = lireEtatChargement(); ecouteurs.forEach(f => { try { f(e); } catch (x) { } }); };
export function lireEtatChargement() { return { demandes: etat.demandes, termines: etat.termines, echecs: etat.echecs, enCours: etat.enCours, repli: etat.repli.slice(), couches: Array.from(etat.noms).map(f => NOMS_COUCHES[f] || f) }; }
/** fn(état) à chaque changement : { demandes, termines, echecs, enCours, repli:[ids restés procéduraux après un échec] } → désabonnement */
export function abonnerChargement(fn) { ecouteurs.add(fn); return () => ecouteurs.delete(fn); }

/** Normalise une entrée du manifeste → { fichier, echelle:[x,y,z], decalage:[x,y,z], rotation:[x,y,z], licence, source, auteur } ou null */
export function normaliserEntree(v) {
  if (!v) return null;
  const o = typeof v === 'string' ? { fichier: v } : v;
  if (!o || typeof o.fichier !== 'string' || !/\.(glb|gltf)$/i.test(o.fichier) || /(^|[\\/])\.\.([\\/]|$)|^[a-z]+:|^[\\/]/i.test(o.fichier)) return null;     // pas de chemin absolu ni de remontée de dossier
  const v3 = (x, d) => Array.isArray(x) && x.length === 3 && x.every(n => typeof n === 'number' && isFinite(n)) ? x : d;
  const ech = typeof o.echelle === 'number' && isFinite(o.echelle) && o.echelle > 0 ? [o.echelle, o.echelle, o.echelle] : v3(o.echelle, [1, 1, 1]);
  return { fichier: o.fichier, echelle: ech, decalage: v3(o.decalage, [0, 0, 0]), rotation: v3(o.rotation, [0, 0, 0]), licence: o.licence || '', source: o.source || '', auteur: o.auteur || '' };
}

export async function lireManifeste() {
  if (manifeste !== undefined) return manifeste;
  try {
    if (typeof fetch === 'undefined' || typeof document === 'undefined') { manifeste = null; return manifeste; }
    const r = await fetch(new URL('ui/assets/anatomie/manifest.json', document.baseURI), { cache: 'no-cache' });
    manifeste = r.ok ? await r.json() : null;
  } catch (e) { manifeste = null; }
  return manifeste;
}

/** Octets du fichier : cache du navigateur d'abord, sinon réseau (puis mise en cache). Lance une erreur si indisponible. */
async function octets(url) {
  let c = null;
  try { if (typeof caches !== 'undefined') c = await caches.open(NOM_CACHE); } catch (e) { c = null; }
  if (c) { try { const r = await c.match(url); if (r) return await r.arrayBuffer(); } catch (e) { } }
  const rep = await fetch(url);
  if (!rep.ok) throw new Error('HTTP ' + rep.status);
  if (c) { try { await c.put(url, rep.clone()); } catch (e) { } }
  return await rep.arrayBuffer();
}

/** Les GLB quantifiés (KHR_mesh_quantization : positions 16 bits, normales 8 bits, matrice du nœud qui rétablit l'échelle) donnent au shader des positions normalisées ; les textures procédurales
    des matériaux travaillent en mètres, d'où ce retour aux flottants en mètres, matrice du nœud appliquée aux sommets (le nœud redevient neutre). */
export function dequantifier(THREE, scene) {
  scene.updateMatrixWorld(true);
  scene.traverse(o => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry, p = g.attributes.position, n = g.attributes.normal;
    if (!p || p.array instanceof Float32Array) return;
    const flottants = a => { const t = new Float32Array(a.count * 3); for (let i = 0; i < a.count; i++) { t[3 * i] = a.getX(i); t[3 * i + 1] = a.getY(i); t[3 * i + 2] = a.getZ(i); } return new THREE.BufferAttribute(t, 3); };
    g.setAttribute('position', flottants(p)); if (n) g.setAttribute('normal', flottants(n));
    o.updateMatrix(); g.applyMatrix4(o.matrix); g.computeBoundingBox(); g.computeBoundingSphere();
    o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1); o.updateMatrix();
  });
}

/** GLTFLoader avec décodeur meshopt (EXT_meshopt_compression : les fichiers de l'atlas sont compressés par scripts/compresser-glb.mjs ; les fichiers non compressés se lisent aussi) → classe configurée */
let chargeurPromesse = null;
function chargeurGLTF() {
  if (!chargeurPromesse) chargeurPromesse = (async () => {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    let decodeur = null;
    try { decodeur = (await import('three/addons/libs/meshopt_decoder.module.js')).MeshoptDecoder; } catch (e) { console.warn('[anatomie] décodeur meshopt indisponible : seuls les GLB non compressés se chargeront'); }
    return class extends GLTFLoader { constructor(m) { super(m); if (decodeur) this.setMeshoptDecoder(decodeur); } };
  })();
  return chargeurPromesse;
}

/** Atlas : fichier GLB analysé une seule fois → gltf.scene (ou null) */
function lireAtlas(atlas) {
  const cle = 'atlas:' + atlas.fichier;
  if (!cache.has(cle)) {
    etat.demandes++; etat.enCours++; etat.noms.add(atlas.fichier); notifier();
    cache.set(cle, (async () => {
      if (!normaliserEntree(atlas.fichier)) throw new Error('chemin d’atlas refusé : ' + atlas.fichier);     // relatif, .glb / .gltf, sans « .. »
      const GLTFLoader = await chargeurGLTF();
      const url = new URL('ui/assets/anatomie/' + atlas.fichier, document.baseURI).href;
      const gltf = await new GLTFLoader().parseAsync(await octets(url), url.slice(0, url.lastIndexOf('/') + 1));
      dequantifier(await import('three'), gltf.scene);
      etat.termines++;
      return gltf.scene;
    })().catch(e => {
      etat.echecs++; etat.repli.push(atlas.fichier);
      console.warn('[anatomie] atlas ' + atlas.fichier + ' : ' + (e && e.message || e) + ' → formes procédurales conservées');
      return null;
    }).finally(() => { etat.enCours--; etat.noms.delete(atlas.fichier); notifier(); }));
  }
  return cache.get(cle);
}

/** Atlas déclarés dans le manifeste (avec leur table), du plus prioritaire au moins prioritaire : « _atlas » est un objet ou une liste. Une structure est prise dans le premier atlas
    qui la décrit ET dont le fichier se charge ; sinon dans le suivant (repli : le squelette CC0 si le fichier détaillé manque) puis sur la forme procédurale. */
export async function atlasListe() {
  const m = await lireManifeste(); if (!m || !m._atlas) return [];
  return [].concat(m._atlas).filter(a => a && typeof a.fichier === 'string' && TABLES[a.table]);
}
/** Premier atlas déclaré (compatibilité) */
export async function atlasDeclare() { return (await atlasListe())[0] || null; }

/** → { scene: Object3D (à cloner), meta } ou null si la structure n'a pas de modèle GLB ou si le chargement a échoué (repli procédural).
    meta.miroir : le modèle est celui du côté GAUCHE et doit être retourné pour le côté droit (entrées individuelles) ; avec un atlas, chaque côté a son propre nœud.
    options.avecRachis === false : le rachis, les côtes et les disques gardent leur forme procédurale. */
export async function chargerGLB(base, cote, options = {}) {
  const m = await lireManifeste();
  if (!m) return null;
  const meta0 = normaliserEntree(m[base]);
  if (meta0) {
    const res = await chargerEntree(base, meta0);
    return res && { scene: res.scene, meta: Object.assign({}, res.meta, { miroir: cote === 'D', ajuster: res.meta.ajuster || 'aucun' }) };
  }
  for (const atlas of await atlasListe()) {
    const ent = TABLES[atlas.table].os[base];
    if (!ent || (ent.rachis && options.avecRachis === false)) continue;
    const noms = cote && ent[cote] ? ent[cote] : ent.noeuds;
    if (!noms) continue;
    const src = await lireAtlas(atlas); if (!src) continue;
    const groupe = new src.constructor(); groupe.name = base + (cote ? ':' + cote : '');
    for (const n of noms) { const o = src.getObjectByName(n); if (o) groupe.add(o.clone(true)); }
    if (!groupe.children.length) continue;
    return { scene: groupe, meta: { echelle: [1, 1, 1], decalage: [0, 0, 0], rotation: [0, 0, 0], miroir: false, ajuster: ent.ajuster || 'boite', groupe: ent.groupe || null, table: atlas.table, licence: atlas.licence || TABLES[atlas.table].licence, source: atlas.source || TABLES[atlas.table].source, auteur: atlas.auteur || TABLES[atlas.table].auteur } };
  }
  return null;
}

async function chargerEntree(base, meta) {
  if (!cache.has(base)) {
    etat.demandes++; etat.enCours++; etat.noms.add(meta.fichier); notifier();
    cache.set(base, (async () => {
      const GLTFLoader = await chargeurGLTF();     // import map de index.html (même instance de three.js)
      const url = new URL('ui/assets/anatomie/' + meta.fichier, document.baseURI).href;
      const gltf = await new GLTFLoader().parseAsync(await octets(url), url.slice(0, url.lastIndexOf('/') + 1));
      dequantifier(await import('three'), gltf.scene);
      etat.termines++;
      return { scene: gltf.scene, meta };
    })().catch(e => {
      etat.echecs++; etat.repli.push(base);
      console.warn('[anatomie] GLB ' + base + ' : ' + (e && e.message || e) + ' → forme procédurale conservée');
      return null;
    }).finally(() => { etat.enCours--; etat.noms.delete(meta.fichier); notifier(); }));
  }
  return cache.get(base);
}

/** Couche de tissus mous haute fidélité (muscles-bp3d.glb, arteres-bp3d.glb…, voir corps-hd.js) : fichier analysé une seule fois, nœuds dé-quantifiés.
    → { scene, ancres: [identifiants d'ancres de peau] } ou null (absent, réseau, fichier invalide : l'appelant garde les formes procédurales). Le chargement alimente l'indicateur (abonnerChargement). */
export function chargerCouche(fichier) {
  const cle = 'couche:' + fichier;
  if (!cache.has(cle)) {
    etat.demandes++; etat.enCours++; etat.noms.add(fichier); notifier();
    cache.set(cle, (async () => {
      if (!normaliserEntree(fichier)) throw new Error('chemin de couche refusé : ' + fichier);
      const GLTFLoader = await chargeurGLTF();
      const url = new URL('ui/assets/anatomie/' + fichier, document.baseURI).href;
      const gltf = await new GLTFLoader().parseAsync(await octets(url), url.slice(0, url.lastIndexOf('/') + 1));
      dequantifier(await import('three'), gltf.scene);
      const ex = gltf.asset && gltf.asset.extras;
      etat.termines++;
      return { scene: gltf.scene, ancres: ex && Array.isArray(ex.ancres) ? ex.ancres : [] };
    })().catch(e => {
      etat.echecs++; etat.repli.push(fichier);
      console.warn('[anatomie] couche ' + fichier + ' : ' + (e && e.message || e) + ' → formes procédurales conservées');
      return null;
    }).finally(() => { etat.enCours--; etat.noms.delete(fichier); notifier(); }));
  }
  return cache.get(cle);
}

/** Vide les caches (mémoire et navigateur) : utile après avoir remplacé des fichiers */
export async function viderCache() {
  cache.clear(); manifeste = undefined; etat.demandes = etat.termines = etat.echecs = etat.enCours = 0; etat.repli = []; etat.noms.clear();
  try { if (typeof caches !== 'undefined') await caches.delete(NOM_CACHE); } catch (e) { }
  notifier();
}
