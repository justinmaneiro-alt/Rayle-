/* LPPR (Titre II, orthèses et prothèses externes) : recherche, explication, cumul, aide au devis. PUR : aucune dépendance au navigateur, testé sous Node.
   Les données viennent de data/lppr/lppr_titre2.json (extrait du PDF officiel de l'Assurance Maladie par planetes/neptune/outils/lppr-extraire.py).
   Règle : Raylé ne fabrique JAMAIS un code ni un tarif. Si elle ne trouve pas, elle le dit. Toute réponse porte « à vérifier avec la version en vigueur ». */

export const A_VERIFIER = 'À vérifier avec la version en vigueur de la LPP (ameli.fr, Légifrance) : cet index ne remplace pas la nomenclature officielle.';

const sansAccent = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MOTS_VIDES = new Set(('le la les un une des du de d l au aux et ou en pour avec sans sur sous par dans a est il elle je tu nous vous on que qui quoi ce cet cette ces mon ma mes son sa ses se ne pas plus moins tres ' +
  'code codes lppr lpp cherche chercher trouve trouver donne donner moi dis dit quel quels quelle quelles faut falloir devis appareillage appareil patient besoin voudrais veux raylé rayle').split(' '));

/* Équivalences d'atelier → mots de la nomenclature (la nomenclature dit « jambe », « cuisse », « désarticulation »…). Chaque ligne = un concept, chaque terme est cherché. */
const SYNONYMES = [
  [['transtibial', 'transtibiale', 'sous le genou', 'tibial', 'tibiale'], ['jambe', 'tibia', 'tibial']],
  [['transfemoral', 'transfemorale', 'au dessus du genou', 'femoral', 'femorale'], ['cuisse', 'femur', 'femoral']],
  [['pied carbone', 'pied a restitution', 'pied energie', 'restitution d energie'], ['restitution', 'energie', 'pied']],
  [['emboiture', 'emboitures'], ['emboiture']],
  [['manchon', 'liner', 'gel'], ['manchon']],
  [['semelle', 'semelles', 'orthese plantaire'], ['semelle', 'orthese plantaire', 'podo']],
  [['chaussure orthopedique', 'chaussures orthopediques', 'chaussures sur mesure'], ['chaussure']],
  [['attelle', 'orthese genou', 'genouillere'], ['genou', 'orthese']],
  [['corset', 'lombostat', 'orthese rachis', 'scoliose'], ['corset', 'rachis', 'lombaire', 'scoliose']],
  [['orthese cheville', 'releveur', 'botte', 'jambier'], ['cheville', 'jambier', 'releveur']],
  [['main', 'myoelectrique', 'bras'], ['membre superieur', 'main', 'myoelectrique']],
  [['reparation', 'reparations'], ['reparation']],
  [['bandage herniaire', 'hernie'], ['hernie', 'bandage']],
  [['lunettes', 'verre', 'verres'], ['optique', 'verre']],
];

export function jetons(texte) {
  return sansAccent(texte).replace(/[^a-z0-9+\-.,]+/g, ' ').split(/\s+/).map(t => t.replace(/^[-.,]+|[-.,]+$/g, '')).filter(t => t.length >= 2 && !MOTS_VIDES.has(t));
}

export function creerIndex(donnees) {
  if (!donnees || !Array.isArray(donnees.codes)) return { ok: false, raison: 'Le fichier de la LPPR (data/lppr/lppr_titre2.json) est absent ou illisible.' };
  const codes = donnees.codes.map(e => ({ ...e, _txt: sansAccent([e.intitule, e.texte, e.chapitre_titre].join(' ')), _int: sansAccent(e.intitule) }));
  const parCode = new Map(codes.map(e => [e.code, e]));
  return { ok: true, meta: donnees.meta || {}, codes, parCode };
}

export const formatEuro = v => (typeof v === 'number' ? v.toFixed(2).replace('.', ',') + ' €' : (v == null ? 'non lu dans la nomenclature' : String(v)));

const COLONNES = e => e.lecture_colonnes === 'estimee' ? ' (colonnes estimées : à vérifier dans le PDF)' : '';
export function reference(e, meta) { return 'Titre II, chapitre ' + e.chapitre + ' (' + e.chapitre_titre + '), page ' + e.page_pdf + ' du PDF ' + (meta && meta.version ? '« ' + meta.version + ' »' : ''); }

