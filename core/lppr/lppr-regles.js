/* ═════════════ LPPR : CLASSEMENT DES CODES ET EXTRACTION DES RÈGLES (module pur, testé : galaxie/tests/lppr-graphe-test.mjs) ═════════════
   Tout vient du TEXTE OFFICIEL de la nomenclature (Titre II de la LPP, PDF ameli) : rien n'est inventé. Une règle est une PHRASE du texte, classée par type, avec sa source (le code lui-même, sa section
   ou le chapitre). Le classement des familles d'appareils (corset, prothèse de membre inférieur, siège…) sert à chercher et à poser des questions : il ne remplace jamais le texte. */
export const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, '\'').toLowerCase().replace(/[^a-z0-9' ,.;:()\/%+°-]+/g, ' ').replace(/\s+/g, ' ').trim();
export const sansPonctuation = s => norm(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/* Phrases d'un texte (coupe sur « . » suivi d'une majuscule, « ; » en liste, retours à la ligne). */
export function phrases(texte) {
  return String(texte || '').replace(/\s+/g, ' ').split(/(?<=[.!?;])\s+(?=[A-ZÉÈÀÂÊÎÔÛÇ«"(\d-])/).map(x => x.trim()).filter(x => x.length > 12);
}
const TYPES_REGLE = [
  ['entente_prealable', /(accord|entente)\s+pr[ée]alable|demande d.accord/i],
  ['renouvellement', /renouvel|remplac\w+ (?:tous|au plus|apr[èe]s|au terme|dans la limite)|tous les \d+ (?:ans?|mois)|une (?:seule )?(?:prise en charge|fois) par (?:an|ann[ée]e|p[ée]riode)|(?:dur[ée]e|d[ée]lai) (?:minimale? )?de (?:renouvellement|vie)/i],
  ['garantie', /garanti|garantie/i],
  ['cumul', /cumul|ne peut (?:pas )?[êe]tre (?:associ|factur|pris en charge|prescrit|cumul)|n.est pas (?:cumulable|associable)|non cumulable|ne se cumule|ne s.ajoute pas|en suppl[ée]ment|en sus|peut [êe]tre (?:associ|ajout|cumul)|se cumule|s.ajoute|exclusi[fv]|sans pouvoir|[àa] l.exclusion|incompatible/i],
  ['age', /enfant|nourrisson|adolescent|adulte|\bâg[ée]s? de|moins de \d+ ans|plus de \d+ ans|\bde \d+ [àa] \d+ ans/i],
  ['prescripteur', /prescri(?:t|ption|pteur)|m[ée]decin (?:sp[ée]cialiste|de m[ée]decine physique|chirurgien|r[ée]adaptateur|rhumatologue|orthop[ée]diste)|sur ordonnance/i],
  ['reparation', /r[ée]paration|remise en [ée]tat|entretien/i],
  ['sur_devis', /sur devis|devis (?:obligatoire|pr[ée]alable|d[ée]taill[ée])|sur facture/i],
  ['condition', /la prise en charge (?:est|n.est) (?:assur[ée]e|r[ée]serv[ée]e|subordonn[ée]e|conditionn[ée]e)|r[ée]serv[ée]e? (?:aux?|[àa])|est subordonn[ée]|sous r[ée]serve|uniquement|seulement|n.est pas pris en charge|exclu/i]
];
/* Règles d'un texte : [{ type, phrase, source }] (une phrase peut porter plusieurs types : une entrée par type). */
export function extraireRegles(texte, source = 'code', page = null) {
  const out = [];
  for (const ph of phrases(texte)) {
    for (const [type, re] of TYPES_REGLE) if (re.test(ph)) out.push({ type, phrase: ph.length > 420 ? ph.slice(0, 417) + '…' : ph, source, ...(page ? { page } : {}) });
  }
  return out;
}
/* Codes à 7 chiffres cités dans un texte (rien d'autre n'est une citation de code). */
export function codesCites(texte) { return [...new Set(String(texte || '').match(/\b\d{7}\b/g) || [])]; }
/* Références alphanumériques citées (ex. AI3Z003, PS9C02). */
export function referencesCitees(texte) { return [...new Set((String(texte || '').match(/\b[A-Z]{2}\d[A-Z0-9]{2,8}\b/g) || []))]; }

const FAMILLES = [
  ['corset', /corset|ceintures? (?:medico|de soutien|lombaire|abdominale|thoracique)|lombostat|lombaire|scolio|gilet orthop|(?:orthopedie|appareillage|orthese)s? du tronc|\btr\d\d/],
  ['minerve', /minerve|collier cervical|cervical|cervicale|appui occipito|appui mentonnier/],
  ['orthese_membre_inferieur', /orthese?s? (?:du |des )?(?:membres? inferieurs?|genou|cheville|jambe|pied|hanche)|attelle (?:jambiere|de genou|de cheville)|appareil (?:jambier|cruro)|genouillere|orthese plantaire|\boi\d|orthopedie du membre inferieur|releveur|stop.?pied/],
  ['orthese_membre_superieur', /orthese?s? (?:du |des )?(?:membres? superieurs?|coude|poignet|main|epaule)|attelle (?:de )?(?:main|poignet|doigt|pouce|coude)|appareil de maintien .*doigt|\bos\d|orthopedie du membre superieur/],
  ['prothese_membre_inferieur', /protheses? (?:du |des )?(?:membres? inferieurs?|tibiale|femorale|de jambe|de cuisse|de hanche)|\bpi\d|amputation (?:de jambe|de cuisse|tibio|trans|trans-?femorale|trans-?tibiale)|desarticulation (?:du genou|de hanche|de cheville)/],
  ['prothese_membre_superieur', /protheses? (?:du |des )?(?:membres? superieurs?|d avant[- ]?bras|de bras|de main|myoelectrique|de travail|de vie sociale)|\bps\d|amputation (?:d avant[- ]?bras|de bras|des doigts|transmetacarpienne)|desarticulation (?:du coude|d epaule|du poignet)/],
  ['siege', /\bsiege|assise|fauteuil|posture|positionnement|matelas|coussin d'assise|coussin de siege/],
  ['releveur', /releveur|stop.?pied|steppage|botte.*releveur|orthese.*releveur|jambier.*releveur/],
  ['attelle_main', /attelle.*\b(?:main|poignet|doigts?|pouce)\b|orthese.*\b(?:main|poignet|doigts?|pouce)\b|appareil de maintien .*doigt|orthese de repos de main/],
  ['emboiture', /emboiture/],
  ['manchon', /manchon|gaine (?:de suspension|silicone|polymere)|liner|chausse prothese/],
  ['articulation', /articulation|\bgenou\b|hanche|\bcoude\b|cheville|poignet/],
  ['pied_prothetique', /pied (?:a restitution|de base|sach|articule|en carbone|prothetique)|restitution d energie/],
  ['main_prothetique', /main (?:myo|electr|mecan|prothe|en matiere|articulee)|crochet|pince/],
  ['sangle', /sangle|bretelle|courroie|tracteur|suspension|ceinture de suspension|bande de maintien/],
  ['housse', /housse|revetement|enveloppe|bas de protection|chaussette|couvre-?moignon|bonnet/],
  ['podo_orthese', /podo|chaussure|chut|chup|semelle|orthese plantaire|appareil de marche/],
  ['reparation', /reparation|remise en etat/],
  ['forfait', /forfait/]
];
export const NOMS_FAMILLES = Object.freeze({
  corset: 'corset / orthèse du tronc', minerve: 'minerve / collier cervical', orthese_membre_inferieur: 'orthèse de membre inférieur', orthese_membre_superieur: 'orthèse de membre supérieur', prothese_membre_inferieur: 'prothèse de membre inférieur',
  prothese_membre_superieur: 'prothèse de membre supérieur', siege: 'siège / coque / matelas', releveur: 'releveur', attelle_main: 'attelle de main', emboiture: 'emboîture', manchon: 'manchon / gaine', articulation: 'articulation', pied_prothetique: 'pied prothétique',
  main_prothetique: 'main / crochet prothétique', sangle: 'sangle / suspension', housse: 'housse / revêtement', podo_orthese: 'podo-orthèse', reparation: 'réparation', forfait: 'forfait'
});
/* Type du code d'après sa référence alphanumérique (nomenclature des appareils : P prothèse, O orthopédie, A adjonction, V variante ; S supérieur, I inférieur, TR tronc) puis d'après son texte. */
export function typeDe({ reference, designation, description }) {
  const ref = String(reference || ''), t = norm((designation || '') + ' ' + (description || ''));
  if (/^(?:AS|AI|AT|AR)\d/i.test(ref)) return 'adjonction';
  if (/^V[SIT]\d/i.test(ref)) return 'variante';
  if (/reparation|remise en etat/.test(t)) return 'reparation';
  if (/forfait/.test(t)) return 'forfait';
  if (/prestation|suivi et de readaptation|formation/.test(t)) return 'prestation';
  if (/piece|rechange|accessoire/.test(t)) return 'piece';
  if (/supplement/.test(t)) return 'supplement';
  if (/^(?:PS|PI|OS|OI|TR)\d/i.test(ref)) return 'appareil';
  return 'appareil';
}
export function membreDe({ reference, designation, chemin }) {
  const r = String(reference || '').toUpperCase(), t = norm((designation || '') + ' ' + (chemin || []).join(' '));
  if (/^[PAVO]S/.test(r)) return 'membre_superieur'; if (/^[PAVO]I/.test(r)) return 'membre_inferieur'; if (/^(?:TR|AT|VT)/.test(r)) return 'tronc';
  if (/membre superieur|\bbras\b|avant[- ]?bras|\bmain\b|doigt|coude|epaule|poignet/.test(t)) return 'membre_superieur';
  if (/membre inferieur|jambe|cuisse|genou|hanche|cheville|\bpied\b/.test(t)) return 'membre_inferieur';
  if (/tronc|lombaire|dorsal|cervical|scolio/.test(t)) return 'tronc';
  return null;
}
const GENERALES = new Set(['orthese_membre_inferieur', 'orthese_membre_superieur', 'prothese_membre_inferieur', 'prothese_membre_superieur']);
/* Familles d'un code. Les familles « de l'objet » (corset, manchon, sangle…) se jugent sur ce que la LIGNE dit d'elle-même (référence, désignation, début de la description) ;
   seules les familles générales (orthèse / prothèse de tel membre) tiennent compte des titres de la rubrique. Évite qu'une orthèse jambière « à tuteurs » devienne un corset. */
export function famillesDe({ reference, designation, description, chemin, type }) {
  const n2 = x => norm(x).replace(/'/g, ' '), soi = n2([reference, designation].filter(Boolean).join(' ')), soiPlus = n2([reference, designation, (description || '').slice(0, 140)].filter(Boolean).join(' ')), tout = n2([reference, designation, description, (chemin || []).slice(1).join(' ')].filter(Boolean).join(' ')), out = new Set();
  for (const [nom, re] of FAMILLES) if (re.test(GENERALES.has(nom) ? tout : soi)) out.add(nom);
  const objet = () => [...out].filter(f => !GENERALES.has(f)).length;
  if (!objet()) for (const [nom, re] of FAMILLES) if (!GENERALES.has(nom) && re.test(n2((chemin || []).slice(-2).join(' ')))) out.add(nom);   // ligne sans nom propre (« Polyoléfine, sans armature ») : le titre de sa rubrique la rattache
  if (type === 'reparation') out.add('reparation'); if (type === 'forfait') out.add('forfait');
  return [...out];
}
/* Rubrique lisible : le dernier titre du chemin qui nomme un appareil ou un groupe d'appareils (le chemin brut contient aussi des listes de matériaux). */
export function rubriqueDe(chemin) {
  const c = (chemin || []).slice(1); for (let i = c.length - 1; i >= 0; i--) if (/proth|orthop|orthes|adjonction|variante|pied|genou|emboit|appareil|corset|ceinture|collier|siege|chaussure|bandage|r[ée]paration|prestation/i.test(c[i])) return c[i];
  return c.length ? c[c.length - 1] : (chemin || [])[0] || null;
}
/* Actif à la date donnée ? (« fin de prise en charge » dépassée = plus remboursable ; absente = actif). */
export const actifLe = (c, dateISO) => !c.fin_prise_en_charge || c.fin_prise_en_charge >= dateISO;
