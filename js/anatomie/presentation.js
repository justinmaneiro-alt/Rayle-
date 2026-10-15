/* ═════════════ PRÉSENTATIONS ANIMÉES : fabrication des scripts (pur, testable sans navigateur) ═════════════
   Un script = { id, titre, sous, etapes:[{ id, titre, sous, narration, phrases, scene }], references:[…], referencesDites }.
   TOUT le texte vient des fiches de la base de connaissances (registre.js, fiches-*.js, donnees-cerveau.js) : les phrases de liaison sont génériques
   (« Voici… », « Passons à… »), jamais un fait. Une information absente des fiches est dite comme telle (« Cette information n'est pas renseignée… »).
   `scene` décrit ce que le lecteur doit montrer ; il est interprété par lecteur-anatomie.js (corps) ou par la fenêtre Cerveau (cerveau) :
     calques:[…]  visibles:[ids]|null  fantomes:[ids]  contexte:['os']  accent:[ids]  cadrer:[ids]  az/el/facteur  orbite:bool
     etiquettes:[{ phrase:n, texte, classe, ancre:{ bout:0|1, sid } | { centre:sid } | { contact:[sidA, sidB], cote:0|1 } }]
   Corps entier : ids d'instance ('femur:D'). Cerveau : scene = { zone, reseau, vue, coupe, calques }. */
import * as R from './registre.js?v=2026.10.15.5';
import { SOURCE_GRAY } from './fiches-outils.js?v=2026.10.15.5';
import { ZONES_CERVEAU, ZONE_PAR_ID, RESEAU_PAR_ID, RESEAUX_CERVEAU, SOURCES_CERVEAU, FAISCEAU_PAR_ID, MENTION_CEREBRALE } from './donnees-cerveau.js?v=2026.10.15.5';
import { trouverZone, trouverReseau, nomLatin } from './cerveau-recherche.js?v=2026.10.15.5';

export const MANQUE = "Cette information n'est pas renseignée dans les sources que Raylé utilise.";
export const REFERENCES_CORPS = [
  'Terminologia Anatomica (noms français et latins)',
  SOURCE_GRAY + ' (texte reformulé en français)',
  'BodyParts3D, © DBCLS, CC BY 4.0 (formes 3D)'
];
const REFERENCES_DITES_CORPS = "Références : la Terminologia Anatomica pour les noms, Gray's Anatomy de 1918 pour les descriptions, et BodyParts3D pour les formes en trois dimensions.";

// ───────────────────────── découpage en phrases ─────────────────────────
const ABREV = /(?:\b(?:ex|cf|fig|env|etc|vs|dr|pr|art|chap|vol|éd)\.|n°)$/i;
/** Texte → phrases courtes (≤ max caractères), sans couper après une abréviation ni avant une minuscule */
export function phrases(texte, max = 230) {
  const t = String(texte || '').replace(/\s+/g, ' ').trim(); if (!t) return [];
  const brut = []; let debut = 0;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]; if (!(ch === '.' || ch === '!' || ch === '?' || ch === '…') || !(i + 1 >= t.length || t[i + 1] === ' ')) continue;
    const avant = t.slice(debut, i + 1), suite = t.slice(i + 2, i + 3);
    if (ch === '.' && ABREV.test(avant)) continue;
    if (suite && !/[A-ZÀ-ÖØ-Þ«“"(0-9]/.test(suite)) continue;
    brut.push(avant.trim()); debut = i + 2;
  }
  if (debut < t.length) brut.push(t.slice(debut).trim());
  const sortie = [];
  for (const p of brut) {
    if (p.length <= max) { sortie.push(p); continue; }
    let reste = p;
    while (reste.length > max) {
      let c = Math.max(reste.lastIndexOf('; ', max), reste.lastIndexOf(', ', max), reste.lastIndexOf(' : ', max));
      if (c < max * .4) c = reste.lastIndexOf(' ', max);
      if (c < 20) c = max;
      sortie.push(reste.slice(0, c + 1).trim()); reste = reste.slice(c + 1).trim();
    }
    if (reste) sortie.push(reste);
  }
  return sortie.filter(Boolean);
}

