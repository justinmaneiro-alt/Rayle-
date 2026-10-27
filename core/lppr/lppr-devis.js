import { norm, sansPonctuation } from './lppr-regles.js';
import { formatEuro, A_VERIFIER } from './lppr-outils.js';

/* ═════════════ LPPR : DEVIS ET VÉRIFICATION DE DEVIS (module pur, testé : galaxie/tests/lppr-graphe-test.mjs) ═════════════
   proposer_devis : à partir d'une description libre du patient et de l'appareil, Raylé NE POSE QUE LES QUESTIONS QUI MANQUENT (côté, niveau d'amputation, sur mesure ou série, âge, indication, usage…),
   puis propose des lignes (code, désignation, quantité, tarif, prix limite de vente, base de remboursement) avec des ALTERNATIVES, signale cumuls, pièces oubliées, accord préalable et justificatifs.
   verifier_devis : on lui donne un devis déjà écrit (codes, quantités, prix) : codes, cumuls, oublis, incohérences, dépassements du prix limite.
   GARDE-FOUS : jamais de code ni de tarif inventé (tout vient du graphe) ; une ligne proposée est « à confirmer » ; un prix « sur devis » n'est jamais chiffré ; aucune donnée de patient n'est enregistrée
   par ces fonctions (elles ne font que calculer) ; aucun appel réseau. */
