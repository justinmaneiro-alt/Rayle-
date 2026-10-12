/* ═════════════ MODÈLES GLB OPTIONNELS ═════════════
   Si ui/assets/anatomie/manifest.json existe, chaque structure qu'il liste est chargée depuis son fichier GLB à la place de la forme procédurale
   (qui reste le repli : l'application fonctionne sans aucun fichier 3D). Format du manifeste :
       { "humerus": "humerus.glb", "biceps-brachial": "biceps.glb", "foie": "foie.glb", … }     (clés = identifiants de base, voir registre.js)
   Chaque GLB est exprimé dans le repère de l'application : mètres, y vers le haut, face vers +z, pieds au sol, structures du côté GAUCHE (x > 0) ;
   le côté droit est obtenu par miroir. Les matériaux du GLB sont remplacés par ceux de l'application (couleurs, surbrillance, coupes d'amputation). */
const cache = new Map();
let manifeste;

export async function lireManifeste() {
  if (manifeste !== undefined) return manifeste;
  try {
    if (typeof fetch === 'undefined' || typeof document === 'undefined') { manifeste = null; return manifeste; }
    const r = await fetch(new URL('ui/assets/anatomie/manifest.json', document.baseURI), { cache: 'no-cache' });
    manifeste = r.ok ? await r.json() : null;
  } catch (e) { manifeste = null; }
  return manifeste;
}

/** → Object3D (à cloner) ou null si la structure n'a pas de modèle GLB */
export async function chargerGLB(base) {
  const m = await lireManifeste();
  if (!m || !m[base]) return null;
  if (!cache.has(base)) {
    cache.set(base, (async () => {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');     // import map de index.html (même instance de three.js)
      const url = new URL('ui/assets/anatomie/' + m[base], document.baseURI).href;
      const gltf = await new GLTFLoader().loadAsync(url);
      return gltf.scene;
    })().catch(e => { console.warn('[anatomie] GLB ' + base + ' : ' + (e && e.message || e)); return null; }));
  }
  return cache.get(base);
}
