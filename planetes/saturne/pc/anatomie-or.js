/* ═════════════ SQUELETTE EN OR CHAUD (thème Rayle) : le MÊME matériau pour la miniature du carrousel et la grande fenêtre d'anatomie ═════════════
   Or chaud, légèrement métallique, avec une faible émission chaude (le squelette ressort sur le fond noir), et un éclairage à trois points (clé chaude, remplissage froid faible, contre-jour doré).
   La miniature n'est qu'un rendu réduit du même modèle (assets-lourds/anatomie/os-1.glb + os-2.glb). */
export const OR = Object.freeze({ couleur: 0xe0a64a, emissive: 0x4a2200, emissiveIntensite: 0.42, metal: 0.5, rugosite: 0.42 });

/* Teinte tous les matériaux d'un groupe d'os (les matériaux du fichier sont modifiés sur place : ils sont propres à ce modèle). */
export function teinterOr(racine, T) {
  const vus = new Set();
  racine.traverse(o => {
    if (!o.isMesh || !o.material) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (vus.has(m)) continue; vus.add(m);
      if (m.color) m.color.set(OR.couleur); if ('metalness' in m) m.metalness = OR.metal; if ('roughness' in m) m.roughness = OR.rugosite;
      if (m.emissive) { m.emissive.set(OR.emissive); m.emissiveIntensity = OR.emissiveIntensite; }
      m.needsUpdate = true;
    }
  });
  return vus.size;
}

/* Éclairage à trois points pour une scène à part (miniature) : clé chaude de face, remplissage froid faible, contre-jour doré. */
export function eclairageTroisPoints(scene, T) {
  scene.add(new T.AmbientLight(0xffe8c4, 0.55));
  const cle = new T.DirectionalLight(0xffd29a, 2.6); cle.position.set(2.5, 3, 4); scene.add(cle);
  const remplissage = new T.DirectionalLight(0xbcc8ff, 0.5); remplissage.position.set(-3, 0.5, 2.5); scene.add(remplissage);
  const contre = new T.DirectionalLight(0xffb347, 2.2); contre.position.set(0, 2.5, -4); scene.add(contre);
}

/* Contours : arêtes marquées, fines, dorées (miniature seulement). */
export function contours(racine, T, { angle = 50, opacite = 0.28 } = {}) {
  const lignes = [];
  racine.traverse(o => { if (o.isMesh && o.geometry) lignes.push(o); });
  for (const o of lignes) { try { const e = new T.LineSegments(new T.EdgesGeometry(o.geometry, angle), new T.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: opacite })); o.add(e); } catch (err) { /* géométrie sans arêtes */ } }
  return lignes.length;
}