const QUESTIONS = {
  cote: { texte: 'Quel côté : droit, gauche ou les deux ?', extraire: t => { const d = /\b(droit|droite|dte)\b/.test(t), g = /\b(gauche|g)\b/.test(t), b = /\b(bilateral|bilaterale|des deux cotes|deux cotes|les deux)\b/.test(t); return b || (d && g) ? 'bilatéral' : d ? 'droit' : g ? 'gauche' : null; }, choix: ['droit', 'gauche', 'bilatéral'] },
  age: { texte: 'Adulte ou enfant ?', extraire: t => (/\b(enfant|enfants|pediatrique|bebe|nourrisson|ado|adolescent|adolescente|garcon|fille|fillette|garconnet|\d+ ans?)\b/.test(t) ? ((/\b(\d+) ans?\b/.exec(t) && Number(/\b(\d+) ans?\b/.exec(t)[1]) >= 16) ? 'adulte' : 'enfant') : /\b(adulte|adultes|monsieur|madame|patient age)\b/.test(t) ? 'adulte' : null), choix: ['adulte', 'enfant'] },
  mesure: { texte: 'Sur mesure ou de série (préfabriqué) ?', extraire: t => (/\bsur mesure|sur moulage|moule|moulage\b/.test(t) ? 'sur mesure' : /\b(serie|prefabrique|preforme|standard)\b/.test(t) ? 'série' : null), choix: ['sur mesure', 'série'] },
  indication: { texte: 'Quelle pathologie ou indication (pour la prescription et l’éventuel accord préalable) ? Par exemple scoliose, hémiplégie, pied tombant, instabilité du genou, fracture…', extraire: t => { const m = /\b(scoliose|cyphose|hemiplegie|paraplegie|tetraplegie|pied tombant|steppage|instabilite|entorse|fracture|arthrose|paralysie|amputation|agenesie|sclerose|spina|myopathie|ligamentaire|lombalgie|hernie discale|paralysie cerebrale|post operatoire|post traumatique)\b/.exec(t); return m ? m[1] : null; } },
  niveau_mi: { texte: 'Quel niveau d’amputation du membre inférieur : pied (Syme, Chopart, Lisfranc), tibial (sous le genou), désarticulation du genou, fémoral (au-dessus du genou) ou hanche ?', extraire: t => (/\b(hanche|hemipelvectomie)\b/.test(t) ? 'hanche' : /\b(femoral|femorale|transfemoral|transfemorale|cuisse|au dessus du genou|tf)\b/.test(t) ? 'fémoral' : /\bdesarticulation (du )?genou\b/.test(t) ? 'désarticulation du genou' : /\b(tibial|tibiale|transtibial|transtibiale|jambe|sous le genou|tt)\b/.test(t) ? 'tibial' : /\b(syme|chopart|lisfranc|pied partiel|transmetatarsien)\b/.test(t) ? 'pied' : null), choix: ['pied', 'tibial', 'désarticulation du genou', 'fémoral', 'hanche'] },
  niveau_ms: { texte: 'Quel niveau d’amputation du membre supérieur : doigts, main (transmétacarpien), poignet, avant-bras, coude, bras ou épaule ?', extraire: t => (/\b(epaule|scapulo)\b/.test(t) ? 'épaule' : /\bbras\b/.test(t) && !/avant ?-?bras/.test(t) ? 'bras' : /\bcoude\b/.test(t) ? 'coude' : /\bavant ?-?bras\b/.test(t) ? 'avant-bras' : /\b(poignet|carpien)\b/.test(t) ? 'poignet' : /\b(main|metacarpien|transmetacarpien)\b/.test(t) ? 'main' : /\bdoigts?\b|\bpouce\b/.test(t) ? 'doigts' : null), choix: ['doigts', 'main', 'poignet', 'avant-bras', 'coude', 'bras', 'épaule'] },
  type_ms: { texte: 'Quel type de prothèse : myoélectrique, mécanique (à câble) ou esthétique / de travail ?', extraire: t => (/\bmyo|electrique|bionique\b/.test(t) ? 'myoélectrique' : /\bcable|mecanique|corps\b/.test(t) ? 'mécanique' : /\besthetique|cosmetique|silicone|travail|outil\b/.test(t) ? 'esthétique ou de travail' : null), choix: ['myoélectrique', 'mécanique', 'esthétique ou de travail'] },
  type_orthese_mi: { texte: 'Quel type d’orthèse : releveur / jambier (cheville), genou, cruro-jambier (cuisse + jambe) ou hanche ?', extraire: t => (/\b(cruro|kafo|cuisse et jambe)\b/.test(t) ? 'cruro-jambier' : /\b(releveur|jambier|jambiere|cheville|botte|pied tombant)\b/.test(t) ? 'jambier / releveur' : /\bgenou\b/.test(t) ? 'genou' : /\bhanche\b/.test(t) ? 'hanche' : null), choix: ['jambier / releveur', 'genou', 'cruro-jambier', 'hanche'] },
  type_orthese_ms: { texte: 'Quelle zone : doigts / pouce, main-poignet, coude ou épaule ?', extraire: t => (/\b(doigts?|pouce)\b/.test(t) ? 'doigts / pouce' : /\b(main|poignet)\b/.test(t) ? 'main-poignet' : /\bcoude\b/.test(t) ? 'coude' : /\bepaule\b/.test(t) ? 'épaule' : null), choix: ['doigts / pouce', 'main-poignet', 'coude', 'épaule'] },
  type_corset: { texte: 'Quel type de corset : correction de scoliose, maintien lombaire / dorso-lombaire, ou corset-minerve (tronc + cervical) ?', extraire: t => (/\b(minerve|cervical|cervico)\b/.test(t) ? 'corset-minerve' : /\b(scoliose|cheneau|boston|lyonnais|correction)\b/.test(t) ? 'scoliose' : /\b(lombaire|lombostat|dorso|maintien|soutien)\b/.test(t) ? 'maintien lombaire' : null), choix: ['scoliose', 'maintien lombaire', 'corset-minerve'] },
  classe_pied: { texte: 'Quelle classe de pied à restitution d’énergie (I, II ou III), d’après l’activité du patient ?', extraire: t => { const m = /\bclasse\s*(iii|ii|i|1|2|3)\b/.exec(t); return m ? ({ i: 'I', 1: 'I', ii: 'II', 2: 'II', iii: 'III', 3: 'III' })[m[1]] : null; }, choix: ['I', 'II', 'III'] }
};
/* Fiches d'appareils : mots qui les reconnaissent, questions utiles (dans l'ordre), composants à chercher (obligatoire = oubli signalé s'il manque). */
export const FICHES = [
  { id: 'prothese_tibiale', nom: 'prothèse de jambe (tibiale)', membre: 'membre_inferieur', exclure: 'femoral|cuisse|hanche|sub-ischiatique|sub ischiatique', mots: ['prothese tibiale', 'transtibiale', 'prothese de jambe', 'sous le genou', 'amputation de jambe', 'amputation tibiale', 'prothese tt'], questions: ['cote', 'age', 'classe_pied'],
    composants: [{ role: 'prothèse de base (anciennes références PI)', requete: 'prothese amputation de jambe emboiture', obligatoire: true, refPrefixe: 'PI', contexte: false }, { role: 'emboîture / adjonction d’emboîture', requete: 'emboiture', obligatoire: false, familles: ['emboiture'], contexte: false }, { role: 'manchon / gaine de suspension', requete: 'manchon silicone', obligatoire: false, familles: ['manchon'], contexte: false }, { role: 'pied', requete: 'pied restitution energie', obligatoire: true, familles: ['pied_prothetique'], contexte: true }, { role: 'prestation de suivi', requete: 'prestation annuelle suivi readaptation', obligatoire: false, contexte: false }] },
  { id: 'prothese_femorale', nom: 'prothèse de cuisse (fémorale)', membre: 'membre_inferieur', exclure: 'tibial|jambe', mots: ['prothese femorale', 'transfemorale', 'prothese de cuisse', 'au dessus du genou', 'amputation de cuisse', 'prothese tf', 'amputation femorale'], questions: ['cote', 'age', 'classe_pied'],
    composants: [{ role: 'prothèse de base (anciennes références PI)', requete: 'prothese amputation de cuisse emboiture', obligatoire: true, refPrefixe: 'PI', contexte: false }, { role: 'emboîture fémorale', requete: 'emboiture femorale', obligatoire: false, familles: ['emboiture'], contexte: false }, { role: 'genou', requete: 'genou monoaxial', obligatoire: true, familles: ['articulation'], contexte: false }, { role: 'pied', requete: 'pied restitution energie', obligatoire: true, familles: ['pied_prothetique'], contexte: true }, { role: 'manchon / gaine de suspension', requete: 'manchon silicone', obligatoire: false, familles: ['manchon'], contexte: false }, { role: 'prestation de suivi', requete: 'prestation annuelle suivi readaptation', obligatoire: false, contexte: false }] },
  { id: 'prothese_ms', nom: 'prothèse de membre supérieur', membre: 'membre_superieur', mots: ['prothese de bras', 'prothese d avant bras', 'prothese myoelectrique', 'prothese membre superieur', 'main myoelectrique', 'prothese de main', 'prothese de coude'], questions: ['cote', 'age', 'niveau_ms', 'type_ms'],
    composants: [{ role: 'prothèse (appareil de base)', requete: 'prothese myoelectrique', obligatoire: true, familles: ['prothese_membre_superieur'], contexte: true }, { role: 'manchon / gaine', requete: 'manchon silicone', obligatoire: false, familles: ['manchon'], contexte: false }, { role: 'électrode / chargeur', requete: 'electrode contacteur chargeur', obligatoire: false, familles: ['main_prothetique'], contexte: false }] },
  { id: 'orthese_mi', nom: 'orthèse de membre inférieur', mots: ['orthese de membre inferieur', 'orthese cruro jambiere', 'orthese jambiere', 'releveur', 'orthese de genou', 'appareil jambier', 'orthese mi', 'attelle jambiere', 'orthese cheville', 'orthese de cheville'], questions: ['cote', 'age', 'mesure', 'type_orthese_mi', 'indication'],
    composants: [{ role: 'orthèse', requete: 'orthese', obligatoire: true, familles: ['orthese_membre_inferieur'], contexte: true }, { role: 'articulation', requete: 'articulation orthese', obligatoire: false, familles: ['articulation'], contexte: false }] },
  { id: 'orthese_ms', nom: 'orthèse / attelle de membre supérieur', mots: ['attelle de main', 'orthese de main', 'orthese de poignet', 'attelle de poignet', 'orthese de doigt', 'attelle de doigt', 'orthese de pouce', 'orthese de coude', 'orthese membre superieur', 'orthese ms'], questions: ['cote', 'age', 'mesure', 'type_orthese_ms', 'indication'],
    composants: [{ role: 'orthèse', requete: 'orthese', obligatoire: true, familles: ['orthese_membre_superieur', 'attelle_main'], contexte: true }] },
  { id: 'corset', nom: 'corset / orthèse du tronc', mots: ['corset', 'lombostat', 'orthese du tronc', 'corset minerve', 'corset siege', 'scoliose', 'orthese rachis'], questions: ['age', 'mesure', 'type_corset', 'indication'],
    composants: [{ role: 'corset (appareil de base)', requete: 'corset', obligatoire: true, familles: ['corset'], contexte: true }, { role: 'minerve / collier cervical (corset-minerve)', requete: 'collier cervical minerve', obligatoire: false, familles: ['minerve'], contexte: false }] },
  { id: 'minerve', nom: 'minerve / collier cervical', mots: ['minerve', 'collier cervical', 'collier'], questions: ['age', 'mesure', 'indication'], composants: [{ role: 'collier / minerve', requete: 'collier cervical', obligatoire: true, familles: ['minerve'], contexte: false }] },
  { id: 'siege', nom: 'siège moulé / matelas sur mesure', mots: ['siege moule', 'siege sur mesure', 'matelas sur mesure', 'coque de siege', 'positionnement', 'siege orthopedique'], questions: ['age', 'indication'], composants: [{ role: 'siège / coque / matelas', requete: 'siege matelas', obligatoire: true, familles: ['siege'], contexte: false }] }
];
const apresSansAccents = t => sansPonctuation(t);
export function reconnaitreFiche(description) {
  const t = ' ' + apresSansAccents(description) + ' '; let meilleure = null, sc = 0;
  for (const f of FICHES) { let s = 0; for (const m of f.mots) if (t.includes(' ' + m + ' ')) s += m.split(' ').length + 1; if (s > sc) { sc = s; meilleure = f; } }
  return meilleure;
}
/* Réponses déjà contenues dans le texte libre + réponses données ensuite. */
export function extraireReponses(fiche, description, reponses = {}) {
  const t = norm(description), out = {}, manquantes = [];
  for (const q of fiche.questions) { const v = reponses[q] != null && reponses[q] !== '' ? reponses[q] : QUESTIONS[q].extraire(t); if (v != null && v !== '') out[q] = v; else manquantes.push({ id: q, texte: QUESTIONS[q].texte, choix: QUESTIONS[q].choix || null }); }
  return { reponses: out, manquantes };
}
const nombre = (x, d = 2) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
const prixLigne = c => (c.tarif != null ? { base: c.tarif, source: 'tarif' } : c.plv != null ? { base: c.plv, source: 'plv' } : { base: null, source: c.tarif_texte ? 'sur_devis' : 'inconnu' });

