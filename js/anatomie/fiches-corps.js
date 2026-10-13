/* ═════════════ BASE DE CONNAISSANCES : fiches des structures haute fidélité ═════════════
   Chaque fiche dit d'où vient chaque information : `source` cite l'ouvrage et la partie. Sources retenues (reconnues, citables, libres) :
     · Gray's Anatomy, 20e éd. américaine (Lewis, 1918), domaine public : Myologie, Angéiologie, Névrologie ; texte consulté : https://archive.org/details/anatomyofhumanbo00grayrich
     · Terminologia Anatomica (FCAT, 1998) pour les noms latins ;
     · BodyParts3D (DBCLS, CC BY 4.0) pour les formes et les identifiants FMA (Foundational Model of Anatomy).
   Les fiches sont rédigées en français d'après le texte de Gray (origine, terminaison, nerf, action, rapports : reformulés, jamais recopiés) ; elles sont réparties par région dans fiches-*.js.
   Une information absente des sources retenues n'est PAS inventée : la fiche la laisse vide et Rayle répond « non renseigné dans les sources retenues » (voir registre.js, fiche()).
   Format : { origine: { os: id d'os de l'application | null, txt }, insertion: { os, txt }, innervation, action, vascularisation, rapports, clinique, source }.
   Les muscles de donnees-muscles.js (écrits avant cette base) ont leur propre fiche ; les fichiers fiches-*.js décrivent les structures ajoutées. */
import { f, SOURCE_GRAY } from './fiches-outils.js?v=2026.10.14.1';
import { FICHES_MS } from './fiches-membre-sup.js?v=2026.10.14.1';
import { FICHES_MI } from './fiches-membre-inf.js?v=2026.10.14.1';
import { FICHES_TRONC } from './fiches-tronc-cou.js?v=2026.10.14.1';
import { FICHES_TETE } from './fiches-tete.js?v=2026.10.14.1';
import { FICHES_VAISSEAUX } from './fiches-vaisseaux.js?v=2026.10.14.1';
import { FICHES_NERFS } from './fiches-nerfs.js?v=2026.10.14.1';

export { SOURCE_GRAY };
export const FICHES_CORPS = Object.assign({}, FICHES_MS, FICHES_MI, FICHES_TRONC, FICHES_TETE, FICHES_VAISSEAUX, FICHES_NERFS);