const vide = v => v == null || (Array.isArray(v) ? !v.length : !String(v).trim() || String(v).trim() === R.NON_RENSEIGNE);
const point = s => String(s || '').replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
const maj = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const liste = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' et ' + a[a.length - 1];
const champ = (f, ...labels) => { for (const l of labels) { const c = f.champs.find(x => x.label === l); if (c && !vide(c.valeur)) return c.valeur; } return null; };
const texteChamp = v => Array.isArray(v) ? liste(v.map(point)) : point(v);
const etape = (id, titre, sous, narration, scene, extra) => Object.assign({ id, titre, sous: sous || '', narration, phrases: phrases(narration), scene: scene || {} }, extra || {});
const CALQUE_DE_TYPE = { os: 'squelette', cartilage: 'squelette', muscle: 'muscles', tendon: 'muscles', artere: 'arteres', veine: 'veines', nerf: 'nerfs', organe: 'organes' };
const OS_LONGS = ['humerus', 'radius', 'ulna', 'femur', 'tibia', 'fibula', 'clavicule'];
const nomCourt = id => R.nomAffiche(id);
const libelle = (nom, latin) => !latin || R.norm(latin).slice(0, 5) === R.norm(nom).slice(0, 5) ? nom : nom + ' · ' + latin;      // « Fémur · Femur » = doublon : le nom seul
const sansCote = n => String(n).replace(/ (droit|gauche|droite)$/, '');

