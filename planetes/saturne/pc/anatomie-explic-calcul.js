import { esc, ABSENT } from './anatomie-fiche-calcul.js';
import { cleMuscle, MUSCLES } from './anatomie-muscles.js';

/* ═════════════ ANATOMIE : CONTENU DES FENÊTRES « MOUVEMENT » ET « PATHOLOGIE » (module pur, testé) ═════════════
   Construit le HTML explicatif à partir des données de mouvements (anatomie-mouvement-calcul.js + anatomie-mouvement-textes.js) et de pathologies (anatomie-pathologies-calcul.js
   + anatomie-patho-catalogue.js). Une rubrique sans donnée affiche « non précisé » : jamais de contenu inventé. Le rôle de l'appareillage est donné à titre INFORMATIF. */
export const AVERT_PATHO = 'Contenu pédagogique, pas un outil de diagnostic : un diagnostic, une chirurgie ou un appareillage relèvent d’un médecin et d’un orthoprothésiste. À vérifier avec le cours / un atlas de référence.';
export const NIVEAUX_INFO = { 'information générale': 'Information générale : description classique, sans modélisation 3D exacte.', simplifié: 'Simplifié : la vue 3D est une illustration simplifiée du mécanisme.', schématique: 'Schématique : tracé approximatif, jamais un modèle anatomique exact.', 'modèle 3D': 'Modèle 3D : déformation calculée sur le squelette du modèle (valeurs indicatives).' };

/* Nom français d'une clé de muscle (d'après le modèle) ; à défaut la clé anglaise, signalée. */
export function nomMuscle(index, cle) {
  const p = index.pieces.find(q => q.systeme === 'muscles' && cleMuscle(q.nom_en) === cle);
  return p && p.nom_fr ? p.nom_fr.replace(/\s*\((droit|gauche)\)\s*$/i, '') : p ? (p.nom_la ? p.nom_la + ' (nom latin)' : p.nom_en + ' (terme anglais, à traduire)') : cle + ' (terme à vérifier)';
}
/* Un muscle par clé (les deux côtés ne sont pas répétés) → { cle, nom, id } où id est une pièce du modèle (premier côté trouvé) pour le lien cliquable. */
export function listeMuscles(index, cles) {
  const vus = new Set(), sortie = [];
  for (const c of cles || []) { if (vus.has(c)) continue; vus.add(c); const p = index.pieces.find(q => q.systeme === 'muscles' && cleMuscle(q.nom_en) === c); sortie.push({ cle: c, nom: nomMuscle(index, c), id: p ? p.id : null, innervation: MUSCLES[c] ? MUSCLES[c].innervation : null }); }
  return sortie;
}
/* Nerfs concernés : innervations distinctes des muscles listés (texte des fiches, sans interprétation). */
export function nerfsConcernes(muscles) { const s = new Set(); for (const m of muscles) if (m.innervation) s.add(m.innervation.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim()); return [...s]; }

