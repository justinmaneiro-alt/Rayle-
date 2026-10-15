/* ═════════════ REGISTRE DES STRUCTURES : recherche, fiches, liens os ↔ muscles ═════════════
   Identifiants d'instance : 'humerus:D' (os, muscle, nerf symétriques : D = droite, G = gauche du patient),
   'vertebre-L4', 'cote-5:G', 'coeur', 'moelle'. Les repères palpables sont 'repere:eias:D'. */
import { OS, VERTEBRES, REPERES, ficheVertebre, ficheCote } from './donnees-os.js?v=2026.10.15.7';
import { MUSCLES } from './donnees-muscles.js?v=2026.10.15.7';
import { NERFS, MOELLE, NERFS_SPINAUX, ORGANES, DERMATOMES } from './donnees-nerfs-organes.js?v=2026.10.15.7';
import { MUSCLES_HD, TENDONS_HD, VAISSEAUX_HD, ORGANES_HD, NERFS_HD } from './donnees-corps.js?v=2026.10.15.7';
import { FICHES_CORPS } from './fiches-corps.js?v=2026.10.15.7';

export const norm = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[œ]/g, 'oe').replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/** type → { base: définition } */
const REG = new Map();
const ajoute = (base, type, def) => REG.set(base, { base, type, def });
OS.forEach(o => ajoute(o.id, 'os', o));
VERTEBRES.forEach(v => ajoute('vertebre-' + v.id, 'os', Object.assign({ id: 'vertebre-' + v.id, sym: false, vert: v }, ficheVertebre(v))));
for (let i = 1; i <= 12; i++) ajoute('cote-' + i, 'os', Object.assign({ id: 'cote-' + i, sym: true, rang: i }, ficheCote(i)));
MUSCLES.forEach(o => ajoute(o.id, 'muscle', o));
NERFS.forEach(o => ajoute(o.id, 'nerf', o));
ajoute(MOELLE.id, 'nerf', MOELLE); ajoute(NERFS_SPINAUX.id, 'nerf', NERFS_SPINAUX);
ORGANES.forEach(o => ajoute(o.id, 'organe', o));
/** Structures haute fidélité (corps BodyParts3D) : ligne [id, nom, latin, région, concepts…] + fiche sourcée (fiches-corps.js). Un muscle qui a déjà une forme schématique garde sa définition (et sa fiche) ;
    on lui ajoute seulement le nom latin. Un champ absent des sources reste vide : la fiche l'affiche comme « non renseigné ». */
export const NON_RENSEIGNE = 'Non renseigné dans les sources retenues.';
function defCorps(r, type, symDefaut) {
  const f = FICHES_CORPS[r[0]] || {}, sym = symDefaut !== undefined ? symDefaut : ((r[4] || []).length ? r[4].some(x => String(x).includes('{c}')) : true);     // sans concept : structure reconstituée ou fusionnée, toujours droite et gauche
  return { id: r[0], nom: r[1], latin: r[2], region: r[3], sym, membre: (type === 'artere' || type === 'veine' ? r[6] : r[5]) !== undefined ? (type === 'artere' || type === 'veine' ? r[6] : r[5]) : null, hd: true, racines: f.racines || '', territoire: f.territoire || '',
    origine: { os: f.origine && f.origine.os || null, txt: f.origine && f.origine.txt || '' }, insertion: { os: f.insertion && f.insertion.os || null, txt: f.insertion && f.insertion.txt || '' },
    action: f.action || '', innervation: f.innervation || '', vascularisation: f.vascularisation || '', trajet: f.rapports || '', clinique: f.clinique || '', source: f.source || '', description: f.description || '', role: f.role || '' };
}
for (const r of MUSCLES_HD) { const ex = REG.get(r[0]); if (ex) { if (!ex.def.latin) ex.def.latin = r[2]; ex.def.hd = true; const fc = FICHES_CORPS[r[0]]; if (fc && fc.source && !ex.def.source) ex.def.source = fc.source; } else ajoute(r[0], 'muscle', defCorps(r, 'muscle')); }
for (const r of TENDONS_HD) ajoute(r[0], 'tendon', defCorps(r, 'tendon'));
for (const r of VAISSEAUX_HD) ajoute(r[0], r[5] === 'veine' ? 'veine' : 'artere', defCorps(r, r[5]));
for (const r of NERFS_HD) { const ex = REG.get(r[0]), fc = FICHES_CORPS[r[0]] || {}; if (!ex) ajoute(r[0], 'nerf', defCorps(r, 'nerf')); else { if (!ex.def.latin) ex.def.latin = r[2]; if (fc.source && !ex.def.source) ex.def.source = fc.source; ex.def.hd = true; } }
for (const r of ORGANES_HD) { const ex = REG.get(r[0]); if (ex) { if (!ex.def.latin) ex.def.latin = r[2]; ex.def.hd = true; } else ajoute(r[0], 'organe', defCorps(r, 'organe')); }
REPERES.forEach(o => ajoute('repere:' + o.id, 'repere', Object.assign({ sym: o.sym !== false }, o)));
DERMATOMES.forEach(o => ajoute('dermatome:' + o.id, 'dermatome', Object.assign({ sym: true }, o)));

