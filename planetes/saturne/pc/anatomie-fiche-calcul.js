/* ═════════════ ANATOMIE : CONTENU DES FENÊTRES DE FICHE (module pur, testé) ═════════════
   Transforme une fiche (anatomie-savoirs.js) en sections lisibles, trouve les structures voisines (liens cliquables) et prépare le texte que Raylé lit à voix haute,
   découpé en segments pour que la caméra suive la lecture. Rien n'est inventé : une rubrique sans donnée dit « non précisé dans cette fiche ». */
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
export const ABSENT = 'non précisé dans cette fiche';
const SYSTEMES_NOMS = { os: 'squelette', dents: 'dents', conjonctif: 'ligaments et cartilages', muscles: 'muscles', arteres: 'artères', veines: 'veines', nerfs: 'nerfs crâniens', cerveau: 'encéphale', coeur: 'cœur', respiratoire: 'appareil respiratoire', digestif: 'appareil digestif', urinaire: 'appareil urinaire', genital: 'appareil génital', endocrine: 'glandes', lymphatique: 'lymphatique', sens: 'organes des sens', peau: 'peau' };
export const nomSysteme = s => SYSTEMES_NOMS[s] || s;

const ecart = (a, b) => { let d2 = 0; for (let i = 0; i < 3; i++) { const g = Math.max(a[0][i] - b[1][i], b[0][i] - a[1][i], 0); d2 += g * g; } return Math.sqrt(d2); };

/* Structures voisines dans le modèle (distance entre boîtes englobantes, en mètres), au plus `max`, au plus `parSysteme` par système, sans la peau ni la pièce elle-même. */
export function voisines(index, p, { max = 8, parSysteme = 4, rayon = 0.08 } = {}) {
  if (!p || !p.bornes) return [];
  const cand = []; for (const q of index.pieces) { if (q.id === p.id || !q.bornes || q.systeme === 'peau') continue; const d = ecart(p.bornes, q.bornes); if (d <= rayon) cand.push({ q, d }); }
  cand.sort((a, b) => a.d - b.d || a.q.id.localeCompare(b.q.id)); const n = {}, sortie = [];
  for (const c of cand) { n[c.q.systeme] = (n[c.q.systeme] || 0) + 1; if (n[c.q.systeme] > parSysteme) continue; sortie.push({ id: c.q.id, nom: index.libelle(c.q, 'fr'), systeme: c.q.systeme, distanceMm: Math.round(c.d * 1000) }); if (sortie.length >= max) break; }
  return sortie;
}

/* Sections affichées dans la fenêtre : [{ titre, lignes: [[étiquette, valeur]] }] ; chaque rubrique du cahier des charges est présente (valeur ABSENT si la fiche ne la donne pas). */
export function sectionsFiche(fi) {
  const s = [], aff = v => (v == null || v === '' || (Array.isArray(v) && !v.length) ? ABSENT : Array.isArray(v) ? v.join(' ; ') : v);
  s.push({ titre: 'Identité', lignes: [['Nom français', fi.nom_fr || fi.nom_affiche], ['Nom latin', fi.nom_la || ABSENT], ['Nom anglais (modèle)', fi.nom_en], ['Système', nomSysteme(fi.systeme)], ['Région', fi.region || ABSENT], ['Côté', fi.cote || 'médian'], ['Type', fi.type || ABSENT]].concat(fi.couche_nom ? [['Couche (estimée)', fi.couche_nom]] : []) });
  if (fi.muscle) {
    const m = fi.muscle;
    s.push({ titre: 'Origine et terminaison', lignes: [['Origine', aff(m.origine)], ['Terminaison', aff(m.insertion)]] });
    s.push({ titre: 'Innervation et vascularisation', lignes: [['Innervation', aff(m.innervation)], ['Vascularisation', aff(m.vascularisation)]] });
    s.push({ titre: 'Action', lignes: [['Action', aff(m.action)], ['Antagonistes', aff(m.antagonistes)]] });
  } else if (fi.vaisseau) {
    const v = fi.vaisseau; s.push({ titre: 'Trajet', lignes: [['Origine', aff(v.origine)], ['Trajet', aff(v.trajet)], ['Territoire', aff(v.territoire)]] });
  } else if (fi.cerveau) {
    const c = fi.cerveau; s.push({ titre: 'Rôle et situation', lignes: [['Rôle', aff(c.role)], ['Rapports', aff(c.rapports)]] });
  } else {
    s.push({ titre: 'Rôle', lignes: [['Description', aff(fi.description)]] });
    s.push({ titre: 'Repères et rapports', lignes: [['Repères', aff(fi.reperes)], ['Articulations', aff(fi.articulations)], ['Insertions musculaires', aff(fi.muscles)]] });
  }
  s.push({ titre: 'Signification clinique', lignes: [['Clinique', aff(fi.clinique)]] });
  return s;
}