export function creerDevis(L) {
  const phrasesChapitre = c => (L.reglesDe(c) || []).filter(r => r.type === 'entente_prealable');
  const ligneDe = (c, quantite = 1, role = null, alternatives = []) => { const p = prixLigne(c), r = L.resume(c); return { ...r, quantite, role, base_remboursement: c.tarif != null ? nombre(c.tarif) : null, prix_limite_vente: c.plv != null ? nombre(c.plv) : null, prix_retenu: p.base, source_prix: p.source, total: p.base != null ? nombre(p.base * quantite) : null, a_chiffrer_sur_devis: p.base == null, alternatives, a_confirmer: true }; };

  function proposerDevis(description, reponsesDonnees = {}) {
    const d = String(description || '').trim(); if (!d) return { ok: false, etape: 'description', raison: 'Décris l’appareillage : par exemple « prothèse tibiale droite adulte avec manchon silicone et pied à restitution d’énergie ».' };
    const fiche = reconnaitreFiche(d + ' ' + Object.values(reponsesDonnees).join(' '));
    if (!fiche) return { ok: false, etape: 'appareil', raison: 'Je ne reconnais pas l’appareil. Dis-moi s’il s’agit d’une prothèse (jambe, cuisse, bras…), d’une orthèse (membre inférieur, main, tronc), d’un corset, d’une minerve ou d’un siège.', exemples: FICHES.map(f => f.nom) };
    const { reponses, manquantes } = extraireReponses(fiche, d + ' ' + Object.values(reponsesDonnees).filter(x => typeof x === 'string').join(' '), reponsesDonnees);
    const info = { fiche: fiche.id, appareil: fiche.nom, deja_compris: reponses };
    if (manquantes.length) return { ok: true, etape: 'questions', ...info, questions: manquantes, message: 'Il me manque ' + manquantes.length + ' information' + (manquantes.length > 1 ? 's' : '') + ' : ' + manquantes.map(q => q.texte).join(' ') };
    // lignes
    const lignes = [], alertes = [], oublis = [], contexte = [reponses.age === 'enfant' ? 'enfant' : reponses.age === 'adulte' ? 'adulte' : '', reponses.niveau_ms || '', reponses.type_ms || '', reponses.type_orthese_mi || '', reponses.type_orthese_ms || '', reponses.type_corset || '', reponses.classe_pied ? 'classe ' + reponses.classe_pied : ''].filter(Boolean).join(' ');
    const inactifsRencontres = [];
    for (const comp of fiche.composants) {
      const opts = { limite: comp.refPrefixe ? 40 : 6, ...(comp.familles ? { familles: comp.familles } : {}), ...(fiche.membre ? { membre: fiche.membre } : {}) };
      let r = L.chercher(comp.requete + (comp.contexte === false ? '' : ' ' + contexte), opts);
      if (comp.refPrefixe) {                                                       // appareil de base reconnu par sa référence (PI, PS, OI…) : seules les lignes de cette série comptent
        const tous = L.chercher(comp.requete, { limite: 60, inclureInactifs: true }); const garde = x => x.reference && x.reference.startsWith(comp.refPrefixe);
        r = { ...r, resultats: r.resultats.filter(garde).slice(0, 3), inactifs_proches: (tous.resultats || []).filter(x => garde(x) && !x.actif).slice(0, 3) };
      }
      if (fiche.exclure) r = { ...r, resultats: r.resultats.filter(x => !new RegExp(fiche.exclure).test(norm(x.designation || ''))) };
      r = { ...r, resultats: r.resultats.slice(0, 3) };
      if (r.resultats.length) { const [premier, ...autres] = r.resultats; lignes.push(ligneDe(L.parCode.get(premier.code), 1, comp.role, autres.map(a => ({ code: a.code, designation: a.designation, tarif: a.tarif, plv: a.plv })))); }
      else { (comp.obligatoire ? oublis : []).push({ role: comp.role, raison: 'Aucune ligne active trouvée dans la nomenclature pour « ' + comp.role + ' »' + ((r.inactifs_proches || []).length ? ' ; des lignes proches existent mais ne sont plus remboursables : ' + r.inactifs_proches.map(x => x.code + ' (fin ' + x.fin_prise_en_charge + ')').join(', ') : '') + '.' }); for (const i of r.inactifs_proches || []) inactifsRencontres.push(i); }
    }
    // cumuls entre lignes
    const codesPropos = lignes.map(l => l.code), cum = codesPropos.length >= 2 ? L.verifierCumul(codesPropos) : null;
    if (cum && cum.ok) for (const p of cum.paires) if (['interdit_cite', 'regle_citee', 'regle_generale'].includes(p.statut) || p.alertes.length) alertes.push({ genre: 'cumul', texte: p.a.code + ' + ' + p.b.code + ' : ' + ({ interdit_cite: 'le texte indique que ces deux lignes ne se cumulent pas', regle_citee: 'une règle de cumul est citée', regle_generale: 'une règle générale de cumul existe dans la section', autorise_cite: 'le texte autorise l’association', aucune_regle: 'aucune règle écrite' }[p.statut]) + (p.phrases[0] ? ' : « ' + p.phrases[0].phrase + ' »' : '') + (p.alertes.length ? ' ' + p.alertes.join(' ') : ''), codes: [p.a.code, p.b.code] });
    // accord préalable et justificatifs
    const entente = [], vu = new Set(); for (const l of lignes) for (const r of phrasesChapitre(L.parCode.get(l.code))) if (!vu.has(r.phrase)) { vu.add(r.phrase); entente.push({ code: l.code, phrase: r.phrase, source: r.source }); }
    const justificatifs = []; if (fiche.questions.includes('indication')) justificatifs.push('Prescription médicale mentionnant l’indication (' + (reponses.indication || 'à préciser') + ').');
    if (entente.length) justificatifs.push('Demande d’accord préalable à joindre (formulaire S3604d d’après les dispositions générales du chapitre 7 : à vérifier dans la version en vigueur).');
    const total = lignes.reduce((a, l) => a + (l.total || 0), 0), aChiffrer = lignes.filter(l => l.a_chiffrer_sur_devis).map(l => l.code);
    const garanties = []; for (const l of lignes) for (const r of L.reglesDe(L.parCode.get(l.code)).filter(x => x.type === 'garantie' || x.type === 'renouvellement').slice(0, 2)) garanties.push({ code: l.code, type: r.type, phrase: r.phrase, source: r.source });
    for (const o of oublis) alertes.push({ genre: 'oubli', texte: 'Pièce possiblement oubliée : ' + o.role + '. ' + o.raison });
    if (lignes.some(l => !l.actif)) alertes.push({ genre: 'inactif', texte: 'Une ligne proposée n’est plus remboursable.' });
    if (aChiffrer.length) alertes.push({ genre: 'sur_devis', texte: 'À chiffrer sur devis (prix non lisible ou « sur devis » dans la nomenclature) : ' + aChiffrer.join(', ') + '.' });
    return { ok: true, etape: 'devis', ...info, lignes, totaux: { base_remboursement_estimee: nombre(total), lignes_a_chiffrer: aChiffrer, devise: 'EUR' }, alertes, entente_prealable: entente, justificatifs, garanties_et_renouvellement: garanties.slice(0, 6), inactifs_proches: inactifsRencontres.slice(0, 5),
      avertissement: 'Proposition à CONFIRMER ligne par ligne dans le texte officiel (les titres de rubrique, les indications qui précèdent chaque appareil et les adjonctions possibles n’ont pas tous été lus par la machine). ' + A_VERIFIER, version: L.meta.version, date_version: L.meta.date_version };
  }

  /* verifier_devis : lignes = [{ code, quantite?, prix? }] */
  function verifierDevis(lignesDevis, { description = '' } = {}) {
    if (!Array.isArray(lignesDevis) || !lignesDevis.length) return { ok: false, raison: 'Donne-moi les lignes du devis : au moins un code (7 chiffres), avec la quantité et le prix si tu les as.' };
    const resultats = [], alertes = [], vus = new Map(); let total = 0, sommePrix = 0;
    for (const l of lignesDevis) {
      const code = String(l.code || '').match(/\d{7}/); const q = Number(l.quantite) > 0 ? Number(l.quantite) : 1;
      const c = code ? L.parCode.get(code[0]) : ((L.parRef.get(norm(l.code || '').replace(/[^a-z0-9]/g, '')) || [])[0] || null);
      if (!c) { resultats.push({ code: l.code, ok: false, problemes: ['Code inconnu dans le Titre II de la LPP (' + (L.meta.version || '') + ') : je ne le devine pas.'] }); continue; }
      const pb = [], infos = [], p = prixLigne(c);
      if (vus.has(c.code)) pb.push('Code déjà présent dans le devis (ligne ' + vus.get(c.code) + ') : regrouper avec la quantité.'); vus.set(c.code, resultats.length + 1);
      if (!L.actif(c)) pb.push('Prise en charge terminée le ' + c.fin_prise_en_charge + ' : ce code n’est plus remboursable.');
      if (q > 1 && c.type === 'appareil') pb.push('Quantité ' + q + ' pour un appareil : vérifie la règle de renouvellement / de nombre par côté.');
      const prix = l.prix != null && l.prix !== '' ? Number(String(l.prix).replace(',', '.')) : null;
      if (prix != null && Number.isFinite(prix)) {
        sommePrix += prix * q;
        if (c.plv != null && prix > c.plv + 0.005) pb.push('Prix ' + formatEuro(prix) + ' supérieur au prix limite de vente ' + formatEuro(c.plv) + ' : dépassement, non facturable en l’état.');
        else if (c.tarif != null && c.plv == null && prix > c.tarif + 0.005) infos.push('Prix ' + formatEuro(prix) + ' supérieur au tarif de remboursement ' + formatEuro(c.tarif) + ' : le reste est à la charge du patient (pas de prix limite lu).');
        if (c.tarif != null && prix < c.tarif - 0.005 && c.plv == null) infos.push('Prix inférieur au tarif : la base de remboursement reste ' + formatEuro(c.tarif) + '.');
      } else if (p.base == null) infos.push('Prix « ' + (c.tarif_texte || 'non lisible') + ' » : à chiffrer sur devis.');
      if (p.base != null) total += p.base * q;
      const regles = L.reglesDe(c); if (regles.some(r => r.type === 'entente_prealable')) infos.push('Accord / entente préalable mentionné dans les textes qui s’appliquent.');
      resultats.push({ ...L.resume(c), quantite: q, prix_propose: prix, ok: pb.length === 0, problemes: pb, informations: infos });
    }
    const connus = resultats.filter(r => r.code && r.designation !== undefined && r.reference_texte), codesOk = connus.map(r => r.code);
    const cum = codesOk.length >= 2 ? L.verifierCumul(codesOk) : null;
    if (cum && cum.ok) for (const pa of cum.paires) if (['interdit_cite', 'regle_citee'].includes(pa.statut)) alertes.push({ genre: 'cumul', texte: pa.a.code + ' + ' + pa.b.code + ' : ' + (pa.phrases[0] ? '« ' + pa.phrases[0].phrase + ' »' : 'règle de cumul citée') + ' (' + (pa.phrases[0] ? pa.phrases[0].source : '') + ')', codes: [pa.a.code, pa.b.code] }); else for (const a of pa.alertes) alertes.push({ genre: 'structure', texte: pa.a.code + ' + ' + pa.b.code + ' : ' + a, codes: [pa.a.code, pa.b.code] });
    // oublis et incohérences d'après la fiche reconnue (description ou lignes)
    const fiche = reconnaitreFiche(description + ' ' + connus.map(r => r.designation).join(' ')) || null;
    if (fiche) for (const comp of fiche.composants.filter(x => x.obligatoire)) { const mots = jetonsRole(comp.requete); const present = connus.some(r => mots.some(m => norm((r.designation || '') + ' ' + (r.rubrique || '')).includes(m))); if (!present) alertes.push({ genre: 'oubli', texte: 'Pièce attendue pour une ' + fiche.nom + ' et absente du devis : ' + comp.role + '.' }); }
    const membres = new Set(connus.map(r => L.parCode.get(r.code).membre).filter(Boolean)); if (membres.size > 1 && !membres.has('tronc')) alertes.push({ genre: 'incoherence', texte: 'Le devis mélange des lignes de membre supérieur et de membre inférieur : vérifie qu’elles concernent bien le même patient et le même appareil.' });
    const ages = new Set(connus.map(r => /\benfants?\b/i.test(r.designation || '') ? 'enfant' : /\badultes?\b/i.test(r.designation || '') ? 'adulte' : null).filter(Boolean)); if (ages.size > 1) alertes.push({ genre: 'incoherence', texte: 'Le devis mélange des lignes « enfant » et « adulte ».' });
    const problemes = resultats.filter(r => !r.ok).length + alertes.filter(a => a.genre !== 'structure').length;
    return { ok: true, version: L.meta.version, date_version: L.meta.date_version, lignes: resultats, alertes, totaux: { base_remboursement_estimee: nombre(total), somme_des_prix_proposes: nombre(sommePrix) }, verdict: problemes ? problemes + ' point(s) à corriger ou à vérifier' : 'aucun problème trouvé par les règles que je sais lire', rappel: A_VERIFIER + ' « Aucun problème » ne remplace pas ta relecture : je ne lis pas toutes les conditions.' };
  }
  const jetonsRole = r => sansPonctuation(r).split(' ').filter(x => x.length > 3).slice(0, 2);
  return { proposerDevis, verifierDevis, fiches: FICHES, reconnaitreFiche };
}