export const base = id => String(id).split(':')[0] === 'repere' ? 'repere:' + String(id).split(':')[1] : String(id).split(':')[0];
export const cote = id => { const p = String(id).split(':'); const c = p[p.length - 1]; return c === 'D' || c === 'G' ? c : null; };
export const definition = id => { const r = REG.get(base(id)); return r ? r.def : null; };
export const typeDe = id => { const r = REG.get(base(id)); return r ? r.type : null; };
export const estSym = id => { const d = definition(id); return !!(d && d.sym); };
export const instance = (b, c) => { const d = definition(b); return d && d.sym ? b + ':' + (c || 'D') : b; };
export const instances = b => { const d = definition(b); return d && d.sym ? [b + ':D', b + ':G'] : [b]; };
export const NOM_COTE = { D: 'droit', G: 'gauche' };
const accorde = (nom, c, genre) => !c ? nom : nom + ' ' + (genre === 'f' ? (c === 'D' ? 'droite' : 'gauche') : NOM_COTE[c]);

export const nomAffiche = id => {
  const d = definition(id); if (!d) return String(id);
  const c = cote(id);
  const feminin = /^(Clavicule|Scapula|Patella|Fibula|Ulna|Côte|Mandibule|Vessie|Rate|Thyro|Trachée|Moelle|Épine|Tubérosité|Malléole|Symphyse|Crête|Tête|Fourchette|Protubérance|Vertèbre|Base|Apophyse|Angle|Fosse|Pelote)/.test(d.nom);
  return accorde(d.nom, c, feminin ? 'f' : 'm');
};

export const tous = type => Array.from(REG.values()).filter(r => !type || r.type === type).map(r => r.def);
export const basesDe = type => Array.from(REG.values()).filter(r => r.type === type).map(r => r.base);