// ───────────────────────── une structure ─────────────────────────
/** id d'instance → script. court:true raccourcit (utilisé pour les groupes). */
export function scriptStructure(id, opts = {}) {
  const f = R.fiche(id); if (!f) return null;
  const d = R.definition(id), type = R.typeDe(id), nomC = nomCourt(id), cal = CALQUE_DE_TYPE[type] || 'squelette';
  const base = R.base(id), c = R.cote(id), nom = sansCote(nomC), dit = c ? nom + ', côté ' + (c === 'D' ? 'droit' : 'gauche') : nom;
  const E = [], sous = f.sous || '';
  const soloScene = (extra = {}) => Object.assign({ calques: [cal], visibles: [id], accent: [id], cadrer: [id] }, extra);
  const avecOs = (ids) => ids.filter(Boolean);
  const osLies = () => { const o = []; for (const x of [d.origine && d.origine.os, d.insertion && d.insertion.os]) if (x && R.definition(x)) o.push(...(R.definition(x).sym ? [R.instance(x, c || 'D')] : [x])); return Array.from(new Set(o)); };

  if (type === 'os') {
    const desc = champ(f, 'Description'), longs = OS_LONGS.includes(base);
    E.push(etape('intro', nomC, sous, `${dit}. ${desc ? point(desc) + '.' : MANQUE}`, soloScene({ orbite: true, facteur: 2.8, etiquettes: [{ phrase: 0, texte: /^vertebre|^cote/.test(id) ? nom : libelle(nom, d.latin), classe: '', ancre: { centre: id } }] })));
    if (longs) E.push(etape('extremites', 'Extrémités', sous, `${nom} est un os long : on distingue son extrémité proximale, la plus proche du tronc, et son extrémité distale, la plus éloignée. La diaphyse est la partie du milieu.`, soloScene({ etiquettes: [{ phrase: 0, texte: 'Extrémité proximale', classe: 'vert', ancre: { bout: 0, sid: id } }, { phrase: 0, texte: 'Extrémité distale', classe: 'rouge', ancre: { bout: 1, sid: id } }] })));
    const reperes = R.tous('repere').filter(r => r.os === base).slice(0, 3);
    for (const r of reperes) { const rid = 'repere:' + r.id + (r.sym === false ? '' : ':' + (c || 'D')); E.push(etape('repere-' + r.id, r.nom.replace(/ \(.*\)/, ''), 'Repère palpable', `${point(r.nom)}. ${point(r.palpation)}.${r.utilite ? ' Intérêt : ' + point(r.utilite) + '.' : ''}`, soloScene({ calques: [cal, 'reperes'], visibles: [id, rid], accent: [rid], etiquettes: [{ phrase: 0, texte: r.nom.replace(/ \(.*\)/, ''), classe: 'vert', ancre: { centre: rid } }] }))); }
    const rep = champ(f, 'Repères palpables');
    if (rep && !reperes.length) E.push(etape('reliefs', 'Reliefs à connaître', sous, `Reliefs à connaître sur ${nom.toLowerCase()} : ${texteChamp(rep)}.`, soloScene({ orbite: true })));
    const art = champ(f, 'Articulations');
    if (art) {
      const voisins = []; for (const a of [].concat(art)) { const cible = R.trouver(String(a).replace(/\(.*\)/, '')); if (cible && cible.ids && cible.ids.length <= 4 && cible.base !== base) cible.ids.forEach(x => { if (!voisins.includes(x) && (!R.cote(x) || !c || R.cote(x) === c)) voisins.push(x); }); }
      E.push(etape('articulations', 'Articulations', sous, `${nom} s'articule avec : ${texteChamp(art)}.`, soloScene({ visibles: [id, ...voisins], fantomes: voisins, cadrer: [id, ...voisins.slice(0, 2)], facteur: 2.2, etiquettes: voisins.slice(0, 2).map((v, i) => ({ phrase: 0, texte: sansCote(nomCourt(v)), classe: 'vert', ancre: { contact: [id, v], cote: 0 } })) })));
    }
    const mus = R.musclesDe(base).filter(m => R.definition(m.muscle)).slice(0, opts.court ? 2 : 4);
    for (const m of mus) {
      const md = R.definition(m.muscle), mid = R.instance(m.muscle, c || 'D'), origine = m.role === 'origine', txt = origine ? md.origine && md.origine.txt : md.insertion && md.insertion.txt;
      E.push(etape('muscle-' + m.muscle, nomCourt(mid), origine ? 'Origine du muscle' : 'Insertion du muscle', `${nomCourt(mid)} ${origine ? 'prend son origine' : "s'insère"} sur ${nom.toLowerCase()} : ${txt ? point(txt) : 'précision non renseignée dans les sources retenues'}. ${md.action ? 'Action : ' + point(md.action) + '.' : ''}`,
        { calques: [cal, 'muscles'], visibles: [id, mid], fantomes: [id], accent: [mid], cadrer: [id, mid], facteur: 2.7, etiquettes: [{ phrase: 0, texte: origine ? 'Origine' : 'Insertion', classe: origine ? 'vert' : 'rouge', ancre: { contact: [mid, id], cote: 1 } }, { phrase: 0, texte: nomCourt(mid), classe: '', ancre: { centre: mid } }] }));
    }
    const role = champ(f, 'Rôle'), ortho = champ(f, 'Intérêt orthopédique');
    if (role || ortho) E.push(etape('role', 'Rôle et intérêt clinique', sous, `${role ? 'Rôle : ' + point(role) + '. ' : ''}${ortho ? 'En orthopédie : ' + point(ortho) + '.' : ''}`, soloScene({ orbite: true })));
  } else if (type === 'muscle' || type === 'tendon') {
    const lies = osLies(), ctx = { contexte: ['os'], fantomes: lies };
    const get = l => champ(f, l);
    E.push(etape('intro', nomC, sous, `${dit}. ${type === 'muscle' ? 'Voici ce muscle, isolé, avec les os où il s’attache.' : 'Voici cette structure fibreuse, isolée.'}${d.region ? ' Région : ' + String(d.region).toLowerCase() + '.' : ''}`, soloScene({ calques: [cal, 'squelette'], visibles: [id, ...lies], fantomes: lies, orbite: true, facteur: 2.8, etiquettes: [{ phrase: 0, texte: libelle(nom, d.latin), classe: '', ancre: { centre: id } }] })));
    const o = get('Origine'), i = get('Terminaison (insertion)'), tr = get('Trajet et rapports'), ac = get('Action'), inn = get('Innervation'), va = get('Vascularisation'), cl = get('Clinique');
    const osO = d.origine && d.origine.os && R.definition(d.origine.os) ? (R.definition(d.origine.os).sym ? R.instance(d.origine.os, c || 'D') : d.origine.os) : null;
    const osI = d.insertion && d.insertion.os && R.definition(d.insertion.os) ? (R.definition(d.insertion.os).sym ? R.instance(d.insertion.os, c || 'D') : d.insertion.os) : null;
    const sceneMus = (os, etiq) => ({ calques: [cal, 'squelette'], visibles: [id, ...lies], fantomes: lies, accent: [id], cadrer: [id, ...(os ? [os] : [])], facteur: 2.8, etiquettes: etiq });
    E.push(etape('origine', 'Origine', sous, o ? `Origine : ${point(o)}.` : `Origine : ${MANQUE}`, sceneMus(osO, osO ? [{ phrase: 0, texte: 'Origine', classe: 'vert', ancre: { contact: [id, osO], cote: 0 } }] : [])));
    if (tr) E.push(etape('trajet', 'Trajet et rapports', sous, `Trajet : ${point(tr)}.`, sceneMus(null, [])));
    E.push(etape('insertion', 'Terminaison', sous, i ? `Terminaison, ou insertion : ${point(i)}.` : `Terminaison : ${MANQUE}`, sceneMus(osI, osI ? [{ phrase: 0, texte: 'Insertion', classe: 'rouge', ancre: { contact: [id, osI], cote: 0 } }] : [])));
    E.push(etape('action', 'Action', sous, ac ? `Action : ${point(ac)}.` : `Action : ${MANQUE}`, sceneMus(null, [])));
    E.push(etape('innervation', 'Innervation', sous, inn ? `Innervation : ${point(inn)}.${va ? ' Vascularisation : ' + point(va) + '.' : ''}` : `Innervation : ${MANQUE}`, sceneMus(null, [])));
    if (cl) E.push(etape('clinique', 'Clinique', sous, `En clinique : ${point(cl)}.`, sceneMus(null, [])));
  } else if (type === 'nerf' || type === 'artere' || type === 'veine' || type === 'organe') {
    const lab = { nerf: 'Nerf', artere: 'Artère', veine: 'Veine', organe: 'Organe' }[type];
    const desc = champ(f, 'Description'), orig = champ(f, 'Origine'), tr = champ(f, 'Trajet et terminaison'), terr = champ(f, 'Territoire', 'Branches et territoire irrigué', 'Affluents et territoire drainé'), role = champ(f, 'Rôle'), sit = champ(f, 'Situation'), clin = champ(f, 'Clinique'), rem = champ(f, 'Remarque');
    const sceneV = (extra = {}) => soloScene(Object.assign({ contexte: ['os'], facteur: type === 'organe' ? 2.3 : 2.5 }, extra));
    E.push(etape('intro', nomC, sous, `${dit}. ${desc ? point(desc) + '.' : tr ? point(tr) + '.' : orig ? point(orig) + '.' : MANQUE}${f.sous && /\bC\d|T\d|L\d|S\d|nerf crânien/i.test(f.sous) ? ' Racines : ' + f.sous.split(' · ').pop() + '.' : ''}`, sceneV({ orbite: true, etiquettes: [{ phrase: 0, texte: libelle(nom, d.latin), classe: '', ancre: { centre: id } }] })));
    if (type !== 'organe') E.push(etape('extremites', 'Du début à la fin', sous, `${orig ? 'Origine : ' + point(orig) + '. ' : ''}${tr && tr !== desc ? 'Trajet : ' + point(tr) + '.' : ''}${!orig && !(tr && tr !== desc) ? 'Voici les deux extrémités du tracé : le début, proche du tronc, et la fin, loin du tronc. Le détail de l’origine n’est pas renseigné dans les sources que Raylé utilise.' : ''}`.trim(), sceneV({ etiquettes: [{ phrase: 0, texte: 'Extrémité proximale', classe: 'vert', ancre: { bout: 0, sid: id } }, { phrase: 0, texte: 'Extrémité distale', classe: 'rouge', ancre: { bout: 1, sid: id } }] })));
    if (type === 'organe' && (role || sit)) E.push(etape('role', 'Situation et rôle', sous, `${sit ? 'Situation : ' + point(sit) + '. ' : ''}${role ? 'Rôle : ' + point(role) + '.' : ''}`, sceneV({ orbite: true })));
    if (type !== 'organe') E.push(etape('territoire', type === 'nerf' ? 'Territoire' : 'Territoire', sous, terr ? `${type === 'nerf' ? 'Territoire' : type === 'artere' ? 'Branches et territoire irrigué' : 'Affluents et territoire drainé'} : ${point(terr)}.` : `Territoire : ${MANQUE}`, sceneV()));
    if (clin) E.push(etape('clinique', 'Clinique', sous, `En clinique : ${point(clin)}.`, sceneV({ orbite: true })));
    if (rem) E.push(etape('remarque', 'À savoir', sous, point(rem) + '.', sceneV()));
  } else return null;
  return finaliser({ id: 'structure:' + id, type: 'structure', cible: id, titre: nomC, sous }, E, refsDe(d, type));
}
function refsDe(d, type) {
  const r = REFERENCES_CORPS.slice(); if (d && d.source && !r.some(x => x.includes(d.source.slice(0, 12)))) r.unshift(d.source);
  return r;
}
function finaliser(entete, etapes, references, dites = REFERENCES_DITES_CORPS) {
  etapes.push(etape('references', 'Références', 'Sources', dites, Object.assign({}, (etapes[0] && etapes[0].scene) || {}, { etiquettes: [], orbite: true }), { fin: true, references }));
  return Object.assign({ etapes, references, referencesDites: dites }, entete);
}

