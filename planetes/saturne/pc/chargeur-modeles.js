import * as THREE from 'three';
import { choisirEviction, octetsEstimes, resoudreUrlBase, MO } from './plafond-memoire.js';

/* ═════════════ CHARGEUR DE MODÈLES LOURDS (glTF compressé) ═════════════
   Charge des fichiers .glb compressés (Draco ou Meshopt pour les géométries, KTX2 / Basis pour les textures) depuis un dossier configurable :
   par défaut `assets-lourds/` (exclu de git : GitHub Pages limite les fichiers à 100 Mo et le site à 1 Go), plus tard un hébergement externe (par exemple Cloudflare R2
   gratuit) en réglant `window.RAYLE_ASSETS_URL` ou le réglage `rayle_assets_url` de l'appareil : rien d'autre à changer, rien n'est configuré aujourd'hui.
   Chargement PROGRESSIF : un système (os, muscles…) est découpé en parties listées dans le manifeste ; chaque partie apparaît dès qu'elle est prête, sans bloquer l'affichage.
   Plafond de mémoire : au-delà, les modèles les moins récemment utilisés (et non affichés) sont libérés. */
const VENDOR = new URL('../../../galaxie/vendor/addons/', import.meta.url).href;

export function creerChargeurModeles({ renderer, plafondMo = 480, fetchImpl = (...a) => fetch(...a) } = {}) {
  const urlBase = () => resoudreUrlBase({ globale: window.RAYLE_ASSETS_URL, stockage: (() => { try { return localStorage.getItem('rayle_assets_url'); } catch (e) { return null; } })(), base: document.baseURI });
  const cache = new Map();          // id → { groupe, octets, dernierUsage, protege }
  const annulations = new Set();
  let loader = null, manifeste = null;
  async function preparer() {
    if (loader) return loader;
    const [{ GLTFLoader }, { DRACOLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/loaders/DRACOLoader.js'), import('three/addons/loaders/KTX2Loader.js'), import('three/addons/libs/meshopt_decoder.module.js')]);
    const draco = new DRACOLoader().setDecoderPath(VENDOR + 'libs/draco/gltf/'), ktx2 = new KTX2Loader().setTranscoderPath(VENDOR + 'libs/basis/');
    if (renderer) ktx2.detectSupport(renderer);
    loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
    return loader;
  }
  async function lireManifeste(force = false) {
    if (manifeste && !force) return manifeste;
    const r = await fetchImpl(urlBase() + 'manifeste.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('manifeste des modèles introuvable (' + r.status + ') : ' + urlBase() + 'manifeste.json');
    manifeste = await r.json(); return manifeste;
  }
  function liberer(id) {
    const e = cache.get(id); if (!e) return;
    e.groupe.traverse(o => { if (o.geometry) o.geometry.dispose(); const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) { for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) if (m[k]) m[k].dispose(); m.dispose(); } });
    if (e.groupe.parent) e.groupe.parent.remove(e.groupe); cache.delete(id);
  }
  function appliquerPlafond() { for (const id of choisirEviction([...cache.entries()].map(([id, e]) => ({ id, octets: e.octets, dernierUsage: e.dernierUsage, protege: e.protege })), plafondMo * MO)) liberer(id); }
  return {
    urlBase, lireManifeste,
    /* Charge un système (id du manifeste) partie par partie. surPartie(groupePartie, info) est appelée à chaque partie prête ; surProgres(fait, total, octets). Rend le groupe parent. */
    async charger(id, { surPartie = null, surProgres = null } = {}) {
      const e0 = cache.get(id); if (e0) { e0.dernierUsage = performance.now(); return e0.groupe; }
      const m = await lireManifeste(), sys = m.systemes && m.systemes[id];
      if (!sys) throw new Error('système « ' + id + ' » absent du manifeste');
      const L = await preparer(), groupe = new THREE.Group(); groupe.name = 'systeme-' + id; groupe.userData.systeme = id;
      const entree = { groupe, octets: 0, dernierUsage: performance.now(), protege: true }; cache.set(id, entree);
      const parties = sys.parties && sys.parties.length ? sys.parties : [{ id, fichier: sys.fichier }];
      let fait = 0;
      for (const p of parties) {
        if (annulations.has(id)) { annulations.delete(id); liberer(id); throw new Error('chargement annulé'); }
        const gltf = await L.loadAsync(urlBase() + p.fichier);
        const g = gltf.scene; g.name = p.id; g.userData.partie = p; groupe.add(g);
        g.traverse(o => { if (o.isMesh) { o.frustumCulled = true; o.castShadow = o.receiveShadow = false; } });
        entree.octets = octetsEstimes(groupe); fait++;
        if (surPartie) surPartie(g, p);
        if (surProgres) surProgres(fait, parties.length, entree.octets);
        await new Promise(r => requestAnimationFrame(r));             // une partie par image au plus : l'affichage ne se fige pas
      }
      entree.protege = false; appliquerPlafond();
      return groupe;
    },
    annuler(id) { annulations.add(id); },
    proteger(id, oui) { const e = cache.get(id); if (e) { e.protege = !!oui; if (!oui) appliquerPlafond(); } },
    utiliser(id) { const e = cache.get(id); if (e) e.dernierUsage = performance.now(); },
    liberer, appliquerPlafond,
    etat: () => ({ urlBase: urlBase(), plafondMo, charges: [...cache.entries()].map(([id, e]) => ({ id, mo: +(e.octets / MO).toFixed(1), protege: e.protege })), totalMo: +([...cache.values()].reduce((s, e) => s + e.octets, 0) / MO).toFixed(1) })
  };
}
