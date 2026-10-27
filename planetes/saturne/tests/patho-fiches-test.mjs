/* Phase E : présence et complétude de toutes les fiches de pathologies (catalogue étendu). Vérifie les rubriques obligatoires, les niveaux (modèle 3D, simplifié, schématique, information générale),
   l'avertissement « pas un outil de diagnostic », les références (base3d, mouvements, zones retrouvées dans l'index du modèle), l'unicité des identifiants. Nécessite assets-lourds/anatomie/index.json pour les zones. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOUTES, EXTRA, trouverExtra } from '../pc/anatomie-patho-catalogue.js';
import { PATHOLOGIES } from '../pc/anatomie-pathologies-calcul.js';
import { MOUVEMENTS_V2 } from '../pc/anatomie-mouvements-catalogue.js';
import { creerIndex } from '../pc/anatomie-index.js';
import { htmlPathologie, AVERT_PATHO } from '../pc/anatomie-explic-calcul.js';
import { filtrer, categories } from '../pc/anatomie-catalogue.js';
let n = 0, ko = 0; const ok = (c, m) => { n++; if (!c) { ko++; console.log('ÉCHEC :', m); } };
const chemin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets-lourds/anatomie/index.json');
const index = fs.existsSync(chemin) ? creerIndex(JSON.parse(fs.readFileSync(chemin, 'utf8'))) : null;
const NIVEAUX = ['modèle 3D', 'simplifié', 'schématique', 'information générale'];
const ids = new Set(), mouvIds = new Set(MOUVEMENTS_V2.map(m => m.id)), baseIds = new Set(PATHOLOGIES.map(p => p.id));
for (const p of EXTRA) {
  ok(!ids.has(p.id) && !baseIds.has(p.id), 'identifiant unique : ' + p.id); ids.add(p.id);
  ok(p.nom && p.categorie && NIVEAUX.includes(p.niveau), 'nom, catégorie et niveau : ' + p.id + ' (' + p.niveau + ')');
  const mesure = /Mesures et classifications/.test(p.categorie) || /^Sans objet/.test(p.signes || '') || /^Sans objet/.test(p.causes || ''), traitement = /Corsets/.test(p.categorie);
  for (const r of ['description', 'mecanisme']) ok(typeof p[r] === 'string' && p[r].length > 15, p.id + ' : rubrique « ' + r + ' » renseignée');
  if (!mesure && !traitement) for (const r of ['causes', 'signes']) ok(typeof p[r] === 'string' && p[r].length > 10, p.id + ' : rubrique « ' + r + ' » renseignée');
  if (!mesure) ok(typeof p.appareillage === 'string' && p.appareillage.length > 15, p.id + ' : rubrique « appareillage » renseignée');
  ok((p.consequences || p.complications || '').length > 10, p.id + ' : conséquences fonctionnelles');
  if (!mesure) ok(/À titre informatif|à titre informatif/.test(p.appareillage), p.id + ' : appareillage à titre informatif');
  ok(p.avertissement && /pas un outil de diagnostic/.test(p.avertissement), p.id + ' : avertissement');
  ok(['élevée', 'générique'].includes(p.confiance), p.id + ' : niveau de confiance');
  ok(!/[*#`]/.test(JSON.stringify(p)), p.id + ' : pas de markdown dans le texte (lu à voix haute)');
  if (p.base3d) ok(baseIds.has(p.base3d), p.id + ' : base3d connue (' + p.base3d + ')');
  for (const m of p.mouvements || []) ok(mouvIds.has(m), p.id + ' : mouvement connu (' + m + ')');
  if (p.parametre) ok(p.parametre.min < p.parametre.max && p.parametre.defaut >= p.parametre.min && p.parametre.defaut <= p.parametre.max, p.id + ' : paramètre cohérent');
  if (index) for (const q of p.zone || []) ok(index.chercher(q, { limite: 3 }).length > 0 || index.pieces.some(x => x.nom_en.toLowerCase().includes(q.toLowerCase())), p.id + ' : zone retrouvée dans le modèle (' + q + ')');
  const h = htmlPathologie(p, { mesure: null }); ok(h.includes('Pas un outil de diagnostic') && h.includes('Définition') && h.includes('Rôle de l’orthopédie'), p.id + ' : fenêtre explicative complète');
}
/* ── couverture demandée par la mission : chaque famille doit avoir au moins une fiche ── */
const noms = TOUTES.map(p => p.nom.toLowerCase() + ' ' + (p.alias || []).join(' ').toLowerCase()).join(' | ');
const doit = ['infantile', 'juvénile', 'adolescent', 'adulte', 'hémivertèbre', 'barre', 'papillon', 'formation', 'segmentation', 'neuromusculaire', 'dégénérative', 'syndromique', 'secondaire', 'cervicale', 'thoracique', 'thoraco-lombaire', 'lombaire', 'simple', 'double', 'triple', 'lenke', 'king', 'schwab', 'cobb', 'nash-moe', 'gibbosité', 'déséquilibre', 'risser', 'évolution', 'bascule', 'scheuermann', 'hyperlordose', 'dos plat', 'spondylolisthésis', 'spondylolyse', 'hernie', 'canal lombaire',
  'chêneau', 'boston', 'lyon', 'milwaukee', 'chêneau-rigo', 'plâtres', 'chirurgie de la scoliose',
  'désarticulation de la cheville', 'désarticulation du coude', 'doigts', 'rayons', 'hémicorporectomie', 'multiples', 'moignons plastiques', 'arrachement', 'vasculaire',
  'iso 8548', 'transversales', 'longitudinales', 'fémur proximal', 'tibia', 'fibula', 'radiale', 'cubitale', 'phocomélie', 'ectrodactylie', 'brachydactylie', 'dysplasie de hanche', 'pied bot', 'torticolis', 'genu valgum', 'genu varum', 'genu recurvatum', 'coxa vara', 'coxa valga', 'inégalité', 'pied plat', 'pied creux', 'hallux valgus', 'équin',
  'tétraplégie', 'paraplégie', 'hémiplégie', 'niveaux médullaires', 'asia', 'complètes', 'brown-séquard', 'queue de cheval', 'syndrome central', 'gmfcs', 'spina bifida', 'myéloméningocèle', 'poliomyélite', 'myopathies', 'sla', 'sclérose en plaques', 'ashworth', 'médian', 'ulnaire', 'radial', 'fibulaire', 'sciatique', 'erb', 'klumpke', 'neuropathies', 'steppage', 'fauchage', 'trendelenburg', 'dandinante',
  'fractures', 'pseudarthrose', 'arthrose', 'prothèse totale de hanche', 'prothèse de genou', 'prothèse d’épaule', 'ligaments croisés', 'collatéraux', 'méniscales', 'luxations', 'entorses', 'tendinopathies', 'canal carpien', 'algodystrophie', 'ostéoporose', 'ostéonécrose', 'tumeurs osseuses', 'ostéogenèse imparfaite', 'achondroplasie'];
for (const m of doit) ok(noms.includes(m), 'fiche présente : ' + m);
ok(TOUTES.length >= 130, 'au moins 130 fiches au total (' + TOUTES.length + ')');
/* recherche : par nom, par mot clé, refus honnête */
ok(trouverExtra('montre la scoliose de l’adolescent') && trouverExtra('montre la scoliose de l’adolescent').id === 'scol_adolescent', 'recherche : scoliose de l’adolescent');
ok(trouverExtra('syndrome du canal carpien') && trouverExtra('syndrome du canal carpien').id === 'canal_carpien', 'recherche : canal carpien');
ok(trouverExtra('fonctionnement du moteur à explosion') === null, 'recherche : demande inconnue = null');
ok(filtrer(TOUTES, 'scoliose').length >= 20, 'catalogue : filtre « scoliose »'); ok(categories(TOUTES).length >= 14, 'catalogue : au moins 14 catégories (' + categories(TOUTES).length + ')');
ok(AVERT_PATHO.includes('pas un outil de diagnostic'), 'avertissement général');
console.log(`pathologies (${TOUTES.length} fiches, ${EXTRA.length} nouvelles) : ${n - ko}/${n} vérifications`);
process.exit(ko ? 1 : 0);