// ── Alias ──
const MANUELS = {
  'os-coxal': ['bassin', 'os iliaque', 'os de la hanche', 'ilium', 'iliaque'],
  humerus: ['os du bras'], femur: ['os de la cuisse', 'os de cuisse'], tibia: ['tibia'], fibula: ['perone'], radius: ['radius'], ulna: ['cubitus'], scapula: ['omoplate'], patella: ['rotule'],
  crane: ['tete osseuse', 'cranium'], sternum: ['sternum'], carpe: ['os du poignet', 'os carpiens', 'carpiens'], metacarpiens: ['metacarpes', 'os de la paume'], 'phalanges-main': ['phalanges de la main', 'doigts osseux'], 'phalanges-pied': ['phalanges du pied', 'orteils osseux'],
  talus: ['astragale'], calcaneus: ['calcaneum', 'os du talon'], 'tarse-anterieur': ['tarse', 'tarsiens'], metatarsiens: ['metatarses', 'os de l avant pied'],
  'biceps-brachial': ['biceps', 'biceps du bras'], 'triceps-brachial': ['triceps', 'triceps du bras'], deltoide: ['deltoides'], 'grand-pectoral': ['pectoral', 'pectoraux', 'grand pectoral'],
  'grand-dorsal': ['dorsal', 'grand dorsal', 'grands dorsaux'], trapeze: ['trapezes'], 'grand-fessier': ['grand fessier', 'fessier', 'grand glutaeus', 'gluteus maximus'], 'moyen-fessier': ['moyen fessier', 'gluteus medius'],
  'droit-femoral': ['droit anterieur', 'rectus femoris'], 'vaste-lateral': ['vaste externe'], 'vaste-medial': ['vaste interne'], 'biceps-femoral': ['biceps crural'], 'semi-tendineux': ['semi tendineux', 'demi tendineux'], 'semi-membraneux': ['semi membraneux', 'demi membraneux'],
  'tibial-anterieur': ['jambier anterieur', 'tibialis anterior'], gastrocnemien: ['jumeaux', 'gastrocnemiens', 'mollet', 'gastrocnemius'], soleaire: ['soleus'], 'grand-droit-abdomen': ['grand droit', 'abdominaux', 'abdos', 'grands droits'],
  'sterno-cleido-mastoidien': ['sterno cleido mastoidien', 'scm', 'sterno mastoidien'], 'psoas-iliaque': ['psoas', 'ilio psoas', 'iliopsoas'], 'tenseur-fascia-lata': ['tenseur du fascia lata', 'tfl', 'tenseur du fascia'], sartorius: ['couturier'],
  'adducteur-long': ['long adducteur', 'moyen adducteur', 'adducteur'], gracile: ['droit interne'], 'erecteurs-rachis': ['erecteurs du rachis', 'erecteurs spinaux', 'muscles paravertebraux', 'paravertebraux', 'spinaux'],
  'brachio-radial': ['long supinateur', 'brachio radial', 'brachioradial'], 'rond-pronateur': ['rond pronateur', 'pronateur'], 'extenseur-des-doigts': ['extenseur commun des doigts'], 'supra-epineux': ['sus epineux', 'supra epineux'], 'infra-epineux': ['sous epineux', 'infra epineux'],
  'oblique-externe': ['grand oblique', 'obliques', 'oblique externe', 'oblique'], fibulaires: ['peroniers', 'long fibulaire', 'court fibulaire', 'fibulaire long', 'fibulaire court'], 'plexus-brachial': ['plexus brachial'],
  'nerf-sciatique': ['sciatique', 'nerf sciatique', 'nerf ischiatique'], 'nerf-ulnaire': ['nerf cubital', 'cubital'], 'nerf-fibulaire-commun': ['sciatique poplite externe', 'nerf peronier', 'nerf fibulaire'], 'nerf-tibial': ['sciatique poplite interne'], 'nerf-femoral': ['nerf crural', 'crural'], 'nerf-median': ['median'],
  moelle: ['moelle epiniere', 'moelle spinale', 'moelle', 'cordon medullaire'], encephale: ['cerveau', 'cervelet', 'encephale'], coeur: ['coeur'], 'poumon-droit': ['poumon droit'], 'poumon-gauche': ['poumon gauche'], 'rein-droit': ['rein droit'], 'rein-gauche': ['rein gauche'],
  'intestin-grele': ['intestin', 'grele', 'intestins'], colon: ['gros intestin'], diaphragme: ['diaphragme'], thyroide: ['thyroide'], vessie: ['vessie'], foie: ['foie'], estomac: ['estomac'], rate: ['rate'], pancreas: ['pancreas'], trachee: ['trachee'],
  'vertebre-C1': ['atlas'], 'vertebre-C2': ['axis'], 'vertebre-C7': ['vertebre proeminente'], 'repere:epineuse-l4': ['ligne de tuffier'], 'repere:c7': ['vertebre proeminente c7']
};
// groupes (plusieurs structures d'un coup) : alias → bases
export const GROUPES = {
  quadriceps: { nom: 'Quadriceps', type: 'muscle', bases: ['droit-femoral', 'vaste-lateral', 'vaste-medial'] },
  'ischio-jambiers': { nom: 'Ischio-jambiers', type: 'muscle', bases: ['biceps-femoral', 'semi-tendineux', 'semi-membraneux'] },
  'triceps-sural': { nom: 'Triceps sural', type: 'muscle', bases: ['gastrocnemien', 'soleaire'] },
  fessiers: { nom: 'Fessiers', type: 'muscle', bases: ['grand-fessier', 'moyen-fessier'] },
  coiffe: { nom: 'Coiffe des rotateurs', type: 'muscle', bases: ['supra-epineux', 'infra-epineux'] },
  rachis: { nom: 'Rachis', type: 'os', bases: VERTEBRES.map(v => 'vertebre-' + v.id).concat(['sacrum', 'coccyx']) },
  thorax: { nom: 'Cage thoracique', type: 'os', bases: ['sternum'].concat(Array.from({ length: 12 }, (_, i) => 'cote-' + (i + 1))) },
  main: { nom: 'Main', type: 'os', bases: ['carpe', 'metacarpiens', 'phalanges-main'] },
  pied: { nom: 'Pied', type: 'os', bases: ['talus', 'calcaneus', 'tarse-anterieur', 'metatarsiens', 'phalanges-pied'] },
  bassin: { nom: 'Bassin', type: 'os', bases: ['os-coxal', 'sacrum', 'coccyx'] }
};
const ALIAS_GROUPES = { quadriceps: ['quadriceps', 'quadri'], 'ischio-jambiers': ['ischio jambiers', 'ischios', 'ischio jambier', 'muscles ischio jambiers'], 'triceps-sural': ['triceps sural', 'muscles du mollet'], fessiers: ['fessiers', 'muscles fessiers', 'glutes', 'gluteaux'],
  coiffe: ['coiffe des rotateurs', 'coiffe'], rachis: ['rachis', 'colonne vertebrale', 'colonne', 'vertebres'], thorax: ['cage thoracique', 'thorax osseux', 'cotes'], main: ['main'], pied: ['pied'], bassin: ['bassin osseux', 'ceinture pelvienne'] };

