/* ═════════════ MODÈLES GLB OPTIONNELS ═════════════
   Si ui/assets/anatomie/manifest.json existe, chaque structure qu'il liste est chargée depuis son fichier GLB à la place de la forme procédurale
   (qui reste le repli : l'application fonctionne sans aucun fichier 3D). Une entrée est soit un nom de fichier, soit un objet :
       { "humerus": "humerus.glb",
         "crane":   { "fichier": "crane.glb", "echelle": 1, "decalage": [0, 1.62, 0], "rotation": [0, 0, 0],
                      "licence": "CC0-1.0", "source": "https://…", "auteur": "…" } }                 (clés = identifiants de base, voir registre.js)
   « echelle » (nombre ou [x, y, z]), « decalage » (mètres) et « rotation » (degrés, ordre XYZ) recalent un modèle exprimé dans un autre repère.
   Sans transformation, le GLB doit être dans le repère de l'application : mètres, y vers le haut, face vers +z, pieds au sol, structures du côté GAUCHE (x > 0) ;
   le côté droit est obtenu par miroir. Les matériaux du GLB sont remplacés par ceux de l'application (couleurs, surbrillance, coupes d'amputation).

   Robustesse : cache mémoire + cache du navigateur (Cache API, le fichier n'est téléchargé qu'une fois), indicateur de chargement (abonnerChargement),
   et repli automatique sur la forme procédurale en cas d'absence, d'échec réseau, de fichier invalide ou de dimensions aberrantes (le moteur compare les boîtes englobantes). */
const cache = new Map();
const NOM_CACHE = 'rayle-anatomie-glb-v1';
let manifeste;
const etat = { demandes: 0, termines: 0, echecs: 0, enCours: 0, repli: [] };
const ecouteurs = new Set();

const notifier = () => { const e = lireEtatChargement(); ecouteurs.forEach(f => { try { f(e); } catch (x) { } }); };
export function lireEtatChargement() { return { demandes: etat.demandes, termines: etat.termines, echecs: etat.echecs, enCours: etat.enCours, repli: etat.repli.slice() }; }
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

/** → { scene: Object3D (à cloner), meta } ou null si la structure n'a pas de modèle GLB ou si le chargement a échoué (repli procédural) */
export async function chargerGLB(base) {
  const m = await lireManifeste();
  const meta = m && normaliserEntree(m[base]);
  if (!meta) return null;
  if (!cache.has(base)) {
    etat.demandes++; etat.enCours++; notifier();
    cache.set(base, (async () => {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');     // import map de index.html (même instance de three.js)
      const url = new URL('ui/assets/anatomie/' + meta.fichier, document.baseURI).href;
      const gltf = await new GLTFLoader().parseAsync(await octets(url), url.slice(0, url.lastIndexOf('/') + 1));
      etat.termines++;
      return { scene: gltf.scene, meta };
    })().catch(e => {
      etat.echecs++; etat.repli.push(base);
      console.warn('[anatomie] GLB ' + base + ' : ' + (e && e.message || e) + ' → forme procédurale conservée');
      return null;
    }).finally(() => { etat.enCours--; notifier(); }));
  }
  return cache.get(base);
}

/** Vide les caches (mémoire et navigateur) : utile après avoir remplacé des fichiers */
export async function viderCache() {
  cache.clear(); manifeste = undefined; etat.demandes = etat.termines = etat.echecs = etat.enCours = 0; etat.repli = [];
  try { if (typeof caches !== 'undefined') await caches.delete(NOM_CACHE); } catch (e) { }
  notifier();
}