/* Recherche : un code à 7 chiffres, une référence alphanumérique (B36N, AI4Z01…), ou des mots-clés. Tous les mots doivent se retrouver ; sinon on classe par nombre de mots trouvés (et on le dit). */
export function chercher(index, requete, { max = 10, chapitre = null } = {}) {
  if (!index || !index.ok) return { ok: false, raison: (index && index.raison) || 'Index LPPR indisponible.', resultats: [] };
  const q = String(requete || '').trim();
  if (!q) return { ok: false, raison: 'Dis-moi un code ou quelques mots (par exemple « emboîture tibiale »).', resultats: [] };
  const m7 = q.match(/\b\d{7}\b/);
  if (m7) { const e = index.parCode.get(m7[0]); return e ? { ok: true, mode: 'code', resultats: [e], total: 1 } : { ok: true, mode: 'code', resultats: [], total: 0, raison: 'Le code ' + m7[0] + ' n’existe pas dans le Titre II de cet index. Je n’invente pas de code.' }; }
  const ref = q.replace(/\s+/g, '').toUpperCase();
  if (/^[A-Z]{1,3}\d[A-Z0-9]{1,6}$/.test(ref)) {
    const r = index.codes.filter(e => sansAccent(e.intitule).split(/[^a-z0-9]+/).includes(ref.toLowerCase()) || new RegExp('(^|[^A-Za-z0-9])' + ref + '([^A-Za-z0-9]|$)', 'i').test(e.intitule));
    if (r.length) return { ok: true, mode: 'reference', resultats: r.slice(0, max), total: r.length };
  }
  let toks = jetons(q); if (!toks.length) return { ok: false, raison: 'Je n’ai retenu aucun mot utile dans « ' + q + ' ».', resultats: [] };
  // élargissement par équivalences d'atelier
  const extra = new Set();
  for (const [dits, noms] of SYNONYMES) if (dits.some(d => sansAccent(q).includes(d))) noms.forEach(n => extra.add(n));
  let pool = chapitre ? index.codes.filter(e => e.chapitre === String(chapitre)) : index.codes;
  const score = e => { let s = 0, trouves = 0; for (const t of toks) if (e._txt.includes(t)) { trouves++; s += e._int.includes(t) ? 3 : 1; } for (const x of extra) if (e._int.includes(sansAccent(x))) s += 1; return { s, trouves }; };
  const notes = pool.map(e => ({ e, ...score(e) })).filter(x => x.trouves > 0);
  const tous = notes.filter(x => x.trouves === toks.length);
  const liste = (tous.length ? tous : notes).sort((a, b) => b.trouves - a.trouves || b.s - a.s || a.e.code.localeCompare(b.e.code));
  return { ok: true, mode: tous.length ? 'mots' : 'mots-partiels', resultats: liste.slice(0, max).map(x => x.e), total: liste.length, mots: toks,
    raison: liste.length ? (tous.length ? null : 'Aucun article ne contient tous les mots ; voici ceux qui en contiennent le plus.') : 'Je ne trouve rien pour « ' + q + ' » dans le Titre II. Je n’invente pas de code : reformule ou cherche dans le PDF officiel.' };
}