function aliasDe(b, r) {
  const d = r.def, s = new Set();
  const n0 = norm(d.nom); s.add(n0);
  String(d.nom).split(/[()]/).map(norm).filter(x => x.length > 2).forEach(x => s.add(x));
  // « Épine iliaque antéro-supérieure (EIAS) » → eias
  (String(d.nom).match(/\(([A-Za-zÀ-ÿ0-9 -]+)\)/g) || []).forEach(x => s.add(norm(x)));
  (MANUELS[b] || []).forEach(a => s.add(norm(a)));
  if (b.startsWith('repere:')) s.delete(norm(d.nom).split(' ')[0]);
  if (r.type === 'os' && b.startsWith('cote-')) s.add('cote ' + d.rang);
  if (r.type === 'os' && b.startsWith('vertebre-')) { s.add(norm(d.vert.id)); s.add('vertebre ' + norm(d.vert.id)); s.delete(''); }
  return Array.from(s).filter(x => x && x.length >= 2);
}
let INDEX = null;
function index() {
  if (INDEX) return INDEX;
  const liste = [];
  for (const [b, r] of REG) { if (r.type === 'dermatome') continue; aliasDe(b, r).forEach(a => liste.push({ a, b, type: r.type, groupe: false })); }
  for (const g of Object.keys(GROUPES)) (ALIAS_GROUPES[g] || []).forEach(a => liste.push({ a: norm(a), b: g, type: GROUPES[g].type, groupe: true }));
  // priorité : alias le plus long d'abord ; os avant muscles à longueur égale n'importe pas, on garde l'ordre d'apparition
  liste.sort((x, y) => y.a.length - x.a.length);
  INDEX = liste; return liste;
}