// ───────────────────────── plusieurs structures (groupe) ─────────────────────────
export function scriptGroupe(cible) {
  const cote = cible.cote || 'D', unCote = cible.ids.filter(i => !R.cote(i) || R.cote(i) === cote), ids = (unCote.length ? unCote : cible.ids).slice(0, 40);
  const noms = Array.from(new Set(ids.map(i => sansCote(nomCourt(i)))));
  const type = R.typeDe(ids[0]), cal = CALQUE_DE_TYPE[type] || 'squelette';
  const E = [etape('intro', cible.nom, `${ids.length} structures`, `${cible.nom} : ${ids.length} structures, dont ${liste(noms.slice(0, 8))}${noms.length > 8 ? ' et d’autres' : ''}.`, { calques: [cal], visibles: ids, accent: ids, cadrer: ids, orbite: true })];
  for (const i of ids.slice(0, 5)) { const sc = scriptStructure(i, { court: true }); if (sc) E.push(...sc.etapes.slice(0, 2).map(e => Object.assign({}, e, { id: i + ':' + e.id, scene: Object.assign({}, e.scene, { contexte: ['os'] }) }))); }
  return finaliser({ id: 'groupe:' + cible.nom, type: 'groupe', cible: ids, titre: cible.nom, sous: `${ids.length} structures` }, E, REFERENCES_CORPS);
}