const liste = (items, vide = ABSENT) => (items && items.length ? '<ul>' + items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>' : '<p class="saf-absent">' + esc(vide) + '</p>');
const para = (t, vide = ABSENT) => (t ? '<p>' + esc(t) + '</p>' : '<p class="saf-absent">' + esc(vide) + '</p>');
const puces = (ms, role) => (ms.length ? '<p class="saf-muscles" data-role="' + role + '">' + ms.map(m => (m.id ? '<button type="button" data-voisine="' + esc(m.id) + '" data-role="' + role + '">' + esc(m.nom) + '</button>' : '<span data-role="' + role + '">' + esc(m.nom) + '</span>')).join('') + '</p>' : '<p class="saf-absent">' + ABSENT + '</p>');

/* Fenêtre explicative d'un mouvement. m = entrée de MOUVEMENTS (avec les textes de anatomie-mouvement-textes.js fusionnés) ; index sert aux noms de muscles. */
export function htmlMouvement(m, index) {
  const ag = listeMuscles(index, m.agonistes), an = listeMuscles(index, m.antagonistes), st = listeMuscles(index, m.stabilisateurs || []), nerfs = nerfsConcernes([...ag, ...an, ...st]);
  let h = '<div class="saf-fiche saf-mvt">';
  h += '<p class="saf-confiance" data-c="moyenne">Mouvement simplifié : amplitudes de référence classiques · à vérifier avec le cours / un atlas</p>';
  h += '<section><h4>Ce qui se passe</h4>' + para(m.explication) + '</section>';
  h += '<section><h4>Étapes</h4>' + (m.etapes && m.etapes.length ? '<ol>' + m.etapes.map(e => '<li>' + esc(e) + '</li>').join('') + '</ol>' : '<p class="saf-absent">' + ABSENT + '</p>') + '</section>';
  h += '<section><h4>Articulations et plan</h4>' + para(m.articulation + (m.plan ? ' — plan ' + m.plan : '')) + '</section>';
  h += '<section><h4>Muscles</h4><p class="saf-legende"><i data-role="agoniste"></i> agonistes (moteurs) <i data-role="antagoniste"></i> antagonistes <i data-role="stabilisateur"></i> stabilisateurs</p>';
  h += '<h5>Agonistes</h5>' + puces(ag, 'agoniste') + '<h5>Antagonistes</h5>' + puces(an, 'antagoniste') + '<h5>Stabilisateurs</h5>' + puces(st, 'stabilisateur') + '</section>';
  h += '<section><h4>Amplitudes</h4>' + (m.amplitudes && m.amplitudes.length ? '<table class="saf-table"><thead><tr><th>Articulation</th><th>Mouvement</th><th>Référence</th><th>Dans cette animation</th></tr></thead><tbody>' + m.amplitudes.map(a => '<tr><td>' + esc(a.articulation) + '</td><td>' + esc(a.mouvement) + '</td><td>' + esc(a.reference) + '</td><td>' + esc(a.utilise) + '</td></tr>').join('') + '</tbody></table>' : '') + para(m.amplitude) + '</section>';
  h += '<section><h4>Nerfs concernés</h4>' + liste(nerfs, 'les fiches des muscles ne précisent pas leur innervation') + '</section>';
  h += '<section><h4>Mécanisme</h4>' + para(m.mecanisme || m.explication) + '</section>';
  h += '<section><h4>Conséquences fonctionnelles</h4>' + para(m.consequences) + '</section>';
  h += '<section><h4>Rôle de l’appareillage (à titre informatif)</h4>' + para(m.appareillage) + '</section>';
  h += '<p class="saf-avert">' + esc(AVERT_PATHO) + '</p></div>';
  return h;
}

/* Fenêtre explicative d'une pathologie. `mesure` = texte mesuré sur le modèle (angle de Cobb…) ; `niveau` = clé de NIVEAUX_INFO. */
export function htmlPathologie(p, { mesure = null, muscles = [], nerfs = [], mouvements = [] } = {}) {
  const niveau = p.niveau || (p.categorie === 'déformation du rachis' || /amputation|déficience|fracture|attitude|déformation/i.test(p.categorie || '') ? 'modèle 3D' : 'information générale');
  const rub = (titre, t) => '<section><h4>' + esc(titre) + '</h4>' + para(t) + '</section>';
  let h = '<div class="saf-fiche saf-patho">';
  h += '<p class="saf-alerte" role="note"><b>Pas un outil de diagnostic.</b> Information pédagogique à vérifier avec le cours / un atlas.</p>';
  h += '<p class="saf-confiance" data-c="' + (p.confiance === 'élevée' ? 'haute' : 'moyenne') + '">Niveau de confiance : <b>' + esc(p.confiance || 'à préciser') + '</b> · ' + esc(NIVEAUX_INFO[niveau] || niveau) + '</p>';
  if (mesure) h += '<section><h4>Mesure sur le modèle</h4><p class="saf-mesure">' + esc(mesure) + '</p></section>';
  h += rub('Définition', p.description) + rub('Causes', p.causes) + rub('Mécanisme', p.mecanisme);
  h += rub('Signes', p.signes) + rub('Conséquences fonctionnelles', p.consequences || p.complications);
  if (p.moignon) h += rub('Moignon', p.moignon);
  if (p.classification) h += rub('Classification', p.classification);
  if (p.mesures) h += rub('Mesures et repères', p.mesures);
  h += rub('Rôle de l’orthopédie et de l’appareillage (à titre informatif)', [p.appareillage, p.prise].filter(Boolean).join(' ') || null);
  if (muscles.length) h += '<section><h4>Muscles concernés</h4>' + puces(muscles, 'agoniste') + '</section>';
  if (nerfs.length) h += '<section><h4>Nerfs concernés</h4>' + liste(nerfs) + '</section>';
  if (mouvements.length) h += '<section><h4>Mouvement concerné</h4><p class="saf-liens">' + mouvements.map(x => '<button type="button" data-mouvement="' + esc(x.id) + '">' + esc(x.nom) + '</button>').join('') + '</p></section>';
  if (p.points) h += rub('À retenir', p.points);
  h += '<p class="saf-avert">' + esc(AVERT_PATHO) + '</p></div>';
  return h;
}

/* Segments lus par Raylé pour un mouvement ou une pathologie. */
export function segmentsMouvement(m, index) {
  const ag = listeMuscles(index, m.agonistes).map(x => x.nom), an = listeMuscles(index, m.antagonistes).map(x => x.nom), seg = [];
  seg.push({ cle: 'resume', texte: m.nom + '. ' + m.explication });
  if (m.etapes && m.etapes.length) seg.push({ cle: 'etapes', texte: 'En plusieurs étapes. ' + m.etapes.map((e, i) => (i + 1) + '. ' + e).join(' ') });
  seg.push({ cle: 'muscles', texte: 'Muscles moteurs, en rouge : ' + ag.slice(0, 6).join(', ') + '. Antagonistes, en bleu : ' + an.slice(0, 5).join(', ') + '.' });
  seg.push({ cle: 'amplitude', texte: 'Amplitude de référence : ' + m.amplitude + '.' });
  if (m.consequences) seg.push({ cle: 'consequences', texte: m.consequences });
  seg.push({ cle: 'verifier', texte: 'Mouvement simplifié. À vérifier avec ton cours ou un atlas.' });
  return seg.map(s => ({ ...s, ms: Math.max(1800, Math.round(s.texte.length * 62)) }));
}
export function segmentsPathologie(p, mesure) {
  const seg = []; const add = (cle, t) => { if (t) seg.push({ cle, texte: t }); };
  add('resume', p.nom + '. ' + (p.description || '')); add('mesure', mesure); add('signes', p.signes && 'Signes : ' + p.signes); add('causes', p.causes && 'Causes : ' + p.causes);
  add('consequences', (p.consequences || p.complications) && 'Conséquences : ' + (p.consequences || p.complications)); add('appareillage', p.appareillage && 'Appareillage, à titre informatif : ' + p.appareillage); add('prise', p.prise && 'Prise en charge : ' + p.prise);
  add('avert', 'Ce contenu est pédagogique, ce n’est pas un outil de diagnostic. À vérifier avec ton cours ou un atlas.');
  return seg.map(s => ({ ...s, ms: Math.max(1800, Math.round(s.texte.length * 62)) }));
}