const estMot = (t, a) => {
  // alias présent comme suite de mots entiers, pluriel en « s » toléré (« les humérus », « côtes »)
  const re = new RegExp('(^| )' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(s|x)?( |$)');
  return re.test(t);
};

/** Repère d'un côté dans la phrase : « droit » / « gauche » */
export function coteDans(texte) {
  const t = ' ' + norm(texte) + ' ';
  if (/ (droit|droite|droits|droites)( |$)/.test(t)) return 'D';
  if (/ (gauche|gauches)( |$)/.test(t)) return 'G';
  return null;
}

/** Retrouve la structure demandée dans une phrase. → { type, base, ids, cote, nom, groupe? } ou null.
 *  « Où s'insère le biceps ? » → biceps-brachial ; « le biceps femoral » → biceps-femoral (alias le plus long). */
export function trouver(texte) {
  const t = norm(texte);
  if (!t) return null;
  const c = coteDans(texte);
  // vertèbres : « L4 », « vertèbre T12 » ; côtes : « 5e côte », « côte 5 »
  let m = t.match(/(?:^| )([ctl]) ?(\d{1,2})(?: |$)/);
  if (m) { const id = m[1].toUpperCase() + parseInt(m[2], 10); if (VERTEBRES.some(v => v.id === id) && /vertebre|rachis|dorsale|lombaire|cervicale|colonne|epineuse|\b[ctl] ?\d/.test(t)) return { type: 'os', base: 'vertebre-' + id, ids: ['vertebre-' + id], cote: null, nom: 'Vertèbre ' + id }; }
  m = t.match(/(?:cote (\d{1,2})|(\d{1,2}) ?(?:e|eme|ieme|er|ere)? cote)/);
  if (m) { const i = parseInt(m[1] || m[2], 10); if (i >= 1 && i <= 12) return { type: 'os', base: 'cote-' + i, ids: instances('cote-' + i).filter(x => !c || cote(x) === c), cote: c, nom: 'Côte ' + i }; }
  for (const e of index()) {
    if (!estMot(t, e.a)) continue;
    if (e.groupe) {
      const g = GROUPES[e.b]; const ids = [];
      g.bases.forEach(b => instances(b).forEach(i => { if (!c || !cote(i) || cote(i) === c) ids.push(i); }));
      return { type: g.type, base: e.b, ids, cote: c, nom: g.nom, groupe: true };
    }
    const d = definition(e.b);
    const ids = instances(e.b).filter(i => !c || !cote(i) || cote(i) === c);
    return { type: e.type, base: e.b, ids, cote: d.sym ? c : null, nom: d.nom };
  }
  return null;
}

// ── Liens os ↔ muscles ──
const MUSCLES_PAR_OS = (() => {
  const m = new Map();
  const add = (os, muscle, role) => { if (!os) return; if (!m.has(os)) m.set(os, []); const l = m.get(os); if (!l.some(x => x.muscle === muscle && x.role === role)) l.push({ muscle, role }); };
  for (const r of REG.values()) if (r.type === 'muscle') { const u = r.def; add(u.origine && u.origine.os, u.id, 'origine'); add(u.insertion && u.insertion.os, u.id, 'insertion'); }
  return m;
})();
export const musclesDe = osBase => MUSCLES_PAR_OS.get(osBase) || [];

// ── Fiches ──
const L = (label, v) => v && (!Array.isArray(v) || v.length) ? { label, valeur: v } : null;
/** fiche(id) → { id, type, nom, sous, champs:[{label, valeur}], resume } */
export function fiche(id) {
  const d = definition(id); if (!d) return null;
  const type = typeDe(id), c = cote(id), nom = nomAffiche(id);
  let champs = [], sous = '';
  if (type === 'os') {
    sous = (d.latin ? d.latin + ' · ' : '') + (d.region || '');
    const mus = musclesDe(base(id)).map(x => { const u = definition(x.muscle); return u.nom + ' (' + x.role + ')'; });
    champs = [L('Description', d.description), L('Repères palpables', d.reperes), L('Articulations', d.articulations), L('Rôle', d.role), L('Muscles liés', mus), L('Intérêt orthopédique', d.ortho)];
  } else if (type === 'muscle' || type === 'tendon' || type === 'artere' || type === 'veine') {
    sous = (type === 'muscle' ? 'Muscle' : type === 'tendon' ? 'Tendon, fascia ou membrane' : type === 'artere' ? 'Artère' : 'Veine') + (d.latin ? ' · ' + d.latin : '') + (d.region ? ' · ' + d.region : '') + (c ? ' · côté ' + NOM_COTE[c] : '');
    const vide = x => x && String(x).trim() ? x : (d.hd ? NON_RENSEIGNE : '');
    champs = type === 'muscle' || type === 'tendon'
      ? [L('Origine', vide(d.origine && d.origine.txt)), L('Terminaison (insertion)', vide(d.insertion && d.insertion.txt)), L('Trajet et rapports', vide(d.trajet)), L('Action', vide(d.action)), L('Innervation', vide(d.innervation)), L('Vascularisation', d.hd ? vide(d.vascularisation) : d.vascularisation), L('Clinique', d.clinique), L('Source', d.source)]
      : [L('Origine', vide(d.origine && d.origine.txt)), L('Trajet et terminaison', vide(d.trajet)), L(type === 'artere' ? 'Branches et territoire irrigué' : 'Affluents et territoire drainé', vide(d.vascularisation)), L('Clinique', d.clinique), L('Source', d.source)];
  } else if (type === 'nerf') {
    sous = 'Nerf' + (c ? ' · côté ' + NOM_COTE[c] : '') + (d.racines ? ' · ' + d.racines : '');
    champs = [L('Description', d.description), L('Territoire', d.territoire), L('Clinique', d.clinique), L('Remarque', d.hd && /^(plexus|nerf)-(?!optique|trochleaire|ophtalmique)/.test(d.id) ? "Tracé schématique reconstitué d'après Gray (1918) et posé sur les os, muscles et artères du modèle : BodyParts3D ne contient pas de nerf périphérique." : ''), L('Source', d.source)];
  } else if (type === 'organe') {
    sous = (d.latin ? d.latin + ' · ' : '') + (d.region || 'Organe');
    const vide = x => x && String(x).trim() ? x : (d.hd && !d.description ? NON_RENSEIGNE : '');
    champs = [L('Description', vide(d.description)), L('Rôle', d.role || (d.hd && !d.description ? NON_RENSEIGNE : '')), L('Situation', d.situation), L('Clinique', d.clinique), L('Source', d.source || (d.hd ? 'Forme : BodyParts3D (DBCLS, CC BY 4.0)' : ''))];
  } else if (type === 'repere') {
    sous = 'Repère palpable' + (c ? ' · côté ' + NOM_COTE[c] : '');
    champs = [L('Comment le palper', d.palpation), L('Intérêt', d.utilite)];
  } else if (type === 'dermatome') {
    sous = 'Dermatome · racine ' + d.racine;
    champs = [L('Territoire', d.territoire), L('Test clinique', d.test)];
  }
  champs = champs.filter(Boolean);
  return { id, type, nom, sous, champs, resume: resume(id) };
}

const tronque = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; const cut = s.slice(0, n); const p = cut.lastIndexOf(' '); return cut.slice(0, p > 40 ? p : n) + '…'; };
const dernier = s => String(s || '').replace(/[.\s]+$/, '');
/** Phrase(s) que Raylé dit à voix haute : courte, sans liste interminable. */
export function resume(id, question) {
  const d = definition(id); if (!d) return '';
  const type = typeDe(id), nom = nomAffiche(id);
  const q = norm(question || '');
  if (type === 'muscle') {
    const o = dernier(d.origine.txt), i = dernier(d.insertion.txt);
    if (/s ?insere|insertion|terminaison|se termine|attache/.test(q)) return `${nom} : l'insertion (terminaison) se fait sur : ${i}. L'origine : ${o}. ${tronque('Action : ' + d.action, 140)}`;
    if (/innerv|nerf/.test(q)) return `${nom} : innervation, ${d.innervation}.`;
    if (/action|sert|fonction|role|mouvement/.test(q)) return `${nom} : ${tronque(d.action, 220)}`;
    return `${nom}. Origine : ${o}. Terminaison : ${i}. Action : ${tronque(d.action, 150)} Innervation : ${d.innervation}.`;
  }
  if (type === 'os') return `${nom}. ${tronque(d.description, 170)} ${d.articulations && d.articulations.length ? 'Il s\'articule avec : ' + d.articulations.slice(0, 3).join(', ') + '.' : ''}`.replace(/\s+/g, ' ').trim();
  if (type === 'nerf') return `${nom}${d.racines ? ' (' + d.racines + ')' : ''}. ${tronque(d.description, 170)} Territoire : ${tronque(d.territoire, 120)}`;
  if (type === 'organe') return `${nom}. ${tronque(d.description, 120)} Rôle : ${tronque(d.role, 110)}`;
  if (type === 'repere') return `${nom}. ${tronque(d.palpation, 160)}`;
  return nom;
}

/** Tout ce qui est visible par défaut pour un id d'os : instances D et G des os symétriques */
export const COULEURS = { os: 0xe8dcc0, muscle: 0xb23a3a, tendon: 0xe9e3d2, nerf: 0xffd24d, artere: 0xc0392b, veine: 0x3f6fcf, organe: 0xe0a0a0, repere: 0x4de3ff };