// ───────────────────────── une région, couche par couche ─────────────────────────
export const REGIONS = {
  jambe: { nom: 'le membre inférieur', de: 'du membre inférieur', court: 'membre inférieur', regions: ['Cuisse', 'Genou', 'Jambe', 'Pied'], membre: 'MI', organes: false, cadre: 'jambe', alias: ['jambe', 'jambes', 'membre inferieur', 'membres inferieurs', 'patte'] },
  bras: { nom: 'le membre supérieur', de: 'du membre supérieur', court: 'membre supérieur', regions: ['Épaule', 'Bras', 'Avant-bras', 'Main'], membre: 'MS', organes: false, cadre: 'bras', alias: ['bras', 'membre superieur', 'membres superieurs', 'avant bras'] },
  tronc: { nom: 'le tronc', de: 'du tronc', court: 'tronc', regions: ['Thorax', 'Abdomen', 'Dos', 'Rachis lombaire', 'Rachis thoracique', 'Rachis cervicale', 'Bassin', 'Périnée', 'Tronc', 'Pelvis'], membre: null, organes: true, cadre: 'tronc', alias: ['tronc', 'torse', 'thorax', 'buste', 'abdomen'] },
  tete: { nom: 'la tête et le cou', de: 'de la tête et du cou', court: 'tête et cou', regions: ['Tête', 'Cou', 'Nuque', 'Orbite', 'Langue', 'Palais', 'Larynx', 'Pharynx'], membre: null, organes: true, cadre: 'tete', alias: ['tete', 'cou', 'tete et cou', 'visage'] },
  corps: { nom: 'le corps entier', de: 'du corps entier', court: 'corps entier', regions: null, membre: null, organes: true, cadre: 'corps', alias: ['corps', 'corps entier', 'tout le corps', 'corps humain', 'ensemble du corps'] }
};
const TETE_NERFS = /optique|trochl|ophtalm|facial|trijum|vague|crani|olfact|oculo|hypoglosse|glosso/;
function appartient(def, type, cle) {
  const R0 = REGIONS[cle]; if (cle === 'corps') return true;
  const reg = def.region, mem = def.membre;
  if (cle === 'jambe') return mem === 'MI' || (reg && R0.regions.includes(reg)) || (type === 'os' && def.id === 'os-coxal');
  if (cle === 'bras') return mem === 'MS' || (reg && R0.regions.includes(reg));
  if (cle === 'tete') return (reg && R0.regions.includes(reg)) || (!reg && type === 'nerf' && TETE_NERFS.test(def.id));
  if (cle === 'tronc') { if (mem === 'MI' || mem === 'MS') return false; if (reg) return R0.regions.includes(reg); return type !== 'nerf' || !TETE_NERFS.test(def.id); }
  return false;
}
/** → { os:[ids], muscles:[ids], nerfs:[ids], arteres:[], veines:[], organes:[] } pour une région et un côté */
export function selectionRegion(cle, cote = 'D') {
  const sel = { os: [], muscles: [], nerfs: [], arteres: [], veines: [], organes: [] };
  const table = [['os', 'os'], ['muscle', 'muscles'], ['tendon', 'muscles'], ['nerf', 'nerfs'], ['artere', 'arteres'], ['veine', 'veines'], ['organe', 'organes']];
  for (const [t, k] of table) for (const b of R.basesDe(t)) {
    const d = R.definition(b); if (!d) continue;
    if (t === 'organe' && cle !== 'corps' && !REGIONS[cle].organes) continue;
    if (t === 'organe' && cle === 'jambe') continue;
    if (!appartient(d, t, cle)) continue;
    if (t === 'os' && /^cote-/.test(b) && cle !== 'tronc' && cle !== 'corps') continue;
    if (d.sym) sel[k].push(R.instance(b, cote)); else sel[k].push(b);
  }
  if (cle === 'corps') { const g = cote === 'D' ? 'G' : 'D'; for (const k of ['os', 'muscles', 'nerfs', 'arteres', 'veines']) for (const b of selectionRegionBrut(k)) if (R.estSym(b)) sel[k].push(R.instance(b, g)); }
  for (const k of Object.keys(sel)) sel[k] = Array.from(new Set(sel[k]));
  return sel;
}
function selectionRegionBrut(k) { const t = { os: ['os'], muscles: ['muscle', 'tendon'], nerfs: ['nerf'], arteres: ['artere'], veines: ['veine'] }[k]; return t.flatMap(x => R.basesDe(x)); }

