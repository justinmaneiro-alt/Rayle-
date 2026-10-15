/* ═════════════ CERVEAU : recherche d'une zone ou d'un réseau par son nom, fiche et résumé parlé (pur, testable sans navigateur) ═════════════ */
import { ZONES_CERVEAU, ZONE_PAR_ID, RESEAUX_CERVEAU, RESEAU_PAR_ID, SOURCES_CERVEAU, STRUCTURE_PAR_ID, FAISCEAU_PAR_ID, MENTION_CEREBRALE, NON_RENSEIGNE_CERVEAU } from './donnees-cerveau.js?v=2026.10.15.1';

export const norm = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[œ]/g, 'oe').replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const contient = (t, m) => (' ' + t + ' ').includes(' ' + m + ' ');

/** Liste à plat des noms (alias, nom français, nom latin) → zone ; les plus longs d'abord, pour que « aire de Broca » passe avant « broca » et « lobe frontal » avant « frontal » */
const INDEX_ZONES = (() => {
  const l = [];
  for (const z of ZONES_CERVEAU) for (const m of new Set([z.nom, z.latin, ...(z.alias || [])])) { const n = norm(m); if (n.length >= 3) l.push([n, z.id]); }
  return l.sort((a, b) => b[0].length - a[0].length);
})();
const INDEX_RESEAUX = (() => {
  const l = [];
  for (const r of RESEAUX_CERVEAU) for (const m of new Set([r.nom, ...(r.mots || [])])) l.push([norm(m), r.id]);
  return l.sort((a, b) => b[0].length - a[0].length);
})();

/** Mots partagés avec le squelette ou les muscles (« os frontal », « pont ») ou trop généraux (« mouvement ») : ignorés en mode strict, c'est-à-dire quand la phrase ne parle pas du cerveau */
const FAIBLES = new Set(['frontal', 'parietal', 'temporal', 'occipital', 'pont', 'mouvement', 'langage', 'vision', 'memoire', 'sensibilite', 'toucher', 'emotion', 'peur', 'parole', 'coordination', 'audition', 'motricite', 'fibres', 'faisceaux', 'connectivite', 'commissure', 'ventricule', 'v1', 'lobe temporal', 'homoncule moteur', 'homoncule sensitif', 'systeme limbique', 'protuberance', 'bulbe', 'cingulaire', 'insula']);
/** → zone ({…ZONES_CERVEAU}) ou null ; strict : ignore les mots ambigus (voir FAIBLES) */
export function trouverZone(texte, { strict = false } = {}) {
  const t = norm(texte); if (!t) return null;
  for (const [m, id] of INDEX_ZONES) if (contient(t, m) && !(strict && FAIBLES.has(m))) return ZONE_PAR_ID[id];
  return null;
}
/** → réseau fonctionnel (vision, langage…) ou null */
export function trouverReseau(texte) {
  const t = norm(texte); if (!t) return null;
  for (const [m, id] of INDEX_RESEAUX) if (contient(t, m)) return RESEAU_PAR_ID[id];
  return null;
}
/** Zone la plus précise qui contient une forme 3D (clic sur un gyrus → aire correspondante, sinon le lobe) */
export function zoneDeStructure(sid) {
  let meilleure = null;
  for (const z of ZONES_CERVEAU) if (z.structures.includes(sid) && (!meilleure || z.structures.length < meilleure.structures.length)) meilleure = z;
  return meilleure;
}
export const sourcesDe = z => (z.sources || []).map(k => SOURCES_CERVEAU[k]).filter(Boolean);
const premierMot = t => norm(t).split(' ')[0].replace(/e$/, '');
/** « Nom · latin » sans doublon quand le nom français ressemble au latin (hippocampe · Hippocampus) */
export const nomLatin = z => { const l = z.latin.split(' (')[0]; return premierMot(l).slice(0, 6) === premierMot(z.nom).slice(0, 6) ? z.nom : z.nom + ' · ' + l; };

/** Fiche : { id, nom, latin, famille, champs:[{label, valeur}], sources, certitude, mention } — un champ vide est signalé « non renseigné » */
export function ficheZone(id) {
  const z = ZONE_PAR_ID[id]; if (!z) return null;
  const vide = v => v && (!Array.isArray(v) || v.length) ? v : NON_RENSEIGNE_CERVEAU;
  const champs = [
    { label: 'Localisation', valeur: vide(z.localisation) }, { label: 'Fonctions', valeur: vide(z.fonctions) },
    { label: 'Fonctionnement', valeur: vide(z.fonctionnement) }, { label: 'Pathologies associées', valeur: vide(z.pathologies) },
    { label: 'Aires de Brodmann (approximatif)', valeur: z.brodmann && z.brodmann.length ? z.brodmann.join(', ') : 'Sans correspondance directe avec une aire de Brodmann (structure profonde ou non corticale).' },
    { label: 'Faisceaux liés', valeur: (z.faisceaux || []).map(f => FAISCEAU_PAR_ID[f] && FAISCEAU_PAR_ID[f].nom).filter(Boolean) }
  ].filter(c => !Array.isArray(c.valeur) || c.valeur.length);
  return { id, nom: z.nom, latin: z.latin, famille: z.famille, champs, sources: sourcesDe(z), certitude: z.certitude || '', mention: MENTION_CEREBRALE };
}

const phrase = s => String(s || '').replace(/\s+/g, ' ').trim();
const abreger = (s, n) => { s = phrase(s); if (s.length <= n) return s; const c = s.slice(0, n), p = c.lastIndexOf(' '); return c.slice(0, p > 40 ? p : n) + '…'; };
/** Ce que Raylé dit à voix haute pour une zone (court), selon la question : « où », « à quoi ça sert », « fonctionnement », « maladies » */
export function resumeZone(id, question) {
  const z = ZONE_PAR_ID[id]; if (!z) return '';
  const q = norm(question || '');
  const f = z.fonctions || [];
  if (/\b(?:maladie|pathologie|lesion|atteinte|trouble)/.test(q)) return `${z.nom} : ${abreger((z.pathologies || [])[0], 230)} ${z.pathologies && z.pathologies[1] ? abreger(z.pathologies[1], 150) : ''}`.trim();
  if (/\b(?:ou |situe|localis|se trouve|emplacement)/.test(q)) return `${z.nom} : ${abreger(z.localisation, 260)}`;
  if (/\b(?:comment|fonctionn|mecanisme|marche)/.test(q)) return `${z.nom} : ${abreger(z.fonctionnement, 300)}`;
  return `${z.nom}${z.latin ? ' (' + z.latin + ')' : ''}. ${abreger(z.localisation, 170)} ${f[0] ? 'Rôle : ' + abreger(f[0], 150) : ''} ${z.certitude ? 'À noter : ' + abreger(z.certitude, 140) : ''}`.replace(/\s+/g, ' ').trim();
}
export { ZONES_CERVEAU, RESEAUX_CERVEAU, STRUCTURE_PAR_ID, ZONE_PAR_ID, RESEAU_PAR_ID, FAISCEAU_PAR_ID };
