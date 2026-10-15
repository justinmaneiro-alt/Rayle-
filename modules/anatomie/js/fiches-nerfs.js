/* Fiches : nerfs et plexus. Source : Gray's Anatomy 1918, Névrologie (voir fiches-corps.js). Les nerfs de ce fichier ont un TRACÉ SCHÉMATIQUE (tube) reconstitué d'après les descriptions de Gray et posé sur les os,
   muscles et artères de BodyParts3D (scripts/traces-nerfs.mjs) : BodyParts3D ne contient aucun nerf périphérique. Les nerfs de l'orbite, eux, viennent du modèle. */
import { SOURCE_GRAY } from './fiches-outils.js?v=2026.10.15.7';

const NE = SOURCE_GRAY + ', Névrologie : nerfs spinaux et crâniens';
const nerf = (racines, description, territoire, extra) => Object.assign({ racines, description, territoire: territoire || '', source: NE }, extra || {});

export const FICHES_NERFS = {
  // Nerfs déjà décrits dans donnees-nerfs-organes.js : on n'ajoute que leur source (voir registre.js)
  'plexus-brachial': { source: NE }, 'nerf-median': { source: NE }, 'nerf-ulnaire': { source: NE }, 'nerf-radial': { source: NE }, 'nerf-axillaire': { source: NE },
  'nerf-sciatique': { source: NE }, 'nerf-fibulaire-commun': { source: NE }, 'nerf-tibial': { source: NE }, 'nerf-femoral': { source: NE }, 'nerf-vague': { source: NE },
  // Nerfs nouveaux
  'nerf-musculo-cutane': nerf('C5-C7', "Naît du faisceau latéral du plexus brachial, perfore le coraco-brachial, passe entre le biceps et le brachial.", "Muscles coraco-brachial, biceps brachial et brachial (le brachial reçoit souvent un filet du nerf radial)."),
  'plexus-lombaire': nerf('L1-L4', "Formé par les anses de communication entre les branches antérieures des trois premiers nerfs lombaires et la plus grande partie du quatrième ; le premier reçoit souvent une branche du dernier nerf thoracique. Situé dans la partie postérieure du psoas major, en avant des processus transverses des vertèbres lombaires.", "Donne notamment les nerfs fémoral et obturateur."),
  'nerf-obturateur': nerf('L2-L4', "Naît des divisions ventrales des 2e, 3e et 4e nerfs lombaires (la branche du 3e est la plus grosse). Descend à travers les fibres du psoas major et en sort par son bord médial près du détroit supérieur du bassin, puis passe derrière les vaisseaux iliaques communs.", "Adducteurs de la cuisse et gracile (nerf obturateur)."),
  'plexus-sacre': nerf('L4-S3', "Formé par le tronc lombo-sacré, la branche antérieure du 1er nerf sacré et des parties des branches antérieures des 2e et 3e nerfs sacrés.", "Donne notamment le nerf sciatique."),
  'nerf-phrenique': nerf('C3-C5', "Contient des fibres motrices et sensitives dans la proportion d'environ deux pour un. Naît surtout du 4e nerf cervical, avec une branche du 3e et une du 5e ; descend à la base du cou en croisant obliquement la face antérieure du scalène antérieur.", "Diaphragme (nerf moteur du diaphragme)."),
  'nerf-optique': nerf('Nerf crânien II', "Nerf optique, chiasma optique et tractus optiques (modèle BodyParts3D).", "Voie visuelle.", { source: "BodyParts3D (forme) · " + SOURCE_GRAY }),
  'nerf-trochleaire': nerf('Nerf crânien IV', "Nerf trochléaire (modèle BodyParts3D).", "Muscle oblique supérieur de l'œil (Gray, 1918).", { source: "BodyParts3D (forme) · " + SOURCE_GRAY }),
  'nerf-ophtalmique': nerf('Nerf crânien V1', "Nerf ophtalmique et ses branches de l'orbite : nasociliaire, frontal, lacrymal, supra-orbitaire, supra-trochléaire (modèle BodyParts3D).", null, { source: 'BodyParts3D (forme)' })
};