const COUCHES = [
  { id: 'peau', calque: 'peau', titre: 'La peau', ouvre: "Première couche : la peau, l'enveloppe du corps." },
  { id: 'os', calque: 'squelette', titre: 'Le squelette', ouvre: 'Deuxième couche : les os.' },
  { id: 'muscles', calque: 'muscles', titre: 'Les muscles', ouvre: 'Troisième couche : les muscles et leurs tendons.' },
  { id: 'nerfs', calque: 'nerfs', titre: 'Les nerfs', ouvre: 'Quatrième couche : les nerfs.' },
  { id: 'vaisseaux', calque: ['arteres', 'veines'], titre: 'Les artères et les veines', ouvre: 'Cinquième couche : les vaisseaux, artères en rouge et veines en bleu.' },
  { id: 'organes', calque: 'organes', titre: 'Les organes', ouvre: 'Dernière couche : les organes.' }
];
const detailDe = (couche, ids) => {
  // un fait précis tiré de la fiche de la première structure qui en a un
  for (const id of ids) {
    const f = R.fiche(id); if (!f) continue;
    if (couche === 'os') { const x = champ(f, 'Rôle'); if (x) return `${sansCote(nomCourt(id))} : ${point(x)}.`; }
    if (couche === 'muscles') { const x = champ(f, 'Action'); if (x) return `Par exemple, ${sansCote(nomCourt(id)).toLowerCase()} : ${point(x)}.`; }
    if (couche === 'nerfs') { const x = champ(f, 'Territoire', 'Description'); if (x) return `${sansCote(nomCourt(id))} : ${point(texteChamp(x))}.`; }
    if (couche === 'vaisseaux') { const x = champ(f, 'Trajet et terminaison', 'Branches et territoire irrigué'); if (x) return `${sansCote(nomCourt(id))} : ${point(x)}.`; }
    if (couche === 'organes') { const x = champ(f, 'Rôle', 'Description'); if (x) return `${sansCote(nomCourt(id))} : ${point(texteChamp(x))}.`; }
  }
  return '';
};
/** Présentation « couche par couche » : chaque couche apparaît en fondu, les précédentes passent en transparence */
export function scriptRegion(cle, opts = {}) {
  const reg = REGIONS[cle]; if (!reg) return null;
  const cote = opts.cote || 'D', sel = selectionRegion(cle, cote);
  const groupes = { peau: [], os: sel.os, muscles: sel.muscles, nerfs: sel.nerfs, vaisseaux: sel.arteres.concat(sel.veines), organes: sel.organes };
  const E = [], cumul = [], tout = [].concat(sel.os, sel.muscles, sel.nerfs, sel.arteres, sel.veines, sel.organes);
  const cadrage = cle === 'corps' ? [] : sel.os.slice(0, 80);
  E.push(etape('intro', maj(reg.nom), 'Présentation couche par couche', `Présentation ${reg.de}, couche par couche, de la plus superficielle à la plus profonde. Chaque couche apparaît à son tour et les précédentes deviennent transparentes.`, { calques: ['peau'], visibles: [], peau: true, region: cle, cote, cadrer: cadrage, orbite: true, facteur: 1.7 }));
  for (const c of COUCHES) {
    const ids = groupes[c.id];
    if (c.id === 'organes' && !reg.organes) continue;
    if (c.id !== 'peau' && !ids.length) continue;
    let narration;
    if (c.id === 'peau') narration = `${c.ouvre} Ma base ne contient pas de fiche détaillée sur la peau elle-même : je montre seulement l'enveloppe du corps, sous laquelle se trouvent toutes les couches suivantes.`;
    else {
      const noms = Array.from(new Set(ids.map(i => sansCote(nomCourt(i)))));
      const n = noms.length;
      narration = `${c.ouvre} ${maj(reg.nom)} compte ${n} ${c.id === 'os' ? 'os ou parties osseuses' : c.id === 'muscles' ? 'muscles et tendons' : c.id === 'nerfs' ? 'nerfs ou plexus' : c.id === 'vaisseaux' ? 'artères et veines' : 'organes'} dans ma base, dont ${liste(noms.slice(0, 7))}${n > 7 ? '…' : ''}. ${detailDe(c.id, ids)}`;
    }
    const calques = c.id === 'peau' ? ['peau'] : [].concat(c.calque);
    E.push(etape(c.id, c.titre, maj(reg.court), narration.trim(), { calques: ['peau', 'squelette', 'muscles', 'nerfs', 'arteres', 'veines', 'organes'].filter(x => x === 'peau' ? c.id === 'peau' : cumulCalques(c.id).includes(x)), visibles: c.id === 'peau' ? [] : ids, fantomes: cumul.slice(), accent: [], region: cle, cote, peau: c.id === 'peau', cadrer: cadrage.length ? cadrage : ids.slice(0, 80), couche: c.id, orbite: true, facteur: 1.7, fondu: true }));
    if (c.id !== 'peau') cumul.push(...ids);
  }
  return finaliser({ id: 'region:' + cle + ':' + cote, type: 'region', cible: cle, cote, titre: maj(reg.nom), sous: 'Couche par couche' }, E, REFERENCES_CORPS);
}
function cumulCalques(couche) {
  const ordre = ['os', 'muscles', 'nerfs', 'vaisseaux', 'organes'], i = ordre.indexOf(couche), r = [];
  for (const c of ordre.slice(0, i + 1)) r.push(...[].concat(COUCHES.find(x => x.id === c).calque));
  return r;
}
/** « présente le bras » (sans « couche par couche ») : région en 3 étapes — vue d'ensemble, os principaux, muscles principaux */
export function scriptRegionCourt(cle, opts = {}) { return scriptRegion(cle, opts); }

