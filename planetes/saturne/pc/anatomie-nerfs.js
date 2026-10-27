import * as THREE from 'three';
import { NERFS, MOELLE, MENTION_SCHEMA, resoudre, ficheNerf, nomPiece } from './anatomie-nerfs-schema.js';

/* ═════════════ ANATOMIE : NERFS PÉRIPHÉRIQUES SCHÉMATIQUES SUR LA TABLE (Phase D) ═════════════
   Construit, pour chaque nerf de anatomie-nerfs-schema.js et chaque côté, un tube (courbe de Catmull-Rom passant par les repères osseux du corps articulé) et l'enregistre comme un système
   « nerfs-periph » de la visionneuse : cliquable, avec fiche (« schématique »), habillé par les os pendant les mouvements (aucun tube ne flotte), activable par bouton ou à la voix.
   TOUJOURS étiqueté « schéma, tracé approximatif » : jamais un modèle anatomique exact. */
export const SYSTEME_NERFS = 'nerfs-periph';
export function declarerNerfs(anat) {
  anat.declarerSchema(SYSTEME_NERFS, async () => {
    const corps = anat.mouvement().corps(), ctx = { pivots: corps.pivots, lat: S => corps.lat(S), a: corps.ant }, groupe = new THREE.Group(); groupe.name = 'systeme-' + SYSTEME_NERFS;
    const liste = [];
    for (const n of NERFS) for (const S of ['D', 'G']) liste.push([n, S]); liste.push([MOELLE, '']);
    const mat = new THREE.MeshStandardMaterial({ color: 0xe6cf72, roughness: 0.55, metalness: 0.05, emissive: 0x2a2208, emissiveIntensity: 0.4 });
    for (const [n, S] of liste) {
      const pts = resoudre(n, S, ctx), v = pts.map(p => new THREE.Vector3(...p)), courbe = new THREE.CatmullRomCurve3(v, false, 'centripetal'), g = new THREE.TubeGeometry(courbe, Math.max(24, v.length * 12), n.rayon, 8, false);
      const id = 'SCH-' + n.id + (S ? '-' + S : ''), mesh = new THREE.Mesh(g, mat.clone()); mesh.name = id; mesh.castShadow = mesh.receiveShadow = false;
      const bb = new THREE.Box3().setFromBufferAttribute(g.attributes.position), noms = nomPiece(n, S);
      anat.index.ajouter({ id, fma: null, nom_en: noms.en, nom_la: noms.la, nom_fr: noms.fr, traduction: 'schéma', couche: null, source_nom: 'schéma (anatomie-nerfs-schema.js)', systeme: SYSTEME_NERFS, type: 'nerf', region: n.membre === 'axe' ? 'rachis' : 'membre ' + n.membre, cote: S ? (S === 'D' ? 'droit' : 'gauche') : null, bornes: [bb.min.toArray(), bb.max.toArray()], triangles: g.index.count / 3, fichier: null, schema: MENTION_SCHEMA, fiche: ficheNerf(n) });
      groupe.add(mesh);
    }
    return groupe;
  });
}