/* HTML de la fenêtre de fiche. `liens` = résultat de voisines() ; `schema` = mention affichée en tête pour un tracé schématique (jamais présenté comme un modèle exact). */
export function htmlFiche(fi, liens = [], { schema = null } = {}) {
  const conf = fi.confiance === 'élevée' ? 'haute' : fi.confiance === 'générique' ? 'moyenne' : 'basse';
  let h = '<div class="saf-fiche">';
  if (schema) h += '<p class="saf-schema">' + esc(schema) + '</p>';
  h += '<p class="saf-confiance" data-c="' + conf + '">Niveau de confiance : <b>' + esc(fi.confiance) + '</b> · à vérifier avec le cours / un atlas</p>';
  for (const sec of sectionsFiche(fi)) { h += '<section><h4>' + esc(sec.titre) + '</h4><dl>'; for (const [k, v] of sec.lignes) h += '<dt>' + esc(k) + '</dt><dd' + (v === ABSENT ? ' class="saf-absent"' : '') + '>' + esc(v) + '</dd>'; h += '</dl></section>'; }
  h += '<section><h4>Structures voisines</h4>' + (liens.length ? '<p class="saf-liens">' + liens.map(l => '<button type="button" data-voisine="' + esc(l.id) + '" title="' + esc(nomSysteme(l.systeme)) + ', à ' + l.distanceMm + ' mm">' + esc(l.nom) + '</button>').join('') + '</p>' : '<p class="saf-absent">Aucune voisine proche dans le modèle.</p>') + '</section>';
  h += '<p class="saf-avert">' + esc(fi.verifier) + '</p></div>';
  return h;
}

/* Segments lus par Raylé : un segment par rubrique, avec le temps estimé (ms) pour que la caméra tourne pendant la lecture. */
export function segmentsLecture(fi) {
  const nom = fi.nom_fr || fi.nom_en, seg = [], p = (cle, texte) => { if (texte) seg.push({ cle, texte }); };
  p('identite', nom + (fi.nom_la ? ', en latin ' + fi.nom_la : '') + '. Région : ' + (fi.region || 'non précisée') + (fi.cote ? ', côté ' + fi.cote : '') + '.');
  if (fi.muscle) { const m = fi.muscle; p('origine', 'Il naît de ' + m.origine + ' et se termine sur ' + m.insertion + '.'); p('nerf', 'Innervation : ' + m.innervation + '. Vascularisation : ' + m.vascularisation + '.'); p('action', 'Action : ' + m.action + (m.antagonistes ? '. Antagonistes : ' + m.antagonistes : '') + '.'); }
  else if (fi.vaisseau) { const v = fi.vaisseau; p('origine', 'Origine : ' + v.origine + '. Trajet : ' + v.trajet + '.'); p('action', 'Territoire : ' + v.territoire + '.'); }
  else if (fi.cerveau) { const c = fi.cerveau; p('action', 'Rôle : ' + c.role + '. Situation : ' + c.rapports + '.'); }
  else { p('action', fi.description); if (fi.reperes && fi.reperes.length) p('reperes', 'Repères : ' + fi.reperes.slice(0, 4).join(', ') + '.'); if (fi.articulations && fi.articulations.length) p('reperes', 'Articulations : ' + fi.articulations.slice(0, 3).join(', ') + '.'); }
  p('clinique', fi.clinique ? 'En clinique : ' + fi.clinique : '');
  if (fi.confiance === 'minimale') p('confiance', 'Je n’ai pas de fiche détaillée pour cette structure : seulement son nom, sa région et son côté.');
  p('verifier', 'Niveau de confiance ' + fi.confiance + '. À vérifier avec ton cours ou un atlas.');
  return seg.map(s => ({ ...s, ms: Math.max(1800, Math.round(s.texte.length * 62)) }));
}