// ───────────────────────── cerveau ─────────────────────────
const f1 = s => { const p = phrases(s, 400); return p[0] || ''; };
const nomLatinZ = z => nomLatin(z);
export function scriptZoneCerveau(id) {
  const z = ZONE_PAR_ID[id]; if (!z) return null;
  const E = [], reseau = z.reseau && RESEAU_PAR_ID[z.reseau];
  const scene = (extra = {}) => Object.assign({ cerveau: true, zone: id, vue: 'laterale' }, extra);
  E.push(etape('intro', z.nom, z.latin, `${z.nom}, en latin ${z.latin}. ${point(z.localisation)}.`, scene({ etiquettes: [{ phrase: 0, texte: nomLatinZ(z), classe: 'zone', ancre: { zone: id } }] })));
  E.push(etape('fonctions', 'Fonctions', z.nom, `Ses fonctions principales. ${(z.fonctions || []).map(point).join('. ')}.`, scene({ reseau: z.reseau || null, neurones: true })));
  E.push(etape('fonctionnement', 'Comment ça fonctionne', z.nom, `${point(z.fonctionnement)}.${reseau ? ' Les impulsions lumineuses montrent le réseau « ' + reseau.nom.toLowerCase() + ' » : leur schéma est illustratif.' : ''}`, scene({ reseau: z.reseau || null, neurones: true })));
  if (z.pathologies && z.pathologies.length) E.push(etape('pathologies', 'Pathologies associées', z.nom, `Quand cette région est atteinte : ${z.pathologies.map(point).join(' ; ')}.`, scene({ neurones: false })));
  if (z.certitude) E.push(etape('certitude', 'Ce que la science sait — et ce qu’elle ne sait pas', z.nom, point(z.certitude) + '.', scene({ neurones: false })));
  return finaliserCerveau({ id: 'cerveau:' + id, type: 'cerveau-zone', cible: id, titre: z.nom, sous: z.latin }, E, (z.sources || []).map(k => SOURCES_CERVEAU[k]).filter(Boolean));
}
export function scriptReseauCerveau(id) {
  const r = RESEAU_PAR_ID[id]; if (!r) return null;
  const E = [etape('intro', `Réseau : ${r.nom}`, 'Neurones animés', `${maj(r.nom)} : ${point(r.description)}. Les impulsions lumineuses montrent les voies principales, de façon schématique.`, { cerveau: true, reseau: id, vue: 'laterale', neurones: true })];
  for (const zid of r.zones.slice(0, 4)) { const z = ZONE_PAR_ID[zid]; if (!z) continue; E.push(etape('zone-' + zid, z.nom, r.nom, `${z.nom}. ${f1(z.fonctions && z.fonctions[0] || z.localisation)} ${f1(z.localisation)}`, { cerveau: true, zone: zid, reseau: id, vue: 'laterale', neurones: true, etiquettes: [{ phrase: 0, texte: z.nom, classe: 'zone', ancre: { zone: zid } }] })); }
  const src = [SOURCES_CERVEAU[r.source], SOURCES_CERVEAU.TA, SOURCES_CERVEAU.BP3D].filter(Boolean);
  return finaliserCerveau({ id: 'cerveau-reseau:' + id, type: 'cerveau-reseau', cible: id, titre: `Réseau ${r.nom.toLowerCase()}`, sous: 'Neurones animés' }, E, src);
}
const TOUR = [['lobe-frontal', 'laterale'], ['lobe-parietal', 'laterale'], ['lobe-temporal', 'laterale'], ['lobe-occipital', 'laterale'], ['cervelet', 'laterale'], ['tronc-cerebral', 'mediane'], ['corps-calleux', 'mediane'], ['thalamus', 'mediane'], ['hippocampe', 'mediane'], ['amygdale', 'mediane'], ['noyaux-gris', 'coronale'], ['ventricules', 'coronale']];
export function scriptTourCerveau() {
  const E = [etape('intro', 'Tour du cerveau', 'Visite guidée', "Faisons le tour du cerveau : d'abord les quatre lobes, puis le cervelet et le tronc cérébral, puis quelques structures profondes. Les couleurs distinguent les lobes, et les impulsions lumineuses illustrent l'activité des réseaux de neurones.", { cerveau: true, vue: 'laterale', zone: null, neurones: true, orbite: true })];
  for (const [id, vue] of TOUR) { const z = ZONE_PAR_ID[id]; E.push(etape(id, z.nom, z.latin, `${z.nom}. ${f1(z.localisation)} ${f1(z.fonctions[0])}`, { cerveau: true, zone: id, vue, reseau: z.reseau || null, neurones: true, etiquettes: [{ phrase: 0, texte: nomLatinZ(z), classe: 'zone', ancre: { zone: id } }] })); }
  for (const rid of ['vision', 'langage', 'mouvement']) { const r = RESEAU_PAR_ID[rid]; E.push(etape('reseau-' + rid, `Réseau : ${r.nom}`, 'Neurones animés', `${maj(r.nom)} : ${point(r.description)}.`, { cerveau: true, reseau: rid, zone: null, vue: 'laterale', neurones: true })); }
  const src = [SOURCES_CERVEAU.GRAY, SOURCES_CERVEAU.PURVES, SOURCES_CERVEAU.KANDEL, SOURCES_CERVEAU.TA, SOURCES_CERVEAU.BP3D];
  return finaliserCerveau({ id: 'cerveau-tour', type: 'cerveau-tour', cible: 'tour', titre: 'Tour du cerveau', sous: 'Visite guidée' }, E, src);
}
function finaliserCerveau(entete, etapes, references) {
  const courts = references.map(r => r.split(',').slice(0, 2).join(',').replace(/\s*\(.*$/, '')).slice(0, 5);
  const dites = `Références : ${liste(courts)}. ${MENTION_CEREBRALE}`;
  etapes.push(etape('references', 'Références', 'Sources', dites, Object.assign({}, etapes[0].scene, { etiquettes: [], orbite: true, zone: null, reseau: null }), { fin: true, references }));
  return Object.assign({ etapes, references, referencesDites: dites }, entete);
}

// ───────────────────────── demande en langage naturel → script ─────────────────────────
const norm = R.norm;
const MOTS_CERVEAU = /\b(?:cerveau|encephale|cerebral\w*|cortex|neurones?|neuronal\w*)\b/;
/** Texte → { famille:'region'|'cerveau'|'groupe'|'structure', … } ou null */
export function resoudre(texte, ctx = {}) {
  const t = norm(texte), dansCerveau = ctx.vue === 'cerveau', parleCerveau = MOTS_CERVEAU.test(t) || dansCerveau;
  const toute = /\b(?:tout|toute|tous|entier|entiere|complet|complete|ensemble|couches?)\b/.test(t);
  if (!parleCerveau) for (const [cle, r] of Object.entries(REGIONS)) {
    const re = new RegExp('\\b(?:' + r.alias.map(a => a.replace(/ /g, '\\s')).join('|') + ')\\b');
    if (!re.test(t)) continue;
    if (cle !== 'corps' && !toute) continue;      // « présente le bras » seul = la structure ou le groupe du registre ; « tout le bras », « couche par couche » = la région
    if (cle === 'bras' && /\bavant bras\b/.test(t) && !toute) continue;
    return { famille: 'region', cle, cote: R.coteDans(texte) || (/\bgauche\b/.test(t) ? 'G' : 'D') };
  }
  const zone = trouverZone(texte, { strict: !parleCerveau }), reseau = trouverReseau(texte);
  if (zone) return { famille: 'cerveau', zone: zone.id };
  if (parleCerveau && reseau) return { famille: 'cerveau', reseau: reseau.id };
  if (parleCerveau) return { famille: 'cerveau', tour: true };
  const cible = R.trouver(texte);
  if (cible) return { famille: cible.groupe || (cible.ids && cible.ids.length > 2) ? 'groupe' : 'structure', cible };
  return null;
}
/** Texte → script, ou null */
export function scriptPour(texte, ctx = {}) {
  const r = resoudre(texte, ctx); if (!r) return null;
  if (r.famille === 'region') return scriptRegion(r.cle, { cote: r.cote || 'D' });
  if (r.famille === 'groupe') return scriptGroupe(r.cible);
  if (r.famille === 'structure') { const c = r.cible, def = R.definition(c.base); const sid = def && def.sym ? R.instance(c.base, c.cote || R.coteDans(texte) || 'D') : c.base; return scriptStructure(sid); }
  if (r.famille === 'cerveau') return r.zone ? scriptZoneCerveau(r.zone) : r.reseau ? scriptReseauCerveau(r.reseau) : scriptTourCerveau();
  return null;
}
export { ZONES_CERVEAU, RESEAUX_CERVEAU, FAISCEAU_PAR_ID };