/* Phrases de conditions utiles (renouvellement, garantie, cumul, prescription, accord préalable). Extraites TELLES QUELLES du texte de la nomenclature. */
const RE_REGLE = /(cumul|associ|simultan|en m[eê]me temps|ne peut|ne peuvent|ne sont pas pris|n[’']est pas pris|exclu|renouvel|garantie|dur[ée]e|par an|tous les|accord pr[ée]alable|prescription|limite de|[àa] partir de|seulement|uniquement|sous r[ée]serve)/i;
export function reglesDuTexte(e) {
  const brut = (e.texte || '').replace(/\n/g, ' ');
  return brut.split(/(?<=[.;:])\s+/).map(s => s.trim()).filter(s => s.length > 12 && RE_REGLE.test(s));
}
export function codesCites(e) { return [...new Set(((e.intitule + ' ' + e.texte).match(/\b\d{7}\b/g) || []).filter(c => c !== e.code))]; }

export function expliquer(index, code) {
  if (!index || !index.ok) return { ok: false, raison: (index && index.raison) || 'Index LPPR indisponible.' };
  const c = String(code || '').match(/\d{7}/); if (!c) return { ok: false, raison: 'Il me faut un code à 7 chiffres.' };
  const e = index.parCode.get(c[0]);
  if (!e) return { ok: false, raison: 'Le code ' + c[0] + ' n’existe pas dans le Titre II de cet index. Je n’invente pas de code.' };
  const regles = reglesDuTexte(e);
  return { ok: true, e, regles, cites: codesCites(e).map(x => ({ code: x, connu: index.parCode.has(x), intitule: index.parCode.has(x) ? index.parCode.get(x).intitule : null })), reference: reference(e, index.meta) };
}

/* Cumul : on ne déduit RIEN qui ne soit écrit. Résultat : « interdit / mentionné » avec la phrase source, ou « aucune règle trouvée dans ces deux articles » (≠ autorisé). */
export function verifierCumul(index, a, b) {
  if (!index || !index.ok) return { ok: false, raison: (index && index.raison) || 'Index LPPR indisponible.' };
  const A = index.parCode.get(String(a || '').trim()), B = index.parCode.get(String(b || '').trim());
  if (!A || !B) return { ok: false, raison: 'Code inconnu : ' + [!A ? a : null, !B ? b : null].filter(Boolean).join(' et ') + '. Je n’invente pas de code.' };
  if (A.code === B.code) return { ok: true, verdict: 'meme_code', phrases: [], raison: 'C’est le même code : un seul exemplaire par facturation sauf mention contraire (' + (reglesDuTexte(A)[0] || 'aucune règle de quantité lue') + ').' };
  const mentions = [];
  for (const [x, y] of [[A, B], [B, A]]) {
    const brut = (x.intitule + '. ' + x.texte).replace(/\n/g, ' ');
    for (const ph of brut.split(/(?<=[.;:])\s+/)) if (ph.includes(y.code) && ph.length > 12) mentions.push({ de: x.code, phrase: ph.trim() });
  }
  const regles = [...reglesDuTexte(A).filter(p => /cumul|associ|simultan|m[eê]me temps|exclu/i.test(p)).map(p => ({ de: A.code, phrase: p })), ...reglesDuTexte(B).filter(p => /cumul|associ|simultan|m[eê]me temps|exclu/i.test(p)).map(p => ({ de: B.code, phrase: p }))];
  const verdict = mentions.length ? 'mentionne' : regles.length ? 'regle_generale' : 'aucune_regle';
  return { ok: true, verdict, mentions, regles, A, B,
    raison: verdict === 'aucune_regle' ? 'Aucune règle d’association ni de non-cumul n’est écrite dans le texte de ces deux articles. Cela ne prouve pas que le cumul est autorisé : les règles générales du chapitre et le service médical décident.' : null };
}

/* Aide au devis : description en langage naturel → propositions à VALIDER. Plusieurs requêtes (une par segment de phrase), au plus 6 articles chacune. */
export function aideDevis(index, description, { parGroupe = 6 } = {}) {
  if (!index || !index.ok) return { ok: false, raison: (index && index.raison) || 'Index LPPR indisponible.', groupes: [] };
  const seg = String(description || '').split(/[,;]| et | puis | avec |\+/i).map(s => s.trim()).filter(s => jetons(s).length);
  if (!seg.length) return { ok: false, raison: 'Décris l’appareillage (par exemple « prothèse tibiale avec manchon et pied à restitution d’énergie »).', groupes: [] };
  const groupes = seg.map(s => { const r = chercher(index, s, { max: parGroupe }); return { demande: s, resultats: r.resultats || [], mode: r.mode, raison: r.raison || null }; });
  return { ok: true, groupes, avertissement: 'Ce sont des PROPOSITIONS à valider avec la prescription et la nomenclature : un article proposé n’est pas forcément facturable pour ce patient. ' + A_VERIFIER };
}

/* Phrases à dire (Raylé parle : pas de markdown, phrases courtes). */
export function dire(index, r, type) {
  if (!r.ok) return r.raison;
  const m = index.meta || {};
  const fin = ' ' + A_VERIFIER + (m.version ? ' Source : LPP, ' + m.version + '.' : '');
  const un = e => 'Code ' + e.code + ' : ' + e.intitule.replace(/\s+/g, ' ') + '. Tarif ' + formatEuro(e.tarif) + (e.plv != null ? ', prix limite de vente ' + formatEuro(e.plv) : '') + (e.fin_prise_en_charge ? ', fin de prise en charge ' + e.fin_prise_en_charge : '') + '.';
  if (type === 'chercher') {
    if (!r.resultats.length) return (r.raison || 'Rien trouvé.') + fin;
    const premiers = r.resultats.slice(0, 3).map(un).join(' ');
    return (r.raison ? r.raison + ' ' : '') + 'J’ai ' + r.total + ' résultat' + (r.total > 1 ? 's' : '') + '. ' + premiers + (r.total > 3 ? ' Les autres sont dans la fenêtre LPPR.' : '') + fin;
  }
  if (type === 'expliquer') return un(r.e) + ' ' + r.reference + '.' + (r.regles.length ? ' Conditions lues : ' + r.regles.slice(0, 3).join(' ') : ' Aucune condition particulière n’est écrite dans cet article.') + fin;
  if (type === 'cumul') {
    if (r.verdict === 'mentionne') return 'Le texte mentionne les deux codes : « ' + r.mentions[0].phrase + ' » (article ' + r.mentions[0].de + ').' + fin;
    if (r.verdict === 'regle_generale') return 'Pas de mention croisée, mais une règle d’association existe : « ' + r.regles[0].phrase + ' » (article ' + r.regles[0].de + ').' + fin;
    return r.raison + fin;
  }
  if (type === 'devis') return r.groupes.map(g => 'Pour « ' + g.demande + ' » : ' + (g.resultats.length ? g.resultats.slice(0, 2).map(e => e.code + ' ' + e.intitule.replace(/\s+/g, ' ').slice(0, 90) + ' (' + formatEuro(e.tarif) + ')').join(' ; ') : 'rien trouvé')).join('. ') + '. ' + r.avertissement;
  return fin;
}

/* Détection vocale : « code LPPR de l'emboîture tibiale », « explique le code 2174738 », « peut-on cumuler 2174738 et 2167193 », « fais un devis : prothèse tibiale avec manchon ». null si ce n'est pas une demande LPPR. */
export function detecterVoix(n) {
  const t = sansAccent(n).replace(/['’\-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/\b(?:ouvre|affiche|montre)\b.*\b(?:lppr?|nomenclature)\b/.test(t) && !/\d{7}/.test(t)) return { type: 'fenetre' };
  if (!/\b(?:lppr?|nomenclature|code lpp|devis|cumul\w*)\b/.test(t) && !/\b\d{7}\b/.test(t)) return null;
  const codes = t.match(/\b\d{7}\b/g) || [];
  if (/\bcumul\w*|\bassoci\w*\b|en meme temps|ensemble\b/.test(t) && codes.length >= 2) return { type: 'cumul', a: codes[0], b: codes[1] };
  if (/\b(?:explique|detail\w*|c est quoi|que dit|conditions?)\b/.test(t) && codes.length === 1) return { type: 'expliquer', code: codes[0] };
  if (/\bdevis\b/.test(t)) return { type: 'devis', texte: t.replace(/^.*?\bdevis\b\s*(?:pour|de|d|:)?\s*/, '') };
  if (codes.length === 1 && /\b(?:lppr?|code)\b/.test(t)) return { type: 'expliquer', code: codes[0] };
  if (/\blppr?\b|\bnomenclature\b/.test(t)) { const q = t.replace(/\b(?:ouvre|affiche|montre|cherche|trouve|donne|dis|quel|est|le|la|les|des|du|de|d|l|code|codes|lppr|lpp|nomenclature|moi|pour|sur|dans|a|un|une)\b/g, ' ').replace(/\s+/g, ' ').trim(); return q ? { type: 'chercher', q } : { type: 'fenetre' }; }
  return null;
}
